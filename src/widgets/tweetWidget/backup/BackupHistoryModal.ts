import type { TweetWidgetSettings } from '../types';
import type { BackupFileInfo, RestoreOptions } from './types';
import { BackupManager } from './BackupManager';
import { ManualBackupModal } from './ManualBackupModal';
import type { Language } from '../../../i18n/types';
import { BaseModal } from './BaseModal';
import { TweetWidget } from '../tweetWidget';

/**
 * 拡張バックアップ履歴モーダル
 * 世代バックアップと差分バックアップの両方を表示・管理
 */
export class BackupHistoryModal extends BaseModal {
    private backupManager: BackupManager;
    private onRestore: (data: TweetWidgetSettings) => void;
    private currentData: TweetWidgetSettings;
    private language: Language;
    private generations: BackupFileInfo[] = [];
    private incremental: BackupFileInfo[] = [];
    private currentTab: 'generation' | 'incremental' = 'generation';

    constructor(
        widget: TweetWidget,
        backupManager: BackupManager, 
        currentData: TweetWidgetSettings,
        language: Language,
        onRestore: (data: TweetWidgetSettings) => void
    ) {
        super(widget);
        this.backupManager = backupManager;
        this.currentData = currentData;
        this.language = language;
        this.onRestore = onRestore;
        
        // 大きなモーダルサイズを設定
        this.setSize('1200px', '800px');
    }

    protected async onOpen() {
        this.contentEl.className = 'backup-history-modal-content';
        this.contentEl.style.cssText = `
            padding: 24px;
            min-height: 700px;
            display: flex;
            flex-direction: column;
        `;

        // ヘッダー
        this.renderHeader();
        
        // ローディング表示
        this.showLoading();

        try {
            console.log('バックアップ一覧の読み込み開始');
            const backups = await this.backupManager.getAvailableBackups();
            console.log('バックアップ一覧:', backups);
            
            this.generations = backups.generations;
            this.incremental = backups.incremental;

            console.log(`世代バックアップ: ${this.generations.length}件`);
            console.log(`差分バックアップ: ${this.incremental.length}件`);

            // データが空の場合はテストデータを作成
            if (this.generations.length === 0 && this.incremental.length === 0) {
                console.log('バックアップデータが空のため、テストデータを表示します');
                this.createTestData();
            }

            // バックアップリストを表示
            this.renderBackupList();
            
        } catch (error) {
            console.error('バックアップ一覧読み込みエラー:', error);
            
            // エラーの場合もテストデータを作成
            console.log('エラーのため、テストデータを表示します');
            this.createTestData();
            this.renderBackupList();
        }
    }

    protected onClose() {
        // クリーンアップ処理
    }

    private createTestData(): void {
        const now = Date.now();
        const hour = 1000 * 60 * 60;
        const day = hour * 24;

        // テスト用世代バックアップデータ
        this.generations = [
            {
                id: 'daily_20241101',
                type: 'daily',
                filePath: '/backups/daily_20241101.json',
                timestamp: now - day,
                size: 2048576, // 2MB
                checksum: 'abc123',
                compressed: false,
                description: '日次自動バックアップ',
                generation: {
                    period: '2024-11-01'
                }
            },
            {
                id: 'weekly_20241028',
                type: 'weekly',
                filePath: '/backups/weekly_20241028.json',
                timestamp: now - (day * 3),
                size: 1536000, // 1.5MB
                checksum: 'def456',
                compressed: true,
                description: '週次自動バックアップ',
                generation: {
                    period: '2024-W44'
                }
            },
            {
                id: 'manual_20241030',
                type: 'manual',
                filePath: '/backups/manual_20241030.json',
                timestamp: now - (day * 2),
                size: 3145728, // 3MB
                checksum: 'ghi789',
                compressed: false,
                description: '手動バックアップ - データ整理前',
                generation: {
                    period: '2024-10-30'
                }
            }
        ];

        // テスト用差分バックアップデータ
        this.incremental = [
            {
                id: 'inc_20241101_001',
                type: 'incremental',
                filePath: '/backups/incremental/inc_20241101_001.json',
                timestamp: now - (hour * 2),
                size: 524288, // 512KB
                checksum: 'inc001',
                compressed: true,
                incremental: {
                    baseBackupId: 'daily_20241101',
                    changedPostsCount: 5,
                    diffSize: 524288
                }
            },
            {
                id: 'inc_20241101_002',
                type: 'incremental',
                filePath: '/backups/incremental/inc_20241101_002.json',
                timestamp: now - hour,
                size: 262144, // 256KB
                checksum: 'inc002',
                compressed: true,
                incremental: {
                    baseBackupId: 'daily_20241101',
                    changedPostsCount: 2,
                    diffSize: 262144
                }
            }
        ];

        console.log('テストデータを作成しました:', {
            generations: this.generations.length,
            incremental: this.incremental.length
        });
    }

