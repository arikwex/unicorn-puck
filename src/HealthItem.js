// A pulsing heart pickup: heals the player on contact, capped at their
// maxHp, and briefly immune to pickup right after it spawns so it doesn't
// get grabbed by the same swing that dropped it (see TreasureChest.js).

import DamageCallout from './DamageCallout.js';
import { add, getObjectsByTag } from './engine.js';
import { TAG_PLAYER } from './tags.js';
import { showItemCollectedToast } from './ToastSystem.js';
import { TAU } from './mathUtils.js';

const HEAL_AMOUNT = 2;
const PICKUP_RADIUS = 40; // scaled up along with the heart's own x2 overall size
const SPAWN_PROTECTION = 0.3; // seconds before it can be collected at all
const HEAL_TEXT_COLOR = '#4f5'; // matches the green used for hit splats elsewhere
const HEART_BASE_RADIUS = 12;
const HEART_OVERALL_SCALE = 2; // x2 larger overall
const HEART_HEIGHT_SCALE = 1.7; // an additional x2 stretch on top of that, vertical only
const HEART_RADIUS = HEART_BASE_RADIUS * HEART_OVERALL_SCALE;
const HEART_COLOR = '#f11';
const HEART_OUTLINE_COLOR = '#800'; // dark red
const HEART_OUTLINE_WIDTH = 3;
const PULSE_SPEED = 4.5; // rad/s
const PULSE_AMOUNT = 0.16; // +/- fraction of HEART_RADIUS

function HealthItem(x, y) {
  let anim = Math.random() * TAU;
  let protection = SPAWN_PROTECTION;

  return {
    x,
    y,
    z: y,

    tick(dt) {
      anim += dt;
      protection = Math.max(0, protection - dt);
      if (protection > 0) return false;

      const player = getObjectsByTag(TAG_PLAYER)[0];
      if (!player) return false;
      const distance = Math.hypot(player.x - this.x, player.y - this.y);
      if (distance > PICKUP_RADIUS + player.r) return false;

      // Collectible even at maxHp -- heal() itself clamps, so this just
      // shows "+0 hp" rather than leaving the item sitting there uncollected.
      const healed = player.heal(HEAL_AMOUNT);
      add(DamageCallout(this.x, this.y - 20, `+${healed} hp`, HEAL_TEXT_COLOR));
      showItemCollectedToast('Health Potion');
      return true;
    },

    // Two lobes (Bézier curves) meeting at a bottom point -- the classic
    // canvas heart shape, drawn centered on (x, y). `radius` sets the
    // horizontal spread; every vertical offset is additionally scaled by
    // HEART_HEIGHT_SCALE, so the shape stretches tall independent of width.
    render(context) {
      const { x: cx, y: cy } = this;
      const pulse = 1 + Math.sin(anim * PULSE_SPEED) * PULSE_AMOUNT;
      const radius = HEART_RADIUS * pulse;
      const v = (fraction) => radius * fraction * HEART_HEIGHT_SCALE;
      const top = cy - v(0.5);
      context.beginPath();
      context.moveTo(cx, top + v(0.3));
      context.bezierCurveTo(cx - radius * 1.2, top - v(0.05), cx - radius * 1.2, top + v(0.8), cx, top + v(1.3));
      context.bezierCurveTo(cx + radius * 1.2, top + v(0.8), cx + radius * 1.2, top - v(0.05), cx, top + v(0.3));
      context.closePath();
      context.fillStyle = HEART_COLOR;
      context.fill();
      context.lineWidth = HEART_OUTLINE_WIDTH;
      context.strokeStyle = HEART_OUTLINE_COLOR;
      context.stroke();
    },
  };
}

export default HealthItem;
