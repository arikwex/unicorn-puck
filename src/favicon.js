import { renderPlayerPortrait } from './PlayerCharacter.js';

function setFavicon() {
  // Reuse the HUD's -pi/4 head pose, including its ears and striped horn.
  // A generated PNG keeps the single-file build self-contained.
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = iconCanvas.height = 64;
  renderPlayerPortrait(iconCanvas.getContext('2d'), 28, 38, 0.8);
  const icon = document.querySelector('link[rel="icon"]') || document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/png';
  icon.href = iconCanvas.toDataURL('image/png');
  document.head.appendChild(icon);
}

export default setFavicon;
