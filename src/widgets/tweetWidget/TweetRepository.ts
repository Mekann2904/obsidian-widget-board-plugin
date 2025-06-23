import { App, Notice } from 'obsidian';
import type { TweetWidgetSettings } from './types'; // types.ts から型をインポート
import { validatePost } from './tweetWidgetUtils'; // tweetWidgetUtils.ts からユーティリティをインポート
import { DEFAULT_TWEET_WIDGET_SETTINGS } from './constants'; // constants.ts から定数をインポート
import { t, type Language } from '../../i18n';
import { TweetVersionControl } from './versionControl/TweetVersionControl';
import type { HistoryEntry, RestoreOptions } from './versionControl/types';
import { BackupManager } from './backup/BackupManager';
import { EmergencyRecoveryManager } from './backup/EmergencyRecoveryManager';

// グローバルなファイル保存ロック
const fileSaveLocks = new Map<string, Promise<void>>();

export class TweetRepository {
    private app: App;
    private dbPath: string;
    private saveInProgress: boolean = false;
    private pendingSave: Promise<void> | null = null;
    private versionControl: TweetVersionControl;
    private backupManager: BackupManager;
    private emergencyRecovery: EmergencyRecoveryManager;
    private lastKnownSettings: TweetWidgetSettings | null = null;

    constructor(app: App, dbPath: string) {
        this.app = app;
        this.dbPath = dbPath;
        this.versionControl = new TweetVersionControl(app, dbPath);
        // バックアップマネージャーを初期化（dbPathからベースパスを取得）
        const basePath = this.dbPath.replace('/tweets.json', '');
        this.backupManager = new BackupManager(app, basePath);
        this.emergencyRecovery = new EmergencyRecoveryManager(app, dbPath);
    }

    /**
     * Update the database path at runtime.
     */
    setPath(path: string): void {
        this.dbPath = path;
        this.versionControl = new TweetVersionControl(this.app, path);
        // バックアップマネージャーのパスも更新
        const basePath = path.replace('/tweets.json', '');
        this.backupManager = new BackupManager(this.app, basePath);
        this.emergencyRecovery = new EmergencyRecoveryManager(this.app, path);
    }

    /**
     * Load tweet data from the file, with automatic emergency recovery.
     */
    async load(lang: Language): Promise<TweetWidgetSettings> {
        try {
            // ファイル存在チェック
            const fileExists = await this.app.vault.adapter.exists(this.dbPath);
            
            if (!fileExists) {
                console.warn(`データファイルが見つかりません: ${this.dbPath}`);
                
                // 緊急復元を試行
                const recoveryResult = await this.attemptEmergencyRecovery(lang);
                if (recoveryResult) {
                    new Notice(`データファイルが復元されました: ${recoveryResult.stats.recoveredPosts}件の投稿`);
                    this.lastKnownSettings = recoveryResult.recoveredData;
                    return recoveryResult.recoveredData;
                } else {
                    // 復元に失敗した場合、デフォルト設定で新規作成
                    console.log('復元に失敗、新しいファイルを作成します');
                    new Notice('データファイルが見つからないため、新しいファイルを作成しました');
                    const defaultSettings = DEFAULT_TWEET_WIDGET_SETTINGS;
                    await this.save(defaultSettings, lang, '初期データファイル作成');
                    this.lastKnownSettings = defaultSettings;
                    return defaultSettings;
                }
            }

            // 通常のファイル読み込み処理
            const content = await this.app.vault.adapter.read(this.dbPath);
            
            if (!content.trim()) {
                console.warn('空のファイルが検出されました');
                new Notice('データファイルが空です。デフォルト設定を使用します。');
                const defaultSettings = DEFAULT_TWEET_WIDGET_SETTINGS;
                this.lastKnownSettings = defaultSettings;
                return defaultSettings;
            }

            let settings: TweetWidgetSettings;
            try {
                const parsed = JSON.parse(content);
                settings = this.ensureSettingsSchema(parsed);
            } catch (parseError) {
                console.error('JSONパース エラー:', parseError);
                
                // 破損したファイルをバックアップ
                await this.backupCorruptedFile(content, lang);
                
                // 緊急復元を試行
                const recoveryResult = await this.attemptEmergencyRecovery(lang);
                if (recoveryResult) {
                    new Notice(`破損ファイルから復元されました: ${recoveryResult.stats.recoveredPosts}件の投稿`);
                    this.lastKnownSettings = recoveryResult.recoveredData;
                    return recoveryResult.recoveredData;
                } else {
                    new Notice(t(lang, 'dataFileCorrupted'));
                    const defaultSettings = DEFAULT_TWEET_WIDGET_SETTINGS;
                    this.lastKnownSettings = defaultSettings;
                    return defaultSettings;
                }
            }

            // 投稿データの検証
            if (Array.isArray(settings.posts)) {
                settings.posts = settings.posts.filter(post => validatePost(post));
            }

            this.lastKnownSettings = settings;
            return settings;
            
        } catch (e) {
            console.error("Error loading tweet data:", e);
            
            // 読み込みエラー時も緊急復元を試行
            const recoveryResult = await this.attemptEmergencyRecovery(lang);
            if (recoveryResult) {
                new Notice(`エラーから復元されました: ${recoveryResult.stats.recoveredPosts}件の投稿`);
                this.lastKnownSettings = recoveryResult.recoveredData;
                return recoveryResult.recoveredData;
            } else {
                new Notice(t(lang, 'loadError'));
                const defaultSettings = DEFAULT_TWEET_WIDGET_SETTINGS;
                this.lastKnownSettings = defaultSettings;
                return defaultSettings;
            }
        }
    }

