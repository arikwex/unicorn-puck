// Tiny generic helpers shared by whatever needed them (menus/cards for
// `clamp`, the two procedural-audio modules for `noise`), instead of each
// consumer redefining an identical copy locally.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// A uniform sample in [-1, 1) -- white noise for the procedural SFX/music
// synthesis in sounds.js/music.js.
function noise() {
  return Math.random() * 2 - 1;
}

export { clamp, noise };
