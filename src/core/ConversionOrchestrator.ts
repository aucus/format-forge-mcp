import { DataStructure, ConversionRequest, ConversionResponse, DataTransformation, SupportedFormat } from '../types/index.js';
import { Logger } from './Logger.js';
import { FormatDetector } from './FormatDetector.js';
import { FormatValidator } from './FormatValidator.js';
import { FormatHandlerFactory } from '../handlers/FormatHandlerFactory.js';
import { KeyTransformer } from '../transformers/KeyTransformer.js';
import { ColumnManipulator } from '../transformers/ColumnManipulator.js';
import { DataFilter } from '../transformers/DataFilter.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Main conversion orchestrator that coordinates format handlers and transformations
 */
export class ConversionOrchestrator {
  private logger: Logger;
  private formatDetector: FormatDetector;
  private formatValidator: FormatValidator;
  private handlerFactory: FormatHandlerFactory;
  private keyTransformer: KeyTransformer;
  private columnManipulator: ColumnManipulator;
  private dataFilter: DataFilter;

  constructor() {
    this.logger = Logger.getInstance();
    this.formatDetector = new FormatDetector();
    this.formatValidator = new FormatValidator();
    this.handlerFactory = FormatHandlerFactory.getInstance();
    this.keyTransformer = new KeyTransformer();
    this.columnManipulator = new ColumnManipulator();
    this.dataFilter = new DataFilter();
    
    // Initialize format handlers
    this.initializeHandlers();
  }

  /**
   * Initialize format handlers
   */
  private async initializeHandlers(): Promise<void> {
    try {
      const { FormatHandlerRegistry } = await import('../handlers/FormatHandlerRegistry.js');
      const registry = FormatHandlerRegistry.getInstance();
      await registry.initializeDefaultHandlers();
    } catch (error) {
      this.logger.error('Failed to initialize format handlers', error as Error);
    }
  }

