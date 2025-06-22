import { GeminiProvider } from '../../src/llm/gemini/geminiApi';
import * as safeFetchModule from '../../src/utils/safeFetch';
import * as loggerModule from '../../src/utils/logger';

describe('GeminiProvider error handling', () => {
  let safeFetchSpy: jest.SpyInstance;
  let debugLogSpy: jest.SpyInstance;

  const mockContext = {
    apiKey: 'test-api-key',
    plugin: { settings: {} },
  } as any;

  beforeEach(() => {
    safeFetchSpy = jest.spyOn(safeFetchModule, 'safeFetch');
    debugLogSpy = jest.spyOn(loggerModule, 'debugLog').mockImplementation(() => {});
  });

  afterEach(() => {
    safeFetchSpy.mockRestore();
    debugLogSpy.mockRestore();
  });

  test('throws when fetch fails', async () => {
    safeFetchSpy.mockRejectedValue(new Error('Network error'));

    await expect(GeminiProvider.generateReply('prompt', mockContext)).rejects.toThrow('Network error');
  });

  test('throws when response lacks candidate text', async () => {
    safeFetchSpy.mockResolvedValue({
      json: () => Promise.resolve({ candidates: [] }),
    });

    await expect(GeminiProvider.generateReply('prompt', mockContext)).rejects.toThrow(/Failed to generate reply/);
  });
});
