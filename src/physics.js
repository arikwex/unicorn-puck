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

// Circle against an axis-aligned box. Normal points toward the box;
// an embedded circle is pushed out through its nearest face.
function circleBoxContact(circle, box) {
  const dx = circle.x - box.x;
  const dy = circle.y - box.y;
  const nx = Math.max(-box.halfWidth, Math.min(box.halfWidth, dx)) - dx;
  const ny = Math.max(-box.halfHeight, Math.min(box.halfHeight, dy)) - dy;
  const distance = Math.hypot(nx, ny);
  if (distance > 0) {
    return distance < circle.radius
      ? { nx: nx / distance, ny: ny / distance, penetration: circle.radius - distance }
      : null;
  }
  const gapX = box.halfWidth - Math.abs(dx);
  const gapY = box.halfHeight - Math.abs(dy);
  return gapX <= gapY
    ? { nx: dx >= 0 ? -1 : 1, ny: 0, penetration: circle.radius + gapX }
    : { nx: 0, ny: dy >= 0 ? -1 : 1, penetration: circle.radius + gapY };
}

// Compute both bodies' reactions from their captured impact state without
// moving either body. The collision pass can collect every contact before
// object callbacks apply these changes. The normal points a -> b.
function collisionResponses(a, b, nx, ny, penetration) {
  const responseA = { dx: 0, dy: 0, dvx: 0, dvy: 0, domega: 0 };
  const responseB = { dx: 0, dy: 0, dvx: 0, dvy: 0, domega: 0 };
  const responses = [responseA, responseB];
  const invMassA = a.mass === Infinity ? 0 : 1 / a.mass;
  const invMassB = b.mass === Infinity ? 0 : 1 / b.mass;
  const invMassSum = invMassA + invMassB;
  if (invMassSum === 0) return responses;

  const correction = penetration / invMassSum;
  responseA.dx = -nx * correction * invMassA;
  responseA.dy = -ny * correction * invMassA;
  responseB.dx = nx * correction * invMassB;
  responseB.dy = ny * correction * invMassB;

  const relVx = b.vx - a.vx;
  const relVy = b.vy - a.vy;
  const relVelAlongNormal = relVx * nx + relVy * ny;
  if (relVelAlongNormal > 0) return responses; // already separating

  const restitution = Math.min(a.bounciness, b.bounciness);
  const impulseMagnitude = -(1 + restitution) * relVelAlongNormal / invMassSum;
  const ix = impulseMagnitude * nx;
  const iy = impulseMagnitude * ny;
  responseA.dvx = -ix * invMassA;
  responseA.dvy = -iy * invMassA;
  responseB.dvx = ix * invMassB;
  responseB.dvy = iy * invMassB;

  // A slice of the tangential relative velocity becomes spin on both
  // bodies, so a glancing hit leaves the puck rotating rather than only
  // bouncing in a straight line.
  const tx = -ny;
  const ty = nx;
  const relVelAlongTangent = relVx * tx + relVy * ty;
  const spinTransfer = relVelAlongTangent * 0.3;
  if (invMassA) responseA.domega = -spinTransfer / momentOfInertia(a);
  if (invMassB) responseB.domega = spinTransfer / momentOfInertia(b);
  return responses;
}

function applyCollisionResponse(puck, response) {
  puck.x += response.dx;
  puck.y += response.dy;
  puck.vx += response.dvx;
  puck.vy += response.dvy;
  puck.omega += response.domega;
}

// First intersection along a segment with a circle centered at the origin.
// Times are fractions of this frame's travel, or Infinity for no hit.
function segmentCircleTime(x, y, dx, dy, radius) {
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return Infinity;
  const b = x * dx + y * dy;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return Infinity;
  const time = (-b - Math.sqrt(discriminant)) / a;
  return time >= 0 && time <= 1 ? time : Infinity;
}

// Sweep a circular projectile against a moving circle or an axis-aligned
// box. Box faces plus rounded corners account for the projectile's radius.
function sweptCircleHitTime(start, end, body, previousBody = body) {
  const x = start.x - previousBody.x;
  const y = start.y - previousBody.y;
  const dx = end.x - start.x - (body.x - previousBody.x);
  const dy = end.y - start.y - (body.y - previousBody.y);
  if (body.shape !== 'box') {
    return segmentCircleTime(x, y, dx, dy, start.radius + body.radius);
  }

  const { halfWidth, halfHeight } = body;
  const radius = start.radius;
  const outsideX = Math.max(0, Math.abs(x) - halfWidth);
  const outsideY = Math.max(0, Math.abs(y) - halfHeight);
  if (outsideX * outsideX + outsideY * outsideY <= radius * radius) return 0;

  let first = Infinity;
  for (const sign of [-1, 1]) {
    if (dx !== 0) {
      const time = (sign * (halfWidth + radius) - x) / dx;
      if (time >= 0 && time <= 1 && Math.abs(y + dy * time) <= halfHeight) first = Math.min(first, time);
    }
    if (dy !== 0) {
      const time = (sign * (halfHeight + radius) - y) / dy;
      if (time >= 0 && time <= 1 && Math.abs(x + dx * time) <= halfWidth) first = Math.min(first, time);
    }
    for (const otherSign of [-1, 1]) {
      first = Math.min(first, segmentCircleTime(
        x - sign * halfWidth, y - otherSign * halfHeight,
        dx, dy, radius,
      ));
    }
  }
  return first;
}

export {
  applyCollisionResponse,
  applyDamping,
  applyImpulse,
  circleBoxContact,
  circleCircleContact,
  collisionResponses,
  integratePuck,
  normalizeAngle,
  sweptCircleHitTime,
};
