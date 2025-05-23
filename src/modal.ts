// src/modal.ts
import { App, FuzzySuggestModal, Notice } from 'obsidian';
import type WidgetBoardPlugin from './main';
import { registeredWidgetImplementations } from './widgetRegistry';
import type { WidgetImplementation, BoardConfiguration, WidgetConfig } from './interfaces';

/**
 * 新しいウィジェットの種類を選択して追加するためのモーダル
 */
class AddWidgetModal extends FuzzySuggestModal<[string, new () => WidgetImplementation]> {
    plugin: WidgetBoardPlugin;
    boardId: string;
    onChoose: () => void; // ボードをリフレッシュするためのコールバック

    constructor(app: App, plugin: WidgetBoardPlugin, boardId: string, onChoose: () => void) {
        super(app);
        this.plugin = plugin;
        this.boardId = boardId;
        this.onChoose = onChoose;
        this.setPlaceholder("追加するウィジェットの種類を選択してください");
    }

    getItems(): [string, new () => WidgetImplementation][] {
        return Array.from(registeredWidgetImplementations.entries());
    }

    getItemText(item: [string, new () => WidgetImplementation]): string {
        return item[0];
    }

    async onChooseItem(item: [string, new () => WidgetImplementation], evt: MouseEvent | KeyboardEvent): Promise<void> {
        const widgetType = item[0];
        const board = this.plugin.settings.boards.find(b => b.id === this.boardId);
        if (!board) {
            new Notice("対象のボードが見つかりません。");
            return;
        }

        const newWidgetConfig: WidgetConfig = {
            id: `widget-${Date.now()}`,
            type: widgetType,
            title: `新規 ${widgetType} ウィジェット`,
            settings: {},
        };

        board.widgets.push(newWidgetConfig);
        await this.plugin.saveSettings(this.boardId);
        new Notice(`'${widgetType}' ウィジェットが追加されました。`);
        this.onChoose();
    }
}


export class WidgetBoardModal {
    plugin: WidgetBoardPlugin;
    currentBoardConfig: BoardConfiguration;
    currentBoardId: string;
    currentMode: string;
    isOpen: boolean = false;
    isClosing: boolean = false;
    modeButtons: HTMLButtonElement[] = [];
    public uiWidgetReferences: WidgetImplementation[] = [];
    public modalEl: HTMLElement;
    public contentEl: HTMLElement;
    currentCustomWidth: number | null = null;

    isEditMode: boolean = false;
    private draggedElement: HTMLElement | null = null;
    private lastWidgetOrder: string[] = [];
    private dragDropListeners: Array<{ type: string, handler: EventListenerOrEventListenerObject }> = [];

    static readonly MODES = {
        RIGHT_HALF: 'mode-right-half',
        RIGHT_THIRD: 'mode-right-third',
        RIGHT_TWO_THIRD: 'mode-right-two-third',
        LEFT_TWO_THIRD: 'mode-left-two-third',
        LEFT_HALF: 'mode-left-half',
        LEFT_THIRD: 'mode-left-third',
        CENTER_HALF: 'mode-center-half',
        CENTER_THIRD: 'mode-center-third',
        CUSTOM_WIDTH: 'custom-width'
    } as const;

    constructor(_app: App, plugin: WidgetBoardPlugin, boardConfig: BoardConfiguration) {
        this.plugin = plugin;
        this.currentBoardConfig = JSON.parse(JSON.stringify(boardConfig));
        this.currentBoardId = boardConfig.id;
        const validModes = Object.values(WidgetBoardModal.MODES);
        if (!validModes.includes(this.currentBoardConfig.defaultMode as any)) {
            this.currentMode = WidgetBoardModal.MODES.RIGHT_THIRD;
        } else {
            this.currentMode = this.currentBoardConfig.defaultMode;
        }
        this.modalEl = document.createElement('div');
        this.modalEl.classList.add('widget-board-panel-custom');
        this.modalEl.setAttribute('data-board-id', this.currentBoardId);
        this.contentEl = document.createElement('div');
        this.modalEl.appendChild(this.contentEl);
    }

