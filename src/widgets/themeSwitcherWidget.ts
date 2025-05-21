import { App, setIcon, Notice } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main';

export interface ThemeSwitcherWidgetSettings {
    // 今後拡張用
}

export class ThemeSwitcherWidget implements WidgetImplementation {
    id = 'theme-switcher';
    private config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin;
    private widgetEl!: HTMLElement;

    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;

        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'theme-switcher-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);

        const titleEl = this.widgetEl.createEl('h4');
        titleEl.textContent = this.config.title?.trim() || 'テーマ切り替え';

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
        this.renderThemeSelector(contentEl);

        return this.widgetEl;
    }

    private renderThemeSelector(container: HTMLElement) {
        container.empty();
        // テーマ一覧取得
        const customCss = (this.app as any).customCss;
        if (!customCss) {
            container.createEl('p', { text: 'テーマ切り替えAPIが利用できません。' });
            return;
        }
        const themesRaw = customCss.themes;
        let themes: string[] = [];
        if (Array.isArray(themesRaw)) {
            themes = themesRaw;
        } else if (themesRaw && typeof themesRaw === 'object') {
            themes = Object.values(themesRaw)
                .map((t: any) => typeof t === 'string' ? t : t.name)
                .filter((name: any) => typeof name === 'string');
        }
        const currentTheme: string = customCss.theme || '';

        // テーマリストの先頭にデフォルトを追加
        themes = ['（デフォルト）', ...themes];

        // テーマ一覧リスト表示
        const listEl = container.createEl('ul', { cls: 'theme-switcher-list' });
        themes.forEach(themeName => {
            const itemEl = listEl.createEl('li', { cls: 'theme-switcher-item' });
            let displayName = themeName === '（デフォルト）' ? 'デフォルト（Obsidian）' : themeName;
            itemEl.textContent = displayName;
            if ((themeName === '（デフォルト）' && (currentTheme === '' || currentTheme === undefined)) || themeName === currentTheme) {
                itemEl.classList.add('active');
            }
            itemEl.onclick = () => {
                let selectedTheme = themeName === '（デフォルト）' ? '' : themeName;
                if ((selectedTheme === '' && (currentTheme === '' || currentTheme === undefined)) || selectedTheme === currentTheme) {
                    new Notice('すでにこのテーマが適用されています。');
                    return;
                }
                customCss.setTheme(selectedTheme);
                new Notice(`テーマ「${displayName}」を適用しました。`);
                this.renderThemeSelector(container);
            };
        });
    }
} 