// A dropped item ability -- one of ItemAbility.js's catalog, bobbing gently
// in the world until the player walks over it. Collected the same way as
// Chalice.js (no physics, just a proximity check), granting its effect
// immediately and announcing itself via the same item-collected toast
// Chalice.js already uses.

import { getObjectsByTag } from './engine.js';
import { collectItemAbility, ITEM_ABILITY_CATALOG } from './ItemAbility.js';
import { fireSplatBurst } from './SplatEffect.js';
import { TAG_PLAYER } from './tags.js';
import { showItemCollectedToast } from './ToastSystem.js';
import { TAU } from './mathUtils.js';

const PICKUP_RADIUS = 26;
const BOB_SPEED = 2.2; // rad/s
const BOB_AMOUNT = 4; // px
const WORLD_SCALE = 1.8;
const COLLECT_SPLAT_COUNT = 8;
const COLLECT_SPLAT_COLORS = ['#fff'];
const COLLECT_SPLAT_SPEED_MAX = 200;
const COLLECT_SPLAT_SIZE_MIN = 6;
const COLLECT_SPLAT_SIZE_MAX = 12;

function Item(x, y, abilityId) {
  let anim = Math.random() * TAU;
  const ability = ITEM_ABILITY_CATALOG[abilityId];

  return {
    x,
    y,
    z: y,
    abilityId,

    tick(dt) {
      anim += dt;

      const player = getObjectsByTag(TAG_PLAYER)[0];
      if (!player) return false;
      const distance = Math.hypot(player.x - this.x, player.y - this.y);
      if (distance > PICKUP_RADIUS + player.r) return false;

      collectItemAbility(abilityId, player);
      fireSplatBurst(this.x, this.y, COLLECT_SPLAT_COUNT, COLLECT_SPLAT_COLORS, COLLECT_SPLAT_SPEED_MAX, COLLECT_SPLAT_SIZE_MIN, COLLECT_SPLAT_SIZE_MAX);
      showItemCollectedToast(ability.name);
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
