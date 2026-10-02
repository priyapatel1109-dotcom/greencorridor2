/**
 * Web Audio API synthesizer for 108 Emergency Ambulance Siren & Gujarati Audio Announcements
 */

class SoundEngine {
  private audioCtx: AudioContext | null = null;
  private sirenOscillator: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private lfoOscillator: OscillatorNode | null = null;
  private lfoGain: GainNode | null = null;
  private isSirenPlaying = false;
  private currentSirenMode: 'wail' | 'yelp' | 'hi_lo' | 'piercer' = 'wail';
  private masterVolume = 0.6;
  private listeners: Array<(isPlaying: boolean, mode: 'wail' | 'yelp' | 'hi_lo' | 'piercer') => void> = [];

  private notifyListeners() {
    this.listeners.forEach(fn => {
      try {
        fn(this.isSirenPlaying, this.currentSirenMode);
      } catch {
        // Ignored
      }
    });
  }

  public subscribeSiren(listener: (isPlaying: boolean, mode: 'wail' | 'yelp' | 'hi_lo' | 'piercer') => void) {
    this.listeners.push(listener);
    listener(this.isSirenPlaying, this.currentSirenMode);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  public setVolume(vol: number) {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.sirenGain && this.audioCtx) {
      this.sirenGain.gain.setValueAtTime(this.masterVolume * 0.4, this.audioCtx.currentTime);
    }
  }

  public getVolume(): number {
    return this.masterVolume;
  }


