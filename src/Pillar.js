import { fillEllipse, fillRect } from './canvasShapes.js';
import { TAG_OBSTACLE } from './tags.js';
import { TAU } from './mathUtils.js';

// Active variants: 0 = classic column, 3 = candelabra.

// A small extruded square slab -- a flat top face sitting on a shaded side
// face dropping down by `height` -- used for both the pillar's base and
// its capital.
function renderSlab(context, topY) {
  fillRect(context, -32, topY, 64, 8, '#444');
  fillRect(context, -32, topY - 19.2, 64, 19.2, '#a99');
}

/* -- variant 1: crystal on a squat plinth -- retired to cut size;
   kept here commented rather than deleted.

// Base and shaft radius match the classic pillar's own (see obstacle.base
// fields / radius below) -- only the shaft height is halved, so the plinth reads as
// a shorter version of the same column rather than its own thinner one.
const CRYSTAL_BASE_SIZE = 16; // half-diagonal of the diamond, pre-scale
const CRYSTAL_OVERALL_SCALE = 1.3; // 30% larger
const CRYSTAL_VERTICAL_STRETCH = 1.5; // additional vertical-only stretch, on top of the overall scale
const CRYSTAL_SIZE = CRYSTAL_BASE_SIZE * CRYSTAL_OVERALL_SCALE;
const CRYSTAL_FLOAT_HEIGHT = 40; // rest height above the plinth top -- clears the now-taller gem
const CRYSTAL_BOB_SPEED = 0.9; // rad/s -- slow, so it clearly reads as levitating rather than jittering
const CRYSTAL_BOB_AMOUNT = 9;
const CRYSTAL_COLOR = '#2bc'; // teal
const CRYSTAL_DARK_COLOR = '#167';
const CRYSTAL_HIGHLIGHT_COLOR = '#bef';
const CRYSTAL_GLOW_COLOR = '#2bc';

function renderCrystalPillar(context, obstacle, anim) {
  const {
    x, y, radius, baseHalfSize, baseHeight, shaftHeight, stoneColor, shadeColor,
  } = obstacle;
  const shaftTop = y - shaftHeight / 2;
  renderSlab(context, x, y, baseHalfSize, baseHeight, stoneColor, shadeColor);
  renderShaft(context, x, shaftTop, y, radius, stoneColor, shadeColor);

  const gemY = shaftTop - CRYSTAL_FLOAT_HEIGHT + Math.sin(anim * CRYSTAL_BOB_SPEED) * CRYSTAL_BOB_AMOUNT;
  // Vertical half-extent gets the extra stretch; horizontal keeps the
  // diamond's original width-to-height ratio applied to the (already
  // 30%-larger) base size.
  const vSize = CRYSTAL_SIZE * CRYSTAL_VERTICAL_STRETCH;
  const hSize = CRYSTAL_SIZE * 0.7;

  // Soft pulsing glow behind the gem.
  context.globalAlpha = 0.3 + 0.15 * Math.sin(anim * CRYSTAL_BOB_SPEED * 1.3);
  fillEllipse(context, x, gemY, hSize * 1.8, vSize * 0.9, CRYSTAL_GLOW_COLOR);
  context.globalAlpha = 1;

  // Diamond: full shape in the base color, then an overlapping bottom
  // half in the dark color for a simple two-facet shading.
  context.fillStyle = CRYSTAL_COLOR;
  context.beginPath();
  context.moveTo(x, gemY - vSize);
  context.lineTo(x + hSize, gemY);
  context.lineTo(x, gemY + vSize);
  context.lineTo(x - hSize, gemY);
  context.closePath();
  context.fill();
  context.fillStyle = CRYSTAL_DARK_COLOR;
  context.beginPath();
  context.moveTo(x - hSize, gemY);
  context.lineTo(x, gemY + vSize);
  context.lineTo(x + hSize, gemY);
  context.closePath();
  context.fill();
  context.fillStyle = CRYSTAL_HIGHLIGHT_COLOR;
  context.beginPath();
  context.moveTo(x - 4 * CRYSTAL_OVERALL_SCALE, gemY - vSize * 0.5);
  context.lineTo(x + 2 * CRYSTAL_OVERALL_SCALE, gemY - vSize * 0.15);
  context.lineTo(x - 2 * CRYSTAL_OVERALL_SCALE, gemY - vSize * 0.05);
  context.closePath();
  context.fill();
}

*/

// -- candelabra flame flicker -------------------------------------------
const FLAME_BASE_COLOR = '#f60';
const FLAME_MID_COLOR = '#fa0';
const FLAME_TIP_COLOR = '#fea';
const FLAME_HEIGHT = 22;
const FLAME_WIDTH = 12;
const FLAME_FLICKER_SPEED = 9; // rad/s

// A small flame drawn two local pixels above its candle cup.
// Two off-ratio sine waves (no per-frame rng needed)
// wobble its height/width and sideways sway so it never looks static.
function renderFlame(context, anim) {
  const flicker = Math.sin(anim * FLAME_FLICKER_SPEED) * 0.15 + Math.sin(anim * FLAME_FLICKER_SPEED * 1.7 + 1) * 0.08;
  const sway = Math.sin(anim * FLAME_FLICKER_SPEED * 0.6) * 2;
  const h = FLAME_HEIGHT * (1 + flicker);
  const w = FLAME_WIDTH * (1 - flicker * 0.5);

  function teardrop(color, scale) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(sway, -2 - h * scale);
    context.quadraticCurveTo((w * scale) / 2 + sway, -2 - h * scale * 0.4, sway * 0.5, -2);
    context.quadraticCurveTo(-(w * scale) / 2 + sway, -2 - h * scale * 0.4, sway, -2 - h * scale);
    context.closePath();
    context.fill();
  }
  teardrop(FLAME_BASE_COLOR, 1);
  teardrop(FLAME_MID_COLOR, 0.7);
  teardrop(FLAME_TIP_COLOR, 0.4);
}

