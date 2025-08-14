import { ConversionError } from './ConversionError.js';
import { Logger } from '../core/Logger.js';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  FILE_SYSTEM = 'file_system',
  FORMAT = 'format',
  VALIDATION = 'validation',
  TRANSFORMATION = 'transformation',
  NETWORK = 'network',
  PERMISSION = 'permission',
  RESOURCE = 'resource',
  CONFIGURATION = 'configuration',
  UNKNOWN = 'unknown'
}

/**
 * Error recovery strategies
 */
export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  SKIP = 'skip',
  ABORT = 'abort',
  USER_INPUT = 'user_input',
  NONE = 'none'
}

/**
 * Detailed error information
 */
export interface ErrorDetails {
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoveryStrategy: RecoveryStrategy;
  userMessage: string;
  technicalMessage: string;
  suggestions: string[];
  context: Record<string, any>;
  timestamp: Date;
  errorId: string;
  retryable: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Recovery action result
 */
export interface RecoveryResult {
  success: boolean;
  action: string;
  message: string;
  data?: any;
}

/**
 * Extended conversion error with classification and recovery
 */
export class ClassifiedError extends Error {
  public readonly details: ErrorDetails;
  private logger: Logger;
  private retryCount: number = 0;

  constructor(message: string, details: Partial<ErrorDetails> = {}) {
    super(message);
    this.logger = Logger.getInstance();
    
    this.details = {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.NONE,
      userMessage: message,
      technicalMessage: message,
      suggestions: [],
      context: {},
      timestamp: new Date(),
      errorId: this.generateErrorId(),
      retryable: false,
      ...details
    };

    this.name = 'ClassifiedError';
    this.logError();
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `ERR_${timestamp}_${random}`.toUpperCase();
  }

  /**
   * Log error with appropriate level based on severity
   */
  private logError(): void {
    const logData = {
      errorId: this.details.errorId,
      category: this.details.category,
      severity: this.details.severity,
      context: this.details.context
    };

    switch (this.details.severity) {
      case ErrorSeverity.CRITICAL:
        this.logger.error(this.details.technicalMessage, this, logData);
        break;
      case ErrorSeverity.HIGH:
        this.logger.error(this.details.technicalMessage, this, logData);
        break;
      case ErrorSeverity.MEDIUM:
        this.logger.warn(this.details.userMessage, logData);
        break;
      case ErrorSeverity.LOW:
        this.logger.debug(this.details.userMessage, logData);
        break;
    }
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    return this.details.userMessage;
  }

  /**
   * Get technical error message
   */
  getTechnicalMessage(): string {
    return this.details.technicalMessage;
  }

  /**
   * Get error suggestions
   */
  getSuggestions(): string[] {
    return [...this.details.suggestions];
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return this.details.retryable && 
           this.retryCount < (this.details.maxRetries || 3);
  }

  /**
   * Increment retry count
   */
  incrementRetryCount(): void {
    this.retryCount++;
  }

  /**
   * Get retry count
   */
  getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Get retry delay in milliseconds
   */
  getRetryDelay(): number {
    return this.details.retryDelay || (1000 * Math.pow(2, this.retryCount));
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
      retryCount: this.retryCount,
      stack: this.stack
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(data: any): ClassifiedError {
    const error = new ClassifiedError(data.message, data.details);
    error.retryCount = data.retryCount || 0;
    return error;
  }
}

/**
 * Error classification and recovery system
 */
export class ErrorClassificationSystem {
  private logger: Logger;
  private recoveryHandlers: Map<RecoveryStrategy, (error: ClassifiedError) => Promise<RecoveryResult>>;

  constructor() {
    this.logger = Logger.getInstance();
    this.recoveryHandlers = new Map();
    this.initializeRecoveryHandlers();
  }

  /**
   * Initialize default recovery handlers
   */
  private initializeRecoveryHandlers(): void {
    this.recoveryHandlers.set(RecoveryStrategy.RETRY, this.handleRetry.bind(this));
    this.recoveryHandlers.set(RecoveryStrategy.FALLBACK, this.handleFallback.bind(this));
    this.recoveryHandlers.set(RecoveryStrategy.SKIP, this.handleSkip.bind(this));
    this.recoveryHandlers.set(RecoveryStrategy.ABORT, this.handleAbort.bind(this));
  }

