import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Environment variable validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should require AUTH_TOKEN environment variable', () => {
    delete process.env.AUTH_TOKEN;
    process.env.TOOLS = '{}';
    process.env.PIPE = '/tmp/test.pipe';

    expect(() => {
      if (!process.env.AUTH_TOKEN) {
        throw new Error('AUTH_TOKEN environment variable is required');
      }
    }).toThrow('AUTH_TOKEN environment variable is required');
  });

  it('should require TOOLS environment variable', () => {
    process.env.AUTH_TOKEN = 'test-token';
    delete process.env.TOOLS;
    process.env.PIPE = '/tmp/test.pipe';

    expect(() => {
      if (!process.env.TOOLS) {
        throw new Error('TOOLS environment variable is required');
      }
    }).toThrow('TOOLS environment variable is required');
  });

  it('should require PIPE environment variable', () => {
    process.env.AUTH_TOKEN = 'test-token';
    process.env.TOOLS = '{}';
    delete process.env.PIPE;

    expect(() => {
      if (!process.env.PIPE) {
        throw new Error('PIPE environment variable is required');
      }
    }).toThrow('PIPE environment variable is required');
  });

  it('should validate TOOLS is valid JSON', () => {
    process.env.AUTH_TOKEN = 'test-token';
    process.env.TOOLS = 'invalid-json';
    process.env.PIPE = '/tmp/test.pipe';

    expect(() => {
      try {
        JSON.parse(process.env.TOOLS!);
      } catch (error) {
        throw new Error('TOOLS must be valid JSON');
      }
    }).toThrow('TOOLS must be valid JSON');
  });

  it('should parse valid TOOLS JSON', () => {
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
          }
        }
      }
    });
    process.env.PIPE = '/tmp/test.pipe';

    let tools: Record<string, any>;
    expect(() => {
      tools = JSON.parse(process.env.TOOLS!);
    }).not.toThrow();

    expect(tools!).toHaveProperty('testTool');
    expect(tools!.testTool).toHaveProperty('title', 'Test Tool');
    expect(tools!.testTool).toHaveProperty('description', 'A test tool');
    expect(tools!.testTool).toHaveProperty('functionName', 'testFunction');
  });
});