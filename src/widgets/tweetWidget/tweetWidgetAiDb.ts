import { App, TFile } from 'obsidian';
import type { TweetWidgetPost } from './types';

export async function loadAiRepliesFromFile(app: App, dbPath: string): Promise<TweetWidgetPost[]> {
    try {
        const exists = await app.vault.adapter.exists(dbPath);
        if (exists) {
            const raw = await app.vault.adapter.read(dbPath);
            return JSON.parse(raw) as TweetWidgetPost[];
        } else {
            await saveAiRepliesToFile(app, dbPath, []);
            return [];
        }
    } catch (e) {
        console.error('Error loading AI replies:', e);
        return [];
    }
}

export async function saveAiRepliesToFile(app: App, dbPath: string, aiReplies: TweetWidgetPost[]): Promise<void> {
    const folder = dbPath.split('/').slice(0, -1).join('/');
    try {
        const exists = await app.vault.adapter.exists(folder);
        if (!exists) {
            await app.vault.adapter.mkdir(folder);
        }
        
        // Obsidianのvault APIを使ってファイル操作を行い、インデックスへの影響を最小化
        const file = app.vault.getAbstractFileByPath(dbPath);
        const data = JSON.stringify(aiReplies, null, 2);
        
        if (file && file instanceof TFile) {
            // 既存ファイルがある場合は更新
            await app.vault.modify(file, data);
        } else {
            // ファイルが存在しない場合は作成
            try {
                await app.vault.create(dbPath, data);
            } catch (createError) {
                // ファイル作成競合時の再試行
                if (createError instanceof Error && createError.message.includes('File already exists')) {
                    const existingFile = app.vault.getAbstractFileByPath(dbPath);
                    if (existingFile && existingFile instanceof TFile) {
                        console.log(`AI replies file was created by another process, updating instead: ${dbPath}`);
                        await app.vault.modify(existingFile, data);
                        return; // 正常に処理できた場合は早期リターン
                    } else {
                        console.error(`AI replies file already exists but cannot be found in vault: ${dbPath}`);
                        throw createError;
                    }
                } else {
                    throw createError;
                }
            }
        }
    } catch (e) {
        console.error('Error saving AI replies:', e);
        throw e; // エラーを再スローして上位のハンドラーに伝播
    }
} 