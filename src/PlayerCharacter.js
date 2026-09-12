import { add, getObjectsByTag, remove } from './engine.js';
import { renderBubbleShield } from './bubbleShield.js';
import { fillCircle, fillEllipse } from './canvasShapes.js';
import contact from './physics.js';
import orbit3d from './orbit3d.js';
import SplatEffect from './SplatEffect.js';
import { playPlayerDamage, playWallBounce } from './sounds.js';
import { TAG_ENEMY, TAG_OBSTACLE, TAG_PLAYER } from './tags.js';
import { TAU } from './mathUtils.js';

const DAMAGE_FLASH_DURATION = 0.6;
// The puck's collision radius, and also the reference "size" Camera.js
// zooms against so the character reads at a consistent fraction of the
// screen on any device.
const PLAYER_RADIUS = 38;
const WALL_BOUNCE_SOUND_MIN_SPEED = 30; // world units/s of velocity change -- below this, a resting/sliding contact stays silent
const DAMAGE_CANVAS_SIZE = 320;
// Velocity decay rates (1/s) below/above CHARGE_MIN_SPEED -- see tick().
const DRAG = 0.6;
const CHARGING_DRAG = 3;
const RESTITUTION = 0.4; // < 1: bounces off obstacles lose some energy

function normalizeAngle(value) {
  let normalized = value % TAU;
  if (normalized > Math.PI) normalized -= TAU;
  if (normalized <= -Math.PI) normalized += TAU;
  return normalized;
}

// -- damage splats -----------------------------------------------------------
// Red, orange, yellow, green, blue, violet -- one splat of each, always all
// six, always this order, flung out in a uniform-random direction apiece.
const DAMAGE_SPLAT_COLORS = ['#f33', '#f90', '#fc0', '#3c5', '#18f', '#a5d'];
const DAMAGE_SPLAT_SPEED_MAX = 220; // world units per second, before the arc-height scaling below
const DAMAGE_SPLAT_SIZE_MIN = 10;
const DAMAGE_SPLAT_SIZE_MAX = 18;
const DAMAGE_SPLAT_ARC_HEIGHT_TIME_MIN = 0.08;
const DAMAGE_SPLAT_ARC_HEIGHT_TIME_MAX = 0.28;

// While an aim drag is active (see DragController, which drives
// `aiming`/`targetAngle` directly on the player object), heading eases
// toward the target launch direction at a fixed, decently fast rate.
// Otherwise it continuously eases toward the direction of travel instead,
// with the exponential ease rate scaling with speed: fast means the
// heading snaps around quickly, slow means it drifts around lazily. Below
// MIN_SPEED_FOR_HEADING the travel direction is too noisy to be meaningful
// (and would jitter via atan2 near zero velocity), so heading just holds
// still.
const AIM_EASE_RATE = 10; // rad/s-ish ease rate while actively aiming
const MIN_SPEED_FOR_HEADING = 4;
const HEADING_EASE_MIN = 0.6; // rad/s-ish ease rate floor, approached as speed -> 0
const HEADING_EASE_PER_SPEED = 0.06; // additional ease rate per unit of speed -- x3'd so fast travel snaps the heading around much quicker

// See renderPlayer's head/torso draw-order comment.
const HEAD_BEHIND_BUFFER = (20 * Math.PI) / 180;

// `chg` (charge) is a smoothed 0..1 read of how fast the player is currently
// moving, driving every "charging forward" render tweak below (squish,
// head/horn lean, wing sweep, trail). It stays 0 below
// CHARGE_MIN_SPEED (no pose change at a crawl), ramps linearly up to
// CHARGE_MAX_SPEED, and holds at 1 beyond that. CHARGE_EASE_RATE then
// smooths *that* target over time so a sudden speed change doesn't pop
// the visuals; charge is a value, not a switch.
const CHARGE_MIN_SPEED = 400; // x3'd so only genuinely fast travel triggers the squish pose
const CHARGE_MAX_SPEED = 1000;
const CHARGE_EASE_RATE = 24; // x4'd so the squish pose snaps in/out much quicker

