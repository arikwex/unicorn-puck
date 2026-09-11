import { canvas } from './canvas.js';
import { fillCircle, fillRect } from './canvasShapes.js';
import { getObjectsByTag } from './engine.js';
import { TAG_OBSTACLE } from './tags.js';

// Just the map and your own dot -- no chests/chalices/grubs, per the ask.
const MAP_SIZE = 160;
const BG_COLOR = '#444';
const WALL_COLOR = '#111';
const PLAYER_COLOR = '#fff';

function isWall(object) {
  return object.tags?.includes(TAG_OBSTACLE) && typeof object.w === 'number';
}

// Revealed only once the player has Oracle Eyes -- a bottom-left overview of
// every wall (there are only ever a few dozen) plus the player's own
// current position. `worldSpan`/`worldMin` are the dungeon's own fixed
// world-space bounding box -- always square and the same for every seed
// (see mapCreator.js's own comment on it) -- so scale/origin are fixed
// once here at map-build time rather than re-deriving a wall bounding box
// (and re-solving scale/origin from it) on every single frame.
function MiniMap(player, worldSpan, worldMin) {
  const scale = (MAP_SIZE) / worldSpan;

  return {
    hudAnchor: [0, 1],
    hud(context) {
      if (!player.oracleEyes) return;
      const toMap = (wx, wy) => [
        (wx - worldMin) * scale,
        (wy - worldMin) * scale,
      ];

      context.save();
      context.translate(10, canvas.height -10 - MAP_SIZE);
      fillRect(context, 0, 0, MAP_SIZE, MAP_SIZE, BG_COLOR, 0.55);

      context.beginPath();
      context.fillStyle = WALL_COLOR;
      getObjectsByTag(TAG_OBSTACLE).filter(isWall).forEach((wall) => {
        const [x1, y1] = toMap(wall.x - wall.w / 2, wall.y - wall.h / 2);
        const [x2, y2] = toMap(wall.x + wall.w / 2, wall.y + wall.h / 2);
        context.fillRect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));
      });

      const [px, py] = toMap(player.x, player.y);
      fillCircle(context, px, py, 4, PLAYER_COLOR);
      context.restore();
    },
  };
}

export default MiniMap;
