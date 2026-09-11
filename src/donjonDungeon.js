// A "rooms + maze" dungeon generator modeled on donjon.bin.sh's d20 Random
// Dungeon Generator (https://donjon.bin.sh/d20/dungeon/). That tool's own
// generation runs server-side (a .cgi endpoint) and its source isn't
// published, so this is an independent implementation of the technique
// it's well known for -- see e.g. Bob Nystrom's "Rooms and Mazes" writeup
// for the same approach: place scattered rooms, fill every remaining cell
// with a perfect maze, connect every disjoint region with doors, then
// prune dead-end corridors.
//
// The specific settings requested of the real generator (size=medium,
// layout=rect, egress=no, room layout=scattered, room size=medium,
// polymorph rooms=yes -- a no-op here, see carveRoom -- doors=standard,
// corridors=errant, remove deadends=all, stairs=no) are baked in below as
// constants rather than exposed as options, since this game only ever
// wants the one configuration. `stairs`, `style`, and `grid`
// (visual/output settings on the real generator) have no equivalent here
// -- we render with our own CubeObstacle style, and this is a single-level
// dungeon.
//
// Works entirely in integer grid coordinates; turning that into
// world-space obstacles is the caller's job (see mapCreator.js).

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

function shuffle(rng, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// -- "size=medium", "layout=rect" ------------------------------------
// Odd cells (1, 3, 5, ...) are floor/wall lattice points -- rooms and maze
// corridors only ever occupy odd coordinates. Even cells between them are
// the walls a corridor tunnels through when carved. Both dimensions must
// therefore be odd, and the outermost ring (index 0 and WIDTH-1/HEIGHT-1,
// both even) is never reachable by carving, which is what keeps the whole
// dungeon enclosed with no gaps at the edge ("egress=no").
// Shrunk from 41: cuts the world's overall footprint (and, as a side
// effect, the room count ~30%, since fewer rooms fit a smaller grid at the
// same size) without changing individual room dimensions the way raising
// ROOM_MAX_SIZE would have. ROOM_PLACEMENT_ATTEMPTS is already deep into
// diminishing returns here -- the grid saturates with rooms well before
// 300 attempts -- so a smaller attempt budget alone barely moves the count.
const GRID_WIDTH = 33;
const GRID_HEIGHT = 33;

// -- "room layout=scattered", "room size=medium" -----------------------
const ROOM_MIN_SIZE = 3; // odd
const ROOM_MAX_SIZE = 5; // odd
const ROOM_PLACEMENT_ATTEMPTS = 300;
// Minimum gap (in cells) enforced between rooms -- looser than a packed
// layout, which is what makes it read as "scattered" rather than dense.
const ROOM_SPACING = 2;

// -- "corridors=errant" --------------------------------------------------
// Probability the maze carver continues in the same direction rather than
// picking a fresh random one. Low means corridors wander a lot -- errant
// sits between a dead-straight layout (high) and a fully chaotic one (0).
const CORRIDOR_STRAIGHTNESS = 0.5;

// -- "doors=standard" ------------------------------------------------
// Once every region is connected (a spanning set of connectors), this is
// the chance any further *redundant* connector is also kept, adding a
// loop instead of leaving the layout a strict tree.
const EXTRA_CONNECTOR_CHANCE = 0.04;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function inBounds(x, y) {
  return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

// Cell state for the whole grid: -1 = wall/uncarved, otherwise the id of
// the room or maze region that carved it. `room` separately flags cells
// that belong to an actual room (as opposed to a corridor or door), since
// those are treated differently by dead-end pruning.
function Grid() {
  const region = new Int32Array(GRID_WIDTH * GRID_HEIGHT).fill(-1);
  const room = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
  const index = (x, y) => y * GRID_WIDTH + x;
  return {
    regionAt: (x, y) => region[index(x, y)],
    open: (x, y) => region[index(x, y)] >= 0,
    isRoom: (x, y) => room[index(x, y)],
    carve(x, y, regionId, isRoom) {
      region[index(x, y)] = regionId;
      if (isRoom) room[index(x, y)] = 1;
    },
    // Only ever clears pruned corridor cells, never room cells.
    clear(x, y) {
      region[index(x, y)] = -1;
    },
  };
}

function roomsOverlap(a, b) {
  return a.x - ROOM_SPACING < b.x + b.w && a.x + a.w + ROOM_SPACING > b.x
    && a.y - ROOM_SPACING < b.y + b.h && a.y + a.h + ROOM_SPACING > b.y;
}

// Rectangles placed at odd x/y with odd w/h so their boundary walls line
// up exactly with the maze lattice.
function placeRooms(rng) {
  const rooms = [];
  for (let attempt = 0; attempt < ROOM_PLACEMENT_ATTEMPTS; attempt++) {
    const w = randInt(rng, (ROOM_MIN_SIZE - 1) / 2, (ROOM_MAX_SIZE - 1) / 2) * 2 + 1;
    const h = randInt(rng, (ROOM_MIN_SIZE - 1) / 2, (ROOM_MAX_SIZE - 1) / 2) * 2 + 1;
    // Upper bound leaves room for the mandatory 1-cell wall margin before
    // the grid's outer (always-uncarved) boundary ring -- without the
    // extra "- 1" a max-width room could land with its right/bottom edge
    // exactly on that boundary column/row, which both breaks enclosure
    // and (since GRID_WIDTH/GRID_HEIGHT is the array stride) aliases into
    // the next row of the flat grid array.
    const room = {
      x: randInt(rng, 0, Math.floor((GRID_WIDTH - w - 1) / 2)) * 2 + 1,
      y: randInt(rng, 0, Math.floor((GRID_HEIGHT - h - 1) / 2)) * 2 + 1,
      w,
      h,
    };
    if (!rooms.some((other) => roomsOverlap(room, other))) rooms.push(room);
  }
  return rooms;
}

// Rooms are always plain rectangles. (Donjon's "polymorph rooms" corner
// notches used to be cut here, but the maze pass always carved them back
// in, so they never survived to the final map.)
function carveRoom(grid, room, regionId) {
  for (let x = room.x; x < room.x + room.w; x++) {
    for (let y = room.y; y < room.y + room.h; y++) {
      grid.carve(x, y, regionId, true);
    }
  }
}

// Whether the lattice cell two steps away from (x, y) in `dir` is free to
// tunnel into: in bounds, and neither it nor the wall cell between them
// has been carved yet (keeps each maze run a "perfect" tree on its own).
function canCarve(grid, x, y, [dx, dy]) {
  return inBounds(x + dx * 2, y + dy * 2) && !grid.open(x + dx, y + dy) && !grid.open(x + dx * 2, y + dy * 2);
}

// Randomized-recursive-backtracker maze carve, biased by
// CORRIDOR_STRAIGHTNESS toward continuing in the same direction.
function growMaze(grid, rng, startX, startY, regionId) {
  const stack = [[startX, startY]];
  grid.carve(startX, startY, regionId, false);
  let lastDir = null;

  while (stack.length) {
    const [x, y] = stack.at(-1);
    const open = DIRS.filter((dir) => canCarve(grid, x, y, dir));

    if (open.length === 0) {
      stack.pop();
      lastDir = null;
      continue;
    }

    // `open` holds the shared DIRS arrays, so identity finds the last one.
    const dir = (open.includes(lastDir) && rng() < CORRIDOR_STRAIGHTNESS)
      ? lastDir
      : open[randInt(rng, 0, open.length - 1)];

    grid.carve(x + dir[0], y + dir[1], regionId, false);
    grid.carve(x + dir[0] * 2, y + dir[1] * 2, regionId, false);
    stack.push([x + dir[0] * 2, y + dir[1] * 2]);
    lastDir = dir;
  }
}

// Fills every odd lattice cell not already claimed by a room with maze
// corridors, one new region per disjoint run.
function fillMaze(grid, rng, firstRegionId) {
  let regionId = firstRegionId;
  for (let x = 1; x < GRID_WIDTH; x += 2) {
    for (let y = 1; y < GRID_HEIGHT; y += 2) {
      if (!grid.open(x, y)) {
        growMaze(grid, rng, x, y, regionId);
        regionId++;
      }
    }
  }
  return regionId;
}

// A wall cell sits between exactly two lattice neighbors: horizontally if
// it's on an even column/odd row, vertically if odd column/even row.
// Even/even cells are corner pillars and never a connector.
function wallNeighbors(x, y) {
  if (x % 2 === 0 && y % 2 === 1) return [[x - 1, y], [x + 1, y]];
  if (x % 2 === 1 && y % 2 === 0) return [[x, y - 1], [x, y + 1]];
  return null;
}

// Every uncarved wall cell whose two opposite neighbors are both carved
// but belong to different regions is a candidate door between them.
function findConnectors(grid) {
  const connectors = [];
  for (let x = 1; x < GRID_WIDTH - 1; x++) {
    for (let y = 1; y < GRID_HEIGHT - 1; y++) {
      if (grid.open(x, y)) continue;
      const neighbors = wallNeighbors(x, y);
      if (!neighbors) continue;
      const [[ax, ay], [bx, by]] = neighbors;
      if (!grid.open(ax, ay) || !grid.open(bx, by)) continue;
      const a = grid.regionAt(ax, ay);
      const b = grid.regionAt(bx, by);
      if (a !== b) connectors.push({ x, y, a, b });
    }
  }
  return connectors;
}

// Joins every room and maze region into one connected dungeon by carving
// doors at connectors, using union-find to build a spanning set (so it's
// never left in more than one disconnected piece) plus occasional extra
// connectors for loops ("doors=standard").
function connectRegions(grid, rng, regionCount) {
  const parent = Array.from({ length: regionCount }, (_, i) => i);
  const find = (id) => {
    while (parent[id] !== id) {
      parent[id] = parent[parent[id]];
      id = parent[id];
    }
    return id;
  };

  shuffle(rng, findConnectors(grid)).forEach((connector) => {
    const rootA = find(connector.a);
    const rootB = find(connector.b);
    // A connector already inside one region is only kept (as a loop) by chance.
    if (rootA !== rootB || rng() < EXTRA_CONNECTOR_CHANCE) grid.carve(connector.x, connector.y, rootA, false);
    parent[rootB] = rootA;
  });
}

// "remove_deadends=all": repeatedly clears any non-room carved cell with at
// most one open neighbor, until none remain -- leaving only rooms and the
// loop-connected corridors actually needed between them. Cells directly
// touching a room are never pruned, even if trimming their far side would
// otherwise leave them with only one open neighbor -- that protects every
// room's doorway from being trimmed away entirely, which would strand the
// room with no way in or out. (Open cells are never on the outer ring, so
// their neighbors are always in bounds.)
function removeDeadEnds(grid) {
  let removedAny = true;
  while (removedAny) {
    removedAny = false;
    for (let x = 0; x < GRID_WIDTH; x++) {
      for (let y = 0; y < GRID_HEIGHT; y++) {
        if (!grid.open(x, y) || grid.isRoom(x, y)
          || DIRS.some(([dx, dy]) => grid.isRoom(x + dx, y + dy))) continue;
        if (DIRS.filter(([dx, dy]) => grid.open(x + dx, y + dy)).length <= 1) {
          grid.clear(x, y);
          removedAny = true;
        }
      }
    }
  }
}

// Every cell is floor (carved: room, corridor, or door) or wall -- not just
// the walls touching floor. Together they cover the whole grid, including
// the outer ring (never reachable by carving -- see the GRID_WIDTH/
// GRID_HEIGHT comment, so the dungeon always ends up fully enclosed for
// "egress=no" with no extra work needed). Classifying every cell means
// there's no leftover "hole" for a later pass (e.g. inflateDungeon.js's
// tile-for-tile upscale) to render as neither floor nor wall.
function classifyCells(grid) {
  const floor = [];
  const walls = [];
  for (let x = 0; x < GRID_WIDTH; x++) {
    for (let y = 0; y < GRID_HEIGHT; y++) (grid.open(x, y) ? floor : walls).push({ x, y });
  }
  return { floor, walls };
}

// Generates a rooms-and-corridors dungeon in integer grid coordinates.
// Deterministic for a given seed: the same seed always produces the exact
// same layout. `floor` is every carved (room, corridor, or door) cell --
// e.g. for a post-process like inflateDungeon.js to widen corridors from.
function generateDonjonDungeon(seed) {
  const rng = mulberry32(seed);
  const grid = Grid();

  const rooms = placeRooms(rng);
  rooms.forEach((room, i) => carveRoom(grid, room, i));

  const regionCount = fillMaze(grid, rng, rooms.length);
  connectRegions(grid, rng, regionCount);
  removeDeadEnds(grid);

  return {
    rooms,
    ...classifyCells(grid),
    size: GRID_WIDTH, // the grid is square: GRID_WIDTH === GRID_HEIGHT
  };
}

export default generateDonjonDungeon;
export { mulberry32 };
