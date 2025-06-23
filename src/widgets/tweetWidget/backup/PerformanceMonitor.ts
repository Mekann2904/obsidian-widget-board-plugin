/**
 * パフォーマンス監視マネージャー
 * バックアップ処理のパフォーマンス監視と最適化
 */

import type { QueueStats } from './AsyncJobQueue';

/**
 * パフォーマンス統計
 */
export interface PerformanceStats {
    // CPU & Memory
    memoryUsage: number;
    memoryPeak: number;
    memoryAverage: number;
    cpuTime: number;
    
    // Processing
    operationsCompleted: number;
    operationsFailed: number;
    averageProcessingTime: number;
    totalProcessingTime: number;
    
    // Throughput
    operationsPerSecond: number;
    dataProcessedPerSecond: number; // bytes
    
    // Queue
    queueStats: QueueStats;
    
    // Timestamps
    startTime: number;
    lastUpdate: number;
    uptime: number;
}

/**
 * パフォーマンスイベント
 */
export interface PerformanceEvent {
    type: 'operation_start' | 'operation_complete' | 'operation_fail' | 'memory_warning' | 'queue_full';
    timestamp: number;
    data: any;
    duration?: number;
    memoryUsage?: number;
}

/**
 * パフォーマンス閾値
 */
export interface PerformanceThresholds {
    memoryWarning: number; // bytes
    memoryCritical: number; // bytes
    processingTimeWarning: number; // ms
    queueLengthWarning: number;
    failureRateWarning: number; // percentage
}

/**
 * パフォーマンス監視マネージャー
 */
export class PerformanceMonitor {
    private stats: PerformanceStats;
    private events: PerformanceEvent[] = [];
    private isMonitoring = false;
    private monitoringInterval: number | null = null;
    
    private thresholds: PerformanceThresholds = {
        memoryWarning: 500 * 1024 * 1024, // 500MB
        memoryCritical: 1024 * 1024 * 1024, // 1GB
        processingTimeWarning: 10000, // 10秒
        queueLengthWarning: 100,
        failureRateWarning: 10 // 10%
    };

    // 監視データ
    private processingTimes: number[] = [];
    private memoryReadings: number[] = [];
    private operationCounts = {
        completed: 0,
        failed: 0
    };

    constructor() {
        this.stats = this.initializeStats();
    }

    /**
     * 監視を開始
     */
    public startMonitoring(intervalMs = 1000): void {
        if (this.isMonitoring) return;

        console.log('[PerformanceMonitor] 監視開始');
        
        this.isMonitoring = true;
        this.stats.startTime = Date.now();
        
        this.monitoringInterval = window.setInterval(() => {
            this.updateStats();
            this.checkThresholds();
            this.cleanupOldEvents();
        }, intervalMs);
    }

    /**
     * 監視を停止
     */
    public stopMonitoring(): void {
        if (!this.isMonitoring) return;

        console.log('[PerformanceMonitor] 監視停止');
        
        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }

    /**
     * 操作開始を記録
     */
    public recordOperationStart(operationType: string, data?: any): string {
        const operationId = this.generateOperationId();
        
        this.addEvent({
            type: 'operation_start',
            timestamp: Date.now(),
            data: {
                operationId,
                operationType,
                ...data
            }
        });

        return operationId;
    }

    /**
     * 操作完了を記録
     */
    public recordOperationComplete(operationId: string, data?: any): void {
        const startEvent = this.events.find(
            e => e.type === 'operation_start' && 
                e.data.operationId === operationId
        );

        const now = Date.now();
        const duration = startEvent ? now - startEvent.timestamp : 0;

        this.operationCounts.completed++;
        this.processingTimes.push(duration);
        
        // 古い処理時間データを削除（最新100件まで）
        if (this.processingTimes.length > 100) {
            this.processingTimes.shift();
        }

        this.addEvent({
            type: 'operation_complete',
            timestamp: now,
            duration,
            memoryUsage: this.getCurrentMemoryUsage(),
            data: {
                operationId,
                ...data
            }
        });
    }

