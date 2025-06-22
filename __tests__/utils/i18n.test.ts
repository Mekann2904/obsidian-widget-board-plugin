import { t, widgetTypeName, LANGUAGE_NAMES, Language } from '../../src/i18n';
import * as i18n from '../../src/i18n';

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
      expect(t('ja', 'test.placeholder' as any, { value: 'HOGE' })).toBe('テスト: HOGE');
    });

    it('should fall back to Japanese if translation is missing', () => {
      expect(t('ko', 'test.fallback' as any)).toBe('フォールバックテスト');
    });

    it('should handle non-existent keys gracefully', () => {
      expect(t('en', 'aNonExistentKey' as any)).toBe('aNonExistentKey');
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

describe('i18nカテゴリ統合テスト', () => {
  const testCases = {
    // COMMON_STRINGS
    'show': { ja: '表示', en: 'Show' },
    // SETTINGS_PANE_STRINGS
    'settingTabHeading': { ja: 'ウィジェットボード設定', en: 'Widget board settings' },
    // POMODORO_STRINGS
    'addPomodoro': { ja: 'ポモドーロ追加', en: 'Add pomodoro' },
    // MEMO_STRINGS
    'addMemo': { ja: 'メモ追加', en: 'Add memo' },
    // CALENDAR_STRINGS
    'addCalendar': { ja: 'カレンダー追加', en: 'Add calendar' },
    // TWEET_STRINGS
    'addTweetWidget': { ja: 'つぶやき追加', en: 'Add tweet' },
    // REFLECTION_WIDGET_STRINGS
    'addReflectionWidget': { ja: '振り返りレポート', en: 'Add reflection report' },
    // LLM_STRINGS
    'geminiApiKey': { ja: 'Gemini APIキー', en: 'Gemini API key' },
    // BOARD_MANAGEMENT_STRINGS
    'boardManagement': { ja: 'ボード管理', en: 'Board management' },
    // BOARD_GROUP_STRINGS
    'addNewGroup': { ja: '新しいグループを追加', en: 'Add new group' },
    // WIDGET_MANAGEMENT_STRINGS
    'widgetManagement': { ja: 'ウィジェット管理', en: 'Widget management' },
    // ERROR_MESSAGES
    'vaultRelativePathOnly': { ja: 'Vault内の相対パスのみ指定できます。絶対パスやVault外は不可です。', en: 'Only relative paths within the Vault are allowed. Absolute paths or outside the Vault are not permitted.' },
    // MAIN_STRINGS
    'openWidgetBoard': { ja: 'ウィジェットボードを開く', en: 'Open widget board' },
    // RECENT_NOTES_STRINGS
    'addRecentNotes': { ja: '最近編集したノート', en: 'Add recent notes' },
    // THEME_SWITCHER_STRINGS
    'addThemeSwitcher': { ja: 'テーマ切り替え', en: 'Add theme switcher' },
    // TIMER_STRINGS
    'addTimerStopwatch': { ja: 'タイマー／ストップウォッチ', en: 'Add timer/stopwatch' },
    // FILE_VIEW_STRINGS
    'addFileView': { ja: 'ファイルビューア追加', en: 'Add file viewer' },
  };

  Object.entries(testCases).forEach(([key, translations]) => {
    it(`${key} が正しく翻訳される`, () => {
      expect(t('ja', key as any)).toBe(translations.ja);
      expect(t('en', key as any)).toBe(translations.en);
    });
  });
}); 