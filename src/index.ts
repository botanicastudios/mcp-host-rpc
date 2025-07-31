#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JSONRPCClient } from "json-rpc-2.0";
import * as net from "net";

// Check if debug mode is enabled
const DEBUG = !!process.env.DEBUG;

// Debug logging function
function debug(message: string, ...args: any[]): void {
  if (DEBUG) {
    console.error(`[MCP-RPC-Bridge] ${message}`, ...args);
  }
}

// Parse environment variables
const contextToken = process.env.CONTEXT_TOKEN;
const toolsConfig = process.env.TOOLS;
const pipeAddress = process.env.PIPE;

debug("Starting MCP RPC Bridge");
debug("Debug mode enabled");
debug("Pipe address:", pipeAddress);

if (!contextToken) {
  throw new Error("CONTEXT_TOKEN environment variable is required");
}

if (!toolsConfig) {
  throw new Error("TOOLS environment variable is required");
}

if (!pipeAddress) {
  throw new Error("PIPE environment variable is required");
}

// Parse tools configuration
let tools: Record<string, any>;
try {
  tools = JSON.parse(toolsConfig);
  debug("Loaded tools configuration:", Object.keys(tools));
} catch (error) {
  throw new Error("TOOLS must be valid JSON");
}

// Create RPC client
let rpcClient: JSONRPCClient;
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

const send = (data: string) => {
  if (socket.writable) {
    // Ensure data is properly stringified if it's somehow an object
    const stringData = typeof data === "string" ? data : JSON.stringify(data);
    debug("Sending RPC request:", stringData);
    socket.write(stringData + "\n");
  } else {
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
    } catch (error) {
      debug("Error parsing RPC response:", error);
    }
  }
});

// Create an MCP server
const server = new McpServer({
  name: "rpc-bridge-server",
  version: "1.0.0",
});

// Function to convert JSON Schema to Zod schema
function jsonSchemaToZod(schema: any): z.ZodType<any> {
  if (schema.type === "object") {
    const shape: Record<string, z.ZodType<any>> = {};
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        let zodType = jsonSchemaToZod(prop as any);
        // Add description if available
        if ((prop as any).description) {
          zodType = zodType.describe((prop as any).description);
        }
        // Check if this property is required
        if (!schema.required || !schema.required.includes(key)) {
          zodType = zodType.optional();
        }
        shape[key] = zodType;
      }
    }
    return z.object(shape);
  } else if (schema.type === "string") {
    return z.string();
  } else if (schema.type === "number") {
    return z.number();
  } else if (schema.type === "boolean") {
    return z.boolean();
  } else if (schema.type === "array") {
    return z.array(jsonSchemaToZod(schema.items));
  }
  return z.any();
}

// Function to convert JSON Schema to inputSchema format
function createInputSchema(schema: any): Record<string, z.ZodType<any>> {
  const inputSchema: Record<string, z.ZodType<any>> = {};

  if (schema.type === "object" && schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      let zodType = jsonSchemaToZod(prop as any);
      // Add description if available
      if ((prop as any).description) {
        zodType = zodType.describe((prop as any).description);
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

  server.registerTool(
    toolName,
    {
      title: toolConfig.title,
      description: toolConfig.description,
      inputSchema: inputSchema,
    },
    async (args) => {
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
        } else if (Array.isArray(result)) {
          return { content: result };
        } else if (result && typeof result === "object" && "type" in result) {
          return { content: [result] };
        } else {
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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
    }
  );
}

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
debug("Starting MCP server with stdio transport");
await server.connect(transport);
debug("MCP server connected and ready");
