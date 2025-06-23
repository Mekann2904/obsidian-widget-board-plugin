/**
 * 非同期ジョブキューシステム
 * 優先度付きジョブ実行、並列処理制御、リトライ機能を提供
 */

export type JobPriority = 'high' | 'normal' | 'low';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobProgress {
    current: number;
    total: number;
    percentage: number;
    eta?: number; // milliseconds
    message?: string;
}

export interface Job<T = any, R = any> {
    id: string;
    name: string;
    priority: JobPriority;
    status: JobStatus;
    progress?: JobProgress;
    payload: T;
    result?: R;
    error?: Error;
    retryCount: number;
    maxRetries: number;
    createdAt: number;
    startedAt?: number;
    completedAt?: number;
    estimatedDuration?: number;
    dependencies?: string[]; // Job IDs that must complete first
    onProgress?: (progress: JobProgress) => void;
    onComplete?: (result: R) => void;
    onError?: (error: Error) => void;
}

export interface JobExecutor<T = any, R = any> {
    (payload: T, updateProgress: (progress: Partial<JobProgress>) => void): Promise<R>;
}

export interface QueueStats {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
    totalProcessed: number;
    averageProcessingTime: number;
    memoryUsage: number;
    activeConcurrency: number;
    maxConcurrency: number;
}

/**
 * 非同期ジョブキューマネージャー
 */
export class AsyncJobQueue {
    private jobs = new Map<string, Job>();
    private executors = new Map<string, JobExecutor>();
    private priorityQueues = {
        high: [] as string[],
        normal: [] as string[],
        low: [] as string[]
    };
    private runningJobs = new Set<string>();
    private completedJobs = new Set<string>();
    private failedJobs = new Set<string>();
    private cancelledJobs = new Set<string>();
    
    private maxConcurrency: number;
    private processingInterval: number | null = null;
    private isProcessing = false;
    private stats: QueueStats;

    // Performance monitoring
    private processingTimes: number[] = [];
    private lastGarbageCollection = 0;
    private memoryThreshold = 100 * 1024 * 1024; // 100MB

    constructor(maxConcurrency = 3) {
        this.maxConcurrency = maxConcurrency;
        this.stats = {
            pending: 0,
            running: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
            totalProcessed: 0,
            averageProcessingTime: 0,
            memoryUsage: 0,
            activeConcurrency: 0,
            maxConcurrency: this.maxConcurrency
        };
        
        this.startProcessing();
    }

    /**
     * ジョブをキューに追加
     */
    public addJob<T, R>(
        name: string,
        executor: JobExecutor<T, R>,
        payload: T,
        options: Partial<Pick<Job<T, R>, 'priority' | 'maxRetries' | 'estimatedDuration' | 'dependencies' | 'onProgress' | 'onComplete' | 'onError'>> = {}
    ): string {
        const id = this.generateJobId();
        const job: Job<T, R> = {
            id,
            name,
            priority: options.priority || 'normal',
            status: 'pending',
            payload,
            retryCount: 0,
            maxRetries: options.maxRetries || 3,
            createdAt: Date.now(),
            estimatedDuration: options.estimatedDuration,
            dependencies: options.dependencies || [],
            onProgress: options.onProgress,
            onComplete: options.onComplete,
            onError: options.onError
        };

        this.jobs.set(id, job);
        this.executors.set(name, executor);
        
        // 依存関係チェック
        if (this.areDependenciesMet(job)) {
            this.priorityQueues[job.priority].push(id);
        }
        
        this.updateStats();
        console.log(`[AsyncJobQueue] Job added: ${name} (${id}) with priority ${job.priority}`);
        
        return id;
    }

    /**
     * ジョブをキャンセル
     */
    public cancelJob(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job) return false;

        if (job.status === 'pending') {
            // キューから除去
            Object.values(this.priorityQueues).forEach(queue => {
                const index = queue.indexOf(jobId);
                if (index !== -1) queue.splice(index, 1);
            });
        }

        job.status = 'cancelled';
        job.completedAt = Date.now();
        this.runningJobs.delete(jobId);
        this.cancelledJobs.add(jobId);
        
        this.updateStats();
        console.log(`[AsyncJobQueue] Job cancelled: ${jobId}`);
        
