// src/widgets/pomodoroWidget.ts
import { App, MarkdownRenderer, Notice, setIcon } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main';

// --- ポモドーロウィジェット設定インターフェース ---
export interface PomodoroSettings {
    workMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    pomodorosUntilLongBreak: number;
    backgroundImageUrl?: string;
    memoContent?: string;
}

// --- ポモドーロウィジェットデフォルト設定 ---
export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    pomodorosUntilLongBreak: 4,
    backgroundImageUrl: '',
    memoContent: '',
};

// --- PomodoroWidget クラス (元のコードから該当部分をここに移動) ---
export class PomodoroWidget implements WidgetImplementation {
    id = 'pomodoro'; // WidgetImplementationインターフェースのidプロパティ
    private config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin;

    private timerId: number | null = null;
    private remainingTime: number = 0;
    private isRunning: boolean = false;
    private currentPomodoroSet: 'work' | 'shortBreak' | 'longBreak';
    private pomodorosCompletedInCycle: number = 0;
    private initialized: boolean;

    private widgetEl!: HTMLElement;
    private timeDisplayEl!: HTMLElement;
    private statusDisplayEl!: HTMLElement;
    private cycleDisplayEl!: HTMLElement;
    private startPauseButton!: HTMLButtonElement;
    private resetButton!: HTMLButtonElement;
    private nextButton!: HTMLButtonElement;

    private memoContainerEl!: HTMLElement;
    private memoDisplayEl!: HTMLElement;
    private memoEditContainerEl!: HTMLElement;
    private memoEditAreaEl!: HTMLTextAreaElement;
    private editMemoButtonEl!: HTMLButtonElement;
    private saveMemoButtonEl!: HTMLButtonElement;
    private cancelMemoButtonEl!: HTMLButtonElement;
    private isEditingMemo: boolean = false;

    private currentSettings!: PomodoroSettings;
    private lastConfiguredId?: string;

    constructor() {
        this.initialized = false;
        this.currentPomodoroSet = 'work';
        this.isEditingMemo = false;
    }

    public getWidgetId(): string | undefined {
        return this.config?.id;
    }

    private applyBackground(imageUrl?: string) {
        if (!this.widgetEl) return;
        const trimmedUrl = imageUrl?.trim();
        if (trimmedUrl) {
            this.widgetEl.style.backgroundImage = `url("${trimmedUrl}")`;
            this.widgetEl.style.backgroundSize = "cover";
            this.widgetEl.style.backgroundPosition = "center";
            this.widgetEl.style.backgroundRepeat = "no-repeat";
            this.widgetEl.classList.add('has-background-image');
        } else {
            this.widgetEl.style.backgroundImage = "";
            this.widgetEl.style.backgroundSize = "";
            this.widgetEl.style.backgroundPosition = "";
            this.widgetEl.style.backgroundRepeat = "";
            this.widgetEl.classList.remove('has-background-image');
        }
    }

    private async renderMemo(markdownContent?: string) {
        if (!this.memoDisplayEl) return;
        this.memoDisplayEl.empty();
        const trimmedContent = markdownContent?.trim();
        if (trimmedContent && !this.isEditingMemo) {
            this.memoDisplayEl.style.display = '';
            await MarkdownRenderer.render(this.app, trimmedContent, this.memoDisplayEl, this.config.id, this.plugin);
        } else if (!this.isEditingMemo) {
            this.memoDisplayEl.style.display = 'none';
        }
    }

    private updateMemoEditUI() {
        if (!this.memoDisplayEl || !this.memoEditContainerEl || !this.editMemoButtonEl) return;
        const hasMemoContent = this.currentSettings.memoContent && this.currentSettings.memoContent.trim() !== '';

        this.memoDisplayEl.style.display = this.isEditingMemo ? 'none' : (hasMemoContent ? '' : 'none');
        this.memoEditContainerEl.style.display = this.isEditingMemo ? '' : 'none';
        this.editMemoButtonEl.style.display = this.isEditingMemo ? 'none' : '';

        if (!this.isEditingMemo && !hasMemoContent) {
            this.memoDisplayEl.style.display = 'none';
        }

        if (this.isEditingMemo) {
            this.memoEditAreaEl.focus();
        } else {
            this.renderMemo(this.currentSettings.memoContent);
        }
    }

    private enterMemoEditMode() {
        this.isEditingMemo = true;
        this.memoEditAreaEl.value = this.currentSettings.memoContent || '';
        this.updateMemoEditUI();
    }

