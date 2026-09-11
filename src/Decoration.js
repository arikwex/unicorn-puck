// Wall-mounted dressing for otherwise-bare hallway/room walls: a shield, a
// candle sconce, a mounted crystal, or a runic stone. Purely decorative --
// no tags, no radius/w, nothing for physics to see -- just a render (plus a
// tiny per-instance anim clock for the candle's flame).
// renderFlame's own export was retired along with Pillar.js's non-classic
// variants (see its VARIANT_COUNT comment) -- this whole module is unused
// dead weight already (nothing imports Decoration.js since mapCreator.js
// stopped placing them), so drawCandle's own renderFlame(...) call below
// is commented out too rather than left as a broken import.
// import { renderFlame } from './Pillar.js';

const TAU = Math.PI * 2;
// Shifts a decoration off its own wall cell and into the neighboring
// room/hallway cell it's mounted to face -- along Y for a down-facing
// wall, along X for a left/right one -- so it reads as sitting on that
// wall's visible face instead of up on its roof. The two axes need
// different magnitudes to look right, hence separate constants.
const MOUNT_OFFSET_DOWN = 25;
const MOUNT_OFFSET_SIDE = 50;
const DECORATION_SCALE = 1.7;

// Numeric facing ids (exported so mapCreator.js's wall-scan assigns the
// exact same values) instead of string names -- cheaper to compare and ship.
const DOWN = 0;
const LEFT = 1;
const RIGHT = 2;

const METAL_COLOR = '#a82';
const METAL_LIGHT_COLOR = '#eb4';
const WAX_COLOR = '#edb';
const CRYSTAL_COLOR = '#2bc';
const CRYSTAL_DARK_COLOR = '#167';
const STONE_COLOR = '#544';
const RUNE_GLOW_COLOR = '#8df';

// Every draw function is always drawn in this same canonical upright
// orientation, full stop -- this is a faux-3D top-down game, so "up" on
// screen is always up regardless of which wall a piece is mounted on.
// Rotating the art to match a left/right wall (as a true 3D engine might)
// would tip the candle's flame sideways, which reads as broken rather than
// mounted. What actually changes per facing is only *where* Decoration's
// own render() places the mount point -- see MOUNT_SIDE_OFFSET below.
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
  // renderFlame(context, 0, -8, anim); -- see the import note above
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

// Index-picked rather than keyed by name -- see DECORATION_TYPE_COUNT below.
const DRAW_FUNCTIONS = [drawShield, drawCandle, drawCrystal, drawRune];
const DECORATION_TYPE_COUNT = DRAW_FUNCTIONS.length;

// `facing` is which way the wall's own visible face points -- DOWN for a
// horizontal, south-facing wall, or LEFT/RIGHT for a vertical one -- found
// as a 1 (wall) -> 0 (no wall/floor) transition in the map's grid; see
// mapCreator.js. It only ever shifts *where* the mount point sits (toward
// whichever room the wall faces), never how the art is drawn.
function Decoration(x, y, type, facing) {
  let anim = Math.random() * TAU;
  const draw = DRAW_FUNCTIONS[type];
  const mountX = x + (facing === LEFT ? -MOUNT_OFFSET_SIDE : facing === RIGHT ? MOUNT_OFFSET_SIDE : 0);
  const mountY = y + (facing === DOWN ? MOUNT_OFFSET_DOWN : 0);

  return {
    x,
    y,
    // A wall's own `order` is its merged rect's *bottom* edge (see
    // CubeObstacle), which for a wall cell anywhere but that exact edge
    // sits well south of this cell -- so a naive y-based order here would
    // often lose to (draw behind/under) the very wall it's mounted on.
    // Always drawing last among world objects fixes that; it's safe
    // because a decoration sits right in a wall's own footprint, a spot
    // nothing else (player, grubs) can ever physically stand in.
    order: Infinity,
    update(dt) {
      anim += dt;
    },
    render(context) {
      context.save();
      context.translate(mountX, mountY);
      context.scale(DECORATION_SCALE, DECORATION_SCALE);
      draw(context, anim);
      context.restore();
    },
  };
}

export default Decoration;
export {
  DECORATION_TYPE_COUNT, DOWN, LEFT, RIGHT,
};