// Squash-and-stretch on the torso: shorter top-to-bottom, wider
// side-to-side, at charge = 1.
const TORSO_SQUISH_Y = 0.32;
const TORSO_SQUISH_X = 0.22;
// Extra forward reach for the head assembly at charge = 1 (world units),
// on top of its normal offset from the body, plus how much lower (both
// head and snout) drop as part of the squish.
const HEAD_LEAN_FORWARD = 14;
const HEAD_DROP = 10;
const SNOUT_DROP = 9;
// The snout tucks in closer to the head (world units less than its normal
// offset) as it squishes, rather than staying stretched out.
const SNOUT_CLOSER = 8;
// The horn's own tilt: more forward push, less vertical rise, at charge = 1.
const HORN_LEAN_FORWARD = 10;
const HORN_LEAN_FLATTEN = 10;
// Wings shrink, rake backward (away from the direction of travel), drop
// lower, and stretch a bit wider along that sweep for an
// elongated-behind-the-body look, all at charge = 1.
const WING_SHORTEN = 0.3;
const WING_ELONGATE = 0.25;
const WING_SWEEP_BACK = 0.18; // 20% of its original 0.9
const WING_DROP = 10;
// The tail stretches further out behind the body at charge = 1 -- a
// multiplier on its own reach, not a flat offset, so it stays attached at
// the torso and only its far end streams outward.
const TAIL_STRETCH = 0.5;

const TRAIL_DURATION = 0.5; // seconds a trail sample stays visible

// The trail is 6 solid ROYGBV bands riding side by side (offset via
// zPosition, the same faux-3D side-mount projection the ears use, so the
// band foreshortens with the character's heading like everything else
// does) rather than one shrinking, hue-cycling line -- fixed width, fixed
// left-to-right order, fading only in alpha toward the trail's old end.
const TRAIL_STRIPE_COLORS = [
  '#d00', // red
  '#f80', // orange
  '#fe0', // yellow
  '#082', // green
  '#05f', // blue
  '#708', // violet
];
const TRAIL_STRIPE_WIDTH = 10.5; // px, fixed -- never shrinks, only fades (50% larger than its original 7)
const TRAIL_STRIPE_SPACING = 10.5; // px between adjacent stripe centers, scaled with the width so the band still tiles seamlessly

function fillShape(context, color, trace) {
  context.fillStyle = color;
  context.beginPath();
  trace();
  context.closePath();
  context.fill();
}

// Fill plus a rounded stroke of the same color. The stroke keeps a thin
// sliver of a shape visible (as a rounded line) even when it's foreshortened
// down to near-zero fill area at a glancing angle.
function fillOutlinedShape(context, color, lineWidth, trace) {
  context.beginPath();
  trace();
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.stroke();
}

function zPosition(angle, centerX, centerY, offset) {
  const cameraFacing = Math.cos(angle) * Math.sign(offset);
  const depthAdjustedOffset = offset * (1 - cameraFacing * 0.2);
  return [
    centerX + Math.sin(angle) * depthAdjustedOffset,
    centerY + Math.cos(angle) * depthAdjustedOffset * 0.35,
  ];
}

function fillEar(context, centerX, baseY, halfWidth, height, color) {
  const tipY = baseY - height;
  const turn = height * 0.22;

  fillShape(context, color, () => {
    context.moveTo(centerX - halfWidth, baseY);
    context.bezierCurveTo(
      centerX - halfWidth, baseY - height * 0.42,
      centerX - turn, tipY + turn,
      centerX, tipY,
    );
    context.bezierCurveTo(
      centerX + turn, tipY + turn,
      centerX + halfWidth, baseY - height * 0.42,
      centerX + halfWidth, baseY,
    );
    context.quadraticCurveTo(
      centerX, baseY + 2,
      centerX - halfWidth, baseY,
    );
  });
}

function traceHorn(context, halfWidth, length) {
  context.moveTo(-halfWidth, 0);
  context.arc(
    0,
    -halfWidth,
    halfWidth * Math.SQRT2,
    Math.PI * 0.75,
    Math.PI * 0.25,
    true,
  );
  context.lineTo(0, -length);
}

