import CubeObstacle from './CubeObstacle.js';
import { fillRect } from './canvasShapes.js';

// Uses the same solid box as a wall: bars are visual, never collision gaps.
function MetalGrate({ x, y, w, h }) {
  return {
    ...CubeObstacle(x, y, w, h),
    render(context) {
      const left = this.x - this.w / 2;
      const top = this.y - this.h / 2 - this.height;
      const bottom = this.y + this.h / 2;
      context.save();
      fillRect(context, left, top, this.w, bottom - top, '#223', 0.65);
      context.fillStyle = '#899';
      const bars = Math.ceil(this.w / 18);
      for (let i = 0; i <= bars; i++) {
        context.fillRect(left + i * this.w / bars - 2, top, 4, bottom - top);
      }
      context.fillStyle = '#bcc';
      for (let y = top; y < bottom; y += 24) context.fillRect(left, y, this.w, 3);
      context.strokeStyle = '#556';
      context.lineWidth = 5;
      context.strokeRect(left, top, this.w, bottom - top);
      context.restore();
    },
  };
}

export default MetalGrate;
