import { Notice } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import { BackupManager } from './BackupManager';
import { TWEET_STRINGS } from '../../../i18n/strings/tweet';
import type { Language } from '../../../i18n/types';
import { BaseModal } from './BaseModal';
import { TweetWidget } from '../tweetWidget';

/**
 * 手動バックアップ作成モーダル
 */
export class ManualBackupModal extends BaseModal {
    private backupManager: BackupManager;
    private currentData: TweetWidgetSettings;
    private onBackupCreated: () => void;
    private language: Language;
    
    private description: string = '';
    private isCreating: boolean = false;

    constructor(
        widget: TweetWidget,
        backupManager: BackupManager,
        currentData: TweetWidgetSettings,
        language: Language,
        onBackupCreated: () => void
    ) {
        super(widget);
        this.backupManager = backupManager;
        this.currentData = currentData;
        this.language = language;
        this.onBackupCreated = onBackupCreated;
        
        // モーダルサイズを設定
        this.setSize('900px', '700px');
    }

    protected t(key: string): string {
        const strings = TWEET_STRINGS as any;
        return strings[key]?.[this.language] || strings[key]?.en || key;
    }

    protected onOpen() {
        this.contentEl.className = 'manual-backup-modal-content';
        this.contentEl.style.cssText = `
            padding: 24px;
            min-height: 600px;
            display: flex;
            flex-direction: column;
        `;

        this.renderHeader();
        this.renderForm();
        this.renderButtons();
    }

    protected onClose() {
        // クリーンアップ処理
    }

    private renderHeader(): void {
        const header = this.createElement({
            tagName: 'div',
            className: 'manual-backup-header',
            children: [
                {
                    tagName: 'h2',
                    textContent: this.t('manualBackupTitle'),
                    className: 'manual-backup-title'
                },
                {
                    tagName: 'p',
                    textContent: this.t('manualBackupDescription'),
                    className: 'manual-backup-subtitle'
                }
            ]
        });

        header.style.cssText = `
            margin-bottom: 24px;
            border-bottom: 1px solid var(--background-modifier-border);
            padding-bottom: 16px;
        `;

        this.contentEl.appendChild(header);
    }

    private renderForm(): void {
        const form = this.createElement({
            tagName: 'div',
            className: 'manual-backup-form'
        });

        form.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 20px;
        `;

        this.renderBackupTypeInfo(form);
        this.renderDescriptionInput(form);
        this.renderDataStats(form);

        this.contentEl.appendChild(form);
    }

    private renderBackupTypeInfo(container: HTMLElement): void {
        const typeSection = this.createElement({
            tagName: 'div',
            className: 'backup-type-section',
            children: [
                {
                    tagName: 'h4',
                    textContent: 'バックアップの種類',
                    className: 'backup-type-title'
                },
                {
                    tagName: 'div',
                    className: 'backup-type-info',
                    children: [
                        {
                            tagName: 'div',
                            textContent: this.t('backupTypeGeneration'),
                            className: 'backup-type-name'
                        },
                        {
                            tagName: 'small',
                            textContent: '完全なデータセットを保存します。復元時に単独で使用可能です。',
                            className: 'backup-type-description'
                        }
                    ]
                }
            ]
        });

        typeSection.style.cssText = `
            padding: 16px;
            background: var(--background-secondary);
            border-radius: 8px;
        `;

        container.appendChild(typeSection);
    }

    private renderDescriptionInput(container: HTMLElement): void {
        const descSection = this.createElement({
            tagName: 'div',
            className: 'description-section'
        });

        const label = this.createElement({
            tagName: 'label',
            textContent: this.t('backupDescriptionLabel'),
            className: 'description-label'
        });

        label.style.cssText = `
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
        `;

        const textArea = this.createElement({
            tagName: 'textarea',
            className: 'description-input',
            attributes: {
                placeholder: this.t('backupDescriptionPlaceholder'),
                rows: '4'
            }
        }) as HTMLTextAreaElement;

        textArea.style.cssText = `
            width: 100%;
            padding: 12px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            background: var(--background-primary);
            color: var(--text-normal);
            font-family: inherit;
            resize: vertical;
            min-height: 80px;
        `;

        textArea.addEventListener('input', () => {
            this.description = textArea.value;
        });

        descSection.appendChild(label);
        descSection.appendChild(textArea);
        container.appendChild(descSection);
    }

    private renderDataStats(container: HTMLElement): void {
        const statsSection = this.createElement({
            tagName: 'div',
            className: 'data-stats-section'
        });

        const title = this.createElement({
            tagName: 'h4',
            textContent: '現在のデータ統計',
            className: 'stats-title'
        });

        title.style.cssText = `
            margin-bottom: 12px;
        `;

        const stats = this.createElement({
            tagName: 'div',
            className: 'data-stats'
        });

        stats.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            padding: 16px;
            background: var(--background-secondary);
            border-radius: 8px;
        `;

        const postsCount = this.currentData.posts?.length || 0;
        const scheduledCount = this.currentData.scheduledPosts?.length || 0;
        const totalSize = JSON.stringify(this.currentData).length;
        const sizeKB = Math.round(totalSize / 1024 * 100) / 100;

        const statItems = [
            { label: '投稿数', value: `${postsCount}件` },
            { label: 'スケジュール投稿', value: `${scheduledCount}件` },
            { label: 'データサイズ', value: `${sizeKB} KB` }
        ];

        statItems.forEach(item => {
            const statEl = this.createElement({
                tagName: 'div',
                className: 'stat-item',
                children: [
                    {
                        tagName: 'div',
                        textContent: item.label,
                        className: 'stat-label'
                    },
                    {
                        tagName: 'div',
                        textContent: item.value,
                        className: 'stat-value'
                    }
                ]
            });

            statEl.style.cssText = `
                text-align: center;
                padding: 8px;
            `;

            stats.appendChild(statEl);
        });

        statsSection.appendChild(title);
        statsSection.appendChild(stats);
        container.appendChild(statsSection);
    }

