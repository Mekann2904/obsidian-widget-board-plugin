// src/interfaces.ts
import { App } from 'obsidian';
import type WidgetBoardPlugin from './main'; // WidgetBoardPlugin の型情報をインポート

// --- ウィジェット設定のベース ---
export interface WidgetConfig {
    id: string;
    type: string;
    title: string;
    settings?: any; // TweetWidgetSettings なども含む
}

// --- ウィジェット実装のインターフェース ---
export interface WidgetImplementation {
    id: string;
    create(config: WidgetConfig, app: App, plugin: any): HTMLElement;
    onunload?(): void;
    updateExternalSettings?(newSettings: any, widgetId?: string): void;
}

// --- 個別のボード設定用インターフェース ---
export interface BoardConfiguration {
    id: string;
    name: string;
    defaultMode: string;
    widgets: WidgetConfig[];
    customWidth?: number;
    customWidthAnchor?: 'left' | 'center' | 'right';
}

// --- ボードグループ管理用インターフェース ---
export interface BoardGroup {
    id: string;
    name: string;
    boardIds: string[];
    hotkey?: string;
}

// --- LLMグローバル設定用インターフェース ---
export interface LLMSettings {
    gemini: {
        apiKey: string;
        model: string;
    };
    openai?: {
        apiKey: string;
        model: string;
        baseUrl: string;
    };
    // 他のLLMもここに追加可能
}

// --- プラグイン全体の新しいトップレベル設定インターフェース ---
export interface PluginGlobalSettings {
    boards: BoardConfiguration[];
    lastOpenedBoardId?: string;
    defaultBoardIdForQuickOpen?: string;
    pomodoroNotificationSound?: import("./widgets/pomodoroWidget").PomodoroSoundType;
    pomodoroNotificationVolume?: number;
    timerStopwatchNotificationSound?: import("./widgets/timerStopwatchWidget").TimerSoundType;
    timerStopwatchNotificationVolume?: number;
    pomodoroExportFormat?: import("./widgets/pomodoroWidget").PomodoroExportFormat;
    boardGroups?: BoardGroup[];
    openBoardOnPomodoroEnd?: boolean;
    autoStartNextPomodoroSession?: boolean;
    tweetDbLocation?: 'vault' | 'plugin' | 'custom';
    tweetDbCustomPath?: string;
    tweetWidgetAvatarUrl?: string;
    geminiApiKey?: string;
    llm?: LLMSettings;
    showAiHistory?: boolean;
    aiAvatarUrls?: string;
    /**
     * AIリプライの1分あたり発火上限（-1で無制限）
     */
    aiReplyRpm?: number;
    /**
     * AIリプライの1日あたり発火上限（-1で無制限）
     */
    aiReplyRpd?: number;
    /**
     * AIリプライをトリガーワードなしでも自動発火させる（trueで全投稿が候補）
     */
    aiReplyTriggerless?: boolean;
    /**
     * AIリプライの最小遅延（ms）
     */
    aiReplyDelayMinMs?: number;
    /**
     * AIリプライの最大遅延（ms）
     */
    aiReplyDelayMaxMs?: number;
    /**
     * AI議論の最大ターン数
     */
    aiDebateMaxTurns?: number;
    /**
     * AI議論の最大セット数
     */
    aiDebateMaxSets?: number;
    /**
     * 1セット内の各立場の発言回数
     */
    aiDebateMaxStatementPerSet?: number;
    /**
     * 1セット内の各立場の質問回数
     */
    aiDebateMaxQuestionPerSet?: number;
    /**
     * AI議論のリクエスト総数上限
     */
    aiDebateMaxTotalRequests?: number;
}