import { App, Notice, setIcon } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../../interfaces';
import type WidgetBoardPlugin from '../../main';
import { createWidgetContainer, pad2 } from '../../utils';
import { t } from '../../i18n';

// --- 通知音の種類の型定義 ---
export type TimerSoundType = 'off' | 'default_beep' | 'bell' | 'chime'; // chime を追加する場合

export interface TimerStopwatchWidgetSettings {
    timerMinutes?: number;
    timerSeconds?: number;
    notificationSound?: TimerSoundType; // 追加
    notificationVolume?: number;      // 追加 (0.0 から 1.0)
}

export const DEFAULT_TIMER_STOPWATCH_SETTINGS: TimerStopwatchWidgetSettings = {
    timerMinutes: 5,
    timerSeconds: 0,
    notificationSound: 'default_beep', // デフォルトの通知音
    notificationVolume: 0.5,           // デフォルトの音量
};

interface TimerStopwatchState {
    configId: string;
    mode: 'timer' | 'stopwatch';
    running: boolean;
    initialTimerSeconds: number;
    remainingSeconds: number;
    elapsedSeconds: number;
    intervalId: number | null;
    lastTickTime: number | null;
}

/**
 * タイマー／ストップウォッチウィジェット
 * - カウントダウン・ストップウォッチ両対応、通知音、差分更新UI
 */
export class TimerStopwatchWidget implements WidgetImplementation {
    id = 'timer-stopwatch';
    private config!: WidgetConfig;
    private app!: App;
    private plugin!: WidgetBoardPlugin;
    private widgetEl!: HTMLElement;
    private currentSettings!: TimerStopwatchWidgetSettings;

    private displayEl!: HTMLElement;
    private startPauseBtn!: HTMLButtonElement;
    private timerMinInput!: HTMLInputElement;
    private timerSecInput!: HTMLInputElement;
    private timerSetRowEl!: HTMLElement;
    private modeSwitchContainer!: HTMLElement;

    private _prevDisplay: {
        isTimer?: boolean;
        minVal?: string;
        secVal?: string;
        timeStr?: string;
        running?: boolean;
    } = {};

    // --- 音声関連プロパティ ---
    private audioContext: AudioContext | null = null;
    private currentAudioElement: HTMLAudioElement | null = null;

    private static widgetStates: Map<string, TimerStopwatchState> = new Map();
    private static widgetInstances: Map<string, TimerStopwatchWidget> = new Map();
    private static globalIntervalId: number | null = null; // グローバルtick用

    private needsRender = false;
    private scheduleRender() {
        if (this.needsRender) return;
        this.needsRender = true;
        requestAnimationFrame(() => {
            this.updateDisplay();
            this.needsRender = false;
        });
    }

    /**
     * インスタンス初期化
     */
    constructor() {
        // no initialization logic
    }

    private getInternalState(): TimerStopwatchState | undefined {
        return TimerStopwatchWidget.widgetStates.get(this.config.id);
    }

    private initializeInternalState(): TimerStopwatchState {
        const initialTimerVal =
            (this.currentSettings.timerMinutes ?? DEFAULT_TIMER_STOPWATCH_SETTINGS.timerMinutes ?? 0) * 60 +
            (this.currentSettings.timerSeconds ?? DEFAULT_TIMER_STOPWATCH_SETTINGS.timerSeconds ?? 0);

        const newState: TimerStopwatchState = {
            configId: this.config.id,
            mode: 'timer',
            running: false,
            initialTimerSeconds: initialTimerVal,
            remainingSeconds: initialTimerVal,
            elapsedSeconds: 0,
            intervalId: null,
            lastTickTime: null,
        };
        TimerStopwatchWidget.widgetStates.set(this.config.id, newState);
        return newState;
    }

    private updateInternalState(updater: (prevState: TimerStopwatchState) => Partial<TimerStopwatchState>) {
        let state = this.getInternalState();
        if (!state) {
            state = this.initializeInternalState();
        }
        const updates = updater(state);
        const newState = { ...state, ...updates };
        TimerStopwatchWidget.widgetStates.set(this.config.id, newState);
        TimerStopwatchWidget.notifyInstancesToUpdateDisplay(this.config.id);
    }

    private static notifyInstancesToUpdateDisplay(configId: string) {
        const instance = TimerStopwatchWidget.widgetInstances.get(configId);
        if (instance) {
            instance.updateDisplay();
        }
    }

