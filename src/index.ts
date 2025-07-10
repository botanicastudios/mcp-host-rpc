import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JSONRPCClient } from "json-rpc-2.0";
import * as net from "net";

// Parse environment variables
const authToken = process.env.AUTH_TOKEN;
const toolsConfig = process.env.TOOLS;
const pipeAddress = process.env.PIPE;

if (!authToken) {
  throw new Error("AUTH_TOKEN environment variable is required");
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
} catch (error) {
  throw new Error("TOOLS must be valid JSON");
}

// Create RPC client
let rpcClient: JSONRPCClient;
const socket = net.createConnection(pipeAddress);

socket.on("connect", () => {
  console.error("Connected to parent app via pipe");
});

socket.on("error", (error) => {
  console.error("Socket error:", error);
  process.exit(1);
});

socket.on("close", () => {
  console.error("Socket connection closed");
  process.exit(1);
});

const send = (data: string) => {
  if (socket.writable) {
    socket.write(data + "\n");
  } else {
    console.error("Socket not writable");
  }
};

rpcClient = new JSONRPCClient(send);

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

  server.registerTool(
    toolName,
    {
      title: toolConfig.title,
      description: toolConfig.description,
      inputSchema: inputSchema,
    },
    async (args) => {
      try {
        // Make RPC call to parent app
        const result = await rpcClient.request(toolConfig.functionName, [
          authToken,
          args,
        ]);
        return { content: result };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
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
await server.connect(transport);
