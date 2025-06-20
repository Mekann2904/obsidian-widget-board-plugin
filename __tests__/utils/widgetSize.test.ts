import { applyWidgetSize, createWidgetContainer } from '../../src/utils/widgetSize';
import type { WidgetConfig } from '../../src/interfaces';

describe('widget size utilities', () => {
  test('applyWidgetSize applies width and height', () => {
    const el = document.createElement('div');
    applyWidgetSize(el, { width: '100px', height: '50px' });
    expect(el.style.width).toBe('100px');
    expect(el.style.height).toBe('50px');
  });

  test('applyWidgetSize ignores null', () => {
    const el = document.createElement('div');
    applyWidgetSize(el, null as any);
    expect(el.style.width).toBe('');
    expect(el.style.height).toBe('');
  });

  test('createWidgetContainer creates widget element with title', () => {
    const config: WidgetConfig = { id: 'w1', type: 'x', title: 'Title', settings: {} } as any;
    const { widgetEl, titleEl } = createWidgetContainer(config, 'cls');
    expect(widgetEl.classList.contains('widget')).toBe(true);
    expect(widgetEl.dataset.widgetId).toBe('w1');
    expect(titleEl?.textContent).toBe('Title');
  });
});
