import { BaseFormatHandler } from './BaseFormatHandler.js';
import { DataStructure, ReadOptions, WriteOptions, ValidationResult } from '../types/index.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { ConversionError } from '../errors/ConversionError.js';

/**
 * JSON format handler
 */
export class JsonFormatHandler extends BaseFormatHandler {
  constructor() {
    super(['json'], ['.json']);
  }

  /**
   * Read JSON file and convert to DataStructure
   */
  async read(filePath: string, options?: ReadOptions): Promise<DataStructure> {
    this.logOperation('Reading JSON file', filePath, options);

    try {
      const readOptions = this.parseReadOptions(options);
      const content = await this.readFileContent(filePath, readOptions.encoding);

      // Parse JSON content
      const jsonData = this.parseJsonContent(content);

      // Convert JSON to tabular format
      const tabularData = this.convertJsonToTabular(jsonData);

      // Create and return data structure
      const dataStructure = this.createDataStructure(
        tabularData.rows,
        'json',
        readOptions.encoding,
        tabularData.headers
      );

      this.logOperation('JSON file read successfully', filePath, {
        rowCount: tabularData.rows.length,
        columnCount: tabularData.headers?.length || 0,
        hasHeaders: !!tabularData.headers,
        jsonType: this.getJsonType(jsonData)
      });

      return dataStructure;

    } catch (error) {
      this.handleError(error as Error, 'read', filePath);
    }
  }

  /**
   * Write DataStructure to JSON file
   */
  async write(data: DataStructure, filePath: string, options?: WriteOptions): Promise<void> {
    this.logOperation('Writing JSON file', filePath, options);

    try {
      const writeOptions = this.parseWriteOptions(options);

      // Validate data structure
      const validation = this.validate(data);
      if (!validation.isValid) {
        const errorMessages = validation.errors.map(e => e.message);
        throw ConversionError.validationFailed(errorMessages);
      }

      // Check overwrite settings
      await this.checkOverwrite(filePath, writeOptions.overwrite);

      // Convert tabular data to JSON
      const jsonData = this.convertTabularToJson(data, writeOptions);

      // Generate JSON content
      const jsonContent = this.generateJsonContent(jsonData, writeOptions);

      // Write to file
      await this.writeFileContent(filePath, jsonContent, writeOptions.encoding);

      this.logOperation('JSON file written successfully', filePath, {
        rowCount: data.rows.length,
        columnCount: data.headers?.length || Object.keys(data.rows[0] || {}).length,
        hasHeaders: !!data.headers,
        outputFormat: writeOptions.formatting?.outputFormat || 'array'
      });

    } catch (error) {
      this.handleError(error as Error, 'write', filePath);
    }
  }

  /**
   * Validate JSON-specific data structure
   */
  protected validateFormatSpecific(data: DataStructure): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    // JSON-specific validations
    if (data.rows.length === 0) {
      warnings.push(ValidationUtils.createWarning(
        'EMPTY_JSON_DATA',
        'JSON data contains no rows',
        'rows'
      ));
    }

    // Check for circular references in data
    let hasCircularReferences = false;
    try {
      JSON.stringify(data.rows);
    } catch (error) {
      if ((error as Error).message.includes('circular')) {
        hasCircularReferences = true;
        errors.push(ValidationUtils.createError(
          'CIRCULAR_REFERENCE',
          'Data contains circular references that cannot be serialized to JSON',
          'rows'
        ));
      }
    }

    // Check for data types that don't serialize well to JSON
    if (!hasCircularReferences) {
      let hasProblematicTypes = false;
      const problematicTypes: string[] = [];

      data.rows.forEach((row, rowIndex) => {
        Object.entries(row).forEach(([key, value]) => {
          if (value instanceof Function) {
            hasProblematicTypes = true;
            problematicTypes.push('function');
          } else if (value === undefined) {
            hasProblematicTypes = true;
            problematicTypes.push('undefined');
          } else if (typeof value === 'symbol') {
            hasProblematicTypes = true;
            problematicTypes.push('symbol');
          } else if (typeof value === 'bigint') {
            hasProblematicTypes = true;
            problematicTypes.push('bigint');
          }
        });
      });

      if (hasProblematicTypes) {
        const uniqueTypes = [...new Set(problematicTypes)];
        warnings.push(ValidationUtils.createWarning(
          'PROBLEMATIC_JSON_TYPES',
          `Data contains types that don't serialize well to JSON: ${uniqueTypes.join(', ')}`,
          'rows'
        ));
      }
    }

