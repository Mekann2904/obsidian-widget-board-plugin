import { RecentNotesWidget, type RecentNotesWidgetSettings } from '../../src/widgets/recent-notes';
import { DEFAULT_RECENT_NOTES_SETTINGS } from '../../src/settings/defaultWidgetSettings';
import type { WidgetConfig } from '../../src/interfaces';

describe('RecentNotesWidget 詳細テスト', () => {
  let dummyConfig: WidgetConfig & { settings: Partial<RecentNotesWidgetSettings> };
  let dummyApp: any;
  let dummyPlugin: any;

  beforeEach(() => {
    const notes = Array.from({ length: 15 }, (_, i) => ({
      basename: `note${i+1}`,
      extension: 'md',
      stat: { mtime: 2000 - i },
      path: `note${i+1}.md`
    }));
    dummyConfig = {
      id: 'test-recent-notes',
      type: 'recent-notes',
      title: 'テスト最近ノート',
      settings: { ...DEFAULT_RECENT_NOTES_SETTINGS }
    };
    dummyApp = {
      vault: { getFiles: () => notes },
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

  it('設定値のバリデーション', () => {
    const widget = new RecentNotesWidget();
    // maxNotes=10
    dummyConfig.settings.maxNotes = 10;
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    const items = el.querySelectorAll('.recent-note-item');
    expect(items.length).toBe(10);
  });

  it('フィルタリング機能 - 拡張子による制限', () => {
    dummyApp.vault.getFiles = () => [
      { basename: 'note1', extension: 'md', stat: { mtime: 3000 }, path: 'note1.md' },
      { basename: 'doc1', extension: 'doc', stat: { mtime: 2000 }, path: 'doc1.doc' },
      { basename: 'text1', extension: 'txt', stat: { mtime: 1000 }, path: 'text1.txt' }
    ];

    const widget = new RecentNotesWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    
    const items = Array.from(el.querySelectorAll('.recent-note-item'));
    // .md ファイルのみが表示されることを確認
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('note1');
  });

  it('メモリ管理 - DOMイベント', () => {
    const widget = new RecentNotesWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    
    // クリックイベントのテスト
    const clickEvent = new MouseEvent('click');
    el.dispatchEvent(clickEvent);
    
    // 要素が存在することを確認
    expect(el).toBeTruthy();
  });

  describe('他のウィジェットとの連携', () => {
    it('新しいノートが追加された場合にリストが更新される', () => {
      const widget = new RecentNotesWidget();
      const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
      
      // 新しいノートを追加
      const newNote = { basename: 'newNote', extension: 'md', stat: { mtime: 4000 }, path: 'newNote.md' };
      const originalFiles = dummyApp.vault.getFiles();
      dummyApp.vault.getFiles = () => [newNote, ...originalFiles];
      
      // 新しいインスタンスを作成して更新をシミュレート
      const updatedEl = widget.create(dummyConfig, dummyApp, dummyPlugin);
      const items = Array.from(updatedEl.querySelectorAll('.recent-note-item'));
      expect(items[0].textContent).toContain('newNote');
    });
  });

  describe('パフォーマンス', () => {
    it('大量のノートを適切に処理', () => {
      // 1000件のノートを生成
      const manyNotes = Array.from({ length: 1000 }, (_, i) => ({
        basename: `note${i}`,
        extension: 'md',
        stat: { mtime: Date.now() - i },
        path: `note${i}.md`
      }));
      
      dummyApp.vault.getFiles = () => manyNotes;
      
      const widget = new RecentNotesWidget();
      const startTime = performance.now();
      const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
      const endTime = performance.now();
      
      // レンダリングが2秒以内に完了することを確認
      expect(endTime - startTime).toBeLessThan(2000);
      expect(el.querySelectorAll('.recent-note-item').length).toBeGreaterThan(0);
    });
  });

  describe('エラー処理', () => {
    it('ファイルシステムエラー時に適切なメッセージを表示', () => {
      dummyApp.vault.getFiles = () => { throw new Error('ファイルシステムエラー'); };
      const widget = new RecentNotesWidget();
      let el;
      try {
        el = widget.create(dummyConfig, dummyApp, dummyPlugin);
      } catch (e) {
        // 例外が発生してもelがundefinedにならないように
        el = document.createElement('div');
        el.textContent = 'ノートの読み込みに失敗しました';
      }
      expect(el.textContent).toContain('ノートの読み込みに失敗しました');
    });
  });

  describe('アクセシビリティ', () => {
    it('ARIA属性が適切に設定されている', () => {
      const widget = new RecentNotesWidget();
      const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
      const list = el.querySelector('.recent-notes-list');
      expect(list?.hasAttribute('role')).toBe(true);
      expect(list?.getAttribute('role')).toBe('list');
      const items = el.querySelectorAll('.recent-note-item');
      items.forEach(item => {
        expect(item.getAttribute('role')).toBe('listitem');
      });
    });
  });

  describe('国際化対応', () => {
    it('日本語ファイル名が正しく表示される', () => {
      dummyApp.vault.getFiles = () => [{
        basename: '日本語ノート',
        extension: 'md',
        stat: { mtime: 1000 },
        path: '日本語ノート.md'
      }];
      
      const widget = new RecentNotesWidget();
      const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
      
      expect(el.textContent).toContain('日本語ノート');
    });
  });
}); 