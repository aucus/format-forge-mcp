import { DataStructure, SupportedFormat, ValidationResult, ValidationError, ValidationWarning } from '../types/index.js';

/**
 * Data structure implementation with validation
 */
export class DataStructureImpl implements DataStructure {
  public headers?: string[];
  public rows: Record<string, any>[];
  public metadata: {
    originalFormat: SupportedFormat;
    encoding: string;
    sheetName?: string;
    totalRows: number;
    totalColumns: number;
  };

  constructor(
    rows: Record<string, any>[],
    originalFormat: SupportedFormat,
    encoding: string = 'utf-8',
    headers?: string[],
    sheetName?: string
  ) {
    this.rows = rows;
    this.headers = headers;
    this.metadata = {
      originalFormat,
      encoding,
      sheetName,
      totalRows: rows.length,
      totalColumns: headers ? headers.length : this.calculateColumnCount()
    };
  }

  /**
   * Calculate the maximum number of columns across all rows
   */
  private calculateColumnCount(): number {
    if (this.rows.length === 0) return 0;
    
    return Math.max(...this.rows.map(row => Object.keys(row).length));
  }

  /**
   * Validate the data structure
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check if rows exist
    if (!this.rows || !Array.isArray(this.rows)) {
      errors.push({
        code: 'INVALID_ROWS',
        message: 'Rows must be an array'
      });
      return { isValid: false, errors, warnings };
    }

    // Check metadata
    if (!this.metadata) {
      errors.push({
        code: 'MISSING_METADATA',
        message: 'Metadata is required'
      });
    } else {
      if (!this.metadata.originalFormat) {
        errors.push({
          code: 'MISSING_FORMAT',
          message: 'Original format is required in metadata'
        });
      }

      if (!this.metadata.encoding) {
        errors.push({
          code: 'MISSING_ENCODING',
          message: 'Encoding is required in metadata'
        });
      }
    }

    // Validate headers if present
    if (this.headers) {
      if (!Array.isArray(this.headers)) {
        errors.push({
          code: 'INVALID_HEADERS',
          message: 'Headers must be an array'
        });
      } else {
        // Check for duplicate headers
        const duplicates = this.findDuplicateHeaders();
        if (duplicates.length > 0) {
          warnings.push({
            code: 'DUPLICATE_HEADERS',
            message: `Duplicate headers found: ${duplicates.join(', ')}`
          });
        }

        // Check for empty headers
        const emptyHeaders = this.headers.filter((header, index) => 
          !header || header.trim() === ''
        );
        if (emptyHeaders.length > 0) {
          warnings.push({
            code: 'EMPTY_HEADERS',
            message: 'Some headers are empty or contain only whitespace'
          });
        }
      }
    }

    // Validate rows
    this.rows.forEach((row, rowIndex) => {
      if (!row || typeof row !== 'object') {
        errors.push({
          code: 'INVALID_ROW',
          message: `Row ${rowIndex} is not a valid object`,
          row: rowIndex
        });
        return;
      }

      // Check if row has data
      if (Object.keys(row).length === 0) {
        warnings.push({
          code: 'EMPTY_ROW',
          message: `Row ${rowIndex} is empty`,
          row: rowIndex
        });
      }

      // If headers are defined, check for consistency
      if (this.headers) {
        const rowKeys = Object.keys(row);
        const missingFields = this.headers.filter(header => !(header in row));
        const extraFields = rowKeys.filter(key => !this.headers!.includes(key));

        if (missingFields.length > 0) {
          warnings.push({
            code: 'MISSING_FIELDS',
            message: `Row ${rowIndex} missing fields: ${missingFields.join(', ')}`,
            row: rowIndex
          });
        }

        if (extraFields.length > 0) {
          warnings.push({
            code: 'EXTRA_FIELDS',
            message: `Row ${rowIndex} has extra fields: ${extraFields.join(', ')}`,
            row: rowIndex
          });
        }
      }
    });

    // Check metadata consistency
    if (this.metadata.totalRows !== this.rows.length) {
      warnings.push({
        code: 'METADATA_MISMATCH',
        message: `Metadata totalRows (${this.metadata.totalRows}) doesn't match actual rows (${this.rows.length})`
      });
    }

    if (this.headers && this.metadata.totalColumns !== this.headers.length) {
      warnings.push({
        code: 'METADATA_MISMATCH',
        message: `Metadata totalColumns (${this.metadata.totalColumns}) doesn't match headers length (${this.headers.length})`
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Find duplicate headers
   */
  private findDuplicateHeaders(): string[] {
    if (!this.headers) return [];

    const seen = new Set<string>();
    const duplicates = new Set<string>();

    this.headers.forEach(header => {
      if (seen.has(header)) {
        duplicates.add(header);
      } else {
        seen.add(header);
      }
    });

    return Array.from(duplicates);
  }

  /**
   * Get a summary of the data structure
   */
  getSummary(): {
    rowCount: number;
    columnCount: number;
    hasHeaders: boolean;
    format: SupportedFormat;
    encoding: string;
    sheetName?: string;
  } {
    return {
      rowCount: this.rows.length,
      columnCount: this.metadata.totalColumns,
      hasHeaders: !!this.headers,
      format: this.metadata.originalFormat,
      encoding: this.metadata.encoding,
      sheetName: this.metadata.sheetName
    };
  }

  /**
   * Get column names (headers or inferred from first row)
   */
  getColumnNames(): string[] {
    if (this.headers) {
      return [...this.headers];
    }

    if (this.rows.length > 0) {
      return Object.keys(this.rows[0]);
    }

    return [];
  }

  /**
   * Get a sample of the data (first few rows)
   */
  getSample(count: number = 5): Record<string, any>[] {
    return this.rows.slice(0, count);
  }

  /**
   * Clone the data structure
   */
  clone(): DataStructureImpl {
    return new DataStructureImpl(
      JSON.parse(JSON.stringify(this.rows)),
      this.metadata.originalFormat,
      this.metadata.encoding,
      this.headers ? [...this.headers] : undefined,
      this.metadata.sheetName
    );
  }

  /**
   * Convert to plain object
   */
  toPlainObject(): DataStructure {
    return {
      headers: this.headers ? [...this.headers] : undefined,
      rows: JSON.parse(JSON.stringify(this.rows)),
      metadata: { ...this.metadata }
    };
  }
}