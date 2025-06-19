import { PomodoroWidget, DEFAULT_POMODORO_SETTINGS } from '../../src/widgets/pomodoro';
import type { WidgetConfig } from '../../src/interfaces';

describe('PomodoroWidget 詳細テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-pomodoro',
      type: 'pomodoro',
      title: 'テストポモドーロ',
      settings: { ...DEFAULT_POMODORO_SETTINGS }
    };
    dummyApp = { vault: { adapter: { exists: jest.fn(), mkdir: jest.fn(), read: jest.fn(), write: jest.fn() } } };
    dummyPlugin = { settings: { boards: [] }, manifest: { id: 'test-plugin' }, saveData: jest.fn() };
  });

  it('createでpomodoro-timer-widgetクラスとUI要素が生成される', () => {
    const widget = new PomodoroWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('pomodoro-timer-widget')).toBe(true);
    expect(el.querySelector('.pomodoro-time-display')).toBeTruthy();
    expect(el.querySelector('.pomodoro-status-display')).toBeTruthy();
    expect(el.querySelector('.pomodoro-controls')).toBeTruthy();
  });

  it('startTimerでisRunningがtrueになりUIが更新される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['startTimer']();
    expect(widget['isRunning']).toBe(true);
    expect(widget['startPauseButton'].getAttribute('aria-label')).toBe('一時停止');
  });

  it('pauseTimerでisRunningがfalseになりUIが更新される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['startTimer']();
    widget['pauseTimer']();
    expect(widget['isRunning']).toBe(false);
    expect(widget['startPauseButton'].getAttribute('aria-label')).toBe('開始');
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

  it('handleSessionEndでisRunningがfalseになり次セッションに進む', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['isRunning'] = true;
    await widget['handleSessionEnd']();
    expect(widget['isRunning']).toBe(false);
  });

  it('メモ編集でmemoContentが更新される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget['renderMemo']('テストメモ内容');
    expect(widget['currentSettings'].memoContent).toBe('テストメモ内容');
  });

  it('updateExternalSettingsで各種設定が反映される', async () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ workMinutes: 50, backgroundImageUrl: 'url', notificationSound: 'bell' });
    expect(widget['currentSettings'].workMinutes).toBe(50);
    expect(widget['currentSettings'].backgroundImageUrl).toBe('url');
    expect(widget['currentSettings'].notificationSound).toBe('bell');
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
    expect((PomodoroWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('removePersistentInstanceでインスタンスが削除される', () => {
    const widget = new PomodoroWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    PomodoroWidget.removePersistentInstance(dummyConfig.id);
    expect((PomodoroWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('cleanupAllPersistentInstancesですべてのインスタンスが削除される', () => {
    const widget1 = new PomodoroWidget();
    const widget2 = new PomodoroWidget();
    widget1.create({ ...dummyConfig, id: 'id1' }, dummyApp, dummyPlugin);
    widget2.create({ ...dummyConfig, id: 'id2' }, dummyApp, dummyPlugin);
    PomodoroWidget.cleanupAllPersistentInstances();
    expect((PomodoroWidget as any).widgetInstances.size).toBe(0);
  });

  // 背景画像や通知音のUI反映、セッションログ出力なども必要に応じて追加可能
}); 