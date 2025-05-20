// src/widgets/memoWidget.ts
import { App, MarkdownRenderer, setIcon } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main';

// --- メモウィジェット設定インターフェース ---
export interface MemoWidgetSettings {
    memoContent?: string;
}

// --- メモウィジェットデフォルト設定 ---
export const DEFAULT_MEMO_SETTINGS: MemoWidgetSettings = {
    memoContent: '',
};

// --- MemoWidget クラス (元のコードから該当部分をここに移動) ---
export class MemoWidget implements WidgetImplementation {
    id = 'memo';
    private config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin;
    private widgetEl!: HTMLElement;
    private memoContainerEl!: HTMLElement;
    private memoDisplayEl!: HTMLElement;
    private memoEditContainerEl!: HTMLElement;
    private memoEditAreaEl!: HTMLTextAreaElement;
    private editMemoButtonEl!: HTMLButtonElement;
    private saveMemoButtonEl!: HTMLButtonElement;
    private cancelMemoButtonEl!: HTMLButtonElement;
    private isEditingMemo: boolean = false;
    private currentSettings!: MemoWidgetSettings;

    constructor() {
        this.isEditingMemo = false;
    }

    private async renderMemo(markdownContent?: string) {
        if (!this.memoDisplayEl) return;
        this.memoDisplayEl.empty();
        const trimmedContent = markdownContent?.trim();
        if (trimmedContent && !this.isEditingMemo) {
            this.memoDisplayEl.style.display = '';
            await MarkdownRenderer.render(this.app, trimmedContent, this.memoDisplayEl, this.config.id, this.plugin);
        } else if (!this.isEditingMemo) { //編集中でもなく、内容も空なら非表示
            this.memoDisplayEl.style.display = 'none';
        }
    }

    private updateMemoEditUI() {
        if (!this.memoDisplayEl || !this.memoEditContainerEl || !this.editMemoButtonEl) return;

        const hasMemoContent = this.currentSettings.memoContent && this.currentSettings.memoContent.trim() !== '';

        this.memoDisplayEl.style.display = this.isEditingMemo ? 'none' : (hasMemoContent ? '' : 'none');
        this.memoEditContainerEl.style.display = this.isEditingMemo ? '' : 'none';
        this.editMemoButtonEl.style.display = this.isEditingMemo ? 'none' : '';

        if (!this.isEditingMemo && !hasMemoContent) { // 非編集モードで内容がない場合
            this.memoDisplayEl.style.display = 'none'; // 表示エリアも隠す
        }
        
        if (this.isEditingMemo) {
            this.memoEditAreaEl.focus();
        } else {
            // 非編集モードに戻った時、改めてメモをレンダリング
            this.renderMemo(this.currentSettings.memoContent);
        }
    }

    private enterMemoEditMode() {
        this.isEditingMemo = true;
        this.memoEditAreaEl.value = this.currentSettings.memoContent || '';
        this.updateMemoEditUI();
    }

    private async saveMemoChanges() {
        const newMemo = this.memoEditAreaEl.value;
        this.isEditingMemo = false; //先に編集モードを解除
        if (newMemo !== (this.currentSettings.memoContent || '')) {
            this.currentSettings.memoContent = newMemo;
            if(this.config.settings) this.config.settings.memoContent = newMemo; // WidgetConfigも更新
            await this.plugin.saveSettings(); // プラグイン全体の設定を保存
            await this.renderMemo(newMemo); // 保存後に表示を更新
        }
        this.updateMemoEditUI(); // UI全体の状態を更新
    }

    private cancelMemoEditMode() {
        this.isEditingMemo = false;
        // キャンセル時は現在の設定内容で再レンダリング
        this.renderMemo(this.currentSettings.memoContent);
        this.updateMemoEditUI();
    }

    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;

        this.currentSettings = { ...DEFAULT_MEMO_SETTINGS, ...(config.settings || {}) };
        config.settings = this.currentSettings; // Ensure config object is updated

        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'memo-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);

        const titleEl = this.widgetEl.createEl('h4');
        titleEl.textContent = this.config.title;

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
        
        this.memoContainerEl = contentEl.createDiv({ cls: 'memo-widget-container' });
        const memoHeaderEl = this.memoContainerEl.createDiv({ cls: 'memo-widget-header' });
        
        this.editMemoButtonEl = memoHeaderEl.createEl('button', { cls: 'memo-widget-edit-button' });
        setIcon(this.editMemoButtonEl, 'pencil');
        this.editMemoButtonEl.setAttribute('aria-label', 'メモを編集/追加');
        this.editMemoButtonEl.onClickEvent(() => this.enterMemoEditMode());

        this.memoDisplayEl = this.memoContainerEl.createDiv({ cls: 'memo-widget-display' });
        
        this.memoEditContainerEl = this.memoContainerEl.createDiv({ cls: 'memo-widget-edit-container' });
        this.memoEditAreaEl = this.memoEditContainerEl.createEl('textarea', { cls: 'memo-widget-edit-area' });
        
        const memoEditControlsEl = this.memoEditContainerEl.createDiv({ cls: 'memo-widget-edit-controls' });
        this.saveMemoButtonEl = memoEditControlsEl.createEl('button', { text: '保存' });
        this.saveMemoButtonEl.addClass('mod-cta');
        this.cancelMemoButtonEl = memoEditControlsEl.createEl('button', { text: 'キャンセル' });

        this.saveMemoButtonEl.onClickEvent(() => this.saveMemoChanges());
        this.cancelMemoButtonEl.onClickEvent(() => this.cancelMemoEditMode());

        this.isEditingMemo = false; // 初期状態は表示モード
        this.renderMemo(this.currentSettings.memoContent);
        this.updateMemoEditUI();

        return this.widgetEl;
    }

    public async updateExternalSettings(newSettings: MemoWidgetSettings, widgetId?: string) {
        if (widgetId && this.config?.id !== widgetId) return;

        const oldMemoContent = this.currentSettings.memoContent;
        this.currentSettings = { ...this.currentSettings, ...newSettings };
        if(this.config && this.config.settings) {
            this.config.settings = this.currentSettings; // WidgetConfigも更新
        }

        if (oldMemoContent !== this.currentSettings.memoContent && !this.isEditingMemo) {
            await this.renderMemo(this.currentSettings.memoContent);
        }
        // 編集中でない場合のみUI全体を更新
        if (!this.isEditingMemo) {
            this.updateMemoEditUI();
        }
    }

    onunload(): void {
        // クリーンアップ処理があればここに記述
        this.isEditingMemo = false; // 念のため
    }
}