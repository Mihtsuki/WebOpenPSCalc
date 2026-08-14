/**
 * incomingPipeline.js — JS port of core/calculators/incoming_physical_pipeline.py
 * and core/calculators/incoming_magic_pipeline.py (mob → player damage).
 *
 * Mirrors battlePipeline.js's structure but runs in the opposite direction:
 * the mob is the attacker (ATK/MATK derived from mob_db's atk_min/atk_max or
 * INT), the player (via buildManager.playerBuildToTarget) is the defender.
 * cardFix.js's calculateIncomingPhysical and calculateCardFixMagic (called
 * with gearBonuses=null, which skips the attacker-side race/boss bonus step
 * — mobs have no card-granted bonuses in this calculator) already implement
 * the player-resistance side of both directions; this file just assembles
 * the rest of the chain around them.
 */
const { loader } = require("../dataLoader");
const { createDamageResult, createGearBonuses } = require("../models");
const { uniformPmf, scaleFloor, addFlat, pmfStats, floorAt } = require("../pmf");
const { calculateAttrFix } = require("./modifiers/attrFix");
const { calculateDefenseFix, calculateMagicDefenseFix } = require("./modifiers/defenseFix");
const { calculateIncomingPhysical, calculateCardFixMagic } = require("./modifiers/cardFix");
const { playerBuildToTarget } = require("../buildManager");

const ELE_INT_TO_KEY = [
  "Ele_Neutral", "Ele_Water", "Ele_Earth", "Ele_Fire",
  "Ele_Wind", "Ele_Poison", "Ele_Holy", "Ele_Dark", "Ele_Ghost", "Ele_Undead",
];

function notFoundResult(mobId) {
  const result = createDamageResult();
  result.add_step({ name: "Error", value: 0, min_value: 0, max_value: 0, multiplier: 1, note: `Monster ${mobId} not found`, formula: "", hercules_ref: "" });
  result.min_damage = 0;
  result.max_damage = 0;
  result.avg_damage = 0;
  result.pmf = { 0: 1.0 };
  return result;
}

function applyLexAeterna(build, pmf, result) {
  const playerScs = build.player_active_scs || {};
  if (!playerScs.SC_LEXAETERNA) return pmf;
  pmf = scaleFloor(pmf, 200, 100);
  const [mn, mx, av] = pmfStats(pmf);
  result.add_step({ name: "Lex Aeterna", value: av, min_value: mn, max_value: mx, multiplier: 2.0, note: "Target afflicted with SC_LEXAETERNA: next hit ×2", formula: "dmg × 2", hercules_ref: "status.c SC_LEXAETERNA" });
  return pmf;
}

function calculateIncomingPhysicalDamage(mobId, build, status, gearBonuses, weapon, config, opts = {}) {
  const {
    is_ranged: isRanged = false, mob_atk_bonus_rate: mobAtkBonusRate = 0,
    ele_override: eleOverride = null, ratio_override: ratioOverride = null,
    ignore_def: ignoreDef = false,
    // A debuffed copy of the monster (offensive Blessing halves its STR/INT/DEX).
    // The caller applies the debuff so that the SAME object is used for the damage
    // and handed back to the client, instead of the two drifting apart.
    mob_override: mobOverride = null,
  } = opts;
  const mob = mobOverride || loader.getMonsterData(mobId);
  if (!mob) return notFoundResult(mobId);

  const result = createDamageResult();

  const atkMin = mob.atk_min ?? 0;
  const atkMax = Math.max(atkMin, mob.atk_max ?? 0);
  const mobStr = (mob.stats || {}).str || 0;
  const batk = mobStr + Math.floor(mobStr / 10) ** 2;

  let pmf = atkMax > atkMin ? uniformPmf(atkMin, atkMax - 1) : { [atkMin]: 1.0 };
  pmf = addFlat(pmf, batk);
  if (mobAtkBonusRate) pmf = scaleFloor(pmf, 100 + mobAtkBonusRate, 100);

  const [mn0, mx0, av0] = pmfStats(pmf);
  result.add_step({
    name: "Mob Base ATK", value: av0, min_value: mn0, max_value: mx0,
    note: `${mob.name}: atk[${atkMin},${atkMax}] + STR ${mobStr} + (STR//10)²=${Math.floor(mobStr / 10) ** 2}`,
    formula: "rnd(atk_min,atk_max-1) + str + (str//10)²", hercules_ref: "status.c mob status calc",
  });

  // Skill ratio for a mob-cast physical skill (e.g. Bash, Brandish): scale the mob's
  // ATK by the skill's %, before the player's DEF/resists — same order as the outgoing
  // physical skill path.
  if (ratioOverride != null && ratioOverride !== 100) {
    pmf = scaleFloor(pmf, ratioOverride, 100);
    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Skill Ratio", value: av, min_value: mn, max_value: mx, multiplier: ratioOverride / 100, note: `Ratio ${ratioOverride}%`, formula: `dmg × ${ratioOverride}%`, hercules_ref: "" });
  }

  const playerTarget = playerBuildToTarget(build, status, gearBonuses, weapon, loader);

  // A monster's basic melee is Neutral (its `element` field is defensive property
  // only — Hercules keeps attack `rhw.ele` separate from `def_ele`). Elemental hits
  // come from NPC_*ATTACK skills, passed in via ele_override. So default to Neutral,
  // NOT mob.element — otherwise a Dark mob would wrongly ignore the player's Neutral
  // resist (Raydric) on its ordinary attack.
  const atkEle = eleOverride != null ? eleOverride : 0;
  // build=null: the player's own ground-effect enchant (Volcano/Deluge/etc.)
  // buffs the PLAYER's outgoing element, not a mob's incoming attack element.
  pmf = calculateAttrFix(weapon, playerTarget, pmf, result, null, atkEle);

  // Player is the defender; the "attacker" (mob) has no ignore-DEF gear in
  // this calculator, so pass a zeroed-out GearBonuses rather than the player's own.
  // A skill flagged IgnoreDefense in the skill DB (Asura, Earthquake, Clashing
  // Spiral, Auto Counter…) bypasses the player's DEF entirely, the same nk_ignore_def
  // path the outgoing direction uses — without this the DEF-ignoring casts a player
  // actually has to survive would be priced as if armour stopped them.
  pmf = calculateDefenseFix(
    playerTarget, { ignore_hard_def: false }, createGearBonuses(), pmf, config, result,
    { is_crit: false, skill: ignoreDef ? { nk_ignore_def: true } : null },
  );

  pmf = calculateIncomingPhysical(mob.race, atkEle, mob.size, isRanged, playerTarget, pmf, result);

  pmf = applyLexAeterna(build, pmf, result);

  pmf = floorAt(pmf, 1);
  const [mn, mx, av] = pmfStats(pmf);
  result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: "Incoming physical", formula: "", hercules_ref: "" });
  result.min_damage = mn;
  result.max_damage = mx;
  result.avg_damage = av;
  result.pmf = pmf;
  return result;
}

