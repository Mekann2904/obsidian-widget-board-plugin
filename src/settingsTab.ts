// src/settingsTab.ts
import { App, PluginSettingTab, Setting, Notice, DropdownComponent, SliderComponent, TextComponent, Modal, TFile, TFolder, FuzzySuggestModal } from 'obsidian';
import type WidgetBoardPlugin from './main';
import type { BoardConfiguration, WidgetConfig } from './interfaces';
import { DEFAULT_BOARD_CONFIGURATION } from './settingsDefaults';
import { WidgetBoardModal } from './modal';
import { DEFAULT_POMODORO_SETTINGS, PomodoroSettings, PomodoroSoundType } from './widgets/pomodoroWidget';
import { DEFAULT_MEMO_SETTINGS, MemoWidgetSettings } from './widgets/memoWidget';
import { DEFAULT_CALENDAR_SETTINGS, CalendarWidgetSettings } from './widgets/calendarWidget';
import { DEFAULT_RECENT_NOTES_SETTINGS } from './widgets/recentNotesWidget';
import { DEFAULT_TIMER_STOPWATCH_SETTINGS } from './widgets/timerStopwatchWidget';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from './widgets/tweetWidget/tweetWidget';
import { obfuscate, deobfuscate } from './utils';
// import { registeredWidgetImplementations } from './widgetRegistry'; // 未使用なのでコメントアウトまたは削除

// ウィジェットタイプに対応する表示名のマッピング
const WIDGET_TYPE_DISPLAY_NAMES: { [key: string]: string } = {
    'pomodoro': 'ポモドーロタイマー',
    'memo': 'メモ',
    'timer-stopwatch': 'タイマー/ストップウォッチ',
    'calendar': 'カレンダー',
    'recent-notes': '最近編集したノート',
    'theme-switcher': 'テーマ切り替え',
    'file-view': 'ファイルビューア',
    'tweet-widget': 'つぶやき',
};

/**
 * プラグインの「ウィジェットボード設定」タブを管理するクラス
 * - 各種設定UIの生成・保存・ボード/グループ管理などを担当
 */
export class WidgetBoardSettingTab extends PluginSettingTab {
    plugin: WidgetBoardPlugin;
    private selectedBoardId: string | null = null;
    private boardDropdownEl: HTMLSelectElement | null = null;
    private boardGroupBodyEl: HTMLElement | null = null;

    /**
     * 設定タブの初期化
     * @param app Obsidianアプリインスタンス
     * @param plugin プラグイン本体
     */
    constructor(app: App, plugin: WidgetBoardPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (this.plugin.settings.boards.length > 0) {
            this.selectedBoardId = this.plugin.settings.lastOpenedBoardId || this.plugin.settings.boards[0].id;
        }
    }

