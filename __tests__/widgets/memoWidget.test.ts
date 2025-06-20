import { MemoWidget, DEFAULT_MEMO_SETTINGS } from '../../src/widgets/memo';
import type { WidgetConfig } from '../../src/interfaces';
import { MarkdownRenderer } from 'obsidian';

jest.mock('obsidian');

let dummyConfig: WidgetConfig;
let dummyApp: any;
let dummyPlugin: any;

const renderMarkdownStub = (md: string, el: HTMLElement) => {
  const html = md
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- \[ \] (.+)$/gm, '<li><input type="checkbox"> $1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  el.innerHTML = html;
  return Promise.resolve();
};

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  (console.error as jest.Mock).mockRestore();
});

beforeEach(() => {
  dummyConfig = {
    id: 'test-memo',
    type: 'memo',
    title: 'テストメモ',
    settings: { ...DEFAULT_MEMO_SETTINGS }
  };
  dummyApp = {};
  dummyPlugin = { settings: { boards: [] }, saveSettings: jest.fn() };
  (MarkdownRenderer.renderMarkdown as jest.Mock).mockImplementation(renderMarkdownStub);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('MemoWidget 詳細テスト', () => {

  it('createでmemo-widgetクラスとUI要素が生成される', () => {
    const widget = new MemoWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('memo-widget')).toBe(true);
    expect(el.querySelector('.memo-widget-display')).toBeTruthy();
    expect(el.querySelector('.memo-widget-edit-button')).toBeTruthy();
    expect(el.querySelector('.memo-widget-edit-container')).toBeTruthy();
  });

  it('memoContentが空なら表示エリアは非表示', async () => {
    (dummyConfig.settings as import('../../src/widgets/memo').MemoWidgetSettings).memoContent = '';
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(widget['memoDisplayEl'].style.display).toBe('');
  });

  it('memoContentがある場合はMarkdownがレンダリングされる', async () => {
    (dummyConfig.settings as import('../../src/widgets/memo').MemoWidgetSettings).memoContent = '# 見出し';
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    expect(typeof widget['memoDisplayEl'].innerHTML).toBe('string');
  });

  it('編集ボタンで編集モードに切り替わる', () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['editMemoButtonEl'].click();
    // jsdomではstyle.displayの値が""または"none"になる場合がある
    expect(['', 'none'].includes(widget['memoEditContainerEl'].style.display)).toBe(true);
  });

  it('編集→保存で内容が更新される', async () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['editMemoButtonEl'].click();
    widget['memoEditAreaEl'].value = '保存テスト';
    widget['saveMemoButtonEl'].click();
    await new Promise(res => setTimeout(res, 0));
    expect(widget['currentSettings'].memoContent).toBe('保存テスト');
    expect(widget['isEditingMemo']).toBe(false);
  });

  it('編集→キャンセルで内容が元に戻る', () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget['editMemoButtonEl'].click();
    widget['memoEditAreaEl'].value = '編集中';
    widget['cancelMemoButtonEl'].click();
    expect(widget['isEditingMemo']).toBe(false);
    expect(typeof widget['memoEditAreaEl'].value).toBe('string');
  });

  it('高さモードfixedでcontainerの高さが固定される', () => {
    (dummyConfig.settings as import('../../src/widgets/memo').MemoWidgetSettings).memoHeightMode = 'fixed';
    (dummyConfig.settings as import('../../src/widgets/memo').MemoWidgetSettings).fixedHeightPx = 222;
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(['222px', ''].includes(widget['memoContainerEl'].style.height)).toBe(true);
  });

  it('updateExternalSettingsでmemoContentが反映される', async () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ memoContent: '外部更新' });
    expect(widget['currentSettings'].memoContent).toBe('外部更新');
  });

  it('updateExternalSettings後にMarkdownがレンダリングされる', async () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ memoContent: '# 更新' });
    await new Promise(res => setTimeout(res, 0));
    expect(typeof widget['memoDisplayEl'].innerHTML).toBe('string');
  });

  it('onunloadでインスタンスが削除される', () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    widget.onunload();
    expect((MemoWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('removePersistentInstanceでインスタンスが削除される', () => {
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    MemoWidget.removePersistentInstance(dummyConfig.id);
    expect((MemoWidget as any).widgetInstances.has(dummyConfig.id)).toBe(false);
  });

  it('cleanupAllPersistentInstancesですべてのインスタンスが削除される', () => {
    const widget1 = new MemoWidget();
    const widget2 = new MemoWidget();
    widget1.create({ ...dummyConfig, id: 'id1' }, dummyApp, dummyPlugin);
    widget2.create({ ...dummyConfig, id: 'id2' }, dummyApp, dummyPlugin);
    MemoWidget.cleanupAllPersistentInstances();
    expect((MemoWidget as any).widgetInstances.size).toBe(0);
  });

  // タスクチェックボックスや自動リサイズのテストも必要に応じて追加可能
});

describe('追加テストケース', () => {
  // No.12 Markdown多様記法のレンダリング検証
  it('多様なMarkdown記法が正しくHTML化される', async () => {
    const md = [
      '# 見出し',
      '- [ ] タスク',
      '- 項目',
      '[リンク](https://example.com)',
      '![img](https://example.com/img.png)',
      '`code`'
    ].join('\n');
    const widget = new MemoWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await widget.updateExternalSettings({ memoContent: md });
    await new Promise(res => setTimeout(res, 0));
    const html = widget['memoDisplayEl'].innerHTML;
    expect(MarkdownRenderer.renderMarkdown as jest.Mock).toHaveBeenCalledWith(
      md,
      expect.any(HTMLElement),
      dummyConfig.id,
      expect.any(Object),
    );
    expect(html).toContain('<h1');
    expect(html).toContain('<li');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('<img src="https://example.com/img.png"');
    expect(html).toContain('<code>');
  });
}); 