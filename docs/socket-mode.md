# Socket Mode Documentation

Socket mode is the default transport mechanism for mcp-host-rpc. It uses Unix domain sockets (or named pipes on Windows) to provide fast, secure inter-process communication between your host application and MCP servers.

## Overview

In socket mode, the host application creates a Unix domain socket server that MCP bridge processes connect to. This provides:

- **High performance** - Unix sockets have lower overhead than HTTP
- **Automatic cleanup** - Socket files are removed when the process exits
- **Process isolation** - Only processes with file system access can connect
- **Simplicity** - No need for HTTP server setup

## Basic Usage

```javascript
import { McpHost } from '@botanicastudios/mcp-host-rpc/host';

// Create host with default socket transport
const host = new McpHost({
  debug: true // Enable debug logging
});

// Register tools
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
  console.log('Context:', context);
  return { type: 'text', text: `Data for ${args.id}` };
});

// Start the server
const { pipePath } = await host.start();
console.log('Socket server listening at:', pipePath);
```

## Configuration Options

### McpHost Constructor Options

```typescript
interface McpHostOptions {
  // Custom socket path (optional)
  pipePath?: string;
  
  // JWT secret for authentication (auto-generated if not provided)
  secret?: string;
  
  // Enable debug logging
  debug?: boolean;
  
  // Auto-start server on creation
  start?: boolean;
  
  // Transport mode (defaults to 'socket')
  transport?: 'socket';
}
```

### Custom Socket Path

By default, a temporary socket path is generated. You can specify a custom path:

```javascript
const host = new McpHost({
  pipePath: '/tmp/my-app.sock'
});
```

## Environment Variables

When launching MCP servers, the host provides these environment variables:

- `TRANSPORT_MODE`: Set to "socket"
- `PIPE`: Path to the Unix socket
- `CONTEXT_TOKEN`: JWT token containing context data
- `TOOLS`: JSON configuration of available tools
- `DEBUG`: "1" if debug mode is enabled

### Example MCP Server Configuration

```javascript
const config = host.getMCPServerConfig(
  'my-server',
  ['get_data', 'save_data'],
  { userId: '123', permissions: ['read', 'write'] }
);

// Returns:
{
  "my-server": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@botanicastudios/mcp-host-rpc"],
    "env": {
      "TRANSPORT_MODE": "socket",
      "PIPE": "/tmp/mcp-pipe-1234567890.sock",
      "CONTEXT_TOKEN": "eyJhbGc...",
      "TOOLS": "{\"get_data\":{...},\"save_data\":{...}}"
    }
  }
}
```

## Security Considerations

### JWT Authentication

Every request must include a valid JWT token that contains:
- Context data passed when creating the MCP server config
- Signature verification using the host's secret

### File System Permissions

- Socket files are created with restrictive permissions
- Only processes running as the same user can connect
- Socket files are automatically cleaned up on shutdown

### Context Isolation

Each MCP server instance receives its own context token, allowing you to:
- Provide different permissions to different servers
- Track which server is making each request
- Implement fine-grained access control

## Performance Characteristics

Socket mode provides excellent performance for local IPC:

- **Latency**: Sub-millisecond for local communication
- **Throughput**: Limited mainly by message serialization
- **Connection overhead**: Minimal (no TCP handshake)
- **Memory usage**: Shared memory buffers reduce copying

## Error Handling

### Connection Errors

```javascript
// The MCP bridge will exit if it can't connect
// Check the DEBUG environment variable for troubleshooting
process.env.DEBUG = '1';
```

### Socket File Conflicts

If a socket file already exists, it will be automatically removed:

```javascript
// This is handled automatically
if (fs.existsSync(pipePath)) {
  fs.unlinkSync(pipePath);
}
```

## Examples

### Basic Socket Server

```javascript
import { McpHost } from '@botanicastudios/mcp-host-rpc/host';

async function main() {
  const host = new McpHost();

  // Register a simple tool
  host.registerTool('echo', {
    title: 'Echo Tool',
    description: 'Echoes back input',
    functionName: 'echo',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      },
      required: ['message']
    }
  }, async (context, args) => {
    return {
      type: 'text',
      text: `Echo: ${args.message}`
    };
  });

  await host.start();
  console.log('Socket server is running');
}

main();
```

### With Zod Schema Validation

```javascript
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
  age: z.number().positive()
});

host.registerTool('create_user', {
  title: 'Create User',
  description: 'Creates a new user',
  functionName: 'createUser',
  inputSchema: schema // Automatically converted to JSON Schema
}, async (context, args) => {
  // args is type-safe here
  return {
    type: 'text',
    text: `Created user ${args.name}, age ${args.age}`
  };
});
```

## Troubleshooting

### Enable Debug Logging

```javascript
const host = new McpHost({ debug: true });
// Or set DEBUG=1 environment variable for MCP bridge
```

### Common Issues

1. **Permission Denied**
   - Check socket file permissions
   - Ensure processes run as same user

2. **Socket File Not Found**
   - Verify the PIPE environment variable is set correctly
   - Check if the host server is running

3. **Connection Refused**
   - Ensure the host server started successfully
   - Check for port/path conflicts

## Migration from HTTP

If migrating from HTTP mode:

1. Remove `transport: 'http'` from constructor
2. Remove `httpPath` and `httpUrl` options
3. No need for HTTP server setup
4. Update environment variables in MCP server config

## Best Practices

1. **Use descriptive tool names** - Makes debugging easier
2. **Include context in logs** - Helps track requests
3. **Clean shutdown** - Always call `host.stop()` when done
4. **Handle errors gracefully** - Return meaningful error messages
5. **Validate inputs** - Use Zod or JSON Schema for validation