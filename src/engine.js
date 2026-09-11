import { canvas, ctx } from './canvas.js';
import { renderScreenHUD } from './hud.js';
import { TAG_CAMERA } from './tags.js';

let objects = [];
let objectsByTag = new Map();
let running = false;
let lastFrame = 0;
let startedAt = 0;

function add(object) {
  objects.push(object);
  objects.sort((a, b) => (a.z || 0) - (b.z || 0));
  object.tags?.forEach((objectTag) => index(object, objectTag));
  object.start?.();
  return object;
}

function index(object, objectTag) {
  let tagged = objectsByTag.get(objectTag);
  if (!tagged) objectsByTag.set(objectTag, tagged = new Set());
  tagged.add(object);
}

function tag(object, objectTag) {
  object.tags ||= [];
  if (!object.tags.includes(objectTag)) object.tags.push(objectTag);
  index(object, objectTag);
  return object;
}

function untag(object, objectTag) {
  object.tags = object.tags?.filter((value) => value !== objectTag) || [];
  objectsByTag.get(objectTag)?.delete(object);
  return object;
}

function remove(objectOrObjects) {
  const removed = new Set(Array.isArray(objectOrObjects) ? objectOrObjects : [objectOrObjects]);
  objects = objects.filter((object) => !removed.has(object));
  removed.forEach((object) => {
    object.tags?.forEach((objectTag) => objectsByTag.get(objectTag)?.delete(object));
    object.destroy?.();
  });
}

function clear() {
  objects.forEach((object) => object.destroy?.());
  objects = [];
  objectsByTag = new Map();
}

function getObjectsByTag(objectTag) {
  return [...(objectsByTag.get(objectTag) || [])];
}

function getObjects() {
  return [...objects];
}

function tick(now) {
  if (!running) return;
  const dt = Math.min((now - lastFrame) / 1000, 1 / 20) || 0;
  lastFrame = now;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  const expired = [];
  // Callbacks may add effects and re-sort objects. Iterate a snapshot so
  // every object present at the start of the phase updates exactly once.
  [...objects].map((object) => {
    if (object.tick?.(dt)) expired.push(object);
  });
  if (expired.length) remove(expired);

  const camera = getObjectsByTag(TAG_CAMERA)[0];
  camera?.set(ctx);
  // Re-sorted fresh every frame (rather than reusing the add-time order
  // used for updates) so an object whose draw order (`z`) it recomputes each tick
  // -- e.g. the player keying it off its own y, for depth sorting -- is drawn
  // in its current order immediately, not just after its next add().
  [...objects].sort((a, b) => (a.z || 0) - (b.z || 0)).map((object) => object.render?.(ctx));

  ctx.restore();

  // HUD objects draw last in canvas pixels, independent of camera or depth.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  [...objects].map((object) => renderScreenHUD(object, ctx));
  ctx.restore();
  requestAnimationFrame(tick);
}

function start() {
  if (running) return;
  running = true;
  startedAt = Date.now();
  lastFrame = performance.now();
  requestAnimationFrame(tick);
}

function stop() {
  running = false;
}

function getStartTime() {
  return startedAt;
}

export { add, clear, getObjects, getObjectsByTag, getStartTime, remove, start, stop, tag, untag };
