import { XmlFormatHandler } from '../handlers/XmlFormatHandler.js';
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

// Mock xml2js
jest.mock('xml2js', () => {
  const mockParser = {
    parseStringPromise: jest.fn(),
    parseString: jest.fn()
  };
  
  const mockBuilder = {
    buildObject: jest.fn()
  };

  return {
    Parser: jest.fn(() => mockParser),
    Builder: jest.fn(() => mockBuilder)
  };
});

const mockFs = fs as jest.Mocked<typeof fs>;
const xml2js = require('xml2js');

describe('XmlFormatHandler', () => {
  let handler: XmlFormatHandler;
  let mockParser: any;
  let mockBuilder: any;

  beforeEach(() => {
    handler = new XmlFormatHandler();
    jest.clearAllMocks();
    
    // Get mock instances
    mockParser = new xml2js.Parser();
    mockBuilder = new xml2js.Builder();
    
    // Default mocks for file operations
    mockFs.promises.access.mockResolvedValue(undefined);
    mockFs.promises.mkdir.mockResolvedValue(undefined);
    mockFs.promises.writeFile.mockResolvedValue(undefined);
  });

  describe('constructor and basic properties', () => {
    it('should initialize with correct format and extensions', () => {
      expect(handler.canHandle('xml')).toBe(true);
      expect(handler.canHandle('json')).toBe(false);
      expect(handler.getSupportedExtensions()).toEqual(['.xml']);
    });
  });

  describe('read', () => {
    beforeEach(() => {
      mockFs.promises.readFile.mockResolvedValue('');
    });

    it('should read XML with array of objects', async () => {
      const xmlData = {
        data: {
          item: [
            { name: 'John', age: '30', email: 'john@example.com' },
            { name: 'Jane', age: '25', email: 'jane@example.com' }
          ]
        }
      };
      
      mockParser.parseStringPromise.mockResolvedValue(xmlData);
      mockFs.promises.readFile.mockResolvedValue('<data><item><name>John</name></item></data>');

      const result = await handler.read('/path/to/file.xml');

      expect(result.rows).toEqual([
        { name: 'John', age: '30', email: 'john@example.com' },
        { name: 'Jane', age: '25', email: 'jane@example.com' }
      ]);
      expect(result.metadata.originalFormat).toBe('xml');
    });

    it('should read XML with single object', async () => {
      const xmlData = {
        person: {
          name: 'John',
          age: '30',
          email: 'john@example.com'
        }
      };
      
      mockParser.parseStringPromise.mockResolvedValue(xmlData);

      const result = await handler.read('/path/to/file.xml');

      expect(result.rows).toEqual([
        { name: 'John', age: '30', email: 'john@example.com' }
      ]);
    });

    it('should read XML with attributes', async () => {
      const xmlData = {
        data: {
          item: {
            '@id': '1',
            '@type': 'person',
            name: 'John',
            age: '30'
          }
        }
      };
      
      mockParser.parseStringPromise.mockResolvedValue(xmlData);

      const result = await handler.read('/path/to/file.xml');

      expect(result.rows[0]).toEqual({
        id: '1',
        type: 'person',
        name: 'John',
        age: '30'
      });
    });

    it('should read XML with text content and attributes', async () => {
      const xmlData = {
        data: {
          item: {
            '#text': 'John Doe',
            '@id': '1',
            '@active': 'true'
          }
        }
      };
      
      mockParser.parseStringPromise.mockResolvedValue(xmlData);

      const result = await handler.read('/path/to/file.xml');

      expect(result.rows[0]).toEqual({
        text: 'John Doe',
        id: '1',
        active: 'true'
      });
    });

    it('should read XML with nested objects', async () => {
      const xmlData = {
        data: {
          person: {
            name: 'John',
            address: {
              street: '123 Main St',
              city: 'Anytown'
            }
          }
        }
      };
      
      mockParser.parseStringPromise.mockResolvedValue(xmlData);

      const result = await handler.read('/path/to/file.xml');

      expect(result.rows[0].address).toEqual({
        street: '123 Main St',
        city: 'Anytown'
      });
    });

    it('should read XML with arrays', async () => {
      const xmlData = {
        data: {
          person: {
            name: 'John',
            hobbies: ['reading', 'swimming', 'coding']
          }
        }
      };
      
      mockParser.parseStringPromise.mockResolvedValue(xmlData);

      const result = await handler.read('/path/to/file.xml');

      expect(result.rows[0].hobbies).toEqual(['reading', 'swimming', 'coding']);
    });

    it('should handle empty XML', async () => {
      mockParser.parseStringPromise.mockResolvedValue({});

      const result = await handler.read('/path/to/file.xml');

      expect(result.rows).toEqual([]);
    });

    it('should handle XML with BOM', async () => {
      const xmlContent = '\uFEFF<?xml version="1.0"?><data><item>test</item></data>';
      mockFs.promises.readFile.mockResolvedValue(xmlContent);
      mockParser.parseStringPromise.mockResolvedValue({ data: { item: 'test' } });

      const result = await handler.read('/path/to/file.xml');

      expect(mockParser.parseStringPromise).toHaveBeenCalledWith(
        expect.not.stringContaining('\uFEFF')
      );
    });

    it('should handle malformed XML', async () => {
      mockParser.parseStringPromise.mockRejectedValue(new Error('XML parsing error at Line: 2'));

      await expect(handler.read('/path/to/file.xml'))
        .rejects.toThrow(ConversionError);
    });

    it('should provide helpful error messages for XML syntax errors', async () => {
      mockParser.parseStringPromise.mockRejectedValue(new Error('Unexpected token at Line: 3'));

      try {
        await handler.read('/path/to/file.xml');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ConversionError);
        expect((error as ConversionError).message).toContain('line 3');
      }
    });

    it('should handle file read errors', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.promises.readFile.mockRejectedValue(error);

      await expect(handler.read('/path/to/nonexistent.xml'))
        .rejects.toThrow(ConversionError);
    });

    it('should use custom encoding', async () => {
      mockParser.parseStringPromise.mockResolvedValue({});

      await handler.read('/path/to/file.xml', { encoding: 'latin1' });

      expect(mockFs.promises.readFile).toHaveBeenCalledWith(
        '/path/to/file.xml',
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
        originalFormat: 'xml',
        encoding: 'utf-8',
        totalRows: 2,
        totalColumns: 3
      }
    };

    beforeEach(() => {
      mockBuilder.buildObject.mockReturnValue('<?xml version="1.0" encoding="UTF-8"?><data></data>');
    });

    it('should write XML with default structure', async () => {
      await handler.write(sampleData, '/path/to/output.xml');

      expect(mockBuilder.buildObject).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        '/path/to/output.xml',
        expect.any(String),
        { encoding: 'utf-8' }
      );
    });

    it('should write XML with custom root element', async () => {
      await handler.write(sampleData, '/path/to/output.xml', {
        formatting: { rootElement: 'people' }
      });

      const buildCall = mockBuilder.buildObject.mock.calls[0][0];
      expect(buildCall).toHaveProperty('people');
    });

    it('should write XML with custom item element', async () => {
      await handler.write(sampleData, '/path/to/output.xml', {
        formatting: { itemElement: 'person' }
      });

      expect(mockBuilder.buildObject).toHaveBeenCalled();
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
            nullValue: null
          }
        ],
        headers: ['text', 'number', 'boolean', 'date', 'array', 'object', 'nullValue'],
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 7
        }
      };

      await handler.write(dataWithTypes, '/path/to/output.xml');

      expect(mockBuilder.buildObject).toHaveBeenCalled();
      const buildCall = mockBuilder.buildObject.mock.calls[0][0];
      
      // Check that the data structure was properly formatted
      expect(buildCall).toHaveProperty('data');
    });

    it('should sanitize invalid XML field names', async () => {
      const dataWithInvalidNames: DataStructure = {
        rows: [
          { 'invalid-name!': 'value1', '123number': 'value2', 'xml:reserved': 'value3' }
        ],
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 3
        }
      };

      await handler.write(dataWithInvalidNames, '/path/to/output.xml');

      expect(mockBuilder.buildObject).toHaveBeenCalled();
    });

    it('should handle single row without creating array', async () => {
      const singleRowData: DataStructure = {
        rows: [{ name: 'John', age: 30 }],
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      await handler.write(singleRowData, '/path/to/output.xml');

      const buildCall = mockBuilder.buildObject.mock.calls[0][0];
      expect(buildCall.data).not.toHaveProperty('item');
    });

    it('should use custom encoding', async () => {
      await handler.write(sampleData, '/path/to/output.xml', { encoding: 'latin1' });

      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        '/path/to/output.xml',
        expect.any(String),
        { encoding: 'latin1' }
      );
    });

    it('should respect overwrite setting', async () => {
      mockFs.promises.access.mockResolvedValue(undefined); // File exists

      await expect(handler.write(sampleData, '/path/to/output.xml', { overwrite: false }))
        .rejects.toThrow(ConversionError);
    });

    it('should handle write errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockFs.promises.writeFile.mockRejectedValue(error);

      await expect(handler.write(sampleData, '/path/to/output.xml'))
        .rejects.toThrow(ConversionError);
    });

    it('should validate data before writing', async () => {
      const invalidData = {
        rows: 'not an array',
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 0
        }
      } as any;

      await expect(handler.write(invalidData, '/path/to/output.xml'))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('validation', () => {
    it('should validate correct XML data structure', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 }
        ],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about empty XML data', () => {
      const data: DataStructure = {
        rows: [],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_XML_DATA',
          message: 'XML data contains no rows'
        })
      );
    });

    it('should warn about invalid XML field names', () => {
      const data: DataStructure = {
        rows: [{ 'invalid-name!': 'value', '123number': 'value2' }],
        headers: ['invalid-name!', '123number'],
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_XML_FIELD_NAMES',
          message: expect.stringContaining('invalid XML characters')
        })
      );
    });

    it('should warn about reserved XML names', () => {
      const data: DataStructure = {
        rows: [{ xmlData: 'value', xmlnsUri: 'value2' }],
        headers: ['xmlData', 'xmlnsUri'],
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'RESERVED_XML_NAMES',
          message: expect.stringContaining('reserved XML prefixes')
        })
      );
    });

    it('should warn about complex structures', () => {
      const data: DataStructure = {
        rows: [
          { 
            name: 'John', 
            hobbies: ['reading', 'swimming'],
            address: { street: '123 Main St', city: 'Anytown' }
          }
        ],
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 3
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'COMPLEX_XML_STRUCTURES',
          message: expect.stringContaining('arrays or objects that will be flattened')
        })
      );
    });

    it('should warn about XML control characters', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John\x00Doe', description: 'Person with\x08control chars' }
        ],
        metadata: {
          originalFormat: 'xml',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'XML_CONTROL_CHARACTERS',
          message: expect.stringContaining('control characters')
        })
      );
    });
  });

  describe('utility methods', () => {
    it('should return XML formatting options', () => {
      const options = handler.getXmlFormattingOptions();
      
      expect(options.rootElements).toContain('data');
      expect(options.rootElements).toContain('root');
      expect(options.itemElements).toContain('item');
      expect(options.itemElements).toContain('record');
      expect(options.features).toContain('XML declaration with encoding');
    });

    it('should validate XML string', () => {
      mockParser.parseString.mockImplementation((xml: string, callback: Function) => {
        callback(null, { data: 'parsed' });
      });

      const result = handler.validateXmlString('<?xml version="1.0"?><data>test</data>');
      
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should detect invalid XML string', () => {
      mockParser.parseString.mockImplementation((xml: string, callback: Function) => {
        callback(new Error('XML parsing error at Line: 2'));
      });

      const result = handler.validateXmlString('<data><unclosed>');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.line).toBe(2);
    });

    it('should analyze XML schema', () => {
      const xmlData = {
        people: {
          person: [
            { '@id': '1', name: 'John', age: '30' },
            { '@id': '2', name: 'Jane', age: '25' }
          ]
        }
      };

      const schema = handler.analyzeXmlSchema(xmlData);
      
      expect(schema.rootElement).toBe('people');
      expect(schema.elements).toHaveProperty('people');
      expect(schema.elements).toHaveProperty('person');
      expect(schema.elements.person.attributes).toContain('id');
      expect(schema.elements.person.children).toContain('name');
      expect(schema.elements.person.children).toContain('age');
      expect(schema.elements.person.isArray).toBe(true);
    });
  });

  describe('XML structure analysis', () => {
    it('should find data array in nested structure', async () => {
      const xmlData = {
        root: {
          metadata: { version: '1.0' },
          data: [
            { name: 'John', age: '30' },
            { name: 'Jane', age: '25' }
          ]
        }
      };
      
      mockParser.parseStringPromise.mockResolvedValue(xmlData);

      const result = await handler.read('/path/to/file.xml');

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({ name: 'John', age: '30' });
    });

    it('should handle XML with only attributes', async () => {
      const xmlData = {
        config: {
          '@version': '1.0',
          '@debug': 'true',
          '@timeout': '30'
        }
      };
      
      mockParser.parseStringPromise.mockResolvedValue(xmlData);

      const result = await handler.read('/path/to/file.xml');

      expect(result.rows[0]).toEqual({
        version: '1.0',
        debug: 'true',
        timeout: '30'
      });
    });
  });
});