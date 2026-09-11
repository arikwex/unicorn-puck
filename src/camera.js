import { canvas } from './canvas.js';
import { getObjectsByTag } from './engine.js';
import { PLAYER_RADIUS } from './PlayerCharacter.js';
import { TAG_CAMERA, TAG_PLAYER } from './tags.js';

// The camera zooms itself purely off current screen size, no device
// detection needed: the character should always read as roughly this
// fraction of the shorter screen dimension, so a phone's narrower viewport
// naturally zooms out (more dungeon visible) rather than cropping the
// character down the way a fixed zoom would.
function computeZoom() {
  // Magic number for crunch
  return Math.min(canvas.width, canvas.height) * 0.0012;
}

// Follows the live player (x/y only, no rotation), and holds still once
// there's no living player -- so the view stays frozen where a run ended.
// Add it after the player: it starts on them rather than easing in from (0, 0).
function Camera() {
  const player = getObjectsByTag(TAG_PLAYER)[0];
  return {
    x: player.x,
    y: player.y,
    zoom: computeZoom(),
    order: -1e4,
    tags: [TAG_CAMERA],

    update(dt) {
      // Recomputed every frame (cheap: two comparisons and a divide) so a
      // resize/orientation change takes effect immediately, not just on
      // the next Camera() construction.
      this.zoom = computeZoom();
      const followed = getObjectsByTag(TAG_PLAYER)[0];
      if (!followed) return;
      this.x += (followed.x - this.x) * 5 * dt;
      this.y += (followed.y - this.y) * 5 * dt;
    },

    set(context) {
      context.translate(canvas.width / 2, canvas.height / 2);
      context.scale(this.zoom, this.zoom);
      context.translate(-this.x, -this.y);
    },
  };
}

export default Camera;
