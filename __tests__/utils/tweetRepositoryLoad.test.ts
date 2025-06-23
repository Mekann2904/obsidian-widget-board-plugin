import { TweetRepository } from '../../src/widgets/tweetWidget/TweetRepository';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../../src/settings/defaultWidgetSettings';

jest.mock('obsidian', () => {
    const original = jest.requireActual('obsidian');
    return {
        ...original,
        Notice: jest.fn(),
    };
}, { virtual: true });

describe('TweetRepository.load', () => {
    let consoleErrorSpy: jest.SpyInstance;
    let repo: TweetRepository;
    let exists: jest.Mock;
    let read: jest.Mock;
    let write: jest.Mock;
    let mkdir: jest.Mock;
    let app: any;

    beforeEach(() => {
        // hide console.error spam
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        exists = jest.fn();
        read = jest.fn();
        write = jest.fn();
        mkdir = jest.fn();
        
        app = {
            vault: {
                adapter: {
                    exists,
                    read,
                    write,
                    mkdir,
                }
            }
        };
        
        repo = new TweetRepository(app, 'tweets.json');
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    test('returns defaults when file does not exist', async () => {
        exists.mockResolvedValue(false);
        
        const settings = await repo.load('en');
        
        expect(settings).toEqual(DEFAULT_TWEET_WIDGET_SETTINGS);
        expect(write).toHaveBeenCalledWith('tweets.json', JSON.stringify(DEFAULT_TWEET_WIDGET_SETTINGS, null, 2));
    });

    test('reads and parses valid JSON file', async () => {
        const mockPost = { id: '1', text: 'test' };
        const mockData = { posts: [mockPost], scheduledPosts: [] };
        exists.mockResolvedValue(true);
        read.mockResolvedValue(JSON.stringify(mockData));
        
        const settings = await repo.load('en');
        
        // validatePost関数によってpostオブジェクトにデフォルト値が追加される
        const expectedPost = {
            id: '1',
            text: 'test',
            created: expect.any(Number),
            updated: expect.any(Number),
            userId: '@you',
            userName: 'あなた',
            verified: false,
            like: 0,
            liked: false,
            retweet: 0,
            retweeted: false,
            replyCount: 0,
            bookmark: false,
            deleted: false,
            edited: false,
            visibility: 'public',
            tags: [],
            links: [],
            files: [],
            noteQuality: 'fleeting',
            taskStatus: null,
            threadId: null,
            quoteId: null,
            contextNote: null
        };
        
        expect(settings).toEqual({
            ...DEFAULT_TWEET_WIDGET_SETTINGS,
            posts: [expectedPost],
            scheduledPosts: []
        });
    });

    test('returns defaults when file is empty', async () => {
        exists.mockResolvedValue(true);
        read.mockResolvedValue('');
        
        const settings = await repo.load('en');
        
        expect(settings).toEqual(DEFAULT_TWEET_WIDGET_SETTINGS);
    });

    test('returns defaults when file contains only whitespace', async () => {
        exists.mockResolvedValue(true);
        read.mockResolvedValue('   \n  \t  ');
        
        const settings = await repo.load('en');
        
        expect(settings).toEqual(DEFAULT_TWEET_WIDGET_SETTINGS);
    });

    test('returns defaults and backs up when JSON parse fails', async () => {
        exists.mockResolvedValue(true);
        read.mockResolvedValue('{bad json');
        // Mock backup file doesn't exist
        exists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        
        const settings = await repo.load('en');
        
        expect(settings).toEqual(DEFAULT_TWEET_WIDGET_SETTINGS);
        expect(write).toHaveBeenCalledWith(
            expect.stringContaining('tweets.json.bak_'),
            '{bad json'
        );
    });

    test('sanitizes invalid schema', async () => {
        exists.mockResolvedValue(true);
        read.mockResolvedValue(JSON.stringify({ posts: 'oops', scheduledPosts: {} }));
        
        const settings = await repo.load('en');
        
        expect(Array.isArray(settings.posts)).toBe(true);
        expect(settings.posts).toHaveLength(0);
        expect(Array.isArray(settings.scheduledPosts)).toBe(true);
    });

    test('handles read errors gracefully', async () => {
        exists.mockResolvedValue(true);
        read.mockRejectedValue(new Error('Read failed'));
        
        const settings = await repo.load('en');
        
        expect(settings).toEqual(DEFAULT_TWEET_WIDGET_SETTINGS);
    });

    test('creates backup with unique name when backup file exists', async () => {
        exists.mockResolvedValue(true);
        read.mockResolvedValue('{bad json');
        // First backup file exists, second doesn't
        exists.mockResolvedValueOnce(true)
              .mockResolvedValueOnce(true) // first backup exists
              .mockResolvedValueOnce(false); // second backup doesn't exist
        
        await repo.load('en');
        
        expect(write).toHaveBeenCalledWith(
            expect.stringMatching(/tweets\.json\.bak_\d+_1$/),
            '{bad json'
        );
    });
});
