import CubeObstacle from './CubeObstacle.js';

// Uses the same solid box as a wall: bars are visual, never collision gaps.
function MetalGrate({ x, y, w, h }) {
  return {
    ...CubeObstacle(x, y, w, h),
    blocksSweptMotion: true,
    render(context) {
      const left = this.x - this.w / 2;
      const top = this.y - this.h / 2 - this.height;
      const bottom = this.y + this.h / 2;
      context.save();
      context.fillStyle = 'rgba(30, 35, 43, 0.65)';
      context.fillRect(left, top, this.w, bottom - top);
      context.fillStyle = '#89939e';
      const bars = Math.ceil(this.w / 18);
      for (let i = 0; i <= bars; i++) {
        context.fillRect(left + i * this.w / bars - 2, top, 4, bottom - top);
      }
      context.fillStyle = '#bcc4cc';
      for (let y = top; y < bottom; y += 24) context.fillRect(left, y, this.w, 3);
      context.strokeStyle = '#505b68';
      context.lineWidth = 5;
      context.strokeRect(left, top, this.w, bottom - top);
      context.restore();
    },
  };
}

export default MetalGrate;
