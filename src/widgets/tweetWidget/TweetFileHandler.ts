import { Notice } from 'obsidian';
import type { TweetWidgetFile } from './types';
import { readFileAsDataUrl } from './tweetWidgetUtils';
import { t, Language } from '../../i18n';

/**
 * ファイル処理を担当するクラス
 */
export class TweetFileHandler {
    private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    private static readonly SUPPORTED_FORMATS = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'video/mp4', 'video/webm', 'audio/mp3', 'audio/wav'
    ];

    /**
     * ファイルをアタッチする
     */
    static async attachFiles(files: File[], language: Language): Promise<TweetWidgetFile[]> {
        const attachedFiles: TweetWidgetFile[] = [];

        for (const file of files) {
            if (!this.isValidFile(file, language)) {
                continue;
            }

            try {
                const dataUrl = await readFileAsDataUrl(file);
                const tweetFile: TweetWidgetFile = {
                    name: file.name,
                    type: file.type,
                    dataUrl: dataUrl
                };
                attachedFiles.push(tweetFile);
            } catch (error) {
                console.error('ファイル読み込みエラー:', error);
                new Notice(`ファイル読み込みエラー: ${file.name}`);
            }
        }

        return attachedFiles;
    }

    /**
     * ファイルが有効かどうかをチェック
     */
    private static isValidFile(file: File, language: Language): boolean {
        // ファイルサイズチェック
        if (file.size > this.MAX_FILE_SIZE) {
            new Notice(`ファイルサイズが大きすぎます: ${file.name} (最大: 10MB)`);
            return false;
        }

        // ファイル形式チェック
        if (!this.SUPPORTED_FORMATS.includes(file.type)) {
            new Notice(`サポートされていないファイル形式: ${file.name}`);
            return false;
        }

        return true;
    }

    /**
     * ファイルプレビューのHTML要素を生成
     */
    static renderFilePreview(files: TweetWidgetFile[], container: HTMLElement): void {
        container.empty();
        
        files.forEach((file, index) => {
            const fileDiv = container.createDiv({ cls: 'tweet-file-preview' });
            
            if (file.type.startsWith('image/')) {
                const img = fileDiv.createEl('img', {
                    attr: { src: file.dataUrl, alt: file.name },
                    cls: 'tweet-file-preview-image'
                });
                img.style.maxWidth = '100px';
                img.style.maxHeight = '100px';
            } else if (file.type.startsWith('video/')) {
                const video = fileDiv.createEl('video', {
                    attr: { src: file.dataUrl, controls: 'true' },
                    cls: 'tweet-file-preview-video'
                });
                video.style.maxWidth = '100px';
                video.style.maxHeight = '100px';
            } else {
                fileDiv.createDiv({ 
                    text: file.name, 
                    cls: 'tweet-file-preview-name' 
                });
            }

            const removeBtn = fileDiv.createEl('button', {
                text: '×',
                cls: 'tweet-file-remove-btn'
            });
            
            removeBtn.onclick = () => {
                files.splice(index, 1);
                this.renderFilePreview(files, container);
            };
        });
    }

    /**
     * ドラッグ&ドロップのイベントハンドラを設定
     */
    static setupDragAndDrop(
        element: HTMLElement, 
        onFileDrop: (files: File[]) => Promise<void>
    ): void {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            element.classList.add('tweet-drag-over');
        });

        element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            element.classList.remove('tweet-drag-over');
        });

        element.addEventListener('drop', async (e) => {
            e.preventDefault();
            element.classList.remove('tweet-drag-over');
            
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length > 0) {
                await onFileDrop(files);
            }
        });
    }
} 