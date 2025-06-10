export class McpManager {
    private serverUrl: string;
    constructor(serverUrl: string = `http://localhost:${process.env.MCP_SERVER_PORT || '3000'}`) {
        this.serverUrl = serverUrl;
    }

    /**
     * 外部ツール実行リクエスト
     * @param command コマンド名
     * @param args 引数配列
     */
    async executeTool(command: string, args: string[]): Promise<any> {
        // HTTP経由でMCPサーバーにリクエスト
        const url = `${this.serverUrl}/executeTool`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command, args })
            });
            if (!res.ok) {
                throw new Error(`MCPサーバーからエラー: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            return data;
        } catch (err) {
            throw new Error(`MCPサーバー通信エラー: ${err}`);
        }
    }
} 