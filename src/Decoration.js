// Wall-mounted dressing for otherwise-bare hallway/room walls: a shield, a
// candle sconce, a mounted crystal, or a runic stone. Purely decorative --
// no tags, no puck(), nothing for physics to see -- just a render (plus a
// tiny per-instance anim clock for the candle's flame).
import { renderFlame } from './Pillar.js';

const TAU = Math.PI * 2;
const MOUNT_Y_OFFSET = 24; // drawn this far above the wall/floor seam, as if mounted partway up the wall

const METAL_COLOR = '#a9822a';
const METAL_LIGHT_COLOR = '#e8c34a';
const WAX_COLOR = '#e8ddc0';
const CRYSTAL_COLOR = '#22c3d4';
const CRYSTAL_DARK_COLOR = '#0d6e78';
const STONE_COLOR = '#5a4a46';
const RUNE_GLOW_COLOR = '#8fd6ff';

// Every draw function works in the same local space, canonically oriented
// for a "down" (horizontal, south-facing) wall -- Decoration's own render()
// rotates the whole thing a quarter turn for a left/right (vertical) wall,
// so the same art still reads as flush against whichever wall it's on.
function drawShield(context) {
  context.fillStyle = METAL_LIGHT_COLOR;
  context.beginPath();
  context.moveTo(-9, -12);
  context.lineTo(9, -12);
  context.lineTo(9, 2);
  context.quadraticCurveTo(9, 14, 0, 18);
  context.quadraticCurveTo(-9, 14, -9, 2);
  context.closePath();
  context.fill();
  context.fillStyle = METAL_COLOR;
  context.fillRect(-1.5, -12, 3, 30);
  context.fillRect(-9, 1, 18, 3);
}

function drawCandle(context, anim) {
  context.fillStyle = METAL_COLOR;
  context.fillRect(-7, 6, 14, 5);
  context.fillStyle = WAX_COLOR;
  context.fillRect(-2, -8, 4, 14);
  renderFlame(context, 0, -8, anim);
}

function drawCrystal(context) {
  context.fillStyle = STONE_COLOR;
  context.fillRect(-7, 8, 14, 5);
  context.fillStyle = CRYSTAL_COLOR;
  context.beginPath();
  context.moveTo(0, -14);
  context.lineTo(6, 2);
  context.lineTo(0, 10);
  context.lineTo(-6, 2);
  context.closePath();
  context.fill();
  context.fillStyle = CRYSTAL_DARK_COLOR;
  context.beginPath();
  context.moveTo(-6, 2);
  context.lineTo(0, 10);
  context.lineTo(6, 2);
  context.closePath();
  context.fill();
}

function drawRune(context) {
  context.fillStyle = STONE_COLOR;
  context.fillRect(-8, -12, 16, 26);
  context.strokeStyle = RUNE_GLOW_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(-4, -6);
  context.lineTo(4, 6);
  context.moveTo(4, -6);
  context.lineTo(-4, 6);
  context.moveTo(0, -9);
  context.lineTo(0, 9);
  context.stroke();
}

const DRAW_FUNCTIONS = {
  shield: drawShield, candle: drawCandle, crystal: drawCrystal, rune: drawRune,
};
const DECORATION_TYPES = Object.keys(DRAW_FUNCTIONS);

// `facing` is which way the mounted face points: 'down' for a horizontal,
// south-facing wall (drawn as-is), or 'left'/'right' for a vertical wall
// (rotated a quarter turn, mirrored per side).
function Decoration(x, y, type, facing) {
  let anim = Math.random() * TAU;
  const draw = DRAW_FUNCTIONS[type];

  return {
    x,
    y,
    order: y + 1, // just after the wall it's mounted on, which shares this same y
    update(dt) {
      anim += dt;
    },
    render(context) {
      context.save();
      context.translate(x, y - MOUNT_Y_OFFSET);
      if (facing === 'left') context.rotate(-Math.PI / 2);
      else if (facing === 'right') context.rotate(Math.PI / 2);
      draw(context, anim);
      context.restore();
    },
  };
}

export default Decoration;
export { DECORATION_TYPES };
