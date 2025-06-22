import type { Strings } from '../types';

export const RECENT_NOTES_STRINGS = {
  addRecentNotes: {
    ja: '最近編集したノート',
    en: 'Add recent notes',
    zh: '添加最近编辑的笔记',
    es: 'Añadir Notas Recientes',
    de: 'Zuletzt bearbeitete Notizen hinzufügen',
    fr: 'Ajouter des notes récentes',
    ko: '최근 편집한 노트 추가',
  },
  recentNotesTitle: {
    ja: '最近編集したノート',
    en: 'Recent notes',
    zh: '最近编辑的笔记',
    es: 'Notas Recientes',
    de: 'Zuletzt bearbeitete Notizen',
    fr: 'Notes Récentes',
    ko: '최근 편집한 노트',
  },
  noRecentNotes: {
    ja: '最近編集したノートがありません。',
    en: 'No recently edited notes.',
    zh: '没有最近编辑的笔记。',
    es: 'No hay notas editadas recientemente.',
    de: 'Keine kürzlich bearbeiteten Notizen.',
    fr: 'Aucune note récemment modifiée.',
    ko: '최근에 편집한 노트가 없습니다.',
  },
} as const satisfies Strings;
