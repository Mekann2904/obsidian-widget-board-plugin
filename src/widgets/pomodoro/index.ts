// src/widgets/pomodoroWidget.ts
import { App, MarkdownRenderer, Notice, setIcon, TFolder } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main'; // main.ts の WidgetBoardPlugin クラスをインポート
import { PomodoroMemoWidget, PomodoroMemoSettings } from '../pomodoroMemoWidget';
import { debugLog } from '../../utils/logger';
import { applyWidgetSize, createWidgetContainer } from '../../utils';

// --- 通知音の種類の型定義 ---
export type PomodoroSoundType = 'off' | 'default_beep' | 'bell' | 'chime';
// --- エクスポート形式の型定義 ---
export type PomodoroExportFormat = 'csv' | 'json' | 'markdown' | 'none';

// --- ポモドーロウィジェット設定インターフェース ---
export interface PomodoroSettings {
    workMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    pomodorosUntilLongBreak: number;
    backgroundImageUrl?: string;
    memoContent?: string;
    notificationSound: PomodoroSoundType;
    notificationVolume: number;
    exportFormat?: PomodoroExportFormat;
    pomodorosCompletedInCycle?: number;
    currentPomodoroSet?: 'work' | 'shortBreak' | 'longBreak';
}

// --- セッション記録用型定義 ---
export interface SessionLog {
    date: string; // YYYY-MM-DD
    start: string; // HH:mm
    end: string;   // HH:mm
    memo: string;
    sessionType: 'work' | 'shortBreak' | 'longBreak';
}

// --- ポモドーロウィジェットデフォルト設定 ---
export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    pomodorosUntilLongBreak: 4,
    backgroundImageUrl: '',
    memoContent: '',
    notificationSound: 'default_beep',
    notificationVolume: 0.2,
    exportFormat: 'none',
};

/**
 * ポモドーロタイマーウィジェット
 * - 作業/休憩のタイマー管理、セッション記録、通知音、メモ連携など多機能
 */
export class PomodoroWidget implements WidgetImplementation {
    id = 'pomodoro';
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

    private memoWidget: PomodoroMemoWidget | null = null;

    private currentSettings!: PomodoroSettings;
    private lastConfiguredId?: string;
    private audioContext: AudioContext | null = null;
    private currentAudioElement: HTMLAudioElement | null = null;

    private static widgetInstances: Map<string, PomodoroWidget> = new Map();
    private static widgetStates: Map<string, any> = new Map();
    private static globalIntervalId: number | null = null;

    private sessionLogs: SessionLog[] = [];
    private currentSessionStartTime: Date | null = null;
    private currentSessionEndTime: Date | null = null;

    private lastResetClickTime: number | null = null;

    private needsRender = false;

    /**
     * インスタンス初期化
     */
    constructor() {
        this.initialized = false;
        this.currentPomodoroSet = 'work';
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
        if (!this.memoWidget) return;
        this.memoWidget.setMemoContent(markdownContent || '');
    }

    private updateMemoEditUI() {
        if (!this.memoWidget) return;
        this.memoWidget.updateUI();
    }

    private enterMemoEditMode() {
        this.memoWidget?.enterEditMode();
    }

    private async saveMemoChanges() {
        if (!this.memoWidget) return;
        await this.memoWidget.saveChanges();
    }

    private cancelMemoEditMode() {
        this.memoWidget?.cancelEditMode();
    }

    private static ensureGlobalInterval() {
        if (this.globalIntervalId == null) {
            this.globalIntervalId = window.setInterval(() => {
                let anyRunning = false;
                this.widgetStates.forEach((state, id) => {
                    if (state && state.isRunning) {
                        anyRunning = true;
                        this.tick(id);
                    }
                });
                // すべて停止中ならintervalを解除
                if (!anyRunning && this.globalIntervalId != null) {
                    clearInterval(this.globalIntervalId);
                    this.globalIntervalId = null;
                }
            }, 1000);
        }
    }

    private static clearGlobalIntervalIfNoneRunning() {
        if (Array.from(this.widgetStates.values()).every(state => !state.isRunning)) {
            if (this.globalIntervalId != null) {
                clearInterval(this.globalIntervalId);
                this.globalIntervalId = null;
            }
        }
    }

