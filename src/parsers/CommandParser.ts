import { ConversionRequestImpl } from '../models/ConversionRequest.js';
import { Logger } from '../core/Logger.js';
import { ClassifiedError, ErrorCategory, ErrorSeverity, RecoveryStrategy } from '../errors/ErrorClassification.js';
import { SupportedFormat } from '../types/index.js';

/**
 * Parsed command information
 */
export interface ParsedCommand {
  action: 'convert' | 'help' | 'unknown';
  sourcePath?: string;
  targetPath?: string;
  sourceFormat?: SupportedFormat;
  targetFormat?: SupportedFormat;
  options?: {
    encoding?: string;
    sheetName?: string;
    sheetIndex?: number;
    delimiter?: string;
    keyTransform?: 'camelCase' | 'snake_case' | 'lowercase' | 'uppercase';
    includeColumns?: string[];
    excludeColumns?: string[];
    dateRange?: {
      start?: string;
      end?: string;
      column?: string;
    };
    filterExpression?: string;
    overwrite?: boolean;
    preserveFormatting?: boolean;
  };
  confidence: number;
  ambiguities: string[];
  suggestions: string[];
}

/**
 * Command parsing patterns and rules
 */
interface CommandPattern {
  pattern: RegExp;
  action: 'convert' | 'help';
  confidence: number;
  extractor: (match: RegExpMatchArray, input: string) => Partial<ParsedCommand>;
}

/**
 * Natural language command parser for format conversion
 */
export class CommandParser {
  private logger: Logger;
  private patterns: CommandPattern[];
  private formatAliases: Map<string, SupportedFormat>;
  private actionKeywords: Map<string, string[]>;

  constructor() {
    this.logger = Logger.getInstance();
    this.patterns = [];
    this.formatAliases = new Map();
    this.actionKeywords = new Map();
    
    this.initializePatterns();
    this.initializeFormatAliases();
    this.initializeActionKeywords();
  }

  /**
   * Initialize command parsing patterns
   */
  private initializePatterns(): void {
    this.patterns = [
      // Direct conversion patterns
      {
        pattern: /convert\s+(.+?)\s+(?:from\s+)?(\w+)\s+to\s+(\w+)(?:\s+(?:as|to)\s+(.+?))?/i,
        action: 'convert',
        confidence: 0.9,
        extractor: (match, input) => ({
          sourcePath: this.extractPath(match[1]),
          sourceFormat: this.parseFormat(match[2]),
          targetFormat: this.parseFormat(match[3]),
          targetPath: match[4] ? this.extractPath(match[4]) : undefined
        })
      },
      
      // Transform X to Y patterns
      {
        pattern: /(?:transform|change|convert)\s+(.+?)\s+(?:from\s+)?(\w+)\s+(?:to|into)\s+(\w+)/i,
        action: 'convert',
        confidence: 0.85,
        extractor: (match, input) => ({
          sourcePath: this.extractPath(match[1]),
          sourceFormat: this.parseFormat(match[2]),
          targetFormat: this.parseFormat(match[3])
        })
      },

      // File format conversion patterns
      {
        pattern: /(?:convert|transform)\s+(.+?\.\w+)\s+(?:to|into)\s+(\w+)/i,
        action: 'convert',
        confidence: 0.8,
        extractor: (match, input) => ({
          sourcePath: this.extractPath(match[1]),
          sourceFormat: this.detectFormatFromPath(match[1]),
          targetFormat: this.parseFormat(match[2])
        })
      },

      // Simple format to format patterns
      {
        pattern: /(\w+)\s+to\s+(\w+)\s+(.+)/i,
        action: 'convert',
        confidence: 0.7,
        extractor: (match, input) => ({
          sourceFormat: this.parseFormat(match[1]),
          targetFormat: this.parseFormat(match[2]),
          sourcePath: this.extractPath(match[3])
        })
      },

      // Help patterns
      {
        pattern: /(?:help|usage|how\s+to|what\s+can|commands)/i,
        action: 'help',
        confidence: 0.9,
        extractor: () => ({})
      },

      // Export/save patterns
      {
        pattern: /(?:export|save)\s+(.+?)\s+(?:as|to)\s+(\w+)/i,
        action: 'convert',
        confidence: 0.75,
        extractor: (match, input) => ({
          sourcePath: this.extractPath(match[1]),
          sourceFormat: this.detectFormatFromPath(match[1]),
          targetFormat: this.parseFormat(match[2])
        })
      }
    ];
  }

