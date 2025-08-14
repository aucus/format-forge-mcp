import { DataStructure, ColumnOperation, ColumnStatistic, OperationValidationResult } from '../types/index.js';
import { Logger } from '../core/Logger.js';
import { ConversionError } from '../errors/ConversionError.js';

/**
 * Column manipulation utilities for adding, removing, and renaming columns
 */
export class ColumnManipulator {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Apply multiple column operations to a data structure
   */
  manipulateColumns(data: DataStructure, operations: ColumnOperation[]): DataStructure {
    this.logger.debug('Applying column operations', { 
      operationCount: operations.length,
      rowCount: data.rows.length 
    });

    if (operations.length === 0) {
      return this.cloneDataStructure(data);
    }

    try {
      let result = this.cloneDataStructure(data);

      // Apply operations in order
      operations.forEach((operation, index) => {
        this.logger.debug(`Applying operation ${index + 1}`, { operation });
        result = this.applyOperation(result, operation);
      });

      // Update metadata
      result.metadata = {
        ...result.metadata,
        totalColumns: result.headers?.length || 
          (result.rows.length > 0 ? Object.keys(result.rows[0]).length : 0)
      };

      this.logger.debug('Column operations completed', {
        originalColumns: data.metadata.totalColumns,
        newColumns: result.metadata.totalColumns
      });

      return result;

    } catch (error) {
      this.logger.error('Column manipulation failed', error as Error, { operations });
      throw error;
    }
  }

  /**
   * Add a new column to the data structure
   */
  addColumn(data: DataStructure, operation: ColumnOperation): DataStructure {
    this.logger.debug('Adding column', { operation });

    if (!operation.columnName) {
      throw new Error('Column name is required for add operation');
    }

    const existingColumns = this.getColumnNames(data);
    if (existingColumns.includes(operation.columnName)) {
      throw new Error(`Column '${operation.columnName}' already exists`);
    }

    const result = this.cloneDataStructure(data);

    // Add to headers if they exist
    if (result.headers) {
      result.headers.push(operation.columnName);
    }

    // Add to all rows
    result.rows = result.rows.map(row => {
      const newRow = { ...row };
      newRow[operation.columnName] = this.resolveDefaultValue(operation.defaultValue, row);
      return newRow;
    });

    // Update metadata
    result.metadata = {
      ...result.metadata,
      totalColumns: result.headers?.length || Object.keys(result.rows[0] || {}).length
    };

    return result;
  }

  /**
   * Remove a column from the data structure
   */
  removeColumn(data: DataStructure, operation: ColumnOperation): DataStructure {
    this.logger.debug('Removing column', { operation });

    if (!operation.columnName) {
      throw new Error('Column name is required for remove operation');
    }

    const existingColumns = this.getColumnNames(data);
    if (!existingColumns.includes(operation.columnName)) {
      // Return original data unchanged if column doesn't exist
      return this.cloneDataStructure(data);
    }

    const result = this.cloneDataStructure(data);

    // Remove from headers if they exist
    if (result.headers) {
      result.headers = result.headers.filter(header => header !== operation.columnName);
    }

    // Remove from all rows
    result.rows = result.rows.map(row => {
      const newRow = { ...row };
      delete newRow[operation.columnName];
      return newRow;
    });

    // Update metadata
    result.metadata = {
      ...result.metadata,
      totalColumns: result.headers?.length || Object.keys(result.rows[0] || {}).length
    };

    return result;
  }

  /**
   * Rename a column in the data structure
   */
  renameColumn(data: DataStructure, operation: ColumnOperation): DataStructure {
    this.logger.debug('Renaming column', { operation });

    if (!operation.columnName) {
      throw new Error('Column name is required for rename operation');
    }

    if (!operation.newName) {
      throw new Error('New name is required for rename operation');
    }

    const existingColumns = this.getColumnNames(data);
    if (!existingColumns.includes(operation.columnName)) {
      throw new Error(`Column '${operation.columnName}' does not exist`);
    }

    if (existingColumns.includes(operation.newName)) {
      throw new Error(`Column '${operation.newName}' already exists`);
    }

    const result = this.cloneDataStructure(data);

    // Rename in headers if they exist
    if (result.headers) {
      result.headers = result.headers.map(header => 
        header === operation.columnName ? operation.newName! : header
      );
    }

    // Rename in all rows
    result.rows = result.rows.map(row => {
      if (operation.columnName in row) {
        const newRow = { ...row };
        newRow[operation.newName!] = newRow[operation.columnName];
        delete newRow[operation.columnName];
        return newRow;
      }
      return row;
    });

    return result;
  }

