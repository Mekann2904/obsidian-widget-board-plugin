import type { TweetWidgetSettings } from '../types';
import type { BackupFileInfo, RestoreOptions, BackupCollection } from './types';
import { BackupManager } from './BackupManager';
import { ManualBackupModal } from './ManualBackupModal';
import type { Language } from '../../../i18n/types';
import { BaseModal } from './BaseModal';
import { TweetWidget } from '../tweetWidget';
import { BackupChainVisualization } from './BackupChainVisualization';
import { RestorePreviewModal } from './RestorePreviewModal';
import { TestDataProvider } from './TestDataProvider';
import { SimpleRestorePreviewModal } from './SimpleRestorePreviewModal';
import { Notice } from 'obsidian';

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
            console.log('[BackupHistoryModal] バックアップ一覧の読み込み開始');
            const backups = await this.backupManager.getAvailableBackups();
            console.log('[BackupHistoryModal] バックアップ一覧:', backups);
            
            this.generations = backups.generations;
            this.incremental = backups.incremental;

            console.log(`[BackupHistoryModal] 世代バックアップ: ${this.generations.length}件`);
            console.log(`[BackupHistoryModal] 差分バックアップ: ${this.incremental.length}件`);
            
            // 詳細なデバッグ情報
            if (this.generations.length > 0) {
                console.log('[BackupHistoryModal] 世代バックアップ詳細:', this.generations.map(g => ({
                    id: g.id,
                    type: g.type,
                    filePath: g.filePath,
                    timestamp: g.timestamp,
                    generation: g.generation
                })));
            }
            
            if (this.incremental.length > 0) {
                console.log('[BackupHistoryModal] 差分バックアップ詳細:', this.incremental.map(i => ({
                    id: i.id,
                    type: i.type,
                    filePath: i.filePath,
                    timestamp: i.timestamp,
                    incremental: i.incremental
                })));
            } else {
                console.warn('[BackupHistoryModal] 差分バックアップが0件です。以下を確認してください:');
                console.warn('1. 差分バックアップが有効化されているか');
                console.warn('2. データ変更が発生しているか');
                console.warn('3. ベースとなる世代バックアップが存在するか');
                console.warn('4. BackupManagerのlastSaveDataが設定されているか');
                
                // 現在の設定状況をデバッグ出力
                this.debugIncrementalBackupStatus();
            }

            // データが空の場合は適切なメッセージを表示
            if (this.generations.length === 0 && this.incremental.length === 0) {
                console.log('バックアップが作成されていません。手動バックアップの作成を推奨します。');
            }

            // バックアップリストを表示
            this.renderBackupList();
            
        } catch (error) {
            console.error('バックアップ一覧読み込みエラー:', error);
            
            // エラーの場合は空の配列を設定
            this.generations = [];
            this.incremental = [];
            
            this.renderBackupList();
        }
    }

    protected onClose() {
        // クリーンアップ処理
    }

    private renderEmptyBackupMessage(): void {
        const emptyContainer = this.createElement({
            tagName: 'div',
            className: 'empty-backup-container'
        });

        emptyContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 40px;
            text-align: center;
            min-height: 400px;
        `;

        // アイコン
        const icon = this.createElement({
            tagName: 'div',
            className: 'empty-icon'
        });

        icon.style.cssText = `
            font-size: 64px;
            margin-bottom: 24px;
            opacity: 0.3;
            display: flex;
            justify-content: center;
            color: var(--text-muted);
        `;
        
        // シンプルなアイコン表示
        icon.textContent = '■';

        // メインメッセージ
        const title = this.createElement({
            tagName: 'h3',
            textContent: 'バックアップが作成されていません',
            className: 'empty-title'
        });

        title.style.cssText = `
            font-size: 24px;
            margin-bottom: 16px;
            color: var(--text-normal);
        `;

        // 説明文
        const description = this.createElement({
            tagName: 'p',
            textContent: 'データの安全性を確保するため、手動でバックアップを作成することをお勧めします。',
            className: 'empty-description'
        });

        description.style.cssText = `
            font-size: 16px;
            color: var(--text-muted);
            margin-bottom: 32px;
            line-height: 1.5;
            max-width: 400px;
        `;

        // バックアップ作成ボタン
        const createButton = this.createElement({
            tagName: 'button',
            textContent: '今すぐバックアップを作成',
            className: 'mod-cta empty-backup-btn'
        });

        createButton.style.cssText = `
            padding: 12px 24px;
            font-size: 16px;
            border-radius: 6px;
            background: var(--background-secondary);
            color: var(--text-normal);
            border: 1px solid var(--background-modifier-border);
            cursor: pointer;
            margin-bottom: 16px;
        `;

        createButton.addEventListener('click', async () => {
            await this.createManualBackup();
        });

        // 説明リンク
        const helpText = this.createElement({
            tagName: 'p',
            className: 'empty-help'
        });

        helpText.style.cssText = `
            font-size: 14px;
            color: var(--text-muted);
            margin-top: 16px;
        `;

        helpText.innerHTML = `
            バックアップは自動的に作成されます。<br>
            手動作成も可能で、重要な変更前に推奨されます。
        `;

        emptyContainer.appendChild(icon);
        emptyContainer.appendChild(title);
        emptyContainer.appendChild(description);
        emptyContainer.appendChild(createButton);
        emptyContainer.appendChild(helpText);

        this.contentEl.appendChild(emptyContainer);

        // 閉じるボタンも追加
        this.createCloseButton();
    }

    private createCloseButton(): void {
        const closeButtonContainer = this.createElement({
            tagName: 'div',
            className: 'empty-close-container'
        });

        closeButtonContainer.style.cssText = `
            display: flex;
            justify-content: center;
            padding: 20px;
            border-top: 1px solid var(--background-modifier-border);
            margin-top: 20px;
        `;

        const closeButton = this.createElement({
            tagName: 'button',
            textContent: '閉じる',
            className: 'mod-secondary'
        });

        closeButton.style.cssText = `
            padding: 8px 16px;
            border-radius: 4px;
        `;

        closeButton.addEventListener('click', () => {
            this.close();
        });

        closeButtonContainer.appendChild(closeButton);
        this.contentEl.appendChild(closeButtonContainer);
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

        // バックアップが空の場合は特別なメッセージを表示
        if (this.generations.length === 0 && this.incremental.length === 0) {
            this.renderEmptyBackupMessage();
            return;
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
        console.log('[BackupHistoryModal] 手動バックアップ作成開始');
        
        // ローディング表示
        const loadingOverlay = this.createElement({
            tagName: 'div',
            textContent: 'バックアップを作成中...',
            className: 'backup-creating-overlay'
        });
        
        loadingOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 18px;
            z-index: 10000;
        `;
        
        document.body.appendChild(loadingOverlay);
        
        try {
            // 手動バックアップを作成
            const result = await this.backupManager.createManualBackup(this.currentData, 'daily');
            
            if (result.success) {
                console.log('[BackupHistoryModal] 手動バックアップ作成成功:', result);
                
                // バックアップ一覧を再読み込み
                await this.reloadBackupList();
                
                // 成功メッセージ
                new Notice('バックアップが正常に作成されました');
            } else {
                console.error('[BackupHistoryModal] 手動バックアップ作成失敗:', result.error);
                alert(`バックアップの作成に失敗しました: ${result.error}`);
            }
        } catch (error) {
            console.error('[BackupHistoryModal] 手動バックアップ作成エラー:', error);
            alert(`バックアップの作成中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // ローディングオーバーレイを削除
            document.body.removeChild(loadingOverlay);
        }
    }
    
    private async reloadBackupList(): Promise<void> {
        console.log('[BackupHistoryModal] バックアップ一覧を再読み込み中');
        
        // コンテンツをクリア
        this.contentEl.innerHTML = '';
        
        // ヘッダーを再表示
        this.renderHeader();
        
        // バックアップ一覧を再読み込み
        await this.onOpen();
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
                            (tab as HTMLElement).style.color = 'var(--text-normal)';
            (tab as HTMLElement).style.borderBottomColor = 'var(--background-modifier-border)';
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
            color: var(--text-normal);
            border-bottom-color: var(--background-modifier-border);
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

        manualBackupBtn.style.cssText = buttonStyle + 'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);';
        manualBackupBtn.onclick = () => this.createManualBackup();

        // バックアップ可視化ボタン
        const visualizationBtn = this.createElement({
            tagName: 'button',
            textContent: 'バックアップ可視化',
            className: 'footer-button visualization-btn'
        }) as HTMLButtonElement;

        visualizationBtn.style.cssText = buttonStyle;
        visualizationBtn.onclick = () => this.showBackupVisualization();

        // テスト復元ボタン
        const testRestoreBtn = this.createElement({
            tagName: 'button',
            textContent: 'テスト復元',
            className: 'footer-button test-restore-btn'
        }) as HTMLButtonElement;

        testRestoreBtn.style.cssText = buttonStyle + 'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);';
        testRestoreBtn.onclick = () => this.testRestore();

        // 整合性チェックボタン
        const integrityCheckBtn = this.createElement({
            tagName: 'button',
            textContent: '整合性チェック',
            className: 'footer-button integrity-check-btn'
        }) as HTMLButtonElement;

        integrityCheckBtn.style.cssText = buttonStyle + 'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);';
        integrityCheckBtn.onclick = () => this.checkIntegrity();

        // 差分バックアップテストボタン（デバッグ用）
        const testIncrementalBtn = this.createElement({
            tagName: 'button',
            textContent: '差分テスト',
            className: 'footer-button test-incremental-btn'
        }) as HTMLButtonElement;

        testIncrementalBtn.style.cssText = buttonStyle + 'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);';
        testIncrementalBtn.onclick = () => this.testIncrementalBackup();

        leftButtons.appendChild(manualBackupBtn);
        leftButtons.appendChild(visualizationBtn);
        leftButtons.appendChild(testRestoreBtn);
        leftButtons.appendChild(integrityCheckBtn);
        leftButtons.appendChild(testIncrementalBtn);

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
            console.log(`[BackupHistoryModal] シンプルプレビュー開始: ID=${backup.id}, type=${backup.type}`);
            
            // 新しいシンプルプレビューモーダルを使用
            const previewModal = new SimpleRestorePreviewModal(
                this.widget,
                backup,
                this.currentData,
                this.language,
                async (confirmedBackup: BackupFileInfo, createBackup: boolean) => {
                    await this.handleRestoreWithBackup(confirmedBackup, createBackup);
                }
            );
            previewModal.open();
        } catch (error) {
            console.error('プレビューエラー:', error);
            alert('プレビューの表示に失敗しました');
        }
    }

    private async handleRestoreWithBackup(backup: BackupFileInfo, createBackup: boolean): Promise<void> {
        try {
            console.log(`[BackupHistoryModal] handleRestoreWithBackup 開始:`, {
                backupId: backup.id,
                createBackup: createBackup
            });

            if (createBackup) {
                console.log(`[BackupHistoryModal] 復元前に現在のデータのバックアップを作成中...`);
                try {
                    await this.backupManager.createManualBackup(this.currentData);
                    console.log(`[BackupHistoryModal] 復元前バックアップ作成完了`);
                } catch (error) {
                    console.error(`[BackupHistoryModal] 復元前バックアップ作成エラー:`, error);
                    const proceed = confirm(`復元前のバックアップ作成に失敗しました: ${error instanceof Error ? error.message : String(error)}\n\nそれでも復元を続行しますか？`);
                    if (!proceed) {
                        return;
                    }
                }
            }

            await this.handleRestore(backup);
        } catch (error) {
            console.error(`[BackupHistoryModal] handleRestoreWithBackup エラー:`, error);
            alert(`復元に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * バックアップからブランチをチェックアウト
     */
    private async handleCheckout(backup: BackupFileInfo): Promise<void> {
        try {
            console.log(`[BackupHistoryModal] チェックアウト開始:`, {
                id: backup.id,
                type: backup.type,
                timestamp: backup.timestamp
            });

            // プレビューモーダルを表示してユーザーに確認
            const checkoutModal = new SimpleRestorePreviewModal(
                this.widget,
                backup,
                this.currentData,
                this.language,
                async (backup: BackupFileInfo, createBackup: boolean) => {
                    try {
                        // TweetRepositoryのチェックアウトメソッドを呼び出し
                        const success = await this.widget.getRepository().checkoutFromBackup(backup.id, this.language);
                        
                        if (success) {
                            // チェックアウト成功時は強制的にUIを更新
                            console.log('[BackupHistoryModal] チェックアウト成功 - UI強制更新開始');
                            
                            // 複数回のリロードを実行（念のため）
                            await this.widget.reloadTweetData();
                            
                            // 少し待ってからもう一度
                            setTimeout(async () => {
                                console.log('[BackupHistoryModal] 遅延リロード実行');
                                await this.widget.reloadTweetData();
                            }, 100);
                            
                            // さらにもう一度（確実に反映させるため）
                            setTimeout(async () => {
                                console.log('[BackupHistoryModal] 追加遅延リロード実行');
                                this.widget.forceUpdateUI();
                            }, 300);
                            
                            this.close();
                        }
                        
                    } catch (error) {
                        console.error(`[BackupHistoryModal] チェックアウトエラー:`, error);
                        alert(`チェックアウトに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            );
            
            checkoutModal.open();
            
        } catch (error) {
            console.error(`[BackupHistoryModal] チェックアウト処理エラー:`, error);
            alert(`チェックアウト処理に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async handleRestore(backup: BackupFileInfo): Promise<void> {
        try {
            console.log(`[BackupHistoryModal] 復元開始:`, {
                id: backup.id,
                type: backup.type,
                timestamp: backup.timestamp,
                filePath: backup.filePath,
                size: backup.size,
                generation: backup.generation,
                incremental: backup.incremental
            });

            // テストデータかどうかを判定
            const isTestData = TestDataProvider.isTestData(backup.id);
            
            if (isTestData) {
                // テストデータの場合
                console.log(`[BackupHistoryModal] テストデータから復元: ${backup.id}`);
                const restoreResult = await TestDataProvider.restoreFromTestData(backup.id);
                
                if (restoreResult.success && restoreResult.data) {
                    console.log(`[BackupHistoryModal] テストデータ復元成功`);
                    this.onRestore(restoreResult.data);
                    this.close();
                } else {
                    throw new Error(restoreResult.error || 'テストデータの復元に失敗しました');
                }
                return;
            }
            
            // 実際のバックアップの場合
            // バックアップIDから正しい型を判定
            let restoreType: 'full' | 'incremental';
            
            if (backup.id.startsWith('inc_')) {
                restoreType = 'incremental';
                console.log(`[BackupHistoryModal] ID接頭辞により差分バックアップと判定: ${backup.id}`);
            } else if (backup.type === 'incremental' || backup.incremental) {
                restoreType = 'incremental';
                console.log(`[BackupHistoryModal] typeまたはincrementalプロパティにより差分バックアップと判定`);
            } else {
                restoreType = 'full';
                console.log(`[BackupHistoryModal] 世代バックアップと判定`);
            }
            
            console.log(`[BackupHistoryModal] 復元タイプ決定: ${restoreType}`);

            console.log(`[BackupHistoryModal] バックアップマネージャーの復元を開始: ${backup.id}`);
            
            const result = await this.backupManager.restoreFromBackup(backup.id);
            
            console.log(`[BackupHistoryModal] バックアップマネージャー結果:`, {
                success: result.success,
                error: result.error,
                stats: result.stats,
                hasData: !!result.data,
                hasRestoredData: !!result.restoredData
            });
            
            // SimpleBackupManagerは'data'プロパティを返すため、互換性のため両方をチェック
            const restoredData = result.data || result.restoredData;
            
            if (result.success && restoredData) {
                console.log(`[BackupHistoryModal] 復元成功: ${result.stats?.restoredPosts || 'N/A'}件の投稿を復元`);
                console.log(`[BackupHistoryModal] 復元データ詳細:`, {
                    posts: restoredData.posts?.length || 0,
                    scheduledPosts: restoredData.scheduledPosts?.length || 0,
                    keys: Object.keys(restoredData)
                });
                
                // 【重要】復元時もブランチを作成して切り替え
                try {
                    console.log(`[BackupHistoryModal] 復元用ブランチ作成開始: ${backup.id}`);
                    const branchManager = this.widget.getRepository().getBranchManager();
                    const checkoutResult = await branchManager.checkoutFromBackup(
                        backup.id,
                        restoredData,
                        `復元: ${backup.id} (${restoredData.posts?.length || 0}件の投稿)`
                    );
                    
                    if (checkoutResult.success) {
                        console.log(`[BackupHistoryModal] 復元用ブランチ作成成功: ${checkoutResult.branchName}`);
                        
                        // メインファイルも強制上書き
                        const repository = this.widget.getRepository();
                        const dbPath = repository['dbPath']; // プライベートプロパティにアクセス
                        
                        if (dbPath) {
                            console.log(`[BackupHistoryModal] 復元後メインファイル上書き開始`);
                            const sanitizedData = repository['ensureSettingsSchema'](restoredData);
                            const jsonContent = JSON.stringify(sanitizedData, null, 2);
                            
                            // ファイル削除→再作成
                            if (await this.widget.app.vault.adapter.exists(dbPath)) {
                                await this.widget.app.vault.adapter.remove(dbPath);
                            }
                            await this.widget.app.vault.adapter.write(dbPath, jsonContent);
                            console.log(`[BackupHistoryModal] 復元後メインファイル上書き完了`);
                        }
                        
                    } else {
                        console.error(`[BackupHistoryModal] 復元用ブランチ作成失敗: ${checkoutResult.error}`);
                    }
                } catch (branchError) {
                    console.error(`[BackupHistoryModal] 復元用ブランチ作成エラー:`, branchError);
                }
                
                console.log(`[BackupHistoryModal] onRestoreコールバック実行`);
                this.onRestore(restoredData);
                console.log(`[BackupHistoryModal] モーダルクローズ`);
                this.close();
            } else {
                console.error(`[BackupHistoryModal] 復元失敗:`, result.error);
                throw new Error(result.error || '不明なエラー');
            }
        } catch (error) {
            console.error(`[BackupHistoryModal] 復元エラー:`, error);
            console.error(`[BackupHistoryModal] エラー詳細:`, error.stack);
            
            // エラーの詳細情報を追加
            if (error instanceof Error) {
                console.error(`[BackupHistoryModal] エラー名: ${error.name}`);
                console.error(`[BackupHistoryModal] エラーメッセージ: ${error.message}`);
            }
            
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

        const checkoutBtn = this.createElement({
            tagName: 'button',
            textContent: 'チェックアウト',
            className: 'backup-action-btn checkout-btn'
        }) as HTMLButtonElement;

        checkoutBtn.style.cssText = buttonStyle + 'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);';
        checkoutBtn.onclick = () => this.handleCheckout(backup);

        const diagnoseBtn = this.createElement({
            tagName: 'button',
            textContent: '診断',
            className: 'backup-action-btn diagnose-btn'
        }) as HTMLButtonElement;

        diagnoseBtn.style.cssText = buttonStyle + 'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);';
        diagnoseBtn.onclick = () => this.handleDiagnose(backup);

        const detailBtn = this.createElement({
            tagName: 'button',
            textContent: '詳細',
            className: 'backup-action-btn detail-btn'
        }) as HTMLButtonElement;

        detailBtn.style.cssText = buttonStyle;
        detailBtn.onclick = () => this.showBackupDetails(backup);

        actions.appendChild(previewBtn);
        actions.appendChild(checkoutBtn);
        actions.appendChild(diagnoseBtn);
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

        const previewBtn = this.createElement({
            tagName: 'button',
            textContent: 'プレビュー',
            className: 'backup-action-btn preview-btn'
        }) as HTMLButtonElement;

        previewBtn.style.cssText = buttonStyle + 'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); margin-right: 4px;';
        previewBtn.onclick = () => this.handlePreview(backup);

        const checkoutBtn = this.createElement({
            tagName: 'button',
            textContent: 'チェックアウト',
            className: 'backup-action-btn checkout-btn'
        }) as HTMLButtonElement;

        checkoutBtn.style.cssText = buttonStyle + 'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border); margin-right: 4px;';
        checkoutBtn.onclick = () => this.handleCheckout(backup);

        const diagnoseBtn = this.createElement({
            tagName: 'button',
            textContent: '診断',
            className: 'backup-action-btn diagnose-btn'
        }) as HTMLButtonElement;

        diagnoseBtn.style.cssText = buttonStyle + 'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);';
        diagnoseBtn.onclick = () => this.handleDiagnose(backup);

        const detailBtn = this.createElement({
            tagName: 'button',
            textContent: '詳細',
            className: 'backup-action-btn detail-btn'
        }) as HTMLButtonElement;

        detailBtn.style.cssText = buttonStyle;
        detailBtn.onclick = () => this.showBackupDetails(backup);

        actions.appendChild(previewBtn);
        actions.appendChild(checkoutBtn);
        actions.appendChild(diagnoseBtn);
        actions.appendChild(detailBtn);

        item.appendChild(baseEl);
        item.appendChild(dateEl);
        item.appendChild(sizeEl);
        item.appendChild(actions);

        return item;
    }

    private getTypeIcon(type: string): string {
        switch (type) {
            case 'daily': return '□';
            case 'weekly': return '▫';
            case 'monthly': return '▣';
            case 'manual': return '●';
            default: return '◈';
        }
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 診断処理
     */
    private async handleDiagnose(backup: BackupFileInfo): Promise<void> {
        try {
            console.log(`[BackupHistoryModal] 診断開始: ${backup.id}`);
            
            // 基本的な診断を手動で実行
            const diagnosis = await this.performBasicDiagnosis(backup);
            
            // 診断結果をアラートで表示
            let message = `=== バックアップ診断結果 ===\n`;
            message += `バックアップID: ${backup.id}\n`;
            message += `ファイルパス: ${diagnosis.filePath}\n`;
            message += `ファイル存在: ${diagnosis.fileExists ? '✓' : '✗'}\n`;
            message += `ファイル読み込み: ${diagnosis.fileReadable ? '✓' : '✗'}\n`;
            message += `ファイルサイズ: ${diagnosis.fileSize > 0 ? this.formatFileSize(diagnosis.fileSize) : '不明'}\n`;
            message += `JSON解析: ${diagnosis.jsonValid ? '✓' : '✗'}\n`;
            message += `データ構造: ${diagnosis.dataStructureValid ? '✓' : '✗'}\n`;
            
            if (diagnosis.error) {
                message += `\nエラー: ${diagnosis.error}\n`;
            }
            
            alert(message);
            console.log(`[BackupHistoryModal] 診断結果:`, diagnosis);
            
        } catch (error) {
            console.error(`[BackupHistoryModal] 診断エラー:`, error);
            alert(`診断に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 基本的な診断を実行（共通関数を使用）
     */
    private async performBasicDiagnosis(backup: BackupFileInfo): Promise<{
        filePath: string;
        fileExists: boolean;
        fileReadable: boolean;
        fileSize: number;
        jsonValid: boolean;
        dataStructureValid: boolean;
        error?: string;
    }> {
        const filePath = this.getBackupFilePath(backup);
        
        console.log(`[BackupHistoryModal] 基本診断開始: ${backup.id}`);
        console.log(`[BackupHistoryModal] 対象パス: ${filePath}`);
        
        try {
            // ファイル読み込みを共通関数で実行（スマート検索）
            const readResult = await this.readBackupFile(backup);
            
            if (!readResult.success) {
                return {
                    filePath: readResult.actualPath || filePath,
                    fileExists: false,
                    fileReadable: false,
                    fileSize: readResult.size,
                    jsonValid: false,
                    dataStructureValid: false,
                    error: readResult.error
                };
            }

            // JSON解析確認
            let data: any;
            try {
                data = JSON.parse(readResult.content!);
                console.log(`[BackupHistoryModal] JSON解析成功:`, {
                    backupId: backup.id,
                    hasContent: !!readResult.content,
                    contentLength: readResult.content?.length || 0
                });
            } catch (error) {
                console.error(`[BackupHistoryModal] JSON解析エラー:`, error);
                return {
                    filePath,
                    fileExists: true,
                    fileReadable: true,
                    fileSize: readResult.size,
                    jsonValid: false,
                    dataStructureValid: false,
                    error: `JSON解析エラー: ${error instanceof Error ? error.message : String(error)}`
                };
            }

            // データ構造確認
            const dataStructureValid = this.validateDataStructure(data);
            console.log(`[BackupHistoryModal] データ構造検証:`, {
                backupId: backup.id,
                isValid: dataStructureValid,
                hasData: !!data,
                dataKeys: data ? Object.keys(data) : []
            });

            return {
                filePath: readResult.actualPath || filePath,
                fileExists: true,
                fileReadable: true,
                fileSize: readResult.size,
                jsonValid: true,
                dataStructureValid,
                error: dataStructureValid ? undefined : 'データ構造が無効です'
            };

        } catch (error) {
            console.error(`[BackupHistoryModal] 診断処理エラー:`, error);
            return {
                filePath,
                fileExists: false,
                fileReadable: false,
                fileSize: 0,
                jsonValid: false,
                dataStructureValid: false,
                error: `診断処理エラー: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * BackupManagerと同じロジックでベースパスを取得
     */
    private getBackupBasePath(): string {
        // TweetRepositoryと同じロジック: dbPathからファイル名を除いてベースパスを取得
        const dbPath = this.getTweetDbPath();
        return dbPath.replace('/tweets.json', '');
    }

    /**
     * TweetWidgetのgetTweetDbPath()と同じロジックでパスを取得
     */
    private getTweetDbPath(): string {
        const baseFolder = this.widget.plugin.settings.baseFolder || '';
        return baseFolder ? `${baseFolder}/tweets.json` : 'tweets.json';
    }

    /**
     * バックアップファイルの完全パスを取得（実際のファイル構造に基づく）
     */
    private getBackupFilePath(backup: BackupFileInfo): string {
        // バックアップファイルは.obsidianディレクトリ内のプラグイン専用フォルダに保存
        const backupDir = `${this.widget.app.vault.configDir}/plugins/obsidian-widget-board-plugin/backups`;
        
        console.log(`[BackupHistoryModal] パス生成:`, {
            backupId: backup.id,
            backupType: backup.type,
            backupDir,
            hasFilePath: !!backup.filePath,
            originalFilePath: backup.filePath
        });
        
        // 既にfilePath情報がある場合はそれを使用
        if (backup.filePath) {
            console.log(`[BackupHistoryModal] 既存filePathを使用: ${backup.filePath}`);
            return backup.filePath;
        }
        
        // filePathがない場合は推測で構築
        if (backup.id.startsWith('inc_') || backup.type === 'incremental') {
            const fullPath = `${backupDir}/incremental/${backup.id}.json`;
            console.log(`[BackupHistoryModal] 差分バックアップパス（推測）: ${fullPath}`);
            return fullPath;
        } else {
            // 世代バックアップの場合は、GenerationBackupManagerの構造に従う
            // generations/{type}/{period}.json 形式
            const backupType = backup.type || 'daily'; // デフォルトはdaily
            const period = backup.generation?.period || backup.id.split('_')[1] || 'unknown';
            const fullPath = `${backupDir}/generations/${backupType}/${period}.json`;
            console.log(`[BackupHistoryModal] 世代バックアップパス（推測）: ${fullPath}`, {
                backupType,
                period,
                generationInfo: backup.generation
            });
            return fullPath;
        }
    }

    /**
     * ファイル存在確認（ログ付き）
     */
    private async checkFileExists(filePath: string): Promise<boolean> {
        try {
            const exists = await this.widget.app.vault.adapter.exists(filePath);
            console.log(`[BackupHistoryModal] ファイル存在確認: ${filePath} = ${exists}`);
            return exists;
        } catch (error) {
            console.error(`[BackupHistoryModal] ファイル存在確認エラー: ${filePath}`, error);
            return false;
        }
    }

    /**
     * 複数のパスパターンを試行してファイルを見つける
     */
    private async findBackupFile(backup: BackupFileInfo): Promise<{ path: string; exists: boolean }> {
        // バックアップファイルは.obsidianディレクトリ内のプラグイン専用フォルダに保存
        const backupDir = `${this.widget.app.vault.configDir}/plugins/obsidian-widget-board-plugin/backups`;
        
        // 試行するパスパターンのリスト
        const pathPatterns: string[] = [];
        
        // 1. 既存のfilePathがある場合は最優先
        if (backup.filePath) {
            pathPatterns.push(backup.filePath);
        }
        
        // 2. 世代バックアップの場合の各パターン
        if (backup.type !== 'incremental' && !backup.id.startsWith('inc_')) {
            const backupType = backup.type || 'daily';
            const period = backup.generation?.period || backup.id.split('_')[1] || 'unknown';
            
            // GenerationBackupManagerの正しい構造
            pathPatterns.push(`${backupDir}/generations/${backupType}/${period}.json`);
            
            // 古い構造への対応
            pathPatterns.push(`${backupDir}/${backup.id}.json`);
            pathPatterns.push(`${backupDir}/${period}.json`);
            
            // ファイル名だけの場合
            pathPatterns.push(`${backupDir}/${backup.id.split('_').slice(1).join('_')}.json`);
        }
        
        // 3. 差分バックアップの場合
        if (backup.type === 'incremental' || backup.id.startsWith('inc_')) {
            pathPatterns.push(`${backupDir}/incremental/${backup.id}.json`);
            pathPatterns.push(`${backupDir}/${backup.id}.json`);
        }
        
        console.log(`[BackupHistoryModal] ファイル検索開始:`, {
            backupId: backup.id,
            backupType: backup.type,
            pathPatterns
        });
        
        // 各パターンを順番に試行
        for (const path of pathPatterns) {
            const exists = await this.checkFileExists(path);
            if (exists) {
                console.log(`[BackupHistoryModal] ファイル発見: ${path}`);
                return { path, exists: true };
            }
        }
        
        console.warn(`[BackupHistoryModal] ファイルが見つかりませんでした:`, {
            backupId: backup.id,
            triedPaths: pathPatterns
        });
        
        return { path: pathPatterns[0] || backup.filePath || '', exists: false };
    }

    /**
     * バックアップファイル読み込み（エラーハンドリング付き・スマート検索）
     */
    private async readBackupFile(backup: BackupFileInfo): Promise<{ success: boolean; content?: string; size: number; error?: string; actualPath?: string }> {
        try {
            console.log(`[BackupHistoryModal] ファイル読み込み開始: ${backup.id}`);
            
            // スマート検索でファイルを見つける
            const findResult = await this.findBackupFile(backup);
            
            if (!findResult.exists) {
                return {
                    success: false,
                    size: 0,
                    error: 'ファイルが存在しません',
                    actualPath: findResult.path
                };
            }

            const content = await this.widget.app.vault.adapter.read(findResult.path);
            const size = content.length;
            
            console.log(`[BackupHistoryModal] ファイル読み込み成功: ${findResult.path} (${size} bytes)`);
            
            return {
                success: true,
                content,
                size,
                actualPath: findResult.path
            };
            
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[BackupHistoryModal] ファイル読み込みエラー: ${backup.id}`, error);
            
            return {
                success: false,
                size: 0,
                error: `読み込みエラー: ${errorMsg}`
            };
        }
    }

    /**
     * データ構造を検証（詳細ログ付き・バックアップ形式対応）
     */
    private validateDataStructure(data: any): boolean {
        console.log(`[BackupHistoryModal] データ構造検証開始:`, {
            hasData: !!data,
            dataType: typeof data,
            isObject: data && typeof data === 'object',
            keys: data ? Object.keys(data) : []
        });

        if (!data || typeof data !== 'object') {
            console.warn(`[BackupHistoryModal] データが無効: null, undefined, または非オブジェクト`);
            return false;
        }
        
        // バックアップファイルの構造を判定
        let targetData = data;
        let isBackupFormat = false;
        let backupType = 'unknown';
        
        // GenerationBackupManagerの形式（data.dataにTweetWidgetSettingsが格納）
        if ((data.type === 'generation' || data.type === 'daily' || data.type === 'weekly' || data.type === 'monthly') && data.data && typeof data.data === 'object') {
            targetData = data.data;
            isBackupFormat = true;
            backupType = 'generation';
            console.log(`[BackupHistoryModal] GenerationBackupManager形式を検出: ${data.type}`);
        }
        // IncrementalBackupManagerの形式の場合（差分データ構造）
        else if (data.type === 'incremental' && data.diff && typeof data.diff === 'object') {
            // 差分バックアップの場合は、diff情報を確認
            const hasDiffOps = Array.isArray(data.diff.operations);
            console.log(`[BackupHistoryModal] IncrementalBackupManager（差分）形式を検出:`, {
                hasDiff: !!data.diff,
                hasOperations: hasDiffOps,
                operationCount: hasDiffOps ? data.diff.operations.length : 0,
                baseBackupId: data.baseBackupId,
                metadata: data.metadata
            });
            
            // 差分バックアップの場合は、差分操作があれば有効とみなす
            if (hasDiffOps) {
                console.log(`[BackupHistoryModal] 差分バックアップ構造検証成功`);
                return true;
            } else {
                console.warn(`[BackupHistoryModal] 差分バックアップに操作データが見つかりません`);
                return false;
            }
        }
        // IncrementalBackupManagerの形式の場合（データ全体）
        else if (data.type === 'incremental' && data.data && typeof data.data === 'object') {
            targetData = data.data;
            isBackupFormat = true;
            backupType = 'incremental-full';
            console.log(`[BackupHistoryModal] IncrementalBackupManager（フル）形式を検出`);
        }
        // 直接TweetWidgetSettings形式の場合
        else if ('posts' in data || 'scheduledPosts' in data) {
            backupType = 'direct';
            console.log(`[BackupHistoryModal] 直接TweetWidgetSettings形式を検出`);
        }
        else {
            console.warn(`[BackupHistoryModal] 不明なデータ形式:`, {
                hasType: 'type' in data,
                type: data.type,
                hasData: 'data' in data,
                hasDiff: 'diff' in data,
                topLevelKeys: Object.keys(data).slice(0, 10) // 最初の10個のキー
            });
            
            // 詳細なデータサンプルをログ出力
            if (data && typeof data === 'object') {
                const sampleData: Record<string, string> = {};
                for (const [key, value] of Object.entries(data)) {
                    if (key.length > 50) continue; // 長すぎるキーはスキップ
                    if (Array.isArray(value)) {
                        sampleData[key] = `Array(${value.length})`;
                    } else if (value && typeof value === 'object') {
                        sampleData[key] = `Object{${Object.keys(value).slice(0, 3).join(',')}}`;
                    } else {
                        sampleData[key] = typeof value;
                    }
                }
                console.warn(`[BackupHistoryModal] データサンプル:`, sampleData);
            }
        }
        
        // 差分バックアップの場合はすでに検証済み
        if (backupType === 'incremental' && data.diff) {
            return true;
        }
        
        // フルデータの場合の検証
        const hasValidPosts = Array.isArray(targetData.posts);
        const hasValidScheduledPosts = Array.isArray(targetData.scheduledPosts);
        
        console.log(`[BackupHistoryModal] プロパティ検証:`, {
            backupType,
            isBackupFormat,
            targetData: {
                keys: Object.keys(targetData),
                hasData: !!targetData
            },
            posts: {
                exists: 'posts' in targetData,
                isArray: hasValidPosts,
                length: hasValidPosts ? targetData.posts.length : 'N/A'
            },
            scheduledPosts: {
                exists: 'scheduledPosts' in targetData,
                isArray: hasValidScheduledPosts,
                length: hasValidScheduledPosts ? targetData.scheduledPosts.length : 'N/A'
            },
            otherProperties: Object.keys(targetData).filter(key => !['posts', 'scheduledPosts'].includes(key))
        });
        
        // posts配列の存在を必須とする（scheduledPostsは空でも可）
        if (!hasValidPosts) {
            console.warn(`[BackupHistoryModal] posts配列が無効または存在しません`);
            return false;
        }
        
        // scheduledPostsは必須ではないが、存在する場合は配列である必要がある
        if ('scheduledPosts' in targetData && !hasValidScheduledPosts) {
            console.warn(`[BackupHistoryModal] scheduledPostsが存在するが配列ではありません`);
            return false;
        }
        
        console.log(`[BackupHistoryModal] データ構造検証成功 (${backupType})`);
        return true;
    }

    /**
     * 差分バックアップの状況をデバッグ出力
     */
    private async debugIncrementalBackupStatus(): Promise<void> {
        try {
            console.log('[BackupHistoryModal] === 差分バックアップ状況デバッグ ===');
            
            // バックアップディレクトリの確認（.obsidianディレクトリ内）
            const backupDir = `${this.widget.app.vault.configDir}/plugins/obsidian-widget-board-plugin/backups`;
            const incrementalDir = `${backupDir}/incremental`;
            
            console.log('[BackupHistoryModal] パス情報:', {
                backupDir,
                incrementalDir
            });
            
            // ディレクトリ存在確認
            const backupDirExists = await this.checkFileExists(backupDir);
            const incrementalDirExists = await this.checkFileExists(incrementalDir);
            
            console.log('[BackupHistoryModal] ディレクトリ存在確認:', {
                backupDirExists,
                incrementalDirExists
            });
            
            if (incrementalDirExists) {
                // 差分バックアップファイルの直接確認
                try {
                    const incrementalFiles = await this.listDirectoryFiles(incrementalDir);
                    console.log('[BackupHistoryModal] 差分ディレクトリ内ファイル:', incrementalFiles);
                } catch (error) {
                    console.warn('[BackupHistoryModal] 差分ディレクトリ一覧取得エラー:', error);
                }
            }
            
            // バックアップインデックスの確認
            const indexPath = `${backupDir}/index.json`;
            const indexExists = await this.checkFileExists(indexPath);
            console.log('[BackupHistoryModal] インデックスファイル存在:', indexExists);
            
            if (indexExists) {
                try {
                    const indexContent = await this.widget.app.vault.adapter.read(indexPath);
                    const index = JSON.parse(indexContent);
                    console.log('[BackupHistoryModal] インデックス内容:', {
                        version: index.version,
                        incrementalEnabled: index.config?.incremental?.enabled,
                        incrementalMaxCount: index.config?.incremental?.maxCount,
                        incrementalBackupsCount: index.backups?.incremental?.length || 0,
                        incrementalBackups: index.backups?.incremental || []
                    });
                } catch (error) {
                    console.error('[BackupHistoryModal] インデックス読み込みエラー:', error);
                }
            }
            
        } catch (error) {
            console.error('[BackupHistoryModal] デバッグ状況確認エラー:', error);
        }
    }

    /**
     * ディレクトリ内のファイル一覧を取得（簡易版）
     */
    private async listDirectoryFiles(dirPath: string): Promise<string[]> {
        try {
            // Obsidianのvault.adapter経由でディレクトリ内容を取得
            // 注：直接的なディレクトリ一覧取得メソッドがないため、推測で実装
            const files: string[] = [];
            
            // 一般的な差分バックアップファイル名パターンを試行
            for (let i = 0; i < 10; i++) {
                const patterns = [
                    `incr_${Date.now() - (i * 3600000)}.json`,  // 1時間ごと
                    `inc_${Date.now() - (i * 3600000)}.json`,   // 別の命名パターン
                    `incremental_${i}.json`
                ];
                
                for (const pattern of patterns) {
                    const fullPath = `${dirPath}/${pattern}`;
                    if (await this.checkFileExists(fullPath)) {
                        files.push(pattern);
                    }
                }
            }
            
            return files;
        } catch (error) {
            console.error('[BackupHistoryModal] ディレクトリファイル一覧取得エラー:', error);
            return [];
        }
    }

    /**
     * バックアップ整合性チェック
     */
    private async checkIntegrity(): Promise<void> {
        try {
            console.log(`[BackupHistoryModal] 整合性チェック開始`);
            
            // 手動で整合性チェックを実行
            const result = await this.performIntegrityCheck();
            
            let message = `=== バックアップ整合性チェック結果 ===\n`;
            message += `総バックアップ数: ${result.totalBackups}件\n`;
            message += `問題のあるファイル: ${result.problemFiles}件\n`;
            message += `読み込めないファイル: ${result.unreadableFiles}件\n`;
            
            if (result.issues.length > 0) {
                message += `\n検出された問題:\n`;
                result.issues.forEach((issue: string, index: number) => {
                    message += `${index + 1}. ${issue}\n`;
                });
            } else {
                message += `\n✓ 問題は検出されませんでした\n`;
            }
            
            alert(message);
            console.log(`[BackupHistoryModal] 整合性チェック完了:`, result);
            
        } catch (error) {
            console.error(`[BackupHistoryModal] 整合性チェックエラー:`, error);
            alert(`整合性チェックに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 整合性チェックを実行
     */
    private async performIntegrityCheck(): Promise<{
        totalBackups: number;
        problemFiles: number;
        unreadableFiles: number;
        issues: string[];
    }> {
        const issues: string[] = [];
        let totalBackups = 0;
        let problemFiles = 0;
        let unreadableFiles = 0;

        try {
            // 利用可能なバックアップを取得
            const backups = await this.backupManager.getAvailableBackups();
            const allBackups = [...backups.generations, ...backups.incremental];
            totalBackups = allBackups.length;

            console.log(`[BackupHistoryModal] チェック対象: ${totalBackups}件のバックアップ`);
            console.log(`[BackupHistoryModal] 世代バックアップ: ${backups.generations.length}件, 差分バックアップ: ${backups.incremental.length}件`);

            // 各バックアップの診断を実行
            for (const backup of allBackups) {
                console.log(`[BackupHistoryModal] === ${backup.id} の診断開始 ===`);
                const diagnosis = await this.performBasicDiagnosis(backup);
                
                console.log(`[BackupHistoryModal] ${backup.id} 診断結果:`, {
                    fileExists: diagnosis.fileExists,
                    fileReadable: diagnosis.fileReadable,
                    jsonValid: diagnosis.jsonValid,
                    dataStructureValid: diagnosis.dataStructureValid,
                    fileSize: diagnosis.fileSize,
                    error: diagnosis.error
                });
                
                if (!diagnosis.fileExists) {
                    issues.push(`${backup.id}: ファイルが存在しません`);
                    problemFiles++;
                    console.warn(`[BackupHistoryModal] ${backup.id}: ファイル存在エラー`);
                } else if (!diagnosis.fileReadable) {
                    issues.push(`${backup.id}: ファイルが読み込めません`);
                    unreadableFiles++;
                    console.warn(`[BackupHistoryModal] ${backup.id}: ファイル読み込みエラー`);
                } else if (!diagnosis.jsonValid) {
                    issues.push(`${backup.id}: JSON解析エラー`);
                    problemFiles++;
                    console.warn(`[BackupHistoryModal] ${backup.id}: JSON解析エラー - ${diagnosis.error}`);
                } else if (!diagnosis.dataStructureValid) {
                    issues.push(`${backup.id}: データ構造が無効です`);
                    problemFiles++;
                    console.warn(`[BackupHistoryModal] ${backup.id}: データ構造エラー - ${diagnosis.error}`);
                } else if (diagnosis.fileSize === 0) {
                    issues.push(`${backup.id}: ファイルサイズが0です`);
                    problemFiles++;
                    console.warn(`[BackupHistoryModal] ${backup.id}: ファイルサイズ0エラー`);
                } else {
                    console.log(`[BackupHistoryModal] ${backup.id}: 正常`);
                }
            }

            console.log(`[BackupHistoryModal] 整合性チェック完了統計:`, {
                totalBackups,
                problemFiles,
                unreadableFiles,
                successfulBackups: totalBackups - problemFiles - unreadableFiles
            });

            return {
                totalBackups,
                problemFiles,
                unreadableFiles,
                issues
            };

        } catch (error) {
            console.error(`[BackupHistoryModal] 整合性チェック処理エラー:`, error);
            issues.push(`整合性チェック処理エラー: ${error instanceof Error ? error.message : String(error)}`);
            return {
                totalBackups,
                problemFiles,
                unreadableFiles,
                issues
            };
        }
    }

    /**
     * テスト用復元処理
     */
    private async testRestore(): Promise<void> {
        try {
            console.log(`[BackupHistoryModal] テスト復元開始`);
            
            // 利用可能なバックアップを確認
            const backups = await this.backupManager.getAvailableBackups();
            console.log(`[BackupHistoryModal] 利用可能なバックアップ:`, {
                generations: backups.generations.length,
                incremental: backups.incremental.length
            });
            
            if (backups.generations.length === 0 && backups.incremental.length === 0) {
                alert('復元対象のバックアップが見つかりません。まず手動バックアップを作成してください。');
                return;
            }
            
            // 最新の世代バックアップまたは差分バックアップを選択
            const targetBackup = backups.generations[0] || backups.incremental[0];
            
            if (!targetBackup) {
                alert('テスト復元対象が見つかりません');
                return;
            }
            
            console.log(`[BackupHistoryModal] テスト復元対象:`, targetBackup);
            
            // 診断を実行
            console.log(`[BackupHistoryModal] 診断実行開始`);
            const diagnosis = await this.performBasicDiagnosis(targetBackup);
            console.log(`[BackupHistoryModal] 診断結果:`, diagnosis);
            
            if (!diagnosis.fileExists || diagnosis.error) {
                alert(`復元前診断で問題が検出されました:\n${diagnosis.error || '不明なエラー'}`);
                return;
            }
            
            if (confirm(`診断結果: 問題なし\nバックアップID: ${targetBackup.id}\nファイルサイズ: ${this.formatFileSize(diagnosis.fileSize)}\n\n復元を続行しますか？`)) {
                // 実際の復元を実行
                await this.handleRestore(targetBackup);
            }
            
        } catch (error) {
            console.error(`[BackupHistoryModal] テスト復元エラー:`, error);
            alert(`テスト復元に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 差分バックアップ作成をテストする（デバッグ用）
     */
    private async testIncrementalBackup(): Promise<void> {
        try {
            console.log('[BackupHistoryModal] === 差分バックアップテスト開始 ===');
            
            // 現在のデータを少し変更してテスト用データを作成
            const testData = JSON.parse(JSON.stringify(this.currentData));
            testData.posts = testData.posts || [];
            
            // テスト用投稿を追加
            const testPost = {
                id: `test_${Date.now()}`,
                content: `テスト投稿 - ${new Date().toLocaleString('ja-JP')}`,
                timestamp: Date.now(),
                scheduledTime: null,
                type: 'regular' as const,
                aiGenerated: false,
                edited: false,
                originalContent: '',
                editHistory: [],
                favorited: false,
                replies: []
            };
            
            testData.posts.push(testPost);
            
            console.log('[BackupHistoryModal] テスト用データ作成完了:', {
                originalPostsCount: this.currentData.posts?.length || 0,
                testPostsCount: testData.posts.length,
                testPostId: testPost.id
            });
            
            // BackupManagerのonDataSaveを直接呼び出してテスト
            console.log('[BackupHistoryModal] BackupManager.onDataSave() を呼び出し中...');
            await this.backupManager.onDataSave(testData);
            
            console.log('[BackupHistoryModal] データ保存完了、バックアップ一覧を再読み込み...');
            
            // 少し待ってからバックアップ一覧を再読み込み
            setTimeout(async () => {
                await this.reloadBackupList();
                console.log('[BackupHistoryModal] === 差分バックアップテスト完了 ===');
            }, 1000);
            
        } catch (error) {
            console.error('[BackupHistoryModal] 差分バックアップテストエラー:', error);
        }
    }
}
