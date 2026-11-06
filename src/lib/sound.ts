'use client';

/**
 * Synthesised sound design — no audio assets, no autoplay.
 *
 * The AudioContext is only created after a user gesture (see unlock()), and every cue is
 * a short Web Audio envelope. That keeps the bundle small, avoids licensing questions and
 * guarantees the browser never blocks or surprises the player.
 */
export type Cue =
  | 'reveal'
  | 'open'
  | 'bid'
  | 'outbid'
  | 'tick'
  | 'urgent'
  | 'sold'
  | 'passed'
  | 'victory'
  | 'error'
  | 'click';

type Ctor = typeof AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;

function resolveContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: Ctor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Must be called from inside a user gesture handler. */
export function unlockAudio(): void {
  if (context) {
    void context.resume();
    return;
  }
  const Ctor = resolveContextCtor();
  if (!Ctor) return;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = 0.22;
  master.connect(context.destination);
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  if (value) unlockAudio();
}

export function isSoundEnabled(): boolean {
  return enabled;
}

interface ToneOptions {
  frequency: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Linear ramp target; creates rising stings and falling thuds. */
  slideTo?: number;
  delay?: number;
}

function tone({ frequency, duration, type = 'sine', gain = 0.5, slideTo, delay = 0 }: ToneOptions): void {
  if (!context || !master) return;
  const start = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), start + duration);

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.02, duration / 4));
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(envelope);
  envelope.connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(duration: number, gain = 0.3, delay = 0): void {
  if (!context || !master) return;
  const frames = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const envelope = context.createGain();
  envelope.gain.value = gain;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1400;
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(master);
  source.start(context.currentTime + delay);
}

export function playCue(cue: Cue): void {
  if (!enabled || !context) return;
  if (context.state === 'suspended') void context.resume();

  switch (cue) {
    case 'reveal':
      tone({ frequency: 110, slideTo: 520, duration: 0.7, type: 'sawtooth', gain: 0.32 });
      tone({ frequency: 220, slideTo: 880, duration: 0.5, type: 'triangle', gain: 0.18, delay: 0.08 });
      noise(0.5, 0.12, 0.1);
      break;
    case 'open':
      tone({ frequency: 520, duration: 0.12, type: 'square', gain: 0.24 });
      tone({ frequency: 780, duration: 0.18, type: 'square', gain: 0.2, delay: 0.1 });
      break;
    case 'bid':
      tone({ frequency: 620, slideTo: 880, duration: 0.14, type: 'triangle', gain: 0.3 });
      break;
    case 'outbid':
      tone({ frequency: 420, slideTo: 220, duration: 0.28, type: 'sawtooth', gain: 0.28 });
      break;
    case 'tick':
      tone({ frequency: 900, duration: 0.05, type: 'square', gain: 0.12 });
      break;
    case 'urgent':
      tone({ frequency: 1200, duration: 0.07, type: 'square', gain: 0.26 });
      tone({ frequency: 1200, duration: 0.07, type: 'square', gain: 0.2, delay: 0.12 });
      break;
    case 'sold':
      tone({ frequency: 180, slideTo: 90, duration: 0.35, type: 'sawtooth', gain: 0.4 });
      noise(0.25, 0.22);
      tone({ frequency: 660, duration: 0.22, type: 'triangle', gain: 0.26, delay: 0.06 });
      tone({ frequency: 990, duration: 0.3, type: 'triangle', gain: 0.22, delay: 0.16 });
      break;
    case 'passed':
      tone({ frequency: 300, slideTo: 150, duration: 0.4, type: 'sine', gain: 0.24 });
      break;
    case 'victory':
      [523, 659, 784, 1046].forEach((frequency, index) => {
        tone({ frequency, duration: 0.5, type: 'triangle', gain: 0.3, delay: index * 0.13 });
      });
      noise(0.8, 0.12, 0.1);
      break;
    case 'error':
      tone({ frequency: 200, duration: 0.16, type: 'square', gain: 0.24 });
      break;
    case 'click':
      tone({ frequency: 760, duration: 0.04, type: 'square', gain: 0.1 });
      break;
    default:
      break;
  }
}
