import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../../src/settings/defaultWidgetSettings';
const { TweetRepository } = require('../../src/widgets/tweetWidget');
const { TFile } = require('obsidian');

jest.mock('obsidian', () => ({ App: class {}, Notice: jest.fn(), TFile: class {} }), { virtual: true });

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
    const file = new TFile();
    const get = jest.fn((path: string) => (path === 'tweets.json' ? file : null));
    const read = jest.fn().mockResolvedValue('{bad json');
    const create = jest.fn();
    const modify = jest.fn();
    const createFolder = jest.fn();
    const app: any = { vault: { getAbstractFileByPath: get, read, create, modify, createFolder } };
    const repo = new TweetRepository(app, 'tweets.json');

    const settings = await repo.load();
    expect(settings).toEqual(DEFAULT_TWEET_WIDGET_SETTINGS);
    expect(create).toHaveBeenCalledWith(expect.stringContaining('tweets.json.bak_'), '{bad json');
  });

  test('sanitizes invalid schema', async () => {
    const file = new TFile();
    const get = jest.fn(() => file);
    const read = jest.fn().mockResolvedValue(JSON.stringify({ posts: 'oops', scheduledPosts: {} }));
    const create = jest.fn();
    const modify = jest.fn();
    const createFolder = jest.fn();
    const app: any = { vault: { getAbstractFileByPath: get, read, create, modify, createFolder } };
    const repo = new TweetRepository(app, 'tweets.json');

    const settings = await repo.load();
    expect(Array.isArray(settings.posts)).toBe(true);
    expect(settings.posts).toHaveLength(0);
    expect(Array.isArray(settings.scheduledPosts)).toBe(true);
  });
});
