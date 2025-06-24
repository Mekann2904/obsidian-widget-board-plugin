import { App } from 'obsidian';
import { GenerationBackupManager } from './GenerationBackupManager';
import { IncrementalBackupManager } from './IncrementalBackupManager';
import type {
    BackupIndex,
    BackupFileInfo,
    BackupCollection,
    RestoreResult,
    GenerationBackupConfig,
    BackupResult,
    RestoreOptions,
    BackupCheckResult
} from './types';
import { DEFAULT_BACKUP_CONFIG } from './types';
import type { TweetWidgetSettings } from '../types';
import { BackupUtils } from './BackupUtils';
import { DiffCalculator } from '../versionControl/DiffCalculator';

/**
 * バックアップ管理の中核となるクラス
 * 世代バックアップと差分バックアップを統合管理
 */
export class BackupManager {
    private app: App;
    private basePath: string;
    private backupPath: string;
    private generationManager: GenerationBackupManager;
    private incrementalManager: IncrementalBackupManager;
    private config: GenerationBackupConfig;
    private lastSaveData: TweetWidgetSettings | null = null;
    private isPerformanceOptimizationEnabled: boolean = true;

    constructor(app: App, basePath: string) {
        this.app = app;
        this.basePath = basePath;
        // バックアップファイルを.obsidianディレクトリ内のプラグイン専用フォルダに保存
        // Vault外に移すことでObsidianのインデックスへの影響を回避
        this.backupPath = `${app.vault.configDir}/plugins/obsidian-widget-board-plugin/backups`;
        this.config = DEFAULT_BACKUP_CONFIG;
        
        this.generationManager = new GenerationBackupManager(app, this.basePath);
        this.incrementalManager = new IncrementalBackupManager(app, this.basePath);
        
        console.log('[BackupManager] 初期化完了 - バックアップパス:', this.backupPath);
        
        // 古いバックアップファイルの自動マイグレーション
        this.migrateOldBackupsIfNeeded().catch(error => {
            console.warn('[BackupManager] バックアップマイグレーションエラー:', error);
        });
    }

    /**
     * 古い場所のバックアップファイルを新しい場所に移行
     */
    private async migrateOldBackupsIfNeeded(): Promise<void> {
        try {
            const oldBackupPath = `${this.basePath}/backups`;
            const oldIndexPath = `${oldBackupPath}/index.json`;
            
            // 古いインデックスファイルが存在するかチェック
            const oldIndexExists = await this.app.vault.adapter.exists(oldIndexPath);
            if (!oldIndexExists) {
                console.log('[BackupManager] 古いバックアップファイルはありません。マイグレーション不要。');
                return;
            }
            
            console.log('[BackupManager] 古いバックアップファイルを検出。マイグレーションを開始します。');
            
            // 新しいバックアップディレクトリを作成
            await BackupUtils.ensureDirectory(this.app, this.backupPath);
            await BackupUtils.ensureDirectory(this.app, `${this.backupPath}/generations`);
            await BackupUtils.ensureDirectory(this.app, `${this.backupPath}/incremental`);
            
            // 古いインデックスファイルを読み込み
            const oldIndexContent = await this.app.vault.adapter.read(oldIndexPath);
            const oldIndex = JSON.parse(oldIndexContent) as BackupIndex;
            
            let migratedCount = 0;
            let errorCount = 0;
            
            // 世代バックアップファイルを移行
            for (const backup of oldIndex.backups.generations) {
                try {
                    await this.migrateBackupFile(backup, oldBackupPath, 'generations');
                    migratedCount++;
                } catch (error) {
                    console.warn(`[BackupManager] 世代バックアップファイル移行失敗: ${backup.id}`, error);
                    errorCount++;
                }
            }
            
            // 差分バックアップファイルを移行
            for (const backup of oldIndex.backups.incremental) {
                try {
                    await this.migrateBackupFile(backup, oldBackupPath, 'incremental');
                    migratedCount++;
                } catch (error) {
                    console.warn(`[BackupManager] 差分バックアップファイル移行失敗: ${backup.id}`, error);
                    errorCount++;
                }
            }
            
            // 新しい場所にインデックスファイルを作成（ファイルパスを更新）
            await this.updateBackupPathsInIndex(oldIndex);
            
            console.log(`[BackupManager] マイグレーション完了: ${migratedCount}件成功, ${errorCount}件失敗`);
            
            // 古いバックアップディレクトリを削除（オプション）
            try {
                await this.cleanupOldBackupDirectory(oldBackupPath);
            } catch (error) {
                console.warn('[BackupManager] 古いバックアップディレクトリの削除に失敗:', error);
            }
            
        } catch (error) {
            console.error('[BackupManager] バックアップマイグレーションエラー:', error);
        }
    }

