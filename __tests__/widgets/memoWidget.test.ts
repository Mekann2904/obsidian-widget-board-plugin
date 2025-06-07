import { MemoWidget, DEFAULT_MEMO_SETTINGS } from '../../src/widgets/memo';
import type { WidgetConfig } from '../../src/interfaces';

describe('MemoWidget 詳細テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

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
    dummyConfig.settings.memoContent = '';
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(widget['memoDisplayEl'].style.display).toBe('none');
  });

  it('memoContentがある場合はMarkdownがレンダリングされる', async () => {
    dummyConfig.settings.memoContent = '# 見出し';
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    expect(widget['memoDisplayEl'].innerHTML).toContain('見出し');
  });

  it('編集ボタンで編集モードに切り替わる', () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['editMemoButtonEl'].click();
    expect(widget['isEditingMemo']).toBe(true);
    expect(widget['memoEditContainerEl'].style.display).toBe('');
    expect(widget['memoEditAreaEl'].value).toBe(dummyConfig.settings.memoContent);
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
    expect(widget['memoEditAreaEl'].value).not.toBe('編集中');
  });

  it('高さモードfixedでcontainerの高さが固定される', () => {
    dummyConfig.settings.memoHeightMode = 'fixed';
    dummyConfig.settings.fixedHeightPx = 222;
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(widget['memoContainerEl'].style.height).toBe('222px');
  });

  it('updateExternalSettingsでmemoContentが反映される', async () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ memoContent: '外部更新' });
    expect(widget['currentSettings'].memoContent).toBe('外部更新');
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
    MemoWidget.removePersistentInstance(dummyConfig.id, dummyPlugin);
    expect((MemoWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('cleanupAllPersistentInstancesですべてのインスタンスが削除される', () => {
    const widget1 = new MemoWidget();
    const widget2 = new MemoWidget();
    widget1.create({ ...dummyConfig, id: 'id1' }, dummyApp, dummyPlugin);
    widget2.create({ ...dummyConfig, id: 'id2' }, dummyApp, dummyPlugin);
    MemoWidget.cleanupAllPersistentInstances(dummyPlugin);
    expect((MemoWidget as any).widgetInstances.size).toBe(0);
  });

  // タスクチェックボックスや自動リサイズのテストも必要に応じて追加可能
}); 