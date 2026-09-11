import { on } from './bus.js';
import { canvas } from './canvas.js';
import { playItemCollected } from './sounds.js';

const DURATION = 3.5;
const FADE_IN = 0.15;
const FADE_OUT = 0.25;
const HEIGHT = 44;
const MARGIN = 24;

function ToastSystem() {
  const queue = [];
  let message;
  let elapsed = 0;
  let unsubscribe = [];

  function showNext() {
    const next = queue.shift();
    message = next?.message;
    elapsed = 0;
    if (next?.itemCollected) playItemCollected();
  }

  function enqueue(notification, priority = false) {
    if (priority) {
      // Resume an interrupted pickup message afterward without replaying
      // its already-heard chime. Combat instructions appear immediately.
      if (message) queue.unshift({ message });
      queue.unshift(notification);
      showNext();
    } else {
      queue.push(notification);
      if (!message) showNext();
    }
  }

  return {
    hudAnchor: [0.5, 1],
    order: 1e6,

    start() {
      unsubscribe = [
        on('item-collected', ({ name }) => enqueue({ message: `${name} Collected`, itemCollected: true })),
        on('toast', ({ message, priority }) => enqueue({ message }, priority)),
      ];
    },

    destroy() {
      unsubscribe.forEach((off) => off());
      queue.length = 0;
      message = undefined;
    },

    update(dt) {
      if (!message) return;
      elapsed += dt;
      if (elapsed >= DURATION) showNext();
    },

    renderHUD(context) {
      if (!message) return;
      const enter = Math.min(1, elapsed / FADE_IN);
      const maxWidth = canvas.width - MARGIN * 2;
      context.save();
      context.font = 'bold 20px sans-serif';
      const textWidth = context.measureText(message).width;
      const width = Math.min(maxWidth, textWidth + 32);
      const fontSize = 20 * Math.min(1, (maxWidth - 32) / textWidth);
      const x = canvas.width / 2;
      const y = canvas.height - MARGIN - HEIGHT + (1 - enter) ** 2 * HEIGHT;
      context.globalAlpha = Math.min(enter, (DURATION - elapsed) / FADE_OUT);
      context.fillStyle = 'rgba(0, 0, 0, 0.85)';
      context.fillRect(x - width / 2, y, width, HEIGHT);
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.strokeRect(x - width / 2, y, width, HEIGHT);
      context.font = `bold ${fontSize}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#fff';
      context.fillText(message, x, y + HEIGHT / 2);
      context.restore();
    },
  };
}

export default ToastSystem;
