import { FormatHandler } from '../interfaces/FormatHandler.js';
import { SupportedFormat } from '../types/index.js';
import { FormatHandlerRegistry } from './FormatHandlerRegistry.js';
import { ConversionError } from '../errors/ConversionError.js';
import { Logger } from '../core/Logger.js';

/**
 * Factory for creating and managing format handlers
 */
export class FormatHandlerFactory {
  private static instance: FormatHandlerFactory;
  private registry: FormatHandlerRegistry;
  private logger: Logger;

  private constructor() {
    this.registry = FormatHandlerRegistry.getInstance();
    this.logger = Logger.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): FormatHandlerFactory {
    if (!FormatHandlerFactory.instance) {
      FormatHandlerFactory.instance = new FormatHandlerFactory();
    }
    return FormatHandlerFactory.instance;
  }

  /**
   * Create a handler for the specified format
   */
  createHandler(format: SupportedFormat): FormatHandler {
    try {
      const handler = this.registry.getHandler(format);
      this.logger.debug('Handler created for format', { format, handlerName: handler.constructor.name });
      return handler;
    } catch (error) {
      this.logger.error('Failed to create handler for format', error as Error, { format });
      throw error;
    }
  }

  /**
   * Create handler by file extension
   */
  createHandlerByExtension(extension: string): FormatHandler {
    const handler = this.registry.getHandlerByExtension(extension);
    if (!handler) {
      throw ConversionError.unsupportedFormat(`extension: ${extension}`);
    }

    this.logger.debug('Handler created for extension', { 
      extension, 
      handlerName: handler.constructor.name 
    });
    
    return handler;
  }

  /**
   * Create handler by file path
   */
  createHandlerByFilePath(filePath: string): FormatHandler {
    const extension = this.extractExtension(filePath);
    return this.createHandlerByExtension(extension);
  }

  /**
   * Get the appropriate handler for reading a file
   */
  getReaderHandler(filePath: string, expectedFormat?: SupportedFormat): FormatHandler {
    if (expectedFormat) {
      // If format is specified, use it directly
      const handler = this.createHandler(expectedFormat);
      
      // Validate that the handler can work with the file extension
      const extension = this.extractExtension(filePath);
      if (!handler.getSupportedExtensions().includes(extension)) {
        this.logger.warn('Handler format does not match file extension', {
          expectedFormat,
          filePath,
          extension,
          supportedExtensions: handler.getSupportedExtensions()
        });
      }
      
      return handler;
    }

    // Auto-detect format from file extension
    return this.createHandlerByFilePath(filePath);
  }

  /**
   * Get the appropriate handler for writing a file
   */
  getWriterHandler(targetFormat: SupportedFormat, outputPath?: string): FormatHandler {
    const handler = this.createHandler(targetFormat);

    if (outputPath) {
      // Validate that the output extension matches the target format
      const extension = this.extractExtension(outputPath);
      if (!handler.getSupportedExtensions().includes(extension)) {
        this.logger.warn('Output file extension does not match target format', {
          targetFormat,
          outputPath,
          extension,
          supportedExtensions: handler.getSupportedExtensions()
        });
      }
    }

    return handler;
  }

  /**
   * Check if a format is supported
   */
  isFormatSupported(format: SupportedFormat): boolean {
    return this.registry.isFormatSupported(format);
  }

  /**
   * Check if a file extension is supported
   */
  isExtensionSupported(extension: string): boolean {
    return this.registry.getHandlerByExtension(extension) !== null;
  }

  /**
   * Check if a file path is supported
   */
  isFilePathSupported(filePath: string): boolean {
    try {
      const extension = this.extractExtension(filePath);
      return this.isExtensionSupported(extension);
    } catch {
      return false;
    }
  }

  /**
   * Get all supported formats
   */
  getSupportedFormats(): SupportedFormat[] {
    return this.registry.getSupportedFormats();
  }

