/**
 * Example demonstrating multiple sequential tool calls in the same MCP session
 */

const { createMcpHost } = require("@botanicastudios/mcp-host-rpc");

async function main() {
  // Create host
  const host = createMcpHost({
    debug: true,
  });

  // Track call counts
  let echoCallCount = 0;
  let mathCallCount = 0;

  // Register multiple tools
  host.registerTool(
    "echo-tool",
    {
      title: "Echo Tool",
      description: "Echoes back the input with call count",
      functionName: "echo",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Message to echo" },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
    async (context, args) => {
      echoCallCount++;
      console.log(`[Echo Tool] Call #${echoCallCount} from user ${context.userId}: ${args.message}`);
      return {
        echo: args.message,
        callNumber: echoCallCount,
        userId: context.userId,
      };
    }
  );

  host.registerTool(
    "math-tool",
    {
      title: "Math Tool",
      description: "Performs basic math operations",
      functionName: "calculate",
      inputSchema: {
        type: "object",
        properties: {
          operation: { 
            type: "string", 
            enum: ["add", "subtract", "multiply", "divide"],
            description: "Math operation to perform" 
          },
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" },
        },
        required: ["operation", "a", "b"],
        additionalProperties: false,
      },
    },
    async (context, args) => {
      mathCallCount++;
      console.log(`[Math Tool] Call #${mathCallCount} from user ${context.userId}: ${args.operation}(${args.a}, ${args.b})`);
      
      let result;
      switch (args.operation) {
        case "add":
          result = args.a + args.b;
          break;
        case "subtract":
          result = args.a - args.b;
          break;
        case "multiply":
          result = args.a * args.b;
          break;
        case "divide":
          result = args.a / args.b;
          break;
      }
      
      return {
        operation: args.operation,
        a: args.a,
        b: args.b,
        result,
        callNumber: mathCallCount,
      };
    }
  );

  // Start the server
  const { secret, pipePath } = await host.start();
  console.log("Host started!");
  console.log("Pipe path:", pipePath);

  // Create MCP server configuration
  const context = { userId: "example-user", sessionId: "session-123" };
  const serverConfig = host.getMCPServerConfig(
    "multi-call-example",
    ["echo-tool", "math-tool"],
    context
  );

  console.log("\nMCP Server Config:");
  console.log(JSON.stringify(serverConfig, null, 2));

  console.log("\nServer is running. Each tool call will increment its respective counter.");
  console.log("When you call the same tool multiple times in an MCP session, you'll see the call count increase.");
  
  // Keep the server running
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await host.stop();
    process.exit(0);
  });
}

main().catch(console.error);