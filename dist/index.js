#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JSONRPCClient } from "json-rpc-2.0";
import * as net from "net";
// Check if debug mode is enabled
const DEBUG = !!process.env.DEBUG;
// Debug logging function
function debug(message, ...args) {
    if (DEBUG) {
        console.error(`[MCP-RPC-Bridge] ${message}`, ...args);
    }
}
// Parse environment variables
const contextToken = process.env.CONTEXT_TOKEN;
const toolsConfig = process.env.TOOLS;
const transportMode = process.env.TRANSPORT_MODE || 'socket';
const pipeAddress = process.env.PIPE;
const rpcApiUrl = process.env.RPC_API_URL;
debug("Starting MCP RPC Bridge");
debug("Debug mode enabled");
debug("Transport mode:", transportMode);
if (!contextToken) {
    throw new Error("CONTEXT_TOKEN environment variable is required");
}
if (!toolsConfig) {
    throw new Error("TOOLS environment variable is required");
}
if (transportMode === 'socket' && !pipeAddress) {
    throw new Error("PIPE environment variable is required for socket mode");
}
if (transportMode === 'http' && !rpcApiUrl) {
    throw new Error("RPC_API_URL environment variable is required for HTTP mode");
}
// Parse tools configuration
let tools;
try {
    tools = JSON.parse(toolsConfig);
    debug("Loaded tools configuration:", Object.keys(tools));
}
catch (error) {
    throw new Error("TOOLS must be valid JSON");
}
// Create RPC client based on transport mode
let rpcClient;
if (transportMode === 'http') {
    // HTTP transport implementation
    debug("Initializing HTTP transport");
    debug("RPC API URL:", rpcApiUrl);
    const send = async (data) => {
        try {
            const response = await fetch(rpcApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${contextToken}`,
                },
                body: data,
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const responseText = await response.text();
            debug("Received HTTP response:", responseText);
            // Parse and receive the response
            try {
                const jsonResponse = JSON.parse(responseText);
                rpcClient.receive(jsonResponse);
            }
            catch (error) {
                debug("Error parsing HTTP response:", error);
            }
        }
        catch (error) {
            debug("HTTP request error:", error);
            // Create an error response for the RPC client
            rpcClient.receive({
                jsonrpc: "2.0",
                error: {
                    code: -32603,
                    message: "Internal error",
                    data: error instanceof Error ? error.message : String(error),
                },
                id: null,
            });
        }
    };
    rpcClient = new JSONRPCClient(send);
    debug("HTTP RPC client initialized");
}
else {
    // Socket transport implementation (existing code)
    debug("Initializing socket transport");
    debug("Pipe address:", pipeAddress);
    const socket = net.createConnection(pipeAddress);
    socket.on("connect", () => {
        debug("Connected to parent app via pipe");
    });
    socket.on("error", (error) => {
        debug("Socket error:", error);
        process.exit(1);
    });
    socket.on("close", () => {
        debug("Socket connection closed");
        process.exit(1);
    });
    const send = (data) => {
        if (socket.writable) {
            // Ensure data is properly stringified if it's somehow an object
            const stringData = typeof data === "string" ? data : JSON.stringify(data);
            debug("Sending RPC request:", stringData);
            socket.write(stringData + "\n");
        }
        else {
            debug("Socket not writable");
        }
    };
    rpcClient = new JSONRPCClient(send);
    // Handle incoming RPC responses
    socket.on("data", (data) => {
        const lines = data
            .toString()
            .split("\n")
            .filter((line) => line.trim());
        for (const line of lines) {
            try {
                const response = JSON.parse(line);
                debug("Received RPC response:", response);
                rpcClient.receive(response);
            }
            catch (error) {
                debug("Error parsing RPC response:", error);
            }
        }
    });
    debug("Socket RPC client initialized");
}
// Create an MCP server
const server = new McpServer({
    name: "rpc-bridge-server",
    version: "1.0.0",
});
// Function to convert JSON Schema to Zod schema
function jsonSchemaToZod(schema) {
    if (schema.type === "object") {
        const shape = {};
        if (schema.properties) {
            for (const [key, prop] of Object.entries(schema.properties)) {
                let zodType = jsonSchemaToZod(prop);
                // Add description if available
                if (prop.description) {
                    zodType = zodType.describe(prop.description);
                }
                // Check if this property is required
                if (!schema.required || !schema.required.includes(key)) {
                    zodType = zodType.optional();
                }
                shape[key] = zodType;
            }
        }
        return z.object(shape);
    }
    else if (schema.type === "string") {
        return z.string();
    }
    else if (schema.type === "number") {
        return z.number();
    }
    else if (schema.type === "boolean") {
        return z.boolean();
    }
    else if (schema.type === "array") {
        return z.array(jsonSchemaToZod(schema.items));
    }
    return z.any();
}
// Function to convert JSON Schema to inputSchema format
function createInputSchema(schema) {
    const inputSchema = {};
    if (schema.type === "object" && schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
            let zodType = jsonSchemaToZod(prop);
            // Add description if available
            if (prop.description) {
                zodType = zodType.describe(prop.description);
            }
            // Check if this property is required
            if (!schema.required || !schema.required.includes(key)) {
                zodType = zodType.optional();
            }
            inputSchema[key] = zodType;
        }
    }
    return inputSchema;
}
// Dynamically register tools from configuration
for (const [toolName, toolConfig] of Object.entries(tools)) {
    const inputSchema = createInputSchema(toolConfig.inputSchema);
    debug(`Registering tool: ${toolName} -> ${toolConfig.functionName}`);
    server.registerTool(toolName, {
        title: toolConfig.title,
        description: toolConfig.description,
        inputSchema: inputSchema,
    }, async (args) => {
        debug(`Tool called: ${toolName} with args:`, args);
        try {
            // Make RPC call to parent app
            const result = await rpcClient.request(toolConfig.functionName, [
                contextToken,
                args,
            ]);
            debug(`Tool ${toolName} response:`, result);
            if (typeof result === "string") {
                return { content: [{ type: "text", text: result }] };
            }
            else if (Array.isArray(result)) {
                return { content: result };
            }
            else if (result && typeof result === "object" && "type" in result) {
                return { content: [result] };
            }
            else {
                return { content: [{ type: "text", text: JSON.stringify(result) }] };
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            debug(`Tool ${toolName} error:`, errorMessage);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error calling ${toolConfig.functionName}: ${errorMessage}`,
                    },
                ],
            };
        }
    });
}
// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
debug("Starting MCP server with stdio transport");
await server.connect(transport);
debug("MCP server connected and ready");
//# sourceMappingURL=index.js.map