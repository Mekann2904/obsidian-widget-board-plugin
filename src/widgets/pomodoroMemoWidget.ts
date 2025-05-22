import { App, MarkdownRenderer, Notice, setIcon, Component } from 'obsidian';

export interface PomodoroMemoSettings {
    memoContent?: string;
}

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

    constructor(app: App, parentEl: HTMLElement, settings: PomodoroMemoSettings) {
        this.app = app;
        this.settings = settings;
        this.containerEl = parentEl.createDiv({ cls: 'pomodoro-memo-container' });
        this.render();
    }

    private render() {
        // ヘッダー
        const memoHeaderEl = this.containerEl.createDiv({ cls: 'pomodoro-memo-header' });
        this.editMemoButtonEl = memoHeaderEl.createEl('button', { cls: 'pomodoro-memo-edit-button' });
        setIcon(this.editMemoButtonEl, 'pencil');
        this.editMemoButtonEl.setAttribute('aria-label', 'メモを編集/追加');
        this.editMemoButtonEl.onClickEvent(() => this.enterMemoEditMode());

        // 表示エリア
        this.memoDisplayEl = this.containerEl.createDiv({ cls: 'pomodoro-memo-display' });
        // 編集エリア
        this.memoEditContainerEl = this.containerEl.createDiv({ cls: 'pomodoro-memo-edit-container' });
        this.memoEditContainerEl.style.display = 'none';
        this.memoEditAreaEl = this.memoEditContainerEl.createEl('textarea', { cls: 'pomodoro-memo-edit-area' });
        const memoEditControlsEl = this.memoEditContainerEl.createDiv({ cls: 'pomodoro-memo-edit-controls' });
        this.saveMemoButtonEl = memoEditControlsEl.createEl('button', { text: '保存' });
        this.saveMemoButtonEl.addClass('mod-cta');
        this.cancelMemoButtonEl = memoEditControlsEl.createEl('button', { text: 'キャンセル' });
        this.saveMemoButtonEl.onClickEvent(() => this.saveMemoChanges());
        this.cancelMemoButtonEl.onClickEvent(() => this.cancelMemoEditMode());
        this.updateMemoEditUI();
    }

    private async renderMemo(markdownContent?: string) {
        this.memoDisplayEl.empty();
        const trimmedContent = markdownContent?.trim();
        if (trimmedContent && !this.isEditingMemo) {
            this.memoDisplayEl.style.display = 'block';
            await MarkdownRenderer.render(this.app, trimmedContent, this.memoDisplayEl, '', new Component());
        } else if (!this.isEditingMemo) {
            this.memoDisplayEl.style.display = 'none';
        }
    }

    private updateMemoEditUI() {
        const hasMemoContent = this.settings.memoContent && this.settings.memoContent.trim() !== '';
        this.memoDisplayEl.style.display = this.isEditingMemo ? 'none' : (hasMemoContent ? 'block' : 'none');
        this.memoEditContainerEl.style.display = this.isEditingMemo ? 'flex' : 'none';
        this.editMemoButtonEl.style.display = this.isEditingMemo ? 'none' : '';
        if (this.isEditingMemo) {
            this.memoEditAreaEl.value = this.settings.memoContent || '';
            this.memoEditAreaEl.focus();
        } else {
            this.renderMemo(this.settings.memoContent);
        }
    }

    private enterMemoEditMode() {
        this.isEditingMemo = true;
        this.updateMemoEditUI();
    }

    private async saveMemoChanges() {
        const newMemo = this.memoEditAreaEl.value;
        this.isEditingMemo = false;
        if (newMemo !== (this.settings.memoContent || '')) {
            this.settings.memoContent = newMemo;
            // TODO: 永続化処理（親からコールバックで受け取る or 独自に保存）
            new Notice('メモを保存しました');
        }
        this.updateMemoEditUI();
    }

    private cancelMemoEditMode() {
        this.isEditingMemo = false;
        this.updateMemoEditUI();
    }

    public getMemoContent(): string {
        return this.settings.memoContent || '';
    }

    public setMemoContent(content: string) {
        this.settings.memoContent = content;
        this.updateMemoEditUI();
    }

    public updateUI() {
        this.updateMemoEditUI();
    }

    public enterEditMode() {
        this.enterMemoEditMode();
    }

    public async saveChanges() {
        await this.saveMemoChanges();
    }

    public cancelEditMode() {
        this.cancelMemoEditMode();
    }

    public get isEditing() {
        return this.isEditingMemo;
    }
} 