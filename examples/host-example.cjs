#!/usr/bin/env node

const { JSONRPCServer } = require("json-rpc-2.0");
const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// Generate a simple 32-character auth token
function generateAuthToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Example RPC functions that the host exposes
const rpcFunctions = {
  // Example function: Get current timestamp
  getCurrentTime: async (authToken, args) => {
    console.log(`[RPC] getCurrentTime called with auth: ${authToken?.substring(0, 8)}...`);
    console.log(`[RPC] Arguments:`, args);
    
    return {
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      args: args
    };
  },

  // Example function: Read file contents
  readFile: async (authToken, args) => {
    console.log(`[RPC] readFile called with auth: ${authToken?.substring(0, 8)}...`);
    console.log(`[RPC] Arguments:`, args);
    
    try {
      const filePath = args.path;
      if (!filePath) {
        throw new Error("File path is required");
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        success: true,
        content: content,
        path: filePath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: args.path
      };
    }
  },

  // Example function: List directory contents
  listDirectory: async (authToken, args) => {
    console.log(`[RPC] listDirectory called with auth: ${authToken?.substring(0, 8)}...`);
    console.log(`[RPC] Arguments:`, args);
    
    try {
      const dirPath = args.path || '.';
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      const files = entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: path.join(dirPath, entry.name)
      }));
      
      return {
        success: true,
        files: files,
        path: dirPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: args.path
      };
    }
  },

  // Example function: Echo with transformation
  echo: async (authToken, args) => {
    console.log(`[RPC] echo called with auth: ${authToken?.substring(0, 8)}...`);
    console.log(`[RPC] Arguments:`, args);
    
    const message = args.message || "Hello from host!";
    const transform = args.transform || "none";
    
    let result = message;
    
    switch (transform) {
      case "uppercase":
        result = message.toUpperCase();
        break;
      case "lowercase":
        result = message.toLowerCase();
        break;
      case "reverse":
        result = message.split('').reverse().join('');
        break;
      default:
        result = message;
    }
    
    return {
      original: message,
      transformed: result,
      transform: transform,
      timestamp: new Date().toISOString()
    };
  }
};

// Create JSON-RPC server
const server = new JSONRPCServer();

// Register all RPC functions
for (const [functionName, func] of Object.entries(rpcFunctions)) {
  server.addMethod(functionName, func);
}

// Generate environment variables that the MCP server will need
const authToken = generateAuthToken();
const tempDir = os.tmpdir();
const pipePath = path.join(tempDir, `mcp-pipe-${Date.now()}.sock`);

// Tools configuration that describes the available RPC functions
const toolsConfig = {
  "get-current-time": {
    title: "Get Current Time",
    description: "Get the current timestamp and timezone information",
    functionName: "getCurrentTime",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          description: "Optional format preference",
          enum: ["iso", "local", "utc"]
        }
      },
      additionalProperties: false
    }
  },
  "read-file": {
    title: "Read File",
    description: "Read the contents of a file",
    functionName: "readFile",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file to read"
        }
      },
      required: ["path"],
      additionalProperties: false
    }
  },
  "list-directory": {
    title: "List Directory",
    description: "List the contents of a directory",
    functionName: "listDirectory",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the directory to list (defaults to current directory)"
        }
      },
      additionalProperties: false
    }
  },
  "echo": {
    title: "Echo Message",
    description: "Echo a message with optional transformation",
    functionName: "echo",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message to echo"
        },
        transform: {
          type: "string",
          description: "Optional transformation to apply",
          enum: ["none", "uppercase", "lowercase", "reverse"]
        }
      },
      required: ["message"],
      additionalProperties: false
    }
  }
};

// Clean up any existing socket file
if (fs.existsSync(pipePath)) {
  fs.unlinkSync(pipePath);
}

// Test all tools after connection
async function testAllTools() {
  console.log('\n=== Testing All Tools ===');
  
  // Test get-current-time tool
  try {
    console.log('\n[TEST] Testing get-current-time tool...');
    const timeResult = await rpcFunctions.getCurrentTime(authToken, { format: "iso" });
    console.log('[TEST] get-current-time result:', JSON.stringify(timeResult, null, 2));
  } catch (error) {
    console.error('[TEST] get-current-time error:', error.message);
  }
  
  // Test echo tool
  try {
    console.log('\n[TEST] Testing echo tool...');
    const echoResult = await rpcFunctions.echo(authToken, { 
      message: "Hello from host test!", 
      transform: "uppercase" 
    });
    console.log('[TEST] echo result:', JSON.stringify(echoResult, null, 2));
  } catch (error) {
    console.error('[TEST] echo error:', error.message);
  }
  
  // Test list-directory tool
  try {
    console.log('\n[TEST] Testing list-directory tool...');
    const listResult = await rpcFunctions.listDirectory(authToken, { path: "." });
    console.log('[TEST] list-directory result:', JSON.stringify(listResult, null, 2));
  } catch (error) {
    console.error('[TEST] list-directory error:', error.message);
  }
  
  // Test read-file tool (try to read package.json if it exists)
  try {
    console.log('\n[TEST] Testing read-file tool...');
    const readResult = await rpcFunctions.readFile(authToken, { path: "package.json" });
    console.log('[TEST] read-file result:', JSON.stringify({
      success: readResult.success,
      path: readResult.path,
      contentLength: readResult.content ? readResult.content.length : 0,
      error: readResult.error
    }, null, 2));
  } catch (error) {
    console.error('[TEST] read-file error:', error.message);
  }
  
  console.log('\n=== Tool Testing Complete ===\n');
}

// Create Unix socket server
const socketServer = net.createServer((socket) => {
  console.log('[HOST] Client connected to pipe');
  
  // Test all tools after a brief delay to allow connection to stabilize
  setTimeout(async () => {
    await testAllTools();
  }, 1000);
  
  socket.on('data', async (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const request = JSON.parse(line);
        const response = await server.receive(request);
        
        if (response) {
          socket.write(JSON.stringify(response) + '\n');
        }
      } catch (error) {
        console.error('[HOST] Error processing request:', error);
        const errorResponse = {
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error",
            data: error.message
          },
          id: null
        };
        socket.write(JSON.stringify(errorResponse) + '\n');
      }
    }
  });
  
  socket.on('close', () => {
    console.log('[HOST] Client disconnected from pipe');
  });
  
  socket.on('error', (error) => {
    console.error('[HOST] Socket error:', error);
  });
});

// Start the server
socketServer.listen(pipePath, () => {
  console.log('[HOST] Host RPC server started');
  console.log('');
  console.log('=== MCP Server Environment Variables ===');
  console.log('Copy these environment variables to run the MCP server:');
  console.log('');
  console.log(`export AUTH_TOKEN="${authToken}"`);
  console.log(`export PIPE="${pipePath}"`);
  console.log(`export TOOLS='${JSON.stringify(toolsConfig)}'`);
  console.log('');
  console.log('Then run: npm run dev');
  console.log('');
  console.log('=== Available RPC Functions ===');
  Object.keys(rpcFunctions).forEach(funcName => {
    console.log(`- ${funcName}`);
  });
  console.log('');
  console.log('[HOST] Waiting for MCP server to connect...');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[HOST] Shutting down...');
  socketServer.close(() => {
    if (fs.existsSync(pipePath)) {
      fs.unlinkSync(pipePath);
    }
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n[HOST] Shutting down...');
  socketServer.close(() => {
    if (fs.existsSync(pipePath)) {
      fs.unlinkSync(pipePath);
    }
    process.exit(0);
  });
});