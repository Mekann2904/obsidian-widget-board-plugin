// src/main.ts
import { Plugin, Notice, Modal as ObsidianModal, Hotkey, Modifier } from 'obsidian';
import type { PluginGlobalSettings, BoardConfiguration, WidgetConfig } from './interfaces';
import { DEFAULT_PLUGIN_SETTINGS, DEFAULT_BOARD_CONFIGURATION } from './settingsDefaults';
import { WidgetBoardModal } from './modal';
import { WidgetBoardSettingTab } from './settingsTab';
import { registeredWidgetImplementations } from './widgetRegistry';
import { DEFAULT_POMODORO_SETTINGS } from './widgets/pomodoro';
import { DEFAULT_MEMO_SETTINGS } from './widgets/memo';
import { DEFAULT_CALENDAR_SETTINGS } from './settingsDefaults';
import { DEFAULT_TIMER_STOPWATCH_SETTINGS } from './widgets/timer-stopwatch';
import cloneDeep from 'lodash.clonedeep';
import { LLMManager } from './llm/llmManager';
import { GeminiProvider } from './llm/gemini/geminiApi';
import yaml from 'js-yaml';
import { TweetRepository } from './widgets/tweetWidget/TweetRepository';
import { renderMarkdownBatchWithCache } from './utils/renderMarkdownBatch';
import { debugLog } from './utils/logger';
import { Component, TFile } from 'obsidian';
import { preloadChartJS } from './widgets/reflectionWidget/reflectionWidgetUI';

/**
 * Obsidian Widget Board Pluginのメインクラス
 * - ウィジェットボードの管理・設定・コマンド登録などを担当
 */
export default class WidgetBoardPlugin extends Plugin {
    /** プラグイン全体の設定 */
    settings: PluginGlobalSettings;
    /** 開いているウィジェットボードのモーダル管理 */
    widgetBoardModals: Map<string, WidgetBoardModal> = new Map();
    private isSaving: boolean = false;
    private registeredGroupCommandIds: string[] = [];
    llmManager: LLMManager;

