import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { selectCombatRooms } from '../src/combatRoomLayout.js';
import generateDungeon from '../src/donjonDungeon.js';
import inflateDungeon from '../src/inflateDungeon.js';
import { findEntranceCells } from '../src/placePillars.js';

const listeners = new Map();
const canvas = {
  style: {},
  getContext: () => ({}),
  addEventListener: (event, callback) => listeners.set(event, callback),
  removeEventListener(event, callback) {
    if (listeners.get(event) === callback) listeners.delete(event);
  },
};
globalThis.document = { querySelector: () => canvas };
globalThis.window = {};
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
let sounds = [];
globalThis.AudioContext = class {
  sampleRate = 1000;
  state = 'running';
  currentTime = 0;
  destination = {};
  createGain() {
    return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} }, connect() {} };
  }
  createBuffer(channels, length) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource() {
    return { playbackRate: { value: 1 }, connect() {}, stop() {}, start() { sounds.push(this.buffer); } };
  }
};

const { add, clear, getObjects, getObjectsByTag, remove } = await import('../src/engine.js');
const { default: CombatRoom } = await import('../src/CombatRoom.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: GrubProjectile } = await import('../src/GrubProjectile.js');
const { default: MetalGrate } = await import('../src/MetalGrate.js');
const { default: ToastSystem } = await import('../src/ToastSystem.js');
const { TAG_OBSTACLE, TAG_PLAYER, TAG_COMBAT_ROOM } = await import('../src/tags.js');
const { default: createMap } = await import('../src/mapCreator.js');
const { default: startGameFlow } = await import('../src/GameFlow.js');
const { chaliceProgress, collectChalice } = await import('../src/chaliceProgress.js');
const { default: contact } = await import('../src/physics.js');

afterEach(() => { clear(); sounds = []; });

// CombatRoom.js's numeric state ids.
const [READY, ACTIVE, CLEARED] = [0, 1, 2];

// The one message the scene's ToastSystem is currently showing, if any.
function toastText(toasts) {
  let text;
  toasts.hud(new Proxy({ measureText: () => ({ width: 1 }) }, {
    get: (target, key) => target[key] ?? (key === 'fillText' ? (value) => { text = value; } : () => {}),
  }));
  return text;
}

function fixture() {
  // A 720x720 room with a corridor-wide doorway just outside each wall.
  const doors = [
    { x: -80, y: 320, w: 80, h: 240 },
    { x: 720, y: 320, w: 80, h: 240 },
    { x: 320, y: -80, w: 240, h: 80 },
    { x: 320, y: 720, w: 240, h: 80 },
  ];
  const player = add({ x: -200, y: 320, r: 38, hp: 5, tags: [TAG_PLAYER] });
  const enemies = [{ hp: 3 }, { hp: 3 }];
  const room = add(CombatRoom({ x: 320, y: 320, w: 720, h: 720 }, doors, enemies));
  return { room, doors, player, enemies };
}

test('exactly half of non-start rooms are seeded in advance (rounded for odd counts)', () => {
  for (const count of [0, 1, 2, 7, 12, 25]) {
    const chosen = selectCombatRooms(count, 123);
    assert.equal(chosen.size, Math.round(Math.max(0, count - 1) / 2));
    assert.ok(!chosen.has(0));
    assert.deepEqual(chosen, selectCombatRooms(count, 123));
  }
  assert.notDeepEqual(selectCombatRooms(25, 123), selectCombatRooms(25, 456));
});

test('generated layouts gate every open room-boundary edge, including widened corridors', () => {
  for (const seed of [1, 42, 2026]) {
    const dungeon = inflateDungeon(generateDungeon(seed), 3);
    const floor = new Set(dungeon.floor.map(({ x, y }) => `${x},${y}`));
    for (const room of dungeon.rooms) {
      // mapCreator.js closes one tile-sized grate over each entrance cell.
      const entrances = new Set(findEntranceCells(room, floor).map(({ x, y }) => `${x},${y}`));
      assert.ok(entrances.size > 0);
      for (let x = room.x; x < room.x + room.w; x++) {
        for (let y = room.y; y < room.y + room.h; y++) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx; const ny = y + dy;
            if (nx >= room.x && nx < room.x + room.w && ny >= room.y && ny < room.y + room.h) continue;
            if (!floor.has(`${x},${y}`) || !floor.has(`${nx},${ny}`)) continue;
            assert.ok(entrances.has(`${x},${y}`));
          }
        }
      }
    }
  }
});

