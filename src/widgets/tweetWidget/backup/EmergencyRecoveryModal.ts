import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import { EmergencyRecoveryManager } from './EmergencyRecoveryManager';
import type { RecoverySource, RecoveryResult } from './EmergencyRecoveryManager';
import { t } from '../../../i18n';
import type { Language } from '../../../i18n/types';
import type { BackupFileInfo } from './types';
import { BackupManager } from './BackupManager';
import { BaseModal } from './BaseModal';
import { TweetWidget } from '../tweetWidget';

/**
 * 緊急復旧モーダル
 * データ破損時の緊急復旧機能を提供
 */
export class EmergencyRecoveryModal extends BaseModal {
    private backupManager: BackupManager;
    private onRestore: (data: TweetWidgetSettings) => void;
    private language: Language;
    private recoveryOptions: RecoveryOption[] = [];
    private selectedOption: RecoveryOption | null = null;

    constructor(
        widget: TweetWidget,
        backupManager: BackupManager,
        language: Language,
        onRestore: (data: TweetWidgetSettings) => void
    ) {
        super(widget);
        this.backupManager = backupManager;
        this.language = language;
        this.onRestore = onRestore;
        
        // 大きなモーダルサイズを設定
        this.setSize('900px', '600px');
    }

    protected async onOpen() {
        this.contentEl.className = 'emergency-recovery-modal-content';
        this.contentEl.style.cssText = `
            padding: 24px;
            min-height: 500px;
            display: flex;
            flex-direction: column;
        `;

        // ヘッダー
        this.renderHeader();
        
        // ローディング表示
        this.showLoading();

        try {
            // 復旧オプションを分析
            await this.analyzeRecoveryOptions();
            this.renderRecoveryOptions();
            
        } catch (error) {
            console.error('緊急復旧分析エラー:', error);
            this.showError(`復旧オプションの分析に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    protected onClose() {
        // クリーンアップ処理
    }

    private renderHeader(): void {
        const header = this.createElement({
            tagName: 'div',
            className: 'emergency-recovery-header'
        });

        header.style.cssText = `
            margin-bottom: 24px;
            border-bottom: 1px solid var(--background-modifier-border);
            padding-bottom: 16px;
        `;

        const title = this.createElement({
            tagName: 'h2',
            textContent: '🚨 緊急復旧',
            className: 'emergency-recovery-title'
        });

        title.style.cssText = `
            margin: 0 0 8px 0;
            color: var(--text-error);
        `;

        const description = this.createElement({
            tagName: 'p',
            textContent: 'データに問題が検出されました。以下から復旧方法を選択してください。',
            className: 'emergency-description'
        });

        description.style.cssText = `
            margin: 0;
            color: var(--text-muted);
            line-height: 1.4;
        `;

        header.appendChild(title);
        header.appendChild(description);
        this.contentEl.appendChild(header);
    }

    private showLoading(): void {
        const loadingEl = this.createElement({
            tagName: 'div',
            className: 'emergency-recovery-loading',
            textContent: '復旧オプションを分析中...'
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
        const loadingEl = this.contentEl.querySelector('.emergency-recovery-loading');
        if (loadingEl) {
            loadingEl.remove();
        }

        const errorEl = this.createElement({
            tagName: 'div',
            className: 'emergency-recovery-error',
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
        this.renderButtons();
    }

    private async analyzeRecoveryOptions(): Promise<void> {
        console.log('復旧オプションを分析中...');

        try {
            // 利用可能なバックアップを取得
            const backups = await this.backupManager.getAvailableBackups();
            const allBackups = [...backups.generations, ...backups.incremental];
            
            // バックアップの整合性をチェック
            const integrityResults = await this.backupManager.checkAllBackupsIntegrity((message) => {
                console.log(`[EmergencyRecoveryModal] 整合性チェック: ${message}`);
            });

            console.log('[EmergencyRecoveryModal] 整合性チェック結果:', integrityResults);

            this.recoveryOptions = [];

            // 最新の健全なバックアップを探す
            const healthyBackups = allBackups.filter(backup => {
                const integrity = integrityResults.find(result => result.backupId === backup.id);
                return integrity?.success !== false;
            });

            if (healthyBackups.length > 0) {
                // 最新の健全なバックアップ
                const latestHealthy = healthyBackups
                    .sort((a, b) => b.timestamp - a.timestamp)[0];

                this.recoveryOptions.push({
                    id: 'latest-backup',
                    title: '最新の健全なバックアップから復元',
                    description: `${new Date(latestHealthy.timestamp).toLocaleString('ja-JP')} のバックアップから復元します`,
                    severity: 'safe',
                    backup: latestHealthy,
                    dataLoss: this.calculateDataLoss(latestHealthy.timestamp)
                });
            }

            // 複数のバックアップから部分復元
            if (allBackups.length > 1) {
                this.recoveryOptions.push({
                    id: 'partial-restore',
                    title: '複数のバックアップから部分復元',
                    description: '複数のバックアップを組み合わせて可能な限りデータを復元します',
                    severity: 'moderate',
                    backup: null,
                    dataLoss: '不明'
                });
            }

            // 手動データ修復
            this.recoveryOptions.push({
                id: 'manual-repair',
                title: '手動データ修復',
                description: '現在のデータを手動で修復します（上級者向け）',
                severity: 'dangerous',
                backup: null,
                dataLoss: '最小限'
            });

            // 完全リセット
            this.recoveryOptions.push({
                id: 'complete-reset',
                title: '完全リセット',
                description: '全てのデータを削除して初期状態に戻します',
                severity: 'dangerous',
                backup: null,
                dataLoss: '全て'
            });

        } catch (error) {
            console.error('復旧オプション分析エラー:', error);
            
            // エラー時は最低限のオプションを提供
            this.recoveryOptions = [
                {
                    id: 'complete-reset',
                    title: '完全リセット',
                    description: '全てのデータを削除して初期状態に戻します',
                    severity: 'dangerous',
                    backup: null,
                    dataLoss: '全て'
                }
            ];
        }
    }

    private calculateDataLoss(backupTimestamp: number): string {
        const now = Date.now();
        const diffHours = Math.floor((now - backupTimestamp) / (1000 * 60 * 60));
        
        if (diffHours < 1) {
            return '1時間未満';
        } else if (diffHours < 24) {
            return `約${diffHours}時間`;
        } else {
            const diffDays = Math.floor(diffHours / 24);
            return `約${diffDays}日`;
        }
    }

    private renderRecoveryOptions(): void {
        // ローディング要素を削除
        const loadingEl = this.contentEl.querySelector('.emergency-recovery-loading');
        if (loadingEl) {
            loadingEl.remove();
        }

        if (this.recoveryOptions.length === 0) {
            this.showError('利用可能な復旧オプションがありません');
            return;
        }

        const optionsContainer = this.createElement({
            tagName: 'div',
            className: 'recovery-options'
        });

        optionsContainer.style.cssText = `
            flex: 1;
            margin: 24px 0;
            overflow-y: auto;
        `;

        const optionsTitle = this.createElement({
            tagName: 'h3',
            textContent: '復旧オプション',
            className: 'options-title'
        });

        optionsTitle.style.cssText = `
            margin: 0 0 16px 0;
            color: var(--text-normal);
        `;

        optionsContainer.appendChild(optionsTitle);

        // 復旧オプションを表示
        this.recoveryOptions.forEach((option, index) => {
            const optionEl = this.createRecoveryOptionElement(option, index === 0);
            optionsContainer.appendChild(optionEl);
        });

        this.contentEl.appendChild(optionsContainer);
        this.renderButtons();
    }

    private createRecoveryOptionElement(option: RecoveryOption, isDefault: boolean): HTMLElement {
        const optionEl = this.createElement({
            tagName: 'div',
            className: `recovery-option ${isDefault ? 'selected' : ''}`
        });

        optionEl.style.cssText = `
            margin-bottom: 16px;
            padding: 16px;
            border: 2px solid ${isDefault ? 'var(--background-modifier-border)' : 'var(--background-modifier-border)'};
            border-radius: 8px;
            background: var(--background-primary);
            cursor: pointer;
            transition: all 0.2s ease;
        `;

        // クリックイベント
        optionEl.onclick = () => {
            // 他の選択を解除
            this.contentEl.querySelectorAll('.recovery-option').forEach(el => {
                el.classList.remove('selected');
                (el as HTMLElement).style.borderColor = 'var(--background-modifier-border)';
            });

            // 現在の選択を設定
            optionEl.classList.add('selected');
            optionEl.style.borderColor = 'var(--background-modifier-border)';
            this.selectedOption = option;
        };

        // 重要度バッジ
        const severityBadge = this.createElement({
            tagName: 'span',
            textContent: this.getSeverityLabel(option.severity),
            className: 'severity-badge'
        });

        severityBadge.style.cssText = `
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            color: white;
            background: ${this.getSeverityColor(option.severity)};
            margin-bottom: 8px;
        `;

        // タイトル
        const titleEl = this.createElement({
            tagName: 'h4',
            textContent: option.title,
            className: 'option-title'
        });

        titleEl.style.cssText = `
            margin: 0 0 8px 0;
            color: var(--text-normal);
            font-size: 16px;
        `;

        // 説明
        const descEl = this.createElement({
            tagName: 'p',
            textContent: option.description,
            className: 'option-description'
        });

        descEl.style.cssText = `
            margin: 0 0 8px 0;
            color: var(--text-muted);
            line-height: 1.4;
        `;

        // データ損失情報
        const dataLossEl = this.createElement({
            tagName: 'div',
            className: 'data-loss-info'
        });

        dataLossEl.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: var(--text-muted);
        `;

        const dataLossLabel = this.createElement({
            tagName: 'span',
            textContent: `予想データ損失: ${option.dataLoss}`,
            className: 'data-loss-label'
        });

        if (option.backup) {
            const backupInfo = this.createElement({
                tagName: 'span',
                textContent: `バックアップサイズ: ${this.formatFileSize(option.backup.size)}`,
                className: 'backup-info'
            });
            dataLossEl.appendChild(backupInfo);
        }

        dataLossEl.appendChild(dataLossLabel);

        optionEl.appendChild(severityBadge);
        optionEl.appendChild(titleEl);
        optionEl.appendChild(descEl);
        optionEl.appendChild(dataLossEl);

        // デフォルト選択
        if (isDefault) {
            this.selectedOption = option;
        }

        return optionEl;
    }

    private getSeverityLabel(severity: string): string {
        switch (severity) {
            case 'safe': return '安全';
            case 'moderate': return '注意';
            case 'dangerous': return '危険';
            default: return '不明';
        }
    }

    private getSeverityColor(severity: string): string {
        switch (severity) {
            case 'safe': return 'var(--text-success)';
            case 'moderate': return 'var(--text-warning)';
            case 'dangerous': return 'var(--text-error)';
            default: return 'var(--text-muted)';
        }
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    private renderButtons(): void {
        const footer = this.createElement({
            tagName: 'div',
            className: 'emergency-recovery-footer'
        });

        footer.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: auto;
            padding-top: 16px;
            border-top: 1px solid var(--background-modifier-border);
        `;

        const buttonStyle = `
            padding: 8px 16px;
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            background: var(--background-primary);
            color: var(--text-normal);
            cursor: pointer;
        `;

        // 左側のボタン
        const leftButtons = this.createElement({
            tagName: 'div',
            className: 'footer-left-buttons'
        });

        if (this.selectedOption) {
            const executeBtn = this.createElement({
                tagName: 'button',
                textContent: '復旧を実行',
                className: 'execute-recovery-btn'
            }) as HTMLButtonElement;

            const btnColor = this.selectedOption.severity === 'dangerous' ? 
                'background: var(--text-error); color: white;' :
                'background: var(--background-secondary); color: var(--text-normal); border: 1px solid var(--background-modifier-border);';

            executeBtn.style.cssText = buttonStyle + btnColor;
            executeBtn.onclick = () => this.executeRecovery();

            leftButtons.appendChild(executeBtn);
        }

        // 右側のボタン
        const rightButtons = this.createElement({
            tagName: 'div',
            className: 'footer-right-buttons'
        });

        const cancelBtn = this.createElement({
            tagName: 'button',
            textContent: 'キャンセル',
            className: 'cancel-btn'
        }) as HTMLButtonElement;

        cancelBtn.style.cssText = buttonStyle;
        cancelBtn.onclick = () => this.close();

        rightButtons.appendChild(cancelBtn);

        footer.appendChild(leftButtons);
        footer.appendChild(rightButtons);
        this.contentEl.appendChild(footer);
    }

    private async executeRecovery(): Promise<void> {
        if (!this.selectedOption) return;

        const confirmMessage = `緊急復旧「${this.selectedOption.title}」を実行しますか？\n\n` +
            `予想データ損失: ${this.selectedOption.dataLoss}\n\n` +
            `この操作は取り消すことができません。`;

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            switch (this.selectedOption.id) {
                case 'latest-backup':
                    await this.restoreFromLatestBackup();
                    break;
                case 'partial-restore':
                    await this.executePartialRestore();
                    break;
                case 'manual-repair':
                    await this.executeManualRepair();
                    break;
                case 'complete-reset':
                    await this.executeCompleteReset();
                    break;
                default:
                    throw new Error('不明な復旧オプション');
            }

            alert('緊急復旧が完了しました');
            this.close();

        } catch (error) {
            console.error('緊急復旧エラー:', error);
            alert(`緊急復旧に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async restoreFromLatestBackup(): Promise<void> {
        if (!this.selectedOption?.backup) {
            throw new Error('バックアップが選択されていません');
        }

        const result = await this.backupManager.restoreFromBackup(this.selectedOption.backup.id);

        if (!result.success || !result.restoredData) {
            throw new Error(result.error || '復元に失敗しました');
        }

        this.onRestore(result.restoredData);
    }

    private async executePartialRestore(): Promise<void> {
        // 複数バックアップからの部分復元（簡易実装）
        throw new Error('部分復元機能は現在開発中です');
    }

    private async executeManualRepair(): Promise<void> {
        // 手動修復（基本的なデータ構造の修復）
        const defaultData: TweetWidgetSettings = {
            posts: [],
            scheduledPosts: [],
            pinnedPosts: [],
            categories: [],
            tags: [],
            // 他の必要なプロパティを追加
        } as TweetWidgetSettings;

        this.onRestore(defaultData);
    }

    private async executeCompleteReset(): Promise<void> {
        // 完全リセット
        const emptyData: TweetWidgetSettings = {
            posts: [],
            scheduledPosts: [],
            pinnedPosts: [],
            categories: [],
            tags: [],
            // 他の必要なプロパティを追加
        } as TweetWidgetSettings;

        this.onRestore(emptyData);
    }
}

interface RecoveryOption {
    id: string;
    title: string;
    description: string;
    severity: 'safe' | 'moderate' | 'dangerous';
    backup: BackupFileInfo | null;
    dataLoss: string;
} 