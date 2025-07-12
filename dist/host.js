/**
 * MCP Host RPC Server Module
 *
 * This module provides a simplified API for host applications to set up an RPC server
 * that can be used with MCP (Model Context Protocol) servers. It handles the creation
 * of Unix domain sockets, JSON-RPC server setup, JWT-based authentication with context
 * scoping, and provides elegant callback registration for RPC functions.
 */
import { JSONRPCServer } from "json-rpc-2.0";
import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
// @ts-ignore - jsonwebtoken types may not be available in all environments
import jwt from "jsonwebtoken";
export class McpHost {
    server;
    socketServer;
    authToken;
    pipePath;
    debug;
    rpcHandlers = new Map();
    toolsConfig = {};
    isStarted = false;
    constructor(options = {}) {
        this.server = new JSONRPCServer();
        this.authToken = options.authToken || this.generateAuthToken();
        this.debug = options.debug ?? false;
        // Always use Unix socket, generate path if not provided
        const tempDir = os.tmpdir();
        this.pipePath = options.pipePath || path.join(tempDir, `mcp-pipe-${Date.now()}.sock`);
        // Auto-start if requested
        if (options.start) {
            this.start().catch(error => {
                this.log('Failed to auto-start server:', error);
            });
        }
    }
    generateAuthToken() {
        return crypto.randomBytes(32).toString('hex');
    }
    log(message, ...args) {
        if (this.debug) {
            console.log(`[MCP-Host] ${message}`, ...args);
        }
    }
    createJWT(context) {
        return jwt.sign({ context }, this.authToken, { noTimestamp: true });
    }
    verifyJWT(token) {
        try {
            const decoded = jwt.verify(token, this.authToken);
            return decoded.context;
        }
        catch (error) {
            throw new Error(`Invalid JWT token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    registerTool(toolName, properties, handler) {
        this.rpcHandlers.set(properties.functionName, handler);
        this.toolsConfig[toolName] = properties;
        // Create a wrapper that verifies JWT and extracts context
        const wrappedHandler = async (contextToken, args) => {
            const context = this.verifyJWT(contextToken);
            return await handler(context, args);
        };
        this.server.addMethod(properties.functionName, wrappedHandler);
        this.log(`Registered tool: ${toolName} -> ${properties.functionName}`);
    }
    getMCPServerEnvVars(tools, context) {
        // Filter tools config to only include requested tools
        const filteredTools = {};
        for (const toolName of tools) {
            if (this.toolsConfig[toolName]) {
                filteredTools[toolName] = this.toolsConfig[toolName];
            }
        }
        const contextToken = this.createJWT(context);
        return {
            CONTEXT_TOKEN: contextToken,
            PIPE: this.pipePath,
            TOOLS: JSON.stringify(filteredTools)
        };
    }
    getMCPServerConfig(name, tools, context) {
        const envVars = this.getMCPServerEnvVars(tools, context);
        return {
            [name]: {
                type: "stdio",
                command: "npx -y @botanicastudios/mcp-host-rpc",
                args: [],
                env: envVars
            }
        };
    }
    async start() {
        if (this.isStarted) {
            throw new Error("Server is already started");
        }
        // Clean up existing socket file
        if (fs.existsSync(this.pipePath)) {
            fs.unlinkSync(this.pipePath);
        }
        return new Promise((resolve, reject) => {
            this.socketServer = net.createServer((socket) => {
                this.log('Client connected');
                socket.on('data', async (data) => {
                    const lines = data.toString().split('\n').filter(line => line.trim());
                    for (const line of lines) {
                        try {
                            const request = JSON.parse(line);
                            this.log('Received request:', request.method);
                            const response = await this.server.receive(request);
                            if (response) {
                                socket.write(JSON.stringify(response) + '\n');
                            }
                        }
                        catch (error) {
                            this.log('Error processing request:', error);
                            const errorResponse = {
                                jsonrpc: "2.0",
                                error: {
                                    code: -32700,
                                    message: "Parse error",
                                    data: error instanceof Error ? error.message : String(error)
                                },
                                id: null
                            };
                            socket.write(JSON.stringify(errorResponse) + '\n');
                        }
                    }
                });
                socket.on('close', () => {
                    this.log('Client disconnected');
                });
                socket.on('error', (error) => {
                    this.log('Socket error:', error);
                });
            });
            const listenCallback = () => {
                this.isStarted = true;
                this.log('RPC server started');
                this.log('Available tools:', Object.keys(this.toolsConfig));
                resolve({
                    authToken: this.authToken,
                    pipePath: this.pipePath,
                    toolsConfig: this.toolsConfig
                });
            };
            this.socketServer.on('error', (error) => {
                reject(error);
            });
            this.socketServer.listen(this.pipePath, listenCallback);
        });
    }
    async stop() {
        if (!this.isStarted || !this.socketServer) {
            return;
        }
        return new Promise((resolve) => {
            this.socketServer.close(() => {
                if (fs.existsSync(this.pipePath)) {
                    fs.unlinkSync(this.pipePath);
                }
                this.isStarted = false;
                this.log('Server stopped');
                resolve();
            });
        });
    }
}
// Convenience function to create a new MCP host
export function createMcpHost(options) {
    return new McpHost(options);
}
//# sourceMappingURL=host.js.map