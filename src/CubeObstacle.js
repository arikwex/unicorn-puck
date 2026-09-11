import { TAG_OBSTACLE } from './tags.js';

const OVERHANG_RATIO = 0.75;

function CubeObstacle(x = 0, y = 0, w = 60, h = 60, props = {}) {
  // Dark violet stone, matching the sanctuary reference art's wall/column
  // blocks rather than the previous mossy green.
  const {
    height = 65, bounciness = 0.4, topColor = '#7c6865', sideColor = '#453f5d',
  } = props;
  return {
    x, y, w, h, height, bounciness, topColor, sideColor,
    tags: [TAG_OBSTACLE],
    order: y + h / 2,

    puck() {
      return {
        x: this.x, y: this.y,
        halfWidth: this.w / 2, halfHeight: this.h / 2,
        shape: 'box', mass: Infinity,
        vx: 0, vy: 0, omega: 0,
        bounciness: this.bounciness,
      };
    },

    render(context) {
      // Snap shared edges in screen space so fractional zoom/panning cannot
      // leave anti-aliased seams between neighboring wall rectangles.
      const { a, d, e, f } = context.getTransform();
      const sx = (value) => Math.round(value * a + e);
      const sy = (value) => Math.round(value * d + f);
      const left = sx(this.x - this.w / 2);
      const right = sx(this.x + this.w / 2);
      // Put 75% of the wall height above its footprint, preserving the
      // full front-face height while reducing occlusion behind the wall.
      const overhang = this.height * OVERHANG_RATIO;
      const top = sy(this.y - this.h / 2 - overhang);
      const bottom = sy(this.y + this.h / 2 - overhang);
      const front = sy(this.y + this.h / 2 - overhang + this.height);
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = this.sideColor;
      context.fillRect(left, bottom, right - left, front - bottom);
      context.fillStyle = this.topColor;
      context.fillRect(left, top, right - left, bottom - top);
      context.restore();
    },
  };
}

export default CubeObstacle;
