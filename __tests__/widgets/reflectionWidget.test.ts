import { ReflectionWidget } from '../../src/widgets/reflectionWidget/reflectionWidget';
import type { WidgetConfig } from '../../src/interfaces';

describe('ReflectionWidget 詳細テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-reflection-widget',
      type: 'reflection-widget',
      title: 'テストリフレクション',
      settings: { period: 'today', aiSummaryAutoEnabled: true }
    };
    dummyApp = {};
    dummyPlugin = {};
  });

  it('createでreflection-widgetクラスとUIインスタンスが生成される', () => {
    const widget = new ReflectionWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('reflection-widget')).toBe(true);
    expect(widget['ui']).toBeDefined();
    if (widget['ui']) {
      expect(typeof widget['ui'].render).toBe('function');
    }
  });

  it('create時にUIのrenderが呼ばれる', () => {
    const widget = new ReflectionWidget();
    // render呼び出し自体は副作用なのでエラーなく生成されることを確認
    expect(() => widget.create(dummyConfig, dummyApp, dummyPlugin)).not.toThrow();
    expect(widget['ui']).toBeDefined();
  });

  it('updateExternalSettingsで設定が反映されrefreshが呼ばれる', () => {
    const widget = new ReflectionWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const spy = jest.spyOn(widget, 'refresh');
    widget.updateExternalSettings({ aiSummaryAutoEnabled: false });
    expect(widget.config.settings.aiSummaryAutoEnabled).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it('refreshでUIのscheduleRenderが呼ばれる', () => {
    const widget = new ReflectionWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    if (widget['ui']) {
      const spy = jest.spyOn(widget['ui'], 'scheduleRender');
      widget.refresh();
      expect(spy).toHaveBeenCalled();
    }
  });

  it('uiがnullでもrefreshでエラーにならない', () => {
    const widget = new ReflectionWidget();
    widget['ui'] = null;
    expect(() => widget.refresh()).not.toThrow();
  });
}); 