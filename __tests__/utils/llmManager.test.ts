import { LLMManager, LLMProvider } from '../../src/llm/llmManager';

describe('LLMManager', () => {
  test('generateReplyWithDefault uses gemini provider when registered', async () => {
    const geminiProvider: LLMProvider = {
      id: 'gemini',
      name: 'Gemini',
      generateReply: jest.fn().mockResolvedValue('ok'),
    };
    const otherProvider: LLMProvider = {
      id: 'other',
      name: 'Other',
      generateReply: jest.fn().mockResolvedValue('other'),
    };

    const mockPlugin = {
      settings: {
        llm: {
          gemini: {
            apiKey: 'test-key',
            model: 'test-model',
          },
        },
      },
    } as any;

    const manager = new LLMManager(mockPlugin);
    manager.register(geminiProvider);
    manager.register(otherProvider);

    const result = await manager.generateReplyWithDefault('hello', { plugin: mockPlugin });
    expect(result).toBe('ok');
    expect(geminiProvider.generateReply).toHaveBeenCalledWith('hello', {
      apiKey: expect.any(String),
      model: 'test-model',
      plugin: mockPlugin,
    });
    expect(otherProvider.generateReply).not.toHaveBeenCalled();
  });

  test('generateReplyWithDefault should prioritize context model over settings model', async () => {
    const geminiProvider: LLMProvider = {
      id: 'gemini',
      name: 'Gemini',
      generateReply: jest.fn().mockResolvedValue('ok'),
    };

    const mockPlugin = {
      settings: {
        llm: {
          gemini: {
            apiKey: 'test-key',
            model: 'settings-model',
          },
        },
      },
    } as any;

    const manager = new LLMManager(mockPlugin);
    manager.register(geminiProvider);

    await manager.generateReplyWithDefault('hello', { plugin: mockPlugin, model: 'context-model' });

    expect(geminiProvider.generateReply).toHaveBeenCalledWith('hello', {
      apiKey: expect.any(String),
      model: 'context-model',
      plugin: mockPlugin,
    });
  });

  test('generateReplyWithDefault throws when gemini provider not registered', async () => {
    const mockPlugin = {
      settings: {},
    } as any;
    const manager = new LLMManager(mockPlugin);
    await expect(manager.generateReplyWithDefault('hi', { plugin: mockPlugin })).rejects.toThrow('LLM provider not found');
  });
});
