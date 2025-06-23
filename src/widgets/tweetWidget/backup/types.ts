import type { TweetWidgetSettings } from '../types';

/**
 * バックアップの種類
 */
export type BackupType = 'daily' | 'weekly' | 'monthly' | 'incremental' | 'manual';

/**
 * 世代バックアップ設定
 */
export interface GenerationBackupConfig {
    daily: {
        enabled: boolean;
        retentionDays: number;        // 保持日数（デフォルト: 30）
        createTime: string;           // 作成時刻（例: "02:00"）
    };
    weekly: {
        enabled: boolean;
        retentionWeeks: number;       // 保持週数（デフォルト: 12）
        dayOfWeek: number;            // 作成曜日（0=日曜, 6=土曜）
        createTime: string;
    };
    monthly: {
        enabled: boolean;
        retentionMonths: number;      // 保持月数（デフォルト: 12）
        dayOfMonth: number;           // 作成日（1-28）
        createTime: string;
    };
    incremental: {
        enabled: boolean;
        maxCount: number;             // 最大保持数（デフォルト: 1000）
        compressAfterDays: number;    // 圧縮するまでの日数
    };
}

/**
 * バックアップファイル情報
 */
export interface BackupFileInfo {
    id: string;                       // ユニークID
    type: BackupType;
    filePath: string;                 // バックアップファイルのパス
    timestamp: number;                // 作成タイムスタンプ
    size: number;                     // ファイルサイズ（バイト）
    checksum: string;                 // チェックサム（整合性確認用）
    compressed: boolean;              // 圧縮されているか
    description?: string;             // 説明（手動バックアップ用）
    
    // 世代バックアップ特有
    generation?: {
        period: string;               // 例: "2024-01-15", "2024-W03", "2024-01"
        previousBackupId?: string;    // 前回のバックアップID
    };
    
    // 差分バックアップ特有  
    incremental?: {
        baseBackupId: string;         // ベースとなるバックアップID
        changedPostsCount: number;    // 変更された投稿数
        diffSize: number;             // 差分データサイズ
    };
}

/**
 * バックアップインデックス
 */
export interface BackupIndex {
    version: string;
    lastUpdated: number;
    config: GenerationBackupConfig;
    backups: BackupFileInfo[];
    
    // 統計情報
    statistics: {
        totalBackups: number;
        totalSize: number;
        oldestBackup?: number;
        newestBackup?: number;
        corruptedBackups: string[];   // 破損したバックアップID
    };
}

/**
 * 復元オプション
 */
export interface RestoreOptions {
    backupId: string;
    type: 'full' | 'incremental' | 'hybrid';
    
    // 復元前の安全対策
    createCurrentBackup?: boolean;   // 現在のデータをバックアップ
    verifyIntegrity?: boolean;       // 復元前に整合性確認
    
    // 復元範囲
    restoreRange?: {
        startDate?: number;
        endDate?: number;
        includeDeleted?: boolean;
    };
}

/**
 * バックアップ処理結果
 */
export interface BackupResult {
    success: boolean;
    backupId?: string;
    filePath?: string;
    error?: string;
    
    // 処理統計
    stats: {
        processedPosts: number;
        createdFiles: number;
        totalSize: number;
        processingTime: number;
    };
}

/**
 * 復元処理結果
 */
export interface RestoreResult {
    success: boolean;
    restoredData?: TweetWidgetSettings;
    error?: string;
    
    // 復元統計
    stats: {
        restoredPosts: number;
        processedBackups: number;
        totalSize: number;
        processingTime: number;
    };
}

/**
 * バックアップ検証結果
 */
export interface VerificationResult {
    backupId: string;
    isValid: boolean;
    errors: string[];
    
    // 詳細情報
    details: {
        checksumMatch: boolean;
        fileExists: boolean;
        dataIntegrity: boolean;
        sizeMatch: boolean;
    };
}

/**
 * バックアップスケジュール
 */
export interface BackupSchedule {
    type: BackupType;
    nextRun: number;
    intervalMs: number;
    enabled: boolean;
    lastRun?: number;
    lastResult?: BackupResult;
}

/**
 * デフォルトバックアップ設定
 */
export const DEFAULT_BACKUP_CONFIG: GenerationBackupConfig = {
    daily: {
        enabled: true,
        retentionDays: 30,
        createTime: "02:00"
    },
    weekly: {
        enabled: true,
        retentionWeeks: 12,
        dayOfWeek: 0, // 日曜日
        createTime: "02:30"
    },
    monthly: {
        enabled: true,
        retentionMonths: 12,
        dayOfMonth: 1,
        createTime: "03:00"
    },
    incremental: {
        enabled: true,
        maxCount: 1000,
        compressAfterDays: 7
    }
}; 