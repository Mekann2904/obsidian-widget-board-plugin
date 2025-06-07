import { App, Notice, TFile } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main';
import { GeminiProvider } from '../../llm/gemini/geminiApi';
import { deobfuscate } from '../../utils';
import { geminiPrompt } from '../../llm/gemini/tweetReplyPrompt';
import { debugLog } from '../../utils/logger';
import { applyWidgetSize, createWidgetContainer } from '../../utils';

// --- 分離したモジュールをインポート ---
import type { TweetWidgetFile, TweetWidgetPost, TweetWidgetSettings } from './types';
import { MAX_TWEET_LENGTH } from './constants';
import { generateAiReply, shouldAutoReply, findLatestAiUserIdInThread, getFullThreadHistory, generateAiUserId, isExplicitAiTrigger } from './aiReply';
import { parseTags, parseLinks, formatTimeAgo, readFileAsDataUrl, wrapSelection } from './tweetWidgetUtils';

import { TweetWidgetUI } from './tweetWidgetUI';
import { TweetRepository } from './TweetRepository';
import { TweetStore } from './TweetStore';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from './constants';
import { saveChartCache } from '../reflectionWidget/chartCache';

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
    private saveTimeout: number | null = null;

    /**
     * Getters to provide store data to the UI layer
     */
    get currentSettings(): TweetWidgetSettings { return this.store.settings; }
    get postsById(): Map<string, TweetWidgetPost> { return this.store.postsById; }

    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;
        const { widgetEl } = createWidgetContainer(config, 'tweet-widget', false);
        this.widgetEl = widgetEl;

        // 追加: YAMLで大きさ指定があれば反映
        applyWidgetSize(this.widgetEl, config.settings);

        // デフォルト期間をsettingsから反映
        this.currentPeriod = this.plugin.settings.defaultTweetPeriod || 'all';
        this.customPeriodDays = this.plugin.settings.defaultTweetCustomDays || 1;

        const dbPath = this.getTweetDbPath();
        this.repository = new TweetRepository(this.app, dbPath);

        // 非同期初期化は副作用として行い、UIは一旦ローディング表示
        // jsdom の innerText は textContent を更新しないため textContent を使用する
        this.widgetEl.textContent = 'Loading...';
        this.repository.load().then(initialSettings => {
            this.store = new TweetStore(initialSettings);
            this.recalculateQuoteCounts();
            this.ui = new TweetWidgetUI(this, this.widgetEl);
            this.ui.render();
        });

        // 初期化中は空のUIを返す
        return this.widgetEl;
    }

    private saveDataDebounced() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = window.setTimeout(async () => {
            // update path in case settings changed while widget is open
            this.repository.setPath(this.getTweetDbPath());
            await this.repository.save(this.store.settings);
            try {
                await saveChartCache(this.app, this.store.settings.posts);
            } catch {}
            this.saveTimeout = null;
        }, 500);
    }
    
    public async switchTab(tab: 'home' | 'notification') {
        this.currentTab = tab;
        this.detailPostId = null;
        this.ui.render();
    }

    public navigateToDetail(postId: string | null) {
        this.detailPostId = postId;
        this.currentTab = 'home';
        this.ui.render();
    }
    
    public setFilter(filter: 'all' | 'active' | 'deleted' | 'bookmark') {
        this.currentFilter = filter;
        this.detailPostId = null;
        this.ui.render();
    }

    public async submitPost(text: string) {
        const trimmedText = text.trim();
        if (!trimmedText && this.attachedFiles.length === 0) return;

        if (this.editingPostId) {
            this.store.updatePost(this.editingPostId, {
                text: trimmedText,
                files: this.attachedFiles,
                edited: true,
                tags: parseTags(trimmedText),
                links: parseLinks(trimmedText),
            });
            new Notice('つぶやきを編集しました');
        } else {
            const newPost = this.createNewPostObject(trimmedText);
            this.store.addPost(newPost);
            new Notice(this.replyingToParentId ? '返信を投稿しました' : 'つぶやきを投稿しました');
            this.triggerAiReply(newPost);
        }

        this.resetInputState();
        this.saveDataDebounced();
        this.ui.render();
    }

    public async submitReply(text: string, parentId: string) {
        const trimmedText = text.trim();
        if(!trimmedText) return;
        
        const newPost = this.createNewPostObject(trimmedText, parentId);
        this.store.addPost(newPost);
        new Notice('返信を投稿しました');
        
        this.triggerAiReply(newPost);
        this.saveDataDebounced();
        this.ui.render();
    }

    public async submitRetweet(text: string, target: TweetWidgetPost) {
        const trimmedText = text.trim();
        const newPost = this.createNewPostObject(trimmedText, null, target.id);
        this.store.addPost(newPost);
        const count = this.getQuoteCount(target.id);
        this.store.updatePost(target.id, {
            retweet: count,
            retweeted: true,
        });
        new Notice('引用リツイートを投稿しました');
        this.saveDataDebounced();
        this.ui.render();
    }

    public getQuoteCount(postId: string): number {
        return this.store.settings.posts.filter(p => p.quoteId === postId).length;
    }

    private recalculateQuoteCounts() {
        this.store.settings.posts.forEach(p => {
            p.retweet = this.getQuoteCount(p.id);
        });
    }
    
    private createNewPostObject(text: string, threadId: string | null = this.replyingToParentId, quoteId: string | null = null): TweetWidgetPost {
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
            userId: this.store.settings.userId || '@you',
            userName: this.store.settings.userName || 'あなた',
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

        // 3. ガバナンスデータをStoreに保存 (更新があった場合)
        if (JSON.stringify(currentGovernance) !== JSON.stringify(updatedGovernanceData)) {
            this.store.settings.aiGovernance = updatedGovernanceData;
            // 必要に応じて this.saveDataDebounced();
        }

        if (allow) {
            generateAiReply({
                tweet: post,
                allTweets: this.store.settings.posts,
                llmGemini: this.plugin.settings.llm?.gemini || { apiKey: '', model: 'gemini-1.5-flash-latest' },
                saveReply: async (reply) => {
                    this.store.addPost(reply);
                    this.saveDataDebounced();
                    this.ui.render();
                },
                parseTags,
                parseLinks,
                onError: (err) => new Notice('AI自動リプライ生成に失敗: ' + (err instanceof Error ? err.message : String(err))),
                settings: this.plugin.settings,
                delay: !isExplicitAiTrigger(post),
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
        this.store.updatePost(postId, { deleted });
        this.saveDataDebounced();
        this.ui.scheduleRender();
    }

    public async deletePost(postId: string) {
        this.store.deletePost(postId);
        this.saveDataDebounced();
        this.ui.render();
    }

    public async deleteThread(rootId: string) {
        this.store.deleteThread(rootId);
        this.detailPostId = null;
        this.saveDataDebounced();
        this.ui.render();
    }

    public async updatePostProperty(postId: string, key: keyof TweetWidgetPost, value: any) {
        const post = this.store.getPostById(postId);
        if(post && post[key] !== value) {
            this.store.updatePost(postId, { [key]: value });
            this.saveDataDebounced();
            this.ui.scheduleRender();
        }
    }

    public async openContextNote(post: TweetWidgetPost) {
        let notePath = post.contextNote;
        if (!notePath) {
            const date = new Date(post.created).toISOString().split('T')[0];
            const sanitizedText = post.text.slice(0, 30).replace(/[\\/:*?"<>|#\[\]]/g, '').trim();
            const contextFolder = this.plugin.settings.baseFolder ? `${this.plugin.settings.baseFolder}/ContextNotes` : 'ContextNotes';
            
            if (!await this.app.vault.adapter.exists(contextFolder)) {
                await this.app.vault.createFolder(contextFolder);
            }
            notePath = `${contextFolder}/${date}-${sanitizedText || 'note'}.md`;
            await this.updatePostProperty(post.id, 'contextNote', notePath);
        }

        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (file instanceof TFile) {
            this.app.workspace.getLeaf(true).openFile(file);
        } else {
             if (!await this.app.vault.adapter.exists(notePath)) {
                await this.app.vault.create(notePath, `> ${post.text}\n\n---\n\n`);
                const newFile = this.app.vault.getAbstractFileByPath(notePath);
                if (newFile instanceof TFile) {
                    this.app.workspace.getLeaf(true).openFile(newFile);
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
            const dateStr = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日 ${date.getHours()}時${date.getMinutes().toString().padStart(2, '0')}分`;
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
            
            let replyText = await GeminiProvider.generateReply(promptText, {
                apiKey: deobfuscate(this.plugin.settings.llm!.gemini!.apiKey),
                model: this.plugin.settings.llm!.gemini!.model,
                postText: threadText, post, thread
            });

            try {
                const parsed = JSON.parse(replyText);
                if (parsed?.reply) replyText = parsed.reply;
            } catch {}

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
        if (!(await this.app.vault.adapter.exists(imagesDir))) {
            await this.app.vault.adapter.mkdir(imagesDir);
        }
        let insertedLinks: string[] = [];
        for (const file of files) {
            const dataUrl = await readFileAsDataUrl(file);
            const ext = file.name.split('.').pop() || 'png';
            const uniqueName = `img_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;
            const vaultPath = imagesDir + '/' + uniqueName;
            const base64 = dataUrl.split(',')[1];
            const bin = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            await this.app.vault.createBinary(vaultPath, bin);
            // Vaultファイルを取得し、getResourcePathでURLを取得
            const vaultFile = this.app.vault.getFiles().find(f => f.path === vaultPath);
            let url = '';
            if (vaultFile) {
                url = this.app.vault.getResourcePath(vaultFile);
            }
            this.attachedFiles.push({ name: uniqueName, type: file.type, dataUrl: url });
            insertedLinks.push(`![[tweet-widget-files/${uniqueName}]]`);
        }
        // 本文テキストエリアに![[ファイル名]]を自動挿入
        const input = document.querySelector('.tweet-textarea-main') as HTMLTextAreaElement;
        if (input && insertedLinks.length > 0) {
            const sep = input.value && !input.value.endsWith('\n') ? '\n' : '';
            input.value = input.value + sep + insertedLinks.join('\n');
            input.dispatchEvent(new Event('input'));
        }
    }

    public getFilteredPosts(): TweetWidgetPost[] {
        let posts = this.store.settings.posts;
        switch (this.currentFilter) {
            case 'all': break;
            case 'deleted': posts = posts.filter(t => t.deleted); break;
            case 'bookmark': posts = posts.filter(t => t.bookmark); break;
            case 'active':
            default:
                posts = posts.filter(t => !t.deleted);
        }
        if (this.currentPeriod && this.currentPeriod !== 'all') {
            const now = Date.now();
            let ms = 0;
            if (this.currentPeriod === 'today') {
                // ローカルタイムで今日の日付
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                const todayStr = `${yyyy}-${mm}-${dd}`;
                posts = posts.filter(p => {
                    const d = new Date(p.created);
                    const yyyy2 = d.getFullYear();
                    const mm2 = String(d.getMonth() + 1).padStart(2, '0');
                    const dd2 = String(d.getDate()).padStart(2, '0');
                    const dateStr = `${yyyy2}-${mm2}-${dd2}`;
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
}