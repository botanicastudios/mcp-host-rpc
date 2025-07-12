#!/usr/bin/env node

/**
 * Zod Schema Example
 *
 * This example demonstrates using Zod schemas with registerTool:
 * 1. Pass Zod schemas directly to registerTool (automatic conversion)
 * 2. Type-safe runtime validation with detailed error messages
 * 3. Complex validation scenarios with nested objects and constraints
 * 4. Simplified developer experience
 */

import { createMcpHost } from "../dist/host.js";
import { z } from "zod";

console.log("🧪 MCP Host Example - Zod Schema Validation\n");

// Create and auto-start the host
const host = createMcpHost({
  authToken: "zod-auto-example-secret-key",
  start: true,
  debug: true,
});

// Example 1: Simple calculator - pass Zod schema directly!
const CalculatorSchema = z.object({
  operation: z
    .enum(["add", "subtract", "multiply", "divide"])
    .describe("Mathematical operation to perform"),
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});

host.registerTool(
  "calculator",
  {
    title: "Calculator",
    description: "Perform mathematical operations",
    functionName: "calculate",
    inputSchema: CalculatorSchema, // ✨ Pass Zod schema directly!
  },
  async (context, args) => {
    console.log(`[Calculator] Called with context:`, context);

    // Runtime validation with Zod
    try {
      const validatedArgs = CalculatorSchema.parse(args);
      console.log(`[Calculator] Validated args:`, validatedArgs);

      const { operation, a, b } = validatedArgs;
      let result;

      switch (operation) {
        case "add":
          result = a + b;
          break;
        case "subtract":
          result = a - b;
          break;
        case "multiply":
          result = a * b;
          break;
        case "divide":
          if (b === 0) {
            throw new Error("Division by zero is not allowed");
          }
          result = a / b;
          break;
      }

      return {
        result,
        calculation: `${a} ${operation} ${b} = ${result}`,
        user: context.userId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          error: "Validation failed",
          details: error.errors,
          timestamp: new Date().toISOString(),
        };
      }
      throw error;
    }
  }
);

// Example 2: Task creation with complex nested schema
const TaskSchema = z
  .object({
    title: z.string().min(1, "Title is required").describe("Task title"),
    description: z.string().optional().describe("Task description"),
    priority: z
      .enum(["low", "medium", "high"])
      .default("medium")
      .describe("Task priority"),
    tags: z.array(z.string()).default([]).describe("Task tags"),
    assignees: z
      .array(
        z.object({
          id: z.string().describe("User ID"),
          name: z.string().describe("User name"),
          role: z
            .enum(["developer", "designer", "manager"])
            .describe("User role"),
        })
      )
      .optional()
      .describe("Assigned users"),
    dueDate: z.string().optional().describe("Due date in ISO format"),
  })
  .refine((data) => data.title.length > 0, {
    message: "Title cannot be empty",
    path: ["title"],
  });

host.registerTool(
  "create-task",
  {
    title: "Create Task",
    description: "Create a new task with validation",
    functionName: "createTask",
    inputSchema: TaskSchema, // ✨ Complex Zod schema - auto-converted!
  },
  async (context, args) => {
    console.log(`[TaskCreator] Called with context:`, context);

    try {
      const validatedTask = TaskSchema.parse(args);
      console.log(`[TaskCreator] Validated task:`, validatedTask);

      // Check permissions
      if (!context.permissions.includes("create")) {
        throw new Error("Insufficient permissions to create tasks");
      }

      // Simulate task creation
      const taskId = `task-${Date.now()}`;

      return {
        success: true,
        task: {
          id: taskId,
          ...validatedTask,
          createdBy: context.userId,
          createdAt: new Date().toISOString(),
          status: "pending",
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          error: "Task validation failed",
          details: error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message,
            code: err.code,
          })),
        };
      }
      throw error;
    }
  }
);

// Example 3: User management with string constraints and defaults
const UserSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be less than 20 characters")
    .describe("Username"),
  email: z.string().email("Invalid email format").describe("Email address"),
  age: z.number().min(13, "Must be at least 13 years old").optional(),
  role: z
    .enum(["user", "admin", "moderator"])
    .default("user")
    .describe("User role"),
  isActive: z.boolean().default(true).describe("Whether user is active"),
  metadata: z
    .object({
      preferences: z
        .object({
          theme: z.enum(["light", "dark"]).default("light"),
          notifications: z.boolean().default(true),
        })
        .optional(),
      lastLogin: z.string().optional(),
    })
    .optional(),
});

