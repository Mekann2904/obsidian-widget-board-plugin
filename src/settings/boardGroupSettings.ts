import { App, Modal, Notice, Setting } from 'obsidian';
import type WidgetBoardPlugin from '../main';
import type { BoardConfiguration, BoardGroup, WidgetConfig } from '../interfaces';
import { DEFAULT_BOARD_CONFIGURATION } from '../settingsDefaults';
import { WidgetBoardModal } from '../modal';
import {
    DEFAULT_POMODORO_SETTINGS,
    PomodoroSettings,
    PomodoroExportFormat,
} from '../widgets/pomodoro';
import { DEFAULT_MEMO_SETTINGS, MemoWidgetSettings } from '../widgets/memo';
import { DEFAULT_CALENDAR_SETTINGS } from '../settingsDefaults';
import type { CalendarWidgetSettings } from '../widgets/calendar';
import { DEFAULT_RECENT_NOTES_SETTINGS } from '../widgets/recent-notes';
import { DEFAULT_TIMER_STOPWATCH_SETTINGS } from '../widgets/timer-stopwatch';
import { DEFAULT_TWEET_WIDGET_SETTINGS } from '../widgets/tweetWidget/constants';
import { REFLECTION_WIDGET_DEFAULT_SETTINGS } from '../widgets/reflectionWidget/constants';
import { widgetTypeName, t } from '../i18n';
import type { Language } from '../i18n';
import { createAccordion } from '../utils/uiHelpers';
import type { WidgetBoardSettingTab } from '../settingsTab';

export function renderBoardManagementSection(tab: WidgetBoardSettingTab, containerEl: HTMLElement, lang: Language) {
        const boardManagementAcc = createAccordion(containerEl, t(lang, 'boardManagement'), false); // デフォルトで閉じる
        renderBoardManagementUI(boardManagementAcc.body, tab, lang); // langを渡す
        // --- 選択されたボードの詳細設定をボード管理アコーディオン内に表示 ---
        const boardDetailContainer = boardManagementAcc.body.createDiv({ cls: 'selected-board-settings-section' });
        if (tab.selectedBoardId) {
            renderSelectedBoardSettingsUI(boardDetailContainer, tab, lang);
        } else {
            const msg = tab.plugin.settings.boards.length === 0 ? t(lang, 'noBoards') : t(lang, 'selectBoardToConfig');
            boardDetailContainer.createEl('p', { text: msg });
        }
    }

export function renderBoardGroupSection(tab: WidgetBoardSettingTab, containerEl: HTMLElement, lang: Language) {
        const boardGroupAcc = createAccordion(containerEl, t(lang, 'boardGroupManagement'), false);
        tab.boardGroupBodyEl = boardGroupAcc.body;
        renderBoardGroupManagementUI(tab.boardGroupBodyEl, tab, lang); // langを渡す
    }

    /**
     * ボード管理セクションのUIを描画
     * @param containerEl 描画先要素
     * @param lang 表示言語
     */
