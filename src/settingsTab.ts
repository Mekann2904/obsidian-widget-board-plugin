// src/settingsTab.ts
import { App, PluginSettingTab, Setting, Notice, DropdownComponent, SliderComponent, TextComponent } from 'obsidian';
import type WidgetBoardPlugin from './main';
import type { BoardConfiguration, WidgetConfig } from './interfaces';
import { DEFAULT_BOARD_CONFIGURATION } from './settingsDefaults';
import { WidgetBoardModal } from './modal';
import { DEFAULT_POMODORO_SETTINGS, PomodoroSettings, PomodoroSoundType } from './widgets/pomodoroWidget';
import { DEFAULT_MEMO_SETTINGS, MemoWidgetSettings } from './widgets/memoWidget';
import { DEFAULT_CALENDAR_SETTINGS, CalendarWidgetSettings } from './widgets/calendarWidget';
import { DEFAULT_RECENT_NOTES_SETTINGS } from './widgets/recentNotesWidget';
import { DEFAULT_TIMER_STOPWATCH_SETTINGS } from './widgets/timerStopwatchWidget';
// import { registeredWidgetImplementations } from './widgetRegistry'; // 未使用なのでコメントアウトまたは削除

// ウィジェットタイプに対応する表示名のマッピング
const WIDGET_TYPE_DISPLAY_NAMES: { [key: string]: string } = {
    'pomodoro': 'ポモドーロタイマー',
    'memo': 'メモ',
    'timer-stopwatch': 'タイマー/ストップウォッチ',
    'calendar': 'カレンダー',
    'recent-notes': '最近編集したノート',
    'theme-switcher': 'テーマ切り替え',
};

export class WidgetBoardSettingTab extends PluginSettingTab {
    plugin: WidgetBoardPlugin;
    private selectedBoardId: string | null = null;

    constructor(app: App, plugin: WidgetBoardPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        if (this.plugin.settings.boards.length > 0) {
            this.selectedBoardId = this.plugin.settings.lastOpenedBoardId || this.plugin.settings.boards[0].id;
        }
    }

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