function renderHorn(context, angle, headX, headY, charge) {
  const baseX = headX + Math.cos(angle) * 8;
  const baseY = headY - 13 - Math.sin(angle) * 6;
  const dx = Math.cos(angle) * (14 + HORN_LEAN_FORWARD * charge);
  const dy = -20 + HORN_LEAN_FLATTEN * charge - Math.sin(angle) * 4;
  const length = Math.hypot(dx, dy);
  const halfWidth = 4;

  context.save();
  context.translate(baseX, baseY);
  context.rotate(Math.atan2(dx, -dy));
  context.scale(2, 2);
  fillShape(context, '#ec6', () => traceHorn(context, halfWidth, length));

  context.beginPath();
  traceHorn(context, halfWidth, length);
  context.closePath();
  context.clip();

  for (let y = -4; y > -length; y -= 8) {
    fillShape(context, '#c94', () => {
      context.moveTo(-halfWidth, y);
      context.lineTo(halfWidth, y - 4);
      context.lineTo(halfWidth, y - 1);
      context.lineTo(-halfWidth, y + 3);
    });
  }
  context.restore();
}

// `foreground` is compared loosely (here and in renderWingsAndTail): the
// build ships boolean literals as 1/0 (see tools/build.js), and 1 !== true.
// The single ear is drawn inline -- it was only ever called from here, and
// this way the facing test it needs is the one already computed.
function renderEars(context, angle, headX, headY, foreground) {
  const spacing = 10;
  [-spacing, spacing].forEach((offset) => {
    // An ear faces the camera when its own side of the head is turned toward
    // it -- the same rotatedZ <= 0 depth convention used throughout.
    const facesCamera = -Math.sin(angle) + Math.sign(offset) * Math.cos(angle) >= 0;
    if (facesCamera != foreground) return;
    const [centerX, baseY] = zPosition(
      angle,
      headX - Math.cos(angle) * 5,
      headY - 11 + Math.sin(angle) * 5,
      offset,
    );
    fillEar(
      context,
      centerX,
      facesCamera ? baseY + 3 : baseY,
      8,
      facesCamera ? 27 : 24,
      facesCamera ? '#fff' : '#cce',
    );
    if (facesCamera) {
      fillEar(context, centerX, baseY - 3, 4.5, 15, '#cce');
    }
  });
}

// --- Tunable feather parameters (all angles in radians, all lengths as a
// fraction of the terminal-phalanx-to-blade-of-scapula baseline length) ---
const FEATHER_COUNT = 4;
const FEATHER_SWEEP_ANGLE = -Math.PI / 4; // outward edge's angle off the baseline. 0 = along the baseline (invisible), PI/2 = straight out perpendicular (the old "90 degree" look).
const FEATHER_CUT_ANGLE = Math.PI / 6; // inward cut's initial direction off the baseline, right as it leaves the tip. Smaller than FEATHER_SWEEP_ANGLE = cuts back sharply toward the root.
const FEATHER_LENGTH_MAX = 0.34; // tip-most feather's protrusion length
const FEATHER_LENGTH_MIN = 0.14; // root-most feather's protrusion length
const FEATHER_CUT_PULL_1 = 0.55; // control point 1: how far from the tip, along FEATHER_CUT_ANGLE, as a fraction of that feather's own length
const FEATHER_CUT_PULL_2 = 0.35; // control point 2: how far back from the next base point, along the baseline, as a fraction of one baseline segment

