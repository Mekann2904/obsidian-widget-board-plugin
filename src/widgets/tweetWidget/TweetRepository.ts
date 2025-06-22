import { App, Notice, TFile } from 'obsidian';
import type { TweetWidgetSettings } from './types'; // types.ts から型をインポート
import { validatePost } from './tweetWidgetUtils'; // tweetWidgetUtils.ts からユーティリティをインポート
import { DEFAULT_TWEET_WIDGET_SETTINGS } from './constants'; // constants.ts から定数をインポート
import { t, type Language } from '../../i18n';

export class TweetRepository {
    private app: App;
    private dbPath: string;

    constructor(app: App, dbPath: string) {
        this.app = app;
        this.dbPath = dbPath;
    }

    /**
     * Update the database path at runtime.
     */
    setPath(path: string): void {
        this.dbPath = path;
    }

    /**
     * データファイルから設定と投稿データを読み込む。
     * ファイルが存在しない、空、または破損している場合は、デフォルト設定を返す。
     * @returns 読み込んだ設定オブジェクト (Promise<TweetWidgetSettings>)
     */
    async load(lang: Language): Promise<TweetWidgetSettings> {
        try {
            const abstract = this.app.vault.getAbstractFileByPath(this.dbPath);
            if (!abstract || !(abstract instanceof TFile)) {
                // ファイルが存在しない場合は、デフォルト設定で初期化し、一度保存を試みる
                await this.save(DEFAULT_TWEET_WIDGET_SETTINGS, lang);
                return { ...DEFAULT_TWEET_WIDGET_SETTINGS };
            }

            const raw = await this.app.vault.read(abstract);

            // データが空の場合
            if (!raw || raw.trim() === '') {
                new Notice(t(lang, 'dataFileEmpty'));
                return { ...DEFAULT_TWEET_WIDGET_SETTINGS };
            }

            let loadedSettings;
            try {
                loadedSettings = JSON.parse(raw);
            } catch (parseError) {
                console.error("Error parsing tweet data JSON:", parseError);
                new Notice(t(lang, 'dataFileCorrupted', { filePath: this.dbPath }));
                await this.backupCorruptedFile(raw, lang);
                return { ...DEFAULT_TWEET_WIDGET_SETTINGS };
            }
            
            // posts 配列の検証と各投稿のバリデーション
            if (loadedSettings && Array.isArray(loadedSettings.posts)) {
                loadedSettings.posts = loadedSettings.posts.map((t: unknown) => validatePost(t));
            } else {
                // posts がない、または配列でない場合は空配列で初期化
                loadedSettings.posts = [];
            }
            if (!Array.isArray(loadedSettings.scheduledPosts)) {
                loadedSettings.scheduledPosts = [];
            }

            return { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...loadedSettings };

        } catch (e) {
            console.error("Error loading tweet data:", e);
            new Notice(t(lang, 'loadError'));
        }
        
        // 上記のいずれかのエラーパスで処理されなかった場合のフォールバック
        return { ...DEFAULT_TWEET_WIDGET_SETTINGS };
    }

    /**
     * 現在の設定と投稿データをファイルに保存する。
     * @param settings 保存する設定オブジェクト
     */
    async save(settings: TweetWidgetSettings, lang: Language): Promise<void> {
        try {
            const sanitizedSettings = this.ensureSettingsSchema(settings);
            const lastSlash = this.dbPath.lastIndexOf('/');
            const folder = lastSlash !== -1 ? this.dbPath.substring(0, lastSlash) : '';

            if (folder) {
                await this.ensureFolderExists(folder);
            }

            const dataToSave = JSON.stringify(sanitizedSettings, null, 2);
            const file = this.app.vault.getAbstractFileByPath(this.dbPath);
            if (file instanceof TFile) {
                await this.app.vault.process(file, () => dataToSave);
            } else {
                await this.app.vault.create(this.dbPath, dataToSave);
            }
        } catch (e) {
            console.error("Error saving tweet data:", e);
            new Notice(t(lang, 'saveError'));
        }
    }

    private async ensureFolderExists(folder: string) {
        const folders = folder.split('/');
        let currentPath = '';
        for (const f of folders) {
            currentPath = currentPath ? `${currentPath}/${f}` : f;
            if (!this.app.vault.getAbstractFileByPath(currentPath)) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    private ensureSettingsSchema(settings: Partial<TweetWidgetSettings>): TweetWidgetSettings {
        const sanitized = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...settings };
        if (!Array.isArray(sanitized.posts)) {
            sanitized.posts = [];
        }
        if (!Array.isArray(sanitized.scheduledPosts)) {
            sanitized.scheduledPosts = [];
        }
        return sanitized;
    }

    /**
     * 破損したデータファイルのバックアップを作成するヘルパー関数
     * @param rawContent バックアップする生のファイル内容
     */
    private async backupCorruptedFile(rawContent: string, lang: Language): Promise<void> {
        const backupPath = `${this.dbPath}.bak_${Date.now()}`;
        try {
            const file = this.app.vault.getAbstractFileByPath(backupPath);
            if (file instanceof TFile) {
                await this.app.vault.process(file, () => rawContent);
            } else {
                await this.app.vault.create(backupPath, rawContent);
            }
            new Notice(t(lang, 'backupSuccess', { backupPath: backupPath }));
        } catch (backupError) {
            console.error("Error creating backup of corrupted tweet data:", backupError);
            new Notice(`破損したデータのバックアップ作成に失敗しました: ${backupPath}`);
        }
    }
}