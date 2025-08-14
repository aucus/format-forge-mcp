import { MCPServerBase } from './MCPServerBase.js';
import { Command } from '../interfaces/MCPServer.js';
import { Logger } from './Logger.js';
import { ConversionRequest, ConversionResponse } from '../types/index.js';

/**
 * FormatForge MCP Server implementation
 */
export class FormatForgeMCPServer extends MCPServerBase {
  private logger: Logger;

  constructor() {
    super('FormatForge', '1.0.0');
    this.logger = Logger.getInstance();
    this.setupCommands();
  }

  /**
   * Setup available commands
   */
  private setupCommands(): void {
    // Convert format command
    const convertFormatCommand: Command = {
      name: 'convert_format',
      description: 'Convert a file from one format to another with optional transformations',
      parameters: {
        type: 'object',
        properties: {
          source_path: {
            type: 'string',
            description: 'Path to the source file to convert'
          },
          target_format: {
            type: 'string',
            description: 'Target format for conversion',
            enum: ['csv', 'xlsx', 'json', 'xml', 'md']
          },
          output_path: {
            type: 'string',
            description: 'Optional output path for the converted file'
          },
          options: {
            type: 'object',
            description: 'Optional conversion options (encoding, sheet selection, etc.)'
          },
          transformations: {
            type: 'array',
            description: 'Optional data transformations to apply'
          }
        },
        required: ['source_path', 'target_format']
      }
    };

    this.registerCommand(convertFormatCommand, this.handleConvertFormat.bind(this));

    // Help command
    const helpCommand: Command = {
      name: 'help',
      description: 'Get help information about available commands and usage',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Optional specific command to get help for'
          }
        }
      }
    };

    this.registerCommand(helpCommand, this.handleHelp.bind(this));

    // Status command
    const statusCommand: Command = {
      name: 'status',
      description: 'Get server status and supported formats',
      parameters: {
        type: 'object',
        properties: {}
      }
    };

    this.registerCommand(statusCommand, this.handleStatus.bind(this));
  }

  /**
   * Handle convert_format command
   */
  private async handleConvertFormat(params: any): Promise<ConversionResponse> {
    this.logger.info('Convert format command received', { params });

    try {
      // Validate required parameters
      if (!params.source_path) {
        throw new Error('source_path is required');
      }
      if (!params.target_format) {
        throw new Error('target_format is required');
      }

      // Create conversion request
      const request: ConversionRequest = {
        sourcePath: params.source_path,
        targetFormat: params.target_format,
        outputPath: params.output_path,
        options: params.options,
        transformations: params.transformations
      };

      // Import and use the ConvertFormatCommand for actual conversion
      const { ConvertFormatCommand } = await import('../commands/ConvertFormatCommand.js');
      const convertCommand = new ConvertFormatCommand();
      
      // Convert parameters to the expected format
      const convertParams = {
        sourcePath: params.source_path,
        targetFormat: params.target_format,
        outputPath: params.output_path,
        transformations: params.transformations,
        options: params.options,
        userId: params.user_id,
        sessionId: params.session_id
      };
      
      // Execute the conversion
      const result = await convertCommand.execute(convertParams);
      
      // Convert result to MCP response format
      const response: ConversionResponse = {
        success: result.success,
        message: result.message,
        warnings: result.warnings,
        metadata: result.metadata,
        errors: result.errors
      };

      this.logger.info('Convert format command completed', { request, response });
      return response;

    } catch (error) {
      this.logger.error('Convert format command failed', error as Error, { params });
      throw error;
    }
  }

  /**
   * Handle help command
   */
  private async handleHelp(params: any): Promise<any> {
    this.logger.info('Help command received', { params });

    if (params.command) {
      // Get help for specific command
      const command = this.commands.find(c => c.name === params.command);
      if (!command) {
        return {
          error: `Unknown command: ${params.command}`,
          available_commands: this.commands.map(c => c.name)
        };
      }

      return {
        command: command.name,
        description: command.description,
        parameters: command.parameters,
        examples: this.getCommandExamples(command.name)
      };
    }

    // General help
    return {
      server: {
        name: this.name,
        version: this.version,
        description: 'A multi-format data converter MCP for CSV, Excel, JSON, XML, and Markdown'
      },
      commands: this.commands.map(c => ({
        name: c.name,
        description: c.description
      })),
      supported_formats: {
        input: ['csv', 'xls', 'xlsx', 'json', 'xml', 'md'],
        output: ['csv', 'xlsx', 'json', 'xml', 'md']
      },
      usage_examples: [
        'convert_format with source_path="/path/to/data.csv" and target_format="json"',
        'convert_format with transformations for key styling and filtering'
      ]
    };
  }

  /**
   * Handle status command
   */
  private async handleStatus(params: any): Promise<any> {
    this.logger.info('Status command received', { params });

    return {
      server: {
        name: this.name,
        version: this.version,
        status: 'running'
      },
      supported_formats: {
        input: ['csv', 'xls', 'xlsx', 'json', 'xml', 'md'],
        output: ['csv', 'xlsx', 'json', 'xml', 'md']
      },
      capabilities: {
        format_conversion: true,
        data_transformation: true,
        key_styling: true,
        column_operations: true,
        data_filtering: true
      },
      statistics: {
        commands_registered: this.commands.length,
        recent_logs: this.logger.getLogs(5).length
      }
    };
  }

  /**
   * Get examples for a specific command
   */
  private getCommandExamples(commandName: string): string[] {
    switch (commandName) {
      case 'convert_format':
        return [
          'Convert CSV to JSON: {"source_path": "/path/to/data.csv", "target_format": "json"}',
          'Convert Excel to CSV with sheet selection: {"source_path": "/path/to/data.xlsx", "target_format": "csv", "options": {"sheetName": "Sheet1"}}',
          'Convert with transformations: {"source_path": "/path/to/data.json", "target_format": "xml", "transformations": [{"type": "keyStyle", "parameters": {"style": "lowercase"}}]}'
        ];
      case 'help':
        return [
          'Get general help: {}',
          'Get help for specific command: {"command": "convert_format"}'
        ];
      case 'status':
        return [
          'Get server status: {}'
        ];
      default:
        return [];
    }
  }

  /**
   * Start the server with enhanced logging
   */
  start(): void {
    this.logger.info('Starting FormatForge MCP Server');
    super.start();
    this.logger.info('FormatForge MCP Server started successfully');
  }

  /**
   * Stop the server with cleanup
   */
  stop(): void {
    this.logger.info('Stopping FormatForge MCP Server');
    super.stop();
    this.logger.info('FormatForge MCP Server stopped');
  }
}