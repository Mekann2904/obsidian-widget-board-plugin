// src/settingsTab.ts
import { App, PluginSettingTab, Setting, Notice, TFolder, FuzzySuggestModal, normalizePath } from 'obsidian';
import type WidgetBoardPlugin from './main';
import type {
    PomodoroSoundType,
    PomodoroExportFormat,
} from './widgets/pomodoro';
import { obfuscate, deobfuscate } from './utils';
import { t, LANGUAGE_NAMES } from './i18n/index';
import type { Language } from './i18n/index';
import { createAccordion } from './utils/uiHelpers';
import { renderBoardManagementSection, renderBoardGroupSection, notifyWidgetInstanceIfBoardOpen as externalNotify } from './settings/boardGroupSettings';
import { renderTweetWidgetSettings } from './settings/tweetSettings';

/**
 * プラグインの「ウィジェットボード設定」タブを管理するクラス
 * - 各種設定UIの生成・保存・ボード/グループ管理などを担当
 */
export class WidgetBoardSettingTab extends PluginSettingTab {
    plugin: WidgetBoardPlugin;
    selectedBoardId: string | null = null;
    boardDropdownEl: HTMLSelectElement | null = null;
    boardGroupBodyEl: HTMLElement | null = null;

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
        const lang: Language = this.plugin.settings.language || 'ja';

        
        // --- ベースフォルダ入力欄 ---
        const baseFolderSetting = new Setting(containerEl)
            .setName(t(lang, 'baseFolderGlobal'))
            .setDesc(t(lang, 'baseFolderGlobalDesc'));
        baseFolderSetting.addText(text => {
            text.setPlaceholder(t(lang, 'myfolderPlaceholder'))
                .setValue(this.plugin.settings.baseFolder || '')
                .onChange(async () => {
                    // 入力途中は何もしない
                });
            text.inputEl.addEventListener('blur', async () => {
                let v = normalizePath(text.inputEl.value.trim());
                if (v.startsWith('/') || v.match(/^([A-Za-z]:\\|\\|~)/)) {
                    new Notice(t(lang, 'vaultRelativePathOnly'));
                    text.setValue(this.plugin.settings.baseFolder || '');
                    return;
                }
                // フォルダ存在チェック
                const folder = this.app.vault.getAbstractFileByPath(v);
                if (!folder || folder.constructor.name !== 'TFolder') {
                    new Notice(t(lang, 'vaultRelativePathOnly'));
                    text.setValue(this.plugin.settings.baseFolder || '');
                    return;
                }
                this.plugin.settings.baseFolder = v;
                await this.plugin.saveSettings();
            });
            // サジェストボタン用クロージャ
            baseFolderSetting.addExtraButton(btn => {
                btn.setIcon('search');
                btn.setTooltip('Vault内のフォルダをサジェスト');
                btn.onClick(() => {
                    const folders = this.app.vault.getAllLoadedFiles()
                        .filter((f): f is TFolder => f instanceof TFolder);
                    class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
                        constructor(app: App, private folders: TFolder[], private onChoose: (folder: TFolder) => void) {
                            super(app);
                            this.setPlaceholder('Vault内のフォルダを検索...');
                        }
                        getItems(): TFolder[] { return this.folders; }
                        getItemText(item: TFolder): string { return item.path; }
                        onChooseItem(item: TFolder) { this.onChoose(item); }
                    }
                    new FolderSuggestModal(this.app, folders, (folder) => {
                        const normalized = normalizePath(folder.path);
                        text.setValue(normalized);
                        this.plugin.settings.baseFolder = normalized;
                        this.plugin.saveSettings();
                    }).open();
                });
            });
        });

        // 言語設定
        new Setting(containerEl)
            .setName(t(lang, 'languageSetting'))
            .addDropdown(drop => {
                Object.entries(LANGUAGE_NAMES).forEach(([value, label]) => {
                    drop.addOption(value, label);
                });
                drop.setValue(this.plugin.settings.language || 'ja')
                    .onChange(async (value) => {
                        this.plugin.settings.language = value as Language;
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

        new Setting(containerEl)
            .setName(t(lang, 'debugLog'))
            .setDesc(t(lang, 'debugLogDesc'))
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.debugLogging ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.debugLogging = value;
                        await this.plugin.saveSettings();
                    });
            });

        // --- ポモドーロ（グローバル設定） ---
        this.renderPomodoroSettings(containerEl, lang);
        // --- タイマー／ストップウォッチ通知音（全体設定） ---
        this.renderTimerSettings(containerEl, lang);
        // --- LLMグローバル設定 ---
        this.renderLLMSettings(containerEl, lang);
        // --- つぶやき（グローバル設定） ---
        renderTweetWidgetSettings(this, containerEl);
        // --- カレンダー（グローバル設定） ---
        this.renderCalendarSettings(containerEl, lang);
        renderBoardManagementSection(this, containerEl, lang);
        renderBoardGroupSection(this, containerEl, lang);
    }

    private renderPomodoroSettings(containerEl: HTMLElement, lang: Language) {
        const pomoAcc = createAccordion(containerEl, t(lang, 'pomoGlobalSetting'), false); // デフォルトで閉じる
        new Setting(pomoAcc.body)
            .setName(t(lang, 'notificationSound'))
            .setDesc(t(lang, 'pomodoroNotificationSoundDesc'))
            .addDropdown(dropdown => {
                dropdown.addOption('off', t(lang, 'off'));
                dropdown.addOption('default_beep', t(lang, 'beep'));
                dropdown.addOption('bell', t(lang, 'bell'));
                dropdown.addOption('chime', t(lang, 'chime'));
                dropdown.setValue(this.plugin.settings.pomodoroNotificationSound || 'default_beep')
                    .onChange(async (value) => {
                        this.plugin.settings.pomodoroNotificationSound = value as PomodoroSoundType;
                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton(btn => {
                btn.setIcon('play');
                btn.setTooltip(t(lang, 'playSound'));
                btn.onClick(() => {
                    playTestNotificationSound(
                        this.plugin,
                        this.plugin.settings.pomodoroNotificationSound || 'default_beep',
                        this.plugin.settings.pomodoroNotificationVolume ?? 0.2
                    );
                });
            });
        new Setting(pomoAcc.body)
            .setName(t(lang, 'notificationVolume'))
            .setDesc(t(lang, 'notificationVolumeDesc'))
            .addSlider(slider => {
                slider.setLimits(0, 1, 0.01)
                    .setValue(this.plugin.settings.pomodoroNotificationVolume ?? 0.2);
                const valueLabel = document.createElement('span');
                valueLabel.classList.add('value-label');
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
            .setName(t(lang, 'openBoardOnPomodoroEnd'))
            .setDesc(t(lang, 'openBoardOnPomodoroEndDesc'))
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.openBoardOnPomodoroEnd ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.openBoardOnPomodoroEnd = value;
                        await this.plugin.saveSettings();
                    });
            });
        // --- ポモドーロ終了時に自動で次のセッションを開始 ---
        new Setting(pomoAcc.body)
            .setName(t(lang, 'autoStartNextPomodoroSession'))
            .setDesc(t(lang, 'autoStartNextPomodoroSessionDesc'))
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.autoStartNextPomodoroSession ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.autoStartNextPomodoroSession = value;
                        await this.plugin.saveSettings();
                    });
            });
        // --- エクスポート形式（グローバル設定） ---
        new Setting(pomoAcc.body)
            .setName(t(lang, 'exportFormat'))
            .setDesc(t(lang, 'exportFormatDesc'))
            .addDropdown(dropdown => {
                dropdown.addOption('none', t(lang, 'notSave'));
                dropdown.addOption('csv', 'CSV');
                dropdown.addOption('json', 'JSON');
                dropdown.addOption('markdown', 'Markdown');
                dropdown.setValue(this.plugin.settings.pomodoroExportFormat || 'none')
                    .onChange(async (value: PomodoroExportFormat) => {
                        this.plugin.settings.pomodoroExportFormat = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private renderTimerSettings(containerEl: HTMLElement, lang: Language) {
        const timerAcc = createAccordion(containerEl, t(lang, 'timerGlobalSetting'), false); // デフォルトで閉じる
        new Setting(timerAcc.body)
            .setName(t(lang, 'notificationSound'))
            .setDesc(t(lang, 'timerNotificationSoundDesc'))
            .addDropdown(dropdown => {
                dropdown.addOption('off', t(lang, 'off'));
                dropdown.addOption('default_beep', t(lang, 'beep'));
                dropdown.addOption('bell', t(lang, 'bell'));
                dropdown.addOption('chime', t(lang, 'chime'));
                dropdown.setValue(this.plugin.settings.timerStopwatchNotificationSound || 'default_beep')
                    .onChange(async (value) => {
                        this.plugin.settings.timerStopwatchNotificationSound = value as import("./widgets/timer-stopwatch").TimerSoundType;
                        await this.plugin.saveSettings();
                    });
            })
            .addExtraButton(btn => {
                btn.setIcon('play');
                btn.setTooltip(t(lang, 'playSound'));
                btn.onClick(() => {
                    playTestNotificationSound(
                        this.plugin,
                        this.plugin.settings.timerStopwatchNotificationSound || 'default_beep',
                        this.plugin.settings.timerStopwatchNotificationVolume ?? 0.5
                    );
                });
            });
        new Setting(timerAcc.body)
            .setName(t(lang, 'notificationVolume'))
            .setDesc(t(lang, 'notificationVolumeDesc'))
            .addSlider(slider => {
                slider.setLimits(0, 1, 0.01)
                    .setValue(this.plugin.settings.timerStopwatchNotificationVolume ?? 0.5);
                const valueLabel = document.createElement('span');
                valueLabel.classList.add('value-label');
                valueLabel.textContent = String((this.plugin.settings.timerStopwatchNotificationVolume ?? 0.5).toFixed(2));
                slider.sliderEl.parentElement?.appendChild(valueLabel);
                slider.onChange(async (value) => {
                    this.plugin.settings.timerStopwatchNotificationVolume = value;
                    valueLabel.textContent = String(value.toFixed(2));
                    await this.plugin.saveSettings();
                });
            });
    }

    private renderLLMSettings(containerEl: HTMLElement, lang: Language) {
        const llmAcc = createAccordion(containerEl, t(lang, 'llmGlobalSetting'), false);
        new Setting(llmAcc.body).setName('Gemini').setHeading();
        // Gemini APIキー
        new Setting(llmAcc.body)
            .setName(t(lang, 'geminiApiKey'))
            .setDesc(t(lang, 'geminiApiKeyDesc'))
            .addText(text => {
                text.inputEl.type = 'password'; // マスキング
                text.setPlaceholder('sk-...')
                    .setValue(deobfuscate(this.plugin.settings.llm?.gemini?.apiKey || ''))
                    .onChange(async () => { /* 入力途中は何もしない */ });
                // 表示/非表示トグルボタン
                const toggleBtn = document.createElement('button');
                toggleBtn.type = 'button';
                toggleBtn.textContent = t(lang, 'show');
                toggleBtn.classList.add('toggle-button');
                toggleBtn.onclick = () => {
                    if (text.inputEl.type === 'password') {
                        text.inputEl.type = 'text';
                        toggleBtn.textContent = t(lang, 'hide');
                    } else {
                        text.inputEl.type = 'password';
                        toggleBtn.textContent = t(lang, 'show');
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
            .setName(t(lang, 'llmModelName'))
            .setDesc(t(lang, 'llmModelNameExample'))
            .addText(text => {
                text.setValue(this.plugin.settings.llm?.gemini?.model || 'gemini-2.0-flash-exp')
                    .onChange(async (v) => {
                        if (!this.plugin.settings.llm) this.plugin.settings.llm = { gemini: { apiKey: '', model: 'gemini-2.0-flash-exp' } };
                        this.plugin.settings.llm.gemini.model = v;
                        await this.plugin.saveSettings();
                    });
            });
        // つぶやきAI返信用モデル名
        new Setting(llmAcc.body)
            .setName(t(lang, 'tweetAiModelName'))
            .setDesc(t(lang, 'tweetAiModelNameDesc'))
            .addText(text => {
                text.setPlaceholder('例: gemini-1.5-flash-latest')
                    .setValue(this.plugin.settings.tweetAiModel || '')
                    .onChange(async (v) => {
                        this.plugin.settings.tweetAiModel = v;
                        await this.plugin.saveSettings();
                    });
            });
        // 振り返りAI要約用モデル名
        new Setting(llmAcc.body)
            .setName(t(lang, 'reflectionAiModelName'))
            .setDesc(t(lang, 'reflectionAiModelNameDesc'))
            .addText(text => {
                text.setPlaceholder('例: gemini-2.0-flash-exp')
                    .setValue(this.plugin.settings.reflectionAiModel || '')
                    .onChange(async (v) => {
                        this.plugin.settings.reflectionAiModel = v;
                        await this.plugin.saveSettings();
                    });
            });
        // --- ユーザプロンプト（今日用） ---
        new Setting(llmAcc.body)
            .setName(t(lang, 'userSummaryPromptToday'))
            .setDesc(t(lang, 'userSummaryPromptTodayDesc'))
            .addTextArea(text => {
                text.setPlaceholder(t(lang, 'enterCustomPrompt'))
                    .setValue(this.plugin.settings.userSummaryPromptToday || '')
                    .onChange(async (v) => {
                        this.plugin.settings.userSummaryPromptToday = v;
                        await this.plugin.saveSettings();
                    });
            });
        // --- ユーザプロンプト（今週用） ---
        new Setting(llmAcc.body)
            .setName(t(lang, 'userSummaryPromptWeek'))
            .setDesc(t(lang, 'userSummaryPromptWeekDesc'))
            .addTextArea(text => {
                text.setPlaceholder(t(lang, 'enterCustomPrompt'))
                    .setValue(this.plugin.settings.userSummaryPromptWeek || '')
                    .onChange(async (v) => {
                        this.plugin.settings.userSummaryPromptWeek = v;
                        await this.plugin.saveSettings();
                    });
            });
        // --- ユーザプロンプト（つぶやき用） ---
        new Setting(llmAcc.body)
            .setName(t(lang, 'userTweetPrompt'))
            .setDesc(t(lang, 'userTweetPromptDesc'))
            .addTextArea(text => {
                text.setPlaceholder(t(lang, 'enterCustomPrompt'))
                    .setValue(this.plugin.settings.userTweetPrompt || '')
                    .onChange(async (v) => {
                        this.plugin.settings.userTweetPrompt = v;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private renderCalendarSettings(containerEl: HTMLElement, lang: Language) {
        const calendarAcc = createAccordion(containerEl, t(lang, 'calendarGlobalSetting'), false); // デフォルトで閉じる
        new Setting(calendarAcc.body)
            .setName(t(lang, 'weekStartDay'))
            .setDesc(t(lang, 'weekStartDayDesc'))
            .addDropdown(drop => {
                const labels = [t(lang, 'sunday'),t(lang, 'monday'),t(lang, 'tuesday'),t(lang, 'wednesday'),t(lang, 'thursday'),t(lang, 'friday'),t(lang, 'saturday')];
                labels.forEach((l, i) => drop.addOption(String(i), l));
                drop.setValue(String(this.plugin.settings.weekStartDay ?? 1));
                drop.onChange(async value => {
                    this.plugin.settings.weekStartDay = parseInt(value, 10);
                    await this.plugin.saveSettings();
                });
            });
    }
    notifyWidgetInstanceIfBoardOpen(
        boardId: string,
        widgetId: string,
        widgetType: string,
        newSettings: Record<string, unknown>
    ) {
        externalNotify(this, boardId, widgetId, widgetType, newSettings);
    }
}

function playTestNotificationSound(plugin: WidgetBoardPlugin, soundType: string, volume: number) {
    try {
        if (soundType === 'off') return;
        const w = window as Window & {
            _testTimerAudio?: HTMLAudioElement;
            _testTimerAudioCtx?: AudioContext;
            webkitAudioContext?: typeof AudioContext;
        };
        if (w._testTimerAudio) {
            w._testTimerAudio.pause();
            w._testTimerAudio = undefined;
        }
        if (w._testTimerAudioCtx && w._testTimerAudioCtx.state !== 'closed') {
            w._testTimerAudioCtx.close();
            w._testTimerAudioCtx = undefined;
        }
        const ctx = new (window.AudioContext || w.webkitAudioContext!)();
        w._testTimerAudioCtx = ctx;
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
    } catch { new Notice('音声の再生に失敗しました'); }
}

