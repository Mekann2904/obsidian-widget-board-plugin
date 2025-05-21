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
import { registeredWidgetImplementations } from './widgetRegistry';

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

        // --- ボード管理セクション ---
        const boardManagementSection = containerEl.createDiv({ cls: 'widget-board-management-section' });
        this.renderBoardManagementUI(boardManagementSection);

        // --- 選択されたボードの設定セクション ---
        const selectedBoardSettingsSection = containerEl.createDiv({ cls: 'selected-board-settings-section' });
        this.renderSelectedBoardSettingsUI(selectedBoardSettingsSection);
    }

    private renderBoardManagementUI(containerEl: HTMLElement) {
        containerEl.empty();
        containerEl.createEl('h3', { text: 'ボード管理' });

        new Setting(containerEl)
            .setName('ボード選択')
            .setDesc('設定を編集するウィジェットボードを選択してください。')
            .addDropdown(dropdown => {
                this.plugin.settings.boards.forEach(board => {
                    dropdown.addOption(board.id, board.name);
                });
                dropdown.setValue(this.selectedBoardId || (this.plugin.settings.boards[0]?.id || ''))
                    .onChange(value => {
                        this.selectedBoardId = value;
                        this.plugin.settings.lastOpenedBoardId = value;
                        this.plugin.saveSettings();
                        this.renderSelectedBoardSettingsUI(this.containerEl.querySelector('.selected-board-settings-section')!);
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
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }

    private renderSelectedBoardSettingsUI(containerEl: HTMLElement) {
        containerEl.empty();
        if (!this.selectedBoardId) {
            containerEl.createEl('p', { text: 'ボードを選択してください。' });
            return;
        }
        const board = this.plugin.settings.boards.find(b => b.id === this.selectedBoardId);
        if (!board) {
            containerEl.createEl('p', { text: '選択されたボードが見つかりません。' });
            this.selectedBoardId = null;
            this.renderBoardManagementUI(this.containerEl.querySelector('.widget-board-management-section')!);
            return;
        }
        containerEl.createEl('h3', { text: `ボード「${board.name}」の設定` });
        new Setting(containerEl)
            .setName('ボード名')
            .addText(text => text
                .setValue(board.name)
                .onChange(async (value) => {
                    board.name = value;
                    await this.plugin.saveSettings();
                    this.renderBoardManagementUI(this.containerEl.querySelector('.widget-board-management-section')!);
                    containerEl.querySelector('h3')!.setText(`ボード「${board.name}」の設定`);
                }));
        new Setting(containerEl)
            .setName('デフォルト表示モード')
            .setDesc('このボードを開いたときの初期表示モード。')
            .addDropdown(dropdown => {
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_THIRD, '右パネル（33vw）');
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_HALF, '右パネル（50vw）');
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_TWO_THIRD, '左パネル（66vw）');
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_HALF, '左パネル（50vw）');
                dropdown.addOption(WidgetBoardModal.MODES.CENTER_HALF, '中央パネル（50vw）');
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
                    this.selectedBoardId = this.plugin.settings.boards.length > 0 ? this.plugin.settings.boards[0].id : null;
                    await this.plugin.saveSettings();
                    this.display();
                }));
        containerEl.createEl('h4', { text: 'ウィジェット管理' });
        const addWidgetButtonsContainer = containerEl.createDiv({ cls: 'widget-add-buttons' });
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
                    this.renderWidgetListForBoard(widgetListEl, currentBoard);
                    new Notice(`「${widgetType}」ウィジェットがボード「${currentBoard.name}」に追加されました。`);
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
        const widgetListEl = containerEl.createDiv({ cls: 'widget-settings-list-for-board' });
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
            const widgetSettingContainer = containerEl.createDiv({cls: 'widget-setting-container setting-item'});
            const displayName = widget.title || `(名称未設定 ${widget.type})`;
            const titleSetting = new Setting(widgetSettingContainer)
                .setName(displayName)
                .setDesc(`種類: ${widget.type} | ID: ${widget.id.substring(0,8)}...`);
            titleSetting.addText(text => text
                .setPlaceholder('(ウィジェット名)')
                .setValue(widget.title)
                .onChange(async (value) => {
                    widget.title = value.trim();
                    await this.plugin.saveSettings();
                    titleSetting.setName(widget.title || `(名称未設定 ${widget.type})`);
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
                        const oldTitle = widget.title || `(名称未設定 ${widget.type})`;
                        board.widgets.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.renderWidgetListForBoard(containerEl, board);
                        new Notice(`ウィジェット「${oldTitle}」をボード「${board.name}」から削除しました。`);
                    }));
            const settingsEl = widgetSettingContainer.createDiv({cls: 'widget-specific-settings'});
            if (widget.type === 'pomodoro') {
                widget.settings = { ...DEFAULT_POMODORO_SETTINGS, ...(widget.settings || {}) } as PomodoroSettings;
                const currentSettings = widget.settings as PomodoroSettings;
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
                createNumInput(settingsEl, '作業時間 (分)', 'ポモドーロの作業フェーズの時間。', 'workMinutes');
                createNumInput(settingsEl, '短い休憩 (分)', '短い休憩フェーズの時間。', 'shortBreakMinutes');
                createNumInput(settingsEl, '長い休憩 (分)', '長い休憩フェーズの時間。', 'longBreakMinutes');
                createNumInput(settingsEl, 'サイクル数', '長い休憩までの作業ポモドーロ回数。', 'pomodorosUntilLongBreak');
                new Setting(settingsEl).setName('背景画像URL').setDesc('タイマーの背景として表示する画像のURL。').setClass('pomodoro-setting-item')
                    .addText(text => text
                        .setPlaceholder('例: https://example.com/image.jpg')
                        .setValue(currentSettings.backgroundImageUrl || '')
                        .onChange(async (v) => {
                            currentSettings.backgroundImageUrl = v.trim();
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                        }));
                new Setting(settingsEl).setName('専用メモ (Markdown)').setDesc('このポモドーロタイマー専用のメモ。ウィジェット内でも編集できます。').setClass('pomodoro-setting-item')
                    .addTextArea(text => text
                        .setPlaceholder('今日のタスク、集中したいことなど...')
                        .setValue(currentSettings.memoContent || '')
                        .onChange(async (v) => {
                            currentSettings.memoContent = v;
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                        }));
                // 通知音設定などもここに追加（省略）
                // 通知音の種類
                new Setting(settingsEl)
                    .setName('通知音')
                    .setDesc('タイマー終了時に鳴らす通知音。')
                    .addDropdown(dropdown => {
                        dropdown.addOption('off', 'なし');
                        dropdown.addOption('default_beep', 'ビープ音');
                        dropdown.addOption('bell', 'ベル');
                        dropdown.addOption('chime', 'チャイム');
                        dropdown.setValue(currentSettings.notificationSound || 'default_beep')
                            .onChange(async (value) => {
                                currentSettings.notificationSound = value as PomodoroSoundType;
                                await this.plugin.saveSettings();
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                            });
                    })
                    .addExtraButton(btn => {
                        btn.setIcon('play');
                        btn.setTooltip('音を聞く');
                        btn.onClick(() => {
                            playTestNotificationSound(this.plugin, currentSettings.notificationSound || 'default_beep', currentSettings.notificationVolume ?? 0.2);
                        });
                    });
                // 通知音量
                new Setting(settingsEl)
                    .setName('通知音量')
                    .setDesc('通知音の音量（0.0〜1.0）')
                    .addSlider(slider => {
                        slider.setLimits(0, 1, 0.01)
                            .setValue(currentSettings.notificationVolume ?? 0.2);
                        // 値表示用span
                        const valueLabel = document.createElement('span');
                        valueLabel.style.marginLeft = '12px';
                        valueLabel.style.fontWeight = 'bold';
                        valueLabel.textContent = String((currentSettings.notificationVolume ?? 0.2).toFixed(2));
                        slider.sliderEl.parentElement?.appendChild(valueLabel);
                        slider.onChange(async (value) => {
                            currentSettings.notificationVolume = value;
                            valueLabel.textContent = String(value.toFixed(2));
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                        });
                    });
            } else if (widget.type === 'memo') {
                widget.settings = { ...DEFAULT_MEMO_SETTINGS, ...(widget.settings || {}) } as MemoWidgetSettings;
                const currentSettings = widget.settings as MemoWidgetSettings;
                new Setting(settingsEl).setName('メモ内容 (Markdown)').setDesc('メモウィジェットに表示する内容。ウィジェット内でも編集できます。').setClass('pomodoro-setting-item')
                    .addTextArea(text => text
                        .setPlaceholder('ここにメモを記述...')
                        .setValue(currentSettings.memoContent || '')
                        .onChange(async (v) => {
                            if(widget.settings) widget.settings.memoContent = v;
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, widget.settings);
                        }));
                // メモエリア高さモード
                new Setting(settingsEl)
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
                                // 固定モード選択時は下の高さ欄を有効化
                                if (fixedHeightSetting) {
                                    fixedHeightSetting.settingEl.style.display = (value === 'fixed') ? '' : 'none';
                                }
                            });
                    });
                // 固定高さ(px)入力欄
                let fixedHeightSetting: Setting | null = null;
                fixedHeightSetting = new Setting(settingsEl)
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
                // 初期表示時に自動モードなら非表示
                if ((currentSettings.memoHeightMode || 'auto') !== 'fixed' && fixedHeightSetting) {
                    fixedHeightSetting.settingEl.style.display = 'none';
                }
            } else if (widget.type === 'calendar') {
                widget.settings = { ...DEFAULT_CALENDAR_SETTINGS, ...(widget.settings || {}) } as CalendarWidgetSettings;
            } else if (widget.type === 'timer-stopwatch') {
                widget.settings = { ...DEFAULT_TIMER_STOPWATCH_SETTINGS, ...(widget.settings || {}) };
                const currentSettings = widget.settings;
                // 通知音の種類
                new Setting(settingsEl)
                    .setName('通知音')
                    .setDesc('タイマー終了時に鳴らす通知音。')
                    .addDropdown(dropdown => {
                        dropdown.addOption('off', 'なし');
                        dropdown.addOption('default_beep', 'ビープ音');
                        dropdown.addOption('bell', 'ベル');
                        dropdown.addOption('chime', 'チャイム');
                        dropdown.setValue(currentSettings.notificationSound || 'default_beep')
                            .onChange(async (value) => {
                                currentSettings.notificationSound = value;
                                await this.plugin.saveSettings();
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                            });
                    })
                    .addExtraButton(btn => {
                        btn.setIcon('play');
                        btn.setTooltip('音を聞く');
                        btn.onClick(() => {
                            playTestNotificationSound(this.plugin, currentSettings.notificationSound || 'default_beep', currentSettings.notificationVolume ?? 0.5);
                        });
                    });
                // 通知音量
                new Setting(settingsEl)
                    .setName('通知音量')
                    .setDesc('通知音の音量（0.0〜1.0）')
                    .addSlider(slider => {
                        slider.setLimits(0, 1, 0.01)
                            .setValue(currentSettings.notificationVolume ?? 0.5);
                        // 値表示用span
                        const valueLabel = document.createElement('span');
                        valueLabel.style.marginLeft = '12px';
                        valueLabel.style.fontWeight = 'bold';
                        valueLabel.textContent = String((currentSettings.notificationVolume ?? 0.5).toFixed(2));
                        slider.sliderEl.parentElement?.appendChild(valueLabel);
                        slider.onChange(async (value) => {
                            currentSettings.notificationVolume = value;
                            valueLabel.textContent = String(value.toFixed(2));
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings);
                        });
                    });
            }
        });
    }

    private notifyWidgetInstanceIfBoardOpen(boardId: string, widgetId: string, widgetType: string, newSettings: any) {
        const modal = this.plugin.widgetBoardModals?.get(boardId);
        if (modal && modal.isOpen) {
            // modal内のuiWidgetReferencesから該当widgetIdのインスタンスを探す
            const widgetInstance = modal.uiWidgetReferences.find(w => (w as any).config?.id === widgetId);
            if (widgetInstance && typeof widgetInstance.updateExternalSettings === 'function') {
                widgetInstance.updateExternalSettings(newSettings, widgetId);
            }
        }
    }
}

// --- 共通: テスト再生関数 ---
function playTestNotificationSound(plugin: any, soundType: string, volume: number) {
    try {
        if (soundType === 'off') return;
        // 既存の音声を停止
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
            // シンプルなビープ
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
            // ベル音: 2つの三角波を重ねる
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'triangle';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
            osc2.frequency.setValueAtTime(1320, ctx.currentTime); // E6
            gain.gain.setValueAtTime(Math.max(0.0001, Math.min(1, volume)), ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
            osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
            osc1.start(ctx.currentTime); osc2.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.8); osc2.stop(ctx.currentTime + 0.8);
            osc2.detune.setValueAtTime(5, ctx.currentTime + 0.2); // 少し揺らす
            osc1.onended = () => ctx.close();
        } else if (soundType === 'chime') {
            // チャイム音: 3音アルペジオ
            const notes = [523.25, 659.25, 784.0]; // C5, E5, G5
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