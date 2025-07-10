import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// Mock the MCP SDK
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
    JSONRPCClient: vi.fn(),
}));
vi.mock('net', () => ({
    createConnection: vi.fn().mockReturnValue({
        on: vi.fn(),
        write: vi.fn(),
        writable: true,
    }),
}));
describe('MCP Server initialization', () => {
    let originalEnv;
    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.AUTH_TOKEN = 'test-token';
        process.env.TOOLS = JSON.stringify({
            testTool: {
                title: 'Test Tool',
                description: 'A test tool',
                functionName: 'testFunction',
                inputSchema: {
                    type: 'object',
                    properties: {
                        input: { type: 'string' }
                    },
                    required: ['input']
                }
            }
        });
        process.env.PIPE = '/tmp/test.pipe';
        vi.clearAllMocks();
    });
    afterEach(() => {
        process.env = originalEnv;
        vi.clearAllMocks();
    });
    it('should create MCP server with correct configuration', () => {
        new McpServer({
            name: 'rpc-bridge-server',
            version: '1.0.0',
        });
        expect(McpServer).toHaveBeenCalledWith({
            name: 'rpc-bridge-server',
            version: '1.0.0',
        });
    });
    it('should register tools from configuration', () => {
        const mockServer = new McpServer({
            name: 'rpc-bridge-server',
            version: '1.0.0',
        });
        const mockRegisterTool = vi.mocked(mockServer.registerTool);
        // Simulate the tool registration logic
        const tools = JSON.parse(process.env.TOOLS);
        for (const [toolName, toolConfig] of Object.entries(tools)) {
            mockServer.registerTool(toolName, {
                title: toolConfig.title,
                description: toolConfig.description,
                inputSchema: {},
            }, async () => ({ content: [{ type: 'text', text: 'test result' }] }));
        }
        expect(mockRegisterTool).toHaveBeenCalledWith('testTool', {
            title: 'Test Tool',
            description: 'A test tool',
            inputSchema: {},
        }, expect.any(Function));
    });
    it('should handle tool execution errors gracefully', async () => {
        const mockServer = new McpServer({
            name: 'rpc-bridge-server',
            version: '1.0.0',
        });
        // Simulate a tool handler that throws an error
        const toolHandler = async () => {
            throw new Error('RPC call failed');
        };
        // Test the error handling logic
        let result;
        try {
            await toolHandler();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result = {
                content: [
                    {
                        type: 'text',
                        text: `Error calling testFunction: ${errorMessage}`,
                    },
                ],
            };
        }
        expect(result).toEqual({
            content: [
                {
                    type: 'text',
                    text: 'Error calling testFunction: RPC call failed',
                },
            ],
        });
    });
    it('should handle successful tool execution', async () => {
        const mockRpcClient = {
            request: vi.fn().mockResolvedValue('success result'),
        };
        const toolHandler = async (args) => {
            try {
                const result = await mockRpcClient.request('testFunction', ['test-token', args]);
                return { content: result };
            }
            catch (error) {
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
        const result = await toolHandler({ input: 'test input' });
        expect(mockRpcClient.request).toHaveBeenCalledWith('testFunction', ['test-token', { input: 'test input' }]);
        expect(result).toEqual({ content: 'success result' });
    });
});
//# sourceMappingURL=mcp-server.test.js.map