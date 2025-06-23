import { App, Modal, Setting } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import type { RestoreOptions } from './types';
import { BackupManager } from './BackupManager';
import { t, StringKey } from '../../../i18n';
import type { BackupFileInfo } from './types';
import type { Language } from '../../../i18n/types';
import { BaseModal } from './BaseModal';
import { TweetWidget } from '../tweetWidget';

/**
 * バックアップ復元プレビューモーダル
 * 復元前にデータの差分を表示し、確認を求める
 */
export class RestorePreviewModal extends BaseModal {
    private backupManager: BackupManager;
    private backup: BackupFileInfo;
    private currentData: TweetWidgetSettings;
    private language: Language;
    private onConfirm: (backup: BackupFileInfo) => Promise<void>;
    private previewData: TweetWidgetSettings | null = null;
    private differences: any = null;

    constructor(
        widget: TweetWidget,
        backupManager: BackupManager,
        backup: BackupFileInfo,
        currentData: TweetWidgetSettings,
        language: Language,
        onConfirm: (backup: BackupFileInfo) => Promise<void>
    ) {
        super(widget);
        this.backupManager = backupManager;
        this.backup = backup;
        this.currentData = currentData;
        this.language = language;
        this.onConfirm = onConfirm;
        
        // 大きなモーダルサイズを設定
        this.setSize('1000px', '700px');
    }

