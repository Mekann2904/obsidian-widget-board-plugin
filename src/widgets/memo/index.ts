// src/widgets/memoWidget.ts
import { App, MarkdownRenderer, setIcon, Notice, Component } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main'; // main.ts の WidgetBoardPlugin クラスをインポート
import { renderMarkdownBatch, renderMarkdownBatchWithCache } from '../../utils/renderMarkdownBatch';
import { debugLog } from '../../utils/logger';
import { applyWidgetSize, createWidgetContainer } from '../../utils';
import { renderMermaidInWorker } from '../../utils';

// --- Mermaid SVGメモリキャッシュ ---
const mermaidSvgCache = new Map<string, string>();

// --- メモウィジェット設定インターフェース ---
export interface MemoWidgetSettings {
    memoContent?: string;
    memoHeightMode?: 'auto' | 'fixed';
    fixedHeightPx?: number;
}

// --- メモウィジェットデフォルト設定 ---
export const DEFAULT_MEMO_SETTINGS: MemoWidgetSettings = {
    memoContent: '',
    memoHeightMode: 'auto',
    fixedHeightPx: 120,
};

/**
 * メモウィジェット
 * - Markdownメモの表示・編集、可変高さ、差分更新UI
 */
export class MemoWidget implements WidgetImplementation {
    id = 'memo';
    private config!: WidgetConfig; // このウィジェットインスタンスが作成されたときのconfig
    private app!: App;
    private plugin!: WidgetBoardPlugin; // WidgetBoardPlugin のインスタンスへの参照
    private widgetEl!: HTMLElement;
    private memoContainerEl!: HTMLElement;
    private memoDisplayEl!: HTMLElement;
    private memoEditContainerEl!: HTMLElement;
    private memoEditAreaEl!: HTMLTextAreaElement;
    private editMemoButtonEl!: HTMLButtonElement;
    private saveMemoButtonEl!: HTMLButtonElement;
    private cancelMemoButtonEl!: HTMLButtonElement;
    private isEditingMemo: boolean = false;
    private currentSettings!: MemoWidgetSettings; // このインスタンスの現在の作業用設定
    private needsRender = false;

    private _memoEditAreaInputListener: (() => void) | null = null;
    private taskObserver: MutationObserver | null = null;
    private observerScheduled = false;

    // ウィジェットインスタンス管理のための静的マップ (前回から)
    private static widgetInstances: Map<string, MemoWidget> = new Map();

    // MemoWidgetクラス内にstaticでバッチresize管理
    private static pendingMemoResizeElements: HTMLTextAreaElement[] = [];
    private static scheduledMemoResize = false;
    /**
     * Batch resize memo textareas using read/write separation to minimise reflows.
     */
    private static scheduleBatchMemoResize(el: HTMLTextAreaElement) {
        if (!MemoWidget.pendingMemoResizeElements.includes(el)) MemoWidget.pendingMemoResizeElements.push(el);
        if (MemoWidget.scheduledMemoResize) return;
        MemoWidget.scheduledMemoResize = true;
        requestAnimationFrame(() => {
            // 1. write: reset heights
            MemoWidget.pendingMemoResizeElements.forEach(el => {
                el.style.height = 'auto';
            });
            // 2. read all heights together
            const heights = MemoWidget.pendingMemoResizeElements.map(el => el.scrollHeight);
            // 3. write final pixel heights
            MemoWidget.pendingMemoResizeElements.forEach((el, i) => {
                el.style.height = heights[i] + 'px';
            });
            MemoWidget.pendingMemoResizeElements.length = 0;
            MemoWidget.scheduledMemoResize = false;
        });
    }

    /**
     * インスタンス初期化
     */
    constructor() {
        this.isEditingMemo = false;
    }

