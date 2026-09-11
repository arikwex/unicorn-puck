// Contact between a moving circle `c` and a static obstacle `o` -- an
// axis-aligned box (x/y center plus w/h) or a circle (radius `r`). Returns
// [nx, ny, penetration] with the normal pointing from `c` toward `o`, or
// nothing when they don't overlap. A circle whose center is embedded in a
// box is pushed out through the nearest face.
function contact(c, o) {
  const dx = c.x - o.x;
  const dy = c.y - o.y;
  const w = o.w / 2;
  const h = o.h / 2;
  // Vector from c to the closest point of o (its center for a circle).
  const px = w ? Math.max(-w, Math.min(w, dx)) - dx : -dx;
  const py = w ? Math.max(-h, Math.min(h, dy)) - dy : -dy;
  const d = Math.hypot(px, py);
  const penetration = c.r + (o.r || 0) - d;
  if (d) return penetration > 0 ? [px / d, py / d, penetration] : 0;
  const gapX = w - Math.abs(dx);
  const gapY = h - Math.abs(dy);
  return gapX <= gapY
    ? [dx < 0 ? 1 : -1, 0, c.r + gapX]
    : [0, dy < 0 ? 1 : -1, c.r + gapY];
}

export default contact;
