import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { findRoomDoorways, selectCombatRooms } from '../src/combatRoomLayout.js';
import generateDungeon from '../src/donjonDungeon.js';
import inflateDungeon from '../src/inflateDungeon.js';

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
const { default: PhysicsWorld } = await import('../src/PhysicsWorld.js');
const { default: MetalGrate } = await import('../src/MetalGrate.js');
const { TAG_PLAYER, TAG_PUCK, TAG_OBSTACLE, TAG_PROJECTILE, TAG_COMBAT_ROOM } = await import('../src/tags.js');
const { default: createMap } = await import('../src/mapCreator.js');
const { default: startGameFlow } = await import('../src/GameFlow.js');
const { chaliceProgress, collectChalice } = await import('../src/chaliceProgress.js');
const bus = await import('../src/bus.js');
const { circleBoxContact } = await import('../src/physics.js');

afterEach(() => { clear(); bus.clear(); sounds = []; });

const tile = 80;
const toWorld = (x, y) => ({ x: x * tile, y: y * tile });

function fixture() {
  const gridRoom = { x: 0, y: 0, w: 9, h: 9 };
  const floor = new Set();
  for (let x = 0; x < 9; x++) for (let y = 0; y < 9; y++) floor.add(`${x},${y}`);
  for (let i = 3; i < 6; i++) {
    floor.add(`-1,${i}`); floor.add(`9,${i}`);
    floor.add(`${i},-1`); floor.add(`${i},9`);
  }
  const doors = findRoomDoorways(gridRoom, floor, tile, toWorld);
  const player = add({ x: -200, y: 320, radius: 38, hp: 5, tags: [TAG_PLAYER] });
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

test('all four doorways are merged to full corridor width and placed outside the room', () => {
  const { doors } = fixture();
  assert.deepEqual(doors, [
    { x: -80, y: 320, w: 80, h: 240 },
    { x: 720, y: 320, w: 80, h: 240 },
    { x: 320, y: -80, w: 240, h: 80 },
    { x: 320, y: 720, w: 240, h: 80 },
  ]);
});

test('separate openings on one wall and corner openings are not skipped or merged across stone', () => {
  const room = { x: 0, y: 0, w: 9, h: 9 };
  const floor = new Set(['0,0', '-1,0', '0,-1', '0,1', '-1,1', '0,6', '-1,6']);
  const doors = findRoomDoorways(room, floor, tile, toWorld);
  assert.equal(doors.length, 3);
  assert.deepEqual(doors.map(({ w, h }) => [w, h]), [[80, 160], [80, 80], [80, 80]]);
});

test('generated layouts cover every open room-boundary edge, including widened corridors', () => {
  for (const seed of [1, 42, 2026]) {
    const dungeon = inflateDungeon(generateDungeon(seed), 3);
    const floor = new Set(dungeon.floor.map(({ x, y }) => `${x},${y}`));
    for (const room of dungeon.rooms) {
      const doors = findRoomDoorways(room, floor, tile, toWorld);
      assert.ok(doors.length > 0);
      for (let x = room.x; x < room.x + room.w; x++) {
        for (let y = room.y; y < room.y + room.h; y++) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx; const ny = y + dy;
            if (nx >= room.x && nx < room.x + room.w && ny >= room.y && ny < room.y + room.h) continue;
            if (!floor.has(`${x},${y}`) || !floor.has(`${nx},${ny}`)) continue;
            const point = toWorld(nx, ny);
            assert.ok(doors.some((door) => Math.abs(point.x - door.x) <= (door.w - tile) / 2 + 1e-8
              && Math.abs(point.y - door.y) <= (door.h - tile) / 2 + 1e-8));
          }
        }
      }
    }
  }
});

