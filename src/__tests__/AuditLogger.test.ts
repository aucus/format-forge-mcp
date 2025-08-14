import { AuditLogger, AuditEventType } from '../core/AuditLogger.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditLogger = new AuditLogger({
      auditLogPath: '/logs/audit.log',
      metricsLogPath: '/logs/metrics.log',
      enableFileLogging: true
    });

    // Reset mocks
    jest.clearAllMocks();
    
    // Default mock implementations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation(() => '');
    mockFs.appendFileSync.mockImplementation(() => {});
    mockFs.statSync.mockReturnValue({
      size: 1024,
      mtime: new Date()
    } as any);
  });

  describe('logAuditEvent', () => {
    it('should log audit event successfully', async () => {
      await auditLogger.logAuditEvent({
        type: 'FILE_ACCESS',
        action: 'file_read',
        resource: '/path/to/file.csv',
        result: 'success',
        userId: 'user123',
        details: { fileSize: 1024 },
        severity: 'low'
      });

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        '/logs/audit.log',
        expect.stringContaining('"type":"FILE_ACCESS"')
      );
    });

    it('should handle security violations', async () => {
      await auditLogger.logAuditEvent({
        type: 'SECURITY_VIOLATION',
        action: 'unauthorized_access',
        result: 'failure',
        userId: 'user123',
        ipAddress: '192.168.1.100',
        details: { attemptedResource: '/admin/config' },
        severity: 'critical'
      });

      expect(mockFs.appendFileSync).toHaveBeenCalled();
    });

    it('should create log directory if it does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await auditLogger.logAuditEvent({
        type: 'FILE_ACCESS',
        action: 'file_read',
        result: 'success',
        details: {},
        severity: 'low'
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/logs', { recursive: true });
    });
  });

  describe('logPerformanceMetric', () => {
    it('should log performance metrics', async () => {
      await auditLogger.logPerformanceMetric({
        operation: 'file_conversion',
        duration: 5000,
        fileSize: 1024000,
        recordCount: 1000,
        throughput: 200
      });

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        '/logs/metrics.log',
        expect.stringContaining('"operation":"file_conversion"')
      );
    });

    it('should include memory and CPU usage', async () => {
      // Mock process.memoryUsage and process.cpuUsage
      const originalMemoryUsage = process.memoryUsage;
      const originalCpuUsage = process.cpuUsage;

      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 50000000,
        heapTotal: 100000000,
        external: 5000000,
        rss: 120000000,
        arrayBuffers: 1000000
      });

      jest.spyOn(process, 'cpuUsage').mockReturnValue({
        user: 1000000,
        system: 500000
      });

      await auditLogger.logPerformanceMetric({
        operation: 'test_operation',
        duration: 1000
      });

      const logCall = mockFs.appendFileSync.mock.calls[0];
      const logEntry = JSON.parse(logCall[1] as string);

      expect(logEntry.memoryUsage).toBeDefined();
      expect(logEntry.memoryUsage.heapUsed).toBe(50000000);
      expect(logEntry.cpuUsage).toBeDefined();

      // Restore original functions
      jest.restoreAllMocks();
    });
  });

  describe('logFileAccess', () => {
    it('should log file access events', async () => {
      await auditLogger.logFileAccess(
        'read',
        '/path/to/file.csv',
        'success',
        'user123',
        { fileSize: 1024 }
      );

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        '/logs/audit.log',
        expect.stringContaining('"action":"file_read"')
      );
    });

    it('should set appropriate severity for failures', async () => {
      await auditLogger.logFileAccess(
        'write',
        '/path/to/file.csv',
        'failure',
        'user123'
      );

      const logCall = mockFs.appendFileSync.mock.calls[0];
      const logEntry = JSON.parse(logCall[1] as string);

      expect(logEntry.severity).toBe('medium');
      expect(logEntry.result).toBe('failure');
    });
  });

  describe('logConversion', () => {
    it('should log conversion operations', async () => {
      await auditLogger.logConversion(
        '/input/file.csv',
        'json',
        'success',
        5000,
        'user123',
        {
          sourceFormat: 'csv',
          fileSize: 1024000,
          recordCount: 1000
        }
      );

      // Should log both audit event and performance metric
      expect(mockFs.appendFileSync).toHaveBeenCalledTimes(2);
      
      // Check audit log
      const auditCall = mockFs.appendFileSync.mock.calls.find(call => 
        call[0] === '/logs/audit.log'
      );
      expect(auditCall).toBeDefined();
      
      // Check metrics log
      const metricsCall = mockFs.appendFileSync.mock.calls.find(call => 
        call[0] === '/logs/metrics.log'
      );
      expect(metricsCall).toBeDefined();
    });
  });

  describe('logError', () => {
    it('should log error events', async () => {
      const error = ConversionError.fileNotFound('/path/to/file.csv');
      
      await auditLogger.logError(error, { operation: 'file_read' }, 'user123');

      const logCall = mockFs.appendFileSync.mock.calls[0];
      const logEntry = JSON.parse(logCall[1] as string);

      expect(logEntry.type).toBe('ERROR_OCCURRED');
      expect(logEntry.details.errorCode).toBe('FILE_NOT_FOUND');
      expect(logEntry.details.errorCategory).toBe('system');
      expect(logEntry.userId).toBe('user123');
    });

    it('should map error severity correctly', async () => {
      const criticalError = ConversionError.memoryError('Out of memory');
      
      await auditLogger.logError(criticalError);

      const logCall = mockFs.appendFileSync.mock.calls[0];
      const logEntry = JSON.parse(logCall[1] as string);

      expect(logEntry.severity).toBe('critical');
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security events with high severity', async () => {
      await auditLogger.logSecurityEvent(
        'unauthorized_access',
        'failure',
        { attemptedResource: '/admin' },
        'user123',
        '192.168.1.100'
      );

      const logCall = mockFs.appendFileSync.mock.calls[0];
      const logEntry = JSON.parse(logCall[1] as string);

      expect(logEntry.type).toBe('SECURITY_VIOLATION');
      expect(logEntry.severity).toBe('high');
      expect(logEntry.ipAddress).toBe('192.168.1.100');
    });
  });

  describe('log rotation', () => {
    it('should rotate log file when it exceeds max size', async () => {
      // Mock large file size
      mockFs.statSync.mockReturnValue({
        size: 200 * 1024 * 1024, // 200MB (exceeds default 100MB limit)
        mtime: new Date()
      } as any);

      mockFs.renameSync.mockImplementation(() => {});

      await auditLogger.logAuditEvent({
        type: 'FILE_ACCESS',
        action: 'test',
        result: 'success',
        details: {},
        severity: 'low'
      });

      expect(mockFs.renameSync).toHaveBeenCalled();
    });

    it('should not rotate log file when size is within limit', async () => {
      // Mock small file size
      mockFs.statSync.mockReturnValue({
        size: 1024, // 1KB (well within limit)
        mtime: new Date()
      } as any);

      mockFs.renameSync.mockImplementation(() => {});

      await auditLogger.logAuditEvent({
        type: 'FILE_ACCESS',
        action: 'test',
        result: 'success',
        details: {},
        severity: 'low'
      });

      expect(mockFs.renameSync).not.toHaveBeenCalled();
    });
  });

  describe('cleanupOldLogs', () => {
    it('should clean up old log files', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days old

      mockFs.readdirSync.mockReturnValue(['old-log.log', 'recent-log.log'] as any);
      mockFs.statSync.mockImplementation((filePath) => {
        const isOld = filePath.toString().includes('old-log');
        return {
          size: 1024,
          mtime: isOld ? oldDate : new Date()
        } as any;
      });

      mockFs.unlinkSync.mockImplementation(() => {});

      const result = await auditLogger.cleanupOldLogs();

      expect(result.deletedFiles).toBe(2); // Both audit and metrics directories
      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await auditLogger.cleanupOldLogs();

      expect(result.deletedFiles).toBe(0);
      expect(result.freedSpace).toBe(0);
    });
  });

  describe('getAuditTrail', () => {
    it('should return audit trail with filters', async () => {
      const trail = await auditLogger.getAuditTrail({
        userId: 'user123',
        type: 'FILE_ACCESS',
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        limit: 100
      });

      // Currently returns empty array as placeholder
      expect(Array.isArray(trail)).toBe(true);
    });
  });

  describe('getPerformanceStats', () => {
    it('should return performance statistics', async () => {
      const stats = await auditLogger.getPerformanceStats(
        'file_conversion',
        new Date('2023-01-01'),
        new Date('2023-12-31')
      );

      expect(stats).toHaveProperty('averageDuration');
      expect(stats).toHaveProperty('totalOperations');
      expect(stats).toHaveProperty('successRate');
      expect(stats).toHaveProperty('averageMemoryUsage');
      expect(stats).toHaveProperty('averageThroughput');
    });
  });

  describe('configuration options', () => {
    it('should disable file logging when configured', async () => {
      const noFileLogger = new AuditLogger({
        enableFileLogging: false
      });

      await noFileLogger.logAuditEvent({
        type: 'FILE_ACCESS',
        action: 'test',
        result: 'success',
        details: {},
        severity: 'low'
      });

      expect(mockFs.appendFileSync).not.toHaveBeenCalled();
    });

    it('should use custom retention period', async () => {
      const customLogger = new AuditLogger({
        retentionDays: 30
      });

      // Test that cleanup uses the custom retention period
      const result = await customLogger.cleanupOldLogs();
      expect(result).toBeDefined();
    });
  });
});