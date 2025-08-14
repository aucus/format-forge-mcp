import { ConversionRequest, ConversionOptions, DataTransformation, SupportedFormat, ValidationResult, ValidationError } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Conversion request implementation with validation
 */
export class ConversionRequestImpl implements ConversionRequest {
  public sourcePath: string;
  public targetFormat: SupportedFormat;
  public outputPath?: string;
  public transformations?: DataTransformation[];
  public options?: ConversionOptions;

  constructor(
    sourcePath: string,
    targetFormat: SupportedFormat,
    outputPath?: string,
    transformations?: DataTransformation[],
    options?: ConversionOptions
  ) {
    this.sourcePath = sourcePath;
    this.targetFormat = targetFormat;
    this.outputPath = outputPath;
    this.transformations = transformations;
    this.options = options;
  }

  /**
   * Validate the conversion request
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Validate source path
    if (!this.sourcePath || typeof this.sourcePath !== 'string') {
      errors.push({
        code: 'INVALID_SOURCE_PATH',
        message: 'Source path is required and must be a string',
        field: 'sourcePath'
      });
    } else {
      // Check if source path is absolute or relative
      if (!path.isAbsolute(this.sourcePath) && !this.sourcePath.startsWith('./') && !this.sourcePath.startsWith('../')) {
        warnings.push({
          code: 'RELATIVE_PATH',
          message: 'Source path appears to be relative, ensure it resolves correctly',
          field: 'sourcePath'
        });
      }

      // Validate file extension
      const sourceExt = path.extname(this.sourcePath).toLowerCase();
      if (!this.isValidSourceExtension(sourceExt)) {
        warnings.push({
          code: 'UNKNOWN_EXTENSION',
          message: `Source file extension '${sourceExt}' may not be supported`,
          field: 'sourcePath'
        });
      }
    }

    // Validate target format
    if (!this.targetFormat) {
      errors.push({
        code: 'MISSING_TARGET_FORMAT',
        message: 'Target format is required',
        field: 'targetFormat'
      });
    } else if (!this.isValidTargetFormat(this.targetFormat)) {
      errors.push({
        code: 'INVALID_TARGET_FORMAT',
        message: `Invalid target format: ${this.targetFormat}. Supported formats: csv, xlsx, json, xml, md`,
        field: 'targetFormat'
      });
    }

    // Validate output path if provided
    if (this.outputPath) {
      if (typeof this.outputPath !== 'string') {
        errors.push({
          code: 'INVALID_OUTPUT_PATH',
          message: 'Output path must be a string',
          field: 'outputPath'
        });
      } else {
        // Check if output directory exists (if absolute path)
        if (path.isAbsolute(this.outputPath)) {
          const outputDir = path.dirname(this.outputPath);
          try {
            if (!fs.existsSync(outputDir)) {
              warnings.push({
                code: 'OUTPUT_DIR_NOT_EXISTS',
                message: `Output directory does not exist: ${outputDir}`,
                field: 'outputPath'
              });
            }
          } catch (error) {
            warnings.push({
              code: 'OUTPUT_PATH_CHECK_FAILED',
              message: `Could not verify output directory: ${error}`,
              field: 'outputPath'
            });
          }
        }

        // Validate output file extension matches target format
        const outputExt = path.extname(this.outputPath).toLowerCase();
        const expectedExt = this.getExpectedExtension(this.targetFormat);
        if (outputExt && outputExt !== expectedExt) {
          warnings.push({
            code: 'EXTENSION_MISMATCH',
            message: `Output file extension '${outputExt}' doesn't match target format '${this.targetFormat}' (expected '${expectedExt}')`,
            field: 'outputPath'
          });
        }
      }
    }

    // Validate transformations if provided
    if (this.transformations) {
      if (!Array.isArray(this.transformations)) {
        errors.push({
          code: 'INVALID_TRANSFORMATIONS',
          message: 'Transformations must be an array',
          field: 'transformations'
        });
      } else {
        this.transformations.forEach((transformation, index) => {
          if (!transformation || typeof transformation !== 'object') {
            errors.push({
              code: 'INVALID_TRANSFORMATION',
              message: `Transformation at index ${index} must be an object`,
              field: `transformations[${index}]`
            });
            return;
          }

          if (!transformation.type) {
            errors.push({
              code: 'MISSING_TRANSFORMATION_TYPE',
              message: `Transformation at index ${index} is missing type`,
              field: `transformations[${index}].type`
            });
          } else if (!['keyStyle', 'filter', 'columnOperation'].includes(transformation.type)) {
            errors.push({
              code: 'INVALID_TRANSFORMATION_TYPE',
              message: `Invalid transformation type at index ${index}: ${transformation.type}`,
              field: `transformations[${index}].type`
            });
          }

          if (!transformation.parameters) {
            errors.push({
              code: 'MISSING_TRANSFORMATION_PARAMETERS',
              message: `Transformation at index ${index} is missing parameters`,
              field: `transformations[${index}].parameters`
            });
          }
        });
      }
    }

    // Validate options if provided
    if (this.options) {
      if (typeof this.options !== 'object') {
        errors.push({
          code: 'INVALID_OPTIONS',
          message: 'Options must be an object',
          field: 'options'
        });
      } else {
        // Validate encoding
        if (this.options.encoding && typeof this.options.encoding !== 'string') {
          errors.push({
            code: 'INVALID_ENCODING',
            message: 'Encoding must be a string',
            field: 'options.encoding'
          });
        }

        // Validate sheet options
        if (this.options.sheetName && typeof this.options.sheetName !== 'string') {
          errors.push({
            code: 'INVALID_SHEET_NAME',
            message: 'Sheet name must be a string',
            field: 'options.sheetName'
          });
        }

        if (this.options.sheetIndex !== undefined && (typeof this.options.sheetIndex !== 'number' || this.options.sheetIndex < 0)) {
          errors.push({
            code: 'INVALID_SHEET_INDEX',
            message: 'Sheet index must be a non-negative number',
            field: 'options.sheetIndex'
          });
        }

        // Validate boolean options
        if (this.options.includeHeaders !== undefined && typeof this.options.includeHeaders !== 'boolean') {
          errors.push({
            code: 'INVALID_INCLUDE_HEADERS',
            message: 'Include headers must be a boolean',
            field: 'options.includeHeaders'
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if source file extension is valid
   */
  private isValidSourceExtension(extension: string): boolean {
    const validExtensions = ['.csv', '.xls', '.xlsx', '.json', '.xml', '.md'];
    return validExtensions.includes(extension);
  }

