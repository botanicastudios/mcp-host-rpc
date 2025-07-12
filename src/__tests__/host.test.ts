import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMcpHost, McpHost } from "../host.js";

describe("McpHost", () => {
  let host: any;

  beforeEach(() => {
    host = createMcpHost({ start: false });

    // Register a test tool for the tests
    host.registerTool(
      "test-tool",
      {
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
      },
      async (context: any, args: any) => {
        return { result: "test", context, args };
      }
    );
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
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext
      );

      expect(config).toHaveProperty("test-server");
      expect(config["test-server"]).toEqual({
        type: "stdio",
        command: "npx -y @botanicastudios/mcp-host-rpc",
        args: [],
        env: expect.objectContaining({
          CONTEXT_TOKEN: expect.any(String),
          PIPE: expect.any(String),
          TOOLS: expect.any(String),
        }),
      });
    });

    it("should use custom command when provided as string", () => {
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext,
        { command: "node ./my-server.js" }
      );

      expect(config["test-server"].command).toBe("node ./my-server.js");
      expect(config["test-server"].args).toEqual([]);
    });

    it("should use custom command when provided as array", () => {
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext,
        { command: ["python", "-m", "my_server", "--verbose"] }
      );

      expect(config["test-server"].command).toBe("python");
      expect(config["test-server"].args).toEqual([
        "-m",
        "my_server",
        "--verbose",
      ]);
    });

    it("should handle single element command array", () => {
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext,
        { command: ["node"] }
      );

      expect(config["test-server"].command).toBe("node");
      expect(config["test-server"].args).toEqual([]);
    });

    it("should append additional args to command array args", () => {
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext,
        {
          command: ["python", "-m", "server"],
          args: ["--debug", "--port", "3000"],
        }
      );

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
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext,
        {
          command: "node ./server.js",
          args: ["--verbose", "--config", "./config.json"],
        }
      );

      expect(config["test-server"].command).toBe("node ./server.js");
      expect(config["test-server"].args).toEqual([
        "--verbose",
        "--config",
        "./config.json",
      ]);
    });

    it("should only use args when no command is provided", () => {
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext,
        { args: ["--production", "--timeout", "30"] }
      );

      expect(config["test-server"].command).toBe(
        "npx -y @botanicastudios/mcp-host-rpc"
      );
      expect(config["test-server"].args).toEqual([
        "--production",
        "--timeout",
        "30",
      ]);
    });

    it("should handle empty command array", () => {
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext,
        { command: [] }
      );

      // Should fall back to default since command array is empty
      expect(config["test-server"].command).toBe(
        "npx -y @botanicastudios/mcp-host-rpc"
      );
      expect(config["test-server"].args).toEqual([]);
    });

    it("should handle empty args array", () => {
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext,
        {
          command: "custom-command",
          args: [],
        }
      );

      expect(config["test-server"].command).toBe("custom-command");
      expect(config["test-server"].args).toEqual([]);
    });

    it("should preserve environment variables with custom options", () => {
      const config = host.getMCPServerConfig(
        "test-server",
        testTools,
        testContext,
        { command: "custom-command", args: ["--flag"] }
      );

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
        const config = host.getMCPServerConfig(
          "test-server",
          testTools,
          testContext,
          options
        );

        expect(
          config["test-server"].command,
          `Failed for scenario: ${name}`
        ).toBe(expectedCommand);
        expect(
          config["test-server"].args,
          `Failed for scenario: ${name}`
        ).toEqual(expectedArgs);
      });
    });

    it("should maintain server configuration structure", () => {
      const config = host.getMCPServerConfig(
        "my-custom-server",
        testTools,
        testContext,
        { command: ["python", "server.py"], args: ["--debug"] }
      );

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

      host.registerTool(
        "zod-tool",
        {
          title: "Zod Tool",
          description: "A tool with Zod schema",
          functionName: "zodFunction",
          inputSchema: mockZodSchema,
        },
        async (context: any, args: any) => {
          return { result: "zod-test", context, args };
        }
      );

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

      host.registerTool(
        "complex-zod-tool",
        {
          title: "Complex Zod Tool",
          description: "A tool with complex Zod schema",
          functionName: "complexZodFunction",
          inputSchema: mockComplexZodSchema,
        },
        async (context: any, args: any) => {
          return { result: "complex-zod-test", context, args };
        }
      );

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

      host.registerTool(
        "json-schema-tool",
        {
          title: "JSON Schema Tool",
          description: "A tool with regular JSON schema",
          functionName: "jsonSchemaFunction",
          inputSchema: jsonSchema,
        },
        async (context: any, args: any) => {
          return { result: "json-schema-test", context, args };
        }
      );

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

      host.registerTool(
        "defaults-zod-tool",
        {
          title: "Defaults Zod Tool",
          description: "A tool with Zod schema with defaults",
          functionName: "defaultsZodFunction",
          inputSchema: mockZodWithDefaults,
        },
        async (context: any, args: any) => {
          return { result: "defaults-test", context, args };
        }
      );

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
