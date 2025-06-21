import type WidgetBoardPlugin from '../main';

export interface LLMContext extends Record<string, unknown> {
  plugin: WidgetBoardPlugin;
  apiKey: string;
  model?: string;
}

export interface LLMProvider {
  id: string;
  name: string;
  generateReply(prompt: string, context: LLMContext): Promise<string>;
}

export class LLMManager {
  private providers: Record<string, LLMProvider> = {};
  private plugin: WidgetBoardPlugin;

  constructor(plugin: WidgetBoardPlugin) {
    this.plugin = plugin;
  }

  register(provider: LLMProvider) {
    this.providers[provider.id] = provider;
  }

  getProvider(id: string): LLMProvider | undefined {
    return this.providers[id];
  }

  async generateReplyWithDefault(
    prompt: string,
    context: Omit<LLMContext, 'apiKey' | 'model'> & Record<string, unknown>,
  ) {
    const defaultProvider = this.providers['gemini']; // 設定で切替も可
    if (!defaultProvider) throw new Error('LLM provider not found');

    const settings = this.plugin.settings.llm?.gemini;
    const llmContext: LLMContext = {
      ...context,
      apiKey: settings?.apiKey || '',
      model: settings?.model,
      plugin: this.plugin,
    };
    return defaultProvider.generateReply(prompt, llmContext);
  }
}