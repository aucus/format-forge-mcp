import { FormatHandlerRegistry } from '../handlers/FormatHandlerRegistry.js';
import { FormatHandler } from '../interfaces/FormatHandler.js';
import { DataStructure, SupportedFormat, ReadOptions, WriteOptions, ValidationResult } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';

// Mock format handler for testing
class MockFormatHandler implements FormatHandler {
  constructor(
    private format: SupportedFormat,
    private extensions: string[]
  ) {}

  canHandle(format: SupportedFormat): boolean {
    return format === this.format;
  }

  getSupportedExtensions(): string[] {
    return [...this.extensions];
  }

  async read(filePath: string, options?: ReadOptions): Promise<DataStructure> {
    return {
      rows: [{ test: 'data' }],
      metadata: {
        originalFormat: this.format,
        encoding: 'utf-8',
        totalRows: 1,
        totalColumns: 1
      }
    };
  }

  async write(data: DataStructure, filePath: string, options?: WriteOptions): Promise<void> {
    // Mock implementation
  }

  validate(data: DataStructure): ValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }
}

describe('FormatHandlerRegistry', () => {
  let registry: FormatHandlerRegistry;
  let csvHandler: MockFormatHandler;
  let jsonHandler: MockFormatHandler;

  beforeEach(() => {
    // Get fresh instance for each test
    registry = FormatHandlerRegistry.getInstance();
    registry.clear(); // Clear any existing handlers
    
    csvHandler = new MockFormatHandler('csv', ['.csv']);
    jsonHandler = new MockFormatHandler('json', ['.json']);
  });

  afterEach(() => {
    registry.clear();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const registry1 = FormatHandlerRegistry.getInstance();
      const registry2 = FormatHandlerRegistry.getInstance();
      expect(registry1).toBe(registry2);
    });
  });

  describe('registerHandler', () => {
    it('should register a handler successfully', () => {
      registry.registerHandler('csv', csvHandler);
      
      expect(registry.isFormatSupported('csv')).toBe(true);
      expect(registry.getHandler('csv')).toBe(csvHandler);
    });

    it('should throw error if handler cannot handle format', () => {
      expect(() => registry.registerHandler('xml', csvHandler))
        .toThrow('Handler cannot handle format: xml');
    });

    it('should replace existing handler', () => {
      const newCsvHandler = new MockFormatHandler('csv', ['.csv', '.txt']);
      
      registry.registerHandler('csv', csvHandler);
      registry.registerHandler('csv', newCsvHandler);
      
      expect(registry.getHandler('csv')).toBe(newCsvHandler);
    });
  });

  describe('unregisterHandler', () => {
    it('should unregister a handler successfully', () => {
      registry.registerHandler('csv', csvHandler);
      expect(registry.isFormatSupported('csv')).toBe(true);
      
      registry.unregisterHandler('csv');
      expect(registry.isFormatSupported('csv')).toBe(false);
    });

    it('should handle unregistering non-existent handler', () => {
      expect(() => registry.unregisterHandler('csv')).not.toThrow();
    });
  });

  describe('getHandler', () => {
    it('should return registered handler', () => {
      registry.registerHandler('csv', csvHandler);
      
      const handler = registry.getHandler('csv');
      expect(handler).toBe(csvHandler);
    });

    it('should throw error for unsupported format', () => {
      expect(() => registry.getHandler('csv'))
        .toThrow(ConversionError);
    });
  });

  describe('format support queries', () => {
    beforeEach(() => {
      registry.registerHandler('csv', csvHandler);
      registry.registerHandler('json', jsonHandler);
    });

    it('should check if format is supported', () => {
      expect(registry.isFormatSupported('csv')).toBe(true);
      expect(registry.isFormatSupported('json')).toBe(true);
      expect(registry.isFormatSupported('xml')).toBe(false);
    });

    it('should return supported formats', () => {
      const formats = registry.getSupportedFormats();
      expect(formats).toContain('csv');
      expect(formats).toContain('json');
      expect(formats).toHaveLength(2);
    });

    it('should return all handlers', () => {
      const handlers = registry.getAllHandlers();
      expect(handlers.get('csv')).toBe(csvHandler);
      expect(handlers.get('json')).toBe(jsonHandler);
      expect(handlers.size).toBe(2);
    });
  });

  describe('extension-based queries', () => {
    beforeEach(() => {
      registry.registerHandler('csv', csvHandler);
      registry.registerHandler('json', jsonHandler);
    });

    it('should get handler by extension', () => {
      const handler = registry.getHandlerByExtension('.csv');
      expect(handler).toBe(csvHandler);
    });

    it('should handle case-insensitive extensions', () => {
      const handler = registry.getHandlerByExtension('.CSV');
      expect(handler).toBe(csvHandler);
    });

    it('should return null for unsupported extension', () => {
      const handler = registry.getHandlerByExtension('.pdf');
      expect(handler).toBeNull();
    });

    it('should get format by extension', () => {
      const format = registry.getFormatByExtension('.json');
      expect(format).toBe('json');
    });

    it('should return null for unsupported extension format', () => {
      const format = registry.getFormatByExtension('.pdf');
      expect(format).toBeNull();
    });

    it('should get all supported extensions', () => {
      const extensions = registry.getAllSupportedExtensions();
      expect(extensions).toContain('.csv');
      expect(extensions).toContain('.json');
      expect(extensions).toHaveLength(2);
      expect(extensions).toEqual(extensions.sort()); // Should be sorted
    });
  });

  describe('validation', () => {
    it('should validate complete registry', () => {
      registry.registerHandler('csv', csvHandler);
      registry.registerHandler('xlsx', new MockFormatHandler('xlsx', ['.xlsx']));
      registry.registerHandler('json', jsonHandler);
      registry.registerHandler('xml', new MockFormatHandler('xml', ['.xml']));
      registry.registerHandler('md', new MockFormatHandler('md', ['.md']));

      const validation = registry.validateRegistry();
      expect(validation.isValid).toBe(true);
      expect(validation.missingFormats).toHaveLength(0);
    });

    it('should detect missing formats', () => {
      registry.registerHandler('csv', csvHandler);
      registry.registerHandler('json', jsonHandler);

      const validation = registry.validateRegistry();
      expect(validation.isValid).toBe(false);
      expect(validation.missingFormats).toContain('xlsx');
      expect(validation.missingFormats).toContain('xml');
      expect(validation.missingFormats).toContain('md');
    });
  });

  describe('statistics', () => {
    beforeEach(() => {
      registry.registerHandler('csv', csvHandler);
      registry.registerHandler('json', jsonHandler);
    });

    it('should return correct statistics', () => {
      const stats = registry.getStatistics();
      
      expect(stats.totalHandlers).toBe(2);
      expect(stats.supportedFormats).toEqual(['csv', 'json']);
      expect(stats.supportedExtensions).toEqual(['.csv', '.json']);
      expect(stats.handlerDetails).toHaveLength(2);
      
      const csvDetail = stats.handlerDetails.find(d => d.format === 'csv');
      expect(csvDetail).toBeDefined();
      expect(csvDetail!.handlerName).toBe('MockFormatHandler');
      expect(csvDetail!.extensions).toEqual(['.csv']);
    });

    it('should return empty statistics for empty registry', () => {
      const stats = registry.getStatistics();
      
      expect(stats.totalHandlers).toBe(0);
      expect(stats.supportedFormats).toHaveLength(0);
      expect(stats.supportedExtensions).toHaveLength(0);
      expect(stats.handlerDetails).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all handlers', () => {
      registry.registerHandler('csv', csvHandler);
      registry.registerHandler('json', jsonHandler);
      
      expect(registry.getSupportedFormats()).toHaveLength(2);
      
      registry.clear();
      
      expect(registry.getSupportedFormats()).toHaveLength(0);
      expect(registry.isFormatSupported('csv')).toBe(false);
      expect(registry.isFormatSupported('json')).toBe(false);
    });
  });

  describe('initializeDefaultHandlers', () => {
    it('should initialize without throwing', async () => {
      await expect(registry.initializeDefaultHandlers()).resolves.toBeUndefined();
    });

    it('should log warnings for missing handlers', async () => {
      // This test verifies that the method completes even when handlers are missing
      await registry.initializeDefaultHandlers();
      
      const validation = registry.validateRegistry();
      expect(validation.isValid).toBe(false);
      expect(validation.missingFormats.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple extensions for same handler', () => {
      const multiExtHandler = new MockFormatHandler('xlsx', ['.xlsx', '.xls']);
      registry.registerHandler('xlsx', multiExtHandler);
      
      expect(registry.getHandlerByExtension('.xlsx')).toBe(multiExtHandler);
      expect(registry.getHandlerByExtension('.xls')).toBe(multiExtHandler);
      expect(registry.getFormatByExtension('.xlsx')).toBe('xlsx');
      expect(registry.getFormatByExtension('.xls')).toBe('xlsx');
    });

    it('should handle empty extension list', () => {
      const noExtHandler = new MockFormatHandler('csv', []);
      registry.registerHandler('csv', noExtHandler);
      
      expect(registry.getHandlerByExtension('.csv')).toBeNull();
      expect(registry.getAllSupportedExtensions()).toHaveLength(0);
    });

    it('should handle duplicate extensions across handlers', () => {
      const handler1 = new MockFormatHandler('csv', ['.csv', '.txt']);
      const handler2 = new MockFormatHandler('json', ['.json', '.txt']);
      
      registry.registerHandler('csv', handler1);
      registry.registerHandler('json', handler2);
      
      // Should return the first handler that supports the extension
      const txtHandler = registry.getHandlerByExtension('.txt');
      expect(txtHandler).toBe(handler1);
    });
  });
});