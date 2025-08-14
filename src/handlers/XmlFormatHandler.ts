import { BaseFormatHandler } from './BaseFormatHandler.js';
import { DataStructure, ReadOptions, WriteOptions, ValidationResult } from '../types/index.js';
import { ValidationUtils } from '../utils/ValidationUtils.js';
import { ConversionError } from '../errors/ConversionError.js';
import * as xml2js from 'xml2js';

/**
 * XML format handler using xml2js library
 */
export class XmlFormatHandler extends BaseFormatHandler {
  private parser: xml2js.Parser;
  private builder: xml2js.Builder;

  constructor() {
    super(['xml'], ['.xml']);
    
    // Configure XML parser
    this.parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true,
      explicitRoot: false,
      trim: true,
      normalize: true,
      normalizeTags: false,
      attrkey: '@',
      charkey: '#text',
      explicitCharkey: false
    });

    // Configure XML builder
    this.builder = new xml2js.Builder({
      rootName: 'data',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true, indent: '  ' },
      allowSurrogateChars: false,
      cdata: false,
      headless: false
    });
  }

  /**
   * Read XML file and convert to DataStructure
   */
  async read(filePath: string, options?: ReadOptions): Promise<DataStructure> {
    this.logOperation('Reading XML file', filePath, options);

    try {
      const readOptions = this.parseReadOptions(options);
      const content = await this.readFileContent(filePath, readOptions.encoding);

      // Parse XML content
      const xmlData = await this.parseXmlContent(content);

      // Convert XML to tabular format
      const tabularData = this.convertXmlToTabular(xmlData);

      // Create and return data structure
      const dataStructure = this.createDataStructure(
        tabularData.rows,
        'xml',
        readOptions.encoding,
        tabularData.headers
      );

      this.logOperation('XML file read successfully', filePath, {
        rowCount: tabularData.rows.length,
        columnCount: tabularData.headers?.length || 0,
        hasHeaders: !!tabularData.headers,
        xmlStructure: this.analyzeXmlStructure(xmlData)
      });

      return dataStructure;

    } catch (error) {
      this.handleError(error as Error, 'read', filePath);
    }
  }

  /**
   * Write DataStructure to XML file
   */
  async write(data: DataStructure, filePath: string, options?: WriteOptions): Promise<void> {
    this.logOperation('Writing XML file', filePath, options);

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

      // Convert tabular data to XML
      const xmlData = this.convertTabularToXml(data, writeOptions);

      // Generate XML content
      const xmlContent = this.generateXmlContent(xmlData, writeOptions);

      // Write to file
      await this.writeFileContent(filePath, xmlContent, writeOptions.encoding);

      this.logOperation('XML file written successfully', filePath, {
        rowCount: data.rows.length,
        columnCount: data.headers?.length || Object.keys(data.rows[0] || {}).length,
        hasHeaders: !!data.headers,
        rootElement: writeOptions.formatting?.rootElement || 'data'
      });

    } catch (error) {
      this.handleError(error as Error, 'write', filePath);
    }
  }

  /**
   * Validate XML-specific data structure
   */
  protected validateFormatSpecific(data: DataStructure): ValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    // XML-specific validations
    if (data.rows.length === 0) {
      warnings.push(ValidationUtils.createWarning(
        'EMPTY_XML_DATA',
        'XML data contains no rows',
        'rows'
      ));
    }

    // Check for XML-invalid characters in field names
    const xmlNamePattern = /^[a-zA-Z_][\w\-\.]*$/;
    const invalidFieldNames: string[] = [];

    if (data.headers) {
      data.headers.forEach(header => {
        if (!xmlNamePattern.test(header)) {
          invalidFieldNames.push(header);
        }
      });
    } else if (data.rows.length > 0) {
      Object.keys(data.rows[0]).forEach(key => {
        if (!xmlNamePattern.test(key)) {
          invalidFieldNames.push(key);
        }
      });
    }

    if (invalidFieldNames.length > 0) {
      warnings.push(ValidationUtils.createWarning(
        'INVALID_XML_FIELD_NAMES',
        `Field names contain invalid XML characters: ${invalidFieldNames.join(', ')}`,
        'headers'
      ));
    }

    // Check for reserved XML names
    const reservedNames = ['xml', 'xmlns', 'XML', 'XMLNS'];
    const reservedFieldNames = (data.headers || Object.keys(data.rows[0] || {}))
      .filter(name => reservedNames.some(reserved => name.toLowerCase().startsWith(reserved.toLowerCase())));

    if (reservedFieldNames.length > 0) {
      warnings.push(ValidationUtils.createWarning(
        'RESERVED_XML_NAMES',
        `Field names use reserved XML prefixes: ${reservedFieldNames.join(', ')}`,
        'headers'
      ));
    }

    // Check for data that might not translate well to XML
    let hasComplexStructures = false;
    data.rows.forEach((row, rowIndex) => {
      Object.entries(row).forEach(([key, value]) => {
        if (Array.isArray(value) && value.length > 0) {
          hasComplexStructures = true;
        } else if (value && typeof value === 'object' && !(value instanceof Date)) {
          hasComplexStructures = true;
        }
      });
    });

    if (hasComplexStructures) {
      warnings.push(ValidationUtils.createWarning(
        'COMPLEX_XML_STRUCTURES',
        'Data contains arrays or objects that will be flattened in XML',
        'rows'
      ));
    }

    // Check for XML control characters
    let hasControlChars = false;
    const controlCharPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

    data.rows.forEach((row, rowIndex) => {
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'string' && controlCharPattern.test(value)) {
          hasControlChars = true;
        }
      });
    });

    if (hasControlChars) {
      warnings.push(ValidationUtils.createWarning(
        'XML_CONTROL_CHARACTERS',
        'Data contains control characters that may cause XML parsing issues',
        'rows'
      ));
    }

    return ValidationUtils.createValidationResult(errors, warnings);
  }

  /**
   * Parse XML content from string
   */
  private async parseXmlContent(content: string): Promise<any> {
    try {
      // Remove BOM if present
      const cleanContent = content.replace(/^\uFEFF/, '');
      
      if (cleanContent.trim() === '') {
        return {};
      }

      const result = await this.parser.parseStringPromise(cleanContent);
      return result;

    } catch (error) {
      this.logger.error('Failed to parse XML content', error as Error);
      
      // Provide more helpful error messages
      let errorMessage = (error as Error).message;
      
      // Extract line number if available
      const lineMatch = errorMessage.match(/Line: (\d+)/);
      if (lineMatch) {
        const lineNumber = lineMatch[1];
        errorMessage = `XML parsing error at line ${lineNumber}: ${errorMessage}`;
      }

      throw ConversionError.conversionFailed(
        `XML parsing failed: ${errorMessage}`,
        { originalError: error, content: content.substring(0, 200) + '...' }
      );
    }
  }

  /**
   * Convert XML data to tabular format
   */
  private convertXmlToTabular(xmlData: any): {
    rows: Record<string, any>[];
    headers?: string[];
  } {
    if (!xmlData || typeof xmlData !== 'object') {
      return { rows: [] };
    }

    // Find the main data array or object
    const dataArray = this.findDataArray(xmlData);
    
    if (Array.isArray(dataArray)) {
      return this.convertXmlArrayToTabular(dataArray);
    } else if (dataArray && typeof dataArray === 'object') {
      return this.convertXmlObjectToTabular(dataArray);
    } else {
      // Single value or no data
      return {
        rows: dataArray !== undefined ? [{ value: dataArray }] : [],
        headers: dataArray !== undefined ? ['value'] : undefined
      };
    }
  }

  /**
   * Find the main data array in XML structure
   */
  private findDataArray(xmlData: any): any {
    // If it's already an array, return it
    if (Array.isArray(xmlData)) {
      return xmlData;
    }

    // If it's an object, look for array properties
    if (xmlData && typeof xmlData === 'object') {
      const keys = Object.keys(xmlData);
      
      // Look for common data container names
      const dataKeys = ['data', 'items', 'records', 'rows', 'entries'];
      for (const dataKey of dataKeys) {
        if (xmlData[dataKey]) {
          return xmlData[dataKey];
        }
      }
      
      // Look for the first array property
      for (const key of keys) {
        if (Array.isArray(xmlData[key])) {
          return xmlData[key];
        }
      }
      
      // If no arrays found, return the object itself
      return xmlData;
    }

    return xmlData;
  }

  /**
   * Convert XML array to tabular format
   */
  private convertXmlArrayToTabular(xmlArray: any[]): {
    rows: Record<string, any>[];
    headers?: string[];
  } {
    if (xmlArray.length === 0) {
      return { rows: [] };
    }

    // Collect all unique keys from all objects
    const allKeys = new Set<string>();
    xmlArray.forEach(item => {
      if (item && typeof item === 'object') {
        Object.keys(item).forEach(key => allKeys.add(key));
      }
    });

    const headers = Array.from(allKeys).sort();
    
    const rows = xmlArray.map(item => {
      if (item && typeof item === 'object') {
        const row: Record<string, any> = {};
        headers.forEach(header => {
          row[header] = this.processXmlValue(item[header]);
        });
        return row;
      } else {
        // Primitive value
        return { value: this.processXmlValue(item) };
      }
    });

    return {
      rows,
      headers: headers.length > 0 ? headers : ['value']
    };
  }

  /**
   * Convert XML object to tabular format
   */
  private convertXmlObjectToTabular(xmlObject: Record<string, any>): {
    rows: Record<string, any>[];
    headers?: string[];
  } {
    // Convert object to key-value pairs
    const rows = Object.entries(xmlObject).map(([key, value]) => ({
      key,
      value: this.processXmlValue(value),
      type: this.getXmlValueType(value)
    }));

    return {
      rows,
      headers: ['key', 'value', 'type']
    };
  }

  /**
   * Process XML value for tabular representation
   */
  private processXmlValue(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle xml2js specific structures
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Check if it's a text node with attributes
      if (value['#text'] !== undefined) {
        const textValue = value['#text'];
        const attributes = Object.keys(value).filter(key => key !== '#text' && key.startsWith('@'));
        
        if (attributes.length > 0) {
          // Combine text and attributes
          const result: any = { text: textValue };
          attributes.forEach(attr => {
            result[attr.substring(1)] = value[attr]; // Remove @ prefix
          });
          return result;
        } else {
          return textValue;
        }
      }
      
      // Handle attributes-only objects
      const attrKeys = Object.keys(value).filter(key => key.startsWith('@'));
      if (attrKeys.length === Object.keys(value).length) {
        const result: any = {};
        attrKeys.forEach(attr => {
          result[attr.substring(1)] = value[attr]; // Remove @ prefix
        });
        return result;
      }
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => this.processXmlValue(item));
    }

    // Handle objects
    if (typeof value === 'object') {
      const result: any = {};
      Object.entries(value).forEach(([key, val]) => {
        const cleanKey = key.startsWith('@') ? key.substring(1) : key;
        result[cleanKey] = this.processXmlValue(val);
      });
      return result;
    }

    return value;
  }

  /**
   * Get XML value type for analysis
   */
  private getXmlValueType(value: any): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    
    if (Array.isArray(value)) {
      return 'array';
    }
    
    if (typeof value === 'object') {
      if (value['#text'] !== undefined) {
        return 'text-with-attributes';
      }
      return 'object';
    }
    
    return typeof value;
  }

  /**
   * Convert tabular data to XML structure
   */
  private convertTabularToXml(data: DataStructure, options: Required<WriteOptions>): any {
    const rootElement = options.formatting?.rootElement || 'data';
    const itemElement = options.formatting?.itemElement || 'item';
    
    const xmlData: any = {};
    xmlData[rootElement] = {};
    
    if (data.rows.length === 0) {
      return xmlData;
    }

    // Convert rows to XML items
    const items = data.rows.map(row => {
      const item: any = {};
      
      Object.entries(row).forEach(([key, value]) => {
        const cleanKey = this.sanitizeXmlName(key);
        item[cleanKey] = this.formatValueForXml(value);
      });
      
      return item;
    });

    // If there's only one row, don't create an array
    if (items.length === 1) {
      xmlData[rootElement] = items[0];
    } else {
      xmlData[rootElement][itemElement] = items;
    }

    return xmlData;
  }

  /**
   * Sanitize field name for XML
   */
  private sanitizeXmlName(name: string): string {
    // Replace invalid characters with underscores
    let sanitized = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    
    // Ensure it starts with a letter or underscore
    if (!/^[a-zA-Z_]/.test(sanitized)) {
      sanitized = '_' + sanitized;
    }
    
    // Avoid reserved names
    const reservedNames = ['xml', 'xmlns'];
    if (reservedNames.some(reserved => sanitized.toLowerCase().startsWith(reserved))) {
      sanitized = 'field_' + sanitized;
    }
    
    return sanitized;
  }

  /**
   * Format value for XML output
   */
  private formatValueForXml(value: any): any {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      // Convert array to object with indexed keys
      const arrayObj: any = {};
      value.forEach((item, index) => {
        arrayObj[`item_${index}`] = this.formatValueForXml(item);
      });
      return arrayObj;
    }

    if (typeof value === 'object') {
      const formatted: any = {};
      Object.entries(value).forEach(([key, val]) => {
        const cleanKey = this.sanitizeXmlName(key);
        formatted[cleanKey] = this.formatValueForXml(val);
      });
      return formatted;
    }

    return String(value);
  }

  /**
   * Generate XML content string
   */
  private generateXmlContent(xmlData: any, options: Required<WriteOptions>): string {
    try {
      // Configure builder options
      const builderOptions: any = {
        rootName: options.formatting?.rootElement || 'data',
        xmldec: { 
          version: '1.0', 
          encoding: options.encoding?.toUpperCase() || 'UTF-8' 
        },
        renderOpts: { 
          pretty: options.formatting?.pretty !== false, 
          indent: options.formatting?.indent || '  ' 
        },
        allowSurrogateChars: false,
        cdata: options.formatting?.useCDATA || false,
        headless: options.formatting?.omitXmlDeclaration || false
      };

      const builder = new xml2js.Builder(builderOptions);
      return builder.buildObject(xmlData);

    } catch (error) {
      this.logger.error('Failed to generate XML content', error as Error);
      throw ConversionError.conversionFailed(
        `XML generation failed: ${(error as Error).message}`,
        { originalError: error }
      );
    }
  }

  /**
   * Analyze XML structure for logging
   */
  private analyzeXmlStructure(xmlData: any): string {
    if (Array.isArray(xmlData)) {
      return `array with ${xmlData.length} items`;
    }
    
    if (xmlData && typeof xmlData === 'object') {
      const keys = Object.keys(xmlData);
      const arrayKeys = keys.filter(key => Array.isArray(xmlData[key]));
      const objectKeys = keys.filter(key => xmlData[key] && typeof xmlData[key] === 'object' && !Array.isArray(xmlData[key]));
      
      return `object with ${keys.length} properties (${arrayKeys.length} arrays, ${objectKeys.length} objects)`;
    }
    
    return 'primitive value';
  }

  /**
   * Get XML-specific formatting options
   */
  getXmlFormattingOptions(): {
    rootElements: string[];
    itemElements: string[];
    features: string[];
  } {
    return {
      rootElements: ['data', 'root', 'records', 'items'],
      itemElements: ['item', 'record', 'row', 'entry'],
      features: [
        'XML declaration with encoding',
        'Pretty printing with configurable indentation',
        'Attribute handling (@attr syntax)',
        'Text content with attributes (#text)',
        'CDATA section support',
        'Custom root and item element names',
        'XML name sanitization',
        'Reserved name avoidance',
        'Control character detection',
        'Nested object flattening'
      ]
    };
  }

  /**
   * Validate XML string without full parsing
   */
  validateXmlString(xmlString: string): {
    isValid: boolean;
    error?: string;
    line?: number;
  } {
    try {
      // Quick validation using a simple parser
      const parser = new xml2js.Parser({ async: false });
      parser.parseString(xmlString, (err, result) => {
        if (err) throw err;
      });
      return { isValid: true };
    } catch (error) {
      const xmlError = error as Error;
      let errorMessage = xmlError.message;
      let line: number | undefined;

      // Extract line number if available
      const lineMatch = errorMessage.match(/Line: (\d+)/);
      if (lineMatch) {
        line = parseInt(lineMatch[1], 10);
      }

      return {
        isValid: false,
        error: errorMessage,
        line
      };
    }
  }

  /**
   * Extract XML schema information
   */
  analyzeXmlSchema(xmlData: any): {
    rootElement: string;
    elements: Record<string, {
      type: string;
      attributes: string[];
      children: string[];
      isArray: boolean;
    }>;
  } {
    const elements: Record<string, any> = {};
    
    const analyzeElement = (data: any, elementName: string) => {
      if (!elements[elementName]) {
        elements[elementName] = {
          type: 'element',
          attributes: new Set<string>(),
          children: new Set<string>(),
          isArray: false
        };
      }

      if (Array.isArray(data)) {
        elements[elementName].isArray = true;
        data.forEach(item => analyzeElement(item, elementName));
      } else if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, value]) => {
          if (key.startsWith('@')) {
            elements[elementName].attributes.add(key.substring(1));
          } else if (key === '#text') {
            elements[elementName].type = 'text-element';
          } else {
            elements[elementName].children.add(key);
            analyzeElement(value, key);
          }
        });
      } else {
        elements[elementName].type = 'text-element';
      }
    };

    const rootElement = Object.keys(xmlData)[0] || 'root';
    analyzeElement(xmlData[rootElement], rootElement);

    // Convert Sets to Arrays
    Object.values(elements).forEach((element: any) => {
      element.attributes = Array.from(element.attributes);
      element.children = Array.from(element.children);
    });

    return {
      rootElement,
      elements
    };
  }
}