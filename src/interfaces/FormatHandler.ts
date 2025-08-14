import { DataStructure, SupportedFormat, ReadOptions, WriteOptions, ValidationResult } from '../types/index.js';

/**
 * Interface for format-specific handlers
 */
export interface FormatHandler {
  /**
   * Check if this handler can process the given format
   */
  canHandle(format: SupportedFormat): boolean;

  /**
   * Read data from a file and convert to internal data structure
   */
  read(filePath: string, options?: ReadOptions): Promise<DataStructure>;

  /**
   * Write internal data structure to a file
   */
  write(data: DataStructure, filePath: string, options?: WriteOptions): Promise<void>;

  /**
   * Validate data structure for this format
   */
  validate(data: DataStructure): ValidationResult;

  /**
   * Get supported file extensions for this format
   */
  getSupportedExtensions(): string[];
}