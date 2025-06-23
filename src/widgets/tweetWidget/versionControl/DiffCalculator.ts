import type { TweetWidgetPost } from '../types';
import type { TweetDiff, DiffType } from './types';

/**
 * ツイート投稿の差分計算クラス
 */
export class DiffCalculator {
    /**
     * 2つの投稿配列の差分を計算
     */
    static calculateDiffs(oldPosts: TweetWidgetPost[], newPosts: TweetWidgetPost[]): TweetDiff[] {
        const diffs: TweetDiff[] = [];
        const timestamp = Date.now();

        // 既存投稿をIDでマップ化
        const oldPostsMap = new Map<string, TweetWidgetPost>();
        oldPosts.forEach(post => oldPostsMap.set(post.id, post));

        const newPostsMap = new Map<string, TweetWidgetPost>();
        newPosts.forEach(post => newPostsMap.set(post.id, post));

        // 新規追加された投稿を検出
        for (const newPost of newPosts) {
            if (!oldPostsMap.has(newPost.id)) {
                diffs.push({
                    type: 'add',
                    postId: newPost.id,
                    newPost: { ...newPost },
                    timestamp
                });
            }
        }

        // 削除された投稿を検出
        for (const oldPost of oldPosts) {
            if (!newPostsMap.has(oldPost.id)) {
                diffs.push({
                    type: 'remove',
                    postId: oldPost.id,
                    oldPost: { ...oldPost },
                    timestamp
                });
            }
        }

        // 変更された投稿を検出
        for (const newPost of newPosts) {
            const oldPost = oldPostsMap.get(newPost.id);
            if (oldPost && !this.isPostEqual(oldPost, newPost)) {
                diffs.push({
                    type: 'modify',
                    postId: newPost.id,
                    oldPost: { ...oldPost },
                    newPost: { ...newPost },
                    timestamp
                });
            }
        }

        return diffs;
    }

    /**
     * 2つの投稿が等しいかを深く比較
     */
    private static isPostEqual(post1: TweetWidgetPost, post2: TweetWidgetPost): boolean {
        // 基本フィールドの比較
        if (
            post1.text !== post2.text ||
            post1.created !== post2.created ||
            post1.id !== post2.id ||
            post1.like !== post2.like ||
            post1.liked !== post2.liked ||
            post1.retweet !== post2.retweet ||
            post1.retweeted !== post2.retweeted ||
            post1.edited !== post2.edited ||
            post1.replyCount !== post2.replyCount ||
            post1.quoteId !== post2.quoteId ||
            post1.contextNote !== post2.contextNote ||
            post1.threadId !== post2.threadId ||
            post1.visibility !== post2.visibility ||
            post1.updated !== post2.updated ||
            post1.deleted !== post2.deleted ||
            post1.bookmark !== post2.bookmark ||
            post1.noteQuality !== post2.noteQuality ||
            post1.taskStatus !== post2.taskStatus ||
            post1.userId !== post2.userId ||
            post1.userName !== post2.userName ||
            post1.avatarUrl !== post2.avatarUrl ||
            post1.verified !== post2.verified
        ) {
            return false;
        }

        // 配列フィールドの比較
        if (!this.isArrayEqual(post1.tags, post2.tags)) return false;
        if (!this.isArrayEqual(post1.links, post2.links)) return false;
        if (!this.isFileArrayEqual(post1.files, post2.files)) return false;

        return true;
    }

    /**
     * 文字列配列の等価性を比較
     */
    private static isArrayEqual(arr1?: string[], arr2?: string[]): boolean {
        if (!arr1 && !arr2) return true;
        if (!arr1 || !arr2) return false;
        if (arr1.length !== arr2.length) return false;
        
        return arr1.every((item, index) => item === arr2[index]);
    }

    /**
     * ファイル配列の等価性を比較
     */
    private static isFileArrayEqual(files1?: any[], files2?: any[]): boolean {
        if (!files1 && !files2) return true;
        if (!files1 || !files2) return false;
        if (files1.length !== files2.length) return false;

        return files1.every((file1, index) => {
            const file2 = files2[index];
            return (
                file1.name === file2.name &&
                file1.type === file2.type &&
                file1.dataUrl === file2.dataUrl
            );
        });
    }

