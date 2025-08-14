import { ErrorCode, ErrorSeverity, ErrorCategory } from '../types/index.js';

/**
 * Custom error class for conversion operations with enhanced classification
 */
export class ConversionError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly category: ErrorCategory;
  public readonly details?: any;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;
  public readonly userMessage?: string;

  constructor(
    message: string, 
    code: ErrorCode, 
    options: {
      severity?: ErrorSeverity;
      category?: ErrorCategory;
      details?: any;
      recoverable?: boolean;
      userMessage?: string;
    } = {}
  ) {
    super(message);
    this.name = 'ConversionError';
    this.code = code;
    this.severity = options.severity || this.getDefaultSeverity(code);
    this.category = options.category || this.getDefaultCategory(code);
    this.details = options.details;
    this.timestamp = new Date();
    this.recoverable = options.recoverable !== undefined ? options.recoverable : this.getDefaultRecoverable(code);
    this.userMessage = options.userMessage;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConversionError);
    }
  }

  /**
   * Get default severity for error code
   */
  private getDefaultSeverity(code: ErrorCode): ErrorSeverity {
    const severityMap: Record<ErrorCode, ErrorSeverity> = {
      'FILE_NOT_FOUND': 'medium',
      'PERMISSION_DENIED': 'high',
      'UNSUPPORTED_FORMAT': 'medium',
      'CONVERSION_FAILED': 'medium',
      'VALIDATION_FAILED': 'low',
      'NETWORK_ERROR': 'medium',
      'TIMEOUT_ERROR': 'medium',
      'MEMORY_ERROR': 'critical',
      'DISK_SPACE_ERROR': 'high',
      'CORRUPTED_DATA': 'medium',
      'AUTHENTICATION_ERROR': 'high',
      'RATE_LIMIT_ERROR': 'low',
      'CONFIGURATION_ERROR': 'high',
      'DEPENDENCY_ERROR': 'high',
      'UNKNOWN_ERROR': 'medium'
    };
    return severityMap[code] || 'medium';
  }

  /**
   * Get default category for error code
   */
  private getDefaultCategory(code: ErrorCode): ErrorCategory {
    const categoryMap: Record<ErrorCode, ErrorCategory> = {
      'FILE_NOT_FOUND': 'system',
      'PERMISSION_DENIED': 'security',
      'UNSUPPORTED_FORMAT': 'user',
      'CONVERSION_FAILED': 'data',
      'VALIDATION_FAILED': 'user',
      'NETWORK_ERROR': 'network',
      'TIMEOUT_ERROR': 'network',
      'MEMORY_ERROR': 'system',
      'DISK_SPACE_ERROR': 'system',
      'CORRUPTED_DATA': 'data',
      'AUTHENTICATION_ERROR': 'security',
      'RATE_LIMIT_ERROR': 'network',
      'CONFIGURATION_ERROR': 'configuration',
      'DEPENDENCY_ERROR': 'system',
      'UNKNOWN_ERROR': 'system'
    };
    return categoryMap[code] || 'system';
  }

  /**
   * Get default recoverable status for error code
   */
  private getDefaultRecoverable(code: ErrorCode): boolean {
    const recoverableMap: Record<ErrorCode, boolean> = {
      'FILE_NOT_FOUND': false,
      'PERMISSION_DENIED': false,
      'UNSUPPORTED_FORMAT': false,
      'CONVERSION_FAILED': true,
      'VALIDATION_FAILED': true,
      'NETWORK_ERROR': true,
      'TIMEOUT_ERROR': true,
      'MEMORY_ERROR': false,
      'DISK_SPACE_ERROR': false,
      'CORRUPTED_DATA': false,
      'AUTHENTICATION_ERROR': false,
      'RATE_LIMIT_ERROR': true,
      'CONFIGURATION_ERROR': true,
      'DEPENDENCY_ERROR': false,
      'UNKNOWN_ERROR': false
    };
    return recoverableMap[code] || false;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    if (this.userMessage) {
      return this.userMessage;
    }

    const userMessages: Record<ErrorCode, string> = {
      'FILE_NOT_FOUND': 'The specified file could not be found. Please check the file path and try again.',
      'PERMISSION_DENIED': 'Access denied. Please check file permissions or contact your administrator.',
      'UNSUPPORTED_FORMAT': 'The file format is not supported. Please use a supported format (CSV, Excel, JSON, XML, or Markdown).',
      'CONVERSION_FAILED': 'The file conversion failed. Please check your file and try again.',
      'VALIDATION_FAILED': 'The data validation failed. Please check your input and try again.',
      'NETWORK_ERROR': 'A network error occurred. Please check your connection and try again.',
      'TIMEOUT_ERROR': 'The operation timed out. Please try again or contact support if the problem persists.',
      'MEMORY_ERROR': 'Insufficient memory to complete the operation. Please try with a smaller file.',
      'DISK_SPACE_ERROR': 'Insufficient disk space. Please free up space and try again.',
      'CORRUPTED_DATA': 'The file appears to be corrupted or damaged. Please try with a different file.',
      'AUTHENTICATION_ERROR': 'Authentication failed. Please check your credentials.',
      'RATE_LIMIT_ERROR': 'Too many requests. Please wait a moment and try again.',
      'CONFIGURATION_ERROR': 'Configuration error. Please contact your administrator.',
      'DEPENDENCY_ERROR': 'A required dependency is missing or unavailable.',
      'UNKNOWN_ERROR': 'An unexpected error occurred. Please try again or contact support.'
    };

    return userMessages[this.code] || 'An error occurred during the operation.';
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      category: this.category,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      userMessage: this.getUserMessage(),
      details: this.details,
      stack: this.stack
    };
  }

  /**
   * Create a file not found error
   */
  static fileNotFound(filePath: string, userMessage?: string): ConversionError {
    return new ConversionError(
      `File not found: ${filePath}`,
      'FILE_NOT_FOUND',
      {
        details: { filePath },
        userMessage,
        recoverable: false
      }
    );
  }

  /**
   * Create a permission denied error
   */
  static permissionDenied(message: string, userMessage?: string): ConversionError {
    return new ConversionError(
      message,
      'PERMISSION_DENIED',
      {
        userMessage,
        recoverable: false
      }
    );
  }

  /**
   * Create a file system error
   */
  static fileSystemError(message: string, userMessage?: string): ConversionError {
    return new ConversionError(
      message,
      'FILE_NOT_FOUND',
      {
        userMessage,
        recoverable: false
      }
    );
  }

  /**
   * Create an unsupported format error
   */
  static unsupportedFormat(format: string, userMessage?: string): ConversionError {
    return new ConversionError(
      `Unsupported format: ${format}`,
      'UNSUPPORTED_FORMAT',
      {
        details: { format },
        userMessage,
        recoverable: false
      }
    );
  }

  /**
   * Create a conversion failed error
   */
  static conversionFailed(reason: string, details?: any, userMessage?: string): ConversionError {
    return new ConversionError(
      `Conversion failed: ${reason}`,
      'CONVERSION_FAILED',
      {
        details,
        userMessage,
        recoverable: true
      }
    );
  }

  /**
   * Create a validation failed error
   */
  static validationFailed(errors: string[], userMessage?: string): ConversionError {
    return new ConversionError(
      `Validation failed: ${errors.join(', ')}`,
      'VALIDATION_FAILED',
      {
        details: { errors },
        userMessage,
        recoverable: true
      }
    );
  }

  /**
   * Create a network error
   */
  static networkError(message: string, details?: any): ConversionError {
    return new ConversionError(
      message,
      'NETWORK_ERROR',
      {
        details,
        recoverable: true
      }
    );
  }

  /**
   * Create a timeout error
   */
  static timeoutError(operation: string, timeout: number): ConversionError {
    return new ConversionError(
      `Operation '${operation}' timed out after ${timeout}ms`,
      'TIMEOUT_ERROR',
      {
        details: { operation, timeout },
        recoverable: true
      }
    );
  }

  /**
   * Create a memory error
   */
  static memoryError(message: string, details?: any): ConversionError {
    return new ConversionError(
      message,
      'MEMORY_ERROR',
      {
        details,
        severity: 'critical',
        recoverable: false
      }
    );
  }

  /**
   * Create a disk space error
   */
  static diskSpaceError(requiredSpace: number, availableSpace: number): ConversionError {
    return new ConversionError(
      `Insufficient disk space: required ${requiredSpace} bytes, available ${availableSpace} bytes`,
      'DISK_SPACE_ERROR',
      {
        details: { requiredSpace, availableSpace },
        severity: 'high',
        recoverable: false
      }
    );
  }

  /**
   * Create a corrupted data error
   */
  static corruptedData(message: string, details?: any): ConversionError {
    return new ConversionError(
      message,
      'CORRUPTED_DATA',
      {
        details,
        recoverable: false
      }
    );
  }

  /**
   * Create an authentication error
   */
  static authenticationError(message: string): ConversionError {
    return new ConversionError(
      message,
      'AUTHENTICATION_ERROR',
      {
        severity: 'high',
        category: 'security',
        recoverable: false
      }
    );
  }

  /**
   * Create a rate limit error
   */
  static rateLimitError(retryAfter?: number): ConversionError {
    const message = retryAfter 
      ? `Rate limit exceeded. Retry after ${retryAfter} seconds.`
      : 'Rate limit exceeded. Please try again later.';
    
    return new ConversionError(
      message,
      'RATE_LIMIT_ERROR',
      {
        details: { retryAfter },
        severity: 'low',
        recoverable: true
      }
    );
  }

  /**
   * Create a configuration error
   */
  static configurationError(message: string, details?: any): ConversionError {
    return new ConversionError(
      message,
      'CONFIGURATION_ERROR',
      {
        details,
        severity: 'high',
        recoverable: true
      }
    );
  }

  /**
   * Create a dependency error
   */
  static dependencyError(dependency: string, message?: string): ConversionError {
    const errorMessage = message || `Required dependency '${dependency}' is not available`;
    
    return new ConversionError(
      errorMessage,
      'DEPENDENCY_ERROR',
      {
        details: { dependency },
        severity: 'high',
        recoverable: false
      }
    );
  }

  /**
   * Create an unknown error
   */
  static unknownError(originalError: Error, context?: any): ConversionError {
    return new ConversionError(
      `Unknown error: ${originalError.message}`,
      'UNKNOWN_ERROR',
      {
        details: { 
          originalError: originalError.name,
          originalMessage: originalError.message,
          originalStack: originalError.stack,
          context
        },
        recoverable: false
      }
    );
  }
}