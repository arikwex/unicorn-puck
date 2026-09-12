import { fillCircle, fillEllipse } from './canvasShapes.js';
import chainLightning from './ChainLightning.js';
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

// Numeric enemy types also index size/HP tables and determine room cost.
const SMALL = 0;
const MEDIUM = 1;
const LARGE = 2;
const FACE_COLORS = ['#5f5', '#3de', '#f93']; // per type: face/ooze color

function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

// -- body -----------------------------------------------------------------
const SEGMENT_RADII = [22, 18, 14, 10]; // head to tail
const SEGMENT_SPACING = 15;
// How far the front of the body rears up and draws back at a full tell.
const AIM_LIFT = 46;
const AIM_PULLBACK = 20;
// Matches renderTail's own perspectiveY in PlayerCharacter.js -- the same
// depth-compression ratio, for a consistent faux-3D feel across the cast.
const SPINE_PERSPECTIVE = 0.6;
const OUTLINE_COLOR = '#85d';
const OUTLINE_WIDTH = 11; // full stroke width -- see renderGrub, only half stays visible outside the fill
const BODY_COLORS = ['#334', '#223']; // alternating segment shade
const EYE_RADIUS = 5;
const MOUTH_RADIUS = 4;
const COLLISION_RADIUS = 26;
const MEDIUM_SPREAD_ANGLE = Math.PI / 12;

// -- combat -----------------------------------------------------------------
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
// reverse via k counting back down to 0.
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
const PATROL_MARGIN = 60; // world units kept clear of the room's own walls
const WAYPOINT_ARRIVE_DIST = 10;
const PAUSE_MIN = 0.4;
const PAUSE_MAX = 1.6;

// Segment centers run along the facing direction, front (head) to back
// (tail), using the same cos/sin offset-from-angle convention
// PlayerCharacter uses for its own head/snout placement -- the "captured"
// faux-3D concept this game reuses everywhere a body part needs to lead or
// trail the facing angle, with the y-offset compressed by
// SPINE_PERSPECTIVE the same way renderTail compresses depth.
function segmentPosition(grub, index) {
  // The tell (and the recovery after it) rears the front of the body up and
  // back, tapering to nothing at the planted tail. k runs 0 -> 1 through
  // the wind-up, then back down to 0 as it settles.
  const pose = grub.state ? grub.k * (3 - index) / 3 : 0;
  const along = (1.5 - index) * SEGMENT_SPACING - pose * AIM_PULLBACK;
  const lift = pose * AIM_LIFT;
  let motionY = 0;
  if (grub.target != null) {
    motionY = (1 - Math.abs(Math.sin(grub.anim * 6.0 + index * 2))) * (8 - index) * 1;
  }
  return {
    x: grub.x + Math.cos(grub.a) * along * grub.sz,
    y: grub.y + (-Math.sin(grub.a) * along * SPINE_PERSPECTIVE - SEGMENT_RADII[index] / 2 + motionY - lift) * grub.sz,
    r: SEGMENT_RADII[index] * grub.sz,
  };
}

function renderGrub(context, grub, flashTimer) {
  const segments = SEGMENT_RADII.map((_, i) => segmentPosition(grub, i));
  const flash = flashTimer > 0 ? Math.sin(Math.min(1, flashTimer / FLASH_DURATION) * Math.PI) : 0;

  // Outline pass: a thick stroke per segment, almost entirely covered by
  // the fills drawn afterward except where a segment's own edge IS the
  // union's outer boundary -- the cheap way to get one continuous outline
  // around a blob of overlapping circles instead of each circle's own ring.
  context.lineWidth = OUTLINE_WIDTH * grub.sz;
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
    fillCircle(context, segments[i].x, segments[i].y, segments[i].r, BODY_COLORS[i % BODY_COLORS.length]);
    if (flash > 0) {
      context.globalAlpha = flash;
      fillCircle(context, segments[i].x, segments[i].y, segments[i].r, '#fff');
      context.globalAlpha = 1;
    }
    if (i === 0) {
      // Face: two glowing eyes plus a mouth dot, riding off the head the same
      // way PlayerCharacter's own eyes ride off its facing angle. Drawn with
      // the head so nearer body segments can cover the face when facing away.
      const head = segments[i];
      const sway = Math.sin(grub.anim * 7) * 0.3;
      const color = FACE_COLORS[grub.ty];
      [-1, 1].forEach((side) => {
        if (Math.sin(grub.a - side * 0.6) > 0.22) return;
        const [x, y] = orbit3d(9, -4, -side * 12, grub.a + sway);
        fillCircle(context, head.x + x * grub.sz, head.y + y * grub.sz, EYE_RADIUS * grub.sz, color);
      });
      if (Math.sin(grub.a) < 0.22) {
        const mouth = mouthPosition(grub, head);
        fillCircle(context, mouth.x, mouth.y, MOUTH_RADIUS * grub.sz, color);
      }
    }
  }
}

