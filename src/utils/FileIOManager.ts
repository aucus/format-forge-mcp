import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../core/Logger.js';
import { ConversionError } from '../errors/ConversionError.js';

/**
 * File I/O management with security validation and directory handling
 */
export class FileIOManager {
  private logger: Logger;
  private static readonly MAX_PATH_LENGTH = 260;
  private static readonly FORBIDDEN_PATTERNS = [
    /\.\./,           // Path traversal
    /~/,              // Home directory
    /\$\{.*\}/,       // Variable expansion
    /%.*%/,           // Windows environment variables
    /[<>:"|?*]/,      // Invalid filename characters
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, // Windows reserved names
  ];

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Validate file path for security and correctness
   */
  validateFilePath(filePath: string, options: {
    mustExist?: boolean;
    allowCreate?: boolean;
    maxDepth?: number;
  } = {}): {
    isValid: boolean;
    errors: string[];
    normalizedPath: string;
  } {
    const errors: string[] = [];
    let normalizedPath = '';

    try {
      // Basic validation
      if (!filePath || typeof filePath !== 'string') {
        errors.push('File path must be a non-empty string');
        return { isValid: false, errors, normalizedPath };
      }

      // Length check
      if (filePath.length > FileIOManager.MAX_PATH_LENGTH) {
        errors.push(`File path exceeds maximum length of ${FileIOManager.MAX_PATH_LENGTH} characters`);
      }

      // Normalize path
      normalizedPath = path.normalize(filePath);

      // Security pattern checks
      for (const pattern of FileIOManager.FORBIDDEN_PATTERNS) {
        if (pattern.test(normalizedPath)) {
          errors.push(`File path contains forbidden pattern: ${pattern.source}`);
        }
      }

      // Check for null bytes
      if (normalizedPath.includes('\0')) {
        errors.push('File path contains null bytes');
      }

      // Depth check
      if (options.maxDepth) {
        const depth = normalizedPath.split(path.sep).length;
        if (depth > options.maxDepth) {
          errors.push(`File path depth exceeds maximum of ${options.maxDepth}`);
        }
      }

      // Existence checks
      if (options.mustExist && !fs.existsSync(normalizedPath)) {
        errors.push(`File does not exist: ${normalizedPath}`);
      }

      // Directory creation check
      if (options.allowCreate) {
        const dir = path.dirname(normalizedPath);
        if (!fs.existsSync(dir)) {
          try {
            fs.accessSync(path.dirname(dir), fs.constants.W_OK);
          } catch {
            errors.push(`Cannot create file in directory: ${dir}`);
          }
        }
      }

    } catch (error) {
      errors.push(`Path validation failed: ${(error as Error).message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      normalizedPath
    };
  } 
 /**
   * Ensure directory exists and create if necessary
   */
  async ensureDirectory(dirPath: string, options: {
    mode?: number;
    recursive?: boolean;
  } = {}): Promise<void> {
    this.logger.debug('Ensuring directory exists', { dirPath, options });

    try {
      const validation = this.validateFilePath(dirPath, { allowCreate: true });
      if (!validation.isValid) {
        throw ConversionError.validationFailed(validation.errors);
      }

      const normalizedPath = validation.normalizedPath;

      // Check if directory already exists
      if (fs.existsSync(normalizedPath)) {
        const stats = fs.statSync(normalizedPath);
        if (!stats.isDirectory()) {
          throw ConversionError.fileSystemError(
            `Path exists but is not a directory: ${normalizedPath}`
          );
        }
        return;
      }

      // Create directory
      fs.mkdirSync(normalizedPath, {
        recursive: options.recursive !== false,
        mode: options.mode || 0o755
      });

      this.logger.debug('Directory created successfully', { dirPath: normalizedPath });

    } catch (error) {
      this.logger.error('Failed to ensure directory', error as Error, { dirPath });
      if (error instanceof ConversionError) {
        throw error;
      }
      throw ConversionError.fileSystemError(
        `Failed to create directory: ${(error as Error).message}`
      );
    }
  }

  /**
   * Check file permissions
   */
  checkPermissions(filePath: string, permissions: {
    read?: boolean;
    write?: boolean;
    execute?: boolean;
  }): {
    hasPermissions: boolean;
    missingPermissions: string[];
  } {
    const missingPermissions: string[] = [];

    try {
      if (permissions.read) {
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
        } catch {
          missingPermissions.push('read');
        }
      }

      if (permissions.write) {
        try {
          fs.accessSync(filePath, fs.constants.W_OK);
        } catch {
          missingPermissions.push('write');
        }
      }

      if (permissions.execute) {
        try {
          fs.accessSync(filePath, fs.constants.X_OK);
        } catch {
          missingPermissions.push('execute');
        }
      }

    } catch (error) {
      this.logger.warn('Permission check failed', { filePath, error: (error as Error).message });
    }

    return {
      hasPermissions: missingPermissions.length === 0,
      missingPermissions
    };
  }  /**
 
  * Generate safe output path with collision handling
   */
  generateOutputPath(
    sourcePath: string,
    targetFormat: string,
    outputDir?: string,
    options: {
      preserveName?: boolean;
      addTimestamp?: boolean;
      handleCollisions?: boolean;
    } = {}
  ): string {
    this.logger.debug('Generating output path', { sourcePath, targetFormat, outputDir, options });

    try {
      const sourceBasename = path.basename(sourcePath, path.extname(sourcePath));
      const targetExtension = this.getExtensionForFormat(targetFormat);
      
      let filename = options.preserveName 
        ? `${sourceBasename}.${targetExtension}`
        : `${sourceBasename}_converted.${targetExtension}`;

      // Add timestamp if requested
      if (options.addTimestamp) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const name = path.basename(filename, path.extname(filename));
        filename = `${name}_${timestamp}.${targetExtension}`;
      }

      // Determine output directory
      const baseDir = outputDir || path.dirname(sourcePath);
      let outputPath = path.join(baseDir, filename);

      // Handle collisions
      if (options.handleCollisions && fs.existsSync(outputPath)) {
        let counter = 1;
        const name = path.basename(filename, path.extname(filename));
        
        do {
          filename = `${name}_${counter}.${targetExtension}`;
          outputPath = path.join(baseDir, filename);
          counter++;
        } while (fs.existsSync(outputPath) && counter < 1000);

        if (counter >= 1000) {
          throw ConversionError.fileSystemError('Too many file collisions, cannot generate unique name');
        }
      }

      // Validate the generated path
      const validation = this.validateFilePath(outputPath, { allowCreate: true });
      if (!validation.isValid) {
        throw ConversionError.validationFailed(validation.errors);
      }

      return validation.normalizedPath;

    } catch (error) {
      this.logger.error('Failed to generate output path', error as Error, { sourcePath, targetFormat });
      throw error;
    }
  }

  /**
   * Get file extension for format
   */
  private getExtensionForFormat(format: string): string {
    const extensions: Record<string, string> = {
      csv: 'csv',
      xlsx: 'xlsx',
      json: 'json',
      xml: 'xml',
      md: 'md',
      markdown: 'md'
    };

    return extensions[format.toLowerCase()] || format.toLowerCase();
  }

  /**
   * Safe file copy with validation
   */
  async copyFile(sourcePath: string, targetPath: string, options: {
    overwrite?: boolean;
    preserveTimestamps?: boolean;
  } = {}): Promise<void> {
    this.logger.debug('Copying file', { sourcePath, targetPath, options });

    try {
      // Validate source
      const sourceValidation = this.validateFilePath(sourcePath, { mustExist: true });
      if (!sourceValidation.isValid) {
        throw ConversionError.validationFailed(sourceValidation.errors);
      }

      // Validate target
      const targetValidation = this.validateFilePath(targetPath, { allowCreate: true });
      if (!targetValidation.isValid) {
        throw ConversionError.validationFailed(targetValidation.errors);
      }

      // Check if target exists and handle overwrite
      if (fs.existsSync(targetValidation.normalizedPath) && !options.overwrite) {
        throw ConversionError.fileSystemError(`Target file already exists: ${targetPath}`);
      }

      // Ensure target directory exists
      await this.ensureDirectory(path.dirname(targetValidation.normalizedPath));

      // Copy file
      fs.copyFileSync(sourceValidation.normalizedPath, targetValidation.normalizedPath);

      // Preserve timestamps if requested
      if (options.preserveTimestamps) {
        const stats = fs.statSync(sourceValidation.normalizedPath);
        fs.utimesSync(targetValidation.normalizedPath, stats.atime, stats.mtime);
      }

      this.logger.debug('File copied successfully', { 
        source: sourceValidation.normalizedPath,
        target: targetValidation.normalizedPath 
      });

    } catch (error) {
      this.logger.error('File copy failed', error as Error, { sourcePath, targetPath });
      throw error;
    }
  }  /**
  
 * Safe file deletion with validation
   */
  async deleteFile(filePath: string, options: {
    force?: boolean;
    backup?: boolean;
  } = {}): Promise<void> {
    this.logger.debug('Deleting file', { filePath, options });

    try {
      const validation = this.validateFilePath(filePath, { mustExist: true });
      if (!validation.isValid) {
        throw ConversionError.validationFailed(validation.errors);
      }

      const normalizedPath = validation.normalizedPath;

      // Create backup if requested
      if (options.backup) {
        const backupPath = `${normalizedPath}.backup.${Date.now()}`;
        await this.copyFile(normalizedPath, backupPath, { overwrite: true });
        this.logger.debug('Backup created', { original: normalizedPath, backup: backupPath });
      }

      // Check permissions
      const permissions = this.checkPermissions(normalizedPath, { write: true });
      if (!permissions.hasPermissions && !options.force) {
        throw ConversionError.permissionDenied(`Cannot delete file: ${normalizedPath}`);
      }

      // Delete file
      fs.unlinkSync(normalizedPath);

      this.logger.debug('File deleted successfully', { filePath: normalizedPath });

    } catch (error) {
      this.logger.error('File deletion failed', error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Get file information
   */
  getFileInfo(filePath: string): {
    exists: boolean;
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    created: Date;
    modified: Date;
    permissions: {
      readable: boolean;
      writable: boolean;
      executable: boolean;
    };
  } {
    try {
      const validation = this.validateFilePath(filePath);
      const normalizedPath = validation.normalizedPath;

      if (!fs.existsSync(normalizedPath)) {
        return {
          exists: false,
          isFile: false,
          isDirectory: false,
          size: 0,
          created: new Date(0),
          modified: new Date(0),
          permissions: {
            readable: false,
            writable: false,
            executable: false
          }
        };
      }

      const stats = fs.statSync(normalizedPath);
      const permissions = this.checkPermissions(normalizedPath, {
        read: true,
        write: true,
        execute: true
      });

      return {
        exists: true,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        permissions: {
          readable: !permissions.missingPermissions.includes('read'),
          writable: !permissions.missingPermissions.includes('write'),
          executable: !permissions.missingPermissions.includes('execute')
        }
      };

    } catch (error) {
      this.logger.warn('Failed to get file info', { filePath, error: (error as Error).message });
      return {
        exists: false,
        isFile: false,
        isDirectory: false,
        size: 0,
        created: new Date(0),
        modified: new Date(0),
        permissions: {
          readable: false,
          writable: false,
          executable: false
        }
      };
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanupTempFiles(tempDir: string, maxAge: number = 3600000): Promise<number> {
    this.logger.debug('Cleaning up temporary files', { tempDir, maxAge });

    let cleanedCount = 0;

    try {
      if (!fs.existsSync(tempDir)) {
        return cleanedCount;
      }

      const files = fs.readdirSync(tempDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(tempDir, file);
        
        try {
          const stats = fs.statSync(filePath);
          const age = now - stats.mtime.getTime();

          if (age > maxAge) {
            if (stats.isDirectory()) {
              fs.rmSync(filePath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(filePath);
            }
            cleanedCount++;
          }
        } catch (error) {
          this.logger.warn('Failed to clean up file', { 
            filePath, 
            error: (error as Error).message 
          });
        }
      }

      this.logger.debug('Temporary files cleaned up', { cleanedCount });

    } catch (error) {
      this.logger.error('Cleanup failed', error as Error, { tempDir });
    }

    return cleanedCount;
  }

  /**
   * Create secure temporary directory
   */
  createTempDirectory(prefix: string = 'formatforge'): string {
    try {
      const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), `${prefix}-`));
      this.logger.debug('Temporary directory created', { tempDir });
      return tempDir;
    } catch (error) {
      this.logger.error('Failed to create temporary directory', error as Error, { prefix });
      throw ConversionError.fileSystemError(
        `Failed to create temporary directory: ${(error as Error).message}`
      );
    }
  }
}