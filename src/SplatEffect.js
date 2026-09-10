// A one-shot hit-splash VFX: a thick line arcs outward from (x, y) along a
// parabola, then "lands" and leaves behind a temporary oval puddle that
// fades to opacity 0 while its scale grows linearly, over PUDDLE_DURATION.
// Self-expiring, like Grub's own defeat -- update() returns true once the
// puddle has fully faded, and the engine removes it.

const TAU = Math.PI * 2;

const FLIGHT_DURATION_MIN = 0.3;
const FLIGHT_DURATION_MAX = 0.55;
const ARC_HEIGHT_RATIO = 0.4; // default peak arc height as a fraction of travel distance, if no explicit arcHeight is given
const ARC_LINE_WIDTH = 6;
const ARC_SAMPLES = 10; // line segments used to trace the curve each frame
const PUDDLE_DURATION = 0.5; // seconds the puddle takes to fade out
const PUDDLE_GROWTH = 0.6; // fraction the puddle's scale grows by over its fade
const PUDDLE_ASPECT = 0.55; // radiusY / radiusX -- flattened into an oval on the ground

// `vx` and `vy` are ground-plane velocity in world units per second; `size` is
// the puddle's base radius. Both the arc and the puddle are filled/stroked
// with `color`. `arcHeight` overrides the default distance-proportional
// peak height -- callers firing off a burst of splats can randomize this
// per-splat for some vertical variety instead of every arc peaking at
// exactly the same fraction of its own distance.
function SplatEffect(x, y, vx, vy, color, props = {}) {
  const flightDuration = Math.random() * (FLIGHT_DURATION_MAX - FLIGHT_DURATION_MIN) + FLIGHT_DURATION_MIN;
  const distance = Math.hypot(vx, vy) * flightDuration;
  const { size = 10, arcHeight = distance * ARC_HEIGHT_RATIO } = props;

  let elapsed = 0;
  let landed = false;
  let puddleElapsed = 0;

  const landX = x + vx * flightDuration;
  const landY = y + vy * flightDuration;

  // A point along the parabola at fraction `t` (0 = launch, 1 = landed).
  // The "height" term only ever offsets screen-y upward, the same
  // convention every other bit of faux-3D lift in this game uses.
  function pointAt(t) {
    return [
      x + vx * flightDuration * t,
      y + vy * flightDuration * t - arcHeight * 4 * t * (1 - t),
    ];
  }

  return {
    order: landY, // depth-sorts with everything else near where it lands

    update(dt) {
      if (!landed) {
        elapsed += dt;
        if (elapsed >= flightDuration) landed = true;
        return false;
      }
      puddleElapsed += dt;
      return puddleElapsed >= PUDDLE_DURATION;
    },

    render(context) {
      if (!landed) {
        const t = Math.min(1, elapsed / flightDuration);
        context.strokeStyle = color;
        context.lineWidth = ARC_LINE_WIDTH;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        for (let i = 0; i <= ARC_SAMPLES; i++) {
          const [px, py] = pointAt(Math.max(Math.min(i / ARC_SAMPLES * 0.4 + t * 0.8, 1), 0));
          if (i === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.stroke();
        return;
      }

      const puddleT = Math.min(1, puddleElapsed / PUDDLE_DURATION);
      const scale = 1 + PUDDLE_GROWTH * puddleT;
      context.globalAlpha = 1 - puddleT;
      context.fillStyle = color;
      context.beginPath();
      context.ellipse(landX, landY, size * scale, size * scale * PUDDLE_ASPECT, 0, 0, TAU);
      context.fill();
      context.globalAlpha = 1;
    },
  };
}

export default SplatEffect;
