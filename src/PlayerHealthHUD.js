import renderHealthBar from './HealthBar.js';
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
    renderHUD(context) {
      renderPlayerPortrait(context, PORTRAIT_X, PORTRAIT_Y, PORTRAIT_SCALE);
      renderHealthBar(context, BAR_LEFT + BAR_WIDTH / 2, BAR_Y,
        BAR_WIDTH, BAR_HEIGHT, player.hp, player.maxHp);
    },
  };
}

export default PlayerHealthHUD;
