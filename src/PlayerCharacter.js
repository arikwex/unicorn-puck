import { normalizeAngle } from './physics.js';
import { TAG_PLAYER, TAG_PUCK } from './tags.js';

const TAU = Math.PI * 2;

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

// `charge` is a smoothed 0..1 read of how fast the player is currently
// moving, driving every "charging forward" render tweak below (squish,
// head/horn lean, wing sweep, rainbow horn, trail). It stays 0 below
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

// The horn's rainbow while charging shows the full hue spectrum along its
// own length at once (see hornRainbowGradient), and that pattern scrolls
// over time rather than sitting still. The trail left behind cycles hue
// over time too. Both keyed off the character's own running animation
// clock so they're always in motion, not just active/inactive.
const HORN_HUE_SPEED = 220; // deg/s the gradient scrolls along the horn
const TRAIL_DURATION = 0.5; // seconds a trail sample stays visible
const TRAIL_HUE_SPEED = 260; // deg/s
const TRAIL_LINE_WIDTH = 30; // px, tapered by its own fade

function fillCircle(context, x, y, radius, color) {
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.fill();
}

function fillEllipse(context, x, y, radiusX, radiusY, color) {
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(x, y, radiusX, radiusY, 0, 0, TAU);
  context.fill();
}

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
  context.lineJoin = 'round';
  context.lineCap = 'round';
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

function earFacesCamera(angle, offset) {
  return -Math.sin(angle) + Math.sign(offset) * Math.cos(angle) >= 0;
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

function traceHornStripe(context, halfWidth, y) {
  context.moveTo(-halfWidth, y);
  context.lineTo(halfWidth, y - 4);
  context.lineTo(halfWidth, y - 1);
  context.lineTo(-halfWidth, y + 3);
}

// Fills `trace` with `baseColor`, then -- if charge > 0 -- fills it again
// with `rainbowStyle` (a color or gradient) at globalAlpha = charge, so
// the rainbow fades smoothly in and out with charge instead of snapping on.
function fillRainbowBlend(context, charge, baseColor, rainbowStyle, trace) {
  fillShape(context, baseColor, trace);
  if (charge > 0) {
    context.globalAlpha = charge;
    fillShape(context, rainbowStyle, trace);
    context.globalAlpha = 1;
  }
}

// The full hue spectrum spread along the horn's own length (base to tip)
// at once, rather than one color at a time -- `hueOffset` shifts where
// each hue sits along that length, so animating it scrolls the whole
// rainbow pattern rather than just rotating a single flat color.
function hornRainbowGradient(context, length, hueOffset) {
  const gradient = context.createLinearGradient(0, 0, 0, -length);
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const hue = (t * 360 + hueOffset) % 360;
    gradient.addColorStop(t, `hsl(${hue}, 85%, 65%)`);
  }
  return gradient;
}

function renderHorn(context, angle, headX, headY, charge, anim) {
  const baseX = headX + Math.cos(angle) * 8;
  const baseY = headY - 13 - Math.sin(angle) * 6;
  const dx = Math.cos(angle) * (14 + HORN_LEAN_FORWARD * charge);
  const dy = -20 + HORN_LEAN_FLATTEN * charge - Math.sin(angle) * 4;
  const length = Math.hypot(dx, dy);
  const halfWidth = 4;
  const hueOffset = (anim * HORN_HUE_SPEED) % 360;

  context.save();
  context.translate(baseX, baseY);
  context.rotate(Math.atan2(dx, -dy));
  context.scale(2, 2);
  fillRainbowBlend(
    context,
    charge,
    '#ec6',
    hornRainbowGradient(context, length, hueOffset),
    () => traceHorn(context, halfWidth, length),
  );

  context.beginPath();
  traceHorn(context, halfWidth, length);
  context.closePath();
  context.clip();

  for (let y = -4; y > -length; y -= 8) {
    const hue = (Math.min(1, -y / length) * 360 + hueOffset) % 360;
    fillRainbowBlend(context, charge, '#c94', `hsl(${hue}, 80%, 40%)`, () => traceHornStripe(context, halfWidth, y));
  }
  context.restore();
}

function renderEar(context, angle, headX, headY, offset) {
  const facesCamera = earFacesCamera(angle, offset);
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
}

function renderEars(context, angle, headX, headY, foreground) {
  const spacing = 10;
  [-spacing, spacing].forEach((offset) => {
    if (earFacesCamera(angle, offset) === foreground) {
      renderEar(context, angle, headX, headY, offset);
    }
  });
}

function renderConnector(context, headX, headY, headRadius, snoutX, snoutY, snoutRadius) {
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
}

