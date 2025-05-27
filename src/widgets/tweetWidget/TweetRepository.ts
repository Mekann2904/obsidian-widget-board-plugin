import { App, Notice } from 'obsidian';
import type { TweetWidgetSettings } from './types';
import { validatePost } from './tweetWidgetUtils';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from './constants';

export class TweetRepository {
    private app: App;
    private dbPath: string;

    constructor(app: App, dbPath: string) {
        this.app = app;
        this.dbPath = dbPath;
    }

    /**
     * データファイルから設定と投稿データを読み込む
     * @returns 読み込んだ設定。失敗した場合はデフォルト設定を返す。
     */
    async load(): Promise<TweetWidgetSettings> {
        try {
            if (await this.app.vault.adapter.exists(this.dbPath)) {
                const raw = await this.app.vault.adapter.read(this.dbPath);
                // データが空、または破損している場合を考慮
                if (!raw || raw.trim() === '') {
                    return { ...DEFAULT_TWEET_WIDGET_SETTINGS };
                }
                const loadedSettings = JSON.parse(raw);
                loadedSettings.posts = loadedSettings.posts.map((t: any) => validatePost(t));
                return { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...loadedSettings };
            }
        } catch (e) {
            console.error("Error loading tweet data:", e);
            new Notice('つぶやきデータの読み込みに失敗しました。');
            // TODO: データ破損時にバックアップを作成する処理を追加可能
        }
        // ファイルが存在しない、または読み込みに失敗した場合
        return { ...DEFAULT_TWEET_WIDGET_SETTINGS };
    }

    /**
     * 現在の設定と投稿データをファイルに保存する
     * @param settings 保存する設定オブジェクト
     */
    async save(settings: TweetWidgetSettings): Promise<void> {
        try {
            const folder = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
            if (!await this.app.vault.adapter.exists(folder)) {
                await this.app.vault.adapter.mkdir(folder);
            }
            const dataToSave = JSON.stringify(settings, null, 2);
            await this.app.vault.adapter.write(this.dbPath, dataToSave);
        } catch (e) {
            console.error("Error saving tweet data:", e);
            new Notice("つぶやきデータの保存に失敗しました。");
        }
    }
}