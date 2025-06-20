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

    const manager = new LLMManager();
    manager.register(geminiProvider);
    manager.register(otherProvider);

    const result = await manager.generateReplyWithDefault('hello', {});
    expect(result).toBe('ok');
    expect(geminiProvider.generateReply).toHaveBeenCalledWith('hello', {});
    expect(otherProvider.generateReply).not.toHaveBeenCalled();
  });

  test('generateReplyWithDefault throws when gemini provider not registered', async () => {
    const manager = new LLMManager();
    await expect(manager.generateReplyWithDefault('hi', {})).rejects.toThrow('LLM provider not found');
  });
});
