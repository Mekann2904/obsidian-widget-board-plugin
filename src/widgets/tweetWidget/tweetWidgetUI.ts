import { App, Notice, setIcon, MarkdownRenderer, Menu, TFile, Component } from 'obsidian';
import type { TweetWidget } from './tweetWidget';
import type { TweetWidgetPost, TweetWidgetFile } from './types';
import { getFullThreadHistory } from './aiReply';
import { geminiPrompt } from '../../llm/gemini/tweetReplyPrompt';
import { GeminiProvider } from '../../llm/gemini/geminiApi';
import { deobfuscate } from '../../utils';
import { findLatestAiUserIdInThread, generateAiUserId } from './aiReply';
import { parseLinks, parseTags, extractYouTubeUrl, fetchYouTubeTitle } from './tweetWidgetUtils';
import { TweetWidgetDataViewer } from './tweetWidgetDataViewer';
import { renderMarkdownBatchWithCache } from '../../utils/renderMarkdownBatch';
import { renderMermaidInWorker } from '../../utils';

// --- ユーティリティ関数 ---
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// グローバルで再計算が必要な要素を管理
const pendingTweetResizeElements: HTMLTextAreaElement[] = [];
let scheduledTweetResize = false;

/**
 * Batch resize for tweet textareas to avoid layout thrashing.
 * This first resets height to 'auto' for all queued elements so the
 * subsequent scrollHeight reads occur only once, then applies the final
 * pixel heights in a separate loop.
 */
function scheduleBatchTweetResize(el: HTMLTextAreaElement) {
  if (!pendingTweetResizeElements.includes(el)) pendingTweetResizeElements.push(el);
  if (scheduledTweetResize) return;
  scheduledTweetResize = true;
  requestAnimationFrame(() => {
    // 1. write: reset height so scrollHeight reflects content size
    pendingTweetResizeElements.forEach(el => {
      el.style.height = 'auto';
    });
    // 2. read all heights in one reflow
    const heights = pendingTweetResizeElements.map(el => el.scrollHeight);
    // 3. write final heights
    pendingTweetResizeElements.forEach((el, i) => {
      el.style.height = heights[i] + 'px';
    });
    pendingTweetResizeElements.length = 0;
    scheduledTweetResize = false;
  });
}

export class TweetWidgetUI {
    private widget: TweetWidget;
    private container: HTMLElement;
    private app: App;
    private postsById: Map<string, TweetWidgetPost>;
    private needsRender = false;
    // showAvatarModalで使うためのハンドラ参照を保持
    private _escHandlerForAvatarModal: ((ev: KeyboardEvent) => void) | null = null;
    private _escHandlerForImageModal: ((ev: KeyboardEvent) => void) | null = null;

    constructor(widget: TweetWidget, container: HTMLElement) {
        this.widget = widget;
        this.container = container;
        this.app = widget.app;
        this.postsById = widget.postsById;
    }

    public resetScroll(): void {
        this.container.scrollTop = 0;
    }

    public scheduleRender(): void {
        if (this.needsRender) return;
        this.needsRender = true;
        requestAnimationFrame(() => {
            this.render();
            this.needsRender = false;
        });
    }

    public render(): void {
        this.container.empty();
        this.postsById = this.widget.postsById;

        if (this.widget.editingPostId) {
            const post = this.postsById.get(this.widget.editingPostId);
            if (post) {
                this.renderEditModal(post);
                return;
            }
        }

        const tabBar = this.container.createDiv({ cls: 'tweet-tab-bar' });
        this.renderTabBar(tabBar);

        if (this.widget.currentTab === 'notification') {
            this.renderNotificationTab();
        } else {
            this.renderHomeTab();
        }
    }

    private renderTabBar(tabBar: HTMLElement): void {
        const homeTab = tabBar.createEl('button', { text: 'ホーム', cls: 'tweet-tab-btn' });
        const notifTab = tabBar.createEl('button', { text: '通知', cls: 'tweet-tab-btn' });

        if (this.widget.currentTab === 'home') homeTab.classList.add('active');
        if (this.widget.currentTab === 'notification') notifTab.classList.add('active');

        homeTab.onclick = async () => {
            await this.widget.switchTab('home');
        };
        notifTab.onclick = async () => {
            await this.widget.switchTab('notification');
        };
    }

    private renderNotificationTab(): void {
        const myUserId = this.widget.currentSettings.userId || '@you';
        const notifications: { type: string, from: TweetWidgetPost, to: TweetWidgetPost }[] = [];

        this.widget.currentSettings.posts.forEach(t => {
            if (t.threadId) {
                const parent = this.postsById.get(t.threadId);
                if (parent && parent.userId === myUserId && t.userId !== myUserId) {
                    notifications.push({ type: 'reply', from: t, to: parent });
                }
            }
        });

        notifications.sort((a, b) => b.from.created - a.from.created);

        if (notifications.length > 0) {
            const notifBox = this.container.createDiv({ cls: 'tweet-notification-list' });
            notifBox.createDiv({ text: '通知', cls: 'tweet-notification-title' });
            notifications.slice(0, 20).forEach(n => this.renderSingleNotification(notifBox, n));
        } else {
            this.container.createDiv({ text: '通知はありません', cls: 'tweet-notification-empty' });
        }
    }

    private renderSingleNotification(container: HTMLElement, n: { type: string, from: TweetWidgetPost, to: TweetWidgetPost }): void {
        const notif = container.createDiv({ cls: 'tweet-notification-item' });
        notif.onclick = () => this.widget.navigateToDetail(n.to.id);

        const row = notif.createDiv({ cls: 'tweet-notification-row' });
        const avatarUrl = this.widget.getAvatarUrl(n.from);
        row.createEl('img', { attr: { src: avatarUrl, width: 36, height: 36 }, cls: 'tweet-notification-avatar' });
        
        const titleLine = row.createDiv({ cls: 'tweet-notification-titleline' });
        titleLine.createSpan({ text: n.from.userName || n.from.userId || '誰か', cls: 'tweet-notification-user' });
        
        let actionText = n.type === 'reply' ? ' がリプライしました' : '';
        titleLine.createSpan({ text: actionText, cls: 'tweet-notification-action' });

        const content = `「${n.from.text.slice(0, 40)}...」\n→「${n.to.text.slice(0, 40)}...」`;
        notif.createDiv({ text: content, cls: 'tweet-notification-contentline' });
    }

    private renderHomeTab(): void {
        if (this.widget.replyModalPost) {
            this.renderReplyModal(this.widget.replyModalPost);
        } else if (this.widget.retweetModalPost) {
            this.renderRetweetModal(this.widget.retweetModalPost);
        } else if (this.widget.retweetListPost) {
            this.renderRetweetListModal(this.widget.retweetListPost);
        }

        if (this.widget.detailPostId) {
            this.renderDetailHeader();
        } else {
            this.renderFilterBar();
            this.renderPostInputArea();
        }

        const listEl = this.container.createDiv({ cls: 'tweet-list-main' });
        this.renderPostList(listEl);
    }

    private renderDetailHeader(): void {
        const header = this.container.createDiv({ cls: 'tweet-detail-header' });
        const backBtn = header.createEl('button', { cls: 'tweet-detail-header-back', text: '←' });
        backBtn.onclick = () => this.widget.navigateToDetail(null);
        header.createDiv({ cls: 'tweet-detail-header-title', text: 'ポスト' });
    }

