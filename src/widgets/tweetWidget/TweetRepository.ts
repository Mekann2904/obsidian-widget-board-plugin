import { App, Notice } from 'obsidian';
import type { TweetWidgetSettings } from './types'; // types.ts から型をインポート
import { validatePost } from './tweetWidgetUtils'; // tweetWidgetUtils.ts からユーティリティをインポート
import { DEFAULT_TWEET_WIDGET_SETTINGS } from './constants'; // constants.ts から定数をインポート
import { t, type Language } from '../../i18n';
import { TweetVersionControl } from './versionControl/TweetVersionControl';
import type { HistoryEntry, RestoreOptions } from './versionControl/types';
import { SimpleBackupManager } from './backup/SimpleBackupManager';
import { EmergencyRecoveryManager } from './backup/EmergencyRecoveryManager';
import { BranchManager } from './backup/BranchManager';
import type { BackupCollection } from './backup/types';

// グローバルなファイル保存ロック
const fileSaveLocks = new Map<string, Promise<void>>();

export class TweetRepository {
    private app: App;
    private dbPath: string;
    private saveInProgress: boolean = false;
    private pendingSave: Promise<void> | null = null;
    private versionControl: TweetVersionControl;
    private backupManager: SimpleBackupManager;
    private emergencyRecovery: EmergencyRecoveryManager;
    private branchManager: BranchManager;
    private lastKnownSettings: TweetWidgetSettings | null = null;

    constructor(app: App, dbPath: string) {
        this.app = app;
        this.dbPath = dbPath;
        this.versionControl = new TweetVersionControl(app, dbPath);
        // バックアップマネージャーを初期化（dbPathからベースパスを取得）
        const basePath = this.dbPath.replace('/tweets.json', '');
        this.backupManager = new SimpleBackupManager(app, basePath);
        this.emergencyRecovery = new EmergencyRecoveryManager(app, dbPath);
        this.branchManager = new BranchManager(app, basePath);
    }

    /**
     * Update the database path at runtime.
     */
    setPath(path: string): void {
        this.dbPath = path;
        this.versionControl = new TweetVersionControl(this.app, path);
        // バックアップマネージャーのパスも更新
        const basePath = path.replace('/tweets.json', '');
        this.backupManager = new SimpleBackupManager(this.app, basePath);
        this.emergencyRecovery = new EmergencyRecoveryManager(this.app, path);
        this.branchManager = new BranchManager(this.app, basePath);
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
                settings.posts = settings.posts.map(post => validatePost(post));
            }

            // ブランチ管理システムを初期化
            await this.branchManager.initialize(settings);

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
            console.log(t(lang, 'emergencyRestoreStarted'));
            
            const recoveryResult = await this.emergencyRecovery.performAutoRecovery();
            
