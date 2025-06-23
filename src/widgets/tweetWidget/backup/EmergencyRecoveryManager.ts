import { App, Notice } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { BackupFileInfo } from './types';
import { BackupManager } from './BackupManager';
import { TweetVersionControl } from '../versionControl/TweetVersionControl';
import type { HistoryEntry } from '../versionControl/types';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../constants';

/**
 * 緊急復元ソース
 */
export interface RecoverySource {
    id: string;
    type: 'generation' | 'incremental' | 'version-control' | 'corrupted-backup';
    name: string;
    timestamp: number;
    description: string;
    confidence: 'high' | 'medium' | 'low'; // 復元信頼度
    dataPreview?: {
        postCount: number;
        lastModified: number;
        hasScheduled: boolean;
    };
}

/**
 * 復元結果
 */
export interface RecoveryResult {
    success: boolean;
    recoveredData?: TweetWidgetSettings;
    source: RecoverySource;
    error?: string;
    stats: {
        recoveredPosts: number;
        recoveredScheduled: number;
        processingTime: number;
    };
}

/**
 * 緊急復元マネージャー
 * tweets.jsonが削除された場合の自動復元機能
 */
export class EmergencyRecoveryManager {
    private app: App;
    private basePath: string;
    private dbPath: string;
    private backupManager: BackupManager;
    private versionControl: TweetVersionControl;

    constructor(app: App, dbPath: string) {
        this.app = app;
        this.dbPath = dbPath;
        this.basePath = dbPath.replace('/tweets.json', '');
        this.backupManager = new BackupManager(app, this.basePath);
        this.versionControl = new TweetVersionControl(app, dbPath);
    }

    /**
     * 復元可能なソースを検出して一覧を取得
     */
    async detectAndFindRecoverySources(): Promise<RecoverySource[]> {
        console.log('[EmergencyRecoveryManager] 復元ソース検索開始');
        const sources: RecoverySource[] = [];

        // 世代バックアップを検索
        console.log('[EmergencyRecoveryManager] 世代バックアップ検索開始');
        const generationSources = await this.findGenerationBackupSources();
        console.log(`[EmergencyRecoveryManager] 世代バックアップ: ${generationSources.length}件`);
        sources.push(...generationSources);

        // 差分バックアップを検索
        console.log('[EmergencyRecoveryManager] 差分バックアップ検索開始');
        const incrementalSources = await this.findIncrementalBackupSources();
        console.log(`[EmergencyRecoveryManager] 差分バックアップ: ${incrementalSources.length}件`);
        sources.push(...incrementalSources);

        // バージョン管理を検索
        console.log('[EmergencyRecoveryManager] バージョン管理検索開始');
        const versionSources = await this.findVersionControlSources();
        console.log(`[EmergencyRecoveryManager] バージョン管理: ${versionSources.length}件`);
        sources.push(...versionSources);

        // 破損バックアップを検索
        console.log('[EmergencyRecoveryManager] 破損バックアップ検索開始');
        const corruptedSources = await this.findCorruptedBackupSources();
        console.log(`[EmergencyRecoveryManager] 破損バックアップ: ${corruptedSources.length}件`);
        sources.push(...corruptedSources);

        // 信頼度と日時でソート（高信頼度、新しい順）
        sources.sort((a, b) => {
            const confidenceOrder = { high: 3, medium: 2, low: 1 };
            const confidenceDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
            if (confidenceDiff !== 0) return confidenceDiff;
            return b.timestamp - a.timestamp;
        });

        console.log(`[EmergencyRecoveryManager] 復元ソース検索完了: 合計${sources.length}件`);
        sources.forEach((source, index) => {
            console.log(`[EmergencyRecoveryManager] ソース${index + 1}: ${source.name} (${source.confidence}, ${new Date(source.timestamp).toLocaleString()})`);
        });

        return sources;
    }

    /**
     * 最も適切なソースから自動復元を実行
     */
    async performAutoRecovery(): Promise<RecoveryResult | null> {
        try {
            const sources = await this.detectAndFindRecoverySources();
            
            if (sources.length === 0) {
                console.warn('[EmergencyRecoveryManager] 復元可能なソースが見つかりません');
                return null;
            }

            // 最も信頼度の高いソースから復元を試行
            const bestSource = sources[0];
            console.log(`[EmergencyRecoveryManager] 自動復元開始: ${bestSource.name}`);

            return await this.recoverFromSource(bestSource);

        } catch (error) {
            console.error('[EmergencyRecoveryManager] 自動復元エラー:', error);
            return null;
        }
    }

