import { App, Notice, setIcon } from 'obsidian';

interface WidgetConfig {
    id: string;
    title?: string;
    settings?: any;
}

interface WidgetImplementation {
    id: string;
    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement;
    onunload?(): void;
}

interface WidgetBoardPlugin {
    manifest: { id: string; [key: string]: any }; // プラグインIDを含むマニフェスト
    saveSettings: (boardId?: string) => Promise<void>;
    widgetBoardModals?: Map<string, { isOpen: boolean }>;
    settings: { lastOpenedBoardId?: string };
    openWidgetBoardById: (id: string) => void;
    openBoardPicker: () => void;
}

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

    // --- 音声関連プロパティ ---
    private audioContext: AudioContext | null = null;
    private currentAudioElement: HTMLAudioElement | null = null;

    private static widgetStates: Map<string, TimerStopwatchState> = new Map();
    private static widgetInstances: Map<string, TimerStopwatchWidget> = new Map();
    private static globalIntervalId: number | null = null; // グローバルtick用

    /**
     * インスタンス初期化
     */
    constructor() {
        // ... 既存コード ...
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
                this.widgetStates.forEach((state, id) => {
                    if (state.running) this.tick(id);
                });
            }, 250);
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

        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'timer-stopwatch-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);
        this.widgetEl.setAttribute('data-widget-type', this.id);

        const titleEl = this.widgetEl.createEl('h4');
        titleEl.textContent = this.config.title?.trim() || 'タイマー / ストップウォッチ';
        titleEl.classList.add('widget-title');

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
        this.buildUI(contentEl);
        this.updateDisplay();

        return this.widgetEl;
    }

    private buildUI(container: HTMLElement) {
        container.empty();
        this.modeSwitchContainer = container.createEl('div', { cls: 'timer-mode-switch setting-item' });
        const timerBtn = this.modeSwitchContainer.createEl('button', { text: 'タイマー', cls: 'mod-timer' });
        const swBtn = this.modeSwitchContainer.createEl('button', { text: 'ストップウォッチ', cls: 'mod-stopwatch' });
        timerBtn.onclick = () => { this.handleSwitchMode('timer'); };
        swBtn.onclick = () => { this.handleSwitchMode('stopwatch'); };

        this.timerSetRowEl = container.createEl('div', { cls: 'timer-set-row setting-item' });
        this.timerSetRowEl.createSpan({ text: 'タイマー設定:' });
        const minWrap = this.timerSetRowEl.createSpan({ cls: "timer-input-wrap" });
        this.timerMinInput = minWrap.createEl('input', { type: 'number', cls: 'timer-input' });
        this.timerMinInput.setAttribute('min', '0'); this.timerMinInput.setAttribute('max', '999');
        minWrap.createSpan({ text: '分' });
        const secWrap = this.timerSetRowEl.createSpan({ cls: "timer-input-wrap" });
        this.timerSecInput = secWrap.createEl('input', { type: 'number', cls: 'timer-input' });
        this.timerSecInput.setAttribute('min', '0'); this.timerSecInput.setAttribute('max', '59');
        secWrap.createSpan({ text: '秒' });
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
        const resetBtn = controls.createEl('button', { text: 'リセット' });
        setIcon(resetBtn, 'rotate-ccw');
        this.startPauseBtn.onclick = () => this.handleToggleStartPause();
        resetBtn.onclick = () => this.handleReset();

        const themeSelector = container.createEl('div', { cls: 'theme-selector setting-item' });
        const radioLight = themeSelector.createEl('input', { type: 'radio', name: 'theme', value: 'light' });
        const radioDark = themeSelector.createEl('input', { type: 'radio', name: 'theme', value: 'dark' });
        radioLight.onchange = () => {
            if (radioLight.checked) {
                customCss.setBaseTheme('light');
                customCss.setTheme(''); // デフォルトテーマを再適用
                new Notice('ベーステーマ「ライト」を適用しました。');
                this.renderThemeSelector(container);
            }
        };
        radioDark.onchange = () => {
            if (radioDark.checked) {
                customCss.setBaseTheme('dark');
                customCss.setTheme(''); // デフォルトテーマを再適用
                new Notice('ベーステーマ「ダーク」を適用しました。');
                this.renderThemeSelector(container);
            }
        };
    }

    /**
     * UIを差分更新（値が変化した場合のみDOMを更新）
     */
    private updateDisplay() {
        if (!this.widgetEl || !this.displayEl || !this.timerMinInput) return;
        const state = this.getInternalState();
        if (!state) { this.displayEl.textContent = 'Error'; return; }

        // 差分更新用に前回値を保持
        if (!(this as any)._prevDisplay) (this as any)._prevDisplay = {};
        const prev = (this as any)._prevDisplay;

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
            this.startPauseBtn.setText(state.running ? '一時停止' : 'スタート');
            setIcon(this.startPauseBtn, state.running ? 'pause' : 'play');
            prev.running = state.running;
        }
    }

    private handleTimerSettingsChange() {
        const newMinutes = Math.max(0, Math.min(999, parseInt(this.timerMinInput.valueAsNumber.toFixed(0)) || 0));
        const newSeconds = Math.max(0, Math.min(59, parseInt(this.timerSecInput.valueAsNumber.toFixed(0)) || 0));

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

        if (this.config && this.plugin.saveSettings) {
            // 保存する設定は currentSettings を参照する
            this.config.settings = { ...this.currentSettings }; // 音量設定なども含める
            this.plugin.saveSettings();
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
        if (state.running) TimerStopwatchWidget.stopGlobalTimer(this.config.id);
        else TimerStopwatchWidget.startGlobalTimer(this.config.id);
    }

    private handleReset() { TimerStopwatchWidget.resetGlobalTimer(this.config.id); }

    private formatTime(totalSeconds: number): string {
        const t = Math.max(0, Math.round(totalSeconds));
        const m = Math.floor(t / 60);
        const s = t % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // --- 通知音再生メソッド ---
    private playSoundNotification() {
        const globalSound = (this.plugin.settings as any).timerStopwatchNotificationSound;
        const globalVolume = (this.plugin.settings as any).timerStopwatchNotificationVolume;
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
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
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
        } catch (error) {
            new Notice('通知音の再生中にエラーが発生しました。', 5000);
        }
    }

    private openBoardIfClosed() {
        if (this.plugin && this.plugin.widgetBoardModals && Array.from(this.plugin.widgetBoardModals.values()).every(m => !m.isOpen)) {
            if (this.plugin.settings?.lastOpenedBoardId) {
                this.plugin.openWidgetBoardById(this.plugin.settings.lastOpenedBoardId);
                new Notice('タイマー終了: ウィジェットボードを開きました。');
            } else if (typeof this.plugin.openBoardPicker === 'function') {
                this.plugin.openBoardPicker();
                new Notice('タイマー終了: ボードピッカーを開きました。');
            }
        } else {
            new Notice('タイマーが終了しました！');
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
    }

    /**
     * すべてのインスタンスをクリーンアップ
     * @param plugin プラグイン本体
     */
    public static cleanupAllPersistentInstances(plugin: WidgetBoardPlugin): void {
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
        // ... 既存コード ...
    }
}