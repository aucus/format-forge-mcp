import { BaseFormatHandler } from './BaseFormatHandler.js';
import { DataStructure, ReadOptions, WriteOptions, ValidationResult } from '../types/index.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as ExcelJS from 'exceljs';

/**
 * Excel format handler using ExcelJS library
 */
export class ExcelFormatHandler extends BaseFormatHandler {
  constructor() {
    super(['xlsx'], ['.xlsx', '.xls']);
  }

  /**
   * Read Excel file and convert to DataStructure
   */
  async read(filePath: string, options?: ReadOptions): Promise<DataStructure> {
    this.logOperation('Reading Excel file', filePath, options);

    try {
      const readOptions = this.parseReadOptions(options);
      
      // Create workbook and load file
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      // Get the worksheet to read from
      const worksheet = this.getWorksheet(workbook, readOptions);
      
      // Extract data from worksheet
      const extractedData = this.extractDataFromWorksheet(worksheet, readOptions);

      // Create and return data structure
      const dataStructure = this.createDataStructure(
        extractedData.rows,
        'xlsx',
        readOptions.encoding,
        extractedData.headers,
        extractedData.sheetName
      );

      this.logOperation('Excel file read successfully', filePath, {
        sheetName: extractedData.sheetName,
        rowCount: extractedData.rows.length,
        columnCount: extractedData.headers?.length || 0,
        hasHeaders: !!extractedData.headers
      });

      return dataStructure;

    } catch (error) {
      this.handleError(error as Error, 'read', filePath);
    }
  }

