// src/interfaces.ts
import { App } from 'obsidian';
import type WidgetBoardPlugin from './main'; // WidgetBoardPlugin の型情報をインポート

// --- 設定インターフェース群 (ウィジェット固有のものは各ウィジェットファイルへ移動) ---
export interface WidgetBoardSettings {
    defaultMode: string;
    widgets: WidgetConfig[];
}

// --- ウィジェット設定のベース ---
export interface WidgetConfig {
    id: string;
    type: string;
    title: string;
    settings?: any; // 各ウィジェット固有の設定オブジェクト
}

// --- ウィジェット実装のインターフェース ---
export interface WidgetImplementation {
    id: string; // ウィジェットのタイプ識別子 (e.g., 'pomodoro', 'memo')
    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement;
    onunload?(): void;
    updateExternalSettings?(newSettings: any, widgetId?: string): void;
    // 必要であれば、getWidgetIdなどのメソッドもここに追加できる
}