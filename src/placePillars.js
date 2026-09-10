// Decides where to stand pillars within a generated dungeon's rooms, in
// integer grid coordinates -- turning that into world-space Pillar
// obstacles is the caller's job (see mapCreator.js), same division of
// labor as donjonDungeon.js/mergeWalls.js.
import { mulberry32 } from './donjonDungeon.js';

const WALL_MARGIN = 2; // min cells a pillar must sit inset from the room's own walls
const ENTRANCE_CLEARANCE = 2; // min cells (Manhattan) from any entrance cell -- never blocks a doorway
const MIN_ROOM_SPAN = 5; // smaller rooms (either axis) get no pillars -- too cramped to matter
const MIN_PILLAR_SPACING = 2; // min cells between two pillars placed in the same room
const SKIP_ROOM_CHANCE = 0.08; // even an eligible room sometimes just goes without, for variety -- but rare now
const COLONNADE_COUNT = 3; // pillars per row in a colonnade pattern

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

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
  if (rng() < SKIP_ROOM_CHANCE) return [];

  const innerX0 = room.x + WALL_MARGIN;
  const innerX1 = room.x + room.w - 1 - WALL_MARGIN;
  const innerY0 = room.y + WALL_MARGIN;
  const innerY1 = room.y + room.h - 1 - WALL_MARGIN;
  if (innerX0 >= innerX1 || innerY0 >= innerY1) return [];

  const floorCells = roomFloorCells(room, floorSet);
  const entrances = findEntranceCells(room, floorSet);
  const pattern = PATTERNS[Math.floor(rng() * PATTERNS.length)];

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
    placed.push(cell);
  });

  return placed;
}

// Returns every pillar position (grid cells) across the whole dungeon.
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
