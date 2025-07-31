import { describe, it, expect } from 'vitest';

describe('Result formatting', () => {
  // Helper function that mimics the result formatting logic from index.ts
  function formatResult(result: any) {
    if (typeof result === "string") {
      return { content: [{ type: "text", text: result }] };
    } else if (Array.isArray(result)) {
      return { content: result };
    } else if (result && typeof result === "object" && "type" in result) {
      return { content: [result] };
    } else {
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
  }

  describe('string results', () => {
    it('should format plain string as text content', () => {
      const result = formatResult("Hello, world!");
      expect(result).toEqual({
        content: [{ type: "text", text: "Hello, world!" }]
      });
    });

    it('should handle empty string', () => {
      const result = formatResult("");
      expect(result).toEqual({
        content: [{ type: "text", text: "" }]
      });
    });

    it('should handle string with special characters', () => {
      const result = formatResult("Line 1\nLine 2\tTabbed");
      expect(result).toEqual({
        content: [{ type: "text", text: "Line 1\nLine 2\tTabbed" }]
      });
    });
  });

  describe('array results', () => {
    it('should pass through array of content items', () => {
      const contentArray = [
        { type: "text", text: "First item" },
        { type: "text", text: "Second item" }
      ];
      const result = formatResult(contentArray);
      expect(result).toEqual({
        content: contentArray
      });
    });

    it('should handle empty array', () => {
      const result = formatResult([]);
      expect(result).toEqual({
        content: []
      });
    });

    it('should handle mixed content types in array', () => {
      const contentArray = [
        { type: "text", text: "Text content" },
        { type: "image", data: "base64data", mimeType: "image/png" }
      ];
      const result = formatResult(contentArray);
      expect(result).toEqual({
        content: contentArray
      });
    });
  });

  describe('object with type property', () => {
    it('should wrap single content object in array', () => {
      const contentObject = { type: "text", text: "Single content item" };
      const result = formatResult(contentObject);
      expect(result).toEqual({
        content: [contentObject]
      });
    });

    it('should handle image content object', () => {
      const imageContent = { 
        type: "image", 
        data: "base64imagedata",
        mimeType: "image/jpeg"
      };
      const result = formatResult(imageContent);
      expect(result).toEqual({
        content: [imageContent]
      });
    });

    it('should handle object with type property and additional fields', () => {
      const contentObject = { 
        type: "text", 
        text: "Content with metadata",
        metadata: { author: "test" }
      };
      const result = formatResult(contentObject);
      expect(result).toEqual({
        content: [contentObject]
      });
    });
  });

  describe('other types (fallback to JSON)', () => {
    it('should stringify number', () => {
      const result = formatResult(42);
      expect(result).toEqual({
        content: [{ type: "text", text: "42" }]
      });
    });

    it('should stringify boolean', () => {
      const result = formatResult(true);
      expect(result).toEqual({
        content: [{ type: "text", text: "true" }]
      });
    });

    it('should stringify null', () => {
      const result = formatResult(null);
      expect(result).toEqual({
        content: [{ type: "text", text: "null" }]
      });
    });

    it('should stringify undefined', () => {
      const result = formatResult(undefined);
      expect(result).toEqual({
        content: [{ type: "text", text: undefined }]
      });
    });

    it('should stringify plain object without type property', () => {
      const obj = { foo: "bar", count: 123 };
      const result = formatResult(obj);
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(obj) }]
      });
    });

    it('should stringify nested object', () => {
      const obj = { 
        user: { name: "John", age: 30 },
        settings: { theme: "dark", notifications: true }
      };
      const result = formatResult(obj);
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(obj) }]
      });
    });

    it('should handle object with type property but not at root level', () => {
      const obj = { 
        data: { type: "user", name: "John" },
        status: "success"
      };
      const result = formatResult(obj);
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify(obj) }]
      });
    });
  });

  describe('edge cases', () => {
    it('should handle zero', () => {
      const result = formatResult(0);
      expect(result).toEqual({
        content: [{ type: "text", text: "0" }]
      });
    });

    it('should handle false boolean', () => {
      const result = formatResult(false);
      expect(result).toEqual({
        content: [{ type: "text", text: "false" }]
      });
    });

    it('should handle empty object', () => {
      const result = formatResult({});
      expect(result).toEqual({
        content: [{ type: "text", text: "{}" }]
      });
    });

    it('should distinguish between object with "type" string vs type property', () => {
      const objWithTypeString = { type: "string" };
      const objWithoutType = { kind: "string" };
      
      // Object with 'type' property should be wrapped in array
      expect(formatResult(objWithTypeString)).toEqual({
        content: [objWithTypeString]
      });
      
      // Object without 'type' property should be stringified
      expect(formatResult(objWithoutType)).toEqual({
        content: [{ type: "text", text: JSON.stringify(objWithoutType) }]
      });
    });
  });
});