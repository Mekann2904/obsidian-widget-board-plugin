import { App } from 'obsidian';
import type { TweetWidgetPost, TweetWidgetSettings } from '../types';
import type { TweetCommit, TweetDiff, VersionControlConfig, VersionControlMeta, HistoryEntry, RestoreOptions } from './types';
import { DiffCalculator } from './DiffCalculator';

/**
 * ツイートのGit風バージョン管理システム
 */
export class TweetVersionControl {
    private app: App;
    private basePath: string;
    private gitPath: string;
    private commitsPath: string;
    private metaPath: string;
    private headPath: string;
    
    private defaultConfig: VersionControlConfig = {
        maxCommits: 100,
        autoCommit: true,
        commitMessage: {
            auto: true,
            template: "自動保存: {summary}"
        },
        compression: false,
        retentionDays: 30
    };

    constructor(app: App, dataPath: string) {
        this.app = app;
        this.basePath = dataPath.replace(/\.json$/, '');
        this.gitPath = `${this.basePath}/.wb-git`;
        this.commitsPath = `${this.gitPath}/commits`;
        this.metaPath = `${this.gitPath}/meta.json`;
        this.headPath = `${this.gitPath}/HEAD`;
    }

    /**
     * バージョン管理システムを初期化
     */
    async initialize(): Promise<void> {
        // .wb-git ディレクトリ構造を作成
        await this.ensureDirectoryExists(this.gitPath);
        await this.ensureDirectoryExists(this.commitsPath);

        // メタデータファイルの初期化
        if (!await this.app.vault.adapter.exists(this.metaPath)) {
            const meta: VersionControlMeta = {
                version: '1.0.0',
                created: Date.now(),
                totalCommits: 0,
                config: this.defaultConfig
            };
            await this.writeMeta(meta);
        }

        // HEADファイルの初期化
        if (!await this.app.vault.adapter.exists(this.headPath)) {
            await this.app.vault.adapter.write(this.headPath, '');
        }
    }

    /**
     * 変更をコミット
     */
    async commit(
        oldPosts: TweetWidgetPost[], 
        newPosts: TweetWidgetPost[], 
        message?: string,
        settings?: Partial<TweetWidgetSettings>
    ): Promise<string | null> {
        await this.initialize();

        // 差分を計算
        const diffs = DiffCalculator.calculateDiffs(oldPosts, newPosts);
        
        // 変更がない場合はコミットしない
        if (diffs.length === 0) {
            return null;
        }

        // コミット情報を作成
        const commit: TweetCommit = {
            id: await this.generateCommitId(diffs),
            message: message || this.generateAutoMessage(diffs),
            timestamp: Date.now(),
            parent: await this.getCurrentCommitId() || undefined,
            diffs,
            author: 'Widget Board Plugin',
            settingsSnapshot: settings
        };

        // コミットを保存
        await this.saveCommit(commit);

        // HEADを更新
        await this.updateHead(commit.id);

        // メタデータを更新
        await this.updateMeta();

        // 古いコミットをクリーンアップ
        await this.cleanupOldCommits();

        return commit.id;
    }

    /**
     * 履歴を取得
     */
    async getHistory(limit: number = 50): Promise<HistoryEntry[]> {
        await this.initialize();

        const history: HistoryEntry[] = [];
        let currentCommitId: string | null = await this.getCurrentCommitId();

        while (currentCommitId && history.length < limit) {
            const commit = await this.loadCommit(currentCommitId);
            if (!commit) break;

            const summary = DiffCalculator.generateSummary(commit.diffs);
            history.push({
                commit,
                summary,
                displayMessage: commit.message
            });

            currentCommitId = commit.parent || null;
        }

        return history;
    }

    /**
     * 特定のコミットに復元
     */
    async restore(options: RestoreOptions): Promise<TweetWidgetPost[]> {
        await this.initialize();

        const targetCommit = await this.loadCommit(options.commitId);
        if (!targetCommit) {
            throw new Error(`コミット ${options.commitId} が見つかりません`);
        }

        // バックアップを作成
        if (options.createBackup) {
            const currentPosts = await this.getCurrentPosts();
            if (currentPosts) {
                await this.commit(currentPosts, currentPosts, `復元前バックアップ (${new Date().toLocaleString()})`);
            }
        }

        // コミット履歴を遡って投稿状態を再構築
        const restoredPosts = await this.reconstructPostsAtCommit(options.commitId);

        return restoredPosts;
    }

    /**
     * 特定のコミット時点での投稿状態を再構築
     */
    private async reconstructPostsAtCommit(commitId: string): Promise<TweetWidgetPost[]> {
        // コミット履歴を収集
        const commits: TweetCommit[] = [];
        let currentCommitId: string | null = commitId;

        while (currentCommitId) {
            const commit = await this.loadCommit(currentCommitId);
            if (!commit) break;
            commits.unshift(commit); // 古い順に並べる
            currentCommitId = commit.parent || null;
        }

        // 空の状態から順次差分を適用
        let posts: TweetWidgetPost[] = [];
        for (const commit of commits) {
            posts = DiffCalculator.applyDiffs(posts, commit.diffs);
        }

        return posts;
    }

