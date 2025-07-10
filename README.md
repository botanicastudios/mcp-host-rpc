# MCP Host RPC Bridge

This MCP server bridges MCP tool calls to JSON-RPC function calls over a socket connection.

If you need this, you'll know.

## Environment Variables

Set these environment variables when running the server:

```bash
export AUTH_TOKEN="your-auth-token"
export PIPE="/tmp/my-app-socket"
export TOOLS='{"add":{"title":"Addition Tool","description":"Add two numbers","inputSchema":{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"],"additionalProperties":false},"functionName":"addService.add"}}'
```

## Running the Server

```bash
npx -y @botanicastudios/mcp-host-rpc
```

## How It Works

1. **Environment Setup**: The server reads `AUTH_TOKEN`, `TOOLS`, and `PIPE` from environment variables
2. **Socket Connection**: Creates a connection to the parent app via the specified pipe/socket
3. **Dynamic Tool Registration**: Parses the `TOOLS` JSON and registers each tool with the MCP server
4. **RPC Bridging**: When a tool is called, it makes an RPC request to the parent app with the auth token and arguments
5. **Response Handling**: Returns the response from the parent app back to the MCP client

## Example Parent App RPC Handler

Your parent app should handle RPC calls like:

```javascript
// Example RPC handler for "addService.add"
async function handleAddService(authToken, args) {
  // Validate auth token
  if (!isValidToken(authToken)) {
    throw new Error("Invalid token");
  }

  // Perform the addition
  const result = args.a + args.b;

  // Return in MCP message format
  return [{ type: "text", text: String(result) }];
}
```

## Host Example Script

A complete working example is provided in `examples/host-example.cjs`. This script demonstrates how to:

1. **Create a JSON-RPC server** that exposes multiple functions
2. **Generate environment variables** automatically for the MCP server
3. **Handle authentication** with secure token generation
4. **Implement sample RPC functions** like file reading, directory listing, and message echoing
5. **Test the integration** with built-in testing functions

### Running the Example

```bash
# Start the host example (this will print the environment variables)
node examples/host-example.cjs

# In another terminal, copy the printed environment variables and run:
export AUTH_TOKEN="generated-token"
export PIPE="/tmp/mcp-pipe-xxxxx.sock"
export TOOLS='{"get-current-time":...}'
npm run dev
```

The example includes four sample tools:

- `get-current-time`: Returns current timestamp and timezone
- `read-file`: Reads file contents with error handling
- `list-directory`: Lists directory contents with file type detection
- `echo`: Echoes messages with optional transformations (uppercase, lowercase, reverse)

## TOOLS Configuration Format

The `TOOLS` environment variable should be a JSON string with this structure:

```json
{
  "toolName": {
    "title": "Human-readable title",
    "description": "Description of what the tool does",
    "inputSchema": {
      "type": "object",
      "properties": {
        "param1": { "type": "string" },
        "param2": { "type": "number" }
      },
      "required": ["param1"],
      "additionalProperties": false
    },
    "functionName": "rpc.function.name"
  }
}
```

## Error Handling

- Invalid auth tokens will result in RPC errors
- Socket connection failures will terminate the server
- Invalid tool configurations will prevent server startup
- RPC call failures are returned as error messages to the MCP client
