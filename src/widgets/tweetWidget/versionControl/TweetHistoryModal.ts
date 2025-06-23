import { Modal, App, ButtonComponent, Notice } from 'obsidian';
import type { HistoryEntry, RestoreOptions } from './types';
import type { TweetRepository } from '../TweetRepository';
import { type Language } from '../../../i18n';

/**
 * ツイート履歴表示・復元モーダル
 */
export class TweetHistoryModal extends Modal {
    private repository: TweetRepository;
    private lang: Language;
    private history: HistoryEntry[] = [];
    private onRestore?: () => void;

    constructor(
        app: App, 
        repository: TweetRepository, 
        lang: Language,
        onRestore?: () => void
    ) {
        super(app);
        this.repository = repository;
        this.lang = lang;
        this.onRestore = onRestore;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        // モーダルのタイトル
        contentEl.createEl('h2', { text: 'ツイート履歴' });

        // ローディング表示
        const loadingEl = contentEl.createDiv({ cls: 'tweet-history-loading' });
        loadingEl.textContent = '履歴を読み込み中...';

        try {
            // 履歴データを取得
            this.history = await this.repository.getHistory(50);
            loadingEl.remove();

            if (this.history.length === 0) {
                contentEl.createDiv({ 
                    cls: 'tweet-history-empty',
                    text: 'まだ履歴がありません'
                });
                return;
            }

            // 統計情報の表示
            await this.renderStats(contentEl);

            // 履歴リストの表示
            this.renderHistoryList(contentEl);

        } catch (error) {
            loadingEl.textContent = `履歴の読み込みに失敗しました: ${error.message}`;
            console.error('履歴読み込みエラー:', error);
        }
    }

    private async renderStats(container: HTMLElement) {
        const stats = await this.repository.getVersionStats();
        const statsEl = container.createDiv({ cls: 'tweet-history-stats' });
        
        statsEl.createEl('p', { 
            text: `総コミット数: ${stats.totalCommits}件`
        });
        
        if (stats.firstCommit) {
            statsEl.createEl('p', { 
                text: `初回作成: ${new Date(stats.firstCommit).toLocaleString()}`
            });
        }
        
        if (stats.lastCommit) {
            statsEl.createEl('p', { 
                text: `最終更新: ${new Date(stats.lastCommit).toLocaleString()}`
            });
        }
    }

    private renderHistoryList(container: HTMLElement) {
        const listContainer = container.createDiv({ cls: 'tweet-history-list' });
        
        this.history.forEach((entry, index) => {
            const itemEl = listContainer.createDiv({ cls: 'tweet-history-item' });
            
            // コミット情報のヘッダー
            const headerEl = itemEl.createDiv({ cls: 'tweet-history-header' });
            
            // コミットID（短縮）
            const commitIdEl = headerEl.createSpan({ 
                cls: 'tweet-commit-id',
                text: entry.commit.id.substring(0, 8)
            });
            
            // タイムスタンプ
            const timeEl = headerEl.createSpan({ 
                cls: 'tweet-commit-time',
                text: new Date(entry.commit.timestamp).toLocaleString()
            });
            
            // コミットメッセージ
            const messageEl = itemEl.createDiv({ 
                cls: 'tweet-commit-message',
                text: entry.displayMessage
            });
            
            // サマリー
            const summaryEl = itemEl.createDiv({ 
                cls: 'tweet-commit-summary',
                text: entry.summary
            });
            
            // 復元ボタン（最新コミット以外）
            if (index > 0) {
                const actionsEl = itemEl.createDiv({ cls: 'tweet-history-actions' });
                
                new ButtonComponent(actionsEl)
                    .setButtonText('復元')
                    .setClass('mod-cta')
                    .onClick(() => this.confirmRestore(entry));
                
                new ButtonComponent(actionsEl)
                    .setButtonText('プレビュー')
                    .onClick(() => this.previewCommit(entry));
            } else {
                // 現在のコミットマーク
                const currentEl = itemEl.createDiv({ 
                    cls: 'tweet-current-commit',
                    text: '(現在)'
                });
            }
        });
    }

    private confirmRestore(entry: HistoryEntry) {
        const confirmModal = new ConfirmRestoreModal(
            this.app,
            entry,
            async (options) => {
                try {
                    const success = await this.repository.restoreFromCommit(options, this.lang);
                    if (success) {
                        this.close();
                        this.onRestore?.();
                    }
                } catch (error) {
                    new Notice(`復元に失敗しました: ${error.message}`);
                }
            }
        );
        confirmModal.open();
    }

