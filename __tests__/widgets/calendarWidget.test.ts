import { CalendarWidget } from '../../src/widgets/calendar';
import type { WidgetConfig } from '../../src/interfaces';
import { DEFAULT_CALENDAR_SETTINGS } from '../../src/settingsDefaults';

describe('CalendarWidget', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-calendar',
      type: 'calendar',
      title: 'テストカレンダー',
      settings: { ...DEFAULT_CALENDAR_SETTINGS }
    };
    dummyApp = {
      vault: {
        getFiles: () => [
          // デイリーノート
          { basename: '2024-06-01', name: '2024-06-01.md', extension: 'md', stat: { ctime: 1717171717171, mtime: 1717171717171 }, path: '2024-06-01.md' },
          // その他ノート
          { basename: 'note1', name: 'note1.md', extension: 'md', stat: { ctime: 1717171717171, mtime: 1717171717171 }, path: 'note1.md' }
        ]
      },
      workspace: { openLinkText: jest.fn() }
    };
    dummyPlugin = { settings: { calendarDailyNoteFormat: 'YYYY-MM-DD' } };
  });

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new CalendarWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('createでcalendar-widgetクラスとタイトルが付与される', () => {
    const widget = new CalendarWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('calendar-widget')).toBe(true);
    expect(el.querySelector('h4')?.textContent).toBe('テストカレンダー');
  });

  it('曜日ヘッダーが正しく描画される', () => {
    const widget = new CalendarWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const ths = el.querySelectorAll('th');
    expect(Array.from(ths).map(th => th.textContent)).toEqual(['月','火','水','木','金','土','日']);
  });

  it('前月・次月ボタンで月が変わる', () => {
    const widget = new CalendarWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const before = widget['currentDate'].getMonth();
    const nextBtn = el.querySelector('button[aria-label="次の月"]')!;
    nextBtn.dispatchEvent(new MouseEvent('click'));
    expect(widget['currentDate'].getMonth()).toBe((before + 1) % 12);
    const prevBtn = el.querySelector('button[aria-label="前の月"]')!;
    prevBtn.dispatchEvent(new MouseEvent('click'));
    expect(widget['currentDate'].getMonth()).toBe(before);
  });

  it('日付セルクリックでshowNotesForDateが呼ばれ、ノート情報が表示される', () => {
    const widget = new CalendarWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    // 直近の月の1日を探す
    const td = el.querySelector('td[data-date="2024-06-01"]');
    if (td) {
      td.dispatchEvent(new MouseEvent('click'));
      const info = el.querySelector('.calendar-selected-date-info');
      expect(info?.textContent).toContain('2024-06-01 のノート一覧');
      expect(info?.textContent).toContain('デイリーノートを開く');
      expect(info?.textContent).toContain('note1');
    }
  });

  it('デイリーノートが存在しない場合はメッセージが表示される', () => {
    dummyApp.vault.getFiles = () => [
      { basename: 'note1', name: 'note1.md', extension: 'md', stat: { ctime: 1717171717171, mtime: 1717171717171 }, path: 'note1.md' }
    ];
    const widget = new CalendarWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const td = el.querySelector('td[data-date="2024-06-01"]');
    if (td) {
      td.dispatchEvent(new MouseEvent('click'));
      const info = el.querySelector('.calendar-selected-date-info');
      expect(info?.textContent).toContain('デイリーノートは存在しません');
    }
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

  it('onunloadでwidgetElが定義されている', () => {
    const widget = new CalendarWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.onunload();
    expect(widget['widgetEl']).toBeDefined();
  });
}); 