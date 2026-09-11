// A static obstacle that takes HITS_REQUIRED charging hits to break open,
// flashing white and throwing a few sparks on each qualifying hit, then
// exploding into a bigger white/yellow burst and dropping an item dead
// center on the hit that finally breaks it.

import { add } from './engine.js';
import BubbleShieldItem from './BubbleShieldItem.js';
import HealthItem from './HealthItem.js';
import { fireSplatBurst } from './SplatEffect.js';
import { TAG_OBSTACLE } from './tags.js';

const SHIELD_DROP_CHANCE = 0.5;
const HITS_REQUIRED = 2;
// Exported so mapCreator.js's placement check uses the exact same radius
// rather than a duplicated magic number.
const CHEST_RADIUS = 42; // 1.5x its original 28
// Same "was this swing actually charging" gate Grub.js uses, so a chest
// only takes a hit from a real charging pass, not just brushing past it.
const CHARGING_THRESHOLD = 0.15;
const HIT_COOLDOWN = 0.6; // seconds between hits even while still touching
const FLASH_DURATION = 0.25;

// Hit reaction: a quick upward hop (plain half-sine, up and back down)
// plus a rotational "rattle" -- a sine wave whose own amplitude decays
// exponentially, i.e. a damped oscillator -- so the chest visibly recoils
// and shudders on every qualifying hit, not just the one that breaks it.
const HIT_BOUNCE_DURATION = 0.28;
const HIT_BOUNCE_HEIGHT = 14;
const HIT_RATTLE_DURATION = 0.5;
const HIT_RATTLE_FREQUENCY = 30; // rad/s
const HIT_RATTLE_DAMPING = 9; // 1/s decay rate of the rattle's amplitude
const HIT_RATTLE_AMPLITUDE = 0.35; // radians, right at the moment of impact

const SPARK_COUNT = 3;
const SPARK_COLOR = '#fff';
const SPARK_SPEED_MAX = 170;
const SPARK_SIZE_MIN = 4;
const SPARK_SIZE_MAX = 8;

const BREAK_SPLAT_COUNT = 10;
const BREAK_SPLAT_COLORS = ['#fff', '#fd6'];
const BREAK_SPLAT_SPEED_MAX = 260;
const BREAK_SPLAT_SIZE_MIN = 10;
const BREAK_SPLAT_SIZE_MAX = 20;

// 1.5x their original 48/24/16 -- kept in step with CHEST_RADIUS above.
const CHEST_WIDTH = 72;
const BASE_HEIGHT = 36;
const LID_HEIGHT = 24;
const WOOD_COLOR = '#853';
const WOOD_DARK_COLOR = '#642';
const METAL_COLOR = '#eb4';
const METAL_DARK_COLOR = '#a82';

// Drawn in local coordinates, centered on (0, 0) -- the caller translates
// (for the hit-pop) and rotates (for the hit-rattle) around that origin
// before calling this, so the shape itself never needs to know about x/y.
function renderChest(context, flash) {
  const left = -CHEST_WIDTH / 2;
  const baseTop = -BASE_HEIGHT / 2 + 3;
  const lidTop = baseTop - LID_HEIGHT;

  context.fillStyle = WOOD_COLOR;
  context.fillRect(left, baseTop, CHEST_WIDTH, BASE_HEIGHT);
  context.fillStyle = WOOD_DARK_COLOR;
  context.fillRect(left, lidTop, CHEST_WIDTH, LID_HEIGHT);
  context.fillStyle = METAL_COLOR;
  context.fillRect(left, baseTop - 4.5, CHEST_WIDTH, 6);
  context.fillRect(left, lidTop, 7.5, LID_HEIGHT);
  context.fillRect(left + CHEST_WIDTH - 7.5, lidTop, 7.5, LID_HEIGHT);
  context.fillStyle = METAL_DARK_COLOR;
  context.fillRect(-9, baseTop - 9, 18, 18);

  if (flash > 0) {
    context.globalAlpha = flash;
    context.fillStyle = '#fff';
    context.fillRect(left, lidTop, CHEST_WIDTH, BASE_HEIGHT + LID_HEIGHT);
    context.globalAlpha = 1;
  }
}

function TreasureChest(x, y, props = {}) {
  // What pops out when it finally breaks -- a (cx, cy) => gameObject
  // factory, so the caller (mapCreator.js) decides at map-generation time
  // rather than this chest rolling it itself the moment it breaks. Default
  // keeps the old random 50/50 for any caller that doesn't care to specify.
  const {
    contents = (cx, cy) => (Math.random() < SHIELD_DROP_CHANCE ? BubbleShieldItem(cx, cy) : HealthItem(cx, cy)),
  } = props;
  let hitsRemaining = HITS_REQUIRED;
  let flashTimer = 0;
  let hitCooldown = 0;
  // Time since the most recent hit -- starts past both effects' durations
  // so a freshly spawned chest doesn't pop/rattle on its own.
  let hitAnimElapsed = HIT_RATTLE_DURATION;

  return {
    x,
    y,
    order: y,
    radius: CHEST_RADIUS, // a static circle -- see physics.js
    tags: [TAG_OBSTACLE],

    update(dt) {
      flashTimer = Math.max(0, flashTimer - dt);
      hitCooldown = Math.max(0, hitCooldown - dt);
      hitAnimElapsed += dt;
    },

    // Called by the player on contact, with its pre-bounce state.
    hit(player) {
      if (hitCooldown > 0 || player.charge <= CHARGING_THRESHOLD) return;

      hitCooldown = HIT_COOLDOWN;
      flashTimer = FLASH_DURATION;
      hitAnimElapsed = 0;
      hitsRemaining -= 1;
      fireSplatBurst(this.x, this.y, SPARK_COUNT, [SPARK_COLOR], SPARK_SPEED_MAX, SPARK_SIZE_MIN, SPARK_SIZE_MAX);

      if (hitsRemaining > 0) return;
      fireSplatBurst(this.x, this.y, BREAK_SPLAT_COUNT, BREAK_SPLAT_COLORS, BREAK_SPLAT_SPEED_MAX, BREAK_SPLAT_SIZE_MIN, BREAK_SPLAT_SIZE_MAX);
      add(contents(this.x, this.y));
      return true;
    },

    render(context) {
      const flash = flashTimer > 0 ? Math.sin(Math.min(1, flashTimer / FLASH_DURATION) * Math.PI) : 0;
      // Half-sine hop (up and back down) plus a sine wave whose amplitude
      // decays exponentially -- a damped oscillator -- for the rattle.
      const bounceY = hitAnimElapsed < HIT_BOUNCE_DURATION
        ? -HIT_BOUNCE_HEIGHT * Math.sin(Math.PI * (hitAnimElapsed / HIT_BOUNCE_DURATION))
        : 0;
      const rattle = hitAnimElapsed < HIT_RATTLE_DURATION
        ? HIT_RATTLE_AMPLITUDE * Math.sin(hitAnimElapsed * HIT_RATTLE_FREQUENCY) * Math.exp(-hitAnimElapsed * HIT_RATTLE_DAMPING)
        : 0;

      context.save();
      context.translate(this.x, this.y + bounceY);
      context.rotate(rattle);
      renderChest(context, flash);
      context.restore();
    },
  };
}

export default TreasureChest;
export { CHEST_RADIUS };
