export interface LLMProvider {
  id: string;
  name: string;
  generateReply(prompt: string, context: { [key: string]: any }): Promise<string>;
}

export class LLMManager {
  private providers: Record<string, LLMProvider> = {};

  register(provider: LLMProvider) {
    this.providers[provider.id] = provider;
  }

  getProvider(id: string): LLMProvider | undefined {
    return this.providers[id];
  }

  async generateReplyWithDefault(prompt: string, context: any) {
    const defaultProvider = this.providers['gemini']; // 設定で切替も可
    if (!defaultProvider) throw new Error('LLM provider not found');
    return defaultProvider.generateReply(prompt, context);
  }
} 