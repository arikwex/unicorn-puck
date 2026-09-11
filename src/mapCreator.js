import BubbleShieldItem from './BubbleShieldItem.js';
import Camera from './camera.js';
import Chalice from './Chalice.js';
import { resetChalices } from './chaliceProgress.js';
import ChaliceHUD from './ChaliceHUD.js';
import CombatRoom from './CombatRoom.js';
import { selectCombatRooms } from './combatRoomLayout.js';
import CubeObstacle from './CubeObstacle.js';
import generateDungeon, { mulberry32 } from './donjonDungeon.js';
import { add } from './engine.js';
import Grub, { SMALL, MEDIUM, LARGE } from './Grub.js';
import HealthItem from './HealthItem.js';
import inflateDungeon from './inflateDungeon.js';
import DragController from './input.js';
import Item from './Item.js';
import { ITEM_ABILITY_CATALOG, resetItemAbilities } from './ItemAbility.js';
import ItemAbilityHUD from './ItemAbilityHUD.js';
import mergeWallsIntoRects from './mergeWalls.js';
import MiniMap from './MiniMap.js';
import Pillar from './Pillar.js';
import placePillars, { findEntranceCells } from './placePillars.js';
import PlayerCharacter from './PlayerCharacter.js';
import PlayerHealthHUD from './PlayerHealthHUD.js';
import TreasureChest, { CHEST_RADIUS } from './TreasureChest.js';
import ToastSystem, { showToast } from './ToastSystem.js';

// Each room has an enemy budget: small/medium/large grubs cost 1/2/3.
// Grubs are scattered to their own spots within the
// room (buildDungeon's own grubSeed offset by <room index> seeds that
// scatter) and its own patrol (offset by <room index> * 100 + <grub index>
// seeds that) and kept GRUB_ROOM_MARGIN off its room's own walls where the room is big
// enough to allow it.
// A room's enemy budget scales with its (raw, pre-inflation) size: a
// square room's width+height minus 3 gives exactly 3/5/7 slots for a
// 3x3/4x4/5x5 room -- and since donjonDungeon.js only ever generates 3- or
// 5-cell room dimensions (see its own ROOM_MIN_SIZE/ROOM_MAX_SIZE), a
// non-square 3x5 (or 5x3) room -- "size 4" on average -- lands on the same
// formula's 5 slots too, rather than needing a separate lookup table.
function roomGrubCount(rawRoom) {
  return rawRoom.w + rawRoom.h - 3;
}
const GRUB_ROOM_MARGIN = 50;
// A hallway only ever gets a grub if it's a straight run of at least this
// many raw grid cells (see findLongHallways) -- a short jog between two
// rooms stays empty. A qualifying hallway's own grub count then scales with
// its length (one per HALLWAY_GRUB_SPACING cells, capped at
// HALLWAY_MAX_GRUBS), patrolling that hallway alone (see
// pickGrubSpawn/Grub's own room-confinement, reused unchanged for a
// hallway's box).
const HALLWAY_MIN_LENGTH = 4;
const HALLWAY_GRUB_SPACING = 4;
const HALLWAY_MAX_GRUBS = 3;
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

// A grub's spawn point within its room (world space), scattered randomly
// via `rng` across the room's own interior (inset by GRUB_ROOM_MARGIN off
// its walls). The spawn room is enemy-free, so no player-distance check is
// needed here.
function pickGrubSpawn(room, rng) {
  const minX = room.x - room.w / 2 + GRUB_ROOM_MARGIN;
  const maxX = room.x + room.w / 2 - GRUB_ROOM_MARGIN;
  const minY = room.y - room.h / 2 + GRUB_ROOM_MARGIN;
  const maxY = room.y + room.h / 2 - GRUB_ROOM_MARGIN;
  const x = minX <= maxX ? minX + rng() * (maxX - minX) : room.x;
  const y = minY <= maxY ? minY + rng() * (maxY - minY) : room.y;
  return { x, y };
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
// while staying inside the room; see pickGrubSpawn).
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
  return Math.hypot(cx - other.x, cy - other.y) - cr - other.r;
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
// Used by chest placement -- a chest is best-effort (goes without rather
// than fighting for a better spot), so the first clear candidate is fine.
function findClearSpot(room, margin, radius, attempts, rng, walls, circles, entrances) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = pickPointInRoom(room, margin, rng);
    if (isClearSpot(candidate.x, candidate.y, radius, walls, circles, entrances)) return candidate;
  }
  return null;
}

