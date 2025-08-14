import { DataStructureImpl } from '../models/DataStructure.js';

describe('DataStructureImpl', () => {
  describe('constructor', () => {
    it('should create a data structure with headers', () => {
      const rows = [
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ];
      const headers = ['name', 'age', 'email'];
      
      const data = new DataStructureImpl(rows, 'csv', 'utf-8', headers);
      
      expect(data.rows).toEqual(rows);
      expect(data.headers).toEqual(headers);
      expect(data.metadata.originalFormat).toBe('csv');
      expect(data.metadata.encoding).toBe('utf-8');
      expect(data.metadata.totalRows).toBe(2);
      expect(data.metadata.totalColumns).toBe(3);
    });

    it('should create a data structure without headers', () => {
      const rows = [
        { col1: 'value1', col2: 'value2' },
        { col1: 'value3', col2: 'value4', col3: 'value5' }
      ];
      
      const data = new DataStructureImpl(rows, 'json');
      
      expect(data.rows).toEqual(rows);
      expect(data.headers).toBeUndefined();
      expect(data.metadata.totalColumns).toBe(3); // Max columns from rows
    });

    it('should handle empty rows', () => {
      const data = new DataStructureImpl([], 'csv');
      
      expect(data.rows).toEqual([]);
      expect(data.metadata.totalRows).toBe(0);
      expect(data.metadata.totalColumns).toBe(0);
    });
  });

  describe('validate', () => {
    it('should validate a correct data structure', () => {
      const rows = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 }
      ];
      const headers = ['name', 'age'];
      
      const data = new DataStructureImpl(rows, 'csv', 'utf-8', headers);
      const result = data.validate();
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing metadata', () => {
      const data = new DataStructureImpl([{ test: 'value' }], 'csv');
      // Manually remove metadata to test validation
      (data as any).metadata = null;
      
      const result = data.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_METADATA',
          message: 'Metadata is required'
        })
      );
    });

    it('should detect duplicate headers', () => {
      const rows = [{ name: 'John', age: 30 }];
      const headers = ['name', 'age', 'name']; // Duplicate 'name'
      
      const data = new DataStructureImpl(rows, 'csv', 'utf-8', headers);
      const result = data.validate();
      
      expect(result.isValid).toBe(true); // Still valid, but has warnings
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'DUPLICATE_HEADERS',
          message: 'Duplicate headers found: name'
        })
      );
    });

    it('should detect empty headers', () => {
      const rows = [{ name: 'John', age: 30 }];
      const headers = ['name', '', 'age']; // Empty header
      
      const data = new DataStructureImpl(rows, 'csv', 'utf-8', headers);
      const result = data.validate();
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_HEADERS',
          message: 'Some headers are empty or contain only whitespace'
        })
      );
    });

    it('should detect invalid rows', () => {
      const rows = [
        { name: 'John', age: 30 },
        null, // Invalid row
        { name: 'Jane', age: 25 }
      ] as any;
      
      const data = new DataStructureImpl(rows, 'csv');
      const result = data.validate();
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_ROW',
          message: 'Row 1 is not a valid object',
          row: 1
        })
      );
    });

    it('should detect empty rows', () => {
      const rows = [
        { name: 'John', age: 30 },
        {}, // Empty row
        { name: 'Jane', age: 25 }
      ];
      
      const data = new DataStructureImpl(rows, 'csv');
      const result = data.validate();
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_ROW',
          message: 'Row 1 is empty',
          row: 1
        })
      );
    });

    it('should detect missing fields when headers are defined', () => {
      const rows = [
        { name: 'John', age: 30 },
        { name: 'Jane' }, // Missing 'age' field
      ];
      const headers = ['name', 'age'];
      
      const data = new DataStructureImpl(rows, 'csv', 'utf-8', headers);
      const result = data.validate();
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_FIELDS',
          message: 'Row 1 missing fields: age',
          row: 1
        })
      );
    });

    it('should detect extra fields when headers are defined', () => {
      const rows = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25, email: 'jane@example.com' }, // Extra 'email' field
      ];
      const headers = ['name', 'age'];
      
      const data = new DataStructureImpl(rows, 'csv', 'utf-8', headers);
      const result = data.validate();
      
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EXTRA_FIELDS',
          message: 'Row 1 has extra fields: email',
          row: 1
        })
      );
    });
  });

  describe('utility methods', () => {
    let data: DataStructureImpl;

    beforeEach(() => {
      const rows = [
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' },
        { name: 'Bob', age: 35, email: 'bob@example.com' }
      ];
      const headers = ['name', 'age', 'email'];
      data = new DataStructureImpl(rows, 'csv', 'utf-8', headers, 'Sheet1');
    });

    it('should get summary', () => {
      const summary = data.getSummary();
      
      expect(summary).toEqual({
        rowCount: 3,
        columnCount: 3,
        hasHeaders: true,
        format: 'csv',
        encoding: 'utf-8',
        sheetName: 'Sheet1'
      });
    });

    it('should get column names from headers', () => {
      const columns = data.getColumnNames();
      expect(columns).toEqual(['name', 'age', 'email']);
    });

    it('should get column names from first row when no headers', () => {
      const dataWithoutHeaders = new DataStructureImpl(
        [{ col1: 'value1', col2: 'value2' }],
        'json'
      );
      
      const columns = dataWithoutHeaders.getColumnNames();
      expect(columns).toEqual(['col1', 'col2']);
    });

    it('should get sample data', () => {
      const sample = data.getSample(2);
      
      expect(sample).toHaveLength(2);
      expect(sample[0]).toEqual({ name: 'John', age: 30, email: 'john@example.com' });
      expect(sample[1]).toEqual({ name: 'Jane', age: 25, email: 'jane@example.com' });
    });

    it('should clone data structure', () => {
      const cloned = data.clone();
      
      expect(cloned).not.toBe(data);
      expect(cloned.rows).toEqual(data.rows);
      expect(cloned.headers).toEqual(data.headers);
      expect(cloned.metadata).toEqual(data.metadata);
      
      // Verify deep clone
      cloned.rows[0].name = 'Modified';
      expect(data.rows[0].name).toBe('John');
    });

    it('should convert to plain object', () => {
      const plain = data.toPlainObject();
      
      expect(plain.headers).toEqual(data.headers);
      expect(plain.rows).toEqual(data.rows);
      expect(plain.metadata).toEqual(data.metadata);
    });
  });
});