    /**
     * 緊急復元を試行
     */
    private async attemptEmergencyRecovery(lang: Language): Promise<{ recoveredData: TweetWidgetSettings; stats: { recoveredPosts: number } } | null> {
        try {
            console.log('緊急復元を開始...');
            
            const recoveryResult = await this.emergencyRecovery.performAutoRecovery();
            
            if (recoveryResult && recoveryResult.success && recoveryResult.recoveredData) {
                console.log(`緊急復元成功: ${recoveryResult.source.name} から ${recoveryResult.stats.recoveredPosts}件を復元`);
                return {
                    recoveredData: recoveryResult.recoveredData,
                    stats: { recoveredPosts: recoveryResult.stats.recoveredPosts }
                };
            } else {
                console.warn('緊急復元に失敗:', recoveryResult?.error);
                return null;
            }
            
        } catch (error) {
            console.error('緊急復元エラー:', error);
            return null;
        }
    }

    /**
     * 現在の設定と投稿データをファイルに保存する。
     * @param settings 保存する設定オブジェクト
     * @param commitMessage 手動コミットメッセージ（オプショナル）
     */
    async save(settings: TweetWidgetSettings, lang: Language, commitMessage?: string): Promise<void> {
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
        this.pendingSave = this.performSave(settings, lang, commitMessage);
        fileSaveLocks.set(this.dbPath, this.pendingSave);
        
        try {
            await this.pendingSave;
        } catch (error) {
            console.error(`Failed to save tweet data to ${this.dbPath}:`, error);
        } finally {
            this.saveInProgress = false;
            this.pendingSave = null;
            fileSaveLocks.delete(this.dbPath);
        }
    }

    private async performSave(settings: TweetWidgetSettings, lang: Language, commitMessage?: string): Promise<void> {
        try {
            const sanitizedSettings = this.ensureSettingsSchema(settings);
            const lastSlash = this.dbPath.lastIndexOf('/');
            const folder = lastSlash !== -1 ? this.dbPath.substring(0, lastSlash) : '';

            if (folder) {
                await this.ensureFolderExists(folder);
            }

            // バージョン管理: 変更前のデータでコミット
            try {
                if (this.lastKnownSettings) {
                    const commitId = await this.versionControl.commit(
                        this.lastKnownSettings.posts || [],
                        sanitizedSettings.posts || [],
                        commitMessage,
                        sanitizedSettings
                    );
                    if (commitId) {
                        console.log(`Tweet changes committed: ${commitId}`);
                    }
                }
            } catch (versionError) {
                console.warn('バージョン管理エラー（保存は続行）:', versionError);
            }

            const dataToSave = JSON.stringify(sanitizedSettings, null, 2);
            await this.app.vault.adapter.write(this.dbPath, dataToSave);
            
            // 保存成功後、最新の設定を記録
            this.lastKnownSettings = sanitizedSettings;

            // バックアップシステム: データ保存後にバックアップ処理を実行
            try {
                await this.backupManager.onDataSave(sanitizedSettings);
            } catch (backupError) {
                console.warn('バックアップ処理エラー（保存は成功）:', backupError);
            }
        } catch (e) {
            console.error("Error saving tweet data:", e);
            new Notice(t(lang, 'saveError'));
        }
    }

