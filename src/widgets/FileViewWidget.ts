import { App, TFile, Notice, FuzzySuggestModal, MarkdownRenderer, Component } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main';
import { renderMarkdownBatchWithCache } from '../utils/renderMarkdownBatch';

// ファイルサジェスト用モーダル
class FileSuggestModal extends FuzzySuggestModal<TFile> {
  onChooseCb: (file: TFile) => void;
  constructor(app: App, private files: TFile[], onChoose: (file: TFile) => void) {
    super(app);
    this.onChooseCb = onChoose;
    this.setPlaceholder('ファイルを検索...');
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
  private config!: WidgetConfig;
  private app!: App;
  private plugin!: WidgetBoardPlugin;
  private widgetEl!: HTMLElement;
  private fileContentEl!: HTMLElement;
  private fileNameInput!: HTMLInputElement;
  private openButton!: HTMLButtonElement;
  private selectButton!: HTMLButtonElement;
  private currentFile: TFile | null = null;
  private obsidianOpenButton!: HTMLButtonElement;
  private titleEl!: HTMLElement;
  // 高さモード: 'auto' or 'fixed'
  private heightMode: 'auto' | 'fixed' = 'auto';
  private fixedHeightPx: number = 200;

  create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
    this.config = config;
    this.app = app;
    this.plugin = plugin;

    // 設定から高さモード・値を初期化
    this.heightMode = (this.config.settings?.heightMode === 'fixed') ? 'fixed' : 'auto';
    this.fixedHeightPx = typeof this.config.settings?.fixedHeightPx === 'number' ? this.config.settings.fixedHeightPx : 200;

    // --- カード型ウィジェット本体 ---
    this.widgetEl = document.createElement('div');
    this.widgetEl.classList.add('widget', 'file-view-widget');
    this.widgetEl.setAttribute('data-widget-id', config.id);

    // --- タイトル ---
    this.titleEl = this.widgetEl.createEl('h4');
    this.updateTitle();

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
    this.fileNameInput.placeholder = 'ファイルパス';
    this.fileNameInput.value = this.config.settings?.fileName || '';
    this.fileNameInput.style.display = 'none';
    controlsEl.appendChild(this.fileNameInput);

    this.selectButton = document.createElement('button');
    this.selectButton.textContent = 'ファイル選択';
    this.selectButton.onclick = () => this.openFileSuggest();
    this.selectButton.style.display = 'none';
    controlsEl.appendChild(this.selectButton);

    // Obsidianで開くボタン（常時表示）
    this.obsidianOpenButton = document.createElement('button');
    this.obsidianOpenButton.textContent = 'Obsidianで開く';
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

    // 祖先要素にis-editingクラスが付与されたら編集UIを表示
    const setupEditModeObserver = () => {
      const getAncestors = (el: HTMLElement | null): HTMLElement[] => {
        const ancestors: HTMLElement[] = [];
        let current = el?.parentElement;
        while (current) {
          ancestors.push(current);
          current = current.parentElement;
        }
        return ancestors;
      };
      const ancestors = getAncestors(this.widgetEl);
      if (ancestors.length === 0) {
        setTimeout(setupEditModeObserver, 100); // まだ親が付与されていない場合は遅延
        return;
      }
      // すべての祖先要素にMutationObserverをセット
      ancestors.forEach(parent => {
        const observer = new MutationObserver(() => this.updateEditModeUI());
        observer.observe(parent, { attributes: true, attributeFilter: ['class'] });
      });
      this.updateEditModeUI();
    };
    setupEditModeObserver();

    return this.widgetEl;
  }

  // 編集モードUIの表示/非表示切り替え
  private updateEditModeUI() {
    // 祖先要素すべてにis-editingクラスがあるか判定
    let el: HTMLElement | null = this.widgetEl;
    let isEditing = false;
    while (el) {
      if (el.classList.contains('is-editing')) {
        isEditing = true;
        break;
      }
      el = el.parentElement;
    }
    this.fileNameInput.style.display = isEditing ? '' : 'none';
    this.selectButton.style.display = isEditing ? '' : 'none';
  }

  private openFileSuggest() {
    // .mdファイルのみサジェスト
    const files = this.app.vault.getFiles().filter(f => f.extension === 'md');
    new FileSuggestModal(this.app, files, async (file) => {
      this.fileNameInput.value = file.path;
      this.config.settings = this.config.settings || {};
      this.config.settings.fileName = file.path;
      await this.plugin.saveSettings();
      this.loadFile();
      this.updateTitle();
    }).open();
  }

  // ファイル内容をレンダリング
  private async loadFile() {
    const rawInput = this.config.settings?.fileName?.trim() || '';
    const fileName = rawInput;
    this.updateTitle();
    if (!fileName) {
      this.fileContentEl.empty();
      this.fileContentEl.setText('ファイルが選択されていません');
      this.currentFile = null;
      return;
    }
    // .mdファイル以外はエラー
    if (!fileName.endsWith('.md')) {
      this.fileContentEl.empty();
      this.fileContentEl.setText('Markdown（.md）ファイルのみ表示できます');
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
      this.fileContentEl.setText('ファイルが見つかりません');
      this.currentFile = null;
    }
  }

  onunload() {
    // クリーンアップ処理（必要なら）
  }

  updateExternalSettings(newSettings: any, widgetId?: string) {
    // 設定をインスタンスにも反映
    if (newSettings?.heightMode) {
      this.heightMode = newSettings.heightMode;
      this.config.settings.heightMode = newSettings.heightMode;
    }
    if (typeof newSettings?.fixedHeightPx === 'number') {
      this.fixedHeightPx = newSettings.fixedHeightPx;
      this.config.settings.fixedHeightPx = newSettings.fixedHeightPx;
    }
    this.applyContentHeightStyles();
  }

  // タイトルをファイル名に自動更新
  private updateTitle() {
    const fileName = this.config.settings?.fileName;
    if (fileName && fileName.trim() !== '') {
      const name = fileName.split(/[\\/]/).pop();
      this.titleEl.textContent = name || 'ファイルビューア';
    } else {
      this.titleEl.textContent = 'ファイルビューア';
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