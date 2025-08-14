import { MCPServerBase } from '../core/MCPServerBase.js';
import { Command, MCPRequest } from '../interfaces/MCPServer.js';
import { ConversionError } from '../errors/ConversionError.js';

describe('MCPServerBase', () => {
  let server: MCPServerBase;

  beforeEach(() => {
    server = new MCPServerBase('TestServer', '1.0.0');
  });

  describe('constructor', () => {
    it('should initialize with name and version', () => {
      expect(server.name).toBe('TestServer');
      expect(server.version).toBe('1.0.0');
      expect(server.commands).toEqual([]);
    });
  });

  describe('registerCommand', () => {
    it('should register a command with handler', () => {
      const command: Command = {
        name: 'test_command',
        description: 'Test command',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      };

      const handler = jest.fn().mockResolvedValue({ success: true });
      server.registerCommand(command, handler);

      expect(server.commands).toHaveLength(1);
      expect(server.commands[0]).toEqual(command);
    });
  });

  describe('handleRequest', () => {
    it('should handle initialize request', async () => {
      const request: MCPRequest = {
        method: 'initialize',
        params: {},
        id: 1
      };

      const response = await server.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.serverInfo.name).toBe('TestServer');
      expect(response.result.serverInfo.version).toBe('1.0.0');
      expect(response.id).toBe(1);
    });

    it('should handle list_commands request', async () => {
      const command: Command = {
        name: 'test_command',
        description: 'Test command',
        parameters: {
          type: 'object',
          properties: {}
        }
      };

      server.registerCommand(command, jest.fn());

      const request: MCPRequest = {
        method: 'list_commands',
        params: {},
        id: 2
      };

      const response = await server.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.commands).toHaveLength(1);
      expect(response.result.commands[0]).toEqual(command);
      expect(response.id).toBe(2);
    });

    it('should handle custom command', async () => {
      const command: Command = {
        name: 'custom_command',
        description: 'Custom command',
        parameters: {
          type: 'object',
          properties: {}
        }
      };

      const handler = jest.fn().mockResolvedValue({ result: 'success' });
      server.registerCommand(command, handler);

      const request: MCPRequest = {
        method: 'custom_command',
        params: { test: 'value' },
        id: 3
      };

      const response = await server.handleRequest(request);

      expect(handler).toHaveBeenCalledWith({ test: 'value' });
      expect(response.result).toEqual({ result: 'success' });
      expect(response.id).toBe(3);
    });

    it('should return error for unknown command', async () => {
      const request: MCPRequest = {
        method: 'unknown_command',
        params: {},
        id: 4
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601);
      expect(response.error!.message).toBe('Unknown command: unknown_command');
      expect(response.id).toBe(4);
    });

    it('should return error for invalid request', async () => {
      const request: MCPRequest = {
        method: '',
        params: {},
        id: 5
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32600);
      expect(response.error!.message).toBe('Invalid request: missing method');
      expect(response.id).toBe(5);
    });

    it('should handle ConversionError properly', async () => {
      const command: Command = {
        name: 'error_command',
        description: 'Error command',
        parameters: {
          type: 'object',
          properties: {}
        }
      };

      const handler = jest.fn().mockRejectedValue(
        ConversionError.fileNotFound('/path/to/file.csv')
      );
      server.registerCommand(command, handler);

      const request: MCPRequest = {
        method: 'error_command',
        params: {},
        id: 6
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32001); // FILE_NOT_FOUND
      expect(response.error!.message).toBe('File not found: /path/to/file.csv');
      expect(response.error!.data).toEqual({ filePath: '/path/to/file.csv' });
      expect(response.id).toBe(6);
    });

    it('should handle generic errors', async () => {
      const command: Command = {
        name: 'generic_error_command',
        description: 'Generic error command',
        parameters: {
          type: 'object',
          properties: {}
        }
      };

      const handler = jest.fn().mockRejectedValue(new Error('Generic error'));
      server.registerCommand(command, handler);

      const request: MCPRequest = {
        method: 'generic_error_command',
        params: {},
        id: 7
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32603);
      expect(response.error!.message).toBe('Generic error');
      expect(response.id).toBe(7);
    });
  });

  describe('start and stop', () => {
    it('should start and stop without errors', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      server.start();
      expect(consoleSpy).toHaveBeenCalledWith('TestServer v1.0.0 started');

      server.stop();
      expect(consoleSpy).toHaveBeenCalledWith('TestServer stopped');

      consoleSpy.mockRestore();
    });
  });
});