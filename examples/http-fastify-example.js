#!/usr/bin/env node
/**
 * HTTP Fastify Integration Example
 * 
 * This example demonstrates how to integrate mcp-host-rpc with a Fastify
 * application using HTTP transport mode.
 */

import Fastify from 'fastify';
import { McpHost } from '../dist/host.js';

const fastify = Fastify({
  logger: true
});

const port = 3001;

// Create MCP host with HTTP transport
const mcpHost = new McpHost({
  transport: 'http',
  httpPath: '/mcp-rpc',
  httpUrl: `http://localhost:${port}/mcp-rpc`,
  debug: true,
});

// Register example tools
mcpHost.registerTool(
  'calculate',
  {
    title: 'Calculate Expression',
    description: 'Performs basic mathematical calculations',
    functionName: 'calculateExpression',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "2 + 2")',
        },
      },
      required: ['expression'],
    },
  },
  async (context, args) => {
    console.log('Context:', context);
    console.log('Calculating:', args.expression);
    
    // Simple safe evaluation (in production, use a proper math parser)
    const result = Function(`"use strict"; return (${args.expression})`)();
    
    return {
      type: 'text',
      text: `${args.expression} = ${result}`,
    };
  }
);

mcpHost.registerTool(
  'get_weather',
  {
    title: 'Get Weather',
    description: 'Gets weather information for a location',
    functionName: 'getWeather',
    inputSchema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'City name or location',
        },
        units: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature units',
        },
      },
      required: ['location'],
    },
  },
  async (context, args) => {
    console.log('Context:', context);
    console.log('Getting weather for:', args.location);
    
    // Simulate weather API call
    const weather = {
      location: args.location,
      temperature: Math.floor(Math.random() * 30) + 10,
      conditions: ['sunny', 'cloudy', 'rainy', 'partly cloudy'][Math.floor(Math.random() * 4)],
      humidity: Math.floor(Math.random() * 50) + 30,
    };
    
    const unit = args.units === 'fahrenheit' ? '°F' : '°C';
    if (args.units === 'fahrenheit') {
      weather.temperature = Math.floor(weather.temperature * 9/5 + 32);
    }
    
    return {
      type: 'text',
      text: `Weather in ${weather.location}: ${weather.temperature}${unit}, ${weather.conditions}, ${weather.humidity}% humidity`,
    };
  }
);

// Add CORS plugin if needed
await fastify.register(import('@fastify/cors'), {
  origin: true,
  credentials: true,
});

// Set up the MCP RPC endpoint
fastify.post('/mcp-rpc', async (request, reply) => {
  try {
    await mcpHost.handleHttpRequest(request, reply);
  } catch (error) {
    fastify.log.error('Error handling MCP request:', error);
    reply.status(500).send({
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
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', transport: 'http', server: 'fastify' };
});

// Start the server
async function start() {
  try {
    // Start the MCP host
    await mcpHost.start();
    
    // Start Fastify server
    await fastify.listen({ port, host: '0.0.0.0' });
    
    console.log(`\nHTTP MCP Host Fastify Example running at http://localhost:${port}`);
    console.log(`MCP RPC endpoint: http://localhost:${port}/mcp-rpc`);
    console.log(`Health check: http://localhost:${port}/health`);
    
    // Get example configuration
    const config = mcpHost.getMCPServerConfig(
      'fastify-weather-server',
      ['calculate', 'get_weather'],
      { service: 'weather-api', region: 'us-west' }
    );
    
    console.log('\nExample MCP server configuration:');
    console.log(JSON.stringify(config, null, 2));
    
    console.log('\nTest with curl:');
    console.log(`curl -X POST http://localhost:${port}/mcp-rpc \\`);
    console.log('  -H "Content-Type: application/json" \\');
    console.log('  -H "Authorization: Bearer <CONTEXT_TOKEN>" \\');
    console.log('  -d \'{"jsonrpc":"2.0","method":"getWeather","params":["<token>",{"location":"San Francisco","units":"celsius"}],"id":1}\'');
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await fastify.close();
  await mcpHost.stop();
  process.exit(0);
});

start();