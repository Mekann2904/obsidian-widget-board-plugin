// src/interfaces.ts
import { App } from 'obsidian';
import type WidgetBoardPlugin from './main'; // WidgetBoardPlugin の型情報をインポート

// --- ウィジェット設定のベース ---
export interface WidgetConfig {
    id: string;
    type: string; // 例: 'pomodoro', 'memo', 'tweet-widget', 'reflection-widget' など
    title: string;
    settings?: unknown; // TweetWidgetSettings, ReflectionWidgetSettings なども含む
}

// --- ウィジェット実装のインターフェース ---
export interface WidgetImplementation {
    id: string;
    create(
        config: WidgetConfig,
        app: App,
        plugin: WidgetBoardPlugin,
        preloadBundle?: unknown
    ): HTMLElement;
    onunload?(): void;
    updateExternalSettings?(newSettings: unknown, widgetId?: string): void;
    /** Optionally refresh the widget's internal state */
    refresh?(): void;
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
    pomodoroNotificationSound?: import("./widgets/pomodoro").PomodoroSoundType;
    pomodoroNotificationVolume?: number;
    timerStopwatchNotificationSound?: import("./widgets/timer-stopwatch").TimerSoundType;
    timerStopwatchNotificationVolume?: number;
    pomodoroExportFormat?: import("./widgets/pomodoro").PomodoroExportFormat;
    boardGroups?: BoardGroup[];
    openBoardOnPomodoroEnd?: boolean;
    autoStartNextPomodoroSession?: boolean;
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
     * 全ウィジェット共通のデータ保存先となるVault内のフォルダ
     */
    baseFolder?: string;
    defaultTweetPeriod?: string;
    defaultTweetCustomDays?: number;
    userSummaryPromptToday?: string; // ユーザカスタムプロンプト（今日用）
    userSummaryPromptWeek?: string;  // ユーザカスタムプロンプト（今週用）
    userTweetPrompt?: string;        // ユーザカスタムプロンプト（つぶやき用）
    /** つぶやきAI返信用のモデル名（空欄で共通モデルを使用） */
    tweetAiModel?: string;
    /** 振り返りAI要約用のモデル名（空欄で共通モデルを使用） */
    reflectionAiModel?: string;
    /**
     * カレンダーウィジェットのデイリーノートファイル名フォーマット（グローバル設定）
     */
    calendarDailyNoteFormat?: string;
    /**
     * 週の開始曜日 (0=日曜, 1=月曜 ... 6=土曜)
     */
    weekStartDay?: number;
    /** デバッグログ出力を有効にする */
    debugLogging?: boolean;
    /**
     * ユーザー一覧（グローバル）
     */
    userProfiles?: { userName: string; userId: string; avatarUrl: string }[];
    /** デバッグ用ログ出力（trueで詳細ログを出す） */
    debugLog?: boolean;
}

// 共通型があればここに記載