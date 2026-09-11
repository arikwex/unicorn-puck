import Camera from './camera.js';
import Chalice from './Chalice.js';
import { resetChalices } from './chaliceProgress.js';
import ChaliceHUD from './ChaliceHUD.js';
import CubeObstacle from './CubeObstacle.js';
import generateDungeon, { mulberry32 } from './donjonDungeon.js';
import { add } from './engine.js';
import Grub from './Grub.js';
import inflateDungeon from './inflateDungeon.js';
import DragController from './input.js';
import mergeWallsIntoRects from './mergeWalls.js';
import PhysicsWorld from './PhysicsWorld.js';
import Pillar from './Pillar.js';
import placePillars, { findEntranceCells } from './placePillars.js';
import PlayerCharacter from './PlayerCharacter.js';
import PlayerHealthHUD from './PlayerHealthHUD.js';
import TreasureChest, { CHEST_RADIUS } from './TreasureChest.js';
import ToastSystem from './ToastSystem.js';

// GRUBS_PER_ROOM grubs per room, each scattered to its own spot within the
// room (buildDungeon's own grubSeed offset by <room index> seeds that
// scatter) and its own patrol (offset by <room index> * 100 + <grub index>
// seeds that), kept at least GRUB_MIN_PLAYER_DISTANCE from wherever the player spawns
// and GRUB_ROOM_MARGIN off its room's own walls where the room is big
// enough to allow both.
const GRUBS_PER_ROOM = 6;
const GRUB_MIN_PLAYER_DISTANCE = 200;
const GRUB_ROOM_MARGIN = 50;
// Every room gets exactly one chest (or none, if CHEST_PLACEMENT_ATTEMPTS
// random spots in a row all land too close to something -- a small,
// pillar-crowded room just goes without rather than overlapping a wall).
const CHEST_ROOM_MARGIN = 50;
const CHEST_PLACEMENT_ATTEMPTS = 30;
// The level's required collectibles: winning means collecting *every*
// chalice that spawns, not a fixed count. Exactly CHALICE_ROOM_FRACTION of
// non-spawn rooms get one -- the room count is computed up front and that
// many distinct rooms are shuffled into (see buildDungeon), rather than
// each room independently rolling the fraction as a per-room chance,
// which could unluckily land on far fewer (even zero) chalices for a
// given dungeon instead of reliably landing on the target count. Unlike a
// chest, placement within a chosen room never gives up (see the fallback
// in buildDungeon) since a skipped chalice would shrink the required
// total without actually placing the item, silently making the level
// unwinnable.
const CHALICE_ROOM_FRACTION = 0.5;
const CHALICE_RADIUS = 20;
const CHALICE_ROOM_MARGIN = 40;
const CHALICE_PLACEMENT_ATTEMPTS = 30;
// Shared by both chest and chalice placement: never directly on a room
// entrance/doorway, and prefer at least OBSTACLE_CLEARANCE from obstacles.
const ENTRANCE_CLEARANCE = 3; // world units of clearance required off any room entrance/doorway
const OBSTACLE_CLEARANCE = 2; // world units of clearance required off every wall/pillar/grub/chest
// The raw generator's corridors are a single grid cell wide -- just barely
// wider than the player puck, which feels awful to actually fly through.
// Post-inflating by 2x guarantees every corridor and room is at least 2
// cells wide, without changing the dungeon's layout/topology at all (see
// inflateDungeon.js).
const CORRIDOR_WIDTH_FACTOR = 3;

// Plain axis-aligned grid -- no isometric basis, so walls come out running
// straight along x and y instead of on a diamond skew. Makes wall bounces
// easy to reason about while debugging reflection/collision: a hit on a
// left/right-facing wall should only ever flip vx, a top/bottom-facing one
// should only ever flip vy.
// World-space size of one dungeon grid cell. A CubeObstacle's w/h are its
// exact world-space bounds now (see CubeObstacle.js), so a 1x1 wall tile
// is simply TILE x TILE -- this value itself is arbitrary (any positive
// number tiles edge-to-edge cleanly), just kept unchanged from before this
// module stopped needing to think in pre-ISO-scale half-extents, so the
// dungeon's physical scale relative to the player's radius doesn't shift.
const TILE = 30 * 2 * Math.SQRT2;

function gridToWorld(x, y, gridWidth, gridHeight) {
  return { x: (x - gridWidth / 2) * TILE, y: (y - gridHeight / 2) * TILE };
}

