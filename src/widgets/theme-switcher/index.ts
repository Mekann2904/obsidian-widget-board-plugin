import { App, Notice } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main';
import { applyWidgetSize, createWidgetContainer } from '../../utils';
import { t } from '../../i18n';

export type ThemeSwitcherWidgetSettings = Record<string, never>;

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
        // no initialization needed
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

        const { widgetEl, titleEl } = createWidgetContainer(config, 'theme-switcher-widget');
        this.widgetEl = widgetEl;
        if (titleEl) {
            titleEl.textContent = this.config.title?.trim() || t(this.plugin.settings.language || 'ja', 'themeSwitcherTitle');
        }

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
        this.renderThemeSelector(contentEl);

        // 追加: YAMLで大きさ指定があれば反映
        applyWidgetSize(this.widgetEl, config.settings as { width?: string; height?: string } | null);

        return this.widgetEl;
    }

    /**
     * テーマ選択UIを描画
     */
    private renderThemeSelector(container: HTMLElement) {
        container.empty();
        // テーマ一覧取得
        interface CustomCssManager {
            themes: unknown;
            theme?: string;
            setTheme(id: string): void;
        }
        const customCss = (this.app as unknown as { customCss?: CustomCssManager }).customCss;
        if (!customCss) {
            container.createEl('p', { text: t(this.plugin.settings.language || 'ja', 'apiUnavailable') });
            return;
        }
        const themesRaw = customCss?.themes;
        let themes: string[] = [];
        if (Array.isArray(themesRaw)) {
            themes = themesRaw as string[];
        } else if (themesRaw && typeof themesRaw === 'object') {
            themes = Object.values(themesRaw as Record<string, { name: string } | string>)
                .map(t => (typeof t === 'string' ? t : t.name))
                .filter((name): name is string => typeof name === 'string');
        }
        const currentTheme: string = customCss?.theme || '';

        // --- デフォルトテーマを1つにまとめる ---
        const defaultTheme = { id: '', name: t(this.plugin.settings.language || 'ja', 'defaultThemeName') };
        const customThemes = themes.filter(t => t !== '' && t !== 'moonstone');
        const allThemes = [defaultTheme, ...customThemes.map(t => ({ id: t, name: t }))];

        const listEl = container.createEl('ul', { cls: 'theme-switcher-list' });
        const liElements: HTMLElement[] = [];

        allThemes.forEach(theme => {
            const itemEl = listEl.createEl('li', { cls: 'theme-switcher-item' });
            itemEl.textContent = theme.name;
            if ((theme.id === '' && (currentTheme === '' || currentTheme === undefined)) ||
                (theme.id !== '' && currentTheme === theme.id)) {
                itemEl.classList.add('active');
            }
            itemEl.onclick = () => {
                if ((theme.id === '' && (customCss.theme === '' || customCss.theme === undefined)) ||
                    (theme.id !== '' && customCss.theme === theme.id)) {
                    new Notice(t(this.plugin.settings.language || 'ja', 'themeAlreadyApplied'));
                    return;
                }
                customCss?.setTheme(theme.id);
                // テーマ適用後は現在のテーマ名も更新する
                if (customCss) customCss.theme = theme.id;
                new Notice(t(this.plugin.settings.language || 'ja', 'themeApplied', { themeName: theme.name }));
                // ここでactiveクラスだけ付け替える
                liElements.forEach(li => li.classList.remove('active'));
                itemEl.classList.add('active');
            };
            liElements.push(itemEl);
        });
    }
} 