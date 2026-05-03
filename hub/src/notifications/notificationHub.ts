import type { Session, SyncEngine, SyncEvent } from '../sync/syncEngine'
import type { SessionEndReason } from '@hapi/protocol'
import type { NotificationChannel, NotificationHubOptions, TaskNotification } from './notificationTypes'
import { extractMessageEventType, extractTaskNotification } from './eventParsing'

type PendingForkReadySuppression = {
    sourceSessionId: string
    namespace?: string
    path: string
    targetMachineId: string
    expiresAt: number
}

export class NotificationHub {
    private readonly channels: NotificationChannel[]
    private readonly readyCooldownMs: number
    private readonly permissionDebounceMs: number
    private readonly lastKnownRequests: Map<string, Set<string>> = new Map()
    private readonly notificationDebounce: Map<string, NodeJS.Timeout> = new Map()
    private readonly lastReadyNotificationAt: Map<string, number> = new Map()
    private readonly suppressReadyUntil: Map<string, number> = new Map()
    private readonly forkedBootstrapReadySessions: Set<string> = new Set()
    private readonly pendingForkReadySuppressions: PendingForkReadySuppression[] = []
    private unsubscribeSyncEvents: (() => void) | null = null

    constructor(
        private readonly syncEngine: SyncEngine,
        channels: NotificationChannel[],
        options?: NotificationHubOptions
    ) {
        this.channels = channels
        this.readyCooldownMs = options?.readyCooldownMs ?? 5000
        this.permissionDebounceMs = options?.permissionDebounceMs ?? 500
        this.unsubscribeSyncEvents = this.syncEngine.subscribe((event) => {
            this.handleSyncEvent(event)
        })
    }

    stop(): void {
        if (this.unsubscribeSyncEvents) {
            this.unsubscribeSyncEvents()
            this.unsubscribeSyncEvents = null
        }

        for (const timer of this.notificationDebounce.values()) {
            clearTimeout(timer)
        }
        this.notificationDebounce.clear()
        this.lastKnownRequests.clear()
        this.lastReadyNotificationAt.clear()
        this.suppressReadyUntil.clear()
        this.forkedBootstrapReadySessions.clear()
        this.pendingForkReadySuppressions.length = 0
    }

    private handleSyncEvent(event: SyncEvent): void {
        if ((event.type === 'session-updated' || event.type === 'session-added') && event.sessionId) {
            const session = this.syncEngine.getSession(event.sessionId)
            if (!session || !session.active) {
                this.clearSessionState(event.sessionId)
                return
            }
            this.checkForPermissionNotification(session)
            return
        }

        if (event.type === 'session-removed' && event.sessionId) {
            this.clearSessionState(event.sessionId)
            return
        }

        if (event.type === 'session-fork-started') {
            this.pendingForkReadySuppressions.push({
                sourceSessionId: event.sessionId,
                namespace: event.namespace,
                path: event.path,
                targetMachineId: event.targetMachineId,
                expiresAt: Date.now() + Math.max(this.readyCooldownMs, 30_000)
            })
            return
        }

        if (event.type === 'session-forked') {
            this.suppressReadyUntil.set(event.sessionId, Date.now() + this.readyCooldownMs)
            this.forkedBootstrapReadySessions.add(event.sessionId)
            return
        }

        if (event.type === 'session-ended' && event.sessionId) {
            if (event.reason === 'completed') {
                this.sendSessionCompletion(event.sessionId, event.reason).catch((error) => {
                    console.error('[NotificationHub] Failed to send session completion notification:', error)
                })
            }
            return
        }

        if (event.type === 'message-received' && event.sessionId) {
            const eventType = extractMessageEventType(event)
            if (eventType === 'ready') {
                if (this.shouldSuppressForkedBootstrapReady(event.sessionId)) {
                    return
                }
                this.sendReadyNotification(event.sessionId).catch((error) => {
                    console.error('[NotificationHub] Failed to send ready notification:', error)
                })
            }

            const taskNotification = extractTaskNotification(event)
            if (taskNotification) {
                this.sendTaskNotification(event.sessionId, taskNotification).catch((error) => {
                    console.error('[NotificationHub] Failed to send task notification:', error)
                })
            }
        }
    }

    private clearSessionState(sessionId: string): void {
        const existingTimer = this.notificationDebounce.get(sessionId)
        if (existingTimer) {
            clearTimeout(existingTimer)
            this.notificationDebounce.delete(sessionId)
        }
        this.lastKnownRequests.delete(sessionId)
        this.lastReadyNotificationAt.delete(sessionId)
        this.suppressReadyUntil.delete(sessionId)
        this.forkedBootstrapReadySessions.delete(sessionId)
    }

    private shouldSuppressForkedBootstrapReady(sessionId: string): boolean {
        this.removeExpiredPendingForkReadySuppressions()

        const suppressUntil = this.suppressReadyUntil.get(sessionId) ?? 0
        if (Date.now() < suppressUntil) {
            return true
        }

        if (this.consumePendingForkReadySuppression(sessionId)) {
            return true
        }

        if (!this.forkedBootstrapReadySessions.has(sessionId)) {
            return false
        }

        this.forkedBootstrapReadySessions.delete(sessionId)
        this.suppressReadyUntil.delete(sessionId)
        return true
    }

