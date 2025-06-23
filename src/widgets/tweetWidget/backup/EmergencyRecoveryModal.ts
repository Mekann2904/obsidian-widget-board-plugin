import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import { EmergencyRecoveryManager } from './EmergencyRecoveryManager';
import type { RecoverySource, RecoveryResult } from './EmergencyRecoveryManager';

/**
 * 緊急復元モーダル
 * tweets.jsonが削除された場合の復元オプションを表示
 */
export class EmergencyRecoveryModal extends Modal {
    private recoveryManager: EmergencyRecoveryManager;
    private onRecover: (data: TweetWidgetSettings) => void;
    private sources: RecoverySource[] = [];
    private loading = false;

    constructor(
        app: App, 
        recoveryManager: EmergencyRecoveryManager, 
        onRecover: (data: TweetWidgetSettings) => void
    ) {
        super(app);
        this.recoveryManager = recoveryManager;
        this.onRecover = onRecover;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('emergency-recovery-modal');

        // ヘッダー
        const headerEl = contentEl.createDiv({ cls: 'recovery-modal-header' });
        const titleEl = headerEl.createEl('h2', { text: '🚨 緊急復元' });
        titleEl.addClass('recovery-title');

        const descEl = headerEl.createEl('p', { 
            text: 'データファイル (tweets.json) が見つかりません。利用可能なバックアップから復元できます。',
            cls: 'recovery-description'
        });

        // ローディング表示
        const loadingEl = contentEl.createEl('div', { 
            text: '復元可能なソースを検索中...', 
            cls: 'recovery-loading' 
        });

        try {
            // 復元ソースを検索
            this.sources = await this.recoveryManager.detectAndFindRecoverySources();
            loadingEl.remove();

            if (this.sources.length === 0) {
                this.renderNoSourcesFound(contentEl);
            } else {
                this.renderRecoverySources(contentEl);
            }

        } catch (error) {
            loadingEl.setText('復元ソースの検索に失敗しました');
            console.error('復元ソース検索エラー:', error);
            
            const errorEl = contentEl.createEl('p', { 
                text: `エラー: ${error instanceof Error ? error.message : String(error)}`,
                cls: 'recovery-error'
            });
        }
    }

    /**
     * 復元ソースが見つからない場合の表示
     */
    private renderNoSourcesFound(container: HTMLElement): void {
        const noSourcesEl = container.createDiv({ cls: 'no-sources-container' });
        
        const iconEl = noSourcesEl.createEl('div', { cls: 'no-sources-icon' });
        iconEl.innerHTML = '📁';
        
        noSourcesEl.createEl('h3', { text: '復元可能なソースが見つかりません' });
        
        const msgEl = noSourcesEl.createEl('p', { cls: 'no-sources-message' });
        msgEl.innerHTML = `
            以下の場所を確認してください：<br>
            • バックアップディレクトリ: <code>backups/</code><br>
            • バージョン管理: <code>.wb-git/</code><br>
            • 破損バックアップ: <code>*.bak_*</code>
        `;

        // 新規作成ボタン
        const buttonContainer = noSourcesEl.createDiv({ cls: 'button-container' });
        
        new ButtonComponent(buttonContainer)
            .setButtonText('新規データファイルを作成')
            .setClass('mod-cta')
            .onClick(() => {
                this.createNewDataFile();
            });

        new ButtonComponent(buttonContainer)
            .setButtonText('キャンセル')
            .onClick(() => this.close());
    }

