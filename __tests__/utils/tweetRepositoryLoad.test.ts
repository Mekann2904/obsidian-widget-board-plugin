import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../../src/settings/defaultWidgetSettings';
const { TweetRepository } = require('../../src/widgets/tweetWidget');

jest.mock('obsidian', () => ({ App: class {}, Notice: jest.fn() }), { virtual: true });

describe('TweetRepository.load', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // hide console.error spam
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('returns defaults and backs up when JSON parse fails', async () => {
    const exists = jest.fn().mockResolvedValue(true);
    const read = jest.fn().mockResolvedValue('{bad json');
    const write = jest.fn();
    const app: any = { vault: { adapter: { exists, read, write } } };
    const repo = new TweetRepository(app, 'tweets.json');

    const settings = await repo.load();
    expect(settings).toEqual(DEFAULT_TWEET_WIDGET_SETTINGS);
    expect(write).toHaveBeenCalledWith(expect.stringContaining('tweets.json.bak_'), '{bad json');
  });

  test('sanitizes invalid schema', async () => {
    const exists = jest.fn().mockResolvedValue(true);
    const read = jest.fn().mockResolvedValue(JSON.stringify({ posts: 'oops', scheduledPosts: {} }));
    const write = jest.fn();
    const app: any = { vault: { adapter: { exists, read, write } } };
    const repo = new TweetRepository(app, 'tweets.json');

    const settings = await repo.load();
    expect(Array.isArray(settings.posts)).toBe(true);
    expect(settings.posts).toHaveLength(0);
    expect(Array.isArray(settings.scheduledPosts)).toBe(true);
  });
});