test('entering locks once; only that room’s final kill opens all gates with eight splats apiece', () => {
  const { room, player, enemies, doors } = fixture();
  const notifications = [];
  bus.on('toast', (event) => notifications.push(event));
  room.update();
  assert.equal(room.state, 'ready');
  assert.equal(sounds.length, 0);
  player.x = 320;
  const before = getObjects().length;
  room.update();
  assert.equal(room.state, 'active');
  assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 4);
  assert.equal(getObjects().length - before, doors.length * 9, 'one grate + eight splats per doorway');
  assert.deepEqual(notifications, [{ message: 'Defeat all enemies to exit room', priority: true }]);
  assert.equal(sounds.length, 1);
  room.update();
  assert.equal(sounds.length, 1);
  enemies[0].hp = 0;
  room.update();
  assert.equal(room.state, 'active');
  const beforeClear = getObjects().length;
  enemies[1].hp = 0;
  room.update();
  assert.equal(room.state, 'cleared');
  assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 0);
  assert.equal(getObjects().length - beforeClear, doors.length * 7, 'remove four gates, add 32 splats');
  assert.equal(sounds.length, 2);
  player.x = -200; room.update(); player.x = 0; room.update();
  assert.equal(sounds.length, 2, 'cleared rooms do not reactivate');
});

test('activation waits for full player clearance plus padding at every edge and corner', () => {
  for (const radius of [38, 60]) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
      const { room, player, doors } = fixture();
      player.radius = radius;
      function enter(depth) {
        player.x = 320 + dx * (360 - depth);
        player.y = 320 + dy * (360 - depth);
        room.update();
      }
      for (const depth of [-10, 0, 1, radius - 1, radius, radius + 15]) {
        enter(depth);
        assert.equal(room.state, 'ready', 'touching or partially entering the room must not lock it');
        assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 0);
      }
      enter(radius + 17);
      assert.equal(room.state, 'active');
      for (const door of doors) {
        assert.equal(circleBoxContact(player, MetalGrate(door).puck()), null, 'closure never overlaps the player');
      }
      clear();
    }
  }
});

test('active grates resolve player overlap inward on every side through the collision pass', () => {
  const { room, player, doors } = fixture();
  remove(player);
  const body = add({
    x: 320, y: 320, radius: 38, hp: 5, mass: 1, vx: 0, vy: 0, omega: 0,
    viscosity: 0, angularViscosity: 0, bounciness: 0.4, tags: [TAG_PLAYER, TAG_PUCK],
    puck() { return this; },
  });
  room.update();
  const physics = PhysicsWorld();
  for (const [x, y, axis, direction] of [[-39, 320, 'x', 1], [679, 320, 'x', -1], [320, -39, 'y', 1], [320, 679, 'y', -1]]) {
    body.x = x; body.y = y;
    const before = body[axis];
    physics.physicsUpdate(0);
    assert.ok((body[axis] - before) * direction > 0, 'closure pushes toward the room interior');
    for (const door of doors) assert.equal(circleBoxContact(body, MetalGrate(door).puck()), null);
  }
});

test('empty rooms stay open and removing an active controller cleans up gates silently', () => {
  const { room, player, enemies } = fixture();
  enemies.forEach((enemy) => { enemy.hp = 0; });
  player.x = 320; room.update();
  assert.equal(room.state, 'cleared');
  assert.equal(sounds.length, 0);
  const second = add(CombatRoom(room.bounds, [{ x: -80, y: 320, w: 80, h: 240 }], [{ hp: 1 }]));
  second.update();
  assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 1);
  remove(second);
  assert.equal(getObjectsByTag(TAG_OBSTACLE).length, 0);
  assert.equal(sounds.length, 1);
});

