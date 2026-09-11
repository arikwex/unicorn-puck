// Decides where to stand pillars within a generated dungeon's rooms, in
// integer grid coordinates -- turning that into world-space Pillar
// obstacles is the caller's job (see mapCreator.js), same division of
// labor as donjonDungeon.js/mergeWalls.js.
import { mulberry32 } from './donjonDungeon.js';

const WALL_MARGIN = 2; // min cells a pillar must sit inset from the room's own walls
const ENTRANCE_CLEARANCE = 2; // min cells (Manhattan) from any entrance cell -- never blocks a doorway
const MIN_ROOM_SPAN = 5; // smaller rooms (either axis) get no pillars -- too cramped to matter
// Rooms currently come in only two footprints, 9 or 15 cells per axis (see
// donjonDungeon.js's ROOM_MIN/MAX_SIZE post-inflation) -- 12 sits cleanly
// between them, so this flags exactly the 15-either-axis rooms as "large".
const LARGE_ROOM_SPAN = 12; // either axis at least this big always gets a pillar, no skipping
const MIN_PILLAR_SPACING = 2; // min cells between two pillars placed in the same room
const SKIP_ROOM_CHANCE = 0.08; // even an eligible small/medium room sometimes just goes without, for variety
const COLONNADE_COUNT = 3; // pillars per row in a colonnade pattern
const PILLAR_VARIANT_COUNT = 4; // see Pillar.js -- classic column, crystal, flame square, candelabra
const ROOM_TWO_VARIANT_CHANCE = 0.5; // otherwise the room's pillars are all one variant

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// A room's pillars draw from either one variant or, half the time, an even
// mix of two -- never 3+ different looks scattered through the same room.
function pickRoomVariantPool(rng) {
  const first = Math.floor(rng() * PILLAR_VARIANT_COUNT);
  if (rng() >= ROOM_TWO_VARIANT_CHANCE) return [first];
  let second = Math.floor(rng() * (PILLAR_VARIANT_COUNT - 1));
  if (second >= first) second += 1; // skip over `first` so the two are always distinct
  return [first, second];
}

function key(x, y) {
  return `${x},${y}`;
}

function roomFloorCells(room, floorSet) {
  const cells = [];
  for (let x = room.x; x < room.x + room.w; x++) {
    for (let y = room.y; y < room.y + room.h; y++) {
      if (floorSet.has(key(x, y))) cells.push({ x, y });
    }
  }
  return cells;
}

// A room-floor cell on the room's own rectangle boundary that has a floor
// neighbor *outside* that rectangle is where a corridor or door connects
// in -- an entrance.
function findEntranceCells(room, floorSet) {
  const onBoundary = (x, y) => x === room.x || x === room.x + room.w - 1 || y === room.y || y === room.y + room.h - 1;
  const inRoom = (x, y) => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;

  const entrances = [];
  for (let x = room.x; x < room.x + room.w; x++) {
    for (let y = room.y; y < room.y + room.h; y++) {
      if (!onBoundary(x, y) || !floorSet.has(key(x, y))) continue;
      const leadsOutside = DIRS.some(([dx, dy]) => !inRoom(x + dx, y + dy) && floorSet.has(key(x + dx, y + dy)));
      if (leadsOutside) entrances.push({ x, y });
    }
  }
  return entrances;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function nearestFloorCell(target, floorCells) {
  let best = null;
  let bestDist = Infinity;
  floorCells.forEach((cell) => {
    const dist = manhattan(cell, target);
    if (dist < bestDist) {
      bestDist = dist;
      best = cell;
    }
  });
  return best;
}

// A row of `count` pillars evenly spaced along one axis, mirrored onto the
// opposing wall -- e.g. colonnade(3, true) is two rows of 3 lining the
// top and bottom walls, like columns down either side of a hall.
function colonnade(count, alongX) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 1) / (count + 1);
    points.push(alongX ? [t, 0] : [0, t], alongX ? [t, 1] : [1, t]);
  }
  return points;
}

// Fractional (0..1) anchor points along each axis of a room's *inset*
// interior, per layout. Common, recognizable arrangements rather than
// scattering pillars randomly.
const PATTERNS = [
  [[0, 0], [1, 0], [0, 1], [1, 1]], // one at each corner
  [[0, 0.5], [1, 0.5]], // flanking the left/right walls
  [[0.5, 0], [0.5, 1]], // flanking the top/bottom walls
  [[0.5, 0.5]], // centered
  colonnade(COLONNADE_COUNT, true), // two rows lining the top/bottom walls
  colonnade(COLONNADE_COUNT, false), // two rows lining the left/right walls
];

function placeInRoom(rng, room, floorSet) {
  if (room.w < MIN_ROOM_SPAN || room.h < MIN_ROOM_SPAN) return [];
  const isLarge = room.w >= LARGE_ROOM_SPAN || room.h >= LARGE_ROOM_SPAN;
  if (!isLarge && rng() < SKIP_ROOM_CHANCE) return [];

  const innerX0 = room.x + WALL_MARGIN;
  const innerX1 = room.x + room.w - 1 - WALL_MARGIN;
  const innerY0 = room.y + WALL_MARGIN;
  const innerY1 = room.y + room.h - 1 - WALL_MARGIN;
  if (innerX0 >= innerX1 || innerY0 >= innerY1) return [];

  const floorCells = roomFloorCells(room, floorSet);
  const entrances = findEntranceCells(room, floorSet);
  const pattern = PATTERNS[Math.floor(rng() * PATTERNS.length)];
  // Every pillar in this room draws from the same 1-or-2-variant pool,
  // rather than each independently rolling among all four.
  const variantPool = pickRoomVariantPool(rng);
  const pickVariant = () => variantPool[Math.floor(rng() * variantPool.length)];

  const placed = [];
  pattern.forEach(([fx, fy]) => {
    const target = {
      x: Math.round(innerX0 + fx * (innerX1 - innerX0)),
      y: Math.round(innerY0 + fy * (innerY1 - innerY0)),
    };
    const cell = nearestFloorCell(target, floorCells);
    if (!cell) return;
    if (entrances.some((entrance) => manhattan(entrance, cell) < ENTRANCE_CLEARANCE)) return;
    if (placed.some((other) => manhattan(other, cell) < MIN_PILLAR_SPACING)) return;
    placed.push({ ...cell, variant: pickVariant() });
  });

  // A large room reads as too bare without at least one pillar -- if the
  // rolled pattern's every candidate got rejected (too close to a doorway
  // or to each other), fall back to whatever floor cell sits nearest the
  // room's own center rather than leaving it empty.
  if (isLarge && placed.length === 0) {
    const center = {
      x: Math.round(innerX0 + (innerX1 - innerX0) / 2),
      y: Math.round(innerY0 + (innerY1 - innerY0) / 2),
    };
    const cell = nearestFloorCell(center, floorCells);
    if (cell) placed.push({ ...cell, variant: pickVariant() });
  }

  return placed;
}

// Returns every pillar's { x, y, variant } (grid cells, variant an index
// into Pillar.js's four render variants) across the whole dungeon.
// Deterministic for a given seed, independent of whatever seed the
// dungeon layout itself used.
function placePillars(dungeon, seed) {
  const rng = mulberry32(seed);
  const floorSet = new Set(dungeon.floor.map(({ x, y }) => key(x, y)));
  const pillars = [];
  dungeon.rooms.forEach((room) => {
    pillars.push(...placeInRoom(rng, room, floorSet));
  });
  return pillars;
}

export default placePillars;
export { findEntranceCells };
