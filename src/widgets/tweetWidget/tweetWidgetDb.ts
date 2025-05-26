import type { App } from 'obsidian';
import type { TweetWidgetSettings } from './tweetWidget';

export async function loadTweetsFromFile(app: App, dbPath: string, defaultSettings: TweetWidgetSettings): Promise<TweetWidgetSettings> {
    try {
        const exists = await app.vault.adapter.exists(dbPath);
        if (exists) {
            const raw = await app.vault.adapter.read(dbPath);
            const loadedSettings = JSON.parse(raw);
            loadedSettings.tweets = loadedSettings.tweets.map((t: any) => ({ deleted: false, ...t }));
            return { ...defaultSettings, ...loadedSettings };
        } else {
            await saveTweetsToFile(app, dbPath, defaultSettings);
            return { ...defaultSettings };
        }
    } catch (e) {
        console.error('Error loading tweet data:', e);
        return { ...defaultSettings };
    }
}

export async function saveTweetsToFile(app: App, dbPath: string, settings: TweetWidgetSettings): Promise<void> {
    const folder = dbPath.split('/').slice(0, -1).join('/');
    try {
        const exists = await app.vault.adapter.exists(folder);
        if (!exists) {
            await app.vault.adapter.mkdir(folder);
        }
        await app.vault.adapter.write(dbPath, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('Error saving tweet data:', e);
        throw e;
    }
} 