    public updateBoardConfiguration(newBoardConfig: BoardConfiguration) {
        if (!this.isOpen) return;
        this.currentBoardConfig = JSON.parse(JSON.stringify(newBoardConfig));
        this.currentBoardId = newBoardConfig.id;
        if (this.currentMode !== this.currentBoardConfig.defaultMode) {
            const validModes = Object.values(WidgetBoardModal.MODES);
            if (validModes.includes(this.currentBoardConfig.defaultMode as any)) {
                this.currentMode = this.currentBoardConfig.defaultMode;
                this.applyMode(this.currentMode);
            }
        }
        const widgetContainerEl = this.contentEl.querySelector('.wb-widget-container');
        if (widgetContainerEl instanceof HTMLElement) {
            this.loadWidgets(widgetContainerEl);
        } else {
            this.onOpen();
        }
        const headerTitleEl = this.contentEl.querySelector('.wb-panel-header h3');
        if (headerTitleEl) {
            headerTitleEl.setText(`ウィジェットボード: ${this.currentBoardConfig.name}`);
        }
    }

    open() {
        if (this.isOpen) return;
        document.body.appendChild(this.modalEl);
        this.onOpen();
    }

    onOpen() {
        this.isOpen = true;
        this.isEditMode = false; // 開いたときは必ず表示モードで開始
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this.uiWidgetReferences = [];

        if (this.currentBoardConfig.defaultMode === 'custom-width' && this.currentBoardConfig.customWidth) {
            this.modalEl.style.width = this.currentBoardConfig.customWidth + 'vw';
        } else if (this.currentBoardConfig.customWidth && typeof this.currentBoardConfig.customWidth === 'number' && this.currentBoardConfig.customWidth > 0 && this.currentBoardConfig.customWidth <= 100) {
            this.modalEl.style.width = this.currentBoardConfig.customWidth + 'px';
        } else {
            this.modalEl.style.width = '';
        }

        this.applyMode(this.currentMode);

        // --- ヘッダーと設定ボタン ---
        const headerEl = contentEl.createDiv({ cls: 'wb-panel-header' });
        headerEl.createEl('h3', { text: `ウィジェットボード: ${this.currentBoardConfig.name}` });

        const settingsBtn = headerEl.createEl('button', { cls: 'wb-panel-settings-toggle' });
        settingsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
        settingsBtn.setAttribute('aria-label', '設定を開く');

        // --- リサイズハンドル ---
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'wb-panel-resize-handle';
        modalEl.appendChild(resizeHandle);
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = modalEl.offsetWidth;
            document.body.style.cursor = 'ew-resize';
            modalEl.classList.add('no-transition');
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const dx = e.clientX - startX;
            const newWidth = Math.max(200, startWidth + dx);
            modalEl.style.width = newWidth + 'px';
        });
        document.addEventListener('mouseup', async (e) => {
            if (!isResizing) return;
            isResizing = false;
            document.body.style.cursor = '';
            modalEl.classList.remove('no-transition');
            const finalWidthPx = modalEl.offsetWidth;
            const vw = (finalWidthPx / window.innerWidth) * 100;
            this.currentCustomWidth = vw;
            this.currentBoardConfig.customWidth = vw;
            const boardToUpdate = this.plugin.settings.boards.find(b => b.id === this.currentBoardId);
            if (boardToUpdate) {
                boardToUpdate.customWidth = vw;
                await this.plugin.saveSettings(this.currentBoardId);
            }
        });

        // --- 統合された設定パネル (初期状態は非表示) ---
        const settingsPanelEl = contentEl.createDiv({ cls: 'wb-settings-panel' });
        settingsPanelEl.hide();

        // --- 表示設定アコーディオン ---
        const displayAccordion = settingsPanelEl.createDiv({ cls: 'wb-settings-accordion' });
        const displayHeader = displayAccordion.createDiv({ cls: 'wb-settings-accordion-header' });
        const displayIcon = displayHeader.createSpan({ cls: 'wb-settings-accordion-icon' });
        displayIcon.setText('▶');
        displayHeader.appendText('表示設定');
        const displayBody = displayAccordion.createDiv({ cls: 'wb-settings-accordion-body' });
        displayBody.style.display = 'none';

        // --- ウィジェット設定アコーディオン ---
        const widgetAccordion = settingsPanelEl.createDiv({ cls: 'wb-settings-accordion' });
        const widgetHeader = widgetAccordion.createDiv({ cls: 'wb-settings-accordion-header' });
        const widgetIcon = widgetHeader.createSpan({ cls: 'wb-settings-accordion-icon' });
        widgetIcon.setText('▶');
        widgetHeader.appendText('ウィジェット設定');
        const widgetBody = widgetAccordion.createDiv({ cls: 'wb-settings-accordion-body' });
        widgetBody.style.display = 'none';

        // --- アコーディオン開閉イベント ---
        displayHeader.addEventListener('click', () => {
            const isOpen = displayAccordion.classList.toggle('open');
            displayIcon.style.transform = isOpen ? 'rotate(90deg)' : '';
            displayBody.style.display = isOpen ? 'block' : 'none';
        });
        widgetHeader.addEventListener('click', () => {
            const isOpen = widgetAccordion.classList.toggle('open');
            widgetIcon.style.transform = isOpen ? 'rotate(90deg)' : '';
            widgetBody.style.display = isOpen ? 'block' : 'none';
        });

        // --- 表示設定アコーディオン内に本来のロジックを移動 ---
        const panelHeader = displayBody.createDiv({ cls: 'wb-settings-panel-header' });
        panelHeader.createEl('h4', { text: 'ボード設定' });
        const doneBtn = panelHeader.createEl('button', { text: '完了' });

        const displayControlsContainer = displayBody.createDiv({ cls: 'wb-display-controls-container' });
        this.modeButtons = [];
        const modeGroups = [
            { label: '左パネル', modes: [WidgetBoardModal.MODES.LEFT_THIRD, WidgetBoardModal.MODES.LEFT_HALF, WidgetBoardModal.MODES.LEFT_TWO_THIRD] },
            { label: '中央パネル', modes: [WidgetBoardModal.MODES.CENTER_THIRD, WidgetBoardModal.MODES.CENTER_HALF] },
            { label: '右パネル', modes: [WidgetBoardModal.MODES.RIGHT_THIRD, WidgetBoardModal.MODES.RIGHT_HALF, WidgetBoardModal.MODES.RIGHT_TWO_THIRD] },
            { label: 'カスタム', modes: [WidgetBoardModal.MODES.CUSTOM_WIDTH] }
        ];
        let customWidthAnchorBtnContainer = displayControlsContainer.createDiv({ cls: 'custom-width-anchor-btns' });
        customWidthAnchorBtnContainer.style.display = this.currentMode === WidgetBoardModal.MODES.CUSTOM_WIDTH ? '' : 'none';

        modeGroups.forEach((group, groupIdx) => {
            const groupDiv = displayControlsContainer.createDiv({ cls: 'wb-mode-group' });
            groupDiv.createEl('span', { text: group.label, cls: 'wb-mode-group-label' });
            group.modes.forEach(modeClass => {
                let buttonText = '';
                if (modeClass === WidgetBoardModal.MODES.RIGHT_THIRD) buttonText = '右パネル（33vw）';
                else if (modeClass === WidgetBoardModal.MODES.RIGHT_HALF) buttonText = '右パネル（50vw）';
                else if (modeClass === WidgetBoardModal.MODES.RIGHT_TWO_THIRD) buttonText = '右パネル（66vw）';
                else if (modeClass === WidgetBoardModal.MODES.LEFT_TWO_THIRD) buttonText = '左パネル（66vw）';
                else if (modeClass === WidgetBoardModal.MODES.LEFT_HALF) buttonText = '左パネル（50vw）';
                else if (modeClass === WidgetBoardModal.MODES.LEFT_THIRD) buttonText = '左パネル（33vw）';
                else if (modeClass === WidgetBoardModal.MODES.CENTER_HALF) buttonText = '中央パネル（50vw）';
                else if (modeClass === WidgetBoardModal.MODES.CENTER_THIRD) buttonText = '中央パネル（33vw）';
                else if (modeClass === WidgetBoardModal.MODES.CUSTOM_WIDTH) buttonText = 'カスタム幅';

                const button = groupDiv.createEl('button', { text: buttonText });
                button.dataset.mode = modeClass;
                button.onClickEvent(async () => {
                    this.applyMode(modeClass);
                    const boardToUpdate = this.plugin.settings.boards.find(b => b.id === this.currentBoardId);
                    if (boardToUpdate) {
                        boardToUpdate.defaultMode = modeClass;
                        await this.plugin.saveSettings(this.currentBoardId);
                    }
                    customWidthAnchorBtnContainer.style.display = modeClass === WidgetBoardModal.MODES.CUSTOM_WIDTH ? '' : 'none';
                });
                this.modeButtons.push(button);
            });
            if (groupIdx < modeGroups.length - 1) {
                displayControlsContainer.createEl('span', { text: '', cls: 'wb-mode-group-gap' });
            }
        });

        const anchors: Array<{ key: 'left' | 'center' | 'right', label: string }> = [
            { key: 'left', label: '左' }, { key: 'center', label: '中央' }, { key: 'right', label: '右' }
        ];
        anchors.forEach(anchorObj => {
            const anchorBtn = customWidthAnchorBtnContainer.createEl('button', { text: anchorObj.label });
            anchorBtn.classList.toggle('active', this.currentBoardConfig.customWidthAnchor === anchorObj.key || (!this.currentBoardConfig.customWidthAnchor && anchorObj.key === 'right'));
            anchorBtn.onclick = async () => {
                this.currentBoardConfig.customWidthAnchor = anchorObj.key;
                const boardToUpdate = this.plugin.settings.boards.find(b => b.id === this.currentBoardId);
                if (boardToUpdate) {
                    boardToUpdate.customWidthAnchor = anchorObj.key;
                    await this.plugin.saveSettings(this.currentBoardId);
                }
                Array.from(customWidthAnchorBtnContainer.children).forEach(btn => btn.classList.remove('active'));
                anchorBtn.classList.add('active');
                this.applyMode(WidgetBoardModal.MODES.CUSTOM_WIDTH);
            };
        });

        // --- ウィジェット設定アコーディオン内にウィジェット追加ボタンのみ配置 ---
        const addWidgetContainer = widgetBody.createDiv({ cls: 'wb-add-widget-container' });
        const addWidgetBtn = addWidgetContainer.createEl('button', { text: '＋ ウィジェット追加', cls: 'wb-add-widget-btn' });
        addWidgetBtn.onclick = () => {
            new AddWidgetModal(this.plugin.app, this.plugin, this.currentBoardId, () => {
                const widgetContainerEl = this.contentEl.querySelector('.wb-widget-container');
                if (widgetContainerEl instanceof HTMLElement) {
                    this.loadWidgets(widgetContainerEl);
                }
            }).open();
        };

        // --- 設定パネルの開閉と編集モードを切り替える ---
        const toggleSettings = () => {
            this.isEditMode = !this.isEditMode;
            settingsBtn.classList.toggle('active', this.isEditMode);

            if (this.isEditMode) {
                settingsPanelEl.show();
            } else {
                settingsPanelEl.hide();
            }

            const widgetContainerEl = this.contentEl.querySelector('.wb-widget-container');
            if (widgetContainerEl instanceof HTMLElement) {
                widgetContainerEl.classList.toggle('is-editing', this.isEditMode);
                this.loadWidgets(widgetContainerEl);
            }
        };

        settingsBtn.onclick = toggleSettings;
        doneBtn.onclick = toggleSettings;

        // --- ウィジェットコンテナ ---
        const widgetContainerEl = contentEl.createDiv({ cls: 'wb-widget-container' });
        this.loadWidgets(widgetContainerEl);

        this.uiWidgetReferences.forEach(widgetInstance => {
            if (typeof (widgetInstance as any).handleShow === 'function') {
                (widgetInstance as any).handleShow();
            }
        });

        this.updateModeButtonsActiveState();

        setTimeout(() => {
            const searchInput = this.contentEl.querySelector('.wb-page-search-bar-input') as HTMLInputElement | null;
            if (searchInput) {
                searchInput.addEventListener('focus', (e) => {
                    if ((window as any).__WB_MEMO_EDITING__) {
                        e.preventDefault();
                        searchInput.blur();
                    }
                });
            }
        }, 0);

        requestAnimationFrame(() => {
            modalEl.classList.add('is-open');
        });
    }

    loadWidgets(container: HTMLElement) {
        const boardInGlobal = this.plugin.settings.boards.find(b => b.id === this.currentBoardId);
        const widgetsToLoad = boardInGlobal ? boardInGlobal.widgets : this.currentBoardConfig.widgets;
        const newOrder = widgetsToLoad.map(w => w.id);
        // 差分描画: ID順序が同じなら並び替えだけ
        if (
            this.lastWidgetOrder.length === newOrder.length &&
            this.lastWidgetOrder.every((id, i) => id === newOrder[i]) === false &&
            container.children.length === newOrder.length
        ) {
            newOrder.forEach((id, idx) => {
                const node = Array.from(container.children).find(
                    el => (el as HTMLElement).dataset && (el as HTMLElement).dataset.widgetId === id
                );
                if (node) container.appendChild(node);
            });
            this.lastWidgetOrder = [...newOrder];
            return;
        }
        // それ以外は全再描画
        container.empty();
        this.uiWidgetReferences = [];
        if (!widgetsToLoad || widgetsToLoad.length === 0) {
            container.createEl('p', { text: 'このボードに表示するウィジェットがありません。' + (this.isEditMode ? '「ウィジェット追加」から追加してください。' : '設定を開いてウィジェットを追加してください。') });
            this.lastWidgetOrder = [];
            return;
        }
        // --- Lazy Load & 非同期描画 ---
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const wrapper = entry.target as HTMLElement;
                    const widgetId = wrapper.dataset.widgetId;
                    const widgetConfig = widgetsToLoad.find(w => w.id === widgetId);
                    if (!widgetConfig) return;
                    // 既に生成済みならスキップ
                    if (wrapper.dataset.loaded === '1') return;
                    const WidgetClass = registeredWidgetImplementations.get(widgetConfig.type) as (new () => WidgetImplementation) | undefined;
                    if (WidgetClass) {
                        // 重いウィジェットはsetTimeoutで遅延描画
                        const isHeavy = ['pomodoro', 'calendar', 'recent-notes'].includes(widgetConfig.type);
                        const createWidget = () => {
                            try {
                                const widgetInstance = new WidgetClass();
                                const widgetElement = widgetInstance.create(widgetConfig, this.plugin.app, this.plugin);
                                if (this.isEditMode) {
                                    wrapper.innerHTML = '';
                                    wrapper.appendChild(widgetElement);
                                } else {
                                    wrapper.replaceWith(widgetElement);
                                }
                                this.uiWidgetReferences.push(widgetInstance);
                                wrapper.dataset.loaded = '1';
                                obs.unobserve(wrapper);
                            } catch (e: any) {
                                wrapper.innerHTML = `<div class="widget widget-error"><h4>${widgetConfig.title || '(名称未設定)'} (ロードエラー)</h4><p>このウィジェットの読み込み中にエラーが発生しました。</p><p>${e.message || ''}</p></div>`;
                                obs.unobserve(wrapper);
                            }
                        };
                        if (isHeavy) {
                            setTimeout(createWidget, 0);
                        } else {
                            createWidget();
                        }
                    } else {
                        wrapper.innerHTML = `<div class="widget widget-unknown"><h4>${widgetConfig.title || '(名称未設定)'} (不明な種類)</h4><p>ウィジェットの種類 '${widgetConfig.type}' は登録されていません。</p></div>`;
                        obs.unobserve(wrapper);
                    }
                }
            });
        }, { root: container, rootMargin: '200px' });
        widgetsToLoad.forEach(widgetConfig => {
            // プレースホルダー生成
            let wrapper: HTMLElement;
            if (this.isEditMode) {
                wrapper = container.createDiv({ cls: 'wb-widget-edit-wrapper' });
                wrapper.setAttribute('draggable', 'true');
                wrapper.dataset.widgetId = widgetConfig.id;
                wrapper.innerHTML = '<div class="wb-widget-placeholder">Loading...</div>';
                const dragHandle = wrapper.createDiv({ cls: 'wb-widget-drag-handle' });
                dragHandle.innerHTML = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"svg-icon lucide-grip-vertical\"><circle cx=\"9\" cy=\"12\" r=\"1\"></circle><circle cx=\"9\" cy=\"5\" r=\"1\"></circle><circle cx=\"9\" cy=\"19\" r=\"1\"></circle><circle cx=\"15\" cy=\"12\" r=\"1\"></circle><circle cx=\"15\" cy=\"5\" r=\"1\"></circle><circle cx=\"15\" cy=\"19\" r=\"1\"></circle></svg>`;
                const deleteBtn = wrapper.createEl('button', { cls: 'wb-widget-delete-btn', text: '×' });
                deleteBtn.onclick = async () => {
                    if (confirm(`ウィジェット「${widgetConfig.title}」を削除しますか？`)) {
                        await this.deleteWidget(widgetConfig.id);
                    }
                };
            } else {
                wrapper = container.createDiv();
                wrapper.dataset.widgetId = widgetConfig.id;
                wrapper.innerHTML = '<div class="wb-widget-placeholder">Loading...</div>';
            }
            observer.observe(wrapper);
        });
        if (this.isEditMode) {
            this.addDragDropListeners(container);
        }
        this.lastWidgetOrder = [...newOrder];
    }

    private async deleteWidget(widgetId: string) {
        const board = this.plugin.settings.boards.find(b => b.id === this.currentBoardId);
        if (!board) return;

        const widgetIndex = board.widgets.findIndex(w => w.id === widgetId);
        if (widgetIndex > -1) {
            board.widgets.splice(widgetIndex, 1);
            await this.plugin.saveSettings(this.currentBoardId);
            const widgetContainerEl = this.contentEl.querySelector('.wb-widget-container');
            if (widgetContainerEl instanceof HTMLElement) {
                this.loadWidgets(widgetContainerEl);
            }
        }
    }

    private addDragDropListeners(container: HTMLElement) {
        const dragStart = this.handleDragStart.bind(this);
        const dragOver = this.handleDragOver.bind(this);
        const drop = this.handleDrop.bind(this);
        const dragEnd = this.handleDragEnd.bind(this);
        container.addEventListener('dragstart', dragStart);
        container.addEventListener('dragover', dragOver);
        container.addEventListener('drop', drop);
        container.addEventListener('dragend', dragEnd);
        this.dragDropListeners = [
            { type: 'dragstart', handler: dragStart },
            { type: 'dragover', handler: dragOver },
            { type: 'drop', handler: drop },
            { type: 'dragend', handler: dragEnd },
        ];
    }
    private removeDragDropListeners(container: HTMLElement) {
        this.dragDropListeners.forEach(({ type, handler }) => {
            container.removeEventListener(type, handler);
        });
        this.dragDropListeners = [];
    }

    private handleDragStart(e: DragEvent) {
        const target = (e.target as HTMLElement).closest('.wb-widget-edit-wrapper');
        if (target instanceof HTMLElement && e.dataTransfer) {
            this.draggedElement = target;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', target.dataset.widgetId || '');
            setTimeout(() => target.classList.add('is-dragging'), 0);
        }
    }

    private handleDragOver(e: DragEvent) {
        e.preventDefault();
        if (!this.draggedElement) return;

        const container = e.currentTarget as HTMLElement;
        const overElement = (e.target as HTMLElement).closest('.wb-widget-edit-wrapper');

        if (overElement && overElement !== this.draggedElement) {
            const rect = overElement.getBoundingClientRect();
            const isAfter = e.clientY > rect.top + rect.height / 2;
            if (isAfter) {
                container.insertBefore(this.draggedElement, overElement.nextSibling);
            } else {
                container.insertBefore(this.draggedElement, overElement);
            }
        }
    }

    private async handleDrop(e: DragEvent) {
        e.preventDefault();
        if (!this.draggedElement) return;

        this.draggedElement.classList.remove('is-dragging');
        const container = e.currentTarget as HTMLElement;

        const newWidgetOrderIds = Array.from(container.querySelectorAll('.wb-widget-edit-wrapper'))
            .map(el => (el as HTMLElement).dataset.widgetId)
            .filter((id): id is string => !!id);

        // 最新のboardを再取得して順序を上書き
        const boardIndex = this.plugin.settings.boards.findIndex(b => b.id === this.currentBoardId);
        if (boardIndex !== -1) {
            const board = this.plugin.settings.boards[boardIndex];
            const newWidgets = newWidgetOrderIds.map(id => board.widgets.find(w => w.id === id)).filter((w): w is WidgetConfig => !!w);
            board.widgets = newWidgets;
            await this.plugin.saveSettings(this.currentBoardId);
            // 保存後に再描画（競合防止）
            this.updateBoardConfiguration(board);
        }

        this.draggedElement = null;
    }

    private handleDragEnd(e: DragEvent) {
        if (this.draggedElement) {
            this.draggedElement.classList.remove('is-dragging');
            this.draggedElement = null;
        }
    }

    applyMode(newModeClass: string) {
        const { modalEl } = this;
        const validModeClasses = Object.values(WidgetBoardModal.MODES) as string[];

        validModeClasses.forEach(cls => modalEl.classList.remove(cls));
        modalEl.classList.remove('custom-width-right', 'custom-width-left', 'custom-width-center');

        if (newModeClass === WidgetBoardModal.MODES.CUSTOM_WIDTH) {
            const anchor = this.currentBoardConfig.customWidthAnchor || 'right';
            modalEl.classList.add(`custom-width-${anchor}`);
            const width = (this.currentBoardConfig.customWidth || 40) + 'vw';
            modalEl.style.width = width;
            modalEl.style.setProperty('--custom-width', width);
            modalEl.style.right = '';
            modalEl.style.left = '';
            modalEl.style.transform = '';
        } else {
            if (validModeClasses.includes(newModeClass)) {
                modalEl.classList.add(newModeClass);
            }
            modalEl.style.width = '';
            modalEl.style.right = '';
            modalEl.style.left = '';
            modalEl.style.transform = '';
        }
        this.currentMode = newModeClass;
        this.updateModeButtonsActiveState();
    }

    private updateModeButtonsActiveState() {
        this.modeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.currentMode);
        });
    }

    close() {
        const { modalEl } = this;
        this.isClosing = true;
        if (this.plugin.widgetBoardModals && this.plugin.widgetBoardModals.has(this.currentBoardId)) {
            this.plugin.widgetBoardModals.delete(this.currentBoardId);
        }
        // --- イベントリスナー解除 ---
        const widgetContainerEl = this.contentEl.querySelector('.wb-widget-container');
        if (widgetContainerEl instanceof HTMLElement) {
            this.removeDragDropListeners(widgetContainerEl);
        }
        modalEl.classList.remove('is-open');
        setTimeout(() => {
            this.onClose();
            const selector = `.widget-board-panel-custom[data-board-id='${this.currentBoardId}']`;
            document.querySelectorAll(selector).forEach(el => {
                if (el.parentElement === document.body) {
                    document.body.removeChild(el);
                }
            });
        }, 300);
    }

    onClose() {
        this.isOpen = false;
        this.isClosing = false;
        this.uiWidgetReferences.forEach(widgetInstance => {
            if (typeof (widgetInstance as any).handleHide === 'function') {
                (widgetInstance as any).handleHide();
            }
        });
        const { contentEl } = this;
        contentEl.empty();
        this.uiWidgetReferences = [];
    }
}