    /**
     * 復元ソース一覧を表示
     */
    private renderRecoverySources(container: HTMLElement): void {
        const sourcesContainer = container.createDiv({ cls: 'recovery-sources-container' });
        
        // 統計情報
        const statsEl = sourcesContainer.createEl('div', { cls: 'recovery-stats' });
        statsEl.createEl('p', { 
            text: `${this.sources.length}個の復元ソースが見つかりました`,
            cls: 'stats-text'
        });

        // 自動復元ボタン
        const autoRecoverContainer = sourcesContainer.createDiv({ cls: 'auto-recover-container' });
        autoRecoverContainer.createEl('h3', { text: '推奨: 自動復元' });
        autoRecoverContainer.createEl('p', { 
            text: '最も信頼度の高いソースから自動的に復元します',
            cls: 'auto-recover-description'
        });

        const autoButtonContainer = autoRecoverContainer.createDiv({ cls: 'button-container' });
        
        new ButtonComponent(autoButtonContainer)
            .setButtonText('🔄 自動復元を実行')
            .setClass('mod-cta')
            .onClick(() => {
                this.performAutoRecovery();
            });

        // 手動選択セクション
        const manualSection = sourcesContainer.createDiv({ cls: 'manual-recovery-section' });
        manualSection.createEl('h3', { text: '手動選択' });
        
        // ソース一覧
        const sourcesList = manualSection.createDiv({ cls: 'sources-list' });
        
        this.sources.forEach((source, index) => {
            this.renderRecoverySource(sourcesList, source, index === 0);
        });

        // キャンセルボタン
        const cancelContainer = sourcesContainer.createDiv({ cls: 'cancel-container' });
        new ButtonComponent(cancelContainer)
            .setButtonText('キャンセル')
            .onClick(() => this.close());
    }

    /**
     * 個別の復元ソースを表示
     */
    private renderRecoverySource(container: HTMLElement, source: RecoverySource, isRecommended: boolean): void {
        const sourceEl = container.createDiv({ cls: 'recovery-source-item' });
        
        if (isRecommended) {
            sourceEl.addClass('recommended');
            sourceEl.createEl('span', { text: '推奨', cls: 'recommended-badge' });
        }

        // 信頼度アイコン
        const confidenceIcon = this.getConfidenceIcon(source.confidence);
        const headerEl = sourceEl.createDiv({ cls: 'source-header' });
        headerEl.createEl('span', { text: confidenceIcon, cls: 'confidence-icon' });
        headerEl.createEl('h4', { text: source.name, cls: 'source-name' });

        // 詳細情報
        const detailsEl = sourceEl.createDiv({ cls: 'source-details' });
        detailsEl.createEl('p', { text: source.description });
        
        const timestampEl = detailsEl.createEl('p', { cls: 'source-timestamp' });
        timestampEl.innerHTML = `<strong>作成日時:</strong> ${new Date(source.timestamp).toLocaleString()}`;

        if (source.dataPreview) {
            const previewEl = detailsEl.createEl('p', { cls: 'source-preview' });
            previewEl.innerHTML = `
                <strong>プレビュー:</strong> 
                ${source.dataPreview.postCount}件の投稿
                ${source.dataPreview.hasScheduled ? ', スケジュール投稿あり' : ''}
            `;
        }

        // 復元ボタン
        const actionEl = sourceEl.createDiv({ cls: 'source-action' });
        
        new ButtonComponent(actionEl)
            .setButtonText('この ソースから復元')
            .setClass(isRecommended ? 'mod-cta' : '')
            .onClick(() => {
                this.recoverFromSource(source);
            });
    }

    /**
     * 信頼度アイコンを取得
     */
    private getConfidenceIcon(confidence: 'high' | 'medium' | 'low'): string {
        switch (confidence) {
            case 'high': return '🟢';
            case 'medium': return '🟡';
            case 'low': return '🔴';
            default: return '⚪';
        }
    }

    /**
     * 自動復元を実行
     */
    private async performAutoRecovery(): Promise<void> {
        if (this.loading) return;
        
        this.loading = true;
        const originalContent = this.contentEl.innerHTML;
        
        try {
            // ローディング表示
            this.contentEl.empty();
            this.contentEl.addClass('recovery-loading-state');
            
            const loadingContainer = this.contentEl.createDiv({ cls: 'loading-container' });
            loadingContainer.createEl('h2', { text: '🔄 復元中...' });
            loadingContainer.createEl('p', { text: '自動復元を実行しています。しばらくお待ちください。' });

            const result = await this.recoveryManager.performAutoRecovery();
            
            if (result && result.success && result.recoveredData) {
                this.showRecoverySuccess(result);
                
                // 復元データをコールバックに渡す
                setTimeout(() => {
                    this.onRecover(result.recoveredData!);
                    this.close();
                }, 2000);
                
            } else {
                this.showRecoveryError('自動復元に失敗しました', result?.error);
            }
            
        } catch (error) {
            console.error('自動復元エラー:', error);
            this.showRecoveryError('自動復元中にエラーが発生しました', error instanceof Error ? error.message : String(error));
        } finally {
            this.loading = false;
        }
    }

