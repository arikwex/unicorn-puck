import DamageCallout from './DamageCallout.js';
import { add } from './engine.js';
import renderHealthBar from './HealthBar.js';
import orbit3d from './orbit3d.js';
import SplatEffect from './SplatEffect.js';
import { TAG_ENEMY, TAG_OBSTACLE, TAG_PLAYER } from './tags.js';

const TAU = Math.PI * 2;

// mulberry32: the same tiny deterministic PRNG used elsewhere in this
// project (see donjonDungeon.js) -- each grub gets its own instance seeded
// off its own spawn seed, so its patrol is reproducible run to run.
function mulberry32(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

function fillCircle(context, x, y, radius, color) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.fill();
}

// -- body -----------------------------------------------------------------
const SEGMENT_RADII = [22, 18, 14, 10]; // head to tail
const SEGMENT_SPACING = 15;
// Matches renderTail's own perspectiveY in PlayerCharacter.js -- the same
// depth-compression ratio, for a consistent faux-3D feel across the cast.
const SPINE_PERSPECTIVE = 0.6;
const OUTLINE_COLOR = '#8b4fe0';
const OUTLINE_WIDTH = 11; // full stroke width -- see renderGrub, only half stays visible outside the fill
const BODY_COLORS = ['#332b47', '#241d33']; // alternating segment shade
const FACE_COLOR = '#7cff6b';
const FACE_GLOW_COLOR = '#5f5';
const EYE_RADIUS = 5;
const MOUTH_RADIUS = 4;
const COLLISION_RADIUS = 26;

// -- combat -----------------------------------------------------------------
const MAX_HP = 5;
// Damage is always 1, except at a genuinely fast (high-charge) hit, where
// it's 2 -- never more. player.charge is itself already a function of
// speed (see PlayerCharacter.js), so gating off it is gating off speed.
const HIGH_CHARGE_DAMAGE_THRESHOLD = 0.7;
const CHARGING_THRESHOLD = 0.15; // player.charge above this counts as "charging" for damage purposes
const HIT_COOLDOWN = 0.6; // seconds between hits even while still touching
const FLASH_DURATION = 0.25;
const KNOCKBACK_TRANSFER = 0.6; // fraction of incoming player velocity
const KNOCKBACK_DECAY = 16; // exponential velocity decay per second
const HEALTH_BAR_SHOW_DURATION = 2;
const HEALTH_BAR_WIDTH = 60;
const HEALTH_BAR_HEIGHT = 15;
const HEALTH_BAR_OFFSET_Y = 46;

// -- hit/death splats ---------------------------------------------------
const SPLAT_GREEN = '#3dff5c';
const SPLAT_PURPLE = '#8b4fe0'; // matches the body's own outline color
const HIT_SPLAT_COUNT = 3;
const DEATH_SPLAT_GREEN_COUNT = 4;
const DEATH_SPLAT_PURPLE_COUNT = 7;
const SPLAT_SPEED_MAX = 250; // world units per second, before the hit bias
const SPLAT_IMPACT_TRANSFER = 0.25; // fraction of player velocity added to each splat
const SPLAT_SIZE_MIN = 12; // 2x their original 6
const SPLAT_SIZE_MAX = 24; // 2x their original 12
// Multiplying launch speed by these times gives a varied peak arc height.
const SPLAT_ARC_HEIGHT_TIME_MIN = 0.08;
const SPLAT_ARC_HEIGHT_TIME_MAX = 0.28;

// -- patrol -----------------------------------------------------------------
const PATROL_SPEED = 45;
const PATROL_MARGIN = 30; // world units kept clear of the room's own walls
const WAYPOINT_ARRIVE_DIST = 8;
const PAUSE_MIN = 0.4;
const PAUSE_MAX = 1.6;

// Segment centers run along the facing direction, front (head) to back
// (tail), using the same cos/sin offset-from-angle convention
// PlayerCharacter uses for its own head/snout placement -- the "captured"
// faux-3D concept this game reuses everywhere a body part needs to lead or
// trail the facing angle, with the y-offset compressed by
// SPINE_PERSPECTIVE the same way renderTail compresses depth.
function segmentPosition(grub, index) {
  const along = (1.5 - index) * SEGMENT_SPACING;
  let motionY = 0;
  if (grub.target != null) {
    motionY = (1 - Math.abs(Math.sin(grub.anim * 6.0 + index * 2))) * (8 - index) * 1;
  }
  return {
    x: grub.x + Math.cos(grub.angle) * along,
    y: grub.y - Math.sin(grub.angle) * along * SPINE_PERSPECTIVE - SEGMENT_RADII[index] / 2 + motionY,
    radius: SEGMENT_RADII[index],
  };
}

