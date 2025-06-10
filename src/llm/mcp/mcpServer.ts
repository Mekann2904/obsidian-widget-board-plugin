import { createServer } from 'http';
import { exec } from 'child_process';

const port = parseInt(process.env.MCP_SERVER_PORT || '3000', 10);

// 許可するコマンドのホワイトリスト
const allowedCommands = (process.env.MCP_ALLOWED_CMDS || 'echo,ls,date')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
const braveSearchApiKey = process.env.BRAVE_SEARCH_API_KEY || '';

const server = createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.writeHead(200); res.end();
        return;
    }
    if (req.method !== 'POST' || req.url !== '/executeTool') {
        res.writeHead(404); res.end();
        return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
        try {
            const { command, args } = JSON.parse(body || '{}');
            if (command === 'brave-search') {
                const query = Array.isArray(args) ? args.join(' ') : String(args || '');
                if (!braveSearchApiKey) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Brave Search API key not configured' }));
                    return;
                }
                try {
                    const resp = await fetch(
                        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`,
                        {
                            headers: {
                                'Accept': 'application/json',
                                'X-Subscription-Token': braveSearchApiKey,
                            },
                        }
                    );
                    const data = await resp.json();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(data));
                } catch (e: any) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: String(e) }));
                }
                return;
            }
            if (!allowedCommands.includes(command)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '許可されていないコマンドです' }));
                return;
            }
            const cmd = `${command} ${(Array.isArray(args) ? args.join(' ') : '')}`;
            exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    stdout,
                    stderr,
                    exitCode: error && typeof (error.code) === 'number' ? error.code : 0,
                    error: error ? error.message : null
                }));
            });
        } catch (e: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(e) }));
        }
    });
});

server.listen(port, () => {
    console.log(`MCPサーバーがポート${port}で起動しました`);
});
