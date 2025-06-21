import type { Strings } from '../types';

export const PREWARM_STRINGS = {
	'prewarm.caching': {
		ja: 'キャッシュ中…',
		en: 'Caching...',
		zh: '缓存中…',
		es: 'Almacenando en caché...',
		de: 'Zwischenspeichern...',
		fr: 'Mise en cache...',
		ko: '캐싱 중...',
	},
	'prewarm.cacheComplete': {
		ja: 'キャッシュ完了',
		en: 'Caching complete',
		zh: '缓存完成',
		es: 'Almacenamiento en caché completo',
		de: 'Zwischenspeichern abgeschlossen',
		fr: 'Mise en cache terminée',
		ko: '캐싱 완료',
	},
	'prewarm.error': {
		ja: 'プリウォーム中にエラー:',
		en: 'Error during pre-warming:',
		zh: '预热期间出错：',
		es: 'Error durante el precalentamiento:',
		de: 'Fehler beim Vorwärmen:',
		fr: 'Erreur lors du préchauffage:',
		ko: '사전 준비 중 오류:',
	},
} as const satisfies Strings; 