import { BaseFormatHandler } from './BaseFormatHandler.js';
import { DataStructure, ReadOptions, WriteOptions, ValidationResult } from '../types/index.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as Papa from 'papaparse';

/**
 * CSV format handler using PapaParse library
 */
export class CsvFormatHandler extends BaseFormatHandler {
  constructor() {
    super(['csv'], ['.csv']);
  }

  /**
   * Read CSV file and convert to DataStructure
   */
  async read(filePath: string, options?: ReadOptions): Promise<DataStructure> {
    this.logOperation('Reading CSV file', filePath, options);

    try {
      const readOptions = this.parseReadOptions(options);
      const content = await this.readFileContent(filePath, readOptions.encoding);

      // Parse CSV content using PapaParse
      const parseResult = this.parseCSVContent(content, readOptions);

      // Create and return data structure
      const dataStructure = this.createDataStructure(
        parseResult.data,
        'csv',
        readOptions.encoding,
        parseResult.headers
      );

      this.logOperation('CSV file read successfully', filePath, {
        rowCount: parseResult.data.length,
        columnCount: parseResult.headers?.length || 0,
        hasHeaders: !!parseResult.headers
      });

      return dataStructure;

    } catch (error) {
      this.handleError(error as Error, 'read', filePath);
    }
  }

