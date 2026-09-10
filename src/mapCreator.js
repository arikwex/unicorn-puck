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

// Fixed for now, so the generated dungeon is reproducible while the
// generator itself is being tuned.
const DUNGEON_SEED = 123;
// Deliberately different from DUNGEON_SEED, so pillar placement doesn't
// replay the exact same random sequence the room layout already consumed.
const PILLAR_SEED = DUNGEON_SEED + 1;
// Every room gets GRUBS_PER_ROOM grubs, each scattered to its own spot
// within the room (GRUB_SEED + <room index> seeds that scatter) and its
// own patrol (GRUB_SEED + <room index> * 100 + <grub index> seeds that),
// kept at least GRUB_MIN_PLAYER_DISTANCE from wherever the player spawns
// and GRUB_ROOM_MARGIN off its room's own walls where the room is big
// enough to allow both.
const GRUB_SEED = DUNGEON_SEED + 2;
const GRUBS_PER_ROOM = 6;
const GRUB_MIN_PLAYER_DISTANCE = 200;
const GRUB_ROOM_MARGIN = 50;
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

// Builds the dungeon's walls as CubeObstacles and returns a world-space
// spawn point (the center of its first room).
function buildDungeon() {
  const dungeon = inflateDungeon(generateDungeon(DUNGEON_SEED), CORRIDOR_WIDTH_FACTOR);
  const toWorld = (x, y) => gridToWorld(x, y, dungeon.gridWidth, dungeon.gridHeight);

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
  });

  // Roman-esque columns dropped into rooms with enough space for them --
  // corners, a symmetric pair flanking opposing walls, or centered --
  // never within reach of a doorway. See placePillars.js.
  placePillars(dungeon, PILLAR_SEED).forEach(({ x, y }) => {
    const world = toWorld(x, y);
    add(Pillar(world.x, world.y));
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
    const scatterRng = mulberry32(GRUB_SEED + roomIndex);
    for (let i = 0; i < GRUBS_PER_ROOM; i++) {
      const spawn = pickGrubSpawn(worldRoom, playerSpawn, scatterRng);
      add(Grub(spawn.x, spawn.y, worldRoom, GRUB_SEED + roomIndex * 100 + i));
    }
  });

  return playerSpawn;
}

// Entry point for specifying everything in the scene: the player, camera,
// obstacles, and input. Swap or extend this module to build different
// maps.
function createMap() {
  const spawn = buildDungeon();
  const player = add(PlayerCharacter(spawn.x, spawn.y));
  add(Camera().follow(player));
  add(DragController(player));
  add(PhysicsWorld());
  return { player };
}

export default createMap;
