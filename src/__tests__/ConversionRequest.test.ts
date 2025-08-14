import { ConversionRequestImpl } from '../models/ConversionRequest.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs', () => ({
  constants: { F_OK: 0 },
  promises: {
    access: jest.fn(),
    stat: jest.fn()
  },
  existsSync: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConversionRequestImpl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a basic conversion request', () => {
      const request = new ConversionRequestImpl('/path/to/input.csv', 'json');
      
      expect(request.sourcePath).toBe('/path/to/input.csv');
      expect(request.targetFormat).toBe('json');
      expect(request.outputPath).toBeUndefined();
      expect(request.transformations).toBeUndefined();
      expect(request.options).toBeUndefined();
    });

    it('should create a complete conversion request', () => {
      const transformations = [{ type: 'keyStyle' as const, parameters: { style: 'lowercase' } }];
      const options = { encoding: 'utf-8', includeHeaders: true };
      
      const request = new ConversionRequestImpl(
        '/path/to/input.xlsx',
        'csv',
        '/path/to/output.csv',
        transformations,
        options
      );
      
      expect(request.sourcePath).toBe('/path/to/input.xlsx');
      expect(request.targetFormat).toBe('csv');
      expect(request.outputPath).toBe('/path/to/output.csv');
      expect(request.transformations).toEqual(transformations);
      expect(request.options).toEqual(options);
    });
  });

  describe('validate', () => {
    it('should validate a correct request', () => {
      const request = new ConversionRequestImpl('/path/to/input.csv', 'json');
      const result = request.validate();
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing source path', () => {
      const request = new ConversionRequestImpl('', 'json');
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_SOURCE_PATH',
          message: 'Source path is required and must be a string',
          field: 'sourcePath'
        })
      );
    });

    it('should detect invalid source path type', () => {
      const request = new ConversionRequestImpl(null as any, 'json');
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_SOURCE_PATH',
          field: 'sourcePath'
        })
      );
    });

    it('should detect missing target format', () => {
      const request = new ConversionRequestImpl('/path/to/input.csv', null as any);
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_TARGET_FORMAT',
          message: 'Target format is required',
          field: 'targetFormat'
        })
      );
    });

    it('should detect invalid target format', () => {
      const request = new ConversionRequestImpl('/path/to/input.csv', 'pdf' as any);
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_TARGET_FORMAT',
          message: 'Invalid target format: pdf. Supported formats: csv, xlsx, json, xml, md',
          field: 'targetFormat'
        })
      );
    });

    it('should detect invalid output path type', () => {
      const request = new ConversionRequestImpl('/path/to/input.csv', 'json', 123 as any);
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_OUTPUT_PATH',
          message: 'Output path must be a string',
          field: 'outputPath'
        })
      );
    });

    it('should warn about extension mismatch', () => {
      const request = new ConversionRequestImpl(
        '/path/to/input.csv',
        'json',
        '/path/to/output.xml' // Wrong extension
      );
      const result = request.validate();
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EXTENSION_MISMATCH',
          message: "Output file extension '.xml' doesn't match target format 'json' (expected '.json')",
          field: 'outputPath'
        })
      );
    });

    it('should detect invalid transformations type', () => {
      const request = new ConversionRequestImpl(
        '/path/to/input.csv',
        'json',
        undefined,
        'invalid' as any
      );
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_TRANSFORMATIONS',
          message: 'Transformations must be an array',
          field: 'transformations'
        })
      );
    });

    it('should detect invalid transformation object', () => {
      const request = new ConversionRequestImpl(
        '/path/to/input.csv',
        'json',
        undefined,
        [null] as any
      );
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_TRANSFORMATION',
          message: 'Transformation at index 0 must be an object',
          field: 'transformations[0]'
        })
      );
    });

    it('should detect missing transformation type', () => {
      const request = new ConversionRequestImpl(
        '/path/to/input.csv',
        'json',
        undefined,
        [{ parameters: {} }] as any
      );
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_TRANSFORMATION_TYPE',
          message: 'Transformation at index 0 is missing type',
          field: 'transformations[0].type'
        })
      );
    });

    it('should detect invalid transformation type', () => {
      const request = new ConversionRequestImpl(
        '/path/to/input.csv',
        'json',
        undefined,
        [{ type: 'invalid', parameters: {} }] as any
      );
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_TRANSFORMATION_TYPE',
          message: 'Invalid transformation type at index 0: invalid',
          field: 'transformations[0].type'
        })
      );
    });

    it('should detect invalid options type', () => {
      const request = new ConversionRequestImpl(
        '/path/to/input.csv',
        'json',
        undefined,
        undefined,
        'invalid' as any
      );
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_OPTIONS',
          message: 'Options must be an object',
          field: 'options'
        })
      );
    });

    it('should detect invalid sheet index', () => {
      const request = new ConversionRequestImpl(
        '/path/to/input.xlsx',
        'csv',
        undefined,
        undefined,
        { sheetIndex: -1 }
      );
      const result = request.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_SHEET_INDEX',
          message: 'Sheet index must be a non-negative number',
          field: 'options.sheetIndex'
        })
      );
    });
  });

  describe('generateOutputPath', () => {
    it('should return existing output path', () => {
      const request = new ConversionRequestImpl(
        '/path/to/input.csv',
        'json',
        '/custom/output.json'
      );
      
      expect(request.generateOutputPath()).toBe('/custom/output.json');
    });

    it('should generate output path from source path', () => {
      const request = new ConversionRequestImpl('/path/to/input.csv', 'json');
      const outputPath = request.generateOutputPath();
      
      expect(outputPath).toBe('/path/to/input.json');
    });

    it('should handle different target formats', () => {
      const testCases = [
        { format: 'csv' as const, expected: '/path/to/data.csv' },
        { format: 'xlsx' as const, expected: '/path/to/data.xlsx' },
        { format: 'json' as const, expected: '/path/to/data.json' },
        { format: 'xml' as const, expected: '/path/to/data.xml' },
        { format: 'md' as const, expected: '/path/to/data.md' }
      ];

      testCases.forEach(({ format, expected }) => {
        const request = new ConversionRequestImpl('/path/to/data.xlsx', format);
        expect(request.generateOutputPath()).toBe(expected);
      });
    });
  });

  describe('checkSourceExists', () => {
    it('should return true if file exists', async () => {
      mockFs.promises.access.mockResolvedValue(undefined);
      
      const request = new ConversionRequestImpl('/path/to/input.csv', 'json');
      const exists = await request.checkSourceExists();
      
      expect(exists).toBe(true);
      expect(mockFs.promises.access).toHaveBeenCalledWith('/path/to/input.csv', fs.constants.F_OK);
    });

    it('should return false if file does not exist', async () => {
      mockFs.promises.access.mockRejectedValue(new Error('File not found'));
      
      const request = new ConversionRequestImpl('/path/to/input.csv', 'json');
      const exists = await request.checkSourceExists();
      
      expect(exists).toBe(false);
    });
  });

  describe('getSourceStats', () => {
    it('should return file stats if file exists', async () => {
      const mockStats = { size: 1024, isFile: () => true } as fs.Stats;
      mockFs.promises.stat.mockResolvedValue(mockStats);
      
      const request = new ConversionRequestImpl('/path/to/input.csv', 'json');
      const stats = await request.getSourceStats();
      
      expect(stats).toBe(mockStats);
      expect(mockFs.promises.stat).toHaveBeenCalledWith('/path/to/input.csv');
    });

    it('should return null if file does not exist', async () => {
      mockFs.promises.stat.mockRejectedValue(new Error('File not found'));
      
      const request = new ConversionRequestImpl('/path/to/input.csv', 'json');
      const stats = await request.getSourceStats();
      
      expect(stats).toBeNull();
    });
  });

  describe('clone', () => {
    it('should clone request without modifications', () => {
      const original = new ConversionRequestImpl(
        '/path/to/input.csv',
        'json',
        '/path/to/output.json',
        [{ type: 'keyStyle', parameters: { style: 'lowercase' } }],
        { encoding: 'utf-8' }
      );
      
      const cloned = original.clone();
      
      expect(cloned).not.toBe(original);
      expect(cloned.sourcePath).toBe(original.sourcePath);
      expect(cloned.targetFormat).toBe(original.targetFormat);
      expect(cloned.outputPath).toBe(original.outputPath);
      expect(cloned.transformations).toEqual(original.transformations);
      expect(cloned.options).toEqual(original.options);
    });

    it('should clone request with modifications', () => {
      const original = new ConversionRequestImpl('/path/to/input.csv', 'json');
      
      const cloned = original.clone({
        targetFormat: 'xml',
        outputPath: '/new/output.xml'
      });
      
      expect(cloned.sourcePath).toBe(original.sourcePath);
      expect(cloned.targetFormat).toBe('xml');
      expect(cloned.outputPath).toBe('/new/output.xml');
    });
  });

  describe('toPlainObject', () => {
    it('should convert to plain object', () => {
      const request = new ConversionRequestImpl(
        '/path/to/input.csv',
        'json',
        '/path/to/output.json',
        [{ type: 'keyStyle', parameters: { style: 'lowercase' } }],
        { encoding: 'utf-8' }
      );
      
      const plain = request.toPlainObject();
      
      expect(plain).toEqual({
        sourcePath: '/path/to/input.csv',
        targetFormat: 'json',
        outputPath: '/path/to/output.json',
        transformations: [{ type: 'keyStyle', parameters: { style: 'lowercase' } }],
        options: { encoding: 'utf-8' }
      });
    });
  });
});