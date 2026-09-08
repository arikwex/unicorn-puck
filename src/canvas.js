const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.imageSmoothingEnabled = false;
}

function withTransform(draw) {
  ctx.save();
  draw(ctx);
  ctx.restore();
}

addEventListener('resize', resize);
resize();

export { canvas, ctx, withTransform };
