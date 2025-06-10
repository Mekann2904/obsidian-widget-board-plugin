import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import type { Request, Response } from 'express';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// 許可するコマンドのホワイトリスト
const allowedCommands = (process.env.MCP_ALLOWED_CMDS || 'echo,ls,date')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
const braveSearchApiKey = process.env.BRAVE_SEARCH_API_KEY || '';

app.post('/executeTool', async (req: Request, res: Response) => {
    const { command, args } = req.body;
    if (command === 'brave-search') {
        const query = Array.isArray(args) ? args.join(' ') : String(args || '');
        if (!braveSearchApiKey) {
            res.status(500).json({ error: 'Brave Search API key not configured' });
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
            res.json(data);
        } catch (e: any) {
            res.status(500).json({ error: String(e) });
        }
        return;
    }
    if (!allowedCommands.includes(command)) {
        res.status(400).json({ error: '許可されていないコマンドです' });
        return;
    }
    const cmd = `${command} ${(Array.isArray(args) ? args.join(' ') : '')}`;
    exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
        res.json({
            stdout: stdout,
            stderr: stderr,
            exitCode: error && typeof error.code === 'number' ? error.code : 0,
            error: error ? error.message : null
        });
    });
});

app.listen(port, () => {
    console.log(`MCPサーバーがポート${port}で起動しました`);
}); 
