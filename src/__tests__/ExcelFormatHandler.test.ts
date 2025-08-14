import { ExcelFormatHandler } from '../handlers/ExcelFormatHandler.js';
import { DataStructure } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as ExcelJS from 'exceljs';

// Mock ExcelJS
jest.mock('exceljs', () => {
  const mockWorksheet = {
    name: 'Sheet1',
    dimension: { bottom: 3, right: 3 },
    getRow: jest.fn(),
    getCell: jest.fn(),
    addWorksheet: jest.fn(),
    columns: [],
    views: [],
    autoFilter: null,
    lastRow: { number: 3 },
    columnCount: 3
  };

  const mockWorkbook = {
    worksheets: [mockWorksheet],
    getWorksheet: jest.fn(),
    addWorksheet: jest.fn(),
    xlsx: {
      readFile: jest.fn(),
      writeFile: jest.fn()
    }
  };

  return {
    Workbook: jest.fn(() => mockWorkbook),
    utils: {
      excelDateToJSDate: jest.fn((value: number) => new Date(2023, 0, value))
    }
  };
});

const mockExcelJS = ExcelJS as jest.Mocked<typeof ExcelJS>;

describe('ExcelFormatHandler', () => {
  let handler: ExcelFormatHandler;
  let mockWorkbook: any;
  let mockWorksheet: any;

  beforeEach(() => {
    handler = new ExcelFormatHandler();
    jest.clearAllMocks();
    
    // Get mock instances
    mockWorkbook = new mockExcelJS.Workbook();
    mockWorksheet = mockWorkbook.worksheets[0];
    
    // Setup default mocks
    mockWorkbook.getWorksheet.mockReturnValue(mockWorksheet);
    mockWorkbook.addWorksheet.mockReturnValue(mockWorksheet);
  });

  describe('constructor and basic properties', () => {
    it('should initialize with correct format and extensions', () => {
      expect(handler.canHandle('xlsx')).toBe(true);
      expect(handler.canHandle('csv')).toBe(false);
      expect(handler.getSupportedExtensions()).toEqual(['.xlsx', '.xls']);
    });
  });

  describe('read', () => {
    beforeEach(() => {
      // Mock successful file read
      mockWorkbook.xlsx.readFile.mockResolvedValue(undefined);
    });

    it('should read simple Excel file with headers', async () => {
      // Mock worksheet data
      const mockRows = [
        { // Header row
          getCell: jest.fn((col) => {
            const headers = ['name', 'age', 'email'];
            return { value: headers[col - 1] };
          })
        },
        { // Data row 1
          getCell: jest.fn((col) => {
            const values = ['John', 30, 'john@example.com'];
            return { value: values[col - 1] };
          })
        },
        { // Data row 2
          getCell: jest.fn((col) => {
            const values = ['Jane', 25, 'jane@example.com'];
            return { value: values[col - 1] };
          })
        }
      ];

      mockWorksheet.getRow.mockImplementation((rowNum: number) => mockRows[rowNum - 1]);

      const result = await handler.read('/path/to/file.xlsx');

      expect(result.rows).toEqual([
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ]);
      expect(result.headers).toEqual(['name', 'age', 'email']);
      expect(result.metadata.originalFormat).toBe('xlsx');
      expect(result.metadata.sheetName).toBe('Sheet1');
    });

    it('should read Excel file by sheet name', async () => {
      const customSheet = { ...mockWorksheet, name: 'CustomSheet' };
      mockWorkbook.getWorksheet.mockReturnValue(customSheet);

      // Mock simple data
      const mockRow = {
        getCell: jest.fn(() => ({ value: 'test' }))
      };
      customSheet.getRow = jest.fn(() => mockRow);

      const result = await handler.read('/path/to/file.xlsx', { sheetName: 'CustomSheet' });

      expect(mockWorkbook.getWorksheet).toHaveBeenCalledWith('CustomSheet');
      expect(result.metadata.sheetName).toBe('CustomSheet');
    });

    it('should read Excel file by sheet index', async () => {
      const secondSheet = { ...mockWorksheet, name: 'Sheet2' };
      mockWorkbook.worksheets = [mockWorksheet, secondSheet];
      mockWorkbook.getWorksheet.mockImplementation((index: number) => 
        index === 2 ? secondSheet : mockWorksheet
      );

      // Mock simple data
      const mockRow = {
        getCell: jest.fn(() => ({ value: 'test' }))
      };
      secondSheet.getRow = jest.fn(() => mockRow);

      const result = await handler.read('/path/to/file.xlsx', { sheetIndex: 1 });

      expect(result.metadata.sheetName).toBe('Sheet2');
    });

    it('should handle Excel file with no data', async () => {
      mockWorksheet.dimension = null;

      const result = await handler.read('/path/to/file.xlsx');

      expect(result.rows).toEqual([]);
      expect(result.headers).toBeUndefined();
    });

    it('should handle different cell value types', async () => {
      const mockRows = [
        { // Header row
          getCell: jest.fn((col) => {
            const headers = ['text', 'number', 'boolean', 'date', 'formula'];
            return { value: headers[col - 1] };
          })
        },
        { // Data row with different types
          getCell: jest.fn((col) => {
            const cells = [
              { value: 'Hello' },
              { value: 42 },
              { value: true },
              { value: new Date('2023-01-01') },
              { value: { result: 100 } } // Formula result
            ];
            return cells[col - 1];
          })
        }
      ];

      mockWorksheet.getRow.mockImplementation((rowNum: number) => mockRows[rowNum - 1]);

      const result = await handler.read('/path/to/file.xlsx');

      expect(result.rows[0]).toEqual({
        text: 'Hello',
        number: 42,
        boolean: true,
        date: new Date('2023-01-01'),
        formula: 100
      });
    });

    it('should handle rich text cells', async () => {
      const mockRows = [
        {
          getCell: jest.fn(() => ({ value: 'header' }))
        },
        {
          getCell: jest.fn(() => ({
            value: {
              richText: [
                { text: 'Bold ' },
                { text: 'Text' }
              ]
            }
          }))
        }
      ];

      mockWorksheet.getRow.mockImplementation((rowNum: number) => mockRows[rowNum - 1]);
      mockWorksheet.dimension = { bottom: 2, right: 1 };

      const result = await handler.read('/path/to/file.xlsx');

      expect(result.rows[0]).toEqual({ header: 'Bold Text' });
    });

    it('should handle hyperlink cells', async () => {
      const mockRows = [
        {
          getCell: jest.fn(() => ({ value: 'header' }))
        },
        {
          getCell: jest.fn(() => ({
            value: {
              text: 'Click here',
              hyperlink: 'https://example.com'
            }
          }))
        }
      ];

      mockWorksheet.getRow.mockImplementation((rowNum: number) => mockRows[rowNum - 1]);
      mockWorksheet.dimension = { bottom: 2, right: 1 };

      const result = await handler.read('/path/to/file.xlsx');

      expect(result.rows[0]).toEqual({ header: 'Click here' });
    });

    it('should handle Excel range specification', async () => {
      const mockRows = [
        {
          getCell: jest.fn((col) => ({ value: col === 1 ? 'A1' : col === 2 ? 'B1' : 'C1' }))
        },
        {
          getCell: jest.fn((col) => ({ value: col === 1 ? 'A2' : col === 2 ? 'B2' : 'C2' }))
        }
      ];

      mockWorksheet.getRow.mockImplementation((rowNum: number) => mockRows[rowNum - 1]);

      const result = await handler.read('/path/to/file.xlsx', { range: 'A1:B2' });

      expect(result.rows[0]).toEqual({ A1: 'A2' });
    });

    it('should throw error for non-existent sheet name', async () => {
      mockWorkbook.getWorksheet.mockReturnValue(undefined);

      await expect(handler.read('/path/to/file.xlsx', { sheetName: 'NonExistent' }))
        .rejects.toThrow(ConversionError);
    });

    it('should throw error for invalid sheet index', async () => {
      mockWorkbook.getWorksheet.mockReturnValue(undefined);

      await expect(handler.read('/path/to/file.xlsx', { sheetIndex: 10 }))
        .rejects.toThrow(ConversionError);
    });

    it('should throw error for invalid range format', async () => {
      await expect(handler.read('/path/to/file.xlsx', { range: 'invalid-range' }))
        .rejects.toThrow(ConversionError);
    });

    it('should handle file read errors', async () => {
      mockWorkbook.xlsx.readFile.mockRejectedValue(new Error('File not found'));

      await expect(handler.read('/path/to/nonexistent.xlsx'))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('write', () => {
    const sampleData: DataStructure = {
      rows: [
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ],
      headers: ['name', 'age', 'email'],
      metadata: {
        originalFormat: 'xlsx',
        encoding: 'utf-8',
        totalRows: 2,
        totalColumns: 3,
        sheetName: 'TestSheet'
      }
    };

    beforeEach(() => {
      // Mock worksheet methods
      mockWorksheet.getRow = jest.fn((rowNum) => ({
        getCell: jest.fn(() => ({
          value: null,
          font: {},
          fill: {}
        }))
      }));
      
      mockWorksheet.columns = [
        { eachCell: jest.fn(), width: 10 },
        { eachCell: jest.fn(), width: 10 },
        { eachCell: jest.fn(), width: 10 }
      ];

      mockWorkbook.xlsx.writeFile.mockResolvedValue(undefined);
    });

    it('should write Excel file with headers', async () => {
      await handler.write(sampleData, '/path/to/output.xlsx');

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('TestSheet');
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith('/path/to/output.xlsx');
    });

    it('should write Excel file without headers', async () => {
      const dataWithoutHeaders: DataStructure = {
        ...sampleData,
        headers: undefined
      };

      await handler.write(dataWithoutHeaders, '/path/to/output.xlsx');

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Sheet1'); // Default name
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalled();
    });

    it('should handle different data types', async () => {
      const dataWithTypes: DataStructure = {
        rows: [
          { 
            text: 'Hello',
            number: 42,
            boolean: true,
            date: new Date('2023-01-01'),
            object: { key: 'value' },
            nullValue: null
          }
        ],
        headers: ['text', 'number', 'boolean', 'date', 'object', 'nullValue'],
        metadata: {
          originalFormat: 'xlsx',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 6
        }
      };

      await handler.write(dataWithTypes, '/path/to/output.xlsx');

      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalled();
    });

    it('should apply formatting options', async () => {
      const options = {
        formatting: {
          freezeFirstRow: true,
          autoFilter: true
        }
      };

      await handler.write(sampleData, '/path/to/output.xlsx', options);

      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalled();
    });

    it('should handle write errors', async () => {
      mockWorkbook.xlsx.writeFile.mockRejectedValue(new Error('Write failed'));

      await expect(handler.write(sampleData, '/path/to/output.xlsx'))
        .rejects.toThrow(ConversionError);
    });

    it('should validate data before writing', async () => {
      const invalidData = {
        rows: 'not an array',
        metadata: {
          originalFormat: 'xlsx',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 0
        }
      } as any;

      await expect(handler.write(invalidData, '/path/to/output.xlsx'))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('validation', () => {
    it('should validate correct Excel data structure', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 }
        ],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'xlsx',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about empty Excel data', () => {
      const data: DataStructure = {
        rows: [],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'xlsx',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_EXCEL_DATA',
          message: 'Excel data contains no rows'
        })
      );
    });

    it('should detect Excel row limit exceeded', () => {
      const data: DataStructure = {
        rows: new Array(1048577).fill({ name: 'test' }), // Exceed Excel limit
        metadata: {
          originalFormat: 'xlsx',
          encoding: 'utf-8',
          totalRows: 1048577,
          totalColumns: 1
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'EXCEL_ROW_LIMIT_EXCEEDED',
          message: expect.stringContaining('Excel row limit exceeded')
        })
      );
    });

    it('should detect Excel column limit exceeded', () => {
      const largeRow: Record<string, any> = {};
      for (let i = 0; i < 16385; i++) {
        largeRow[`col${i}`] = 'value';
      }

      const data: DataStructure = {
        rows: [largeRow],
        headers: Object.keys(largeRow),
        metadata: {
          originalFormat: 'xlsx',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 16385
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'EXCEL_COLUMN_LIMIT_EXCEEDED',
          message: expect.stringContaining('Excel column limit exceeded')
        })
      );
    });

    it('should warn about invalid sheet name characters', () => {
      const data: DataStructure = {
        rows: [{ name: 'test' }],
        metadata: {
          originalFormat: 'xlsx',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 1,
          sheetName: 'Invalid/Sheet*Name'
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_SHEET_NAME_CHARS',
          message: expect.stringContaining('Sheet name contains invalid characters')
        })
      );
    });

    it('should warn about sheet name too long', () => {
      const data: DataStructure = {
        rows: [{ name: 'test' }],
        metadata: {
          originalFormat: 'xlsx',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 1,
          sheetName: 'This is a very long sheet name that exceeds the 31 character limit'
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'SHEET_NAME_TOO_LONG',
          message: expect.stringContaining('Sheet name exceeds 31 character limit')
        })
      );
    });

    it('should warn about complex data types', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', metadata: { role: 'admin', permissions: ['read', 'write'] } }
        ],
        metadata: {
          originalFormat: 'xlsx',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'COMPLEX_DATA_TYPES',
          message: expect.stringContaining('complex objects that will be converted to strings')
        })
      );
    });
  });

  describe('utility methods', () => {
    it('should return Excel info', () => {
      const info = handler.getExcelInfo();
      
      expect(info.supportedVersions).toContain('Excel 2007+');
      expect(info.maxRows).toBe(1048576);
      expect(info.maxColumns).toBe(16384);
      expect(info.supportedFeatures).toContain('Multiple worksheets');
    });

    it('should get worksheet info', async () => {
      mockWorkbook.worksheets = [
        { name: 'Sheet1', dimension: { bottom: 10, right: 5 } },
        { name: 'Sheet2', dimension: { bottom: 20, right: 3 } }
      ];

      const info = await handler.getWorksheetInfo('/path/to/file.xlsx');
      
      expect(info.totalWorksheets).toBe(2);
      expect(info.worksheets).toHaveLength(2);
      expect(info.worksheets[0]).toEqual({
        name: 'Sheet1',
        index: 0,
        rowCount: 10,
        columnCount: 5
      });
    });

    it('should handle worksheet info errors', async () => {
      mockWorkbook.xlsx.readFile.mockRejectedValue(new Error('File error'));

      await expect(handler.getWorksheetInfo('/path/to/file.xlsx'))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('column letter conversion', () => {
    it('should convert column letters to numbers correctly', () => {
      // Test the private method through range parsing
      expect(() => handler.read('/path/to/file.xlsx', { range: 'A1:A1' })).not.toThrow();
      expect(() => handler.read('/path/to/file.xlsx', { range: 'Z1:Z1' })).not.toThrow();
      expect(() => handler.read('/path/to/file.xlsx', { range: 'AA1:AA1' })).not.toThrow();
    });
  });
});