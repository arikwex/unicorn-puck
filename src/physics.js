// Shared physics for every "puck-like" object: the player, and anything
// else (obstacles, future enemies) that exposes a `puck()` accessor
// returning { mass, x, y, vx, vy, omega, angle, viscosity,
// angularViscosity, bounciness, ... }. A static object (a wall) is just a
// puck with mass: Infinity, so the same collision code handles both
// puck-vs-puck and puck-vs-wall.

const TAU = Math.PI * 2;

// Baseline decay rates (1/s) for a puck's own linear and angular velocity.
// A puck's `viscosity` / `angularViscosity` are multipliers on these
// baselines, so 1 is "normal" and object authors only ever tune a
// multiplier rather than an absolute rate.
const LINEAR_VISCOSITY_BASE = 0.6;
const ANGULAR_VISCOSITY_BASE = 1.4;

function normalizeAngle(value) {
  let normalized = value % TAU;
  if (normalized > Math.PI) normalized -= TAU;
  if (normalized <= -Math.PI) normalized += TAU;
  return normalized;
}

function momentOfInertia(puck) {
  return puck.mass === Infinity ? Infinity : puck.mass * puck.radius * puck.radius * 0.5;
}

function applyDamping(puck, dt) {
  const linearDecay = Math.exp(-LINEAR_VISCOSITY_BASE * puck.viscosity * dt);
  puck.vx *= linearDecay;
  puck.vy *= linearDecay;
  puck.omega *= Math.exp(-ANGULAR_VISCOSITY_BASE * puck.angularViscosity * dt);
}

function integratePuck(puck, dt) {
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;
  puck.angle = normalizeAngle(puck.angle + puck.omega * dt);
}

function applyImpulse(puck, impulseX, impulseY, angularImpulse) {
  puck.vx += impulseX / puck.mass;
  puck.vy += impulseY / puck.mass;
  puck.omega += angularImpulse / momentOfInertia(puck);
}

// Circle-vs-circle contact. Normal points from `a` toward `b`.
function circleCircleContact(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 0.0001;
  const penetration = a.radius + b.radius - distance;
  if (penetration <= 0) return null;
  return { nx: dx / distance, ny: dy / distance, penetration };
}

// Circle-vs-oriented-box contact. `circlePuck` needs { x, y, radius },
// `boxPuck` needs { x, y, angle, halfExtent }. Normal points from the
// circle toward the box, matching circleCircleContact's a-to-b convention.
function circleBoxContact(circlePuck, boxPuck) {
  const cos = Math.cos(-boxPuck.angle);
  const sin = Math.sin(-boxPuck.angle);
  const dx = circlePuck.x - boxPuck.x;
  const dy = circlePuck.y - boxPuck.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const half = boxPuck.halfExtent;
  const clampedX = Math.max(-half, Math.min(half, localX));
  const clampedY = Math.max(-half, Math.min(half, localY));

  let localNx;
  let localNy;
  let penetration;

  if (clampedX === localX && clampedY === localY) {
    // Circle center is inside the box: escape through the closest face.
    const distances = [half - localX, localX + half, half - localY, localY + half];
    const nearest = Math.min(...distances);
    localNx = nearest === distances[0] ? 1 : nearest === distances[1] ? -1 : 0;
    localNy = nearest === distances[2] ? 1 : nearest === distances[3] ? -1 : 0;
    penetration = nearest + circlePuck.radius;
  } else {
    const towardBoxX = clampedX - localX;
    const towardBoxY = clampedY - localY;
    const distance = Math.hypot(towardBoxX, towardBoxY);
    penetration = circlePuck.radius - distance;
    if (penetration <= 0) return null;
    localNx = towardBoxX / distance;
    localNy = towardBoxY / distance;
  }

  const boxCos = Math.cos(boxPuck.angle);
  const boxSin = Math.sin(boxPuck.angle);
  return {
    nx: localNx * boxCos - localNy * boxSin,
    ny: localNx * boxSin + localNy * boxCos,
    penetration,
  };
}

// Resolves an elastic-with-restitution collision between two puck structs
// given a contact normal (pointing a -> b) and penetration depth. Mutates
// both pucks' position and velocity in place; a puck with mass: Infinity
// never moves.
function resolveCollision(a, b, nx, ny, penetration) {
  const invMassA = a.mass === Infinity ? 0 : 1 / a.mass;
  const invMassB = b.mass === Infinity ? 0 : 1 / b.mass;
  const invMassSum = invMassA + invMassB;
  if (invMassSum === 0) return;

  const correction = penetration / invMassSum;
  a.x -= nx * correction * invMassA;
  a.y -= ny * correction * invMassA;
  b.x += nx * correction * invMassB;
  b.y += ny * correction * invMassB;

  const relVx = b.vx - a.vx;
  const relVy = b.vy - a.vy;
  const relVelAlongNormal = relVx * nx + relVy * ny;
  if (relVelAlongNormal > 0) return; // already separating

  const restitution = Math.min(a.bounciness, b.bounciness);
  const impulseMagnitude = -(1 + restitution) * relVelAlongNormal / invMassSum;
  const ix = impulseMagnitude * nx;
  const iy = impulseMagnitude * ny;
  a.vx -= ix * invMassA;
  a.vy -= iy * invMassA;
  b.vx += ix * invMassB;
  b.vy += iy * invMassB;

  // A slice of the tangential relative velocity becomes spin on both
  // bodies, so a glancing hit leaves the puck rotating rather than only
  // bouncing in a straight line.
  const tx = -ny;
  const ty = nx;
  const relVelAlongTangent = relVx * tx + relVy * ty;
  const spinTransfer = relVelAlongTangent * 0.3;
  if (invMassA) a.omega -= spinTransfer / momentOfInertia(a);
  if (invMassB) b.omega += spinTransfer / momentOfInertia(b);
}

export {
  applyDamping,
  applyImpulse,
  circleBoxContact,
  circleCircleContact,
  integratePuck,
  normalizeAngle,
  resolveCollision,
};