    private static tick(configId: string) {
        const state = this.widgetStates.get(configId);
        if (!state || !state.isRunning) return;
        state.remainingTime = (state.remainingTime || 0) - 1;
        if (state.remainingTime <= 0) {
            const inst = this.widgetInstances.get(configId);
            if (inst) {
                debugLog(inst.plugin, 'tick: calling handleSessionEnd', inst);
                void inst.handleSessionEnd();
            } else {
                this.handleSessionEndGlobal(configId);
            }
        }
        this.widgetStates.set(configId, state);
        // インスタンスがあればUIも更新（状態も同期）
        const inst = this.widgetInstances.get(configId);
        if (inst) {
            inst.remainingTime = state.remainingTime;
            inst.isRunning = state.isRunning;
            inst.currentPomodoroSet = state.currentPomodoroSet;
            inst.pomodorosCompletedInCycle = state.pomodorosCompletedInCycle;
            inst.updateDisplay && inst.updateDisplay();
        }
    }

    // セッション終了処理をstaticメソッド化
    private static endSessionAndAdvance(configId: string, inst?: PomodoroWidget) {
        const state = this.widgetStates.get(configId);
        if (!state) return;
        let msg = "";
        let cycleEnded = false;
        if (state.currentPomodoroSet === 'work') {
            state.pomodorosCompletedInCycle = (state.pomodorosCompletedInCycle || 0) + 1;
            msg = `作業セッション (${state.workMinutes}分) が終了。`;
            if (state.pomodorosCompletedInCycle >= state.pomodorosUntilLongBreak) {
                state.currentPomodoroSet = 'longBreak';
                state.remainingTime = state.longBreakMinutes * 60;
                msg += "長い休憩を開始してください。";
            } else {
                state.currentPomodoroSet = 'shortBreak';
                state.remainingTime = state.shortBreakMinutes * 60;
                msg += "短い休憩を開始してください。";
            }
        } else {
            if(state.currentPomodoroSet === 'shortBreak') msg = `短い休憩 (${state.shortBreakMinutes}分) が終了。`;
            else msg = `長い休憩 (${state.longBreakMinutes}分) が終了。`;
            // サイクル終了時（長い休憩終了時）はサイクル数をリセット
            if (state.currentPomodoroSet === 'longBreak') {
                state.pomodorosCompletedInCycle = 0;
                cycleEnded = true;
            }
            state.currentPomodoroSet = 'work';
            state.remainingTime = state.workMinutes * 60;
            msg += "作業セッションを開始してください。";
        }
        state.isRunning = false;
        this.widgetStates.set(configId, state);
        new Notice(msg, 7000);
        if (inst) {
            inst.isRunning = state.isRunning;
            inst.remainingTime = state.remainingTime;
            inst.currentPomodoroSet = state.currentPomodoroSet;
            inst.pomodorosCompletedInCycle = state.pomodorosCompletedInCycle;
            inst.updateDisplay && inst.updateDisplay();
            inst.playSoundNotification && inst.playSoundNotification();
            // サイクル終了時にポップアップ
            if (cycleEnded) {
                new Notice('おつかれさまでした', 8000);
            }
        }
        this.clearGlobalIntervalIfNoneRunning();
    }

    private static handleSessionEndGlobal(configId: string) {
        this.endSessionAndAdvance(configId, this.widgetInstances.get(configId));
    }

    /**
     * ウィジェットのDOM生成・初期化
     * @param config ウィジェット設定
     * @param app Obsidianアプリ
     * @param plugin プラグイン本体
     */
    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        (this.constructor as typeof PomodoroWidget).widgetInstances.set(config.id, this);

        const newConfigId = config.id;
        const isReconfiguringForDifferentWidget = this.initialized && this.lastConfiguredId !== newConfigId;

        this.config = config;
        this.app = app;
        this.plugin = plugin;

        if (!this.initialized) {
            this.currentSettings = { ...DEFAULT_POMODORO_SETTINGS, ...(config.settings || {}) };
            this.pomodorosCompletedInCycle = 0;
            this.currentPomodoroSet = 'work';
            this.isRunning = false;
            if (this.timerId) clearInterval(this.timerId);
            this.timerId = null;
        } else if (isReconfiguringForDifferentWidget) {
            this.currentSettings = { ...DEFAULT_POMODORO_SETTINGS, ...(config.settings || {}) };
            this.pomodorosCompletedInCycle = 0;
            this.currentPomodoroSet = 'work';
            this.isRunning = false;
            if (this.timerId) clearInterval(this.timerId);
            this.timerId = null;
        } else {
            const newSettingsFromConfig = config.settings as Partial<PomodoroSettings> || {};
            this.currentSettings = { ...this.currentSettings, ...newSettingsFromConfig };
        }
        if (config.settings && typeof config.settings.pomodorosCompletedInCycle === 'number') {
            this.pomodorosCompletedInCycle = config.settings.pomodorosCompletedInCycle;
        }
        if (config.settings && typeof config.settings.currentPomodoroSet === 'string') {
            this.currentPomodoroSet = config.settings.currentPomodoroSet as any;
        }
        config.settings = this.currentSettings;

