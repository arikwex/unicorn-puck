import { TAG_OBSTACLE } from './tags.js';

const TAU = Math.PI * 2;
const VARIANT_COUNT = 4;

function fillEllipse(context, x, y, radiusX, radiusY, color) {
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(x, y, radiusX, radiusY, 0, 0, TAU);
  context.fill();
}

// A small extruded square slab -- a flat top face sitting on a shaded side
// face dropping down by `height` -- used for both the pillar's base and
// its capital.
function renderSlab(context, x, topY, halfSize, height, topColor, sideColor) {
  context.fillStyle = sideColor;
  context.fillRect(x - halfSize, topY, halfSize * 2, height);
  context.fillStyle = topColor;
  context.fillRect(x - halfSize, topY - halfSize * 0.6, halfSize * 2, halfSize * 0.6);
}

// The cylindrical shaft: a body rectangle capped with a foreshortened
// ellipse (its round cross-section, seen from above), plus a shading
// stripe down one side to hint at the curve.
function renderShaft(context, x, topY, bottomY, radius, color, shadeColor) {
  context.fillStyle = color;
  context.fillRect(x - radius, topY, radius * 2, bottomY - topY);
  context.fillStyle = shadeColor;
  context.fillRect(x + radius * 0.15, topY, radius * 0.55, bottomY - topY);
  fillEllipse(context, x, topY, radius, radius * 0.5, color);
}

// -- variant 0: classic Roman column -----------------------------------
// Small extruded square base, tall cylindrical shaft, small extruded
// square capital.
function renderClassicPillar(context, obstacle) {
  const {
    x, y, radius, baseHalfSize, baseHeight, shaftHeight, capHalfSize, capHeight, stoneColor, shadeColor,
  } = obstacle;
  const shaftTopY = y - shaftHeight;
  const capTopY = shaftTopY - capHeight;

  renderSlab(context, x, y, baseHalfSize, baseHeight, stoneColor, shadeColor);
  renderShaft(context, x, shaftTopY, y, radius, stoneColor, shadeColor);
  renderSlab(context, x, capTopY, capHalfSize, capHeight, stoneColor, shadeColor);
}

// -- variant 1: crystal on a squat plinth --------------------------------
const CRYSTAL_BASE_HALF_SIZE = 20;
const CRYSTAL_BASE_HEIGHT = 8;
const CRYSTAL_SHAFT_HEIGHT = 22;
const CRYSTAL_SHAFT_RADIUS = 16;
const CRYSTAL_FLOAT_HEIGHT = 26; // rest height above the plinth top
const CRYSTAL_BOB_SPEED = 1.6; // rad/s
const CRYSTAL_BOB_AMOUNT = 5;
const CRYSTAL_SIZE = 16; // half-diagonal of the diamond
const CRYSTAL_COLOR = '#e0263f';
const CRYSTAL_DARK_COLOR = '#8f1226';
const CRYSTAL_HIGHLIGHT_COLOR = '#ff9db0';
const CRYSTAL_GLOW_COLOR = '#e0263f';

function renderCrystalPillar(context, obstacle, anim) {
  const { x, y, stoneColor, shadeColor } = obstacle;
  const shaftTop = y - CRYSTAL_SHAFT_HEIGHT;
  renderSlab(context, x, y, CRYSTAL_BASE_HALF_SIZE, CRYSTAL_BASE_HEIGHT, stoneColor, shadeColor);
  renderShaft(context, x, shaftTop, y, CRYSTAL_SHAFT_RADIUS, stoneColor, shadeColor);

  const gemY = shaftTop - CRYSTAL_FLOAT_HEIGHT + Math.sin(anim * CRYSTAL_BOB_SPEED) * CRYSTAL_BOB_AMOUNT;

  // Soft pulsing glow behind the gem.
  context.globalAlpha = 0.3 + 0.15 * Math.sin(anim * CRYSTAL_BOB_SPEED * 1.3);
  fillEllipse(context, x, gemY, CRYSTAL_SIZE * 1.6, CRYSTAL_SIZE * 1.1, CRYSTAL_GLOW_COLOR);
  context.globalAlpha = 1;

  // Diamond: full shape in the base color, then an overlapping bottom
  // half in the dark color for a simple two-facet shading.
  context.fillStyle = CRYSTAL_COLOR;
  context.beginPath();
  context.moveTo(x, gemY - CRYSTAL_SIZE);
  context.lineTo(x + CRYSTAL_SIZE * 0.7, gemY);
  context.lineTo(x, gemY + CRYSTAL_SIZE);
  context.lineTo(x - CRYSTAL_SIZE * 0.7, gemY);
  context.closePath();
  context.fill();
  context.fillStyle = CRYSTAL_DARK_COLOR;
  context.beginPath();
  context.moveTo(x - CRYSTAL_SIZE * 0.7, gemY);
  context.lineTo(x, gemY + CRYSTAL_SIZE);
  context.lineTo(x + CRYSTAL_SIZE * 0.7, gemY);
  context.closePath();
  context.fill();
  context.fillStyle = CRYSTAL_HIGHLIGHT_COLOR;
  context.beginPath();
  context.moveTo(x - 4, gemY - CRYSTAL_SIZE * 0.5);
  context.lineTo(x + 2, gemY - CRYSTAL_SIZE * 0.15);
  context.lineTo(x - 2, gemY - CRYSTAL_SIZE * 0.05);
  context.closePath();
  context.fill();
}

