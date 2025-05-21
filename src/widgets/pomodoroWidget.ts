// src/widgets/pomodoroWidget.ts
import { App, MarkdownRenderer, Notice, setIcon } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main'; // main.ts の WidgetBoardPlugin クラスをインポート

// --- 通知音の種類の型定義 ---
export type PomodoroSoundType = 'off' | 'default_beep' | 'bell' | 'chime';

// --- ポモドーロウィジェット設定インターフェース ---
export interface PomodoroSettings {
    workMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    pomodorosUntilLongBreak: number;
    backgroundImageUrl?: string;
    memoContent?: string; // ★ このメモ内容の保存が問題
    notificationSound: PomodoroSoundType;
    notificationVolume: number;
    // 以下の2つはユーザーが提供したコードに含まれていたが、
    // notificationSoundで種類を管理するなら重複する可能性あり。
    // notificationSoundTypeはPomodoroSoundTypeと実質同じ役割。
    // customSoundPathは、もし 'custom' を PomodoroSoundType に追加する場合に必要。
    // 今回の修正では、notificationSound を 'off', 'default_beep', 'bell', 'chime' で管理する前提で進めます。
    // notificationSoundType?: 'default_beep' | 'custom'; // PomodoroSoundTypeで代替
    // customSoundPath?: string; // notificationSound が 'custom' の場合に参照
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
    notificationVolume: 0.2, // 0.0 から 1.0 の値
    // notificationSoundType: 'default_beep', // PomodoroSoundTypeで管理するためコメントアウト
    // customSoundPath: '',
};

// --- PomodoroWidget クラス ---
export class PomodoroWidget implements WidgetImplementation {
    id = 'pomodoro';
    private config!: WidgetConfig; // このインスタンスが作成されたときのconfig（コピーの可能性あり）
    private app!: App;
    private plugin!: WidgetBoardPlugin; // WidgetBoardPlugin のインスタンスへの参照

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

    // メモ関連のUI要素
    private memoContainerEl!: HTMLElement;
    private memoDisplayEl!: HTMLElement;
    private memoEditContainerEl!: HTMLElement;
    private memoEditAreaEl!: HTMLTextAreaElement;
    private editMemoButtonEl!: HTMLButtonElement;
    private saveMemoButtonEl!: HTMLButtonElement;
    private cancelMemoButtonEl!: HTMLButtonElement;
    private isEditingMemo: boolean = false;

    private currentSettings!: PomodoroSettings; // このインスタンスの現在の作業用設定
    private lastConfiguredId?: string; // 最後に設定されたウィジェットID（再設定判定用）
    private audioContext: AudioContext | null = null;
    private currentAudioElement: HTMLAudioElement | null = null;

