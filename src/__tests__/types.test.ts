import { DataStructure, ConversionRequest, SupportedFormat } from '../types/index.js';

describe('Types', () => {
  describe('DataStructure', () => {
    it('should create a valid data structure', () => {
      const data: DataStructure = {
        headers: ['name', 'age', 'email'],
        rows: [
          { name: 'John', age: 30, email: 'john@example.com' },
          { name: 'Jane', age: 25, email: 'jane@example.com' }
        ],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 3
        }
      };

      expect(data.headers).toHaveLength(3);
      expect(data.rows).toHaveLength(2);
      expect(data.metadata.originalFormat).toBe('csv');
    });
  });

  describe('ConversionRequest', () => {
    it('should create a valid conversion request', () => {
      const request: ConversionRequest = {
        sourcePath: '/path/to/input.csv',
        targetFormat: 'json',
        outputPath: '/path/to/output.json'
      };

      expect(request.sourcePath).toBe('/path/to/input.csv');
      expect(request.targetFormat).toBe('json');
      expect(request.outputPath).toBe('/path/to/output.json');
    });
  });

  describe('SupportedFormat', () => {
    it('should include all expected formats', () => {
      const formats: SupportedFormat[] = ['csv', 'xlsx', 'json', 'xml', 'md'];
      
      formats.forEach(format => {
        expect(['csv', 'xlsx', 'json', 'xml', 'md']).toContain(format);
      });
    });
  });
});