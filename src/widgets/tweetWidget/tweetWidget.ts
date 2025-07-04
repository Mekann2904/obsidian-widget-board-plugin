import { App, Notice, TFile } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main';
import { GeminiProvider } from '../../llm/gemini/geminiApi';
import { deobfuscate, pad2, getDateKeyLocal } from '../../utils';
import { geminiPrompt } from '../../llm/gemini/tweetReplyPrompt';
import { debugLog } from '../../utils/logger';
import { applyWidgetSize, createWidgetContainer } from '../../utils';
import { getWeekRange } from '../../utils';
import { t } from '../../i18n';

// --- 分離したモジュールをインポート ---
import type { TweetWidgetFile, TweetWidgetPost, TweetWidgetSettings } from './types';
import { MAX_TWEET_LENGTH } from './constants';
import { generateAiReply, shouldAutoReply, findLatestAiUserIdInThread, getFullThreadHistory, generateAiUserId, isExplicitAiTrigger } from './aiReply';
import { parseTags, parseLinks, formatTimeAgo, readFileAsDataUrl, wrapSelection } from './tweetWidgetUtils';

import { TweetWidgetUI } from './tweetWidgetUI';
import { TweetRepository } from './TweetRepository';
import { TweetStore, TweetStoreListener, TweetStoreEventData } from './TweetStore';
import { TweetScheduler } from './TweetScheduler';
import { TweetFileHandler } from './TweetFileHandler';
import { computeNextTime, ScheduleOptions } from './scheduleUtils';
import type { ScheduledTweet } from './types';

export class TweetWidget implements WidgetImplementation {
    // --- Public properties for UI and Plugin ---
    id = 'tweet-widget';
    app!: App;
    plugin!: WidgetBoardPlugin;
    config!: WidgetConfig;
    maxLength = MAX_TWEET_LENGTH;

    // --- UI State (managed by Controller) ---
    attachedFiles: TweetWidgetFile[] = [];
    editingPostId: string | null = null;
    replyingToParentId: string | null = null;
    currentFilter: 'all' | 'active' | 'deleted' | 'bookmark' = 'active';
    detailPostId: string | null = null;
    replyModalPost: TweetWidgetPost | null = null;
    retweetModalPost: TweetWidgetPost | null = null;
    retweetListPost: TweetWidgetPost | null = null;
    currentTab: 'home' | 'notification' = 'home';
    currentPeriod: string = 'all';
    customPeriodDays: number = 1;
    
    // --- Core Modules ---
    private widgetEl!: HTMLElement;
    private ui!: TweetWidgetUI;
    private store!: TweetStore;
    private repository!: TweetRepository;
    private scheduler!: TweetScheduler;
    private saveTimeout: number | null = null;

    /**
     * Getters to provide store data to the UI layer
     */
    get currentSettings(): TweetWidgetSettings { return this.store.settings; }
    get postsById(): Map<string, TweetWidgetPost> { return this.store.postsById; }
    getReplies(parentId: string): TweetWidgetPost[] { return this.store.getReplies(parentId); }
    getQuotePosts(postId: string): TweetWidgetPost[] { return this.store.getQuotePosts(postId); }

    /**
     * バージョン管理機能のパブリックアクセス
     */
    getRepository(): TweetRepository { return this.repository; }
    
