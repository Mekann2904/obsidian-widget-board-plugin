import { App, Notice, setIcon, MarkdownRenderer, Menu, TFile } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main';
import { GeminiProvider } from '../../llm/gemini/geminiApi';
import { deobfuscate } from '../../utils';
import { geminiPrompt } from 'src/llm/gemini/prompts';
import { generateAiReply, shouldAutoReply, findLatestAiUserIdInThread, getFullThreadHistory, generateAiUserId, isExplicitAiTrigger } from './aiReply';
import { parseTags, parseLinks, formatTimeAgo, readFileAsDataUrl, wrapSelection } from './tweetWidgetUtils';
import { loadTweetsFromFile, saveTweetsToFile } from './tweetWidgetDb';
import { loadAiRepliesFromFile, saveAiRepliesToFile } from './tweetWidgetAiDb';

export interface TweetWidgetFile {
    name: string;
    type: string;
    dataUrl: string;
}

export interface TweetWidgetPost {
    text: string;
    created: number;
    id: string;

    // Original optional fields
    files?: TweetWidgetFile[];
    like?: number;
    liked?: boolean;
    retweet?: number;
    retweeted?: boolean;
    edited?: boolean;
    replyCount?: number;

    // --- NEW PKM FIELDS ---
    tags?: string[];
    links?: string[];
    contextNote?: string | null;
    threadId?: string | null; // Renamed from replyTo for clarity
    visibility?: "public" | "private" | "draft";
    updated?: number;
    deleted?: boolean;
    bookmark?: boolean;
    noteQuality?: "fleeting" | "literature" | "permanent";
    taskStatus?: "todo" | "doing" | "done" | null;
    userId?: string;
    userName?: string;
    verified?: boolean;
}


export interface TweetWidgetSettings {
    posts: TweetWidgetPost[];
    avatarUrl?: string;
    userName?: string;
    userId?: string;
    verified?: boolean;
}

export const DEFAULT_TWEET_WIDGET_SETTINGS: TweetWidgetSettings = {
    posts: [],
    avatarUrl: '',
    userName: 'あなた',
    userId: '@you',
    verified: false,
};

