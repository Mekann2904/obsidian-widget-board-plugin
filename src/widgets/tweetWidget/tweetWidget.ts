import { App, Notice, setIcon, MarkdownRenderer, Menu, TFile } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main';
import { GeminiProvider } from '../../llm/gemini/geminiApi';
import { deobfuscate } from '../../utils';
import { geminiPrompt } from 'src/llm/gemini/prompts';
import { generateAiReply, shouldAutoReply, findLatestAiUserIdInThread, getFullThreadHistory, generateAiUserId } from './aiReply';
import { parseTags, parseLinks, formatTimeAgo, readFileAsDataUrl, wrapSelection } from './tweetWidgetUtils';
import { loadTweetsFromFile, saveTweetsToFile } from './tweetWidgetDb';
import { loadAiRepliesFromFile, saveAiRepliesToFile } from './tweetWidgetAiDb';

export interface TweetWidgetFile {
    name: string;
    type: string;
    dataUrl: string;
}

export interface TweetWidgetTweet {
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
    tweets: TweetWidgetTweet[];
    avatarUrl?: string;
    userName?: string;
    userId?: string;
    verified?: boolean;
}

export const DEFAULT_TWEET_WIDGET_SETTINGS: TweetWidgetSettings = {
    tweets: [],
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
    private editingTweetId: string | null = null;
    private replyingToParentId: string | null = null;
    private currentFilter: 'all' | 'active' | 'deleted' | 'bookmark' = 'active';
    private detailTweetId: string | null = null;
    private replyModalTweet: TweetWidgetTweet | null = null;

    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;
        this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS };
        this.loadTweetsFromFile().then(() => {
            this.renderTweetUI(this.widgetEl);
        });
        config.settings = this.currentSettings;
        this.attachedFiles = [];
        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'tweet-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);
        this.renderTweetUI(this.widgetEl);
        return this.widgetEl;
    }

    private async loadTweetsFromFile() {
        const dbPath = this.getTweetDbPath();
        try {
            const exists = await this.app.vault.adapter.exists(dbPath);
            if (exists) {
                const raw = await this.app.vault.adapter.read(dbPath);
                // Ensure default values for new fields on older tweets
                const loadedSettings = JSON.parse(raw);
                loadedSettings.tweets = loadedSettings.tweets.map((t: any) => ({
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

    private renderTweetUI(container: HTMLElement) {
        container.empty();
        // --- 返信モーダル ---
        if (this.replyModalTweet) {
            this.renderReplyModal(container, this.replyModalTweet);
        }
        // --- 詳細表示ヘッダー ---
        if (this.detailTweetId) {
            const header = container.createDiv({ cls: 'tweet-detail-header' });
            const backBtn = header.createEl('button', { cls: 'tweet-detail-header-back', text: '←' });
            backBtn.onclick = () => {
                this.detailTweetId = null;
                this.renderTweetUI(this.widgetEl);
            };
            header.createDiv({ cls: 'tweet-detail-header-title', text: 'ポスト' });
        }
        // --- フィルタUIを最上部に生成（詳細時は非表示） ---
        if (!this.detailTweetId) {
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
                this.detailTweetId = null;
                this.renderTweetUI(this.widgetEl);
            };
        }
        // --- 投稿欄 ---
        if (!this.detailTweetId) {
            const postBox = container.createDiv({ cls: 'tweet-post-box' });
            const avatar = postBox.createDiv({ cls: 'tweet-avatar-large' });
            let avatarUrl: string = '';
            if (this.replyingToParentId) {
                const replyingToTweet = this.currentSettings.tweets.find(t => t.id === this.replyingToParentId);
                if (replyingToTweet) {
                    if (replyingToTweet.userId && replyingToTweet.userId.startsWith('@ai-')) {
                        // AIアバター選択ロジック
                        const aiAvatars = (this.plugin.settings.aiAvatarUrls || '').split(',').map(s => s.trim()).filter(Boolean);
                        if (aiAvatars.length > 0) {
                            const idx = this.getAiAvatarIndex(replyingToTweet.userId, aiAvatars.length);
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
                const replyingToTweet = this.currentSettings.tweets.find(t => t.id === this.replyingToParentId);
                if (replyingToTweet) {
                    const replyInfoDiv = replyInfoContainer.createDiv({ cls: 'tweet-reply-info' });
                    replyInfoDiv.setText(`${this.currentSettings.userId || '@you'} さんに返信中`);
                    const cancelReplyBtn = replyInfoDiv.createEl('button', { text: 'キャンセル', cls: 'tweet-cancel-reply-btn' });
                    cancelReplyBtn.onclick = () => {
                        this.replyingToParentId = null;
                        this.renderTweetUI(this.widgetEl);
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

            const postBtn = bottomBar.createEl('button', { cls: 'tweet-post-btn-main', text: this.editingTweetId ? '編集完了' : (this.replyingToParentId ? '返信する' : 'ポストする') });
            postBtn.onclick = async () => {
                const text = input.value.trim();
                if (!text && this.attachedFiles.length === 0) return;

                if (this.editingTweetId) {
                    const idx = this.currentSettings.tweets.findIndex(t => t.id === this.editingTweetId);
                    if (idx !== -1) {
                        const tweet = this.currentSettings.tweets[idx];
                        tweet.text = text;
                        tweet.files = this.attachedFiles;
                        tweet.edited = true;
                        tweet.updated = Date.now();
                        tweet.tags = parseTags(text);
                        tweet.links = parseLinks(text);
                    }
                    this.editingTweetId = null;
                    new Notice('つぶやきを編集しました');
                } else {
                    const newTweet: TweetWidgetTweet = {
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
                    };

                    this.currentSettings.tweets.unshift(newTweet);

                    if (shouldAutoReply(newTweet)) {
                        await generateAiReply({
                            tweet: newTweet,
                            allTweets: this.currentSettings.tweets,
                            llmGemini: this.plugin.settings.llm?.gemini || { apiKey: '', model: 'gemini-2.0-flash-exp' },
                            saveReply: async (reply) => {
                                this.currentSettings.tweets.unshift(reply);
                                newTweet.replyCount = (newTweet.replyCount || 0) + 1;
                                newTweet.updated = Date.now();
                                await this.saveTweetsToFile();
                                this.renderTweetUI(this.widgetEl);
                            },
                            parseTags: parseTags.bind(this),
                            parseLinks: parseLinks.bind(this),
                            onError: (err) => new Notice('AI自動リプライ生成に失敗しました: ' + (err instanceof Error ? err.message : String(err)))
                        });
                    }

                    if (this.replyingToParentId) {
                        const originalTweet = this.currentSettings.tweets.find(t => t.id === this.replyingToParentId);
                        if (originalTweet) {
                            originalTweet.replyCount = (originalTweet.replyCount || 0) + 1;
                            originalTweet.updated = Date.now();
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
                this.renderTweetUI(this.widgetEl);
            };

            input.addEventListener('input', () => {
                this.updateCharCount(charCount, input.value.length);
            });
        }
        // --- リスト本体 ---
        let listEl = container.createDiv({ cls: 'tweet-list-main' });
        this.renderTweetList(listEl);
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

    private renderTweetList(listEl: HTMLElement) {
        listEl.empty();
        let filteredTweets: TweetWidgetTweet[];
        if (this.detailTweetId) {
            // --- Twitter風 詳細表示 ---
            const all = this.currentSettings.tweets;
            const target = all.find(t => t.id === this.detailTweetId);
            if (!target) return;
            // 親ツイート（1件）
            let parent: TweetWidgetTweet | null = null;
            if (target.threadId) {
                parent = all.find(t => t.id === target.threadId) || null;
            }
            // 子リプライ一覧
            const replies = all.filter(t => t.threadId === target.id);
            // --- 親ツイート ---
            if (parent) {
                listEl.createDiv({ cls: 'tweet-detail-section-sep' });
                const parentWrap = listEl.createDiv({ cls: 'tweet-detail-parent' });
                const tweetsById = new Map<string, TweetWidgetTweet>([[parent.id, parent]]);
                this.renderSingleTweet(parent, parentWrap, tweetsById);
                parentWrap.onclick = (e) => {
                    if ((e.target as HTMLElement).closest('.tweet-action-bar-main')) return;
                    this.detailTweetId = parent!.id;
                    this.renderTweetUI(this.widgetEl);
                };
            }
            // --- 選択ツイート ---
            listEl.createDiv({ cls: 'tweet-detail-section-sep' });
            const targetWrap = listEl.createDiv({ cls: 'tweet-detail-main' });
            const tweetsById = new Map<string, TweetWidgetTweet>([[target.id, target]]);
            this.renderSingleTweet(target, targetWrap, tweetsById);
            // --- 返信欄 ---
            const replyBox = listEl.createDiv({ cls: 'tweet-detail-reply-box' });
            const avatar = replyBox.createDiv({ cls: 'tweet-detail-reply-avatar' });
            let avatarUrl = (this.plugin.settings.tweetWidgetAvatarUrl || this.currentSettings.avatarUrl || '').trim();
            if (!avatarUrl) avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
            avatar.createEl('img', { attr: { src: avatarUrl as string, width: 40, height: 40 } });
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
                const newTweet: TweetWidgetTweet = {
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
                };
                this.currentSettings.tweets.unshift(newTweet);
                target.replyCount = (target.replyCount || 0) + 1;
                target.updated = Date.now();
                await this.saveTweetsToFile();
                textarea.value = '';
                this.renderTweetUI(this.widgetEl);
            };
            inputArea.appendChild(replyBtn);
            // --- 子リプライ一覧 ---
            listEl.createDiv({ cls: 'tweet-detail-section-sep' });
            if (replies.length > 0) {
                replies.forEach(reply => {
                    const replyWrap = listEl.createDiv({ cls: 'tweet-detail-reply' });
                    const replyMap = new Map<string, TweetWidgetTweet>([[reply.id, reply]]);
                    this.renderSingleTweet(reply, replyWrap, replyMap);
                    replyWrap.onclick = (e) => {
                        if ((e.target as HTMLElement).closest('.tweet-action-bar-main')) return;
                        this.detailTweetId = reply.id;
                        this.renderTweetUI(this.widgetEl);
                    };
                });
            } else {
                listEl.createDiv({ cls: 'tweet-detail-no-reply', text: 'リプライはありません' });
            }
            listEl.createDiv({ cls: 'tweet-detail-section-sep' });
            return;
        }
        // --- フィルタ適用 ---
        if (this.currentFilter === 'all') {
            filteredTweets = this.currentSettings.tweets;
        } else if (this.currentFilter === 'deleted') {
            filteredTweets = this.currentSettings.tweets.filter(t => t.deleted);
        } else if (this.currentFilter === 'bookmark') {
            filteredTweets = this.currentSettings.tweets.filter(t => t.bookmark);
        } else {
            filteredTweets = this.currentSettings.tweets.filter(t => !t.deleted);
        }
        if (filteredTweets.length === 0) {
            listEl.createEl('div', { cls: 'tweet-empty-notice', text: 'まだつぶやきがありません。' });
            return;
        }
        // --- 通常時はスレッド表示 ---
        const tweetsById = new Map<string, TweetWidgetTweet>();
        filteredTweets.forEach(t => tweetsById.set(t.id, t));
        const repliesByParentId = new Map<string, TweetWidgetTweet[]>();
        filteredTweets.forEach(t => {
            if (t.threadId) {
                const replies = repliesByParentId.get(t.threadId) || [];
                replies.push(t);
                repliesByParentId.set(t.threadId, replies);
            }
        });
        repliesByParentId.forEach(replies => replies.sort((a, b) => a.created - b.created));
        const memo = new Map<string, number>();
        const getLatestTimestampInThread = (tweetId: string): number => {
            if (memo.has(tweetId)) return memo.get(tweetId)!;
            const tweet = tweetsById.get(tweetId);
            if (!tweet) return 0;
            let maxTimestamp = tweet.updated || tweet.created;
            const replies = repliesByParentId.get(tweetId) || [];
            for (const reply of replies) {
                maxTimestamp = Math.max(maxTimestamp, getLatestTimestampInThread(reply.id));
            }
            memo.set(tweetId, maxTimestamp);
            return maxTimestamp;
        };
        const rootItems = filteredTweets.filter(t => !t.threadId || !tweetsById.has(t.threadId));
        rootItems.sort((a, b) => {
            const lastActivityA = getLatestTimestampInThread(a.id);
            const lastActivityB = getLatestTimestampInThread(b.id);
            return lastActivityB - lastActivityA;
        });
        const displayList: { tweet: TweetWidgetTweet, level: number }[] = [];
        const addRepliesToDisplayList = (parentId: string, currentLevel: number) => {
            const replies = repliesByParentId.get(parentId);
            if (replies) {
                replies.forEach(reply => {
                    displayList.push({ tweet: reply, level: currentLevel + 1 });
                    addRepliesToDisplayList(reply.id, currentLevel + 1);
                });
            }
        };
        rootItems.forEach(tweet => {
            displayList.push({ tweet, level: 0 });
            addRepliesToDisplayList(tweet.id, 0);
        });
        displayList.forEach(({ tweet, level }) => {
            const wrapper = listEl.createDiv({ cls: 'tweet-thread-wrapper' });
            wrapper.setAttribute('data-tweet-id', tweet.id);
            wrapper.style.paddingLeft = `${level * 25}px`;
            const tweetContainer = wrapper.createDiv({ cls: 'tweet-item-container' });
            if (level > 0) {
                tweetContainer.style.borderLeft = '2px solid rgba(128, 128, 128, 0.2)';
                tweetContainer.style.paddingLeft = '12px';
            }
            this.renderSingleTweet(tweet, tweetContainer, tweetsById);
            // --- クリックで詳細表示 ---
            wrapper.onclick = (e) => {
                if ((e.target as HTMLElement).closest('.tweet-action-bar-main')) return;
                this.detailTweetId = tweet.id;
                this.renderTweetUI(this.widgetEl);
            };
        });
    }

    private renderSingleTweet(tweet: TweetWidgetTweet, container: HTMLElement, tweetsById: Map<string, TweetWidgetTweet>) {
        container.empty();
        const item = container.createDiv({ cls: 'tweet-item-main' });

        const header = item.createDiv({ cls: 'tweet-item-header-main' });
        const avatar = header.createDiv({ cls: 'tweet-item-avatar-main' });
        let avatarUrl: string = '';
        if (tweet.userId && tweet.userId.startsWith('@ai-')) {
            const aiAvatars = (this.plugin.settings.aiAvatarUrls || '').split(',').map(s => s.trim()).filter(Boolean);
            if (aiAvatars.length > 0) {
                const idx = this.getAiAvatarIndex(tweet.userId, aiAvatars.length);
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
        userInfo.createEl('span', { text: tweet.userName || this.currentSettings.userName || 'あなた', cls: 'tweet-item-username-main' });
        if (tweet.verified || this.currentSettings.verified) {
            const badge = userInfo.createSpan({ cls: 'tweet-item-badge-main' });
            setIcon(badge, 'badge-check');
        }
        userInfo.createEl('span', { text: tweet.userId || this.currentSettings.userId || '@you', cls: 'tweet-item-userid-main' });
        const timeText = '・' + this.formatTimeAgo(tweet.created) + (tweet.edited ? ' (編集済)' : '');
        userInfo.createEl('span', { text: timeText, cls: 'tweet-item-time-main' });

        if (tweet.threadId) {
            const parentTweetExists = tweetsById.has(tweet.threadId);
            const replyToDiv = item.createDiv({ cls: 'tweet-item-reply-to' });

            if (parentTweetExists) {
                const parentUser = this.currentSettings.userId || '@you';
                replyToDiv.setText(`${parentUser} さんへの返信`);
                replyToDiv.title = '元のツイートに移動';
                replyToDiv.onclick = (e) => {
                    e.stopPropagation();
                    const parentEl = this.widgetEl.querySelector(`[data-tweet-id="${tweet.threadId}"]`) as HTMLElement;
                    if (parentEl) {
                        parentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        parentEl.addClass('highlight');
                        setTimeout(() => parentEl.removeClass('highlight'), 1500);
                    }
                };
            } else {
                replyToDiv.setText('削除されたツイートへの返信');
                replyToDiv.addClass('deleted-reply');
            }
        }

        const textDiv = item.createDiv({ cls: 'tweet-item-text-main' });
        // --- AIリプライがJSON形式ならreplyだけ抽出 ---
        let displayText = tweet.text;
        try {
            const parsed = JSON.parse(displayText);
            if (parsed && typeof parsed.reply === 'string') {
                displayText = parsed.reply;
            }
        } catch {}
        MarkdownRenderer.render(this.app, displayText, textDiv, this.app.workspace.getActiveFile()?.path || '', this.plugin);

        if (tweet.files && tweet.files.length) {
            const filesDiv = item.createDiv({ cls: `tweet-item-files-main files-count-${tweet.files.length}` });
            tweet.files.forEach(file => {
                const img = filesDiv.createEl('img', { attr: { src: file.dataUrl, alt: file.name } });
                img.className = 'tweet-item-image-main';
            });
        }

        const metadataDiv = item.createDiv({ cls: 'tweet-item-metadata-main' });
        if (tweet.bookmark) metadataDiv.createEl('span', { cls: 'tweet-chip bookmark', text: 'Bookmarked' });
        if (tweet.visibility && tweet.visibility !== 'public') metadataDiv.createEl('span', { cls: 'tweet-chip visibility', text: tweet.visibility });
        if (tweet.noteQuality && tweet.noteQuality !== 'fleeting') metadataDiv.createEl('span', { cls: 'tweet-chip quality', text: tweet.noteQuality });
        if (tweet.taskStatus) metadataDiv.createEl('span', { cls: 'tweet-chip status', text: tweet.taskStatus });

        if (tweet.tags && tweet.tags.length > 0) {
            const tagsDiv = item.createDiv({ cls: 'tweet-item-tags-main' });
            tweet.tags.forEach(tag => {
                tagsDiv.createEl('a', { text: `#${tag}`, cls: 'tweet-tag', href: `#${tag}` });
            });
        }

        const actionBar = item.createDiv({ cls: 'tweet-action-bar-main' });

        const replyBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main reply' });
        setIcon(replyBtn, 'message-square');
        replyBtn.onclick = () => {
            this.replyModalTweet = tweet;
            this.renderTweetUI(this.widgetEl);
        };
        replyBtn.createSpan({ text: String(tweet.replyCount || 0), cls: 'tweet-action-count-main' });

        const rtBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main retweet' });
        setIcon(rtBtn, 'repeat-2');
        if (tweet.retweeted) rtBtn.addClass('active');
        rtBtn.onclick = async () => {
            tweet.retweeted = !tweet.retweeted;
            tweet.retweet = (tweet.retweet || 0) + (tweet.retweeted ? 1 : -1);
            await this.saveTweetsToFile();
            this.renderTweetUI(this.widgetEl);
        };
        rtBtn.createSpan({ text: String(tweet.retweet || 0), cls: 'tweet-action-count-main' });

        const likeBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main like' });
        setIcon(likeBtn, 'heart');
        if (tweet.liked) likeBtn.addClass('active');
        likeBtn.onclick = async () => {
            tweet.liked = !tweet.liked;
            tweet.like = (tweet.like || 0) + (tweet.liked ? 1 : -1);
            await this.saveTweetsToFile();
            this.renderTweetUI(this.widgetEl);
        };
        likeBtn.createSpan({ text: String(tweet.like || 0), cls: 'tweet-action-count-main' });

        const bookmarkBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main bookmark' });
        setIcon(bookmarkBtn, 'bookmark');
        if (tweet.bookmark) bookmarkBtn.addClass('active');
        bookmarkBtn.onclick = async () => {
            tweet.bookmark = !tweet.bookmark;
            await this.saveTweetsToFile();
            this.renderTweetUI(this.widgetEl);
        };

        const moreBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main more' });
        setIcon(moreBtn, 'more-horizontal');
        moreBtn.onclick = (e) => this.showMoreMenu(e, tweet);

        // --- Geminiリプライボタン（自分のツイートのみ） ---
        if ((this.currentSettings.userId === '@you' || !this.currentSettings.userId) && tweet.id && this.plugin.settings.llm?.gemini?.apiKey) {
            const geminiBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main gemini-reply' });
            setIcon(geminiBtn, 'bot');
            geminiBtn.title = 'Geminiでリプライ生成';
            geminiBtn.onclick = async (e) => {
                e.stopPropagation();
                geminiBtn.setAttribute('disabled', 'true');
                geminiBtn.innerHTML = '...';
                try {
                    const thread = getFullThreadHistory(tweet, this.currentSettings.tweets);
                    const threadText = thread.map((t: TweetWidgetTweet) =>
                        (t.userId && t.userId.startsWith('@ai-') ? 'AI: ' : 'あなた: ') + t.text
                    ).join('\n');
                    const promptText = geminiPrompt.replace('{tweet}', threadText);
                    let replyText = await GeminiProvider.generateReply(promptText, {
                        apiKey: deobfuscate(this.plugin.settings.llm?.gemini?.apiKey || ''),
                        tweet: tweet,
                        thread: thread,
                        model: this.plugin.settings.llm?.gemini?.model || 'gemini-2.0-flash-exp',
                        tweetText: threadText,
                    });
                    // 万一JSON形式で返ってきた場合もreplyだけ抽出
                    try {
                        const parsed = JSON.parse(replyText);
                        if (parsed && typeof parsed.reply === 'string') {
                            replyText = parsed.reply;
                        }
                    } catch {}
                    // AIリプライとして投稿
                    const aiReply: TweetWidgetTweet = {
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
                        threadId: tweet.id,
                        visibility: 'public',
                        noteQuality: 'fleeting',
                        taskStatus: null,
                        tags: parseTags(replyText),
                        links: parseLinks(replyText),
                        userId: findLatestAiUserIdInThread(tweet, this.currentSettings.tweets) || generateAiUserId(),
                        userName: 'AI',
                        verified: true
                    };
                    this.currentSettings.tweets.unshift(aiReply);
                    tweet.replyCount = (tweet.replyCount || 0) + 1;
                    tweet.updated = Date.now();
                    await this.saveTweetsToFile();
                    this.renderTweetUI(this.widgetEl);
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
        if (tweet.userId && tweet.userId.startsWith('@ai-') && this.plugin.settings.showAiHistory) {
            const aiHistoryDiv = item.createDiv({ cls: 'tweet-ai-history' });
            aiHistoryDiv.createEl('div', { text: 'このAIとの会話履歴:', cls: 'tweet-ai-history-label' });
            const aiHistory = getFullThreadHistory(tweet, this.currentSettings.tweets);
            aiHistory.forEach((h: TweetWidgetTweet) => {
                aiHistoryDiv.createEl('div', { text: `${h.userName || (h.userId && h.userId.startsWith('@ai-') ? 'AI' : 'あなた')}: ${h.text}`, cls: 'tweet-ai-history-item' });
            });
        }
    }

    private showMoreMenu(event: MouseEvent, tweet: TweetWidgetTweet) {
        const menu = new Menu();

        menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(() => {
            this.editingTweetId = tweet.id;
            this.replyingToParentId = null;
            this.attachedFiles = tweet.files ? [...tweet.files] : [];
            this.renderTweetUI(this.widgetEl);
            const input = this.widgetEl.querySelector('.tweet-textarea-main') as HTMLTextAreaElement;
            if (input) {
                input.value = tweet.text;
                input.focus();
            }
        }));
        
        if (tweet.deleted) {
            menu.addItem(item => item.setTitle('復元').setIcon('rotate-ccw').onClick(async () => {
                tweet.deleted = false;
                tweet.updated = Date.now();
                await this.saveTweetsToFile();
                this.renderTweetUI(this.widgetEl);
            }));
        } else {
            menu.addItem(item => item.setTitle('非表示').setIcon('eye-off').onClick(async () => {
                tweet.deleted = true;
                tweet.updated = Date.now();
                await this.saveTweetsToFile();
                this.renderTweetUI(this.widgetEl);
            }));
        }
        menu.addItem(item => item.setTitle('⚠️ 完全削除').setIcon('x-circle')
            .onClick(async () => {
                if (!confirm('このつぶやきを完全に削除しますか？（元に戻せません）')) return;
                this.currentSettings.tweets = this.currentSettings.tweets.filter(t => t.id !== tweet.id);
                await this.saveTweetsToFile();
                this.renderTweetUI(this.widgetEl);
            }));
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
                        this.renderTweetUI(this.widgetEl);
                    })
                )
            });
        };

        addMenuItems("Visibility", ["public", "private", "draft"], tweet.visibility, v => tweet.visibility = v);
        menu.addSeparator();
        addMenuItems(
            "Note Quality",
            ["fleeting", "literature", "permanent"],
            tweet.noteQuality,
            v => tweet.noteQuality = v,
            { fleeting: "アイデア", literature: "文献", permanent: "永久" }
        );
        menu.addSeparator();
        addMenuItems("Task Status", [null, "todo", "doing", "done"], tweet.taskStatus, v => tweet.taskStatus = v);
        menu.addSeparator();

        menu.addItem(item => item
            .setTitle("Open/Create Context Note")
            .setIcon("file-text")
            .onClick(async () => {
                let notePath = tweet.contextNote;
                const date = new Date(tweet.created).toISOString().split('T')[0];
                const sanitizedText = tweet.text.slice(0, 30).replace(/[\\/:*?"<>|#\[\]]/g, '').trim();
                let contextFolder = "ContextNotes";
                const settings = (this.plugin as any).settings || {};
                if (settings.tweetDbLocation === 'custom' && settings.tweetDbCustomPath) {
                    const customBase = settings.tweetDbCustomPath.replace(/\/tweets\.json$/, '');
                    const customBase2 = settings.tweetDbCustomPath.replace(/\/tweets\.json$/, '').replace(/\/$/, '');
                    contextFolder = customBase2 + '/ContextNotes';
                }
                if (!await this.app.vault.adapter.exists(contextFolder)) {
                    await this.app.vault.createFolder(contextFolder);
                }
                if (!notePath) {
                    notePath = `${contextFolder}/${date}-${sanitizedText || 'note'}.md`;
                    tweet.contextNote = notePath;
                    await this.saveTweetsToFile();
                    this.renderTweetUI(this.widgetEl);
                }
                if (!await this.app.vault.adapter.exists(notePath)) {
                    await this.app.vault.create(notePath, `> ${tweet.text}\n\n---\n\n`);
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
        this.renderTweetUI(this.widgetEl);
    }

    private getTweetDbPath(): string {
        const settings = (this.plugin as any).settings || {};
        const location = settings.tweetDbLocation || 'vault';
        if (location === 'custom' && settings.tweetDbCustomPath) {
            return settings.tweetDbCustomPath;
        } else {
            return `${this.plugin.manifest.dir || '.obsidian/plugins/widget-board'}/data/tweets.json`;
        }
    }

    private renderReplyModal(container: HTMLElement, tweet: TweetWidgetTweet) {
        // バックドロップ
        const backdrop = container.createDiv({ cls: 'tweet-reply-modal-backdrop' });
        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                this.replyModalTweet = null;
                this.renderTweetUI(this.widgetEl);
            }
        };
        // モーダル本体
        const modal = backdrop.createDiv({ cls: 'tweet-reply-modal' });
        // ヘッダー
        const header = modal.createDiv({ cls: 'tweet-reply-modal-header' });
        header.createEl('span', { text: '返信' });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = () => {
            this.replyModalTweet = null;
            this.renderTweetUI(this.widgetEl);
        };
        // 返信先ツイート簡易表示
        const tweetBox = modal.createDiv({ cls: 'tweet-reply-modal-tweet' });
        const tweetsById = new Map<string, TweetWidgetTweet>([[tweet.id, tweet]]);
        this.renderSingleTweet(tweet, tweetBox, tweetsById);
        // 入力欄
        const inputArea = modal.createDiv({ cls: 'tweet-reply-modal-input' });
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
            const newTweet: TweetWidgetTweet = {
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
                threadId: tweet.id,
                visibility: 'public',
                noteQuality: 'fleeting',
                taskStatus: null,
                tags: parseTags(text),
                links: parseLinks(text),
            };
            this.currentSettings.tweets.unshift(newTweet);
            tweet.replyCount = (tweet.replyCount || 0) + 1;
            tweet.updated = Date.now();
            await this.saveTweetsToFile();
            this.replyModalTweet = null;
            this.renderTweetUI(this.widgetEl);
            // AI自動リプライは親ツイート（tweet）を渡す
            if (shouldAutoReply(newTweet)) {
                await generateAiReply({
                    tweet: tweet,
                    allTweets: this.currentSettings.tweets,
                    llmGemini: this.plugin.settings.llm?.gemini || { apiKey: '', model: 'gemini-2.0-flash-exp' },
                    saveReply: async (reply) => {
                        this.currentSettings.tweets.unshift(reply);
                        tweet.replyCount = (tweet.replyCount || 0) + 1;
                        tweet.updated = Date.now();
                        await this.saveTweetsToFile();
                        this.renderTweetUI(this.widgetEl);
                    },
                    parseTags: parseTags.bind(this),
                    parseLinks: parseLinks.bind(this),
                    onError: (err) => new Notice('AI自動リプライ生成に失敗しました: ' + (err instanceof Error ? err.message : String(err)))
                });
            }
        };
        inputArea.appendChild(replyBtn);
        // Escキーで閉じる
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.replyModalTweet = null;
                this.renderTweetUI(this.widgetEl);
            }
        });
    }

    // userIdからAIアバター配列のインデックスを決定
    private getAiAvatarIndex(userId: string, len: number): number {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        return Math.abs(hash) % len;
    }
}