jest.mock('../../src/utils/safeFetch', () => ({
  safeFetch: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  debugLog: jest.fn(),
}));

import { GeminiProvider } from '../../src/llm/gemini/geminiApi.ts';

const { safeFetch } = require('../../src/utils/safeFetch');
const { debugLog } = require('../../src/utils/logger');

describe('GeminiProvider error handling', () => {
  const plugin = { settings: { debugLogging: true } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns fallback when fetch fails', async () => {
    (safeFetch as jest.Mock).mockRejectedValue(new Error('net'));
    const text = await GeminiProvider.generateReply('p', { apiKey: 'k', plugin });
    expect(text).toBe('リプライ生成に失敗しました');
    expect(debugLog).toHaveBeenCalled();
  });

  test('returns fallback when response lacks candidate text', async () => {
    (safeFetch as jest.Mock).mockResolvedValue({ json: () => Promise.resolve({}) });
    const text = await GeminiProvider.generateReply('p', { apiKey: 'k', plugin });
    expect(text).toBe('リプライ生成に失敗しました');
    expect(debugLog).toHaveBeenCalled();
  });

  test('returns candidate text when available', async () => {
    (safeFetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    });
    const text = await GeminiProvider.generateReply('p', { apiKey: 'k', plugin });
    expect(text).toBe('ok');
  });
});