// Like findClearSpot, but spends its whole attempt budget and keeps
// whichever clear candidate landed closest to the room's own center,
// instead of settling for the first one that happened to pass. Used for
// chalice placement, which should hug room center as hard as the
// walls/obstacles/doorway clearance rules allow rather than just being
// clear of them.
function findCenterMostClearSpot(room, margin, radius, attempts, rng, walls, circles, entrances) {
  let best = null;
  let bestDistance = Infinity;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = pickPointInRoom(room, margin, rng);
    if (!isClearSpot(candidate.x, candidate.y, radius, walls, circles, entrances)) continue;
    const distance = Math.hypot(candidate.x - room.x, candidate.y - room.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
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

// Finds every run of at least HALLWAY_MIN_LENGTH consecutive non-room floor
// cells along a row or column in the *raw* (pre-inflation) grid -- a cheap
// stand-in for "a long, mostly-straight corridor stretch" that doesn't try
// to reason about turns/junctions the way a true single-cell-wide-corridor
// graph walk would (a run can validly include a turn near one end), each
// returned as a {x, y, w, h} box in that same raw grid -- the caller
// inflates/converts to world space itself, same as it already does for
// dungeon.rooms.
function findLongHallways(rawDungeon) {
  const floorSet = new Set(rawDungeon.floor.map(({ x, y }) => `${x},${y}`));
  const isRoomCell = (x, y) => rawDungeon.rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const isCorridor = (x, y) => floorSet.has(`${x},${y}`) && !isRoomCell(x, y);
  const hallways = [];

  function scan(outer, inner, alongX) {
    for (let a = 0; a < outer; a++) {
      let start = null;
      for (let b = 0; b <= inner; b++) {
        if (b < inner && isCorridor(...(alongX ? [b, a] : [a, b]))) {
          if (start === null) start = b;
          continue;
        }
        if (start !== null && b - start >= HALLWAY_MIN_LENGTH) {
          hallways.push(alongX
            ? { x: start, y: a, w: b - start, h: 1, length: b - start }
            : { x: a, y: start, w: 1, h: b - start, length: b - start });
        }
        start = null;
      }
    }
  }
  scan(rawDungeon.gh, rawDungeon.gridWidth, true);
  scan(rawDungeon.gridWidth, rawDungeon.gh, false);

  return hallways;
}

// Builds the dungeon's walls as CubeObstacles and returns a world-space
// spawn point (the center of its first room). `seed` drives the whole
// layout; pillar placement and grub scatter/patrol each offset from it so
// they don't replay the room layout's own random sequence.
function buildDungeon(seed) {
  const pillarSeed = seed + 1;
  const grubSeed = seed + 2;
  const chestSeed = seed + 3;
  const hallwayGrubSeed = seed + 7;
  // `dungeon` (and every room/obstacle placement below, including chests)
  // works entirely off this already-inflated result, never the raw
  // generateDungeon() output -- so chest placement's own room bounds and
  // obstacle clearance checks are always in the same post-inflation world
  // scale as the walls/pillars/grubs actually added to the engine. The raw
  // (pre-inflation) result is kept too, purely so findLongHallways can
  // analyze corridor shape while it's still exactly one grid cell wide --
  // trivial to reason about -- rather than after inflateDungeon widens
  // every passage into a CORRIDOR_WIDTH_FACTOR-cell-thick block.
  const rawDungeon = generateDungeon(seed);
  const dungeon = inflateDungeon(rawDungeon, CORRIDOR_WIDTH_FACTOR);
  const combatRoomIndices = selectCombatRooms(dungeon.rooms.length, seed + 6);
  const toWorld = (x, y) => gridToWorld(x, y, dungeon.gridWidth, dungeon.gh);
  const floorSet = new Set(dungeon.floor.map(({ x, y }) => `${x},${y}`));
  const nonSpawnRoomIndices = dungeon.rooms.map((_, i) => i).filter((i) => i !== 0);
  // A room's entrance cells (grid) as world-space points, radius 0 -- fed
  // into findClearSpot/isClearSpot's "circles" clearance check.
  const roomEntrancePoints = (room) => findEntranceCells(room, floorSet).map((cell) => {
    const world = toWorld(cell.x, cell.y);
    return { x: world.x, y: world.y, r: 0 };
  });

  // Every chest's contents are decided right here, all at once -- not
  // rolled the moment a chest actually breaks. The spawn room's own chest
  // (a "starter crate") is 50/50 a bubble shield or one specific,
  // uniformly-chosen ability item. Every *other* ability -- all 5, minus
  // whichever one (if any) the crate just claimed -- gets assigned to its
  // own distinct non-spawn room's chest. Every remaining non-spawn room's
  // chest is a predetermined 50/50 health-or-shield, same odds as the old
  // roll-it-when-it-breaks behavior, just decided up front instead.
  const contentsRng = mulberry32(seed + 8);
  const starterGivesAbility = contentsRng() < 0.5;
  // Ability ids are just their own index into ITEM_ABILITY_CATALOG -- no
  // separate string id needed. That makes id 0 (battleArmor) a legitimate,
  // falsy-looking value, so every check below tests `!== undefined`
  // (a real "no ability assigned here" case) rather than plain truthiness.
  const starterAbilityId = Math.floor(contentsRng() * ITEM_ABILITY_CATALOG.length);
  const remainingAbilityIds = ITEM_ABILITY_CATALOG.map((_, id) => id)
    .filter((id) => !starterGivesAbility || id !== starterAbilityId);
  const abilityRoomIndices = shuffled(nonSpawnRoomIndices, contentsRng).slice(0, remainingAbilityIds.length);
  const roomAbilityId = new Map(abilityRoomIndices.map((roomIndex, i) => [roomIndex, remainingAbilityIds[i]]));
  resetItemAbilities();

  function chestContentsFor(roomIndex) {
    if (roomIndex === 0) {
      return starterGivesAbility
        ? (cx, cy) => Item(cx, cy, starterAbilityId)
        : (cx, cy) => BubbleShieldItem(cx, cy);
    }
    const abilityId = roomAbilityId.get(roomIndex);
    if (abilityId !== undefined) return (cx, cy) => Item(cx, cy, abilityId);
    return contentsRng() < 0.5
      ? (cx, cy) => BubbleShieldItem(cx, cy)
      : (cx, cy) => HealthItem(cx, cy);
  }

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
    obstacleCircles.push({ x: world.x, y: world.y, r: pillar.r });
  });

  const spawnRoomGrid = dungeon.rooms[0];
  const playerSpawn = toWorld(spawnRoomGrid.x + spawnRoomGrid.w / 2, spawnRoomGrid.y + spawnRoomGrid.h / 2);

  // roomGrubCount(room) enemy slots per room -- except the player's own spawn
  // room, which stays enemy-free so the run always opens on calm ground --
  // each scattered to its own spot and with its own seeded patrol, so
  // behavior stays reproducible run to run.
  dungeon.rooms.forEach((room, roomIndex) => {
    const roomCenter = toWorld(room.x + room.w / 2, room.y + room.h / 2);
    const worldRoom = {
      x: roomCenter.x, y: roomCenter.y, w: room.w * TILE, h: room.h * TILE,
    };
    const scatterRng = mulberry32(grubSeed + roomIndex);
    const typeRng = mulberry32(seed + 9 + roomIndex * 100);
    const enemies = [];
    if (roomIndex !== 0) {
      const budget = roomGrubCount(rawDungeon.rooms[roomIndex]);
      for (let spent = 0; spent < budget;) {
        const roll = typeRng();
        // Split the 30% upgraded chance evenly; downgrade to fit remaining slots.
        const type = Math.min(budget - spent - 1, roll < 0.15 ? LARGE : roll < 0.3 ? MEDIUM : SMALL);
        const spawn = pickGrubSpawn(worldRoom, scatterRng);
        const grub = add(Grub(spawn.x, spawn.y, worldRoom, grubSeed + roomIndex * 100 + enemies.length, type));
        spent += grub.enemyCost;
        enemies.push(grub);
        obstacleCircles.push({ x: spawn.x, y: spawn.y, r: grub.r });
      }
    }
    if (combatRoomIndices.has(roomIndex)) {
      // Grid coordinates name cell centers; the exact floor rectangle
      // starts half a tile before the first center, not at that center.
      const center = toWorld(room.x + (room.w - 1) / 2, room.y + (room.h - 1) / 2);
      // One tile-sized grate per corridor cell touching the room from
      // outside (the ring around it, minus corners), so a closing grate
      // can never land on -- and push out -- a player who just entered.
      const doorways = [];
      for (let i = -1; i <= room.w; i++) {
        for (let j = -1; j <= room.h; j++) {
          if ((i < 0 || i === room.w) !== (j < 0 || j === room.h) && floorSet.has(`${room.x + i},${room.y + j}`)) {
            doorways.push({ ...toWorld(room.x + i, room.y + j), w: TILE, h: TILE });
          }
        }
      }
      add(CombatRoom({ ...center, w: room.w * TILE, h: room.h * TILE }, doorways, enemies));
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
      add(TreasureChest(chestSpawn.x, chestSpawn.y, chestContentsFor(roomIndex)));
      // So a chalice placed afterward (see below) won't land on top of it.
      obstacleCircles.push({ x: chestSpawn.x, y: chestSpawn.y, r: CHEST_RADIUS });
    }
  });

  // A grub or two garrisoned in some of the dungeon's longer hallways
  // (see findLongHallways/HALLWAY_MIN_LENGTH), confined to that one
  // hallway's own box exactly the way a room grub is confined to its room
  // -- pickGrubSpawn and Grub's own patrol bounds don't care whether the
  // box they're given is a room or a corridor.
  const hallwayRng = mulberry32(hallwayGrubSeed);
  findLongHallways(rawDungeon).forEach((hallway, hallwayIndex) => {
    const inflated = {
      x: hallway.x * CORRIDOR_WIDTH_FACTOR,
      y: hallway.y * CORRIDOR_WIDTH_FACTOR,
      w: hallway.w * CORRIDOR_WIDTH_FACTOR,
      h: hallway.h * CORRIDOR_WIDTH_FACTOR,
    };
    const center = toWorld(inflated.x + inflated.w / 2, inflated.y + inflated.h / 2);
    const worldHallway = {
      x: center.x, y: center.y, w: inflated.w * TILE, h: inflated.h * TILE,
    };
    const grubCount = Math.min(HALLWAY_MAX_GRUBS, Math.floor(hallway.length / HALLWAY_GRUB_SPACING));
    for (let i = 0; i < grubCount; i++) {
      const spawn = pickGrubSpawn(worldHallway, hallwayRng);
      const grub = add(Grub(spawn.x, spawn.y, worldHallway, hallwayGrubSeed + hallwayIndex * 100 + i));
      obstacleCircles.push({ x: spawn.x, y: spawn.y, r: grub.r });
    }
  });

  // The level's Chalices of Pegacorn Blood -- clear of every obstacle and
  // doorway like a chest, but pulled harder toward room center: it keeps
  // its whole attempt budget's best candidate rather than a chest's first
  // clear one (see findCenterMostClearSpot). Exactly
  // round(CHALICE_ROOM_FRACTION * non-spawn rooms) of
  // them get one -- the count is computed up front and that many distinct
  // rooms are shuffled into, so the target is always hit precisely rather
  // than each room flipping its own coin and the dungeon as a whole
  // landing wherever that happens to fall (including, unluckily, zero).
  // Runs after the loop above so wallBoxes/obstacleCircles already
  // reflect every wall, pillar, grub, and chest across the whole dungeon,
  // not just whichever rooms happened to be processed first.
  const chaliceRng = mulberry32(seed + 4);
  const chaliceRoomCount = Math.round(nonSpawnRoomIndices.length * CHALICE_ROOM_FRACTION);
  const chaliceRoomIndices = shuffled(nonSpawnRoomIndices, chaliceRng).slice(0, chaliceRoomCount);

  chaliceRoomIndices.forEach((roomIndex) => {
    const room = dungeon.rooms[roomIndex];
    const roomCenter = toWorld(room.x + room.w / 2, room.y + room.h / 2);
    const worldRoom = {
      x: roomCenter.x, y: roomCenter.y, w: room.w * TILE, h: room.h * TILE,
    };
    // Chosen for a chalice, so unlike a chest this never gives up on the
    // room -- it falls back to an unchecked (but still center-biased)
    // point rather than skipping entirely and silently shrinking the
    // required total below the count just committed to above.
    const spawn = findCenterMostClearSpot(worldRoom, CHALICE_ROOM_MARGIN, CHALICE_RADIUS, CHALICE_PLACEMENT_ATTEMPTS, chaliceRng, wallBoxes, obstacleCircles, roomEntrancePoints(room))
      || pickPointInRoom(worldRoom, CHALICE_ROOM_MARGIN, chaliceRng);
    add(Chalice(spawn.x, spawn.y));
  });
  resetChalices(chaliceRoomIndices.length);

  // The dungeon's own world-space bounding box -- always square, and always
  // this same fixed size/position for every seed (see donjonDungeon.js's
  // own GRID_WIDTH/GRID_HEIGHT and computeWalls: every uncarved cell,
  // including the whole boundary ring, is a wall, so it always fills the
  // grid to its edges). mapWorldMin is offset an extra half-TILE beyond
  // -mapWorldSpan/2 because a merged wall rect's own world center (see the
  // wall-adding loop above) is keyed off its *cell-center* grid coordinate,
  // not its edge -- so the very first cell's left/top edge actually sits
  // half a tile before gridToWorld(0, 0), not exactly at it. Handed to
  // MiniMap so it can scale itself once at map-build time instead of
  // re-deriving a wall bounding box from scratch every single frame.
  const mapWorldSpan = dungeon.gridWidth * TILE;
  const mapWorldMin = -mapWorldSpan / 2 - TILE / 2;
  return {
    ...playerSpawn, mapWorldSpan, mapWorldMin,
  };
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
  const itemAbilityHUD = add(ItemAbilityHUD());
  const miniMap = add(MiniMap(player, spawn.mapWorldSpan, spawn.mapWorldMin));
  add(ToastSystem());
  // Shown instantly (not after any delay) since it's establishing the
  // whole game's premise, not reacting to something the player just did.
  showToast('Collect all Pegacorn Blood Chalices to win!');
  add(Camera());
  const dragController = add(DragController(player));
  return {
    player, dragController, playerHealthHUD, chaliceHUD, itemAbilityHUD, miniMap,
  };
}

export default createMap;
