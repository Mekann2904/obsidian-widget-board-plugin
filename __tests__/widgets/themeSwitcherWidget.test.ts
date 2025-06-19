jest.mock('obsidian', () => {
  const Notice = jest.fn();
  return {
    Notice,
    App: class {},
    setIcon: jest.fn()
  };
}, { virtual: true });

import { ThemeSwitcherWidget } from '../../src/widgets/theme-switcher';
import type { WidgetConfig } from '../../src/interfaces';

// --- ダミー変数をdescribe外で宣言 ---
let dummyConfig: WidgetConfig;
let dummyApp: any;
let dummyPlugin: any;

describe('ThemeSwitcherWidget 単体テスト', () => {
  beforeEach(() => {
    dummyConfig = {
      id: 'test-theme-switcher',
      type: 'theme-switcher',
      title: 'テストテーマ切替',
      settings: {}
    };
    dummyApp = {
      customCss: {
        themes: ['moonstone', 'dracula', 'solarized'],
        theme: 'dracula',
        setTheme: jest.fn()
      }
    };
    dummyPlugin = { settings: {} };
  });

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('テーマ一覧が正しく描画される', () => {
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const items = el.querySelectorAll('.theme-switcher-item');
    expect(items.length).toBeGreaterThan(0);
  });

  it('theme-switcher-widgetクラスとタイトルが付与される', () => {
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('theme-switcher-widget')).toBe(true);
    expect(el.querySelector('.widget-title')?.textContent).toBe('テストテーマ切替');
  });

  it('テーマ一覧が空の場合はデフォルトのみ表示', () => {
    const app: any = { customCss: { themes: [], theme: '', setTheme: jest.fn() } };
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, app as any, dummyPlugin);
    const items = el.querySelectorAll('.theme-switcher-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('デフォルト');
  });

  it('customCss未定義時はエラーメッセージ', () => {
    const app: any = {};
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, app as any, dummyPlugin);
    expect(el.textContent).toContain('テーマ切り替えAPIが利用できません');
  });

  it('themesがobject型でも正しくリスト化される', () => {
    const app: any = { customCss: { themes: { a: 'moonstone', b: 'dracula', c: { name: 'solarized' } }, theme: 'dracula', setTheme: jest.fn() } };
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, app as any, dummyPlugin);
    const items = el.querySelectorAll('.theme-switcher-item');
    expect(Array.from(items).some(i => i.textContent === 'dracula')).toBe(true);
    expect(Array.from(items).some(i => i.textContent === 'solarized')).toBe(true);
  });
});

describe('ThemeSwitcherWidget 統合テスト', () => {
  beforeEach(() => {
    dummyConfig = {
      id: 'test-theme-switcher',
      type: 'theme-switcher',
      title: 'テストテーマ切替',
      settings: {}
    };
    dummyApp = {
      customCss: {
        themes: ['moonstone', 'dracula', 'solarized'],
        theme: 'dracula',
        setTheme: jest.fn()
      }
    };
    dummyPlugin = { settings: {} };
  });

  it('テーマ切替時にsetThemeとNoticeが呼ばれactiveクラスが切り替わる', () => {
    const { Notice } = require('obsidian');
    Notice.mockClear();
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const items = el.querySelectorAll('.theme-switcher-item');
    items[2].dispatchEvent(new MouseEvent('click'));
    expect(dummyApp.customCss.setTheme).toHaveBeenCalledWith('solarized');
    expect(Notice).toHaveBeenCalledWith('テーマ「solarized」を適用しました。');
    expect(items[2].classList.contains('active')).toBe(true);
    items[2].dispatchEvent(new MouseEvent('click'));
    expect(Notice).toHaveBeenCalledWith('すでにこのテーマが適用されています。');
  });

  it('applyWidgetSizeが呼ばれる（設定反映）', () => {
    const widgetSize = require('../../src/utils/widgetSize');
    const spy = jest.spyOn(widgetSize, 'applyWidgetSize');
    const widget = new ThemeSwitcherWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ThemeSwitcherWidget システムテスト', () => {
  beforeEach(() => {
    dummyConfig = {
      id: 'test-theme-switcher',
      type: 'theme-switcher',
      title: 'テストテーマ切替',
      settings: {}
    };
    dummyApp = {
      customCss: {
        themes: ['moonstone', 'dracula', 'solarized'],
        theme: 'dracula',
        setTheme: jest.fn()
      }
    };
    dummyPlugin = { settings: {} };
  });

  it('複数ウィジェットと同時に動作し、テーマ切替が全体に反映される', () => {
    const widget1 = new ThemeSwitcherWidget();
    const widget2 = new ThemeSwitcherWidget();
    const app = {
      customCss: {
        themes: ['moonstone', 'dracula'],
        theme: 'moonstone',
        setTheme: jest.fn(function(theme) { this.theme = theme; })
      }
    } as any;
    const plugin = { settings: {} } as any;
    const el1 = widget1.create(dummyConfig, app, plugin);
    let el2 = widget2.create(dummyConfig, app, plugin);

    el1.querySelectorAll('.theme-switcher-item')[1].dispatchEvent(new MouseEvent('click'));
    expect(app.customCss.theme).toBe('dracula');

    el2 = widget2.create(dummyConfig, app, plugin);
    expect(el2.querySelector('.theme-switcher-item.active')?.textContent).toBe('dracula');
  });
});

describe('ThemeSwitcherWidget UAT', () => {
  beforeEach(() => {
    dummyConfig = {
      id: 'test-theme-switcher',
      type: 'theme-switcher',
      title: 'テストテーマ切替',
      settings: {}
    };
    dummyApp = {
      customCss: {
        themes: ['moonstone', 'dracula', 'solarized'],
        theme: 'dracula',
        setTheme: jest.fn()
      }
    };
    dummyPlugin = { settings: {} };
  });

  it('ユーザーがテーマを選択すると即座にテーマが切り替わり通知が表示される', () => {
    const { Notice } = require('obsidian');
    Notice.mockClear();
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const items = el.querySelectorAll('.theme-switcher-item');
    items[2].dispatchEvent(new MouseEvent('click'));
    expect(dummyApp.customCss.setTheme).toHaveBeenCalledWith('solarized');
    expect(Notice).toHaveBeenCalledWith('テーマ「solarized」を適用しました。');
    expect(items[2].classList.contains('active')).toBe(true);
  });

  it('テーマ一覧が空の場合でも「デフォルト」だけが選択肢として表示される', () => {
    const app: any = { customCss: { themes: [], theme: '', setTheme: jest.fn() } };
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, app as any, dummyPlugin);
    const items = el.querySelectorAll('.theme-switcher-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('デフォルト');
  });

  it('テーマ切替APIが利用できない場合、ユーザーに分かりやすいエラーメッセージが表示される', () => {
    const app: any = {};
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, app as any, dummyPlugin);
    expect(el.textContent).toContain('テーマ切り替えAPIが利用できません');
  });

  it('既に適用済みのテーマを選択した場合、「すでにこのテーマが適用されています」と通知される', () => {
    const { Notice } = require('obsidian');
    Notice.mockClear();
    const widget = new ThemeSwitcherWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const items = el.querySelectorAll('.theme-switcher-item');
    items[1].dispatchEvent(new MouseEvent('click'));
    expect(Notice).toHaveBeenCalledWith('すでにこのテーマが適用されています。');
  });
}); 