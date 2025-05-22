// src/modal.ts
import { App } from 'obsidian';
import type WidgetBoardPlugin from './main';
import { registeredWidgetImplementations } from './widgetRegistry';
import type { WidgetImplementation, BoardConfiguration, WidgetConfig } from './interfaces';

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

    static readonly MODES = {
        RIGHT_HALF: 'mode-right-half',
        RIGHT_THIRD: 'mode-right-third',
        RIGHT_TWO_THIRD: 'mode-right-two-third',
        LEFT_TWO_THIRD: 'mode-left-two-third',
        LEFT_HALF: 'mode-left-half',
        LEFT_THIRD: 'mode-left-third',
        CENTER_HALF: 'mode-center-half',
        CENTER_THIRD: 'mode-center-third'
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
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this.uiWidgetReferences = [];

        this.applyMode(this.currentMode); // 現在のモードを適用

        // ヘッダー
        const headerEl = contentEl.createDiv({ cls: 'wb-panel-header' });
        headerEl.createEl('h3', { text: `ウィジェットボード: ${this.currentBoardConfig.name}` });

        // コントロール（表示モード切り替えボタンなど）
        const controlsEl = contentEl.createDiv({ cls: 'wb-panel-controls' });
        controlsEl.createEl('p', { text: '表示モード:' });
        this.modeButtons = [];

        const controlsToggleBtn = contentEl.createEl('button', { cls: 'wb-panel-controls-toggle', text: '表示モード' });
        controlsToggleBtn.onclick = () => {
            controlsEl.classList.toggle('is-visible');
        };
        controlsEl.classList.remove('is-visible'); // 初期は非表示

        // 表示モード切替ボタンの順序を「左33→左50→左66→中央→右66→右50→右33」に
        const modeButtonOrder = [
            WidgetBoardModal.MODES.LEFT_THIRD,
            WidgetBoardModal.MODES.LEFT_HALF,
            WidgetBoardModal.MODES.LEFT_TWO_THIRD,
            WidgetBoardModal.MODES.CENTER_THIRD,
            WidgetBoardModal.MODES.CENTER_HALF,
            WidgetBoardModal.MODES.RIGHT_TWO_THIRD,
            WidgetBoardModal.MODES.RIGHT_HALF,
            WidgetBoardModal.MODES.RIGHT_THIRD
        ];
        modeButtonOrder.forEach(modeClass => {
            let buttonText = '';
            if (modeClass === WidgetBoardModal.MODES.RIGHT_THIRD) buttonText = '右パネル（33vw）';
            else if (modeClass === WidgetBoardModal.MODES.RIGHT_HALF) buttonText = '右パネル（50vw）';
            else if (modeClass === WidgetBoardModal.MODES.RIGHT_TWO_THIRD) buttonText = '右パネル（66vw）';
            else if (modeClass === WidgetBoardModal.MODES.LEFT_TWO_THIRD) buttonText = '左パネル（66vw）';
            else if (modeClass === WidgetBoardModal.MODES.LEFT_HALF) buttonText = '左パネル（50vw）';
            else if (modeClass === WidgetBoardModal.MODES.LEFT_THIRD) buttonText = '左パネル（33vw）';
            else if (modeClass === WidgetBoardModal.MODES.CENTER_HALF) buttonText = '中央パネル（50vw）';
            else if (modeClass === WidgetBoardModal.MODES.CENTER_THIRD) buttonText = '中央パネル（33vw）';

            const button = controlsEl.createEl('button', { text: buttonText });
            button.dataset.mode = modeClass;
            button.onClickEvent(async () => {
                this.applyMode(modeClass);
                const boardToUpdate = this.plugin.settings.boards.find(b => b.id === this.currentBoardId);
                if (boardToUpdate) {
                    boardToUpdate.defaultMode = modeClass;
                    await this.plugin.saveSettings();
                }
            });
            this.modeButtons.push(button);
        });
        
        // ウィジェットコンテナ
        const widgetContainerEl = contentEl.createDiv({ cls: 'wb-widget-container' });
        this.loadWidgets(widgetContainerEl); // ウィジェットを読み込んで表示 (ここでuiWidgetReferencesが設定される)

        // loadWidgetsの後、表示された各ウィジェットに対してhandleShowを呼び出す (必要な場合)
        this.uiWidgetReferences.forEach(widgetInstance => {
            if (typeof (widgetInstance as any).handleShow === 'function') {
                (widgetInstance as any).handleShow();
            }
        });

        // モードボタンのアクティブ状態を更新
        this.updateModeButtonsActiveState();

        // 検索バーinputへのfocusガード
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

        // 開くときのアニメーション用クラス（requestAnimationFrameで若干遅延させる）
        requestAnimationFrame(() => {
            modalEl.classList.add('is-open');
        });
    }

    loadWidgets(container: HTMLElement) {
        container.empty();
        this.uiWidgetReferences = []; // 既存の参照をクリア

        const widgetsToLoad = this.currentBoardConfig.widgets;
        if (!widgetsToLoad || widgetsToLoad.length === 0) {
            container.createEl('p', {text: 'このボードに表示するウィジェットがありません。プラグイン設定でウィジェットを追加してください。'});
            return;
        }

        widgetsToLoad.forEach(widgetConfig => {
            // registeredWidgetImplementations には、各ウィジェットタイプの「クラス（コンストラクタ）」が格納されている
            const WidgetClass = registeredWidgetImplementations.get(widgetConfig.type) as (new () => WidgetImplementation) | undefined;
            if (WidgetClass) {
                try {
                    // newしてからcreateメソッドを呼ぶ
                    const widgetInstance = new WidgetClass();
                    const widgetElement = widgetInstance.create(widgetConfig, this.plugin.app, this.plugin);
                    container.appendChild(widgetElement);
                    // モーダル内で参照するために、このインスタンスを保存
                    this.uiWidgetReferences.push(widgetInstance);
                } catch (e: any) {
                    console.error(`Widget Board: Failed to create widget type '${widgetConfig.type}' (ID: ${widgetConfig.id}, Title: ${widgetConfig.title}). Error:`, e);
                    const errorEl = container.createDiv({cls: 'widget widget-error'});
                    errorEl.createEl('h4', {text: `${widgetConfig.title || '(名称未設定)'} (ロードエラー)`});
                    errorEl.createEl('p', {text: `このウィジェットの読み込み中にエラーが発生しました。`});
                    if (e.message) errorEl.createEl('p', {text: `エラー詳細: ${e.message}`});
                }
            } else {
                console.warn(`Widget Board: No implementation found for widget type '${widgetConfig.type}' (ID: ${widgetConfig.id})`);
                const unknownEl = container.createDiv({cls: 'widget widget-unknown'});
                unknownEl.createEl('h4', {text: `${widgetConfig.title || '(名称未設定)'} (不明な種類)`});
                unknownEl.createEl('p', {text: `ウィジェットの種類 '${widgetConfig.type}' は登録されていません。`});
            }
        });
    }

    applyMode(newModeClass: string) {
        const { modalEl } = this;
        const validModeClasses = Object.values(WidgetBoardModal.MODES) as string[];

        // すべてのモードクラスを一旦削除
        validModeClasses.forEach(cls => modalEl.classList.remove(cls));
        
        // 新しいモードクラスが有効なものであれば追加
        if (validModeClasses.includes(newModeClass)) {
            modalEl.classList.add(newModeClass);
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
        // Mapから即時削除（アニメーション中の重複防止）
        if (this.plugin.widgetBoardModals && this.plugin.widgetBoardModals.has(this.currentBoardId)) {
            this.plugin.widgetBoardModals.delete(this.currentBoardId);
        }
        modalEl.classList.remove('is-open');
        setTimeout(() => {
            this.onClose();
            // body内の同じdata-board-idを持つ全てのパネルを削除
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
        // Mapからの削除はclose()で行う

        // 表示されていたウィジェットインスタンスに対して非表示処理を実行
        this.uiWidgetReferences.forEach(widgetInstance => {
            if (typeof (widgetInstance as any).handleHide === 'function') {
                (widgetInstance as any).handleHide();
            }
        });
        
        // モーダルの内容をクリア
        const { contentEl } = this;
        contentEl.empty();
        
        // 参照をクリア
        this.uiWidgetReferences = []; 
    }
}