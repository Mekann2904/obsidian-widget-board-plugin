import { Notice } from 'obsidian';
import type { PomodoroSoundType } from './index';
import { t, Language } from '../../i18n';

interface CustomWindow extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

export class PomodoroSoundPlayer {
  private audioContext: AudioContext | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;

  play(soundType: PomodoroSoundType, volume: number, lang: Language = 'ja') {
    if (soundType === 'off') return;

    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.currentTime = 0;
      this.currentAudioElement = null;
    }

    if (!this.audioContext || this.audioContext.state === 'closed') {
      const customWindow = window as CustomWindow;
      const Ctor = customWindow.AudioContext || customWindow.webkitAudioContext;
      if (!Ctor) {
        // new Notice(t(lang, 'widget.pomodoro.soundNotSupported'));
        return;
      }
      this.audioContext = new Ctor();
    }
    const ctx = this.audioContext!;
    try {
      if (soundType === 'default_beep') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.7);
        osc.onended = () => {
          ctx.close().catch(() => {});
          this.audioContext = null;
        };
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
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(ctx.currentTime);
        osc2.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.8);
        osc2.stop(ctx.currentTime + 0.8);
        osc2.detune.setValueAtTime(5, ctx.currentTime + 0.2);
        osc1.onended = () => {
          ctx.close().catch(() => {});
          this.audioContext = null;
        };
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
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.18);
          osc.stop(now + i * 0.18 + 0.22);
          if (i === notes.length - 1) {
            osc.onended = () => {
              ctx.close().catch(() => {});
              this.audioContext = null;
            };
          }
        });
      }
    } catch (e) {
      new Notice(t(lang, 'widget.pomodoro.soundFailed'));
      console.error('Error playing sound:', e);
    }
  }

  unload() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.currentTime = 0;
      this.currentAudioElement = null;
    }
  }
}

export default PomodoroSoundPlayer;
