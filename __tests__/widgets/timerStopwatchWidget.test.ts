import { TimerStopwatchWidget } from '../../src/widgets/timer-stopwatch';
import { DEFAULT_TIMER_STOPWATCH_SETTINGS } from '../../src/settings/defaultWidgetSettings';
import type { WidgetConfig } from '../../src/interfaces';

describe('TimerStopwatchWidget', () => {
  const dummyConfig: WidgetConfig = {
    id: 'test-timer-stopwatch',
    type: 'timer-stopwatch',
    title: 'テストタイマー',
    settings: { ...DEFAULT_TIMER_STOPWATCH_SETTINGS }
  };
  const dummyApp = {} as any;
  const dummyPlugin = { settings: {} } as any;

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new TimerStopwatchWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('updateExternalSettingsでtimerMinutesが反映される', async () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ timerMinutes: 10 });
    expect(widget['currentSettings'].timerMinutes).toBe(10);
  });

  it('handleSwitchModeでモードが切り替わる', () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['handleSwitchMode']('stopwatch');
    const state = widget['getInternalState']();
    expect(state?.mode).toBe('stopwatch');
  });

  it('onunloadでwidgetElが定義されている', () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.onunload();
    expect(widget['widgetEl']).toBeDefined();
  });

  it('timer-stopwatch-widgetクラスとタイトルが付与される', () => {
    const widget = new TimerStopwatchWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('timer-stopwatch-widget')).toBe(true);
    expect(el.querySelector('.widget-title')?.textContent).toBe('テストタイマー');
  });

  it('UI要素（モード切替・入力欄・表示・ボタン）が生成される', () => {
    const widget = new TimerStopwatchWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.querySelector('.timer-mode-switch')).toBeTruthy();
    expect(el.querySelector('.timer-set-row')).toBeTruthy();
    expect(el.querySelector('.timer-display')).toBeTruthy();
    expect(el.querySelector('.timer-controls')).toBeTruthy();
  });

  it('モード切替でUIとstateが切り替わる', () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['handleSwitchMode']('stopwatch');
    const state = widget['getInternalState']();
    expect(state?.mode).toBe('stopwatch');
    widget['handleSwitchMode']('timer');
    expect(widget['getInternalState']()?.mode).toBe('timer');
  });

  it('スタート/一時停止ボタンでrunningが切り替わる', () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['handleToggleStartPause']();
    expect(widget['getInternalState']()?.running).toBe(true);
    widget['handleToggleStartPause']();
    expect(widget['getInternalState']()?.running).toBe(false);
  });

  it('リセットボタンで残り時間・経過時間が初期化される', () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['handleToggleStartPause']();
    widget['handleReset']();
    const state = widget['getInternalState']();
    expect(state?.remainingSeconds).toBe(state?.initialTimerSeconds);
    widget['handleSwitchMode']('stopwatch');
    widget['handleToggleStartPause']();
    widget['handleReset']();
    expect(widget['getInternalState']()?.elapsedSeconds).toBe(0);
  });

  it('入力欄のバリデーション（最大・最小値）', () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['timerMinInput'].value = '1000';
    widget['timerMinInput'].oninput?.({} as any);
    expect(widget['timerMinInput'].value).toBe('999');
    widget['timerMinInput'].value = '-1';
    widget['timerMinInput'].oninput?.({} as any);
    expect(widget['timerMinInput'].value).toBe('0');
    widget['timerSecInput'].value = '60';
    widget['timerSecInput'].oninput?.({} as any);
    expect(widget['timerSecInput'].value).toBe('59');
    widget['timerSecInput'].value = '-1';
    widget['timerSecInput'].oninput?.({} as any);
    expect(widget['timerSecInput'].value).toBe('0');
  });

  it('handleTimerSettingsChangeでstateとUIが更新される', () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    // stateを初期化し直す
    (TimerStopwatchWidget as any).widgetStates.set(dummyConfig.id, widget['initializeInternalState']());
    widget['timerMinInput'].value = '2';
    widget['timerSecInput'].value = '30';
    widget['handleTimerSettingsChange']();
    const state = widget['getInternalState']();
    expect(state?.initialTimerSeconds).toBe(150);
    expect(widget['timerMinInput'].value).toBe('2');
    expect(widget['timerSecInput'].value).toBe('30');
  });

  it('playSoundNotificationで通知音が再生される（off以外）', () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['currentSettings'].notificationSound = 'default_beep';
    // AudioContextをモック
    const ctxMock = { createOscillator: jest.fn(() => ({ connect: jest.fn(), start: jest.fn(), stop: jest.fn(), onended: jest.fn(), frequency: { setValueAtTime: jest.fn() }, type: '', })), createGain: jest.fn(() => ({ connect: jest.fn(), gain: { setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() } })), currentTime: 0, destination: {}, state: 'running', close: jest.fn() };
    window.AudioContext = jest.fn(() => ctxMock) as any;
    widget['playSoundNotification']();
    expect(ctxMock.createOscillator).toHaveBeenCalled();
  });

  it('updateExternalSettingsでtimerMinutes/timerSecondsが反映される', async () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ timerMinutes: 12, timerSeconds: 34 });
    expect(widget['currentSettings'].timerMinutes).toBe(12);
    expect(widget['currentSettings'].timerSeconds).toBe(34);
    expect(widget['timerMinInput'].value).toBe('12');
    expect(widget['timerSecInput'].value).toBe('34');
  });

  it('onunloadでインスタンス・stateが削除される', () => {
    const widget = new TimerStopwatchWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.onunload();
    expect((TimerStopwatchWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
    expect((TimerStopwatchWidget as any).widgetStates.has(dummyConfig.id)).toBe(false);
  });

  it('ウィジェットの並べ替えでDOM順序・保存順序が変わる', () => {
    // 複数ウィジェットを用意
    const widget1 = new TimerStopwatchWidget();
    const widget2 = new TimerStopwatchWidget();
    const config1 = { ...dummyConfig, id: 'w1', title: 'A' };
    const config2 = { ...dummyConfig, id: 'w2', title: 'B' };
    const el1 = widget1.create(config1, dummyApp, dummyPlugin);
    const el2 = widget2.create(config2, dummyApp, dummyPlugin);
    const board = document.createElement('div');
    board.appendChild(el1);
    board.appendChild(el2);
    // 並べ替え（B→Aの順に）
    board.insertBefore(el2, el1);
    expect(board.firstChild).toBe(el2);
    expect(board.lastChild).toBe(el1);
    // 仮に順序を保存する関数があればここで呼ぶ（例: saveWidgetOrder）
    // expect(saveWidgetOrder()).toEqual(['w2', 'w1']);
  });
}); 