/**
 * cardFix.js — JS port of core/calculators/modifiers/card_fix.py
 */
const { scaleFloor, pmfStats } = require("../../pmf");

const RACE_TO_RC = {
  Formless: "RC_Formless", Undead: "RC_Undead", Brute: "RC_Brute",
  Plant: "RC_Plant", Insect: "RC_Insect", Fish: "RC_Fish",
  Demon: "RC_Demon", "Demi-Human": "RC_DemiHuman", Angel: "RC_Angel", Dragon: "RC_Dragon",
};
const ELE_TO_KEY = {
  0: "Ele_Neutral", 1: "Ele_Water", 2: "Ele_Earth", 3: "Ele_Fire",
  4: "Ele_Wind", 5: "Ele_Poison", 6: "Ele_Holy", 7: "Ele_Dark", 8: "Ele_Ghost", 9: "Ele_Undead",
};
const SIZE_TO_KEY = { Small: "Size_Small", Medium: "Size_Medium", Large: "Size_Large" };

function calculateCardFix(build, gearBonuses, atkElement, target, isRanged, pmf, result) {
  const raceRc = RACE_TO_RC[target.race] || "";
  const bossRc = target.is_boss ? "RC_Boss" : "RC_NonBoss";
  const eleKey = ELE_TO_KEY[target.element] || "";
  const sizeKey = SIZE_TO_KEY[target.size] || "";
  const atkEleKey = ELE_TO_KEY[atkElement] || "Ele_Neutral";

  const addRace = gearBonuses.add_race;
  const addEle = gearBonuses.add_ele;
  const addSize = gearBonuses.add_size;

  const raceBonus = addRace[raceRc] || 0;
  const eleBonus = (addEle[eleKey] || 0) + (addEle.Ele_All || 0);
  const sizeBonus = (addSize[sizeKey] || 0) + (addSize.Size_All || 0);
  const bossBonus = addRace[bossRc] || 0;
  const longBonus = isRanged ? gearBonuses.long_atk_rate : 0;
  const atkEleBonus = gearBonuses.add_atk_ele[atkEleKey] || 0;
  // Monster-family (bAddRace2 / "Bane" cards) damage — a separate multiplicative
  // factor from race/ele/size. Two sources:
  //  - add_type: the wildcard "Type" mix, which applies unconditionally (a "what if
  //    I slot the matching card" simulation).
  //  - add_race2: real "Bane" cards (Orc Lady, Goblin/Kobold Leader, Lava Golem, ...),
  //    keyed by RC2 family; applied only when the target mob is in that family.
  const typeBonus = gearBonuses.add_type || 0;
  const addRace2 = gearBonuses.add_race2 || {};
  let race2Bonus = 0;
  for (const g of target.race2 || []) race2Bonus += addRace2[g] || 0;
  // bAddDamageClass: +% physical damage vs one specific monster (by mob id).
  const addClass = gearBonuses.add_damage_class || {};
  const classBonus = target.mob_id != null ? (addClass[target.mob_id] || addClass[String(target.mob_id)] || 0) : 0;

  const [, , avIn] = pmfStats(pmf);

  for (const bonus of [raceBonus, eleBonus, sizeBonus, bossBonus, longBonus, atkEleBonus, typeBonus, race2Bonus, classBonus]) {
    if (bonus) pmf = scaleFloor(pmf, 100 + bonus, 100);
  }

  if (target.is_pc) {
    const tEle = (target.sub_ele[atkEleKey] || 0) + (target.sub_ele.Ele_All || 0);
    const tSize = target.sub_size.Size_Medium || 0;
    const tRace = target.sub_race.RC_DemiHuman || 0;
    const tNearLong = isRanged ? target.long_attack_def_rate : target.near_attack_def_rate;
    for (const reduction of [tEle, tSize, tRace, tNearLong]) {
      if (reduction) pmf = scaleFloor(pmf, 100 - reduction, 100);
    }
  }

  const [mn, mx, av] = pmfStats(pmf);
  const multiplier = avIn ? av / avIn : 1.0;
  result.add_step({
    name: "Card Fix", value: av, min_value: mn, max_value: mx, multiplier,
    note: `Race ${raceRc}+${raceBonus}%  ${target.is_boss ? "Boss" : "NonBoss"}+${bossBonus}%  Ele+${addEle[eleKey] || 0}%  Size+${addSize[sizeKey] || 0}%${isRanged ? `  LongAtk+${longBonus}%` : ""}${typeBonus ? `  Type+${typeBonus}%` : ""}${race2Bonus ? `  Family(${(target.race2 || []).join(",")})+${race2Bonus}%` : ""}${classBonus ? `  Mob#${target.mob_id}+${classBonus}%` : ""}`,
    formula: `dmg × multiple race/ele/size/boss/long/atk-ele factors`,
    hercules_ref: "battle.c:1183-1198",
  });

  return pmf;
}