    private async saveMemoChanges() {
        const newMemo = this.memoEditAreaEl.value;
        this.isEditingMemo = false;
        if (newMemo !== (this.currentSettings.memoContent || '')) {
            this.currentSettings.memoContent = newMemo;
            if (this.config.settings) this.config.settings.memoContent = newMemo; // Ensure config also reflects change
            await this.plugin.saveSettings(); // Save all plugin settings
            await this.renderMemo(newMemo);
        }
        this.updateMemoEditUI();
    }

    private cancelMemoEditMode() {
        this.isEditingMemo = false;
        this.renderMemo(this.currentSettings.memoContent);
        this.updateMemoEditUI();
    }


    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        const newConfigId = config.id;
        const isReconfiguringForDifferentWidget = this.initialized && this.lastConfiguredId !== newConfigId;

        this.config = config;
        this.app = app;
        this.plugin = plugin;

        // 設定の初期化または更新
        if (!this.initialized || isReconfiguringForDifferentWidget) {
            // 完全に新しいインスタンスとして初期化
            this.currentSettings = { ...DEFAULT_POMODORO_SETTINGS, ...(config.settings || {}) };
            this.pomodorosCompletedInCycle = 0;
            this.currentPomodoroSet = 'work';
            this.isRunning = false;
            if (this.timerId) clearInterval(this.timerId);
            this.timerId = null;
            this.isEditingMemo = false;
        } else {
            // 既存の設定に新しい設定をマージ
            const newSettingsFromConfig = config.settings as Partial<PomodoroSettings> || {};
            this.currentSettings = { ...this.currentSettings, ...newSettingsFromConfig };
        }
        // WidgetConfigのsettingsも最新の状態に保つ
        config.settings = this.currentSettings;


        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'pomodoro-timer-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);

        this.applyBackground(this.currentSettings.backgroundImageUrl);