    private renderFilterBar(): void {
        const filterBar = this.container.createDiv({ cls: 'tweet-filter-bar' });
        const filterSelect = filterBar.createEl('select');
        [
            { value: 'active', label: '通常のみ' },
            { value: 'all', label: 'すべて' },
            { value: 'deleted', label: '非表示のみ' },
            { value: 'bookmark', label: 'ブックマーク' }
        ].forEach(opt => {
            filterSelect.createEl('option', { value: opt.value, text: opt.label });
        });
        filterSelect.value = this.widget.currentFilter;
        filterSelect.onchange = () => {
            this.widget.setFilter(filterSelect.value as any);
        };
        const periodSelect = filterBar.createEl('select', { cls: 'tweet-period-select' });
        [
            { value: 'all', label: '全期間' },
            { value: 'today', label: '今日' },
            { value: '1d', label: '1日' },
            { value: '3d', label: '3日' },
            { value: '7d', label: '1週間' },
            { value: '30d', label: '1ヶ月' },
            { value: 'custom', label: 'カスタム' }
        ].forEach(opt => {
            periodSelect.createEl('option', { value: opt.value, text: opt.label });
        });
        periodSelect.value = this.widget.currentPeriod || 'all';
        let customInput: HTMLInputElement | null = null;
        if (this.widget.currentPeriod === 'custom') {
            customInput = filterBar.createEl('input', { type: 'number', cls: 'tweet-period-custom-input', attr: { min: '1', style: 'width:60px;margin-left:8px;' } });
            customInput.value = String(this.widget.customPeriodDays || 1);
            customInput.onchange = () => {
                this.widget.setCustomPeriodDays(Number(customInput!.value));
            };
        }
        periodSelect.onchange = () => {
            this.widget.setPeriod(periodSelect.value);
            if (periodSelect.value === 'custom') {
                if (!customInput) {
                    customInput = filterBar.createEl('input', { type: 'number', cls: 'tweet-period-custom-input', attr: { min: '1', style: 'width:60px;margin-left:8px;' } });
                    customInput.value = String(this.widget.customPeriodDays || 1);
                    customInput.onchange = () => {
                        this.widget.setCustomPeriodDays(Number(customInput!.value));
                    };
                }
            } else {
                if (customInput) {
                    customInput.remove();
                    customInput = null;
                }
            }
        };
        const dataViewerBtn = filterBar.createEl('button', { text: 'データビューア', cls: 'tweet-data-viewer-btn' });
        dataViewerBtn.onclick = () => {
            this.openDataViewerModal();
        };
    }

    private openDataViewerModal(): void {
        const backdrop = document.body.createDiv('tweet-reply-modal-backdrop');
        const closeModal = () => backdrop.remove();
        backdrop.onclick = (e) => { if (e.target === backdrop) closeModal(); };
        const modal = backdrop.createDiv('tweet-data-viewer-modal');
        modal.style.zIndex = '9999';
        // ヘッダー
        const header = modal.createDiv('tweet-reply-modal-header');
        header.createSpan({ text: 'つぶやきデータビューア' });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = closeModal;
        // ビューア本体
        const viewerContainer = modal.createDiv('tweet-data-viewer-main');
        new TweetWidgetDataViewer(Array.from(this.widget.postsById.values()), viewerContainer);
    }

