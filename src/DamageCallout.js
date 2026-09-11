// A "-N hp" floating text callout: drifts upward, fades, and grows over
// CALLOUT_DURATION. Its own self-expiring engine object (like SplatEffect)
// rather than something the source of the damage has to stay alive to
// keep rendering -- so a killing blow can remove its grub immediately and
// the callout still plays out on its own.

const CALLOUT_DURATION = 0.7;
const CALLOUT_RISE = 90; // px it drifts upward over its lifetime
const CALLOUT_START_SCALE = 0.8;
const CALLOUT_END_SCALE = 2.1;

function DamageCallout(x, y, text, color = '#fff') {
  let elapsed = 0;

  return {
    order: y,

    update(dt) {
      elapsed += dt;
      return elapsed >= CALLOUT_DURATION;
    },

    render(context) {
      const t = Math.min(1, elapsed / CALLOUT_DURATION);
      const p = (1.0 - Math.exp(-t * 6.0));
      const scale = CALLOUT_START_SCALE + (CALLOUT_END_SCALE - CALLOUT_START_SCALE) * p;

      context.save();
      context.globalAlpha = 1 - t;
      context.translate(x, y - CALLOUT_RISE * p);
      context.scale(scale, scale);
      context.font = 'bold 14px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.lineWidth = 3 / scale;
      context.strokeStyle = '#000';
      // Round joins -- a miter join (canvas's default) spikes into sharp
      // peaks on a letter's acute interior angles (the V-notch in "M"/"W"
      // most visibly) once the stroke is as thick as this outline is.
      context.lineJoin = 'round';
      context.strokeText(text, 0, 0);
      context.fillStyle = color;
      context.fillText(text, 0, 0);
      context.restore();
    },
  };
}

export default DamageCallout;
