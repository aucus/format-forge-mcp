import {
  ErrorClassificationSystem,
  ClassifiedError,
  ErrorCategory,
  ErrorSeverity,
  RecoveryStrategy,
  ErrorDetails
} from '../errors/ErrorClassification.js';

describe('ErrorClassificationSystem', () => {
  let classificationSystem: ErrorClassificationSystem;

  beforeEach(() => {
    classificationSystem = new ErrorClassificationSystem();
  });

  describe('ClassifiedError', () => {
    it('should create error with default details', () => {
      const error = new ClassifiedError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.details.category).toBe(ErrorCategory.UNKNOWN);
      expect(error.details.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.details.recoveryStrategy).toBe(RecoveryStrategy.NONE);
      expect(error.details.userMessage).toBe('Test error');
      expect(error.details.technicalMessage).toBe('Test error');
      expect(error.details.errorId).toMatch(/^ERR_[A-Z0-9_]+$/);
      expect(error.details.timestamp).toBeInstanceOf(Date);
    });

    it('should create error with custom details', () => {
      const customDetails: Partial<ErrorDetails> = {
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.RETRY,
        userMessage: 'User friendly message',
        suggestions: ['Try again', 'Check permissions'],
        retryable: true,
        maxRetries: 5
      };

      const error = new ClassifiedError('Technical error', customDetails);

      expect(error.details.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(error.details.severity).toBe(ErrorSeverity.HIGH);
      expect(error.details.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
      expect(error.details.userMessage).toBe('User friendly message');
      expect(error.details.suggestions).toEqual(['Try again', 'Check permissions']);
      expect(error.details.retryable).toBe(true);
      expect(error.details.maxRetries).toBe(5);
    });

    it('should handle retry logic correctly', () => {
      const error = new ClassifiedError('Retryable error', {
        retryable: true,
        maxRetries: 3
      });

      expect(error.isRetryable()).toBe(true);
      expect(error.getRetryCount()).toBe(0);

      error.incrementRetryCount();
      expect(error.getRetryCount()).toBe(1);
      expect(error.isRetryable()).toBe(true);

      error.incrementRetryCount();
      error.incrementRetryCount();
      expect(error.getRetryCount()).toBe(3);
      expect(error.isRetryable()).toBe(false);
    });

    it('should calculate retry delay with exponential backoff', () => {
      const error = new ClassifiedError('Retryable error', {
        retryable: true,
        retryDelay: 1000
      });

      expect(error.getRetryDelay()).toBe(1000);

      error.incrementRetryCount();
      expect(error.getRetryDelay()).toBe(1000);

      const errorWithoutCustomDelay = new ClassifiedError('Test', { retryable: true });
      expect(errorWithoutCustomDelay.getRetryDelay()).toBe(1000); // 1000 * 2^0

      errorWithoutCustomDelay.incrementRetryCount();
      expect(errorWithoutCustomDelay.getRetryDelay()).toBe(2000); // 1000 * 2^1

      errorWithoutCustomDelay.incrementRetryCount();
      expect(errorWithoutCustomDelay.getRetryDelay()).toBe(4000); // 1000 * 2^2
    });

    it('should serialize and deserialize correctly', () => {
      const originalError = new ClassifiedError('Test error', {
        category: ErrorCategory.FORMAT,
        severity: ErrorSeverity.HIGH,
        suggestions: ['Fix format', 'Try again']
      });

      originalError.incrementRetryCount();

      const json = originalError.toJSON();
      const deserializedError = ClassifiedError.fromJSON(json);

      expect(deserializedError.message).toBe(originalError.message);
      expect(deserializedError.details.category).toBe(originalError.details.category);
      expect(deserializedError.details.severity).toBe(originalError.details.severity);
      expect(deserializedError.details.suggestions).toEqual(originalError.details.suggestions);
      expect(deserializedError.getRetryCount()).toBe(originalError.getRetryCount());
    });
  });

  describe('Error Classification', () => {
    it('should classify file system errors correctly', () => {
      const fileNotFoundError = new Error('ENOENT: no such file or directory');
      const classified = classificationSystem.classifyError(fileNotFoundError);

      expect(classified.details.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(classified.details.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.USER_INPUT);
      expect(classified.details.userMessage).toBe('The specified file could not be found');
      expect(classified.details.suggestions).toContain('Check if the file path is correct');
    });

    it('should classify permission errors correctly', () => {
      const permissionError = new Error('EACCES: permission denied');
      const classified = classificationSystem.classifyError(permissionError);

      expect(classified.details.category).toBe(ErrorCategory.PERMISSION);
      expect(classified.details.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.USER_INPUT);
      expect(classified.details.userMessage).toBe('Permission denied accessing the file');
      expect(classified.details.suggestions).toContain('Check file permissions');
    });

    it('should classify file exists errors correctly', () => {
      const fileExistsError = new Error('EEXIST: file already exists');
      const classified = classificationSystem.classifyError(fileExistsError);

      expect(classified.details.category).toBe(ErrorCategory.FILE_SYSTEM);
      expect(classified.details.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.FALLBACK);
      expect(classified.details.userMessage).toBe('File already exists at the destination');
      expect(classified.details.retryable).toBe(true);
      expect(classified.details.maxRetries).toBe(1);
    });

    it('should classify JSON format errors correctly', () => {
      const jsonError = new SyntaxError('Unexpected token } in JSON');
      const classified = classificationSystem.classifyError(jsonError);

      expect(classified.details.category).toBe(ErrorCategory.FORMAT);
      expect(classified.details.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.FALLBACK);
      expect(classified.details.userMessage).toBe('Invalid JSON format detected');
      expect(classified.details.suggestions).toContain('Verify the JSON file is properly formatted');
    });

    it('should classify XML format errors correctly', () => {
      const xmlError = new Error('XML parsing failed: malformed document');
      const classified = classificationSystem.classifyError(xmlError);

      expect(classified.details.category).toBe(ErrorCategory.FORMAT);
      expect(classified.details.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.FALLBACK);
      expect(classified.details.userMessage).toBe('Invalid XML format detected');
      expect(classified.details.suggestions).toContain('Verify the XML file is well-formed');
    });

    it('should classify CSV format errors correctly', () => {
      const csvError = new Error('CSV parsing failed: invalid delimiter');
      const classified = classificationSystem.classifyError(csvError);

      expect(classified.details.category).toBe(ErrorCategory.FORMAT);
      expect(classified.details.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.FALLBACK);
      expect(classified.details.userMessage).toBe('CSV format issue detected');
      expect(classified.details.retryable).toBe(true);
      expect(classified.details.maxRetries).toBe(2);
    });

    it('should classify validation errors correctly', () => {
      const validationError = new Error('Validation failed: required field missing');
      const classified = classificationSystem.classifyError(validationError);

      expect(classified.details.category).toBe(ErrorCategory.VALIDATION);
      expect(classified.details.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.USER_INPUT);
      expect(classified.details.userMessage).toBe('Data validation failed');
      expect(classified.details.suggestions).toContain('Check input data format and structure');
    });

    it('should classify memory errors correctly', () => {
      const memoryError = new Error('Out of memory: heap limit exceeded');
      const classified = classificationSystem.classifyError(memoryError);

      expect(classified.details.category).toBe(ErrorCategory.RESOURCE);
      expect(classified.details.severity).toBe(ErrorSeverity.CRITICAL);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.FALLBACK);
      expect(classified.details.userMessage).toBe('Insufficient memory to complete operation');
      expect(classified.details.retryable).toBe(true);
      expect(classified.details.maxRetries).toBe(1);
    });

    it('should classify disk space errors correctly', () => {
      const diskError = new Error('No space left on device');
      const classified = classificationSystem.classifyError(diskError);

      expect(classified.details.category).toBe(ErrorCategory.RESOURCE);
      expect(classified.details.severity).toBe(ErrorSeverity.CRITICAL);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.USER_INPUT);
      expect(classified.details.userMessage).toBe('Insufficient disk space');
      expect(classified.details.retryable).toBe(false);
    });

    it('should classify network errors correctly', () => {
      const networkError = new Error('Connection timeout');
      const classified = classificationSystem.classifyError(networkError);

      expect(classified.details.category).toBe(ErrorCategory.NETWORK);
      expect(classified.details.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.RETRY);
      expect(classified.details.userMessage).toBe('Network operation failed');
      expect(classified.details.retryable).toBe(true);
      expect(classified.details.maxRetries).toBe(3);
      expect(classified.details.retryDelay).toBe(2000);
    });

    it('should classify unknown errors with defaults', () => {
      const unknownError = new Error('Some unknown error occurred');
      const classified = classificationSystem.classifyError(unknownError);

      expect(classified.details.category).toBe(ErrorCategory.UNKNOWN);
      expect(classified.details.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.details.recoveryStrategy).toBe(RecoveryStrategy.NONE);
      expect(classified.details.userMessage).toBe('An unexpected error occurred');
      expect(classified.details.retryable).toBe(false);
    });

    it('should include context in classified error', () => {
      const error = new Error('Test error');
      const context = { filePath: '/test/file.csv', operation: 'read' };
      const classified = classificationSystem.classifyError(error, context);

      expect(classified.details.context).toEqual(context);
      expect(classified.details.technicalMessage).toContain('Test error');
    });
  });

  describe('Error Recovery', () => {
    it('should handle retry recovery strategy', async () => {
      const error = new ClassifiedError('Retryable error', {
        recoveryStrategy: RecoveryStrategy.RETRY,
        retryable: true,
        maxRetries: 3
      });

      const result = await classificationSystem.attemptRecovery(error);

      expect(result.success).toBe(true);
      expect(result.action).toBe('retry_scheduled');
      expect(result.message).toContain('Retry scheduled');
      expect(result.data).toHaveProperty('delay');
      expect(result.data).toHaveProperty('retryCount');
      expect(error.getRetryCount()).toBe(1);
    });

    it('should handle retry exhaustion', async () => {
      const error = new ClassifiedError('Retryable error', {
        recoveryStrategy: RecoveryStrategy.RETRY,
        retryable: true,
        maxRetries: 1
      });

      // Exhaust retries
      error.incrementRetryCount();

      const result = await classificationSystem.attemptRecovery(error);

      expect(result.success).toBe(false);
      expect(result.action).toBe('retry_exhausted');
      expect(result.message).toBe('Maximum retry attempts reached');
    });

    it('should handle fallback recovery strategy', async () => {
      const error = new ClassifiedError('Fallback error', {
        recoveryStrategy: RecoveryStrategy.FALLBACK,
        suggestions: ['Try alternative approach', 'Contact support']
      });

      const result = await classificationSystem.attemptRecovery(error);

      expect(result.success).toBe(true);
      expect(result.action).toBe('fallback_suggested');
      expect(result.message).toContain('alternative approach');
      expect(result.data).toHaveProperty('suggestions');
      expect(result.data.suggestions).toEqual(error.getSuggestions());
    });

    it('should handle skip recovery strategy', async () => {
      const error = new ClassifiedError('Skip error', {
        recoveryStrategy: RecoveryStrategy.SKIP
      });

      const result = await classificationSystem.attemptRecovery(error);

      expect(result.success).toBe(true);
      expect(result.action).toBe('skip_recommended');
      expect(result.message).toContain('Skip this operation');
    });

    it('should handle abort recovery strategy', async () => {
      const error = new ClassifiedError('Critical error', {
        recoveryStrategy: RecoveryStrategy.ABORT
      });

      const result = await classificationSystem.attemptRecovery(error);

      expect(result.success).toBe(false);
      expect(result.action).toBe('abort_required');
      expect(result.message).toContain('must be aborted');
    });

    it('should handle missing recovery handler', async () => {
      const error = new ClassifiedError('Unknown strategy error', {
        recoveryStrategy: 'unknown_strategy' as RecoveryStrategy
      });

      const result = await classificationSystem.attemptRecovery(error);

      expect(result.success).toBe(false);
      expect(result.action).toBe('no_handler');
      expect(result.message).toContain('No recovery handler available');
    });

    it('should handle recovery handler errors', async () => {
      const error = new ClassifiedError('Handler error', {
        recoveryStrategy: RecoveryStrategy.RETRY,
        retryable: true
      });

      // Register a failing handler
      classificationSystem.registerRecoveryHandler(RecoveryStrategy.RETRY, async () => {
        throw new Error('Handler failed');
      });

      const result = await classificationSystem.attemptRecovery(error);

      expect(result.success).toBe(false);
      expect(result.action).toBe('recovery_failed');
      expect(result.message).toContain('Recovery failed');
    });

    it('should allow custom recovery handler registration', async () => {
      const customStrategy = 'custom_strategy' as RecoveryStrategy;
      const customHandler = jest.fn().mockResolvedValue({
        success: true,
        action: 'custom_action',
        message: 'Custom recovery completed'
      });

      classificationSystem.registerRecoveryHandler(customStrategy, customHandler);

      const error = new ClassifiedError('Custom error', {
        recoveryStrategy: customStrategy
      });

      const result = await classificationSystem.attemptRecovery(error);

      expect(customHandler).toHaveBeenCalledWith(error);
      expect(result.success).toBe(true);
      expect(result.action).toBe('custom_action');
      expect(result.message).toBe('Custom recovery completed');
    });
  });

  describe('Error Statistics', () => {
    it('should calculate error statistics correctly', () => {
      const errors = [
        new ClassifiedError('Error 1', {
          category: ErrorCategory.FILE_SYSTEM,
          severity: ErrorSeverity.HIGH,
          retryable: true
        }),
        new ClassifiedError('Error 2', {
          category: ErrorCategory.FORMAT,
          severity: ErrorSeverity.MEDIUM,
          retryable: false
        }),
        new ClassifiedError('Error 3', {
          category: ErrorCategory.FILE_SYSTEM,
          severity: ErrorSeverity.LOW,
          retryable: true
        })
      ];

      // Add some retry counts
      errors[0].incrementRetryCount();
      errors[0].incrementRetryCount();
      errors[2].incrementRetryCount();

      const stats = classificationSystem.getErrorStatistics(errors);

      expect(stats.totalErrors).toBe(3);
      expect(stats.byCategory[ErrorCategory.FILE_SYSTEM]).toBe(2);
      expect(stats.byCategory[ErrorCategory.FORMAT]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.HIGH]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.MEDIUM]).toBe(1);
      expect(stats.bySeverity[ErrorSeverity.LOW]).toBe(1);
      expect(stats.retryableErrors).toBe(2);
      expect(stats.averageRetryCount).toBe(1); // (2 + 0 + 1) / 3 = 1
    });

    it('should handle empty error list', () => {
      const stats = classificationSystem.getErrorStatistics([]);

      expect(stats.totalErrors).toBe(0);
      expect(stats.retryableErrors).toBe(0);
      expect(stats.averageRetryCount).toBe(0);
      
      // All categories should be initialized to 0
      Object.values(ErrorCategory).forEach(category => {
        expect(stats.byCategory[category]).toBe(0);
      });
      
      Object.values(ErrorSeverity).forEach(severity => {
        expect(stats.bySeverity[severity]).toBe(0);
      });
    });
  });
});