import { CsvFormatHandler } from '../handlers/CsvFormatHandler.js';
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

describe('CsvFormatHandler', () => {
  let handler: CsvFormatHandler;

  beforeEach(() => {
    handler = new CsvFormatHandler();
    jest.clearAllMocks();
    
    // Default mocks for file operations
    mockFs.promises.access.mockResolvedValue(undefined);
    mockFs.promises.mkdir.mockResolvedValue(undefined);
    mockFs.promises.writeFile.mockResolvedValue(undefined);
  });

  describe('constructor and basic properties', () => {
    it('should initialize with correct format and extensions', () => {
      expect(handler.canHandle('csv')).toBe(true);
      expect(handler.canHandle('json')).toBe(false);
      expect(handler.getSupportedExtensions()).toEqual(['.csv']);
    });
  });

  describe('read', () => {
    it('should read simple CSV with headers', async () => {
      const csvContent = 'name,age,email\nJohn,30,john@example.com\nJane,25,jane@example.com';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');

      expect(result.rows).toEqual([
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ]);
      expect(result.headers).toEqual(['name', 'age', 'email']);
      expect(result.metadata.originalFormat).toBe('csv');
      expect(result.metadata.totalRows).toBe(2);
      expect(result.metadata.totalColumns).toBe(3);
    });

    it('should read CSV with different delimiter', async () => {
      const csvContent = 'name;age;email\nJohn;30;john@example.com\nJane;25;jane@example.com';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');

      expect(result.rows).toEqual([
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ]);
      expect(result.headers).toEqual(['name', 'age', 'email']);
    });

    it('should read CSV with tab delimiter', async () => {
      const csvContent = 'name\tage\temail\nJohn\t30\tjohn@example.com\nJane\t25\tjane@example.com';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');

      expect(result.rows).toEqual([
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ]);
    });

    it('should handle CSV with quoted fields', async () => {
      const csvContent = 'name,description,value\n"John Doe","A person with, comma",100\n"Jane Smith","Another ""quoted"" person",200';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');

      expect(result.rows).toEqual([
        { name: 'John Doe', description: 'A person with, comma', value: 100 },
        { name: 'Jane Smith', description: 'Another "quoted" person', value: 200 }
      ]);
    });

    it('should handle CSV with empty fields', async () => {
      const csvContent = 'name,age,email\nJohn,,john@example.com\n,25,\nJane,30,jane@example.com';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');

      expect(result.rows).toEqual([
        { name: 'John', age: null, email: 'john@example.com' },
        { name: null, age: 25, email: null },
        { name: 'Jane', age: 30, email: 'jane@example.com' }
      ]);
    });

    it('should handle CSV with different data types', async () => {
      const csvContent = 'name,age,active,score\nJohn,30,true,95.5\nJane,25,false,87.2';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');

      expect(result.rows).toEqual([
        { name: 'John', age: 30, active: true, score: 95.5 },
        { name: 'Jane', age: 25, active: false, score: 87.2 }
      ]);
    });

    it('should handle empty CSV file', async () => {
      const csvContent = '';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');

      expect(result.rows).toEqual([]);
      expect(result.headers).toBeUndefined();
    });

    it('should handle CSV with only headers', async () => {
      const csvContent = 'name,age,email';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');

      expect(result.rows).toEqual([]);
      expect(result.headers).toEqual(['name', 'age', 'email']);
    });

    it('should handle CSV with whitespace in headers', async () => {
      const csvContent = ' name , age , email \nJohn,30,john@example.com';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');

      expect(result.headers).toEqual(['name', 'age', 'email']);
      expect(result.rows[0]).toEqual({ name: 'John', age: 30, email: 'john@example.com' });
    });

    it('should handle file read errors', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.promises.readFile.mockRejectedValue(error);

      await expect(handler.read('/path/to/nonexistent.csv'))
        .rejects.toThrow(ConversionError);
    });

    it('should handle malformed CSV', async () => {
      const csvContent = 'name,age,email\nJohn,30\nJane,25,jane@example.com,extra';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      // Should still parse but may have warnings
      const result = await handler.read('/path/to/file.csv');
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should use custom encoding', async () => {
      const csvContent = 'name,age\nJohn,30';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      await handler.read('/path/to/file.csv', { encoding: 'latin1' });

      expect(mockFs.promises.readFile).toHaveBeenCalledWith(
        '/path/to/file.csv',
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
        originalFormat: 'csv',
        encoding: 'utf-8',
        totalRows: 2,
        totalColumns: 3
      }
    };

    it('should write CSV with headers', async () => {
      await handler.write(sampleData, '/path/to/output.csv');

      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      
      expect(writtenContent).toContain('name,age,email');
      expect(writtenContent).toContain('John');
      expect(writtenContent).toContain('Jane');
    });

    it('should write CSV without headers', async () => {
      const dataWithoutHeaders: DataStructure = {
        ...sampleData,
        headers: undefined
      };

      await handler.write(dataWithoutHeaders, '/path/to/output.csv');

      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      
      expect(writtenContent).toContain('John');
      expect(writtenContent).toContain('Jane');
    });

    it('should handle special characters in data', async () => {
      const dataWithSpecialChars: DataStructure = {
        rows: [
          { name: 'John, Jr.', description: 'A person with "quotes"', notes: 'Line 1\nLine 2' }
        ],
        headers: ['name', 'description', 'notes'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 3
        }
      };

      await handler.write(dataWithSpecialChars, '/path/to/output.csv');

      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      
      // Should properly quote fields with special characters
      expect(writtenContent).toContain('"John, Jr."');
      expect(writtenContent).toContain('"A person with ""quotes"""');
    });

    it('should handle null and undefined values', async () => {
      const dataWithNulls: DataStructure = {
        rows: [
          { name: 'John', age: null, email: undefined },
          { name: null, age: 30, email: 'jane@example.com' }
        ],
        headers: ['name', 'age', 'email'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 3
        }
      };

      await handler.write(dataWithNulls, '/path/to/output.csv');

      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      
      // Null/undefined should become empty strings
      expect(writtenContent).toContain('John,,');
      expect(writtenContent).toContain(',30,jane@example.com');
    });

    it('should handle different data types', async () => {
      const dataWithTypes: DataStructure = {
        rows: [
          { 
            name: 'John', 
            age: 30, 
            active: true, 
            score: 95.5, 
            date: new Date('2023-01-01'),
            metadata: { role: 'admin' }
          }
        ],
        headers: ['name', 'age', 'active', 'score', 'date', 'metadata'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 6
        }
      };

      await handler.write(dataWithTypes, '/path/to/output.csv');

      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      
      expect(writtenContent).toContain('John');
      expect(writtenContent).toContain('30');
      expect(writtenContent).toContain('true');
      expect(writtenContent).toContain('95.5');
      expect(writtenContent).toContain('2023-01-01');
      expect(writtenContent).toContain('{"role":"admin"}');
    });

    it('should use custom encoding', async () => {
      await handler.write(sampleData, '/path/to/output.csv', { encoding: 'latin1' });

      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        '/path/to/output.csv',
        expect.any(String),
        { encoding: 'latin1' }
      );
    });

    it('should respect overwrite setting', async () => {
      mockFs.promises.access.mockResolvedValue(undefined); // File exists

      await expect(handler.write(sampleData, '/path/to/output.csv', { overwrite: false }))
        .rejects.toThrow(ConversionError);
    });

    it('should handle write errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockFs.promises.writeFile.mockRejectedValue(error);

      await expect(handler.write(sampleData, '/path/to/output.csv'))
        .rejects.toThrow(ConversionError);
    });

    it('should validate data before writing', async () => {
      const invalidData = {
        rows: 'not an array',
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 0
        }
      } as any;

      await expect(handler.write(invalidData, '/path/to/output.csv'))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('validation', () => {
    it('should validate correct CSV data structure', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 }
        ],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about empty CSV data', () => {
      const data: DataStructure = {
        rows: [],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_CSV_DATA',
          message: 'CSV data contains no rows'
        })
      );
    });

    it('should warn about inconsistent row structure', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', age: 30 },
          { name: 'Jane' }, // Missing age field
          { name: 'Bob', age: 35, email: 'bob@example.com' } // Extra email field
        ],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 3,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'INCONSISTENT_CSV_STRUCTURE',
          message: expect.stringContaining('rows have inconsistent field structure')
        })
      );
    });

    it('should warn about empty headers', () => {
      const data: DataStructure = {
        rows: [{ name: 'John', '': 30 }],
        headers: ['name', ''],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_CSV_HEADERS',
          message: expect.stringContaining('headers are empty or whitespace')
        })
      );
    });

    it('should warn about duplicate headers', () => {
      const data: DataStructure = {
        rows: [{ name: 'John', age: 30 }],
        headers: ['name', 'age', 'name'], // Duplicate 'name'
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 3
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'DUPLICATE_CSV_HEADERS',
          message: 'Duplicate headers found: name'
        })
      );
    });

    it('should warn about header-row mismatch', () => {
      const data: DataStructure = {
        rows: [{ name: 'John', age: 30, email: 'john@example.com' }],
        headers: ['name', 'age'], // Missing email header
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'HEADER_ROW_MISMATCH',
          message: expect.stringContaining("Header count (2) doesn't match row field count (3)")
        })
      );
    });

    it('should warn about problematic characters', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John\nDoe', description: 'Has "quotes"' }
        ],
        headers: ['name', 'description'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'PROBLEMATIC_CSV_CHARACTERS',
          message: expect.stringContaining('may require special CSV escaping')
        })
      );
    });
  });

  describe('CSV parsing options', () => {
    it('should return CSV parsing options', () => {
      const options = handler.getCSVParsingOptions();
      
      expect(options.supportedDelimiters).toContain(',');
      expect(options.supportedDelimiters).toContain(';');
      expect(options.supportedDelimiters).toContain('\t');
      expect(options.supportedDelimiters).toContain('|');
      
      expect(options.supportedEncodings).toContain('utf-8');
      expect(options.supportedEncodings).toContain('latin1');
      
      expect(options.features).toContain('Auto delimiter detection');
      expect(options.features).toContain('Header row support');
    });
  });

  describe('edge cases', () => {
    it('should handle CSV with BOM', async () => {
      const csvContent = '\uFEFFname,age\nJohn,30';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');
      
      // BOM should be handled gracefully
      expect(result.headers).toEqual(['name', 'age']);
      expect(result.rows[0]).toEqual({ name: 'John', age: 30 });
    });

    it('should handle very large CSV files', async () => {
      // Simulate large CSV
      const largeRows = Array.from({ length: 1000 }, (_, i) => `row${i},${i},value${i}`);
      const csvContent = 'name,id,value\n' + largeRows.join('\n');
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');
      
      expect(result.rows).toHaveLength(1000);
      expect(result.rows[0]).toEqual({ name: 'row0', id: 0, value: 'value0' });
      expect(result.rows[999]).toEqual({ name: 'row999', id: 999, value: 'value999' });
    });

    it('should handle CSV with mixed line endings', async () => {
      const csvContent = 'name,age\r\nJohn,30\nJane,25\r\nBob,35';
      mockFs.promises.readFile.mockResolvedValue(csvContent);

      const result = await handler.read('/path/to/file.csv');
      
      expect(result.rows).toHaveLength(3);
      expect(result.rows.map(r => r.name)).toEqual(['John', 'Jane', 'Bob']);
    });
  });
});