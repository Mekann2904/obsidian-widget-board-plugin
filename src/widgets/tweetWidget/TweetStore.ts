import type { TweetWidgetSettings, TweetWidgetPost } from './types';

/**
 * データ変更イベントのタイプ
 */
export type TweetStoreEventType = 'post_added' | 'post_updated' | 'post_deleted' | 'settings_changed' | 'backup_trigger';

/**
 * データ変更の詳細情報
 */
export interface TweetStoreEventData {
    eventType: TweetStoreEventType;
    postId?: string;
    post?: TweetWidgetPost;
    threadIds?: string[];
    updates?: Partial<TweetWidgetPost>;
    changeType?: 'create' | 'update' | 'delete' | 'bulk_delete';
    reason?: string;
    needsBackup?: boolean;
}

/**
 * データ変更のリスナー
 */
export type TweetStoreListener = (eventType: TweetStoreEventType, data?: TweetStoreEventData) => void;

/**
 * Tweet widget のデータストア
 * メモリ内でのデータ管理とビジネスロジックを担当
 */
export class TweetStore {
    public settings: TweetWidgetSettings;
    public postsById: Map<string, TweetWidgetPost> = new Map();
    public childrenByThreadId: Map<string, TweetWidgetPost[]> = new Map();
    public quotesById: Map<string, TweetWidgetPost[]> = new Map();

    private listeners: TweetStoreListener[] = [];
    private readonly DEFAULT_SETTINGS: TweetWidgetSettings = {
        posts: [],
        scheduledPosts: [],
        userId: '@you',
        userName: 'You',
        avatarUrl: '',
        verified: false,
        aiGovernance: {
            minuteMap: {},
            dayMap: {}
        }
    };

    constructor(settings: TweetWidgetSettings) {
        this.settings = { ...this.DEFAULT_SETTINGS, ...settings };
        this.rebuildPostsIndex();
    }

    /**
     * データ変更リスナーを追加
     */
    addListener(listener: TweetStoreListener): void {
        this.listeners.push(listener);
    }