/**
 * @param {object|null} caster — the ATTACKER, when the defender is a player. Hercules'
 *   `battle_calc_cardfix` BF_MAGIC branch (battle.c:1132-1156) reduces incoming magic by
 *   the defender's `subele`, `subsize[caster size]`, `subrace[caster race]`,
 *   `subrace[RC_Boss|RC_NonBoss]`, `magic_def_rate`, and — pre-renewal only, per
 *   Skotlex's "ranged defense also counts vs magic" — the ranged def rate. A magic
 *   attack sets `ad.flag = BF_MAGIC|BF_SKILL` (battle.c:4025) with NEITHER BF_SHORT nor
 *   BF_LONG, so the `wflag&BF_SHORT` test is false and it is always the LONG rate.
 *   Pass `{race, size, is_boss}` for a monster caster. When omitted the caller is the
 *   player-vs-player path, which keeps the old Demi-Human-only behaviour (a player
 *   caster IS Demi-Human); its size/boss terms remain unmodelled — see ROADMAP.
 */
function calculateCardFixMagic(target, magicEleName, pmf, result, gearBonuses = null, caster = null) {
  const [, , avIn] = pmfStats(pmf);
  // bMagicAddRace/bMagicAddEle key off the TARGET's own race/element (e.g.
  // "magic damage to Fire-element monsters +10%"), not the spell's attack
  // element (magicEleName) -- those are two different things checked here.
  let raceBonus = 0, bossBonus = 0, eleBonus = 0, raceRc = "", targetEleKey = "";
  if (gearBonuses != null) {
    const mar = gearBonuses.magic_add_race;
    const mae = gearBonuses.magic_add_ele;
    raceRc = RACE_TO_RC[target.race] || "";
    const bossRc = target.is_boss ? "RC_Boss" : "RC_NonBoss";
    targetEleKey = ELE_TO_KEY[target.element] || "";
    raceBonus = mar[raceRc] || 0;
    bossBonus = mar[bossRc] || 0;
    eleBonus = (mae[targetEleKey] || 0) + (mae.Ele_All || 0);
    for (const bonus of [raceBonus, bossBonus, eleBonus]) {
      if (bonus) pmf = scaleFloor(pmf, 100 + bonus, 100);
    }
  }

  let [mn, mx, av] = pmfStats(pmf);
  if (!target.is_pc) {
    const multiplier = avIn ? av / avIn : 1.0;
    result.add_step({ name: "Card Fix (Magic)", value: av, min_value: mn, max_value: mx, multiplier, note: (raceBonus || bossBonus || eleBonus) ? `MagicRace ${raceRc}+${raceBonus}%  MagicEle ${targetEleKey}+${eleBonus}%` : "no magic card bonuses", formula: "dmg × race/boss/ele factors", hercules_ref: "battle.c:1072-1085" });
    return pmf;
  }

  const tEle = (target.sub_ele[magicEleName] || 0) + (target.sub_ele.Ele_All || 0);
  // Caster race/size/boss. Without a caster the attacker is a player: Demi-Human, and
  // its size/boss terms stay unmodelled exactly as before (keeps PvP output unchanged).
  const casterRaceRc = caster ? (RACE_TO_RC[caster.race] || "") : "RC_DemiHuman";
  const tRace = (casterRaceRc && target.sub_race[casterRaceRc]) || 0;
  const tBoss = caster ? (target.sub_race[caster.is_boss ? "RC_Boss" : "RC_NonBoss"] || 0) : 0;
  const casterSizeKey = caster ? (SIZE_TO_KEY[caster.size] || "") : "";
  const tSize = (casterSizeKey && target.sub_size && target.sub_size[casterSizeKey]) || 0;
  // Magic carries neither BF_SHORT nor BF_LONG, so the LONG rate is the one that applies.
  const tLong = caster ? (target.long_attack_def_rate || 0) : 0;
  const tMagicDef = target.magic_def_rate;
  for (const reduction of [tEle, tSize, tRace, tBoss, tLong, tMagicDef]) {
    if (reduction) pmf = scaleFloor(pmf, 100 - reduction, 100);
  }

  [mn, mx, av] = pmfStats(pmf);
  const multiplier = avIn ? av / avIn : 1.0;
  result.add_step({ name: "Card Fix (Magic)", value: av, min_value: mn, max_value: mx, multiplier, note: `MagicRace+${raceBonus}%  MagicEle ${targetEleKey}+${eleBonus}%  Ele-${tEle}%  Size-${tSize}%  Race-${tRace}%  Boss-${tBoss}%  Ranged-${tLong}%  MagicDef-${tMagicDef}%`, formula: "dmg × ele/size/race/boss/ranged/magicdef reductions", hercules_ref: "battle.c:1132-1156" });
  return pmf;
}

