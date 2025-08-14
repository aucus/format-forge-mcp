import { MCPServer, MCPRequest, MCPResponse, MCPError, Command } from '../interfaces/MCPServer.js';
import { ConversionError } from '../errors/ConversionError.js';

/**
 * Base MCP Server implementation
 */
export class MCPServerBase implements MCPServer {
  public readonly name: string;
  public readonly version: string;
  public readonly commands: Command[];
  
  private commandHandlers: Map<string, (params: any) => Promise<any>>;

  constructor(name: string, version: string) {
    this.name = name;
    this.version = version;
    this.commands = [];
    this.commandHandlers = new Map();
  }

  /**
   * Register a command with its handler
   */
  registerCommand(command: Command, handler: (params: any) => Promise<any>): void {
    this.commands.push(command);
    this.commandHandlers.set(command.name, handler);
  }

  /**
   * Handle incoming MCP requests
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      // Validate request
      if (!request.method) {
        return this.createErrorResponse('Invalid request: missing method', -32600, request.id);
      }

      // Handle built-in methods
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(request);
        case 'list_commands':
          return this.handleListCommands(request);
        default:
          // Handle custom commands
          return await this.handleCustomCommand(request);
      }
    } catch (error) {
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        -32603,
        request.id,
        error
      );
    }
  }

  /**
   * Handle initialize request
   */
  private handleInitialize(request: MCPRequest): MCPResponse {
    return {
      result: {
        protocolVersion: '1.0.0',
        serverInfo: {
          name: this.name,
          version: this.version
        },
        capabilities: {
          commands: true,
          resources: false,
          tools: false
        }
      },
      id: request.id
    };
  }

  /**
   * Handle list commands request
   */
  private handleListCommands(request: MCPRequest): MCPResponse {
    return {
      result: {
        commands: this.commands
      },
      id: request.id
    };
  }

  /**
   * Handle custom command requests
   */
  private async handleCustomCommand(request: MCPRequest): Promise<MCPResponse> {
    const handler = this.commandHandlers.get(request.method);
    
    if (!handler) {
      return this.createErrorResponse(
        `Unknown command: ${request.method}`,
        -32601,
        request.id
      );
    }

    try {
      const result = await handler(request.params || {});
      return {
        result,
        id: request.id
      };
    } catch (error) {
      if (error instanceof ConversionError) {
        return this.createErrorResponse(
          error.message,
          this.getErrorCodeForConversionError(error.code),
          request.id,
          error.details
        );
      }
      
      throw error; // Re-throw non-conversion errors
    }
  }

  /**
   * Create an error response
   */
  private createErrorResponse(
    message: string, 
    code: number, 
    id?: string | number,
    data?: any
  ): MCPResponse {
    const error: MCPError = {
      code,
      message,
      ...(data && { data })
    };

    return {
      error,
      id
    };
  }

  /**
   * Map ConversionError codes to MCP error codes
   */
  private getErrorCodeForConversionError(errorCode: string): number {
    switch (errorCode) {
      case 'FILE_NOT_FOUND':
        return -32001;
      case 'PERMISSION_DENIED':
        return -32002;
      case 'UNSUPPORTED_FORMAT':
        return -32003;
      case 'CONVERSION_FAILED':
        return -32004;
      case 'VALIDATION_FAILED':
        return -32005;
      default:
        return -32603; // Internal error
    }
  }

  /**
   * Start the MCP server
   */
  start(): void {
    console.log(`${this.name} v${this.version} started`);
    console.log(`Registered commands: ${this.commands.map(c => c.name).join(', ')}`);
  }

  /**
   * Execute a command directly (for testing purposes)
   */
  async executeCommand(method: string, params: any): Promise<any> {
    const handler = this.commandHandlers.get(method);
    
    if (!handler) {
      throw new Error(`Unknown command: ${method}`);
    }

    return await handler(params);
  }

  /**
   * Get registered commands
   */
  getCommands(): Command[] {
    return [...this.commands];
  }

  /**
   * Stop the MCP server
   */
  stop(): void {
    console.log(`${this.name} stopped`);
  }
}