    // ウィジェットインスタンス管理のための静的マップ (MemoWidgetと同様のパターン)
    private static widgetInstances: Map<string, PomodoroWidget> = new Map();


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
            this.memoDisplayEl.style.display = 'block'; // または ''
            await MarkdownRenderer.render(this.app, trimmedContent, this.memoDisplayEl, this.config.id, this.plugin);
        } else if (!this.isEditingMemo) {
            this.memoDisplayEl.style.display = 'none';
        }
    }

    private updateMemoEditUI() {
        if (!this.memoDisplayEl || !this.memoEditContainerEl || !this.editMemoButtonEl) return;
        const hasMemoContent = this.currentSettings.memoContent && this.currentSettings.memoContent.trim() !== '';

        this.memoDisplayEl.style.display = this.isEditingMemo ? 'none' : (hasMemoContent ? 'block' : 'none');
        this.memoEditContainerEl.style.display = this.isEditingMemo ? 'flex' : 'none'; // 編集コンテナはflex
        this.editMemoButtonEl.style.display = this.isEditingMemo ? 'none' : '';

        if (this.isEditingMemo) {
            if (this.memoEditAreaEl) this.memoEditAreaEl.focus();
        } else {
            this.renderMemo(this.currentSettings.memoContent);
        }
    }

    private enterMemoEditMode() {
        this.isEditingMemo = true;
        if (this.memoEditAreaEl) {
            this.memoEditAreaEl.value = this.currentSettings.memoContent || '';
        }
        this.updateMemoEditUI();
    }

    // ★★★ メモ保存ロジックの修正 (MemoWidgetと同様の堅牢な保存方法) ★★★
    private async saveMemoChanges() {
        const widgetIdLog = `[PomodoroWidget ${this.config.id}]`; // ログ用ID

        if (!this.memoEditAreaEl) {
            console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: memoEditAreaEl is null!`);
            this.isEditingMemo = false;
            this.updateMemoEditUI();
            return;
        }

        const newMemo = this.memoEditAreaEl.value;
        this.isEditingMemo = false; // 先に編集モードを終了

        if (newMemo !== (this.currentSettings.memoContent || '')) {
            console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: Content WILL change. Old: "${this.currentSettings.memoContent}", New: "${newMemo}"`);
            this.currentSettings.memoContent = newMemo; // 1. インスタンスの作業用設定を更新

            // 2. プラグインの永続化データ内の該当ウィジェット設定を「直接」更新
            let settingsUpdatedInGlobalStore = false;
            let currentModalBoardId: string | undefined = undefined;
            if (this.plugin.widgetBoardModals) {
                for (const [boardId, modal] of this.plugin.widgetBoardModals.entries()) {
                    if (modal.isOpen) {
                        currentModalBoardId = boardId;
                        break;
                    }
                }
            }

            if (!currentModalBoardId) {
                console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: Critical - currentModalBoardId is not available.`);
                new Notice("エラー: 現在のボードを特定できず、メモを保存できませんでした。", 7000);
                this.updateMemoEditUI();
                return;
            }

            // console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: Targeting board ID '${currentModalBoardId}' in global plugin settings.`);
            const boardInGlobalSettings = this.plugin.settings.boards.find(b => b.id === currentModalBoardId);

            if (boardInGlobalSettings) {
                const widgetInGlobalSettings = boardInGlobalSettings.widgets.find(w => w.id === this.config.id);
                if (widgetInGlobalSettings) {
                    if (!widgetInGlobalSettings.settings) {
                        // console.warn(`${widgetIdLog} SAVE_MEMO_CHANGES: widgetInGlobalSettings.settings was undefined for Pomodoro. Initializing.`);
                        widgetInGlobalSettings.settings = { ...DEFAULT_POMODORO_SETTINGS }; // ポモドーロのデフォルトで初期化
                    }
                    // console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: memoContent in global store (BEFORE update): "${widgetInGlobalSettings.settings.memoContent}"`);
                    widgetInGlobalSettings.settings.memoContent = newMemo; // ★★★ 直接更新
                    settingsUpdatedInGlobalStore = true;
                    // console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: memoContent in global store (AFTER update): "${widgetInGlobalSettings.settings.memoContent}"`);
                } else {
                    console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: Pomodoro Widget with ID '${this.config.id}' NOT FOUND in global board settings for board '${boardInGlobalSettings.name}'.`);
                }
            } else {
                console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: Board with ID '${currentModalBoardId}' NOT FOUND in global plugin settings.`);
            }

            if (settingsUpdatedInGlobalStore) {
                console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: Calling this.plugin.saveSettings() to persist changes.`);
                await this.plugin.saveSettings();
                // new Notice(`ポモドーロメモ「${this.config.title || '無題'}」を保存しました。`);
            } else {
                console.error(`${widgetIdLog} SAVE_MEMO_CHANGES: Did not update global settings store due to lookup failure. Save not fully effective.`);
                new Notice("ポモドーロメモの保存に失敗しました (データ不整合の可能性あり)。", 5000);
            }
        } else {
            // console.log(`${widgetIdLog} SAVE_MEMO_CHANGES: Memo content did not change. No save action taken.`);
        }
        this.updateMemoEditUI(); // UIを表示モードに更新 (renderMemoが呼ばれる)
    }

    private cancelMemoEditMode() {
        this.isEditingMemo = false;
        this.updateMemoEditUI(); // 保存せずに表示モードに戻す (renderMemoが呼ばれる)
    }

    create(config: WidgetConfig, app: App, plugin: WidgetBoardPlugin): HTMLElement {
        (this.constructor as typeof PomodoroWidget).widgetInstances.set(config.id, this);

        const newConfigId = config.id;
        const isReconfiguringForDifferentWidget = this.initialized && this.lastConfiguredId !== newConfigId;

        this.config = config;
        this.app = app;
        this.plugin = plugin;

        if (!this.initialized || isReconfiguringForDifferentWidget) {
            this.currentSettings = { ...DEFAULT_POMODORO_SETTINGS, ...(config.settings || {}) };
            this.pomodorosCompletedInCycle = 0;
            this.currentPomodoroSet = 'work';
            this.isRunning = false;
            if (this.timerId) clearInterval(this.timerId);
            this.timerId = null;
            this.isEditingMemo = false;
        } else {
            // 既存インスタンスの設定を、渡されたconfig.settings (おそらく外部変更の結果) でマージ更新
            const newSettingsFromConfig = config.settings as Partial<PomodoroSettings> || {};
            this.currentSettings = { ...this.currentSettings, ...newSettingsFromConfig };
        }
        // このインスタンスが参照するconfigオブジェクトのsettingsもcurrentSettingsを指すようにする
        // (ただし、このconfig自体がグローバル設定のコピーである点に注意)
        config.settings = this.currentSettings;

        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'pomodoro-timer-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);

        this.applyBackground(this.currentSettings.backgroundImageUrl);

        const titleEl = this.widgetEl.createEl('h4');
        titleEl.textContent = this.config.title || "ポモドーロタイマー";
        if (!this.config.title || this.config.title.trim() === "") {
            titleEl.style.display = 'none'; // タイトルが空なら非表示 (CSSでマージン等も調整推奨)
        } else {
            titleEl.style.display = '';
        }

        const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
        // Pomodoroのwidget-contentは中央揃えなどCSSでスタイルされている想定
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
        
        // メモUIのセットアップ (Pomodoroウィジェット内のメモ)
        this.memoContainerEl = contentEl.createDiv({ cls: 'pomodoro-memo-container' });
        // CSSで .pomodoro-memo-container に display:flex, flex-direction:column, flex-grow:1などを設定想定

        const memoHeaderEl = this.memoContainerEl.createDiv({ cls: 'pomodoro-memo-header' });
        // CSSで .pomodoro-memo-header に flex-shrink:0などを設定想定
        
        this.editMemoButtonEl = memoHeaderEl.createEl('button', { cls: 'pomodoro-memo-edit-button' });
        setIcon(this.editMemoButtonEl, 'pencil');
        this.editMemoButtonEl.setAttribute('aria-label', 'メモを編集/追加');
        this.editMemoButtonEl.onClickEvent(() => this.enterMemoEditMode());

        this.memoDisplayEl = this.memoContainerEl.createDiv({ cls: 'pomodoro-memo-display' });
        // CSSで .pomodoro-memo-display に flex-grow:1, overflow-y:autoなどを設定想定

        this.memoEditContainerEl = this.memoContainerEl.createDiv({ cls: 'pomodoro-memo-edit-container' });
        this.memoEditContainerEl.style.display = 'none'; 
        // CSSで .pomodoro-memo-edit-container に display:flex(JS制御), flex-direction:column, flex-grow:1などを設定想定

        this.memoEditAreaEl = this.memoEditContainerEl.createEl('textarea', { cls: 'pomodoro-memo-edit-area' });
        // CSSで .pomodoro-memo-edit-area に flex-grow:1, width:100%などを設定想定
        
        const memoEditControlsEl = this.memoEditContainerEl.createDiv({ cls: 'pomodoro-memo-edit-controls' });
        // CSSで .pomodoro-memo-edit-controls に flex-shrink:0などを設定想定

        this.saveMemoButtonEl = memoEditControlsEl.createEl('button', { text: '保存' });
        this.saveMemoButtonEl.addClass('mod-cta');
        this.cancelMemoButtonEl = memoEditControlsEl.createEl('button', { text: 'キャンセル' });
        this.saveMemoButtonEl.onClickEvent(() => this.saveMemoChanges());
        this.cancelMemoButtonEl.onClickEvent(() => this.cancelMemoEditMode());
        
        this.isEditingMemo = false;
        this.updateMemoEditUI(); // これがrenderMemoを呼ぶ

        // タイマー状態の初期化/復元
        if (!this.initialized || isReconfiguringForDifferentWidget) {
            this.resetTimerState(this.currentPomodoroSet, true);
        } else if (!this.isRunning && this.lastConfiguredId === newConfigId) {
            this.resetTimerState(this.currentPomodoroSet, false);
        } else {
            this.updateDisplay(); // 既存の状態を再表示
        }

        this.initialized = true;
        this.lastConfiguredId = newConfigId;
        // this.updateDisplay(); // resetTimerStateや既存状態の表示でカバーされるはず

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
            this.resetTimerState('work', true);
        } else if (this.remainingTime <= 0) {
            this.handleSessionEnd(); return;
        }
        this.isRunning = true;
        if (this.timerId) clearInterval(this.timerId);
        this.timerId = window.setInterval(() => this.tick(), 1000);
        this.updateDisplay();
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
        this.pauseTimer();
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
        if (resetCycleCount) this.pomodorosCompletedInCycle = 0;

        if (this.isRunning) this.pauseTimer(); // pauseTimerがisRunningとtimerIdを処理
        else if(this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        // isRunning は pauseTimer の中で false になる。明示的に再度 false にしても問題ない。
        this.isRunning = false;
        this.updateDisplay();
    }

    private tick() {
        if (!this.isRunning) return;
        this.remainingTime--;
        this.updateDisplay();
        if (this.remainingTime <= 0) { this.handleSessionEnd(); }
    }

    private playSoundNotification() {
        if (this.currentSettings.notificationSound === 'off') return;
        const volume = Math.max(0, Math.min(1, this.currentSettings.notificationVolume));

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
            const soundType = this.currentSettings.notificationSound;
            if (soundType === 'default_beep') {
                // シンプルなビープ
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                gain.gain.setValueAtTime(volume, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.7);
                osc.onended = () => ctx.close();
            } else if (soundType === 'bell') {
                // ベル音: 2つの三角波を重ねる
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();
                osc1.type = 'triangle';
                osc2.type = 'triangle';
                osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
                osc2.frequency.setValueAtTime(1320, ctx.currentTime); // E6
                gain.gain.setValueAtTime(volume, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
                osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
                osc1.start(ctx.currentTime); osc2.start(ctx.currentTime);
                osc1.stop(ctx.currentTime + 0.8); osc2.stop(ctx.currentTime + 0.8);
                osc2.detune.setValueAtTime(5, ctx.currentTime + 0.2); // 少し揺らす
                osc1.onended = () => ctx.close();
            } else if (soundType === 'chime') {
                // チャイム音: 3音アルペジオ
                const notes = [523.25, 659.25, 784.0]; // C5, E5, G5
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
                    if (i === notes.length - 1) osc.onended = () => ctx.close();
                });
            }
        } catch (error) { new Notice('通知音の再生中にエラーが発生しました。', 5000); }
    }

    private handleSessionEnd() {
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        this.isRunning = false;
        let msg = "";
        if (this.currentPomodoroSet === 'work') {
            this.pomodorosCompletedInCycle++;
            msg = `作業セッション (${this.currentSettings.workMinutes}分) が終了。`;
            if (this.pomodorosCompletedInCycle >= this.currentSettings.pomodorosUntilLongBreak) {
                this.resetTimerState('longBreak', false); msg += "長い休憩を開始してください。";
            } else {
                this.resetTimerState('shortBreak', false); msg += "短い休憩を開始してください。";
            }
        } else {
            if(this.currentPomodoroSet === 'shortBreak') msg = `短い休憩 (${this.currentSettings.shortBreakMinutes}分) が終了。`;
            else msg = `長い休憩 (${this.currentSettings.longBreakMinutes}分) が終了。`;
            this.resetTimerState('work', this.currentPomodoroSet === 'longBreak');
            msg += "作業セッションを開始してください。";
        }
        new Notice(msg, 7000);
        this.playSoundNotification(); 
        if (this.plugin && (!this.plugin.widgetBoardModals || Array.from(this.plugin.widgetBoardModals.values()).every(m => !m.isOpen))) {
            // ボードIDを指定して開くように変更 (this.config.id はこのウィジェットのIDなので、
            // これが属するボードのIDを特定する必要がある。モーダルが開いていないので難しい)
            // ここでは、最後に開いたボードを開くか、ピッカーを開くのが適切かもしれない。
            // 簡単のため、最後に開いたボードIDを使う。
            if (this.plugin.settings.lastOpenedBoardId) {
                 this.plugin.openWidgetBoardById(this.plugin.settings.lastOpenedBoardId);
            } else {
                this.plugin.openBoardPicker(); // フォールバック
            }
        }
        this.updateDisplay();
    }
    
    private skipToNextSessionConfirm() {
        this.handleSessionEnd();
        new Notice("次のセッションへスキップしました。");
    }

    onunload(): void {
        const widgetIdLog = `[${this.config?.id || 'PomodoroWidget'}]`;
        // console.log(`${widgetIdLog} onunload: Clearing timer, closing AudioContext, stopping audio element.`);
        if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        this.isRunning = false;
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(err => console.error(`${widgetIdLog} Error closing AudioContext:`, err));
        }
        if (this.currentAudioElement) {
            this.currentAudioElement.pause(); this.currentAudioElement.src = ""; this.currentAudioElement = null;
        }
        (this.constructor as typeof PomodoroWidget).widgetInstances.delete(this.config?.id); // nullチェック追加
    }
    
    public async updateExternalSettings(newSettings: Partial<PomodoroSettings>, widgetId?: string) {
        if (widgetId && this.config?.id !== widgetId) return;
        // const widgetIdLog = `[${this.config.id}]`;
        // console.log(`${widgetIdLog} updateExternalSettings: Old=`, JSON.parse(JSON.stringify(this.currentSettings)), "New=", JSON.parse(JSON.stringify(newSettings)));

        const oldSettings = { ...this.currentSettings };
        this.currentSettings = { ...this.currentSettings, ...newSettings };
        if (this.config && this.config.settings) { // this.config の存在も確認
            Object.assign(this.config.settings, this.currentSettings);
        }
        // console.log(`${widgetIdLog} updateExternalSettings: Merged currentSettings=`, JSON.parse(JSON.stringify(this.currentSettings)));

        if (oldSettings.backgroundImageUrl !== this.currentSettings.backgroundImageUrl) {
            this.applyBackground(this.currentSettings.backgroundImageUrl);
        }
        // メモ内容の外部変更（設定タブからなど）は、Pomodoroウィジェットでは通常発生しない想定だが、念のため
        if (oldSettings.memoContent !== this.currentSettings.memoContent && !this.isEditingMemo) {
            await this.renderMemo(this.currentSettings.memoContent);
        }

        const timerRelatedSettingsChanged = 
            oldSettings.workMinutes !== this.currentSettings.workMinutes ||
            oldSettings.shortBreakMinutes !== this.currentSettings.shortBreakMinutes ||
            oldSettings.longBreakMinutes !== this.currentSettings.longBreakMinutes ||
            oldSettings.pomodorosUntilLongBreak !== this.currentSettings.pomodorosUntilLongBreak;

        if (!this.isRunning && timerRelatedSettingsChanged) {
            this.resetTimerState(this.currentPomodoroSet, false); 
        } else {
             this.updateDisplay(); // pomodorosUntilLongBreak変更時など、表示のみ更新
        }

        if (!this.isEditingMemo) {
            this.updateMemoEditUI();
        }
        
        // ★重要: updateExternalSettings は、通常 plugin.saveSettings() が呼び出された結果としてモーダル更新のために呼び出される。
        // ここで再度 plugin.saveSettings() を呼ぶと無限ループや予期せぬ動作の原因になる。
        // 設定の永続化は、ユーザーが設定タブで操作した際や、ウィジェット内で「保存」アクションを行った際に行うべき。
    }

    // 静的メソッド (ウィジェット削除時などに使用)
    public static removePersistentInstance(widgetId: string, plugin: WidgetBoardPlugin): void {
        const instance = PomodoroWidget.widgetInstances.get(widgetId);
        if (instance) {
            // instance.onunload(); // 必要に応じてインスタンス固有のクリーンアップを呼ぶことも検討
            PomodoroWidget.widgetInstances.delete(widgetId);
        }
        // console.log(`[${widgetId}] Static removePersistentInstance for PomodoroWidget (map size: ${PomodoroWidget.widgetInstances.size})`);
    }

    public static cleanupAllPersistentInstances(plugin: WidgetBoardPlugin): void {
        // console.log("Cleaning up all PomodoroWidget instances from static map.");
        PomodoroWidget.widgetInstances.forEach(instance => {
            // instance.onunload(); // もし必要なら
        });
        PomodoroWidget.widgetInstances.clear();
    }
}