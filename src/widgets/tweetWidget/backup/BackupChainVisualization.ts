import { App, setIcon } from 'obsidian';
import type { BackupFileInfo, BackupCheckResult } from './types';
import { BackupManager } from './BackupManager';
// import { renderMermaidInWorker } from '../../../utils';
import { t, StringKey } from '../../../i18n';
import type { Language } from '../../../i18n/types';
import { MarkdownRenderer } from 'obsidian';
import { BaseModal } from './BaseModal';

/**
 * バックアップチェーン可視化モーダル
 * 統計、グラフ、整合性チェックを統合したダッシュボード
 */
export class BackupChainVisualization extends BaseModal {
    private backupManager: BackupManager;
    private language: Language;
    private integrityResults: BackupCheckResult[] | null = null;
    private currentTab: 'overview' | 'graph' | 'timeline' | 'integrity' = 'overview';

    constructor(
        widget: any, // TweetWidget型の代わりに any を使用
        backupManager: BackupManager,
        language: Language
    ) {
        super(widget);
        this.backupManager = backupManager;
        this.language = language;
        this.setSize('1400px', '900px');
    }

    protected onOpen(): void {
        this.contentEl.innerHTML = '';
        this.contentEl.className = 'backup-dashboard-modal';
        
        // モーダルサイズを設定（コンテンツに合わせて最適化）
        this.modalEl.style.width = '85vw';
        this.modalEl.style.height = '90vh';
        this.modalEl.style.maxWidth = '1400px';
        this.modalEl.style.maxHeight = '900px';
        this.modalEl.style.minWidth = '800px';
        this.modalEl.style.minHeight = '600px';
        
        // ヘッダー部分
        this.renderHeader();
        
        // タブナビゲーション
        this.renderTabNavigation();
        
        // メインコンテンツエリア
        const mainContent = this.createElement({
            tagName: 'div',
            className: 'backup-dashboard-content'
        });
        
        // 初期タブを表示
        this.renderTabContent(mainContent);
        
        this.contentEl.appendChild(mainContent);
    }

    private renderHeader(): void {
        const header = this.createElement({
            tagName: 'div',
            className: 'backup-dashboard-header',
            children: [
                {
                    tagName: 'h2',
                    textContent: 'バックアップダッシュボード',
                    className: 'dashboard-title'
                },
                {
                    tagName: 'p',
                    textContent: 'バックアップシステムの状況を総合的に確認できます',
                    className: 'dashboard-subtitle'
                }
            ]
        });

        header.style.cssText = `
            padding: 20px 24px;
            border-bottom: 1px solid var(--background-modifier-border);
            background: var(--background-secondary);
            flex-shrink: 0;
        `;

        this.contentEl.appendChild(header);
    }

    private renderTabNavigation(): void {
        const tabNav = this.createElement({
            tagName: 'div',
            className: 'backup-tab-bar'
        });

        const tabs = [
            { id: 'overview', label: '概要', icon: 'bar-chart-3' },
            { id: 'graph', label: 'グラフ', icon: 'git-branch' },
            { id: 'timeline', label: 'タイムライン', icon: 'calendar' },
            { id: 'integrity', label: '整合性', icon: 'shield-check' }
        ] as const;

        tabs.forEach(tab => {
            const tabBtn = this.createElement({
                tagName: 'button',
                className: `backup-tab-btn ${this.currentTab === tab.id ? 'active' : ''}`
            }) as HTMLButtonElement;

            // アイコンコンテナを作成
            const iconContainer = this.createElement({
                tagName: 'span',
                className: 'tab-icon'
            });
            setIcon(iconContainer, tab.icon);

            // テキストラベル
            const textLabel = this.createElement({
                tagName: 'span',
                textContent: tab.label,
                className: 'tab-label'
            });

            tabBtn.appendChild(iconContainer);
            tabBtn.appendChild(textLabel);
            tabBtn.onclick = () => this.switchTab(tab.id);
            tabNav.appendChild(tabBtn);
        });

        this.contentEl.appendChild(tabNav);
    }

