import { TAG_OBSTACLE } from './tags.js';

// The playpen is built and drawn along the isometric basis vectors
// (1, -1) and (1, 1) (see mapCreator.js). Both are perpendicular and the
// same length (sqrt(2)), so a box's footprint drawn along them is always a
// square -- just rotated 45deg and scaled by sqrt(2) relative to a plain
// axis-aligned box of the same `halfExtent`. That's the exact rotation an
// obstacle's own `angle` needs to be offset by for collision math to line
// up with the isometric rendering below (and why angle = PI/4 renders as
// an upright, edge-to-edge tiling square).
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
  const half = obstacle.halfExtent;
  return [
    [obstacle.x + (-ua.x - ub.x) * half, obstacle.y + (-ua.y - ub.y) * half],
    [obstacle.x + (ua.x - ub.x) * half, obstacle.y + (ua.y - ub.y) * half],
    [obstacle.x + (ua.x + ub.x) * half, obstacle.y + (ua.y + ub.y) * half],
    [obstacle.x + (-ua.x + ub.x) * half, obstacle.y + (-ua.y + ub.y) * half],
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

function CubeObstacle(x = 0, y = 0, angle = Math.PI / 4, props = {}) {
  const {
    halfExtent = 30,
    height = 26,
    bounciness = 0.4,
    topColor = '#9b8',
    sideColor = '#574',
  } = props;

  return {
    x,
    y,
    angle,
    halfExtent,
    height,
    bounciness,
    topColor,
    sideColor,
    tags: [TAG_OBSTACLE],

    // Consistent puck-like accessor (see PlayerCharacter.js and
    // physics.js): a static puck with mass: Infinity, offset into the
    // plain-axis-aligned-box terms physics.js's circleBoxContact expects.
    puck() {
      return {
        x: this.x,
        y: this.y,
        angle: this.angle + ISO_ROTATION_OFFSET,
        halfExtent: this.halfExtent * ISO_SCALE,
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
