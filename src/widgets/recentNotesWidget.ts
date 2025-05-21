import { App, TFile, setIcon, moment } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main';

export interface RecentNotesWidgetSettings {
    maxNotes?: number;
}

export const DEFAULT_RECENT_NOTES_SETTINGS: RecentNotesWidgetSettings = {
    maxNotes: 10,
};

export class RecentNotesWidget implements WidgetImplementation {
    id = 'recent-notes';
    private config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin;
    private widgetEl!: HTMLElement;
    private currentSettings!: RecentNotesWidgetSettings;

    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;
        this.currentSettings = { ...DEFAULT_RECENT_NOTES_SETTINGS, ...(config.settings || {}) };
        config.settings = this.currentSettings;

        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'recent-notes-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);

        const titleEl = this.widgetEl.createEl('h4');
        titleEl.textContent = this.config.title?.trim() || '最近編集したノート';

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
        this.renderNotesList(contentEl);

        return this.widgetEl;
    }

    private renderNotesList(container: HTMLElement) {
        container.empty();
        const files = this.app.vault.getFiles()
            .filter(f => f.extension === 'md')
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, this.currentSettings.maxNotes || 10);

        if (files.length === 0) {
            container.createEl('p', { text: '最近編集したノートがありません。' });
            return;
        }

        const listEl = container.createEl('ul', { cls: 'recent-notes-list' });
        files.forEach(file => {
            const itemEl = listEl.createEl('li', { cls: 'recent-note-item' });
            const linkEl = itemEl.createEl('a', { text: file.basename, href: '#' });
            linkEl.onclick = (e) => {
                e.preventDefault();
                this.app.workspace.openLinkText(file.path, '', false);
            };
            const dateStr = moment(file.stat.mtime).format('YYYY/MM/DD HH:mm');
            itemEl.createSpan({ text: ` (${dateStr})`, cls: 'recent-note-date' });
        });
    }

    // 設定変更時などに外部から呼ばれる想定
    updateExternalSettings(newSettings: Partial<RecentNotesWidgetSettings>) {
        this.currentSettings = { ...this.currentSettings, ...newSettings };
        if (this.config && this.config.settings) {
            Object.assign(this.config.settings, this.currentSettings);
        }
        const contentEl = this.widgetEl.querySelector('.widget-content') as HTMLElement;
        if (contentEl) this.renderNotesList(contentEl);
    }
} 