    /**
     * 差分を適用して新しい投稿配列を生成
     */
    static applyDiffs(posts: TweetWidgetPost[], diffs: TweetDiff[]): TweetWidgetPost[] {
        console.log(`[DiffCalculator] 差分適用開始: ${posts.length}件の投稿, ${diffs.length}件の差分`);
        
        let result = [...posts];
        const postsMap = new Map<string, number>();
        
        // 投稿のインデックスマップを作成
        result.forEach((post, index) => {
            postsMap.set(post.id, index);
        });

        console.log(`[DiffCalculator] 初期インデックスマップ作成完了: ${postsMap.size}件`);

        for (let i = 0; i < diffs.length; i++) {
            const diff = diffs[i];
            console.log(`[DiffCalculator] 差分適用 ${i + 1}/${diffs.length}: ${diff.type} (${diff.postId})`);
            
            switch (diff.type) {
                case 'add':
                    if (diff.newPost) {
                        result.push({ ...diff.newPost });
                        postsMap.set(diff.newPost.id, result.length - 1);
                        console.log(`[DiffCalculator] 投稿追加: ${diff.newPost.id}, 新しい配列サイズ: ${result.length}`);
                    } else {
                        console.warn(`[DiffCalculator] add操作でnewPostがありません: ${diff.postId}`);
                    }
                    break;

                case 'remove':
                    const removeIndex = postsMap.get(diff.postId);
                    if (removeIndex !== undefined) {
                        console.log(`[DiffCalculator] 投稿削除: ${diff.postId}, インデックス: ${removeIndex}`);
                        result.splice(removeIndex, 1);
                        // インデックスマップを更新
                        this.updateIndicesAfterRemoval(postsMap, removeIndex);
                        console.log(`[DiffCalculator] 削除後配列サイズ: ${result.length}`);
                    } else {
                        console.warn(`[DiffCalculator] 削除対象の投稿が見つかりません: ${diff.postId}`);
                    }
                    break;

                case 'modify':
                    const modifyIndex = postsMap.get(diff.postId);
                    if (modifyIndex !== undefined && diff.newPost) {
                        console.log(`[DiffCalculator] 投稿変更: ${diff.postId}, インデックス: ${modifyIndex}`);
                        result[modifyIndex] = { ...diff.newPost };
                    } else {
                        if (modifyIndex === undefined) {
                            console.warn(`[DiffCalculator] 変更対象の投稿が見つかりません: ${diff.postId}`);
                        }
                        if (!diff.newPost) {
                            console.warn(`[DiffCalculator] modify操作でnewPostがありません: ${diff.postId}`);
                        }
                    }
                    break;
                    
                default:
                    console.warn(`[DiffCalculator] 未知の差分タイプ: ${diff.type}`);
                    break;
            }
        }

        console.log(`[DiffCalculator] 差分適用完了: ${posts.length}件 → ${result.length}件`);
        return result;
    }

    /**
     * 削除後のインデックスマップを更新
     */
    private static updateIndicesAfterRemoval(indexMap: Map<string, number>, removedIndex: number): void {
        for (const [postId, index] of indexMap.entries()) {
            if (index > removedIndex) {
                indexMap.set(postId, index - 1);
            } else if (index === removedIndex) {
                indexMap.delete(postId);
            }
        }
    }

    /**
     * 差分の逆を生成（undo用）
     */
    static reverseDiffs(diffs: TweetDiff[]): TweetDiff[] {
        return diffs.map(diff => {
            switch (diff.type) {
                case 'add':
                    return {
                        ...diff,
                        type: 'remove' as DiffType,
                        oldPost: diff.newPost,
                        newPost: undefined
                    };

                case 'remove':
                    return {
                        ...diff,
                        type: 'add' as DiffType,
                        newPost: diff.oldPost,
                        oldPost: undefined
                    };

                case 'modify':
                    return {
                        ...diff,
                        oldPost: diff.newPost,
                        newPost: diff.oldPost
                    };

                default:
                    return diff;
            }
        }).reverse(); // 適用順序を逆にする
    }

    /**
     * 差分のサマリーを生成
     */
    static generateSummary(diffs: TweetDiff[]): string {
        const counts = { add: 0, remove: 0, modify: 0 };
        diffs.forEach(diff => counts[diff.type]++);

        const parts: string[] = [];
        if (counts.add > 0) parts.push(`${counts.add}件追加`);
        if (counts.remove > 0) parts.push(`${counts.remove}件削除`);
        if (counts.modify > 0) parts.push(`${counts.modify}件変更`);

        return parts.length > 0 ? parts.join(', ') : '変更なし';
    }
} 