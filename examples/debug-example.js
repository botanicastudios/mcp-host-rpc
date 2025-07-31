/**
 * Example demonstrating debug logging functionality
 */

const { createMcpHost } = require("@botanicastudios/mcp-host-rpc");

async function main() {
  // Create host with debug enabled
  const host = createMcpHost({
    debug: true, // This enables debug logging for the host
  });

  // Register a test tool
  host.registerTool(
    "debug-test-tool",
    {
      title: "Debug Test Tool",
      description: "A tool to demonstrate debug logging",
      functionName: "debugTest",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Test message" },
          delay: { type: "number", description: "Processing delay in ms" },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
    async (context, args) => {
      console.log(`[Tool Handler] Received call from user ${context.userId}`);
      console.log(`[Tool Handler] Args:`, args);
      
      if (args.delay) {
        console.log(`[Tool Handler] Waiting ${args.delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, args.delay));
      }
      
      return {
        echo: args.message,
        processedAt: new Date().toISOString(),
        userId: context.userId,
      };
    }
  );

  // Start the server
  const { pipePath } = await host.start();
  console.log("\n=== Debug Example Started ===");
  console.log("Host debug logging is enabled");

  // Create MCP server configuration with debug enabled
  const context = { userId: "debug-user", sessionId: "debug-session" };
  
  // Example 1: Config without debug (default)
  const configNoDebug = host.getMCPServerConfig(
    "example-no-debug",
    ["debug-test-tool"],
    context
  );
  
  console.log("\n1. Config WITHOUT debug:");
  console.log("   DEBUG env var:", configNoDebug["example-no-debug"].env.DEBUG || "undefined");

  // Example 2: Config with debug enabled
  const configWithDebug = host.getMCPServerConfig(
    "example-with-debug",
    ["debug-test-tool"],
    context,
    { debug: true }
  );
  
  console.log("\n2. Config WITH debug:");
  console.log("   DEBUG env var:", configWithDebug["example-with-debug"].env.DEBUG);

  // Example 3: Config with debug and custom command
  const configCustom = host.getMCPServerConfig(
    "example-custom",
    ["debug-test-tool"],
    context,
    { 
      command: "node",
      args: ["custom-bridge.js"],
      debug: true 
    }
  );
  
  console.log("\n3. Config with debug and custom command:");
  console.log("   Command:", configCustom["example-custom"].command);
  console.log("   Args:", configCustom["example-custom"].args);
  console.log("   DEBUG env var:", configCustom["example-custom"].env.DEBUG);

  console.log("\n=== Debug Logging Behavior ===");
  console.log("When DEBUG=1 is set, the bridge process (index.ts) will log:");
  console.log("- Connection events");
  console.log("- Tool registrations");
  console.log("- Tool call requests and responses");
  console.log("- RPC communication details");
  console.log("\nThis helps troubleshoot communication between MCP and your host app.");

  console.log("\n=== Full Configuration Example ===");
  console.log(JSON.stringify(configWithDebug, null, 2));
  
  // Keep the server running
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await host.stop();
    process.exit(0);
  });
}

main().catch(console.error);