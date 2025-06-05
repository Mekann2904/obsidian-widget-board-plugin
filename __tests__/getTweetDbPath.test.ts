jest.mock('obsidian', () => ({ Notice: jest.fn(), App: class {}, TFile: class {} }), { virtual: true });

const { TweetWidget } = require('../src/widgets/tweetWidget/tweetWidget.ts');

describe('TweetWidget.getTweetDbPath', () => {
  const createWidget = (baseFolder = '') => {
    const widget = new TweetWidget();
    widget.plugin = { settings: { baseFolder } } as any;
    return widget as any;
  };

  test('returns default path when no base folder', () => {
    const widget = createWidget();
    expect(widget.getTweetDbPath()).toBe('tweets.json');
  });

  test('handles trailing slash', () => {
    const widget = createWidget('data/tweets/');
    expect(widget.getTweetDbPath()).toBe('data/tweets/tweets.json');
  });

  test('uses base folder when set', () => {
    const widget = createWidget('myfolder');
    expect(widget.getTweetDbPath()).toBe('myfolder/tweets.json');
  });
});
