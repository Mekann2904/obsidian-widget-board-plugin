import { App } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { 
    BackupType, 
    BackupFileInfo, 
    BackupResult, 
    GenerationBackupConfig,
    BackupIndex
} from './types';
import { BackupUtils } from './BackupUtils';

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
     * 世代バックアップファイルを作成し、その情報を返す。
     * (インデックスの更新は行わない)
     */
    async createGenerationBackup(
        data: TweetWidgetSettings,
        type: 'daily' | 'weekly' | 'monthly'
    ): Promise<BackupFileInfo | null> {
        try {
            const period = BackupUtils.generatePeriodIdentifier(type);
            const backupId = `${type}_${period}_${Date.now()}`;
            const fileName = `${period}.json`;
            const dirPath = `${this.backupPath}/generations/${type}`;
            const filePath = `${dirPath}/${fileName}`;

            await BackupUtils.ensureDirectory(this.app, dirPath);

            const backupData = {
                version: "1.0.0",
                type: "generation",
                subType: type,
                timestamp: Date.now(),
                period,
                data: BackupUtils.validateAndNormalizeTweetSettings(data),
            };

            const jsonData = JSON.stringify(backupData, null, 2);

            // 既存の同名ファイルがあれば上書きする
            await this.app.vault.adapter.write(filePath, jsonData);

            const fileInfo: BackupFileInfo = {
                id: backupId,
                type: type,
                filePath: filePath,
                timestamp: backupData.timestamp,
                size: jsonData.length,
                checksum: BackupUtils.calculateChecksum(jsonData),
                compressed: false,
                generation: { period },
            };

            console.log(`[GenerationBackupManager] 世代バックアップファイルを作成しました: ${backupId}`);
            return fileInfo;
        } catch (error) {
            BackupUtils.logError('GenerationBackupManager', 'createGenerationBackup', error, { type });
            return null;
        }
    }

    /**
     * 世代バックアップファイルからデータを復元する。
     */
    async restoreFromGeneration(
        backupInfo: BackupFileInfo
    ): Promise<TweetWidgetSettings | null> {
        if (!backupInfo.generation) {
            BackupUtils.logError('GenerationBackupManager', 'restoreFromGeneration', new Error('Not a generation backup'), { backupId: backupInfo.id });
            return null;
        }

        try {
            const parseResult = await BackupUtils.safeParseBackupJson(this.app, backupInfo.filePath);

            if (!parseResult.success || !parseResult.data) {
                throw new Error(parseResult.error || 'Failed to parse backup JSON.');
            }
            
            const backupData = parseResult.data;
            if (!backupData.data) {
                throw new Error('Backup data does not contain a "data" property.');
            }
            
            console.log(`[GenerationBackupManager] 世代バックアップを復元しました: ${backupInfo.id}`);
            return BackupUtils.validateAndNormalizeTweetSettings(backupData.data);
        } catch (error) {
            BackupUtils.logError('GenerationBackupManager', 'restoreFromGeneration', error, { backupId: backupInfo.id });
            return null;
        }
    }

    /**
     * 指定されたタイプの古い世代バックアップファイルを削除する。
     * @param availableBackups - 現在有効な全てのバックアップ情報
     * @param config - バックアップ設定
     * @param type - 'daily', 'weekly', 'monthly'
     */
    async cleanupOldBackups(
        availableBackups: BackupFileInfo[],
        config: GenerationBackupConfig,
        type: 'daily' | 'weekly' | 'monthly'
    ): Promise<void> {
        let retentionDays: number;
        switch (type) {
            case 'daily':
                retentionDays = config.daily.retentionDays;
                break;
            case 'weekly':
                retentionDays = config.weekly.retentionWeeks * 7;
                break;
            case 'monthly':
                retentionDays = config.monthly.retentionMonths * 30; // 簡略化
                break;
            default:
                return;
        }

        const now = Date.now();
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

        const backupsForType = availableBackups.filter(b => b.type === type && b.generation);
        const backupsToDelete = backupsForType.filter(b => (now - b.timestamp) > retentionMs);

        for (const backup of backupsToDelete) {
            try {
                // このバックアップに依存する差分バックアップがないか確認する
                const isDependedOn = availableBackups.some(inc => inc.incremental?.baseBackupId === backup.id);
                if (isDependedOn) {
                    console.log(`[GenerationBackupManager] 差分バックアップが依存しているため、世代バックアップを削除しません: ${backup.id}`);
                    continue;
                }

                await this.app.vault.adapter.remove(backup.filePath);
                console.log(`[GenerationBackupManager] 古い世代バックアップファイルを削除しました: ${backup.filePath}`);
            } catch (error) {
                BackupUtils.logError('GenerationBackupManager', 'cleanupOldBackups', error, { backupId: backup.id });
            }
        }
    }
} 