    /**
     * UI強制更新（DOM完全クリア＆再構築）
     */
    public forceUpdateUI(): void {
        console.log('[TweetWidget] UI強制更新開始');
        
        try {
            // 更新前のDOM状態をログ出力
            console.log('[TweetWidget] 更新前DOM状態:', {
                hasWidgetEl: !!this.widgetEl,
                innerHTML: this.widgetEl?.innerHTML?.substring(0, 200) || 'empty',
                childrenCount: this.widgetEl?.children?.length || 0,
                posts: this.store.settings.posts.length,
                currentData: {
                    posts: this.store.settings.posts.slice(0, 3).map((p: any) => ({ id: p.id, text: p.text.substring(0, 30) }))
                }
            });
            
            // より強力なDOM再作成: 要素自体を破棄して再作成
            if (this.widgetEl) {
                const parentEl = this.widgetEl.parentElement;
                const oldClasses = Array.from(this.widgetEl.classList);
                const oldStyles = this.widgetEl.getAttribute('style') || '';
                
                if (parentEl) {
                    // 新しいDOM要素を作成
                    const newWidgetEl = parentEl.createDiv();
                    
                    // 古い要素のクラスとスタイルを復元
                    oldClasses.forEach(cls => newWidgetEl.classList.add(cls));
                    if (oldStyles) {
                        newWidgetEl.setAttribute('style', oldStyles);
                    }
                    
                    // 古い要素を削除して新しい要素に置き換え
                    this.widgetEl.remove();
                    this.widgetEl = newWidgetEl;
                    
                    console.log('[TweetWidget] ウィジェット要素完全再作成完了');
                } else {
                    // 親要素がない場合は通常のクリア
                    this.widgetEl.innerHTML = '';
                    this.widgetEl.classList.remove('tweet-widget-loading');
                    console.log('[TweetWidget] DOM要素通常クリア完了');
                }
            }
            
            // UI状態を完全リセット
            this.editingPostId = null;
            this.replyingToParentId = null;
            this.detailPostId = null;
            this.replyModalPost = null;
            this.retweetModalPost = null;
            this.retweetListPost = null;
            this.attachedFiles = [];
            
            // UIインスタンスを再作成
            this.ui = new TweetWidgetUI(this, this.widgetEl);
            console.log('[TweetWidget] UIインスタンス再作成完了');
            
            // データ再計算
            this.recalculateQuoteCounts();
            
            // 強制レンダリング
            console.log('[TweetWidget] レンダリング前データ確認:', {
                postsInStore: this.store.settings.posts.length,
                postsById: this.postsById.size,
                samplePosts: this.store.settings.posts.slice(0, 2).map((p: any) => ({ id: p.id, text: p.text.substring(0, 20) }))
            });
            
            this.ui.render();
            console.log('[TweetWidget] 強制レンダリング完了');
            
            // レンダリング後のDOM状態を確認
            setTimeout(() => {
                console.log('[TweetWidget] レンダリング後DOM状態:', {
                    innerHTML: this.widgetEl?.innerHTML?.substring(0, 200) || 'empty',
                    childrenCount: this.widgetEl?.children?.length || 0,
                    hasPostList: !!this.widgetEl?.querySelector('.tweet-list-main'),
                    hasPosts: !!this.widgetEl?.querySelector('.tweet-post'),
                    firstPostText: this.widgetEl?.querySelector('.tweet-post .tweet-content')?.textContent?.substring(0, 30) || 'none'
                });
            }, 10);
            
            // 少し待ってからもう一度レンダリング
            setTimeout(() => {
                console.log('[TweetWidget] 遅延レンダリング実行');
                this.ui.render();
                
                // 再度DOM確認
                setTimeout(() => {
                    console.log('[TweetWidget] 遅延レンダリング後DOM状態:', {
                        innerHTML: this.widgetEl?.innerHTML?.substring(0, 200) || 'empty',
                        childrenCount: this.widgetEl?.children?.length || 0,
                        postsVisible: this.widgetEl?.querySelectorAll('.tweet-post')?.length || 0
                    });
                }, 10);
            }, 50);
            
            // さらにもう一度（念のため）
            setTimeout(() => {
                console.log('[TweetWidget] 追加遅延レンダリング実行');
                this.ui.render();
                
                // 最終確認
                setTimeout(() => {
                    console.log('[TweetWidget] 最終DOM状態:', {
                        innerHTML: this.widgetEl?.innerHTML?.substring(0, 200) || 'empty',
                        childrenCount: this.widgetEl?.children?.length || 0,
                        postsVisible: this.widgetEl?.querySelectorAll('.tweet-post')?.length || 0,
                        dataStatus: {
                            postsInStore: this.store.settings.posts.length,
                            postsById: this.postsById.size
                        }
                    });
                }, 10);
            }, 200);
            
            console.log('[TweetWidget] UI強制更新完了');
            
        } catch (error) {
            console.error('[TweetWidget] UI強制更新エラー:', error);
            // フォールバック: 通常のレンダリング
            this.ui?.render();
        }
    }

