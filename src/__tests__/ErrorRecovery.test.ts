import { ErrorRecovery } from '../errors/ErrorRecovery.js';
import { ConversionError } from '../errors/ConversionError.js';

describe('ErrorRecovery', () => {
  let errorRecovery: ErrorRecovery;

  beforeEach(() => {
    errorRecovery = new ErrorRecovery(2, [100, 200]); // 2 retries with short delays for testing
  });

  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await errorRecovery.withRetry(operation, 'test-operation');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry recoverable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(ConversionError.networkError('Network failed'))
        .mockResolvedValue('success');

      const result = await errorRecovery.withRetry(operation, 'test-operation');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-recoverable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValue(ConversionError.fileNotFound('/path/to/file'));

      await expect(errorRecovery.withRetry(operation, 'test-operation'))
        .rejects.toThrow('File not found');
      
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      const operation = jest.fn()
        .mockRejectedValue(ConversionError.networkError('Network failed'));

      await expect(errorRecovery.withRetry(operation, 'test-operation'))
        .rejects.toThrow('Network failed');
      
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should use custom retry logic', async () => {
      const operation = jest.fn()
        .mockRejectedValue(ConversionError.validationFailed(['Invalid data']));

      const shouldRetry = jest.fn().mockReturnValue(false);

      await expect(errorRecovery.withRetry(operation, 'test-operation', { shouldRetry }))
        .rejects.toThrow('Validation failed');
      
      expect(operation).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith(expect.any(ConversionError));
    });

    it('should handle non-ConversionError exceptions', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('Generic error'));

      await expect(errorRecovery.withRetry(operation, 'test-operation'))
        .rejects.toThrow('Unknown error: Generic error');
      
      expect(operation).toHaveBeenCalledTimes(1); // Unknown errors are not retried by default
    });
  });

  describe('withFallback', () => {
    it('should use primary operation when successful', async () => {
      const primaryOperation = jest.fn().mockResolvedValue('primary-result');
      const fallbackOperation = jest.fn().mockResolvedValue('fallback-result');

      const result = await errorRecovery.withFallback(
        primaryOperation,
        fallbackOperation,
        'test-operation'
      );

      expect(result).toBe('primary-result');
      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).not.toHaveBeenCalled();
    });

    it('should use fallback when primary fails', async () => {
      const primaryOperation = jest.fn()
        .mockRejectedValue(ConversionError.networkError('Primary failed'));
      const fallbackOperation = jest.fn().mockResolvedValue('fallback-result');

      const result = await errorRecovery.withFallback(
        primaryOperation,
        fallbackOperation,
        'test-operation'
      );

      expect(result).toBe('fallback-result');
      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).toHaveBeenCalledTimes(1);
    });

    it('should throw primary error when both fail', async () => {
      const primaryError = ConversionError.networkError('Primary failed');
      const fallbackError = ConversionError.networkError('Fallback failed');
      
      const primaryOperation = jest.fn().mockRejectedValue(primaryError);
      const fallbackOperation = jest.fn().mockRejectedValue(fallbackError);

      await expect(errorRecovery.withFallback(
        primaryOperation,
        fallbackOperation,
        'test-operation'
      )).rejects.toBe(primaryError);

      expect(primaryOperation).toHaveBeenCalledTimes(1);
      expect(fallbackOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('withCircuitBreaker', () => {
    it('should execute operation when circuit is closed', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await errorRecovery.withCircuitBreaker(operation, 'test-service');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should open circuit after failure threshold', async () => {
      const operation = jest.fn()
        .mockRejectedValue(ConversionError.networkError('Service failed'));

      // Fail 5 times to reach default threshold
      for (let i = 0; i < 5; i++) {
        await expect(errorRecovery.withCircuitBreaker(operation, 'test-service'))
          .rejects.toThrow('Service failed');
      }

      // Next call should fail immediately due to open circuit
      await expect(errorRecovery.withCircuitBreaker(operation, 'test-service'))
        .rejects.toThrow('Circuit breaker is open');

      expect(operation).toHaveBeenCalledTimes(5); // Should not call operation when circuit is open
    });

    it('should use custom failure threshold', async () => {
      const operation = jest.fn()
        .mockRejectedValue(ConversionError.networkError('Service failed'));

      const options = { failureThreshold: 2 };

      // Fail 2 times to reach custom threshold
      for (let i = 0; i < 2; i++) {
        await expect(errorRecovery.withCircuitBreaker(operation, 'test-service', options))
          .rejects.toThrow('Service failed');
      }

      // Circuit should now be open
      await expect(errorRecovery.withCircuitBreaker(operation, 'test-service', options))
        .rejects.toThrow('Circuit breaker is open');

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRecoverySuggestions', () => {
    it('should provide suggestions for file not found error', () => {
      const error = ConversionError.fileNotFound('/path/to/file');
      const suggestions = errorRecovery.getRecoverySuggestions(error);

      expect(suggestions).toContain('Verify the file path is correct');
      expect(suggestions).toContain('Check if the file exists in the specified location');
      expect(suggestions).toContain('Ensure you have read permissions for the file');
    });

    it('should provide suggestions for validation error', () => {
      const error = ConversionError.validationFailed(['Field required']);
      const suggestions = errorRecovery.getRecoverySuggestions(error);

      expect(suggestions).toContain('Review the validation errors in the details');
      expect(suggestions).toContain('Fix the data issues and try again');
      expect(suggestions).toContain('Check the data format requirements');
    });

    it('should provide suggestions for rate limit error', () => {
      const error = ConversionError.rateLimitError(60);
      const suggestions = errorRecovery.getRecoverySuggestions(error);

      expect(suggestions).toContain('Wait before trying again');
      expect(suggestions).toContain('Reduce the frequency of requests');
      expect(suggestions).toContain('Retry after 60 seconds');
    });

    it('should provide generic suggestions for unknown errors', () => {
      const error = ConversionError.unknownError(new Error('Unknown'));
      const suggestions = errorRecovery.getRecoverySuggestions(error);

      expect(suggestions).toContain('Try the operation again');
      expect(suggestions).toContain('Check the system logs for more details');
      expect(suggestions).toContain('Contact support if the problem persists');
    });
  });

  describe('createErrorReport', () => {
    it('should create comprehensive error report', () => {
      const error = ConversionError.conversionFailed('Parse error', { line: 5 });
      const context = { operation: 'file-conversion', file: 'test.csv' };

      const report = errorRecovery.createErrorReport(error, context);

      expect(report.error).toMatchObject({
        name: 'ConversionError',
        code: 'CONVERSION_FAILED',
        message: 'Conversion failed: Parse error'
      });
      expect(report.suggestions).toBeInstanceOf(Array);
      expect(report.suggestions.length).toBeGreaterThan(0);
      expect(report.context).toBe(context);
      expect(report.timestamp).toBeDefined();
    });

    it('should include error details in report', () => {
      const error = ConversionError.validationFailed(['Field required', 'Invalid format']);
      const report = errorRecovery.createErrorReport(error);

      expect(report.error.details).toEqual({ errors: ['Field required', 'Invalid format'] });
      expect(report.error.severity).toBe('low');
      expect(report.error.category).toBe('user');
      expect(report.error.recoverable).toBe(true);
    });
  });
});