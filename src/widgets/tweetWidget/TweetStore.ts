import type { TweetWidgetSettings, TweetWidgetPost } from './types';

export class TweetStore {
    public settings: TweetWidgetSettings;
    public postsById: Map<string, TweetWidgetPost> = new Map();

    constructor(initialSettings: TweetWidgetSettings) {
        this.settings = initialSettings;
        this.updatePostsById();
    }

    /**
     * ストア全体の設定を新しいものに置き換える
     * @param newSettings 新しい設定オブジェクト
     */
    public setAllSettings(newSettings: TweetWidgetSettings): void {
        this.settings = newSettings;
        this.updatePostsById();
    }

    /**
     * 新しい投稿を追加する
     * @param post 追加する投稿オブジェクト
     */
    public addPost(post: TweetWidgetPost): void {
        this.settings.posts.unshift(post);
        if (post.threadId) {
            const parent = this.postsById.get(post.threadId);
            if (parent) {
                parent.replyCount = (parent.replyCount || 0) + 1;
                parent.updated = Date.now();
            }
        }
        if (post.quoteId) {
            const target = this.postsById.get(post.quoteId);
            if (target) {
                target.retweet = (target.retweet || 0) + 1;
                target.updated = Date.now();
            }
        }
        this.updatePostsById();
    }

    /**
     * 既存の投稿を更新する
     * @param postId 更新する投稿のID
     * @param updates 更新内容（部分的なオブジェクト）
     */
    public updatePost(postId: string, updates: Partial<Omit<TweetWidgetPost, 'id'>>): void {
        const post = this.postsById.get(postId);
        if (post) {
            Object.assign(post, updates);
            post.updated = Date.now(); // 更新日時を自動設定
            this.updatePostsById(); // Mapの参照を更新
        }
    }

    /**
     * 投稿をIDで削除する
     * @param postId 削除する投稿のID
     */
    public deletePost(postId: string): void {
        const post = this.postsById.get(postId);
        if (post?.threadId) {
            const parent = this.postsById.get(post.threadId);
            if (parent) {
                parent.replyCount = Math.max(0, (parent.replyCount || 0) - 1);
            }
        }
        if (post?.quoteId) {
            const target = this.postsById.get(post.quoteId);
            if (target) {
                target.retweet = Math.max(0, (target.retweet || 0) - 1);
            }
        }
        this.settings.posts = this.settings.posts.filter(p => p.id !== postId);
        this.updatePostsById();
    }

    /**
     * スレッド全体を削除する
     * @param rootId スレッドの起点となる投稿のID
     */
    public deleteThread(rootId: string): void {
        const threadIds = this.collectThreadIdsRecursive(rootId);
        const rootPost = this.postsById.get(rootId);

        if (rootPost?.threadId) {
            const parent = this.postsById.get(rootPost.threadId);
            if (parent) {
                parent.replyCount = Math.max(0, (parent.replyCount || 0) - 1);
            }
        }

        for (const id of threadIds) {
            const p = this.postsById.get(id);
            if (p?.quoteId) {
                const target = this.postsById.get(p.quoteId);
                if (target) {
                    target.retweet = Math.max(0, (target.retweet || 0) - 1);
                }
            }
        }

        this.settings.posts = this.settings.posts.filter(p => !threadIds.includes(p.id));
        this.updatePostsById();
    }

    /**
     * IDで投稿を取得する
     * @param postId 取得したい投稿のID
     * @returns 投稿オブジェクト、見つからなければundefined
     */
    public getPostById(postId: string): TweetWidgetPost | undefined {
        return this.postsById.get(postId);
    }
    
    /**
     * Map<id, post> を再構築する
     */
    private updatePostsById(): void {
        this.postsById = new Map(this.settings.posts.map(p => [p.id, p]));
    }

    /**
     * スレッドの全IDを収集するヘルパー関数
     */
    private collectThreadIdsRecursive(rootId: string): string[] {
        const ids = new Set<string>();
        const queue = [rootId];
        ids.add(rootId);

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const children = this.settings.posts.filter(p => p.threadId === currentId);
            for (const child of children) {
                if (!ids.has(child.id)) {
                    ids.add(child.id);
                    queue.push(child.id);
                }
            }
        }
        return Array.from(ids);
    }
}