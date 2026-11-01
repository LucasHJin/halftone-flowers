/**
 * A rough sound add-on built only on the package's public events: a pluck for each petal knocked
 * off, a soft knock for a nod, a rustle and sparkles for a puff, a two-note chime for a heart, and
 * a breeze that follows the pointer trail's speed. All synthesized with Web Audio.
 */
import { useEffect, useState, type RefObject } from "react";
import { useFieldEvents, type FieldEvents, type FlowerFieldHandle, type Kind } from "halftone-flowers";

/** D major pentatonic over two octaves, Hz. */
const SCALE = [293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880, 987.77];

interface Tone {
  type?: OscillatorType;
  gain: number;
  /** Seconds to fade to silence. */
  decay: number;
}

class FieldSound {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private room!: ConvolverNode;
  private noise!: AudioBuffer;
  private breeze: { gain: GainNode; filter: BiquadFilterNode; pan: StereoPannerNode } | null = null;
  private volume = 0.6;

  /** Creates or resumes the context. Only works inside a user gesture, or after one on the page. */
  unlock() {
    // Creating one before the gesture registers would start it suspended and log a warning.
    if (navigator.userActivation && !navigator.userActivation.isActive && !this.ctx) return;
    if (!this.ctx) this.build();
    void this.ctx!.resume();
  }

  mute() {
    this.breathe(0, 0.05);
    void this.ctx?.suspend();
  }

  close() {
    void this.ctx?.close();
    this.ctx = null;
    this.breeze = null;
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.ctx) this.out.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
  }

  shed(e: FieldEvents["shed"]) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = pitch(e.kind, e.y / e.height);
    const v = this.voice(e.x / e.width, 0.6);
    this.tone(v, f, t, { type: "triangle", gain: 0.22, decay: 1.1 });
    this.tone(v, f * 2, t, { gain: 0.05, decay: 0.5 });
    // The last petal: a fifth below rings on after it.
    if (e.left === 0) this.tone(v, f / 1.5, t + 0.12, { gain: 0.14, decay: 1.8 });
  }

  nod(e: FieldEvents["nod"]) {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = this.voice(e.x / e.width, 0.15);
    this.tone(v, 150, ctx.currentTime, { gain: 0.2, decay: 0.12 });
    this.tone(v, 310, ctx.currentTime, { gain: 0.05, decay: 0.06 });
  }

  puff(e: FieldEvents["puff"]) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const v = this.voice(e.x / e.width, 0.5);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(900, t);
    band.frequency.exponentialRampToValueAtTime(2800, t + 0.35);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.1 + 0.01 * Math.min(e.count, 10), t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(band).connect(env).connect(v);
    src.start(t, Math.random());
    src.stop(t + 0.55);
    for (let i = 0; i < Math.min(4, Math.ceil(e.count / 3)); i++) {
      const f = SCALE[5 + Math.floor(Math.random() * 5)] * 2;
      this.tone(v, f, t + 0.04 + Math.random() * 0.22, { gain: 0.035, decay: 0.4 });
    }
  }

  heart(e: FieldEvents["heart"]) {
    const ctx = this.ctx;
    if (!ctx) return;
    const bee = e.insect === "bee";
    const v = this.voice(e.x / e.width, 0.7);
    const [a, b] = bee ? [SCALE[7], SCALE[9]] : [SCALE[5], SCALE[7]];
    const gap = bee ? 0.09 : 0.16;
    this.bell(v, a, ctx.currentTime);
    this.bell(v, b, ctx.currentTime + gap);
  }

  trail(e: FieldEvents["trail"]) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const b = this.breeze ?? this.startBreeze();
    const t = ctx.currentTime;
    b.filter.frequency.setTargetAtTime(300 + Math.min(e.speed, 2500) * 0.9, t, 0.06);
    b.pan.pan.setTargetAtTime((e.x / e.width) * 1.6 - 0.8, t, 0.06);
    this.breathe(0.16 * Math.min(1, e.speed / 1600) ** 0.7, e.speed ? 0.06 : 0.3);
  }

  private breathe(level: number, tau: number) {
    if (this.ctx && this.breeze) this.breeze.gain.gain.setTargetAtTime(level, this.ctx.currentTime, tau);
  }

  private build() {
    const ctx = (this.ctx = new AudioContext());
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
    this.room = ctx.createConvolver();
    this.room.buffer = roomTail(ctx, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.room.connect(wet).connect(this.out);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  private startBreeze() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    src.connect(filter).connect(gain).connect(pan).connect(this.out);
    src.start();
    return (this.breeze = { gain, filter, pan });
  }

  /** Panned to `across` (0 left to 1 right), dry plus `send` into the room. */
  private voice(across: number, send: number) {
    const ctx = this.ctx!;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (across * 2 - 1) * 0.8;
    pan.connect(this.out);
    const s = ctx.createGain();
    s.gain.value = send;
    pan.connect(s).connect(this.room);
    return pan;
  }

  private tone(to: AudioNode, freq: number, at: number, { type = "sine", gain, decay }: Tone) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(env).connect(to);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }

  /** Inharmonic partials, the upper ones dying first, as a small bell's do. */
  private bell(to: AudioNode, freq: number, at: number) {
    this.tone(to, freq, at, { gain: 0.13, decay: 1.6 });
    this.tone(to, freq * 2.76, at, { gain: 0.045, decay: 0.8 });
    this.tone(to, freq * 5.4, at, { gain: 0.02, decay: 0.3 });
  }
}

/** Each kind gets its own degree of the scale, an octave up in the top half of the field. */
function pitch(kind: Kind, down: number) {
  let hash = 0;
  for (const ch of kind) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return SCALE[(hash % 5) + (down < 0.5 ? 5 : 0)];
}

/** Stereo decaying noise, for a convolver's soft room. */
function roomTail(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

export function useFieldSound(field: RefObject<FlowerFieldHandle | null>, { enabled, volume }: { enabled: boolean; volume: number }) {
  const [sound] = useState(() => new FieldSound());

  useEffect(() => sound.setVolume(volume), [sound, volume]);

  useEffect(() => {
    if (!enabled) return;
    sound.unlock();
    // Browsers start audio only in a user gesture: pointerdown counts for a mouse, pointerup for touch.
    const unlock = () => sound.unlock();
    const gestures = ["pointerdown", "pointerup", "keydown"] as const;
    for (const type of gestures) window.addEventListener(type, unlock, { capture: true });
    return () => {
      for (const type of gestures) window.removeEventListener(type, unlock, { capture: true });
      sound.mute();
    };
  }, [sound, enabled]);

  useEffect(() => () => sound.close(), [sound]);

  useFieldEvents(
    field,
    enabled
      ? {
          shed: (e) => sound.shed(e),
          nod: (e) => sound.nod(e),
          puff: (e) => sound.puff(e),
          heart: (e) => sound.heart(e),
          trail: (e) => sound.trail(e),
        }
      : {},
  );
}
