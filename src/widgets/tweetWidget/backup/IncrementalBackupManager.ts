import { App } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { BackupFileInfo, BackupIndex } from './types';
import { DiffCalculator } from '../versionControl/DiffCalculator';
import type { TweetDiff } from '../versionControl/types';
import { BackupUtils } from './BackupUtils';

/**
 * 差分バックアップを管理するクラス
 */
export class IncrementalBackupManager {
	private app: App;
	private basePath: string;
	private backupPath: string;

	constructor(app: App, basePath: string) {
		this.app = app;
		this.basePath = basePath;
		// バックアップファイルを.obsidianディレクトリ内のプラグイン専用フォルダに保存
		this.backupPath = `${app.vault.configDir}/plugins/obsidian-widget-board-plugin/backups`;
	}

	/**
	 * 差分バックアップファイルを作成し、その情報を返す
	 */
	async createIncrementalBackup(
		currentData: TweetWidgetSettings,
		previousData: TweetWidgetSettings,
		baseBackupId: string
	): Promise<BackupFileInfo | null> {
		try {
			const diffs = DiffCalculator.calculateDiffs(previousData.posts, currentData.posts);
			
			// 差分がない場合でも、設定変更があれば最小バックアップを作成
			if (diffs.length === 0) {
				// 設定やメタデータの変更をチェック
				const hasOtherChanges = 
					previousData.userId !== currentData.userId ||
					previousData.userName !== currentData.userName ||
					previousData.verified !== currentData.verified ||
					JSON.stringify(previousData.aiGovernance) !== JSON.stringify(currentData.aiGovernance) ||
					(previousData.scheduledPosts?.length || 0) !== (currentData.scheduledPosts?.length || 0);

				if (!hasOtherChanges) {
					console.log('[IncrementalBackupManager] 差分がないため、バックアップを作成しませんでした。');
					return null;
				} else {
					console.log('[IncrementalBackupManager] 投稿に変更はありませんが、設定変更があるためバックアップを作成します。');
				}
			}

			const timestamp = Date.now();
			const backupId = `incr_${timestamp}`;
			const filePath = `${this.backupPath}/incremental/${backupId}.json`;
			
			await BackupUtils.ensureDirectory(this.app, `${this.backupPath}/incremental`);

			const backupData = {
				id: backupId,
				type: "incremental",
				timestamp: timestamp,
				baseBackupId: baseBackupId,
				diffs: diffs,
				// 設定変更も記録
				settingsChanges: {
					userId: currentData.userId !== previousData.userId ? { from: previousData.userId, to: currentData.userId } : null,
					userName: currentData.userName !== previousData.userName ? { from: previousData.userName, to: currentData.userName } : null,
					verified: currentData.verified !== previousData.verified ? { from: previousData.verified, to: currentData.verified } : null,
					scheduledPostsCount: (currentData.scheduledPosts?.length || 0) !== (previousData.scheduledPosts?.length || 0) ? 
						{ from: previousData.scheduledPosts?.length || 0, to: currentData.scheduledPosts?.length || 0 } : null,
					aiGovernance: JSON.stringify(previousData.aiGovernance) !== JSON.stringify(currentData.aiGovernance) ? 
						{ changed: true } : null
				}
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
					baseBackupId: baseBackupId,
					changedPostsCount: diffs.length,
					diffSize: jsonData.length,
				},
			};

			console.log(`[IncrementalBackupManager] 差分バックアップを作成しました: ${backupId}`);
			return fileInfo;
		} catch (error) {
			BackupUtils.logError('IncrementalBackupManager', 'createIncrementalBackup', error);
			return null;
		}
	}

	/**
	 * 差分バックアップファイルから差分データを読み込む
	 */
	async loadIncrementalBackup(
		backupInfo: BackupFileInfo
	): Promise<TweetDiff[] | null> {
		if (!backupInfo.incremental) {
			BackupUtils.logError('IncrementalBackupManager', 'loadIncrementalBackup', new Error('Not an incremental backup'), { backupId: backupInfo.id });
			return null;
		}

		try {
			const parseResult = await BackupUtils.safeParseBackupJson(this.app, backupInfo.filePath);
			if (parseResult.success && parseResult.data && Array.isArray(parseResult.data.diffs)) {
				return parseResult.data.diffs as TweetDiff[];
			} else {
				throw new Error(parseResult.error || 'Invalid incremental backup file format.');
			}
		} catch (error) {
			BackupUtils.logError('IncrementalBackupManager', 'loadIncrementalBackup', error, { backupId: backupInfo.id });
			return null;
		}
	}
}