    private switchTab(tabId: 'overview' | 'graph' | 'timeline' | 'integrity'): void {
        this.currentTab = tabId;
        
        // タブボタンの状態更新
        const tabs = this.contentEl.querySelectorAll('.backup-tab-btn');
        tabs.forEach((tab, index) => {
            const tabIds = ['overview', 'graph', 'timeline', 'integrity'];
            if (tabIds[index] === tabId) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        // コンテンツ更新
        const contentArea = this.contentEl.querySelector('.backup-dashboard-content') as HTMLElement;
        if (contentArea) {
            this.renderTabContent(contentArea);
        }
    }

    private async renderTabContent(container: HTMLElement): Promise<void> {
        container.innerHTML = '';
        
        switch (this.currentTab) {
            case 'overview':
                await this.renderOverviewTab(container);
                break;
            case 'graph':
                await this.renderGraphTab(container);
                break;
            case 'timeline':
                await this.renderTimelineTab(container);
                break;
            case 'integrity':
                await this.renderIntegrityTab(container);
                break;
        }
    }

    private async renderOverviewTab(container: HTMLElement): Promise<void> {
        this.showLoading(container, 'バックアップ統計を読み込み中...');

        try {
            const backups = await this.backupManager.getAvailableBackups();
            this.hideLoading(container);

            // メインコンテナ
            const mainContainer = this.createElement({
                tagName: 'div',
                className: 'overview-main-container'
            });
            mainContainer.style.cssText = `
                padding: 16px 20px 20px 20px;
                max-width: 1200px;
                margin: 0 auto;
            `;

            // タイトルセクション
            const titleSection = this.createElement({
                tagName: 'div',
                className: 'overview-title-section',
                children: [
                    {
                        tagName: 'h2',
                        textContent: 'バックアップ統計',
                        className: 'overview-title'
                    },
                    {
                        tagName: 'p',
                        textContent: 'システム全体のバックアップ状況をご確認いただけます',
                        className: 'overview-subtitle'
                    }
                ]
            });
            titleSection.style.cssText = `
                margin-bottom: 30px;
                text-align: center;
            `;

            // 統計カード
            const statsGrid = this.createElement({
                tagName: 'div',
                className: 'backup-dashboard-stats-grid'
            });
            statsGrid.style.cssText = `
                margin-bottom: 40px;
            `;

            // 世代バックアップ統計
            const generationCard = this.createStatsCard(
                '世代バックアップ',
                `${backups.generations.length} 件`,
                'archive',
                'var(--background-modifier-form-field)'
            );

            // 差分バックアップ統計  
            const incrementalCard = this.createStatsCard(
                '差分バックアップ',
                `${backups.incremental.length} 件`,
                'file-diff',
                'var(--background-modifier-form-field)'
            );

            // 最新バックアップ
            const latestBackup = [...backups.generations, ...backups.incremental]
                .sort((a, b) => b.timestamp - a.timestamp)[0];
            
            const latestCard = this.createStatsCard(
                '最新バックアップ',
                latestBackup ? new Date(latestBackup.timestamp).toLocaleDateString('ja-JP') : '未作成',
                'clock',
                'var(--background-modifier-form-field)'
            );

            // 合計サイズ
            const totalSize = [...backups.generations, ...backups.incremental]
                .reduce((sum, backup) => sum + (backup.size || 0), 0);
            
            const sizeCard = this.createStatsCard(
                '合計サイズ',
                this.formatFileSize(totalSize),
                'hard-drive',
                'var(--background-modifier-form-field)'
            );

            statsGrid.appendChild(generationCard);
            statsGrid.appendChild(incrementalCard);
            statsGrid.appendChild(latestCard);
            statsGrid.appendChild(sizeCard);

            // バックアップ一覧セクション
            if (backups.generations.length > 0 || backups.incremental.length > 0) {
                const backupListSection = this.createElement({
                    tagName: 'div',
                    className: 'backup-list-section'
                });

                // セクションヘッダー
                const sectionHeader = this.createElement({
                    tagName: 'div',
                    className: 'recent-backups-header'
                });
                sectionHeader.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 24px;
                    padding: 16px 20px;
                    background: var(--background-secondary);
                    border-radius: 12px;
                    border: 1px solid var(--background-modifier-border);
                `;

                const headerLeft = this.createElement({
                    tagName: 'div',
                    className: 'header-left'
                });
                const headerTitle = headerLeft.createEl('h3');
                headerTitle.style.cssText = `
                    margin: 0; 
                    color: var(--text-normal); 
                    font-size: 20px; 
                    font-weight: 700; 
                    display: flex; 
                    align-items: center; 
                    gap: 8px;
                `;
                
                const titleIcon = headerTitle.createSpan({ cls: 'title-icon' });
                setIcon(titleIcon, 'list');
                headerTitle.createSpan({ text: '最近のバックアップ' });
                
                const headerSubtitle = headerLeft.createEl('p');
                headerSubtitle.style.cssText = `
                    margin: 4px 0 0 0; 
                    color: var(--text-muted); 
                    font-size: 14px;
                `;
                headerSubtitle.textContent = '最新の8件のバックアップを時系列で表示';

                const recentBackups = [...backups.generations, ...backups.incremental]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 8);

                const headerRight = this.createElement({
                    tagName: 'div',
                    className: 'header-right'
                });
                headerRight.innerHTML = `
                    <div style="text-align: right;">
                        <div style="font-size: 24px; font-weight: 700; color: var(--text-normal); margin-bottom: 2px;">
                            ${recentBackups.length}
                        </div>
                        <div style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                            件のバックアップ
                        </div>
                    </div>
                `;

                sectionHeader.appendChild(headerLeft);
                sectionHeader.appendChild(headerRight);

                const listContainer = this.createElement({
                    tagName: 'div',
                    className: 'recent-backup-list'
                });
                listContainer.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                `;

                recentBackups.forEach(backup => {
                    const item = this.createBackupListItem(backup);
                    listContainer.appendChild(item);
                });

                backupListSection.appendChild(sectionHeader);
                backupListSection.appendChild(listContainer);
                
                mainContainer.appendChild(titleSection);
                mainContainer.appendChild(statsGrid);
                mainContainer.appendChild(backupListSection);
            } else {
                // バックアップが存在しない場合の表示
                const emptyState = this.createElement({
                    tagName: 'div',
                    className: 'empty-state',
                    children: [
                        {
                            tagName: 'div',
                            className: 'empty-icon'
                        },
                        {
                            tagName: 'h3',
                            textContent: 'バックアップが見つかりません',
                            className: 'empty-title'
                        },
                        {
                            tagName: 'p',
                            textContent: '最初のバックアップを作成してください',
                            className: 'empty-message'
                        }
                    ]
                });
                emptyState.style.cssText = `
                    text-align: center;
                    padding: 60px 20px;
                    color: var(--text-muted);
                `;

                const emptyIcon = emptyState.querySelector('.empty-icon') as HTMLElement;
                if (emptyIcon) {
                    setIcon(emptyIcon, 'file-x');
                    emptyIcon.style.cssText = `
                        font-size: 64px;
                        margin-bottom: 20px;
                        display: flex;
                        justify-content: center;
                        opacity: 0.3;
                    `;
                }

                mainContainer.appendChild(titleSection);
                mainContainer.appendChild(statsGrid);
                mainContainer.appendChild(emptyState);
            }

            container.appendChild(mainContainer);

        } catch (error) {
            this.hideLoading(container);
            this.showError(container, error instanceof Error ? error.message : String(error));
        }
    }

    private async renderGraphTab(container: HTMLElement): Promise<void> {
        this.showLoading(container, '関係性グラフを生成中...');
        
        try {
            const backups = await this.backupManager.getAvailableBackups();
            this.hideLoading(container);

            // メインコンテナ
            const graphContainer = this.createElement({
                tagName: 'div',
                className: 'graph-main-container'
            });
            graphContainer.style.cssText = `
                padding: 16px 20px 20px 20px;
                max-width: 1200px;
                margin: 0 auto;
            `;

            // タイトルセクション
            const titleSection = this.createElement({
                tagName: 'div',
                className: 'graph-title-section',
                children: [
                    {
                        tagName: 'h2',
                        textContent: 'バックアップ関係性グラフ',
                        className: 'graph-title'
                    },
                    {
                        tagName: 'p',
                        textContent: 'バックアップ間の依存関係と継承構造を視覚化',
                        className: 'graph-subtitle'
                    }
                ]
            });
            titleSection.style.cssText = `
                margin-bottom: 30px;
                text-align: center;
            `;

            graphContainer.appendChild(titleSection);

            if (backups.generations.length === 0 && backups.incremental.length === 0) {
                // バックアップが存在しない場合
                const emptyState = this.createElement({
                    tagName: 'div',
                    className: 'graph-empty-state',
                    children: [
                        {
                            tagName: 'div',
                            className: 'empty-icon'
                        },
                        {
                            tagName: 'h3',
                            textContent: 'グラフを生成するデータがありません',
                            className: 'empty-title'
                        },
                        {
                            tagName: 'p',
                            textContent: 'バックアップを作成してから再度お試しください',
                            className: 'empty-message'
                        }
                    ]
                });

                const emptyIcon = emptyState.querySelector('.empty-icon') as HTMLElement;
                setIcon(emptyIcon, 'git-branch');

                emptyState.style.cssText = `
                    text-align: center;
                    padding: 80px 20px;
                    color: var(--text-muted);
                `;

                emptyIcon.style.cssText = `
                    font-size: 64px;
                    margin-bottom: 20px;
                    opacity: 0.3;
                `;

                graphContainer.appendChild(emptyState);
            } else {
                // 統計情報表示
                const statsInfo = this.createElement({
                    tagName: 'div',
                    className: 'graph-stats-info'
                });

                statsInfo.style.cssText = `
                    display: flex;
                    justify-content: center;
                    gap: 40px;
                    margin-bottom: 30px;
                    padding: 20px;
                    background: var(--background-secondary);
                    border-radius: 8px;
                    border: 1px solid var(--background-modifier-border);
                `;

                // 世代バックアップ統計
                const genStatItem = statsInfo.createDiv({ cls: 'stat-item' });
                genStatItem.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--text-normal);
                    font-weight: 500;
                `;
                
                const genIcon = genStatItem.createSpan({ cls: 'stat-icon' });
                genIcon.style.cssText = `color: var(--text-muted);`;
                setIcon(genIcon, 'archive');
                genStatItem.createSpan({ 
                    text: `世代バックアップ: ${backups.generations.length}件`,
                    cls: 'stat-text'
                });

                // 差分バックアップ統計
                const incStatItem = statsInfo.createDiv({ cls: 'stat-item' });
                incStatItem.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: var(--text-normal);
                    font-weight: 500;
                `;
                
                const incIcon = incStatItem.createSpan({ cls: 'stat-icon' });
                incIcon.style.cssText = `color: var(--text-muted);`;
                setIcon(incIcon, 'file-diff');
                incStatItem.createSpan({ 
                    text: `差分バックアップ: ${backups.incremental.length}件`,
                    cls: 'stat-text'
                });

                graphContainer.appendChild(statsInfo);

                // 表示方式選択ボタン
                const viewSelector = this.createElement({
                    tagName: 'div',
                    className: 'view-selector'
                });
                viewSelector.style.cssText = `
                    display: flex;
                    gap: 12px;
                    margin-bottom: 24px;
                    padding: 16px;
                    background: var(--background-secondary);
                    border-radius: 8px;
                    border: 1px solid var(--background-modifier-border);
                    justify-content: center;
                `;

                const viewOptions = [
                    { id: 'interactive', label: 'インタラクティブ', description: 'アニメーション付きSVG', icon: 'git-branch' },
                    { id: 'cards', label: 'カード', description: 'モダンなカード形式', icon: 'layout-grid' }
                ];

                const contentContainer = this.createElement({
                    tagName: 'div',
                    className: 'graph-content'
                });

                let activeButton: HTMLElement | null = null;

                viewOptions.forEach(option => {
                    const button = this.createElement({
                        tagName: 'button',
                        className: 'view-option-btn'
                    }) as HTMLButtonElement;
                    
                    button.style.cssText = `
                        padding: 12px 20px;
                        border: 2px solid var(--background-modifier-border);
                        background: var(--background-primary);
                        color: var(--text-normal);
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        font-weight: 500;
                        min-width: 120px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    `;
                    
                    const buttonIcon = button.createSpan({ cls: 'button-icon' });
                    setIcon(buttonIcon, option.icon);
                    button.createSpan({ text: option.label });
                    


                    button.addEventListener('click', async () => {
                        // アクティブボタンのスタイルをリセット
                        if (activeButton) {
                            activeButton.style.background = 'var(--background-primary)';
                            activeButton.style.borderColor = 'var(--background-modifier-border)';
                            activeButton.style.color = 'var(--text-normal)';
                        }
                        
                        // 新しいアクティブボタンのスタイル設定
                        button.style.background = 'var(--background-modifier-border)';
                        button.style.borderColor = 'var(--text-accent)';
                        button.style.color = 'var(--text-normal)';
                        activeButton = button;

                        // コンテンツをクリア
                        contentContainer.innerHTML = '';
                        
                        // 選択された表示方式で描画
                        switch (option.id) {
                            case 'timeline':
                                await this.renderInteractiveTimeline(contentContainer, backups);
                                break;
                            case 'cards':
                                await this.renderCardGridView(contentContainer, backups);
                                break;
                            case 'interactive':
                                await this.renderInteractiveSVGGraph(contentContainer, backups);
                                break;
                            case 'mermaid':
                                await this.renderMermaidGitGraph(contentContainer, backups);
                                break;
                        }
                    });

                    viewSelector.appendChild(button);

                    // デフォルトでインタラクティブ表示を選択
                    if (option.id === 'interactive') {
                        setTimeout(() => button.click(), 100);
                    }
                });

                graphContainer.appendChild(viewSelector);
                graphContainer.appendChild(contentContainer);
            }

            container.appendChild(graphContainer);
            
        } catch (error) {
            console.error('[BackupChainVisualization] グラフタブエラー:', error);
            this.hideLoading(container);
            this.showError(container, error instanceof Error ? error.message : String(error));
        }
    }

    private async renderTimelineTab(container: HTMLElement): Promise<void> {
        this.showLoading(container, 'タイムラインを読み込み中...');

        try {
            const backups = await this.backupManager.getAvailableBackups();
            this.hideLoading(container);

            // メインコンテナ
            const timelineContainer = this.createElement({
                tagName: 'div',
                className: 'timeline-main-container'
            });
            timelineContainer.style.cssText = `
                padding: 16px 20px 20px 20px;
                max-width: 800px;
                margin: 0 auto;
            `;

            // タイトルセクション
            const titleSection = this.createElement({
                tagName: 'div',
                className: 'timeline-title-section',
                children: [
                    {
                        tagName: 'h2',
                        textContent: 'バックアップタイムライン',
                        className: 'timeline-title'
                    },
                    {
                        tagName: 'p',
                        textContent: '時系列でバックアップの作成履歴を表示',
                        className: 'timeline-subtitle'
                    }
                ]
            });
            titleSection.style.cssText = `
                margin-bottom: 40px;
                text-align: center;
            `;

            timelineContainer.appendChild(titleSection);

            const allBackups = [...backups.generations, ...backups.incremental]
                .sort((a, b) => b.timestamp - a.timestamp);

            if (allBackups.length === 0) {
                // バックアップが存在しない場合
                const emptyState = this.createElement({
                    tagName: 'div',
                    className: 'timeline-empty-state',
                    children: [
                        {
                            tagName: 'div',
                            className: 'empty-icon'
                        },
                        {
                            tagName: 'h3',
                            textContent: 'タイムラインに表示するデータがありません',
                            className: 'empty-title'
                        },
                        {
                            tagName: 'p',
                            textContent: 'バックアップを作成すると、ここに履歴が表示されます',
                            className: 'empty-message'
                        }
                    ]
                });

                const emptyIcon = emptyState.querySelector('.empty-icon') as HTMLElement;
                setIcon(emptyIcon, 'calendar');

                emptyState.style.cssText = `
                    text-align: center;
                    padding: 80px 20px;
                    color: var(--text-muted);
                `;

                emptyIcon.style.cssText = `
                    font-size: 64px;
                    margin-bottom: 20px;
                    opacity: 0.3;
                `;

                timelineContainer.appendChild(emptyState);
            } else {
                // タイムライン統計
                        const timelineStats = this.createElement({
            tagName: 'div',
            className: 'timeline-stats'
        });

        timelineStats.style.cssText = `
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: var(--background-secondary);
            border-radius: 8px;
            border: 1px solid var(--background-modifier-border);
        `;

        const statNumber = timelineStats.createSpan({ 
            text: allBackups.length.toString(),
            cls: 'stat-number'
        });
        statNumber.style.cssText = `
            display: block;
            font-size: 32px;
            font-weight: bold;
            color: var(--text-normal);
            margin-bottom: 4px;
        `;

        const statLabel = timelineStats.createSpan({ 
            text: '総バックアップ数',
            cls: 'stat-label'
        });
        statLabel.style.cssText = `
            color: var(--text-muted);
            font-size: 14px;
        `;

                timelineContainer.appendChild(timelineStats);

                // タイムライン
                const timeline = this.createElement({
                    tagName: 'div',
                    className: 'backup-timeline'
                });

                allBackups.forEach((backup, index) => {
                    const timelineItem = this.createTimelineItem(backup, index);
                    timeline.appendChild(timelineItem);
                });

                timelineContainer.appendChild(timeline);
            }

            container.appendChild(timelineContainer);

        } catch (error) {
            this.hideLoading(container);
            this.showError(container, error instanceof Error ? error.message : String(error));
        }
    }

    private async renderIntegrityTab(container: HTMLElement): Promise<void> {
        this.showLoading(container, '整合性チェックを実行中...');
        
        try {
            // コンテンツをクリア
            container.innerHTML = '';
            
            // 整合性チェック実行
            const integrityContainer = container.createDiv({ cls: 'integrity-main-container' });
            integrityContainer.style.cssText = `
                padding: 16px 20px 20px 20px;
                max-width: 800px;
                margin: 0 auto;
            `;

            // タイトルセクション
            const titleSection = this.createElement({
                tagName: 'div',
                className: 'integrity-title-section',
                children: [
                    {
                        tagName: 'h2',
                        textContent: '整合性チェック',
                        className: 'integrity-title'
                    },
                    {
                        tagName: 'p',
                        textContent: 'バックアップファイルの整合性と有効性を検証',
                        className: 'integrity-subtitle'
                    }
                ]
            });
            titleSection.style.cssText = `
                margin-bottom: 30px;
                text-align: center;
            `;

            integrityContainer.appendChild(titleSection);
            
            // 整合性チェックの実行と結果表示
            await this.performIntegrityCheck(integrityContainer);
            
            this.hideLoading(container);
            
        } catch (error) {
            console.error('[BackupChainVisualization] 整合性タブエラー:', error);
            this.hideLoading(container);
            this.showError(container, error instanceof Error ? error.message : String(error));
        }
    }

    private async generateVisualization(container: HTMLElement) {
        try {
            // ローディング表示
            this.showLoading(container, '可視化を生成中...');

            // 既存の可視化内容をクリア
            const existingGraph = container.querySelector('.backup-chain-graph');
            if (existingGraph) existingGraph.remove();

            // バックアップ一覧を取得
            const backups = await this.backupManager.getAvailableBackups();
            
            if (backups.generations.length === 0 && backups.incremental.length === 0) {
                this.hideLoading(container);
                const emptyEl = this.createElement({
                    tagName: 'div',
                    textContent: 'バックアップが見つかりません',
                    className: 'backup-chain-empty'
                });
                container.appendChild(emptyEl);
                return;
            }

            // GitGraphを実際にレンダリング
            await this.renderGitGraphWithHTML(container, backups);
            
            this.hideLoading(container);

        } catch (error) {
            console.error('[BackupChainVisualization] 可視化生成エラー:', error);
            
            this.hideLoading(container);
            
            const errorEl = this.createElement({
                tagName: 'div',
                className: 'backup-chain-error',
                children: [
                    {
                        tagName: 'h3',
                        textContent: 'エラー'
                    },
                    {
                        tagName: 'p',
                        textContent: error instanceof Error ? error.message : String(error)
                    }
                ]
            });
            container.appendChild(errorEl);
        }
    }

    private showLoading(container: HTMLElement, message: string) {
        let loadingEl = container.querySelector('.backup-chain-loading') as HTMLElement;
        if (!loadingEl) {
            loadingEl = this.createElement({
                tagName: 'div',
                className: 'backup-chain-loading'
            });
            container.appendChild(loadingEl);
        }
        loadingEl.textContent = message;
        loadingEl.style.display = 'block';
    }

    private hideLoading(container: HTMLElement) {
        const loadingEl = container.querySelector('.backup-chain-loading') as HTMLElement;
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    /**
     * MermaidのGitGraph記法でグラフコードを生成
     */
    private generateMermaidGraph(
        generations: BackupFileInfo[], 
        incremental: BackupFileInfo[]
    ): string {
        console.log('[BackupChainVisualization] Mermaid GitGraph生成開始');
        
        let mermaidCode = 'gitGraph\n';
        
        // 全バックアップを時系列でソート
        const allBackups = [
            ...generations.map(b => ({ ...b, type: 'generation' as const })),
            ...incremental.map(b => ({ ...b, type: 'incremental' as const }))
        ].sort((a, b) => a.timestamp - b.timestamp);

        if (allBackups.length === 0) {
            mermaidCode += '    commit tag: "初期状態"\n';
            return mermaidCode;
        }

        // 差分バックアップをベースIDでグループ化
        const incrementalGroups = new Map<string, BackupFileInfo[]>();
        incremental.forEach(backup => {
            const baseId = backup.incremental?.baseBackupId || 'main';
            if (!incrementalGroups.has(baseId)) {
                incrementalGroups.set(baseId, []);
            }
            incrementalGroups.get(baseId)!.push(backup);
        });

        // メインブランチ（世代バックアップ）を作成
        const sortedGenerations = [...generations].sort((a, b) => a.timestamp - b.timestamp);
        
        if (sortedGenerations.length > 0) {
            sortedGenerations.forEach((backup, index) => {
                const date = new Date(backup.timestamp);
                const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                const period = backup.generation?.period || 'Gen';
                
                mermaidCode += `    commit tag: "${period} ${timeStr}" type: HIGHLIGHT\n`;
            });
        } else {
            // 世代バックアップがない場合は初期コミットを作成
            mermaidCode += '    commit tag: "初期状態"\n';
        }

        // 差分バックアップのブランチを作成
        if (incrementalGroups.size > 0) {
            let branchIndex = 0;
            
            for (const [baseId, incrementalList] of incrementalGroups) {
                const branchName = `incremental${branchIndex}`;
                
                // ブランチを作成
                mermaidCode += `    branch ${branchName}\n`;
                
                // 差分バックアップをコミット
                const sortedIncremental = incrementalList.sort((a, b) => a.timestamp - b.timestamp);
                sortedIncremental.forEach((backup, index) => {
                    const date = new Date(backup.timestamp);
                    const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                    
                    mermaidCode += `    commit tag: "差分 ${timeStr}"\n`;
                });
                
                // メインブランチに戻る
                mermaidCode += '    checkout main\n';
                
                // ブランチをマージ（オプショナル）
                mermaidCode += `    merge ${branchName}\n`;
                
                branchIndex++;
            }
        }

        console.log('[BackupChainVisualization] 生成されたMermaid GitGraphコード:', mermaidCode);
        return mermaidCode;
    }

    // GitGraphでは使用しないが、将来の拡張のために保持
    private sanitizeNodeId(id: string): string {
        return id.replace(/[^a-zA-Z0-9]/g, '_');
    }

    private async renderGitGraphWithHTML(container: HTMLElement, backups: { generations: BackupFileInfo[], incremental: BackupFileInfo[] }) {
        try {
            // GitGraphコードを生成
            const gitGraphCode = this.generateMermaidGraph(backups.generations, backups.incremental);
            console.log('[BackupChainVisualization] 生成されたGitGraphコード:', gitGraphCode);
            
            // ObsidianのMarkdownレンダラー用のコンテナを作成
            const mermaidContainer = this.createElement({
                tagName: 'div',
                className: 'mermaid-container'
            });
            
            mermaidContainer.style.cssText = `
                width: 100%;
                min-height: 400px;
                background: var(--background-secondary);
                border-radius: 8px;
                padding: 20px;
                overflow: auto;
            `;
            
            // GitGraphの表示を試行
            await this.tryRenderGitGraph(mermaidContainer, gitGraphCode, backups);
            
            container.appendChild(mermaidContainer);
            
        } catch (error) {
            console.error('[BackupChainVisualization] GitGraph表示エラー:', error);
            this.showError(container, error instanceof Error ? error.message : String(error));
        }
    }

    private async tryRenderGitGraph(container: HTMLElement, gitGraphCode: string, backups: { generations: BackupFileInfo[], incremental: BackupFileInfo[] }) {
        try {
            // まずObsidianのMarkdownRendererを試す
            const markdownContent = '```mermaid\n' + gitGraphCode + '\n```';
            
            await MarkdownRenderer.render(
                this.widget.app,
                markdownContent,
                container,
                '', // sourcePath
                null as any // component
            );
            
            console.log('[BackupChainVisualization] GitGraph正常レンダリング完了');
            
            // レンダリング後にMermaidが適用されているかチェック
            setTimeout(() => {
                const svgElements = container.querySelectorAll('svg');
                if (svgElements.length === 0) {
                    console.warn('[BackupChainVisualization] SVGが生成されていません、フォールバックします');
                    this.renderGitGraphFallback(container, gitGraphCode, backups);
                } else {
                    console.log('[BackupChainVisualization] GitGraph SVG生成成功');
                }
            }, 1000);
            
        } catch (renderError) {
            console.error('[BackupChainVisualization] GitGraphレンダリングエラー:', renderError);
            this.renderGitGraphFallback(container, gitGraphCode, backups);
        }
    }

    private async renderGitGraphFallback(container: HTMLElement, gitGraphCode: string, backups: { generations: BackupFileInfo[], incremental: BackupFileInfo[] }) {
        // コンテナをクリア
        container.innerHTML = '';
        
        // GitGraph風のASCIIアート表示
        const asciiGraphContainer = this.createElement({
            tagName: 'div',
            className: 'gitgraph-ascii',
            children: [
                {
                    tagName: 'h4',
                    textContent: '🌳 バックアップ系譜図'
                },
                {
                    tagName: 'div',
                    className: 'ascii-graph-content'
                }
            ]
        });

        const graphContent = asciiGraphContainer.querySelector('.ascii-graph-content') as HTMLElement;
        
        let asciiGraph = '';
        
        // メインライン（世代バックアップ）
        if (backups.generations.length > 0) {
            asciiGraph += '■ メインライン (世代バックアップ)\n';
            asciiGraph += '│\n';
            
            const sortedGenerations = [...backups.generations].sort((a, b) => a.timestamp - b.timestamp);
            sortedGenerations.forEach((backup, index) => {
                const date = new Date(backup.timestamp);
                const dateStr = date.toLocaleDateString('ja-JP');
                const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                const period = backup.generation?.period || 'Gen';
                
                asciiGraph += `●─── ${period} ${dateStr} ${timeStr}\n`;
                if (index < sortedGenerations.length - 1) {
                    asciiGraph += '│\n';
                }
            });
        }
        
        // 差分バックアップブランチ
                    if (backups.incremental.length > 0) {
                asciiGraph += '\n\n◈ 差分ブランチ\n';
            
            const incrementalByBase = new Map<string, any[]>();
            for (const backup of backups.incremental) {
                const baseId = backup.incremental?.baseBackupId || 'unknown';
                if (!incrementalByBase.has(baseId)) {
                    incrementalByBase.set(baseId, []);
                }
                incrementalByBase.get(baseId)!.push(backup);
            }
            
            let branchIndex = 0;
            for (const [baseId, incrementalList] of incrementalByBase) {
                const baseIdDisplay = baseId ? baseId.substring(0, 8) + '...' : '不明なベース';
                asciiGraph += `\n├─┐ ブランチ${branchIndex + 1} (ベース: ${baseIdDisplay})\n`;
                
                const sortedIncremental = incrementalList.sort((a, b) => a.timestamp - b.timestamp);
                sortedIncremental.forEach((backup, index) => {
                    const date = new Date(backup.timestamp);
                    const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                    
                    const isLast = index === sortedIncremental.length - 1;
                    const connector = isLast ? '  └──' : '  ├──';
                    asciiGraph += `${connector} ◯ 差分 ${timeStr}\n`;
                });
                
                branchIndex++;
            }
        }
        
                    if (asciiGraph === '') {
                asciiGraph = '✗ バックアップデータがありません';
            }
        
        graphContent.textContent = asciiGraph;
        
        // スタイル設定
        asciiGraphContainer.style.cssText = `
            padding: 20px;
            background: var(--background-secondary);
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.6;
            white-space: pre;
            overflow-x: auto;
            border: 2px dashed var(--text-muted);
        `;
        
        container.appendChild(asciiGraphContainer);
    }

    private async renderSimpleGraph(container: HTMLElement, backups: { generations: BackupFileInfo[], incremental: BackupFileInfo[] }) {
        try {
            // 簡易版グラフ表示（テキストベース）
            const graphContainer = this.createElement({
                tagName: 'div',
                className: 'backup-chain-simple-graph'
            });

            graphContainer.style.cssText = `
                padding: 20px;
                background: var(--background-secondary);
                border-radius: 8px;
                font-family: monospace;
                font-size: 14px;
                line-height: 1.6;
                white-space: pre-wrap;
                overflow-x: auto;
            `;

            let graphText = '◯ バックアップ関係図\n\n';
            
            if (backups.generations.length > 0) {
                graphText += '■ 世代バックアップ:\n';
                backups.generations.forEach((backup, index) => {
                    const date = new Date(backup.timestamp).toLocaleString('ja-JP');
                    const connector = index < backups.generations.length - 1 ? '  ↓' : '';
                    graphText += `  ■ ${backup.generation?.period || 'Unknown'} (${date})\n${connector}\n`;
                });
                graphText += '\n';
            }

            if (backups.incremental.length > 0) {
                graphText += '◈ 差分バックアップ:\n';
                backups.incremental.forEach(backup => {
                    const date = new Date(backup.timestamp).toLocaleString('ja-JP');
                    const baseId = backup.incremental?.baseBackupId || 'Unknown';
                    const baseIdDisplay = baseId && baseId !== 'Unknown' ? baseId.substring(0, 8) + '...' : baseId;
                    graphText += `  ◈ ${date} (ベース: ${baseIdDisplay})\n`;
                });
            }

            if (backups.generations.length === 0 && backups.incremental.length === 0) {
                graphText += '✗ バックアップが見つかりません';
            }

            graphContainer.textContent = graphText;
            container.appendChild(graphContainer);

            // GitGraphコードも表示
            const gitGraphCode = this.generateMermaidGraph(backups.generations, backups.incremental);
            const detailsContainer = this.createElement({
                tagName: 'div',
                className: 'backup-chain-details',
                children: [
                    {
                        tagName: 'h4',
                        textContent: '生成されたGitGraphコード'
                    },
                    {
                        tagName: 'details',
                        children: [
                            {
                                tagName: 'summary',
                                textContent: 'GitGraphコードを表示'
                            },
                            {
                                tagName: 'pre',
                                textContent: gitGraphCode
                            }
                        ]
                    }
                ]
            });

            detailsContainer.style.cssText = `
                margin-top: 20px;
                padding: 16px;
                background: var(--background-primary);
                border-radius: 8px;
            `;

            container.appendChild(detailsContainer);

        } catch (error) {
            console.error('[BackupChainVisualization] 簡易グラフ表示エラー:', error);
            this.showError(container, error instanceof Error ? error.message : String(error));
        }
    }

    private async renderMermaidGraph(container: HTMLElement, mermaidCode: string) {
        try {
            console.log('[BackupChainVisualization] GitGraphコード:', mermaidCode);
            
            // 簡易版グラフ表示（テキストベース）
            const graphContainer = this.createElement({
                tagName: 'div',
                className: 'backup-chain-simple-graph'
            });

            graphContainer.style.cssText = `
                padding: 20px;
                background: var(--background-secondary);
                border-radius: 8px;
                font-family: monospace;
                font-size: 14px;
                line-height: 1.6;
                white-space: pre-wrap;
                overflow-x: auto;
            `;

            // バックアップ一覧を取得して簡易的にグラフ化
            const backups = await this.backupManager.getAvailableBackups();
            let graphText = '◯ バックアップ関係図\n\n';
            
            if (backups.generations.length > 0) {
                graphText += '■ 世代バックアップ:\n';
                backups.generations.forEach((backup, index) => {
                    const date = new Date(backup.timestamp).toLocaleString('ja-JP');
                    const connector = index < backups.generations.length - 1 ? '  ↓' : '';
                    graphText += `  ■ ${backup.generation?.period || 'Unknown'} (${date})\n${connector}\n`;
                });
                graphText += '\n';
            }

            if (backups.incremental.length > 0) {
                graphText += '◈ 差分バックアップ:\n';
                backups.incremental.forEach(backup => {
                    const date = new Date(backup.timestamp).toLocaleString('ja-JP');
                    const baseId = backup.incremental?.baseBackupId || 'Unknown';
                    const baseIdDisplay = baseId && baseId !== 'Unknown' ? baseId.substring(0, 8) + '...' : baseId;
                    graphText += `  ◈ ${date} (ベース: ${baseIdDisplay})\n`;
                });
            }

            if (backups.generations.length === 0 && backups.incremental.length === 0) {
                graphText += '✗ バックアップが見つかりません';
            }

            graphContainer.textContent = graphText;
            container.appendChild(graphContainer);

            // さらに詳細情報も追加
            const detailsContainer = this.createElement({
                tagName: 'div',
                className: 'backup-chain-details',
                children: [
                    {
                        tagName: 'h4',
                        textContent: '生成されたGitGraphコード'
                    },
                    {
                        tagName: 'details',
                        children: [
                            {
                                tagName: 'summary',
                                textContent: 'GitGraphコードを表示'
                            },
                            {
                                tagName: 'pre',
                                textContent: mermaidCode
                            }
                        ]
                    }
                ]
            });

            detailsContainer.style.cssText = `
                margin-top: 20px;
                padding: 16px;
                background: var(--background-primary);
                border-radius: 8px;
            `;

            container.appendChild(detailsContainer);

        } catch (error) {
            console.error('[BackupChainVisualization] グラフ表示エラー:', error);
            
            // フォールバック: エラー表示
            const fallbackEl = this.createElement({
                tagName: 'div',
                className: 'backup-chain-fallback',
                children: [
                    {
                        tagName: 'h4',
                        textContent: 'グラフ表示エラー'
                    },
                    {
                        tagName: 'p',
                        textContent: `エラー: ${error instanceof Error ? error.message : String(error)}`
                    },
                    {
                        tagName: 'pre',
                        textContent: mermaidCode
                    }
                ]
            });
            container.appendChild(fallbackEl);
        }
    }

    private async performIntegrityCheck(container: HTMLElement) {
        try {
            this.showLoading(container, t(this.language, 'backupIntegrityCheck') + '...');

            // 全バックアップの整合性チェック実行
            const integrityResult = await this.backupManager.checkAllBackupsIntegrity(
                (message: string) => console.log('[BackupChainVisualization] 整合性チェック:', message)
            );
            
            console.log('[BackupChainVisualization] 整合性チェック生データ:', integrityResult);
            console.log('[BackupChainVisualization] 結果の型:', typeof integrityResult);
            console.log('[BackupChainVisualization] 配列かどうか:', Array.isArray(integrityResult));
            console.log('[BackupChainVisualization] 結果のキー:', integrityResult ? Object.keys(integrityResult) : 'null');
            
            // 結果を配列形式に変換（必要に応じて）
            if (Array.isArray(integrityResult)) {
                this.integrityResults = integrityResult;
            } else {
                console.warn('[BackupChainVisualization] 整合性チェック結果が配列ではありません:', integrityResult);
                this.integrityResults = [];
            }
            
            console.log('[BackupChainVisualization] 最終的な整合性結果:', this.integrityResults);
            
            // 結果を表示（整合性タブでは可視化は表示しない）
            this.displayIntegrityResults(container);
            
            this.hideLoading(container);

        } catch (error) {
            console.error('[BackupChainVisualization] 整合性チェックエラー:', error);
            
            this.hideLoading(container);
            
            const errorEl = container.createDiv({ cls: 'backup-chain-error' });
            errorEl.createEl('h3', { text: 'エラー' });
            errorEl.createEl('p', { text: error instanceof Error ? error.message : String(error) });
        }
    }

    private displayIntegrityResults(container: HTMLElement) {
        if (!this.integrityResults) {
            console.warn('[BackupChainVisualization] integrityResults が null または undefined です');
            return;
        }

        if (!Array.isArray(this.integrityResults)) {
            console.warn('[BackupChainVisualization] integrityResults が配列ではありません:', this.integrityResults);
            return;
        }

        // デバッグ用：整合性結果の詳細ログ
        console.log('[BackupChainVisualization] 整合性結果の詳細:', this.integrityResults.map(result => ({
            success: result.success,
            backupId: result.backupId,
            hasBackupId: !!result.backupId,
            backupIdType: typeof result.backupId,
            error: result.error
        })));

        // 既存の結果表示を削除
        const existingResults = container.querySelector('.backup-integrity-results');
        if (existingResults) existingResults.remove();

        const resultsContainer = container.createDiv({ cls: 'backup-integrity-results' });
        resultsContainer.style.cssText = `
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 20px;
        `;

        let healthyCount = 0;
        let damagedCount = 0;

        this.integrityResults.forEach((result, index) => {
            console.log(`[BackupChainVisualization] 結果${index}処理:`, {
                success: result.success,
                backupId: result.backupId,
                hasBackupId: !!result.backupId,
                backupIdLength: result.backupId?.length,
                error: result.error
            });

            if (result.success) {
                healthyCount++;
            } else {
                damagedCount++;
                
                // 破損したバックアップの情報を後で表示するために保存
                const backupIdDisplay = result.backupId ? result.backupId.substring(0, 8) + '...' : '不明なID';
                
                console.log(`[BackupChainVisualization] バックアップID表示:`, {
                    original: result.backupId,
                    display: backupIdDisplay,
                    condition: !!result.backupId
                });
                
                // 詳細セクションが存在する場合に問題のあるバックアップを追加
                setTimeout(() => {
                    const detailsSection = resultsContainer.querySelector('.integrity-details');
                    if (detailsSection) {
                        const issueEl = detailsSection.createDiv({ cls: 'integrity-issue' });
                        issueEl.style.cssText = `
                            padding: 12px;
                            background: var(--background-primary);
                            border-radius: 6px;
                            margin-bottom: 8px;
                                                                border-left: 3px solid var(--background-modifier-border);
                        `;
                        
                        const issueTitle = issueEl.createEl('h5', { cls: 'issue-title' });
                        issueTitle.style.cssText = `
                            margin: 0 0 4px 0;
                            color: var(--text-normal);
                            font-size: 14px;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        `;
                        
                        const errorIcon = issueTitle.createSpan({ cls: 'error-icon' });
                        errorIcon.style.cssText = `color: var(--text-muted);`;
                        setIcon(errorIcon, 'x-circle');
                        issueTitle.createSpan({ text: backupIdDisplay });
                        
                        if (result.error) {
                            issueEl.createEl('p', { 
                                text: `エラー: ${result.error}`,
                                cls: 'issue-error'
                            }).style.cssText = `
                                margin: 0;
                                color: var(--text-muted);
                                font-size: 12px;
                            `;
                        }
                    }
                }, 10);
            }
        });

        // サマリー表示
        const summaryEl = resultsContainer.createDiv({ cls: 'integrity-summary' });
        summaryEl.style.cssText = `
            text-align: center;
            padding: 20px;
            background: var(--background-secondary);
            border-radius: 8px;
            margin-bottom: 16px;
        `;

        const statusIconName = healthyCount > 0 && damagedCount === 0 ? 'check-circle' : 
                               damagedCount > 0 ? 'alert-triangle' : 'bar-chart';
        const statusText = healthyCount > 0 && damagedCount === 0 ? '全て正常' : 
                          damagedCount > 0 ? '問題あり' : 'チェック完了';

        const statusIconEl = summaryEl.createDiv({ cls: 'status-icon-large' });
        statusIconEl.style.cssText = `
            font-size: 48px; 
            margin-bottom: 12px;
            display: flex;
            justify-content: center;
            color: var(--text-muted);
        `;
        setIcon(statusIconEl, statusIconName);
        
        const statusTitle = summaryEl.createEl('h3');
        statusTitle.style.cssText = `margin: 0 0 12px 0; color: var(--text-normal);`;
        statusTitle.textContent = statusText;
        
        const statusDesc = summaryEl.createEl('p');
        statusDesc.style.cssText = `margin: 0; color: var(--text-muted); font-size: 16px;`;
        statusDesc.textContent = `正常: ${healthyCount}件、破損: ${damagedCount}件`;

        // 問題がある場合の詳細セクション
        if (damagedCount > 0) {
            const detailsSection = resultsContainer.createDiv({ cls: 'integrity-details' });
            detailsSection.style.cssText = `
                border-top: 1px solid var(--background-modifier-border);
                padding-top: 16px;
            `;
            
            const detailsTitle = detailsSection.createEl('h4', { cls: 'details-title' });
            detailsTitle.style.cssText = `
                margin: 0 0 12px 0;
                color: var(--text-normal);
                font-size: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            
            const warningIcon = detailsTitle.createSpan({ cls: 'warning-icon' });
            warningIcon.style.cssText = `color: var(--text-muted);`;
            setIcon(warningIcon, 'alert-triangle');
            detailsTitle.createSpan({ text: '問題のあるバックアップ' });
            detailsTitle.style.cssText = `
                margin: 0 0 12px 0;
                color: var(--text-accent);
                font-size: 16px;
            `;
        }
    }

    private createStatsCard(title: string, value: string, iconName: string, bgColor: string): HTMLElement {
        const card = this.createElement({
            tagName: 'div',
            className: 'widget backup-stats-card'
        });

        card.style.cssText = `
            background: ${bgColor};
            color: var(--text-normal);
            text-align: center;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            border: 1px solid var(--background-modifier-border);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        `;

        const iconEl = this.createElement({
            tagName: 'div',
            className: 'card-icon'
        });
        setIcon(iconEl, iconName);
        iconEl.style.cssText = `
            font-size: 2.5em;
            margin-bottom: 12px;
            opacity: 0.8;
            color: var(--text-accent);
        `;

        const titleEl = this.createElement({
            tagName: 'h4',
            textContent: title,
            className: 'card-title'
        });
        titleEl.style.cssText = `
            margin: 0 0 8px 0;
            font-size: 14px;
            font-weight: 500;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        `;

        const valueEl = this.createElement({
            tagName: 'div',
            textContent: value,
            className: 'card-value'
        });
        valueEl.style.cssText = `
            font-size: 24px;
            font-weight: 600;
            color: var(--text-normal);
        `;

        card.appendChild(iconEl);
        card.appendChild(titleEl);
        card.appendChild(valueEl);

        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
        });

        return card;
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private createBackupListItem(backup: BackupFileInfo): HTMLElement {
        const isGeneration = backup.generation;
        const date = new Date(backup.timestamp);
        
        const item = this.createElement({
            tagName: 'div',
            className: 'recent-backup-card'
        });

        item.style.cssText = `
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        `;

        // アクセントライン
        const accentLine = this.createElement({
            tagName: 'div',
            className: 'card-accent-line'
        });
        accentLine.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 3px;
            height: 100%;
            background: var(--background-modifier-border);
        `;

        // ヘッダー部分
        const header = this.createElement({
            tagName: 'div',
            className: 'card-header'
        });
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        `;

        // 左側：アイコンとタイプ
        const leftSection = this.createElement({
            tagName: 'div',
            className: 'card-left-section'
        });
        leftSection.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
        `;

        const iconContainer = this.createElement({
            tagName: 'div',
            className: 'card-icon-container'
        });
        iconContainer.style.cssText = `
            width: 40px;
            height: 40px;
            border-radius: 8px;
            background: var(--background-modifier-border);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            font-size: 16px;
        `;
        setIcon(iconContainer, isGeneration ? 'archive' : 'file-diff');

        const typeInfo = this.createElement({
            tagName: 'div',
            className: 'card-type-info'
        });
        typeInfo.innerHTML = `
            <div style="font-weight: 600; color: var(--text-normal); font-size: 16px; margin-bottom: 2px;">
                ${isGeneration ? '世代バックアップ' : '差分バックアップ'}
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
                ${isGeneration ? 'Generation Backup' : 'Incremental Backup'}
            </div>
        `;

        leftSection.appendChild(iconContainer);
        leftSection.appendChild(typeInfo);

        // 右側：ステータス
        const statusBadge = this.createElement({
            tagName: 'div',
            className: 'card-status-badge'
        });
        statusBadge.style.cssText = `
            background: var(--background-secondary);
            color: var(--text-muted);
            padding: 4px 8px;
            border-radius: 6px;
            border: 1px solid var(--background-modifier-border);
            font-size: 11px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 4px;
        `;
        const statusIcon = statusBadge.createSpan({ cls: 'status-icon' });
        setIcon(statusIcon, 'check-circle');
        statusBadge.createSpan({ text: ' 正常', cls: 'status-text' });

        header.appendChild(leftSection);
        header.appendChild(statusBadge);

        // メタデータグリッド
        const metaGrid = this.createElement({
            tagName: 'div',
            className: 'card-meta-grid'
        });
        metaGrid.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
        `;

        // 作成日時
        const dateColumn = this.createElement({
            tagName: 'div',
            className: 'meta-column'
        });
        dateColumn.innerHTML = `
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">作成日時</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text-normal); margin-bottom: 2px;">
                ${date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
                ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            </div>
        `;

        // ファイルサイズ
        const sizeColumn = this.createElement({
            tagName: 'div',
            className: 'meta-column'
        });
        sizeColumn.innerHTML = `
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">サイズ</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text-normal); margin-bottom: 2px;">
                ${this.formatFileSize(backup.size || 0)}
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
                ${backup.size || 0} bytes
            </div>
        `;

        // 相対時間
        const relativeTime = this.getRelativeTime(backup.timestamp);
        const timeColumn = this.createElement({
            tagName: 'div',
            className: 'meta-column'
        });
        timeColumn.innerHTML = `
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">経過時間</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text-normal); margin-bottom: 2px;">
                ${relativeTime}
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
                ${Math.floor((Date.now() - backup.timestamp) / 1000)}秒前
            </div>
        `;

        metaGrid.appendChild(dateColumn);
        metaGrid.appendChild(sizeColumn);
        metaGrid.appendChild(timeColumn);

        // ID セクション
        const idSection = this.createElement({
            tagName: 'div',
            className: 'card-id-section'
        });
        idSection.style.cssText = `
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 8px;
            padding: 12px;
            font-family: monospace;
        `;
        idSection.innerHTML = `
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">バックアップID</div>
            <div style="font-size: 13px; color: var(--text-normal); word-break: break-all; line-height: 1.3;">
                ${backup.id || '不明なID'}
            </div>
        `;

        // ホバー効果
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateY(-1px)';
            item.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)';
            item.style.borderColor = 'var(--text-accent)';
        });

        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateY(0)';
            item.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
            item.style.borderColor = 'var(--background-modifier-border)';
        });

        // クリックイベント
        item.addEventListener('click', () => {
            this.showBackupDetailsModal(backup);
        });

        item.appendChild(accentLine);
        item.appendChild(header);
        item.appendChild(metaGrid);
        item.appendChild(idSection);

        return item;
    }

    private getRelativeTime(timestamp: number): string {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (minutes < 60) {
            return `${minutes}分前`;
        } else if (hours < 24) {
            return `${hours}時間前`;
        } else {
            return `${days}日前`;
        }
    }

    private createTimelineItem(backup: BackupFileInfo, index: number): HTMLElement {
        const item = this.createElement({
            tagName: 'div',
            className: 'timeline-item'
        });

        const typeName = backup.generation ? '世代' : '差分';
        const date = new Date(backup.timestamp);
        const dateStr = date.toLocaleDateString('ja-JP');
        const timeStr = date.toLocaleTimeString('ja-JP');

        item.style.cssText = `
            position: relative;
            padding: 16px 0 16px 40px;
            border-left: 2px solid var(--background-modifier-border);
        `;

                    if (index === 0) {
                item.style.borderLeftColor = 'var(--text-accent)';
            }

        const marker = this.createElement({
            tagName: 'div',
            className: 'timeline-marker'
        });
        setIcon(marker, backup.generation ? 'archive' : 'file-diff');
        marker.style.cssText = `
            position: absolute;
            left: -12px;
            top: 16px;
            width: 20px;
            height: 20px;
            background: var(--background-secondary);
            border: 2px solid var(--background-modifier-border);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            color: var(--text-muted);
        `;

        const content = this.createElement({
            tagName: 'div',
            className: 'timeline-content'
        });
        content.innerHTML = `
            <div style="font-weight: 500; margin-bottom: 4px;">${typeName}バックアップ作成</div>
            <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 4px;">${dateStr} ${timeStr}</div>
            <div style="font-size: 12px; color: var(--text-muted);">
                ID: ${backup.id ? backup.id.substring(0, 12) + '...' : '不明なID'} | サイズ: ${this.formatFileSize(backup.size || 0)}
            </div>
        `;

        item.appendChild(marker);
        item.appendChild(content);

        return item;
    }

    private showError(container: HTMLElement, message: string): void {
        const errorEl = this.createElement({
            tagName: 'div',
            className: 'backup-dashboard-error'
        });

        errorEl.style.cssText = `
            text-align: center;
            padding: 48px;
            color: var(--text-error);
            background: var(--background-modifier-error);
            border-radius: 8px;
            margin: 24px;
        `;

        errorEl.innerHTML = `
            <h3>エラーが発生しました</h3>
            <p>${message}</p>
        `;

        container.appendChild(errorEl);
    }

    protected onClose(): void {
        // 整合性チェック結果をクリア
        this.integrityResults = null;
        
        // DOM要素のクリーンアップ
        this.contentEl.innerHTML = '';
    }

    /**
     * MermaidのGitGraphをレンダリング
     */
    private async renderMermaidGitGraph(container: HTMLElement, backups: { generations: BackupFileInfo[], incremental: BackupFileInfo[] }) {
        const mermaidContainer = this.createElement({
            tagName: 'div',
            className: 'mermaid-gitgraph-container'
        });

        mermaidContainer.style.cssText = `
            background: var(--background-secondary);
            border-radius: 12px;
            padding: 30px;
            margin-bottom: 20px;
            border: 2px solid var(--background-modifier-border);
            min-height: 400px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // MermaidのGitGraphコードを生成
        const gitGraphCode = this.generateMermaidGraph(backups.generations, backups.incremental);
        
        try {
            console.log('[BackupChainVisualization] Mermaid GitGraph レンダリング開始');
            
            // ObsidianのMarkdownレンダラーでMermaidをレンダリング
            const markdownContent = '```mermaid\n' + gitGraphCode + '\n```';
            
            await MarkdownRenderer.render(
                this.widget.app,
                markdownContent,
                mermaidContainer,
                '', // sourcePath
                null as any // component
            );
            
            console.log('[BackupChainVisualization] Mermaid GitGraph レンダリング完了');
            
            // レンダリング後の確認
            setTimeout(() => {
                const svgElements = mermaidContainer.querySelectorAll('svg');
                if (svgElements.length === 0) {
                    console.warn('[BackupChainVisualization] Mermaid SVGが生成されませんでした');
                    this.renderFallbackGitGraph(mermaidContainer, gitGraphCode);
                } else {
                    console.log('[BackupChainVisualization] Mermaid GitGraph SVG生成成功');
                    // SVGのスタイル調整
                    svgElements.forEach(svg => {
                        svg.style.maxWidth = '100%';
                        svg.style.height = 'auto';
                    });
                }
            }, 1000);
            
        } catch (error) {
            console.error('[BackupChainVisualization] Mermaid レンダリングエラー:', error);
            this.renderFallbackGitGraph(mermaidContainer, gitGraphCode);
        }

        container.appendChild(mermaidContainer);
    }

    /**
     * Mermaidのフォールバック表示
     */
    private renderFallbackGitGraph(container: HTMLElement, gitGraphCode: string) {
        container.innerHTML = '';
        
        const fallbackContainer = this.createElement({
            tagName: 'div',
            className: 'fallback-gitgraph'
        });

        const fallbackHeader = fallbackContainer.createDiv({ cls: 'fallback-header' });
        const fallbackIcon = fallbackHeader.createSpan({ cls: 'fallback-icon' });
        setIcon(fallbackIcon, 'git-branch');
        fallbackHeader.createSpan({ 
            text: 'Mermaid GitGraph (テキスト版)',
            cls: 'fallback-title'
        });

        const fallbackCode = fallbackContainer.createEl('pre', {
            text: gitGraphCode,
            cls: 'fallback-code'
        });

        fallbackContainer.style.cssText = `
            text-align: center;
            padding: 40px;
            color: var(--text-muted);
        `;

        const header = fallbackContainer.querySelector('.fallback-header') as HTMLElement;
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-bottom: 20px;
            font-size: 16px;
            font-weight: bold;
        `;

        const code = fallbackContainer.querySelector('.fallback-code') as HTMLElement;
        code.style.cssText = `
            background: var(--background-primary);
            padding: 20px;
            border-radius: 8px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            line-height: 1.6;
            text-align: left;
            overflow-x: auto;
            border: 1px solid var(--background-modifier-border);
        `;

        container.appendChild(fallbackContainer);
    }

    // D3.js機能を削除し、代わりにカード表示とタイムライン表示を提供

        private async renderInteractiveTimeline(container: HTMLElement, backups: { generations: BackupFileInfo[], incremental: BackupFileInfo[] }) {
        const timelineContainer = container.createDiv({ cls: 'backup-interactive-timeline' });
        timelineContainer.style.cssText = `
            width: 100%;
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 12px;
            padding: 32px;
            position: relative;
        `;

        // 全バックアップを時系列で並べる
        const allBackups = [...backups.generations, ...backups.incremental]
            .sort((a, b) => a.timestamp - b.timestamp);

        if (allBackups.length === 0) {
            const emptyState = timelineContainer.createDiv({ cls: 'timeline-empty' });
            emptyState.style.cssText = `
                text-align: center;
                padding: 60px 20px;
                color: var(--text-muted);
                font-size: 16px;
            `;
            
            const emptyIcon = emptyState.createDiv({ cls: 'empty-icon' });
            emptyIcon.style.cssText = `
                font-size: 48px; 
                margin-bottom: 16px;
                display: flex;
                justify-content: center;
            `;
            setIcon(emptyIcon, 'file-x');
            
            emptyState.createDiv({ text: 'バックアップがありません' });
            return;
        }

        // ヘッダー情報
        const headerInfo = timelineContainer.createDiv({ cls: 'timeline-header' });
        headerInfo.style.cssText = `
            text-align: center;
            margin-bottom: 40px;
            padding: 20px;
            background: var(--background-secondary);
            border-radius: 8px;
        `;
        const headerTitle = headerInfo.createDiv();
        headerTitle.style.cssText = `
            font-size: 18px; 
            font-weight: 600; 
            color: var(--text-normal); 
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        `;
        
        const headerIcon = headerTitle.createSpan({ cls: 'header-icon' });
        setIcon(headerIcon, 'activity');
        headerTitle.createSpan({ text: 'バックアップタイムライン' });
        
        const headerSubtitle = headerInfo.createDiv();
        headerSubtitle.style.cssText = `color: var(--text-muted); font-size: 14px;`;
        headerSubtitle.textContent = `${allBackups.length}件のバックアップ • ${new Date(allBackups[0].timestamp).toLocaleDateString('ja-JP')} - ${new Date(allBackups[allBackups.length - 1].timestamp).toLocaleDateString('ja-JP')}`;

        // 垂直タイムライン
        const timelineTrack = timelineContainer.createDiv({ cls: 'timeline-track' });
        timelineTrack.style.cssText = `
            position: relative;
            margin: 0 auto;
            max-width: 800px;
        `;

        // 中央ライン
        const centerLine = timelineTrack.createDiv({ cls: 'center-line' });
        centerLine.style.cssText = `
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            width: 2px;
            background: var(--background-modifier-border);
            transform: translateX(-50%);
            border-radius: 1px;
        `;

        // タイムラインアイテム
        allBackups.forEach((backup, index) => {
            const isLeft = index % 2 === 0;
            const timelineItem = this.createVerticalTimelineItem(backup, index, isLeft, allBackups.length);
            timelineTrack.appendChild(timelineItem);
        });

        timelineTrack.appendChild(centerLine);
    }

    private createVerticalTimelineItem(backup: BackupFileInfo, index: number, isLeft: boolean, totalCount: number): HTMLElement {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.style.cssText = `
            position: relative;
            margin-bottom: 60px;
            display: flex;
            align-items: center;
            min-height: 120px;
        `;

        // タイムライン番号
        const timelineNumber = item.createDiv({ cls: 'timeline-number' });
        timelineNumber.style.cssText = `
            position: absolute;
            left: 50%;
            top: 20px;
            width: 32px;
            height: 32px;
            background: var(--background-secondary);
            border: 2px solid var(--background-modifier-border);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            color: var(--text-normal);
            font-size: 12px;
            transform: translateX(-50%);
            z-index: 10;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        `;
        timelineNumber.textContent = (index + 1).toString();

        // コンテンツカード
        const contentCard = item.createDiv({ cls: 'timeline-content-card' });
        contentCard.style.cssText = `
            width: 45%;
            ${isLeft ? 'margin-right: auto; margin-left: 0;' : 'margin-left: auto; margin-right: 0;'}
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        `;

        // ホバー効果
        contentCard.addEventListener('mouseenter', () => {
            contentCard.style.transform = 'translateY(-2px)';
            contentCard.style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
            contentCard.style.borderColor = 'var(--text-accent)';
        });

        contentCard.addEventListener('mouseleave', () => {
            contentCard.style.transform = 'translateY(0)';
            contentCard.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)';
            contentCard.style.borderColor = 'var(--background-modifier-border)';
        });

        // アクセントライン
        const accentLine = contentCard.createDiv({ cls: 'accent-line' });
        accentLine.style.cssText = `
            position: absolute;
            top: 0;
            ${isLeft ? 'right: 0;' : 'left: 0;'}
            width: 3px;
            height: 100%;
            background: var(--background-modifier-border);
        `;

        // カードヘッダー
        const cardHeader = contentCard.createDiv({ cls: 'card-header' });
        cardHeader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        `;

        const typeInfo = cardHeader.createDiv({ cls: 'type-info' });
        typeInfo.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
        `;

        const typeIcon = typeInfo.createSpan({ cls: 'type-icon' });
        typeIcon.style.cssText = `
            font-size: 20px;
        `;
        setIcon(typeIcon, backup.type === 'incremental' ? 'file-diff' : 'archive');

        const typeLabel = typeInfo.createSpan({ 
            text: backup.type === 'incremental' ? '差分バックアップ' : '世代バックアップ',
            cls: 'type-label'
        });
        typeLabel.style.cssText = `
            font-weight: 600;
            font-size: 14px;
            color: var(--text-normal);
        `;

        const statusBadge = cardHeader.createSpan({ cls: 'status-badge' });
        const statusIcon = statusBadge.createSpan({ cls: 'status-icon' });
        setIcon(statusIcon, 'check-circle');
        statusBadge.createSpan({ text: ' 正常', cls: 'status-text' });
        statusBadge.style.cssText = `
            background: var(--background-secondary);
            color: var(--text-muted);
            padding: 4px 8px;
            border-radius: 6px;
            border: 1px solid var(--background-modifier-border);
            font-size: 11px;
            font-weight: 500;
        `;

        // カードタイトル
        const cardTitle = contentCard.createEl('h3', { 
            text: backup.type === 'incremental' ? 
                `差分バックアップ #${index + 1}` : 
                backup.type.toUpperCase(),
            cls: 'card-title'
        });
        cardTitle.style.cssText = `
            margin: 0 0 16px 0;
            font-size: 18px;
            color: var(--text-normal);
            font-weight: 700;
        `;

        // 詳細情報グリッド
        const detailsGrid = contentCard.createDiv({ cls: 'details-grid' });
        detailsGrid.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
        `;

        // 作成日時
        const dateInfo = detailsGrid.createDiv({ cls: 'detail-item' });
        dateInfo.innerHTML = `
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">作成日時</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text-normal);">
                ${new Date(backup.timestamp).toLocaleString('ja-JP', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}
            </div>
        `;

        // ファイルサイズ
        const sizeInfo = detailsGrid.createDiv({ cls: 'detail-item' });
        sizeInfo.innerHTML = `
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">サイズ</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text-normal);">
                ${this.formatFileSize(backup.size)}
            </div>
        `;

        // バックアップID
        const idSection = contentCard.createDiv({ cls: 'id-section' });
        idSection.style.cssText = `
            background: var(--background-primary);
            border-radius: 6px;
            padding: 12px;
            font-family: monospace;
            border: 1px solid var(--background-modifier-border);
        `;
        idSection.innerHTML = `
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">バックアップID</div>
            <div style="font-size: 12px; color: var(--text-normal); word-break: break-all;">
                ${backup.id}
            </div>
        `;

        // 接続線（中央ラインからカードへ）
        const connector = item.createDiv({ cls: 'connector' });
        connector.style.cssText = `
            position: absolute;
            top: 40px;
            ${isLeft ? 'left: 50%; right: 55%;' : 'left: 45%; right: 50%;'}
            height: 2px;
            background: var(--background-modifier-border);
            z-index: 5;
        `;

        // クリックイベント
        contentCard.addEventListener('click', () => {
            this.showBackupDetailsModal(backup);
        });

        return item;
    }

    private async renderCardGridView(container: HTMLElement, backups: { generations: BackupFileInfo[], incremental: BackupFileInfo[] }) {
        const gridContainer = container.createDiv({ cls: 'backup-card-grid' });
        gridContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            padding: 20px 0;
        `;

        // 世代バックアップセクション
                    if (backups.generations.length > 0) {
                const generationSection = container.createDiv({ cls: 'backup-section' });
                const genTitle = generationSection.createEl('h3', { cls: 'section-title' });
                genTitle.style.cssText = `
                    margin: 0 0 16px 0;
                    color: var(--text-normal);
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                
                const genIcon = genTitle.createSpan({ cls: 'section-icon' });
                setIcon(genIcon, 'archive');
                genTitle.createSpan({ text: `世代バックアップ (${backups.generations.length}件)` });

            const generationGrid = generationSection.createDiv({ cls: 'generation-grid' });
            generationGrid.style.cssText = gridContainer.style.cssText;

            backups.generations.forEach(backup => {
                this.createBackupCard(generationGrid, backup, 'generation');
            });
        }

        // 差分バックアップセクション
                    if (backups.incremental.length > 0) {
                const incrementalSection = container.createDiv({ cls: 'backup-section' });
                const incTitle = incrementalSection.createEl('h3', { cls: 'section-title' });
                incTitle.style.cssText = `
                    margin: 20px 0 16px 0;
                    color: var(--text-normal);
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;
                
                const incIcon = incTitle.createSpan({ cls: 'section-icon' });
                setIcon(incIcon, 'file-diff');
                incTitle.createSpan({ text: `差分バックアップ (${backups.incremental.length}件)` });

            const incrementalGrid = incrementalSection.createDiv({ cls: 'incremental-grid' });
            incrementalGrid.style.cssText = gridContainer.style.cssText;

            backups.incremental.forEach(backup => {
                this.createBackupCard(incrementalGrid, backup, 'incremental');
            });
        }
    }

    private createBackupCard(container: HTMLElement, backup: BackupFileInfo, type: 'generation' | 'incremental'): HTMLElement {
        const card = container.createDiv({ cls: 'modern-backup-card' });
        card.style.cssText = `
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 12px;
            padding: 20px;
            transition: all 0.3s ease;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        `;

        // アクセントライン
        const gradient = card.createDiv({ cls: 'card-gradient' });
        gradient.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--background-modifier-border);
        `;

        // カードヘッダー
        const header = card.createDiv({ cls: 'card-header' });
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        `;

        const typeLabel = header.createSpan({ 
            text: type === 'generation' ? '世代' : '差分',
            cls: 'type-label'
        });
        typeLabel.style.cssText = `
            background: var(--background-secondary);
            color: var(--text-muted);
            padding: 4px 12px;
            border-radius: 6px;
            border: 1px solid var(--background-modifier-border);
            font-size: 12px;
            font-weight: 500;
        `;

        const statusIcon = header.createSpan({ cls: 'status-icon' });
        setIcon(statusIcon, 'check-circle');
        statusIcon.style.cssText = `font-size: 16px;`;

        // メインコンテンツ
        const title = card.createEl('h4', { 
            text: type === 'generation' ? backup.type.toUpperCase() : `差分バックアップ`,
            cls: 'card-title'
        });
        title.style.cssText = `
            margin: 0 0 12px 0;
            font-size: 16px;
            color: var(--text-normal);
            font-weight: 600;
        `;

        // 統計情報
        const stats = card.createDiv({ cls: 'card-stats' });
        stats.style.cssText = `
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 16px;
        `;

        const sizeBox = stats.createDiv({ cls: 'stat-box' });
        sizeBox.innerHTML = `
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">サイズ</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text-normal);">${this.formatFileSize(backup.size)}</div>
        `;

        const dateBox = stats.createDiv({ cls: 'stat-box' });
        dateBox.innerHTML = `
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">作成日時</div>
            <div style="font-size: 14px; font-weight: 600; color: var(--text-normal);">${new Date(backup.timestamp).toLocaleDateString('ja-JP')}</div>
        `;

        // バックアップID
        const idSection = card.createDiv({ cls: 'card-id' });
        idSection.style.cssText = `
            background: var(--background-primary);
            border-radius: 6px;
            padding: 8px;
            font-family: monospace;
            font-size: 11px;
            color: var(--text-muted);
            word-break: break-all;
        `;
        idSection.textContent = `ID: ${backup.id}`;

        // ホバー効果
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
            card.style.borderColor = 'var(--text-accent)';
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
            card.style.borderColor = 'var(--background-modifier-border)';
        });

        // クリックアクション
        card.addEventListener('click', () => {
            this.showBackupDetailsModal(backup);
        });

        return card;
    }

