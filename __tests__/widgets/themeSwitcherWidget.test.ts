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

describe('ThemeSwitcherWidget', () => {
  const dummyConfig: WidgetConfig = {
    id: 'test-theme-switcher',
    type: 'theme-switcher',
    title: 'テストテーマ切替',
    settings: {}
  };
  const dummyApp = {
    customCss: {
      themes: ['moonstone', 'dracula', 'solarized'],
      theme: 'dracula',
      setTheme: jest.fn()
    }
  } as any;
  const dummyPlugin = { settings: {} } as any;

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

  it('applyWidgetSizeが呼ばれる（設定反映）', () => {
    const widgetSize = require('../../src/utils/widgetSize');
    const spy = jest.spyOn(widgetSize, 'applyWidgetSize');
    const widget = new ThemeSwitcherWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
}); 