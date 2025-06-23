import { WidgetBoardModal } from '../../src/modal';
import { loadReflectionSummaryShared } from '../../src/widgets/reflectionWidget/reflectionWidgetUI';
import { registeredWidgetImplementations } from '../../src/widgetRegistry';
import type { WidgetImplementation } from '../../src/interfaces';

// --- モックの設定 ---

// obsidianモジュール全体をモック
jest.mock('obsidian', () => {
  const originalModule = jest.requireActual('../../__mocks__/obsidian');
  return originalModule;
});

// loadReflectionSummarySharedがエラーをスローするようにモック化
jest.mock('../../src/widgets/reflectionWidget/reflectionWidgetUI', () => ({
  ...jest.requireActual('../../src/widgets/reflectionWidget/reflectionWidgetUI'),
  loadReflectionSummaryShared: jest.fn().mockRejectedValue(new Error('Test preload error')),
}));

// テスト用のシンプルなWidgetImplementation
class MockWidget implements WidgetImplementation {
  id = 'mock-widget';
  create = jest.fn().mockImplementation(() => {
    const { createEl } = require('../../__mocks__/obsidian');
    return createEl('div');
  });
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

describe('WidgetBoardModal: Outer Panel Modes', () => {
  let mockPlugin: any;
  let mockApp: any;
  let boardConfig: any;
  let modal: WidgetBoardModal;

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
    
    // DOM環境のセットアップとmockAppの準備
    const { createEl } = require('../../__mocks__/obsidian');
    mockApp = {
      dom: { 
        appContainerEl: createEl('div')
      }
    };
    
    boardConfig = {
      id: 'test-board',
      name: 'Test Board',
      widgets: [],
      defaultMode: 'mode-right-outer',
    };
    
    // DOM環境のセットアップ
    document.body.innerHTML = '';
    
    modal = new WidgetBoardModal(mockApp, mockPlugin, boardConfig);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('RIGHT_OUTERモードが正しく適用される', () => {
    modal.applyMode(WidgetBoardModal.MODES.RIGHT_OUTER);
    
    expect(modal.modalEl.classList.contains('mode-right-outer')).toBe(true);
    expect(modal.modalEl.style.width).toBe('');
    expect(modal.modalEl.style.right).toBe('');
    expect(modal.modalEl.style.left).toBe('');
    expect(modal.modalEl.style.transform).toBe('');
  });

  it('LEFT_OUTERモードが正しく適用される', () => {
    modal.applyMode(WidgetBoardModal.MODES.LEFT_OUTER);
    
    expect(modal.modalEl.classList.contains('mode-left-outer')).toBe(true);
    expect(modal.modalEl.style.width).toBe('');
    expect(modal.modalEl.style.left).toBe('');
    expect(modal.modalEl.style.right).toBe('');
    expect(modal.modalEl.style.transform).toBe('');
  });

  it('モード切り替え時に他のモードクラスが削除される', () => {
    // 最初にRIGHT_HALFモードを適用
    modal.applyMode(WidgetBoardModal.MODES.RIGHT_HALF);
    expect(modal.modalEl.classList.contains('mode-right-half')).toBe(true);
    
    // RIGHT_OUTERモードに切り替え
    modal.applyMode(WidgetBoardModal.MODES.RIGHT_OUTER);
    expect(modal.modalEl.classList.contains('mode-right-half')).toBe(false);
    expect(modal.modalEl.classList.contains('mode-right-outer')).toBe(true);
  });

  it('モードボタンのアクティブ状態が正しく更新される', () => {
    // モックのモードボタンを作成
    const button1 = document.createElement('button');
    button1.dataset.mode = WidgetBoardModal.MODES.RIGHT_OUTER;
    const button2 = document.createElement('button');
    button2.dataset.mode = WidgetBoardModal.MODES.LEFT_OUTER;
    
    modal.modeButtons = [button1, button2];
    
    modal.applyMode(WidgetBoardModal.MODES.RIGHT_OUTER);
    
    expect(button1.classList.contains('active')).toBe(true);
    expect(button2.classList.contains('active')).toBe(false);
  });

  it('OUTER モード時にbodyクラスが正しく設定される', () => {
    // モックのcontentElとmodalElに置き換える
    const { createEl } = require('../../__mocks__/obsidian');
    modal.contentEl = createEl('div');
    modal.modalEl = createEl('div');
    
    modal.open();
    
    // RIGHT_OUTERの場合
    modal.currentMode = WidgetBoardModal.MODES.RIGHT_OUTER;
    modal.onOpen();
    expect(document.body.classList.contains('wb-modal-right-outer-open')).toBe(true);
    
    modal.close();
    
    // LEFT_OUTERの場合
    boardConfig.defaultMode = WidgetBoardModal.MODES.LEFT_OUTER;
    const leftModal = new WidgetBoardModal(mockApp, mockPlugin, boardConfig);
    leftModal.contentEl = createEl('div');
    leftModal.modalEl = createEl('div');
    leftModal.currentMode = WidgetBoardModal.MODES.LEFT_OUTER;
    leftModal.open();
    leftModal.onOpen();
    expect(document.body.classList.contains('wb-modal-left-outer-open')).toBe(true);
  });
}); 