test('entering locks once; only that room’s final kill opens all gates with eight splats apiece', () => {
  const { room, player, enemies, doors } = fixture();
  const toasts = add(ToastSystem());
  room.tick();
  assert.equal(room.state, READY);
  assert.equal(sounds.length, 0);
  player.x = 320;
  const before = getObjects().length;
  room.tick();
  assert.equal(room.state, ACTIVE);
  assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 4);
  assert.equal(getObjects().length - before, doors.length * 9, 'one grate + eight splats per doorway');
  assert.equal(toastText(toasts), 'Defeat all enemies to exit room');
  assert.equal(sounds.length, 1);
  room.tick();
  assert.equal(sounds.length, 1);
  enemies[0].hp = 0;
  room.tick();
  assert.equal(room.state, ACTIVE);
  const beforeClear = getObjects().length;
  enemies[1].hp = 0;
  room.tick();
  assert.equal(room.state, CLEARED);
  assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 0);
  assert.equal(getObjects().length - beforeClear, doors.length * 7, 'remove four gates, add 32 splats');
  assert.equal(sounds.length, 2);
  player.x = -200; room.tick(); player.x = 0; room.tick();
  assert.equal(sounds.length, 2, 'cleared rooms do not reactivate');
});

test('activation waits for full player clearance plus padding at every edge and corner', () => {
  for (const radius of [38, 60]) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const { room, player, doors } = fixture();
      player.r = radius;
      function enter(depth) {
        player.x = 320 + dx * (360 - depth);
        player.y = 320 + dy * (360 - depth);
        room.tick();
      }
      for (const depth of [-10, 0, 1, radius - 1, radius, radius + 15]) {
        enter(depth);
        assert.equal(room.state, READY, 'touching or partially entering the room must not lock it');
        assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 0);
      }
      enter(radius + 17);
      assert.equal(room.state, ACTIVE);
      for (const door of doors) {
        assert.ok(!contact(player, MetalGrate(door)), 'closure never overlaps the player');
      }
      clear();
    }
  }
});

test('active grates resolve player overlap inward on every side through the collision pass', () => {
  const { room, player, doors } = fixture();
  remove(player);
  const body = add(PlayerCharacter(320, 320));
  room.tick();
  for (const [x, y, axis, direction] of [[-39, 320, 'x', 1], [679, 320, 'x', -1], [320, -39, 'y', 1], [320, 679, 'y', -1]]) {
    body.x = x; body.y = y;
    const before = body[axis];
    body.tick(0);
    assert.ok((body[axis] - before) * direction > 0, 'closure pushes toward the room interior');
    for (const door of doors) assert.ok(!contact(body, MetalGrate(door)));
  }
});

test('empty rooms stay open and removing an active controller cleans up gates silently', () => {
  const { room, player, enemies } = fixture();
  enemies.forEach((enemy) => { enemy.hp = 0; });
  player.x = 320; room.tick();
  assert.equal(room.state, CLEARED);
  assert.equal(sounds.length, 0);
  const second = add(CombatRoom(room.bounds, [{ x: -80, y: 320, w: 80, h: 240 }], [{ hp: 1 }]));
  second.tick();
  assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 1);
  remove(second);
  assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 0);
  assert.equal(sounds.length, 1);
});

test('normal launches and projectiles stop at grates at 60 fps', () => {
  const { room, player } = fixture();
  remove(player);
  const body = add(PlayerCharacter(320, 320));
  room.tick();
  for (const [vx, vy] of [[-1800, 0], [1800, 0], [0, -1800], [0, 1800]]) {
    body.x = 320; body.y = 320; body.vx = vx; body.vy = vy;
    for (let i = 0; i < 30; i++) body.tick(1 / 60);
    assert.ok(body.x >= -2 && body.x <= 642 && body.y >= -2 && body.y <= 642);
    assert.ok(body.vx * vx + body.vy * vy < 0, 'grates bounce launches inward');
  }
  remove(body);
  const shot = add(GrubProjectile(320, 320, -340, 0));
  for (let i = 0; i < 90 && getObjects().includes(shot); i++) if (shot.tick(1 / 60)) remove(shot);
  assert.ok(!getObjects().includes(shot));
  assert.ok(shot.x > -40, 'the grate stops the shot');
});

test('combat cue has a strong onset, a long decaying tail, and finite unclipped samples', () => {
  const { room, player } = fixture();
  player.x = 320; room.tick();
  const samples = sounds[0].getChannelData(0);
  assert.equal(samples.length, 3200);
  assert.ok(samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 1));
  const rms = (start, end) => Math.sqrt(samples.slice(start, end).reduce((sum, v) => sum + v * v, 0) / (end - start));
  assert.ok(rms(0, 200) > rms(2000, 2500) * 5);
  assert.ok(rms(2000, 2500) > 0.001, 'bass tail still rings after two seconds');
});

