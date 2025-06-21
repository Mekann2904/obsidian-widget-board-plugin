import type { Language } from './types';

export const WIDGET_TYPE_NAMES = {
  ja: {
    'pomodoro': 'ポモドーロタイマー',
    'memo': 'メモ',
    'timer-stopwatch': 'タイマー/ストップウォッチ',
    'calendar': 'カレンダー',
    'recent-notes': '最近編集したノート',
    'theme-switcher': 'テーマ切り替え',
    'file-view-widget': 'ファイルビューア',
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
    'file-view-widget': 'File Viewer',
    'tweet-widget': 'Tweet',
    'reflection-widget': 'Reflection Report',
  },
  zh: {
    'pomodoro': '番茄钟',
    'memo': '备忘录',
    'timer-stopwatch': '计时器/秒表',
    'calendar': '日历',
    'recent-notes': '最近编辑的笔记',
    'theme-switcher': '主题切换器',
    'file-view-widget': '文件查看器',
    'tweet-widget': '推文',
    'reflection-widget': '复盘报告',
  },
  es: {
    'pomodoro': 'Temporizador Pomodoro',
    'memo': 'Memo',
    'timer-stopwatch': 'Temporizador/Cronómetro',
    'calendar': 'Calendario',
    'recent-notes': 'Notas Recientes',
    'theme-switcher': 'Cambiador de Tema',
    'file-view-widget': 'Visor de Archivos',
    'tweet-widget': 'Tweet',
    'reflection-widget': 'Informe de Reflexión',
  },
  de: {
    'pomodoro': 'Pomodoro-Timer',
    'memo': 'Memo',
    'timer-stopwatch': 'Timer/Stoppuhr',
    'calendar': 'Kalender',
    'recent-notes': 'Zuletzt bearbeitete Notizen',
    'theme-switcher': 'Theme-Umschalter',
    'file-view-widget': 'Dateibetrachter',
    'tweet-widget': 'Tweet',
    'reflection-widget': 'Reflexionsbericht',
  },
  fr: {
    'pomodoro': 'Minuteur Pomodoro',
    'memo': 'Mémo',
    'timer-stopwatch': 'Minuterie/Chronomètre',
    'calendar': 'Calendrier',
    'recent-notes': 'Notes récentes',
    'theme-switcher': 'Sélecteur de thème',
    'file-view-widget': 'Visionneuse de fichiers',
    'tweet-widget': 'Tweet',
    'reflection-widget': 'Rapport de réflexion',
  },
  ko: {
    'pomodoro': '포모도로 타이머',
    'memo': '메모',
    'timer-stopwatch': '타이머/스톱워치',
    'calendar': '캘린더',
    'recent-notes': '최근 노트',
    'theme-switcher': '테마 전환기',
    'file-view-widget': '파일 뷰어',
    'tweet-widget': '트윗',
    'reflection-widget': '리플렉션 리포트',
  },
} as const;

export type WidgetTypeKey = keyof typeof WIDGET_TYPE_NAMES['ja'];

export function widgetTypeName(lang: Language, type: WidgetTypeKey | string): string {
  // `type` might be a string that is not a WidgetTypeKey, so we need to handle that.
  if (type in WIDGET_TYPE_NAMES[lang]) {
    return WIDGET_TYPE_NAMES[lang][type as WidgetTypeKey];
  }
  return String(type);
} 