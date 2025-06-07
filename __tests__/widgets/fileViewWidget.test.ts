import { FileViewWidget } from '../../src/widgets/file-view';
import type { WidgetConfig } from '../../src/interfaces';

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
        getFiles: () => [{ path: 'test.md', extension: 'md' }],
        getAbstractFileByPath: (path: string) => ({ path, extension: 'md' }),
        read: jest.fn().mockResolvedValue('# テスト')
      },
      workspace: { openLinkText: jest.fn() }
    };
    dummyPlugin = { saveSettings: jest.fn() };
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
    dummyConfig.settings.fileName = '';
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await Promise.resolve();
    expect(widget['fileContentEl'].textContent).toContain('ファイルが選択されていません');
  });

  it('.md以外の拡張子指定時はエラーメッセージ', async () => {
    dummyConfig.settings.fileName = 'test.txt';
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await Promise.resolve();
    expect(widget['fileContentEl'].textContent).toContain('Markdown（.md）ファイルのみ表示できます');
  });

  it('存在しないファイル名指定時は「ファイルが見つかりません」', async () => {
    dummyApp.vault.getAbstractFileByPath = () => null;
    dummyConfig.settings.fileName = 'notfound.md';
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await Promise.resolve();
    expect(widget['fileContentEl'].textContent).toContain('ファイルが見つかりません');
  });

  it('Obsidianで開くボタンでopenLinkTextが呼ばれる', async () => {
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['currentFile'] = {
      path: 'test.md',
      extension: 'md',
      stat: { ctime: 0, mtime: 0, size: 0 },
      basename: 'test',
      vault: dummyApp.vault,
      name: 'test.md',
      parent: null
    };
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

  it('ファイル名変更でタイトルが自動更新される', () => {
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['config'].settings.fileName = 'newfile.md';
    widget['updateTitle']();
    expect(widget['titleEl']?.textContent).toBe('newfile.md');
  });

  // openFileSuggestやonunloadのテストも必要に応じて追加可能
});
