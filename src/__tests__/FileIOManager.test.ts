import { FileIOManager } from '../utils/FileIOManager.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('FileIOManager', () => {
  let fileManager: FileIOManager;
  let tempDir: string;

  beforeEach(() => {
    fileManager = new FileIOManager();
    tempDir = '/tmp/test';
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Default mock implementations
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({
      isFile: () => true,
      isDirectory: () => false,
      size: 1024,
      birthtime: new Date('2023-01-01'),
      mtime: new Date('2023-01-02')
    } as any);
    mockFs.accessSync.mockImplementation(() => {});
  });

  describe('validateFilePath', () => {
    it('should validate safe file paths', () => {
      const result = fileManager.validateFilePath('/safe/path/file.txt');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.normalizedPath).toBe(path.normalize('/safe/path/file.txt'));
    });

    it('should reject empty or invalid paths', () => {
      const result1 = fileManager.validateFilePath('');
      const result2 = fileManager.validateFilePath(null as any);
      
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('File path must be a non-empty string');
      
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('File path must be a non-empty string');
    });

    it('should reject paths with forbidden patterns', () => {
      const testCases = [
        { path: '../../../etc/passwd', pattern: 'path traversal' },
        { path: '~/secret/file', pattern: 'home directory' },
        { path: 'file${USER}.txt', pattern: 'variable expansion' },
        { path: 'file%USER%.txt', pattern: 'environment variables' },
        { path: 'file<script>.txt', pattern: 'invalid characters' },
        { path: 'CON.txt', pattern: 'reserved name' },
        { path: 'PRN.txt', pattern: 'reserved name' }
      ];

      testCases.forEach(testCase => {
        const result = fileManager.validateFilePath(testCase.path);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });
    });

    it('should reject paths that are too long', () => {
      const longPath = 'a'.repeat(300);
      const result = fileManager.validateFilePath(longPath);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File path exceeds maximum length of 260 characters');
    });

    it('should reject paths with null bytes', () => {
      const result = fileManager.validateFilePath('file\0.txt');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File path contains null bytes');
    });

    it('should check file existence when mustExist is true', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const result = fileManager.validateFilePath('/nonexistent/file.txt', { mustExist: true });
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File does not exist: /nonexistent/file.txt');
    });

    it('should check directory depth when maxDepth is specified', () => {
      const result = fileManager.validateFilePath('/a/b/c/d/e/file.txt', { maxDepth: 3 });
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File path depth exceeds maximum of 3');
    });
  });

  describe('ensureDirectory', () => {
    it('should create directory when it does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => '');

      await fileManager.ensureDirectory('/new/directory');

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        path.normalize('/new/directory'),
        { recursive: true, mode: 0o755 }
      );
    });

    it('should not create directory when it already exists', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true
      } as any);

      await fileManager.ensureDirectory('/existing/directory');

      expect(mockFs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should throw error if path exists but is not a directory', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => false
      } as any);

      await expect(fileManager.ensureDirectory('/existing/file'))
        .rejects.toThrow('Path exists but is not a directory');
    });

    it('should throw error for invalid directory path', async () => {
      await expect(fileManager.ensureDirectory('../invalid/path'))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('checkPermissions', () => {
    it('should return true when all permissions are available', () => {
      mockFs.accessSync.mockImplementation(() => {});

      const result = fileManager.checkPermissions('/test/file.txt', {
        read: true,
        write: true,
        execute: true
      });

      expect(result.hasPermissions).toBe(true);
      expect(result.missingPermissions).toHaveLength(0);
    });

    it('should return false and list missing permissions', () => {
      mockFs.accessSync.mockImplementation((path, mode) => {
        if (mode === fs.constants.W_OK) {
          throw new Error('Permission denied');
        }
      });

      const result = fileManager.checkPermissions('/test/file.txt', {
        read: true,
        write: true
      });

      expect(result.hasPermissions).toBe(false);
      expect(result.missingPermissions).toContain('write');
      expect(result.missingPermissions).not.toContain('read');
    });
  }); 
 describe('generateOutputPath', () => {
    it('should generate basic output path', () => {
      const result = fileManager.generateOutputPath('/input/file.csv', 'json');
      
      expect(result).toBe(path.normalize('/input/file_converted.json'));
    });

    it('should preserve original name when requested', () => {
      const result = fileManager.generateOutputPath('/input/file.csv', 'json', undefined, {
        preserveName: true
      });
      
      expect(result).toBe(path.normalize('/input/file.json'));
    });

    it('should add timestamp when requested', () => {
      const result = fileManager.generateOutputPath('/input/file.csv', 'json', undefined, {
        addTimestamp: true
      });
      
      expect(result).toMatch(/\/input\/file_converted_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/);
    });

    it('should use custom output directory', () => {
      const result = fileManager.generateOutputPath('/input/file.csv', 'json', '/output');
      
      expect(result).toBe(path.normalize('/output/file_converted.json'));
    });

    it('should handle file collisions', () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path.toString().includes('file_converted.json') && 
               !path.toString().includes('file_converted_1.json');
      });

      const result = fileManager.generateOutputPath('/input/file.csv', 'json', undefined, {
        handleCollisions: true
      });
      
      expect(result).toBe(path.normalize('/input/file_converted_1.json'));
    });

    it('should throw error for too many collisions', () => {
      mockFs.existsSync.mockReturnValue(true);

      expect(() => fileManager.generateOutputPath('/input/file.csv', 'json', undefined, {
        handleCollisions: true
      })).toThrow('Too many file collisions');
    });
  });

  describe('copyFile', () => {
    it('should copy file successfully', async () => {
      mockFs.existsSync.mockImplementation((path) => {
        return path.toString().includes('/source/'); // Only source exists
      });
      mockFs.copyFileSync.mockImplementation(() => {});
      mockFs.mkdirSync.mockImplementation(() => '');

      await fileManager.copyFile('/source/file.txt', '/target/file.txt');

      expect(mockFs.copyFileSync).toHaveBeenCalledWith(
        path.normalize('/source/file.txt'),
        path.normalize('/target/file.txt')
      );
    });

    it('should preserve timestamps when requested', async () => {
      const mockStats = {
        atime: new Date('2023-01-01'),
        mtime: new Date('2023-01-02')
      };
      
      mockFs.existsSync.mockImplementation((path) => {
        return path.toString().includes('/source/'); // Only source exists
      });
      mockFs.copyFileSync.mockImplementation(() => {});
      mockFs.mkdirSync.mockImplementation(() => '');
      mockFs.statSync.mockReturnValue(mockStats as any);
      mockFs.utimesSync.mockImplementation(() => {});

      await fileManager.copyFile('/source/file.txt', '/target/file.txt', {
        preserveTimestamps: true
      });

      expect(mockFs.utimesSync).toHaveBeenCalledWith(
        path.normalize('/target/file.txt'),
        mockStats.atime,
        mockStats.mtime
      );
    });

    it('should throw error if target exists and overwrite is false', async () => {
      mockFs.existsSync.mockImplementation((path) => {
        return true; // Both source and target exist
      });

      await expect(fileManager.copyFile('/source/file.txt', '/target/file.txt'))
        .rejects.toThrow('Target file already exists');
    });

    it('should validate source and target paths', async () => {
      await expect(fileManager.copyFile('../invalid/source.txt', '/target/file.txt'))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      mockFs.unlinkSync.mockImplementation(() => {});

      await fileManager.deleteFile('/test/file.txt');

      expect(mockFs.unlinkSync).toHaveBeenCalledWith(path.normalize('/test/file.txt'));
    });

    it('should create backup when requested', async () => {
      mockFs.existsSync.mockImplementation((path) => {
        return !path.toString().includes('.backup.'); // Original exists, backup doesn't
      });
      mockFs.copyFileSync.mockImplementation(() => {});
      mockFs.unlinkSync.mockImplementation(() => {});
      mockFs.mkdirSync.mockImplementation(() => '');

      await fileManager.deleteFile('/test/file.txt', { backup: true });

      expect(mockFs.copyFileSync).toHaveBeenCalled();
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('should check permissions before deletion', async () => {
      mockFs.accessSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(fileManager.deleteFile('/test/file.txt'))
        .rejects.toThrow('Cannot delete file');
    });

    it('should force deletion when requested', async () => {
      mockFs.accessSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      mockFs.unlinkSync.mockImplementation(() => {});

      await fileManager.deleteFile('/test/file.txt', { force: true });

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('getFileInfo', () => {
    it('should return file information when file exists', () => {
      const mockStats = {
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
        birthtime: new Date('2023-01-01'),
        mtime: new Date('2023-01-02')
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue(mockStats as any);
      mockFs.accessSync.mockImplementation(() => {});

      const result = fileManager.getFileInfo('/test/file.txt');

      expect(result).toEqual({
        exists: true,
        isFile: true,
        isDirectory: false,
        size: 1024,
        created: new Date('2023-01-01'),
        modified: new Date('2023-01-02'),
        permissions: {
          readable: true,
          writable: true,
          executable: true
        }
      });
    });

    it('should return default values when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = fileManager.getFileInfo('/nonexistent/file.txt');

      expect(result.exists).toBe(false);
      expect(result.isFile).toBe(false);
      expect(result.size).toBe(0);
    });
  });

  describe('cleanupTempFiles', () => {
    it('should clean up old temporary files', async () => {
      const oldDate = new Date(Date.now() - 7200000); // 2 hours ago
      const newDate = new Date(Date.now() - 1800000); // 30 minutes ago

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['old-file.tmp', 'new-file.tmp'] as any);
      mockFs.statSync.mockImplementation((path) => {
        const isOld = path.toString().includes('old-file');
        return {
          isDirectory: () => false,
          mtime: isOld ? oldDate : newDate
        } as any;
      });
      mockFs.unlinkSync.mockImplementation(() => {});

      const result = await fileManager.cleanupTempFiles('/tmp', 3600000); // 1 hour max age

      expect(result).toBe(1); // Only old file should be cleaned
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/tmp/old-file.tmp');
    });

    it('should handle directories in temp cleanup', async () => {
      const oldDate = new Date(Date.now() - 7200000);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue(['old-dir'] as any);
      mockFs.statSync.mockReturnValue({
        isDirectory: () => true,
        mtime: oldDate
      } as any);
      mockFs.rmSync.mockImplementation(() => {});

      const result = await fileManager.cleanupTempFiles('/tmp', 3600000);

      expect(result).toBe(1);
      expect(mockFs.rmSync).toHaveBeenCalledWith('/tmp/old-dir', { recursive: true, force: true });
    });

    it('should return 0 when temp directory does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await fileManager.cleanupTempFiles('/nonexistent');

      expect(result).toBe(0);
    });
  });

  describe('createTempDirectory', () => {
    it('should create temporary directory with prefix', () => {
      mockFs.mkdtempSync.mockReturnValue('/tmp/formatforge-abc123');

      const result = fileManager.createTempDirectory('formatforge');

      expect(result).toBe('/tmp/formatforge-abc123');
      expect(mockFs.mkdtempSync).toHaveBeenCalled();
    });

    it('should throw error if temp directory creation fails', () => {
      mockFs.mkdtempSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(() => fileManager.createTempDirectory())
        .toThrow('Failed to create temporary directory');
    });
  });
});