function traceWing(context, W, H) {
  context.moveTo(0, 0); // coracoid

  // Leading edge: coracoid -> radiale -> terminal phalanx. This curve's
  // endpoint doubles as feather 1's outward (top) edge.
  context.bezierCurveTo(W * -0.02, -H * 0.10, W * -0.10, -H * 0.32, W * -0.15, -H * 0.50); // -> radiale
  const terminalPhalanx = [W * -1.00, -H * 1.00];
  context.bezierCurveTo(W * -0.32, -H * 0.72, W * -0.68, -H * 0.92, terminalPhalanx[0], terminalPhalanx[1]);

  // Trailing edge: FEATHER_COUNT feathers running from the terminal phalanx
  // to the blade of scapula, the path already sitting at the phalanx. Each
  // feather is a straight outward edge (at FEATHER_SWEEP_ANGLE off that
  // baseline) followed by a bezier cutting back in (starting at
  // FEATHER_CUT_ANGLE, sharper, then smoothing into the next base point).
  // Feather 1 has no outward edge of its own -- whatever curve already ends
  // at the phalanx doubles as its top edge. `bx`/`by` is that feather's own
  // point along the baseline, which every control point is derived from.
  const bladeOfScapula = [W * -0.80, -H * 0.10];
  for (let i = 0; i < FEATHER_COUNT; i++) {
    const p = i / (FEATHER_COUNT - 1);
    const q = 1 - p;
    const bx = terminalPhalanx[0] * q + bladeOfScapula[0] * p;
    const by = terminalPhalanx[1] * q + bladeOfScapula[1] * p;
    context.lineTo(bx, by);
    context.bezierCurveTo(bx * 0.9, by * 0.8 + 6, bx * 0.5, by * 0.8 + 6, bx * 0.5, by * 0.8 + 2);
  }

  // Close: blade of scapula -> coracoid.
  context.bezierCurveTo(W * -0.55, -H * 0.05, W * -0.20, -H * 0.02, 0, 0);
}

const WING_LENGTH = 48;
const WING_WIDTH = 53;

// Draws the wings and the tail together, sorted by their actual orbit3d
// depth, so the tail can land between the two wings (in front of one,
// behind the other) rather than always drawing as one block before or
// after both of them. Matches the depth convention used everywhere else
// in this file (facesCamera / old tailInFront): a mount point faces the
// camera, and so belongs in the foreground pass, exactly when its
// rotatedZ <= 0.
function renderWingsAndTail(context, player, angle, anim, foreground, charge) {
  const items = [-Math.PI * 5 / 8, Math.PI * 5 / 8].map((defaultPlacement) => {
    const [rx, ry, depth] = orbit3d(-9, -10, Math.sin(defaultPlacement) * 29, angle);
    // Raking backward means increasing each wing's own sweep away from its
    // default mount angle, in the direction that default already leans --
    // hence scaling by the mount's own sign rather than a fixed direction.
    const sweepBack = WING_SWEEP_BACK * charge * Math.sign(defaultPlacement);
    return {
      depth,
      // One wing, drawn inline (its only call site): the far wing is a flat
      // silhouette, the near one gets an inset second pass for shading.
      draw: () => {
        const wingAngle = angle - defaultPlacement * 0.15 + sweepBack;
        context.save();
        context.translate(player.x + rx, player.y + ry - Math.sin(anim * 12 + 1.6) * 3.0 + WING_DROP * charge);
        const length = WING_LENGTH * (1 - WING_SHORTEN * charge);
        const WW = WING_WIDTH * (1 + WING_ELONGATE * charge) * Math.cos(wingAngle);
        if (Math.cos(wingAngle) > 0 ^ Math.sign(defaultPlacement) < 0) {
          fillOutlinedShape(context, '#aac', 4, () => traceWing(context, WW, length));
        } else {
          fillOutlinedShape(context, '#fff', 4, () => traceWing(context, WW, length));
          context.save();
          context.scale(0.65, 0.65);
          context.translate(-3, 3);
          // Scale compensates for the 0.6x context so the stroke still renders 9 units wide.
          fillOutlinedShape(context, '#aac', 2 / 0.65, () => traceWing(context, WW, length));
          context.restore();
        }
        context.restore();
      },
    };
  });

  // The tail is mounted opposite the head, straight back, with no
  // left/right offset.
  const [, , tailDepth] = orbit3d(-30, 0, 0, angle);
  items.push({
    depth: tailDepth,
    // The tail, drawn inline (its only call site).
    draw: () => {
      const perspectiveY = 0.6;
      const tweenGamma = 1.5;
      const depth = Math.sin(angle);
      const front = Math.max(depth, 0) ** tweenGamma;
      const hidden = Math.max(-depth, 0) ** tweenGamma;
      const side = 1 - front - hidden;
      const horizontal = Math.cos(angle);
      const sideHorizontal = Math.sign(horizontal) * side;
      const depthY = depth * 5 * perspectiveY;
      const point = (sideX, sideY, frontX, frontY) => {
        const frontYWithPerspective = 5 + (frontY - 5) * perspectiveY;
        return [
          player.x + sideX * sideHorizontal + frontX * front,
          player.y + sideY * side + frontYWithPerspective * front + 12 * hidden
            + depthY - Math.sin(anim * 12 + 0.8) * 3,
        ];
      };

      // How much farther out the tail's far end (everything but its torso
      // attachment point) reaches at charge = 1 -- a streaming-behind-you
      // stretch, not a change to the tail's shape or attachment.
      const stretch = 1 + TAIL_STRETCH * charge;

      // Exchange the two side-view contours after each end-on extreme. At the
      // exchange point their side contribution is zero, so the swap is seamless.
      const swapCurves = horizontal < 0;
      const start = point(-28, -10, 0, 5);
      const topControlA = point(
        (swapCurves ? -52 : -68) * stretch,
        swapCurves ? 15 : -18,
        -18,
        12 * stretch,
      );
      const topControlB = point(
        (swapCurves ? -22 : -35) * stretch,
        swapCurves ? 35 : 15,
        -15,
        42 * stretch,
      );
      const tip = point(-68 * stretch, 20 + Math.sin(anim * 12 + 1.2) * 2, 0, 60 * stretch);
      const bottomControlA = point(
        (swapCurves ? -35 : -22) * stretch,
        swapCurves ? 15 : 35,
        15,
        42 * stretch,
      );
      const bottomControlB = point(
        (swapCurves ? -68 : -52) * stretch,
        swapCurves ? -18 : 15,
        18,
        12 * stretch,
      );

      fillShape(context, '#aac', () => {
        context.moveTo(...start);
        context.bezierCurveTo(...topControlA, ...topControlB, ...tip);
        context.bezierCurveTo(...bottomControlA, ...bottomControlB, ...start);
      });
    },
  });

  items
    .filter((item) => (item.depth <= 0) == foreground)
    .sort((a, b) => b.depth - a.depth) // farthest first, nearest drawn last (on top)
    .forEach((item) => item.draw());
}

