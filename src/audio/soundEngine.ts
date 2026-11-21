import { DEFAULT_AUDIO_SETTINGS } from '../game/constants';
import { AudioSettings } from '../game/types';

const STORAGE_KEY = 'neon_air_hockey_audio_v1';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicInterval: number | null = null;
  private musicStep = 0;
  private settings: AudioSettings;
  private lastHitSoundTime = 0;
  private lastWallSoundTime = 0;

  constructor() {
    this.settings = this.loadSettings();
  }

  private loadSettings(): AudioSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AudioSettings>;
        return {
          sfxEnabled: parsed.sfxEnabled ?? DEFAULT_AUDIO_SETTINGS.sfxEnabled,
          musicEnabled: parsed.musicEnabled ?? DEFAULT_AUDIO_SETTINGS.musicEnabled,
          masterVolume: this.clamp01(parsed.masterVolume ?? DEFAULT_AUDIO_SETTINGS.masterVolume),
          sfxVolume: this.clamp01(parsed.sfxVolume ?? DEFAULT_AUDIO_SETTINGS.sfxVolume),
          musicVolume: this.clamp01(parsed.musicVolume ?? DEFAULT_AUDIO_SETTINGS.musicVolume),
        };
      }
    } catch {
      // Ignore storage errors
    }
    return { ...DEFAULT_AUDIO_SETTINGS };
  }

  private clamp01(v: number): number {
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AudioSettings>): AudioSettings {
    this.settings = {
      ...this.settings,
      ...partial,
      masterVolume: this.clamp01(partial.masterVolume ?? this.settings.masterVolume),
      sfxVolume: this.clamp01(partial.sfxVolume ?? this.settings.sfxVolume),
      musicVolume: this.clamp01(partial.musicVolume ?? this.settings.musicVolume),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore
    }
    this.applyVolumes();
    if (this.settings.musicEnabled) {
      this.ensureMusicLoop();
    } else {
      this.stopMusicLoop();
    }
    return this.getSettings();
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyVolumes();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (this.settings.musicEnabled) {
      this.ensureMusicLoop();
    }
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.settings.masterVolume, now, 0.02);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxEnabled ? this.settings.sfxVolume : 0, now, 0.02);
    this.musicGain.gain.setTargetAtTime(
      this.settings.musicEnabled ? this.settings.musicVolume * 0.28 : 0,
      now,
      0.04
    );
  }

  private ensureMusicLoop(): void {
    if (!this.ctx || !this.settings.musicEnabled || this.musicInterval !== null) return;
    // Subtle dark synthwave bassline pulse (A minor pentatonic arcade groove)
    const bassNotes = [110, 110, 130.81, 146.83, 110, 110, 164.81, 146.83];
    const padNotes = [220, 261.63, 329.63, 293.66];

    this.musicInterval = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running' || !this.musicGain || !this.settings.musicEnabled) {
        return;
      }
      const now = this.ctx.currentTime;
      const step = this.musicStep % bassNotes.length;
      const freq = bassNotes[step];

      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const env = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.exponentialRampToValueAtTime(160, now + 0.24);

      env.gain.setValueAtTime(0.001, now);
      env.gain.linearRampToValueAtTime(0.22, now + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this.musicGain);

      osc.start(now);
      osc.stop(now + 0.28);

      // Soft atmospheric pad every 4 steps
      if (this.musicStep % 4 === 0) {
        const padFreq = padNotes[(this.musicStep / 4) % padNotes.length];
        const padOsc = this.ctx.createOscillator();
        const padEnv = this.ctx.createGain();
        padOsc.type = 'triangle';
        padOsc.frequency.setValueAtTime(padFreq, now);
        padEnv.gain.setValueAtTime(0.001, now);
        padEnv.gain.linearRampToValueAtTime(0.09, now + 0.15);
        padEnv.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
        padOsc.connect(padEnv);
        padEnv.connect(this.musicGain);
        padOsc.start(now);
        padOsc.stop(now + 1.05);
      }

      this.musicStep++;
    }, 280);
  }

  private stopMusicLoop(): void {
    if (this.musicInterval !== null) {
      window.clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  public playMenuClick(): void {
    if (!this.settings.sfxEnabled) return;
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.045);
    env.gain.setValueAtTime(0.14, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playStrikerHit(intensity = 0.7): void {
    if (!this.settings.sfxEnabled) return;
    const t = performance.now();
    if (t - this.lastHitSoundTime < 28) return;
    this.lastHitSoundTime = t;

    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.18, Math.min(1, intensity)) * 0.45;

    // Punchy acrylic-on-table impact + high harmonic click
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340 + intensity * 280, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.08);
    env.gain.setValueAtTime(vol, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.095);

    if (intensity > 0.65) {
      // Strong smash overtone
      const snap = this.ctx.createOscillator();
      const snapEnv = this.ctx.createGain();
      snap.type = 'sine';
      snap.frequency.setValueAtTime(1250, now);
      snap.frequency.exponentialRampToValueAtTime(480, now + 0.045);
      snapEnv.gain.setValueAtTime(vol * 0.55, now);
      snapEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      snap.connect(snapEnv);
      snapEnv.connect(this.sfxGain);
      snap.start(now);
      snap.stop(now + 0.055);
    }
  }

  public playWallHit(intensity = 0.5): void {
    if (!this.settings.sfxEnabled) return;
    const t = performance.now();
    if (t - this.lastWallSoundTime < 30) return;
    this.lastWallSoundTime = t;

    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const vol = Math.max(0.1, Math.min(1, intensity)) * 0.3;

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240 + intensity * 160, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.055);
    env.gain.setValueAtTime(vol, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playCountdownTick(final = false): void {
    if (!this.settings.sfxEnabled) return;
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(final ? 880 : 520, now);
    env.gain.setValueAtTime(0.22, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + (final ? 0.18 : 0.09));
    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  public playMatchStart(): void {
    if (!this.settings.sfxEnabled) return;
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const start = now + idx * 0.065;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      env.gain.setValueAtTime(0.2, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(env);
      env.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }

  public playGoal(scoredByLocalPlayer: boolean): void {
    if (!this.settings.sfxEnabled) return;
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // Arcade goal horn + neon chord
    const freqs = scoredByLocalPlayer ? [330, 440, 659.25] : [220, 277.18, 329.63];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const start = now + idx * 0.04;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, start);
      env.gain.setValueAtTime(0.18, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
      osc.connect(env);
      env.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.48);
    });
  }

  public playVictory(): void {
    if (!this.settings.sfxEnabled) return;
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const start = now + idx * 0.1;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      env.gain.setValueAtTime(0.26, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.connect(env);
      env.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.38);
    });
  }

  public playDefeat(): void {
    if (!this.settings.sfxEnabled) return;
    this.unlock();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((f, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const start = now + idx * 0.12;
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, start);
      env.gain.setValueAtTime(0.16, start);
      env.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(env);
      env.connect(this.sfxGain);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  }
}

export const soundEngine = new SoundEngine();
