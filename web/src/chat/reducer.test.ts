import { describe, expect, it } from 'vitest'
import { reduceChatBlocks } from '@/chat/reducer'
import type { AgentState } from '@/types/api'
import type { NormalizedMessage, ToolCallBlock } from '@/chat/types'

function getToolBlocks(messages: NormalizedMessage[], agentState: AgentState): ToolCallBlock[] {
    return reduceChatBlocks(messages, agentState).blocks.filter(
        (block): block is ToolCallBlock => block.kind === 'tool-call'
    )
}

describe('reduceChatBlocks', () => {
    it('shows pending permission for orphaned sidechain tool calls', () => {
        const messages: NormalizedMessage[] = [
            {
                id: 'task-msg',
                localId: null,
                createdAt: 1000,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'task-1',
                    name: 'Task',
                    input: { prompt: 'Investigate the bug' },
                    description: null,
                    uuid: 'uuid-task',
                    parentUUID: null
                }]
            },
            {
                id: 'sidechain-tool-msg',
                localId: null,
                createdAt: 2000,
                role: 'agent',
                isSidechain: true,
                content: [{
                    type: 'tool-call',
                    id: 'child-1',
                    name: 'Edit',
                    input: { file_path: 'web/src/App.tsx' },
                    description: null,
                    uuid: 'uuid-child',
                    parentUUID: 'missing-sidechain-root'
                }]
            }
        ]

        const agentState: AgentState = {
            requests: {
                'child-1': {
                    tool: 'Edit',
                    arguments: { file_path: 'web/src/App.tsx' },
                    createdAt: 2000
                }
            }
        }

        const blocks = getToolBlocks(messages, agentState)

        expect(blocks.map((block) => block.id)).toEqual(['task-1', 'child-1'])
        expect(blocks[1]?.tool.permission?.status).toBe('pending')
    })

    it('does not duplicate pending permission already rendered inside a task sidechain', () => {
        const messages: NormalizedMessage[] = [
            {
                id: 'task-msg',
                localId: null,
                createdAt: 1000,
                role: 'agent',
                isSidechain: false,
                content: [{
                    type: 'tool-call',
                    id: 'task-1',
                    name: 'Task',
                    input: { prompt: 'Investigate the bug' },
                    description: null,
                    uuid: 'uuid-task',
                    parentUUID: null
                }]
            },
            {
                id: 'sidechain-root-msg',
                localId: null,
                createdAt: 1100,
                role: 'agent',
                isSidechain: true,
                content: [{
                    type: 'sidechain',
                    uuid: 'uuid-sidechain-root',
                    parentUUID: null,
                    prompt: 'Investigate the bug'
                }]
            },
            {
                id: 'sidechain-tool-msg',
                localId: null,
                createdAt: 1200,
                role: 'agent',
                isSidechain: true,
                content: [{
                    type: 'tool-call',
                    id: 'child-1',
                    name: 'Edit',
                    input: { file_path: 'web/src/App.tsx' },
                    description: null,
                    uuid: 'uuid-child',
                    parentUUID: 'uuid-sidechain-root'
                }]
            }
        ]

        const agentState: AgentState = {
            requests: {
                'child-1': {
                    tool: 'Edit',
                    arguments: { file_path: 'web/src/App.tsx' },
                    createdAt: 1200
                }
            }
        }

        const blocks = getToolBlocks(messages, agentState)

        expect(blocks).toHaveLength(1)
        expect(blocks[0]?.id).toBe('task-1')
        expect(blocks[0]?.children).toHaveLength(1)

        const child = blocks[0]?.children[0]
        expect(child?.kind).toBe('tool-call')
        if (child?.kind === 'tool-call') {
            expect(child.id).toBe('child-1')
            expect(child.tool.permission?.status).toBe('pending')
        }
    })
})
