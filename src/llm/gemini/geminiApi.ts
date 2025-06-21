import { safeFetch } from '../../utils/safeFetch';
import { LLMProvider } from '../llmManager';
import { geminiPrompt } from './tweetReplyPrompt';
import { debugLog } from '../../utils/logger';

export const GeminiProvider: LLMProvider = {
  id: 'gemini',
  name: 'Gemini',
  async generateReply(prompt, context) {
    const apiKey = context.apiKey as string;
    const model = (context.model as string) || 'gemini-2.0-flash-exp';
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';
    const url = `${baseUrl}${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    let contents;
    if (prompt) {
      contents = [ { parts: [ { text: prompt } ] } ];
    } else if (Array.isArray(context.thread) && context.thread.length > 1) {
      // スレッド履歴がある場合は会話形式で送る（旧ロジック）
      contents = context.thread.map(item => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }]
      }));
      contents.push({
        role: 'user',
        parts: [{ text: geminiPrompt.replace('{tweet}', context.tweetText as string) }]
      });
    } else {
      contents = [
        { parts: [{ text: geminiPrompt.replace('{tweet}', context.tweetText as string) }] }
      ];
    }
    const body = { contents };
    try {
      const res = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        debugLog(context.plugin, 'GeminiProvider: missing text', json);
        return 'リプライ生成に失敗しました';
      }
      return text;
    } catch (e) {
      debugLog(context.plugin, 'GeminiProvider error', e);
      return 'リプライ生成に失敗しました';
    }
  }
};