function calculateIncomingMagicDamage(mobId, build, status, gearBonuses, weapon, opts = {}) {
  const {
    mob_matk_bonus_rate: mobMatkBonusRate = 0, mob_int_bonus_rate: mobIntBonusRate = 0,
    ele_override: eleOverride = null, ratio_override: ratioOverride = null,
    mob_override: mobOverride = null,
  } = opts;
  const mob = mobOverride || loader.getMonsterData(mobId);
  if (!mob) return notFoundResult(mobId);

  const result = createDamageResult();

  let mobInt = (mob.stats || {}).int || 0;
  if (mobIntBonusRate) mobInt = Math.floor(mobInt * (100 + mobIntBonusRate) / 100);
  const matkMin = mobInt + Math.floor(mobInt / 7) ** 2;
  const matkMax = mobInt + Math.floor(mobInt / 5) ** 2;

  let pmf = matkMax > matkMin ? uniformPmf(matkMin, matkMax - 1) : { [matkMin]: 1.0 };
  if (mobMatkBonusRate) pmf = scaleFloor(pmf, 100 + mobMatkBonusRate, 100);

  const [mn0, mx0, av0] = pmfStats(pmf);
  result.add_step({
    name: "Mob Base MATK", value: av0, min_value: mn0, max_value: mx0,
    note: `${mob.name}: INT ${mobInt} → MATK [${matkMin},${matkMax}]`,
    formula: "int+(int/7)² to int+(int/5)²", hercules_ref: "status.c status_calc_matk",
  });

  if (ratioOverride != null && ratioOverride !== 100) {
    pmf = scaleFloor(pmf, ratioOverride, 100);
    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Skill Ratio", value: av, min_value: mn, max_value: mx, multiplier: ratioOverride / 100, note: `Ratio override: ${ratioOverride}%`, formula: `dmg × ${ratioOverride}%`, hercules_ref: "" });
  }

  const playerTarget = playerBuildToTarget(build, status, gearBonuses, weapon, loader);

  const atkEle = eleOverride != null ? eleOverride : (mob.element ?? 0);
  pmf = calculateAttrFix(weapon, playerTarget, pmf, result, null, atkEle);

  pmf = calculateMagicDefenseFix(playerTarget, createGearBonuses(), pmf, result);

  const magicEleName = ELE_INT_TO_KEY[atkEle] || "Ele_Neutral";
  pmf = calculateCardFixMagic(playerTarget, magicEleName, pmf, result, null);

  pmf = applyLexAeterna(build, pmf, result);

  pmf = floorAt(pmf, 1);
  const [mn, mx, av] = pmfStats(pmf);
  result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: "Incoming magic", formula: "", hercules_ref: "" });
  result.min_damage = mn;
  result.max_damage = mx;
  result.avg_damage = av;
  result.pmf = pmf;
  return result;
}

module.exports = { calculateIncomingPhysicalDamage, calculateIncomingMagicDamage };
