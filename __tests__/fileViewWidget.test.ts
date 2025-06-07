import { FileViewWidget } from '../src/widgets/file-view';
import type { WidgetConfig } from '../src/interfaces';

describe('FileViewWidget', () => {
  const dummyConfig: WidgetConfig = {
    id: 'test-file-view',
    type: 'file-view',
    title: 'テストファイルビュー',
    settings: { fileName: 'test.md', heightMode: 'auto', fixedHeightPx: 200 }
  };
  const dummyApp = {
    vault: {
      getFiles: () => [{ path: 'test.md', extension: 'md' }],
      getAbstractFileByPath: (path: string) => ({ path, extension: 'md' }),
      read: jest.fn().mockResolvedValue('# テスト')
    },
    workspace: { openLinkText: jest.fn() }
  } as any;
  const dummyPlugin = { saveSettings: jest.fn() } as any;

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new FileViewWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('updateExternalSettingsで高さモードが切り替わる', () => {
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.updateExternalSettings({ heightMode: 'fixed', fixedHeightPx: 300 });
    expect(widget['heightMode']).toBe('fixed');
    expect(widget['fixedHeightPx']).toBe(300);
  });

  it('ファイル名変更でtitleElが更新される', () => {
    const widget = new FileViewWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['config'].settings.fileName = 'newfile.md';
    widget['updateTitle']();
    expect(widget['titleEl']?.textContent).toBe('newfile.md');
  });
}); 