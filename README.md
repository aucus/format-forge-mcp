# FormatForge MCP

A multi-format data converter MCP (Model Context Protocol) for CSV, Excel, JSON, XML, and Markdown files.

## Features

- **Multi-format Support**: Convert between CSV, Excel (XLS/XLSX), JSON, XML, and Markdown
- **Natural Language Commands**: Use Claude to request conversions with natural language
- **Data Transformations**: Apply key styling, column operations, and filtering
- **Flexible I/O**: Specify custom input/output paths or use defaults
- **Robust Error Handling**: Comprehensive error reporting and recovery
- **Audit Logging**: Track all conversion operations for security and debugging
- **Performance Monitoring**: Built-in performance metrics and optimization

## Installation

### For Development

```bash
# Clone the repository
git clone <repository-url>
cd FormatForge

# Install dependencies
npm install

# Build the project
npm run build
```

### For Production

```bash
# Install the package
npm install format-forge-mcp

# Or use the generated package
npm install ./format-forge-mcp-1.0.0.tgz
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm test:watch

# Run integration tests
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format

# Build for production
npm run build

# Create distribution package
npm run dist

# Create npm package
npm run package
```

## Project Structure

```
src/
├── types/           # TypeScript type definitions
├── interfaces/      # Core interfaces
├── errors/          # Custom error classes and recovery
├── handlers/        # Format-specific handlers (CSV, Excel, JSON, XML, Markdown)
├── transformers/    # Data transformation logic (keys, columns, filters)
├── parsers/         # Natural language command parsing
├── commands/        # MCP command implementations
├── core/           # Core conversion engine and MCP server
├── models/         # Data models and structures
├── utils/          # Utility functions
└── __tests__/      # Test files (unit, integration)
```

## Supported Formats

### Input Formats
- **CSV**: Comma-separated values with configurable delimiters
- **Excel**: XLS and XLSX files with multi-sheet support
- **JSON**: JavaScript Object Notation with nested structures
- **XML**: Extensible Markup Language with attribute support
- **Markdown**: Tables and structured text

### Output Formats
- **CSV**: Configurable delimiters and encoding
- **Excel**: XLSX with formatting and multi-sheet support
- **JSON**: Pretty-printed or compact format
- **XML**: Well-formed XML with custom root elements
- **Markdown**: Formatted tables with headers

## Data Transformations

### Key Styling
- `camelCase`: userFirstName
- `snake_case`: user_first_name
- `lowercase`: userfirstname
- `uppercase`: USERFIRSTNAME

### Column Operations
- Add new columns with default values
- Remove unwanted columns
- Rename columns
- Reorder columns

### Data Filtering
- Date range filtering
- Value-based filtering (equals, contains, greater than, etc.)
- Custom filter expressions

## MCP Commands

### convert_format
Main command for format conversion with options:

```json
{
  "source_path": "/path/to/source.csv",
  "target_format": "json",
  "output_path": "/path/to/output.json",
  "transformations": {
    "keyStyle": "camelCase",
    "columnOperations": [
      {"type": "remove", "columnName": "id"},
      {"type": "rename", "columnName": "name", "newName": "fullName"}
    ],
    "filters": {
      "dateRange": {
        "dateColumn": "created_at",
        "startDate": "2023-01-01",
        "endDate": "2023-12-31"
      }
    }
  },
  "options": {
    "encoding": "utf-8",
    "sheetName": "Sheet1",
    "includeHeaders": true
  }
}
```

### help
Get help information about available commands and usage.

### status
Get server status and supported formats information.

## Usage Examples

### Natural Language Commands
- "Convert this CSV to JSON"
- "Transform this Excel file to CSV, using only the first sheet"
- "Convert JSON to XML with lowercase keys"
- "Filter the data to show only records from 2023"
- "Remove the ID column and rename 'name' to 'fullName'"

### Programmatic Usage
```javascript
// Example MCP client usage
const response = await mcpClient.executeCommand('convert_format', {
  source_path: '/data/input.csv',
  target_format: 'json',
  transformations: {
    keyStyle: 'camelCase'
  }
});
```

## Error Handling

The server provides comprehensive error handling with:
- **Error Classification**: Categorizes errors by type and severity
- **Recovery Strategies**: Automatic retry and fallback mechanisms
- **User-Friendly Messages**: Clear error messages with suggestions
- **Audit Trail**: Complete logging of all operations and errors

## Configuration

### Environment Variables
- `NODE_ENV`: Set to 'production' for production mode
- `LOG_LEVEL`: Set logging level (debug, info, warn, error)

### Log Files
- `logs/audit.log`: Audit trail of all operations
- `logs/metrics.log`: Performance metrics and statistics

## Testing

The project includes comprehensive test coverage:
- **Unit Tests**: Individual component testing
- **Integration Tests**: End-to-end workflow testing
- **Error Scenario Tests**: Edge cases and error conditions
- **Performance Tests**: Large file handling and optimization

## Performance

- **Streaming Processing**: Handles large files efficiently
- **Memory Optimization**: Minimal memory footprint
- **Caching**: Intelligent caching for repeated operations
- **Parallel Processing**: Multi-threaded operations where applicable

## Security

- **Path Validation**: Secure file path handling
- **Input Sanitization**: Protection against injection attacks
- **Audit Logging**: Complete operation tracking
- **Permission Checking**: File system permission validation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.