    private async renderMemo(markdownContent?: string) {
        if (!this.memoDisplayEl) {
            // console.log(`[${this.config?.id}] renderMemo: memoDisplayEl is null.`);
            return;
        }
        this.memoDisplayEl.empty();
        const trimmedContent = markdownContent?.trim();

        if (trimmedContent && !this.isEditingMemo) {
            this.memoDisplayEl.style.display = 'block';
            // dataview や tasks コードブロックが含まれる場合はキャッシュを使わずに描画する
            const hasDynamicBlock = /```\s*(dataview|dataviewjs|tasks)/i.test(trimmedContent);
            if (hasDynamicBlock) {
                await renderMarkdownBatch(trimmedContent, this.memoDisplayEl, this.config.id, new Component());
            } else {
                await renderMarkdownBatchWithCache(trimmedContent, this.memoDisplayEl, this.config.id, new Component());
            }
            this.setupTaskEventListeners();
            // --- MermaidブロックをWorkerでSVG化して差し替え ---
            await this.replaceMermaidBlocksWithSVG(this.memoDisplayEl);
        } else if (!this.isEditingMemo) {
            this.memoDisplayEl.style.display = 'none';
        }
    }

    // MermaidブロックをWorkerでSVG化して差し替える
    private async replaceMermaidBlocksWithSVG(container: HTMLElement) {
        const codeBlocks = Array.from(container.querySelectorAll('pre > code.language-mermaid')) as HTMLElement[];
        for (const codeEl of codeBlocks) {
            const pre = codeEl.parentElement;
            if (!pre) continue;
            const code = codeEl.innerText;
            const id = 'mermaid-' + Math.random().toString(36).slice(2, 10);
            // キャッシュ利用
            if (mermaidSvgCache.has(code)) {
                const svg = mermaidSvgCache.get(code)!;
                const wrapper = document.createElement('div');
                const frag = document.createRange().createContextualFragment(svg);
                wrapper.appendChild(frag);
                pre.replaceWith(wrapper);
                continue;
            }
            try {
                const svg = await renderMermaidInWorker(code, id);
                mermaidSvgCache.set(code, svg);
                const wrapper = document.createElement('div');
                const frag = document.createRange().createContextualFragment(svg);
                wrapper.appendChild(frag);
                pre.replaceWith(wrapper);
            } catch (e) {
                // エラー時はそのまま
            }
        }
    }

    private applyContainerHeightStyles() {
        if (!this.memoContainerEl) return;
        const widgetIdLog = `[${this.config?.id || 'MemoWidget'}]`;

        // Reset styles
        this.memoContainerEl.style.height = '';
        this.memoContainerEl.style.minHeight = '';
        this.memoContainerEl.style.maxHeight = '';
        this.memoContainerEl.style.overflowY = 'hidden';

        if (this.memoDisplayEl) {
            this.memoDisplayEl.style.height = '';
            this.memoDisplayEl.style.minHeight = '';
            this.memoDisplayEl.style.maxHeight = 'none'; // Override potential CSS max-height in auto mode
        }
        if (this.memoEditAreaEl) {
            this.memoEditAreaEl.style.height = '';
            this.memoEditAreaEl.style.minHeight = '';
            this.memoEditAreaEl.style.maxHeight = '';
        }
        this.removeMemoEditAreaAutoResizeListener();

        if (this.currentSettings.memoHeightMode === 'fixed') {
            const fixedHeight = Math.max(60, (this.currentSettings.fixedHeightPx || DEFAULT_MEMO_SETTINGS.fixedHeightPx || 120));
            this.memoContainerEl.style.height = `${fixedHeight}px`;
            this.memoContainerEl.style.minHeight = `${fixedHeight}px`;
            this.memoContainerEl.style.maxHeight = `${fixedHeight}px`;
            this.memoContainerEl.style.overflowY = 'hidden';

            if (this.memoDisplayEl && !this.isEditingMemo) {
                this.memoDisplayEl.style.height = '100%';
                this.memoDisplayEl.style.overflowY = 'auto';
            }
            if (this.memoEditContainerEl && this.isEditingMemo) {
                // this.memoEditContainerEl.style.height = '100%'; (flex-grow handles this)
            }
            if (this.memoEditAreaEl && this.isEditingMemo) {
                // this.memoEditAreaEl.style.height = '100%'; // Will be constrained by parent
                // this.memoEditAreaEl.style.resize = 'none'; 
            }
        } else { // 'auto' mode
            this.memoContainerEl.style.height = '';
            this.memoContainerEl.style.minHeight = '80px';
            this.memoContainerEl.style.maxHeight = '';
            this.memoContainerEl.style.overflowY = 'visible';

            if (this.memoDisplayEl && !this.isEditingMemo) {
                this.memoDisplayEl.style.maxHeight = 'none'; // Explicitly remove max-height if set by CSS
                // height is determined by flex-grow and content
            }
            if (this.memoEditAreaEl && this.isEditingMemo) {
                // this.memoEditAreaEl.style.minHeight = '120px'; 
                // this.memoEditAreaEl.style.maxHeight = '600px'; 
                // this.memoEditAreaEl.style.resize = 'vertical'; 
                this.addMemoEditAreaAutoResizeListener();
                requestAnimationFrame(() => {
                    if (this.memoEditAreaEl && this.isEditingMemo) this.memoEditAreaEl.dispatchEvent(new Event('input'));
                });
            }
        }
    }
    
    private addMemoEditAreaAutoResizeListener() {
        if (!this.memoEditAreaEl) return;
        if (this._memoEditAreaInputListener) {
            this.memoEditAreaEl.removeEventListener('input', this._memoEditAreaInputListener);
        }
        this._memoEditAreaInputListener = () => {
            if (!this.memoEditAreaEl) return;
            MemoWidget.scheduleBatchMemoResize(this.memoEditAreaEl);
        };
        this.memoEditAreaEl.addEventListener('input', this._memoEditAreaInputListener);
    }

    private removeMemoEditAreaAutoResizeListener() {
        if (this.memoEditAreaEl && this._memoEditAreaInputListener) {
            this.memoEditAreaEl.removeEventListener('input', this._memoEditAreaInputListener);
            this._memoEditAreaInputListener = null;
        }
    }

    // --- 以下追加: 表示モードでのタスク操作を検知して保存 ---
    private setupTaskEventListeners() {
        if (!this.memoDisplayEl) return;

        const lines = (this.currentSettings.memoContent || '').split(/\r?\n/);
        const checkboxes = Array.from(this.memoDisplayEl.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
        let lineIdx = 0;
        checkboxes.forEach(cb => {
            for (; lineIdx < lines.length; lineIdx++) {
                if (/^\s*[-*]\s+\[[ xX]\]/.test(lines[lineIdx])) {
                    (cb as any).dataset.lineIndex = String(lineIdx);
                    lineIdx++;
                    break;
                }
            }
            cb.addEventListener('change', () => {
                const idx = parseInt((cb as any).dataset.lineIndex || '-1', 10);
                if (idx < 0) return;
                lines[idx] = lines[idx].replace(/\[[ xX]\]/, cb.checked ? '[x]' : '[ ]');
                this.persistMemoContent(lines.join('\n'));
            });
        });

        if (!this.taskObserver) {
            this.taskObserver = new MutationObserver(() => {
                if (this.observerScheduled) return;
                this.observerScheduled = true;
                requestAnimationFrame(() => {
                    this.observerScheduled = false;
                    if (!this.isEditingMemo) {
                        this.setupTaskEventListeners();
                    }
                });
            });
        }

        this.taskObserver.disconnect();
        this.taskObserver.observe(this.memoDisplayEl, { childList: true, subtree: true });
    }

    private async persistMemoContent(newContent: string) {
        if (newContent === this.currentSettings.memoContent) return;
        this.currentSettings.memoContent = newContent;
        if (this.config && this.config.settings) {
            (this.config.settings as MemoWidgetSettings).memoContent = newContent;
        }

        let currentModalBoardId: string | undefined = undefined;
        if (this.plugin.widgetBoardModals) {
            for (const [boardId, modal] of this.plugin.widgetBoardModals.entries()) {
                if (modal.isOpen) {
                    currentModalBoardId = boardId;
                    break;
                }
            }
        }
        if (!currentModalBoardId) return;
        const boardInGlobalSettings = this.plugin.settings.boards.find(b => b.id === currentModalBoardId);
        if (!boardInGlobalSettings) return;
        const widgetInGlobalSettings = boardInGlobalSettings.widgets.find(w => w.id === this.config.id);
        if (!widgetInGlobalSettings) return;
        if (!widgetInGlobalSettings.settings) widgetInGlobalSettings.settings = { ...DEFAULT_MEMO_SETTINGS };
        widgetInGlobalSettings.settings.memoContent = newContent;
        await this.plugin.saveSettings(currentModalBoardId);
        this.updateMemoEditUI();
    }

    /**
     * メモ編集UIを差分更新（値が変化した場合のみDOMを更新）
     */
    private updateMemoEditUI() {
        if (!this.memoDisplayEl || !this.memoEditContainerEl || !this.editMemoButtonEl) {
            console.error(`[${this.config?.id}] updateMemoEditUI: One or more UI elements are null.`);
            return;
        }
        // 差分更新用に前回値を保持
        if (!(this as any)._prevDisplay) (this as any)._prevDisplay = {};
        const prev = (this as any)._prevDisplay;

        const hasMemoContent = this.currentSettings.memoContent && this.currentSettings.memoContent.trim() !== '';
        // 表示/非表示の切り替え
        if (prev.isEditingMemo !== this.isEditingMemo) {
            this.memoDisplayEl.style.display = this.isEditingMemo ? 'none' : (hasMemoContent ? 'block' : 'none');
            this.memoEditContainerEl.style.display = this.isEditingMemo ? 'flex' : 'none';
            this.editMemoButtonEl.style.display = this.isEditingMemo ? 'none' : '';
            prev.isEditingMemo = this.isEditingMemo;
        }
        // メモ内容の差分描画
        if (!this.isEditingMemo && prev.memoContent !== this.currentSettings.memoContent) {
            // container.empty()の代わりに親ごとreplace
            const parent = this.memoDisplayEl.parentElement;
            if (parent) {
                const newDisplayEl = this.memoDisplayEl.cloneNode(false) as HTMLElement;
                parent.replaceChild(newDisplayEl, this.memoDisplayEl);
                this.memoDisplayEl = newDisplayEl;
            }
            const render = () => {
                this.renderMemo(this.currentSettings.memoContent)
                    .then(() => this.applyContainerHeightStyles())
                    .catch(err => {
                        console.error(`[${this.config.id}] Error rendering memo in updateMemoEditUI:`, err);
                        this.applyContainerHeightStyles();
                    });
            };
            if ('requestIdleCallback' in window) {
                const idleRender = (deadline?: IdleDeadline) => {
                    if (deadline && deadline.timeRemaining() < 5 && !deadline.didTimeout) {
                        (window as any).requestIdleCallback(idleRender);
                        return;
                    }
                    render();
                };
                (window as any).requestIdleCallback(idleRender);
            } else {
                setTimeout(render, 0);
            }
            prev.memoContent = this.currentSettings.memoContent;
        }
        // 編集モード時のテキストエリア内容
        if (this.isEditingMemo && this.memoEditAreaEl && prev.editAreaValue !== this.currentSettings.memoContent) {
            this.memoEditAreaEl.value = this.currentSettings.memoContent || '';
            prev.editAreaValue = this.currentSettings.memoContent;
        }
        // 高さ・スタイルの差分適用
        if (prev.memoHeightMode !== this.currentSettings.memoHeightMode || prev.isEditingMemo !== this.isEditingMemo) {
            this.applyContainerHeightStyles();
            prev.memoHeightMode = this.currentSettings.memoHeightMode;
        }
        // フォーカス制御
        if (this.isEditingMemo && this.memoEditAreaEl && document.activeElement !== this.memoEditAreaEl) {
            this.memoEditAreaEl.focus();
            // this.memoEditAreaEl.style.minHeight = '160px'; 
            requestAnimationFrame(() => {
                if (this.memoEditAreaEl) this.memoEditAreaEl.dispatchEvent(new Event('input'));
            });
        }
    }

    private enterMemoEditMode() {
        if (this.taskObserver) {
            this.taskObserver.disconnect();
        }
        this.isEditingMemo = true;
        if(this.memoEditAreaEl) {
            this.memoEditAreaEl.value = this.currentSettings.memoContent || '';
            // this.memoEditAreaEl.style.minHeight = '160px';
            requestAnimationFrame(() => {
                if (this.memoEditAreaEl) this.memoEditAreaEl.dispatchEvent(new Event('input'));
            });
        } else {
            console.warn(`[${this.config.id}] enterMemoEditMode: memoEditAreaEl is null.`);
        }
        this.scheduleRender();
    }

    private async saveMemoChanges() {
        const widgetIdLog = `[${this.config.id} (${this.config.title || 'Memo'})]`;

        if (!this.memoEditAreaEl) {
            console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: memoEditAreaEl is null! Cannot get new content.`);
            this.isEditingMemo = false; 
            this.updateMemoEditUI();
            return;
        }

