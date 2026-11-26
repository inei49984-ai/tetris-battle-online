class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.25;
  }

  ensureContext() {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq, duration = 0.06, type = 'triangle', gainScale = 1, slideTo = null) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + duration);
    }

    const peak = Math.max(0.001, this.volume * gainScale);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  move() {
    this.playTone(260, 0.035, 'sine', 0.35);
  }

  rotate() {
    this.playTone(420, 0.045, 'triangle', 0.45, 520);
  }

  hold() {
    this.playTone(340, 0.06, 'sine', 0.45, 480);
  }

  hardDrop() {
    this.playTone(170, 0.08, 'square', 0.45, 70);
  }

  lineClear(cleared, isSpecial = false) {
    if (isSpecial || cleared >= 4) {
      this.playTone(523.25, 0.1, 'triangle', 0.8);
      setTimeout(() => this.playTone(659.25, 0.1, 'triangle', 0.8), 55);
      setTimeout(() => this.playTone(783.99, 0.16, 'triangle', 0.9), 110);
      setTimeout(() => this.playTone(1046.5, 0.22, 'sine', 0.9), 165);
    } else {
      const base = 392 + cleared * 70;
      this.playTone(base, 0.11, 'triangle', 0.65, base * 1.25);
    }
  }

  garbageIncoming() {
    this.playTone(150, 0.12, 'sawtooth', 0.4, 95);
  }

  countdown(finalGo = false) {
    this.playTone(finalGo ? 880 : 440, finalGo ? 0.22 : 0.1, 'sine', 0.7);
  }

  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 0.18, 'triangle', 0.8), idx * 90);
    });
  }

  lose() {
    [340, 280, 220, 150].forEach((f, idx) => {
      setTimeout(() => this.playTone(f, 0.18, 'sawtooth', 0.55), idx * 100);
    });
  }
}

export const sound = new SoundEngine();