    private static tick(configId: string) {
        const state = TimerStopwatchWidget.widgetStates.get(configId);
        if (!state || !state.running) {
            if (state && state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = null;
                TimerStopwatchWidget.widgetStates.set(configId, state);
            }
            return;
        }
        const currentTime = Date.now();
        const deltaTime = state.lastTickTime ? (currentTime - state.lastTickTime) / 1000 : 1;
        state.lastTickTime = currentTime;
        if (state.mode === 'timer') {
            state.remainingSeconds -= deltaTime;
            if (state.remainingSeconds <= 0) {
                state.remainingSeconds = 0;
                TimerStopwatchWidget.stopGlobalTimer(configId);
                const instance = TimerStopwatchWidget.widgetInstances.get(configId);
                if (instance) {
                    instance.playSoundNotification();
                    instance.openBoardIfClosed();
                }
            }
        } else {
            state.elapsedSeconds += deltaTime;
        }
        TimerStopwatchWidget.widgetStates.set(configId, state);
        TimerStopwatchWidget.notifyInstancesToUpdateDisplay(configId);
    }

    private static ensureGlobalInterval() {
        if (this.globalIntervalId == null) {
            this.globalIntervalId = window.setInterval(() => {
                let anyRunning = false;
                this.widgetStates.forEach((state, id) => {
                    if (state.running) {
                        anyRunning = true;
                        this.tick(id);
                    }
                });
                // すべて停止中ならintervalを解除
                if (!anyRunning && this.globalIntervalId != null) {
                    clearInterval(this.globalIntervalId);
                    this.globalIntervalId = null;
                }
            }, 500);
        }
    }

    private static clearGlobalIntervalIfNoneRunning() {
        if (Array.from(this.widgetStates.values()).every(state => !state.running)) {
            if (this.globalIntervalId != null) {
                clearInterval(this.globalIntervalId);
                this.globalIntervalId = null;
            }
        }
    }

    private static startGlobalTimer(configId: string) {
        let state = TimerStopwatchWidget.widgetStates.get(configId);
        if (!state) return;
        if (state.intervalId) {
            clearInterval(state.intervalId);
            state.intervalId = null;
        }
        state.running = true;
        state.lastTickTime = Date.now();
        TimerStopwatchWidget.widgetStates.set(configId, state);
        // インスタンスごとのintervalは使わず、グローバルintervalでtick
        this.ensureGlobalInterval();
        this.notifyInstancesToUpdateDisplay(configId);
    }

    private static stopGlobalTimer(configId: string) {
        const state = TimerStopwatchWidget.widgetStates.get(configId);
        if (state) {
            if (state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = null;
            }
            state.running = false;
            TimerStopwatchWidget.widgetStates.set(configId, state);
            this.clearGlobalIntervalIfNoneRunning();
            this.notifyInstancesToUpdateDisplay(configId);
        }
    }

    private static resetGlobalTimer(configId: string) {
        TimerStopwatchWidget.stopGlobalTimer(configId);
        const state = TimerStopwatchWidget.widgetStates.get(configId);
        if (state) {
            if (state.mode === 'timer') state.remainingSeconds = state.initialTimerSeconds;
            else state.elapsedSeconds = 0;
            TimerStopwatchWidget.widgetStates.set(configId, state);
            TimerStopwatchWidget.notifyInstancesToUpdateDisplay(configId);
        }
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
        this.plugin = plugin;
        // 設定に通知音・音量がない場合はデフォルト値をマージ
        this.currentSettings = {
            ...DEFAULT_TIMER_STOPWATCH_SETTINGS, // デフォルト値を先に展開
            ...(config.settings || {}) // 保存されている設定で上書き
        };
        this.config.settings = this.currentSettings; // configオブジェクトにも反映

        // --- Map方式に統一 ---
        TimerStopwatchWidget.widgetInstances.set(config.id, this);

        // --- グローバル状態から復元 ---
        let state = this.getInternalState();
        if (!state) {
            state = this.initializeInternalState();
        } else {
            this.currentSettings.timerMinutes = Math.floor(state.initialTimerSeconds / 60);
            this.currentSettings.timerSeconds = state.initialTimerSeconds % 60;
        }
        // グローバルintervalを必ず維持
        TimerStopwatchWidget.ensureGlobalInterval();

        const { widgetEl, titleEl } = createWidgetContainer(config, 'timer-stopwatch-widget');
        this.widgetEl = widgetEl;
        this.widgetEl.setAttribute('data-widget-type', this.id);
        titleEl!.textContent = this.config.title?.trim() || t(this.plugin.settings.language || 'ja', 'timerStopwatchTitle');
        titleEl!.classList.add('widget-title');

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
        this.buildUI(contentEl);
        this.updateDisplay();

        return this.widgetEl;
    }

