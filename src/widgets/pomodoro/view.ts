import { setIcon } from 'obsidian';
import type { WidgetConfig } from '../../interfaces';
import { applyWidgetSize, createWidgetContainer, pad2 } from '../../utils';
import type { PomodoroSettings } from './index';
import { t, Language } from '../../i18n';

export class PomodoroView {
  widgetEl!: HTMLElement;
  timeDisplayEl!: HTMLElement;
  statusDisplayEl!: HTMLElement;
  cycleDisplayEl!: HTMLElement;
  startPauseButton!: HTMLButtonElement;
  resetButton!: HTMLButtonElement;
  nextButton!: HTMLButtonElement;

  private _prevDisplay: { timeStr?: string; isRunning?: boolean; statusText?: string; cycleText?: string; resetIconSet?: boolean } = {};
  private lang: Language = 'ja';

  create(config: WidgetConfig, lang: Language): { widgetEl: HTMLElement; contentEl: HTMLElement } {
    this.lang = lang;
    const { widgetEl, titleEl } = createWidgetContainer(config, 'pomodoro-timer-widget');
    this.widgetEl = widgetEl;
    if (titleEl) {
      titleEl.textContent = config.title || t(this.lang, 'pomodoroTimer');
      if (!config.title || config.title.trim() === '') titleEl.style.display = 'none';
    }
    const contentEl = this.widgetEl.createDiv({ cls: 'widget-content' });
    this.timeDisplayEl = contentEl.createDiv({ cls: 'pomodoro-time-display' });
    this.statusDisplayEl = contentEl.createDiv({ cls: 'pomodoro-status-display' });
    this.cycleDisplayEl = contentEl.createDiv({ cls: 'pomodoro-cycle-display' });
    const controlsEl = contentEl.createDiv({ cls: 'pomodoro-controls' });
    this.startPauseButton = controlsEl.createEl('button', { cls: 'pomodoro-start-pause' });
    this.resetButton = controlsEl.createEl('button', { cls: 'pomodoro-reset' });
    this.nextButton = controlsEl.createEl('button', { cls: 'pomodoro-next' });
    applyWidgetSize(this.widgetEl, config.settings as { width?: string; height?: string } | null);
    return { widgetEl, contentEl };
  }

  applyBackground(imageUrl?: string) {
    if (!this.widgetEl) return;
    const trimmedUrl = imageUrl?.trim();
    if (trimmedUrl) {
      this.widgetEl.style.backgroundImage = `url("${trimmedUrl}")`;
      this.widgetEl.style.backgroundSize = 'cover';
      this.widgetEl.style.backgroundPosition = 'center';
      this.widgetEl.style.backgroundRepeat = 'no-repeat';
      this.widgetEl.classList.add('has-background-image');
    } else {
      this.widgetEl.style.backgroundImage = '';
      this.widgetEl.style.backgroundSize = '';
      this.widgetEl.style.backgroundPosition = '';
      this.widgetEl.style.backgroundRepeat = '';
      this.widgetEl.classList.remove('has-background-image');
    }
  }

  updateDisplay(state: { remainingTime: number; isRunning: boolean; currentPomodoroSet: 'work' | 'shortBreak' | 'longBreak'; pomodorosCompletedInCycle: number; settings: PomodoroSettings; }) {
    if (!this.widgetEl) return;
    const prev = this._prevDisplay;
    const timeStr = this.formatTime(state.remainingTime);
    if (prev.timeStr !== timeStr) {
      this.timeDisplayEl.textContent = timeStr;
      prev.timeStr = timeStr;
    }
    if (prev.isRunning !== state.isRunning) {
      setIcon(this.startPauseButton, state.isRunning ? 'pause' : 'play');
      this.startPauseButton.setAttribute('aria-label', state.isRunning ? t(this.lang, 'pause') : t(this.lang, 'start'));
      prev.isRunning = state.isRunning;
    }
    if (!prev.resetIconSet) {
      setIcon(this.resetButton, 'rotate-ccw');
      this.resetButton.setAttribute('aria-label', t(this.lang, 'reset'));
      setIcon(this.nextButton, 'skip-forward');
      this.nextButton.setAttribute('aria-label', t(this.lang, 'nextSession'));
      prev.resetIconSet = true;
    }
    let statusText = '';
    switch (state.currentPomodoroSet) {
      case 'work':
        statusText = t(this.lang, 'workStatus', { minutes: state.settings.workMinutes });
        break;
      case 'shortBreak':
        statusText = t(this.lang, 'shortBreakStatus', { minutes: state.settings.shortBreakMinutes });
        break;
      case 'longBreak':
        statusText = t(this.lang, 'longBreakStatus', { minutes: state.settings.longBreakMinutes });
        break;
    }
    if (prev.statusText !== statusText) {
      this.statusDisplayEl.textContent = statusText;
      prev.statusText = statusText;
    }
    const cycleText = t(this.lang, 'currentCycle', { completed: state.pomodorosCompletedInCycle, total: state.settings.pomodorosUntilLongBreak });
    if (prev.cycleText !== cycleText) {
      this.cycleDisplayEl.textContent = cycleText;
      prev.cycleText = cycleText;
    }
  }

  private formatTime(totalSeconds: number): string {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }
}

export default PomodoroView;