    /**
     * コミットIDを生成
     */
    private async generateCommitId(diffs: TweetDiff[]): Promise<string> {
        const content = JSON.stringify({
            timestamp: Date.now(),
            diffs,
            parent: await this.getCurrentCommitId()
        });
        
        // 簡易ハッシュ生成（実際のプロジェクトではcrypto.subtle.digestを使用）
        const hash = Array.from(content)
            .reduce((hash, char) => {
                const chr = char.charCodeAt(0);
                hash = ((hash << 5) - hash) + chr;
                return hash & hash; // Convert to 32bit integer
            }, 0);
        
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    /**
     * 自動メッセージを生成
     */
    private generateAutoMessage(diffs: TweetDiff[]): string {
        const meta = this.defaultConfig;
        const summary = DiffCalculator.generateSummary(diffs);
        
        if (meta.commitMessage.auto) {
            return meta.commitMessage.template.replace('{summary}', summary);
        }
        
        return summary;
    }

    /**
     * 現在のコミットIDを取得
     */
    private async getCurrentCommitId(): Promise<string | null> {
        try {
            const head = await this.app.vault.adapter.read(this.headPath);
            return head.trim() || null;
        } catch {
            return null;
        }
    }

    /**
     * 現在の投稿データを取得（他のコンポーネントから注入される想定）
     */
    private async getCurrentPosts(): Promise<TweetWidgetPost[] | null> {
        // この部分は実際の統合時に実装
        return null;
    }

    /**
     * コミットを保存
     */
    private async saveCommit(commit: TweetCommit): Promise<void> {
        const commitPath = `${this.commitsPath}/${commit.id}.json`;
        await this.app.vault.adapter.write(commitPath, JSON.stringify(commit, null, 2));
    }

    /**
     * コミットを読み込み
     */
    private async loadCommit(commitId: string): Promise<TweetCommit | null> {
        try {
            const commitPath = `${this.commitsPath}/${commitId}.json`;
            const content = await this.app.vault.adapter.read(commitPath);
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    /**
     * HEADを更新
     */
    private async updateHead(commitId: string): Promise<void> {
        await this.app.vault.adapter.write(this.headPath, commitId);
    }

    /**
     * メタデータを更新
     */
    private async updateMeta(): Promise<void> {
        const meta = await this.readMeta();
        meta.totalCommits++;
        const currentCommitId = await this.getCurrentCommitId();
        meta.lastCommit = currentCommitId;
        await this.writeMeta(meta);
    }

    /**
     * メタデータを読み込み
     */
    private async readMeta(): Promise<VersionControlMeta> {
        try {
            const content = await this.app.vault.adapter.read(this.metaPath);
            return JSON.parse(content);
        } catch {
            return {
                version: '1.0.0',
                created: Date.now(),
                totalCommits: 0,
                config: this.defaultConfig
            };
        }
    }

    /**
     * メタデータを書き込み
     */
    private async writeMeta(meta: VersionControlMeta): Promise<void> {
        await this.app.vault.adapter.write(this.metaPath, JSON.stringify(meta, null, 2));
    }

    /**
     * 古いコミットをクリーンアップ
     */
    private async cleanupOldCommits(): Promise<void> {
        const meta = await this.readMeta();
        const config = meta.config;

        if (meta.totalCommits <= config.maxCommits) {
            return;
        }

        // 最新のcommit履歴を取得
        const history = await this.getHistory(config.maxCommits);
        const keepCommitIds = new Set(history.map(h => h.commit.id));

        // commits ディレクトリ内の全ファイルを確認
        try {
            const files = await this.app.vault.adapter.list(this.commitsPath);
            for (const file of files.files) {
                const fileName = file.split('/').pop()?.replace('.json', '');
                if (fileName && !keepCommitIds.has(fileName)) {
                    await this.app.vault.adapter.remove(file);
                }
            }
        } catch (error) {
            console.warn('コミットクリーンアップ中にエラーが発生:', error);
        }
    }

    /**
     * ディレクトリが存在することを確保
     */
    private async ensureDirectoryExists(path: string): Promise<void> {
        try {
            const exists = await this.app.vault.adapter.exists(path);
            if (!exists) {
                await this.app.vault.adapter.mkdir(path);
            }
        } catch (error) {
            console.warn(`ディレクトリ作成エラー (${path}):`, error);
        }
    }

    /**
     * 設定を更新
     */
    async updateConfig(newConfig: Partial<VersionControlConfig>): Promise<void> {
        const meta = await this.readMeta();
        meta.config = { ...meta.config, ...newConfig };
        await this.writeMeta(meta);
    }

    /**
     * 統計情報を取得
     */
    async getStats(): Promise<{ totalCommits: number; firstCommit?: number; lastCommit?: number }> {
        const meta = await this.readMeta();
        const history = await this.getHistory(1);
        
        return {
            totalCommits: meta.totalCommits,
            firstCommit: meta.created,
            lastCommit: history[0]?.commit.timestamp
        };
    }
} 