  /**
   * Write DataStructure to Excel file
   */
  async write(data: DataStructure, filePath: string, options?: WriteOptions): Promise<void> {
    this.logOperation('Writing Excel file', filePath, options);

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

      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const sheetName = data.metadata.sheetName || 'Sheet1';
      const worksheet = workbook.addWorksheet(sheetName);

      // Populate worksheet with data
      this.populateWorksheet(worksheet, data, writeOptions);

      // Write to file
      await workbook.xlsx.writeFile(filePath);

      this.logOperation('Excel file written successfully', filePath, {
        sheetName,
        rowCount: data.rows.length,
        columnCount: data.headers?.length || Object.keys(data.rows[0] || {}).length,
        hasHeaders: !!data.headers
      });

    } catch (error) {
      this.handleError(error as Error, 'write', filePath);
    }
  }

  /**
   * Validate Excel-specific data structure
   */
  protected validateFormatSpecific(data: DataStructure): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Excel-specific validations
    if (data.rows.length === 0) {
      warnings.push(ValidationUtils.createWarning(
        'EMPTY_EXCEL_DATA',
        'Excel data contains no rows',
        'rows'
      ));
    }

    // Check for Excel limitations
    const maxRows = 1048576; // Excel 2007+ row limit
    const maxColumns = 16384; // Excel 2007+ column limit

    if (data.rows.length > maxRows) {
      errors.push(ValidationUtils.createError(
        'EXCEL_ROW_LIMIT_EXCEEDED',
        `Excel row limit exceeded: ${data.rows.length} > ${maxRows}`,
        'rows'
      ));
    }

    const columnCount = data.headers?.length || 
      (data.rows.length > 0 ? Object.keys(data.rows[0]).length : 0);
    
    if (columnCount > maxColumns) {
      errors.push(ValidationUtils.createError(
        'EXCEL_COLUMN_LIMIT_EXCEEDED',
        `Excel column limit exceeded: ${columnCount} > ${maxColumns}`,
        'headers'
      ));
    }

    // Check for problematic sheet names
    if (data.metadata.sheetName) {
      const sheetName = data.metadata.sheetName;
      const invalidChars = ['\\', '/', '*', '?', ':', '[', ']'];
      const hasInvalidChars = invalidChars.some(char => sheetName.includes(char));
      
      if (hasInvalidChars) {
        warnings.push(ValidationUtils.createWarning(
          'INVALID_SHEET_NAME_CHARS',
          `Sheet name contains invalid characters: ${sheetName}`,
          'metadata.sheetName'
        ));
      }

      if (sheetName.length > 31) {
        warnings.push(ValidationUtils.createWarning(
          'SHEET_NAME_TOO_LONG',
          `Sheet name exceeds 31 character limit: ${sheetName}`,
          'metadata.sheetName'
        ));
      }
    }

    // Check for data types that might not translate well to Excel
    let hasComplexData = false;
    data.rows.forEach((row, rowIndex) => {
      Object.entries(row).forEach(([key, value]) => {
        if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
          hasComplexData = true;
        }
      });
    });

    if (hasComplexData) {
      warnings.push(ValidationUtils.createWarning(
        'COMPLEX_DATA_TYPES',
        'Data contains complex objects that will be converted to strings in Excel',
        'rows'
      ));
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Get worksheet from workbook based on options
   */
  private getWorksheet(workbook: ExcelJS.Workbook, options: ReadOptions): ExcelJS.Worksheet {
    let worksheet: ExcelJS.Worksheet | undefined;

    if (options.sheetName) {
      // Get worksheet by name
      worksheet = workbook.getWorksheet(options.sheetName);
      if (!worksheet) {
        const availableSheets = workbook.worksheets.map(ws => ws.name);
        throw ConversionError.conversionFailed(
          `Sheet '${options.sheetName}' not found. Available sheets: ${availableSheets.join(', ')}`,
          { sheetName: options.sheetName, availableSheets }
        );
      }
    } else if (options.sheetIndex !== undefined) {
      // Get worksheet by index (1-based)
      worksheet = workbook.getWorksheet(options.sheetIndex + 1);
      if (!worksheet) {
        throw ConversionError.conversionFailed(
          `Sheet at index ${options.sheetIndex} not found. Total sheets: ${workbook.worksheets.length}`,
          { sheetIndex: options.sheetIndex, totalSheets: workbook.worksheets.length }
        );
      }
    } else {
      // Get first worksheet
      worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw ConversionError.conversionFailed(
          'No worksheets found in Excel file',
          { totalSheets: 0 }
        );
      }
    }

    return worksheet;
  }

  /**
   * Extract data from Excel worksheet
   */
  private extractDataFromWorksheet(
    worksheet: ExcelJS.Worksheet, 
    options: ReadOptions
  ): {
    rows: Record<string, any>[];
    headers?: string[];
    sheetName: string;
  } {
    const sheetName = worksheet.name;
    
    // Get the actual range of data
    const dimension = worksheet.dimensions;
    if (!dimension) {
      return {
        rows: [],
        headers: undefined,
        sheetName
      };
    }

    // Parse range if specified
    let startRow = 1;
    let endRow = dimension.bottom;
    let startCol = 1;
    let endCol = dimension.right;

    if (options.range) {
      const range = this.parseExcelRange(options.range);
      startRow = range.startRow;
      endRow = range.endRow;
      startCol = range.startCol;
      endCol = range.endCol;
    }

    // Extract headers (first row)
    const headers: string[] = [];
    let dataStartRow = startRow;

    // Check if first row looks like headers
    const firstRow = worksheet.getRow(startRow);
    let hasHeaders = false;

    if (firstRow) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = firstRow.getCell(col);
        const value = this.getCellValue(cell);
        
        if (typeof value === 'string' && value.trim() !== '') {
          hasHeaders = true;
          headers.push(value.trim());
        } else {
          headers.push(`Column${col}`);
        }
      }

      // If we detected headers, start data from next row
      if (hasHeaders) {
        dataStartRow = startRow + 1;
      }
    }

    // Extract data rows
    const rows: Record<string, any>[] = [];

    for (let rowNum = dataStartRow; rowNum <= endRow; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const rowData: Record<string, any> = {};
      let hasData = false;

      for (let col = startCol; col <= endCol; col++) {
        const cell = row.getCell(col);
        const value = this.getCellValue(cell);
        
        const columnKey = hasHeaders && headers[col - startCol] 
          ? headers[col - startCol] 
          : `Column${col}`;
        
        rowData[columnKey] = value;
        
        if (value !== null && value !== undefined && value !== '') {
          hasData = true;
        }
      }

      // Only add row if it has some data
      if (hasData) {
        rows.push(rowData);
      }
    }

    return {
      rows,
      headers: hasHeaders ? headers : undefined,
      sheetName
    };
  }

  /**
   * Get cell value with proper type conversion
   */
  private getCellValue(cell: ExcelJS.Cell): any {
    if (!cell || cell.value === null || cell.value === undefined) {
      return null;
    }

    const value = cell.value;

    // Handle different cell value types
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    // Handle dates
    if (value instanceof Date) {
      return value;
    }

    // Handle Excel date numbers
    if (typeof value === 'number' && cell.numFmt && cell.numFmt.includes('d')) {
      // This is likely a date stored as a number
      // Excel dates are stored as days since 1900-01-01
      const excelEpoch = new Date(1900, 0, 1);
      const millisecondsPerDay = 24 * 60 * 60 * 1000;
      return new Date(excelEpoch.getTime() + (value - 2) * millisecondsPerDay);
    }

    // Handle formulas
    if (typeof value === 'object' && 'result' in value) {
      return (value as any).result;
    }

    // Handle rich text
    if (typeof value === 'object' && 'richText' in value) {
      const richText = value as any;
      return richText.richText.map((rt: any) => rt.text).join('');
    }

    // Handle hyperlinks
    if (typeof value === 'object' && 'text' in value && 'hyperlink' in value) {
      const hyperlink = value as any;
      return hyperlink.text;
    }

    // Default: convert to string
    return String(value);
  }

  /**
   * Parse Excel range string (e.g., "A1:C10")
   */
  private parseExcelRange(range: string): {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
  } {
    const rangePattern = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i;
    const match = range.match(rangePattern);

    if (!match) {
      throw ConversionError.conversionFailed(
        `Invalid Excel range format: ${range}. Expected format: A1:C10`,
        { range }
      );
    }

    const [, startColStr, startRowStr, endColStr, endRowStr] = match;

    return {
      startRow: parseInt(startRowStr, 10),
      endRow: parseInt(endRowStr, 10),
      startCol: this.columnLettersToNumber(startColStr),
      endCol: this.columnLettersToNumber(endColStr)
    };
  }

  /**
   * Convert Excel column letters to number (A=1, B=2, etc.)
   */
  private columnLettersToNumber(letters: string): number {
    let result = 0;
    for (let i = 0; i < letters.length; i++) {
      result = result * 26 + (letters.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return result;
  }

  /**
   * Populate Excel worksheet with data
   */
  private populateWorksheet(
    worksheet: ExcelJS.Worksheet,
    data: DataStructure,
    options: Required<WriteOptions>
  ): void {
    let currentRow = 1;

    // Add headers if present
    if (data.headers) {
      const headerRow = worksheet.getRow(currentRow);
      
      data.headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        
        // Apply header formatting
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' }
        };
      });
      
      currentRow++;
    }

    // Add data rows
    data.rows.forEach((row, rowIndex) => {
      const worksheetRow = worksheet.getRow(currentRow + rowIndex);
      
      if (data.headers) {
        // Use headers to determine column order
        data.headers.forEach((header, colIndex) => {
          const cell = worksheetRow.getCell(colIndex + 1);
          cell.value = this.formatValueForExcel(row[header]);
        });
      } else {
        // Use object keys order
        const keys = Object.keys(row);
        keys.forEach((key, colIndex) => {
          const cell = worksheetRow.getCell(colIndex + 1);
          cell.value = this.formatValueForExcel(row[key]);
        });
      }
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      if (column.eachCell) {
        let maxLength = 0;
        column.eachCell({ includeEmpty: false }, (cell) => {
          const cellValue = cell.value ? String(cell.value) : '';
          maxLength = Math.max(maxLength, cellValue.length);
        });
        column.width = Math.min(Math.max(maxLength + 2, 10), 50);
      }
    });

    // Apply formatting options
    if (options.formatting) {
      this.applyFormatting(worksheet, options.formatting);
    }
  }

  /**
   * Format value for Excel output
   */
  private formatValueForExcel(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Apply formatting to worksheet
   */
  private applyFormatting(worksheet: ExcelJS.Worksheet, formatting: any): void {
    // This is a placeholder for custom formatting options
    // In a full implementation, this would apply various Excel formatting
    // based on the formatting options provided
    
    if (formatting.freezeFirstRow) {
      worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    if (formatting.autoFilter && worksheet.lastRow) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: worksheet.lastRow.number, column: worksheet.columnCount }
      };
    }
  }

  /**
   * Get Excel-specific information
   */
  getExcelInfo(): {
    supportedVersions: string[];
    maxRows: number;
    maxColumns: number;
    supportedFeatures: string[];
  } {
    return {
      supportedVersions: ['Excel 2007+', '.xlsx', '.xls (read-only)'],
      maxRows: 1048576,
      maxColumns: 16384,
      supportedFeatures: [
        'Multiple worksheets',
        'Cell formatting',
        'Data types (text, number, date, boolean)',
        'Formulas (result values)',
        'Rich text',
        'Hyperlinks',
        'Auto-fit columns',
        'Header formatting',
        'Freeze panes',
        'Auto filter'
      ]
    };
  }

  /**
   * Get worksheet information from Excel file
   */
  async getWorksheetInfo(filePath: string): Promise<{
    worksheets: Array<{
      name: string;
      index: number;
      rowCount: number;
      columnCount: number;
    }>;
    totalWorksheets: number;
  }> {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);

      const worksheets = workbook.worksheets.map((worksheet, index) => {
        const dimension = worksheet.dimensions;
        return {
          name: worksheet.name,
          index,
          rowCount: dimension ? dimension.bottom : 0,
          columnCount: dimension ? dimension.right : 0
        };
      });

      return {
        worksheets,
        totalWorksheets: worksheets.length
      };

    } catch (error) {
      this.logger.error('Failed to get worksheet info', error as Error, { filePath });
      throw ConversionError.conversionFailed(
        `Failed to read Excel file info: ${(error as Error).message}`,
        { filePath, originalError: error }
      );
    }
  }
}