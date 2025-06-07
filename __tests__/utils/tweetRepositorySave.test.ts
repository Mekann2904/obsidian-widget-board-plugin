// Mock the obsidian API used in TweetRepository
jest.mock('obsidian', () => {
  return {
    App: class {},
    Notice: jest.fn(),
  };
}, { virtual: true });

import type { TweetWidgetSettings } from '../../src/widgets/tweetWidget/types';
const { TweetRepository } = require('../../src/widgets/tweetWidget/TweetRepository.ts');

describe('TweetRepository.save', () => {
  const sampleSettings: TweetWidgetSettings = { posts: [] };

  test('does not create folder when path has no folder', async () => {
    const exists = jest.fn();
    const mkdir = jest.fn();
    const write = jest.fn();
    const app: any = { vault: { adapter: { exists, mkdir, write } } };
    const repo = new TweetRepository(app, 'tweets.json');
    await repo.save(sampleSettings);
    expect(exists).not.toHaveBeenCalled();
    expect(mkdir).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith('tweets.json', JSON.stringify(sampleSettings, null, 2));
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
    expect(write).toHaveBeenCalledWith('folder/tweets.json', JSON.stringify(sampleSettings, null, 2));
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
    expect(write).toHaveBeenCalledWith('nested/folder/tweets.json', JSON.stringify(sampleSettings, null, 2));
  });
});
