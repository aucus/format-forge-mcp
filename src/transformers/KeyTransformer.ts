import { DataStructure, KeyStyle } from '../types/index.js';
import { Logger } from '../core/Logger.js';

/**
 * Key transformation utilities for different naming conventions
 */
export class KeyTransformer {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Transform all keys in a data structure to the specified style
   */
  transformKeys(data: DataStructure, style: KeyStyle): DataStructure {
    this.logger.debug('Transforming keys', { style, rowCount: data.rows.length });

    try {
      // Transform headers if they exist
      const transformedHeaders = data.headers 
        ? data.headers.map(header => this.transformKey(header, style))
        : undefined;

      // Transform row keys
      const transformedRows = data.rows.map(row => {
        const transformedRow: Record<string, any> = {};
        
        Object.entries(row).forEach(([key, value]) => {
          const transformedKey = this.transformKey(key, style);
          transformedRow[transformedKey] = this.transformNestedKeys(value, style);
        });
        
        return transformedRow;
      });

      // Update metadata if it contains column count
      const newColumnCount = transformedHeaders?.length || 
        (transformedRows.length > 0 ? Object.keys(transformedRows[0]).length : 0);

      const result: DataStructure = {
        rows: transformedRows,
        headers: transformedHeaders,
        metadata: {
          ...data.metadata,
          totalColumns: newColumnCount
        }
      };

      this.logger.debug('Key transformation completed', { 
        style, 
        originalColumns: data.metadata.totalColumns,
        newColumns: newColumnCount
      });

      return result;

    } catch (error) {
      this.logger.error('Key transformation failed', error as Error, { style });
      throw error;
    }
  }

  /**
   * Transform a single key to the specified style
   */
  transformKey(key: string, style: KeyStyle): string {
    if (!key || typeof key !== 'string') {
      return key;
    }

    switch (style) {
      case 'camelCase':
        return this.toCamelCase(key);
      case 'snake_case':
        return this.toSnakeCase(key);
      case 'lowercase':
        return this.toLowerCase(key);
      case 'uppercase':
        return this.toUpperCase(key);
      default:
        return key;
    }
  }