  /**
   * Initialize format aliases for flexible parsing
   */
  private initializeFormatAliases(): void {
    this.formatAliases.set('csv', 'csv');
    this.formatAliases.set('comma', 'csv');
    this.formatAliases.set('excel', 'xlsx');
    this.formatAliases.set('xlsx', 'xlsx');
    this.formatAliases.set('xls', 'xlsx');
    this.formatAliases.set('spreadsheet', 'xlsx');
    this.formatAliases.set('json', 'json');
    this.formatAliases.set('javascript', 'json');
    this.formatAliases.set('xml', 'xml');
    this.formatAliases.set('markup', 'xml');
    this.formatAliases.set('markdown', 'md');
    this.formatAliases.set('md', 'md');
    this.formatAliases.set('text', 'md');
  }

  /**
   * Initialize action keywords for disambiguation
   */
  private initializeActionKeywords(): void {
    this.actionKeywords.set('convert', ['convert', 'transform', 'change', 'export', 'save']);
    this.actionKeywords.set('help', ['help', 'usage', 'how', 'what', 'commands', 'guide']);
  }

  /**
   * Parse natural language command into structured format
   */
  parseCommand(input: string): ParsedCommand {
    this.logger.debug('Parsing command', { input });

    const normalizedInput = this.normalizeInput(input);
    let bestMatch: ParsedCommand | null = null;
    let highestConfidence = 0;

    // Try each pattern
    for (const pattern of this.patterns) {
      const match = normalizedInput.match(pattern.pattern);
      if (match) {
        try {
          const extracted = pattern.extractor(match, normalizedInput);
          const parsedCommand: ParsedCommand = {
            action: pattern.action,
            confidence: pattern.confidence,
            ambiguities: [],
            suggestions: [],
            ...extracted
          };

          // Apply additional parsing for options
          this.parseOptions(normalizedInput, parsedCommand);
          
          // Validate and adjust confidence
          this.validateAndAdjustConfidence(parsedCommand);

          if (parsedCommand.confidence > highestConfidence) {
            highestConfidence = parsedCommand.confidence;
            bestMatch = parsedCommand;
          }
        } catch (error) {
          this.logger.warn('Pattern extraction failed', { 
            pattern: pattern.pattern.source, 
            error: (error as Error).message 
          });
        }
      }
    }

    // If no pattern matched, try fallback parsing
    if (!bestMatch) {
      bestMatch = this.fallbackParsing(normalizedInput);
    }

    // Add disambiguation and suggestions
    this.addDisambiguationInfo(bestMatch, normalizedInput);

    this.logger.debug('Command parsed', { 
      input, 
      result: bestMatch,
      confidence: bestMatch.confidence 
    });

    return bestMatch;
  }

  /**
   * Convert parsed command to ConversionRequest
   */
  toConversionRequest(parsedCommand: ParsedCommand): ConversionRequestImpl {
    if (parsedCommand.action !== 'convert') {
      throw new ClassifiedError('Cannot create conversion request from non-convert command', {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.USER_INPUT,
        userMessage: 'This command is not a conversion request',
        suggestions: ['Use a conversion command like "convert file.csv to json"']
      });
    }

    if (!parsedCommand.sourcePath) {
      throw new ClassifiedError('Source path is required for conversion', {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.USER_INPUT,
        userMessage: 'Please specify the source file path',
        suggestions: ['Include the path to the file you want to convert']
      });
    }

    if (!parsedCommand.targetFormat) {
      throw new ClassifiedError('Target format is required for conversion', {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        recoveryStrategy: RecoveryStrategy.USER_INPUT,
        userMessage: 'Please specify the target format',
        suggestions: ['Specify the format you want to convert to (csv, json, xml, xlsx, md)']
      });
    }

    const request = new ConversionRequestImpl(
      parsedCommand.sourcePath,
      parsedCommand.targetFormat,
      parsedCommand.targetPath,
      undefined, // transformations
      {
        encoding: parsedCommand.options?.encoding,
        sheetName: parsedCommand.options?.sheetName,
        sheetIndex: parsedCommand.options?.sheetIndex
      }
    );

    this.logger.info('Conversion request created from parsed command', {
      sourcePath: request.sourcePath,
      targetFormat: request.targetFormat,
      confidence: parsedCommand.confidence
    });

    return request;
  }

