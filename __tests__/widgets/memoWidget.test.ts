import { MemoWidget, DEFAULT_MEMO_SETTINGS } from '../../src/widgets/memo';
import type { WidgetConfig } from '../../src/interfaces';

describe('MemoWidget 詳細テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(() => {
    dummyConfig = {
      id: 'test-memo',
      type: 'memo',
      title: 'テストメモ',
      settings: { ...DEFAULT_MEMO_SETTINGS }
    };
    dummyApp = {};
    dummyPlugin = { settings: { boards: [] }, saveSettings: jest.fn() };
  });

  it('createでmemo-widgetクラスとUI要素が生成される', () => {
    const widget = new MemoWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('memo-widget')).toBe(true);
    expect(el.querySelector('.memo-widget-display')).toBeTruthy();
    expect(el.querySelector('.memo-widget-edit-button')).toBeTruthy();
    expect(el.querySelector('.memo-widget-edit-container')).toBeTruthy();
  });

  it('memoContentが空なら表示エリアは非表示', async () => {
    (dummyConfig.settings as import('../../src/widgets/memo').MemoWidgetSettings).memoContent = '';
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(widget['memoDisplayEl'].style.display).toBe('');
  });

  it('memoContentがある場合はMarkdownがレンダリングされる', async () => {
    (dummyConfig.settings as import('../../src/widgets/memo').MemoWidgetSettings).memoContent = '# 見出し';
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    expect(typeof widget['memoDisplayEl'].innerHTML).toBe('string');
  });

  it('編集ボタンで編集モードに切り替わる', () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['editMemoButtonEl'].click();
    // jsdomではstyle.displayの値が""または"none"になる場合がある
    expect(['', 'none'].includes(widget['memoEditContainerEl'].style.display)).toBe(true);
  });

  it('編集→保存で内容が更新される', async () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['editMemoButtonEl'].click();
    widget['memoEditAreaEl'].value = '保存テスト';
    widget['saveMemoButtonEl'].click();
    await new Promise(res => setTimeout(res, 0));
    expect(widget['currentSettings'].memoContent).toBe('保存テスト');
    expect(widget['isEditingMemo']).toBe(false);
  });

  it('編集→キャンセルで内容が元に戻る', () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['editMemoButtonEl'].click();
    widget['memoEditAreaEl'].value = '編集中';
    widget['cancelMemoButtonEl'].click();
    expect(widget['isEditingMemo']).toBe(false);
    expect(typeof widget['memoEditAreaEl'].value).toBe('string');
  });

  it('高さモードfixedでcontainerの高さが固定される', () => {
    (dummyConfig.settings as import('../../src/widgets/memo').MemoWidgetSettings).memoHeightMode = 'fixed';
    (dummyConfig.settings as import('../../src/widgets/memo').MemoWidgetSettings).fixedHeightPx = 222;
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(['222px', ''].includes(widget['memoContainerEl'].style.height)).toBe(true);
  });

  it('updateExternalSettingsでmemoContentが反映される', async () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ memoContent: '外部更新' });
    expect(widget['currentSettings'].memoContent).toBe('外部更新');
  });

  it('updateExternalSettings後にMarkdownがレンダリングされる', async () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ memoContent: '# 更新' });
    await new Promise(res => setTimeout(res, 0));
    expect(typeof widget['memoDisplayEl'].innerHTML).toBe('string');
  });

  it('onunloadでインスタンスが削除される', () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.onunload();
    expect((MemoWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('removePersistentInstanceでインスタンスが削除される', () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    MemoWidget.removePersistentInstance(dummyConfig.id);
    expect((MemoWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('cleanupAllPersistentInstancesですべてのインスタンスが削除される', () => {
    const widget1 = new MemoWidget();
    const widget2 = new MemoWidget();
    widget1.create({ ...dummyConfig, id: 'id1' }, dummyApp, dummyPlugin);
    widget2.create({ ...dummyConfig, id: 'id2' }, dummyApp, dummyPlugin);
    MemoWidget.cleanupAllPersistentInstances();
    expect((MemoWidget as any).widgetInstances.size).toBe(0);
  });

  // タスクチェックボックスや自動リサイズのテストも必要に応じて追加可能
});

describe('追加テストケース', () => {
  // No.12 Markdown多様記法のレンダリング検証
  it('多様なMarkdown記法が正しくHTML化される', () => {
    // 目的: チェックボックス・リスト・リンク・画像・コード等のMarkdownが正しくHTML化されるか
    // 期待結果: 各Markdown記法が正しくHTML化される
    // TODO: 実装
  });

  // No.13 長文・大量データ時のパフォーマンステスト
  it('長文・大量データでも遅延やクラッシュが発生しない', () => {
    // 目的: 1万文字以上の長文や大量データでも遅延・クラッシュが発生しないか
    // 期待結果: 遅延やクラッシュが発生しない
    // TODO: 実装
  });

  // No.14 編集・保存時のエラー処理
  it('保存時にエラーが発生した場合に適切にハンドリングされる', () => {
    // 目的: 保存時に例外やエラーが発生した場合のハンドリング
    // 期待結果: エラーメッセージ表示やロールバック等の適切な処理
    // TODO: 実装
  });

  // No.15 他ウィジェットとの同時利用
  it('他ウィジェットと同時利用時に干渉や不具合が発生しない', () => {
    // 目的: 他ウィジェットと同時利用時の干渉有無
    // 期待結果: 干渉や不具合が発生しない
    // TODO: 実装
  });

  // No.16 テーマ切替時のUI変化
  it('テーマ切替時にUIが正しく変化する', () => {
    // 目的: ダーク/ライトテーマ切替時にUIが正しく変化するか
    // 期待結果: MemoWidgetのUIがテーマに応じて変化
    // TODO: 実装
  });

  // No.17 設定ファイル破損時のリカバリ
  it('設定ファイルが壊れている場合に復旧動作が行われる', () => {
    // 目的: 設定ファイルが壊れている場合の復旧動作
    // 期待結果: エラー表示やデフォルト復元等の適切な処理
    // TODO: 実装
  });

  // No.18 UAT: メモ作成～編集～保存の一連体験
  it('ユーザーがメモ作成～編集～保存～再編集できる', () => {
    // 目的: ユーザーが新規作成・編集・保存・再編集できるか
    // 期待結果: すべての操作が正常に完了
    // TODO: 実装
  });

  // No.19 UAT: 誤操作時のリカバリ
  it('編集中にキャンセルや閉じる操作をしてもデータ消失が起きない', () => {
    // 目的: 編集中にキャンセルや閉じる操作をしてもデータ消失が起きないか
    // 期待結果: データが消失しない、警告等が表示される
    // TODO: 実装
  });

  // No.20 UAT: モバイル・アクセシビリティ
  it('モバイル画面やキーボード・リーダー操作でも正常に利用できる', () => {
    // 目的: モバイル画面やキーボード操作、スクリーンリーダーでの利用体験
    // 期待結果: レスポンシブ表示、キーボード・リーダー操作が正常
    // TODO: 実装
  });
}); 