import { canvas } from './canvas.js';
import { TAG_CAMERA } from './tags.js';

function Camera(x = 0, y = 0, zoom = 1) {
  let target;

  return {
    x,
    y,
    zoom,
    order: -1e4,
    tags: [TAG_CAMERA],

    follow(object) {
      target = object;
      return this;
    },

    update(dt) {
      if (!target) return;
      const smoothing = 1 - Math.exp(-8 * dt);
      this.x += (target.x - this.x) * smoothing;
      this.y += (target.y - this.y) * smoothing;
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
}

export default Camera;
