// Top-level state machine: main menu -> playing -> game over -> main menu,
// each transition doing a full engine.clear() so no state from the
// previous screen (dungeon, grubs, drag input, HUD) leaks into the next.

import { chalicesComplete } from './chaliceProgress.js';
import { ACTIVE as COMBAT_ROOM_ACTIVE } from './CombatRoom.js';
import { add, clear, getObjectsByTag, remove } from './engine.js';
import createMap from './mapCreator.js';
import MainMenu from './MainMenu.js';
import { playDungeonTheme } from './music.js';
import { fireSplatBurst } from './SplatEffect.js';
import StatusCard from './StatusCard.js';
import { TAG_COMBAT_ROOM } from './tags.js';
import { collectItemAbility } from './ItemAbility.js';

// Same ROYGBV set the player's own on-hit splats use (see
// PlayerCharacter.js's fireDamageSplats) -- death gets a bigger burst of
// the same palette rather than a different effect entirely.
const DEATH_SPLAT_COLORS = ['#f33', '#f90', '#fc0', '#3c5', '#18f', '#a5d'];
const DEATH_SPLAT_COUNT = 24;
const DEATH_SPLAT_SPEED_MAX = 320;
const DEATH_SPLAT_SIZE_MIN = 14;
const DEATH_SPLAT_SIZE_MAX = 26;

// Background music only ever starts once per page load -- restarting it on
// every trip back through the main menu would just be a jarring re-fade.
let musicStarted = false;

// Watches the live player for either end condition -- hp running out, or
// every chalice collected -- and hands off to the matching status card.
// Fires the death splats only for the loss case; both cases tear down
// input and the HUD the same way (camera and dungeon stay put -- with
// the player gone the camera holds still, so the view stays frozen right
// where the run ended). Self-removes once fired.
function GameWatcher(player, dragController, playerHealthHUD, chaliceHUD, itemAbilityHUD, miniMap) {
  return {
    tick() {
      const won = chalicesComplete()
        && !getObjectsByTag(TAG_COMBAT_ROOM).some((room) => room.state === COMBAT_ROOM_ACTIVE);
      const lost = player.hp <= 0;
      if (!won && !lost) return;

      if (lost) fireSplatBurst(player.x, player.y, DEATH_SPLAT_COUNT, DEATH_SPLAT_COLORS, DEATH_SPLAT_SPEED_MAX, DEATH_SPLAT_SIZE_MIN, DEATH_SPLAT_SIZE_MAX);
      remove([player, dragController, playerHealthHUD, chaliceHUD, itemAbilityHUD, miniMap]);
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
    player, dragController, playerHealthHUD, chaliceHUD, itemAbilityHUD, miniMap,
  } = createMap(seed);
  add(GameWatcher(player, dragController, playerHealthHUD, chaliceHUD, itemAbilityHUD, miniMap));

  // Add all ability items
  // [0,1,2,3,4].map((i) => collectItemAbility(i, player));
}

function startGameFlow() {
  showMenu();
}

export default startGameFlow;
