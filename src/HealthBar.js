// A standard, reusable health bar: an outlined rectangle divided into one
// large tick per health point, colored green (full) fading to red (empty)
// as it drains. Pure render function -- callers own when/where to show it
// and what currentHp/maxHp are; this just draws.
const EMPTY_COLOR = [214, 58, 58]; // red
const FULL_COLOR = [70, 196, 92]; // green

function healthColor(fraction) {
  const r = Math.round(EMPTY_COLOR[0] + (FULL_COLOR[0] - EMPTY_COLOR[0]) * fraction);
  const g = Math.round(EMPTY_COLOR[1] + (FULL_COLOR[1] - EMPTY_COLOR[1]) * fraction);
  const b = Math.round(EMPTY_COLOR[2] + (FULL_COLOR[2] - EMPTY_COLOR[2]) * fraction);
  return `rgb(${r}, ${g}, ${b})`;
}

// (x, y) is the bar's center. `props` lets a caller nudge the look without
// forking the function: outlineColor/outlineWidth, backgroundColor (shows
// through empty ticks), tickGap.
function renderHealthBar(context, x, y, width, height, currentHp, maxHp, props = {}) {
  const {
    outlineColor = '#000',
    outlineWidth = 2,
    backgroundColor = 'rgba(0, 0, 0, 0.55)',
    tickGap = 2,
  } = props;

  const fraction = Math.max(0, Math.min(1, currentHp / maxHp));
  const color = healthColor(fraction);
  const left = x - width / 2;
  const top = y - height / 2;

  context.fillStyle = backgroundColor;
  context.fillRect(left, top, width, height);

  const tickWidth = (width - tickGap * (maxHp - 1)) / maxHp;
  context.fillStyle = color;
  for (let i = 0; i < maxHp && i < currentHp; i++) {
    context.fillRect(left + i * (tickWidth + tickGap), top, tickWidth, height);
  }

  context.strokeStyle = outlineColor;
  context.lineWidth = outlineWidth;
  context.strokeRect(left, top, width, height);
}

export default renderHealthBar;
