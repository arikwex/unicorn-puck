// Procedurally generated background music, built the same way as sounds.js
// (see that file's header, and the infernal-sigil reference) but as one big
// hand-assembled buffer instead of a single per-sample formula: drums, bass,
// and lead notes are each additively stamped into a shared Float32Array at
// their scheduled offsets, the same technique the reference's own
// genericSongBuilder uses. Built once and looped forever via audio.js's
// music().
//
// 120 BPM in eighth-note slots of 0.25s: a bar is 8 slots, one lap of the
// 4-bar progression 32, and eight laps (256 slots, 64s) make up the whole
// looped buffer.

import { init, music } from './audio.js';
import { clamp, noise, TAU } from './mathUtils.js';

// Pitches are letters, one equal-tempered semitone apart: 'c' is A4 (440
// Hz), so 'a' is G4, 'o' is A5 and 'K' is A2. Takes the letter's char code.
const pitch = (code) => 440 * 2 ** ((code - 99) / 12);

// A Phrygian's i - bII - iv - bVII (Am - Bb - Dm - Gm) bass roots -- A2,
// Bb2, D3, G2 (see pitch above): the flat second (Bb over an A center) is the classic
// "exotic/dungeon" half-step tension that a plain natural-minor progression
// doesn't have, and it steers well clear of the i-VI-III-VII "sensitive
// female chord progression" cliche.
const CHORD_BASS_ROOTS = 'KLPI';

// One 4-bar melodic phrase, one character per eighth-note slot: a pitch
// letter, or '-' to hold the previous note. Bar 0 states the Bb->A
// half-step tension outright (that's the Phrygian color), the phrase leaps
// rather than walks stepwise for a more angular shape, and bar 3 restates
// the same half-step resolution right before the loop seam so it reads as
// a motif, not just a cadence.
const MELODY = 'jdc-fdcjkhd-hkfhhko-khjfadh-dadc';

// Built on first call (needs a live AudioContext for its sample rate), then
// handed to audio.js's looping music() player.
function playDungeonTheme() {
  const context = init();
  const { sampleRate } = context;
  const buffer = context.createBuffer(1, 64 * sampleRate, sampleRate);
  const data = buffer.getChannelData(0);

  // Additively stamps `wave(secondsIntoNote)` into the buffer (writes past
  // the end are dropped). Amplitudes leave headroom for kick+hat+bass+lead
  // all landing on one downbeat, so the mix never needs clamping.
  const stamp = (start, duration, amplitude, wave) => {
    const offset = start * sampleRate | 0;
    for (let i = 0; i < duration * sampleRate; i++) data[offset + i] += wave(i / sampleRate) * amplitude;
  };
  // Two barely-detuned sines for a chorused synth-lead sparkle.
  const lead = (start, duration, freq, amplitude) => stamp(start, duration, amplitude, (t) => Math.min(1, t / 0.015)
    * Math.exp(-t * 4) * (Math.sin(TAU * freq * t) + Math.sin(TAU * freq * 1.003 * t) * 0.8));

  for (let slot = 0; slot < 256; slot++) {
    const start = slot / 4;
    // Sparse in, full groove, a brief octave-doubled lead peak, sparse out
    // -- so the 8 laps read as one intro/build/peak/outro arc rather than 8
    // identical repeats before the loop wraps back to the sparse intro.
    const full = (slot >> 5) % 7; // laps 1-6: snare and lead
    const note = MELODY[slot % 32];

    // Hat every eighth, accented on the beat.
    stamp(start, 0.06, slot % 2 ? 0.06 : 0.1, (t) => noise() * Math.exp(-t * 90));
    if (slot % 2 < 1) {
      // A fat, softly-saturated bass pluck on every beat...
      const root = pitch(CHORD_BASS_ROOTS.charCodeAt(slot >> 3 & 3));
      stamp(start, 0.45, 0.18, (t) => clamp(Math.sin(TAU * root * t) * 1.5, -1, 1) * Math.exp(-t * 7));
      if (slot % 4) {
        // ...snare on the backbeats...
        if (full) stamp(start, 0.18, 0.24, (t) => (noise() * 0.8 + Math.sin(TAU * 190 * t) * 0.3) * Math.exp(-t * 30));
      } else {
        // ...and a pitch-dropping kick on 1 and 3.
        stamp(start, 0.25, 0.5, (t) => Math.sin(TAU * (40 + 130 * Math.exp(-t * 28)) * t) * Math.exp(-t * 18));
      }
    }

    if (full && note !== '-') {
      const duration = MELODY[slot % 32 + 1] === '-' ? 0.48 : 0.24;
      const freq = pitch(note.charCodeAt());
      lead(start, duration, freq, 0.066);
      if (slot >> 6 === 2) lead(start, duration, freq * 2, 0.03); // laps 4-5
    }
  }

  music(buffer);
}

export { playDungeonTheme };
