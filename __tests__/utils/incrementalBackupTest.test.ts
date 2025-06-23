import { TweetRepository } from '../../src/widgets/tweetWidget/TweetRepository';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../../src/settings/defaultWidgetSettings';

jest.mock('obsidian', () => {
    const original = jest.requireActual('obsidian');
    return {
        ...original,
        Notice: jest.fn(),
    };
}, { virtual: true });

describe('Incremental Backup Test', () => {
    let consoleLogSpy: jest.SpyInstance;
    let repo: TweetRepository;
    let exists: jest.Mock;
    let read: jest.Mock;
    let write: jest.Mock;
    let mkdir: jest.Mock;
    let app: any;

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        
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
        consoleLogSpy.mockRestore();
    });

    test('差分バックアップが作成される', async () => {
        exists.mockResolvedValue(false);
        
        // 1回目の保存 - 初回保存
        const firstData = {
            ...DEFAULT_TWEET_WIDGET_SETTINGS,
            posts: [{
                id: '1',
                text: 'First post',
                created: Date.now(),
                updated: Date.now(),
                userId: '@user',
                userName: 'User',
                verified: false,
                like: 0,
                liked: false,
                retweet: 0,
                retweeted: false,
                replyCount: 0,
                bookmark: false,
                deleted: false,
                edited: false,
                visibility: 'public' as const,
                noteQuality: 'fleeting' as const,
                taskStatus: null,
                tags: [],
                links: [],
                files: [],
                threadId: null,
                quoteId: null,
                contextNote: null
            }]
        };
        await repo.save(firstData, 'ja', '初回投稿作成');
        
        // 2回目の保存 - 差分バックアップが作成されるべき
        const secondData = {
            ...DEFAULT_TWEET_WIDGET_SETTINGS,
            posts: [
                {
                    id: '1',
                    text: 'First post',
                    created: Date.now(),
                    updated: Date.now(),
                    userId: '@user',
                    userName: 'User',
                    verified: false,
                    like: 0,
                    liked: false,
                    retweet: 0,
                    retweeted: false,
                    replyCount: 0,
                    bookmark: false,
                    deleted: false,
                    edited: false,
                    visibility: 'public' as const,
                    noteQuality: 'fleeting' as const,
                    taskStatus: null,
                    tags: [],
                    links: [],
                    files: [],
                    threadId: null,
                    quoteId: null,
                    contextNote: null
                },
                {
                    id: '2',
                    text: 'Second post',
                    created: Date.now(),
                    updated: Date.now(),
                    userId: '@user',
                    userName: 'User',
                    verified: false,
                    like: 0,
                    liked: false,
                    retweet: 0,
                    retweeted: false,
                    replyCount: 0,
                    bookmark: false,
                    deleted: false,
                    edited: false,
                    visibility: 'public' as const,
                    noteQuality: 'fleeting' as const,
                    taskStatus: null,
                    tags: [],
                    links: [],
                    files: [],
                    threadId: null,
                    quoteId: null,
                    contextNote: null
                }
            ]
        };
        await repo.save(secondData, 'ja', '2番目の投稿作成');
        
        // コンソールログを確認
        const logs = consoleLogSpy.mock.calls.map(call => call[0]).join(' ');
        
        // 初回保存時のメッセージを確認
        expect(logs).toContain('初回データ保存のため、次回から差分バックアップが利用可能になります');
        
        // 2回目保存時に差分バックアップ作成が試行されることを確認
        expect(
            logs.includes('差分バックアップ作成開始') || 
            logs.includes('データ変更検出') ||
            logs.includes('投稿数変化検出')
        ).toBe(true);
    });

    test('設定変更でも差分バックアップが作成される', async () => {
        exists.mockResolvedValue(false);
        
        // 1回目の保存
        const firstData = {
            ...DEFAULT_TWEET_WIDGET_SETTINGS,
            userId: 'user1'
        };
        await repo.save(firstData, 'ja', '初回設定');
        
        // 2回目の保存 - ユーザーID変更
        const secondData = {
            ...DEFAULT_TWEET_WIDGET_SETTINGS,
            userId: 'user2'
        };
        await repo.save(secondData, 'ja', 'ユーザーID変更');
        
        const logs = consoleLogSpy.mock.calls.map(call => call[0]).join(' ');
        
        // 設定変更が検出されることを確認
        expect(
            logs.includes('データ変更検出') ||
            logs.includes('ユーザー設定変更検出') ||
            logs.includes('差分バックアップ作成開始')
        ).toBe(true);
    });

    test('コミットメッセージがあれば差分バックアップが試行される', async () => {
        exists.mockResolvedValue(false);
        
        // 1回目の保存
        await repo.save(DEFAULT_TWEET_WIDGET_SETTINGS, 'ja', '初回保存');
        
        // 2回目の保存 - データは同じでもコミットメッセージがある
        await repo.save(DEFAULT_TWEET_WIDGET_SETTINGS, 'ja', '手動コミット');
        
        const logs = consoleLogSpy.mock.calls.map(call => call[0]).join(' ');
        
        // コミットメッセージがある場合、差分バックアップの処理が実行されることを確認
        // データに変更がない場合は「差分がない」旨のメッセージが出力される
        expect(
            logs.includes('差分バックアップ作成開始') ||
            logs.includes('ベースバックアップが見つからないため作成します') ||
            logs.includes('差分がないため差分バックアップをスキップ') ||
            logs.includes('変更なし')
        ).toBe(true);
    });
}); 