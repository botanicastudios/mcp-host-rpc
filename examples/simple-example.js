#!/usr/bin/env node

/**
 * Simple MCP Host Example
 *
 * This example demonstrates the core functionality:
 * 1. Creating an MCP host with context-based authentication
 * 2. Registering tools with the new API
 * 3. Generating MCP server configurations
 */

import { createMcpHost } from "../dist/host.js";

console.log("🚀 MCP Host Example - Core Functionality\n");

// Create and auto-start the host
const host = createMcpHost({
  secret: "example-secret-key-12345",
  start: true,
  debug: true,
});

// Register an addition tool
host.registerTool(
  "add",
  {
    title: "Add Numbers",
    description: "Add two numbers together",
    functionName: "addNumbers",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
      additionalProperties: false,
    },
  },
  async (context, args) => {
    console.log(`[Handler] Addition called with context:`, context);
    console.log(`[Handler] Adding ${args.a} + ${args.b}`);

    const result = args.a + args.b;

    return {
      result: result,
      calculation: `${args.a} + ${args.b} = ${result}`,
      user: context.userId,
      timestamp: new Date().toISOString(),
    };
  }
);

// Register an echo tool
host.registerTool(
  "echo",
  {
    title: "Echo Message",
    description: "Echo a message with context information",
    functionName: "echoMessage",
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
    console.log(`[Handler] Echo called with context:`, context);

    return {
      echo: args.message,
      user: context.userId,
      permissions: context.permissions,
      timestamp: new Date().toISOString(),
    };
  }
);

// Shutdown handling
let isShuttingDown = false;
let mainTimeout;

async function gracefulShutdown() {
  if (isShuttingDown) {
    console.log("⏳ Shutdown already in progress...");
    return;
  }

  isShuttingDown = true;
  console.log("\n🛑 Shutting down gracefully...");

  // Clear any pending timers
  if (mainTimeout) clearTimeout(mainTimeout);

  // Set force exit timeout
  const forceExitTimeout = setTimeout(() => {
    console.log("⚠️  Force exit timeout reached!");
    process.exit(1);
  }, 3000); // 3 second force exit

  try {
    await host.stop();
    console.log("✅ Server stopped successfully");
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
  }

  clearTimeout(forceExitTimeout);
  console.log("✨ Example completed successfully!");
  process.exit(0);
}

