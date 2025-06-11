import { spawn, ChildProcess } from 'child_process';
import { GeminiProvider } from '../gemini/geminiApi';
import { deobfuscate } from '../../utils';

// Geminiのみ呼び出し用
export async function geminiChatWithTools({
  prompt,
  settings,
  tools = [],
}: {
  prompt: string,
  settings: { llm: { gemini: { apiKey: string; model: string } }, tweetAiModel?: string },
  tools?: any[]
}): Promise<string> {
  const apiKey = deobfuscate(settings.llm?.gemini?.apiKey || '');
  const model = settings.tweetAiModel || settings.llm?.gemini?.model || 'gemini-1.5-pro-latest';
  return await GeminiProvider.generateReply(prompt, { apiKey, model });
}

// MCPサーバー管理＋HTTPクライアント
export class MCPHttpClient {
  private serverProcess: ChildProcess | null = null;
  private serverUrl: string;
  private serverScript: string;
  private serverPort: number;
  private isExternal: boolean;

  constructor(serverScriptOrUrl: string, port: number = 3100) {
    this.isExternal = serverScriptOrUrl.startsWith('http');
    this.serverScript = serverScriptOrUrl;
    this.serverPort = port;
    this.serverUrl = this.isExternal
      ? serverScriptOrUrl
      : `http://localhost:${port}/mcp`;
  }

  // サーバープロセスを起動
  startServer() {
    if (this.isExternal) return; // 外部サーバは起動しない
    if (this.serverProcess) return;
    // Python/Node.jsスクリプトの自動判別
    const isPy = this.serverScript.endsWith('.py');
    const command = isPy ? (process.platform === 'win32' ? 'python' : 'python3') : process.execPath;
    const args = isPy ? [this.serverScript, '--port', String(this.serverPort)] : [this.serverScript, '--port', String(this.serverPort)];
    this.serverProcess = spawn(command, args, { stdio: 'ignore', detached: true });
    this.serverProcess.unref();
  }

  // サーバープロセスを停止
  stopServer() {
    if (this.isExternal) return; // 外部サーバは何もしない
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
  }

  // MCPツール一覧取得
  async listTools() {
    return await this.jsonRpc('listTools', {});
  }

  // MCPツール呼び出し
  async callTool(toolName: string, args: any) {
    return await this.jsonRpc('callTool', { name: toolName, arguments: args });
  }

  // 汎用JSON-RPCリクエスト
  async jsonRpc(method: string, params: any) {
    const res = await fetch(this.serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'MCPサーバーエラー');
    return json.result;
  }
}