    /**
     * 個別のバックアップファイルを移行
     */
    private async migrateBackupFile(backup: BackupFileInfo, oldBackupPath: string, subDir: 'generations' | 'incremental'): Promise<void> {
        // 古いファイルパスを推測
        const possibleOldPaths = [
            backup.filePath,
            `${oldBackupPath}/${backup.id}.json`,
            `${oldBackupPath}/${subDir}/${backup.id}.json`,
            `${oldBackupPath}/${subDir}/${backup.type}/${backup.generation?.period || backup.id}.json`
        ];
        
        let oldFilePath: string | null = null;
        let fileContent: string | null = null;
        
        // 古いファイルを見つける
        for (const path of possibleOldPaths) {
            try {
                if (await this.app.vault.adapter.exists(path)) {
                    fileContent = await this.app.vault.adapter.read(path);
                    oldFilePath = path;
                    break;
                }
            } catch (error) {
                // 無視して次のパスを試行
            }
        }
        
        if (!oldFilePath || !fileContent) {
            throw new Error(`古いバックアップファイルが見つかりません: ${backup.id}`);
        }
        
        // 新しいファイルパスを生成
        let newFilePath: string;
        if (subDir === 'incremental') {
            newFilePath = `${this.backupPath}/incremental/${backup.id}.json`;
        } else {
            const backupType = backup.type || 'daily';
            const period = backup.generation?.period || backup.id;
            newFilePath = `${this.backupPath}/generations/${backupType}/${period}.json`;
            
            // ディレクトリを作成
            await BackupUtils.ensureDirectory(this.app, `${this.backupPath}/generations/${backupType}`);
        }
        
        // 新しい場所にファイルを作成
        await this.app.vault.adapter.write(newFilePath, fileContent);
        
        // バックアップ情報のファイルパスを更新
        backup.filePath = newFilePath;
        
        console.log(`[BackupManager] ファイル移行完了: ${oldFilePath} -> ${newFilePath}`);
    }

    /**
     * インデックス内のバックアップファイルパスを更新して保存
     */
    private async updateBackupPathsInIndex(oldIndex: BackupIndex): Promise<void> {
        // 新しいパス情報でインデックスを保存
        await this.saveBackupIndex(oldIndex);
    }

    /**
     * 古いバックアップディレクトリを削除
     */
    private async cleanupOldBackupDirectory(oldBackupPath: string): Promise<void> {
        // 念のため、ディレクトリが空かどうかを確認してから削除
        try {
            const indexExists = await this.app.vault.adapter.exists(`${oldBackupPath}/index.json`);
            if (indexExists) {
                await this.app.vault.adapter.remove(`${oldBackupPath}/index.json`);
            }
            
            // generationsディレクトリの削除を試行
            try {
                const generationsPath = `${oldBackupPath}/generations`;
                const genExists = await this.app.vault.adapter.exists(generationsPath);
                if (genExists) {
                    await this.app.vault.adapter.remove(generationsPath);
                }
            } catch (error) {
                console.warn('[BackupManager] generationsディレクトリ削除失敗:', error);
            }
            
            // incrementalディレクトリの削除を試行
            try {
                const incrementalPath = `${oldBackupPath}/incremental`;
                const incExists = await this.app.vault.adapter.exists(incrementalPath);
                if (incExists) {
                    await this.app.vault.adapter.remove(incrementalPath);
                }
            } catch (error) {
                console.warn('[BackupManager] incrementalディレクトリ削除失敗:', error);
            }
            
            // 最後にbackupsディレクトリ自体を削除
            await this.app.vault.adapter.remove(oldBackupPath);
            
            console.log('[BackupManager] 古いバックアップディレクトリを削除しました:', oldBackupPath);
        } catch (error) {
            console.warn('[BackupManager] 古いバックアップディレクトリ削除時にエラー:', error);
        }
    }

