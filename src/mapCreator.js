import Camera from './camera.js';
import CubeObstacle from './CubeObstacle.js';
import generateDungeon, { mulberry32 } from './donjonDungeon.js';
import { add } from './engine.js';
import Grub from './Grub.js';
import inflateDungeon from './inflateDungeon.js';
import DragController from './input.js';
import mergeWallsIntoRects from './mergeWalls.js';
import PhysicsWorld from './PhysicsWorld.js';
import Pillar from './Pillar.js';
import placePillars from './placePillars.js';
import PlayerCharacter from './PlayerCharacter.js';
import PlayerHealthHUD from './PlayerHealthHUD.js';
import TreasureChest, { CHEST_RADIUS } from './TreasureChest.js';

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
const CHEST_MIN_OBSTACLE_GAP = 1; // world units of clearance required off every obstacle
const CHEST_PLACEMENT_ATTEMPTS = 40;
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

// A chest's spawn point: just a random point scattered across the room's
// own interior (inset by CHEST_ROOM_MARGIN), no player-distance push --
// unlike a grub, a chest sitting near the player's spawn isn't a problem.
function pickChestSpawn(room, rng) {
  const minX = room.x - room.w / 2 + CHEST_ROOM_MARGIN;
  const maxX = room.x + room.w / 2 - CHEST_ROOM_MARGIN;
  const minY = room.y - room.h / 2 + CHEST_ROOM_MARGIN;
  const maxY = room.y + room.h / 2 - CHEST_ROOM_MARGIN;
  const x = minX <= maxX ? minX + rng() * (maxX - minX) : room.x;
  const y = minY <= maxY ? minY + rng() * (maxY - minY) : room.y;
  return { x, y };
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

// True only once a candidate clears every known obstacle -- walls (boxes)
// and pillars/grubs (circles) -- by at least CHEST_MIN_OBSTACLE_GAP.
function chestSpotIsClear(x, y, walls, circles) {
  return walls.every((wall) => circleBoxGap(x, y, CHEST_RADIUS, wall) >= CHEST_MIN_OBSTACLE_GAP)
    && circles.every((circle) => circleCircleGap(x, y, CHEST_RADIUS, circle) >= CHEST_MIN_OBSTACLE_GAP);
}

// Resamples pickChestSpawn up to CHEST_PLACEMENT_ATTEMPTS times looking for
// a spot clear of every obstacle; returns null (give up, no chest) if none
// of them work out.
function findChestSpawn(room, rng, walls, circles) {
  for (let attempt = 0; attempt < CHEST_PLACEMENT_ATTEMPTS; attempt++) {
    const candidate = pickChestSpawn(room, rng);
    if (chestSpotIsClear(candidate.x, candidate.y, walls, circles)) return candidate;
  }
  return null;
}

// Builds the dungeon's walls as CubeObstacles and returns a world-space
// spawn point (the center of its first room). `seed` drives the whole
// layout; pillar placement and grub scatter/patrol each offset from it so
// they don't replay the room layout's own random sequence.
function buildDungeon(seed) {
  const pillarSeed = seed + 1;
  const grubSeed = seed + 2;
  const chestSeed = seed + 3;
  const dungeon = inflateDungeon(generateDungeon(seed), CORRIDOR_WIDTH_FACTOR);
  const toWorld = (x, y) => gridToWorld(x, y, dungeon.gridWidth, dungeon.gridHeight);

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
  // never within reach of a doorway. See placePillars.js.
  placePillars(dungeon, pillarSeed).forEach(({ x, y }) => {
    const world = toWorld(x, y);
    const pillar = add(Pillar(world.x, world.y));
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

    // Every room gets a chest, kept at least CHEST_MIN_OBSTACLE_GAP off
    // every wall/pillar/grub -- a room too cluttered to fit one goes
    // without rather than spawning it overlapping something.
    const chestRng = mulberry32(chestSeed + roomIndex);
    const chestSpawn = findChestSpawn(worldRoom, chestRng, wallBoxes, obstacleCircles);
    if (chestSpawn) add(TreasureChest(chestSpawn.x, chestSpawn.y));
  });

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
  add(Camera().follow(player));
  const dragController = add(DragController(player));
  add(PhysicsWorld());
  return {
    player, dragController, playerHealthHUD,
  };
}

export default createMap;
