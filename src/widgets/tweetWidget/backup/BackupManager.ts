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

    constructor(app: App, basePath: string) {
        this.app = app;
        this.basePath = basePath;
        this.generationManager = new GenerationBackupManager(app, basePath);
        this.incrementalManager = new IncrementalBackupManager(app, basePath);
        this.config = DEFAULT_BACKUP_CONFIG;
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
     * 手動バックアップ作成
     */
    async createManualBackup(
        data: TweetWidgetSettings, 
        description?: string
    ): Promise<BackupResult> {
        try {
            return await this.generationManager.createGenerationBackup(
                data,
                'daily', // 手動バックアップは日次として扱う
                this.config
            );
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
