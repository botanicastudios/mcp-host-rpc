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
/**
 * Check if an object is a Zod schema
 */
function isZodSchema(obj) {
    return (obj &&
        typeof obj === "object" &&
        obj._def &&
        typeof obj._def.typeName === "string" &&
        obj._def.typeName.startsWith("Zod"));
}
/**
 * Convert Zod schema to JSON Schema
 */
function zodToJsonSchema(zodSchema) {
    function getDescription(schema) {
        return schema._def.description || undefined;
    }
    function processSchema(schema) {
        const typeName = schema._def.typeName;
        switch (typeName) {
            case "ZodObject": {
                const properties = {};
                const required = [];
                for (const [key, value] of Object.entries(schema.shape)) {
                    properties[key] = zodToJsonSchema(value);
                    if (!value.isOptional()) {
                        required.push(key);
                    }
                }
                return {
                    type: "object",
                    properties,
                    required,
                    additionalProperties: false,
                };
            }
            case "ZodString": {
                const result = { type: "string" };
                const desc = getDescription(schema);
                if (desc)
                    result.description = desc;
                // Handle string constraints
                const checks = schema._def.checks || [];
                for (const check of checks) {
                    if (check.kind === "min")
                        result.minLength = check.value;
                    if (check.kind === "max")
                        result.maxLength = check.value;
                }
                return result;
            }
            case "ZodNumber": {
                const result = { type: "number" };
                const desc = getDescription(schema);
                if (desc)
                    result.description = desc;
                return result;
            }
            case "ZodBoolean": {
                const result = { type: "boolean" };
                const desc = getDescription(schema);
                if (desc)
                    result.description = desc;
                return result;
            }
            case "ZodArray": {
                const result = {
                    type: "array",
                    items: zodToJsonSchema(schema._def.type),
                };
                const desc = getDescription(schema);
                if (desc)
                    result.description = desc;
                return result;
            }
            case "ZodEnum": {
                const result = {
                    type: "string",
                    enum: schema._def.values,
                };
                const desc = getDescription(schema);
                if (desc)
                    result.description = desc;
                return result;
            }
            case "ZodOptional": {
                return zodToJsonSchema(schema._def.innerType);
            }
            case "ZodDefault": {
                const innerSchema = zodToJsonSchema(schema._def.innerType);
                innerSchema.default = schema._def.defaultValue();
                return innerSchema;
            }
            case "ZodEffects": {
                // For .refine() and .transform(), use the inner schema
                return zodToJsonSchema(schema._def.schema);
            }
            default:
                console.warn(`[MCP-Host] Unsupported Zod type: ${typeName}, falling back to string`);
                return { type: "string" };
        }
    }
    return processSchema(zodSchema);
}
export class McpHost {
    server;
    socketServer;
    secret;
    pipePath;
    debug;
    rpcHandlers = new Map();
    toolsConfig = {};
    isStarted = false;
    constructor(options = {}) {
        this.server = new JSONRPCServer();
        this.secret = options.secret || this.generateAuthToken();
        this.debug = options.debug ?? false;
        // Always use Unix socket, generate path if not provided
        const tempDir = os.tmpdir();
        this.pipePath =
            options.pipePath || path.join(tempDir, `mcp-pipe-${Date.now()}.sock`);
        // Auto-start if requested
        if (options.start) {
            this.start().catch((error) => {
                this.log("Failed to auto-start server:", error);
            });
        }
    }
    generateAuthToken() {
        return crypto.randomBytes(32).toString("hex");
    }
    log(message, ...args) {
        if (this.debug) {
            console.log(`[MCP-Host] ${message}`, ...args);
        }
    }
    createJWT(context) {
        return jwt.sign({ context }, this.secret, { noTimestamp: true });
    }
    verifyJWT(token) {
        try {
            const decoded = jwt.verify(token, this.secret);
            return decoded.context;
        }
        catch (error) {
            throw new Error(`Invalid JWT token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    registerTool(toolName, properties, handler) {
        this.rpcHandlers.set(properties.functionName, handler);
        // Automatically convert Zod schema to JSON Schema if needed
        const processedProperties = { ...properties };
        if (isZodSchema(properties.inputSchema)) {
            this.log(`Converting Zod schema to JSON Schema for tool: ${toolName}`);
            processedProperties.inputSchema = zodToJsonSchema(properties.inputSchema);
        }
        this.toolsConfig[toolName] = processedProperties;
        // Create a wrapper that verifies JWT and extracts context
        const wrappedHandler = async (...params) => {
            // JSON-RPC 2.0 wraps the client array parameters in another array
            const [contextToken, args] = params[0];
            if (typeof contextToken !== "string") {
                throw new Error(`Expected JWT token as string, got ${typeof contextToken}`);
            }
            const context = this.verifyJWT(contextToken);
            // Actually await the handler result before returning
            try {
                const result = await handler(context, args);
                return result;
            }
            catch (error) {
                // Re-throw the error to let JSON-RPC handle it properly
                throw error;
            }
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
            TOOLS: JSON.stringify(filteredTools),
        };
    }
    getMCPServerConfig(name, tools, context, options) {
        // Input validation to prevent potential bugs
        if (!name || typeof name !== 'string') {
            throw new Error('Server name must be a non-empty string');
        }
        const envVars = { ...this.getMCPServerEnvVars(tools, context) };
        let command = "npx";
        let args = ["-y", "@botanicastudios/mcp-host-rpc"];
        if (options?.command) {
            if (Array.isArray(options.command)) {
                if (options.command.length > 0) {
                    command = options.command[0];
                    args = options.command.slice(1);
                }
            }
            else {
                // Use string command as-is and reset args to empty
                command = options.command;
                args = [];
            }
            if (options?.args) {
                args = args.concat(options.args);
            }
        }
        // Add DEBUG env var if debug option is enabled
        if (options?.debug) {
            envVars.DEBUG = "1";
        }
        // Build the configuration object with defensive structure
        const serverConfig = {
            type: "stdio",
            command,
            args,
            env: envVars,
        };
        // Return the properly structured configuration
        // Using explicit object construction to prevent any accidental nesting
        const result = {};
        result[name] = serverConfig;
        return result;
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
                this.log("Client connected");
                socket.on("data", async (data) => {
                    const lines = data
                        .toString()
                        .split("\n")
                        .filter((line) => line.trim());
                    for (const line of lines) {
                        try {
                            // Add better validation before parsing
                            if (typeof line !== 'string' || !line.trim()) {
                                this.log("Skipping invalid line data:", typeof line);
                                continue;
                            }
                            const request = JSON.parse(line);
                            this.log("Received request:", request.method);
                            const response = await this.server.receive(request);
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
                });
                socket.on("error", (error) => {
                    this.log("Socket error:", error);
                });
            });
            const listenCallback = () => {
                this.isStarted = true;
                this.log("RPC server started");
                this.log("Available tools:", Object.keys(this.toolsConfig));
                resolve({
                    secret: this.secret,
                    pipePath: this.pipePath,
                    toolsConfig: this.toolsConfig,
                });
            };
            this.socketServer.on("error", (error) => {
                reject(error);
            });
            this.socketServer.listen(this.pipePath, listenCallback);
        });
    }
    async stop() {
        if (!this.isStarted || !this.socketServer) {
            return;
        }
        return new Promise((resolve, reject) => {
            // Add timeout to prevent hanging
            const timeout = setTimeout(() => {
                this.log("Server stop timeout - forcing shutdown");
                this.isStarted = false;
                reject(new Error("Server stop timeout"));
            }, 5000); // 5 second timeout
            this.socketServer.close((error) => {
                clearTimeout(timeout);
                if (error) {
                    this.log("Error stopping server:", error);
                    reject(error);
                    return;
                }
                try {
                    if (fs.existsSync(this.pipePath)) {
                        fs.unlinkSync(this.pipePath);
                    }
                }
                catch (unlinkError) {
                    this.log("Error removing socket file:", unlinkError);
                }
                this.isStarted = false;
                this.log("Server stopped");
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