    /**
     * 操作失敗を記録
     */
    public recordOperationFail(operationId: string, error: any, data?: any): void {
        const startEvent = this.events.find(
            e => e.type === 'operation_start' && 
                e.data.operationId === operationId
        );

        const now = Date.now();
        const duration = startEvent ? now - startEvent.timestamp : 0;

        this.operationCounts.failed++;

        this.addEvent({
            type: 'operation_fail',
            timestamp: now,
            duration,
            memoryUsage: this.getCurrentMemoryUsage(),
            data: {
                operationId,
                error: error instanceof Error ? error.message : String(error),
                ...data
            }
        });
    }

    /**
     * キュー統計を更新
     */
    public updateQueueStats(queueStats: QueueStats): void {
        this.stats.queueStats = queueStats;
    }

    /**
     * 現在の統計を取得
     */
    public getStats(): PerformanceStats {
        this.updateStats();
        return { ...this.stats };
    }

    /**
     * パフォーマンスレポートを取得
     */
    public getPerformanceReport(): {
        stats: PerformanceStats;
        recentEvents: PerformanceEvent[];
        recommendations: string[];
    } {
        const stats = this.getStats();
        const recentEvents = this.events.slice(-20); // 最新20件
        const recommendations = this.generateRecommendations(stats);

        return {
            stats,
            recentEvents,
            recommendations
        };
    }

    /**
     * パフォーマンス詳細を取得
     */
    public getDetailedMetrics(): {
        processingTimeDistribution: number[];
        memoryUsageHistory: number[];
        operationSuccessRate: number;
        averageThroughput: number;
        peakMemoryUsage: number;
        longestOperation: number;
    } {
        const successRate = this.operationCounts.completed + this.operationCounts.failed > 0
            ? (this.operationCounts.completed / (this.operationCounts.completed + this.operationCounts.failed)) * 100
            : 100;

        const avgThroughput = this.stats.uptime > 0 
            ? (this.operationCounts.completed / (this.stats.uptime / 1000))
            : 0;

        return {
            processingTimeDistribution: [...this.processingTimes],
            memoryUsageHistory: [...this.memoryReadings],
            operationSuccessRate: successRate,
            averageThroughput: avgThroughput,
            peakMemoryUsage: this.stats.memoryPeak,
            longestOperation: Math.max(...this.processingTimes, 0)
        };
    }

    /**
     * 閾値を設定
     */
    public setThresholds(thresholds: Partial<PerformanceThresholds>): void {
        this.thresholds = { ...this.thresholds, ...thresholds };
        console.log('[PerformanceMonitor] 閾値更新:', this.thresholds);
    }

    /**
     * パフォーマンス統計を初期化
     */
    private initializeStats(): PerformanceStats {
        return {
            memoryUsage: 0,
            memoryPeak: 0,
            memoryAverage: 0,
            cpuTime: 0,
            operationsCompleted: 0,
            operationsFailed: 0,
            averageProcessingTime: 0,
            totalProcessingTime: 0,
            operationsPerSecond: 0,
            dataProcessedPerSecond: 0,
            queueStats: {
                pending: 0,
                running: 0,
                completed: 0,
                failed: 0,
                cancelled: 0,
                totalProcessed: 0,
                averageProcessingTime: 0,
                memoryUsage: 0,
                activeConcurrency: 0,
                maxConcurrency: 0
            },
            startTime: Date.now(),
            lastUpdate: Date.now(),
            uptime: 0
        };
    }