    /**
     * 指定されたソースから復元
     */
    private async recoverFromSource(source: RecoverySource): Promise<void> {
        if (this.loading) return;
        
        this.loading = true;
        
        try {
            // 確認ダイアログ
            const confirmed = confirm(
                `「${source.name}」から復元しますか？\n` +
                `${source.description}\n\n` +
                `この操作により、新しいデータファイルが作成されます。`
            );

            if (!confirmed) {
                this.loading = false;
                return;
            }

            // ローディング表示
            this.contentEl.empty();
            this.contentEl.addClass('recovery-loading-state');
            
            const loadingContainer = this.contentEl.createDiv({ cls: 'loading-container' });
            loadingContainer.createEl('h2', { text: '🔄 復元中...' });
            loadingContainer.createEl('p', { text: `「${source.name}」から復元しています...` });

            const result = await this.recoveryManager.recoverFromSource(source);
            
            if (result.success && result.recoveredData) {
                this.showRecoverySuccess(result);
                
                // 復元データをコールバックに渡す
                setTimeout(() => {
                    this.onRecover(result.recoveredData!);
                    this.close();
                }, 2000);
                
            } else {
                this.showRecoveryError('復元に失敗しました', result.error);
            }
            
        } catch (error) {
            console.error('復元エラー:', error);
            this.showRecoveryError('復元中にエラーが発生しました', error instanceof Error ? error.message : String(error));
        } finally {
            this.loading = false;
        }
    }

    /**
     * 復元成功を表示
     */
    private showRecoverySuccess(result: RecoveryResult): void {
        this.contentEl.empty();
        this.contentEl.addClass('recovery-success-state');
        
        const successContainer = this.contentEl.createDiv({ cls: 'success-container' });
        successContainer.createEl('h2', { text: '✅ 復元完了' });
        
        const statsEl = successContainer.createDiv({ cls: 'recovery-success-stats' });
        statsEl.createEl('p', { text: `復元ソース: ${result.source.name}` });
        statsEl.createEl('p', { text: `復元された投稿: ${result.stats.recoveredPosts}件` });
        statsEl.createEl('p', { text: `スケジュール投稿: ${result.stats.recoveredScheduled}件` });
        statsEl.createEl('p', { text: `処理時間: ${result.stats.processingTime}ms` });
        
        successContainer.createEl('p', { 
            text: 'データファイルが正常に復元されました。2秒後に自動で閉じます。',
            cls: 'success-message'
        });
    }

    /**
     * 復元エラーを表示
     */
    private showRecoveryError(title: string, error?: string): void {
        this.contentEl.empty();
        this.contentEl.addClass('recovery-error-state');
        
        const errorContainer = this.contentEl.createDiv({ cls: 'error-container' });
        errorContainer.createEl('h2', { text: `❌ ${title}` });
        
        if (error) {
            errorContainer.createEl('p', { 
                text: `エラー詳細: ${error}`,
                cls: 'error-details'
            });
        }
        
        const buttonContainer = errorContainer.createDiv({ cls: 'button-container' });
        
        new ButtonComponent(buttonContainer)
            .setButtonText('戻る')
            .onClick(() => {
                this.onOpen(); // 元の画面に戻る
            });
            
        new ButtonComponent(buttonContainer)
            .setButtonText('閉じる')
            .onClick(() => this.close());
    }

    /**
     * 新規データファイルを作成
     */
    private createNewDataFile(): void {
        const confirmed = confirm(
            '新しい空のデータファイルを作成しますか？\n' +
            'この操作により、既存のデータは失われます（復元可能な場合を除く）。'
        );

        if (confirmed) {
            // 空の設定で復元コールバックを呼ぶ
            this.onRecover({
                posts: [],
                scheduledPosts: [],
                lastSync: 0,
                lastUpdated: Date.now()
            } as TweetWidgetSettings);
            this.close();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.removeClass('emergency-recovery-modal', 'recovery-loading-state', 'recovery-success-state', 'recovery-error-state');
    }
} 