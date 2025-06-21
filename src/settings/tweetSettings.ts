import { App, Modal, Notice, Setting } from 'obsidian';
import type WidgetBoardPlugin from '../main';
import { createAccordion } from '../utils/uiHelpers';
import { TweetRepository } from '../widgets/tweetWidget';
import { computeNextTime, ScheduleOptions } from '../widgets/tweetWidget/scheduleUtils';
import type { ScheduledTweet } from '../widgets/tweetWidget/types';
import { t } from '../i18n';
import type { WidgetBoardSettingTab } from '../settingsTab';

export function renderTweetWidgetSettings(tab: WidgetBoardSettingTab, containerEl: HTMLElement) {
        const lang = tab.plugin.settings.language || 'ja';
        const tweetGlobalAcc = createAccordion(containerEl, t(lang, 'tweetWidgetGlobalSettings'), false);
        // ユーザー一覧セクションのみ先に切り出し
        new Setting(tweetGlobalAcc.body).setName(t(lang, 'userListGlobal')).setHeading();
        const userListDiv = tweetGlobalAcc.body.createDiv({ cls: 'tweet-user-list-table' });
        const renderUserList = () => {
            userListDiv.empty();
            if (!tab.plugin.settings.userProfiles) tab.plugin.settings.userProfiles = [];
            if (!tab.plugin.settings.userProfiles.some(p => p.userId === '@you')) {
                tab.plugin.settings.userProfiles.unshift({ userName: 'あなた', userId: '@you', avatarUrl: '' });
            }
            const table = userListDiv.createEl('table', { cls: 'tweet-user-table' });
            const thead = table.createEl('thead');
            const headerRow = thead.createEl('tr');
            [t(lang, 'userName'), t(lang, 'userId'), t(lang, 'avatarUrl'), ''].forEach(h => headerRow.createEl('th', { text: h }));
            const tbody = table.createEl('tbody');
            (tab.plugin.settings.userProfiles || []).forEach((profile, idx) => {
                const isSelf = profile.userId === '@you';
                const row = tbody.createEl('tr');
                const nameTd = row.createEl('td');
                const nameInput = nameTd.createEl('input', { type: 'text', value: profile.userName || '', placeholder: '例: あなた' });
                nameInput.onchange = async () => {
                    if (!tab.plugin.settings.userProfiles) tab.plugin.settings.userProfiles = [];
                    tab.plugin.settings.userProfiles[idx].userName = nameInput.value;
                    await tab.plugin.saveSettings();
                };
                const idTd = row.createEl('td');
                const idInput = idTd.createEl('input', { type: 'text', value: profile.userId || '', placeholder: '例: @you' });
                if (isSelf) idInput.disabled = true;
                idInput.onchange = async () => {
                    if (!tab.plugin.settings.userProfiles) tab.plugin.settings.userProfiles = [];
                    tab.plugin.settings.userProfiles[idx].userId = idInput.value;
                    await tab.plugin.saveSettings();
                };
                const avatarTd = row.createEl('td');
                const avatarInput = avatarTd.createEl('input', { type: 'text', value: profile.avatarUrl || '', placeholder: 'https://example.com/avatar.png' });
                avatarInput.onchange = async () => {
                    if (!tab.plugin.settings.userProfiles) tab.plugin.settings.userProfiles = [];
                    tab.plugin.settings.userProfiles[idx].avatarUrl = avatarInput.value;
                    await tab.plugin.saveSettings();
                };
                const delTd = row.createEl('td');
                if (!isSelf) {
                    const delBtn = delTd.createEl('button', { text: t(lang, 'delete'), cls: 'mod-warning' });
                    delBtn.onclick = async () => {
                        if (!tab.plugin.settings.userProfiles) tab.plugin.settings.userProfiles = [];
                        tab.plugin.settings.userProfiles.splice(idx, 1);
                        await tab.plugin.saveSettings();
                        renderUserList();
                    };
                }
            });
            const addTr = tbody.createEl('tr');
            addTr.createEl('td', { attr: { colspan: 4 } });
            const addBtn = addTr.createEl('button', { text: t(lang, 'addUser'), cls: 'mod-cta' });
            addBtn.onclick = async () => {
                if (!tab.plugin.settings.userProfiles) tab.plugin.settings.userProfiles = [];
                tab.plugin.settings.userProfiles.push({ userName: '', userId: '', avatarUrl: '' });
                await tab.plugin.saveSettings();
                renderUserList();
            };
        };
        renderUserList();

        // --- AIリプライ発火上限設定 ---
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyTriggerless'))
            .setDesc('ONにすると「@ai」や「#ai-reply」などのトリガーワードがなくても、全ての投稿がAIリプライ候補になります。')
            .addToggle(toggle => {
                toggle.setValue(tab.plugin.settings.aiReplyTriggerless ?? false)
                    .onChange(async (value) => {
                        tab.plugin.settings.aiReplyTriggerless = value;
                        await tab.plugin.saveSettings();
                    });
            });
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyRpm'))
            .setDesc(t(lang, 'aiReplyRpmDesc'))
            .addText(text => {
                text.setPlaceholder('-1（無制限）')
                    .setValue(String(tab.plugin.settings.aiReplyRpm ?? 2))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n)) n = 2;
                        tab.plugin.settings.aiReplyRpm = n;
                        await tab.plugin.saveSettings();
                    });
            });
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyRpd'))
            .setDesc(t(lang, 'aiReplyRpdDesc'))
            .addText(text => {
                text.setPlaceholder('-1（無制限）')
                    .setValue(String(tab.plugin.settings.aiReplyRpd ?? 10))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n)) n = 10;
                        tab.plugin.settings.aiReplyRpd = n;
                        await tab.plugin.saveSettings();
                    });
            });
        // ユーザーアイコンURL
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'userIconUrl'))
            .setDesc(t(lang, 'userIconUrlDesc'))
            .addText(text => {
                text.setPlaceholder('https://example.com/avatar.png')
                    .setValue(tab.plugin.settings.tweetWidgetAvatarUrl || '')
                    .onChange(async () => {
                        // 入力途中は何もしない
                    });
                text.inputEl.addEventListener('blur', async () => {
                    const v = text.inputEl.value.trim();
                    tab.plugin.settings.tweetWidgetAvatarUrl = v;
                    await tab.plugin.saveSettings();
                    tab.plugin.settings.boards.forEach(board => {
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
                toggle.setValue(tab.plugin.settings.showAiHistory ?? false)
                    .onChange(async (value) => {
                        tab.plugin.settings.showAiHistory = value;
                        await tab.plugin.saveSettings();
                    });
            });
        // AIアバター画像URLリスト
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiAvatarUrls'))
            .setDesc(t(lang, 'aiAvatarUrlsDesc'))
            .addTextArea(text => {
                text.setPlaceholder('https://example.com/ai1.png, https://example.com/ai2.png')
                    .setValue(tab.plugin.settings.aiAvatarUrls || '')
                    .onChange(async (v) => {
                        tab.plugin.settings.aiAvatarUrls = v;
                        await tab.plugin.saveSettings();
                    });
            });
        // --- AIリプライ遅延設定 ---
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyDelayMin'))
            .setDesc(t(lang, 'aiReplyDelayMinDesc'))
            .addText(text => {
                text.setPlaceholder('1500')
                    .setValue(String(tab.plugin.settings.aiReplyDelayMinMs ?? 1500))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n) || n < 0) n = 1500;
                        tab.plugin.settings.aiReplyDelayMinMs = n;
                        await tab.plugin.saveSettings();
                    });
            });
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'aiReplyDelayMax'))
            .setDesc(t(lang, 'aiReplyDelayMaxDesc'))
            .addText(text => {
                text.setPlaceholder('7000')
                    .setValue(String(tab.plugin.settings.aiReplyDelayMaxMs ?? 7000))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n) || n < 0) n = 7000;
                        tab.plugin.settings.aiReplyDelayMaxMs = n;
                        await tab.plugin.saveSettings();
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
                dropdown.setValue(tab.plugin.settings.defaultTweetPeriod || 'all')
                    .onChange(async (value) => {
                        tab.plugin.settings.defaultTweetPeriod = value;
                        await tab.plugin.saveSettings();
                    });
            });
        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'tweetDefaultCustomDays'))
            .setDesc(t(lang, 'tweetDefaultCustomDaysDesc'))
            .addText(text => {
                text.setPlaceholder('1')
                    .setValue(String(tab.plugin.settings.defaultTweetCustomDays ?? 1))
                    .onChange(async (v) => {
                        let n = parseInt(v, 10);
                        if (isNaN(n) || n < 1) n = 1;
                        tab.plugin.settings.defaultTweetCustomDays = n;
                        await tab.plugin.saveSettings();
                    });
            });

        new Setting(tweetGlobalAcc.body)
            .setName(t(lang, 'addScheduledTweet'))
            .setDesc(t(lang, 'addScheduledTweetDesc'))
            .addButton(btn => btn.setButtonText(t(lang, 'add')).setCta().onClick(() => {
                openScheduleTweetModal(tab);
            }));

        // 予約投稿一覧表示・削除
        (async () => {
            const repo = new TweetRepository(tab.app, getTweetDbPath(tab.plugin));
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
                    const actions = item.createDiv({ cls: 'scheduled-tweet-actions' });
                    const editBtn = actions.createEl('button', { text: t(lang, 'edit'), cls: 'scheduled-tweet-edit-btn' });
                    editBtn.onclick = () => {
                        openScheduleTweetModal(tab, sched, idx);
                    };
                    const delBtn = actions.createEl('button', { text: t(lang, 'delete'), cls: 'scheduled-tweet-delete-btn' });
                    delBtn.onclick = async () => {
                        if (!confirm(t(lang, 'deleteScheduledPostConfirm'))) return;
                        scheduledPosts.splice(idx, 1);
                        await repo.save({ ...settings, scheduledPosts });
                        new Notice(t(lang, 'scheduledPostDeleted'));
                        listDiv.remove();
                        tab.display();
                    };
                });
            }
        })();
    }