// -- shared flame flicker, used by variants 2 and 3 -----------------------
const FLAME_BASE_COLOR = '#ff6a00';
const FLAME_MID_COLOR = '#ffb100';
const FLAME_TIP_COLOR = '#fff3b0';
const FLAME_HEIGHT = 22;
const FLAME_WIDTH = 12;
const FLAME_FLICKER_SPEED = 9; // rad/s

// A small flickering flame, its tip sitting at (x, topY) and body hanging
// below/around it. Two off-ratio sine waves (no per-frame rng needed)
// wobble its height/width and sideways sway so it never looks static.
function renderFlame(context, x, topY, anim) {
  const flicker = Math.sin(anim * FLAME_FLICKER_SPEED) * 0.15 + Math.sin(anim * FLAME_FLICKER_SPEED * 1.7 + 1) * 0.08;
  const sway = Math.sin(anim * FLAME_FLICKER_SPEED * 0.6) * 2;
  const h = FLAME_HEIGHT * (1 + flicker);
  const w = FLAME_WIDTH * (1 - flicker * 0.5);

  function teardrop(color, scale) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x + sway, topY - h * scale);
    context.quadraticCurveTo(x + (w * scale) / 2 + sway, topY - h * scale * 0.4, x + sway * 0.5, topY);
    context.quadraticCurveTo(x - (w * scale) / 2 + sway, topY - h * scale * 0.4, x + sway, topY - h * scale);
    context.closePath();
    context.fill();
  }
  teardrop(FLAME_BASE_COLOR, 1);
  teardrop(FLAME_MID_COLOR, 0.7);
  teardrop(FLAME_TIP_COLOR, 0.4);
}

// -- variant 2: square pillar with a flame on top ------------------------
const SQUARE_HALF_SIZE = 20;
const SQUARE_HEIGHT = 100;
const SQUARE_BASE_HEIGHT = 10;
const SQUARE_CAP_HEIGHT = 10;

function renderSquarePillar(context, obstacle, anim) {
  const {
    x, y, stoneColor, shadeColor,
  } = obstacle;
  const shaftBottom = y;
  const shaftTop = y - SQUARE_HEIGHT;

  context.fillStyle = shadeColor;
  context.fillRect(x - SQUARE_HALF_SIZE - 4, shaftBottom - SQUARE_BASE_HEIGHT, (SQUARE_HALF_SIZE + 4) * 2, SQUARE_BASE_HEIGHT);

  context.fillStyle = stoneColor;
  context.fillRect(x - SQUARE_HALF_SIZE, shaftTop, SQUARE_HALF_SIZE * 2, shaftBottom - shaftTop);
  context.fillStyle = shadeColor;
  context.fillRect(x + SQUARE_HALF_SIZE * 0.4, shaftTop, SQUARE_HALF_SIZE * 0.6, shaftBottom - shaftTop);

  context.fillStyle = shadeColor;
  context.fillRect(x - SQUARE_HALF_SIZE - 4, shaftTop - SQUARE_CAP_HEIGHT, (SQUARE_HALF_SIZE + 4) * 2, SQUARE_CAP_HEIGHT);

  renderFlame(context, x, shaftTop - SQUARE_CAP_HEIGHT, anim);
}

// -- variant 3: 3-prong candelabra ----------------------------------------
const CANDELABRA_METAL_COLOR = '#e8c34a';
const CANDELABRA_METAL_DARK_COLOR = '#a9822a';
const CANDELABRA_STEM_HEIGHT = 90;
const CANDELABRA_STEM_WIDTH = 5;
const CANDELABRA_BRANCH_Y_OFFSET = 24; // above the stem base, where the side arms split off
const CANDELABRA_ARM_LENGTH = 22;
const CANDELABRA_ARM_RISE = 14; // above the stem's own top, where the side arms end up
const CANDELABRA_FLAME_SCALE = 0.7;

