import { canvas } from './canvas.js';

const DEFAULT_DURATION = 3; // seconds on screen before handing back to the main menu
const FADE_IN = 0.25;
const FADE_OUT = 0.5;
const CARD_WIDTH_RATIO = 0.6;
const CARD_WIDTH_MIN = 260;
const CARD_WIDTH_MAX = 560;
const CARD_HEIGHT_MIN = 150;
const CARD_PADDING = 24;
const TITLE_FONT_RATIO = 0.07;
const TITLE_FONT_MIN = 30;
const TITLE_FONT_MAX = 58;
const DEFAULT_COLOR = '#ff2020'; // matches the damage-flash red used elsewhere

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// A brief centered status card -- one or more lines of bold text, fading
// in then out over `duration` seconds, then calling `onDone` (and
// self-removing) exactly once. Used for both the game-over and level-win
// screens (see GameFlow.js), which only differ in text/color.
function StatusCard(onDone, props = {}) {
  const {
    lines = ['GAME OVER'], color = DEFAULT_COLOR, duration = DEFAULT_DURATION,
  } = props;
  let elapsed = 0;

  return {
    hudAnchor: [0.5, 0.5],
    update(dt) {
      elapsed += dt;
      if (elapsed >= duration) {
        onDone();
        return true;
      }
    },

    renderHUD(context) {
      let alpha = 1;
      if (elapsed < FADE_IN) alpha = elapsed / FADE_IN;
      else if (elapsed > duration - FADE_OUT) alpha = Math.max(0, (duration - elapsed) / FADE_OUT);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const width = clamp(canvas.width * CARD_WIDTH_RATIO, CARD_WIDTH_MIN, CARD_WIDTH_MAX);
      let font = clamp(canvas.width * TITLE_FONT_RATIO, TITLE_FONT_MIN, TITLE_FONT_MAX);

      context.save();
      context.font = `900 ${font}px sans-serif`;
      // Shrink to fit if the longest line would overflow the card at the
      // ratio-based size -- keeps a longer title (e.g. multi-word) from
      // spilling past the card's edges the way "GAME OVER" never would.
      const longestLine = Math.max(...lines.map((line) => context.measureText(line).width));
      const maxTextWidth = width - CARD_PADDING * 2;
      if (longestLine > maxTextWidth) {
        font *= maxTextWidth / longestLine;
        context.font = `900 ${font}px sans-serif`;
      }

      const lineHeight = font * 1.15;
      const height = Math.max(CARD_HEIGHT_MIN, lineHeight * lines.length + CARD_PADDING * 2);

      context.globalAlpha = alpha;
      context.fillStyle = 'rgba(0, 0, 0, 0.75)';
      context.fillRect(cx - width / 2, cy - height / 2, width, height);
      context.strokeStyle = color;
      context.lineWidth = 4;
      context.strokeRect(cx - width / 2, cy - height / 2, width, height);

      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = color;
      const startY = cy - (lineHeight * (lines.length - 1)) / 2;
      lines.forEach((line, i) => context.fillText(line, cx, startY + i * lineHeight));
      context.restore();
    },
  };
}

export default StatusCard;
