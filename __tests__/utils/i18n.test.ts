import { t, widgetTypeName, LANGUAGE_NAMES, Language } from '../../src/i18n';

describe('i18n t関数', () => {
  it('日本語で正しい値を返す', () => {
    expect(t('ja', 'show')).toBe('表示');
    expect(t('ja', 'hide')).toBe('非表示');
  });
  it('英語で正しい値を返す', () => {
    expect(t('en', 'show')).toBe('Show');
    expect(t('en', 'hide')).toBe('Hide');
  });
  it('未定義言語でもjaを返す', () => {
    // @ts-expect-error 故意に不正値
    expect(t('xx', 'show')).toBe('表示');
  });
  it('未定義キーの場合は空文字列', () => {
    // @ts-expect-error 故意に不正値
    expect(t('ja', 'notExist')).toBe('');
  });
});

describe('i18n widgetTypeName関数', () => {
  it('日本語でウィジェットタイプ名を返す', () => {
    expect(widgetTypeName('ja', 'pomodoro')).toBe('ポモドーロタイマー');
    expect(widgetTypeName('ja', 'memo')).toBe('メモ');
  });
  it('英語でウィジェットタイプ名を返す', () => {
    expect(widgetTypeName('en', 'pomodoro')).toBe('Pomodoro Timer');
    expect(widgetTypeName('en', 'memo')).toBe('Memo');
  });
  it('未定義タイプはtype文字列をそのまま返す', () => {
    expect(widgetTypeName('ja', 'unknown-type')).toBe('unknown-type');
    expect(widgetTypeName('en', 'unknown-type')).toBe('unknown-type');
  });
});

describe('LANGUAGE_NAMES', () => {
  it('jaとenのラベルが設定されている', () => {
    expect(LANGUAGE_NAMES.ja).toBeDefined();
    expect(LANGUAGE_NAMES.en).toBeDefined();
  });
}); 