/**
 * MCP Host RPC Server Module
 *
 * This module provides a simplified API for host applications to set up an RPC server
 * that can be used with MCP (Model Context Protocol) servers. It handles the creation
 * of Unix domain sockets, JSON-RPC server setup, JWT-based authentication with context
 * scoping, and provides elegant callback registration for RPC functions.
 */
import { JSONRPCServer } from "json-rpc-2.0";
import type { IncomingMessage, ServerResponse } from "http";
export interface ToolProperties {
    title: string;
    description: string;
    functionName: string;
    inputSchema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
        additionalProperties?: boolean;
    } | any;
}
export interface RpcHandler {
    (context: any, args: any): Promise<any>;
}
export interface McpHostOptions {
    /** Secret key for JWT signing/verification. If not provided, one will be generated. */
    secret?: string;
    /** Custom pipe path. If not provided, a temporary one will be created. */
    pipePath?: string;
    /** Auto-start the server immediately */
    start?: boolean;
    /** Whether to log debug information */
    debug?: boolean;
    /** Transport mode: 'socket' (default) or 'http' */
    transport?: 'socket' | 'http';
    /** Path for HTTP endpoint (e.g., '/mcp-rpc') - required for HTTP transport */
    httpPath?: string;
    /** Full HTTP URL for the endpoint (optional, for getMCPServerEnvVars) */
    httpUrl?: string;
}
export interface McpHostServer {
    /** Register an RPC tool with context-based handler */
    registerTool(toolName: string, properties: ToolProperties, handler: RpcHandler): void;
    /** Get environment variables for MCP server instance */
    getMCPServerEnvVars(tools: string[], context: any): {
        CONTEXT_TOKEN: string;
        PIPE?: string;
        RPC_API_URL?: string;
        TRANSPORT_MODE: string;
        TOOLS: string;
        DEBUG?: string;
    };
    /** Get complete MCP client configuration */
    getMCPServerConfig(name: string, tools: string[], context: any, options?: {
        command?: string | string[];
        args?: string[];
        debug?: boolean;
    }): Record<string, any>;
    /** Start the RPC server */
    start(): Promise<{
        secret: string;
        pipePath: string;
        toolsConfig: Record<string, ToolProperties>;
    }>;
    /** Stop the RPC server */
    stop(): Promise<void>;
    /** Handle HTTP requests (only for HTTP transport) */
    handleHttpRequest?(req: IncomingMessage | {
        body: any;
        headers: any;
    }, res: ServerResponse | {
        status: Function;
        json: Function;
    }): Promise<void>;
}
export declare class McpHost implements McpHostServer {
    private server;
    private socketServer?;
    private secret;
    private pipePath;
    private debug;
    private rpcHandlers;
    private toolsConfig;
    private isStarted;
    private transport;
    private transportMode;
    private httpPath?;
    private httpUrl?;
    constructor(options?: McpHostOptions);
    private generateAuthToken;
    private log;
    get rpcServer(): JSONRPCServer;
    private createJWT;
    verifyJWT(token: string): any;
    registerTool(toolName: string, properties: ToolProperties, handler: RpcHandler): void;
    getMCPServerEnvVars(tools: string[], context: any): {
        CONTEXT_TOKEN: string;
        PIPE?: string;
        RPC_API_URL?: string;
        TRANSPORT_MODE: string;
        TOOLS: string;
        DEBUG?: string;
    };
    getMCPServerConfig(name: string, tools: string[], context: any, options?: {
        command?: string | string[];
        args?: string[];
        debug?: boolean;
    }): Record<string, any>;
    start(): Promise<{
        secret: string;
        pipePath: string;
        toolsConfig: Record<string, ToolProperties>;
    }>;
    stop(): Promise<void>;
    handleHttpRequest(req: IncomingMessage | {
        body: any;
        headers: any;
    }, res: ServerResponse | {
        status: Function;
        json: Function;
    }): Promise<void>;
    private getHttpUrl;
}
export declare function createMcpHost(options?: McpHostOptions): McpHostServer;
//# sourceMappingURL=host.d.ts.map