    // Check for very deep nested objects
    let maxDepth = 0;
    const calculateDepth = (obj: any, currentDepth = 0): number => {
      if (obj === null || typeof obj !== 'object') {
        return currentDepth;
      }
      
      let depth = currentDepth;
      if (Array.isArray(obj)) {
        obj.forEach(item => {
          depth = Math.max(depth, calculateDepth(item, currentDepth + 1));
        });
      } else {
        Object.values(obj).forEach(value => {
          depth = Math.max(depth, calculateDepth(value, currentDepth + 1));
        });
      }
      return depth;
    };

    data.rows.forEach(row => {
      maxDepth = Math.max(maxDepth, calculateDepth(row));
    });

    if (maxDepth > 10) {
      warnings.push(ValidationUtils.createWarning(
        'DEEP_NESTED_OBJECTS',
        `Data contains deeply nested objects (depth: ${maxDepth}), which may cause performance issues`,
        'rows'
      ));
    }

    // Check for very large objects that might cause memory issues
    try {
      const jsonString = JSON.stringify(data.rows);
      const sizeInMB = Buffer.byteLength(jsonString, 'utf8') / (1024 * 1024);
      
      if (sizeInMB > 100) {
        warnings.push(ValidationUtils.createWarning(
          'LARGE_JSON_SIZE',
          `JSON data is very large (${sizeInMB.toFixed(2)} MB), which may cause memory issues`,
          'rows'
        ));
      }
    } catch (error) {
      // Already handled circular reference above
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Parse JSON content from string
   */
  private parseJsonContent(content: string): any {
    try {
      // Remove BOM if present
      const cleanContent = content.replace(/^\uFEFF/, '');
      
      if (cleanContent.trim() === '') {
        return [];
      }

      const parsed = JSON.parse(cleanContent);
      return parsed;

    } catch (error) {
      this.logger.error('Failed to parse JSON content', error as Error);
      
      // Try to provide more helpful error messages
      const jsonError = error as SyntaxError;
      let errorMessage = jsonError.message;
      
      // Extract position information if available
      const positionMatch = errorMessage.match(/position (\d+)/);
      if (positionMatch) {
        const position = parseInt(positionMatch[1], 10);
        const lines = content.substring(0, position).split('\n');
        const lineNumber = lines.length;
        const columnNumber = lines[lines.length - 1].length + 1;
        errorMessage += ` (line ${lineNumber}, column ${columnNumber})`;
      }

      throw ConversionError.conversionFailed(
        `JSON parsing failed: ${errorMessage}`,
        { originalError: error, content: content.substring(0, 200) + '...' }
      );
    }
  }

  /**
   * Convert JSON data to tabular format
   */
  private convertJsonToTabular(jsonData: any): {
    rows: Record<string, any>[];
    headers?: string[];
  } {
    if (Array.isArray(jsonData)) {
      return this.convertArrayToTabular(jsonData);
    } else if (jsonData && typeof jsonData === 'object') {
      return this.convertObjectToTabular(jsonData);
    } else {
      // Primitive value - wrap in an object
      return {
        rows: [{ value: jsonData }],
        headers: ['value']
      };
    }
  }

  /**
   * Convert JSON array to tabular format
   */
  private convertArrayToTabular(jsonArray: any[]): {
    rows: Record<string, any>[];
    headers?: string[];
  } {
    if (jsonArray.length === 0) {
      return { rows: [] };
    }

    // Check if all items are objects with similar structure
    const allObjects = jsonArray.every(item => item && typeof item === 'object' && !Array.isArray(item));
    
    if (allObjects) {
      // Collect all unique keys from all objects
      const allKeys = new Set<string>();
      jsonArray.forEach(item => {
        Object.keys(item).forEach(key => allKeys.add(key));
      });
      
      const headers = Array.from(allKeys).sort();
      
      const rows = jsonArray.map(item => {
        const row: Record<string, any> = {};
        headers.forEach(header => {
          row[header] = item[header] !== undefined ? item[header] : null;
        });
        return row;
      });

      return { rows, headers };
    } else {
      // Mixed types or primitives - create index-based structure
      const rows = jsonArray.map((item, index) => ({
        index,
        value: item,
        type: Array.isArray(item) ? 'array' : typeof item
      }));

      return {
        rows,
        headers: ['index', 'value', 'type']
      };
    }
  }

  /**
   * Convert JSON object to tabular format
   */
  private convertObjectToTabular(jsonObject: Record<string, any>): {
    rows: Record<string, any>[];
    headers?: string[];
  } {
    // Convert object to key-value pairs
    const rows = Object.entries(jsonObject).map(([key, value]) => ({
      key,
      value,
      type: Array.isArray(value) ? 'array' : typeof value
    }));

    return {
      rows,
      headers: ['key', 'value', 'type']
    };
  }

  /**
   * Convert tabular data back to JSON
   */
  private convertTabularToJson(data: DataStructure, options: Required<WriteOptions>): any {
    const outputFormat = options.formatting?.outputFormat || 'array';
    
    switch (outputFormat) {
      case 'object':
        return this.convertTabularToObject(data);
      case 'keyValue':
        return this.convertTabularToKeyValue(data);
      case 'array':
      default:
        return this.convertTabularToArray(data);
    }
  }

  /**
   * Convert tabular data to JSON array
   */
  private convertTabularToArray(data: DataStructure): any[] {
    return data.rows.map(row => {
      const cleanRow: Record<string, any> = {};
      Object.entries(row).forEach(([key, value]) => {
        cleanRow[key] = this.cleanValueForJson(value);
      });
      return cleanRow;
    });
  }

  /**
   * Convert tabular data to JSON object (using first column as keys)
   */
  private convertTabularToObject(data: DataStructure): Record<string, any> {
    const result: Record<string, any> = {};
    
    data.rows.forEach(row => {
      const keys = Object.keys(row);
      if (keys.length > 0) {
        const keyField = keys[0];
        const key = String(row[keyField]);
        
        if (keys.length === 2) {
          // Two columns: key-value pairs
          result[key] = this.cleanValueForJson(row[keys[1]]);
        } else {
          // Multiple columns: use entire row (excluding key field)
          const rowData: Record<string, any> = {};
          keys.slice(1).forEach(field => {
            rowData[field] = this.cleanValueForJson(row[field]);
          });
          result[key] = rowData;
        }
      }
    });
    
    return result;
  }

  /**
   * Convert tabular data to key-value format
   */
  private convertTabularToKeyValue(data: DataStructure): Array<{ key: string; value: any }> {
    return data.rows.map(row => {
      const keys = Object.keys(row);
      return {
        key: keys.length > 0 ? String(row[keys[0]]) : '',
        value: keys.length > 1 ? this.cleanValueForJson(row[keys[1]]) : null
      };
    });
  }

  /**
   * Clean value for JSON serialization
   */
  private cleanValueForJson(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'function') {
      return '[Function]';
    }

    if (typeof value === 'symbol') {
      return value.toString();
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.map(item => this.cleanValueForJson(item));
    }

    if (typeof value === 'object') {
      const cleaned: Record<string, any> = {};
      Object.entries(value).forEach(([key, val]) => {
        cleaned[key] = this.cleanValueForJson(val);
      });
      return cleaned;
    }

    return value;
  }

