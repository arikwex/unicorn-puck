import { canvas } from './canvas.js';
import { getObjectsByTag } from './engine.js';
import { PLAYER_RADIUS } from './PlayerCharacter.js';
import { TAG_CAMERA, TAG_PLAYER } from './tags.js';

// The camera zooms itself purely off current screen size, no device
// detection needed: the character should always read as roughly this
// fraction of the shorter screen dimension, so a phone's narrower viewport
// naturally zooms out (more dungeon visible) rather than cropping the
// character down the way a fixed zoom would.
const CHARACTER_SCREEN_FRACTION = 0.1;

function computeZoom() {
  const targetDiameter = Math.min(canvas.width, canvas.height) * CHARACTER_SCREEN_FRACTION;
  return targetDiameter / (PLAYER_RADIUS * 2);
}

// `k` is the exponential easing rate (1/s): each frame the camera closes
// the fraction 1 - e^(-k * dt) of the remaining distance to its target.
// No rotation -- only x/y follow.
function Camera(x = 0, y = 0, k = 8) {
  let target;
  let camera;

  function followedObject() {
    return target || getObjectsByTag(TAG_PLAYER)[0];
  }

  camera = {
    x,
    y,
    zoom: computeZoom(),
    k,
    order: -1e4,
    tags: [TAG_CAMERA],

    follow(object) {
      target = object;
      return this;
    },

    update(dt) {
      // Recomputed every frame (cheap: two comparisons and a divide) so a
      // resize/orientation change takes effect immediately, not just on
      // the next Camera() construction.
      this.zoom = computeZoom();
      const followed = followedObject();
      if (!followed) return;
      const ease = 1 - Math.exp(-this.k * dt);
      this.x += (followed.x - this.x) * ease;
      this.y += (followed.y - this.y) * ease;
    },

    set(context) {
      context.translate(canvas.width / 2, canvas.height / 2);
      context.scale(this.zoom, this.zoom);
      context.translate(-this.x, -this.y);
    },

    screenToWorld(screenX, screenY) {
      return {
        x: (screenX - canvas.width / 2) / this.zoom + this.x,
        y: (screenY - canvas.height / 2) / this.zoom + this.y,
      };
    },
  };

  // Snap to the target immediately so the first frame doesn't ease in
  // from (0, 0).
  const followed = followedObject();
  if (followed) {
    camera.x = followed.x;
    camera.y = followed.y;
  }
  return camera;
}

export default Camera;
