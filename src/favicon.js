import { renderPlayerPortrait } from './PlayerCharacter.js';

function setFavicon() {
  // Reuse the HUD's -pi/4 head pose, including its ears and striped horn.
  // A generated PNG keeps the single-file build self-contained.
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = iconCanvas.height = 64;
  renderPlayerPortrait(iconCanvas.getContext('2d'), 28, 38, 0.8);
  // The page ships no <link rel=icon> of its own; browsers sniff the PNG
  // type from the data URL, and toDataURL() defaults to PNG.
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = iconCanvas.toDataURL();
  document.head.appendChild(icon);
}

export default setFavicon;
