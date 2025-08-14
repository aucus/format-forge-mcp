import { ConversionResponseImpl } from '../models/ConversionResponse.js';

describe('ConversionResponseImpl', () => {
  describe('constructor', () => {
    it('should create a basic response', () => {
      const response = new ConversionResponseImpl(true, 'Success', '/path/to/output.json');
      
      expect(response.success).toBe(true);
      expect(response.message).toBe('Success');
      expect(response.outputPath).toBe('/path/to/output.json');
      expect(response.warnings).toBeUndefined();
    });

    it('should create a response with warnings', () => {
      const warnings = ['Warning 1', 'Warning 2'];
      const response = new ConversionResponseImpl(true, 'Success', '/path/to/output.json', warnings);
      
      expect(response.success).toBe(true);
      expect(response.warnings).toEqual(warnings);
    });
  });

  describe('static factory methods', () => {
    it('should create a success response', () => {
      const response = ConversionResponseImpl.success('/path/to/output.json');
      
      expect(response.success).toBe(true);
      expect(response.message).toBe('Conversion completed successfully');
      expect(response.outputPath).toBe('/path/to/output.json');
      expect(response.warnings).toBeUndefined();
    });

    it('should create a success response with custom message', () => {
      const response = ConversionResponseImpl.success(
        '/path/to/output.json',
        'Custom success message'
      );
      
      expect(response.success).toBe(true);
      expect(response.message).toBe('Custom success message');
      expect(response.outputPath).toBe('/path/to/output.json');
    });

    it('should create a success response with warnings', () => {
      const warnings = ['Some data was modified', 'Headers were normalized'];
      const response = ConversionResponseImpl.success(
        '/path/to/output.json',
        'Success with warnings',
        warnings
      );
      
      expect(response.success).toBe(true);
      expect(response.message).toBe('Success with warnings');
      expect(response.warnings).toEqual(warnings);
    });

    it('should create a failure response', () => {
      const response = ConversionResponseImpl.failure('Conversion failed');
      
      expect(response.success).toBe(false);
      expect(response.message).toBe('Conversion failed');
      expect(response.outputPath).toBeUndefined();
      expect(response.warnings).toBeUndefined();
    });

    it('should create a failure response with warnings', () => {
      const warnings = ['Partial data processed', 'Some rows skipped'];
      const response = ConversionResponseImpl.failure('Conversion failed', warnings);
      
      expect(response.success).toBe(false);
      expect(response.message).toBe('Conversion failed');
      expect(response.warnings).toEqual(warnings);
    });

    it('should create a partial success response', () => {
      const warnings = ['Some data was corrupted', 'Missing values filled with defaults'];
      const response = ConversionResponseImpl.partialSuccess(
        '/path/to/output.json',
        'Conversion completed with issues',
        warnings
      );
      
      expect(response.success).toBe(true);
      expect(response.message).toBe('Conversion completed with issues');
      expect(response.outputPath).toBe('/path/to/output.json');
      expect(response.warnings).toEqual(warnings);
    });
  });

  describe('warning management', () => {
    let response: ConversionResponseImpl;

    beforeEach(() => {
      response = ConversionResponseImpl.success('/path/to/output.json');
    });

    it('should add a single warning', () => {
      response.addWarning('Test warning');
      
      expect(response.warnings).toEqual(['Test warning']);
      expect(response.hasWarnings()).toBe(true);
      expect(response.getWarningCount()).toBe(1);
    });

    it('should add multiple warnings individually', () => {
      response.addWarning('Warning 1');
      response.addWarning('Warning 2');
      
      expect(response.warnings).toEqual(['Warning 1', 'Warning 2']);
      expect(response.getWarningCount()).toBe(2);
    });

    it('should add multiple warnings at once', () => {
      const warnings = ['Warning 1', 'Warning 2', 'Warning 3'];
      response.addWarnings(warnings);
      
      expect(response.warnings).toEqual(warnings);
      expect(response.getWarningCount()).toBe(3);
    });

    it('should add warnings to existing warnings', () => {
      response.addWarning('Initial warning');
      response.addWarnings(['Additional warning 1', 'Additional warning 2']);
      
      expect(response.warnings).toEqual([
        'Initial warning',
        'Additional warning 1',
        'Additional warning 2'
      ]);
      expect(response.getWarningCount()).toBe(3);
    });

    it('should handle hasWarnings correctly', () => {
      expect(response.hasWarnings()).toBe(false);
      
      response.addWarning('Test warning');
      expect(response.hasWarnings()).toBe(true);
    });

    it('should handle getWarningCount correctly', () => {
      expect(response.getWarningCount()).toBe(0);
      
      response.addWarning('Warning 1');
      expect(response.getWarningCount()).toBe(1);
      
      response.addWarnings(['Warning 2', 'Warning 3']);
      expect(response.getWarningCount()).toBe(3);
    });
  });

  describe('getSummary', () => {
    it('should format success summary without warnings', () => {
      const response = ConversionResponseImpl.success(
        '/path/to/output.json',
        'Conversion completed'
      );
      
      const summary = response.getSummary();
      
      expect(summary).toBe(
        'Conversion succeeded: Conversion completed\n' +
        'Output: /path/to/output.json'
      );
    });

    it('should format failure summary', () => {
      const response = ConversionResponseImpl.failure('File not found');
      
      const summary = response.getSummary();
      
      expect(summary).toBe('Conversion failed: File not found');
    });

    it('should format summary with warnings', () => {
      const response = ConversionResponseImpl.success(
        '/path/to/output.json',
        'Conversion completed'
      );
      response.addWarnings(['Data normalized', 'Empty rows removed']);
      
      const summary = response.getSummary();
      
      expect(summary).toBe(
        'Conversion succeeded: Conversion completed\n' +
        'Output: /path/to/output.json\n' +
        'Warnings (2):\n' +
        '  1. Data normalized\n' +
        '  2. Empty rows removed'
      );
    });

    it('should format failure summary with warnings', () => {
      const response = ConversionResponseImpl.failure('Partial failure');
      response.addWarning('Some data was processed');
      
      const summary = response.getSummary();
      
      expect(summary).toBe(
        'Conversion failed: Partial failure\n' +
        'Warnings (1):\n' +
        '  1. Some data was processed'
      );
    });
  });

  describe('toPlainObject', () => {
    it('should convert to plain object', () => {
      const response = ConversionResponseImpl.success(
        '/path/to/output.json',
        'Success message',
        ['Warning 1', 'Warning 2']
      );
      
      const plain = response.toPlainObject();
      
      expect(plain).toEqual({
        success: true,
        message: 'Success message',
        outputPath: '/path/to/output.json',
        warnings: ['Warning 1', 'Warning 2']
      });
    });

    it('should handle response without warnings', () => {
      const response = ConversionResponseImpl.failure('Error message');
      
      const plain = response.toPlainObject();
      
      expect(plain).toEqual({
        success: false,
        message: 'Error message',
        outputPath: undefined,
        warnings: undefined
      });
    });
  });

  describe('toJSON', () => {
    it('should convert to JSON string', () => {
      const response = ConversionResponseImpl.success(
        '/path/to/output.json',
        'Success',
        ['Warning']
      );
      
      const json = response.toJSON();
      const parsed = JSON.parse(json);
      
      expect(parsed).toEqual({
        success: true,
        message: 'Success',
        outputPath: '/path/to/output.json',
        warnings: ['Warning']
      });
    });
  });
});