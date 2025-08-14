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
        case 'tools/list':
          return this.handleListCommands(request);
        case 'tools/call':
          return await this.handleToolCall(request);
        default:
          return this.createErrorResponse(`Unknown method: ${request.method}`, -32601, request.id);
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
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2025-06-18',
        serverInfo: {
          name: this.name,
          version: this.version
        },
        capabilities: {
          tools: true
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
      jsonrpc: '2.0',
      result: {
        tools: this.commands.map(cmd => ({
          name: cmd.name,
          description: cmd.description,
          inputSchema: cmd.parameters
        }))
      },
      id: request.id
    };
  }

  /**
   * Handle tool call requests
   */
  private async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const toolName = request.params?.name;
    const toolArguments = request.params?.arguments || {};
    
    if (!toolName) {
      return this.createErrorResponse('Tool name is required', -32602, request.id);
    }
    
    const handler = this.commandHandlers.get(toolName);
    
    if (!handler) {
      return this.createErrorResponse(`Unknown tool: ${toolName}`, -32601, request.id);
    }

    try {
      const result = await handler(toolArguments);
      return {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }
          ]
        },
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
      
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        -32603,
        request.id
      );
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
      jsonrpc: '2.0',
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
    // MCP servers should not output to stdout - use stderr for logging
    console.error(`${this.name} v${this.version} started`);
    console.error(`Registered commands: ${this.commands.map(c => c.name).join(', ')}`);
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
    console.error(`${this.name} stopped`);
  }
}