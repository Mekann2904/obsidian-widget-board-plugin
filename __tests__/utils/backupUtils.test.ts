import { BackupUtils } from '../../src/widgets/tweetWidget/backup/BackupUtils';
import type { TweetWidgetSettings } from '../../src/widgets/tweetWidget/types';
import type { BackupFileInfo } from '../../src/widgets/tweetWidget/backup/types';

// Mock Obsidian App
const mockApp = {
    vault: {
        adapter: {
            exists: jest.fn(),
            read: jest.fn(),
            stat: jest.fn(),
            mkdir: jest.fn()
        }
    }
};

describe('BackupUtils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('resolveBackupPath', () => {
        it('正常なパスが存在する場合は最初のパスを返す', async () => {
            (mockApp.vault.adapter.exists as jest.Mock).mockResolvedValue(true);

            const result = await BackupUtils.resolveBackupPath(
                mockApp as any, 
                'test/path.json'
            );

            expect(result).toEqual({
                path: 'test/path.json',
                exists: true
            });
        });

        it('複数のパターンを試行して有効なパスを見つける', async () => {
            (mockApp.vault.adapter.exists as jest.Mock)
                .mockResolvedValueOnce(false) // 最初のパス
                .mockResolvedValueOnce(true);  // 2番目のパス

            const result = await BackupUtils.resolveBackupPath(
                mockApp as any, 
                'test/path.json'
            );

            expect(result.exists).toBe(true);
            expect(result.path).toContain('test/path.json');
        });

        it('すべてのパターンが失敗した場合はexists:falseを返す', async () => {
            (mockApp.vault.adapter.exists as jest.Mock).mockResolvedValue(false);

            const result = await BackupUtils.resolveBackupPath(
                mockApp as any, 
                'nonexistent/path.json'
            );

            expect(result).toEqual({
                path: 'nonexistent/path.json',
                exists: false
            });
        });
    });

    describe('safeParseBackupJson', () => {
        it('正常なJSONファイルを解析する', async () => {
            const testData = { test: 'data', posts: [] };
            (mockApp.vault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockApp.vault.adapter.read as jest.Mock).mockResolvedValue(JSON.stringify(testData));

            const result = await BackupUtils.safeParseBackupJson(
                mockApp as any, 
                'test.json'
            );

            expect(result.success).toBe(true);
            expect(result.data).toEqual(testData);
            expect(result.error).toBeUndefined();
        });

        it('ファイルが存在しない場合はエラーを返す', async () => {
            (mockApp.vault.adapter.exists as jest.Mock).mockResolvedValue(false);

            const result = await BackupUtils.safeParseBackupJson(
                mockApp as any, 
                'nonexistent.json'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('ファイルが見つかりません');
        });

        it('無効なJSONの場合はエラーを返す', async () => {
            (mockApp.vault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockApp.vault.adapter.read as jest.Mock).mockResolvedValue('invalid json {');

            const result = await BackupUtils.safeParseBackupJson(
                mockApp as any, 
                'invalid.json'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('JSON解析エラー');
        });

        it('空ファイルの場合はエラーを返す', async () => {
            (mockApp.vault.adapter.exists as jest.Mock).mockResolvedValue(true);
            (mockApp.vault.adapter.read as jest.Mock).mockResolvedValue('');

            const result = await BackupUtils.safeParseBackupJson(
                mockApp as any, 
                'empty.json'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('ファイルが空です');
        });
    });

    describe('validateAndNormalizeTweetSettings', () => {
        it('正常なデータを検証・正規化する', () => {
            const inputData = {
                posts: [{ id: '1', text: 'test' }],
                scheduledPosts: [],
                userId: '@testuser',
                userName: 'Test User',
                verified: true
            };

            const result = BackupUtils.validateAndNormalizeTweetSettings(inputData);

            expect(result.posts).toEqual(inputData.posts);
            expect(result.scheduledPosts).toEqual([]);
            expect(result.userId).toBe('@testuser');
            expect(result.userName).toBe('Test User');
            expect(result.verified).toBe(true);
            expect(result.aiGovernance).toEqual({ minuteMap: {}, dayMap: {} });
        });

        it('不正なデータを正規化する', () => {
            const inputData = {
                posts: null as any,
                scheduledPosts: 'invalid' as any,
                userId: null as any,
                verified: 'false' as any
            };

            const result = BackupUtils.validateAndNormalizeTweetSettings(inputData);

            expect(result.posts).toEqual([]);
            expect(result.scheduledPosts).toEqual([]);
            expect(result.userId).toBe('@user');
            expect(result.userName).toBe('ユーザー');
            expect(result.verified).toBe(true); // 'false' 文字列は truthy値
            expect(result.aiGovernance).toEqual({ minuteMap: {}, dayMap: {} });
        });

        it('完全に空のデータでもデフォルト値で正規化する', () => {
            const result = BackupUtils.validateAndNormalizeTweetSettings({} as any);

            expect(result.posts).toEqual([]);
            expect(result.scheduledPosts).toEqual([]);
            expect(result.userId).toBe('@user');
            expect(result.userName).toBe('ユーザー');
            expect(result.avatarUrl).toBe('');
            expect(result.verified).toBe(false);
            expect(result.aiGovernance).toEqual({ minuteMap: {}, dayMap: {} });
        });
    });

    describe('validateBackupFileInfo', () => {
        it('正常なBackupFileInfoを検証する', () => {
            const backup: BackupFileInfo = {
                id: 'test-backup-1',
                type: 'daily',
                filePath: 'test/path.json',
                timestamp: Date.now(),
                size: 1024,
                checksum: 'test-checksum',
                compressed: false
            };

            const result = BackupUtils.validateBackupFileInfo(backup);
            expect(result).toBe(true);
        });

        it('不正なBackupFileInfoを拒否する', () => {
            const invalidBackups: any[] = [
                null,
                undefined,
                {},
                { id: 'test' }, // 不完全
                { id: 123, type: 'daily', filePath: 'test', timestamp: Date.now(), size: 1024 }, // 型不正
            ];

            invalidBackups.forEach(backup => {
                const result = BackupUtils.validateBackupFileInfo(backup);
                expect(result).toBeFalsy(); // false, null, undefined のいずれでも良い
            });
        });
    });

    describe('calculateChecksum', () => {
        it('同一データに対して同じチェックサムを生成する', () => {
            const data = 'test data for checksum';
            const checksum1 = BackupUtils.calculateChecksum(data);
            const checksum2 = BackupUtils.calculateChecksum(data);

            expect(checksum1).toBe(checksum2);
            expect(typeof checksum1).toBe('string');
            expect(checksum1.length).toBeGreaterThan(0);
        });

        it('異なるデータに対して異なるチェックサムを生成する', () => {
            const data1 = 'test data 1';
            const data2 = 'test data 2';
            const checksum1 = BackupUtils.calculateChecksum(data1);
            const checksum2 = BackupUtils.calculateChecksum(data2);

            expect(checksum1).not.toBe(checksum2);
        });
    });

    describe('createDefaultTweetSettings', () => {
        it('デフォルトのTweetWidgetSettingsを生成する', () => {
            const settings = BackupUtils.createDefaultTweetSettings();

            expect(settings.posts).toEqual([]);
            expect(settings.scheduledPosts).toEqual([]);
            expect(settings.userId).toBe('@user');
            expect(settings.userName).toBe('ユーザー');
            expect(settings.avatarUrl).toBe('');
            expect(settings.verified).toBe(false);
            expect(settings.aiGovernance).toEqual({ minuteMap: {}, dayMap: {} });
        });
    });

    describe('generatePeriodIdentifier', () => {
        it('日次識別子を生成する', () => {
            const identifier = BackupUtils.generatePeriodIdentifier('daily');
            expect(identifier).toMatch(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
        });

        it('週次識別子を生成する', () => {
            const identifier = BackupUtils.generatePeriodIdentifier('weekly');
            expect(identifier).toMatch(/^\d{4}-W\d+$/); // YYYY-W[week]
        });

        it('月次識別子を生成する', () => {
            const identifier = BackupUtils.generatePeriodIdentifier('monthly');
            expect(identifier).toMatch(/^\d{4}-\d{2}$/); // YYYY-MM
        });
    });

    describe('formatTimestamp', () => {
        it('タイムスタンプを日本語形式でフォーマットする', () => {
            const timestamp = new Date('2023-06-15T14:30:00Z').getTime();
            const formatted = BackupUtils.formatTimestamp(timestamp);

            expect(formatted).toContain('2023');
            expect(formatted).toContain('06');
            expect(formatted).toContain('15');
        });
    });

    describe('determineBackupType', () => {
        it('世代バックアップを判定する', () => {
            const backup: BackupFileInfo = {
                id: 'test',
                type: 'daily',
                filePath: 'test',
                timestamp: Date.now(),
                size: 100,
                checksum: 'test',
                compressed: false,
                generation: { period: '2023-06-15' }
            };

            const type = BackupUtils.determineBackupType(backup);
            expect(type).toBe('generation');
        });

        it('差分バックアップを判定する', () => {
            const backup: BackupFileInfo = {
                id: 'test',
                type: 'incremental',
                filePath: 'test',
                timestamp: Date.now(),
                size: 100,
                checksum: 'test',
                compressed: false,
                incremental: { 
                    baseBackupId: 'base-id', 
                    changedPostsCount: 5,
                    diffSize: 100
                }
            };

            const type = BackupUtils.determineBackupType(backup);
            expect(type).toBe('incremental');
        });

        it('不明なバックアップを判定する', () => {
            const backup: BackupFileInfo = {
                id: 'test',
                type: 'daily' as any,
                filePath: 'test',
                timestamp: Date.now(),
                size: 100,
                checksum: 'test',
                compressed: false
            };

            const type = BackupUtils.determineBackupType(backup);
            expect(type).toBe('unknown');
        });
    });

    describe('withRetry', () => {
        it('成功する操作をそのまま実行する', async () => {
            const operation = jest.fn().mockResolvedValue('success');

            const result = await BackupUtils.withRetry(operation, 3);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('失敗する操作を指定回数リトライする', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('fail 1'))
                .mockRejectedValueOnce(new Error('fail 2'))
                .mockResolvedValue('success');

            const result = await BackupUtils.withRetry(operation, 3);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(3);
        });

        it('最大リトライ回数に達したら最後のエラーを投げる', async () => {
            const error = new Error('persistent failure');
            const operation = jest.fn().mockRejectedValue(error);

            await expect(BackupUtils.withRetry(operation, 2)).rejects.toThrow('persistent failure');
            expect(operation).toHaveBeenCalledTimes(2);
        });
    });

    describe('ensureDirectory', () => {
        it('存在しないディレクトリを作成する', async () => {
            (mockApp.vault.adapter.exists as jest.Mock).mockResolvedValue(false);
            (mockApp.vault.adapter.mkdir as jest.Mock).mockResolvedValue(undefined);

            await BackupUtils.ensureDirectory(mockApp as any, 'test/dir');

            expect(mockApp.vault.adapter.exists).toHaveBeenCalledWith('test/dir');
            expect(mockApp.vault.adapter.mkdir).toHaveBeenCalledWith('test/dir');
        });

        it('既存のディレクトリには何もしない', async () => {
            (mockApp.vault.adapter.exists as jest.Mock).mockResolvedValue(true);

            await BackupUtils.ensureDirectory(mockApp as any, 'existing/dir');

            expect(mockApp.vault.adapter.exists).toHaveBeenCalledWith('existing/dir');
            expect(mockApp.vault.adapter.mkdir).not.toHaveBeenCalled();
        });
    });

    describe('getFileSize', () => {
        it('正常なファイルサイズを取得する', async () => {
            (mockApp.vault.adapter.stat as jest.Mock).mockResolvedValue({ size: 1024 });

            const size = await BackupUtils.getFileSize(mockApp as any, 'test.json');

            expect(size).toBe(1024);
        });

        it('エラー時は-1を返す', async () => {
            (mockApp.vault.adapter.stat as jest.Mock).mockRejectedValue(new Error('File not found'));

            const size = await BackupUtils.getFileSize(mockApp as any, 'nonexistent.json');

            expect(size).toBe(-1);
        });
    });
}); 