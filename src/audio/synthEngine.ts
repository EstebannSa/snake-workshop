import { Track } from '../types/app';

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

class NeonSynthEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private currentTrack: Track | null = null;
  private isPlaying = false;
  private isLooping = true;
  private volume = 0.7;
  private muted = false;
  private sfxMuted = false;

  private currentStep = 0;
  private cycleCount = 0;
  private nextNoteTime = 0;
  private timerId: number | null = null;
  private elapsedSeconds = 0;
  private lastTickPerf = 0;
  private onTrackEndCallback: (() => void) | null = null;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();

      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 18;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.2;

      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.78;

      this.musicGain.connect(this.analyser);
      this.analyser.connect(compressor);
      this.sfxGain.connect(compressor);
      compressor.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.applyVolumes();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.ctx;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.musicGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const targetMusic = this.muted ? 0 : this.volume * 0.65;
    const targetSfx = this.sfxMuted ? 0 : Math.max(0.25, this.volume) * 0.55;
    this.musicGain.gain.setTargetAtTime(targetMusic, now, 0.02);
    this.sfxGain.gain.setTargetAtTime(targetSfx, now, 0.02);
  }

  public setOnTrackEnd(cb: () => void): void {
    this.onTrackEndCallback = cb;
  }

  public setTrack(track: Track, autoPlay = false): void {
    const wasPlaying = this.isPlaying;
    this.currentTrack = track;
    this.currentStep = 0;
    this.cycleCount = 0;
    this.elapsedSeconds = 0;

    if (autoPlay || wasPlaying) {
      this.play(track);
    }
  }

  public play(track?: Track): void {
    if (track) {
      if (this.currentTrack?.id !== track.id) {
        this.currentTrack = track;
        this.currentStep = 0;
        this.cycleCount = 0;
        this.elapsedSeconds = 0;
      }
    }
    if (!this.currentTrack) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    if (this.isPlaying) return;
    this.isPlaying = true;
    this.nextNoteTime = ctx.currentTime + 0.04;
    this.lastTickPerf = performance.now();

    this.timerId = window.setInterval(() => {
      this.schedulerTick();
    }, 25);
  }

  public pause(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public seek(seconds: number): void {
    if (!this.currentTrack) return;
    const clamped = Math.max(0, Math.min(seconds, this.currentTrack.durationSeconds));
    this.elapsedSeconds = clamped;
    const stepDuration = 60 / this.currentTrack.bpm / 4;
    const totalSteps = Math.floor(clamped / stepDuration);
    this.currentStep = totalSteps % 64;
    this.cycleCount = Math.floor(totalSteps / 64);
    this.lastTickPerf = performance.now();
  }

  public setLooping(loop: boolean): void {
    this.isLooping = loop;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.applyVolumes();
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    this.applyVolumes();
  }

  public setSfxMuted(mute: boolean): void {
    this.sfxMuted = mute;
    this.applyVolumes();
  }

  public getElapsedSeconds(): number {
    if (!this.currentTrack) return 0;
    if (this.isPlaying) {
      const now = performance.now();
      const delta = (now - this.lastTickPerf) / 1000;
      this.lastTickPerf = now;
      this.elapsedSeconds += delta;

      if (this.elapsedSeconds >= this.currentTrack.durationSeconds) {
        if (this.isLooping) {
          this.elapsedSeconds = this.elapsedSeconds % this.currentTrack.durationSeconds;
        } else {
          this.elapsedSeconds = 0;
          this.onTrackEndCallback?.();
        }
      }
    }
    return this.elapsedSeconds;
  }

  public getFrequencyData(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || !this.isPlaying) {
      target.fill(0);
      return false;
    }
    this.analyser.getByteFrequencyData(target);
    return true;
  }

  private schedulerTick(): void {
    if (!this.ctx || !this.currentTrack || !this.isPlaying) return;

    const scheduleAheadTime = 0.12;
    const stepDuration = 60 / this.currentTrack.bpm / 4; // 16th note

    while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleStep(this.currentTrack, this.currentStep, this.cycleCount, this.nextNoteTime, stepDuration);
      this.nextNoteTime += stepDuration;
      this.currentStep++;
      if (this.currentStep >= 64) {
        this.currentStep = 0;
        this.cycleCount++;
      }
    }
  }

  private scheduleStep(
    track: Track,
    step: number,
    cycle: number,
    time: number,
    stepDur: number
  ): void {
    if (!this.ctx || !this.musicGain) return;

    const barIndex = Math.floor(step / 16);
    const barStep = step % 16;
    const pattern = track.pattern;

    // 1. Pad chords at the start of every bar
    if (barStep === 0) {
      const chord = pattern.chords[barIndex];
      this.triggerPad(chord, time, stepDur * 15.5, track.style);
    }

    // 2. Bass voice
    const bassMidi = pattern.bass[step];
    if (bassMidi > 0) {
      this.triggerBass(bassMidi, time, stepDur * 1.4, track.style);
    }

    // 3. Arpeggiator voice
    const arpMidi = pattern.arp[step];
    if (arpMidi > 0) {
      this.triggerArp(arpMidi, time, stepDur * 0.85, track.style);
    }

    // 4. Lead voice (enters smoothly on odd cycles & after intro bar, or always after first bar)
    const leadMidi = pattern.lead[step];
    if (leadMidi > 0 && (cycle > 0 || barIndex >= 1)) {
      this.triggerLead(leadMidi, time, stepDur * 2.2, track.style);
    }

    // 5. Drums
    if (pattern.kick[barStep]) {
      this.triggerKick(time, track.style);
    }
    if (pattern.snare[barStep]) {
      this.triggerSnare(time, track.style);
    }
    if (pattern.hat[barStep]) {
      this.triggerHat(time, track.style, barStep === 15);
    }
  }

  private triggerPad(notes: number[], time: number, dur: number, style: Track['style']): void {
    if (!this.ctx || !this.musicGain) return;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(style === 'chillwave' ? 900 : 1400, time);
    filter.frequency.exponentialRampToValueAtTime(style === 'electro' ? 2100 : 1100, time + dur * 0.6);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(style === 'chillwave' ? 0.14 : 0.09, time + 0.18);
    env.gain.setValueAtTime(style === 'chillwave' ? 0.12 : 0.08, time + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    filter.connect(env);
    env.connect(this.musicGain);

    notes.forEach((midi, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = style === 'chillwave' ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(midiToFreq(midi), time);
      osc.detune.setValueAtTime((idx % 2 === 0 ? -1 : 1) * 7, time);
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    });
  }

  private triggerBass(midi: number, time: number, dur: number, style: Track['style']): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = style === 'chillwave' ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(midiToFreq(midi), time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = style === 'electro' ? 5.5 : 2.5;
    filter.frequency.setValueAtTime(style === 'electro' ? 1600 : 950, time);
    filter.frequency.exponentialRampToValueAtTime(220, time + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(style === 'chillwave' ? 0.28 : 0.24, time + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private triggerArp(midi: number, time: number, dur: number, style: Track['style']): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = style === 'electro' ? 'square' : style === 'synthwave' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(midiToFreq(midi), time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(style === 'chillwave' ? 1800 : 2400, time);
    filter.Q.value = 1.4;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(style === 'electro' ? 0.09 : 0.11, time + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private triggerLead(midi: number, time: number, dur: number, style: Track['style']): void {
    if (!this.ctx || !this.musicGain) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();

    osc1.type = style === 'chillwave' ? 'sine' : 'sawtooth';
    osc2.type = style === 'electro' ? 'square' : 'triangle';

    const freq = midiToFreq(midi);
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq, time);
    osc2.detune.setValueAtTime(9, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(style === 'chillwave' ? 2200 : 3400, time);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.13, time + 0.025);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + dur + 0.03);
    osc2.stop(time + dur + 0.03);
  }

  private triggerKick(time: number, style: Track['style']): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const startFreq = style === 'electro' ? 155 : 130;
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.45, time + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);

    osc.connect(env);
    env.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.24);
  }

  private triggerSnare(time: number, style: Track['style']): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(style === 'chillwave' ? 1400 : 950, time);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(style === 'chillwave' ? 0.12 : 0.2, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, time + (style === 'synthwave' ? 0.19 : 0.13));

    noise.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    noise.start(time);
    noise.stop(time + 0.2);
  }

  private triggerHat(time: number, style: Track['style'], open: boolean): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(style === 'chillwave' ? 6800 : 8000, time);

    const dur = open ? 0.11 : 0.04;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(0.08, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    noise.connect(filter);
    filter.connect(env);
    env.connect(this.musicGain);

    noise.start(time);
    noise.stop(time + dur + 0.01);
  }

  // Game Sound Effects
  public playEatSound(isBonus = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.sfxMuted) return;

    const now = ctx.currentTime;
    const notes = isBonus ? [698.46, 880, 1174.66] : [587.33, 880];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = isBonus ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);

      env.gain.setValueAtTime(0.0001, now + i * 0.045);
      env.gain.linearRampToValueAtTime(0.24, now + i * 0.045 + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.045 + 0.14);

      osc.connect(env);
      env.connect(this.sfxGain!);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.15);
    });
  }

  public playStartSound(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.sfxMuted) return;

    const now = ctx.currentTime;
    [440, 554.37, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);

      env.gain.setValueAtTime(0.0001, now + i * 0.05);
      env.gain.linearRampToValueAtTime(0.18, now + i * 0.05 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.16);

      osc.connect(env);
      env.connect(this.sfxGain!);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.18);
    });
  }

  public playGameOverSound(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || this.sfxMuted) return;

    const now = ctx.currentTime;
    [392, 329.63, 261.63, 196].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sawtooth';

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, now + i * 0.08);

      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      env.gain.setValueAtTime(0.0001, now + i * 0.08);
      env.gain.linearRampToValueAtTime(0.18, now + i * 0.08 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.22);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this.sfxGain!);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.24);
    });
  }
}

export const synthEngine = new NeonSynthEngine();