  /**
   * Get all supported file extensions
   */
  getSupportedExtensions(): string[] {
    return this.registry.getAllSupportedExtensions();
  }

  /**
   * Get format suggestions for unsupported files
   */
  getFormatSuggestions(filePath: string): {
    suggestedFormats: SupportedFormat[];
    reason: string;
  } {
    const extension = this.extractExtension(filePath);
    const supportedExtensions = this.getSupportedExtensions();
    
    // Find similar extensions
    const similarExtensions = supportedExtensions.filter(ext => 
      ext.includes(extension.substring(1)) || extension.includes(ext.substring(1))
    );

    if (similarExtensions.length > 0) {
      const suggestedFormats = similarExtensions
        .map(ext => this.registry.getFormatByExtension(ext))
        .filter((format): format is SupportedFormat => format !== null);

      return {
        suggestedFormats,
        reason: `Similar extensions found: ${similarExtensions.join(', ')}`
      };
    }

    // If no similar extensions, suggest all formats
    return {
      suggestedFormats: this.getSupportedFormats(),
      reason: 'No similar extensions found, showing all supported formats'
    };
  }

  /**
   * Validate handler compatibility
   */
  validateHandlerCompatibility(
    sourceFormat: SupportedFormat,
    targetFormat: SupportedFormat
  ): {
    isCompatible: boolean;
    warnings: string[];
    suggestions: string[];
  } {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check if both formats are supported
    if (!this.isFormatSupported(sourceFormat)) {
      warnings.push(`Source format '${sourceFormat}' is not supported`);
    }

    if (!this.isFormatSupported(targetFormat)) {
      warnings.push(`Target format '${targetFormat}' is not supported`);
    }

    // Check for potential data loss scenarios
    if (sourceFormat === 'xlsx' && targetFormat === 'csv') {
      warnings.push('Converting from Excel to CSV may lose formatting and multiple sheets');
      suggestions.push('Consider specifying which sheet to convert');
    }

    if (sourceFormat === 'xml' && targetFormat === 'csv') {
      warnings.push('Converting from XML to CSV may lose hierarchical structure');
      suggestions.push('Ensure XML has a flat, tabular structure');
    }

    if (sourceFormat === 'json' && targetFormat === 'csv') {
      warnings.push('Converting from JSON to CSV may lose nested object structure');
      suggestions.push('Ensure JSON contains an array of flat objects');
    }

    if (targetFormat === 'md' && !['csv', 'json'].includes(sourceFormat)) {
      warnings.push('Converting to Markdown works best with tabular data');
      suggestions.push('Consider converting to CSV first, then to Markdown');
    }

    return {
      isCompatible: warnings.length === 0,
      warnings,
      suggestions
    };
  }

  /**
   * Extract file extension from path
   */
  private extractExtension(filePath: string): string {
    const extension = filePath.toLowerCase().match(/\.[^.]*$/)?.[0];
    if (!extension) {
      throw ConversionError.unsupportedFormat('no file extension');
    }
    return extension;
  }

  /**
   * Get factory statistics
   */
  getStatistics(): {
    supportedFormats: number;
    supportedExtensions: number;
    registryStats: ReturnType<FormatHandlerRegistry['getStatistics']>;
  } {
    const registryStats = this.registry.getStatistics();
    
    return {
      supportedFormats: registryStats.supportedFormats.length,
      supportedExtensions: registryStats.supportedExtensions.length,
      registryStats
    };
  }

  /**
   * Initialize the factory with default handlers
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing FormatHandlerFactory');
    
    try {
      await this.registry.initializeDefaultHandlers();
      
      const stats = this.getStatistics();
      this.logger.info('FormatHandlerFactory initialized successfully', stats);
      
    } catch (error) {
      this.logger.error('Failed to initialize FormatHandlerFactory', error as Error);
      throw ConversionError.conversionFailed(
        'Failed to initialize format handlers',
        { originalError: error }
      );
    }
  }
}