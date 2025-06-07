import { ThemeSwitcherWidget } from '../src/widgets/theme-switcher';
import type { WidgetConfig } from '../src/interfaces';

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
}); 