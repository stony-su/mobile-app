/* ════════════════════════════════════════════════════════════════
   Lull's sound engine — every soundscape is synthesized live with
   the Web Audio API. No samples, no network, no weight. The phone
   hums the rain itself.
   ════════════════════════════════════════════════════════════════ */

const LEVELS = {
  rain: 0.50,
  hearth: 0.55,
  wind: 0.42,
  crickets: 0.45,
  waves: 0.52,
  hum: 0.60,
};

/* ---------- ringtones, all synthesized live ----------
   each build() schedules one cycle from time `t` onto `dest`
   and returns the cycle's length in seconds, so the alarm can loop it. */
const RINGTONES = {
  chimes: {
    name: 'Chimes',
    build(eng, dest, t) {
      const seq = [523.25, 659.25, 783.99, 1046.5, 880, 659.25];
      let cur = t;
      for (const f of seq) {
        eng._note(dest, cur, f, 1.8, { type: 'sine', peak: 0.34, partial: 2.76 });
        cur += 0.42;
      }
      return (cur - t) + 1.4;
    },
  },
  musicbox: {
    name: 'Music box',
    build(eng, dest, t) {
      const phrase = [
        [659.25, 0.34], [783.99, 0.34], [880, 0.34], [783.99, 0.34],
        [659.25, 0.34], [523.25, 0.68], [0, 0.28],
        [587.33, 0.34], [659.25, 0.34], [523.25, 0.78],
      ];
      let cur = t;
      for (const [f, d] of phrase) {
        if (f) eng._note(dest, cur, f, Math.max(d, 0.55), { type: 'triangle', peak: 0.28, partial: 3 });
        cur += d;
      }
      return (cur - t) + 0.7;
    },
  },
  sunrise: {
    name: 'Sunrise',
    build(eng, dest, t) {
      // a warm chord that swells in and fades — gentlest of wake-ups
      for (const f of [261.63, 329.63, 392.0, 523.25]) {
        eng._note(dest, t, f, 4.6, { type: 'sine', peak: 0.18, attack: 1.7 });
      }
      return 5.0;
    },
  },
  harp: {
    name: 'Harp',
    build(eng, dest, t) {
      const scale = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];
      let cur = t;
      for (const f of scale) {
        eng._note(dest, cur, f, 1.4, { type: 'triangle', peak: 0.26, partial: 2 });
        cur += 0.13;
      }
      eng._note(dest, cur + 0.1, 1318.5, 1.7, { type: 'triangle', peak: 0.28, partial: 2 });
      return (cur - t) + 1.9;
    },
  },
  pulse: {
    name: 'Pulse',
    build(eng, dest, t) {
      // a soft double-knock, three times, then a breath
      let cur = t;
      for (let i = 0; i < 3; i++) {
        eng._note(dest, cur, 660, 0.16, { type: 'sine', peak: 0.36 });
        eng._note(dest, cur + 0.2, 660, 0.16, { type: 'sine', peak: 0.36 });
        cur += 0.7;
      }
      return (cur - t) + 0.7;
    },
  },
};

export const synthRingtones = Object.entries(RINGTONES).map(([id, r]) => ({ id, name: r.name }));

