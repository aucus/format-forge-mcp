import { ConversionOrchestrator } from '../core/ConversionOrchestrator.js';
import { AuditLogger } from '../core/AuditLogger.js';
import { ErrorRecovery } from '../errors/ErrorRecovery.js';
import { ConversionError } from '../errors/ConversionError.js';
import { Logger } from '../core/Logger.js';
import { 
  ConversionRequest, 
  ConversionResponse, 
  SupportedFormat, 
  DataTransformation,
  KeyStyle 
} from '../types/index.js';

/**
 * MCP command parameters for format conversion
 */
export interface ConvertFormatParams {
  sourcePath: string;
  targetFormat: SupportedFormat;
  outputPath?: string;
  transformations?: {
    keyStyle?: KeyStyle;
    columnOperations?: Array<{
      type: 'add' | 'remove' | 'rename';
      columnName: string;
      newName?: string;
      defaultValue?: any;
    }>;
    filters?: {
      columnFilters?: Array<{
        columnName: string;
        operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between';
        value: any;
      }>;
      dateRange?: {
        dateColumn: string;
        startDate: string;
        endDate: string;
      };
      customConditions?: string[];
    };
  };
  options?: {
    encoding?: string;
    sheetName?: string;
    sheetIndex?: number;
    includeHeaders?: boolean;
    dateFormat?: string;
    nullValue?: string;
  };
  userId?: string;
  sessionId?: string;
}

/**
 * MCP command response for format conversion
 */
export interface ConvertFormatResult {
  success: boolean;
  outputPath?: string;
  message: string;
  warnings?: string[];
  metadata?: {
    sourceFormat?: SupportedFormat;
    targetFormat: SupportedFormat;
    originalRows?: number;
    convertedRows?: number;
    originalColumns?: number;
    convertedColumns?: number;
    duration?: number;
    fileSize?: number;
  };
  errors?: Array<{
    code: string;
    message: string;
    severity: string;
    recoverable: boolean;
    suggestions?: string[];
  }>;
}

/**
 * Main MCP command handler for format conversion
 */
export class ConvertFormatCommand {
  private orchestrator: ConversionOrchestrator;
  private auditLogger: AuditLogger;
  private errorRecovery: ErrorRecovery;
  private logger: Logger;

  constructor() {
    this.orchestrator = new ConversionOrchestrator();
    this.auditLogger = new AuditLogger({
      auditLogPath: './logs/audit.log',
      metricsLogPath: './logs/metrics.log'
    });
    this.errorRecovery = new ErrorRecovery();
    this.logger = Logger.getInstance();
  }

