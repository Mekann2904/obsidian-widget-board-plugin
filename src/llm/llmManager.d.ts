export interface LLMProvider {
  id: string;
  name: string;
  generateReply(prompt: string, context: { [key: string]: any }): Promise<string>;
} 