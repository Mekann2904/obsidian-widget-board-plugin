const KEY = 42;

export function deobfuscate(str: string): string {
  try {
    const bytes = Uint8Array.from(atob(str), c => c.charCodeAt(0));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] ^= KEY;
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return str;
  }
} 