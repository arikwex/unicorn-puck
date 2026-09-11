import { add } from './engine.js';
import SplatEffect from './SplatEffect.js';
import { TAG_PROJECTILE } from './tags.js';

const SCALE = 2.5;
const RADIUS = 7 * SCALE;
const LIFETIME = 6;
const TRAIL_SPACING_MIN = 30;
const TRAIL_SPACING_MAX = 70;

function trailSpacing() {
  return TRAIL_SPACING_MIN + Math.random() * (TRAIL_SPACING_MAX - TRAIL_SPACING_MIN);
}

function GrubProjectile(x, y, vx, vy, props = {}) {
  const { color = '#3dff5c', highlightColor = '#d9ffde' } = props;
  let remaining = LIFETIME;
  let lastX = x;
  let lastY = y;
  let distanceToNextSplat = trailSpacing();
  return {
    x, y, vx, vy,
    radius: RADIUS,
    damage: 1,
    order: y,
    tags: [TAG_PROJECTILE],

    puck() { return this; },

    update(dt) {
      remaining -= dt;
      return remaining <= 0;
    },

    // Sample travel once per physics frame; spacing is independent of
    // frame rate and emission ends on the frame the shot hits.
    afterPhysics() {
      const dx = this.x - lastX;
      const dy = this.y - lastY;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) return;
      while (distanceToNextSplat <= distance) {
        const t = distanceToNextSplat / distance;
        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 50;
        add(SplatEffect(lastX + dx * t, lastY + dy * t,
          Math.cos(angle) * speed, Math.sin(angle) * speed, color, {
          size: 6 + Math.random() * 3,
          arcHeight: 6 + Math.random() * 6,
        }));
        distanceToNextSplat += trailSpacing();
      }
      distanceToNextSplat -= distance;
      lastX = this.x;
      lastY = this.y;
    },

    // Removed on the first overlapping wall, obstacle or player.
    onCollision() { return true; },

    render(context) {
      context.fillStyle = color;
      context.beginPath();
      context.arc(this.x, this.y, RADIUS, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = highlightColor;
      context.beginPath();
      context.arc(this.x - 2 * SCALE, this.y - 2 * SCALE, 2.5 * SCALE, 0, Math.PI * 2);
      context.fill();
    },
  };
}

export default GrubProjectile;