  /**
   * Transform nested object keys recursively
   */
  private transformNestedKeys(value: any, style: KeyStyle): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => this.transformNestedKeys(item, style));
    }

    if (typeof value === 'object' && !(value instanceof Date)) {
      const transformedObject: Record<string, any> = {};
      
      Object.entries(value).forEach(([key, val]) => {
        const transformedKey = this.transformKey(key, style);
        transformedObject[transformedKey] = this.transformNestedKeys(val, style);
      });
      
      return transformedObject;
    }

    return value;
  }

  /**
   * Convert string to camelCase
   */
  private toCamelCase(str: string): string {
    // Handle already camelCase strings
    if (this.isCamelCase(str)) {
      return str;
    }

    return str
      // Split on various separators
      .split(/[\s_-]+/)
      // Filter out empty strings
      .filter(word => word.length > 0)
      // Convert to camelCase
      .map((word, index) => {
        const cleanWord = word.toLowerCase();
        return index === 0 
          ? cleanWord 
          : cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1);
      })
      .join('');
  }

  /**
   * Convert string to snake_case
   */
  private toSnakeCase(str: string): string {
    // Handle already snake_case strings
    if (this.isSnakeCase(str)) {
      return str;
    }

    return str
      // Insert underscore before uppercase letters (for camelCase)
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      // Replace spaces and hyphens with underscores
      .replace(/[\s-]+/g, '_')
      // Convert to lowercase
      .toLowerCase()
      // Remove multiple consecutive underscores
      .replace(/_+/g, '_')
      // Remove leading/trailing underscores
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Convert string to lowercase with spaces replaced by underscores
   */
  private toLowerCase(str: string): string {
    return str
      // Replace spaces and hyphens with underscores
      .replace(/[\s-]+/g, '_')
      // Insert underscore before uppercase letters (for camelCase)
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      // Convert to lowercase
      .toLowerCase()
      // Remove multiple consecutive underscores
      .replace(/_+/g, '_')
      // Remove leading/trailing underscores
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Convert string to UPPERCASE
   */
  private toUpperCase(str: string): string {
    return str
      // Replace spaces and hyphens with underscores
      .replace(/[\s-]+/g, '_')
      // Insert underscore before uppercase letters (for camelCase)
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      // Convert to uppercase
      .toUpperCase()
      // Remove multiple consecutive underscores
      .replace(/_+/g, '_')
      // Remove leading/trailing underscores
      .replace(/^_+|_+$/g, '');
  }

  /**
   * Check if string is already in camelCase
   */
  private isCamelCase(str: string): boolean {
    // camelCase: starts with lowercase, may contain uppercase letters, no spaces/underscores/hyphens
    return /^[a-z][a-zA-Z0-9]*$/.test(str) && /[A-Z]/.test(str);
  }

  /**
   * Check if string is already in snake_case
   */
  private isSnakeCase(str: string): boolean {
    // snake_case: lowercase letters, numbers, and underscores only
    return /^[a-z0-9_]+$/.test(str) && !str.startsWith('_') && !str.endsWith('_');
  }

  /**
   * Get transformation preview for a set of keys
   */
  getTransformationPreview(keys: string[], style: KeyStyle): Array<{
    original: string;
    transformed: string;
    changed: boolean;
  }> {
    return keys.map(key => {
      const transformed = this.transformKey(key, style);
      return {
        original: key,
        transformed,
        changed: key !== transformed
      };
    });
  }

  /**
   * Detect the current key style of a set of keys
   */
  detectKeyStyle(keys: string[]): {
    detectedStyle: KeyStyle | 'mixed' | 'unknown';
    confidence: number;
    analysis: {
      camelCase: number;
      snake_case: number;
      lowercase: number;
      uppercase: number;
      mixed: number;
    };
  } {
    if (keys.length === 0) {
      return {
        detectedStyle: 'unknown',
        confidence: 0,
        analysis: { camelCase: 0, snake_case: 0, lowercase: 0, uppercase: 0, mixed: 0 }
      };
    }

    const analysis = {
      camelCase: 0,
      snake_case: 0,
      lowercase: 0,
      uppercase: 0,
      mixed: 0
    };

    keys.forEach(key => {
      if (this.isCamelCase(key)) {
        analysis.camelCase++;
      } else if (this.isSnakeCase(key)) {
        analysis.snake_case++;
      } else if (key === key.toLowerCase() && !/[_\s-]/.test(key)) {
        analysis.lowercase++;
      } else if (key === key.toUpperCase() && !/[a-z]/.test(key)) {
        analysis.uppercase++;
      } else {
        analysis.mixed++;
      }
    });

    // Find the most common style
    const maxCount = Math.max(...Object.values(analysis));
    const totalKeys = keys.length;
    const confidence = maxCount / totalKeys;

    let detectedStyle: KeyStyle | 'mixed' | 'unknown';

    if (confidence < 0.5) {
      detectedStyle = 'mixed';
    } else if (analysis.camelCase === maxCount) {
      detectedStyle = 'camelCase';
    } else if (analysis.snake_case === maxCount) {
      detectedStyle = 'snake_case';
    } else if (analysis.lowercase === maxCount) {
      detectedStyle = 'lowercase';
    } else if (analysis.uppercase === maxCount) {
      detectedStyle = 'uppercase';
    } else {
      detectedStyle = 'unknown';
    }

    return {
      detectedStyle,
      confidence,
      analysis
    };
  }

  /**
   * Validate key transformation results
   */
  validateTransformation(
    originalKeys: string[], 
    transformedKeys: string[], 
    style: KeyStyle
  ): {
    isValid: boolean;
    issues: Array<{
      type: 'duplicate' | 'empty' | 'invalid';
      message: string;
      keys?: string[];
    }>;
  } {
    const issues: Array<{
      type: 'duplicate' | 'empty' | 'invalid';
      message: string;
      keys?: string[];
    }> = [];

    // Check for empty keys
    const emptyKeys = transformedKeys.filter(key => !key || key.trim() === '');
    if (emptyKeys.length > 0) {
      issues.push({
        type: 'empty',
        message: `${emptyKeys.length} keys became empty after transformation`
      });
    }

    // Check for duplicate keys
    const keyCount = new Map<string, number>();
    transformedKeys.forEach(key => {
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    });

    const duplicates = Array.from(keyCount.entries())
      .filter(([, count]) => count > 1)
      .map(([key]) => key);

    if (duplicates.length > 0) {
      issues.push({
        type: 'duplicate',
        message: `${duplicates.length} duplicate keys found after transformation`,
        keys: duplicates
      });
    }

    // Check for invalid characters based on style
    const invalidKeys: string[] = [];
    transformedKeys.forEach(key => {
      if (!this.isValidKeyForStyle(key, style)) {
        invalidKeys.push(key);
      }
    });

    if (invalidKeys.length > 0) {
      issues.push({
        type: 'invalid',
        message: `${invalidKeys.length} keys don't match the expected ${style} format`,
        keys: invalidKeys
      });
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Check if a key is valid for the specified style
   */
  private isValidKeyForStyle(key: string, style: KeyStyle): boolean {
    switch (style) {
      case 'camelCase':
        return /^[a-z][a-zA-Z0-9]*$/.test(key);
      case 'snake_case':
        return /^[a-z0-9_]+$/.test(key) && !key.startsWith('_') && !key.endsWith('_');
      case 'lowercase':
        return /^[a-z0-9_]+$/.test(key);
      case 'uppercase':
        return /^[A-Z0-9_]+$/.test(key);
      default:
        return true;
    }
  }

  /**
   * Get suggested key transformations for common issues
   */
  getSuggestedTransformations(keys: string[]): Array<{
    key: string;
    issues: string[];
    suggestions: Array<{
      style: KeyStyle;
      result: string;
      description: string;
    }>;
  }> {
    return keys.map(key => {
      const issues: string[] = [];
      const suggestions: Array<{
        style: KeyStyle;
        result: string;
        description: string;
      }> = [];

      // Identify issues
      if (key.includes(' ')) {
        issues.push('Contains spaces');
      }
      if (key.includes('-')) {
        issues.push('Contains hyphens');
      }
      if (/[^a-zA-Z0-9_\s-]/.test(key)) {
        issues.push('Contains special characters');
      }
      if (key !== key.trim()) {
        issues.push('Has leading/trailing whitespace');
      }

      // Generate suggestions
      const styles: KeyStyle[] = ['camelCase', 'snake_case', 'lowercase', 'uppercase'];
      styles.forEach(style => {
        const transformed = this.transformKey(key, style);
        if (transformed !== key) {
          suggestions.push({
            style,
            result: transformed,
            description: `Convert to ${style}`
          });
        }
      });

      return {
        key,
        issues,
        suggestions
      };
    });
  }

  /**
   * Create a key mapping for transformation
   */
  createKeyMapping(keys: string[], style: KeyStyle): Map<string, string> {
    const mapping = new Map<string, string>();
    
    keys.forEach(key => {
      const transformed = this.transformKey(key, style);
      mapping.set(key, transformed);
    });

    return mapping;
  }

  /**
   * Apply a custom key mapping to data structure
   */
  applyKeyMapping(data: DataStructure, keyMapping: Map<string, string>): DataStructure {
    this.logger.debug('Applying custom key mapping', { 
      mappingSize: keyMapping.size,
      rowCount: data.rows.length 
    });

    // Transform headers if they exist
    const transformedHeaders = data.headers 
      ? data.headers.map(header => keyMapping.get(header) || header)
      : undefined;

    // Transform row keys
    const transformedRows = data.rows.map(row => {
      const transformedRow: Record<string, any> = {};
      
      Object.entries(row).forEach(([key, value]) => {
        const newKey = keyMapping.get(key) || key;
        transformedRow[newKey] = value;
      });
      
      return transformedRow;
    });

    return {
      rows: transformedRows,
      headers: transformedHeaders,
      metadata: {
        ...data.metadata,
        totalColumns: transformedHeaders?.length || 
          (transformedRows.length > 0 ? Object.keys(transformedRows[0]).length : 0)
      }
    };
  }
}