function renderGrub(context, grub, flashTimer) {
  const segments = SEGMENT_RADII.map((_, i) => segmentPosition(grub, i));
  const flash = flashTimer > 0 ? Math.sin(Math.min(1, flashTimer / FLASH_DURATION) * Math.PI) : 0;

  // Outline pass: a thick stroke per segment, almost entirely covered by
  // the fills drawn afterward except where a segment's own edge IS the
  // union's outer boundary -- the cheap way to get one continuous outline
  // around a blob of overlapping circles instead of each circle's own ring.
  context.lineWidth = OUTLINE_WIDTH;
  for (const [color, alpha] of [[OUTLINE_COLOR, 1], ['#fff', flash]]) {
    if (alpha <= 0) continue;
    context.strokeStyle = color;
    context.globalAlpha = alpha;
    segments.forEach((segment) => {
      context.beginPath();
      context.arc(segment.x, segment.y, segment.radius, 0, TAU);
      context.stroke();
    });
  }
  context.globalAlpha = 1;

  // Positive sin faces into the page: draw head to tail so the nearer
  // rear segments cover the head. Facing out draws tail to head.
  const facingIntoPage = Math.sin(grub.angle) > 0;
  for (let step = 0; step < segments.length; step++) {
    const i = facingIntoPage ? step : segments.length - 1 - step;
    fillCircle(context, segments[i].x, segments[i].y, segments[i].radius, BODY_COLORS[i % BODY_COLORS.length]);
    if (flash > 0) {
      context.globalAlpha = flash;
      fillCircle(context, segments[i].x, segments[i].y, segments[i].radius, '#fff');
      context.globalAlpha = 1;
    }
    if (i === 0) renderGrubFace(context, grub, segments[i]);
  }
}

function renderGrubFace(context, grub, head) {
  // Face: two glowing eyes plus a mouth dot, riding off the head the same
  // way PlayerCharacter's own eyes ride off its facing angle. Draw with
  // the head so nearer body segments can cover the face when facing away.
  const sway = Math.sin(grub.anim * 7) * 0.3;
  [-1, 1].forEach((side) => {
    if (Math.sin(grub.angle - side * 0.6) > 0.22) {
      return;
    }
    const [x, y] = orbit3d(9, -4, -side * 12, grub.angle + sway);
    const ex = head.x + x;
    const ey = head.y + y;
    fillCircle(context, ex, ey, EYE_RADIUS, FACE_GLOW_COLOR);
  });
  if (Math.sin(grub.angle) < 0.22) {
    const [mouthX, mouthY] = orbit3d(12, 5, 0, grub.angle + sway);
    fillCircle(context, head.x + mouthX, head.y + mouthY, MOUTH_RADIUS, FACE_GLOW_COLOR);
  }
}

