// src/main.ts
import { Plugin } from 'obsidian';
import type { PluginGlobalSettings, BoardConfiguration, WidgetConfig } from './interfaces';
import { DEFAULT_PLUGIN_SETTINGS, DEFAULT_BOARD_CONFIGURATION } from './settingsDefaults';
import { WidgetBoardSettingTab } from './settingsTab';
import { registeredWidgetImplementations } from './widgetRegistry';
import {
    DEFAULT_POMODORO_SETTINGS,
    DEFAULT_MEMO_SETTINGS,
    DEFAULT_CALENDAR_SETTINGS,
    DEFAULT_TIMER_STOPWATCH_SETTINGS,
} from './settings/defaultWidgetSettings';
import type { PomodoroSettings } from './widgets/pomodoro';
import type { TimerStopwatchWidgetSettings } from './widgets/timer-stopwatch';
import cloneDeep from 'lodash.clonedeep';
import { LLMManager } from './llm/llmManager';
import { GeminiProvider } from './llm/gemini/geminiApi';
import yaml from 'js-yaml';
import { debugLog } from './utils/logger';
import { filterConsoleWarn } from './utils/consoleWarnFilter';
import { preloadChartJS } from './widgets/reflectionWidget/reflectionWidgetUI';
import { TweetWidgetSettings } from './widgets/tweetWidget/types';
import { ReflectionWidgetSettings } from './widgets/reflectionWidget/reflectionWidgetTypes';
import { BoardManager } from './boardManager';
import { PrewarmManager } from './prewarm';
import { t, StringKey } from './i18n';

/**
 * Obsidian Widget Board Pluginのメインクラス
 * - ウィジェットボードの管理・設定・コマンド登録などを担当
 */
export default class WidgetBoardPlugin extends Plugin {
    /** プラグイン全体の設定 */
    settings: PluginGlobalSettings;
    /** ボード管理 */
    boardManager: BoardManager;
    /** プリウォーム・統計管理 */
    prewarmManager: PrewarmManager;
    private isSaving: boolean = false;
    llmManager: LLMManager;
    tweetChartDirty: boolean = true;
    tweetChartImageData: string | null = null;
    tweetChartCountsKey: string | null = null;