function renderEyes(context, angle, headX, headY) {
  const lookingForward = -Math.sin(angle) >= Math.cos(Math.PI / 8);
  const sides = lookingForward
    ? [-13, 13]
    : [Math.cos(angle) >= 0 ? 13 : -13];
  const eyePlaneX = headX + Math.cos(angle);
  const eyePlaneY = headY - Math.sin(angle) - 2;

  sides.forEach((side) => {
    const [eyeX, eyeY] = zPosition(angle, eyePlaneX, eyePlaneY, side);
    fillCircle(context, eyeX, eyeY, 6, '#111');
    fillCircle(context, eyeX + 2, eyeY - 2, 2, '#fff');
  });
}

function renderNostrils(context, angle, snoutX, snoutY) {
  if (Math.sin(angle) > 0) return;

  const nostrilX = snoutX + Math.cos(angle) * 6;
  const nostrilY = snoutY - Math.sin(angle) * 6;
  const gap = 8;
  fillCircle(context, nostrilX - gap / 2, nostrilY, 2.5, '#999');
  fillCircle(context, nostrilX + gap / 2, nostrilY, 2.5, '#999');
}

function renderTail(context, player, angle, anim, charge) {
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

function rotate(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

// Traces the trailing edge as FEATHER_COUNT feathers running from `from`
// (the terminal phalanx) to `to` (the blade of scapula), assuming the
// current path position is already at `from`. Each feather is a straight
// outward edge (at FEATHER_SWEEP_ANGLE off the from->to baseline) followed
// by a bezier cutting back in (starting at FEATHER_CUT_ANGLE, sharper, then
// smoothing into the next base point). Feather 1 has no outward edge of its
// own -- whatever curve already ends at `from` doubles as its top edge.
function traceFeathers(context, from, to) {
  for (let i = 0; i < FEATHER_COUNT; i++) {
    const p = i / (FEATHER_COUNT - 1);
    const q = 1 - p;
    const tipX = from[0] * q + to[0] * p;
    const tipY = from[1] * q + to[1] * p;
    const innerX = (from[0] * q + to[0] * p) * 0.5;
    const innerY = (from[1] * q + to[1] * p) * 0.8 + 2;
    const curve1X = (from[0] * q + to[0] * p) * 0.9;
    const curve1Y = (from[1] * q + to[1] * p)  * 0.8 + 6;
    const curve2X = (from[0] * q + to[0] * p) * 0.5;
    const curve2Y = (from[1] * q + to[1] * p) * 0.8 + 6;
    context.lineTo(tipX, tipY);
    context.bezierCurveTo(curve1X, curve1Y, curve2X, curve2Y, innerX, innerY);
  }

  // const baseline = [to[0] - from[0], to[1] - from[1]];
  // const baselineLength = Math.hypot(baseline[0], baseline[1]);
  // const baselineDir = [baseline[0] / baselineLength, baseline[1] / baselineLength];

  // // Perpendicular to the baseline, pointing away from the wing's interior
  // // (away from the coracoid, which sits at the origin).
  // const [perpX, perpY] = rotate(baselineDir[0], baselineDir[1], Math.PI / 2);
  // const midpoint = [from[0] + baseline[0] / 2, from[1] + baseline[1] / 2];
  // const outwardSign = (midpoint[0] * perpX + midpoint[1] * perpY) > 0 ? 1 : -1;

  // const [featherX, featherY] = rotate(baselineDir[0], baselineDir[1], outwardSign * FEATHER_SWEEP_ANGLE);
  // const [cutX, cutY] = rotate(baselineDir[0], baselineDir[1], outwardSign * FEATHER_CUT_ANGLE);

  // for (let i = 0; i < FEATHER_COUNT; i++) {
  //   const baseStart = [
  //     from[0] + baseline[0] * (i / FEATHER_COUNT),
  //     from[1] + baseline[1] * (i / FEATHER_COUNT),
  //   ];
  //   const baseEnd = [
  //     from[0] + baseline[0] * ((i + 1) / FEATHER_COUNT),
  //     from[1] + baseline[1] * ((i + 1) / FEATHER_COUNT),
  //   ];
  //   const lengthFraction = FEATHER_LENGTH_MAX
  //     + (FEATHER_LENGTH_MIN - FEATHER_LENGTH_MAX) * (i / (FEATHER_COUNT - 1));
  //   const length = lengthFraction * baselineLength;

  //   // Feather 1's tip is `from` itself -- whatever curve already ends
  //   // there doubles as its outward edge, so there's nothing to draw here.
  //   const tip = i === 0 ? from : [baseStart[0] + featherX * length, baseStart[1] + featherY * length];
  //   if (i > 0) context.lineTo(tip[0], tip[1]);

  //   const control1 = [tip[0] + cutX * length * FEATHER_CUT_PULL_1, tip[1] + cutY * length * FEATHER_CUT_PULL_1];
  //   const control2 = [
  //     baseEnd[0] - baselineDir[0] * (baselineLength / FEATHER_COUNT) * FEATHER_CUT_PULL_2,
  //     baseEnd[1] - baselineDir[1] * (baselineLength / FEATHER_COUNT) * FEATHER_CUT_PULL_2,
  //   ];
  //   context.bezierCurveTo(control1[0], control1[1], control2[0], control2[1], baseEnd[0], baseEnd[1]);
  // }
}

function traceWing(context, W, H) {
  context.moveTo(0, 0); // coracoid

  // Leading edge: coracoid -> radiale -> terminal phalanx. This curve's
  // endpoint doubles as feather 1's outward (top) edge.
  context.bezierCurveTo(W * -0.02, -H * 0.10, W * -0.10, -H * 0.32, W * -0.15, -H * 0.50); // -> radiale
  const terminalPhalanx = [W * -1.00, -H * 1.00];
  context.bezierCurveTo(W * -0.32, -H * 0.72, W * -0.68, -H * 0.92, terminalPhalanx[0], terminalPhalanx[1]);

  const bladeOfScapula = [W * -0.80, -H * 0.10];
  traceFeathers(context, terminalPhalanx, bladeOfScapula);

  // Close: blade of scapula -> coracoid.
  context.bezierCurveTo(W * -0.55, -H * 0.05, W * -0.20, -H * 0.02, 0, 0);
}

const WING_LENGTH = 48;
const WING_WIDTH = 53;

function renderWingShape(context, pivotX, pivotY, angle, wingDir, charge) {
  context.save();
  context.translate(pivotX, pivotY);
  const length = WING_LENGTH * (1 - WING_SHORTEN * charge);
  const WW = WING_WIDTH * (1 + WING_ELONGATE * charge) * Math.cos(angle);

  if (Math.cos(angle) > 0 ^ wingDir) {
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
}

function orbit3d(x, y, z, angle) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const rotatedX = x * cosA - z * sinA;
  const rotatedZ = x * sinA + z * cosA;
  return [rotatedX, y - rotatedZ * 0.4, rotatedZ];
}

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
      draw: () => renderWingShape(
        context,
        player.x + rx,
        player.y + ry - Math.sin(anim * 12 + 1.6) * 3.0 + WING_DROP * charge,
        angle - defaultPlacement * 0.15 + sweepBack,
        Math.sign(defaultPlacement) < 0,
        charge,
      ),
    };
  });

  // The tail is mounted opposite the head, straight back, with no
  // left/right offset.
  const [, , tailDepth] = orbit3d(-30, 0, 0, angle);
  items.push({ depth: tailDepth, draw: () => renderTail(context, player, angle, anim, charge) });

  items
    .filter((item) => (item.depth <= 0) === foreground)
    .sort((a, b) => b.depth - a.depth) // farthest first, nearest drawn last (on top)
    .forEach((item) => item.draw());
}

