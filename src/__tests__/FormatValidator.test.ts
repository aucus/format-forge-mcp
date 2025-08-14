import { FormatValidator } from '../core/FormatValidator.js';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  constants: { F_OK: 0, R_OK: 4 },
  promises: {
    access: jest.fn(),
    stat: jest.fn(),
    open: jest.fn(),
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('FormatValidator', () => {
  let validator: FormatValidator;

  beforeEach(() => {
    validator = new FormatValidator();
    jest.clearAllMocks();
  });

  describe('validateFile', () => {
    const mockStats = {
      isFile: jest.fn().mockReturnValue(true),
      size: 1024
    };

    const mockFileHandle = {
      read: jest.fn(),
      close: jest.fn()
    };

    beforeEach(() => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.stat.mockResolvedValue(mockStats as any);
      mockFs.promises.open.mockResolvedValue(mockFileHandle as any);
      mockFileHandle.close.mockResolvedValue(undefined);
    });

    it('should validate a correct CSV file', async () => {
      const csvContent = 'name,age,email\nJohn,30,john@example.com';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: csvContent.length,
        buffer: Buffer.from(csvContent)
      } as any);

      const result = await validator.validateFile('/path/to/file.csv', 'csv');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a correct JSON file', async () => {
      const jsonContent = '{"name": "test", "value": 123}';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: jsonContent.length,
        buffer: Buffer.from(jsonContent)
      } as any);

      const result = await validator.validateFile('/path/to/file.json', 'json');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect file not found', async () => {
      mockFs.promises.access.mockRejectedValue(new Error('File not found'));

      const result = await validator.validateFile('/path/to/nonexistent.csv', 'csv');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'FILE_NOT_FOUND',
          message: expect.stringContaining('File does not exist')
        })
      );
    });

    it('should detect non-readable file', async () => {
      mockFs.promises.access
        .mockResolvedValueOnce(undefined) // F_OK check passes
        .mockRejectedValueOnce(new Error('Permission denied')); // R_OK check fails

      const result = await validator.validateFile('/path/to/file.csv', 'csv');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'FILE_NOT_READABLE',
          message: expect.stringContaining('File is not readable')
        })
      );
    });

    it('should detect directory instead of file', async () => {
      mockStats.isFile.mockReturnValue(false);

      const result = await validator.validateFile('/path/to/directory', 'csv');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'NOT_A_FILE',
          message: expect.stringContaining('Path is not a file')
        })
      );
    });

    it('should detect empty file', async () => {
      mockStats.size = 0;

      const result = await validator.validateFile('/path/to/empty.csv', 'csv');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_FILE',
          message: expect.stringContaining('File is empty')
        })
      );
    });

    it('should warn about large files', async () => {
      mockStats.size = 200 * 1024 * 1024; // 200MB
      const csvContent = 'name,age\nJohn,30';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: csvContent.length,
        buffer: Buffer.from(csvContent)
      } as any);

      const result = await validator.validateFile('/path/to/large.csv', 'csv');
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'FILE_TOO_LARGE',
          message: expect.stringContaining('File size')
        })
      );
    });
  });

  describe('extension validation', () => {
    const mockStats = {
      isFile: jest.fn().mockReturnValue(true),
      size: 1024
    };

    beforeEach(() => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.stat.mockResolvedValue(mockStats as any);
    });

    it('should validate matching extension', async () => {
      const result = await validator.validateFile('/path/to/file.csv', 'csv', {
        contentValidation: false
      });
      
      expect(result.errors.filter(e => e.code === 'INVALID_EXTENSION')).toHaveLength(0);
    });

    it('should warn about extension mismatch in lenient mode', async () => {
      const result = await validator.validateFile('/path/to/file.txt', 'csv', {
        contentValidation: false
      });
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EXTENSION_MISMATCH',
          message: expect.stringContaining('may not match expected format')
        })
      );
    });

    it('should error on extension mismatch in strict mode', async () => {
      const result = await validator.validateFile('/path/to/file.txt', 'csv', {
        contentValidation: false,
        requiredExtensions: ['.csv']
      });
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_EXTENSION',
          message: expect.stringContaining('does not match expected format')
        })
      );
    });
  });

  describe('content validation', () => {
    const mockStats = {
      isFile: jest.fn().mockReturnValue(true),
      size: 1024
    };

    const mockFileHandle = {
      read: jest.fn(),
      close: jest.fn()
    };

    beforeEach(() => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.stat.mockResolvedValue(mockStats as any);
      mockFs.promises.open.mockResolvedValue(mockFileHandle as any);
      mockFileHandle.close.mockResolvedValue(undefined);
    });

    it('should validate correct JSON content', async () => {
      const jsonContent = '{"name": "test", "value": 123}';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: jsonContent.length,
        buffer: Buffer.from(jsonContent)
      } as any);

      const result = await validator.validateFile('/path/to/file.json', 'json');
      
      expect(result.errors.filter(e => e.code === 'INVALID_JSON')).toHaveLength(0);
    });

    it('should detect invalid JSON content', async () => {
      const invalidJson = '{"name": "test", "value":}'; // Invalid JSON
      mockFileHandle.read.mockResolvedValue({
        bytesRead: invalidJson.length,
        buffer: Buffer.from(invalidJson)
      } as any);

      const result = await validator.validateFile('/path/to/file.json', 'json');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_JSON',
          message: expect.stringContaining('Invalid JSON content')
        })
      );
    });

    it('should validate XML content', async () => {
      const xmlContent = '<?xml version="1.0"?><root><item>test</item></root>';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: xmlContent.length,
        buffer: Buffer.from(xmlContent)
      } as any);

      const result = await validator.validateFile('/path/to/file.xml', 'xml');
      
      expect(result.errors.filter(e => e.code.startsWith('INVALID_XML')).length).toBe(0);
    });

    it('should detect invalid XML start', async () => {
      const invalidXml = 'not xml content';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: invalidXml.length,
        buffer: Buffer.from(invalidXml)
      } as any);

      const result = await validator.validateFile('/path/to/file.xml', 'xml');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_XML_START',
          message: 'XML content must start with <'
        })
      );
    });

    it('should detect missing XML elements', async () => {
      const noElements = 'just plain text';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: noElements.length,
        buffer: Buffer.from(noElements)
      } as any);

      const result = await validator.validateFile('/path/to/file.xml', 'xml');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'NO_XML_ELEMENTS',
          message: 'No XML elements found in content'
        })
      );
    });

    it('should validate CSV content', async () => {
      const csvContent = 'name,age,email\nJohn,30,john@example.com\nJane,25,jane@example.com';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: csvContent.length,
        buffer: Buffer.from(csvContent)
      } as any);

      const result = await validator.validateFile('/path/to/file.csv', 'csv');
      
      expect(result.errors.filter(e => e.code === 'EMPTY_CSV')).toHaveLength(0);
    });

    it('should detect empty CSV', async () => {
      const emptyContent = '';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: 0,
        buffer: Buffer.from(emptyContent)
      } as any);

      const result = await validator.validateFile('/path/to/file.csv', 'csv');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_CSV',
          message: 'CSV file appears to be empty'
        })
      );
    });

    it('should warn about inconsistent CSV fields', async () => {
      const inconsistentCsv = 'name,age,email\nJohn,30\nJane,25,jane@example.com,extra';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: inconsistentCsv.length,
        buffer: Buffer.from(inconsistentCsv)
      } as any);

      const result = await validator.validateFile('/path/to/file.csv', 'csv');
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'INCONSISTENT_CSV_FIELDS',
          message: expect.stringContaining('lines have different field counts')
        })
      );
    });

    it('should validate Markdown content', async () => {
      const markdownContent = '# Header\n\n* List item\n\n**Bold text**';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: markdownContent.length,
        buffer: Buffer.from(markdownContent)
      } as any);

      const result = await validator.validateFile('/path/to/file.md', 'md');
      
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about empty Markdown', async () => {
      const emptyContent = '';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: 0,
        buffer: Buffer.from(emptyContent)
      } as any);

      const result = await validator.validateFile('/path/to/file.md', 'md');
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_MARKDOWN',
          message: 'Markdown file appears to be empty'
        })
      );
    });

    it('should warn about plain text in Markdown file', async () => {
      const plainText = 'This is just plain text without any markdown formatting.';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: plainText.length,
        buffer: Buffer.from(plainText)
      } as any);

      const result = await validator.validateFile('/path/to/file.md', 'md');
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'NO_MARKDOWN_PATTERNS',
          message: 'Content does not contain common Markdown patterns'
        })
      );
    });

    it('should skip content validation for Excel files', async () => {
      const result = await validator.validateFile('/path/to/file.xlsx', 'xlsx');
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'BINARY_FORMAT',
          message: 'Excel files are binary format, content validation skipped'
        })
      );
    });
  });

  describe('validation rules', () => {
    it('should get default rules for CSV', () => {
      const rules = validator.getDefaultRulesForFormat('csv');
      
      expect(rules.maxFileSize).toBe(50 * 1024 * 1024);
      expect(rules.requiredExtensions).toEqual(['.csv']);
      expect(rules.contentValidation).toBe(true);
    });

    it('should get default rules for Excel', () => {
      const rules = validator.getDefaultRulesForFormat('xlsx');
      
      expect(rules.maxFileSize).toBe(100 * 1024 * 1024);
      expect(rules.requiredExtensions).toEqual(['.xlsx', '.xls']);
      expect(rules.contentValidation).toBe(false);
    });

    it('should get default rules for JSON', () => {
      const rules = validator.getDefaultRulesForFormat('json');
      
      expect(rules.maxFileSize).toBe(25 * 1024 * 1024);
      expect(rules.requiredExtensions).toEqual(['.json']);
      expect(rules.contentValidation).toBe(true);
    });

    it('should get default rules for XML', () => {
      const rules = validator.getDefaultRulesForFormat('xml');
      
      expect(rules.maxFileSize).toBe(25 * 1024 * 1024);
      expect(rules.requiredExtensions).toEqual(['.xml']);
      expect(rules.contentValidation).toBe(true);
    });

    it('should get default rules for Markdown', () => {
      const rules = validator.getDefaultRulesForFormat('md');
      
      expect(rules.maxFileSize).toBe(10 * 1024 * 1024);
      expect(rules.requiredExtensions).toEqual(['.md', '.markdown']);
      expect(rules.contentValidation).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.stat.mockResolvedValue({
        isFile: () => true,
        size: 1024
      } as any);
      mockFs.promises.open.mockRejectedValue(new Error('Read error'));

      const result = await validator.validateFile('/path/to/file.json', 'json');
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'CONTENT_READ_ERROR',
          message: expect.stringContaining('Could not read file content')
        })
      );
    });

    it('should handle stat errors', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.stat.mockRejectedValue(new Error('Stat error'));

      const result = await validator.validateFile('/path/to/file.csv', 'csv');
      
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'FILE_STAT_ERROR',
          message: expect.stringContaining('Could not get file information')
        })
      );
    });
  });
});