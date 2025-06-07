import { RecentNotesWidget, DEFAULT_RECENT_NOTES_SETTINGS } from '../../src/widgets/recent-notes';
import type { WidgetConfig } from '../../src/interfaces';

describe('RecentNotesWidget', () => {
  const dummyConfig: WidgetConfig = {
    id: 'test-recent-notes',
    type: 'recent-notes',
    title: 'テスト最近ノート',
    settings: { ...DEFAULT_RECENT_NOTES_SETTINGS }
  };
  const dummyApp = {
    vault: {
      getFiles: () => [
        { basename: 'note1', extension: 'md', stat: { mtime: 1000 }, path: 'note1.md' },
        { basename: 'note2', extension: 'md', stat: { mtime: 2000 }, path: 'note2.md' }
      ]
    },
    workspace: { openLinkText: jest.fn() }
  } as any;
  const dummyPlugin = { settings: {} } as any;

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new RecentNotesWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('updateExternalSettingsでmaxNotesが反映される', () => {
    const widget = new RecentNotesWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.updateExternalSettings({ maxNotes: 1 });
    expect(widget['currentSettings'].maxNotes).toBe(1);
  });

  it('ノートリストが正しく描画される', () => {
    const widget = new RecentNotesWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const list = el.querySelectorAll('.recent-note-item');
    expect(list.length).toBeGreaterThan(0);
  });
}); 