        const newMemo = this.memoEditAreaEl.value;
        this.isEditingMemo = false; // UIを編集中でなくす

        if (newMemo !== (this.currentSettings.memoContent || '')) {
            debugLog(this.plugin, `${widgetIdLog} SAVE_MEMO_CHANGES: Content WILL change. Old: "${this.currentSettings.memoContent}", New: "${newMemo}"`);
            this.currentSettings.memoContent = newMemo; // 1. インスタンスの作業用設定を更新

            // 2. ★★★ プラグインの永続化データ内の該当ウィジェット設定を「直接」更新 ★★★
            let settingsUpdatedInGlobalStore = false;
            // モーダルが開いていれば、そのボードIDを取得 (これが最も確実なコンテキスト)
            let currentModalBoardId: string | undefined = undefined;
            if (this.plugin.widgetBoardModals) {
                for (const [boardId, modal] of this.plugin.widgetBoardModals.entries()) {
                    if (modal.isOpen) {
                        currentModalBoardId = boardId;
                        break;
                    }
                }
            }

            if (!currentModalBoardId) {
                console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: Critical - currentModalBoardId is not available. Cannot reliably find the board in global settings.`);
                new Notice("エラー: 現在のボードを特定できず、メモを保存できませんでした。", 7000);
                // updateMemoEditUIは最後に呼ぶので、ここではUIは表示モードに戻るが、保存は失敗
                this.updateMemoEditUI();
                return;
            }

            debugLog(this.plugin, `${widgetIdLog} SAVE_MEMO_CHANGES: Targeting board ID '${currentModalBoardId}' in global plugin settings.`);
            const boardInGlobalSettings = this.plugin.settings.boards.find(b => b.id === currentModalBoardId);

            if (boardInGlobalSettings) {
                // console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: Found board '${boardInGlobalSettings.name}' in global settings.`);
                // this.config.id は、このウィジェットインスタンスが作られた時の設定ID (コピー元のIDと同一のはず)
                const widgetInGlobalSettings = boardInGlobalSettings.widgets.find(w => w.id === this.config.id);

                if (widgetInGlobalSettings) {
                    // console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: Found widget '${widgetInGlobalSettings.title}' (ID: ${widgetInGlobalSettings.id}) in global board settings.`);
                    if (!widgetInGlobalSettings.settings) {
                        console.warn(`${widgetIdLog} SAVE_MEMO_CHANGES: widgetInGlobalSettings.settings was undefined. Initializing.`);
                        widgetInGlobalSettings.settings = { ...DEFAULT_MEMO_SETTINGS };
                    }
                    // console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: memoContent in global store (BEFORE update): "${widgetInGlobalSettings.settings.memoContent}"`);
                    widgetInGlobalSettings.settings.memoContent = newMemo; // ★★★ 実際のグローバル設定オブジェクトを更新
                    settingsUpdatedInGlobalStore = true;
                    // console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: memoContent in global store (AFTER update): "${widgetInGlobalSettings.settings.memoContent}"`);
                } else {
                    console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: Widget with ID '${this.config.id}' NOT FOUND in global board settings for board '${boardInGlobalSettings.name}'. This is a critical error if save is expected.`);
                }
            } else {
                console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: Board with ID '${currentModalBoardId}' NOT FOUND in global plugin settings. This is a critical error.`);
            }

