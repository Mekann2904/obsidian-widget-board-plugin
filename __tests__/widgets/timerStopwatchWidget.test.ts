import { TimerStopwatchWidget, DEFAULT_TIMER_STOPWATCH_SETTINGS } from '../../src/widgets/timer-stopwatch';
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
}); 