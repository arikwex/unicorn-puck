import { canvas } from './canvas.js';
import { getObjectsByTag } from './engine.js';
import { TAG_CAMERA, TAG_PLAYER } from './tags.js';

function Camera(x = 0, y = 0, zoom = 1) {
  let target;
  let camera;

  function centerOnTarget() {
    const followed = target || getObjectsByTag(TAG_PLAYER)[0];
    if (!followed) return;
    camera.x = followed.x;
    camera.y = followed.y;
  }

  camera = {
    x,
    y,
    zoom,
    order: -1e4,
    tags: [TAG_CAMERA],

    follow(object) {
      target = object;
      return this;
    },

    update() {
      centerOnTarget();
    },

    set(context) {
      centerOnTarget();
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

  // Center correctly even before the camera's first update pass.
  camera.update();
  return camera;
}

export default Camera;
