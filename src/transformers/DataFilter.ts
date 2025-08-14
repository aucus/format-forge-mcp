import { DataStructure, FilterCriteria, ColumnFilter, DateRange } from '../types/index.js';
import { Logger } from '../core/Logger.js';
import { ConversionError } from '../errors/ConversionError.js';

/**
 * Data filtering engine for applying various filter criteria to data structures
 */
export class DataFilter {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Apply filter criteria to a data structure
   */
  filterData(data: DataStructure, criteria: FilterCriteria): DataStructure {
    this.logger.debug('Applying filter criteria', { 
      rowCount: data.rows.length,
      criteria 
    });

    try {
      let filteredRows = [...data.rows];

      // Apply column filters
      if (criteria.columnFilters && criteria.columnFilters.length > 0) {
        filteredRows = this.applyColumnFilters(filteredRows, criteria.columnFilters);
      }

      // Apply date range filter
      if (criteria.dateRange) {
        filteredRows = this.applyDateRangeFilter(filteredRows, criteria.dateRange);
      }

      // Apply custom conditions
      if (criteria.customConditions && criteria.customConditions.length > 0) {
        filteredRows = this.applyCustomConditions(filteredRows, criteria.customConditions);
      }

      const result: DataStructure = {
        rows: filteredRows,
        headers: data.headers,
        metadata: {
          ...data.metadata,
          totalRows: filteredRows.length
        }
      };

      this.logger.debug('Filter applied successfully', {
        originalRows: data.rows.length,
        filteredRows: filteredRows.length
      });

      return result;

    } catch (error) {
      this.logger.error('Data filtering failed', error as Error, { criteria });
      throw error;
    }
  }

  /**
   * Apply column-based filters
   */
  private applyColumnFilters(rows: Record<string, any>[], filters: ColumnFilter[]): Record<string, any>[] {
    return rows.filter(row => {
      return filters.every(filter => this.evaluateColumnFilter(row, filter));
    });
  }

  /**
   * Evaluate a single column filter against a row
   */
  private evaluateColumnFilter(row: Record<string, any>, filter: ColumnFilter): boolean {
    const value = row[filter.columnName];
    
    if (value === null || value === undefined) {
      return false;
    }

    switch (filter.operator) {
      case 'equals':
        return this.compareValues(value, filter.value, '===');
      
      case 'contains':
        return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
      
      case 'greaterThan':
        return this.compareValues(value, filter.value, '>');
      
      case 'lessThan':
        return this.compareValues(value, filter.value, '<');
      
      case 'between':
        if (!Array.isArray(filter.value) || filter.value.length !== 2) {
          throw ConversionError.validationFailed([
            'Between operator requires an array of two values'
          ]);
        }
        return this.compareValues(value, filter.value[0], '>=') && 
               this.compareValues(value, filter.value[1], '<=');
      
      default:
        throw ConversionError.validationFailed([
          `Unknown filter operator: ${filter.operator}`
        ]);
    }
  }

  /**
   * Compare two values with the specified operator
   */
  private compareValues(value1: any, value2: any, operator: string): boolean {
    // Try numeric comparison first
    const num1 = Number(value1);
    const num2 = Number(value2);
    
    if (!isNaN(num1) && !isNaN(num2)) {
      switch (operator) {
        case '===': return num1 === num2;
        case '>': return num1 > num2;
        case '<': return num1 < num2;
        case '>=': return num1 >= num2;
        case '<=': return num1 <= num2;
      }
    }

    // Try date comparison
    const date1 = new Date(value1);
    const date2 = new Date(value2);
    
    if (!isNaN(date1.getTime()) && !isNaN(date2.getTime())) {
      switch (operator) {
        case '===': return date1.getTime() === date2.getTime();
        case '>': return date1.getTime() > date2.getTime();
        case '<': return date1.getTime() < date2.getTime();
        case '>=': return date1.getTime() >= date2.getTime();
        case '<=': return date1.getTime() <= date2.getTime();
      }
    }

    // Fall back to string comparison
    const str1 = String(value1);
    const str2 = String(value2);
    
    switch (operator) {
      case '===': return str1 === str2;
      case '>': return str1 > str2;
      case '<': return str1 < str2;
      case '>=': return str1 >= str2;
      case '<=': return str1 <= str2;
      default: return false;
    }
  }

