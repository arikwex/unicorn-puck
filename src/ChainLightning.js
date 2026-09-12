import { add, getObjectsByTag, remove } from './engine.js';
import { TAU } from './mathUtils.js';
import { TAG_ENEMY } from './tags.js';

const HOP_DURATION = 0.2;
const TRAIL_DURATION = 0.24;
const MAX_BOUNCES = 2;

function renderBolt(context, source, target, start, end, time) {
  if (end <= start) return;
  context.strokeStyle = `hsl(${time * 1200},90%,60%)`;
  context.lineWidth = 15;
  context.beginPath();
  const dx = target.x - source.x, dy = target.y - source.y;
  for (let i = 0; i <= 16; i++) {
    const u = start + (end - start) * i / 16;
    // The parabola doubles as the ripple's envelope, so both fade to zero at
    // the enemies and each hop still connects exactly.
    const arc = u * (1 - u);
    const x = source.x + dx * u + Math.sin(u * TAU * 3 - time * 40) * arc * 40;
    const y = source.y - 30 + dy * u - 360 * arc;
    context.lineTo(x, y);
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
        trails.push([source, destination, time - elapsed]);
        // Another hit may kill the locked target during travel.
        if (target.hp > 0 && target.hurt(1)) remove(target);
        visited.push(target);
        source = destination;
        if (visited.length === MAX_BOUNCES + 1) target = undefined;
        else next();
      }
      // The tail follows the head by 240 ms, including after
      // the final hit. Remove a segment only when the tail reaches its end.
      trails = trails.filter((trail) => time - trail[2] < TRAIL_DURATION);
      return !target && !trails.length;
    },
    render(context) {
      for (const [source, target, end] of trails) {
        const tail = Math.max(0, (time - TRAIL_DURATION - end + HOP_DURATION) / HOP_DURATION);
        renderBolt(context, source, target, tail, 1, time);
      }
      if (target) renderBolt(context, source, target, 0, elapsed / HOP_DURATION, time);
    },
  });
}

export default chainLightning;
