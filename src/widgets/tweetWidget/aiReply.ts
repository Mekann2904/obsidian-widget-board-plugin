import { geminiPrompt } from 'src/llm/gemini/prompts';
import { GeminiProvider } from '../../llm/gemini/geminiApi';
import { deobfuscate } from '../../utils';
import type { TweetWidgetTweet } from './tweetWidget';

// AIリプライ用のuserId生成関数
export function generateAiUserId(): string {
    return `@ai-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// スレッドのルートから現在までの全履歴を時系列で取得
export function getFullThreadHistory(tweet: TweetWidgetTweet, allTweets: TweetWidgetTweet[]): TweetWidgetTweet[] {
    const tweetsById = new Map(allTweets.map(t => [t.id, t]));
    const history: TweetWidgetTweet[] = [];
    let current: TweetWidgetTweet | undefined = tweet;
    while (current) {
        history.unshift(current);
        if (current.threadId) {
            current = tweetsById.get(current.threadId);
        } else {
            break;
        }
    }
    return history;
}

// スレッドを遡って直近のAI userIdを探す
export function findLatestAiUserIdInThread(tweet: TweetWidgetTweet, allTweets: TweetWidgetTweet[]): string | null {
    const tweetsById = new Map(allTweets.map(t => [t.id, t]));
    let current: TweetWidgetTweet | undefined = tweet;
    while (current) {
        if (current.userId && current.userId.startsWith('@ai-')) return current.userId;
        if (current.threadId) {
            current = tweetsById.get(current.threadId);
        } else {
            break;
        }
    }
    return null;
}

// 自動リプライ判定関数
export function shouldAutoReply(tweet: TweetWidgetTweet): boolean {
    return tweet.text.includes('@ai') || Boolean(tweet.tags && tweet.tags.includes('ai-reply'));
}

// AIリプライ生成関数
export async function generateAiReply({
    tweet,
    allTweets,
    llmGemini,
    saveReply,
    parseTags,
    parseLinks,
    onError,
}: {
    tweet: TweetWidgetTweet,
    allTweets: TweetWidgetTweet[],
    llmGemini: { apiKey: string, model: string },
    saveReply: (reply: TweetWidgetTweet) => Promise<void>,
    parseTags: (text: string) => string[],
    parseLinks: (text: string) => string[],
    onError?: (err: any) => void,
}) {
    try {
        const thread = getFullThreadHistory(tweet, allTweets);
        const threadText = thread.map(t =>
            (t.userId && t.userId.startsWith('@ai-') ? 'AI: ' : 'あなた: ') + t.text
        ).join('\n');
        const promptText = geminiPrompt.replace('{tweet}', threadText);
        let replyText = await GeminiProvider.generateReply(promptText, {
            apiKey: deobfuscate(llmGemini.apiKey || ''),
            tweet: tweet,
            thread: thread,
            model: llmGemini.model || 'gemini-2.0-flash-exp',
            tweetText: threadText,
        });
        try {
            const parsed = JSON.parse(replyText);
            if (parsed && typeof parsed.reply === 'string') {
                replyText = parsed.reply;
            }
        } catch {}
        const aiReply: TweetWidgetTweet = {
            id: 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            text: replyText,
            created: Date.now(),
            updated: Date.now(),
            files: [],
            like: 0,
            liked: false,
            retweet: 0,
            retweeted: false,
            edited: false,
            replyCount: 0,
            deleted: false,
            bookmark: false,
            contextNote: null,
            threadId: tweet.id,
            visibility: 'public',
            noteQuality: 'fleeting',
            taskStatus: null,
            tags: parseTags(replyText),
            links: parseLinks(replyText),
            userId: findLatestAiUserIdInThread(tweet, allTweets) || generateAiUserId(),
            userName: 'AI',
            verified: true
        };
        await saveReply(aiReply);
    } catch (err) {
        if (onError) onError(err);
    }
} 