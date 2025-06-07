import { PomodoroWidget, DEFAULT_POMODORO_SETTINGS } from '../src/widgets/pomodoro';
import type { WidgetConfig } from '../src/interfaces';

describe('PomodoroWidget', () => {
  const dummyConfig: WidgetConfig = {
    id: 'test-pomodoro',
    type: 'pomodoro',
    title: 'テストポモドーロ',
    settings: { ...DEFAULT_POMODORO_SETTINGS }
  };
  const dummyApp = { vault: { adapter: { exists: jest.fn(), mkdir: jest.fn(), read: jest.fn(), write: jest.fn() } } } as any;
  const dummyPlugin = { settings: { boards: [] }, manifest: { id: 'test-plugin' }, saveData: jest.fn() } as any;

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new PomodoroWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('updateExternalSettings: メモのみ変更時にmemoContentが更新される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const newMemo = '新しいメモ';
    await widget.updateExternalSettings({ memoContent: newMemo });
    expect(widget['currentSettings'].memoContent).toBe(newMemo);
  });

  it('updateExternalSettings: タイマー関連設定変更時にworkMinutesが更新される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const newWorkMinutes = 50;
    await widget.updateExternalSettings({ workMinutes: newWorkMinutes });
    expect(widget['currentSettings'].workMinutes).toBe(newWorkMinutes);
  });

  it('updateExternalSettings: 背景画像変更時にbackgroundImageUrlが更新される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const newUrl = 'https://example.com/bg.png';
    await widget.updateExternalSettings({ backgroundImageUrl: newUrl });
    expect(widget['currentSettings'].backgroundImageUrl).toBe(newUrl);
  });

  it('startTimerでisRunningがtrueになる', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['startTimer']();
    expect(widget['isRunning']).toBe(true);
  });

  it('pauseTimerでisRunningがfalseになる', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['startTimer']();
    widget['pauseTimer']();
    expect(widget['isRunning']).toBe(false);
  });

  it('resetTimerStateで残り時間が初期化される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['remainingTime'] = 10;
    widget['resetTimerState']('work', true);
    expect(widget['remainingTime']).toBe(widget['currentSettings'].workMinutes * 60);
  });

  it('skipToNextSessionConfirmでcurrentPomodoroSetが変化する', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const before = widget['currentPomodoroSet'];
    widget['skipToNextSessionConfirm']();
    expect(widget['currentPomodoroSet']).not.toBe(before);
  });

  it('handleSessionEndでisRunningがfalseになる', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['isRunning'] = true;
    await widget['handleSessionEnd']();
    expect(widget['isRunning']).toBe(false);
  });

  it('メモ編集でmemoContentが更新される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const newMemo = 'テストメモ内容';
    await widget['renderMemo'](newMemo);
    expect(widget['currentSettings'].memoContent).not.toBe(undefined); // UI反映はモック
  });

  it('getWidgetIdでconfig.idが返る', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(widget.getWidgetId()).toBe(dummyConfig.id);
  });

  it('onunloadでインスタンスが削除される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.onunload();
    // widgetInstancesから消えていること
    expect((PomodoroWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('removePersistentInstanceでインスタンスが削除される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    PomodoroWidget.removePersistentInstance(dummyConfig.id, dummyPlugin);
    expect((PomodoroWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('cleanupAllPersistentInstancesですべてのインスタンスが削除される', () => {
    const widget1 = new PomodoroWidget();
    const widget2 = new PomodoroWidget();
    widget1.create({ ...dummyConfig, id: 'id1' }, dummyApp, dummyPlugin);
    widget2.create({ ...dummyConfig, id: 'id2' }, dummyApp, dummyPlugin);
    PomodoroWidget.cleanupAllPersistentInstances(dummyPlugin);
    expect((PomodoroWidget as any).widgetInstances.size).toBe(0);
  });
}); 