// A purple-outlined, four-segment grub that patrols randomly within its
// home room and takes damage from a charging player on contact. `room` is
// that home room in world space -- { x, y, w, h }, center + full size --
// used to keep patrol waypoints inside it (and PATROL_MARGIN off its
// walls), which is what keeps the grub "generally within its room" rather
// than wandering the whole dungeon.
function Grub(x, y, room, seed, props = {}) {
  const { bounciness = 0.4 } = props;
  const rng = mulberry32(seed);
  let pauseTimer = randRange(rng, PAUSE_MIN, PAUSE_MAX);
  let flashTimer = 0;
  let hitCooldown = 0;
  let healthBarTimer = 0;
  let deathSplatsFired = false;

  // Sample launch velocity uniformly across a disk, then shift it by a
  // fraction of the player's hit velocity. The seeded rng keeps the
  // launch pattern reproducible.
  function fireSplats(originX, originY, count, color, impactVx, impactVy) {
    for (let i = 0; i < count; i++) {
      const angle = rng() * TAU;
      const speed = Math.sqrt(rng()) * SPLAT_SPEED_MAX;
      const vx = Math.cos(angle) * speed + impactVx * SPLAT_IMPACT_TRANSFER;
      const vy = Math.sin(angle) * speed + impactVy * SPLAT_IMPACT_TRANSFER;
      const splatSize = randRange(rng, SPLAT_SIZE_MIN, SPLAT_SIZE_MAX);
      const splatArcHeight = Math.hypot(vx, vy) * randRange(rng, SPLAT_ARC_HEIGHT_TIME_MIN, SPLAT_ARC_HEIGHT_TIME_MAX);
      add(SplatEffect(originX, originY, vx, vy, color, { size: splatSize, arcHeight: splatArcHeight }));
    }
  }

  const minX = room.x - room.w / 2 + PATROL_MARGIN;
  const maxX = room.x + room.w / 2 - PATROL_MARGIN;
  const minY = room.y - room.h / 2 + PATROL_MARGIN;
  const maxY = room.y + room.h / 2 - PATROL_MARGIN;

  function pickWaypoint() {
    if (minX >= maxX || minY >= maxY) return { x: room.x, y: room.y };
    return { x: randRange(rng, minX, maxX), y: randRange(rng, minY, maxY) };
  }

  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle: Math.random() * TAU,
    anim: Math.random() * 7,
    target: null,
    hp: MAX_HP,
    order: y,
    tags: [TAG_OBSTACLE, TAG_ENEMY],

    // Consistent puck-like accessor (see CubeObstacle.js/Pillar.js and
    // physics.js): a circular body with mass: Infinity, so the player
    // bounces off it while patrol and hit momentum drive its position.
    // Expose hit velocity for relative motion in the collision pass.
    puck() {
      return {
        x: this.x,
        y: this.y,
        radius: COLLISION_RADIUS,
        shape: 'circle',
        mass: Infinity,
        vx: this.vx,
        vy: this.vy,
        omega: 0,
        angle: 0,
        viscosity: 0,
        angularViscosity: 0,
        bounciness,
      };
    },

    update(dt) {
      if (!this.target) {
        pauseTimer -= dt;
        if (pauseTimer <= 0) this.target = pickWaypoint();
      } else {
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < WAYPOINT_ARRIVE_DIST) {
          this.target = null;
          pauseTimer = randRange(rng, PAUSE_MIN, PAUSE_MAX);
        } else {
          const step = Math.min(dist, PATROL_SPEED * dt);
          this.x += (dx / dist) * step;
          this.y += (dy / dist) * step;
          // Same heading convention PlayerCharacter uses: y points down on
          // screen, but a larger angle swings the head "up", so negate dy.
          this.angle = Math.atan2(-dy, dx);
          this.anim += dt;
        }
      }

      // Integrate exponential drag exactly so knockback travel is stable
      // across frame rates, then stop momentum at the room's inner bounds.
      const decay = Math.exp(-KNOCKBACK_DECAY * dt);
      const travelTime = (1 - decay) / KNOCKBACK_DECAY;
      const nextX = this.x + this.vx * travelTime;
      const nextY = this.y + this.vy * travelTime;
      this.x = Math.max(Math.min(minX, room.x), Math.min(Math.max(maxX, room.x), nextX));
      this.y = Math.max(Math.min(minY, room.y), Math.min(Math.max(maxY, room.y), nextY));
      this.vx = this.x === nextX ? this.vx * decay : 0;
      this.vy = this.y === nextY ? this.vy * decay : 0;
      this.order = this.y;

      flashTimer = Math.max(0, flashTimer - dt);
      hitCooldown = Math.max(0, hitCooldown - dt);
      healthBarTimer = Math.max(0, healthBarTimer - dt);

      return this.hp <= 0;
    },

    onCollision(other, collision) {
      if (!other.tags?.includes(TAG_PLAYER) || this.hp <= 0 || hitCooldown > 0) return;
      const player = collision.otherBody;
      if (player.charge <= CHARGING_THRESHOLD) return;

      const damage = player.charge >= HIGH_CHARGE_DAMAGE_THRESHOLD ? 2 : 1;
      this.hp = Math.max(0, this.hp - damage);
      flashTimer = FLASH_DURATION;
      healthBarTimer = HEALTH_BAR_SHOW_DURATION;
      hitCooldown = HIT_COOLDOWN;
      this.vx += player.vx * KNOCKBACK_TRANSFER;
      this.vy += player.vy * KNOCKBACK_TRANSFER;
      // These independent effects survive removal on the killing blow.
      add(DamageCallout(this.x, this.y - 30, `-${damage} hp`));
      fireSplats(this.x, this.y, HIT_SPLAT_COUNT, SPLAT_GREEN, player.vx, player.vy);
      if (this.hp <= 0 && !deathSplatsFired) {
        deathSplatsFired = true;
        fireSplats(this.x, this.y, DEATH_SPLAT_GREEN_COUNT, SPLAT_GREEN, player.vx, player.vy);
        fireSplats(this.x, this.y, DEATH_SPLAT_PURPLE_COUNT, SPLAT_PURPLE, player.vx, player.vy);
      }
      return this.hp <= 0;
    },

    render(context) {
      renderGrub(context, this, flashTimer);
      if (healthBarTimer > 0) {
        renderHealthBar(context, this.x, this.y - HEALTH_BAR_OFFSET_Y, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT, this.hp, MAX_HP);
      }
    },
  };
}

export default Grub;