    private buildUI(container: HTMLElement) {
        container.empty();
        this.modeSwitchContainer = container.createEl('div', { cls: 'timer-mode-switch setting-item' });
        const timerBtn = this.modeSwitchContainer.createEl('button', { text: t(this.plugin.settings.language || 'ja', 'timer'), cls: 'mod-timer' });
        const swBtn = this.modeSwitchContainer.createEl('button', { text: t(this.plugin.settings.language || 'ja', 'stopwatch'), cls: 'mod-stopwatch' });
        timerBtn.onclick = () => { this.handleSwitchMode('timer'); };
        swBtn.onclick = () => { this.handleSwitchMode('stopwatch'); };

        this.timerSetRowEl = container.createEl('div', { cls: 'timer-set-row setting-item' });
        this.timerSetRowEl.createSpan({ text: t(this.plugin.settings.language || 'ja', 'timerSettings') });
        const minWrap = this.timerSetRowEl.createSpan({ cls: "timer-input-wrap" });
        this.timerMinInput = minWrap.createEl('input', { type: 'number', cls: 'timer-input' });
        this.timerMinInput.setAttribute('min', '0'); this.timerMinInput.setAttribute('max', '999');
        minWrap.createSpan({ text: t(this.plugin.settings.language || 'ja', 'minutesShort') });
        const secWrap = this.timerSetRowEl.createSpan({ cls: "timer-input-wrap" });
        this.timerSecInput = secWrap.createEl('input', { type: 'number', cls: 'timer-input' });
        this.timerSecInput.setAttribute('min', '0'); this.timerSecInput.setAttribute('max', '59');
        secWrap.createSpan({ text: t(this.plugin.settings.language || 'ja', 'secondsShort') });
        // oninputではバリデーションと表示のみ
        this.timerMinInput.oninput = () => {
            const val = Math.max(0, Math.min(999, parseInt(this.timerMinInput.value) || 0));
            this.timerMinInput.value = String(val);
        };
        this.timerSecInput.oninput = () => {
            const val = Math.max(0, Math.min(59, parseInt(this.timerSecInput.value) || 0));
            this.timerSecInput.value = String(val);
        };
        // onblurでのみstateを更新
        this.timerMinInput.onblur = () => this.handleTimerSettingsChange();
        this.timerSecInput.onblur = () => this.handleTimerSettingsChange();

        this.displayEl = container.createEl('div', { cls: 'timer-display' });
        const controls = container.createEl('div', { cls: 'timer-controls setting-item' });
        this.startPauseBtn = controls.createEl('button');
        const resetBtn = controls.createEl('button', { text: t(this.plugin.settings.language || 'ja', 'reset') });
        setIcon(resetBtn, 'rotate-ccw');
        this.startPauseBtn.onclick = () => this.handleToggleStartPause();
        resetBtn.onclick = () => this.handleReset();
    }

    /**
     * UIを差分更新（値が変化した場合のみDOMを更新）
     */
    private updateDisplay() {
        if (!this.widgetEl || !this.displayEl || !this.timerMinInput) return;
        const state = this.getInternalState();
        if (!state) { this.displayEl.textContent = 'Error'; return; }

        const prev = this._prevDisplay;

        // モード切替ボタン
        const isTimer = state.mode === 'timer';
        if (prev.isTimer !== isTimer) {
            this.modeSwitchContainer.querySelector('.mod-timer')?.classList.toggle('is-active', isTimer);
            this.modeSwitchContainer.querySelector('.mod-stopwatch')?.classList.toggle('is-active', !isTimer);
            this.timerSetRowEl.style.display = isTimer ? '' : 'none';
            prev.isTimer = isTimer;
        }

        // 入力欄
        if (isTimer) {
            const minVal = String(Math.floor(state.initialTimerSeconds / 60));
            const secVal = String(state.initialTimerSeconds % 60);
            if (document.activeElement !== this.timerMinInput && prev.minVal !== minVal) {
                this.timerMinInput.value = minVal;
                prev.minVal = minVal;
            }
            if (document.activeElement !== this.timerSecInput && prev.secVal !== secVal) {
                this.timerSecInput.value = secVal;
                prev.secVal = secVal;
            }
        }

        // 表示時間
        const displaySeconds = isTimer ?
            ((state.running || (state.remainingSeconds < state.initialTimerSeconds && state.remainingSeconds > 0)) ? state.remainingSeconds : state.initialTimerSeconds)
            : state.elapsedSeconds;
        const timeStr = this.formatTime(displaySeconds);
        if (prev.timeStr !== timeStr) {
            this.displayEl.textContent = timeStr;
            prev.timeStr = timeStr;
        }

        // ボタン
        if (prev.running !== state.running) {
            this.startPauseBtn.setText(state.running ? t(this.plugin.settings.language || 'ja', 'pause') : t(this.plugin.settings.language || 'ja', 'start'));
            setIcon(this.startPauseBtn, state.running ? 'pause' : 'play');
            prev.running = state.running;
        }
    }

