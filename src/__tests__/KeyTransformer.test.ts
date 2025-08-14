import { KeyTransformer } from '../transformers/KeyTransformer.js';
import { DataStructure } from '../types/index.js';

describe('KeyTransformer', () => {
  let transformer: KeyTransformer;

  beforeEach(() => {
    transformer = new KeyTransformer();
  });

  describe('transformKey', () => {
    describe('camelCase transformation', () => {
      it('should convert snake_case to camelCase', () => {
        expect(transformer.transformKey('user_name', 'camelCase')).toBe('userName');
        expect(transformer.transformKey('first_name_last', 'camelCase')).toBe('firstNameLast');
        expect(transformer.transformKey('api_key_value', 'camelCase')).toBe('apiKeyValue');
      });

      it('should convert kebab-case to camelCase', () => {
        expect(transformer.transformKey('user-name', 'camelCase')).toBe('userName');
        expect(transformer.transformKey('api-key-value', 'camelCase')).toBe('apiKeyValue');
      });

      it('should convert space-separated to camelCase', () => {
        expect(transformer.transformKey('user name', 'camelCase')).toBe('userName');
        expect(transformer.transformKey('first name last', 'camelCase')).toBe('firstNameLast');
      });

      it('should handle already camelCase strings', () => {
        expect(transformer.transformKey('userName', 'camelCase')).toBe('userName');
        expect(transformer.transformKey('apiKeyValue', 'camelCase')).toBe('apiKeyValue');
      });

      it('should handle mixed case strings', () => {
        expect(transformer.transformKey('User_Name', 'camelCase')).toBe('userName');
        expect(transformer.transformKey('API-Key', 'camelCase')).toBe('apiKey');
      });
    });

    describe('snake_case transformation', () => {
      it('should convert camelCase to snake_case', () => {
        expect(transformer.transformKey('userName', 'snake_case')).toBe('user_name');
        expect(transformer.transformKey('apiKeyValue', 'snake_case')).toBe('api_key_value');
        expect(transformer.transformKey('firstName', 'snake_case')).toBe('first_name');
      });

      it('should convert kebab-case to snake_case', () => {
        expect(transformer.transformKey('user-name', 'snake_case')).toBe('user_name');
        expect(transformer.transformKey('api-key-value', 'snake_case')).toBe('api_key_value');
      });

      it('should convert space-separated to snake_case', () => {
        expect(transformer.transformKey('user name', 'snake_case')).toBe('user_name');
        expect(transformer.transformKey('first name last', 'snake_case')).toBe('first_name_last');
      });

      it('should handle already snake_case strings', () => {
        expect(transformer.transformKey('user_name', 'snake_case')).toBe('user_name');
        expect(transformer.transformKey('api_key_value', 'snake_case')).toBe('api_key_value');
      });

      it('should handle uppercase strings', () => {
        expect(transformer.transformKey('USER_NAME', 'snake_case')).toBe('user_name');
        expect(transformer.transformKey('API_KEY', 'snake_case')).toBe('api_key');
      });
    });

    describe('lowercase transformation', () => {
      it('should convert various formats to lowercase', () => {
        expect(transformer.transformKey('userName', 'lowercase')).toBe('user_name');
        expect(transformer.transformKey('USER_NAME', 'lowercase')).toBe('user_name');
        expect(transformer.transformKey('User Name', 'lowercase')).toBe('user_name');
        expect(transformer.transformKey('user-name', 'lowercase')).toBe('user_name');
      });
    });

    describe('uppercase transformation', () => {
      it('should convert various formats to uppercase', () => {
        expect(transformer.transformKey('userName', 'uppercase')).toBe('USER_NAME');
        expect(transformer.transformKey('user_name', 'uppercase')).toBe('USER_NAME');
        expect(transformer.transformKey('User Name', 'uppercase')).toBe('USER_NAME');
        expect(transformer.transformKey('user-name', 'uppercase')).toBe('USER_NAME');
      });
    });

    describe('edge cases', () => {
      it('should handle empty strings', () => {
        expect(transformer.transformKey('', 'camelCase')).toBe('');
        expect(transformer.transformKey('', 'snake_case')).toBe('');
      });

      it('should handle single characters', () => {
        expect(transformer.transformKey('a', 'camelCase')).toBe('a');
        expect(transformer.transformKey('A', 'snake_case')).toBe('a');
      });

      it('should handle numbers', () => {
        expect(transformer.transformKey('user1Name', 'snake_case')).toBe('user1_name');
        expect(transformer.transformKey('user_1_name', 'camelCase')).toBe('user1Name');
      });

      it('should handle non-string inputs', () => {
        expect(transformer.transformKey(null as any, 'camelCase')).toBe(null);
        expect(transformer.transformKey(undefined as any, 'snake_case')).toBe(undefined);
      });
    });
  });

  describe('transformKeys', () => {
    const sampleData: DataStructure = {
      rows: [
        { user_name: 'John', first_name: 'John', last_name: 'Doe', age_years: 30 },
        { user_name: 'Jane', first_name: 'Jane', last_name: 'Smith', age_years: 25 }
      ],
      headers: ['user_name', 'first_name', 'last_name', 'age_years'],
      metadata: {
        originalFormat: 'csv',
        encoding: 'utf-8',
        totalRows: 2,
        totalColumns: 4
      }
    };

    it('should transform all keys to camelCase', () => {
      const result = transformer.transformKeys(sampleData, 'camelCase');

      expect(result.headers).toEqual(['userName', 'firstName', 'lastName', 'ageYears']);
      expect(result.rows[0]).toEqual({
        userName: 'John',
        firstName: 'John',
        lastName: 'Doe',
        ageYears: 30
      });
      expect(result.metadata.totalColumns).toBe(4);
    });

    it('should transform all keys to snake_case', () => {
      const camelCaseData: DataStructure = {
        rows: [
          { userName: 'John', firstName: 'John', lastName: 'Doe', ageYears: 30 }
        ],
        headers: ['userName', 'firstName', 'lastName', 'ageYears'],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 4
        }
      };

      const result = transformer.transformKeys(camelCaseData, 'snake_case');

      expect(result.headers).toEqual(['user_name', 'first_name', 'last_name', 'age_years']);
      expect(result.rows[0]).toEqual({
        user_name: 'John',
        first_name: 'John',
        last_name: 'Doe',
        age_years: 30
      });
    });

    it('should handle nested objects', () => {
      const nestedData: DataStructure = {
        rows: [
          {
            user_info: {
              first_name: 'John',
              contact_details: {
                email_address: 'john@example.com'
              }
            }
          }
        ],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 1
        }
      };

      const result = transformer.transformKeys(nestedData, 'camelCase');

      expect(result.rows[0]).toEqual({
        userInfo: {
          firstName: 'John',
          contactDetails: {
            emailAddress: 'john@example.com'
          }
        }
      });
    });

    it('should handle arrays with nested objects', () => {
      const arrayData: DataStructure = {
        rows: [
          {
            user_list: [
              { first_name: 'John', last_name: 'Doe' },
              { first_name: 'Jane', last_name: 'Smith' }
            ]
          }
        ],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 1
        }
      };

      const result = transformer.transformKeys(arrayData, 'camelCase');

      expect(result.rows[0]).toEqual({
        userList: [
          { firstName: 'John', lastName: 'Doe' },
          { firstName: 'Jane', lastName: 'Smith' }
        ]
      });
    });

    it('should handle data without headers', () => {
      const noHeadersData: DataStructure = {
        rows: [
          { user_name: 'John', age_years: 30 }
        ],
        metadata: {
          originalFormat: 'json',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = transformer.transformKeys(noHeadersData, 'camelCase');

      expect(result.headers).toBeUndefined();
      expect(result.rows[0]).toEqual({
        userName: 'John',
        ageYears: 30
      });
    });

    it('should handle empty data', () => {
      const emptyData: DataStructure = {
        rows: [],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 0,
          totalColumns: 0
        }
      };

      const result = transformer.transformKeys(emptyData, 'camelCase');

      expect(result.rows).toEqual([]);
      expect(result.metadata.totalColumns).toBe(0);
    });
  });

  describe('getTransformationPreview', () => {
    it('should provide preview of key transformations', () => {
      const keys = ['user_name', 'first_name', 'api_key', 'userName'];
      const preview = transformer.getTransformationPreview(keys, 'camelCase');

      expect(preview).toEqual([
        { original: 'user_name', transformed: 'userName', changed: true },
        { original: 'first_name', transformed: 'firstName', changed: true },
        { original: 'api_key', transformed: 'apiKey', changed: true },
        { original: 'userName', transformed: 'userName', changed: false }
      ]);
    });

    it('should show no changes when keys are already in target format', () => {
      const keys = ['userName', 'firstName', 'apiKey'];
      const preview = transformer.getTransformationPreview(keys, 'camelCase');

      expect(preview.every(p => !p.changed)).toBe(true);
    });
  });

  describe('detectKeyStyle', () => {
    it('should detect camelCase style', () => {
      const keys = ['userName', 'firstName', 'apiKey', 'emailAddress'];
      const result = transformer.detectKeyStyle(keys);

      expect(result.detectedStyle).toBe('camelCase');
      expect(result.confidence).toBe(1);
      expect(result.analysis.camelCase).toBe(4);
    });

    it('should detect snake_case style', () => {
      const keys = ['user_name', 'first_name', 'api_key', 'email_address'];
      const result = transformer.detectKeyStyle(keys);

      expect(result.detectedStyle).toBe('snake_case');
      expect(result.confidence).toBe(1);
      expect(result.analysis.snake_case).toBe(4);
    });

    it('should detect mixed style', () => {
      const keys = ['userName', 'first_name', 'API_KEY', 'email address'];
      const result = transformer.detectKeyStyle(keys);

      expect(result.detectedStyle).toBe('mixed');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should detect lowercase style', () => {
      const keys = ['username', 'firstname', 'apikey'];
      const result = transformer.detectKeyStyle(keys);

      expect(result.detectedStyle).toBe('lowercase');
      expect(result.confidence).toBe(1);
      expect(result.analysis.lowercase).toBe(3);
    });

    it('should detect uppercase style', () => {
      const keys = ['USER_NAME', 'FIRST_NAME', 'API_KEY'];
      const result = transformer.detectKeyStyle(keys);

      expect(result.detectedStyle).toBe('uppercase');
      expect(result.confidence).toBe(1);
      expect(result.analysis.uppercase).toBe(3);
    });

    it('should handle empty key array', () => {
      const result = transformer.detectKeyStyle([]);

      expect(result.detectedStyle).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('validateTransformation', () => {
    it('should validate successful transformation', () => {
      const original = ['user_name', 'first_name', 'last_name'];
      const transformed = ['userName', 'firstName', 'lastName'];
      
      const result = transformer.validateTransformation(original, transformed, 'camelCase');

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect duplicate keys', () => {
      const original = ['user_name', 'userName'];
      const transformed = ['userName', 'userName'];
      
      const result = transformer.validateTransformation(original, transformed, 'camelCase');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'duplicate',
          keys: ['userName']
        })
      );
    });

    it('should detect empty keys', () => {
      const original = ['user_name', ''];
      const transformed = ['userName', ''];
      
      const result = transformer.validateTransformation(original, transformed, 'camelCase');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'empty'
        })
      );
    });

    it('should detect invalid format keys', () => {
      const original = ['user_name', 'first-name'];
      const transformed = ['userName', 'first-name']; // Invalid camelCase
      
      const result = transformer.validateTransformation(original, transformed, 'camelCase');

      expect(result.isValid).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: 'invalid',
          keys: ['first-name']
        })
      );
    });
  });

  describe('getSuggestedTransformations', () => {
    it('should suggest transformations for problematic keys', () => {
      const keys = ['user name', 'first-name', 'api_key!'];
      const suggestions = transformer.getSuggestedTransformations(keys);

      expect(suggestions[0].key).toBe('user name');
      expect(suggestions[0].issues).toContain('Contains spaces');
      expect(suggestions[0].suggestions).toContainEqual(
        expect.objectContaining({
          style: 'camelCase',
          result: 'userName'
        })
      );

      expect(suggestions[1].key).toBe('first-name');
      expect(suggestions[1].issues).toContain('Contains hyphens');

      expect(suggestions[2].key).toBe('api_key!');
      expect(suggestions[2].issues).toContain('Contains special characters');
    });

    it('should identify no issues for clean keys', () => {
      const keys = ['userName', 'firstName'];
      const suggestions = transformer.getSuggestedTransformations(keys);

      expect(suggestions[0].issues).toHaveLength(0);
      expect(suggestions[1].issues).toHaveLength(0);
    });
  });

  describe('createKeyMapping and applyKeyMapping', () => {
    it('should create and apply custom key mapping', () => {
      const keys = ['user_name', 'first_name', 'last_name'];
      const mapping = transformer.createKeyMapping(keys, 'camelCase');

      expect(mapping.get('user_name')).toBe('userName');
      expect(mapping.get('first_name')).toBe('firstName');
      expect(mapping.get('last_name')).toBe('lastName');

      const data: DataStructure = {
        rows: [
          { user_name: 'John', first_name: 'John', last_name: 'Doe' }
        ],
        headers: ['user_name', 'first_name', 'last_name'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 3
        }
      };

      const result = transformer.applyKeyMapping(data, mapping);

      expect(result.headers).toEqual(['userName', 'firstName', 'lastName']);
      expect(result.rows[0]).toEqual({
        userName: 'John',
        firstName: 'John',
        lastName: 'Doe'
      });
    });

    it('should handle keys not in mapping', () => {
      const mapping = new Map([
        ['user_name', 'userName']
      ]);

      const data: DataStructure = {
        rows: [
          { user_name: 'John', age: 30 }
        ],
        headers: ['user_name', 'age'],
        metadata: {
          originalFormat: 'csv',
          encoding: 'utf-8',
          totalRows: 1,
          totalColumns: 2
        }
      };

      const result = transformer.applyKeyMapping(data, mapping);

      expect(result.headers).toEqual(['userName', 'age']);
      expect(result.rows[0]).toEqual({
        userName: 'John',
        age: 30
      });
    });
  });
});