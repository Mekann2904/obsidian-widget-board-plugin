// src/modal.ts
import { App, FuzzySuggestModal, Notice, setIcon } from 'obsidian';
import type WidgetBoardPlugin from './main';
import { registeredWidgetImplementations } from './widgetRegistry';
import type { WidgetImplementation, BoardConfiguration, WidgetConfig } from './interfaces';
import cloneDeep from 'lodash.clonedeep';
import { preloadChartJS, loadReflectionSummaryShared } from './widgets/reflectionWidget/reflectionWidgetUI';
import { getDateKeyLocal, getWeekRange } from './utils';
import type { ReflectionWidgetPreloadBundle } from './widgets/reflectionWidget/reflectionWidget';

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
            title: '',
            settings: {},
        };

        board.widgets.push(newWidgetConfig);
        await this.plugin.saveSettings(this.boardId);
        new Notice(`'${widgetType}' ウィジェットが追加されました。`);
        this.onChoose();
    }
}

/**
 * ウィジェットボードのモーダル表示・管理を行うクラス
 * - ボードのUI生成、ウィジェットのロード、設定パネル、ドラッグ＆ドロップ等を担当
 */
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
    private dragOverScheduled = false;
    private pendingDragOverEvent: { container: HTMLElement; overElement: HTMLElement; clientY: number } | null = null;
    private widgetObserver: IntersectionObserver | null = null;

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

    /**
     * モーダルを初期化
     * @param _app Obsidianアプリインスタンス
     * @param plugin プラグイン本体
     * @param boardConfig ボード設定
     */
    constructor(_app: App, plugin: WidgetBoardPlugin, boardConfig: BoardConfiguration) {
        this.plugin = plugin;
        this.currentBoardConfig = cloneDeep(boardConfig);
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

        // CSS containmentを適用してレイアウト計算の影響範囲を限定
        this.modalEl.style.contain = 'layout style paint';
        // Style recalculation対策として不可視要素はスキップ
        this.modalEl.style.contentVisibility = 'auto';
    }

    /**
     * ボード設定を更新し、UIを再描画
     * @param newBoardConfig 新しいボード設定
     */
    public updateBoardConfiguration(newBoardConfig: BoardConfiguration) {
        if (!this.isOpen) return;
        this.currentBoardConfig = cloneDeep(newBoardConfig);
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

    /**
     * モーダルを開く（UI生成・初期化）
     */
    open() {
        if (this.isOpen) return;
        document.body.appendChild(this.modalEl);
        this.onOpen();
        // アニメーションクラスの付与だけをrAFで行う
        this.modalEl.classList.remove('is-open');
        void this.modalEl.offsetWidth;
        requestAnimationFrame(() => {
            this.modalEl.classList.add('is-open');
        });
    }

    /**
     * モーダルのUIを初期化・再描画
     */
    onOpen() {
        document.body.classList.add('wb-modal-open');
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

        // ボタン群ラッパー
        const actionsWrapper = headerEl.createDiv({ cls: 'wb-panel-header-actions' });
        actionsWrapper.style.display = 'flex';
        actionsWrapper.style.gap = '8px';
        actionsWrapper.style.marginLeft = 'auto';
        actionsWrapper.style.alignItems = 'center';

        const settingsBtn = actionsWrapper.createEl('button', { cls: 'wb-panel-settings-toggle' });
        setIcon(settingsBtn, 'settings');
        settingsBtn.setAttribute('aria-label', '設定を開く');

        const closeBtn = actionsWrapper.createEl('button', { cls: 'wb-panel-close-btn' });
        setIcon(closeBtn, 'x');
        closeBtn.setAttribute('aria-label', 'ボードを閉じる');
        closeBtn.onclick = () => this.close();

        // --- リサイズハンドル（右端） ---
        const resizeHandleRight = document.createElement('div');
        resizeHandleRight.className = 'wb-panel-resize-handle wb-panel-resize-handle-right';
        modalEl.appendChild(resizeHandleRight);
        let isResizingRight = false;
        let startXRight = 0;
        let startWidthRight = 0;
        let scheduledResizeRight = false;
        let pendingWidthRight: number | null = null;
        const onMouseMoveRight = (e: MouseEvent) => {
            if (!isResizingRight) return;
            const dx = e.clientX - startXRight;
            const newWidth = Math.max(200, startWidthRight + dx);
            pendingWidthRight = newWidth;
            if (!scheduledResizeRight) {
                scheduledResizeRight = true;
                requestAnimationFrame(() => {
                    if (pendingWidthRight !== null) {
                        modalEl.style.width = pendingWidthRight + 'px';
                    }
                    scheduledResizeRight = false;
                });
            }
        };
        const onMouseUpRight = async (e: MouseEvent) => {
            if (!isResizingRight) return;
            isResizingRight = false;
            document.body.style.cursor = '';
            modalEl.classList.remove('no-transition');
            const finalWidthPx = modalEl.offsetWidth;
            const vw = finalWidthPx / window.innerWidth * 100;
            this.currentCustomWidth = vw;
            this.currentBoardConfig.customWidth = vw;
            const boardToUpdate = this.plugin.settings.boards.find((b) => b.id === this.currentBoardId);
            if (boardToUpdate) {
                boardToUpdate.customWidth = vw;
                await this.plugin.saveSettings(this.currentBoardId);
            }
            document.removeEventListener('mousemove', onMouseMoveRight);
            document.removeEventListener('mouseup', onMouseUpRight);
        };
        resizeHandleRight.addEventListener('mousedown', (e: MouseEvent) => {
            isResizingRight = true;
            startXRight = e.clientX;
            startWidthRight = modalEl.offsetWidth;
            document.body.style.cursor = 'ew-resize';
            modalEl.classList.add('no-transition');
            document.addEventListener('mousemove', onMouseMoveRight);
            document.addEventListener('mouseup', onMouseUpRight);
            e.preventDefault();
        });

        // --- リサイズハンドル（左端） ---
        const resizeHandleLeft = document.createElement('div');
        resizeHandleLeft.className = 'wb-panel-resize-handle wb-panel-resize-handle-left';
        modalEl.insertBefore(resizeHandleLeft, modalEl.firstChild);
        let isResizingLeft = false;
        let startXLeft = 0;
        let startWidthLeft = 0;
        let scheduledResizeLeft = false;
        let pendingWidthLeft: number | null = null;
        const onMouseMoveLeft = (e: MouseEvent) => {
            if (!isResizingLeft) return;
            const dx = e.clientX - startXLeft;
            const newWidth = Math.max(200, startWidthLeft - dx);
            pendingWidthLeft = newWidth;
            if (!scheduledResizeLeft) {
                scheduledResizeLeft = true;
                requestAnimationFrame(() => {
                    if (pendingWidthLeft !== null) {
                        modalEl.style.width = pendingWidthLeft + 'px';
                    }
                    scheduledResizeLeft = false;
                });
            }
        };
        const onMouseUpLeft = async (e: MouseEvent) => {
            if (!isResizingLeft) return;
            isResizingLeft = false;
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
            document.removeEventListener('mousemove', onMouseMoveLeft);
            document.removeEventListener('mouseup', onMouseUpLeft);
        };
        resizeHandleLeft.addEventListener('mousedown', (e) => {
            isResizingLeft = true;
            startXLeft = e.clientX;
            startWidthLeft = modalEl.offsetWidth;
            document.body.style.cursor = 'ew-resize';
            modalEl.classList.add('no-transition');
            e.preventDefault();
            document.addEventListener('mousemove', onMouseMoveLeft);
            document.addEventListener('mouseup', onMouseUpLeft);
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

        // --- モードボタン生成 ---
        this.modeButtons = modeGroups.flatMap((group, groupIdx) => {
            const groupDiv = displayControlsContainer.createDiv({ cls: 'wb-mode-group' });
            groupDiv.createEl('span', { text: group.label, cls: 'wb-mode-group-label' });
            const buttons = group.modes.map(modeClass => {
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
                return button;
            });
            if (groupIdx < modeGroups.length - 1) {
                displayControlsContainer.createEl('span', { text: '', cls: 'wb-mode-group-gap' });
            }
            return buttons;
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

        this.uiWidgetReferences.forEach((widgetInstance) => {
            if (typeof (widgetInstance as any).handleShow === 'function') {
                (widgetInstance as any).handleShow();
            }
        });

        this.updateModeButtonsActiveState();

        requestAnimationFrame(() => {
            const searchInput = this.contentEl.querySelector('.wb-page-search-bar-input') as HTMLInputElement | null;
            if (searchInput) {
                searchInput.addEventListener('focus', (e) => {
                    if ((window as any).__WB_MEMO_EDITING__) {
                        e.preventDefault();
                        searchInput.blur();
                    }
                });
            }
        });

        requestAnimationFrame(() => {
            modalEl.classList.add('is-open');
        });
    }

    /**
     * ボード内のウィジェットをすべてロード
     * @param container ウィジェット配置先の要素
     */
    async loadWidgets(container: HTMLElement) {
        // 既存のobserverがあれば解除
        if (this.widgetObserver) {
            this.widgetObserver.disconnect();
            this.widgetObserver = null;
        }
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
        // --- プリロードバンドル生成（ReflectionWidget用） ---
        let reflectionPreloadBundle: ReflectionWidgetPreloadBundle | undefined = undefined;
        if (widgetsToLoad.some(w => w.type === 'reflection-widget')) {
            const chartModule = await preloadChartJS();
            const todayKey = getDateKeyLocal(new Date());
            const [, weekKey] = getWeekRange();
            const [todaySummary, weekSummary] = await Promise.all([
                loadReflectionSummaryShared('today', todayKey, this.plugin.app),
                loadReflectionSummaryShared('week', weekKey, this.plugin.app)
            ]);
            reflectionPreloadBundle = { chartModule, todaySummary, weekSummary };
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
                        const isHeavy = ['pomodoro', 'calendar', 'recent-notes'].includes(widgetConfig.type);
                        const createWidget = () => {
                            try {
                                const widgetInstance = new WidgetClass();
                                let widgetElement;
                                if (widgetConfig.type === 'reflection-widget') {
                                    widgetElement = widgetInstance.create(widgetConfig, this.plugin.app, this.plugin, reflectionPreloadBundle);
                                } else {
                                    widgetElement = widgetInstance.create(widgetConfig, this.plugin.app, this.plugin);
                                }
                                if (this.isEditMode) {
                                    wrapper.empty();
                                    const deleteBtn = wrapper.createEl('button', { cls: 'wb-widget-delete-btn' });
                                    setIcon(deleteBtn, 'trash');
                                    deleteBtn.onclick = async () => {
                                        if (confirm(`ウィジェット「${widgetConfig.title}」を削除しますか？`)) {
                                            await this.deleteWidget(widgetConfig.id);
                                        }
                                    };
                                    wrapper.appendChild(widgetElement);
                                } else {
                                    wrapper.replaceWith(widgetElement);
                                }
                                this.uiWidgetReferences.push(widgetInstance);
                                wrapper.dataset.loaded = '1';
                                obs.unobserve(wrapper);
                            } catch (e: any) {
                                wrapper.empty();
                                const errDiv = wrapper.createDiv({ cls: 'widget widget-error' });
                                errDiv.createEl('h4', { text: `${widgetConfig.title || '(名称未設定)'} (ロードエラー)` });
                                errDiv.createEl('p', { text: 'このウィジェットの読み込み中にエラーが発生しました。' });
                                errDiv.createEl('p', { text: e.message || '' });
                                obs.unobserve(wrapper);
                            }
                        };
                        if (isHeavy) {
                            requestAnimationFrame(createWidget);
                        } else {
                            createWidget();
                        }
                    } else {
                        wrapper.empty();
                        const unknownDiv = wrapper.createDiv({ cls: 'widget widget-unknown' });
                        unknownDiv.createEl('h4', { text: `${widgetConfig.title || '(名称未設定)'} (不明な種類)` });
                        unknownDiv.createEl('p', { text: `ウィジェットの種類 '${widgetConfig.type}' は登録されていません。` });
                        obs.unobserve(wrapper);
                    }
                }
            });
        }, { root: container, rootMargin: '200px' });
        this.widgetObserver = observer;
        let index = 0;
        // MessageChannelによる即時キューイング
        const channel = new MessageChannel();
        channel.port1.onmessage = () => processBatch();
        function scheduleNext() {
            channel.port2.postMessage(undefined);
        }
        function renderOneWidget(widgetConfig: WidgetConfig) {
            // 既存の同じIDのwrapperがあれば削除
            const old = container.querySelector(`[data-widget-id="${widgetConfig.id}"]`);
            if (old) old.remove();
            let wrapper;
            if (this.isEditMode) {
                wrapper = container.createDiv({ cls: 'wb-widget-edit-wrapper' });
                wrapper.setAttribute('draggable', 'true');
                wrapper.dataset.widgetId = widgetConfig.id;
                const deleteBtn = wrapper.createEl('button', { cls: 'wb-widget-delete-btn' });
                setIcon(deleteBtn, 'trash');
                deleteBtn.onclick = async () => {
                    if (confirm(`ウィジェット「${widgetConfig.title}」を削除しますか？`)) {
                        await this.deleteWidget(widgetConfig.id);
                    }
                };
                const placeholder = wrapper.createDiv({ cls: 'wb-widget-placeholder' });
                placeholder.setText('Loading...');
                const dragHandle = wrapper.createDiv({ cls: 'wb-widget-drag-handle' });
                setIcon(dragHandle, 'grip-vertical');
            } else {
                wrapper = container.createDiv();
                wrapper.dataset.widgetId = widgetConfig.id;
                wrapper.empty();
                wrapper.createDiv({ cls: 'wb-widget-placeholder', text: 'Loading...' });
            }
            observer.observe(wrapper);
        }
        const processBatch = () => {
            const start = performance.now();
            while (index < widgetsToLoad.length && performance.now() - start < 8) {
                renderOneWidget.call(this, widgetsToLoad[index]);
                index++;
            }
            if (index < widgetsToLoad.length) {
                scheduleNext();
            } else {
                if (this.isEditMode) {
                    this.addDragDropListeners(container);
                }
                this.lastWidgetOrder = [...newOrder];
            }
        };
        // 最初のキック
        scheduleNext();
    }

    /**
     * ウィジェットを削除
     * @param widgetId 削除対象ウィジェットID
     */
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
            requestAnimationFrame(() => target.classList.add('is-dragging'));
        }
    }

    private handleDragOver(e: DragEvent) {
        e.preventDefault();
        if (!this.draggedElement) return;

        const container = e.currentTarget as HTMLElement;
        const overElement = (e.target as HTMLElement).closest('.wb-widget-edit-wrapper') as HTMLElement | null;

        if (!overElement || overElement === this.draggedElement) return;

        this.pendingDragOverEvent = { container, overElement, clientY: e.clientY };

        if (!this.dragOverScheduled) {
            this.dragOverScheduled = true;
            requestAnimationFrame(() => {
                if (this.pendingDragOverEvent && this.draggedElement) {
                    const { container, overElement, clientY } = this.pendingDragOverEvent;
                    const rect = overElement.getBoundingClientRect();
                    const isAfter = clientY > rect.top + rect.height / 2;
                    if (isAfter) {
                        container.insertBefore(this.draggedElement!, overElement.nextSibling);
                    } else {
                        container.insertBefore(this.draggedElement!, overElement);
                    }
                }
                this.dragOverScheduled = false;
            });
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

    /**
     * 表示モードを適用（パネル幅やクラス切替）
     * @param newModeClass 新しいモードクラス
     */
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

    /**
     * モーダルを閉じる
     */
    close() {
        if (this.isClosing || !this.isOpen) return; // 多重実行防止
        this.isClosing = true;
        const { modalEl } = this;
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
            requestAnimationFrame(() => {
                const fragment = document.createDocumentFragment();
                document.querySelectorAll(selector).forEach(el => {
                    if (el.parentElement === document.body) {
                        fragment.appendChild(el);
                    }
                });
                // dropping the fragment removes the nodes in batch
            });
        }, 300);
        document.body.classList.remove('wb-modal-open');
    }

    /**
     * モーダルが閉じられたときの後処理
     */
    onClose() {
        this.isOpen = false;
        this.isClosing = false;
        this.uiWidgetReferences.forEach(widgetInstance => {
            if (typeof (widgetInstance as any).handleHide === "function") {
                (widgetInstance as any).handleHide();
            }
        });
        const { contentEl } = this;
        contentEl.empty();
        this.uiWidgetReferences = [];
        document.body.classList.remove('wb-modal-open');
    }
}