    private handleTimerSettingsChange() {
        // jsdom では valueAsNumber が NaN を返すことがあるため、文字列値から数値へ変換する
        const newMinutes = Math.max(0, Math.min(999, parseInt(this.timerMinInput.value) || 0));
        const newSeconds = Math.max(0, Math.min(59, parseInt(this.timerSecInput.value) || 0));

        this.currentSettings.timerMinutes = newMinutes; // インスタンスの設定も更新
        this.currentSettings.timerSeconds = newSeconds;

        const newInitialSeconds = newMinutes * 60 + newSeconds;
        // updateInternalStateを使わず、直接stateを書き換える
        const state = TimerStopwatchWidget.widgetStates.get(this.config.id);
        if (state) {
            state.initialTimerSeconds = newInitialSeconds;
            if (!state.running && state.mode === 'timer') {
                state.remainingSeconds = newInitialSeconds;
            }
            TimerStopwatchWidget.widgetStates.set(this.config.id, state);
        }

        // 入力欄の値のみを直接更新（再描画しない）
        if (document.activeElement !== this.timerMinInput) {
            this.timerMinInput.value = String(newMinutes);
        }
        if (document.activeElement !== this.timerSecInput) {
            this.timerSecInput.value = String(newSeconds);
        }

        // 残り時間表示など自分自身のみ再描画
        this.updateDisplay();

        if (this.config && this.plugin.saveData) {
            this.config.settings = { ...this.currentSettings };
            // グローバル設定の該当ウィジェット設定も更新
            const boards = this.plugin.settings.boards;
            const board = boards?.find(b => b.widgets?.some(w => w.id === this.config.id));
            if (board) {
                const widget = board.widgets.find(w => w.id === this.config.id);
                if (widget) {
                    widget.settings = { ...this.currentSettings };
                }
            }
            // 設定の永続化のみ（UI再描画はしない）
            this.plugin.saveData(this.plugin.settings);
        }
        // 他インスタンスへのnotifyInstancesToUpdateDisplay等は呼ばない
    }

    private handleSwitchMode(newMode: 'timer' | 'stopwatch') {
        TimerStopwatchWidget.stopGlobalTimer(this.config.id);
        this.updateInternalState(prevState => {
            const currentMins = parseInt(this.timerMinInput?.value || String(Math.floor(prevState.initialTimerSeconds / 60)));
            const currentSecs = parseInt(this.timerSecInput?.value || String(prevState.initialTimerSeconds % 60));
            const updatedInitialSeconds = (isNaN(currentMins) ? 0 : currentMins) * 60 + (isNaN(currentSecs) ? 0 : currentSecs);
            return {
                mode: newMode,
                running: false,
                initialTimerSeconds: updatedInitialSeconds,
                remainingSeconds: newMode === 'timer' ? updatedInitialSeconds : prevState.remainingSeconds,
                elapsedSeconds: newMode === 'stopwatch' ? 0 : prevState.elapsedSeconds,
            };
        });
    }

    private handleToggleStartPause() {
        const state = this.getInternalState();
        if (!state) return;
        if (state.running) {
            TimerStopwatchWidget.stopGlobalTimer(this.config.id);
        } else {
            // タイマー終了後（0秒）なら初期値にリセットしてからスタート
            if (state.mode === 'timer' && state.remainingSeconds === 0) {
                state.remainingSeconds = state.initialTimerSeconds;
                TimerStopwatchWidget.widgetStates.set(this.config.id, state);
            }
            TimerStopwatchWidget.startGlobalTimer(this.config.id);
        }
    }

    private handleReset() { TimerStopwatchWidget.resetGlobalTimer(this.config.id); }

    private formatTime(totalSeconds: number): string {
        const t = Math.max(0, Math.round(totalSeconds));
        const m = Math.floor(t / 60);
        const s = t % 60;
        return `${pad2(m)}:${pad2(s)}`;
    }

