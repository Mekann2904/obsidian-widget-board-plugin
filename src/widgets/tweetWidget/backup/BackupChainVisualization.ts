import { App } from 'obsidian';
import type { BackupFileInfo } from './types';
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
    private integrityResults: Map<string, {
        isHealthy: boolean;
        issues?: string[];
        error?: string;
    }> | null = null;
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
            padding: 24px;
            border-bottom: 1px solid var(--background-modifier-border);
            background: linear-gradient(135deg, var(--background-secondary) 0%, var(--background-primary) 100%);
        `;

        this.contentEl.appendChild(header);
    }

    private renderTabNavigation(): void {
        const tabNav = this.createElement({
            tagName: 'div',
            className: 'backup-dashboard-tabs'
        });

        const tabs = [
            { id: 'overview', label: '概要', icon: '📊' },
            { id: 'graph', label: 'グラフ', icon: '🔗' },
            { id: 'timeline', label: 'タイムライン', icon: '📅' },
            { id: 'integrity', label: '整合性', icon: '🔍' }
        ] as const;

        tabs.forEach(tab => {
            const tabBtn = this.createElement({
                tagName: 'button',
                className: `dashboard-tab ${this.currentTab === tab.id ? 'active' : ''}`,
                innerHTML: `${tab.icon} ${tab.label}`
            }) as HTMLButtonElement;

            tabBtn.onclick = () => this.switchTab(tab.id);
            tabNav.appendChild(tabBtn);
        });

        tabNav.style.cssText = `
            display: flex;
            background: var(--background-secondary);
            border-bottom: 1px solid var(--background-modifier-border);
        `;

        this.contentEl.appendChild(tabNav);
    }

    private switchTab(tabId: 'overview' | 'graph' | 'timeline' | 'integrity'): void {
        this.currentTab = tabId;
        
        // タブボタンの状態更新
        const tabs = this.contentEl.querySelectorAll('.dashboard-tab');
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

            // 統計カード
            const statsGrid = this.createElement({
                tagName: 'div',
                className: 'backup-stats-grid'
            });

            // 世代バックアップ統計
            const generationCard = this.createStatsCard(
                '世代バックアップ',
                backups.generations.length.toString(),
                '📦',
                '#e3f2fd'
            );

            // 差分バックアップ統計  
            const incrementalCard = this.createStatsCard(
                '差分バックアップ',
                backups.incremental.length.toString(),
                '📄',
                '#f3e5f5'
            );

            // 最新バックアップ
            const latestBackup = [...backups.generations, ...backups.incremental]
                .sort((a, b) => b.timestamp - a.timestamp)[0];
            
            const latestCard = this.createStatsCard(
                '最新バックアップ',
                latestBackup ? new Date(latestBackup.timestamp).toLocaleDateString('ja-JP') : '未作成',
                '🕐',
                '#e8f5e8'
            );

            // 合計サイズ
            const totalSize = [...backups.generations, ...backups.incremental]
                .reduce((sum, backup) => sum + (backup.size || 0), 0);
            
            const sizeCard = this.createStatsCard(
                '合計サイズ',
                this.formatFileSize(totalSize),
                '💾',
                '#fff3e0'
            );

            statsGrid.appendChild(generationCard);
            statsGrid.appendChild(incrementalCard);
            statsGrid.appendChild(latestCard);
            statsGrid.appendChild(sizeCard);

            // バックアップ一覧
            const backupList = this.createElement({
                tagName: 'div',
                className: 'backup-list-section'
            });

            const listTitle = this.createElement({
                tagName: 'h3',
                textContent: '最近のバックアップ',
                className: 'section-title'
            });

            const recentBackups = [...backups.generations, ...backups.incremental]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10);

            const listContainer = this.createElement({
                tagName: 'div',
                className: 'backup-list'
            });

            recentBackups.forEach(backup => {
                const item = this.createBackupListItem(backup);
                listContainer.appendChild(item);
            });

            backupList.appendChild(listTitle);
            backupList.appendChild(listContainer);

            container.appendChild(statsGrid);
            container.appendChild(backupList);

        } catch (error) {
            this.hideLoading(container);
            this.showError(container, error instanceof Error ? error.message : String(error));
        }
    }

    private async renderGraphTab(container: HTMLElement): Promise<void> {
        // テスト用の簡単な表示から始める
        this.showLoading(container, '可視化を生成中...');
        
        try {
            // バックアップ一覧を取得
            const backups = await this.backupManager.getAvailableBackups();
            console.log('[BackupChainVisualization] バックアップデータ:', backups);
            
            this.hideLoading(container);
            
            // 簡単なデバッグ情報を表示
            const debugInfo = this.createElement({
                tagName: 'div',
                className: 'backup-debug-info',
                children: [
                    {
                        tagName: 'h3',
                        textContent: 'バックアップ情報'
                    },
                    {
                        tagName: 'p',
                        textContent: `世代バックアップ: ${backups.generations.length}件`
                    },
                    {
                        tagName: 'p', 
                        textContent: `差分バックアップ: ${backups.incremental.length}件`
                    }
                ]
            });
            
            container.appendChild(debugInfo);
            
            // まずはMermaidなしで動作確認
            if (backups.generations.length > 0 || backups.incremental.length > 0) {
                // Mermaidグラフを試す
                await this.generateVisualization(container);
            }
            
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

            const timeline = this.createElement({
                tagName: 'div',
                className: 'backup-timeline'
            });

            const allBackups = [...backups.generations, ...backups.incremental]
                .sort((a, b) => b.timestamp - a.timestamp);

            allBackups.forEach((backup, index) => {
                const timelineItem = this.createTimelineItem(backup, index);
                timeline.appendChild(timelineItem);
            });

            container.appendChild(timeline);

        } catch (error) {
            this.hideLoading(container);
            this.showError(container, error instanceof Error ? error.message : String(error));
        }
    }

    private async renderIntegrityTab(container: HTMLElement): Promise<void> {
        await this.performIntegrityCheck(container);
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

    private generateMermaidGraph(
        generations: BackupFileInfo[], 
        incremental: BackupFileInfo[]
    ): string {
        const lines: string[] = [];
        lines.push('gitGraph:');
        
        // 基本的なメインブランチから開始
        lines.push('    commit id: "Start"');

        // 世代バックアップを時系列順にメインラインに配置
        if (generations.length > 0) {
            const sortedGenerations = [...generations].sort((a, b) => a.timestamp - b.timestamp);
            
            for (const backup of sortedGenerations) {
                const date = new Date(backup.timestamp);
                const dateStr = date.toLocaleDateString('ja-JP', { 
                    month: '2-digit', 
                    day: '2-digit' 
                });
                const timeStr = date.toLocaleTimeString('ja-JP', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                const period = backup.generation?.period || 'Gen';
                const commitId = `${period}${dateStr}${timeStr}`.replace(/[^a-zA-Z0-9]/g, '');
                lines.push(`    commit id: "${period} ${dateStr} ${timeStr}"`);
            }
        }
        
        // 差分バックアップ用のブランチを作成
        if (incremental.length > 0) {
            // ベースバックアップごとにグループ化
            const incrementalByBase = new Map<string, BackupFileInfo[]>();
            
            for (const backup of incremental) {
                const baseId = backup.incremental?.baseBackupId || 'unknown';
                if (!incrementalByBase.has(baseId)) {
                    incrementalByBase.set(baseId, []);
                }
                incrementalByBase.get(baseId)!.push(backup);
            }
            
            // 各ベースバックアップから差分ブランチを作成
            let branchIndex = 0;
            for (const [baseId, incrementalList] of incrementalByBase) {
                const branchName = `incremental${branchIndex++}`;
                lines.push(`    branch ${branchName}`);
                
                // 時系列順にソート
                const sortedIncremental = incrementalList.sort((a, b) => a.timestamp - b.timestamp);
                
                for (const backup of sortedIncremental) {
                    const date = new Date(backup.timestamp);
                    const timeStr = date.toLocaleTimeString('ja-JP', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                    
                    lines.push(`    commit id: "差分 ${timeStr}"`);
                }
                
                // メインラインに戻る（最後のブランチでない場合）
                if (branchIndex < incrementalByBase.size) {
                    lines.push(`    checkout main`);
                }
            }
        }

        return lines.join('\n');
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
            
            // GitGraphコードの詳細表示も追加
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
            asciiGraph += '📦 メインライン (世代バックアップ)\n';
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
            asciiGraph += '\n\n📄 差分ブランチ\n';
            
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
                asciiGraph += `\n├─┐ ブランチ${branchIndex + 1} (ベース: ${baseId.substring(0, 8)}...)\n`;
                
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
            asciiGraph = '❌ バックアップデータがありません';
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

            let graphText = '📊 バックアップ関係図\n\n';
            
            if (backups.generations.length > 0) {
                graphText += '🏗️ 世代バックアップ:\n';
                backups.generations.forEach((backup, index) => {
                    const date = new Date(backup.timestamp).toLocaleString('ja-JP');
                    const connector = index < backups.generations.length - 1 ? '  ↓' : '';
                    graphText += `  📦 ${backup.generation?.period || 'Unknown'} (${date})\n${connector}\n`;
                });
                graphText += '\n';
            }

            if (backups.incremental.length > 0) {
                graphText += '📄 差分バックアップ:\n';
                backups.incremental.forEach(backup => {
                    const date = new Date(backup.timestamp).toLocaleString('ja-JP');
                    const baseId = backup.incremental?.baseBackupId || 'Unknown';
                    graphText += `  📄 ${date} (ベース: ${baseId.substring(0, 8)}...)\n`;
                });
            }

            if (backups.generations.length === 0 && backups.incremental.length === 0) {
                graphText += '❌ バックアップが見つかりません';
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
            let graphText = '📊 バックアップ関係図\n\n';
            
            if (backups.generations.length > 0) {
                graphText += '🏗️ 世代バックアップ:\n';
                backups.generations.forEach((backup, index) => {
                    const date = new Date(backup.timestamp).toLocaleString('ja-JP');
                    const connector = index < backups.generations.length - 1 ? '  ↓' : '';
                    graphText += `  📦 ${backup.generation?.period || 'Unknown'} (${date})\n${connector}\n`;
                });
                graphText += '\n';
            }

            if (backups.incremental.length > 0) {
                graphText += '📄 差分バックアップ:\n';
                backups.incremental.forEach(backup => {
                    const date = new Date(backup.timestamp).toLocaleString('ja-JP');
                    const baseId = backup.incremental?.baseBackupId || 'Unknown';
                    graphText += `  📄 ${date} (ベース: ${baseId.substring(0, 8)}...)\n`;
                });
            }

            if (backups.generations.length === 0 && backups.incremental.length === 0) {
                graphText += '❌ バックアップが見つかりません';
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
            this.showLoading(container, this.t('backupIntegrityCheck') + '...');

            // 全バックアップの整合性チェック実行
            this.integrityResults = await this.backupManager.checkAllBackupsIntegrity();
            
            console.log('[BackupChainVisualization] 整合性チェック結果:', this.integrityResults);
            
            // 結果を表示
            this.displayIntegrityResults(container);
            
            // 可視化を再生成（健康状態の色分けを反映）
            await this.generateVisualization(container);

        } catch (error) {
            console.error('[BackupChainVisualization] 整合性チェックエラー:', error);
            
            this.hideLoading(container);
            
            const errorEl = container.createDiv({ cls: 'backup-chain-error' });
            errorEl.createEl('h3', { text: 'エラー' });
            errorEl.createEl('p', { text: error instanceof Error ? error.message : String(error) });
        }
    }

    private displayIntegrityResults(container: HTMLElement) {
        if (!this.integrityResults) return;

        // 既存の結果表示を削除
        const existingResults = container.querySelector('.backup-integrity-results');
        if (existingResults) existingResults.remove();

        const resultsContainer = container.createDiv({ cls: 'backup-integrity-results' });
        resultsContainer.createEl('h3', { text: this.t('backupIntegrityCheck') });

        let healthyCount = 0;
        let damagedCount = 0;

        this.integrityResults.forEach((result, backupId) => {
            if (result.isHealthy) {
                healthyCount++;
            } else {
                damagedCount++;
                
                // 破損したバックアップの詳細表示
                const issueEl = resultsContainer.createDiv({ cls: 'integrity-issue' });
                issueEl.createEl('h4', { 
                    text: `${this.t('damagedBackup')}: ${backupId.substring(0, 8)}...`,
                    cls: 'issue-title'
                });
                
                if (result.issues && result.issues.length > 0) {
                    const issueList = issueEl.createEl('ul');
                    result.issues.forEach(issue => {
                        issueList.createEl('li', { text: issue });
                    });
                }
                
                if (result.error) {
                    issueEl.createEl('p', { 
                        text: `エラー: ${result.error}`,
                        cls: 'issue-error'
                    });
                }
            }
        });

        // サマリー表示
        const summaryEl = resultsContainer.createDiv({ cls: 'integrity-summary' });
        summaryEl.createEl('p', { 
            text: `${this.t('healthyBackup')}: ${healthyCount}件, ${this.t('damagedBackup')}: ${damagedCount}件`
        });
    }

    private createStatsCard(title: string, value: string, icon: string, bgColor: string): HTMLElement {
        const card = this.createElement({
            tagName: 'div',
            className: 'backup-stats-card'
        });

        card.style.cssText = `
            background: ${bgColor};
            border: 1px solid var(--background-modifier-border);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            transition: transform 0.2s ease;
        `;

        const iconEl = this.createElement({
            tagName: 'div',
            textContent: icon,
            className: 'card-icon'
        });
        iconEl.style.cssText = `
            font-size: 2em;
            margin-bottom: 8px;
        `;

        const titleEl = this.createElement({
            tagName: 'h4',
            textContent: title,
            className: 'card-title'
        });
        titleEl.style.cssText = `
            margin: 0 0 4px 0;
            font-size: 14px;
            color: var(--text-muted);
        `;

        const valueEl = this.createElement({
            tagName: 'div',
            textContent: value,
            className: 'card-value'
        });
        valueEl.style.cssText = `
            font-size: 24px;
            font-weight: bold;
            color: var(--text-normal);
        `;

        card.appendChild(iconEl);
        card.appendChild(titleEl);
        card.appendChild(valueEl);

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
        const item = this.createElement({
            tagName: 'div',
            className: 'backup-list-item'
        });

        const typeIcon = backup.generation ? '📦' : '📄';
        const typeName = backup.generation ? '世代' : '差分';
        const date = new Date(backup.timestamp).toLocaleString('ja-JP');
        const size = this.formatFileSize(backup.size || 0);

        item.style.cssText = `
            display: flex;
            align-items: center;
            padding: 12px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 8px;
            margin-bottom: 8px;
            background: var(--background-secondary);
        `;

        item.innerHTML = `
            <span style="font-size: 1.2em; margin-right: 12px;">${typeIcon}</span>
            <div style="flex: 1;">
                <div style="font-weight: 500;">${typeName}バックアップ</div>
                <div style="font-size: 12px; color: var(--text-muted);">${date} • ${size}</div>
            </div>
            <div style="font-size: 12px; color: var(--text-muted);">
                ${backup.id.substring(0, 8)}...
            </div>
        `;

        return item;
    }

    private createTimelineItem(backup: BackupFileInfo, index: number): HTMLElement {
        const item = this.createElement({
            tagName: 'div',
            className: 'timeline-item'
        });

        const typeIcon = backup.generation ? '📦' : '📄';
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
            item.style.borderLeftColor = 'var(--interactive-accent)';
        }

        const marker = this.createElement({
            tagName: 'div',
            textContent: typeIcon,
            className: 'timeline-marker'
        });
        marker.style.cssText = `
            position: absolute;
            left: -12px;
            top: 16px;
            width: 24px;
            height: 24px;
            background: var(--background-primary);
            border: 2px solid ${index === 0 ? 'var(--interactive-accent)' : 'var(--background-modifier-border)'};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
        `;

        const content = this.createElement({
            tagName: 'div',
            className: 'timeline-content'
        });
        content.innerHTML = `
            <div style="font-weight: 500; margin-bottom: 4px;">${typeName}バックアップ作成</div>
            <div style="font-size: 14px; color: var(--text-muted); margin-bottom: 4px;">${dateStr} ${timeStr}</div>
            <div style="font-size: 12px; color: var(--text-muted);">
                ID: ${backup.id.substring(0, 12)}... | サイズ: ${this.formatFileSize(backup.size || 0)}
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
} 