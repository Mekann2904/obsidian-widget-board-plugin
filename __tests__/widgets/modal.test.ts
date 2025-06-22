import { WidgetBoardModal } from '../../src/modal';
import { loadReflectionSummaryShared } from '../../src/widgets/reflectionWidget/reflectionWidgetUI';
import { registeredWidgetImplementations } from '../../src/widgetRegistry';
import type { WidgetImplementation } from '../../src/interfaces';

// --- モックの設定 ---

// loadReflectionSummarySharedがエラーをスローするようにモック化
jest.mock('../../src/widgets/reflectionWidget/reflectionWidgetUI', () => ({
  ...jest.requireActual('../../src/widgets/reflectionWidget/reflectionWidgetUI'),
  loadReflectionSummaryShared: jest.fn().mockRejectedValue(new Error('Test preload error')),
}));

// テスト用のシンプルなWidgetImplementation
class MockWidget implements WidgetImplementation {
  id = 'mock-widget';
  create = jest.fn().mockImplementation(() => document.createElement('div'));
	config?: any;
	onunload?(): void {}
}

// `registeredWidgetImplementations`にモックウィジェットを登録
registeredWidgetImplementations.set('reflection-widget', MockWidget as any);
registeredWidgetImplementations.set('normal-widget', MockWidget as any);

describe('WidgetBoardModal: Preload Error Handling', () => {
  let mockPlugin: any;
  let mockApp: any;
  let boardConfig: any;

  beforeEach(() => {
    mockPlugin = {
      app: {},
      settings: {
        boards: [],
        language: 'ja',
        weekStartDay: 'sunday',
        useIdleCallback: false,
      },
    };
    mockApp = {};
    boardConfig = {
      id: 'test-board',
      name: 'Test Board',
      widgets: [
        { id: 'widget-1', type: 'reflection-widget', title: 'Reflection' },
      ],
      defaultMode: 'mode-right-half',
    };
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('データプリロードが失敗しても、loadWidgets処理が停止しないこと', async () => {
    const modal = new WidgetBoardModal(mockApp, mockPlugin, boardConfig);
    const container = document.createElement('div');

    await modal.loadWidgets(container);
    
    expect(console.error).toHaveBeenCalledWith(
      'Error preloading data for reflection widget:',
      expect.any(Error)
    );
    
    expect(container.children.length).toBeGreaterThan(0);
    expect(container.querySelector('[data-widget-id="widget-1"]')).not.toBeNull();
  });
}); 