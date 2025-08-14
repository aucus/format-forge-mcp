#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Create an MCP server for FormatForge
 */
const server = new Server(
  {
    name: 'format-forge',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'convert_format',
        description: 'Convert data between different formats (JSON, XML, CSV)',
        inputSchema: {
          type: 'object',
          properties: {
            data: {
              type: 'string',
              description: 'The data to convert'
            },
            from_format: {
              type: 'string',
              enum: ['json', 'xml', 'csv'],
              description: 'Source format'
            },
            to_format: {
              type: 'string', 
              enum: ['json', 'xml', 'csv'],
              description: 'Target format'
            },
            key_style: {
              type: 'string',
              enum: ['camelCase', 'snake_case', 'lowercase', 'uppercase'],
              description: 'Key styling for transformation',
              default: 'unchanged'
            }
          },
          required: ['data', 'from_format', 'to_format']
        }
      },
      {
        name: 'server_status',
        description: 'Get server status and capabilities',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'convert_format') {
      return await handleConvertFormat(args);
    } else if (name === 'server_status') {
      return await handleServerStatus(args);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ],
      isError: true
    };
  }
});

/**
 * Handle format conversion
 */
async function handleConvertFormat(args: any) {
  const { data, from_format, to_format, key_style } = args;
  
  console.error(`[DEBUG] Converting from ${from_format} to ${to_format}`);
  
  try {
    let parsedData: any;
    
    // Parse input data
    switch (from_format) {
      case 'json':
        parsedData = JSON.parse(data);
        break;
      case 'xml':
        // Simple XML to JSON conversion (basic implementation)
        const xml2js = await import('xml2js');
        const parser = new xml2js.Parser();
        parsedData = await parser.parseStringPromise(data);
        break;
      case 'csv':
        // Simple CSV parsing (basic implementation)
        const Papa = await import('papaparse');
        const result = Papa.parse(data, { header: true, dynamicTyping: true });
        parsedData = result.data;
        break;
      default:
        throw new Error(`Unsupported source format: ${from_format}`);
    }
    
    // Apply key styling if specified
    if (key_style && key_style !== 'unchanged') {
      parsedData = transformKeys(parsedData, key_style);
    }
    
    // Convert to target format
    let output: string;
    switch (to_format) {
      case 'json':
        output = JSON.stringify(parsedData, null, 2);
        break;
      case 'xml':
        const xml2js = await import('xml2js');
        const builder = new xml2js.Builder();
        output = builder.buildObject(parsedData);
        break;
      case 'csv':
        const Papa = await import('papaparse');
        output = Papa.unparse(parsedData);
        break;
      default:
        throw new Error(`Unsupported target format: ${to_format}`);
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `Conversion successful!\n\nResult:\n${output}`
        }
      ]
    };
    
  } catch (error) {
    throw new Error(`Conversion failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Transform object keys according to specified style
 */
function transformKeys(obj: any, style: string): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => transformKeys(item, style));
  }
  
  const transformed: any = {};
  for (const [key, value] of Object.entries(obj)) {
    let newKey = key;
    
    switch (style) {
      case 'camelCase':
        newKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        break;
      case 'snake_case':
        newKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        break;
      case 'lowercase':
        newKey = key.toLowerCase();
        break;
      case 'uppercase':
        newKey = key.toUpperCase();
        break;
    }
    
    transformed[newKey] = transformKeys(value, style);
  }
  
  return transformed;
}

/**
 * Handle server status request
 */
async function handleServerStatus(args: any) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          server: {
            name: 'FormatForge',
            version: '1.0.0',
            status: 'running'
          },
          supported_formats: {
            input: ['json', 'xml', 'csv'],
            output: ['json', 'xml', 'csv']
          },
          capabilities: {
            format_conversion: true,
            key_styling: true
          }
        }, null, 2)
      }
    ]
  };
}

/**
 * Main function
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('FormatForge MCP Server started on stdio');
}

// Handle cleanup
process.on('SIGINT', async () => {
  console.error('SIGINT received, shutting down...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('SIGTERM received, shutting down...');
  await server.close();
  process.exit(0);
});

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
