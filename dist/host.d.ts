/**
 * MCP Host RPC Server Module
 *
 * This module provides a simplified API for host applications to set up an RPC server
 * that can be used with MCP (Model Context Protocol) servers. It handles the creation
 * of Unix domain sockets, JSON-RPC server setup, JWT-based authentication with context
 * scoping, and provides elegant callback registration for RPC functions.
 */
export interface ToolProperties {
    title: string;
    description: string;
    functionName: string;
    inputSchema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
        additionalProperties?: boolean;
    };
}
export interface RpcHandler {
    (context: any, args: any): Promise<any>;
}
export interface McpHostOptions {
    /** Secret key for JWT signing/verification. If not provided, one will be generated. */
    authToken?: string;
    /** Custom pipe path. If not provided, a temporary one will be created. */
    pipePath?: string;
    /** Auto-start the server immediately */
    start?: boolean;
    /** Whether to log debug information */
    debug?: boolean;
}
export interface McpHostServer {
    /** Register an RPC tool with context-based handler */
    registerTool(toolName: string, properties: ToolProperties, handler: RpcHandler): void;
    /** Get environment variables for MCP server instance */
    getMCPServerEnvVars(tools: string[], context: any): {
        CONTEXT_TOKEN: string;
        PIPE: string;
        TOOLS: string;
    };
    /** Get complete MCP client configuration */
    getMCPServerConfig(name: string, tools: string[], context: any): Record<string, any>;
    /** Start the RPC server */
    start(): Promise<{
        authToken: string;
        pipePath: string;
        toolsConfig: Record<string, ToolProperties>;
    }>;
    /** Stop the RPC server */
    stop(): Promise<void>;
}
export declare class McpHost implements McpHostServer {
    private server;
    private socketServer?;
    private authToken;
    private pipePath;
    private debug;
    private rpcHandlers;
    private toolsConfig;
    private isStarted;
    constructor(options?: McpHostOptions);
    private generateAuthToken;
    private log;
    private createJWT;
    private verifyJWT;
    registerTool(toolName: string, properties: ToolProperties, handler: RpcHandler): void;
    getMCPServerEnvVars(tools: string[], context: any): {
        CONTEXT_TOKEN: string;
        PIPE: string;
        TOOLS: string;
    };
    getMCPServerConfig(name: string, tools: string[], context: any): Record<string, any>;
    start(): Promise<{
        authToken: string;
        pipePath: string;
        toolsConfig: Record<string, ToolProperties>;
    }>;
    stop(): Promise<void>;
}
export declare function createMcpHost(options?: McpHostOptions): McpHostServer;
//# sourceMappingURL=host.d.ts.map