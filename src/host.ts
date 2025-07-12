/**
 * MCP Host RPC Server Module
 * 
 * This module provides a simplified API for host applications to set up an RPC server
 * that can be used with MCP (Model Context Protocol) servers. It handles the creation
 * of Unix domain sockets, JSON-RPC server setup, JWT-based authentication with context
 * scoping, and provides elegant callback registration for RPC functions.
 */

import { JSONRPCServer } from "json-rpc-2.0";
import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
// @ts-ignore - jsonwebtoken types may not be available in all environments
import jwt from "jsonwebtoken";

export interface ToolProperties {
  title: string;
  description: string;
  functionName: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface RpcHandler {
  (context: any, args: any): Promise<any>;
}

export interface McpHostOptions {
  /** Secret key for JWT signing/verification. If not provided, one will be generated. */
  authToken?: string;
  /** Custom pipe path. If not provided, a temporary one will be created. */
  pipePath?: string;
  /** Auto-start the server immediately */
  start?: boolean;
  /** Whether to log debug information */
  debug?: boolean;
}

export interface McpHostServer {
  /** Register an RPC tool with context-based handler */
  registerTool(toolName: string, properties: ToolProperties, handler: RpcHandler): void;
  /** Get environment variables for MCP server instance */
  getMCPServerEnvVars(tools: string[], context: any): { CONTEXT_TOKEN: string; PIPE: string; TOOLS: string };
  /** Get complete MCP client configuration */
  getMCPServerConfig(name: string, tools: string[], context: any): Record<string, any>;
  /** Start the RPC server */
  start(): Promise<{ authToken: string; pipePath: string; toolsConfig: Record<string, ToolProperties> }>;
  /** Stop the RPC server */
  stop(): Promise<void>;
}

export class McpHost implements McpHostServer {
  private server: JSONRPCServer;
  private socketServer?: net.Server;
  private authToken: string;
  private pipePath: string;
  private debug: boolean;
  private rpcHandlers: Map<string, RpcHandler> = new Map();
  private toolsConfig: Record<string, ToolProperties> = {};
  private isStarted = false;

  constructor(options: McpHostOptions = {}) {
    this.server = new JSONRPCServer();
    this.authToken = options.authToken || this.generateAuthToken();
    this.debug = options.debug ?? false;

    // Always use Unix socket, generate path if not provided
    const tempDir = os.tmpdir();
    this.pipePath = options.pipePath || path.join(tempDir, `mcp-pipe-${Date.now()}.sock`);

    // Auto-start if requested
    if (options.start) {
      this.start().catch(error => {
        this.log('Failed to auto-start server:', error);
      });
    }
  }

  private generateAuthToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private log(message: string, ...args: any[]): void {
    if (this.debug) {
      console.log(`[MCP-Host] ${message}`, ...args);
    }
  }

  private createJWT(context: any): string {
    return jwt.sign({ context }, this.authToken, { noTimestamp: true });
  }

  private verifyJWT(token: string): any {
    try {
      const decoded = jwt.verify(token, this.authToken) as any;
      return decoded.context;
    } catch (error) {
      throw new Error(`Invalid JWT token: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  registerTool(toolName: string, properties: ToolProperties, handler: RpcHandler): void {
    this.rpcHandlers.set(properties.functionName, handler);
    this.toolsConfig[toolName] = properties;
    
    // Create a wrapper that verifies JWT and extracts context
    const wrappedHandler = async (contextToken: string, args: any) => {
      const context = this.verifyJWT(contextToken);
      return await handler(context, args);
    };
    
    this.server.addMethod(properties.functionName, wrappedHandler);
    this.log(`Registered tool: ${toolName} -> ${properties.functionName}`);
  }

  getMCPServerEnvVars(tools: string[], context: any): { CONTEXT_TOKEN: string; PIPE: string; TOOLS: string } {
    // Filter tools config to only include requested tools
    const filteredTools: Record<string, any> = {};
    for (const toolName of tools) {
      if (this.toolsConfig[toolName]) {
        filteredTools[toolName] = this.toolsConfig[toolName];
      }
    }

    const contextToken = this.createJWT(context);
    
    return {
      CONTEXT_TOKEN: contextToken,
      PIPE: this.pipePath,
      TOOLS: JSON.stringify(filteredTools)
    };
  }

  getMCPServerConfig(name: string, tools: string[], context: any): Record<string, any> {
    const envVars = this.getMCPServerEnvVars(tools, context);
    
    return {
      [name]: {
        type: "stdio",
        command: "npx -y @botanicastudios/mcp-host-rpc",
        args: [],
        env: envVars
      }
    };
  }

  async start(): Promise<{ authToken: string; pipePath: string; toolsConfig: Record<string, ToolProperties> }> {
    if (this.isStarted) {
      throw new Error("Server is already started");
    }

    // Clean up existing socket file
    if (fs.existsSync(this.pipePath)) {
      fs.unlinkSync(this.pipePath);
    }

    return new Promise((resolve, reject) => {
      this.socketServer = net.createServer((socket) => {
        this.log('Client connected');
        
        socket.on('data', async (data) => {
          const lines = data.toString().split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const request = JSON.parse(line);
              this.log('Received request:', request.method);
              const response = await this.server.receive(request);
              
              if (response) {
                socket.write(JSON.stringify(response) + '\n');
              }
            } catch (error) {
              this.log('Error processing request:', error);
              const errorResponse = {
                jsonrpc: "2.0",
                error: {
                  code: -32700,
                  message: "Parse error",
                  data: error instanceof Error ? error.message : String(error)
                },
                id: null
              };
              socket.write(JSON.stringify(errorResponse) + '\n');
            }
          }
        });
        
        socket.on('close', () => {
          this.log('Client disconnected');
        });
        
        socket.on('error', (error) => {
          this.log('Socket error:', error);
        });
      });

      const listenCallback = () => {
        this.isStarted = true;
        this.log('RPC server started');
        this.log('Available tools:', Object.keys(this.toolsConfig));
        
        resolve({
          authToken: this.authToken,
          pipePath: this.pipePath,
          toolsConfig: this.toolsConfig
        });
      };

      this.socketServer.on('error', (error) => {
        reject(error);
      });

      this.socketServer.listen(this.pipePath, listenCallback);
    });
  }

  async stop(): Promise<void> {
    if (!this.isStarted || !this.socketServer) {
      return;
    }

    return new Promise((resolve) => {
      this.socketServer!.close(() => {
        if (fs.existsSync(this.pipePath)) {
          fs.unlinkSync(this.pipePath);
        }
        this.isStarted = false;
        this.log('Server stopped');
        resolve();
      });
    });
  }
}

// Convenience function to create a new MCP host
export function createMcpHost(options?: McpHostOptions): McpHostServer {
  return new McpHost(options);
}