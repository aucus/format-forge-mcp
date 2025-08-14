import { ConversionResponse } from '../types/index.js';

/**
 * Conversion response implementation
 */
export class ConversionResponseImpl implements ConversionResponse {
  public success: boolean;
  public outputPath?: string;
  public message: string;
  public warnings?: string[];

  constructor(
    success: boolean,
    message: string,
    outputPath?: string,
    warnings?: string[]
  ) {
    this.success = success;
    this.message = message;
    this.outputPath = outputPath;
    this.warnings = warnings;
  }

  /**
   * Create a successful response
   */
  static success(outputPath: string, message?: string, warnings?: string[]): ConversionResponseImpl {
    return new ConversionResponseImpl(
      true,
      message || 'Conversion completed successfully',
      outputPath,
      warnings
    );
  }

  /**
   * Create a failure response
   */
  static failure(message: string, warnings?: string[]): ConversionResponseImpl {
    return new ConversionResponseImpl(
      false,
      message,
      undefined,
      warnings
    );
  }

  /**
   * Create a partial success response (with warnings)
   */
  static partialSuccess(outputPath: string, message: string, warnings: string[]): ConversionResponseImpl {
    return new ConversionResponseImpl(
      true,
      message,
      outputPath,
      warnings
    );
  }

  /**
   * Add a warning to the response
   */
  addWarning(warning: string): void {
    if (!this.warnings) {
      this.warnings = [];
    }
    this.warnings.push(warning);
  }

  /**
   * Add multiple warnings to the response
   */
  addWarnings(warnings: string[]): void {
    if (!this.warnings) {
      this.warnings = [];
    }
    this.warnings.push(...warnings);
  }

  /**
   * Check if response has warnings
   */
  hasWarnings(): boolean {
    return !!(this.warnings && this.warnings.length > 0);
  }

  /**
   * Get warning count
   */
  getWarningCount(): number {
    return this.warnings ? this.warnings.length : 0;
  }

  /**
   * Get formatted summary
   */
  getSummary(): string {
    let summary = `Conversion ${this.success ? 'succeeded' : 'failed'}: ${this.message}`;
    
    if (this.outputPath) {
      summary += `\nOutput: ${this.outputPath}`;
    }
    
    if (this.hasWarnings()) {
      summary += `\nWarnings (${this.getWarningCount()}):`;
      this.warnings!.forEach((warning, index) => {
        summary += `\n  ${index + 1}. ${warning}`;
      });
    }
    
    return summary;
  }

  /**
   * Convert to plain object
   */
  toPlainObject(): ConversionResponse {
    return {
      success: this.success,
      message: this.message,
      outputPath: this.outputPath,
      warnings: this.warnings ? [...this.warnings] : undefined
    };
  }

  /**
   * Convert to JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.toPlainObject(), null, 2);
  }
}