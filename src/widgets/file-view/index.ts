import { App, TFile, FuzzySuggestModal, Component } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main';
import { renderMarkdownBatchWithCache } from '../../utils/renderMarkdownBatch';
import { applyWidgetSize, createWidgetContainer } from '../../utils';
import { t, Language } from '../../i18n';

export interface FileViewWidgetSettings {
  fileName?: string;
  heightMode?: 'auto' | 'fixed';
  fixedHeightPx?: number;
}

// ファイルサジェスト用モーダル
class FileSuggestModal extends FuzzySuggestModal<TFile> {
  onChooseCb: (file: TFile) => void;
  constructor(app: App, private files: TFile[], onChoose: (file: TFile) => void, lang: Language) {
    super(app);
    this.onChooseCb = onChoose;
    this.setPlaceholder(t(lang, 'widget.fileView.searchFiles'));
  }
  getItems(): TFile[] {
    return this.files;
  }
  getItemText(item: TFile): string {
    return item.path;
  }
  onChooseItem(item: TFile) {
    this.onChooseCb(item);
  }
}

export class FileViewWidget implements WidgetImplementation {
  id = 'file-view-widget';
  config!: WidgetConfig;
  private app!: App;
  private plugin!: WidgetBoardPlugin;
  private widgetEl!: HTMLElement;
  private fileContentEl!: HTMLElement;
  private fileNameInput!: HTMLInputElement;
  private openButton!: HTMLButtonElement;
  private selectButton!: HTMLButtonElement;
  private currentFile: TFile | null = null;
  private obsidianOpenButton!: HTMLButtonElement;
  private titleEl: HTMLElement | undefined;
  // 高さモード: 'auto' or 'fixed'
  private heightMode: 'auto' | 'fixed' = 'auto';
  private fixedHeightPx = 200;

  create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
    this.config = config;
    this.app = app;
    this.plugin = plugin;

    const settings = (this.config.settings || {}) as FileViewWidgetSettings;
    this.config.settings = settings;
    // 設定から高さモード・値を初期化
    this.heightMode = settings.heightMode === 'fixed' ? 'fixed' : 'auto';
    this.fixedHeightPx = typeof settings.fixedHeightPx === 'number' ? settings.fixedHeightPx : 200;

    const lang = this.plugin.settings.language || 'ja';

    // --- カード型ウィジェット本体 ---
    const { widgetEl, titleEl } = createWidgetContainer(config, 'file-view-widget');
    this.widgetEl = widgetEl;
    if (titleEl) {
      this.titleEl = titleEl;
      this.updateTitle();
    }

