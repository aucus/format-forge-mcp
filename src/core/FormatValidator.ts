import { SupportedFormat, ValidationResult, ValidationError, ValidationWarning } from '../types/index.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { Logger } from './Logger.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Format-specific validation rules
 */
export interface FormatValidationRules {
  maxFileSize?: number; // in bytes
  requiredExtensions?: string[];
  contentValidation?: boolean;
  structureValidation?: boolean;
}

/**
 * Format validator for different file types
 */
export class FormatValidator {
  private logger: Logger;
  private static readonly DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  private static readonly CONTENT_SAMPLE_SIZE = 2048; // Bytes to read for validation

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Validate file for specific format
   */
  async validateFile(
    filePath: string, 
    expectedFormat: SupportedFormat,
    rules?: FormatValidationRules
  ): Promise<ValidationResult> {
    this.logger.debug('Validating file for format', { filePath, expectedFormat, rules });

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Basic file validation
      const fileValidation = await this.validateFileBasics(filePath, rules);
      errors.push(...fileValidation.errors);
      warnings.push(...fileValidation.warnings);

      // Extension validation
      const extensionValidation = this.validateExtension(filePath, expectedFormat, rules);
      errors.push(...extensionValidation.errors);
      warnings.push(...extensionValidation.warnings);

      // Content validation if requested
      if (rules?.contentValidation !== false) {
        const contentValidation = await this.validateContent(filePath, expectedFormat);
        errors.push(...contentValidation.errors);
        warnings.push(...contentValidation.warnings);
      }

      // Structure validation if requested
      if (rules?.structureValidation === true) {
        const structureValidation = await this.validateStructure(filePath, expectedFormat);
        errors.push(...structureValidation.errors);
        warnings.push(...structureValidation.warnings);
      }

    } catch (error) {
      this.logger.error('File validation failed', error as Error, { filePath, expectedFormat });
      errors.push(ValidationUtils.createError(
        'VALIDATION_ERROR',
        `Validation failed: ${(error as Error).message}`,
        'file'
      ));
    }

    const result = ValidationUtils.createValidationResult(errors, warnings);
    this.logger.debug('File validation completed', { filePath, result });
    
