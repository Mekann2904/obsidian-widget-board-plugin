// import type { STRINGS, WIDGET_TYPE_NAMES } from './strings';

export type Language = 'ja' | 'en' | 'zh' | 'es' | 'de' | 'fr' | 'ko';

export type LanguageRecord = {
	[lang in Language]?: string;
};

export type Strings = Record<string, LanguageRecord | string>;

// export type StringKey = keyof typeof STRINGS;
// export type WidgetTypeKey = keyof typeof WIDGET_TYPE_NAMES['ja']; 