import { App } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { 
    BackupFileInfo, 
    BackupIndex, 
    BackupCollection, 
    RestoreResult, 
    BackupResult,
    GenerationBackupConfig 
} from './types';
import { DEFAULT_BACKUP_CONFIG } from './types';
import { BackupUtils } from './BackupUtils';

/**
 * シンプルで確実なバックアップマネージャー
 * 複雑な条件分岐を排除し、確実にバックアップを作成する
 */
export class SimpleBackupManager {
    // 既存のBackupManagerとの互換性のためのプロパティ
    public lastSaveData: TweetWidgetSettings | null = null;
    public generationManager: any = null;
    public incrementalManager: any = null;
    public isPerformanceOptimizationEnabled: boolean = true;
    private app: App;
    private basePath: string;
    private backupPath: string;
    private config: GenerationBackupConfig;
    private backupCounter: number = 0;

    constructor(app: App, basePath: string) {
        this.app = app;
        this.basePath = basePath;
        // バックアップファイルを.obsidianディレクトリ内のプラグイン専用フォルダに保存
        this.backupPath = `${app.vault.configDir}/plugins/obsidian-widget-board-plugin/backups`;
        this.config = DEFAULT_BACKUP_CONFIG;
        
        console.log('[SimpleBackupManager] 初期化完了');
    }

    /**
     * データ保存時に呼び出される - シンプルなバックアップ作成
     */
    async onDataSave(currentData: TweetWidgetSettings, commitMessage?: string): Promise<void> {
        console.log('[SimpleBackupManager] onDataSave() 開始', { commitMessage });
        
        try {
            await this.ensureBackupDirectory();
            const index = await this.loadBackupIndex();
            
            // lastSaveDataを更新（互換性のため）
            this.lastSaveData = JSON.parse(JSON.stringify(currentData));
            
            // 1. 常に増分バックアップを作成（シンプル）
            if (this.config.incremental.enabled) {
                await this.createIncrementalBackup(currentData, commitMessage || 'auto-save');
            }
            
            // 2. 定期的な世代バックアップをチェック
            await this.checkAndCreateGenerationBackups(currentData, index);
            
            console.log('[SimpleBackupManager] onDataSave() 完了');
        } catch (error) {
            console.error('[SimpleBackupManager] onDataSave() エラー:', error);
        }
    }

    /**
     * 増分バックアップを毎回作成（シンプル）
     */
    private async createIncrementalBackup(data: TweetWidgetSettings, reason: string): Promise<void> {
        try {
            this.backupCounter++;
            const timestamp = Date.now();
            const backupId = `inc_${timestamp}_${this.backupCounter}`;
            const filePath = `${this.backupPath}/incremental/${backupId}.json`;
            
            await BackupUtils.ensureDirectory(this.app, `${this.backupPath}/incremental`);

            const backupData = {
                id: backupId,
                type: "incremental",
                timestamp: timestamp,
                reason: reason,
                data: data,
                checksum: BackupUtils.calculateChecksum(JSON.stringify(data))
            };

            const jsonData = JSON.stringify(backupData, null, 2);
            await this.app.vault.adapter.write(filePath, jsonData);

            const fileInfo: BackupFileInfo = {
                id: backupId,
                type: 'incremental',
                filePath: filePath,
                timestamp: timestamp,
                size: jsonData.length,
                checksum: BackupUtils.calculateChecksum(jsonData),
                compressed: false,
                incremental: {
                    baseBackupId: 'self-contained',
                    changedPostsCount: data.posts?.length || 0,
                    diffSize: jsonData.length,
                },
            };

            await this.addBackupToIndex(fileInfo);
            console.log(`[SimpleBackupManager] 増分バックアップ作成完了: ${backupId} (理由: ${reason})`);
        } catch (error) {
            console.error('[SimpleBackupManager] 増分バックアップ作成エラー:', error);
        }
    }

    /**
     * 世代バックアップのチェックと作成
     */
    private async checkAndCreateGenerationBackups(data: TweetWidgetSettings, index: BackupIndex): Promise<void> {
        const now = new Date();
        
        try {
                         // 日次バックアップチェック
             if (this.shouldCreateBackup('daily', index)) {
                 await this.createGenerationBackup(data, 'daily');
             }
             
             // 週次バックアップチェック
             if (this.shouldCreateBackup('weekly', index)) {
                 await this.createGenerationBackup(data, 'weekly');
             }
             
             // 月次バックアップチェック
             if (this.shouldCreateBackup('monthly', index)) {
                 await this.createGenerationBackup(data, 'monthly');
             }
        } catch (error) {
            console.error('[SimpleBackupManager] 世代バックアップチェックエラー:', error);
        }
    }