  /**
   * Classify error based on error type and context
   */
  classifyError(error: Error, context: Record<string, any> = {}): ClassifiedError {
    this.logger.debug('Classifying error', { error: error.message, context });

    // Analyze error message and type
    const classification = this.analyzeError(error, context);
    
    return new ClassifiedError(error.message, {
      ...classification,
      context,
      technicalMessage: error.stack || error.message
    });
  }

  /**
   * Analyze error to determine classification
   */
  private analyzeError(error: Error, context: Record<string, any>): Partial<ErrorDetails> {
    const message = error.message.toLowerCase();
    const errorType = error.constructor.name;

    // File system errors
    if (this.isFileSystemError(message, errorType)) {
      return this.classifyFileSystemError(message, context);
    }

    // Format errors
    if (this.isFormatError(message, errorType)) {
      return this.classifyFormatError(message, context);
    }

    // Validation errors
    if (this.isValidationError(message, errorType)) {
      return this.classifyValidationError(message, context);
    }

    // Permission errors
    if (this.isPermissionError(message, errorType)) {
      return this.classifyPermissionError(message, context);
    }

    // Resource errors
    if (this.isResourceError(message, errorType)) {
      return this.classifyResourceError(message, context);
    }

    // Network errors
    if (this.isNetworkError(message, errorType)) {
      return this.classifyNetworkError(message, context);
    }

    // Default classification
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.NONE,
      userMessage: 'An unexpected error occurred',
      suggestions: ['Please try again or contact support'],
      retryable: false
    };
  }

  /**
   * Check if error is file system related
   */
  private isFileSystemError(message: string, errorType: string): boolean {
    const fsKeywords = [
      'enoent', 'eacces', 'eexist', 'eisdir', 'enotdir',
      'file not found', 'directory not found', 'permission denied',
      'file exists', 'not a directory', 'is a directory'
    ];
    return fsKeywords.some(keyword => message.includes(keyword)) ||
           ['ENOENT', 'EACCES', 'EEXIST'].includes(errorType);
  }

  /**
   * Classify file system errors
   */
  private classifyFileSystemError(message: string, context: Record<string, any>): Partial<ErrorDetails> {
    if (message.includes('enoent') || message.includes('file not found')) {
      return {
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.USER_INPUT,
        userMessage: 'The specified file could not be found',
        suggestions: [
          'Check if the file path is correct',
          'Verify the file exists in the specified location',
          'Ensure you have permission to access the file'
        ],
        retryable: false
      };
    }

    if (message.includes('eacces') || message.includes('permission denied')) {
      return {
        category: ErrorCategory.PERMISSION,
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.USER_INPUT,
        userMessage: 'Permission denied accessing the file',
        suggestions: [
          'Check file permissions',
          'Run with appropriate privileges',
          'Ensure the file is not locked by another process'
        ],
        retryable: false
      };
    }

    if (message.includes('eexist') || message.includes('file exists')) {
      return {
        category: ErrorCategory.FILE_SYSTEM,
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.FALLBACK,
        userMessage: 'File already exists at the destination',
        suggestions: [
          'Choose a different output filename',
          'Enable overwrite option if intended',
          'Remove the existing file first'
        ],
        retryable: true,
        maxRetries: 1
      };
    }

    return {
      category: ErrorCategory.FILE_SYSTEM,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.RETRY,
      userMessage: 'File system operation failed',
      suggestions: ['Try the operation again', 'Check file system permissions'],
      retryable: true,
      maxRetries: 2
    };
  }

  /**
   * Check if error is format related
   */
  private isFormatError(message: string, errorType: string): boolean {
    const formatKeywords = [
      'parse', 'parsing', 'invalid format', 'malformed',
      'syntax error', 'unexpected token', 'invalid json',
      'invalid xml', 'invalid csv', 'corrupt'
    ];
    return formatKeywords.some(keyword => message.includes(keyword)) ||
           errorType.includes('SyntaxError');
  }

