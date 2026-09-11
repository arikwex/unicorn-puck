import { fillCircle } from './canvasShapes.js';

const SHIELD_COLOR = '#4af';

// Shared by the pickup and the single protective bubble around the player.
function renderBubbleShield(context, x, y, radius) {
  context.save();
  const alpha = context.globalAlpha;
  context.globalAlpha = alpha * 0.18;
  fillCircle(context, x, y, radius, SHIELD_COLOR);
  // The filled circle is still the current path, so its rim strokes as-is.
  context.strokeStyle = '#6cf';
  context.globalAlpha = alpha * 0.8;
  context.lineWidth = 3;
  context.stroke();
  context.beginPath();
  context.arc(x, y, radius * 0.82, Math.PI * 1.08, Math.PI * 1.4);
  context.strokeStyle = '#eff';
  context.globalAlpha = alpha * 0.85;
  context.stroke();
  context.restore();
}

export { renderBubbleShield, SHIELD_COLOR };
