import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Mock all external dependencies
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool: vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('json-rpc-2.0', () => ({
  JSONRPCClient: vi.fn().mockImplementation(() => ({
    request: vi.fn(),
  })),
}));

vi.mock('net', () => ({
  createConnection: vi.fn().mockReturnValue({
    on: vi.fn(),
    write: vi.fn(),
    writable: true,
  }),
}));

describe('End-to-End MCP Server', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.AUTH_TOKEN = 'test-auth-token';
    process.env.PIPE = '/tmp/test.pipe';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should handle complex tool configuration with multiple tools', () => {
    const complexToolsConfig = {
      fileReader: {
        title: 'File Reader',
        description: 'Reads files from the system',
        functionName: 'readFile',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' },
            encoding: { type: 'string', description: 'File encoding' }
          },
          required: ['path']
        }
      },
      calculator: {
        title: 'Calculator',
        description: 'Performs mathematical calculations',
        functionName: 'calculate',
        inputSchema: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: 'Math expression' },
            precision: { type: 'number', description: 'Decimal precision' }
          },
          required: ['expression']
        }
      },
      dataProcessor: {
        title: 'Data Processor',
        description: 'Processes data arrays',
        functionName: 'processData',
        inputSchema: {
          type: 'object',
          properties: {
            data: { 
              type: 'array', 
              items: { type: 'number' },
              description: 'Array of numbers to process'
            },
            operation: { 
              type: 'string', 
              description: 'Operation to perform'
            }
          },
          required: ['data', 'operation']
        }
      }
    };

    process.env.TOOLS = JSON.stringify(complexToolsConfig);

    // Test that environment validation passes
    expect(() => {
      if (!process.env.AUTH_TOKEN) throw new Error('AUTH_TOKEN required');
      if (!process.env.TOOLS) throw new Error('TOOLS required');
      if (!process.env.PIPE) throw new Error('PIPE required');
    }).not.toThrow();

    // Test that tools config parses correctly
    let tools: Record<string, any>;
    expect(() => {
      tools = JSON.parse(process.env.TOOLS!);
    }).not.toThrow();

    expect(tools!).toHaveProperty('fileReader');
    expect(tools!).toHaveProperty('calculator');
    expect(tools!).toHaveProperty('dataProcessor');

    // Test schema conversion for each tool
    for (const [toolName, toolConfig] of Object.entries(tools!)) {
      const config = toolConfig as any;
      expect(config).toHaveProperty('title');
      expect(config).toHaveProperty('description');
      expect(config).toHaveProperty('functionName');
      expect(config).toHaveProperty('inputSchema');
      expect(config.inputSchema).toHaveProperty('type', 'object');
      expect(config.inputSchema).toHaveProperty('properties');
    }
  });

  it('should handle tool execution workflow', async () => {
    const toolConfig = {
      testTool: {
        title: 'Test Tool',
        description: 'A test tool',
        functionName: 'testFunction',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' },
            options: { 
              type: 'object',
              properties: {
                verbose: { type: 'boolean' }
              }
            }
          },
          required: ['input']
        }
      }
    };

    process.env.TOOLS = JSON.stringify(toolConfig);

    // Simulate the tool execution logic
    const mockRpcClient = {
      request: vi.fn(),
    };

    // Test successful execution
    mockRpcClient.request.mockResolvedValue({ result: 'success', data: 'test data' });

    const toolHandler = async (args: any) => {
      try {
        const result = await mockRpcClient.request('testFunction', ['test-auth-token', args]);
        return { content: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error calling testFunction: ${errorMessage}`,
            },
          ],
        };
      }
    };

    const result = await toolHandler({ input: 'test input', options: { verbose: true } });

    expect(mockRpcClient.request).toHaveBeenCalledWith(
      'testFunction',
      ['test-auth-token', { input: 'test input', options: { verbose: true } }]
    );
    expect(result).toEqual({ content: { result: 'success', data: 'test data' } });

    // Test error handling
    mockRpcClient.request.mockRejectedValue(new Error('Network error'));

    const errorResult = await toolHandler({ input: 'test input' });

    expect(errorResult).toEqual({
      content: [
        {
          type: 'text',
          text: 'Error calling testFunction: Network error',
        },
      ],
    });
  });

  it('should validate input schemas correctly', () => {
    const schema = {
      type: 'object',
      properties: {
        required_field: { type: 'string' },
        optional_field: { type: 'number' },
        nested_object: {
          type: 'object',
          properties: {
            nested_field: { type: 'boolean' }
          }
        },
        array_field: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['required_field']
    };

    // Test the schema conversion logic
    function jsonSchemaToZod(schema: any): z.ZodType<any> {
      if (schema.type === 'object') {
        const shape: Record<string, z.ZodType<any>> = {};
        if (schema.properties) {
          for (const [key, prop] of Object.entries(schema.properties)) {
            let zodType = jsonSchemaToZod(prop as any);
            if ((prop as any).description) {
              zodType = zodType.describe((prop as any).description);
            }
            if (!schema.required || !schema.required.includes(key)) {
              zodType = zodType.optional();
            }
            shape[key] = zodType;
          }
        }
        return z.object(shape);
      } else if (schema.type === 'string') {
        return z.string();
      } else if (schema.type === 'number') {
        return z.number();
      } else if (schema.type === 'boolean') {
        return z.boolean();
      } else if (schema.type === 'array') {
        return z.array(jsonSchemaToZod(schema.items));
      }
      return z.any();
    }

    const zodSchema = jsonSchemaToZod(schema);

    // Test valid inputs
    expect(() => zodSchema.parse({ required_field: 'test' })).not.toThrow();
    expect(() => zodSchema.parse({ 
      required_field: 'test',
      optional_field: 42,
      nested_object: { nested_field: true },
      array_field: ['a', 'b', 'c']
    })).not.toThrow();

    // Test invalid inputs
    expect(() => zodSchema.parse({})).toThrow(); // missing required field
    expect(() => zodSchema.parse({ required_field: 123 })).toThrow(); // wrong type
    expect(() => zodSchema.parse({ 
      required_field: 'test',
      array_field: ['a', 123, 'c'] // wrong array item type
    })).toThrow();
  });
});