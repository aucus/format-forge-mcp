import { FormatHandlerFactory } from '../handlers/FormatHandlerFactory.js';
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

describe('FormatHandlerFactory', () => {
  let factory: FormatHandlerFactory;
  let registry: FormatHandlerRegistry;
  let csvHandler: MockFormatHandler;
  let jsonHandler: MockFormatHandler;
  let xlsxHandler: MockFormatHandler;

  beforeEach(() => {
    factory = FormatHandlerFactory.getInstance();
    registry = FormatHandlerRegistry.getInstance();
    registry.clear();
    
    csvHandler = new MockFormatHandler('csv', ['.csv']);
    jsonHandler = new MockFormatHandler('json', ['.json']);
    xlsxHandler = new MockFormatHandler('xlsx', ['.xlsx', '.xls']);
    
    registry.registerHandler('csv', csvHandler);
    registry.registerHandler('json', jsonHandler);
    registry.registerHandler('xlsx', xlsxHandler);
  });

  afterEach(() => {
    registry.clear();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const factory1 = FormatHandlerFactory.getInstance();
      const factory2 = FormatHandlerFactory.getInstance();
      expect(factory1).toBe(factory2);
    });
  });

  describe('createHandler', () => {
    it('should create handler for supported format', () => {
      const handler = factory.createHandler('csv');
      expect(handler).toBe(csvHandler);
    });

    it('should throw error for unsupported format', () => {
      expect(() => factory.createHandler('pdf' as any))
        .toThrow(ConversionError);
    });
  });

  describe('createHandlerByExtension', () => {
    it('should create handler for supported extension', () => {
      const handler = factory.createHandlerByExtension('.csv');
      expect(handler).toBe(csvHandler);
    });

    it('should handle case-insensitive extensions', () => {
      const handler = factory.createHandlerByExtension('.CSV');
      expect(handler).toBe(csvHandler);
    });

    it('should throw error for unsupported extension', () => {
      expect(() => factory.createHandlerByExtension('.pdf'))
        .toThrow(ConversionError);
    });

    it('should handle multiple extensions for same format', () => {
      const xlsHandler = factory.createHandlerByExtension('.xls');
      const xlsxHandlerResult = factory.createHandlerByExtension('.xlsx');
      
      expect(xlsHandler).toBe(xlsxHandler);
      expect(xlsxHandlerResult).toBe(xlsxHandler);
    });
  });

  describe('createHandlerByFilePath', () => {
    it('should create handler from file path', () => {
      const handler = factory.createHandlerByFilePath('/path/to/file.csv');
      expect(handler).toBe(csvHandler);
    });

    it('should handle complex file paths', () => {
      const handler = factory.createHandlerByFilePath('/complex/path/with.dots/file.json');
      expect(handler).toBe(jsonHandler);
    });

    it('should throw error for file without extension', () => {
      expect(() => factory.createHandlerByFilePath('/path/to/file'))
        .toThrow(ConversionError);
    });

    it('should throw error for unsupported extension', () => {
      expect(() => factory.createHandlerByFilePath('/path/to/file.pdf'))
        .toThrow(ConversionError);
    });
  });

  describe('getReaderHandler', () => {
    it('should return handler for specified format', () => {
      const handler = factory.getReaderHandler('/path/to/file.csv', 'csv');
      expect(handler).toBe(csvHandler);
    });

    it('should auto-detect format from file path', () => {
      const handler = factory.getReaderHandler('/path/to/file.json');
      expect(handler).toBe(jsonHandler);
    });

    it('should warn about format/extension mismatch', () => {
      // This should work but log a warning
      const handler = factory.getReaderHandler('/path/to/file.txt', 'csv');
      expect(handler).toBe(csvHandler);
    });

    it('should throw error for unsupported auto-detected format', () => {
      expect(() => factory.getReaderHandler('/path/to/file.pdf'))
        .toThrow(ConversionError);
    });
  });

  describe('getWriterHandler', () => {
    it('should return handler for target format', () => {
      const handler = factory.getWriterHandler('json');
      expect(handler).toBe(jsonHandler);
    });

    it('should validate output path extension', () => {
      // This should work but log a warning
      const handler = factory.getWriterHandler('csv', '/path/to/output.txt');
      expect(handler).toBe(csvHandler);
    });

    it('should work without output path', () => {
      const handler = factory.getWriterHandler('xlsx');
      expect(handler).toBe(xlsxHandler);
    });

    it('should throw error for unsupported format', () => {
      expect(() => factory.getWriterHandler('pdf' as any))
        .toThrow(ConversionError);
    });
  });

  describe('support queries', () => {
    it('should check format support', () => {
      expect(factory.isFormatSupported('csv')).toBe(true);
      expect(factory.isFormatSupported('json')).toBe(true);
      expect(factory.isFormatSupported('pdf' as any)).toBe(false);
    });

    it('should check extension support', () => {
      expect(factory.isExtensionSupported('.csv')).toBe(true);
      expect(factory.isExtensionSupported('.json')).toBe(true);
      expect(factory.isExtensionSupported('.pdf')).toBe(false);
    });

    it('should check file path support', () => {
      expect(factory.isFilePathSupported('/path/to/file.csv')).toBe(true);
      expect(factory.isFilePathSupported('/path/to/file.pdf')).toBe(false);
      expect(factory.isFilePathSupported('/path/to/file')).toBe(false);
    });

    it('should return supported formats', () => {
      const formats = factory.getSupportedFormats();
      expect(formats).toContain('csv');
      expect(formats).toContain('json');
      expect(formats).toContain('xlsx');
    });

    it('should return supported extensions', () => {
      const extensions = factory.getSupportedExtensions();
      expect(extensions).toContain('.csv');
      expect(extensions).toContain('.json');
      expect(extensions).toContain('.xlsx');
      expect(extensions).toContain('.xls');
    });
  });

  describe('getFormatSuggestions', () => {
    it('should suggest similar formats', () => {
      const suggestions = factory.getFormatSuggestions('/path/to/file.txt');
      
      expect(suggestions.suggestedFormats.length).toBeGreaterThan(0);
      expect(suggestions.reason).toContain('showing all supported formats');
    });

    it('should suggest based on similar extensions', () => {
      // Add a handler with similar extension
      const txtHandler = new MockFormatHandler('csv', ['.txt']);
      registry.registerHandler('csv', txtHandler);
      
      const suggestions = factory.getFormatSuggestions('/path/to/file.tx');
      
      expect(suggestions.suggestedFormats).toContain('csv');
      expect(suggestions.reason).toContain('Similar extensions found');
    });

    it('should handle files without extensions', () => {
      const suggestions = factory.getFormatSuggestions('/path/to/file');
      
      expect(suggestions.suggestedFormats.length).toBeGreaterThan(0);
      expect(suggestions.reason).toContain('showing all supported formats');
    });
  });

  describe('validateHandlerCompatibility', () => {
    it('should validate compatible formats', () => {
      const result = factory.validateHandlerCompatibility('csv', 'json');
      
      expect(result.isCompatible).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect unsupported source format', () => {
      const result = factory.validateHandlerCompatibility('pdf' as any, 'json');
      
      expect(result.isCompatible).toBe(false);
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Source format 'pdf' is not supported")
      );
    });

    it('should detect unsupported target format', () => {
      const result = factory.validateHandlerCompatibility('csv', 'pdf' as any);
      
      expect(result.isCompatible).toBe(false);
      expect(result.warnings).toContainEqual(
        expect.stringContaining("Target format 'pdf' is not supported")
      );
    });

    it('should warn about Excel to CSV conversion', () => {
      const result = factory.validateHandlerCompatibility('xlsx', 'csv');
      
      expect(result.isCompatible).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('may lose formatting and multiple sheets')
      );
      expect(result.suggestions).toContainEqual(
        expect.stringContaining('Consider specifying which sheet')
      );
    });

    it('should warn about XML to CSV conversion', () => {
      registry.registerHandler('xml', new MockFormatHandler('xml', ['.xml']));
      
      const result = factory.validateHandlerCompatibility('xml', 'csv');
      
      expect(result.warnings).toContainEqual(
        expect.stringContaining('may lose hierarchical structure')
      );
    });

    it('should warn about JSON to CSV conversion', () => {
      const result = factory.validateHandlerCompatibility('json', 'csv');
      
      expect(result.warnings).toContainEqual(
        expect.stringContaining('may lose nested object structure')
      );
    });

    it('should warn about converting to Markdown', () => {
      registry.registerHandler('md', new MockFormatHandler('md', ['.md']));
      registry.registerHandler('xml', new MockFormatHandler('xml', ['.xml']));
      
      const result = factory.validateHandlerCompatibility('xml', 'md');
      
      expect(result.warnings).toContainEqual(
        expect.stringContaining('works best with tabular data')
      );
    });
  });

  describe('getStatistics', () => {
    it('should return factory statistics', () => {
      const stats = factory.getStatistics();
      
      expect(stats.supportedFormats).toBe(3); // csv, json, xlsx
      expect(stats.supportedExtensions).toBe(4); // .csv, .json, .xlsx, .xls
      expect(stats.registryStats).toBeDefined();
      expect(stats.registryStats.totalHandlers).toBe(3);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await expect(factory.initialize()).resolves.toBeUndefined();
    });

    it('should handle initialization errors', async () => {
      // Mock registry to throw error
      const originalMethod = registry.initializeDefaultHandlers;
      registry.initializeDefaultHandlers = jest.fn().mockRejectedValue(new Error('Init failed'));
      
      await expect(factory.initialize()).rejects.toThrow(ConversionError);
      
      // Restore original method
      registry.initializeDefaultHandlers = originalMethod;
    });
  });

  describe('edge cases', () => {
    it('should handle empty registry', () => {
      registry.clear();
      
      expect(factory.getSupportedFormats()).toHaveLength(0);
      expect(factory.getSupportedExtensions()).toHaveLength(0);
      expect(() => factory.createHandler('csv')).toThrow(ConversionError);
    });

    it('should handle file paths with multiple dots', () => {
      const handler = factory.createHandlerByFilePath('/path/to/file.backup.csv');
      expect(handler).toBe(csvHandler);
    });

    it('should handle file paths with no directory', () => {
      const handler = factory.createHandlerByFilePath('file.json');
      expect(handler).toBe(jsonHandler);
    });

    it('should extract extension correctly', () => {
      // Test the private extractExtension method through public methods
      expect(() => factory.createHandlerByFilePath('file')).toThrow(ConversionError);
      expect(() => factory.createHandlerByFilePath('file.')).toThrow(ConversionError);
    });
  });
});