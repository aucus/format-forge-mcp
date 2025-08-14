import { CommandParser, ParsedCommand } from '../parsers/CommandParser.js';
import { ConversionRequestImpl } from '../models/ConversionRequest.js';
import { ClassifiedError } from '../errors/ErrorClassification.js';

describe('CommandParser', () => {
  let parser: CommandParser;

  beforeEach(() => {
    parser = new CommandParser();
  });

  describe('Basic Command Parsing', () => {
    it('should parse direct conversion commands', () => {
      const command = parser.parseCommand('convert data.csv from csv to json');

      expect(command.action).toBe('convert');
      expect(command.sourcePath).toBe('data.csv');
      expect(command.sourceFormat).toBe('csv');
      expect(command.targetFormat).toBe('json');
      expect(command.confidence).toBeGreaterThan(0.8);
    });

    it('should parse transform commands', () => {
      const command = parser.parseCommand('transform spreadsheet.xlsx from excel to csv');

      expect(command.action).toBe('convert');
      expect(command.sourcePath).toBe('spreadsheet.xlsx');
      expect(command.sourceFormat).toBe('xlsx');
      expect(command.targetFormat).toBe('csv');
      expect(command.confidence).toBeGreaterThan(0.7);
    });

    it('should parse file format conversion commands', () => {
      const command = parser.parseCommand('convert report.json to xlsx');

      expect(command.action).toBe('convert');
      expect(command.sourcePath).toBe('report.json');
      expect(command.sourceFormat).toBe('json');
      expect(command.targetFormat).toBe('xlsx');
      expect(command.confidence).toBeGreaterThan(0.7);
    });

    it('should parse export commands', () => {
      const command = parser.parseCommand('export data.csv as json');

      expect(command.action).toBe('convert');
      expect(command.sourcePath).toBe('data.csv');
      expect(command.sourceFormat).toBe('csv');
      expect(command.targetFormat).toBe('json');
      expect(command.confidence).toBeGreaterThan(0.7);
    });

    it('should parse help commands', () => {
      const helpCommands = ['help', 'usage', 'how to', 'what can', 'commands'];

      helpCommands.forEach(cmd => {
        const command = parser.parseCommand(cmd);
        expect(command.action).toBe('help');
        expect(command.confidence).toBeGreaterThan(0.8);
      });
    });
  });

  describe('Format Aliases', () => {
    it('should recognize format aliases', () => {
      const testCases = [
        { input: 'convert file.txt from comma to excel', sourceFormat: 'csv', targetFormat: 'xlsx' },
        { input: 'transform data from spreadsheet to javascript', sourceFormat: 'xlsx', targetFormat: 'json' },
        { input: 'convert file from markup to markdown', sourceFormat: 'xml', targetFormat: 'md' }
      ];

      testCases.forEach(testCase => {
        const command = parser.parseCommand(testCase.input);
        expect(command.sourceFormat).toBe(testCase.sourceFormat);
        expect(command.targetFormat).toBe(testCase.targetFormat);
      });
    });
  });

  describe('Path Extraction', () => {
    it('should extract quoted paths', () => {
      const command = parser.parseCommand('convert "my file.csv" to json');

      expect(command.sourcePath).toBe('my file.csv');
      expect(command.sourceFormat).toBe('csv');
      expect(command.targetFormat).toBe('json');
    });

    it('should extract paths with directories', () => {
      const command = parser.parseCommand('convert /path/to/data.xlsx to csv');

      expect(command.sourcePath).toBe('/path/to/data.xlsx');
      expect(command.sourceFormat).toBe('xlsx');
      expect(command.targetFormat).toBe('csv');
    });

    it('should handle Windows paths', () => {
      const command = parser.parseCommand('convert C:\\\\data\\\\file.json to xml');

      expect(command.sourcePath).toBe('C:\\\\data\\\\file.json');
      expect(command.sourceFormat).toBe('json');
      expect(command.targetFormat).toBe('xml');
    });
  });

  describe('Options Parsing', () => {
    it('should parse encoding options', () => {
      const command = parser.parseCommand('convert data.csv to json encoding utf-8');

      expect(command.options?.encoding).toBe('utf-8');
    });

    it('should parse sheet name options', () => {
      const command = parser.parseCommand('convert file.xlsx to csv sheet "Summary"');

      expect(command.options?.sheetName).toBe('Summary');
    });

    it('should parse sheet index options', () => {
      const command = parser.parseCommand('convert file.xlsx to csv sheet 2');

      expect(command.options?.sheetIndex).toBe(2);
    });

    it('should parse delimiter options', () => {
      const command = parser.parseCommand('convert data.txt to json delimiter ";"');

      expect(command.options?.delimiter).toBe(';');
    });

    it('should parse key transformation options', () => {
      const testCases = [
        { input: 'convert data.csv to json keys camelCase', expected: 'camelcase' },
        { input: 'convert data.csv to json columns snake_case', expected: 'snake_case' },
        { input: 'convert data.csv to json keys to lowercase', expected: 'lowercase' }
      ];

      testCases.forEach(testCase => {
        const command = parser.parseCommand(testCase.input);
        expect(command.options?.keyTransform).toBe(testCase.expected);
      });
    });

    it('should parse column inclusion options', () => {
      const command = parser.parseCommand('convert data.csv to json include columns name, age, email');

      expect(command.options?.includeColumns).toEqual(['name', 'age', 'email']);
    });

    it('should parse column exclusion options', () => {
      const command = parser.parseCommand('convert data.csv to json exclude columns id, password');

      expect(command.options?.excludeColumns).toEqual(['id', 'password']);
    });

    it('should parse date range options', () => {
      const command = parser.parseCommand('convert data.csv to json from 2023-01-01 to 2023-12-31 date column created_at');

      expect(command.options?.dateRange).toEqual({
        start: '2023-01-01',
        end: '2023-12-31',
        column: 'created_at'
      });
    });

    it('should parse boolean options', () => {
      const command1 = parser.parseCommand('convert data.csv to json overwrite');
      const command2 = parser.parseCommand('convert data.xlsx to csv preserve format');

      expect(command1.options?.overwrite).toBe(true);
      expect(command2.options?.preserveFormatting).toBe(true);
    });
  });

  describe('Fallback Parsing', () => {
    it('should handle unknown commands with file detection', () => {
      const command = parser.parseCommand('please process myfile.csv somehow');

      expect(command.action).toBe('unknown');
      expect(command.sourcePath).toBe('myfile.csv');
      expect(command.sourceFormat).toBe('csv');
      expect(command.confidence).toBeLessThan(0.5);
      expect(command.ambiguities.length).toBeGreaterThan(0);
      expect(command.suggestions.length).toBeGreaterThan(0);
    });

    it('should detect help intent in unclear commands', () => {
      const command = parser.parseCommand('I need help with this tool');

      expect(command.action).toBe('help');
      expect(command.confidence).toBeGreaterThan(0.7);
    });

    it('should handle commands with multiple formats', () => {
      const command = parser.parseCommand('I have csv and need json');

      expect(command.action).toBe('convert');
      expect(command.sourceFormat).toBe('csv');
      expect(command.targetFormat).toBe('json');
      expect(command.confidence).toBeLessThan(0.5);
    });
  });

  describe('Confidence and Validation', () => {
    it('should have high confidence for clear commands', () => {
      const command = parser.parseCommand('convert data.csv from csv to json as output.json');

      expect(command.confidence).toBeGreaterThan(0.8);
      expect(command.ambiguities.length).toBe(0);
    });

    it('should have lower confidence for ambiguous commands', () => {
      const command = parser.parseCommand('convert something to json');

      expect(command.confidence).toBeLessThan(0.7);
      expect(command.ambiguities.length).toBeGreaterThan(0);
    });

    it('should validate commands correctly', () => {
      const validCommand = parser.parseCommand('convert data.csv to json');
      const invalidCommand = parser.parseCommand('convert to json');

      const validResult = parser.validateCommand(validCommand);
      const invalidResult = parser.validateCommand(invalidCommand);

      expect(validResult.isValid).toBe(true);
      expect(validResult.errors.length).toBe(0);

      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    it('should warn about same source and target formats', () => {
      const command = parser.parseCommand('convert data.csv to csv');
      const validation = parser.validateCommand(command);

      expect(validation.warnings).toContain('Source and target formats are the same');
    });

    it('should warn about low confidence commands', () => {
      const command = parser.parseCommand('maybe convert something');
      const validation = parser.validateCommand(command);

      expect(validation.warnings).toContain('Command interpretation has low confidence');
    });
  });

  describe('Disambiguation', () => {
    it('should identify ambiguous source formats', () => {
      const command = parser.parseCommand('convert datafile to json');

      expect(command.ambiguities).toContain('Source format could not be determined');
      expect(command.suggestions).toContain('Specify the source format explicitly (e.g., "from csv")');
    });

    it('should suggest output path specification', () => {
      const command = parser.parseCommand('convert data.csv to json');

      expect(command.suggestions).toContain('Consider specifying output path (e.g., "as output.json")');
    });

    it('should detect conflicting column options', () => {
      const command = parser.parseCommand('convert data.csv to json include columns name,age exclude columns id,email');

      expect(command.ambiguities).toContain('Both include and exclude columns specified');
      expect(command.suggestions).toContain('Use either include OR exclude columns, not both');
    });
  });

  describe('ConversionRequest Creation', () => {
    it('should create valid ConversionRequest from parsed command', () => {
      const command = parser.parseCommand('convert data.csv to json as output.json');
      const request = parser.toConversionRequest(command);

      expect(request).toBeInstanceOf(ConversionRequestImpl);
      expect(request.sourcePath).toBe('data.csv');
      expect(request.targetFormat).toBe('json');
      expect(request.outputPath).toBe('output.json');
    });

    it('should include parsed options in ConversionRequest', () => {
      const command = parser.parseCommand('convert data.xlsx to csv sheet "Data" encoding utf-8 overwrite');
      const request = parser.toConversionRequest(command);

      expect(request.options?.sheetName).toBe('Data');
      expect(request.options?.encoding).toBe('utf-8');
    });

    it('should throw error for non-convert commands', () => {
      const helpCommand = parser.parseCommand('help');

      expect(() => parser.toConversionRequest(helpCommand)).toThrow(ClassifiedError);
    });

    it('should throw error for commands without source path', () => {
      const command: ParsedCommand = {
        action: 'convert',
        targetFormat: 'json',
        confidence: 0.8,
        ambiguities: [],
        suggestions: []
      };

      expect(() => parser.toConversionRequest(command)).toThrow(ClassifiedError);
    });

    it('should throw error for commands without target format', () => {
      const command: ParsedCommand = {
        action: 'convert',
        sourcePath: 'data.csv',
        confidence: 0.8,
        ambiguities: [],
        suggestions: []
      };

      expect(() => parser.toConversionRequest(command)).toThrow(ClassifiedError);
    });
  });

  describe('Help Information', () => {
    it('should provide comprehensive help information', () => {
      const help = parser.getHelpInfo();

      expect(help.commands.length).toBeGreaterThan(0);
      expect(help.examples.length).toBeGreaterThan(0);
      expect(help.formats.length).toBeGreaterThan(0);
      expect(help.options.length).toBeGreaterThan(0);

      // Check that help includes key information
      expect(help.commands.some(cmd => cmd.includes('convert'))).toBe(true);
      expect(help.examples.some(ex => ex.includes('csv'))).toBe(true);
      expect(help.formats).toContain('json');
      expect(help.options.some(opt => opt.includes('encoding'))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', () => {
      const command = parser.parseCommand('');

      expect(command.action).toBe('unknown');
      expect(command.confidence).toBeLessThan(0.5);
      expect(command.suggestions.length).toBeGreaterThan(0);
    });

    it('should handle input with only whitespace', () => {
      const command = parser.parseCommand('   \\n\\t  ');

      expect(command.action).toBe('unknown');
      expect(command.confidence).toBeLessThan(0.5);
    });

    it('should handle very long file paths', () => {
      const longPath = '/very/long/path/to/some/deeply/nested/directory/structure/with/a/file.csv';
      const command = parser.parseCommand(`convert ${longPath} to json`);

      expect(command.sourcePath).toBe(longPath);
      expect(command.sourceFormat).toBe('csv');
      expect(command.targetFormat).toBe('json');
    });

    it('should handle special characters in paths', () => {
      const specialPath = 'file with spaces & symbols (1).csv';
      const command = parser.parseCommand(`convert "${specialPath}" to json`);

      expect(command.sourcePath).toBe(specialPath);
      expect(command.sourceFormat).toBe('csv');
    });

    it('should handle case variations', () => {
      const command = parser.parseCommand('CONVERT DATA.CSV TO JSON');

      expect(command.action).toBe('convert');
      expect(command.sourcePath).toBe('data.csv');
      expect(command.sourceFormat).toBe('csv');
      expect(command.targetFormat).toBe('json');
    });

    it('should handle multiple spaces and formatting', () => {
      const command = parser.parseCommand('convert    data.csv     to     json');

      expect(command.action).toBe('convert');
      expect(command.sourcePath).toBe('data.csv');
      expect(command.targetFormat).toBe('json');
    });
  });

  describe('Complex Commands', () => {
    it('should parse complex commands with multiple options', () => {
      const complexCommand = 'convert "data file.xlsx" from excel to csv sheet "Summary" encoding utf-8 include columns name,age,salary from 2023-01-01 to 2023-12-31 date column created_date overwrite preserve format';
      const command = parser.parseCommand(complexCommand);

      expect(command.action).toBe('convert');
      expect(command.sourcePath).toBe('data file.xlsx');
      expect(command.sourceFormat).toBe('xlsx');
      expect(command.targetFormat).toBe('csv');
      expect(command.options?.sheetName).toBe('Summary');
      expect(command.options?.encoding).toBe('utf-8');
      expect(command.options?.includeColumns).toEqual(['name', 'age', 'salary']);
      expect(command.options?.dateRange).toEqual({
        start: '2023-01-01',
        end: '2023-12-31',
        column: 'created_date'
      });
      expect(command.options?.overwrite).toBe(true);
      expect(command.options?.preserveFormatting).toBe(true);
    });

    it('should handle commands with target path specification', () => {
      const command = parser.parseCommand('convert data.csv from csv to json as /output/result.json');

      expect(command.sourcePath).toBe('data.csv');
      expect(command.targetPath).toBe('/output/result.json');
      expect(command.sourceFormat).toBe('csv');
      expect(command.targetFormat).toBe('json');
    });
  });
});