    private showBackupDetailsModal(backup: BackupFileInfo): void {
        // 詳細モーダルの実装（簡略版）
        alert(`バックアップ詳細:\n\nID: ${backup.id}\nタイプ: ${backup.type}\n作成日時: ${new Date(backup.timestamp).toLocaleString('ja-JP')}\nサイズ: ${this.formatFileSize(backup.size)}`);
    }

    // D3.js機能を削除し、代わりにカード表示とタイムライン表示を提供

    private async renderInteractiveSVGGraph(container: HTMLElement, backups: { generations: BackupFileInfo[], incremental: BackupFileInfo[] }) {
        const svgContainer = container.createDiv({ cls: 'interactive-svg-graph' });
        svgContainer.style.cssText = `
            width: 100%;
            height: 500px;
            background: var(--background-secondary);
            border-radius: 12px;
            padding: 20px;
            position: relative;
            overflow: hidden;
            border: 2px solid var(--background-modifier-border);
        `;

        const width = 800;
        const height = 460;

        // SVG要素を作成
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', width.toString());
        svg.setAttribute('height', height.toString());
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.style.cssText = `
            width: 100%;
            height: 100%;
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 8px;
        `;

        // グラデーション定義
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        
        // メインブランチ用グラデーション
        const mainGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        mainGradient.setAttribute('id', 'mainBranchGradient');
        mainGradient.setAttribute('x1', '0%');
        mainGradient.setAttribute('y1', '0%');
        mainGradient.setAttribute('x2', '100%');
        mainGradient.setAttribute('y2', '0%');
        
        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', 'var(--text-muted)');
        
        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', 'var(--text-muted)');
        
        mainGradient.appendChild(stop1);
        mainGradient.appendChild(stop2);

        // 差分ブランチ用グラデーション
        const diffGradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        diffGradient.setAttribute('id', 'diffBranchGradient');
        diffGradient.setAttribute('x1', '0%');
        diffGradient.setAttribute('y1', '0%');
        diffGradient.setAttribute('x2', '100%');
        diffGradient.setAttribute('y2', '0%');
        
        const diffStop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        diffStop1.setAttribute('offset', '0%');
        diffStop1.setAttribute('stop-color', 'var(--text-muted)');
        
        const diffStop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        diffStop2.setAttribute('offset', '100%');
        diffStop2.setAttribute('stop-color', 'var(--text-muted)');
        
        diffGradient.appendChild(diffStop1);
        diffGradient.appendChild(diffStop2);

        defs.appendChild(mainGradient);
        defs.appendChild(diffGradient);
        svg.appendChild(defs);

        // データ準備
        const allBackups = [...backups.generations, ...backups.incremental]
            .sort((a, b) => a.timestamp - b.timestamp);

        if (allBackups.length === 0) {
            this.renderEmptyState(svg, width, height);
            svgContainer.appendChild(svg);
            return;
        }

        // ノード位置計算
        const nodes: Array<{
            id: string;
            type: 'generation' | 'incremental' | 'main';
            x: number;
            y: number;
            backup?: BackupFileInfo;
            label: string;
            timestamp?: number;
            size?: number;
        }> = [];

        // mainノード
        nodes.push({
            id: 'main',
            type: 'main',
            x: 100,
            y: height / 2,
            label: 'main'
        });

        // 世代バックアップノード（水平配置）
        const genY = height / 2 - 80;
        backups.generations.forEach((backup, index) => {
            nodes.push({
                id: backup.id,
                type: 'generation',
                x: 250 + index * 150,
                y: genY,
                backup,
                label: backup.type.toUpperCase(),
                timestamp: backup.timestamp,
                size: backup.size
            });
        });

        // 差分バックアップノード（下部に配置）
        const incY = height / 2 + 80;
        backups.incremental.forEach((backup, index) => {
            nodes.push({
                id: backup.id,
                type: 'incremental',
                x: 250 + index * 120,
                y: incY,
                backup,
                label: `差分 ${index + 1}`,
                timestamp: backup.timestamp,
                size: backup.size
            });
        });

        // リンク描画
        this.drawConnections(svg, nodes, backups);

        // ノード描画
        this.drawNodes(svg, nodes);

        // インタラクション追加
        this.addNodeInteractions(svg, svgContainer);

        svgContainer.appendChild(svg);
    }

