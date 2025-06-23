// バックアップシステムを最初にモック
jest.mock('../../src/widgets/tweetWidget/backup/BackupManager', () => {
    return {
        BackupManager: class {
            constructor() {}
            async onDataSave() {}
            async getAvailableBackups() { return { generations: [], incremental: [] }; }
            async createManualBackup() { return { success: true, backupId: 'test' }; }
            async restoreFromBackup() { return { success: true }; }
            updateConfig() {}
        }
    };
});

// 世代バックアップマネージャーをモック
jest.mock('../../src/widgets/tweetWidget/backup/GenerationBackupManager', () => {
    return {
        GenerationBackupManager: class {
            constructor() {}
            async createGenerationBackup() { return { success: true, backupId: 'test' }; }
            async getAvailableGenerations() { return []; }
            async restoreFromGeneration() { return null; }
        }
    };
});

// 差分バックアップマネージャーをモック
jest.mock('../../src/widgets/tweetWidget/backup/IncrementalBackupManager', () => {
    return {
        IncrementalBackupManager: class {
            constructor() {}
            async createIncrementalBackup() { return { success: true, backupId: 'test' }; }
            async getAvailableIncrementalBackups() { return []; }
        }
    };
});

// バージョン管理システムをモック
jest.mock('../../src/widgets/tweetWidget/versionControl/TweetVersionControl', () => {
    return {
        TweetVersionControl: class {
            constructor() {}
            async commit() { return null; }
            async getHistory() { return []; }
            async restore() { return []; }
            async getStats() { return { totalCommits: 0 }; }
        }
    };
});

jest.mock('obsidian', () => {
    const original = jest.requireActual('obsidian');
    return {
        ...original,
        Notice: jest.fn(),
    };
}, { virtual: true });

import { TweetRepository } from '../../src/widgets/tweetWidget/TweetRepository';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../../src/settings/defaultWidgetSettings';
import type { TweetWidgetSettings } from '../../src/widgets/tweetWidget/types';

describe('TweetRepository.save', () => {
    let repo: TweetRepository;
    let exists: jest.Mock;
    let write: jest.Mock;
    let mkdir: jest.Mock;
    let app: any;

    const sampleSettings: TweetWidgetSettings = { posts: [] };
    const expectedFullSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...sampleSettings };

    beforeEach(() => {
        exists = jest.fn();
        write = jest.fn();
        mkdir = jest.fn().mockResolvedValue(undefined);

        app = {
            vault: {
                adapter: {
                    exists,
                    write,
                    mkdir,
                },
            },
        };

        repo = new TweetRepository(app, 'folder/tweets.json');
    });

    test('creates folder and writes file when folder does not exist', async () => {
        exists.mockResolvedValueOnce(false); // folder doesn't exist
        
        await repo.save(sampleSettings, 'en');

        expect(mkdir).toHaveBeenCalledWith('folder');
        expect(write).toHaveBeenCalledWith('folder/tweets.json', JSON.stringify(expectedFullSettings, null, 2));
    });

    test('writes file when folder already exists', async () => {
        exists.mockResolvedValueOnce(true); // folder exists
        
        await repo.save(sampleSettings, 'en');

        expect(mkdir).not.toHaveBeenCalled();
        expect(write).toHaveBeenCalledWith('folder/tweets.json', JSON.stringify(expectedFullSettings, null, 2));
    });

    test('does not create folder when path is at root', async () => {
        repo = new TweetRepository(app, 'tweets.json');
        
        await repo.save(sampleSettings, 'en');
        
        expect(mkdir).not.toHaveBeenCalled();
        expect(write).toHaveBeenCalledWith('tweets.json', JSON.stringify(expectedFullSettings, null, 2));
    });

    test('creates nested folders correctly', async () => {
        repo = new TweetRepository(app, 'deep/nested/folder/tweets.json');
        exists.mockResolvedValue(false); // all folders don't exist
        
        await repo.save(sampleSettings, 'en');

        expect(mkdir).toHaveBeenCalledTimes(3);
        expect(mkdir).toHaveBeenNthCalledWith(1, 'deep');
        expect(mkdir).toHaveBeenNthCalledWith(2, 'deep/nested');
        expect(mkdir).toHaveBeenNthCalledWith(3, 'deep/nested/folder');
        expect(write).toHaveBeenCalledWith('deep/nested/folder/tweets.json', JSON.stringify(expectedFullSettings, null, 2));
    });

    test('handles save errors gracefully', async () => {
        const writeError = new Error('Write failed');
        write.mockRejectedValueOnce(writeError);
        
        await repo.save(sampleSettings, 'en');
        
        expect(write).toHaveBeenCalled();
        // Should not throw, error should be handled internally
    });
});
