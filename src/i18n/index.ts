import type { Language } from './types';
import { COMMON_STRINGS } from './strings/common';
import { SETTINGS_PANE_STRINGS, GLOBAL_SETTINGS_SECTIONS } from './strings/settings';
import { POMODORO_STRINGS } from './strings/pomodoro';
import { MEMO_STRINGS } from './strings/memo';
import { CALENDAR_STRINGS } from './strings/calendar';
import { TWEET_STRINGS } from './strings/tweet';
import { REFLECTION_WIDGET_STRINGS } from './strings/reflection';
import { LLM_STRINGS } from './strings/llm';
import { BOARD_MANAGEMENT_STRINGS, BOARD_GROUP_STRINGS } from './strings/board';
import { WIDGET_MANAGEMENT_STRINGS } from './strings/widget';
import { ERROR_MESSAGES } from './strings/error';
import { MODAL_STRINGS, MODAL_PANEL_STRINGS } from './strings/modal';
import { MAIN_STRINGS } from './strings/main';
import { WIDGET_STRINGS } from './strings/widgetStrings';
import { PREWARM_STRINGS } from './strings/prewarm';
import { RECENT_NOTES_STRINGS } from './strings/recentNotes';
import { THEME_SWITCHER_STRINGS } from './strings/themeSwitcher';
import { TIMER_STRINGS } from './strings/timer';
import { FILE_VIEW_STRINGS } from './strings/fileView';

export { widgetTypeName, type WidgetTypeKey } from './widgetTypeNames';
export type { Language };

export const LANGUAGE_NAMES: Record<Language, string> = {
  ja: '日本語',
  en: 'English',
  zh: '简体中文',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  ko: '한국어',
};

const productionStrings = {
  ...COMMON_STRINGS,
  ...SETTINGS_PANE_STRINGS,
  ...GLOBAL_SETTINGS_SECTIONS,
  ...POMODORO_STRINGS,
  ...MEMO_STRINGS,
  ...CALENDAR_STRINGS,
  ...TWEET_STRINGS,
  ...REFLECTION_WIDGET_STRINGS,
  ...LLM_STRINGS,
  ...BOARD_MANAGEMENT_STRINGS,
  ...WIDGET_MANAGEMENT_STRINGS,
  ...BOARD_GROUP_STRINGS,
  ...ERROR_MESSAGES,
  ...MODAL_STRINGS,
  ...MODAL_PANEL_STRINGS,
  ...MAIN_STRINGS,
  ...WIDGET_STRINGS,
  ...PREWARM_STRINGS,
  ...RECENT_NOTES_STRINGS,
  ...THEME_SWITCHER_STRINGS,
  ...TIMER_STRINGS,
  ...FILE_VIEW_STRINGS,
} as const;

export const TEST_STRINGS = {
  'test.placeholder': {
    ja: 'テスト: {{value}}',
    en: 'Test: {{value}}',
    zh: '测试: {{value}}',
    es: 'Prueba: {{value}}',
    de: 'Test: {{value}}',
    fr: 'Test: {{value}}',
    ko: '테스트: {{value}}',
  },
  'test.fallback': {
    ja: 'フォールバックテスト',
    en: 'Fallback test',
  },
} as const;

const STRINGS =
  process.env.NODE_ENV === 'test'
    ? { ...productionStrings, ...TEST_STRINGS }
    : productionStrings;

export type StringKey = keyof typeof STRINGS;

export function t(
  lang: Language,
  key: StringKey,
  vars?: Record<string, string | number>
): string {
  const v = STRINGS[key] as { [key in Language]?: string };
  if (!v) {
    // console.warn(`Translation key not found: ${key}`);
    return String(key);
  }
  let str: string = v[lang] ?? v['ja'] ?? key;
  if (vars) {
    Object.entries(vars).forEach(([k, val]) => {
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(val));
    });
  }
  return str;
}