test('fast launches cannot tunnel through any grate and projectiles also stop at them', () => {
  const { room, player } = fixture();
  remove(player);
  const body = add({
    x: 320, y: 320, radius: 38, hp: 5, mass: 1, vx: 0, vy: 0, omega: 0,
    viscosity: 0, angularViscosity: 0, bounciness: 0.4, tags: [TAG_PLAYER, TAG_PUCK],
    puck() { return this; },
  });
  room.update();
  const physics = PhysicsWorld();
  for (const [vx, vy] of [[-12000, 0], [12000, 0], [0, -12000], [0, 12000]]) {
    body.x = 320; body.y = 320; body.vx = vx; body.vy = vy;
    physics.physicsUpdate(0.05);
    assert.ok(body.x >= -2 && body.x <= 642 && body.y >= -2 && body.y <= 642);
    assert.ok(body.vx * vx + body.vy * vy < 0, 'grates bounce launches inward');
  }
  remove(body);
  let hits = 0;
  const shot = add({
    x: 320, y: 320, vx: -12000, vy: 0, radius: 17.5, tags: [TAG_PROJECTILE],
    puck() { return this; },
    onCollision() { hits++; return true; },
  });
  physics.physicsUpdate(0.05);
  assert.equal(hits, 1);
  assert.ok(!getObjects().includes(shot));
});

test('combat cue has a strong onset, a long decaying tail, and finite unclipped samples', () => {
  const { room, player } = fixture();
  player.x = 320; room.update();
  const samples = sounds[0].getChannelData(0);
  assert.equal(samples.length, 3200);
  assert.ok(samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 1));
  const rms = (start, end) => Math.sqrt(samples.slice(start, end).reduce((sum, v) => sum + v * v, 0) / (end - start));
  assert.ok(rms(0, 200) > rms(2000, 2500) * 5);
  assert.ok(rms(2000, 2500) > 0.001, 'bass tail still rings after two seconds');
});

test('map creation attaches seeded combat rooms to their own six enemies and excludes spawn', () => {
  const seed = 42;
  const { player } = createMap(seed);
  const controllers = getObjectsByTag(TAG_COMBAT_ROOM);
  const dungeon = inflateDungeon(generateDungeon(seed), 3);
  assert.equal(controllers.length, Math.round((dungeon.rooms.length - 1) / 2));
  for (const room of controllers) {
    assert.equal(room.enemies.length, 6);
    assert.ok(room.enemies.every((enemy) => getObjects().includes(enemy)));
    assert.ok(Math.abs(player.x - room.bounds.x) >= room.bounds.w / 2
      || Math.abs(player.y - room.bounds.y) >= room.bounds.h / 2);
    room.update();
    assert.equal(room.state, 'ready');
  }
  const room = controllers[0];
  player.x = room.bounds.x; player.y = room.bounds.y;
  room.update();
  assert.equal(room.state, 'active');
  const grates = getObjectsByTag(TAG_OBSTACLE).filter((object) => object.blocksSweptMotion);
  assert.ok(grates.length > 0);
  room.enemies.forEach((enemy) => { enemy.hp = 0; });
  room.update();
  assert.equal(room.state, 'cleared');
  assert.ok(grates.every((grate) => !getObjects().includes(grate)));
  clear();
  createMap(seed);
  assert.ok(getObjectsByTag(TAG_COMBAT_ROOM).every((room) => room.state === 'ready'));
  assert.equal(getObjectsByTag(TAG_OBSTACLE).filter((object) => object.blocksSweptMotion).length, 0);
});

test('collecting the final chalice cannot win until the active combat room is cleared', () => {
  startGameFlow();
  listeners.get('pointerdown')();
  const player = getObjectsByTag(TAG_PLAYER)[0];
  const room = getObjectsByTag(TAG_COMBAT_ROOM)[0];
  player.x = room.bounds.x; player.y = room.bounds.y;
  room.update();
  assert.equal(room.state, 'active');
  const total = chaliceProgress().required;
  for (let i = 0; i < total; i++) collectChalice();
  function updateScene() {
    const expired = getObjects().filter((object) => object.update?.(0));
    remove(expired);
  }
  updateScene();
  assert.ok(getObjects().includes(player), 'victory is deferred while exits are locked');
  room.enemies.forEach((enemy) => { enemy.hp = 0; });
  updateScene();
  assert.equal(room.state, 'cleared');
  assert.ok(!getObjects().includes(player), 'victory proceeds after the final kill');
});
