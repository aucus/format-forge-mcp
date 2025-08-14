import { ConvertFormatCommand, ConvertFormatParams } from '../commands/ConvertFormatCommand.js';
import { ConversionOrchestrator } from '../core/ConversionOrchestrator.js';
import { AuditLogger } from '../core/AuditLogger.js';
import { ErrorRecovery } from '../errors/ErrorRecovery.js';
import { ConversionError } from '../errors/ConversionError.js';

// Mock dependencies
jest.mock('../core/ConversionOrchestrator');
jest.mock('../core/AuditLogger');
jest.mock('../errors/ErrorRecovery');

const MockConversionOrchestrator = ConversionOrchestrator as jest.MockedClass<typeof ConversionOrchestrator>;
const MockAuditLogger = AuditLogger as jest.MockedClass<typeof AuditLogger>;
const MockErrorRecovery = ErrorRecovery as jest.MockedClass<typeof ErrorRecovery>;

describe('ConvertFormatCommand', () => {
  let command: ConvertFormatCommand;
  let mockOrchestrator: jest.Mocked<ConversionOrchestrator>;
  let mockAuditLogger: jest.Mocked<AuditLogger>;
  let mockErrorRecovery: jest.Mocked<ErrorRecovery>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock instances
    mockOrchestrator = new MockConversionOrchestrator() as jest.Mocked<ConversionOrchestrator>;
    mockAuditLogger = new MockAuditLogger() as jest.Mocked<AuditLogger>;
    mockErrorRecovery = new MockErrorRecovery() as jest.Mocked<ErrorRecovery>;

    // Setup default mock implementations
    mockOrchestrator.getSupportedFormats.mockReturnValue({
      input: ['csv', 'xlsx', 'json', 'xml', 'md'],
      output: ['csv', 'xlsx', 'json', 'xml', 'md']
    });

    mockOrchestrator.convertFile.mockResolvedValue({
      success: true,
      outputPath: '/output/converted.json',
      message: 'Conversion successful'
    });

    mockErrorRecovery.withRetry.mockImplementation(async (operation) => {
      return await operation();
    });

    mockAuditLogger.logConversion.mockResolvedValue();
    mockAuditLogger.logError.mockResolvedValue();

    // Create command instance
    command = new ConvertFormatCommand();

    // Replace instances with mocks
    (command as any).orchestrator = mockOrchestrator;
    (command as any).auditLogger = mockAuditLogger;
    (command as any).errorRecovery = mockErrorRecovery;
  });

  describe('execute', () => {
    const validParams: ConvertFormatParams = {
      sourcePath: '/input/data.csv',
      targetFormat: 'json',
      userId: 'user123'
    };

    it('should execute successful conversion', async () => {
      const result = await command.execute(validParams);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe('/output/converted.json');
      expect(result.message).toBe('Conversion successful');
      expect(result.metadata?.targetFormat).toBe('json');
      expect(result.metadata?.duration).toBeGreaterThan(0);

      expect(mockOrchestrator.convertFile).toHaveBeenCalledWith({
        sourcePath: '/input/data.csv',
        targetFormat: 'json',
        outputPath: undefined,
        transformations: [],
        options: undefined
      });

      expect(mockAuditLogger.logConversion).toHaveBeenCalledWith(
        '/input/data.csv',
        'json',
        'success',
        expect.any(Number),
        'user123',
        expect.any(Object)
      );
    });

    it('should handle conversion failure', async () => {
      const error = ConversionError.fileNotFound('/input/data.csv');
      mockOrchestrator.convertFile.mockRejectedValue(error);

      const result = await command.execute(validParams);

      expect(result.success).toBe(false);
      expect(result.message).toBe(error.getUserMessage());
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].code).toBe('FILE_NOT_FOUND');
      expect(result.errors![0].recoverable).toBe(false);

      expect(mockAuditLogger.logConversion).toHaveBeenCalledWith(
        '/input/data.csv',
        'json',
        'failure',
        expect.any(Number),
        'user123',
        expect.objectContaining({
          error: 'FILE_NOT_FOUND'
        })
      );

      expect(mockAuditLogger.logError).toHaveBeenCalledWith(
        error,
        expect.any(Object),
        'user123'
      );
    });

    it('should apply transformations', async () => {
      const paramsWithTransformations: ConvertFormatParams = {
        ...validParams,
        transformations: {
          keyStyle: 'snake_case',
          columnOperations: [
            { type: 'remove', columnName: 'id' },
            { type: 'rename', columnName: 'name', newName: 'full_name' }
          ],
          filters: {
            columnFilters: [
              { columnName: 'status', operator: 'equals', value: 'active' }
            ]
          }
        }
      };

      await command.execute(paramsWithTransformations);

      expect(mockOrchestrator.convertFile).toHaveBeenCalledWith({
        sourcePath: '/input/data.csv',
        targetFormat: 'json',
        outputPath: undefined,
        transformations: [
          { type: 'keyStyle', parameters: { style: 'snake_case' } },
          { 
            type: 'columnOperation', 
            parameters: { 
              operations: [
                { type: 'remove', columnName: 'id' },
                { type: 'rename', columnName: 'name', newName: 'full_name' }
              ]
            }
          },
          {
            type: 'filter',
            parameters: {
              columnFilters: [
                { columnName: 'status', operator: 'equals', value: 'active' }
              ]
            }
          }
        ],
        options: undefined
      });
    });

    it('should pass through options', async () => {
      const paramsWithOptions: ConvertFormatParams = {
        ...validParams,
        options: {
          encoding: 'utf-8',
          sheetName: 'Sheet1',
          includeHeaders: true
        }
      };

      await command.execute(paramsWithOptions);

      expect(mockOrchestrator.convertFile).toHaveBeenCalledWith(
        expect.objectContaining({
          options: {
            encoding: 'utf-8',
            sheetName: 'Sheet1',
            includeHeaders: true
          }
        })
      );
    });

    it('should use retry mechanism', async () => {
      await command.execute(validParams);

      expect(mockErrorRecovery.withRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.stringMatching(/convert_format_op_/),
        {
          maxRetries: 2,
          retryDelays: [1000, 2000]
        }
      );
    });
  });

  describe('validateParameters', () => {
    it('should validate required parameters', () => {
      expect(() => command.validateParameters({} as ConvertFormatParams))
        .toThrow('sourcePath is required');

      expect(() => command.validateParameters({ sourcePath: '/test' } as ConvertFormatParams))
        .toThrow('targetFormat is required');
    });

    it('should validate target format', () => {
      expect(() => command.validateParameters({
        sourcePath: '/test',
        targetFormat: 'invalid' as any
      })).toThrow('Unsupported target format: invalid');
    });

    it('should validate key style', () => {
      expect(() => command.validateParameters({
        sourcePath: '/test',
        targetFormat: 'json',
        transformations: {
          keyStyle: 'invalid' as any
        }
      })).toThrow('Invalid keyStyle: invalid');
    });

    it('should validate column operations', () => {
      expect(() => command.validateParameters({
        sourcePath: '/test',
        targetFormat: 'json',
        transformations: {
          columnOperations: [
            { type: 'remove', columnName: '' }
          ]
        }
      })).toThrow('columnName is required');

      expect(() => command.validateParameters({
        sourcePath: '/test',
        targetFormat: 'json',
        transformations: {
          columnOperations: [
            { type: 'rename', columnName: 'old', newName: '' }
          ]
        }
      })).toThrow('newName is required for rename operation');
    });

    it('should validate filters', () => {
      expect(() => command.validateParameters({
        sourcePath: '/test',
        targetFormat: 'json',
        transformations: {
          filters: {
            columnFilters: [
              { columnName: '', operator: 'equals', value: 'test' }
            ]
          }
        }
      })).toThrow('columnName is required');

      expect(() => command.validateParameters({
        sourcePath: '/test',
        targetFormat: 'json',
        transformations: {
          filters: {
            columnFilters: [
              { columnName: 'test', operator: 'between', value: 'not-array' }
            ]
          }
        }
      })).toThrow('between operator requires an array of two values');
    });

    it('should validate date range filters', () => {
      expect(() => command.validateParameters({
        sourcePath: '/test',
        targetFormat: 'json',
        transformations: {
          filters: {
            dateRange: {
              dateColumn: '',
              startDate: '2023-01-01',
              endDate: '2023-12-31'
            }
          }
        }
      })).toThrow('dateColumn is required');
    });

    it('should validate options', () => {
      expect(() => command.validateParameters({
        sourcePath: '/test',
        targetFormat: 'json',
        options: {
          encoding: 'invalid-encoding'
        }
      })).toThrow('Invalid encoding: invalid-encoding');

      expect(() => command.validateParameters({
        sourcePath: '/test',
        targetFormat: 'json',
        options: {
          sheetIndex: -1
        }
      })).toThrow('sheetIndex must be non-negative');
    });

    it('should pass validation for valid parameters', () => {
      expect(() => command.validateParameters({
        sourcePath: '/test/file.csv',
        targetFormat: 'json',
        transformations: {
          keyStyle: 'camelCase',
          columnOperations: [
            { type: 'add', columnName: 'newCol', defaultValue: 'default' },
            { type: 'rename', columnName: 'oldCol', newName: 'newCol' }
          ],
          filters: {
            columnFilters: [
              { columnName: 'status', operator: 'equals', value: 'active' },
              { columnName: 'age', operator: 'between', value: [18, 65] }
            ],
            dateRange: {
              dateColumn: 'created_at',
              startDate: '2023-01-01',
              endDate: '2023-12-31'
            }
          }
        },
        options: {
          encoding: 'utf-8',
          sheetIndex: 0,
          includeHeaders: true
        }
      })).not.toThrow();
    });
  });

  describe('getSupportedFormats', () => {
    it('should return supported formats', () => {
      const formats = command.getSupportedFormats();

      expect(formats.input).toEqual(['csv', 'xlsx', 'json', 'xml', 'md']);
      expect(formats.output).toEqual(['csv', 'xlsx', 'json', 'xml', 'md']);
      expect(mockOrchestrator.getSupportedFormats).toHaveBeenCalled();
    });
  });

  describe('getHelp', () => {
    it('should return help information', () => {
      const help = command.getHelp();

      expect(help.description).toBeDefined();
      expect(help.parameters).toBeInstanceOf(Array);
      expect(help.examples).toBeInstanceOf(Array);

      // Check required parameters
      const requiredParams = help.parameters.filter(p => p.required);
      expect(requiredParams).toHaveLength(2);
      expect(requiredParams.map(p => p.name)).toEqual(['sourcePath', 'targetFormat']);

      // Check examples
      expect(help.examples.length).toBeGreaterThan(0);
      expect(help.examples[0]).toHaveProperty('title');
      expect(help.examples[0]).toHaveProperty('parameters');
      expect(help.examples[0]).toHaveProperty('description');
    });
  });

  describe('error handling', () => {
    it('should handle unknown errors', async () => {
      const unknownError = new Error('Unknown error');
      mockOrchestrator.convertFile.mockRejectedValue(unknownError);

      const result = await command.execute({
        sourcePath: '/test',
        targetFormat: 'json'
      });

      expect(result.success).toBe(false);
      expect(result.errors![0].code).toBe('UNKNOWN_ERROR');
      expect(result.message).toContain('An unexpected error occurred');
    });

    it('should include recovery suggestions in error response', async () => {
      const error = ConversionError.fileNotFound('/test/file.csv');
      mockOrchestrator.convertFile.mockRejectedValue(error);
      mockErrorRecovery.getRecoverySuggestions.mockReturnValue([
        'Check if the file exists',
        'Verify file permissions'
      ]);

      const result = await command.execute({
        sourcePath: '/test/file.csv',
        targetFormat: 'json'
      });

      expect(result.errors![0].suggestions).toEqual([
        'Check if the file exists',
        'Verify file permissions'
      ]);
    });
  });

  describe('audit logging', () => {
    it('should log successful conversions', async () => {
      await command.execute({
        sourcePath: '/test/file.csv',
        targetFormat: 'json',
        userId: 'user123',
        sessionId: 'session456'
      });

      expect(mockAuditLogger.logConversion).toHaveBeenCalledWith(
        '/test/file.csv',
        'json',
        'success',
        expect.any(Number),
        'user123',
        expect.objectContaining({
          sessionId: 'session456'
        })
      );
    });

    it('should log failed conversions', async () => {
      const error = ConversionError.conversionFailed('Parse error');
      mockOrchestrator.convertFile.mockRejectedValue(error);

      await command.execute({
        sourcePath: '/test/file.csv',
        targetFormat: 'json',
        userId: 'user123'
      });

      expect(mockAuditLogger.logConversion).toHaveBeenCalledWith(
        '/test/file.csv',
        'json',
        'failure',
        expect.any(Number),
        'user123',
        expect.objectContaining({
          error: 'CONVERSION_FAILED'
        })
      );

      expect(mockAuditLogger.logError).toHaveBeenCalledWith(
        error,
        expect.any(Object),
        'user123'
      );
    });
  });
});