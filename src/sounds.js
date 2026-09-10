// Procedural one-shot SFX built on audio.js's synth()/play() primitives --
// same technique as https://github.com/arikwex/infernal-sigil/blob/master/src/audio.js
// (a plain per-sample math function baked into a short buffer once, then
// played back), adapted to this project's synth(duration, sample) signature
// where `sample` receives elapsed time in seconds rather than a raw sample
// index. Each buffer is generated once and memoized; per-play "juice"
// (louder/higher-pitched for a harder hit) comes from play()'s own
// volume/rate params rather than regenerating the waveform.

import { play, synth } from './audio.js';

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// A soft square wave via hard-clamped sine, same trick the reference uses.
function sqr(phase) {
  return clamp(Math.sin(phase) * 1000, -1, 1);
}

function noise() {
  return Math.random() * 2 - 1;
}

// Defers buffer generation until first play, so nothing touches
// AudioContext (and its sample rate) before one exists.
function lazySound(duration, sample) {
  let buffer;
  return () => buffer || (buffer = synth(duration, sample));
}

// -- charge/drag release --------------------------------------------------
// A quick descending "twang": pitch snaps down fast from a high starting
// point while amplitude decays, like a plucked string releasing.
const launchBuffer = lazySound(0.22, (t) => {
  const envelope = Math.exp(-t * 12);
  const freq = 180 + 700 * Math.exp(-t * 30);
  return 0.18 * Math.sin(TAU * freq * t) * envelope;
});

function playLaunch(intensity = 1) {
  const level = clamp(intensity, 0, 1);
  play(launchBuffer(), 0.35 + 0.55 * level, 0.9 + 0.35 * level);
}

// -- bounce off wall/obstacle ----------------------------------------------
// A short knock: a noise transient for the "crack" of contact plus a low
// sine thump underneath for body.
const wallBounceBuffer = lazySound(0.14, (t) => {
  const envelope = Math.exp(-t * 35);
  const thump = Math.sin(TAU * 90 * t) * Math.exp(-t * 22);
  return 0.22 * (noise() * 0.5 * envelope + thump * 0.6);
});

function playWallBounce(impactSpeed = 200) {
  const level = clamp(impactSpeed / 400, 0, 1);
  play(wallBounceBuffer(), 0.25 + 0.55 * level, 0.9 + 0.25 * level);
}

// -- hit enemy --------------------------------------------------------------
// A juicy low-end thump: a fast-dropping sub-bass tone, soft-clipped for
// saturation/punch, with only a brief noise click at the very onset (not a
// sustained hiss, which is what read as "snarey") to give the hit an edge.
const enemyHitBuffer = lazySound(0.26, (t) => {
  const bodyEnvelope = Math.exp(-t * 11);
  const punchEnvelope = Math.exp(-t * 70);
  const boomFreq = 35 + 90 * Math.exp(-t * 9);
  const boom = clamp(Math.sin(TAU * boomFreq * t) * 1.7, -1, 1);
  const click = noise() * punchEnvelope;
  return 0.26 * (boom * bodyEnvelope * 0.85 + click * 0.5);
});

function playEnemyHit(damage = 1) {
  const level = damage >= 2 ? 1 : 0.5;
  play(enemyHitBuffer(), 0.55 + 0.4 * level, 0.85 + 0.2 * level);
}

// -- player takes damage -----------------------------------------------------
// A harsher, longer "hurt" buzz: a descending square-ish tone with a fast
// tremolo wobble and a little noise grit, distinct from the other three so
// it always reads as bad-for-you.
const playerDamageBuffer = lazySound(0.4, (t) => {
  const envelope = Math.exp(-t * 6);
  const freq = 200 * Math.exp(-t * 2.5);
  const tremolo = 0.6 + 0.4 * Math.sin(TAU * 22 * t);
  const buzz = sqr(TAU * freq * t);
  return envelope * tremolo * (0.16 * buzz + 0.06 * noise());
});

function playPlayerDamage() {
  play(playerDamageBuffer(), 0.7, 1);
}

// -- enemy fires an ooze projectile -----------------------------------------
// A wet "blorp": a low-frequency wobble modulates the pitch of a falling
// tone, plus a little noise grit for wetness -- reads as a squelchy launch
// rather than the crisp "twang" of the player's own release.
const oozeShotBuffer = lazySound(0.28, (t) => {
  const envelope = Math.min(1, t / 0.02) * Math.exp(-t * 9);
  const wobble = Math.sin(TAU * 14 * t) * 35;
  const freq = 220 + wobble - 150 * (t / 0.28);
  const tone = Math.sin(TAU * freq * t);
  return 0.2 * envelope * (tone * 0.85 + noise() * 0.15);
});

function playOozeShot() {
  play(oozeShotBuffer(), 0.55, 1);
}

export {
  playEnemyHit, playLaunch, playOozeShot, playPlayerDamage, playWallBounce,
};
