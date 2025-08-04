import { McpHost } from "../src/host";
import * as net from "net";
import * as path from "path";
import * as os from "os";

describe("Large message handling", () => {
  let host: McpHost;
  let pipePath: string;

  beforeEach(() => {
    pipePath = path.join(os.tmpdir(), `test-pipe-${Date.now()}.sock`);
    host = new McpHost({
      tools: {},
      secret: "test-secret",
      pipePath,
    });
  });

  afterEach(async () => {
    await host.stop();
  });

  it("should handle messages larger than 8KB", async () => {
    // Create a large payload that exceeds 8KB
    const largeData = "x".repeat(10000); // 10KB of data
    
    await host.start();

    const client = net.createConnection(pipePath);
    
    return new Promise<void>((resolve, reject) => {
      let buffer = "";
      
      client.on("data", (data) => {
        buffer += data.toString();
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);
          
          try {
            const response = JSON.parse(line);
            // Expect an error response since we're sending to a non-existent method
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32601); // Method not found
            client.end();
            resolve();
          } catch (err) {
            reject(err);
          }
        }
      });

      client.on("error", reject);

      // Send a large JSON-RPC request
      const request = {
        jsonrpc: "2.0",
        method: "test_method",
        params: { data: largeData },
        id: 1
      };

      const message = JSON.stringify(request) + "\n";
      console.log(`Sending message of size: ${message.length} bytes`);
      
      client.write(message);
    });
  });

  it("should handle multiple messages in a single data event", async () => {
    await host.start();

    const client = net.createConnection(pipePath);
    
    return new Promise<void>((resolve, reject) => {
      let responses = 0;
      let buffer = "";
      
      client.on("data", (data) => {
        buffer += data.toString();
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);
          
          try {
            const response = JSON.parse(line);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32601);
            responses++;
            
            if (responses === 3) {
              client.end();
              resolve();
            }
          } catch (err) {
            reject(err);
          }
        }
      });

      client.on("error", reject);

      // Send multiple messages at once
      const messages = [
        JSON.stringify({ jsonrpc: "2.0", method: "test1", id: 1 }) + "\n",
        JSON.stringify({ jsonrpc: "2.0", method: "test2", id: 2 }) + "\n",
        JSON.stringify({ jsonrpc: "2.0", method: "test3", id: 3 }) + "\n"
      ].join("");
      
      client.write(messages);
    });
  });

  it("should handle messages split across multiple data events", async () => {
    await host.start();

    const client = net.createConnection(pipePath);
    
    return new Promise<void>((resolve, reject) => {
      let buffer = "";
      
      client.on("data", (data) => {
        buffer += data.toString();
        
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.substring(0, newlineIndex);
          buffer = buffer.substring(newlineIndex + 1);
          
          try {
            const response = JSON.parse(line);
            expect(response.error).toBeDefined();
            expect(response.error.code).toBe(-32601);
            client.end();
            resolve();
          } catch (err) {
            reject(err);
          }
        }
      });

      client.on("error", reject);

      // Split a message into multiple chunks
      const request = JSON.stringify({
        jsonrpc: "2.0",
        method: "test_split",
        params: { data: "test" },
        id: 1
      });
      
      const firstHalf = request.substring(0, Math.floor(request.length / 2));
      const secondHalf = request.substring(Math.floor(request.length / 2)) + "\n";
      
      // Send in two parts with a small delay
      client.write(firstHalf);
      setTimeout(() => {
        client.write(secondHalf);
      }, 10);
    });
  });
});