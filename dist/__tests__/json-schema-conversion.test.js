import { describe, it, expect } from 'vitest';
import { z } from 'zod';
// We need to extract the functions from the main module to test them
// Since they're not exported, we'll need to refactor or test them differently
// For now, let's create test versions of the functions
function jsonSchemaToZod(schema) {
    if (schema.type === 'object') {
        const shape = {};
        if (schema.properties) {
            for (const [key, prop] of Object.entries(schema.properties)) {
                let zodType = jsonSchemaToZod(prop);
                if (prop.description) {
                    zodType = zodType.describe(prop.description);
                }
                if (!schema.required || !schema.required.includes(key)) {
                    zodType = zodType.optional();
                }
                shape[key] = zodType;
            }
        }
        return z.object(shape);
    }
    else if (schema.type === 'string') {
        return z.string();
    }
    else if (schema.type === 'number') {
        return z.number();
    }
    else if (schema.type === 'boolean') {
        return z.boolean();
    }
    else if (schema.type === 'array') {
        return z.array(jsonSchemaToZod(schema.items));
    }
    return z.any();
}
function createInputSchema(schema) {
    const inputSchema = {};
    if (schema.type === 'object' && schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
            let zodType = jsonSchemaToZod(prop);
            if (prop.description) {
                zodType = zodType.describe(prop.description);
            }
            if (!schema.required || !schema.required.includes(key)) {
                zodType = zodType.optional();
            }
            inputSchema[key] = zodType;
        }
    }
    return inputSchema;
}
describe('JSON Schema to Zod conversion', () => {
    describe('jsonSchemaToZod', () => {
        it('should convert string schema to z.string()', () => {
            const schema = { type: 'string' };
            const result = jsonSchemaToZod(schema);
            expect(result).toBeInstanceOf(z.ZodString);
        });
        it('should convert number schema to z.number()', () => {
            const schema = { type: 'number' };
            const result = jsonSchemaToZod(schema);
            expect(result).toBeInstanceOf(z.ZodNumber);
        });
        it('should convert boolean schema to z.boolean()', () => {
            const schema = { type: 'boolean' };
            const result = jsonSchemaToZod(schema);
            expect(result).toBeInstanceOf(z.ZodBoolean);
        });
        it('should convert array schema to z.array()', () => {
            const schema = {
                type: 'array',
                items: { type: 'string' }
            };
            const result = jsonSchemaToZod(schema);
            expect(result).toBeInstanceOf(z.ZodArray);
        });
        it('should convert object schema to z.object()', () => {
            const schema = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'number' }
                },
                required: ['name']
            };
            const result = jsonSchemaToZod(schema);
            expect(result).toBeInstanceOf(z.ZodObject);
        });
        it('should make non-required properties optional', () => {
            const schema = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    age: { type: 'number' }
                },
                required: ['name']
            };
            const result = jsonSchemaToZod(schema);
            // Test that the schema validates correctly
            expect(() => result.parse({ name: 'John' })).not.toThrow();
            expect(() => result.parse({ name: 'John', age: 30 })).not.toThrow();
            expect(() => result.parse({ age: 30 })).toThrow(); // name is required
        });
        it('should handle nested objects', () => {
            const schema = {
                type: 'object',
                properties: {
                    user: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            email: { type: 'string' }
                        },
                        required: ['name']
                    }
                },
                required: ['user']
            };
            const result = jsonSchemaToZod(schema);
            expect(() => result.parse({ user: { name: 'John' } })).not.toThrow();
            expect(() => result.parse({ user: { name: 'John', email: 'john@example.com' } })).not.toThrow();
            expect(() => result.parse({ user: { email: 'john@example.com' } })).toThrow(); // name is required
        });
        it('should fallback to z.any() for unknown types', () => {
            const schema = { type: 'unknown' };
            const result = jsonSchemaToZod(schema);
            expect(result).toBeInstanceOf(z.ZodAny);
        });
    });
    describe('createInputSchema', () => {
        it('should create input schema from object schema', () => {
            const schema = {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'User name' },
                    age: { type: 'number', description: 'User age' }
                },
                required: ['name']
            };
            const result = createInputSchema(schema);
            expect(result).toHaveProperty('name');
            expect(result).toHaveProperty('age');
            expect(result.name).toBeInstanceOf(z.ZodString);
            expect(result.age).toBeInstanceOf(z.ZodOptional);
        });
        it('should return empty object for non-object schemas', () => {
            const schema = { type: 'string' };
            const result = createInputSchema(schema);
            expect(result).toEqual({});
        });
        it('should handle schemas without properties', () => {
            const schema = { type: 'object' };
            const result = createInputSchema(schema);
            expect(result).toEqual({});
        });
    });
});
//# sourceMappingURL=json-schema-conversion.test.js.map