        const { widgetEl, titleEl } = createWidgetContainer(config, 'pomodoro-timer-widget');
        this.widgetEl = widgetEl;
        this.applyBackground(this.currentSettings.backgroundImageUrl);
        titleEl.textContent = this.config.title || "ポモドーロタイマー";
        if (!this.config.title || this.config.title.trim() === "") {
            titleEl.style.display = 'none';
        } else {
            titleEl.style.display = '';
        }

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
        
        // --- メモウィジェットを生成 ---
        this.memoWidget = new PomodoroMemoWidget(app, contentEl, { memoContent: this.currentSettings.memoContent }, async (newMemo: string) => {
            this.currentSettings.memoContent = newMemo;
            if (this.config && this.config.settings) {
                this.config.settings.memoContent = newMemo;
            }
            // グローバル設定（plugin.settings）にも反映
            if (this.plugin && this.plugin.settings && Array.isArray(this.plugin.settings.boards)) {
                const board = this.plugin.settings.boards.find(b => b.widgets?.some(w => w.id === this.config.id));
                if (board) {
                    const widget = board.widgets.find(w => w.id === this.config.id);
                    if (widget && widget.settings) {
                        widget.settings.memoContent = newMemo;
                    }
                }
            }
            // UI部分更新のみ
            this.updateMemoEditUI();
            // 必要なら永続化のみ（UI再描画なし）
            if (this.plugin && typeof this.plugin.saveData === 'function') {
                await this.plugin.saveData(this.plugin.settings);
            }
        });

        if (!this.initialized) {
            this.resetTimerState(this.currentPomodoroSet, true); 
        } else if (isReconfiguringForDifferentWidget) {
            this.resetTimerState(this.currentPomodoroSet, true); 
        } else {
            this.updateDisplay(); 
        }

        // --- グローバル状態から復元 ---
        const state = PomodoroWidget.widgetStates.get(config.id);
        if (state) {
            this.isRunning = state.isRunning;
            this.remainingTime = state.remainingTime;
            this.currentPomodoroSet = state.currentPomodoroSet;
            this.pomodorosCompletedInCycle = state.pomodorosCompletedInCycle;
        }
        PomodoroWidget.ensureGlobalInterval();

        this.initialized = true;
        this.lastConfiguredId = newConfigId;

        // 追加: YAMLで大きさ指定があれば反映
        applyWidgetSize(this.widgetEl, config.settings);