    /**
     * データ変更リスナーを削除
     */
    removeListener(listener: TweetStoreListener): void {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    /**
     * データ変更を通知
     */
    private notifyListeners(eventType: TweetStoreEventType, data?: TweetStoreEventData): void {
        this.listeners.forEach(listener => {
            try {
                listener(eventType, data);
            } catch (error) {
                console.error('TweetStore listener error:', error);
            }
        });
    }

    /**
     * 投稿インデックスを再構築
     */
    private rebuildPostsIndex(): void {
        this.postsById = new Map();
        this.settings.posts.forEach(post => {
            this.postsById.set(post.id, post);
        });
        this.updateChildrenMap();
    }

    /**
     * 新しい投稿を追加
     */
    addPost(post: TweetWidgetPost): void {
        console.log('[TweetStore] 投稿追加:', post.id);
        this.settings.posts.push(post);
        this.postsById.set(post.id, post);
        this.updateChildrenMap();
        
        // バックアップトリガー付きで通知
        this.notifyListeners('post_added', {
            eventType: 'post_added',
            postId: post.id,
            post: post,
            changeType: 'create',
            reason: 'ツイート作成',
            needsBackup: true
        });
    }

    /**
     * 投稿を更新
     */
    updatePost(postId: string, updates: Partial<TweetWidgetPost>): boolean {
        const post = this.postsById.get(postId);
        if (!post) return false;

        console.log('[TweetStore] 投稿更新:', postId, 'updates:', Object.keys(updates));
        const updatedPost = { ...post, ...updates };
        
        // 配列内の投稿も更新
        const index = this.settings.posts.findIndex(p => p.id === postId);
        if (index !== -1) {
            this.settings.posts[index] = updatedPost;
        }
        
        this.postsById.set(postId, updatedPost);
        this.updateChildrenMap();
        
        // 重要な変更（テキスト、削除状態等）の場合はバックアップをトリガー
        const significantUpdates = ['text', 'deleted', 'bookmark'];
        const hasSignificantChanges = significantUpdates.some(key => key in updates);
        
        this.notifyListeners('post_updated', {
            eventType: 'post_updated',
            postId: postId,
            post: updatedPost,
            updates: updates,
            changeType: 'update',
            reason: hasSignificantChanges ? 'ツイート重要変更' : 'ツイート軽微変更',
            needsBackup: hasSignificantChanges
        });
        
        return true;
    }

    /**
     * 投稿を削除
     */
    deletePost(postId: string): boolean {
        const post = this.postsById.get(postId);
        if (!post) return false;

        console.log('[TweetStore] 投稿削除:', postId);
        this.settings.posts = this.settings.posts.filter(p => p.id !== postId);
        this.postsById.delete(postId);
        this.updateChildrenMap();
        
        // バックアップトリガー付きで通知
        this.notifyListeners('post_deleted', {
            eventType: 'post_deleted',
            postId: postId,
            post: post,
            changeType: 'delete',
            reason: 'ツイート削除',
            needsBackup: true
        });
        
        return true;
    }

    /**
     * 設定を更新
     */
    updateSettings(updates: Partial<TweetWidgetSettings>): void {
        console.log('[TweetStore] 設定更新:', Object.keys(updates));
        this.settings = { ...this.settings, ...updates };
        
        // 投稿データが更新された場合はインデックスを再構築
        if (updates.posts) {
            this.rebuildPostsIndex();
        }
        
        this.notifyListeners('settings_changed', {
            eventType: 'settings_changed',
            reason: '設定変更',
            needsBackup: false // 設定変更では通常バックアップ不要
        });
    }

    /**
     * 返信を取得
     */
    getReplies(parentId: string): TweetWidgetPost[] {
        return this.childrenByThreadId.get(parentId) || [];
    }

    /**
     * 引用投稿を取得
     */
    getQuotePosts(postId: string): TweetWidgetPost[] {
        return this.quotesById.get(postId) || [];
    }

    /**
     * 投稿数を取得
     */
    getPostCount(): number {
        return this.settings.posts.length;
    }

    /**
     * 有効な投稿数を取得
     */
    getActivePostCount(): number {
        return this.settings.posts.filter(post => !post.deleted).length;
    }

    /**
     * 投稿を検索
     */
    searchPosts(query: string): TweetWidgetPost[] {
        const lowerQuery = query.toLowerCase();
        return this.settings.posts.filter(post =>
            post.text.toLowerCase().includes(lowerQuery) ||
            post.userName?.toLowerCase().includes(lowerQuery) ||
            post.userId?.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * IDで投稿を取得
     */
    getPostById(postId: string): TweetWidgetPost | undefined {
        return this.postsById.get(postId);
    }

    /**
     * スレッド全体を削除
     */
    deleteThread(rootId: string): void {
        const threadIds = this.collectThreadIds(rootId);
        console.log('[TweetStore] スレッド削除:', rootId, 'affected:', threadIds.length);
        
        this.settings.posts = this.settings.posts.filter(p => !threadIds.includes(p.id));
        
        // インデックスを再構築
        this.rebuildPostsIndex();
        
        // バックアップトリガー付きで通知
        this.notifyListeners('post_deleted', {
            eventType: 'post_deleted',
            threadIds: threadIds,
            changeType: 'bulk_delete',
            reason: 'スレッド削除',
            needsBackup: true
        });
    }

    /**
     * スレッドの全IDを収集
     */
    public collectThreadIds(rootId: string): string[] {
        const ids = new Set<string>();
        const queue = [rootId];
        ids.add(rootId);

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const children = this.getReplies(currentId);
            for (const child of children) {
                if (!ids.has(child.id)) {
                    ids.add(child.id);
                    queue.push(child.id);
                }
            }
        }
        return Array.from(ids);
    }

    /**
     * threadIdごとの子投稿マップを再構築する
     */
    private updateChildrenMap(): void {
        const childMap = new Map<string, TweetWidgetPost[]>();
        const quoteMap = new Map<string, TweetWidgetPost[]>();
        for (const post of this.settings.posts) {
            if (post.threadId) {
                if (!childMap.has(post.threadId)) {
                    childMap.set(post.threadId, []);
                }
                childMap.get(post.threadId)!.push(post);
            }
            if (post.quoteId) {
                if (!quoteMap.has(post.quoteId)) {
                    quoteMap.set(post.quoteId, []);
                }
                quoteMap.get(post.quoteId)!.push(post);
            }
        }
        this.childrenByThreadId = childMap;
        this.quotesById = quoteMap;
    }
}