    /**
     * 設定タブのUIを描画
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'ウィジェットボード設定' });

        // --- アコーディオン生成ヘルパー (トップレベル用) ---
        const createAccordion = (title: string, defaultOpen: boolean = false) => {
            const acc = containerEl.createDiv({ cls: 'wb-accordion' + (defaultOpen ? ' wb-accordion-open' : '') });
            const header = acc.createDiv({ cls: 'wb-accordion-header' });
            const icon = header.createSpan({ cls: 'wb-accordion-icon' });
            icon.setText('▶');
            header.appendText(title);
            const body = acc.createDiv({ cls: 'wb-accordion-body' });

            if (defaultOpen) {
                header.addClass('wb-accordion-open');
                // icon.setText('▼'); // アイコンを開いた状態にする場合
            } else {
                body.style.display = 'none'; // 初期状態で閉じていればbodyも非表示
            }

            header.addEventListener('click', (event) => {
                // ヘッダー自身がクリックされた場合のみ開閉
                if (event.currentTarget !== event.target) return;
                const isOpen = acc.classList.toggle('wb-accordion-open');
                header.classList.toggle('wb-accordion-open');
                // icon.setText(isOpen ? '▼' : '▶'); // アイコン切り替え
                body.style.display = isOpen ? '' : 'none';
            });
            return { acc, header, body };
        };

        // --- ポモドーロ（グローバル設定） ---
        const pomoAcc = createAccordion('ポモドーロ（グローバル設定）', false); // デフォルトで閉じる
        new Setting(pomoAcc.body)
            .setName('通知音')
            .setDesc('全てのポモドーロタイマーで使う通知音（個別設定より優先）')
            .addDropdown(dropdown => {
                dropdown.addOption('off', 'なし');
                dropdown.addOption('default_beep', 'ビープ音');
                dropdown.addOption('bell', 'ベル');
                dropdown.addOption('chime', 'チャイム');
                dropdown.setValue(this.plugin.settings.pomodoroNotificationSound || 'default_beep')
                    .onChange(async (value) => {
                        this.plugin.settings.pomodoroNotificationSound = value as PomodoroSoundType;
                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton(btn => {
                btn.setIcon('play');
                btn.setTooltip('音を聞く');
                btn.onClick(() => {
                    playTestNotificationSound(
                        this.plugin,
                        this.plugin.settings.pomodoroNotificationSound || 'default_beep',
                        this.plugin.settings.pomodoroNotificationVolume ?? 0.2
                    );
                });
            });
        new Setting(pomoAcc.body)
            .setName('通知音量')
            .setDesc('通知音の音量（0.0〜1.0）')
            .addSlider(slider => {
                slider.setLimits(0, 1, 0.01)
                    .setValue(this.plugin.settings.pomodoroNotificationVolume ?? 0.2);
                const valueLabel = document.createElement('span');
                valueLabel.style.marginLeft = '12px';
                valueLabel.style.fontWeight = 'bold';
                valueLabel.textContent = String((this.plugin.settings.pomodoroNotificationVolume ?? 0.2).toFixed(2));
                slider.sliderEl.parentElement?.appendChild(valueLabel);
                slider.onChange(async (value) => {
                    this.plugin.settings.pomodoroNotificationVolume = value;
                    valueLabel.textContent = String(value.toFixed(2));
                    await this.plugin.saveSettings();
                });
            });
        // --- ポモドーロ終了時に該当ボードを自動で開く ---
        new Setting(pomoAcc.body)
            .setName('ポモドーロ終了時に該当ボードを自動で開く')
            .setDesc('ONにすると、ポモドーロが終了したときにこのウィジェットが属するボードを自動で開きます。')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.openBoardOnPomodoroEnd ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.openBoardOnPomodoroEnd = value;
                        await this.plugin.saveSettings();
                    });
            });
        // --- ポモドーロ終了時に自動で次のセッションを開始 ---
        new Setting(pomoAcc.body)
            .setName('ポモドーロ終了時に自動で次のセッションを開始')
            .setDesc('ONにすると、ポモドーロが終了したときに自動で次のセッションを開始します。')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.autoStartNextPomodoroSession ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.autoStartNextPomodoroSession = value;
                        await this.plugin.saveSettings();
                    });
            });
        // --- エクスポート形式（グローバル設定） ---
        new Setting(pomoAcc.body)
            .setName('エクスポート形式')
            .setDesc('全てのポモドーロタイマーで使うログ記録形式（個別設定より優先）')
            .addDropdown(dropdown => {
                dropdown.addOption('none', '保存しない');
                dropdown.addOption('csv', 'CSV');
                dropdown.addOption('json', 'JSON');
                dropdown.addOption('markdown', 'Markdown');
                dropdown.setValue(this.plugin.settings.pomodoroExportFormat || 'none')
                    .onChange(async (value) => {
                        this.plugin.settings.pomodoroExportFormat = value as any;
                        await this.plugin.saveSettings();
                    });
            });

        // --- タイマー／ストップウォッチ通知音（全体設定） ---
        const timerAcc = createAccordion('タイマー／ストップウォッチ（グローバル設定）', false); // デフォルトで閉じる
        new Setting(timerAcc.body)
            .setName('通知音')
            .setDesc('全てのタイマー／ストップウォッチで使う通知音（個別設定より優先）')
            .addDropdown(dropdown => {
                dropdown.addOption('off', 'なし');
                dropdown.addOption('default_beep', 'ビープ音');
                dropdown.addOption('bell', 'ベル');
                dropdown.addOption('chime', 'チャイム');
                dropdown.setValue(this.plugin.settings.timerStopwatchNotificationSound || 'default_beep')
                    .onChange(async (value) => {
                        this.plugin.settings.timerStopwatchNotificationSound = value as import("./widgets/timerStopwatchWidget").TimerSoundType;
                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton(btn => {
                btn.setIcon('play');
                btn.setTooltip('音を聞く');
                btn.onClick(() => {
                    playTestNotificationSound(
                        this.plugin,
                        this.plugin.settings.timerStopwatchNotificationSound || 'default_beep',
                        this.plugin.settings.timerStopwatchNotificationVolume ?? 0.5
                    );
                });
            });
        new Setting(timerAcc.body)
            .setName('通知音量')
            .setDesc('通知音の音量（0.0〜1.0）')
            .addSlider(slider => {
                slider.setLimits(0, 1, 0.01)
                    .setValue(this.plugin.settings.timerStopwatchNotificationVolume ?? 0.5);
                const valueLabel = document.createElement('span');
                valueLabel.style.marginLeft = '12px';
                valueLabel.style.fontWeight = 'bold';
                valueLabel.textContent = String((this.plugin.settings.timerStopwatchNotificationVolume ?? 0.5).toFixed(2));
                slider.sliderEl.parentElement?.appendChild(valueLabel);
                slider.onChange(async (value) => {
                    this.plugin.settings.timerStopwatchNotificationVolume = value;
                    valueLabel.textContent = String(value.toFixed(2));
                    await this.plugin.saveSettings();
                });
            });

        // --- LLMグローバル設定 ---
        const llmAcc = createAccordion('LLM（グローバル設定）', false);
        llmAcc.body.createEl('h4', { text: 'Gemini' });
        // Gemini APIキー
        new Setting(llmAcc.body)
            .setName('Gemini APIキー')
            .setDesc('Google Gemini APIのキーを入力してください。')
            .addText(text => {
                text.inputEl.type = 'password'; // マスキング
                text.setPlaceholder('sk-...')
                    .setValue(deobfuscate(this.plugin.settings.llm?.gemini?.apiKey || ''))
                    .onChange(async (v) => { /* 入力途中は何もしない */ });
                // 表示/非表示トグルボタン
                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.textContent = '表示';
                toggleBtn.style.marginLeft = '8px';
                toggleBtn.onclick = () => {
                    if (text.inputEl.type === 'password') {
                        text.inputEl.type = 'text';
                        toggleBtn.textContent = '非表示';
                    } else {
                        text.inputEl.type = 'password';
                        toggleBtn.textContent = '表示';
                    }
                };
                text.inputEl.parentElement?.appendChild(toggleBtn);
                text.inputEl.addEventListener('blur', async () => {
                    const plain = text.inputEl.value.trim();
                    if (!this.plugin.settings.llm) {
                        this.plugin.settings.llm = { gemini: { apiKey: '', model: 'gemini-2.0-flash-exp' } };
                    }
                    if (!this.plugin.settings.llm.gemini) {
                        this.plugin.settings.llm.gemini = { apiKey: '', model: 'gemini-2.0-flash-exp' };
                    }
                    this.plugin.settings.llm.gemini.apiKey = obfuscate(plain);
                    await this.plugin.saveSettings();
                });
            });
        // Gemini モデル名
        new Setting(llmAcc.body)
            .setName('モデル名')
            .setDesc('例: gemini-2.0-flash-exp')
            .addText(text => {
                text.setValue(this.plugin.settings.llm?.gemini?.model || 'gemini-2.0-flash-exp')
                    .onChange(async (v) => {
                        if (!this.plugin.settings.llm) this.plugin.settings.llm = { gemini: { apiKey: '', model: 'gemini-2.0-flash-exp' } };
                        this.plugin.settings.llm.gemini.model = v;
                        await this.plugin.saveSettings();
                    });
            });

        // --- つぶやき（グローバル設定） ---
        const tweetGlobalAcc = createAccordion('つぶやき（グローバル設定）', false);
        // DB保存先
        let customPathSettingEl: HTMLElement | null = null;
        new Setting(tweetGlobalAcc.body)
            .setName('保存先')
            .setDesc('つぶやきデータ（tweets.json）の保存場所を選択できます。')
            .addDropdown(dropdown => {
                dropdown.addOption('vault', 'Vaultルート（デフォルト）');
                dropdown.addOption('custom', 'カスタムパス（Vault内のフォルダ）');
                dropdown.setValue(this.plugin.settings.tweetDbLocation || 'vault')
                    .onChange(async (value) => {
                        this.plugin.settings.tweetDbLocation = value as 'vault' | 'custom';
                        await this.plugin.saveSettings();
                        if (customPathSettingEl) {
                            customPathSettingEl.style.display = (value === 'custom') ? '' : 'none';
                        }
                    });
            });
        // カスタムパス入力欄
        const customPathSetting = new Setting(tweetGlobalAcc.body)
            .setName('カスタムパス')
            .setDesc('Vault内のフォルダのみ指定可能（例: myfolder）→ tweets.jsonが自動で付きます')
            .addText(text => {
                text.setPlaceholder('myfolder')
                    .setValue(this.plugin.settings.tweetDbCustomPath?.replace(/\/tweets\.json$/, '') || '')
                    .onChange(async (v) => {
                        // 入力途中は何もしない
                    });
                text.inputEl.addEventListener('blur', async () => {
                    let v = text.inputEl.value.trim();
                    if (v.startsWith('/') || v.match(/^([A-Za-z]:\\|\\|~)/)) {
                        new Notice('Vault内の相対パスのみ指定できます。絶対パスやVault外は不可です。');
                        text.setValue(this.plugin.settings.tweetDbCustomPath?.replace(/\/tweets\.json$/, '') || '');
                        return;
                    }
                    // tweets.jsonが末尾についていなければ、TFolderか判定
                    if (!v.endsWith('/tweets.json')) {
                        const folder = this.app.vault.getAbstractFileByPath(v) as TFolder;
                        if (!folder || !(folder instanceof TFolder)) {
                            new Notice('Vault内のフォルダのみ指定できます。');
                            text.setValue(this.plugin.settings.tweetDbCustomPath?.replace(/\/tweets\.json$/, '') || '');
                            return;
                        }
                        v = v.replace(/\/$/, '') + '/tweets.json';
                    }
                    this.plugin.settings.tweetDbCustomPath = v;
                    await this.plugin.saveSettings();
                });
            })
            .addExtraButton(btn => {
                btn.setIcon('search');
                btn.setTooltip('Vault内のフォルダをサジェスト');
                btn.onClick(() => {
                    // フォルダのみをサジェスト
                    const folders = this.app.vault.getAllLoadedFiles()
                        .map(f => f.parent)
                        .filter((f): f is TFolder => !!f && f instanceof TFolder);
                    const uniqueFolders = Array.from(new Set(folders.map(f => f.path))).sort();
                    class FolderSuggestModal extends FuzzySuggestModal<string> {
                        constructor(app: App, private paths: string[], private onChoose: (path: string) => void) {
                            super(app);
                            this.setPlaceholder('Vault内のフォルダを検索...');
                        }
                        getItems(): string[] { return this.paths; }
                        getItemText(item: string): string { return item; }
                        onChooseItem(item: string) { this.onChoose(item); }
                    }
                    new FolderSuggestModal(this.app, uniqueFolders, (chosenPath) => {
                        const fullPath = chosenPath.replace(/\/$/, '') + '/tweets.json';
                        const textComp = customPathSetting.components[0] as TextComponent;
                        if (textComp && textComp.inputEl) textComp.inputEl.value = fullPath;
                        this.plugin.settings.tweetDbCustomPath = fullPath;
                        this.plugin.saveSettings();
                    }).open();
                });
            });
        customPathSettingEl = customPathSetting.settingEl;
        if ((this.plugin.settings.tweetDbLocation || 'vault') !== 'custom' && customPathSettingEl) {
            customPathSettingEl.style.display = 'none';
        }
        // ユーザーアイコンURL
        new Setting(tweetGlobalAcc.body)
            .setName('ユーザーアイコンURL')
            .setDesc('つぶやきウィジェットで使うアバター画像のURLを指定してください（例: https://.../avatar.png）')
            .addText(text => {
                text.setPlaceholder('https://example.com/avatar.png')
                    .setValue(this.plugin.settings.tweetWidgetAvatarUrl || '')
                    .onChange(async (v) => {
                        // 入力途中は何もしない
                    });
                text.inputEl.addEventListener('blur', async () => {
                    const v = text.inputEl.value.trim();
                    this.plugin.settings.tweetWidgetAvatarUrl = v;
                    await this.plugin.saveSettings();
                    // すべてのtweet-widgetインスタンスに反映
                    this.plugin.settings.boards.forEach(board => {
                        board.widgets.filter(w => w.type === 'tweet-widget').forEach(w => {
                            if (!w.settings) w.settings = {};
                            w.settings.avatarUrl = v;
                        });
                    });
                });
            });
        // AIの会話履歴を表示
        new Setting(tweetGlobalAcc.body)
            .setName('AIの会話履歴を表示')
            .setDesc('AIリプライの下に会話履歴を表示する（デフォルト: オフ）')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.showAiHistory ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.showAiHistory = value;
                        await this.plugin.saveSettings();
                    });
            });
        // AIアバター画像URLリスト
        new Setting(tweetGlobalAcc.body)
            .setName('AIアバター画像URLリスト')
            .setDesc('AIごとに使い分けるアバター画像のURLをカンマ区切りで指定（例: https://.../ai1.png, https://.../ai2.png）')
            .addTextArea(text => {
                text.setPlaceholder('https://example.com/ai1.png, https://example.com/ai2.png')
                    .setValue(this.plugin.settings.aiAvatarUrls || '')
                    .onChange(async (v) => {
                        this.plugin.settings.aiAvatarUrls = v;
                        await this.plugin.saveSettings();
                    });
            });

        // --- ボード管理セクション ---
        const boardManagementAcc = createAccordion('ボード管理', false); // デフォルトで閉じる
        this.renderBoardManagementUI(boardManagementAcc.body);
        // --- 選択されたボードの詳細設定をボード管理アコーディオン内に表示 ---
        const boardDetailContainer = boardManagementAcc.body.createDiv({ cls: 'selected-board-settings-section' });
        if (this.selectedBoardId) {
            this.renderSelectedBoardSettingsUI(boardDetailContainer);
        } else {
            const msg = this.plugin.settings.boards.length === 0 ? '利用可能なボードがありません。「ボード管理」から新しいボードを追加してください。' : '設定するボードを「ボード管理」から選択してください。';
            boardDetailContainer.createEl('p', { text: msg });
        }

        // --- ボードグループ管理セクション ---
        const boardGroupAcc = createAccordion('ボードグループ管理', false);
        this.boardGroupBodyEl = boardGroupAcc.body;
        this.renderBoardGroupManagementUI(this.boardGroupBodyEl);
    }

    /**
     * ボード管理セクションのUIを描画
     * @param containerEl 描画先要素
     */
    private renderBoardManagementUI(containerEl: HTMLElement) {
        containerEl.empty();

        new Setting(containerEl)
            .setName('ボード選択')
            .setDesc('設定を編集するウィジェットボードを選択してください。')
            .addDropdown(dropdown => {
                if (this.plugin.settings.boards.length === 0) {
                    dropdown.addOption('', '利用可能なボードがありません'); // ダミーオプション
                    dropdown.setDisabled(true);
                } else {
                    this.plugin.settings.boards.forEach(board => {
                        dropdown.addOption(board.id, board.name);
                    });
                    dropdown.setValue(this.selectedBoardId || this.plugin.settings.boards[0].id);
                }
                // ここで参照を保存
                this.boardDropdownEl = dropdown.selectEl;
                dropdown.onChange(value => {
                    this.selectedBoardId = value;
                    this.plugin.settings.lastOpenedBoardId = value;
                    this.plugin.saveSettings();
                    // ボード詳細設定セクションの内容を更新
                    const selectedBoardSettingsContainer = this.containerEl.querySelector('.selected-board-settings-section');
                    if (selectedBoardSettingsContainer) {
                        this.renderSelectedBoardSettingsUI(selectedBoardSettingsContainer as HTMLElement);
                    }
                    // ボード詳細設定アコーディオンを自動で開かない
                });
            });

        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('新しいボードを追加')
                .setCta()
                .onClick(async () => {
                    const newBoardId = 'board-' + Date.now();
                    const newBoard: BoardConfiguration = {
                        ...JSON.parse(JSON.stringify(DEFAULT_BOARD_CONFIGURATION)),
                        id: newBoardId,
                        name: `新しいボード ${this.plugin.settings.boards.length + 1}`,
                        widgets: []
                    };
                    this.plugin.settings.boards.push(newBoard);
                    this.selectedBoardId = newBoardId;
                    this.plugin.settings.lastOpenedBoardId = newBoardId;
                    await this.plugin.saveSettings();
                    // boardDropdownElを直接操作
                    if (this.boardDropdownEl) {
                        const option = document.createElement('option');
                        option.value = newBoardId;
                        option.textContent = newBoard.name;
                        this.boardDropdownEl.appendChild(option);
                        this.boardDropdownEl.value = newBoardId;
                    }
                    // ボード詳細設定セクションだけ再描画
                    const selectedBoardSettingsContainer = this.containerEl.querySelector('.selected-board-settings-section');
                    if (selectedBoardSettingsContainer) {
                        this.renderSelectedBoardSettingsUI(selectedBoardSettingsContainer as HTMLElement);
                    }
                }));
    }

    /**
     * 選択中ボードの詳細設定UIを描画
     * @param containerEl 描画先要素
     */
    private renderSelectedBoardSettingsUI(containerEl: HTMLElement) {
        containerEl.empty();
        if (!this.selectedBoardId) {
            const msg = this.plugin.settings.boards.length === 0 ? '利用可能なボードがありません。「ボード管理」から新しいボードを追加してください。' : '設定するボードを「ボード管理」から選択してください。';
            containerEl.createEl('p', { text: msg });
            return;
        }
        const board = this.plugin.settings.boards.find(b => b.id === this.selectedBoardId);
        if (!board) {
            containerEl.createEl('p', { text: '選択されたボードが見つかりません。' });
            this.selectedBoardId = null; // 選択を解除
            this.plugin.settings.lastOpenedBoardId = undefined;
            this.plugin.saveSettings();
            // ここで display() を呼ぶと再帰や無限ループのリスクがあるので、
            // ボード選択ドロップダウンの表示更新は display() の再実行に任せる。
            return;
        }

        new Setting(containerEl)
            .setName('ボード名')
            .addText(text => text
                .setValue(board.name)
                .onChange(async (value) => {
                    // 入力途中は何もしない
                })
                .inputEl.addEventListener('blur', async () => {
                    const value = text.inputEl.value;
                    board.name = value;
                    await this.plugin.saveSettings(board.id);
                    // boardDropdownElを直接操作
                    if (this.boardDropdownEl) {
                        for (const option of Array.from(this.boardDropdownEl.options)) {
                            if (option.value === board.id) {
                                option.textContent = value;
                            }
                        }
                    }
                }));
        new Setting(containerEl)
            .setName('デフォルト表示モード')
            .setDesc('このボードを開いたときの初期表示モード。')
            .addDropdown(dropdown => {
                // 左パネル
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_THIRD, '左パネル（33vw）');
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_HALF, '左パネル（50vw）');
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_TWO_THIRD, '左パネル（66vw）');
                // 中央パネル
                dropdown.addOption(WidgetBoardModal.MODES.CENTER_THIRD, '中央パネル（33vw）');
                dropdown.addOption(WidgetBoardModal.MODES.CENTER_HALF, '中央パネル（50vw）');
                // 右パネル
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_THIRD, '右パネル（33vw）');
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_HALF, '右パネル（50vw）');
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_TWO_THIRD, '右パネル（66vw）');
                // カスタム
                dropdown.addOption('custom-width', 'カスタム幅（vw）');
                dropdown.setValue(board.defaultMode)
                    .onChange(async (value) => {
                        if (Object.values(WidgetBoardModal.MODES).includes(value as any) || value === 'custom-width') {
                            board.defaultMode = value;
                            await this.plugin.saveSettings(board.id);
                            // カスタム幅選択時は下の入力欄を表示
                            if (value === 'custom-width' && customWidthSettingEl) {
                                customWidthSettingEl.style.display = '';
                            } else if (customWidthSettingEl) {
                                customWidthSettingEl.style.display = 'none';
                            }
                        }
                    });
            });
        // カスタム幅入力欄
        let customWidthSettingEl: HTMLElement | null = null;
        const customWidthSetting = new Setting(containerEl)
            .setName('カスタム幅（vw）')
            .setDesc('パネルの幅をvw単位で指定します（例: 40）')
            .addText(text => {
                text.setPlaceholder('例: 40')
                    .setValue(board.customWidth ? String(board.customWidth) : '')
                    .onChange(async (v) => {
                        // 入力途中は何もしない
                    });
                text.inputEl.addEventListener('blur', async () => {
                    const v = text.inputEl.value;
                    const n = parseFloat(v);
                    if (!isNaN(n)) {
                        board.customWidth = n;
                        await this.plugin.saveSettings(board.id);
                        if (n <= 0 || n > 100) {
                            new Notice('1〜100の範囲でvwを指定することを推奨します。');
                        }
                    } else {
                        new Notice('数値を入力してください（vw単位）');
                    }
                });
            });
        customWidthSettingEl = customWidthSetting.settingEl;
        // カスタム幅基準位置ドロップダウン
        let customWidthAnchorSettingEl: HTMLElement | null = null;
        const customWidthAnchorSetting = new Setting(containerEl)
            .setName('カスタム幅の基準位置')
            .setDesc('カスタム幅パネルの表示基準（左・中央・右）')
            .addDropdown(dropdown => {
                dropdown.addOption('right', '右（デフォルト）');
                dropdown.addOption('center', '中央');
                dropdown.addOption('left', '左');
                dropdown.setValue(board.customWidthAnchor || 'right')
                    .onChange(async (value) => {
                        board.customWidthAnchor = value as 'left' | 'center' | 'right';
                        await this.plugin.saveSettings(board.id);
                    });
            });
        customWidthAnchorSettingEl = customWidthAnchorSetting.settingEl;
        // 初期表示制御
        if (board.defaultMode !== 'custom-width' && customWidthSettingEl) {
            customWidthSettingEl.style.display = 'none';
        }
        if (board.defaultMode !== 'custom-width' && customWidthAnchorSettingEl) {
            customWidthAnchorSettingEl.style.display = 'none';
        }
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('このボードを削除')
                .setWarning()
                .setDisabled(this.plugin.settings.boards.length <= 1)
                .onClick(async () => {
                    if (!confirm(`ボード「${board.name}」を本当に削除しますか？`)) return;
                    this.plugin.settings.boards = this.plugin.settings.boards.filter(b => b.id !== this.selectedBoardId);
                    const newSelectedBoardId = this.plugin.settings.boards.length > 0 ? this.plugin.settings.boards[0].id : null;
                    this.selectedBoardId = newSelectedBoardId;
                    this.plugin.settings.lastOpenedBoardId = newSelectedBoardId === null ? undefined : newSelectedBoardId;
                    await this.plugin.saveSettings();
                    // boardDropdownElを直接操作
                    if (this.boardDropdownEl) {
                        for (const option of Array.from(this.boardDropdownEl.options)) {
                            if (option.value === board.id) {
                                this.boardDropdownEl.removeChild(option);
                            }
                        }
                        this.boardDropdownEl.value = this.selectedBoardId || '';
                    }
                    // ボード詳細設定セクションだけ再描画
                    const selectedBoardSettingsContainer = this.containerEl.querySelector('.selected-board-settings-section');
                    if (selectedBoardSettingsContainer) {
                        this.renderSelectedBoardSettingsUI(selectedBoardSettingsContainer as HTMLElement);
                    }
                }));

        containerEl.createEl('h4', { text: 'ウィジェット管理' });
        const addWidgetButtonsContainer = containerEl.createDiv({ cls: 'widget-add-buttons' });
        const widgetListEl = containerEl.createDiv({ cls: 'widget-settings-list-for-board' }); // 先に定義

        const createAddButtonToBoard = (buttonText: string, widgetType: string, defaultWidgetSettings: any) => {
            const settingItem = new Setting(addWidgetButtonsContainer);
            settingItem.addButton(button => button
                .setButtonText(buttonText)
                .setCta()
                .onClick(async () => {
                    if (!this.selectedBoardId) return;
                    const currentBoard = this.plugin.settings.boards.find(b => b.id === this.selectedBoardId);
                    if (!currentBoard) return;
                    const newWidget: WidgetConfig = {
                        id: `${widgetType}-widget-${Date.now()}`,
                        type: widgetType,
                        title: '',
                        settings: { ...defaultWidgetSettings }
                    };
                    currentBoard.widgets.push(newWidget);
                    await this.plugin.saveSettings(currentBoard.id);
                    this.renderWidgetListForBoard(widgetListEl, currentBoard); // widgetListEl は既に定義済み
                    const widgetDisplayName = WIDGET_TYPE_DISPLAY_NAMES[widgetType] || widgetType; // 通知用にも表示名を使用
                    new Notice(`「${widgetDisplayName}」ウィジェットがボード「${currentBoard.name}」に追加されました。`);
                }));
            settingItem.settingEl.addClass('widget-add-button-setting-item');
            settingItem.nameEl.remove(); settingItem.descEl.remove();
        };
        createAddButtonToBoard("ポモドーロ追加", "pomodoro", DEFAULT_POMODORO_SETTINGS);
        createAddButtonToBoard("メモ追加", "memo", DEFAULT_MEMO_SETTINGS);
        createAddButtonToBoard("カレンダー追加", "calendar", DEFAULT_CALENDAR_SETTINGS);
        createAddButtonToBoard("最近編集したノート", "recent-notes", DEFAULT_RECENT_NOTES_SETTINGS);
        createAddButtonToBoard("テーマ切り替え", "theme-switcher", {});
        createAddButtonToBoard("タイマー／ストップウォッチ", "timer-stopwatch", { ...DEFAULT_TIMER_STOPWATCH_SETTINGS });
        createAddButtonToBoard("ファイルビューア追加", "file-view-widget", { heightMode: "auto", fixedHeightPx: 200 });
        createAddButtonToBoard("つぶやき追加", "tweet-widget", DEFAULT_TWEET_WIDGET_SETTINGS);

        this.renderWidgetListForBoard(widgetListEl, board);
    }

    private renderWidgetListForBoard(containerEl: HTMLElement, board: BoardConfiguration) {
        containerEl.empty();
        const widgets = board.widgets;
        if (widgets.length === 0) {
            containerEl.createEl('p', { text: 'このボードにはウィジェットがありません。「追加」ボタンで作成できます。' });
            return;
        }

        widgets.forEach((widget, index) => {
            const widgetSettingContainer = containerEl.createDiv({cls: 'widget-setting-container'});

            // ウィジェットタイプに応じた日本語表示名を取得
            const widgetTypeName = WIDGET_TYPE_DISPLAY_NAMES[widget.type] || widget.type;
            // タイトルが未設定の場合は「(名称未設定 <ウィジェット日本語名>)」とする
            const displayName = widget.title || `(名称未設定 ${widgetTypeName})`;

            const titleSetting = new Setting(widgetSettingContainer)
                .setName(displayName)
                .setDesc(`種類: ${widget.type} | ID: ${widget.id.substring(0,8)}...`);

            titleSetting.addText(text => {
                text.setPlaceholder('(ウィジェット名)')
                    .setValue(widget.title)
                    .onChange(async (value) => {
                        // 入力途中は何もしない
                    });
                text.inputEl.addEventListener('blur', async () => {
                    const value = text.inputEl.value;
                    widget.title = value.trim();
                    await this.plugin.saveSettings(board.id);
                    // タイトル変更時も同様のロジックで表示名を更新
                    const updatedDisplayName = widget.title || `(名称未設定 ${widgetTypeName})`;
                    titleSetting.setName(updatedDisplayName);
                    this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, widget.settings);
                });
            });

            titleSetting
                .addExtraButton(cb => cb.setIcon('arrow-up').setTooltip('上に移動').setDisabled(index === 0)
                    .onClick(async () => {
                        if (index > 0) {
                            const item = board.widgets.splice(index, 1)[0];
                            board.widgets.splice(index - 1, 0, item);
                            await this.plugin.saveSettings(board.id);
                            this.renderWidgetListForBoard(containerEl, board);
                        }
                    }))
                .addExtraButton(cb => cb.setIcon('arrow-down').setTooltip('下に移動').setDisabled(index === widgets.length - 1)
                    .onClick(async () => {
                        if (index < board.widgets.length - 1) {
                            const item = board.widgets.splice(index, 1)[0];
                            board.widgets.splice(index + 1, 0, item);
                            await this.plugin.saveSettings(board.id);
                            this.renderWidgetListForBoard(containerEl, board);
                        }
                    }))
                .addButton(button => button.setIcon("trash").setTooltip("このウィジェットを削除").setWarning()
                    .onClick(async () => {
                        // 削除時の通知メッセージも同様のロジックで表示名を生成
                        const oldWidgetTypeName = WIDGET_TYPE_DISPLAY_NAMES[widget.type] || widget.type;
                        const oldTitle = widget.title || `(名称未設定 ${oldWidgetTypeName})`;
                        board.widgets.splice(index, 1);
                        await this.plugin.saveSettings(board.id);
                        this.renderWidgetListForBoard(containerEl, board);
                        new Notice(`ウィジェット「${oldTitle}」をボード「${board.name}」から削除しました。`);
                    }));

            // 詳細設定用のアコーディオンコンテナ (titleSetting の下に配置)
            const settingsEl = widgetSettingContainer.createDiv({cls: 'widget-specific-settings'});

            // --- ウィジェット個別設定のアコーディオン生成関数 ---
            const createWidgetAccordion = (parentEl: HTMLElement, title: string = '詳細設定') => {
                const acc = parentEl.createDiv({ cls: 'wb-accordion' });
                const header = acc.createDiv({ cls: 'wb-accordion-header' });
                const icon = header.createSpan({ cls: 'wb-accordion-icon' });
                icon.setText('▶');
                header.appendText(title);
                const body = acc.createDiv({ cls: 'wb-accordion-body' });
                body.style.display = 'none';

                header.addEventListener('click', (event) => {
                    // ヘッダー自身がクリックされた場合のみ開閉
                    if (event.currentTarget !== event.target) return;
                    const isOpen = acc.classList.toggle('wb-accordion-open');
                    header.classList.toggle('wb-accordion-open');
                    // icon.setText(isOpen ? '▼' : '▶'); // アイコン切り替え
                    body.style.display = isOpen ? '' : 'none';
                });
                return { acc, header, body };
            };


            if (widget.type === 'pomodoro') {
                widget.settings = { ...DEFAULT_POMODORO_SETTINGS, ...(widget.settings || {}) } as PomodoroSettings;
                const currentSettings = widget.settings as PomodoroSettings;
                const { body: pomoDetailBody } = createWidgetAccordion(settingsEl, '詳細設定');

                const createNumInput = (parent: HTMLElement, label: string, desc: string, key: keyof Omit<PomodoroSettings, 'backgroundImageUrl' | 'memoContent'>) => {
                    new Setting(parent).setName(label).setDesc(desc).setClass('pomodoro-setting-item')
                        .addText(text => {
                            text.setPlaceholder(String(DEFAULT_POMODORO_SETTINGS[key]))
                                .setValue(String(currentSettings[key]))
                                .onChange(async (v) => {
                                    // 入力途中は何もしない（バリデーションしない）
                                });
                            text.inputEl.addEventListener('blur', async () => {
                                const v = text.inputEl.value;
                                const n = parseInt(v);
                                if (!isNaN(n) && n > 0) {
                                    (currentSettings as any)[key] = n;
                                    await this.plugin.saveSettings(board.id);
                                    this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                                } else {
                                    new Notice('1以上の半角数値を入力してください。');
                                    text.setValue(String(currentSettings[key]));
                                }
                            });
                        });
                };
                createNumInput(pomoDetailBody, '作業時間 (分)', 'ポモドーロの作業フェーズの時間。', 'workMinutes');
                createNumInput(pomoDetailBody, '短い休憩 (分)', '短い休憩フェーズの時間。', 'shortBreakMinutes');
                createNumInput(pomoDetailBody, '長い休憩 (分)', '長い休憩フェーズの時間。', 'longBreakMinutes');
                createNumInput(pomoDetailBody, 'サイクル数', '長い休憩までの作業ポモドーロ回数。', 'pomodorosUntilLongBreak');

                new Setting(pomoDetailBody).setName('背景画像URL').setDesc('タイマーの背景として表示する画像のURL。').setClass('pomodoro-setting-item')
                    .addText(text => text
                        .setPlaceholder('例: https://example.com/image.jpg')
                        .setValue(currentSettings.backgroundImageUrl || '')
                        .onChange(async (v) => {
                            currentSettings.backgroundImageUrl = v.trim();
                            await this.plugin.saveSettings(board.id);
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                        }));

                // --- 通知音・エクスポート形式はグローバル設定が適用される旨を表示 ---
                new Setting(pomoDetailBody)
                    .setName('通知音・エクスポート形式')
                    .setDesc('このウィジェットの通知音・エクスポート形式は「ポモドーロ（グローバル設定）」が適用されます。')
                    .setDisabled(true);

            } else if (widget.type === 'memo') {
                widget.settings = { ...DEFAULT_MEMO_SETTINGS, ...(widget.settings || {}) } as MemoWidgetSettings;
                const currentSettings = widget.settings as MemoWidgetSettings;
                const { body: memoDetailBody } = createWidgetAccordion(settingsEl, '詳細設定');

                new Setting(memoDetailBody).setName('メモ内容 (Markdown)').setDesc('メモウィジェットに表示する内容。ウィジェット内でも編集できます。').setClass('pomodoro-setting-item')
                    .addTextArea(text => {
                        text.setPlaceholder('ここにメモを記述...')
                            .setValue(currentSettings.memoContent || '')
                            .onChange(async (v) => {
                                // 入力途中は何もしない
                            });
                        text.inputEl.addEventListener('blur', async () => {
                            const v = text.inputEl.value;
                            if(widget.settings) widget.settings.memoContent = v;
                            await this.plugin.saveSettings(board.id);
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, widget.settings);
                        });
                    });

                let fixedHeightSettingEl: HTMLElement | null = null;

                new Setting(memoDetailBody)
                    .setName('メモエリアの高さモード')
                    .setDesc('自動調整（内容にfit）または固定高さを選択')
                    .addDropdown(dropdown => {
                        dropdown.addOption('auto', '自動（内容にfit）');
                        dropdown.addOption('fixed', '固定');
                        dropdown.setValue(currentSettings.memoHeightMode || 'auto')
                            .onChange(async (value) => {
                                currentSettings.memoHeightMode = value as 'auto' | 'fixed';
                                await this.plugin.saveSettings(board.id);
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                                if (fixedHeightSettingEl) {
                                    fixedHeightSettingEl.style.display = (value === 'fixed') ? '' : 'none';
                                }
                            });
                    });

                const heightSetting = new Setting(memoDetailBody)
                    .setName('固定高さ(px)')
                    .setDesc('固定モード時の高さ（px）')
                    .addText(text => {
                        text.setPlaceholder('120')
                            .setValue(String(currentSettings.fixedHeightPx ?? 120))
                            .onChange(async (v) => {
                                // 入力途中は何もしない
                            });
                        text.inputEl.addEventListener('blur', async () => {
                            const v = text.inputEl.value;
                            const n = parseInt(v);
                            if (!isNaN(n) && n > 0) {
                                currentSettings.fixedHeightPx = n;
                                await this.plugin.saveSettings(board.id);
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                            } else {
                                new Notice('1以上の半角数値を入力してください。');
                                text.setValue(String(currentSettings.fixedHeightPx ?? 120));
                            }
                        });
                    });
                fixedHeightSettingEl = heightSetting.settingEl;
                if ((currentSettings.memoHeightMode || 'auto') !== 'fixed' && fixedHeightSettingEl) {
                    fixedHeightSettingEl.style.display = 'none';
                }

            } else if (widget.type === 'file-view-widget') {
                // FileViewWidgetの高さ設定
                const currentSettings = widget.settings || {};
                const { body: fileViewDetailBody } = createWidgetAccordion(settingsEl, '詳細設定');

                let fixedHeightSettingEl: HTMLElement | null = null;

                new Setting(fileViewDetailBody)
                    .setName('表示エリアの高さモード')
                    .setDesc('自動調整（内容にfit）または固定高さを選択')
                    .addDropdown(dropdown => {
                        dropdown.addOption('auto', '自動（内容にfit）');
                        dropdown.addOption('fixed', '固定');
                        dropdown.setValue(currentSettings.heightMode || 'auto')
                            .onChange(async (value) => {
                                currentSettings.heightMode = value;
                                await this.plugin.saveSettings(board.id);
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                                if (fixedHeightSettingEl) {
                                    fixedHeightSettingEl.style.display = (value === 'fixed') ? '' : 'none';
                                }
                            });
                    });

                const heightSetting = new Setting(fileViewDetailBody)
                    .setName('固定高さ(px)')
                    .setDesc('固定モード時の高さ（px）')
                    .addText(text => {
                        text.setPlaceholder('200')
                            .setValue(String(currentSettings.fixedHeightPx ?? 200))
                            .onChange(async (v) => {
                                // 入力途中は何もしない
                            });
                        text.inputEl.addEventListener('blur', async () => {
                            const v = text.inputEl.value;
                            const n = parseInt(v);
                            if (!isNaN(n) && n > 0) {
                                currentSettings.fixedHeightPx = n;
                                await this.plugin.saveSettings(board.id);
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                            } else {
                                new Notice('1以上の半角数値を入力してください。');
                                text.setValue(String(currentSettings.fixedHeightPx ?? 200));
                            }
                        });
                    });
                fixedHeightSettingEl = heightSetting.settingEl;
                if ((currentSettings.heightMode || 'auto') !== 'fixed' && fixedHeightSettingEl) {
                    fixedHeightSettingEl.style.display = 'none';
                }
            } else if (widget.type === 'calendar') {
                widget.settings = { ...DEFAULT_CALENDAR_SETTINGS, ...(widget.settings || {}) } as CalendarWidgetSettings;
                if (Object.keys(widget.settings).length > 0) {
                    const { body: calendarDetailBody } = createWidgetAccordion(settingsEl, '詳細設定');
                     new Setting(calendarDetailBody)
                        .setName('（設定項目なし）')
                        .setDesc('現在、カレンダーウィジェットに個別の設定項目はありません。')
                        .setDisabled(true);
                }

            } else if (widget.type === 'timer-stopwatch') {
                widget.settings = { ...DEFAULT_TIMER_STOPWATCH_SETTINGS, ...(widget.settings || {}) };
                const { body: timerStopwatchDetailBody } = createWidgetAccordion(settingsEl, '詳細設定');

                new Setting(timerStopwatchDetailBody)
                    .setName('通知音（全体設定が適用されます）')
                    .setDesc('このウィジェットの通知音・音量は「タイマー／ストップウォッチ通知音（全体設定）」が使われます。')
                    .setDisabled(true);
            }
        });
    }

    private notifyWidgetInstanceIfBoardOpen(boardId: string, widgetId: string, widgetType: string, newSettings: any) {
        const modal = this.plugin.widgetBoardModals?.get(boardId);
        if (modal && modal.isOpen) {
            const widgetInstance = modal.uiWidgetReferences.find(w => (w as any).config?.id === widgetId);
            if (widgetInstance && typeof widgetInstance.updateExternalSettings === 'function') {
                widgetInstance.updateExternalSettings(newSettings, widgetId);
            }
        }
    }

    /**
     * ボードグループ管理セクションのUIを描画
     * @param containerEl 描画先要素
     */
    private renderBoardGroupManagementUI(containerEl: HTMLElement) {
        containerEl.empty();
        const groups = this.plugin.settings.boardGroups || [];
        // グループ一覧
        groups.forEach((group, idx) => {
            const groupDiv = containerEl.createDiv({ cls: 'board-group-setting' });
            new Setting(groupDiv)
                .setName(group.name)
                .setDesc(`ID: ${group.id}`)
                .addButton(btn => btn.setIcon('pencil').setTooltip('編集').onClick(() => {
                    this.openBoardGroupEditModal(group, idx);
                }))
                .addButton(btn => btn.setIcon('trash').setTooltip('削除').setWarning().onClick(async () => {
                    if (!confirm(`グループ「${group.name}」を削除しますか？`)) return;
                    this.plugin.settings.boardGroups = groups.filter((_, i) => i !== idx);
                    await this.plugin.saveSettings();
                    (this.plugin as any).registerAllBoardCommands?.();
                    this.renderBoardGroupManagementUI(containerEl);
                }));
            groupDiv.createEl('div', { text: `ボード: ${group.boardIds.map(id => {
                const b = this.plugin.settings.boards.find(b => b.id === id);
                return b ? b.name : id;
            }).join(', ')}` });
            groupDiv.createEl('div', { text: `ホットキー: ${group.hotkey || '(未設定)'}` });
        });
        // 追加ボタン
        new Setting(containerEl)
            .addButton(btn => btn.setButtonText('新しいグループを追加').setCta().onClick(() => {
                this.openBoardGroupEditModal();
            }));
    }

    private openBoardGroupEditModal(group?: import('./interfaces').BoardGroup, editIdx?: number) {
        new BoardGroupEditModal(this.app, this.plugin, () => {
            // 保存後に必ず正しいbodyを再描画
            if (this.boardGroupBodyEl) this.renderBoardGroupManagementUI(this.boardGroupBodyEl);
        }, group, editIdx).open();
    }
}

