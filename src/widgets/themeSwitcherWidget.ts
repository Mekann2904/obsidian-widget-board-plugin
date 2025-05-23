import { App, setIcon, Notice } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main';

export interface ThemeSwitcherWidgetSettings {
    // 今後拡張用
}

/**
 * テーマ切り替えウィジェット
 * - Obsidianのテーマ一覧を表示し、クリックで即時切り替え
 */
export class ThemeSwitcherWidget implements WidgetImplementation {
    id = 'theme-switcher';
    private config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin;
    private widgetEl!: HTMLElement;

    /**
     * インスタンス初期化
     */
    constructor() {
        // ... 既存コード ...
    }

    /**
     * ウィジェットのDOM生成・初期化
     * @param config ウィジェット設定
     * @param app Obsidianアプリ
     * @param plugin プラグイン本体
     */
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

    /**
     * テーマ選択UIを描画
     */
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

        // --- デフォルトテーマを1つにまとめる ---
        const defaultTheme = { id: '', name: 'デフォルト（Obsidian）' };
        const customThemes = themes.filter(t => t !== '' && t !== 'moonstone');
        const listEl = container.createEl('ul', { cls: 'theme-switcher-list' });
        const allThemes = [defaultTheme, ...customThemes.map(t => ({ id: t, name: t }))];

        allThemes.forEach(theme => {
            const itemEl = listEl.createEl('li', { cls: 'theme-switcher-item' });
            itemEl.textContent = theme.name;
            if ((theme.id === '' && (currentTheme === '' || currentTheme === undefined)) ||
                (theme.id !== '' && currentTheme === theme.id)) {
                itemEl.classList.add('active');
            }
            itemEl.onclick = () => {
                if ((theme.id === '' && (currentTheme === '' || currentTheme === undefined)) ||
                    (theme.id !== '' && currentTheme === theme.id)) {
                    new Notice('すでにこのテーマが適用されています。');
                    return;
                }
                customCss.setTheme(theme.id);
                new Notice(`テーマ「${theme.name}」を適用しました。`);
                this.renderThemeSelector(container);
            };
        });
    }
} 