    /**
     * 指定されたソースから復元
     */
    async recoverFromSource(source: RecoverySource): Promise<RecoveryResult> {
        const startTime = Date.now();

        try {
            let recoveredData: TweetWidgetSettings | null = null;

            switch (source.type) {
                case 'generation':
                    recoveredData = await this.recoverFromGenerationBackup(source.id);
                    break;

                case 'incremental':
                    recoveredData = await this.recoverFromIncrementalBackup(source.id);
                    break;

                case 'version-control':
                    recoveredData = await this.recoverFromVersionControl(source.id);
                    break;

                case 'corrupted-backup':
                    recoveredData = await this.recoverFromCorruptedBackup(source.id);
                    break;

                default:
                    throw new Error(`未対応の復元タイプ: ${source.type}`);
            }

            if (!recoveredData) {
                throw new Error('データの復元に失敗しました');
            }

            // メインファイルに復元
            await this.saveRecoveredData(recoveredData);

            const processingTime = Date.now() - startTime;

            return {
                success: true,
                recoveredData: recoveredData,
                source: source,
                stats: {
                    recoveredPosts: recoveredData.posts?.length || 0,
                    recoveredScheduled: recoveredData.scheduledPosts?.length || 0,
                    processingTime: processingTime
                }
            };

        } catch (error) {
            console.error(`復元エラー (${source.name}):`, error);
            return {
                success: false,
                source: source,
                error: error instanceof Error ? error.message : String(error),
                stats: {
                    recoveredPosts: 0,
                    recoveredScheduled: 0,
                    processingTime: Date.now() - startTime
                }
            };
        }
    }

    /**
     * 世代バックアップソースを検索
     */
    private async findGenerationBackupSources(): Promise<RecoverySource[]> {
        try {
            console.log('[EmergencyRecoveryManager] BackupManager.getAvailableBackups()呼び出し');
            const backups = await this.backupManager.getAvailableBackups();
            console.log(`[EmergencyRecoveryManager] 取得したバックアップ: 世代=${backups.generations.length}件, 差分=${backups.incremental.length}件`);
            
            if (backups.generations.length > 0) {
                console.log('[EmergencyRecoveryManager] 世代バックアップ詳細:');
                backups.generations.forEach((backup, index) => {
                    console.log(`[EmergencyRecoveryManager] - ${index + 1}: ID=${backup.id}, 期間=${backup.generation?.period}, 時刻=${new Date(backup.timestamp).toLocaleString()}`);
                });
            }
            
            return backups.generations.map(backup => ({
                id: backup.id,
                type: 'generation' as const,
                name: `世代バックアップ (${backup.generation?.period})`,
                timestamp: backup.timestamp,
                description: `${backup.generation?.period}バックアップ - ${new Date(backup.timestamp).toLocaleString()}`,
                confidence: 'high' as const,
                dataPreview: {
                    postCount: 0, // 世代バックアップでは投稿数は不明
                    lastModified: backup.timestamp,
                    hasScheduled: false // 世代バックアップではスケジュール情報は不明
                }
            }));

        } catch (error) {
            console.error('[EmergencyRecoveryManager] 世代バックアップ検索エラー:', error);
            return [];
        }
    }

    /**
     * 差分バックアップソースを検索
     */
    private async findIncrementalBackupSources(): Promise<RecoverySource[]> {
        try {
            const backups = await this.backupManager.getAvailableBackups();
            
            return backups.incremental.map(backup => ({
                id: backup.id,
                type: 'incremental' as const,
                name: `差分バックアップ`,
                timestamp: backup.timestamp,
                description: `差分バックアップ - ${backup.incremental?.changedPostsCount || 0}件の変更`,
                confidence: 'medium' as const,
                dataPreview: {
                    postCount: backup.incremental?.changedPostsCount || 0,
                    lastModified: backup.timestamp,
                    hasScheduled: false
                }
            }));

        } catch (error) {
            console.warn('差分バックアップ検索エラー:', error);
            return [];
        }
    }

    /**
     * バージョン管理ソースを検索
     */
    private async findVersionControlSources(): Promise<RecoverySource[]> {
        try {
            const history = await this.versionControl.getHistory(10);
            
            return history.map(entry => ({
                id: entry.commit.id,
                type: 'version-control' as const,
                name: `コミット ${entry.commit.id.substring(0, 8)}`,
                timestamp: entry.commit.timestamp,
                description: `${entry.displayMessage} - ${entry.summary}`,
                confidence: 'high' as const,
                dataPreview: {
                    postCount: entry.commit.settingsSnapshot?.posts?.length || 0,
                    lastModified: entry.commit.timestamp,
                    hasScheduled: (entry.commit.settingsSnapshot?.scheduledPosts?.length || 0) > 0
                }
            }));

        } catch (error) {
            console.warn('バージョン管理検索エラー:', error);
            return [];
        }
    }

