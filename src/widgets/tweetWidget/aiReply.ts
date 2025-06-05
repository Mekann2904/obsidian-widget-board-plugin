import { geminiPrompt } from '../../llm/gemini/tweetReplyPrompt';
import { GeminiProvider } from '../../llm/gemini/geminiApi';
import { deobfuscate } from '../../utils';
import type { TweetWidgetPost, AiGovernanceData } from './types'; // AiGovernanceData をインポート
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

interface ShouldAutoReplyResult {
    allow: boolean;
    updatedGovernanceData: AiGovernanceData;
}

// 自動リプライ判定関数（ガバナンス付き）
export function shouldAutoReply(
    tweet: TweetWidgetPost,
    settings: PluginGlobalSettings,
    currentGovernanceData: AiGovernanceData // 現在のガバナンスデータを引数で受け取る
): ShouldAutoReplyResult {
    // 新しいガバナンスデータオブジェクトを作成（元のオブジェクトを直接変更しないため）
    const updatedGovernanceData: AiGovernanceData = {
        minuteMap: { ...(currentGovernanceData.minuteMap || {}) },
        dayMap: { ...(currentGovernanceData.dayMap || {}) },
    };

    // AI投稿には絶対に自動リプライしない
    if (tweet.userId && tweet.userId.startsWith('@ai-')) {
        return { allow: false, updatedGovernanceData };
    }
    // トリガーワード判定（オプションでスキップ）
    if (!settings.aiReplyTriggerless && !isExplicitAiTrigger(tweet)) {
        return { allow: false, updatedGovernanceData };
    }

    // --- RPM/RPDガバナンス ---
    const userId = tweet.userId || 'unknown_user'; // ユーザーIDがない場合は固定の識別子を使用
    const now = Date.now();
    const minuteAgo = now - 60 * 1000;
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const userDayKey = `${userId}_${today}`;

    // RPM (Replies Per Minute)
    const rpmLimit = typeof settings.aiReplyRpm === 'number' ? settings.aiReplyRpm : 2;
    if (rpmLimit === 0) return { allow: false, updatedGovernanceData }; // 0なら常に拒否

    if (rpmLimit > 0) {
        const userMinuteTimestamps = updatedGovernanceData.minuteMap[userId] || [];
        const recentTimestamps = userMinuteTimestamps.filter(ts => ts > minuteAgo);
        if (recentTimestamps.length >= rpmLimit) {
            return { allow: false, updatedGovernanceData };
        }
        // 許可する場合、タイムスタンプを追加して更新
        recentTimestamps.push(now);
        updatedGovernanceData.minuteMap[userId] = recentTimestamps;
    }

    // RPD (Replies Per Day)
    const rpdLimit = typeof settings.aiReplyRpd === 'number' ? settings.aiReplyRpd : 10;
    if (rpdLimit === 0) return { allow: false, updatedGovernanceData }; // 0なら常に拒否

    if (rpdLimit > 0) {
        const dayCount = updatedGovernanceData.dayMap[userDayKey] || 0;
        if (dayCount >= rpdLimit) {
            return { allow: false, updatedGovernanceData };
        }
        // 許可する場合、カウントを増やして更新
        updatedGovernanceData.dayMap[userDayKey] = dayCount + 1;
    }

    return { allow: true, updatedGovernanceData };
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
        if (delay) {
            const minMs = typeof settings.aiReplyDelayMinMs === 'number' ? settings.aiReplyDelayMinMs : 1500;
            const maxMs = typeof settings.aiReplyDelayMaxMs === 'number' ? settings.aiReplyDelayMaxMs : 7000;
            await randomDelay(minMs, maxMs);
        }

        const thread = getFullThreadHistory(tweet, allTweets);
        const threadText = thread.map(t =>
            (t.userId && t.userId.startsWith('@ai-') ? 'AI: ' : 'あなた: ') + t.text
        ).join('\n');
        // スレッドの最後の投稿の投稿日時を取得
        const lastPost = thread[thread.length - 1];
        const date = new Date(lastPost.created);
        const dateStr = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日 ${date.getHours()}時${date.getMinutes().toString().padStart(2, '0')}分`;
        // 時間帯ラベルを判定
        function getTimeZoneLabel(date: Date): string {
            const hour = date.getHours();
            if (hour >= 0 && hour < 3) return "未明";
            if (hour >= 3 && hour < 6) return "明け方";
            if (hour >= 6 && hour < 9) return "朝";
            if (hour >= 9 && hour < 12) return "昼前";
            if (hour >= 12 && hour < 15) return "昼過ぎ";
            if (hour >= 15 && hour < 18) return "夕方";
            if (hour >= 18 && hour < 21) return "夜のはじめ頃";
            if (hour >= 21 && hour < 24) return "夜遅く";
            return "";
        }
        const timeZoneLabel = getTimeZoneLabel(date);
        const dateWithZone = `${dateStr}（この時間帯は「${timeZoneLabel}」です）`;
        // プロンプトに投稿日時＋時間帯を埋め込む
        const customPrompt = settings.userTweetPrompt && settings.userTweetPrompt.trim() ? settings.userTweetPrompt : geminiPrompt;
        const promptText = customPrompt.replace('{postDate}', dateWithZone).replace('{tweet}', threadText);

        let replyText = await GeminiProvider.generateReply(promptText, {
            apiKey: deobfuscate(llmGemini.apiKey || ''),
            model: llmGemini.model || 'gemini-1.5-flash-latest',
        });
        try {
            const parsed = JSON.parse(replyText);
            if (parsed && typeof parsed.reply === 'string') {
                replyText = parsed.reply;
            }
        } catch {} // JSONパース失敗時はそのままのテキストを使用

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
        console.error("Error in generateAiReply:", err);
        if (onError) onError(err);
    }
}