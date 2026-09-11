// A dropped item ability -- one of ItemAbility.js's catalog, bobbing gently
// in the world until the player walks over it. Collected the same way as
// Chalice.js (no physics, just a proximity check), granting its effect
// immediately and announcing itself via the same 'item-collected' toast
// event Chalice.js already uses.

import { emit } from './bus.js';
import { add, getObjectsByTag } from './engine.js';
import { collectItemAbility, ITEM_ABILITY_CATALOG } from './ItemAbility.js';
import SplatEffect from './SplatEffect.js';
import { TAG_PLAYER } from './tags.js';

const TAU = Math.PI * 2;
const PICKUP_RADIUS = 26;
const BOB_SPEED = 2.2; // rad/s
const BOB_AMOUNT = 4; // px
const WORLD_SCALE = 1.8;
const COLLECT_SPLAT_COUNT = 8;
const COLLECT_SPLAT_SPEED_MAX = 200;
const COLLECT_SPLAT_SIZE_MIN = 6;
const COLLECT_SPLAT_SIZE_MAX = 12;

function fireCollectSplats(x, y, color) {
  for (let i = 0; i < COLLECT_SPLAT_COUNT; i++) {
    const angle = Math.random() * TAU;
    const speed = Math.sqrt(Math.random()) * COLLECT_SPLAT_SPEED_MAX;
    const size = COLLECT_SPLAT_SIZE_MIN + Math.random() * (COLLECT_SPLAT_SIZE_MAX - COLLECT_SPLAT_SIZE_MIN);
    add(SplatEffect(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, { size }));
  }
}

function Item(x, y, abilityId) {
  let anim = Math.random() * TAU;
  let collected = false;
  const ability = ITEM_ABILITY_CATALOG.find((candidate) => candidate.id === abilityId);

  return {
    x,
    y,
    order: y,
    abilityId,

    update(dt) {
      if (collected) return true;
      anim += dt;

      const player = getObjectsByTag(TAG_PLAYER)[0];
      if (!player) return false;
      const distance = Math.hypot(player.x - this.x, player.y - this.y);
      if (distance > PICKUP_RADIUS + player.radius) return false;

      collected = true;
      collectItemAbility(abilityId, player);
      fireCollectSplats(this.x, this.y, '#fff');
      emit('item-collected', { name: ability.name });
      return true;
    },

    render(context) {
      context.save();
      context.translate(this.x, this.y + Math.sin(anim * BOB_SPEED) * BOB_AMOUNT);
      context.scale(WORLD_SCALE, WORLD_SCALE);
      ability.draw(context);
      context.restore();
    },
  };
}

export default Item;