  /**
   * Convert a file from one format to another with optional transformations
   */
  async convertFile(request: ConversionRequest): Promise<ConversionResponse> {
    const startTime = Date.now();
    this.logger.info('Starting file conversion', { request });

    try {
      // Validate request
      this.validateConversionRequest(request);

      // Detect source format if not specified
      const sourceFormat = await this.detectSourceFormat(request.sourcePath);
      this.logger.debug('Source format detected', { sourceFormat });

      // Validate source file
      await this.validateSourceFile(request.sourcePath, sourceFormat);

      // Read source data
      const sourceData = await this.readSourceData(request.sourcePath, sourceFormat, request.options);
      this.logger.debug('Source data loaded', { 
        rows: sourceData.rows.length,
        columns: sourceData.metadata.totalColumns 
      });

      // Apply transformations
      let transformedData = sourceData;
      if (request.transformations && request.transformations.length > 0) {
        transformedData = await this.applyTransformations(sourceData, request.transformations);
        this.logger.debug('Transformations applied', { 
          originalRows: sourceData.rows.length,
          transformedRows: transformedData.rows.length 
        });
      }

      // Determine output path
      const outputPath = this.determineOutputPath(request);

      // Validate target format
      this.validateTargetFormat(request.targetFormat);

      // Write target data
      await this.writeTargetData(transformedData, outputPath, request.targetFormat, request.options);

      const duration = Date.now() - startTime;
      this.logger.info('File conversion completed', { 
        outputPath, 
        duration: `${duration}ms`,
        sourceRows: sourceData.rows.length,
        targetRows: transformedData.rows.length
      });

      return {
        success: true,
        outputPath,
        message: `Successfully converted ${sourceFormat} to ${request.targetFormat}`,
        warnings: this.collectWarnings(sourceData, transformedData)
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('File conversion failed', error as Error, { 
        request, 
        duration: `${duration}ms` 
      });

      return {
        success: false,
        message: `Conversion failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Convert data structure from one format to another
   */
  async convertData(
    data: DataStructure,
    targetFormat: SupportedFormat,
    transformations?: DataTransformation[]
  ): Promise<{ data: DataStructure; warnings: string[] }> {
    this.logger.debug('Starting data conversion', { 
      targetFormat,
      transformationCount: transformations?.length || 0 
    });

    try {
      // Apply transformations
      let transformedData = data;
      if (transformations && transformations.length > 0) {
        transformedData = await this.applyTransformations(data, transformations);
      }

      // Update metadata for target format
      transformedData.metadata = {
        ...transformedData.metadata,
        originalFormat: targetFormat
      };

      return {
        data: transformedData,
        warnings: this.collectWarnings(data, transformedData)
      };

    } catch (error) {
      this.logger.error('Data conversion failed', error as Error);
      throw error;
    }
  }

  /**
   * Get conversion progress for long-running operations
   */
  getConversionProgress(conversionId: string): {
    id: string;
    status: 'pending' | 'reading' | 'transforming' | 'writing' | 'completed' | 'failed';
    progress: number;
    message: string;
  } {
    // This would be implemented with a proper progress tracking system
    // For now, return a placeholder
    return {
      id: conversionId,
      status: 'completed',
      progress: 100,
      message: 'Conversion completed'
    };
  }

  /**
   * Validate conversion request
   */
  private validateConversionRequest(request: ConversionRequest): void {
    const errors: string[] = [];

    if (!request.sourcePath) {
      errors.push('Source path is required');
    }

    if (!request.targetFormat) {
      errors.push('Target format is required');
    }

    if (request.sourcePath && !fs.existsSync(request.sourcePath)) {
      errors.push(`Source file does not exist: ${request.sourcePath}`);
    }

    if (request.sourcePath && !this.isValidFilePath(request.sourcePath)) {
      errors.push('Invalid source file path');
    }

    if (request.outputPath && !this.isValidFilePath(request.outputPath)) {
      errors.push('Invalid output file path');
    }

    if (errors.length > 0) {
      throw ConversionError.validationFailed(errors);
    }
  }

  /**
   * Detect source format from file
   */
  private async detectSourceFormat(filePath: string): Promise<SupportedFormat> {
    try {
      const result = await this.formatDetector.detectFormat(filePath);
      return result.format;
    } catch (error) {
      throw ConversionError.unsupportedFormat(
        `Could not detect format for file: ${filePath}`
      );
    }
  }

  /**
   * Validate source file
   */
  private async validateSourceFile(filePath: string, format: SupportedFormat): Promise<void> {
    try {
      const isValid = await this.formatValidator.validateFile(filePath, format);
      if (!isValid) {
        throw ConversionError.validationFailed([
          `Source file is not a valid ${format} file: ${filePath}`
        ]);
      }
    } catch (error) {
      if (error instanceof ConversionError) {
        throw error;
      }
      throw ConversionError.validationFailed([
        `Could not validate source file: ${(error as Error).message}`
      ]);
    }
  }

  /**
   * Read source data using appropriate handler
   */
  private async readSourceData(
    filePath: string,
    format: SupportedFormat,
    options?: any
  ): Promise<DataStructure> {
    try {
      const handler = this.handlerFactory.createHandler(format);
      return await handler.read(filePath, options);
    } catch (error) {
      throw ConversionError.conversionFailed(
        `Failed to read source file: ${(error as Error).message}`,
        { filePath, format }
      );
    }
  }

  /**
   * Apply transformations to data
   */
  private async applyTransformations(
    data: DataStructure,
    transformations: DataTransformation[]
  ): Promise<DataStructure> {
    let result = data;

    for (const transformation of transformations) {
      this.logger.debug('Applying transformation', { transformation });

      try {
        switch (transformation.type) {
          case 'keyStyle':
            result = this.keyTransformer.transformKeys(result, transformation.parameters.style);
            break;

          case 'columnOperation':
            if (transformation.parameters.operations) {
              result = this.columnManipulator.manipulateColumns(result, transformation.parameters.operations);
            } else if (transformation.parameters.operation) {
              // Single operation
              result = this.columnManipulator.manipulateColumns(result, [transformation.parameters.operation]);
            }
            break;

          case 'filter':
            result = this.dataFilter.filterData(result, transformation.parameters);
            break;

          default:
            this.logger.warn('Unknown transformation type', { type: transformation.type });
        }
      } catch (error) {
        throw ConversionError.conversionFailed(
          `Transformation failed: ${(error as Error).message}`,
          { transformation }
        );
      }
    }

    return result;
  }

  /**
   * Determine output path
   */
  private determineOutputPath(request: ConversionRequest): string {
    if (request.outputPath) {
      return request.outputPath;
    }

    // Generate default output path
    const sourceDir = path.dirname(request.sourcePath);
    const sourceName = path.basename(request.sourcePath, path.extname(request.sourcePath));
    const targetExt = this.getFileExtension(request.targetFormat);
    
    return path.join(sourceDir, `${sourceName}.${targetExt}`);
  }

  /**
   * Validate target format
   */
  private validateTargetFormat(format: SupportedFormat): void {
    const supportedFormats: SupportedFormat[] = ['csv', 'xlsx', 'json', 'xml', 'md'];
    
    if (!supportedFormats.includes(format)) {
      throw ConversionError.unsupportedFormat(
        `Unsupported target format: ${format}`
      );
    }
  }

  /**
   * Write target data using appropriate handler
   */
  private async writeTargetData(
    data: DataStructure,
    filePath: string,
    format: SupportedFormat,
    options?: any
  ): Promise<void> {
    try {
      // Ensure output directory exists
      const outputDir = path.dirname(filePath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const handler = this.handlerFactory.createHandler(format);
      await handler.write(data, filePath, options);
    } catch (error) {
      throw ConversionError.conversionFailed(
        `Failed to write target file: ${(error as Error).message}`,
        { filePath, format }
      );
    }
  }

  /**
   * Collect warnings from conversion process
   */
  private collectWarnings(originalData: DataStructure, transformedData: DataStructure): string[] {
    const warnings: string[] = [];

    // Check for data loss
    if (transformedData.rows.length < originalData.rows.length) {
      const lostRows = originalData.rows.length - transformedData.rows.length;
      warnings.push(`${lostRows} rows were filtered out during transformation`);
    }

    // Check for column changes
    const originalColumns = originalData.headers?.length || 
      (originalData.rows.length > 0 ? Object.keys(originalData.rows[0]).length : 0);
    const transformedColumns = transformedData.headers?.length || 
      (transformedData.rows.length > 0 ? Object.keys(transformedData.rows[0]).length : 0);

    if (transformedColumns < originalColumns) {
      const lostColumns = originalColumns - transformedColumns;
      warnings.push(`${lostColumns} columns were removed during transformation`);
    } else if (transformedColumns > originalColumns) {
      const addedColumns = transformedColumns - originalColumns;
      warnings.push(`${addedColumns} columns were added during transformation`);
    }

    return warnings;
  }

  /**
   * Check if file path is valid and safe
   */
  private isValidFilePath(filePath: string): boolean {
    // Basic path validation
    if (!filePath || typeof filePath !== 'string') {
      return false;
    }

    // Check for path traversal attempts
    if (filePath.includes('..') || filePath.includes('~')) {
      return false;
    }

    // Check for invalid characters (basic check)
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(filePath)) {
      return false;
    }

    return true;
  }

  /**
   * Get file extension for format
   */
  private getFileExtension(format: SupportedFormat): string {
    const extensions: Record<SupportedFormat, string> = {
      csv: 'csv',
      xlsx: 'xlsx',
      json: 'json',
      xml: 'xml',
      md: 'md'
    };

    return extensions[format] || format;
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): {
    input: SupportedFormat[];
    output: SupportedFormat[];
  } {
    const formats: SupportedFormat[] = ['csv', 'xlsx', 'json', 'xml', 'md'];
    return {
      input: formats,
      output: formats
    };
  }

  /**
   * Get conversion statistics
   */
  getConversionStatistics(): {
    totalConversions: number;
    successfulConversions: number;
    failedConversions: number;
    averageDuration: number;
    formatBreakdown: Record<string, number>;
  } {
    // This would be implemented with proper metrics collection
    // For now, return placeholder data
    return {
      totalConversions: 0,
      successfulConversions: 0,
      failedConversions: 0,
      averageDuration: 0,
      formatBreakdown: {}
    };
  }

  /**
   * Validate transformation parameters
   */
  validateTransformation(transformation: DataTransformation): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!transformation.type) {
      errors.push('Transformation type is required');
    }

    if (!transformation.parameters) {
      errors.push('Transformation parameters are required');
    }

    if (transformation.parameters) {
      switch (transformation.type) {
        case 'keyStyle':
          if (!transformation.parameters.style) {
            errors.push('Key style is required for keyStyle transformation');
          } else {
            const validStyles = ['camelCase', 'snake_case', 'lowercase', 'uppercase'];
            if (!validStyles.includes(transformation.parameters.style)) {
              errors.push(`Invalid key style: ${transformation.parameters.style}`);
            }
          }
          break;

        case 'columnOperation':
          if (!transformation.parameters.operations && !transformation.parameters.operation) {
            errors.push('Column operations are required for columnOperation transformation');
          }
          break;

        case 'filter':
          if (!transformation.parameters.columnFilters && 
              !transformation.parameters.dateRange && 
              !transformation.parameters.customConditions) {
            warnings.push('No filter criteria specified');
          }
          break;

        default:
          warnings.push(`Unknown transformation type: ${transformation.type}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a conversion request with validation
   */
  static createConversionRequest(options: {
    sourcePath: string;
    targetFormat: SupportedFormat;
    outputPath?: string;
    transformations?: DataTransformation[];
    options?: any;
  }): ConversionRequest {
    return {
      sourcePath: options.sourcePath,
      targetFormat: options.targetFormat,
      outputPath: options.outputPath,
      transformations: options.transformations || [],
      options: options.options
    };
  }

  /**
   * Create a transformation
   */
  static createTransformation(
    type: DataTransformation['type'],
    parameters: any
  ): DataTransformation {
    return {
      type,
      parameters
    };
  }
}