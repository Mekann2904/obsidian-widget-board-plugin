import { App, Component } from 'obsidian';
import { renderMarkdownBatchWithCache } from '../../../utils/renderMarkdownBatch';
import { renderMermaidInWorker } from '../../../utils/mermaidRenderWorkerClient';
import type { TweetWidgetFile } from '../types';

/**
 * 統一プレビューマネージャー
 * すべてのプレビュー機能を一元管理し、一貫性とエラーハンドリングを提供
 */
export class PreviewManager {
    private app: App;
    private activePreviewContainers: Set<HTMLElement> = new Set();
    private debounceTimeouts: Map<HTMLElement, number> = new Map();

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Markdownテキストのプレビューをレンダリング
     */
    async renderMarkdownPreview(
        container: HTMLElement, 
        text: string, 
        options: {
            debounceMs?: number;
            maxHeight?: string;
            showLoadingIndicator?: boolean;
        } = {}
    ): Promise<{ success: boolean; error?: string }> {
        const { debounceMs = 300, maxHeight = '400px', showLoadingIndicator = true } = options;

        try {
            // デバウンス処理
            if (debounceMs > 0) {
                const existingTimeout = this.debounceTimeouts.get(container);
                if (existingTimeout) {
                    clearTimeout(existingTimeout);
                }

                return new Promise((resolve) => {
                    const timeoutId = window.setTimeout(async () => {
                        this.debounceTimeouts.delete(container);
                        const result = await this.renderMarkdownPreview(container, text, { ...options, debounceMs: 0 });
                        resolve(result);
                    }, debounceMs);
                    
                    this.debounceTimeouts.set(container, timeoutId);
                });
            }

            // ローディング表示
            if (showLoadingIndicator) {
                this.showLoadingIndicator(container);
            }

            // 空テキストの場合
            if (!text.trim()) {
                this.showEmptyPreview(container);
                return { success: true };
            }

            // プレビューコンテナを準備
            this.preparePreviewContainer(container, maxHeight);
            this.activePreviewContainers.add(container);

            // Markdownレンダリング
            await this.renderMarkdownContent(container, text);

            // Mermaid図表の処理
            await this.processMermaidBlocks(container);

            return { success: true };

        } catch (error) {
            console.error('[PreviewManager] Markdownプレビューエラー:', error);
            this.showErrorPreview(container, error instanceof Error ? error.message : String(error));
            return { 
                success: false, 
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * ファイルプレビューのレンダリング
     */
    renderFilePreview(
        container: HTMLElement, 
        files: TweetWidgetFile[],
        options: {
            maxItems?: number;
            imageMaxSize?: { width: number; height: number };
            showRemoveButtons?: boolean;
            onRemove?: (index: number) => void;
        } = {}
    ): { success: boolean; error?: string } {
        try {
            const { 
                maxItems = 10, 
                imageMaxSize = { width: 120, height: 120 },
                showRemoveButtons = true,
                onRemove
            } = options;

            container.empty();
            container.className = 'preview-file-container';

            if (files.length === 0) {
                this.showEmptyFilePreview(container);
                return { success: true };
            }

            // 最大表示数制限
            const displayFiles = files.slice(0, maxItems);
            const hasMore = files.length > maxItems;

            displayFiles.forEach((file, index) => {
                const fileDiv = container.createDiv({ cls: 'preview-file-item' });
                
                // ファイルタイプ別の表示
                if (file.type.startsWith('image/')) {
                    this.renderImagePreview(fileDiv, file, imageMaxSize);
                } else if (file.type.startsWith('video/')) {
                    this.renderVideoPreview(fileDiv, file, imageMaxSize);
                } else if (file.type.startsWith('audio/')) {
                    this.renderAudioPreview(fileDiv, file);
                } else {
                    this.renderGenericFilePreview(fileDiv, file);
                }

                // 削除ボタン
                if (showRemoveButtons && onRemove) {
                    const removeBtn = fileDiv.createEl('button', {
                        cls: 'preview-file-remove',
                        text: '×',
                        attr: { 'aria-label': 'ファイルを削除' }
                    });
                    
                    removeBtn.onclick = (e) => {
                        e.stopPropagation();
                        onRemove(index);
                    };
                }

                // ファイル情報ツールチップ
                this.addFileTooltip(fileDiv, file);
            });

            // 追加ファイル表示
            if (hasMore) {
                const moreDiv = container.createDiv({ 
                    cls: 'preview-file-more',
                    text: `+${files.length - maxItems} 個のファイル` 
                });
            }

            return { success: true };

        } catch (error) {
            console.error('[PreviewManager] ファイルプレビューエラー:', error);
            this.showErrorPreview(container, 'ファイルプレビューの表示に失敗しました');
            return { 
                success: false, 
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    /**
     * プレビューのクリーンアップ
     */
    cleanup(container?: HTMLElement): void {
        if (container) {
            // 特定のコンテナのクリーンアップ
            this.activePreviewContainers.delete(container);
            const timeout = this.debounceTimeouts.get(container);
            if (timeout) {
                clearTimeout(timeout);
                this.debounceTimeouts.delete(container);
            }
        } else {
            // 全体のクリーンアップ
            this.debounceTimeouts.forEach(timeout => clearTimeout(timeout));
            this.debounceTimeouts.clear();
            this.activePreviewContainers.clear();
        }
    }

    /**
     * プレビューの状態取得
     */
    getPreviewStats(): {
        activeContainers: number;
        pendingRenders: number;
    } {
        return {
            activeContainers: this.activePreviewContainers.size,
            pendingRenders: this.debounceTimeouts.size
        };
    }

    // === プライベートメソッド ===

    private showLoadingIndicator(container: HTMLElement): void {
        container.empty();
        container.className = 'preview-loading';
        const loader = container.createDiv({ cls: 'preview-loader' });
        loader.innerHTML = `
            <div class="preview-spinner"></div>
            <span>プレビューを読み込み中...</span>
        `;
    }

    private showEmptyPreview(container: HTMLElement): void {
        container.empty();
        container.className = 'preview-empty';
        container.createDiv({ 
            cls: 'preview-empty-message',
            text: 'テキストを入力するとプレビューが表示されます' 
        });
    }

    private showErrorPreview(container: HTMLElement, error: string): void {
        container.empty();
        container.className = 'preview-error';
        const errorDiv = container.createDiv({ cls: 'preview-error-content' });
        errorDiv.createDiv({ cls: 'preview-error-icon', text: '⚠️' });
        errorDiv.createDiv({ 
            cls: 'preview-error-message',
            text: `プレビューエラー: ${error}` 
        });
    }

    private preparePreviewContainer(container: HTMLElement, maxHeight: string): void {
        container.empty();
        container.className = 'tweet-input-preview-markdown';
        container.style.maxHeight = maxHeight;
        container.style.overflowY = 'auto';
        container.style.border = '1px solid var(--background-modifier-border)';
        container.style.borderRadius = '4px';
        container.style.padding = '12px';
        container.style.backgroundColor = 'var(--background-primary)';
    }

    private async renderMarkdownContent(container: HTMLElement, text: string): Promise<void> {
        try {
            await renderMarkdownBatchWithCache(text, container, '', new Component());
        } catch (error) {
            console.error('[PreviewManager] Markdownレンダリングエラー:', error);
            throw new Error(`Markdownの解析に失敗しました: ${error.message}`);
        }
    }

    private async processMermaidBlocks(container: HTMLElement): Promise<void> {
        try {
            const codeBlocks = Array.from(container.querySelectorAll('pre > code.language-mermaid')) as HTMLElement[];
            
            for (const codeEl of codeBlocks) {
                const pre = codeEl.parentElement;
                if (!pre) continue;

                const code = codeEl.innerText;
                if (!code.trim()) continue;

                const id = 'mermaid-' + Math.random().toString(36).slice(2, 10);
                
                try {
                    const svg = await renderMermaidInWorker(code, id);
                    const wrapper = document.createElement('div');
                    wrapper.className = 'preview-mermaid-wrapper';
                    const frag = document.createRange().createContextualFragment(svg);
                    wrapper.appendChild(frag);
                    pre.replaceWith(wrapper);
                } catch (mermaidError) {
                    console.warn('[PreviewManager] Mermaid処理エラー:', mermaidError);
                    // エラー時は元のコードブロックのままにする
                    pre.classList.add('preview-mermaid-error');
                    const errorNote = pre.createDiv({ 
                        cls: 'preview-mermaid-error-note',
                        text: '⚠️ Mermaid図表の処理に失敗しました' 
                    });
                }
            }
        } catch (error) {
            console.error('[PreviewManager] Mermaidブロック処理エラー:', error);
            // エラーでも処理を続行
        }
    }

    private showEmptyFilePreview(container: HTMLElement): void {
        container.createDiv({ 
            cls: 'preview-file-empty',
            text: 'ファイルが添付されていません' 
        });
    }

    private renderImagePreview(
        container: HTMLElement, 
        file: TweetWidgetFile, 
        maxSize: { width: number; height: number }
    ): void {
        const img = container.createEl('img', {
            cls: 'preview-file-image',
            attr: { 
                src: file.dataUrl, 
                alt: file.name,
                loading: 'lazy'
            }
        });
        
        img.style.maxWidth = `${maxSize.width}px`;
        img.style.maxHeight = `${maxSize.height}px`;
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';

        // 画像読み込みエラーハンドリング
        img.onerror = () => {
            container.empty();
            this.renderGenericFilePreview(container, file);
        };
    }

    private renderVideoPreview(
        container: HTMLElement, 
        file: TweetWidgetFile, 
        maxSize: { width: number; height: number }
    ): void {
        const video = container.createEl('video', {
            cls: 'preview-file-video',
            attr: { 
                src: file.dataUrl,
                controls: 'true',
                preload: 'metadata'
            }
        });
        
        video.style.maxWidth = `${maxSize.width}px`;
        video.style.maxHeight = `${maxSize.height}px`;
        video.style.borderRadius = '4px';
    }

    private renderAudioPreview(container: HTMLElement, file: TweetWidgetFile): void {
        const audioWrapper = container.createDiv({ cls: 'preview-file-audio' });
        
        audioWrapper.createDiv({ 
            cls: 'preview-file-icon',
            text: '🎵' 
        });
        
        const audio = audioWrapper.createEl('audio', {
            cls: 'preview-file-audio-player',
            attr: { 
                src: file.dataUrl,
                controls: 'true',
                preload: 'metadata'
            }
        });
        
        audioWrapper.createDiv({ 
            cls: 'preview-file-name',
            text: file.name 
        });
    }

    private renderGenericFilePreview(container: HTMLElement, file: TweetWidgetFile): void {
        const fileWrapper = container.createDiv({ cls: 'preview-file-generic' });
        
        // ファイルタイプ別アイコン
        const icon = this.getFileIcon(file.type);
        fileWrapper.createDiv({ 
            cls: 'preview-file-icon',
            text: icon 
        });
        
        fileWrapper.createDiv({ 
            cls: 'preview-file-name',
            text: file.name 
        });
        
        // ファイルサイズは利用できないため省略
    }

    private addFileTooltip(container: HTMLElement, file: TweetWidgetFile): void {
        container.title = [
            `ファイル名: ${file.name}`,
            `種類: ${file.type}`
        ].join('\n');
    }

    private getFileIcon(mimeType: string): string {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎬';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('text/')) return '📝';
        if (mimeType.includes('json') || mimeType.includes('xml')) return '⚙️';
        return '📁';
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }
} 