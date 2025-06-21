import { t, widgetTypeName, LANGUAGE_NAMES, Language } from '../../src/i18n';

describe('i18n', () => {
  describe('t', () => {
    it('should return Japanese translation', () => {
      expect(t('ja', 'show')).toBe('表示');
    });

    it('should return English translation', () => {
      expect(t('en', 'show')).toBe('Show');
    });

    it('should return Chinese translation', () => {
      expect(t('zh', 'show')).toBe('显示');
    });

    it('should return Spanish translation', () => {
      expect(t('es', 'show')).toBe('Mostrar');
    });

    it('should return German translation', () => {
      expect(t('de', 'show')).toBe('Anzeigen');
    });

    it('should return French translation', () => {
      expect(t('fr', 'show')).toBe('Afficher');
    });

    it('should return Korean translation', () => {
      expect(t('ko', 'show')).toBe('표시');
    });

    it('should handle placeholders', () => {
      expect(t('ja', 'test.placeholder', { value: 'HOGE' })).toBe('テスト: HOGE');
    });

    it('should fall back to Japanese if translation is missing', () => {
      expect(t('ko', 'test.fallback')).toBe('フォールバックテスト');
    });

    it('should handle non-existent keys gracefully', () => {
      // @ts-expect-error
      expect(t('en', 'aNonExistentKey')).toBe('aNonExistentKey');
    });
  });

  describe('widgetTypeName', () => {
    const widgetTypes: { [key: string]: string } = {
      memo: 'Memo',
      'recent-notes': 'Recent Notes',
      'file-view-widget': 'File Viewer',
      calendar: 'Calendar',
      'timer-stopwatch': 'Timer/Stopwatch',
      pomodoro: 'Pomodoro Timer',
      'theme-switcher': 'Theme Switcher',
      'tweet-widget': 'Tweet',
      'reflection-widget': 'Reflection Report',
    };

    Object.entries(widgetTypes).forEach(([key, name]) => {
      it(`should return the correct name for ${key} in English`, () => {
        expect(widgetTypeName('en', key)).toBe(name);
      });
    });

    it('should return Japanese name for memo', () => {
      expect(widgetTypeName('ja', 'memo')).toBe('メモ');
    });

    it('should return the key if the widget type is not found', () => {
      expect(widgetTypeName('en', 'non-existent-widget')).toBe(
        'non-existent-widget',
      );
    });

    it('should work for all languages', () => {
      const languages: Language[] = ['ja', 'en', 'zh', 'es', 'de', 'fr', 'ko'];
      languages.forEach(lang => {
        expect(widgetTypeName(lang, 'memo')).toBeTruthy();
      });
    });
  });
});

describe('LANGUAGE_NAMES', () => {
  it('jaとenのラベルが設定されている', () => {
    expect(LANGUAGE_NAMES.ja).toBeDefined();
    expect(LANGUAGE_NAMES.en).toBeDefined();
  });
}); 