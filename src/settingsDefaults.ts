// src/settingsDefaults.ts
import type { PluginGlobalSettings, BoardConfiguration } from './interfaces';
import { DEFAULT_POMODORO_SETTINGS } from './widgets/pomodoro';
import { REFLECTION_WIDGET_DEFAULT_SETTINGS } from './widgets/reflectionWidget/constants';
// 他のウィジェットのデフォルト設定もインポートする場合はここに追加
// import { DEFAULT_MEMO_SETTINGS } from './widgets/memoWidget';

const initialDefaultBoardId = 'default-board-' + Date.now();
export const DEFAULT_BOARD_CONFIGURATION: BoardConfiguration = {
    id: initialDefaultBoardId,
    name: 'マイウィジェットボード',
    defaultMode: 'mode-center-half',
    widgets: [
        {
            id: 'default-pomodoro-' + Date.now(),
            type: 'pomodoro',
            title: 'ポモドーロタイマー',
            settings: { ...DEFAULT_POMODORO_SETTINGS }
        },
        {
            id: 'default-reflection-' + Date.now(),
            type: 'reflection-widget',
            title: '振り返りレポート',
            settings: { ...REFLECTION_WIDGET_DEFAULT_SETTINGS }
        }
    ]
};

export const DEFAULT_PLUGIN_SETTINGS: PluginGlobalSettings = {
    boards: [DEFAULT_BOARD_CONFIGURATION],
    lastOpenedBoardId: initialDefaultBoardId,
    defaultBoardIdForQuickOpen: initialDefaultBoardId,
    pomodoroNotificationSound: DEFAULT_POMODORO_SETTINGS.notificationSound,
    pomodoroNotificationVolume: DEFAULT_POMODORO_SETTINGS.notificationVolume,
    timerStopwatchNotificationSound: 'default_beep',
    timerStopwatchNotificationVolume: 0.5,
    pomodoroExportFormat: 'none',
    boardGroups: [],
    openBoardOnPomodoroEnd: false,
    autoStartNextPomodoroSession: false,
    tweetWidgetAvatarUrl: '',
    geminiApiKey: '',
    llm: {
        gemini: {
            apiKey: '',
            model: 'gemini-2.0-flash-exp'
        }
    },
    showAiHistory: false,
    aiAvatarUrls: '',
    /** AIリプライの1分あたり発火上限（-1で無制限） */
    aiReplyRpm: 2,
    /** AIリプライの1日あたり発火上限（-1で無制限） */
    aiReplyRpd: 10,
    /** AIリプライをトリガーワードなしでも自動発火させる */
    aiReplyTriggerless: false,
    /** AIリプライの最小遅延（ms） */
    aiReplyDelayMinMs: 1500,
    /** AIリプライの最大遅延（ms） */
    aiReplyDelayMaxMs: 7000,
    baseFolder: '',
    defaultTweetPeriod: 'all',
    defaultTweetCustomDays: 1,
    userSummaryPromptToday: '',
    userSummaryPromptWeek: '',
    userTweetPrompt: '',
    tweetAiModel: 'gemini-1.5-flash-latest',
    reflectionAiModel: 'gemini-2.0-flash-exp',
    debugLogging: false,
};

// カレンダーウィジェットのデフォルト設定
export const DEFAULT_CALENDAR_SETTINGS = {
    dailyNoteFormat: 'YYYY-MM-DD',
};