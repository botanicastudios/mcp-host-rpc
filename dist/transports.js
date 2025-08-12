/**
 * Transport abstraction layer for MCP Host RPC
 *
 * This module provides a unified interface for different transport mechanisms
 * (Unix sockets and HTTP) used by the MCP Host RPC system. It allows the host
 * to communicate with MCP servers through various protocols while maintaining
 * the same API surface.
 */
import * as net from "net";
import * as fs from "fs";
export class Transport {
    host;
    debug;
    constructor(host, options = {}) {
        this.host = host;
        this.debug = options.debug ?? false;
    }
    log(message, ...args) {
        if (this.debug) {
            console.log(`[MCP-Host-${this.constructor.name}] ${message}`, ...args);
        }
    }
}
export class SocketTransport extends Transport {
    socketServer;
    socketPath;
    isStarted = false;
    constructor(host, socketPath, options = {}) {
        super(host, options);
        this.socketPath = socketPath;
    }
    async start() {
        if (this.isStarted) {
            throw new Error("Socket transport is already started");
        }
        // Clean up existing socket file
        if (fs.existsSync(this.socketPath)) {
            fs.unlinkSync(this.socketPath);
        }
        return new Promise((resolve, reject) => {
            this.socketServer = net.createServer((socket) => {
                this.log("Client connected");
                // Buffer to accumulate incoming data
                let buffer = "";
                socket.on("data", async (data) => {
                    // Append incoming data to buffer
                    buffer += data.toString();
                    // Process all complete messages (delimited by newlines)
                    let newlineIndex;
                    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
                        // Extract the complete message
                        const line = buffer.substring(0, newlineIndex);
                        buffer = buffer.substring(newlineIndex + 1);
                        // Skip empty lines
                        if (!line.trim()) {
                            continue;
                        }
                        try {
                            const request = JSON.parse(line);
                            this.log("Received request:", request.method);
                            const response = await this.host.rpcServer.receive(request);
                            if (response) {
                                socket.write(JSON.stringify(response) + "\n");
                            }
                        }
                        catch (error) {
                            this.log("Error processing request:", error);
                            this.log("Problematic line:", line);
                            const errorResponse = {
                                jsonrpc: "2.0",
                                error: {
                                    code: -32700,
                                    message: "Parse error",
                                    data: error instanceof Error ? error.message : String(error),
                                },
                                id: null,
                            };
                            socket.write(JSON.stringify(errorResponse) + "\n");
                        }
                    }
                });
                socket.on("close", () => {
                    this.log("Client disconnected");
                    // Clear the buffer when socket closes
                    buffer = "";
                });
                socket.on("error", (error) => {
                    this.log("Socket error:", error);
                });
            });
            const listenCallback = () => {
                this.isStarted = true;
                this.log("Socket transport started on", this.socketPath);
                resolve();
            };
            this.socketServer.on("error", (error) => {
                reject(error);
            });
            this.socketServer.listen(this.socketPath, listenCallback);
        });
    }
    async stop() {
        if (!this.isStarted || !this.socketServer) {
            return;
        }
        return new Promise((resolve, reject) => {
            // Add timeout to prevent hanging
            const timeout = setTimeout(() => {
                this.log("Socket transport stop timeout - forcing shutdown");
                this.isStarted = false;
                reject(new Error("Socket transport stop timeout"));
            }, 5000); // 5 second timeout
            this.socketServer.close((error) => {
                clearTimeout(timeout);
                if (error) {
                    this.log("Error stopping socket transport:", error);
                    reject(error);
                    return;
                }
                try {
                    if (fs.existsSync(this.socketPath)) {
                        fs.unlinkSync(this.socketPath);
                    }
                }
                catch (unlinkError) {
                    this.log("Error removing socket file:", unlinkError);
                }
                this.isStarted = false;
                this.log("Socket transport stopped");
                resolve();
            });
        });
    }
    getConnectionInfo() {
        return {
            type: 'socket',
            path: this.socketPath,
        };
    }
}
export class HttpTransport extends Transport {
    httpPath;
    httpUrl;
    constructor(host, httpPath, options = {}) {
        super(host, options);
        this.httpPath = httpPath;
        this.httpUrl = options.httpUrl;
    }
    async start() {
        // HTTP transport doesn't need to "start" - it's request/response based
        this.log("HTTP transport ready for path:", this.httpPath);
    }
    async stop() {
        // Clean up any resources if needed
        this.log("HTTP transport stopped");
    }
    async handleRequest(req, res) {
        try {
            // Extract body - handle both raw Node.js and framework-specific requests
            let body;
            if ('body' in req && req.body) {
                body = req.body;
            }
            else {
                // For raw Node.js IncomingMessage, we need to read the body
                body = await this.readBody(req);
            }
            // Verify JWT from Authorization header
            const authHeader = req.headers['authorization'] || req.headers['Authorization'];
            if (!authHeader || typeof authHeader !== 'string') {
                this.sendError(res, -32600, "Missing authorization header");
                return;
            }
            const token = authHeader.replace(/^Bearer\s+/i, '');
            if (!token) {
                this.sendError(res, -32600, "Invalid authorization header format");
                return;
            }
            // Parse JSON-RPC request
            let request;
            try {
                request = typeof body === 'string' ? JSON.parse(body) : body;
            }
            catch (error) {
                this.sendError(res, -32700, "Parse error");
                return;
            }
            // For HTTP mode, we need to inject the token into the request params
            // since the JSON-RPC handlers expect it as the first parameter
            if (request.params && Array.isArray(request.params) && request.params.length >= 2) {
                // Replace the first parameter (context token placeholder) with the actual token
                request.params[0] = token;
            }
            this.log("Received HTTP request:", request.method);
            // Process request through JSON-RPC server
            const response = await this.host.rpcServer.receive(request);
            // Send response
            this.sendResponse(res, response);
        }
        catch (error) {
            this.log("Error handling HTTP request:", error);
            this.sendError(res, -32603, "Internal error", error);
        }
    }
    async readBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk.toString());
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }
    sendResponse(res, data) {
        if ('status' in res && 'json' in res) {
            // Framework response (Express, Fastify, etc.)
            res.status(200).json(data);
        }
        else {
            // Raw Node.js response
            const rawRes = res;
            rawRes.writeHead(200, { 'Content-Type': 'application/json' });
            rawRes.end(JSON.stringify(data));
        }
    }
    sendError(res, code, message, data) {
        const errorResponse = {
            jsonrpc: "2.0",
            error: {
                code,
                message,
                data: data instanceof Error ? data.message : data,
            },
            id: null,
        };
        if ('status' in res && 'json' in res) {
            // Framework response
            res.status(200).json(errorResponse); // JSON-RPC errors still use 200 status
        }
        else {
            // Raw Node.js response
            const rawRes = res;
            rawRes.writeHead(200, { 'Content-Type': 'application/json' });
            rawRes.end(JSON.stringify(errorResponse));
        }
    }
    getConnectionInfo() {
        return {
            type: 'http',
            url: this.httpUrl || this.httpPath,
        };
    }
    getHttpUrl() {
        return this.httpUrl || `http://localhost${this.httpPath}`;
    }
}
//# sourceMappingURL=transports.js.map