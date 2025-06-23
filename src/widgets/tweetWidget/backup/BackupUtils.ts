import { App } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { BackupFileInfo } from './types';

/**
 * バックアップ機能共通ユーティリティ
 */
export class BackupUtils {
    
    /**
     * ファイルパス解決 - 複数パターンを試行して有効なパスを返す
     */
    static async resolveBackupPath(
        app: App,
        originalPath: string,
        basePath?: string
    ): Promise<{ path: string; exists: boolean }> {
        const patterns = [
            originalPath,
            `/Users/mekann/obsidian/${originalPath}`,
            originalPath.replace(/^040 STORAGE\//, ''),
            basePath ? `${basePath}/../${originalPath}` : null,
            originalPath.replace('040 STORAGE/', '040 STORAGE/')
        ].filter(Boolean) as string[];

        for (const pattern of patterns) {
            try {
                const exists = await app.vault.adapter.exists(pattern);
                if (exists) {
                    return { path: pattern, exists: true };
                }
            } catch (error) {
                console.warn(`[BackupUtils] パスパターン確認エラー: ${pattern}`, error);
            }
        }

        return { path: originalPath, exists: false };
    }

    /**
     * 安全なJSON解析とバリデーション
     */
    static async safeParseBackupJson(
        app: App,
        filePath: string
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            // ファイル存在確認
            const resolvedPath = await this.resolveBackupPath(app, filePath);
            if (!resolvedPath.exists) {
                return { 
                    success: false, 
                    error: `ファイルが見つかりません: ${filePath}` 
                };
            }

            // ファイル読み込み
            const jsonData = await app.vault.adapter.read(resolvedPath.path);
            if (!jsonData || jsonData.trim() === '') {
                return { 
                    success: false, 
                    error: `ファイルが空です: ${resolvedPath.path}` 
                };
            }

            // JSON解析
            const data = JSON.parse(jsonData);
            return { success: true, data };

        } catch (error) {
            return { 
                success: false, 
                error: `JSON解析エラー: ${error instanceof Error ? error.message : String(error)}` 
            };
        }
    }

    /**
     * TweetWidgetSettings のデータ検証と正規化
     */
    static validateAndNormalizeTweetSettings(data: any): TweetWidgetSettings {
        const normalized: TweetWidgetSettings = {
            posts: Array.isArray(data.posts) ? data.posts : [],
            scheduledPosts: Array.isArray(data.scheduledPosts) ? data.scheduledPosts : [],
            userId: data.userId || '@user',
            userName: data.userName || 'ユーザー',
            avatarUrl: data.avatarUrl || '',
            verified: Boolean(data.verified),
            aiGovernance: data.aiGovernance || { minuteMap: {}, dayMap: {} }
        };

        return normalized;
    }

    /**
     * BackupFileInfo のバリデーション
     */
    static validateBackupFileInfo(backup: any): backup is BackupFileInfo {
        return (
            backup &&
            typeof backup.id === 'string' &&
            typeof backup.type === 'string' &&
            typeof backup.filePath === 'string' &&
            typeof backup.timestamp === 'number' &&
            typeof backup.size === 'number'
        );
    }

    /**
     * チェックサム計算（シンプルな実装）
     */
    static calculateChecksum(data: string): string {
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).substring(0, 8);
    }

    /**
     * デフォルト TweetWidgetSettings を生成
     */
    static createDefaultTweetSettings(): TweetWidgetSettings {
        return {
            posts: [],
            scheduledPosts: [],
            userId: '@user',
            userName: 'ユーザー',
            avatarUrl: '',
            verified: false,
            aiGovernance: { minuteMap: {}, dayMap: {} }
        };
    }

    /**
     * エラーログの統一フォーマット
     */
    static logError(component: string, method: string, error: any, context?: any): void {
        console.error(`[${component}] ${method} エラー:`, error);
        if (error instanceof Error) {
            console.error(`[${component}] エラー詳細:`, {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
        if (context) {
            console.error(`[${component}] コンテキスト:`, context);
        }
    }

    /**
     * リトライ付きファイル操作
     */
    static async withRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        delayMs: number = 100
    ): Promise<T> {
        let lastError: any;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
                }
            }
        }
        
        throw lastError;
    }

    /**
     * 安全なディレクトリ作成
     */
    static async ensureDirectory(app: App, dirPath: string): Promise<void> {
        try {
            const exists = await app.vault.adapter.exists(dirPath);
            if (!exists) {
                await app.vault.adapter.mkdir(dirPath);
            }
        } catch (error) {
            console.warn(`[BackupUtils] ディレクトリ作成でエラー: ${dirPath}`, error);
            throw error;
        }
    }

    /**
     * ファイルサイズ取得（エラー時は -1 を返す）
     */
    static async getFileSize(app: App, filePath: string): Promise<number> {
        try {
            const stat = await app.vault.adapter.stat(filePath);
            return stat?.size || -1;
        } catch (error) {
            return -1;
        }
    }

    /**
     * 期間識別子の生成（日次/週次/月次）
     */
    static generatePeriodIdentifier(type: 'daily' | 'weekly' | 'monthly'): string {
        const now = new Date();
        
        switch (type) {
            case 'daily':
                return now.toISOString().split('T')[0]; // YYYY-MM-DD
            case 'weekly':
                const startOfWeek = new Date(now);
                startOfWeek.setDate(now.getDate() - now.getDay());
                return `${startOfWeek.getFullYear()}-W${Math.ceil(startOfWeek.getDate() / 7)}`;
            case 'monthly':
                return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            default:
                return now.toISOString().split('T')[0];
        }
    }

    /**
     * タイムスタンプの人間可読形式変換
     */
    static formatTimestamp(timestamp: number): string {
        return new Date(timestamp).toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * バックアップタイプの判定
     */
    static determineBackupType(backup: BackupFileInfo): 'generation' | 'incremental' | 'unknown' {
        if (backup.generation) return 'generation';
        if (backup.incremental) return 'incremental';
        return 'unknown';
    }
} 