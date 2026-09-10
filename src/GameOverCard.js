import { canvas } from './canvas.js';

const DURATION = 3; // seconds on screen before handing back to the main menu
const FADE_IN = 0.25;
const FADE_OUT = 0.5;
const CARD_WIDTH_RATIO = 0.6;
const CARD_WIDTH_MIN = 260;
const CARD_WIDTH_MAX = 520;
const CARD_HEIGHT = 150;
const TITLE_FONT_RATIO = 0.07;
const TITLE_FONT_MIN = 30;
const TITLE_FONT_MAX = 58;
const RED = '#ff2020'; // matches the damage-flash red used elsewhere

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// A brief centered "GAME OVER" card, fading in then out over DURATION
// seconds, then calling `onDone` (and self-removing) exactly once.
function GameOverCard(onDone) {
  let elapsed = 0;

  return {
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
      context.globalAlpha = alpha;
      context.fillStyle = 'rgba(0, 0, 0, 0.75)';
      context.fillRect(cx - width / 2, cy - CARD_HEIGHT / 2, width, CARD_HEIGHT);
      context.strokeStyle = RED;
      context.lineWidth = 4;
      context.strokeRect(cx - width / 2, cy - CARD_HEIGHT / 2, width, CARD_HEIGHT);

      context.font = `900 ${font}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = RED;
      context.fillText('GAME OVER', cx, cy);
      context.restore();
    },
  };
}

export default GameOverCard;
