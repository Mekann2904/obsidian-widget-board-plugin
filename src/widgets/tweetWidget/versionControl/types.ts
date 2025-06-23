import type { TweetWidgetPost, TweetWidgetSettings } from '../types';

/**
 * 差分の種類
 */
export type DiffType = 'add' | 'remove' | 'modify';

/**
 * 単一投稿の差分情報
 */
export interface TweetDiff {
    type: DiffType;
    postId: string;
    oldPost?: TweetWidgetPost;
    newPost?: TweetWidgetPost;
    timestamp: number;
}

/**
 * コミット情報
 */
export interface TweetCommit {
    id: string; // SHA-256ハッシュ
    message: string;
    timestamp: number;
    parent?: string; // 親コミットのID
    diffs: TweetDiff[];
    author: string;
    settingsSnapshot?: Partial<TweetWidgetSettings>; // 設定のスナップショット
}

/**
 * 履歴エントリ（UI表示用）
 */
export interface HistoryEntry {
    commit: TweetCommit;
    summary: string; // "3件追加, 1件削除, 2件変更"
    displayMessage: string;
}

/**
 * 復元オプション
 */
export interface RestoreOptions {
    commitId: string;
    preserveNewerPosts?: boolean; // より新しい投稿を保持するか
    createBackup?: boolean; // 復元前にバックアップを作成するか
}

/**
 * バージョン管理設定
 */
export interface VersionControlConfig {
    maxCommits: number; // 最大保持コミット数
    autoCommit: boolean; // 自動コミットの有効/無効
    commitMessage: {
        auto: boolean; // 自動メッセージ生成
        template: string; // メッセージテンプレート
    };
    compression: boolean; // 差分圧縮
    retentionDays: number; // 履歴保持日数
}

/**
 * バージョン管理のメタデータ
 */
export interface VersionControlMeta {
    version: string;
    created: number;
    lastCommit?: string | null;
    totalCommits: number;
    config: VersionControlConfig;
} 