  /**
   * Check if target format is valid
   */
  private isValidTargetFormat(format: string): format is SupportedFormat {
    return ['csv', 'xlsx', 'json', 'xml', 'md'].includes(format);
  }

  /**
   * Get expected file extension for target format
   */
  private getExpectedExtension(format: SupportedFormat): string {
    switch (format) {
      case 'csv': return '.csv';
      case 'xlsx': return '.xlsx';
      case 'json': return '.json';
      case 'xml': return '.xml';
      case 'md': return '.md';
      default: return '';
    }
  }

  /**
   * Generate output path if not provided
   */
  generateOutputPath(): string {
    if (this.outputPath) {
      return this.outputPath;
    }

    const sourceDir = path.dirname(this.sourcePath);
    const sourceName = path.basename(this.sourcePath, path.extname(this.sourcePath));
    const targetExt = this.getExpectedExtension(this.targetFormat);

    return path.join(sourceDir, `${sourceName}${targetExt}`);
  }

  /**
   * Check if source file exists
   */
  async checkSourceExists(): Promise<boolean> {
    try {
      await fs.promises.access(this.sourcePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get source file stats
   */
  async getSourceStats(): Promise<fs.Stats | null> {
    try {
      return await fs.promises.stat(this.sourcePath);
    } catch {
      return null;
    }
  }

  /**
   * Validate and throw if invalid
   */
  validateAndThrow(): void {
    const validation = this.validate();
    if (!validation.isValid) {
      const errorMessages = validation.errors.map(e => e.message);
      throw ConversionError.validationFailed(errorMessages);
    }
  }

  /**
   * Create a copy of the request with modifications
   */
  clone(modifications?: Partial<ConversionRequest>): ConversionRequestImpl {
    return new ConversionRequestImpl(
      modifications?.sourcePath ?? this.sourcePath,
      modifications?.targetFormat ?? this.targetFormat,
      modifications?.outputPath ?? this.outputPath,
      modifications?.transformations ?? this.transformations,
      modifications?.options ?? this.options
    );
  }

  /**
   * Convert to plain object
   */
  toPlainObject(): ConversionRequest {
    return {
      sourcePath: this.sourcePath,
      targetFormat: this.targetFormat,
      outputPath: this.outputPath,
      transformations: this.transformations ? JSON.parse(JSON.stringify(this.transformations)) : undefined,
      options: this.options ? { ...this.options } : undefined
    };
  }
}