function mouthPosition(grub, head = segmentPosition(grub, 0)) {
  const sway = Math.sin(grub.anim * 7) * 0.3;
  const [x, y] = orbit3d(12, 5, 0, grub.a + sway);
  return { x: head.x + x * grub.sz, y: head.y + y * grub.sz };
}

// -- hovering orb enemies (MEDIUM and LARGE) ----------------------------------
// A sphere floating above its ground point, in the same faux-3D as the
// player: parts are placed around the facing angle with orbit3d and drawn
// back to front by depth, so they swing behind and in front of the body as
// it turns, and eyes round the far side are hidden by it.
const ORB_RADIUS = 24;
const ORB_HOVER = 22; // body center height above the ground point
// Bodies reuse the grub's own dark shell and purple outline; only the
// trim differs. Per type: [accent, crystal/orbiter fill, its far side, eye,
// eye core].
const ORB_THEMES = [, ['#6ef', '#3af', '#27b', '#3af', '#cef'], ['#f93', '#fb5', '#c62', '#f93', '#fe9']];
const EYE_DISTANCE = ORB_RADIUS * 0.82; // eye centers sit just inside the silhouette
// Medium crystal winglets per side: [height on the body (+ is down),
// length, tilt up from horizontal (radians), half-width]. Two big ones
// angled up and back, two small ones angled down and back.
const WINGLETS = [[-8, 44, 0.6, 11], [9, 27, -0.5, 7]];
const WINGLET_SPLAY = 0.85; // how far each side's winglets angle outward from straight back
const ORBITERS = 5;
const ORBIT_RADIUS = ORB_RADIUS * 1.65;
const ORBITER_RADIUS = 6.5;

// World-space center of the body sphere: hovering, gently bobbing.
function orbCenter(grub) {
  return { x: grub.x, y: grub.y + (Math.sin(grub.t * 2.5) * 3 - ORB_HOVER) * grub.sz };
}

// A point on/around the orb, in its own local space (x forward, y down, z
// sideways -- see orbit3d), as [screenX, screenY, depth].
function orbPoint(grub, center, x, y, z) {
  const [px, py, d] = orbit3d(x, y, z, grub.a);
  return [center.x + px * grub.sz, center.y + py * grub.sz, d];
}

// An eye on the sphere's surface, facing out along local direction
// `azimuth` from the facing angle: foreshortened toward the silhouette as it
// turns away, and hidden once it's round the back. Diamond or oval.
function renderOrbEye(context, grub, center, azimuth, radius, diamond, theme) {
  const [x, y, d] = orbPoint(grub, center, Math.cos(azimuth) * EYE_DISTANCE, -2, Math.sin(azimuth) * EYE_DISTANCE);
  if (d > EYE_DISTANCE * 0.2) return;
  const squash = 0.3 + 0.7 * Math.min(1, Math.max(0, -d / EYE_DISTANCE));
  // Aiming charges it up: the core swells and a halo builds around it.
  const charge = (grub.state === AIMING) * grub.k;
  context.globalAlpha = charge * 0.45;
  fillEllipse(context, x, y, radius * 1.7 * squash * grub.sz, radius * 1.7 * grub.sz, theme[3]);
  context.globalAlpha = 1;
  [[1, theme[3]], [0.45 + charge * 0.3, theme[4]]].forEach(([scale, color]) => {
    const r = radius * scale * grub.sz;
    context.fillStyle = color;
    context.beginPath();
    if (diamond) {
      context.moveTo(x, y - r);
      context.lineTo(x + r * squash, y);
      context.lineTo(x, y + r);
      context.lineTo(x - r * squash, y);
    } else {
      context.ellipse(x, y, r * squash, r, 0, 0, TAU);
    }
    context.fill();
  });
}

