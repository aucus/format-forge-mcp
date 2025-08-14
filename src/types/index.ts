// Core data types
export type SupportedFormat = 'csv' | 'xlsx' | 'json' | 'xml' | 'md';
export type KeyStyle = 'camelCase' | 'snake_case' | 'lowercase' | 'uppercase';
export type ErrorCode = 
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED_FORMAT'
  | 'CONVERSION_FAILED'
  | 'VALIDATION_FAILED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'MEMORY_ERROR'
  | 'DISK_SPACE_ERROR'
  | 'CORRUPTED_DATA'
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'DEPENDENCY_ERROR'
  | 'UNKNOWN_ERROR';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorCategory = 'system' | 'user' | 'data' | 'network' | 'security' | 'configuration';

// Core data structure
export interface DataStructure {
  headers?: string[];
  rows: Record<string, any>[];
  metadata: {
    originalFormat: SupportedFormat;
    encoding: string;
    sheetName?: string;
    totalRows: number;
    totalColumns: number;
  };
}

// Conversion interfaces
export interface ConversionRequest {
  sourcePath: string;
  targetFormat: SupportedFormat;
  outputPath?: string;
  transformations?: DataTransformation[];
  options?: ConversionOptions;
}

export interface ConversionResponse {
  success: boolean;
  outputPath?: string;
  message: string;
  warnings?: string[];
  metadata?: {
    sourceFormat?: SupportedFormat;
    targetFormat: SupportedFormat;
    originalRows?: number;
    convertedRows?: number;
    originalColumns?: number;
    convertedColumns?: number;
    duration?: number;
    fileSize?: number;
  };
  errors?: Array<{
    code: string;
    message: string;
    severity: string;
    recoverable: boolean;
    suggestions?: string[];
  }>;
}

export interface ConversionOptions {
  encoding?: string;
  sheetName?: string;
  sheetIndex?: number;
  includeHeaders?: boolean;
  dateFormat?: string;
  nullValue?: string;
}

// Data transformation interfaces
export interface DataTransformation {
  type: 'keyStyle' | 'filter' | 'columnOperation';
  parameters: any;
}

export interface FilterCriteria {
  columnFilters?: ColumnFilter[];
  dateRange?: DateRange;
  customConditions?: string[];
}

export interface ColumnFilter {
  columnName: string;
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between';
  value: any;
}

export interface DateRange {
  startDate: string;
  endDate: string;
  dateColumn: string;
}

export interface ColumnOperation {
  type: 'add' | 'remove' | 'rename';
  columnName: string;
  newName?: string;
  defaultValue?: any | ((row: Record<string, any>) => any);
}

export interface ColumnStatistic {
  name: string;
  type: string;
  nullCount: number;
  uniqueCount: number;
  sampleValues: any[];
}

export interface OperationValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Validation interfaces
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  row?: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  row?: number;
}

// File I/O interfaces
export interface ReadOptions {
  encoding?: string;
  sheetName?: string;
  sheetIndex?: number;
  range?: string;
}

export interface WriteOptions {
  encoding?: string;
  formatting?: any;
  overwrite?: boolean;
}