    /**
     * バージョン管理の履歴を取得
     */
    async getHistory(limit: number = 50): Promise<HistoryEntry[]> {
        try {
            return await this.versionControl.getHistory(limit);
        } catch (error) {
            console.error('履歴取得エラー:', error);
            return [];
        }
    }

    /**
     * 特定のコミットに復元
     */
    async restoreFromCommit(options: RestoreOptions, lang: Language): Promise<boolean> {
        try {
            const restoredPosts = await this.versionControl.restore(options);
            
            // 現在の設定を取得して投稿のみを置き換え
            const currentSettings = this.lastKnownSettings || await this.load(lang);
            const newSettings: TweetWidgetSettings = {
                ...currentSettings,
                posts: restoredPosts
            };

            // 復元データを保存
            await this.save(newSettings, lang, `復元: コミット ${options.commitId.substring(0, 8)}`);
            
            new Notice(`コミット ${options.commitId.substring(0, 8)} から復元しました`);
            return true;
        } catch (error) {
            console.error('復元エラー:', error);
            new Notice(`復元に失敗しました: ${error.message}`);
            return false;
        }
    }

    /**
     * バージョン管理の統計情報を取得
     */
    async getVersionStats(): Promise<{ totalCommits: number; firstCommit?: number; lastCommit?: number }> {
        try {
            return await this.versionControl.getStats();
        } catch (error) {
            console.error('統計情報取得エラー:', error);
            return { totalCommits: 0 };
        }
    }