    /**
     * データを再読み込み（履歴復元後など）
     */
    public async reloadTweetData(): Promise<void> {
        try {
            console.log('[TweetWidget] データ再読み込み開始 - tweets.jsonから読み込み');
            
            // tweets.jsonから直接データを読み込み
            const settings = await this.repository.load(this.plugin.settings.language || 'ja');
            
            console.log('[TweetWidget] データ読み込み完了:', {
                posts: settings.posts?.length || 0,
                scheduledPosts: settings.scheduledPosts?.length || 0
            });
            
            // ストアを完全に新しいデータで更新
            this.store.replaceAllData(settings);
            
            // UI強制更新（DOM完全クリア＆再構築）
            this.forceUpdateUI();
            
            console.log('[TweetWidget] データ再読み込み完了');
            
        } catch (error) {
            console.error('[TweetWidget] データ再読み込みエラー:', error);
            // エラーの場合は通常のロードにフォールバック
            const settings = await this.repository.load(this.plugin.settings.language || 'ja');
            this.store.replaceAllData(settings);
            this.forceUpdateUI();
        }
    }

    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin, preloadBundle?: unknown): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;
        const { widgetEl } = createWidgetContainer(config, 'tweet-widget', false);
        this.widgetEl = widgetEl;

        // 追加: YAMLで大きさ指定があれば反映
        applyWidgetSize(this.widgetEl, config.settings as { width?: string, height?: string } | null);

        // デフォルト期間をsettingsから反映
        this.currentPeriod = this.plugin.settings.defaultTweetPeriod || 'all';
        this.customPeriodDays = this.plugin.settings.defaultTweetCustomDays || 1;

        // jsdom の innerText は textContent を更新しないため textContent を使用する
        this.widgetEl.textContent = 'Loading...';
        this.initialize();

        this.widgetEl.addEventListener('keydown', this.handleKeyDown);

        // 初期化中は空のUIを返す
        return this.widgetEl;
    }

    private async initialize() {
        const dbPath = this.getTweetDbPath();
        this.repository = new TweetRepository(this.app, dbPath);
        
        // tweets.jsonからデータを読み込み
        const initialSettings = await this.repository.load(this.plugin.settings.language || 'ja');
        
        this.store = new TweetStore(initialSettings);
        
        // データ変更リスナーを追加（自動保存・バックアップ）
        const dataChangeListener: TweetStoreListener = (eventType, data?: TweetStoreEventData) => {
            console.log(`[TweetWidget] データ変更イベント: ${eventType}`, data);
            
            if (data?.needsBackup) {
                // 重要な変更（作成、削除、重要な更新）は即座に差分バックアップ
                console.log(`[TweetWidget] 重要変更検出 - 即座にバックアップ: ${data.reason}`);
                this.saveDataImmediately(data.reason);
            } else {
                // 軽微な変更は通常の遅延保存
                console.log(`[TweetWidget] 軽微変更 - 遅延保存: ${data?.reason || 'unknown'}`);
                this.saveDataDebounced();
            }
        };
        this.store.addListener(dataChangeListener);
        
        this.scheduler = new TweetScheduler();
        this.recalculateQuoteCounts();
        this.ui = new TweetWidgetUI(this, this.widgetEl);
        this.ui.render();
        this.startScheduleLoop();
    }

    private handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            let stateChanged = false;
            if (this.editingPostId) {
                this.editingPostId = null;
                stateChanged = true;
            }
            if (this.detailPostId) {
                this.detailPostId = null;
                stateChanged = true;
            }

            if (stateChanged) {
                this.ui.render();
                event.stopPropagation();
            }
        }
    }

    private saveDataDebounced() {
        console.log('[TweetWidget] saveDataDebounced() 実行 - タイマー設定中');
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = window.setTimeout(async () => {
            // update path in case settings changed while widget is open
            this.repository.setPath(this.getTweetDbPath());
            try {
                console.log('[TweetWidget] tweets.jsonデータ保存開始');
                await this.repository.save(this.store.settings, this.plugin.settings.language || 'ja');
                console.log('[TweetWidget] tweets.jsonデータ保存完了 - バックアップも自動作成済み');
            } catch (error) {
                console.error('[TweetWidget] データ保存エラー:', error);
            }
            this.saveTimeout = null;
        }, 500);
    }

    /**
     * 重要な変更の場合に即座にデータ保存とバックアップを実行
     */
    private async saveDataImmediately(reason: string = '重要変更') {
        console.log(`[TweetWidget] saveDataImmediately() 実行 - 理由: ${reason}`);
        
        // 既存のタイマーをキャンセル
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        
        // パスを更新
        this.repository.setPath(this.getTweetDbPath());
        
        try {
            console.log(`[TweetWidget] tweets.json即座保存開始 - ${reason}`);
            await this.repository.save(this.store.settings, this.plugin.settings.language || 'ja', reason);
            console.log(`[TweetWidget] tweets.json即座保存完了 - 差分バックアップも自動作成済み`);
        } catch (error) {
            console.error(`[TweetWidget] 即座データ保存エラー (${reason}):`, error);
        }
    }
    
    public async switchTab(tab: 'home' | 'notification') {
        this.currentTab = tab;
        this.detailPostId = null;
        this.ui.render();
    }

    public navigateToDetail(postId: string | null) {
        const wasInDetail = this.detailPostId !== null;
        this.detailPostId = postId;
        this.currentTab = 'home';
        // 詳細表示から戻る場合はパネルスクロールをリセットしない
        this.ui.resetScroll(wasInDetail && postId === null);
        this.ui.render();
    }
    
    public setFilter(filter: 'all' | 'active' | 'deleted' | 'bookmark') {
        this.currentFilter = filter;
        this.detailPostId = null;
        this.ui.resetScroll();
        this.ui.render();
    }

    public async submitPost(text: string) {
        console.log('[TweetWidget] 投稿処理開始:', text.substring(0, 50));
        
        const trimmedText = text.trim();
        if (!trimmedText && this.attachedFiles.length === 0) return;

        if (this.editingPostId) {
            console.log('[TweetWidget] 投稿編集処理:', this.editingPostId);
            this.store.updatePost(this.editingPostId, {
                text: trimmedText,
                files: this.attachedFiles,
                edited: true,
                tags: parseTags(trimmedText),
                links: parseLinks(trimmedText),
            });
            new Notice(t(this.plugin.settings.language || 'ja', 'tweetEdited'));
        } else {
            console.log('[TweetWidget] 新規投稿作成処理');
            const newPost = this.createNewPostObject(trimmedText);
            console.log('[TweetWidget] 新規投稿データ:', { id: newPost.id, text: newPost.text.substring(0, 50) });
            this.store.addPost(newPost);
            this.plugin.updateTweetPostCount(newPost.created, 1);
            new Notice(this.replyingToParentId ? t(this.plugin.settings.language || 'ja', 'replyPosted') : t(this.plugin.settings.language || 'ja', 'tweetPosted'));
            this.triggerAiReply(newPost);
        }

        this.resetInputState();
        console.log('[TweetWidget] saveDataDebounced() 呼び出し前');
        this.saveDataDebounced();
        console.log('[TweetWidget] saveDataDebounced() 呼び出し完了');
        this.ui.render();
        console.log('[TweetWidget] 投稿処理完了');
    }

    public async submitReply(text: string, parentId: string) {
        const trimmedText = text.trim();
        if(!trimmedText) return;
        
        const newPost = this.createNewPostObject(trimmedText, parentId);
        this.store.addPost(newPost);
        this.plugin.updateTweetPostCount(newPost.created, 1);
        new Notice(t(this.plugin.settings.language || 'ja', 'replyPosted'));
        
        this.triggerAiReply(newPost);
        this.saveDataDebounced();
        this.ui.render();
    }

    public async submitRetweet(text: string, target: TweetWidgetPost) {
        const trimmedText = text.trim();
        const newPost = this.createNewPostObject(trimmedText, null, target.id);
        this.store.addPost(newPost);
        this.plugin.updateTweetPostCount(newPost.created, 1);
        const count = this.getQuoteCount(target.id);
        this.store.updatePost(target.id, {
            retweet: count,
            retweeted: true,
        });
        new Notice(t(this.plugin.settings.language || 'ja', 'quotePosted'));
        this.saveDataDebounced();
        this.ui.render();
    }

    public getQuoteCount(postId: string): number {
        return this.store.getQuotePosts(postId).length;
    }

    private recalculateQuoteCounts() {
        this.store.settings.posts.forEach(p => {
            p.retweet = this.getQuoteCount(p.id);
        });
    }
    
    private createNewPostObject(text: string, threadId: string | null = this.replyingToParentId, quoteId: string | null = null): TweetWidgetPost {
        // グローバル設定のuserProfilesから'@you'ユーザーを取得
        const selfProfile = this.plugin.settings.userProfiles?.find(p => p.userId === '@you');
        return {
            id: 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            text,
            created: Date.now(),
            updated: Date.now(),
            files: this.attachedFiles,
            like: 0,
            liked: false,
            retweet: 0,
            retweeted: false,
            replyCount: 0,
            deleted: false,
            bookmark: false,
            threadId: threadId,
            quoteId,
            visibility: 'public',
            noteQuality: 'fleeting',
            taskStatus: null,
            tags: parseTags(text),
            links: parseLinks(text),
            userId: selfProfile?.userId || this.store.settings.userId || '@you',
            userName: selfProfile?.userName || this.store.settings.userName || t(this.plugin.settings.language || 'ja', 'defaultUserName'),
            avatarUrl: selfProfile?.avatarUrl || this.store.settings.avatarUrl || '',
            verified: this.store.settings.verified,
        };
    }

    private triggerAiReply(post: TweetWidgetPost) {
        if (post.userId?.startsWith('@ai-')) return;

        // 1. Storeから現在のガバナンスデータを取得 (なければ初期値)
        const currentGovernance = this.store.settings.aiGovernance || { minuteMap: {}, dayMap: {} };

        // 2. shouldAutoReply を呼び出し、結果と更新されたガバナンスデータを取得
        const { allow, updatedGovernanceData } = shouldAutoReply(
            post,
            this.plugin.settings, // PluginGlobalSettingsを渡す
            currentGovernance
        );

        // 3. 許可された場合のみAIリプライを生成し、storeを更新
        if (allow) {
            this.store.settings.aiGovernance = updatedGovernanceData; // storeのデータを更新
            generateAiReply({
                tweet: post,
                allTweets: this.store.settings.posts,
                llmGemini: this.plugin.settings.llm?.gemini || { apiKey: '', model: '' },
                saveReply: async (reply: TweetWidgetPost) => {
                    this.store.addPost(reply);
                    this.saveDataDebounced();
                    this.ui.render();
                },
                parseTags: parseTags,
                parseLinks: parseLinks,
                settings: this.plugin.settings,
                onError: (err) => {
                    console.error('AI reply error', err);
                    new Notice(t(this.plugin.settings.language || 'ja', 'error.aiReplyFailed'));
                },
                delay: !isExplicitAiTrigger(post),
                plugin: this.plugin,
            });
        }
    }
    
    private resetInputState() {
        this.attachedFiles = [];
        this.editingPostId = null;
        this.replyingToParentId = null;
    }

    public startEdit(post: TweetWidgetPost) {
        this.editingPostId = post.id;
        this.replyingToParentId = null;
        this.attachedFiles = post.files ? [...post.files] : [];
        this.ui.render();
        
        requestAnimationFrame(() => {
            const input = this.widgetEl.querySelector('.tweet-textarea-main') as HTMLTextAreaElement;
            if (input) {
                input.value = post.text;
                input.focus();
                input.selectionStart = input.selectionEnd = input.value.length;
                this.ui.renderFilePreview(this.widgetEl.querySelector('.tweet-file-preview')!);
            }
        });
    }
    
    public startReply(post: TweetWidgetPost) {
        this.replyModalPost = post;
        this.retweetModalPost = null;
        this.retweetListPost = null;
        this.editingPostId = null;
        this.replyingToParentId = null;
        this.ui.render();
    }

    public cancelReply() {
        this.replyingToParentId = null;
        this.ui.render();
    }

    public startRetweet(post: TweetWidgetPost) {
        this.retweetModalPost = post;
        this.replyModalPost = null;
        this.retweetListPost = null;
        this.editingPostId = null;
        this.replyingToParentId = null;
        this.ui.render();
    }

    public cancelRetweet() {
        this.retweetModalPost = null;
        this.ui.render();
    }

    public openRetweetList(post: TweetWidgetPost) {
        this.retweetListPost = post;
        this.replyModalPost = null;
        this.retweetModalPost = null;
        this.editingPostId = null;
        this.replyingToParentId = null;
        this.ui.render();
    }

    public closeRetweetList() {
        this.retweetListPost = null;
        this.ui.render();
    }

    public async toggleLike(postId: string) {
        const post = this.store.getPostById(postId);
        if (post) {
            this.store.updatePost(postId, { liked: !post.liked, like: (post.like || 0) + (post.liked ? -1 : 1) });
            this.saveDataDebounced();
            this.ui.render();
        }
    }

    public async toggleRetweet(postId: string) {
        const post = this.store.getPostById(postId);
        if (post) {
            this.store.updatePost(postId, { retweeted: !post.retweeted, retweet: (post.retweet || 0) + (post.retweeted ? -1 : 1) });
            this.saveDataDebounced();
            this.ui.render();
        }
    }
    
    public async toggleBookmark(postId: string) {
        const post = this.store.getPostById(postId);
        if (post) {
            this.store.updatePost(postId, { bookmark: !post.bookmark });
            this.saveDataDebounced();
            this.ui.render();
        }
    }

    public async setPostDeleted(postId: string, deleted: boolean) {
        const post = this.store.getPostById(postId);
        if (post && post.deleted !== deleted) {
            this.plugin.updateTweetPostCount(post.created, deleted ? -1 : 1);
        }
        this.store.updatePost(postId, { deleted });
        if (deleted && this.detailPostId === postId) {
            this.detailPostId = post?.threadId ?? null;
        }
        this.saveDataDebounced();
        this.ui.scheduleRender();
    }

    public async deletePost(postId: string) {
        const post = this.store.getPostById(postId);
        this.store.deletePost(postId);
        if (post && !post.deleted) {
            this.plugin.updateTweetPostCount(post.created, -1);
        }
        if (this.detailPostId === postId) {
            this.detailPostId = post?.threadId ?? null;
        }
        this.saveDataDebounced();
        this.ui.render();
    }

    public async deleteThread(rootId: string) {
        const threadIds = this.store.collectThreadIds(rootId);
        const posts = threadIds.map(id => this.store.getPostById(id)).filter(Boolean) as TweetWidgetPost[];
        const rootPost = this.store.getPostById(rootId);
        this.store.deleteThread(rootId);
        for (const p of posts) {
            if (!p.deleted) this.plugin.updateTweetPostCount(p.created, -1);
        }
        if (threadIds.includes(this.detailPostId ?? '')) {
            this.detailPostId = rootPost?.threadId ?? null;
        }
        this.saveDataDebounced();
        this.ui.render();
    }

    public async updatePostProperty<K extends keyof TweetWidgetPost>(postId: string, key: K, value: TweetWidgetPost[K]) {
        const post = this.store.getPostById(postId);
        if(post && post[key] !== value) {
            if (key === 'deleted') {
                this.plugin.updateTweetPostCount(post.created, value ? -1 : 1);
            }
            this.store.updatePost(postId, { [key]: value });
            this.saveDataDebounced();
            this.ui.scheduleRender();
        }
    }

    public async openContextNote(post: TweetWidgetPost) {
        let notePath = post.contextNote;
        if (!notePath) {
            const date = new Date(post.created).toISOString().split('T')[0];
            const sanitizedText = post.text.slice(0, 30).replace(/[\\/:*?"<>|#[\]]/g, '').trim();
            const contextFolder = this.plugin.settings.baseFolder ? `${this.plugin.settings.baseFolder}/ContextNotes` : 'ContextNotes';
            
            if (!this.app.vault.getAbstractFileByPath(contextFolder)) {
                try {
                    await this.app.vault.createFolder(contextFolder);
                } catch (error) {
                    // フォルダ作成失敗の場合、他のプロセスが先に作成した可能性がある
                    if (error instanceof Error && error.message.includes('already exists')) {
                        console.warn(`Context folder was created by another process: ${contextFolder}`);
                    } else {
                        throw error;
                    }
                }
            }
            notePath = `${contextFolder}/${date}-${sanitizedText || 'note'}.md`;
            await this.updatePostProperty(post.id, 'contextNote', notePath);
        }

        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (file instanceof TFile) {
            this.app.workspace.getLeaf(true).openFile(file);
        } else {
            if (!file) {
                try {
                    await this.app.vault.create(notePath, `> ${post.text}\n\n---\n\n`);
                    const newFile = this.app.vault.getAbstractFileByPath(notePath);
                    if (newFile instanceof TFile) {
                        this.app.workspace.getLeaf(true).openFile(newFile);
                    }
                } catch (error) {
                    console.error('Error creating context note:', error);
                    new Notice('コンテキストノートの作成に失敗しました。詳細はコンソールを確認してください。');
                }
            } else {
                new Notice("Context note not found!");
            }
        }
    }
    
    public async generateGeminiReply(post: TweetWidgetPost) {
        try {
            const thread = getFullThreadHistory(post, this.store.settings.posts);
            const threadText = thread.map(t => `${t.userName || t.userId}: ${t.text}`).join('\n');
            // スレッドの最後の投稿の投稿日時を取得
            const lastPost = thread[thread.length - 1];
            const date = new Date(lastPost.created);
            const dateStr = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日 ${date.getHours()}時${pad2(date.getMinutes())}分`;
            // 時間帯ラベルを判定
            function getTimeZoneLabel(date: Date): string {
                const hour = date.getHours();
                if (hour >= 0 && hour < 3) return "未明";
                if (hour >= 3 && hour < 6) return "明け方";
                if (hour >= 6 && hour < 9) return "朝";
                if (hour >= 9 && hour < 12) return "昼前";
                if (hour >= 12 && hour < 15) return "昼過ぎ";
                if (hour >= 15 && hour < 18) return "夕方";
                if (hour >= 18 && hour < 21) return "夜のはじめ頃";
                if (hour >= 21 && hour < 24) return "夜遅く";
                return "";
            }
            const timeZoneLabel = getTimeZoneLabel(date);
            const dateWithZone = `${dateStr}（この時間帯は「${timeZoneLabel}」です）`;
            // プロンプトに投稿日時＋時間帯を埋め込む
            const customPrompt = this.plugin.settings.userTweetPrompt && this.plugin.settings.userTweetPrompt.trim() ? this.plugin.settings.userTweetPrompt : geminiPrompt;
            const promptText = customPrompt.replace('{postDate}', dateWithZone).replace('{tweet}', threadText);

            // ここでプロンプトをコンソール出力
            debugLog(this.plugin, '[Gemini Prompt]', promptText);
            debugLog(this.plugin, 'Gemini送信context:', {
                model: this.plugin.settings.tweetAiModel || this.plugin.settings.llm!.gemini!.model,
            });

            let replyText = await GeminiProvider.generateReply(promptText, {
                plugin: this.plugin,
                apiKey: deobfuscate(this.plugin.settings.llm?.gemini?.apiKey || ''),
                model: this.plugin.settings.tweetAiModel || this.plugin.settings.llm?.gemini?.model,
                postText: threadText, post, thread
            });
            debugLog(this.plugin, 'Gemini生成結果:', replyText);

            try {
                const parsed = JSON.parse(replyText);
                if (parsed?.reply) replyText = parsed.reply;
            } catch { /* ignore parse errors */ }

            const aiUserId = findLatestAiUserIdInThread(post, this.store.settings.posts) || generateAiUserId();
            const aiReply = this.createNewPostObject(replyText, post.id);
            aiReply.userId = aiUserId;
            aiReply.userName = 'AI';
            aiReply.verified = true;
            
            this.store.addPost(aiReply);
            this.saveDataDebounced();
            this.ui.render();
        } catch (err) {
            new Notice('Geminiリプライ生成失敗: ' + (err instanceof Error ? err.message : String(err)));
            this.ui.render(); // ボタンの無効状態を解除するために再描画
        }
    }

    public formatTimeAgo = formatTimeAgo;
    public wrapSelection = wrapSelection;
    
    public async attachFiles(files: File[]) {
        const tweetDbPath = this.getTweetDbPath();
        const baseDir = tweetDbPath.lastIndexOf('/') !== -1 ? tweetDbPath.substring(0, tweetDbPath.lastIndexOf('/')) : '';
        const imagesDir = baseDir ? `${baseDir}/tweet-widget-files` : 'tweet-widget-files';
        if (!this.app.vault.getAbstractFileByPath(imagesDir)) {
            try {
                await this.app.vault.createFolder(imagesDir);
            } catch (error) {
                // フォルダ作成失敗の場合、他のプロセスが先に作成した可能性がある
                if (error instanceof Error && error.message.includes('already exists')) {
                    console.warn(`Images folder was created by another process: ${imagesDir}`);
                } else {
                    throw error;
                }
            }
        }
        let insertedLinks: string[] = [];
        for (const file of files) {
            try {
                const dataUrl = await readFileAsDataUrl(file);
                const ext = file.name.split('.').pop() || 'png';
                const uniqueName = `img_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
                const vaultPath = imagesDir + '/' + uniqueName;
                const base64 = dataUrl.split(',')[1];
                const bin = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                
                // ファイルが既に存在する場合はスキップ
                if (this.app.vault.getAbstractFileByPath(vaultPath)) {
                    console.warn(`File already exists, skipping: ${vaultPath}`);
                    continue;
                }
                
                await this.app.vault.createBinary(vaultPath, bin);
                // Vaultファイルを取得し、getResourcePathでURLを取得
                const vaultFile = this.app.vault.getFileByPath(vaultPath);
                let url = '';
                if (vaultFile) {
                    url = this.app.vault.getResourcePath(vaultFile);
                }
                this.attachedFiles.push({ name: uniqueName, type: file.type, dataUrl: url });
                insertedLinks.push(`![[tweet-widget-files/${uniqueName}]]`);
            } catch (error) {
                console.error('Error attaching file:', error);
                new Notice(`ファイル ${file.name} の添付に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        // 本文テキストエリアに![[ファイル名]]を自動挿入
        const selectors = ['.tweet-textarea-main', '.tweet-reply-modal-textarea', '.tweet-detail-reply-textarea', '.tweet-edit-modal-textarea'];
        const inputs = Array.from(document.querySelectorAll<HTMLTextAreaElement>(selectors.join(',')));
        for (const input of inputs) {
            if (insertedLinks.length > 0) {
                const sep = input.value && !input.value.endsWith('\n') ? '\n' : '';
                input.value = input.value + sep + insertedLinks.join('\n');
                input.dispatchEvent(new Event('input'));
            }
        }
    }

    public getFilteredPosts(): TweetWidgetPost[] {
        console.log('[TweetWidget] getFilteredPosts() 開始');
        console.log('[TweetWidget] store.settings.posts:', {
            total: this.store.settings.posts.length,
            samples: this.store.settings.posts.slice(0, 3).map(p => ({
                id: p.id,
                text: p.text.substring(0, 30),
                deleted: p.deleted,
                bookmark: p.bookmark
            }))
        });
        
        let posts = this.store.settings.posts;
        console.log('[TweetWidget] currentFilter:', this.currentFilter);
        
        switch (this.currentFilter) {
            case 'all': 
                console.log('[TweetWidget] フィルター: all (全件)');
                break;
            case 'deleted': 
                posts = posts.filter(t => t.deleted); 
                console.log('[TweetWidget] フィルター: deleted (' + posts.length + '件)');
                break;
            case 'bookmark': 
                posts = posts.filter(t => t.bookmark); 
                console.log('[TweetWidget] フィルター: bookmark (' + posts.length + '件)');
                break;
            case 'active':
            default:
                posts = posts.filter(t => !t.deleted);
                console.log('[TweetWidget] フィルター: active (削除されていない', posts.length + '件)');
        }
        if (this.currentPeriod && this.currentPeriod !== 'all') {
            const now = Date.now();
            let ms = 0;
            if (this.currentPeriod === 'today') {
                // ローカルタイムで今日の日付
                const today = new Date();
                const todayStr = getDateKeyLocal(today);
                posts = posts.filter(p => {
                    const dateStr = getDateKeyLocal(new Date(p.created));
                    return dateStr === todayStr;
                });
            } else if (this.currentPeriod === 'custom') {
                ms = (this.customPeriodDays || 1) * 86400000;
            } else {
                ms = {
                    '1d': 86400000,
                    '3d': 3 * 86400000,
                    '7d': 7 * 86400000,
                    '30d': 30 * 86400000
                }[this.currentPeriod] || 0;
            }
            if (ms > 0 && this.currentPeriod !== 'today') posts = posts.filter(p => now - p.created < ms);
        }
        
        console.log('[TweetWidget] getFilteredPosts() 最終結果:', {
            finalCount: posts.length,
            finalSamples: posts.slice(0, 3).map(p => ({
                id: p.id,
                text: p.text.substring(0, 30),
                created: new Date(p.created).toLocaleString()
            }))
        });
        
        return posts;
    }
    
    public getAvatarUrl(post?: TweetWidgetPost): string {
        let url = '';
        const user = post || this.store.settings;
        if (user.userId && user.userId.startsWith('@ai-')) {
            const aiAvatars = (this.plugin.settings.aiAvatarUrls || '').split(',').map(s => s.trim()).filter(Boolean);
            if (aiAvatars.length > 0) {
                const idx = this.getAiAvatarIndex(user.userId, aiAvatars.length);
                url = aiAvatars[idx];
            }
        } else if (user.avatarUrl && user.avatarUrl.trim() !== '') {
            url = user.avatarUrl;
        } else if (user.userId) {
            // userIdが指定されている場合はグローバル設定から取得
            const profile = this.plugin.settings.userProfiles?.find(p => p.userId === user.userId);
            url = profile?.avatarUrl || this.plugin.settings.tweetWidgetAvatarUrl || this.store.settings.avatarUrl || '';
        } else {
            url = this.plugin.settings.tweetWidgetAvatarUrl || this.store.settings.avatarUrl || '';
        }
        return url.trim() || 'https://www.gravatar.com/avatar/?d=mp&s=64';
    }
    
    public getAvatarUrlForPostInput(): string {
        if (this.replyingToParentId) {
            const parentPost = this.store.getPostById(this.replyingToParentId);
            if (parentPost) return this.getAvatarUrl(parentPost);
        }
        return this.getAvatarUrl();
    }

    private getTweetDbPath(): string {
        const { baseFolder } = this.plugin.settings;
        if (baseFolder) {
            const folder = baseFolder.endsWith('/') ? baseFolder.slice(0, -1) : baseFolder;
            return `${folder}/tweets.json`;
        }
        // デフォルト: Vault直下
        return 'tweets.json';
    }

    private getAiAvatarIndex(userId: string, len: number): number {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash) % len;
    }

    public setPeriod(period: string) {
        this.currentPeriod = period;
        this.ui.render();
    }

    public setCustomPeriodDays(days: number) {
        this.customPeriodDays = days;
        this.ui.render();
    }

    onunload(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        this.widgetEl.removeEventListener('keydown', this.handleKeyDown);
        if (this.ui && typeof this.ui.onunload === 'function') {
            this.ui.onunload();
        }
    }

    private startScheduleLoop() {
        this.scheduler.startScheduleLoop(() => this.checkScheduledPosts());
    }

    private async checkScheduledPosts() {
        const executed = await this.scheduler.checkScheduledPosts(
            this.store.settings,
            this.plugin.settings.language || 'ja',
            (post: TweetWidgetPost) => {
                this.store.addPost(post);
                this.recalculateQuoteCounts();
            },
            (timestamp: number, count: number) => this.plugin.updateTweetPostCount(timestamp, count),
            (post: TweetWidgetPost) => this.triggerAiReply(post),
            this.plugin
        );

        if (executed) {
            this.ui.render();
        }
    }

    public schedulePost(text: string, opts: ScheduleOptions & {userId?: string; userName?: string}) {
        this.scheduler.schedulePost(text, opts, this.store.settings);
        // saveDataDebouncedはObserverで自動実行
    }
}