  /**
   * Execute the convert_format command
   */
  async execute(params: ConvertFormatParams): Promise<ConvertFormatResult> {
    const startTime = Date.now();
    const operationId = this.generateOperationId();

    this.logger.info('Starting format conversion command', {
      operationId,
      sourcePath: params.sourcePath,
      targetFormat: params.targetFormat,
      userId: params.userId
    });

    try {
      // Validate parameters
      this.validateParameters(params);

      // Create conversion request
      const request = this.createConversionRequest(params);

      // Execute conversion with retry logic
      const response = await this.errorRecovery.withRetry(
        () => this.orchestrator.convertFile(request),
        `convert_format_${operationId}`,
        {
          maxRetries: 2,
          retryDelays: [1000, 2000]
        }
      );

      const duration = Date.now() - startTime;

      // Log successful conversion
      await this.auditLogger.logConversion(
        params.sourcePath,
        params.targetFormat,
        'success',
        duration,
        params.userId,
        {
          outputPath: response.outputPath,
          transformations: params.transformations,
          sessionId: params.sessionId
        }
      );

      // Create success result
      const result: ConvertFormatResult = {
        success: true,
        outputPath: response.outputPath,
        message: response.message,
        warnings: response.warnings,
        metadata: {
          targetFormat: params.targetFormat,
          duration
        }
      };

      this.logger.info('Format conversion completed successfully', {
        operationId,
        duration,
        outputPath: response.outputPath
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const conversionError = error instanceof ConversionError 
        ? error 
        : ConversionError.unknownError(error as Error, { operationId, params });

      // Log failed conversion
      await this.auditLogger.logConversion(
        params.sourcePath,
        params.targetFormat,
        'failure',
        duration,
        params.userId,
        {
          error: conversionError.code,
          errorMessage: conversionError.message,
          sessionId: params.sessionId
        }
      );

      // Log error details
      await this.auditLogger.logError(conversionError, { operationId, params }, params.userId);

      // Create error result
      const result: ConvertFormatResult = {
        success: false,
        message: conversionError.getUserMessage(),
        metadata: {
          targetFormat: params.targetFormat,
          duration
        },
        errors: [{
          code: conversionError.code,
          message: conversionError.message,
          severity: conversionError.severity,
          recoverable: conversionError.recoverable,
          suggestions: this.errorRecovery.getRecoverySuggestions(conversionError)
        }]
      };

      this.logger.error('Format conversion failed', conversionError, {
        operationId,
        duration,
        userId: params.userId
      });

      return result;
    }
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): {
    input: SupportedFormat[];
    output: SupportedFormat[];
  } {
    return this.orchestrator.getSupportedFormats();
  }

  /**
   * Validate conversion parameters
   */
  validateParameters(params: ConvertFormatParams): void {
    const errors: string[] = [];

    // Required parameters
    if (!params.sourcePath) {
      errors.push('sourcePath is required');
    }

    if (!params.targetFormat) {
      errors.push('targetFormat is required');
    }

    // Validate target format
    const supportedFormats = this.getSupportedFormats();
    if (params.targetFormat && !supportedFormats.output.includes(params.targetFormat)) {
      errors.push(`Unsupported target format: ${params.targetFormat}. Supported formats: ${supportedFormats.output.join(', ')}`);
    }

    // Validate transformations
    if (params.transformations) {
      this.validateTransformations(params.transformations, errors);
    }

    // Validate options
    if (params.options) {
      this.validateOptions(params.options, errors);
    }

    if (errors.length > 0) {
      throw ConversionError.validationFailed(errors);
    }
  }

  /**
   * Validate transformation parameters
   */
  private validateTransformations(transformations: ConvertFormatParams['transformations'], errors: string[]): void {
    if (!transformations) return;

    // Validate key style
    if (transformations.keyStyle) {
      const validKeyStyles: KeyStyle[] = ['camelCase', 'snake_case', 'lowercase', 'uppercase'];
      if (!validKeyStyles.includes(transformations.keyStyle)) {
        errors.push(`Invalid keyStyle: ${transformations.keyStyle}. Valid options: ${validKeyStyles.join(', ')}`);
      }
    }

    // Validate column operations
    if (transformations.columnOperations) {
      transformations.columnOperations.forEach((op, index) => {
        if (!op.type) {
          errors.push(`Column operation ${index + 1}: type is required`);
        }
        if (!op.columnName) {
          errors.push(`Column operation ${index + 1}: columnName is required`);
        }
        if (op.type === 'rename' && !op.newName) {
          errors.push(`Column operation ${index + 1}: newName is required for rename operation`);
        }
      });
    }

    // Validate filters
    if (transformations.filters) {
      this.validateFilters(transformations.filters, errors);
    }
  }

  /**
   * Validate filter parameters
   */
  private validateFilters(filters: NonNullable<ConvertFormatParams['transformations']>['filters'], errors: string[]): void {
    if (!filters) return;

    // Validate column filters
    if (filters.columnFilters) {
      filters.columnFilters.forEach((filter: any, index: number) => {
        if (!filter.columnName) {
          errors.push(`Column filter ${index + 1}: columnName is required`);
        }
        if (!filter.operator) {
          errors.push(`Column filter ${index + 1}: operator is required`);
        }
        if (filter.value === undefined) {
          errors.push(`Column filter ${index + 1}: value is required`);
        }
        if (filter.operator === 'between' && !Array.isArray(filter.value)) {
          errors.push(`Column filter ${index + 1}: between operator requires an array of two values`);
        }
      });
    }

    // Validate date range
    if (filters.dateRange) {
      if (!filters.dateRange.dateColumn) {
        errors.push('Date range filter: dateColumn is required');
      }
      if (!filters.dateRange.startDate) {
        errors.push('Date range filter: startDate is required');
      }
      if (!filters.dateRange.endDate) {
        errors.push('Date range filter: endDate is required');
      }
    }
  }

  /**
   * Validate option parameters
   */
  private validateOptions(options: NonNullable<ConvertFormatParams['options']>, errors: string[]): void {
    if (!options) return;

    // Validate encoding
    if (options.encoding) {
      const validEncodings = ['utf8', 'utf-8', 'ascii', 'latin1', 'base64', 'hex'];
      if (!validEncodings.includes(options.encoding.toLowerCase())) {
        errors.push(`Invalid encoding: ${options.encoding}. Valid options: ${validEncodings.join(', ')}`);
      }
    }

    // Validate sheet index
    if (options.sheetIndex !== undefined && options.sheetIndex < 0) {
      errors.push('sheetIndex must be non-negative');
    }
  }

  /**
   * Create conversion request from parameters
   */
  private createConversionRequest(params: ConvertFormatParams): ConversionRequest {
    const transformations: DataTransformation[] = [];

    if (params.transformations) {
      // Add key style transformation
      if (params.transformations.keyStyle) {
        transformations.push({
          type: 'keyStyle',
          parameters: { style: params.transformations.keyStyle }
        });
      }

      // Add column operations
      if (params.transformations.columnOperations) {
        transformations.push({
          type: 'columnOperation',
          parameters: { operations: params.transformations.columnOperations }
        });
      }

      // Add filters
      if (params.transformations.filters) {
        transformations.push({
          type: 'filter',
          parameters: params.transformations.filters
        });
      }
    }

    return {
      sourcePath: params.sourcePath,
      targetFormat: params.targetFormat,
      outputPath: params.outputPath,
      transformations,
      options: params.options
    };
  }

  /**
   * Generate unique operation ID
   */
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get command help information
   */
  getHelp(): {
    description: string;
    parameters: Array<{
      name: string;
      type: string;
      required: boolean;
      description: string;
      examples?: string[];
    }>;
    examples: Array<{
      title: string;
      parameters: Record<string, any>;
      description: string;
    }>;
  } {
    return {
      description: 'Convert files between different formats (CSV, Excel, JSON, XML, Markdown) with optional data transformations',
      parameters: [
        {
          name: 'sourcePath',
          type: 'string',
          required: true,
          description: 'Path to the source file to convert',
          examples: ['/path/to/data.csv', './input/spreadsheet.xlsx', 'data.json']
        },
        {
          name: 'targetFormat',
          type: 'string',
          required: true,
          description: 'Target format for conversion',
          examples: ['csv', 'xlsx', 'json', 'xml', 'md']
        },
        {
          name: 'outputPath',
          type: 'string',
          required: false,
          description: 'Output file path (optional, defaults to source directory with new extension)'
        },
        {
          name: 'transformations',
          type: 'object',
          required: false,
          description: 'Optional data transformations to apply during conversion'
        },
        {
          name: 'options',
          type: 'object',
          required: false,
          description: 'Format-specific options (encoding, sheet selection, etc.)'
        },
        {
          name: 'userId',
          type: 'string',
          required: false,
          description: 'User ID for audit logging'
        }
      ],
      examples: [
        {
          title: 'Basic CSV to JSON conversion',
          parameters: {
            sourcePath: './data/sales.csv',
            targetFormat: 'json'
          },
          description: 'Convert a CSV file to JSON format'
        },
        {
          title: 'Excel to CSV with transformations',
          parameters: {
            sourcePath: './reports/quarterly.xlsx',
            targetFormat: 'csv',
            transformations: {
              keyStyle: 'snake_case',
              columnOperations: [
                { type: 'remove', columnName: 'internal_id' },
                { type: 'rename', columnName: 'customer_name', newName: 'client_name' }
              ]
            },
            options: {
              sheetName: 'Q1 Data',
              includeHeaders: true
            }
          },
          description: 'Convert Excel to CSV with column transformations and specific sheet selection'
        },
        {
          title: 'JSON to XML with filtering',
          parameters: {
            sourcePath: './api/users.json',
            targetFormat: 'xml',
            outputPath: './output/filtered_users.xml',
            transformations: {
              filters: {
                columnFilters: [
                  { columnName: 'status', operator: 'equals', value: 'active' },
                  { columnName: 'age', operator: 'greaterThan', value: 18 }
                ]
              }
            }
          },
          description: 'Convert JSON to XML with data filtering'
        }
      ]
    };
  }
}