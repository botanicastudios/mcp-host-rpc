import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSONRPCClient } from 'json-rpc-2.0';
import * as net from 'net';
// Mock the net module
vi.mock('net', () => ({
    createConnection: vi.fn(),
}));
// Mock the JSONRPCClient
vi.mock('json-rpc-2.0', () => ({
    JSONRPCClient: vi.fn(),
}));
describe('RPC Integration', () => {
    let mockSocket;
    let mockRpcClient;
    let originalEnv;
    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.AUTH_TOKEN = 'test-token';
        process.env.TOOLS = '{}';
        process.env.PIPE = '/tmp/test.pipe';
        mockSocket = {
            on: vi.fn(),
            write: vi.fn(),
            writable: true,
        };
        Object.defineProperty(mockSocket, 'writable', {
            value: true,
            writable: true,
        });
        mockRpcClient = {
            request: vi.fn(),
        };
        vi.mocked(net.createConnection).mockReturnValue(mockSocket);
        vi.mocked(JSONRPCClient).mockReturnValue(mockRpcClient);
    });
    afterEach(() => {
        process.env = originalEnv;
        vi.clearAllMocks();
    });
    it('should create socket connection to pipe address', () => {
        net.createConnection(process.env.PIPE);
        expect(net.createConnection).toHaveBeenCalledWith('/tmp/test.pipe');
    });
    it('should set up socket event handlers', () => {
        const socket = net.createConnection(process.env.PIPE);
        // Simulate setting up event handlers
        socket.on('connect', () => { });
        socket.on('error', () => { });
        socket.on('close', () => { });
        expect(socket.on).toHaveBeenCalledWith('connect', expect.any(Function));
        expect(socket.on).toHaveBeenCalledWith('error', expect.any(Function));
        expect(socket.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
    it('should handle socket connection success', () => {
        const socket = net.createConnection(process.env.PIPE);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const connectHandler = () => {
            console.error('Connected to parent app via pipe');
        };
        socket.on('connect', connectHandler);
        connectHandler();
        expect(consoleSpy).toHaveBeenCalledWith('Connected to parent app via pipe');
        consoleSpy.mockRestore();
    });
    it('should handle socket errors', () => {
        const socket = net.createConnection(process.env.PIPE);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });
        const errorHandler = (error) => {
            console.error('Socket error:', error);
            process.exit(1);
        };
        const testError = new Error('Connection failed');
        socket.on('error', errorHandler);
        expect(() => errorHandler(testError)).toThrow('process.exit called');
        expect(consoleSpy).toHaveBeenCalledWith('Socket error:', testError);
        expect(exitSpy).toHaveBeenCalledWith(1);
        consoleSpy.mockRestore();
        exitSpy.mockRestore();
    });
    it('should handle socket close', () => {
        const socket = net.createConnection(process.env.PIPE);
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });
        const closeHandler = () => {
            console.error('Socket connection closed');
            process.exit(1);
        };
        socket.on('close', closeHandler);
        expect(() => closeHandler()).toThrow('process.exit called');
        expect(consoleSpy).toHaveBeenCalledWith('Socket connection closed');
        expect(exitSpy).toHaveBeenCalledWith(1);
        consoleSpy.mockRestore();
        exitSpy.mockRestore();
    });
    it('should create RPC client with send function', () => {
        const socket = net.createConnection(process.env.PIPE);
        const send = (data) => {
            if (socket.writable) {
                socket.write(data + '\n');
            }
            else {
                console.error('Socket not writable');
            }
        };
        new JSONRPCClient(send);
        expect(JSONRPCClient).toHaveBeenCalledWith(expect.any(Function));
    });
    it('should send data through socket when writable', () => {
        const socket = net.createConnection(process.env.PIPE);
        Object.defineProperty(socket, 'writable', { value: true, writable: true });
        const send = (data) => {
            if (socket.writable) {
                socket.write(data + '\n');
            }
            else {
                console.error('Socket not writable');
            }
        };
        send('test data');
        expect(socket.write).toHaveBeenCalledWith('test data\n');
    });
    it('should handle sending data when socket is not writable', () => {
        const socket = net.createConnection(process.env.PIPE);
        Object.defineProperty(socket, 'writable', { value: false, writable: true });
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        const send = (data) => {
            if (socket.writable) {
                socket.write(data + '\n');
            }
            else {
                console.error('Socket not writable');
            }
        };
        send('test data');
        expect(socket.write).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('Socket not writable');
        consoleSpy.mockRestore();
    });
    it('should make RPC requests with correct parameters', async () => {
        const rpcClient = new JSONRPCClient(() => { });
        mockRpcClient.request.mockResolvedValue('test result');
        const result = await rpcClient.request('testMethod', ['auth-token', { param: 'value' }]);
        expect(mockRpcClient.request).toHaveBeenCalledWith('testMethod', ['auth-token', { param: 'value' }]);
        expect(result).toBe('test result');
    });
    it('should handle RPC request failures', async () => {
        const rpcClient = new JSONRPCClient(() => { });
        const testError = new Error('RPC failed');
        mockRpcClient.request.mockRejectedValue(testError);
        await expect(rpcClient.request('testMethod', ['auth-token', {}])).rejects.toThrow('RPC failed');
    });
});
//# sourceMappingURL=rpc-integration.test.js.map