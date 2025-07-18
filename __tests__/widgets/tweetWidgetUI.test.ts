import { TweetWidgetUI } from '../../src/widgets/tweetWidget/tweetWidgetUI';

describe('TweetWidgetUI', () => {
  let container: HTMLElement;
  let widget: any;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    widget = {
      app: {},
      postsById: new Map(),
      currentTab: 'home',
      currentFilter: 'all',
      currentSettings: { posts: [] },
      maxLength: 140,
      getAvatarUrl: () => '',
      getAvatarUrlForPostInput: () => '',
      switchTab: jest.fn(),
      setFilter: jest.fn(),
      setPeriod: jest.fn(),
      setCustomPeriodDays: jest.fn(),
      submitReply: jest.fn(),
      navigateToDetail: jest.fn(),
      getFilteredPosts: () => [],
      plugin: {
        settings: {
          language: 'ja',
        },
      },
    };
    // requestAnimationFrameはテスト用にタイマーで即座に実行
    (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(cb, 0) as unknown as number;
    };
  });

  it('scheduleRenderは一度だけrenderを呼ぶ', () => {
    jest.useFakeTimers();
    const ui = new TweetWidgetUI(widget, container);
    const spy = jest.spyOn(ui as any, 'render').mockImplementation(() => {});
    ui.scheduleRender();
    ui.scheduleRender();
    jest.runAllTimers();
    expect(spy).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('resetScrollでcontainerとパネルのscrollTopが0になる', () => {
    const panel = document.createElement('div');
    panel.className = 'widget-board-panel-custom';
    panel.style.overflow = 'auto';
    panel.appendChild(container);
    panel.scrollTop = 50;
    container.scrollTop = 50;

    const ui = new TweetWidgetUI(widget, container);
    ui.resetScroll();
    expect(container.scrollTop).toBe(0);
    expect(panel.scrollTop).toBe(0);
  });

  it('詳細表示中のresetScrollでパネルのscrollTopはリセットされない', () => {
    const panel = document.createElement('div');
    panel.className = 'widget-board-panel-custom';
    panel.style.overflow = 'auto';
    panel.appendChild(container);
    panel.scrollTop = 50;
    container.scrollTop = 50;

    // 詳細表示状態に設定
    widget.detailPostId = 'test-post-id';

    const ui = new TweetWidgetUI(widget, container);
    ui.resetScroll();
    expect(container.scrollTop).toBe(0); // ウィジェット内部のスクロールはリセット
    expect(panel.scrollTop).toBe(50); // パネルのスクロールはリセットされない
  });

  it('skipPanelResetフラグでパネルのscrollTopはリセットされない', () => {
    const panel = document.createElement('div');
    panel.className = 'widget-board-panel-custom';
    panel.style.overflow = 'auto';
    panel.appendChild(container);
    panel.scrollTop = 50;
    container.scrollTop = 50;

    const ui = new TweetWidgetUI(widget, container);
    ui.resetScroll(true); // skipPanelReset = true
    expect(container.scrollTop).toBe(0); // ウィジェット内部のスクロールはリセット
    expect(panel.scrollTop).toBe(50); // パネルのスクロールはリセットされない
  });

  it('showAvatarModalでモーダルが表示されEscで閉じる', () => {
    const ui = new TweetWidgetUI(widget, container);
    (ui as any).showAvatarModal(new MouseEvent('click'), 'url');
    const backdrop = Array.from(document.body.children).find(el =>
      (el as HTMLElement).classList.contains('tweet-avatar-modal-backdrop')
    );
    expect(backdrop).toBeTruthy();
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(event);
    const exists = Array.from(document.body.children).some(el =>
      (el as HTMLElement).classList.contains('tweet-avatar-modal-backdrop')
    );
    expect(exists).toBe(false);
  });

  it('updateCharCountで文字数表示とクラス切替', () => {
    const ui = new TweetWidgetUI(widget, container);
    const countEl = document.createElement('div');
    (ui as any).updateCharCount(countEl, 10);
    expect(countEl.textContent).toBe('10 / 140');
    (ui as any).updateCharCount(countEl, 200);
    expect(countEl.classList.contains('tweet-char-over')).toBe(true);
  });

  it('YouTubeタイトル取得失敗でエラーメッセージが表示される', async () => {
    const utils = require('../../src/widgets/tweetWidget/tweetWidgetUtils');
    jest.spyOn(utils, 'fetchYouTubeTitle').mockResolvedValue(null);

    const ui = new TweetWidgetUI(widget, container);
    ui.render();
    const textarea = container.querySelector('.tweet-textarea-main') as HTMLTextAreaElement;
    const suggest = container.querySelector('.tweet-youtube-suggest') as HTMLElement;
    textarea.value = 'https://youtu.be/abcdefghijk';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    expect(suggest.textContent).toBe('動画タイトル取得失敗');
  });
});
