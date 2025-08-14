import { ValidationResult, ValidationError, ValidationWarning, SupportedFormat } from '../types/index.js';

/**
 * Utility functions for validation
 */
export class ValidationUtils {
  /**
   * Create a validation result
   */
  static createValidationResult(
    errors: ValidationError[] = [],
    warnings: ValidationWarning[] = []
  ): ValidationResult {
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Create a validation error
   */
  static createError(
    code: string,
    message: string,
    field?: string,
    row?: number
  ): ValidationError {
    return {
      code,
      message,
      ...(field && { field }),
      ...(row !== undefined && { row })
    };
  }

  /**
   * Create a validation warning
   */
  static createWarning(
    code: string,
    message: string,
    field?: string,
    row?: number
  ): ValidationWarning {
    return {
      code,
      message,
      ...(field && { field }),
      ...(row !== undefined && { row })
    };
  }

  /**
   * Validate file path
   */
  static validateFilePath(filePath: string, fieldName: string = 'filePath'): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!filePath || typeof filePath !== 'string') {
      errors.push(this.createError(
        'INVALID_FILE_PATH',
        `${fieldName} is required and must be a string`,
        fieldName
      ));
      return errors;
    }

    if (filePath.trim().length === 0) {
      errors.push(this.createError(
        'EMPTY_FILE_PATH',
        `${fieldName} cannot be empty`,
        fieldName
      ));
    }

    // Check for invalid characters (basic check)
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(filePath)) {
      errors.push(this.createError(
        'INVALID_PATH_CHARACTERS',
        `${fieldName} contains invalid characters`,
        fieldName
      ));
    }

    return errors;
  }

  /**
   * Validate supported format
   */
  static validateFormat(format: any, fieldName: string = 'format'): ValidationError[] {
    const errors: ValidationError[] = [];
    const supportedFormats: SupportedFormat[] = ['csv', 'xlsx', 'json', 'xml', 'md'];

    if (!format) {
      errors.push(this.createError(
        'MISSING_FORMAT',
        `${fieldName} is required`,
        fieldName
      ));
      return errors;
    }

    if (typeof format !== 'string') {
      errors.push(this.createError(
        'INVALID_FORMAT_TYPE',
        `${fieldName} must be a string`,
        fieldName
      ));
      return errors;
    }

    if (!supportedFormats.includes(format as SupportedFormat)) {
      errors.push(this.createError(
        'UNSUPPORTED_FORMAT',
        `${fieldName} '${format}' is not supported. Supported formats: ${supportedFormats.join(', ')}`,
        fieldName
      ));
    }

    return errors;
  }

  /**
   * Validate encoding
   */
  static validateEncoding(encoding: any, fieldName: string = 'encoding'): ValidationError[] {
    const errors: ValidationError[] = [];
    const supportedEncodings = ['utf-8', 'utf-16', 'ascii', 'latin1', 'base64', 'hex', 'euc-kr'];

    if (encoding !== undefined) {
      if (typeof encoding !== 'string') {
        errors.push(this.createError(
          'INVALID_ENCODING_TYPE',
          `${fieldName} must be a string`,
          fieldName
        ));
      } else if (!supportedEncodings.includes(encoding.toLowerCase())) {
        // This is a warning since we might still be able to handle unknown encodings
        // Convert to error if needed
        errors.push(this.createError(
          'UNKNOWN_ENCODING',
          `${fieldName} '${encoding}' may not be supported. Supported encodings: ${supportedEncodings.join(', ')}`,
          fieldName
        ));
      }
    }

    return errors;
  }

  /**
   * Validate array of strings
   */
  static validateStringArray(
    array: any,
    fieldName: string,
    required: boolean = false
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (array === undefined || array === null) {
      if (required) {
        errors.push(this.createError(
          'MISSING_ARRAY',
          `${fieldName} is required`,
          fieldName
        ));
      }
      return errors;
    }

    if (!Array.isArray(array)) {
      errors.push(this.createError(
        'INVALID_ARRAY_TYPE',
        `${fieldName} must be an array`,
        fieldName
      ));
      return errors;
    }

    array.forEach((item, index) => {
      if (typeof item !== 'string') {
        errors.push(this.createError(
          'INVALID_ARRAY_ITEM',
          `${fieldName}[${index}] must be a string`,
          `${fieldName}[${index}]`
        ));
      }
    });

    return errors;
  }

  /**
   * Validate object structure
   */
  static validateObject(
    obj: any,
    fieldName: string,
    required: boolean = false
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (obj === undefined || obj === null) {
      if (required) {
        errors.push(this.createError(
          'MISSING_OBJECT',
          `${fieldName} is required`,
          fieldName
        ));
      }
      return errors;
    }

    if (typeof obj !== 'object' || Array.isArray(obj)) {
      errors.push(this.createError(
        'INVALID_OBJECT_TYPE',
        `${fieldName} must be an object`,
        fieldName
      ));
    }

    return errors;
  }

  /**
   * Validate numeric value
   */
  static validateNumber(
    value: any,
    fieldName: string,
    min?: number,
    max?: number,
    required: boolean = false
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (value === undefined || value === null) {
      if (required) {
        errors.push(this.createError(
          'MISSING_NUMBER',
          `${fieldName} is required`,
          fieldName
        ));
      }
      return errors;
    }

    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(this.createError(
        'INVALID_NUMBER_TYPE',
        `${fieldName} must be a valid number`,
        fieldName
      ));
      return errors;
    }

    if (min !== undefined && value < min) {
      errors.push(this.createError(
        'NUMBER_TOO_SMALL',
        `${fieldName} must be at least ${min}`,
        fieldName
      ));
    }

    if (max !== undefined && value > max) {
      errors.push(this.createError(
        'NUMBER_TOO_LARGE',
        `${fieldName} must be at most ${max}`,
        fieldName
      ));
    }

    return errors;
  }

  /**
   * Combine multiple validation results
   */
  static combineValidationResults(...results: ValidationResult[]): ValidationResult {
    const allErrors: ValidationError[] = [];
    const allWarnings: ValidationWarning[] = [];

    results.forEach(result => {
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    });

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }

  /**
   * Format validation result as human-readable string
   */
  static formatValidationResult(result: ValidationResult): string {
    let output = '';

    if (result.isValid) {
      output += 'Validation passed';
    } else {
      output += 'Validation failed';
    }

    if (result.errors.length > 0) {
      output += `\n\nErrors (${result.errors.length}):`;
      result.errors.forEach((error, index) => {
        output += `\n  ${index + 1}. ${error.message}`;
        if (error.field) {
          output += ` (field: ${error.field})`;
        }
        if (error.row !== undefined) {
          output += ` (row: ${error.row})`;
        }
      });
    }

    if (result.warnings.length > 0) {
      output += `\n\nWarnings (${result.warnings.length}):`;
      result.warnings.forEach((warning, index) => {
        output += `\n  ${index + 1}. ${warning.message}`;
        if (warning.field) {
          output += ` (field: ${warning.field})`;
        }
        if (warning.row !== undefined) {
          output += ` (row: ${warning.row})`;
        }
      });
    }

    return output;
  }
}