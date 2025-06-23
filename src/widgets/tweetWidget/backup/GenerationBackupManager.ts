import { App } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { 
    BackupType, 
    BackupFileInfo, 
    BackupResult, 
    GenerationBackupConfig,
    BackupIndex
} from './types';

/**
 * 世代バックアップマネージャー
 * 日次/週次/月次のフルバックアップを管理
 */
export class GenerationBackupManager {
    private app: App;
    private basePath: string;
    private backupPath: string;

    constructor(app: App, basePath: string) {
        this.app = app;
        this.basePath = basePath;
        this.backupPath = `${basePath}/backups`;
    }

    /**
     * 世代バックアップを作成
     */
    async createGenerationBackup(
        data: TweetWidgetSettings,
        type: 'daily' | 'weekly' | 'monthly',
        config: GenerationBackupConfig
    ): Promise<BackupResult> {
        const startTime = Date.now();
        
        try {
            // バックアップディレクトリを確保
            await this.ensureBackupDirectories();
            
            // 期間識別子を生成
            const period = this.generatePeriodIdentifier(type);
            
            // バックアップIDを生成
            const backupId = `${type}_${period}_${Date.now()}`;
            
            // ファイルパスを決定
            const fileName = `${period}.json`;
            const filePath = `${this.backupPath}/generations/${type}/${fileName}`;
            
            // データを準備（メタデータ付き）
            const backupData = {
                version: "1.0.0",
                type: "generation",
                subType: type,
                timestamp: Date.now(),
                period,
                data: data,
                metadata: {
                    totalPosts: data.posts?.length || 0,
                    createdBy: 'GenerationBackupManager',
                    originalPath: `${this.basePath}/tweets.json`
                }
            };
            
            // ファイルに書き込み
            const jsonData = JSON.stringify(backupData, null, 2);
            await this.app.vault.adapter.write(filePath, jsonData);
            
            // チェックサムを計算
            const checksum = await this.calculateChecksum(jsonData);
            
            // ファイル情報を作成
            const fileInfo: BackupFileInfo = {
                id: backupId,
                type: type,
                filePath: filePath,
                timestamp: Date.now(),
                size: jsonData.length,
                checksum: checksum,
                compressed: false,
                generation: {
                    period: period,
                    previousBackupId: await this.findPreviousBackupId(type, period)
                }
            };
            
            // インデックスを更新
            await this.updateBackupIndex(fileInfo);
            
            // 古いバックアップをクリーンアップ
            await this.cleanupOldBackups(type, config);
            
            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                backupId: backupId,
                filePath: filePath,
                stats: {
                    processedPosts: data.posts?.length || 0,
                    createdFiles: 1,
                    totalSize: jsonData.length,
                    processingTime: processingTime
                }
            };
            
        } catch (error) {
            console.error(`世代バックアップ作成エラー (${type}):`, error);
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
     * 世代バックアップから復元
     */
    async restoreFromGeneration(backupId: string): Promise<TweetWidgetSettings | null> {
        try {
            console.log(`[GenerationBackupManager] 復元開始: バックアップID ${backupId}`);
            
            const index = await this.loadBackupIndex();
            console.log(`[GenerationBackupManager] インデックス読み込み完了: ${index.backups.length}件のバックアップ`);
            
            const backup = index.backups.find(b => b.id === backupId);
            
            if (!backup) {
                console.error(`[GenerationBackupManager] バックアップが見つかりません: ${backupId}`);
                console.log('利用可能なバックアップID:', index.backups.map(b => b.id));
                throw new Error(`バックアップが見つかりません: ${backupId}`);
            }
            
            console.log(`[GenerationBackupManager] バックアップ情報:`, backup);
            
            if (!backup.generation) {
                console.error(`[GenerationBackupManager] 世代バックアップではありません: ${backupId}`, backup);
                throw new Error(`世代バックアップではありません: ${backupId}`);
            }
            
            // Obsidianはvault相対パスで動作するため、パス正規化は不要
            const filePath = backup.filePath;
            console.log(`[GenerationBackupManager] ファイルパス: ${filePath}`);
            
            // ファイル存在確認
            console.log(`[GenerationBackupManager] ファイル存在確認開始`);
            const fileExists = await this.app.vault.adapter.exists(filePath);
            console.log(`[GenerationBackupManager] ファイル存在確認結果: ${fileExists}`);
            
            if (!fileExists) {
                console.error(`[GenerationBackupManager] バックアップファイルが見つかりません: ${filePath}`);
                
                // バックアップディレクトリの内容を確認
                try {
                    const backupDir = filePath.substring(0, filePath.lastIndexOf('/'));
                    console.log(`[GenerationBackupManager] バックアップディレクトリ確認: ${backupDir}`);
                    const dirContents = await this.app.vault.adapter.list(backupDir);
                    console.log(`[GenerationBackupManager] ディレクトリ内容:`, dirContents);
                } catch (dirError) {
                    console.error(`[GenerationBackupManager] ディレクトリ確認エラー:`, dirError);
                }
                
                // インデックスからエントリを削除
                console.log(`[GenerationBackupManager] 存在しないバックアップをインデックスから削除: ${backupId}`);
                await this.removeFromIndex(backupId);
                
                throw new Error(`バックアップファイルが見つかりません: ${filePath}`);
            }
            
            console.log(`[GenerationBackupManager] ファイル読み込み開始: ${filePath}`);
            const jsonData = await this.app.vault.adapter.read(filePath);
            console.log(`[GenerationBackupManager] ファイルサイズ: ${jsonData.length}バイト`);
            
            let backupData;
            try {
                backupData = JSON.parse(jsonData);
                console.log(`[GenerationBackupManager] JSON解析完了`, Object.keys(backupData));
            } catch (parseError) {
                console.error(`[GenerationBackupManager] JSON解析エラー:`, parseError);
                console.log(`[GenerationBackupManager] 破損データの一部:`, jsonData.substring(0, 500));
                throw new Error(`バックアップファイルのJSON解析に失敗: ${parseError.message}`);
            }
            
            // 整合性を確認（チェックサムがある場合のみ）
            if (backup.checksum) {
                console.log(`[GenerationBackupManager] チェックサム検証開始`);
                const calculatedChecksum = await this.calculateChecksum(jsonData);
                console.log(`[GenerationBackupManager] 計算されたチェックサム: ${calculatedChecksum}`);
                console.log(`[GenerationBackupManager] 保存されたチェックサム: ${backup.checksum}`);
                
                if (calculatedChecksum !== backup.checksum) {
                    console.warn(`[GenerationBackupManager] チェックサム不一致 - 復元を続行`);
                    // チェックサム不一致でも復元を続行（警告のみ）
                }
            } else {
                console.log(`[GenerationBackupManager] チェックサム検証をスキップ（チェックサムなし）`);
            }
            
            // データ構造を確認
            if (!backupData.data) {
                console.error(`[GenerationBackupManager] バックアップにdataプロパティがありません:`, Object.keys(backupData));
                console.log(`[GenerationBackupManager] バックアップ全体:`, backupData);
                
                // dataプロパティがない場合、backupData自体がデータかもしれない
                if (backupData.posts || Array.isArray(backupData.posts)) {
                    console.log(`[GenerationBackupManager] dataプロパティなし、直接復元を試行`);
                    return backupData as TweetWidgetSettings;
                }
                
                throw new Error(`バックアップファイルの構造が不正です: dataプロパティが見つかりません`);
            }
            
            const restoredData = backupData.data as TweetWidgetSettings;
            console.log(`[GenerationBackupManager] 復元成功: ${restoredData.posts?.length || 0}件の投稿`);
            
            return restoredData;
            
        } catch (error) {
            console.error(`[GenerationBackupManager] 世代バックアップ復元エラー:`, error);
            return null;
        }
    }

    /**
     * 利用可能な世代バックアップを取得
     */
    async getAvailableGenerations(): Promise<BackupFileInfo[]> {
        try {
            const index = await this.loadBackupIndex();
            return index.backups.filter(backup => backup.generation);
        } catch (error) {
            console.error('世代バックアップ一覧取得エラー:', error);
            return [];
        }
    }

    /**
     * バックアップディレクトリを確保
     */
    private async ensureBackupDirectories(): Promise<void> {
        const directories = [
            this.backupPath,
            `${this.backupPath}/generations`,
            `${this.backupPath}/generations/daily`,
            `${this.backupPath}/generations/weekly`,
            `${this.backupPath}/generations/monthly`,
            `${this.backupPath}/incremental`
        ];

        for (const dir of directories) {
            const exists = await this.app.vault.adapter.exists(dir);
            if (!exists) {
                await this.app.vault.adapter.mkdir(dir);
            }
        }
    }

    /**
     * 期間識別子を生成
     */
    private generatePeriodIdentifier(type: 'daily' | 'weekly' | 'monthly'): string {
        const now = new Date();
        
        switch (type) {
            case 'daily':
                return now.toISOString().split('T')[0]; // YYYY-MM-DD
                
            case 'weekly':
                const year = now.getFullYear();
                const onejan = new Date(year, 0, 1);
                const week = Math.ceil((((now.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
                return `${year}-W${week.toString().padStart(2, '0')}`;
                
            case 'monthly':
                return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
                
            default:
                throw new Error(`未対応のバックアップタイプ: ${type}`);
        }
    }

    /**
     * 前回のバックアップIDを検索
     */
    private async findPreviousBackupId(type: BackupType, currentPeriod: string): Promise<string | undefined> {
        try {
            const index = await this.loadBackupIndex();
            const generationBackups = index.backups
                .filter(b => b.type === type && b.generation)
                .sort((a, b) => b.timestamp - a.timestamp);
                
            // 現在の期間より前の最新のバックアップを探す
            for (const backup of generationBackups) {
                if (backup.generation!.period < currentPeriod) {
                    return backup.id;
                }
            }
            
            return undefined;
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
            
            // 既存のバックアップをチェック（同じ期間の場合は置き換え）
            const existingIndex = index.backups.findIndex(b => 
                b.type === newBackup.type && 
                b.generation?.period === newBackup.generation?.period
            );
            
            if (existingIndex >= 0) {
                // 古いファイルを削除
                const oldBackup = index.backups[existingIndex];
                try {
                    await this.app.vault.adapter.remove(oldBackup.filePath);
                } catch (error) {
                    console.warn('古いバックアップファイル削除に失敗:', error);
                }
                
                index.backups[existingIndex] = newBackup;
            } else {
                index.backups.push(newBackup);
            }
            
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
     * 古いバックアップをクリーンアップ
     */
    private async cleanupOldBackups(type: 'daily' | 'weekly' | 'monthly', config: GenerationBackupConfig): Promise<void> {
        try {
            const index = await this.loadBackupIndex();
            const now = Date.now();
            let retentionMs: number;
            
            // 保持期間を計算
            switch (type) {
                case 'daily':
                    retentionMs = config.daily.retentionDays * 24 * 60 * 60 * 1000;
                    break;
                case 'weekly':
                    retentionMs = config.weekly.retentionWeeks * 7 * 24 * 60 * 60 * 1000;
                    break;
                case 'monthly':
                    retentionMs = config.monthly.retentionMonths * 30 * 24 * 60 * 60 * 1000;
                    break;
            }
            
            // 古いバックアップを特定
            const expiredBackups = index.backups.filter(backup => 
                backup.type === type && 
                (now - backup.timestamp) > retentionMs
            );
            
            // 古いバックアップを削除
            for (const backup of expiredBackups) {
                try {
                    await this.app.vault.adapter.remove(backup.filePath);
                    index.backups = index.backups.filter(b => b.id !== backup.id);
                } catch (error) {
                    console.warn(`バックアップファイル削除に失敗: ${backup.filePath}`, error);
                }
            }
            
            // インデックスを更新
            if (expiredBackups.length > 0) {
                await this.updateBackupIndex(index.backups[index.backups.length - 1] || {} as BackupFileInfo);
            }
            
        } catch (error) {
            console.error('バックアップクリーンアップエラー:', error);
        }
    }

    /**
     * チェックサムを計算
     */
    private async calculateChecksum(data: string): Promise<string> {
        // 簡単なハッシュ実装（実用的にはより堅牢なハッシュを使用）
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit integer
        }
        return hash.toString(16);
    }

    /**
     * インデックスから指定されたバックアップエントリを削除
     */
    private async removeFromIndex(backupId: string): Promise<void> {
        try {
            const index = await this.loadBackupIndex();
            const originalCount = index.backups.length;
            index.backups = index.backups.filter(backup => backup.id !== backupId);
            
            if (index.backups.length < originalCount) {
                index.lastUpdated = Date.now();
                index.statistics.totalBackups = index.backups.length;
                
                // 統計を再計算
                if (index.backups.length > 0) {
                    index.statistics.totalSize = index.backups.reduce((sum, b) => sum + (b.size || 0), 0);
                    index.statistics.newestBackup = Math.max(...index.backups.map(b => b.timestamp));
                    index.statistics.oldestBackup = Math.min(...index.backups.map(b => b.timestamp));
                } else {
                    index.statistics.totalSize = 0;
                    index.statistics.newestBackup = 0;
                    index.statistics.oldestBackup = 0;
                }
                
                const indexPath = `${this.backupPath}/index.json`;
                await this.app.vault.adapter.write(indexPath, JSON.stringify(index, null, 2));
                console.log(`[GenerationBackupManager] インデックスから削除: ${backupId}`);
            }
        } catch (error) {
            console.error(`[GenerationBackupManager] インデックス削除エラー:`, error);
        }
    }
} 