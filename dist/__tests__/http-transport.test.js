import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpHost } from "../host.js";
import http from "http";
describe("HTTP Transport", () => {
    let host;
    let server;
    const port = 3456;
    beforeEach(async () => {
        // Create host with HTTP transport
        host = new McpHost({
            transport: "http",
            httpPath: "/mcp-rpc",
            httpUrl: `http://localhost:${port}/mcp-rpc`,
            debug: false,
        });
        // Register test tool
        host.registerTool("test-http", {
            title: "Test HTTP Tool",
            description: "Tool for testing HTTP transport",
            functionName: "testHttpFunction",
            inputSchema: {
                type: "object",
                properties: {
                    message: { type: "string" },
                },
                required: ["message"],
            },
        }, async (context, args) => {
            return {
                type: "text",
                text: `Received: ${args.message}, Context: ${JSON.stringify(context)}`,
            };
        });
        // Create simple HTTP server
        server = http.createServer(async (req, res) => {
            if (req.method === "POST" && req.url === "/mcp-rpc") {
                // Parse body
                let body = "";
                req.on("data", (chunk) => (body += chunk.toString()));
                req.on("end", async () => {
                    req.body = JSON.parse(body);
                    await host.handleHttpRequest(req, res);
                });
            }
            else {
                res.writeHead(404);
                res.end();
            }
        });
        await new Promise((resolve) => {
            server.listen(port, () => resolve());
        });
        await host.start();
    });
    afterEach(async () => {
        await host.stop();
        await new Promise((resolve) => {
            server.close(() => resolve());
        });
    });
    describe("constructor", () => {
        it("should require httpPath for HTTP transport", () => {
            expect(() => {
                new McpHost({
                    transport: "http",
                    // Missing httpPath
                });
            }).toThrow("httpPath is required for HTTP transport");
        });
        it("should create host with HTTP transport", () => {
            const httpHost = new McpHost({
                transport: "http",
                httpPath: "/test",
            });
            expect(httpHost).toBeDefined();
        });
    });
    describe("getMCPServerEnvVars", () => {
        it("should return HTTP-specific environment variables", () => {
            const envVars = host.getMCPServerEnvVars(["test-http"], { user: "test" });
            expect(envVars.TRANSPORT_MODE).toBe("http");
            expect(envVars.RPC_API_URL).toBe(`http://localhost:${port}/mcp-rpc`);
            expect(envVars.PIPE).toBeUndefined();
            expect(envVars.CONTEXT_TOKEN).toBeDefined();
            expect(envVars.TOOLS).toBeDefined();
        });
        it("should include DEBUG variable when debug is enabled", () => {
            const debugHost = new McpHost({
                transport: "http",
                httpPath: "/test",
                debug: true,
            });
            const envVars = debugHost.getMCPServerEnvVars([], {});
            expect(envVars.DEBUG).toBe("1");
        });
    });
    describe("handleHttpRequest", () => {
        it("should handle valid HTTP requests", async () => {
            const context = { user: "alice" };
            const token = host.createJWT(context);
            const response = await fetch(`http://localhost:${port}/mcp-rpc`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "testHttpFunction",
                    params: [token, { message: "Hello HTTP" }],
                    id: 1,
                }),
            });
            const result = await response.json();
            expect(result.jsonrpc).toBe("2.0");
            expect(result.id).toBe(1);
            expect(result.result).toBeDefined();
        });
        it("should reject requests without authorization header", async () => {
            const response = await fetch(`http://localhost:${port}/mcp-rpc`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "testHttpFunction",
                    params: [{}, { message: "No auth" }],
                    id: 1,
                }),
            });
            const result = await response.json();
            expect(result.error).toBeDefined();
            expect(result.error.message).toContain("authorization header");
        });
        it("should reject requests with invalid JWT", async () => {
            const response = await fetch(`http://localhost:${port}/mcp-rpc`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer invalid-token",
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "testHttpFunction",
                    params: ["invalid-token", { message: "Bad token" }],
                    id: 1,
                }),
            });
            const result = await response.json();
            expect(result.error).toBeDefined();
        });
        it("should handle malformed JSON", async () => {
            const token = host.createJWT({ user: "test" });
            const response = await fetch(`http://localhost:${port}/mcp-rpc`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: "{ invalid json",
            });
            const result = await response.json();
            expect(result.error).toBeDefined();
            expect(result.error.code).toBe(-32700); // Parse error
        });
        it("should throw error when used with socket transport", async () => {
            const socketHost = new McpHost({
                transport: "socket",
            });
            await expect(socketHost.handleHttpRequest({}, {})).rejects.toThrow("handleHttpRequest can only be used with HTTP transport");
        });
    });
    describe("HTTP vs Socket mode", () => {
        it("should create socket transport by default", () => {
            const socketHost = new McpHost();
            const envVars = socketHost.getMCPServerEnvVars([], {});
            expect(envVars.TRANSPORT_MODE).toBe("socket");
            expect(envVars.PIPE).toBeDefined();
            expect(envVars.RPC_API_URL).toBeUndefined();
        });
        it("should allow switching between transports", () => {
            const socketHost = new McpHost({ transport: "socket" });
            const httpHost = new McpHost({
                transport: "http",
                httpPath: "/rpc"
            });
            const socketEnv = socketHost.getMCPServerEnvVars([], {});
            const httpEnv = httpHost.getMCPServerEnvVars([], {});
            expect(socketEnv.TRANSPORT_MODE).toBe("socket");
            expect(httpEnv.TRANSPORT_MODE).toBe("http");
        });
    });
    describe("getMCPServerConfig", () => {
        it("should include HTTP transport in config", () => {
            const config = host.getMCPServerConfig("http-server", ["test-http"], { app: "test" });
            expect(config["http-server"].env.TRANSPORT_MODE).toBe("http");
            expect(config["http-server"].env.RPC_API_URL).toBeDefined();
            expect(config["http-server"].env.PIPE).toBeUndefined();
        });
    });
});
//# sourceMappingURL=http-transport.test.js.map