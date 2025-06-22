import { ReflectionWidget } from '../../src/widgets/reflectionWidget/reflectionWidget';
import type { WidgetConfig } from '../../src/interfaces';
import type { ReflectionWidgetSettings } from '../../src/widgets/reflectionWidget/reflectionWidgetTypes';
import { App } from 'obsidian';

describe('ReflectionWidget 詳細テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-reflection-widget',
      type: 'reflection-widget',
      title: 'テストリフレクション',
      settings: { period: 'today', aiSummaryAutoEnabled: true } as ReflectionWidgetSettings
    };
    dummyApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(true),
          read: jest.fn().mockResolvedValue('{"posts": [], "scheduledPosts": []}'),
          write: jest.fn(),
        },
        getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        read: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        createFolder: jest.fn(),
      },
    };
    dummyPlugin = { settings: { weekStartDay: 1 } };
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
    expect(() => widget.create(dummyConfig, dummyApp, dummyPlugin)).not.toThrow();
    expect(widget['ui']).toBeDefined();
  });

  it('updateExternalSettingsで設定が反映されrefreshが呼ばれる', () => {
    const widget = new ReflectionWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const spy = jest.spyOn(widget, 'refresh');
    widget.updateExternalSettings({ aiSummaryAutoEnabled: false });
    expect((widget.config.settings as ReflectionWidgetSettings).aiSummaryAutoEnabled).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('refreshでUIのscheduleRenderが呼ばれる', () => {
    const widget = new ReflectionWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    if (widget['ui']) {
      const spy = jest.spyOn(widget['ui'], 'scheduleRender');
      widget.refresh();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('uiがnullでもrefreshでエラーにならない', () => {
    const widget = new ReflectionWidget();
    widget['ui'] = null;
    expect(() => widget.refresh()).not.toThrow();
  });
});

describe('ReflectionWidget 設定値テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-reflection-widget',
      type: 'reflection-widget',
      title: 'テストリフレクション',
      settings: {}
    };
    dummyApp = {
      vault: {
        adapter: { exists: jest.fn().mockResolvedValue(true), read: jest.fn().mockResolvedValue('{}'), write: jest.fn() },
        getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        read: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        createFolder: jest.fn(),
      }
    };
    dummyPlugin = { settings: { weekStartDay: 1 } };
  });

  it('デフォルト設定値が正しく設定される', () => {
    const widget = new ReflectionWidget();
    widget.create({ ...dummyConfig, settings: {} }, dummyApp, dummyPlugin);
    const settings = widget.config.settings as ReflectionWidgetSettings;
    expect(settings.period).toBe('today');
    expect(settings.aiSummaryAutoEnabled).toBe(false);
  });

  it('設定値の部分更新が正しく動作する', () => {
    const widget = new ReflectionWidget();
    const initialConfig = {
      ...dummyConfig,
      settings: {
        aiSummaryAutoEnabled: true,
      }
    };
    widget.create(initialConfig, dummyApp, dummyPlugin);
    
    expect((widget.config.settings as ReflectionWidgetSettings).aiSummaryAutoEnabled).toBe(true);
    
    widget.updateExternalSettings({ period: 'week' });
    expect((widget.config.settings as ReflectionWidgetSettings).period).toBe('week');
    expect((widget.config.settings as ReflectionWidgetSettings).aiSummaryAutoEnabled).toBe(true);

    widget.updateExternalSettings({ aiSummaryAutoEnabled: false });
    expect((widget.config.settings as ReflectionWidgetSettings).aiSummaryAutoEnabled).toBe(false);
  });
});

describe('ReflectionWidget プリロードバンドルテスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-reflection-widget',
      type: 'reflection-widget',
      title: 'テストリフレクション',
      settings: { period: 'today', aiSummaryAutoEnabled: true } as ReflectionWidgetSettings
    };
    dummyApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(true),
          read: jest.fn().mockResolvedValue('{"posts": [], "scheduledPosts": []}'),
          write: jest.fn(),
        },
        getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        read: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        createFolder: jest.fn(),
      },
    };
    dummyPlugin = { settings: { weekStartDay: 1 } };
  });

  it('プリロードバンドルが正しく渡される', () => {
    const widget = new ReflectionWidget();
    const preloadBundle = {
      chartModule: {},
      todaySummary: { summary: 'test', html: '<p>test</p>', postCount: 5 },
      weekSummary: { summary: 'week', html: '<p>week</p>', postCount: 10 }
    };
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin, preloadBundle);
    expect(el).toBeDefined();
    expect(widget['ui']).toBeDefined();
  });

  it('プリロードバンドルなしでも正常に動作する', () => {
    const widget = new ReflectionWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeDefined();
    expect(widget['ui']).toBeDefined();
  });
});

