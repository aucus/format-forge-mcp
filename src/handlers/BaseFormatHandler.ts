import { FormatHandler } from '../interfaces/FormatHandler.js';
import { DataStructure, SupportedFormat, ReadOptions, WriteOptions, ValidationResult } from '../types/index.js';
import { DataStructureImpl } from '../models/DataStructure.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { ConversionError } from '../errors/ConversionError.js';
import { Logger } from '../core/Logger.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Abstract base class for format handlers
 */
export abstract class BaseFormatHandler implements FormatHandler {
  protected logger: Logger;
  protected readonly supportedFormats: SupportedFormat[];
  protected readonly supportedExtensions: string[];

  constructor(supportedFormats: SupportedFormat[], supportedExtensions: string[]) {
    this.logger = Logger.getInstance();
    this.supportedFormats = supportedFormats;
    this.supportedExtensions = supportedExtensions;
  }

  /**
   * Check if this handler can process the given format
   */
  canHandle(format: SupportedFormat): boolean {
    return this.supportedFormats.includes(format);
  }

  /**
   * Get supported file extensions for this format
   */
  getSupportedExtensions(): string[] {
    return [...this.supportedExtensions];
  }

  /**
   * Abstract method to read data from a file
   */
  abstract read(filePath: string, options?: ReadOptions): Promise<DataStructure>;

  /**
   * Abstract method to write data to a file
   */
  abstract write(data: DataStructure, filePath: string, options?: WriteOptions): Promise<void>;

  /**
   * Validate data structure for this format
   */
  validate(data: DataStructure): ValidationResult {
    // Basic validation that all handlers should perform
    const errors = ValidationUtils.validateObject(data, 'data', true);
    const warnings: any[] = [];

    // Validate data structure properties
    if (data.rows && !Array.isArray(data.rows)) {
      errors.push(ValidationUtils.createError(
        'INVALID_ROWS',
        'Data rows must be an array',
        'rows'
      ));
    }

    if (data.headers && !Array.isArray(data.headers)) {
      errors.push(ValidationUtils.createError(
        'INVALID_HEADERS',
        'Data headers must be an array',
        'headers'
      ));
    }

    if (!data.metadata) {
      errors.push(ValidationUtils.createError(
        'MISSING_METADATA',
        'Data metadata is required',
        'metadata'
      ));
    } else {
      // Validate metadata
      if (!data.metadata.originalFormat) {
        errors.push(ValidationUtils.createError(
          'MISSING_ORIGINAL_FORMAT',
          'Original format is required in metadata',
          'metadata.originalFormat'
        ));
      }

      if (!data.metadata.encoding) {
        errors.push(ValidationUtils.createError(
          'MISSING_ENCODING',
          'Encoding is required in metadata',
          'metadata.encoding'
        ));
      }

      if (typeof data.metadata.totalRows !== 'number' || data.metadata.totalRows < 0) {
        errors.push(ValidationUtils.createError(
          'INVALID_TOTAL_ROWS',
          'Total rows must be a non-negative number',
          'metadata.totalRows'
        ));
      }

      if (typeof data.metadata.totalColumns !== 'number' || data.metadata.totalColumns < 0) {
        errors.push(ValidationUtils.createError(
          'INVALID_TOTAL_COLUMNS',
          'Total columns must be a non-negative number',
          'metadata.totalColumns'
        ));
      }
    }

    // Perform format-specific validation
    const formatValidation = this.validateFormatSpecific(data);
    errors.push(...formatValidation.errors);
    warnings.push(...formatValidation.warnings);

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Format-specific validation (to be overridden by subclasses)
   */
  protected validateFormatSpecific(data: DataStructure): ValidationResult {
    // Default implementation - no additional validation
    return ValidationUtils.createValidationResult();
  }

  /**
   * Common file reading utilities
   */
  protected async readFileContent(filePath: string, encoding: string = 'utf8'): Promise<string> {
    try {
      this.logger.debug('Reading file content', { filePath, encoding });
      
      // Check if file exists and is readable
      await this.validateFileAccess(filePath);
      
      const content = await fs.promises.readFile(filePath, { encoding: encoding as BufferEncoding });
      
      this.logger.debug('File content read successfully', { 
        filePath, 
        contentLength: content.length 
      });
      
      return content;
    } catch (error) {
      this.logger.error('Failed to read file content', error as Error, { filePath, encoding });
      
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw ConversionError.fileNotFound(filePath);
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw ConversionError.permissionDenied(filePath, 'read');
      } else {
        throw ConversionError.conversionFailed(
          `Failed to read file: ${(error as Error).message}`,
          { filePath, originalError: error }
        );
      }
    }
  }

