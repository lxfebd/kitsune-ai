/**
 * Minimal bridge interface for calling MCP tools from the desktop overlay
 * renderer without a direct dependency on the MCP server runtime.
 *
 * The bridge is set by the Electron main/preload layer (or by a test stub)
 * and retrieved by overlay pages that need to invoke computer-use MCP tools.
 */
export interface McpToolDescriptor {
    serverName: string;
    name: string;
    toolName: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}
export interface McpCallToolPayload {
    name: string;
    arguments?: Record<string, unknown>;
}
export interface McpCallToolResult {
    content?: Array<Record<string, unknown>>;
    structuredContent?: Record<string, unknown>;
    toolResult?: unknown;
    isError?: boolean;
}
interface McpToolBridge {
    listTools: () => Promise<McpToolDescriptor[]>;
    callTool: (payload: McpCallToolPayload) => Promise<McpCallToolResult>;
}
export declare function setMcpToolBridge(nextBridge: McpToolBridge): void;
export declare function clearMcpToolBridge(): void;
export declare function getMcpToolBridge(): McpToolBridge;