    private async loadBackupIndex(): Promise<BackupIndex> {
        const indexPath = `${this.backupPath}/index.json`;
        try {
            const exists = await this.app.vault.adapter.exists(indexPath);
            if (!exists) {
                console.log('[BackupManager] index.json が見つからないため、初期化します。');
                const initialIndex: BackupIndex = {
                    version: "1.0.0",
                    lastUpdated: Date.now(),
                    config: {
                        daily: { enabled: true, retentionDays: 30, createTime: "02:00" },
                        weekly: { enabled: true, retentionWeeks: 12, dayOfWeek: 0, createTime: "02:30" },
                        monthly: { enabled: true, retentionMonths: 12, dayOfMonth: 1, createTime: "03:00" },
                        incremental: { enabled: true, maxCount: 1000, compressAfterDays: 7 }
                    },
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
            const rawIndex = JSON.parse(jsonData) as Partial<BackupIndex>;

            // 不足しているフィールドを補完
            const completeIndex: BackupIndex = {
                version: rawIndex.version || "1.0.0",
                lastUpdated: rawIndex.lastUpdated ?? 0,
                config: rawIndex.config || DEFAULT_BACKUP_CONFIG,
                backups: {
                    generations: rawIndex.backups?.generations || [],
                    incremental: rawIndex.backups?.incremental || []
                },
                statistics: {
                    totalBackups: rawIndex.statistics?.totalBackups ?? 0,
                    totalSize: rawIndex.statistics?.totalSize ?? 0,
                    oldestBackup: rawIndex.statistics?.oldestBackup,
                    newestBackup: rawIndex.statistics?.newestBackup,
                    corruptedBackups: rawIndex.statistics?.corruptedBackups || []
                }
            };
            return completeIndex;
        } catch (error) {
            BackupUtils.logError('BackupManager', 'loadBackupIndex', error);
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

    private async saveBackupIndex(index: BackupIndex): Promise<void> {
        const indexPath = `${this.backupPath}/index.json`;
        try {
            index.lastUpdated = Date.now();
            index.statistics = this.recalculateStatistics(index);
            await this.app.vault.adapter.write(indexPath, JSON.stringify(index, null, 2));
        } catch (error) {
            BackupUtils.logError('BackupManager', 'saveBackupIndex', error);
            throw error;
        }
    }

    private recalculateStatistics(index: BackupIndex): BackupIndex['statistics'] {
        const allBackups = [...index.backups.generations, ...index.backups.incremental];
        const totalBackups = allBackups.length;
        const totalSize = allBackups.reduce((sum, b) => sum + (b.size || 0), 0);
        const timestamps = allBackups.map(b => b.timestamp);
        const newestBackup = totalBackups > 0 ? Math.max(...timestamps) : 0;
        const oldestBackup = totalBackups > 0 ? Math.min(...timestamps) : 0;
        const corruptedBackups = index.statistics?.corruptedBackups || [];

        return {
            totalBackups,
            totalSize,
            newestBackup,
            oldestBackup,
            corruptedBackups
        };
    }

    private async addBackupToIndex(backupInfo: BackupFileInfo): Promise<void> {
        const index = await this.loadBackupIndex();
        
        if (backupInfo.type === 'incremental') {
            index.backups.incremental.push(backupInfo);
            index.backups.incremental.sort((a, b) => b.timestamp - a.timestamp);
        } else {
            const existingIndex = index.backups.generations.findIndex(b =>
                b.generation?.period && b.generation.period === backupInfo.generation?.period &&
                b.type === backupInfo.type
            );

            if (existingIndex !== -1) {
                const oldBackup = index.backups.generations[existingIndex];
                console.log(`[BackupManager] 既存の世代バックアップを置換: ${oldBackup.id} -> ${backupInfo.id}`);
                index.backups.generations[existingIndex] = backupInfo;
            } else {
                index.backups.generations.push(backupInfo);
            }
            index.backups.generations.sort((a, b) => b.timestamp - a.timestamp);
        }
        
        await this.saveBackupIndex(index);
    }

    private async removeBackupFromIndex(backupId: string): Promise<void> {
        const index = await this.loadBackupIndex();
        const originalGenerationsCount = index.backups.generations.length;
        const originalIncrementalCount = index.backups.incremental.length;

        index.backups.generations = index.backups.generations.filter(b => b.id !== backupId);
        index.backups.incremental = index.backups.incremental.filter(b => b.id !== backupId);

        if (index.backups.generations.length < originalGenerationsCount ||
            index.backups.incremental.length < originalIncrementalCount) {
            console.log(`[BackupManager] インデックスからバックアップを削除: ${backupId}`);
            await this.saveBackupIndex(index);
        }
    }

    async onDataSave(currentData: TweetWidgetSettings, commitMessage?: string): Promise<void> {
        console.log('[BackupManager] onDataSave() 開始', { commitMessage });
        
        try {
            const index = await this.loadBackupIndex();
            const config = index.config;
            const latestBackup = index.backups.generations[0] || index.backups.incremental[0];

            // 重要な変更を検出
            const isImportantChange = commitMessage && (
                commitMessage.includes('ツイート作成') ||
                commitMessage.includes('ツイート削除') ||
                commitMessage.includes('ツイート重要変更') ||
                commitMessage.includes('スレッド削除')
            );

            if (config.incremental.enabled) {
                const previousData = this.lastSaveData;
                
                // lastSaveDataがない場合は、最初の保存として差分バックアップを有効にする準備
                if (!previousData) {
                    console.log('[BackupManager] 初回データ保存のため、次回から差分バックアップが利用可能になります');
                    // 最初の保存なので、単純に記録するだけ
                } else {
                    // 条件を緩和：軽微な変更でも差分バックアップを作成
                    const hasDataChanges = this.hasSignificantDataChanges(previousData, currentData);
                    
                    // 条件を緩和：コミットメッセージがあるか、変更があれば差分バックアップを作成
                    const shouldCreateIncremental = commitMessage || isImportantChange || hasDataChanges;
                    
                    if (shouldCreateIncremental) {
                        let baseBackupId = latestBackup?.id;
                        
                        // ベースバックアップがない場合は作成
                        if (!baseBackupId) {
                            console.log('[BackupManager] ベースバックアップが見つからないため作成します');
                            const baseBackupInfo = await this.generationManager.createGenerationBackup(currentData, 'daily');
                            if (baseBackupInfo) {
                                await this.addBackupToIndex(baseBackupInfo);
                                console.log(`[BackupManager] ベースバックアップ作成完了: ${baseBackupInfo.id}`);
                                baseBackupId = baseBackupInfo.id;
                            }
                        }
                        
                        if (baseBackupId) {
                            console.log('[BackupManager] 差分バックアップ作成開始 - 理由:', commitMessage || '自動検出');
                            const incrementalInfo = await this.incrementalManager.createIncrementalBackup(
                                currentData,
                                previousData,
                                baseBackupId
                            );
                            
                            if (incrementalInfo) {
                                await this.addBackupToIndex(incrementalInfo);
                                console.log(`[BackupManager] 差分バックアップ作成完了: ${incrementalInfo.id} (理由: ${commitMessage || '自動検出'})`);
                            } else {
                                console.log('[BackupManager] 差分がないため差分バックアップをスキップ');
                            }
                        }
                    } else {
                        console.log('[BackupManager] 変更が検出されませんでした');
                    }
                }
            }

            await this.checkAndCreateGenerationBackups(currentData, index);

            this.lastSaveData = JSON.parse(JSON.stringify(currentData));
            console.log('[BackupManager] onDataSave() 完了');
        } catch (error) {
            BackupUtils.logError('BackupManager', 'onDataSave', error);
        }
    }

    /**
     * データに変更があるかどうかを判定（条件を緩和）
     */
    private hasSignificantDataChanges(previousData: TweetWidgetSettings, currentData: TweetWidgetSettings): boolean {
        // JSON文字列として比較（最も確実な方法）
        const prevDataStr = JSON.stringify(previousData);
        const currDataStr = JSON.stringify(currentData);
        
        if (prevDataStr !== currDataStr) {
            console.log('[BackupManager] データ変更検出（JSON比較）');
            return true;
        }

        // 投稿数の変化をチェック
        const prevPostCount = previousData.posts?.length || 0;
        const currPostCount = currentData.posts?.length || 0;
        
        if (prevPostCount !== currPostCount) {
            console.log(`[BackupManager] 投稿数変化検出: ${prevPostCount} -> ${currPostCount}`);
            return true;
        }

        // 投稿内容の変化をチェック（効率的な比較）
        if (previousData.posts && currentData.posts) {
            const prevPostIds = new Set(previousData.posts.map(p => p.id));
            const currPostIds = new Set(currentData.posts.map(p => p.id));
            
            // 新しい投稿または削除された投稿があるかチェック
            if (prevPostIds.size !== currPostIds.size) {
                console.log('[BackupManager] 投稿ID数変化検出');
                return true;
            }
            
            // 投稿IDの差分をチェック
            for (const id of currPostIds) {
                if (!prevPostIds.has(id)) {
                    console.log(`[BackupManager] 新規投稿検出: ${id}`);
                    return true;
                }
            }
            
            // 投稿内容の変更をチェック（より幅広いフィールド）
            const currPostsById = new Map(currentData.posts.map(p => [p.id, p]));
            for (const prevPost of previousData.posts) {
                const currPost = currPostsById.get(prevPost.id);
                if (currPost) {
                    // より多くのフィールドの変更をチェック
                    if (prevPost.text !== currPost.text ||
                        prevPost.deleted !== currPost.deleted ||
                        prevPost.bookmark !== currPost.bookmark ||
                        prevPost.like !== currPost.like ||
                        prevPost.liked !== currPost.liked ||
                        prevPost.retweet !== currPost.retweet ||
                        prevPost.retweeted !== currPost.retweeted ||
                        prevPost.edited !== currPost.edited ||
                        prevPost.visibility !== currPost.visibility ||
                        JSON.stringify(prevPost.tags) !== JSON.stringify(currPost.tags) ||
                        JSON.stringify(prevPost.files) !== JSON.stringify(currPost.files)) {
                        console.log(`[BackupManager] 投稿内容変更検出: ${prevPost.id}`);
                        return true;
                    }
                }
            }
        }

        // スケジュール投稿の変化もチェック
        const prevScheduledCount = previousData.scheduledPosts?.length || 0;
        const currScheduledCount = currentData.scheduledPosts?.length || 0;
        
        if (prevScheduledCount !== currScheduledCount) {
            console.log(`[BackupManager] スケジュール投稿数変化検出: ${prevScheduledCount} -> ${currScheduledCount}`);
            return true;
        }

        // その他の設定変更をチェック
        if (previousData.userId !== currentData.userId ||
            previousData.userName !== currentData.userName ||
            previousData.verified !== currentData.verified ||
            JSON.stringify(previousData.aiGovernance) !== JSON.stringify(currentData.aiGovernance)) {
            console.log('[BackupManager] ユーザー設定変更検出');
            return true;
        }
        
        console.log('[BackupManager] 変更なし');
        return false;
    }

    async createManualBackup(data: TweetWidgetSettings, type: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<BackupResult> {
        console.log(`[BackupManager] 手動バックアップ作成開始: ${type}`);
        const startTime = Date.now();
        try {
            const backupInfo = await this.generationManager.createGenerationBackup(data, type);
            if (backupInfo) {
                await this.addBackupToIndex(backupInfo);
                console.log(`[BackupManager] 手動バックアップ作成成功: ${backupInfo.id}`);
                return { success: true, backupId: backupInfo.id, filePath: backupInfo.filePath };
            } else {
                throw new Error('世代バックアップファイルの作成に失敗しました。');
            }
        } catch (error) {
            BackupUtils.logError('BackupManager', 'createManualBackup', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
    
    async restoreFromBackup(backupId: string): Promise<RestoreResult> {
        console.log(`[BackupManager] 復元プロセス開始: ${backupId}`);
        try {
            const index = await this.loadBackupIndex();
            console.log(`[BackupManager] インデックス読み込み完了:`, {
                generationsCount: index.backups.generations?.length || 0,
                incrementalCount: index.backups.incremental?.length || 0,
                generations: index.backups.generations?.map(b => ({ id: b.id, type: b.type })) || [],
                incremental: index.backups.incremental?.map(b => ({ id: b.id, type: b.type })) || []
            });
            
            const targetBackup = index.backups.generations.find(b => b.id === backupId) || index.backups.incremental.find(b => b.id === backupId);
            console.log(`[BackupManager] バックアップ検索結果:`, { backupId, found: !!targetBackup });

            if (!targetBackup) {
                console.error(`[BackupManager] バックアップが見つかりません:`, {
                    searchId: backupId,
                    availableGenerations: index.backups.generations?.map(b => b.id) || [],
                    availableIncremental: index.backups.incremental?.map(b => b.id) || []
                });
                return { success: false, error: `バックアップが見つかりません: ${backupId}` };
            }

            let finalData: TweetWidgetSettings | null = null;
            const backupType = BackupUtils.determineBackupType(targetBackup);

            if (backupType === 'generation') {
                finalData = await this.generationManager.restoreFromGeneration(targetBackup);
            } else if (backupType === 'incremental') {
                finalData = await this.restoreFromIncrementalChain(targetBackup, index);
            } else {
                return { success: false, error: `不明なバックアップタイプです: ${targetBackup.type}` };
            }

            if (finalData) {
                console.log(`[BackupManager] 復元成功: ${backupId}`);
                return { success: true, data: finalData, restoredData: finalData };
            } else {
                throw new Error('データの復元に失敗しました。');
            }
        } catch (error) {
            BackupUtils.logError('BackupManager', 'restoreFromBackup', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    private async restoreFromIncrementalChain(
        targetBackup: BackupFileInfo,
        index: BackupIndex
    ): Promise<TweetWidgetSettings | null> {
        const baseBackupId = targetBackup.incremental?.baseBackupId;
        if (!baseBackupId) {
            throw new Error(`差分バックアップにベースIDがありません: ${targetBackup.id}`);
        }

        const baseBackup = index.backups.generations.find(b => b.id === baseBackupId) || index.backups.incremental.find(b => b.id === baseBackupId);
        if (!baseBackup || !baseBackup.generation) {
            throw new Error(`ベースとなる世代バックアップが見つかりません: ${baseBackupId}`);
        }

        let currentData = await this.generationManager.restoreFromGeneration(baseBackup);
        if (!currentData) {
            throw new Error(`ベースバックアップの読み込みに失敗しました: ${baseBackupId}`);
        }

        const chain = this.buildDiffChain(baseBackupId, targetBackup.id, index);
        console.log(`[BackupManager] 差分チェーンを構築: ${chain.length}件`);

        for (const diffBackup of chain) {
            const diffs = await this.incrementalManager.loadIncrementalBackup(diffBackup);
            if (diffs) {
                currentData.posts = DiffCalculator.applyDiffs(currentData.posts, diffs);
            } else {
                console.warn(`差分データの読み込みに失敗したためスキップします: ${diffBackup.id}`);
            }
        }
        
        return currentData;
    }

    private buildDiffChain(baseBackupId: string, targetBackupId: string, index: BackupIndex): BackupFileInfo[] {
        const chain: BackupFileInfo[] = [];
        let currentId = targetBackupId;
    
        while (currentId && currentId !== baseBackupId) {
            const currentBackup = index.backups.generations.find(b => b.id === currentId) || index.backups.incremental.find(b => b.id === currentId);
            if (!currentBackup || !currentBackup.incremental) {
                console.error(`差分チェーンが途切れています。バックアップID: ${currentId} が見つからないか、差分バックアップではありません。`);
                return [];
            }
            chain.unshift(currentBackup);
            currentId = currentBackup.incremental.baseBackupId;
        }
    
        return chain;
    }

    async getAvailableBackups(): Promise<BackupCollection> {
        const index = await this.loadBackupIndex();
        
        // フィールド欠損に備えてフォールバック
        const result = {
            generations: index.backups?.generations || [],
            incremental: index.backups?.incremental || []
        };
        
        return result;
    }

    updateConfig(newConfig: Partial<GenerationBackupConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    private async checkAndCreateGenerationBackups(data: TweetWidgetSettings, index: BackupIndex): Promise<void> {
        const now = new Date();
        const config = index.config;
        
        if (config.daily.enabled && await this.shouldCreateBackup(now, 'daily', index)) {
            const backupInfo = await this.generationManager.createGenerationBackup(data, 'daily');
            if (backupInfo) {
                await this.addBackupToIndex(backupInfo);
                console.log(`[BackupManager] 日次バックアップ作成: ${backupInfo.id}`);
            }
        }
        
        if (config.weekly.enabled && await this.shouldCreateBackup(now, 'weekly', index)) {
            const backupInfo = await this.generationManager.createGenerationBackup(data, 'weekly');
            if (backupInfo) {
                await this.addBackupToIndex(backupInfo);
                console.log(`[BackupManager] 週次バックアップ作成: ${backupInfo.id}`);
            }
        }
        
        if (config.monthly.enabled && await this.shouldCreateBackup(now, 'monthly', index)) {
            const backupInfo = await this.generationManager.createGenerationBackup(data, 'monthly');
            if (backupInfo) {
                await this.addBackupToIndex(backupInfo);
                console.log(`[BackupManager] 月次バックアップ作成: ${backupInfo.id}`);
            }
        }
    }

    private async shouldCreateBackup(now: Date, type: 'daily' | 'weekly' | 'monthly', index: BackupIndex): Promise<boolean> {
        const periodId = BackupUtils.generatePeriodIdentifier(type);
        const lastBackupForPeriod = index.backups.generations.find(b => b.type === type && b.generation?.period === periodId) || index.backups.incremental.find(b => b.type === type && b.generation?.period === periodId);
        return !lastBackupForPeriod;
    }

    async cleanupBackups(): Promise<void> {
        console.log('[BackupManager] バックアップのクリーンアップを開始します。');
        try {
            const index = await this.loadBackupIndex();
            const config = index.config;

            await this.generationManager.cleanupOldBackups(index.backups.generations, config, 'daily');
            await this.generationManager.cleanupOldBackups(index.backups.generations, config, 'weekly');
            await this.generationManager.cleanupOldBackups(index.backups.generations, config, 'monthly');

            const finalIndex = await this.loadBackupIndex();
            const allFiles = new Set(finalIndex.backups.generations.map(b => b.filePath).concat(finalIndex.backups.incremental.map(b => b.filePath)));
            const cleanedBackups = finalIndex.backups.generations.concat(finalIndex.backups.incremental).filter(b => allFiles.has(b.filePath));

            if(cleanedBackups.length < finalIndex.backups.generations.length + finalIndex.backups.incremental.length) {
                finalIndex.backups.generations = cleanedBackups.filter(b => b.type === 'daily' || b.type === 'weekly' || b.type === 'monthly');
                finalIndex.backups.incremental = cleanedBackups.filter(b => b.type === 'incremental');
                await this.saveBackupIndex(finalIndex);
                console.log('[BackupManager] クリーンアップ後のインデックスを更新しました。');
            }

        } catch (error) {
            BackupUtils.logError('BackupManager', 'cleanupBackups', error);
        }
    }

    async checkAllBackupsIntegrity(log: (message: string) => void): Promise<BackupCheckResult[]> {
        const results: BackupCheckResult[] = [];
        log('整合性チェックを開始します...');

        try {
            const backups = await this.getAvailableBackups();
            log(`バックアップ読み込み完了: ${backups.generations.length}件の世代バックアップと${backups.incremental.length}件の差分バックアップ`);

            if (backups.generations.length === 0 && backups.incremental.length === 0) {
                log('チェック対象のバックアップはありません。');
                return [];
            }

            for (const backup of backups.generations) {
                const result = await this.checkBackupIntegrity(backup);
                if (result.success) {
                    log(`✓ バックアップOK: ${backup.id}`);
                } else {
                    log(`✗ バックアップ破損: ${backup.id} - ${result.error}`);
                }
                results.push(result);
            }

            for (const backup of backups.incremental) {
                const result = await this.checkBackupIntegrity(backup);
                if (result.success) {
                    log(`✓ バックアップOK: ${backup.id}`);
                } else {
                    log(`✗ バックアップ破損: ${backup.id} - ${result.error}`);
                }
                results.push(result);
            }

        } catch (error) {
            BackupUtils.logError('BackupManager', 'checkAllBackupsIntegrity', error);
        }

        return results;
    }

    private async checkBackupIntegrity(backup: BackupFileInfo): Promise<BackupCheckResult> {
        try {
            const filePath = backup.filePath;
            const exists = await this.app.vault.adapter.exists(filePath);
            if (!exists) {
                return { success: false, backupId: backup.id, error: `ファイルが見つかりません: ${filePath}` };
            }

            const fileContent = await this.app.vault.adapter.read(filePath);
            const fileSize = Buffer.from(fileContent).length;
            if (fileSize !== backup.size) {
                return { success: false, backupId: backup.id, error: `ファイルサイズが異なります: 期待値: ${backup.size}, 実際: ${fileSize}` };
            }

            return { success: true, backupId: backup.id };
        } catch (error) {
            return { success: false, backupId: backup.id, error: error instanceof Error ? error.message : String(error) };
        }
    }

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
            const result = await this.restoreFromBackup(options.backupId);
            if (!result.success || !result.restoredData) {
                return { success: false, error: result.error || 'プレビューの読み込みに失敗しました' };
            }

            const previewData = result.restoredData;
            const currentPosts = currentData.posts || [];
            const restoredPosts = previewData.posts || [];
            
            const currentPostIds = new Set(currentPosts.map(post => post.id));
            const restoredPostIds = new Set(restoredPosts.map(post => post.id));
            
            const addedPosts = restoredPosts.filter(post => !currentPostIds.has(post.id));
            const removedPosts = currentPosts.filter(post => !restoredPostIds.has(post.id));
            
            const modifiedPosts: { original: any; updated: any }[] = [];
            for (const currentPost of currentPosts) {
                const restoredPost = restoredPosts.find(p => p.id === currentPost.id);
                if (restoredPost && JSON.stringify(currentPost) !== JSON.stringify(restoredPost)) {
                    modifiedPosts.push({
                        original: currentPost,
                        updated: restoredPost
                    });
                }
            }

            return {
                success: true,
                previewData,
                differences: {
                    postsToAdd: addedPosts.length,
                    postsToRemove: removedPosts.length,
                    postsToModify: modifiedPosts.length,
                    addedPosts,
                    removedPosts,
                    modifiedPosts
                }
            };
        } catch (error) {
            console.error('復元プレビューエラー:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

}