        return this.widgetEl;
    }

    private formatTime(totalSeconds: number): string {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    /**
     * UIを差分更新（値が変化した場合のみDOMを更新）
     */
    private updateDisplay() {
        if (!this.widgetEl || !this.timeDisplayEl || !this.startPauseButton || !this.resetButton || !this.nextButton || !this.statusDisplayEl || !this.cycleDisplayEl) return;

        // 差分更新用に前回値を保持
        if (!(this as any)._prevDisplay) (this as any)._prevDisplay = {};
        const prev = (this as any)._prevDisplay;
        const timeStr = this.formatTime(this.remainingTime);
        if (prev.timeStr !== timeStr) {
            this.timeDisplayEl.textContent = timeStr;
            prev.timeStr = timeStr;
        }
        const isRunning = this.isRunning;
        if (prev.isRunning !== isRunning) {
            setIcon(this.startPauseButton, isRunning ? 'pause' : 'play');
            this.startPauseButton.setAttribute('aria-label', isRunning ? '一時停止' : '開始');
            prev.isRunning = isRunning;
        }
        if (!prev.resetIconSet) {
            setIcon(this.resetButton, 'rotate-ccw');
            this.resetButton.setAttribute('aria-label', 'リセット');
            setIcon(this.nextButton, 'skip-forward');
            this.nextButton.setAttribute('aria-label', '次のセッションへ');
            prev.resetIconSet = true;
        }
        let statusText = '';
        switch (this.currentPomodoroSet) {
            case 'work': statusText = `作業中 (${this.currentSettings.workMinutes}分)`; break;
            case 'shortBreak': statusText = `短い休憩 (${this.currentSettings.shortBreakMinutes}分)`; break;
            case 'longBreak': statusText = `長い休憩 (${this.currentSettings.longBreakMinutes}分)`; break;
        }
        if (prev.statusText !== statusText) {
            this.statusDisplayEl.textContent = statusText;
            prev.statusText = statusText;
        }
        const cycleText = `現在のサイクル: ${this.pomodorosCompletedInCycle} / ${this.currentSettings.pomodorosUntilLongBreak}`;
        if (prev.cycleText !== cycleText) {
            this.cycleDisplayEl.textContent = cycleText;
            prev.cycleText = cycleText;
        }
    }

    private toggleStartPause() { if (this.isRunning) this.pauseTimer(); else this.startTimer(); }

    private startTimer() {
        if (this.isRunning) return;
        this.isRunning = true;
        PomodoroWidget.widgetStates.set(this.config.id, {
            ...this.currentSettings,
            isRunning: true,
            remainingTime: this.remainingTime,
            currentPomodoroSet: this.currentPomodoroSet,
            pomodorosCompletedInCycle: this.pomodorosCompletedInCycle
        });
        PomodoroWidget.ensureGlobalInterval();
        this.updateDisplay();
        this.currentSessionStartTime = new Date();
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} を開始しました。`);
    }

    private pauseTimer() {
        if (!this.isRunning) return;
        this.isRunning = false;
        PomodoroWidget.widgetStates.set(this.config.id, {
            ...this.currentSettings,
            isRunning: false,
            remainingTime: this.remainingTime,
            currentPomodoroSet: this.currentPomodoroSet,
            pomodorosCompletedInCycle: this.pomodorosCompletedInCycle
        });
        PomodoroWidget.clearGlobalIntervalIfNoneRunning();
        this.updateDisplay();
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} を一時停止しました。`);
    }

    private resetCurrentTimerConfirm() {
        const now = Date.now();
        if (this.lastResetClickTime && now - this.lastResetClickTime < 1500) {
            // 2回目の短時間リセットでサイクルもリセット
            this.pauseTimer();
            this.resetTimerState(this.currentPomodoroSet, true); // サイクルもリセット
            new Notice('サイクル数もリセットしました。');
            this.lastResetClickTime = null;
        } else {
            // 1回目は通常リセット
            this.pauseTimer();
            this.resetTimerState(this.currentPomodoroSet, false); // サイクルは維持
            const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
            new Notice(`${statusText} をリセットしました。\n（サイクル数もリセットするにはもう一度すぐ押してください）`);
            this.lastResetClickTime = now;
        }
    }
    
    private resetTimerState(mode: 'work' | 'shortBreak' | 'longBreak', resetCycleCount: boolean) {
        this.currentPomodoroSet = mode;
        switch (mode) {
            case 'work': this.remainingTime = this.currentSettings.workMinutes * 60; break;
            case 'shortBreak': this.remainingTime = this.currentSettings.shortBreakMinutes * 60; break;
            case 'longBreak': this.remainingTime = this.currentSettings.longBreakMinutes * 60; break;
        }
        if (resetCycleCount) {
            this.pomodorosCompletedInCycle = 0;
        }
        if (this.isRunning) {
            this.pauseTimer();
        } else if(this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.isRunning = false;
        this.updateDisplay();
    }

    private playSoundNotification() {
        const globalSound = this.plugin.settings.pomodoroNotificationSound;
        const globalVolume = this.plugin.settings.pomodoroNotificationVolume;
        const soundType = globalSound ?? this.currentSettings.notificationSound;
        const volume = (globalVolume !== undefined ? globalVolume : this.currentSettings.notificationVolume);

        if (soundType === 'off') return;

        // 既存の音声を停止
        if (this.currentAudioElement) {
            this.currentAudioElement.pause(); this.currentAudioElement.currentTime = 0; this.currentAudioElement = null;
        }
        // AudioContextが再利用可能なら再利用、そうでなければ新規生成
        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const ctx = this.audioContext;
        try {
            if (soundType === 'default_beep') {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(volume, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.7);
                osc.onended = () => { ctx.close().catch(() => {}); this.audioContext = null; };
            } else if (soundType === 'bell') {
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();
                osc1.type = 'triangle';
                osc2.type = 'triangle';
                osc1.frequency.setValueAtTime(880, ctx.currentTime);
                osc2.frequency.setValueAtTime(1320, ctx.currentTime);
                gain.gain.setValueAtTime(volume, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
                osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
                osc1.start(ctx.currentTime); osc2.start(ctx.currentTime);
                osc1.stop(ctx.currentTime + 0.8); osc2.stop(ctx.currentTime + 0.8);
                osc2.detune.setValueAtTime(5, ctx.currentTime + 0.2);
                osc1.onended = () => { ctx.close().catch(() => {}); this.audioContext = null; };
            } else if (soundType === 'chime') {
                const notes = [523.25, 659.25, 784.0];
                const now = ctx.currentTime;
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now + i * 0.18);
                    gain.gain.setValueAtTime(volume, now + i * 0.18);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.22);
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.start(now + i * 0.18);
                    osc.stop(now + i * 0.18 + 0.22);
                    if (i === notes.length - 1) osc.onended = () => { ctx.close().catch(() => {}); this.audioContext = null; };
                });
            }
        } catch (e) { new Notice('音声の再生に失敗しました'); console.error("Error playing sound:", e); }
    }

    private async handleSessionEnd() {
        debugLog(this.plugin, 'handleSessionEnd called', this);
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        this.isRunning = false;
        this.currentSessionEndTime = new Date();
        let shouldExport = false;
        if (this.currentPomodoroSet === 'work') {
            let startDate: Date;
            let endDate: Date;
            if (this.currentSessionStartTime && this.currentSessionEndTime) {
                startDate = this.currentSessionStartTime;
                endDate = this.currentSessionEndTime;
            } else {
                startDate = new Date();
                endDate = new Date();
            }
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
            const startStr = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
            const endStr = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
            this.sessionLogs.push({
                date: dateStr,
                start: startStr,
                end: endStr,
                memo: this.memoWidget?.getMemoContent() || '',
                sessionType: 'work',
            });
            shouldExport = true;
        } else if (this.currentPomodoroSet === 'shortBreak') {
            // 短い休憩終了時も記録
            let startDate: Date;
            let endDate: Date;
            if (this.currentSessionStartTime && this.currentSessionEndTime) {
                startDate = this.currentSessionStartTime;
                endDate = this.currentSessionEndTime;
            } else {
                startDate = new Date();
                endDate = new Date();
            }
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
            const startStr = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
            const endStr = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
            this.sessionLogs.push({
                date: dateStr,
                start: startStr,
                end: endStr,
                memo: this.memoWidget?.getMemoContent() || '',
                sessionType: 'shortBreak',
            });
            shouldExport = true;
        } else if (this.currentPomodoroSet === 'longBreak') {
            // 長い休憩終了時も記録
            let startDate: Date;
            let endDate: Date;
            if (this.currentSessionStartTime && this.currentSessionEndTime) {
                startDate = this.currentSessionStartTime;
                endDate = this.currentSessionEndTime;
            } else {
                startDate = new Date();
                endDate = new Date();
            }
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
            const startStr = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
            const endStr = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
            this.sessionLogs.push({
                date: dateStr,
                start: startStr,
                end: endStr,
                memo: this.memoWidget?.getMemoContent() || '',
                sessionType: 'longBreak',
            });
            shouldExport = true;
        }
        PomodoroWidget.endSessionAndAdvance(this.config.id, this);
        const exportFormat = this.plugin.settings.pomodoroExportFormat || 'none';
        if (shouldExport && exportFormat !== 'none') {
            await this.exportSessionLogs(exportFormat);
        }
        // --- 追加: ポモドーロ終了時に該当ボードを自動で開く ---
        if (this.plugin.settings.openBoardOnPomodoroEnd) {
            const boards = (this.plugin.settings as any).boards;
            const board = boards?.find((b: any) => b.widgets?.some((w: any) => w.id === this.config.id));
            if (board) {
                this.plugin.openWidgetBoardById(board.id);
                new Notice('ポモドーロ終了: ウィジェットボードを開きました。');
            }
        }
        // --- 追加: ポモドーロ終了時に自動で次のセッションを開始 ---
        if (this.plugin.settings.autoStartNextPomodoroSession) {
            setTimeout(() => {
                this.toggleStartPause();
            }, 800);
        }
    }
    
    private skipToNextSessionConfirm() {
        // セッション未開始でスキップする場合の対応
        if (!this.currentSessionStartTime) {
            const now = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
            // 0秒作業ログを記録
            this.sessionLogs.push({
                date: dateStr,
                start: timeStr,
                end: timeStr,
                memo: this.memoWidget?.getMemoContent() || '',
                sessionType: this.currentPomodoroSet,
            });
            debugLog(this.plugin, 'skipToNextSessionConfirm: sessionLogs after push', this.sessionLogs);
            new Notice('作業が開始されていませんが、0秒の作業ログを記録してスキップします。', 5000);
            const exportFormat = this.plugin.settings.pomodoroExportFormat || 'none';
            if (exportFormat !== 'none') {
                debugLog(this.plugin, 'skipToNextSessionConfirm: calling exportSessionLogs', this.sessionLogs);
                this.exportSessionLogs(exportFormat);
            }
            // 通常のスキップ処理も実行
            PomodoroWidget.endSessionAndAdvance(this.config.id, this);
            return;
        }
        // 通常のスキップ処理
        if (this.currentSessionStartTime) {
            const startDate = this.currentSessionStartTime;
            const endDate = new Date();
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
            const startStr = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
            const endStr = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
            this.sessionLogs.push({
                date: dateStr,
                start: startStr,
                end: endStr,
                memo: this.memoWidget?.getMemoContent() || '',
                sessionType: this.currentPomodoroSet,
            });
            debugLog(this.plugin, 'skipToNextSessionConfirm: normal skip, sessionLogs after push', this.sessionLogs);
            const exportFormat = this.plugin.settings.pomodoroExportFormat || 'none';
            if (exportFormat !== 'none') {
                debugLog(this.plugin, 'skipToNextSessionConfirm: calling exportSessionLogs (normal skip)', this.sessionLogs);
                this.exportSessionLogs(exportFormat);
            }
        }
        PomodoroWidget.endSessionAndAdvance(this.config.id, this);
        new Notice("次のセッションへスキップしました。");
    }

    /**
     * ウィジェット破棄時のクリーンアップ
     */
    onunload(): void {
        const widgetIdLog = `[${this.config?.id || 'PomodoroWidget'}]`;
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        this.isRunning = false;
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(err => console.error(`${widgetIdLog} Error closing AudioContext:`, err));
            this.audioContext = null;
        }
        if (this.currentAudioElement) {
            this.currentAudioElement.pause(); this.currentAudioElement.src = ""; this.currentAudioElement = null;
        }
        (this.constructor as typeof PomodoroWidget).widgetInstances.delete(this.config?.id);
        (this.constructor as typeof PomodoroWidget).widgetStates.delete(this.config?.id);
        if (this.memoWidget && this.memoWidget.isEditing) {
            this.memoWidget.saveChanges();
        }
    }
    
    /**
     * 外部から設定変更を受けて状態・UIを更新
     * @param newSettingsFromPlugin 新しい設定
     * @param widgetId 対象ウィジェットID
     */
    public async updateExternalSettings(newSettingsFromPlugin: Partial<PomodoroSettings>, widgetId?: string) {
        if (widgetId && this.config?.id !== widgetId) return; // 対象ウィジェットでなければ何もしない

        const settingsBeforeUpdate = { ...this.currentSettings }; // Snapshot of instance state BEFORE this function's merge

        // 新しい設定をマージしてインスタンスの作業用設定を更新
        this.currentSettings = { ...this.currentSettings, ...newSettingsFromPlugin };

        // config.settings にも最新の currentSettings を反映
        // (this.currentSettings が新しいオブジェクトになる場合もあれば、プロパティが更新される場合もあるため、
        // Object.assign で確実に関連付けられたオブジェクトを更新するか、再代入する)
        if (this.config && this.config.settings) {
            // this.config.settings = this.currentSettings; // これでも良いが、Object.assign の方がより安全な場合がある
            Object.assign(this.config.settings, this.currentSettings);
        }

        // 各設定項目が変更されたかどうかを判定
        // settingsBeforeUpdate (この関数のマージ前の状態) と this.currentSettings (この関数のマージ後の状態) を比較
        const memoChanged = settingsBeforeUpdate.memoContent !== this.currentSettings.memoContent;
        const workMinutesChanged = settingsBeforeUpdate.workMinutes !== this.currentSettings.workMinutes;
        const shortBreakMinutesChanged = settingsBeforeUpdate.shortBreakMinutes !== this.currentSettings.shortBreakMinutes;
        const longBreakMinutesChanged = settingsBeforeUpdate.longBreakMinutes !== this.currentSettings.longBreakMinutes;
        const pomodorosUntilLongBreakChanged = settingsBeforeUpdate.pomodorosUntilLongBreak !== this.currentSettings.pomodorosUntilLongBreak;
        const backgroundChanged = settingsBeforeUpdate.backgroundImageUrl !== this.currentSettings.backgroundImageUrl;
        const soundChanged = settingsBeforeUpdate.notificationSound !== this.currentSettings.notificationSound;
        const volumeChanged = settingsBeforeUpdate.notificationVolume !== this.currentSettings.notificationVolume;
        const exportFormatChanged = settingsBeforeUpdate.exportFormat !== this.currentSettings.exportFormat;

        const timerRelatedSettingsChanged =
            workMinutesChanged ||
            shortBreakMinutesChanged ||
            longBreakMinutesChanged ||
            pomodorosUntilLongBreakChanged;

        const otherNonTimerSettingsChanged = // memoChanged は含めない
            backgroundChanged ||
            soundChanged ||
            volumeChanged ||
            exportFormatChanged;

        const onlyMemoChanged = memoChanged && !timerRelatedSettingsChanged && !otherNonTimerSettingsChanged;

        if (onlyMemoChanged) {
            // メモの内容だけが変わった場合
            await this.renderMemo(this.currentSettings.memoContent);
            this.updateMemoEditUI(); // メモ表示エリアの更新 (編集中でないことを確認して描画)
            return; // ★ 他の処理に進ませないことで、サイクルリセット等を防ぐ
        }

        // メモ以外の何かが変更された、またはメモと一緒に他の何かも変更された場合の処理
        if (backgroundChanged) {
            this.applyBackground(this.currentSettings.backgroundImageUrl);
        }

        if (timerRelatedSettingsChanged) {
            if (!this.isRunning) {
                // タイマーが停止中に設定変更があった場合：現在のモードで時間をリセット（サイクル数は維持）
                this.resetTimerState(this.currentPomodoroSet, false); 
            } else {
                // タイマーが実行中に設定変更があった場合：ユーザーに通知し、現在のモードで時間をリセット（サイクル数は維持）
                new Notice("タイマー設定が変更されたため、現在のセッションを新しい設定でリセットします。", 5000);
                this.pauseTimer(); 
                this.resetTimerState(this.currentPomodoroSet, false); 
            }
        } else {
            // タイマー関連設定は変更なし、かつメモのみの変更でもない場合（例：背景だけ、通知音だけ変更）
            // (この分岐は otherNonTimerSettingsChanged が true の場合に該当する)
            this.scheduleRender(); // 表示を更新 (サイクル数や残り時間には影響しないはず)
        }

        // メモ編集モードでない場合は、メモ表示を最新の状態に更新する
        // (onlyMemoChanged でなくても、例えばタイマー設定とメモが同時に変わった場合などに対応)
        if (!this.memoWidget?.isEditing) {
            // renderMemo は Markdown の再レンダリングを行うため、
            // updateMemoEditUI 経由で呼ぶのが適切。
            this.updateMemoEditUI();
        }
    }

    public static removePersistentInstance(widgetId: string, plugin: WidgetBoardPlugin): void {
        const instance = PomodoroWidget.widgetInstances.get(widgetId);
        if (instance) {
            PomodoroWidget.widgetInstances.delete(widgetId);
        }
    }

    /**
     * すべてのインスタンスをクリーンアップ
     * @param plugin プラグイン本体
     */
    public static cleanupAllPersistentInstances(plugin: WidgetBoardPlugin): void {
        // すべてのインスタンスでonunloadを呼ぶ
        this.widgetInstances.forEach(instance => {
            if (typeof instance.onunload === 'function') {
                instance.onunload();
            }
        });
        this.widgetInstances.clear();
        this.widgetStates.clear();
    }

    private async exportSessionLogs(format: PomodoroExportFormat) {
        debugLog(this.plugin, 'exportSessionLogs called', this.sessionLogs);
        if (this.sessionLogs.length === 0) {
            new Notice("エクスポートするログがありません。");
            return;
        }
        let content = '';
        let ext = '';
        if (format === 'csv') {
            ext = 'csv';
        } else if (format === 'json') {
            ext = 'json';
        } else if (format === 'markdown') {
            ext = 'md';
        } else {
            return; // 'none' or unknown format
        }
        const pluginFolder = this.app.vault.configDir + '/plugins/' + this.plugin.manifest.id;
        const logsFolder = pluginFolder + '/logs';
        const filePath = logsFolder + `/pomodoro-log.${ext}`;
        let allLogs: SessionLog[] = [];
        try {
            // logsフォルダがなければ作成
            const logsFolderExists = await this.app.vault.adapter.exists(logsFolder);
            if (!logsFolderExists) {
                await this.app.vault.adapter.mkdir(logsFolder);
            }
            // 既存ファイルがあれば内容を読み込む
            const fileExists = await this.app.vault.adapter.exists(filePath);
            if (fileExists) {
                const existing = await this.app.vault.adapter.read(filePath);
                if (format === 'csv') {
                    const lines = existing.split('\n').filter(l => l.trim() !== '');
                    if (lines.length > 1) {
                        for (let i = 1; i < lines.length; i++) {
                            // カラム順: date, start, end, sessionType, memo
                            const [date, start, end, sessionType, memo] = lines[i].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
                            allLogs.push({
                                date: date || '',
                                start: start || '',
                                end: end || '',
                                sessionType: (sessionType as 'work'|'shortBreak'|'longBreak') || 'work',
                                memo: memo ? memo.replace(/^"|"$/g, '').replace(/""/g, '"') : '',
                            });
                        }
                    }
                } else if (format === 'json') {
                    try {
                        const parsed = JSON.parse(existing);
                        if (Array.isArray(parsed)) {
                            allLogs = parsed;
                        } else {
                            allLogs = [];
                        }
                    } catch {
                        allLogs = [];
                    }
                } else if (format === 'markdown') {
                    const lines = existing.split('\n').filter(l => l.trim() !== '');
                    if (lines.length > 2) {
                        for (let i = 2; i < lines.length; i++) {
                            // 区切り文字'|'で分割し、両端の空白を除去
                            const cols = lines[i].split('|').map(s => s.trim());
                            // | date | start | end | sessionType | memo |
                            if (cols.length >= 6) {
                                // 0:空, 1:date, 2:start, 3:end, 4:sessionType, 5:memo, ...
                                // memo列は5番目以降を結合し、両端の空白とパイプを除去
                                let memo = cols.slice(5).join('|');
                                memo = memo.replace(/^\|+/, '').replace(/\|+$/, '').trim();
                                allLogs.push({
                                    date: cols[1],
                                    start: cols[2],
                                    end: cols[3],
                                    sessionType: (cols[4] as 'work'|'shortBreak'|'longBreak') || 'work',
                                    memo: memo,
                                });
                            }
                        }
                    }
                }
            }
            // 新規ログを追加
            allLogs = allLogs.concat(this.sessionLogs);
            // 重複排除（date, start, end, memoが全て一致するものは1つだけ）
            // allLogs = allLogs.filter((log, idx, arr) =>
            //     arr.findIndex(l => l.date === log.date && l.start === log.start && l.end === log.end && l.memo === log.memo) === idx
            // );
            // 保存内容を生成
            if (format === 'csv') {
                // BOM付きでExcel等でも文字化けしないように
                content = '\uFEFFdate,start,end,sessionType,memo\n' + allLogs.map(log => {
                    const safeMemo = (log.memo || '').replace(/\r?\n/g, '\\n').replace(/"/g, '""');
                    return `${log.date},${log.start},${log.end},${log.sessionType},"${safeMemo}"`;
                }).join('\n');
            } else if (format === 'json') {
                content = JSON.stringify(allLogs, null, 2);
            } else if (format === 'markdown') {
                content = '| date | start | end | sessionType | memo |\n|---|---|---|---|---|\n' + allLogs.map(log => 
                    `| ${log.date} | ${log.start} | ${log.end} | ${log.sessionType} | ${(log.memo || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')} |`
                ).join('\n');
            }
            await this.app.vault.adapter.write(filePath, content);
            new Notice(`ポモドーロログを ${filePath} に保存しました。`);
            this.sessionLogs = [];
        } catch (e) {
            new Notice('ログのエクスポートに失敗しました');
            console.error("Error exporting session logs:", e);
        }
    }

    private scheduleRender() {
        if (this.needsRender) return;
        this.needsRender = true;
        requestAnimationFrame(() => {
            this.updateDisplay();
            this.needsRender = false;
        });
    }
}