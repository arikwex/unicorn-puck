import { canvas } from './canvas.js';
import { getObjectsByTag } from './engine.js';
import { playLaunch } from './sounds.js';
import { TAG_CAMERA } from './tags.js';

const MAX_LINEAR_IMPULSE = 1800;
// Distance (world units) that reaches max impulse, and how sharply the
// response curves toward it. A power > 1 widens the dynamic range: a short
// drag lands well below a proportional share of max impulse (launches
// noticeably slower), while the response ramps up steeply as the drag
// approaches IMPULSE_DISTANCE_REF (launches noticeably faster) -- so the
// drag distance actually reads as speed control instead of everything past
// a small flick feeling about the same.
const IMPULSE_DISTANCE_REF = 150;
const IMPULSE_RESPONSE_POWER = 2; // quadratic in drag-indicator length
const LINE_WIDTH = 12; // fixed -- the indicator is always this thick, regardless of drag magnitude
const ARROW_LINE_LENGTH = 16;
const ARROW_ANGLE = Math.PI / 4; // each arrowhead stroke splays 45deg off the main line's direction
const SEGMENT_LENGTH = 8; // px per hue-gradient slice along the line
const HUE_PER_DISTANCE = 0.5; // degrees of hue per px traveled along the line
// Degrees/sec the hidden hue animator spins at once the drag reaches
// HUE_LENGTH_REF in length -- negative so it runs the opposite way from the
// spatial (per-px) gradient. Below that length it spins proportionally
// slower. Only this *rate* depends on drag length; the animator's own
// value is always integrated forward from wherever it already was, so
// changing the drag length changes how fast the hue moves next, not where
// it suddenly jumps to.
const HUE_ROTATION_RATE_AT_MAX_LENGTH = -360;
const HUE_LENGTH_REF = 220;

function normalizeHue(hue) {
  return ((hue % 360) + 360) % 360;
}

function linearImpulseMagnitude(distance) {
  const t = Math.min(Math.max(distance / IMPULSE_DISTANCE_REF, 0), 1);
  return Math.pow(t, IMPULSE_RESPONSE_POWER) * MAX_LINEAR_IMPULSE;
}

function rotate(x, y, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos - y * sin, x * sin + y * cos];
}

// Renders the drag as a straight, solid-fixed-width line between the supplied
// screen-space endpoints, capped with a plain two-stroke arrowhead (each
// stroke 45deg off the line) pointing in the launch direction. Hue is a
// gradient along the line's length, offset by `hueAnimator` -- a value the
// caller integrates forward over time at a drag-length-dependent rate, so
// the color keeps drifting even while the pointer holds still.
function renderDragIndicator(context, start, end, hueAnimator) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const ux = dx / length;
  const uy = dy / length;

  context.lineWidth = LINE_WIDTH;

  const segments = Math.max(1, Math.ceil(length / SEGMENT_LENGTH));
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const hue = normalizeHue(length * ((t0 + t1) / 2) * HUE_PER_DISTANCE + hueAnimator);
    context.strokeStyle = `hsl(${hue}, 90%, 60%)`;
    context.beginPath();
    context.moveTo(start.x + dx * t0, start.y + dy * t0);
    context.lineTo(start.x + dx * t1, start.y + dy * t1);
    context.stroke();
  }

  const tipHue = normalizeHue(length * HUE_PER_DISTANCE + hueAnimator);
  context.strokeStyle = `hsl(${tipHue}, 90%, 60%)`;
  [ARROW_ANGLE, -ARROW_ANGLE].forEach((angle) => {
    const [backX, backY] = rotate(-ux, -uy, angle);
    context.beginPath();
    context.moveTo(end.x, end.y);
    context.lineTo(end.x + backX * ARROW_LINE_LENGTH, end.y + backY * ARROW_LINE_LENGTH);
    context.stroke();
  });
}

