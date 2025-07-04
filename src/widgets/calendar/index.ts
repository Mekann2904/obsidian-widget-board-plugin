// src/widgets/calendarWidget.ts
import { App, setIcon, Setting, normalizePath, TFile } from 'obsidian';
import { DEFAULT_CALENDAR_SETTINGS } from '../../settings/defaultWidgetSettings';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main';
import { debugLog } from '../../utils/logger';
import { applyWidgetSize, createWidgetContainer, pad2 } from '../../utils';
import moment from 'moment';
import { t } from '../../i18n';

// --- カレンダーウィジェット設定インターフェース ---
export interface CalendarWidgetSettings {
    dailyNoteFormat?: string; 
    // 将来的に開始曜日などを追加可能
}

/**
 * カレンダーウィジェット
 * - 月表示、日付強調、差分更新UI
 */
export class CalendarWidget implements WidgetImplementation {
    id = 'calendar';
    public config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin; // plugin は型だけ保持し、実際には使わない場合もある
    private widgetEl!: HTMLElement;
    private currentSettings!: CalendarWidgetSettings;
    private currentDate: Date = new Date();
    private calendarContentEl!: HTMLElement;
    private selectedDateInfoEl: HTMLElement | null = null;

    /**
     * インスタンス初期化
     */
    constructor() {
        
    }

    /**
     * ウィジェットのDOM生成・初期化
     * @param config ウィジェット設定
     * @param app Obsidianアプリ
     * @param plugin プラグイン本体
     */
    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        this.config = config;
        this.app = app;
        this.plugin = plugin; // WidgetBoardPlugin インスタンスを保持

        this.currentSettings = { ...DEFAULT_CALENDAR_SETTINGS, ...(config.settings || {}) };
        config.settings = this.currentSettings; // Ensure config object is updated

        const { widgetEl, titleEl } = createWidgetContainer(config, 'calendar-widget');
        this.widgetEl = widgetEl;
        if (titleEl) {
            titleEl.textContent = this.config.title;
        }

        this.calendarContentEl = this.widgetEl.createDiv({ cls: 'widget-content calendar-flex-content' });
        
        this.currentDate = new Date(); // 常に現在の日付で初期化
        this.renderCalendar();

        // 追加: YAMLで大きさ指定があれば反映
        applyWidgetSize(this.widgetEl, config.settings as { width?: string; height?: string } | null);