function renderTorso(context, player, anim, charge) {
  const heightScale = 0.95 + Math.sin(anim * 12 + 0.4) * 0.05;
  const radiusY = 38 * heightScale * (1 - TORSO_SQUISH_Y * charge);
  const radiusX = 38 * (1 + TORSO_SQUISH_X * charge);
  fillEllipse(context, player.x, player.y + 38 - radiusY, radiusX, radiusY, '#cce');
}

function renderHead(context, angle, headX, headY, snoutX, snoutY, charge) {
  const headRadius = 22;
  const snoutRadius = 13;
  const facesCamera = Math.sin(angle) <= 0;

  if (!facesCamera) renderHorn(context, angle, headX, headY, charge);

  // The tapered band joining the head and snout circles: the two outer
  // tangent lines between them, as one filled quad.
  const dx = snoutX - headX;
  const dy = snoutY - headY;
  const distance = Math.hypot(dx, dy);
  const ux = dx / distance;
  const uy = dy / distance;
  const along = (headRadius - snoutRadius) / distance;
  const across = Math.sqrt(1 - along * along);
  const topX = ux * along + uy * across;
  const topY = uy * along - ux * across;
  const bottomX = ux * along - uy * across;
  const bottomY = uy * along + ux * across;
  fillShape(context, '#fff', () => {
    context.moveTo(headX + topX * headRadius, headY + topY * headRadius);
    context.lineTo(snoutX + topX * snoutRadius, snoutY + topY * snoutRadius);
    context.lineTo(snoutX + bottomX * snoutRadius, snoutY + bottomY * snoutRadius);
    context.lineTo(headX + bottomX * headRadius, headY + bottomY * headRadius);
  });

  renderEars(context, angle, headX, headY, false);
  fillCircle(context, headX, headY, headRadius, '#fff');
  fillCircle(context, snoutX, snoutY, snoutRadius, '#fff');

  // Eyes: both of them while looking forward, otherwise just the visible one.
  (-Math.sin(angle) >= Math.cos(Math.PI / 8) ? [-13, 13] : [Math.cos(angle) >= 0 ? 13 : -13]).forEach((side) => {
    const [x, y] = orbit3d(1, -2, -side, angle);
    fillCircle(context, headX + x, headY + y, 6, '#111');
    fillCircle(context, headX + x + 2, headY + y - 2, 2, '#fff');
  });

  // Nostrils, only while the snout faces the camera.
  if (Math.sin(angle) <= 0) {
    [-4, 4].forEach((side) => {
      const [x, y] = orbit3d(6, 0, -side, angle);
      fillCircle(context, snoutX + x, snoutY + y, 2.5, '#999');
    });
  }

  renderEars(context, angle, headX, headY, true);
  if (facesCamera) renderHorn(context, angle, headX, headY, charge);
}

