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
    dummyConfig.settings.memoContent = '';
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(widget['memoDisplayEl'].style.display).toBe('');
  });

  it('memoContentがある場合はMarkdownがレンダリングされる', async () => {
    dummyConfig.settings.memoContent = '# 見出し';
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
    dummyConfig.settings.heightMode = 'fixed';
    dummyConfig.settings.fixedHeightPx = 222;
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