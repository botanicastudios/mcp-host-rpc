#!/usr/bin/env node

/**
 * Simple MCP Host Example
 * 
 * This example demonstrates the core functionality:
 * 1. Creating an MCP host with context-based authentication
 * 2. Registering tools with the new API
 * 3. Generating MCP server configurations
 */

import { createMcpHost } from '../dist/host.js';

console.log('🚀 MCP Host Example - Core Functionality\n');

// Create and auto-start the host
const host = createMcpHost({
  authToken: 'example-secret-key-12345',
  start: true,
  debug: true
});

// Register an addition tool
host.registerTool('add', {
  title: 'Add Numbers',
  description: 'Add two numbers together',
  functionName: 'addNumbers',
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'number', description: 'First number' },
      b: { type: 'number', description: 'Second number' }
    },
    required: ['a', 'b'],
    additionalProperties: false
  }
}, async (context, args) => {
  console.log(`[Handler] Addition called with context:`, context);
  console.log(`[Handler] Adding ${args.a} + ${args.b}`);
  
  const result = args.a + args.b;
  
  return {
    result: result,
    calculation: `${args.a} + ${args.b} = ${result}`,
    user: context.userId,
    timestamp: new Date().toISOString()
  };
});

// Register an echo tool
host.registerTool('echo', {
  title: 'Echo Message',
  description: 'Echo a message with context information',
  functionName: 'echoMessage',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Message to echo' }
    },
    required: ['message'],
    additionalProperties: false
  }
}, async (context, args) => {
  console.log(`[Handler] Echo called with context:`, context);
  
  return {
    echo: args.message,
    user: context.userId,
    permissions: context.permissions,
    timestamp: new Date().toISOString()
  };
});

// Wait for server to start, then show configurations
setTimeout(() => {
  console.log('\n📋 Generating MCP Server Configurations...\n');
  
  // Admin user config
  const adminConfig = host.getMCPServerConfig('admin-server', ['add', 'echo'], {
    userId: 'admin',
    role: 'admin',
    permissions: ['read', 'write', 'admin', 'calculate']
  });
  
  // Regular user config
  const userConfig = host.getMCPServerConfig('user-server', ['add'], {
    userId: 'user-123',
    role: 'user',
    permissions: ['read', 'calculate']
  });
  
  console.log('🔧 Admin MCP Config (full access):');
  console.log(JSON.stringify(adminConfig, null, 2));
  
  console.log('\n👤 User MCP Config (limited tools):');
  console.log(JSON.stringify(userConfig, null, 2));
  
  // Show environment variables
  const envVars = host.getMCPServerEnvVars(['add', 'echo'], {
    userId: 'test-user',
    permissions: ['read', 'calculate']
  });
  
  console.log('\n🔑 Environment Variables:');
  console.log(`CONTEXT_TOKEN: ${envVars.CONTEXT_TOKEN.substring(0, 30)}...`);
  console.log(`PIPE: ${envVars.PIPE}`);
  console.log(`TOOLS: ${envVars.TOOLS.substring(0, 80)}...`);
  
  console.log('\n💡 Key Features Demonstrated:');
  console.log('  ✅ JWT context-based authentication');
  console.log('  ✅ Tool registration with new API: registerTool(name, properties, handler)');
  console.log('  ✅ Handler signature: async (context, args) => {}');
  console.log('  ✅ Auto-start functionality');
  console.log('  ✅ MCP server config generation');
  console.log('  ✅ Tool subsets per user/context');
  console.log('  ✅ Ready for claude_desktop_config.json');
  
  console.log('\n🎯 Next Steps:');
  console.log('  1. Copy the MCP config to your claude_desktop_config.json');
  console.log('  2. Start Claude Desktop');
  console.log('  3. The tools will be available with context-based scoping!');
  
  // Graceful shutdown
  setTimeout(async () => {
    await host.stop();
    console.log('\n✨ Example completed successfully!');
    process.exit(0);
  }, 1000);
  
}, 500);

// Graceful shutdown handler
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await host.stop();
  process.exit(0);
});