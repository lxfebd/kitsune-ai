import type { Message, Tool, ToolCall } from '@xsai/shared-chat'

import { InvalidToolCallError, InvalidToolInputError, ToolExecutionError } from '@xsai/shared'
import { executeTool } from '@xsai/shared-chat'
import { describe, expect, it } from 'vitest'

function createToolCall(overrides: Partial<ToolCall> & {
  function?: Partial<ToolCall['function']> & { name?: string, arguments?: string }
} = {}): ToolCall {
  const fn = overrides.function ?? {}
  return {
    id: 'call_1',
    type: 'function',
    function: {
      name: 'myTool',
      arguments: '{}',
      ...fn,
    },
    ...overrides,
  } as ToolCall
}

function createTool(name: string, execute: Tool['execute']): Tool {
  return {
    type: 'function',
    function: { name, description: '', parameters: {} },
    execute,
  }
}

const emptyMessages: Message[] = []

describe('executeTool (@xsai/shared-chat)', () => {
  it('returns success tool message when tool executes', async () => {
    const tools = [createTool('myTool', async () => 'ok')]
    const toolCall = createToolCall()

    const out = await executeTool({
      messages: emptyMessages,
      toolCall,
      tools,
    })

    expect(out.completionToolResult.result).toBe('ok')
    expect(out.message.role).toBe('tool')
    expect(out.message.content).toBe('ok')
    expect(out.message.tool_call_id).toBe('call_1')
  })

  it('rethrows AbortError from tool execute', async () => {
    const controller = new AbortController()
    const tools = [
      createTool('myTool', async () => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        throw err
      }),
    ]
    const toolCall = createToolCall()

    await expect(
      executeTool({
        abortSignal: controller.signal,
        messages: emptyMessages,
        toolCall,
        tools,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  describe('without captureToolErrors (default upstream behavior)', () => {
    it('throws InvalidToolCallError for unknown tool', async () => {
      const tools = [createTool('other', async () => 'x')]
      const toolCall = createToolCall({ function: { name: 'missingTool', arguments: '{}' } })

      let thrown: unknown
      try {
        await executeTool({
          messages: emptyMessages,
          toolCall,
          tools,
        })
        expect.fail('expected executeTool to throw')
      }
      catch (error) {
        thrown = error
      }
      expect(InvalidToolCallError.isInstance(thrown)).toBe(true)
    })

    it('throws InvalidToolInputError for invalid JSON arguments', async () => {
      const tools = [createTool('myTool', async () => 'x')]
      const toolCall = createToolCall({ function: { name: 'myTool', arguments: '{broken' } })

      let thrown: unknown
      try {
        await executeTool({
          messages: emptyMessages,
          toolCall,
          tools,
        })
        expect.fail('expected executeTool to throw')
      }
      catch (error) {
        thrown = error
      }
      expect(InvalidToolInputError.isInstance(thrown)).toBe(true)
    })

    it('throws ToolExecutionError when tool execute rejects', async () => {
      const tools = [
        createTool('myTool', async () => {
          throw new Error('execute failed')
        }),
      ]
      const toolCall = createToolCall()

      let thrown: unknown
      try {
        await executeTool({
          messages: emptyMessages,
          toolCall,
          tools,
        })
        expect.fail('expected executeTool to throw')
      }
      catch (error) {
        thrown = error
      }
      expect(ToolExecutionError.isInstance(thrown)).toBe(true)
    })
  })
})