function playTestNotificationSound(plugin: any, soundType: string, volume: number) {
    try {
        if (soundType === 'off') return;
        if ((window as any)._testTimerAudio) {
            (window as any)._testTimerAudio.pause();
            (window as any)._testTimerAudio = null;
        }
        if ((window as any)._testTimerAudioCtx && (window as any)._testTimerAudioCtx.state !== 'closed') {
            (window as any)._testTimerAudioCtx.close();
            (window as any)._testTimerAudioCtx = null;
        }
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        (window as any)._testTimerAudioCtx = ctx;
        if (soundType === 'default_beep') {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(Math.max(0.0001, Math.min(1, volume)), ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.7);
            osc.onended = () => ctx.close();
        } else if (soundType === 'bell') {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'triangle';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(880, ctx.currentTime);
            osc2.frequency.setValueAtTime(1320, ctx.currentTime);
            gain.gain.setValueAtTime(Math.max(0.0001, Math.min(1, volume)), ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
            osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
            osc1.start(ctx.currentTime); osc2.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.8); osc2.stop(ctx.currentTime + 0.8);
            osc2.detune.setValueAtTime(5, ctx.currentTime + 0.2);
            osc1.onended = () => ctx.close();
        } else if (soundType === 'chime') {
            const notes = [523.25, 659.25, 784.0];
            const now = ctx.currentTime;
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.18);
                gain.gain.setValueAtTime(Math.max(0.0001, Math.min(1, volume)), now + i * 0.18);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.22);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(now + i * 0.18);
                osc.stop(now + i * 0.18 + 0.22);
                if (i === notes.length - 1) osc.onended = () => ctx.close();
            });
        }
    } catch (e) { new Notice('音声の再生に失敗しました'); }
}

