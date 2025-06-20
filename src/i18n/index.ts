export type Language = 'ja' | 'en';

export const LANGUAGE_NAMES: Record<Language, string> = {
  ja: '日本語',
  en: 'English',
};

const STRINGS = {
  settingTabHeading: {
    ja: 'ウィジェットボード設定',
    en: 'Widget Board Settings',
  },
  addPomodoro: { ja: 'ポモドーロ追加', en: 'Add Pomodoro' },
  addMemo: { ja: 'メモ追加', en: 'Add Memo' },
  addCalendar: { ja: 'カレンダー追加', en: 'Add Calendar' },
  addRecentNotes: { ja: '最近編集したノート', en: 'Add Recent Notes' },
  addThemeSwitcher: { ja: 'テーマ切り替え', en: 'Add Theme Switcher' },
  addTimerStopwatch: { ja: 'タイマー／ストップウォッチ', en: 'Add Timer/Stopwatch' },
  addFileView: { ja: 'ファイルビューア追加', en: 'Add File Viewer' },
  addTweetWidget: { ja: 'つぶやき追加', en: 'Add Tweet' },
  addReflectionWidget: { ja: '振り返りレポート', en: 'Add Reflection Report' },
  languageSetting: { ja: '表示言語', en: 'Language' },
};

export function t(lang: Language, key: keyof typeof STRINGS): string {
  const v = STRINGS[key];
  return v[lang] ?? v.ja;
}

const WIDGET_TYPE_NAMES: Record<Language, Record<string, string>> = {
  ja: {
    'pomodoro': 'ポモドーロタイマー',
    'memo': 'メモ',
    'timer-stopwatch': 'タイマー/ストップウォッチ',
    'calendar': 'カレンダー',
    'recent-notes': '最近編集したノート',
    'theme-switcher': 'テーマ切り替え',
    'file-view': 'ファイルビューア',
    'tweet-widget': 'つぶやき',
    'reflection-widget': '振り返りレポート',
  },
  en: {
    'pomodoro': 'Pomodoro Timer',
    'memo': 'Memo',
    'timer-stopwatch': 'Timer/Stopwatch',
    'calendar': 'Calendar',
    'recent-notes': 'Recent Notes',
    'theme-switcher': 'Theme Switcher',
    'file-view': 'File Viewer',
    'tweet-widget': 'Tweet',
    'reflection-widget': 'Reflection Report',
  },
};

export function widgetTypeName(lang: Language, type: string): string {
  return WIDGET_TYPE_NAMES[lang][type] || type;
}