  /**
   * Reorder columns in the data structure
   */
  reorderColumns(data: DataStructure, newOrder: string[]): DataStructure {
    this.logger.debug('Reordering columns', { newOrder });

    const result = this.cloneDataStructure(data);
    const existingColumns = this.getColumnNames(data);

    // Validate that all columns in newOrder exist
    const missingColumns = newOrder.filter(col => !existingColumns.includes(col));
    if (missingColumns.length > 0) {
      throw new Error(`Columns not found: ${missingColumns.join(', ')}`);
    }

    // Add any existing columns not in newOrder to the end
    const finalOrder = [...newOrder];
    existingColumns.forEach(col => {
      if (!finalOrder.includes(col)) {
        finalOrder.push(col);
      }
    });

    // Update headers
    if (result.headers) {
      result.headers = finalOrder;
    }

    // Reorder row properties
    result.rows = result.rows.map(row => {
      const newRow: Record<string, any> = {};
      finalOrder.forEach(col => {
        if (col in row) {
          newRow[col] = row[col];
        }
      });
      return newRow;
    });

    return result;
  }

  /**
   * Select specific columns from the data structure
   */
  selectColumns(data: DataStructure, columnNames: string[]): DataStructure {
    this.logger.debug('Selecting columns', { columnNames });

    const result = this.cloneDataStructure(data);
    const existingColumns = this.getColumnNames(data);

    // Validate that all requested columns exist
    const missingColumns = columnNames.filter(col => !existingColumns.includes(col));
    if (missingColumns.length > 0) {
      throw new Error(`Columns not found: ${missingColumns.join(', ')}`);
    }

    // Update headers
    if (result.headers) {
      result.headers = columnNames;
    }

    // Select only specified columns from rows
    result.rows = result.rows.map(row => {
      const newRow: Record<string, any> = {};
      columnNames.forEach(col => {
        if (col in row) {
          newRow[col] = row[col];
        }
      });
      return newRow;
    });

    // Update metadata
    result.metadata = {
      ...result.metadata,
      totalColumns: columnNames.length
    };

    return result;
  }

  /**
   * Apply a transformation function to a column
   */
  transformColumn(
    data: DataStructure,
    columnName: string,
    transformer: (value: any, row: Record<string, any>, index: number) => any
  ): DataStructure {
    this.logger.debug('Transforming column', { columnName });

    const existingColumns = this.getColumnNames(data);
    if (!existingColumns.includes(columnName)) {
      throw new Error(`Column '${columnName}' does not exist`);
    }

    const result = this.cloneDataStructure(data);

    // Apply transformation to column values
    result.rows = result.rows.map((row, index) => {
      const newRow = { ...row };
      try {
        newRow[columnName] = transformer(row[columnName], row, index);
      } catch (error) {
        this.logger.warn('Column transformation failed for row', { 
          index, 
          error: (error as Error).message 
        });
        // Keep original value on transformation failure
      }
      return newRow;
    });

    return result;
  }

  /**
   * Split a column into multiple columns based on a delimiter
   */
  splitColumn(
    data: DataStructure,
    sourceColumn: string,
    delimiter: string,
    newColumnNames: string[]
  ): DataStructure {
    this.logger.debug('Splitting column', { 
      sourceColumn, 
      delimiter, 
      newColumnNames
    });

    const existingColumns = this.getColumnNames(data);
    if (!existingColumns.includes(sourceColumn)) {
      throw new Error(`Column '${sourceColumn}' does not exist`);
    }

    // Check if any new column names already exist
    const existingNewColumns = newColumnNames.filter(col => existingColumns.includes(col));
    if (existingNewColumns.length > 0) {
      throw new Error(`Column names already exist: ${existingNewColumns.join(', ')}`);
    }

    let result = this.cloneDataStructure(data);

    // Add new columns to headers
    if (result.headers) {
      result.headers = [...result.headers, ...newColumnNames];
    }

    // Split the source column data
    result.rows = result.rows.map(row => {
      const newRow = { ...row };
      const sourceValue = row[sourceColumn];
      
      if (sourceValue && typeof sourceValue === 'string') {
        const parts = sourceValue.split(delimiter);
        newColumnNames.forEach((columnName, index) => {
          newRow[columnName] = index < parts.length ? parts[index].trim() : null;
        });
      } else {
        // Set all new columns to null if source is not a string
        newColumnNames.forEach(columnName => {
          newRow[columnName] = null;
        });
      }
      
      return newRow;
    });

    // Update metadata
    result.metadata = {
      ...result.metadata,
      totalColumns: result.headers?.length || Object.keys(result.rows[0] || {}).length
    };

    return result;
  }