function renderCandelabra(context, obstacle, anim) {
  const { x, y } = obstacle;
  const stemTop = y - CANDELABRA_STEM_HEIGHT;
  const branchY = y - CANDELABRA_BRANCH_Y_OFFSET;

  fillEllipse(context, x, y, 14, 5, CANDELABRA_METAL_DARK_COLOR);
  fillEllipse(context, x, y - 2, 11, 4, CANDELABRA_METAL_COLOR);

  context.strokeStyle = CANDELABRA_METAL_COLOR;
  context.lineWidth = CANDELABRA_STEM_WIDTH;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(x, y - 4);
  context.lineTo(x, stemTop);
  context.stroke();
  [-1, 1].forEach((side) => {
    context.beginPath();
    context.moveTo(x, branchY);
    context.quadraticCurveTo(x + side * CANDELABRA_ARM_LENGTH, branchY, x + side * CANDELABRA_ARM_LENGTH, stemTop + CANDELABRA_ARM_RISE);
    context.stroke();
  });

  [-1, 0, 1].forEach((side) => {
    const tipX = side === 0 ? x : x + side * CANDELABRA_ARM_LENGTH;
    const tipY = side === 0 ? stemTop : stemTop + CANDELABRA_ARM_RISE;
    fillEllipse(context, tipX, tipY, 5, 2.5, CANDELABRA_METAL_DARK_COLOR);
    context.save();
    context.translate(tipX, tipY);
    context.scale(CANDELABRA_FLAME_SCALE, CANDELABRA_FLAME_SCALE);
    // Phase-offset per arm so the three flames don't flicker in lockstep.
    renderFlame(context, 0, -2, anim + side * 0.7);
    context.restore();
  });
}

// Four purely visual variants -- classic Roman column, a floating crystal
// on a squat plinth, a square column with a flame, a 3-prong candelabra --
// sharing the exact same puck() (a static circle of `radius`), so which
// one a given pillar draws as never changes how the player bounces off
// it. See placePillars.js for how `variant` gets assigned.
function Pillar(x = 0, y = 0, props = {}) {
  const {
    radius = 26,
    baseHalfSize = radius + 6,
    baseHeight = 8,
    shaftHeight = 110, // 2.5x its original 44, so the column actually reads as tall next to the small base/capital
    capHalfSize = radius + 6,
    capHeight = 8,
    bounciness = 0.5,
    // Warm stone matching the sanctuary reference art's arch/pedestal
    // accents -- deliberately distinct from CubeObstacle's own dark violet
    // walls, so a pillar always reads as a separate, bounce-off obstacle.
    stoneColor = '#c9a17e',
    shadeColor = '#8f6b52',
    variant = Math.floor(Math.random() * VARIANT_COUNT),
  } = props;
  let anim = Math.random() * TAU;

  return {
    x,
    y,
    radius,
    baseHalfSize,
    baseHeight,
    shaftHeight,
    capHalfSize,
    capHeight,
    bounciness,
    stoneColor,
    shadeColor,
    variant,
    tags: [TAG_OBSTACLE],
    // Same painter's-algorithm depth sort as CubeObstacle -- see its
    // `order` comment.
    order: y,

    update(dt) {
      anim += dt;
    },

    // Consistent puck-like accessor (see CubeObstacle.js and physics.js):
    // a static, circular puck with mass: Infinity, always this same
    // radius regardless of `variant` -- collision never depends on which
    // one a pillar happens to render as. `shape: 'circle'` is how
    // PhysicsWorld tells it apart from CubeObstacle's boxes.
    puck() {
      return {
        x: this.x,
        y: this.y,
        radius: this.radius,
        shape: 'circle',
        mass: Infinity,
        vx: 0,
        vy: 0,
        omega: 0,
        angle: 0,
        viscosity: 0,
        angularViscosity: 0,
        bounciness: this.bounciness,
      };
    },

    render(context) {
      if (this.variant === 1) renderCrystalPillar(context, this, anim);
      else if (this.variant === 2) renderSquarePillar(context, this, anim);
      else if (this.variant === 3) renderCandelabra(context, this, anim);
      else renderClassicPillar(context, this);
    },
  };
}

export default Pillar;