    /**
     * 統計を更新
     */
    private updateStats(): void {
        const now = Date.now();
        const currentMemory = this.getCurrentMemoryUsage();
        
        // メモリ統計
        this.stats.memoryUsage = currentMemory;
        this.stats.memoryPeak = Math.max(this.stats.memoryPeak, currentMemory);
        
        this.memoryReadings.push(currentMemory);
        if (this.memoryReadings.length > 100) {
            this.memoryReadings.shift();
        }
        
        if (this.memoryReadings.length > 0) {
            this.stats.memoryAverage = this.memoryReadings.reduce((a, b) => a + b) / this.memoryReadings.length;
        }

        // 処理時間統計
        this.stats.operationsCompleted = this.operationCounts.completed;
        this.stats.operationsFailed = this.operationCounts.failed;
        
        if (this.processingTimes.length > 0) {
            this.stats.averageProcessingTime = this.processingTimes.reduce((a, b) => a + b) / this.processingTimes.length;
            this.stats.totalProcessingTime = this.processingTimes.reduce((a, b) => a + b);
        }

        // スループット計算
        this.stats.uptime = now - this.stats.startTime;
        if (this.stats.uptime > 0) {
            this.stats.operationsPerSecond = this.operationCounts.completed / (this.stats.uptime / 1000);
        }

        this.stats.lastUpdate = now;
    }

    /**
     * 閾値をチェック
     */
    private checkThresholds(): void {
        const stats = this.stats;

        // メモリ警告
        if (stats.memoryUsage > this.thresholds.memoryCritical) {
            this.addEvent({
                type: 'memory_warning',
                timestamp: Date.now(),
                data: {
                    level: 'critical',
                    memoryUsage: stats.memoryUsage,
                    threshold: this.thresholds.memoryCritical
                }
            });
        } else if (stats.memoryUsage > this.thresholds.memoryWarning) {
            this.addEvent({
                type: 'memory_warning',
                timestamp: Date.now(),
                data: {
                    level: 'warning',
                    memoryUsage: stats.memoryUsage,
                    threshold: this.thresholds.memoryWarning
                }
            });
        }

        // キュー警告
        if (stats.queueStats.pending > this.thresholds.queueLengthWarning) {
            this.addEvent({
                type: 'queue_full',
                timestamp: Date.now(),
                data: {
                    pending: stats.queueStats.pending,
                    threshold: this.thresholds.queueLengthWarning
                }
            });
        }
    }

    /**
     * 推奨事項を生成
     */
    private generateRecommendations(stats: PerformanceStats): string[] {
        const recommendations: string[] = [];

        // メモリ使用量の推奨
        if (stats.memoryUsage > this.thresholds.memoryWarning) {
            recommendations.push('メモリ使用量が高いです。不要なデータの削除を検討してください。');
        }

        // 処理時間の推奨
        if (stats.averageProcessingTime > this.thresholds.processingTimeWarning) {
            recommendations.push('処理時間が長いです。データのシャーディングを検討してください。');
        }

        // 失敗率の推奨
        const failureRate = stats.operationsCompleted + stats.operationsFailed > 0
            ? (stats.operationsFailed / (stats.operationsCompleted + stats.operationsFailed)) * 100
            : 0;
        
        if (failureRate > this.thresholds.failureRateWarning) {
            recommendations.push('操作の失敗率が高いです。リトライ回数やタイムアウト設定を見直してください。');
        }

        // キューの推奨
        if (stats.queueStats.pending > this.thresholds.queueLengthWarning) {
            recommendations.push('キューが混雑しています。並列処理数の増加を検討してください。');
        }

        // スループットの推奨
        if (stats.operationsPerSecond < 1) {
            recommendations.push('スループットが低いです。バッチサイズの最適化を検討してください。');
        }

        return recommendations;
    }

    /**
     * イベントを追加
     */
    private addEvent(event: PerformanceEvent): void {
        this.events.push(event);
        
        // イベント履歴を制限（最新1000件まで）
        if (this.events.length > 1000) {
            this.events = this.events.slice(-1000);
        }
    }

    /**
     * 古いイベントをクリーンアップ
     */
    private cleanupOldEvents(): void {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24時間前
        this.events = this.events.filter(event => event.timestamp > cutoff);
    }

    /**
     * 現在のメモリ使用量を取得
     */
    private getCurrentMemoryUsage(): number {
        try {
            const perf = performance as any;
            return perf.memory?.usedJSHeapSize || 0;
        } catch {
            return 0;
        }
    }

    /**
     * 操作IDを生成
     */
    private generateOperationId(): string {
        return 'op_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}
