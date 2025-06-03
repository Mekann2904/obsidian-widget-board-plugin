// src/main.ts
import { Plugin, Notice, Modal as ObsidianModal, Hotkey, Modifier } from 'obsidian';
import type { PluginGlobalSettings, BoardConfiguration, WidgetConfig } from './interfaces';
import { DEFAULT_PLUGIN_SETTINGS, DEFAULT_BOARD_CONFIGURATION } from './settingsDefaults';
import { WidgetBoardModal } from './modal';
import { WidgetBoardSettingTab } from './settingsTab';
import { registeredWidgetImplementations } from './widgetRegistry';
import { DEFAULT_POMODORO_SETTINGS } from './widgets/pomodoroWidget';
import { DEFAULT_MEMO_SETTINGS } from './widgets/memoWidget';
import { DEFAULT_CALENDAR_SETTINGS } from './widgets/calendarWidget';
import cloneDeep from 'lodash.clonedeep';
import { LLMManager } from './llm/llmManager';
import { GeminiProvider } from './llm/gemini/geminiApi';

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
        console.log('Widget Board Plugin: Loading...');
        this.llmManager = new LLMManager();
        this.llmManager.register(GeminiProvider);
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
        console.log('Widget Board Plugin: Loaded.');
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
        console.log('Widget Board Plugin: Unloaded.');
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
                    document.body.removeChild(modal.modalEl);
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