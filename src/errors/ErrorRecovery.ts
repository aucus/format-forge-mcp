import { ConversionError } from './ConversionError.js';
import { Logger } from '../core/Logger.js';

/**
 * Error recovery strategies and mechanisms
 */
export class ErrorRecovery {
  private logger: Logger;
  private maxRetries: number;
  private retryDelays: number[];

  constructor(maxRetries: number = 3, retryDelays: number[] = [1000, 2000, 4000]) {
    this.logger = Logger.getInstance();
    this.maxRetries = maxRetries;
    this.retryDelays = retryDelays;
  }

  /**
   * Execute operation with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
    options: {
      maxRetries?: number;
      retryDelays?: number[];
      shouldRetry?: (error: ConversionError) => boolean;
    } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || this.maxRetries;
    const retryDelays = options.retryDelays || this.retryDelays;
    const shouldRetry = options.shouldRetry || this.defaultShouldRetry;

    let lastError: ConversionError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`Executing operation: ${context}`, { attempt, maxRetries });
        return await operation();
      } catch (error) {
        const conversionError = error instanceof ConversionError 
          ? error 
          : ConversionError.unknownError(error as Error, { context, attempt });

        lastError = conversionError;

        if (attempt === maxRetries || !shouldRetry(conversionError)) {
          this.logger.error(`Operation failed after ${attempt + 1} attempts: ${context}`, conversionError);
          throw conversionError;
        }

        const delay = retryDelays[Math.min(attempt, retryDelays.length - 1)];
        this.logger.warn(`Operation failed, retrying in ${delay}ms: ${context}`, {
          attempt: attempt + 1,
          maxRetries,
          error: conversionError.message
        });

        await this.delay(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Default retry strategy
   */
  private defaultShouldRetry(error: ConversionError): boolean {
    // Only retry recoverable errors
    if (!error.recoverable) {
      return false;
    }

    // Retry specific error types
    const retryableErrors = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'RATE_LIMIT_ERROR',
      'CONVERSION_FAILED'
    ];