// Click-and-drag (mouse) / touch-and-drag impulse control, driven entirely
// through Pointer Events so the same code path handles desktop and mobile.
function DragController(player) {
  let dragging = false;
  let pointerId;
  let hueAnimator = 0; // hidden animator value driving the indicator's hue; only its rate depends on drag length
  // Screen-space (canvas pixel) points. Deliberately *not* converted to
  // world space as they're captured: the camera keeps easing toward the
  // player between pointer-move samples, so a world-space conversion done
  // frame-by-frame bakes that camera drift into the recorded gesture,
  // making the aim feel like it's fighting the camera. Converting only the
  // final start/end delta once, after the drag ends, keeps the gesture
  // purely screen-space.
  let start = null;
  let current = null;

  function screenPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function currentZoom() {
    const camera = getObjectsByTag(TAG_CAMERA)[0];
    return camera ? camera.zoom : 1;
  }

  function onPointerDown(event) {
    if (dragging) return;
    dragging = true;
    pointerId = event.pointerId;
    canvas.setPointerCapture?.(pointerId);
    start = current = screenPoint(event.clientX, event.clientY);
    player.aiming = true;
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    current = screenPoint(event.clientX, event.clientY);
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    player.aiming = false;

    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const screenDistance = Math.hypot(dx, dy);
    if (screenDistance > 0) {
      const zoom = currentZoom();
      // Direction is preserved going from screen space to world space (the
      // camera only translates and scales, never rotates or flips), so
      // only the magnitude needs the /zoom correction.
      const worldDistance = screenDistance / zoom;
      // Valkyrie Wings raises player.boostPower above its default 1,
      // scaling the whole launch curve (including its cap) proportionally.
      const magnitude = linearImpulseMagnitude(worldDistance) * player.boostPower;
      const impulseX = (dx / screenDistance) * magnitude;
      const impulseY = (dy / screenDistance) * magnitude;
      player.vx += impulseX;
      player.vy += impulseY;
      playLaunch(magnitude / MAX_LINEAR_IMPULSE);
    }

    start = current = null;
  }

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown);
  addEventListener('pointermove', onPointerMove);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerUp);

  return {
    // A fresh game (fresh player) gets a fresh DragController, so the
    // previous one's listeners must come off -- otherwise every restart
    // stacks another set of global pointer handlers onto a stale player.
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerup', onPointerUp);
      removeEventListener('pointercancel', onPointerUp);
    },

    update(dt) {
      if (!dragging) return;
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const length = Math.hypot(dx, dy);
      if (length > 1) {
        // Direction is preserved going from screen space to world space, and
        // PlayerCharacter's heading convention negates y (see its
        // targetAngle comment), so this matches the direction the launch
        // arrow is actually drawn in.
        player.targetAngle = Math.atan2(-dy, dx);
      }
      const lengthRatio = Math.min(Math.max(length / HUE_LENGTH_REF, 0), 1);
      hueAnimator += HUE_ROTATION_RATE_AT_MAX_LENGTH * lengthRatio * dt;
    },

    // A HUD element, not a world-space render: `order` only sorts among
    // other world objects, and this scene's dungeons commonly have world-y
    // (and therefore `.order`) values well past 1000, so drawing this in
    // the ordinary render pass could still land underneath something. The
    // renderHUD pass always runs after every world object is drawn, so
    // this is guaranteed on top instead of merely "probably high enough".
    renderHUD(context) {
      if (!dragging) return;
      // Anchor to the player's current screen position, while the gesture
      // stays relative to the original click, independent of camera motion.
      // renderHUD runs with an identity transform, so the camera's own
      // translate/scale/translate (see Camera.set()) is replicated by hand
      // instead of reading it off the context.
      const camera = getObjectsByTag(TAG_CAMERA)[0];
      const zoom = camera ? camera.zoom : 1;
      const cameraX = camera ? camera.x : 0;
      const cameraY = camera ? camera.y : 0;
      const origin = {
        x: canvas.width / 2 + (player.x - cameraX) * zoom,
        y: canvas.height / 2 + (player.y - cameraY) * zoom,
      };
      const end = {
        x: origin.x + current.x - start.x,
        y: origin.y + current.y - start.y,
      };
      renderDragIndicator(context, origin, end, hueAnimator);
    },
  };
}

export default DragController;
