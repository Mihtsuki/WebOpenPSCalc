/**
 * baseDamage.js — JS port of core/calculators/modifiers/base_damage.py
 * Exact port of battle_calc_base_damage2, including the internal SizeFix
 * application (before batk is added).
 */
const { loader } = require("../../dataLoader");
const { uniformPmf, scaleFloor, addFlat, convolve, pmfStats } = require("../../pmf");

const ARROW_BOW_GUN_TYPES = new Set(["Bow", "Revolver", "Rifle", "Gatling", "Shotgun", "Grenade"]);

// HT_PHANTASMIC is the one skill Hercules force-sets as an arrow attack even though it
// has no AmmoTypes requirement (battle.c:4909, "Since these do not consume ammo, they
// need to be explicitly set as arrow attacks").
const FORCED_ARROW_SKILLS = new Set(["HT_PHANTASMIC"]);

// Whether THIS specific attack actually consumes the equipped ammo. Hercules decides
// this with `sd->state.arrow_atk`, set two DIFFERENT ways depending on context — the
// two branches below mirror them exactly:
//
//   * NORMAL attack (no skill selected) — from the WEAPON: `weapontype == W_BOW ||
//     <guns>` (battle.c:6852, inside battle_weapon_attack). The `isRanged` fallback
//     below.
//   * SKILL cast — OVERWRITTEN from the SKILL's own AmmoTypes requirement
//     (skill_check_condition_castbegin, skill.c:15810):
//         require = skill->get_requirement(sd, skill_id, skill_lv);
//         sd->state.arrow_atk = require.ammo ? 1 : 0;
//     The ammo_types/ammo_amount lookup below.
//
// `flag.arrow` is then set from `arrow_atk` (battle.c:4890) and gates the arrow ATK
// roll (`flag&2`, battle.c:661) — so holding a bow does NOT feed ammo ATK (or, by the
// same logic, ammo element) into every skill, only into skills that actually require
// ammo. This engine used to apply it on weapon type alone, which handed a bow Rogue's
// plagiarised Acid Terror the arrow's ATK (+50 from an Oridecon Arrow) despite Acid
// Terror's requirement being `Items: { Acid_Bottle: 1 }` with no AmmoTypes — reported
// by a player, who was right. Shared by the ammo ATK contribution below and by
// battlePipeline's element resolution: an ammo-driven bAtkEle element (e.g. an
// elemental Kunai) must not leak into an attack that doesn't use that ammo either —
// a bare-handed punch with a Kunai in the ammo slot must not borrow its element.
function skillUsesAmmo(skill, isRanged) {
  const skillName = skill && skill.name;
  if (!skillName) return isRanged; // no skill selected = a normal attack, the weapon-type case
  const skillData = loader.getSkillByName(skillName);
  const req = (skillData && skillData.requirements) || {};
  const needsAmmo = (req.ammo_types || []).length > 0 || (req.ammo_amount || []).some((n) => Number(n) > 0);
  return needsAmmo || FORCED_ARROW_SKILLS.has(skillName);
}

