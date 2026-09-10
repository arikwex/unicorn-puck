import { TAG_OBSTACLE } from './tags.js';

// The playpen is built and drawn along the isometric basis vectors
// (1, -1) and (1, 1) (see mapCreator.js). Both are perpendicular and the
// same length (sqrt(2)), so a box's footprint drawn along them is always a
// rectangle -- just rotated 45deg and scaled by sqrt(2) relative to a
// plain axis-aligned box of the same width/height. That's the exact
// rotation an obstacle's own `angle` needs to be offset by for collision
// math to line up with the isometric rendering below (and why
// angle = PI/4 renders as an upright, edge-to-edge tiling rectangle).
const ISO_U = { x: 1, y: -1 };
const ISO_V = { x: 1, y: 1 };
const ISO_ROTATION_OFFSET = -Math.PI / 4;
const ISO_SCALE = Math.SQRT2;

function rotateVec(v, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

function topCorners(obstacle) {
  const ua = rotateVec(ISO_U, obstacle.angle);
  const ub = rotateVec(ISO_V, obstacle.angle);
  const halfU = obstacle.w / (2 * ISO_SCALE);
  const halfV = obstacle.h / (2 * ISO_SCALE);
  return [
    [obstacle.x + (-ua.x * halfU - ub.x * halfV), obstacle.y + (-ua.y * halfU - ub.y * halfV)],
    [obstacle.x + (ua.x * halfU - ub.x * halfV), obstacle.y + (ua.y * halfU - ub.y * halfV)],
    [obstacle.x + (ua.x * halfU + ub.x * halfV), obstacle.y + (ua.y * halfU + ub.y * halfV)],
    [obstacle.x + (-ua.x * halfU + ub.x * halfV), obstacle.y + (-ua.y * halfU + ub.y * halfV)],
  ];
}

// Faux-3D box: extrude the two screen-lowest (nearest-to-camera) top edges
// straight down as shaded side faces, then paint the top face over them.
function renderCube(context, obstacle) {
  const corners = topCorners(obstacle);
  const height = obstacle.height;

  const edges = corners.map((corner, i) => {
    const next = corners[(i + 1) % corners.length];
    return { a: corner, b: next, midY: (corner[1] + next[1]) / 2 };
  });
  const frontEdges = [...edges].sort((edgeA, edgeB) => edgeB.midY - edgeA.midY).slice(0, 2);

  context.fillStyle = obstacle.sideColor;
  frontEdges.forEach((edge) => {
    context.beginPath();
    context.moveTo(edge.a[0], edge.a[1]);
    context.lineTo(edge.b[0], edge.b[1]);
    context.lineTo(edge.b[0], edge.b[1] + height);
    context.lineTo(edge.a[0], edge.a[1] + height);
    context.closePath();
    context.fill();
  });

  context.fillStyle = obstacle.topColor;
  context.beginPath();
  context.moveTo(corners[0][0], corners[0][1]);
  for (let i = 1; i < corners.length; i++) context.lineTo(corners[i][0], corners[i][1]);
  context.closePath();
  context.fill();
}

// `w`/`h` are the obstacle's full world-space width/height at angle = PI/4
// (its usual, upright orientation) -- i.e. exactly the bounds it visually
// spans, so a caller merging many small wall tiles into fewer, larger
// obstacles (see mergeWalls.js) can hand this the merged rectangle's own
// bounds directly with no unit conversion.
function CubeObstacle(x = 0, y = 0, w = 60, h = 60, angle = Math.PI / 4, props = {}) {
  const {
    height = 26,
    bounciness = 0.4,
    topColor = '#9b8',
    sideColor = '#574',
  } = props;

  return {
    x,
    y,
    w,
    h,
    angle,
    height,
    bounciness,
    topColor,
    sideColor,
    tags: [TAG_OBSTACLE],
    // Draw order is keyed off y purely for the painter's-algorithm depth
    // illusion: a farther-back (smaller y) obstacle draws first, so a
    // nearer (larger y) one drawn later visually sits in front of it. A
    // static obstacle never moves, so this only needs setting once.
    order: y,

    // Consistent puck-like accessor (see PlayerCharacter.js and
    // physics.js): a static puck with mass: Infinity, offset into the
    // plain-axis-aligned-box terms physics.js's circleBoxContact expects.
    // `shape: 'box'` is how PhysicsWorld tells it apart from Pillar's
    // circles.
    puck() {
      return {
        x: this.x,
        y: this.y,
        angle: this.angle + ISO_ROTATION_OFFSET,
        halfWidth: this.w / 2,
        halfHeight: this.h / 2,
        shape: 'box',
        mass: Infinity,
        vx: 0,
        vy: 0,
        omega: 0,
        viscosity: 0,
        angularViscosity: 0,
        bounciness: this.bounciness,
      };
    },

    render(context) {
      renderCube(context, this);
    },
  };
}

export default CubeObstacle;
export { ISO_U, ISO_V };
