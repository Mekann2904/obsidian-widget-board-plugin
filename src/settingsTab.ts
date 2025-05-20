// src/settingsTab.ts
import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type WidgetBoardPlugin from './main';
import { WidgetBoardModal } from './modal'; // MODES を使うためにインポート
import { DEFAULT_POMODORO_SETTINGS, PomodoroSettings } from './widgets/pomodoroWidget';
import { DEFAULT_MEMO_SETTINGS, MemoWidgetSettings } from './widgets/memoWidget';
import { DEFAULT_CALENDAR_SETTINGS, CalendarWidgetSettings } from './widgets/calendarWidget';
import type { WidgetConfig } from './interfaces';
import { registeredWidgetImplementations } from './widgetRegistry';


export class WidgetBoardSettingTab extends PluginSettingTab {
    plugin: WidgetBoardPlugin;

    constructor(app: App, plugin: WidgetBoardPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'ウィジェットボード設定' });

        // --- デフォルト表示モード設定 ---
        new Setting(containerEl)
            .setName('デフォルト表示モード')
            .setDesc('ウィジェットボードを開いたときの初期表示モード。')
            .addDropdown(dropdown => {
                // WidgetBoardModal.MODES を使用
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_THIRD, '右1/3表示');
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_HALF, '右1/2表示');
                dropdown.setValue(this.plugin.settings.defaultMode)
                    .onChange(async (value) => {
                        // value が WidgetBoardModal.MODES のいずれかの値であることを確認
                        if (Object.values(WidgetBoardModal.MODES).includes(value as any)) {
                            this.plugin.settings.defaultMode = value;
                            await this.plugin.saveSettings();
                        } else {
                            new Notice(`無効なモード: ${value}`);
                            dropdown.setValue(this.plugin.settings.defaultMode); // 元の値に戻す
                        }
                    });
            });
        
        containerEl.createEl('h3', { text: 'ウィジェット管理' });

        const addWidgetButtonsContainer = containerEl.createDiv({ cls: 'widget-add-buttons' });

        // --- ウィジェット追加ボタン生成関数 ---
        const createAddButton = (
            buttonText: string,
            widgetType: string,
            defaultSettings: any // PomodoroSettings | MemoWidgetSettings etc.
        ) => {
            const settingItem = new Setting(addWidgetButtonsContainer);
            settingItem.addButton(button => button
                .setButtonText(buttonText)
                .setCta() // Primary button style
                .onClick(async () => {
                    const newWidget: WidgetConfig = {
                        id: `${widgetType}-widget-${Date.now()}`, // ユニークIDを生成
                        type: widgetType,
                        title: '', // 初期タイトルは空
                        settings: { ...defaultSettings } // 各ウィジェットのデフォルト設定をコピー
                    };
                    this.plugin.settings.widgets.push(newWidget);
                    await this.plugin.saveSettings();
                    this.renderWidgetList(widgetListEl); // ウィジェットリストを再描画
                    new Notice(`「${widgetType}」ウィジェットが追加されました。`);
                }));
            // Remove name/desc for button-only setting item for cleaner look
            settingItem.settingEl.addClass('widget-add-button-setting-item');
            settingItem.nameEl.remove();
            settingItem.descEl.remove();
        };

        // --- 各ウィジェットの追加ボタン ---
        createAddButton("ポモドーロ追加", "pomodoro", DEFAULT_POMODORO_SETTINGS);
        createAddButton("メモ追加", "memo", DEFAULT_MEMO_SETTINGS);
        createAddButton("カレンダー追加", "calendar", DEFAULT_CALENDAR_SETTINGS);
        // 新しいウィジェットを追加する場合、ここに createAddButton(...) を追加

        const widgetListEl = containerEl.createDiv({ cls: 'widget-settings-list' });
        this.renderWidgetList(widgetListEl); // 初期表示
    }

    renderWidgetList(containerEl: HTMLElement) {
        containerEl.empty();
        const widgets = this.plugin.settings.widgets;

        if (widgets.length === 0) {
            containerEl.createEl('p', { text: '登録されているウィジェットはありません。「追加」ボタンで新しいウィジェットを作成できます。' });
            return;
        }

        widgets.forEach((widget, index) => {
            const widgetSettingContainer = containerEl.createDiv({cls: 'widget-setting-container setting-item'});
            
            const displayName = widget.title || `(名称未設定 ${widget.type})`;
            const titleSetting = new Setting(widgetSettingContainer)
                .setName(displayName)
                .setDesc(`種類: ${widget.type} | ID: ${widget.id.substring(0,8)}...`);
            
            // タイトル編集用テキストフィールド
            titleSetting.addText(text => text
                .setPlaceholder('(ウィジェット名)')
                .setValue(widget.title)
                .onChange(async (value) => {
                    widget.title = value.trim();
                    await this.plugin.saveSettings();
                    // 表示名を更新
                    titleSetting.setName(widget.title || `(名称未設定 ${widget.type})`);
                    // ウィジェットインスタンスに変更を通知（モーダルが開いている場合）
                    this.notifyWidgetInstance(widget.id, widget.type, widget.settings); 
                }));

            // --- コントロールボタン (上下移動、削除) ---
            titleSetting
                .addExtraButton(cb => { // 上へ移動
                    cb.setIcon('arrow-up')
                        .setTooltip('上に移動')
                        .setDisabled(index === 0)
                        .onClick(async () => {
                            if (index > 0) {
                                const item = this.plugin.settings.widgets.splice(index, 1)[0];
                                this.plugin.settings.widgets.splice(index - 1, 0, item);
                                await this.plugin.saveSettings();
                                this.renderWidgetList(containerEl); // リスト再描画
                            }
                        });
                })
                .addExtraButton(cb => { // 下へ移動
                    cb.setIcon('arrow-down')
                        .setTooltip('下に移動')
                        .setDisabled(index === widgets.length - 1)
                        .onClick(async () => {
                            if (index < this.plugin.settings.widgets.length - 1) {
                                const item = this.plugin.settings.widgets.splice(index, 1)[0];
                                this.plugin.settings.widgets.splice(index + 1, 0, item);
                                await this.plugin.saveSettings();
                                this.renderWidgetList(containerEl); // リスト再描画
                            }
                        });
                })
                .addButton(button => button // 削除
                    .setIcon("trash")
                    .setTooltip("このウィジェットを削除")
                    .setWarning()
                    .onClick(async () => {
                        const oldTitle = widget.title || `(名称未設定 ${widget.type})`;
                        const widgetIdToDelete = widget.id;
                        const widgetTypeToDelete = widget.type;
                        this.plugin.settings.widgets.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.renderWidgetList(containerEl);
                        new Notice(`ウィジェット「${oldTitle}」を削除しました。`);
                    }));
            
            // --- 各ウィジェット固有の設定項目 ---
            const settingsEl = widgetSettingContainer.createDiv({cls: 'widget-specific-settings'});
            if (widget.type === 'pomodoro') {
                // widget.settings が PomodoroSettings 型であることを明示的に扱う
                widget.settings = { ...DEFAULT_POMODORO_SETTINGS, ...(widget.settings || {}) } as PomodoroSettings;
                const currentSettings = widget.settings as PomodoroSettings; // 型キャスト

                const createNumInput = (
                    parent: HTMLElement,
                    label: string,
                    desc: string,
                    key: keyof Omit<PomodoroSettings, 'backgroundImageUrl' | 'memoContent'> // 数値型キーのみ
                ) => {
                    new Setting(parent).setName(label).setDesc(desc).setClass('pomodoro-setting-item')
                        .addText(text => text
                            .setPlaceholder(String(DEFAULT_POMODORO_SETTINGS[key]))
                            .setValue(String(currentSettings[key]))
                            .onChange(async (v) => {
                                const n = parseInt(v);
                                if (!isNaN(n) && n > 0) {
                                    (currentSettings as any)[key] = n;
                                    await this.plugin.saveSettings();
                                    this.notifyWidgetInstance(widget.id, widget.type, currentSettings);
                                } else {
                                    new Notice('1以上の半角数値を入力してください。');
                                    text.setValue(String(currentSettings[key])); // 元の値に戻す
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
                            this.notifyWidgetInstance(widget.id, widget.type, currentSettings);
                        }));
                new Setting(settingsEl).setName('専用メモ (Markdown)').setDesc('このポモドーロタイマー専用のメモ。ウィジェット内でも編集できます。').setClass('pomodoro-setting-item')
                    .addTextArea(text => text
                        .setPlaceholder('今日のタスク、集中したいことなど...')
                        .setValue(currentSettings.memoContent || '')
                        .onChange(async (v) => {
                            currentSettings.memoContent = v;
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstance(widget.id, widget.type, currentSettings);
                        }));

            } else if (widget.type === 'memo') {
                widget.settings = { ...DEFAULT_MEMO_SETTINGS, ...(widget.settings || {}) } as MemoWidgetSettings;
                const currentSettings = widget.settings as MemoWidgetSettings;
                 new Setting(settingsEl).setName('メモ内容 (Markdown)').setDesc('メモウィジェットに表示する内容。ウィジェット内でも編集できます。').setClass('pomodoro-setting-item') // pomodoro-setting-itemは汎用クラス名として流用可
                    .addTextArea(text => text
                        .setPlaceholder('ここにメモを記述...')
                        .setValue(currentSettings.memoContent || '')
                        .onChange(async (v) => {
                            if(widget.settings) widget.settings.memoContent = v;
                            await this.plugin.saveSettings();
                            this.notifyWidgetInstance(widget.id, widget.type, widget.settings);
                        }));

            } else if (widget.type === 'calendar') {
                widget.settings = { ...DEFAULT_CALENDAR_SETTINGS, ...(widget.settings || {}) } as CalendarWidgetSettings;
                // カレンダーには現在、ユーザーが設定する項目なし
                // settingsEl.createEl('p', { text: 'このウィジェットには追加設定はありません。' });
            
            }
            // 新しいウィジェットタイプの設定UIはここに追加
        });
    }

    private notifyWidgetInstance(widgetId: string, widgetType: string, newSettings: any) {
        // モーダルが開いていて、該当ウィジェットインスタンスが存在する場合に更新を通知
        if (this.plugin.widgetBoardModal && this.plugin.widgetBoardModal.isOpen) {
            // WidgetBoardModal内のuiWidgetReferencesは、create()を呼び出したWidgetImplementationのインスタンスそのもの
            // しかし、settingsTabから直接それらのインスタンスを操作するより、
            // registeredWidgetImplementations のグローバルインスタンスの updateExternalSettings を呼ぶ方が一貫性がある
            const widgetImplementation = registeredWidgetImplementations.get(widgetType);
            if (widgetImplementation && widgetImplementation.updateExternalSettings) {
                // updateExternalSettingsメソッドにウィジェットIDも渡して、
                // 該当するIDのウィジェットのみが更新されるようにする
                widgetImplementation.updateExternalSettings(newSettings, widgetId);
            }
        }
    }
}