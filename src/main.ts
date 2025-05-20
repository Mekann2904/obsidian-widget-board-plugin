// src/main.ts
import { Plugin, Notice } from 'obsidian';
import type { WidgetBoardSettings, WidgetConfig } from './interfaces';
import { DEFAULT_SETTINGS } from './settingsDefaults';
import { WidgetBoardModal } from './modal';
import { WidgetBoardSettingTab } from './settingsTab';
import { registeredWidgetImplementations } from './widgetRegistry';
import { DEFAULT_POMODORO_SETTINGS } from './widgets/pomodoroWidget';
import { DEFAULT_MEMO_SETTINGS } from './widgets/memoWidget';
import { DEFAULT_CALENDAR_SETTINGS } from './widgets/calendarWidget';

export default class WidgetBoardPlugin extends Plugin {
    settings: WidgetBoardSettings;
    widgetBoardModal: WidgetBoardModal | null = null;

    async onload() {
        console.log('Widget Board Plugin: Loading...');
        
        await this.loadSettings();

        this.addCommand({
            id: 'open-widget-board',
            name: 'ウィジェットボードを開く (Open Widget Board)',
            callback: () => this.openWidgetBoard()
        });

        this.addRibbonIcon('layout-dashboard', 'ウィジェットボードを開く', () => this.openWidgetBoard());
        this.addSettingTab(new WidgetBoardSettingTab(this.app, this));
        
        console.log('Widget Board Plugin: Loaded.');
    }

    onunload() {
        if (this.widgetBoardModal && this.widgetBoardModal.isOpen) {
            this.widgetBoardModal.close();
        }

        registeredWidgetImplementations.forEach(widgetImpl => {
            if (widgetImpl.onunload) {
                widgetImpl.onunload();
            }
        });

        console.log('Widget Board Plugin: Unloaded.');
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        const defaultSettingsCopy = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        this.settings = Object.assign({}, defaultSettingsCopy, loadedData);

        if (!this.settings.widgets || !Array.isArray(this.settings.widgets)) {
            this.settings.widgets = [];
        }
        if (loadedData?.widgets === undefined && this.settings.widgets.length === 0 && defaultSettingsCopy.widgets.length > 0) {
            const defaultWidgetToAdd = JSON.parse(JSON.stringify(defaultSettingsCopy.widgets[0]));
            defaultWidgetToAdd.id = `${defaultWidgetToAdd.type}-widget-${Date.now()}`;
            this.settings.widgets.push(defaultWidgetToAdd);
        }
        
        this.settings.widgets.forEach((widget: WidgetConfig) => {
            if (widget.type === 'pomodoro') {
                widget.settings = { ...DEFAULT_POMODORO_SETTINGS, ...(widget.settings || {}) };
            } else if (widget.type === 'memo') {
                widget.settings = { ...DEFAULT_MEMO_SETTINGS, ...(widget.settings || {}) };
            } else if (widget.type === 'calendar') {
                widget.settings = { ...DEFAULT_CALENDAR_SETTINGS, ...(widget.settings || {}) };
            }
        });
    }

    async saveSettings() {
        await this.saveData(this.settings);
        if (this.widgetBoardModal && this.widgetBoardModal.isOpen) {
            if (this.widgetBoardModal.currentMode !== this.settings.defaultMode) {
                this.widgetBoardModal.applyMode(this.settings.defaultMode);
            }
            const widgetContainer = this.widgetBoardModal.contentEl.querySelector('.wb-widget-container');
            if (widgetContainer instanceof HTMLElement) {
                this.widgetBoardModal.loadWidgets(widgetContainer);
            }
        }
    }

    openWidgetBoard() {
        if (this.widgetBoardModal && this.widgetBoardModal.isOpen) {
            return;
        }

        const validModes = Object.values(WidgetBoardModal.MODES);
        if (!validModes.includes(this.settings.defaultMode as typeof WidgetBoardModal.MODES[keyof typeof WidgetBoardModal.MODES])) {
            new Notice(`無効なデフォルトモード '${this.settings.defaultMode}'。'${WidgetBoardModal.MODES.RIGHT_THIRD}' にフォールバックします。`);
            this.settings.defaultMode = WidgetBoardModal.MODES.RIGHT_THIRD;
        }

        this.widgetBoardModal = new WidgetBoardModal(this.app, this, this.settings.defaultMode);
        this.widgetBoardModal.open();
    }
}