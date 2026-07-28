import type { Tool } from '@xsai/shared-chat';
/**
 * Describes an MCP tool that can be exposed to the shared LLM runtime.
 *
 * Use when:
 * - A runtime needs to list available MCP tools before exposing them to models
 *
 * Expects:
 * - `name` is the fully-qualified tool name used for invocation
 *
 * Returns:
 * - The MCP tool descriptor metadata reported by the runtime
 */
export interface McpToolDescriptor {
    serverName: string;
    name: string;
    toolName: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}
/**
 * Payload for invoking an MCP tool through a runtime-specific transport.
 *
 * Use when:
 * - A runtime needs to forward a tool invocation into the MCP layer
 *
 * Expects:
 * - `name` matches a descriptor returned from `listTools`
 * - `arguments` is a JSON-compatible object when provided
 *
 * Returns:
 * - The MCP tool call input envelope
 */
export interface McpCallToolPayload {
    name: string;
    arguments?: Record<string, unknown>;
}
/**
 * Result returned from an MCP tool invocation.
 *
 * Use when:
 * - An MCP runtime returns tool output back to the shared LLM layer
 *
 * Expects:
 * - Error responses set `isError` when the tool execution failed
 *
 * Returns:
 * - Structured and unstructured MCP tool output
 */
export interface McpCallToolResult {
    content?: Array<Record<string, unknown>>;
    structuredContent?: Record<string, unknown>;
    toolResult?: unknown;
    isError?: boolean;
}
/**
 * Runtime contract for wiring MCP tool discovery and execution into `stage-ui`.
 *
 * Use when:
 * - A concrete runtime such as Electron needs to provide MCP access without a singleton bridge
 *
 * Expects:
 * - `listTools` and `callTool` are safe to call multiple times
 *
 * Returns:
 * - An object that can back `createMcpTools`
 */
export interface McpToolRuntime {
    listTools: () => Promise<McpToolDescriptor[]>;
    callTool: (payload: McpCallToolPayload) => Promise<McpCallToolResult>;
}
/**
 * Creates MCP proxy tools backed by a runtime-provided transport.
 *
 * Use when:
 * - A runtime wants to register MCP tools into the shared LLM tool store
 *
 * Expects:
 * - The runtime implements the `McpToolRuntime` contract
 *
 * Returns:
 * - xsai tool definition promises for MCP listing and invocation
 */
export declare function createMcpTools(runtime: McpToolRuntime): Array<Promise<Tool>>;
/**
 * Builds the default stage-ui MCP tool set without depending on runtime singletons.
 *
 * Use when:
 * - Shared code needs the MCP tool schema before a concrete runtime registers live implementations
 *
 * Expects:
 * - Runtime-specific callers override these tools through `useLlmToolsStore`
 *
 * Returns:
 * - MCP tool definitions with an unavailable-runtime fallback
 */
export declare function mcp(): Promise<Tool[]>;