            if (recoveryResult && recoveryResult.success && recoveryResult.recoveredData) {
                console.log(`${t(lang, 'emergencyRestoreSuccess')}: ${recoveryResult.source.name} から ${recoveryResult.stats.recoveredPosts}件を復元`);
                return {
                    recoveredData: recoveryResult.recoveredData,
                    stats: { recoveredPosts: recoveryResult.stats.recoveredPosts }
                };
            } else {
                console.warn(`${t(lang, 'emergencyRestoreFailed')}:`, recoveryResult?.error);
                return null;
            }
            
        } catch (error) {
            console.error(`${t(lang, 'emergencyRestoreError')}:`, error);
            return null;
        }
    }

    /**
     * 現在の設定と投稿データをファイルに保存する。
     * @param settings 保存する設定オブジェクト
     * @param commitMessage 手動コミットメッセージ（オプショナル）
     */
    async save(settings: TweetWidgetSettings, lang: Language, commitMessage?: string): Promise<void> {
        console.log('[TweetRepository] save() 開始');
        console.log('[TweetRepository] ファイルパス:', this.dbPath);
        console.log('[TweetRepository] 設定データ概要:', {
            posts: settings.posts?.length || 0,
            scheduledPosts: settings.scheduledPosts?.length || 0,
            userId: settings.userId
        });
        
        // グローバルなファイルパス基準のロック
        const existingLock = fileSaveLocks.get(this.dbPath);
        if (existingLock) {
            console.log('[TweetRepository] 既存のロックを検出、待機中...');
            await existingLock;
            console.log('[TweetRepository] 既存ロック解除完了');
        }

        // 既に保存処理が進行中の場合は、それを待機
        if (this.saveInProgress && this.pendingSave) {
            console.log('[TweetRepository] 保存処理が既に進行中、待機中...');
            await this.pendingSave;
            console.log('[TweetRepository] 進行中の保存処理完了');
            return;
        }

        console.log('[TweetRepository] 新しい保存処理を開始');
        this.saveInProgress = true;
        this.pendingSave = this.performSave(settings, lang, commitMessage);
        fileSaveLocks.set(this.dbPath, this.pendingSave);
        
        try {
            console.log('[TweetRepository] performSave() 実行開始');
            await this.pendingSave;
            console.log('[TweetRepository] performSave() 実行完了');
        } catch (error) {
            console.error(`[TweetRepository] save() でエラー発生 - ファイル: ${this.dbPath}:`, error);
            console.error(`[TweetRepository] save() エラー詳細:`, error.stack);
        } finally {
            console.log('[TweetRepository] save() 後処理開始');
            this.saveInProgress = false;
            this.pendingSave = null;
            fileSaveLocks.delete(this.dbPath);
            console.log('[TweetRepository] save() 後処理完了');
        }
        console.log('[TweetRepository] save() 完了');
    }

    private async performSave(settings: TweetWidgetSettings, lang: Language, commitMessage?: string): Promise<void> {
        console.log('[TweetRepository] performSave() 開始');
        try {
            console.log('[TweetRepository] 設定サニタイズ開始');
            const sanitizedSettings = this.ensureSettingsSchema(settings);
            console.log('[TweetRepository] 設定サニタイズ完了');
            
            console.log('[TweetRepository] フォルダ確認開始');
            const lastSlash = this.dbPath.lastIndexOf('/');
            const folder = lastSlash !== -1 ? this.dbPath.substring(0, lastSlash) : '';

            if (folder) {
                await this.ensureFolderExists(folder);
            }
            console.log('[TweetRepository] フォルダ確認完了');

            // バージョン管理: 変更前のデータでコミット
            console.log('[TweetRepository] バージョン管理開始');
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
            console.log('[TweetRepository] バージョン管理完了');

            console.log('[TweetRepository] ファイル書き込み開始');
            const dataToSave = JSON.stringify(sanitizedSettings, null, 2);
            await this.app.vault.adapter.write(this.dbPath, dataToSave);
            console.log('[TweetRepository] ファイル書き込み完了');
            
            // 保存成功後、最新の設定を記録
            this.lastKnownSettings = sanitizedSettings;

            // バックアップシステム: データ保存後にバックアップ処理を実行
            console.log('[TweetRepository] バックアップ処理開始');
            try {
                console.log('[TweetRepository] BackupManager.onDataSave() 呼び出し開始');
                console.log('[TweetRepository] バックアップマネージャー存在確認:', !!this.backupManager);
                console.log('[TweetRepository] 渡すデータ:', {
                    posts: sanitizedSettings.posts?.length || 0,
                    scheduledPosts: sanitizedSettings.scheduledPosts?.length || 0,
                    keys: Object.keys(sanitizedSettings)
                });
                
                await this.backupManager.onDataSave(sanitizedSettings, commitMessage);
                
                console.log('[TweetRepository] BackupManager.onDataSave() 完了');
            } catch (backupError) {
                console.error('[TweetRepository] バックアップ処理エラー（保存は成功）:', backupError);
                console.error('[TweetRepository] バックアップエラー詳細:', backupError.stack);
            }
            console.log('[TweetRepository] バックアップ処理完了');
        } catch (e) {
            console.error("[TweetRepository] performSave() エラー:", e);
            console.error("[TweetRepository] performSave() エラー詳細:", e.stack);
            new Notice(t(lang, 'saveError'));
        }
        console.log('[TweetRepository] performSave() 完了');
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
    async getAvailableBackups(): Promise<BackupCollection> {
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
    async createManualBackup(lang: Language, type: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<boolean> {
        try {
            const currentSettings = this.lastKnownSettings || await this.load(lang);
            const result = await this.backupManager.createManualBackup(currentSettings, type);
            
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
            console.log(`[TweetRepository] 復元開始: バックアップID ${backupId}, 言語: ${lang}`);
            
            const result = await this.backupManager.restoreFromBackup(backupId);

            console.log(`[TweetRepository] バックアップマネージャー結果:`, {
                success: result.success,
                error: result.error,
                stats: result.stats,
                hasData: !!result.data
            });

            if (result.success && result.data) {
                console.log(`[TweetRepository] 復元成功: ${result.stats?.restoredPosts || 0}件の投稿を復元`);
                
                // 復元されたデータの妥当性を確認
                const posts = result.data.posts || [];
                const scheduledPosts = result.data.scheduledPosts || [];
                console.log(`[TweetRepository] 復元データ詳細: 投稿=${posts.length}件, スケジュール=${scheduledPosts.length}件`);
                console.log(`[TweetRepository] 復元データ構造:`, {
                    keys: Object.keys(result.data),
                    postsType: Array.isArray(posts) ? 'array' : typeof posts,
                    scheduledPostsType: Array.isArray(scheduledPosts) ? 'array' : typeof scheduledPosts
                });
                
                // データ保存実行
                console.log(`[TweetRepository] データ保存開始`);
                const saveMessage = `バックアップから復元: ${backupId.substring(0, 8)}`;
                console.log(`[TweetRepository] 保存メッセージ: ${saveMessage}`);
                
                await this.save(result.data, lang, saveMessage);
                console.log(`[TweetRepository] データ保存完了`);
                
                new Notice(`バックアップから復元しました: ${result.stats?.restoredPosts || 0}件の投稿`);
                console.log(`[TweetRepository] 復元処理完了 - 成功`);
                return true;
            } else {
                console.error(`[TweetRepository] 復元失敗: ${result.error}`);
                console.error(`[TweetRepository] 復元失敗の詳細:`, {
                    success: result.success,
                    hasData: !!result.data,
                    errorMessage: result.error,
                    stats: result.stats
                });
                new Notice(`復元に失敗しました: ${result.error || '不明なエラー'}`);
                return false;
            }
        } catch (error) {
            console.error('[TweetRepository] バックアップ復元エラー:', error);
            console.error('[TweetRepository] エラー詳細:', error.stack);
            
            // エラーの詳細情報を追加
            if (error instanceof Error) {
                console.error(`[TweetRepository] エラー名: ${error.name}`);
                console.error(`[TweetRepository] エラーメッセージ: ${error.message}`);
            }
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            new Notice(`復元に失敗しました: ${errorMessage}`);
            return false;
        }
    }

    /**
     * バックアップマネージャーを取得（UI用）
     */
    getBackupManager(): SimpleBackupManager {
        return this.backupManager;
    }

    /**
     * 緊急復元マネージャーを取得（UI用）
     */
    getEmergencyRecoveryManager(): EmergencyRecoveryManager {
        return this.emergencyRecovery;
    }

    /**
     * ブランチマネージャーを取得（UI用）
     */
    getBranchManager(): BranchManager {
        return this.branchManager;
    }

    /**
     * バックアップからブランチをチェックアウト
     */
    async checkoutFromBackup(backupId: string, lang: Language): Promise<boolean> {
        try {
            console.log(`[TweetRepository] バックアップからブランチチェックアウト: ${backupId}`);
            
            // バックアップデータを取得
            const result = await this.backupManager.restoreFromBackup(backupId);
            
            if (!result.success || !result.data) {
                console.error(`[TweetRepository] バックアップデータ取得失敗: ${result.error}`);
                return false;
            }
            
            // ブランチを作成してチェックアウト
            const checkoutResult = await this.branchManager.checkoutFromBackup(
                backupId,
                result.data,
                `バックアップ ${backupId} からのブランチ`
            );
            
            if (checkoutResult.success && checkoutResult.data) {
                console.log(`[TweetRepository] ブランチチェックアウト成功: ${checkoutResult.branchName}`);
                new Notice(`ブランチ '${checkoutResult.branchName}' にチェックアウトしました`);
                return true;
            } else {
                console.error(`[TweetRepository] ブランチチェックアウト失敗: ${checkoutResult.error}`);
                new Notice(`ブランチチェックアウトに失敗しました: ${checkoutResult.error}`);
                return false;
            }
            
        } catch (error) {
            console.error('[TweetRepository] ブランチチェックアウトエラー:', error);
            new Notice(`ブランチチェックアウトに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * ブランチを切り替え
     */
    async switchBranch(branchName: string): Promise<boolean> {
        try {
            console.log(`[TweetRepository] ブランチ切り替え: ${branchName}`);
            
            const result = await this.branchManager.checkoutBranch(branchName);
            
            if (result.success && result.data) {
                console.log(`[TweetRepository] ブランチ切り替え成功: ${branchName}`);
                new Notice(`ブランチ '${branchName}' に切り替えました`);
                return true;
            } else {
                console.error(`[TweetRepository] ブランチ切り替え失敗: ${result.error}`);
                new Notice(`ブランチ切り替えに失敗しました: ${result.error}`);
                return false;
            }
            
        } catch (error) {
            console.error('[TweetRepository] ブランチ切り替えエラー:', error);
            new Notice(`ブランチ切り替えに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * 現在のブランチのデータを取得
     */
    async getCurrentBranchData(): Promise<TweetWidgetSettings | null> {
        try {
            const branch = await this.branchManager.getCurrentBranch();
            return branch ? branch.data : null;
        } catch (error) {
            console.error('[TweetRepository] 現在ブランチデータ取得エラー:', error);
            return null;
        }
    }

    /**
     * デバッグ用：バックアップ状況を確認
     */
    async debugBackupStatus(lang: Language): Promise<void> {
        try {
            console.log(t(lang, 'debugInfoDebugHeader'));
            
            // バックアップ一覧を取得
            const backupInfo = await this.getAvailableBackups();
            console.log('利用可能なバックアップ:', backupInfo);
            
            // 各バックアップファイルの詳細確認
            for (const generation of backupInfo.generations) {
                await this.debugBackupFileContent(generation);
            }
            
            for (const incremental of backupInfo.incremental) {
                await this.debugBackupFileContent(incremental);
            }
            
            // BackupManagerの状況確認
            const backupManager = this.getBackupManager();
            console.log('BackupManager 初期化済み:', !!backupManager);
            
            // 緊急復元マネージャーの状況確認
            const emergencyManager = this.getEmergencyRecoveryManager();
            console.log('EmergencyRecoveryManager 初期化済み:', !!emergencyManager);
            
        } catch (error) {
            console.error(t(lang, 'debugInfoError'), error);
            new Notice(`${t(lang, 'debugInfoFailed')}: ${error instanceof Error ? error.message : String(error)}`);
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