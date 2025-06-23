import { App, Modal } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { BackupFileInfo } from './types';
import type { Language } from '../../../i18n/types';
import { TweetWidget } from '../tweetWidget';
import { t } from '../../../i18n';

/**
 * シンプルで確実な復元プレビューモーダル
 * 複雑な差分計算を排除し、基本的な情報のみ表示
 */
export class SimpleRestorePreviewModal extends Modal {
    private widget: TweetWidget;
    private backup: BackupFileInfo;
    private currentData: TweetWidgetSettings;
    private language: Language;
    private onConfirm: (backup: BackupFileInfo, createBackup: boolean) => Promise<void>;

    constructor(
        widget: TweetWidget,
        backup: BackupFileInfo,
        currentData: TweetWidgetSettings,
        language: Language,
        onConfirm: (backup: BackupFileInfo, createBackup: boolean) => Promise<void>
    ) {
        super(widget.app);
        this.widget = widget;
        this.backup = backup;
        this.currentData = currentData;
        this.language = language;
        this.onConfirm = onConfirm;
        
        this.modalEl.addClass('simple-restore-preview-modal');
        this.setTitle('バックアップ復元の確認');
        
        // より高いz-indexを設定（Obsidianの最高レベル）
        this.modalEl.style.zIndex = '100000';
        this.modalEl.style.position = 'fixed';
        
        // モーダル背景も確実に設定
        const backdrop = this.modalEl.parentElement;
        if (backdrop) {
            backdrop.style.zIndex = '99999';
            backdrop.style.position = 'fixed';
        }
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // スタイル設定
        contentEl.style.padding = '20px';
        contentEl.style.minWidth = '500px';
        contentEl.style.maxWidth = '800px';

        // z-indexを強制的に最前面に設定（モーダル開いた後に再設定）
        setTimeout(() => {
            this.forceToFront();
        }, 10);

        // ヘッダー情報
        this.renderHeader();

        // 基本情報
        this.renderBasicInfo();

        // 現在の状況
        this.renderCurrentSituation();

        // 警告メッセージ
        this.renderWarnings();

        // ボタン
        this.renderButtons();
    }

    private renderHeader(): void {
        const headerDiv = this.contentEl.createDiv({ cls: 'preview-header' });
        headerDiv.style.cssText = `
            border-bottom: 2px solid var(--background-modifier-border);
            padding-bottom: 16px;
            margin-bottom: 24px;
        `;

        const title = headerDiv.createEl('h2', { text: 'バックアップ復元の確認' });
        title.style.cssText = `
            margin: 0 0 8px 0;
            color: var(--text-accent);
        `;

        const subtitle = headerDiv.createDiv({ text: '以下のバックアップを復元します' });
        subtitle.style.cssText = `
            color: var(--text-muted);
            font-size: 14px;
        `;
    }

    private renderBasicInfo(): void {
        const infoDiv = this.contentEl.createDiv({ cls: 'backup-basic-info' });
        infoDiv.style.cssText = `
            background: var(--background-secondary);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
        `;

        // バックアップ情報
        const backupDate = new Date(this.backup.timestamp).toLocaleString('ja-JP');
        const backupType = this.backup.type === 'incremental' ? '増分バックアップ' : '世代バックアップ';

        infoDiv.createDiv({ 
            text: `📁 バックアップID: ${this.backup.id}`,
            cls: 'info-item'
        });

        infoDiv.createDiv({ 
            text: `🗓️ 作成日時: ${backupDate}`,
            cls: 'info-item'
        });

        infoDiv.createDiv({ 
            text: `🔧 種類: ${backupType}`,
            cls: 'info-item'
        });

        // コミットメッセージは利用できないため省略

        // スタイル適用
        const infoItems = infoDiv.querySelectorAll('.info-item');
        infoItems.forEach((item: HTMLElement) => {
            item.style.cssText = `
                margin: 8px 0;
                font-size: 14px;
                line-height: 1.4;
            `;
        });
    }

    private renderCurrentSituation(): void {
        const currentDiv = this.contentEl.createDiv({ cls: 'current-situation' });
        currentDiv.style.cssText = `
            border: 1px solid var(--background-modifier-border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
        `;

        const title = currentDiv.createEl('h3', { text: '現在の状況' });
        title.style.cssText = `
            margin: 0 0 12px 0;
            font-size: 16px;
            color: var(--text-normal);
        `;

        const currentPosts = this.currentData.posts?.length || 0;
        const currentScheduled = this.currentData.scheduledPosts?.length || 0;

        currentDiv.createDiv({ 
            text: `📝 現在の投稿数: ${currentPosts}件`,
            cls: 'current-item'
        });

        currentDiv.createDiv({ 
            text: `⏰ スケジュール投稿: ${currentScheduled}件`,
            cls: 'current-item'
        });

        if (this.currentData.userName) {
            currentDiv.createDiv({ 
                text: `👤 ユーザー: ${this.currentData.userName}`,
                cls: 'current-item'
            });
        }

        // スタイル適用
        const currentItems = currentDiv.querySelectorAll('.current-item');
        currentItems.forEach((item: HTMLElement) => {
            item.style.cssText = `
                margin: 6px 0;
                font-size: 14px;
                color: var(--text-muted);
            `;
        });
    }