function renderOrb(context, grub, flashTimer) {
  const flash = flashTimer > 0 ? Math.sin(Math.min(1, flashTimer / FLASH_DURATION) * Math.PI) : 0;
  const theme = ORB_THEMES[grub.ty];
  const center = orbCenter(grub);
  const parts = [{
    d: 0,
    // The body sphere itself, drawn inline (its only call site).
    draw: () => {
      const r = ORB_RADIUS * grub.sz;
      fillCircle(context, center.x, center.y, r, BODY_COLORS[0]);
      // A dim lit cap on the upper side reads as roundness.
      context.globalAlpha = 0.25;
      fillCircle(context, center.x - r * 0.25, center.y - r * 0.3, r * 0.55, OUTLINE_COLOR);
      context.globalAlpha = flash;
      fillCircle(context, center.x, center.y, r, '#fff');
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(center.x, center.y, r, 0, TAU);
      context.strokeStyle = flash > 0.5 ? '#fff' : OUTLINE_COLOR;
      context.lineWidth = 4 * grub.sz;
      context.stroke();
      if (grub.ty === MEDIUM) {
        renderOrbEye(context, grub, center, 0, 9, false, theme);
      } else {
        for (let k = 0; k < 4; k++) renderOrbEye(context, grub, center, k * TAU / 4, 8.5, true, theme);
      }
    },
  }];
  if (grub.ty === MEDIUM) {
    for (const side of [-1, 1]) {
      WINGLETS.forEach((winglet) => parts.push({
        // Sorted by the winglet's midpoint, well back of its mount.
        d: orbPoint(grub, center, -ORB_RADIUS * 0.45 - winglet[1] * 0.4, 0, side * ORB_RADIUS)[2],
        // A crystal-shard winglet, as a flat kite in its own plane: mounted
        // on the back half of the sphere, splayed outward, and tilted up or
        // down. Like the player's wings it's projected straight through the
        // facing angle -- so it narrows to an edge-on sliver (kept visible by
        // its outline stroke) as it turns side-on, and shows its lighter or
        // darker face depending on which side is toward the camera.
        draw: () => {
          const [mountY, length, tilt, width] = winglet;
          const flutter = Math.sin(grub.t * 5 + mountY + side) * 0.12;
          const alongX = -Math.cos(WINGLET_SPLAY);
          const alongZ = side * Math.sin(WINGLET_SPLAY);
          const [mx, mz] = [-ORB_RADIUS * 0.45, side * ORB_RADIUS * 0.62];
          const ux = Math.cos(tilt + flutter);
          const uy = Math.sin(tilt + flutter);
          // (along, up) in the winglet's own plane -> screen.
          const point = (a, h) => orbPoint(grub, center, mx + alongX * a, mountY - h, mz + alongZ * a);
          const kite = [[0, 0], [ux * length * 0.45 - uy * width, uy * length * 0.45 + ux * width], [ux * length, uy * length],
            [ux * length * 0.45 + uy * width, uy * length * 0.45 - ux * width]].map(([a, h]) => point(a, h));
          // Which face shows: the sign of the projected kite's winding.
          const [[x0, y0], [x1, y1], [x2, y2]] = kite;
          const facing = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0) > 0 === side > 0;
          context.beginPath();
          kite.forEach(([x, y]) => context.lineTo(x, y));
          context.closePath();
          context.fillStyle = theme[facing ? 1 : 2];
          context.fill();
          context.strokeStyle = theme[0];
          context.lineWidth = 3 * grub.sz;
          context.stroke();
        },
      }));
    }
  } else {
    // Five small orbs circling slowly in a tilted ring, each bobbing on its
    // own phase; nearer ones draw a touch larger.
    for (let i = 0; i < ORBITERS; i++) {
      const phase = grub.o + i * TAU / ORBITERS;
      const [x, y, d] = orbPoint(grub, center, Math.cos(phase) * ORBIT_RADIUS,
        Math.sin(grub.t * 2 + i * 1.7) * 5, Math.sin(phase) * ORBIT_RADIUS);
      parts.push({
        d,
        draw: () => {
          const r = ORBITER_RADIUS * grub.sz * (1 - d / ORBIT_RADIUS * 0.15);
          fillCircle(context, x, y, r, theme[1]);
          context.strokeStyle = theme[2];
          context.lineWidth = 2 * grub.sz;
          context.stroke();
          fillCircle(context, x - r * 0.3, y - r * 0.3, r * 0.35, theme[4]);
        },
      });
    }
  }
  parts.sort((a, b) => b.d - a.d).forEach((part) => part.draw());
}

const CHARGE_MOTES = 7;
const CHARGE_REACH = 40; // how far out the motes start

