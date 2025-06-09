import type { TweetWidgetSettings } from './types';

/**
 * TweetWidgetのデフォルト設定
 */
export const DEFAULT_TWEET_WIDGET_SETTINGS: TweetWidgetSettings = {
    posts: [],
    scheduledPosts: [],
    avatarUrl: '',
    userName: 'あなた',
    userId: '@you',
    verified: false,
    aiGovernance: {
        minuteMap: {},
        dayMap: {},
    },
};

/**
 * 投稿の最大文字数
 */
export const MAX_TWEET_LENGTH = 300;