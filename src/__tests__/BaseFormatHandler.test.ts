import { BaseFormatHandler } from '../handlers/BaseFormatHandler.js';
import { DataStructure, SupportedFormat, ReadOptions, WriteOptions } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  constants: { R_OK: 4, W_OK: 2, F_OK: 0 },
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn()
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

// Test implementation of BaseFormatHandler
class TestFormatHandler extends BaseFormatHandler {
  constructor() {
    super(['csv'], ['.csv']);
  }

  async read(filePath: string, options?: ReadOptions): Promise<DataStructure> {
    const content = await this.readFileContent(filePath, options?.encoding);
    const rows = [{ name: 'test', value: 'data' }];
    return this.createDataStructure(rows, 'csv', options?.encoding || 'utf-8');
  }

  async write(data: DataStructure, filePath: string, options?: WriteOptions): Promise<void> {
    const content = JSON.stringify(data.rows);
    await this.writeFileContent(filePath, content, options?.encoding);
  }
}

describe('BaseFormatHandler', () => {
  let handler: TestFormatHandler;

  beforeEach(() => {
    handler = new TestFormatHandler();
    jest.clearAllMocks();
  });

  describe('constructor and basic methods', () => {
    it('should initialize with supported formats and extensions', () => {
      expect(handler.canHandle('csv')).toBe(true);
      expect(handler.canHandle('json')).toBe(false);
      expect(handler.getSupportedExtensions()).toEqual(['.csv']);
    });
  });

  describe('validate', () => {
    it('should validate correct data structure', () => {
      const data: DataStructure = {
        rows: [{ name: 'John', age: 30 }],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid data structure', () => {
      const data = {
        rows: 'not an array',
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      } as any;

      const result = handler.validate(data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_ROWS',
          message: 'Data rows must be an array'
        })
      );
    });

    it('should detect missing metadata', () => {
      const data = {
        rows: [{ name: 'John' }]
      } as any;

      const result = handler.validate(data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_METADATA',
          message: 'Data metadata is required'
        })
      );
    });

    it('should detect invalid metadata fields', () => {
      const data: DataStructure = {
        rows: [{ name: 'John' }],
        metadata: {
          originalFormat: '' as any,
          encoding: '',
          totalRows: -1,
          totalColumns: 'invalid' as any
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('file operations', () => {
    describe('readFileContent', () => {
      it('should read file content successfully', async () => {
        const content = 'test file content';
        mockFs.promises.access.mockResolvedValue(undefined);
        mockFs.promises.readFile.mockResolvedValue(content);

        const result = await (handler as any).readFileContent('/path/to/file.txt');
        
        expect(result).toBe(content);
        expect(mockFs.promises.access).toHaveBeenCalledWith('/path/to/file.txt');
        expect(mockFs.promises.readFile).toHaveBeenCalledWith('/path/to/file.txt', { encoding: 'utf8' });
      });

      it('should handle file not found error', async () => {
        const error = new Error('File not found') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockFs.promises.readFile.mockRejectedValue(error);

        await expect((handler as any).readFileContent('/path/to/nonexistent.txt'))
          .rejects.toThrow(ConversionError);
      });

      it('should handle permission denied error', async () => {
        const error = new Error('Permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        mockFs.promises.readFile.mockRejectedValue(error);

        await expect((handler as any).readFileContent('/path/to/file.txt'))
          .rejects.toThrow(ConversionError);
      });
    });

    describe('writeFileContent', () => {
      it('should write file content successfully', async () => {
        mockFs.promises.mkdir.mockResolvedValue(undefined);
        mockFs.promises.writeFile.mockResolvedValue(undefined);

        await (handler as any).writeFileContent('/path/to/file.txt', 'content');
        
        expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/path/to', { recursive: true });
        expect(mockFs.promises.writeFile).toHaveBeenCalledWith('/path/to/file.txt', 'content', { encoding: 'utf8' });
      });

      it('should handle permission denied error', async () => {
        const error = new Error('Permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        mockFs.promises.mkdir.mockResolvedValue(undefined);
        mockFs.promises.writeFile.mockRejectedValue(error);

        await expect((handler as any).writeFileContent('/path/to/file.txt', 'content'))
          .rejects.toThrow(ConversionError);
      });

      it('should handle disk space error', async () => {
        const error = new Error('No space left') as NodeJS.ErrnoException;
        error.code = 'ENOSPC';
        mockFs.promises.mkdir.mockResolvedValue(undefined);
        mockFs.promises.writeFile.mockRejectedValue(error);

        await expect((handler as any).writeFileContent('/path/to/file.txt', 'content'))
          .rejects.toThrow(ConversionError);
      });
    });

    describe('validateFileAccess', () => {
      it('should validate file access successfully', async () => {
        mockFs.promises.access.mockResolvedValue(undefined);

        await expect((handler as any).validateFileAccess('/path/to/file.txt'))
          .resolves.toBeUndefined();
        
        expect(mockFs.promises.access).toHaveBeenCalledWith('/path/to/file.txt', fs.constants.R_OK);
      });

      it('should handle file not found', async () => {
        const error = new Error('File not found') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockFs.promises.access.mockRejectedValue(error);

        await expect((handler as any).validateFileAccess('/path/to/file.txt'))
          .rejects.toThrow(ConversionError);
      });

      it('should handle permission denied', async () => {
        const error = new Error('Permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        mockFs.promises.access.mockRejectedValue(error);

        await expect((handler as any).validateFileAccess('/path/to/file.txt'))
          .rejects.toThrow(ConversionError);
      });
    });

    describe('ensureDirectoryExists', () => {
      it('should create directory successfully', async () => {
        mockFs.promises.mkdir.mockResolvedValue(undefined);

        await expect((handler as any).ensureDirectoryExists('/path/to/dir'))
          .resolves.toBeUndefined();
        
        expect(mockFs.promises.mkdir).toHaveBeenCalledWith('/path/to/dir', { recursive: true });
      });

      it('should handle existing directory', async () => {
        const error = new Error('Directory exists') as NodeJS.ErrnoException;
        error.code = 'EEXIST';
        mockFs.promises.mkdir.mockRejectedValue(error);

        await expect((handler as any).ensureDirectoryExists('/path/to/dir'))
          .resolves.toBeUndefined();
      });

      it('should handle mkdir failure', async () => {
        const error = new Error('Permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        mockFs.promises.mkdir.mockRejectedValue(error);

        await expect((handler as any).ensureDirectoryExists('/path/to/dir'))
          .rejects.toThrow(ConversionError);
      });
    });

    describe('getFileStats', () => {
      it('should get file stats successfully', async () => {
        const stats = { size: 1024, isFile: () => true } as fs.Stats;
        mockFs.promises.stat.mockResolvedValue(stats);

        const result = await (handler as any).getFileStats('/path/to/file.txt');
        
        expect(result).toBe(stats);
        expect(mockFs.promises.stat).toHaveBeenCalledWith('/path/to/file.txt');
      });

      it('should handle file not found', async () => {
        const error = new Error('File not found') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockFs.promises.stat.mockRejectedValue(error);

        await expect((handler as any).getFileStats('/path/to/file.txt'))
          .rejects.toThrow(ConversionError);
      });
    });
  });

  describe('utility methods', () => {
    describe('createDataStructure', () => {
      it('should create valid data structure', () => {
        const rows = [{ name: 'John', age: 30 }];
        const result = (handler as any).createDataStructure(rows, 'csv', 'utf-8', ['name', 'age']);

        expect(result.rows).toEqual(rows);
        expect(result.headers).toEqual(['name', 'age']);
        expect(result.metadata.originalFormat).toBe('csv');
        expect(result.metadata.encoding).toBe('utf-8');
      });

      it('should throw error for invalid data structure', () => {
        const rows = null as any;
        
        expect(() => (handler as any).createDataStructure(rows, 'csv'))
          .toThrow(ConversionError);
      });
    });

    describe('parseReadOptions', () => {
      it('should parse options with defaults', () => {
        const result = (handler as any).parseReadOptions();
        
        expect(result).toEqual({
          encoding: 'utf-8',
          sheetName: undefined,
          sheetIndex: 0,
          range: undefined
        });
      });

      it('should parse custom options', () => {
        const options: ReadOptions = {
          encoding: 'latin1',
          sheetName: 'Sheet1',
          sheetIndex: 1,
          range: 'A1:C10'
        };
        
        const result = (handler as any).parseReadOptions(options);
        expect(result).toEqual(options);
      });
    });

    describe('parseWriteOptions', () => {
      it('should parse options with defaults', () => {
        const result = (handler as any).parseWriteOptions();
        
        expect(result).toEqual({
          encoding: 'utf-8',
          formatting: {},
          overwrite: true
        });
      });

      it('should parse custom options', () => {
        const options: WriteOptions = {
          encoding: 'utf-16',
          formatting: { bold: true },
          overwrite: false
        };
        
        const result = (handler as any).parseWriteOptions(options);
        expect(result).toEqual(options);
      });
    });

    describe('checkOverwrite', () => {
      it('should allow overwrite when enabled', async () => {
        mockFs.promises.access.mockResolvedValue(undefined); // File exists

        await expect((handler as any).checkOverwrite('/path/to/file.txt', true))
          .resolves.toBeUndefined();
      });

      it('should prevent overwrite when disabled and file exists', async () => {
        mockFs.promises.access.mockResolvedValue(undefined); // File exists

        await expect((handler as any).checkOverwrite('/path/to/file.txt', false))
          .rejects.toThrow(ConversionError);
      });

      it('should allow write when file does not exist', async () => {
        const error = new Error('File not found') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockFs.promises.access.mockRejectedValue(error);

        await expect((handler as any).checkOverwrite('/path/to/file.txt', false))
          .resolves.toBeUndefined();
      });
    });
  });

  describe('error handling', () => {
    it('should handle ConversionError passthrough', () => {
      const originalError = ConversionError.fileNotFound('/path/to/file.txt');
      
      expect(() => (handler as any).handleError(originalError, 'read', '/path/to/file.txt'))
        .toThrow(originalError);
    });

    it('should convert Node.js errors to ConversionError', () => {
      const nodeError = new Error('Generic error') as NodeJS.ErrnoException;
      nodeError.code = 'ENOENT';
      
      expect(() => (handler as any).handleError(nodeError, 'read', '/path/to/file.txt'))
        .toThrow(ConversionError);
    });

    it('should handle unknown errors', () => {
      const unknownError = new Error('Unknown error');
      
      expect(() => (handler as any).handleError(unknownError, 'read', '/path/to/file.txt'))
        .toThrow(ConversionError);
    });
  });

  describe('integration with concrete implementation', () => {
    beforeEach(() => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.readFile.mockResolvedValue('test,data\nvalue1,value2');
      mockFs.promises.mkdir.mockResolvedValue(undefined);
      mockFs.promises.writeFile.mockResolvedValue(undefined);
    });

    it('should read file successfully', async () => {
      const result = await handler.read('/path/to/file.csv');
      
      expect(result.rows).toEqual([{ name: 'test', value: 'data' }]);
      expect(result.metadata.originalFormat).toBe('csv');
    });

    it('should write file successfully', async () => {
      const data: DataStructure = {
        rows: [{ name: 'John', age: 30 }],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      await handler.write(data, '/path/to/output.csv');
      
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });
  });
});