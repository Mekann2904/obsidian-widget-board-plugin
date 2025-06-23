import { TweetWidget } from '../tweetWidget';

export interface DomElementInfo {
    tagName: string;
    className?: string;
    textContent?: string;
    innerHTML?: string;
    attributes?: Record<string, string>;
    children?: DomElementInfo[];
}

/**
 * 独自モーダル基底クラス
 * Obsidianの標準Modalクラスを使用せず、完全に独自実装
 */
export abstract class BaseModal {
    protected widget: TweetWidget;
    protected modalEl: HTMLElement;
    protected contentEl: HTMLElement;
    protected backdropEl: HTMLElement;
    protected isOpen: boolean = false;

    constructor(widget: TweetWidget) {
        this.widget = widget;
        this.createModal();
    }

    /**
     * モーダル要素の作成
     */
    private createModal(): void {
        // バックドロップ要素
        this.backdropEl = document.createElement('div');
        this.backdropEl.className = 'custom-modal-backdrop';
        this.backdropEl.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;

        // メインモーダル要素
        this.modalEl = document.createElement('div');
        this.modalEl.className = 'custom-modal';
        this.modalEl.style.cssText = `
            background: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            max-height: 90vh;
            overflow: hidden;
            transform: scale(0.95);
            transition: transform 0.2s ease;
            display: flex;
            flex-direction: column;
        `;

        // コンテンツ要素
        this.contentEl = document.createElement('div');
        this.contentEl.className = 'custom-modal-content';
        this.contentEl.style.cssText = `
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        `;

        // 要素の組み立て
        this.modalEl.appendChild(this.contentEl);
        this.backdropEl.appendChild(this.modalEl);

        // イベントリスナー
        this.backdropEl.addEventListener('click', (e) => {
            if (e.target === this.backdropEl) {
                this.close();
            }
        });

        // ESCキーで閉じる
        this.handleKeydown = this.handleKeydown.bind(this);
    }

    /**
     * キーボードイベントハンドラー
     */
    private handleKeydown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            this.close();
        }
    }

    /**
     * モーダルを開く
     */
    open(): void {
        if (this.isOpen) return;

        document.body.appendChild(this.backdropEl);
        document.addEventListener('keydown', this.handleKeydown);
        this.isOpen = true;

        // アニメーション
        requestAnimationFrame(() => {
            this.backdropEl.style.opacity = '1';
            this.modalEl.style.transform = 'scale(1)';
        });

        this.onOpen();
    }

    /**
     * モーダルを閉じる
     */
    close(): void {
        if (!this.isOpen) return;

        this.isOpen = false;
        document.removeEventListener('keydown', this.handleKeydown);

        // アニメーション
        this.backdropEl.style.opacity = '0';
        this.modalEl.style.transform = 'scale(0.95)';

        setTimeout(() => {
            if (this.backdropEl.parentNode) {
                document.body.removeChild(this.backdropEl);
            }
        }, 200);

        this.onClose();
    }

    /**
     * モーダルサイズを設定
     */
    protected setSize(width: string, height?: string): void {
        this.modalEl.style.width = width;
        if (height) {
            this.modalEl.style.height = height;
        }
    }

    /**
     * DOM要素を作成するヘルパーメソッド
     */
    protected createElement(info: DomElementInfo): HTMLElement {
        const element = document.createElement(info.tagName);
        
        if (info.className) {
            element.className = info.className;
        }
        
        if (info.textContent) {
            element.textContent = info.textContent;
        }
        
        if (info.innerHTML) {
            element.innerHTML = info.innerHTML;
        }
        
        if (info.attributes) {
            Object.entries(info.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        
        if (info.children) {
            info.children.forEach(child => {
                element.appendChild(this.createElement(child));
            });
        }
        
        return element;
    }

    /**
     * 国際化文字列を取得
     */
    protected t(key: string, vars?: Record<string, string>): string {
        const { t } = require('../../../i18n/index');
        return t(this.widget.plugin.settings.language || 'ja', key, vars);
    }

    /**
     * 派生クラスで実装する必要があるメソッド
     */
    protected abstract onOpen(): void;
    protected abstract onClose(): void;
} 