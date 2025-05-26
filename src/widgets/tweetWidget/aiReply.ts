import { geminiPrompt } from 'src/llm/gemini/prompts';
import { GeminiProvider } from '../../llm/gemini/geminiApi';
import { deobfuscate } from '../../utils';
import type { TweetWidgetPost } from './tweetWidget';
import type { PluginGlobalSettings } from '../../interfaces';

// AIリプライ用のuserId生成関数
export function generateAiUserId(): string {
    return `@ai-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// スレッドのルートから現在までの全履歴を時系列で取得
export function getFullThreadHistory(tweet: TweetWidgetPost, allTweets: TweetWidgetPost[]): TweetWidgetPost[] {
    const tweetsById = new Map(allTweets.map(t => [t.id, t]));
    const history: TweetWidgetPost[] = [];
    let current: TweetWidgetPost | undefined = tweet;
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
export function findLatestAiUserIdInThread(tweet: TweetWidgetPost, allTweets: TweetWidgetPost[]): string | null {
    const tweetsById = new Map(allTweets.map(t => [t.id, t]));
    let current: TweetWidgetPost | undefined = tweet;
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

// --- AIリプライ発火ガバナンス用 ---
const aiReplyMinuteMap = new Map<string, number[]>(); // userId→[タイムスタンプ配列]
const aiReplyDayMap = new Map<string, number>(); // userId_YYYYMMDD→count

// 自動リプライ判定関数（ガバナンス付き）
export function shouldAutoReply(
    tweet: TweetWidgetPost,
    settings: PluginGlobalSettings
): boolean {
    // AI投稿には絶対に自動リプライしない
    if (tweet.userId && tweet.userId.startsWith('@ai-')) return false;
    // トリガーワード判定（オプションでスキップ）
    if (!settings.aiReplyTriggerless) {
        const hasTrigger = tweet.text.includes('@ai') || Boolean(tweet.tags && tweet.tags.includes('ai-reply'));
        if (!hasTrigger) return false;
    }
    // --- RPM/RPDガバナンス ---
    const userId = tweet.userId || 'unknown';
    const now = Date.now();
    const minuteAgo = now - 60 * 1000;
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const userDayKey = `${userId}_${today}`;
    // RPM
    const rpm = typeof settings.aiReplyRpm === 'number' ? settings.aiReplyRpm : 2;
    if (rpm === 0) return false;
    if (rpm > 0) {
        const arr = aiReplyMinuteMap.get(userId) || [];
        const recent = arr.filter(ts => ts > minuteAgo);
        if (recent.length >= rpm) return false;
        recent.push(now);
        aiReplyMinuteMap.set(userId, recent);
    }
    // RPD
    const rpd = typeof settings.aiReplyRpd === 'number' ? settings.aiReplyRpd : 10;
    if (rpd === 0) return false;
    if (rpd > 0) {
        const dayCount = aiReplyDayMap.get(userDayKey) || 0;
        if (dayCount >= rpd) return false;
        aiReplyDayMap.set(userDayKey, dayCount + 1);
    }
    return true;
}

// ランダムディレイ関数
function randomDelay(minMs: number, maxMs: number): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 明示的トリガー判定関数
export function isExplicitAiTrigger(tweet: TweetWidgetPost): boolean {
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
    settings,
    delay,
}: {
    tweet: TweetWidgetPost,
    allTweets: TweetWidgetPost[],
    llmGemini: { apiKey: string, model: string },
    saveReply: (reply: TweetWidgetPost) => Promise<void>,
    parseTags: (text: string) => string[],
    parseLinks: (text: string) => string[],
    onError?: (err: any) => void,
    settings: PluginGlobalSettings,
    delay: boolean,
}) {
    try {
        // --- 人間らしい遅延 ---
        if (delay) {
            const minMs = typeof settings.aiReplyDelayMinMs === 'number' ? settings.aiReplyDelayMinMs : 1500;
            const maxMs = typeof settings.aiReplyDelayMaxMs === 'number' ? settings.aiReplyDelayMaxMs : 7000;
            await randomDelay(minMs, maxMs);
        }
        // ...既存AIリプ生成処理...
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
        const aiReply: TweetWidgetPost = {
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