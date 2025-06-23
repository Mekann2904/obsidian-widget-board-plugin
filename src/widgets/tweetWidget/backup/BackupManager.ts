import { App } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { 
    BackupResult, 
    RestoreResult, 
    RestoreOptions,
    GenerationBackupConfig, 
    BackupFileInfo
} from './types';
import { DEFAULT_BACKUP_CONFIG } from './types';
import { GenerationBackupManager } from './GenerationBackupManager';
import { IncrementalBackupManager } from './IncrementalBackupManager';
import { AsyncJobQueue, JobPriority } from './AsyncJobQueue';
import { FastPatchManager } from './FastPatchManager';
import { ShardingManager } from './ShardingManager';
import { PerformanceMonitor } from './PerformanceMonitor';

/**
 * 統合バックアップマネージャー
 * 世代バックアップと差分バックアップを統合管理
 */
export class BackupManager {
    private app: App;
    private basePath: string;
    private generationManager: GenerationBackupManager;
    private incrementalManager: IncrementalBackupManager;
    private config: GenerationBackupConfig;
    private lastSaveData: TweetWidgetSettings | null = null;
    private lastKnownData: TweetWidgetSettings | null = null;
    
    // Performance enhancement components
    private jobQueue: AsyncJobQueue;
    private fastPatchManager: FastPatchManager;
    private shardingManager: ShardingManager;
    private performanceMonitor: PerformanceMonitor;
    private isPerformanceOptimizationEnabled: boolean = true;

    constructor(app: App, basePath: string) {
        this.app = app;
        this.basePath = basePath;
        this.generationManager = new GenerationBackupManager(app, basePath);
        this.incrementalManager = new IncrementalBackupManager(app, basePath);
        this.config = DEFAULT_BACKUP_CONFIG;
        
        // Initialize performance enhancement components
        this.jobQueue = new AsyncJobQueue(3); // Max 3 concurrent backup jobs
        this.fastPatchManager = new FastPatchManager();
        this.shardingManager = new ShardingManager();
        this.performanceMonitor = new PerformanceMonitor();
        
        // Start performance monitoring
        this.performanceMonitor.startMonitoring();
        
        console.log('[BackupManager] パフォーマンス最適化機能を初期化しました');
    }

    /**
     * データ保存時のバックアップ処理
     */
    async onDataSave(currentData: TweetWidgetSettings): Promise<void> {
        console.log('[BackupManager] onDataSave() 開始');
        console.log(`[BackupManager] 現在のデータ: 投稿=${currentData.posts?.length || 0}件, スケジュール=${currentData.scheduledPosts?.length || 0}件`);
        
        try {
            // 差分バックアップを作成（前回データがある場合）
            if (this.lastSaveData && this.config.incremental.enabled) {
                console.log('[BackupManager] 差分バックアップ作成開始');
                console.log(`[BackupManager] 前回データ: 投稿=${this.lastSaveData.posts?.length || 0}件`);
                
                const incrementalResult = await this.incrementalManager.createIncrementalBackup(
                    currentData,
                    this.lastSaveData,
                    this.config
                );
                
                if (incrementalResult.success) {
                    console.log(`[BackupManager] 差分バックアップ作成完了: ${incrementalResult.backupId}`);
                } else {
                    console.warn('[BackupManager] 差分バックアップ作成に失敗:', incrementalResult.error);
                }
            } else {
                if (!this.lastSaveData) {
                    console.log('[BackupManager] 差分バックアップスキップ: 前回データなし（初回保存）');
                } else if (!this.config.incremental.enabled) {
                    console.log('[BackupManager] 差分バックアップスキップ: 設定で無効化');
                }
            }

            // 世代バックアップのスケジュールチェック
            console.log('[BackupManager] 世代バックアップスケジュールチェック開始');
            await this.checkAndCreateGenerationBackups(currentData);

            // 今回のデータを保存
            this.lastSaveData = JSON.parse(JSON.stringify(currentData));
            console.log('[BackupManager] onDataSave() 完了');

        } catch (error) {
            console.error('[BackupManager] バックアップ処理エラー:', error);
        }
    }