function renderTorso(context, player, anim, charge) {
  const heightScale = 0.95 + Math.sin(anim * 12 + 0.4) * 0.05;
  const radiusY = 38 * heightScale * (1 - TORSO_SQUISH_Y * charge);
  const radiusX = 38 * (1 + TORSO_SQUISH_X * charge);
  fillEllipse(context, player.x, player.y + 38 - radiusY, radiusX, radiusY, '#cce');
}

function renderHead(context, angle, headX, headY, snoutX, snoutY, charge, anim) {
  const headRadius = 22;
  const snoutRadius = 13;
  const facesCamera = Math.sin(angle) <= 0;

  if (!facesCamera) renderHorn(context, angle, headX, headY, charge, anim);
  renderConnector(context, headX, headY, headRadius, snoutX, snoutY, snoutRadius);
  renderEars(context, angle, headX, headY, false);
  fillCircle(context, headX, headY, headRadius, '#fff');
  fillCircle(context, snoutX, snoutY, snoutRadius, '#fff');
  renderEyes(context, angle, headX, headY);
  renderNostrils(context, angle, snoutX, snoutY);
  renderEars(context, angle, headX, headY, true);
  if (facesCamera) renderHorn(context, angle, headX, headY, charge, anim);
}

// A short-lived, fading, hue-cycling ribbon behind the character while
// charging. `trail` is a list of { x, y, t, charge } samples (oldest
// first, already pruned to the last TRAIL_DURATION seconds -- see
// PlayerCharacter's update()); `time` is the current animation clock.
// Each sample keeps the charge level it was recorded at, so the trail
// fades in and out smoothly along with charge itself, not just with age.
function renderTrail(context, trail, time) {
  if (trail.length < 2) return;
  context.lineCap = 'round';
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const age = time - b.t;
    const alpha = Math.max(0, 1 - age / TRAIL_DURATION) * b.charge;
    if (alpha <= 0.01) continue;
    const hue = (b.t * TRAIL_HUE_SPEED) % 360;
    context.strokeStyle = `hsla(${hue}, 90%, 60%, ${alpha})`;
    context.lineWidth = TRAIL_LINE_WIDTH * alpha;
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
}

