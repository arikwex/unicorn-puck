import { canvas } from './canvas.js';
import { clamp } from './mathUtils.js';
import { renderPlayer } from './PlayerCharacter.js';

const TITLE_TOP = 'PEGACORN';
const TITLE_BOTTOM = 'BLOOD';
const TITLE_FONT_RATIO = 0.115; // font size as a fraction of canvas width
const TITLE_FONT_MIN = 34;
const TITLE_FONT_MAX = 104;
const TITLE_LINE_GAP = 1.05; // BLOOD's baseline drop, in title-font-sizes

const CHARACTER_ANGLE = -Math.PI / 4; // matches renderPlayerPortrait's own flattering 3/4 view
const CHARACTER_SCALE_RATIO = 0.006; // character scale as a fraction of the shorter canvas dimension
const CHARACTER_SCALE_MIN = 1.6;
const CHARACTER_SCALE_MAX = 3.2;

const PROMPT_FONT_SIZE = 56;
const PROMPT_BOTTOM_MARGIN = 48;
const PROMPT_PULSE_SPEED = 3; // rad/s

// Centered idle unicorn, gradient title, and pulsing start prompt in
// canvas pixels. The first pointer press anywhere starts the game.
function MainMenu(onBegin) {
  let anim = 0;
  canvas.addEventListener('pointerdown', onBegin, { once: true });

  return {
    tick(dt) {
      anim += dt;
    },

    hud(context) {
      const cx = canvas.width / 2;
      const mobile = Math.min(screen.width, canvas.width) < 600;
      const titleFont = clamp(canvas.width * TITLE_FONT_RATIO, TITLE_FONT_MIN, TITLE_FONT_MAX) * (mobile ? 2.25 : 1);
      const font = `900 ${titleFont}px sans-serif`;
      const topY = canvas.height * 0.2;
      const bottomY = topY + titleFont * TITLE_LINE_GAP;

      context.font = font;
      context.textAlign = 'center';
      const textWidth = canvas.width - 32;
      const halfWidth = Math.min(context.measureText(TITLE_TOP).width, textWidth) / 2;
      const gradient = context.createLinearGradient(cx - halfWidth, 0, cx + halfWidth, 0);
      gradient.addColorStop(0, '#f66');
      gradient.addColorStop(0.5, '#ff6');
      gradient.addColorStop(1, '#6cf');
      context.fillStyle = gradient;
      context.fillText(TITLE_TOP, cx, topY, textWidth);
      context.fillText(TITLE_BOTTOM, cx, bottomY, textWidth);

      const scale = clamp(Math.min(canvas.width, canvas.height) * CHARACTER_SCALE_RATIO, CHARACTER_SCALE_MIN, CHARACTER_SCALE_MAX);
      context.save();
      context.translate(cx, canvas.height * 0.58);
      context.scale(scale, scale);
      renderPlayer(context, { x: 0, y: 0, a: CHARACTER_ANGLE }, anim, 0, []);
      context.restore();

      context.font = `bold ${PROMPT_FONT_SIZE}px sans-serif`;
      context.fillStyle = '#fff';
      // No need to reset globalAlpha back to 1 after -- hud.js's own
      // renderScreenHUD already wraps every hud() call in save/restore.
      context.globalAlpha = 0.6 + 0.4 * Math.sin(anim * PROMPT_PULSE_SPEED);
      context.fillText('[Click to Start]', cx, canvas.height - (mobile ? canvas.height * 0.12 : PROMPT_BOTTOM_MARGIN), textWidth);
    },
  };
}

export default MainMenu;