    return result;
  }

  /**
   * Validate basic file properties
   */
  private async validateFileBasics(
    filePath: string, 
    rules?: FormatValidationRules
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Check if file exists
      await fs.promises.access(filePath, fs.constants.F_OK);
    } catch {
      errors.push(ValidationUtils.createError(
        'FILE_NOT_FOUND',
        `File does not exist: ${filePath}`,
        'filePath'
      ));
      return ValidationUtils.createValidationResult(errors, warnings);
    }

    try {
      // Check if file is readable
      await fs.promises.access(filePath, fs.constants.R_OK);
    } catch {
      errors.push(ValidationUtils.createError(
        'FILE_NOT_READABLE',
        `File is not readable: ${filePath}`,
        'filePath'
      ));
      return ValidationUtils.createValidationResult(errors, warnings);
    }

    try {
      // Get file stats
      const stats = await fs.promises.stat(filePath);

      // Check if it's a file (not directory)
      if (!stats.isFile()) {
        errors.push(ValidationUtils.createError(
          'NOT_A_FILE',
          `Path is not a file: ${filePath}`,
          'filePath'
        ));
      }

      // Check file size
      const maxSize = rules?.maxFileSize || FormatValidator.DEFAULT_MAX_FILE_SIZE;
      if (stats.size > maxSize) {
        warnings.push(ValidationUtils.createWarning(
          'FILE_TOO_LARGE',
          `File size (${stats.size} bytes) exceeds recommended maximum (${maxSize} bytes)`,
          'fileSize'
        ));
      }

      // Check if file is empty
      if (stats.size === 0) {
        errors.push(ValidationUtils.createError(
          'EMPTY_FILE',
          `File is empty: ${filePath}`,
          'fileSize'
        ));
      }

    } catch (error) {
      errors.push(ValidationUtils.createError(
        'FILE_STAT_ERROR',
        `Could not get file information: ${(error as Error).message}`,
        'filePath'
      ));
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Validate file extension
   */
  private validateExtension(
    filePath: string, 
    expectedFormat: SupportedFormat,
    rules?: FormatValidationRules
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const extension = path.extname(filePath).toLowerCase();
    const expectedExtensions = this.getExpectedExtensions(expectedFormat);

    // Check if extension matches expected format
    if (!expectedExtensions.includes(extension)) {
      if (rules?.requiredExtensions && rules.requiredExtensions.length > 0) {
        // Strict mode: error if extension doesn't match
        errors.push(ValidationUtils.createError(
          'INVALID_EXTENSION',
          `File extension '${extension}' does not match expected format '${expectedFormat}'. Expected: ${expectedExtensions.join(', ')}`,
          'extension'
        ));
      } else {
        // Lenient mode: warning if extension doesn't match
        warnings.push(ValidationUtils.createWarning(
          'EXTENSION_MISMATCH',
          `File extension '${extension}' may not match expected format '${expectedFormat}'. Expected: ${expectedExtensions.join(', ')}`,
          'extension'
        ));
      }
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Validate file content
   */
  private async validateContent(
    filePath: string, 
    expectedFormat: SupportedFormat
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Read sample of file content
      const fileHandle = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(FormatValidator.CONTENT_SAMPLE_SIZE);
      const { bytesRead } = await fileHandle.read(buffer, 0, FormatValidator.CONTENT_SAMPLE_SIZE, 0);
      await fileHandle.close();

      const content = buffer.subarray(0, bytesRead).toString('utf8');

      // Validate content based on format
      const contentValidation = this.validateFormatSpecificContent(content, expectedFormat);
      errors.push(...contentValidation.errors);
      warnings.push(...contentValidation.warnings);

    } catch (error) {
      warnings.push(ValidationUtils.createWarning(
        'CONTENT_READ_ERROR',
        `Could not read file content for validation: ${(error as Error).message}`,
        'content'
      ));
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Validate format-specific content
   */
  private validateFormatSpecificContent(
    content: string, 
    expectedFormat: SupportedFormat
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    switch (expectedFormat) {
      case 'json':
        return this.validateJsonContent(content);
      case 'xml':
        return this.validateXmlContent(content);
      case 'csv':
        return this.validateCsvContent(content);
      case 'md':
        return this.validateMarkdownContent(content);
      case 'xlsx':
        // Excel files are binary, can't validate content as text
        warnings.push(ValidationUtils.createWarning(
          'BINARY_FORMAT',
          'Excel files are binary format, content validation skipped',
          'content'
        ));
        break;
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Validate JSON content
   */
  private validateJsonContent(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      JSON.parse(content);
    } catch (error) {
      const jsonError = error as SyntaxError;
      errors.push(ValidationUtils.createError(
        'INVALID_JSON',
        `Invalid JSON content: ${jsonError.message}`,
        'content'
      ));
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Validate XML content
   */
  private validateXmlContent(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Basic XML structure validation
    if (!content.trim().startsWith('<')) {
      errors.push(ValidationUtils.createError(
        'INVALID_XML_START',
        'XML content must start with <',
        'content'
      ));
    }

    // Check for basic XML structure
    const xmlElementPattern = /<[^>]+>/;
    if (!xmlElementPattern.test(content)) {
      errors.push(ValidationUtils.createError(
        'NO_XML_ELEMENTS',
        'No XML elements found in content',
        'content'
      ));
    }

    // Check for unclosed tags (basic check)
    const openTags = (content.match(/<[^/][^>]*[^/]>/g) || []).length;
    const closeTags = (content.match(/<\/[^>]+>/g) || []).length;
    const selfClosingTags = (content.match(/<[^>]*\/>/g) || []).length;

    if (openTags !== closeTags + selfClosingTags) {
      warnings.push(ValidationUtils.createWarning(
        'UNBALANCED_XML_TAGS',
        'XML tags may be unbalanced (this is a basic check)',
        'content'
      ));
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Validate CSV content
   */
  private validateCsvContent(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const lines = content.split('\n').filter(line => line.trim().length > 0);

    if (lines.length === 0) {
      errors.push(ValidationUtils.createError(
        'EMPTY_CSV',
        'CSV file appears to be empty',
        'content'
      ));
      return ValidationUtils.createValidationResult(errors, warnings);
    }

    // Check for consistent field count
    const firstLineFields = this.countCsvFields(lines[0]);
    let inconsistentLines = 0;

    for (let i = 1; i < Math.min(lines.length, 10); i++) { // Check first 10 lines
      const fieldCount = this.countCsvFields(lines[i]);
      if (fieldCount !== firstLineFields) {
        inconsistentLines++;
      }
    }

    if (inconsistentLines > 0) {
      warnings.push(ValidationUtils.createWarning(
        'INCONSISTENT_CSV_FIELDS',
        `${inconsistentLines} lines have different field counts than the first line`,
        'content'
      ));
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Count CSV fields in a line
   */
  private countCsvFields(line: string): number {
    // Simple CSV field counting (doesn't handle quoted fields with commas)
    return line.split(',').length;
  }

  /**
   * Validate Markdown content
   */
  private validateMarkdownContent(content: string): ValidationResult {
    const warnings: ValidationWarning[] = [];

    // Markdown is very flexible, so we mainly provide warnings
    if (content.trim().length === 0) {
      warnings.push(ValidationUtils.createWarning(
        'EMPTY_MARKDOWN',
        'Markdown file appears to be empty',
        'content'
      ));
    }

    // Check for common markdown patterns
    const hasHeaders = /^#{1,6}\s+.+$/m.test(content);
    const hasLists = /^[\*\-\+]\s+.+$/m.test(content) || /^\d+\.\s+.+$/m.test(content);
    const hasFormatting = /\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`/.test(content);

    if (!hasHeaders && !hasLists && !hasFormatting) {
      warnings.push(ValidationUtils.createWarning(
        'NO_MARKDOWN_PATTERNS',
        'Content does not contain common Markdown patterns',
        'content'
      ));
    }

    return ValidationUtils.createValidationResult([], warnings);
  }

  /**
   * Validate file structure (more detailed analysis)
   */
  private async validateStructure(
    filePath: string, 
    expectedFormat: SupportedFormat
  ): Promise<ValidationResult> {
    // This is a placeholder for more detailed structure validation
    // In a full implementation, this would do deeper analysis like:
    // - JSON schema validation
    // - XML schema validation
    // - CSV header validation
    // - Excel sheet structure validation

    const warnings: ValidationWarning[] = [];
    
    warnings.push(ValidationUtils.createWarning(
      'STRUCTURE_VALIDATION_NOT_IMPLEMENTED',
      'Detailed structure validation is not yet implemented',
      'structure'
    ));

    return ValidationUtils.createValidationResult([], warnings);
  }

  /**
   * Get expected file extensions for a format
   */
  private getExpectedExtensions(format: SupportedFormat): string[] {
    switch (format) {
      case 'csv':
        return ['.csv'];
      case 'xlsx':
        return ['.xlsx', '.xls'];
      case 'json':
        return ['.json'];
      case 'xml':
        return ['.xml'];
      case 'md':
        return ['.md', '.markdown'];
      default:
        return [];
    }
  }

  /**
   * Get validation rules for a specific format
   */
  getDefaultRulesForFormat(format: SupportedFormat): FormatValidationRules {
    const baseRules: FormatValidationRules = {
      contentValidation: true,
      structureValidation: false
    };

    switch (format) {
      case 'csv':
        return {
          ...baseRules,
          maxFileSize: 50 * 1024 * 1024, // 50MB for CSV
          requiredExtensions: ['.csv']
        };
      case 'xlsx':
        return {
          ...baseRules,
          maxFileSize: 100 * 1024 * 1024, // 100MB for Excel
          requiredExtensions: ['.xlsx', '.xls'],
          contentValidation: false // Binary format
        };
      case 'json':
        return {
          ...baseRules,
          maxFileSize: 25 * 1024 * 1024, // 25MB for JSON
          requiredExtensions: ['.json']
        };
      case 'xml':
        return {
          ...baseRules,
          maxFileSize: 25 * 1024 * 1024, // 25MB for XML
          requiredExtensions: ['.xml']
        };
      case 'md':
        return {
          ...baseRules,
          maxFileSize: 10 * 1024 * 1024, // 10MB for Markdown
          requiredExtensions: ['.md', '.markdown']
        };
      default:
        return baseRules;
    }
  }
}