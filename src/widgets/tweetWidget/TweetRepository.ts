import { App, Notice } from 'obsidian';
import type { TweetWidgetSettings } from './types'; // types.ts から型をインポート
import { validatePost } from './tweetWidgetUtils'; // tweetWidgetUtils.ts からユーティリティをインポート
import { DEFAULT_TWEET_WIDGET_SETTINGS } from './constants'; // constants.ts から定数をインポート

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
    async load(): Promise<TweetWidgetSettings> {
        try {
            const fileExists = await this.app.vault.adapter.exists(this.dbPath);
            if (!fileExists) {
                // ファイルが存在しない場合は、デフォルト設定で初期化し、一度保存を試みる
                await this.save(DEFAULT_TWEET_WIDGET_SETTINGS);
                return { ...DEFAULT_TWEET_WIDGET_SETTINGS };
            }

            const raw = await this.app.vault.adapter.read(this.dbPath);

            // データが空の場合
            if (!raw || raw.trim() === '') {
                new Notice('データファイルが空です。初期設定を使用します。');
                return { ...DEFAULT_TWEET_WIDGET_SETTINGS };
            }

            let loadedSettings;
            try {
                loadedSettings = JSON.parse(raw);
            } catch (parseError) {
                console.error("Error parsing tweet data JSON:", parseError);
                new Notice('つぶやきデータのフォーマットが不正です。初期設定で起動します。\n破損したファイルは '.concat(this.dbPath, '.bak として保存を試みます。'));
                await this.backupCorruptedFile(raw);
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
            new Notice('つぶやきデータの読み込み中に予期せぬエラーが発生しました。詳細はコンソールを確認してください。');
        }
        
        // 上記のいずれかのエラーパスで処理されなかった場合のフォールバック
        return { ...DEFAULT_TWEET_WIDGET_SETTINGS };
    }

    /**
     * 現在の設定と投稿データをファイルに保存する。
     * @param settings 保存する設定オブジェクト
     */
    async save(settings: TweetWidgetSettings): Promise<void> {
        try {
            const sanitizedSettings = this.ensureSettingsSchema(settings);
            const lastSlash = this.dbPath.lastIndexOf('/');
            const folder = lastSlash !== -1 ? this.dbPath.substring(0, lastSlash) : '';

            if (folder) {
                await this.ensureFolderExists(folder);
            }

            const dataToSave = JSON.stringify(sanitizedSettings, null, 2);
            await this.app.vault.adapter.write(this.dbPath, dataToSave);
        } catch (e) {
            console.error("Error saving tweet data:", e);
            new Notice("つぶやきデータの保存中にエラーが発生しました。詳細はコンソールを確認してください。");
        }
    }

    private async ensureFolderExists(folder: string) {
        const folders = folder.split('/');
        let currentPath = '';
        for (const f of folders) {
            currentPath = currentPath ? `${currentPath}/${f}` : f;
            if (!(await this.app.vault.adapter.exists(currentPath))) {
                await this.app.vault.adapter.mkdir(currentPath);
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
    private async backupCorruptedFile(rawContent: string): Promise<void> {
        const backupPath = `${this.dbPath}.bak_${Date.now()}`;
        try {
            await this.app.vault.adapter.write(backupPath, rawContent);
            new Notice(`破損したデータは ${backupPath} にバックアップされました。`);
        } catch (backupError) {
            console.error("Error creating backup of corrupted tweet data:", backupError);
            new Notice(`破損したデータのバックアップ作成に失敗しました: ${backupPath}`);
        }
    }
}