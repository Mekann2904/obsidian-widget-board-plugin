// src/settingsDefaults.ts
import type { WidgetBoardSettings } from './interfaces';
import { DEFAULT_POMODORO_SETTINGS } from './widgets/pomodoroWidget';
// 他のウィジェットのデフォルト設定もインポートする場合はここに追加
// import { DEFAULT_MEMO_SETTINGS } from './widgets/memoWidget';

export const DEFAULT_SETTINGS: WidgetBoardSettings = {
    defaultMode: 'mode-right-third', // デフォルトの表示モード
    widgets: [ // デフォルトで表示されるウィジェットの初期リスト
        {
            id: 'default-pomodoro-' + Date.now(), // ユニークID
            type: 'pomodoro',                     // ウィジェットタイプ
            title: 'ポモドーロタイマー',             // ウィジェットのタイトル
            settings: { ...DEFAULT_POMODORO_SETTINGS } // ウィジェット固有設定
        }
    ]
};