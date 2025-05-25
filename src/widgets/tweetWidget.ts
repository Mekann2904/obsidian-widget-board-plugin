import { App, Notice, setIcon, MarkdownRenderer } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main';

export interface TweetWidgetFile {
    name: string;
    type: string;
    dataUrl: string;
}

export interface TweetWidgetTweet {
    text: string;
    created: number;
    files?: TweetWidgetFile[];
    like?: number;
    liked?: boolean;
    retweet?: number;
    retweeted?: boolean;
    edited?: boolean;
    id: string;
    replyTo?: string; 
    replyCount?: number;
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

const EMOJI_LIST = ['😀','😂','😍','🥺','😭','😊','😎','👍','🙏','🔥','🎉','💯','🥳','😇','🤔','😳','😅','😆','😢','😡','😱','🤗','😏','😴','😋','😜','😤','😇','😈','👀','👏','🙌','💪','🤝','💖','💔','✨','🌈','🍣','🍺','☕️','🍎','🍕','🍔','🍟','🍩','🍰','🎂','🍫','🍦','🍉','🍓','🍒','🍇','🍊','🍋','🍌','🍍','🥝','🥑','🥦','🥕','🌽','🍅','🥔','🍠','🍤','🍗','🍖','🍚','🍛','🍜','🍝','🍞','🥐','🥨','🥯','🥞','🧇','🥓','🥩','🥚','🧀','🥗','🥙','🥪','🥣','🥫','🍿','🍱','🍲','🍳','🥘','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍢','🍡','🍧','🍨','🍦','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🥧','🍯','🥜','🍞','🥐','🥖','🥨','🥯','🥞','🧇','🥓','🥩','🥚','🧀','🥗','🥙','🥪','🥣','🥫','🍿','🍱','🍲','🍳','🥘','🥟','🥠','🥡','🦀','🦞','🦐','🦑','🦪','🍢','🍡','🍧','🍨','🍦','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🥧','🍯','🥜'];

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
    private replyingToTweetId: string | null = null;
    private pluginFolder: string = '';

