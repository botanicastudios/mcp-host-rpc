/**
 * Transport abstraction layer for MCP Host RPC
 *
 * This module provides a unified interface for different transport mechanisms
 * (Unix sockets and HTTP) used by the MCP Host RPC system. It allows the host
 * to communicate with MCP servers through various protocols while maintaining
 * the same API surface.
 */
import type { IncomingMessage, ServerResponse } from "http";
export interface ConnectionInfo {
    type: 'socket' | 'http';
    path?: string;
    url?: string;
}
export interface TransportOptions {
    debug?: boolean;
}
export declare abstract class Transport {
    protected host: any;
    protected debug: boolean;
    constructor(host: any, options?: TransportOptions);
    protected log(message: string, ...args: any[]): void;
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract getConnectionInfo(): ConnectionInfo;
}
export declare class SocketTransport extends Transport {
    private socketServer?;
    private socketPath;
    private isStarted;
    constructor(host: any, socketPath: string, options?: TransportOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    getConnectionInfo(): ConnectionInfo;
}
export declare class HttpTransport extends Transport {
    private httpPath;
    private httpUrl?;
    constructor(host: any, httpPath: string, options?: TransportOptions & {
        httpUrl?: string;
    });
    start(): Promise<void>;
    stop(): Promise<void>;
    handleRequest(req: IncomingMessage | {
        body: any;
        headers: any;
    }, res: ServerResponse | {
        status: Function;
        json: Function;
        end?: Function;
    }): Promise<void>;
    private readBody;
    private sendResponse;
    private sendError;
    getConnectionInfo(): ConnectionInfo;
    getHttpUrl(): string;
}
//# sourceMappingURL=transports.d.ts.map