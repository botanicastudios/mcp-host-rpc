# HTTP Mode Documentation

HTTP mode allows mcp-host-rpc to communicate via HTTP POST requests instead of Unix sockets. This enables integration with web applications, microservices, and remote MCP servers.

## Overview

In HTTP mode, your application provides an HTTP endpoint that the MCP bridge sends JSON-RPC requests to. This provides:

- **Web integration** - Works with any HTTP server framework
- **Remote access** - Can connect across networks
- **Load balancing** - Distribute requests across multiple servers
- **Standard protocols** - Uses HTTP/HTTPS and JSON-RPC

## Basic Usage

```javascript
import express from 'express';
import { McpHost } from '@botanicastudios/mcp-host-rpc/host';

const app = express();

// Create host with HTTP transport
const host = new McpHost({
  transport: 'http',
  httpPath: '/mcp-rpc',
  httpUrl: 'http://localhost:3000/mcp-rpc',
  debug: true
});

// Register tools
host.registerTool('get_weather', {
  title: 'Get Weather',
  description: 'Gets current weather',
  functionName: 'getWeather',
  inputSchema: {
    type: 'object',
    properties: {
      location: { type: 'string' }
    },
    required: ['location']
  }
}, async (context, args) => {
  return {
    type: 'text',
    text: `Weather in ${args.location}: Sunny, 72°F`
  };
});

// Set up HTTP endpoint
app.use(express.json());
app.post('/mcp-rpc', async (req, res) => {
  await host.handleHttpRequest(req, res);
});

await host.start();
app.listen(3000);
```

## Configuration Options

### McpHost Constructor Options

```typescript
interface McpHostOptions {
  // Required for HTTP mode
  transport: 'http';
  
  // HTTP endpoint path (required)
  httpPath: string;
  
  // Full URL for the endpoint (optional)
  // Used in getMCPServerEnvVars
  httpUrl?: string;
  
  // JWT secret (auto-generated if not provided)
  secret?: string;
  
  // Enable debug logging
  debug?: boolean;
}
```

## Framework Integration

### Express.js

```javascript
import express from 'express';
const app = express();

app.use(express.json());
app.post('/mcp-rpc', async (req, res) => {
  await host.handleHttpRequest(req, res);
});
```

### Fastify

```javascript
import fastify from 'fastify';
const app = fastify();

app.post('/mcp-rpc', async (request, reply) => {
  await host.handleHttpRequest(request, reply);
});
```

### Raw Node.js

```javascript
import http from 'http';

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/mcp-rpc') {
    await host.handleHttpRequest(req, res);
  }
});
```

### Next.js API Route

```javascript
// pages/api/mcp-rpc.js
export default async function handler(req, res) {
  if (req.method === 'POST') {
    await host.handleHttpRequest(req, res);
  } else {
    res.status(405).end();
  }
}
```

## Authentication

HTTP mode uses JWT tokens in the Authorization header:

```
Authorization: Bearer <jwt-token>
```

The token contains:
- Context data from getMCPServerConfig
- Signature for verification
- No expiration (for long-running processes)

## Environment Variables

When launching MCP servers in HTTP mode:

- `TRANSPORT_MODE`: Set to "http"
- `RPC_API_URL`: Full URL to the HTTP endpoint
- `CONTEXT_TOKEN`: JWT token containing context
- `TOOLS`: JSON configuration of available tools
- `DEBUG`: "1" if debug mode is enabled

### Example Configuration

```javascript
const config = host.getMCPServerConfig(
  'weather-service',
  ['get_weather', 'get_forecast'],
  { service: 'weather', region: 'us-west' }
);

// Returns:
{
  "weather-service": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@botanicastudios/mcp-host-rpc"],
    "env": {
      "TRANSPORT_MODE": "http",
      "RPC_API_URL": "http://localhost:3000/mcp-rpc",
      "CONTEXT_TOKEN": "eyJhbGc...",
      "TOOLS": "{\"get_weather\":{...}}"
    }
  }
}
```

## Request/Response Format

### Request Structure

```json
{
  "jsonrpc": "2.0",
  "method": "getWeather",
  "params": ["<context-token>", { "location": "San Francisco" }],
  "id": 1
}
```

### Response Structure

```json
{
  "jsonrpc": "2.0",
  "result": {
    "type": "text",
    "text": "Weather in San Francisco: Sunny, 72°F"
  },
  "id": 1
}
```

### Error Response

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32600,
    "message": "Invalid Request",
    "data": "Missing authorization header"
  },
  "id": 1
}
```

## Security Considerations

### HTTPS

Always use HTTPS in production:

```javascript
const host = new McpHost({
  transport: 'http',
  httpPath: '/mcp-rpc',
  httpUrl: 'https://api.example.com/mcp-rpc'
});
```

### CORS

Configure CORS for browser-based clients:

```javascript
app.use(cors({
  origin: 'https://app.example.com',
  credentials: true
}));
```

### Rate Limiting

Implement rate limiting to prevent abuse:

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100 // 100 requests per minute
});

app.post('/mcp-rpc', limiter, async (req, res) => {
  await host.handleHttpRequest(req, res);
});
```