  /**
   * Common file writing utilities
   */
  protected async writeFileContent(
    filePath: string, 
    content: string, 
    encoding: string = 'utf8'
  ): Promise<void> {
    try {
      this.logger.debug('Writing file content', { filePath, encoding, contentLength: content.length });
      
      // Ensure directory exists
      await this.ensureDirectoryExists(path.dirname(filePath));
      
      await fs.promises.writeFile(filePath, content, { encoding: encoding as BufferEncoding });
      
      this.logger.debug('File content written successfully', { filePath });
    } catch (error) {
      this.logger.error('Failed to write file content', error as Error, { filePath, encoding });
      
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw ConversionError.permissionDenied(filePath, 'write');
      } else if ((error as NodeJS.ErrnoException).code === 'ENOSPC') {
        throw ConversionError.conversionFailed(
          'Insufficient disk space to write file',
          { filePath, originalError: error }
        );
      } else {
        throw ConversionError.conversionFailed(
          `Failed to write file: ${(error as Error).message}`,
          { filePath, originalError: error }
        );
      }
    }
  }

  /**
   * Validate file access permissions
   */
  protected async validateFileAccess(filePath: string, mode: number = fs.constants.R_OK): Promise<void> {
    try {
      await fs.promises.access(filePath, mode);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw ConversionError.fileNotFound(filePath);
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        const operation = mode === fs.constants.W_OK ? 'write' : 'read';
        throw ConversionError.permissionDenied(filePath, operation);
      } else {
        throw ConversionError.conversionFailed(
          `File access validation failed: ${(error as Error).message}`,
          { filePath, originalError: error }
        );
      }
    }
  }

  /**
   * Ensure directory exists, create if necessary
   */
  protected async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw ConversionError.conversionFailed(
          `Failed to create directory: ${(error as Error).message}`,
          { dirPath, originalError: error }
        );
      }
    }
  }

  /**
   * Get file stats
   */
  protected async getFileStats(filePath: string): Promise<fs.Stats> {
    try {
      return await fs.promises.stat(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw ConversionError.fileNotFound(filePath);
      } else {
        throw ConversionError.conversionFailed(
          `Failed to get file stats: ${(error as Error).message}`,
          { filePath, originalError: error }
        );
      }
    }
  }

  /**
   * Create a DataStructure instance with proper validation
   */
  protected createDataStructure(
    rows: Record<string, any>[],
    originalFormat: SupportedFormat,
    encoding: string = 'utf-8',
    headers?: string[],
    sheetName?: string
  ): DataStructure {
    const dataStructure = new DataStructureImpl(
      rows,
      originalFormat,
      encoding,
      headers,
      sheetName
    );

    // Validate the created data structure
    const validation = dataStructure.validate();
    if (!validation.isValid) {
      const errorMessages = validation.errors.map(e => e.message);
      throw ConversionError.validationFailed(errorMessages);
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      validation.warnings.forEach(warning => {
        this.logger.warn('Data structure validation warning', { 
          code: warning.code, 
          message: warning.message 
        });
      });
    }

    return dataStructure;
  }

  /**
   * Parse read options with defaults
   */
  protected parseReadOptions(options?: ReadOptions): ReadOptions {
    return {
      encoding: options?.encoding || 'utf-8',
      sheetName: options?.sheetName,
      sheetIndex: options?.sheetIndex || 0,
      range: options?.range
    };
  }

  /**
   * Parse write options with defaults
   */
  protected parseWriteOptions(options?: WriteOptions): Required<WriteOptions> {
    return {
      encoding: options?.encoding || 'utf-8',
      formatting: options?.formatting || {},
      overwrite: options?.overwrite !== false // Default to true
    };
  }

  /**
   * Check if file should be overwritten
   */
  protected async checkOverwrite(filePath: string, overwrite: boolean): Promise<void> {
    if (!overwrite) {
      try {
        await fs.promises.access(filePath, fs.constants.F_OK);
        throw ConversionError.conversionFailed(
          `File already exists and overwrite is disabled: ${filePath}`,
          { filePath }
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error; // Re-throw if it's not a "file not found" error
        }
        // File doesn't exist, which is what we want
      }
    }
  }

  /**
   * Log handler operation
   */
  protected logOperation(operation: string, filePath: string, details?: any): void {
    this.logger.info(`${this.constructor.name}: ${operation}`, {
      filePath,
      handler: this.constructor.name,
      supportedFormats: this.supportedFormats,
      ...details
    });
  }

  /**
   * Handle common errors and convert to ConversionError
   */
  protected handleError(error: Error, operation: string, filePath: string): never {
    this.logger.error(`${this.constructor.name}: ${operation} failed`, error, { filePath });

    if (error instanceof ConversionError) {
      throw error;
    }

    // Convert common Node.js errors to ConversionError
    const nodeError = error as NodeJS.ErrnoException;
    switch (nodeError.code) {
      case 'ENOENT':
        throw ConversionError.fileNotFound(filePath);
      case 'EACCES':
        throw ConversionError.permissionDenied(filePath, operation);
      case 'ENOSPC':
        throw ConversionError.conversionFailed('Insufficient disk space', { filePath });
      case 'EMFILE':
      case 'ENFILE':
        throw ConversionError.conversionFailed('Too many open files', { filePath });
      default:
        throw ConversionError.conversionFailed(
          `${operation} failed: ${error.message}`,
          { filePath, originalError: error }
        );
    }
  }
}