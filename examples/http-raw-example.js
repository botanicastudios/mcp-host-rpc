#!/usr/bin/env node
/**
 * HTTP Raw Node.js Server Example
 * 
 * This example demonstrates how to integrate mcp-host-rpc with a raw Node.js
 * HTTP server without any web framework, using HTTP transport mode.
 */

import http from 'http';
import { McpHost } from '../dist/host.js';

const port = 3002;

// Create MCP host with HTTP transport
const mcpHost = new McpHost({
  transport: 'http',
  httpPath: '/mcp-rpc',
  httpUrl: `http://localhost:${port}/mcp-rpc`,
  debug: true,
});

// Register example tools
mcpHost.registerTool(
  'echo',
  {
    title: 'Echo Message',
    description: 'Echoes back the provided message',
    functionName: 'echoMessage',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to echo back',
        },
        uppercase: {
          type: 'boolean',
          description: 'Whether to convert to uppercase',
        },
      },
      required: ['message'],
    },
  },
  async (context, args) => {
    console.log('Context:', context);
    let message = args.message;
    if (args.uppercase) {
      message = message.toUpperCase();
    }
    
    return {
      type: 'text',
      text: `Echo: ${message}`,
    };
  }
);

mcpHost.registerTool(
  'list_files',
  {
    title: 'List Files',
    description: 'Lists files in a directory (simulated)',
    functionName: 'listFiles',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list',
        },
        extension: {
          type: 'string',
          description: 'Filter by file extension',
        },
      },
      required: ['path'],
    },
  },
  async (context, args) => {
    console.log('Context:', context);
    console.log('Listing files in:', args.path);
    
    // Simulate file listing
    const files = [
      'README.md',
      'package.json',
      'index.js',
      'test.js',
      'config.json',
      'data.csv',
    ];
    
    let filtered = files;
    if (args.extension) {
      filtered = files.filter(f => f.endsWith(args.extension));
    }
    
    return {
      type: 'text',
      text: `Files in ${args.path}:\n${filtered.map(f => `  - ${f}`).join('\n')}`,
    };
  }
);

// Helper function to parse request body
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Route handling
  if (req.method === 'POST' && req.url === '/mcp-rpc') {
    try {
      // For raw Node.js server, we need to parse the body first
      const body = await parseBody(req);
      req.body = body;
      
      await mcpHost.handleHttpRequest(req, res);
    } catch (error) {
      console.error('Error handling request:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message,
        },
        id: null,
      }));
    }
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      transport: 'http',
      server: 'raw-nodejs',
    }));
  } else if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>MCP Host HTTP Example</title></head>
        <body>
          <h1>MCP Host HTTP Example (Raw Node.js)</h1>
          <p>Endpoints:</p>
          <ul>
            <li>POST /mcp-rpc - MCP RPC endpoint</li>
            <li>GET /health - Health check</li>
          </ul>
          <p>Available tools: echo, list_files</p>
        </body>
      </html>
    `);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// Start the server
async function start() {
  try {
    // Start the MCP host
    await mcpHost.start();
    
    // Start HTTP server
    server.listen(port, () => {
      console.log(`\nHTTP MCP Host Raw Node.js Example running at http://localhost:${port}`);
      console.log(`MCP RPC endpoint: http://localhost:${port}/mcp-rpc`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`Web interface: http://localhost:${port}/`);
      
      // Get example configuration
      const config = mcpHost.getMCPServerConfig(
        'raw-http-server',
        ['echo', 'list_files'],
        { app: 'file-manager', permissions: 'read-only' }
      );
      
      console.log('\nExample MCP server configuration:');
      console.log(JSON.stringify(config, null, 2));
      
      console.log('\nEnvironment variables:');
      const envVars = config['raw-http-server'].env;
      for (const [key, value] of Object.entries(envVars)) {
        if (value !== undefined) {
          console.log(`export ${key}="${key === 'TOOLS' ? '<tools-config>' : value}"`);
        }
      }
      
      console.log('\nTest the echo tool:');
      console.log(`curl -X POST http://localhost:${port}/mcp-rpc \\`);
      console.log('  -H "Content-Type: application/json" \\');
      console.log('  -H "Authorization: Bearer <CONTEXT_TOKEN>" \\');
      console.log('  -d \'{"jsonrpc":"2.0","method":"echoMessage","params":["<token>",{"message":"Hello, World!","uppercase":true}],"id":1}\'');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(async () => {
    await mcpHost.stop();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(async () => {
    await mcpHost.stop();
    process.exit(0);
  });
});

start();