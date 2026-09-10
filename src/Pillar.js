import { TAG_OBSTACLE } from './tags.js';

const TAU = Math.PI * 2;

function fillEllipse(context, x, y, radiusX, radiusY, color) {
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(x, y, radiusX, radiusY, 0, 0, TAU);
  context.fill();
}

// A small extruded square slab -- a flat top face sitting on a shaded side
// face dropping down by `height` -- used for both the pillar's base and
// its capital. Simpler than CubeObstacle's own version (no rotation, no
// isometric basis) since a pillar is always upright and round.
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

function renderPillar(context, obstacle) {
  const {
    x, y, radius, baseHalfSize, baseHeight, shaftHeight, capHalfSize, capHeight, stoneColor, shadeColor,
  } = obstacle;
  const shaftTopY = y - shaftHeight;
  const capTopY = shaftTopY - capHeight;

  renderSlab(context, x, y, baseHalfSize, baseHeight, stoneColor, shadeColor);
  renderShaft(context, x, shaftTopY, y, radius, stoneColor, shadeColor);
  renderSlab(context, x, capTopY, capHalfSize, capHeight, stoneColor, shadeColor);
}

// A roman-esque column: small extruded square base, tall cylindrical
// shaft, small extruded square capital. Purely decorative beyond its
// footprint -- collision is a plain circle matching the shaft's radius
// (see puck() below), not the wider base/capital, so the visual flourish
// never surprises the physics.
function Pillar(x = 0, y = 0, props = {}) {
  const {
    radius = 26,
    baseHalfSize = radius + 6,
    baseHeight = 8,
    shaftHeight = 110, // 2.5x its original 44, so the column actually reads as tall next to the small base/capital
    capHalfSize = radius + 6,
    capHeight = 8,
    bounciness = 0.5,
    stoneColor = '#e8e2d0',
    shadeColor = '#b0a688',
  } = props;

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
    tags: [TAG_OBSTACLE],
    // Same painter's-algorithm depth sort as CubeObstacle -- see its
    // `order` comment.
    order: y,

    // Consistent puck-like accessor (see CubeObstacle.js and physics.js):
    // a static, circular puck with mass: Infinity. `shape: 'circle'` is
    // how PhysicsWorld tells it apart from CubeObstacle's boxes.
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
      renderPillar(context, this);
    },
  };
}

export default Pillar;
