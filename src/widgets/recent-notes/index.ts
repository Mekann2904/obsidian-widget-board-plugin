import { App, TFile, setIcon } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main';
import moment from 'moment';
import { applyWidgetSize, createWidgetContainer } from '../../utils';

export interface RecentNotesWidgetSettings {
    maxNotes?: number;
    width?: string;
    height?: string;
}

export const DEFAULT_RECENT_NOTES_SETTINGS: RecentNotesWidgetSettings = {
    maxNotes: 10,
};

/**
 * 最近編集したノートウィジェット
 * - ノート一覧表示、仮想リスト、差分更新UI
 */
export class RecentNotesWidget implements WidgetImplementation {
    id = 'recent-notes';
    private config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin;
    private widgetEl!: HTMLElement;
    private currentSettings!: RecentNotesWidgetSettings;

    /**
     * インスタンス初期化
     */
    constructor() {
        // ... 既存コード ...
    }

    /**
     * ウィジェットのDOM生成・初期化
     * @param config ウィジェット設定
     * @param app Obsidianアプリ
     * @param plugin プラグイン本体
     */
    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin;
        this.currentSettings = { ...DEFAULT_RECENT_NOTES_SETTINGS, ...(config.settings || {}) };
        config.settings = this.currentSettings;

        const { widgetEl, titleEl } = createWidgetContainer(config, 'recent-notes-widget');
        this.widgetEl = widgetEl;
        titleEl.textContent = this.config.title?.trim() || '最近編集したノート';

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
        this.renderNotesList(contentEl);

        // 追加: YAMLで大きさ指定があれば反映
        applyWidgetSize(this.widgetEl, config.settings);

        return this.widgetEl;
    }

    /**
     * ノートリストを描画（仮想リスト対応）
     */
    private renderNotesList(container: HTMLElement) {
        const parent = container.parentElement;
        if (parent) {
            const newContainer = container.cloneNode(false) as HTMLElement;
            parent.replaceChild(newContainer, container);
            container = newContainer;
        }
        const files = this.app.vault.getFiles()
            .filter(f => f.extension === 'md')
            .sort((a, b) => b.stat.mtime - a.stat.mtime)
            .slice(0, this.currentSettings.maxNotes || 10);

        if (files.length === 0) {
            container.createEl('p', { text: '最近編集したノートがありません。' });
            return;
        }

        // 仮想スクロール閾値
        const VIRTUAL_THRESHOLD = 100;
        const ROW_HEIGHT = 32; // 1行の高さ(px)
        if (files.length < VIRTUAL_THRESHOLD) {
            // 従来通り全件描画
            const listEl = container.createEl('ul', { cls: 'recent-notes-list' });
            const fragment = document.createDocumentFragment();
            files.forEach(file => {
                const itemEl = document.createElement('li');
                itemEl.className = 'recent-note-item';
                const linkEl = document.createElement('a');
                linkEl.textContent = file.basename;
                linkEl.href = '#';
                linkEl.onclick = (e) => {
                    e.preventDefault();
                    this.app.workspace.openLinkText(file.path, '', false);
                };
                itemEl.appendChild(linkEl);
                const dateStr = moment(file.stat.mtime).format('YYYY/MM/DD HH:mm');
                const dateSpan = document.createElement('span');
                dateSpan.textContent = ` (${dateStr})`;
                dateSpan.className = 'recent-note-date';
                itemEl.appendChild(dateSpan);
                fragment.appendChild(itemEl);
            });
            listEl.appendChild(fragment);
            return;
        }
        // --- 仮想リスト描画 ---
        const visibleCount = Math.floor(container.clientHeight / ROW_HEIGHT) || 10;
        let startIdx = 0;
        let endIdx = Math.min(files.length, visibleCount + 5); // 余分に数件描画
        const listWrapper = container.createDiv({ cls: 'recent-notes-virtual-wrapper' });
        listWrapper.style.position = 'relative';
        listWrapper.style.height = `${Math.min(files.length * ROW_HEIGHT, 600)}px`;
        listWrapper.style.overflowY = 'auto';
        listWrapper.style.maxHeight = '600px';
        const listEl = listWrapper.createEl('ul', { cls: 'recent-notes-list' });
        listEl.style.position = 'absolute';
        listEl.style.top = '0';
        listEl.style.left = '0';
        listEl.style.right = '0';
        listEl.style.width = '100%';
        // 仮想リスト描画関数
        const renderVirtualRows = (scrollTop: number) => {
            startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
            endIdx = Math.min(files.length, startIdx + visibleCount + 5);
            listEl.empty();
            listEl.style.transform = `translateY(${startIdx * ROW_HEIGHT}px)`;
            const fragment = document.createDocumentFragment();
            for (let i = startIdx; i < endIdx; i++) {
                const file = files[i];
                const itemEl = document.createElement('li');
                itemEl.className = 'recent-note-item';
                itemEl.style.height = `${ROW_HEIGHT}px`;
                const linkEl = document.createElement('a');
                linkEl.textContent = file.basename;
                linkEl.href = '#';
                linkEl.onclick = (e) => {
                    e.preventDefault();
                    this.app.workspace.openLinkText(file.path, '', false);
                };
                itemEl.appendChild(linkEl);
                const dateStr = moment(file.stat.mtime).format('YYYY/MM/DD HH:mm');
                const dateSpan = document.createElement('span');
                dateSpan.textContent = ` (${dateStr})`;
                dateSpan.className = 'recent-note-date';
                itemEl.appendChild(dateSpan);
                fragment.appendChild(itemEl);
            }
            listEl.appendChild(fragment);
        };
        // 初回描画
        renderVirtualRows(0);
        // スクロールイベントは1フレームに1回だけ処理
        let scheduled = false;
        listWrapper.onscroll = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                renderVirtualRows(listWrapper.scrollTop);
                scheduled = false;
            });
        };
    }

    /**
     * 外部から設定変更を受けて状態・UIを更新
     * @param newSettings 新しい設定
     */
    updateExternalSettings(newSettings: Partial<RecentNotesWidgetSettings>) {
        this.currentSettings = { ...this.currentSettings, ...newSettings };
        if (this.config && this.config.settings) {
            Object.assign(this.config.settings, this.currentSettings);
        }
        const contentEl = this.widgetEl.querySelector('.widget-content') as HTMLElement;
        if (contentEl) this.renderNotesList(contentEl);
    }
} 