  public playChimeSuccess() {
    try {
      this.initContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.35); // C6

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.masterVolume * 0.5, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.75);
    } catch {
      // Audio playback fails silently if blocked by browser policy
    }
  }

  public playProximityPing(urgency: 'caution' | 'urgent') {
    try {
      this.initContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = urgency === 'urgent' ? 'sawtooth' : 'triangle';
      const freq = urgency === 'urgent' ? 880 : 587; // A5 vs D5
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.masterVolume * 0.4, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (urgency === 'urgent' ? 0.2 : 0.35));

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.4);

      if (navigator.vibrate) {
        navigator.vibrate(urgency === 'urgent' ? [120, 60, 120] : 100);
      }
    } catch {
      // Audio autoplay policy fallback
    }
  }

  public startSiren(mode: 'wail' | 'yelp' | 'hi_lo' | 'piercer' = 'wail') {
    this.currentSirenMode = mode;
    this.initContext();
    if (!this.audioCtx) return;

    if (this.isSirenPlaying) {
      this.updateLfoParameters(mode);
      this.notifyListeners();
      return;
    }

    try {
      this.isSirenPlaying = true;
      const now = this.audioCtx.currentTime;

      // Primary carrier oscillator
      this.sirenOscillator = this.audioCtx.createOscillator();
      this.sirenGain = this.audioCtx.createGain();

      // LFO frequency modulator for continuous smooth cycling
      this.lfoOscillator = this.audioCtx.createOscillator();
      this.lfoGain = this.audioCtx.createGain();

      this.sirenOscillator.type = 'sawtooth';
      this.sirenGain.gain.setValueAtTime(0.001, now);
      this.sirenGain.gain.linearRampToValueAtTime(this.masterVolume * 0.35, now + 0.05);

      this.updateLfoParameters(mode);

      // Connect LFO -> carrier frequency (FM Synthesis)
      this.lfoOscillator.connect(this.lfoGain);
      this.lfoGain.connect(this.sirenOscillator.frequency);

      // Connect Carrier -> Gain -> Output
      this.sirenOscillator.connect(this.sirenGain);
      this.sirenGain.connect(this.audioCtx.destination);

      this.lfoOscillator.start(now);
      this.sirenOscillator.start(now);
      this.notifyListeners();
    } catch {
      this.isSirenPlaying = false;
      this.notifyListeners();
    }
  }

  private updateLfoParameters(mode: 'wail' | 'yelp' | 'hi_lo' | 'piercer') {
    if (!this.audioCtx || !this.sirenOscillator || !this.lfoOscillator || !this.lfoGain) return;
    const now = this.audioCtx.currentTime;

    if (mode === 'yelp') {
      // Fast emergency yelp: 750Hz base, ±260Hz sweep at 2.4Hz
      this.sirenOscillator.type = 'sawtooth';
      this.sirenOscillator.frequency.setTargetAtTime(800, now, 0.05);
      this.lfoOscillator.type = 'sawtooth';
      this.lfoOscillator.frequency.setTargetAtTime(2.4, now, 0.05);
      this.lfoGain.gain.setTargetAtTime(260, now, 0.05);
    } else if (mode === 'hi_lo') {
      // European / Two-tone Hi-Lo: alternates between ~660Hz and ~940Hz
      this.sirenOscillator.type = 'triangle';
      this.sirenOscillator.frequency.setTargetAtTime(800, now, 0.05);
      this.lfoOscillator.type = 'square';
      this.lfoOscillator.frequency.setTargetAtTime(1.1, now, 0.05);
      this.lfoGain.gain.setTargetAtTime(160, now, 0.05);
    } else if (mode === 'piercer') {
      // Piercer / Phaser: ultra-fast 4.2Hz sweep for clearing intersections
      this.sirenOscillator.type = 'sawtooth';
      this.sirenOscillator.frequency.setTargetAtTime(950, now, 0.05);
      this.lfoOscillator.type = 'triangle';
      this.lfoOscillator.frequency.setTargetAtTime(4.2, now, 0.05);
      this.lfoGain.gain.setTargetAtTime(350, now, 0.05);
    } else {
      // Classic Wail: 740Hz base, ±240Hz sweep at 0.32Hz (slow continuous cycle)
      this.sirenOscillator.type = 'sawtooth';
      this.sirenOscillator.frequency.setTargetAtTime(740, now, 0.05);
      this.lfoOscillator.type = 'sine';
      this.lfoOscillator.frequency.setTargetAtTime(0.32, now, 0.05);
      this.lfoGain.gain.setTargetAtTime(240, now, 0.05);
    }
  }

  public setSirenMode(mode: 'wail' | 'yelp' | 'hi_lo' | 'piercer') {
    this.currentSirenMode = mode;
    if (this.isSirenPlaying) {
      this.updateLfoParameters(mode);
    }
    this.notifyListeners();
  }

  public stopSiren() {
    this.isSirenPlaying = false;
    this.notifyListeners();

    if (this.sirenGain && this.audioCtx) {
      const now = this.audioCtx.currentTime;
      try {
        this.sirenGain.gain.linearRampToValueAtTime(0.001, now + 0.08);
      } catch {
        // Ignored
      }
    }

    setTimeout(() => {
      if (this.lfoOscillator) {
        try {
          this.lfoOscillator.stop();
          this.lfoOscillator.disconnect();
        } catch {}
        this.lfoOscillator = null;
      }
      if (this.lfoGain) {
        try {
          this.lfoGain.disconnect();
        } catch {}
        this.lfoGain = null;
      }
      if (this.sirenOscillator) {
        try {
          this.sirenOscillator.stop();
          this.sirenOscillator.disconnect();
        } catch {}
        this.sirenOscillator = null;
      }
      if (this.sirenGain) {
        try {
          this.sirenGain.disconnect();
        } catch {}
        this.sirenGain = null;
      }
    }, 90);
  }

  public toggleContinuousSiren(mode?: 'wail' | 'yelp' | 'hi_lo' | 'piercer'): boolean {
    if (this.isSirenPlaying) {
      this.stopSiren();
      return false;
    } else {
      this.startSiren(mode || this.currentSirenMode);
      return true;
    }
  }

  public isPlaying(): boolean {
    return this.isSirenPlaying;
  }

  public getSirenMode(): 'wail' | 'yelp' | 'hi_lo' | 'piercer' {
    return this.currentSirenMode;
  }


  /**
   * Simulates an Active 5V Buzzer (Single high-pitch resonant tone, typically 2.3kHz - 2.8kHz)
   */
  public playActiveBuzzerBeep(durationMs = 250) {
    try {
      this.initContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'square'; // Buzzer physical characteristic is square wave
      osc.frequency.setValueAtTime(2500, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.masterVolume * 0.45, now + 0.01);
      gain.gain.setValueAtTime(this.masterVolume * 0.45, now + (durationMs / 1000) - 0.02);
      gain.gain.linearRampToValueAtTime(0.001, now + (durationMs / 1000));

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + (durationMs / 1000) + 0.05);
    } catch {
      // Ignored
    }
  }

  /**
   * Simulates a Passive Piezo Buzzer with Arduino tone() function (Variable frequency)
   */
  public playPassiveBuzzerTone(freqHz: number, durationMs = 250) {
    try {
      this.initContext();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freqHz, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.masterVolume * 0.4, now + 0.01);
      gain.gain.setValueAtTime(this.masterVolume * 0.4, now + (durationMs / 1000) - 0.02);
      gain.gain.linearRampToValueAtTime(0.001, now + (durationMs / 1000));

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + (durationMs / 1000) + 0.05);
    } catch {
      // Ignored
    }
  }

  /**
   * Simulates Arduino HC-SR04 ultrasonic sensor proximity buzzer trigger
   */
  public playProximityBuzzerStep(distanceCm: number) {
    if (distanceCm > 60) return; // Beyond detection range
    const freq = distanceCm < 15 ? 3000 : distanceCm < 30 ? 2200 : 1200;
    const duration = distanceCm < 15 ? 400 : 150;
    this.playPassiveBuzzerTone(freq, duration);
  }

  /**
   * Speaks authentic Gujarati emergency speech notification
   */
  public speakGujarati(textGu: string, fallbackEn?: string) {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textGu);
    utterance.volume = this.masterVolume;
    utterance.rate = 0.95; // Clear pace for drivers
    utterance.pitch = 1.05;

    // Search for Gujarati voice or Indian English/Hindi voice fallback
    const voices = window.speechSynthesis.getVoices();
    const guVoice = voices.find(v => v.lang.includes('gu') || v.name.toLowerCase().includes('gujarati'));
    const inVoice = voices.find(v => v.lang.includes('hi-IN') || v.lang.includes('en-IN'));

    if (guVoice) {
      utterance.voice = guVoice;
      utterance.lang = 'gu-IN';
      window.speechSynthesis.speak(utterance);
    } else if (inVoice) {
      utterance.voice = inVoice;
      utterance.lang = inVoice.lang;
      window.speechSynthesis.speak(utterance);
    } else {
      // Use fallback English or the Gujarati text with default synthesizer
      if (fallbackEn && !voices.some(v => v.lang.startsWith('gu') || v.lang.startsWith('hi'))) {
        const enUtterance = new SpeechSynthesisUtterance(fallbackEn);
        enUtterance.volume = this.masterVolume;
        enUtterance.rate = 1.0;
        window.speechSynthesis.speak(enUtterance);
      } else {
        utterance.lang = 'gu-IN';
        window.speechSynthesis.speak(utterance);
      }
    }
  }
}

export const soundEngine = new SoundEngine();
