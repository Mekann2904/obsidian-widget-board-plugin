import { obfuscate, deobfuscate } from '../../src/utils/safeFetch';

test('obfuscate adds prefix and deobfuscate restores original', () => {
  const src = 'secret-key-123';
  const obf = obfuscate(src);
  expect(obf.startsWith('b64:')).toBe(true);
  expect(deobfuscate(obf)).toBe(src);
});

test('deobfuscate returns plaintext when value not encoded', () => {
  const src = 'plain-text';
  expect(deobfuscate(src)).toBe(src);
});
