import { add, getObjectsByTag, remove } from './engine.js';
import MetalGrate from './MetalGrate.js';
import { playCombatImpact } from './sounds.js';
import { fireSplatBurst } from './SplatEffect.js';
import { TAG_COMBAT_ROOM, TAG_PLAYER } from './tags.js';
import { showToast } from './ToastSystem.js';

const ACTIVATION_PADDING = 16; // extra clearance beyond the player's collision radius

// Numeric state ids (exported so GameFlow.js's own read of `room.state`
// stays in sync) instead of string names -- cheaper to compare and ship.
const READY = 0;
const ACTIVE = 1;
const CLEARED = 2;

function splash(door) {
  fireSplatBurst(door.x, door.y, 8, ['#cdd'], 240, 9, 9);
}

function CombatRoom(bounds, doorways, enemies) {
  let grates = [];
  return {
    // Decide before pickups and the victory watcher, then let the normal
    // collision pass handle any newly closed doorway contacts.
    z: -1e6,
    tags: [TAG_COMBAT_ROOM],
    state: READY,
    bounds,
    enemies,

    tick() {
      if (this.state === CLEARED) return;
      const player = getObjectsByTag(TAG_PLAYER)[0];
      if (!player || player.hp <= 0) return;
      const inset = player.r + ACTIVATION_PADDING;
      const alive = enemies.some((enemy) => enemy.hp > 0);
      if (this.state === ACTIVE) {
        if (alive) return;
        this.state = CLEARED;
        remove(grates);
        grates = [];
        doorways.forEach(splash);
        playCombatImpact();
      } else if (!alive) {
        // A room cleared from outside must never lock an empty encounter.
        this.state = CLEARED;
      } else if (Math.abs(player.x - bounds.x) < bounds.w / 2 - inset
        && Math.abs(player.y - bounds.y) < bounds.h / 2 - inset) {
        // The entire player must clear the doorway plus a safety margin.
        // Grates stay outside these bounds and use ordinary box contacts.
        this.state = ACTIVE;
        grates = doorways.map((door) => add(MetalGrate(door)));
        doorways.forEach(splash);
        playCombatImpact();
        showToast('Defeat all enemies to exit room');
      }
    },

    destroy() {
      remove(grates);
      grates = [];
    },
  };
}

export default CombatRoom;
export { ACTIVE };