    private renderWarnings(): void {
        const warningDiv = this.contentEl.createDiv({ cls: 'restore-warnings' });
        warningDiv.style.cssText = `
            background: #ffeaa7;
            border: 1px solid #fdcb6e;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
        `;

        const warningTitle = warningDiv.createEl('h3', { text: '⚠️ 重要な注意事項' });
        warningTitle.style.cssText = `
            margin: 0 0 12px 0;
            font-size: 16px;
            color: #d63031;
        `;

        const warnings = [
            '現在のデータはバックアップにより上書きされます',
            '復元後は元に戻すことができません',
            '安全のため現在のデータの自動バックアップを作成します',
            '復元プロセスには時間がかかる場合があります'
        ];

        warnings.forEach(warning => {
            const warningItem = warningDiv.createDiv({ text: `• ${warning}` });
            warningItem.style.cssText = `
                margin: 6px 0;
                font-size: 14px;
                color: #2d3436;
                padding-left: 8px;
            `;
        });
    }

    private renderButtons(): void {
        const buttonDiv = this.contentEl.createDiv({ cls: 'preview-buttons' });
        buttonDiv.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--background-modifier-border);
        `;

        // 左側：バックアップ作成チェックボックス
        const leftDiv = buttonDiv.createDiv();
        const backupCheckbox = leftDiv.createEl('input', { 
            type: 'checkbox',
            attr: { id: 'create-backup-checkbox' }
        }) as HTMLInputElement;
        backupCheckbox.checked = true;

        const checkboxLabel = leftDiv.createEl('label', { 
            text: ' 復元前に現在のデータをバックアップ',
            attr: { for: 'create-backup-checkbox' }
        });
        checkboxLabel.style.cssText = `
            margin-left: 8px;
            font-size: 14px;
            cursor: pointer;
        `;

        // 右側：アクションボタン
        const rightDiv = buttonDiv.createDiv();
        rightDiv.style.display = 'flex';
        rightDiv.style.gap = '12px';

        const cancelBtn = rightDiv.createEl('button', { text: 'キャンセル' });
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-primary);
            color: var(--text-normal);
            cursor: pointer;
        `;
        cancelBtn.onclick = () => this.close();

        const confirmBtn = rightDiv.createEl('button', { text: '復元を実行' });
        confirmBtn.style.cssText = `
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            background: var(--interactive-accent);
            color: var(--text-on-accent);
            cursor: pointer;
            font-weight: 500;
        `;

        confirmBtn.onclick = async () => {
            try {
                confirmBtn.disabled = true;
                confirmBtn.textContent = '復元中...';
                
                await this.onConfirm(this.backup, backupCheckbox.checked);
                this.close();
            } catch (error) {
                console.error('復元エラー:', error);
                confirmBtn.disabled = false;
                confirmBtn.textContent = '復元を実行';
                // エラー表示
                const errorDiv = this.contentEl.createDiv({ 
                    text: `エラー: ${error instanceof Error ? error.message : String(error)}`,
                    cls: 'restore-error'
                });
                errorDiv.style.cssText = `
                    color: #d63031;
                    background: #ffeaa7;
                    padding: 8px;
                    border-radius: 4px;
                    margin-top: 12px;
                    font-size: 14px;
                `;
            }
        };

        // ホバー効果
        cancelBtn.onmouseenter = () => {
            cancelBtn.style.background = 'var(--background-modifier-hover)';
        };
        cancelBtn.onmouseleave = () => {
            cancelBtn.style.background = 'var(--background-primary)';
        };

        confirmBtn.onmouseenter = () => {
            confirmBtn.style.background = 'var(--interactive-accent-hover)';
        };
        confirmBtn.onmouseleave = () => {
            confirmBtn.style.background = 'var(--interactive-accent)';
        };
    }

    /**
     * モーダルを強制的に最前面に表示
     */
    private forceToFront(): void {
        console.log('[SimpleRestorePreviewModal] 最前面表示を強制実行');
        
        // モーダル本体
        this.modalEl.style.zIndex = '100000';
        this.modalEl.style.position = 'fixed';
        
        // 親要素も含めて設定
        let current = this.modalEl.parentElement;
        while (current && current !== document.body) {
            if (current.classList.contains('modal-container') || 
                current.classList.contains('modal-bg') ||
                current.style.position === 'fixed') {
                current.style.zIndex = '99999';
                current.style.position = 'fixed';
            }
            current = current.parentElement;
        }
        
        // body直下のモーダル関連要素を検索して設定
        const modalElements = document.querySelectorAll('.modal-container, .modal-bg, [class*="modal"]');
        modalElements.forEach((element: Element) => {
            const htmlElement = element as HTMLElement;
            if (htmlElement.contains(this.modalEl)) {
                htmlElement.style.zIndex = '99999';
                htmlElement.style.position = 'fixed';
            }
        });
        
        console.log('[SimpleRestorePreviewModal] z-index設定完了');
    }
} 