test('map creation attaches seeded combat rooms to their weighted enemy budget and excludes spawn', () => {
  const seed = 42;
  const { player } = createMap(seed);
  const controllers = getObjectsByTag(TAG_COMBAT_ROOM);
  const types = controllers.map((room) => room.enemies.map((enemy) => enemy.type));
  assert.ok(types.flat().includes(1), 'the seeded map includes medium grubs');
  const dungeon = inflateDungeon(generateDungeon(seed), 3);
  assert.equal(controllers.length, Math.round((dungeon.rooms.length - 1) / 2));
  for (const room of controllers) {
    const budget = Math.round((room.bounds.w + room.bounds.h) / (3 * 60 * Math.SQRT2)) - 3;
    assert.equal(room.enemies.reduce((sum, enemy) => sum + enemy.enemyCost, 0), budget);
    assert.ok(room.enemies.every((enemy) => getObjects().includes(enemy)));
    assert.ok(Math.abs(player.x - room.bounds.x) >= room.bounds.w / 2
      || Math.abs(player.y - room.bounds.y) >= room.bounds.h / 2);
    room.tick();
    assert.equal(room.state, READY);
  }
  const room = controllers[0];
  const unlocked = new Set(getObjectsByTag(TAG_OBSTACLE));
  player.x = room.bounds.x; player.y = room.bounds.y;
  room.tick();
  assert.equal(room.state, ACTIVE);
  const grates = getObjectsByTag(TAG_OBSTACLE).filter((object) => !unlocked.has(object));
  assert.ok(grates.length > 0);
  room.enemies.forEach((enemy) => { enemy.hp = 0; });
  room.tick();
  assert.equal(room.state, CLEARED);
  assert.ok(grates.every((grate) => !getObjects().includes(grate)));
  clear();
  createMap(seed);
  assert.deepEqual(getObjectsByTag(TAG_COMBAT_ROOM).map((room) => room.enemies.map((enemy) => enemy.type)), types);
  assert.ok(getObjectsByTag(TAG_COMBAT_ROOM).every((room) => room.state === READY));
  assert.equal(getObjectsByTag(TAG_OBSTACLE).length, unlocked.size, 'a fresh map starts with every gate open');
});

test('seeded rooms include all three grub types and always spend their exact enemy budget', () => {
  const types = new Set();
  for (const seed of [1, 2, 3, 42]) {
    clear();
    createMap(seed);
    for (const room of getObjectsByTag(TAG_COMBAT_ROOM)) {
      const budget = Math.round((room.bounds.w + room.bounds.h) / (3 * 60 * Math.SQRT2)) - 3;
      assert.equal(room.enemies.reduce((sum, enemy) => sum + enemy.enemyCost, 0), budget);
      for (const enemy of room.enemies) {
        types.add(enemy.type);
        assert.equal(enemy.enemyCost, enemy.type + 1);
      }
    }
  }
  assert.deepEqual(types, new Set([0, 1, 2]));
});

test('generated grates close in the corridors, never on a player who just triggered the lock', () => {
  for (const seed of [1, 42, 2026]) {
    clear();
    const { player } = createMap(seed);
    for (const room of getObjectsByTag(TAG_COMBAT_ROOM)) {
      const open = new Set(getObjectsByTag(TAG_OBSTACLE));
      const { x, y, w, h } = room.bounds;
      player.x = x; player.y = y;
      room.enemies.forEach((enemy) => Object.assign(enemy, { x, y })); // clear of every doorway
      room.tick();
      const grates = getObjectsByTag(TAG_OBSTACLE).filter((object) => !open.has(object));
      assert.ok(grates.length > 0);
      for (const grate of grates) {
        const gapX = Math.abs(grate.x - x) - (w + grate.w) / 2;
        const gapY = Math.abs(grate.y - y) - (h + grate.h) / 2;
        assert.ok(Math.max(gapX, gapY) > -1e-6, 'grate lies outside the room');
        assert.ok(Math.abs(Math.max(gapX, gapY)) < 1e-6, 'grate is flush with the room edge');
        // Just past the activation line, straight in from this grate.
        const inset = player.r + 16 + 1e-3;
        const [nx, ny] = gapX > gapY ? [Math.sign(grate.x - x), 0] : [0, Math.sign(grate.y - y)];
        Object.assign(player, { x: nx ? x + nx * (w / 2 - inset) : grate.x, y: ny ? y + ny * (h / 2 - inset) : grate.y });
        assert.ok(grates.every((other) => !contact(player, other)), 'closing grates never overlap the player');
        // Backing straight out at full launch speed (30 fps) still bounces back in.
        Object.assign(player, { vx: nx * 1800, vy: ny * 1800 });
        for (let i = 0; i < 20; i++) player.tick(1 / 30);
        assert.ok(Math.abs(player.x - x) < w / 2 && Math.abs(player.y - y) < h / 2, 'no escaping a locked room');
      }
      room.enemies.forEach((enemy) => { enemy.hp = 0; });
      room.tick();
    }
  }
});

test('collecting the final chalice cannot win until the active combat room is cleared', () => {
  startGameFlow();
  listeners.get('pointerdown')();
  const player = getObjectsByTag(TAG_PLAYER)[0];
  const room = getObjectsByTag(TAG_COMBAT_ROOM)[0];
  player.x = room.bounds.x; player.y = room.bounds.y;
  room.tick();
  assert.equal(room.state, ACTIVE);
  const total = chaliceProgress().required;
  for (let i = 0; i < total; i++) collectChalice();
  function updateScene() {
    const expired = getObjects().filter((object) => object.tick?.(0));
    remove(expired);
  }
  updateScene();
  assert.ok(getObjects().includes(player), 'victory is deferred while exits are locked');
  room.enemies.forEach((enemy) => { enemy.hp = 0; });
  updateScene();
  assert.equal(room.state, CLEARED);
  assert.ok(!getObjects().includes(player), 'victory proceeds after the final kill');
});
