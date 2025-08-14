import { MarkdownFormatHandler } from '../handlers/MarkdownFormatHandler.js';
import { DataStructure } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as fs from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  constants: { R_OK: 4, W_OK: 2, F_OK: 0 },
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn()
  }
}));

// Mock marked
jest.mock('marked', () => ({
  marked: jest.fn((content: string) => `<p>${content}</p>`),
  setOptions: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('MarkdownFormatHandler', () => {
  let handler: MarkdownFormatHandler;

  beforeEach(() => {
    handler = new MarkdownFormatHandler();
    jest.clearAllMocks();
    
    // Default mocks for file operations
    mockFs.promises.access.mockResolvedValue(undefined);
    mockFs.promises.mkdir.mockResolvedValue(undefined);
    mockFs.promises.writeFile.mockResolvedValue(undefined);
  });

  describe('constructor and basic properties', () => {
    it('should initialize with correct format and extensions', () => {
      expect(handler.canHandle('md')).toBe(true);
      expect(handler.canHandle('json')).toBe(false);
      expect(handler.getSupportedExtensions()).toEqual(['.md', '.markdown']);
    });
  });

  describe('read', () => {
    it('should read Markdown table', async () => {
      const markdownContent = `# Test Table

| Name | Age | Email |
|------|-----|-------|
| John | 30  | john@example.com |
| Jane | 25  | jane@example.com |
`;
      mockFs.promises.readFile.mockResolvedValue(markdownContent);

      const result = await handler.read('/path/to/file.md');

      expect(result.rows).toEqual([
        { Name: 'John', Age: 30, Email: 'john@example.com' },
        { Name: 'Jane', Age: 25, Email: 'jane@example.com' }
      ]);
      expect(result.headers).toEqual(['Name', 'Age', 'Email']);
      expect(result.metadata.originalFormat).toBe('md');
    });

    it('should read Markdown table with formatting', async () => {
      const markdownContent = `| Name | Description | Active |
|------|-------------|--------|
| **John** | A *person* with \`code\` | true |
| [Jane](link) | Another person | false |
`;
      mockFs.promises.readFile.mockResolvedValue(markdownContent);

      const result = await handler.read('/path/to/file.md');

      expect(result.rows).toEqual([
        { Name: 'John', Description: 'A person with code', Active: true },
        { Name: 'Jane', Description: 'Another person', Active: false }
      ]);
    });

    it('should read Markdown table with empty cells', async () => {
      const markdownContent = `| Name | Age | Email |
|------|-----|-------|
| John |     | john@example.com |
|      | 25  |  |
| Bob  | 35  | bob@example.com |
`;
      mockFs.promises.readFile.mockResolvedValue(markdownContent);

      const result = await handler.read('/path/to/file.md');

      expect(result.rows).toEqual([
        { Name: 'John', Age: null, Email: 'john@example.com' },
        { Name: null, Age: 25, Email: null },
        { Name: 'Bob', Age: 35, Email: 'bob@example.com' }
      ]);
    });

    it('should read Markdown with multiple tables and use first one', async () => {
      const markdownContent = `# First Table

| Name | Age |
|------|-----|
| John | 30  |

# Second Table

| Product | Price |
|---------|-------|
| Apple   | 1.00  |
`;
      mockFs.promises.readFile.mockResolvedValue(markdownContent);

      const result = await handler.read('/path/to/file.md');

      expect(result.rows).toEqual([
        { Name: 'John', Age: 30 }
      ]);
      expect(result.headers).toEqual(['Name', 'Age']);
    });

    it('should read Markdown with list items when no table found', async () => {
      const markdownContent = `# My List

- First item
- Second item
- Third item

1. Ordered item 1
2. Ordered item 2
`;
      mockFs.promises.readFile.mockResolvedValue(markdownContent);

      const result = await handler.read('/path/to/file.md');

      expect(result.rows).toEqual([
        { index: 0, item: 'First item', type: 'list-item' },
        { index: 1, item: 'Second item', type: 'list-item' },
        { index: 2, item: 'Third item', type: 'list-item' },
        { index: 3, item: 'Ordered item 1', type: 'list-item' },
        { index: 4, item: 'Ordered item 2', type: 'list-item' }
      ]);
      expect(result.headers).toEqual(['index', 'item', 'type']);
    });

    it('should read Markdown with headings when no table or list found', async () => {
      const markdownContent = `# Main Title

## Section 1

### Subsection 1.1

## Section 2
`;
      mockFs.promises.readFile.mockResolvedValue(markdownContent);

      const result = await handler.read('/path/to/file.md');

      expect(result.rows).toEqual([
        { level: 1, text: 'Main Title', type: 'heading' },
        { level: 2, text: 'Section 1', type: 'heading' },
        { level: 3, text: 'Subsection 1.1', type: 'heading' },
        { level: 2, text: 'Section 2', type: 'heading' }
      ]);
      expect(result.headers).toEqual(['level', 'text', 'type']);
    });

    it('should read plain Markdown text as paragraphs', async () => {
      const markdownContent = `This is the first paragraph.

This is the second paragraph with more content.

This is the third paragraph.
`;
      mockFs.promises.readFile.mockResolvedValue(markdownContent);

      const result = await handler.read('/path/to/file.md');

      expect(result.rows).toEqual([
        { index: 0, content: 'This is the first paragraph.', type: 'paragraph' },
        { index: 1, content: 'This is the second paragraph with more content.', type: 'paragraph' },
        { index: 2, content: 'This is the third paragraph.', type: 'paragraph' }
      ]);
      expect(result.headers).toEqual(['index', 'content', 'type']);
    });

    it('should handle empty Markdown file', async () => {
      mockFs.promises.readFile.mockResolvedValue('');

      const result = await handler.read('/path/to/file.md');

      expect(result.rows).toEqual([]);
    });

    it('should handle Markdown with BOM', async () => {
      const markdownContent = '\uFEFF| Name | Age |\n|------|-----|\n| John | 30  |';
      mockFs.promises.readFile.mockResolvedValue(markdownContent);

      const result = await handler.read('/path/to/file.md');

      expect(result.rows).toEqual([{ Name: 'John', Age: 30 }]);
    });

    it('should handle file read errors', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.promises.readFile.mockRejectedValue(error);

      await expect(handler.read('/path/to/nonexistent.md'))
        .rejects.toThrow(ConversionError);
    });

    it('should use custom encoding', async () => {
      mockFs.promises.readFile.mockResolvedValue('| Name | Age |\n|------|-----|\n| John | 30  |');

      await handler.read('/path/to/file.md', { encoding: 'latin1' });

      expect(mockFs.promises.readFile).toHaveBeenCalledWith(
        '/path/to/file.md',
        { encoding: 'latin1' }
      );
    });
  });

  describe('write', () => {
    const sampleData: DataStructure = {
      rows: [
        { name: 'John', age: 30, email: 'john@example.com' },
        { name: 'Jane', age: 25, email: 'jane@example.com' }
      ],
      headers: ['name', 'age', 'email'],
      metadata: {
        originalFormat: 'md',
        encoding: 'utf-8',
        totalRows: 2,
        totalColumns: 3
      }
    };

    it('should write Markdown table (default)', async () => {
      await handler.write(sampleData, '/path/to/output.md');

      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      
      expect(writtenContent).toContain('| name | age | email |');
      expect(writtenContent).toContain('| --- | --- | --- |');
      expect(writtenContent).toContain('| John | 30 | john@example.com |');
      expect(writtenContent).toContain('| Jane | 25 | jane@example.com |');
    });

    it('should write Markdown table with title', async () => {
      await handler.write(sampleData, '/path/to/output.md', {
        formatting: { title: 'User Data' }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('# User Data');
    });

    it('should write Markdown table with center alignment', async () => {
      await handler.write(sampleData, '/path/to/output.md', {
        formatting: { alignment: 'center' }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('| :---: | :---: | :---: |');
    });

    it('should write Markdown table with right alignment', async () => {
      await handler.write(sampleData, '/path/to/output.md', {
        formatting: { alignment: 'right' }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('| ---: | ---: | ---: |');
    });

    it('should write Markdown unordered list', async () => {
      await handler.write(sampleData, '/path/to/output.md', {
        formatting: { outputFormat: 'list' }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('- **name**: John, **age**: 30, **email**: john@example.com');
      expect(writtenContent).toContain('- **name**: Jane, **age**: 25, **email**: jane@example.com');
    });

    it('should write Markdown ordered list', async () => {
      await handler.write(sampleData, '/path/to/output.md', {
        formatting: { outputFormat: 'list', listType: 'ordered' }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('1. **name**: John, **age**: 30, **email**: john@example.com');
      expect(writtenContent).toContain('2. **name**: Jane, **age**: 25, **email**: jane@example.com');
    });

    it('should write simple list for single column data', async () => {
      const singleColumnData: DataStructure = {
        rows: [
          { item: 'First item' },
          { item: 'Second item' },
          { item: 'Third item' }
        ],
        headers: ['item'],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 3,
          totalColumns: 1
        }
      };

      await handler.write(singleColumnData, '/path/to/output.md', {
        formatting: { outputFormat: 'list' }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('- First item');
      expect(writtenContent).toContain('- Second item');
      expect(writtenContent).toContain('- Third item');
    });

    it('should write Markdown headings', async () => {
      const headingData: DataStructure = {
        rows: [
          { level: 1, text: 'Main Title' },
          { level: 2, text: 'Section 1' },
          { level: 3, text: 'Subsection 1.1' }
        ],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 3,
          totalColumns: 2
        }
      };

      await handler.write(headingData, '/path/to/output.md', {
        formatting: { outputFormat: 'headings' }
      });

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('# Main Title');
      expect(writtenContent).toContain('## Section 1');
      expect(writtenContent).toContain('### Subsection 1.1');
    });

    it('should handle different data types', async () => {
      const dataWithTypes: DataStructure = {
        rows: [
          { 
            text: 'Hello',
            number: 42,
            boolean: true,
            date: new Date('2023-01-01'),
            array: [1, 2, 3],
            object: { nested: 'value' },
            nullValue: null,
            withNewlines: 'Line 1\nLine 2'
          }
        ],
        headers: ['text', 'number', 'boolean', 'date', 'array', 'object', 'nullValue', 'withNewlines'],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 8
        }
      };

      await handler.write(dataWithTypes, '/path/to/output.md');

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('| Hello | 42 | true | 2023-01-01 | 1, 2, 3 | {"nested":"value"} |  | Line 1 Line 2 |');
    });

    it('should escape Markdown special characters', async () => {
      const dataWithSpecialChars: DataStructure = {
        rows: [
          { text: 'Text with | pipe and \\ backslash' }
        ],
        headers: ['text'],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 1
        }
      };

      await handler.write(dataWithSpecialChars, '/path/to/output.md');

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('Text with \\| pipe and \\\\ backslash');
    });

    it('should handle empty data', async () => {
      const emptyData: DataStructure = {
        rows: [],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 0
        }
      };

      await handler.write(emptyData, '/path/to/output.md');

      const writtenContent = (mockFs.promises.writeFile as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('<!-- Empty table -->');
    });

    it('should use custom encoding', async () => {
      await handler.write(sampleData, '/path/to/output.md', { encoding: 'latin1' });

      expect(mockFs.promises.writeFile).toHaveBeenCalledWith(
        '/path/to/output.md',
        expect.any(String),
        { encoding: 'latin1' }
      );
    });

    it('should respect overwrite setting', async () => {
      mockFs.promises.access.mockResolvedValue(undefined); // File exists

      await expect(handler.write(sampleData, '/path/to/output.md', { overwrite: false }))
        .rejects.toThrow(ConversionError);
    });

    it('should handle write errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      mockFs.promises.writeFile.mockRejectedValue(error);

      await expect(handler.write(sampleData, '/path/to/output.md'))
        .rejects.toThrow(ConversionError);
    });

    it('should validate data before writing', async () => {
      const invalidData = {
        rows: 'not an array',
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 0
        }
      } as any;

      await expect(handler.write(invalidData, '/path/to/output.md'))
        .rejects.toThrow(ConversionError);
    });
  });

  describe('validation', () => {
    it('should validate correct Markdown data structure', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 }
        ],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 2,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about empty Markdown data', () => {
      const data: DataStructure = {
        rows: [],
        headers: ['name', 'age'],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EMPTY_MARKDOWN_DATA',
          message: 'Markdown data contains no rows'
        })
      );
    });

    it('should warn about complex data', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', metadata: { role: 'admin', permissions: ['read', 'write'] } }
        ],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'COMPLEX_MARKDOWN_DATA',
          message: expect.stringContaining('complex objects')
        })
      );
    });

    it('should warn about long text', () => {
      const longText = 'a'.repeat(150);
      const data: DataStructure = {
        rows: [
          { name: 'John', description: longText }
        ],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'LONG_TEXT_IN_MARKDOWN',
          message: expect.stringContaining('long text')
        })
      );
    });

    it('should warn about newlines in data', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John', description: 'Line 1\nLine 2\rLine 3' }
        ],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'NEWLINES_IN_MARKDOWN',
          message: expect.stringContaining('newlines')
        })
      );
    });

    it('should warn about Markdown special characters', () => {
      const data: DataStructure = {
        rows: [
          { name: 'John|Doe', description: 'Text with *bold* and `code`' }
        ],
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'MARKDOWN_SPECIAL_CHARACTERS',
          message: expect.stringContaining('special characters')
        })
      );
    });

    it('should warn about wide tables', () => {
      const wideRow: Record<string, any> = {};
      for (let i = 0; i < 15; i++) {
        wideRow[`col${i}`] = `value${i}`;
      }

      const data: DataStructure = {
        rows: [wideRow],
        headers: Object.keys(wideRow),
        metadata: {
          originalFormat: 'md',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 15
        }
      };

      const result = handler.validate(data);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'WIDE_MARKDOWN_TABLE',
          message: expect.stringContaining('many columns')
        })
      );
    });
  });

  describe('utility methods', () => {
    it('should return Markdown formatting options', () => {
      const options = handler.getMarkdownFormattingOptions();
      
      expect(options.outputFormats).toContain('table');
      expect(options.outputFormats).toContain('list');
      expect(options.outputFormats).toContain('headings');
      
      expect(options.alignments).toContain('left');
      expect(options.alignments).toContain('center');
      expect(options.alignments).toContain('right');
      
      expect(options.listTypes).toContain('unordered');
      expect(options.listTypes).toContain('ordered');
      
      expect(options.features).toContain('GitHub Flavored Markdown tables');
    });

    it('should analyze Markdown structure', () => {
      const content = `# Title

| Name | Age |
|------|-----|
| John | 30  |

- List item 1
- List item 2
`;

      const analysis = handler.analyzeMarkdownStructure(content);
      
      expect(analysis.hasTable).toBe(true);
      expect(analysis.tableCount).toBe(1);
      expect(analysis.hasHeadings).toBe(true);
      expect(analysis.headingCount).toBe(1);
      expect(analysis.hasLists).toBe(true);
      expect(analysis.listItemCount).toBe(2);
      expect(analysis.contentType).toBe('table');
    });

    it('should extract frontmatter', () => {
      const content = `---
title: My Document
author: John Doe
date: 2023-01-01
---

# Content

This is the main content.
`;

      const result = handler.extractFrontmatter(content);
      
      expect(result.metadata).toEqual({
        title: 'My Document',
        author: 'John Doe',
        date: '2023-01-01'
      });
      expect(result.content).toContain('# Content');
      expect(result.content).not.toContain('---');
    });

    it('should handle content without frontmatter', () => {
      const content = `# Title

Regular content without frontmatter.
`;

      const result = handler.extractFrontmatter(content);
      
      expect(result.metadata).toEqual({});
      expect(result.content).toBe(content);
    });
  });
});