/* -- variant 2: square pillar with a flame on top -- still retired -------
// Base, cap, and shaft width match the classic pillar's own (see
// obstacle.base/cap/radius fields below) -- only the shaft height is halved.
const SQUARE_FLAME_SCALE = 2.5;

function renderSquarePillar(context, obstacle, anim) {
  const {
    x, y, radius, baseHalfSize, baseHeight, shaftHeight, capHalfSize, capHeight, stoneColor, shadeColor,
  } = obstacle;
  const shaftBottom = y;
  const shaftTop = y - shaftHeight / 2;

  renderSlab(context, x, shaftBottom, baseHalfSize, baseHeight, stoneColor, shadeColor);

  context.fillStyle = stoneColor;
  context.fillRect(x - radius, shaftTop, radius * 2, shaftBottom - shaftTop);
  context.fillStyle = shadeColor;
  context.fillRect(x + radius * 0.4, shaftTop, radius * 0.6, shaftBottom - shaftTop);

  const capTopY = shaftTop - capHeight;
  renderSlab(context, x, capTopY, capHalfSize, capHeight, stoneColor, shadeColor);

  // renderSlab's own top face is a flat rect running from
  // capTopY - capHalfSize*0.6 up to capTopY, so that (not capTopY itself)
  // is the cap's actual highest visible point -- anchoring the flame
  // there instead sits it on the surface rather than sunk into the cap.
  context.save();
  context.translate(x, capTopY - capHalfSize * 0.6);
  context.scale(SQUARE_FLAME_SCALE, SQUARE_FLAME_SCALE);
  renderFlame(context, 0, 0, anim);
  context.restore();
}

*/

// -- variant 3: 3-prong candelabra ----------------------------------------
const CANDELABRA_METAL_COLOR = '#eb4';
const CANDELABRA_METAL_DARK_COLOR = '#a82';
const CANDELABRA_STEM_HEIGHT = 90;
const CANDELABRA_STEM_WIDTH = 5;
const CANDELABRA_BRANCH_Y_OFFSET = 24; // above the stem base, where the side arms split off
const CANDELABRA_ARM_LENGTH = 22;
const CANDELABRA_ARM_RISE = 14; // above the stem's own top, where the side arms end up
const CANDELABRA_FLAME_SCALE = 0.7;

// Both looks share a 26-unit collision radius. Only the variant is configurable;
// fixed drawing dimensions avoid storing unused per-instance style properties.
function Pillar(x = 0, y = 0, props = {}) {
  const { variant = 0 } = props;
  let anim = Math.random() * TAU;

  return {
    x,
    y,
    r: 26,
    tags: [TAG_OBSTACLE],
    // Same painter's-algorithm depth sort as CubeObstacle -- see its
    // `z` comment.
    z: y,

    tick(dt) {
      anim += dt;
    },

    // Local coordinates let both looks share one world translation, and both
    // are drawn inline -- each was referenced exactly once, through the
    // ternary that used to pick between two named renderers.
    render(context) {
      context.save();
      context.translate(this.x, this.y);
      if (variant === 3) {
        // -- variant 3: 3-prong candelabra, drawn around a local origin.
        const stemTop = -CANDELABRA_STEM_HEIGHT;
        const branchY = -CANDELABRA_BRANCH_Y_OFFSET;
        fillEllipse(context, 0, 0, 14, 5, CANDELABRA_METAL_DARK_COLOR);
        fillEllipse(context, 0, -2, 11, 4, CANDELABRA_METAL_COLOR);
        context.strokeStyle = CANDELABRA_METAL_COLOR;
        context.lineWidth = CANDELABRA_STEM_WIDTH;
        context.beginPath();
        context.moveTo(0, -4);
        context.lineTo(0, stemTop);
        context.stroke();
        [-1, 1].forEach((side) => {
          context.beginPath();
          context.moveTo(0, branchY);
          context.quadraticCurveTo(side * CANDELABRA_ARM_LENGTH, branchY, side * CANDELABRA_ARM_LENGTH, stemTop + CANDELABRA_ARM_RISE);
          context.stroke();
        });
        [-1, 0, 1].forEach((side) => {
          const tipX = side * CANDELABRA_ARM_LENGTH;
          const tipY = side === 0 ? stemTop : stemTop + CANDELABRA_ARM_RISE;
          fillEllipse(context, tipX, tipY, 5, 2.5, CANDELABRA_METAL_DARK_COLOR);
          context.save();
          context.translate(tipX, tipY);
          context.scale(CANDELABRA_FLAME_SCALE, CANDELABRA_FLAME_SCALE);
          // Phase-offset per arm so the three flames don't flicker in lockstep.
          renderFlame(context, anim + side * 0.7);
          context.restore();
        });
      } else {
        // -- variant 0: classic Roman column -- small extruded square base,
        // tall cylindrical shaft, small extruded square capital. The shaft's
        // ellipse and side stripe give it depth.
        renderSlab(context, 0);
        fillRect(context, -26, -110, 52, 110, '#a99');
        fillRect(context, 3.9, -110, 14.3, 110, '#444');
        fillEllipse(context, 0, -110, 26, 13, '#a99');
        renderSlab(context, -118);
      }
      context.restore();
    },
  };
}

export default Pillar;
