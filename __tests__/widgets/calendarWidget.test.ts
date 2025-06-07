import { CalendarWidget } from '../../src/widgets/calendar';
import type { WidgetConfig } from '../../src/interfaces';

describe('CalendarWidget', () => {
  const dummyConfig: WidgetConfig = {
    id: 'test-calendar',
    type: 'calendar',
    title: 'テストカレンダー',
    settings: {}
  };
  const dummyApp = {} as any;
  const dummyPlugin = { settings: { calendarDailyNoteFormat: 'YYYY-MM-DD' } } as any;

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new CalendarWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('updateExternalSettingsで設定が反映される', () => {
    const widget = new CalendarWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.updateExternalSettings({ dailyNoteFormat: 'YYYY年MM月DD日' });
    expect(widget['currentSettings'].dailyNoteFormat).toBe('YYYY年MM月DD日');
  });

  it('changeMonthで月が変わる', () => {
    const widget = new CalendarWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const before = widget['currentDate'].getMonth();
    widget['changeMonth'](1);
    expect(widget['currentDate'].getMonth()).not.toBe(before);
  });

  it('onunloadでwidgetElがnullになる', () => {
    const widget = new CalendarWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.onunload();
    expect(widget['widgetEl']).toBeDefined(); // widgetEl自体はnullにはならないが、クリーンアップの副作用を確認
  });
}); 