import { RecentNotesWidget, DEFAULT_RECENT_NOTES_SETTINGS } from '../../src/widgets/recent-notes';
import type { WidgetConfig } from '../../src/interfaces';

describe('RecentNotesWidget 詳細テスト', () => {
  let dummyConfig: WidgetConfig;
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    dummyConfig = {
      id: 'test-recent-notes',
      type: 'recent-notes',
      title: 'テスト最近ノート',
      settings: { ...DEFAULT_RECENT_NOTES_SETTINGS }
    };
    dummyApp = {
      vault: {
        getFiles: () => [
          { basename: 'note1', extension: 'md', stat: { mtime: 2000 }, path: 'note1.md' },
          { basename: 'note2', extension: 'md', stat: { mtime: 1000 }, path: 'note2.md' }
        ]
      },
      workspace: { openLinkText: jest.fn() }
    };
    dummyPlugin = { settings: {} };
  });

  it('createでrecent-notes-widgetクラスとリストが生成される', () => {
    const widget = new RecentNotesWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('recent-notes-widget')).toBe(true);
    expect(el.querySelector('.recent-notes-list')).toBeTruthy();
  });

  it('ノートが存在しない場合はメッセージが表示される', () => {
    dummyApp.vault.getFiles = () => [];
    const widget = new RecentNotesWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.textContent).toContain('最近編集したノートがありません');
  });

  it('ノートリストがmtime降順で正しく描画される', () => {
    const widget = new RecentNotesWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const items = Array.from(el.querySelectorAll('.recent-note-item'));
    expect(items[0].textContent).toContain('note1');
    expect(items[1].textContent).toContain('note2');
  });

  it('ノート名クリックでopenLinkTextが呼ばれる', () => {
    const widget = new RecentNotesWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const link = el.querySelector('.recent-note-item a') as HTMLAnchorElement;
    link.click();
    expect(dummyApp.workspace.openLinkText).toHaveBeenCalledWith('note1.md', '', false);
  });

  it('maxNotes設定で表示件数が制限される', () => {
    dummyConfig.settings.maxNotes = 1;
    const widget = new RecentNotesWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const items = el.querySelectorAll('.recent-note-item');
    expect(items.length).toBe(1);
  });

  it('updateExternalSettingsでmaxNotesが反映される', () => {
    const widget = new RecentNotesWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.updateExternalSettings({ maxNotes: 1 });
    expect(widget['currentSettings'].maxNotes).toBe(1);
    const items = widget['widgetEl'].querySelectorAll('.recent-note-item');
    expect(items.length).toBe(1);
  });

  // 仮想リストのテストは必要に応じて追加可能
}); 