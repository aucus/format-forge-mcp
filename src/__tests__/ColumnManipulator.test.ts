import { ColumnManipulator } from '../transformers/ColumnManipulator.js';
import { DataStructure, ColumnOperation } from '../types/index.js';

describe('ColumnManipulator', () => {
  let manipulator: ColumnManipulator;
  let sampleData: DataStructure;

  beforeEach(() => {
    manipulator = new ColumnManipulator();
    sampleData = {
      rows: [
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' },
        { name: 'Bob', age: 35, email: 'bob@example.com' }
      ],
      headers: ['name', 'age', 'email'],
      metadata: {
        originalFormat: 'csv',
        encoding: 'utf-8',
        totalRows: 3,
        totalColumns: 3
      }
    };
  });

  describe('addColumn', () => {
    it('should add a column with static default value', () => {
      const operation: ColumnOperation = {
        type: 'add',
        columnName: 'status',
        defaultValue: 'active'
      };

      const result = manipulator.addColumn(sampleData, operation);

      expect(result.headers).toEqual(['name', 'age', 'email', 'status']);
      expect(result.rows[0]).toEqual({
        name: 'John',
        age: 30,
        email: 'john@example.com',
        status: 'active'
      });
      expect(result.metadata.totalColumns).toBe(4);
    });

    it('should add a column with function default value', () => {
      const operation: ColumnOperation = {
        type: 'add',
        columnName: 'fullName',
        defaultValue: (row: Record<string, any>) => `${row.name} (${row.age})`
      };

      const result = manipulator.addColumn(sampleData, operation);

      expect(result.rows[0].fullName).toBe('John (30)');
      expect(result.rows[1].fullName).toBe('Jane (25)');
    });

    it('should add a column with undefined default value', () => {
      const operation: ColumnOperation = {
        type: 'add',
        columnName: 'phone'
      };

      const result = manipulator.addColumn(sampleData, operation);

      expect(result.rows[0].phone).toBeUndefined();
      expect(result.headers).toContain('phone');
    });

    it('should throw error if column already exists', () => {
      const operation: ColumnOperation = {
        type: 'add',
        columnName: 'name',
        defaultValue: 'test'
      };

      expect(() => manipulator.addColumn(sampleData, operation))
        .toThrow("Column 'name' already exists");
    });

    it('should throw error if column name is missing', () => {
      const operation: ColumnOperation = {
        type: 'add',
        columnName: '',
        defaultValue: 'test'
      };

      expect(() => manipulator.addColumn(sampleData, operation))
        .toThrow('Column name is required for add operation');
    });

    it('should work with data without headers', () => {
      const dataWithoutHeaders: DataStructure = {
        rows: [{ name: 'John', age: 30 }],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const operation: ColumnOperation = {
        type: 'add',
        columnName: 'status',
        defaultValue: 'active'
      };

      const result = manipulator.addColumn(dataWithoutHeaders, operation);

      expect(result.headers).toBeUndefined();
      expect(result.rows[0]).toEqual({
        name: 'John',
        age: 30,
        status: 'active'
      });
      expect(result.metadata.totalColumns).toBe(3);
    });
  });

  describe('removeColumn', () => {
    it('should remove an existing column', () => {
      const operation: ColumnOperation = {
        type: 'remove',
        columnName: 'email'
      };

      const result = manipulator.removeColumn(sampleData, operation);

      expect(result.headers).toEqual(['name', 'age']);
      expect(result.rows[0]).toEqual({
        name: 'John',
        age: 30
      });
      expect(result.metadata.totalColumns).toBe(2);
    });

    it('should handle removing non-existent column gracefully', () => {
      const operation: ColumnOperation = {
        type: 'remove',
        columnName: 'nonexistent'
      };

      const result = manipulator.removeColumn(sampleData, operation);

      // Should return original data unchanged
      expect(result).toEqual(sampleData);
    });

    it('should throw error if column name is missing', () => {
      const operation: ColumnOperation = {
        type: 'remove',
        columnName: ''
      };

      expect(() => manipulator.removeColumn(sampleData, operation))
        .toThrow('Column name is required for remove operation');
    });

    it('should work with data without headers', () => {
      const dataWithoutHeaders: DataStructure = {
        rows: [{ name: 'John', age: 30, email: 'john@example.com' }],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 3
        }
      };

      const operation: ColumnOperation = {
        type: 'remove',
        columnName: 'email'
      };

      const result = manipulator.removeColumn(dataWithoutHeaders, operation);

      expect(result.headers).toBeUndefined();
      expect(result.rows[0]).toEqual({
        name: 'John',
        age: 30
      });
      expect(result.metadata.totalColumns).toBe(2);
    });
  });

  describe('renameColumn', () => {
    it('should rename an existing column', () => {
      const operation: ColumnOperation = {
        type: 'rename',
        columnName: 'email',
        newName: 'emailAddress'
      };

      const result = manipulator.renameColumn(sampleData, operation);

      expect(result.headers).toEqual(['name', 'age', 'emailAddress']);
      expect(result.rows[0]).toEqual({
        name: 'John',
        age: 30,
        emailAddress: 'john@example.com'
      });
      expect(result.metadata.totalColumns).toBe(3);
    });

    it('should throw error if source column does not exist', () => {
      const operation: ColumnOperation = {
        type: 'rename',
        columnName: 'nonexistent',
        newName: 'newName'
      };

      expect(() => manipulator.renameColumn(sampleData, operation))
        .toThrow("Column 'nonexistent' does not exist");
    });

    it('should throw error if target name already exists', () => {
      const operation: ColumnOperation = {
        type: 'rename',
        columnName: 'email',
        newName: 'name'
      };

      expect(() => manipulator.renameColumn(sampleData, operation))
        .toThrow("Column 'name' already exists");
    });

    it('should throw error if column name is missing', () => {
      const operation: ColumnOperation = {
        type: 'rename',
        columnName: '',
        newName: 'newName'
      };

      expect(() => manipulator.renameColumn(sampleData, operation))
        .toThrow('Column name is required for rename operation');
    });

    it('should throw error if new name is missing', () => {
      const operation: ColumnOperation = {
        type: 'rename',
        columnName: 'email',
        newName: ''
      };

      expect(() => manipulator.renameColumn(sampleData, operation))
        .toThrow('New name is required for rename operation');
    });
  });

  describe('manipulateColumns', () => {
    it('should apply multiple operations in sequence', () => {
      const operations: ColumnOperation[] = [
        { type: 'add', columnName: 'status', defaultValue: 'active' },
        { type: 'rename', columnName: 'email', newName: 'emailAddress' },
        { type: 'remove', columnName: 'age' }
      ];

      const result = manipulator.manipulateColumns(sampleData, operations);

      expect(result.headers).toEqual(['name', 'emailAddress', 'status']);
      expect(result.rows[0]).toEqual({
        name: 'John',
        emailAddress: 'john@example.com',
        status: 'active'
      });
      expect(result.metadata.totalColumns).toBe(3);
    });

    it('should handle empty operations array', () => {
      const result = manipulator.manipulateColumns(sampleData, []);
      expect(result).toEqual(sampleData);
    });

    it('should throw error for invalid operation', () => {
      const operations: ColumnOperation[] = [
        { type: 'add', columnName: 'duplicate', defaultValue: 'test' },
        { type: 'add', columnName: 'duplicate', defaultValue: 'test2' }
      ];

      expect(() => manipulator.manipulateColumns(sampleData, operations))
        .toThrow("Column 'duplicate' already exists");
    });
  });

  describe('reorderColumns', () => {
    it('should reorder columns according to specified order', () => {
      const newOrder = ['email', 'name', 'age'];
      const result = manipulator.reorderColumns(sampleData, newOrder);

      expect(result.headers).toEqual(['email', 'name', 'age']);
      expect(result.rows[0]).toEqual({
        email: 'john@example.com',
        name: 'John',
        age: 30
      });
    });

    it('should include unmentioned columns at the end', () => {
      const newOrder = ['email'];
      const result = manipulator.reorderColumns(sampleData, newOrder);

      expect(result.headers).toEqual(['email', 'name', 'age']);
    });

    it('should throw error for non-existent columns', () => {
      const newOrder = ['email', 'nonexistent', 'name'];
      
      expect(() => manipulator.reorderColumns(sampleData, newOrder))
        .toThrow('Columns not found: nonexistent');
    });
  });

  describe('selectColumns', () => {
    it('should select specified columns only', () => {
      const columnNames = ['name', 'email'];
      const result = manipulator.selectColumns(sampleData, columnNames);

      expect(result.headers).toEqual(['name', 'email']);
      expect(result.rows[0]).toEqual({
        name: 'John',
        email: 'john@example.com'
      });
      expect(result.metadata.totalColumns).toBe(2);
    });

    it('should throw error for non-existent columns', () => {
      const columnNames = ['name', 'nonexistent'];
      
      expect(() => manipulator.selectColumns(sampleData, columnNames))
        .toThrow('Columns not found: nonexistent');
    });
  });

  describe('transformColumn', () => {
    it('should transform column values using provided function', () => {
      const transformer = (value: any) => String(value).toUpperCase();
      const result = manipulator.transformColumn(sampleData, 'name', transformer);

      expect(result.rows[0].name).toBe('JOHN');
      expect(result.rows[1].name).toBe('JANE');
      expect(result.rows[2].name).toBe('BOB');
    });

    it('should provide row and index to transformer function', () => {
      const transformer = (value: any, row: Record<string, any>, index: number) => 
        `${value} (${row.age}) [${index}]`;
      
      const result = manipulator.transformColumn(sampleData, 'name', transformer);

      expect(result.rows[0].name).toBe('John (30) [0]');
      expect(result.rows[1].name).toBe('Jane (25) [1]');
    });

    it('should throw error for non-existent column', () => {
      const transformer = (value: any) => value;
      
      expect(() => manipulator.transformColumn(sampleData, 'nonexistent', transformer))
        .toThrow("Column 'nonexistent' does not exist");
    });
  });

  describe('splitColumn', () => {
    it('should split column by separator', () => {
      const dataWithFullName: DataStructure = {
        rows: [
          { fullName: 'John Doe', age: 30 },
          { fullName: 'Jane Smith', age: 25 }
        ],
        headers: ['fullName', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 2
        }
      };

      const result = manipulator.splitColumn(
        dataWithFullName,
        'fullName',
        ' ',
        ['firstName', 'lastName']
      );

      expect(result.headers).toEqual(['fullName', 'age', 'firstName', 'lastName']);
      expect(result.rows[0]).toEqual({
        fullName: 'John Doe',
        age: 30,
        firstName: 'John',
        lastName: 'Doe'
      });
    });

    it('should handle insufficient split parts', () => {
      const dataWithSingleName: DataStructure = {
        rows: [{ name: 'John', age: 30 }],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = manipulator.splitColumn(
        dataWithSingleName,
        'name',
        ' ',
        ['firstName', 'lastName']
      );

      expect(result.rows[0]).toEqual({
        name: 'John',
        age: 30,
        firstName: 'John',
        lastName: null
      });
    });

    it('should throw error for existing column names', () => {
      expect(() => manipulator.splitColumn(sampleData, 'name', ' ', ['age', 'newCol']))
        .toThrow('Column names already exist: age');
    });
  });

  describe('mergeColumns', () => {
    it('should merge columns with separator', () => {
      const dataWithNames: DataStructure = {
        rows: [
          { firstName: 'John', lastName: 'Doe', age: 30 },
          { firstName: 'Jane', lastName: 'Smith', age: 25 }
        ],
        headers: ['firstName', 'lastName', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 3
        }
      };

      const result = manipulator.mergeColumns(
        dataWithNames,
        ['firstName', 'lastName'],
        'fullName',
        ' '
      );

      expect(result.headers).toEqual(['firstName', 'lastName', 'age', 'fullName']);
      expect(result.rows[0].fullName).toBe('John Doe');
      expect(result.rows[1].fullName).toBe('Jane Smith');
    });

    it('should handle null values in merge', () => {
      const dataWithNulls: DataStructure = {
        rows: [
          { firstName: 'John', lastName: null, age: 30 },
          { firstName: null, lastName: 'Smith', age: 25 }
        ],
        headers: ['firstName', 'lastName', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 3
        }
      };

      const result = manipulator.mergeColumns(
        dataWithNulls,
        ['firstName', 'lastName'],
        'fullName',
        ' '
      );

      expect(result.rows[0].fullName).toBe('John');
      expect(result.rows[1].fullName).toBe('Smith');
    });

    it('should throw error for existing target column', () => {
      expect(() => manipulator.mergeColumns(sampleData, ['name', 'age'], 'email', ' '))
        .toThrow("Column 'email' already exists");
    });
  });

  describe('validateOperations', () => {
    it('should validate correct operations', () => {
      const operations: ColumnOperation[] = [
        { type: 'add', columnName: 'status', defaultValue: 'active' },
        { type: 'rename', columnName: 'email', newName: 'emailAddress' }
      ];

      const result = manipulator.validateOperations(sampleData, operations);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect errors in operations', () => {
      const operations: ColumnOperation[] = [
        { type: 'add', columnName: 'name', defaultValue: 'test' }, // Duplicate
        { type: 'remove', columnName: '' }, // Missing name
        { type: 'rename', columnName: 'nonexistent', newName: 'test' } // Non-existent source
      ];

      const result = manipulator.validateOperations(sampleData, operations);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
      expect(result.errors[0]).toContain("Column 'name' already exists");
      expect(result.errors[1]).toContain('Column name is required');
      expect(result.errors[2]).toContain("Column 'nonexistent' does not exist");
    });

    it('should detect warnings for non-critical issues', () => {
      const operations: ColumnOperation[] = [
        { type: 'remove', columnName: 'nonexistent' }
      ];

      const result = manipulator.validateOperations(sampleData, operations);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Column 'nonexistent' does not exist");
    });
  });

  describe('getColumnStatistics', () => {
    it('should return statistics for all columns', () => {
      const stats = manipulator.getColumnStatistics(sampleData);

      expect(stats).toHaveLength(3);
      expect(stats[0]).toEqual({
        name: 'name',
        type: 'string',
        nullCount: 0,
        uniqueCount: 3,
        sampleValues: ['John', 'Jane', 'Bob']
      });
      expect(stats[1]).toEqual({
        name: 'age',
        type: 'number',
        nullCount: 0,
        uniqueCount: 3,
        sampleValues: [30, 25, 35]
      });
    });

    it('should handle null values in statistics', () => {
      const dataWithNulls: DataStructure = {
        rows: [
          { name: 'John', age: null },
          { name: null, age: 25 },
          { name: 'John', age: 30 }
        ],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 3,
          totalColumns: 2
        }
      };

      const stats = manipulator.getColumnStatistics(dataWithNulls);

      expect(stats[0].nullCount).toBe(1);
      expect(stats[0].uniqueCount).toBe(1); // Only 'John'
      expect(stats[1].nullCount).toBe(1);
      expect(stats[1].uniqueCount).toBe(2); // 25 and 30
    });
  });

  describe('static factory methods', () => {
    it('should create add operation', () => {
      const operation = ColumnManipulator.createAddOperation('status', 'active');
      
      expect(operation).toEqual({
        type: 'add',
        columnName: 'status',
        defaultValue: 'active'
      });
    });

    it('should create remove operation', () => {
      const operation = ColumnManipulator.createRemoveOperation('email');
      
      expect(operation).toEqual({
        type: 'remove',
        columnName: 'email'
      });
    });

    it('should create rename operation', () => {
      const operation = ColumnManipulator.createRenameOperation('email', 'emailAddress');
      
      expect(operation).toEqual({
        type: 'rename',
        columnName: 'email',
        newName: 'emailAddress'
      });
    });
  });
});