    /**
     * 世代バックアップを作成
     */
    private async createGenerationBackup(data: TweetWidgetSettings, type: 'daily' | 'weekly' | 'monthly'): Promise<void> {
        try {
            const timestamp = Date.now();
                         const period = BackupUtils.generatePeriodIdentifier(type);
            const backupId = `${type}_${period}_${timestamp}`;
            const filePath = `${this.backupPath}/generations/${backupId}.json`;
            
            await BackupUtils.ensureDirectory(this.app, `${this.backupPath}/generations`);

            const backupData = {
                id: backupId,
                type: type,
                timestamp: timestamp,
                period: period,
                data: data,
                checksum: BackupUtils.calculateChecksum(JSON.stringify(data))
            };

            const jsonData = JSON.stringify(backupData, null, 2);
            await this.app.vault.adapter.write(filePath, jsonData);

            const fileInfo: BackupFileInfo = {
                id: backupId,
                type: type,
                filePath: filePath,
                timestamp: timestamp,
                size: jsonData.length,
                checksum: BackupUtils.calculateChecksum(jsonData),
                compressed: false,
                                 generation: {
                     period: period,
                 },
            };

            await this.addBackupToIndex(fileInfo);
            console.log(`[SimpleBackupManager] ${type}バックアップ作成完了: ${backupId}`);
        } catch (error) {
            console.error(`[SimpleBackupManager] ${type}バックアップ作成エラー:`, error);
        }
    }

    /**
     * バックアップが必要かどうか判定
     */
    private shouldCreateBackup(type: 'daily' | 'weekly' | 'monthly', index: BackupIndex): boolean {
        const currentPeriod = BackupUtils.generatePeriodIdentifier(type);
        const existingBackup = index.backups.generations.find(b => 
            b.type === type && b.generation?.period === currentPeriod
        );
        
        return !existingBackup;
    }

