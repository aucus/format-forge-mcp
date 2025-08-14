import { FormatForgeMCPServer } from '../core/FormatForgeMCPServer.js';
import { MCPRequest } from '../interfaces/MCPServer.js';
import { Logger, LogLevel } from '../core/Logger.js';

describe('FormatForgeMCPServer', () => {
  let server: FormatForgeMCPServer;
  let logger: Logger;

  beforeEach(() => {
    server = new FormatForgeMCPServer();
    logger = Logger.getInstance();
    logger.clearLogs();
    logger.setLevel(LogLevel.ERROR); // Reduce noise in tests
  });

  afterEach(() => {
    logger.clearLogs();
  });

  describe('constructor', () => {
    it('should initialize with correct name and version', () => {
      expect(server.name).toBe('FormatForge');
      expect(server.version).toBe('1.0.0');
    });

    it('should register default commands', () => {
      const commandNames = server.commands.map(c => c.name);
      expect(commandNames).toContain('convert_format');
      expect(commandNames).toContain('help');
      expect(commandNames).toContain('status');
    });
  });

  describe('convert_format command', () => {
    it('should handle valid conversion request', async () => {
      const request: MCPRequest = {
        method: 'convert_format',
        params: {
          source_path: '/path/to/input.csv',
          target_format: 'json'
        },
        id: 1
      };

      const response = await server.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.success).toBe(false); // Placeholder implementation
      expect(response.result.message).toBe('Conversion engine not yet implemented');
      expect(response.result.warnings).toContain('This is a placeholder implementation');
      expect(response.id).toBe(1);
    });

    it('should handle conversion request with all parameters', async () => {
      const request: MCPRequest = {
        method: 'convert_format',
        params: {
          source_path: '/path/to/input.xlsx',
          target_format: 'csv',
          output_path: '/path/to/output.csv',
          options: {
            sheetName: 'Sheet1',
            encoding: 'utf-8'
          },
          transformations: [
            {
              type: 'keyStyle',
              parameters: { style: 'lowercase' }
            }
          ]
        },
        id: 2
      };

      const response = await server.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.success).toBe(false); // Placeholder implementation
      expect(response.id).toBe(2);
    });

    it('should return error for missing source_path', async () => {
      const request: MCPRequest = {
        method: 'convert_format',
        params: {
          target_format: 'json'
        },
        id: 3
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error!.message).toBe('source_path is required');
      expect(response.id).toBe(3);
    });

    it('should return error for missing target_format', async () => {
      const request: MCPRequest = {
        method: 'convert_format',
        params: {
          source_path: '/path/to/input.csv'
        },
        id: 4
      };

      const response = await server.handleRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error!.message).toBe('target_format is required');
      expect(response.id).toBe(4);
    });
  });

  describe('help command', () => {
    it('should return general help', async () => {
      const request: MCPRequest = {
        method: 'help',
        params: {},
        id: 5
      };

      const response = await server.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.server.name).toBe('FormatForge');
      expect(response.result.server.version).toBe('1.0.0');
      expect(response.result.commands).toBeDefined();
      expect(response.result.supported_formats).toBeDefined();
      expect(response.result.usage_examples).toBeDefined();
      expect(response.id).toBe(5);
    });

    it('should return help for specific command', async () => {
      const request: MCPRequest = {
        method: 'help',
        params: {
          command: 'convert_format'
        },
        id: 6
      };

      const response = await server.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.command).toBe('convert_format');
      expect(response.result.description).toBeDefined();
      expect(response.result.parameters).toBeDefined();
      expect(response.result.examples).toBeDefined();
      expect(response.result.examples.length).toBeGreaterThan(0);
      expect(response.id).toBe(6);
    });

    it('should return error for unknown command help', async () => {
      const request: MCPRequest = {
        method: 'help',
        params: {
          command: 'unknown_command'
        },
        id: 7
      };

      const response = await server.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.error).toBe('Unknown command: unknown_command');
      expect(response.result.available_commands).toBeDefined();
      expect(response.id).toBe(7);
    });
  });

  describe('status command', () => {
    it('should return server status', async () => {
      const request: MCPRequest = {
        method: 'status',
        params: {},
        id: 8
      };

      const response = await server.handleRequest(request);

      expect(response.result).toBeDefined();
      expect(response.result.server.name).toBe('FormatForge');
      expect(response.result.server.version).toBe('1.0.0');
      expect(response.result.server.status).toBe('running');
      expect(response.result.supported_formats).toBeDefined();
      expect(response.result.capabilities).toBeDefined();
      expect(response.result.statistics).toBeDefined();
      expect(response.id).toBe(8);
    });
  });

  describe('start and stop', () => {
    it('should start and stop with logging', () => {
      logger.setLevel(LogLevel.INFO);
      
      server.start();
      server.stop();
      
      const logs = logger.getLogs();
      const logMessages = logs.map(log => log.message);
      
      expect(logMessages).toContain('Starting FormatForge MCP Server');
      expect(logMessages).toContain('FormatForge MCP Server started successfully');
      expect(logMessages).toContain('Stopping FormatForge MCP Server');
      expect(logMessages).toContain('FormatForge MCP Server stopped');
    });
  });
});