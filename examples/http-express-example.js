#!/usr/bin/env node
/**
 * HTTP Express Integration Example
 * 
 * This example demonstrates how to integrate mcp-host-rpc with an Express.js
 * application using HTTP transport mode instead of Unix sockets.
 */

import express from 'express';
import { McpHost } from '../dist/host.js';

const app = express();
const port = 3000;

// Create MCP host with HTTP transport
const mcpHost = new McpHost({
  transport: 'http',
  httpPath: '/mcp-rpc',
  httpUrl: `http://localhost:${port}/mcp-rpc`,
  debug: true, // Enable debug logging
});

// Register some example tools
mcpHost.registerTool(
  'get_user',
  {
    title: 'Get User Information',
    description: 'Retrieves information about a user by ID',
    functionName: 'getUserInfo',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The ID of the user to retrieve',
        },
      },
      required: ['userId'],
    },
  },
  async (context, args) => {
    console.log('Context:', context);
    console.log('Getting user info for:', args.userId);
    
    // Simulate database lookup
    const users = {
      '123': { id: '123', name: 'Alice Smith', email: 'alice@example.com' },
      '456': { id: '456', name: 'Bob Jones', email: 'bob@example.com' },
    };
    
    const user = users[args.userId];
    if (!user) {
      throw new Error(`User ${args.userId} not found`);
    }
    
    return {
      type: 'text',
      text: `User: ${user.name} (${user.email})`,
    };
  }
);

mcpHost.registerTool(
  'create_todo',
  {
    title: 'Create Todo Item',
    description: 'Creates a new todo item',
    functionName: 'createTodo',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The title of the todo item',
        },
        description: {
          type: 'string',
          description: 'Optional description',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority level',
        },
      },
      required: ['title'],
    },
  },
  async (context, args) => {
    console.log('Context:', context);
    console.log('Creating todo:', args);
    
    // Simulate creating a todo
    const todo = {
      id: Date.now().toString(),
      title: args.title,
      description: args.description || '',
      priority: args.priority || 'medium',
      createdAt: new Date().toISOString(),
      createdBy: context.user || 'anonymous',
    };
    
    return {
      type: 'text',
      text: `Created todo: ${todo.title} (ID: ${todo.id}, Priority: ${todo.priority})`,
    };
  }
);

// Set up middleware
app.use(express.json());

// Add CORS headers if needed
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Set up the MCP RPC endpoint
app.post('/mcp-rpc', async (req, res) => {
  try {
    await mcpHost.handleHttpRequest(req, res);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: error.message,
      },
      id: null,
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', transport: 'http' });
});

// Start the server
async function start() {
  try {
    // Start the MCP host (not needed for HTTP, but maintains consistency)
    await mcpHost.start();
    
    // Start Express server
    app.listen(port, () => {
      console.log(`\nHTTP MCP Host Example Server running at http://localhost:${port}`);
      console.log(`MCP RPC endpoint: http://localhost:${port}/mcp-rpc`);
      console.log(`Health check: http://localhost:${port}/health`);
      
      // Get example configuration for an MCP server
      const config = mcpHost.getMCPServerConfig(
        'example-http-server',
        ['get_user', 'create_todo'],
        { user: 'alice@example.com' }
      );
      
      console.log('\nExample MCP server configuration:');
      console.log(JSON.stringify(config, null, 2));
      
      console.log('\nEnvironment variables for MCP server:');
      const envVars = config['example-http-server'].env;
      for (const [key, value] of Object.entries(envVars)) {
        if (value !== undefined) {
          console.log(`${key}=${key === 'TOOLS' ? '<tools-config>' : value}`);
        }
      }
      
      console.log('\nTo test the endpoint with curl:');
      console.log(`curl -X POST http://localhost:${port}/mcp-rpc \\`);
      console.log('  -H "Content-Type: application/json" \\');
      console.log('  -H "Authorization: Bearer <CONTEXT_TOKEN>" \\');
      console.log('  -d \'{"jsonrpc":"2.0","method":"getUserInfo","params":["<token>",{"userId":"123"}],"id":1}\'');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();