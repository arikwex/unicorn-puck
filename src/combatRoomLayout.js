import { mulberry32 } from './donjonDungeon.js';

const COMBAT_ROOM_FRACTION = 0.5;

// A fixed count chosen at map creation, independent of encounter order.
function selectCombatRooms(roomCount, seed) {
  const indices = Array.from({ length: Math.max(0, roomCount - 1) }, (_, i) => i + 1);
  const rng = mulberry32(seed);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return new Set(indices.slice(0, Math.round(indices.length * COMBAT_ROOM_FRACTION)));
}

export { selectCombatRooms };
