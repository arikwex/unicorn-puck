import { canvas } from './canvas.js';

const MOBILE_HUD_SCALE = 0.65;
const MOBILE_WIDTH = 600;

function hudScale() {
  // Coarse pointers include phones/tablets in landscape; the width check
  // also supports narrow desktop windows and mobile viewport previews.
  return canvas.width <= MOBILE_WIDTH || globalThis.matchMedia?.('(pointer: coarse)').matches
    ? MOBILE_HUD_SCALE : 1;
}

function renderScreenHUD(object, context) {
  if (!object.renderHUD) return;
  const scale = object.hudAnchor ? hudScale() : 1;
  const [ax, ay] = object.hudAnchor || [0, 0];
  context.save();
  // Scale around the declared screen anchor, not the world/camera origin.
  // Unmarked renderHUD users (aim indicator and menu) remain full-size.
  context.setTransform(scale, 0, 0, scale,
    canvas.width * ax * (1 - scale), canvas.height * ay * (1 - scale));
  object.renderHUD(context);
  context.restore();
}

export { hudScale, renderScreenHUD };
