import { App, Notice } from 'obsidian';
import type { TweetWidgetSettings } from '../types';
import { BackupUtils } from './BackupUtils';

/**
 * ブランチ情報の型定義
 */
export interface Branch {
    name: string;                    // ブランチ名
    data: TweetWidgetSettings;       // ブランチのデータ
    sourceBackupId?: string;         // 元となったバックアップID
    createdAt: number;               // 作成日時
    lastModified: number;            // 最終更新日時
    description?: string;            // ブランチの説明
}

/**
 * ブランチ状態の型定義
 */
export interface BranchState {
    currentBranch: string;           // 現在のブランチ名
    branches: Branch[];              // 利用可能なブランチ一覧
    lastUpdated: number;             // 最終更新日時
}

/**
 * ブランチ操作の結果
 */
export interface BranchResult {
    success: boolean;
    branchName?: string;
    error?: string;
    data?: TweetWidgetSettings;
}

/**
 * ブランチ管理クラス
 * Gitライクなブランチ機能を提供
 */
export class BranchManager {
    private app: App;
    private basePath: string;
    private branchPath: string;
    private statePath: string;

    constructor(app: App, basePath: string) {
        this.app = app;
        this.basePath = basePath;
        this.branchPath = `${basePath}/branches`;
        this.statePath = `${basePath}/current-branch.json`;
    }

    /**
     * ブランチ管理システムを初期化
     */
    async initialize(mainData: TweetWidgetSettings): Promise<void> {
        try {
            console.log('[BranchManager] ブランチ管理システム初期化開始');
            
            // ディレクトリ作成
            await this.ensureBranchDirectory();
            
            // 状態ファイルの存在確認
            const stateExists = await this.app.vault.adapter.exists(this.statePath);
            
            if (!stateExists) {
                // 初回起動時：mainブランチを作成
                const mainBranch: Branch = {
                    name: 'main',
                    data: mainData,
                    createdAt: Date.now(),
                    lastModified: Date.now(),
                    description: 'メインブランチ'
                };
                
                const initialState: BranchState = {
                    currentBranch: 'main',
                    branches: [mainBranch],
                    lastUpdated: Date.now()
                };
                
                await this.saveBranchState(initialState);
                await this.saveBranchData(mainBranch);
                
                console.log('[BranchManager] 初期化完了：mainブランチを作成');
            } else {
                console.log('[BranchManager] 既存のブランチ状態を検出');
                
                // mainブランチのデータを最新に更新
                await this.updateMainBranch(mainData);
            }
            
        } catch (error) {
            console.error('[BranchManager] 初期化エラー:', error);
            throw error;
        }
    }

    /**
     * 現在のブランチ情報を取得
     */
    async getCurrentBranch(): Promise<Branch | null> {
        try {
            const state = await this.loadBranchState();
            const branch = state.branches.find(b => b.name === state.currentBranch);
            return branch || null;
        } catch (error) {
            console.error('[BranchManager] 現在ブランチ取得エラー:', error);
            return null;
        }
    }

    /**
     * 現在のブランチ名を取得
     */
    async getCurrentBranchName(): Promise<string> {
        try {
            const state = await this.loadBranchState();
            return state.currentBranch;
        } catch (error) {
            console.error('[BranchManager] 現在ブランチ名取得エラー:', error);
            return 'main';
        }
    }