  /**
   * Classify format errors
   */
  private classifyFormatError(message: string, context: Record<string, any>): Partial<ErrorDetails> {
    if (message.includes('json') || message.includes('unexpected token')) {
      return {
        category: ErrorCategory.FORMAT,
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.FALLBACK,
        userMessage: 'Invalid JSON format detected',
        suggestions: [
          'Verify the JSON file is properly formatted',
          'Check for missing commas or brackets',
          'Use a JSON validator to identify syntax errors'
        ],
        retryable: false
      };
    }

    if (message.includes('xml') || message.includes('malformed')) {
      return {
        category: ErrorCategory.FORMAT,
        severity: ErrorSeverity.HIGH,
        recoveryStrategy: RecoveryStrategy.FALLBACK,
        userMessage: 'Invalid XML format detected',
        suggestions: [
          'Verify the XML file is well-formed',
          'Check for unclosed tags or invalid characters',
          'Validate against XML schema if available'
        ],
        retryable: false
      };
    }

    if (message.includes('csv') || message.includes('delimiter')) {
      return {
        category: ErrorCategory.FORMAT,
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.FALLBACK,
        userMessage: 'CSV format issue detected',
        suggestions: [
          'Check CSV delimiter settings',
          'Verify quote character usage',
          'Ensure consistent column count across rows'
        ],
        retryable: true,
        maxRetries: 2
      };
    }

    return {
      category: ErrorCategory.FORMAT,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategy.FALLBACK,
      userMessage: 'File format is invalid or corrupted',
      suggestions: [
        'Verify the file format matches the expected type',
        'Check if the file is corrupted',
        'Try opening the file in its native application'
      ],
      retryable: false
    };
  }

  /**
   * Check if error is validation related
   */
  private isValidationError(message: string, errorType: string): boolean {
    const validationKeywords = [
      'validation', 'invalid', 'required', 'missing',
      'constraint', 'schema', 'type mismatch'
    ];
    return validationKeywords.some(keyword => message.includes(keyword)) ||
           errorType.includes('ValidationError');
  }

  /**
   * Classify validation errors
   */
  private classifyValidationError(message: string, context: Record<string, any>): Partial<ErrorDetails> {
    return {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.USER_INPUT,
      userMessage: 'Data validation failed',
      suggestions: [
        'Check input data format and structure',
        'Verify required fields are present',
        'Ensure data types match expected schema'
      ],
      retryable: false
    };
  }

