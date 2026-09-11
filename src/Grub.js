import { fillCircle } from './canvasShapes.js';
import DamageCallout from './DamageCallout.js';
import { mulberry32 } from './donjonDungeon.js';
import { add, getObjectsByTag } from './engine.js';
import GrubProjectile from './GrubProjectile.js';
import renderHealthBar from './HealthBar.js';
import { clamp, TAU } from './mathUtils.js';
import orbit3d from './orbit3d.js';
import SplatEffect from './SplatEffect.js';
import { playEnemyHit, playOozeShot } from './sounds.js';
import { TAG_ENEMY, TAG_OBSTACLE, TAG_PLAYER } from './tags.js';

// Numeric state ids instead of string names -- cheaper to compare and to
// ship (a bare digit minifies far smaller than a repeated quoted word).
const PATROL = 0;
const AIMING = 1;
const RECOVERING = 2;

function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

// -- body -----------------------------------------------------------------
const SEGMENT_RADII = [22, 18, 14, 10]; // head to tail
const SEGMENT_SPACING = 15;
// Local side-view S pose, head to tail. The tail stays planted while the
// head rises, the neck curls back, and the lower body bends forward.
const AIM_SEGMENT_ALONG = [0, -14, -10, -1.5 * SEGMENT_SPACING];
const AIM_SEGMENT_LIFT = [56, 32, 14, 0];
const AIM_SEGMENT_PULLBACK = [12, 16, 2, 0];
// Only the head and neck shudder, and only while winding up -- amplitude
// ramps in with progress^2 (quadratic: none at t=0, a quarter of max at
// t=0.5, full max at t=1) so it's barely there early and most pronounced
// right before the spit fires.
const AIM_SEGMENT_JITTER = [8, 5, 0, 0];
// Momentum kick on release: the whole spine whips forward past its idle
// pose the instant the spit fires, before easing back -- see 'recovering'
// in segmentPosition. Amounts taper tail-ward so the head snaps hardest and
// the tail least, bowing the S-shaped wind-up pose into a C on release.
const RELEASE_LUNGE_ALONG = [55, 30, 16, 8];
const RELEASE_LUNGE_PEAK_T = 0.07; // fraction of RECOVER_DURATION spent shooting forward before it eases back
// Matches renderTail's own perspectiveY in PlayerCharacter.js -- the same
// depth-compression ratio, for a consistent faux-3D feel across the cast.
const SPINE_PERSPECTIVE = 0.6;
const OUTLINE_COLOR = '#85d';
const OUTLINE_WIDTH = 11; // full stroke width -- see renderGrub, only half stays visible outside the fill
const BODY_COLORS = ['#334', '#223']; // alternating segment shade
const FACE_COLOR = '#7f6';
const FACE_GLOW_COLOR = '#5f5';
const EYE_RADIUS = 5;
const MOUTH_RADIUS = 4;
const COLLISION_RADIUS = 26;
const LARGE_SCALE = 1.4;
const LARGE_COLOR = '#f93';
const LARGE_SPREAD_ANGLE = Math.PI / 12;

// -- combat -----------------------------------------------------------------
const MAX_HP = 5;
// Damage is always 1, except at a genuinely fast (high-charge) hit, where
// it's 2 -- never more. player.chg (charge) is itself already a function of
// speed (see PlayerCharacter.js), so gating off it is gating off speed.
const HIGH_CHARGE_DAMAGE_THRESHOLD = 0.7;
const CHARGING_THRESHOLD = 0.15; // player.chg above this counts as "charging" for damage purposes
const HIT_COOLDOWN = 0.6; // seconds between hits even while still touching
const FLASH_DURATION = 0.25;
const KNOCKBACK_TRANSFER = 0.6; // fraction of incoming player velocity
const KNOCKBACK_DECAY = 16; // exponential velocity decay per second
const AIM_DURATION = 2;
// After firing, the body eases back to its idle pose over this long instead
// of snapping -- reuses the aim pose's own rise/pullback curve, played in
// reverse via aimT counting back down to 0.
const RECOVER_DURATION = 0.35;
const ATTACK_DELAY_MIN = 1;
const ATTACK_DELAY_MAX = 4;
const ATTACK_RANGE = 600;
const PROJECTILE_SPEED = 340;
const HEALTH_BAR_SHOW_DURATION = 2;
const HEALTH_BAR_WIDTH = 60;
const HEALTH_BAR_HEIGHT = 15;
const HEALTH_BAR_OFFSET_Y = 46;

