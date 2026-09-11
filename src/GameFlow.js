// Top-level state machine: main menu -> playing -> game over -> main menu,
// each transition doing a full engine.clear() so no state from the
// previous screen (dungeon, grubs, drag input, HUD) leaks into the next.

import { chalicesComplete } from './chaliceProgress.js';
import { add, clear, getObjectsByTag, remove } from './engine.js';
import createMap from './mapCreator.js';
import MainMenu from './MainMenu.js';
import { playDungeonTheme } from './music.js';
import SplatEffect from './SplatEffect.js';
import StatusCard from './StatusCard.js';
import { TAG_COMBAT_ROOM } from './tags.js';

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

// Watches the live player for either end condition -- hp running out, or
// every chalice collected -- and hands off to the matching status card.
// Fires the death splats only for the loss case; both cases tear down
// input and the HUD the same way (camera and dungeon stay put --
// Camera.follow() keeps its target reference even after removal, so the
// view stays frozen right where the run ended). Self-removes once fired.
function GameWatcher(player, dragController, playerHealthHUD, chaliceHUD) {
  return {
    update() {
      const won = chalicesComplete()
        && !getObjectsByTag(TAG_COMBAT_ROOM).some((room) => room.state === 'active');
      const lost = player.hp <= 0;
      if (!won && !lost) return;

      if (lost) fireDeathSplats(player.x, player.y);
      remove([player, dragController, playerHealthHUD, chaliceHUD]);
      add(won
        ? StatusCard(showMenu, { lines: ['PEGACORN BLOOD', 'RECLAIMED'], color: '#fff' })
        : StatusCard(showMenu));
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
  const {
    player, dragController, playerHealthHUD, chaliceHUD,
  } = createMap(seed);
  add(GameWatcher(player, dragController, playerHealthHUD, chaliceHUD));
}

function startGameFlow() {
  showMenu();
}

export default startGameFlow;
