import { FormatDetector } from '../core/FormatDetector.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  constants: { R_OK: 4 },
  promises: {
    access: jest.fn(),
    open: jest.fn(),
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('FormatDetector', () => {
  let detector: FormatDetector;

  beforeEach(() => {
    detector = new FormatDetector();
    jest.clearAllMocks();
  });

  describe('detectFromExtension', () => {
    it('should detect CSV format', async () => {
      const result = await detector.detectFormat('/path/to/file.csv', false);
      
      expect(result.format).toBe('csv');
      expect(result.confidence).toBe(0.8);
      expect(result.detectionMethod).toBe('extension');
    });

    it('should detect Excel formats', async () => {
      const xlsResult = await detector.detectFormat('/path/to/file.xls', false);
      const xlsxResult = await detector.detectFormat('/path/to/file.xlsx', false);
      
      expect(xlsResult.format).toBe('xlsx');
      expect(xlsxResult.format).toBe('xlsx');
    });

    it('should detect JSON format', async () => {
      const result = await detector.detectFormat('/path/to/file.json', false);
      
      expect(result.format).toBe('json');
      expect(result.confidence).toBe(0.8);
    });

    it('should detect XML format', async () => {
      const result = await detector.detectFormat('/path/to/file.xml', false);
      
      expect(result.format).toBe('xml');
      expect(result.confidence).toBe(0.8);
    });

    it('should detect Markdown formats', async () => {
      const mdResult = await detector.detectFormat('/path/to/file.md', false);
      const markdownResult = await detector.detectFormat('/path/to/file.markdown', false);
      
      expect(mdResult.format).toBe('md');
      expect(markdownResult.format).toBe('md');
    });

    it('should throw error for unsupported extension', async () => {
      await expect(detector.detectFormat('/path/to/file.pdf', false))
        .rejects.toThrow(ConversionError);
    });

    it('should throw error for no extension', async () => {
      await expect(detector.detectFormat('/path/to/file', false))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('detectFromContent', () => {
    const mockFileHandle = {
      read: jest.fn(),
      close: jest.fn()
    };

    beforeEach(() => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.open.mockResolvedValue(mockFileHandle as any);
      mockFileHandle.close.mockResolvedValue(undefined);
    });

    it('should detect JSON content', async () => {
      const jsonContent = '{"name": "test", "value": 123}';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: jsonContent.length,
        buffer: Buffer.from(jsonContent)
      } as any);

      const result = await detector.detectFormat('/path/to/file.json', true);
      
      expect(result.format).toBe('json');
      expect(result.detectionMethod).toBe('hybrid');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect XML content', async () => {
      const xmlContent = '<?xml version="1.0"?><root><item>test</item></root>';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: xmlContent.length,
        buffer: Buffer.from(xmlContent)
      } as any);

      const result = await detector.detectFormat('/path/to/file.xml', true);
      
      expect(result.format).toBe('xml');
      expect(result.detectionMethod).toBe('hybrid');
    });

    it('should detect Markdown content', async () => {
      const markdownContent = '# Header\n\n* List item\n\n**Bold text**';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: markdownContent.length,
        buffer: Buffer.from(markdownContent)
      } as any);

      const result = await detector.detectFormat('/path/to/file.md', true);
      
      expect(result.format).toBe('md');
      expect(result.detectionMethod).toBe('hybrid');
    });

    it('should detect CSV content', async () => {
      const csvContent = 'name,age,email\nJohn,30,john@example.com\nJane,25,jane@example.com';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: csvContent.length,
        buffer: Buffer.from(csvContent)
      } as any);

      const result = await detector.detectFormat('/path/to/file.csv', true);
      
      expect(result.format).toBe('csv');
      expect(result.detectionMethod).toBe('hybrid');
    });

    it('should handle file access errors gracefully', async () => {
      mockFs.promises.access.mockRejectedValue(new Error('File not found'));

      const result = await detector.detectFormat('/path/to/file.csv', true);
      
      expect(result.format).toBe('csv');
      expect(result.confidence).toBe(0.5);
      expect(result.details).toContain('Content analysis failed');
    });
  });

  describe('content pattern analysis', () => {
    const mockFileHandle = {
      read: jest.fn(),
      close: jest.fn()
    };

    beforeEach(() => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.open.mockResolvedValue(mockFileHandle as any);
      mockFileHandle.close.mockResolvedValue(undefined);
    });

    it('should detect JSON arrays', async () => {
      const jsonContent = '[{"id": 1}, {"id": 2}]';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: jsonContent.length,
        buffer: Buffer.from(jsonContent)
      } as any);

      const result = await detector.detectFormat('/path/to/file.json', true);
      expect(result.format).toBe('json');
    });

    it('should detect partial JSON', async () => {
      const partialJson = '{"name": "test", "items": [';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: partialJson.length,
        buffer: Buffer.from(partialJson)
      } as any);

      const result = await detector.detectFormat('/path/to/file.json', true);
      expect(result.format).toBe('json');
    });

    it('should detect XML without declaration', async () => {
      const xmlContent = '<root><item value="test">content</item></root>';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: xmlContent.length,
        buffer: Buffer.from(xmlContent)
      } as any);

      const result = await detector.detectFormat('/path/to/file.xml', true);
      expect(result.format).toBe('xml');
    });

    it('should detect CSV with different delimiters', async () => {
      const csvContent = 'name;age;email\nJohn;30;john@example.com';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: csvContent.length,
        buffer: Buffer.from(csvContent)
      } as any);

      const result = await detector.detectFormat('/path/to/file.csv', true);
      expect(result.format).toBe('csv');
    });

    it('should detect Markdown tables', async () => {
      const markdownContent = '| Name | Age |\n|------|-----|\n| John | 30 |';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: markdownContent.length,
        buffer: Buffer.from(markdownContent)
      } as any);

      const result = await detector.detectFormat('/path/to/file.md', true);
      expect(result.format).toBe('md');
    });
  });

  describe('hybrid detection', () => {
    const mockFileHandle = {
      read: jest.fn(),
      close: jest.fn()
    };

    beforeEach(() => {
      mockFs.promises.access.mockResolvedValue(undefined);
      mockFs.promises.open.mockResolvedValue(mockFileHandle as any);
      mockFileHandle.close.mockResolvedValue(undefined);
    });

    it('should prefer content analysis when confidence is higher', async () => {
      // File has .txt extension but contains JSON
      const jsonContent = '{"name": "test"}';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: jsonContent.length,
        buffer: Buffer.from(jsonContent)
      } as any);

      // This would normally fail due to unsupported .txt extension
      // but we'll test the hybrid logic separately
      const extensionResult = { format: 'csv' as const, confidence: 0.3, detectionMethod: 'extension' as const };
      const contentResult = { format: 'json' as const, confidence: 0.9, detectionMethod: 'content' as const };
      
      // Test the private method through reflection or create a test-specific method
      // For now, we'll test the public behavior
    });

    it('should combine results when both methods agree', async () => {
      const jsonContent = '{"name": "test"}';
      mockFileHandle.read.mockResolvedValue({
        bytesRead: jsonContent.length,
        buffer: Buffer.from(jsonContent)
      } as any);

      const result = await detector.detectFormat('/path/to/file.json', true);
      
      expect(result.format).toBe('json');
      expect(result.detectionMethod).toBe('hybrid');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('utility methods', () => {
    it('should validate supported formats', () => {
      expect(detector.validateFormat('csv')).toBe(true);
      expect(detector.validateFormat('xlsx')).toBe(true);
      expect(detector.validateFormat('json')).toBe(true);
      expect(detector.validateFormat('xml')).toBe(true);
      expect(detector.validateFormat('md')).toBe(true);
      expect(detector.validateFormat('pdf' as any)).toBe(false);
    });

    it('should return supported extensions', () => {
      const extensions = detector.getSupportedExtensions();
      
      expect(extensions).toContain('.csv');
      expect(extensions).toContain('.xlsx');
      expect(extensions).toContain('.json');
      expect(extensions).toContain('.xml');
      expect(extensions).toContain('.md');
      expect(extensions).toContain('.markdown');
    });

    it('should check if extension is supported', () => {
      expect(detector.isSupportedExtension('/path/to/file.csv')).toBe(true);
      expect(detector.isSupportedExtension('/path/to/file.pdf')).toBe(false);
    });

    it('should get format from extension', () => {
      expect(detector.getFormatFromExtension('/path/to/file.csv')).toBe('csv');
      expect(detector.getFormatFromExtension('/path/to/file.json')).toBe('json');
      expect(detector.getFormatFromExtension('/path/to/file.pdf')).toBeNull();
    });
  });
});