    /**
     * プラグインの初期化処理
     * @override
     */
    async onload(): Promise<void> {
        debugLog(this, 'Widget Board Plugin: Loading...');
        filterConsoleWarn(['[Violation]', '[Deprecation]']);
        this.llmManager = new LLMManager(this);
        this.llmManager.register(GeminiProvider);
        this.boardManager = new BoardManager(this);
        this.prewarmManager = new PrewarmManager(this);
        // Preload Chart.js for ReflectionWidget without blocking startup
        setTimeout(() => preloadChartJS().catch(() => {}), 0);
        await this.loadSettings();
        await this.prewarmManager.initTweetPostCountCache();
        this.boardManager.registerAllBoardCommands();
        this.addRibbonIcon('layout-dashboard', this.t('openWidgetBoard'), () => this.openBoardPicker());
        this.addSettingTab(new WidgetBoardSettingTab(this.app, this));
        // すべてのボードをトグルで非表示/表示するコマンドを追加
        this.addCommand({
            id: 'hide-all-widget-boards',
            name: this.t('hideAllWidgetBoards'),
            callback: () => this.hideAllBoards()
        });
        // widget-boardコードブロックプロセッサ登録
        this.registerMarkdownCodeBlockProcessor(
            'widget-board',
            async (source, element) => {
                let config: WidgetConfig | undefined;
                try {
                    config = yaml.load(source);
                } catch (e) {
                    element.createEl('pre', { text: this.t('yamlParseError', { error: String(e) }) });
                    return;
                }
                if (!config || typeof config !== 'object' || !config.type) {
                    element.createEl('pre', { text: this.t('invalidWidgetConfig') });
                    return;
                }
                // id, titleがなければ自動生成
                if (!config.id) config.id = `md-widget-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
                if (!config.title) config.title = config.type;
                // settingsがなければグローバル設定から補完
                if (!config.settings) {
                    config.settings = {};
                }
                // typeごとにグローバル設定値を補完
                if (config.type === 'pomodoro') {
                    config.settings = {
                        ...DEFAULT_POMODORO_SETTINGS,
                        pomodoroNotificationSound: this.settings.pomodoroNotificationSound,
                        pomodoroNotificationVolume: this.settings.pomodoroNotificationVolume,
                        pomodoroExportFormat: this.settings.pomodoroExportFormat,
                        ...(config.settings as Partial<PomodoroSettings>),
                    };
                } else if (config.type === 'timer-stopwatch') {
                    config.settings = {
                        ...DEFAULT_TIMER_STOPWATCH_SETTINGS,
                        timerStopwatchNotificationSound: this.settings.timerStopwatchNotificationSound,
                        timerStopwatchNotificationVolume: this.settings.timerStopwatchNotificationVolume,
                        ...(config.settings as Partial<TimerStopwatchWidgetSettings>),
                    };
                } else if (config.type === 'tweet-widget') {
                    config.settings = {
                        ...(this.settings.tweetWidgetAvatarUrl ? { avatarUrl: this.settings.tweetWidgetAvatarUrl } : {}),
                        ...(config.settings as Partial<TweetWidgetSettings>),
                    };
                } else if (config.type === 'reflection-widget') {
                    config.settings = {
                        ...(config.settings as Partial<ReflectionWidgetSettings>),
                    };
                }
                // typeに対応するWidgetImplementationを呼び出し
                const WidgetClass = registeredWidgetImplementations.get(config.type);
                if (!WidgetClass) {
                    element.createEl('pre', { text: this.t('unsupportedWidgetType', { type: config.type }) });
                    return;
                }
                try {
                    const widgetInstance = new WidgetClass();
                    const widgetEl = await widgetInstance.create(config, this.app, this);
                    element.appendChild(widgetEl);
                } catch (e) {
                    element.createEl('pre', { text: this.t('widgetRenderError', { error: String(e) }) });
                }
            }
        );
        // プリウォーム処理を追加
        this.prewarmManager.prewarmAllWidgetMarkdownCache();
        debugLog(this, 'Widget Board Plugin: Loaded.');
    }

    /**
     * プラグインのアンロード時処理
     * @override
     */
    onunload(): void {
        this.boardManager.hideAllBoards();
        this.boardManager.widgetBoardModals.clear();
        debugLog(this, 'Widget Board Plugin: Unloaded.');
    }

    openBoardPicker(): void {
        this.boardManager.openBoardPicker();
    }

    openWidgetBoardById(boardId: string): void {
        this.boardManager.openWidgetBoardById(boardId);
    }

    toggleWidgetBoardById(boardId: string): void {
        this.boardManager.toggleWidgetBoardById(boardId);
    }

    closeWidgetBoardById(boardId: string): void {
        this.boardManager.closeWidgetBoardById(boardId);
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
                name: this.t('migratedBoardName'),
                defaultMode: loadedData.defaultMode || DEFAULT_BOARD_CONFIGURATION.defaultMode,
                widgets: loadedData.widgets || [],
                viewMode: 'center'
            };
            this.settings = {
                boards: [oldBoard],
                lastOpenedBoardId: oldBoard.id,
                defaultBoardIdForQuickOpen: oldBoard.id,
                boardGroups: []
            };
        } else if (loadedData && loadedData.boards) {
            this.settings = Object.assign({}, DEFAULT_PLUGIN_SETTINGS, loadedData);
        } else {
            this.settings = cloneDeep(DEFAULT_PLUGIN_SETTINGS);
        }
        if (this.settings.weekStartDay === undefined) {
            this.settings.weekStartDay = DEFAULT_PLUGIN_SETTINGS.weekStartDay;
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
                } else if (widget.type === 'timer-stopwatch') {
                    widget.settings = { ...DEFAULT_TIMER_STOPWATCH_SETTINGS, ...(widget.settings || {}) };
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
                const modal = this.boardManager.widgetBoardModals.get(targetBoardId);
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
                this.boardManager.widgetBoardModals.forEach(modal => {
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
        this.boardManager.registerAllBoardCommands();
    }

    hideAllBoards(): void {
        this.boardManager.hideAllBoards();
    }

    private async initTweetPostCountCache() {
        await this.prewarmManager.initTweetPostCountCache();
    }

    public updateTweetPostCount(created: number, delta: number) {
        this.prewarmManager.updateTweetPostCount(created, delta);
    }

    public getTweetPostCounts(days: string[]): number[] {
        return this.prewarmManager.getTweetPostCounts(days);
    }

    private async prewarmAllWidgetMarkdownCache() {
        await this.prewarmManager.prewarmAllWidgetMarkdownCache();
    }

    private t(key: StringKey, vars?: Record<string, string | number>): string {
        return t(this.settings.language || 'ja', key, vars);
    }
}