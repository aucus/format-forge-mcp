import { ValidationUtils } from '../utils/ValidationUtils.js';

describe('ValidationUtils', () => {
  describe('createValidationResult', () => {
    it('should create a valid result with no errors', () => {
      const result = ValidationUtils.createValidationResult();
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should create an invalid result with errors', () => {
      const errors = [ValidationUtils.createError('TEST_ERROR', 'Test error message')];
      const result = ValidationUtils.createValidationResult(errors);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(errors);
      expect(result.warnings).toEqual([]);
    });

    it('should create a valid result with warnings', () => {
      const warnings = [ValidationUtils.createWarning('TEST_WARNING', 'Test warning message')];
      const result = ValidationUtils.createValidationResult([], warnings);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual(warnings);
    });
  });

  describe('createError and createWarning', () => {
    it('should create error with all fields', () => {
      const error = ValidationUtils.createError('TEST_ERROR', 'Test message', 'testField', 5);
      
      expect(error).toEqual({
        code: 'TEST_ERROR',
        message: 'Test message',
        field: 'testField',
        row: 5
      });
    });

    it('should create error with minimal fields', () => {
      const error = ValidationUtils.createError('TEST_ERROR', 'Test message');
      
      expect(error).toEqual({
        code: 'TEST_ERROR',
        message: 'Test message'
      });
    });

    it('should create warning with all fields', () => {
      const warning = ValidationUtils.createWarning('TEST_WARNING', 'Test message', 'testField', 3);
      
      expect(warning).toEqual({
        code: 'TEST_WARNING',
        message: 'Test message',
        field: 'testField',
        row: 3
      });
    });
  });

  describe('validateFilePath', () => {
    it('should validate correct file path', () => {
      const errors = ValidationUtils.validateFilePath('/path/to/file.csv');
      expect(errors).toEqual([]);
    });

    it('should detect missing file path', () => {
      const errors = ValidationUtils.validateFilePath('');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_FILE_PATH',
          message: 'filePath is required and must be a string'
        })
      );
    });

    it('should detect null file path', () => {
      const errors = ValidationUtils.validateFilePath(null as any);
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_FILE_PATH',
          message: 'filePath is required and must be a string'
        })
      );
    });

    it('should detect empty file path', () => {
      const errors = ValidationUtils.validateFilePath('   ');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_FILE_PATH',
          message: 'filePath cannot be empty'
        })
      );
    });

    it('should detect invalid characters', () => {
      const errors = ValidationUtils.validateFilePath('/path/to/file<invalid>.csv');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_PATH_CHARACTERS',
          message: 'filePath contains invalid characters'
        })
      );
    });

    it('should use custom field name', () => {
      const errors = ValidationUtils.validateFilePath('', 'customPath');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          message: 'customPath is required and must be a string',
          field: 'customPath'
        })
      );
    });
  });

  describe('validateFormat', () => {
    it('should validate supported formats', () => {
      const supportedFormats = ['csv', 'xlsx', 'json', 'xml', 'md'];
      
      supportedFormats.forEach(format => {
        const errors = ValidationUtils.validateFormat(format);
        expect(errors).toEqual([]);
      });
    });

    it('should detect missing format', () => {
      const errors = ValidationUtils.validateFormat(null);
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FORMAT',
          message: 'format is required'
        })
      );
    });

    it('should detect invalid format type', () => {
      const errors = ValidationUtils.validateFormat(123);
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_FORMAT_TYPE',
          message: 'format must be a string'
        })
      );
    });

    it('should detect unsupported format', () => {
      const errors = ValidationUtils.validateFormat('pdf');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'UNSUPPORTED_FORMAT',
          message: "format 'pdf' is not supported. Supported formats: csv, xlsx, json, xml, md"
        })
      );
    });
  });

  describe('validateEncoding', () => {
    it('should validate supported encodings', () => {
      const supportedEncodings = ['utf-8', 'UTF-8', 'ascii', 'latin1'];
      
      supportedEncodings.forEach(encoding => {
        const errors = ValidationUtils.validateEncoding(encoding);
        expect(errors).toEqual([]);
      });
    });

    it('should allow undefined encoding', () => {
      const errors = ValidationUtils.validateEncoding(undefined);
      expect(errors).toEqual([]);
    });

    it('should detect invalid encoding type', () => {
      const errors = ValidationUtils.validateEncoding(123);
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_ENCODING_TYPE',
          message: 'encoding must be a string'
        })
      );
    });

    it('should detect unknown encoding', () => {
      const errors = ValidationUtils.validateEncoding('unknown-encoding');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'UNKNOWN_ENCODING',
          message: expect.stringContaining("encoding 'unknown-encoding' may not be supported")
        })
      );
    });
  });

  describe('validateStringArray', () => {
    it('should validate correct string array', () => {
      const errors = ValidationUtils.validateStringArray(['item1', 'item2', 'item3'], 'testArray');
      expect(errors).toEqual([]);
    });

    it('should allow undefined when not required', () => {
      const errors = ValidationUtils.validateStringArray(undefined, 'testArray', false);
      expect(errors).toEqual([]);
    });

    it('should detect missing required array', () => {
      const errors = ValidationUtils.validateStringArray(undefined, 'testArray', true);
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_ARRAY',
          message: 'testArray is required'
        })
      );
    });

    it('should detect invalid array type', () => {
      const errors = ValidationUtils.validateStringArray('not-an-array', 'testArray');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_ARRAY_TYPE',
          message: 'testArray must be an array'
        })
      );
    });

    it('should detect non-string array items', () => {
      const errors = ValidationUtils.validateStringArray(['valid', 123, 'also-valid'], 'testArray');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_ARRAY_ITEM',
          message: 'testArray[1] must be a string',
          field: 'testArray[1]'
        })
      );
    });
  });

  describe('validateNumber', () => {
    it('should validate correct numbers', () => {
      const errors = ValidationUtils.validateNumber(42, 'testNumber');
      expect(errors).toEqual([]);
    });

    it('should allow undefined when not required', () => {
      const errors = ValidationUtils.validateNumber(undefined, 'testNumber', undefined, undefined, false);
      expect(errors).toEqual([]);
    });

    it('should detect missing required number', () => {
      const errors = ValidationUtils.validateNumber(undefined, 'testNumber', undefined, undefined, true);
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_NUMBER',
          message: 'testNumber is required'
        })
      );
    });

    it('should detect invalid number type', () => {
      const errors = ValidationUtils.validateNumber('not-a-number', 'testNumber');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_NUMBER_TYPE',
          message: 'testNumber must be a valid number'
        })
      );
    });

    it('should detect NaN', () => {
      const errors = ValidationUtils.validateNumber(NaN, 'testNumber');
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_NUMBER_TYPE',
          message: 'testNumber must be a valid number'
        })
      );
    });

    it('should validate minimum value', () => {
      const errors = ValidationUtils.validateNumber(5, 'testNumber', 10);
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'NUMBER_TOO_SMALL',
          message: 'testNumber must be at least 10'
        })
      );
    });

    it('should validate maximum value', () => {
      const errors = ValidationUtils.validateNumber(15, 'testNumber', undefined, 10);
      
      expect(errors).toContainEqual(
        expect.objectContaining({
          code: 'NUMBER_TOO_LARGE',
          message: 'testNumber must be at most 10'
        })
      );
    });
  });

  describe('combineValidationResults', () => {
    it('should combine multiple valid results', () => {
      const result1 = ValidationUtils.createValidationResult();
      const result2 = ValidationUtils.createValidationResult();
      
      const combined = ValidationUtils.combineValidationResults(result1, result2);
      
      expect(combined.isValid).toBe(true);
      expect(combined.errors).toEqual([]);
      expect(combined.warnings).toEqual([]);
    });

    it('should combine results with errors', () => {
      const error1 = ValidationUtils.createError('ERROR1', 'Error 1');
      const error2 = ValidationUtils.createError('ERROR2', 'Error 2');
      const result1 = ValidationUtils.createValidationResult([error1]);
      const result2 = ValidationUtils.createValidationResult([error2]);
      
      const combined = ValidationUtils.combineValidationResults(result1, result2);
      
      expect(combined.isValid).toBe(false);
      expect(combined.errors).toEqual([error1, error2]);
    });

    it('should combine results with warnings', () => {
      const warning1 = ValidationUtils.createWarning('WARNING1', 'Warning 1');
      const warning2 = ValidationUtils.createWarning('WARNING2', 'Warning 2');
      const result1 = ValidationUtils.createValidationResult([], [warning1]);
      const result2 = ValidationUtils.createValidationResult([], [warning2]);
      
      const combined = ValidationUtils.combineValidationResults(result1, result2);
      
      expect(combined.isValid).toBe(true);
      expect(combined.warnings).toEqual([warning1, warning2]);
    });
  });

  describe('formatValidationResult', () => {
    it('should format valid result', () => {
      const result = ValidationUtils.createValidationResult();
      const formatted = ValidationUtils.formatValidationResult(result);
      
      expect(formatted).toBe('Validation passed');
    });

    it('should format result with errors', () => {
      const errors = [
        ValidationUtils.createError('ERROR1', 'Error message 1', 'field1'),
        ValidationUtils.createError('ERROR2', 'Error message 2', 'field2', 5)
      ];
      const result = ValidationUtils.createValidationResult(errors);
      const formatted = ValidationUtils.formatValidationResult(result);
      
      expect(formatted).toContain('Validation failed');
      expect(formatted).toContain('Errors (2):');
      expect(formatted).toContain('1. Error message 1 (field: field1)');
      expect(formatted).toContain('2. Error message 2 (field: field2) (row: 5)');
    });

    it('should format result with warnings', () => {
      const warnings = [
        ValidationUtils.createWarning('WARNING1', 'Warning message 1'),
        ValidationUtils.createWarning('WARNING2', 'Warning message 2', 'field2')
      ];
      const result = ValidationUtils.createValidationResult([], warnings);
      const formatted = ValidationUtils.formatValidationResult(result);
      
      expect(formatted).toContain('Validation passed');
      expect(formatted).toContain('Warnings (2):');
      expect(formatted).toContain('1. Warning message 1');
      expect(formatted).toContain('2. Warning message 2 (field: field2)');
    });
  });
});