export class TweetWidget implements WidgetImplementation {
    id = 'tweet-widget';
    private config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin;
    private widgetEl!: HTMLElement;
    private currentSettings!: TweetWidgetSettings;
    private maxLength = 300;
    private attachedFiles: TweetWidgetFile[] = [];
    private editingPostId: string | null = null;
    private replyingToParentId: string | null = null;
    private currentFilter: 'all' | 'active' | 'deleted' | 'bookmark' = 'active';
    private detailPostId: string | null = null;
    private replyModalPost: TweetWidgetPost | null = null;
    private currentTab: 'home' | 'notification' = 'home';

    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;
        this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS };
        this.loadTweetsFromFile().then(() => {
            this.renderPostUI(this.widgetEl);
        });
        config.settings = this.currentSettings;
        this.attachedFiles = [];
        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'tweet-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);
        this.renderPostUI(this.widgetEl);
        return this.widgetEl;
    }

    private async loadTweetsFromFile() {
        const dbPath = this.getTweetDbPath();
        try {
            const exists = await this.app.vault.adapter.exists(dbPath);
            if (exists) {
                const raw = await this.app.vault.adapter.read(dbPath);
                // Ensure default values for new fields on older posts
                const loadedSettings = JSON.parse(raw);
                loadedSettings.posts = loadedSettings.posts.map((t: any) => ({
                    deleted: false,
                    ...t
                }));
                this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...loadedSettings };
            } else {
                this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS };
                await this.saveTweetsToFile();
            }
        } catch (e) {
            console.error("Error loading tweet data:", e);
            this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS };
        }
    }

    private async saveTweetsToFile() {
        const dbPath = this.getTweetDbPath();
        const folder = dbPath.split('/').slice(0, -1).join('/');
        try {
            const exists = await this.app.vault.adapter.exists(folder);
            if (!exists) {
                await this.app.vault.adapter.mkdir(folder);
            }
            await this.app.vault.adapter.write(dbPath, JSON.stringify(this.currentSettings, null, 2));
        } catch (e) {
            console.error("Error saving tweet data:", e);
            new Notice("Failed to save tweets. Check developer console.");
        }
    }

    private renderPostUI(container: HTMLElement) {
        container.empty();
        // --- サイドバー切り替え ---
        const tabBar = container.createDiv({ cls: 'tweet-tab-bar' });
        const homeTab = tabBar.createEl('button', { text: 'ホーム', cls: 'tweet-tab-btn' });
        const notifTab = tabBar.createEl('button', { text: '通知', cls: 'tweet-tab-btn' });
        if (this.currentTab === 'home') homeTab.classList.add('active');
        if (this.currentTab === 'notification') notifTab.classList.add('active');
        homeTab.onclick = async () => {
            this.currentTab = 'home';
            this.detailPostId = null;
            await this.loadTweetsFromFile();
            this.renderPostUI(this.widgetEl);
        };
        notifTab.onclick = () => { this.currentTab = 'notification'; this.renderPostUI(this.widgetEl); };
        // --- タブごとに表示内容を切り替え ---
        if (this.currentTab === 'notification') {
            // 通知リストのみ表示
            const myUserId = this.currentSettings.userId || '@you';
            // デバッグ: 全ポストのuserId, threadId, textを出力
            console.log('【通知デバッグ】全ポスト一覧:');
            this.currentSettings.posts.forEach(t => {
                console.log({id: t.id, userId: t.userId, threadId: t.threadId, text: t.text});
            });
            const notifications: { type: string, from: TweetWidgetPost, to: TweetWidgetPost }[] = [];
            // すべてのポストに対して「自分以外のuserId」からのアクションを通知として抽出
            this.currentSettings.posts.forEach(t => {
                // リプライ: 自分のポストに他人がリプライした場合
                if (t.threadId) {
                    const parent = this.currentSettings.posts.find(pt => pt.id === t.threadId);
                    if (parent && parent.userId === myUserId && t.userId !== myUserId) {
                        notifications.push({ type: 'reply', from: t, to: parent });
                    }
                }
                // いいね: 自分のポストに他人がいいねした場合
                if (t.like && t.like > 0 && t.userId !== myUserId) {
                    const target = this.currentSettings.posts.find(pt => pt.id === t.id && pt.userId === myUserId);
                    if (target) notifications.push({ type: 'like', from: t, to: target });
                }
                // リツイート: 自分のポストに他人がリツイートした場合
                if (t.retweet && t.retweet > 0 && t.userId !== myUserId) {
                    const target = this.currentSettings.posts.find(pt => pt.id === t.id && pt.userId === myUserId);
                    if (target) notifications.push({ type: 'retweet', from: t, to: target });
                }
            });
            console.log('【通知デバッグ】抽出された通知:', notifications);
            if (notifications.length > 0) {
                const notifBox = container.createDiv({ cls: 'tweet-notification-list' });
                notifBox.createDiv({ text: '通知', cls: 'tweet-notification-title' });
                notifications.slice(0, 20).forEach(n => {
                    const notif = notifBox.createDiv({ cls: 'tweet-notification-item' });
                    notif.onclick = () => {
                        // スレッド詳細へジャンプ
                        this.detailPostId = n.to.id;
                        this.currentTab = 'home';
                        this.renderPostUI(this.widgetEl);
                    };
                    // 1行目: アバター＋ユーザー名＋アクション
                    const row = notif.createDiv({ cls: 'tweet-notification-row' });
                    let avatarUrl = '';
                    if (n.from.userId && n.from.userId.startsWith('@ai-')) {
                        const aiAvatars = (this.plugin.settings.aiAvatarUrls || '').split(',').map(s => s.trim()).filter(Boolean);
                        if (aiAvatars.length > 0) {
                            const idx = this.getAiAvatarIndex(n.from.userId || '', aiAvatars.length);
                            avatarUrl = aiAvatars[idx] || 'https://www.gravatar.com/avatar/?d=mp&s=64';
                        } else {
                            avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
                        }
                    } else {
                        avatarUrl = (this.plugin.settings.tweetWidgetAvatarUrl || this.currentSettings.avatarUrl || '').trim();
                        if (!avatarUrl) avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
                    }
                    row.createEl('img', { attr: { src: avatarUrl, width: 36, height: 36 }, cls: 'tweet-notification-avatar' });
                    const titleLine = row.createDiv({ cls: 'tweet-notification-titleline' });
                    titleLine.createSpan({ text: n.from.userName || n.from.userId || '誰か', cls: 'tweet-notification-user' });
                    if (n.type === 'reply') titleLine.createSpan({ text: ' がリプライしました', cls: 'tweet-notification-action' });
                    if (n.type === 'like') titleLine.createSpan({ text: ' がいいねしました', cls: 'tweet-notification-action' });
                    if (n.type === 'retweet') titleLine.createSpan({ text: ' がリツイートしました', cls: 'tweet-notification-action' });
                    // 2行目: 内容
                    let content = '';
                    if (n.type === 'reply') {
                        content = `「${n.from.text.slice(0, 40)}...」\n→「${n.to.text.slice(0, 40)}...」`;
                    } else {
                        content = `「${n.to.text.slice(0, 56)}...」`;
                    }
                    notif.createDiv({ text: content, cls: 'tweet-notification-contentline' });
                });
            } else {
                container.createDiv({ text: '通知はありません', cls: 'tweet-notification-empty' });
            }
            return;
        }
        // --- ここから下はホーム（つぶやき一覧） ---
        // 通知リスト（仮）は削除（ホームでは表示しない）
        // --- 返信モーダル ---
        if (this.replyModalPost) {
            this.renderReplyModal(container, this.replyModalPost);
        }
        // --- 詳細表示ヘッダー ---
        if (this.detailPostId) {
            const header = container.createDiv({ cls: 'tweet-detail-header' });
            const backBtn = header.createEl('button', { cls: 'tweet-detail-header-back', text: '←' });
            backBtn.onclick = () => {
                this.detailPostId = null;
                this.renderPostUI(this.widgetEl);
            };
            header.createDiv({ cls: 'tweet-detail-header-title', text: 'ポスト' });
        }
        // --- フィルタUIを最上部に生成（詳細時は非表示） ---
        if (!this.detailPostId) {
            const filterBar = container.createDiv({ cls: 'tweet-filter-bar' });
            const filterSelect = filterBar.createEl('select');
            [
                { value: 'all', label: 'すべて' },
                { value: 'active', label: '通常のみ' },
                { value: 'deleted', label: '非表示のみ' },
                { value: 'bookmark', label: 'ブックマーク' }
            ].forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.text = opt.label;
                filterSelect.appendChild(option);
            });
            filterSelect.value = this.currentFilter;
            filterSelect.onchange = () => {
                this.currentFilter = filterSelect.value as any;
                this.detailPostId = null;
                this.renderPostUI(this.widgetEl);
            };
        }
        // --- 投稿欄 ---
        if (!this.detailPostId) {
            const postBox = container.createDiv({ cls: 'tweet-post-box' });
            const avatar = postBox.createDiv({ cls: 'tweet-avatar-large' });
            let avatarUrl: string = '';
            if (this.replyingToParentId) {
                const replyingToPost = this.currentSettings.posts.find(t => t.id === this.replyingToParentId);
                if (replyingToPost) {
                    if (replyingToPost.userId && replyingToPost.userId.startsWith('@ai-')) {
                        const aiAvatars = (this.plugin.settings.aiAvatarUrls || '').split(',').map(s => s.trim()).filter(Boolean);
                        if (aiAvatars.length > 0) {
                            const idx = this.getAiAvatarIndex(replyingToPost.userId || '', aiAvatars.length);
                            avatarUrl = aiAvatars[idx] || 'https://www.gravatar.com/avatar/?d=mp&s=64';
                        } else {
                            avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
                        }
                    } else {
                        avatarUrl = (this.plugin.settings.tweetWidgetAvatarUrl || this.currentSettings.avatarUrl || '').trim();
                        if (!avatarUrl) avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
                    }
                } else {
                    this.replyingToParentId = null;
                }
            } else {
                avatarUrl = (this.plugin.settings.tweetWidgetAvatarUrl && this.plugin.settings.tweetWidgetAvatarUrl.trim())
                    ? this.plugin.settings.tweetWidgetAvatarUrl.trim()
                    : (this.currentSettings.avatarUrl || '').trim();
                if (!avatarUrl) avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
            }
            const avatarImg = avatar.createEl('img', { attr: { src: avatarUrl as string, width: 44, height: 44 } });
            avatarImg.style.borderRadius = '50%';
            avatarImg.style.cursor = 'zoom-in';
            avatarImg.onclick = (e) => {
                e.stopPropagation();
                // 既存のモーダルがあれば削除
                const oldModal = document.querySelector('.tweet-avatar-modal-backdrop');
                if (oldModal) oldModal.remove();
                // バックドロップ
                const backdrop = document.createElement('div');
                backdrop.className = 'tweet-avatar-modal-backdrop';
                backdrop.style.position = 'fixed';
                backdrop.style.top = '0';
                backdrop.style.left = '0';
                backdrop.style.width = '100vw';
                backdrop.style.height = '100vh';
                backdrop.style.background = 'rgba(0,0,0,0.55)';
                backdrop.style.zIndex = '9999';
                backdrop.style.display = 'flex';
                backdrop.style.alignItems = 'center';
                backdrop.style.justifyContent = 'center';
                backdrop.onclick = (ev) => {
                    if (ev.target === backdrop) backdrop.remove();
                };
                // モーダル本体
                const modal = document.createElement('div');
                modal.className = 'tweet-avatar-modal-content';
                modal.style.background = 'transparent';
                modal.style.borderRadius = '16px';
                modal.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
                modal.style.padding = '16px';
                modal.style.display = 'flex';
                modal.style.flexDirection = 'column';
                modal.style.alignItems = 'center';
                // 画像
                const img = document.createElement('img');
                img.src = avatarUrl;
                img.alt = 'avatar-large';
                img.style.maxWidth = '320px';
                img.style.maxHeight = '320px';
                img.style.borderRadius = '16px';
                img.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
                img.style.background = '#fff';
                img.style.display = 'block';
                modal.appendChild(img);
                // 閉じるボタン
                const closeBtn = document.createElement('button');
                closeBtn.textContent = '×';
                closeBtn.style.marginTop = '12px';
                closeBtn.style.fontSize = '1.5em';
                closeBtn.style.background = 'none';
                closeBtn.style.border = 'none';
                closeBtn.style.color = '#fff';
                closeBtn.style.cursor = 'pointer';
                closeBtn.onclick = () => backdrop.remove();
                modal.appendChild(closeBtn);
                // Escキーで閉じる
                const escHandler = (ev: KeyboardEvent) => {
                    if (ev.key === 'Escape') {
                        backdrop.remove();
                        window.removeEventListener('keydown', escHandler);
                    }
                };
                window.addEventListener('keydown', escHandler);
                backdrop.appendChild(modal);
                document.body.appendChild(backdrop);
            };

            const inputArea = postBox.createDiv({ cls: 'tweet-input-area-main' });
            const replyInfoContainer = inputArea.createDiv({ cls: 'tweet-reply-info-container' });
            if (this.replyingToParentId) {
                const replyingToPost = this.currentSettings.posts.find(t => t.id === this.replyingToParentId);
                if (replyingToPost) {
                    const replyInfoDiv = replyInfoContainer.createDiv({ cls: 'tweet-reply-info' });
                    replyInfoDiv.setText(`${this.currentSettings.userId || '@you'} さんに返信中`);
                    const cancelReplyBtn = replyInfoDiv.createEl('button', { text: 'キャンセル', cls: 'tweet-cancel-reply-btn' });
                    cancelReplyBtn.onclick = () => {
                        this.replyingToParentId = null;
                        this.renderPostUI(this.widgetEl);
                    };
                } else {
                    this.replyingToParentId = null;
                }
            }

            const input = document.createElement('textarea');
            input.rows = 2;
            input.placeholder = this.replyingToParentId ? '返信をポスト' : 'いまどうしてる？';
            input.classList.add('tweet-textarea-main');
            inputArea.appendChild(input);

            const filePreviewArea = inputArea.createDiv({ cls: 'tweet-file-preview' });
            this.renderFilePreview(filePreviewArea);

            const iconBar = inputArea.createDiv({ cls: 'tweet-icon-bar' });
            
            // --- RESTORED BUTTONS ---
            const imageBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main' });
            setIcon(imageBtn, 'image');
            imageBtn.title = '画像を添付';
            const imageInput = document.createElement('input');
            imageInput.type = 'file';
            imageInput.accept = 'image/*';
            imageInput.multiple = true;
            imageInput.style.display = 'none';
            imageBtn.onclick = () => imageInput.click();
            iconBar.appendChild(imageInput);
            imageInput.onchange = async () => {
                if (!imageInput.files) return;
                for (const file of Array.from(imageInput.files)) {
                    const dataUrl = await this.readFileAsDataUrl(file);
                    this.attachedFiles.push({ name: file.name, type: file.type, dataUrl });
                }
                this.renderFilePreview(filePreviewArea);
                imageInput.value = '';
            };

            const gifBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main' });
            setIcon(gifBtn, 'film');
            gifBtn.title = 'GIFを添付';
            const gifInput = document.createElement('input');
            gifInput.type = 'file';
            gifInput.accept = 'image/gif';
            gifInput.multiple = true;
            gifInput.style.display = 'none';
            gifBtn.onclick = () => gifInput.click();
            iconBar.appendChild(gifInput);
            gifInput.onchange = async () => {
                if (!gifInput.files) return;
                for (const file of Array.from(gifInput.files)) {
                    const dataUrl = await this.readFileAsDataUrl(file);
                    this.attachedFiles.push({ name: file.name, type: file.type, dataUrl });
                }
                this.renderFilePreview(filePreviewArea);
                gifInput.value = '';
            };

            const boldBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main' });
            setIcon(boldBtn, 'bold');
            boldBtn.title = '太字';
            boldBtn.onclick = () => this.wrapSelection(input, '**');
            
            const italicBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main' });
            setIcon(italicBtn, 'italic');
            italicBtn.title = '斜体';
            italicBtn.onclick = () => this.wrapSelection(input, '*');


            const bottomBar = inputArea.createDiv({ cls: 'tweet-bottom-bar' });
            const charCount = bottomBar.createDiv({ cls: 'tweet-char-count-main' });
            this.updateCharCount(charCount, 0);

            const postBtn = bottomBar.createEl('button', { cls: 'tweet-post-btn-main', text: this.editingPostId ? '編集完了' : (this.replyingToParentId ? '返信する' : 'ポストする') });
            postBtn.onclick = async () => {
                const text = input.value.trim();
                if (!text && this.attachedFiles.length === 0) return;

                if (this.editingPostId) {
                    const idx = this.currentSettings.posts.findIndex(t => t.id === this.editingPostId);
                    if (idx !== -1) {
                        const post = this.currentSettings.posts[idx];
                        post.text = text;
                        post.files = this.attachedFiles;
                        post.edited = true;
                        post.updated = Date.now();
                        post.tags = parseTags(text);
                        post.links = parseLinks(text);
                    }
                    this.editingPostId = null;
                    new Notice('つぶやきを編集しました');
                } else {
                    const newPost: TweetWidgetPost = {
                        id: 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                        text,
                        created: Date.now(),
                        updated: Date.now(),
                        files: this.attachedFiles,
                        like: 0,
                        liked: false,
                        retweet: 0,
                        retweeted: false,
                        edited: false,
                        replyCount: 0,
                        deleted: false,
                        bookmark: false,
                        contextNote: null,
                        threadId: this.replyingToParentId,
                        visibility: 'public',
                        noteQuality: 'fleeting',
                        taskStatus: null,
                        tags: parseTags(text),
                        links: parseLinks(text),
                        userId: this.currentSettings.userId || '@you',
                        userName: this.currentSettings.userName || 'あなた',
                    };

                    // 人間の投稿は即時で記録・保存・表示
                    this.currentSettings.posts.unshift(newPost);
                    await this.saveTweetsToFile();
                    this.renderPostUI(this.widgetEl);

                    // AIリプライは非同期でディレイ発火
                    if (newPost.userId && newPost.userId.startsWith('@ai-')) {
                        // AIの投稿にはAI自動リプライを発火しない
                    } else if (shouldAutoReply(newPost, this.plugin.settings)) {
                        generateAiReply({
                            tweet: newPost,
                            allTweets: this.currentSettings.posts,
                            llmGemini: this.plugin.settings.llm?.gemini || { apiKey: '', model: 'gemini-2.0-flash-exp' },
                            saveReply: async (reply) => {
                                this.currentSettings.posts.unshift(reply);
                                newPost.replyCount = (newPost.replyCount || 0) + 1;
                                newPost.updated = Date.now();
                                await this.saveTweetsToFile();
                                this.renderPostUI(this.widgetEl);
                            },
                            parseTags: parseTags.bind(this),
                            parseLinks: parseLinks.bind(this),
                            onError: (err) => new Notice('AI自動リプライ生成に失敗しました: ' + (err instanceof Error ? err.message : String(err))),
                            settings: this.plugin.settings,
                            delay: !isExplicitAiTrigger(newPost),
                        }); // awaitしない
                    }

                    if (this.replyingToParentId) {
                        const originalPost = this.currentSettings.posts.find(t => t.id === this.replyingToParentId);
                        if (originalPost) {
                            originalPost.replyCount = (originalPost.replyCount || 0) + 1;
                            originalPost.updated = Date.now();
                        }
                        this.replyingToParentId = null;
                        new Notice('返信を投稿しました');
                    } else {
                        new Notice('つぶやきを投稿しました');
                    }
                }

                input.value = '';
                this.attachedFiles = [];
                await this.saveTweetsToFile();
                this.renderPostUI(this.widgetEl);
            };

            input.addEventListener('input', () => {
                this.updateCharCount(charCount, input.value.length);
            });
        }
        // --- リスト本体 ---
        let listEl = container.createDiv({ cls: 'tweet-list-main' });
        this.renderPostList(listEl);
    }

    private renderFilePreview(container: HTMLElement) {
        container.empty();
        if (!this.attachedFiles.length) return;
        container.addClass(`files-count-${this.attachedFiles.length}`);
        this.attachedFiles.forEach(file => {
            const img = document.createElement('img');
            img.src = file.dataUrl;
            img.alt = file.name;
            img.className = 'tweet-file-image-main';
            container.appendChild(img);
        });
    }

    private updateCharCount(el: HTMLElement, len: number) {
        el.textContent = `${len} / ${this.maxLength}`;
        if (len > this.maxLength) el.classList.add('tweet-char-over');
        else el.classList.remove('tweet-char-over');
    }

    private renderPostList(listEl: HTMLElement) {
        listEl.empty();
        let filteredPosts: TweetWidgetPost[];
        if (this.detailPostId) {
            // --- Twitter風 詳細表示 ---
            const all = this.currentSettings.posts;
            const target = all.find(t => t.id === this.detailPostId);
            if (!target) return;
            // 親ポスト（1件）
            let parent: TweetWidgetPost | null = null;
            if (target.threadId) {
                parent = all.find(t => t.id === target.threadId) || null;
            };
            // --- 親ポストを最上部に表示 ---
            const targetWrap = listEl.createDiv({ cls: 'tweet-detail-main' });
            const postsById = new Map<string, TweetWidgetPost>([[target.id, target]]);
            this.renderSinglePost(target, targetWrap, postsById);
            // --- 返信入力欄 ---
            const replyBox = listEl.createDiv({ cls: 'tweet-detail-reply-box' });
            const avatar = replyBox.createDiv({ cls: 'tweet-detail-reply-avatar' });
            let avatarUrl = (this.plugin.settings.tweetWidgetAvatarUrl || this.currentSettings.avatarUrl || '').trim();
            if (!avatarUrl) avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
            avatar.createEl('img', { attr: { src: avatarUrl as string, width: 44, height: 44 } });
            const inputArea = replyBox.createDiv({ cls: 'tweet-detail-reply-input' });
            const textarea = document.createElement('textarea');
            textarea.className = 'tweet-detail-reply-textarea';
            textarea.placeholder = '返信をポスト';
            inputArea.appendChild(textarea);
            const replyBtn = document.createElement('button');
            replyBtn.className = 'tweet-detail-reply-btn';
            replyBtn.textContent = '返信';
            replyBtn.onclick = async () => {
                const text = textarea.value.trim();
                if (!text) return;
                const newPost: TweetWidgetPost = {
                    id: 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    text,
                    created: Date.now(),
                    updated: Date.now(),
                    files: [],
                    like: 0,
                    liked: false,
                    retweet: 0,
                    retweeted: false,
                    edited: false,
                    replyCount: 0,
                    deleted: false,
                    bookmark: false,
                    contextNote: null,
                    threadId: target.id,
                    visibility: 'public',
                    noteQuality: 'fleeting',
                    taskStatus: null,
                    tags: parseTags(text),
                    links: parseLinks(text),
                    userId: this.currentSettings.userId || '@you',
                    userName: this.currentSettings.userName || 'あなた',
                };
                this.currentSettings.posts.unshift(newPost);
                target.replyCount = (target.replyCount || 0) + 1;
                target.updated = Date.now();
                await this.saveTweetsToFile();
                textarea.value = '';
                this.renderPostUI(this.widgetEl);
            };
            inputArea.appendChild(replyBtn);
            // --- リプライツリー（再帰的） ---
            listEl.createDiv({ cls: 'tweet-detail-section-sep' });
            // インデントの最大値を設定
            const MAX_REPLY_DEPTH = 1;
            const renderRecursiveReplies = (parentId: string, container: HTMLElement, depth: number = 0) => {
                const replies = this.currentSettings.posts.filter(t => t.threadId === parentId);
                replies.forEach(reply => {
                    const replyCard = container.createDiv({ cls: 'tweet-detail-reply' });
                    // インデントの最大値を設定
                    const indentDepth = Math.min(depth, MAX_REPLY_DEPTH);
                    replyCard.style.marginLeft = `${indentDepth * 24}px`;
                    const replyMap = new Map<string, TweetWidgetPost>([[reply.id, reply]]);
                    this.renderSinglePost(reply, replyCard, replyMap);
                    replyCard.onclick = (e) => {
                        if ((e.target as HTMLElement).closest('.tweet-action-bar-main')) return;
                        this.detailPostId = reply.id;
                        this.renderPostUI(this.widgetEl);
                    };
                    renderRecursiveReplies(reply.id, container, depth + 1);
                });
            };
            renderRecursiveReplies(target.id, listEl);
            if (this.currentSettings.posts.filter(t => t.threadId === target.id).length === 0) {
                listEl.createDiv({ cls: 'tweet-detail-no-reply', text: 'リプライはありません' });
            }
            return;
        }
        // --- フィルタ適用 ---
        if (this.currentFilter === 'all') {
            filteredPosts = this.currentSettings.posts;
        } else if (this.currentFilter === 'deleted') {
            filteredPosts = this.currentSettings.posts.filter(t => t.deleted);
        } else if (this.currentFilter === 'bookmark') {
            filteredPosts = this.currentSettings.posts.filter(t => t.bookmark);
        } else {
            filteredPosts = this.currentSettings.posts.filter(t => !t.deleted);
        }
        if (filteredPosts.length === 0) {
            listEl.createEl('div', { cls: 'tweet-empty-notice', text: 'まだつぶやきがありません。' });
            return;
        }
        // --- 通常時はスレッド表示 ---
        const postsById = new Map<string, TweetWidgetPost>();
        filteredPosts.forEach(t => postsById.set(t.id, t));
        // 返信（リプライ）を除外し、親ポストのみリスト表示
        const rootItems = filteredPosts.filter(t => !t.threadId || !postsById.has(t.threadId));
        rootItems.sort((a, b) => {
            const lastActivityA = a.updated || a.created;
            const lastActivityB = b.updated || b.created;
            return lastActivityB - lastActivityA;
        });
        rootItems.forEach(post => {
            const wrapper = listEl.createDiv({ cls: 'tweet-thread-wrapper' });
            wrapper.setAttribute('data-tweet-id', post.id);
            const postContainer = wrapper.createDiv({ cls: 'tweet-item-container' });
            this.renderSinglePost(post, postContainer, postsById);
            // --- クリックで詳細表示 ---
            wrapper.onclick = (e) => {
                if ((e.target as HTMLElement).closest('.tweet-action-bar-main')) return;
                this.detailPostId = post.id;
                this.renderPostUI(this.widgetEl);
            };
        });
    }

    private renderSinglePost(post: TweetWidgetPost, container: HTMLElement, postsById: Map<string, TweetWidgetPost>) {
        container.empty();
        const item = container.createDiv({ cls: 'tweet-item-main' });

        const header = item.createDiv({ cls: 'tweet-item-header-main' });
        const avatar = header.createDiv({ cls: 'tweet-item-avatar-main' });
        let avatarUrl: string = '';
        if (post.userId && post.userId.startsWith('@ai-')) {
            const aiAvatars = (this.plugin.settings.aiAvatarUrls || '').split(',').map(s => s.trim()).filter(Boolean);
            if (aiAvatars.length > 0) {
                const idx = this.getAiAvatarIndex(post.userId || '', aiAvatars.length);
                avatarUrl = aiAvatars[idx] || 'https://www.gravatar.com/avatar/?d=mp&s=64';
            } else {
                avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
            }
        } else {
            avatarUrl = (this.plugin.settings.tweetWidgetAvatarUrl || this.currentSettings.avatarUrl || '').trim();
            if (!avatarUrl) avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
        }
        const avatarImg = avatar.createEl('img', { attr: { src: avatarUrl as string, width: 36, height: 36 } });
        // --- アバター拡大プレビュー機能 ---
        avatarImg.style.cursor = 'zoom-in';
        avatarImg.onclick = (e) => {
            e.stopPropagation();
            // 既存のモーダルがあれば削除
            const oldModal = document.querySelector('.tweet-avatar-modal-backdrop');
            if (oldModal) oldModal.remove();
            // バックドロップ
            const backdrop = document.createElement('div');
            backdrop.className = 'tweet-avatar-modal-backdrop';
            backdrop.style.position = 'fixed';
            backdrop.style.top = '0';
            backdrop.style.left = '0';
            backdrop.style.width = '100vw';
            backdrop.style.height = '100vh';
            backdrop.style.background = 'rgba(0,0,0,0.55)';
            backdrop.style.zIndex = '9999';
            backdrop.style.display = 'flex';
            backdrop.style.alignItems = 'center';
            backdrop.style.justifyContent = 'center';
            backdrop.onclick = (ev) => {
                if (ev.target === backdrop) backdrop.remove();
            };
            // モーダル本体
            const modal = document.createElement('div');
            modal.className = 'tweet-avatar-modal-content';
            modal.style.background = 'transparent';
            modal.style.borderRadius = '16px';
            modal.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
            modal.style.padding = '16px';
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            modal.style.alignItems = 'center';
            // 画像
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = 'avatar-large';
            img.style.maxWidth = '320px';
            img.style.maxHeight = '320px';
            img.style.borderRadius = '16px';
            img.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
            img.style.background = '#fff';
            img.style.display = 'block';
            modal.appendChild(img);
            // 閉じるボタン
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.style.marginTop = '12px';
            closeBtn.style.fontSize = '1.5em';
            closeBtn.style.background = 'none';
            closeBtn.style.border = 'none';
            closeBtn.style.color = '#fff';
            closeBtn.style.cursor = 'pointer';
            closeBtn.onclick = () => backdrop.remove();
            modal.appendChild(closeBtn);
            // Escキーで閉じる
            const escHandler = (ev: KeyboardEvent) => {
                if (ev.key === 'Escape') {
                    backdrop.remove();
                    window.removeEventListener('keydown', escHandler);
                }
            };
            window.addEventListener('keydown', escHandler);
            backdrop.appendChild(modal);
            document.body.appendChild(backdrop);
        };

        const userInfo = header.createDiv({ cls: 'tweet-item-userinfo-main' });
        userInfo.createEl('span', { text: post.userName || this.currentSettings.userName || 'あなた', cls: 'tweet-item-username-main' });
        if (post.verified || this.currentSettings.verified) {
            const badge = userInfo.createSpan({ cls: 'tweet-item-badge-main' });
            setIcon(badge, 'badge-check');
        }
        userInfo.createEl('span', { text: post.userId || this.currentSettings.userId || '@you', cls: 'tweet-item-userid-main' });
        const timeText = '・' + this.formatTimeAgo(post.created) + (post.edited ? ' (編集済)' : '');
        userInfo.createEl('span', { text: timeText, cls: 'tweet-item-time-main' });

        if (post.threadId) {
            const parentPost = this.currentSettings.posts.find(t => t.id === post.threadId);
            const parentPostExists = parentPost && !parentPost.deleted;
            const replyToDiv = item.createDiv({ cls: 'tweet-item-reply-to' });
            if (parentPostExists) {
                replyToDiv.setText('ポストへの返信');
                replyToDiv.title = '元のポストに移動';
                replyToDiv.onclick = (e) => {
                    e.stopPropagation();
                    const parentEl = this.widgetEl.querySelector(`[data-tweet-id="${post.threadId}"]`) as HTMLElement;
                    if (parentEl) {
                        parentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        parentEl.addClass('highlight');
                        setTimeout(() => parentEl.removeClass('highlight'), 1500);
                    }
                };
            } else {
                replyToDiv.setText('削除されたポストへの返信');
                replyToDiv.addClass('deleted-reply');
            }
        }

        const textDiv = item.createDiv({ cls: 'tweet-item-text-main' });
        // --- AIリプライがJSON形式ならreplyだけ抽出 ---
        let displayText = post.text;
        try {
            const parsed = JSON.parse(displayText);
            if (parsed && typeof parsed.reply === 'string') {
                displayText = parsed.reply;
            }
        } catch {}
        MarkdownRenderer.render(this.app, displayText, textDiv, this.app.workspace.getActiveFile()?.path || '', this.plugin);

        if (post.files && post.files.length) {
            const filesDiv = item.createDiv({ cls: `tweet-item-files-main files-count-${post.files.length}` });
            post.files.forEach(file => {
                const img = filesDiv.createEl('img', { attr: { src: file.dataUrl, alt: file.name } });
                img.className = 'tweet-item-image-main';
            });
        }

        const metadataDiv = item.createDiv({ cls: 'tweet-item-metadata-main' });
        if (post.bookmark) metadataDiv.createEl('span', { cls: 'tweet-chip bookmark', text: 'Bookmarked' });
        if (post.visibility && post.visibility !== 'public') metadataDiv.createEl('span', { cls: 'tweet-chip visibility', text: post.visibility });
        if (post.noteQuality && post.noteQuality !== 'fleeting') metadataDiv.createEl('span', { cls: 'tweet-chip quality', text: post.noteQuality });
        if (post.taskStatus) metadataDiv.createEl('span', { cls: 'tweet-chip status', text: post.taskStatus });

        if (post.tags && post.tags.length > 0) {
            const tagsDiv = item.createDiv({ cls: 'tweet-item-tags-main' });
            post.tags.forEach(tag => {
                tagsDiv.createEl('a', { text: `#${tag}`, cls: 'tweet-tag', href: `#${tag}` });
            });
        }

        const actionBar = item.createDiv({ cls: 'tweet-action-bar-main' });

        const replyBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main reply' });
        setIcon(replyBtn, 'message-square');
        replyBtn.onclick = () => {
            this.replyModalPost = post;
            this.renderPostUI(this.widgetEl);
        };
        replyBtn.createSpan({ text: String(post.replyCount || 0), cls: 'tweet-action-count-main' });

        const rtBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main retweet' });
        setIcon(rtBtn, 'repeat-2');
        if (post.retweeted) rtBtn.addClass('active');
        else rtBtn.removeClass('active');
        rtBtn.onclick = async () => {
            post.retweeted = !post.retweeted;
            post.retweet = (post.retweet || 0) + (post.retweeted ? 1 : -1);
            if (post.retweeted) rtBtn.addClass('active');
            else rtBtn.removeClass('active');
            await this.saveTweetsToFile();
            this.renderPostUI(this.widgetEl);
        };
        rtBtn.createSpan({ text: String(post.retweet || 0), cls: 'tweet-action-count-main' });

        const likeBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main like' });
        setIcon(likeBtn, 'heart');
        if (post.liked) likeBtn.addClass('active');
        else likeBtn.removeClass('active');
        likeBtn.onclick = async () => {
            post.liked = !post.liked;
            post.like = (post.like || 0) + (post.liked ? 1 : -1);
            if (post.liked) likeBtn.addClass('active');
            else likeBtn.removeClass('active');
            await this.saveTweetsToFile();
            this.renderPostUI(this.widgetEl);
        };
        likeBtn.createSpan({ text: String(post.like || 0), cls: 'tweet-action-count-main' });

        const bookmarkBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main bookmark' });
        setIcon(bookmarkBtn, 'bookmark');
        if (post.bookmark) bookmarkBtn.addClass('active');
        else bookmarkBtn.removeClass('active');
        bookmarkBtn.onclick = async () => {
            post.bookmark = !post.bookmark;
            if (post.bookmark) bookmarkBtn.addClass('active');
            else bookmarkBtn.removeClass('active');
            await this.saveTweetsToFile();
            this.renderPostUI(this.widgetEl);
        };

        const moreBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main more' });
        setIcon(moreBtn, 'more-horizontal');
        moreBtn.onclick = (e) => this.showMoreMenu(e, post);

        // --- Geminiリプライボタン（自分のポストのみ） ---
        if ((this.currentSettings.userId === '@you' || !this.currentSettings.userId) && post.id && this.plugin.settings.llm?.gemini?.apiKey) {
            const geminiBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main gemini-reply' });
            setIcon(geminiBtn, 'bot');
            geminiBtn.title = 'Geminiでリプライ生成';
            geminiBtn.onclick = async (e) => {
                e.stopPropagation();
                geminiBtn.setAttribute('disabled', 'true');
                geminiBtn.innerHTML = '...';
                try {
                    const thread = getFullThreadHistory(post, this.currentSettings.posts);
                    const threadText = thread.map((t: TweetWidgetPost) =>
                        (t.userId && t.userId.startsWith('@ai-') ? 'AI: ' : 'あなた: ') + t.text
                    ).join('\n');
                    const promptText = geminiPrompt.replace('{post}', threadText);
                    let replyText = await GeminiProvider.generateReply(promptText, {
                        apiKey: deobfuscate(this.plugin.settings.llm?.gemini?.apiKey || ''),
                        post: post,
                        thread: thread,
                        model: this.plugin.settings.llm?.gemini?.model || 'gemini-2.0-flash-exp',
                        postText: threadText,
                    });
                    // 万一JSON形式で返ってきた場合もreplyだけ抽出
                    try {
                        const parsed = JSON.parse(replyText);
                        if (parsed && typeof parsed.reply === 'string') {
                            replyText = parsed.reply;
                        }
                    } catch {}
                    // AIリプライとして投稿
                    const aiUserId = findLatestAiUserIdInThread(post, this.currentSettings.posts) || generateAiUserId();
                    const aiReply: TweetWidgetPost = {
                        id: 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                        text: replyText,
                        created: Date.now(),
                        updated: Date.now(),
                        files: [],
                        like: 0,
                        liked: false,
                        retweet: 0,
                        retweeted: false,
                        edited: false,
                        replyCount: 0,
                        deleted: false,
                        bookmark: false,
                        contextNote: null,
                        threadId: post.id,
                        visibility: 'public',
                        noteQuality: 'fleeting',
                        taskStatus: null,
                        tags: parseTags(replyText),
                        links: parseLinks(replyText),
                        userId: aiUserId.startsWith('@ai-') ? aiUserId : generateAiUserId(),
                        userName: 'AI',
                        verified: true
                    };
                    this.currentSettings.posts.unshift(aiReply);
                    post.replyCount = (post.replyCount || 0) + 1;
                    post.updated = Date.now();
                    await this.saveTweetsToFile();
                    this.renderPostUI(this.widgetEl);
                } catch (err) {
                    new Notice('Geminiリプライ生成に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
                } finally {
                    geminiBtn.removeAttribute('disabled');
                    geminiBtn.innerHTML = '';
                    setIcon(geminiBtn, 'bot');
                }
            };
        }

        // --- AIリプライなら会話履歴を下に表示 ---
        if (post.userId && post.userId.startsWith('@ai-') && this.plugin.settings.showAiHistory) {
            const aiHistoryDiv = item.createDiv({ cls: 'tweet-ai-history' });
            aiHistoryDiv.createEl('div', { text: 'このAIとの会話履歴:', cls: 'tweet-ai-history-label' });
            const aiHistory = getFullThreadHistory(post, this.currentSettings.posts);
            aiHistory.forEach((h: TweetWidgetPost) => {
                aiHistoryDiv.createEl('div', { text: `${h.userName || (h.userId && h.userId.startsWith('@ai-') ? 'AI' : 'あなた')}: ${h.text}`, cls: 'tweet-ai-history-item' });
            });
        }

        // --- ここから追加：リプライしたユーザーのアバターを下部に表示（最適化） ---
        const replies = this.currentSettings.posts.filter(t => t.threadId === post.id);
        const uniqueUsers = new Map();
        replies.forEach(r => {
            if (r.userId) uniqueUsers.set(r.userId, r);
        });
        if (uniqueUsers.size > 0) {
            const reactedDiv = item.createDiv({ cls: 'tweet-reacted-users-main' });
            // 横並び用のflex行
            const row = reactedDiv.createDiv({ cls: 'tweet-reacted-row' });
            row.createDiv({ text: 'この人たちが反応しています！', cls: 'tweet-reacted-label' });
            const avatarsDiv = row.createDiv({ cls: 'tweet-reacted-avatars' });
            // 最大5人まで表示
            const usersArr = Array.from(uniqueUsers.values());
            const maxAvatars = 5;
            usersArr.slice(0, maxAvatars).forEach((r, idx) => {
                let avatarUrl = '';
                if (r.userId && r.userId.startsWith('@ai-')) {
                    const aiAvatars = (this.plugin.settings.aiAvatarUrls || '').split(',').map(s => s.trim()).filter(Boolean);
                    if (aiAvatars.length > 0) {
                        const i = this.getAiAvatarIndex(r.userId || '', aiAvatars.length);
                        avatarUrl = aiAvatars[i] || 'https://www.gravatar.com/avatar/?d=mp&s=64';
                    } else {
                        avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
                    }
                } else {
                    avatarUrl = (this.plugin.settings.tweetWidgetAvatarUrl || this.currentSettings.avatarUrl || '').trim();
                    if (!avatarUrl) avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
                }
                const av = avatarsDiv.createEl('img', { attr: { src: avatarUrl, width: 24, height: 24, title: r.userName || r.userId || '' } });
                av.className = 'tweet-reacted-avatar-img';
                av.style.zIndex = String(10 + maxAvatars - idx); // 重なり順
            });
            if (usersArr.length > maxAvatars) {
                const more = avatarsDiv.createDiv({ cls: 'tweet-reacted-avatar-more', text: `+${usersArr.length - maxAvatars}` });
            }
        }
    }

    private showMoreMenu(event: MouseEvent, post: TweetWidgetPost) {
        const menu = new Menu();

        menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(() => {
            this.editingPostId = post.id;
            this.replyingToParentId = null;
            this.attachedFiles = post.files ? [...post.files] : [];
            this.renderPostUI(this.widgetEl);
            const input = this.widgetEl.querySelector('.tweet-textarea-main') as HTMLTextAreaElement;
            if (input) {
                input.value = post.text;
                input.focus();
            }
        }));
        
        if (post.deleted) {
            menu.addItem(item => item.setTitle('復元').setIcon('rotate-ccw').onClick(async () => {
                post.deleted = false;
                post.updated = Date.now();
                await this.saveTweetsToFile();
                this.renderPostUI(this.widgetEl);
            }));
        } else {
            menu.addItem(item => item.setTitle('非表示').setIcon('eye-off').onClick(async () => {
                post.deleted = true;
                post.updated = Date.now();
                await this.saveTweetsToFile();
                this.renderPostUI(this.widgetEl);
            }));
        }
        menu.addItem(item => item.setTitle('⚠️ 完全削除').setIcon('x-circle')
            .onClick(async () => {
                if (!confirm('このつぶやきを完全に削除しますか？（元に戻せません）')) return;
                this.currentSettings.posts = this.currentSettings.posts.filter(t => t.id !== post.id);
                await this.saveTweetsToFile();
                this.renderPostUI(this.widgetEl);
            })
        );
        menu.addItem(item => item
            .setTitle('🧹 スレッドを完全削除')
            .setIcon('trash')
            .onClick(async () => {
                if (!confirm('このスレッド（親＋リプライ）を完全に削除しますか？（元に戻せません）')) return;
                // 親＋リプライ＋多段リプライをすべて削除
                const threadIds = this.collectThreadIdsRecursive(post.id, this.currentSettings.posts);
                this.currentSettings.posts = this.currentSettings.posts.filter(t => !threadIds.includes(t.id));
                await this.saveTweetsToFile();
                this.renderPostUI(this.widgetEl);
            })
        );
        menu.addSeparator();

        const addMenuItems = (
            sectionTitle: string,
            options: (string | null)[],
            currentValue: string | null | undefined,
            setValue: (v: any) => void,
            labelMap?: Record<string, string>
        ) => {
            menu.addItem(item => item.setTitle(sectionTitle).setDisabled(true));
            options.forEach(option => {
                let label = option ? option.charAt(0).toUpperCase() + option.slice(1) : "None";
                if (labelMap && option && labelMap[option]) label += `（${labelMap[option]}）`;
                menu.addItem(item => item
                    .setTitle(label)
                    .setChecked(currentValue === option)
                    .onClick(async () => {
                        setValue(option);
                        await this.saveTweetsToFile();
                        this.renderPostUI(this.widgetEl);
                    })
                )
            });
        };

        addMenuItems("Visibility", ["public", "private", "draft"], post.visibility, v => post.visibility = v);
        menu.addSeparator();
        addMenuItems(
            "Note Quality",
            ["fleeting", "literature", "permanent"],
            post.noteQuality,
            v => post.noteQuality = v,
            { fleeting: "アイデア", literature: "文献", permanent: "永久" }
        );
        menu.addSeparator();
        addMenuItems("Task Status", [null, "todo", "doing", "done"], post.taskStatus, v => post.taskStatus = v);
        menu.addSeparator();

        menu.addItem(item => item
            .setTitle("Open/Create Context Note")
            .setIcon("file-text")
            .onClick(async () => {
                let notePath = post.contextNote;
                const date = new Date(post.created).toISOString().split('T')[0];
                const sanitizedText = post.text.slice(0, 30).replace(/[\\/:*?"<>|#\[\]]/g, '').trim();
                let contextFolder = "ContextNotes";
                const baseFolder = (this.plugin as any).settings.baseFolder;
                if (baseFolder) {
                    contextFolder = baseFolder + '/ContextNotes';
                }
                if (!await this.app.vault.adapter.exists(contextFolder)) {
                    await this.app.vault.createFolder(contextFolder);
                }
                if (!notePath) {
                    notePath = `${contextFolder}/${date}-${sanitizedText || 'note'}.md`;
                    post.contextNote = notePath;
                    await this.saveTweetsToFile();
                    this.renderPostUI(this.widgetEl);
                }
                if (!await this.app.vault.adapter.exists(notePath)) {
                    await this.app.vault.create(notePath, `> ${post.text}\n\n---\n\n`);
                }
                const file = this.app.vault.getAbstractFileByPath(notePath);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf(true).openFile(file);
                } else {
                    new Notice("Context note not found!");
                }
            })
        );

        menu.showAtMouseEvent(event);
    }

    private formatTimeAgo(time: number): string {
        const now = Date.now();
        const diff = Math.floor((now - time) / 1000);
        if (diff < 60) return `${diff}s`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
        const d = new Date(time);
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    }

    private async readFileAsDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    private wrapSelection(input: HTMLTextAreaElement, wrapper: string) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const value = input.value;
        const selectedText = value.substring(start, end);
        const replacement = wrapper + selectedText + wrapper;
        input.value = value.substring(0, start) + replacement + value.substring(end);
        input.selectionStart = start + wrapper.length;
        input.selectionEnd = end + wrapper.length;
        input.focus();
    }

    updateExternalSettings(newSettings: any) {
        this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...(newSettings || {}) };
        this.renderPostUI(this.widgetEl);
    }

    private getTweetDbPath(): string {
        const settings = (this.plugin as any).settings || {};
        const location = settings.tweetDbLocation || 'vault';
        if (location === 'custom' && settings.tweetDbCustomPath) {
            return settings.tweetDbCustomPath;
        } else {
            return `${this.plugin.manifest.dir || '.obsidian/plugins/widget-board'}/data/posts.json`;
        }
    }

    private renderReplyModal(container: HTMLElement, post: TweetWidgetPost) {
        // バックドロップとモーダルはdocument.body直下に
        const backdrop = document.createElement('div');
        backdrop.className = 'tweet-reply-modal-backdrop';
        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                this.replyModalPost = null;
                this.renderPostUI(this.widgetEl);
                backdrop.remove();
            }
        };
        document.body.appendChild(backdrop);
        const modal = document.createElement('div');
        modal.className = 'tweet-reply-modal';
        backdrop.appendChild(modal);
        // --- ウィジェット中央の絶対座標を取得する関数 ---
        function getWidgetAbsoluteCenter(widgetEl: HTMLElement): { x: number, y: number } {
            const rect = widgetEl.getBoundingClientRect();
            let x = rect.left + rect.width / 2 + window.scrollX;
            let y = rect.top + rect.height / 2 + window.scrollY;
            let parent = widgetEl.parentElement;
            while (parent) {
                if (parent.scrollLeft) x -= parent.scrollLeft;
                if (parent.scrollTop) y -= parent.scrollTop;
                parent = parent.parentElement;
            }
            return { x, y };
        }
        setTimeout(() => {
            const { x, y } = getWidgetAbsoluteCenter(this.widgetEl);
            modal.style.position = 'absolute';
            modal.style.left = `${x}px`;
            modal.style.top = `${y}px`;
            modal.style.transform = 'translate(-50%, -50%)';
            modal.style.margin = '0';
            modal.style.zIndex = '100000';
        }, 0);
        // 以降、modalに内容をappendChildで追加
        // ヘッダー
        const header = document.createElement('div');
        header.className = 'tweet-reply-modal-header';
        const headerTitle = document.createElement('span');
        headerTitle.textContent = '返信';
        header.appendChild(headerTitle);
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.className = 'tweet-reply-modal-close';
        closeBtn.onclick = () => {
            this.replyModalPost = null;
            this.renderPostUI(this.widgetEl);
            backdrop.remove();
        };
        header.appendChild(closeBtn);
        modal.appendChild(header);
        // 返信先ポスト簡易表示
        const postBox = document.createElement('div');
        postBox.className = 'tweet-reply-modal-post';
        modal.appendChild(postBox);
        const postsById = new Map<string, TweetWidgetPost>([[post.id, post]]);
        this.renderSinglePost(post, postBox, postsById);
        // 入力欄
        const inputArea = document.createElement('div');
        inputArea.className = 'tweet-reply-modal-input';
        modal.appendChild(inputArea);
        const textarea = document.createElement('textarea');
        textarea.className = 'tweet-reply-modal-textarea';
        textarea.placeholder = '返信をポスト';
        inputArea.appendChild(textarea);
        textarea.focus();
        // 送信ボタン
        const replyBtn = document.createElement('button');
        replyBtn.className = 'tweet-reply-modal-btn';
        replyBtn.textContent = '返信';
        replyBtn.onclick = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            const newPost: TweetWidgetPost = {
                id: 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                text,
                created: Date.now(),
                updated: Date.now(),
                files: [],
                like: 0,
                liked: false,
                retweet: 0,
                retweeted: false,
                edited: false,
                replyCount: 0,
                deleted: false,
                bookmark: false,
                contextNote: null,
                threadId: post.id,
                visibility: 'public',
                noteQuality: 'fleeting',
                taskStatus: null,
                tags: parseTags(text),
                links: parseLinks(text),
                userId: this.currentSettings.userId || '@you',
                userName: this.currentSettings.userName || 'あなた',
            };
            this.currentSettings.posts.unshift(newPost);
            post.replyCount = (post.replyCount || 0) + 1;
            post.updated = Date.now();
            await this.saveTweetsToFile();
            this.replyModalPost = null;
            this.renderPostUI(this.widgetEl);
            backdrop.remove();
            // AI自動リプライは親ポスト（post）を渡す
            if (newPost.userId && newPost.userId.startsWith('@ai-')) {
                // AIの投稿にはAI自動リプライを発火しない
            } else if (shouldAutoReply(newPost, this.plugin.settings)) {
                generateAiReply({
                    tweet: newPost,
                    allTweets: this.currentSettings.posts,
                    llmGemini: this.plugin.settings.llm?.gemini || { apiKey: '', model: 'gemini-2.0-flash-exp' },
                    saveReply: async (reply) => {
                        this.currentSettings.posts.unshift(reply);
                        newPost.replyCount = (newPost.replyCount || 0) + 1;
                        newPost.updated = Date.now();
                        await this.saveTweetsToFile();
                        this.renderPostUI(this.widgetEl);
                    },
                    parseTags: parseTags.bind(this),
                    parseLinks: parseLinks.bind(this),
                    onError: (err) => new Notice('AI自動リプライ生成に失敗しました: ' + (err instanceof Error ? err.message : String(err))),
                    settings: this.plugin.settings,
                    delay: !isExplicitAiTrigger(newPost),
                }); // awaitしない
            }
        };
        inputArea.appendChild(replyBtn);
        // Escキーで閉じる
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.replyModalPost = null;
                this.renderPostUI(this.widgetEl);
                backdrop.remove();
            }
        });
    }

    // userIdからAIアバター配列のインデックスを決定
    private getAiAvatarIndex(userId: string, len: number): number {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        return Math.abs(hash) % len;
    }

    // --- 追加: スレッド内の全子孫ポストIDを再帰的に集める ---
    private collectThreadIdsRecursive(rootId: string, posts: TweetWidgetPost[]): string[] {
        const ids = [rootId];
        const children = posts.filter(t => t.threadId === rootId);
        for (const child of children) {
            ids.push(...this.collectThreadIdsRecursive(child.id, posts));
        }
        return ids;
    }
}