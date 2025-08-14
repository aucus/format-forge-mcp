import { FormatForgeMCPServer } from '../../core/FormatForgeMCPServer.js';
import { Logger } from '../../core/Logger.js';
import { LogLevel } from '../../core/Logger.js';
import * as fs from 'fs';
import * as path from 'path';

// Use test directory path
const testDir = path.join(process.cwd(), 'src/__tests__/integration');

describe('FormatForgeMCPServer Integration Tests', () => {
  let server: FormatForgeMCPServer;
  let testDataDir: string;
  let logger: Logger;

  beforeAll(() => {
    logger = Logger.getInstance();
    logger.setLevel(LogLevel.ERROR); // Reduce log noise during tests
    
    testDataDir = path.join(testDir, '../../../../test-data');
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
  });

  beforeEach(() => {
    server = new FormatForgeMCPServer();
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testDataDir)) {
      const files = fs.readdirSync(testDataDir);
      files.forEach(file => {
        if (file.endsWith('.test.csv') || file.endsWith('.test.json') || file.endsWith('.test.xml')) {
          fs.unlinkSync(path.join(testDataDir, file));
        }
      });
    }
  });

  describe('Server Initialization', () => {
    test('should initialize server with correct name and version', () => {
      expect(server).toBeDefined();
      expect(server.name).toBe('FormatForge');
      expect(server.version).toBe('1.0.0');
    });

    test('should register required commands', () => {
      const commands = server.getCommands();
      const commandNames = commands.map(cmd => cmd.name);
      
      expect(commandNames).toContain('convert_format');
      expect(commandNames).toContain('help');
      expect(commandNames).toContain('status');
    });
  });

  describe('Help Command', () => {
    test('should return general help information', async () => {
      const result = await server.executeCommand('help', {});
      
      expect(result).toBeDefined();
      expect(result.server).toBeDefined();
      expect(result.server.name).toBe('FormatForge');
      expect(result.commands).toBeDefined();
      expect(result.supported_formats).toBeDefined();
    });

    test('should return help for specific command', async () => {
      const result = await server.executeCommand('help', { command: 'convert_format' });
      
      expect(result).toBeDefined();
      expect(result.command).toBe('convert_format');
      expect(result.description).toBeDefined();
      expect(result.parameters).toBeDefined();
    });

    test('should handle unknown command help request', async () => {
      const result = await server.executeCommand('help', { command: 'unknown_command' });
      
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
      expect(result.available_commands).toBeDefined();
    });
  });

  describe('Status Command', () => {
    test('should return server status information', async () => {
      const result = await server.executeCommand('status', {});
      
      expect(result).toBeDefined();
      expect(result.server).toBeDefined();
      expect(result.server.status).toBe('running');
      expect(result.supported_formats).toBeDefined();
      expect(result.capabilities).toBeDefined();
    });
  });

  describe('Convert Format Command', () => {
    test('should validate required parameters', async () => {
      // Test missing source_path
      await expect(
        server.executeCommand('convert_format', { target_format: 'json' })
      ).rejects.toThrow();

      // Test missing target_format
      await expect(
        server.executeCommand('convert_format', { source_path: '/test.csv' })
      ).rejects.toThrow();
    });

    test('should handle unsupported target format', async () => {
      const result = await server.executeCommand('convert_format', {
        source_path: '/test.csv',
        target_format: 'unsupported'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unsupported target format');
    });

    test('should handle non-existent source file', async () => {
      const result = await server.executeCommand('convert_format', {
        source_path: '/non/existent/file.csv',
        target_format: 'json'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('file');
    });
  });

  describe('Command Examples', () => {
    test('should provide examples for convert_format command', async () => {
      const helpResult = await server.executeCommand('help', { command: 'convert_format' });
      
      expect(helpResult.examples).toBeDefined();
      expect(Array.isArray(helpResult.examples)).toBe(true);
      expect(helpResult.examples.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed command parameters', async () => {
      await expect(
        server.executeCommand('convert_format', null)
      ).rejects.toThrow();
    });

    test('should handle unknown commands gracefully', async () => {
      await expect(
        server.executeCommand('unknown_command', {})
      ).rejects.toThrow();
    });
  });
});