// -- hit/death splats ---------------------------------------------------
const SPLAT_GREEN = '#4f5';
const SPLAT_PURPLE = '#85d'; // matches the body's own outline color
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
  let along = (1.5 - index) * SEGMENT_SPACING;
  let lift = 0;
  let jitterX = 0;
  if (grub.state === AIMING) {
    // Rise smoothly during the first part of the tell, then keep drawing
    // backward along local -x as the spit winds up. Height is screen-up,
    // while the bend rotates with the grub's facing direction below.
    const progress = Math.max(0, Math.min(1, grub.aimT));
    const riseT = Math.min(1, progress / 0.45);
    const rise = riseT * riseT * (3 - 2 * riseT);
    along += (AIM_SEGMENT_ALONG[index] - along) * rise
      - AIM_SEGMENT_PULLBACK[index] * progress * progress;
    lift = AIM_SEGMENT_LIFT[index] * rise;
    if (AIM_SEGMENT_JITTER[index] > 0) {
      // Two off-ratio sine waves summed stand in for jitter noise without
      // needing a per-frame rng; elapsed aim time (progress * AIM_DURATION)
      // drives the phase since grub.anim is frozen while aiming.
      const t = progress * AIM_DURATION;
      const shake = Math.sin(t * 41 + index * 5) + Math.sin(t * 67 + index * 2.3) * 0.5;
      jitterX = shake / 1.5 * AIM_SEGMENT_JITTER[index] * progress * progress;
    }
  } else if (grub.state === RECOVERING) {
    // aimT counts back down from 1 (the instant of firing, still in
    // the fully pulled-back pose) to 0 (idle). Smoothstep it directly --
    // no plateau this time -- so the body eases toward idle across the
    // whole recovery instead of snapping.
    const progress = Math.max(0, Math.min(1, grub.aimT));
    const settle = progress * progress * (3 - 2 * progress);
    along += (AIM_SEGMENT_ALONG[index] - along) * settle;
    lift = AIM_SEGMENT_LIFT[index] * settle;

    if (RELEASE_LUNGE_ALONG[index] > 0) {
      // A fast-rise, slow-decay "hump" over elapsed recovery time: each
      // segment shoots forward past idle the instant the spit releases,
      // head hardest and tail least, curling the S wind-up into a C --
      // then all resolve back to idle together.
      const elapsed = 1 - progress;
      let kick;
      if (elapsed < RELEASE_LUNGE_PEAK_T) {
        const riseX = elapsed / RELEASE_LUNGE_PEAK_T;
        kick = 1 - (1 - riseX) * (1 - riseX);
      } else {
        const fallX = (elapsed - RELEASE_LUNGE_PEAK_T) / (1 - RELEASE_LUNGE_PEAK_T);
        kick = 1 - fallX * fallX * (3 - 2 * fallX);
      }
      along += RELEASE_LUNGE_ALONG[index] * kick;
    }
  }
  let motionY = 0;
  if (grub.target != null) {
    motionY = (1 - Math.abs(Math.sin(grub.anim * 6.0 + index * 2))) * (8 - index) * 1;
  }
  return {
    x: grub.x + (Math.cos(grub.a) * along + jitterX) * grub.size,
    y: grub.y + (-Math.sin(grub.a) * along * SPINE_PERSPECTIVE - SEGMENT_RADII[index] / 2 + motionY - lift) * grub.size,
    r: SEGMENT_RADII[index] * grub.size,
  };
}

