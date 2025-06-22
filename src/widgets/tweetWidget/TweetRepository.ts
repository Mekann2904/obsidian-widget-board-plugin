import { App, Notice, TFile, normalizePath } from 'obsidian';
import type { TweetWidgetSettings } from './types'; // types.ts から型をインポート
import { validatePost } from './tweetWidgetUtils'; // tweetWidgetUtils.ts からユーティリティをインポート
import { DEFAULT_TWEET_WIDGET_SETTINGS } from './constants'; // constants.ts から定数をインポート
import { t, type Language } from '../../i18n';

// グローバルなファイル保存ロック
const fileSaveLocks = new Map<string, Promise<void>>();

export class TweetRepository {
    private app: App;
    private dbPath: string;
    private saveInProgress: boolean = false;
    private pendingSave: Promise<void> | null = null;

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
        // グローバルなファイルパス基準のロック
        const existingLock = fileSaveLocks.get(this.dbPath);
        if (existingLock) {
            await existingLock;
        }

        // 既に保存処理が進行中の場合は、それを待機
        if (this.saveInProgress && this.pendingSave) {
            await this.pendingSave;
            return;
        }

        this.saveInProgress = true;
        this.pendingSave = this.performSave(settings, lang);
        fileSaveLocks.set(this.dbPath, this.pendingSave);
        
        try {
            await this.pendingSave;
        } finally {
            this.saveInProgress = false;
            this.pendingSave = null;
            fileSaveLocks.delete(this.dbPath);
        }
    }

    private async performSave(settings: TweetWidgetSettings, lang: Language): Promise<void> {
        try {
            const sanitizedSettings = this.ensureSettingsSchema(settings);
            const folder = this.getFolder();

            if (folder) {
                // ディレクトリが存在しない場合のみ作成（Obsidianのインデックスへの影響を最小化）
                const folderExists = await this.app.vault.adapter.exists(normalizePath(folder));
                if (!folderExists) {
                    await this.app.vault.adapter.mkdir(normalizePath(folder));
                }
            }

            const dataToSave = JSON.stringify(sanitizedSettings, null, 2);
            
            // 再度ファイルの存在をチェック（競合状態を回避）
            const file = this.app.vault.getAbstractFileByPath(this.dbPath);

            if (file instanceof TFile) {
                await this.app.vault.modify(file, dataToSave);
            } else {
                try {
                    await this.app.vault.create(this.dbPath, dataToSave);
                } catch (createError) {
                    // ファイル作成に失敗した場合、再度存在チェックして更新を試みる
                    if (createError instanceof Error && createError.message.includes('File already exists')) {
                        const existingFile = this.app.vault.getAbstractFileByPath(this.dbPath);
                        if (existingFile instanceof TFile) {
                            console.warn(`File was created by another process, updating instead: ${this.dbPath}`);
                            await this.app.vault.modify(existingFile, dataToSave);
                        } else {
                            throw createError;
                        }
                    } else {
                        throw createError;
                    }
                }
            }
        } catch (error) {
            console.error('Error saving tweet data:', error);
            new Notice('Error saving tweet data. See console for details.');
        }
    }

    private getFolder(): string | null {
        const lastSlash = this.dbPath.lastIndexOf('/');
        return lastSlash > -1 ? this.dbPath.substring(0, lastSlash) : null;
    }

    private ensureSettingsSchema(settings: Partial<TweetWidgetSettings>): TweetWidgetSettings {
        const fullSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...settings };
        if (!Array.isArray(fullSettings.posts)) {
            fullSettings.posts = [];
        }
        if (!Array.isArray(fullSettings.scheduledPosts)) {
            fullSettings.scheduledPosts = [];
        }
        return fullSettings;
    }

    /**
     * 破損したデータファイルのバックアップを作成するヘルパー関数
     * @param rawContent バックアップする生のファイル内容
     */
    private async backupCorruptedFile(rawContent: string, lang: Language): Promise<void> {
        let backupPath = `${this.dbPath}.bak_${Date.now()}`;
        let counter = 0;
        
        try {
            // 一意なバックアップファイル名を確保
            while (this.app.vault.getAbstractFileByPath(backupPath)) {
                counter++;
                backupPath = `${this.dbPath}.bak_${Date.now()}_${counter}`;
            }
            
            await this.app.vault.create(backupPath, rawContent);
            new Notice(t(lang, 'backupSuccess', { backupPath: backupPath }));
        } catch (backupError) {
            console.error("Error creating backup of corrupted tweet data:", backupError);
            new Notice(`破損したデータのバックアップ作成に失敗しました: ${backupPath}`);
        }
    }
}