export function renderBoardManagementUI(containerEl: HTMLElement, tab: WidgetBoardSettingTab, lang: import('../i18n').Language) { // langを受け取る
        containerEl.empty();

        new Setting(containerEl)
            .setName(t(lang, 'boardSelect'))
            .setDesc(t(lang, 'boardSelectDesc'))
            .addDropdown(dropdown => {
                if (tab.plugin.settings.boards.length === 0) {
                    dropdown.addOption('', t(lang, 'noBoardsAvailable')); // ダミーオプション
                    dropdown.setDisabled(true);
                } else {
                    tab.plugin.settings.boards.forEach(board => {
                        dropdown.addOption(board.id, board.name);
                    });
                    dropdown.setValue(tab.selectedBoardId || tab.plugin.settings.boards[0].id);
                }
                // ここで参照を保存
                tab.boardDropdownEl = dropdown.selectEl;
                dropdown.onChange(value => {
                    tab.selectedBoardId = value;
                    tab.plugin.settings.lastOpenedBoardId = value;
                    tab.plugin.saveSettings();
                    // ボード詳細設定セクションの内容を更新
                    const selectedBoardSettingsContainer = tab.containerEl.querySelector('.selected-board-settings-section');
                    if (selectedBoardSettingsContainer) {
                        renderSelectedBoardSettingsUI(selectedBoardSettingsContainer as HTMLElement, tab, lang); // langを渡す
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
                        name: `新しいボード ${tab.plugin.settings.boards.length + 1}`,
                        widgets: []
                    };
                    tab.plugin.settings.boards.push(newBoard);
                    tab.selectedBoardId = newBoardId;
                    tab.plugin.settings.lastOpenedBoardId = newBoardId;
                    await tab.plugin.saveSettings();
                    // boardDropdownElを直接操作
                    if (tab.boardDropdownEl) {
                        const option = document.createElement('option');
                        option.value = newBoardId;
                        option.textContent = newBoard.name;
                        tab.boardDropdownEl.appendChild(option);
                        tab.boardDropdownEl.value = newBoardId;
                    }
                    // ボード詳細設定セクションだけ再描画
                    const selectedBoardSettingsContainer = tab.containerEl.querySelector('.selected-board-settings-section');
                    if (selectedBoardSettingsContainer) {
                        renderSelectedBoardSettingsUI(selectedBoardSettingsContainer as HTMLElement, tab, tab.plugin.settings.language || 'ja');
                    }
                    renderBoardManagementUI(containerEl, tab, lang); // UIを再描画
                    renderSelectedBoardSettingsUI(
                        tab.containerEl.querySelector('.selected-board-settings-section') as HTMLElement,
                        tab,
                        lang
                    );
                }));
    }

    /**
     * 選択中ボードの詳細設定UIを描画
     * @param containerEl 描画先要素
     */
export function renderSelectedBoardSettingsUI(containerEl: HTMLElement, tab: WidgetBoardSettingTab, lang: import('../i18n').Language) {
        containerEl.empty();
        const board = tab.plugin.settings.boards.find(b => b.id === tab.selectedBoardId);
        if (!board) {
            const msg = tab.plugin.settings.boards.length === 0 ? t(lang, 'noBoards') : t(lang, 'selectBoardToConfig');
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
                    await tab.plugin.saveSettings(board.id);
                    // boardDropdownElを直接操作
                    if (tab.boardDropdownEl) {
                        for (const option of Array.from(tab.boardDropdownEl.options)) {
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
                        await tab.plugin.saveSettings(board.id);
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
                        await tab.plugin.saveSettings(board.id);
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
                    await tab.plugin.saveSettings(board.id);
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
                .setDisabled(tab.plugin.settings.boards.length <= 1)
                .onClick(async () => {
                    if (!confirm(t(lang, 'deleteBoardConfirm').replace('{name}', board.name))) return;
                    tab.plugin.settings.boards = tab.plugin.settings.boards.filter(b => b.id !== tab.selectedBoardId);
                    const newSelectedBoardId = tab.plugin.settings.boards.length > 0 ? tab.plugin.settings.boards[0].id : null;
                    tab.selectedBoardId = newSelectedBoardId;
                    tab.plugin.settings.lastOpenedBoardId = newSelectedBoardId === null ? undefined : newSelectedBoardId;
                    await tab.plugin.saveSettings();
                    // boardDropdownElを直接操作
                    if (tab.boardDropdownEl) {
                        for (const option of Array.from(tab.boardDropdownEl.options)) {
                            if (option.value === board.id) {
                                tab.boardDropdownEl.removeChild(option);
                            }
                        }
                        tab.boardDropdownEl.value = tab.selectedBoardId || '';
                    }
                    // ボード詳細設定セクションだけ再描画
                    const selectedBoardSettingsContainer = tab.containerEl.querySelector('.selected-board-settings-section');
                    if (selectedBoardSettingsContainer) {
                        renderSelectedBoardSettingsUI(selectedBoardSettingsContainer as HTMLElement, tab, tab.plugin.settings.language || 'ja');
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
            lang: import('../i18n').Language
        ) => {
            const settingItem = new Setting(addWidgetButtonsContainer);
            settingItem.addButton(button => button
                .setButtonText(buttonText)
                .setCta()
                .onClick(async () => {
                    if (!tab.selectedBoardId) return;
                    const currentBoard = tab.plugin.settings.boards.find(b => b.id === tab.selectedBoardId);
                    if (!currentBoard) return;
                    const newWidget: WidgetConfig = {
                        id: `${widgetType}-widget-${Date.now()}`,
                        type: widgetType,
                        title: '',
                        settings: { ...defaultWidgetSettings }
                    };
                    currentBoard.widgets.push(newWidget);
                    await tab.plugin.saveSettings(currentBoard.id);
                    renderWidgetListForBoard(widgetListEl, tab, currentBoard, lang); // widgetListEl は既に定義済み
                    const widgetDisplayName = widgetTypeName(tab.plugin.settings.language || 'ja', widgetType); // 通知用にも表示名を使用
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

        renderWidgetListForBoard(widgetListEl, tab, board, lang);
    }

export function renderWidgetListForBoard(containerEl: HTMLElement, tab: WidgetBoardSettingTab, board: BoardConfiguration, lang: import('../i18n').Language) {
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
                    await tab.plugin.saveSettings(board.id);
                    // タイトル変更時も同様のロジックで表示名を更新
                    const updatedDisplayName = widget.title || t(lang, 'untitledWidget').replace('{type}', typeName);
                    titleSetting.setName(updatedDisplayName);
                    notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, widget.settings as unknown as Record<string, unknown>);
                });
            });

            titleSetting
                .addExtraButton(cb => cb.setIcon('arrow-up').setTooltip(t(lang, 'moveUp')).setDisabled(index === 0)
                    .onClick(async () => {
                        if (index > 0) {
                            const item = board.widgets.splice(index, 1)[0];
                            board.widgets.splice(index - 1, 0, item);
                            await tab.plugin.saveSettings(board.id);
                            renderWidgetListForBoard(containerEl, tab, board, lang);
                        }
                    }))
                .addExtraButton(cb => cb.setIcon('arrow-down').setTooltip(t(lang, 'moveDown')).setDisabled(index === widgets.length - 1)
                    .onClick(async () => {
                        if (index < board.widgets.length - 1) {
                            const item = board.widgets.splice(index, 1)[0];
                            board.widgets.splice(index + 1, 0, item);
                            await tab.plugin.saveSettings(board.id);
                            renderWidgetListForBoard(containerEl, tab, board, lang);
                        }
                    }))
                .addButton(button => button.setIcon("trash").setTooltip(t(lang, 'deleteWidget')).setWarning()
                    .onClick(async () => {
                        // 削除時の通知メッセージも同様のロジックで表示名を生成
                        const oldWidgetTypeName = widgetTypeName(tab.plugin.settings.language || 'ja', widget.type);
                        const oldTitle = widget.title || t(lang, 'untitledWidget').replace('{type}', oldWidgetTypeName);
                        board.widgets.splice(index, 1);
                        await tab.plugin.saveSettings(board.id);
                        renderWidgetListForBoard(containerEl, tab, board, lang);
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
                                    await tab.plugin.saveSettings(board.id);
                                    notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
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
                            await tab.plugin.saveSettings(board.id);
                            notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
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
                            await tab.plugin.saveSettings(board.id);
                            notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, widget.settings as unknown as Record<string, unknown>);
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
                                await tab.plugin.saveSettings(board.id);
                                notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
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
                                await tab.plugin.saveSettings(board.id);
                                notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
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
                                await tab.plugin.saveSettings(board.id);
                                notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
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
                                await tab.plugin.saveSettings(board.id);
                                notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
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
                            await tab.plugin.saveSettings(board.id);
                            notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, widget.settings as unknown as Record<string, unknown>);
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
                                await tab.plugin.saveSettings(board.id);
                                notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
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
                            await tab.plugin.saveSettings(board.id);
                            notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
                        });
                    });
                new Setting(reflectionDetailBody)
                    .setName('手動発火ボタンを表示')
                    .setDesc('ONにすると、ウィジェット内に「まとめ生成」ボタンが表示されます。')
                    .addToggle(toggle => {
                        toggle.setValue(currentSettings.aiSummaryManualEnabled ?? true)
                            .onChange(async (value) => {
                                currentSettings.aiSummaryManualEnabled = value;
                                await tab.plugin.saveSettings(board.id);
                                notifyWidgetInstanceIfBoardOpen(tab, board.id, widget.id, widget.type, currentSettings as unknown as Record<string, unknown>);
                            });
                    });
            }
        });
    }

