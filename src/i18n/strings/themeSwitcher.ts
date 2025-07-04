import type { Strings } from '../types';

export const THEME_SWITCHER_STRINGS = {
  addThemeSwitcher: {
    ja: 'テーマ切り替え',
    en: 'Add theme switcher',
    zh: '添加主题切换器',
    es: 'Añadir Cambiador de Tema',
    de: 'Theme-Umschalter hinzufügen',
    fr: 'Ajouter un sélecteur de thème',
    ko: '테마 전환기 추가',
  },
  themeSwitcherTitle: {
    ja: 'テーマ切り替え',
    en: 'Theme switcher',
    zh: '主题切换器',
    es: 'Cambiador de Tema',
    de: 'Theme-Umschalter',
    fr: 'Sélecteur de thème',
    ko: '테마 전환기',
  },
  apiUnavailable: {
    ja: 'テーマ切り替えAPIが利用できません。',
    en: 'Theme switcher API is not available.',
    zh: '主题切换器API不可用。',
    es: 'La API del cambiador de tema no está disponible.',
    de: 'Theme-Umschalter-API ist nicht verfügbar.',
    fr: "L'API du sélecteur de thème n'est pas disponible.",
    ko: '테마 전환기 API를 사용할 수 없습니다.',
  },
  defaultThemeName: {
    ja: 'デフォルト（Obsidian）',
    en: 'Default (Obsidian)',
    zh: '默认 (Obsidian)',
    es: 'Predeterminado (Obsidian)',
    de: 'Standard (Obsidian)',
    fr: 'Défaut (Obsidian)',
    ko: '기본값 (Obsidian)',
  },
  themeAlreadyApplied: {
    ja: 'すでにこのテーマが適用されています。',
    en: 'This theme is already applied.',
    zh: '此主题已被应用。',
    es: 'Este tema ya está aplicado.',
    de: 'Dieses Theme ist bereits angewendet.',
    fr: 'Ce thème est déjà appliqué.',
    ko: '이 테마는 이미 적용되었습니다.',
  },
  themeApplied: {
    ja: 'テーマ「{{themeName}}」を適用しました。',
    en: 'Applied theme "{{themeName}}".',
    zh: '已应用主题"{{themeName}}"。',
    es: 'Se aplicó el tema "{{themeName}}".',
    de: 'Theme "{{themeName}}" angewendet.',
    fr: 'Thème "{{themeName}}" appliqué.',
    ko: '"{{themeName}}" 테마를 적용했습니다.',
  },
} as const satisfies Strings;