function renderPlayer(context, player, anim, charge, trail) {
  renderTrail(context, trail, anim);

  const angle = player.angle;
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
    renderHead(context, angle, headX, headY, snoutX, snoutY, charge, anim);
    renderTorso(context, player, anim, charge);
  } else {
    renderTorso(context, player, anim, charge);
    renderHead(context, angle, headX, headY, snoutX, snoutY, charge, anim);
  }
  renderWingsAndTail(context, player, angle, anim, true, charge);
}

// Puck-like character properties. `mass`, `radius`, and `bounciness` are
// the shape/weight of the puck; `viscosity` and `angularViscosity` are
// multipliers (default 1 = the baseline damping rates in physics.js) on
// top of that baseline, so tuning a character's "floatiness" only ever
// means tuning a multiplier.
function PlayerCharacter(x = 0, y = 0, angle = 0, props = {}) {
  let anim = 0;
  let trail = []; // recent { x, y, t, charge } samples, for renderTrail -- see update()
  const {
    mass = 1,
    radius = 38,
    viscosity = 1,
    angularViscosity = 1,
    bounciness = 0.55, // < 1: bounces off obstacles lose some energy
  } = props;

  return {
    x,
    y,
    angle,
    vx: 0,
    vy: 0,
    omega: 0,
    // Driven by DragController while the player is aiming a launch.
    aiming: false,
    targetAngle: angle,
    // Smoothed 0..1 "how fast am I currently going" -- see the
    // CHARGE_SPEED_REF/CHARGE_EASE_RATE comment above.
    charge: 0,
    // Draw order keyed off y, recomputed every update -- see CubeObstacle.js
    // for why (same painter's-algorithm depth illusion), but a moving puck
    // needs it refreshed every frame rather than set once.
    order: y,
    mass,
    radius,
    viscosity,
    angularViscosity,
    bounciness,
    tags: [TAG_PLAYER, TAG_PUCK],

    // Consistent puck-like accessor (see CubeObstacle.js and physics.js):
    // returns the live state itself, so collision resolution mutates the
    // character directly.
    puck() {
      return this;
    },

    update(dt) {
      anim += dt;
      this.order = this.y;

      const speed = Math.hypot(this.vx, this.vy);
      // Above the same speed that starts the charging pose, drag triples --
      // reads as air resistance actually fighting back once you're really
      // moving, rather than a flat, speed-independent decay throughout.
      this.viscosity = speed >= CHARGE_MIN_SPEED ? 5 : 1;

      const targetCharge = Math.min(Math.max((speed - CHARGE_MIN_SPEED) / (CHARGE_MAX_SPEED - CHARGE_MIN_SPEED), 0), 1);
      this.charge += (targetCharge - this.charge) * (1 - Math.exp(-CHARGE_EASE_RATE * dt));

      trail.push({
        x: this.x, y: this.y, t: anim, charge: this.charge,
      });
      while (trail.length && anim - trail[0].t > TRAIL_DURATION) trail.shift();

      if (this.aiming) {
        const ease = 1 - Math.exp(-AIM_EASE_RATE * dt);
        const delta = normalizeAngle(this.targetAngle - this.angle);
        this.angle = normalizeAngle(this.angle + delta * ease);
      } else if (speed > MIN_SPEED_FOR_HEADING) {
        // Screen/world y points down, but rendering treats a larger angle
        // as swinging the head upward (see headY above), so the heading
        // that matches a given velocity needs its y-component negated.
        const targetAngle = Math.atan2(-this.vy, this.vx);
        const easeRate = HEADING_EASE_MIN + HEADING_EASE_PER_SPEED * speed;
        const ease = 1 - Math.exp(-easeRate * dt);
        const delta = normalizeAngle(targetAngle - this.angle);
        this.angle = normalizeAngle(this.angle + delta * ease);
      }
    },

    render(context) {
      renderPlayer(context, this, anim, this.charge, trail);
    },
  };
}

export default PlayerCharacter;
