/**
 * skillRatio.js — JS port of core/calculators/modifiers/skill_ratio.py
 *
 * NOT FULLY PORTED: the upstream table covers ~100 BF_WEAPON skills plus
 * weapon-type-dependent splits (RG_BACKSTAP), parameter-dependent skills
 * (KN_CHARGEATK, MC_CARTREVOLUTION, TK_JUMPKICK, MO_EXTREMITYFIST,
 * NJ_ZENYNAGE...), and the full BF_MAGIC ratio table. What's ported below is
 * the dispatch/precedence logic (identical to the original) and the subset
 * of BF_WEAPON ratios verified directly from source during this port —
 * enough to cover normal attacks and the most common low-tier weapon skills
 * across each class. Anything not listed here falls back to skills.json's
 * ratio_per_level/ratio_base, exactly like the original's own fallback for
 * unaudited skills — so the pipeline never breaks, it just uses a less
 * specific ratio for skills not yet transcribed.
 */
const { loader } = require("../../dataLoader");
const { scaleFloor, scaleFloorNumRange, addFlat, pmfStats } = require("../../pmf");
const { STANDARD } = require("../../serverProfiles");

// battle.c:2039 battle_calc_skillratio BF_WEAPON switch (#else not RENEWAL) — verified subset.
const BF_WEAPON_RATIOS = {
  SM_BASH: (lv) => 100 + 30 * lv,
  SM_MAGNUM: (lv) => 100 + 20 * lv,
  KN_BRANDISHSPEAR: (lv) => 100 + 20 * lv,
  KN_SPEARSTAB: (lv) => 100 + 20 * lv,
  KN_SPEARBOOMERANG: (lv) => 100 + 50 * lv,
  KN_PIERCE: (lv) => 100 + 10 * lv,
  KN_BOWLINGBASH: (lv) => 100 + 40 * lv,
  CR_SHIELDCHARGE: (lv) => 100 + 20 * lv,
  CR_HOLYCROSS: (lv) => 100 + 35 * lv,
  MC_MAMMONITE: (lv) => 100 + 50 * lv,
  TF_POISON: () => 100,
  TF_SPRINKLESAND: () => 130,
  AS_SONICBLOW: (lv) => 400 + 40 * lv,
  AS_GRIMTOOTH: (lv) => 100 + 20 * lv,
  AS_VENOMKNIFE: () => 100,
  RG_RAID: (lv) => 100 + 40 * lv,
  RG_INTIMIDATE: (lv) => 100 + 30 * lv,
  AC_DOUBLE: (lv) => 100 + 10 * (lv - 1),
  AC_SHOWER: (lv) => 75 + 5 * lv,
  AC_CHARGEARROW: () => 150,
  HT_PHANTASMIC: () => 150,
  MO_TRIPLEATTACK: (lv) => 100 + 20 * lv,
  MO_CHAINCOMBO: (lv) => 150 + 50 * lv,
  MO_COMBOFINISH: (lv) => 240 + 60 * lv,
  MO_BALKYOUNG: () => 300,
  BA_MUSICALSTRIKE: (lv) => 125 + 25 * lv,
  DC_THROWARROW: (lv) => 125 + 25 * lv,
  CG_ARROWVULCAN: (lv) => 200 + 100 * lv,   // battle.c: skillratio += 100 + 100*lv (base 100) → Lv1 300%..Lv10 1200%
  // Learnable damage skills that were falling through to a flat 100% ratio. These
  // are the vanilla pre-re formulas (ROADMAP "Not-yet-ported BF_WEAPON" audit,
  // battle.c refs); not yet PS-confirmed, so they stay flagged "PS unaudited" on
  // the Payon Stories profile until verified in-game.
  CH_TIGERFIST: (lv) => 40 + 100 * lv,       // Tiger Knuckle Fist (battle.c:2073)
  CH_CHAINCRUSH: (lv) => 400 + 100 * lv,     // Chain Crush Combo (battle.c:2076)
  CH_PALMSTRIKE: (lv) => 200 + 100 * lv,     // Raging Palm Strike (battle.c:2079)
  LK_HEADCRUSH: (lv) => 100 + 40 * lv,       // Head Crush (battle.c:2082)
  LK_JOINTBEAT: (lv) => 50 + 10 * lv,        // Joint Beat base (×2 w/ Break-Neck ailment — not modeled) (battle.c:2085)
  SN_SHARPSHOOTING: (lv) => 200 + 50 * lv,   // Sharp Shooting; auto-crit is wired separately in critChance.js (battle.c:2094)
  AM_DEMONSTRATION: (lv) => 100 + 20 * lv,
  // Added from core/calculators/modifiers/skill_ratio.py's _BF_WEAPON_RATIOS
  // (StatGameDev/Open_PS_Calc, MIT) — fills the table out to its full 52 entries.
  AM_ACIDTERROR: (lv) => 100 + 40 * lv,
  HT_FREEZINGTRAP: (lv) => 50 + 10 * lv,
  KN_AUTOCOUNTER: () => 100,
  MO_FINGEROFFENSIVE: (lv) => 100 + 50 * lv,
  MO_INVESTIGATE: (lv) => 100 + 75 * lv,
  TK_STORMKICK: (lv) => 160 + 20 * lv,
  TK_DOWNKICK: (lv) => 160 + 20 * lv,
  TK_TURNKICK: (lv) => 190 + 30 * lv,
  TK_COUNTER: (lv) => 190 + 30 * lv,
  GS_TRIPLEACTION: (lv) => 100 + 50 * lv,
  GS_BULLSEYE: (lv, tgt) => 100 + ((tgt && ["Brute", "Demi-Human"].includes(tgt.race) && !tgt.is_boss) ? 400 : 0),
  GS_TRACKING: (lv) => 200 + 100 * lv,
  GS_PIERCINGSHOT: (lv) => 100 + 20 * lv,
  GS_RAPIDSHOWER: (lv) => 100 + 10 * lv,
  GS_DESPERADO: (lv) => 50 + 50 * lv,
  GS_DUST: (lv) => 100 + 50 * lv,
  GS_FULLBUSTER: (lv) => 300 + 100 * lv,
  GS_SPREADATTACK: (lv) => 100 + 20 * (lv - 1),
  GS_MAGICALBULLET: () => 100,
  NJ_HUUMA: (lv) => 150 + 150 * lv,
  NJ_KASUMIKIRI: (lv) => 100 + 10 * lv,
  NJ_KIRIKAGE: (lv) => 100 * lv,
  NJ_KUNAI: () => 100,
};

