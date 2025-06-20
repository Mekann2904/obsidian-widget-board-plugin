// src/settingsTab.ts
import { App, PluginSettingTab, Setting, Notice, Modal, TFolder, FuzzySuggestModal } from 'obsidian';
import type WidgetBoardPlugin from './main';
import type { BoardConfiguration, WidgetConfig } from './interfaces';
import { DEFAULT_BOARD_CONFIGURATION } from './settingsDefaults';
import { WidgetBoardModal } from './modal';
import {
    DEFAULT_POMODORO_SETTINGS,
    PomodoroSettings,
    PomodoroSoundType,
    PomodoroExportFormat,
} from './widgets/pomodoro';
import { DEFAULT_MEMO_SETTINGS, MemoWidgetSettings } from './widgets/memo';
import { DEFAULT_CALENDAR_SETTINGS } from './settingsDefaults';
import type { CalendarWidgetSettings } from './widgets/calendar';
import { DEFAULT_RECENT_NOTES_SETTINGS } from './widgets/recent-notes';
import { DEFAULT_TIMER_STOPWATCH_SETTINGS } from './widgets/timer-stopwatch';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from './widgets/tweetWidget/constants';
import { TweetRepository } from './widgets/tweetWidget';
import { computeNextTime, ScheduleOptions } from './widgets/tweetWidget/scheduleUtils';
import type { ScheduledTweet } from './widgets/tweetWidget/types';
import { REFLECTION_WIDGET_DEFAULT_SETTINGS } from './widgets/reflectionWidget/constants';
import { obfuscate, deobfuscate } from './utils';
import { widgetTypeName, t, LANGUAGE_NAMES } from './i18n/index';
import type { Language } from './i18n/index';
// import { registeredWidgetImplementations } from './widgetRegistry'; // 未使用なのでコメントアウトまたは削除

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
        const lang: Language = (['ja', 'en'] as const).includes(this.plugin.settings.language as Language)
            ? (this.plugin.settings.language as Language)
            : 'ja';
        new Setting(containerEl).setName(t(lang, 'settingTabHeading')).setHeading();
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
                let v = text.inputEl.value.trim();
                if (v.startsWith('/') || v.match(/^([A-Za-z]:\\|\\|~)/)) {
                    new Notice(t(lang, 'vaultRelativePathOnly'));
                    text.setValue(this.plugin.settings.baseFolder || '');
                    return;
                }
                // フォルダ存在チェック
                const folder = this.app.vault.getAbstractFileByPath(v);
                if (!folder || folder.constructor.name !== 'TFolder') {
                    new Notice('Vault内のフォルダのみ指定できます。');
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
                        text.setValue(folder.path);
                        this.plugin.settings.baseFolder = folder.path;
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
        const pomoAcc = createAccordion(t(lang, 'pomoGlobalSetting'), false); // デフォルトで閉じる
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
            .setName(t(lang, 'pomodoroEndOpenBoard'))
            .setDesc(t(lang, 'pomodoroEndOpenBoardDesc'))
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.openBoardOnPomodoroEnd ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.openBoardOnPomodoroEnd = value;
                        await this.plugin.saveSettings();
                    });
            });
        // --- ポモドーロ終了時に自動で次のセッションを開始 ---
        new Setting(pomoAcc.body)
            .setName(t(lang, 'pomodoroEndAutoNext'))
            .setDesc(t(lang, 'pomodoroEndAutoNextDesc'))
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

        // --- タイマー／ストップウォッチ通知音（全体設定） ---
        const timerAcc = createAccordion(t(lang, 'timerGlobalSetting'), false); // デフォルトで閉じる
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
        const llmAcc = createAccordion(t(lang, 'llmGlobalSetting'), false);
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
                toggleBtn.style.marginLeft = '8px';
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

        // --- つぶやき（グローバル設定） ---
        const tweetGlobalAcc = createAccordion(t(lang, 'tweetWidgetGlobalSettings'), false);
        // ユーザー一覧セクション
        new Setting(tweetGlobalAcc.body).setName(t(lang, 'userListGlobal')).setHeading();
        const userListDiv = tweetGlobalAcc.body.createDiv({ cls: 'tweet-user-list-table' });
        const renderUserList = () => {
            userListDiv.empty();
            // '@you'ユーザーがいなければ必ず先頭に追加
            if (!this.plugin.settings.userProfiles) this.plugin.settings.userProfiles = [];
            if (!this.plugin.settings.userProfiles.some(p => p.userId === '@you')) {
                this.plugin.settings.userProfiles.unshift({ userName: 'あなた', userId: '@you', avatarUrl: '' });
            }
            const table = userListDiv.createEl('table', { cls: 'tweet-user-table' });
            const thead = table.createEl('thead');
            const headerRow = thead.createEl('tr');
            [t(lang, 'userName'), t(lang, 'userId'), t(lang, 'avatarUrl'), ''].forEach(h => headerRow.createEl('th', { text: h }));
            const tbody = table.createEl('tbody');
            (this.plugin.settings.userProfiles || []).forEach((profile, idx) => {
                const isSelf = profile.userId === '@you';
                const row = tbody.createEl('tr');
                // ユーザー名
                const nameTd = row.createEl('td');
                const nameInput = nameTd.createEl('input', { type: 'text', value: profile.userName || '', placeholder: '例: あなた' });
                nameInput.onchange = async () => {
                    if (!this.plugin.settings.userProfiles) this.plugin.settings.userProfiles = [];
                    this.plugin.settings.userProfiles[idx].userName = nameInput.value;
                    await this.plugin.saveSettings();
                };
                // ユーザーID
                const idTd = row.createEl('td');
                const idInput = idTd.createEl('input', { type: 'text', value: profile.userId || '', placeholder: '例: @you' });
                if (isSelf) idInput.disabled = true;
                idInput.onchange = async () => {
                    if (!this.plugin.settings.userProfiles) this.plugin.settings.userProfiles = [];
                    this.plugin.settings.userProfiles[idx].userId = idInput.value;
                    await this.plugin.saveSettings();
                };
                // アバターURL
                const avatarTd = row.createEl('td');
                const avatarInput = avatarTd.createEl('input', { type: 'text', value: profile.avatarUrl || '', placeholder: 'https://example.com/avatar.png' });
                avatarInput.onchange = async () => {
                    if (!this.plugin.settings.userProfiles) this.plugin.settings.userProfiles = [];
                    this.plugin.settings.userProfiles[idx].avatarUrl = avatarInput.value;
                    await this.plugin.saveSettings();
                };
                // 削除ボタン
                const delTd = row.createEl('td');
                if (!isSelf) {
                    const delBtn = delTd.createEl('button', { text: t(lang, 'delete'), cls: 'mod-warning' });
                    delBtn.onclick = async () => {
                        if (!this.plugin.settings.userProfiles) this.plugin.settings.userProfiles = [];
                        this.plugin.settings.userProfiles.splice(idx, 1);
                        await this.plugin.saveSettings();
                        renderUserList();
                    };
                }
            });
            // 追加ボタン
            const addTr = tbody.createEl('tr');
            addTr.createEl('td', { attr: { colspan: 4 } });
            const addBtn = addTr.createEl('button', { text: t(lang, 'addUser'), cls: 'mod-cta' });
            addBtn.onclick = async () => {
                if (!this.plugin.settings.userProfiles) this.plugin.settings.userProfiles = [];
                this.plugin.settings.userProfiles.push({ userName: '', userId: '', avatarUrl: '' });
                await this.plugin.saveSettings();
                renderUserList();
            };
        };
        renderUserList();
        // --- AIリプライ発火上限設定 ---
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyTriggerless'))
            .setDesc('ONにすると「@ai」や「#ai-reply」などのトリガーワードがなくても、全ての投稿がAIリプライ候補になります。')
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.aiReplyTriggerless ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.aiReplyTriggerless = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyRpm'))
            .setDesc(t(lang, 'aiReplyRpmDesc'))
            .addText(text => {
                text.setPlaceholder('-1（無制限）')
                    .setValue(String(this.plugin.settings.aiReplyRpm ?? 2))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n)) n = 2;
                        this.plugin.settings.aiReplyRpm = n;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyRpd'))
            .setDesc(t(lang, 'aiReplyRpdDesc'))
            .addText(text => {
                text.setPlaceholder('-1（無制限）')
                    .setValue(String(this.plugin.settings.aiReplyRpd ?? 10))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n)) n = 10;
                        this.plugin.settings.aiReplyRpd = n;
                        await this.plugin.saveSettings();
                    });
            });
        // ユーザーアイコンURL
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'userIconUrl'))
            .setDesc(t(lang, 'userIconUrlDesc'))
            .addText(text => {
                text.setPlaceholder('https://example.com/avatar.png')
                    .setValue(this.plugin.settings.tweetWidgetAvatarUrl || '')
                    .onChange(async () => {
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
                            (w.settings as Record<string, unknown>).avatarUrl = v;
                        });
                    });
                });
            });
        // AIの会話履歴を表示
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'showAiHistory'))
            .setDesc(t(lang, 'showAiHistoryDesc'))
            .addToggle(toggle => {
                toggle.setValue(this.plugin.settings.showAiHistory ?? false)
                    .onChange(async (value) => {
                        this.plugin.settings.showAiHistory = value;
                        await this.plugin.saveSettings();
                    });
            });
        // AIアバター画像URLリスト
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiAvatarUrls'))
            .setDesc(t(lang, 'aiAvatarUrlsDesc'))
            .addTextArea(text => {
                text.setPlaceholder('https://example.com/ai1.png, https://example.com/ai2.png')
                    .setValue(this.plugin.settings.aiAvatarUrls || '')
                    .onChange(async (v) => {
                        this.plugin.settings.aiAvatarUrls = v;
                        await this.plugin.saveSettings();
                    });
            });
        // --- AIリプライ遅延設定 ---
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyDelayMin'))
            .setDesc(t(lang, 'aiReplyDelayMinDesc'))
            .addText(text => {
                text.setPlaceholder('1500')
                    .setValue(String(this.plugin.settings.aiReplyDelayMinMs ?? 1500))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n) || n < 0) n = 1500;
                        this.plugin.settings.aiReplyDelayMinMs = n;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyDelayMax'))
            .setDesc(t(lang, 'aiReplyDelayMaxDesc'))
            .addText(text => {
                text.setPlaceholder('7000')
                    .setValue(String(this.plugin.settings.aiReplyDelayMaxMs ?? 7000))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n) || n < 0) n = 7000;
                        this.plugin.settings.aiReplyDelayMaxMs = n;
                        await this.plugin.saveSettings();
                    });
            });
        // --- つぶやきウィジェットのデフォルト表示期間 ---
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'tweetDefaultPeriod'))
            .setDesc(t(lang, 'tweetDefaultPeriodDesc'))
            .addDropdown(dropdown => {
                dropdown.addOption('all', t(lang, 'allTime'));
                dropdown.addOption('today', t(lang, 'today'));
                dropdown.addOption('1d', t(lang, 'oneDay'));
                dropdown.addOption('3d', t(lang, 'threeDays'));
                dropdown.addOption('7d', t(lang, 'oneWeek'));
                dropdown.addOption('30d', t(lang, 'oneMonth'));
                dropdown.addOption('custom', t(lang, 'custom'));
                dropdown.setValue(this.plugin.settings.defaultTweetPeriod || 'all')
                    .onChange(async (value) => {
                        this.plugin.settings.defaultTweetPeriod = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'tweetDefaultCustomDays'))
            .setDesc(t(lang, 'tweetDefaultCustomDaysDesc'))
            .addText(text => {
                text.setPlaceholder('1')
                    .setValue(String(this.plugin.settings.defaultTweetCustomDays ?? 1))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n) || n < 1) n = 1;
                        this.plugin.settings.defaultTweetCustomDays = n;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'addScheduledTweet'))
            .setDesc(t(lang, 'addScheduledTweetDesc'))
            .addButton(btn => btn.setButtonText(t(lang, 'add')).setCta().onClick(() => {
                this.openScheduleTweetModal();
            }));

        // 予約投稿一覧表示・削除
        (async () => {
            const repo = new TweetRepository(this.app, getTweetDbPath(this.plugin));
            const settings = await repo.load();
            const scheduledPosts = settings.scheduledPosts || [];
            const listDiv = tweetGlobalAcc.body.createDiv({ cls: 'scheduled-tweet-list' });
            new Setting(listDiv).setName(t(lang, 'scheduledPostList')).setHeading();
            if (scheduledPosts.length === 0) {
                listDiv.createEl('div', { text: t(lang, 'noScheduledPosts'), cls: 'scheduled-tweet-empty' });
            } else {
                const daysOfWeekKeys = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
                scheduledPosts.forEach((sched, idx) => {
                    const item = listDiv.createDiv({ cls: 'scheduled-tweet-item' });
                    const main = item.createDiv({ cls: 'scheduled-tweet-item-main' });
                    main.createEl('div', { text: sched.text, cls: 'scheduled-tweet-text' });
                    let info = `${t(lang, 'time')}: ${sched.hour.toString().padStart(2, '0')}:${sched.minute.toString().padStart(2, '0')}`;
                    if (sched.daysOfWeek && sched.daysOfWeek.length > 0) {
                        info += `  ${t(lang, 'daysOfWeek')}: ${sched.daysOfWeek.map(d => t(lang, daysOfWeekKeys[d])).join(',')}`;
                    }
                    if (sched.startDate) info += `  ${t(lang, 'startDate')}: ${sched.startDate}`;
                    if (sched.endDate) info += `  ${t(lang, 'endDate')}: ${sched.endDate}`;
                    main.createEl('div', { text: info, cls: 'scheduled-tweet-info' });
                    // ボタン横並び
                    const actions = item.createDiv({ cls: 'scheduled-tweet-actions' });
                    const editBtn = actions.createEl('button', { text: t(lang, 'edit'), cls: 'scheduled-tweet-edit-btn' });
                    editBtn.onclick = () => {
                        this.openScheduleTweetModal(sched, idx);
                    };
                    const delBtn = actions.createEl('button', { text: t(lang, 'delete'), cls: 'scheduled-tweet-delete-btn' });
                    delBtn.onclick = async () => {
                        if (!confirm(t(lang, 'deleteScheduledPostConfirm'))) return;
                        scheduledPosts.splice(idx, 1);
                        await repo.save({ ...settings, scheduledPosts });
                        new Notice(t(lang, 'scheduledPostDeleted'));
                        listDiv.remove();
                        // 再描画
                        this.display();
                    };
                });
            }
        })();

        // --- カレンダー（グローバル設定） ---
        const calendarAcc = createAccordion(t(lang, 'calendarGlobalSetting'), false); // デフォルトで閉じる

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

        // --- ボード管理セクション ---
        const boardManagementAcc = createAccordion(t(lang, 'boardManagement'), false); // デフォルトで閉じる
        this.renderBoardManagementUI(boardManagementAcc.body, lang); // langを渡す
        // --- 選択されたボードの詳細設定をボード管理アコーディオン内に表示 ---
        const boardDetailContainer = boardManagementAcc.body.createDiv({ cls: 'selected-board-settings-section' });
        if (this.selectedBoardId) {
            this.renderSelectedBoardSettingsUI(boardDetailContainer, lang);
        } else {
            const msg = this.plugin.settings.boards.length === 0 ? t(lang, 'noBoards') : t(lang, 'selectBoardToConfig');
            boardDetailContainer.createEl('p', { text: msg });
        }

        // --- ボードグループ管理セクション ---
        const boardGroupAcc = createAccordion(t(lang, 'boardGroupManagement'), false);
        this.boardGroupBodyEl = boardGroupAcc.body;
        this.renderBoardGroupManagementUI(this.boardGroupBodyEl, lang); // langを渡す


    }

    /**
     * ボード管理セクションのUIを描画
     * @param containerEl 描画先要素
     * @param lang 表示言語
     */
    private renderBoardManagementUI(containerEl: HTMLElement, lang: import('./i18n').Language) { // langを受け取る
        containerEl.empty();

        new Setting(containerEl)
            .setName(t(lang, 'boardSelect'))
            .setDesc(t(lang, 'boardSelectDesc'))
            .addDropdown(dropdown => {
                if (this.plugin.settings.boards.length === 0) {
                    dropdown.addOption('', t(lang, 'noBoardsAvailable')); // ダミーオプション
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
                        this.renderSelectedBoardSettingsUI(selectedBoardSettingsContainer as HTMLElement, lang); // langを渡す
                    }
                    // ボード詳細設定アコーディオンを自動で開かない
                });
            });

        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText(t(lang, 'addNewBoard'))
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
                        this.renderSelectedBoardSettingsUI(selectedBoardSettingsContainer as HTMLElement, this.plugin.settings.language || 'ja');
                    }
                    this.renderBoardManagementUI(containerEl, lang); // UIを再描画
                    this.renderSelectedBoardSettingsUI(
                        this.containerEl.querySelector('.selected-board-settings-section') as HTMLElement,
                        lang
                    );
                }));
    }

    /**
     * 選択中ボードの詳細設定UIを描画
     * @param containerEl 描画先要素
     */
    private renderSelectedBoardSettingsUI(containerEl: HTMLElement, lang: import('./i18n').Language) {
        containerEl.empty();
        const board = this.plugin.settings.boards.find(b => b.id === this.selectedBoardId);
        if (!board) {
            const msg = this.plugin.settings.boards.length === 0 ? t(lang, 'noBoards') : t(lang, 'selectBoardToConfig');
            containerEl.createEl('p', { text: msg });
            return;
        }

        new Setting(containerEl)
            .setName(t(lang, 'boardName'))
                .addText(text => text
                    .setValue(board.name)
                    .onChange(async () => {
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
            .setName(t(lang, 'defaultViewMode'))
            .setDesc(t(lang, 'defaultViewModeDesc'))
            .addDropdown(dropdown => {
                // 左パネル
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_THIRD, t(lang, 'leftPanel33'));
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_HALF, t(lang, 'leftPanel50'));
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_TWO_THIRD, t(lang, 'leftPanel66'));
                dropdown.addOption(WidgetBoardModal.MODES.LEFT_OUTER, t(lang, 'leftSplitOuter')); // 追加
                // 中央パネル
                dropdown.addOption(WidgetBoardModal.MODES.CENTER_THIRD, t(lang, 'centerPanel33'));
                dropdown.addOption(WidgetBoardModal.MODES.CENTER_HALF, t(lang, 'centerPanel50'));
                // 右パネル
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_THIRD, t(lang, 'rightPanel33'));
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_HALF, t(lang, 'rightPanel50'));
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_TWO_THIRD, t(lang, 'rightPanel66'));
                dropdown.addOption(WidgetBoardModal.MODES.RIGHT_OUTER, t(lang, 'rightSplitOuter')); // 追加
                // カスタム
                dropdown.addOption('custom-width', t(lang, 'customWidthVw'));
                dropdown.setValue(board.viewMode || WidgetBoardModal.MODES.RIGHT_OUTER);
                dropdown.onChange(async (value) => {
                    if ((Object.values(WidgetBoardModal.MODES) as string[]).includes(value) || value === 'custom-width') {
                        board.viewMode = value;
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
            .setName(t(lang, 'customWidth'))
            .setDesc(t(lang, 'customWidthDesc'))
            .addText(text => {
                text.setPlaceholder(t(lang, 'customWidthPlaceholder'))
                    .setValue(board.customWidth ? String(board.customWidth) : '')
                    .onChange(async () => {
                        // 入力途中は何もしない
                    });
                text.inputEl.addEventListener('blur', async () => {
                    const v = text.inputEl.value;
                    const n = parseFloat(v);
                    if (!isNaN(n)) {
                        board.customWidth = n;
                        await this.plugin.saveSettings(board.id);
                        if (n <= 0 || n > 100) {
                            new Notice(t(lang, 'rangeWarning'));
                        }
                    } else {
                        new Notice(t(lang, 'invalidNumber'));
                    }
                });
            });
        customWidthSettingEl = customWidthSetting.settingEl;
        // カスタム幅基準位置ドロップダウン
        let customWidthAnchorSettingEl: HTMLElement | null = null;
        const customWidthAnchorSetting = new Setting(containerEl)
            .setName(t(lang, 'customWidthAnchor'))
            .setDesc(t(lang, 'customWidthAnchorDesc'))
            .addDropdown(dropdown => {
                dropdown.addOption('left', t(lang, 'left'));
                dropdown.addOption('center', t(lang, 'center'));
                dropdown.addOption('right', t(lang, 'right'));
                dropdown.setValue(board.customWidthAnchor || 'left');
                dropdown.onChange(async (value) => {
                    board.customWidthAnchor = value as 'left' | 'center' | 'right';
                    await this.plugin.saveSettings(board.id);
                });
            });
        customWidthAnchorSettingEl = customWidthAnchorSetting.settingEl;
        // 初期表示制御
        if (board.viewMode !== 'custom-width' && customWidthSettingEl) {
            customWidthSettingEl.style.display = 'none';
        }
        if (board.viewMode !== 'custom-width' && customWidthAnchorSettingEl) {
            customWidthAnchorSettingEl.style.display = 'none';
        }
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText(t(lang, 'deleteThisBoard'))
                .setWarning()
                .setDisabled(this.plugin.settings.boards.length <= 1)
                .onClick(async () => {
                    if (!confirm(t(lang, 'deleteBoardConfirm').replace('{name}', board.name))) return;
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
                        this.renderSelectedBoardSettingsUI(selectedBoardSettingsContainer as HTMLElement, this.plugin.settings.language || 'ja');
                    }
                }));

        new Setting(containerEl).setName(t(lang, 'widgetManagement')).setHeading();
        const addWidgetButtonsContainer = containerEl.createDiv({ cls: 'widget-add-buttons' });
        const widgetListEl = containerEl.createDiv({ cls: 'widget-settings-list-for-board' }); // 先に定義

        // createAddButtonToBoardの定義を修正
        const createAddButtonToBoard = (
            buttonText: string,
            widgetType: string,
            defaultWidgetSettings: Record<string, unknown>,
            lang: import('./i18n').Language
        ) => {
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
                    this.renderWidgetListForBoard(widgetListEl, currentBoard, lang); // widgetListEl は既に定義済み
                    const widgetDisplayName = widgetTypeName(this.plugin.settings.language || 'ja', widgetType); // 通知用にも表示名を使用
                    new Notice(`「${widgetDisplayName}」ウィジェットがボード「${currentBoard.name}」に追加されました。`);
                }));
            settingItem.settingEl.addClass('widget-add-button-setting-item');
            settingItem.nameEl.remove(); settingItem.descEl.remove();
        };
        // 呼び出し時にlangを渡す
        createAddButtonToBoard(t(lang, 'addPomodoro'), "pomodoro", DEFAULT_POMODORO_SETTINGS as unknown as Record<string, unknown>, lang);
        createAddButtonToBoard(t(lang, 'addMemo'), "memo", DEFAULT_MEMO_SETTINGS as unknown as Record<string, unknown>, lang);
        createAddButtonToBoard(t(lang, 'addCalendar'), "calendar", DEFAULT_CALENDAR_SETTINGS as unknown as Record<string, unknown>, lang);
        createAddButtonToBoard(t(lang, 'addRecentNotes'), "recent-notes", DEFAULT_RECENT_NOTES_SETTINGS as unknown as Record<string, unknown>, lang);
        createAddButtonToBoard(t(lang, 'addThemeSwitcher'), "theme-switcher", {}, lang);
        createAddButtonToBoard(t(lang, 'addTimerStopwatch'), "timer-stopwatch", { ...DEFAULT_TIMER_STOPWATCH_SETTINGS } as unknown as Record<string, unknown>, lang);
        createAddButtonToBoard(t(lang, 'addFileView'), "file-view-widget", { heightMode: "auto", fixedHeightPx: 200 } as unknown as Record<string, unknown>, lang);
        createAddButtonToBoard(t(lang, 'addTweetWidget'), "tweet-widget", DEFAULT_TWEET_WIDGET_SETTINGS as unknown as Record<string, unknown>, lang);
        createAddButtonToBoard(t(lang, 'addReflectionWidget'), "reflection-widget", REFLECTION_WIDGET_DEFAULT_SETTINGS as unknown as Record<string, unknown>, lang);

        this.renderWidgetListForBoard(widgetListEl, board, lang);
    }

    private renderWidgetListForBoard(containerEl: HTMLElement, board: BoardConfiguration, lang: import('./i18n').Language) {
        containerEl.empty();
        const widgets = board.widgets;
        if (widgets.length === 0) {
            containerEl.createEl('p', { text: t(lang, 'noWidgets') });
            return;
        }

        widgets.forEach((widget, index) => {
            const widgetSettingContainer = containerEl.createDiv({cls: 'widget-setting-container'});

            // ウィジェットタイプに応じた表示名を取得
            const typeName = widgetTypeName(lang, widget.type);
            // タイトルが未設定の場合は「(名称未設定 <ウィジェット日本語名>)」とする
            const displayName = widget.title || t(lang, 'untitledWidget').replace('{type}', typeName);

            const titleSetting = new Setting(widgetSettingContainer)
                .setName(displayName)
                .setDesc(`${t(lang, 'widgetType')}: ${widget.type} | ${t(lang, 'widgetId')}: ${widget.id.substring(0,8)}...`);

            titleSetting.addText(text => {
                text.setPlaceholder(t(lang, 'widgetNamePlaceholder'))
                    .setValue(widget.title)
                    .onChange(async () => {
                        // 入力途中は何もしない
                    });
                text.inputEl.addEventListener('blur', async () => {
                    const value = text.inputEl.value;
                    widget.title = value.trim();
                    await this.plugin.saveSettings(board.id);
                    // タイトル変更時も同様のロジックで表示名を更新
                    const updatedDisplayName = widget.title || t(lang, 'untitledWidget').replace('{type}', typeName);
                    titleSetting.setName(updatedDisplayName);
                    this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, widget.settings as unknown as Record<string, unknown>);
                });
            });

            titleSetting
                .addExtraButton(cb => cb.setIcon('arrow-up').setTooltip(t(lang, 'moveUp')).setDisabled(index === 0)
                    .onClick(async () => {
                        if (index > 0) {
                            const item = board.widgets.splice(index, 1)[0];
                            board.widgets.splice(index - 1, 0, item);
                            await this.plugin.saveSettings(board.id);
                            this.renderWidgetListForBoard(containerEl, board, lang);
                        }
                    }))
                .addExtraButton(cb => cb.setIcon('arrow-down').setTooltip(t(lang, 'moveDown')).setDisabled(index === widgets.length - 1)
                    .onClick(async () => {
                        if (index < board.widgets.length - 1) {
                            const item = board.widgets.splice(index, 1)[0];
                            board.widgets.splice(index + 1, 0, item);
                            await this.plugin.saveSettings(board.id);
                            this.renderWidgetListForBoard(containerEl, board, lang);
                        }
                    }))
                .addButton(button => button.setIcon("trash").setTooltip(t(lang, 'deleteWidget')).setWarning()
                    .onClick(async () => {
                        // 削除時の通知メッセージも同様のロジックで表示名を生成
                        const oldWidgetTypeName = widgetTypeName(this.plugin.settings.language || 'ja', widget.type);
                        const oldTitle = widget.title || t(lang, 'untitledWidget').replace('{type}', oldWidgetTypeName);
                        board.widgets.splice(index, 1);
                        await this.plugin.saveSettings(board.id);
                        this.renderWidgetListForBoard(containerEl, board, lang);
                        new Notice(t(lang, 'widgetDeletedFromBoard').replace('{widgetName}', oldTitle).replace('{boardName}', board.name));
                    }));

            // 詳細設定用のアコーディオンコンテナ (titleSetting の下に配置)
            const settingsEl = widgetSettingContainer.createDiv({cls: 'widget-specific-settings'});

            // --- ウィジェット個別設定のアコーディオン生成関数 ---
            const createWidgetAccordion = (parentEl: HTMLElement, title: string = t(lang, 'detailedSettings')) => {
                const acc = parentEl.createDiv({ cls: 'widget-detail-accordion' });
                const header = acc.createDiv({ cls: 'widget-detail-accordion-header' });
                const icon = header.createSpan({ cls: 'widget-detail-accordion-icon' });
                icon.setText('▶');
                header.appendText(title);
                const body = acc.createDiv({ cls: 'widget-detail-accordion-body' });
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

            // Ensure widget.settings is properly typed before use
            // (No global cast; only cast in each widget type branch)

            if (widget.type === 'pomodoro') {
                widget.settings = { ...DEFAULT_POMODORO_SETTINGS, ...(widget.settings as Partial<PomodoroSettings> || {}) } as PomodoroSettings;
                const currentSettings = widget.settings as PomodoroSettings;
                const { body: pomoDetailBody } = createWidgetAccordion(settingsEl, t(lang, 'detailedSettings'));

                const createNumInput = (parent: HTMLElement, label: string, desc: string, key: keyof Omit<PomodoroSettings, 'backgroundImageUrl' | 'memoContent'>) => {
                    new Setting(parent).setName(label).setDesc(desc).setClass('pomodoro-setting-item')
                        .addText(text => {
                            text.setPlaceholder(String(DEFAULT_POMODORO_SETTINGS[key]))
                                .setValue(String(currentSettings[key]))
                                .onChange(async () => {
                                    // 入力途中は何もしない（バリデーションしない）
                                });
                            text.inputEl.addEventListener('blur', async () => {
                                const v = text.inputEl.value;
                                const n = parseInt(v);
                                if (!isNaN(n) && n > 0) {
                                    (currentSettings as unknown as Record<string, unknown>)[key] = n;
                                    await this.plugin.saveSettings(board.id);
                                    this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
                                } else {
                                    new Notice(t(lang, 'enterPositiveNumber'));
                                    text.setValue(String(currentSettings[key]));
                                }
                            });
                        });
                };
                createNumInput(pomoDetailBody, t(lang, 'workMinutes'), t(lang, 'workMinutesDesc'), 'workMinutes');
                createNumInput(pomoDetailBody, t(lang, 'shortBreakMinutes'), t(lang, 'shortBreakMinutesDesc'), 'shortBreakMinutes');
                createNumInput(pomoDetailBody, t(lang, 'longBreakMinutes'), t(lang, 'longBreakMinutesDesc'), 'longBreakMinutes');
                createNumInput(pomoDetailBody, t(lang, 'pomodorosUntilLongBreak'), t(lang, 'pomodorosUntilLongBreakDesc'), 'pomodorosUntilLongBreak');

                new Setting(pomoDetailBody).setName(t(lang, 'backgroundImageUrl')).setDesc(t(lang, 'backgroundImageUrlDesc')).setClass('pomodoro-setting-item')
                    .addText(text => text
                        .setPlaceholder(t(lang, 'backgroundImageUrlPlaceholder'))
                        .setValue(currentSettings.backgroundImageUrl || '')
                        .onChange(async (v) => {
                            currentSettings.backgroundImageUrl = v.trim();
                            await this.plugin.saveSettings(board.id);
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
                        }));

                // --- 通知音・エクスポート形式はグローバル設定が適用される旨を表示 ---
                new Setting(pomoDetailBody)
                    .setName(t(lang, 'notificationAndExport'))
                    .setDesc(t(lang, 'notificationAndExportDesc'))
                    .setDisabled(true);

            } else if (widget.type === 'memo') {
                widget.settings = { ...DEFAULT_MEMO_SETTINGS, ...(widget.settings as Partial<MemoWidgetSettings> || {}) } as MemoWidgetSettings;
                const currentSettings = widget.settings as MemoWidgetSettings;
                const { body: memoDetailBody } = createWidgetAccordion(settingsEl, t(lang, 'detailedSettings'));

                new Setting(memoDetailBody).setName(t(lang, 'memoContent')).setDesc(t(lang, 'memoContentDesc')).setClass('pomodoro-setting-item')
                    .addTextArea(text => {
                        text.setPlaceholder(t(lang, 'memoContentPlaceholder'))
                            .setValue(currentSettings.memoContent || '')
                            .onChange(async () => {
                                // 入力途中は何もしない
                            });
                        text.inputEl.addEventListener('blur', async () => {
                            const v = text.inputEl.value;
                            if((widget.settings as MemoWidgetSettings)) (widget.settings as MemoWidgetSettings).memoContent = v;
                            await this.plugin.saveSettings(board.id);
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, widget.settings as unknown as Record<string, unknown>);
                        });
                    });

                let fixedHeightSettingEl: HTMLElement | null = null;

                new Setting(memoDetailBody)
                    .setName('メモエリアの高さモード')
                    .setDesc('自動調整（内容にfit）または固定高さを選択')
                    .addDropdown(dropdown => {
                        dropdown.addOption('auto', t(lang, 'auto'));
                        dropdown.addOption('fixed', t(lang, 'fixed'));
                        dropdown.setValue(currentSettings.memoHeightMode || 'auto')
                            .onChange(async (value) => {
                                currentSettings.memoHeightMode = value as 'auto' | 'fixed';
                                await this.plugin.saveSettings(board.id);
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
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
                            .onChange(async () => {
                                // 入力途中は何もしない
                            });
                        text.inputEl.addEventListener('blur', async () => {
                            const v = text.inputEl.value;
                            const n = parseInt(v);
                            if (!isNaN(n) && n > 0) {
                                currentSettings.fixedHeightPx = n;
                                await this.plugin.saveSettings(board.id);
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
                            } else {
                                new Notice(t(lang, 'enterPositiveNumber'));
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
                const currentSettings = widget.settings as { heightMode?: string; fixedHeightPx?: number };
                const { body: fileViewDetailBody } = createWidgetAccordion(settingsEl, t(lang, 'detailedSettings'));

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
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
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
                            .onChange(async () => {
                                // 入力途中は何もしない
                            });
                        text.inputEl.addEventListener('blur', async () => {
                            const v = text.inputEl.value;
                            const n = parseInt(v);
                            if (!isNaN(n) && n > 0) {
                                currentSettings.fixedHeightPx = n;
                                await this.plugin.saveSettings(board.id);
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
                            } else {
                                new Notice(t(lang, 'enterPositiveNumber'));
                                text.setValue(String(currentSettings.fixedHeightPx ?? 200));
                            }
                        });
                    });
                fixedHeightSettingEl = heightSetting.settingEl;
                if ((currentSettings.heightMode || 'auto') !== 'fixed' && fixedHeightSettingEl) {
                    fixedHeightSettingEl.style.display = 'none';
                }
            } else if (widget.type === 'calendar') {
                widget.settings = { ...DEFAULT_CALENDAR_SETTINGS, ...(widget.settings as Partial<CalendarWidgetSettings> || {}) } as CalendarWidgetSettings;
                const { body: calendarDetailBody } = createWidgetAccordion(settingsEl, t(lang, 'detailedSettings'));
                new Setting(calendarDetailBody)
                    .setName('デイリーノートファイル名フォーマット')
                    .setDesc('例: YYYY-MM-DD, YYYY-MM-DD.md など。YYYY, MM, DDが日付に置換されます。Moment.jsのフォーマットリファレンス（https://momentjs.com/docs/#/displaying/format/）に準拠。')
                    .addText(text => {
                        text.setPlaceholder('YYYY-MM-DD')
                            .setValue((widget.settings as CalendarWidgetSettings).dailyNoteFormat || 'YYYY-MM-DD')
                            .onChange(async () => {
                                // 入力途中は何もしない
                            });
                        text.inputEl.addEventListener('blur', async () => {
                            const v = text.inputEl.value.trim();
                            (widget.settings as CalendarWidgetSettings).dailyNoteFormat = v || 'YYYY-MM-DD';
                            await this.plugin.saveSettings(board.id);
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, widget.settings as unknown as Record<string, unknown>);
                        });
                    });

            } else if (widget.type === 'timer-stopwatch') {
                widget.settings = { ...DEFAULT_TIMER_STOPWATCH_SETTINGS, ...(widget.settings as Partial<typeof DEFAULT_TIMER_STOPWATCH_SETTINGS> || {}) };
                const { body: timerStopwatchDetailBody } = createWidgetAccordion(settingsEl, t(lang, 'detailedSettings'));

                new Setting(timerStopwatchDetailBody)
                    .setName('通知音（全体設定が適用されます）')
                    .setDesc('このウィジェットの通知音・音量は「タイマー／ストップウォッチ通知音（全体設定）」が使われます。')
                    .setDisabled(true);
            } else if (widget.type === 'reflection-widget') {
                widget.settings = { ...REFLECTION_WIDGET_DEFAULT_SETTINGS, ...(widget.settings as Partial<typeof REFLECTION_WIDGET_DEFAULT_SETTINGS> || {}) };
                const currentSettings = widget.settings as typeof REFLECTION_WIDGET_DEFAULT_SETTINGS;
                const { body: reflectionDetailBody } = createWidgetAccordion(settingsEl, t(lang, 'detailedSettings'));

                new Setting(reflectionDetailBody)
                    .setName('AIまとめ自動発火を有効にする')
                    .setDesc('ONにすると、指定した間隔で自動的にAIまとめを生成します。')
                    .addToggle(toggle => {
                        toggle.setValue(currentSettings.aiSummaryAutoEnabled ?? false)
                            .onChange(async (value) => {
                                currentSettings.aiSummaryAutoEnabled = value;
                                await this.plugin.saveSettings(board.id);
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
                            });
                    });
                new Setting(reflectionDetailBody)
                    .setName('自動発火の間隔（時間）')
                    .setDesc('-1で自動発火しません。1以上で何時間ごとに自動生成するか指定。')
                    .addText(text => {
                        text.setPlaceholder('-1')
                            .setValue(String(currentSettings.aiSummaryAutoIntervalHours ?? -1))
                            .onChange(async () => {
                                // 入力途中は何もしない
                            });
                        text.inputEl.addEventListener('blur', async () => {
                            let n = parseInt(text.inputEl.value, 10);
                            if (isNaN(n)) n = -1;
                            currentSettings.aiSummaryAutoIntervalHours = n;
                            await this.plugin.saveSettings(board.id);
                            this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
                        });
                    });
                new Setting(reflectionDetailBody)
                    .setName('手動発火ボタンを表示')
                    .setDesc('ONにすると、ウィジェット内に「まとめ生成」ボタンが表示されます。')
                    .addToggle(toggle => {
                        toggle.setValue(currentSettings.aiSummaryManualEnabled ?? true)
                            .onChange(async (value) => {
                                currentSettings.aiSummaryManualEnabled = value;
                                await this.plugin.saveSettings(board.id);
                                this.notifyWidgetInstanceIfBoardOpen(board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
                            });
                    });
            }
        });
    }

    private notifyWidgetInstanceIfBoardOpen(
        boardId: string,
        widgetId: string,
        widgetType: string,
        newSettings: Record<string, unknown>
    ) {
        const modal = this.plugin.widgetBoardModals?.get(boardId);
        if (modal && modal.isOpen) {
            const widgetInstance = modal.uiWidgetReferences.find(
                w => (w as unknown as { config?: { id?: string } }).config?.id === widgetId
            );
            if (widgetInstance && typeof widgetInstance.updateExternalSettings === 'function') {
                widgetInstance.updateExternalSettings(newSettings, widgetId);
            }
        }
    }

    /**
     * ボードグループ管理UIを描画
     * @param containerEl 描画先
     * @param lang 表示言語
     */
    private renderBoardGroupManagementUI(containerEl: HTMLElement, lang: import('./i18n').Language) {
        containerEl.empty();
        new Setting(containerEl)
            .setName(t(lang, 'boardGroupManagement'))
            .setDesc(t(lang, 'boardGroupManagementDesc'))
            .addButton(btn => btn
                .setButtonText(t(lang, 'addNewGroup'))
                .setCta()
                .onClick(() => {
                    this.openBoardGroupEditModal(lang, undefined, undefined); // langを渡す
                }));

        const listEl = containerEl.createDiv({ cls: 'wb-board-group-list' });
        const groups = this.plugin.settings.boardGroups;
        if (!groups || groups.length === 0) {
            listEl.createEl('p', { text: t(lang, 'noGroups') });
            return;
        }

        groups.forEach((group, index) => {
            const itemEl = listEl.createDiv({ cls: 'wb-board-group-item' });
            itemEl.createEl('span', { text: group.name, cls: 'wb-board-group-name' });
            const controlsEl = itemEl.createDiv({ cls: 'wb-board-group-controls' });

            new Setting(controlsEl)
                .addButton(btn => btn.setIcon('pencil').setTooltip(t(lang, 'editGroup')).onClick(() => {
                    this.openBoardGroupEditModal(lang, group, index); // langを渡す
                }))
                .addButton(btn => btn.setIcon('trash').setTooltip(t(lang, 'deleteGroup')).setWarning().onClick(async () => {
                    if (!confirm(t(lang, 'deleteGroupConfirm').replace('{name}', group.name))) return;
                    this.plugin.settings.boardGroups.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.renderBoardGroupManagementUI(containerEl, lang); // langを渡す
                    this.plugin.registerAllBoardCommands?.();
                }));
        });
    }

    private openBoardGroupEditModal(lang: import('./i18n').Language, group?: import('./interfaces').BoardGroup, editIdx?: number) {
        const onSave = () => {
            if (this.boardGroupBodyEl) {
                this.renderBoardGroupManagementUI(this.boardGroupBodyEl, lang); // langを渡す
            }
        };
        new BoardGroupEditModal(this.app, this.plugin, onSave, group, editIdx).open();
    }

    private openScheduleTweetModal(sched?: ScheduledTweet, idx?: number) {
        const onSave = () => {
            const scheduledListDiv = this.containerEl.querySelector('.scheduled-tweet-list') as HTMLElement;
            if (scheduledListDiv) {
                this.renderScheduledTweetList(scheduledListDiv);
            }
        };
        new ScheduleTweetModal(this.app, this.plugin, onSave, sched, idx).open();
    }

    private renderScheduledTweetList(containerEl: HTMLElement) {
        // TODO: ここに予約投稿リストの描画ロジックを実装する
        containerEl.empty();
        containerEl.createEl('p', { text: '（予約投稿リストはここに表示されます）' });
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
        const lang = (this.plugin.settings.language || 'ja') as import('./i18n').Language;
        new Setting(contentEl).setName(this.group ? t(lang, 'editGroup') : t(lang, 'addNewGroup')).setHeading();
        let name = this.group?.name || '';
        let boardIds = new Set(this.group?.boardIds || []);

        new Setting(contentEl)
            .setName(t(lang, 'groupName'))
            .setDesc(t(lang, 'groupNameDesc'))
            .addText(text => {
                text.setPlaceholder(t(lang, 'groupNamePlaceholder'))
                    .setValue(name)
                    .onChange(v => { name = v; });
            });

        new Setting(contentEl).setName(t(lang, 'selectBoards')).setDesc(t(lang, 'selectBoardsDesc'));
        const boardButtonsEl = contentEl.createDiv({ cls: 'wb-board-buttons-container' });

        const renderBoardButtons = () => {
            boardButtonsEl.empty();
            this.plugin.settings.boards.forEach(b => {
                const isSelected = boardIds.has(b.id);
                const btn = boardButtonsEl.createEl('button', {
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
                btn.setText(b.name);
                btn.onclick = () => {
                    if (isSelected) {
                        boardIds.delete(b.id);
                    } else {
                        boardIds.add(b.id);
                    }
                    renderBoardButtons();
                };
            });
        };
        renderBoardButtons();

        const btnRow = contentEl.createDiv({ cls: 'modal-button-row', attr: { style: 'display:flex;justify-content:flex-end;gap:12px;margin-top:24px;' } });

        new Setting(btnRow)
            .addButton(btn => btn.setButtonText(t(lang, 'save')).setCta().onClick(async () => {
                if (!name.trim()) {
                    new Notice(t(lang, 'enterGroupName'));
                    return;
                }
                if (boardIds.size === 0) {
                    new Notice(t(lang, 'selectOneBoardAtLeast'));
                    return;
                }
                const newGroup = {
                    id: this.group?.id || 'group-' + Date.now(),
                    name: name.trim(),
                    boardIds: Array.from(boardIds),
                    hotkey: this.group?.hotkey // 既存値は維持（UIからは編集不可）
                };
                if (this.editIdx !== undefined) {
                    this.plugin.settings.boardGroups![this.editIdx] = newGroup;
                } else {
                    this.plugin.settings.boardGroups = [...(this.plugin.settings.boardGroups || []), newGroup];
                }
                await this.plugin.saveSettings();
                this.plugin.registerAllBoardCommands?.();
                this.onSave();
                this.close();
            }))
            .addButton(btn => btn.setButtonText(t(lang, 'cancel')).onClick(() => this.close()));
    }
}

class ScheduleTweetModal extends Modal {
    plugin: WidgetBoardPlugin;
    repo: TweetRepository;
    sched?: ScheduledTweet;
    idx?: number;
    onSave: () => void;

    constructor(app: App, plugin: WidgetBoardPlugin, onSave: () => void, sched?: ScheduledTweet, idx?: number) {
        super(app);
        this.plugin = plugin;
        this.repo = new TweetRepository(app, getTweetDbPath(plugin)); // 引数を修正
        this.sched = sched;
        this.idx = idx;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        const lang = (this.plugin.settings.language || 'ja') as import('./i18n').Language;
        new Setting(contentEl).setName(this.sched ? t(lang, 'editScheduledTweet') : t(lang, 'addScheduledTweet')).setHeading();
        let text = this.sched ? this.sched.text : '';
        let hour = this.sched ? this.sched.hour : 9;
        let minute = this.sched ? this.sched.minute : 0;
        let daysArr: number[] = this.sched ? this.sched.daysOfWeek || [] : [];
        let start = this.sched && this.sched.startDate ? this.sched.startDate : '';
        let end = this.sched && this.sched.endDate ? this.sched.endDate : '';
        let userId = this.sched && this.sched.userId ? this.sched.userId : '@you';
        let aiPrompt = this.sched && this.sched.aiPrompt ? this.sched.aiPrompt : '';
        let aiModel = this.sched && this.sched.aiModel ? this.sched.aiModel : (this.plugin.settings.tweetAiModel || 'gemini-1.5-flash-latest');
        // 内容入力欄（テキストエリア）
        new Setting(contentEl)
        .setName(t(lang, 'content'))
        .addTextArea(t => {
            t.setValue(text);
            t.onChange(v => { text = v; });
        });
        // ユーザーID（ドロップダウン選択に変更）
        new Setting(contentEl)
            .setName(t(lang, 'userId'))
            .setDesc(t(lang, 'userIdSelectDesc'))
            .addDropdown(drop => {
                const profiles = this.plugin.settings.userProfiles || [];
                profiles.forEach(p => {
                    drop.addOption(p.userId, `${p.userName || p.userId} (${p.userId})`);
                });
                drop.setValue(userId);
                drop.onChange(v => { userId = v; });
            });
        // 時刻入力欄（時:分 形式のテキスト入力）
        let timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        new Setting(contentEl)
            .setName(t(lang, 'time'))
            .setDesc(t(lang, 'timeDesc'))
            .addText(text => { // 't' を 'text' に変更
                text.setPlaceholder('09:00');
                text.setValue(timeStr);
                text.onChange(v => { timeStr = v; });
                text.inputEl.addEventListener('blur', () => {
                    const match = timeStr.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
                    if (match) {
                        hour = parseInt(match[1], 10);
                        minute = parseInt(match[2], 10);
                        // 正常
                        text.setValue(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
                    } else {
                        // 不正な場合は直前の値に戻す
                        text.setValue(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
                        new Notice(t(lang, 'invalidTimeFormat'));
                    }
                });
            });

        // 曜日選択
        new Setting(contentEl)
            .setName(t(lang, 'daysOfWeek'))
            .setDesc(t(lang, 'daysOfWeekDesc'));
        const dayChecksEl = contentEl.createDiv({cls: 'day-checkboxes'});
        const dayLabels = [t(lang, 'sunday'),t(lang, 'monday'),t(lang, 'tuesday'),t(lang, 'wednesday'),t(lang, 'thursday'),t(lang, 'friday'),t(lang, 'saturday')];
        dayLabels.forEach((label, i) => {
            const labelEl = dayChecksEl.createEl('label');
            const cb = labelEl.createEl('input', { type: 'checkbox' });
            cb.id = 'weekday-' + i;
            cb.checked = daysArr.includes(i);
            cb.onchange = () => {
                if (cb.checked) {
                    if (!daysArr.includes(i)) daysArr.push(i);
                } else {
                    daysArr = daysArr.filter(d => d !== i);
                }
            };
            labelEl.textContent = label;
            labelEl.style.marginLeft = '8px';
            dayChecksEl.appendChild(labelEl);
        });

        // 開始日
        new Setting(contentEl)
            .setName(t(lang, 'startDate'))
            .setDesc(t(lang, 'startDateDesc'))
            .addText(t => {
                t.setPlaceholder('YYYY-MM-DD');
                t.inputEl.type = 'date';
                t.onChange(v => { start = v; });
            });
        // 終了日
        new Setting(contentEl)
            .setName(t(lang, 'endDate'))
            .setDesc(t(lang, 'endDateDesc'))
            .addText(t => {
                t.setPlaceholder('YYYY-MM-DD');
                t.inputEl.type = 'date';
                t.onChange(v => { end = v; });
            });

        // AIプロンプト入力欄
        new Setting(contentEl)
            .setName(t(lang, 'aiPrompt'))
            .setDesc(t(lang, 'aiPromptDesc'))
            .addTextArea(t => {
                t.setValue(aiPrompt);
                t.onChange(v => { aiPrompt = v; });
            });
        // AIモデル選択欄
        new Setting(contentEl)
            .setName(t(lang, 'aiModel'))
            .setDesc(t(lang, 'aiModelDesc'))
            .addText(t => {
                t.setPlaceholder('例: gemini-1.5-flash-latest');
                t.setValue(aiModel);
                t.onChange(v => { aiModel = v; });
            });

        const btnRow = contentEl.createDiv({ cls: 'modal-button-row', attr: { style: 'display:flex;justify-content:flex-end;gap:12px;margin-top:24px;' } });
        new Setting(btnRow)
            .addButton(btn => btn.setButtonText(this.sched ? t(lang, 'update') : t(lang, 'add')).setCta().onClick(async () => {
                if (!text.trim()) { new Notice(t(lang, 'enterContent')); return; }
                const opts: ScheduleOptions = { hour, minute };
                if (daysArr.length > 0) opts.daysOfWeek = daysArr;
                if (start.trim()) opts.startDate = start.trim();
                if (end.trim()) opts.endDate = end.trim();
                const next = computeNextTime(opts);
                if (next === null) { new Notice(t(lang, 'cannotCalculateNextPost')); return; }
                const sched: ScheduledTweet = {
                    id: this.sched ? this.sched.id : 'sch-' + Date.now() + '-' + Math.random().toString(36).slice(2,8),
                    text: text.trim(),
                    hour: opts.hour,
                    minute: opts.minute,
                    daysOfWeek: opts.daysOfWeek,
                    startDate: opts.startDate,
                    endDate: opts.endDate,
                    nextTime: next,
                    userId: userId && userId.trim() ? userId.trim() : '@you',
                    aiPrompt: aiPrompt?.trim() || undefined,
                    aiModel: aiModel?.trim() || undefined,
                };
                const settings = await this.repo.load();
                if (!Array.isArray(settings.scheduledPosts)) settings.scheduledPosts = [];
                if (this.sched) {
                    if (!settings.scheduledPosts) settings.scheduledPosts = [];
                    settings.scheduledPosts[this.idx!] = sched;
                } else {
                    if (!settings.scheduledPosts) settings.scheduledPosts = [];
                    settings.scheduledPosts.push(sched);
                }
                await this.repo.save(settings);
                new Notice(this.sched ? t(lang, 'scheduledTweetUpdated') : t(lang, 'scheduledTweetAdded'));
                this.onSave();
                this.close();
            }))
            .addButton(btn => btn.setButtonText(t(lang, 'cancel')).onClick(() => this.close()));
    }
}

function getTweetDbPath(plugin: WidgetBoardPlugin): string {
    const { baseFolder } = plugin.settings;
    if (baseFolder) {
        const folder = baseFolder.endsWith('/') ? baseFolder.slice(0, -1) : baseFolder;
        return `${folder}/tweets.json`;
    }
    return 'tweets.json';
}