function renderBackSpike(context, segment, size, flash) {
  context.beginPath();
  context.moveTo(segment.x - segment.r * 0.45, segment.y - segment.r * 0.6);
  context.lineTo(segment.x, segment.y - segment.r * 1.9);
  context.lineTo(segment.x + segment.r * 0.45, segment.y - segment.r * 0.6);
  context.closePath();
  context.lineWidth = 5 * size;
  context.strokeStyle = '#a41';
  context.fillStyle = LARGE_COLOR;
  context.stroke();
  context.fill();
  if (flash > 0) {
    context.globalAlpha = flash;
    context.strokeStyle = context.fillStyle = '#fff';
    context.stroke();
    context.fill();
    context.globalAlpha = 1;
  }
}

function renderGrub(context, grub, flashTimer) {
  const segments = SEGMENT_RADII.map((_, i) => segmentPosition(grub, i));
  const flash = flashTimer > 0 ? Math.sin(Math.min(1, flashTimer / FLASH_DURATION) * Math.PI) : 0;

  // Outline pass: a thick stroke per segment, almost entirely covered by
  // the fills drawn afterward except where a segment's own edge IS the
  // union's outer boundary -- the cheap way to get one continuous outline
  // around a blob of overlapping circles instead of each circle's own ring.
  context.lineWidth = OUTLINE_WIDTH * grub.size;
  for (const [color, alpha] of [[OUTLINE_COLOR, 1], ['#fff', flash]]) {
    if (alpha <= 0) continue;
    context.strokeStyle = color;
    context.globalAlpha = alpha;
    segments.forEach((segment) => {
      context.beginPath();
      context.arc(segment.x, segment.y, segment.r, 0, TAU);
      context.stroke();
    });
  }
  context.globalAlpha = 1;

  // Positive sin faces into the page: draw head to tail so the nearer
  // rear segments cover the head. Facing out draws tail to head.
  const facingIntoPage = Math.sin(grub.a) > 0;
  for (let step = 0; step < segments.length; step++) {
    const i = facingIntoPage ? step : segments.length - 1 - step;
    if (grub.large && i > 0) renderBackSpike(context, segments[i], grub.size, flash);
    fillCircle(context, segments[i].x, segments[i].y, segments[i].r, BODY_COLORS[i % BODY_COLORS.length]);
    if (flash > 0) {
      context.globalAlpha = flash;
      fillCircle(context, segments[i].x, segments[i].y, segments[i].r, '#fff');
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
  const color = grub.large ? LARGE_COLOR : FACE_GLOW_COLOR;
  [-1, 1].forEach((side) => {
    if (Math.sin(grub.a - side * 0.6) > 0.22) {
      return;
    }
    const [x, y] = orbit3d(9, -4, -side * 12, grub.a + sway);
    const ex = head.x + x * grub.size;
    const ey = head.y + y * grub.size;
    fillCircle(context, ex, ey, EYE_RADIUS * grub.size, color);
  });
  if (Math.sin(grub.a) < 0.22) {
    const mouth = mouthPosition(grub, head);
    fillCircle(context, mouth.x, mouth.y, MOUTH_RADIUS * grub.size, color);
  }
}

function mouthPosition(grub, head = segmentPosition(grub, 0)) {
  const sway = Math.sin(grub.anim * 7) * 0.3;
  const [x, y] = orbit3d(12, 5, 0, grub.a + sway);
  return { x: head.x + x * grub.size, y: head.y + y * grub.size };
}

// A purple-outlined, four-segment grub that patrols randomly within its
// home room and takes damage from a charging player on contact. `room` is
// that home room in world space -- { x, y, w, h }, center + full size --
// used to keep patrol waypoints inside it (and PATROL_MARGIN off its
// walls), which is what keeps the grub "generally within its room" rather
// than wandering the whole dungeon.
function Grub(x, y, room, seed, props = {}) {
  const { large = false } = props;
  const size = large ? LARGE_SCALE : 1;
  const maxHp = MAX_HP + (large ? 3 : 0);
  const rng = mulberry32(seed);
  let pauseTimer = randRange(rng, PAUSE_MIN, PAUSE_MAX);
  let flashTimer = 0;
  let hitCooldown = 0;
  let healthBarTimer = 0;
  let deathSplatsFired = false;
  let attackCooldown = randRange(rng, ATTACK_DELAY_MIN, ATTACK_DELAY_MAX);
  let hadAimTarget = false;
  let aimElapsed = 0;
  let recoverElapsed = 0;
  // The point an aim is currently locked onto -- kept live while the
  // player's actually in range/sight, held at its last value once they
  // aren't (or if the player object is gone entirely, e.g. removed on
  // death/win -- see GameFlow.js), so a shot can never be canceled by
  // losing track of its target, only ever fired at wherever it last had one.
  let targetX = x;
  let targetY = y;

  // Sample launch velocity uniformly across a disk, then shift it by a
  // fraction of the player's hit velocity. The seeded rng keeps the
  // launch pattern reproducible.
  function fireSplats(originX, originY, count, color, impactVx, impactVy) {
    const splatColor = large ? LARGE_COLOR : color;
    for (let i = 0; i < count; i++) {
      const angle = rng() * TAU;
      const speed = Math.sqrt(rng()) * SPLAT_SPEED_MAX;
      const vx = Math.cos(angle) * speed + impactVx * SPLAT_IMPACT_TRANSFER;
      const vy = Math.sin(angle) * speed + impactVy * SPLAT_IMPACT_TRANSFER;
      const splatSize = randRange(rng, SPLAT_SIZE_MIN, SPLAT_SIZE_MAX);
      const splatArcHeight = Math.hypot(vx, vy) * randRange(rng, SPLAT_ARC_HEIGHT_TIME_MIN, SPLAT_ARC_HEIGHT_TIME_MAX);
      add(SplatEffect(originX, originY, vx, vy, splatColor, splatSize, splatArcHeight));
    }
  }

  const minX = room.x - room.w / 2 + PATROL_MARGIN * size;
  const maxX = room.x + room.w / 2 - PATROL_MARGIN * size;
  const minY = room.y - room.h / 2 + PATROL_MARGIN * size;
  const maxY = room.y + room.h / 2 - PATROL_MARGIN * size;

  function pickWaypoint() {
    if (minX >= maxX || minY >= maxY) return { x: room.x, y: room.y };
    return { x: randRange(rng, minX, maxX), y: randRange(rng, minY, maxY) };
  }

  return {
    x,
    y,
    large,
    size,
    maxHp,
    enemyCost: large ? 2 : 1,
    vx: 0,
    vy: 0,
    a: Math.random() * TAU,
    anim: Math.random() * 7,
    target: null,
    state: PATROL,
    aimT: 0, // 0..1 through the aim tell (and back down while recovering)
    hp: maxHp,
    z: y,
    // A static circle the player bounces off (see physics.js); patrol and
    // hit momentum drive its position.
    r: COLLISION_RADIUS * size,
    tags: [TAG_OBSTACLE, TAG_ENEMY],

    tick(dt) {
      if (this.hp <= 0) return true;
      const player = getObjectsByTag(TAG_PLAYER)[0];
      const canAim = player && player.hp > 0
        && Math.hypot(player.x - this.x, player.y - this.y) <= ATTACK_RANGE;

      // Roll a fresh reaction delay when acquiring the player, including
      // re-entry: time spent out of range must not make every grub ready at once.
      if (canAim && !hadAimTarget) {
        attackCooldown = randRange(rng, ATTACK_DELAY_MIN, ATTACK_DELAY_MAX);
      } else {
        attackCooldown = Math.max(0, attackCooldown - dt);
      }
      hadAimTarget = Boolean(canAim);

      if (this.state === RECOVERING) {
        // Ease aimT back down to 0 instead of zeroing it outright --
        // segmentPosition plays the aim pose's own curve in reverse off it.
        recoverElapsed += dt;
        this.aimT = Math.max(0, 1 - recoverElapsed / RECOVER_DURATION);
        if (recoverElapsed >= RECOVER_DURATION) {
          this.state = PATROL;
          this.aimT = 0;
        }
      } else if (this.state === AIMING) {
        // Once wound up, a shot is never canceled by losing range/sight --
        // only ever delayed (see hit()'s own hit-response). Keep
        // tracking the player live while actually reachable; otherwise
        // keep aiming at wherever it last had them.
        if (canAim) { targetX = player.x; targetY = player.y; }
        this.a = Math.atan2(this.y - targetY, targetX - this.x);
        aimElapsed += dt;
        this.aimT = Math.min(1, aimElapsed / AIM_DURATION);
        if (aimElapsed >= AIM_DURATION) {
          const mouth = mouthPosition(this);
          const dx = targetX - mouth.x;
          const dy = targetY - mouth.y;
          const heading = Math.atan2(dy, dx);
          const spread = this.large ? [-LARGE_SPREAD_ANGLE, 0, LARGE_SPREAD_ANGLE] : [0];
          const palette = this.large ? { color: LARGE_COLOR, highlightColor: '#fdb' } : undefined;
          spread.forEach((offset) => add(GrubProjectile(mouth.x, mouth.y,
            Math.cos(heading + offset) * PROJECTILE_SPEED, Math.sin(heading + offset) * PROJECTILE_SPEED, palette)));
          playOozeShot();
          this.state = RECOVERING;
          recoverElapsed = 0;
          attackCooldown = randRange(rng, ATTACK_DELAY_MIN, ATTACK_DELAY_MAX);
        }
      } else if (canAim && attackCooldown <= 0) {
        this.state = AIMING;
        this.target = null;
        this.vx = this.vy = 0;
        targetX = player.x;
        targetY = player.y;
        this.a = Math.atan2(this.y - player.y, player.x - this.x);
        aimElapsed = 0;
        this.aimT = 0;
      } else if (!this.target) {
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
          this.a = Math.atan2(-dy, dx);
          this.anim += dt;
        }
      }

      const q = COLLISION_RADIUS * size;
      this.x = clamp(this.x + this.vx * dt, minX + q, maxX - q);
      this.y = clamp(this.y + this.vy * dt, minY + q, maxY - q);
      this.vx -= this.vx * 4.5 * dt;
      this.vy -= this.vy * 4.5 * dt;
      this.z = this.y;

      flashTimer = Math.max(0, flashTimer - dt);
      hitCooldown = Math.max(0, hitCooldown - dt);
      healthBarTimer = Math.max(0, healthBarTimer - dt);

      return this.hp <= 0;
    },

    // Called by the player on contact, with its pre-bounce state.
    hit(player) {
      if (this.hp <= 0 || hitCooldown > 0 || player.chg <= CHARGING_THRESHOLD) return;

      // Mithril Horn adds a flat bonus on top of the usual charge-based roll.
      const damage = (player.chg >= HIGH_CHARGE_DAMAGE_THRESHOLD ? 2 : 1) + player.horn;
      this.hp = Math.max(0, this.hp - damage);
      playEnemyHit(damage);
      flashTimer = FLASH_DURATION;
      healthBarTimer = HEALTH_BAR_SHOW_DURATION;
      hitCooldown = HIT_COOLDOWN;
      if (this.state === AIMING) {
        // A charging hit never cancels a wound-up shot, only delays it --
        // rewind aimElapsed so at least 1 second remains before it fires,
        // but never push it sooner (Math.min only ever pulls it earlier
        // in time, i.e. rewinds, never fast-forwards).
        aimElapsed = Math.min(aimElapsed, Math.max(0, AIM_DURATION - 1));
        this.aimT = Math.min(1, aimElapsed / AIM_DURATION);
      } else {
        this.state = PATROL;
        this.aimT = 0;
      }
      attackCooldown = randRange(rng, ATTACK_DELAY_MIN, ATTACK_DELAY_MAX);
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
        renderHealthBar(context, this.x, this.y - HEALTH_BAR_OFFSET_Y * size,
          HEALTH_BAR_WIDTH * size, HEALTH_BAR_HEIGHT * size, this.hp, this.maxHp);
      }
    },
  };
}

export default Grub;