host.registerTool(
  "create-user",
  {
    title: "Create User",
    description: "Create a new user with comprehensive validation",
    functionName: "createUser",
    inputSchema: UserSchema, // ✨ Auto-converts constraints and defaults!
  },
  async (context, args) => {
    console.log(`[UserCreator] Called with context:`, context);

    try {
      const validatedUser = UserSchema.parse(args);
      console.log(`[UserCreator] Validated user:`, validatedUser);

      // Admin permission check
      if (!context.permissions.includes("admin")) {
        throw new Error("Only admins can create users");
      }

      const userId = `user-${Date.now()}`;

      return {
        success: true,
        user: {
          id: userId,
          ...validatedUser,
          createdBy: context.userId,
          createdAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          error: "User validation failed",
          details: error.errors.map((err) => ({
            field: err.path.join("."),
            message: err.message,
            received: err.received,
          })),
        };
      }
      throw error;
    }
  }
);

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🛑 Shutting down Zod example...");

  const forceExitTimeout = setTimeout(() => {
    console.log("⚠️  Force exit timeout reached!");
    process.exit(1);
  }, 3000);

  try {
    await host.stop();
    console.log("✅ Server stopped successfully");
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
  }

  clearTimeout(forceExitTimeout);
  console.log("✨ Zod example completed!");
  process.exit(0);
}