    private renderButtons(): void {
        const buttonContainer = this.createElement({
            tagName: 'div',
            className: 'manual-backup-buttons'
        });

        buttonContainer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--background-modifier-border);
        `;

        // キャンセルボタン
        const cancelButton = this.createElement({
            tagName: 'button',
            textContent: this.t('cancelButton'),
            className: 'backup-button backup-button-cancel'
        }) as HTMLButtonElement;

        cancelButton.style.cssText = `
            padding: 8px 16px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            background: var(--background-primary);
            color: var(--text-normal);
            cursor: pointer;
        `;

        cancelButton.onclick = () => this.close();

        // 作成ボタン
        const createButton = this.createElement({
            tagName: 'button',
            textContent: this.t('createBackupButton'),
            className: 'backup-button backup-button-create'
        }) as HTMLButtonElement;

        createButton.style.cssText = `
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            background: var(--background-secondary);
            color: var(--text-normal);
            border: 1px solid var(--background-modifier-border);
            cursor: pointer;
            font-weight: bold;
        `;

        createButton.onclick = () => this.createBackup();

        // プログレス表示
        const progressEl = this.createElement({
            tagName: 'div',
            className: 'backup-progress',
            textContent: this.t('creatingBackupMessage')
        });

        progressEl.style.cssText = `
            display: none;
            color: var(--text-muted);
            font-style: italic;
            align-self: center;
        `;

        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(createButton);
        buttonContainer.appendChild(progressEl);

        this.contentEl.appendChild(buttonContainer);
    }

    private async createBackup(): Promise<void> {
        if (this.isCreating) return;

        this.isCreating = true;
        this.showProgress(true);

        try {
            const result = await this.backupManager.createManualBackup(
                this.currentData,
                'daily'  // 手動バックアップは常にdailyタイプとして作成
            );

            if (result.success) {
                new Notice(this.t('manualBackupSuccess'));
                this.onBackupCreated();
                this.close();
            } else {
                throw new Error(result.error || 'Unknown error');
            }

        } catch (error) {
            console.error('手動バックアップエラー:', error);
            new Notice(`${this.t('manualBackupError')}: ${error.message}`);
        } finally {
            this.isCreating = false;
            this.showProgress(false);
        }
    }

    private showProgress(show: boolean): void {
        const progressEl = this.contentEl.querySelector('.backup-progress') as HTMLElement;
        const createButton = this.contentEl.querySelector('.backup-button-create') as HTMLButtonElement;
        
        if (progressEl) {
            progressEl.style.display = show ? 'block' : 'none';
        }
        
        if (createButton) {
            createButton.disabled = show;
            createButton.style.opacity = show ? '0.6' : '1';
        }
    }
} 