function calculateSkillRatio(skill, pmf, build, result, opts = {}) {
  const { target = null, weapon = null, profile = STANDARD, ctx = null, gear_bonuses: gearBonuses = null } = opts;

  const skillData = loader.getSkill(skill.id);
  const skillName = skillData ? skillData.name || "" : "";

  const params = build.skill_params || {};
  let flatAdd = 0;
  let ratio, ratioSrc;

  const psRatioFn = (profile.weapon_ratios || {})[skillName];
  if (psRatioFn != null) {
    ratio = psRatioFn(skill.level, target, ctx);
    ratioSrc = `PS profile.weapon_ratios[${skillName}]`;
  } else if (BF_WEAPON_RATIOS[skillName]) {
    ratio = BF_WEAPON_RATIOS[skillName](skill.level, target, ctx);
    ratioSrc = `BF_WEAPON_RATIOS[${skillName}]`;
  } else if (skillData && skillData.ratio_per_level && skillData.ratio_per_level.length) {
    const ratioList = skillData.ratio_per_level;
    ratio = skill.level <= ratioList.length ? ratioList[skill.level - 1] : (skillData.ratio_base ?? 100);
    ratioSrc = `ratio_per_level[lv${skill.level}]`;
  } else {
    ratio = skillData ? (skillData.ratio_base ?? 100) : 100;
    ratioSrc = "ratio_base (default 100)";
  }

  if ((profile.param_skill_flat_adds || {})[skillName]) {
    flatAdd += profile.param_skill_flat_adds[skillName](params, skill.level);
  }

  // Everything that moves the ratio after the skill's own value, recorded so the
  // breakdown can SHOW the arithmetic. A player reported that Power-Thrust's
  // contribution was invisible: the row read "×2.75" with no hint that 250% of it
  // was Cart Revolution and 25 points were the buff.
  const baseRatio = ratio;
  const ratioParts = [];

  const active = build.active_status_levels || {};
  // Power-Thrust (BS_OVERTHRUST) is a FIVE-rank skill: +5% ATK per rank, +25% at
  // max, added to the skill multiplier rather than multiplied in
  // (wiki.payonstories.com/Power-Thrust). Clamp the rank — the buff picker offered
  // 10 ranks for a while, so shared builds carry a Lv10 that would read as +50%
  // (a player caught Cart Revolution being priced at 300% instead of 275%).
  const otMax = (loader.getSkillByName("BS_OVERTHRUST") || {}).max_level || 5;
  if ("SC_OVERTHRUST" in active) {
    const lv = Math.min(active.SC_OVERTHRUST, otMax);
    ratio += 5 * lv;
    ratioParts.push(`Power-Thrust Lv${lv} +${5 * lv}`);
  } else {
    const otLv = Math.min(Number(build.support_buffs.SC_OVERTHRUST || 0), otMax);
    if (otLv > 0) {
      const add = profile.mechanic_flags.has("BS_OVERTHRUST_PARTY_FULL_BONUS") ? 5 * otLv : 5;
      ratio += add;
      ratioParts.push(`Power-Thrust Lv${otLv} (party) +${add}`);
    }
  }
  if ("SC_OVERTHRUSTMAX" in active) {
    const add = 20 * active.SC_OVERTHRUSTMAX;
    ratio += add;
    ratioParts.push(`Maximum Power-Thrust Lv${active.SC_OVERTHRUSTMAX} +${add}`);
  }

  if (skillName === "AS_SONICBLOW" && (params.AS_SONICBLOW_sonic_accel ?? true)) {
    const before = ratio;
    ratio = Math.floor(ratio * 110 / 100);
    ratioSrc += " ×1.1 (Sonic Accel)";
    ratioParts.push(`Sonic Acceleration ×1.1 (${before} → ${ratio})`);
  }

  // PS Performing (Bard/Dancer, Musical Strike / Throw Arrow): the profile
  // ratio fn folds the +100-point bonus into `ratio`. Re-evaluate with the
  // flag off so the bonus can be surfaced as its own breakdown step below —
  // the full ratio is still applied in a single floor, as in-game.
  let perfBaseRatio = null;
  if (psRatioFn != null && params.PS_PERFORMING_active && ctx) {
    const ctxOff = { ...ctx, skill_params: { ...params, PS_PERFORMING_active: false } };
    const base = psRatioFn(skill.level, target, ctxOff);
    if (base !== ratio) perfBaseRatio = base;
  }

  let hitCountRaw = 1;
  if (skillName === "MO_FINGEROFFENSIVE") {
    // Throws one spirit sphere per skill level (each a hit), capped by the active
    // spheres set on the build — you can't throw more than you have. 0 spheres
    // (unset) assumes you have enough for the cast level. An explicit skill_param
    // override still wins. wiki.payonstories.com/Finger_Offensive.
    const spheres = build.spirit_spheres || 0;
    const fromBuild = spheres > 0 ? Math.min(skill.level, spheres) : skill.level;
    hitCountRaw = Math.max(1, params.MO_FINGEROFFENSIVE_spheres || fromBuild);
  } else {
    const psHcFn = (profile.weapon_hit_counts || {})[skillName];
    if (psHcFn) {
      hitCountRaw = psHcFn(skill.level, target, ctx);
    } else if (skillData) {
      const noh = skillData.number_of_hits;
      if (noh && skill.level <= noh.length) hitCountRaw = noh[skill.level - 1];
    }
  }
  pmf = scaleFloor(pmf, ratio, 100);
  if (flatAdd > 0) pmf = addFlat(pmf, flatAdd);

  // hitCountRaw is normally a number (fixed hits). A weapon_hit_counts fn may
  // instead return a {min,max} range for variable-hit skills (e.g. Desperado's
  // 1–10 shots) — that spans the damage across the hit spread instead of
  // collapsing to a single average.
  let hitLabel;
  let hitCount; // representative hit count returned to the caller (forge-bonus divisor)
  if (hitCountRaw && typeof hitCountRaw === "object") {
    const lo = Math.max(0, hitCountRaw.min | 0);
    const hi = Math.max(lo, hitCountRaw.max | 0);
    pmf = scaleFloorNumRange(pmf, lo, hi, 1, 1);
    hitLabel = `${lo}–${hi} hits`;
    hitCount = Math.max(1, Math.round((lo + hi) / 2));
  } else {
    const cosmetic = hitCountRaw < 0;
    const trueHits = Math.abs(hitCountRaw) || 1;       // real number of hits (vanilla wd.div_)
    const pmfMult = hitCountRaw > 0 ? hitCountRaw : 1;  // cosmetic skills fold all hits into one combined-ratio damage
    pmf = scaleFloor(pmf, pmfMult, 1);
    // Returned divisor is the TRUE hit count. Flat per-hit mastery adds — the Star
    // Crumb forge bonus and spirit spheres — proc on every real hit (vanilla
    // ATK_ADD(wd.div_ × …)). For a cosmetic skill the damage ratio is already
    // combined (pmfMult=1), but those flat adds must still multiply by all hits
    // (e.g. Triple Attack = 3, Chain Combo = 4).
    hitCount = trueHits;
    hitLabel = cosmetic ? `${trueHits} cosmetic hits` : `${pmfMult} hits`;
  }

  if (gearBonuses) {
    const skillAtkBonus = gearBonuses.skill_atk[skillName] || 0;
    if (skillAtkBonus) {
      pmf = scaleFloor(pmf, 100 + skillAtkBonus, 100);
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({ name: "Skill ATK Bonus", value: av, min_value: mn, max_value: mx, multiplier: (100 + skillAtkBonus) / 100, note: `bSkillAtk: ${skillName} +${skillAtkBonus}%`, formula: `dmg × (100+${skillAtkBonus})/100`, hercules_ref: "pc.c:3513-3527" });
    }
  }

  // The step's label and note, in players' terms rather than ids: "Skill Ratio
  // (ID 0 Lv 1)" told nobody anything. Normal attacks say so; skills carry their
  // display name and rank; and the note spells out how the percentage was reached
  // when anything modified it.
  const skillLabel = skill.id === 0
    ? "Normal attack"
    : `${loader.getSkillDisplayName(skillName, profile) || skillName || `Skill ${skill.id}`} Lv${skill.level}`;
  const ratioNote = ratioParts.length
    ? `${skillLabel}: ${baseRatio}%` + ratioParts.map((p) => ` + ${p}`).join("") + ` = ${ratio}%`
      + " — ATK buffs are ADDED into the skill's ratio, not multiplied onto the total."
    : (skillData ? skillData.description || "" : "");

  const [mn, mx, av] = pmfStats(pmf);
  if (perfBaseRatio != null) {
    // Display split: base ratio first, then the Performing bonus as its own
    // step. The intermediate row's values are scaled back from the real pmf
    // (cosmetic only — the damage applied the full ratio in one floor above).
    const back = perfBaseRatio / ratio;
    result.add_step({
      name: `Skill Ratio (${skillLabel})`,
      value: Math.round(av * back), min_value: Math.round(mn * back), max_value: Math.round(mx * back),
      multiplier: perfBaseRatio / 100,
      note: skillData ? skillData.description || "" : "",
      formula: `dmg × ${perfBaseRatio}% × ${hitLabel} (${ratioSrc})`,
      hercules_ref: "battle.c battle_calc_skillratio",
    });
    result.add_step({
      name: "Performing", value: av, min_value: mn, max_value: mx,
      multiplier: ratio / perfBaseRatio,
      note: `Song/dance active: +${ratio - perfBaseRatio} ratio points (${perfBaseRatio}% → ${ratio}%)`,
      formula: `dmg × ${ratio} / ${perfBaseRatio}`,
      hercules_ref: "wiki.payonstories.com — Musical Strike / Throw Arrow",
    });
  } else {
    result.add_step({
      name: `Skill Ratio (${skillLabel})`, value: av, min_value: mn, max_value: mx, multiplier: ratio / 100,
      note: ratioNote,
      formula: `dmg × ${ratio}% × ${hitLabel} (${ratioSrc})`,
      hercules_ref: "battle.c battle_calc_skillratio",
    });
  }

  if (
    profile !== STANDARD && skillName &&
    !((profile.weapon_ratios || {})[skillName]) &&
    !(profile.weapon_vanilla_ok || new Set()).has?.(skillName)
  ) {
    result.add_step({
      name: "⚠ Vanilla fallback (PS unaudited)", value: av, min_value: mn, max_value: mx, multiplier: 1.0,
      note: `${skillName}: PS formula not confirmed in this port — using vanilla ratio as fallback.`,
      formula: "unverified vanilla fallback", hercules_ref: "",
    });
  }

  return [pmf, hitCount];
}

module.exports = { calculateSkillRatio, BF_WEAPON_RATIOS };
