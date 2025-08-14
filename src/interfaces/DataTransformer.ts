import { DataStructure, KeyStyle, FilterCriteria, ColumnOperation } from '../types/index.js';

/**
 * Interface for data transformation operations
 */
export interface DataTransformer {
  /**
   * Transform keys in the data structure according to the specified style
   */
  transformKeys(data: DataStructure, style: KeyStyle): DataStructure;

  /**
   * Filter data based on specified criteria
   */
  filterData(data: DataStructure, criteria: FilterCriteria): DataStructure;

  /**
   * Manipulate columns (add, remove, rename)
   */
  manipulateColumns(data: DataStructure, operations: ColumnOperation[]): DataStructure;
}