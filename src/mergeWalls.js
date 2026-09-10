// Post-processing pass that collapses a dense field of unit wall cells
// (as produced by donjonDungeon.js / inflateDungeon.js) into far fewer,
// larger rectangular obstacles spanning the same exact bounds -- purely a
// performance simplification, since a few hundred big CubeObstacles cost
// the physics loop a lot less than several thousand 1x1 ones covering
// the same footprint.
//
// Greedy scan: for each not-yet-covered wall cell (in row-major order),
// grow a rectangle first as wide as possible along its row, then as tall
// as possible while every cell across that full width is still an
// uncovered wall, then mark the whole rectangle covered. True minimal
// rectangle-count decomposition is NP-hard; this is the standard fast
// heuristic for it (the same technique tilemap colliders commonly use),
// and it's more than enough to collapse the long straight runs and solid
// blocks a dungeon grid is mostly made of.
function mergeWallsIntoRects(walls) {
  const wallSet = new Set(walls.map(({ x, y }) => `${x},${y}`));
  const covered = new Set();
  const rects = [];

  const sorted = [...walls].sort((a, b) => a.y - b.y || a.x - b.x);

  sorted.forEach(({ x, y }) => {
    const key = `${x},${y}`;
    if (covered.has(key)) return;

    let w = 1;
    while (wallSet.has(`${x + w},${y}`) && !covered.has(`${x + w},${y}`)) w++;

    let h = 1;
    growHeight:
    while (true) {
      for (let dx = 0; dx < w; dx++) {
        const rowKey = `${x + dx},${y + h}`;
        if (!wallSet.has(rowKey) || covered.has(rowKey)) break growHeight;
      }
      h++;
    }

    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) covered.add(`${x + dx},${y + dy}`);
    }

    rects.push({ x, y, w, h });
  });

  return rects;
}

export default mergeWallsIntoRects;