    // --- カード内コンテンツ ---
    const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });

    // --- ボタン類をまとめて上部に配置 ---
    const controlsEl = contentEl.createDiv({ cls: 'fileview-controls' });
    controlsEl.style.display = 'flex';
    controlsEl.style.gap = '8px';
    controlsEl.style.marginBottom = '8px';
    controlsEl.style.alignItems = 'center';

    // 編集UI（初期は非表示）
    this.fileNameInput = document.createElement('input');
    this.fileNameInput.type = 'text';
    this.fileNameInput.placeholder = t(lang, 'widget.fileView.filePathPlaceholder');
    this.fileNameInput.value = (this.config.settings as FileViewWidgetSettings)?.fileName || '';
    this.fileNameInput.style.display = '';
    controlsEl.appendChild(this.fileNameInput);

    this.selectButton = document.createElement('button');
    this.selectButton.textContent = t(lang, 'widget.fileView.selectFile');
    this.selectButton.onclick = () => this.openFileSuggest();
    this.selectButton.style.display = '';
    controlsEl.appendChild(this.selectButton);

    // Obsidianで開くボタン（常時表示）
    this.obsidianOpenButton = document.createElement('button');
    this.obsidianOpenButton.textContent = t(lang, 'widget.fileView.openInObsidian');
    this.obsidianOpenButton.className = 'open-in-obsidian';
    this.obsidianOpenButton.onclick = () => {
      if (this.currentFile) {
        this.app.workspace.openLinkText(this.currentFile.path, '', false);
      }
    };
    controlsEl.appendChild(this.obsidianOpenButton);

    // ファイル内容表示欄
    this.fileContentEl = contentEl.createDiv({ cls: 'file-content' });
    this.applyContentHeightStyles();

    // 初期表示
    this.loadFile();

    // 追加: YAMLで大きさ指定があれば反映
    applyWidgetSize(this.widgetEl, config.settings as { width?: string, height?: string } | null);

    return this.widgetEl;
  }

  private openFileSuggest() {
    // .mdファイルのみサジェスト
    const files = this.app.vault.getFiles().filter(f => f.extension === 'md');
    const lang = this.plugin.settings.language || 'ja';
    new FileSuggestModal(this.app, files, async (file) => {
      this.fileNameInput.value = file.path;
      this.config.settings = this.config.settings || {};
      (this.config.settings as FileViewWidgetSettings).fileName = file.path;
      await this.plugin.saveSettings();
      this.loadFile();
      this.updateTitle();
    }, lang).open();
  }

  // ファイル内容をレンダリング
  private async loadFile() {
    const rawInput = (this.config.settings as FileViewWidgetSettings)?.fileName?.trim() || '';
    const fileName = rawInput;
    const lang = this.plugin.settings.language || 'ja';
    this.updateTitle();
    if (!fileName) {
      this.fileContentEl.empty();
      this.fileContentEl.setText(t(lang, 'widget.fileView.fileNotSelected'));
      this.currentFile = null;
      return;
    }
    // .mdファイル以外はエラー
    if (!fileName.endsWith('.md')) {
      this.fileContentEl.empty();
      this.fileContentEl.setText(t(lang, 'widget.fileView.onlyMarkdownSupported'));
      this.currentFile = null;
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(fileName);
    if (file instanceof TFile) {
      this.currentFile = file;
      const content = await this.app.vault.read(file);
      this.fileContentEl.empty();
      await renderMarkdownBatchWithCache(content, this.fileContentEl, file.path, new Component());
      // 追加: レンダリング後のリンクにクリックイベントを付与
      this.fileContentEl.querySelectorAll('a').forEach((a: HTMLAnchorElement) => {
        const href = a.getAttribute('data-href') || a.getAttribute('href');
        if (href && !href.startsWith('http')) {
          a.addEventListener('click', (e) => {
            e.preventDefault();
            this.app.workspace.openLinkText(href, file.path, false);
          });
        }
      });
    } else {
      this.fileContentEl.empty();
      this.fileContentEl.setText(t(lang, 'widget.fileView.fileNotFound'));
      this.currentFile = null;
    }
  }

  onunload() {
    // クリーンアップ処理（必要なら）
  }

  updateExternalSettings(newSettings: Partial<FileViewWidgetSettings>): void {
    // 設定をインスタンスにも反映
    if (newSettings?.heightMode) {
      this.heightMode = newSettings.heightMode;
      (this.config.settings as FileViewWidgetSettings).heightMode = newSettings.heightMode;
    }
    if (typeof newSettings?.fixedHeightPx === 'number') {
      this.fixedHeightPx = newSettings.fixedHeightPx;
      (this.config.settings as FileViewWidgetSettings).fixedHeightPx = newSettings.fixedHeightPx;
    }
    this.applyContentHeightStyles();
  }

  // タイトルをファイル名に自動更新
  private updateTitle() {
    const fileName = (this.config.settings as FileViewWidgetSettings)?.fileName;
    const lang = this.plugin.settings.language || 'ja';
    if (this.titleEl) {
      if (fileName && fileName.trim() !== '') {
        const name = fileName.split(/[\\/]/).pop();
        this.titleEl.textContent = name || t(lang, 'widget.fileView.title');
      } else {
        this.titleEl.textContent = t(lang, 'widget.fileView.title');
      }
    }
  }

  // 高さ制御を適用
  private applyContentHeightStyles() {
    if (this.heightMode === 'fixed') {
      this.fileContentEl.style.height = this.fixedHeightPx + 'px';
      this.fileContentEl.style.minHeight = this.fixedHeightPx + 'px';
      this.fileContentEl.style.maxHeight = this.fixedHeightPx + 'px';
      this.fileContentEl.style.overflowY = 'auto';
    } else {
      this.fileContentEl.style.height = '';
      this.fileContentEl.style.minHeight = '80px';
      this.fileContentEl.style.maxHeight = '';
      this.fileContentEl.style.overflowY = 'visible';
    }
  }
} 