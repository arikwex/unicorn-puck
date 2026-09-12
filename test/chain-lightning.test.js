import './helpers/audio.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

globalThis.document = { querySelector: () => ({ getContext: () => ({}) }) };
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.addEventListener = () => {};
let sounds = 0;
AudioContext.prototype.createBufferSource = () => ({
  playbackRate: { value: 1 }, connect() {}, start() { sounds++; },
});

const { add, clear, getObjects, remove } = await import('../src/engine.js');
const { default: Grub } = await import('../src/Grub.js');
const { default: PlayerCharacter } = await import('../src/PlayerCharacter.js');
const { default: CombatRoom } = await import('../src/CombatRoom.js');
const { collectItemAbility, resetItemAbilities } = await import('../src/ItemAbility.js');
const { TAG_OBSTACLE } = await import('../src/tags.js');
const room = { x: 0, y: 0, w: 2000, h: 2000 };

afterEach(() => { clear(); resetItemAbilities(); sounds = 0; });

function enemy(x, type = 0) { return add(Grub(x, 0, room, 123, type)); }
function player(hoof = true) {
  const hero = PlayerCharacter();
  hero.chg = 0.5;
  if (hoof) collectItemAbility(3, hero);
  return hero;
}

// Freeze enemy movement while advancing the real effects and their cleanup.
function travel(dt) {
  for (const object of getObjects().filter((object) => !object.tags)) {
    if (object.tick?.(dt)) remove(object);
  }
}

function renderEffects() {
  const calls = [];
  let path = [];
  const context = new Proxy({
    globalAlpha: 1,
    createLinearGradient(...points) {
      return { points, stops: [], addColorStop(...stop) { this.stops.push(stop); } };
    },
    beginPath() { path = []; },
    moveTo(...point) { path.push(point); },
    lineTo(...point) { path.push(point); },
    stroke() { calls.push({ stroke: this.strokeStyle, width: this.lineWidth, path: [...path], alpha: this.globalAlpha }); },
    fillText(text) { calls.push({ text }); },
  }, { get: (target, key) => target[key] ?? (() => {}) });
  getObjects().filter((object) => !object.tags).forEach((object) => object.render?.(context));
  return calls;
}

test('Chromatic Hoof hits only two unique additional enemies, at 200 ms per hop', () => {
  const hero = player();
  const source = enemy(0), first = enemy(100), second = enemy(250), fourth = enemy(390);
  source.hit(hero);
  assert.deepEqual([source.hp, first.hp, second.hp, fourth.hp], [4, 5, 5, 5]);
  travel(0.199);
  assert.equal(first.hp, 5);
  travel(0.001);
  assert.deepEqual([source.hp, first.hp, second.hp], [4, 4, 5]);
  travel(0.199);
  assert.equal(second.hp, 5);
  travel(0.001);
  assert.deepEqual([source.hp, first.hp, second.hp, fourth.hp], [4, 4, 4, 5]);
  assert.equal(sounds, 3, 'one existing hit sound per damaged enemy');
  assert.equal(renderEffects().filter(({ text }) => text === '-1 hp').length, 3);
  travel(1);
  assert.equal(fourth.hp, 5);
});

test('each hop includes the 350-unit boundary and ignores dead enemies and non-enemies', () => {
  const source = enemy(0), edge = enemy(350), outside = enemy(700.01);
  enemy(50).hp = 0;
  add({ x: 20, y: 0, hp: 5, tags: [TAG_OBSTACLE], hurt() { assert.fail('not an enemy'); } });
  source.hit(player());
  travel(0.4);
  assert.equal(edge.hp, 4);
  assert.equal(outside.hp, 5);
  travel(0.3);
  assert.equal(renderEffects().filter(({ stroke }) => stroke?.stops).length, 0, 'chain ends when no target is in range');
});

test('ordinary hits, gentle bumps, and contact cooldown cannot start extra chains', () => {
  const source = enemy(0), target = enemy(100);
  const hero = player(false);
  source.hit(hero);
  travel(0.3);
  assert.equal(target.hp, 5, 'ability must be collected');
  collectItemAbility(3, hero);
  source.hit(hero);
  travel(0.3);
  assert.equal(target.hp, 5, 'rejected impact cannot start a chain');
  source.tick(0.6);
  hero.chg = 0.1;
  source.hit(hero);
  travel(0.3);
  assert.equal(target.hp, 5, 'gentle contact deals no damage');
  hero.chg = 0.5;
  source.hit(hero);
  source.hit(hero);
  travel(0.4);
  assert.equal(target.hp, 4, 'one accepted impact starts only one chain');
});