// Event listeners
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Demo the auto-conversion after startup
setTimeout(async () => {
  try {
    console.log("\n🎯 Testing Zod Schema Validation...\n");

    console.log("📋 Tools registered successfully with Zod schema validation!");
    console.log("🔧 Available tools:", Object.keys(host.toolsConfig || {}));

    // Generate different user contexts
    const userEnvVars = host.getMCPServerEnvVars(["calculator", "create-task"], {
      userId: "user-456",
      role: "user",
      permissions: ["read", "create", "calculate"],
    });

    const adminEnvVars = host.getMCPServerEnvVars(["calculator", "create-task", "create-user"], {
      userId: "admin",
      role: "admin",
      permissions: ["read", "write", "create", "admin", "calculate"],
    });

    console.log("\n🔑 JWT Tokens Generated:");
    console.log(`User Token: ${userEnvVars.CONTEXT_TOKEN.substring(0, 50)}...`);
    console.log(`Admin Token: ${adminEnvVars.CONTEXT_TOKEN.substring(0, 50)}...`);

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
            // Test 1: Calculator Tool (Valid Input)
            console.log("\n📊 Test 1: Calculator Tool (Valid Input - Zod validation)");
            console.log("   Context: userId=user-456, permissions=[read,create,calculate]");
            console.log("   Calling: calculate(multiply, 6, 7)");

            const calcResult = await rpcClient.request("calculate", [
              userEnvVars.CONTEXT_TOKEN,
              { operation: "multiply", a: 6, b: 7 },
            ]);

            console.log("   ✅ Result:", JSON.stringify(calcResult, null, 4));

            // Test 2: Calculator Tool (Invalid Input - Zod validation)
            console.log("\n🚫 Test 2: Calculator Tool (Invalid Input - Zod validation)");
            console.log("   Context: userId=user-456, permissions=[read,create,calculate]");
            console.log("   Calling: calculate(invalid operation, string, 7)");

            const calcError = await rpcClient.request("calculate", [
              userEnvVars.CONTEXT_TOKEN,
              { operation: "invalid", a: "not a number", b: 7 },
            ]);
            console.log("   ✅ Validation errors handled:", JSON.stringify(calcError, null, 4));

            // Test 3: Create Task Tool (Valid Complex Input)
            console.log("\n📋 Test 3: Create Task Tool (Valid Complex Input - Zod validation)");
            console.log("   Context: userId=user-456, permissions=[read,create,calculate]");
            console.log("   Calling: createTask with nested assignees");

            const taskResult = await rpcClient.request("createTask", [
              userEnvVars.CONTEXT_TOKEN,
              {
                title: "Implement auto-conversion",
                description: "Add automatic Zod to JSON Schema conversion",
                priority: "high",
                tags: ["feature", "zod"],
                assignees: [
                  {
                    id: "dev-123",
                    name: "Jane Doe",
                    role: "developer"
                  }
                ],
                dueDate: "2024-12-31T23:59:59.000Z"
              },
            ]);

            console.log("   ✅ Result:", JSON.stringify(taskResult, null, 4));

            // Test 4: Create User Tool (Admin Permission Required)
            console.log("\n👤 Test 4: Create User Tool (Admin Context - Complex Zod validation)");
            console.log("   Context: userId=admin, permissions=[read,write,create,admin,calculate]");
            console.log("   Calling: createUser with nested metadata");

            const userResult = await rpcClient.request("createUser", [
              adminEnvVars.CONTEXT_TOKEN,
              {
                username: "john_doe",
                email: "john@example.com",
                age: 25,
                role: "user",
                metadata: {
                  preferences: {
                    theme: "dark",
                    notifications: false
                  }
                }
              },
            ]);

            console.log("   ✅ Result:", JSON.stringify(userResult, null, 4));

            // Test 5: Create User Tool (Insufficient Permissions)
            console.log("\n🚫 Test 5: Create User Tool (User Context - Permission Check)");
            console.log("   Context: userId=user-456, permissions=[read,create,calculate]");
            console.log("   Calling: createUser (should fail due to permissions)");

            try {
              const userError = await rpcClient.request("createUser", [
                userEnvVars.CONTEXT_TOKEN,
                {
                  username: "jane_doe",
                  email: "jane@example.com"
                },
              ]);
              console.log("   ❌ Should have failed:", JSON.stringify(userError, null, 4));
            } catch (error) {
              console.log("   ✅ Expected permission error:", error.message);
            }

            // Test 6: Create User Tool (Validation Errors)
            console.log("\n💡 Test 6: Create User Tool (Validation Errors - Zod constraints)");
            console.log("   Context: userId=admin, permissions=[read,write,create,admin,calculate]");
            console.log("   Calling: createUser with invalid data (short username, bad email, too young)");

            const validationResult = await rpcClient.request("createUser", [
              adminEnvVars.CONTEXT_TOKEN,
              {
                username: "x", // Too short
                email: "invalid-email", // Invalid format
                age: 10 // Too young
              },
            ]);

            console.log("   ✅ Validation errors handled gracefully:", JSON.stringify(validationResult, null, 4));

            console.log("\n🎉 All Zod schema validation tests completed successfully!");

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

      console.log("\n🔍 Zod Schema Conversion Examples:");
      console.log("\n📊 Calculator Input Schema (converted from Zod):");
      console.log(JSON.stringify(host.toolsConfig?.calculator?.inputSchema, null, 2));

      console.log("\n📋 Task Input Schema (converted from Zod):");
      console.log(JSON.stringify(host.toolsConfig?.["create-task"]?.inputSchema, null, 2));

      console.log("\n👤 User Input Schema (converted from Zod):");
      console.log(JSON.stringify(host.toolsConfig?.["create-user"]?.inputSchema, null, 2));

    } catch (error) {
      console.error("❌ Failed to test tools:", error);
    }

    // Generate MCP server configurations
    const userConfig = host.getMCPServerConfig(
      "zod-user",
      ["calculator", "create-task"],
      {
        userId: "user-456",
        role: "user",
        permissions: ["read", "create", "calculate"],
      }
    );

    const adminConfig = host.getMCPServerConfig(
      "zod-admin",
      ["calculator", "create-task", "create-user"],
      {
        userId: "admin",
        role: "admin",
        permissions: ["read", "write", "create", "admin", "calculate"],
      }
    );

    console.log("\n📋 Generated MCP Server Configurations:");
    console.log("   (Zod schemas automatically converted to JSON Schema)\n");

    console.log("🔵 User Config (calculator, create-task):");
    console.log(JSON.stringify(userConfig, null, 2));

    console.log("\n🔴 Admin Config (calculator, create-task, create-user):");
    console.log(JSON.stringify(adminConfig, null, 2));

    console.log("\n✨ Zod Schema Benefits Demonstrated:");
    console.log("   ✅ Pass Zod schemas directly to registerTool()");
    console.log("   ✅ Automatic JSON Schema conversion");
    console.log("   ✅ Type-safe runtime validation with detailed errors");
    console.log("   ✅ Rich error messages with field paths");
    console.log("   ✅ String constraints (min/max length, email validation)");
    console.log("   ✅ Complex nested objects and arrays");
    console.log("   ✅ Default values and optional fields");
    console.log("   ✅ Custom validation rules with .refine()");
    console.log("   ✅ Permission-based tool access control");
    console.log("   ✅ Actual tool execution with context verification");
    console.log("   ✅ Graceful error handling and user feedback");

    console.log("\n🎯 Next Steps:");
    console.log("  1. Copy the MCP config to your claude_desktop_config.json");
    console.log("  2. Start Claude Desktop");
    console.log("  3. The tools will be available with Zod validation and context-based scoping!");

    // Graceful shutdown after demo
    setTimeout(gracefulShutdown, 2000);
  } catch (error) {
    console.error("❌ Demo error:", error);
    await gracefulShutdown();
  }
}, 1000);