        return this.widgetEl;
    }

    /**
     * カレンダー本体を描画
     */
    private renderCalendar() {
        if (!this.calendarContentEl) return;
        this.calendarContentEl.empty();
        this.selectedDateInfoEl = null;

        const lang = this.plugin.settings.language || 'ja';
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const header = this.calendarContentEl.createDiv({ cls: 'calendar-header' });
        const prevButton = header.createEl('button');
        setIcon(prevButton, 'arrow-left');
        prevButton.setAttribute('aria-label', t(lang, 'calendar.previousMonth'));
        prevButton.onClickEvent(() => this.changeMonth(-1));

        header.createSpan({ cls: 'calendar-month-year', text: t(lang, 'calendar.yearMonth', { year, month: month + 1 }) });

        const nextButton = header.createEl('button');
        setIcon(nextButton, 'arrow-right');
        nextButton.setAttribute('aria-label', t(lang, 'calendar.nextMonth'));
        nextButton.onClickEvent(() => this.changeMonth(1));

        const table = this.calendarContentEl.createEl('table', { cls: 'calendar-table' });
        const weekStart = this.plugin.settings.weekStartDay ?? 1;
        const baseWeekdays = [
            t(lang, 'calendar.sunShort'), t(lang, 'calendar.monShort'), t(lang, 'calendar.tueShort'),
            t(lang, 'calendar.wedShort'), t(lang, 'calendar.thuShort'), t(lang, 'calendar.friShort'),
            t(lang, 'calendar.satShort')
        ];
        const weekdays = baseWeekdays.slice(weekStart).concat(baseWeekdays.slice(0, weekStart));
        const thead = table.createEl('thead');
        const trHead = thead.createEl('tr');
        const thFragment = document.createDocumentFragment();
        weekdays.forEach(day => {
            const th = document.createElement('th');
            th.textContent = day;
            thFragment.appendChild(th);
        });
        trHead.appendChild(thFragment);

        const tbody = table.createEl('tbody');
        const firstDayOfMonth = new Date(year, month, 1);

        // カレンダーの開始日を計算
        const startDate = new Date(firstDayOfMonth);
        const offset = (firstDayOfMonth.getDay() - weekStart + 7) % 7;
        startDate.setDate(startDate.getDate() - offset);

        const today = new Date();
        today.setHours(0,0,0,0); // 時間情報をリセットして日付のみで比較

        // --- 追加: 選択日情報表示エリア ---
        this.selectedDateInfoEl = this.calendarContentEl.createDiv({ cls: 'calendar-selected-date-info' });

        for (let i = 0; i < 6; i++) { // 最大6週間表示
            const tr = tbody.createEl('tr');
            const tdFragment = document.createDocumentFragment();
            for (let j = 0; j < 7; j++) {
                const cellDate = new Date(startDate);
                const td = tr.createEl('td', { text: String(cellDate.getDate()) });
                // data-date属性を付与
                const y = cellDate.getFullYear();
                const m = cellDate.getMonth() + 1;
                const d = cellDate.getDate();
                const dateStr = `${y}-${pad2(m)}-${pad2(d)}`;
                td.setAttr('data-date', dateStr);
                if (cellDate.getMonth() !== month) {
                    td.addClass('calendar-other-month');
                }
                if (cellDate.getFullYear() === today.getFullYear() &&
                    cellDate.getMonth() === today.getMonth() &&
                    cellDate.getDate() === today.getDate()) {
                    td.addClass('calendar-today');
                }
                // --- クリックイベント追加 ---
                td.addEventListener('click', () => {
                    if (cellDate.getMonth() !== month) {
                        // 他の月なら、その月にジャンプして再描画し、該当日を選択
                        this.currentDate = new Date(cellDate);
                        this.renderCalendar();
                        requestAnimationFrame(() => this.showNotesForDate(dateStr));
                    } else {
                        this.showNotesForDate(dateStr);
                    }
                });
                startDate.setDate(startDate.getDate() + 1);
                tdFragment.appendChild(td);
            }
            tr.appendChild(tdFragment);
            // 表示月と異なり、かつ日付が7より大きく(つまり翌月に入って1週間以上経過)、3行目以降ならループを抜ける
            // (カレンダー表示が不必要に6週間になるのを防ぐため)
            if (startDate.getMonth() !== month && startDate.getDate() > 7 && i >= 3) {
                 // ただし、月によっては5行で足りるが、稀に6行必要な場合があるので、
                 // startDateがまだ表示対象の月の初日より前か、表示対象の月中であればループを継続するべき。
                 // より正確には、表示対象の月の最終日が表示された後、次の行が全て翌月ならbreakする。
                 // ここでは簡易的に、4行目以降で、かつ完全に次の月に入ったらbreakとしている。
                 // より厳密な制御が必要な場合はロジック見直し。
                 // 例: 2023年2月 (28日、水曜始まり) は4行で済む。
                 // 例: 2023年10月 (31日、日曜始まり) は5行。
                 // 例: 2026年5月 (31日、金曜始まり) は6行必要。
                 // このロジックだと、常に6行描画しようとするため、末尾が翌月で埋まることがある。
                 // ユーザーの要望に応じて調整。現状は元のロジックをほぼ踏襲。
            }
        }
    }

    private changeMonth(delta: number) {
        this.currentDate.setMonth(this.currentDate.getMonth() + delta, 1); // 日を1に設定して月の遷移を確実にする
        this.renderCalendar();
    }

    /**
     * 外部から設定変更を受けて状態・UIを更新
     * @param newSettings 新しい設定
     * @param widgetId 対象ウィジェットID
     */
    public updateExternalSettings(newSettings: CalendarWidgetSettings, widgetId?: string) {
        if (widgetId && this.config?.id !== widgetId) return;

        this.currentSettings = { ...this.currentSettings, ...newSettings };
        if(this.config && this.config.settings) {
            this.config.settings = this.currentSettings; // WidgetConfigも更新
        }
        // カレンダーの表示内容に影響する設定が追加されたら、ここで再描画
        this.renderCalendar();
    }

    /**
     * 指定日付のデイリーノートとノート一覧を表示
     */
    private showNotesForDate(dateStr: string) {
        if (!this.selectedDateInfoEl) return;
        this.selectedDateInfoEl.empty();
        const lang = this.plugin.settings.language || 'ja';
        new Setting(this.selectedDateInfoEl).setName(t(lang, 'calendar.notesForDate', { date: dateStr })).setHeading();

        const date = moment(dateStr, 'YYYY-MM-DD');

        // --- Get daily note settings from "Daily notes" or "Periodic Notes" plugins ---
        let format = 'YYYY-MM-DD';
        let folder = '';

        try {
            const periodicNotes = (this.app as any).plugins.getPlugin('periodic-notes');
            if (periodicNotes && periodicNotes.settings?.daily?.enabled) {
                format = periodicNotes.settings.daily.format || format;
                folder = periodicNotes.settings.daily.folder || folder;
            } else {
                const dailyNotes = (this.app as any).internalPlugins.getPluginById('daily-notes');
                if (dailyNotes && dailyNotes.enabled) {
                    const options = dailyNotes.instance.options;
                    format = options.format || format;
                    folder = options.folder || folder;
                } else {
                    format = this.plugin?.settings?.calendarDailyNoteFormat || 'YYYY-MM-DD';
                }
            }
        } catch (e) {
            console.error("Calendar Widget: Error getting daily note settings, falling back to own settings.", e);
            format = this.plugin?.settings?.calendarDailyNoteFormat || 'YYYY-MM-DD';
        }

        const filename = date.format(format) + '.md';
        const dailyNotePath = normalizePath(folder ? `${folder}/${filename}` : filename);
        const dailyNote = this.app.vault.getAbstractFileByPath(dailyNotePath);


        if (dailyNote instanceof TFile) {
            const dailyBtn = this.selectedDateInfoEl.createEl('button', { text: t(lang, 'calendar.openDailyNote') });
            dailyBtn.onclick = () => {
                this.app.workspace.openLinkText(dailyNote.path, '', false);
            };
        } else {
            this.selectedDateInfoEl.createEl('div', { text: t(lang, 'calendar.noDailyNote') });
             // デバッグ用: 一致しなかった場合、計算されたパスを出力
            debugLog(this.plugin, 'デイリーノートが見つかりません:', { calculatedPath: dailyNotePath });
        }

        // その日付で作成・編集されたノート一覧
        const files = this.app.vault.getFiles().filter(f => {
            if (f.extension !== 'md' || f.path === dailyNotePath) return false;
            const c = moment(f.stat.ctime).format('YYYY-MM-DD');
            const m = moment(f.stat.mtime).format('YYYY-MM-DD');
            return c === dateStr || m === dateStr;
        });

        if (files.length > 0) {
            const list = this.selectedDateInfoEl.createEl('ul');
            files.forEach(f => {
                const li = list.createEl('li');
                const a = li.createEl('a', { text: f.basename });
                a.href = '#';
                a.onclick = (e) => {
                    e.preventDefault();
                    this.app.workspace.openLinkText(f.path, '', false);
                };
            });
        }
    }

    /**
     * ウィジェット破棄時のクリーンアップ
     */
    onunload(): void {
        // No specific cleanup needed for calendar as it doesn't use intervals etc.
    }
}