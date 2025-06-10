import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import type { Request, Response } from 'express';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// 許可するコマンドのホワイトリスト
const allowedCommands = ['echo', 'ls', 'date'];

app.post('/executeTool', (req, res) => {
    const { command, args } = req.body;
    if (!allowedCommands.includes(command)) {
        return res.status(400).json({ error: '許可されていないコマンドです' });
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