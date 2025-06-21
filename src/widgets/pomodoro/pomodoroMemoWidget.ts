import { App, Notice, setIcon, Component } from 'obsidian';
import { renderMarkdownBatch } from '../../utils/renderMarkdownBatch';
import { t, Language } from '../../i18n';

declare global {
    interface Window {
        __WB_MEMO_EDITING__?: boolean;
    }
}

export interface PomodoroMemoSettings {
    memoContent?: string;
}

/**
 * ポモドーロ用メモウィジェット
 * - Markdownメモの表示・編集、親ウィジェットとの連携
 */
export class PomodoroMemoWidget {
    private app: App;
    private containerEl: HTMLElement;
    private memoDisplayEl: HTMLElement;
    private memoEditContainerEl: HTMLElement;
    private memoEditAreaEl: HTMLTextAreaElement;
    private editMemoButtonEl: HTMLButtonElement;
    private saveMemoButtonEl: HTMLButtonElement;
    private cancelMemoButtonEl: HTMLButtonElement;
    private isEditingMemo: boolean = false;
    private settings: PomodoroMemoSettings;
    private onSave: ((newMemo: string) => void) | null = null;
    private lang: Language = 'ja';

    /**
     * インスタンス初期化
     * @param app Obsidianアプリ
     * @param parentEl 親要素
     * @param settings メモ設定
     * @param onSave 保存時コールバック
     */
    constructor(app: App, parentEl: HTMLElement, settings: PomodoroMemoSettings, onSave?: (newMemo: string) => void, lang: Language = 'ja') {
        this.app = app;
        this.settings = settings;
        this.containerEl = parentEl.createDiv({ cls: 'pomodoro-memo-container' });
        this.onSave = onSave || null;
        this.lang = lang;
        this.render();
    }

    /**
     * メモUIを描画
     */
    private render() {
        // ヘッダー
        const memoHeaderEl = this.containerEl.createDiv({ cls: 'pomodoro-memo-header' });
        this.editMemoButtonEl = memoHeaderEl.createEl('button', { cls: 'pomodoro-memo-edit-button' });
        setIcon(this.editMemoButtonEl, 'pencil');
        this.editMemoButtonEl.setAttribute('aria-label', t(this.lang, 'widget.memo.editAddAriaLabel'));
        this.editMemoButtonEl.onClickEvent(() => this.enterMemoEditMode());

        // 表示エリア
        this.memoDisplayEl = this.containerEl.createDiv({ cls: 'pomodoro-memo-display' });
        // 編集エリア
        this.memoEditContainerEl = this.containerEl.createDiv({ cls: 'pomodoro-memo-edit-container' });
        this.memoEditContainerEl.style.display = 'none';
        this.memoEditAreaEl = this.memoEditContainerEl.createEl('textarea', { cls: 'pomodoro-memo-edit-area' });
        const memoEditControlsEl = this.memoEditContainerEl.createDiv({ cls: 'pomodoro-memo-edit-controls' });
        this.saveMemoButtonEl = memoEditControlsEl.createEl('button', { text: t(this.lang, 'save') });
        this.saveMemoButtonEl.addClass('mod-cta');
        this.cancelMemoButtonEl = memoEditControlsEl.createEl('button', { text: t(this.lang, 'cancel') });
        this.saveMemoButtonEl.onClickEvent(() => this.saveMemoChanges());
        this.cancelMemoButtonEl.onClickEvent(() => this.cancelMemoEditMode());
        this.updateMemoEditUI();
    }

    /**
     * メモ内容をMarkdownで描画
     */
    private async renderMemo(markdownContent?: string) {
        this.memoDisplayEl.empty();
        const trimmedContent = markdownContent?.trim();
        if (trimmedContent && !this.isEditingMemo) {
            this.memoDisplayEl.style.display = 'block';
            await renderMarkdownBatch(trimmedContent, this.memoDisplayEl, '', new Component());
        } else if (!this.isEditingMemo) {
            this.memoDisplayEl.style.display = 'none';
        }
    }

    /**
     * メモ編集UIを差分更新
     */
    private updateMemoEditUI() {
        const hasMemoContent = this.settings.memoContent && this.settings.memoContent.trim() !== '';
        this.memoDisplayEl.style.display = this.isEditingMemo ? 'none' : (hasMemoContent ? 'block' : 'none');
        this.memoEditContainerEl.style.display = this.isEditingMemo ? 'flex' : 'none';
        this.editMemoButtonEl.style.display = this.isEditingMemo ? 'none' : '';
        if (this.isEditingMemo) {
            if (document.activeElement !== this.memoEditAreaEl) {
                this.memoEditAreaEl.value = this.settings.memoContent || '';
                this.memoEditAreaEl.focus();
            }
        } else {
            this.renderMemo(this.settings.memoContent);
        }
    }

    /**
     * 編集モードに切り替え
     */
    private enterMemoEditMode() {
        this.isEditingMemo = true;
        window.__WB_MEMO_EDITING__ = true;
        this.updateMemoEditUI();
    }

    /**
     * メモを保存
     */
    private async saveMemoChanges() {
        const newMemo = this.memoEditAreaEl.value;
        this.isEditingMemo = false;
        window.__WB_MEMO_EDITING__ = false;
        if (newMemo !== (this.settings.memoContent || '')) {
            this.settings.memoContent = newMemo;
            if (typeof this.onSave === 'function') {
                try {
                    await this.onSave(newMemo);
                } catch (e) {
                    new Notice(t(this.lang, 'widget.pomodoro.memoSaveFailed'));
                    console.error(e);
                }
            }
            new Notice(t(this.lang, 'widget.pomodoro.memoSaved'));
        }
        this.updateMemoEditUI();
    }

    /**
     * 編集をキャンセル
     */
    private cancelMemoEditMode() {
        this.isEditingMemo = false;
        window.__WB_MEMO_EDITING__ = false;
        this.updateMemoEditUI();
    }

    /**
     * 現在のメモ内容を取得
     */
    public getMemoContent(): string {
        return this.settings.memoContent || '';
    }

    /**
     * メモ内容をセット
     */
    public setMemoContent(content: string) {
        if (this.isEditingMemo) return;
        this.settings.memoContent = content;
        this.updateMemoEditUI();
    }

    /**
     * UIを最新状態に更新
     */
    public updateUI() {
        this.updateMemoEditUI();
    }

    /**
     * 編集モードに入る
     */
    public enterEditMode() {
        this.enterMemoEditMode();
    }

    /**
     * メモを保存（外部呼び出し用）
     */
    public async saveChanges() {
        await this.saveMemoChanges();
    }

    /**
     * 編集をキャンセル（外部呼び出し用）
     */
    public cancelEditMode() {
        this.cancelMemoEditMode();
    }

    /**
     * 編集中かどうかを取得
     */
    public get isEditing() {
        return this.isEditingMemo;
    }
} 