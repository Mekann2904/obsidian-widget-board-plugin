const KEY = 42;

// ユーティリティ関数: 文字列をUTF-8バイトに変換
function stringToBytes(str: string): Uint8Array {
  // ブラウザ環境では TextEncoder を使用
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  // Node.js環境では Buffer を使用
  const buffer = Buffer.from(str, 'utf8');
  return new Uint8Array(buffer);
}

export function obfuscate(str: string): string {
  try {
    const bytes = stringToBytes(str);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] ^= KEY;
    }
    // Convert bytes to string more safely
    let binaryString = '';
    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }
    return btoa(binaryString);
  } catch {
    return str;
  }
}

// ユーティリティ関数: UTF-8バイトを文字列に変換
function bytesToString(bytes: Uint8Array): string {
  // ブラウザ環境では TextDecoder を使用
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  // Node.js環境では Buffer を使用
  return Buffer.from(bytes).toString('utf8');
}

export function deobfuscate(str: string): string {
  try {
    const bytes = Uint8Array.from(atob(str), c => c.charCodeAt(0));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] ^= KEY;
    }
    return bytesToString(bytes);
  } catch {
    return str;
  }
} 