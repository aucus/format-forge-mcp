import { JsonFormatHandler } from '../handlers/JsonFormatHandler.js';
import { DataStructure } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  constants: { R_OK: 4, W_OK: 2, F_OK: 0 },
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn()
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('JsonFormatHandler', () => {
  let handler: JsonFormatHandler;

  beforeEach(() => {
    handler = new JsonFormatHandler();
    jest.clearAllMocks();
    
    // Default mocks for file operations
    mockFs.promises.access.mockResolvedValue(undefined);
    mockFs.promises.mkdir.mockResolvedValue(undefined);
    mockFs.promises.writeFile.mockResolvedValue(undefined);
  });

  describe('constructor and basic properties', () => {
    it('should initialize with correct format and extensions', () => {
      expect(handler.canHandle('json')).toBe(true);
      expect(handler.canHandle('csv')).toBe(false);
      expect(handler.getSupportedExtensions()).toEqual(['.json']);
    });
  });

  describe('read', () => {
    it('should read JSON array of objects', async () => {
      const jsonContent = JSON.stringify([
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ]);
      mockFs.promises.readFile.mockResolvedValue(jsonContent);

      const result = await handler.read('/path/to/file.json');

      expect(result.rows).toEqual([
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ]);
      expect(result.headers).toEqual(['age', 'email', 'name']); // Sorted
      expect(result.metadata.originalFormat).toBe('json');
    });

    it('should read JSON array with mixed object structures', async () => {
      const jsonContent = JSON.stringify([
        { name: 'John', age: 30 },
        { name: 'Jane', email: 'jane@example.com' },
        { name: 'Bob', age: 35, phone: '123-456-7890' }
      ]);
      mockFs.promises.readFile.mockResolvedValue(jsonContent);

      const result = await handler.read('/path/to/file.json');

      expect(result.rows).toEqual([
        { name: 'John', age: 30, email: null, phone: null },
        { name: 'Jane', age: null, email: 'jane@example.com', phone: null },
        { name: 'Bob', age: 35, email: null, phone: '123-456-7890' }
      ]);
      expect(result.headers).toEqual(['age', 'email', 'name', 'phone']); // All unique keys
    });

    it('should read JSON array of primitives', async () => {
      const jsonContent = JSON.stringify(['apple', 'banana', 'cherry']);
      mockFs.promises.readFile.mockResolvedValue(jsonContent);

      const result = await handler.read('/path/to/file.json');

      expect(result.rows).toEqual([
        { index: 0, value: 'apple', type: 'string' },
        { index: 1, value: 'banana', type: 'string' },
        { index: 2, value: 'cherry', type: 'string' }
      ]);
      expect(result.headers).toEqual(['index', 'value', 'type']);
    });

    it('should read JSON object', async () => {
      const jsonContent = JSON.stringify({
        name: 'John',
        age: 30,
        hobbies: ['reading', 'swimming']
      });
      mockFs.promises.readFile.mockResolvedValue(jsonContent);

      const result = await handler.read('/path/to/file.json');

      expect(result.rows).toEqual([
        { key: 'name', value: 'John', type: 'string' },
        { key: 'age', value: 30, type: 'number' },
        { key: 'hobbies', value: ['reading', 'swimming'], type: 'array' }
      ]);
      expect(result.headers).toEqual(['key', 'value', 'type']);
    });

    it('should read JSON primitive value', async () => {
      const jsonContent = JSON.stringify('Hello World');
      mockFs.promises.readFile.mockResolvedValue(jsonContent);

      const result = await handler.read('/path/to/file.json');

      expect(result.rows).toEqual([
        { value: 'Hello World' }
      ]);
      expect(result.headers).toEqual(['value']);
    });

    it('should read empty JSON array', async () => {
      const jsonContent = JSON.stringify([]);
      mockFs.promises.readFile.mockResolvedValue(jsonContent);

      const result = await handler.read('/path/to/file.json');

      expect(result.rows).toEqual([]);
      expect(result.headers).toBeUndefined();
    });

    it('should handle JSON with BOM', async () => {
      const jsonContent = '\uFEFF' + JSON.stringify([{ name: 'John' }]);
      mockFs.promises.readFile.mockResolvedValue(jsonContent);

      const result = await handler.read('/path/to/file.json');

      expect(result.rows).toEqual([{ name: 'John' }]);
    });

    it('should handle empty file', async () => {
      mockFs.promises.readFile.mockResolvedValue('');

      const result = await handler.read('/path/to/file.json');

      expect(result.rows).toEqual([]);
    });

    it('should handle whitespace-only file', async () => {
      mockFs.promises.readFile.mockResolvedValue('   \n\t  ');

      const result = await handler.read('/path/to/file.json');

      expect(result.rows).toEqual([]);
    });

    it('should handle malformed JSON', async () => {
      const malformedJson = '{ "name": "John", "age": }';
      mockFs.promises.readFile.mockResolvedValue(malformedJson);

      await expect(handler.read('/path/to/file.json'))
        .rejects.toThrow(ConversionError);
    });

    it('should provide helpful error messages for JSON syntax errors', async () => {
      const malformedJson = '{\n  "name": "John",\n  "age": \n}';
      mockFs.promises.readFile.mockResolvedValue(malformedJson);

      try {
        await handler.read('/path/to/file.json');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConversionError);
        expect((error as ConversionError).message).toContain('line');
        expect((error as ConversionError).message).toContain('column');
      }
    });

    it('should handle file read errors', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.promises.readFile.mockRejectedValue(error);

      await expect(handler.read('/path/to/nonexistent.json'))
        .rejects.toThrow(ConversionError);
    });

    it('should use custom encoding', async () => {
      const jsonContent = JSON.stringify([{ name: 'John' }]);
      mockFs.promises.readFile.mockResolvedValue(jsonContent);

      await handler.read('/path/to/file.json', { encoding: 'latin1' });

      expect(mockFs.promises.readFile).toHaveBeenCalledWith(
        '/path/to/file.json',
        { encoding: 'latin1' }
      );
    });
  });

  describe('write', () => {
    const sampleData: DataStructure = {
      rows: [
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ],
      headers: ['name', 'age', 'email'],
      metadata: {
        originalFormat: 'json',
        encoding: 'utf-8',
        totalRows: 2,
        totalColumns: 3
      }
    };

    it('should write JSON array format (default)', async () => {
      await handler.write(sampleData, '/path/to/output.json');

      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      
      expect(parsed).toEqual([
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ]);
    });

    it('should write JSON object format', async () => {
      await handler.write(sampleData, '/path/to/output.json', {
        formatting: { outputFormat: 'object' }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      
      expect(parsed).toEqual({
        'John': { age: 30, email: 'john@example.com' },
        'Jane': { age: 25, email: 'jane@example.com' }
      });
    });

    it('should write JSON key-value format', async () => {
      await handler.write(sampleData, '/path/to/output.json', {
        formatting: { outputFormat: 'keyValue' }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      
      expect(parsed).toEqual([
        { key: 'John', value: 30 },
        { key: 'Jane', value: 25 }
      ]);
    });

    it('should handle different data types', async () => {
      const dataWithTypes: DataStructure = {
        rows: [
          { 
            text: 'Hello',
            number: 42,
            boolean: true,
            date: new Date('2023-01-01'),
            array: [1, 2, 3],
            object: { nested: 'value' },
            nullValue: null,
            undefinedValue: undefined
          }
        ],
        headers: ['text', 'number', 'boolean', 'date', 'array', 'object', 'nullValue', 'undefinedValue'],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 8
        }
      };

      await handler.write(dataWithTypes, '/path/to/output.json');

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      
      expect(parsed[0].text).toBe('Hello');
      expect(parsed[0].number).toBe(42);
      expect(parsed[0].boolean).toBe(true);
      expect(parsed[0].date).toBe('2023-01-01T00:00:00.000Z');
      expect(parsed[0].array).toEqual([1, 2, 3]);
      expect(parsed[0].object).toEqual({ nested: 'value' });
      expect(parsed[0].nullValue).toBeNull();
      expect(parsed[0].undefinedValue).toBeNull();
    });

    it('should handle special JavaScript types', async () => {
      const dataWithSpecialTypes: DataStructure = {
        rows: [
          { 
            func: () => 'test',
            symbol: Symbol('test'),
            bigint: BigInt(123),
            regularValue: 'normal'
          } as any
        ],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 4
        }
      };

      await handler.write(dataWithSpecialTypes, '/path/to/output.json');

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      
      expect(parsed[0].func).toBe('[Function]');
      expect(parsed[0].symbol).toBe('Symbol(test)');
      expect(parsed[0].bigint).toBe('123');
      expect(parsed[0].regularValue).toBe('normal');
    });

    it('should format JSON with custom indentation', async () => {
      await handler.write(sampleData, '/path/to/output.json', {
        formatting: { indent: 4 }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      
      // Check that it's properly indented
      expect(writtenContent).toContain('    '); // 4 spaces
      expect(writtenContent).toContain('{\n    "name"');
    });

    it('should format JSON with sorted keys', async () => {
      await handler.write(sampleData, '/path/to/output.json', {
        formatting: { sortKeys: true }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      const lines = writtenContent.split('\n');
      
      // Find the first object and check key order
      const objectStart = lines.findIndex(line => line.includes('"age"'));
      const emailLine = lines.findIndex(line => line.includes('"email"'));
      const nameLine = lines.findIndex(line => line.includes('"name"'));
      
      expect(objectStart).toBeLessThan(emailLine);
      expect(emailLine).toBeLessThan(nameLine);
    });

    it('should add trailing newline by default', async () => {
      await handler.write(sampleData, '/path/to/output.json');

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent.endsWith('\n')).toBe(true);
    });

    it('should omit trailing newline when requested', async () => {
      await handler.write(sampleData, '/path/to/output.json', {
        formatting: { trailingNewline: false }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent.endsWith('\n')).toBe(false);
    });

    it('should use custom encoding', async () => {
      await handler.write(sampleData, '/path/to/output.json', { encoding: 'latin1' });

      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        '/path/to/output.json',
        expect.any(String),
        { encoding: 'latin1' }
      );
    });

    it('should respect overwrite setting', async () => {
      mockFs.promises.access.mockResolvedValue(undefined); // File exists

      await expect(handler.write(sampleData, '/path/to/output.json', { overwrite: false }))
        .rejects.toThrow(ConversionError);
    });

    it('should handle write errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockFs.promises.writeFile.mockRejectedValue(error);

      await expect(handler.write(sampleData, '/path/to/output.json'))
        .rejects.toThrow(ConversionError);
    });

    it('should validate data before writing', async () => {
      const invalidData = {
        rows: 'not an array',
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 0
        }
      } as any;

      await expect(handler.write(invalidData, '/path/to/output.json'))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('validation', () => {
    it('should validate correct JSON data structure', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 }
        ],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about empty JSON data', () => {
      const data: DataStructure = {
        rows: [],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_JSON_DATA',
          message: 'JSON data contains no rows'
        })
      );
    });

    it('should detect circular references', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      const data: DataStructure = {
        rows: [circularObj],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 1
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'CIRCULAR_REFERENCE',
          message: expect.stringContaining('circular references')
        })
      );
    });

    it('should warn about problematic data types', () => {
      const data: DataStructure = {
        rows: [
          { 
            func: () => 'test',
            undef: undefined,
            sym: Symbol('test'),
            big: BigInt(123)
          } as any
        ],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 4
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'PROBLEMATIC_JSON_TYPES',
          message: expect.stringContaining('function, undefined, symbol, bigint')
        })
      );
    });

    it('should warn about deeply nested objects', () => {
      const deepObj: any = {};
      let current = deepObj;
      for (let i = 0; i < 15; i++) {
        current.nested = {};
        current = current.nested;
      }

      const data: DataStructure = {
        rows: [{ deep: deepObj }],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 1
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'DEEP_NESTED_OBJECTS',
          message: expect.stringContaining('deeply nested objects')
        })
      );
    });
  });

  describe('utility methods', () => {
    it('should return JSON formatting options', () => {
      const options = handler.getJsonFormattingOptions();
      
      expect(options.outputFormats).toContain('array');
      expect(options.outputFormats).toContain('object');
      expect(options.outputFormats).toContain('keyValue');
      
      expect(options.indentOptions).toContain(0);
      expect(options.indentOptions).toContain(2);
      expect(options.indentOptions).toContain(4);
      
      expect(options.features).toContain('Pretty printing with configurable indentation');
    });

    it('should validate JSON string', () => {
      const validJson = '{"name": "John", "age": 30}';
      const result = handler.validateJsonString(validJson);
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect invalid JSON string', () => {
      const invalidJson = '{"name": "John", "age":}';
      const result = handler.validateJsonString(invalidJson);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should provide position information for JSON errors', () => {
      const invalidJson = '{\n  "name": "John",\n  "age": \n}';
      const result = handler.validateJsonString(invalidJson);
      
      expect(result.isValid).toBe(false);
      expect(result.position).toBeDefined();
      expect(result.position!.line).toBeGreaterThan(1);
    });

    it('should infer JSON schema from data', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', age: 30, active: true },
          { name: 'Jane', age: 25 },
          { name: 'Bob', age: 35, active: false }
        ],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 3,
          totalColumns: 3
        }
      };

      const schema = handler.inferJsonSchema(data);
      
      expect(schema.type).toBe('array');
      expect(schema.properties).toBeDefined();
      expect(schema.properties!.name.type).toBe('string');
      expect(schema.properties!.age.type).toBe('integer');
      expect(schema.properties!.active.type).toBe('boolean');
      
      // name and age should be required (present in all rows)
      expect(schema.properties!.name.required).toBe(true);
      expect(schema.properties!.age.required).toBe(true);
      // active should not be required (present in only 2/3 rows)
      expect(schema.properties!.active.required).toBe(false);
    });

    it('should handle empty data for schema inference', () => {
      const data: DataStructure = {
        rows: [],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 0
        }
      };

      const schema = handler.inferJsonSchema(data);
      
      expect(schema.type).toBe('array');
      expect(schema.items).toEqual({ type: 'object' });
    });
  });
});