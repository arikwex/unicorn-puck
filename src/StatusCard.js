import { canvas } from './canvas.js';
import { fillRect } from './canvasShapes.js';
import { clamp } from './mathUtils.js';

const DURATION = 3; // seconds on screen before handing back to the main menu
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
const DEFAULT_COLOR = '#f22'; // matches the damage-flash red used elsewhere

// A brief centered status card -- one or more lines of bold text, fading
// in then out over DURATION seconds, then calling `onDone` (and
// self-removing) exactly once. Used for both the game-over and level-win
// screens (see GameFlow.js), which only differ in text/color.
function StatusCard(onDone, props = {}) {
  const {
    lines = ['GAME OVER'], color = DEFAULT_COLOR,
  } = props;
  let elapsed = 0;

  return {
    hudAnchor: [0.5, 0.5],
    update(dt) {
      elapsed += dt;
      if (elapsed >= DURATION) {
        onDone();
        return true;
      }
    },

    renderHUD(context) {
      let alpha = 1;
      if (elapsed < FADE_IN) alpha = elapsed / FADE_IN;
      else if (elapsed > DURATION - FADE_OUT) alpha = Math.max(0, (DURATION - elapsed) / FADE_OUT);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const width = clamp(canvas.width * CARD_WIDTH_RATIO, CARD_WIDTH_MIN, CARD_WIDTH_MAX);
      const font = clamp(canvas.width * TITLE_FONT_RATIO, TITLE_FONT_MIN, TITLE_FONT_MAX);

      context.save();
      context.font = `900 ${font}px sans-serif`;

      const lineHeight = font * 1.15;
      const height = Math.max(CARD_HEIGHT_MIN, lineHeight * lines.length + CARD_PADDING * 2);

      context.globalAlpha = alpha;
      fillRect(context, cx - width / 2, cy - height / 2, width, height, '#000', 0.75);
      context.strokeStyle = color;
      context.lineWidth = 4;
      context.strokeRect(cx - width / 2, cy - height / 2, width, height);

      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = color;
      const startY = cy - (lineHeight * (lines.length - 1)) / 2;
      // fillText's maxWidth squeezes a line that would overflow the card
      // (e.g. "PEGACORN BLOOD" on a phone) instead of spilling past it.
      lines.forEach((line, i) => context.fillText(line, cx, startY + i * lineHeight, width - CARD_PADDING * 2));
      context.restore();
    },
  };
}

export default StatusCard;
