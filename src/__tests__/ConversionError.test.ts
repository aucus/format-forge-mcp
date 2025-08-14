import { ConversionError } from '../errors/ConversionError.js';

describe('ConversionError', () => {
  describe('constructor', () => {
    it('should create error with basic properties', () => {
      const error = new ConversionError('Test error', 'CONVERSION_FAILED');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('CONVERSION_FAILED');
      expect(error.name).toBe('ConversionError');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should set default severity and category', () => {
      const error = new ConversionError('Test error', 'MEMORY_ERROR');

      expect(error.severity).toBe('critical');
      expect(error.category).toBe('system');
      expect(error.recoverable).toBe(false);
    });

    it('should allow custom options', () => {
      const error = new ConversionError('Test error', 'CONVERSION_FAILED', {
        severity: 'high',
        category: 'user',
        recoverable: false,
        userMessage: 'Custom user message',
        details: { custom: 'data' }
      });

      expect(error.severity).toBe('high');
      expect(error.category).toBe('user');
      expect(error.recoverable).toBe(false);
      expect(error.userMessage).toBe('Custom user message');
      expect(error.details).toEqual({ custom: 'data' });
    });
  });

  describe('getUserMessage', () => {
    it('should return custom user message when provided', () => {
      const error = new ConversionError('Test error', 'CONVERSION_FAILED', {
        userMessage: 'Custom message'
      });

      expect(error.getUserMessage()).toBe('Custom message');
    });

    it('should return default user message for error code', () => {
      const error = new ConversionError('Test error', 'FILE_NOT_FOUND');

      expect(error.getUserMessage()).toBe(
        'The specified file could not be found. Please check the file path and try again.'
      );
    });

    it('should return generic message for unknown error code', () => {
      const error = new ConversionError('Test error', 'UNKNOWN_ERROR');

      expect(error.getUserMessage()).toBe(
        'An unexpected error occurred. Please try again or contact support.'
      );
    });
  });

  describe('toJSON', () => {
    it('should serialize error to JSON', () => {
      const error = new ConversionError('Test error', 'VALIDATION_FAILED', {
        details: { errors: ['Field required'] }
      });

      const json = error.toJSON();

      expect(json).toMatchObject({
        name: 'ConversionError',
        message: 'Test error',
        code: 'VALIDATION_FAILED',
        severity: 'low',
        category: 'user',
        recoverable: true,
        details: { errors: ['Field required'] }
      });
      expect(json.timestamp).toBeDefined();
      expect(json.userMessage).toBeDefined();
      expect(json.stack).toBeDefined();
    });
  });

  describe('static factory methods', () => {
    it('should create file not found error', () => {
      const error = ConversionError.fileNotFound('/path/to/file.txt');

      expect(error.code).toBe('FILE_NOT_FOUND');
      expect(error.message).toBe('File not found: /path/to/file.txt');
      expect(error.details).toEqual({ filePath: '/path/to/file.txt' });
      expect(error.recoverable).toBe(false);
    });

    it('should create permission denied error', () => {
      const error = ConversionError.permissionDenied('Access denied to file');

      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.message).toBe('Access denied to file');
      expect(error.severity).toBe('high');
      expect(error.category).toBe('security');
    });

    it('should create unsupported format error', () => {
      const error = ConversionError.unsupportedFormat('xyz');

      expect(error.code).toBe('UNSUPPORTED_FORMAT');
      expect(error.message).toBe('Unsupported format: xyz');
      expect(error.details).toEqual({ format: 'xyz' });
    });

    it('should create conversion failed error', () => {
      const error = ConversionError.conversionFailed('Parse error', { line: 5 });

      expect(error.code).toBe('CONVERSION_FAILED');
      expect(error.message).toBe('Conversion failed: Parse error');
      expect(error.details).toEqual({ line: 5 });
      expect(error.recoverable).toBe(true);
    });

    it('should create validation failed error', () => {
      const errors = ['Field required', 'Invalid format'];
      const error = ConversionError.validationFailed(errors);

      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.message).toBe('Validation failed: Field required, Invalid format');
      expect(error.details).toEqual({ errors });
    });

    it('should create network error', () => {
      const error = ConversionError.networkError('Connection timeout');

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Connection timeout');
      expect(error.category).toBe('network');
      expect(error.recoverable).toBe(true);
    });

    it('should create timeout error', () => {
      const error = ConversionError.timeoutError('file_conversion', 30000);

      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.message).toBe('Operation \'file_conversion\' timed out after 30000ms');
      expect(error.details).toEqual({ operation: 'file_conversion', timeout: 30000 });
    });

    it('should create memory error', () => {
      const error = ConversionError.memoryError('Out of memory');

      expect(error.code).toBe('MEMORY_ERROR');
      expect(error.message).toBe('Out of memory');
      expect(error.severity).toBe('critical');
      expect(error.recoverable).toBe(false);
    });

    it('should create disk space error', () => {
      const error = ConversionError.diskSpaceError(1000000, 500000);

      expect(error.code).toBe('DISK_SPACE_ERROR');
      expect(error.message).toBe('Insufficient disk space: required 1000000 bytes, available 500000 bytes');
      expect(error.details).toEqual({ requiredSpace: 1000000, availableSpace: 500000 });
    });

    it('should create rate limit error', () => {
      const error = ConversionError.rateLimitError(60);

      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.message).toBe('Rate limit exceeded. Retry after 60 seconds.');
      expect(error.details).toEqual({ retryAfter: 60 });
      expect(error.severity).toBe('low');
    });

    it('should create configuration error', () => {
      const error = ConversionError.configurationError('Invalid config');

      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.message).toBe('Invalid config');
      expect(error.severity).toBe('high');
      expect(error.recoverable).toBe(true);
    });

    it('should create dependency error', () => {
      const error = ConversionError.dependencyError('libxml2');

      expect(error.code).toBe('DEPENDENCY_ERROR');
      expect(error.message).toBe('Required dependency \'libxml2\' is not available');
      expect(error.details).toEqual({ dependency: 'libxml2' });
    });

    it('should create unknown error from original error', () => {
      const originalError = new Error('Original error message');
      const error = ConversionError.unknownError(originalError, { context: 'test' });

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.message).toBe('Unknown error: Original error message');
      expect(error.details.originalError).toBe('Error');
      expect(error.details.originalMessage).toBe('Original error message');
      expect(error.details.context).toEqual({ context: 'test' });
    });
  });

  describe('error classification', () => {
    it('should classify system errors correctly', () => {
      const error = ConversionError.memoryError('Out of memory');
      expect(error.category).toBe('system');
      expect(error.severity).toBe('critical');
    });

    it('should classify user errors correctly', () => {
      const error = ConversionError.validationFailed(['Invalid input']);
      expect(error.category).toBe('user');
      expect(error.severity).toBe('low');
    });

    it('should classify security errors correctly', () => {
      const error = ConversionError.permissionDenied('Access denied');
      expect(error.category).toBe('security');
      expect(error.severity).toBe('high');
    });

    it('should classify network errors correctly', () => {
      const error = ConversionError.networkError('Connection failed');
      expect(error.category).toBe('network');
      expect(error.severity).toBe('medium');
    });

    it('should classify data errors correctly', () => {
      const error = ConversionError.corruptedData('File corrupted');
      expect(error.category).toBe('data');
      expect(error.severity).toBe('medium');
    });
  });

  describe('recoverability', () => {
    it('should mark recoverable errors correctly', () => {
      expect(ConversionError.conversionFailed('Parse error').recoverable).toBe(true);
      expect(ConversionError.networkError('Connection failed').recoverable).toBe(true);
      expect(ConversionError.rateLimitError().recoverable).toBe(true);
    });

    it('should mark non-recoverable errors correctly', () => {
      expect(ConversionError.fileNotFound('/path').recoverable).toBe(false);
      expect(ConversionError.permissionDenied('Access denied').recoverable).toBe(false);
      expect(ConversionError.memoryError('Out of memory').recoverable).toBe(false);
    });
  });
});