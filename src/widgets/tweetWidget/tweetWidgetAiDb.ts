import type { App } from 'obsidian';
import type { TweetWidgetPost } from './tweetWidget';

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
        await app.vault.adapter.write(dbPath, JSON.stringify(aiReplies, null, 2));
    } catch (e) {
        console.error('Error saving AI replies:', e);
        throw e;
    }
} 