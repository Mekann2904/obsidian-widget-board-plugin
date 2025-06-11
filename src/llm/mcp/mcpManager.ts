import { Client } from '@modelcontextprotocol/sdk/client';
import { HttpClientTransport } from '@modelcontextprotocol/sdk/client/http';

export class McpManager {
    private serverUrl: string;
    private client: Client;
    private connected = false;

    constructor(serverUrl: string = `http://localhost:${process.env.MCP_SERVER_PORT || '3939'}`) {
        this.serverUrl = serverUrl;
        this.client = new Client({ name: 'widget-board', version: '1.0.0' });
    }

    private async connectIfNeeded(): Promise<void> {
        if (this.connected) return;
        await this.client.connect(new HttpClientTransport({ url: `${this.serverUrl}/executeTool` }));
        this.connected = true;
    }

    /**
     * 外部ツール実行リクエスト
     * @param command モデル名
     * @param args 引数配列
     */
    async executeTool(command: string, args: string[]): Promise<any> {
        await this.connectIfNeeded();
        try {
            const result = await this.client.run({
                model: command,
                messages: [{ role: 'user', content: args.join(' ') }],
                stream: false,
            });
            return { stdout: result.choices[0].message.content };
        } catch (err) {
            throw new Error(`MCPサーバー通信エラー: ${err}`);
        }
    }
}
