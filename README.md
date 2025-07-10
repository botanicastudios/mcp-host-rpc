# MCP Host RPC Bridge Example

This MCP server bridges MCP tool calls to JSON-RPC function calls over a socket connection.

## Environment Variables

Set these environment variables when running the server:

```bash
export AUTH_TOKEN="your-auth-token"
export PIPE="/tmp/my-app-socket"
export TOOLS='{"add":{"title":"Addition Tool","description":"Add two numbers","inputSchema":{"type":"object","properties":{"a":{"type":"number"},"b":{"type":"number"}},"required":["a","b"],"additionalProperties":false},"functionName":"addService.add"}}'
```

## Running the Server

```bash
npm run build
npm start
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
