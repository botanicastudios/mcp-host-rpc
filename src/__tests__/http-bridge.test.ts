import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { McpHost } from "../host.js";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("MCP Bridge HTTP Mode", () => {
  let host: McpHost;
  let server: http.Server;
  let bridgeProcess: ChildProcess | null = null;
  const port = 3457;

  beforeEach(async () => {
    // Create host with HTTP transport
    host = new McpHost({
      transport: "http",
      httpPath: "/mcp-rpc",
      httpUrl: `http://localhost:${port}/mcp-rpc`,
      debug: false,
    });

    // Register test tool
    host.registerTool(
      "bridge-test",
      {
        title: "Bridge Test Tool",
        description: "Tool for testing bridge HTTP mode",
        functionName: "bridgeTestFunction",
        inputSchema: {
          type: "object",
          properties: {
            value: { type: "number" },
          },
          required: ["value"],
        },
      },
      async (context: any, args: any) => {
        return {
          type: "text",
          text: `Value doubled: ${args.value * 2}`,
        };
      }
    );

    // Create HTTP server
    server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/mcp-rpc") {
        let body = "";
        req.on("data", (chunk) => (body += chunk.toString()));
        req.on("end", async () => {
          (req as any).body = JSON.parse(body);
          await host.handleHttpRequest(req, res);
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(port, () => resolve());
    });

    await host.start();
  });

  afterEach(async () => {
    if (bridgeProcess) {
      bridgeProcess.kill();
      bridgeProcess = null;
    }
    await host.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("should connect via HTTP when TRANSPORT_MODE is http", async () => {
    const envVars = host.getMCPServerEnvVars(["bridge-test"], { test: true });
    
    expect(envVars.TRANSPORT_MODE).toBe("http");
    expect(envVars.RPC_API_URL).toBe(`http://localhost:${port}/mcp-rpc`);
    
    // Verify the bridge can be spawned with HTTP env vars
    const bridgePath = path.join(__dirname, "..", "..", "dist", "index.js");
    
    bridgeProcess = spawn("node", [bridgePath], {
      env: {
        ...process.env,
        ...envVars,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Give the bridge time to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check that the process is still running
    expect(bridgeProcess.killed).toBe(false);
  });

  it("should include all required environment variables", () => {
    const context = { userId: "test-user", role: "admin" };
    const envVars = host.getMCPServerEnvVars(["bridge-test"], context);

    // Check all required vars are present
    expect(envVars.TRANSPORT_MODE).toBe("http");
    expect(envVars.RPC_API_URL).toBeDefined();
    expect(envVars.CONTEXT_TOKEN).toBeDefined();
    expect(envVars.TOOLS).toBeDefined();

    // Verify tools config
    const tools = JSON.parse(envVars.TOOLS);
    expect(tools["bridge-test"]).toBeDefined();
    expect(tools["bridge-test"].functionName).toBe("bridgeTestFunction");
  });

  it("should handle concurrent HTTP requests", async () => {
    const context = { concurrent: true };
    const token = (host as any).createJWT(context);

    // Send multiple concurrent requests
    const requests = Array.from({ length: 5 }, (_, i) =>
      fetch(`http://localhost:${port}/mcp-rpc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "bridgeTestFunction",
          params: [token, { value: i + 1 }],
          id: i + 1,
        }),
      })
    );

    const responses = await Promise.all(requests);
    const results = await Promise.all(responses.map((r) => r.json()));

    // Verify all requests were handled correctly
    results.forEach((result, i) => {
      expect(result.id).toBe(i + 1);
      expect(result.result).toBeDefined();
      expect(result.result.type).toBe("text");
      expect(result.result.text).toBe(`Value doubled: ${(i + 1) * 2}`);
    });
  });
});