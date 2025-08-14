import { Logger, LogLevel } from '../core/Logger.js';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = Logger.getInstance();
    logger.clearLogs();
    logger.setLevel(LogLevel.DEBUG);
  });

  afterEach(() => {
    logger.clearLogs();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      expect(logger1).toBe(logger2);
    });
  });

  describe('logging methods', () => {
    beforeEach(() => {
      jest.spyOn(console, 'debug').mockImplementation();
      jest.spyOn(console, 'info').mockImplementation();
      jest.spyOn(console, 'warn').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should log debug messages', () => {
      logger.debug('Debug message', { context: 'test' });
      
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.DEBUG);
      expect(logs[0].message).toBe('Debug message');
      expect(logs[0].context).toEqual({ context: 'test' });
    });

    it('should log info messages', () => {
      logger.info('Info message');
      
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.INFO);
      expect(logs[0].message).toBe('Info message');
    });

    it('should log warning messages', () => {
      logger.warn('Warning message');
      
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.WARN);
      expect(logs[0].message).toBe('Warning message');
    });

    it('should log error messages', () => {
      const error = new Error('Test error');
      logger.error('Error message', error, { context: 'test' });
      
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe(LogLevel.ERROR);
      expect(logs[0].message).toBe('Error message');
      expect(logs[0].error).toBe(error);
      expect(logs[0].context).toEqual({ context: 'test' });
    });
  });

  describe('log level filtering', () => {
    beforeEach(() => {
      jest.spyOn(console, 'debug').mockImplementation();
      jest.spyOn(console, 'info').mockImplementation();
      jest.spyOn(console, 'warn').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should filter logs based on level', () => {
      logger.setLevel(LogLevel.WARN);
      
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      
      const logs = logger.getLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].level).toBe(LogLevel.WARN);
      expect(logs[1].level).toBe(LogLevel.ERROR);
    });
  });

  describe('log management', () => {
    it('should limit number of logs', () => {
      logger.setMaxLogs(3);
      
      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3');
      logger.info('Message 4');
      logger.info('Message 5');
      
      const logs = logger.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Message 3');
      expect(logs[1].message).toBe('Message 4');
      expect(logs[2].message).toBe('Message 5');
    });

    it('should get logs by count', () => {
      logger.info('Message 1');
      logger.info('Message 2');
      logger.info('Message 3');
      
      const recentLogs = logger.getLogs(2);
      expect(recentLogs).toHaveLength(2);
      expect(recentLogs[0].message).toBe('Message 2');
      expect(recentLogs[1].message).toBe('Message 3');
    });

    it('should get logs by level', () => {
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      
      const errorLogs = logger.getLogsByLevel(LogLevel.ERROR);
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].message).toBe('Error message');
    });

    it('should clear all logs', () => {
      logger.info('Message 1');
      logger.info('Message 2');
      
      expect(logger.getLogs()).toHaveLength(2);
      
      logger.clearLogs();
      expect(logger.getLogs()).toHaveLength(0);
    });
  });
});