// Wait for server to start, then demonstrate actual tool execution
mainTimeout = setTimeout(async () => {
  try {
    console.log("\n🧪 Testing JWT Context-Based Tool Execution...\n");

    // Generate different user contexts
    const userEnvVars = host.getMCPServerEnvVars(["add", "echo"], {
      userId: "user-123",
      role: "user",
      permissions: ["read", "calculate"],
    });

    const adminEnvVars = host.getMCPServerEnvVars(["add", "echo"], {
      userId: "admin",
      role: "admin",
      permissions: ["read", "write", "admin", "calculate"],
    });

    console.log("🔑 JWT Tokens Generated:");
    console.log(`User Token: ${userEnvVars.CONTEXT_TOKEN.substring(0, 50)}...`);
    console.log(
      `Admin Token: ${adminEnvVars.CONTEXT_TOKEN.substring(0, 50)}...`
    );

    // Test actual tool execution with context
    try {
      const { JSONRPCClient } = await import("json-rpc-2.0");
      const net = await import("net");

      // Connect to our host's RPC server
      const socket = net.createConnection(userEnvVars.PIPE);
      let isConnected = false;

      await new Promise((resolve, reject) => {
        const cleanup = () => {
          if (isConnected) {
            socket.destroy();
            isConnected = false;
          }
        };

        // Set connection timeout
        const connectionTimeout = setTimeout(() => {
          cleanup();
          reject(new Error("Connection timeout"));
        }, 5000);

        socket.on("connect", async () => {
          isConnected = true;
          clearTimeout(connectionTimeout);
          console.log("\n✅ Connected to RPC server");

          const send = (data) => {
            if (socket.writable) {
              socket.write(JSON.stringify(data) + "\n");
            }
          };

          const rpcClient = new JSONRPCClient(send);

          // Handle incoming data
          socket.on("data", (data) => {
            const lines = data
              .toString()
              .split("\n")
              .filter((line) => line.trim());
            for (const line of lines) {
              try {
                const response = JSON.parse(line);
                rpcClient.receive(response);
              } catch (error) {
                console.log("Failed to parse response:", line);
              }
            }
          });

          try {
            // Test 1: Addition tool with user context
            console.log("\n🧮 Test 1: Addition Tool (User Context)");
            console.log(
              "   Context: userId=user-123, permissions=[read,calculate]"
            );
            console.log("   Calling: addNumbers(15, 27)");

            const userAddResult = await rpcClient.request("addNumbers", [
              userEnvVars.CONTEXT_TOKEN,
              { a: 15, b: 27 },
            ]);

            console.log(
              "   ✅ Result:",
              JSON.stringify(userAddResult, null, 4)
            );

            // Test 2: Echo tool with user context
            console.log("\n📢 Test 2: Echo Tool (User Context)");
            console.log(
              "   Context: userId=user-123, permissions=[read,calculate]"
            );
            console.log("   Calling: echoMessage('Hello from user context!')");

            const userEchoResult = await rpcClient.request("echoMessage", [
              userEnvVars.CONTEXT_TOKEN,
              { message: "Hello from user context!" },
            ]);

            console.log(
              "   ✅ Result:",
              JSON.stringify(userEchoResult, null, 4)
            );

            // Test 3: Same tools with admin context
            console.log("\n👑 Test 3: Addition Tool (Admin Context)");
            console.log(
              "   Context: userId=admin, permissions=[read,write,admin,calculate]"
            );
            console.log("   Calling: addNumbers(100, 200)");

            const adminAddResult = await rpcClient.request("addNumbers", [
              adminEnvVars.CONTEXT_TOKEN,
              { a: 100, b: 200 },
            ]);

            console.log(
              "   ✅ Result:",
              JSON.stringify(adminAddResult, null, 4)
            );

            console.log(
              "\n🎉 All tools executed successfully with context verification!"
            );

            cleanup();
            resolve();
          } catch (error) {
            console.error("❌ RPC Error:", error);
            cleanup();
            reject(error);
          }
        });

        socket.on("error", (error) => {
          cleanup();
          reject(error);
        });

        socket.on("close", () => {
          cleanup();
        });
      });

      // Show the generated MCP configs
      console.log("\n📋 Generated MCP Server Configurations:\n");

      const userConfig = host.getMCPServerConfig("user-server", ["add"], {
        userId: "user-123",
        role: "user",
        permissions: ["read", "calculate"],
      });

      const adminConfig = host.getMCPServerConfig(
        "admin-server",
        ["add", "echo"],
        {
          userId: "admin",
          role: "admin",
          permissions: ["read", "write", "admin", "calculate"],
        }
      );

      console.log("👤 User Config (limited to addition tool):");
      console.log(JSON.stringify(userConfig, null, 2));

      console.log("\n👑 Admin Config (all tools):");
      console.log(JSON.stringify(adminConfig, null, 2));

      console.log("\n💡 Key Features Demonstrated:");
      console.log("  ✅ JWT context-based authentication");
      console.log(
        "  ✅ Tool registration: registerTool(name, properties, handler)"
      );
      console.log("  ✅ Handler signature: async (context, args) => {}");
      console.log("  ✅ Automatic JWT verification and context extraction");
      console.log("  ✅ User-scoped tool execution with verified context");
      console.log("  ✅ Different contexts for different users/roles");
      console.log("  ✅ MCP server config generation");
      console.log("  ✅ Tool subsets per user role");
      console.log("  ✅ Ready for claude_desktop_config.json");

      console.log("\n🎯 Next Steps:");
      console.log(
        "  1. Copy the MCP config to your claude_desktop_config.json"
      );
      console.log("  2. Start Claude Desktop");
      console.log(
        "  3. The tools will be available with context-based scoping!"
      );
    } catch (error) {
      console.error("❌ Failed to test tools:", error);
    }

    // Schedule graceful shutdown
    setTimeout(gracefulShutdown, 2000);
  } catch (error) {
    console.error("❌ Example failed:", error);
    await gracefulShutdown();
  }
}, 1000);

// Graceful shutdown handlers
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("💥 Uncaught exception:", error);
  gracefulShutdown();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("💥 Unhandled rejection at:", promise, "reason:", reason);
  gracefulShutdown();
});