    private renderPostInputArea(): void {
        const postBox = this.container.createDiv({ cls: 'tweet-post-box' });
        
        const avatarUrl = this.widget.getAvatarUrlForPostInput();
        const avatar = postBox.createDiv({ cls: 'tweet-avatar-large' });
        const avatarImg = avatar.createEl('img', { attr: { src: avatarUrl, width: 44, height: 44 } });
        avatarImg.style.borderRadius = '50%';
        avatarImg.onclick = (e) => this.showAvatarModal(e, avatarUrl);

        const inputArea = postBox.createDiv({ cls: 'tweet-input-area-main' });

        // 独自実装のトグルスイッチ
        const toggleBar = inputArea.createDiv({ cls: 'tweet-input-toggle-bar' });
        toggleBar.style.display = 'flex';
        toggleBar.style.justifyContent = 'flex-end';
        toggleBar.style.marginBottom = '2px';
        const toggleBtn = toggleBar.createEl('button', { cls: 'tweet-toggle-switch', attr: { 'aria-label': 'プレビューモード', type: 'button' } });
        let isPreview = false;
        const previewArea = inputArea.createDiv({ cls: 'tweet-preview-area' });
        previewArea.style.display = 'none';

        if (this.widget.replyingToParentId) {
            this.renderReplyInfo(inputArea);
        }
        const input = inputArea.createEl('textarea', { 
            cls: 'tweet-textarea-main', 
            attr: { 
                rows: 2, 
                placeholder: this.widget.replyingToParentId ? '返信をポスト' : 'いまどうしてる？' 
            }
        });
        let scheduled = false;
        input.addEventListener('input', () => {
            scheduleBatchTweetResize(input);
        });
        requestAnimationFrame(() => {
            scheduleBatchTweetResize(input);
        });

        // --- YouTubeサジェストUI ---
        const ytSuggest = inputArea.createDiv({ cls: 'tweet-youtube-suggest', text: '' });
        ytSuggest.style.display = 'none';
        ytSuggest.textContent = '';
        let lastYtUrl = '';
        let lastYtTitle = '';
        input.addEventListener('input', () => {
            const val = input.value;
            const url = extractYouTubeUrl(val);
            if (!url) {
                ytSuggest.style.display = 'none';
                ytSuggest.textContent = '';
                lastYtUrl = '';
                lastYtTitle = '';
                return;
            }
            ytSuggest.textContent = '動画タイトル取得中...';
            ytSuggest.style.display = 'block';
            lastYtUrl = url;
            const currentInput = val;
            fetchYouTubeTitle(url).then(title => {
                if (input.value !== currentInput) return;
                if (title) {
                    lastYtTitle = title;
                    ytSuggest.textContent = `「${title}」を挿入 → クリック`;
                    ytSuggest.onclick = () => {
                        const insertText = `![${title}](${url})`;
                        // 元のYouTube URL（クエリ付きも含む）を正規表現で検出して置換
                        const urlRegex = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}(?:[?&][^\s]*)?)/;
                        input.value = input.value.replace(urlRegex, insertText);
                        ytSuggest.style.display = 'none';
                        ytSuggest.textContent = '';
                        input.dispatchEvent(new Event('input'));
                    };
                } else {
                    ytSuggest.textContent = '動画タイトル取得失敗';
                    ytSuggest.onclick = null;
                }
            });
        });
        
        // トグルスイッチ挙動
        toggleBtn.onclick = async () => {
            isPreview = !isPreview;
            toggleBtn.classList.toggle('on', isPreview);
            if (isPreview) {
                previewArea.style.display = '';
                input.style.display = 'none';
                previewArea.empty();
                await this.renderMarkdownWithMermaid(previewArea, input.value);
            } else {
                previewArea.style.display = 'none';
                input.style.display = '';
            }
        };
        
        const filePreviewArea = inputArea.createDiv({ cls: 'tweet-file-preview' });
        this.renderFilePreview(filePreviewArea);
        
        const bottomContainer = inputArea.createDiv({cls: 'tweet-input-bottom-container'});
        const iconBar = bottomContainer.createDiv({ cls: 'tweet-icon-bar' });
        this.renderInputIcons(iconBar, input, filePreviewArea);
        
        const bottomBar = bottomContainer.createDiv({ cls: 'tweet-bottom-bar' });
        const charCount = bottomBar.createDiv({ cls: 'tweet-char-count-main' });
        this.updateCharCount(charCount, 0);

        const postBtn = bottomBar.createEl('button', { 
            cls: 'tweet-post-btn-main', 
            text: this.widget.editingPostId ? '編集完了' : (this.widget.replyingToParentId ? '返信する' : 'ポストする') 
        });

        postBtn.onclick = async () => {
            await this.widget.submitPost(input.value);
            input.value = '';
            this.updateCharCount(charCount, 0);
        };

        input.addEventListener('input', () => {
            this.updateCharCount(charCount, input.value.length);
        });

        // --- @サジェストリストUI ---
        const atSuggestList = inputArea.createDiv({ cls: 'tweet-suggest-list' });
        atSuggestList.style.display = 'none';
        const atCandidates = ['@ai','@ai2','@bi'];
        let atActiveIndex = -1;
        let atCurrentCandidates: string[] = [];

        input.addEventListener('input', () => {
            const val = input.value;
            // @サジェスト表示判定
            const atMatch = /(^|\s)@(\w*)$/.exec(val.slice(0, input.selectionStart));
            if (atMatch) {
                const query = atMatch[2] || '';
                // 候補を絞り込み
                atCurrentCandidates = atCandidates.filter(cand => cand.slice(1).toLowerCase().startsWith(query.toLowerCase()));
                if (atCurrentCandidates.length === 0) {
                    atSuggestList.style.display = 'none';
                    atActiveIndex = -1;
                    return;
                }
                atSuggestList.empty();
                atActiveIndex = 0;
                atCurrentCandidates.forEach((cand, idx) => {
                    const item = atSuggestList.createDiv({ cls: 'tweet-suggest-item', text: cand });
                    if (idx === atActiveIndex) item.addClass('active');
                    item.onmouseenter = () => {
                        atActiveIndex = idx;
                        Array.from(atSuggestList.children).forEach((el, i) => {
                            el.classList.toggle('active', i === atActiveIndex);
                        });
                    };
                    item.onclick = () => {
                        input.value = val.slice(0, atMatch.index + atMatch[1].length) + cand + val.slice(input.selectionStart);
                        atSuggestList.style.display = 'none';
                        input.focus();
                    };
                });
                atSuggestList.style.display = 'block';
            } else {
                atSuggestList.style.display = 'none';
                atActiveIndex = -1;
            }
        });
        input.addEventListener('keydown', (e) => {
            if (atSuggestList.style.display === 'block' && atCurrentCandidates.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    atActiveIndex = (atActiveIndex + 1) % atCurrentCandidates.length;
                    Array.from(atSuggestList.children).forEach((el, i) => {
                        el.classList.toggle('active', i === atActiveIndex);
                    });
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    atActiveIndex = (atActiveIndex - 1 + atCurrentCandidates.length) % atCurrentCandidates.length;
                    Array.from(atSuggestList.children).forEach((el, i) => {
                        el.classList.toggle('active', i === atActiveIndex);
                    });
                } else if (e.key === 'Enter') {
                    if (atActiveIndex >= 0 && atActiveIndex < atCurrentCandidates.length) {
                        const val = input.value;
                        const atMatch = /(^|\s)@(\w*)$/.exec(val.slice(0, input.selectionStart));
                        if (atMatch) {
                            input.value = val.slice(0, atMatch.index + atMatch[1].length) + atCurrentCandidates[atActiveIndex] + val.slice(input.selectionStart);
                            atSuggestList.style.display = 'none';
                            input.focus();
                            e.preventDefault();
                        }
                    }
                }
            }
        });
        input.addEventListener('blur', () => {
            setTimeout(() => atSuggestList.style.display = 'none', 100);
        });

        // --- textarea生成直後に追加 ---
        input.addEventListener('paste', async (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const files: File[] = [];
            for (const item of Array.from(e.clipboardData.items)) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                await this.widget.attachFiles(files);
                this.renderFilePreview(filePreviewArea);
            }
        });
    }

    private renderReplyInfo(container: HTMLElement): void {
        const replyInfoContainer = container.createDiv({ cls: 'tweet-reply-info-container' });
        const replyingToPost = this.postsById.get(this.widget.replyingToParentId!);
        if (replyingToPost) {
            const replyInfoDiv = replyInfoContainer.createDiv({ cls: 'tweet-reply-info' });
            replyInfoDiv.setText(`${replyingToPost.userName || '@user'} さんに返信中`);
            const cancelReplyBtn = replyInfoDiv.createEl('button', { text: 'キャンセル', cls: 'tweet-cancel-reply-btn' });
            cancelReplyBtn.onclick = () => this.widget.cancelReply();
        } else {
             this.widget.cancelReply();
        }
    }

    private renderInputIcons(iconBar: HTMLElement, input: HTMLTextAreaElement, filePreviewArea: HTMLElement): void {
        const imageBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main', attr: { title: '画像を添付' }});
        setIcon(imageBtn, 'image');
        const imageInput = createEl('input', { type: 'file', attr: { accept: 'image/*', multiple: true, style: 'display: none;' }});
        imageBtn.onclick = () => imageInput.click();
        iconBar.appendChild(imageInput);
        imageInput.onchange = async () => {
            if (!imageInput.files) return;
            await this.widget.attachFiles(Array.from(imageInput.files));
            this.renderFilePreview(filePreviewArea);
            imageInput.value = '';
        };

        const boldBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main', attr: { title: '太字' }});
        setIcon(boldBtn, 'bold');
        boldBtn.onclick = () => this.widget.wrapSelection(input, '**');
        
        const italicBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main', attr: { title: '斜体' }});
        setIcon(italicBtn, 'italic');
        italicBtn.onclick = () => this.widget.wrapSelection(input, '*');
    }

    public renderFilePreview(container: HTMLElement): void {
        // 画像プレビューはMarkdownレンダリングに統一したため、何もしない
        container.empty();
    }

    private updateCharCount(el: HTMLElement, len: number): void {
        const maxLength = this.widget.maxLength;
        el.textContent = `${len} / ${maxLength}`;
        el.classList.toggle('tweet-char-over', len > maxLength);
    }
    
    private showAvatarModal(e: MouseEvent, avatarUrl: string): void {
        e.stopPropagation();
        const oldModal = document.querySelector('.tweet-avatar-modal-backdrop');
        if (oldModal) oldModal.remove();

        const backdrop = document.body.createDiv('tweet-avatar-modal-backdrop');
        backdrop.onclick = (ev) => {
            if (ev.target === backdrop) backdrop.remove();
        };

        const modal = backdrop.createDiv('tweet-avatar-modal-content');
        modal.createEl('img', { attr: { src: avatarUrl, alt: 'avatar-large' }});
        
        const closeBtn = modal.createEl('button', { text: '×' });
        closeBtn.onclick = () => backdrop.remove();

        // ハンドラをプロパティに保存し、onunloadで解除できるように
        this._escHandlerForAvatarModal = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                backdrop.remove();
                window.removeEventListener('keydown', this._escHandlerForAvatarModal!);
            }
        };
        window.addEventListener('keydown', this._escHandlerForAvatarModal);
    }

    private showImageModal(imgUrl: string): void {
        // 既存のレイヤーがあれば削除
        const oldLayer = document.querySelector('.tweet-image-zoom-layer');
        if (oldLayer) oldLayer.remove();

        // 独自のフルスクリーンレイヤーを作成
        const layer = document.createElement('div');
        layer.className = 'tweet-image-zoom-layer';
        layer.style.position = 'fixed';
        layer.style.top = '0';
        layer.style.left = '0';
        layer.style.width = '100vw';
        layer.style.height = '100vh';
        layer.style.background = 'rgba(0,0,0,0.7)';
        layer.style.zIndex = '99999';
        layer.style.display = 'flex';
        layer.style.alignItems = 'center';
        layer.style.justifyContent = 'center';
        layer.style.userSelect = 'none';

        // 画像本体
        const imgEl = document.createElement('img');
        imgEl.src = imgUrl;
        imgEl.alt = 'image-large';
        imgEl.style.transition = 'transform 0.2s';
        imgEl.style.background = '#fff';
        imgEl.style.boxShadow = '0 2px 24px rgba(0,0,0,0.25)';
        imgEl.style.borderRadius = '8px';
        imgEl.style.maxWidth = '90vw';
        imgEl.style.maxHeight = '90vh';
        imgEl.style.display = 'block';
        imgEl.style.position = 'relative';
        layer.appendChild(imgEl);

        // 閉じるボタン
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '32px';
        closeBtn.style.right = '48px';
        closeBtn.style.fontSize = '2.2em';
        closeBtn.style.background = 'rgba(0,0,0,0.3)';
        closeBtn.style.color = '#fff';
        closeBtn.style.border = 'none';
        closeBtn.style.borderRadius = '50%';
        closeBtn.style.width = '48px';
        closeBtn.style.height = '48px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.zIndex = '100000';
        closeBtn.onclick = () => layer.remove();
        layer.appendChild(closeBtn);

        // Escキーで閉じる
        const escHandler = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') {
                layer.remove();
                window.removeEventListener('keydown', escHandler);
            }
        };
        window.addEventListener('keydown', escHandler);

        // 背景クリックで閉じる
        layer.addEventListener('click', (ev) => {
            if (ev.target === layer) layer.remove();
        });

        // 拡大トグル（クリックで2倍、もう一度クリックで元に戻す）
        let isZoomed = false;
        imgEl.style.transform = 'scale(1)';
        imgEl.style.cursor = 'zoom-in';
        imgEl.addEventListener('click', (e) => {
            e.stopPropagation();
            isZoomed = !isZoomed;
            if (isZoomed) {
                imgEl.style.transform = 'scale(2)';
                imgEl.style.cursor = 'zoom-out';
                imgEl.style.maxWidth = 'none';
                imgEl.style.maxHeight = 'none';
            } else {
                imgEl.style.transform = 'scale(1)';
                imgEl.style.cursor = 'zoom-in';
                imgEl.style.maxWidth = '90vw';
                imgEl.style.maxHeight = '90vh';
            }
        });

        document.body.appendChild(layer);
    }

    private showImageContextMenu(event: MouseEvent, img: HTMLImageElement): void {
        const menu = new Menu();
        menu.addItem(item => item.setTitle('画像をコピー').setIcon('copy')
            .onClick(async () => {
                try {
                    const blob = await (await fetch(img.src)).blob();
                    await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                    ]);
                    new Notice('画像をコピーしました');
                } catch {
                    new Notice('コピーに失敗しました');
                }
            }));
        menu.addItem(item => item.setTitle('画像を拡大表示').setIcon('image')
            .onClick(() => this.showImageModal(img.src)));
        menu.showAtMouseEvent(event);
    }

    private renderPostList(listEl: HTMLElement): void {
        const parent = listEl.parentElement;
        if (parent) {
            const newListEl = listEl.cloneNode(false) as HTMLElement;
            parent.replaceChild(newListEl, listEl);
            listEl = newListEl;
        }
        if (this.widget.detailPostId) {
            this.renderDetailView(listEl, this.widget.detailPostId);
            return;
        }
        const filteredPosts = this.widget.getFilteredPosts();
        if (filteredPosts.length === 0) {
            listEl.createEl('div', { cls: 'tweet-empty-notice', text: 'まだつぶやきがありません。' });
            return;
        }
        const rootItems = filteredPosts
            .filter(t => !t.threadId || !this.postsById.has(t.threadId))
            .sort((a, b) => b.created - a.created);
        const fragment = document.createDocumentFragment();
        rootItems.forEach(post => {
            const wrapper = document.createElement('div');
            wrapper.className = 'tweet-thread-wrapper';
            wrapper.setAttribute('data-tweet-id', post.id);
            wrapper.onclick = (e) => {
                if ((e.target as HTMLElement).closest('.tweet-action-bar-main') || 
                    (e.target as HTMLElement).closest('.tweet-action-btn-main') ||
                    (e.target as HTMLElement).closest('a.internal-link') ||
                    (e.target as HTMLElement).closest('a.external-link') ||
                    (e.target as HTMLElement).closest('.tweet-item-avatar-main')) return;
                this.widget.navigateToDetail(post.id);
            };
            this.renderSinglePost(post, wrapper);
            fragment.appendChild(wrapper);
        });
        listEl.appendChild(fragment);
    }

    private renderDetailView(container: HTMLElement, postId: string): void {
        const target = this.postsById.get(postId);
        if (!target) return;

        const targetWrap = container.createDiv({ cls: 'tweet-detail-main' });
        this.renderSinglePost(target, targetWrap, true);

        this.renderDetailReplyInput(container, target);

        container.createDiv({ cls: 'tweet-detail-section-sep' });

        const renderRecursiveReplies = (parentId: string, cont: HTMLElement, depth: number = 0) => {
            const replies = this.widget.getReplies(parentId);
            replies.sort((a, b) => a.created - b.created);
            replies.forEach(reply => {
                const replyCard = cont.createDiv({ cls: 'tweet-detail-reply' });
                replyCard.style.marginLeft = `${Math.min(depth, 1) * 24}px`;
                replyCard.onclick = (e) => {
                     if ((e.target as HTMLElement).closest('.tweet-action-bar-main') || 
                         (e.target as HTMLElement).closest('.tweet-item-avatar-main')) return;
                     this.widget.navigateToDetail(reply.id);
                };
                this.renderSinglePost(reply, replyCard);
                renderRecursiveReplies(reply.id, cont, depth + 1);
            });
        };
        
        renderRecursiveReplies(target.id, container);

        if (this.widget.getReplies(target.id).length === 0) {
            container.createDiv({ cls: 'tweet-detail-no-reply', text: 'リプライはありません' });
        }
    }
    
    private renderDetailReplyInput(container: HTMLElement, targetPost: TweetWidgetPost): void {
        const replyBox = container.createDiv({ cls: 'tweet-detail-reply-box' });
        const avatarUrl = this.widget.getAvatarUrl();
        replyBox.createDiv({ cls: 'tweet-detail-reply-avatar' })
            .createEl('img', { attr: { src: avatarUrl, width: 44, height: 44 } });

        const inputArea = replyBox.createDiv({ cls: 'tweet-detail-reply-input' });
        const textarea = inputArea.createEl('textarea', { 
            cls: 'tweet-detail-reply-textarea', 
            attr: { placeholder: '返信をポスト' } 
        });
        const replyBtn = inputArea.createEl('button', { 
            cls: 'tweet-detail-reply-btn', 
            text: '返信' 
        });
        replyBtn.onclick = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            await this.widget.submitReply(text, targetPost.id);
            textarea.value = '';
        };

        // --- 以下、renderDetailReplyInputのtextarea生成直後 ---
        textarea.addEventListener('paste', async (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const files: File[] = [];
            for (const item of Array.from(e.clipboardData.items)) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                await this.widget.attachFiles(files);
                // 画像プレビューが必要ならここで呼ぶ
            }
        });
    }

    private async renderSinglePost(
        post: TweetWidgetPost,
        container: HTMLElement,
        isDetail: boolean = false,
        isQuoteEmbed: boolean = false
    ): Promise<void> {
        container.empty();
        const item = container.createDiv({ cls: 'tweet-item-main' });
        
        const header = item.createDiv({ cls: 'tweet-item-header-main' });
        const avatarUrl = this.widget.getAvatarUrl(post);
        const avatar = header.createDiv({ cls: 'tweet-item-avatar-main' });
        const avatarImg = avatar.createEl('img', { attr: { src: avatarUrl, width: 36, height: 36 } });
        avatarImg.onclick = (e) => this.showAvatarModal(e, avatarUrl);

        const userInfo = header.createDiv({ cls: 'tweet-item-userinfo-main' });
        userInfo.createEl('span', { text: post.userName || 'あなた', cls: 'tweet-item-username-main' });
        if (post.verified) {
            const badgeSpan = userInfo.createSpan({ cls: 'tweet-item-badge-main' });
            setIcon(badgeSpan, 'badge-check');
        }
        userInfo.createEl('span', { text: post.userId || '@you', cls: 'tweet-item-userid-main' });
        const timeText = '・' + this.widget.formatTimeAgo(post.created) + (post.edited ? ' (編集済)' : '');
        userInfo.createEl('span', { text: timeText, cls: 'tweet-item-time-main' });

        if (post.threadId && !isDetail) {
             const parentPost = this.postsById.get(post.threadId);
             const replyToDiv = item.createDiv({ cls: 'tweet-item-reply-to' });
             if(parentPost && !parentPost.deleted) {
                 replyToDiv.setText(`返信先: ${parentPost.userName || parentPost.userId}`);
             } else {
                 replyToDiv.setText('削除されたポストへの返信');
                 replyToDiv.addClass('deleted-reply');
             }
        }
        
        const textDiv = item.createDiv({ cls: 'tweet-item-text-main' });
        let displayText = post.text;
        try {
            const parsed = JSON.parse(displayText);
            if (parsed && typeof parsed.reply === 'string') displayText = parsed.reply;
        } catch {}
        if (post.quoteId) {
            displayText = displayText
                .split('\n')
                .filter(line => !/^>\s?/.test(line.trim()))
                .join('\n');
        }

        // --- 画像Markdown記法のパスを置換 ---
        let replacedText = displayText;
        // 添付ファイル（dataUrl）を優先
        if (post.files && post.files.length) {
            for (const file of post.files) {
                // ![[xxx.png]] や ![[tweet-widget-files/xxx.png]]
                const wikilinkPattern = new RegExp(`!\\[\\[(?:${escapeRegExp(file.name)}|tweet-widget-files/${escapeRegExp(file.name)})\\]\\]`, 'g');
                replacedText = replacedText.replace(wikilinkPattern, `![](${file.dataUrl})`);
                // ![](xxx.png) や ![](tweet-widget-files/xxx.png)
                const mdPattern = new RegExp(`!\\[\\]\\((?:${escapeRegExp(file.name)}|tweet-widget-files/${escapeRegExp(file.name)})\\)`, 'g');
                replacedText = replacedText.replace(mdPattern, `![](${file.dataUrl})`);
            }
        }
        // Vault内画像のパスをgetResourcePathでURLに変換
        const vaultFiles = this.app.vault.getFiles();
        // デバッグモード判定（なければfalse）
        const debugLog = this.widget?.plugin?.settings?.debugLogging === true;
        replacedText = replacedText.replace(/!\[\[(.+?)\]\]/g, (match, p1) => {
            let fileName = p1;
            try {
                const urlMatch = /([^\/\\]+?)(\?.*)?$/.exec(p1);
                if (urlMatch) fileName = urlMatch[1];
            } catch {}
            if (debugLog) {
                console.log('[tweetWidgetUI] 画像置換: p1=', p1, 'fileName=', fileName, 'vaultFiles=', vaultFiles.map(f => ({name: f.name, path: f.path})));
            }
            const f = vaultFiles.find(f => f.name === fileName || f.path === fileName || f.path === p1 || f.name === p1);
            if (f) {
                if (debugLog) console.log('[tweetWidgetUI] マッチしたファイル:', f);
                const url = this.app.vault.getResourcePath(f);
                return `![](${url})`;
            } else {
                if (debugLog) console.warn('[tweetWidgetUI] 画像ファイルが見つかりません:', p1);
            }
            return match;
        });
        replacedText = replacedText.replace(/!\[\]\((.+?)\)/g, (match, p1) => {
            let fileName = p1;
            try {
                const urlMatch = /([^\/\\]+?)(\?.*)?$/.exec(p1);
                if (urlMatch) fileName = urlMatch[1];
            } catch {}
            if (debugLog) {
                console.log('[tweetWidgetUI] 画像置換 (md): p1=', p1, 'fileName=', fileName, 'vaultFiles=', vaultFiles.map(f => ({name: f.name, path: f.path})));
            }
            const f = vaultFiles.find(f => f.name === fileName || f.path === fileName || f.path === p1 || f.name === p1);
            if (f) {
                if (debugLog) console.log('[tweetWidgetUI] マッチしたファイル (md):', f);
                const url = this.app.vault.getResourcePath(f);
                return `![](${url})`;
            } else {
                if (debugLog) console.warn('[tweetWidgetUI] 画像ファイルが見つかりません (md):', p1);
            }
            return match;
        });
        // --- ここまで追加 ---

        await this.renderMarkdownWithMermaid(textDiv, replacedText);
        // 画像の幅を親要素に合わせる
        Array.from(textDiv.querySelectorAll('img')).forEach(img => {
            img.style.width = '100%';
            img.style.height = 'auto';
            img.style.maxWidth = '100%';
            img.style.display = 'block';
            img.oncontextmenu = (e) => {
                e.preventDefault();
                this.showImageContextMenu(e, img);
            };
        });

        if (post.quoteId) {
            const quoted = this.postsById.get(post.quoteId);
            if (quoted) {
                const quoteWrap = item.createDiv({ cls: 'tweet-quote-container' });
                quoteWrap.onclick = (e) => {
                    if ((e.target as HTMLElement).closest('.tweet-action-bar-main') ||
                        (e.target as HTMLElement).closest('.tweet-item-avatar-main')) return;
                    this.widget.navigateToDetail(quoted.id);
                };
                await this.renderSinglePost(quoted, quoteWrap, true, true);
            }
        }

        const metadataDiv = item.createDiv({ cls: 'tweet-item-metadata-main' });
        if (post.bookmark) metadataDiv.createEl('span', { cls: 'tweet-chip bookmark', text: 'Bookmarked' });
        if (post.visibility && post.visibility !== 'public') metadataDiv.createEl('span', { cls: 'tweet-chip visibility', text: post.visibility });
        if (post.noteQuality && post.noteQuality !== 'fleeting') metadataDiv.createEl('span', { cls: 'tweet-chip quality', text: post.noteQuality });
        if (post.taskStatus) metadataDiv.createEl('span', { cls: 'tweet-chip status', text: post.taskStatus });

        if (post.tags && post.tags.length > 0) {
            const tagsDiv = item.createDiv({ cls: 'tweet-item-tags-main' });
            post.tags.forEach((tag: string) => {
                tagsDiv.createEl('a', { text: `#${tag}`, cls: 'tweet-tag', href: `#${tag}` });
            });
        }

        if (post.userId && post.userId.startsWith('@ai-') && this.widget.plugin.settings.showAiHistory) {
            const historyDiv = item.createDiv({ cls: 'tweet-ai-history-main' });
            historyDiv.createEl('div', { text: '会話履歴', cls: 'tweet-ai-history-title' });
            const thread = getFullThreadHistory(post, this.widget.currentSettings.posts);
            thread.forEach((t, idx) => {
                const line = historyDiv.createDiv({ cls: 'tweet-ai-history-line' });
                const who = t.userId && t.userId.startsWith('@ai-') ? 'AI' : (t.userName || t.userId || 'あなた');
                line.createSpan({ text: `${who}: `, cls: 'tweet-ai-history-who' });
                line.createSpan({ text: t.text, cls: 'tweet-ai-history-text' });
            });
        }

        if (!isQuoteEmbed) {
            this.renderActionBar(item, post);
        }
        
        if (!isDetail) {
            this.renderReactedUsers(item, post);
        }
    }

    private renderActionBar(container: HTMLElement, post: TweetWidgetPost): void {
        const actionBar = container.createDiv({ cls: 'tweet-action-bar-main' });

        const replyBtn = this.createActionButton(actionBar, 'message-square', post.replyCount, 'reply');
        replyBtn.onclick = (e) => {
            e.stopPropagation();
            this.widget.startReply(post);
        };
        
        const quoteCount = this.widget.getQuoteCount(post.id);
        const rtBtn = this.createActionButton(actionBar, 'repeat-2', quoteCount, 'retweet', post.retweeted);
        rtBtn.onclick = (e) => { e.stopPropagation(); this.showRetweetMenu(e, post); };

        const likeBtn = this.createActionButton(actionBar, 'heart', post.like, 'like', post.liked);
        likeBtn.onclick = (e) => { e.stopPropagation(); this.widget.toggleLike(post.id); };

        const bookmarkBtn = this.createActionButton(actionBar, 'bookmark', undefined, 'bookmark', post.bookmark);
        bookmarkBtn.onclick = (e) => { e.stopPropagation(); this.widget.toggleBookmark(post.id); };

        const moreBtn = this.createActionButton(actionBar, 'more-horizontal', undefined, 'more');
        moreBtn.onclick = (e) => { e.stopPropagation(); this.showMoreMenu(e, post); };

        if (this.widget.plugin.settings.llm?.gemini?.apiKey) {
            const geminiBtn = this.createActionButton(actionBar, 'bot', undefined, 'gemini-reply');
            geminiBtn.title = 'Geminiでリプライ生成';
            geminiBtn.onclick = async (e) => {
                e.stopPropagation();
                geminiBtn.setAttribute('disabled', 'true');
                geminiBtn.setText('...');
                await this.widget.generateGeminiReply(post);
            };
        }
    }

    private createActionButton(container: HTMLElement, icon: string, count?: number, type?: string, active?: boolean): HTMLElement {
        const btn = container.createEl('button', { cls: `tweet-action-btn-main ${type || ''}` });
        setIcon(btn, icon);
        if (active) btn.addClass('active');
        if (count !== undefined && count > 0) {
            btn.createSpan({ text: String(count), cls: 'tweet-action-count-main' });
        }
        return btn;
    }

    private renderReactedUsers(container: HTMLElement, post: TweetWidgetPost): void {
        const replies = this.widget.getReplies(post.id);
        const uniqueUsers = new Map(replies.map(r => [r.userId, r]));

        if (uniqueUsers.size > 0) {
            const reactedDiv = container.createDiv({ cls: 'tweet-reacted-users-main' });
            const row = reactedDiv.createDiv({ cls: 'tweet-reacted-row' });
            row.createDiv({ text: 'この人たちが反応しています！', cls: 'tweet-reacted-label' });
            const avatarsDiv = row.createDiv({ cls: 'tweet-reacted-avatars' });
            const usersArr = Array.from(uniqueUsers.values());
            const maxAvatars = 5;
            usersArr.slice(0, maxAvatars).forEach((r, idx) => {
                const avatarUrl = this.widget.getAvatarUrl(r);
                const av = avatarsDiv.createEl('img', { attr: { src: avatarUrl, width: 24, height: 24, title: r.userName || r.userId || '' } });
                av.className = 'tweet-reacted-avatar-img';
                av.style.zIndex = String(10 + maxAvatars - idx);
            });
            if (usersArr.length > maxAvatars) {
                avatarsDiv.createDiv({ cls: 'tweet-reacted-avatar-more', text: `+${usersArr.length - maxAvatars}` });
            }
        }
    }

    private showMoreMenu(event: MouseEvent, post: TweetWidgetPost): void {
        const menu = new Menu();

        menu.addItem((item) => item.setTitle("編集").setIcon("pencil").onClick(() => this.widget.startEdit(post)));
        
        if (post.deleted) {
            menu.addItem(item => item.setTitle('復元').setIcon('rotate-ccw').onClick(() => this.widget.setPostDeleted(post.id, false)));
        } else {
            menu.addItem(item => item.setTitle('非表示').setIcon('eye-off').onClick(() => this.widget.setPostDeleted(post.id, true)));
        }
        
        menu.addItem(item => item.setTitle('⚠️ 完全削除').setIcon('x-circle').onClick(() => {
            if (confirm('このつぶやきを完全に削除しますか？（元に戻せません）')) {
                this.widget.deletePost(post.id);
            }
        }));
        menu.addItem(item => item.setTitle('🧹 スレッドを完全削除').setIcon('trash').onClick(() => {
             if (confirm('このスレッド（親＋リプライ）を完全に削除しますか？（元に戻せません）')) {
                this.widget.deleteThread(post.id);
            }
        }));
        menu.addSeparator();

        const addMenuItems = (
            sectionTitle: string, options: (string | null)[], currentValue: string | null | undefined, 
            key: keyof TweetWidgetPost, labelMap?: Record<string, string>
        ) => {
            menu.addItem(item => item.setTitle(sectionTitle).setDisabled(true));
            options.forEach(option => {
                let label = option ? option.charAt(0).toUpperCase() + option.slice(1) : "None";
                if (labelMap && option && labelMap[option]) label += `（${labelMap[option]}）`;
                menu.addItem(item => item
                    .setTitle(label)
                    .setChecked(currentValue === option)
                    .onClick(() => this.widget.updatePostProperty(post.id, key, option)));
            });
        };

        addMenuItems("Visibility", ["public", "private", "draft"], post.visibility, 'visibility' as keyof TweetWidgetPost);
        menu.addSeparator();
        addMenuItems("Note Quality", ["fleeting", "literature", "permanent"], post.noteQuality, 'noteQuality' as keyof TweetWidgetPost, 
            { fleeting: "アイデア", literature: "文献", permanent: "永久" });
        menu.addSeparator();
        addMenuItems("Task Status", [null, "todo", "doing", "done"], post.taskStatus, 'taskStatus' as keyof TweetWidgetPost);
        menu.addSeparator();

        menu.addItem(item => item.setTitle("Open/Create Context Note").setIcon("file-text")
            .onClick(() => this.widget.openContextNote(post)));

        menu.showAtMouseEvent(event);
    }

    private showRetweetMenu(event: MouseEvent, post: TweetWidgetPost): void {
        const menu = new Menu();
        menu.addItem(item => item.setTitle('引用').setIcon('quote').onClick(() => this.widget.startRetweet(post)));
        menu.addItem(item => item.setTitle('詳細').setIcon('list').onClick(() => this.widget.openRetweetList(post)));
        menu.showAtMouseEvent(event);
    }
    
    private renderReplyModal(post: TweetWidgetPost): void {
        const backdrop = document.body.createDiv('tweet-reply-modal-backdrop');
        const closeModal = () => {
            this.widget.replyModalPost = null;
            backdrop.remove();
            this.render();
        };
        
        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeModal();
        };

        const modal = backdrop.createDiv('tweet-reply-modal');
        const widgetRect = this.container.getBoundingClientRect();
        modal.style.position = 'fixed';
        const modalWidth = Math.min(widgetRect.width - 40, 600);
        modal.style.width = `${modalWidth}px`;
        const viewportWidth  = window.innerWidth;
        const viewportHeight = window.innerHeight;
        setTimeout(() => {
            const modalHeight = modal.offsetHeight;
            let top = widgetRect.top + 30;
            // 通常はウィジェット下+30px、ただし下にはみ出す場合のみ中央揃え
            if (top + modalHeight > viewportHeight - 10) {
                top = (viewportHeight - modalHeight) / 2;
                if (top < 10) top = 10;
                if (top + modalHeight > viewportHeight - 10) top = viewportHeight - modalHeight - 10;
            } else {
                if (top < 10) top = 10;
            }
            modal.style.top = `${top}px`;
            let left = widgetRect.left + (widgetRect.width - modalWidth) / 2;
            if (left < 10) {
                left = 10;
            }
            if (left + modalWidth > viewportWidth - 10) {
                left = viewportWidth - modalWidth - 10;
            }
            modal.style.left = `${left}px`;
        }, 0);

        const header = modal.createDiv('tweet-reply-modal-header');
        header.createSpan({ text: '返信' });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = closeModal;

        const postBox = modal.createDiv('tweet-reply-modal-post');
        this.renderSinglePost(post, postBox, true);

        const inputArea = modal.createDiv('tweet-reply-modal-input');
        const textarea = inputArea.createEl('textarea', { cls: 'tweet-reply-modal-textarea', attr: { placeholder: '返信をポスト' } });
        textarea.focus();

        // --- YouTubeサジェストUI ---
        const ytSuggest = inputArea.createDiv({ cls: 'tweet-youtube-suggest', text: '' });
        ytSuggest.style.display = 'none';
        ytSuggest.textContent = '';
        let lastYtUrl = '';
        let lastYtTitle = '';
        textarea.addEventListener('input', () => {
            const val = textarea.value;
            const url = extractYouTubeUrl(val);
            if (!url) {
                ytSuggest.style.display = 'none';
                ytSuggest.textContent = '';
                lastYtUrl = '';
                lastYtTitle = '';
                return;
            }
            ytSuggest.textContent = '動画タイトル取得中...';
            ytSuggest.style.display = 'block';
            lastYtUrl = url;
            const currentInput = val;
            fetchYouTubeTitle(url).then(title => {
                if (textarea.value !== currentInput) return;
                if (title) {
                    lastYtTitle = title;
                    ytSuggest.textContent = `「${title}」を挿入 → クリック`;
                    ytSuggest.onclick = () => {
                        const insertText = `![${title}](${url})`;
                        // 元のYouTube URL（クエリ付きも含む）を正規表現で検出して置換
                        const urlRegex = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}(?:[?&][^\s]*)?)/;
                        textarea.value = textarea.value.replace(urlRegex, insertText);
                        ytSuggest.style.display = 'none';
                        ytSuggest.textContent = '';
                        textarea.dispatchEvent(new Event('input'));
                    };
                } else {
                    ytSuggest.textContent = '動画タイトル取得失敗';
                    ytSuggest.onclick = null;
                }
            });
        });

        const replyBtn = inputArea.createEl('button', { cls: 'tweet-reply-modal-btn', text: '返信' });
        replyBtn.onclick = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            await this.widget.submitReply(text, post.id);
            closeModal();
        };

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeModal();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                replyBtn.click();
            }
        });

        // --- 以下、renderReplyModalのtextarea生成直後 ---
        textarea.addEventListener('paste', async (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const files: File[] = [];
            for (const item of Array.from(e.clipboardData.items)) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                await this.widget.attachFiles(files);
                // 画像プレビューが必要ならここで呼ぶ
            }
        });
    }

    private renderRetweetModal(post: TweetWidgetPost): void {
        const backdrop = document.body.createDiv('tweet-reply-modal-backdrop');
        const closeModal = () => {
            this.widget.retweetModalPost = null;
            backdrop.remove();
            this.render();
        };
        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeModal();
        };
        const modal = backdrop.createDiv('tweet-reply-modal');
        const widgetRect = this.container.getBoundingClientRect();
        modal.style.position = 'fixed';
        const modalWidth = Math.min(widgetRect.width - 40, 600);
        modal.style.width = `${modalWidth}px`;
        const viewportWidth  = window.innerWidth;
        const viewportHeight = window.innerHeight;
        setTimeout(() => {
            const modalHeight = modal.offsetHeight;
            let top = widgetRect.top + 30;
            // 通常はウィジェット下+30px、ただし下にはみ出す場合のみ中央揃え
            if (top + modalHeight > viewportHeight - 10) {
                top = (viewportHeight - modalHeight) / 2;
                if (top < 10) top = 10;
                if (top + modalHeight > viewportHeight - 10) top = viewportHeight - modalHeight - 10;
            } else {
                if (top < 10) top = 10;
            }
            modal.style.top = `${top}px`;
            let left = widgetRect.left + (widgetRect.width - modalWidth) / 2;
            if (left < 10) {
                left = 10;
            }
            if (left + modalWidth > viewportWidth - 10) {
                left = viewportWidth - modalWidth - 10;
            }
            modal.style.left = `${left}px`;
        }, 0);

        const header = modal.createDiv('tweet-reply-modal-header');
        header.createSpan({ text: '引用リツイート' });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = closeModal;

        const postBox = modal.createDiv('tweet-reply-modal-post');
        this.renderSinglePost(post, postBox, true);

        const inputArea = modal.createDiv('tweet-reply-modal-input');
        const textarea = inputArea.createEl('textarea', { cls: 'tweet-reply-modal-textarea', attr: { placeholder: 'コメントを追加' } });
        textarea.focus();

        const ytSuggest = inputArea.createDiv({ cls: 'tweet-youtube-suggest', text: '' });
        ytSuggest.style.display = 'none';
        ytSuggest.textContent = '';
        let lastYtUrl = '';
        let lastYtTitle = '';
        textarea.addEventListener('input', () => {
            const val = textarea.value;
            const url = extractYouTubeUrl(val);
            if (!url) {
                ytSuggest.style.display = 'none';
                ytSuggest.textContent = '';
                lastYtUrl = '';
                lastYtTitle = '';
                return;
            }
            ytSuggest.textContent = '動画タイトル取得中...';
            ytSuggest.style.display = 'block';
            lastYtUrl = url;
            const currentInput = val;
            fetchYouTubeTitle(url).then(title => {
                if (textarea.value !== currentInput) return;
                if (title) {
                    lastYtTitle = title;
                    ytSuggest.textContent = `「${title}」を挿入 → クリック`;
                    ytSuggest.onclick = () => {
                        const insertText = `![${title}](${url})`;
                        const urlRegex = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}(?:[?&][^\s]*)?)/;
                        textarea.value = textarea.value.replace(urlRegex, insertText);
                        ytSuggest.style.display = 'none';
                        ytSuggest.textContent = '';
                        textarea.dispatchEvent(new Event('input'));
                    };
                } else {
                    ytSuggest.textContent = '動画タイトル取得失敗';
                    ytSuggest.onclick = null;
                }
            });
        });

        const retweetBtn = inputArea.createEl('button', { cls: 'tweet-reply-modal-btn', text: 'リツイート' });
        retweetBtn.onclick = async () => {
            await this.widget.submitRetweet(textarea.value, post);
            closeModal();
        };

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeModal();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                retweetBtn.click();
            }
        });

        // --- 以下、renderRetweetModalのtextarea生成直後 ---
        textarea.addEventListener('paste', async (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const files: File[] = [];
            for (const item of Array.from(e.clipboardData.items)) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                await this.widget.attachFiles(files);
                // 画像プレビューが必要ならここで呼ぶ
            }
        });
    }

    private renderRetweetListModal(post: TweetWidgetPost): void {
        const backdrop = document.body.createDiv('tweet-reply-modal-backdrop');
        const closeModal = () => {
            this.widget.closeRetweetList();
            backdrop.remove();
            this.render();
        };
        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeModal();
        };
        const modal = backdrop.createDiv('tweet-reply-modal');
        const widgetRect = this.container.getBoundingClientRect();
        modal.style.position = 'fixed';
        const modalWidth = Math.min(widgetRect.width - 40, 600);
        modal.style.width = `${modalWidth}px`;
        const viewportWidth  = window.innerWidth;
        const viewportHeight = window.innerHeight;
        setTimeout(() => {
            const modalHeight = modal.offsetHeight;
            let top = widgetRect.top + 30;
            // 通常はウィジェット下+30px、ただし下にはみ出す場合のみ中央揃え
            if (top + modalHeight > viewportHeight - 10) {
                top = (viewportHeight - modalHeight) / 2;
                if (top < 10) top = 10;
                if (top + modalHeight > viewportHeight - 10) top = viewportHeight - modalHeight - 10;
            } else {
                if (top < 10) top = 10;
            }
            modal.style.top = `${top}px`;
            let left = widgetRect.left + (widgetRect.width - modalWidth) / 2;
            if (left < 10) {
                left = 10;
            }
            if (left + modalWidth > viewportWidth - 10) {
                left = viewportWidth - modalWidth - 10;
            }
            modal.style.left = `${left}px`;
        }, 0);

        const header = modal.createDiv('tweet-reply-modal-header');
        header.createSpan({ text: '引用リツイート一覧' });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = closeModal;

        const listBox = modal.createDiv('tweet-reply-modal-post');
        const retweets = this.widget.getQuotePosts(post.id);
        if (retweets.length === 0) {
            listBox.createDiv({ text: 'まだ引用リツイートはありません。', cls: 'tweet-empty-notice' });
        } else {
            retweets.forEach(rt => {
                const wrapper = listBox.createDiv({ cls: 'tweet-quote-list-item' });
                wrapper.onclick = (e) => {
                    if ((e.target as HTMLElement).closest('.tweet-action-bar-main') ||
                        (e.target as HTMLElement).closest('.tweet-item-avatar-main')) return;
                    closeModal();
                    this.widget.navigateToDetail(rt.id);
                };
                this.renderSinglePost(rt, wrapper, true);
            });
        }
    }

    private renderEditModal(post: TweetWidgetPost): void {
        const backdrop = document.body.createDiv('tweet-reply-modal-backdrop');
        const closeModal = () => {
            this.widget.editingPostId = null;
            backdrop.remove();
            this.render();
        };
        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeModal();
        };
        const modal = backdrop.createDiv('tweet-reply-modal');
        const widgetRect = this.container.getBoundingClientRect();
        modal.style.position = 'fixed';
        const modalWidth = Math.min(widgetRect.width - 40, 600);
        modal.style.width = `${modalWidth}px`;
        const viewportWidth  = window.innerWidth;
        const viewportHeight = window.innerHeight;
        setTimeout(() => {
            const modalHeight = modal.offsetHeight;
            let top = widgetRect.top + 30;
            // 通常はウィジェット下+30px、ただし下にはみ出す場合のみ中央揃え
            if (top + modalHeight > viewportHeight - 10) {
                top = (viewportHeight - modalHeight) / 2;
                if (top < 10) top = 10;
                if (top + modalHeight > viewportHeight - 10) top = viewportHeight - modalHeight - 10;
            } else {
                if (top < 10) top = 10;
            }
            modal.style.top = `${top}px`;
            let left = widgetRect.left + (widgetRect.width - modalWidth) / 2;
            if (left < 10) {
                left = 10;
            }
            if (left + modalWidth > viewportWidth - 10) {
                left = viewportWidth - modalWidth - 10;
            }
            modal.style.left = `${left}px`;
        }, 0);

        const header = modal.createDiv('tweet-reply-modal-header');
        header.createSpan({ text: 'つぶやきを編集' });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = closeModal;

        const postBox = modal.createDiv('tweet-reply-modal-post');
        this.renderSinglePost(post, postBox, true);

        const inputArea = modal.createDiv('tweet-reply-modal-input');
        const textarea = inputArea.createEl('textarea', { cls: 'tweet-reply-modal-textarea', attr: { placeholder: 'つぶやきを編集', rows: 3 } });
        textarea.value = post.text;
        textarea.focus();

        const replyBtn = inputArea.createEl('button', { cls: 'tweet-reply-modal-btn', text: '編集完了' });
        replyBtn.onclick = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            await this.widget.submitPost(text);
            closeModal();
        };
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeModal();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                replyBtn.click();
            }
        });

        // --- 以下、renderEditModalのtextarea生成直後 ---
        textarea.addEventListener('paste', async (e: ClipboardEvent) => {
            if (!e.clipboardData) return;
            const files: File[] = [];
            for (const item of Array.from(e.clipboardData.items)) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                await this.widget.attachFiles(files);
                // 画像プレビューが必要ならここで呼ぶ
            }
        });
    }

    public onunload(): void {
        // モーダルで追加したグローバルイベントリスナーの解除
        // 例: showAvatarModalでkeydownを追加している
        window.removeEventListener('keydown', this._escHandlerForAvatarModal as any);
        window.removeEventListener('keydown', this._escHandlerForImageModal as any);
        // 必要に応じて他のクリーンアップ処理をここに追加
    }

    private async renderMarkdownWithMermaid(el: HTMLElement, text: string) {
        el.empty();
        await renderMarkdownBatchWithCache(text, el, '', new Component());
        await this.replaceMermaidBlocksWithSVG(el);
    }

    // MermaidブロックをWorkerでSVG化して差し替える
    private async replaceMermaidBlocksWithSVG(container: HTMLElement) {
        const codeBlocks = Array.from(container.querySelectorAll('pre > code.language-mermaid')) as HTMLElement[];
        for (const codeEl of codeBlocks) {
            const pre = codeEl.parentElement;
            if (!pre) continue;
            const code = codeEl.innerText;
            const id = 'mermaid-' + Math.random().toString(36).slice(2, 10);
            try {
                const svg = await renderMermaidInWorker(code, id);
                const wrapper = document.createElement('div');
                wrapper.innerHTML = svg;
                pre.replaceWith(wrapper);
            } catch (e) {
                // エラー時はそのまま
            }
        }
    }
}