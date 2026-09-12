// The 5 permanent item abilities: id, display name, a 3-5 word description
// of the buff, a simple flat-color + 4px-outline hieroglyph icon (drawn at
// local (0, 0)), and what picking one up actually does to the player.
// `collectedItemAbilities` is a small ordered-list singleton (reset per
// run, like chaliceProgress.js) read by ItemAbilityHUD for its stack.

import { fillCircle } from './canvasShapes.js';
import { traceWing } from './PlayerCharacter.js';

const OUTLINE_WIDTH = 4; // 2px thinner than its original 6
// Same gold/dark-gold pair as Chalice.js/TreasureChest.js, for a consistent
// "treasure" palette across every collectible in the game.
const FILL_COLOR = '#eb4';
const OUTLINE_COLOR = '#a82';

function fillOutlined(context) {
  context.fillStyle = FILL_COLOR;
  context.fill();
  context.strokeStyle = OUTLINE_COLOR;
  context.lineWidth = OUTLINE_WIDTH;
  context.stroke();
}

// A chestplate/shield silhouette, kept to a roughly square bounding box
// (32x34) like every other icon here so the HUD stack reads as one set.
function drawBattleArmor(context) {
  context.beginPath();
  context.moveTo(-16, -14);
  context.lineTo(16, -14);
  context.lineTo(16, 4);
  context.quadraticCurveTo(16, 16, 0, 20);
  context.quadraticCurveTo(-16, 16, -16, 4);
  context.closePath();
  fillOutlined(context);
}

// Reuse the player's feathered silhouette with the standard icon palette.
function drawValkyrieWings(context) {
  context.save();
  context.scale(0.6, 0.6);
  context.translate(26.5, 24);
  context.beginPath();
  traceWing(context, 53, 48);
  context.closePath();
  context.restore();
  // Stroke after restoring so the outline stays the same 4px as its peers.
  fillOutlined(context);
}

// A narrow isosceles horn tilted 45 degrees, giving its long point a
// square 32x32 footprint in both the pickup and HUD.
function drawMithrilHorn(context) {
  context.beginPath();
  context.moveTo(-16, 8);
  context.lineTo(16, -16);
  context.lineTo(-8, 16);
  context.closePath();
  fillOutlined(context);
}

// A cloven hoof, viewed from below.
function drawChromaticHoof(context) {
  context.beginPath();
  context.moveTo(-14, 14);
  context.quadraticCurveTo(-16, -10, 0, -16);
  context.quadraticCurveTo(16, -10, 14, 14);
  context.quadraticCurveTo(6, 6, 0, 10);
  context.quadraticCurveTo(-6, 6, -14, 14);
  context.closePath();
  fillOutlined(context);
}

// An eye with a pupil, rounded out from a former 40-wide/28-tall almond
// to a square 32x32 (quadratic-bezier extrema land at half the control
// point's offset when both endpoints share a coordinate, hence -32/32
// rather than -16/16 to reach a true +-16 peak).
function drawOracleEyes(context) {
  context.beginPath();
  context.moveTo(-16, 0);
  context.quadraticCurveTo(0, -32, 16, 0);
  context.quadraticCurveTo(0, 32, -16, 0);
  context.closePath();
  fillOutlined(context);
  fillCircle(context, 0, 0, 6, OUTLINE_COLOR);
}

const VALKYRIE_BOOST_MULTIPLIER = 1.3; // +30% to the whole launch-power curve, including its cap

// No string `id` field -- an ability's id is just its own index into this
// array (see collectItemAbility/mapCreator.js), which minifies far smaller
// than a repeated quoted name and needs no separate lookup. Each entry is
// [name, description, draw(context), apply(player)] -- positional rather
// than keyed, since object keys survive minification.
const ITEM_ABILITY_CATALOG = [
  ['BATTLE ARMOR', '+2 max health', drawBattleArmor, (player) => {
    player.maxHp += 2;
    player.heal(2); // granted immediately, not just headroom for later
  }],
  ['VALKYRIE WINGS', 'increase boost speed', drawValkyrieWings, (player) => {
    player.boostPower *= VALKYRIE_BOOST_MULTIPLIER;
  }],
  ['MITHRIL HORN', '+1 damage', drawMithrilHorn, (player) => {
    player.horn += 1;
  }],
  ['CHROMATIC HOOF', 'chain lightning', drawChromaticHoof, (player) => {
    player.hoof = true;
  }],
  ['ORACLE EYES', 'show minimap', drawOracleEyes, (player) => {
    player.oracleEyes = true;
  }],
];

// Collected abilities, oldest first -- read directly by ItemAbilityHUD.
const collectedItemAbilities = [];

function resetItemAbilities() {
  collectedItemAbilities.length = 0;
}

// Applies the ability to `player` and records it for the HUD stack. Each
// ability only ever spawns once per dungeon (see mapCreator.js), so it's
// never collected twice.
function collectItemAbility(id, player) {
  const ability = ITEM_ABILITY_CATALOG[id];
  ability[3](player);
  collectedItemAbilities.push(ability);
}

export {
  collectedItemAbilities, collectItemAbility, ITEM_ABILITY_CATALOG, resetItemAbilities,
};