    /**
     * 手動バックアップ作成（パフォーマンス最適化版）
     */
    async createManualBackup(
        data: TweetWidgetSettings, 
        description?: string
    ): Promise<BackupResult> {
        if (!this.isPerformanceOptimizationEnabled) {
            // パフォーマンス最適化無効時は従来の方法
            return this.createManualBackupLegacy(data, description);
        }

        const operationId = this.performanceMonitor.recordOperationStart('manual_backup', {
            description,
            dataSize: JSON.stringify(data).length
        });

        try {
            console.log('[BackupManager] 高速手動バックアップ作成開始');

            // ジョブをキューに追加
            const jobId = this.jobQueue.addJob(
                'manual_backup',
                async (payload, updateProgress) => {
                    updateProgress({ current: 0, total: 100, message: 'バックアップ開始' });

                    // データサイズをチェックしてシャーディングを判断
                    const dataSize = new Blob([JSON.stringify(payload.data)]).size;
                    const shardingThreshold = 10 * 1024 * 1024; // 10MB

                    if (dataSize > shardingThreshold) {
                        console.log(`[BackupManager] 大容量データ検出: ${(dataSize / 1024 / 1024).toFixed(2)}MB - シャーディング実行`);
                        
                        updateProgress({ current: 20, total: 100, message: 'データをシャードに分割中' });
                        
                        // データをシャードに分割
                        const shardingResult = await this.shardingManager.shardData(payload.data);
                        
                        updateProgress({ current: 40, total: 100, message: 'シャードを並列処理中' });
                        
                        // シャード処理（簡易実装）
                        updateProgress({ current: 60, total: 100, message: 'シャード処理中' });
                        
                        // 最初のシャードでバックアップ作成
                        const mainShard = shardingResult.shards[0];
                        const result = await this.generationManager.createGenerationBackup(
                            mainShard?.data || payload.data,
                            'daily',
                            this.config
                        );
                        
                        updateProgress({ current: 100, total: 100, message: '完了' });
                        
                        return result;
                        
                    } else {
                        updateProgress({ current: 50, total: 100, message: '通常バックアップ実行中' });
                        
                        // 通常サイズの場合は従来の方法
                        const result = await this.generationManager.createGenerationBackup(
                            payload.data,
                            'daily',
                            this.config
                        );
                        
                        updateProgress({ current: 100, total: 100, message: '完了' });
                        return result;
                    }
                },
                { data, description },
                {
                    priority: 'high' as JobPriority,
                    maxRetries: 2,
                    onProgress: (progress) => {
                        this.performanceMonitor.updateQueueStats(this.jobQueue.getStats());
                    }
                }
            );

            // ジョブの完了を待機
            const job = this.jobQueue.getJob(jobId);
            if (!job) {
                throw new Error('ジョブの作成に失敗しました');
            }

            // ジョブの完了を監視
            return new Promise((resolve, reject) => {
                const checkJob = () => {
                    const currentJob = this.jobQueue.getJob(jobId);
                    if (!currentJob) {
                        reject(new Error('ジョブが見つかりません'));
                        return;
                    }

                    switch (currentJob.status) {
                        case 'completed':
                            this.performanceMonitor.recordOperationComplete(operationId, {
                                jobId: currentJob.id,
                                result: 'success'
                            });
                            
                            if (description) {
                                console.log(`[BackupManager] 高速手動バックアップ作成完了: ${description}`);
                            }
                            
                            resolve(currentJob.result as BackupResult);
                            break;
                            
                        case 'failed':
                            this.performanceMonitor.recordOperationFail(operationId, currentJob.error, {
                                jobId: currentJob.id
                            });
                            
                            reject(currentJob.error || new Error('バックアップジョブが失敗しました'));
                            break;
                            
                        case 'cancelled':
                            this.performanceMonitor.recordOperationFail(operationId, 'Job cancelled', {
                                jobId: currentJob.id
                            });
                            
                            reject(new Error('バックアップジョブがキャンセルされました'));
                            break;
                            
                        default:
                            // まだ実行中
                            setTimeout(checkJob, 100);
                            break;
                    }
                };
                
                checkJob();
            });

        } catch (error) {
            this.performanceMonitor.recordOperationFail(operationId, error);
            
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stats: {
                    processedPosts: 0,
                    createdFiles: 0,
                    totalSize: 0,
                    processingTime: 0
                }
            };
        }
    }

    /**
     * 従来の手動バックアップ作成（互換性のため）
     */
    private async createManualBackupLegacy(
        data: TweetWidgetSettings, 
        description?: string
    ): Promise<BackupResult> {
        try {
            const result = await this.generationManager.createGenerationBackup(
                data,
                'daily',
                this.config
            );
            
            if (result.success && description) {
                console.log(`[BackupManager] 手動バックアップ作成: ${description}`);
            }
            
            return result;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                stats: {
                    processedPosts: 0,
                    createdFiles: 0,
                    totalSize: 0,
                    processingTime: 0
                }
            };
        }
    }

    /**
     * パフォーマンス統計を取得
     */
    public getPerformanceStats() {
        return {
            jobQueue: this.jobQueue.getStats(),
            performance: this.performanceMonitor.getStats(),
            detailedMetrics: this.performanceMonitor.getDetailedMetrics(),
            report: this.performanceMonitor.getPerformanceReport()
        };
    }

    /**
     * パフォーマンス最適化の有効/無効を切り替え
     */
    public togglePerformanceOptimization(enabled: boolean): void {
        this.isPerformanceOptimizationEnabled = enabled;
        console.log(`[BackupManager] パフォーマンス最適化: ${enabled ? '有効' : '無効'}`);
    }

    /**
     * リソースをクリーンアップ
     */
    public cleanup(): void {
        this.jobQueue.stop();
        this.performanceMonitor.stopMonitoring();
        console.log('[BackupManager] パフォーマンス監視とジョブキューを停止しました');
    }

    /**
     * バックアップから復元
     */
    async restoreFromBackup(options: RestoreOptions): Promise<RestoreResult> {
        const startTime = Date.now();
        
        try {
            console.log(`[BackupManager] 復元開始: ID=${options.backupId}, type=${options.type}`);
            let restoredData: TweetWidgetSettings | null = null;

            switch (options.type) {
                case 'full':
                    // 世代バックアップから復元
                    console.log(`[BackupManager] 世代バックアップからの復元を開始`);
                    restoredData = await this.generationManager.restoreFromGeneration(options.backupId);
                    break;
                    
                case 'incremental':
                    // 差分バックアップから復元
                    console.log(`[BackupManager] 差分バックアップからの復元を開始`);
                    restoredData = await this.incrementalManager.restoreFromIncrementalChain(options.backupId);
                    break;
                    
                case 'hybrid':
                    // ハイブリッド復元（現在は未実装）
                    throw new Error('ハイブリッド復元は未実装です');
                    
                default:
                    throw new Error(`未対応の復元タイプ: ${options.type}`);
            }

            if (!restoredData) {
                const errorMsg = `${options.type}バックアップ（ID: ${options.backupId}）からのデータ復元に失敗しました`;
                console.error(`[BackupManager] ${errorMsg}`);
                throw new Error(errorMsg);
            }

            console.log(`[BackupManager] 復元データ検証: ${restoredData.posts?.length || 0}件の投稿`);

            // 復元範囲の適用（指定されている場合）
            if (options.restoreRange) {
                console.log(`[BackupManager] 復元範囲を適用`);
                restoredData = this.applyRestoreRange(restoredData, options.restoreRange);
            }

            const processingTime = Date.now() - startTime;
            console.log(`[BackupManager] 復元完了: 処理時間=${processingTime}ms`);

            return {
                success: true,
                restoredData: restoredData,
                stats: {
                    restoredPosts: restoredData.posts?.length || 0,
                    processedBackups: 1,
                    totalSize: JSON.stringify(restoredData).length,
                    processingTime: processingTime
                }
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[BackupManager] バックアップ復元エラー:`, error);
            
            // より詳細なエラー情報を含める
            const detailedError = `復元失敗: ${errorMessage} (タイプ: ${options.type}, ID: ${options.backupId})`;
            
            return {
                success: false,
                error: detailedError,
                stats: {
                    restoredPosts: 0,
                    processedBackups: 0,
                    totalSize: 0,
                    processingTime: processingTime
                }
            };
        }
    }

    /**
     * Dry-Run: バックアップ復元のプレビュー
     * 実際に復元は行わず、変更内容を分析して返す
     */
    async previewRestore(
        options: RestoreOptions, 
        currentData: TweetWidgetSettings
    ): Promise<{
        success: boolean;
        previewData?: TweetWidgetSettings;
        differences?: {
            postsToAdd: number;
            postsToRemove: number;
            postsToModify: number;
            addedPosts?: any[];
            removedPosts?: any[];
            modifiedPosts?: { original: any; updated: any }[];
        };
        error?: string;
    }> {
        try {
            console.log(`[BackupManager] 復元プレビュー開始: ID=${options.backupId}, type=${options.type}`);
            
            // まず復元データを取得（実際のファイルシステムへの書き込みは行わない）
            let previewData: TweetWidgetSettings | null = null;

            switch (options.type) {
                case 'full':
                    previewData = await this.generationManager.restoreFromGeneration(options.backupId);
                    break;
                case 'incremental':
                    previewData = await this.incrementalManager.restoreFromIncrementalChain(options.backupId);
                    break;
                default:
                    throw new Error(`未対応の復元タイプ: ${options.type}`);
            }

            if (!previewData) {
                throw new Error(`バックアップデータの読み込みに失敗しました`);
            }

            // 復元範囲の適用
            if (options.restoreRange) {
                previewData = this.applyRestoreRange(previewData, options.restoreRange);
            }

            // 差分分析
            const differences = this.analyzeDifferences(currentData, previewData);

            console.log(`[BackupManager] 復元プレビュー完了: 追加=${differences.postsToAdd}, 削除=${differences.postsToRemove}, 変更=${differences.postsToModify}`);

            return {
                success: true,
                previewData,
                differences
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[BackupManager] 復元プレビューエラー:`, error);
            
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * 現在のデータとバックアップデータの差分を分析
     */
    private analyzeDifferences(
        currentData: TweetWidgetSettings, 
        backupData: TweetWidgetSettings
    ): {
        postsToAdd: number;
        postsToRemove: number;
        postsToModify: number;
        addedPosts: any[];
        removedPosts: any[];
        modifiedPosts: { original: any; updated: any }[];
    } {
        const currentPosts = currentData.posts || [];
        const backupPosts = backupData.posts || [];

        // 投稿をIDでマップ化
        const currentPostsMap = new Map(currentPosts.map(post => [post.id, post]));
        const backupPostsMap = new Map(backupPosts.map(post => [post.id, post]));

        const addedPosts: any[] = [];
        const removedPosts: any[] = [];
        const modifiedPosts: { original: any; updated: any }[] = [];

        // バックアップにあって現在にない投稿（追加される投稿）
        for (const [id, post] of backupPostsMap) {
            if (!currentPostsMap.has(id)) {
                addedPosts.push(post);
            }
        }

        // 現在にあってバックアップにない投稿（削除される投稿）
        for (const [id, post] of currentPostsMap) {
            if (!backupPostsMap.has(id)) {
                removedPosts.push(post);
            }
        }

        // 両方にあるが内容が異なる投稿（変更される投稿）
        for (const [id, currentPost] of currentPostsMap) {
            const backupPost = backupPostsMap.get(id);
            if (backupPost && JSON.stringify(currentPost) !== JSON.stringify(backupPost)) {
                modifiedPosts.push({
                    original: currentPost,
                    updated: backupPost
                });
            }
        }

        return {
            postsToAdd: addedPosts.length,
            postsToRemove: removedPosts.length,
            postsToModify: modifiedPosts.length,
            addedPosts,
            removedPosts,
            modifiedPosts
        };
    }

    /**
     * バックアップの整合性チェック
     */
    async checkBackupIntegrity(backupId: string, type: 'full' | 'incremental'): Promise<{
        success: boolean;
        isHealthy: boolean;
        issues?: string[];
        error?: string;
    }> {
        try {
            console.log(`[BackupManager] 整合性チェック開始: ID=${backupId}, type=${type}`);

            let backupData: TweetWidgetSettings | null = null;

            // バックアップデータを読み込み
            switch (type) {
                case 'full':
                    backupData = await this.generationManager.restoreFromGeneration(backupId);
                    break;
                case 'incremental':
                    backupData = await this.incrementalManager.restoreFromIncrementalChain(backupId);
                    break;
                default:
                    throw new Error(`未対応のバックアップタイプ: ${type}`);
            }

            if (!backupData) {
                return {
                    success: true,
                    isHealthy: false,
                    issues: ['バックアップデータの読み込みに失敗しました']
                };
            }

            // データ構造の整合性チェック
            const issues: string[] = [];

            // 必須フィールドの存在チェック
            if (!backupData.posts) {
                issues.push('posts フィールドが存在しません');
            } else if (!Array.isArray(backupData.posts)) {
                issues.push('posts フィールドが配列ではありません');
            }

            if (!backupData.scheduledPosts) {
                issues.push('scheduledPosts フィールドが存在しません');
            } else if (!Array.isArray(backupData.scheduledPosts)) {
                issues.push('scheduledPosts フィールドが配列ではありません');
            }

            // 投稿データの整合性チェック
            if (backupData.posts && Array.isArray(backupData.posts)) {
                const postIds = new Set<string>();
                for (let i = 0; i < backupData.posts.length; i++) {
                    const post = backupData.posts[i];
                    
                    if (!post.id) {
                        issues.push(`投稿[${i}]: ID が存在しません`);
                        continue;
                    }
                    
                    if (postIds.has(post.id)) {
                        issues.push(`投稿[${i}]: 重複したID: ${post.id}`);
                    }
                    postIds.add(post.id);
                    
                    if (typeof post.created !== 'number') {
                        issues.push(`投稿[${i}]: 作成日時が数値ではありません`);
                    }
                    
                    if (typeof post.text !== 'string') {
                        issues.push(`投稿[${i}]: テキストが文字列ではありません`);
                    }
                }
            }

            // スケジュール投稿の整合性チェック
            if (backupData.scheduledPosts && Array.isArray(backupData.scheduledPosts)) {
                for (let i = 0; i < backupData.scheduledPosts.length; i++) {
                    const scheduled = backupData.scheduledPosts[i];
                    
                    if (!scheduled.id) {
                        issues.push(`スケジュール投稿[${i}]: ID が存在しません`);
                    }
                    
                    if (typeof scheduled.nextTime !== 'number') {
                        issues.push(`スケジュール投稿[${i}]: 次回実行時刻が数値ではありません`);
                    }
                }
            }

            // JSON パースエラーチェック（再シリアライゼーション）
            try {
                JSON.stringify(backupData);
            } catch (error) {
                issues.push(`JSON シリアライゼーションエラー: ${error instanceof Error ? error.message : String(error)}`);
            }

            const isHealthy = issues.length === 0;
            
            console.log(`[BackupManager] 整合性チェック完了: ${isHealthy ? '正常' : '問題あり'} (${issues.length}件の問題)`);

            return {
                success: true,
                isHealthy,
                issues: issues.length > 0 ? issues : undefined
            };

        } catch (error) {
            console.error(`[BackupManager] 整合性チェックエラー:`, error);
            return {
                success: false,
                isHealthy: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 全バックアップの整合性チェック
     */
    async checkAllBackupsIntegrity(): Promise<Map<string, {
        isHealthy: boolean;
        issues?: string[];
        error?: string;
    }>> {
        const results = new Map<string, {
            isHealthy: boolean;
            issues?: string[];
            error?: string;
        }>();

        try {
            const backups = await this.getAvailableBackups();
            
            // 世代バックアップをチェック
            for (const backup of backups.generations) {
                const result = await this.checkBackupIntegrity(backup.id, 'full');
                if (result.success) {
                    results.set(backup.id, {
                        isHealthy: result.isHealthy,
                        issues: result.issues,
                        error: result.error
                    });
                } else {
                    results.set(backup.id, {
                        isHealthy: false,
                        error: result.error
                    });
                }
            }
            
            // 差分バックアップをチェック
            for (const backup of backups.incremental) {
                const result = await this.checkBackupIntegrity(backup.id, 'incremental');
                if (result.success) {
                    results.set(backup.id, {
                        isHealthy: result.isHealthy,
                        issues: result.issues,
                        error: result.error
                    });
                } else {
                    results.set(backup.id, {
                        isHealthy: false,
                        error: result.error
                    });
                }
            }

        } catch (error) {
            console.error('[BackupManager] 全バックアップ整合性チェックエラー:', error);
        }

        return results;
    }

    /**
     * 利用可能なバックアップ一覧を取得
     */
    async getAvailableBackups(): Promise<{
        generations: BackupFileInfo[];
        incremental: BackupFileInfo[];
    }> {
        try {
            const [generations, incremental] = await Promise.all([
                this.generationManager.getAvailableGenerations(),
                this.incrementalManager.getAvailableIncrementalBackups()
            ]);

            return { generations, incremental };
        } catch (error) {
            console.error('バックアップ一覧取得エラー:', error);
            return { generations: [], incremental: [] };
        }
    }

    /**
     * バックアップ設定を更新
     */
    updateConfig(newConfig: Partial<GenerationBackupConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    /**
     * 世代バックアップのスケジュールチェック
     */
    private async checkAndCreateGenerationBackups(data: TweetWidgetSettings): Promise<void> {
        const now = new Date();
        console.log(`[BackupManager] 現在時刻: ${now.toLocaleString()}`);
        console.log(`[BackupManager] バックアップ設定:`, this.config);
        
        try {
            // 日次バックアップのチェック
            if (this.config.daily.enabled) {
                console.log('[BackupManager] 日次バックアップ条件チェック');
                const shouldCreate = await this.shouldCreateDailyBackup(now);
                console.log(`[BackupManager] 日次バックアップ必要: ${shouldCreate}`);
                
                if (shouldCreate) {
                    console.log('[BackupManager] 日次バックアップ作成開始');
                    const result = await this.generationManager.createGenerationBackup(
                        data, 
                        'daily', 
                        this.config
                    );
                    if (result.success) {
                        console.log(`[BackupManager] 日次バックアップ作成完了: ${result.backupId}`);
                    } else {
                        console.error(`[BackupManager] 日次バックアップ作成失敗: ${result.error}`);
                    }
                }
            } else {
                console.log('[BackupManager] 日次バックアップ無効');
            }

            // 週次バックアップのチェック
            if (this.config.weekly.enabled) {
                console.log('[BackupManager] 週次バックアップ条件チェック');
                const shouldCreate = await this.shouldCreateWeeklyBackup(now);
                console.log(`[BackupManager] 週次バックアップ必要: ${shouldCreate}`);
                
                if (shouldCreate) {
                    console.log('[BackupManager] 週次バックアップ作成開始');
                    const result = await this.generationManager.createGenerationBackup(
                        data, 
                        'weekly', 
                        this.config
                    );
                    if (result.success) {
                        console.log(`[BackupManager] 週次バックアップ作成完了: ${result.backupId}`);
                    } else {
                        console.error(`[BackupManager] 週次バックアップ作成失敗: ${result.error}`);
                    }
                }
            } else {
                console.log('[BackupManager] 週次バックアップ無効');
            }

            // 月次バックアップのチェック
            if (this.config.monthly.enabled) {
                console.log('[BackupManager] 月次バックアップ条件チェック');
                const shouldCreate = await this.shouldCreateMonthlyBackup(now);
                console.log(`[BackupManager] 月次バックアップ必要: ${shouldCreate}`);
                
                if (shouldCreate) {
                    console.log('[BackupManager] 月次バックアップ作成開始');
                    const result = await this.generationManager.createGenerationBackup(
                        data, 
                        'monthly', 
                        this.config
                    );
                    if (result.success) {
                        console.log(`[BackupManager] 月次バックアップ作成完了: ${result.backupId}`);
                    } else {
                        console.error(`[BackupManager] 月次バックアップ作成失敗: ${result.error}`);
                    }
                }
            } else {
                console.log('[BackupManager] 月次バックアップ無効');
            }

        } catch (error) {
            console.error('[BackupManager] 世代バックアップスケジュールチェックエラー:', error);
        }
    }

    /**
     * 日次バックアップが必要かチェック
     */
    private async shouldCreateDailyBackup(now: Date): Promise<boolean> {
        try {
            // 設定時刻をチェック
            const [hour, minute] = this.config.daily.createTime.split(':').map(Number);
            const createTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
            
            console.log(`[BackupManager] 日次バックアップ設定時刻: ${createTime.toLocaleString()}`);
            console.log(`[BackupManager] 現在時刻との比較: ${now >= createTime}`);
            
            // 設定時刻を過ぎていない場合は作成しない
            if (now < createTime) {
                return false;
            }
            
            // 今日の期間識別子を生成
            const todayPeriod = this.generateDailyPeriodId(now);
            console.log(`[BackupManager] 今日の期間ID: ${todayPeriod}`);
            
            // 既存バックアップをチェック
            const existingBackups = await this.generationManager.getAvailableGenerations();
            const todayBackup = existingBackups.find(backup => 
                backup.type === 'daily' && backup.generation?.period === todayPeriod
            );
            
            const alreadyExists = !!todayBackup;
            console.log(`[BackupManager] 今日のバックアップ既存: ${alreadyExists}`);
            if (todayBackup) {
                console.log(`[BackupManager] 既存バックアップ: ${todayBackup.id} (${new Date(todayBackup.timestamp).toLocaleString()})`);
            }
            
            return !alreadyExists;
            
        } catch (error) {
            console.error('[BackupManager] 日次バックアップ条件チェックエラー:', error);
            return false;
        }
    }

    /**
     * 週次バックアップが必要かチェック
     */
    private async shouldCreateWeeklyBackup(now: Date): Promise<boolean> {
        try {
            // 設定された曜日をチェック
            const dayOfWeek = now.getDay();
            console.log(`[BackupManager] 現在の曜日: ${dayOfWeek}, 設定曜日: ${this.config.weekly.dayOfWeek}`);
            
            if (dayOfWeek !== this.config.weekly.dayOfWeek) {
                return false;
            }

            // 設定時刻をチェック
            const [hour, minute] = this.config.weekly.createTime.split(':').map(Number);
            const createTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
            
            console.log(`[BackupManager] 週次バックアップ設定時刻: ${createTime.toLocaleString()}`);
            
            if (now < createTime) {
                return false;
            }
            
            // 今週の期間識別子を生成
            const weekPeriod = this.generateWeeklyPeriodId(now);
            console.log(`[BackupManager] 今週の期間ID: ${weekPeriod}`);
            
            // 既存バックアップをチェック
            const existingBackups = await this.generationManager.getAvailableGenerations();
            const weekBackup = existingBackups.find(backup => 
                backup.type === 'weekly' && backup.generation?.period === weekPeriod
            );
            
            const alreadyExists = !!weekBackup;
            console.log(`[BackupManager] 今週のバックアップ既存: ${alreadyExists}`);
            
            return !alreadyExists;
            
        } catch (error) {
            console.error('[BackupManager] 週次バックアップ条件チェックエラー:', error);
            return false;
        }
    }

    /**
     * 月次バックアップが必要かチェック
     */
    private async shouldCreateMonthlyBackup(now: Date): Promise<boolean> {
        try {
            // 設定された日をチェック
            const dayOfMonth = now.getDate();
            console.log(`[BackupManager] 現在の日: ${dayOfMonth}, 設定日: ${this.config.monthly.dayOfMonth}`);
            
            if (dayOfMonth !== this.config.monthly.dayOfMonth) {
                return false;
            }

            // 設定時刻をチェック
            const [hour, minute] = this.config.monthly.createTime.split(':').map(Number);
            const createTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
            
            console.log(`[BackupManager] 月次バックアップ設定時刻: ${createTime.toLocaleString()}`);
            
            if (now < createTime) {
                return false;
            }
            
            // 今月の期間識別子を生成
            const monthPeriod = this.generateMonthlyPeriodId(now);
            console.log(`[BackupManager] 今月の期間ID: ${monthPeriod}`);
            
            // 既存バックアップをチェック
            const existingBackups = await this.generationManager.getAvailableGenerations();
            const monthBackup = existingBackups.find(backup => 
                backup.type === 'monthly' && backup.generation?.period === monthPeriod
            );
            
            const alreadyExists = !!monthBackup;
            console.log(`[BackupManager] 今月のバックアップ既存: ${alreadyExists}`);
            
            return !alreadyExists;
            
        } catch (error) {
            console.error('[BackupManager] 月次バックアップ条件チェックエラー:', error);
            return false;
        }
    }

    /**
     * 期間識別子生成メソッド
     */
    private generateDailyPeriodId(date: Date): string {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    private generateWeeklyPeriodId(date: Date): string {
        const year = date.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
        return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
    }

    private generateMonthlyPeriodId(date: Date): string {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        return `${year}-${month}`;
    }

    /**
     * 復元範囲を適用
     */
    private applyRestoreRange(
        data: TweetWidgetSettings, 
        range: RestoreOptions['restoreRange']
    ): TweetWidgetSettings {
        if (!range || !data.posts) {
            return data;
        }

        const filteredPosts = data.posts.filter(post => {
            const postTime = new Date(post.created).getTime();
            
            // 日付範囲チェック
            if (range.startDate && postTime < range.startDate) {
                return false;
            }
            if (range.endDate && postTime > range.endDate) {
                return false;
            }

            // 削除されたアイテムの処理
            if (!range.includeDeleted && post.deleted) {
                return false;
            }

            return true;
        });

        return {
            ...data,
            posts: filteredPosts
        };
    }
}
