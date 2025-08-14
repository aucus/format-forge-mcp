import { Logger, LogLevel } from './Logger.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Audit event types
 */
export type AuditEventType = 
  | 'FILE_ACCESS'
  | 'FILE_CONVERSION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'CONFIGURATION_CHANGE'
  | 'ERROR_OCCURRED'
  | 'PERFORMANCE_METRIC'
  | 'SECURITY_VIOLATION'
  | 'DATA_EXPORT'
  | 'SYSTEM_START'
  | 'SYSTEM_STOP';

/**
 * Audit event interface
 */
export interface AuditEvent {
  id: string;
  timestamp: Date;
  type: AuditEventType;
  userId?: string;
  sessionId?: string;
  action: string;
  resource?: string;
  details: Record<string, any>;
  result: 'success' | 'failure' | 'warning';
  duration?: number;
  ipAddress?: string;
  userAgent?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Performance metrics interface
 */
export interface PerformanceMetric {
  id: string;
  timestamp: Date;
  operation: string;
  duration: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpuUsage?: {
    user: number;
    system: number;
  };
  fileSize?: number;
  recordCount?: number;
  throughput?: number;
  details?: Record<string, any>;
}

/**
 * Enhanced audit logging system
 */
export class AuditLogger {
  private logger: Logger;
  private auditLogPath?: string;
  private metricsLogPath?: string;
  private retentionDays: number;
  private maxLogSize: number;
  private enableFileLogging: boolean;

  constructor(options: {
    auditLogPath?: string;
    metricsLogPath?: string;
    retentionDays?: number;
    maxLogSize?: number;
    enableFileLogging?: boolean;
  } = {}) {
    this.logger = Logger.getInstance();
    this.auditLogPath = options.auditLogPath;
    this.metricsLogPath = options.metricsLogPath;
    this.retentionDays = options.retentionDays || 90;
    this.maxLogSize = options.maxLogSize || 100 * 1024 * 1024; // 100MB
    this.enableFileLogging = options.enableFileLogging !== false;
  }

  /**
   * Log an audit event
   */
  async logAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...event
    };

    // Log to console via Logger
    this.logger.info(`AUDIT: ${event.action}`, {
      eventId: auditEvent.id,
      type: event.type,
      resource: event.resource,
      result: event.result,
      userId: event.userId,
      duration: event.duration
    });

    // Log to file if enabled
    if (this.enableFileLogging && this.auditLogPath) {
      await this.writeAuditToFile(auditEvent);
    }