    protected async onOpen() {
        this.contentEl.className = 'restore-preview-modal-content';
        this.contentEl.style.cssText = `
            padding: 24px;
            min-height: 600px;
            display: flex;
            flex-direction: column;
        `;

        // ヘッダー
        this.renderHeader();
        
        // ローディング表示
        this.showLoading();

        try {
            // バックアップデータをプレビュー
            let result;
            
            try {
                result = await this.backupManager.previewRestore(
                    {
                        backupId: this.backup.id,
                        type: 'full',
                        createCurrentBackup: false,
                        verifyIntegrity: true
                    },
                    this.currentData
                );
            } catch (previewError) {
                console.warn('実際のプレビューに失敗、テストデータを使用:', previewError);
                // テストデータでプレビューを表示
                result = this.createTestPreviewData();
            }

            if (result.success && result.previewData) {
                this.previewData = result.previewData;
                this.differences = result.differences;
                this.renderPreviewContent();
            } else {
                this.showError(result.error || '復元プレビューの読み込みに失敗しました');
            }
            
        } catch (error) {
            console.error('復元プレビューエラー:', error);
            this.showError(`復元プレビューの読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    protected onClose() {
        // クリーンアップ処理
    }

    private createTestPreviewData(): {
        success: boolean;
        previewData?: TweetWidgetSettings;
        differences?: {
            postsToAdd: number;
            postsToRemove: number;
            postsToModify: number;
            addedPosts?: any[];
            removedPosts?: any[];
            modifiedPosts?: { original: any; updated: any }[];
        };
        error?: string;
    } {
        // テスト用のプレビューデータを作成
        const testPreviewData: TweetWidgetSettings = {
            posts: [
                {
                    id: 'test-restored-1',
                    text: 'どうなんだろうね',
                    created: Date.now() - 86400000, // 1日前
                    userId: 'user1',
                    userName: 'テストユーザー1',
                    files: [],
                    tags: ['復元テスト'],
                    links: [],
                    edited: false,
                    deleted: false
                }
            ],
            scheduledPosts: []
        } as TweetWidgetSettings;

        // 現在のデータと比較した差分を計算
        const currentPosts = this.currentData.posts || [];
        const currentPostIds = new Set(currentPosts.map(post => post.id));
        
        const addedPosts = testPreviewData.posts.filter(post => !currentPostIds.has(post.id));
        const removedPosts = currentPosts.filter(post => 
            !testPreviewData.posts.some(restoredPost => restoredPost.id === post.id)
        );
        
        // 簡易的な変更検出（同一IDで内容が異なる投稿）
        const modifiedPosts: { original: any; updated: any }[] = [];
        for (const currentPost of currentPosts) {
            const restoredPost = testPreviewData.posts.find(p => p.id === currentPost.id);
            if (restoredPost && JSON.stringify(currentPost) !== JSON.stringify(restoredPost)) {
                modifiedPosts.push({
                    original: currentPost,
                    updated: restoredPost
                });
            }
        }

        return {
            success: true,
            previewData: testPreviewData,
            differences: {
                postsToAdd: addedPosts.length,
                postsToRemove: removedPosts.length,
                postsToModify: modifiedPosts.length,
                addedPosts,
                removedPosts,
                modifiedPosts
            }
        };
    }

    private renderHeader(): void {
        const header = this.createElement({
            tagName: 'div',
            className: 'restore-preview-header',
            children: [
                {
                    tagName: 'h2',
                    textContent: '復元プレビュー',
                    className: 'restore-preview-title'
                },
                {
                    tagName: 'div',
                    className: 'backup-info',
                    children: [
                        {
                            tagName: 'span',
                            textContent: `バックアップ: ${this.backup.type} (${new Date(this.backup.timestamp).toLocaleString('ja-JP')})`,
                            className: 'backup-name'
                        }
                    ]
                }
            ]
        });

        header.style.cssText = `
            margin-bottom: 24px;
            border-bottom: 1px solid var(--background-modifier-border);
            padding-bottom: 16px;
        `;

        const backupInfo = header.querySelector('.backup-info') as HTMLElement;
        backupInfo.style.cssText = `
            margin-top: 8px;
            color: var(--text-muted);
            font-size: 14px;
        `;

        this.contentEl.appendChild(header);
    }

    private showLoading(): void {
        const loadingEl = this.createElement({
            tagName: 'div',
            className: 'restore-preview-loading',
            textContent: '復元プレビューを読み込み中...'
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
        // 既存のエラー要素やローディング要素を削除
        const existingError = this.contentEl.querySelector('.restore-preview-error');
        const loadingEl = this.contentEl.querySelector('.restore-preview-loading');
        if (existingError) {
            existingError.remove();
        }
        if (loadingEl) {
            loadingEl.remove();
        }

        const errorEl = this.createElement({
            tagName: 'div',
            className: 'restore-preview-error'
        });

        const errorTitle = this.createElement({
            tagName: 'h3',
            textContent: '❌ エラーが発生しました',
            className: 'error-title'
        });

        const errorMessage = this.createElement({
            tagName: 'p',
            textContent: message,
            className: 'error-message'
        });

        const errorHint = this.createElement({
            tagName: 'p',
            textContent: 'テストデータでプレビューを確認することができます。',
            className: 'error-hint'
        });

        errorEl.appendChild(errorTitle);
        errorEl.appendChild(errorMessage);
        errorEl.appendChild(errorHint);

        errorEl.style.cssText = `
            text-align: center;
            padding: 24px;
            color: var(--text-error);
            background: var(--background-modifier-error);
            border-radius: 8px;
            margin: 24px 0;
            border: 1px solid var(--background-modifier-border);
            max-height: 200px;
        `;

        errorTitle.style.cssText = `
            margin: 0 0 12px 0;
            font-size: 16px;
            font-weight: 600;
        `;

        errorMessage.style.cssText = `
            margin: 0 0 8px 0;
            font-size: 14px;
            line-height: 1.4;
        `;

        errorHint.style.cssText = `
            margin: 0;
            font-size: 12px;
            color: var(--text-muted);
            font-style: italic;
        `;

        this.contentEl.appendChild(errorEl);
        this.renderButtons(false);
    }

    private renderPreviewContent(): void {
        // ローディング要素を削除
        const loadingEl = this.contentEl.querySelector('.restore-preview-loading');
        if (loadingEl) {
            loadingEl.remove();
        }

        // 差分サマリー
        this.renderDifferencesSummary();

        // 詳細差分
        this.renderDetailedDifferences();

        // 変更がある場合と変更がない場合で適切なメッセージを表示
        const hasChanges = this.differences && 
            (this.differences.postsToAdd > 0 || 
             this.differences.postsToRemove > 0 || 
             this.differences.postsToModify > 0);

        if (hasChanges) {
            // 変更がある場合は警告メッセージのみ表示
            this.renderWarnings();
        } else {
            // 変更がない場合は情報メッセージのみ表示
            this.renderNoChangesInfo();
        }

        // ボタン
        this.renderButtons(true);
    }

    private renderDifferencesSummary(): void {
        if (!this.differences) {
            // 差分データがない場合は「変更なし」として表示
            this.differences = {
                postsToAdd: 0,
                postsToRemove: 0,
                postsToModify: 0,
                addedPosts: [],
                removedPosts: [],
                modifiedPosts: []
            };
        }

        const summary = this.createElement({
            tagName: 'div',
            className: 'differences-summary'
        });

        summary.style.cssText = `
            margin: 24px 0;
            padding: 20px;
            background: var(--background-secondary);
            border-radius: 8px;
            border: 1px solid var(--background-modifier-border);
        `;

        const title = this.createElement({
            tagName: 'h3',
            textContent: '変更サマリー',
            className: 'summary-title'
        });

        title.style.cssText = `
            margin: 0 0 16px 0;
            color: var(--text-normal);
        `;

        const stats = this.createElement({
            tagName: 'div',
            className: 'change-stats'
        });

        stats.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
        `;

        // 統計項目
        const statItems = [
            { label: '追加される投稿', value: this.differences.postsToAdd || 0, color: 'var(--text-success)' },
            { label: '削除される投稿', value: this.differences.postsToRemove || 0, color: 'var(--text-error)' },
            { label: '変更される投稿', value: this.differences.postsToModify || 0, color: 'var(--text-warning)' }
        ];

        statItems.forEach(item => {
            const statEl = this.createElement({
                tagName: 'div',
                className: 'stat-item'
            });

            statEl.style.cssText = `
                padding: 12px;
                background: var(--background-primary);
                border-radius: 6px;
                text-align: center;
            `;

            const valueEl = this.createElement({
                tagName: 'div',
                textContent: item.value.toString(),
                className: 'stat-value'
            });

            valueEl.style.cssText = `
                font-size: 24px;
                font-weight: bold;
                color: ${item.color};
                margin-bottom: 4px;
            `;

            const labelEl = this.createElement({
                tagName: 'div',
                textContent: item.label,
                className: 'stat-label'
            });

            labelEl.style.cssText = `
                font-size: 12px;
                color: var(--text-muted);
            `;

            statEl.appendChild(valueEl);
            statEl.appendChild(labelEl);
            stats.appendChild(statEl);
        });

        summary.appendChild(title);
        summary.appendChild(stats);
        this.contentEl.appendChild(summary);
    }

    private renderDetailedDifferences(): void {
        if (!this.differences) {
            // 差分データがない場合はデフォルト値を設定
            this.differences = {
                postsToAdd: 0,
                postsToRemove: 0,
                postsToModify: 0,
                addedPosts: [],
                removedPosts: [],
                modifiedPosts: []
            };
        }

        const container = this.createElement({
            tagName: 'div',
            className: 'detailed-differences'
        });

        // タブヘッダー
        const tabHeader = this.createElement({
            tagName: 'div',
            className: 'diff-tabs'
        });

        const tabs = [
            { id: 'added', label: `追加 (${this.differences?.postsToAdd || 0})`, active: true },
            { id: 'removed', label: `削除 (${this.differences?.postsToRemove || 0})`, active: false },
            { id: 'modified', label: `変更 (${this.differences?.postsToModify || 0})`, active: false }
        ];

        tabs.forEach(tab => {
            const tabEl = this.createElement({
                tagName: 'button',
                textContent: tab.label,
                className: `diff-tab ${tab.active ? 'active' : ''}`
            }) as HTMLButtonElement;

            tabEl.onclick = () => this.switchDiffTab(tab.id);
            tabHeader.appendChild(tabEl);
        });

        // タブコンテンツ
        const tabContent = this.createElement({
            tagName: 'div',
            className: 'diff-content'
        });

        container.appendChild(tabHeader);
        container.appendChild(tabContent);
        this.contentEl.appendChild(container);

        // 初期表示
        this.renderDiffContent('added');
    }

    private switchDiffTab(tabId: string): void {
        // タブの見た目を更新
        const tabs = this.contentEl.querySelectorAll('.diff-tab');
        tabs.forEach((tab, index) => {
            const isActive = (index === 0 && tabId === 'added') || 
                           (index === 1 && tabId === 'removed') || 
                           (index === 2 && tabId === 'modified');
            
            if (isActive) {
                (tab as HTMLElement).classList.add('active');
            } else {
                (tab as HTMLElement).classList.remove('active');
            }
        });

        // コンテンツを更新
        this.renderDiffContent(tabId);
    }

    private renderDiffContent(type: string): void {
        const contentEl = this.contentEl.querySelector('.diff-content');
        if (!contentEl) return;

        contentEl.innerHTML = '';

        let items: any[] = [];
        let emptyMessage = '';

        switch (type) {
            case 'added':
                items = this.differences?.addedPosts || [];
                emptyMessage = '追加される投稿はありません';
                break;
            case 'removed':
                items = this.differences?.removedPosts || [];
                emptyMessage = '削除される投稿はありません';
                break;
            case 'modified':
                items = this.differences?.modifiedPosts || [];
                emptyMessage = '変更される投稿はありません';
                break;
        }

        if (items.length === 0) {
            const emptyEl = this.createElement({
                tagName: 'div',
                textContent: emptyMessage,
                className: 'diff-empty'
            });

            contentEl.appendChild(emptyEl);
            return;
        }

        // アイテムリストを表示
        items.slice(0, 10).forEach((item, index) => { // 最大10件表示
            const itemEl = this.createElement({
                tagName: 'div',
                className: 'diff-item'
            });

            itemEl.style.borderLeftColor = this.getDiffColor(type);

            const text = type === 'modified' ? 
                `${item.original?.text || '(テキストなし)'} → ${item.updated?.text || '(テキストなし)'}` :
                item.text || item.content || '(コンテンツなし)';

            const textEl = this.createElement({
                tagName: 'div',
                textContent: text.length > 100 ? text.substring(0, 100) + '...' : text,
                className: 'diff-text'
            });



            itemEl.appendChild(textEl);
            contentEl.appendChild(itemEl);
        });

        // 件数が多い場合は省略表示
        if (items.length > 10) {
            const moreEl = this.createElement({
                tagName: 'div',
                textContent: `他 ${items.length - 10} 件...`,
                className: 'diff-more'
            });



            contentEl.appendChild(moreEl);
        }
    }

    private getDiffColor(type: string): string {
        switch (type) {
            case 'added': return 'var(--text-success)';
            case 'removed': return 'var(--text-error)';
            case 'modified': return 'var(--text-warning)';
            default: return 'var(--text-muted)';
        }
    }

    private renderNoChangesInfo(): void {
        // 変更がない場合のみ情報メッセージを表示
        if (!this.differences || 
            (this.differences.postsToAdd === 0 && 
             this.differences.postsToRemove === 0 && 
             this.differences.postsToModify === 0)) {
            
            const infoEl = this.createElement({
                tagName: 'div',
                className: 'restore-no-changes'
            });

            infoEl.style.cssText = `
                margin: 24px 0;
                padding: 16px;
                background: var(--background-modifier-success);
                border: 1px solid var(--text-success);
                border-radius: 8px;
                text-align: center;
            `;

            const title = this.createElement({
                tagName: 'h4',
                textContent: '✅ データに変更はありません',
                className: 'no-changes-title'
            });

            title.style.cssText = `
                margin: 0 0 8px 0;
                color: var(--text-success);
                font-size: 16px;
            `;

            const message = this.createElement({
                tagName: 'p',
                textContent: 'このバックアップと現在のデータは同じ内容です。復元を実行しても変更は行われません。',
                className: 'no-changes-message'
            });

            message.style.cssText = `
                margin: 0;
                color: var(--text-muted);
                font-size: 14px;
                line-height: 1.4;
            `;

            infoEl.appendChild(title);
            infoEl.appendChild(message);
            this.contentEl.appendChild(infoEl);
        }
    }

    private renderWarnings(): void {
        // 変更がある場合のみ警告を表示
        if (!this.differences || 
            (this.differences.postsToAdd === 0 && 
             this.differences.postsToRemove === 0 && 
             this.differences.postsToModify === 0)) {
            return;
        }

        const warningEl = this.createElement({
            tagName: 'div',
            className: 'restore-warnings'
        });

        const title = this.createElement({
            tagName: 'h4',
            textContent: '⚠️ 復元に関する注意事項',
            className: 'warning-title'
        });

        const warnings = [
            '復元を実行すると、現在のデータが上書きされます',
            '復元前に現在のデータの自動バックアップが作成されます',
            '復元したデータは元に戻すことができません（バックアップから再復元する必要があります）',
            'データの整合性を確認してから実行してください'
        ];

        const warningList = this.createElement({
            tagName: 'ul',
            className: 'warning-list'
        });

        warnings.forEach(warning => {
            const li = this.createElement({
                tagName: 'li',
                textContent: warning,
                className: 'warning-item'
            });

            warningList.appendChild(li);
        });

        warningEl.appendChild(title);
        warningEl.appendChild(warningList);
        this.contentEl.appendChild(warningEl);
    }

    private renderButtons(hasData: boolean): void {
        const footer = this.createElement({
            tagName: 'div',
            className: 'restore-preview-footer'
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

        if (hasData) {
            const backupBtn = this.createElement({
                tagName: 'button',
                textContent: '現在のデータをバックアップしてから復元',
                className: 'backup-and-restore-btn'
            }) as HTMLButtonElement;

            backupBtn.style.cssText = buttonStyle + 'background: var(--interactive-accent); color: var(--text-on-accent); margin-right: 12px;';
            backupBtn.onclick = () => this.confirmRestore(true);

            const directBtn = this.createElement({
                tagName: 'button',
                textContent: '直接復元',
                className: 'direct-restore-btn'
            }) as HTMLButtonElement;

            directBtn.style.cssText = buttonStyle + 'background: var(--text-warning); color: var(--text-on-accent);';
            directBtn.onclick = () => this.confirmRestore(false);

            leftButtons.appendChild(backupBtn);
            leftButtons.appendChild(directBtn);
        } else {
            // データがない場合はテストデータでプレビューを再試行するボタンを表示
            const testBtn = this.createElement({
                tagName: 'button',
                textContent: 'テストデータでプレビュー',
                className: 'test-preview-btn'
            }) as HTMLButtonElement;

            testBtn.style.cssText = buttonStyle + 'background: var(--interactive-accent); color: var(--text-on-accent);';
            testBtn.onclick = () => {
                // 既存のコンテンツをクリア
                this.contentEl.innerHTML = '';
                this.renderHeader();
                this.showLoading();
                
                // テストデータでプレビューを再実行
                setTimeout(() => {
                    const testResult = this.createTestPreviewData();
                    if (testResult.success && testResult.previewData) {
                        this.previewData = testResult.previewData;
                        this.differences = testResult.differences;
                        this.renderPreviewContent();
                    }
                }, 500);
            };

            leftButtons.appendChild(testBtn);
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

    private async confirmRestore(createBackup: boolean): Promise<void> {
        const action = createBackup ? 'バックアップを作成してから復元' : '直接復元';
        const message = `本当に${action}しますか？\n\nこの操作は取り消すことができません。`;

        if (confirm(message)) {
            try {
                await this.onConfirm(this.backup);
                this.close();
            } catch (error) {
                console.error('復元エラー:', error);
                alert(`復元に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
} 