import { add, getObjectsByTag, remove } from './engine.js';
import { TAG_ENEMY } from './tags.js';

const HOP_DURATION = 0.2;
const TRAIL_DURATION = 0.24;
const MAX_BOUNCES = 2;

function renderBolt(context, source, target, start, end, time) {
  if (end <= start) return;
  const gradient = context.createLinearGradient(source.x, source.y - 30, target.x, target.y - 30);
  for (let i = 0; i <= 6; i++) gradient.addColorStop(i / 6, `hsl(${i * 60},90%,60%)`);
  context.strokeStyle = gradient;
  context.lineWidth = 15;
  context.lineCap = context.lineJoin = 'round';
  context.beginPath();
  const dx = target.x - source.x, dy = target.y - source.y;
  const length = Math.hypot(dx, dy) || 1;
  for (let i = 0; i <= 32; i++) {
    const u = start + (end - start) * i / 32;
    // Half-strength sine motion over a 90-unit upward arc; both offsets
    // taper to zero at the enemies so each hop still connects exactly.
    const wave = Math.sin(u * Math.PI * 6 - time * 40) * Math.sin(u * Math.PI) * Math.min(9, length * 0.075);
    const x = source.x + dx * u - dy / length * wave;
    const y = source.y - 30 + dy * u + dx / length * wave - 90 * 4 * u * (1 - u);
    if (i) context.lineTo(x, y);
    else context.moveTo(x, y);
  }
  context.stroke();
}

// Two sequential hops, each measured from the last target. Keep object
// identities even after a kill so a chain can never revisit an enemy.
function chainLightning(source) {
  const visited = [source];
  source = { x: source.x, y: source.y };
  let target;
  let elapsed = 0;
  let time = 0;
  let trails = [];

  function next() {
    let range = 450;
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
        // Keep a connected path through the impact positions, even if the
        // enemies move or die before the tail finishes following it.
        const destination = { x: target.x, y: target.y };
        trails.push({
          source,
          target: destination,
          end: time - elapsed,
        });
        // Another hit may kill the locked target during travel.
        if (target.hp > 0 && target.hurt(1)) remove(target);
        visited.push(target);
        source = destination;
        if (visited.length === MAX_BOUNCES + 1) target = undefined;
        else next();
      }
      // The tail follows the head by 240 ms, including after
      // the final hit. Remove a segment only when the tail reaches its end.
      trails = trails.filter((trail) => time - trail.end < TRAIL_DURATION);
      return !target && !trails.length;
    },
    render(context) {
      context.save();
      context.globalAlpha = 1;
      for (const trail of trails) {
        const tail = Math.max(0, (time - TRAIL_DURATION - trail.end + HOP_DURATION) / HOP_DURATION);
        renderBolt(context, trail.source, trail.target, tail, 1, time);
      }
      if (target) renderBolt(context, source, target, 0, elapsed / HOP_DURATION, time);
      context.restore();
    },
  });
}

export default chainLightning;
