// Procedurally generated background music, built the same way as sounds.js
// (see that file's header, and the infernal-sigil reference) but as one big
// hand-assembled buffer instead of a single per-sample formula: drums, bass,
// and lead notes are each additively stamped into a shared Float32Array at
// their scheduled sample offsets, the same technique the reference's own
// genericSongBuilder uses. Built once and looped forever via audio.js's
// music(), which sets AudioBufferSourceNode.loop = true.

import { init, music } from './audio.js';

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function noise() {
  return Math.random() * 2 - 1;
}

// -- tempo/timing -----------------------------------------------------------
const BPM = 120;
const BEAT = 60 / BPM; // 0.5s
const SLOT = BEAT / 2; // eighth note, 0.25s
const BAR = BEAT * 4; // 2s
const BARS_PER_PHRASE = 4; // one lap of the chord progression
const PHRASE_DURATION = BAR * BARS_PER_PHRASE; // 8s
const PHRASE_REPEATS = 8; // ~64s total -- "roughly a minute" before the whole buffer loops
const TOTAL_DURATION = PHRASE_DURATION * PHRASE_REPEATS;

// -- pitches ------------------------------------------------------------
const A2 = 110.00; const BB2 = 116.54; const D3 = 146.83; const G2 = 98.00;
const G4 = 392.00; const A4 = 440.00; const BB4 = 466.16; const C5 = 523.25;
const D5 = 587.33; const E5 = 659.25; const F5 = 698.46; const A5 = 880.00;

// A Phrygian's i - bII - iv - bVII (Am - Bb - Dm - Gm): the flat second
// (Bb over an A center) is the classic "exotic/dungeon" half-step tension
// that a plain natural-minor progression doesn't have, and it steers well
// clear of the i-VI-III-VII "sensitive female chord progression" cliche.
const CHORD_BASS_ROOT = [A2, BB2, D3, G2];

// One 4-bar melodic phrase. Bar 0 states the Bb->A half-step tension
// outright (that's the Phrygian color), the phrase leaps rather than walks
// stepwise for a more angular shape, and bar 3 restates the same half-step
// resolution right before the loop seam so it reads as a motif, not just a
// cadence. Entries: [bar, eighth-note slot (0-7), duration in slots, frequency].
const MELODY = [
  [0, 0, 1, E5], [0, 1, 1, BB4], [0, 2, 2, A4], [0, 4, 1, C5], [0, 5, 1, BB4], [0, 6, 1, A4], [0, 7, 1, E5],
  [1, 0, 1, F5], [1, 1, 1, D5], [1, 2, 2, BB4], [1, 4, 1, D5], [1, 5, 1, F5], [1, 6, 1, C5], [1, 7, 1, D5],
  [2, 0, 1, D5], [2, 1, 1, F5], [2, 2, 2, A5], [2, 4, 1, F5], [2, 5, 1, D5], [2, 6, 1, E5], [2, 7, 1, C5],
  [3, 0, 1, G4], [3, 1, 1, BB4], [3, 2, 2, D5], [3, 4, 1, BB4], [3, 5, 1, G4], [3, 6, 1, BB4], [3, 7, 1, A4],
];

// Per-layer amplitudes below are tuned assuming several layers land on the
// same downbeat at once (kick+hat+bass+lead all start a note on beat 1);
// this headroom scale keeps that worst-case pileup under the clamp instead
// of relying on the clamp itself, which would otherwise audibly distort.
const MASTER_GAIN = 0.6;

// -- one-shot writers: additively stamp a short envelope+waveform into
// `data` starting at `startSample`. Still clamped as a final safety net,
// not as the normal ceiling.
function stamp(data, sampleRate, startSample, duration, amplitude, wave) {
  const n = Math.floor(duration * sampleRate);
  for (let i = 0; i < n; i++) {
    const idx = startSample + i;
    if (idx < 0 || idx >= data.length) continue;
    data[idx] = clamp(data[idx] + wave(i / sampleRate) * amplitude * MASTER_GAIN, -1, 1);
  }
}

function writeKick(data, sampleRate, startSample) {
  stamp(data, sampleRate, startSample, 0.25, 0.85, (t) => {
    const envelope = Math.exp(-t * 18);
    const freq = 40 + 130 * Math.exp(-t * 28);
    return Math.sin(TAU * freq * t) * envelope;
  });
}