// A grub's spawn point within its room (world space): a point scattered
// randomly (via `rng`) across the room's own interior (inset by
// GRUB_ROOM_MARGIN off its walls), then pushed away from the player's own
// spawn point to at least GRUB_MIN_PLAYER_DISTANCE where the room allows
// it, clamped back inside that same interior -- "if possible": a room too
// small to reach the full distance just does its best rather than
// spawning the grub inside a wall.
function pickGrubSpawn(room, playerSpawn, rng) {
  const minX = room.x - room.w / 2 + GRUB_ROOM_MARGIN;
  const maxX = room.x + room.w / 2 - GRUB_ROOM_MARGIN;
  const minY = room.y - room.h / 2 + GRUB_ROOM_MARGIN;
  const maxY = room.y + room.h / 2 - GRUB_ROOM_MARGIN;
  const clamp = (value, lo, hi, fallback) => (lo > hi ? fallback : Math.min(Math.max(value, lo), hi));

  let x = minX <= maxX ? minX + rng() * (maxX - minX) : room.x;
  let y = minY <= maxY ? minY + rng() * (maxY - minY) : room.y;

  const dx = x - playerSpawn.x;
  const dy = y - playerSpawn.y;
  const distance = Math.hypot(dx, dy);
  if (distance < GRUB_MIN_PLAYER_DISTANCE) {
    // Too close to the player's own spawn point (most likely in the
    // spawn room itself) -- push in that same direction out to the
    // minimum distance instead, or an arbitrary one if it landed exactly
    // on top of the player.
    const angle = distance > 0.001 ? Math.atan2(dy, dx) : 0;
    x = playerSpawn.x + Math.cos(angle) * GRUB_MIN_PLAYER_DISTANCE;
    y = playerSpawn.y + Math.sin(angle) * GRUB_MIN_PLAYER_DISTANCE;
  }

  return { x: clamp(x, minX, maxX, room.x), y: clamp(y, minY, maxY, room.y) };
}

// Pulls a -1..1 sample toward 0 -- CENTER_BIAS_POWER > 1 means small
// offsets stay small and only a minority of samples reach near the edges,
// so a chest/chalice's random spot within its room prefers the center
// without being deterministically stuck there.
const CENTER_BIAS_POWER = 2.2;
function centerBiasedUnit(rng) {
  const t = rng() * 2 - 1;
  return Math.sign(t) * Math.abs(t) ** CENTER_BIAS_POWER;
}

// A center-biased point within a room's own interior, inset by `margin`
// off its walls -- shared by chest and chalice placement (a grub
// additionally pushes away from the player's spawn; see pickGrubSpawn).
function pickPointInRoom(room, margin, rng) {
  const halfW = Math.max(0, room.w / 2 - margin);
  const halfH = Math.max(0, room.h / 2 - margin);
  return {
    x: room.x + centerBiasedUnit(rng) * halfW,
    y: room.y + centerBiasedUnit(rng) * halfH,
  };
}

// Closest-point-on-AABB distance: 0 while inside/touching the box, the
// true gap once outside it. Walls always come out axis-aligned (see TILE's
// own comment above), so a plain half-width/half-height box is exact, no
// rotation to account for.
function circleBoxGap(cx, cy, cr, box) {
  const dx = Math.max(Math.abs(cx - box.x) - box.halfW, 0);
  const dy = Math.max(Math.abs(cy - box.y) - box.halfH, 0);
  return Math.hypot(dx, dy) - cr;
}

function circleCircleGap(cx, cy, cr, other) {
  return Math.hypot(cx - other.x, cy - other.y) - cr - other.radius;
}

// True once a candidate of the given radius clears every wall (box) and
// pillar/grub/chest (circle) by at least OBSTACLE_CLEARANCE, and every
// room entrance (a point, radius 0) by ENTRANCE_CLEARANCE.
function isClearSpot(x, y, radius, walls, circles, entrances) {
  return walls.every((wall) => circleBoxGap(x, y, radius, wall) >= OBSTACLE_CLEARANCE)
    && circles.every((circle) => circleCircleGap(x, y, radius, circle) >= OBSTACLE_CLEARANCE)
    && entrances.every((entrance) => circleCircleGap(x, y, radius, entrance) >= ENTRANCE_CLEARANCE);
}