// A fixed, uncharged head pose for the HUD, using the same face, ears,
// snout and horn as the character in the world.
function renderPlayerPortrait(context, x, y, scale = 1) {
  const angle = -Math.PI / 4;
  const snoutX = Math.cos(angle) * 23;
  const snoutY = 8 - Math.sin(angle) * 14 + (1 - Math.sin(-0.9));
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  renderHead(context, angle, 0, 0, snoutX, snoutY, 0);
  context.restore();
}

// A short-lived ROYGBV ribbon behind the character while charging.
// `trail` is a list of { x, y, t, charge, angle } samples (oldest first,
// already pruned to the last TRAIL_DURATION seconds -- see
// PlayerCharacter's tick()); `time` is the current animation clock. Each
// sample keeps the charge level and heading it was recorded at: charge so
// the trail fades in and out smoothly along with charge itself (not just
// age), heading so each stripe's sideways offset (via zPosition) matches
// how the character was actually facing at that point along the path.
function renderTrail(context, trail, time) {
  if (trail.length < 2) return;
  context.save();
  const opacity = context.globalAlpha;
  context.lineWidth = TRAIL_STRIPE_WIDTH;

  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const age = time - b.t;
    const alpha = Math.max(0, 1 - age / TRAIL_DURATION) * b.chg;
    if (alpha <= 0.01) continue;

    context.globalAlpha = opacity * alpha;
    TRAIL_STRIPE_COLORS.forEach((color, stripeIndex) => {
      const offset = (stripeIndex - (TRAIL_STRIPE_COLORS.length - 1) / 2) * TRAIL_STRIPE_SPACING;
      const [ax, ay] = zPosition(a.a, a.x, a.y, offset);
      const [bx, by] = zPosition(b.a, b.x, b.y, offset);
      context.strokeStyle = color;
      context.beginPath();
      context.moveTo(ax, ay);
      context.lineTo(bx, by);
      context.stroke();
    });
  }
  context.restore();
}

function renderPlayer(context, player, anim, charge, trail) {
  renderTrail(context, trail, anim);

  const angle = player.a;
  const headForward = 21 + HEAD_LEAN_FORWARD * charge;
  const headX = player.x + Math.cos(angle) * headForward;
  const headY = player.y - 14 + HEAD_DROP * charge - Math.sin(angle) * 5
    + (1 - Math.sin(anim * 12)) * 3;
  const snoutForward = 23 - SNOUT_CLOSER * charge;
  const snoutX = headX + Math.cos(angle) * snoutForward;
  const snoutY = headY + 8 + SNOUT_DROP * charge - Math.sin(angle) * 14
    + (1 - Math.sin(anim * 12 - 0.9));

  renderWingsAndTail(context, player, angle, anim, false, charge);
  // A plain `sin(angle) > 0` flips the draw order right at angle = 0/180 --
  // exactly the dead-on side profile where the head/torso silhouettes
  // overlap most, so the pop is at its most visible. HEAD_BEHIND_BUFFER
  // holds the previous order for a few degrees past each crossing instead.
  if (angle > HEAD_BEHIND_BUFFER && angle < Math.PI - HEAD_BEHIND_BUFFER) {
    renderHead(context, angle, headX, headY, snoutX, snoutY, charge);
    renderTorso(context, player, anim, charge);
  } else {
    renderTorso(context, player, anim, charge);
    renderHead(context, angle, headX, headY, snoutX, snoutY, charge);
  }
  renderWingsAndTail(context, player, angle, anim, true, charge);
}

