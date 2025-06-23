import { App, Notice, setIcon, Menu, Component, Modal } from 'obsidian';
import type { TweetWidget } from './tweetWidget';
import type { TweetWidgetPost } from './types';
import { getFullThreadHistory } from './aiReply';
import { extractYouTubeUrl, fetchYouTubeTitle } from './tweetWidgetUtils';
import { TweetWidgetDataViewer } from './tweetWidgetDataViewer';
import { renderMarkdownBatchWithCache } from '../../utils/renderMarkdownBatch';
import { renderMermaidInWorker } from '../../utils';
import { debugLog } from '../../utils/logger';
import { StringKey, t } from '../../i18n';
import { TweetHistoryModal } from './versionControl/TweetHistoryModal';
import { BackupHistoryModal } from './backup/BackupHistoryModal';
import { EmergencyRecoveryModal } from './backup/EmergencyRecoveryModal';

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

    private t(key: StringKey, vars?: Record<string, string | number>): string {
        return t(this.widget.plugin.settings.language || 'ja', key, vars);
    }

    public resetScroll(skipPanelReset: boolean = false): void {
        this.container.scrollTop = 0;
        // 詳細表示時またはskipPanelResetが指定された場合はウィジェットボードパネルのスクロールはリセットしない
        if (!this.widget.detailPostId && !skipPanelReset) {
            const panel = this.container.closest('.widget-board-panel-custom');
            if (panel instanceof HTMLElement) panel.scrollTop = 0;
        }
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
        const homeTab = tabBar.createEl('button', { text: this.t('home'), cls: 'tweet-tab-btn' });
        const notifTab = tabBar.createEl('button', { text: this.t('notifications'), cls: 'tweet-tab-btn' });

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
            notifBox.createDiv({ text: this.t('notifications'), cls: 'tweet-notification-title' });
            notifications.slice(0, 20).forEach(n => this.renderSingleNotification(notifBox, n));
        } else {
            this.container.createDiv({ text: this.t('noNotifications'), cls: 'tweet-notification-empty' });
        }
    }

    private renderSingleNotification(container: HTMLElement, n: { type: string, from: TweetWidgetPost, to: TweetWidgetPost }): void {
        const notif = container.createDiv({ cls: 'tweet-notification-item' });
        notif.onclick = () => this.widget.navigateToDetail(n.to.id);

        const row = notif.createDiv({ cls: 'tweet-notification-row' });
        const avatarUrl = this.widget.getAvatarUrl(n.from);
        row.createEl('img', { attr: { src: avatarUrl, width: 36, height: 36 }, cls: 'tweet-notification-avatar' });
        
        const titleLine = row.createDiv({ cls: 'tweet-notification-titleline' });
        titleLine.createSpan({ text: n.from.userName || n.from.userId || this.t('someone'), cls: 'tweet-notification-user' });
        
        let actionText = n.type === 'reply' ? this.t('repliedToYou') : '';
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
        header.createDiv({ cls: 'tweet-detail-header-title', text: this.t('post') });
    }

    private renderFilterBar(): void {
        const filterBar = this.container.createDiv({ cls: 'tweet-filter-bar' });
        
        // フィルター選択
        const filterSelect = filterBar.createEl('select');
        [
            { value: 'active', label: this.t('filterActiveOnly') },
            { value: 'all', label: this.t('filterAll') },
            { value: 'deleted', label: this.t('filterDeletedOnly') },
            { value: 'bookmark', label: this.t('filterBookmarks') }
        ].forEach(opt => {
            filterSelect.createEl('option', { value: opt.value, text: opt.label });
        });
        filterSelect.value = this.widget.currentFilter;
        filterSelect.onchange = () => {
            const v = filterSelect.value as 'all' | 'active' | 'deleted' | 'bookmark';
            this.widget.setFilter(v);
        };
        const periodSelect = filterBar.createEl('select', { cls: 'tweet-period-select' });
        [
            { value: 'all', label: this.t('allTime') },
            { value: 'today', label: this.t('today') },
            { value: '1d', label: this.t('oneDay') },
            { value: '3d', label: this.t('threeDays') },
            { value: '7d', label: this.t('oneWeek') },
            { value: '30d', label: this.t('oneMonth') },
            { value: 'custom', label: this.t('custom') }
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
        const dataViewerBtn = filterBar.createEl('button', { text: this.t('dataViewer'), cls: 'tweet-data-viewer-btn' });
        dataViewerBtn.onclick = () => {
            this.showDataViewer();
        };

        // 履歴ボタンを追加
        const historyBtn = filterBar.createEl('button', { text: '履歴', cls: 'tweet-history-btn' });
        historyBtn.onclick = () => {
            this.showHistoryModal();
        };

        // バックアップボタンを追加
        const backupBtn = filterBar.createEl('button', { text: 'バックアップ', cls: 'tweet-backup-btn' });
        backupBtn.onclick = () => {
            this.showBackupModal();
        };

        // デバッグモードの時のみデバッグ関連ボタンを表示
        const isDebugMode = this.widget.plugin.settings.debugLogging === true;
        if (isDebugMode) {
            // 緊急復元ボタンを追加
            const emergencyBtn = filterBar.createEl('button', { text: '🚨 緊急復元', cls: 'tweet-emergency-btn' });
            emergencyBtn.onclick = () => {
                this.showEmergencyRecoveryModal();
            };

            // デバッグボタンを追加
            const debugBtn = filterBar.createEl('button', { text: '🔧 デバッグ', cls: 'tweet-debug-btn' });
            debugBtn.onclick = async () => {
                await this.widget.getRepository().debugBackupStatus(this.widget.plugin.settings.language || 'ja');
            };

            // 強制バックアップボタンを追加
            const forceBackupBtn = filterBar.createEl('button', { text: '💾 強制バックアップ', cls: 'tweet-force-backup-btn' });
            forceBackupBtn.onclick = async () => {
                await this.forceCreateBackup();
            };
        }
    }

    private showDataViewer() {
        const modal = new Modal(this.widget.app);
        modal.modalEl.addClass('tweet-data-viewer-modal');
        modal.onOpen = () => {
            const viewerContainer = modal.contentEl.createDiv();
            new TweetWidgetDataViewer(
                Array.from(this.widget.postsById.values()), 
                viewerContainer, 
                this.widget.plugin.settings.language || 'ja'
            );
        };
        modal.open();
    }

    private showHistoryModal() {
        const historyModal = new TweetHistoryModal(
            this.widget.app,
            this.widget.getRepository(),
            this.widget.plugin.settings.language || 'ja',
            () => {
                // 復元後の処理: ウィジェットを再読み込み
                this.widget.reloadTweetData();
            }
        );
        historyModal.open();
    }

    private showBackupModal() {
        const backupModal = new BackupHistoryModal(
            this.widget.app,
            this.widget.getRepository().getBackupManager(),
            (restoredData) => {
                // 復元後の処理: ウィジェットを再読み込み
                this.widget.reloadTweetData();
            }
        );
        backupModal.open();
    }

    /**
     * 緊急復元モーダルを表示
     */
    private showEmergencyRecoveryModal() {
        const emergencyModal = new EmergencyRecoveryModal(
            this.widget.app,
            this.widget.getRepository().getEmergencyRecoveryManager(),
            (restoredData) => {
                // 復元後の処理: ウィジェットを再読み込み
                this.widget.reloadTweetData();
            }
        );
        emergencyModal.open();
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
        const toggleBtn = toggleBar.createEl('button', { cls: 'tweet-toggle-switch', attr: { 'aria-label': this.t('previewMode'), type: 'button' } });
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
                placeholder: this.widget.replyingToParentId ? this.t('replyPlaceholder') : this.t('postPlaceholder') 
            }
        });
        input.addEventListener('input', async () => {
            scheduleBatchTweetResize(input);
        });
        requestAnimationFrame(() => {
            scheduleBatchTweetResize(input);
        });

        // --- YouTubeサジェストUI ---
        const ytSuggest = inputArea.createDiv({ cls: 'tweet-youtube-suggest', text: '' });
        ytSuggest.style.display = 'none';
        ytSuggest.textContent = '';
        input.addEventListener('input', async () => {
            const val = input.value;
            const url = extractYouTubeUrl(val);
            if (!url) {
                ytSuggest.style.display = 'none';
                ytSuggest.textContent = '';
                return;
            }
            ytSuggest.textContent = this.t('fetchingYoutubeTitle');
            ytSuggest.style.display = 'block';
            const currentInput = val;
            const title = await fetchYouTubeTitle(url);
            if (input.value !== currentInput) return;
            if (title) {
                ytSuggest.textContent = this.t('insertYoutubeTitle', { title });
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
                    ytSuggest.textContent = this.t('fetchYoutubeTitleFailed');
                    ytSuggest.onclick = null;
                }
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
            text: this.widget.editingPostId ? this.t('finishEditing') : (this.widget.replyingToParentId ? this.t('reply') : this.t('postVerb')) 
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
            // @サジェストリストが表示されている場合は既存のEnter処理を優先
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
            } else {
                // Cmd+EnterまたはCtrl+Enterでポスト
                if ((e.key === 'Enter') && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    postBtn.click();
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
            replyInfoDiv.setText(this.t('replyingTo', { user: replyingToPost.userName || replyingToPost.userId || '@user' }));
            const cancelReplyBtn = replyInfoDiv.createEl('button', { text: this.t('cancel'), cls: 'tweet-cancel-reply-btn' });
            cancelReplyBtn.onclick = () => this.widget.cancelReply();
        } else {
             this.widget.cancelReply();
        }
    }

    private renderInputIcons(iconBar: HTMLElement, input: HTMLTextAreaElement, filePreviewArea: HTMLElement): void {
        const imageBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main', attr: { title: this.t('attachImage') }});
        setIcon(imageBtn, 'image');
        const imageInput = document.createElement('input');
        imageInput.type = 'file';
        imageInput.accept = 'image/*';
        imageInput.multiple = true;
        imageInput.style.display = 'none';
        imageBtn.onclick = () => imageInput.click();
        iconBar.appendChild(imageInput);
        imageInput.onchange = async () => {
            if (!imageInput.files) return;
            await this.widget.attachFiles(Array.from(imageInput.files));
            this.renderFilePreview(filePreviewArea);
            imageInput.value = '';
        };

        const boldBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main', attr: { title: this.t('bold') }});
        setIcon(boldBtn, 'bold');
        boldBtn.onclick = () => this.widget.wrapSelection(input, '**');
        
        const italicBtn = iconBar.createEl('button', { cls: 'tweet-icon-btn-main', attr: { title: this.t('italic') }});
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

        // 画像本体
        const imgEl = document.createElement('img');
        imgEl.src = imgUrl;
        imgEl.alt = 'image-large';
    imgEl.className = "tweet-image-zoom-img";
        layer.appendChild(imgEl);
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.className = "tweet-image-zoom-close";

        // 閉じるボタン
        closeBtn.onclick = () => layer.remove();
        layer.appendChild(closeBtn);
        imgEl.style.transform = "scale(1)";
        imgEl.style.cursor = 'zoom-in';
        // track zoom state locally
        let isZoomed = false;
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
        menu.addItem(item => item.setTitle(this.t('copyImage')).setIcon('copy')
            .onClick(async () => {
                try {
                    const blob = await (await fetch(img.src)).blob();
                    await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                    ]);
                    new Notice(this.t('imageCopied'));
                } catch { /* ignore copy error */
                    new Notice(this.t('copyFailed'));
                }
            }));
        menu.addItem(item => item.setTitle(this.t('zoomImage')).setIcon('image')
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
            listEl.createEl('div', { cls: 'tweet-empty-notice', text: this.t('noTweetsYet') });
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
            container.createDiv({ cls: 'tweet-detail-no-reply', text: this.t('noReplies') });
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
            attr: { placeholder: this.t('replyPlaceholder') } 
        });
        const replyBtn = inputArea.createEl('button', { 
            cls: 'tweet-detail-reply-btn', 
            text: this.t('reply') 
        });
        replyBtn.onclick = async () => {
            const text = textarea.value.trim();
            if (!text) return;
            await this.widget.submitReply(text, targetPost.id);
            textarea.value = '';
        };

        // Cmd+EnterまたはCtrl+Enterで投稿
        textarea.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter') && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                replyBtn.click();
            }
        });

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
        userInfo.createEl('span', { text: post.userName || this.t('defaultUserName'), cls: 'tweet-item-username-main' });
        if (post.verified) {
            const badgeSpan = userInfo.createSpan({ cls: 'tweet-item-badge-main' });
            setIcon(badgeSpan, 'badge-check');
        }
        userInfo.createEl('span', { text: post.userId || '@you', cls: 'tweet-item-userid-main' });
        const timeText = '・' + this.widget.formatTimeAgo(post.created) + (post.edited ? this.t('edited') : '');
        userInfo.createEl('span', { text: timeText, cls: 'tweet-item-time-main' });

        if (post.threadId && !isDetail) {
             const parentPost = this.postsById.get(post.threadId);
             const replyToDiv = item.createDiv({ cls: 'tweet-item-reply-to' });
             if(parentPost && !parentPost.deleted) {
                 replyToDiv.setText(this.t('replyingToShort', { user: parentPost.userName || parentPost.userId || '@user' }));
             } else {
                 replyToDiv.setText(this.t('replyToDeleted'));
                 replyToDiv.addClass('deleted-reply');
             }
        }
        
        const textDiv = item.createDiv({ cls: 'tweet-item-text-main' });
        let displayText = post.text;
        try {
            const parsed = JSON.parse(displayText);
            if (parsed && typeof parsed.reply === 'string') displayText = parsed.reply;
        } catch { /* ignore parse errors */ }
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
        const debugLogging = this.widget?.plugin?.settings?.debugLogging === true;
        const vaultFiles = debugLogging ? this.app.vault.getFiles() : [];
        replacedText = replacedText.replace(/!\[\[(.+?)\]\]/g, (match, p1) => {
            let fileName = p1;
            try {
                const urlMatch = /([^/\\]+?)(\?.*)?$/.exec(p1);
                if (urlMatch) fileName = urlMatch[1];
            } catch { /* ignore parse errors */ }
            if (debugLogging) {
                debugLog(this.widget?.plugin, '[tweetWidgetUI] 画像置換: p1=', p1, 'fileName=', fileName, 'vaultFiles=', vaultFiles.map(f => ({name: f.name, path: f.path})));
            }
            let f = this.app.vault.getFileByPath(p1) || this.app.vault.getFileByPath(fileName);
            if (!f) {
                f = vaultFiles.find(v => v.name === fileName || v.name === p1) || null;
            }
            if (f) {
                if (debugLogging) debugLog(this.widget?.plugin, '[tweetWidgetUI] マッチしたファイル:', f);
                const url = this.app.vault.getResourcePath(f);
                return `![](${url})`;
            } else {
                if (debugLogging) debugLog(this.widget?.plugin, '[tweetWidgetUI] 画像ファイルが見つかりません:', p1);
            }
            return match;
        });
        replacedText = replacedText.replace(/!\[\]\((.+?)\)/g, (match, p1) => {
            let fileName = p1;
            try {
                const urlMatch = /([^/\\]+?)(\?.*)?$/.exec(p1);
                if (urlMatch) fileName = urlMatch[1];
            } catch { /* ignore parse errors */ }
            if (debugLogging) {
                debugLog(this.widget?.plugin, '[tweetWidgetUI] 画像置換 (md): p1=', p1, 'fileName=', fileName, 'vaultFiles=', vaultFiles.map(f => ({name: f.name, path: f.path})));
            }
            let f = this.app.vault.getFileByPath(p1) || this.app.vault.getFileByPath(fileName);
            if (!f) {
                f = vaultFiles.find(v => v.name === fileName || v.name === p1) || null;
            }
            if (f) {
                if (debugLogging) debugLog(this.widget?.plugin, '[tweetWidgetUI] マッチしたファイル (md):', f);
                const url = this.app.vault.getResourcePath(f);
                return `![](${url})`;
            } else {
                if (debugLogging) debugLog(this.widget?.plugin, '[tweetWidgetUI] 画像ファイルが見つかりません (md):', p1);
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
        if (post.bookmark) metadataDiv.createEl('span', { cls: 'tweet-chip bookmark', text: this.t('bookmarked') });
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
            historyDiv.createEl('div', { text: this.t('conversationHistory'), cls: 'tweet-ai-history-title' });
            const thread = getFullThreadHistory(post, this.widget.currentSettings.posts);
            thread.forEach(t => {
                const line = historyDiv.createDiv({ cls: 'tweet-ai-history-line' });
                const who = t.userId && t.userId.startsWith('@ai-') ? 'AI' : (t.userName || t.userId || this.t('defaultUserName'));
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
            geminiBtn.title = this.t('generateGeminiReply');
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
            row.createDiv({ text: this.t('peopleReacted'), cls: 'tweet-reacted-label' });
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

        menu.addItem((item) => item.setTitle(this.t('edit')).setIcon("pencil").onClick(() => this.widget.startEdit(post)));
        
        if (post.deleted) {
            menu.addItem(item => item.setTitle(this.t('restore')).setIcon('rotate-ccw').onClick(() => this.widget.setPostDeleted(post.id, false)));
        } else {
            menu.addItem(item => item.setTitle(this.t('hide')).setIcon('eye-off').onClick(() => this.widget.setPostDeleted(post.id, true)));
        }
        
        menu.addItem(item => item.setTitle(this.t('deletePermanently')).setIcon('x-circle').onClick(() => {
            if (confirm(this.t('confirmDeletePost'))) {
                this.widget.deletePost(post.id);
            }
        }));
        menu.addItem(item => item.setTitle(this.t('deleteThreadPermanently')).setIcon('trash').onClick(() => {
             if (confirm(this.t('confirmDeleteThread'))) {
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
                let label: string;
                if (option === null) {
                    label = this.t('off');
                } else {
                    label = option.charAt(0).toUpperCase() + option.slice(1);
                    if (labelMap && labelMap[option]) {
                        label += `（${labelMap[option]}）`;
                    }
                }
                menu.addItem(item => item
                    .setTitle(label)
                    .setChecked((currentValue ?? null) === option)
                    .onClick(() => this.widget.updatePostProperty(post.id, key, option)));
            });
        };

        addMenuItems(this.t('visibility'), ["public", "private", "draft"], post.visibility, 'visibility' as keyof TweetWidgetPost);
        menu.addSeparator();
        addMenuItems(this.t('noteQuality'), ["fleeting", "literature", "permanent"], post.noteQuality, 'noteQuality' as keyof TweetWidgetPost, 
            { fleeting: this.t('qualityFleeting'), literature: this.t('qualityLiterature'), permanent: this.t('qualityPermanent') });
        menu.addSeparator();
        addMenuItems(this.t('taskStatus'), [null, "todo", "doing", "done"], post.taskStatus, 'taskStatus' as keyof TweetWidgetPost);
        menu.addSeparator();

        menu.addItem(item => item.setTitle(this.t('openCreateContextNote')).setIcon("file-text")
            .onClick(() => this.widget.openContextNote(post)));

        menu.showAtMouseEvent(event);
    }

    private showRetweetMenu(event: MouseEvent, post: TweetWidgetPost): void {
        const menu = new Menu();
        menu.addItem(item => item.setTitle(this.t('quote')).setIcon('quote').onClick(() => this.widget.startRetweet(post)));
        menu.addItem(item => item.setTitle(this.t('details')).setIcon('list').onClick(() => this.widget.openRetweetList(post)));
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
        header.createSpan({ text: this.t('reply') });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = closeModal;

        const postBox = modal.createDiv('tweet-reply-modal-post');
        this.renderSinglePost(post, postBox, true);

        const inputArea = modal.createDiv('tweet-reply-modal-input');
        const textarea = inputArea.createEl('textarea', { cls: 'tweet-reply-modal-textarea', attr: { placeholder: this.t('replyPlaceholder') } });
        textarea.focus();

        // --- YouTubeサジェストUI ---
        const ytSuggest = inputArea.createDiv({ cls: 'tweet-youtube-suggest', text: '' });
        ytSuggest.style.display = 'none';
        ytSuggest.textContent = '';
        textarea.addEventListener('input', async () => {
            const val = textarea.value;
            const url = extractYouTubeUrl(val);
            if (!url) {
                ytSuggest.style.display = 'none';
                ytSuggest.textContent = '';
                return;
            }
            ytSuggest.textContent = this.t('fetchingYoutubeTitle');
            ytSuggest.style.display = 'block';
            const currentInput = val;
            const title = await fetchYouTubeTitle(url);
            if (textarea.value !== currentInput) return;
                if (title) {
                    ytSuggest.textContent = this.t('insertYoutubeTitle', { title });
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
                    ytSuggest.textContent = this.t('fetchYoutubeTitleFailed');
                    ytSuggest.onclick = null;
                }
        });

        const replyBtn = inputArea.createEl('button', { cls: 'tweet-reply-modal-btn', text: this.t('reply') });
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
        header.createSpan({ text: this.t('quoteRetweet') });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = closeModal;

        const postBox = modal.createDiv('tweet-reply-modal-post');
        this.renderSinglePost(post, postBox, true);

        const inputArea = modal.createDiv('tweet-reply-modal-input');
        const textarea = inputArea.createEl('textarea', { cls: 'tweet-reply-modal-textarea', attr: { placeholder: this.t('addComment') } });
        textarea.focus();

        const ytSuggest = inputArea.createDiv({ cls: 'tweet-youtube-suggest', text: '' });
        ytSuggest.style.display = 'none';
        ytSuggest.textContent = '';
        textarea.addEventListener('input', async () => {
            const val = textarea.value;
            const url = extractYouTubeUrl(val);
            if (!url) {
                ytSuggest.style.display = 'none';
                ytSuggest.textContent = '';
                return;
            }
            ytSuggest.textContent = this.t('fetchingYoutubeTitle');
            ytSuggest.style.display = 'block';
            const currentInput = val;
            const title = await fetchYouTubeTitle(url);
            if (textarea.value !== currentInput) return;
                if (title) {
                    ytSuggest.textContent = this.t('insertYoutubeTitle', { title });
                    ytSuggest.onclick = () => {
                        const insertText = `![${title}](${url})`;
                        const urlRegex = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}(?:[?&][^\s]*)?)/;
                        textarea.value = textarea.value.replace(urlRegex, insertText);
                        ytSuggest.style.display = 'none';
                        ytSuggest.textContent = '';
                        textarea.dispatchEvent(new Event('input'));
                    };
                } else {
                    ytSuggest.textContent = this.t('fetchYoutubeTitleFailed');
                    ytSuggest.onclick = null;
                }
        });

        const retweetBtn = inputArea.createEl('button', { cls: 'tweet-reply-modal-btn', text: this.t('retweet') });
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
        header.createSpan({ text: this.t('quoteRetweetList') });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = closeModal;

        const listBox = modal.createDiv('tweet-reply-modal-post');
        const retweets = this.widget.getQuotePosts(post.id);
        if (retweets.length === 0) {
            listBox.createDiv({ text: this.t('noQuoteRetweets'), cls: 'tweet-empty-notice' });
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
        header.createSpan({ text: this.t('editTweet') });
        const closeBtn = header.createEl('button', { text: '×', cls: 'tweet-reply-modal-close' });
        closeBtn.onclick = closeModal;

        const postBox = modal.createDiv('tweet-reply-modal-post');
        this.renderSinglePost(post, postBox, true);

        const inputArea = modal.createDiv('tweet-reply-modal-input');
        const textarea = inputArea.createEl('textarea', { cls: 'tweet-reply-modal-textarea', attr: { placeholder: this.t('editTweetPlaceholder'), rows: 3 } });
        textarea.value = post.text;
        textarea.focus();

        const replyBtn = inputArea.createEl('button', { cls: 'tweet-reply-modal-btn', text: this.t('finishEditing') });
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
        if (this._escHandlerForAvatarModal) {
            window.removeEventListener('keydown', this._escHandlerForAvatarModal);
        }
        if (this._escHandlerForImageModal) {
            window.removeEventListener('keydown', this._escHandlerForImageModal);
        }
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
                const frag = document.createRange().createContextualFragment(svg);
                wrapper.appendChild(frag);
                pre.replaceWith(wrapper);
            } catch {
                // エラー時はそのまま
            }
        }
    }

    /**
     * 強制バックアップ実行
     */
    private async forceCreateBackup(): Promise<void> {
        console.log('[TweetWidgetUI] 💾 強制バックアップボタンがクリックされました');
        
        try {
            const lang = this.widget.plugin.settings.language || 'ja';
            
            // 現在のデータを取得
            const currentData = this.widget.currentSettings;
            console.log('[TweetWidgetUI] 強制バックアップ開始');
            console.log(`[TweetWidgetUI] データ内容: 投稿=${currentData.posts?.length || 0}件, スケジュール投稿=${currentData.scheduledPosts?.length || 0}件`);
            
            // BackupManagerのonDataSaveを直接呼び出し
            const backupManager = this.widget.getRepository().getBackupManager();
            console.log('[TweetWidgetUI] BackupManager取得完了, onDataSave実行開始');
            
            await backupManager.onDataSave(currentData);
            
            new Notice('強制バックアップが完了しました');
            console.log('[TweetWidgetUI] ✅ 強制バックアップ完了');
            
        } catch (error) {
            console.error('[TweetWidgetUI] ❌ 強制バックアップエラー:', error);
            console.error('[TweetWidgetUI] エラースタック:', error.stack);
            new Notice(`強制バックアップでエラーが発生しました: ${error.message}`);
        }
    }
}