import { canvas } from './canvas.js';
import { renderChaliceIcon } from './Chalice.js';
import CubeObstacle from './CubeObstacle.js';
import Pillar from './Pillar.js';
import { renderPlayer } from './PlayerCharacter.js';

const TITLE_TOP = 'PEGACORN';
const TITLE_BOTTOM = 'BLOOD';
const BLOOD_COLOR = '#ff2020'; // matches the damage-flash red used elsewhere
const TITLE_FONT_RATIO = 0.115; // font size as a fraction of canvas width
const TITLE_FONT_MIN = 34;
const TITLE_FONT_MAX = 104;
const TITLE_LINE_GAP = 1.05; // BLOOD's baseline drop, in title-font-sizes
const HUE_ROTATION_SPEED = 70; // degrees/sec the rainbow cycles through
const HUE_STEP_PER_LETTER = 34; // degrees between adjacent letters, so the word spans most of the spectrum at once

const CHARACTER_ANGLE = -Math.PI / 4; // matches renderPlayerPortrait's own flattering 3/4 view
const CHARACTER_SCALE_RATIO = 0.006; // character scale as a fraction of the shorter canvas dimension
const CHARACTER_SCALE_MIN = 1.6;
const CHARACTER_SCALE_MAX = 3.2;

const PROMPT_FONT_SIZE = 22;
const PROMPT_BOTTOM_MARGIN = 48;
const PROMPT_PULSE_SPEED = 3; // rad/s

const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Draws `text` centered on (cx, y), each glyph colored by its own hue --
// `hueAt(index)` lets the title cycle continuously while a caller wanting a
// flat color can just pass `() => fixedHue`.
function renderRainbowText(context, text, cx, y, font, hueAt) {
  context.font = font;
  context.textBaseline = 'alphabetic';
  const widths = [...text].map((char) => context.measureText(char).width);
  const totalWidth = widths.reduce((sum, w) => sum + w, 0);
  let x = cx - totalWidth / 2;
  [...text].forEach((char, i) => {
    context.fillStyle = `hsl(${hueAt(i)}, 100%, 65%)`;
    context.fillText(char, x, y);
    x += widths[i];
  });
}

// Large centered idle unicorn, a shifting rainbow "PEGACORN" over a
// permanently red "BLOOD", and a pulsing "click/tap anywhere" prompt at the
// bottom -- the whole thing is HUD-space (raw canvas pixels), so it's
// unaffected by any camera. Calls `onBegin()` on the first pointer press
// anywhere on the canvas.
function MainMenu(onBegin) {
  let anim = 0;
  let started = false;
  // Render-only scenery: never added to the world or pickup/physics passes.
  const candelabra = Pillar(0, 0, { variant: 3 });
  const walls = [
    { x: 0.9, y: 0.27, width: 220 },
    { x: 0.12, y: 0.32, width: 180 },
    { x: 0.03, y: 0.53, width: 140 },
  ].map((placement) => ({ ...placement, wall: CubeObstacle() }));

  function onPointerDown() {
    if (started) return;
    started = true;
    onBegin();
  }

  canvas.addEventListener('pointerdown', onPointerDown);

  return {
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
    },

    update(dt) {
      anim += dt;
      candelabra.update(dt);
    },

    renderHUD(context) {
      const cx = canvas.width / 2;
      const sceneryScale = Math.min(canvas.width / 800, canvas.height / 600, 1.5);
      context.save();
      context.globalAlpha = 0.45;
      walls.forEach(({ x, y, width, wall }) => {
        wall.x = canvas.width * x;
        wall.y = canvas.height * y;
        wall.w = width * sceneryScale;
        wall.h = 45 * sceneryScale;
        wall.height = 65 * sceneryScale;
        wall.render(context);
      });
      context.restore();

      context.save();
      context.translate(canvas.width * 0.2, canvas.height * 0.73);
      context.scale(sceneryScale * 1.35, sceneryScale * 1.35);
      candelabra.render(context);
      context.restore();
      renderChaliceIcon(context, canvas.width * 0.8,
        canvas.height * 0.65 + Math.sin(anim * 2.2) * 4 * sceneryScale,
        sceneryScale * 3.4);

      const titleFont = clamp(canvas.width * TITLE_FONT_RATIO, TITLE_FONT_MIN, TITLE_FONT_MAX);
      const font = `900 ${titleFont}px sans-serif`;
      const topY = canvas.height * 0.2;
      const bottomY = topY + titleFont * TITLE_LINE_GAP;

      context.textAlign = 'left';
      const baseHue = (anim * HUE_ROTATION_SPEED) % 360;
      renderRainbowText(context, TITLE_TOP, cx, topY, font, (i) => (baseHue + i * HUE_STEP_PER_LETTER) % 360);

      context.font = font;
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
      context.textAlign = 'center';
      context.fillStyle = '#fff';
      context.globalAlpha = 0.6 + 0.4 * Math.sin(anim * PROMPT_PULSE_SPEED);
      context.fillText(promptText, cx, canvas.height - PROMPT_BOTTOM_MARGIN);
      context.globalAlpha = 1;
    },
  };
}

export default MainMenu;