class Engine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.active = new Map();    // name -> { gain, stop }
    this.buffers = {};
    this.volume = 0.8;
    this.timerEnd = null;       // ms epoch, null = till dawn
    this._fadeTimeout = null;
    this._endTimeout = null;
    this.onTimerEnd = null;     // callback for the UI

    // ringtones / alarm
    this._abus = null;          // dedicated bus for ringtones (its own volume)
    this._audioEl = null;       // shared <audio> for mp3 ringtones
    this._ringLoop = null;      // timer that re-schedules synth cycles / stops a preview
    this._ringRise = null;      // interval that fades an mp3 alarm up
    this.ringing = false;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /* ---------- noise sources ---------- */

  noiseBuffer(type) {
    if (this.buffers[type]) return this.buffers[type];
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      // Paul Kellet's economy pink noise
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + 0.029591 * w;
        b1 = 0.985 * b1 + 0.032534 * w;
        b2 = 0.95 * b2 + 0.048056 * w;
        data[i] = (b0 + b1 + b2 + w * 0.05) * 2.2;
      }
    } else { // brown
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.5;
      }
    }
    this.buffers[type] = buf;
    return buf;
  }

  loopNoise(type) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(type);
    src.loop = true;
    src.start();
    return src;
  }

  lfo(freq, depth) {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    osc.connect(g);
    osc.start();
    return { osc, out: g };
  }

  /* ---------- soundscape builders ----------
     each returns { stop() } and connects itself into `out` */

  buildRain(out) {
    const ctx = this.ctx;
    const src = this.loopNoise('white');
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 320;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 0.4;
    // the storm leans closer, then away
    const sway = this.lfo(0.07, 320);
    sway.out.connect(lp.frequency);
    src.connect(hp); hp.connect(lp); lp.connect(out);
    return { stop: () => { src.stop(); sway.osc.stop(); } };
  }

  buildHearth(out) {
    const ctx = this.ctx;
    // glowing bed of embers
    const bed = this.loopNoise('brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.55;
    bed.connect(lp); lp.connect(bedGain); bedGain.connect(out);

    // crackles, scheduled a breath ahead
    const crackle = setInterval(() => {
      if (Math.random() > 0.42) return;
      const t = ctx.currentTime + Math.random() * 0.12;
      const dur = 0.025 + Math.random() * 0.06;
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuffer('white');
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400 + Math.random() * 3200;
      bp.Q.value = 1.6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.10 + Math.random() * 0.3, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(bp); bp.connect(g); g.connect(out);
      s.start(t);
      s.stop(t + dur + 0.05);
    }, 110);

    return { stop: () => { bed.stop(); clearInterval(crackle); } };
  }

  buildWind(out) {
    const ctx = this.ctx;
    const src = this.loopNoise('pink');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 0.85;
    const amp = ctx.createGain();
    amp.gain.value = 0.55;
    // long gusts: pitch and loudness lean together
    const gustF = this.lfo(0.05, 260);
    gustF.out.connect(bp.frequency);
    const gustA = this.lfo(0.033, 0.22);
    gustA.out.connect(amp.gain);
    src.connect(bp); bp.connect(amp); amp.connect(out);
    return { stop: () => { src.stop(); gustF.osc.stop(); gustA.osc.stop(); } };
  }

  buildCrickets(out) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 4300;
    const chirpGain = ctx.createGain();
    chirpGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;
    osc.connect(chirpGain); chirpGain.connect(lp); lp.connect(out);
    osc.start();

    let next = ctx.currentTime + 0.3;
    const scheduler = setInterval(() => {
      while (next < ctx.currentTime + 1.2) {
        osc.frequency.setValueAtTime(4100 + Math.random() * 500, next);
        const pulses = 3 + Math.floor(Math.random() * 3);
        let t = next;
        for (let p = 0; p < pulses; p++) {
          chirpGain.gain.setValueAtTime(0, t);
          chirpGain.gain.linearRampToValueAtTime(0.16 + Math.random() * 0.08, t + 0.008);
          chirpGain.gain.setValueAtTime(0.16, t + 0.034);
          chirpGain.gain.linearRampToValueAtTime(0, t + 0.046);
          t += 0.082;
        }
        next += 0.55 + Math.random() * 1.5;
      }
    }, 350);

    return { stop: () => { osc.stop(); clearInterval(scheduler); } };
  }

  buildWaves(out) {
    const ctx = this.ctx;
    const src = this.loopNoise('brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    const amp = ctx.createGain();
    amp.gain.value = 0.42;
    // the slow swell — about one wave every 14 seconds
    const swell = this.lfo(0.07, 0.30);
    swell.out.connect(amp.gain);
    const wash = this.lfo(0.045, 240);
    wash.out.connect(lp.frequency);
    src.connect(lp); lp.connect(amp); amp.connect(out);
    return { stop: () => { src.stop(); swell.osc.stop(); wash.osc.stop(); } };
  }

  buildHum(out) {
    const ctx = this.ctx;
    const src = this.loopNoise('brown');
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 190;
    const amp = ctx.createGain();
    amp.gain.value = 0.9;
    src.connect(lp); lp.connect(amp); amp.connect(out);
    return { stop: () => src.stop() };
  }

  /* ---------- public API ---------- */

  toggle(name) {
    this.ensure();
    if (this.active.has(name)) {
      this._stopSound(name, 0.9);
      return false;
    }
    const builders = {
      rain: (o) => this.buildRain(o),
      hearth: (o) => this.buildHearth(o),
      wind: (o) => this.buildWind(o),
      crickets: (o) => this.buildCrickets(o),
      waves: (o) => this.buildWaves(o),
      hum: (o) => this.buildHum(o),
    };
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const handle = builders[name](gain);
    gain.gain.linearRampToValueAtTime(LEVELS[name], this.ctx.currentTime + 1.4);
    this.active.set(name, { gain, handle });
    return true;
  }

  _stopSound(name, fade = 0.9) {
    const entry = this.active.get(name);
    if (!entry) return;
    this.active.delete(name);
    const t = this.ctx.currentTime;
    entry.gain.gain.cancelScheduledValues(t);
    entry.gain.gain.setValueAtTime(entry.gain.gain.value, t);
    entry.gain.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => {
      try { entry.handle.stop(); } catch (_) { /* already stopped */ }
      entry.gain.disconnect();
    }, fade * 1000 + 80);
  }

  stopAll(fade = 0.9) {
    for (const name of [...this.active.keys()]) this._stopSound(name, fade);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  /* ---------- sleep timer ---------- */

  setTimer(minutes) {
    clearTimeout(this._fadeTimeout);
    clearTimeout(this._endTimeout);
    this._fadeTimeout = this._endTimeout = null;

    // un-fade if a previous fade was in progress
    if (this.master) this.setVolume(this.volume);

    if (!minutes) {
      this.timerEnd = null;
      return;
    }
    const ms = minutes * 60 * 1000;
    this.timerEnd = Date.now() + ms;

    const FADE = 30 * 1000;
    this._fadeTimeout = setTimeout(() => {
      if (this.master) {
        this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 9);
      }
    }, Math.max(0, ms - FADE));

    this._endTimeout = setTimeout(() => {
      this.stopAll(0.5);
      this.timerEnd = null;
      setTimeout(() => { if (this.master) this.setVolume(this.volume); }, 800);
      if (this.onTimerEnd) this.onTimerEnd();
    }, ms);
  }

  timerRemaining() {
    if (!this.timerEnd) return null;
    return Math.max(0, this.timerEnd - Date.now());
  }

  /* ---------- breathing cues ---------- */

  playCue(kind) {
    this.ensure();
    const ctx = this.ctx;
    const freqs = { in: 392, hold: 330, out: 262 };
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freqs[kind] || 330;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    osc.connect(lp); lp.connect(g); g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.4);
  }

  /* ---------- ringtones & alarm ---------- */

  // one plucked/sustained note with an optional shimmering partial
  _note(dest, t, freq, dur, { type = 'sine', peak = 0.3, attack = 0.008, partial = 0 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    if (partial) {
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(peak * 0.4, t + attack);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
      g2.connect(dest);
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq * partial;
      o2.connect(g2);
      o2.start(t);
      o2.stop(t + dur + 0.05);
    }
  }

  _el() {
    if (!this._audioEl) {
      this._audioEl = new Audio();
      this._audioEl.preload = 'auto';
    }
    return this._audioEl;
  }

  _alarmBus() {
    this.ensure();
    if (!this._abus) {
      this._abus = this.ctx.createGain();
      this._abus.gain.value = 0.0001;
      this._abus.connect(this.ctx.destination); // straight out — loud as an alarm should be
    }
    return this._abus;
  }

  // stop any preview or alarm that's sounding
  stopRing() {
    this.ringing = false;
    clearTimeout(this._ringLoop); this._ringLoop = null;
    clearInterval(this._ringRise); this._ringRise = null;
    if (this._audioEl) { try { this._audioEl.pause(); } catch (_) { /* not playing */ } }
    if (this._abus && this.ctx) {
      const t = this.ctx.currentTime;
      this._abus.gain.cancelScheduledValues(t);
      this._abus.gain.setValueAtTime(0.0001, t);
    }
  }

  // play a short taste of a ringtone (used when picking)
  preview(ring) {
    this.stopRing();
    if (ring.kind === 'mp3') {
      const el = this._el();
      el.loop = false;
      el.src = ring.src;
      el.volume = 0.9;
      try { el.currentTime = 0; } catch (_) { /* not seekable yet */ }
      el.play().catch(() => { /* needs a gesture; the tap is one */ });
      this._ringLoop = setTimeout(() => this.stopRing(), 5000);
    } else {
      const bus = this._alarmBus();
      bus.gain.cancelScheduledValues(this.ctx.currentTime);
      bus.gain.setValueAtTime(0.9, this.ctx.currentTime);
      const len = RINGTONES[ring.id].build(this, bus, this.ctx.currentTime + 0.04);
      this._ringLoop = setTimeout(() => this.stopRing(), Math.min(len, 5) * 1000 + 300);
    }
  }

  // start the alarm proper — loops and rises in volume until stopRing()
  startAlarm(ring) {
    this.stopRing();
    this.ringing = true;
    if (ring.kind === 'mp3') {
      const el = this._el();
      el.loop = true;
      el.src = ring.src;
      el.volume = 0.15;
      try { el.currentTime = 0; } catch (_) { /* not seekable yet */ }
      el.play().catch(() => { /* may be blocked until a gesture */ });
      this._ringRise = setInterval(() => {
        el.volume = Math.min(1, el.volume + 0.07);
        if (el.volume >= 1) { clearInterval(this._ringRise); this._ringRise = null; }
      }, 700);
    } else {
      const bus = this._alarmBus();
      const t = this.ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(0.18, t);
      bus.gain.linearRampToValueAtTime(1, t + 9);
      const loop = () => {
        const len = RINGTONES[ring.id].build(this, bus, this.ctx.currentTime + 0.04);
        this._ringLoop = setTimeout(loop, Math.max(len, 0.8) * 1000);
      };
      loop();
    }
  }
}

export const engine = new Engine();
