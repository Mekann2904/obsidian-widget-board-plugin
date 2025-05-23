// src/main.ts
import { Plugin, Notice, Modal as ObsidianModal } from 'obsidian';
import type { PluginGlobalSettings, BoardConfiguration, WidgetConfig } from './interfaces';
import { DEFAULT_PLUGIN_SETTINGS, DEFAULT_BOARD_CONFIGURATION } from './settingsDefaults';
import { WidgetBoardModal } from './modal';
import { WidgetBoardSettingTab } from './settingsTab';
import { registeredWidgetImplementations } from './widgetRegistry';
import { DEFAULT_POMODORO_SETTINGS } from './widgets/pomodoroWidget';
import { DEFAULT_MEMO_SETTINGS } from './widgets/memoWidget';
import { DEFAULT_CALENDAR_SETTINGS } from './widgets/calendarWidget';

export default class WidgetBoardPlugin extends Plugin {
    settings: PluginGlobalSettings;
    widgetBoardModals: Map<string, WidgetBoardModal> = new Map();
    private isSaving: boolean = false;

    async onload() {
        console.log('Widget Board Plugin: Loading...');
        await this.loadSettings();

        // ボードごとにコマンドを動的登録
        this.settings.boards.forEach(board => {
            // トグルコマンドのみ追加
            this.addCommand({
                id: `toggle-widget-board-${board.id}`,
                name: `ウィジェットボードをトグル: ${board.name}`,
                callback: () => this.toggleWidgetBoardById(board.id)
            });
        });

        this.addRibbonIcon('layout-dashboard', 'ウィジェットボードを開く', () => this.openBoardPicker());
        this.addSettingTab(new WidgetBoardSettingTab(this.app, this));
        console.log('Widget Board Plugin: Loaded.');
    }

    onunload() {
        this.widgetBoardModals.forEach(modal => {
            if (modal.isOpen) modal.close();
        });
        this.widgetBoardModals.clear();
        console.log('Widget Board Plugin: Unloaded.');
    }

    openBoardPicker() {
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

    openWidgetBoardById(boardId: string) {
        {
            const modal = this.widgetBoardModals.get(boardId);
            if (modal) {
                if (modal.isOpen || modal.isClosing) {
                    // 既に開いている、または閉じるアニメーション中なら何もしない
                    return;
                } else {
                    // isOpen=false だがMapに残っている場合は削除
                    this.widgetBoardModals.delete(boardId);
                    // 古いモーダルのDOMが残っていれば即座に削除
                    if (modal.modalEl && modal.modalEl.parentElement === document.body) {
                        document.body.removeChild(modal.modalEl);
                    }
                }
            }
        }
        const boardConfig = this.settings.boards.find(b => b.id === boardId);
        if (!boardConfig) {
            new Notice(`ID '${boardId}' のウィジェットボードが見つかりません。`);
            if (this.settings.boards.length > 0) {
                this.openWidgetBoardById(this.settings.boards[0].id);
            }
            return;
        }
        const validModes = Object.values(WidgetBoardModal.MODES);
        if (!validModes.includes(boardConfig.defaultMode as any)) {
            new Notice(`ボード「${boardConfig.name}」の無効なデフォルトモード '${boardConfig.defaultMode}'。フォールバックします。`);
            boardConfig.defaultMode = WidgetBoardModal.MODES.RIGHT_THIRD;
        }
        this.settings.lastOpenedBoardId = boardId;
        this.saveSettings();
        const modal = new WidgetBoardModal(this.app, this, boardConfig);
        this.widgetBoardModals.set(boardId, modal);
        // モーダルが閉じられたらMapから削除
        const origOnClose = modal.onClose.bind(modal);
        modal.onClose = () => {
            this.widgetBoardModals.delete(boardId);
            origOnClose();
        };
        modal.open();
    }

    /**
     * 指定したボードIDのウィジェットボードパネルをトグル（開閉）する
     */
    toggleWidgetBoardById(boardId: string) {
        const modal = this.widgetBoardModals.get(boardId);
        if (modal && modal.isOpen) {
            modal.close();
            return;
        }
        this.openWidgetBoardById(boardId);
    }

    async loadSettings() {
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
            this.settings = JSON.parse(JSON.stringify(DEFAULT_PLUGIN_SETTINGS));
        }
        if (!this.settings.boards || !Array.isArray(this.settings.boards)) {
            this.settings.boards = [JSON.parse(JSON.stringify(DEFAULT_BOARD_CONFIGURATION))];
        }
        if (this.settings.boards.length === 0) {
            this.settings.boards.push(JSON.parse(JSON.stringify(DEFAULT_BOARD_CONFIGURATION)));
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

    async saveSettings(targetBoardId?: string) {
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