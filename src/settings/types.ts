import type { WidgetConfig } from '../interfaces';
import type { LLMSettings } from '../llm/types';

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

// --- プラグイン全体の新しいトップレベル設定インターフェース ---
export interface PluginGlobalSettings {
    boards: BoardConfiguration[];
    lastOpenedBoardId?: string;
    defaultBoardIdForQuickOpen?: string;
    pomodoroNotificationSound?: import("../widgets/pomodoro").PomodoroSoundType;
    pomodoroNotificationVolume?: number;
    timerStopwatchNotificationSound?: import("../widgets/timer-stopwatch").TimerSoundType;
    timerStopwatchNotificationVolume?: number;
    pomodoroExportFormat?: import("../widgets/pomodoro").PomodoroExportFormat;
    boardGroups?: BoardGroup[];
    openBoardOnPomodoroEnd?: boolean;
    autoStartNextPomodoroSession?: boolean;
    tweetWidgetAvatarUrl?: string;
    geminiApiKey?: string;
    llm?: LLMSettings;
    showAiHistory?: boolean;
    aiAvatarUrls?: string;
    aiReplyRpm?: number;
    aiReplyRpd?: number;
    aiReplyTriggerless?: boolean;
    aiReplyDelayMinMs?: number;
    aiReplyDelayMaxMs?: number;
    baseFolder?: string;
    defaultTweetPeriod?: string;
    defaultTweetCustomDays?: number;
    userSummaryPromptToday?: string;
    userSummaryPromptWeek?: string;
    userTweetPrompt?: string;
    debugLogging?: boolean;
}
