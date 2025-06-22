import { TweetRepository } from '../../src/widgets/tweetWidget/TweetRepository';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../../src/settings/defaultWidgetSettings';
import type { TweetWidgetSettings } from '../../src/widgets/tweetWidget/types';
import { TFile } from 'obsidian';

jest.mock('obsidian', () => {
    const original = jest.requireActual('obsidian');
    return {
        ...original,
        TFile: jest.fn().mockImplementation(() => ({
            path: 'folder/tweets.json',
        })),
        Notice: jest.fn(),
        normalizePath: (p: string) => p,
    };
}, { virtual: true });


describe('TweetRepository.save', () => {
    let repo: TweetRepository;
    let get: jest.Mock;
    let create: jest.Mock;
    let modify: jest.Mock;
    let mkdir: jest.Mock;
    let app: any;

    const sampleSettings: TweetWidgetSettings = { posts: [] };
    const expectedFullSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...sampleSettings };

    beforeEach(() => {
        get = jest.fn();
        create = jest.fn();
        modify = jest.fn();
        mkdir = jest.fn().mockResolvedValue(undefined);

        app = {
            vault: {
                getAbstractFileByPath: get,
                create,
                modify,
                adapter: {
                    mkdir,
                },
            },
        };

        repo = new TweetRepository(app, 'folder/tweets.json');
    });

    test('creates folder and new file when neither exist', async () => {
        get.mockReturnValue(null);
        await repo.save(sampleSettings);

        expect(mkdir).toHaveBeenCalledWith('folder');
        expect(create).toHaveBeenCalledWith('folder/tweets.json', JSON.stringify(expectedFullSettings, null, 2));
        expect(modify).not.toHaveBeenCalled();
    });

    test('updates existing file when folder already exists', async () => {
        get.mockReturnValue(new TFile());
        
        await repo.save(sampleSettings);

        expect(mkdir).toHaveBeenCalledWith('folder');
        expect(modify).toHaveBeenCalledWith(expect.any(TFile), JSON.stringify(expectedFullSettings, null, 2));
        expect(create).not.toHaveBeenCalled();
    });

    test('does not create folder when path is at root', async () => {
        repo = new TweetRepository(app, 'tweets.json');
        await repo.save(sampleSettings);
        expect(mkdir).not.toHaveBeenCalled();
        expect(create).toHaveBeenCalledWith('tweets.json', JSON.stringify(expectedFullSettings, null, 2));
    });
});