function writeSnare(data, sampleRate, startSample) {
  stamp(data, sampleRate, startSample, 0.18, 0.4, (t) => {
    const envelope = Math.exp(-t * 30);
    return (noise() * 0.8 + Math.sin(TAU * 190 * t) * 0.3) * envelope;
  });
}

function writeHat(data, sampleRate, startSample, accent) {
  stamp(data, sampleRate, startSample, 0.06, 0.16 * accent, (t) => noise() * Math.exp(-t * 90));
}

// A fat, softly-saturated pluck -- the "basic bass line", one root note per beat.
function writeBass(data, sampleRate, startSample, freq, duration) {
  stamp(data, sampleRate, startSample, duration, 0.3, (t) => {
    const envelope = Math.exp(-t * 7);
    return clamp(Math.sin(TAU * freq * t) * 1.5, -1, 1) * envelope;
  });
}

// Two barely-detuned sines for a chorused synth-lead sparkle.
function writeLead(data, sampleRate, startSample, freq, duration, amplitude) {
  const attack = Math.min(0.015, duration * 0.25);
  stamp(data, sampleRate, startSample, duration, amplitude, (t) => {
    const envelope = Math.min(1, t / attack) * Math.exp(-t * 4);
    const wave = (Math.sin(TAU * freq * t) + Math.sin(TAU * freq * 1.003 * t) * 0.8) * 0.5;
    return wave * envelope;
  });
}

// Sparse in, full groove, a brief lead-doubled peak, sparse out -- so the
// 8 laps of the progression read as one ~minute arc (intro/build/peak/outro)
// rather than 8 identical repeats, before AudioBufferSourceNode.loop wraps
// it back to the sparse intro and the whole thing vamps forever.
const ARRANGEMENT = [
  { drums: 'sparse', lead: false, harmony: false },
  { drums: 'full', lead: true, harmony: false },
  { drums: 'full', lead: true, harmony: false },
  { drums: 'full', lead: true, harmony: false },
  { drums: 'full', lead: true, harmony: true },
  { drums: 'full', lead: true, harmony: true },
  { drums: 'full', lead: true, harmony: false },
  { drums: 'sparse', lead: false, harmony: false },
];

function buildTheme(context) {
  const { sampleRate } = context;
  const buffer = context.createBuffer(1, Math.ceil(TOTAL_DURATION * sampleRate), sampleRate);
  const data = buffer.getChannelData(0);

  for (let rep = 0; rep < PHRASE_REPEATS; rep++) {
    const { drums, lead, harmony } = ARRANGEMENT[rep];
    const repStart = rep * PHRASE_DURATION;

    for (let bar = 0; bar < BARS_PER_PHRASE; bar++) {
      const barStart = repStart + bar * BAR;
      const slotSample = (slot) => Math.floor((barStart + slot * SLOT) * sampleRate);

      for (let slot = 0; slot < 8; slot++) writeHat(data, sampleRate, slotSample(slot), slot % 2 === 0 ? 1 : 0.6);
      writeKick(data, sampleRate, slotSample(0));
      writeKick(data, sampleRate, slotSample(4));
      if (drums === 'full') {
        writeSnare(data, sampleRate, slotSample(2));
        writeSnare(data, sampleRate, slotSample(6));
      }

      const root = CHORD_BASS_ROOT[bar];
      [0, 2, 4, 6].forEach((slot) => writeBass(data, sampleRate, slotSample(slot), root, BEAT * 0.9));
    }

    if (lead) {
      MELODY.forEach(([bar, slot, durSlots, freq]) => {
        const start = Math.floor((repStart + bar * BAR + slot * SLOT) * sampleRate);
        writeLead(data, sampleRate, start, freq, durSlots * SLOT * 0.95, 0.22);
        if (harmony) writeLead(data, sampleRate, start, freq * 2, durSlots * SLOT * 0.95, 0.1);
      });
    }
  }

  return buffer;
}

let themeBuffer;

// Lazily builds the buffer on first call (needs a live AudioContext for its
// sample rate) and hands it to audio.js's looping music() player.
function playDungeonTheme() {
  const context = init();
  if (!themeBuffer) themeBuffer = buildTheme(context);
  music(themeBuffer, 1.5);
}

export { playDungeonTheme };
