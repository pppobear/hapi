import { MessagePrimitive, useAssistantState } from '@assistant-ui/react'
import { MarkdownText } from '@/components/assistant-ui/markdown-text'
import { Reasoning, ReasoningGroup } from '@/components/assistant-ui/reasoning'
import { HappyToolMessage } from '@/components/AssistantChat/messages/ToolMessage'
import { useHappyChatContext } from '@/components/AssistantChat/context'
import { CliOutputBlock } from '@/components/CliOutputBlock'
import { CopyIcon, CheckIcon, ForkIcon } from '@/components/icons'
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard'
import type { HappyChatMessageMetadata } from '@/lib/assistant-runtime'
import { getAssistantCopyText } from '@/components/AssistantChat/messages/assistantCopyText'
import { getConversationMessageAnchorId } from '@/chat/outline'

const TOOL_COMPONENTS = {
    Fallback: HappyToolMessage
} as const

const MESSAGE_PART_COMPONENTS = {
    Text: MarkdownText,
    Reasoning: Reasoning,
    ReasoningGroup: ReasoningGroup,
    tools: TOOL_COMPONENTS
} as const

export function HappyAssistantMessage() {
    const ctx = useHappyChatContext()
    const { copied, copy } = useCopyToClipboard()
    const messageId = useAssistantState(({ message }) => message.id)
    const isCliOutput = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'cli-output'
    })
    const cliText = useAssistantState(({ message }) => {
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        if (custom?.kind !== 'cli-output') return ''
        return message.content.find((part) => part.type === 'text')?.text ?? ''
    })
    const toolOnly = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return false
        const parts = message.content
        return parts.length > 0 && parts.every((part) => part.type === 'tool-call')
    })
    const copyText = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return ''
        return getAssistantCopyText(message.content)
    })
    const seq = useAssistantState(({ message }) => {
        if (message.role !== 'assistant') return null
        const custom = message.metadata.custom as Partial<HappyChatMessageMetadata> | undefined
        return custom?.kind === 'assistant' && typeof custom.seq === 'number' ? custom.seq : null
    })
    const canFork = typeof seq === 'number' && Boolean(ctx.onForkBeforeMessage)
    const rootClass = toolOnly
        ? 'py-1 min-w-0 max-w-full overflow-x-hidden'
        : 'px-1 min-w-0 max-w-full overflow-x-hidden'

    if (isCliOutput) {
        return (
            <MessagePrimitive.Root
                id={getConversationMessageAnchorId(messageId)}
                className="scroll-mt-4 px-1 min-w-0 max-w-full overflow-x-hidden"
            >
                <CliOutputBlock text={cliText} />
            </MessagePrimitive.Root>
        )
    }

    return (
        <MessagePrimitive.Root
            id={getConversationMessageAnchorId(messageId)}
            className={`${rootClass} ${(copyText || canFork) ? 'group/msg' : ''} scroll-mt-4`}
        >
            <div className="min-w-0">
                <MessagePrimitive.Content components={MESSAGE_PART_COMPONENTS} />
            </div>
            {(copyText || canFork) && (
                <div className="flex justify-end gap-1 mt-2 opacity-80 group-hover/msg:opacity-100 transition-opacity">
                    {copyText && (
                        <button
                            type="button"
                            title="Copy"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--app-subtle-bg)] active:bg-[var(--app-subtle-bg)] transition-colors"
                            onClick={() => copy(copyText)}
                        >
                            {copied
                                ? <CheckIcon className="h-4 w-4 text-green-500" />
                                : <CopyIcon className="h-4 w-4 text-[var(--app-hint)]" />}
                        </button>
                    )}
                    {canFork && (
                        <button
                            type="button"
                            title="Fork from this response"
                            aria-label="Fork from this response"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-[var(--app-subtle-bg)] active:bg-[var(--app-subtle-bg)] transition-colors"
                            onClick={() => ctx.onForkBeforeMessage!(seq)}
                        >
                            <ForkIcon className="h-4 w-4 text-[var(--app-hint)]" />
                        </button>
                    )}
                </div>
            )}
        </MessagePrimitive.Root>
    )
}
