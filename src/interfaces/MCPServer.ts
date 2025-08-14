/**
 * MCP Server interfaces
 */
export interface MCPRequest {
  jsonrpc?: string;
  method: string;
  params?: any;
  id?: string | number;
}

export interface MCPResponse {
  jsonrpc?: string;
  result?: any;
  error?: MCPError;
  id?: string | number;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface Command {
  name: string;
  description: string;
  parameters: ParameterSchema;
}

export interface ParameterSchema {
  type: 'object';
  properties: Record<string, ParameterProperty>;
  required?: string[];
}

export interface ParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: any;
}

export interface MCPServer {
  name: string;
  version: string;
  commands: Command[];
  handleRequest(request: MCPRequest): Promise<MCPResponse>;
}