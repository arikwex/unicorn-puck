// A Chalice of Pegacorn Blood: one of the level's required collectibles.
// Gold goblet, glowing red "blood" wine -- palette lifted from the
// reference sanctuary art (gold stonework/trim, a deep red-pink wine with
// a bright highlight). Collected on contact like HealthItem (no physics
// participation, just a proximity check), incrementing the shared
// chaliceProgress counter GameFlow.js watches for the win condition.

import { fillEllipse } from './canvasShapes.js';
import { getObjectsByTag } from './engine.js';
import { collectChalice } from './chaliceProgress.js';
import { fireSplatBurst } from './SplatEffect.js';
import { TAG_PLAYER } from './tags.js';
import { showItemCollectedToast } from './ToastSystem.js';

const TAU = Math.PI * 2;
const WORLD_SCALE = 1.5; // the in-scene chalice, 50% larger than the base icon size
const PICKUP_RADIUS = 33; // scaled up along with WORLD_SCALE
const BOB_SPEED = 2.2; // rad/s
const BOB_AMOUNT = 4; // px

const METAL_COLOR = '#eb4'; // same gold as TreasureChest, for a consistent "treasure" palette
const METAL_DARK_COLOR = '#a82';
const WINE_COLOR = '#a13';
const WINE_HIGHLIGHT_COLOR = '#f58';

const COLLECT_SPLAT_COUNT = 8;
const COLLECT_SPLAT_COLORS = [METAL_COLOR, WINE_COLOR];
const COLLECT_SPLAT_SPEED_MAX = 200;
const COLLECT_SPLAT_SIZE_MIN = 6;
const COLLECT_SPLAT_SIZE_MAX = 12;

// Drawn in local coordinates centered on (0, 0) at scale 1 -- callers
// translate/scale around that origin, the same convention
// PlayerCharacter's renderPlayerPortrait uses for its own HUD icon reuse.
function renderChaliceIcon(context, x, y, scale) {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);

  fillEllipse(context, 0, 14, 12, 4, METAL_DARK_COLOR);
  fillEllipse(context, 0, 12, 10, 3, METAL_COLOR);

  context.fillStyle = METAL_COLOR;
  context.fillRect(-2, -4, 4, 16);
  context.beginPath();
  context.arc(0, 4, 4, 0, TAU);
  context.fill();

  context.beginPath();
  context.moveTo(-6, -4);
  context.lineTo(-13, -16);
  context.lineTo(13, -16);
  context.lineTo(6, -4);
  context.closePath();
  context.fill();
  fillEllipse(context, 0, -16, 13, 5, METAL_COLOR);

  fillEllipse(context, 0, -16, 10, 3.5, WINE_COLOR);
  context.globalAlpha = 0.8;
  fillEllipse(context, -3, -16.5, 4, 1.5, WINE_HIGHLIGHT_COLOR);
  context.globalAlpha = 1;

  context.restore();
}

function Chalice(x, y) {
  let anim = Math.random() * TAU;
  let collected = false;

  return {
    x,
    y,
    order: y,

    update(dt) {
      if (collected) return true;
      anim += dt;

      const player = getObjectsByTag(TAG_PLAYER)[0];
      if (!player) return false;
      const distance = Math.hypot(player.x - this.x, player.y - this.y);
      if (distance > PICKUP_RADIUS + player.radius) return false;

      collected = true;
      collectChalice();
      fireSplatBurst(this.x, this.y, COLLECT_SPLAT_COUNT, COLLECT_SPLAT_COLORS, COLLECT_SPLAT_SPEED_MAX, COLLECT_SPLAT_SIZE_MIN, COLLECT_SPLAT_SIZE_MAX);
      showItemCollectedToast('Pegacorn Blood Chalice');
      return true;
    },

    render(context) {
      renderChaliceIcon(context, this.x, this.y + Math.sin(anim * BOB_SPEED) * BOB_AMOUNT, WORLD_SCALE);
    },
  };
}

export default Chalice;
export { renderChaliceIcon };