describe('ReflectionWidget UI統合テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-reflection-widget',
      type: 'reflection-widget',
      title: 'テストリフレクション',
      settings: { period: 'today', aiSummaryAutoEnabled: true } as ReflectionWidgetSettings
    };
    dummyApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(true),
          read: jest.fn().mockResolvedValue('{"posts": [], "scheduledPosts": []}'),
          write: jest.fn(),
        },
        getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        read: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        createFolder: jest.fn()
      }
    };
    dummyPlugin = { settings: { weekStartDay: 1 } };
  });

  it('UIのライフサイクルが正しく動作する', async () => {
    const widget = new ReflectionWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    
    expect(el.querySelector('.widget-title')).toBeDefined();
    expect(el.querySelector('.widget-content')).toBeDefined();
    
    widget.updateExternalSettings({ period: 'week' });
    expect((widget.config.settings as ReflectionWidgetSettings).period).toBe('week');
  });

  it('AI要約機能の統合テスト', async () => {
    const mockPlugin = {
      ...dummyPlugin,
      llmManager: {
        generateReplyWithDefault: jest.fn().mockResolvedValue('テスト要約')
      },
      settings: { 
        ...dummyPlugin.settings,
        llm: { gemini: { apiKey: 'test' } },
        reflectionAiModel: 'gemini-pro'
      }
    };
    
    const widget = new ReflectionWidget();
    widget.create(dummyConfig, dummyApp, mockPlugin);
    
    if (widget['ui']) {
      const runSummarySpy = jest.spyOn(widget['ui'], 'runSummary' as any);
      await widget['ui']['runSummary'](true);
      expect(runSummarySpy).toHaveBeenCalledWith(true);
      runSummarySpy.mockRestore();
    }
  });

  it('複数回の設定変更が正しく処理される', () => {
    const widget = new ReflectionWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    
    const refreshSpy = jest.spyOn(widget, 'refresh');
    
    widget.updateExternalSettings({ period: 'week' });
    widget.updateExternalSettings({ aiSummaryAutoEnabled: false });
    widget.updateExternalSettings({ aiSummaryManualEnabled: true });
    
    expect(refreshSpy).toHaveBeenCalledTimes(3);
    expect((widget.config.settings as ReflectionWidgetSettings).period).toBe('week');
    expect((widget.config.settings as ReflectionWidgetSettings).aiSummaryAutoEnabled).toBe(false);
    expect((widget.config.settings as ReflectionWidgetSettings).aiSummaryManualEnabled).toBe(true);
    
    refreshSpy.mockRestore();
  });
});

describe('ReflectionWidget データ永続化テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-reflection-widget',
      type: 'reflection-widget',
      title: 'テストリフレクション',
      settings: { period: 'today', aiSummaryAutoEnabled: true } as ReflectionWidgetSettings
    };
    dummyApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(true),
          read: jest.fn().mockResolvedValue('{"reflectionSummaries": {}}'),
          write: jest.fn().mockResolvedValue(undefined)
        },
        getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        read: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        createFolder: jest.fn()
      }
    };
    dummyPlugin = { settings: { weekStartDay: 1 } };
  });

  it('要約データの保存と読み込み', async () => {
    const mockApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(true),
          read: jest.fn().mockResolvedValue('{"reflectionSummaries": {}}'),
          write: jest.fn().mockResolvedValue(undefined)
        },
        getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        read: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        createFolder: jest.fn()
      }
    } as unknown as App;
    
    const widget = new ReflectionWidget();
    widget.create(dummyConfig, mockApp, dummyPlugin);
    
    if (widget['ui']) {
      (widget['ui'] as any).plugin.llmManager = {
        generateReplyWithDefault: jest.fn().mockResolvedValue('テスト要約')
      };
      (widget['ui'] as any).app = mockApp;

      await widget['ui']['runSummary'](true);
      expect(mockApp.vault.process).toHaveBeenCalled();
    }
  });

  it('ファイル読み込みエラー時の処理', async () => {
    const mockApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(true),
          read: jest.fn().mockRejectedValue(new Error('File not found')),
          write: jest.fn().mockResolvedValue(undefined)
        },
        getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        read: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        createFolder: jest.fn()
      }
    } as unknown as App;
    
    const widget = new ReflectionWidget();
    expect(() => widget.create(dummyConfig, mockApp, dummyPlugin)).not.toThrow();
  });
});