    // Handle security violations
    if (event.type === 'SECURITY_VIOLATION' || event.severity === 'critical') {
      await this.handleSecurityEvent(auditEvent);
    }
  }

  /**
   * Log performance metrics
   */
  async logPerformanceMetric(metric: Omit<PerformanceMetric, 'id' | 'timestamp' | 'memoryUsage'>): Promise<void> {
    const performanceMetric: PerformanceMetric = {
      id: this.generateEventId(),
      timestamp: new Date(),
      memoryUsage: this.getMemoryUsage(),
      cpuUsage: this.getCpuUsage(),
      ...metric
    };

    // Log performance summary
    this.logger.debug(`PERFORMANCE: ${metric.operation}`, {
      duration: metric.duration,
      memoryMB: Math.round(performanceMetric.memoryUsage.heapUsed / 1024 / 1024),
      fileSize: metric.fileSize,
      recordCount: metric.recordCount,
      throughput: metric.throughput
    });

    // Log to file if enabled
    if (this.enableFileLogging && this.metricsLogPath) {
      await this.writeMetricToFile(performanceMetric);
    }

    // Alert on performance issues
    await this.checkPerformanceThresholds(performanceMetric);
  }

  /**
   * Log file access event
   */
  async logFileAccess(
    action: 'read' | 'write' | 'delete' | 'create',
    filePath: string,
    result: 'success' | 'failure',
    userId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAuditEvent({
      type: 'FILE_ACCESS',
      action: `file_${action}`,
      resource: filePath,
      result,
      userId,
      details: details || {},
      severity: result === 'failure' ? 'medium' : 'low'
    });
  }

  /**
   * Log conversion operation
   */
  async logConversion(
    sourcePath: string,
    targetFormat: string,
    result: 'success' | 'failure',
    duration: number,
    userId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.logAuditEvent({
      type: 'FILE_CONVERSION',
      action: 'convert_file',
      resource: sourcePath,
      result,
      duration,
      userId,
      details: {
        targetFormat,
        ...details
      },
      severity: result === 'failure' ? 'medium' : 'low'
    });

    // Also log performance metric
    await this.logPerformanceMetric({
      operation: 'file_conversion',
      duration,
      fileSize: details?.fileSize,
      recordCount: details?.recordCount,
      details: {
        sourceFormat: details?.sourceFormat,
        targetFormat,
        transformations: details?.transformations
      }
    });
  }

  /**
   * Log error event
   */
  async logError(
    error: ConversionError,
    context?: Record<string, any>,
    userId?: string
  ): Promise<void> {
    await this.logAuditEvent({
      type: 'ERROR_OCCURRED',
      action: 'error',
      result: 'failure',
      userId,
      details: {
        errorCode: error.code,
        errorMessage: error.message,
        errorCategory: error.category,
        errorSeverity: error.severity,
        recoverable: error.recoverable,
        context,
        stack: error.stack
      },
      severity: this.mapErrorSeverity(error.severity)
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    action: string,
    result: 'success' | 'failure',
    details: Record<string, any>,
    userId?: string,
    ipAddress?: string
  ): Promise<void> {
    await this.logAuditEvent({
      type: 'SECURITY_VIOLATION',
      action,
      result,
      userId,
      ipAddress,
      details,
      severity: 'high'
    });
  }

  /**
   * Get audit trail for a specific resource or user
   */
  async getAuditTrail(filters: {
    userId?: string;
    resource?: string;
    type?: AuditEventType;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditEvent[]> {
    // This would typically query a database or search log files
    // For now, return empty array as placeholder
    this.logger.debug('Retrieving audit trail', filters);
    return [];
  }

  /**
   * Get performance statistics
   */
  async getPerformanceStats(
    operation?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    averageDuration: number;
    totalOperations: number;
    successRate: number;
    averageMemoryUsage: number;
    averageThroughput?: number;
  }> {
    // This would typically aggregate metrics from logs or database
    // For now, return placeholder data
    this.logger.debug('Retrieving performance statistics', { operation, startDate, endDate });
    
    return {
      averageDuration: 0,
      totalOperations: 0,
      successRate: 0,
      averageMemoryUsage: 0,
      averageThroughput: 0
    };
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs(): Promise<{ deletedFiles: number; freedSpace: number }> {
    let deletedFiles = 0;
    let freedSpace = 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      // Clean up audit logs
      if (this.auditLogPath) {
        const auditResult = await this.cleanupLogDirectory(this.auditLogPath, cutoffDate);
        deletedFiles += auditResult.deletedFiles;
        freedSpace += auditResult.freedSpace;
      }

      // Clean up metrics logs
      if (this.metricsLogPath) {
        const metricsResult = await this.cleanupLogDirectory(this.metricsLogPath, cutoffDate);
        deletedFiles += metricsResult.deletedFiles;
        freedSpace += metricsResult.freedSpace;
      }

      this.logger.info('Log cleanup completed', { deletedFiles, freedSpace });

    } catch (error) {
      this.logger.error('Log cleanup failed', error as Error);
    }

    return { deletedFiles, freedSpace };
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Write audit event to file
   */
  private async writeAuditToFile(event: AuditEvent): Promise<void> {
    if (!this.auditLogPath) return;

    try {
      const logEntry = JSON.stringify(event) + '\n';
      
      // Ensure directory exists
      const logDir = path.dirname(this.auditLogPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Check file size and rotate if necessary
      await this.rotateLogIfNeeded(this.auditLogPath);

      // Append to log file
      fs.appendFileSync(this.auditLogPath, logEntry);

    } catch (error) {
      this.logger.error('Failed to write audit log', error as Error);
    }
  }

  /**
   * Write performance metric to file
   */
  private async writeMetricToFile(metric: PerformanceMetric): Promise<void> {
    if (!this.metricsLogPath) return;

    try {
      const logEntry = JSON.stringify(metric) + '\n';
      
      // Ensure directory exists
      const logDir = path.dirname(this.metricsLogPath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Check file size and rotate if necessary
      await this.rotateLogIfNeeded(this.metricsLogPath);

      // Append to log file
      fs.appendFileSync(this.metricsLogPath, logEntry);

    } catch (error) {
      this.logger.error('Failed to write metrics log', error as Error);
    }
  }

  /**
   * Rotate log file if it exceeds max size
   */
  private async rotateLogIfNeeded(logPath: string): Promise<void> {
    try {
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        if (stats.size > this.maxLogSize) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedPath = `${logPath}.${timestamp}`;
          fs.renameSync(logPath, rotatedPath);
          this.logger.info('Log file rotated', { originalPath: logPath, rotatedPath });
        }
      }
    } catch (error) {
      this.logger.error('Failed to rotate log file', error as Error, { logPath });
    }
  }

  /**
   * Handle security events
   */
  private async handleSecurityEvent(event: AuditEvent): Promise<void> {
    // Log security event with high priority
    this.logger.warn(`SECURITY: ${event.action}`, {
      eventId: event.id,
      userId: event.userId,
      ipAddress: event.ipAddress,
      details: event.details
    });

    // Additional security handling could include:
    // - Sending alerts
    // - Blocking IP addresses
    // - Notifying administrators
    // - Triggering incident response
  }

  /**
   * Check performance thresholds and alert if exceeded
   */
  private async checkPerformanceThresholds(metric: PerformanceMetric): Promise<void> {
    const thresholds = {
      maxDuration: 30000, // 30 seconds
      maxMemoryMB: 500,   // 500 MB
      minThroughput: 100  // records per second
    };

    const memoryMB = metric.memoryUsage.heapUsed / 1024 / 1024;
    const warnings: string[] = [];

    if (metric.duration > thresholds.maxDuration) {
      warnings.push(`Operation duration (${metric.duration}ms) exceeded threshold (${thresholds.maxDuration}ms)`);
    }

    if (memoryMB > thresholds.maxMemoryMB) {
      warnings.push(`Memory usage (${Math.round(memoryMB)}MB) exceeded threshold (${thresholds.maxMemoryMB}MB)`);
    }

    if (metric.throughput && metric.throughput < thresholds.minThroughput) {
      warnings.push(`Throughput (${metric.throughput} rec/s) below threshold (${thresholds.minThroughput} rec/s)`);
    }

    if (warnings.length > 0) {
      this.logger.warn('Performance threshold exceeded', {
        operation: metric.operation,
        warnings,
        metrics: {
          duration: metric.duration,
          memoryMB: Math.round(memoryMB),
          throughput: metric.throughput
        }
      });
    }
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): PerformanceMetric['memoryUsage'] {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss
    };
  }

  /**
   * Get current CPU usage
   */
  private getCpuUsage(): PerformanceMetric['cpuUsage'] {
    const usage = process.cpuUsage();
    return {
      user: usage.user,
      system: usage.system
    };
  }

  /**
   * Map error severity to audit severity
   */
  private mapErrorSeverity(errorSeverity: string): AuditEvent['severity'] {
    switch (errorSeverity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  /**
   * Clean up log directory
   */
  private async cleanupLogDirectory(
    logDir: string, 
    cutoffDate: Date
  ): Promise<{ deletedFiles: number; freedSpace: number }> {
    let deletedFiles = 0;
    let freedSpace = 0;

    try {
      if (!fs.existsSync(logDir)) {
        return { deletedFiles, freedSpace };
      }

      const files = fs.readdirSync(logDir);
      
      for (const file of files) {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          freedSpace += stats.size;
          fs.unlinkSync(filePath);
          deletedFiles++;
        }
      }

    } catch (error) {
      this.logger.error('Failed to clean up log directory', error as Error, { logDir });
    }

    return { deletedFiles, freedSpace };
  }
}