    private previewCommit(entry: HistoryEntry) {
        const previewModal = new CommitPreviewModal(this.app, entry);
        previewModal.open();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * 復元確認モーダル
 */
class ConfirmRestoreModal extends Modal {
    private entry: HistoryEntry;
    private onConfirm: (options: RestoreOptions) => Promise<void>;

    constructor(
        app: App, 
        entry: HistoryEntry, 
        onConfirm: (options: RestoreOptions) => Promise<void>
    ) {
        super(app);
        this.entry = entry;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '復元の確認' });
        
        contentEl.createEl('p', { 
            text: `以下のコミットに復元しますか？` 
        });
        
        const infoEl = contentEl.createDiv({ cls: 'restore-confirm-info' });
        infoEl.createEl('strong', { text: `コミット: ${this.entry.commit.id.substring(0, 8)}` });
        infoEl.createEl('br');
        infoEl.createSpan({ text: `日時: ${new Date(this.entry.commit.timestamp).toLocaleString()}` });
        infoEl.createEl('br');
        infoEl.createSpan({ text: `変更: ${this.entry.summary}` });
        infoEl.createEl('br');
        infoEl.createSpan({ text: `メッセージ: ${this.entry.displayMessage}` });
        
        // オプション
        const optionsEl = contentEl.createDiv({ cls: 'restore-options' });
        
        const backupCheckbox = optionsEl.createEl('label');
        const backupInput = backupCheckbox.createEl('input', { type: 'checkbox' });
        backupInput.checked = true;
        backupCheckbox.createSpan({ text: ' 復元前にバックアップを作成' });
        
        // ボタン
        const buttonsEl = contentEl.createDiv({ cls: 'modal-button-container' });
        
        new ButtonComponent(buttonsEl)
            .setButtonText('キャンセル')
            .onClick(() => this.close());
        
        new ButtonComponent(buttonsEl)
            .setButtonText('復元')
            .setClass('mod-warning')
            .onClick(async () => {
                const options: RestoreOptions = {
                    commitId: this.entry.commit.id,
                    createBackup: backupInput.checked
                };
                
                await this.onConfirm(options);
                this.close();
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}

/**
 * コミット内容プレビューモーダル
 */
class CommitPreviewModal extends Modal {
    private entry: HistoryEntry;

    constructor(app: App, entry: HistoryEntry) {
        super(app);
        this.entry = entry;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'コミット詳細' });
        
        // 基本情報
        const infoEl = contentEl.createDiv({ cls: 'commit-preview-info' });
        infoEl.createEl('p').innerHTML = `<strong>コミットID:</strong> ${this.entry.commit.id}`;
        infoEl.createEl('p').innerHTML = `<strong>日時:</strong> ${new Date(this.entry.commit.timestamp).toLocaleString()}`;
        infoEl.createEl('p').innerHTML = `<strong>作成者:</strong> ${this.entry.commit.author}`;
        infoEl.createEl('p').innerHTML = `<strong>メッセージ:</strong> ${this.entry.displayMessage}`;
        infoEl.createEl('p').innerHTML = `<strong>変更概要:</strong> ${this.entry.summary}`;
        
        // 差分詳細
        const diffsEl = contentEl.createDiv({ cls: 'commit-preview-diffs' });
        diffsEl.createEl('h3', { text: '変更詳細' });
        
        if (this.entry.commit.diffs.length === 0) {
            diffsEl.createEl('p', { text: '変更はありません' });
        } else {
            this.entry.commit.diffs.forEach(diff => {
                const diffEl = diffsEl.createDiv({ cls: `diff-item diff-${diff.type}` });
                
                const typeText = {
                    'add': '追加',
                    'remove': '削除',
                    'modify': '変更'
                }[diff.type];
                
                diffEl.createEl('strong', { text: `${typeText}: ` });
                
                if (diff.type === 'add' && diff.newPost) {
                    diffEl.createSpan({ text: `"${diff.newPost.text.substring(0, 50)}..."` });
                } else if (diff.type === 'remove' && diff.oldPost) {
                    diffEl.createSpan({ text: `"${diff.oldPost.text.substring(0, 50)}..."` });
                } else if (diff.type === 'modify' && diff.oldPost && diff.newPost) {
                    diffEl.createSpan({ text: `"${diff.oldPost.text.substring(0, 25)}..." → "${diff.newPost.text.substring(0, 25)}..."` });
                }
            });
        }
        
        // 閉じるボタン
        const buttonEl = contentEl.createDiv({ cls: 'modal-button-container' });
        new ButtonComponent(buttonEl)
            .setButtonText('閉じる')
            .onClick(() => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
} 