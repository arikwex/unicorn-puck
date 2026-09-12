import generateDungeon from '../../src/donjonDungeon.js';

// Mirrors mapCreator.js's own virtual widening of the generator's grid:
// room rectangles scaled by CORRIDOR_WIDTH_FACTOR, plus a floor test that
// maps a widened cell back to the raw cell containing it. Kept here so the
// tests exercise the same widened coordinates mapCreator.js places in
// without reaching into createMap.
const FACTOR = 3;

function widenedDungeon(seed) {
  const raw = generateDungeon(seed);
  const rawFloor = new Set(raw.floor.map(({ x, y }) => `${x},${y}`));
  return {
    rooms: raw.rooms.map(({ x, y, w, h }) => ({
      x: x * FACTOR, y: y * FACTOR, w: w * FACTOR, h: h * FACTOR,
    })),
    size: raw.size * FACTOR,
    isFloor: (x, y) => rawFloor.has(`${(x / FACTOR) | 0},${(y / FACTOR) | 0}`),
  };
}

export { widenedDungeon, FACTOR };
