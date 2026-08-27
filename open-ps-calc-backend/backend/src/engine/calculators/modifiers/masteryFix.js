/**
 * masteryFix.js — JS port of core/calculators/modifiers/mastery_fix.py
 */
const { loader } = require("../../dataLoader");
const { STANDARD } = require("../../serverProfiles");
const { addFlat, scaleFloor, pmfStats } = require("../../pmf");

const PS_PRIEST_WEAPON_TYPES = new Set(["Staff", "2HStaff", "Book", "Knuckle"]);
const MASTERY_EXEMPT_SKILLS = new Set(["MO_INVESTIGATE", "MO_EXTREMITYFIST", "CR_GRANDCROSS", "NJ_ISSEN", "CR_ACIDDEMONSTRATION"]);
const SECONDARY_MASTERIES = ["AL_DEMONBANE", "HT_BEASTBANE"];

function vanillaSecondaryBonus(skillName, lv, target, build) {
  if (skillName === "AL_DEMONBANE") {
    if (target.is_pc) return null;
    if (target.race === "Undead" || target.race === "Demon" || target.element === 9) {
      // Hercules floors the per-level multiplier, then ×lv: lv × floor(3 + (BaseLv+1)/20).
      return lv * Math.floor(3 + (build.base_level + 1) / 20);
    }
    return null;
  }
  if (skillName === "HT_BEASTBANE") {
    if (target.race === "Brute" || target.race === "Insect") return lv * 4;
    return null;
  }
  return null;
}