    /**
     * 手動コミット（現在の状態をコミット）
     */
    async manualCommit(message: string, lang: Language): Promise<string | null> {
        try {
            const currentSettings = this.lastKnownSettings || await this.load(lang);
            const commitId = await this.versionControl.commit(
                currentSettings.posts || [],
                currentSettings.posts || [],
                message,
                currentSettings
            );
            
            if (commitId) {
                new Notice(`手動コミット完了: ${commitId.substring(0, 8)}`);
            } else {
                new Notice('変更がないためコミットされませんでした');
            }
            
            return commitId;
        } catch (error) {
            console.error('手動コミットエラー:', error);
            new Notice(`コミットに失敗しました: ${error.message}`);
            return null;
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
    private async backupCorruptedFile(rawContent: string, lang: Language): Promise<void> {
        let backupPath = `${this.dbPath}.bak_${Date.now()}`;
        let counter = 0;
        
        try {
            // 一意なバックアップファイル名を確保
            while (await this.app.vault.adapter.exists(backupPath)) {
                counter++;
                backupPath = `${this.dbPath}.bak_${Date.now()}_${counter}`;
            }
            
            await this.app.vault.adapter.write(backupPath, rawContent);
            new Notice(t(lang, 'backupSuccess', { backupPath: backupPath }));
        } catch (backupError) {
            console.error("Error creating backup of corrupted tweet data:", backupError);
            new Notice(`破損したデータのバックアップ作成に失敗しました: ${backupPath}`);
        }
    }

    /**
     * 利用可能なバックアップ一覧を取得
     */
    async getAvailableBackups(): Promise<{
        generations: any[];
        incremental: any[];
    }> {
        try {
            return await this.backupManager.getAvailableBackups();
        } catch (error) {
            console.error('バックアップ一覧取得エラー:', error);
            return { generations: [], incremental: [] };
        }
    }

    /**
     * 手動バックアップを作成
     */
    async createManualBackup(lang: Language, description?: string): Promise<boolean> {
        try {
            const currentSettings = this.lastKnownSettings || await this.load(lang);
            const result = await this.backupManager.createManualBackup(currentSettings, description);
            
            if (result.success) {
                new Notice(`手動バックアップを作成しました: ${result.backupId}`);
                return true;
            } else {
                new Notice(`バックアップ作成に失敗しました: ${result.error}`);
                return false;
            }
        } catch (error) {
            console.error('手動バックアップエラー:', error);
            new Notice(`バックアップ作成に失敗しました: ${error.message}`);
            return false;
        }
    }

    /**
     * バックアップから復元
     */
    async restoreFromBackup(backupId: string, lang: Language): Promise<boolean> {
        try {
            console.log(`[TweetRepository] 復元開始: バックアップID ${backupId}`);
            
            const result = await this.backupManager.restoreFromBackup({
                backupId: backupId,
                type: 'full',
                createCurrentBackup: true,
                verifyIntegrity: true
            });

            console.log(`[TweetRepository] バックアップマネージャー結果:`, {
                success: result.success,
                error: result.error,
                stats: result.stats
            });

            if (result.success && result.restoredData) {
                console.log(`[TweetRepository] 復元成功: ${result.stats.restoredPosts}件の投稿を復元`);
                
                // 復元されたデータの妥当性を確認
                const posts = result.restoredData.posts || [];
                const scheduledPosts = result.restoredData.scheduledPosts || [];
                console.log(`[TweetRepository] 復元データ詳細: 投稿=${posts.length}件, スケジュール=${scheduledPosts.length}件`);
                
                await this.save(result.restoredData, lang, `バックアップから復元: ${backupId.substring(0, 8)}`);
                new Notice(`バックアップから復元しました: ${result.stats.restoredPosts}件の投稿`);
                return true;
            } else {
                console.error(`[TweetRepository] 復元失敗: ${result.error}`);
                new Notice(`復元に失敗しました: ${result.error || '不明なエラー'}`);
                return false;
            }
        } catch (error) {
            console.error('[TweetRepository] バックアップ復元エラー:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            new Notice(`復元に失敗しました: ${errorMessage}`);
            return false;
        }
    }

    /**
     * バックアップマネージャーを取得（UI用）
     */
    getBackupManager(): BackupManager {
        return this.backupManager;
    }

    /**
     * 緊急復元マネージャーを取得（UI用）
     */
    getEmergencyRecoveryManager(): EmergencyRecoveryManager {
        return this.emergencyRecovery;
    }

    /**
     * デバッグ用：バックアップ状況を確認
     */
    async debugBackupStatus(lang: Language): Promise<void> {
        try {
            console.log('=== バックアップ状況デバッグ ===');
            
            const backups = await this.backupManager.getAvailableBackups();
            console.log('世代バックアップ数:', backups.generations.length);
            console.log('差分バックアップ数:', backups.incremental.length);
            
            if (backups.generations.length > 0) {
                console.log('最新の世代バックアップ:', backups.generations[0]);
                
                // 実際のファイル内容を確認
                await this.debugBackupFileContent(backups.generations[0]);
            }
            
            if (backups.incremental.length > 0) {
                console.log('最新の差分バックアップ:', backups.incremental[0]);
            }
            
            // パスの確認
            const basePath = this.dbPath.replace('/tweets.json', '');
            console.log('ベースパス:', basePath);
            console.log('DBパス:', this.dbPath);
            
            // ファイル存在確認
            const dbExists = await this.app.vault.adapter.exists(this.dbPath);
            console.log('DBファイル存在:', dbExists);
            
            const backupDirPath = `${basePath}/backups`;
            const backupDirExists = await this.app.vault.adapter.exists(backupDirPath);
            console.log('バックアップディレクトリ存在:', backupDirExists);
            
            new Notice('バックアップ状況をコンソールに出力しました');
            
        } catch (error) {
            console.error('デバッグ情報取得エラー:', error);
            new Notice(`デバッグ情報取得に失敗: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * デバッグ用：バックアップファイルの内容を詳細確認
     */
    private async debugBackupFileContent(backupInfo: any): Promise<void> {
        try {
            console.log('=== バックアップファイル詳細確認 ===');
            console.log('バックアップ情報:', backupInfo);
            
            if (!backupInfo.filePath) {
                console.error('ファイルパスが見つかりません');
                return;
            }
            
            // ファイル存在確認
            const exists = await this.app.vault.adapter.exists(backupInfo.filePath);
            console.log('ファイル存在:', exists);
            
            if (!exists) {
                console.error('バックアップファイルが存在しません:', backupInfo.filePath);
                return;
            }
            
            // ファイル内容を読み込み
            const content = await this.app.vault.adapter.read(backupInfo.filePath);
            console.log('ファイルサイズ:', content.length, 'バイト');
            console.log('ファイル内容の最初の500文字:', content.substring(0, 500));
            
            // JSON解析を試行
            try {
                const parsed = JSON.parse(content);
                console.log('JSON解析成功');
                console.log('トップレベルキー:', Object.keys(parsed));
                
                if (parsed.data) {
                    console.log('dataプロパティ存在');
                    console.log('data内のキー:', Object.keys(parsed.data));
                    if (parsed.data.posts) {
                        console.log('投稿数:', parsed.data.posts.length);
                    }
                } else {
                    console.log('dataプロパティなし');
                    if (parsed.posts) {
                        console.log('直接postsプロパティ存在、投稿数:', parsed.posts.length);
                    }
                }
                
            } catch (parseError) {
                console.error('JSON解析エラー:', parseError);
            }
            
        } catch (error) {
            console.error('バックアップファイル詳細確認エラー:', error);
        }
    }
}