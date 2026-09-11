import { collectedItemAbilities } from './ItemAbility.js';

// Stacks below ChaliceHUD (which occupies roughly y=95..140), one
// equidistant row per ability, in the order they were actually collected.
const START_Y = 175;
const ROW_HEIGHT = 56;
const ICON_X = 40;
const ICON_SCALE = 1.1;
const TEXT_X = 68;
const NAME_OFFSET_Y = -9;
const DESCRIPTION_OFFSET_Y = 11;
const NAME_FONT = 'bold 16px sans-serif';
const DESCRIPTION_FONT = '12px sans-serif';
const NAME_COLOR = '#fff';
const DESCRIPTION_COLOR = '#ccc';
const STROKE_COLOR = '#000';

function outlinedText(context, text, x, y, font, color) {
  context.font = font;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.lineWidth = 3;
  context.strokeStyle = STROKE_COLOR;
  context.strokeText(text, x, y);
  context.fillStyle = color;
  context.fillText(text, x, y);
}

// The collected item-ability stack -- icon (reusing each ability's own
// world-icon draw function) plus its name and 3-5 word description,
// growing downward one equidistant row per pickup.
function ItemAbilityHUD() {
  return {
    renderHUD(context) {
      collectedItemAbilities().forEach((ability, i) => {
        const rowY = START_Y + i * ROW_HEIGHT;

        context.save();
        context.translate(ICON_X, rowY);
        context.scale(ICON_SCALE, ICON_SCALE);
        ability.draw(context);
        context.restore();

        outlinedText(context, ability.name, TEXT_X, rowY + NAME_OFFSET_Y, NAME_FONT, NAME_COLOR);
        outlinedText(context, ability.description, TEXT_X, rowY + DESCRIPTION_OFFSET_Y, DESCRIPTION_FONT, DESCRIPTION_COLOR);
      });
    },
  };
}

export default ItemAbilityHUD;
