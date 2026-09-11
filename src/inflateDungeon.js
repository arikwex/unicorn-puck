// Post-processing pass that widens every corridor (and room) to at least
// `factor` grid cells, so a puck actually has room to maneuver instead of
// squeezing through single-tile-wide passages.
//
// A pure linear upscale of the generator's exact output: every single
// tile -- (1) -- becomes an `factor` x `factor` block of that same tile
// -- (1,1),(1,1) for factor 2 -- with no other reinterpretation. Since
// donjonDungeon.js's `walls` already covers every non-floor cell (not
// just the ones touching floor -- see its computeWalls comment), floor
// and walls are complementary and this upscale carries that over exactly:
// no gaps, no cell left unclassified as neither floor nor wall.
function expandTiles(cells, factor) {
  const blocks = [];
  cells.forEach(({ x, y }) => {
    for (let dx = 0; dx < factor; dx++) {
      for (let dy = 0; dy < factor; dy++) {
        blocks.push({ x: x * factor + dx, y: y * factor + dy });
      }
    }
  });
  return blocks;
}

function inflateDungeon(dungeon, factor) {
  return {
    rooms: dungeon.rooms.map((room) => ({
      x: room.x * factor,
      y: room.y * factor,
      w: room.w * factor,
      h: room.h * factor,
    })),
    floor: expandTiles(dungeon.floor, factor),
    walls: expandTiles(dungeon.walls, factor),
    size: dungeon.size * factor,
  };
}

export default inflateDungeon;