  /**
   * Write DataStructure to CSV file
   */
  async write(data: DataStructure, filePath: string, options?: WriteOptions): Promise<void> {
    this.logOperation('Writing CSV file', filePath, options);

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

      // Generate CSV content
      const csvContent = this.generateCSVContent(data, writeOptions);

      // Write to file
      await this.writeFileContent(filePath, csvContent, writeOptions.encoding);

      this.logOperation('CSV file written successfully', filePath, {
        rowCount: data.rows.length,
        columnCount: data.headers?.length || Object.keys(data.rows[0] || {}).length,
        hasHeaders: !!data.headers
      });

    } catch (error) {
      this.handleError(error as Error, 'write', filePath);
    }
  }

  /**
   * Validate CSV-specific data structure
   */
  protected validateFormatSpecific(data: DataStructure): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    // CSV-specific validations
    if (data.rows.length === 0) {
      warnings.push(ValidationUtils.createWarning(
        'EMPTY_CSV_DATA',
        'CSV data contains no rows',
        'rows'
      ));
    }

    // Check for consistent field structure
    if (data.rows.length > 0) {
      const firstRowKeys = Object.keys(data.rows[0]);
      const inconsistentRows: number[] = [];

      data.rows.forEach((row, index) => {
        const rowKeys = Object.keys(row);
        
        // Check if row has different number of fields
        if (rowKeys.length !== firstRowKeys.length) {
          inconsistentRows.push(index);
        }

        // Check if row has different field names (when no headers defined)
        if (!data.headers) {
          const missingKeys = firstRowKeys.filter(key => !(key in row));
          const extraKeys = rowKeys.filter(key => !firstRowKeys.includes(key));
          
          if (missingKeys.length > 0 || extraKeys.length > 0) {
            inconsistentRows.push(index);
          }
        }
      });

      if (inconsistentRows.length > 0) {
        warnings.push(ValidationUtils.createWarning(
          'INCONSISTENT_CSV_STRUCTURE',
          `${inconsistentRows.length} rows have inconsistent field structure`,
          'rows'
        ));
      }
    }

    // Validate headers if present
    if (data.headers) {
      // Check for empty headers
      const emptyHeaders = data.headers.filter((header, index) => 
        !header || header.trim() === ''
      );
      
      if (emptyHeaders.length > 0) {
        warnings.push(ValidationUtils.createWarning(
          'EMPTY_CSV_HEADERS',
          `${emptyHeaders.length} headers are empty or whitespace`,
          'headers'
        ));
      }

      // Check for duplicate headers
      const duplicates = this.findDuplicateHeaders(data.headers);
      if (duplicates.length > 0) {
        warnings.push(ValidationUtils.createWarning(
          'DUPLICATE_CSV_HEADERS',
          `Duplicate headers found: ${duplicates.join(', ')}`,
          'headers'
        ));
      }

      // Check if headers match row structure
      if (data.rows.length > 0) {
        const firstRowKeys = Object.keys(data.rows[0]);
        const headerMismatch = data.headers.length !== firstRowKeys.length;
        
        if (headerMismatch) {
          warnings.push(ValidationUtils.createWarning(
            'HEADER_ROW_MISMATCH',
            `Header count (${data.headers.length}) doesn't match row field count (${firstRowKeys.length})`,
            'headers'
          ));
        }
      }
    }

    // Check for special characters that might cause CSV parsing issues
    const problematicChars = ['\n', '\r', '"'];
    let hasProblematicData = false;

    data.rows.forEach((row, rowIndex) => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'string') {
          const hasProblematic = problematicChars.some(char => value.includes(char));
          if (hasProblematic) {
            hasProblematicData = true;
          }
        }
      });
    });

    if (hasProblematicData) {
      warnings.push(ValidationUtils.createWarning(
        'PROBLEMATIC_CSV_CHARACTERS',
        'Data contains characters that may require special CSV escaping (newlines, quotes)',
        'rows'
      ));
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Parse CSV content using PapaParse
   */
  private parseCSVContent(content: string, options: ReadOptions): {
    data: Record<string, any>[];
    headers?: string[];
  } {
    try {
      // Detect delimiter
      const delimiter = this.detectDelimiter(content);
      
      // Configure PapaParse options
      const parseConfig: Papa.ParseConfig = {
        delimiter,
        header: true, // Always parse with headers initially
        skipEmptyLines: true,
        dynamicTyping: true, // Auto-convert numbers and booleans
        transformHeader: (header: string) => header.trim(),
        complete: undefined
      };

      // Parse the CSV
      const parseResult = Papa.parse(content, parseConfig);

      if (parseResult.errors.length > 0) {
        const errorMessages = parseResult.errors.map(err => 
          `Line ${err.row}: ${err.message}`
        );
        
        this.logger.warn('CSV parsing warnings', { 
          errors: errorMessages,
          errorCount: parseResult.errors.length 
        });

        // Only throw if there are critical errors
        const criticalErrors = parseResult.errors.filter(err => 
          err.type === 'Delimiter' || err.type === 'Quotes'
        );
        
        if (criticalErrors.length > 0) {
          throw new Error(`CSV parsing failed: ${criticalErrors[0].message}`);
        }
      }

      const data = parseResult.data as Record<string, any>[];
      
      // Get headers from the parsed result
      const headers = parseResult.meta.fields;

      // Clean up the data
      const cleanedData = this.cleanCSVData(data);

      return {
        data: cleanedData,
        headers: headers && headers.length > 0 ? headers : undefined
      };

    } catch (error) {
      this.logger.error('Failed to parse CSV content', error as Error);
      throw ConversionError.conversionFailed(
        `CSV parsing failed: ${(error as Error).message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Generate CSV content from DataStructure
   */
  private generateCSVContent(data: DataStructure, options: Required<WriteOptions>): string {
    try {
      // Prepare data for CSV generation
      const csvData = this.prepareDataForCSV(data);
      
      // Configure PapaParse unparse options
      const unparseConfig: Papa.UnparseConfig = {
        quotes: true, // Always quote fields to handle special characters
        quoteChar: '"',
        escapeChar: '"',
        delimiter: ',',
        header: !!data.headers,
        newline: '\n',
        skipEmptyLines: false
      };

      // Generate CSV content
      const csvContent = Papa.unparse(csvData, unparseConfig);

      return csvContent;

    } catch (error) {
      this.logger.error('Failed to generate CSV content', error as Error);
      throw ConversionError.conversionFailed(
        `CSV generation failed: ${(error as Error).message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Detect CSV delimiter from content sample
   */
  private detectDelimiter(content: string): string {
    const sample = content.substring(0, 1024); // Use first 1KB for detection
    const delimiters = [',', ';', '\t', '|'];
    const scores: Record<string, number> = {};

    delimiters.forEach(delimiter => {
      const lines = sample.split('\n').slice(0, 5); // Check first 5 lines
      const fieldCounts = lines.map(line => line.split(delimiter).length);
      
      // Score based on consistency of field counts
      if (fieldCounts.length > 1) {
        const firstCount = fieldCounts[0];
        const consistent = fieldCounts.every(count => count === firstCount);
        const avgCount = fieldCounts.reduce((sum, count) => sum + count, 0) / fieldCounts.length;
        
        scores[delimiter] = consistent ? avgCount * 2 : avgCount;
      } else {
        scores[delimiter] = fieldCounts[0] || 0;
      }
    });

    // Return delimiter with highest score
    const bestDelimiter = Object.entries(scores).reduce((best, [delimiter, score]) => 
      score > best.score ? { delimiter, score } : best,
      { delimiter: ',', score: 0 }
    );

    this.logger.debug('CSV delimiter detected', { 
      delimiter: bestDelimiter.delimiter,
      scores 
    });

    return bestDelimiter.delimiter;
  }

  /**
   * Clean CSV data after parsing
   */
  private cleanCSVData(data: Record<string, any>[]): Record<string, any>[] {
    return data.map(row => {
      const cleanedRow: Record<string, any> = {};
      
      Object.entries(row).forEach(([key, value]) => {
        // Clean up key (remove extra whitespace, handle empty keys)
        const cleanKey = key.trim() || `column_${Object.keys(cleanedRow).length}`;
        
        // Clean up value
        let cleanValue = value;
        
        // Handle null/undefined values
        if (cleanValue === null || cleanValue === undefined || cleanValue === '') {
          cleanValue = null;
        }
        
        // Handle string values
        if (typeof cleanValue === 'string') {
          cleanValue = cleanValue.trim();
          
          // Convert empty strings to null
          if (cleanValue === '') {
            cleanValue = null;
          }
        }
        
        cleanedRow[cleanKey] = cleanValue;
      });
      
      return cleanedRow;
    });
  }

  /**
   * Prepare data structure for CSV generation
   */
  private prepareDataForCSV(data: DataStructure): any[] {
    if (data.headers) {
      // If headers are defined, ensure all rows have all header fields
      return data.rows.map(row => {
        const csvRow: Record<string, any> = {};
        
        data.headers!.forEach(header => {
          csvRow[header] = this.formatValueForCSV(row[header]);
        });
        
        return csvRow;
      });
    } else {
      // No headers defined, use rows as-is but format values
      return data.rows.map(row => {
        const csvRow: Record<string, any> = {};
        
        Object.entries(row).forEach(([key, value]) => {
          csvRow[key] = this.formatValueForCSV(value);
        });
        
        return csvRow;
      });
    }
  }

  /**
   * Format value for CSV output
   */
  private formatValueForCSV(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number') {
      return value.toString();
    }
    
    if (typeof value === 'boolean') {
      return value.toString();
    }
    
    if (value instanceof Date) {
      return value.toISOString();
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  }

  /**
   * Find duplicate headers
   */
  private findDuplicateHeaders(headers: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    headers.forEach(header => {
      if (seen.has(header)) {
        duplicates.add(header);
      } else {
        seen.add(header);
      }
    });

    return Array.from(duplicates);
  }

  /**
   * Get CSV-specific parsing options
   */
  getCSVParsingOptions(): {
    supportedDelimiters: string[];
    supportedEncodings: string[];
    features: string[];
  } {
    return {
      supportedDelimiters: [',', ';', '\t', '|'],
      supportedEncodings: ['utf-8', 'utf-16', 'latin1', 'ascii'],
      features: [
        'Auto delimiter detection',
        'Header row support',
        'Dynamic typing (numbers, booleans)',
        'Empty line skipping',
        'Quote handling',
        'Escape character support'
      ]
    };
  }
}