// Resamples pickPointInRoom up to `attempts` times looking for a spot
// clear of every obstacle and entrance; returns null if none work out.
// Shared by chest and chalice placement -- they only differ in radius,
// margin, attempt budget, and what happens when this returns null (a
// chest just goes without; a chalice must still be placed somewhere, see
// its fallback in buildDungeon).
function findClearSpot(room, margin, radius, attempts, rng, walls, circles, entrances) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = pickPointInRoom(room, margin, rng);
    if (isClearSpot(candidate.x, candidate.y, radius, walls, circles, entrances)) return candidate;
  }
  return null;
}

// Fisher-Yates shuffle -- used to pick exactly CHALICE_ROOM_FRACTION of
// the non-spawn rooms for a chalice (a fixed count decided up front,
// rather than a per-room coin flip that could unluckily under- or
// over-shoot the target across an entire dungeon).
function shuffled(list, rng) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Builds the dungeon's walls as CubeObstacles and returns a world-space
// spawn point (the center of its first room). `seed` drives the whole
// layout; pillar placement and grub scatter/patrol each offset from it so
// they don't replay the room layout's own random sequence.
function buildDungeon(seed) {
  const pillarSeed = seed + 1;
  const grubSeed = seed + 2;
  const chestSeed = seed + 3;
  // `dungeon` (and every room/obstacle placement below, including chests)
  // works entirely off this already-inflated result, never the raw
  // generateDungeon() output -- so chest placement's own room bounds and
  // obstacle clearance checks are always in the same post-inflation world
  // scale as the walls/pillars/grubs actually added to the engine.
  const dungeon = inflateDungeon(generateDungeon(seed), CORRIDOR_WIDTH_FACTOR);
  const toWorld = (x, y) => gridToWorld(x, y, dungeon.gridWidth, dungeon.gridHeight);
  const floorSet = new Set(dungeon.floor.map(({ x, y }) => `${x},${y}`));
  // A room's entrance cells (grid) as world-space points, radius 0 -- fed
  // into findClearSpot/isClearSpot's "circles" clearance check.
  const roomEntrancePoints = (room) => findEntranceCells(room, floorSet).map((cell) => {
    const world = toWorld(cell.x, cell.y);
    return { x: world.x, y: world.y, radius: 0 };
  });

  // Collected as chests are placed check clearance against them below --
  // walls as boxes, pillars/grubs as circles.
  const wallBoxes = [];
  const obstacleCircles = [];

  // Collapses the (many, small) unit wall cells into far fewer large
  // rectangles before ever touching the engine -- purely a performance
  // simplification, see mergeWalls.js.
  mergeWallsIntoRects(dungeon.walls).forEach((rect) => {
    // A rect's grid bounds run from (rect.x, rect.y) to
    // (rect.x + rect.w, rect.y + rect.h) exclusive; its world-space center
    // sits half a cell in from that top-left corner, same as any single
    // cell's own center would.
    const center = toWorld(rect.x + (rect.w - 1) / 2, rect.y + (rect.h - 1) / 2);
    add(CubeObstacle(center.x, center.y, rect.w * TILE, rect.h * TILE));
    wallBoxes.push({
      x: center.x, y: center.y, halfW: (rect.w * TILE) / 2, halfH: (rect.h * TILE) / 2,
    });
  });

  // Roman-esque columns dropped into rooms with enough space for them --
  // corners, a symmetric pair flanking opposing walls, or centered --
  // never within reach of a doorway. See placePillars.js. `variant` picks
  // one of Pillar.js's four purely-visual looks; physics never varies.
  placePillars(dungeon, pillarSeed).forEach(({ x, y, variant }) => {
    const world = toWorld(x, y);
    const pillar = add(Pillar(world.x, world.y, { variant }));
    obstacleCircles.push({ x: world.x, y: world.y, radius: pillar.radius });
  });

  const spawnRoomGrid = dungeon.rooms[0];
  const playerSpawn = toWorld(spawnRoomGrid.x + spawnRoomGrid.w / 2, spawnRoomGrid.y + spawnRoomGrid.h / 2);

  // GRUBS_PER_ROOM grubs per room -- including the player's own spawn
  // room -- each scattered to its own spot and with its own seeded
  // patrol, so behavior stays reproducible run to run, and never within
  // GRUB_MIN_PLAYER_DISTANCE of the player's spawn.
  dungeon.rooms.forEach((room, roomIndex) => {
    const roomCenter = toWorld(room.x + room.w / 2, room.y + room.h / 2);
    const worldRoom = {
      x: roomCenter.x, y: roomCenter.y, w: room.w * TILE, h: room.h * TILE,
    };
    const scatterRng = mulberry32(grubSeed + roomIndex);
    for (let i = 0; i < GRUBS_PER_ROOM; i++) {
      const spawn = pickGrubSpawn(worldRoom, playerSpawn, scatterRng);
      const grub = add(Grub(spawn.x, spawn.y, worldRoom, grubSeed + roomIndex * 100 + i));
      obstacleCircles.push({ x: spawn.x, y: spawn.y, radius: grub.puck().radius });
    }

    // Every room gets a chest, kept clear of every wall/pillar/grub and
    // every doorway (see isClearSpot/findClearSpot, and findEntranceCells
    // -- the same entrance-cell detection placePillars.js uses to keep its
    // own pillars clear of doorways) -- a room too cluttered to fit one
    // goes without rather than spawning it overlapping something or
    // blocking the way in.
    const entrancePoints = roomEntrancePoints(room);
    const chestRng = mulberry32(chestSeed + roomIndex);
    const chestSpawn = findClearSpot(worldRoom, CHEST_ROOM_MARGIN, CHEST_RADIUS, CHEST_PLACEMENT_ATTEMPTS, chestRng, wallBoxes, obstacleCircles, entrancePoints);
    if (chestSpawn) {
      add(TreasureChest(chestSpawn.x, chestSpawn.y));
      // So a chalice placed afterward (see below) won't land on top of it.
      obstacleCircles.push({ x: chestSpawn.x, y: chestSpawn.y, radius: CHEST_RADIUS });
    }
  });

  // The level's Chalices of Pegacorn Blood -- same placement rules as a
  // chest (clear of every obstacle and doorway, biased toward room
  // center). Exactly round(CHALICE_ROOM_FRACTION * non-spawn rooms) of
  // them get one -- the count is computed up front and that many distinct
  // rooms are shuffled into, so the target is always hit precisely rather
  // than each room flipping its own coin and the dungeon as a whole
  // landing wherever that happens to fall (including, unluckily, zero).
  // Runs after the loop above so wallBoxes/obstacleCircles already
  // reflect every wall, pillar, grub, and chest across the whole dungeon,
  // not just whichever rooms happened to be processed first.
  const chaliceRng = mulberry32(seed + 4);
  const nonSpawnRoomIndices = dungeon.rooms.map((_, i) => i).filter((i) => i !== 0);
  const chaliceRoomCount = Math.round(nonSpawnRoomIndices.length * CHALICE_ROOM_FRACTION);
  const chaliceRoomIndices = shuffled(nonSpawnRoomIndices, chaliceRng).slice(0, chaliceRoomCount);

  chaliceRoomIndices.forEach((roomIndex) => {
    const room = dungeon.rooms[roomIndex];
    const roomCenter = toWorld(room.x + room.w / 2, room.y + room.h / 2);
    const worldRoom = {
      x: roomCenter.x, y: roomCenter.y, w: room.w * TILE, h: room.h * TILE,
    };
    // Chosen for a chalice, so unlike a chest this never gives up on the
    // room -- it falls back to an unchecked point rather than skipping
    // entirely and silently shrinking the required total below the count
    // just committed to above.
    const spawn = findClearSpot(worldRoom, CHALICE_ROOM_MARGIN, CHALICE_RADIUS, CHALICE_PLACEMENT_ATTEMPTS, chaliceRng, wallBoxes, obstacleCircles, roomEntrancePoints(room))
      || pickPointInRoom(worldRoom, CHALICE_ROOM_MARGIN, chaliceRng);
    add(Chalice(spawn.x, spawn.y));
  });
  resetChalices(chaliceRoomIndices.length);

  return playerSpawn;
}

// Entry point for specifying everything in the scene: the player, camera,
// obstacles, and input. Swap or extend this module to build different
// maps. `seed` drives the whole dungeon layout -- pass a fresh one per run
// for a new map, or the same one to replay an identical layout.
function createMap(seed) {
  const spawn = buildDungeon(seed);
  const player = add(PlayerCharacter(spawn.x, spawn.y));
  const playerHealthHUD = add(PlayerHealthHUD(player));
  const chaliceHUD = add(ChaliceHUD());
  add(ToastSystem());
  add(Camera().follow(player));
  const dragController = add(DragController(player));
  add(PhysicsWorld());
  return {
    player, dragController, playerHealthHUD, chaliceHUD,
  };
}

export default createMap;
