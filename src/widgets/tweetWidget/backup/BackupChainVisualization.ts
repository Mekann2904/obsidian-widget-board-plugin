import { App, Modal } from 'obsidian';
import type { BackupFileInfo } from './types';
import { BackupManager } from './BackupManager';
import { renderMermaidInWorker } from '../../../utils';
import { t, StringKey } from '../../../i18n';
import type { Language } from '../../../i18n/types';

/**
 * バックアップチェーン可視化モーダル
 * Mermaid.js を使ってバックアップの関係性をグラフ表示
 */
export class BackupChainVisualization extends Modal {
    private backupManager: BackupManager;
    private language: Language;
    private integrityResults: Map<string, {
        isHealthy: boolean;
        issues?: string[];
        error?: string;
    }> | null = null;

    constructor(
        app: App,
        backupManager: BackupManager,
        language: Language
    ) {
        super(app);
        this.backupManager = backupManager;
        this.language = language;
    }

    private t(key: StringKey, vars?: Record<string, string | number>): string {
        return t(this.language, key, vars);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('backup-chain-visualization-modal');

        // モーダルタイトル
        contentEl.createEl('h2', { 
            text: this.t('backupChainTitle'),
            cls: 'backup-chain-title'
        });

        // 説明文
        contentEl.createEl('p', {
            text: this.t('backupGraphDescription'),
            cls: 'backup-chain-description'
        });

        // コントロールバー
        const controlBar = contentEl.createDiv({ cls: 'backup-chain-controls' });
        
        const refreshBtn = controlBar.createEl('button', {
            text: this.t('refreshVisualization'),
            cls: 'backup-chain-btn refresh-btn'
        });
        
        const integrityBtn = controlBar.createEl('button', {
            text: this.t('performIntegrityCheck'),
            cls: 'backup-chain-btn integrity-btn'
        });

        // 可視化コンテナ
        const visualContainer = contentEl.createDiv({ cls: 'backup-chain-visual-container' });

        // イベントハンドラ設定
        refreshBtn.onclick = () => this.generateVisualization(visualContainer);
        integrityBtn.onclick = () => this.performIntegrityCheck(visualContainer);

        // 初期可視化生成
        this.generateVisualization(visualContainer);
    }

    private async generateVisualization(container: HTMLElement) {
        try {
            // ローディング表示
            this.showLoading(container, this.t('visualizationLoading'));

            // 既存の可視化内容をクリア
            const existingGraph = container.querySelector('.backup-chain-graph');
            if (existingGraph) existingGraph.remove();

            // バックアップ一覧を取得
            const backups = await this.backupManager.getAvailableBackups();
            
            if (backups.generations.length === 0 && backups.incremental.length === 0) {
                this.hideLoading(container);
                container.createDiv({
                    text: this.t('noBackupsToVisualize'),
                    cls: 'backup-chain-empty'
                });
                return;
            }

            // Mermaidグラフ生成
            const mermaidCode = this.generateMermaidGraph(backups.generations, backups.incremental);
            
            // グラフコンテナ作成
            const graphContainer = container.createDiv({ cls: 'backup-chain-graph' });
            
            // Mermaidレンダリング
            await this.renderMermaidGraph(graphContainer, mermaidCode);
            
            this.hideLoading(container);

        } catch (error) {
            console.error('[BackupChainVisualization] 可視化生成エラー:', error);
            
            this.hideLoading(container);
            
            const errorEl = container.createDiv({ cls: 'backup-chain-error' });
            errorEl.createEl('h3', { text: 'エラー' });
            errorEl.createEl('p', { text: error instanceof Error ? error.message : String(error) });
        }
    }

