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

// Scan all four boundaries, merging consecutive floor connections into
// one grate per doorway. Place it in the OUTSIDE row of cells so closing
// behind a player straddling the threshold always resolves them inward.
function findRoomDoorways(room, floorSet, tile, toWorld) {
  const sides = [
    [room.x, room.y, 0, 1, -1, 0, room.h],
    [room.x + room.w - 1, room.y, 0, 1, 1, 0, room.h],
    [room.x, room.y, 1, 0, 0, -1, room.w],
    [room.x, room.y + room.h - 1, 1, 0, 0, 1, room.w],
  ];
  const doors = [];
  sides.forEach(([x, y, dx, dy, nx, ny, length]) => {
    let start;
    for (let i = 0; i <= length; i++) {
      const cx = x + dx * i;
      const cy = y + dy * i;
      const open = i < length && floorSet.has(`${cx},${cy}`) && floorSet.has(`${cx + nx},${cy + ny}`);
      if (open && start === undefined) start = i;
      if (open || start === undefined) continue;
      const middle = (start + i - 1) / 2;
      const center = toWorld(x + dx * middle + nx, y + dy * middle + ny);
      doors.push({ ...center, w: tile * (dx ? i - start : 1), h: tile * (dy ? i - start : 1) });
      start = undefined;
    }
  });
  return doors;
}

export { findRoomDoorways, selectCombatRooms };