test('all enemy types take exactly one lightning damage despite horn bonuses and contact cooldown', () => {
  for (const type of [0, 1, 2]) {
    clear();
    const source = enemy(0), target = enemy(100, type);
    target.hit(player(false));
    target.vx = 13; target.vy = -7;
    const hp = target.hp;
    const hero = player();
    hero.horn = 10;
    source.hit(hero);
    travel(0.2);
    assert.equal(target.hp, hp - 1);
    assert.deepEqual([target.vx, target.vy], [13, -7], 'lightning adds no impact momentum');
    assert.equal(renderEffects().filter(({ text }) => text === '-1 hp').length, 2);
  }
});

test('killing impacts still chain, lightning kills remove enemies and clear combat', () => {
  const hero = add(player());
  hero.vx = 800;
  const source = enemy(60), first = enemy(160), second = enemy(300);
  for (const target of [source, first, second]) target.hp = 1;
  const encounter = add(CombatRoom(room, [], [source, first, second]));
  encounter.tick();
  hero.tick(0);
  assert.ok(!getObjects().includes(source));
  assert.equal(hero.vx, -320, 'old momentum boost is gone');
  travel(0.2);
  assert.ok(!getObjects().includes(first));
  encounter.tick();
  assert.equal(encounter.state, 1, 'last target is still alive during travel');
  travel(0.2);
  assert.ok(!getObjects().includes(second));
  encounter.tick();
  assert.equal(encounter.state, 2);
  assert.equal(renderEffects().filter(({ text }) => text === '-1 hp').length, 3);
});

test('a target killed during travel is not damaged again or revived', () => {
  const source = enemy(0), first = enemy(100), second = enemy(250);
  source.hit(player());
  first.hp = 0;
  remove(first);
  travel(0.4);
  assert.equal(first.hp, 0);
  assert.equal(second.hp, 4);
  assert.equal(sounds, 2, 'no extra hit sound on a corpse');
});

test('travel carries excess frame time through both hops and stops after them', () => {
  const source = enemy(0), first = enemy(100), second = enemy(250), extra = enemy(400);
  source.hit(player());
  travel(0.45);
  assert.deepEqual([first.hp, second.hp, extra.hp], [4, 4, 5]);
  travel(0.4);
  assert.equal(renderEffects().filter(({ stroke }) => stroke?.stops).length, 0);
});

test('the thicker rainbow sinusoid advances to the midpoint of each hop after 100 ms', () => {
  const source = enemy(0);
  enemy(100); enemy(250);
  source.hit(player());
  travel(0.1);
  let bolt = renderEffects().find(({ stroke }) => stroke?.stops);
  assert.equal(bolt.width, 20);
  assert.deepEqual(bolt.path[0], [0, -30]);
  assert.equal(bolt.path.at(-1)[0], 50);
  assert.ok(bolt.path.some(([, y]) => Math.abs(y + 30) > 1), 'visible sine-wave displacement');
  assert.equal(new Set(bolt.stroke.stops.map(([, color]) => color)).size, 7);
  travel(0.2);
  bolt = renderEffects().filter(({ stroke }) => stroke?.stops).at(-1);
  assert.deepEqual(bolt.path[0], [100, -30]);
  assert.ok(Math.abs(bolt.path.at(-1)[0] - 175) < 1e-8);
});

test('completed rainbow segments linger for three hop durations and fade without more damage', () => {
  const source = enemy(0), first = enemy(100), second = enemy(250);
  source.hit(player());
  travel(0.4);
  const bolts = () => renderEffects().filter(({ stroke }) => stroke?.stops);
  assert.equal(bolts().length, 2, 'both hops remain visible after the final hit');
  assert.ok(bolts()[0].alpha < bolts()[1].alpha, 'older trail fades first');
  const paths = bolts().map(({ path }) => path);
  source.x = -100; first.x = 200; second.x = 500;
  assert.deepEqual(bolts().map(({ path }) => path), paths, 'completed trails stay at impact positions');
  travel(0.201);
  assert.equal(bolts().length, 1, 'first hop expires 600 ms after it started');
  travel(0.2);
  assert.equal(bolts().length, 0, 'second hop expires 600 ms after it started');
  assert.deepEqual([source.hp, first.hp, second.hp], [4, 4, 4]);
});
