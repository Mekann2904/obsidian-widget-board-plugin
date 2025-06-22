import { obfuscate, deobfuscate } from '../../src/utils/deobfuscate';

describe('obfuscate and deobfuscate functions', () => {
  describe('obfuscate', () => {
    test('should obfuscate a simple string', () => {
      const input = 'hello world';
      const result = obfuscate(input);
      
      // 結果がBase64形式であることを確認
      expect(result).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      // 元の文字列とは異なることを確認
      expect(result).not.toBe(input);
    });

    test('should obfuscate an API key format string', () => {
      const input = 'sk-1234567890abcdef';
      const result = obfuscate(input);
      
      expect(result).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(result).not.toBe(input);
    });

    test('should handle empty string', () => {
      const input = '';
      const result = obfuscate(input);
      
      expect(result).toBe('');
    });

    test('should handle special characters', () => {
      const input = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = obfuscate(input);
      
      expect(result).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(result).not.toBe(input);
    });

    test('should handle Japanese characters', () => {
      const input = 'こんにちは世界';
      const result = obfuscate(input);
      
      expect(result).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
      expect(result).not.toBe(input);
    });
  });

  describe('deobfuscate', () => {
    test('should deobfuscate a previously obfuscated string', () => {
      const input = 'hello world';
      const obfuscated = obfuscate(input);
      const result = deobfuscate(obfuscated);
      
      expect(result).toBe(input);
    });

    test('should deobfuscate an API key format string', () => {
      const input = 'sk-1234567890abcdef';
      const obfuscated = obfuscate(input);
      const result = deobfuscate(obfuscated);
      
      expect(result).toBe(input);
    });

    test('should handle empty string', () => {
      const input = '';
      const obfuscated = obfuscate(input);
      const result = deobfuscate(obfuscated);
      
      expect(result).toBe(input);
    });

    test('should handle special characters', () => {
      const input = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const obfuscated = obfuscate(input);
      const result = deobfuscate(obfuscated);
      
      expect(result).toBe(input);
    });

    test('should handle Japanese characters', () => {
      const input = 'こんにちは世界';
      const obfuscated = obfuscate(input);
      const result = deobfuscate(obfuscated);
      
      expect(result).toBe(input);
    });

    test('should return original string if deobfuscation fails', () => {
      const invalidInput = 'invalid-base64!@#';
      const result = deobfuscate(invalidInput);
      
      expect(result).toBe(invalidInput);
    });

    test('should handle malformed base64 input', () => {
      const invalidInput = 'not-valid-base64';
      const result = deobfuscate(invalidInput);
      
      expect(result).toBe(invalidInput);
    });
  });

  describe('round-trip functionality', () => {
    test('should maintain data integrity through obfuscate -> deobfuscate cycle', () => {
      const testCases = [
        'simple text',
        'sk-1234567890abcdefghijklmnopqrstuvwxyz',
        'AIzaSyD1234567890abcdefghijklmnopqrstuvwxyz',
        '複雑な日本語のテキスト',
        'Mixed English and 日本語 text',
        '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`',
        '   whitespace   text   ',
        'line\nbreaks\rand\ttabs',
        '',
        '1',
        '12345678901234567890123456789012345678901234567890',
      ];

      testCases.forEach(testCase => {
        const obfuscated = obfuscate(testCase);
        const deobfuscated = deobfuscate(obfuscated);
        expect(deobfuscated).toBe(testCase);
      });
    });

    test('should produce different results for different inputs', () => {
      const input1 = 'hello world';
      const input2 = 'hello world!';
      
      const obfuscated1 = obfuscate(input1);
      const obfuscated2 = obfuscate(input2);
      
      expect(obfuscated1).not.toBe(obfuscated2);
    });

    test('should be deterministic - same input produces same output', () => {
      const input = 'test string';
      
      const result1 = obfuscate(input);
      const result2 = obfuscate(input);
      
      expect(result1).toBe(result2);
    });
  });

  describe('security properties', () => {
    test('obfuscated result should not contain original text', () => {
      const input = 'my-secret-api-key';
      const obfuscated = obfuscate(input);
      
      expect(obfuscated.toLowerCase()).not.toContain('secret');
      expect(obfuscated.toLowerCase()).not.toContain('api');
      expect(obfuscated.toLowerCase()).not.toContain('key');
    });

    test('should use XOR obfuscation (not plain base64)', () => {
      const input = 'test';
      const obfuscated = obfuscate(input);
      
      // Plain base64 of 'test' would be 'dGVzdA=='
      const plainBase64 = btoa(input);
      expect(obfuscated).not.toBe(plainBase64);
    });
  });
}); 