    return retryableErrors.includes(error.code);
  }

  /**
   * Execute operation with fallback
   */
  async withFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    context: string
  ): Promise<T> {
    try {
      this.logger.debug(`Executing primary operation: ${context}`);
      return await primaryOperation();
    } catch (error) {
      const conversionError = error instanceof ConversionError 
        ? error 
        : ConversionError.unknownError(error as Error, { context });

      this.logger.warn(`Primary operation failed, trying fallback: ${context}`, conversionError);

      try {
        return await fallbackOperation();
      } catch (fallbackError) {
        const fallbackConversionError = fallbackError instanceof ConversionError 
          ? fallbackError 
          : ConversionError.unknownError(fallbackError as Error, { context: `${context} (fallback)` });

        this.logger.error(`Both primary and fallback operations failed: ${context}`, fallbackConversionError);
        
        // Throw the original error if fallback also fails
        throw conversionError;
      }
    }
  }

  /**
   * Execute operation with circuit breaker pattern
   */
  async withCircuitBreaker<T>(
    operation: () => Promise<T>,
    context: string,
    options: {
      failureThreshold?: number;
      resetTimeout?: number;
      monitoringPeriod?: number;
    } = {}
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(context, options);
    
    if (circuitBreaker.state === 'open') {
      if (Date.now() - circuitBreaker.lastFailureTime < circuitBreaker.resetTimeout) {
        throw ConversionError.dependencyError(
          context,
          'Circuit breaker is open - service temporarily unavailable'
        );
      } else {
        // Try to reset circuit breaker
        circuitBreaker.state = 'half-open';
        this.logger.info(`Circuit breaker half-open for: ${context}`);
      }
    }

    try {
      const result = await operation();
      
      if (circuitBreaker.state === 'half-open') {
        circuitBreaker.state = 'closed';
        circuitBreaker.failureCount = 0;
        this.logger.info(`Circuit breaker closed for: ${context}`);
      }
      
      return result;
    } catch (error) {
      circuitBreaker.failureCount++;
      circuitBreaker.lastFailureTime = Date.now();

      if (circuitBreaker.failureCount >= circuitBreaker.failureThreshold) {
        circuitBreaker.state = 'open';
        this.logger.warn(`Circuit breaker opened for: ${context}`, {
          failureCount: circuitBreaker.failureCount,
          threshold: circuitBreaker.failureThreshold
        });
      }

      throw error instanceof ConversionError 
        ? error 
        : ConversionError.unknownError(error as Error, { context });
    }
  }

  /**
   * Get or create circuit breaker for context
   */
  private circuitBreakers = new Map<string, {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime: number;
    failureThreshold: number;
    resetTimeout: number;
  }>();

  private getCircuitBreaker(context: string, options: {
    failureThreshold?: number;
    resetTimeout?: number;
  }) {
    if (!this.circuitBreakers.has(context)) {
      this.circuitBreakers.set(context, {
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
        failureThreshold: options.failureThreshold || 5,
        resetTimeout: options.resetTimeout || 60000 // 1 minute
      });
    }
    return this.circuitBreakers.get(context)!;
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get recovery suggestions for an error
   */
  getRecoverySuggestions(error: ConversionError): string[] {
    const suggestions: string[] = [];

    switch (error.code) {
      case 'FILE_NOT_FOUND':
        suggestions.push('Verify the file path is correct');
        suggestions.push('Check if the file exists in the specified location');
        suggestions.push('Ensure you have read permissions for the file');
        break;

      case 'PERMISSION_DENIED':
        suggestions.push('Check file and directory permissions');
        suggestions.push('Run with appropriate user privileges');
        suggestions.push('Contact your system administrator');
        break;

      case 'UNSUPPORTED_FORMAT':
        suggestions.push('Use a supported format: CSV, Excel, JSON, XML, or Markdown');
        suggestions.push('Convert your file to a supported format first');
        suggestions.push('Check the file extension matches the content');
        break;

      case 'CONVERSION_FAILED':
        suggestions.push('Verify the input file is not corrupted');
        suggestions.push('Check if the file format is valid');
        suggestions.push('Try with a smaller file to test');
        suggestions.push('Review any transformation parameters');
        break;

      case 'VALIDATION_FAILED':
        suggestions.push('Review the validation errors in the details');
        suggestions.push('Fix the data issues and try again');
        suggestions.push('Check the data format requirements');
        break;

      case 'NETWORK_ERROR':
        suggestions.push('Check your internet connection');
        suggestions.push('Verify network settings and firewall rules');
        suggestions.push('Try again in a few moments');
        break;

      case 'TIMEOUT_ERROR':
        suggestions.push('Try with a smaller file');
        suggestions.push('Increase the timeout setting if possible');
        suggestions.push('Check system resources and performance');
        break;

      case 'MEMORY_ERROR':
        suggestions.push('Try with a smaller file');
        suggestions.push('Close other applications to free memory');
        suggestions.push('Process the file in smaller chunks');
        break;

      case 'DISK_SPACE_ERROR':
        suggestions.push('Free up disk space');
        suggestions.push('Choose a different output location');
        suggestions.push('Clean up temporary files');
        break;

      case 'RATE_LIMIT_ERROR':
        suggestions.push('Wait before trying again');
        suggestions.push('Reduce the frequency of requests');
        if (error.details?.retryAfter) {
          suggestions.push(`Retry after ${error.details.retryAfter} seconds`);
        }
        break;

      case 'CONFIGURATION_ERROR':
        suggestions.push('Check the configuration settings');
        suggestions.push('Verify all required parameters are provided');
        suggestions.push('Contact your administrator for configuration help');
        break;

      case 'DEPENDENCY_ERROR':
        suggestions.push('Install the required dependencies');
        suggestions.push('Check the system requirements');
        suggestions.push('Contact support for installation help');
        break;

      default:
        suggestions.push('Try the operation again');
        suggestions.push('Check the system logs for more details');
        suggestions.push('Contact support if the problem persists');
    }

    return suggestions;
  }

  /**
   * Create error report for debugging
   */
  createErrorReport(error: ConversionError, context?: any): {
    error: Record<string, any>;
    suggestions: string[];
    context?: any;
    timestamp: string;
  } {
    return {
      error: error.toJSON(),
      suggestions: this.getRecoverySuggestions(error),
      context,
      timestamp: new Date().toISOString()
    };
  }
}