    /**
     * バックアップから復元
     */
    async restoreFromBackup(backupId: string): Promise<RestoreResult> {
        try {
            const index = await this.loadBackupIndex();
            const backup = [...index.backups.generations, ...index.backups.incremental]
                .find(b => b.id === backupId);
            
            if (!backup) {
                return { success: false, error: `バックアップが見つかりません: ${backupId}` };
            }

            const parseResult = await BackupUtils.safeParseBackupJson(this.app, backup.filePath);
            if (!parseResult.success || !parseResult.data) {
                return { success: false, error: `バックアップファイルの読み込みに失敗しました: ${parseResult.error}` };
            }

            // データ構造に応じて復元
            let restoredData: TweetWidgetSettings;
            if (parseResult.data.data) {
                // 新しい形式（data フィールドあり）
                restoredData = parseResult.data.data;
            } else {
                // 古い形式の場合は直接使用
                restoredData = parseResult.data;
            }

            const validatedData = BackupUtils.validateAndNormalizeTweetSettings(restoredData);
            
            return {
                success: true,
                data: validatedData
            };
        } catch (error) {
            console.error('[SimpleBackupManager] 復元エラー:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * 利用可能なバックアップ一覧を取得
     */
    async getAvailableBackups(): Promise<BackupCollection> {
        try {
            const index = await this.loadBackupIndex();
            return {
                generations: index.backups.generations.sort((a, b) => b.timestamp - a.timestamp),
                incremental: index.backups.incremental.sort((a, b) => b.timestamp - a.timestamp)
            };
        } catch (error) {
            console.error('[SimpleBackupManager] バックアップ一覧取得エラー:', error);
            return { generations: [], incremental: [] };
        }
    }

    /**
     * 手動バックアップ作成
     */
    async createManualBackup(data: TweetWidgetSettings, type: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<BackupResult> {
        try {
            await this.createGenerationBackup(data, type);
            return { success: true, backupId: `manual_${type}_${Date.now()}` };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * バックアップインデックスの読み込み
     */
    private async loadBackupIndex(): Promise<BackupIndex> {
        const indexPath = `${this.backupPath}/index.json`;
        try {
            const exists = await this.app.vault.adapter.exists(indexPath);
            if (!exists) {
                const initialIndex: BackupIndex = {
                    version: "1.0.0",
                    lastUpdated: Date.now(),
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
                await this.saveBackupIndex(initialIndex);
                return initialIndex;
            }
            
            const jsonData = await this.app.vault.adapter.read(indexPath);
            return JSON.parse(jsonData) as BackupIndex;
        } catch (error) {
            console.error('[SimpleBackupManager] インデックス読み込みエラー:', error);
            return {
                version: "1.0.0",
                lastUpdated: 0,
                config: DEFAULT_BACKUP_CONFIG,
                backups: { generations: [], incremental: [] },
                statistics: { totalBackups: 0, totalSize: 0, corruptedBackups: [] }
            };
        }
    }

    /**
     * バックアップインデックスの保存
     */
    private async saveBackupIndex(index: BackupIndex): Promise<void> {
        const indexPath = `${this.backupPath}/index.json`;
        try {
            index.lastUpdated = Date.now();
            await this.app.vault.adapter.write(indexPath, JSON.stringify(index, null, 2));
        } catch (error) {
            console.error('[SimpleBackupManager] インデックス保存エラー:', error);
        }
    }

    /**
     * バックアップをインデックスに追加
     */
    private async addBackupToIndex(backupInfo: BackupFileInfo): Promise<void> {
        try {
            const index = await this.loadBackupIndex();
            
            if (backupInfo.type === 'incremental') {
                index.backups.incremental.push(backupInfo);
                // 増分バックアップは最新N件のみ保持
                index.backups.incremental.sort((a, b) => b.timestamp - a.timestamp);
                if (index.backups.incremental.length > this.config.incremental.maxCount) {
                    const removed = index.backups.incremental.splice(this.config.incremental.maxCount);
                    // 削除されたファイルを実際に削除
                    for (const backup of removed) {
                        try {
                            await this.app.vault.adapter.remove(backup.filePath);
                        } catch (e) {
                            console.warn(`[SimpleBackupManager] ファイル削除失敗: ${backup.filePath}`);
                        }
                    }
                }
            } else {
                // 世代バックアップは期間ごとに1つ
                const existingIndex = index.backups.generations.findIndex(b =>
                    b.type === backupInfo.type && 
                    b.generation?.period === backupInfo.generation?.period
                );
                
                if (existingIndex !== -1) {
                    const oldBackup = index.backups.generations[existingIndex];
                    try {
                        await this.app.vault.adapter.remove(oldBackup.filePath);
                    } catch (e) {
                        console.warn(`[SimpleBackupManager] 古いファイル削除失敗: ${oldBackup.filePath}`);
                    }
                    index.backups.generations[existingIndex] = backupInfo;
                } else {
                    index.backups.generations.push(backupInfo);
                }
            }
            
            await this.saveBackupIndex(index);
        } catch (error) {
            console.error('[SimpleBackupManager] インデックス追加エラー:', error);
        }
    }

    /**
     * バックアップディレクトリの確保
     */
    private async ensureBackupDirectory(): Promise<void> {
        try {
            await BackupUtils.ensureDirectory(this.app, this.backupPath);
            await BackupUtils.ensureDirectory(this.app, `${this.backupPath}/generations`);
            await BackupUtils.ensureDirectory(this.app, `${this.backupPath}/incremental`);
        } catch (error) {
            console.error('[SimpleBackupManager] ディレクトリ作成エラー:', error);
        }
    }

    /**
     * 保持期間を取得
     */
    private getRetentionDays(type: 'daily' | 'weekly' | 'monthly'): number {
        switch (type) {
            case 'daily': return this.config.daily.retentionDays;
            case 'weekly': return this.config.weekly.retentionWeeks * 7;
            case 'monthly': return this.config.monthly.retentionMonths * 30;
            default: return 30;
        }
    }

    /**
     * 設定を更新
     */
    updateConfig(newConfig: Partial<GenerationBackupConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * BackupManagerとの互換性メソッド群
     */

    // バックアップの整合性をチェック
    async checkAllBackupsIntegrity(): Promise<Map<string, { isValid: boolean; error?: string }>> {
        const results = new Map<string, { isValid: boolean; error?: string }>();
        try {
            const backups = await this.getAvailableBackups();
            const allBackups = [...backups.generations, ...backups.incremental];
            
            for (const backup of allBackups) {
                try {
                    const parseResult = await BackupUtils.safeParseBackupJson(this.app, backup.filePath);
                    results.set(backup.id, { 
                        isValid: parseResult.success,
                        error: parseResult.error 
                    });
                } catch (error) {
                    results.set(backup.id, { 
                        isValid: false, 
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        } catch (error) {
            console.error('[SimpleBackupManager] 整合性チェックエラー:', error);
        }
        
        return results;
    }

    // ダッシュボードデータ取得
    async getDashboardData(): Promise<{
        totalBackups: number;
        generations: { daily: number; weekly: number; monthly: number };
        incremental: number;
        totalSize: number;
        oldestBackup?: number;
        newestBackup?: number;
    }> {
        try {
            const backups = await this.getAvailableBackups();
            const generationsByType = {
                daily: backups.generations.filter(b => b.type === 'daily').length,
                weekly: backups.generations.filter(b => b.type === 'weekly').length,
                monthly: backups.generations.filter(b => b.type === 'monthly').length,
            };
            
            const allBackups = [...backups.generations, ...backups.incremental];
            const timestamps = allBackups.map(b => b.timestamp).filter(Boolean);
            
            return {
                totalBackups: allBackups.length,
                generations: generationsByType,
                incremental: backups.incremental.length,
                totalSize: allBackups.reduce((sum, b) => sum + (b.size || 0), 0),
                oldestBackup: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
                newestBackup: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
            };
        } catch (error) {
            console.error('[SimpleBackupManager] ダッシュボードデータ取得エラー:', error);
            return {
                totalBackups: 0,
                generations: { daily: 0, weekly: 0, monthly: 0 },
                incremental: 0,
                totalSize: 0,
            };
        }
    }

    // バックアップの削除
    async deleteBackup(backupId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const index = await this.loadBackupIndex();
            const allBackups = [...index.backups.generations, ...index.backups.incremental];
            const backup = allBackups.find(b => b.id === backupId);
            
            if (!backup) {
                return { success: false, error: `バックアップが見つかりません: ${backupId}` };
            }

            // ファイルを削除
            try {
                await this.app.vault.adapter.remove(backup.filePath);
            } catch (e) {
                console.warn(`[SimpleBackupManager] ファイル削除失敗: ${backup.filePath}`);
            }

            // インデックスから削除
            if (backup.type === 'incremental') {
                index.backups.incremental = index.backups.incremental.filter(b => b.id !== backupId);
            } else {
                index.backups.generations = index.backups.generations.filter(b => b.id !== backupId);
            }

            await this.saveBackupIndex(index);
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    // パフォーマンス最適化の有効化/無効化
    setPerformanceOptimization(enabled: boolean): void {
        this.isPerformanceOptimizationEnabled = enabled;
    }

    // 統計情報取得
    async getStats(): Promise<{
        totalBackups: number;
        totalSize: number;
        oldestBackup?: number;
        newestBackup?: number;
    }> {
        const dashboard = await this.getDashboardData();
        return {
            totalBackups: dashboard.totalBackups,
            totalSize: dashboard.totalSize,
            oldestBackup: dashboard.oldestBackup,
            newestBackup: dashboard.newestBackup,
        };
    }

    // 統計情報再計算
    async recalculateStatistics(): Promise<void> {
        try {
            const index = await this.loadBackupIndex();
            const allBackups = [...index.backups.generations, ...index.backups.incremental];
            
            index.statistics.totalBackups = allBackups.length;
            index.statistics.totalSize = allBackups.reduce((sum, b) => sum + (b.size || 0), 0);
            
            const timestamps = allBackups.map(b => b.timestamp).filter(Boolean);
            if (timestamps.length > 0) {
                index.statistics.oldestBackup = Math.min(...timestamps);
                index.statistics.newestBackup = Math.max(...timestamps);
            }
            
            await this.saveBackupIndex(index);
        } catch (error) {
            console.error('[SimpleBackupManager] 統計情報再計算エラー:', error);
        }
    }

    // インデックスからバックアップを削除
    async removeBackupFromIndex(backupId: string): Promise<void> {
        try {
            const index = await this.loadBackupIndex();
            index.backups.incremental = index.backups.incremental.filter(b => b.id !== backupId);
            index.backups.generations = index.backups.generations.filter(b => b.id !== backupId);
            await this.saveBackupIndex(index);
        } catch (error) {
            console.error('[SimpleBackupManager] インデックス削除エラー:', error);
        }
    }

    // 重要な変更があるかチェック（シンプル実装）
    hasSignificantDataChanges(oldData: TweetWidgetSettings, newData: TweetWidgetSettings): boolean {
        return JSON.stringify(oldData) !== JSON.stringify(newData);
    }

    // 増分チェーンから復元（シンプル実装）
    async restoreFromIncrementalChain(targetBackupId: string): Promise<RestoreResult> {
        return await this.restoreFromBackup(targetBackupId);
    }

    // バックアップの破損チェック
    async validateBackupIntegrity(backupId: string): Promise<{ isValid: boolean; error?: string }> {
        try {
            const backups = await this.getAvailableBackups();
            const allBackups = [...backups.generations, ...backups.incremental];
            const backup = allBackups.find(b => b.id === backupId);
            
            if (!backup) {
                return { isValid: false, error: `バックアップが見つかりません: ${backupId}` };
            }

            const parseResult = await BackupUtils.safeParseBackupJson(this.app, backup.filePath);
            return { 
                isValid: parseResult.success,
                error: parseResult.error 
            };
        } catch (error) {
            return { 
                isValid: false, 
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    // バックアップ圧縮
    async compressBackup(backupId: string): Promise<{ success: boolean; error?: string }> {
        // シンプル実装では圧縮はスキップ
        console.log(`[SimpleBackupManager] 圧縮スキップ: ${backupId}`);
        return { success: true };
    }

    // パフォーマンス統計
    async getPerformanceStats(): Promise<{
        avgBackupTime: number;
        avgRestoreTime: number;
        totalOperations: number;
    }> {
        // シンプル実装では固定値を返す
        return {
            avgBackupTime: 100,
            avgRestoreTime: 150,
            totalOperations: 0,
        };
    }

    // 期限切れバックアップのクリーンアップ
    async cleanupExpiredBackups(): Promise<{ deletedCount: number; errors: string[] }> {
        try {
            const index = await this.loadBackupIndex();
            const now = Date.now();
            const errors: string[] = [];
            let deletedCount = 0;

            // 日次バックアップの期限チェック
            const dailyRetentionMs = this.config.daily.retentionDays * 24 * 60 * 60 * 1000;
            const expiredDaily = index.backups.generations.filter(b => 
                b.type === 'daily' && (now - b.timestamp) > dailyRetentionMs
            );

            // 週次バックアップの期限チェック
            const weeklyRetentionMs = this.config.weekly.retentionWeeks * 7 * 24 * 60 * 60 * 1000;
            const expiredWeekly = index.backups.generations.filter(b => 
                b.type === 'weekly' && (now - b.timestamp) > weeklyRetentionMs
            );

            // 月次バックアップの期限チェック
            const monthlyRetentionMs = this.config.monthly.retentionMonths * 30 * 24 * 60 * 60 * 1000;
            const expiredMonthly = index.backups.generations.filter(b => 
                b.type === 'monthly' && (now - b.timestamp) > monthlyRetentionMs
            );

            const expiredBackups = [...expiredDaily, ...expiredWeekly, ...expiredMonthly];

            for (const backup of expiredBackups) {
                try {
                    await this.app.vault.adapter.remove(backup.filePath);
                    deletedCount++;
                } catch (error) {
                    errors.push(`削除失敗: ${backup.id} - ${error.message}`);
                }
            }

            // インデックスを更新
            index.backups.generations = index.backups.generations.filter(b => 
                !expiredBackups.some(expired => expired.id === b.id)
            );
            await this.saveBackupIndex(index);

            return { deletedCount, errors };
        } catch (error) {
            return { 
                deletedCount: 0, 
                errors: [error instanceof Error ? error.message : String(error)] 
            };
        }
    }

    // 差分チェーンを構築
    async buildDiffChain(targetBackupId: string): Promise<string[]> {
        // シンプル実装では単一バックアップのみ
        return [targetBackupId];
    }

    // バックアップクリーンアップ（エイリアス）
    async cleanupBackups(): Promise<{ deletedCount: number; errors: string[] }> {
        return await this.cleanupExpiredBackups();
    }

    // バックアップ整合性チェック（単一）
    async checkBackupIntegrity(backupId: string): Promise<{ isValid: boolean; error?: string }> {
        return await this.validateBackupIntegrity(backupId);
    }

    // 復元プレビュー
    async previewRestore(backupId: string): Promise<{
        success: boolean;
        previewData?: {
            postsCount: number;
            userId: string;
            timestamp: number;
            changes?: string[];
        };
        error?: string;
    }> {
        try {
            const restoreResult = await this.restoreFromBackup(backupId);
            if (!restoreResult.success || !restoreResult.data) {
                return { success: false, error: restoreResult.error };
            }

            return {
                success: true,
                previewData: {
                    postsCount: restoreResult.data.posts?.length || 0,
                    userId: restoreResult.data.userId || 'unknown',
                    timestamp: Date.now(),
                    changes: ['データ復元のプレビュー']
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
} 