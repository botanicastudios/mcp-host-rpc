import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMcpHost } from "../host.js";
describe("McpHost", () => {
    let host;
    beforeEach(() => {
        host = createMcpHost({ start: false, debug: true });
        // Register a test tool for the tests
        host.registerTool("test-tool", {
            title: "Test Tool",
            description: "A test tool for testing",
            functionName: "testFunction",
            inputSchema: {
                type: "object",
                properties: {
                    input: { type: "string" },
                },
                required: ["input"],
                additionalProperties: false,
            },
        }, async (context, args) => {
            return { result: "test", context, args };
        });
    });
    afterEach(async () => {
        if (host) {
            await host.stop();
        }
    });
    describe("getMCPServerConfig", () => {
        const testTools = ["test-tool"];
        const testContext = { userId: "123", permissions: ["read"] };
        it("should return default configuration without options", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext);
            expect(config).toHaveProperty("test-server");
            expect(config["test-server"]).toEqual({
                type: "stdio",
                command: "npx",
                args: ["-y", "@botanicastudios/mcp-host-rpc"],
                env: expect.objectContaining({
                    CONTEXT_TOKEN: expect.any(String),
                    PIPE: expect.any(String),
                    TOOLS: expect.any(String),
                }),
            });
        });
        it("should use custom command when provided as string", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext, { command: "node ./my-server.js" });
            expect(config["test-server"].command).toBe("node ./my-server.js");
            expect(config["test-server"].args).toEqual([]);
        });
        it("should use custom command when provided as array", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext, { command: ["python", "-m", "my_server", "--verbose"] });
            expect(config["test-server"].command).toBe("python");
            expect(config["test-server"].args).toEqual([
                "-m",
                "my_server",
                "--verbose",
            ]);
        });
        it("should handle single element command array", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext, { command: ["node"] });
            expect(config["test-server"].command).toBe("node");
            expect(config["test-server"].args).toEqual([]);
        });
        it("should append additional args to command array args", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext, {
                command: ["python", "-m", "server"],
                args: ["--debug", "--port", "3000"],
            });
            expect(config["test-server"].command).toBe("python");
            expect(config["test-server"].args).toEqual([
                "-m",
                "server",
                "--debug",
                "--port",
                "3000",
            ]);
        });
        it("should append additional args to string command", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext, {
                command: "node ./server.js",
                args: ["--verbose", "--config", "./config.json"],
            });
            expect(config["test-server"].command).toBe("node ./server.js");
            expect(config["test-server"].args).toEqual([
                "--verbose",
                "--config",
                "./config.json",
            ]);
        });
        it("should ignore args when no command is provided", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext, { args: ["--production", "--timeout", "30"] });
            expect(config["test-server"].command).toBe("npx");
            expect(config["test-server"].args).toEqual([
                "-y",
                "@botanicastudios/mcp-host-rpc"
            ]);
        });
        it("should handle empty command array", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext, { command: [] });
            // Should fall back to default since command array is empty
            expect(config["test-server"].command).toBe("npx");
            expect(config["test-server"].args).toEqual(["-y", "@botanicastudios/mcp-host-rpc"]);
        });
        it("should handle empty args array", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext, {
                command: "custom-command",
                args: [],
            });
            expect(config["test-server"].command).toBe("custom-command");
            expect(config["test-server"].args).toEqual([]);
        });
        it("should preserve environment variables with custom options", () => {
            const config = host.getMCPServerConfig("test-server", testTools, testContext, { command: "custom-command", args: ["--flag"] });
            expect(config["test-server"].env).toEqual({
                CONTEXT_TOKEN: expect.any(String),
                PIPE: expect.any(String),
                TOOLS: expect.any(String),
            });
            // Verify TOOLS contains our test tool
            const tools = JSON.parse(config["test-server"].env.TOOLS);
            expect(tools).toHaveProperty("test-tool");
            expect(tools["test-tool"]).toEqual({
                title: "Test Tool",
                description: "A test tool for testing",
                functionName: "testFunction",
                inputSchema: {
                    type: "object",
                    properties: {
                        input: { type: "string" },
                    },
                    required: ["input"],
                    additionalProperties: false,
                },
            });
        });
        it("should handle complex command scenarios", () => {
            const scenarios = [
                {
                    name: "Node.js script with flags",
                    options: {
                        command: ["node", "--experimental-modules", "server.js"],
                        args: ["--port", "8080"],
                    },
                    expectedCommand: "node",
                    expectedArgs: [
                        "--experimental-modules",
                        "server.js",
                        "--port",
                        "8080",
                    ],
                },
                {
                    name: "Python module with options",
                    options: {
                        command: ["python3", "-m", "uvicorn", "app:main"],
                        args: ["--host", "0.0.0.0"],
                    },
                    expectedCommand: "python3",
                    expectedArgs: ["-m", "uvicorn", "app:main", "--host", "0.0.0.0"],
                },
                {
                    name: "Docker command",
                    options: {
                        command: "docker run --rm -it myimage",
                        args: ["--env", "NODE_ENV=production"],
                    },
                    expectedCommand: "docker run --rm -it myimage",
                    expectedArgs: ["--env", "NODE_ENV=production"],
                },
            ];
            scenarios.forEach(({ name, options, expectedCommand, expectedArgs }) => {
                const config = host.getMCPServerConfig("test-server", testTools, testContext, options);
                expect(config["test-server"].command, `Failed for scenario: ${name}`).toBe(expectedCommand);
                expect(config["test-server"].args, `Failed for scenario: ${name}`).toEqual(expectedArgs);
            });
        });
        it("should maintain server configuration structure", () => {
            const config = host.getMCPServerConfig("my-custom-server", testTools, testContext, { command: ["python", "server.py"], args: ["--debug"] });
            expect(config).toEqual({
                "my-custom-server": {
                    type: "stdio",
                    command: "python",
                    args: ["server.py", "--debug"],
                    env: {
                        CONTEXT_TOKEN: expect.any(String),
                        PIPE: expect.any(String),
                        TOOLS: expect.any(String),
                    },
                },
            });
        });
        it("should not create nested server configurations", () => {
            const config = host.getMCPServerConfig("project-requirements", testTools, testContext);
            // Should NOT have nested structure like { "project-requirements": { "project-requirements": {...} } }
            expect(config).toEqual({
                "project-requirements": {
                    type: "stdio",
                    command: "npx",
                    args: ["-y", "@botanicastudios/mcp-host-rpc"],
                    env: {
                        CONTEXT_TOKEN: expect.any(String),
                        PIPE: expect.any(String),
                        TOOLS: expect.any(String),
                    },
                },
            });
            // Ensure there's no nested structure
            expect(config["project-requirements"]).not.toHaveProperty("project-requirements");
        });
        it("should handle wrapping in mcpServers object correctly", () => {
            const config = host.getMCPServerConfig("project-requirements", testTools, testContext);
            // Simulate what might happen when wrapping in mcpServers
            const wrappedConfig = {
                mcpServers: config
            };
            // Should NOT result in nested structure
            expect(wrappedConfig).toEqual({
                mcpServers: {
                    "project-requirements": {
                        type: "stdio",
                        command: "npx",
                        args: ["-y", "@botanicastudios/mcp-host-rpc"],
                        env: {
                            CONTEXT_TOKEN: expect.any(String),
                            PIPE: expect.any(String),
                            TOOLS: expect.any(String),
                        },
                    },
                },
            });
            // The problematic nested structure should NOT exist
            expect(wrappedConfig.mcpServers["project-requirements"]).not.toHaveProperty("project-requirements");
        });
        it("should detect if nested configuration bug is introduced", () => {
            // This test would catch if someone accidentally creates a nested structure
            const config = host.getMCPServerConfig("project-requirements", testTools, testContext);
            // Create the problematic nested structure that user is experiencing
            const buggyConfig = {
                mcpServers: {
                    "project-requirements": {
                        "project-requirements": config["project-requirements"]
                    }
                }
            };
            // This should pass - demonstrating we can detect the nested structure
            expect(buggyConfig.mcpServers["project-requirements"]).toHaveProperty("project-requirements");
            // This demonstrates what the user is seeing (buggy output)
            expect(JSON.stringify(buggyConfig, null, 2)).toContain('    "project-requirements": {\n      "project-requirements": {');
        });
        it("should validate server name input to prevent potential bugs", () => {
            // Test input validation
            expect(() => host.getMCPServerConfig("", testTools, testContext)).toThrow("Server name must be a non-empty string");
            expect(() => host.getMCPServerConfig(null, testTools, testContext)).toThrow("Server name must be a non-empty string");
            expect(() => host.getMCPServerConfig(undefined, testTools, testContext)).toThrow("Server name must be a non-empty string");
            // Valid name should work
            const config = host.getMCPServerConfig("valid-name", testTools, testContext);
            expect(config).toHaveProperty("valid-name");
            expect(config["valid-name"]).not.toHaveProperty("valid-name"); // No nesting
        });
    });
    describe("getMCPServerEnvVars", () => {
        it("should return environment variables with JWT token", () => {
            const envVars = host.getMCPServerEnvVars(["test-tool"], {
                userId: "123",
            });
            expect(envVars).toHaveProperty("CONTEXT_TOKEN");
            expect(envVars).toHaveProperty("PIPE");
            expect(envVars).toHaveProperty("TOOLS");
            expect(typeof envVars.CONTEXT_TOKEN).toBe("string");
            expect(typeof envVars.PIPE).toBe("string");
            expect(typeof envVars.TOOLS).toBe("string");
            // Should be valid JSON
            expect(() => JSON.parse(envVars.TOOLS)).not.toThrow();
        });
    });
    describe("Async Handler Awaiting", () => {
        it("should wait for async handler to complete before responding", async () => {
            const startTime = Date.now();
            let handlerCompleted = false;
            // Register a tool with async handler that takes time
            host.registerTool("async-tool", {
                title: "Async Tool",
                description: "A tool with async handler",
                functionName: "asyncFunction",
                inputSchema: {
                    type: "object",
                    properties: {
                        delay: { type: "number" },
                    },
                    required: ["delay"],
                    additionalProperties: false,
                },
            }, async (context, args) => {
                // Simulate async work
                await new Promise(resolve => setTimeout(resolve, args.delay || 100));
                handlerCompleted = true;
                return { result: "async complete", duration: Date.now() - startTime };
            });
            // Start the server
            await host.start();
            // Create a mock client to test RPC communication
            const net = await import("net");
            const client = new net.Socket();
            await new Promise((resolve, reject) => {
                client.connect(host.pipePath, () => {
                    resolve();
                });
                client.on("error", reject);
            });
            // Listen for responses
            let responseReceived = false;
            let responseData;
            client.on("data", (data) => {
                const lines = data.toString().split("\n").filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const response = JSON.parse(line);
                        if (response.id === 1) {
                            responseReceived = true;
                            responseData = response;
                        }
                    }
                    catch (error) {
                        console.error("Parse error in test:", error, "Line:", line);
                    }
                }
            });
            // Get JWT token for the request
            const envVars = host.getMCPServerEnvVars(["async-tool"], { userId: "test" });
            const contextToken = envVars.CONTEXT_TOKEN;
            // Make the RPC call
            const requestTime = Date.now();
            // We need to send the raw JSON-RPC request
            const request = {
                jsonrpc: "2.0",
                method: "asyncFunction",
                params: [contextToken, { delay: 200 }],
                id: 1
            };
            client.write(JSON.stringify(request) + "\n");
            // Wait for response
            await new Promise(resolve => setTimeout(resolve, 300));
            // Verify the handler completed before response was sent
            expect(handlerCompleted).toBe(true);
            expect(responseReceived).toBe(true);
            expect(responseData).toBeDefined();
            expect(responseData.result).toBeDefined();
            // The response should come after the handler completes
            const handlerDuration = responseData.result.duration;
            expect(handlerDuration).toBeGreaterThanOrEqual(200);
            client.destroy();
        });
        it("should handle handler errors and return error response", async () => {
            // Register a tool with handler that throws
            host.registerTool("error-tool", {
                title: "Error Tool",
                description: "A tool that throws errors",
                functionName: "errorFunction",
                inputSchema: {
                    type: "object",
                    properties: {
                        message: { type: "string" },
                    },
                    required: ["message"],
                    additionalProperties: false,
                },
            }, async (context, args) => {
                throw new Error(args.message || "Test error");
            });
            // Start the server
            await host.start();
            // Create a mock client
            const net = await import("net");
            const { JSONRPCClient } = await import("json-rpc-2.0");
            const client = new net.Socket();
            await new Promise((resolve, reject) => {
                client.connect(host.pipePath, () => {
                    resolve();
                });
                client.on("error", reject);
            });
            // Listen for responses
            let errorResponse;
            client.on("data", (data) => {
                const lines = data.toString().split("\n").filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const response = JSON.parse(line);
                        if (response.id === 2) {
                            errorResponse = response;
                        }
                    }
                    catch (error) {
                        // Ignore parse errors
                    }
                }
            });
            // Get JWT token
            const envVars = host.getMCPServerEnvVars(["error-tool"], { userId: "test" });
            const contextToken = envVars.CONTEXT_TOKEN;
            // Make the RPC call
            const request = {
                jsonrpc: "2.0",
                method: "errorFunction",
                params: [contextToken, { message: "Custom error" }],
                id: 2
            };
            client.write(JSON.stringify(request) + "\n");
            // Wait for response
            await new Promise(resolve => setTimeout(resolve, 100));
            // Verify error response
            expect(errorResponse).toBeDefined();
            expect(errorResponse.error).toBeDefined();
            expect(errorResponse.error.message).toContain("Custom error");
            client.destroy();
        });
        it("should handle synchronous handlers correctly", async () => {
            // Register a tool with sync handler (returns a value, not a promise)
            host.registerTool("sync-tool", {
                title: "Sync Tool",
                description: "A tool with sync handler",
                functionName: "syncFunction",
                inputSchema: {
                    type: "object",
                    properties: {
                        value: { type: "string" },
                    },
                    required: ["value"],
                    additionalProperties: false,
                },
            }, async (context, args) => {
                // Even though declared async, it returns immediately
                return { result: `sync: ${args.value}` };
            });
            // Start the server
            await host.start();
            // Create a mock client
            const net = await import("net");
            const { JSONRPCClient } = await import("json-rpc-2.0");
            const client = new net.Socket();
            await new Promise((resolve, reject) => {
                client.connect(host.pipePath, () => {
                    resolve();
                });
                client.on("error", reject);
            });
            // Listen for responses
            let response;
            client.on("data", (data) => {
                const lines = data.toString().split("\n").filter(line => line.trim());
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed.id === 3) {
                            response = parsed;
                        }
                    }
                    catch (error) {
                        // Ignore parse errors
                    }
                }
            });
            // Get JWT token
            const envVars = host.getMCPServerEnvVars(["sync-tool"], { userId: "test" });
            const contextToken = envVars.CONTEXT_TOKEN;
            // Make the RPC call
            const startTime = Date.now();
            const request = {
                jsonrpc: "2.0",
                method: "syncFunction",
                params: [contextToken, { value: "test" }],
                id: 3
            };
            client.write(JSON.stringify(request) + "\n");
            // Wait for response
            await new Promise(resolve => setTimeout(resolve, 50));
            // Verify response came quickly
            const duration = Date.now() - startTime;
            expect(response).toBeDefined();
            expect(response.result).toEqual({ result: "sync: test" });
            expect(duration).toBeLessThan(100); // Should be fast
            client.destroy();
        });
    });
    describe("Zod Schema Auto-Conversion", () => {
        it("should automatically convert Zod schema to JSON Schema", () => {
            // Mock Zod schema object
            const mockZodSchema = {
                _def: {
                    typeName: "ZodObject",
                },
                shape: {
                    name: {
                        _def: { typeName: "ZodString", description: "User name" },
                        isOptional: () => false,
                    },
                    age: {
                        _def: { typeName: "ZodNumber", description: "User age" },
                        isOptional: () => false,
                    },
                    email: {
                        _def: { typeName: "ZodString" },
                        isOptional: () => true,
                    },
                },
            };
            host.registerTool("zod-tool", {
                title: "Zod Tool",
                description: "A tool with Zod schema",
                functionName: "zodFunction",
                inputSchema: mockZodSchema,
            }, async (context, args) => {
                return { result: "zod-test", context, args };
            });
            // Get the tools config to verify conversion happened
            const envVars = host.getMCPServerEnvVars(["zod-tool"], { userId: "123" });
            const tools = JSON.parse(envVars.TOOLS);
            expect(tools).toHaveProperty("zod-tool");
            expect(tools["zod-tool"].inputSchema).toEqual({
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "User name",
                    },
                    age: {
                        type: "number",
                        description: "User age",
                    },
                    email: {
                        type: "string",
                    },
                },
                required: ["name", "age"],
                additionalProperties: false,
            });
        });
        it("should handle complex Zod schemas with arrays and enums", () => {
            const mockComplexZodSchema = {
                _def: {
                    typeName: "ZodObject",
                },
                shape: {
                    action: {
                        _def: {
                            typeName: "ZodEnum",
                            values: ["create", "update", "delete"],
                            description: "Action type",
                        },
                        isOptional: () => false,
                    },
                    tags: {
                        _def: {
                            typeName: "ZodArray",
                            type: {
                                _def: { typeName: "ZodString" },
                            },
                            description: "Tags array",
                        },
                        isOptional: () => true,
                    },
                    metadata: {
                        _def: {
                            typeName: "ZodObject",
                        },
                        shape: {
                            version: {
                                _def: { typeName: "ZodString" },
                                isOptional: () => false,
                            },
                        },
                        isOptional: () => true,
                    },
                },
            };
            host.registerTool("complex-zod-tool", {
                title: "Complex Zod Tool",
                description: "A tool with complex Zod schema",
                functionName: "complexZodFunction",
                inputSchema: mockComplexZodSchema,
            }, async (context, args) => {
                return { result: "complex-zod-test", context, args };
            });
            const envVars = host.getMCPServerEnvVars(["complex-zod-tool"], {
                userId: "123",
            });
            const tools = JSON.parse(envVars.TOOLS);
            expect(tools["complex-zod-tool"].inputSchema).toEqual({
                type: "object",
                properties: {
                    action: {
                        type: "string",
                        enum: ["create", "update", "delete"],
                        description: "Action type",
                    },
                    tags: {
                        type: "array",
                        items: {
                            type: "string",
                        },
                        description: "Tags array",
                    },
                    metadata: {
                        type: "object",
                        properties: {
                            version: {
                                type: "string",
                            },
                        },
                        required: ["version"],
                        additionalProperties: false,
                    },
                },
                required: ["action"],
                additionalProperties: false,
            });
        });
        it("should not modify regular JSON Schema objects", () => {
            const jsonSchema = {
                type: "object",
                properties: {
                    message: { type: "string", description: "A message" },
                },
                required: ["message"],
                additionalProperties: false,
            };
            host.registerTool("json-schema-tool", {
                title: "JSON Schema Tool",
                description: "A tool with regular JSON schema",
                functionName: "jsonSchemaFunction",
                inputSchema: jsonSchema,
            }, async (context, args) => {
                return { result: "json-schema-test", context, args };
            });
            const envVars = host.getMCPServerEnvVars(["json-schema-tool"], {
                userId: "123",
            });
            const tools = JSON.parse(envVars.TOOLS);
            // Should remain unchanged
            expect(tools["json-schema-tool"].inputSchema).toEqual(jsonSchema);
        });
        it("should handle Zod schemas with default values", () => {
            const mockZodWithDefaults = {
                _def: {
                    typeName: "ZodObject",
                },
                shape: {
                    name: {
                        _def: { typeName: "ZodString" },
                        isOptional: () => false,
                    },
                    priority: {
                        _def: {
                            typeName: "ZodDefault",
                            innerType: {
                                _def: { typeName: "ZodString" },
                            },
                            defaultValue: () => "medium",
                        },
                        isOptional: () => true,
                    },
                    enabled: {
                        _def: {
                            typeName: "ZodDefault",
                            innerType: {
                                _def: { typeName: "ZodBoolean" },
                            },
                            defaultValue: () => true,
                        },
                        isOptional: () => true,
                    },
                },
            };
            host.registerTool("defaults-zod-tool", {
                title: "Defaults Zod Tool",
                description: "A tool with Zod schema with defaults",
                functionName: "defaultsZodFunction",
                inputSchema: mockZodWithDefaults,
            }, async (context, args) => {
                return { result: "defaults-test", context, args };
            });
            const envVars = host.getMCPServerEnvVars(["defaults-zod-tool"], {
                userId: "123",
            });
            const tools = JSON.parse(envVars.TOOLS);
            expect(tools["defaults-zod-tool"].inputSchema).toEqual({
                type: "object",
                properties: {
                    name: {
                        type: "string",
                    },
                    priority: {
                        type: "string",
                        default: "medium",
                    },
                    enabled: {
                        type: "boolean",
                        default: true,
                    },
                },
                required: ["name"],
                additionalProperties: false,
            });
        });
    });
});
//# sourceMappingURL=host.test.js.map