import { SupportedFormat } from '../types/index.js';
import { ConversionError } from '../errors/ConversionError.js';
import { Logger } from './Logger.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Format detection result
 */
export interface FormatDetectionResult {
  format: SupportedFormat;
  confidence: number; // 0-1, where 1 is highest confidence
  detectionMethod: 'extension' | 'content' | 'hybrid';
  details?: string;
}

/**
 * Format detection engine
 */
export class FormatDetector {
  private logger: Logger;
  private static readonly SAMPLE_SIZE = 1024; // Bytes to read for content analysis

  constructor() {
    this.logger = Logger.getInstance();
  }

  /**
   * Detect format from file path and optionally content
   */
  async detectFormat(filePath: string, analyzeContent: boolean = true): Promise<FormatDetectionResult> {
    this.logger.debug('Detecting format for file', { filePath, analyzeContent });

    try {
      // First, try extension-based detection
      const extensionResult = this.detectFromExtension(filePath);
      
      if (!analyzeContent) {
        return extensionResult;
      }

      // If content analysis is requested, combine with content detection
      const contentResult = await this.detectFromContent(filePath);
      
      // Combine results using hybrid approach
      const hybridResult = this.combineDetectionResults(extensionResult, contentResult);
      
      this.logger.debug('Format detection completed', { 
        filePath, 
        result: hybridResult 
      });
      
      return hybridResult;

    } catch (error) {
      this.logger.error('Format detection failed', error as Error, { filePath });
      throw ConversionError.conversionFailed(
        `Failed to detect format for file: ${filePath}`,
        { originalError: error }
      );
    }
  }

  /**
   * Detect format based on file extension
   */
  private detectFromExtension(filePath: string): FormatDetectionResult {
    const extension = path.extname(filePath).toLowerCase();
    
    const extensionMap: Record<string, SupportedFormat> = {
      '.csv': 'csv',
      '.xls': 'xlsx',
      '.xlsx': 'xlsx',
      '.json': 'json',
      '.xml': 'xml',
      '.md': 'md',
      '.markdown': 'md'
    };

    const format = extensionMap[extension];
    
    if (!format) {
      throw ConversionError.unsupportedFormat(extension || 'unknown');
    }

    return {
      format,
      confidence: 0.8, // High confidence for known extensions
      detectionMethod: 'extension',
      details: `Detected from file extension: ${extension}`
    };
  }

  /**
   * Detect format based on file content
   */
  private async detectFromContent(filePath: string): Promise<FormatDetectionResult> {
    try {
      // Check if file exists and is readable
      await fs.promises.access(filePath, fs.constants.R_OK);
      
      // Read sample of file content
      const fileHandle = await fs.promises.open(filePath, 'r');
      const buffer = Buffer.alloc(FormatDetector.SAMPLE_SIZE);
      const { bytesRead } = await fileHandle.read(buffer, 0, FormatDetector.SAMPLE_SIZE, 0);
      await fileHandle.close();
      
      const content = buffer.subarray(0, bytesRead).toString('utf8');
      
      // Analyze content patterns
      return this.analyzeContentPatterns(content);
      
    } catch (error) {
      this.logger.warn('Content analysis failed, falling back to extension detection', { 
        filePath, 
        error: (error as Error).message 
      });
      
      // Fallback to extension-based detection with lower confidence
      const extensionResult = this.detectFromExtension(filePath);
      return {
        ...extensionResult,
        confidence: 0.5,
        details: 'Content analysis failed, using extension only'
      };
    }
  }

  /**
   * Analyze content patterns to determine format
   */
  private analyzeContentPatterns(content: string): FormatDetectionResult {
    const trimmedContent = content.trim();
    
    // JSON detection
    if (this.isJsonContent(trimmedContent)) {
      return {
        format: 'json',
        confidence: 0.9,
        detectionMethod: 'content',
        details: 'Detected JSON structure in content'
      };
    }
    
    // XML detection
    if (this.isXmlContent(trimmedContent)) {
      return {
        format: 'xml',
        confidence: 0.9,
        detectionMethod: 'content',
        details: 'Detected XML structure in content'
      };
    }
    
    // Markdown detection
    if (this.isMarkdownContent(trimmedContent)) {
      return {
        format: 'md',
        confidence: 0.7,
        detectionMethod: 'content',
        details: 'Detected Markdown patterns in content'
      };
    }
    
    // CSV detection (should be last as it's most generic)
    if (this.isCsvContent(trimmedContent)) {
      return {
        format: 'csv',
        confidence: 0.6,
        detectionMethod: 'content',
        details: 'Detected CSV-like structure in content'
      };
    }
    
    // If no pattern matches, throw error
    throw ConversionError.unsupportedFormat('unknown content pattern');
  }

