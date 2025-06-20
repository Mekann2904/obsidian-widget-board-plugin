// Mock the obsidian API used in TweetRepository
jest.mock('obsidian', () => {
  return {
    App: class {},
    Notice: jest.fn(),
  };
}, { virtual: true });

import type { TweetWidgetSettings } from '../../src/widgets/tweetWidget/types';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../../src/widgets/tweetWidget/constants';
const { TweetRepository } = require('../../src/widgets/tweetWidget');

describe('TweetRepository.save', () => {
  const sampleSettings: TweetWidgetSettings = { posts: [] };
  const expectedFullSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...sampleSettings };

  test('does not create folder when path has no folder', async () => {
    const exists = jest.fn();
    const mkdir = jest.fn();
    const write = jest.fn();
    const app: any = { vault: { adapter: { exists, mkdir, write } } };
    const repo = new TweetRepository(app, 'tweets.json');
    await repo.save(sampleSettings);
    expect(exists).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith('tweets.json', JSON.stringify(expectedFullSettings, null, 2));
  });

  test('creates folder when missing', async () => {
    const exists = jest.fn().mockResolvedValue(false);
    const mkdir = jest.fn();
    const write = jest.fn();
    const app: any = { vault: { adapter: { exists, mkdir, write } } };
    const repo = new TweetRepository(app, 'folder/tweets.json');
    await repo.save(sampleSettings);
    expect(exists).toHaveBeenCalledWith('folder');
    expect(mkdir).toHaveBeenCalledWith('folder');
    expect(write).toHaveBeenCalledWith('folder/tweets.json', JSON.stringify(expectedFullSettings, null, 2));
  });

  test('creates nested folders when missing', async () => {
    const exists = jest
      .fn()
      .mockResolvedValueOnce(false) // 'nested'
      .mockResolvedValueOnce(false); // 'nested/folder'
    const mkdir = jest.fn();
    const write = jest.fn();
    const app: any = { vault: { adapter: { exists, mkdir, write } } };
    const repo = new TweetRepository(app, 'nested/folder/tweets.json');
    await repo.save(sampleSettings);
    expect(exists).toHaveBeenCalledWith('nested');
    expect(exists).toHaveBeenCalledWith('nested/folder');
    expect(mkdir).toHaveBeenCalledWith('nested');
    expect(mkdir).toHaveBeenCalledWith('nested/folder');
    expect(write).toHaveBeenCalledWith('nested/folder/tweets.json', JSON.stringify(expectedFullSettings, null, 2));
  });

  test('should sanitize settings before saving', async () => {
    const write = jest.fn();
    const app: any = { vault: { adapter: { write } } };
    const repo = new TweetRepository(app, 'tweets.json');
    const invalidSettings: any = { posts: { 'not': 'an array' } };
    await repo.save(invalidSettings);

    const expectedSanitizedSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, posts: [], scheduledPosts: [] };

    expect(write).toHaveBeenCalledWith('tweets.json', JSON.stringify(expectedSanitizedSettings, null, 2));
  });
});
