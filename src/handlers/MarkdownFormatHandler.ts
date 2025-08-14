import { BaseFormatHandler } from './BaseFormatHandler.js';
import { DataStructure, ReadOptions, WriteOptions, ValidationResult } from '../types/index.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { ConversionError } from '../errors/ConversionError.js';
import { marked } from 'marked';

/**
 * Markdown format handler using marked library
 */
export class MarkdownFormatHandler extends BaseFormatHandler {
  constructor() {
    super(['md'], ['.md', '.markdown']);
    
    // Configure marked options
    marked.setOptions({
      gfm: true, // GitHub Flavored Markdown
      breaks: false,
      pedantic: false
    });
  }

  /**
   * Read Markdown file and convert to DataStructure
   */
  async read(filePath: string, options?: ReadOptions): Promise<DataStructure> {
    this.logOperation('Reading Markdown file', filePath, options);

    try {
      const readOptions = this.parseReadOptions(options);
      const content = await this.readFileContent(filePath, readOptions.encoding);

      // Extract tables from Markdown content
      const tabularData = this.extractTablesFromMarkdown(content);

      // Create and return data structure
      const dataStructure = this.createDataStructure(
        tabularData.rows,
        'md',
        readOptions.encoding,
        tabularData.headers
      );

      this.logOperation('Markdown file read successfully', filePath, {
        rowCount: tabularData.rows.length,
        columnCount: tabularData.headers?.length || 0,
        hasHeaders: !!tabularData.headers,
        tablesFound: tabularData.tablesFound,
        contentType: tabularData.contentType
      });

      return dataStructure;

    } catch (error) {
      this.handleError(error as Error, 'read', filePath);
    }
  }

  /**
   * Write DataStructure to Markdown file
   */
  async write(data: DataStructure, filePath: string, options?: WriteOptions): Promise<void> {
    this.logOperation('Writing Markdown file', filePath, options);

    try {
      const writeOptions = this.parseWriteOptions(options);

      // Validate data structure
      const validation = this.validate(data);
      if (!validation.isValid) {
        const errorMessages = validation.errors.map(e => e.message);
        throw ConversionError.validationFailed(errorMessages);
      }

      // Check overwrite settings
      await this.checkOverwrite(filePath, writeOptions.overwrite);

      // Generate Markdown content
      const markdownContent = this.generateMarkdownContent(data, writeOptions);

      // Write to file
      await this.writeFileContent(filePath, markdownContent, writeOptions.encoding);

      this.logOperation('Markdown file written successfully', filePath, {
        rowCount: data.rows.length,
        columnCount: data.headers?.length || Object.keys(data.rows[0] || {}).length,
        hasHeaders: !!data.headers,
        outputFormat: writeOptions.formatting?.outputFormat || 'table'
      });

    } catch (error) {
      this.handleError(error as Error, 'write', filePath);
    }
  }

  /**
   * Validate Markdown-specific data structure
   */
  protected validateFormatSpecific(data: DataStructure): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Markdown-specific validations
    if (data.rows.length === 0) {
      warnings.push(ValidationUtils.createWarning(
        'EMPTY_MARKDOWN_DATA',
        'Markdown data contains no rows',
        'rows'
      ));
    }

    // Check for data that might not display well in Markdown tables
    let hasComplexData = false;
    let hasLongText = false;
    let hasNewlines = false;

