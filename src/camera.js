import { canvas } from './canvas.js';
import { getObjectsByTag } from './engine.js';
import { TAG_CAMERA, TAG_PLAYER } from './tags.js';

// `k` is the exponential easing rate (1/s): each frame the camera closes
// the fraction 1 - e^(-k * dt) of the remaining distance to its target.
// No rotation -- only x/y follow.
function Camera(x = 0, y = 0, zoom = 1, k = 8) {
  let target;
  let camera;

  function followedObject() {
    return target || getObjectsByTag(TAG_PLAYER)[0];
  }

  camera = {
    x,
    y,
    zoom,
    k,
    order: -1e4,
    tags: [TAG_CAMERA],

    follow(object) {
      target = object;
      return this;
    },

    update(dt) {
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