    private consumePendingForkReadySuppression(sessionId: string): boolean {
        const session = this.syncEngine.getSession(sessionId)
        if (!session) {
            return false
        }

        const metadata = session.metadata
        if (!metadata || typeof metadata.path !== 'string') {
            return false
        }

        const index = this.pendingForkReadySuppressions.findIndex((pending) => {
            if (pending.sourceSessionId === sessionId) {
                return false
            }
            if (pending.namespace && pending.namespace !== session.namespace) {
                return false
            }
            return pending.path === metadata.path && pending.targetMachineId === metadata.machineId
        })

        if (index === -1) {
            return false
        }

        this.pendingForkReadySuppressions.splice(index, 1)
        return true
    }

    private removeExpiredPendingForkReadySuppressions(): void {
        const now = Date.now()
        for (let i = this.pendingForkReadySuppressions.length - 1; i >= 0; i--) {
            const pending = this.pendingForkReadySuppressions[i]
            if (pending && pending.expiresAt <= now) {
                this.pendingForkReadySuppressions.splice(i, 1)
            }
        }
    }

    private getNotifiableSession(sessionId: string): Session | null {
        const session = this.syncEngine.getSession(sessionId)
        if (!session || !session.active) {
            return null
        }
        return session
    }

    private checkForPermissionNotification(session: Session): void {
        const requests = session.agentState?.requests

        if (requests == null) {
            return
        }

        const newRequestIds = new Set(Object.keys(requests))
        const oldRequestIds = this.lastKnownRequests.get(session.id) || new Set()

        let hasNewRequests = false
        for (const requestId of newRequestIds) {
            if (!oldRequestIds.has(requestId)) {
                hasNewRequests = true
                break
            }
        }

        this.lastKnownRequests.set(session.id, newRequestIds)

        if (!hasNewRequests) {
            return
        }

        const existingTimer = this.notificationDebounce.get(session.id)
        if (existingTimer) {
            clearTimeout(existingTimer)
        }

        const timer = setTimeout(() => {
            this.notificationDebounce.delete(session.id)
            this.sendPermissionNotification(session.id).catch((error) => {
                console.error('[NotificationHub] Failed to send permission notification:', error)
            })
        }, this.permissionDebounceMs)

        this.notificationDebounce.set(session.id, timer)
    }

    private async sendPermissionNotification(sessionId: string): Promise<void> {
        const session = this.getNotifiableSession(sessionId)
        if (!session) {
            return
        }

        await this.notifyPermission(session)
    }

    private async sendReadyNotification(sessionId: string): Promise<void> {
        const session = this.getNotifiableSession(sessionId)
        if (!session) {
            return
        }

        const now = Date.now()
        const suppressUntil = this.suppressReadyUntil.get(sessionId) ?? 0
        if (now < suppressUntil) {
            return
        }
        if (suppressUntil > 0) {
            this.suppressReadyUntil.delete(sessionId)
        }

        const last = this.lastReadyNotificationAt.get(sessionId) ?? 0
        if (now - last < this.readyCooldownMs) {
            return
        }
        this.lastReadyNotificationAt.set(sessionId, now)

        await this.notifyReady(session)
    }

    private async sendTaskNotification(sessionId: string, notification: TaskNotification): Promise<void> {
        const session = this.getNotifiableSession(sessionId)
        if (!session) {
            return
        }

        await this.notifyTask(session, notification)
    }

    private async sendSessionCompletion(sessionId: string, reason: SessionEndReason): Promise<void> {
        const session = this.syncEngine.getSession(sessionId)
        if (!session) {
            return
        }

        await this.notifySessionCompletion(session, reason)
    }

    private async notifyReady(session: Session): Promise<void> {
        for (const channel of this.channels) {
            try {
                await channel.sendReady(session)
            } catch (error) {
                console.error('[NotificationHub] Failed to send ready notification:', error)
            }
        }
    }

    private async notifyPermission(session: Session): Promise<void> {
        for (const channel of this.channels) {
            try {
                await channel.sendPermissionRequest(session)
            } catch (error) {
                console.error('[NotificationHub] Failed to send permission notification:', error)
            }
        }
    }

    private async notifyTask(session: Session, notification: TaskNotification): Promise<void> {
        for (const channel of this.channels) {
            try {
                await channel.sendTaskNotification(session, notification)
            } catch (error) {
                console.error('[NotificationHub] Failed to send task notification:', error)
            }
        }
    }

    private async notifySessionCompletion(session: Session, reason: SessionEndReason): Promise<void> {
        for (const channel of this.channels) {
            if (typeof channel.sendSessionCompletion !== 'function') {
                continue
            }
            try {
                await channel.sendSessionCompletion(session, reason)
            } catch (error) {
                console.error('[NotificationHub] Failed to send session completion notification:', error)
            }
        }
    }
}
