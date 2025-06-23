/**
 * データシャーディングマネージャー
 * 大きなデータセットを効率的に分割・並列処理
 */

import type { TweetWidgetSettings } from '../types';

/**
 * シャード情報
 */
export interface Shard {
    id: string;
    index: number;
    data: any;
    size: number;
    checksum: string;
    processed: boolean;
    error?: string;
}

/**
 * シャーディング設定
 */
export interface ShardingConfig {
    maxShardSize: number; // bytes
    maxShardsCount: number;
    processingConcurrency: number;
    retryCount: number;
}

/**
 * シャーディング結果
 */
export interface ShardingResult {
    shards: Shard[];
    totalSize: number;
    shardsCount: number;
    averageShardSize: number;
    processingTime: number;
}

/**
 * データシャーディングマネージャー
 */
export class ShardingManager {
    private defaultConfig: ShardingConfig = {
        maxShardSize: 10 * 1024 * 1024, // 10MB
        maxShardsCount: 50,
        processingConcurrency: 3,
        retryCount: 3
    };

    /**
     * データをシャードに分割
     */
    public async shardData(
        data: TweetWidgetSettings, 
        config: Partial<ShardingConfig> = {}
    ): Promise<ShardingResult> {
        const startTime = performance.now();
        const effectiveConfig = { ...this.defaultConfig, ...config };

        try {
            console.log('[ShardingManager] データシャーディング開始');

            // データサイズを計算
            const serializedData = JSON.stringify(data);
            const totalSize = new Blob([serializedData]).size;

            console.log(`[ShardingManager] 総データサイズ: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);

            // シャーディングが必要かチェック
            if (totalSize <= effectiveConfig.maxShardSize) {
                console.log('[ShardingManager] シャーディング不要');
                return {
                    shards: [{
                        id: 'shard_0',
                        index: 0,
                        data,
                        size: totalSize,
                        checksum: this.generateChecksum(serializedData),
                        processed: false
                    }],
                    totalSize,
                    shardsCount: 1,
                    averageShardSize: totalSize,
                    processingTime: performance.now() - startTime
                };
            }

            // 投稿データとスケジュール投稿を分割
            const shards: Shard[] = [];
            
            // 投稿データを分割
            if (data.posts && data.posts.length > 0) {
                const postShards = this.createShards(data.posts, 'posts', effectiveConfig);
                shards.push(...postShards);
            }

            // スケジュール投稿を分割
            if (data.scheduledPosts && data.scheduledPosts.length > 0) {
                const scheduledShards = this.createShards(data.scheduledPosts, 'scheduled', effectiveConfig);
                shards.push(...scheduledShards);
            }

            // メタデータシャード
            const metadataShards = this.createMetadataShards(data);
            shards.push(...metadataShards);

            const processingTime = performance.now() - startTime;
            const averageShardSize = shards.length > 0 ? totalSize / shards.length : 0;

            console.log(`[ShardingManager] シャーディング完了: ${shards.length}個のシャード, ${processingTime.toFixed(2)}ms`);

            return {
                shards,
                totalSize,
                shardsCount: shards.length,
                averageShardSize,
                processingTime
            };

        } catch (error) {
            console.error('[ShardingManager] シャーディングエラー:', error);
            throw new Error(`シャーディングに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * データをシャードに分割（汎用）
     */
    private createShards(items: any[], prefix: string, config: ShardingConfig): Shard[] {
        const shards: Shard[] = [];
        let currentShardItems: any[] = [];
        let currentSize = 0;
        let shardIndex = 0;

        for (const item of items) {
            const itemSize = new Blob([JSON.stringify(item)]).size;
            
            if (currentSize + itemSize > config.maxShardSize && currentShardItems.length > 0) {
                // 現在のシャードを完成
                const shardData = JSON.stringify(currentShardItems);
                shards.push({
                    id: `${prefix}_${shardIndex}`,
                    index: shardIndex,
                    data: currentShardItems,
                    size: currentSize,
                    checksum: this.generateChecksum(shardData),
                    processed: false
                });
                
                currentShardItems = [];
                currentSize = 0;
                shardIndex++;
            }
            
            currentShardItems.push(item);
            currentSize += itemSize;
        }

        // 最後のシャード
        if (currentShardItems.length > 0) {
            const shardData = JSON.stringify(currentShardItems);
            shards.push({
                id: `${prefix}_${shardIndex}`,
                index: shardIndex,
                data: currentShardItems,
                size: currentSize,
                checksum: this.generateChecksum(shardData),
                processed: false
            });
        }

        return shards;
    }

    /**
     * メタデータシャードを作成
     */
    private createMetadataShards(data: TweetWidgetSettings): Shard[] {
        const metadata = {
            avatarUrl: data.avatarUrl,
            userName: data.userName,
            userId: data.userId,
            verified: data.verified,
            aiGovernance: data.aiGovernance,
            width: data.width,
            height: data.height
        };

        const metadataData = JSON.stringify(metadata);
        const size = new Blob([metadataData]).size;

        return [{
            id: 'metadata',
            index: 0,
            data: metadata,
            size,
            checksum: this.generateChecksum(metadataData),
            processed: false
        }];
    }

    /**
     * チェックサムを生成
     */
    private generateChecksum(data: string): string {
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            const char = data.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit integer
        }
        return Math.abs(hash).toString(16);
    }
}