// --- グループ編集用モーダル ---
class BoardGroupEditModal extends Modal {
    plugin: WidgetBoardPlugin;
    group?: import('./interfaces').BoardGroup;
    editIdx?: number;
    onSave: () => void;
    constructor(app: App, plugin: WidgetBoardPlugin, onSave: () => void, group?: import('./interfaces').BoardGroup, editIdx?: number) {
        super(app);
        this.plugin = plugin;
        this.group = group;
        this.editIdx = editIdx;
        this.onSave = onSave;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.group ? 'グループを編集' : '新しいグループを追加' });
        let name = this.group?.name || '';
        let boardIds = this.group?.boardIds ? [...this.group.boardIds] : [];
        // グループ名
        new Setting(contentEl)
            .setName('グループ名')
            .addText(text => text.setValue(name).onChange(v => { name = v; }));
        // ボード選択
        contentEl.createEl('div', { text: 'グループに含めるボードを選択', cls: 'board-group-boardlist-label', attr: { style: 'margin-top:16px;margin-bottom:8px;font-weight:bold;' } });
        const boardListDiv = contentEl.createDiv({ cls: 'board-group-boardlist', attr: { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;' } });
        const renderBoardButtons = () => {
            boardListDiv.empty();
            this.plugin.settings.boards.forEach(b => {
                const isSelected = boardIds.includes(b.id);
                const btn = boardListDiv.createEl('button', {
                    cls: isSelected ? 'selected is-active' : '',
                });
                btn.classList.add('mod-cta');
                btn.style.minWidth = '64px';
                btn.style.padding = '6px 16px';
                btn.style.borderRadius = '6px';
                btn.style.border = 'none';
                btn.style.cursor = 'pointer';
                btn.style.fontWeight = isSelected ? 'bold' : '';
                btn.style.background = isSelected ? 'var(--interactive-accent)' : 'var(--background-modifier-box)';
                btn.style.color = isSelected ? 'var(--text-on-accent)' : 'var(--text-normal)';
                btn.innerHTML = b.name;
                btn.onclick = () => {
                    if (isSelected) {
                        boardIds = boardIds.filter(x => x !== b.id);
                    } else {
                        boardIds.push(b.id);
                    }
                    renderBoardButtons();
                };
            });
        };
        renderBoardButtons();
        // ホットキー欄は削除し、説明文を追加
        contentEl.createEl('div', { text: '※グループのホットキー設定はObsidianの「設定 → ホットキー」画面で行ってください。', cls: 'board-group-hotkey-desc', attr: { style: 'margin-top:12px;margin-bottom:8px;font-size:0.95em;color:var(--text-faint);' } });
        // 保存・キャンセルボタン横並び
        const btnRow = contentEl.createDiv({ cls: 'modal-button-row', attr: { style: 'display:flex;justify-content:flex-end;gap:12px;margin-top:24px;' } });
        new Setting(btnRow)
            .addButton(btn => btn.setButtonText('保存').setCta().onClick(async () => {
                if (!name.trim()) {
                    new Notice('グループ名を入力してください');
                    return;
                }
                if (boardIds.length === 0) {
                    new Notice('1つ以上のボードを選択してください');
                    return;
                }
                const newGroup = {
                    id: this.group?.id || 'group-' + Date.now(),
                    name: name.trim(),
                    boardIds,
                    hotkey: this.group?.hotkey // 既存値は維持（UIからは編集不可）
                };
                if (this.editIdx !== undefined) {
                    this.plugin.settings.boardGroups![this.editIdx] = newGroup;
                } else {
                    this.plugin.settings.boardGroups = [...(this.plugin.settings.boardGroups || []), newGroup];
                }
                await this.plugin.saveSettings();
                (this.plugin as any).registerAllBoardCommands?.();
                this.onSave();
                this.close();
            }))
            .addButton(btn => btn.setButtonText('キャンセル').onClick(() => this.close()));
    }
}