// Lightweight seeded dungeon generator: rectangular rooms joined by
// corridors, packed fairly densely. Works entirely in integer grid
// coordinates -- turning that into world-space obstacles is the caller's
// job (see mapCreator.js), so this module has no notion of tile size,
// physics, or rendering.

// mulberry32: a small, fast, deterministic PRNG. The whole point of taking
// a seed is that the same seed always produces the exact same dungeon, so
// Math.random() (unseeded, non-reproducible) is never used here.
function mulberry32(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

const MIN_ROOMS = 8;
const MAX_ROOMS = 13;
const ROOM_MIN_SIZE = 3;
const ROOM_MAX_SIZE = 6;
// Rooms are placed within [0, GRID_SIZE) on each axis. Kept small relative
// to room count/size (rather than scaling the grid up with room count) so
// placement is forced to pack rooms close together instead of sprawling.
const GRID_SIZE = 30;
const PLACEMENT_ATTEMPTS_PER_ROOM = 200;
const CORRIDOR_WIDTH = 2; // wide enough for a radius-38ish puck to pass comfortably

function roomsOverlap(a, b) {
  // No padding between rooms -- letting them sit edge-to-edge (or have a
  // corridor run straight into a shared wall) is what keeps the dungeon
  // dense instead of sparse.
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function placeRooms(rng, count) {
  const rooms = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS_PER_ROOM; attempt++) {
      const w = randInt(rng, ROOM_MIN_SIZE, ROOM_MAX_SIZE);
      const h = randInt(rng, ROOM_MIN_SIZE, ROOM_MAX_SIZE);
      const room = { x: randInt(rng, 0, GRID_SIZE - w), y: randInt(rng, 0, GRID_SIZE - h), w, h };
      if (!rooms.some((other) => roomsOverlap(room, other))) {
        rooms.push(room);
        break;
      }
    }
  }
  return rooms;
}

function roomCenter(room) {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

function carveRoom(floor, room) {
  for (let x = room.x; x < room.x + room.w; x++) {
    for (let y = room.y; y < room.y + room.h; y++) floor.add(`${x},${y}`);
  }
}

function carveHorizontal(floor, y, x0, x1) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let w = 0; w < CORRIDOR_WIDTH; w++) floor.add(`${x},${y + w}`);
  }
}

function carveVertical(floor, x, y0, y1) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
    for (let w = 0; w < CORRIDOR_WIDTH; w++) floor.add(`${x + w},${y}`);
  }
}

// Carves an L-shaped, CORRIDOR_WIDTH-wide corridor between two room
// centers, bending at a random one of the two possible corners.
function carveCorridor(floor, rng, a, b) {
  if (rng() < 0.5) {
    carveHorizontal(floor, a.y, a.x, b.x);
    carveVertical(floor, b.x, a.y, b.y);
  } else {
    carveVertical(floor, a.x, a.y, b.y);
    carveHorizontal(floor, b.y, a.x, b.x);
  }
}

// Connects every room to the next in placement order (guarantees the
// whole dungeon is reachable), plus a handful of extra random connections
// so it reads as a network with loops rather than one thin spine -- part
// of what keeps it feeling dense.
function connectRooms(floor, rng, rooms) {
  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(floor, rng, roomCenter(rooms[i - 1]), roomCenter(rooms[i]));
  }
  const extraConnections = Math.floor(rooms.length / 3);
  for (let i = 0; i < extraConnections; i++) {
    const a = rooms[randInt(rng, 0, rooms.length - 1)];
    const b = rooms[randInt(rng, 0, rooms.length - 1)];
    if (a !== b) carveCorridor(floor, rng, roomCenter(a), roomCenter(b));
  }
}

// Every floor cell's non-floor 4-neighbors become walls: a solid
// 1-cell-thick boundary around every room and corridor.
function wallsAroundFloor(floor) {
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const walls = new Set();
  floor.forEach((key) => {
    const [x, y] = key.split(',').map(Number);
    neighbors.forEach(([dx, dy]) => {
      const neighborKey = `${x + dx},${y + dy}`;
      if (!floor.has(neighborKey)) walls.add(neighborKey);
    });
  });
  return [...walls].map((key) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  });
}

// Generates a dungeon of MIN_ROOMS..MAX_ROOMS rectangular rooms joined by
// corridors, in integer grid coordinates. Deterministic for a given seed:
// the same seed always produces the exact same layout.
function generateDungeon(seed) {
  const rng = mulberry32(seed);
  const roomCount = randInt(rng, MIN_ROOMS, MAX_ROOMS);
  const rooms = placeRooms(rng, roomCount);

  const floor = new Set();
  rooms.forEach((room) => carveRoom(floor, room));
  connectRooms(floor, rng, rooms);

  return { rooms, walls: wallsAroundFloor(floor), gridSize: GRID_SIZE };
}

export default generateDungeon;