        return true;
    }

    /**
     * 失敗したジョブを再試行
     */
    public retryJob(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job || job.status !== 'failed') return false;

        job.status = 'pending';
        job.retryCount = 0;
        job.error = undefined;
        job.startedAt = undefined;
        job.completedAt = undefined;
        
        this.failedJobs.delete(jobId);
        
        if (this.areDependenciesMet(job)) {
            this.priorityQueues[job.priority].push(jobId);
        }
        
        this.updateStats();
        console.log(`[AsyncJobQueue] Job retried: ${jobId}`);
        
        return true;
    }

    /**
     * キューをクリア
     */
    public clearQueue(): void {
        // 実行中以外のジョブを削除
        Object.values(this.priorityQueues).forEach(queue => queue.length = 0);
        
        const jobsToDelete: string[] = [];
        this.jobs.forEach((job, id) => {
            if (job.status !== 'running') {
                jobsToDelete.push(id);
            }
        });
        
        jobsToDelete.forEach(id => {
            this.jobs.delete(id);
            this.completedJobs.delete(id);
            this.failedJobs.delete(id);
            this.cancelledJobs.delete(id);
        });
        
        this.updateStats();
        console.log(`[AsyncJobQueue] Queue cleared, ${jobsToDelete.length} jobs removed`);
    }

    /**
     * ジョブ情報を取得
     */
    public getJob(jobId: string): Job | undefined {
        return this.jobs.get(jobId);
    }

    /**
     * 全ジョブ情報を取得
     */
    public getAllJobs(): Job[] {
        return Array.from(this.jobs.values());
    }

    /**
     * キューの統計情報を取得
     */
    public getStats(): QueueStats {
        this.updateMemoryUsage();
        return { ...this.stats };
    }

    /**
     * パフォーマンス情報を取得
     */
    public getPerformanceInfo(): {
        averageProcessingTime: number;
        recentProcessingTimes: number[];
        memoryUsage: number;
        throughput: number;
    } {
        const recentTimes = this.processingTimes.slice(-10);
        const avgTime = recentTimes.length > 0 
            ? recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length 
            : 0;
        
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const recentCompletions = Array.from(this.jobs.values())
            .filter(job => job.completedAt && job.completedAt > oneMinuteAgo)
            .length;
        
        return {
            averageProcessingTime: avgTime,
            recentProcessingTimes: recentTimes,
            memoryUsage: this.stats.memoryUsage,
            throughput: recentCompletions // jobs per minute
        };
    }

    /**
     * キューの処理を停止
     */
    public stop(): void {
        this.isProcessing = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        console.log('[AsyncJobQueue] Processing stopped');
    }

    /**
     * キューの処理を開始
     */
    private startProcessing(): void {
        if (this.processingInterval) return;
        
        this.isProcessing = true;
        this.processingInterval = window.setInterval(() => {
            this.processQueue();
        }, 100); // 100ms間隔でチェック
        
        console.log('[AsyncJobQueue] Processing started');
    }

    /**
     * キューを処理
     */
    private async processQueue(): Promise<void> {
        if (!this.isProcessing || this.runningJobs.size >= this.maxConcurrency) {
            return;
        }

        // 優先度順でジョブを取得
        const nextJobId = this.getNextJob();
        if (!nextJobId) return;

        const job = this.jobs.get(nextJobId);
        if (!job) return;

        await this.executeJob(job);
    }

    /**
     * 次に実行するジョブを取得
     */
    private getNextJob(): string | null {
        // 高優先度から順番にチェック
        for (const priority of ['high', 'normal', 'low'] as JobPriority[]) {
            const queue = this.priorityQueues[priority];
            for (let i = 0; i < queue.length; i++) {
                const jobId = queue[i];
                const job = this.jobs.get(jobId);
                if (job && this.areDependenciesMet(job)) {
                    queue.splice(i, 1);
                    return jobId;
                }
            }
        }
        return null;
    }

    /**
     * 依存関係が満たされているかチェック
     */
    private areDependenciesMet(job: Job): boolean {
        if (!job.dependencies || job.dependencies.length === 0) {
            return true;
        }
        
        return job.dependencies.every(depId => {
            const depJob = this.jobs.get(depId);
            return depJob && depJob.status === 'completed';
        });
    }

    /**
     * ジョブを実行
     */
    private async executeJob(job: Job): Promise<void> {
        try {
            job.status = 'running';
            job.startedAt = Date.now();
            this.runningJobs.add(job.id);
            
            const executor = this.executors.get(job.name);
            if (!executor) {
                throw new Error(`No executor found for job: ${job.name}`);
            }

            console.log(`[AsyncJobQueue] Executing job: ${job.name} (${job.id})`);

            // プログレス更新関数
            const updateProgress = (progress: Partial<JobProgress>) => {
                if (job.progress) {
                    Object.assign(job.progress, progress);
                } else {
                    job.progress = {
                        current: 0,
                        total: 100,
                        percentage: 0,
                        ...progress
                    };
                }
                
                // パーセンテージを計算
                if (job.progress.total > 0) {
                    job.progress.percentage = Math.round((job.progress.current / job.progress.total) * 100);
                }
                
                // ETAを計算
                if (job.startedAt && job.progress.percentage > 0) {
                    const elapsed = Date.now() - job.startedAt;
                    const estimated = (elapsed / job.progress.percentage) * 100;
                    job.progress.eta = Math.round(estimated - elapsed);
                }
                
                job.onProgress?.(job.progress);
            };

            // ジョブ実行
            const result = await executor(job.payload, updateProgress);
            
            job.result = result;
            job.status = 'completed';
            job.completedAt = Date.now();
            
            // 処理時間を記録
            const processingTime = job.completedAt - job.startedAt!;
            this.processingTimes.push(processingTime);
            if (this.processingTimes.length > 100) {
                this.processingTimes.shift(); // 古いデータを削除
            }
            
            this.completedJobs.add(job.id);
            job.onComplete?.(result);
            
            console.log(`[AsyncJobQueue] Job completed: ${job.name} (${job.id}) in ${processingTime}ms`);
            
        } catch (error) {
            console.error(`[AsyncJobQueue] Job failed: ${job.name} (${job.id})`, error);
            
            job.error = error instanceof Error ? error : new Error(String(error));
            job.retryCount++;
            
            if (job.retryCount < job.maxRetries) {
                // リトライ
                const delay = Math.pow(2, job.retryCount) * 1000; // Exponential backoff
                setTimeout(() => {
                    job.status = 'pending';
                    if (this.areDependenciesMet(job)) {
                        this.priorityQueues[job.priority].push(job.id);
                    }
                    this.updateStats();
                }, delay);
                
                console.log(`[AsyncJobQueue] Job will retry in ${delay}ms: ${job.id} (attempt ${job.retryCount}/${job.maxRetries})`);
            } else {
                // 最大リトライ回数に達した
                job.status = 'failed';
                job.completedAt = Date.now();
                this.failedJobs.add(job.id);
                job.onError?.(job.error);
            }
        } finally {
            this.runningJobs.delete(job.id);
            this.updateStats();
            
            // 依存関係のあるジョブをチェック
            this.checkDependentJobs(job.id);
            
            // ガベージコレクション
            this.performGarbageCollection();
        }
    }

    /**
     * 依存ジョブをチェックしてキューに追加
     */
    private checkDependentJobs(completedJobId: string): void {
        this.jobs.forEach((job, jobId) => {
            if (job.status === 'pending' && 
                job.dependencies?.includes(completedJobId) &&
                this.areDependenciesMet(job)) {
                
                // キューに追加されていない場合のみ追加
                const isInQueue = Object.values(this.priorityQueues)
                    .some(queue => queue.includes(jobId));
                
                if (!isInQueue) {
                    this.priorityQueues[job.priority].push(jobId);
                }
            }
        });
    }

    /**
     * 統計情報を更新
     */
    private updateStats(): void {
        let pending = 0, running = 0, completed = 0, failed = 0, cancelled = 0;
        
        this.jobs.forEach(job => {
            switch (job.status) {
                case 'pending': pending++; break;
                case 'running': running++; break;
                case 'completed': completed++; break;
                case 'failed': failed++; break;
                case 'cancelled': cancelled++; break;
            }
        });
        
        const avgTime = this.processingTimes.length > 0
            ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
            : 0;
        
        this.stats = {
            pending,
            running,
            completed,
            failed,
            cancelled,
            totalProcessed: completed + failed + cancelled,
            averageProcessingTime: avgTime,
            memoryUsage: this.stats.memoryUsage,
            activeConcurrency: this.runningJobs.size,
            maxConcurrency: this.maxConcurrency
        };
    }

    /**
     * メモリ使用量を更新
     */
    private updateMemoryUsage(): void {
        try {
            // Chrome/Edge specific memory API
            const perf = performance as any;
            if (typeof performance !== 'undefined' && perf.memory && perf.memory.usedJSHeapSize) {
                this.stats.memoryUsage = perf.memory.usedJSHeapSize;
            }
        } catch (error) {
            // Memory API not available in this browser
            this.stats.memoryUsage = 0;
        }
    }

    /**
     * ガベージコレクションを実行
     */
    private performGarbageCollection(): void {
        const now = Date.now();
        if (now - this.lastGarbageCollection < 60000) return; // 1分に1回まで
        
        // 古い完了/失敗ジョブを削除（24時間経過）
        const cutoff = now - 24 * 60 * 60 * 1000;
        const jobsToDelete: string[] = [];
        
        this.jobs.forEach((job, id) => {
            if ((job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') &&
                job.completedAt && job.completedAt < cutoff) {
                jobsToDelete.push(id);
            }
        });
        
        jobsToDelete.forEach(id => {
            this.jobs.delete(id);
            this.completedJobs.delete(id);
            this.failedJobs.delete(id);
            this.cancelledJobs.delete(id);
        });
        
        if (jobsToDelete.length > 0) {
            console.log(`[AsyncJobQueue] Garbage collection: removed ${jobsToDelete.length} old jobs`);
        }
        
        this.lastGarbageCollection = now;
    }

    /**
     * ジョブIDを生成
     */
    private generateJobId(): string {
        return 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
} 