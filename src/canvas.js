const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  ctx.imageSmoothingEnabled = false;
  // Resizing resets all context state, so this lives here rather than
  // running once. Round everywhere: a miter join spikes into sharp peaks on
  // acute angles.
  ctx.lineCap = ctx.lineJoin = 'round';
}

function withTransform(draw) {
  ctx.save();
  draw(ctx);
  ctx.restore();
}

addEventListener('resize', resize);
resize();

export { canvas, ctx, withTransform };
