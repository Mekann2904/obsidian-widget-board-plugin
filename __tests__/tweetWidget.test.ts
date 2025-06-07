import { TweetWidget } from '../src/widgets/tweetWidget/tweetWidget';
import type { WidgetConfig } from '../src/interfaces';

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
  const dummyPlugin = { settings: { defaultTweetPeriod: 'all', defaultTweetCustomDays: 1 }, manifest: { id: 'test-plugin' } } as any;

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
}); 