    data.rows.forEach((row, rowIndex) => {
      Object.entries(row).forEach(([key, value]) => {
        if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
          hasComplexData = true;
        }
        
        if (typeof value === 'string') {
          if (value.length > 100) {
            hasLongText = true;
          }
          if (value.includes('\n') || value.includes('\r')) {
            hasNewlines = true;
          }
        }
      });
    });

    if (hasComplexData) {
      warnings.push(ValidationUtils.createWarning(
        'COMPLEX_MARKDOWN_DATA',
        'Data contains complex objects that will be converted to strings in Markdown',
        'rows'
      ));
    }

    if (hasLongText) {
      warnings.push(ValidationUtils.createWarning(
        'LONG_TEXT_IN_MARKDOWN',
        'Data contains long text that may not display well in Markdown tables',
        'rows'
      ));
    }

    if (hasNewlines) {
      warnings.push(ValidationUtils.createWarning(
        'NEWLINES_IN_MARKDOWN',
        'Data contains newlines that will be converted to spaces in Markdown tables',
        'rows'
      ));
    }

    // Check for Markdown special characters that might need escaping
    let hasSpecialChars = false;
    const specialChars = ['|', '\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!'];

    data.rows.forEach((row, rowIndex) => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'string') {
          if (specialChars.some(char => value.includes(char))) {
            hasSpecialChars = true;
          }
        }
      });
    });

    if (hasSpecialChars) {
      warnings.push(ValidationUtils.createWarning(
        'MARKDOWN_SPECIAL_CHARACTERS',
        'Data contains Markdown special characters that will be escaped',
        'rows'
      ));
    }

    // Check for very wide tables
    const columnCount = data.headers?.length || (data.rows.length > 0 ? Object.keys(data.rows[0]).length : 0);
    if (columnCount > 10) {
      warnings.push(ValidationUtils.createWarning(
        'WIDE_MARKDOWN_TABLE',
        `Table has many columns (${columnCount}) which may not display well in Markdown`,
        'headers'
      ));
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Extract tables from Markdown content
   */
  private extractTablesFromMarkdown(content: string): {
    rows: Record<string, any>[];
    headers?: string[];
    tablesFound: number;
    contentType: string;
  } {
    // Remove BOM if present
    const cleanContent = content.replace(/^\uFEFF/, '');
    
    if (cleanContent.trim() === '') {
      return { rows: [], tablesFound: 0, contentType: 'empty' };
    }

    // Look for Markdown tables
    const tables = this.findMarkdownTables(cleanContent);
    
    if (tables.length > 0) {
      // Use the first table found
      const firstTable = tables[0];
      return {
        rows: firstTable.rows,
        headers: firstTable.headers,
        tablesFound: tables.length,
        contentType: 'table'
      };
    }

    // If no tables found, try to extract other structured content
    const structuredData = this.extractStructuredContent(cleanContent);
    
    return {
      rows: structuredData.rows,
      headers: structuredData.headers,
      tablesFound: 0,
      contentType: structuredData.contentType
    };
  }

  /**
   * Find Markdown tables in content
   */
  private findMarkdownTables(content: string): Array<{
    rows: Record<string, any>[];
    headers?: string[];
  }> {
    const tables: Array<{ rows: Record<string, any>[]; headers?: string[] }> = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if this line looks like a table header
      if (line.includes('|') && line.split('|').length > 2) {
        // Check if next line is a separator
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        if (nextLine.includes('|') && nextLine.includes('-')) {
          // This looks like a table
          const table = this.parseMarkdownTable(lines, i);
          if (table) {
            tables.push(table);
            i = table.endIndex || i; // Skip processed lines
          }
        }
      }
    }
    
    return tables;
  }

  /**
   * Parse a Markdown table starting at the given line index
   */
  private parseMarkdownTable(lines: string[], startIndex: number): {
    rows: Record<string, any>[];
    headers?: string[];
    endIndex?: number;
  } | null {
    try {
      const headerLine = lines[startIndex].trim();
      const separatorLine = lines[startIndex + 1]?.trim();
      
      if (!headerLine || !separatorLine) {
        return null;
      }

      // Parse headers
      const headers = headerLine
        .split('|')
        .map(h => h.trim())
        .filter(h => h.length > 0);

      if (headers.length === 0) {
        return null;
      }

      // Parse data rows
      const rows: Record<string, any>[] = [];
      let currentIndex = startIndex + 2; // Skip header and separator

      while (currentIndex < lines.length) {
        const line = lines[currentIndex].trim();
        
        // Stop if we hit an empty line or non-table content
        if (!line || !line.includes('|')) {
          break;
        }

        const cells = line
          .split('|')
          .map(c => c.trim())
          .filter((c, index, arr) => {
            // Remove empty cells at start/end (from leading/trailing |)
            return !(index === 0 && c === '') && !(index === arr.length - 1 && c === '');
          });

        if (cells.length > 0) {
          const row: Record<string, any> = {};
          headers.forEach((header, index) => {
            const cellValue = index < cells.length ? cells[index] : '';
            row[header] = this.parseMarkdownCellValue(cellValue);
          });
          rows.push(row);
        }

        currentIndex++;
      }

      return {
        rows,
        headers,
        endIndex: currentIndex - 1
      };

    } catch (error) {
      this.logger.warn('Failed to parse Markdown table', { error: (error as Error).message, startIndex });
      return null;
    }
  }

  /**
   * Parse cell value from Markdown table
   */
  private parseMarkdownCellValue(cellValue: string): any {
    if (!cellValue || cellValue === '') {
      return null;
    }

    // Remove Markdown formatting
    let cleaned = cellValue
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1')     // Italic
      .replace(/`(.*?)`/g, '$1')       // Code
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
      .trim();

    // Try to parse as number
    if (/^\d+$/.test(cleaned)) {
      return parseInt(cleaned, 10);
    }
    
    if (/^\d*\.\d+$/.test(cleaned)) {
      return parseFloat(cleaned);
    }

    // Try to parse as boolean
    if (cleaned.toLowerCase() === 'true') {
      return true;
    }
    if (cleaned.toLowerCase() === 'false') {
      return false;
    }

    return cleaned;
  }

  /**
   * Extract structured content from non-table Markdown
   */
  private extractStructuredContent(content: string): {
    rows: Record<string, any>[];
    headers?: string[];
    contentType: string;
  } {
    // Try to extract list items
    const listItems = this.extractListItems(content);
    if (listItems.length > 0) {
      return {
        rows: listItems.map((item, index) => ({ index, item, type: 'list-item' })),
        headers: ['index', 'item', 'type'],
        contentType: 'list'
      };
    }

    // Try to extract headings
    const headings = this.extractHeadings(content);
    if (headings.length > 0) {
      return {
        rows: headings,
        headers: ['level', 'text', 'type'],
        contentType: 'headings'
      };
    }

    // Fallback: treat as plain text
    const paragraphs = content
      .split('\n\n')
      .map(p => p.trim())
      .filter(p => p.length > 0);

    return {
      rows: paragraphs.map((paragraph, index) => ({
        index,
        content: paragraph,
        type: 'paragraph'
      })),
      headers: ['index', 'content', 'type'],
      contentType: 'text'
    };
  }

  /**
   * Extract list items from Markdown
   */
  private extractListItems(content: string): string[] {
    const listPattern = /^[\s]*[-*+]\s+(.+)$/gm;
    const orderedListPattern = /^[\s]*\d+\.\s+(.+)$/gm;
    
    const items: string[] = [];
    let match;

    // Unordered lists
    while ((match = listPattern.exec(content)) !== null) {
      items.push(match[1].trim());
    }

    // Ordered lists
    while ((match = orderedListPattern.exec(content)) !== null) {
      items.push(match[1].trim());
    }

    return items;
  }

  /**
   * Extract headings from Markdown
   */
  private extractHeadings(content: string): Array<{ level: number; text: string; type: string }> {
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    const headings: Array<{ level: number; text: string; type: string }> = [];
    let match;

    while ((match = headingPattern.exec(content)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        type: 'heading'
      });
    }

    return headings;
  }

  /**
   * Generate Markdown content from DataStructure
   */
  private generateMarkdownContent(data: DataStructure, options: Required<WriteOptions>): string {
    const outputFormat = options.formatting?.outputFormat || 'table';
    
    switch (outputFormat) {
      case 'list':
        return this.generateMarkdownList(data, options);
      case 'headings':
        return this.generateMarkdownHeadings(data, options);
      case 'table':
      default:
        return this.generateMarkdownTable(data, options);
    }
  }

  /**
   * Generate Markdown table
   */
  private generateMarkdownTable(data: DataStructure, options: Required<WriteOptions>): string {
    if (data.rows.length === 0) {
      return '<!-- Empty table -->\n';
    }

    const headers = data.headers || Object.keys(data.rows[0]);
    const alignment = options.formatting?.alignment || 'left';
    
    // Generate header row
    let markdown = '| ' + headers.join(' | ') + ' |\n';
    
    // Generate separator row
    const separator = headers.map(() => {
      switch (alignment) {
        case 'center': return ':---:';
        case 'right': return '---:';
        case 'left':
        default: return '---';
      }
    });
    markdown += '| ' + separator.join(' | ') + ' |\n';
    
    // Generate data rows
    data.rows.forEach(row => {
      const cells = headers.map(header => {
        const value = row[header];
        return this.formatValueForMarkdown(value);
      });
      markdown += '| ' + cells.join(' | ') + ' |\n';
    });

    // Add title if specified
    if (options.formatting?.title) {
      markdown = `# ${options.formatting.title}\n\n${markdown}`;
    }

    return markdown;
  }

  /**
   * Generate Markdown list
   */
  private generateMarkdownList(data: DataStructure, options: Required<WriteOptions>): string {
    if (data.rows.length === 0) {
      return '<!-- Empty list -->\n';
    }

    const listType = options.formatting?.listType || 'unordered';
    const headers = data.headers || Object.keys(data.rows[0]);
    
    let markdown = '';
    
    // Add title if specified
    if (options.formatting?.title) {
      markdown += `# ${options.formatting.title}\n\n`;
    }

    data.rows.forEach((row, index) => {
      const bullet = listType === 'ordered' ? `${index + 1}.` : '-';
      
      if (headers.length === 1) {
        // Single column - simple list
        const value = this.formatValueForMarkdown(row[headers[0]]);
        markdown += `${bullet} ${value}\n`;
      } else {
        // Multiple columns - structured list
        const items = headers.map(header => {
          const value = this.formatValueForMarkdown(row[header]);
          return `**${header}**: ${value}`;
        });
        markdown += `${bullet} ${items.join(', ')}\n`;
      }
    });

    return markdown;
  }

  /**
   * Generate Markdown headings
   */
  private generateMarkdownHeadings(data: DataStructure, options: Required<WriteOptions>): string {
    if (data.rows.length === 0) {
      return '<!-- Empty headings -->\n';
    }

    let markdown = '';
    
    data.rows.forEach(row => {
      const level = row.level || 1;
      const text = row.text || row.content || String(row[Object.keys(row)[0]] || '');
      const headingPrefix = '#'.repeat(Math.min(Math.max(level, 1), 6));
      
      markdown += `${headingPrefix} ${text}\n\n`;
    });

    return markdown;
  }

  /**
   * Format value for Markdown output
   */
  private formatValueForMarkdown(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      // Escape Markdown special characters and handle newlines
      return value
        .replace(/\n/g, ' ') // Convert newlines to spaces
        .replace(/\r/g, '')  // Remove carriage returns
        .replace(/\|/g, '\\|') // Escape pipe characters
        .replace(/\\/g, '\\\\') // Escape backslashes
        .trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (value instanceof Date) {
      return value.toISOString().split('T')[0]; // YYYY-MM-DD format
    }

    if (Array.isArray(value)) {
      return value.map(item => this.formatValueForMarkdown(item)).join(', ');
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  }

  /**
   * Get Markdown-specific formatting options
   */
  getMarkdownFormattingOptions(): {
    outputFormats: string[];
    alignments: string[];
    listTypes: string[];
    features: string[];
  } {
    return {
      outputFormats: ['table', 'list', 'headings'],
      alignments: ['left', 'center', 'right'],
      listTypes: ['unordered', 'ordered'],
      features: [
        'GitHub Flavored Markdown tables',
        'Multiple output formats (table, list, headings)',
        'Table alignment options',
        'Ordered and unordered lists',
        'Markdown special character escaping',
        'Newline handling in table cells',
        'Complex data type conversion',
        'Title and heading generation',
        'List item extraction',
        'Heading extraction',
        'Table parsing with formatting removal'
      ]
    };
  }

  /**
   * Analyze Markdown content structure
   */
  analyzeMarkdownStructure(content: string): {
    hasTable: boolean;
    tableCount: number;
    hasHeadings: boolean;
    headingCount: number;
    hasLists: boolean;
    listItemCount: number;
    contentType: string;
  } {
    const tables = this.findMarkdownTables(content);
    const headings = this.extractHeadings(content);
    const listItems = this.extractListItems(content);

    let contentType = 'text';
    if (tables.length > 0) {
      contentType = 'table';
    } else if (headings.length > 0) {
      contentType = 'structured';
    } else if (listItems.length > 0) {
      contentType = 'list';
    }

    return {
      hasTable: tables.length > 0,
      tableCount: tables.length,
      hasHeadings: headings.length > 0,
      headingCount: headings.length,
      hasLists: listItems.length > 0,
      listItemCount: listItems.length,
      contentType
    };
  }

  /**
   * Convert Markdown to HTML for preview
   */
  async convertToHtml(markdownContent: string): Promise<string> {
    try {
      const result = marked(markdownContent);
      return typeof result === 'string' ? result : await result;
    } catch (error) {
      this.logger.error('Failed to convert Markdown to HTML', error as Error);
      throw ConversionError.conversionFailed(
        `Markdown to HTML conversion failed: ${(error as Error).message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Extract metadata from Markdown frontmatter
   */
  extractFrontmatter(content: string): {
    metadata: Record<string, any>;
    content: string;
  } {
    const frontmatterPattern = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterPattern);

    if (!match) {
      return { metadata: {}, content };
    }

    try {
      const yamlContent = match[1];
      const mainContent = match[2];
      
      // Simple YAML parsing (for basic key-value pairs)
      const metadata: Record<string, any> = {};
      yamlContent.split('\n').forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          metadata[key] = value.replace(/^["']|["']$/g, ''); // Remove quotes
        }
      });

      return { metadata, content: mainContent };
    } catch (error) {
      this.logger.warn('Failed to parse frontmatter', { error: (error as Error).message });
      return { metadata: {}, content };
    }
  }
}