function calculateMasteryFix(weapon, build, target, pmf, result, skill = null, opts = {}) {
  // `step_label` / `quiet_if_zero` exist for Grand Cross, which runs this twice —
  // once per half — so the breakdown can name which half a bonus landed on, and so
  // a build with no masteries at all doesn't grow a second "+0" row.
  const { profile = STANDARD, ctx = null, step_label: stepLabel = "Mastery Fix", quiet_if_zero: quietIfZero = false } = opts;
  const mastery = ctx != null ? ctx.skill_levels : build.mastery_levels;

  const psGrandCrossOverride = skill != null && skill.name === "CR_GRANDCROSS" && profile.mechanic_flags.has("PS_GRANDCROSS_MASTERY_APPLIES");
  if (skill != null && MASTERY_EXEMPT_SKILLS.has(skill.name) && !psGrandCrossOverride) {
    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Mastery Fix", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: `BYPASSED — ${skill.name} is exempt`, formula: "no change", hercules_ref: "battle.c:838-842" });
    return pmf;
  }

  for (const secSkill of SECONDARY_MASTERIES) {
    const secLv = mastery[secSkill] || 0;
    if (secLv === 0) continue;
    const overrideFn = (profile.mastery_ctx_overrides || {})[secSkill];
    // `skill` is passed through because a PS override can depend on which skill is
    // swinging — Grand Cross takes Demon Bane's demon/undead half but not its flat
    // half (see PS_MASTERY_CTX_OVERRIDES).
    const secBonus = overrideFn ? overrideFn(secLv, target, ctx, skill) : vanillaSecondaryBonus(secSkill, secLv, target, build);
    if (secBonus) {
      pmf = addFlat(pmf, secBonus);
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({ name: `Mastery Fix (${secSkill})`, value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: `${secSkill} Lv ${secLv}: +${secBonus}`, formula: `dmg + ${secBonus}`, hercules_ref: "battle.c:713-728" });
    }
  }

  let masteryKey = loader.getMasteryWeaponMap()[weapon.weapon_type];
  if (masteryKey == null && profile.ps_mastery_weapon_map) {
    masteryKey = profile.ps_mastery_weapon_map[weapon.weapon_type];
  }
  if (masteryKey && profile.mastery_prefer_fallback) {
    // A weapon type can have more than one PS replacement mastery (Mace: the Monk's
    // Martial Arts, or the Merchant line's Tool Mastery) — take the first the
    // character actually has ranks in.
    const pref = profile.mastery_prefer_fallback[masteryKey];
    const candidates = Array.isArray(pref) ? pref : pref ? [pref] : [];
    const chosen = candidates.find((k) => (mastery[k] || 0) > 0);
    if (chosen) masteryKey = chosen;
  }
  if (
    profile.mechanic_flags.has("PR_MACEMASTERY_EXPANDED_WEAPON_TYPES") &&
    masteryKey == null && PS_PRIEST_WEAPON_TYPES.has(weapon.weapon_type)
  ) {
    masteryKey = "PR_MACEMASTERY";
  }

  let bonus = 0;
  let note = `No mastery defined for ${weapon.weapon_type}`;
  let formula = "dmg (no mastery)";

  if (masteryKey != null) {
    const masteryLevel = mastery[masteryKey] || 0;
    const atkList = ((profile.passive_overrides || {})[masteryKey] || {}).atk_per_lv;
    const overrideFn = (profile.mastery_ctx_overrides || {})[masteryKey];

    if (Array.isArray(atkList) && masteryLevel > 0) {
      bonus = atkList[masteryLevel - 1];
      note = `${masteryKey} Lv ${masteryLevel} [PS]: +${bonus}`;
      formula = `dmg + atk_per_lv[${masteryLevel - 1}]`;
    } else if (overrideFn) {
      const overrideVal = overrideFn(masteryLevel, target, ctx);
      if (overrideVal == null) {
        note = `${masteryKey} Lv ${masteryLevel} [PS]: no bonus`;
        formula = "dmg (no change)";
      } else {
        bonus = overrideVal;
        note = `${masteryKey} Lv ${masteryLevel} [PS]: +${bonus}`;
        formula = "dmg + PS_override";
      }
    } else {
      const psVal = (profile.mastery_per_level || {})[masteryKey];
      let mult;
      if (psVal != null) {
        mult = Array.isArray(psVal) ? (build.is_riding_peco ? psVal[1] : psVal[0]) : psVal;
      } else {
        mult = loader.getMasteryMultiplier(masteryKey, build);
      }
      bonus = masteryLevel * mult;
      note = `${masteryKey} Lv ${masteryLevel} for ${weapon.weapon_type} (+${bonus})`;
      formula = `dmg + (mastery_level * ${mult})`;
    }
  }

  pmf = addFlat(pmf, bonus);
  let [mn, mx, av] = pmfStats(pmf);
  if (!(quietIfZero && bonus === 0)) {
    result.add_step({ name: stepLabel, value: av, min_value: mn, max_value: mx, multiplier: 1.0, note, formula, hercules_ref: "battle.c add_mastery" });
  }

  const ascKatarLv = mastery.ASC_KATAR || 0;
  if (weapon.weapon_type === "Katar" && ascKatarLv > 0) {
    const ratio = 100 + 10 + 2 * ascKatarLv;
    pmf = scaleFloor(pmf, ratio, 100);
    [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Adv. Katar Mastery", value: av, min_value: mn, max_value: mx, multiplier: ratio / 100, note: `ASC_KATAR Lv ${ascKatarLv}: ×${(ratio / 100).toFixed(2)}`, formula: `dmg * (110+2×${ascKatarLv}) / 100`, hercules_ref: "battle.c:927-929" });
  }

  // Throw Shuriken's own flat ATK: +5 per skill level, on top of Throwing Mastery's +3.
  // Applied HERE, at the mastery position, because the Ninja page says the two together
  // "act like mastery damage and therefore bypass normal defense" — adding it to base ATK
  // instead would let the target's DEF eat it. wiki.payonstories.com/Throw_Shuriken
  // ("ATK Increase +5 … +50").
  if (skill != null && skill.name === "NJ_SYURIKEN" && skill.level > 0) {
    const flat = 5 * skill.level;
    pmf = addFlat(pmf, flat);
    [mn, mx, av] = pmfStats(pmf);
    result.add_step({
      name: "Throw Shuriken ATK", value: av, min_value: mn, max_value: mx, multiplier: 1.0,
      note: `NJ_SYURIKEN Lv ${skill.level}: +${flat} (mastery-type — bypasses DEF)`,
      formula: `dmg + 5×${skill.level}`,
      hercules_ref: "wiki.payonstories.com/Throw_Shuriken",
    });
  }

  const njTobiLv = mastery.NJ_TOBIDOUGU || 0;
  if (skill != null && skill.name === "NJ_SYURIKEN" && njTobiLv > 0) {
    pmf = addFlat(pmf, 3 * njTobiLv);
    [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Throw Mastery", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: `NJ_TOBIDOUGU Lv ${njTobiLv}: +${3 * njTobiLv}`, formula: `dmg + 3×${njTobiLv}`, hercules_ref: "battle.c:843-850" });
  }

  // battle.c:862-865 (battle_calc_masteryfix, #ifndef RENEWAL): `if (weapon) damage += 60;`.
  // That `weapon` bool is `flag.weapon`, set to 1 unconditionally at the top of
  // battle_calc_weapon_attack (battle.c:4846) and only ever cleared for four shield skills
  // (PA_SHIELDCHAIN/CR_SHIELDBOOMERANG/LG_SHIELDPRESS/LG_EARTHDRIVE, battle.c:4918) — not
  // "a weapon is equipped". For NJ_KUNAI it's always true, so this applies Unarmed or not,
  // same as NJ_SYURIKEN's Throwing Mastery bonus above.
  if (skill != null && skill.name === "NJ_KUNAI") {
    pmf = addFlat(pmf, 60);
    [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Kunai Mastery", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: "NJ_KUNAI: +60 flat", formula: "dmg + 60", hercules_ref: "battle.c:862-865" });
  }

  if (skill != null && skill.name === "TF_POISON") {
    const poisonBonus = 15 * skill.level;
    pmf = addFlat(pmf, poisonBonus);
    [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Envenom Mastery", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: `TF_POISON Lv ${skill.level}: +${poisonBonus}`, formula: `dmg + 15×${skill.level}`, hercules_ref: "battle.c:511" });
  }

  const bsWrLv = mastery.BS_WEAPONRESEARCH || 0;
  if (bsWrLv) {
    pmf = addFlat(pmf, bsWrLv * 2);
    [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Weapon Research", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: `BS_WEAPONRESEARCH Lv ${bsWrLv}: +${bsWrLv * 2}`, formula: `dmg + ${bsWrLv * 2}`, hercules_ref: "battle.c:5828" });
  }

  return pmf;
}

module.exports = { calculateMasteryFix };