export function openScheduleTweetModal(tab: WidgetBoardSettingTab, sched?: ScheduledTweet, idx?: number) {
        const onSave = () => {
            const scheduledListDiv = tab.containerEl.querySelector('.scheduled-tweet-list') as HTMLElement;
            if (scheduledListDiv) {
                renderScheduledTweetList(tab,scheduledListDiv);
            }
        };
        new ScheduleTweetModal(tab.app, tab.plugin, onSave, sched, idx).open();
    }

export function renderScheduledTweetList(tab: WidgetBoardSettingTab, containerEl: HTMLElement) {
        // TODO: ここに予約投稿リストの描画ロジックを実装する
        containerEl.empty();
        containerEl.createEl('p', { text: '（予約投稿リストはここに表示されます）' });
    }
export class ScheduleTweetModal extends Modal {
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
        const lang = this.plugin.settings.language || 'ja';
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
            .setName(t('time'))
            .setDesc(t('timeDesc'))
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
                        new Notice(t('invalidTimeFormat'));
                    }
                });
            });

        // 曜日選択
        new Setting(contentEl)
            .setName(t('daysOfWeek'))
            .setDesc(t('daysOfWeekDesc'));
        const dayChecksEl = contentEl.createDiv({cls: 'day-checkboxes'});
        const dayLabels = [t('sunday'),t('monday'),t('tuesday'),t('wednesday'),t('thursday'),t('friday'),t('saturday')];
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
            .setName(t('startDate'))
            .setDesc(t('startDateDesc'))
            .addText(t => {
                t.setPlaceholder('YYYY-MM-DD');
                t.inputEl.type = 'date';
                t.onChange(v => { start = v; });
            });
        // 終了日
        new Setting(contentEl)
            .setName(t('endDate'))
            .setDesc(t('endDateDesc'))
            .addText(t => {
                t.setPlaceholder('YYYY-MM-DD');
                t.inputEl.type = 'date';
                t.onChange(v => { end = v; });
            });

        // AIプロンプト入力欄
        new Setting(contentEl)
            .setName(t('aiPrompt'))
            .setDesc(t('aiPromptDesc'))
            .addTextArea(t => {
                t.setValue(aiPrompt);
                t.onChange(v => { aiPrompt = v; });
            });
        // AIモデル選択欄
        new Setting(contentEl)
            .setName(t('aiModel'))
            .setDesc(t('aiModelDesc'))
            .addText(t => {
                t.setPlaceholder('例: gemini-1.5-flash-latest');
                t.setValue(aiModel);
                t.onChange(v => { aiModel = v; });
            });

        const btnRow = contentEl.createDiv({ cls: 'modal-button-row', attr: { style: 'display:flex;justify-content:flex-end;gap:12px;margin-top:24px;' } });
        new Setting(btnRow)
            .addButton(btn => btn.setButtonText(this.sched ? t('update') : t('add')).setCta().onClick(async () => {
                if (!text.trim()) { new Notice(t('enterContent')); return; }
                const opts: ScheduleOptions = { hour, minute };
                if (daysArr.length > 0) opts.daysOfWeek = daysArr;
                if (start.trim()) opts.startDate = start.trim();
                if (end.trim()) opts.endDate = end.trim();
                const next = computeNextTime(opts);
                if (next === null) { new Notice(t('cannotCalculateNextPost')); return; }
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
                new Notice(this.sched ? t('scheduledTweetUpdated') : t('scheduledTweetAdded'));
                this.onSave();
                this.close();
            }))
            .addButton(btn => btn.setButtonText(t('cancel')).onClick(() => this.close()));
    }
}

export function getTweetDbPath(plugin: WidgetBoardPlugin): string {
    const { baseFolder } = plugin.settings;
    if (baseFolder) {
        const folder = baseFolder.endsWith('/') ? baseFolder.slice(0, -1) : baseFolder;
        return `${folder}/tweets.json`;
    }
    return 'tweets.json';
}
