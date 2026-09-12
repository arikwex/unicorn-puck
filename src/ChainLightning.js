import { add, getObjectsByTag, remove } from './engine.js';
import { TAG_ENEMY } from './tags.js';

const HOP_DURATION = 0.2;
const TRAIL_DURATION = HOP_DURATION * 3;

function renderBolt(context, source, target, t, alpha = 1) {
  if (t <= 0) return;
  const gradient = context.createLinearGradient(source.x, source.y - 30, target.x, target.y - 30);
  for (let i = 0; i <= 6; i++) gradient.addColorStop(i / 6, `hsl(${i * 60},90%,60%)`);
  context.globalAlpha = alpha;
  context.strokeStyle = gradient;
  context.lineWidth = 20;
  context.lineCap = context.lineJoin = 'round';
  context.beginPath();
  const dx = target.x - source.x, dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  for (let i = 0; i <= 32; i++) {
    const u = t * i / 32;
    // A moving sine wave tapered to meet both enemies exactly.
    const wave = Math.sin(u * Math.PI * 6 - t * HOP_DURATION * 40) * Math.sin(u * Math.PI) * Math.min(18, length * 0.15);
    const x = source.x + dx * u - dy / length * wave;
    const y = source.y - 30 + dy * u + dx / length * wave;
    if (i) context.lineTo(x, y);
    else context.moveTo(x, y);
  }
  context.stroke();
}

// Two sequential hops, each measured from the last target. Keep object
// identities even after a kill so a chain can never revisit an enemy.
function chainLightning(source) {
  const visited = [source];
  let target;
  let elapsed = 0;
  let time = 0;
  let trails = [];

  function next() {
    let range = 350;
    target = undefined;
    for (const enemy of getObjectsByTag(TAG_ENEMY)) {
      const distance = Math.hypot(enemy.x - source.x, enemy.y - source.y);
      if (enemy.hp > 0 && !visited.includes(enemy) && distance <= range) {
        target = enemy;
        range = distance;
      }
    }
    return target;
  }

  if (!next()) return;
  add({
    z: 1e6,
    tick(dt) {
      time += dt;
      elapsed += dt;
      while (target && elapsed >= HOP_DURATION) {
        elapsed -= HOP_DURATION;
        // Freeze completed segments at their impact positions, even if the
        // enemies move or die. Total visibility is three hop durations.
        trails.push({
          source: { x: source.x, y: source.y },
          target: { x: target.x, y: target.y },
          end: time - elapsed,
        });
        // Another hit may kill the locked target during travel.
        if (target.hp > 0 && target.hurt(1)) remove(target);
        visited.push(target);
        source = target;
        if (visited.length === 3) target = undefined;
        else next();
      }
      trails = trails.filter((trail) => time - trail.end < TRAIL_DURATION - HOP_DURATION);
      return !target && !trails.length;
    },
    render(context) {
      context.save();
      for (const trail of trails) {
        renderBolt(context, trail.source, trail.target, 1,
          1 - (time - trail.end) / (TRAIL_DURATION - HOP_DURATION));
      }
      if (target) renderBolt(context, source, target, elapsed / HOP_DURATION);
      context.restore();
    },
  });
}

export default chainLightning;