function calculateBaseDamage(status, weapon, build, target, skill, result, opts = {}) {
  const { gear_bonuses: gearBonuses, is_crit: isCrit = false, is_ranged: isRanged = false } = opts;

  const wlv = weapon.level;
  let atkmax = weapon.atk;

  const impLv = Number(build.support_buffs.SC_IMPOSITIO ?? build.active_status_levels.SC_IMPOSITIO ?? 0);
  let impLvEff = impLv;
  if (build.support_buffs.endow_lv1) impLvEff = Math.max(impLvEff, 5);
  if (impLvEff) {
    atkmax += impLvEff * 5;
    result.add_step({ name: "SC_IMPOSITIO", value: impLvEff * 5, note: `SC_IMPOSITIO Lv${impLvEff}: +${impLvEff * 5} weapon ATK`, formula: `level * 5 = ${impLvEff} * 5`, hercules_ref: "status.c ~4562", info: true });
  }

  const drumLv = Number(build.song_state.SC_DRUMBATTLE || 0);
  if (drumLv) {
    const drumBonus = (drumLv + 1) * 25;
    atkmax += drumBonus;
    result.add_step({ name: "SC_DRUMBATTLE", value: drumBonus, note: `Battle Theme Lv${drumLv}: +${drumBonus} weapon ATK`, formula: `(lv+1)*25`, hercules_ref: "status.c:4564", info: true });
  }

  const nibelLv = Number(build.song_state.SC_NIBELUNGEN || 0);
  if (nibelLv && weapon.level === 4) {
    const nibelBonus = (nibelLv + 2) * 25;
    atkmax += nibelBonus;
    result.add_step({ name: "SC_NIBELUNGEN", value: nibelBonus, note: `Nibelungen Lv${nibelLv}: +${nibelBonus} weapon ATK (wlv 4)`, formula: `(lv+2)*25`, hercules_ref: "status.c:4589", info: true });
  }

  if (build.support_buffs.ground_effect === "SC_VOLCANO") {
    const volLv = Number(build.support_buffs.ground_effect_lv || 1);
    const volBonus = volLv * 10;
    atkmax += volBonus;
    result.add_step({ name: "SC_VOLCANO", value: volBonus, note: `Volcano Lv${volLv}: +${volBonus} weapon ATK`, formula: `lv*10`, hercules_ref: "status.c:4570", info: true });
  }

  if (gearBonuses && gearBonuses.weapon_atk_flat) {
    atkmax += gearBonuses.weapon_atk_flat;
    result.add_step({ name: "bAtk", value: gearBonuses.weapon_atk_flat, note: `Equipment: +${gearBonuses.weapon_atk_flat} weapon ATK`, formula: `atkmax += ${gearBonuses.weapon_atk_flat}`, hercules_ref: "status_calc_pc", info: true });
  }

  // Whether the ammo's ATK counts at all — see skillUsesAmmo() above (battle.c's
  // sd->state.arrow_atk mechanism, and the Acid Terror report that established it).
  const usesAmmo = skillUsesAmmo(skill, isRanged);

  let arrowAtk = 0;
  let ammoId = null;
  if (usesAmmo) {
    ammoId = build.equipped.ammo;
    if (ammoId != null) {
      const ammo = loader.getItem(ammoId);
      if (ammo && ammo.type === "IT_AMMO") arrowAtk = ammo.atk || 0;
    }
  }

  let atkmin = Math.floor(status.dex * (80 + wlv * 20) / 100);
  if (atkmin > atkmax) atkmin = atkmax;

  if (ARROW_BOW_GUN_TYPES.has(weapon.weapon_type)) {
    atkmin = Math.floor(atkmin * atkmax / 100);
    if (atkmin > atkmax) atkmax = atkmin;
  }

  const maximizeActive = "SC_MAXIMIZEPOWER" in build.active_status_levels;
  if (maximizeActive) atkmin = atkmax;

  let pmf;
  if (isCrit) pmf = { [atkmax]: 1.0 };
  else if (atkmax > atkmin) pmf = uniformPmf(atkmin, atkmax - 1);
  else pmf = { [atkmin]: 1.0 };

  const [wMin, wMax, wAvg] = pmfStats(pmf);
  result.add_step({
    name: "Weapon ATK Range", value: wAvg, min_value: wMin, max_value: wMax,
    note: `atkmin=${atkmin} atkmax=${atkmax}${isCrit ? " (CRIT)" : ""}${maximizeActive ? " (MAXIMIZEPOWER)" : ""}`,
    formula: isCrit ? `damage = atkmax = ${atkmax}` : `atkmin..atkmax-1`,
    hercules_ref: "battle.c battle_calc_base_damage2",
  });

  if (arrowAtk > 0) {
    if (isCrit) pmf = addFlat(pmf, arrowAtk);
    else pmf = convolve(pmf, uniformPmf(0, arrowAtk - 1));
    const [aMin, aMax, aAvg] = pmfStats(pmf);
    // Name the ammo and say WHY it counts. This step applies to EVERY weapon skill
    // a bow/gun user casts, not just bow skills — Hercules sets `flag.arrow` from
    // `sd->state.arrow_atk`, which is `weapontype == W_BOW || <guns>` and nothing to
    // do with the skill (battle.c:4890 and 6852). A bow Rogue's plagiarised Acid
    // Terror therefore gains the arrow's ATK, which reads like a bug without this.
    const ammoItem = loader.getItem(ammoId);
    const ammoName = (ammoItem && ammoItem.name) || `ammo ${ammoId}`;
    result.add_step({
      name: "Arrow ATK", value: aAvg, min_value: aMin, max_value: aMax,
      note: `${ammoName}: +${arrowAtk} ATK — a bow or gun adds its ammo's ATK to every weapon skill, not only to bow skills`,
      formula: "damage += arrow roll", hercules_ref: "battle.c:658-660, 4890, 6852",
    });
  }

  // Weapon Perfection (BS_WEAPONPERFECT) nullifies the size penalty outright —
  // "All weapons will deal 100% damage on all monsters regardless of the target's
  // size or player's weapon". On PS it is also a PARTY buff ("Party members also
  // receive this skill's effects" — wiki.payonstories.com/Weapon_Perfection), so
  // it counts whether you cast it or a party Blacksmith did. Level sets duration
  // only, so either source is presence-only.
  const weaponPerfect = "SC_WEAPONPERFECT" in build.active_status_levels
    || Number((build.support_buffs || {}).SC_WEAPONPERFECT || 0) > 0;

  let sizeMult = 100;
  let sizeNote;
  if (build.no_sizefix) {
    sizeNote = `size penalty nullified (gear bNoSizeFix) → 100%`;
  } else if (skill.ignore_size_fix) {
    sizeNote = `${skill.name || "skill"} ignores the size penalty → 100%`;
  } else if (weaponPerfect) {
    sizeNote = `size penalty nullified (Weapon Perfection) → 100%`;
  } else {
    sizeMult = loader.getSizeFixMultiplier(weapon.weapon_type, target.size);
    pmf = scaleFloor(pmf, sizeMult, 100);
    sizeNote = `${weapon.weapon_type} vs ${target.size} target → ${sizeMult}%`;
  }

  const [sMin, sMax, sAvg] = pmfStats(pmf);
  result.add_step({
    name: "Size Fix", value: sAvg, min_value: sMin, max_value: sMax, multiplier: sizeMult / 100,
    note: sizeNote,
    formula: `weapon_atk * ${sizeMult} // 100`, hercules_ref: "battle.c lines 659-664",
  });

  pmf = addFlat(pmf, status.batk);
  {
    // Explicit row for the status ATK addition: without it the +BATK jump lands on
    // whichever row happens to follow (the overrefine roll), which read as a bogus
    // "+352 Overrefine Bonus" in the breakdown.
    const [bkMin, bkMax, bkAvg] = pmfStats(pmf);
    result.add_step({
      name: "Status BATK Added", value: bkAvg, min_value: bkMin, max_value: bkMax,
      note: `+${status.batk} status ATK (STR/DEX/LUK + gear)`,
      formula: `damage + batk(${status.batk})`, hercules_ref: "battle.c battle_calc_base_damage2",
    });
  }

  // Every step carries the RUNNING TOTAL (the frontend derives its +/− connector
  // badge from the difference against the previous step) — a no-op step must
  // report the unchanged total, not 0, or it reads as a huge negative hit.
  let overrefine = 0;
  if (weapon.refineable) {
    overrefine = loader.getOverrefine(weapon.level, weapon.refine);
    if (overrefine > 0) {
      pmf = convolve(pmf, uniformPmf(1, overrefine));
      const [orMin, orMax, orAvg] = pmfStats(pmf);
      result.add_step({ name: "Overrefine Bonus", value: orAvg, min_value: orMin, max_value: orMax, note: `rnd()%${overrefine}+1`, formula: `rnd()%${overrefine}+1`, hercules_ref: "battle.c battle_calc_base_damage2" });
    } else {
      const [orMin, orMax, orAvg] = pmfStats(pmf);
      result.add_step({ name: "Overrefine Bonus", value: orAvg, min_value: orMin, max_value: orMax, multiplier: 1.0, note: "No overrefine", formula: "0", hercules_ref: "battle.c" });
    }
  } else {
    const [orMin, orMax, orAvg] = pmfStats(pmf);
    result.add_step({ name: "Overrefine Bonus", value: orAvg, min_value: orMin, max_value: orMax, multiplier: 1.0, note: "Suppressed — weapon not refineable", formula: "0", hercules_ref: "battle.c" });
  }

  const [bdMin, bdMax, bdAvg] = pmfStats(pmf);
  result.add_step({
    name: "Base Damage", value: bdAvg, min_value: bdMin, max_value: bdMax,
    note: `Weapon ATK [${wMin},${wMax}] ×${sizeMult}% + BATK ${status.batk}`,
    formula: `atkmin=${atkmin} atkmax=${atkmax}`, hercules_ref: "battle.c battle_calc_base_damage2",
  });

  return pmf;
}

module.exports = { calculateBaseDamage, ARROW_BOW_GUN_TYPES, skillUsesAmmo };
