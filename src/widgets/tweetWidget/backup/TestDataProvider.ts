import type { TweetWidgetSettings, TweetWidgetPost } from '../types';

/**
 * テストデータ提供クラス（開発・デバッグ用）
 */
export class TestDataProvider {
    private static readonly TEST_BACKUP_IDS = [
        'daily_20241101',
        'weekly_20241028', 
        'inc_20241101_001',
        'inc_20241101_002'
    ];

    /**
     * 指定されたIDがテストデータかどうかを判定
     */
    static isTestData(backupId: string): boolean {
        return this.TEST_BACKUP_IDS.includes(backupId);
    }

    /**
     * テストデータから復元
     */
    static async restoreFromTestData(backupId: string): Promise<{
        success: boolean;
        data?: TweetWidgetSettings;
        error?: string;
    }> {
        try {
            if (!this.isTestData(backupId)) {
                return { success: false, error: 'テストデータではありません' };
            }

            const testData = this.generateTestData();
            console.log(`[TestDataProvider] テストデータ復元: ${backupId}`);
            
            return { success: true, data: testData };
        } catch (error) {
            console.error(`[TestDataProvider] テストデータ復元エラー:`, error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    }

    /**
     * テストデータ生成
     */
    private static generateTestData(): TweetWidgetSettings {
        const testPosts: TweetWidgetPost[] = [
            {
                id: 'test-1',
                text: 'テスト投稿1',
                created: Date.now() - 86400000, // 1日前
                userId: 'testuser',
                userName: 'testuser',
                avatarUrl: ''
            },
            {
                id: 'test-2', 
                text: 'テスト投稿2',
                created: Date.now() - 43200000, // 12時間前
                userId: 'testuser',
                userName: 'testuser',
                avatarUrl: ''
            }
        ];

        return {
            posts: testPosts,
            scheduledPosts: [],
            userId: 'test-user',
            userName: 'テストユーザー',
            avatarUrl: '',
            verified: false,
            aiGovernance: { minuteMap: {}, dayMap: {} },
            width: '400px',
            height: '300px'
        };
    }
} 