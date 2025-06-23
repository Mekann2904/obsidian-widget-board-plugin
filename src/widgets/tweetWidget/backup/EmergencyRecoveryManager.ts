import { App, Notice } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { BackupFileInfo, BackupIndex } from './types';
import { TweetVersionControl } from '../versionControl/TweetVersionControl';
import { BackupUtils } from './BackupUtils';
import { DEFAULT_BACKUP_CONFIG } from './types';

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
    private backupPath: string;
    private versionControl: TweetVersionControl;

    constructor(app: App, dbPath: string) {
        this.app = app;
        this.dbPath = dbPath;
        this.basePath = dbPath.replace('/tweets.json', '');
        this.backupPath = `${this.basePath}/backups`;
        this.versionControl = new TweetVersionControl(app, dbPath);
    }

    /**
     * バックアップインデックスを読み込む
     */
    private async loadBackupIndex(): Promise<BackupIndex> {
        const indexPath = `${this.backupPath}/index.json`;
        try {
            const exists = await this.app.vault.adapter.exists(indexPath);
            if (!exists) {
                return {
                    version: "1.0.0",
                    lastUpdated: 0,
                    config: DEFAULT_BACKUP_CONFIG,
                    backups: {
                        generations: [],
                        incremental: []
                    },
                    statistics: {
                        totalBackups: 0,
                        totalSize: 0,
                        corruptedBackups: []
                    }
                };
            }
            const jsonData = await this.app.vault.adapter.read(indexPath);
            return JSON.parse(jsonData) as BackupIndex;
        } catch (error) {
            console.error('バックアップインデックス読み込みエラー:', error);
            return {
                version: "1.0.0",
                lastUpdated: 0,
                config: DEFAULT_BACKUP_CONFIG,
                backups: {
                    generations: [],
                    incremental: []
                },
                statistics: {
                    totalBackups: 0,
                    totalSize: 0,
                    corruptedBackups: []
                }
            };
        }
    }

    /**
     * 復元可能なソースを検出して一覧を取得
     */
    async detectAndFindRecoverySources(): Promise<RecoverySource[]> {
        console.log('[EmergencyRecoveryManager] 復元ソース検索開始');
        const sources: RecoverySource[] = [];

        // バックアップインデックスを読み込む
        const index = await this.loadBackupIndex();

        // 世代バックアップを検索
        console.log('[EmergencyRecoveryManager] 世代バックアップ検索開始');
        const generationSources = await this.findGenerationBackupSources(index);
        console.log(`[EmergencyRecoveryManager] 世代バックアップ: ${generationSources.length}件`);
        sources.push(...generationSources);

        // 差分バックアップを検索
        console.log('[EmergencyRecoveryManager] 差分バックアップ検索開始');
        const incrementalSources = await this.findIncrementalBackupSources(index);
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
     * 世代バックアップソースを検索
     */
    private async findGenerationBackupSources(index: BackupIndex): Promise<RecoverySource[]> {
        const sources: RecoverySource[] = [];
        
        for (const backup of index.backups.generations) {
            if (await this.isBackupValid(backup)) {
                sources.push({
                    id: backup.id,
                    type: 'generation',
                    name: `世代バックアップ (${backup.type})`,
                    timestamp: backup.timestamp,
                    description: backup.description || `${backup.type}バックアップ`,
                    confidence: 'high'
                });
            }
        }

        return sources;
    }

    /**
     * 差分バックアップソースを検索
     */
    private async findIncrementalBackupSources(index: BackupIndex): Promise<RecoverySource[]> {
        const sources: RecoverySource[] = [];
        
        for (const backup of index.backups.incremental) {
            if (await this.isBackupValid(backup)) {
                sources.push({
                    id: backup.id,
                    type: 'incremental',
                    name: '差分バックアップ',
                    timestamp: backup.timestamp,
                    description: backup.description || '差分バックアップ',
                    confidence: 'medium'
                });
            }
        }

        return sources;
    }

    /**
     * バックアップファイルの有効性を確認
     */
    private async isBackupValid(backup: BackupFileInfo): Promise<boolean> {
        try {
            const exists = await this.app.vault.adapter.exists(backup.filePath);
            if (!exists) return false;

            const content = await this.app.vault.adapter.read(backup.filePath);
            const checksum = BackupUtils.calculateChecksum(content);
            return checksum === backup.checksum;
        } catch (error) {
            console.error('バックアップ検証エラー:', error);
            return false;
        }
    }

    /**
     * バージョン管理ソースを検索
     */
    private async findVersionControlSources(): Promise<RecoverySource[]> {
        try {
            const history = await this.versionControl.getHistory();
            if (!history || history.length === 0) return [];

            return history.map(entry => ({
                id: entry.commit.id,
                type: 'version-control' as const,
                name: 'バージョン管理',
                timestamp: entry.commit.timestamp,
                description: `バージョン管理 - ${entry.commit.message || '変更なし'}`,
                confidence: 'medium'
            }));

        } catch (error) {
            console.warn('バージョン管理検索エラー:', error);
            return [];
        }
    }

    /**
     * 破損バックアップを検索
     */
    private async findCorruptedBackupSources(): Promise<RecoverySource[]> {
        try {
            const index = await this.loadBackupIndex();
            const corruptedBackups = index.statistics.corruptedBackups || [];
            
            return corruptedBackups.map(backupId => ({
                id: backupId,
                type: 'corrupted-backup' as const,
                name: '破損バックアップ',
                timestamp: Date.now(), // 破損バックアップの場合、正確なタイムスタンプは不明
                description: `破損バックアップ - ${backupId}`,
                confidence: 'low'
            }));

        } catch (error) {
            console.warn('破損バックアップ検索エラー:', error);
            return [];
        }
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
     * 世代バックアップから復元
     */
    private async recoverFromGenerationBackup(backupId: string): Promise<TweetWidgetSettings | null> {
        try {
            const index = await this.loadBackupIndex();
            const backup = index.backups.generations.find(b => b.id === backupId);
            if (!backup) throw new Error('バックアップが見つかりません');

            const content = await this.app.vault.adapter.read(backup.filePath);
            return JSON.parse(content) as TweetWidgetSettings;

        } catch (error) {
            console.error('世代バックアップ復元エラー:', error);
            return null;
        }
    }

    /**
     * 差分バックアップから復元
     */
    private async recoverFromIncrementalBackup(backupId: string): Promise<TweetWidgetSettings | null> {
        try {
            const index = await this.loadBackupIndex();
            const backup = index.backups.incremental.find(b => b.id === backupId);
            if (!backup) throw new Error('バックアップが見つかりません');

            const content = await this.app.vault.adapter.read(backup.filePath);
            return JSON.parse(content) as TweetWidgetSettings;

        } catch (error) {
            console.error('差分バックアップ復元エラー:', error);
            return null;
        }
    }

    /**
     * バージョン管理から復元
     */
    private async recoverFromVersionControl(commitId: string): Promise<TweetWidgetSettings | null> {
        try {
            const history = await this.versionControl.getHistory();
            const targetCommit = history.find(entry => entry.commit.id === commitId);
            if (!targetCommit || !targetCommit.commit.settingsSnapshot) {
                throw new Error('コミットが見つからないか、スナップショットがありません');
            }
            return targetCommit.commit.settingsSnapshot as TweetWidgetSettings;

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
            const data = JSON.parse(content) as TweetWidgetSettings;

            // 最低限の検証
            if (!data || !data.posts) {
                throw new Error('無効なデータ形式');
            }

            return data;

        } catch (error) {
            console.error('破損バックアップ復元エラー:', error);
            return null;
        }
    }

    /**
     * 復元したデータを保存
     */
    private async saveRecoveredData(data: TweetWidgetSettings): Promise<void> {
        try {
            await this.app.vault.adapter.write(this.dbPath, JSON.stringify(data, null, 2));
            new Notice('データを復元しました');
        } catch (error) {
            console.error('データ保存エラー:', error);
            throw error;
        }
    }

    /**
     * 緊急復元が必要かどうかを判定
     */
    async needsEmergencyRecovery(): Promise<boolean> {
        try {
            const exists = await this.app.vault.adapter.exists(this.dbPath);
            if (!exists) return true;

            const content = await this.app.vault.adapter.read(this.dbPath);
            const data = JSON.parse(content) as TweetWidgetSettings;
            return !data || !data.posts;

        } catch (error) {
            console.error('ファイル検証エラー:', error);
            return true;
        }
    }
} 