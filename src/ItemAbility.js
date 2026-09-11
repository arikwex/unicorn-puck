// The 5 permanent item abilities: id, display name, a 3-5 word description
// of the buff, a simple flat-color + 4px-outline hieroglyph icon (drawn at
// local (0, 0)), and what picking one up actually does to the player.
// `collected` is a small ordered-list singleton (reset per run, like
// chaliceProgress.js) read by ItemAbilityHUD for its stack and by
// Item.js/mapCreator.js to avoid spawning the same ability twice.

const OUTLINE_WIDTH = 4; // 2px thinner than its original 6
// Same gold/dark-gold pair as Chalice.js/TreasureChest.js, for a consistent
// "treasure" palette across every collectible in the game.
const FILL_COLOR = '#e8c34a';
const OUTLINE_COLOR = '#a9822a';

function fillOutlined(context) {
  context.fillStyle = FILL_COLOR;
  context.fill();
  context.strokeStyle = OUTLINE_COLOR;
  context.lineWidth = OUTLINE_WIDTH;
  context.lineJoin = 'round';
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

// Two swept feather-petal shapes meeting at a center point -- wide enough
// that the fill still reads clearly under the outline stroke, rather than
// being a sliver the stroke could nearly swallow, and pulled in from a
// former 52-wide/30-tall bbox to a squarer 36x34.
function drawValkyrieWings(context) {
  context.beginPath();
  context.moveTo(0, 12);
  context.quadraticCurveTo(-10, -4, -18, -20);
  context.quadraticCurveTo(-6, -8, -2, 14);
  context.closePath();
  context.moveTo(0, 12);
  context.quadraticCurveTo(10, -4, 18, -20);
  context.quadraticCurveTo(6, -8, 2, 14);
  context.closePath();
  fillOutlined(context);
}

// A tapering spike, widened from a former 18-wide/40-tall bbox to a
// squarer 24x32.
function drawMithrilHorn(context) {
  context.beginPath();
  context.moveTo(-12, 16);
  context.quadraticCurveTo(-14, -8, 2, -16);
  context.quadraticCurveTo(10, -6, 12, 16);
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
  context.beginPath();
  context.arc(0, 0, 6, 0, Math.PI * 2);
  context.fillStyle = OUTLINE_COLOR;
  context.fill();
}

const VALKYRIE_BOOST_MULTIPLIER = 1.3; // +30% to the whole launch-power curve, including its cap

// No string `id` field -- an ability's id is just its own index into this
// array (see collectItemAbility/mapCreator.js), which minifies far smaller
// than a repeated quoted name and needs no separate lookup.
const ITEM_ABILITY_CATALOG = [
  {
    name: 'BATTLE ARMOR',
    description: '+2 max health',
    draw: drawBattleArmor,
    apply(player) {
      player.maxHp += 2;
      player.heal(2); // granted immediately, not just headroom for later
    },
  },
  {
    name: 'VALKYRIE WINGS',
    description: 'higher max boost speed',
    draw: drawValkyrieWings,
    apply(player) {
      player.boostPower *= VALKYRIE_BOOST_MULTIPLIER;
    },
  },
  {
    name: 'MITHRIL HORN',
    description: '+1 impact damage',
    draw: drawMithrilHorn,
    apply(player) {
      player.impactDamageBonus += 1;
    },
  },
  {
    name: 'CHROMATIC HOOF',
    description: 'bounces reboost momentum',
    draw: drawChromaticHoof,
    apply(player) {
      player.pinballMomentum = true;
    },
  },
  {
    name: 'ORACLE EYES',
    description: 'reveals the minimap',
    draw: drawOracleEyes,
    apply(player) {
      player.oracleEyes = true;
    },
  },
];

let collected = [];

function resetItemAbilities() {
  collected = [];
}

// Applies the ability to `player` and records it for the HUD stack; a
// no-op if this id doesn't exist or was somehow already collected (each
// only ever spawns once per dungeon, see mapCreator.js, so the latter
// should never actually happen).
function collectItemAbility(id, player) {
  const ability = ITEM_ABILITY_CATALOG[id];
  if (!ability || collected.includes(ability)) return null;
  ability.apply(player);
  collected.push(ability);
  return ability;
}

function collectedItemAbilities() {
  return collected;
}

export {
  collectedItemAbilities, collectItemAbility, ITEM_ABILITY_CATALOG, resetItemAbilities,
};