    /**
     * 破損バックアップソースを検索
     */
    private async findCorruptedBackupSources(): Promise<RecoverySource[]> {
        try {
            const sources: RecoverySource[] = [];
            
            // .bak_ ファイルを検索
            const files = await this.findBackupFiles();
            
            for (const file of files) {
                if (file.path.includes('.bak_')) {
                    sources.push({
                        id: file.path,
                        type: 'corrupted-backup',
                        name: `破損バックアップ ${file.path.split('.bak_')[1]?.substring(0, 8)}`,
                        timestamp: file.stat?.mtime || 0,
                        description: `破損データのバックアップファイル`,
                        confidence: 'low'
                    });
                }
            }

            return sources;

        } catch (error) {
            console.warn('破損バックアップ検索エラー:', error);
            return [];
        }
    }

    /**
     * バックアップファイルを検索
     */
    private async findBackupFiles(): Promise<Array<{ path: string; stat?: any }>> {
        try {
            const baseFolderPath = this.basePath;
            const files: Array<{ path: string; stat?: any }> = [];

            // ベースフォルダ内のファイルを検索
            try {
                const folderFiles = await this.app.vault.adapter.list(baseFolderPath);
                for (const file of folderFiles.files) {
                    if (file.includes('tweets') && (file.includes('.bak') || file.includes('.json'))) {
                        const stat = await this.app.vault.adapter.stat(file);
                        files.push({ path: file, stat });
                    }
                }
            } catch (error) {
                // フォルダが存在しない場合は無視
            }

            return files;

        } catch (error) {
            console.warn('ファイル検索エラー:', error);
            return [];
        }
    }

    /**
     * 世代バックアップから復元
     */
    private async recoverFromGenerationBackup(backupId: string): Promise<TweetWidgetSettings | null> {
        const result = await this.backupManager.restoreFromBackup({
            backupId: backupId,
            type: 'full',
            createCurrentBackup: false,
            verifyIntegrity: true
        });

        return result.success ? result.restoredData || null : null;
    }

    /**
     * 差分バックアップから復元
     */
    private async recoverFromIncrementalBackup(backupId: string): Promise<TweetWidgetSettings | null> {
        const result = await this.backupManager.restoreFromBackup({
            backupId: backupId,
            type: 'incremental',
            createCurrentBackup: false,
            verifyIntegrity: true
        });

        return result.success ? result.restoredData || null : null;
    }

    /**
     * バージョン管理から復元
     */
    private async recoverFromVersionControl(commitId: string): Promise<TweetWidgetSettings | null> {
        try {
            const restoredPosts = await this.versionControl.restore({
                commitId: commitId,
                createBackup: false
            });

            return {
                ...DEFAULT_TWEET_WIDGET_SETTINGS,
                posts: restoredPosts
            };

        } catch (error) {
            console.error('バージョン管理復元エラー:', error);
            return null;
        }
    }

    /**
     * 破損バックアップから復元
     */
    private async recoverFromCorruptedBackup(filePath: string): Promise<TweetWidgetSettings | null> {
        try {
            const content = await this.app.vault.adapter.read(filePath);
            const data = JSON.parse(content);
            
            // データの基本的な検証
            if (data && typeof data === 'object') {
                return {
                    ...DEFAULT_TWEET_WIDGET_SETTINGS,
                    ...data
                };
            }

            return null;

        } catch (error) {
            console.error('破損バックアップ復元エラー:', error);
            return null;
        }
    }

    /**
     * 復元されたデータをメインファイルに保存
     */
    private async saveRecoveredData(data: TweetWidgetSettings): Promise<void> {
        // フォルダを確保
        const folder = this.basePath;
        const exists = await this.app.vault.adapter.exists(folder);
        if (!exists) {
            await this.app.vault.adapter.mkdir(folder);
        }

        // データを保存
        const jsonData = JSON.stringify(data, null, 2);
        await this.app.vault.adapter.write(this.dbPath, jsonData);

        console.log(`緊急復元完了: ${this.dbPath}`);
    }

    /**
     * 緊急復元が必要かチェック
     */
    async needsEmergencyRecovery(): Promise<boolean> {
        const exists = await this.app.vault.adapter.exists(this.dbPath);
        return !exists;
    }
} 