// NOT YET WIRED INTO battlePipeline.js: incoming (mob -> player) card fix variants.
// Ported here for completeness/future use by an incoming-damage pipeline.
function calculateIncomingPhysical(mobRace, mobElement, mobSize, isRanged, playerTarget, pmf, result) {
  let [mn, mx, av] = pmfStats(pmf);
  if (!playerTarget.is_pc) {
    result.add_step({ name: "Card Fix (Incoming Physical)", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: "target is not a player", formula: "no change", hercules_ref: "battle.c battle_calc_cardfix" });
    return pmf;
  }
  const eleKey = ELE_TO_KEY[mobElement] || "Ele_Neutral";
  const raceRc = RACE_TO_RC[mobRace] || "";
  const sizeKey = SIZE_TO_KEY[mobSize] || "";
  const [, , avIn] = pmfStats(pmf);
  const tEle = (playerTarget.sub_ele[eleKey] || 0) + (playerTarget.sub_ele.Ele_All || 0);
  const tSize = playerTarget.sub_size[sizeKey] || 0;
  const tRace = playerTarget.sub_race[raceRc] || 0;
  const tNearLong = isRanged ? playerTarget.long_attack_def_rate : playerTarget.near_attack_def_rate;
  for (const reduction of [tEle, tSize, tRace, tNearLong]) {
    if (reduction) pmf = scaleFloor(pmf, 100 - reduction, 100);
  }
  [mn, mx, av] = pmfStats(pmf);
  const multiplier = avIn ? av / avIn : 1.0;
  result.add_step({ name: "Card Fix (Incoming Physical)", value: av, min_value: mn, max_value: mx, multiplier, note: `Ele-${tEle}% Size-${tSize}% Race-${tRace}% Def-${tNearLong}%`, formula: "dmg × resist factors", hercules_ref: "battle.c:1269-1341" });
  return pmf;
}

module.exports = { calculateCardFix, calculateCardFixMagic, calculateIncomingPhysical };
