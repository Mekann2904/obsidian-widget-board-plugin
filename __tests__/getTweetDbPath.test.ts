jest.mock('obsidian', () => ({ Notice: jest.fn(), App: class {}, TFile: class {} }), { virtual: true });

const { TweetWidget } = require('../src/widgets/tweetWidget/tweetWidget.ts');

describe('TweetWidget.getTweetDbPath', () => {
  const createWidget = (location: 'vault' | 'custom', customPath: string, baseFolder = '') => {
    const widget = new TweetWidget();
    widget.plugin = { settings: { tweetDbLocation: location, tweetDbCustomPath: customPath, baseFolder } } as any;
    return widget as any;
  };

  test('returns default path when location is vault', () => {
    const widget = createWidget('vault', '');
    expect(widget.getTweetDbPath()).toBe('tweets.json');
  });

  test('appends tweets.json to folder path', () => {
    const widget = createWidget('custom', 'data/tweets');
    expect(widget.getTweetDbPath()).toBe('data/tweets/tweets.json');
  });

  test('handles trailing slash', () => {
    const widget = createWidget('custom', 'data/tweets/');
    expect(widget.getTweetDbPath()).toBe('data/tweets/tweets.json');
  });

  test('replaces filename with tweets.json', () => {
    const widget = createWidget('custom', 'data/other.json');
    expect(widget.getTweetDbPath()).toBe('data/tweets.json');
  });

  test('uses base folder when set', () => {
    const widget = createWidget('vault', '', 'myfolder');
    expect(widget.getTweetDbPath()).toBe('myfolder/tweets.json');
  });
});
