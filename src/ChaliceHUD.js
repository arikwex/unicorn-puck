import { renderChaliceIcon } from './Chalice.js';
import { chaliceProgress } from './chaliceProgress.js';

// Sits under PlayerHealthHUD's bar (which spans roughly y=33..63), with
// enough of a gap below it for the icon's own larger footprint at ICON_SCALE.
const ICON_X = 40;
const ICON_Y = 125;
const ICON_SCALE = 1.05; // 1.5x its original 0.7
const TEXT_X = 68;
const TEXT_Y = 126;
const FONT = 'bold 24px sans-serif';
const TEXT_COLOR = '#fff';

// The "N / total chalices collected" counter -- a small icon (reusing
// Chalice's own render function, same trick PlayerHealthHUD uses for its
// portrait) plus text, both reading live off the shared chaliceProgress
// singleton Chalice.js writes to on pickup.
function ChaliceHUD() {
  return {
    hudAnchor: [0, 0],
    renderHUD(context) {
      renderChaliceIcon(context, ICON_X, ICON_Y, ICON_SCALE);

      const { collected, required } = chaliceProgress();
      const text = `${collected} / ${required}`;
      context.font = FONT;
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillStyle = TEXT_COLOR;
      context.fillText(text, TEXT_X, TEXT_Y);
    },
  };
}

export default ChaliceHUD;