    // create, load, save, UIレンダリングなどのコア部分は変更なし
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
                this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...JSON.parse(raw) };
            } else {
                this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS };
                await this.saveTweetsToFile();
            }
        } catch (e) {
            this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS };
        }
    }

    private async saveTweetsToFile() {
        const dbPath = this.getTweetDbPath();
        const folder = dbPath.split('/').slice(0, -1).join('/');
        const exists = await this.app.vault.adapter.exists(folder);
        if (!exists) {
            await this.app.vault.adapter.mkdir(folder);
        }
        await this.app.vault.adapter.write(dbPath, JSON.stringify(this.currentSettings, null, 2));
    }

    private renderTweetUI(container: HTMLElement) {
        container.empty();
        const postBox = container.createDiv({ cls: 'tweet-post-box' });
        const avatar = postBox.createDiv({ cls: 'tweet-avatar-large' });
        let avatarUrl = (this.plugin.settings.tweetWidgetAvatarUrl && this.plugin.settings.tweetWidgetAvatarUrl.trim())
            ? this.plugin.settings.tweetWidgetAvatarUrl.trim()
            : (this.currentSettings.avatarUrl || '').trim();
        if (!avatarUrl) avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
        const avatarImg = document.createElement('img');
        avatarImg.src = avatarUrl;
        avatarImg.alt = 'avatar';
        avatarImg.width = 44;
        avatarImg.height = 44;
        avatarImg.style.borderRadius = '50%';
        avatar.appendChild(avatarImg);
        const inputArea = postBox.createDiv({ cls: 'tweet-input-area-main' });
        const replyInfoContainer = inputArea.createDiv({ cls: 'tweet-reply-info-container' });
        if (this.replyingToTweetId) {
            const replyingToTweet = this.currentSettings.tweets.find(t => t.id === this.replyingToTweetId);
            if (replyingToTweet) {
                const replyInfoDiv = replyInfoContainer.createDiv({ cls: 'tweet-reply-info' });
                replyInfoDiv.setText(`${this.currentSettings.userId || '@you'} さんに返信中`);
                const cancelReplyBtn = replyInfoDiv.createEl('button', { text: 'キャンセル', cls: 'tweet-cancel-reply-btn' });
                cancelReplyBtn.onclick = () => {
                    this.replyingToTweetId = null;
                    this.renderTweetUI(this.widgetEl);
                };
            } else {
                this.replyingToTweetId = null;
            }
        }
        const input = document.createElement('textarea');
        input.rows = 2;
        input.placeholder = this.replyingToTweetId ? '返信をポスト' : 'いまどうしてる？';
        input.classList.add('tweet-textarea-main');
        inputArea.appendChild(input);
        const filePreviewArea = inputArea.createDiv({ cls: 'tweet-file-preview' });
        this.renderFilePreview(filePreviewArea);
        const iconBar = inputArea.createDiv({ cls: 'tweet-icon-bar' });
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
        const postBtn = bottomBar.createEl('button', { cls: 'tweet-post-btn-main', text: this.editingTweetId ? '編集完了' : (this.replyingToTweetId ? '返信する' : 'ポストする') });
        postBtn.onclick = async () => {
            const text = input.value.trim();
            if (!text && this.attachedFiles.length === 0) return;
            if (this.editingTweetId) {
                const idx = this.currentSettings.tweets.findIndex(t => t.id === this.editingTweetId);
                if (idx !== -1) {
                    this.currentSettings.tweets[idx].text = text;
                    this.currentSettings.tweets[idx].files = this.attachedFiles;
                    this.currentSettings.tweets[idx].edited = true;
                }
                this.editingTweetId = null;
                new Notice('つぶやきを編集しました');
            } else if (this.replyingToTweetId) {
                this.currentSettings.tweets.unshift({ text, created: Date.now(), files: this.attachedFiles, like: 0, liked: false, retweet: 0, retweeted: false, edited: false, id: 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), replyTo: this.replyingToTweetId, replyCount: 0 });
                const originalTweet = this.currentSettings.tweets.find(t => t.id === this.replyingToTweetId);
                if (originalTweet) {
                    originalTweet.replyCount = (originalTweet.replyCount || 0) + 1;
                }
                this.replyingToTweetId = null;
                new Notice('返信を投稿しました');
            } else {
                this.currentSettings.tweets.unshift({ text, created: Date.now(), files: this.attachedFiles, like: 0, liked: false, retweet: 0, retweeted: false, edited: false, id: 'tw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8), replyCount: 0 });
                new Notice('つぶやきを投稿しました');
            }
            input.value = '';
            this.attachedFiles = [];
            await this.saveTweetsToFile();
            this.renderTweetUI(this.widgetEl);
        };
        input.addEventListener('input', () => {
            this.updateCharCount(charCount, input.value.length);
        });
        this.renderTweetList(container);
    }

    private renderFilePreview(container: HTMLElement) {
        container.empty();
        if (!this.attachedFiles.length) return;
        this.attachedFiles.forEach(file => {
            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = file.dataUrl;
                img.alt = file.name;
                img.className = 'tweet-file-image-main';
                img.style.maxWidth = '320px';
                img.style.maxHeight = '200px';
                img.style.marginRight = '8px';
                img.style.marginBottom = '4px';
                container.appendChild(img);
            } else {
                const link = document.createElement('a');
                link.href = file.dataUrl;
                link.download = file.name;
                link.textContent = file.name;
                link.className = 'tweet-file-link-main';
                link.style.display = 'inline-block';
                link.style.marginRight = '8px';
                link.style.marginBottom = '4px';
                container.appendChild(link);
            }
        });
    }

    private updateCharCount(el: HTMLElement, len: number) {
        el.textContent = `${len} / ${this.maxLength}`;
        if (len > this.maxLength) el.classList.add('tweet-char-over');
        else el.classList.remove('tweet-char-over');
    }

    // --- ここからが修正箇所 ---

    /**
     * ツイートリスト全体をスレッド形式で描画します。
     * 最新のアクティビティがあったスレッドを上部に表示し、親が削除されたリプライも表示します。
     */
    private renderTweetList(container: HTMLElement) {
        let listEl = container.querySelector('.tweet-list-main') as HTMLElement;
        if (!listEl) {
            listEl = container.createDiv({ cls: 'tweet-list-main' });
        } else {
            listEl.empty();
        }

        if (this.currentSettings.tweets.length === 0) {
            listEl.createEl('div', { text: 'まだつぶやきがありません。' });
            return;
        }

        // 1. データ準備
        const tweetsById = new Map<string, TweetWidgetTweet>();
        this.currentSettings.tweets.forEach(t => tweetsById.set(t.id, t));

        const repliesByParentId = new Map<string, TweetWidgetTweet[]>();
        this.currentSettings.tweets.forEach(t => {
            if (t.replyTo) {
                const replies = repliesByParentId.get(t.replyTo) || [];
                replies.push(t);
                repliesByParentId.set(t.replyTo, replies);
            }
        });
        repliesByParentId.forEach(replies => replies.sort((a, b) => a.created - b.created));

        // 2. スレッドごとの最終アクティビティ日時を計算する
        const threadLastActivity = new Map<string, number>();
        const memo = new Map<string, number>();
        const getLatestTimestampInThread = (tweetId: string): number => {
            if (memo.has(tweetId)) return memo.get(tweetId)!;

            const tweet = tweetsById.get(tweetId)!;
            let maxTimestamp = tweet.created;
            const replies = repliesByParentId.get(tweetId) || [];
            for (const reply of replies) {
                maxTimestamp = Math.max(maxTimestamp, getLatestTimestampInThread(reply.id));
            }
            memo.set(tweetId, maxTimestamp);
            return maxTimestamp;
        };

        // 3. 描画の起点となるツイート（トップレベル＋孤児リプライ）を特定
        const rootItems = this.currentSettings.tweets.filter(t => {
            return !t.replyTo || !tweetsById.has(t.replyTo);
        });

        // 4. 各起点ツイートの最終アクティビティを計算し、それでソートする
        rootItems.forEach(tweet => {
            const lastActivity = getLatestTimestampInThread(tweet.id);
            threadLastActivity.set(tweet.id, lastActivity);
        });
        
        rootItems.sort((a, b) => {
            const lastActivityA = threadLastActivity.get(a.id) || a.created;
            const lastActivityB = threadLastActivity.get(b.id) || b.created;
            return lastActivityB - lastActivityA;
        });

        // 5. 描画用のリストを構築
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

        // 6. 構築したリストを元にDOMを生成
        displayList.forEach(({ tweet, level }) => {
            const wrapper = listEl.createDiv({ cls: 'tweet-thread-wrapper' });
            wrapper.style.paddingLeft = `${level * 25}px`;
            wrapper.setAttribute('data-tweet-id', tweet.id);

            const tweetContainer = wrapper.createDiv({ cls: 'tweet-item-container' });

            if (level > 0) {
                tweetContainer.style.borderLeft = '2px solid #333';
                tweetContainer.style.paddingLeft = '12px';
            }
            
            this.renderSingleTweet(tweet, tweetContainer, tweetsById);
        });
    }

    /**
     * 個々のツイート要素を描画するヘルパー関数。
     * @param tweet 描画するツイートオブジェクト
     * @param container 描画先のHTML要素
     * @param tweetsById 全ツイートのマップ（親の存在確認用）
     */
    private renderSingleTweet(tweet: TweetWidgetTweet, container: HTMLElement, tweetsById: Map<string, TweetWidgetTweet>) {
        const item = container.createDiv({ cls: 'tweet-item-main' });

        // ヘッダー
        const header = item.createDiv({ cls: 'tweet-item-header-main' });
        const avatar = header.createDiv({ cls: 'tweet-item-avatar-main' });
        let avatarUrl = (this.plugin.settings.tweetWidgetAvatarUrl && this.plugin.settings.tweetWidgetAvatarUrl.trim())
            ? this.plugin.settings.tweetWidgetAvatarUrl.trim()
            : (this.currentSettings.avatarUrl || '').trim();
        if (!avatarUrl) avatarUrl = 'https://www.gravatar.com/avatar/?d=mp&s=64';
        const avatarImg = document.createElement('img');
        avatarImg.src = avatarUrl;
        avatarImg.alt = 'avatar';
        avatarImg.width = 36;
        avatarImg.height = 36;
        avatarImg.style.borderRadius = '50%';
        avatar.appendChild(avatarImg);
        const userInfo = header.createDiv({ cls: 'tweet-item-userinfo-main' });
        userInfo.createEl('span', { text: this.currentSettings.userName || 'あなた', cls: 'tweet-item-username-main' });
        if (this.currentSettings.verified) {
            const badge = userInfo.createSpan({ cls: 'tweet-item-badge-main' });
            setIcon(badge, 'badge-check');
            badge.style.color = '#1d9bf0';
            badge.style.margin = '0 2px';
        }
        userInfo.createEl('span', { text: this.currentSettings.userId || '@you', cls: 'tweet-item-userid-main' });
        userInfo.createEl('span', { text: '・' + this.formatTimeAgo(tweet.created) + (tweet.edited ? '・編集済' : ''), cls: 'tweet-item-time-main' });
        
        // 返信先の表示（親の存在をチェック）
        if (tweet.replyTo) {
            const parentTweetExists = tweetsById.has(tweet.replyTo);
            const replyToDiv = item.createDiv({ cls: 'tweet-item-reply-to' });

            if (parentTweetExists) {
                const targetUser = this.currentSettings.userId || '@you';
                replyToDiv.setText(`${targetUser} さんへの返信`);
                replyToDiv.style.cursor = 'pointer';
                replyToDiv.title = '元のツイートに移動';
                replyToDiv.onclick = (e) => {
                    e.stopPropagation();
                    const parentEl = this.widgetEl.querySelector(`[data-tweet-id="${tweet.replyTo}"]`) as HTMLElement;
                    if (parentEl) {
                        parentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        parentEl.style.transition = 'background-color 0.2s';
                        parentEl.style.backgroundColor = 'rgba(29, 155, 240, 0.1)';
                        setTimeout(() => {
                            parentEl.style.backgroundColor = '';
                        }, 1500);
                    }
                };
            } else {
                replyToDiv.setText('削除されたツイートへの返信');
                replyToDiv.style.cursor = 'default';
                replyToDiv.style.color = '#aaa';
            }
        }

        // 本文
        const textDiv = item.createDiv({ cls: 'tweet-item-text-main' });
        MarkdownRenderer.render(this.app, tweet.text, textDiv, this.app.workspace.getActiveFile()?.path || '', this.plugin);
        
        // 添付ファイル
        if (tweet.files && tweet.files.length) {
            const filesDiv = item.createDiv({ cls: 'tweet-item-files-main' });
            tweet.files.forEach(file => {
                if (file.type.startsWith('image/')) {
                    const img = document.createElement('img');
                    img.src = file.dataUrl;
                    img.alt = file.name;
                    img.className = 'tweet-item-image-main';
                    img.style.maxWidth = '320px';
                    img.style.maxHeight = '200px';
                    img.style.display = 'block';
                    img.style.margin = '8px auto';
                    filesDiv.appendChild(img);
                } else {
                    const link = document.createElement('a');
                    link.href = file.dataUrl;
                    link.download = file.name;
                    link.textContent = file.name;
                    link.className = 'tweet-item-link-main';
                    link.style.display = 'inline-block';
                    link.style.marginRight = '8px';
                    link.style.marginBottom = '4px';
                    filesDiv.appendChild(link);
                }
            });
        }

        // アクションバー
        const actionBar = item.createDiv({ cls: 'tweet-action-bar-main' });
        
        const replyBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main' });
        setIcon(replyBtn, 'message-square');
        replyBtn.title = 'リプライ';
        replyBtn.onclick = () => {
            this.replyingToTweetId = tweet.id;
            this.editingTweetId = null;
            this.renderTweetUI(this.widgetEl);
            const input = this.widgetEl.querySelector('.tweet-textarea-main') as HTMLTextAreaElement;
            if (input) {
                input.focus();
            }
        };
        replyBtn.createSpan({ text: String(tweet.replyCount || 0), cls: 'tweet-action-count-main' });

        const likeBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main' });
        setIcon(likeBtn, tweet.liked ? 'heart' : 'heart');
        likeBtn.style.color = tweet.liked ? '#e0245e' : '#888';
        likeBtn.title = 'いいね';
        likeBtn.onclick = async () => {
            tweet.liked = !tweet.liked;
            tweet.like = (tweet.like || 0) + (tweet.liked ? 1 : -1);
            await this.saveTweetsToFile();
            this.renderTweetList(this.widgetEl.querySelector('.tweet-list-main')?.parentElement || this.widgetEl);
        };
        likeBtn.createSpan({ text: String(tweet.like || 0), cls: 'tweet-action-count-main' });

        const rtBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main' });
        setIcon(rtBtn, 'repeat-2');
        rtBtn.style.color = tweet.retweeted ? '#1d9bf0' : '#888';
        rtBtn.title = 'リツイート';
        rtBtn.onclick = async () => {
            tweet.retweeted = !tweet.retweeted;
            tweet.retweet = (tweet.retweet || 0) + (tweet.retweeted ? 1 : -1);
            await this.saveTweetsToFile();
            this.renderTweetList(this.widgetEl.querySelector('.tweet-list-main')?.parentElement || this.widgetEl);
        };
        rtBtn.createSpan({ text: String(tweet.retweet || 0), cls: 'tweet-action-count-main' });

        const editBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main' });
        setIcon(editBtn, 'pencil');
        editBtn.title = '編集';
        editBtn.onclick = () => {
            this.editingTweetId = tweet.id;
            this.replyingToTweetId = null;
            this.attachedFiles = tweet.files ? [...tweet.files] : [];
            this.renderTweetUI(this.widgetEl);
            const input = this.widgetEl.querySelector('.tweet-textarea-main') as HTMLTextAreaElement;
            if (input) input.value = tweet.text;
        };
        
        const delBtn = actionBar.createEl('button', { cls: 'tweet-action-btn-main' });
        setIcon(delBtn, 'trash-2');
        delBtn.title = '削除';
        delBtn.onclick = async () => {
            if (!confirm('このつぶやきを削除しますか？\n(このつぶやきへの返信は削除されません)')) return;

            // 削除対象がリプライの場合、親ツイートのリプライ数を減らす
            const tweetToDelete = this.currentSettings.tweets.find(t => t.id === tweet.id);
            if (tweetToDelete && tweetToDelete.replyTo) {
                const parentTweet = this.currentSettings.tweets.find(t => t.id === tweetToDelete.replyTo);
                if (parentTweet) {
                    parentTweet.replyCount = Math.max(0, (parentTweet.replyCount || 1) - 1);
                }
            }
            // 該当ツイートのみをフィルタリングで除外
            this.currentSettings.tweets = this.currentSettings.tweets.filter(t => t.id !== tweet.id);
            await this.saveTweetsToFile();
            this.renderTweetUI(this.widgetEl);
        };
    }
    
    // --- ここまでが修正箇所 ---

    private formatTimeAgo(time: number): string {
        const now = Date.now();
        const diff = Math.floor((now - time) / 1000);
        if (diff < 60) return `${diff}秒前`;
        if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
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
        if (start === end) {
            input.value = value.slice(0, start) + wrapper + wrapper + value.slice(end);
            input.selectionStart = input.selectionEnd = start + wrapper.length;
        } else {
            input.value = value.slice(0, start) + wrapper + value.slice(start, end) + wrapper + value.slice(end);
            input.selectionStart = start + wrapper.length;
            input.selectionEnd = end + wrapper.length;
        }
        input.focus();
    }

    updateExternalSettings(newSettings: any) {
        this.currentSettings = { ...DEFAULT_TWEET_WIDGET_SETTINGS, ...(newSettings || {}) };
        this.renderTweetList(this.widgetEl);
    }

    private getTweetDbPath(): string {
        const settings = (this.plugin as any).settings || {};
        const location = settings.tweetDbLocation || 'vault';
        if (location === 'custom' && settings.tweetDbCustomPath) {
            return settings.tweetDbCustomPath;
        } else {
            return 'tweet_db/tweets.json';
        }
    }
}