import { App } from 'obsidian';
import type WidgetBoardPlugin from '../../main';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type { ReflectionWidgetSettings } from './reflectionWidgetTypes';
// Utility functions are provided by the UI module
import { ReflectionWidgetUI } from './reflectionWidgetUI';
import { REFLECTION_WIDGET_DEFAULT_SETTINGS } from './constants';

// プリロードバンドル型を定義
export interface ReflectionWidgetPreloadBundle {
    chartModule: unknown;
    todaySummary: { summary: string|null, html: string|null, postCount: number };
    weekSummary: { summary: string|null, html: string|null, postCount: number };
}

export class ReflectionWidget implements WidgetImplementation {
    id = 'reflection-widget';
    private autoTimer: number | null = null;
    private chart: unknown | null = null;
    private lastChartData: number[] | null = null;
    private lastTodaySummary: string | null = null;
    private lastWeekSummary: string | null = null;
    private ui: ReflectionWidgetUI | null = null;
    public config!: WidgetConfig;
    public app!: App;
    public plugin!: WidgetBoardPlugin;

    // プリロードバンドルを受け取れるように拡張
    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin, preloadBundle?: unknown): HTMLElement {
        const initialConfig = config || {
            id: `reflection-widget-${Date.now()}`,
            type: 'reflection-widget',
            title: 'リフレクション',
            settings: {},
        };

        // デフォルト設定と渡された設定をマージして、最終的な設定を決定します
        this.config = {
            ...initialConfig,
            settings: {
                ...REFLECTION_WIDGET_DEFAULT_SETTINGS,
                ...(initialConfig.settings as ReflectionWidgetSettings || {}),
            },
        };

        this.app = app;
        this.plugin = plugin;
        const el = document.createElement('div');
        el.className = 'widget reflection-widget';
        this.ui = new ReflectionWidgetUI(this, el, this.config, app, plugin, preloadBundle as any);
        this.ui.render();
        return el;
    }

    // 外部から設定変更時に呼ばれる
    // _widgetId is required by the interface but unused here
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public updateExternalSettings(newSettings: Partial<ReflectionWidgetSettings>, _widgetId?: string) {
        if (this.config && this.config.settings) {
            Object.assign(this.config.settings, newSettings);
            this.refresh();
        }
    }

    // 状態変化時にUIを再描画
    public refresh() {
        this.ui?.scheduleRender();
    }

    // データ取得や状態管理のメソッドはここに残す
}

// Widget登録用（必要に応じて）
export default ReflectionWidget; 