// Top-level state machine: main menu -> playing -> game over -> main menu,
// each transition doing a full engine.clear() so no state from the
// previous screen (dungeon, grubs, drag input, HUD) leaks into the next.

import { add, clear, remove } from './engine.js';
import GameOverCard from './GameOverCard.js';
import createMap from './mapCreator.js';
import MainMenu from './MainMenu.js';
import { playDungeonTheme } from './music.js';
import SplatEffect from './SplatEffect.js';

// Same ROYGBV set the player's own on-hit splats use (see
// PlayerCharacter.js's fireDamageSplats) -- death gets a bigger burst of
// the same palette rather than a different effect entirely.
const DEATH_SPLAT_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de'];
const DEATH_SPLAT_COUNT = 24;
const DEATH_SPLAT_SPEED_MAX = 320;
const DEATH_SPLAT_SIZE_MIN = 14;
const DEATH_SPLAT_SIZE_MAX = 26;

// Background music only ever starts once per page load -- restarting it on
// every trip back through the main menu would just be a jarring re-fade.
let musicStarted = false;

function fireDeathSplats(x, y) {
  for (let i = 0; i < DEATH_SPLAT_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.sqrt(Math.random()) * DEATH_SPLAT_SPEED_MAX;
    const size = DEATH_SPLAT_SIZE_MIN + Math.random() * (DEATH_SPLAT_SIZE_MAX - DEATH_SPLAT_SIZE_MIN);
    const color = DEATH_SPLAT_COLORS[i % DEATH_SPLAT_COLORS.length];
    add(SplatEffect(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, { size }));
  }
}

// Watches the live player and, once its hp runs out, fires the death
// splats at its last position, tears down input and the HUD, and hands off
// to the game-over card. Self-removes once it has fired.
function GameWatcher(player, dragController, playerHealthHUD) {
  return {
    update() {
      if (player.hp > 0) return;
      fireDeathSplats(player.x, player.y);
      // The camera and dungeon stay put -- Camera.follow() keeps its
      // target reference even after removal, so the view stays frozen
      // right where the player died, which is where the splats need to
      // render. Only the player's own input/HUD come down.
      remove([player, dragController, playerHealthHUD]);
      add(GameOverCard(showMenu));
      return true;
    },
  };
}

function showMenu() {
  clear();
  add(MainMenu(startGame));
}

function startGame() {
  if (!musicStarted) {
    musicStarted = true;
    playDungeonTheme();
  }
  clear();
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const { player, dragController, playerHealthHUD } = createMap(seed);
  add(GameWatcher(player, dragController, playerHealthHUD));
}

function startGameFlow() {
  showMenu();
}

export default startGameFlow;
