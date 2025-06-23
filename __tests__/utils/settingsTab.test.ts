import { WidgetBoardSettingTab } from '../../src/settingsTab';
import { renderTweetWidgetSettings } from '../../src/settings/tweetSettings';
import { renderBoardManagementUI, renderSelectedBoardSettingsUI } from '../../src/settings/boardGroupSettings';

// obsidianモジュール全体をモック
jest.mock('obsidian', () => {
  const originalModule = jest.requireActual('../../__mocks__/obsidian');
  return originalModule;
});

describe('SettingsTab: Defensive Checks', () => {
  let mockApp: any;
  let mockConsoleError: jest.SpyInstance;
  let containerEl: HTMLElement;

  beforeEach(() => {
    mockApp = {
      vault: {
        getAllLoadedFiles: jest.fn().mockReturnValue([]),
      },
    };
    
    // console.errorをモック化
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // DOM要素を作成（テスト用のコンテナ）
    const { createEl } = require('../../__mocks__/obsidian');
    containerEl = createEl('div');
  });

  afterEach(() => {
    // モックをリストア
    mockConsoleError.mockRestore();
    
    // DOMをクリア
    containerEl.innerHTML = '';
  });

  describe('WidgetBoardSettingTab', () => {
    it('pluginがundefinedの場合はコンストラクタでエラーログが出力される', () => {
      const tab = new WidgetBoardSettingTab(mockApp, undefined as any);
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'WidgetBoardSettingTab: plugin or plugin.settings is undefined',
        expect.objectContaining({
          plugin: undefined,
          settings: undefined
        })
      );
    });

    it('plugin.settingsがundefinedの場合はコンストラクタでエラーログが出力される', () => {
      const mockPlugin = { settings: undefined };
      const tab = new WidgetBoardSettingTab(mockApp, mockPlugin as any);
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'WidgetBoardSettingTab: plugin or plugin.settings is undefined',
        expect.objectContaining({
          plugin: mockPlugin,
          settings: undefined
        })
      );
    });

    it('display()でpluginがundefinedの場合はエラーログが出力され早期リターンする', () => {
      const tab = new WidgetBoardSettingTab(mockApp, undefined as any);
      mockConsoleError.mockClear();
      
      tab.display();
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'WidgetBoardSettingTab.display: plugin or plugin.settings is undefined',
        expect.objectContaining({
          plugin: undefined,
          settings: undefined
        })
      );
    });

    it('正常なpluginとsettingsがある場合はエラーログが出力されない', () => {
      const mockPlugin = {
        settings: {
          language: 'ja',
          boards: [],
        },
        saveSettings: jest.fn(),
      };
      
      const tab = new WidgetBoardSettingTab(mockApp, mockPlugin as any);
      
      // コンストラクタでエラーが出ないことを確認
      expect(mockConsoleError).not.toHaveBeenCalled();
    });
  });

  describe('renderTweetWidgetSettings', () => {
    it('tabがundefinedの場合はエラーログが出力され早期リターンする', () => {
      renderTweetWidgetSettings(undefined as any, containerEl);
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'renderTweetWidgetSettings: tab.plugin.settings is undefined',
        expect.objectContaining({
          tab: undefined,
          plugin: undefined,
          settings: undefined
        })
      );
      expect(containerEl.children.length).toBe(0);
    });

    it('tab.pluginがundefinedの場合はエラーログが出力され早期リターンする', () => {
      const mockTab = { plugin: undefined };
      
      renderTweetWidgetSettings(mockTab as any, containerEl);
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'renderTweetWidgetSettings: tab.plugin.settings is undefined',
        expect.objectContaining({
          tab: mockTab,
          plugin: undefined,
          settings: undefined
        })
      );
      expect(containerEl.children.length).toBe(0);
    });

    it('tab.plugin.settingsがundefinedの場合はエラーログが出力され早期リターンする', () => {
      const mockTab = {
        plugin: { settings: undefined }
      };
      
      renderTweetWidgetSettings(mockTab as any, containerEl);
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'renderTweetWidgetSettings: tab.plugin.settings is undefined',
        expect.objectContaining({
          tab: mockTab,
          plugin: mockTab.plugin,
          settings: undefined
        })
      );
      expect(containerEl.children.length).toBe(0);
    });

    it('正常なtab.plugin.settingsがある場合はエラーログが出力されない', () => {
      const mockTab = {
        plugin: {
          settings: {
            language: 'ja',
            userProfiles: [],
            boards: []
          },
          saveSettings: jest.fn()
        }
      };
      
      renderTweetWidgetSettings(mockTab as any, containerEl);
      
      // エラーログが出力されないことを確認
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        expect.stringContaining('renderTweetWidgetSettings: tab.plugin.settings is undefined'),
        expect.anything()
      );
    });
  });

  describe('renderBoardManagementUI', () => {
    it('tabがundefinedの場合はエラーログが出力され早期リターンする', () => {
      renderBoardManagementUI(containerEl, undefined as any, 'ja');
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'renderBoardManagementUI: tab.plugin.settings is undefined',
        expect.objectContaining({
          tab: undefined,
          plugin: undefined,
          settings: undefined
        })
      );
      expect(containerEl.children.length).toBe(0);
    });

    it('tab.plugin.settingsがundefinedの場合はエラーログが出力され早期リターンする', () => {
      const mockTab = {
        plugin: { settings: undefined }
      };
      
      renderBoardManagementUI(containerEl, mockTab as any, 'ja');
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'renderBoardManagementUI: tab.plugin.settings is undefined',
        expect.objectContaining({
          tab: mockTab,
          plugin: mockTab.plugin,
          settings: undefined
        })
      );
      expect(containerEl.children.length).toBe(0);
    });

    it('正常なtab.plugin.settingsがある場合はエラーログが出力されない', () => {
      const mockTab = {
        plugin: {
          settings: {
            boards: []
          },
          saveSettings: jest.fn()
        },
        selectedBoardId: null,
        boardDropdownEl: null
      };
      
      renderBoardManagementUI(containerEl, mockTab as any, 'ja');
      
      // エラーログが出力されないことを確認
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        expect.stringContaining('renderBoardManagementUI: tab.plugin.settings is undefined'),
        expect.anything()
      );
    });
  });

  describe('renderSelectedBoardSettingsUI', () => {
    it('tabがundefinedの場合はエラーログが出力され早期リターンする', () => {
      renderSelectedBoardSettingsUI(containerEl, undefined as any, 'ja');
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'renderSelectedBoardSettingsUI: tab.plugin.settings is undefined',
        expect.objectContaining({
          tab: undefined,
          plugin: undefined,
          settings: undefined
        })
      );
      expect(containerEl.children.length).toBe(0);
    });

    it('tab.plugin.settingsがundefinedの場合はエラーログが出力され早期リターンする', () => {
      const mockTab = {
        plugin: { settings: undefined },
        selectedBoardId: 'test-board'
      };
      
      renderSelectedBoardSettingsUI(containerEl, mockTab as any, 'ja');
      
      expect(mockConsoleError).toHaveBeenCalledWith(
        'renderSelectedBoardSettingsUI: tab.plugin.settings is undefined',
        expect.objectContaining({
          tab: mockTab,
          plugin: mockTab.plugin,
          settings: undefined
        })
      );
      expect(containerEl.children.length).toBe(0);
    });

    it('正常なtab.plugin.settingsがある場合はエラーログが出力されない', () => {
      const mockBoard = {
        id: 'test-board',
        name: 'Test Board',
        widgets: []
      };
      
      const mockTab = {
        plugin: {
          settings: {
            boards: [mockBoard]
          },
          saveSettings: jest.fn()
        },
        selectedBoardId: 'test-board'
      };
      
      renderSelectedBoardSettingsUI(containerEl, mockTab as any, 'ja');
      
      // エラーログが出力されないことを確認
      expect(mockConsoleError).not.toHaveBeenCalledWith(
        expect.stringContaining('renderSelectedBoardSettingsUI: tab.plugin.settings is undefined'),
        expect.anything()
      );
    });
  });
}); 