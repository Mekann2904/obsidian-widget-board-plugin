import type { TweetWidgetSettings } from './types';

/**
 * Default settings for the TweetWidget.
 */
export const DEFAULT_TWEET_WIDGET_SETTINGS: TweetWidgetSettings = {
    posts: [],
    scheduledPosts: [],
    avatarUrl: '',
    userName: 'You', // This will be localized in the component that uses it.
    userId: '@you',
    verified: false,
    aiGovernance: {
        minuteMap: {},
        dayMap: {},
    },
};

/**
 * Maximum character count for a post.
 */
export const MAX_TWEET_LENGTH = 300;