  /**
   * Check if content appears to be JSON
   */
  private isJsonContent(content: string): boolean {
    try {
      // Must start with { or [
      if (!content.startsWith('{') && !content.startsWith('[')) {
        return false;
      }
      
      // Try to parse as JSON
      JSON.parse(content);
      return true;
    } catch {
      // If it starts with JSON characters but fails to parse,
      // it might be a partial JSON file
      return (content.startsWith('{') || content.startsWith('[')) && 
             content.includes('"') && 
             (content.includes(':') || content.includes(','));
    }
  }

  /**
   * Check if content appears to be XML
   */
  private isXmlContent(content: string): boolean {
    // XML should start with < and contain XML-like structure
    if (!content.startsWith('<')) {
      return false;
    }
    
    // Check for XML declaration or root element
    const xmlDeclarationPattern = /^<\?xml\s+version/i;
    const xmlElementPattern = /^<[a-zA-Z_][\w\-.:]*(\s+[^>]*)?>.*<\/[a-zA-Z_][\w\-.:]*>/s;
    
    return xmlDeclarationPattern.test(content) || xmlElementPattern.test(content);
  }

  /**
   * Check if content appears to be Markdown
   */
  private isMarkdownContent(content: string): boolean {
    const markdownPatterns = [
      /^#{1,6}\s+.+$/m,           // Headers
      /^\*\s+.+$/m,               // Unordered lists
      /^\d+\.\s+.+$/m,            // Ordered lists
      /\*\*[^*]+\*\*/,            // Bold text
      /\*[^*]+\*/,                // Italic text
      /\[.+\]\(.+\)/,             // Links
      /^\|.+\|$/m,                // Tables
      /^```[\s\S]*?```$/m,        // Code blocks
      /^>\s+.+$/m                 // Blockquotes
    ];
    
    // Count how many markdown patterns are found
    const patternMatches = markdownPatterns.filter(pattern => pattern.test(content)).length;
    
    // If we find 2 or more markdown patterns, it's likely markdown
    return patternMatches >= 2;
  }

  /**
   * Check if content appears to be CSV
   */
  private isCsvContent(content: string): boolean {
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    if (lines.length < 2) {
      return false;
    }
    
    // Check for common CSV patterns
    const firstLine = lines[0];
    const secondLine = lines[1];
    
    // Look for delimiters
    const commonDelimiters = [',', ';', '\t', '|'];
    
    for (const delimiter of commonDelimiters) {
      const firstLineFields = firstLine.split(delimiter);
      const secondLineFields = secondLine.split(delimiter);
      
      // If both lines have the same number of fields (>1), likely CSV
      if (firstLineFields.length > 1 && 
          firstLineFields.length === secondLineFields.length) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Combine extension and content detection results
   */
  private combineDetectionResults(
    extensionResult: FormatDetectionResult,
    contentResult: FormatDetectionResult
  ): FormatDetectionResult {
    // If both methods agree, high confidence
    if (extensionResult.format === contentResult.format) {
      return {
        format: extensionResult.format,
        confidence: Math.min(0.95, (extensionResult.confidence + contentResult.confidence) / 2 + 0.2),
        detectionMethod: 'hybrid',
        details: `Extension and content analysis agree: ${extensionResult.format}`
      };
    }
    
    // If they disagree, prefer content analysis for higher confidence
    if (contentResult.confidence > extensionResult.confidence) {
      return {
        ...contentResult,
        detectionMethod: 'hybrid',
        details: `Content analysis overrides extension: ${contentResult.format} (content: ${contentResult.confidence}, extension: ${extensionResult.confidence})`
      };
    }
    
    // Otherwise, prefer extension
    return {
      ...extensionResult,
      detectionMethod: 'hybrid',
      details: `Extension overrides content: ${extensionResult.format} (extension: ${extensionResult.confidence}, content: ${contentResult.confidence})`
    };
  }

  /**
   * Validate detected format against supported formats
   */
  validateFormat(format: SupportedFormat): boolean {
    const supportedFormats: SupportedFormat[] = ['csv', 'xlsx', 'json', 'xml', 'md'];
    return supportedFormats.includes(format);
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    return ['.csv', '.xls', '.xlsx', '.json', '.xml', '.md', '.markdown'];
  }

  /**
   * Check if file extension is supported
   */
  isSupportedExtension(filePath: string): boolean {
    const extension = path.extname(filePath).toLowerCase();
    return this.getSupportedExtensions().includes(extension);
  }

  /**
   * Get format from extension (without validation)
   */
  getFormatFromExtension(filePath: string): SupportedFormat | null {
    try {
      const result = this.detectFromExtension(filePath);
      return result.format;
    } catch {
      return null;
    }
  }
}