    private drawConnections(svg: SVGSVGElement, nodes: any[], backups: { generations: BackupFileInfo[], incremental: BackupFileInfo[] }) {
        const connectionsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        connectionsGroup.setAttribute('class', 'connections');

        // メインから世代バックアップへの接続
        const mainNode = nodes.find(n => n.type === 'main');
        const generationNodes = nodes.filter(n => n.type === 'generation');

        generationNodes.forEach((genNode, index) => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${mainNode.x + 25} ${mainNode.y} Q ${(mainNode.x + genNode.x) / 2} ${mainNode.y - 30} ${genNode.x - 20} ${genNode.y}`;
            
            path.setAttribute('d', d);
            path.setAttribute('stroke', 'url(#mainBranchGradient)');
            path.setAttribute('stroke-width', '3');
            path.setAttribute('fill', 'none');
            path.setAttribute('opacity', '0');
            
            // アニメーション
            const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            animate.setAttribute('attributeName', 'opacity');
            animate.setAttribute('values', '0;1');
            animate.setAttribute('dur', '1s');
            animate.setAttribute('begin', `${index * 0.3}s`);
            animate.setAttribute('fill', 'freeze');
            
            path.appendChild(animate);
            connectionsGroup.appendChild(path);
        });

        // 差分バックアップへの接続
        const incrementalNodes = nodes.filter(n => n.type === 'incremental');
        incrementalNodes.forEach((incNode, index) => {
            const baseId = incNode.backup?.incremental?.baseBackupId;
            const baseNode = baseId ? nodes.find(n => n.id === baseId) || mainNode : mainNode;
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = `M ${baseNode.x} ${baseNode.y + 25} Q ${(baseNode.x + incNode.x) / 2} ${baseNode.y + 60} ${incNode.x} ${incNode.y - 15}`;
            
            path.setAttribute('d', d);
            path.setAttribute('stroke', 'url(#diffBranchGradient)');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-dasharray', '5,5');
            path.setAttribute('fill', 'none');
            path.setAttribute('opacity', '0');
            
            // アニメーション
            const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            animate.setAttribute('attributeName', 'opacity');
            animate.setAttribute('values', '0;1');
            animate.setAttribute('dur', '1s');
            animate.setAttribute('begin', `${1 + index * 0.2}s`);
            animate.setAttribute('fill', 'freeze');
            
            path.appendChild(animate);
            connectionsGroup.appendChild(path);
        });

        svg.appendChild(connectionsGroup);
    }

    private drawNodes(svg: SVGSVGElement, nodes: any[]) {
        const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodesGroup.setAttribute('class', 'nodes');

        nodes.forEach((node, index) => {
            if (!node || !node.id) {
                console.warn('[BackupChainVisualization] 無効なノードデータ:', node);
                return;
            }

            const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            nodeGroup.setAttribute('class', 'node');
            nodeGroup.setAttribute('data-node-id', node.id);
            nodeGroup.style.cursor = 'pointer';

            // ノードサイズ
            const radius = node.type === 'main' ? 25 : node.type === 'generation' ? 20 : 15;

            // 外側のリング（アニメーション用）
            const outerRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            outerRing.setAttribute('cx', node.x.toString());
            outerRing.setAttribute('cy', node.y.toString());
            outerRing.setAttribute('r', (radius + 5).toString());
            outerRing.setAttribute('fill', 'none');
            outerRing.setAttribute('stroke', this.getNodeColor(node.type));
            outerRing.setAttribute('stroke-width', '2');
            outerRing.setAttribute('opacity', '0');

            // メインノード
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', node.x.toString());
            circle.setAttribute('cy', node.y.toString());
            circle.setAttribute('r', '0');
            circle.setAttribute('fill', this.getNodeColor(node.type));
            circle.setAttribute('stroke', '#ffffff');
            circle.setAttribute('stroke-width', '2');

            // サイズアニメーション
            const radiusAnimate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            radiusAnimate.setAttribute('attributeName', 'r');
            radiusAnimate.setAttribute('values', `0;${radius}`);
            radiusAnimate.setAttribute('dur', '0.5s');
            radiusAnimate.setAttribute('begin', `${index * 0.1}s`);
            radiusAnimate.setAttribute('fill', 'freeze');
            
            circle.appendChild(radiusAnimate);

            // ラベル
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', node.x.toString());
            label.setAttribute('y', (node.y - radius - 10).toString());
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('font-size', '12');
            label.setAttribute('font-weight', 'bold');
            label.setAttribute('fill', '#ffffff');
            label.setAttribute('opacity', '0');
            label.textContent = node.label;

            // ラベルアニメーション
            const labelAnimate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
            labelAnimate.setAttribute('attributeName', 'opacity');
            labelAnimate.setAttribute('values', '0;1');
            labelAnimate.setAttribute('dur', '0.5s');
            labelAnimate.setAttribute('begin', `${index * 0.1 + 0.3}s`);
            labelAnimate.setAttribute('fill', 'freeze');
            
            label.appendChild(labelAnimate);

            // サイズ表示（バックアップの場合）
            if (node.size) {
                const sizeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                sizeLabel.setAttribute('x', node.x.toString());
                sizeLabel.setAttribute('y', (node.y + radius + 20).toString());
                sizeLabel.setAttribute('text-anchor', 'middle');
                sizeLabel.setAttribute('font-size', '10');
                sizeLabel.setAttribute('fill', '#aaaaaa');
                sizeLabel.setAttribute('opacity', '0');
                sizeLabel.textContent = this.formatFileSize(node.size);

                const sizeAnimate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
                sizeAnimate.setAttribute('attributeName', 'opacity');
                sizeAnimate.setAttribute('values', '0;1');
                sizeAnimate.setAttribute('dur', '0.5s');
                sizeAnimate.setAttribute('begin', `${index * 0.1 + 0.5}s`);
                sizeAnimate.setAttribute('fill', 'freeze');
                
                sizeLabel.appendChild(sizeAnimate);
                nodeGroup.appendChild(sizeLabel);
            }

            nodeGroup.appendChild(outerRing);
            nodeGroup.appendChild(circle);
            nodeGroup.appendChild(label);
            nodesGroup.appendChild(nodeGroup);
        });

        svg.appendChild(nodesGroup);
    }

    private addNodeInteractions(svg: SVGSVGElement, container: HTMLElement) {
        const tooltip = container.createDiv({ cls: 'svg-tooltip' });
        tooltip.style.cssText = `
            position: absolute;
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 12px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 1000;
            max-width: 200px;
        `;

        const nodeGroups = svg.querySelectorAll('.node');
        nodeGroups.forEach(nodeGroup => {
            const nodeId = nodeGroup.getAttribute('data-node-id');
            const circles = nodeGroup.querySelectorAll('circle');
            const outerRing = circles[0] as SVGCircleElement;
            const mainCircle = circles[1] as SVGCircleElement;

            // 要素が存在することを確認
            if (!nodeId || !mainCircle) {
                console.warn('[BackupChainVisualization] ノード要素が見つかりません:', nodeId);
                return;
            }

            // ホバー効果
            nodeGroup.addEventListener('mouseenter', (e) => {
                if (mainCircle) {
                    mainCircle.style.filter = 'brightness(1.2)';
                }
                
                if (outerRing) {
                    outerRing.setAttribute('opacity', '0.6');
                    
                    // パルス効果
                    const currentRadius = outerRing.getAttribute('r');
                    if (currentRadius) {
                        const pulseAnimate = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
                        pulseAnimate.setAttribute('attributeName', 'r');
                        pulseAnimate.setAttribute('values', `${currentRadius};${parseInt(currentRadius) + 3};${currentRadius}`);
                        pulseAnimate.setAttribute('dur', '1s');
                        pulseAnimate.setAttribute('repeatCount', 'indefinite');
                        outerRing.appendChild(pulseAnimate);
                    }
                }

                // ツールチップ表示
                this.showTooltip(tooltip, e as MouseEvent, nodeId, container);
            });

            nodeGroup.addEventListener('mouseleave', () => {
                if (mainCircle) {
                    mainCircle.style.filter = 'none';
                }
                
                if (outerRing) {
                    outerRing.setAttribute('opacity', '0');
                    
                    // パルス効果停止
                    const pulseAnimate = outerRing.querySelector('animate');
                    if (pulseAnimate) {
                        outerRing.removeChild(pulseAnimate);
                    }
                }

                tooltip.style.opacity = '0';
            });

            // クリック効果
            nodeGroup.addEventListener('click', () => {
                this.showNodeDetails(nodeId);
            });
        });
    }

    private showTooltip(tooltip: HTMLElement, event: MouseEvent, nodeId: string, container: HTMLElement) {
        try {
            const rect = container.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            if (nodeId === 'main') {
                tooltip.innerHTML = `
                    <strong>メインブランチ</strong><br/>
                    すべてのバックアップの起点
                `;
            } else {
                // バックアップノードの詳細情報を表示
                const displayId = nodeId && nodeId.length > 12 ? nodeId.substring(0, 12) + '...' : nodeId;
                tooltip.innerHTML = `
                    <strong>バックアップ</strong><br/>
                    ID: ${displayId}<br/>
                    クリックで詳細表示
                `;
            }

            tooltip.style.left = (x + 10) + 'px';
            tooltip.style.top = (y - 10) + 'px';
            tooltip.style.opacity = '1';
        } catch (error) {
            console.warn('[BackupChainVisualization] ツールチップ表示エラー:', error);
        }
    }

    private showNodeDetails(nodeId: string) {
        if (nodeId === 'main') {
            alert('メインブランチ\n\nすべてのバックアップの起点となるブランチです。');
        } else {
            alert(`バックアップ詳細\n\nID: ${nodeId}\n\nクリックでより詳細な情報を表示できます。`);
        }
    }

    private getNodeColor(type: string): string {
        switch (type) {
            case 'main': return '#FF9800';
            case 'generation': return '#4CAF50';
            case 'incremental': return '#2196F3';
            default: return '#757575';
        }
    }

    private renderEmptyState(svg: SVGSVGElement, width: number, height: number) {
        const emptyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', (width / 2).toString());
        text.setAttribute('y', (height / 2).toString());
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '18');
        text.setAttribute('fill', '#666666');
        text.textContent = 'バックアップデータがありません';
        
        emptyGroup.appendChild(text);
        svg.appendChild(emptyGroup);
    }
} 