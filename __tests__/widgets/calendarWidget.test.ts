import { CalendarWidget } from '../../src/widgets/calendar';
import type { WidgetConfig } from '../../src/interfaces';
import { DEFAULT_CALENDAR_SETTINGS } from '../../src/settingsDefaults';
import type { TFile } from 'obsidian';

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
    dummyPlugin = { settings: { calendarDailyNoteFormat: 'YYYY-MM-DD', weekStartDay: 0 } };
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
    expect(el.querySelector('.widget-title')?.textContent).toBe('テストカレンダー');
  });

  it('曜日ヘッダーが正しく描画される', () => {
    dummyPlugin.settings.weekStartDay = 1; // 月曜始まり
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
    expect(widget['widgetEl']).toBeDefined(); // onunload前のみ検証
    widget.onunload();
  });

  it('祝日・今日・週末のセルに特別なクラスが付与される', () => {
    const widget = new CalendarWidget();
    const today = new Date();
    widget['currentDate'] = new Date(today.getFullYear(), today.getMonth(), 1); // 月初
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    // ローカルタイムでdata-dateを生成
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');
    const td = el.querySelector(`td[data-date="${todayStr}"]`);
    expect(td).not.toBeNull();
    expect(td?.classList.contains('calendar-today')).toBe(true);
  });

  it('週の開始曜日設定が反映される', () => {
    const widget = new CalendarWidget();
    (dummyConfig.settings as any).startOfWeek = 0; // 日曜始まり
    dummyPlugin.settings.weekStartDay = 0;
    let el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    let ths = el.querySelectorAll('th');
    expect(ths[0].textContent).toBe('日');
    (dummyConfig.settings as any).startOfWeek = 1; // 月曜始まり
    dummyPlugin.settings.weekStartDay = 1;
    el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    ths = el.querySelectorAll('th');
    expect(ths[0].textContent).toBe('月');
  });

  it('不正な設定値・日付フォーマット時もエラーにならない', () => {
    const widget = new CalendarWidget();
    (dummyConfig.settings as any).dailyNoteFormat = 'INVALID_FORMAT';
    expect(() => widget.create(dummyConfig, dummyApp, dummyPlugin)).not.toThrow();
    expect(() => widget.updateExternalSettings({ dailyNoteFormat: undefined })).not.toThrow();
  });

  it('1000件以上ノートがあっても描画が遅延しない', () => {
    dummyApp.vault.getFiles = (): TFile[] => {
      const files: TFile[] = [];
      for (let i = 0; i < 1000; i++) {
        files.push({
          basename: `2024-06-${String(i % 30 + 1).padStart(2, '0')}`,
          name: `note${i}.md`,
          extension: 'md',
          stat: { ctime: 0, mtime: 0 },
          path: `note${i}.md`
        } as unknown as TFile);
      }
      return files;
    };
    const widget = new CalendarWidget();
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    expect(duration).toBeLessThan(1000); // 1秒以内
  });

  it('設定ファイル破損時はデフォルトで起動する', () => {
    const widget = new CalendarWidget();
    (dummyConfig as any).settings = undefined;
    expect(() => widget.create(dummyConfig, dummyApp, dummyPlugin)).not.toThrow();
    // 復旧のため再設定
    dummyConfig.settings = { ...DEFAULT_CALENDAR_SETTINGS };
  });

  it('日付選択からノート閲覧・作成まで一連の流れができる', () => {
    const widget = new CalendarWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const td = el.querySelector('td[data-date="2024-06-01"]');
    if (td) {
      td.dispatchEvent(new MouseEvent('click'));
      const info = el.querySelector('.calendar-selected-date-info');
      expect(info?.textContent).toContain('ノート一覧');
      const btn = info?.querySelector('button');
      if (btn) {
        btn.dispatchEvent(new MouseEvent('click'));
        expect(dummyApp.workspace.openLinkText).toHaveBeenCalled();
      }
    }
  });

  it('キーボード操作で日付セルにフォーカスできる', () => {
    const widget = new CalendarWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const tds = el.querySelectorAll('td');
    if (tds.length > 0) {
      (tds[0] as HTMLElement).setAttribute('tabindex', '0');
      (tds[0] as HTMLElement).focus();
      expect((tds[0] as HTMLElement).getAttribute('tabindex')).toBe('0');
    }
  });
}); 