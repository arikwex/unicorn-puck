import { canvas } from './canvas.js';
import { getObjectsByTag } from './engine.js';
import { playLaunch } from './sounds.js';
import { TAG_CAMERA } from './tags.js';

const MAX_LINEAR_IMPULSE = 1800;
// Distance (world units) that reaches max impulse. The response is
// quadratic in drag length: a short drag lands well below a proportional
// share of max impulse (launches noticeably slower), while the response
// ramps up steeply as the drag approaches IMPULSE_DISTANCE_REF (launches
// noticeably faster) -- so the drag distance actually reads as speed
// control instead of everything past a small flick feeling about the same.
const IMPULSE_DISTANCE_REF = 150;
const LINE_WIDTH = 12; // fixed -- the indicator is always this thick, regardless of drag magnitude
const ARROW_BACK = 16 * Math.SQRT1_2; // each 16px arrowhead stroke splays 45deg off the line
const SEGMENT_LENGTH = 8; // px per hue-gradient slice along the line
const HUE_PER_DISTANCE = 0.5; // degrees of hue per px traveled along the line
const HUE_RATE = -0.36; // degrees per millisecond (-360/s), opposite the spatial gradient

// Click-and-drag (mouse) / touch-and-drag impulse control, driven entirely
// through Pointer Events so the same code path handles desktop and mobile.
// Handlers are the canvas's own on* properties (plus pointer capture, so a
// drag keeps reporting even off the canvas): a new run's controller simply
// replaces the last one's.
function DragController(player) {
  let pointerId = null; // the pointer mid-drag, or null
  let startX;
  let startY;
  // The drag so far, in screen pixels. Deliberately *not* converted to world
  // space as it's captured: the camera keeps easing toward the player
  // between pointer-move samples, so a frame-by-frame world-space
  // conversion bakes that drift into the gesture, making the aim feel like
  // it's fighting the camera. Only the final delta is converted, once, on
  // release. (The canvas is sized 1:1 with the window, so client
  // coordinates are canvas pixels.)
  let dx = 0;
  let dy = 0;

  canvas.style.touchAction = 'none';

  canvas.onpointerdown = (event) => {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(pointerId);
    startX = event.clientX;
    startY = event.clientY;
    dx = dy = 0;
    player.aiming = true;
    event.preventDefault();
  };

  canvas.onpointermove = (event) => {
    if (event.pointerId !== pointerId) return;
    dx = event.clientX - startX;
    dy = event.clientY - startY;
    // Direction is preserved going from screen space to world space, and
    // PlayerCharacter's heading convention negates y (see its targetAngle
    // comment), so this matches the direction the launch arrow is drawn in.
    if (Math.hypot(dx, dy) > 1) player.targetAngle = Math.atan2(-dy, dx);
  };

  canvas.onpointerup = canvas.onpointercancel = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    player.aiming = false;
    const screenDistance = Math.hypot(dx, dy);
    if (!screenDistance) return;
    // The camera only translates and scales (never rotates or flips), so
    // only the magnitude needs its zoom undone. Valkyrie Wings raises
    // player.boostPower above its default 1, scaling the whole launch curve
    // (including its cap) proportionally.
    const worldDistance = screenDistance / getObjectsByTag(TAG_CAMERA)[0].zoom;
    const magnitude = Math.min(worldDistance / IMPULSE_DISTANCE_REF, 1) ** 2 * MAX_LINEAR_IMPULSE * player.boostPower;
    player.vx += dx / screenDistance * magnitude;
    player.vy += dy / screenDistance * magnitude;
    playLaunch(magnitude / MAX_LINEAR_IMPULSE);
  };

  return {
    // A fresh game (fresh player) gets a fresh DragController; this one
    // stops listening, including abandoning any drag still in progress.
    destroy() {
      canvas.onpointerdown = pointerId = null;
    },

    // A HUD element, not a world-space render: `z` (draw order) only sorts
    // among other world objects, and this scene's dungeons commonly have
    // world-y (and therefore `.z`) values well past 1000, so drawing this in
    // the ordinary render pass could still land underneath something. The
    // hud() pass always runs after every world object is drawn, so this is
    // guaranteed on top instead of merely "probably high enough".
    //
    // Draws the drag as a fixed-width line from the player's current screen
    // position (the gesture stays relative to the original click,
    // independent of camera motion), capped with a two-stroke arrowhead
    // pointing in the launch direction. Hue is a gradient along the line,
    // spinning over time so the color drifts even while the pointer holds
    // still; hsl() wraps any angle, so it never needs normalizing.
    hud(context) {
      const length = Math.hypot(dx, dy);
      if (pointerId === null || length < 1) return;
      // hud() runs with an identity transform (inside a save/restore), so
      // the camera's own translate/scale/translate (see Camera.set()) is
      // replicated by hand; then the line runs along +x.
      const camera = getObjectsByTag(TAG_CAMERA)[0];
      context.translate(canvas.width / 2 + (player.x - camera.x) * camera.zoom,
        canvas.height / 2 + (player.y - camera.y) * camera.zoom);
      context.rotate(Math.atan2(dy, dx));
      context.lineWidth = LINE_WIDTH;
      const hue = performance.now() * HUE_RATE;
      for (let s = 0; s < length; s += SEGMENT_LENGTH) {
        context.strokeStyle = `hsl(${(s + SEGMENT_LENGTH / 2) * HUE_PER_DISTANCE + hue},90%,60%)`;
        context.beginPath();
        context.moveTo(s, 0);
        context.lineTo(Math.min(s + SEGMENT_LENGTH, length), 0);
        context.stroke();
      }
      context.strokeStyle = `hsl(${length * HUE_PER_DISTANCE + hue},90%,60%)`;
      context.beginPath();
      context.moveTo(length - ARROW_BACK, -ARROW_BACK);
      context.lineTo(length, 0);
      context.lineTo(length - ARROW_BACK, ARROW_BACK);
      context.stroke();
    },
  };
}

export default DragController;
