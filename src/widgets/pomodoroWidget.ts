// src/widgets/pomodoroWidget.ts
import { App, MarkdownRenderer, Notice, setIcon } from 'obsidian';
import type { WidgetConfig, WidgetImplementation } from '../interfaces';
import type WidgetBoardPlugin from '../main';

// --- 通知音の種類の型定義 ---
export type PomodoroSoundType = 'off' | 'default_beep' | 'bell' | 'chime'; // 他の音を追加可能

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
    notificationSoundType?: 'default_beep' | 'custom';
    customSoundPath?: string;
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
    notificationSoundType: 'default_beep',
    customSoundPath: '',
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
    private audioContext: AudioContext | null = null;
    private currentAudioElement: HTMLAudioElement | null = null; // MP3再生用

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
            if (this.config.settings) this.config.settings.memoContent = newMemo;
            await this.plugin.saveSettings(); 
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

        if (!this.initialized || isReconfiguringForDifferentWidget) {
            this.currentSettings = { ...DEFAULT_POMODORO_SETTINGS, ...(config.settings || {}) };
            this.pomodorosCompletedInCycle = 0;
            this.currentPomodoroSet = 'work';
            this.isRunning = false;
            if (this.timerId) clearInterval(this.timerId);
            this.timerId = null;
            this.isEditingMemo = false;
        } else {
            const newSettingsFromConfig = config.settings as Partial<PomodoroSettings> || {};
            this.currentSettings = { ...this.currentSettings, ...newSettingsFromConfig };
        }
        config.settings = this.currentSettings;

        this.widgetEl = document.createElement('div');
        this.widgetEl.classList.add('widget', 'pomodoro-timer-widget');
        this.widgetEl.setAttribute('data-widget-id', config.id);

        this.applyBackground(this.currentSettings.backgroundImageUrl);

        const titleEl = this.widgetEl.createEl('h4');
        titleEl.textContent = this.config.title || "ポモドーロタイマー";
        // タイトルが空白なら高さ0で非表示に
        if (!this.config.title || this.config.title.trim() === "") {
            titleEl.style.height = '0';
            titleEl.style.margin = '0';
            titleEl.style.padding = '0';
            titleEl.style.overflow = 'hidden';
            titleEl.style.display = 'block';
        } else {
            titleEl.style.removeProperty('height');
            titleEl.style.removeProperty('margin');
            titleEl.style.removeProperty('padding');
            titleEl.style.removeProperty('overflow');
            titleEl.style.removeProperty('display');
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
        
        this.isEditingMemo = false;
        this.renderMemo(this.currentSettings.memoContent);
        this.updateMemoEditUI();

        if (!this.initialized || isReconfiguringForDifferentWidget) {
            this.resetTimerState(this.currentPomodoroSet, true);
        } else if (!this.isRunning && this.lastConfiguredId === newConfigId) {
            this.resetTimerState(this.currentPomodoroSet, false);
        }

        this.initialized = true;
        this.lastConfiguredId = newConfigId;
        this.updateDisplay();
        return this.widgetEl;
    }

    private formatTime(totalSeconds: number): string { /* ... (変更なし) ... */ 
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    private updateDisplay() { /* ... (変更なし) ... */ 
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
    private toggleStartPause() { /* ... (変更なし) ... */ 
        if (this.isRunning) { this.pauseTimer(); } else { this.startTimer(); }
    }
    private startTimer() { /* ... (変更なし) ... */ 
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
    private pauseTimer() { /* ... (変更なし) ... */ 
        if (!this.isRunning || !this.timerId) return;
        this.isRunning = false;
        clearInterval(this.timerId);
        this.timerId = null;
        this.updateDisplay();
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} を一時停止しました。`);
    }
    private resetCurrentTimerConfirm() { /* ... (変更なし) ... */ 
        this.pauseTimer();
        this.resetTimerState(this.currentPomodoroSet, false);
        const statusText = this.statusDisplayEl?.textContent?.split('(')[0].trim() || '作業';
        new Notice(`${statusText} をリセットしました。`);
    }
    private resetTimerState(mode: 'work' | 'shortBreak' | 'longBreak', resetCycleCount: boolean) { /* ... (変更なし) ... */ 
        this.currentPomodoroSet = mode;
        switch (mode) {
            case 'work': this.remainingTime = this.currentSettings.workMinutes * 60; break;
            case 'shortBreak': this.remainingTime = this.currentSettings.shortBreakMinutes * 60; break;
            case 'longBreak': this.remainingTime = this.currentSettings.longBreakMinutes * 60; break;
        }
        if (resetCycleCount) { this.pomodorosCompletedInCycle = 0; }
        if (this.isRunning) { this.pauseTimer(); }
        else if(this.timerId) { clearInterval(this.timerId); this.timerId = null; }
        this.updateDisplay();
    }
    private tick() { /* ... (変更なし) ... */ 
        if (!this.isRunning) return;
        this.remainingTime--;
        this.updateDisplay();
        if (this.remainingTime <= 0) { this.handleSessionEnd(); }
    }

    private playSoundNotification() {
        if (this.currentSettings.notificationSound === 'off') {
            return;
        }
        console.log(`[${this.config.id}] Playing sound: ${this.currentSettings.notificationSound}, Volume: ${this.currentSettings.notificationVolume}`);

        // 既存の音声があれば停止（連続呼び出し対策）
        if (this.currentAudioElement) {
            this.currentAudioElement.pause();
            this.currentAudioElement.currentTime = 0;
            this.currentAudioElement = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            // AudioContextで生成した音の場合、通常は都度生成・再生・停止するので、
            // ここで特別な停止処理は不要かもしれないが、念のためコンテキストを閉じて再生成も検討
        }


        const volume = Math.max(0, Math.min(1, this.currentSettings.notificationVolume)); // 0.0 - 1.0 の範囲に正規化

        try {
            if (this.currentSettings.notificationSound === 'default_beep') {
                if (!this.audioContext || this.audioContext.state === 'closed') {
                    this.audioContext = new AudioContext();
                }
                if (this.audioContext.state === 'suspended') { // ユーザーインタラクションが必要な場合がある
                    this.audioContext.resume().catch(err => console.error("Error resuming AudioContext:", err));
                }

                const oscillator = this.audioContext.createOscillator();
                const gainNode = this.audioContext.createGain();

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime); // E5 note
                gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime); // 音量をそのまま反映
                gainNode.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + 0.5);

                oscillator.connect(gainNode);
                gainNode.connect(this.audioContext.destination);
                oscillator.start(this.audioContext.currentTime);
                oscillator.stop(this.audioContext.currentTime + 0.5);
            } else {
                // 'bell', 'chime', またはその他のMP3ファイル名の場合
                // プラグインのassetsフォルダからの相対パスを想定
                // Obsidian内でプラグインアセットにアクセスするための正しいURLを構築する必要がある
                const soundFileName = `${this.currentSettings.notificationSound}.mp3`;
                // `plugin.manifest.id` を使ってプラグイン固有のURLを構築
                // Obsidian 1.0以降では、`app://<app-id>/<plugin-id>/<path-to-asset>` のような形式
                // `this.app.vault.adapter.getResourcePath` はVault内のファイル用
                // ここでは、プラグインのディレクトリからの相対パスを Obsidian が解決できるURLにする
                // 単純な相対パスでは動作しない。絶対パスか、Obsidianが提供する特別なURLスキームが必要。
                // `plugin.manifest.dir` はファイルシステムパス。
                // `this.app.vault.adapter.getRealPath(plugin.manifest.dir + '/assets/' + soundFileName)`などでフルパス取得後、
                // `app://local/` プリフィックスなどでアクセスできるか試す。
                // もっとも簡単なのは、Obsidianがプラグインのリソースをどう提供しているか確認すること。
                // 通常は `app://obsidian.md/${this.plugin.manifest.id}/assets/${soundFileName}` のような形式になる。

                // getPluginAssetUrl のようなヘルパー関数が理想的
                let soundUrl = `app://obsidian.md/${this.plugin.manifest.id}/assets/${soundFileName}`;
                // もし上記URLで動作しない場合、Obsidianのバージョンや環境によって異なる可能性がある
                // 代替案として、Base64エンコードした短い音声データを直接使う方法もあるが、ファイル管理が煩雑になる

                console.log(`[${this.config.id}] Attempting to play MP3: ${soundUrl}`);

                this.currentAudioElement = new Audio(soundUrl);
                this.currentAudioElement.volume = volume;
                this.currentAudioElement.play().catch(error => {
                    console.error(`[${this.config.id}] Error playing MP3 (${soundFileName}):`, error);
                    new Notice(`通知音(${soundFileName})の再生に失敗しました。ファイルが存在するか確認してください。`, 5000);
                });
            }
        } catch (error) {
            console.error(`[${this.config.id}] Error in playSoundNotification:`, error);
        }
    }

    private handleSessionEnd() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.isRunning = false;

        let msg = "";
        // const previousSet = this.currentPomodoroSet; // 必要なら保持

        if (this.currentPomodoroSet === 'work') {
            this.pomodorosCompletedInCycle++;
            msg = `作業セッション (${this.currentSettings.workMinutes}分) が終了。`;
            if (this.pomodorosCompletedInCycle >= this.currentSettings.pomodorosUntilLongBreak) {
                this.resetTimerState('longBreak', false);
                msg += "長い休憩を開始してください。";
            } else {
                this.resetTimerState('shortBreak', false);
                msg += "短い休憩を開始してください。";
            }
        } else {
            if(this.currentPomodoroSet === 'shortBreak') msg = `短い休憩 (${this.currentSettings.shortBreakMinutes}分) が終了。`;
            else msg = `長い休憩 (${this.currentSettings.longBreakMinutes}分) が終了。`;
            
            this.resetTimerState('work', this.currentPomodoroSet === 'longBreak');
            msg += "作業セッションを開始してください。";
        }
        
        new Notice(msg, 7000);
        this.playSoundNotification(); 

        if (this.plugin && (!this.plugin.widgetBoardModal || !this.plugin.widgetBoardModal.isOpen)) {
            this.plugin.openWidgetBoard();
        }
        this.updateDisplay();
    }
    
    private skipToNextSessionConfirm() {
        this.handleSessionEnd();
        new Notice("次のセッションへスキップしました。");
    }

    onunload(): void {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.isRunning = false;
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(err => console.error("Error closing AudioContext:", err));
        }
        if (this.currentAudioElement) {
            this.currentAudioElement.pause();
            this.currentAudioElement.src = ""; // リソース解放の試み
            this.currentAudioElement = null;
        }
    }
    
    public async updateExternalSettings(newSettings: Partial<PomodoroSettings>, widgetId?: string) {
        if (widgetId && this.config?.id !== widgetId) return;

        const oldSettings = { ...this.currentSettings };

        this.currentSettings = { ...this.currentSettings, ...newSettings };
        
        if(this.config && this.config.settings) {
            Object.assign(this.config.settings, this.currentSettings);
        }

        if (oldSettings.backgroundImageUrl !== this.currentSettings.backgroundImageUrl) {
            this.applyBackground(this.currentSettings.backgroundImageUrl);
        }
        if (oldSettings.memoContent !== this.currentSettings.memoContent && !this.isEditingMemo) {
            await this.renderMemo(this.currentSettings.memoContent);
        }

        const timerRelatedSettingsChanged = 
            oldSettings.workMinutes !== this.currentSettings.workMinutes ||
            oldSettings.shortBreakMinutes !== this.currentSettings.shortBreakMinutes ||
            oldSettings.longBreakMinutes !== this.currentSettings.longBreakMinutes;

        if (!this.isRunning && timerRelatedSettingsChanged) {
            this.resetTimerState(this.currentPomodoroSet, false); 
        } else {
             this.updateDisplay();
        }

        if (!this.isEditingMemo) {
            this.updateMemoEditUI();
        }
        // notificationSound や notificationVolume の変更は、次回の playSoundNotification 呼び出し時に反映される。
    }
}