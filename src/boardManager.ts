// src/boardManager.ts
import { App, Modal as ObsidianModal, Notice, Hotkey, Modifier, Setting } from 'obsidian';
import type WidgetBoardPlugin from './main';
import type { BoardConfiguration } from './interfaces';
import { WidgetBoardModal } from './modal';

export class BoardManager {
    widgetBoardModals: Map<string, WidgetBoardModal> = new Map();
    private registeredGroupCommandIds: string[] = [];

    constructor(private plugin: WidgetBoardPlugin) {}

    private get app(): App {
        return this.plugin.app;
    }

    openBoardPicker(): void {
        if (this.plugin.settings.boards.length === 0) {
            new Notice('設定されているウィジェットボードがありません。設定画面から作成してください。');
            return;
        }
        if (this.plugin.settings.boards.length === 1) {
            this.openWidgetBoardById(this.plugin.settings.boards[0].id);
            return;
        }
        const modal = new BoardPickerModal(this.app, this.plugin.settings.boards, (boardId) => {
            this.openWidgetBoardById(boardId);
        });
        modal.open();
    }

    openWidgetBoardById(boardId: string): void {
        const modal = this.widgetBoardModals.get(boardId);
        if (modal) {
            if (modal.isOpen || modal.isClosing) {
                return;
            } else {
                this.widgetBoardModals.delete(boardId);
                if (modal.modalEl && modal.modalEl.parentElement === document.body) {
                    modal.modalEl.parentElement.removeChild(modal.modalEl);
                }
            }
        }
        const boardConfig = this.plugin.settings.boards.find(b => b.id === boardId);
        if (!boardConfig) {
            new Notice(`ID '${boardId}' のウィジェットボードが見つかりません。`);
            return;
        }
        const validModes: string[] = Object.values(WidgetBoardModal.MODES);
        if (!validModes.includes(boardConfig.defaultMode)) {
            boardConfig.defaultMode = WidgetBoardModal.MODES.RIGHT_THIRD;
        }
        const newModal = new WidgetBoardModal(this.app, this.plugin, boardConfig);
        this.widgetBoardModals.set(boardId, newModal);
        const origOnClose = newModal.onClose.bind(newModal);
        newModal.onClose = () => {
            this.widgetBoardModals.delete(boardId);
            origOnClose();
        };
        newModal.open();
    }

    toggleWidgetBoardById(boardId: string): void {
        const modal = this.widgetBoardModals.get(boardId);
        if (modal && modal.isOpen) {
            modal.close();
            return;
        }
        this.openWidgetBoardById(boardId);
    }

    closeWidgetBoardById(boardId: string): void {
        const modal = this.widgetBoardModals.get(boardId);
        if (modal && modal.isOpen) {
            modal.close();
        }
    }

    registerAllBoardCommands(): void {
        if (typeof this.plugin.removeCommand === 'function') {
            this.registeredGroupCommandIds.forEach(id => {
                this.plugin.removeCommand(id);
            });
        }
        this.registeredGroupCommandIds = [];
        this.plugin.settings.boards.forEach(board => {
            this.plugin.addCommand({
                id: `toggle-widget-board-${board.id}`,
                name: `ウィジェットボードをトグル: ${board.name}`,
                callback: () => this.toggleWidgetBoardById(board.id)
            });
            this.plugin.addCommand({
                id: `close-widget-board-${board.id}`,
                name: `ウィジェットボードを閉じる: ${board.name}`,
                callback: () => this.closeWidgetBoardById(board.id)
            });
        });
        (this.plugin.settings.boardGroups || []).forEach(group => {
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
            this.plugin.addCommand({
                id: cmdId,
                name: `ボードグループをトグル: ${group.name}`,
                hotkeys,
                callback: () => {
                    const anyOpen = (group.boardIds || []).some(boardId => {
                        const modal = this.widgetBoardModals.get(boardId);
                        return modal && modal.isOpen;
                    });
                    if (anyOpen) {
                        (group.boardIds || [])
                            .filter(boardId => {
                                const modal = this.widgetBoardModals.get(boardId);
                                return modal && modal.isOpen;
                            })
                            .forEach(boardId => {
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

    hideAllBoards(): void {
        this.widgetBoardModals.forEach(modal => {
            if (modal.isOpen) modal.close();
        });
    }
}

class BoardPickerModal extends ObsidianModal {
    constructor(app: App, private boards: BoardConfiguration[], private onChoose: (boardId: string) => void) {
        super(app);
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        new Setting(contentEl).setName('ウィジェットボードを選択').setHeading();
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