            if (settingsUpdatedInGlobalStore) {
                debugLog(this.plugin, `${widgetIdLog} SAVE_MEMO_CHANGES: Calling this.plugin.saveSettings(currentModalBoardId) to persist all changes.`);
                // this.plugin.saveSettings() は this.plugin.settings 全体を保存する
                await this.plugin.saveSettings(currentModalBoardId); 
                // new Notice(`メモ「${this.config.title || '無題'}」を保存しました。`); // 保存成功通知
            } else {
                console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: Did not update global settings store due to lookup failure. Save not fully effective.`);
                new Notice("メモの保存に失敗しました (データ不整合の可能性あり)。", 5000);
            }
        } else {
            // console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: Memo content did not change. No save action taken.`);
        }
        this.updateMemoEditUI(); // UIを（表示モードに）更新
        this.setupTaskEventListeners();
    }

    private cancelMemoEditMode() {
        this.isEditingMemo = false;
        // テキストエリアの内容は破棄され、currentSettings.memoContent (保存済みの値) で再表示される
        this.updateMemoEditUI();
        this.setupTaskEventListeners();
    }

    /**
     * ウィジェットのDOM生成・初期化
     * @param config ウィジェット設定
     * @param app Obsidianアプリ
     * @param plugin プラグイン本体
     */
    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        (this.constructor as typeof MemoWidget).widgetInstances.set(config.id, this);

        this.config = config;
        this.app = app;
        this.plugin = plugin;
        
        // currentSettings は、このウィジェットインスタンスの現在の状態を保持する。
        // create時には、渡されたconfig.settings（ディープコピーされたもの）をベースに初期化。
        this.currentSettings = { ...DEFAULT_MEMO_SETTINGS, ...(config.settings || {}) };
        // インスタンスが保持するconfigオブジェクトのsettingsプロパティも、このcurrentSettingsを指すようにする。
        // ただし、このthis.config.settingsへの変更がグローバル設定に直接反映されるわけではない。
        config.settings = this.currentSettings;

        const { widgetEl, titleEl } = createWidgetContainer(config, 'memo-widget');
        this.widgetEl = widgetEl;
        this.widgetEl.style.display = 'flex';
        this.widgetEl.style.flexDirection = 'column';
        this.widgetEl.style.minHeight = '0'; // flexコンテナ内のアイテムとして縮小できるように
        titleEl && (titleEl.textContent = (this.config.title && this.config.title.trim() !== "") ? this.config.title : "");

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
        // CSS で .widget-content に display:flex, flex-direction:column, flex-grow:1, min-height:0 が設定されている前提
        
        this.memoContainerEl = contentEl.createDiv({ cls: 'memo-widget-container' });
        // CSS で .memo-widget-container に display:flex, flex-direction:column, flex-grow:1, min-height:0 が設定されている前提

        const memoHeaderEl = this.memoContainerEl.createDiv({ cls: 'memo-widget-header' });
        // CSS で .memo-widget-header に flex-shrink:0 が設定されている前提
        
        this.editMemoButtonEl = memoHeaderEl.createEl('button', { cls: 'memo-widget-edit-button' });
        setIcon(this.editMemoButtonEl, 'pencil');
        this.editMemoButtonEl.setAttribute('aria-label', 'メモを編集/追加');
        this.editMemoButtonEl.onClickEvent(() => this.enterMemoEditMode());

        this.memoDisplayEl = this.memoContainerEl.createDiv({ cls: 'memo-widget-display' });
        // CSS で .memo-widget-display に flex-grow:1, overflow-y:auto が設定されている前提

        this.memoEditContainerEl = this.memoContainerEl.createDiv({ cls: 'memo-widget-edit-container' });
        this.memoEditContainerEl.style.display = 'none'; // 初期は非表示
        // CSS で .memo-widget-edit-container に display:flex (JSで制御), flex-direction:column, flex-grow:1 が設定されている前提

        this.memoEditAreaEl = this.memoEditContainerEl.createEl('textarea', { cls: 'memo-widget-edit-area' });
        // CSS で .memo-edit-area に flex-grow:1, width:100% などが設定されている前提
        
        const memoEditControlsEl = this.memoEditContainerEl.createDiv({ cls: 'memo-widget-edit-controls' });
        // CSS で .memo-widget-edit-controls に flex-shrink:0 が設定されている前提

        this.saveMemoButtonEl = memoEditControlsEl.createEl('button', { text: '保存' });
        this.saveMemoButtonEl.addClass('mod-cta');
        this.cancelMemoButtonEl = memoEditControlsEl.createEl('button', { text: 'キャンセル' });

        this.saveMemoButtonEl.onClickEvent(() => this.saveMemoChanges());
        this.cancelMemoButtonEl.onClickEvent(() => this.cancelMemoEditMode());

        this.isEditingMemo = false;
        this.scheduleRender(); // 初期UI状態設定（これがrenderMemoとapplyContainerHeightStylesを呼ぶ）
        
        // 追加: YAMLで大きさ指定があれば反映
        applyWidgetSize(this.widgetEl, config.settings);

        return this.widgetEl;
    }

    /**
     * 外部から設定変更を受けて状態・UIを更新
     * @param newSettings 新しい設定
     * @param widgetId 対象ウィジェットID
     */
    public async updateExternalSettings(newSettings: Partial<MemoWidgetSettings>, widgetId?: string) {
        if (widgetId && this.config?.id !== widgetId) return;
        const widgetIdLog = `[${this.config.id}]`;
        // console.log(`${widgetIdLog} UPDATE_EXTERNAL_SETTINGS: Received new settings:`, JSON.parse(JSON.stringify(newSettings)));
        // console.log(`${widgetIdLog} UPDATE_EXTERNAL_SETTINGS: Current settings BEFORE merge:`, JSON.parse(JSON.stringify(this.currentSettings)));

        // インスタンスの作業用設定(currentSettings)を更新
        this.currentSettings = { ...this.currentSettings, ...newSettings };
        
        // インスタンスが保持しているconfigオブジェクトのsettingsプロパティも同期 (主にcreateで同じ参照になっているため)
        // これは、このウィジェットインスタンスが再利用される場合に、config経由で最新の設定を参照できるようにするため。
        // ただし、このconfig自体がグローバル設定のコピーである点に注意。
        if (this.config && this.config.settings) {
            Object.assign(this.config.settings, this.currentSettings);
        } else if (this.config) {
            this.config.settings = { ...this.currentSettings };
        }
        // console.log(`${widgetIdLog} UPDATE_EXTERNAL_SETTINGS: Merged currentSettings AFTER merge:`, JSON.parse(JSON.stringify(this.currentSettings)));

        this.updateMemoEditUI(); // UIに新しい設定を反映
        this.setupTaskEventListeners();

        // ★重要: updateExternalSettings は、通常 plugin.saveSettings() が呼び出された結果としてモーダル更新のために呼び出される。
        // ここで再度 plugin.saveSettings() を呼ぶと無限ループや予期せぬ動作の原因になる。
        // 設定の永続化は、ユーザーが設定タブで操作した際や、ウィジェット内で「保存」アクションを行った際に行うべき。
    }

    /**
     * ウィジェット破棄時のクリーンアップ
     */
    onunload(): void {
        const widgetIdLog = `[${this.config?.id || 'MemoWidget'}]`;
        // console.log(`${widgetIdLog} onunload: Removing instance from static map.`);
        this.removeMemoEditAreaAutoResizeListener();
        if (this.taskObserver) {
            this.taskObserver.disconnect();
            this.taskObserver = null;
        }
        // 追加: メモ編集エリアのinputリスナーを確実に解除
        if (this.memoEditAreaEl && this._memoEditAreaInputListener) {
            this.memoEditAreaEl.removeEventListener('input', this._memoEditAreaInputListener);
            this._memoEditAreaInputListener = null;
        }
        (this.constructor as typeof MemoWidget).widgetInstances.delete(this.config.id);
        this.isEditingMemo = false;
    }
    
    // 静的メソッド
    public static removePersistentInstance(widgetId: string, plugin: WidgetBoardPlugin): void {
        const instance = MemoWidget.widgetInstances.get(widgetId);
        if (instance) {
            // instance.onunload(); // 必要に応じてインスタンス固有のクリーンアップを呼ぶことも検討
            MemoWidget.widgetInstances.delete(widgetId);
        }
        // console.log(`[${widgetId}] Static removePersistentInstance for MemoWidget (map size: ${MemoWidget.widgetInstances.size})`);
    }

    /**
     * すべてのインスタンスをクリーンアップ
     * @param plugin プラグイン本体
     */
    public static cleanupAllPersistentInstances(plugin: WidgetBoardPlugin): void {
        this.widgetInstances.forEach(instance => {
            if (typeof instance.onunload === 'function') {
                instance.onunload();
            }
        });
        this.widgetInstances.clear();
    }

    private scheduleRender() {
        if (this.needsRender) return;
        this.needsRender = true;
        requestAnimationFrame(() => {
            this.updateMemoEditUI();
            this.needsRender = false;
        });
    }
}