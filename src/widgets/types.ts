import { App } from 'obsidian';

// --- ウィジェット設定のベース ---
export interface WidgetConfig {
    id: string;
    type: string; // 例: 'pomodoro', 'memo', 'tweet-widget', 'reflection-widget' など
    title: string;
    settings?: any; // TweetWidgetSettings, ReflectionWidgetSettings なども含む
}

// --- ウィジェット実装のインターフェース ---
export interface WidgetImplementation {
    id: string;
    create(config: WidgetConfig, app: App, plugin: any): HTMLElement;
    onunload?(): void;
    updateExternalSettings?(newSettings: any, widgetId?: string): void;
} 