export function notifyWidgetInstanceIfBoardOpen(tab: WidgetBoardSettingTab, 
        boardId: string,
        widgetId: string,
        widgetType: string,
        newSettings: Record<string, unknown>
    ) {
        const modal = tab.plugin.widgetBoardModals?.get(boardId);
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
export function renderBoardGroupManagementUI(containerEl: HTMLElement, tab: WidgetBoardSettingTab, lang: import('../i18n').Language) {
        containerEl.empty();
        new Setting(containerEl)
            .setName(t(lang, 'boardGroupManagement'))
            .setDesc(t(lang, 'boardGroupManagementDesc'))
            .addButton(btn => btn
                .setButtonText(t(lang, 'addNewGroup'))
                .setCta()
                .onClick(() => {
                    openBoardGroupEditModal(tab, lang, undefined, undefined); // langを渡す
                }));

        const listEl = containerEl.createDiv({ cls: 'wb-board-group-list' });
        const groups = tab.plugin.settings.boardGroups;
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
                    openBoardGroupEditModal(tab, lang, group, index); // langを渡す
                }))
                .addButton(btn => btn.setIcon('trash').setTooltip(t(lang, 'deleteGroup')).setWarning().onClick(async () => {
                    if (!confirm(t(lang, 'deleteGroupConfirm').replace('{name}', group.name))) return;
                    tab.plugin.settings.boardGroups.splice(index, 1);
                    await tab.plugin.saveSettings();
                    renderBoardGroupManagementUI(containerEl, tab, lang); // langを渡す
                    tab.plugin.registerAllBoardCommands?.();
                }));
        });
    }

export function openBoardGroupEditModal(tab: WidgetBoardSettingTab, lang: import('../i18n').Language, group?: import('../interfaces').BoardGroup, editIdx?: number) {
        const onSave = () => {
            if (tab.boardGroupBodyEl) {
                renderBoardGroupManagementUI(tab.boardGroupBodyEl, tab, lang); // langを渡す
            }
        };
        new BoardGroupEditModal(tab.plugin.app, tab.plugin, onSave, group, editIdx).open();
    }
export class BoardGroupEditModal extends Modal {
    plugin: WidgetBoardPlugin;
    group?: import('../interfaces').BoardGroup;
    editIdx?: number;
    onSave: () => void;
    constructor(app: App, plugin: WidgetBoardPlugin, onSave: () => void, group?: import('../interfaces').BoardGroup, editIdx?: number) {
        super(app);
        this.plugin = plugin;
        this.group = group;
        this.editIdx = editIdx;
        this.onSave = onSave;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        const lang = (this.plugin.settings.language || 'ja') as import('../i18n').Language;
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