### Input Validation

The host automatically validates:
- Authorization header presence and format
- JWT token validity
- JSON-RPC request structure

## Performance Considerations

### Connection Pooling

HTTP mode creates a new connection per request. For high-frequency communication, consider:

1. Using socket mode instead
2. Implementing connection keep-alive
3. Using HTTP/2 for multiplexing

### Response Times

Typical latencies:
- Local network: 1-5ms
- Same region: 10-50ms
- Cross-region: 50-200ms

### Scaling

HTTP mode supports horizontal scaling:

```javascript
// Load balancer configuration
upstream mcp_servers {
  server backend1.example.com:3000;
  server backend2.example.com:3000;
  server backend3.example.com:3000;
}
```

## Error Handling

### Network Errors

The MCP bridge handles network errors with exponential backoff:

```javascript
// In the bridge (automatic)
try {
  const response = await fetch(url, options);
} catch (error) {
  // Retry with backoff
}
```

### Timeout Configuration

Set appropriate timeouts for your use case:

```javascript
// Server-side timeout
app.post('/mcp-rpc', timeout('30s'), async (req, res) => {
  await host.handleHttpRequest(req, res);
});
```

## Examples

### Complete Express Example

```javascript
import express from 'express';
import { McpHost } from '@botanicastudios/mcp-host-rpc/host';

const app = express();
const host = new McpHost({
  transport: 'http',
  httpPath: '/mcp-rpc',
  httpUrl: 'http://localhost:3000/mcp-rpc'
});

// Middleware
app.use(express.json());
app.use(cors());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// MCP endpoint
app.post('/mcp-rpc', async (req, res) => {
  try {
    await host.handleHttpRequest(req, res);
  } catch (error) {
    console.error('MCP error:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error'
      }
    });
  }
});

// Register tools
host.registerTool('analyze_data', {
  title: 'Analyze Data',
  description: 'Performs data analysis',
  functionName: 'analyzeData',
  inputSchema: {
    type: 'object',
    properties: {
      dataset: { type: 'string' },
      metrics: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['dataset']
  }
}, async (context, args) => {
  // Access context for authorization
  if (!context.permissions?.includes('analyze')) {
    throw new Error('Insufficient permissions');
  }
  
  return {
    type: 'text',
    text: `Analysis of ${args.dataset} complete`
  };
});

await host.start();
app.listen(3000, () => {
  console.log('HTTP MCP server running on port 3000');
});
```

### With Authentication Middleware

```javascript
// Custom authentication middleware
app.post('/mcp-rpc', authenticate, async (req, res) => {
  // Additional auth checks before MCP processing
  req.body.customAuth = req.user;
  await host.handleHttpRequest(req, res);
});
```

## Testing

### Using cURL

```bash
# Get the context token from getMCPServerEnvVars
TOKEN="eyJhbGc..."

curl -X POST http://localhost:3000/mcp-rpc \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "method": "analyzeData",
    "params": ["'$TOKEN'", {"dataset": "sales_2024"}],
    "id": 1
  }'
```

### Integration Tests

```javascript
import { test } from 'vitest';
import fetch from 'node-fetch';

test('HTTP endpoint works', async () => {
  const response = await fetch('http://localhost:3000/mcp-rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'testTool',
      params: [token, { input: 'test' }],
      id: 1
    })
  });
  
  const result = await response.json();
  expect(result.result).toBeDefined();
});
```

## Migration from Socket Mode

To migrate from socket to HTTP mode:

1. Add HTTP server setup
2. Change transport to 'http'
3. Add httpPath and httpUrl
4. Set up the HTTP endpoint
5. Update MCP server environment variables

```javascript
// Before (socket mode)
const host = new McpHost();

// After (HTTP mode)
const host = new McpHost({
  transport: 'http',
  httpPath: '/mcp-rpc',
  httpUrl: 'https://api.example.com/mcp-rpc'
});

// Add HTTP endpoint
app.post('/mcp-rpc', async (req, res) => {
  await host.handleHttpRequest(req, res);
});
```

## Best Practices

1. **Use HTTPS in production** - Encrypt communication
2. **Implement monitoring** - Track request/response times
3. **Add request logging** - Debug issues in production
4. **Set up health checks** - Monitor service availability
5. **Use connection pooling** - For database connections
6. **Implement graceful shutdown** - Handle SIGTERM properly
7. **Validate all inputs** - Don't trust client data
8. **Use structured logging** - JSON logs for analysis
9. **Set appropriate timeouts** - Prevent hanging requests
10. **Document your API** - Include example requests