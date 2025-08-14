import { ConversionOrchestrator } from '../core/ConversionOrchestrator.js';
import { ConversionRequest, DataStructure, DataTransformation, SupportedFormat } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConversionOrchestrator', () => {
  let orchestrator: ConversionOrchestrator;
  let sampleData: DataStructure;

  beforeEach(() => {
    orchestrator = new ConversionOrchestrator();
    sampleData = {
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

    // Reset mocks
    jest.clearAllMocks();
    
    // Default mock implementations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
  });

  describe('convertData', () => {
    it('should convert data without transformations', async () => {
      const result = await orchestrator.convertData(sampleData, 'json');

      expect(result.data.rows).toEqual(sampleData.rows);
      expect(result.data.metadata.originalFormat).toBe('json');
      expect(result.warnings).toEqual([]);
    });

    it('should apply key transformation', async () => {
      const transformations: DataTransformation[] = [
        {
          type: 'keyStyle',
          parameters: { style: 'snake_case' }
        }
      ];

      const result = await orchestrator.convertData(sampleData, 'json', transformations);

      expect(result.data.rows[0]).toHaveProperty('name');
      expect(result.data.rows[0]).toHaveProperty('age');
      expect(result.data.rows[0]).toHaveProperty('email');
    });

    it('should apply column operations', async () => {
      const transformations: DataTransformation[] = [
        {
          type: 'columnOperation',
          parameters: {
            operations: [
              { type: 'add', columnName: 'status', defaultValue: 'active' }
            ]
          }
        }
      ];

      const result = await orchestrator.convertData(sampleData, 'json', transformations);

      expect(result.data.rows[0]).toHaveProperty('status', 'active');
      expect(result.data.headers).toContain('status');
    });

    it('should apply filter transformations', async () => {
      const transformations: DataTransformation[] = [
        {
          type: 'filter',
          parameters: {
            columnFilters: [
              { columnName: 'age', operator: 'greaterThan', value: 25 }
            ]
          }
        }
      ];

      const result = await orchestrator.convertData(sampleData, 'json', transformations);

      expect(result.data.rows).toHaveLength(1);
      expect(result.data.rows[0].name).toBe('John');
      expect(result.warnings).toContain('1 rows were filtered out during transformation');
    });

    it('should apply multiple transformations in sequence', async () => {
      const transformations: DataTransformation[] = [
        {
          type: 'columnOperation',
          parameters: {
            operations: [
              { type: 'add', columnName: 'status', defaultValue: 'active' }
            ]
          }
        },
        {
          type: 'filter',
          parameters: {
            columnFilters: [
              { columnName: 'age', operator: 'greaterThan', value: 25 }
            ]
          }
        }
      ];

      const result = await orchestrator.convertData(sampleData, 'json', transformations);

      expect(result.data.rows).toHaveLength(1);
      expect(result.data.rows[0]).toHaveProperty('status', 'active');
      expect(result.data.rows[0].name).toBe('John');
    });

    it('should handle unknown transformation types', async () => {
      const transformations: DataTransformation[] = [
        {
          type: 'unknown' as any,
          parameters: {}
        }
      ];

      const result = await orchestrator.convertData(sampleData, 'json', transformations);

      // Should complete without error but log warning
      expect(result.data.rows).toEqual(sampleData.rows);
    });

    it('should throw error for invalid transformation', async () => {
      const transformations: DataTransformation[] = [
        {
          type: 'columnOperation',
          parameters: {
            operations: [
              { type: 'add', columnName: 'name', defaultValue: 'test' } // Duplicate column
            ]
          }
        }
      ];

      await expect(orchestrator.convertData(sampleData, 'json', transformations))
        .rejects.toThrow('Transformation failed');
    });
  });

  describe('convertFile', () => {
    const mockRequest: ConversionRequest = {
      sourcePath: '/test/input.csv',
      targetFormat: 'json',
      outputPath: '/test/output.json'
    };

    beforeEach(() => {
      // Mock file system operations
      mockFs.existsSync.mockReturnValue(true);
    });

    it('should validate conversion request', async () => {
      const invalidRequest: ConversionRequest = {
        sourcePath: '',
        targetFormat: 'json'
      };

      const result = await orchestrator.convertFile(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Source path is required');
    });

    it('should handle non-existent source file', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await orchestrator.convertFile(mockRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Source file does not exist');
    });

    it('should handle invalid file paths', async () => {
      const invalidRequest: ConversionRequest = {
        sourcePath: '/test/../../../etc/passwd',
        targetFormat: 'json'
      };

      const result = await orchestrator.convertFile(invalidRequest);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid source file path');
    });

    it('should generate default output path when not specified', async () => {
      const requestWithoutOutput: ConversionRequest = {
        sourcePath: '/test/input.csv',
        targetFormat: 'json'
      };

      // Mock successful conversion
      jest.spyOn(orchestrator as any, 'detectSourceFormat').mockResolvedValue('csv');
      jest.spyOn(orchestrator as any, 'validateSourceFile').mockResolvedValue(undefined);
      jest.spyOn(orchestrator as any, 'readSourceData').mockResolvedValue(sampleData);
      jest.spyOn(orchestrator as any, 'writeTargetData').mockResolvedValue(undefined);

      const result = await orchestrator.convertFile(requestWithoutOutput);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/test/input.json');
    });
  });

  describe('getSupportedFormats', () => {
    it('should return supported input and output formats', () => {
      const formats = orchestrator.getSupportedFormats();

      expect(formats.input).toEqual(['csv', 'xlsx', 'json', 'xml', 'md']);
      expect(formats.output).toEqual(['csv', 'xlsx', 'json', 'xml', 'md']);
    });
  });

  describe('validateTransformation', () => {
    it('should validate correct keyStyle transformation', () => {
      const transformation: DataTransformation = {
        type: 'keyStyle',
        parameters: { style: 'camelCase' }
      };

      const result = orchestrator.validateTransformation(transformation);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid keyStyle', () => {
      const transformation: DataTransformation = {
        type: 'keyStyle',
        parameters: { style: 'invalidStyle' }
      };

      const result = orchestrator.validateTransformation(transformation);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid key style: invalidStyle');
    });

    it('should validate columnOperation transformation', () => {
      const transformation: DataTransformation = {
        type: 'columnOperation',
        parameters: {
          operations: [
            { type: 'add', columnName: 'status', defaultValue: 'active' }
          ]
        }
      };

      const result = orchestrator.validateTransformation(transformation);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing column operations', () => {
      const transformation: DataTransformation = {
        type: 'columnOperation',
        parameters: {}
      };

      const result = orchestrator.validateTransformation(transformation);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Column operations are required for columnOperation transformation');
    });

    it('should validate filter transformation', () => {
      const transformation: DataTransformation = {
        type: 'filter',
        parameters: {
          columnFilters: [
            { columnName: 'age', operator: 'greaterThan', value: 25 }
          ]
        }
      };

      const result = orchestrator.validateTransformation(transformation);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about empty filter criteria', () => {
      const transformation: DataTransformation = {
        type: 'filter',
        parameters: {}
      };

      const result = orchestrator.validateTransformation(transformation);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('No filter criteria specified');
    });

    it('should detect missing transformation type', () => {
      const transformation: DataTransformation = {
        type: '' as any,
        parameters: {}
      };

      const result = orchestrator.validateTransformation(transformation);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Transformation type is required');
    });

    it('should detect missing parameters', () => {
      const transformation: DataTransformation = {
        type: 'keyStyle',
        parameters: undefined as any
      };

      const result = orchestrator.validateTransformation(transformation);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Transformation parameters are required');
    });

    it('should warn about unknown transformation types', () => {
      const transformation: DataTransformation = {
        type: 'unknownType' as any,
        parameters: {}
      };

      const result = orchestrator.validateTransformation(transformation);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Unknown transformation type: unknownType');
    });
  });

  describe('getConversionProgress', () => {
    it('should return conversion progress', () => {
      const progress = orchestrator.getConversionProgress('test-id');

      expect(progress).toEqual({
        id: 'test-id',
        status: 'completed',
        progress: 100,
        message: 'Conversion completed'
      });
    });
  });

  describe('getConversionStatistics', () => {
    it('should return conversion statistics', () => {
      const stats = orchestrator.getConversionStatistics();

      expect(stats).toEqual({
        totalConversions: 0,
        successfulConversions: 0,
        failedConversions: 0,
        averageDuration: 0,
        formatBreakdown: {}
      });
    });
  });

  describe('static factory methods', () => {
    it('should create conversion request', () => {
      const request = ConversionOrchestrator.createConversionRequest({
        sourcePath: '/test/input.csv',
        targetFormat: 'json',
        outputPath: '/test/output.json'
      });

      expect(request).toEqual({
        sourcePath: '/test/input.csv',
        targetFormat: 'json',
        outputPath: '/test/output.json',
        transformations: [],
        options: undefined
      });
    });

    it('should create transformation', () => {
      const transformation = ConversionOrchestrator.createTransformation('keyStyle', {
        style: 'camelCase'
      });

      expect(transformation).toEqual({
        type: 'keyStyle',
        parameters: { style: 'camelCase' }
      });
    });
  });

  describe('private methods', () => {
    describe('isValidFilePath', () => {
      it('should validate safe file paths', () => {
        const orchestratorAny = orchestrator as any;
        
        expect(orchestratorAny.isValidFilePath('/safe/path/file.csv')).toBe(true);
        expect(orchestratorAny.isValidFilePath('relative/path/file.json')).toBe(true);
        expect(orchestratorAny.isValidFilePath('file.xlsx')).toBe(true);
      });

      it('should reject unsafe file paths', () => {
        const orchestratorAny = orchestrator as any;
        
        expect(orchestratorAny.isValidFilePath('../../../etc/passwd')).toBe(false);
        expect(orchestratorAny.isValidFilePath('~/secret/file')).toBe(false);
        expect(orchestratorAny.isValidFilePath('file<script>.csv')).toBe(false);
        expect(orchestratorAny.isValidFilePath('')).toBe(false);
        expect(orchestratorAny.isValidFilePath(null)).toBe(false);
      });
    });

    describe('getFileExtension', () => {
      it('should return correct file extensions', () => {
        const orchestratorAny = orchestrator as any;
        
        expect(orchestratorAny.getFileExtension('csv')).toBe('csv');
        expect(orchestratorAny.getFileExtension('xlsx')).toBe('xlsx');
        expect(orchestratorAny.getFileExtension('json')).toBe('json');
        expect(orchestratorAny.getFileExtension('xml')).toBe('xml');
        expect(orchestratorAny.getFileExtension('md')).toBe('md');
      });
    });

    describe('collectWarnings', () => {
      it('should detect row loss', () => {
        const orchestratorAny = orchestrator as any;
        const originalData = { ...sampleData };
        const transformedData = {
          ...sampleData,
          rows: sampleData.rows.slice(0, 1),
          metadata: { ...sampleData.metadata, totalRows: 1 }
        };

        const warnings = orchestratorAny.collectWarnings(originalData, transformedData);

        expect(warnings).toContain('1 rows were filtered out during transformation');
      });

      it('should detect column changes', () => {
        const orchestratorAny = orchestrator as any;
        const originalData = { ...sampleData };
        const transformedData = {
          ...sampleData,
          headers: ['name', 'age'], // Removed email column
          rows: sampleData.rows.map(row => ({ name: row.name, age: row.age }))
        };

        const warnings = orchestratorAny.collectWarnings(originalData, transformedData);

        expect(warnings).toContain('1 columns were removed during transformation');
      });

      it('should detect added columns', () => {
        const orchestratorAny = orchestrator as any;
        const originalData = { ...sampleData };
        const transformedData = {
          ...sampleData,
          headers: [...sampleData.headers!, 'status'], // Added status column
          rows: sampleData.rows.map(row => ({ ...row, status: 'active' }))
        };

        const warnings = orchestratorAny.collectWarnings(originalData, transformedData);

        expect(warnings).toContain('1 columns were added during transformation');
      });
    });
  });
});