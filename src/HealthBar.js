import { SHIELD_COLOR } from './bubbleShield.js';
import { fillRect } from './canvasShapes.js';

// A standard, reusable health bar: an outlined rectangle divided into one
// large tick per health point, colored green, yellow, orange, or red at
// quarter-health cutoffs. Pure render function -- callers own when/where to show it
// and what currentHp/maxHp are; this just draws.
const GREEN = '#4c5';
const YELLOW = '#ed4';
const ORANGE = '#e93';
const RED = '#d33';

function healthColor(fraction) {
  if (fraction > 0.75) return GREEN;
  if (fraction > 0.5) return YELLOW;
  if (fraction > 0.25) return ORANGE;
  return RED;
}

// (x, y) is the bar's center: a white 2px outline around translucent black,
// with `shields` extra blue ticks after the health ticks.
function renderHealthBar(context, x, y, width, height, currentHp, maxHp, shields = 0) {

  const fraction = Math.max(0, Math.min(1, currentHp / maxHp));
  const color = healthColor(fraction);
  const left = x - width / 2;
  const top = y - height / 2;

  fillRect(context, left, top, width, height, '#000', 0.55);

  // The 2px outline straddles the rectangle edge; measure the 2px padding
  // from its inner edge so the full gap stays visible beside the ticks.
  const inset = 3;
  const slots = Math.max(maxHp, currentHp + shields);
  // Dense stacks still get one visible-width tick each, never a zero-width
  // bar because fixed gaps consumed all the available space.
  const gap = Math.min(2, Math.max(0, width - inset * 2) / slots * 0.25);
  const tickWidth = Math.max(0, (width - inset * 2 - gap * (slots - 1)) / slots);
  const tickHeight = Math.max(0, height - inset * 2);
  for (let i = 0; i < currentHp + shields; i++) {
    fillRect(context, left + inset + i * (tickWidth + gap), top + inset, tickWidth, tickHeight, i < currentHp ? color : SHIELD_COLOR);
  }

  context.strokeStyle = '#fff';
  context.lineWidth = 2;
  context.strokeRect(left, top, width, height);
}

export default renderHealthBar;
