// Mock the obsidian API used in TweetRepository
jest.mock('obsidian', () => {
  return {
    App: class {},
    Notice: jest.fn(),
    TFile: class {},
  };
}, { virtual: true });

import type { TweetWidgetSettings } from '../../src/widgets/tweetWidget/types';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../../src/settings/defaultWidgetSettings';
const { TweetRepository } = require('../../src/widgets/tweetWidget');
const { TFile } = require('obsidian');

describe('TweetRepository.save', () => {
  const sampleSettings: TweetWidgetSettings = { posts: [] };
  const expectedFullSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...sampleSettings };

  test('does not create folder when path has no folder', async () => {
    const get = jest.fn().mockReturnValue(null);
    const createFolder = jest.fn();
    const create = jest.fn();
    const modify = jest.fn();
    const app: any = { vault: { getAbstractFileByPath: get, createFolder, create, modify } };
    const repo = new TweetRepository(app, 'tweets.json');
    await repo.save(sampleSettings);
    expect(createFolder).not.toHaveBeenCalled();
    expect(modify).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith('tweets.json', JSON.stringify(expectedFullSettings, null, 2));
  });

  test('creates folder when missing', async () => {
    const get = jest.fn().mockReturnValue(null);
    const createFolder = jest.fn();
    const create = jest.fn();
    const modify = jest.fn();
    const app: any = { vault: { getAbstractFileByPath: get, createFolder, create, modify } };
    const repo = new TweetRepository(app, 'folder/tweets.json');
    await repo.save(sampleSettings);
    expect(createFolder).toHaveBeenCalledWith('folder');
    expect(create).toHaveBeenCalledWith('folder/tweets.json', JSON.stringify(expectedFullSettings, null, 2));
  });

  test('creates nested folders when missing', async () => {
    const get = jest.fn().mockReturnValue(null);
    const createFolder = jest.fn();
    const create = jest.fn();
    const modify = jest.fn();
    const app: any = { vault: { getAbstractFileByPath: get, createFolder, create, modify } };
    const repo = new TweetRepository(app, 'nested/folder/tweets.json');
    await repo.save(sampleSettings);
    expect(createFolder).toHaveBeenCalledWith('nested');
    expect(createFolder).toHaveBeenCalledWith('nested/folder');
    expect(create).toHaveBeenCalledWith('nested/folder/tweets.json', JSON.stringify(expectedFullSettings, null, 2));
  });

  test('should sanitize settings before saving', async () => {
    const get = jest.fn().mockReturnValue(new TFile());
    const create = jest.fn();
    const modify = jest.fn();
    const createFolder = jest.fn();
    const app: any = { vault: { getAbstractFileByPath: get, create, modify, createFolder } };
    const repo = new TweetRepository(app, 'tweets.json');
    const invalidSettings: any = { posts: { 'not': 'an array' } };
    await repo.save(invalidSettings);

    const expectedSanitizedSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, posts: [], scheduledPosts: [] };

    expect(modify).toHaveBeenCalledWith(expect.anything(), JSON.stringify(expectedSanitizedSettings, null, 2));
  });
});
