import { canvas } from './canvas.js';
import { renderChaliceIcon } from './Chalice.js';
import CubeObstacle from './CubeObstacle.js';
import { clamp } from './mathUtils.js';
import Pillar from './Pillar.js';
import { renderPlayer } from './PlayerCharacter.js';

const TITLE_TOP = 'PEGACORN';
const TITLE_BOTTOM = 'BLOOD';
const BLOOD_COLOR = '#f22'; // matches the damage-flash red used elsewhere
const TITLE_FONT_RATIO = 0.115; // font size as a fraction of canvas width
const TITLE_FONT_MIN = 34;
const TITLE_FONT_MAX = 104;
const TITLE_LINE_GAP = 1.05; // BLOOD's baseline drop, in title-font-sizes

const CHARACTER_ANGLE = -Math.PI / 4; // matches renderPlayerPortrait's own flattering 3/4 view
const CHARACTER_SCALE_RATIO = 0.006; // character scale as a fraction of the shorter canvas dimension
const CHARACTER_SCALE_MIN = 1.6;
const CHARACTER_SCALE_MAX = 3.2;

const PROMPT_FONT_SIZE = 22;
const PROMPT_BOTTOM_MARGIN = 48;
const PROMPT_PULSE_SPEED = 3; // rad/s

const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Large centered idle unicorn, a static rainbow "PEGACORN" over a
// permanently red "BLOOD", and a pulsing "click/tap anywhere" prompt at the
// bottom -- the whole thing is HUD-space (raw canvas pixels), so it's
// unaffected by any camera. Calls `onBegin()` on the first pointer press
// anywhere on the canvas -- `{ once: true }` fires and detaches itself, so
// there's no started flag/wrapper/destroy() needed to guard against a
// second call.
function MainMenu(onBegin) {
  let anim = 0;
  // Render-only scenery: never added to the world or pickup/physics passes.
  const candelabra = Pillar(0, 0, { variant: 3 });
  // [left, right, y] as fractions of the canvas, plus each wall's cube.
  const walls = [
    [0.7, 1.15, 0.27],
    [-0.15, 0.28, 0.32],
    [-0.15, 0.12, 0.53],
  ].map((placement) => [...placement, CubeObstacle()]);

  canvas.addEventListener('pointerdown', onBegin, { once: true });

  return {
    update(dt) {
      anim += dt;
      candelabra.update(dt);
    },

    renderHUD(context) {
      const cx = canvas.width / 2;
      const sceneryScale = Math.min(canvas.width / 800, canvas.height / 600, 1.5);
      // Keep the props legible on phones without enlarging desktop art
      // or overrunning the available height in short landscape windows.
      const propScale = Math.min(Math.max(canvas.width / 800, 0.75), canvas.height / 600, 1.5);
      context.save();
      context.globalAlpha = 0.45;
      walls.forEach(([left, right, y, wall]) => {
        wall.x = canvas.width * (left + right) / 2;
        wall.y = canvas.height * y;
        wall.w = canvas.width * (right - left);
        wall.h = 45 * sceneryScale;
        wall.height = 65 * sceneryScale;
        wall.render(context);
      });
      context.restore();

      context.save();
      context.translate(canvas.width * 0.2, canvas.height * 0.73);
      context.scale(propScale * 1.35, propScale * 1.35);
      candelabra.render(context);
      context.restore();
      renderChaliceIcon(context, canvas.width * 0.8,
        canvas.height * 0.65 + Math.sin(anim * 2.2) * 4 * propScale,
        propScale * 3.4);

      const titleFont = clamp(canvas.width * TITLE_FONT_RATIO, TITLE_FONT_MIN, TITLE_FONT_MAX);
      const font = `900 ${titleFont}px sans-serif`;
      const topY = canvas.height * 0.2;
      const bottomY = topY + titleFont * TITLE_LINE_GAP;

      // Each letter of the title gets its own hue -- drawn left-aligned at
      // a manually walked x (textAlign must be 'left' for that, not the
      // 'center' every other line here uses) starting from the whole
      // word's own centered left edge.
      context.font = font;
      context.textAlign = 'left';
      const widths = [...TITLE_TOP].map((c) => context.measureText(c).width);
      let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
      [...TITLE_TOP].forEach((c, i) => {
        context.fillStyle = `hsl(${i * 34},100%,65%)`;
        context.fillText(c, x, topY);
        x += widths[i];
      });

      context.textAlign = 'center';
      context.fillStyle = BLOOD_COLOR;
      context.fillText(TITLE_BOTTOM, cx, bottomY);

      const scale = clamp(Math.min(canvas.width, canvas.height) * CHARACTER_SCALE_RATIO, CHARACTER_SCALE_MIN, CHARACTER_SCALE_MAX);
      context.save();
      context.translate(cx, canvas.height * 0.58);
      context.scale(scale, scale);
      renderPlayer(context, { x: 0, y: 0, angle: CHARACTER_ANGLE }, anim, 0, []);
      context.restore();

      const promptText = `[${IS_TOUCH ? 'Tap' : 'Click'} Anywhere to Begin]`;
      context.font = `bold ${PROMPT_FONT_SIZE}px sans-serif`;
      context.fillStyle = '#fff';
      // No need to reset globalAlpha back to 1 after -- hud.js's own
      // renderScreenHUD already wraps every renderHUD call in save/restore.
      context.globalAlpha = 0.6 + 0.4 * Math.sin(anim * PROMPT_PULSE_SPEED);
      context.fillText(promptText, cx, canvas.height - PROMPT_BOTTOM_MARGIN);
    },
  };
}

export default MainMenu;