            header.onclick = () => {
                const isOpen = acc.classList.toggle('wb-accordion-open');
                header.classList.toggle('wb-accordion-open');
                // icon.setText(isOpen ? '▼' : '▶'); // アイコン切り替え
                body.style.display = isOpen ? '' : 'none';
            };
            return { acc, header, body };
        };

        // --- ポモドーロ通知音（全体設定） ---
        const pomoAcc = createAccordion('ポモドーロ通知音（全体設定）', false); // デフォルトで閉じる
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

        // --- タイマー／ストップウォッチ通知音（全体設定） ---
        const timerAcc = createAccordion('タイマー／ストップウォッチ通知音（全体設定）', false); // デフォルトで閉じる
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

        // --- ボード管理セクション ---
        const boardManagementAcc = createAccordion('ボード管理', false); // デフォルトで閉じる
        this.renderBoardManagementUI(boardManagementAcc.body);

        // --- 選択されたボードの設定セクション ---
        const boardDetailAcc = createAccordion('ボード詳細設定', false); // デフォルトで閉じる
        boardDetailAcc.body.addClass('selected-board-settings-section');
        if (this.selectedBoardId) {
            this.renderSelectedBoardSettingsUI(boardDetailAcc.body);
        } else {
            // ボードが一つもない、または選択されていない場合のメッセージ
            const msg = this.plugin.settings.boards.length === 0 ? '利用可能なボードがありません。「ボード管理」から新しいボードを追加してください。' : '設定するボードを「ボード管理」から選択してください。';
            boardDetailAcc.body.createEl('p', { text: msg });
        }
    }

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
                    this.selectedBoardId = newBoardId; // 新しく追加したボードを選択状態にする
                    this.plugin.settings.lastOpenedBoardId = newBoardId;
                    await this.plugin.saveSettings();
                    this.display(); // 設定タブ全体を再描画して変更を反映
                }));
    }

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
                    board.name = value;
                    await this.plugin.saveSettings();
                    this.display(); // ボード名変更はドロップダウンも更新するため再描画
                }));
        new Setting(containerEl)
            .setName('デフォルト表示モード')
            .setDesc('このボードを開いたときの初期表示モード。')
            .addDropdown(dropdown => {
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_TWO_THIRD, '左パネル（66vw）');
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_HALF, '左パネル（50vw）');
                dropdown.addOption(WidgetBoardModal.MODES.CENTER_HALF, '中央パネル（50vw）');
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_HALF, '右パネル（50vw）');
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_THIRD, '右パネル（33vw）');
                dropdown.setValue(board.defaultMode)
                    .onChange(async (value) => {
                        if (Object.values(WidgetBoardModal.MODES).includes(value as any)) {
                            board.defaultMode = value;
                            await this.plugin.saveSettings();
                        }
                    });
            });
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
                    this.display(); // 設定タブ全体を再描画
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
                    await this.plugin.saveSettings();
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

            titleSetting.addText(text => text
                .setPlaceholder('(ウィジェット名)')
                .setValue(widget.title)
                .onChange(async (value) => {
                    widget.title = value.trim();
                    await this.plugin.saveSettings();
                    // タイトル変更時も同様のロジックで表示名を更新
                    const updatedDisplayName = widget.title || `(名称未設定 ${widgetTypeName})`;
                    titleSetting.setName(updatedDisplayName);
                    this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, widget.settings);
                }));

            titleSetting
                .addExtraButton(cb => cb.setIcon('arrow-up').setTooltip('上に移動').setDisabled(index === 0)
                    .onClick(async () => {
                        if (index > 0) {
                            const item = board.widgets.splice(index, 1)[0];
                            board.widgets.splice(index - 1, 0, item);
                            await this.plugin.saveSettings();
                            this.renderWidgetListForBoard(containerEl, board);
                        }
                    }))
                .addExtraButton(cb => cb.setIcon('arrow-down').setTooltip('下に移動').setDisabled(index === widgets.length - 1)
                    .onClick(async () => {
                        if (index < board.widgets.length - 1) {
                            const item = board.widgets.splice(index, 1)[0];
                            board.widgets.splice(index + 1, 0, item);
                            await this.plugin.saveSettings();
                            this.renderWidgetListForBoard(containerEl, board);
                        }
                    }))
                .addButton(button => button.setIcon("trash").setTooltip("このウィジェットを削除").setWarning()
                    .onClick(async () => {
                        // 削除時の通知メッセージも同様のロジックで表示名を生成
                        const oldWidgetTypeName = WIDGET_TYPE_DISPLAY_NAMES[widget.type] || widget.type;
                        const oldTitle = widget.title || `(名称未設定 ${oldWidgetTypeName})`;
                        board.widgets.splice(index, 1);
                        await this.plugin.saveSettings();
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

                header.onclick = () => {
                    const isOpen = acc.classList.toggle('wb-accordion-open');
                    header.classList.toggle('wb-accordion-open');
                    body.style.display = isOpen ? '' : 'none';
                };
                return { acc, header, body };
            };


            if (widget.type === 'pomodoro') {
                widget.settings = { ...DEFAULT_POMODORO_SETTINGS, ...(widget.settings || {}) } as PomodoroSettings;
                const currentSettings = widget.settings as PomodoroSettings;
                const { body: pomoDetailBody } = createWidgetAccordion(settingsEl, '詳細設定');

                const createNumInput = (parent: HTMLElement, label: string, desc: string, key: keyof Omit<PomodoroSettings, 'backgroundImageUrl' | 'memoContent'>) => {
                    new Setting(parent).setName(label).setDesc(desc).setClass('pomodoro-setting-item')
                        .addText(text => text
                            .setPlaceholder(String(DEFAULT_POMODORO_SETTINGS[key]))
                            .setValue(String(currentSettings[key]))
                            .onChange(async (v) => {
                                const n = parseInt(v);
                                if (!isNaN(n) && n > 0) {
                                    (currentSettings as any)[key] = n;
                                    await this.plugin.saveSettings();
                                    this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                                } else {
                                    new Notice('1以上の半角数値を入力してください。');
                                    text.setValue(String(currentSettings[key]));
                                }
                            }));
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
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                        }));

                new Setting(pomoDetailBody)
                    .setName('通知音（全体設定が適用されます）')
                    .setDesc('このウィジェットの通知音・音量は「ポモドーロ通知音（全体設定）」が使われます。')
                    .setDisabled(true);

                new Setting(pomoDetailBody)
                    .setName('エクスポート形式')
                    .setDesc('セッション終了時に自動保存する形式。noneで保存しません。')
                    .addDropdown(dropdown => {
                        dropdown.addOption('none', '保存しない');
                        dropdown.addOption('csv', 'CSV');
                        dropdown.addOption('json', 'JSON');
                        dropdown.addOption('markdown', 'Markdown');
                        dropdown.setValue(currentSettings.exportFormat || 'none')
                            .onChange(async (v) => {
                                currentSettings.exportFormat = v as any;
                                await this.plugin.saveSettings();
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                            });
                    });

            } else if (widget.type === 'memo') {
                widget.settings = { ...DEFAULT_MEMO_SETTINGS, ...(widget.settings || {}) } as MemoWidgetSettings;
                const currentSettings = widget.settings as MemoWidgetSettings;
                const { body: memoDetailBody } = createWidgetAccordion(settingsEl, '詳細設定');

                new Setting(memoDetailBody).setName('メモ内容 (Markdown)').setDesc('メモウィジェットに表示する内容。ウィジェット内でも編集できます。').setClass('pomodoro-setting-item')
                    .addTextArea(text => text
                        .setPlaceholder('ここにメモを記述...')
                        .setValue(currentSettings.memoContent || '')
                        .onChange(async (v) => {
                            if(widget.settings) widget.settings.memoContent = v;
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, widget.settings);
                        }));

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
                                await this.plugin.saveSettings();
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
                                const n = parseInt(v);
                                if (!isNaN(n) && n > 0) {
                                    currentSettings.fixedHeightPx = n;
                                    await this.plugin.saveSettings();
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