  /**
   * Apply date range filter
   */
  private applyDateRangeFilter(rows: Record<string, any>[], dateRange: DateRange): Record<string, any>[] {
    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw ConversionError.validationFailed([
        'Invalid date format in date range filter'
      ]);
    }

    return rows.filter(row => {
      const dateValue = row[dateRange.dateColumn];
      if (!dateValue) {
        return false;
      }

      const rowDate = new Date(dateValue);
      if (isNaN(rowDate.getTime())) {
        return false;
      }

      return rowDate >= startDate && rowDate <= endDate;
    });
  }

  /**
   * Apply custom condition filters
   */
  private applyCustomConditions(rows: Record<string, any>[], conditions: string[]): Record<string, any>[] {
    return rows.filter(row => {
      return conditions.every(condition => this.evaluateCustomCondition(row, condition));
    });
  }

  /**
   * Evaluate a custom condition against a row
   * Supports simple expressions like "age > 18", "name != null", etc.
   */
  private evaluateCustomCondition(row: Record<string, any>, condition: string): boolean {
    try {
      // Simple expression parser for basic conditions
      const operators = ['>=', '<=', '!=', '===', '==', '>', '<'];
      let operator = '';
      let parts: string[] = [];

      // Find the operator
      for (const op of operators) {
        if (condition.includes(op)) {
          operator = op;
          parts = condition.split(op).map(p => p.trim());
          break;
        }
      }

      if (!operator || parts.length !== 2) {
        this.logger.warn('Invalid custom condition format', { condition });
        return true; // Skip invalid conditions
      }

      const [leftSide, rightSide] = parts;
      const leftValue = this.resolveValue(row, leftSide);
      const rightValue = this.resolveValue(row, rightSide);

      // Handle null checks
      if (rightSide === 'null') {
        switch (operator) {
          case '===':
          case '==':
            return leftValue === null || leftValue === undefined;
          case '!=':
            return leftValue !== null && leftValue !== undefined;
          default:
            return false;
        }
      }

      // Use the same comparison logic as column filters
      switch (operator) {
        case '===':
        case '==':
          return this.compareValues(leftValue, rightValue, '===');
        case '!=':
          return !this.compareValues(leftValue, rightValue, '===');
        case '>':
          return this.compareValues(leftValue, rightValue, '>');
        case '<':
          return this.compareValues(leftValue, rightValue, '<');
        case '>=':
          return this.compareValues(leftValue, rightValue, '>=');
        case '<=':
          return this.compareValues(leftValue, rightValue, '<=');
        default:
          return false;
      }

    } catch (error) {
      this.logger.warn('Custom condition evaluation failed', { 
        condition, 
        error: (error as Error).message 
      });
      return true; // Skip failed conditions
    }
  }

  /**
   * Resolve a value from a string (could be a column name, literal, or expression)
   */
  private resolveValue(row: Record<string, any>, valueStr: string): any {
    // Remove quotes if present
    const trimmed = valueStr.replace(/^['"]|['"]$/g, '');
    
    // Check if it's a number
    const num = Number(trimmed);
    if (!isNaN(num)) {
      return num;
    }

    // Check if it's a boolean
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;

    // Check if it's a column name
    if (trimmed in row) {
      return row[trimmed];
    }

    // Return as string literal
    return trimmed;
  }

  /**
   * Create a simple column filter
   */
  static createColumnFilter(
    columnName: string, 
    operator: ColumnFilter['operator'], 
    value: any
  ): ColumnFilter {
    return {
      columnName,
      operator,
      value
    };
  }

  /**
   * Create a date range filter
   */
  static createDateRangeFilter(
    dateColumn: string,
    startDate: string,
    endDate: string
  ): DateRange {
    return {
      dateColumn,
      startDate,
      endDate
    };
  }

  /**
   * Create filter criteria with multiple filters
   */
  static createFilterCriteria(options: {
    columnFilters?: ColumnFilter[];
    dateRange?: DateRange;
    customConditions?: string[];
  }): FilterCriteria {
    return {
      columnFilters: options.columnFilters,
      dateRange: options.dateRange,
      customConditions: options.customConditions
    };
  }

  /**
   * Filter rows by unique values in a column
   */
  filterUnique(data: DataStructure, columnName: string): DataStructure {
    this.logger.debug('Filtering unique values', { columnName });

    const existingColumns = this.getColumnNames(data);
    if (!existingColumns.includes(columnName)) {
      throw ConversionError.validationFailed([
        `Column '${columnName}' does not exist`
      ]);
    }

    const seen = new Set();
    const uniqueRows = data.rows.filter(row => {
      const value = row[columnName];
      const key = JSON.stringify(value);
      
      if (seen.has(key)) {
        return false;
      }
      
      seen.add(key);
      return true;
    });

    return {
      rows: uniqueRows,
      headers: data.headers,
      metadata: {
        ...data.metadata,
        totalRows: uniqueRows.length
      }
    };
  }

  /**
   * Filter rows by removing duplicates across all columns
   */
  filterDuplicates(data: DataStructure): DataStructure {
    this.logger.debug('Filtering duplicate rows');

    const seen = new Set();
    const uniqueRows = data.rows.filter(row => {
      const key = JSON.stringify(row);
      
      if (seen.has(key)) {
        return false;
      }
      
      seen.add(key);
      return true;
    });

    return {
      rows: uniqueRows,
      headers: data.headers,
      metadata: {
        ...data.metadata,
        totalRows: uniqueRows.length
      }
    };
  }

  /**
   * Filter rows by null/empty values in specified columns
   */
  filterNullValues(data: DataStructure, columnNames: string[], removeNulls: boolean = true): DataStructure {
    this.logger.debug('Filtering null values', { columnNames, removeNulls });

    const existingColumns = this.getColumnNames(data);
    const invalidColumns = columnNames.filter(col => !existingColumns.includes(col));
    
    if (invalidColumns.length > 0) {
      throw ConversionError.validationFailed([
        `Columns not found: ${invalidColumns.join(', ')}`
      ]);
    }

    const filteredRows = data.rows.filter(row => {
      const hasNulls = columnNames.some(col => {
        const value = row[col];
        return value === null || value === undefined || value === '';
      });

      return removeNulls ? !hasNulls : hasNulls;
    });

    return {
      rows: filteredRows,
      headers: data.headers,
      metadata: {
        ...data.metadata,
        totalRows: filteredRows.length
      }
    };
  }

  /**
   * Filter rows by sampling (take every nth row, random sample, etc.)
   */
  filterSample(data: DataStructure, options: {
    type: 'every_nth' | 'random' | 'first' | 'last';
    count: number;
    seed?: number;
  }): DataStructure {
    this.logger.debug('Filtering sample', { options });

    let sampledRows: Record<string, any>[] = [];

    switch (options.type) {
      case 'every_nth':
        sampledRows = data.rows.filter((_, index) => index % options.count === 0);
        break;
      
      case 'random':
        if (options.seed !== undefined) {
          // Simple seeded random for reproducible results
          let seed = options.seed;
          const seededRandom = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
          };
          
          const shuffled = [...data.rows].sort(() => seededRandom() - 0.5);
          sampledRows = shuffled.slice(0, Math.min(options.count, shuffled.length));
        } else {
          const shuffled = [...data.rows].sort(() => Math.random() - 0.5);
          sampledRows = shuffled.slice(0, Math.min(options.count, shuffled.length));
        }
        break;
      
      case 'first':
        sampledRows = data.rows.slice(0, Math.min(options.count, data.rows.length));
        break;
      
      case 'last':
        sampledRows = data.rows.slice(-Math.min(options.count, data.rows.length));
        break;
      
      default:
        throw ConversionError.validationFailed([
          `Unknown sample type: ${options.type}`
        ]);
    }

    return {
      rows: sampledRows,
      headers: data.headers,
      metadata: {
        ...data.metadata,
        totalRows: sampledRows.length
      }
    };
  }

  /**
   * Get column names from data structure
   */
  private getColumnNames(data: DataStructure): string[] {
    if (data.headers) {
      return data.headers;
    }
    
    if (data.rows.length > 0) {
      return Object.keys(data.rows[0]);
    }
    
    return [];
  }

  /**
   * Get filter statistics
   */
  getFilterStatistics(originalData: DataStructure, filteredData: DataStructure): {
    originalRows: number;
    filteredRows: number;
    removedRows: number;
    removalPercentage: number;
  } {
    const originalRows = originalData.rows.length;
    const filteredRows = filteredData.rows.length;
    const removedRows = originalRows - filteredRows;
    const removalPercentage = originalRows > 0 ? (removedRows / originalRows) * 100 : 0;

    return {
      originalRows,
      filteredRows,
      removedRows,
      removalPercentage: Math.round(removalPercentage * 100) / 100
    };
  }

  /**
   * Validate filter criteria
   */
  validateFilterCriteria(data: DataStructure, criteria: FilterCriteria): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const existingColumns = this.getColumnNames(data);

    // Validate column filters
    if (criteria.columnFilters) {
      criteria.columnFilters.forEach((filter, index) => {
        if (!filter.columnName) {
          errors.push(`Column filter ${index + 1}: Column name is required`);
        } else if (!existingColumns.includes(filter.columnName)) {
          errors.push(`Column filter ${index + 1}: Column '${filter.columnName}' does not exist`);
        }

        if (!filter.operator) {
          errors.push(`Column filter ${index + 1}: Operator is required`);
        }

        if (filter.value === undefined) {
          warnings.push(`Column filter ${index + 1}: Filter value is undefined`);
        }

        if (filter.operator === 'between' && (!Array.isArray(filter.value) || filter.value.length !== 2)) {
          errors.push(`Column filter ${index + 1}: Between operator requires an array of two values`);
        }
      });
    }

    // Validate date range filter
    if (criteria.dateRange) {
      if (!criteria.dateRange.dateColumn) {
        errors.push('Date range filter: Date column is required');
      } else if (!existingColumns.includes(criteria.dateRange.dateColumn)) {
        errors.push(`Date range filter: Column '${criteria.dateRange.dateColumn}' does not exist`);
      }

      if (!criteria.dateRange.startDate) {
        errors.push('Date range filter: Start date is required');
      } else if (isNaN(new Date(criteria.dateRange.startDate).getTime())) {
        errors.push('Date range filter: Invalid start date format');
      }

      if (!criteria.dateRange.endDate) {
        errors.push('Date range filter: End date is required');
      } else if (isNaN(new Date(criteria.dateRange.endDate).getTime())) {
        errors.push('Date range filter: Invalid end date format');
      }

      if (criteria.dateRange.startDate && criteria.dateRange.endDate) {
        const start = new Date(criteria.dateRange.startDate);
        const end = new Date(criteria.dateRange.endDate);
        if (start > end) {
          warnings.push('Date range filter: Start date is after end date');
        }
      }
    }

    // Validate custom conditions
    if (criteria.customConditions) {
      criteria.customConditions.forEach((condition, index) => {
        if (!condition || typeof condition !== 'string') {
          errors.push(`Custom condition ${index + 1}: Condition must be a non-empty string`);
        } else {
          // Basic syntax validation
          const operators = ['>=', '<=', '!=', '===', '==', '>', '<'];
          const hasOperator = operators.some(op => condition.includes(op));
          if (!hasOperator) {
            warnings.push(`Custom condition ${index + 1}: No recognized operator found in '${condition}'`);
          }
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}