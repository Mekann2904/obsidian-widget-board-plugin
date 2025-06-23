import { App, Modal } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { BackupFileInfo, RestoreOptions } from './types';
import { BackupManager } from './BackupManager';

/**
 * 拡張バックアップ履歴モーダル
 * 世代バックアップと差分バックアップの両方を表示・管理
 */
export class BackupHistoryModal extends Modal {
    private backupManager: BackupManager;
    private onRestore: (data: TweetWidgetSettings) => void;
    private generations: BackupFileInfo[] = [];
    private incremental: BackupFileInfo[] = [];

    constructor(
        app: App, 
        backupManager: BackupManager, 
        onRestore: (data: TweetWidgetSettings) => void
    ) {
        super(app);
        this.backupManager = backupManager;
        this.onRestore = onRestore;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('tweet-backup-modal');

        // ヘッダー
        const headerEl = contentEl.createDiv({ cls: 'backup-modal-header' });
        headerEl.createEl('h2', { text: 'バックアップ履歴' });

        try {
            console.log('バックアップ一覧の読み込み開始');
            const backups = await this.backupManager.getAvailableBackups();
            console.log('バックアップ一覧:', backups);
            
            this.generations = backups.generations;
            this.incremental = backups.incremental;

            console.log(`世代バックアップ: ${this.generations.length}件`);
            console.log(`差分バックアップ: ${this.incremental.length}件`);

            // バックアップリストを表示
            this.renderBackupList();
            
        } catch (error) {
            console.error('バックアップ一覧読み込みエラー:', error);
            contentEl.createEl('p', { 
                text: `バックアップ一覧の読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
                cls: 'error-message'
            });
        }
    }

    private renderBackupList(): void {
        const { contentEl } = this;

        // タブナビゲーション
        const tabContainer = contentEl.createEl('div', { cls: 'backup-tabs' });
        
        const generationTab = tabContainer.createEl('button', { 
            text: `世代バックアップ (${this.generations.length})`, 
            cls: 'backup-tab active' 
        });
        
        const incrementalTab = tabContainer.createEl('button', { 
            text: `差分バックアップ (${this.incremental.length})`, 
            cls: 'backup-tab' 
        });

        // コンテンツコンテナ
        const contentContainer = contentEl.createEl('div', { cls: 'backup-content' });

        // 世代バックアップ表示
        const generationContent = this.createGenerationBackupList();
        const incrementalContent = this.createIncrementalBackupList();

        contentContainer.appendChild(generationContent);
        generationContent.style.display = 'block';
        incrementalContent.style.display = 'none';

        // タブ切り替え
        generationTab.addEventListener('click', () => {
            generationTab.addClass('active');
            incrementalTab.removeClass('active');
            generationContent.style.display = 'block';
            incrementalContent.style.display = 'none';
        });

        incrementalTab.addEventListener('click', () => {
            incrementalTab.addClass('active');
            generationTab.removeClass('active');
            incrementalContent.style.display = 'block';
            generationContent.style.display = 'none';
        });

        contentContainer.appendChild(incrementalContent);

        // フッターボタン
        this.createFooterButtons();
    }

    private createGenerationBackupList(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'generation-backup-list';

        if (this.generations.length === 0) {
            container.createEl('p', { 
                text: '世代バックアップがありません', 
                cls: 'backup-empty' 
            });
            return container;
        }

        // ヘッダー
        const header = container.createEl('div', { cls: 'backup-list-header' });
        header.createEl('span', { text: '種類', cls: 'header-type' });
        header.createEl('span', { text: '期間', cls: 'header-period' });
        header.createEl('span', { text: '作成日時', cls: 'header-date' });
        header.createEl('span', { text: 'サイズ', cls: 'header-size' });
        header.createEl('span', { text: '操作', cls: 'header-actions' });

        // バックアップアイテム
        for (const backup of this.generations) {
            const item = container.createEl('div', { cls: 'backup-item generation-item' });
            
            // 種類
            const typeIcon = this.getTypeIcon(backup.type);
            item.createEl('span', { 
                text: `${typeIcon} ${backup.type}`, 
                cls: 'item-type' 
            });

            // 期間
            item.createEl('span', { 
                text: backup.generation?.period || 'N/A', 
                cls: 'item-period' 
            });

            // 作成日時
            const date = new Date(backup.timestamp);
            item.createEl('span', { 
                text: date.toLocaleString('ja-JP'), 
                cls: 'item-date' 
            });

            // サイズ
            item.createEl('span', { 
                text: this.formatFileSize(backup.size), 
                cls: 'item-size' 
            });

            // 操作ボタン
            const actions = item.createEl('span', { cls: 'item-actions' });
            
            const restoreBtn = actions.createEl('button', { 
                text: '復元', 
                cls: 'backup-action-btn restore-btn' 
            });
            
            restoreBtn.addEventListener('click', () => this.handleRestore(backup));

            const detailBtn = actions.createEl('button', { 
                text: '詳細', 
                cls: 'backup-action-btn detail-btn' 
            });
            
            detailBtn.addEventListener('click', () => this.showBackupDetails(backup));
        }

        return container;
    }

    private createIncrementalBackupList(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'incremental-backup-list';

        if (this.incremental.length === 0) {
            container.createEl('p', { 
                text: '差分バックアップがありません', 
                cls: 'backup-empty' 
            });
            return container;
        }

        // ヘッダー
        const header = container.createEl('div', { cls: 'backup-list-header' });
        header.createEl('span', { text: 'タイムスタンプ', cls: 'header-timestamp' });
        header.createEl('span', { text: 'ベース', cls: 'header-base' });
        header.createEl('span', { text: '変更数', cls: 'header-changes' });
        header.createEl('span', { text: 'サイズ', cls: 'header-size' });
        header.createEl('span', { text: '操作', cls: 'header-actions' });

        // バックアップアイテム
        for (const backup of this.incremental) {
            const item = container.createEl('div', { cls: 'backup-item incremental-item' });
            
            // タイムスタンプ
            const date = new Date(backup.timestamp);
            item.createEl('span', { 
                text: date.toLocaleString('ja-JP'), 
                cls: 'item-timestamp' 
            });

            // ベースバックアップ
            const baseId = backup.incremental?.baseBackupId || 'N/A';
            item.createEl('span', { 
                text: baseId.substring(0, 8) + '...', 
                cls: 'item-base',
                attr: { title: baseId }
            });

            // 変更数
            item.createEl('span', { 
                text: backup.incremental?.changedPostsCount?.toString() || '0', 
                cls: 'item-changes' 
            });

            // サイズ
            item.createEl('span', { 
                text: this.formatFileSize(backup.size), 
                cls: 'item-size' 
            });

            // 操作ボタン
            const actions = item.createEl('span', { cls: 'item-actions' });
            
            const detailBtn = actions.createEl('button', { 
                text: '詳細', 
                cls: 'backup-action-btn detail-btn' 
            });
            
            detailBtn.addEventListener('click', () => this.showBackupDetails(backup));

            // 差分バックアップからの復元は複雑なので、現在は詳細表示のみ
        }

        return container;
    }

    private createFooterButtons(): void {
        const { contentEl } = this;
        
        const footer = contentEl.createEl('div', { cls: 'backup-modal-footer' });
        
        const closeBtn = footer.createEl('button', { 
            text: '閉じる', 
            cls: 'backup-footer-btn close-btn' 
        });
        
        closeBtn.addEventListener('click', () => this.close());

        const manualBackupBtn = footer.createEl('button', { 
            text: '手動バックアップ作成', 
            cls: 'backup-footer-btn manual-backup-btn' 
        });
        
        manualBackupBtn.addEventListener('click', () => this.createManualBackup());
    }

    private async handleRestore(backup: BackupFileInfo): Promise<void> {
        try {
            const confirmed = confirm(
                `バックアップ「${backup.generation?.period}」を復元しますか？\n` +
                `現在のデータは上書きされます。`
            );

            if (!confirmed) return;

            const options: RestoreOptions = {
                backupId: backup.id,
                type: 'full',
                createCurrentBackup: true,
                verifyIntegrity: true
            };

            const result = await this.backupManager.restoreFromBackup(options);

            if (result.success && result.restoredData) {
                this.onRestore(result.restoredData);
                this.close();
                
                // 成功メッセージ
                setTimeout(() => {
                    alert(`バックアップが正常に復元されました。\n復元された投稿数: ${result.stats.restoredPosts}`);
                }, 100);
            } else {
                throw new Error(result.error || '復元に失敗しました');
            }

        } catch (error) {
            console.error('バックアップ復元エラー:', error);
            alert(`復元に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private showBackupDetails(backup: BackupFileInfo): void {
        const modal = new Modal(this.app);
        modal.contentEl.addClass('backup-detail-modal');

        const { contentEl } = modal;
        contentEl.createEl('h3', { text: 'バックアップ詳細' });

        const details = contentEl.createEl('div', { cls: 'backup-details' });

        // 基本情報
        this.addDetailRow(details, 'ID', backup.id);
        this.addDetailRow(details, 'タイプ', backup.type);
        this.addDetailRow(details, 'ファイルパス', backup.filePath);
        this.addDetailRow(details, '作成日時', new Date(backup.timestamp).toLocaleString('ja-JP'));
        this.addDetailRow(details, 'ファイルサイズ', this.formatFileSize(backup.size));
        this.addDetailRow(details, 'チェックサム', backup.checksum);
        this.addDetailRow(details, '圧縮', backup.compressed ? 'はい' : 'いいえ');

        // 世代バックアップ特有の情報
        if (backup.generation) {
            details.createEl('h4', { text: '世代バックアップ情報' });
            this.addDetailRow(details, '期間', backup.generation.period);
            if (backup.generation.previousBackupId) {
                this.addDetailRow(details, '前回バックアップ', backup.generation.previousBackupId);
            }
        }

        // 差分バックアップ特有の情報
        if (backup.incremental) {
            details.createEl('h4', { text: '差分バックアップ情報' });
            this.addDetailRow(details, 'ベースバックアップ', backup.incremental.baseBackupId);
            this.addDetailRow(details, '変更投稿数', backup.incremental.changedPostsCount.toString());
            this.addDetailRow(details, '差分サイズ', this.formatFileSize(backup.incremental.diffSize));
        }

        const closeBtn = contentEl.createEl('button', { 
            text: '閉じる', 
            cls: 'backup-detail-close-btn' 
        });
        closeBtn.addEventListener('click', () => modal.close());

        modal.open();
    }

    private addDetailRow(container: HTMLElement, label: string, value: string): void {
        const row = container.createEl('div', { cls: 'detail-row' });
        row.createEl('span', { text: label + ':', cls: 'detail-label' });
        row.createEl('span', { text: value, cls: 'detail-value' });
    }

    private async createManualBackup(): Promise<void> {
        try {
            // 現在のデータを取得する必要がある（実装は上位から提供される）
            alert('手動バックアップ機能は実装中です');
        } catch (error) {
            console.error('手動バックアップエラー:', error);
            alert('手動バックアップの作成に失敗しました');
        }
    }

    private getTypeIcon(type: string): string {
        switch (type) {
            case 'daily': return '📅';
            case 'weekly': return '📊';
            case 'monthly': return '📋';
            case 'incremental': return '📈';
            case 'manual': return '🔧';
            default: return '📄';
        }
    }

    private formatFileSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
}
