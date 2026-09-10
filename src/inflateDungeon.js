// Post-processing pass that widens every corridor (and room) to at least
// `factor` grid cells, so a puck actually has room to maneuver instead of
// squeezing through single-tile-wide passages. Scales the dungeon's floor
// topology up uniformly: each original 1x1 floor cell becomes a
// `factor` x `factor` block in the output. That's a lossless scale, not a
// dilation -- it can't accidentally merge two originally-separate
// passages or rooms into one, since every cell that was open stays open
// and every cell that was wall stays wall, just bigger. Walls are then
// rederived from the inflated floor (rather than also naively scaling the
// wall list), so they stay a single cell thick and don't balloon into
// solid useless interior blocks.

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function inflateDungeon(dungeon, factor) {
  const floor = new Set();
  dungeon.floor.forEach(({ x, y }) => {
    for (let dx = 0; dx < factor; dx++) {
      for (let dy = 0; dy < factor; dy++) {
        floor.add(`${x * factor + dx},${y * factor + dy}`);
      }
    }
  });

  const gridWidth = dungeon.gridWidth * factor;
  const gridHeight = dungeon.gridHeight * factor;
  const inBounds = (x, y) => x >= 0 && x < gridWidth && y >= 0 && y < gridHeight;
  const isFloor = (x, y) => floor.has(`${x},${y}`);

  const walls = [];
  for (let x = 0; x < gridWidth; x++) {
    for (let y = 0; y < gridHeight; y++) {
      if (isFloor(x, y)) continue;
      const touchesFloor = DIRS.some(([dx, dy]) => inBounds(x + dx, y + dy) && isFloor(x + dx, y + dy));
      if (touchesFloor) walls.push({ x, y });
    }
  }

  const rooms = dungeon.rooms.map((room) => ({
    x: room.x * factor,
    y: room.y * factor,
    w: room.w * factor,
    h: room.h * factor,
  }));

  return { rooms, walls, gridWidth, gridHeight };
}

export default inflateDungeon;