    /**
     * バックアップからブランチを作成してチェックアウト
     */
    async checkoutFromBackup(backupId: string, backupData: TweetWidgetSettings, description?: string): Promise<BranchResult> {
        try {
            console.log(`[BranchManager] バックアップからチェックアウト: ${backupId}`);
            
            // ブランチ名を生成（backup-で始まる名前）
            const branchName = `backup-${backupId.replace(/[^a-zA-Z0-9-_]/g, '_')}`;
            
            // 既存ブランチとの重複チェック
            const state = await this.loadBranchState();
            const existingBranch = state.branches.find(b => b.name === branchName);
            
            if (existingBranch) {
                // 既存ブランチが存在する場合はそこにチェックアウト
                console.log(`[BranchManager] 既存ブランチにチェックアウト: ${branchName}`);
                return await this.checkoutBranch(branchName);
            }
            
            // 新しいブランチを作成
            const newBranch: Branch = {
                name: branchName,
                data: backupData,
                sourceBackupId: backupId,
                createdAt: Date.now(),
                lastModified: Date.now(),
                description: description || `バックアップ ${backupId} からのブランチ`
            };
            
            // ブランチを保存
            await this.saveBranchData(newBranch);
            
            // 状態を更新
            state.branches.push(newBranch);
            state.currentBranch = branchName;
            state.lastUpdated = Date.now();
            await this.saveBranchState(state);
            
            console.log(`[BranchManager] 新しいブランチ作成・チェックアウト完了: ${branchName}`);
            return {
                success: true,
                branchName: branchName,
                data: backupData
            };
            
        } catch (error) {
            console.error('[BranchManager] チェックアウトエラー:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 既存ブランチにチェックアウト
     */
    async checkoutBranch(branchName: string): Promise<BranchResult> {
        try {
            console.log(`[BranchManager] ブランチチェックアウト: ${branchName}`);
            
            const state = await this.loadBranchState();
            const targetBranch = state.branches.find(b => b.name === branchName);
            
            if (!targetBranch) {
                return {
                    success: false,
                    error: `ブランチが見つかりません: ${branchName}`
                };
            }
            
            // 現在のブランチを更新
            state.currentBranch = branchName;
            state.lastUpdated = Date.now();
            await this.saveBranchState(state);
            
            console.log(`[BranchManager] ブランチチェックアウト完了: ${branchName}`);
            return {
                success: true,
                branchName: branchName,
                data: targetBranch.data
            };
            
        } catch (error) {
            console.error('[BranchManager] ブランチチェックアウトエラー:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 現在のブランチにデータを保存
     */
    async saveBranch(data: TweetWidgetSettings): Promise<BranchResult> {
        try {
            const state = await this.loadBranchState();
            const currentBranchName = state.currentBranch;
            const branchIndex = state.branches.findIndex(b => b.name === currentBranchName);
            
            if (branchIndex === -1) {
                return {
                    success: false,
                    error: `現在のブランチが見つかりません: ${currentBranchName}`
                };
            }
            
            // ブランチデータを更新
            state.branches[branchIndex].data = data;
            state.branches[branchIndex].lastModified = Date.now();
            
            // ファイルに保存
            await this.saveBranchData(state.branches[branchIndex]);
            await this.saveBranchState(state);
            
            console.log(`[BranchManager] ブランチ保存完了: ${currentBranchName}`);
            return {
                success: true,
                branchName: currentBranchName,
                data: data
            };
            
        } catch (error) {
            console.error('[BranchManager] ブランチ保存エラー:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * ブランチ一覧を取得
     */
    async listBranches(): Promise<Branch[]> {
        try {
            const state = await this.loadBranchState();
            return state.branches.sort((a, b) => {
                // mainブランチを最初に、その後は作成日時順
                if (a.name === 'main') return -1;
                if (b.name === 'main') return 1;
                return b.createdAt - a.createdAt;
            });
        } catch (error) {
            console.error('[BranchManager] ブランチ一覧取得エラー:', error);
            return [];
        }
    }

    /**
     * ブランチを削除
     */
    async deleteBranch(branchName: string): Promise<BranchResult> {
        try {
            if (branchName === 'main') {
                return {
                    success: false,
                    error: 'mainブランチは削除できません'
                };
            }
            
            const state = await this.loadBranchState();
            const branchIndex = state.branches.findIndex(b => b.name === branchName);
            
            if (branchIndex === -1) {
                return {
                    success: false,
                    error: `ブランチが見つかりません: ${branchName}`
                };
            }
            
            // 現在のブランチを削除しようとしている場合はmainに切り替え
            if (state.currentBranch === branchName) {
                state.currentBranch = 'main';
            }
            
            // ブランチファイルを削除
            const branchFilePath = `${this.branchPath}/${branchName}.json`;
            try {
                await this.app.vault.adapter.remove(branchFilePath);
            } catch (removeError) {
                console.warn(`[BranchManager] ブランチファイル削除警告:`, removeError);
            }
            
            // 状態から削除
            state.branches.splice(branchIndex, 1);
            state.lastUpdated = Date.now();
            await this.saveBranchState(state);
            
            console.log(`[BranchManager] ブランチ削除完了: ${branchName}`);
            return {
                success: true,
                branchName: state.currentBranch
            };
            
        } catch (error) {
            console.error('[BranchManager] ブランチ削除エラー:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * mainブランチのデータを更新
     */
    async updateMainBranch(data: TweetWidgetSettings): Promise<void> {
        try {
            const state = await this.loadBranchState();
            const mainBranchIndex = state.branches.findIndex(b => b.name === 'main');
            
            if (mainBranchIndex !== -1) {
                state.branches[mainBranchIndex].data = data;
                state.branches[mainBranchIndex].lastModified = Date.now();
                
                await this.saveBranchData(state.branches[mainBranchIndex]);
                await this.saveBranchState(state);
                
                console.log('[BranchManager] mainブランチ更新完了');
            }
        } catch (error) {
            console.error('[BranchManager] mainブランチ更新エラー:', error);
        }
    }

    /**
     * ブランチの統計情報を取得
     */
    async getBranchStats(): Promise<{
        totalBranches: number;
        currentBranch: string;
        oldestBranch?: string;
        newestBranch?: string;
    }> {
        try {
            const state = await this.loadBranchState();
            const branches = state.branches.filter(b => b.name !== 'main');
            
            let oldestBranch, newestBranch;
            if (branches.length > 0) {
                branches.sort((a, b) => a.createdAt - b.createdAt);
                oldestBranch = branches[0].name;
                newestBranch = branches[branches.length - 1].name;
            }
            
            return {
                totalBranches: state.branches.length,
                currentBranch: state.currentBranch,
                oldestBranch,
                newestBranch
            };
        } catch (error) {
            console.error('[BranchManager] 統計情報取得エラー:', error);
            return {
                totalBranches: 1,
                currentBranch: 'main'
            };
        }
    }

    // === プライベートメソッド ===

    /**
     * ブランチディレクトリを確保
     */
    private async ensureBranchDirectory(): Promise<void> {
        await BackupUtils.ensureDirectory(this.app, this.branchPath);
    }

    /**
     * ブランチ状態を読み込み
     */
    private async loadBranchState(): Promise<BranchState> {
        try {
            const exists = await this.app.vault.adapter.exists(this.statePath);
            if (!exists) {
                throw new Error('ブランチ状態ファイルが見つかりません');
            }
            
            const content = await this.app.vault.adapter.read(this.statePath);
            return JSON.parse(content) as BranchState;
        } catch (error) {
            console.error('[BranchManager] 状態読み込みエラー:', error);
            // デフォルト状態を返す
            return {
                currentBranch: 'main',
                branches: [],
                lastUpdated: Date.now()
            };
        }
    }

    /**
     * ブランチ状態を保存
     */
    private async saveBranchState(state: BranchState): Promise<void> {
        try {
            state.lastUpdated = Date.now();
            const content = JSON.stringify(state, null, 2);
            await this.app.vault.adapter.write(this.statePath, content);
        } catch (error) {
            console.error('[BranchManager] 状態保存エラー:', error);
            throw error;
        }
    }

    /**
     * ブランチデータを保存
     */
    private async saveBranchData(branch: Branch): Promise<void> {
        try {
            const filePath = `${this.branchPath}/${branch.name}.json`;
            const content = JSON.stringify(branch, null, 2);
            await this.app.vault.adapter.write(filePath, content);
        } catch (error) {
            console.error('[BranchManager] ブランチデータ保存エラー:', error);
            throw error;
        }
    }
} 