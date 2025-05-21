// src/modal.ts
import { App, Modal } from 'obsidian';
import type WidgetBoardPlugin from './main';
import { registeredWidgetImplementations } from './widgetRegistry';
import type { WidgetImplementation, BoardConfiguration, WidgetConfig } from './interfaces';

export class WidgetBoardModal extends Modal {
    plugin: WidgetBoardPlugin;
    currentBoardConfig: BoardConfiguration;
    currentBoardId: string;
    currentMode: string;
    isOpen: boolean = false;
    modeButtons: HTMLButtonElement[] = [];
    // WidgetImplementation を直接格納し、必要に応じて型ガードやメソッド存在チェックを行う
    private uiWidgetReferences: WidgetImplementation[] = [];

    static readonly MODES = {
        RIGHT_HALF: 'mode-right-half',
        RIGHT_THIRD: 'mode-right-third',
        LEFT_TWO_THIRD: 'mode-left-two-third',
        LEFT_HALF: 'mode-left-half',
        CENTER_HALF: 'mode-center-half'
    } as const;

    constructor(app: App, plugin: WidgetBoardPlugin, boardConfig: BoardConfiguration) {
        super(app);
        this.plugin = plugin;
        this.currentBoardConfig = JSON.parse(JSON.stringify(boardConfig));
        this.currentBoardId = boardConfig.id;
        const validModes = Object.values(WidgetBoardModal.MODES);
        if (!validModes.includes(this.currentBoardConfig.defaultMode as any)) {
            this.currentMode = WidgetBoardModal.MODES.RIGHT_THIRD;
        } else {
            this.currentMode = this.currentBoardConfig.defaultMode;
        }
        this.modalEl.addClass('widget-board-panel-custom'); // カスタムスタイル用クラス

        // Escapeキーで閉じるイベントを登録
        this.scope.register([], "Escape", this.close.bind(this));
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

    onOpen() {
        this.isOpen = true;
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this.uiWidgetReferences = [];
        if (this.modalEl.querySelector('.modal-bg')) {
            const bgEl = this.modalEl.querySelector('.modal-bg') as HTMLElement;
            bgEl.style.display = 'none'; // 背景を非表示 (パネル風にするため)
        }

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

        Object.entries(WidgetBoardModal.MODES).forEach(([key, modeClassValue]) => {
            const modeClass = modeClassValue as typeof WidgetBoardModal.MODES[keyof typeof WidgetBoardModal.MODES];
            let buttonText = '';
            if (modeClass === WidgetBoardModal.MODES.RIGHT_THIRD) buttonText = '右パネル（33vw）';
            else if (modeClass === WidgetBoardModal.MODES.RIGHT_HALF) buttonText = '右パネル（50vw）';
            else if (modeClass === WidgetBoardModal.MODES.LEFT_TWO_THIRD) buttonText = '左パネル（66vw）';
            else if (modeClass === WidgetBoardModal.MODES.LEFT_HALF) buttonText = '左パネル（50vw）';
            else if (modeClass === WidgetBoardModal.MODES.CENTER_HALF) buttonText = '中央パネル（50vw）';

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
            // registeredWidgetImplementations には、各ウィジェットタイプの「シングルトン」インスタンスが格納されている
            const widgetInstanceController = registeredWidgetImplementations.get(widgetConfig.type);
            
            if (widgetInstanceController) {
                try {
                    // createメソッドを呼び出し、設定に基づいてHTML要素を生成・構成する
                    // このcreateメソッドは、ウィジェットの表示状態を初期化/更新する役割も持つ
                    const widgetElement = widgetInstanceController.create(widgetConfig, this.app, this.plugin);
                    container.appendChild(widgetElement);
                    // モーダル内で参照するために、このコントローラーインスタンスを保存
                    this.uiWidgetReferences.push(widgetInstanceController);
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
        // アニメーションのために is-open クラスを削除し、その後スーパークラスの close を呼ぶ
        const { modalEl } = this;
        modalEl.classList.remove('is-open');
        
        // アニメーション時間（例: 300ms）待ってからモーダルを閉じるスーパークラスのメソッドを呼ぶ
        // これにより、見た目のトランジションが完了してからモーダルが非表示/破棄される
        setTimeout(() => {
            super.close(); // この中で onClose が呼ばれる
        }, 300); // CSSのトランジション時間と一致させる
    }

    onClose() {
        this.isOpen = false;

        // 表示されていたウィジェットインスタンスに対して非表示処理を実行
        this.uiWidgetReferences.forEach(widgetInstance => {
            if (typeof (widgetInstance as any).handleHide === 'function') {
                (widgetInstance as any).handleHide();
            }
        });
        
        // プラグイン側のモーダル参照をクリア
        if (this.plugin.widgetBoardModal === this) {
            this.plugin.widgetBoardModal = null;
        }

        // モーダルの内容をクリア
        const { contentEl } = this;
        contentEl.empty();
        
        // 参照をクリア
        this.uiWidgetReferences = []; 
    }
}