import { App } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { 
    BackupFileInfo, 
    BackupResult, 
    GenerationBackupConfig,
    BackupIndex
} from './types';
import { DiffCalculator } from '../versionControl/DiffCalculator';
import type { TweetDiff } from '../versionControl/types';

/**
 * 差分バックアップマネージャー
 * 各保存時の増分差分を管理
 */
export class IncrementalBackupManager {
    private app: App;
    private basePath: string;
    private backupPath: string;
    private diffCalculator: DiffCalculator;

    constructor(app: App, basePath: string) {
        this.app = app;
        this.basePath = basePath;
        this.backupPath = `${basePath}/backups`;
        this.diffCalculator = new DiffCalculator();
    }

    /**
     * 差分バックアップを作成
     */
    async createIncrementalBackup(
        currentData: TweetWidgetSettings,
        previousData: TweetWidgetSettings,
        config: GenerationBackupConfig
    ): Promise<BackupResult> {
        const startTime = Date.now();
        
        try {
            // バックアップディレクトリを確保
            await this.ensureBackupDirectories();
            
            // 差分を計算
            const diffs = DiffCalculator.calculateDiffs(previousData.posts || [], currentData.posts || []);
            
            // 変更がない場合はスキップ
            if (diffs.length === 0) {
                return {
                    success: true,
                    stats: {
                        processedPosts: 0,
                        createdFiles: 0,
                        totalSize: 0,
                        processingTime: Date.now() - startTime
                    }
                };
            }
            
            // バックアップIDを生成
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const hash = this.generateHash(JSON.stringify(diffs));
            const backupId = `incr_${timestamp}_${hash}`;
            
            // ファイルパスを決定
            const fileName = `${timestamp}-${hash}.diff`;
            const filePath = `${this.backupPath}/incremental/${fileName}`;
            
            // ベースバックアップIDを検索
            const baseBackupId = await this.findLatestGenerationBackup();
            
            // 差分データを準備
            const incrementalData = {
                version: "1.0.0",
                type: "incremental",
                timestamp: Date.now(),
                baseBackupId: baseBackupId,
                diffs: diffs,
                metadata: {
                    changedPosts: diffs.length,
                    createdBy: 'IncrementalBackupManager',
                    originalPath: `${this.basePath}/tweets.json`
                }
            };
            
            // ファイルに書き込み
            const jsonData = JSON.stringify(incrementalData, null, 2);
            await this.app.vault.adapter.write(filePath, jsonData);
            
            // チェックサムを計算
            const checksum = await this.calculateChecksum(jsonData);
            
            // ファイル情報を作成
            const fileInfo: BackupFileInfo = {
                id: backupId,
                type: 'incremental',
                filePath: filePath,
                timestamp: Date.now(),
                size: jsonData.length,
                checksum: checksum,
                compressed: false,
                incremental: {
                    baseBackupId: baseBackupId || 'none',
                    changedPostsCount: diffs.length,
                    diffSize: jsonData.length
                }
            };
            
            // インデックスを更新
            await this.updateBackupIndex(fileInfo);
            
            // 古い差分バックアップをクリーンアップ
            await this.cleanupOldIncrementalBackups(config);
            
            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                backupId: backupId,
                filePath: filePath,
                stats: {
                    processedPosts: diffs.length,
                    createdFiles: 1,
                    totalSize: jsonData.length,
                    processingTime: processingTime
                }
            };
            
        } catch (error) {
            console.error('差分バックアップ作成エラー:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stats: {
                    processedPosts: 0,
                    createdFiles: 0,
                    totalSize: 0,
                    processingTime: Date.now() - startTime
                }
            };
        }
    }

    /**
     * 利用可能な差分バックアップを取得
     */
    async getAvailableIncrementalBackups(): Promise<BackupFileInfo[]> {
        try {
            const index = await this.loadBackupIndex();
            return index.backups
                .filter(backup => backup.incremental)
                .sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            console.error('差分バックアップ一覧取得エラー:', error);
            return [];
        }
    }

    /**
     * 差分バックアップチェーンから復元
     */
    async restoreFromIncrementalChain(targetBackupId: string): Promise<TweetWidgetSettings | null> {
        try {
            const index = await this.loadBackupIndex();
            
            // ベースバックアップを特定
            const baseBackup = await this.findBaseBackupForChain(targetBackupId);
            if (!baseBackup) {
                throw new Error('ベースバックアップが見つかりません');
            }
            
            // ベースデータを読み込み
            let currentData = await this.loadGenerationBackup(baseBackup.id);
            if (!currentData) {
                throw new Error('ベースバックアップの読み込みに失敗しました');
            }
            
            // 差分チェーンを取得
            const diffChain = await this.buildDiffChain(baseBackup.id, targetBackupId);
            
            // 差分を順次適用
            for (const diffBackup of diffChain) {
                const diffsData = await this.loadIncrementalBackup(diffBackup.id);
                if (diffsData && currentData.posts) {
                    currentData.posts = DiffCalculator.applyDiffs(currentData.posts, diffsData);
                }
            }
            
            return currentData;
            
        } catch (error) {
            console.error('差分バックアップ復元エラー:', error);
            return null;
        }
    }

    /**
     * 差分チェーンのベースバックアップを特定
     */
    private async findBaseBackupForChain(targetBackupId: string): Promise<BackupFileInfo | null> {
        try {
            const index = await this.loadBackupIndex();
            const targetBackup = index.backups.find(b => b.id === targetBackupId);
            
            if (!targetBackup?.incremental) {
                return null;
            }
            
            // ベースバックアップを検索
            const baseBackup = index.backups.find(b => b.id === targetBackup.incremental!.baseBackupId);
            return baseBackup || null;
            
        } catch (error) {
            console.error('ベースバックアップ検索エラー:', error);
            return null;
        }
    }

    /**
     * 差分チェーンを構築
     */
    private async buildDiffChain(baseBackupId: string, targetBackupId: string): Promise<BackupFileInfo[]> {
        try {
            const index = await this.loadBackupIndex();
            const incrementalBackups = index.backups
                .filter(b => b.incremental && b.incremental.baseBackupId === baseBackupId)
                .sort((a, b) => a.timestamp - b.timestamp);
                
            // 対象バックアップまでのチェーンを構築
            const targetIndex = incrementalBackups.findIndex(b => b.id === targetBackupId);
            if (targetIndex >= 0) {
                return incrementalBackups.slice(0, targetIndex + 1);
            }
            
            return [];
            
        } catch (error) {
            console.error('差分チェーン構築エラー:', error);
            return [];
        }
    }

    /**
     * 世代バックアップを読み込み
     */
    private async loadGenerationBackup(backupId: string): Promise<TweetWidgetSettings | null> {
        try {
            const index = await this.loadBackupIndex();
            const backup = index.backups.find(b => b.id === backupId);
            
            if (!backup?.generation) {
                return null;
            }
            
            const jsonData = await this.app.vault.adapter.read(backup.filePath);
            const backupData = JSON.parse(jsonData);
            return backupData.data as TweetWidgetSettings;
            
        } catch (error) {
            console.error('世代バックアップ読み込みエラー:', error);
            return null;
        }
    }

    /**
     * 差分バックアップを読み込み
     */
    private async loadIncrementalBackup(backupId: string): Promise<TweetDiff[] | null> {
        try {
            const index = await this.loadBackupIndex();
            const backup = index.backups.find(b => b.id === backupId);
            
            if (!backup?.incremental) {
                return null;
            }
            
            const jsonData = await this.app.vault.adapter.read(backup.filePath);
            const backupData = JSON.parse(jsonData);
            return backupData.diffs as TweetDiff[];
            
        } catch (error) {
            console.error('差分バックアップ読み込みエラー:', error);
            return null;
        }
    }

    /**
     * バックアップディレクトリを確保
     */
    private async ensureBackupDirectories(): Promise<void> {
        const incrementalPath = `${this.backupPath}/incremental`;
        const exists = await this.app.vault.adapter.exists(incrementalPath);
        if (!exists) {
            await this.app.vault.adapter.mkdir(incrementalPath);
        }
    }



    /**
     * ハッシュを生成
     */
    private generateHash(data: string): string {
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).substring(0, 8);
    }

    /**
     * 最新の世代バックアップを検索
     */
    private async findLatestGenerationBackup(): Promise<string | undefined> {
        try {
            const index = await this.loadBackupIndex();
            const generationBackups = index.backups
                .filter(b => b.generation)
                .sort((a, b) => b.timestamp - a.timestamp);
                
            return generationBackups[0]?.id;
        } catch (error) {
            return undefined;
        }
    }

    /**
     * バックアップインデックスを更新
     */
    private async updateBackupIndex(newBackup: BackupFileInfo): Promise<void> {
        try {
            const index = await this.loadBackupIndex();
            index.backups.push(newBackup);
            
            // 統計を更新
            index.statistics.totalBackups = index.backups.length;
            index.statistics.totalSize = index.backups.reduce((sum, b) => sum + b.size, 0);
            index.statistics.newestBackup = Math.max(...index.backups.map(b => b.timestamp));
            index.statistics.oldestBackup = Math.min(...index.backups.map(b => b.timestamp));
            index.lastUpdated = Date.now();
            
            // インデックスファイルを保存
            const indexPath = `${this.backupPath}/index.json`;
            await this.app.vault.adapter.write(indexPath, JSON.stringify(index, null, 2));
            
        } catch (error) {
            console.error('バックアップインデックス更新エラー:', error);
            throw error;
        }
    }

    /**
     * バックアップインデックスを読み込み
     */
    private async loadBackupIndex(): Promise<BackupIndex> {
        const indexPath = `${this.backupPath}/index.json`;
        
        try {
            const exists = await this.app.vault.adapter.exists(indexPath);
            if (!exists) {
                // 初期インデックスを作成
                const initialIndex: BackupIndex = {
                    version: "1.0.0",
                    lastUpdated: Date.now(),
                    config: {
                        daily: { enabled: true, retentionDays: 30, createTime: "02:00" },
                        weekly: { enabled: true, retentionWeeks: 12, dayOfWeek: 0, createTime: "02:30" },
                        monthly: { enabled: true, retentionMonths: 12, dayOfMonth: 1, createTime: "03:00" },
                        incremental: { enabled: true, maxCount: 1000, compressAfterDays: 7 }
                    },
                    backups: [],
                    statistics: {
                        totalBackups: 0,
                        totalSize: 0,
                        corruptedBackups: []
                    }
                };
                
                await this.app.vault.adapter.write(indexPath, JSON.stringify(initialIndex, null, 2));
                return initialIndex;
            }
            
            const jsonData = await this.app.vault.adapter.read(indexPath);
            return JSON.parse(jsonData) as BackupIndex;
            
        } catch (error) {
            console.error('バックアップインデックス読み込みエラー:', error);
            throw error;
        }
    }

    /**
     * 古い差分バックアップをクリーンアップ
     */
    private async cleanupOldIncrementalBackups(config: GenerationBackupConfig): Promise<void> {
        try {
            const index = await this.loadBackupIndex();
            const incrementalBackups = index.backups
                .filter(b => b.incremental)
                .sort((a, b) => b.timestamp - a.timestamp);
                
            // 最大数を超えた古いバックアップを削除
            if (incrementalBackups.length > config.incremental.maxCount) {
                const toDelete = incrementalBackups.slice(config.incremental.maxCount);
                
                for (const backup of toDelete) {
                    try {
                        await this.app.vault.adapter.remove(backup.filePath);
                        index.backups = index.backups.filter(b => b.id !== backup.id);
                    } catch (error) {
                        console.warn(`差分バックアップファイル削除に失敗: ${backup.filePath}`, error);
                    }
                }
                
                // インデックスを更新
                if (toDelete.length > 0) {
                    const indexPath = `${this.backupPath}/index.json`;
                    await this.app.vault.adapter.write(indexPath, JSON.stringify(index, null, 2));
                }
            }
            
        } catch (error) {
            console.error('差分バックアップクリーンアップエラー:', error);
        }
    }

    /**
     * チェックサムを計算
     */
    private async calculateChecksum(data: string): Promise<string> {
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }
}