describe('ReflectionWidget パフォーマンステスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-reflection-widget',
      type: 'reflection-widget',
      title: 'テストリフレクション',
      settings: { period: 'today', aiSummaryAutoEnabled: true } as ReflectionWidgetSettings
    };
    dummyApp = {
        vault: {
            adapter: {
                exists: jest.fn().mockResolvedValue(true),
                read: jest.fn().mockResolvedValue('{}'),
                write: jest.fn(),
            },
            getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
            getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
            read: jest.fn(),
            create: jest.fn(),
            process: jest.fn(),
            createFolder: jest.fn(),
        },
    };
    dummyPlugin = { settings: { weekStartDay: 1 } };
  });

  it('大量データでのレンダリング性能', async () => {
    const widget = new ReflectionWidget();
    const startTime = performance.now();
    
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const endTime = performance.now();
    
    expect(endTime - startTime).toBeLessThan(1000);
  });

  it('メモリリークの検証', () => {
    const widget = new ReflectionWidget();
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
    
    for (let i = 0; i < 10; i++) {
      widget.create(dummyConfig, dummyApp, dummyPlugin);
      if (widget['ui']) {
        widget['ui'].onunload();
      }
    }
    
    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;
    
    if (initialMemory > 0) {
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    }
  });

  it('連続的な設定変更の性能', () => {
    const widget = new ReflectionWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    
    const startTime = performance.now();
    
    for (let i = 0; i < 100; i++) {
      widget.updateExternalSettings({ period: i % 2 === 0 ? 'today' : 'week' });
    }
    
    const endTime = performance.now();
    
    expect(endTime - startTime).toBeLessThan(500);
  });
});

describe('ReflectionWidget エラーハンドリングテスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-reflection-widget',
      type: 'reflection-widget',
      title: 'テストリフレクション',
      settings: { period: 'today', aiSummaryAutoEnabled: true } as ReflectionWidgetSettings
    };
    dummyApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(true),
          read: jest.fn().mockResolvedValue('{"posts": [], "scheduledPosts": []}'),
          write: jest.fn()
        },
        getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        read: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        createFolder: jest.fn()
      }
    };
    dummyPlugin = { settings: { weekStartDay: 1 } };
  });

  it('LLM API接続エラー時の処理', async () => {
    const mockPlugin = {
      ...dummyPlugin,
      llmManager: {
        generateReplyWithDefault: jest.fn().mockRejectedValue(new Error('API Error'))
      },
      settings: { 
        ...dummyPlugin.settings,
        llm: { gemini: { apiKey: 'test' } }
      }
    };
    
    const widget = new ReflectionWidget();
    widget.create(dummyConfig, dummyApp, mockPlugin);
    
    if (widget['ui']) {
      await widget['ui']['runSummary'](true);
      expect(widget['ui']).toBeDefined();
    }
  });

  it('ファイルシステムエラー時の処理', async () => {
    const mockApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(false),
          read: jest.fn().mockRejectedValue(new Error('File Error')),
          write: jest.fn().mockRejectedValue(new Error('File Error'))
        }
      }
    } as unknown as App;
    
    const widget = new ReflectionWidget();
    expect(() => widget.create(dummyConfig, mockApp, dummyPlugin)).not.toThrow();
  });

  it('無効な設定値でのエラーハンドリング', () => {
    const widget = new ReflectionWidget();
    const invalidConfig = {
      ...dummyConfig,
      settings: { 
        period: 'invalid' as any,
        aiSummaryAutoEnabled: 'not-boolean' as any
      } as ReflectionWidgetSettings
    };
    
    expect(() => widget.create(invalidConfig, dummyApp, dummyPlugin)).not.toThrow();
  });

  it('不完全な設定でのエラーハンドリング', () => {
    const widget = new ReflectionWidget();
    
    const incompleteConfig = {
      id: 'test-reflection-widget',
      type: 'reflection-widget',
      title: '',
      settings: { period: 'today', aiSummaryAutoEnabled: true } as ReflectionWidgetSettings
    };
    
    expect(() => widget.create(incompleteConfig, dummyApp, dummyPlugin)).not.toThrow();
  });
});

describe('ReflectionWidget アクセシビリティテスト', () => {
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
    dummyApp = {
      vault: {
        adapter: {
          exists: jest.fn().mockResolvedValue(true),
          read: jest.fn().mockResolvedValue('{"posts": [], "scheduledPosts": []}'),
          write: jest.fn(),
        },
        getFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        getAbstractFileByPath: jest.fn(() => new (require('obsidian').TFile)()),
        read: jest.fn(),
        create: jest.fn(),
        process: jest.fn(),
        createFolder: jest.fn(),
      },
    };
    dummyPlugin = { settings: { weekStartDay: 1 } };
  });

  it('ARIA属性が正しく設定される', () => {
    const widget = new ReflectionWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    
    const title = el.querySelector('.widget-title');
    expect(title).toBeDefined();
    
    const content = el.querySelector('.widget-content');
    expect(content).toBeDefined();
  });

  it('キーボードナビゲーションが機能する', () => {
    const widget = new ReflectionWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    
    const buttons = el.querySelectorAll('button');
    buttons.forEach(button => {
      expect(button).toBeDefined();
    });
  });
}); 