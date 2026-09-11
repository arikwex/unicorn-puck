import { canvas } from './canvas.js';
import { fillRect } from './canvasShapes.js';
import { getObjectsByTag } from './engine.js';
import { TAG_OBSTACLE } from './tags.js';

// Just the map and your own dot -- no chests/chalices/grubs, per the ask.
const MAP_SIZE = 160;
const MAP_MARGIN = 16;
const PADDING = 10; // world-bounds inset, in map pixels, so edge walls aren't clipped
const BG_COLOR = '#000';
const BORDER_COLOR = '#fff';
const WALL_COLOR = '#766';
const PLAYER_COLOR = '#fff';
const PLAYER_DOT_RADIUS = 4;

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
  const scale = (MAP_SIZE - PADDING * 2) / worldSpan;

  return {
    hudAnchor: [0, 1],
    renderHUD(context) {
      if (!player.oracleEyes) return;
      const originX = MAP_MARGIN;
      const originY = canvas.height - MAP_MARGIN - MAP_SIZE;
      const toMap = (wx, wy) => [
        originX + PADDING + (wx - worldMin) * scale,
        originY + PADDING + (wy - worldMin) * scale,
      ];

      context.save();
      fillRect(context, originX, originY, MAP_SIZE, MAP_SIZE, BG_COLOR, 0.55);

      context.save();
      context.beginPath();
      context.rect(originX, originY, MAP_SIZE, MAP_SIZE);
      context.clip();
      context.fillStyle = WALL_COLOR;
      getObjectsByTag(TAG_OBSTACLE).filter(isWall).forEach((wall) => {
        const [x1, y1] = toMap(wall.x - wall.w / 2, wall.y - wall.h / 2);
        const [x2, y2] = toMap(wall.x + wall.w / 2, wall.y + wall.h / 2);
        context.fillRect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));
      });

      const [px, py] = toMap(player.x, player.y);
      context.fillStyle = PLAYER_COLOR;
      context.beginPath();
      context.arc(px, py, PLAYER_DOT_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.strokeStyle = BORDER_COLOR;
      context.lineWidth = 2;
      context.strokeRect(originX, originY, MAP_SIZE, MAP_SIZE);
      context.restore();
    },
  };
}

export default MiniMap;
