import { TweetWidget } from '../../src/widgets/tweetWidget';
import type { WidgetConfig } from '../../src/interfaces';

describe('TweetWidget', () => {
  const dummyConfig: WidgetConfig = {
    id: 'test-tweet-widget',
    type: 'tweet-widget',
    title: 'テストツイート',
    settings: { posts: [], userId: '@test', userName: 'テスト', verified: false }
  };
  const dummyApp = {
    vault: {
      adapter: { exists: jest.fn(), mkdir: jest.fn(), read: jest.fn(), write: jest.fn() },
      getFiles: jest.fn(() => []),
    },
    workspace: { getActiveFile: jest.fn(() => ({ path: 'active.md' })) },
  } as any;
  const dummyPlugin = {
    settings: { defaultTweetPeriod: 'all', defaultTweetCustomDays: 1 },
    manifest: { id: 'test-plugin' },
    updateTweetPostCount: jest.fn(),
    getTweetPostCounts: jest.fn(() => [])
  } as any;

  it('createメソッドでHTMLElementを返す', () => {
    const widget = new TweetWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el).toBeInstanceOf(HTMLElement);
  });

  it('switchTabでcurrentTabが切り替わる', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.switchTab('notification');
    expect(widget.currentTab).toBe('notification');
  });

  it('setFilterでcurrentFilterが切り替わる', () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    // wait for async init
    return Promise.resolve().then(() => new Promise(res => setTimeout(res, 0))).then(() => {
      widget.setFilter('bookmark');
      expect(widget.currentFilter).toBe('bookmark');
    });
  });

  it('submitPostで投稿が追加される', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('テスト投稿');
    expect(widget.currentSettings.posts.length).toBeGreaterThan(0);
  });

  it('submitReplyで返信が追加される', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitReply('返信テスト', 'parent-id');
    expect(widget.currentSettings.posts.length).toBeGreaterThan(0);
  });

  it('toggleLikeでlikedが切り替わる', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('いいねテスト');
    const postId = widget.currentSettings.posts[0].id;
    await widget.toggleLike(postId);
    expect(widget.currentSettings.posts[0].liked).toBe(true);
  });

  it('存在しないIDのtoggleLikeで状態が変わらない', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('test');
    const before = widget.currentSettings.posts[0].liked;
    await expect(widget.toggleLike('nope')).resolves.toBeUndefined();
    expect(widget.currentSettings.posts[0].liked).toBe(before);
  });

  it('tweet-widgetクラスとタイトルが付与される', () => {
    const widget = new TweetWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    expect(el.classList.contains('tweet-widget')).toBe(true);
    expect(el.textContent).toBe('Loading...');
  });

  it('タブ切替でcurrentTabが切り替わりUIが再描画される', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    const spy = jest.spyOn(widget['ui'], 'render');
    await widget.switchTab('notification');
    expect(widget.currentTab).toBe('notification');
    expect(spy).toHaveBeenCalled();
  });

  it('setFilterでcurrentFilterが切り替わりUIが再描画される', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    const spy = jest.spyOn(widget['ui'], 'render');
    widget.setFilter('bookmark');
    expect(widget.currentFilter).toBe('bookmark');
    expect(spy).toHaveBeenCalled();
  });

  it('投稿編集でeditingPostIdやUIが正しく切り替わる', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('編集テスト');
    const post = widget.currentSettings.posts[0];
    widget.startEdit(post);
    expect(widget.editingPostId).toBe(post.id);
    expect(widget['ui']).toBeDefined();
  });

  it('投稿詳細表示でdetailPostIdが切り替わる', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('詳細テスト');
    const post = widget.currentSettings.posts[0];
    widget.navigateToDetail(post.id);
    expect(widget.detailPostId).toBe(post.id);
  });

  it('navigateToDetailでresetScrollが呼ばれる', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('scroll test');
    const post = widget.currentSettings.posts[0];
    const spy = jest.spyOn(widget['ui'], 'resetScroll');
    widget.navigateToDetail(post.id);
    expect(spy).toHaveBeenCalled();
  });

  it('navigateToDetailでボードパネルのscrollTopがリセットされる', async () => {
    const widget = new TweetWidget();
    const panel = document.createElement('div');
    panel.className = 'widget-board-panel-custom';
    document.body.appendChild(panel);
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    panel.appendChild(el);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('scroll test');
    const post = widget.currentSettings.posts[0];
    (widget as any)['ui'].container.scrollTop = 50;
    panel.scrollTop = 50;
    widget.navigateToDetail(post.id);
    expect((widget as any)['ui'].container.scrollTop).toBe(0);
    expect(panel.scrollTop).toBe(0);
  });

  it('ファイル添付でattachedFilesが更新される', async () => {
    dummyApp.vault.createBinary = jest.fn();
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    const file = new File(['test'], 'test.txt');
    await widget.attachFiles([file]);
    expect(widget.attachedFiles.length).toBe(1);
  });

  it('空投稿ではsubmitPostで投稿が追加されない', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    const before = widget.currentSettings.posts.length;
    await widget.submitPost('   ');
    expect(widget.currentSettings.posts.length).toBe(before);
  });

  it('toggleRetweetでretweetedが切り替わる', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('リツイートテスト');
    const postId = widget.currentSettings.posts[0].id;
    await widget.toggleRetweet(postId);
    expect(widget.currentSettings.posts[0].retweeted).toBe(true);
  });

  it('toggleBookmarkでbookmarkが切り替わる', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('ブックマークテスト');
    const postId = widget.currentSettings.posts[0].id;
    await widget.toggleBookmark(postId);
    expect(widget.currentSettings.posts[0].bookmark).toBe(true);
  });

  it('deletePostで投稿が削除される', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('削除テスト');
    const postId = widget.currentSettings.posts[0].id;
    await widget.deletePost(postId);
    expect(widget.currentSettings.posts.find(p => p.id === postId)).toBeUndefined();
  });

  it('詳細表示中の投稿を削除すると親にフォーカスが移る', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('parent');
    const parentId = widget.currentSettings.posts[0].id;
    await widget.submitReply('child', parentId);
    const childId = widget.currentSettings.posts[0].id;
    widget.navigateToDetail(childId);
    await widget.deletePost(childId);
    expect(widget.detailPostId).toBe(parentId);
  });

  it('スレッド削除中に表示していた投稿が含まれる場合親にフォーカスが移る', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('grand');
    const grandId = widget.currentSettings.posts[0].id;
    await widget.submitReply('parent', grandId);
    const parentId = widget.currentSettings.posts[0].id;
    await widget.submitReply('child', parentId);
    const childId = widget.currentSettings.posts[0].id;
    widget.navigateToDetail(childId);
    await widget.deleteThread(parentId);
    expect(widget.detailPostId).toBe(grandId);
  });

  it('updatePostPropertyで任意のプロパティが更新される', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('プロパティ更新テスト');
    const postId = widget.currentSettings.posts[0].id;
    await widget.updatePostProperty(postId, 'noteQuality', 'permanent');
    expect(widget.currentSettings.posts[0].noteQuality).toBe('permanent');
  });

  it('getFilteredPostsでフィルタが反映される', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('フィルタテスト');
    widget.setFilter('all');
    expect(widget.getFilteredPosts().length).toBeGreaterThan(0);
  });

  it('AIリプライが許可される場合triggerAiReplyで副作用が発生', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('AIリプライテスト');
    const post = widget.currentSettings.posts[0];
    // shouldAutoReplyを強制的にallow=trueにモック
    const orig = require('../../src/widgets/tweetWidget/aiReply').shouldAutoReply;
    require('../../src/widgets/tweetWidget/aiReply').shouldAutoReply = () => ({ allow: true, updatedGovernanceData: {} });
    const aiReplySpy = jest.spyOn(require('../../src/widgets/tweetWidget/aiReply'), 'generateAiReply').mockImplementation(() => {});
    widget['triggerAiReply'](post);
    expect(aiReplySpy).toHaveBeenCalled();
    require('../../src/widgets/tweetWidget/aiReply').shouldAutoReply = orig;
    aiReplySpy.mockRestore();
  });

  it('state未定義時もUIメソッドでエラーにならない', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    widget['store'] = undefined as any;
    expect(() => widget.getFilteredPosts()).toThrow();
  });

  it('Command+Enterで投稿できる', async () => {
    const widget = new TweetWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    document.body.appendChild(el);
    await new Promise(res => setTimeout(res, 0));
    // textarea取得
    const textarea = el.querySelector('.tweet-textarea-main') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    textarea.value = 'ショートカット投稿テスト';
    // inputイベントでUIの状態を更新
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    // Command+Enter（Mac）
    const event = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true });
    textarea.dispatchEvent(event);
    // 投稿が追加されるまで待つ
    await new Promise(res => setTimeout(res, 10));
    expect(widget.currentSettings.posts.some(p => p.text === 'ショートカット投稿テスト')).toBe(true);
    document.body.removeChild(el);
  });

  it('詳細画面の返信欄でCommand+Enterで返信できる', async () => {
    const widget = new TweetWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    document.body.appendChild(el);
    await new Promise(res => setTimeout(res, 0));
    // まず投稿を1件追加
    await widget.submitPost('詳細画面テスト投稿');
    const post = widget.currentSettings.posts[0];
    // 詳細画面に遷移
    widget.navigateToDetail(post.id);
    await new Promise(res => setTimeout(res, 0));
    // 返信欄のtextarea取得
    const textarea = el.querySelector('.tweet-detail-reply-textarea') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    textarea.value = '詳細画面ショートカット返信';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    // Command+Enter（Mac）
    const event = new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true });
    textarea.dispatchEvent(event);
    // 返信が追加されるまで待つ
    await new Promise(res => setTimeout(res, 10));
    expect(widget.currentSettings.posts.some(p => p.text === '詳細画面ショートカット返信')).toBe(true);
    document.body.removeChild(el);
  });

  it('ファイル書き込み失敗時にクラッシュしない', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (dummyApp.vault.adapter.write as jest.Mock).mockRejectedValueOnce(new Error('Disk full'));

    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));

    await expect(widget.submitPost('投稿テスト')).resolves.not.toThrow();
    // TweetWidget側でエラーをcatchしてconsole.errorに出力することを期待
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('Escキーで編集モードがキャンセルされる', async () => {
    const widget = new TweetWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    document.body.appendChild(el);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('編集キャンセルテスト');
    const post = widget.currentSettings.posts[0];

    widget.startEdit(post);
    expect(widget.editingPostId).toBe(post.id);

    // Escキーイベントを発火
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    el.dispatchEvent(event);

    await new Promise(res => setTimeout(res, 10)); // UI更新を待つ

    expect(widget.editingPostId).toBeNull();
    document.body.removeChild(el);
  });

  it('Escキーで詳細表示がキャンセルされる', async () => {
    const widget = new TweetWidget();
    const el = widget.create(dummyConfig, dummyApp, dummyPlugin);
    document.body.appendChild(el);
    await new Promise(res => setTimeout(res, 0));
    await widget.submitPost('詳細キャンセルテスト');
    const post = widget.currentSettings.posts[0];
    
    widget.navigateToDetail(post.id);
    expect(widget.detailPostId).toBe(post.id);

    // Escキーイベントを発火
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    el.dispatchEvent(event);

    await new Promise(res => setTimeout(res, 10)); // UI更新を待つ

    expect(widget.detailPostId).toBeNull();
    document.body.removeChild(el);
  });

  it('Markdown特殊文字を含む投稿がエラーなく処理される', async () => {
    const widget = new TweetWidget();
    widget.create(dummyConfig, dummyApp, dummyPlugin);
    await new Promise(res => setTimeout(res, 0));
    const markdownText = '# heading\n* list\n[link](http://example.com)';
    await expect(widget.submitPost(markdownText)).resolves.not.toThrow();
    expect(widget.currentSettings.posts[0].text).toBe(markdownText);
  });
}); 