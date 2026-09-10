// A standard, reusable health bar: an outlined rectangle divided into one
// large tick per health point, colored green, yellow, orange, or red at
// quarter-health cutoffs. Pure render function -- callers own when/where to show it
// and what currentHp/maxHp are; this just draws.
const GREEN = '#46c45c';
const YELLOW = '#f2d64b';
const ORANGE = '#ef9234';
const RED = '#d63a3a';

function healthColor(fraction) {
  if (fraction > 0.75) return GREEN;
  if (fraction > 0.5) return YELLOW;
  if (fraction > 0.25) return ORANGE;
  return RED;
}

// (x, y) is the bar's center. `props` lets a caller nudge the look without
// forking the function: outlineColor/outlineWidth, backgroundColor (shows
// through empty ticks), tickGap, padding (inside the outline).
function renderHealthBar(context, x, y, width, height, currentHp, maxHp, props = {}) {
  const {
    outlineColor = '#fff',
    outlineWidth = 2,
    backgroundColor = 'rgba(0, 0, 0, 0.55)',
    tickGap = 2,
    padding = 2,
  } = props;

  const fraction = Math.max(0, Math.min(1, currentHp / maxHp));
  const color = healthColor(fraction);
  const left = x - width / 2;
  const top = y - height / 2;

  context.fillStyle = backgroundColor;
  context.fillRect(left, top, width, height);

  // The outline straddles the rectangle edge; measure padding from its
  // inner edge so the full gap remains visible beside the colored ticks.
  const inset = outlineWidth / 2 + padding;
  const tickWidth = Math.max(0, (width - inset * 2 - tickGap * (maxHp - 1)) / maxHp);
  const tickHeight = Math.max(0, height - inset * 2);
  context.fillStyle = color;
  for (let i = 0; i < maxHp && i < currentHp; i++) {
    context.fillRect(left + inset + i * (tickWidth + tickGap), top + inset, tickWidth, tickHeight);
  }

  context.strokeStyle = outlineColor;
  context.lineWidth = outlineWidth;
  context.strokeRect(left, top, width, height);
}

export default renderHealthBar;
