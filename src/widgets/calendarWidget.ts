// src/widgets/calendarWidget.ts
import { App, setIcon } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main';

// --- カレンダーウィジェット設定インターフェース ---
export interface CalendarWidgetSettings {
    // 将来的に開始曜日などを追加可能
}

// --- カレンダーウィジェットデフォルト設定 ---
export const DEFAULT_CALENDAR_SETTINGS: CalendarWidgetSettings = {};

/**
 * カレンダーウィジェット
 * - 月表示、日付強調、差分更新UI
 */
export class CalendarWidget implements WidgetImplementation {
    id = 'calendar';
    private config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin; // plugin は型だけ保持し、実際には使わない場合もある
    private widgetEl!: HTMLElement;
    private currentSettings!: CalendarWidgetSettings;
    private currentDate: Date = new Date();
    private calendarContentEl!: HTMLElement;

    /**
     * インスタンス初期化
     */
    constructor() {
        // ... 既存コード ...
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

        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'calendar-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);

        const titleEl = this.widgetEl.createEl('h4');
        titleEl.textContent = this.config.title;

        this.calendarContentEl = this.widgetEl.createDiv({ cls: 'widget-content calendar-flex-content' });
        
        this.currentDate = new Date(); // 常に現在の日付で初期化
        this.renderCalendar();

        return this.widgetEl;
    }

    /**
     * カレンダー本体を描画
     */
    private renderCalendar() {
        if (!this.calendarContentEl) return;
        this.calendarContentEl.empty();

        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const header = this.calendarContentEl.createDiv({ cls: 'calendar-header' });
        const prevButton = header.createEl('button');
        setIcon(prevButton, 'arrow-left');
        prevButton.setAttribute('aria-label', '前の月');
        prevButton.onClickEvent(() => this.changeMonth(-1));

        header.createSpan({ cls: 'calendar-month-year', text: `${year}年 ${month + 1}月` });

        const nextButton = header.createEl('button');
        setIcon(nextButton, 'arrow-right');
        nextButton.setAttribute('aria-label', '次の月');
        nextButton.onClickEvent(() => this.changeMonth(1));

        const table = this.calendarContentEl.createEl('table', { cls: 'calendar-table' });
        const weekdays = ['日', '月', '火', '水', '木', '金', '土']; // 日本語曜日
        const thead = table.createEl('thead');
        const trHead = thead.createEl('tr');
        const thFragment = document.createDocumentFragment();
        weekdays.forEach(day => {
            const th = createEl('th', { text: day });
            thFragment.appendChild(th);
        });
        trHead.appendChild(thFragment);

        const tbody = table.createEl('tbody');
        const firstDayOfMonth = new Date(year, month, 1);
        
        // カレンダーの開始日を計算 (月の最初の日の曜日から逆算して日曜日にする)
        const startDate = new Date(firstDayOfMonth);
        startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay()); // getDay()は日曜日が0

        const today = new Date();
        today.setHours(0,0,0,0); // 時間情報をリセットして日付のみで比較

        for (let i = 0; i < 6; i++) { // 最大6週間表示
            const tr = tbody.createEl('tr');
            const tdFragment = document.createDocumentFragment();
            for (let j = 0; j < 7; j++) {
                const td = tr.createEl('td', { text: String(startDate.getDate()) });
                if (startDate.getMonth() !== month) {
                    td.addClass('calendar-other-month');
                }
                if (startDate.getFullYear() === today.getFullYear() &&
                    startDate.getMonth() === today.getMonth() &&
                    startDate.getDate() === today.getDate()) {
                    td.addClass('calendar-today');
                }
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
     * ウィジェット破棄時のクリーンアップ
     */
    onunload(): void {
        // No specific cleanup needed for calendar as it doesn't use intervals etc.
    }
}