    private showLoading(container: HTMLElement, message: string) {
        const loadingEl = container.querySelector('.backup-chain-loading') as HTMLElement || 
                          container.createDiv({ cls: 'backup-chain-loading' });
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
        lines.push('graph TD');

        // ノード定義セクション
        const nodeDefinitions: string[] = [];
        const edgeDefinitions: string[] = [];

        // 世代バックアップをノード化（四角形）
        generations.forEach(backup => {
            const nodeId = this.sanitizeNodeId(backup.id);
            const label = this.formatBackupLabel(backup);
            const style = this.getBackupNodeStyle(backup.id, 'generation');
            
            nodeDefinitions.push(`    ${nodeId}[${label}]`);
            if (style) {
                nodeDefinitions.push(`    ${style}`);
            }
        });

        // 差分バックアップをノード化（円形）
        incremental.forEach(backup => {
            const nodeId = this.sanitizeNodeId(backup.id);
            const label = this.formatBackupLabel(backup);
            const style = this.getBackupNodeStyle(backup.id, 'incremental');
            
            nodeDefinitions.push(`    ${nodeId}((${label}))`);
            if (style) {
                nodeDefinitions.push(`    ${style}`);
            }
        });

        // エッジ定義（世代バックアップの継承関係）
        generations.forEach(backup => {
            if (backup.generation?.previousBackupId) {
                const fromNodeId = this.sanitizeNodeId(backup.generation.previousBackupId);
                const toNodeId = this.sanitizeNodeId(backup.id);
                edgeDefinitions.push(`    ${fromNodeId} --> ${toNodeId}`);
            }
        });

        // エッジ定義（差分バックアップのベース関係）
        incremental.forEach(backup => {
            if (backup.incremental?.baseBackupId) {
                const baseNodeId = this.sanitizeNodeId(backup.incremental.baseBackupId);
                const diffNodeId = this.sanitizeNodeId(backup.id);
                edgeDefinitions.push(`    ${baseNodeId} -.-> ${diffNodeId}`);
            }
        });

        // Mermaidコードを組み立て
        lines.push(...nodeDefinitions);
        lines.push(...edgeDefinitions);

        return lines.join('\n');
    }

    private sanitizeNodeId(id: string): string {
        // Mermaidで使用可能な文字のみに変換
        return id.replace(/[^a-zA-Z0-9]/g, '_');
    }

    private formatBackupLabel(backup: BackupFileInfo): string {
        const date = new Date(backup.timestamp);
        const dateStr = date.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });
        const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        
        if (backup.generation) {
            return `"${backup.generation.period}<br/>${dateStr} ${timeStr}"`;
        } else if (backup.incremental) {
            return `"${this.t('incrementalBackup')}<br/>${dateStr} ${timeStr}"`;
        } else {
            return `"${dateStr} ${timeStr}"`;
        }
    }

    private getBackupNodeStyle(backupId: string, type: 'generation' | 'incremental'): string | null {
        if (!this.integrityResults) return null;
        
        const result = this.integrityResults.get(backupId);
        if (!result) return null;
        
        const nodeId = this.sanitizeNodeId(backupId);
        
        if (!result.isHealthy) {
            // 破損したバックアップは赤色
            return `    classDef damaged fill:#ffdddd,stroke:#ff0000,stroke-width:2px
    class ${nodeId} damaged`;
        } else {
            // 正常なバックアップは青色/緑色
            const color = type === 'generation' ? '#ddeeff' : '#ddffdd';
            const strokeColor = type === 'generation' ? '#0066cc' : '#00aa00';
            return `    classDef healthy${type} fill:${color},stroke:${strokeColor},stroke-width:2px
    class ${nodeId} healthy${type}`;
        }
    }

    private async renderMermaidGraph(container: HTMLElement, mermaidCode: string) {
        try {
            console.log('[BackupChainVisualization] Mermaidコード:', mermaidCode);
            
            // Mermaidレンダリング
            const result = await renderMermaidInWorker(mermaidCode, 'backup-chain');
            
            if (result) {
                if (typeof result === 'string') {
                    // HTML文字列の場合
                    container.innerHTML = result;
                } else {
                    // Element の場合
                    container.appendChild(result);
                }
                
                // SVGのスタイル調整
                const svgEl = container.querySelector('svg') as SVGElement;
                if (svgEl) {
                    svgEl.style.width = '100%';
                    svgEl.style.height = 'auto';
                    svgEl.style.maxHeight = '60vh';
                }
            } else {
                throw new Error('Mermaidレンダリングに失敗しました');
            }

        } catch (error) {
            console.error('[BackupChainVisualization] Mermaidレンダリングエラー:', error);
            
            // フォールバック: テキスト表示
            const fallbackEl = container.createDiv({ cls: 'backup-chain-fallback' });
            fallbackEl.createEl('h4', { text: 'Mermaidグラフ（テキスト形式）' });
            const preEl = fallbackEl.createEl('pre');
            preEl.textContent = mermaidCode;
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

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 