  /**
   * Normalize input for consistent parsing
   */
  private normalizeInput(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/\\s+/g, ' ')
      .replace(/[""'']/g, '"')
      .replace(/\\s*,\\s*/g, ',');
  }

  /**
   * Extract file path from text, handling quotes and common patterns
   */
  private extractPath(text: string): string {
    // Remove quotes
    let path = text.replace(/^["']|["']$/g, '').trim();
    
    // Handle common path patterns
    if (path.includes('/') || path.includes('\\\\') || path.includes('.')) {
      return path;
    }
    
    // If no path separators, assume it's a filename
    return path;
  }

  /**
   * Parse format from text using aliases
   */
  private parseFormat(formatText: string): SupportedFormat | undefined {
    const normalized = formatText.toLowerCase().trim();
    return this.formatAliases.get(normalized);
  }

  /**
   * Detect format from file path extension
   */
  private detectFormatFromPath(path: string): SupportedFormat | undefined {
    const extension = path.split('.').pop()?.toLowerCase();
    if (!extension) return undefined;
    
    const extensionMap: Record<string, SupportedFormat> = {
      'csv': 'csv',
      'xlsx': 'xlsx',
      'xls': 'xlsx',
      'json': 'json',
      'xml': 'xml',
      'md': 'md',
      'markdown': 'md'
    };
    
    return extensionMap[extension];
  }

  /**
   * Parse additional options from command text
   */
  private parseOptions(input: string, command: ParsedCommand): void {
    if (!command.options) {
      command.options = {};
    }

    // Parse encoding
    const encodingMatch = input.match(/(?:encoding|charset)\\s+([\\w-]+)/i);
    if (encodingMatch) {
      command.options.encoding = encodingMatch[1];
    }

    // Parse sheet name/index
    const sheetNameMatch = input.match(/sheet\\s+["']([^"']+)["']/i);
    const sheetIndexMatch = input.match(/sheet\\s+(\\d+)/i);
    if (sheetNameMatch) {
      command.options.sheetName = sheetNameMatch[1];
    } else if (sheetIndexMatch) {
      command.options.sheetIndex = parseInt(sheetIndexMatch[1], 10);
    }

    // Parse delimiter
    const delimiterMatch = input.match(/delimiter\\s+["']([^"']+)["']/i);
    if (delimiterMatch) {
      command.options.delimiter = delimiterMatch[1];
    }

    // Parse key transformation
    const keyTransformMatch = input.match(/(?:keys?|columns?)\\s+(?:to\\s+)?(camelcase|snake_case|lowercase|uppercase)/i);
    if (keyTransformMatch) {
      command.options.keyTransform = keyTransformMatch[1].toLowerCase() as any;
    }

    // Parse column inclusion/exclusion
    const includeMatch = input.match(/(?:include|only)\\s+columns?\\s+([\\w,\\s]+)/i);
    const excludeMatch = input.match(/(?:exclude|skip|ignore)\\s+columns?\\s+([\\w,\\s]+)/i);
    if (includeMatch) {
      command.options.includeColumns = includeMatch[1].split(',').map(c => c.trim());
    }
    if (excludeMatch) {
      command.options.excludeColumns = excludeMatch[1].split(',').map(c => c.trim());
    }

    // Parse date range
    const dateRangeMatch = input.match(/(?:from|after)\\s+([\\d\\-\\/]+)\\s+(?:to|until|before)\\s+([\\d\\-\\/]+)/i);
    const dateColumnMatch = input.match(/date\\s+column\\s+([\\w]+)/i);
    if (dateRangeMatch) {
      command.options.dateRange = {
        start: dateRangeMatch[1],
        end: dateRangeMatch[2],
        column: dateColumnMatch ? dateColumnMatch[1] : undefined
      };
    }

    // Parse boolean options
    if (input.includes('overwrite') || input.includes('replace')) {
      command.options.overwrite = true;
    }
    if (input.includes('preserve format') || input.includes('keep format')) {
      command.options.preserveFormatting = true;
    }
  }

  /**
   * Validate parsed command and adjust confidence
   */
  private validateAndAdjustConfidence(command: ParsedCommand): void {
    let confidence = command.confidence;

    // Reduce confidence for missing critical information
    if (command.action === 'convert') {
      if (!command.sourcePath) confidence *= 0.5;
      if (!command.targetFormat) confidence *= 0.6;
      if (!command.sourceFormat && command.sourcePath && !this.detectFormatFromPath(command.sourcePath)) {
        confidence *= 0.8;
      }
    }

    // Increase confidence for clear format detection
    if (command.sourceFormat && command.targetFormat) {
      confidence = Math.min(confidence * 1.1, 1.0);
    }

    // Reduce confidence for ambiguous paths
    if (command.sourcePath && !command.sourcePath.includes('.') && !command.sourcePath.includes('/')) {
      confidence *= 0.9;
    }

    command.confidence = Math.max(confidence, 0.1);
  }

  /**
   * Fallback parsing when no patterns match
   */
  private fallbackParsing(input: string): ParsedCommand {
    const command: ParsedCommand = {
      action: 'unknown',
      confidence: 0.1,
      ambiguities: ['Could not understand the command'],
      suggestions: [
        'Try: "convert file.csv to json"',
        'Try: "transform data.xlsx to csv"',
        'Try: "help" for usage information'
      ]
    };

    // Try to extract any file paths
    const pathMatch = input.match(/([\\w\\/\\\\.-]+\\.\\w+)/);
    if (pathMatch) {
      command.sourcePath = pathMatch[1];
      command.sourceFormat = this.detectFormatFromPath(pathMatch[1]);
      command.confidence = 0.3;
    }

    // Try to extract format keywords
    const formats = Array.from(this.formatAliases.keys());
    const foundFormats = formats.filter(format => input.includes(format));
    if (foundFormats.length >= 2) {
      command.sourceFormat = this.formatAliases.get(foundFormats[0]);
      command.targetFormat = this.formatAliases.get(foundFormats[1]);
      command.action = 'convert';
      command.confidence = 0.4;
    } else if (foundFormats.length === 1) {
      command.targetFormat = this.formatAliases.get(foundFormats[0]);
      command.action = 'convert';
      command.confidence = 0.25;
    }

    // Check for help keywords
    const helpKeywords = this.actionKeywords.get('help') || [];
    if (helpKeywords.some(keyword => input.includes(keyword))) {
      command.action = 'help';
      command.confidence = 0.8;
    }

    return command;
  }

  /**
   * Add disambiguation information and suggestions
   */
  private addDisambiguationInfo(command: ParsedCommand, input: string): void {
    const ambiguities: string[] = [];
    const suggestions: string[] = [];

    if (command.action === 'convert') {
      // Check for ambiguous source format
      if (!command.sourceFormat && command.sourcePath) {
        if (!this.detectFormatFromPath(command.sourcePath)) {
          ambiguities.push('Source format could not be determined');
          suggestions.push('Specify the source format explicitly (e.g., "from csv")');
        }
      }

      // Check for missing target path
      if (!command.targetPath) {
        suggestions.push('Consider specifying output path (e.g., "as output.json")');
      }

      // Check for potentially conflicting options
      if (command.options?.includeColumns && command.options?.excludeColumns) {
        ambiguities.push('Both include and exclude columns specified');
        suggestions.push('Use either include OR exclude columns, not both');
      }
    }

    // Check confidence level and add appropriate suggestions
    if (command.confidence < 0.7) {
      suggestions.push('Command may be ambiguous - please be more specific');
      
      if (command.action === 'unknown') {
        suggestions.push('Use "help" to see available commands');
      }
    }

    command.ambiguities = [...command.ambiguities, ...ambiguities];
    command.suggestions = [...command.suggestions, ...suggestions];
  }

  /**
   * Get help information
   */
  getHelpInfo(): {
    commands: string[];
    examples: string[];
    formats: string[];
    options: string[];
  } {
    return {
      commands: [
        'convert <file> from <format> to <format>',
        'transform <file> to <format>',
        'export <file> as <format>',
        'help - show this help'
      ],
      examples: [
        'convert data.csv to json',
        'transform spreadsheet.xlsx from excel to csv',
        'export report.json as xlsx with sheet "Summary"',
        'convert data.csv to json with keys camelCase',
        'transform file.xlsx to csv include columns name,age,email'
      ],
      formats: Array.from(this.formatAliases.values()),
      options: [
        'encoding <charset> - specify file encoding',
        'sheet <name|index> - select Excel sheet',
        'delimiter <char> - CSV delimiter character',
        'keys <transform> - transform key names (camelCase, snake_case, etc.)',
        'include columns <list> - only include specified columns',
        'exclude columns <list> - exclude specified columns',
        'from <date> to <date> - filter by date range',
        'overwrite - overwrite existing output file',
        'preserve format - maintain original formatting'
      ]
    };
  }

  /**
   * Validate command before execution
   */
  validateCommand(command: ParsedCommand): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (command.action === 'convert') {
      if (!command.sourcePath) {
        errors.push('Source file path is required');
      }
      
      if (!command.targetFormat) {
        errors.push('Target format is required');
      }
      
      if (command.sourceFormat === command.targetFormat) {
        warnings.push('Source and target formats are the same');
      }
      
      if (command.confidence < 0.5) {
        warnings.push('Command interpretation has low confidence');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}