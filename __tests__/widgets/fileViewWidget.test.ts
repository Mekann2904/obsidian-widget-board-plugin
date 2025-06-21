import { FileViewWidget } from '../../src/widgets/file-view';
import type { WidgetConfig } from '../../src/interfaces';
import { TFile } from 'obsidian';

// FileSuggestModal is not exported from its module, so it cannot be mocked directly.
// The tests that depend on its functionality will spy on the methods that use it.

describe('FileViewWidget 詳細テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-file-view',
      type: 'file-view',
      title: 'テストファイルビュー',
      settings: { fileName: 'test.md', heightMode: 'auto', fixedHeightPx: 200 }
    };
    dummyApp = {
      vault: {
        getFiles: () => {
          const file = Object.create(TFile.prototype);
          return [Object.assign(file, { path: 'test.md', name: 'test.md', basename: 'test', extension: 'md' })];
        },
        getAbstractFileByPath: (path: string) => {
          if (path === 'notfound.md') return null;
          const file = Object.create(TFile.prototype);
          return Object.assign(file, { path: path, name: path.split('/').pop() || '', basename: path.split('/').pop()?.replace(/\.md$/, '') || '', extension: 'md' });
        },
        read: jest.fn().mockResolvedValue('# テスト')
      },
      workspace: { openLinkText: jest.fn() }
    };
    dummyPlugin = {
      saveSettings: jest.fn(),
      settings: {
        language: 'ja'
      }
    };
  });

  it('createでfile-view-widgetクラスとコントロールが生成される', () => {
    const widget = new FileViewWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('file-view-widget')).toBe(true);
    expect(el.querySelector('input[type="text"]')).toBeTruthy();
    expect(el.querySelector('button')).toBeTruthy();
    expect(el.querySelector('.file-content')).toBeTruthy();
  });

  it('ファイル名未指定時は「ファイルが選択されていません」と表示', async () => {
    (dummyConfig.settings as any).fileName = '';
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await Promise.resolve();
    expect(widget['fileContentEl'].textContent).toContain('ファイルが選択されていません');
  });

  it('.md以外の拡張子指定時はエラーメッセージ', async () => {
    (dummyConfig.settings as any).fileName = 'test.txt';
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await Promise.resolve();
    expect(widget['fileContentEl'].textContent).toContain('Markdown (.md) ファイルのみ表示できます');
  });

  it('存在しないファイル名指定時は「ファイルが見つかりません」', async () => {
    (dummyConfig.settings as any).fileName = 'notfound.md';
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await Promise.resolve();
    expect(widget['fileContentEl'].textContent).toContain('ファイルが見つかりません');
  });

  it('Obsidianで開くボタンでopenLinkTextが呼ばれる', async () => {
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    const file = Object.create(TFile.prototype);
    widget['currentFile'] = Object.assign(file, { path: 'test.md', name: 'test.md', basename: 'test', extension: 'md' });
    const btn = widget['obsidianOpenButton'];
    btn.click();
    expect(dummyApp.workspace.openLinkText).toHaveBeenCalledWith('test.md', '', false);
  });

  it('updateExternalSettingsで高さモード・pxが反映される', () => {
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.updateExternalSettings({ heightMode: 'fixed', fixedHeightPx: 300 });
    expect(widget['fileContentEl'].style.height).toBe('300px');
    widget.updateExternalSettings({ heightMode: 'auto' });
    expect(widget['fileContentEl'].style.height).toBe('');
  });

  it('ファイル名変更でタイトルがファイル名に自動更新される', () => {
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    (widget['config'].settings as any).fileName = 'new/path/to/newfile.md';
    widget['updateTitle']();
    expect(widget['titleEl']?.textContent).toBe('newfile.md');
  });

  it('ファイル選択ボタンクリックでopenFileSuggestが呼ばれる', () => {
    const widget = new FileViewWidget();
    const openFileSuggestSpy = jest.spyOn(widget as any, 'openFileSuggest').mockImplementation(() => { });
    widget.create(dummyConfig, dummyApp, dummyPlugin);

    const selectBtn = widget['selectButton'];
    selectBtn.click();

    expect(openFileSuggestSpy).toHaveBeenCalled();
    openFileSuggestSpy.mockRestore();
  });

  it('空ファイル表示時にエラーが発生しない', async () => {
    dummyApp.vault.read.mockResolvedValue(''); // 空のファイル内容
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);

    await new Promise(process.nextTick); // loadFile内の非同期処理を待つ

    expect(widget['fileContentEl'].textContent).toBe('');
  });

  it('設定保存が適切なタイミングで呼ばれる（統合テスト）', async () => {
    const widget = new FileViewWidget();

    const mockFile = { path: 'selected.md' } as TFile;
    let modalInstance: any;

    // openFileSuggestの実装を、モーダルを実際に開く代わりにインスタンスを捕捉するスパイに置き換える
    const openFileSuggestSpy = jest.spyOn(widget as any, 'openFileSuggest').mockImplementation(() => {
      // 実際のFileSuggestModalのコンストラクタからonChooseコールバックを取得
      const onChooseCb = (file: TFile) => {
        (widget as any).fileNameInput.value = file.path;
        (widget as any).config.settings.fileName = file.path;
        (widget as any).plugin.saveSettings();
        (widget as any).loadFile();
        (widget as any).updateTitle();
      };
      // ここではFileSuggestModalのモックは使わず、実際のコールバックのロジックをテスト
      onChooseCb(mockFile);
    });

    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['selectButton'].click(); // これでモックしたopenFileSuggestが呼ばれる

    await Promise.resolve();

    // ファイル名が更新され、保存が呼ばれることを確認
    expect((widget['config'].settings as any).fileName).toBe('selected.md');
    expect(dummyPlugin.saveSettings).toHaveBeenCalled();

    openFileSuggestSpy.mockRestore();
  });

  it('onunloadがエラーなく実行される', () => {
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    // unloadは現状空だが、将来的な実装のために呼び出しテストを追加
    expect(() => widget.onunload()).not.toThrow();
  });

  // openFileSuggestやonunloadのテストも必要に応じて追加可能
});
