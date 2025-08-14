import { DataFilter } from '../transformers/DataFilter.js';
import { DataStructure, FilterCriteria, ColumnFilter, DateRange } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';

describe('DataFilter', () => {
  let filter: DataFilter;
  let sampleData: DataStructure;

  beforeEach(() => {
    filter = new DataFilter();
    sampleData = {
      rows: [
        { name: 'John', age: 30, email: 'john@example.com', joinDate: '2023-01-15', active: true },
        { name: 'Jane', age: 25, email: 'jane@example.com', joinDate: '2023-03-20', active: true },
        { name: 'Bob', age: 35, email: 'bob@example.com', joinDate: '2022-12-10', active: false },
        { name: 'Alice', age: 28, email: 'alice@example.com', joinDate: '2023-02-05', active: true },
        { name: 'Charlie', age: 42, email: 'charlie@example.com', joinDate: '2022-11-30', active: false }
      ],
      headers: ['name', 'age', 'email', 'joinDate', 'active'],
      metadata: {
        originalFormat: 'csv',
        encoding: 'utf-8',
        totalRows: 5,
        totalColumns: 5
      }
    };
  });

  describe('filterData', () => {
    it('should apply column filters correctly', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'greaterThan', value: 30 }
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('Bob');
      expect(result.rows[1].name).toBe('Charlie');
      expect(result.metadata.totalRows).toBe(2);
    });

    it('should apply multiple column filters with AND logic', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'greaterThan', value: 25 },
          { columnName: 'active', operator: 'equals', value: true }
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('John');
      expect(result.rows[1].name).toBe('Alice');
    });

    it('should apply date range filter', () => {
      const criteria: FilterCriteria = {
        dateRange: {
          dateColumn: 'joinDate',
          startDate: '2023-01-01',
          endDate: '2023-02-28'
        }
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('John');
      expect(result.rows[1].name).toBe('Alice');
    });

    it('should apply custom conditions', () => {
      const criteria: FilterCriteria = {
        customConditions: [
          'age >= 30',
          'active === true'
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('John');
    });

    it('should combine all filter types', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'greaterThan', value: 20 }
        ],
        dateRange: {
          dateColumn: 'joinDate',
          startDate: '2023-01-01',
          endDate: '2023-12-31'
        },
        customConditions: [
          'active === true'
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(3);
      expect(result.rows.every(row => row.active === true)).toBe(true);
      expect(result.rows.every(row => new Date(row.joinDate).getFullYear() === 2023)).toBe(true);
    });

    it('should return empty result when no rows match', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'greaterThan', value: 100 }
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(0);
      expect(result.metadata.totalRows).toBe(0);
    });
  });

  describe('column filter operators', () => {
    it('should handle equals operator', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'name', operator: 'equals', value: 'John' }
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('John');
    });

    it('should handle contains operator', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'email', operator: 'contains', value: 'example' }
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(5); // All emails contain 'example'
    });

    it('should handle contains operator case-insensitively', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'name', operator: 'contains', value: 'JOHN' }
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('John');
    });

    it('should handle lessThan operator', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'lessThan', value: 30 }
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('Jane');
      expect(result.rows[1].name).toBe('Alice');
    });

    it('should handle between operator', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'between', value: [25, 35] }
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(4);
      expect(result.rows.every(row => row.age >= 25 && row.age <= 35)).toBe(true);
    });

    it('should throw error for invalid between operator value', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'between', value: 25 } // Should be array
        ]
      };

      expect(() => filter.filterData(sampleData, criteria))
        .toThrow('Between operator requires an array of two values');
    });

    it('should throw error for unknown operator', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'unknown' as any, value: 25 }
        ]
      };

      expect(() => filter.filterData(sampleData, criteria))
        .toThrow('Unknown filter operator: unknown');
    });
  });

  describe('date range filtering', () => {
    it('should filter by date range correctly', () => {
      const criteria: FilterCriteria = {
        dateRange: {
          dateColumn: 'joinDate',
          startDate: '2023-01-01',
          endDate: '2023-02-28'
        }
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(2);
      expect(result.rows.every(row => {
        const date = new Date(row.joinDate);
        return date >= new Date('2023-01-01') && date <= new Date('2023-02-28');
      })).toBe(true);
    });

    it('should throw error for invalid start date', () => {
      const criteria: FilterCriteria = {
        dateRange: {
          dateColumn: 'joinDate',
          startDate: 'invalid-date',
          endDate: '2023-12-31'
        }
      };

      expect(() => filter.filterData(sampleData, criteria))
        .toThrow('Invalid date format in date range filter');
    });

    it('should throw error for invalid end date', () => {
      const criteria: FilterCriteria = {
        dateRange: {
          dateColumn: 'joinDate',
          startDate: '2023-01-01',
          endDate: 'invalid-date'
        }
      };

      expect(() => filter.filterData(sampleData, criteria))
        .toThrow('Invalid date format in date range filter');
    });

    it('should handle rows with invalid date values', () => {
      const dataWithInvalidDates: DataStructure = {
        ...sampleData,
        rows: [
          { name: 'John', joinDate: '2023-01-15' },
          { name: 'Jane', joinDate: 'invalid-date' },
          { name: 'Bob', joinDate: '2023-02-10' }
        ]
      };

      const criteria: FilterCriteria = {
        dateRange: {
          dateColumn: 'joinDate',
          startDate: '2023-01-01',
          endDate: '2023-12-31'
        }
      };

      const result = filter.filterData(dataWithInvalidDates, criteria);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('John');
      expect(result.rows[1].name).toBe('Bob');
    });
  });

  describe('custom conditions', () => {
    it('should handle numeric comparisons', () => {
      const criteria: FilterCriteria = {
        customConditions: ['age > 30']
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(2);
      expect(result.rows.every(row => row.age > 30)).toBe(true);
    });

    it('should handle string comparisons', () => {
      const criteria: FilterCriteria = {
        customConditions: ['name === \"John\"']
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('John');
    });

    it('should handle boolean comparisons', () => {
      const criteria: FilterCriteria = {
        customConditions: ['active === true']
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(3);
      expect(result.rows.every(row => row.active === true)).toBe(true);
    });

    it('should handle null comparisons', () => {
      const dataWithNulls: DataStructure = {
        ...sampleData,
        rows: [
          { name: 'John', age: 30, email: null },
          { name: 'Jane', age: 25, email: 'jane@example.com' }
        ]
      };

      const criteria: FilterCriteria = {
        customConditions: ['email != null']
      };

      const result = filter.filterData(dataWithNulls, criteria);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Jane');
    });

    it('should handle multiple operators', () => {
      const criteria: FilterCriteria = {
        customConditions: [
          'age >= 25',
          'age <= 35',
          'active === true'
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].name).toBe('John');
      expect(result.rows[1].name).toBe('Jane');
      expect(result.rows[2].name).toBe('Alice');
    });

    it('should skip invalid conditions gracefully', () => {
      const criteria: FilterCriteria = {
        customConditions: [
          'age > 25', // Valid
          'invalid condition', // Invalid
          'active === true' // Valid
        ]
      };

      const result = filter.filterData(sampleData, criteria);

      // Should still apply valid conditions
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows.every(row => row.age > 25 && row.active === true)).toBe(true);
    });
  });

  describe('filterUnique', () => {
    it('should filter unique values by column', () => {
      const dataWithDuplicates: DataStructure = {
        rows: [
          { name: 'John', category: 'A' },
          { name: 'Jane', category: 'B' },
          { name: 'Bob', category: 'A' },
          { name: 'Alice', category: 'C' }
        ],
        headers: ['name', 'category'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 4,
          totalColumns: 2
        }
      };

      const result = filter.filterUnique(dataWithDuplicates, 'category');

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].category).toBe('A');
      expect(result.rows[1].category).toBe('B');
      expect(result.rows[2].category).toBe('C');
    });

    it('should throw error for non-existent column', () => {
      expect(() => filter.filterUnique(sampleData, 'nonexistent'))
        .toThrow("Column 'nonexistent' does not exist");
    });
  });

  describe('filterDuplicates', () => {
    it('should remove duplicate rows', () => {
      const dataWithDuplicates: DataStructure = {
        rows: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
          { name: 'John', age: 30 }, // Duplicate
          { name: 'Bob', age: 35 }
        ],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 4,
          totalColumns: 2
        }
      };

      const result = filter.filterDuplicates(dataWithDuplicates);

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toEqual({ name: 'John', age: 30 });
      expect(result.rows[1]).toEqual({ name: 'Jane', age: 25 });
      expect(result.rows[2]).toEqual({ name: 'Bob', age: 35 });
    });
  });

  describe('filterNullValues', () => {
    it('should remove rows with null values', () => {
      const dataWithNulls: DataStructure = {
        rows: [
          { name: 'John', age: 30, email: 'john@example.com' },
          { name: 'Jane', age: null, email: 'jane@example.com' },
          { name: 'Bob', age: 35, email: null },
          { name: 'Alice', age: 28, email: 'alice@example.com' }
        ],
        headers: ['name', 'age', 'email'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 4,
          totalColumns: 3
        }
      };

      const result = filter.filterNullValues(dataWithNulls, ['age', 'email'], true);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('John');
      expect(result.rows[1].name).toBe('Alice');
    });

    it('should keep only rows with null values when removeNulls is false', () => {
      const dataWithNulls: DataStructure = {
        rows: [
          { name: 'John', age: 30, email: 'john@example.com' },
          { name: 'Jane', age: null, email: 'jane@example.com' },
          { name: 'Bob', age: 35, email: null }
        ],
        headers: ['name', 'age', 'email'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 3,
          totalColumns: 3
        }
      };

      const result = filter.filterNullValues(dataWithNulls, ['age', 'email'], false);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('Jane');
      expect(result.rows[1].name).toBe('Bob');
    });

    it('should throw error for non-existent columns', () => {
      expect(() => filter.filterNullValues(sampleData, ['nonexistent'], true))
        .toThrow('Columns not found: nonexistent');
    });
  });

  describe('filterSample', () => {
    it('should sample every nth row', () => {
      const result = filter.filterSample(sampleData, { type: 'every_nth', count: 2 });

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].name).toBe('John'); // index 0
      expect(result.rows[1].name).toBe('Bob');  // index 2
      expect(result.rows[2].name).toBe('Charlie'); // index 4
    });

    it('should sample first n rows', () => {
      const result = filter.filterSample(sampleData, { type: 'first', count: 3 });

      expect(result.rows).toHaveLength(3);
      expect(result.rows[0].name).toBe('John');
      expect(result.rows[1].name).toBe('Jane');
      expect(result.rows[2].name).toBe('Bob');
    });

    it('should sample last n rows', () => {
      const result = filter.filterSample(sampleData, { type: 'last', count: 2 });

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('Alice');
      expect(result.rows[1].name).toBe('Charlie');
    });

    it('should sample random rows with seed for reproducibility', () => {
      const result1 = filter.filterSample(sampleData, { type: 'random', count: 3, seed: 12345 });
      const result2 = filter.filterSample(sampleData, { type: 'random', count: 3, seed: 12345 });

      expect(result1.rows).toHaveLength(3);
      expect(result2.rows).toHaveLength(3);
      expect(result1.rows).toEqual(result2.rows); // Should be identical with same seed
    });

    it('should handle count larger than available rows', () => {
      const result = filter.filterSample(sampleData, { type: 'first', count: 10 });

      expect(result.rows).toHaveLength(5); // All available rows
    });

    it('should throw error for unknown sample type', () => {
      expect(() => filter.filterSample(sampleData, { type: 'unknown' as any, count: 2 }))
        .toThrow('Unknown sample type: unknown');
    });
  });

  describe('static factory methods', () => {
    it('should create column filter', () => {
      const columnFilter = DataFilter.createColumnFilter('age', 'greaterThan', 30);

      expect(columnFilter).toEqual({
        columnName: 'age',
        operator: 'greaterThan',
        value: 30
      });
    });

    it('should create date range filter', () => {
      const dateRange = DataFilter.createDateRangeFilter('joinDate', '2023-01-01', '2023-12-31');

      expect(dateRange).toEqual({
        dateColumn: 'joinDate',
        startDate: '2023-01-01',
        endDate: '2023-12-31'
      });
    });

    it('should create filter criteria', () => {
      const criteria = DataFilter.createFilterCriteria({
        columnFilters: [{ columnName: 'age', operator: 'greaterThan', value: 30 }],
        customConditions: ['active === true']
      });

      expect(criteria).toEqual({
        columnFilters: [{ columnName: 'age', operator: 'greaterThan', value: 30 }],
        customConditions: ['active === true']
      });
    });
  });

  describe('getFilterStatistics', () => {
    it('should return correct filter statistics', () => {
      const filteredData: DataStructure = {
        ...sampleData,
        rows: sampleData.rows.slice(0, 2),
        metadata: { ...sampleData.metadata, totalRows: 2 }
      };

      const stats = filter.getFilterStatistics(sampleData, filteredData);

      expect(stats).toEqual({
        originalRows: 5,
        filteredRows: 2,
        removedRows: 3,
        removalPercentage: 60
      });
    });

    it('should handle empty original data', () => {
      const emptyData: DataStructure = {
        rows: [],
        headers: [],
        metadata: { originalFormat: 'csv', encoding: 'utf-8', totalRows: 0, totalColumns: 0 }
      };

      const stats = filter.getFilterStatistics(emptyData, emptyData);

      expect(stats).toEqual({
        originalRows: 0,
        filteredRows: 0,
        removedRows: 0,
        removalPercentage: 0
      });
    });
  });

  describe('validateFilterCriteria', () => {
    it('should validate correct filter criteria', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'greaterThan', value: 30 }
        ],
        dateRange: {
          dateColumn: 'joinDate',
          startDate: '2023-01-01',
          endDate: '2023-12-31'
        },
        customConditions: ['active === true']
      };

      const result = filter.validateFilterCriteria(sampleData, criteria);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect errors in column filters', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: '', operator: 'greaterThan', value: 30 }, // Missing column name
          { columnName: 'nonexistent', operator: 'greaterThan', value: 30 }, // Non-existent column
          { columnName: 'age', operator: '' as any, value: 30 }, // Missing operator
          { columnName: 'age', operator: 'between', value: 30 } // Invalid between value
        ]
      };

      const result = filter.validateFilterCriteria(sampleData, criteria);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors[0]).toContain('Column name is required');
      expect(result.errors[1]).toContain('does not exist');
      expect(result.errors[2]).toContain('Operator is required');
      expect(result.errors[3]).toContain('Between operator requires an array');
    });

    it('should detect errors in date range filter', () => {
      const criteria: FilterCriteria = {
        dateRange: {
          dateColumn: 'nonexistent',
          startDate: 'invalid-date',
          endDate: '2023-12-31'
        }
      };

      const result = filter.validateFilterCriteria(sampleData, criteria);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('does not exist');
      expect(result.errors[1]).toContain('Invalid start date format');
    });

    it('should detect warnings', () => {
      const criteria: FilterCriteria = {
        columnFilters: [
          { columnName: 'age', operator: 'greaterThan', value: undefined }
        ],
        dateRange: {
          dateColumn: 'joinDate',
          startDate: '2023-12-31',
          endDate: '2023-01-01' // End before start
        },
        customConditions: ['invalid condition format']
      };

      const result = filter.validateFilterCriteria(sampleData, criteria);

      expect(result.warnings).toHaveLength(3);
      expect(result.warnings[0]).toContain('Filter value is undefined');
      expect(result.warnings[1]).toContain('Start date is after end date');
      expect(result.warnings[2]).toContain('No recognized operator found');
    });
  });
});