// Where a volley leaves from: the small grub's mouth, the medium orb's eye,
// or the large orb's center.
function muzzle(grub) {
  if (grub.ty === SMALL) return mouthPosition(grub);
  const center = orbCenter(grub);
  if (grub.ty === LARGE) return center;
  const [x, y] = orbPoint(grub, center, EYE_DISTANCE, -2, 0);
  return { x, y };
}

// A purple-outlined, four-segment grub that patrols randomly within its
// home room and takes damage from a charging player on contact. `room` is
// that home room in world space -- { x, y, w, h }, center + full size --
// used to keep patrol waypoints inside it (and PATROL_MARGIN off its
// walls), which is what keeps the grub "generally within its room" rather
// than wandering the whole dungeon.
function Grub(x, y, room, seed, ty = SMALL) {
  const sz = [1, 1.4, 2.1][ty];
  const maxHp = [5, 8, 13][ty];
  const rng = mulberry32(seed);
  let pauseTimer = randRange(rng, PAUSE_MIN, PAUSE_MAX);
  let flashTimer = 0;
  let hitCooldown = 0;
  let healthBarTimer = 0;
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
    const splatColor = ty ? FACE_COLORS[ty] : color;
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

  const minX = room.x - room.w / 2 + PATROL_MARGIN * sz;
  const maxX = room.x + room.w / 2 - PATROL_MARGIN * sz;
  const minY = room.y - room.h / 2 + PATROL_MARGIN * sz;
  const maxY = room.y + room.h / 2 - PATROL_MARGIN * sz;

  return {
    x,
    y,
    ty,
    sz,
    maxHp,
    enemyCost: ty + 1,
    vx: 0,
    vy: 0,
    a: Math.random() * TAU,
    anim: Math.random() * 7,
    t: Math.random() * 7, // running clock for orb bob/flutter
    o: Math.random() * TAU, // large orbs' ring phase (spins up while aiming)
    target: null,
    state: PATROL,
    k: 0, // 0..1 through the aim tell (and back down while recovering)
    hp: maxHp,
    z: y,
    // A static circle the player bounces off (see physics.js); patrol and
    // hit momentum drive its position.
    r: COLLISION_RADIUS * sz,
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
        // Ease k back down to 0 instead of zeroing it outright --
        // segmentPosition plays the aim pose's own curve in reverse off it.
        recoverElapsed += dt;
        this.k = Math.max(0, 1 - recoverElapsed / RECOVER_DURATION);
        if (recoverElapsed >= RECOVER_DURATION) {
          this.state = PATROL;
          this.k = 0;
        }
      } else if (this.state === AIMING) {
        // Once wound up, a shot is never canceled by losing range/sight --
        // only ever delayed (see hit()'s own hit-response). Keep
        // tracking the player live while actually reachable; otherwise
        // keep aiming at wherever it last had them.
        if (canAim) { targetX = player.x; targetY = player.y; }
        this.a = Math.atan2(this.y - targetY, targetX - this.x);
        aimElapsed += dt;
        this.k = Math.min(1, aimElapsed / AIM_DURATION);
        if (aimElapsed >= AIM_DURATION) {
          const mouth = muzzle(this);
          const dx = targetX - mouth.x;
          const dy = targetY - mouth.y;
          const heading = Math.atan2(dy, dx);
          const shots = [1, 3, 8][ty];
          const palette = ty ? { color: FACE_COLORS[ty], highlightColor: ORB_THEMES[ty][4] } : undefined;
          for (let i = 0; i < shots; i++) {
            // A large volley fans out from the aim itself -- one shot straight
            // at the player, the rest every 45 degrees around it -- so a
            // standing target is always hit.
            const angle = heading + (ty === LARGE ? i * TAU / 8 : (i - (shots - 1) / 2) * MEDIUM_SPREAD_ANGLE);
            add(GrubProjectile(mouth.x, mouth.y,
              Math.cos(angle) * PROJECTILE_SPEED, Math.sin(angle) * PROJECTILE_SPEED, palette));
          }
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
        this.k = 0;
      } else if (!this.target) {
        pauseTimer -= dt;
        // A fresh patrol waypoint inside the room (PATROL_MARGIN off its own
        // walls), or dead center when the room is too small to inset.
        if (pauseTimer <= 0) {
          this.target = minX >= maxX || minY >= maxY
            ? { x: room.x, y: room.y }
            : { x: randRange(rng, minX, maxX), y: randRange(rng, minY, maxY) };
        }
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

      const q = COLLISION_RADIUS * sz;
      this.x = clamp(this.x + this.vx * dt, minX + q, maxX - q);
      this.y = clamp(this.y + this.vy * dt, minY + q, maxY - q);
      this.vx -= this.vx * 4.5 * dt;
      this.vy -= this.vy * 4.5 * dt;
      this.z = this.y;
      this.t += dt;
      this.o += dt * (0.5 + (this.state === AIMING) * this.k * 3);

      flashTimer = Math.max(0, flashTimer - dt);
      hitCooldown = Math.max(0, hitCooldown - dt);
      healthBarTimer = Math.max(0, healthBarTimer - dt);

      return this.hp <= 0;
    },

    // Called by the player on contact, with its pre-bounce state.
    hit(player) {
      if (this.hp <= 0 || hitCooldown > 0 || player.chg <= CHARGING_THRESHOLD) return;

      // Mithril Horn adds a flat bonus on top of the usual charge-based roll.
      hitCooldown = HIT_COOLDOWN;
      const dead = this.hurt((player.chg >= HIGH_CHARGE_DAMAGE_THRESHOLD ? 2 : 1) + player.horn, player.vx, player.vy);
      if (player.hoof) chainLightning(this);
      return dead;
    },

    // Shared damage feedback; lightning has no impact momentum or horn bonus
    // and bypasses the cooldown that prevents repeated contact damage.
    hurt(damage, vx = 0, vy = 0) {
      if (this.hp <= 0) return;
      this.hp = Math.max(0, this.hp - damage);
      playEnemyHit(damage);
      flashTimer = FLASH_DURATION;
      healthBarTimer = HEALTH_BAR_SHOW_DURATION;
      if (this.state === AIMING) {
        // A charging hit never cancels a wound-up shot, only delays it --
        // rewind aimElapsed so at least 1 second remains before it fires,
        // but never push it sooner (Math.min only ever pulls it earlier
        // in time, i.e. rewinds, never fast-forwards).
        aimElapsed = Math.min(aimElapsed, Math.max(0, AIM_DURATION - 1));
        this.k = Math.min(1, aimElapsed / AIM_DURATION);
      } else {
        this.state = PATROL;
        this.k = 0;
      }
      attackCooldown = randRange(rng, ATTACK_DELAY_MIN, ATTACK_DELAY_MAX);
      this.vx += vx * KNOCKBACK_TRANSFER;
      this.vy += vy * KNOCKBACK_TRANSFER;
      // These independent effects survive removal on the killing blow.
      add(DamageCallout(this.x, this.y - 30, `-${damage} hp`));
      fireSplats(this.x, this.y, HIT_SPLAT_COUNT, SPLAT_GREEN, vx, vy);
      if (this.hp <= 0) {
        fireSplats(this.x, this.y, DEATH_SPLAT_GREEN_COUNT, SPLAT_GREEN, vx, vy);
        fireSplats(this.x, this.y, DEATH_SPLAT_PURPLE_COUNT, SPLAT_PURPLE, vx, vy);
      }
      return this.hp <= 0;
    },

    render(context) {
      (ty ? renderOrb : renderGrub)(context, this, flashTimer);
      // The tell every type shares: a ring of motes spiralling into the
      // muzzle, each falling in on its own stagger and the whole cycle
      // winding faster as the shot nears. They fade in as they arrive, so the
      // muzzle visibly gathers. Inlined -- this was its only call site.
      if (this.state === AIMING) {
        const m = muzzle(this);
        for (let i = 0; i < CHARGE_MOTES; i++) {
          // `o` already winds faster as the tell nears its end (see tick), so
          // the motes fall in quicker and quicker; each trails the last by a
          // seventh of the cycle, and brightens and swells as it lands.
          const fall = (this.o + i / CHARGE_MOTES) % 1;
          const reach = (1 - fall) * CHARGE_REACH * this.sz;
          const spin = i * TAU / CHARGE_MOTES + fall * 1.5;
          context.globalAlpha = 0.35 + fall * 0.65;
          fillCircle(context, m.x + Math.cos(spin) * reach, m.y + Math.sin(spin) * reach * 0.75,
            (1.5 + fall * 3.5) * this.sz, FACE_COLORS[this.ty]);
        }
        context.globalAlpha = 1;
      }
      if (healthBarTimer > 0) {
        renderHealthBar(context, this.x, this.y - (ty ? 72 : HEALTH_BAR_OFFSET_Y) * sz,
          HEALTH_BAR_WIDTH * sz, HEALTH_BAR_HEIGHT * sz, this.hp, this.maxHp);
      }
    },
  };
}

export default Grub;
export { SMALL, MEDIUM, LARGE };