  /**
   * Check if error is permission related
   */
  private isPermissionError(message: string, errorType: string): boolean {
    const permissionKeywords = [
      'permission', 'access denied', 'unauthorized',
      'forbidden', 'not allowed'
    ];
    return permissionKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Classify permission errors
   */
  private classifyPermissionError(message: string, context: Record<string, any>): Partial<ErrorDetails> {
    return {
      category: ErrorCategory.PERMISSION,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategy.USER_INPUT,
      userMessage: 'Access permission denied',
      suggestions: [
        'Check file and directory permissions',
        'Run with appropriate user privileges',
        'Ensure the resource is not locked'
      ],
      retryable: false
    };
  }

  /**
   * Check if error is resource related
   */
  private isResourceError(message: string, errorType: string): boolean {
    const resourceKeywords = [
      'memory', 'disk space', 'quota', 'limit',
      'too large', 'insufficient', 'out of',
      'no space', 'space left'
    ];
    return resourceKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Classify resource errors
   */
  private classifyResourceError(message: string, context: Record<string, any>): Partial<ErrorDetails> {
    if (message.includes('memory') || message.includes('out of memory')) {
      return {
        category: ErrorCategory.RESOURCE,
        severity: ErrorSeverity.CRITICAL,
        recoveryStrategy: RecoveryStrategy.FALLBACK,
        userMessage: 'Insufficient memory to complete operation',
        suggestions: [
          'Try processing smaller files',
          'Close other applications to free memory',
          'Consider using streaming processing'
        ],
        retryable: true,
        maxRetries: 1
      };
    }

    if (message.includes('disk space') || message.includes('no space')) {
      return {
        category: ErrorCategory.RESOURCE,
        severity: ErrorSeverity.CRITICAL,
        recoveryStrategy: RecoveryStrategy.USER_INPUT,
        userMessage: 'Insufficient disk space',
        suggestions: [
          'Free up disk space',
          'Choose a different output location',
          'Remove temporary files'
        ],
        retryable: false
      };
    }

    return {
      category: ErrorCategory.RESOURCE,
      severity: ErrorSeverity.HIGH,
      recoveryStrategy: RecoveryStrategy.FALLBACK,
      userMessage: 'Resource limit exceeded',
      suggestions: [
        'Reduce file size or complexity',
        'Try again with fewer resources',
        'Contact administrator for resource limits'
      ],
      retryable: true,
      maxRetries: 1
    };
  }

  /**
   * Check if error is network related
   */
  private isNetworkError(message: string, errorType: string): boolean {
    const networkKeywords = [
      'network', 'connection', 'timeout', 'unreachable',
      'dns', 'socket', 'http', 'https'
    ];
    return networkKeywords.some(keyword => message.includes(keyword));
  }

  /**
   * Classify network errors
   */
  private classifyNetworkError(message: string, context: Record<string, any>): Partial<ErrorDetails> {
    return {
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.MEDIUM,
      recoveryStrategy: RecoveryStrategy.RETRY,
      userMessage: 'Network operation failed',
      suggestions: [
        'Check internet connection',
        'Verify network settings',
        'Try again in a few moments'
      ],
      retryable: true,
      maxRetries: 3,
      retryDelay: 2000
    };
  }

  /**
   * Attempt error recovery
   */
  async attemptRecovery(error: ClassifiedError): Promise<RecoveryResult> {
    this.logger.debug('Attempting error recovery', {
      errorId: error.details.errorId,
      strategy: error.details.recoveryStrategy
    });

    const handler = this.recoveryHandlers.get(error.details.recoveryStrategy);
    if (!handler) {
      return {
        success: false,
        action: 'no_handler',
        message: 'No recovery handler available for this error type'
      };
    }

    try {
      const result = await handler(error);
      this.logger.info('Recovery attempt completed', {
        errorId: error.details.errorId,
        success: result.success,
        action: result.action
      });
      return result;
    } catch (recoveryError) {
      this.logger.error('Recovery attempt failed', recoveryError as Error, {
        errorId: error.details.errorId
      });
      return {
        success: false,
        action: 'recovery_failed',
        message: `Recovery failed: ${(recoveryError as Error).message}`
      };
    }
  }

  /**
   * Handle retry recovery strategy
   */
  private async handleRetry(error: ClassifiedError): Promise<RecoveryResult> {
    if (!error.isRetryable()) {
      return {
        success: false,
        action: 'retry_exhausted',
        message: 'Maximum retry attempts reached'
      };
    }

    error.incrementRetryCount();
    const delay = error.getRetryDelay();

    return {
      success: true,
      action: 'retry_scheduled',
      message: `Retry scheduled in ${delay}ms (attempt ${error.getRetryCount()})`,
      data: { delay, retryCount: error.getRetryCount() }
    };
  }

  /**
   * Handle fallback recovery strategy
   */
  private async handleFallback(error: ClassifiedError): Promise<RecoveryResult> {
    return {
      success: true,
      action: 'fallback_suggested',
      message: 'Consider alternative approach or manual intervention',
      data: { suggestions: error.getSuggestions() }
    };
  }

  /**
   * Handle skip recovery strategy
   */
  private async handleSkip(error: ClassifiedError): Promise<RecoveryResult> {
    return {
      success: true,
      action: 'skip_recommended',
      message: 'Skip this operation and continue with remaining tasks'
    };
  }

  /**
   * Handle abort recovery strategy
   */
  private async handleAbort(error: ClassifiedError): Promise<RecoveryResult> {
    return {
      success: false,
      action: 'abort_required',
      message: 'Operation must be aborted due to critical error'
    };
  }

  /**
   * Register custom recovery handler
   */
  registerRecoveryHandler(
    strategy: RecoveryStrategy,
    handler: (error: ClassifiedError) => Promise<RecoveryResult>
  ): void {
    this.recoveryHandlers.set(strategy, handler);
    this.logger.debug('Custom recovery handler registered', { strategy });
  }

  /**
   * Get error statistics
   */
  getErrorStatistics(errors: ClassifiedError[]): {
    totalErrors: number;
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
    retryableErrors: number;
    averageRetryCount: number;
  } {
    const stats = {
      totalErrors: errors.length,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      retryableErrors: 0,
      averageRetryCount: 0
    };

    // Initialize counters
    Object.values(ErrorCategory).forEach(category => {
      stats.byCategory[category] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      stats.bySeverity[severity] = 0;
    });

    let totalRetries = 0;
    errors.forEach(error => {
      stats.byCategory[error.details.category]++;
      stats.bySeverity[error.details.severity]++;
      
      if (error.details.retryable) {
        stats.retryableErrors++;
      }
      
      totalRetries += error.getRetryCount();
    });

    stats.averageRetryCount = errors.length > 0 ? totalRetries / errors.length : 0;

    return stats;
  }
}