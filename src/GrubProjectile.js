import { add, getObjectsByTag } from './engine.js';
import contact from './physics.js';
import SplatEffect from './SplatEffect.js';
import { TAG_ENEMY, TAG_OBSTACLE, TAG_PLAYER, TAG_PROJECTILE } from './tags.js';

const SCALE = 2.5;
const RADIUS = 7 * SCALE;
const LIFETIME = 6;
const KNOCKBACK = 120; // player speed added along the shot's flight
const TRAIL_SPACING_MIN = 30;
const TRAIL_SPACING_MAX = 70;

function trailSpacing() {
  return TRAIL_SPACING_MIN + Math.random() * (TRAIL_SPACING_MAX - TRAIL_SPACING_MIN);
}

function GrubProjectile(x, y, vx, vy, props = {}) {
  const { color = '#4f5', highlightColor = '#dfd' } = props;
  let remaining = LIFETIME;
  let lastX = x;
  let lastY = y;
  let distanceToNextSplat = trailSpacing();
  const knockback = KNOCKBACK / Math.hypot(vx, vy);
  return {
    x, y, vx, vy,
    radius: RADIUS,
    order: y,
    tags: [TAG_PROJECTILE],

    update(dt) {
      remaining -= dt;
      if (remaining <= 0) return true;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.order = this.y;

      // Sample travel once per frame; spacing is independent of frame
      // rate and emission ends on the frame the shot hits.
      const dx = this.x - lastX;
      const dy = this.y - lastY;
      const distance = Math.hypot(dx, dy);
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

      // Removed on the first overlapping wall, obstacle or player; shots
      // pass through enemies, and cover wins a simultaneous overlap.
      return getObjectsByTag(TAG_OBSTACLE).some((obstacle) =>
        !obstacle.tags.includes(TAG_ENEMY) && contact(this, obstacle))
        || getObjectsByTag(TAG_PLAYER).some((player) => {
          if (!contact(this, player)) return;
          if (player.hp > 0) {
            player.takeDamage();
            player.vx += this.vx * knockback;
            player.vy += this.vy * knockback;
          }
          return true;
        });
    },

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
