jest.mock('obsidian', () => {
  return {
    requestUrl: jest.fn(),
  };
}, { virtual: true });

(global as any).ReadableStream = (global as any).ReadableStream || class {
  constructor() {}
};

import { safeFetch } from '../../src/utils/safeFetch';

const obsidian = require('obsidian');

describe('safeFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sanitizes headers and body and returns response', async () => {
    (obsidian.requestUrl as jest.Mock).mockResolvedValue({
      status: 200,
      text: 'ok',
      json: { ok: true },
      headers: {},
    });

    const body = JSON.stringify({ foo: 'bar', frequency_penalty: 1 });
    const resp = await safeFetch('https://example.com', {
      method: 'POST',
      headers: { 'content-length': '10', 'X-Test': '1' },
      body,
    });

    expect(obsidian.requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com',
      method: 'POST',
      headers: { 'X-Test': '1' },
      body: JSON.stringify({ foo: 'bar' }),
      contentType: 'application/json',
      throw: false,
    }));

    expect(resp.ok).toBe(true);
    expect(resp.status).toBe(200);
    expect(await resp.text()).toBe('ok');
  });

  test('throws error when response status >= 400', async () => {
    (obsidian.requestUrl as jest.Mock).mockResolvedValue({
      status: 404,
      text: '{"message":"not found"}',
      json: { message: 'not found' },
      headers: {},
    });

    await expect(safeFetch('https://example.com')).rejects.toMatchObject({
      message: expect.any(String),
      json: { message: 'not found' },
    });
  });

  test('handles network errors gracefully', async () => {
    (obsidian.requestUrl as jest.Mock).mockRejectedValue(new Error('Network request failed'));

    await expect(safeFetch('https://example.com')).rejects.toThrow('Network request failed');
  });
});
