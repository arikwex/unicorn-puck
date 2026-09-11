import { emit } from './bus.js';
import { renderBubbleShield, SHIELD_COLOR } from './bubbleShield.js';
import DamageCallout from './DamageCallout.js';
import { add, getObjectsByTag } from './engine.js';
import { TAG_PLAYER } from './tags.js';

const SPAWN_PROTECTION = 0.3;
const PICKUP_RADIUS = 40;

function BubbleShieldItem(x, y) {
  let anim = 0;
  let protection = SPAWN_PROTECTION;
  let collected = false;
  return {
    x, y, order: y,
    update(dt) {
      if (collected) return true;
      anim += dt;
      protection = Math.max(0, protection - dt);
      if (protection > 0) return false;
      const player = getObjectsByTag(TAG_PLAYER)[0];
      if (!player || player.hp <= 0
        || Math.hypot(player.x - this.x, player.y - this.y) > PICKUP_RADIUS + player.radius) return false;
      collected = true;
      player.addBubbleShield();
      add(DamageCallout(this.x, this.y - 20, '+1 shield', SHIELD_COLOR));
      emit('item-collected', { name: 'Bubble Shield' });
      return true;
    },
    render(context) {
      renderBubbleShield(context, this.x, this.y + Math.sin(anim * 2.2) * 4,
        26 * (1 + Math.sin(anim * 4.5) * 0.08));
    },
  };
}

export default BubbleShieldItem;
