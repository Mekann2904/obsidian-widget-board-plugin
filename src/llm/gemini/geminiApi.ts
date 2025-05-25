import { safeFetch } from '../../utils';
import { LLMProvider } from '../llmManager';
import { geminiPrompt } from './prompts';

export const GeminiProvider: LLMProvider = {
  id: 'gemini',
  name: 'Gemini',
  async generateReply(prompt, context) {
    const apiKey = context.apiKey;
    const tweetText = context.tweetText;
    const model = context.model || 'gemini-2.0-flash-exp';
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/';
    const url = `${baseUrl}${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    let contents;
    if (Array.isArray(context.thread) && context.thread.length > 1) {
      // スレッド履歴がある場合は会話形式で送る
      contents = context.thread.map(item => ({ role: item.role, parts: [{ text: item.content }] }));
    } else {
      // 単発の場合は従来通り
      contents = [
        { parts: [{ text: geminiPrompt.replace('{tweet}', tweetText) }] }
      ];
    }
    const body = { contents };
    const res = await safeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? 'リプライ生成に失敗しました';
  }
}; 