function PlayerCharacter(x = 0, y = 0, angle = 0) {
  let anim = 0;
  let damageFlashTimer = 0;
  let damageCanvas;
  let trail = []; // recent { x, y, t, chg, a } samples, for renderTrail -- see tick()

  return {
    x,
    y,
    a: angle, // heading, radians
    vx: 0,
    vy: 0,
    hp: 5,
    maxHp: 5,
    shields: 0, // bubble shield charges
    // Driven by DragController while the player is aiming a launch.
    aiming: false,
    targetAngle: angle,
    // Charge: smoothed 0..1 "how fast am I currently going" -- see the
    // CHARGE_SPEED_REF/CHARGE_EASE_RATE comment above.
    chg: 0,
    // Item-ability stats -- see ItemAbility.js for what grants each of
    // these. Plain defaults so every reader (input.js, Grub.js, this
    // file's own tick) can use the field directly, no `|| default`
    // fallback needed anywhere.
    boostPower: 1, // multiplies a drag-launch's impulse magnitude (Valkyrie Wings)
    horn: 0, // added to every charging-hit damage roll (Mithril Horn)
    hoof: false, // impact hits chain lightning to two more enemies (Chromatic Hoof)
    oracleEyes: false, // reveals MiniMap.js's HUD (Oracle Eyes)
    // Draw order keyed off y, recomputed every tick -- see CubeObstacle.js
    // for why (same painter's-algorithm depth illusion), but a moving puck
    // needs it refreshed every frame rather than set once.
    z: y,
    r: PLAYER_RADIUS, // collision radius
    tags: [TAG_PLAYER],

    // A bubble shield absorbs the hit instead of hp (see addBubbleShield),
    // but otherwise takes it exactly like a normal hit -- same flash, same
    // splats, same sound. Stacking (shields--) and the protective
    // bubble's own render() are the only things that make a shielded hit
    // different from an ordinary one.
    takeDamage(amount = 1) {
      if (amount <= 0 || this.hp <= 0) return;
      if (this.shields > 0) this.shields--;
      else this.hp = Math.max(0, this.hp - amount);
      damageFlashTimer = DAMAGE_FLASH_DURATION;
      // Same disk-sampling shape as Grub's own fireSplats (sqrt(rng()) for
      // uniform area density, not just uniform radius), but plain
      // Math.random() since the player isn't seeded the way patrol grubs are.
      DAMAGE_SPLAT_COLORS.forEach((color) => {
        const angle = Math.random() * TAU;
        const speed = Math.sqrt(Math.random()) * DAMAGE_SPLAT_SPEED_MAX;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        const size = DAMAGE_SPLAT_SIZE_MIN + Math.random() * (DAMAGE_SPLAT_SIZE_MAX - DAMAGE_SPLAT_SIZE_MIN);
        const arcHeight = Math.hypot(vx, vy) * (DAMAGE_SPLAT_ARC_HEIGHT_TIME_MIN
          + Math.random() * (DAMAGE_SPLAT_ARC_HEIGHT_TIME_MAX - DAMAGE_SPLAT_ARC_HEIGHT_TIME_MIN));
        add(SplatEffect(this.x, this.y, vx, vy, color, size, arcHeight));
      });
      playPlayerDamage();
    },

    addBubbleShield() {
      if (this.hp > 0) this.shields++;
    },

    // Returns the actual amount healed (0 if already dead or already at
    // maxHp) -- callers use that to decide whether a pickup actually did
    // anything before consuming it.
    heal(amount = 1) {
      if (amount <= 0 || this.hp <= 0) return 0;
      const healed = Math.min(amount, this.maxHp - this.hp);
      this.hp += healed;
      return healed;
    },

    tick(dt) {
      anim += dt;
      damageFlashTimer = Math.max(0, damageFlashTimer - dt);

      const speed = Math.hypot(this.vx, this.vy);

      const targetCharge = Math.min(Math.max((speed - CHARGE_MIN_SPEED) / (CHARGE_MAX_SPEED - CHARGE_MIN_SPEED), 0), 1);
      this.chg += (targetCharge - this.chg) * (1 - Math.exp(-CHARGE_EASE_RATE * dt));

      trail.push({
        x: this.x, y: this.y, t: anim, chg: this.chg, a: this.a,
      });
      while (trail.length && anim - trail[0].t > TRAIL_DURATION) trail.shift();

      if (this.aiming) {
        const ease = 1 - Math.exp(-AIM_EASE_RATE * dt);
        const delta = normalizeAngle(this.targetAngle - this.a);
        this.a = normalizeAngle(this.a + delta * ease);
      } else if (speed > MIN_SPEED_FOR_HEADING) {
        // Screen/world y points down, but rendering treats a larger angle
        // as swinging the head upward (see headY above), so the heading
        // that matches a given velocity needs its y-component negated.
        const targetAngle = Math.atan2(-this.vy, this.vx);
        const easeRate = HEADING_EASE_MIN + HEADING_EASE_PER_SPEED * speed;
        const ease = 1 - Math.exp(-easeRate * dt);
        const delta = normalizeAngle(targetAngle - this.a);
        this.a = normalizeAngle(this.a + delta * ease);
      }

      // Above the same speed that starts the charging pose, drag
      // quintuples -- reads as air resistance actually fighting back once
      // you're really moving, rather than a flat decay throughout.
      const decay = Math.exp(-(speed < CHARGE_MIN_SPEED ? DRAG : CHARGING_DRAG) * dt);
      this.vx *= decay;
      this.vy *= decay;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Obstacles are static. Every contact is found against (and every
      // hit callback sees) this pre-bounce snapshot; pushes accumulate so
      // simultaneous contacts at a wall seam never double the correction.
      const body = { ...this };
      getObjectsByTag(TAG_OBSTACLE).forEach((obstacle) => {
        const hit = contact(body, obstacle);
        if (!hit) return;
        if (obstacle.hit?.(body)) remove(obstacle);
        const [nx, ny, penetration] = hit;
        const push = Math.max(0, penetration + (this.x - body.x) * nx + (this.y - body.y) * ny);
        this.x -= nx * push;
        this.y -= ny * push;
        const impact = Math.max(0, this.vx * nx + this.vy * ny) * (1 + RESTITUTION);
        this.vx -= nx * impact;
        this.vy -= ny * impact;
        if (!obstacle.tags.includes(TAG_ENEMY)) {
          // Grub.js plays its own hit sound, so a plain enemy bump stays
          // silent rather than doubling up on the wall-bounce sound.
          if (impact >= WALL_BOUNCE_SOUND_MIN_SPEED) playWallBounce(impact);
        }
      });
      this.z = this.y;
    },

    render(context) {
      if (damageFlashTimer <= 0) {
        renderPlayer(context, this, anim, this.chg, trail);
        if (this.shields > 0) renderBubbleShield(context, this.x, this.y - 12, this.r * 1.65);
        return;
      }
      // Tint an isolated character silhouette so the red pulse covers all
      // body parts without coloring the background or the rainbow trail.
      if (!damageCanvas) {
        damageCanvas = document.createElement('canvas');
        damageCanvas.width = damageCanvas.height = DAMAGE_CANVAS_SIZE;
        const c = damageCanvas.getContext('2d');
        c.lineCap = c.lineJoin = 'round';
      }
      const tintContext = damageCanvas.getContext('2d');
      const center = DAMAGE_CANVAS_SIZE / 2;
      renderTrail(context, trail, anim);
      tintContext.clearRect(0, 0, DAMAGE_CANVAS_SIZE, DAMAGE_CANVAS_SIZE);
      tintContext.save();
      renderPlayer(tintContext, { ...this, x: center, y: center }, anim, this.chg, []);
      tintContext.globalCompositeOperation = 'source-atop';
      tintContext.globalAlpha = Math.sin(damageFlashTimer / DAMAGE_FLASH_DURATION * Math.PI / 2);
      tintContext.fillStyle = '#f22';
      tintContext.fillRect(0, 0, DAMAGE_CANVAS_SIZE, DAMAGE_CANVAS_SIZE);
      tintContext.restore();
      context.drawImage(damageCanvas, this.x - center, this.y - center);
      if (this.shields > 0) renderBubbleShield(context, this.x, this.y - 12, this.r * 1.65);
    },
  };
}

export default PlayerCharacter;
export { PLAYER_RADIUS, renderPlayer, renderPlayerPortrait, traceWing };