        const titleEl = this.widgetEl.createEl('h4');
        titleEl.textContent = this.config.title;

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });

        this.timeDisplayEl = contentEl.createDiv({ cls: 'pomodoro-time-display' });
        this.statusDisplayEl = contentEl.createDiv({ cls: 'pomodoro-status-display' });
        this.cycleDisplayEl = contentEl.createDiv({ cls: 'pomodoro-cycle-display' });

        const controlsEl = contentEl.createDiv({ cls: 'pomodoro-controls' });
        this.startPauseButton = controlsEl.createEl('button', { cls: 'pomodoro-start-pause' });
        this.resetButton = controlsEl.createEl('button', { cls: 'pomodoro-reset' });
        this.nextButton = controlsEl.createEl('button', { cls: 'pomodoro-next' });

        this.startPauseButton.onClickEvent(() => this.toggleStartPause());
        this.resetButton.onClickEvent(() => this.resetCurrentTimerConfirm());
        this.nextButton.onClickEvent(() => this.skipToNextSessionConfirm());

        // Memo UI
        this.memoContainerEl = contentEl.createDiv({ cls: 'pomodoro-memo-container' });
        const memoHeaderEl = this.memoContainerEl.createDiv({ cls: 'pomodoro-memo-header' });
        this.editMemoButtonEl = memoHeaderEl.createEl('button', { cls: 'pomodoro-memo-edit-button' });
        setIcon(this.editMemoButtonEl, 'pencil');
        this.editMemoButtonEl.setAttribute('aria-label', 'メモを編集/追加');
        this.editMemoButtonEl.onClickEvent(() => this.enterMemoEditMode());

        this.memoDisplayEl = this.memoContainerEl.createDiv({ cls: 'pomodoro-memo-display' });
        this.memoEditContainerEl = this.memoContainerEl.createDiv({ cls: 'pomodoro-memo-edit-container' });
        this.memoEditAreaEl = this.memoEditContainerEl.createEl('textarea', { cls: 'pomodoro-memo-edit-area' });

        const memoEditControlsEl = this.memoEditContainerEl.createDiv({ cls: 'pomodoro-memo-edit-controls' });
        this.saveMemoButtonEl = memoEditControlsEl.createEl('button', { text: '保存' });
        this.saveMemoButtonEl.addClass('mod-cta');
        this.cancelMemoButtonEl = memoEditControlsEl.createEl('button', { text: 'キャンセル' });
        this.saveMemoButtonEl.onClickEvent(() => this.saveMemoChanges());
        this.cancelMemoButtonEl.onClickEvent(() => this.cancelMemoEditMode());
        
        this.isEditingMemo = false; // 初期状態は表示モード
        this.renderMemo(this.currentSettings.memoContent);
        this.updateMemoEditUI();

        // タイマー状態の初期化または復元
        if (!this.initialized || isReconfiguringForDifferentWidget) {
            this.resetTimerState(this.currentPomodoroSet, true); // 新規 or 別IDならサイクルもリセット
        } else if (!this.isRunning && this.lastConfiguredId === newConfigId) {
            // 同じIDで停止中だった場合、現在のセッションの残り時間とサイクル数を維持して表示更新
            this.resetTimerState(this.currentPomodoroSet, false); // サイクル数は維持
        }
        // それ以外の場合 (実行中だった場合など) は、既存のタイマー状態をそのまま利用 (isRunning, remainingTimeなど)

        this.initialized = true;
        this.lastConfiguredId = newConfigId;
        this.updateDisplay();
        return this.widgetEl;
    }

    private formatTime(totalSeconds: number): string {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    private updateDisplay() {
        if (!this.widgetEl || !this.timeDisplayEl || !this.startPauseButton || !this.resetButton || !this.nextButton || !this.statusDisplayEl || !this.cycleDisplayEl) return;

        this.timeDisplayEl.textContent = this.formatTime(this.remainingTime);
        setIcon(this.startPauseButton, this.isRunning ? 'pause' : 'play');
        this.startPauseButton.setAttribute('aria-label', this.isRunning ? '一時停止' : '開始');
        setIcon(this.resetButton, 'rotate-ccw');
        this.resetButton.setAttribute('aria-label', 'リセット');
        setIcon(this.nextButton, 'skip-forward');
        this.nextButton.setAttribute('aria-label', '次のセッションへ');

        let statusText = '';
        switch (this.currentPomodoroSet) {
            case 'work':
                statusText = `作業中 (${this.currentSettings.workMinutes}分)`;
                break;
            case 'shortBreak':
                statusText = `短い休憩 (${this.currentSettings.shortBreakMinutes}分)`;
                break;
            case 'longBreak':
                statusText = `長い休憩 (${this.currentSettings.longBreakMinutes}分)`;
                break;
        }
        this.statusDisplayEl.textContent = statusText;
        this.cycleDisplayEl.textContent = `現在のサイクル: ${this.pomodorosCompletedInCycle} / ${this.currentSettings.pomodorosUntilLongBreak}`;
    }

    private toggleStartPause() {
        if (this.isRunning) {
            this.pauseTimer();
        } else {
            this.startTimer();
        }
    }

    private startTimer() {
        if (this.isRunning && this.timerId !== null) return; // 既に実行中なら何もしない

        if (this.remainingTime <= 0 && this.currentPomodoroSet === 'work') {
             // 作業セッションが0秒で開始された場合（リセット直後など）は、作業時間から開始
            this.resetTimerState('work', true); // 作業モードでサイクルもリセットして開始
        } else if (this.remainingTime <= 0) {
            // 休憩セッションが0秒で開始しようとした場合、または何らかの理由で0秒の場合
            this.handleSessionEnd(); // 次のセッションへ移行
            return;
        }

        this.isRunning = true;
        if (this.timerId) clearInterval(this.timerId); // 念のため既存のタイマーをクリア
        this.timerId = window.setInterval(() => this.tick(), 1000);
        this.updateDisplay();
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} を開始しました。`);
    }

    private pauseTimer() {
        if (!this.isRunning || !this.timerId) return; // 停止中、またはタイマーIDがなければ何もしない
        this.isRunning = false;
        clearInterval(this.timerId);
        this.timerId = null;
        this.updateDisplay();
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} を一時停止しました。`);
    }

    private resetCurrentTimerConfirm() {
        this.pauseTimer(); // まずタイマーを停止
        this.resetTimerState(this.currentPomodoroSet, false); // 現在のモードで時間をリセット（サイクル数は変更しない）
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} をリセットしました。`);
    }
    
    private resetTimerState(mode: 'work' | 'shortBreak' | 'longBreak', resetCycleCount: boolean) {
        this.currentPomodoroSet = mode;
        switch (mode) {
            case 'work':
                this.remainingTime = this.currentSettings.workMinutes * 60;
                break;
            case 'shortBreak':
                this.remainingTime = this.currentSettings.shortBreakMinutes * 60;
                break;
            case 'longBreak':
                this.remainingTime = this.currentSettings.longBreakMinutes * 60;
                break;
        }
        if (resetCycleCount) {
            this.pomodorosCompletedInCycle = 0;
        }

        if (this.isRunning) { // 実行中だった場合は停止する
            this.pauseTimer();
        } else if(this.timerId) { // 停止中でタイマーIDが残っていればクリア
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.isRunning = false; // 確実に停止状態にする
        this.updateDisplay();
    }

    private tick() {
        if (!this.isRunning) return;
        this.remainingTime--;
        this.updateDisplay();
        if (this.remainingTime <= 0) {
            this.pauseTimer(); // 時間切れでタイマーを止める
            this.handleSessionEnd();
        }
    }

    private handleSessionEnd() {
        let msg = "";
        if (this.currentPomodoroSet === 'work') {
            this.pomodorosCompletedInCycle++;
            msg = `作業セッション (${this.currentSettings.workMinutes}分) が終了。`;
            if (this.pomodorosCompletedInCycle >= this.currentSettings.pomodorosUntilLongBreak) {
                this.resetTimerState('longBreak', false); // サイクル数はリセットしない
                msg += "長い休憩を開始してください。";
            } else {
                this.resetTimerState('shortBreak', false); // サイクル数はリセットしない
                msg += "短い休憩を開始してください。";
            }
        } else { // 休憩終了時
            if(this.currentPomodoroSet === 'shortBreak') msg = `短い休憩 (${this.currentSettings.shortBreakMinutes}分) が終了。`;
            else msg = `長い休憩 (${this.currentSettings.longBreakMinutes}分) が終了。`;
            
            // 長い休憩が終わった時だけサイクルをリセット
            this.resetTimerState('work', this.currentPomodoroSet === 'longBreak');
            msg += "作業セッションを開始してください。";
        }
        new Notice(msg, 7000); // 通知を7秒間表示
        // モーダルが閉じていたら開く
        if (this.plugin && (!this.plugin.widgetBoardModal || !this.plugin.widgetBoardModal.isOpen)) {
            this.plugin.openWidgetBoard();
        }
    }
    
    private skipToNextSessionConfirm() {
        this.pauseTimer(); // 現在のタイマーを停止
        this.handleSessionEnd(); // セッション終了処理を呼び出して次のセッションへ
        new Notice("次のセッションへスキップしました。");
    }

    onunload(): void {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.isRunning = false;
        // 他のクリーンアップがあればここに追加
    }
    
    public async updateExternalSettings(newSettings: PomodoroSettings, widgetId?: string) {
        if (widgetId && this.config?.id !== widgetId) return; // 別のウィジェットインスタンスなら何もしない

        const oldImageUrl = this.currentSettings.backgroundImageUrl;
        const oldMemoContent = this.currentSettings.memoContent;

        // 既存のcurrentSettingsと新しい設定をマージ
        this.currentSettings = { ...this.currentSettings, ...newSettings };
        // WidgetConfig内のsettingsも更新
        if(this.config && this.config.settings) {
            this.config.settings = this.currentSettings;
        }

        // 背景画像の更新
        if (oldImageUrl !== this.currentSettings.backgroundImageUrl) {
            this.applyBackground(this.currentSettings.backgroundImageUrl);
        }
        // メモ内容の更新 (編集中でない場合のみ)
        if (oldMemoContent !== this.currentSettings.memoContent && !this.isEditingMemo) {
            await this.renderMemo(this.currentSettings.memoContent);
        }


        // タイマーが実行中でなければ、設定変更を残り時間に反映させる
        // (例: 作業時間が25分→30分に変更されたら、残り時間もリセットする)
        // 実行中の場合は、現在のセッションは古い設定で継続し、次のセッションから新設定が適用されるようにする
        // または、実行中でも即時反映させたい場合はロジック変更が必要
        if (!this.isRunning) {
            this.resetTimerState(this.currentPomodoroSet, false); // 現在のセッションタイプで時間をリセット (サイクル数は維持)
        } else {
             // 実行中の場合は、表示のみ更新（サイクル数やステータステキストなど）
             this.updateDisplay();
        }

        // メモのUI状態を更新 (編集中でなければ)
        if (!this.isEditingMemo) {
            this.updateMemoEditUI();
        }
    }
}