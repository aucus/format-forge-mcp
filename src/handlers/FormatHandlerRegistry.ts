import { FormatHandler } from '../interfaces/FormatHandler.js';
import { SupportedFormat } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';
import { Logger } from '../core/Logger.js';

/**
 * Registry for format handlers
 */
export class FormatHandlerRegistry {
  private static instance: FormatHandlerRegistry;
  private handlers: Map<SupportedFormat, FormatHandler>;
  private logger: Logger;

  private constructor() {
    this.handlers = new Map();
    this.logger = Logger.getInstance();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): FormatHandlerRegistry {
    if (!FormatHandlerRegistry.instance) {
      FormatHandlerRegistry.instance = new FormatHandlerRegistry();
    }
    return FormatHandlerRegistry.instance;
  }

  /**
   * Register a format handler
   */
  registerHandler(format: SupportedFormat, handler: FormatHandler): void {
    if (!handler.canHandle(format)) {
      throw new Error(`Handler cannot handle format: ${format}`);
    }

    this.handlers.set(format, handler);
    this.logger.info('Format handler registered', { 
      format, 
      handlerName: handler.constructor.name,
      supportedExtensions: handler.getSupportedExtensions()
    });
  }

  /**
   * Unregister a format handler
   */
  unregisterHandler(format: SupportedFormat): void {
    const removed = this.handlers.delete(format);
    if (removed) {
      this.logger.info('Format handler unregistered', { format });
    }
  }

  /**
   * Get handler for a specific format
   */
  getHandler(format: SupportedFormat): FormatHandler {
    const handler = this.handlers.get(format);
    if (!handler) {
      throw ConversionError.unsupportedFormat(format);
    }
    return handler;
  }

  /**
   * Check if a format is supported
   */
  isFormatSupported(format: SupportedFormat): boolean {
    return this.handlers.has(format);
  }

  /**
   * Get all supported formats
   */
  getSupportedFormats(): SupportedFormat[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get all registered handlers
   */
  getAllHandlers(): Map<SupportedFormat, FormatHandler> {
    return new Map(this.handlers);
  }

  /**
   * Get handler by file extension
   */
  getHandlerByExtension(extension: string): FormatHandler | null {
    const normalizedExt = extension.toLowerCase();
    
    for (const [format, handler] of this.handlers) {
      if (handler.getSupportedExtensions().includes(normalizedExt)) {
        return handler;
      }
    }
    
    return null;
  }

  /**
   * Get format by file extension
   */
  getFormatByExtension(extension: string): SupportedFormat | null {
    const handler = this.getHandlerByExtension(extension);
    if (!handler) {
      return null;
    }

    // Find the format that this handler supports and matches the extension
    for (const [format, registeredHandler] of this.handlers) {
      if (registeredHandler === handler) {
        return format;
      }
    }

    return null;
  }

  /**
   * Get all supported file extensions
   */
  getAllSupportedExtensions(): string[] {
    const extensions = new Set<string>();
    
    for (const handler of this.handlers.values()) {
      handler.getSupportedExtensions().forEach(ext => extensions.add(ext));
    }
    
    return Array.from(extensions).sort();
  }

  /**
   * Validate that all required formats have handlers
   */
  validateRegistry(): { isValid: boolean; missingFormats: SupportedFormat[] } {
    const requiredFormats: SupportedFormat[] = ['csv', 'xlsx', 'json', 'xml', 'md'];
    const missingFormats = requiredFormats.filter(format => !this.handlers.has(format));
    
    return {
      isValid: missingFormats.length === 0,
      missingFormats
    };
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clear(): void {
    const formatCount = this.handlers.size;
    this.handlers.clear();
    this.logger.info('All format handlers cleared', { previousCount: formatCount });
  }

  /**
   * Get registry statistics
   */
  getStatistics(): {
    totalHandlers: number;
    supportedFormats: SupportedFormat[];
    supportedExtensions: string[];
    handlerDetails: Array<{
      format: SupportedFormat;
      handlerName: string;
      extensions: string[];
    }>;
  } {
    const handlerDetails = Array.from(this.handlers.entries()).map(([format, handler]) => ({
      format,
      handlerName: handler.constructor.name,
      extensions: handler.getSupportedExtensions()
    }));

    return {
      totalHandlers: this.handlers.size,
      supportedFormats: this.getSupportedFormats(),
      supportedExtensions: this.getAllSupportedExtensions(),
      handlerDetails
    };
  }

  /**
   * Initialize registry with default handlers (to be called during setup)
   */
  async initializeDefaultHandlers(): Promise<void> {
    this.logger.info('Initializing default format handlers');
    
    // This method will be implemented when we create the specific handlers
    // For now, it's a placeholder that logs the intention
    
    const validation = this.validateRegistry();
    if (!validation.isValid) {
      this.logger.warn('Registry validation failed after initialization', {
        missingFormats: validation.missingFormats
      });
    } else {
      this.logger.info('Default format handlers initialized successfully', {
        supportedFormats: this.getSupportedFormats()
      });
    }
  }
}