    /**
     * プラグインの初期化処理
     * @override
     */
    async onload(): Promise<void> {
        debugLog(this, 'Widget Board Plugin: Loading...');
        this.llmManager = new LLMManager();
        this.llmManager.register(GeminiProvider);
        // Preload Chart.js for ReflectionWidget without blocking startup
        setTimeout(() => preloadChartJS().catch(() => {}), 0);
        await this.loadSettings();
        this.registerAllBoardCommands();
        this.addRibbonIcon('layout-dashboard', 'ウィジェットボードを開く', () => this.openBoardPicker());
        this.addSettingTab(new WidgetBoardSettingTab(this.app, this));
        // すべてのボードをトグルで非表示/表示するコマンドを追加
        this.addCommand({
            id: 'hide-all-widget-boards',
            name: 'すべてのウィジェットボードを非表示',
            callback: () => this.hideAllBoards()
        });
        // widget-boardコードブロックプロセッサ登録
        this.registerMarkdownCodeBlockProcessor(
            'widget-board',
            async (source, element, context) => {
                let config: any;
                try {
                    config = yaml.load(source);
                } catch (e) {
                    element.createEl('pre', { text: `YAMLパースエラー: ${String(e)}` });
                    return;
                }
                if (!config || typeof config !== 'object' || !config.type) {
                    element.createEl('pre', { text: 'ウィジェット設定が不正です。typeフィールドが必要です。' });
                    return;
                }
                // id, titleがなければ自動生成
                if (!config.id) config.id = `md-widget-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
                if (!config.title) config.title = config.type;
                // settingsがなければグローバル設定から補完
                if (!config.settings) {
                    config.settings = {};
                    // typeごとにグローバル設定値を補完
                    if (config.type === 'pomodoro') {
                        config.settings = {
                            ...DEFAULT_POMODORO_SETTINGS,
                            pomodoroNotificationSound: this.settings.pomodoroNotificationSound,
                            pomodoroNotificationVolume: this.settings.pomodoroNotificationVolume,
                            pomodoroExportFormat: this.settings.pomodoroExportFormat,
                            ...config.settings
                        };
                    } else if (config.type === 'timer-stopwatch') {
                        config.settings = {
                            ...DEFAULT_TIMER_STOPWATCH_SETTINGS,
                            timerStopwatchNotificationSound: this.settings.timerStopwatchNotificationSound,
                            timerStopwatchNotificationVolume: this.settings.timerStopwatchNotificationVolume,
                            ...config.settings
                        };
                    } else if (config.type === 'tweet-widget') {
                        config.settings = {
                            ...this.settings.tweetWidgetAvatarUrl ? { avatarUrl: this.settings.tweetWidgetAvatarUrl } : {},
                            ...config.settings
                        };
                    } else if (config.type === 'reflection-widget') {
                        config.settings = {
                            ...config.settings
                        };
                    }
                }
                // typeに対応するWidgetImplementationを呼び出し
                const WidgetClass = registeredWidgetImplementations.get(config.type);
                if (!WidgetClass) {
                    element.createEl('pre', { text: `未対応のウィジェットタイプ: ${config.type}` });
                    return;
                }
                try {
                    const widgetInstance = new WidgetClass();
                    const widgetEl = widgetInstance.create(config, this.app, this);
                    element.appendChild(widgetEl);
                } catch (e) {
                    element.createEl('pre', { text: `ウィジェット描画エラー: ${String(e)}` });
                }
            }
        );
        // プリウォーム処理を追加
        this.prewarmAllWidgetMarkdownCache();
        debugLog(this, 'Widget Board Plugin: Loaded.');
    }

    /**
     * プラグインのアンロード時処理
     * @override
     */
    onunload(): void {
        this.widgetBoardModals.forEach(modal => {
            if (modal.isOpen) modal.close();
        });
        this.widgetBoardModals.clear();
        debugLog(this, 'Widget Board Plugin: Unloaded.');
    }

    /**
     * ボード選択モーダルを表示
     */
    openBoardPicker(): void {
        if (this.settings.boards.length === 0) {
            new Notice('設定されているウィジェットボードがありません。設定画面から作成してください。');
            return;
        }
        if (this.settings.boards.length === 1) {
            this.openWidgetBoardById(this.settings.boards[0].id);
            return;
        }
        const modal = new BoardPickerModal(this.app, this.settings.boards, (boardId) => {
            this.openWidgetBoardById(boardId);
        });
        modal.open();
    }

    /**
     * 指定IDのウィジェットボードを開く
     * @param boardId ボードID
     */
    openWidgetBoardById(boardId: string): void {
        const modal = this.widgetBoardModals.get(boardId);
        if (modal) {
            if (modal.isOpen || modal.isClosing) {
                // 既に開いている、または閉じるアニメーション中なら何もしない
                return;
            } else {
                // isOpen=false だがMapに残っている場合は削除
                this.widgetBoardModals.delete(boardId);
                if (modal.modalEl && modal.modalEl.parentElement === document.body) {
                    modal.modalEl.parentElement.removeChild(modal.modalEl);
                }
            }
        }
        const boardConfig = this.settings.boards.find(b => b.id === boardId);
        if (!boardConfig) {
            new Notice(`ID '${boardId}' のウィジェットボードが見つかりません。`);
            return;
        }
        const validModes = Object.values(WidgetBoardModal.MODES);
        if (!validModes.includes(boardConfig.defaultMode as any)) {
            boardConfig.defaultMode = WidgetBoardModal.MODES.RIGHT_THIRD;
        }
        // lastOpenedBoardIdやsaveSettingsは明示的な設定変更時のみ更新
        const newModal = new WidgetBoardModal(this.app, this, boardConfig);
        this.widgetBoardModals.set(boardId, newModal);
        // モーダルが閉じられたらMapから削除
        const origOnClose = newModal.onClose.bind(newModal);
        newModal.onClose = () => {
            this.widgetBoardModals.delete(boardId);
            origOnClose();
        };
        newModal.open();
    }

    /**
     * 指定IDのウィジェットボードをトグル表示
     * @param boardId ボードID
     */
    toggleWidgetBoardById(boardId: string): void {
        const modal = this.widgetBoardModals.get(boardId);
        if (modal && modal.isOpen) {
            modal.close(); // このモーダルだけ閉じる
            return;
        }
        this.openWidgetBoardById(boardId); // このモーダルだけ開く
    }

    /**
     * 設定をロード（旧形式からのマイグレーションも対応）
     */
    async loadSettings(): Promise<void> {
        const loadedData = await this.loadData();
        if (loadedData && !loadedData.boards && loadedData.widgets) {
            // 旧形式からのマイグレーション
            const oldBoard: BoardConfiguration = {
                id: DEFAULT_BOARD_CONFIGURATION.id,
                name: 'マイウィジェットボード (旧設定)',
                defaultMode: loadedData.defaultMode || DEFAULT_BOARD_CONFIGURATION.defaultMode,
                widgets: loadedData.widgets || []
            };
            this.settings = {
                boards: [oldBoard],
                lastOpenedBoardId: oldBoard.id,
                defaultBoardIdForQuickOpen: oldBoard.id
            };
        } else if (loadedData && loadedData.boards) {
            this.settings = Object.assign({}, DEFAULT_PLUGIN_SETTINGS, loadedData);
        } else {
            this.settings = cloneDeep(DEFAULT_PLUGIN_SETTINGS);
        }
        if (!this.settings.boards || !Array.isArray(this.settings.boards)) {
            this.settings.boards = [cloneDeep(DEFAULT_BOARD_CONFIGURATION)];
        }
        if (this.settings.boards.length === 0) {
            this.settings.boards.push(cloneDeep(DEFAULT_BOARD_CONFIGURATION));
        }
        this.settings.boards.forEach(board => {
            if (!board.widgets || !Array.isArray(board.widgets)) {
                board.widgets = [];
            }
            board.widgets.forEach((widget: WidgetConfig) => {
                if (widget.type === 'pomodoro') {
                    widget.settings = { ...DEFAULT_POMODORO_SETTINGS, ...(widget.settings || {}) };
                } else if (widget.type === 'memo') {
                    widget.settings = { ...DEFAULT_MEMO_SETTINGS, ...(widget.settings || {}) };
                } else if (widget.type === 'calendar') {
                    widget.settings = { ...DEFAULT_CALENDAR_SETTINGS, ...(widget.settings || {}) };
                }
            });
        });
    }

    /**
     * 設定を保存し、必要に応じてモーダルの内容も更新
     * @param targetBoardId 更新対象ボードID（省略可）
     */
    async saveSettings(targetBoardId?: string): Promise<void> {
        if (this.isSaving) return;
        this.isSaving = true;
        try {
            await this.saveData(this.settings);
            if (targetBoardId) {
                const modal = this.widgetBoardModals.get(targetBoardId);
                if (modal && modal.isOpen && modal.currentBoardConfig) {
                    const updatedBoardConfig = this.settings.boards.find(b => b.id === targetBoardId);
                    if (updatedBoardConfig) {
                        modal.updateBoardConfiguration(updatedBoardConfig);
                    } else {
                        modal.close();
                    }
                }
            } else {
                // 引数なしの場合は従来通り全モーダル更新
                this.widgetBoardModals.forEach(modal => {
                    if (modal.isOpen && modal.currentBoardConfig) {
                        const currentBoardId = modal.currentBoardConfig.id;
                        const updatedBoardConfig = this.settings.boards.find(b => b.id === currentBoardId);
                        if (updatedBoardConfig) {
                            modal.updateBoardConfiguration(updatedBoardConfig);
                        } else {
                            modal.close();
                        }
                    }
                });
            }
        } finally {
            this.isSaving = false;
        }
    }

    /**
     * すべてのボード・グループコマンドを再登録
     */
    registerAllBoardCommands(): void {
        // 既存のグループコマンドを一旦解除
        if ((this.app as any).commands && typeof (this.app as any).commands.removeCommand === 'function') {
            this.registeredGroupCommandIds.forEach(id => {
                (this.app as any).commands.removeCommand(id);
            });
        }
        this.registeredGroupCommandIds = [];
        // ボードごとにコマンドを動的登録
        this.settings.boards.map(board =>
            this.addCommand({
                id: `toggle-widget-board-${board.id}`,
                name: `ウィジェットボードをトグル: ${board.name}`,
                callback: () => this.toggleWidgetBoardById(board.id)
            })
        );
        // ボードグループごとにコマンドを動的登録
        (this.settings.boardGroups || []).forEach(group => {
            let hotkeys: Hotkey[] = [];
            if (group.hotkey) {
                const parts = group.hotkey.split('+');
                if (parts.length > 1) {
                    hotkeys = [{ modifiers: parts.slice(0, -1) as Modifier[], key: parts[parts.length - 1] }];
                } else {
                    hotkeys = [{ modifiers: [], key: group.hotkey }];
                }
            }
            const cmdId = `open-board-group-${group.id}`;
            this.addCommand({
                id: cmdId,
                name: `ボードグループをトグル: ${group.name}`,
                hotkeys,
                callback: () => {
                    const anyOpen = (group.boardIds || []).some(boardId => {
                        const modal = this.widgetBoardModals.get(boardId);
                        return modal && modal.isOpen;
                    });
                    if (anyOpen) {
                        (group.boardIds || []).filter(boardId => {
                            const modal = this.widgetBoardModals.get(boardId);
                            return modal && modal.isOpen;
                        }).forEach(boardId => {
                            const modal = this.widgetBoardModals.get(boardId);
                            if (modal) modal.close();
                        });
                    } else {
                        (group.boardIds || []).forEach(boardId => {
                            this.openWidgetBoardById(boardId);
                        });
                    }
                }
            });
            this.registeredGroupCommandIds.push(cmdId);
        });
    }

    /**
     * すべてのウィジェットボードを非表示にする
     */
    hideAllBoards(): void {
        this.widgetBoardModals.forEach(modal => {
            if (modal.isOpen) modal.close();
        });
    }

    /**
     * すべてのウィジェットのMarkdownをプリウォームしてキャッシュを作成
     */
    private async prewarmAllWidgetMarkdownCache() {
        try {
            new Notice('キャッシュ中…');
            // --- TweetWidget ---
            const dbPath = this.settings.baseFolder
                ? `${this.settings.baseFolder.replace(/\/$/, '')}/tweets.json`
                : 'tweets.json';
            const repo = new TweetRepository(this.app, dbPath);
            const tweetSettings = await repo.load();
            const tweetPosts = tweetSettings.posts || [];

            // --- MemoWidget, FileViewWidget ---
            const memoContents: string[] = [];
            const fileViewFiles: string[] = [];
            for (const board of this.settings.boards) {
                for (const widget of board.widgets) {
                    if (widget.type === 'memo' && widget.settings?.memoContent) {
                        // 今後ファイルや外部データ参照があればここで取得してpushする
                        memoContents.push(widget.settings.memoContent);
                    }
                    if (widget.type === 'file-view-widget' && widget.settings?.fileName) {
                        fileViewFiles.push(widget.settings.fileName);
                    }
                }
            }

            // --- ReflectionWidget: AI要約（今日・今週） ---
            async function loadReflectionSummary(type: 'today' | 'week', dateKey: string, app: any): Promise<string | null> {
                const path = 'data.json';
                try {
                    const raw = await app.vault.adapter.read(path);
                    const data = JSON.parse(raw);
                    if (data.reflectionSummaries && data.reflectionSummaries[type]?.date === dateKey) {
                        return data.reflectionSummaries[type].summary;
                    }
                } catch {}
                return null;
            }
            const todayKey = (new Date()).toISOString().slice(0, 10);
            const now = new Date();
            const day = now.getDay();
            const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - day));
            const weekKey = weekEnd.toISOString().slice(0, 10);
            const todaySummary = await loadReflectionSummary('today', todayKey, this.app);
            const weekSummary = await loadReflectionSummary('week', weekKey, this.app);

            // プリウォーム対象をまとめてバッチ処理
            let tweetIndex = 0, memoIndex = 0, fileIndex = 0;
            let reflectionIndex = 0;
            const reflectionSummaries = [todaySummary, weekSummary].filter(Boolean) as string[];
            const batchSize = 3;
            const schedule = (cb: () => void) => {
                if (typeof (window as any).requestIdleCallback === 'function') {
                    (window as any).requestIdleCallback(cb);
                } else {
                    requestAnimationFrame(cb);
                }
            };
            const processBatch = async () => {
                // TweetWidget
                const tweetEnd = Math.min(tweetIndex + batchSize, tweetPosts.length);
                for (; tweetIndex < tweetEnd; tweetIndex++) {
                    const post = tweetPosts[tweetIndex];
                    await renderMarkdownBatchWithCache(post.text, document.createElement('div'), '', new Component());
                }
                // MemoWidget
                const memoEnd = Math.min(memoIndex + batchSize, memoContents.length);
                for (; memoIndex < memoEnd; memoIndex++) {
                    await renderMarkdownBatchWithCache(memoContents[memoIndex], document.createElement('div'), '', new Component());
                }
                // FileViewWidget
                const fileEnd = Math.min(fileIndex + batchSize, fileViewFiles.length);
                for (; fileIndex < fileEnd; fileIndex++) {
                    const file = this.app.vault.getAbstractFileByPath(fileViewFiles[fileIndex]);
                    if (file && file instanceof TFile) {
                        const content = await this.app.vault.read(file);
                        await renderMarkdownBatchWithCache(content, document.createElement('div'), file.path, new Component());
                    }
                }
                // ReflectionWidget AI要約
                const reflectionEnd = Math.min(reflectionIndex + batchSize, reflectionSummaries.length);
                for (; reflectionIndex < reflectionEnd; reflectionIndex++) {
                    await renderMarkdownBatchWithCache(reflectionSummaries[reflectionIndex], document.createElement('div'), '', new Component());
                }
                if (
                    tweetIndex < tweetPosts.length ||
                    memoIndex < memoContents.length ||
                    fileIndex < fileViewFiles.length ||
                    reflectionIndex < reflectionSummaries.length
                ) {
                    schedule(processBatch);
                } else {
                    new Notice('キャッシュ完了');
                }
            };
            schedule(processBatch);
        } catch (e) {
            console.error('プリウォーム中にエラー:', e);
        }
    }
}

class BoardPickerModal extends ObsidianModal {
    constructor(
        app: any,
        private boards: BoardConfiguration[],
        private onChoose: (boardId: string) => void
    ) {
        super(app);
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'ウィジェットボードを選択' });
        const listEl = contentEl.createDiv({ cls: 'widget-board-picker-list' });
        this.boards.forEach(board => {
            const boardItemEl = listEl.createDiv({ cls: 'widget-board-picker-item' });
            boardItemEl.setText(board.name);
            boardItemEl.onClickEvent(() => {
                this.onChoose(board.id);
                this.close();
            });
        });
    }
    onClose() {
        this.contentEl.empty();
    }
}