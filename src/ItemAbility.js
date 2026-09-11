// The 5 permanent item abilities: id, display name, a 3-5 word description
// of the buff, a simple flat-color + 4px-outline hieroglyph icon (drawn at
// local (0, 0)), and what picking one up actually does to the player.
// `collected` is a small ordered-list singleton (reset per run, like
// chaliceProgress.js) read by ItemAbilityHUD for its stack and by
// Item.js/mapCreator.js to avoid spawning the same ability twice.

const OUTLINE_WIDTH = 4; // 2px thinner than its original 6

function fillOutlined(context, fillColor, outlineColor) {
  context.fillStyle = fillColor;
  context.fill();
  context.strokeStyle = outlineColor;
  context.lineWidth = OUTLINE_WIDTH;
  context.lineJoin = 'round';
  context.stroke();
}

// A chestplate/shield silhouette.
function drawBattleArmor(context) {
  context.beginPath();
  context.moveTo(-14, -16);
  context.lineTo(14, -16);
  context.lineTo(14, 4);
  context.quadraticCurveTo(14, 20, 0, 26);
  context.quadraticCurveTo(-14, 20, -14, 4);
  context.closePath();
  fillOutlined(context, '#8a95a5', '#3d4552');
}

// Two swept feather-petal shapes meeting at a center point.
function drawValkyrieWings(context) {
  context.beginPath();
  context.moveTo(0, 8);
  context.quadraticCurveTo(-10, -4, -24, -18);
  context.quadraticCurveTo(-10, -8, -3, 10);
  context.closePath();
  context.moveTo(0, 8);
  context.quadraticCurveTo(10, -4, 24, -18);
  context.quadraticCurveTo(10, -8, 3, 10);
  context.closePath();
  fillOutlined(context, '#f2eee0', '#7a6a2e');
}

// A tapering spike.
function drawMithrilHorn(context) {
  context.beginPath();
  context.moveTo(-8, 18);
  context.quadraticCurveTo(-10, -6, 2, -22);
  context.quadraticCurveTo(6, -4, 8, 18);
  context.closePath();
  fillOutlined(context, '#d9ecf2', '#5f7d87');
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
  fillOutlined(context, '#c04fd6', '#5c1f66');
}

// An almond eye with a pupil.
function drawOracleEyes(context) {
  context.beginPath();
  context.moveTo(-20, 0);
  context.quadraticCurveTo(0, -14, 20, 0);
  context.quadraticCurveTo(0, 14, -20, 0);
  context.closePath();
  fillOutlined(context, '#7fd6e0', '#1f4d54');
  context.beginPath();
  context.arc(0, 0, 6, 0, Math.PI * 2);
  context.fillStyle = '#1f4d54';
  context.fill();
}

const VALKYRIE_BOOST_MULTIPLIER = 1.3; // +30% to the whole launch-power curve, including its cap

const ITEM_ABILITY_CATALOG = [
  {
    id: 'battleArmor',
    name: 'BATTLE ARMOR',
    description: '+2 max health',
    draw: drawBattleArmor,
    apply(player) {
      player.maxHp += 2;
      player.heal(2); // granted immediately, not just headroom for later
    },
  },
  {
    id: 'valkyrieWings',
    name: 'VALKYRIE WINGS',
    description: 'higher max boost speed',
    draw: drawValkyrieWings,
    apply(player) {
      player.boostPower *= VALKYRIE_BOOST_MULTIPLIER;
    },
  },
  {
    id: 'mithrilHorn',
    name: 'MITHRIL HORN',
    description: '+1 impact damage',
    draw: drawMithrilHorn,
    apply(player) {
      player.impactDamageBonus += 1;
    },
  },
  {
    id: 'chromaticHoof',
    name: 'CHROMATIC HOOF',
    description: 'bounces reboost momentum',
    draw: drawChromaticHoof,
    apply(player) {
      player.pinballMomentum = true;
    },
  },
  {
    id: 'oracleEyes',
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
  const ability = ITEM_ABILITY_CATALOG.find((candidate) => candidate.id === id);
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
