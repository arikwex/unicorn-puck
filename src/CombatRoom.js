import { emit } from './bus.js';
import { add, getObjectsByTag, remove } from './engine.js';
import MetalGrate from './MetalGrate.js';
import { playCombatImpact } from './sounds.js';
import SplatEffect from './SplatEffect.js';
import { TAG_COMBAT_ROOM, TAG_PLAYER } from './tags.js';

const ACTIVATION_PADDING = 16; // extra clearance beyond the player's collision radius

function splash(door) {
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.sqrt(Math.random()) * 240;
    add(SplatEffect(door.x + (Math.random() - 0.5) * door.w,
      door.y + (Math.random() - 0.5) * door.h,
      Math.cos(angle) * speed, Math.sin(angle) * speed, '#d3d7dc', { size: 9 }));
  }
}

function CombatRoom(bounds, doorways, enemies) {
  let grates = [];
  return {
    // Decide before pickups and the victory watcher, then let the normal
    // collision pass handle any newly closed doorway contacts.
    order: -1e6,
    tags: [TAG_COMBAT_ROOM],
    state: 'ready',
    bounds,
    enemies,

    update() {
      if (this.state === 'cleared') return;
      const player = getObjectsByTag(TAG_PLAYER)[0];
      if (!player || player.hp <= 0) return;
      const inset = player.radius + ACTIVATION_PADDING;
      const alive = enemies.some((enemy) => enemy.hp > 0);
      if (this.state === 'active') {
        if (alive) return;
        this.state = 'cleared';
        remove(grates);
        grates = [];
        doorways.forEach(splash);
        playCombatImpact();
      } else if (!alive) {
        // A room cleared from outside must never lock an empty encounter.
        this.state = 'cleared';
      } else if (Math.abs(player.x - bounds.x) < bounds.w / 2 - inset
        && Math.abs(player.y - bounds.y) < bounds.h / 2 - inset) {
        // The entire player must clear the doorway plus a safety margin.
        // Grates stay outside these bounds; swept collisions prevent even
        // an immediate high-speed reversal from crossing the closed gate.
        this.state = 'active';
        grates = doorways.map((door) => add(MetalGrate(door)));
        doorways.forEach(splash);
        playCombatImpact();
        emit('toast', { message: 'Defeat all enemies to exit room' });
      }
    },

    destroy() {
      remove(grates);
      grates = [];
    },
  };
}

export default CombatRoom;