  /**
   * Generate JSON content string
   */
  private generateJsonContent(jsonData: any, options: Required<WriteOptions>): string {
    try {
      const indent = options.formatting?.indent !== undefined ? options.formatting.indent : 2;
      const sortKeys = options.formatting?.sortKeys || false;
      
      let jsonString: string;
      
      if (sortKeys) {
        // Custom stringify with sorted keys
        jsonString = JSON.stringify(jsonData, this.createSortedReplacer(), indent);
      } else {
        jsonString = JSON.stringify(jsonData, null, indent);
      }

      // Add trailing newline if requested
      if (options.formatting?.trailingNewline !== false) {
        jsonString += '\n';
      }

      return jsonString;

    } catch (error) {
      this.logger.error('Failed to generate JSON content', error as Error);
      throw ConversionError.conversionFailed(
        `JSON generation failed: ${(error as Error).message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Create a replacer function that sorts object keys
   */
  private createSortedReplacer(): (key: string, value: any) => any {
    return (key: string, value: any) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const sorted: Record<string, any> = {};
        Object.keys(value).sort().forEach(sortedKey => {
          sorted[sortedKey] = value[sortedKey];
        });
        return sorted;
      }
      return value;
    };
  }

  /**
   * Determine the type of JSON data
   */
  private getJsonType(jsonData: any): string {
    if (Array.isArray(jsonData)) {
      if (jsonData.length === 0) {
        return 'empty array';
      }
      const firstItem = jsonData[0];
      if (firstItem && typeof firstItem === 'object' && !Array.isArray(firstItem)) {
        return 'array of objects';
      }
      return 'array of primitives';
    } else if (jsonData && typeof jsonData === 'object') {
      return 'object';
    } else {
      return 'primitive';
    }
  }

  /**
   * Get JSON-specific formatting options
   */
  getJsonFormattingOptions(): {
    outputFormats: string[];
    indentOptions: number[];
    features: string[];
  } {
    return {
      outputFormats: ['array', 'object', 'keyValue'],
      indentOptions: [0, 2, 4, 8],
      features: [
        'Pretty printing with configurable indentation',
        'Key sorting',
        'Multiple output formats',
        'Automatic type conversion',
        'Circular reference detection',
        'Deep nesting validation',
        'Large file size warnings',
        'BOM handling',
        'Trailing newline option'
      ]
    };
  }

  /**
   * Validate JSON string without parsing
   */
  validateJsonString(jsonString: string): {
    isValid: boolean;
    error?: string;
    position?: { line: number; column: number };
  } {
    try {
      JSON.parse(jsonString);
      return { isValid: true };
    } catch (error) {
      const jsonError = error as SyntaxError;
      let errorMessage = jsonError.message;
      let position: { line: number; column: number } | undefined;

      // Extract position information if available
      const positionMatch = errorMessage.match(/position (\d+)/);
      if (positionMatch) {
        const pos = parseInt(positionMatch[1], 10);
        const lines = jsonString.substring(0, pos).split('\n');
        position = {
          line: lines.length,
          column: lines[lines.length - 1].length + 1
        };
      }

      return {
        isValid: false,
        error: errorMessage,
        position
      };
    }
  }

  /**
   * Get JSON schema information from data
   */
  inferJsonSchema(data: DataStructure): {
    type: string;
    properties?: Record<string, { type: string; required: boolean }>;
    items?: { type: string };
  } {
    if (data.rows.length === 0) {
      return { type: 'array', items: { type: 'object' } };
    }

    // Analyze the structure of the data
    const properties: Record<string, { type: string; required: boolean }> = {};
    const fieldCounts: Record<string, number> = {};

    data.rows.forEach(row => {
      Object.entries(row).forEach(([key, value]) => {
        fieldCounts[key] = (fieldCounts[key] || 0) + 1;
        
        if (!properties[key]) {
          properties[key] = {
            type: this.inferJsonType(value),
            required: false
          };
        }
      });
    });

    // Determine which fields are required (present in most rows)
    const totalRows = data.rows.length;
    Object.keys(properties).forEach(key => {
      properties[key].required = fieldCounts[key] / totalRows > 0.8; // 80% threshold
    });

    return {
      type: 'array',
      items: {
        type: 'object'
      },
      properties
    };
  }

  /**
   * Infer JSON type from value
   */
  private inferJsonType(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    
    if (typeof value === 'string') {
      return 'string';
    }
    
    if (typeof value === 'number') {
      return Number.isInteger(value) ? 'integer' : 'number';
    }
    
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    
    if (Array.isArray(value)) {
      return 'array';
    }
    
    if (typeof value === 'object') {
      return 'object';
    }
    
    return 'string'; // Default fallback
  }
}