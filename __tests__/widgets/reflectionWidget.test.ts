import { ReflectionWidget } from '../../src/widgets/reflectionWidget/reflectionWidget';
import type { WidgetConfig } from '../../src/interfaces';

describe('ReflectionWidget', () => {
  const dummyConfig: WidgetConfig = {
    id: 'test-reflection-widget',
    type: 'reflection-widget',
    title: 'テストリフレクション',
    settings: { period: 'today', aiSummaryAutoEnabled: true }
  };
  const dummyApp = {} as any;
  const dummyPlugin = {} as any;

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new ReflectionWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
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
}); 