  /**
   * Merge multiple columns into a single column
   */
  mergeColumns(
    data: DataStructure,
    sourceColumns: string[],
    targetColumn: string,
    separator: string = ' '
  ): DataStructure {
    this.logger.debug('Merging columns', { 
      sourceColumns, 
      targetColumn, 
      separator
    });

    const existingColumns = this.getColumnNames(data);
    const missingColumns = sourceColumns.filter(col => !existingColumns.includes(col));
    if (missingColumns.length > 0) {
      throw new Error(`Source columns not found: ${missingColumns.join(', ')}`);
    }

    if (existingColumns.includes(targetColumn)) {
      throw new Error(`Column '${targetColumn}' already exists`);
    }

    const result = this.cloneDataStructure(data);

    // Add target column to headers
    if (result.headers) {
      result.headers.push(targetColumn);
    }

    // Merge column data
    result.rows = result.rows.map(row => {
      const newRow = { ...row };
      const values = sourceColumns
        .map(col => row[col])
        .filter(val => val !== null && val !== undefined && val !== '')
        .map(val => String(val));
      
      newRow[targetColumn] = values.length > 0 ? values.join(separator) : null;
      return newRow;
    });

    // Update metadata
    result.metadata = {
      ...result.metadata,
      totalColumns: result.headers?.length || Object.keys(result.rows[0] || {}).length
    };

    return result;
  }

  /**
   * Validate column operations
   */
  validateOperations(data: DataStructure, operations: ColumnOperation[]): OperationValidationResult {
    const existingColumns = this.getColumnNames(data);
    const errors: string[] = [];
    const warnings: string[] = [];

    operations.forEach((operation, index) => {
      const prefix = `Operation ${index + 1}`;

      // Validate operation structure
      if (!operation.type) {
        errors.push(`${prefix}: Missing operation type`);
        return;
      }

      if (!operation.columnName) {
        errors.push(`${prefix}: Column name is required`);
        return;
      }

      // Validate operation-specific requirements
      switch (operation.type) {
        case 'remove':
          if (!existingColumns.includes(operation.columnName)) {
            warnings.push(`${prefix}: Column '${operation.columnName}' does not exist`);
          }
          break;
        
        case 'rename':
          if (!existingColumns.includes(operation.columnName)) {
            errors.push(`${prefix}: Column '${operation.columnName}' does not exist`);
          }
          if (!operation.newName) {
            errors.push(`${prefix}: Rename operation requires newName`);
          } else if (existingColumns.includes(operation.newName)) {
            errors.push(`${prefix}: Target column '${operation.newName}' already exists`);
          }
          break;
        
        case 'add':
          if (existingColumns.includes(operation.columnName)) {
            errors.push(`${prefix}: Column '${operation.columnName}' already exists`);
          }
          break;
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get column statistics
   */
  getColumnStatistics(data: DataStructure): ColumnStatistic[] {
    const columnNames = this.getColumnNames(data);
    const statistics: ColumnStatistic[] = [];

    columnNames.forEach(col => {
      let nullCount = 0;
      const uniqueValues = new Set();
      const types = new Set<string>();
      const sampleValues: any[] = [];

      data.rows.forEach(row => {
        const value = row[col];
        if (value === null || value === undefined) {
          nullCount++;
        } else {
          uniqueValues.add(value);
          types.add(typeof value);
          if (sampleValues.length < 3) {
            sampleValues.push(value);
          }
        }
      });

      statistics.push({
        name: col,
        type: types.size === 1 ? Array.from(types)[0] : 'mixed',
        nullCount,
        uniqueCount: uniqueValues.size,
        sampleValues
      });
    });

    return statistics;
  }

  /**
   * Apply a single column operation
   */
  private applyOperation(data: DataStructure, operation: ColumnOperation): DataStructure {
    switch (operation.type) {
      case 'add':
        return this.addColumn(data, operation);
      
      case 'remove':
        return this.removeColumn(data, operation);
      
      case 'rename':
        return this.renameColumn(data, operation);
      
      default:
        throw new Error(`Unknown column operation type: ${(operation as any).type}`);
    }
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
   * Resolve default value (can be a function)
   */
  private resolveDefaultValue(defaultValue: any, row: Record<string, any>): any {
    if (typeof defaultValue === 'function') {
      try {
        return defaultValue(row);
      } catch (error) {
        this.logger.warn('Default value function failed', { error: (error as Error).message });
        return null;
      }
    }
    return defaultValue;
  }

  /**
   * Deep clone data structure
   */
  private cloneDataStructure(data: DataStructure): DataStructure {
    return {
      rows: data.rows.map(row => ({ ...row })),
      headers: data.headers ? [...data.headers] : undefined,
      metadata: { ...data.metadata }
    };
  }

  /**
   * Static factory methods for creating operations
   */
  static createAddOperation(columnName: string, defaultValue?: any): ColumnOperation {
    return {
      type: 'add',
      columnName,
      defaultValue
    };
  }

  static createRemoveOperation(columnName: string): ColumnOperation {
    return {
      type: 'remove',
      columnName
    };
  }

  static createRenameOperation(columnName: string, newName: string): ColumnOperation {
    return {
      type: 'rename',
      columnName,
      newName
    };
  }
}