import { MemoWidget, DEFAULT_MEMO_SETTINGS } from '../src/widgets/memo';
import type { WidgetConfig } from '../src/interfaces';

describe('MemoWidget', () => {
  const dummyConfig: WidgetConfig = {
    id: 'test-memo',
    type: 'memo',
    title: 'テストメモ',
    settings: { ...DEFAULT_MEMO_SETTINGS }
  };
  const dummyApp = {} as any;
  const dummyPlugin = { settings: { boards: [] }, saveSettings: jest.fn() } as any;

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new MemoWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('updateExternalSettingsでmemoContentが更新される', async () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const newMemo = '新しいメモ';
    await widget.updateExternalSettings({ memoContent: newMemo });
    expect(widget['currentSettings'].memoContent).toBe(newMemo);
  });

  it('updateExternalSettingsで高さモードが切り替わる', async () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ memoHeightMode: 'fixed', fixedHeightPx: 200 });
    expect(widget['currentSettings'].memoHeightMode).toBe('fixed');
    expect(widget['currentSettings'].fixedHeightPx).toBe(200);
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
}); 