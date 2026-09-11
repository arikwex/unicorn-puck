import { canvas } from './canvas.js';
import { fillRect } from './canvasShapes.js';
import { playItemCollected } from './sounds.js';

const DURATION = 3.5;
const FADE_IN = 0.15;
const FADE_OUT = 0.25;
const HEIGHT = 44;
const MARGIN = 24;

// Module-singleton message state (like chaliceProgress.js's own pattern) --
// whichever caller wants a toast shown just calls showToast()/
// showItemCollectedToast() directly, read here every frame by the one
// ToastSystem HUD instance. Replaces the old event-bus emit('toast', ...)/
// on('toast', ...) pair, which only ever had this one subscriber.
let message;
let elapsed = 0;

function showToast(text) {
  message = text;
  elapsed = 0;
}

function showItemCollectedToast(name) {
  showToast(`${name} Collected`);
  playItemCollected();
}

function ToastSystem() {
  message = undefined;
  elapsed = 0;

  return {
    hudAnchor: [0.5, 1],
    z: 1e6,

    tick(dt) {
      if (!message) return;
      elapsed += dt;
      if (elapsed >= DURATION) message = undefined;
    },

    hud(context) {
      if (!message) return;
      const enter = Math.min(1, elapsed / FADE_IN);
      const maxWidth = canvas.width - MARGIN * 2;
      context.save();
      context.font = 'bold 20px sans-serif';
      const textWidth = context.measureText(message).width;
      const width = Math.min(maxWidth, textWidth + 32);
      const x = canvas.width / 2;
      const y = canvas.height - MARGIN - HEIGHT + (1 - enter) ** 2 * HEIGHT;
      context.globalAlpha = Math.min(enter, (DURATION - elapsed) / FADE_OUT);
      fillRect(context, x - width / 2, y, width, HEIGHT, '#000', 0.85);
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.strokeRect(x - width / 2, y, width, HEIGHT);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#fff';
      // maxWidth squeezes a message too long for a narrow screen to fit.
      context.fillText(message, x, y + HEIGHT / 2, maxWidth - 32);
      context.restore();
    },
  };
}

export default ToastSystem;
export { showItemCollectedToast, showToast };
