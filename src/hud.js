import { canvas } from './canvas.js';

const MOBILE_WIDTH = 600;
const MOBILE_HUD_SCALE = 2;

function renderScreenHUD(object, context) {
  if (!object.hud) return;
  // Mobile is decided by the device's screen width and nothing else.
  const scale = object.hudAnchor && screen.width < MOBILE_WIDTH ? MOBILE_HUD_SCALE : 1;
  const [ax, ay] = object.hudAnchor || [0, 0];
  context.save();
  // Scale around the declared screen anchor so edge-anchored HUD stays put.
  context.setTransform(scale, 0, 0, scale,
    canvas.width * ax * (1 - scale), canvas.height * ay * (1 - scale));
  object.hud(context);
  context.restore();
}

export { renderScreenHUD };
