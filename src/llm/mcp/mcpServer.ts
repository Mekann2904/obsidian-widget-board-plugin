import { runServer } from '@modelcontextprotocol/server-brave-search';

const port = parseInt(process.env.MCP_SERVER_PORT || '3939', 10);

runServer({
    apiKey: process.env.BRAVE_SEARCH_API_KEY,
    port,
}).then(() => {
    console.log(`MCPサーバーがポート${port}で起動しました`);
}).catch(err => {
    console.error('MCPサーバー起動エラー:', err);
});
