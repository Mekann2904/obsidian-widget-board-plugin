/**
 * 添付ファイルのデータ構造
 */
export interface TweetWidgetFile {
    name: string;
    type: string;
    dataUrl: string;
}

/**
 * 投稿一つ一つのデータ構造
 */
export interface TweetWidgetPost {
    text: string;
    created: number;
    id: string;

    // オプションフィールド
    files?: TweetWidgetFile[];
    like?: number;
    liked?: boolean;
    retweet?: number;
    retweeted?: boolean;
    edited?: boolean;
    replyCount?: number;

    // PKM（個人知識管理）フィールド
    tags?: string[];
    links?: string[];
    contextNote?: string | null;
    threadId?: string | null;
    visibility?: "public" | "private" | "draft";
    updated?: number;
    deleted?: boolean;
    bookmark?: boolean;
    noteQuality?: "fleeting" | "literature" | "permanent";
    taskStatus?: "todo" | "doing" | "done" | null;
    
    // ユーザー情報
    userId?: string;
    userName?: string;
    verified?: boolean;
}

export interface AiGovernanceData {
    /** ユーザーIDごとの直近1分間のリプライタイムスタンプの配列 */
    minuteMap: Record<string, number[]>; // 例: { "userId1": [1678886400000, 1678886410000], ... }
    /** ユーザーIDと日付ごとのリプライ回数 */
    dayMap: Record<string, number>;    // 例: { "userId1_20230315": 5, ... }
}

/**
 * ウィジェット全体の設定と全投稿を保持するデータ構造
 */
export interface TweetWidgetSettings {
    posts: TweetWidgetPost[];
    avatarUrl?: string;
    userName?: string;
    userId?: string;
    verified?: boolean;
    /** AIリプライのガバナンス情報 */
    aiGovernance?: AiGovernanceData;
}