    // --- 通知音再生メソッド ---
    private playSoundNotification() {
        const {
            timerStopwatchNotificationSound: globalSound,
            timerStopwatchNotificationVolume: globalVolume
        } = this.plugin.settings;
        const soundType = globalSound ?? this.currentSettings.notificationSound ?? DEFAULT_TIMER_STOPWATCH_SETTINGS.notificationSound;
        const volume = (globalVolume !== undefined ? globalVolume : (this.currentSettings.notificationVolume ?? DEFAULT_TIMER_STOPWATCH_SETTINGS.notificationVolume ?? 0.5));

        if (soundType === 'off') return;

        if (this.currentAudioElement) {
            this.currentAudioElement.pause();
            this.currentAudioElement.currentTime = 0;
            this.currentAudioElement = null;
        }
        // AudioContextが再利用可能なら再利用、そうでなければ新規生成
        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new (
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
            )();
        }
        const ctx = this.audioContext;
        try {
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
                osc.onended = () => { ctx.close(); this.audioContext = null; };
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
                osc1.onended = () => { ctx.close(); this.audioContext = null; };
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
                    if (i === notes.length - 1) osc.onended = () => { ctx.close(); this.audioContext = null; };
                });
            }
        } catch {
            new Notice(t(this.plugin.settings.language || 'ja', 'soundPlaybackError'), 5000);
        }
    }

    private openBoardIfClosed() {
        if (this.plugin && this.plugin.boardManager.widgetBoardModals && Array.from(this.plugin.boardManager.widgetBoardModals.values()).every(m => !m.isOpen)) {
            // このウィジェットが属するボードIDを特定
            const boards = this.plugin.settings.boards;
            const board = boards?.find(b => b.widgets?.some(w => w.id === this.config.id));
            if (board) {
                this.plugin.openWidgetBoardById(board.id);
                new Notice(t(this.plugin.settings.language || 'ja', 'timerFinishedBoardOpened'));
            } else if (typeof this.plugin.openBoardPicker === 'function') {
                this.plugin.openBoardPicker();
                new Notice(t(this.plugin.settings.language || 'ja', 'timerFinishedPickerOpened'));
            }
        } else {
            new Notice(t(this.plugin.settings.language || 'ja', 'timerFinished'));
        }
    }

    /**
     * ウィジェット破棄時のクリーンアップ
     */
    onunload(): void {
        TimerStopwatchWidget.widgetInstances.delete(this.config.id);
        // 追加: widgetStatesからも状態を削除
        TimerStopwatchWidget.widgetStates.delete(this.config.id);
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(e => console.warn(`TimerStopwatchWidget [${this.config?.id}]: Error closing AudioContext on unload:`, e));
            this.audioContext = null;
        }
        if (this.currentAudioElement) {
            this.currentAudioElement.pause();
            this.currentAudioElement.src = "";
            this.currentAudioElement = null;
        }
        TimerStopwatchWidget.clearGlobalIntervalIfNoneRunning();
    }

    /**
     * すべてのインスタンスをクリーンアップ
     * @param plugin プラグイン本体
     */
    public static cleanupAllPersistentInstances(): void {
        this.widgetInstances.forEach(instance => {
            if (typeof instance.onunload === 'function') {
                instance.onunload();
            }
        });
        this.widgetInstances.clear();
        this.widgetStates.clear();
    }

    /**
     * 外部から設定変更を受けて状態・UIを更新
     * @param newSettings 新しい設定
     * @param widgetId 対象ウィジェットID
     */
    public async updateExternalSettings(newSettings: Partial<TimerStopwatchWidgetSettings>, widgetId?: string) {
        if (widgetId && this.config.id !== widgetId) return;

        const before = { ...this.currentSettings };
        this.currentSettings = { ...this.currentSettings, ...newSettings };

        if (this.config && this.config.settings) {
            Object.assign(this.config.settings, this.currentSettings);
        }

        const mins = this.currentSettings.timerMinutes ?? before.timerMinutes ?? 0;
        const secs = this.currentSettings.timerSeconds ?? before.timerSeconds ?? 0;
        const total = mins * 60 + secs;

        const state = TimerStopwatchWidget.widgetStates.get(this.config.id);
        if (state) {
            state.initialTimerSeconds = total;
            if (!state.running && state.mode === 'timer') {
                state.remainingSeconds = total;
            }
            TimerStopwatchWidget.widgetStates.set(this.config.id, state);
        }

        if (this.timerMinInput) this.timerMinInput.value = String(mins);
        if (this.timerSecInput) this.timerSecInput.value = String(secs);

        this.updateDisplay();
    }
}