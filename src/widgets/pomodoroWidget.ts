// src/widgets/pomodoroWidget.ts
import { App, MarkdownRenderer, Notice, setIcon, TFolder } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main'; // main.ts の WidgetBoardPlugin クラスをインポート
import { PomodoroMemoWidget, PomodoroMemoSettings } from './pomodoroMemoWidget';

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

// --- PomodoroWidget クラス ---
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

    private sessionLogs: SessionLog[] = [];
    private currentSessionStartTime: Date | null = null;
    private currentSessionEndTime: Date | null = null;

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
        this.saveRuntimeStateToSettings();
    }

    private cancelMemoEditMode() {
        this.memoWidget?.cancelEditMode();
    }

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

        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'pomodoro-timer-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);

        this.applyBackground(this.currentSettings.backgroundImageUrl);

        const titleEl = this.widgetEl.createEl('h4');
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
        this.memoWidget = new PomodoroMemoWidget(app, contentEl, { memoContent: this.currentSettings.memoContent });

        if (!this.initialized) {
            this.resetTimerState(this.currentPomodoroSet, true); 
        } else if (isReconfiguringForDifferentWidget) {
            this.resetTimerState(this.currentPomodoroSet, true); 
        } else {
            this.updateDisplay(); 
        }

        this.initialized = true;
        this.lastConfiguredId = newConfigId;
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
            case 'work': statusText = `作業中 (${this.currentSettings.workMinutes}分)`; break;
            case 'shortBreak': statusText = `短い休憩 (${this.currentSettings.shortBreakMinutes}分)`; break;
            case 'longBreak': statusText = `長い休憩 (${this.currentSettings.longBreakMinutes}分)`; break;
        }
        this.statusDisplayEl.textContent = statusText;
        this.cycleDisplayEl.textContent = `現在のサイクル: ${this.pomodorosCompletedInCycle} / ${this.currentSettings.pomodorosUntilLongBreak}`;
    }

    private toggleStartPause() { if (this.isRunning) this.pauseTimer(); else this.startTimer(); }

    private startTimer() {
        if (this.isRunning && this.timerId !== null) return;
        if (this.remainingTime <= 0 && this.currentPomodoroSet === 'work') {
            this.resetTimerState('work', true); // 作業セッションが0秒で開始されようとしたらリセット
        } else if (this.remainingTime <= 0) { // 休憩セッションが0秒なら終了処理へ
            this.handleSessionEnd(); return;
        }
        this.isRunning = true;
        if (this.timerId) clearInterval(this.timerId);
        this.timerId = window.setInterval(() => this.tick(), 1000);
        this.updateDisplay();
        this.currentSessionStartTime = new Date();
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} を開始しました。`);
    }

    private pauseTimer() {
        if (!this.isRunning || !this.timerId) return;
        this.isRunning = false;
        clearInterval(this.timerId);
        this.timerId = null;
        this.updateDisplay();
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} を一時停止しました。`);
    }

    private resetCurrentTimerConfirm() {
        this.pauseTimer(); // タイマーを止めてから状態をリセット
        // 現在のセッションタイプとサイクル数は維持して時間だけリセット
        this.resetTimerState(this.currentPomodoroSet, false); 
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} をリセットしました。`);
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

        // タイマーが動いていれば止める
        if (this.isRunning) {
            this.pauseTimer(); // isRunning と timerId を処理
        } else if(this.timerId) { // 動いていないがタイマーIDが残っている場合もクリア
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.isRunning = false; // 確実に停止状態にする
        this.updateDisplay();
        this.saveRuntimeStateToSettings();
    }

    private tick() {
        if (!this.isRunning) return;
        this.remainingTime--;
        this.updateDisplay();
        if (this.remainingTime <= 0) { this.handleSessionEnd(); }
    }

    private playSoundNotification() {
        const globalSound = this.plugin.settings.pomodoroNotificationSound;
        const globalVolume = this.plugin.settings.pomodoroNotificationVolume;
        const soundType = globalSound ?? this.currentSettings.notificationSound;
        const volume = (globalVolume !== undefined ? globalVolume : this.currentSettings.notificationVolume);

        if (soundType === 'off') return;

        if (this.currentAudioElement) {
            this.currentAudioElement.pause(); this.currentAudioElement.currentTime = 0; this.currentAudioElement = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }

        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.audioContext = ctx;
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
                osc.onended = () => ctx.close().catch(e => console.error("Error closing AudioContext for beep", e));
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
                osc1.onended = () => ctx.close().catch(e => console.error("Error closing AudioContext for bell", e));
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
                    if (i === notes.length - 1) osc.onended = () => ctx.close().catch(e => console.error("Error closing AudioContext for chime", e));
                });
            }
        } catch (e) { new Notice('音声の再生に失敗しました'); console.error("Error playing sound:", e); }
    }

    private async handleSessionEnd() {
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        this.isRunning = false;
        this.currentSessionEndTime = new Date();
        if (this.currentPomodoroSet === 'work' && this.currentSessionStartTime && this.currentSessionEndTime) {
            const startDate = this.currentSessionStartTime;
            const endDate = this.currentSessionEndTime;
            const pad = (n: number) => n.toString().padStart(2, '0');
            const dateStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
            const startStr = `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`;
            const endStr = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
            this.sessionLogs.push({
                date: dateStr,
                start: startStr,
                end: endStr,
                memo: this.memoWidget?.getMemoContent() || ''
            });
        }
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
        } else { // 休憩終了
            if(this.currentPomodoroSet === 'shortBreak') msg = `短い休憩 (${this.currentSettings.shortBreakMinutes}分) が終了。`;
            else msg = `長い休憩 (${this.currentSettings.longBreakMinutes}分) が終了。`;
            
            // 長い休憩が終わった時だけサイクル数をリセット
            this.resetTimerState('work', this.currentPomodoroSet === 'longBreak');
            msg += "作業セッションを開始してください。";
        }
        new Notice(msg, 7000);
        this.playSoundNotification(); 
        if (this.plugin && (!this.plugin.widgetBoardModals || Array.from(this.plugin.widgetBoardModals.values()).every(m => !m.isOpen))) {
            if (this.plugin.settings.lastOpenedBoardId) {
                 this.plugin.openWidgetBoardById(this.plugin.settings.lastOpenedBoardId);
            } else {
                this.plugin.openBoardPicker();
            }
        }
        this.updateDisplay();
        this.saveRuntimeStateToSettings();
        if (this.currentSettings.exportFormat && this.currentSettings.exportFormat !== 'none') {
            await this.exportSessionLogs(this.currentSettings.exportFormat);
        }
    }
    
    private skipToNextSessionConfirm() {
        this.handleSessionEnd(); // 既存のセッション終了処理を呼ぶ
        new Notice("次のセッションへスキップしました。");
    }

    onunload(): void {
        const widgetIdLog = `[${this.config?.id || 'PomodoroWidget'}]`;
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        this.isRunning = false;
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(err => console.error(`${widgetIdLog} Error closing AudioContext:`, err));
        }
        if (this.currentAudioElement) {
            this.currentAudioElement.pause(); this.currentAudioElement.src = ""; this.currentAudioElement = null;
        }
        (this.constructor as typeof PomodoroWidget).widgetInstances.delete(this.config?.id);
    }
    
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
            this.updateDisplay(); // 表示を更新 (サイクル数や残り時間には影響しないはず)
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

    public static cleanupAllPersistentInstances(plugin: WidgetBoardPlugin): void {
        PomodoroWidget.widgetInstances.clear();
    }

    private async exportSessionLogs(format: PomodoroExportFormat) {
        if (this.sessionLogs.length === 0) {
            new Notice("エクスポートするログがありません。");
            return;
        }
        let content = '';
        let ext = '';

        if (format === 'csv') {
            content = 'date,start,end,memo\n' + this.sessionLogs.map(log => 
                `${log.date},${log.start},${log.end},"${(log.memo || '').replace(/"/g, '""')}"`
            ).join('\n');
            ext = 'csv';
        } else if (format === 'json') {
            content = JSON.stringify(this.sessionLogs, null, 2);
            ext = 'json';
        } else if (format === 'markdown') {
            content = '| date | start | end | memo |\n|---|---|---|---|\n' + this.sessionLogs.map(log => 
                `| ${log.date} | ${log.start} | ${log.end} | ${(log.memo || '').replace(/\|/g, '\\|')} |`
            ).join('\n');
            ext = 'md';
        } else {
            return; // 'none' or unknown format
        }
        const sanitizedTitle = (this.config.title || 'pomodoro-log').replace(/[\\/:*?"<>|]/g, '_');
        const exportFolderName = 'PomodoroLogs'; 
        
        try {
            const folderExists = await this.app.vault.adapter.exists(exportFolderName);
            if (!folderExists) {
                await this.app.vault.createFolder(exportFolderName);
            }
        } catch (e) {
            new Notice(`ログフォルダの作成に失敗: ${exportFolderName}\nVault直下に保存します。`, 7000);
            console.error(`Failed to create/access folder ${exportFolderName}: `, e);
            
            const filePath = `${sanitizedTitle}.${ext}`;
            try {
                const existingFile = this.app.vault.getAbstractFileByPath(filePath);
                if (existingFile) {
                    await this.app.vault.modify(existingFile as any, content);
                } else {
                    await this.app.vault.create(filePath, content);
                }
                new Notice(`ポモドーロログを ${filePath} に保存しました。`);
            } catch (fileError) {
                 new Notice('ポモドーロログの保存に失敗しました: ' + (fileError?.message || fileError), 7000);
            }
            this.sessionLogs = []; // Clear logs after attempting export, even if fallback path
            return;
        }

        const filePathInFolder = `${exportFolderName}/${sanitizedTitle}.${ext}`;
        try {
            const existingFile = this.app.vault.getAbstractFileByPath(filePathInFolder);
            if (existingFile) {
                await this.app.vault.modify(existingFile as any, content);
            } else {
                await this.app.vault.create(filePathInFolder, content);
            }
            new Notice(`ポモドーロログを ${filePathInFolder} に保存しました。`);
            this.sessionLogs = []; // エクスポート後にログをクリア
        } catch (e) {
            new Notice('ポモドーロログの保存に失敗しました: ' + (e?.message || e), 7000);
            console.error(`Failed to save pomodoro log to ${filePathInFolder}: `, e);
        }
    }

    private saveRuntimeStateToSettings() {
        if (!this.config || !this.config.settings) return; // config と config.settings の存在を確認
        // currentSettings が常に config.settings を指すようにしていれば、
        // this.config.settings.pomodorosCompletedInCycle = this.pomodorosCompletedInCycle;
        // this.config.settings.currentPomodoroSet = this.currentPomodoroSet;
        // は実質的に this.currentSettings のプロパティを更新していることになる。
        // ただし、明示的に this.currentSettings のプロパティを更新し、
        // config.settings が this.currentSettings を参照するようにするのが一貫性がある。

        // currentSettings はインスタンスの作業コピーなので、まずこれを更新
        this.currentSettings.pomodorosCompletedInCycle = this.pomodorosCompletedInCycle;
        this.currentSettings.currentPomodoroSet = this.currentPomodoroSet;

        // config.settings も確実に currentSettings と同期させる
        // create や updateExternalSettings で config.settings = this.currentSettings または Object.assign
        // を行っているため、基本的には同期しているはずだが、念のため。
        if (this.config.settings !== this.currentSettings) {
             Object.assign(this.config.settings, {
                pomodorosCompletedInCycle: this.pomodorosCompletedInCycle,
                currentPomodoroSet: this.currentPomodoroSet
            });
        }
    }
}