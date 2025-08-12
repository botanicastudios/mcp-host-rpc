# MCP Host RPC Bridge

A Node.js library that bridges MCP (Model Context Protocol) tool calls to JSON-RPC function calls. Supports both Unix socket connections (default) and HTTP transport for flexible integration with any application architecture.

## Features

- 🚀 **Dual Transport Modes**: Unix sockets for local IPC, HTTP for web integration
- 🔐 **JWT Authentication**: Secure context passing with cryptographic signatures
- 🔧 **Framework Agnostic**: Works with Express, Fastify, Next.js, or raw Node.js
- 📝 **TypeScript Support**: Full type definitions included
- 🎯 **Zod Integration**: Automatic schema conversion for type-safe tools

## Installation

```bash
npm install @botanicastudios/mcp-host-rpc
```

## Quick Start

### Socket Mode (Default)

```javascript
import { McpHost } from '@botanicastudios/mcp-host-rpc/host';

// Create host with Unix socket transport (default)
const host = new McpHost({ debug: true });

// Register a tool
host.registerTool('get_data', {
  title: 'Get Data',
  description: 'Retrieves data from the system',
  functionName: 'getData',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' }
    },
    required: ['id']
  }
}, async (context, args) => {
  return { type: 'text', text: `Data for ${args.id}` };
});

// Start the server
await host.start();

// Get MCP server configuration
const config = host.getMCPServerConfig(
  'my-server',
  ['get_data'],
  { userId: '123', permissions: ['read'] }
);
```

### HTTP Mode

```javascript
import express from 'express';
import { McpHost } from '@botanicastudios/mcp-host-rpc/host';

const app = express();

// Create host with HTTP transport
const host = new McpHost({
  transport: 'http',
  httpPath: '/mcp-rpc',
  httpUrl: 'http://localhost:3000/mcp-rpc'
});

// Set up HTTP endpoint
app.use(express.json());
app.post('/mcp-rpc', async (req, res) => {
  await host.handleHttpRequest(req, res);
});

// Register tools and start
host.registerTool(/* ... */);
await host.start();
app.listen(3000);
```

## Documentation

- **[Socket Mode Guide](docs/socket-mode.md)** - Detailed documentation for Unix socket transport
- **[HTTP Mode Guide](docs/http-mode.md)** - Complete guide for HTTP transport integration

## Core Concepts

### Transport Modes

1. **Socket Mode** (default) - Uses Unix domain sockets for high-performance local IPC
2. **HTTP Mode** - Uses HTTP POST requests for web integration and remote access

### Context-Based Security

Every tool handler receives a verified context object extracted from JWT tokens:

```javascript
host.registerTool('read_file', {
  /* tool config */
}, async (context, args) => {
  // context contains verified JWT payload
  if (!context.permissions.includes('read')) {
    throw new Error('Permission denied');
  }
  // Implement tool logic
});
```

### Tool Registration

Tools can be registered with JSON Schema or Zod schemas:

```javascript
import { z } from 'zod';

// Using Zod schema (auto-converted to JSON Schema)
const schema = z.object({
  name: z.string().min(1),
  age: z.number().positive()
});

host.registerTool('create_user', {
  title: 'Create User',
  description: 'Creates a new user',
  functionName: 'createUser',
  inputSchema: schema // Zod schema auto-converted
}, async (context, args) => {
  // args is validated against schema
});
```

## API Reference

### `new McpHost(options)`

Creates a new MCP host instance.

```typescript
interface McpHostOptions {
  // Transport mode ('socket' or 'http')
  transport?: 'socket' | 'http';
  
  // Socket mode options
  pipePath?: string;
  
  // HTTP mode options  
  httpPath?: string;
  httpUrl?: string;
  
  // Common options
  secret?: string;
  debug?: boolean;
  start?: boolean;
}
```

### `host.registerTool(name, config, handler)`

Register a tool with the host.

### `host.getMCPServerConfig(name, tools, context, options?)`

Get MCP server configuration for `claude_desktop_config.json`.

### `host.handleHttpRequest(req, res)`

Handle HTTP requests (HTTP mode only).

### `host.start()` / `host.stop()`

Start or stop the host server.

## Examples

Check out the `examples/` directory for complete examples:

- `simple-example.js` - Basic socket mode usage
- `zod-example.js` - Zod schema validation
- `http-express-example.js` - Express.js HTTP integration
- `http-fastify-example.js` - Fastify HTTP integration
- `http-raw-example.js` - Raw Node.js HTTP server

## Running Examples

```bash
# Socket mode example
npm run example

# HTTP mode examples
node examples/http-express-example.js
node examples/http-fastify-example.js
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.