import renderHealthBar from './HealthBar.js';
import { canvas } from './canvas.js';
import { renderPlayerPortrait } from './PlayerCharacter.js';

const PORTRAIT_X = 40;
const PORTRAIT_Y = 58;
const PORTRAIT_SCALE = 0.8;
const BAR_LEFT = 88;
const BAR_Y = 48;
const BAR_WIDTH = 180;
const BAR_HEIGHT = 30;

function PlayerHealthHUD(player) {
  return {
    hudAnchor: [0, 0],
    renderHUD(context) {
      renderPlayerPortrait(context, PORTRAIT_X, PORTRAIT_Y, PORTRAIT_SCALE);
      const shields = player.bubbleShields;
      const slots = Math.max(player.maxHp, player.hp + shields);
      // Preserve ordinary tick size when adding overflow slots, but fit
      // the screen for large stacks. Actual maxHp is never modified.
      const width = Math.min(BAR_WIDTH * slots / player.maxHp, Math.max(1, canvas.width - BAR_LEFT - 16));
      renderHealthBar(context, BAR_LEFT + width / 2, BAR_Y,
        width, BAR_HEIGHT, player.hp, player.maxHp, shields);
    },
  };
}

export default PlayerHealthHUD;
