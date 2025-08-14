// Main entry point for FormatForge MCP
export * from './types/index.js';
export * from './interfaces/FormatHandler.js';
export * from './interfaces/DataTransformer.js';
export * from './interfaces/MCPServer.js';
export * from './errors/ConversionError.js';
export * from './errors/ErrorRecovery.js';
export * from './core/MCPServerBase.js';
export * from './core/Logger.js';
export * from './core/AuditLogger.js';
export * from './core/FormatForgeMCPServer.js';
export * from './core/FormatDetector.js';
export * from './core/FormatValidator.js';
export * from './core/ConversionOrchestrator.js';
export * from './handlers/BaseFormatHandler.js';
export * from './handlers/FormatHandlerRegistry.js';
export * from './handlers/FormatHandlerFactory.js';
export * from './handlers/CsvFormatHandler.js';
export * from './handlers/ExcelFormatHandler.js';
export * from './handlers/JsonFormatHandler.js';
export * from './handlers/XmlFormatHandler.js';
export * from './handlers/MarkdownFormatHandler.js';
export * from './transformers/KeyTransformer.js';
export * from './transformers/ColumnManipulator.js';
export * from './transformers/DataFilter.js';
export * from './parsers/CommandParser.js';
export * from './models/DataStructure.js';
export * from './models/ConversionRequest.js';
export * from './models/ConversionResponse.js';
export * from './utils/ValidationUtils.js';
export * from './utils/FileIOManager.js';
export * from './commands/ConvertFormatCommand.js';

import { FormatForgeMCPServer } from './core/FormatForgeMCPServer.js';
import { Logger, LogLevel } from './core/Logger.js';

// Initialize server if running as main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const logger = Logger.getInstance();
  logger.setLevel(LogLevel.INFO);
  
  const server = new FormatForgeMCPServer();
  
  // Handle process signals
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    server.stop();
    process.exit(0);
  });
  
  // Start the server
  server.start();
}