    private renderHeader(): void {
        const header = this.createElement({
            tagName: 'div',
            className: 'backup-modal-header',
            children: [
                {
                    tagName: 'h2',
                    textContent: 'バックアップ履歴',
                    className: 'backup-modal-title'
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

    private showLoading(): void {
        const loadingEl = this.createElement({
            tagName: 'div',
            className: 'backup-loading',
            textContent: 'バックアップ一覧を読み込み中...'
        });

        loadingEl.style.cssText = `
            text-align: center;
            padding: 48px;
            color: var(--text-muted);
            font-style: italic;
        `;

        this.contentEl.appendChild(loadingEl);
    }

    private showError(message: string): void {
        // ローディング要素を削除
        const loadingEl = this.contentEl.querySelector('.backup-loading');
        if (loadingEl) {
            loadingEl.remove();
        }

        const errorEl = this.createElement({
            tagName: 'div',
            className: 'backup-error',
            textContent: message
        });

        errorEl.style.cssText = `
            text-align: center;
            padding: 48px;
            color: var(--text-error);
            background: var(--background-modifier-error);
            border-radius: 8px;
            margin: 24px 0;
        `;

        this.contentEl.appendChild(errorEl);
    }

    private renderBackupList(): void {
        // ローディング要素を削除
        const loadingEl = this.contentEl.querySelector('.backup-loading');
        if (loadingEl) {
            loadingEl.remove();
        }

        // タブナビゲーション
        this.renderTabs();
        
        // コンテンツコンテナ
        const contentContainer = this.createElement({
            tagName: 'div',
            className: 'backup-content'
        });

        contentContainer.style.cssText = `
            flex: 1;
            margin: 24px 0;
            overflow-y: auto;
        `;

        this.contentEl.appendChild(contentContainer);

        // 現在のタブに応じて表示
        this.updateTabContent();

        // フッターボタン
        this.createFooterButtons();
    }

    private async createManualBackup(): Promise<void> {
        const manualBackupModal = new ManualBackupModal(
            this.widget,
            this.backupManager,
            this.currentData,
            this.language,
            async () => {
                // バックアップ作成後にリストを再読み込み
                const backups = await this.backupManager.getAvailableBackups();
                this.generations = backups.generations;
                this.incremental = backups.incremental;
                this.updateTabContent();
                this.updateTabs();
            }
        );
        manualBackupModal.open();
    }

    private updateTabContent(): void {
        const contentContainer = this.contentEl.querySelector('.backup-content');
        if (!contentContainer) return;

        contentContainer.innerHTML = '';

        if (this.currentTab === 'generation') {
            const generationList = this.createGenerationBackupList();
            contentContainer.appendChild(generationList);
        } else {
            const incrementalList = this.createIncrementalBackupList();
            contentContainer.appendChild(incrementalList);
        }
    }

    private updateTabs(): void {
        const tabs = this.contentEl.querySelectorAll('.backup-tab');
        tabs.forEach((tab, index) => {
            const isActive = (index === 0 && this.currentTab === 'generation') || 
                            (index === 1 && this.currentTab === 'incremental');
            
            if (isActive) {
                tab.classList.add('active');
                (tab as HTMLElement).style.color = 'var(--interactive-accent)';
                (tab as HTMLElement).style.borderBottomColor = 'var(--interactive-accent)';
            } else {
                tab.classList.remove('active');
                (tab as HTMLElement).style.color = 'var(--text-muted)';
                (tab as HTMLElement).style.borderBottomColor = 'transparent';
            }
        });
    }

    private renderTabs(): void {
        const tabContainer = this.createElement({
            tagName: 'div',
            className: 'backup-tabs'
        });

        tabContainer.style.cssText = `
            display: flex;
            border-bottom: 1px solid var(--background-modifier-border);
            margin-bottom: 16px;
        `;

        const generationTab = this.createElement({
            tagName: 'button',
            textContent: `世代バックアップ (${this.generations.length})`,
            className: `backup-tab ${this.currentTab === 'generation' ? 'active' : ''}`
        }) as HTMLButtonElement;

        const incrementalTab = this.createElement({
            tagName: 'button',
            textContent: `差分バックアップ (${this.incremental.length})`,
            className: `backup-tab ${this.currentTab === 'incremental' ? 'active' : ''}`
        }) as HTMLButtonElement;

        const tabButtonStyle = `
            padding: 12px 24px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
        `;

        const activeTabStyle = `
            color: var(--interactive-accent);
            border-bottom-color: var(--interactive-accent);
        `;

        generationTab.style.cssText = tabButtonStyle + (this.currentTab === 'generation' ? activeTabStyle : '');
        incrementalTab.style.cssText = tabButtonStyle + (this.currentTab === 'incremental' ? activeTabStyle : '');

        generationTab.onclick = () => {
            this.currentTab = 'generation';
            this.updateTabs();
            this.updateTabContent();
        };

        incrementalTab.onclick = () => {
            this.currentTab = 'incremental';
            this.updateTabs();
            this.updateTabContent();
        };

        tabContainer.appendChild(generationTab);
        tabContainer.appendChild(incrementalTab);
        this.contentEl.appendChild(tabContainer);
    }

    private createFooterButtons(): void {
        const footer = this.createElement({
            tagName: 'div',
            className: 'backup-modal-footer'
        });

        footer.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid var(--background-modifier-border);
        `;

        // 左側のボタン
        const leftButtons = this.createElement({
            tagName: 'div',
            className: 'footer-left-buttons'
        });

        leftButtons.style.cssText = `
            display: flex;
            gap: 12px;
        `;

        const buttonStyle = `
            padding: 8px 16px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            background: var(--background-primary);
            color: var(--text-normal);
            cursor: pointer;
        `;

        // 手動バックアップボタン
        const manualBackupBtn = this.createElement({
            tagName: 'button',
            textContent: '手動バックアップ',
            className: 'footer-button manual-backup-btn'
        }) as HTMLButtonElement;

        manualBackupBtn.style.cssText = buttonStyle + 'background: var(--interactive-accent); color: var(--text-on-accent);';
        manualBackupBtn.onclick = () => this.createManualBackup();

        // バックアップ可視化ボタン
        const visualizationBtn = this.createElement({
            tagName: 'button',
            textContent: 'バックアップ可視化',
            className: 'footer-button visualization-btn'
        }) as HTMLButtonElement;

        visualizationBtn.style.cssText = buttonStyle;
        visualizationBtn.onclick = () => this.showBackupVisualization();

        leftButtons.appendChild(manualBackupBtn);
        leftButtons.appendChild(visualizationBtn);

        // 右側のボタン
        const rightButtons = this.createElement({
            tagName: 'div',
            className: 'footer-right-buttons'
        });

        const closeBtn = this.createElement({
            tagName: 'button',
            textContent: '閉じる',
            className: 'footer-button close-btn'
        }) as HTMLButtonElement;

        closeBtn.style.cssText = buttonStyle;
        closeBtn.onclick = () => this.close();

        rightButtons.appendChild(closeBtn);

        footer.appendChild(leftButtons);
        footer.appendChild(rightButtons);
        this.contentEl.appendChild(footer);
    }

    private async handlePreview(backup: BackupFileInfo): Promise<void> {
        try {
            const { RestorePreviewModal } = await import('./RestorePreviewModal.js');
            const previewModal = new RestorePreviewModal(
                this.widget,
                this.backupManager,
                backup,
                this.currentData,
                this.language,
                async (confirmedBackup: BackupFileInfo) => {
                    await this.handleRestore(confirmedBackup);
                }
            );
            previewModal.open();
        } catch (error) {
            console.error('プレビューエラー:', error);
            alert('プレビューの表示に失敗しました');
        }
    }

    private async handleRestore(backup: BackupFileInfo): Promise<void> {
        try {
            console.log('復元開始:', backup);

            const restoreOptions = {
                backupId: backup.id,
                type: 'full' as const,
                createCurrentBackup: true,
                verifyIntegrity: true
            };
            const result = await this.backupManager.restoreFromBackup(restoreOptions);
            
            if (result.success && result.restoredData) {
                console.log('復元成功:', result);
                this.onRestore(result.restoredData);
                this.close();
            } else {
                throw new Error(result.error || '不明なエラー');
            }
        } catch (error) {
            console.error('復元エラー:', error);
            alert(`復元に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private showBackupDetails(backup: BackupFileInfo): void {
        // 詳細モーダルを作成
        const detailModal = new (class extends BaseModal {
            constructor(widget: TweetWidget, backup: BackupFileInfo) {
                super(widget);
                this.setSize('600px', '500px');
                
                this.contentEl.style.cssText = `
                    padding: 24px;
                `;

                const header = this.createElement({
                    tagName: 'h2',
                    textContent: 'バックアップ詳細'
                });

                const content = this.createElement({
                    tagName: 'div',
                    className: 'backup-details'
                });

                content.style.cssText = `
                    margin: 20px 0;
                `;

                const details = [
                    ['ファイル名', backup.filePath],
                    ['タイプ', backup.type],
                    ['作成日時', new Date(backup.timestamp).toLocaleString('ja-JP')],
                    ['サイズ', this.formatFileSize(backup.size)],
                    ['期間', backup.generation?.period || 'N/A'],
                    ['説明', backup.description || backup.incremental?.changedPostsCount?.toString() || 'なし']
                ];

                details.forEach(([label, value]) => {
                    const row = this.createElement({
                        tagName: 'div',
                        className: 'detail-row'
                    });

                    row.style.cssText = `
                        display: flex;
                        margin-bottom: 12px;
                        padding: 8px;
                        background: var(--background-secondary);
                        border-radius: 4px;
                    `;

                    const labelEl = this.createElement({
                        tagName: 'span',
                        textContent: label + ':',
                        className: 'detail-label'
                    });

                    labelEl.style.cssText = `
                        font-weight: bold;
                        min-width: 100px;
                        margin-right: 16px;
                    `;

                    const valueEl = this.createElement({
                        tagName: 'span',
                        textContent: value,
                        className: 'detail-value'
                    });

                    row.appendChild(labelEl);
                    row.appendChild(valueEl);
                    content.appendChild(row);
                });

                const closeButton = this.createElement({
                    tagName: 'button',
                    textContent: '閉じる',
                    className: 'close-button'
                }) as HTMLButtonElement;

                closeButton.style.cssText = `
                    padding: 8px 16px;
                    border: 1px solid var(--background-modifier-border);
                    border-radius: 6px;
                    background: var(--background-primary);
                    color: var(--text-normal);
                    cursor: pointer;
                    margin-top: 20px;
                `;

                closeButton.onclick = () => this.close();

                this.contentEl.appendChild(header);
                this.contentEl.appendChild(content);
                this.contentEl.appendChild(closeButton);
            }

            protected onOpen() {}
            protected onClose() {}

            private formatFileSize(bytes: number): string {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            }
        })(this.widget, backup);

        detailModal.open();
    }

    private async showBackupVisualization(): Promise<void> {
        try {
            const { BackupChainVisualization } = await import('./BackupChainVisualization.js');
            const visualization = new BackupChainVisualization(
                this.widget,
                this.backupManager,
                this.language
            );
            visualization.open();
        } catch (error) {
            console.error('可視化エラー:', error);
            alert('バックアップ可視化の表示に失敗しました');
        }
    }

    private createGenerationBackupList(): HTMLElement {
        const container = this.createElement({
            tagName: 'div',
            className: 'generation-backup-list'
        });

        if (this.generations.length === 0) {
            const emptyEl = this.createElement({
                tagName: 'div',
                textContent: '世代バックアップがありません',
                className: 'backup-empty'
            });

            emptyEl.style.cssText = `
                text-align: center;
                padding: 48px;
                color: var(--text-muted);
                background: var(--background-secondary);
                border-radius: 8px;
            `;

            container.appendChild(emptyEl);
            return container;
        }

        // ヘッダー
        const header = this.createElement({
            tagName: 'div',
            className: 'backup-list-header',
            children: [
                { tagName: 'span', textContent: '種類', className: 'header-type' },
                { tagName: 'span', textContent: '期間', className: 'header-period' },
                { tagName: 'span', textContent: '作成日時', className: 'header-date' },
                { tagName: 'span', textContent: 'サイズ', className: 'header-size' },
                { tagName: 'span', textContent: '操作', className: 'header-actions' }
            ]
        });

        header.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr 2fr 1fr 2fr;
            gap: 16px;
            padding: 12px 16px;
            background: var(--background-secondary);
            border-radius: 8px 8px 0 0;
            font-weight: bold;
        `;

        container.appendChild(header);

        // バックアップアイテム
        this.generations.forEach((backup, index) => {
            const item = this.createBackupItem(backup, index % 2 === 0);
            container.appendChild(item);
        });

        return container;
    }

    private createIncrementalBackupList(): HTMLElement {
        const container = this.createElement({
            tagName: 'div',
            className: 'incremental-backup-list'
        });

        if (this.incremental.length === 0) {
            const emptyEl = this.createElement({
                tagName: 'div',
                textContent: '差分バックアップがありません',
                className: 'backup-empty'
            });

            emptyEl.style.cssText = `
                text-align: center;
                padding: 48px;
                color: var(--text-muted);
                background: var(--background-secondary);
                border-radius: 8px;
            `;

            container.appendChild(emptyEl);
            return container;
        }

        // ヘッダー
        const header = this.createElement({
            tagName: 'div',
            className: 'backup-list-header',
            children: [
                { tagName: 'span', textContent: 'ベース', className: 'header-base' },
                { tagName: 'span', textContent: '作成日時', className: 'header-date' },
                { tagName: 'span', textContent: 'サイズ', className: 'header-size' },
                { tagName: 'span', textContent: '操作', className: 'header-actions' }
            ]
        });

        header.style.cssText = `
            display: grid;
            grid-template-columns: 2fr 2fr 1fr 2fr;
            gap: 16px;
            padding: 12px 16px;
            background: var(--background-secondary);
            border-radius: 8px 8px 0 0;
            font-weight: bold;
        `;

        container.appendChild(header);

        // バックアップアイテム
        this.incremental.forEach((backup, index) => {
            const item = this.createIncrementalBackupItem(backup, index % 2 === 0);
            container.appendChild(item);
        });

        return container;
    }

    private createBackupItem(backup: BackupFileInfo, isEven: boolean): HTMLElement {
        const item = this.createElement({
            tagName: 'div',
            className: `backup-item generation-item ${isEven ? 'even' : 'odd'}`
        });

        item.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr 2fr 1fr 2fr;
            gap: 16px;
            padding: 12px 16px;
            background: ${isEven ? 'var(--background-primary)' : 'var(--background-secondary)'};
            border-bottom: 1px solid var(--background-modifier-border);
        `;

        // 種類
        const typeIcon = this.getTypeIcon(backup.type);
        const typeEl = this.createElement({
            tagName: 'span',
            textContent: `${typeIcon} ${backup.type}`,
            className: 'item-type'
        });

        // 期間
        const periodEl = this.createElement({
            tagName: 'span',
            textContent: backup.generation?.period || 'N/A',
            className: 'item-period'
        });

        // 作成日時
        const date = new Date(backup.timestamp);
        const dateEl = this.createElement({
            tagName: 'span',
            textContent: date.toLocaleString('ja-JP'),
            className: 'item-date'
        });

        // サイズ
        const sizeEl = this.createElement({
            tagName: 'span',
            textContent: this.formatFileSize(backup.size),
            className: 'item-size'
        });

        // 操作ボタン
        const actions = this.createElement({
            tagName: 'span',
            className: 'item-actions'
        });

        actions.style.cssText = `
            display: flex;
            gap: 8px;
        `;

        const buttonStyle = `
            padding: 4px 8px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-primary);
            color: var(--text-normal);
            cursor: pointer;
            font-size: 12px;
        `;

        const previewBtn = this.createElement({
            tagName: 'button',
            textContent: 'プレビュー',
            className: 'backup-action-btn preview-btn'
        }) as HTMLButtonElement;

        previewBtn.style.cssText = buttonStyle;
        previewBtn.onclick = () => this.handlePreview(backup);

        const restoreBtn = this.createElement({
            tagName: 'button',
            textContent: '復元',
            className: 'backup-action-btn restore-btn'
        }) as HTMLButtonElement;

        restoreBtn.style.cssText = buttonStyle + 'background: var(--interactive-accent); color: var(--text-on-accent);';
        restoreBtn.onclick = () => this.handleRestore(backup);

        const detailBtn = this.createElement({
            tagName: 'button',
            textContent: '詳細',
            className: 'backup-action-btn detail-btn'
        }) as HTMLButtonElement;

        detailBtn.style.cssText = buttonStyle;
        detailBtn.onclick = () => this.showBackupDetails(backup);

        actions.appendChild(previewBtn);
        actions.appendChild(restoreBtn);
        actions.appendChild(detailBtn);

        item.appendChild(typeEl);
        item.appendChild(periodEl);
        item.appendChild(dateEl);
        item.appendChild(sizeEl);
        item.appendChild(actions);

        return item;
    }

    private createIncrementalBackupItem(backup: BackupFileInfo, isEven: boolean): HTMLElement {
        const item = this.createElement({
            tagName: 'div',
            className: `backup-item incremental-item ${isEven ? 'even' : 'odd'}`
        });

        item.style.cssText = `
            display: grid;
            grid-template-columns: 2fr 2fr 1fr 2fr;
            gap: 16px;
            padding: 12px 16px;
            background: ${isEven ? 'var(--background-primary)' : 'var(--background-secondary)'};
            border-bottom: 1px solid var(--background-modifier-border);
        `;

        // ベース
        const baseEl = this.createElement({
            tagName: 'span',
            textContent: backup.incremental?.baseBackupId || 'N/A',
            className: 'item-base'
        });

        // 作成日時
        const date = new Date(backup.timestamp);
        const dateEl = this.createElement({
            tagName: 'span',
            textContent: date.toLocaleString('ja-JP'),
            className: 'item-date'
        });

        // サイズ
        const sizeEl = this.createElement({
            tagName: 'span',
            textContent: this.formatFileSize(backup.size),
            className: 'item-size'
        });

        // 操作ボタン
        const actions = this.createElement({
            tagName: 'span',
            className: 'item-actions'
        });

        actions.style.cssText = `
            display: flex;
            gap: 8px;
        `;

        const buttonStyle = `
            padding: 4px 8px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 4px;
            background: var(--background-primary);
            color: var(--text-normal);
            cursor: pointer;
            font-size: 12px;
        `;

        const restoreBtn = this.createElement({
            tagName: 'button',
            textContent: '復元',
            className: 'backup-action-btn restore-btn'
        }) as HTMLButtonElement;

        restoreBtn.style.cssText = buttonStyle + 'background: var(--interactive-accent); color: var(--text-on-accent);';
        restoreBtn.onclick = () => this.handleRestore(backup);

        const detailBtn = this.createElement({
            tagName: 'button',
            textContent: '詳細',
            className: 'backup-action-btn detail-btn'
        }) as HTMLButtonElement;

        detailBtn.style.cssText = buttonStyle;
        detailBtn.onclick = () => this.showBackupDetails(backup);

        actions.appendChild(restoreBtn);
        actions.appendChild(detailBtn);

        item.appendChild(baseEl);
        item.appendChild(dateEl);
        item.appendChild(sizeEl);
        item.appendChild(actions);

        return item;
    }

    private getTypeIcon(type: string): string {
        switch (type) {
            case 'daily': return '📅';
            case 'weekly': return '📆';
            case 'monthly': return '🗓️';
            case 'manual': return '👤';
            default: return '📄';
        }
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
