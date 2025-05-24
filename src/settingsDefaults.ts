// src/settingsDefaults.ts
import type { PluginGlobalSettings, BoardConfiguration } from './interfaces';
import { DEFAULT_POMODORO_SETTINGS } from './widgets/pomodoroWidget';
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
};