/**
 * battlePipeline.js — JS port of core/calculators/battle_pipeline.py
 *
 * SCOPE OF THIS PORT (battle_pipeline.py is 1712 lines covering many branch
 * types; this file covers the single most important path end-to-end):
 *
 * PORTED: normal auto-attacks and BF_WEAPON skills (skill.id != 0) — base
 * damage, skill ratio + hit count, crit branch, defense, active status
 * bonuses, refine bonus, weapon mastery, element (AttrFix), forge bonus,
 * card race/element/size bonuses, final rate bonus, hit chance / crit
 * chance, and a DPS estimate from the normal/miss/crit attack distribution.
 *
 * NOT YET PORTED (explicitly out of scope for this pass):
 *   - BF_MAGIC skills (magic_pipeline.py) — spells will return a "not yet
 *     implemented" marker from calculateBattle() rather than a wrong number.
 *   - CR_GRANDCROSS (grand_cross_pipeline.py) and other BF_MISC skills.
 *   - incoming_physical_pipeline.py / incoming_magic_pipeline.py (mob → player).
 *   - Katar second-hit, dual-wield left-hand branch, TF_DOUBLE/GS_CHAINACTION
 *     procs, MO_TRIPLEATTACK proc branch, item autocasts (bAutoSpell on
 *     attack/skill), NJ_ISSEN's fixed-damage formula, and the many small PS-only multiplicative
 *     bonuses (Cloaking, Lex Aeterna, Mailbreaker/Venom Dust/Raided, Backstab
 *     Opportunity, performing bonuses) that battle_pipeline.py threads
 *     through _run_branch. These all still work as plain weapon-skill ratio
 *     lookups; they just don't get their special-case bonus on top yet.
 *   - bWeaponAtk (per-weapon-type % bonus from bonus2 bWeaponAtk scripts) —
 *     needs a weapon_type → Hercules W_* constant table not transcribed here.
 */
const { loader } = require("../dataLoader");
const { createCalcContext, createDamageResult, createBattleResult, createAttackDefinition } = require("../models");
const { getProfile, STANDARD } = require("../serverProfiles");
const { uniformPmf, scaleFloor, floorAt, pmfStats, convolve, addFlat } = require("../pmf");

const { calculateBaseDamage } = require("./modifiers/baseDamage");
const { calculateRefineFix } = require("./modifiers/refineFix");
const { calculateAttrFix } = require("./modifiers/attrFix");
const { calculateForgeBonus, calculateSpiritSphereBonus } = require("./modifiers/forgeBonus");
const { calculateFinalRateBonus } = require("./modifiers/finalRateBonus");
const { calculateHitChance } = require("./modifiers/hitChance");
const { isCritEligible, calculateCritChance } = require("./modifiers/critChance");
const { calculateCritAtkRate } = require("./modifiers/critAtkRate");
const { calculateActiveStatusBonus } = require("./modifiers/activeStatusBonus");
const { calculateMasteryFix } = require("./modifiers/masteryFix");
const { calculateDefenseFix, calculateMagicDefenseFix } = require("./modifiers/defenseFix");
const { calculateCardFix, calculateCardFixMagic } = require("./modifiers/cardFix");
const { calculateSkillRatio, BF_WEAPON_RATIOS } = require("./modifiers/skillRatio");
const { calculateSkillTiming } = require("./skillTiming");
const { calculateDps } = require("./dpsCalculator");
const { computeFalconDamage } = require("./falconCalc");
const { effectiveIsRanged, resolveWeapon, playerBuildToTarget } = require("../buildManager");
const { resolveArmorElement } = require("../buildApplicator");

// battle.c:3173-3410 BF_MAGIC skillratio switch (#else RENEWAL) — per-hit ratios.
// These are explicit overrides; unlisted skills fall back to skills.json ratio_per_level.
const BF_MAGIC_RATIOS = {
  // Mage
  MG_NAPALMBEAT:     (lv) => 70 + 10 * lv,
  MG_SOULSTRIKE:     (lv) => 100 + 5 * lv,
  MG_FIREBALL:       () => 125,
  MG_FIREBOLT:       () => 100,
  MG_COLDBOLT:       () => 100,
  MG_LIGHTNINGBOLT:  () => 100,
  MG_FROSTDIVER:     (lv) => 100 + 10 * lv,  // Frost Diver — 110%→200% MATK (+10/lv). wiki.payonstories.com/Frost_Diver (was flat 110%).
  MG_THUNDERSTORM:   () => 80,               // Thunder Storm — 80% MATK per strike (hits scale by level via number_of_hits). PS wiki (was 50%).
  MG_FIREWALL:       () => 50,               // Fire Wall — 50% MATK per burn; hits = 2 + skill level (magic_hit_counts), i.e. target crossing the full wall. PS wiki (was flat 100%, 1 hit).
  // Acolyte / Priest
  AL_HOLYLIGHT:      () => 125,
  PR_BENEDICTIO:     () => 50,
  AL_RUWACH:         () => 145,              // Ruwach — 145% MATK, Holy (see skill_elements). PS wiki (was flat 100%).
  // Wizard / High Wizard
  WZ_EARTHSPIKE:     (lv) => 100 + 50 * lv,
  WZ_HEAVENDRIVE:    (lv) => 50 + 50 * lv,
  WZ_FROSTDIVER:     (lv) => 200 + 10 * lv,
  WZ_STORMGUST:      (lv) => 100 + 40 * lv, // 100+40×lv MATK per hit (140%→500%); ×10 hits via number_of_hits. Old 100×(lv+2) was a wrong single-hit lump.
  WZ_JUPITEL:        () => 100, // 100% MATK per hit (hits 3→12 via number_of_hits); the old 100+100×lv double-counted level scaling, giving ~13200% at L10
  WZ_METEOR:         (lv) => 100 + 50 * lv,
  WZ_WATERBALL:      (lv) => 100 + 30 * lv,
  WZ_SIGHTRASHER:    (lv) => 100 + 20 * lv,
  WZ_FIREWALL:       (lv) => 100 + 10 * lv,
  HW_NAPALMVULCAN:   (lv) => 100 + 20 * lv,
  // Ninja
  NJ_KOUENKA:        () => 90, // Flaming Petals — 90% MATK per hit (hits = skill level); old 100+30×lv was wrong
  NJ_HYOUSENSOU:     () => 100,
  NJ_KAMAITACHI:     (lv) => 100 + 100 * lv, // First Wind — 200%→600% MATK (+100/lv), 1 hit, Wind, max Lv5. wiki.payonstories.com/First_Wind (was 100+30×lv).
  NJ_KAENSIN:        () => 50, // Blaze Shield — 50% MATK per hit (flat, all levels); hits 3/6/9 by level via magic_hit_counts. wiki.payonstories.com/Blaze_Shield (old 100+10×lv single-hit lump was wrong).
  NJ_HITOKIRI:       (lv) => 150 + 50 * lv,
  NJ_HUUJIN:         () => 100,             // Wind Blade — 100% MATK per hit (Wind); hits scale by level via number_of_hits. wiki.payonstories.com/Wind_Blade. (Was flagged vanilla-OK but had no ratio → flat 100% single value.)
  NJ_HYOUSYOURAKU:   (lv) => 100 + 50 * lv, // Snow Flake Draft — 150%→350% MATK (Water), single hit, max Lv5. wiki.payonstories.com/Snow_Flake_Draft.
  // Bakuenryu (Exploding Dragon): a single hit split into 3, total 150+150×lv%
  // MATK (300%→900% for Lv1→5). skills.json marks it 3 hits, so this is the
  // per-hit ratio (50+50×lv). Without this it fell through to a flat 100%×3.
  NJ_BAKUENRYU:      (lv) => 50 + 50 * lv,
};

const ELE_STR_TO_INT = {
  Ele_Neutral: 0, Ele_Water: 1, Ele_Earth: 2, Ele_Fire: 3,
  Ele_Wind: 4, Ele_Poison: 5, Ele_Holy: 6, Ele_Dark: 7, Ele_Ghost: 8, Ele_Undead: 9,
};

// PF_DOUBLECASTING ("Double Bolt" on the PS wiki) -- 100% chance for these
// specific spells to cast a second time instantly while it's active
// (wiki.payonstories.com/Double_Bolt). Modeled as halving the effective
// attack period rather than doubling per-hit damage, since the bonus is an
// extra free cast, not a stronger one.
const DOUBLECASTING_SKILLS = new Set([
  "MG_FIREBOLT", "MG_COLDBOLT", "MG_LIGHTNINGBOLT", "WZ_EARTHSPIKE", "MG_SOULSTRIKE",
]);

// PS Hunter rework (Hunter_Rework_PayonStories.pdf).
// Formula: SkillLevel * factorA * factorB / divisor — INT/DEX scaling, bypasses DEF.
// Elements from skills.json: LandMine=Earth(2), BlastMine=Wind(4), FreezingTrap=Water(1), Claymore=Fire(3).
const TRAP_SKILL_NAMES = new Set(["HT_LANDMINE", "HT_BLASTMINE", "HT_FREEZINGTRAP", "HT_CLAYMORETRAP"]);
const TRAP_CONFIGS = {
  HT_LANDMINE:     { element: 2 /* Earth */, divisor: 45, factorA: "job_dex",  factorB: "base_int" },
  HT_BLASTMINE:    { element: 4 /* Wind  */, divisor: 45, factorA: "base_dex", factorB: "job_int"  },
  HT_FREEZINGTRAP: { element: 1 /* Water */, divisor: 70, factorA: "job_dex",  factorB: "base_int" },
  HT_CLAYMORETRAP: { element: 3 /* Fire  */, divisor: 70, factorA: "base_dex", factorB: "job_int"  },
};
function trapFactors(cfg, status, build) {
  const joblv = build.job_level || 1, baselv = build.base_level || 1;
  const dex = status.dex || 0, int_ = status.int_ || 0;
  const a = cfg.factorA === "job_dex"  ? joblv + dex  : baselv + dex;
  const b = cfg.factorB === "base_int" ? baselv + int_ : joblv + int_;
  return [a, b];
}

function resolveIsRanged(build, weapon, skill) {
  // skill-level long/short overrides (skills.json range sign) are NOT YET PORTED;
  // this mirrors the weapon-derived default from build_manager.effectiveIsRanged.
  return effectiveIsRanged(build, weapon);
}

function skillPeriodMs(castMs, delayMs, skillData, skillLv, minPeriodOverride, amotionFloor) {
  let period = Math.max(castMs + delayMs, amotionFloor);
  if (minPeriodOverride) period = Math.max(period, minPeriodOverride);
  return period;
}

// Assassin (12) and Assassin Cross (4013) can dual-wield daggers.
const DUAL_WIELD_JOBS = new Set([12, 4013]);

// PS Auto Spell / "Hindsight" (SA_AUTOSPELL) — wiki.payonstories.com/Auto_Spell.
// Unlike vanilla's random pool, the *activated level* selects exactly one spell,
// cast at a fixed level, with a flat 30% chance on every physical attack (hit or
// miss). Levels 9 & 10 (Stone Curse / Safety Wall) deal no damage, so they carry
// no `casts`. Bolt ranks (2-4) autocast at a random level 2, 3 or 4 per proc — a
// uniform mixture over the listed casts (user-confirmed reading of "Level 2
// through 4"). Each `casts` entry is one equiprobable variant.
const AUTO_SPELL_PROC_CHANCE = 30; // flat %, all ranks
const AUTO_SPELL_MAP = {
  1:  { label: "Soul Strike Lv5",     casts: [{ name: "MG_SOULSTRIKE",    level: 5 }] },
  2:  { label: "Fire Bolt Lv2–4",     casts: [{ name: "MG_FIREBOLT", level: 2 }, { name: "MG_FIREBOLT", level: 3 }, { name: "MG_FIREBOLT", level: 4 }] },
  3:  { label: "Cold Bolt Lv2–4",     casts: [{ name: "MG_COLDBOLT", level: 2 }, { name: "MG_COLDBOLT", level: 3 }, { name: "MG_COLDBOLT", level: 4 }] },
  4:  { label: "Lightning Bolt Lv2–4", casts: [{ name: "MG_LIGHTNINGBOLT", level: 2 }, { name: "MG_LIGHTNINGBOLT", level: 3 }, { name: "MG_LIGHTNINGBOLT", level: 4 }] },
  5:  { label: "Earth Spike Lv2",     casts: [{ name: "WZ_EARTHSPIKE",    level: 2 }] },
  6:  { label: "Fire Ball Lv10",      casts: [{ name: "MG_FIREBALL",      level: 10 }] },
  7:  { label: "Thunderstorm Lv3",    casts: [{ name: "MG_THUNDERSTORM",  level: 3 }] },
  8:  { label: "Heaven's Drive Lv3",  casts: [{ name: "WZ_HEAVENDRIVE",   level: 3 }] },
  9:  { label: "Stone Curse Lv10 (no damage)", casts: [] },
  10: { label: "Safety Wall Lv5 (no damage)", casts: [] },
};

class BattlePipeline {
  constructor(config) {
    this.config = config;
  }

  _runMagicBranch(status, weapon, skill, target, build, opts = {}) {
    const { profile = STANDARD, gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();
    const skillData = loader.getSkill(skill.id);
    const skillName = skill.name || "";

    // 1. Base MATK (uniform distribution between matk_min and matk_max)
    const matkLo = Math.max(1, status.matk_min);
    const matkHi = Math.max(matkLo, status.matk_max);
    let pmf = uniformPmf(matkLo, matkHi);
    const [mn0, mx0, av0] = pmfStats(pmf);
    result.add_step({
      name: "Base MATK", value: av0, min_value: mn0, max_value: mx0,
      note: `INT=${status.int_}  MATK ${matkLo}–${matkHi}`,
      formula: "int+(int/7)² to int+(int/5)²",
      hercules_ref: "status.c status_calc_matk",
    });

    // bMatkRate gear bonus
    if (gearBonuses && gearBonuses.matk_rate) {
      pmf = scaleFloor(pmf, 100 + gearBonuses.matk_rate, 100);
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({
        name: "bMatkRate", value: av, min_value: mn, max_value: mx,
        multiplier: (100 + gearBonuses.matk_rate) / 100,
        note: `bMatkRate +${gearBonuses.matk_rate}%`,
        formula: `dmg*(100+${gearBonuses.matk_rate})//100`,
        hercules_ref: "battle.c:5382",
      });
    }

    // 2. Skill ratio — explicit BF_MAGIC_RATIOS, then PS profile, then skill DB fallback
    const ctx = createCalcContext({
      skill_levels: gearBonuses ? gearBonuses.effective_mastery : build.mastery_levels,
      skill_params: build.skill_params,
      base_level: build.base_level,
      base_str: build.base_str,
      str_: status.str,
      vit: status.vit,
      dex: status.dex,
      int_: status.int_,
      weapon_type: weapon ? weapon.weapon_type : "",
    });

    let ratio = 100, ratioSrc = "default 100%";
    const psMagicFn = (profile.magic_ratios || {})[skillName];
    if (psMagicFn) {
      ratio = psMagicFn(skill.level, target, ctx);
      ratioSrc = `PS magic_ratios[${skillName}]`;
    } else if (BF_MAGIC_RATIOS[skillName]) {
      ratio = BF_MAGIC_RATIOS[skillName](skill.level, target, ctx);
      ratioSrc = `BF_MAGIC_RATIOS[${skillName}]`;
    } else if (skillData && skillData.ratio_per_level && skillData.ratio_per_level.length) {
      const ratioList = skillData.ratio_per_level;
      ratio = skill.level <= ratioList.length ? ratioList[skill.level - 1] : (skillData.ratio_base ?? 100);
      ratioSrc = `ratio_per_level[lv${skill.level}]`;
    } else if (skillData) {
      ratio = skillData.ratio_base ?? 100;
      ratioSrc = "ratio_base (DB fallback)";
    }

    // Hit count: a PS profile magic_hit_counts fn (e.g. Blaze Shield's 3/6/9 by
    // level) overrides the skills.json number_of_hits, which is sometimes wrong
    // for PS-reworked multi-hit spells. Mirrors weapon_hit_counts in skillRatio.js.
    let hitCountRaw = 1;
    const psHitFn = (profile.magic_hit_counts || {})[skillName];
    if (psHitFn) {
      hitCountRaw = psHitFn(skill.level, target, ctx);
    } else if (skillData) {
      const noh = skillData.number_of_hits;
      if (noh && skill.level <= noh.length) hitCountRaw = noh[skill.level - 1];
    }
    // Negative = cosmetic (visual multi-hit, damage applied once)
    const hitCount = hitCountRaw > 0 ? hitCountRaw : 1;

    pmf = scaleFloor(pmf, ratio, 100);
    // number_of_hits is applied at the END of this branch (after MDEF/element/
    // cards), NOT here: each bolt of a multi-hit spell is reduced by the target's
    // MDEF *separately*. Multiplying by the hit count up front would subtract the
    // (flat, soft) MDEF only once instead of once per hit, badly overestimating
    // multi-hit spells (bolts) vs high-MDEF targets.

    const [mn1, mx1, av1] = pmfStats(pmf);
    result.add_step({
      name: `Skill Ratio (ID ${skill.id} Lv ${skill.level})`,
      value: av1, min_value: mn1, max_value: mx1, multiplier: ratio / 100,
      note: skillData ? (skillData.description || "") : "",
      formula: `dmg × ${ratio}%${hitCount !== 1 ? ` (per hit — ×${hitCount} hits applied after MDEF)` : ""} (${ratioSrc})`,
      hercules_ref: "battle.c battle_calc_skillratio BF_MAGIC",
    });

    const skillAtkBonus = gearBonuses ? (gearBonuses.skill_atk[skillName] || 0) : 0;
    if (skillAtkBonus) {
      pmf = scaleFloor(pmf, 100 + skillAtkBonus, 100);
      const [mnB, mxB, avB] = pmfStats(pmf);
      result.add_step({
        name: "Skill ATK Bonus", value: avB, min_value: mnB, max_value: mxB,
        multiplier: (100 + skillAtkBonus) / 100,
        note: `bSkillAtk: ${skillName} +${skillAtkBonus}%`,
        formula: `dmg × (100+${skillAtkBonus})/100`,
        hercules_ref: "pc.c:3513-3527",
      });
    }

    if (
      profile !== STANDARD && skillName &&
      !(profile.magic_ratios || {})[skillName] &&
      !(profile.magic_vanilla_ok || new Set()).has(skillName)
    ) {
      result.add_step({
        name: "⚠ Vanilla fallback (PS unaudited)", value: av1, min_value: mn1, max_value: mx1, multiplier: 1.0,
        note: `${skillName}: PS formula not confirmed in this port — using vanilla ratio as fallback.`,
        formula: "unverified vanilla fallback", hercules_ref: "",
      });
    }

    // 3. Magic defense (MDEF% + soft MDEF flat)
    const mdefIgnorePct =
      (profile.mechanic_flags.has("WZ_FIREPILLAR_MDEF_IGNORE") && skillName === "WZ_FIREPILLAR") ? 50
      : (profile.mechanic_flags.has("HW_NAPALMVULCAN_MDEF_IGNORE") && skillName === "HW_NAPALMVULCAN") ? 50
      // Sage Rework doc: Soul Strike's 50% MDEF ignore requires having LEARNED
      // level 10 of the skill. The calculator's skill level is the cast level, so
      // gate on level 10 (a lv10-learned caster's normal cast); lower selected
      // levels don't get it.
      : (profile.mechanic_flags.has("MG_SOULSTRIKE_MDEF_IGNORE") && skillName === "MG_SOULSTRIKE" && skill.level === 10) ? 50
      : 0;
    // A PS partial MDEF ignore (e.g. Fire Pillar 50%) takes precedence over a
    // vanilla full NK_IGNORE_DEF bypass: vanilla Fire Pillar pierces all MDEF, but
    // PS lowered it to 50%, so run the partial-ignore path instead of bypassing.
    if (mdefIgnorePct > 0 || !skill.nk_ignore_def) {
      pmf = calculateMagicDefenseFix(target, gearBonuses || {}, pmf, result, mdefIgnorePct);
    } else {
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({
        name: "Magic Defense Fix", value: av, min_value: mn, max_value: mx, multiplier: 1.0,
        note: "BYPASSED — NK_IGNORE_DEF", formula: "no change", hercules_ref: "battle.c:5070",
      });
    }

    // 4. Element (AttrFix) — skill element overrides weapon element for magic
    let effAtkEle = 0; // neutral default
    if (skill.id !== 0 && skillData) {
      const eleList = skillData.element || [];
      if (eleList.length) {
        const idx = Math.min(skill.level - 1, eleList.length - 1);
        const v = ELE_STR_TO_INT[eleList[idx]];
        if (v != null) effAtkEle = v;
      }
    }
    if (skillName in (profile.skill_elements || {})) effAtkEle = profile.skill_elements[skillName];
    pmf = calculateAttrFix(weapon, target, pmf, result, build, effAtkEle);

    // 4b. PS Soul Strike: +5% damage per skill level vs Undead race
    if (profile.mechanic_flags.has("MG_SOULSTRIKE_UNDEAD_BONUS") && skillName === "MG_SOULSTRIKE" && target.race === "Undead") {
      const bonus = skill.level * 5;
      const multiplier = 1 + bonus / 100;
      pmf = scaleFloor(pmf, 100 + bonus, 100);
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({
        name: "Soul Strike vs Undead", value: av, min_value: mn, max_value: mx, multiplier,
        note: `PS: +${bonus}% vs Undead (5% × lv ${skill.level})`,
        formula: `dmg × ${multiplier.toFixed(2)}`, hercules_ref: "",
      });
    }

    // 5. Magic card bonuses (bMagicAddRace, bMagicAddEle)
    const ELE_TO_KEY_MAGIC = [
      "Ele_Neutral", "Ele_Water", "Ele_Earth", "Ele_Fire",
      "Ele_Wind", "Ele_Poison", "Ele_Holy", "Ele_Dark", "Ele_Ghost", "Ele_Undead",
    ];
    const magicEleName = ELE_TO_KEY_MAGIC[effAtkEle] || "Ele_Neutral";
    pmf = calculateCardFixMagic(target, magicEleName, pmf, result, gearBonuses);

    // PS Holy Light: LUK% chance to deal an additional +60% damage (×1.6). Modeled
    // as a probability mixture so the damage range and average both fold in the
    // proc (min = a non-proc roll, max = a boosted roll, avg = base × (1 + 0.6·p)).
    if (profile.mechanic_flags.has("AL_HOLYLIGHT_LUK_PROC") && skillName === "AL_HOLYLIGHT") {
      const p = Math.max(0, Math.min(1, status.luk / 100));
      if (p > 0) {
        const boosted = scaleFloor(pmf, 160, 100);
        const mixed = {};
        // Skip a branch with zero weight so it doesn't leave zero-probability keys
        // that would pollute the min/max (e.g. at LUK ≥ 100 the proc is guaranteed).
        if (1 - p > 0) for (const [dmg, prob] of Object.entries(pmf)) mixed[dmg] = (mixed[dmg] || 0) + prob * (1 - p);
        for (const [dmg, prob] of Object.entries(boosted)) mixed[dmg] = (mixed[dmg] || 0) + prob * p;
        pmf = mixed;
        const [mn, mx, av] = pmfStats(pmf);
        result.add_step({
          name: "Holy Light LUK Proc", value: av, min_value: mn, max_value: mx, multiplier: 1 + 0.6 * p,
          note: `PS: ${Math.round(p * 100)}% chance (LUK ${status.luk}) to deal +60% damage`,
          formula: `${Math.round(100 * (1 - p))}% × 1.0  +  ${Math.round(100 * p)}% × 1.6`,
          hercules_ref: "PSRO Priest/Acolyte rework — Holy Light",
        });
      }
    }

    pmf = floorAt(pmf, 1); // per-hit floor (each bolt is at least 1)

    // Now sum the hits: each bolt was fully computed (ratio → MDEF → element →
    // cards) and floored above, so a multi-hit spell is per-hit-damage × hits.
    if (hitCount > 1) {
      pmf = scaleFloor(pmf, hitCount, 1);
      const [mnH, mxH, avH] = pmfStats(pmf);
      result.add_step({
        name: `× ${hitCount} hits`, value: avH, min_value: mnH, max_value: mxH, multiplier: hitCount,
        note: `${skillName}: ${hitCount} hits — MDEF is applied to each hit separately (above), then summed.`,
        formula: `per-hit dmg × ${hitCount}`, hercules_ref: "battle.c multi-hit magic",
      });
    }

    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({
      name: "Final Damage", value: av, min_value: mn, max_value: mx,
      note: "Magic branch", formula: "", hercules_ref: "",
    });

    result.min_damage = mn;
    result.max_damage = mx;
    result.avg_damage = av;
    result.pmf = pmf;
    return result;
  }

  /**
   * PS Auto Spell / "Hindsight" (SA_AUTOSPELL) autocast branch. Given the
   * activated Hindsight level, builds a magic damage result for the mapped spell
   * via the normal magic branch — a uniform pmf mixture over the level's `casts`
   * (bolt ranks randomise their cast level 2-4). Returns null for ranks with no
   * damaging cast (9-10) or an unknown/unset level. The flat 30% proc chance is
   * applied by the caller (folded into DPS + surfaced as a proc branch), since
   * Hindsight fires on the physical attack rather than inside the spell's own
   * pipeline. wiki.payonstories.com/Auto_Spell.
   */
  _runAutoSpellBranch(status, weapon, target, build, opts, autoLv) {
    const entry = AUTO_SPELL_MAP[autoLv];
    if (!entry || !entry.casts.length) return null;

    const perCast = [];
    for (const c of entry.casts) {
      const id = loader.getSkillIdByName(c.name);
      if (!id) continue;
      const sd = loader.getSkill(id);
      const dt = (sd && sd.damage_type) || [];
      const spellSkill = {
        id, name: c.name, level: c.level,
        nk_ignore_def: dt.includes("IgnoreDefense"),
        nk_ignore_flee: dt.includes("IgnoreFlee"),
        nk_ignore_ele: dt.includes("IgnoreElement"),
        nk_ignore_cards: dt.includes("IgnoreCards"),
      };
      perCast.push(this._runMagicBranch(status, weapon, spellSkill, target, build, opts));
    }
    if (!perCast.length) return null;

    // Uniform mixture of the per-cast pmfs — every listed cast is equiprobable.
    const w = 1 / perCast.length;
    const mixed = {};
    for (const r of perCast) {
      for (const [dmg, prob] of Object.entries(r.pmf || {})) {
        mixed[dmg] = (mixed[dmg] || 0) + prob * w;
      }
    }
    const [mn, mx, av] = pmfStats(mixed);

    // Reuse the representative (middle) cast's step log so the breakdown stays
    // transparent, then override the headline numbers with the true mixture.
    const repIdx = Math.floor(perCast.length / 2);
    const result = createDamageResult({
      steps: perCast[repIdx].steps.slice(),
      min_damage: mn, max_damage: mx, avg_damage: av, pmf: mixed,
    });
    if (perCast.length > 1) {
      const loLv = entry.casts[0].level;
      const hiLv = entry.casts[entry.casts.length - 1].level;
      result.add_step({
        name: "Auto Spell level mix", value: av, min_value: mn, max_value: mx,
        note: `${entry.label}: random cast level ${loLv}–${hiLv} (uniform); steps above shown for Lv${entry.casts[repIdx].level}`,
        formula: "", hercules_ref: "wiki.payonstories.com/Auto_Spell",
      });
    }
    return result;
  }

  /**
   * CR_GRANDCROSS (BF_MISC) — not present in Hercules' generic BF_WEAPON/
   * BF_MAGIC skillratio switches (verified by inspecting battle.c directly);
   * Grand Cross is hardcoded as a standalone formula:
   *   damage = (ATK + MATK) * (100 + 40*skill_lv) / 100 * holy_element_mult
   * Confirmed verbatim against wiki.payonstories.com/Grand_Cross (which
   * states this exact formula) — also matches two independent vanilla
   * pre-renewal community sources (irowiki "classic" Grand Cross writeup,
   * a Revo-Classic damage breakdown thread) and this repo's own scraped
   * skill_db.json: damage_type ["IgnoreCards","IgnoreFlee"] (no
   * "IgnoreDefense"/"IgnoreElement") confirms DEF/MDEF and the Holy AttrFix
   * apply normally, percentage card bonuses are skipped, and flee is
   * ignored (always hits).
   *
   * PS deviation: the PS wiki explicitly lists weapon masteries and Demon
   * Bane's flat bonus as affecting damage (only the *percentage* parts of
   * Demon Bane/cards are excluded) — unlike vanilla Hercules, where
   * masteryFix.js's MASTERY_EXEMPT_SKILLS bypasses mastery entirely for this
   * skill. Gated behind the PS_GRANDCROSS_MASTERY_APPLIES mechanic flag so
   * the standard/vanilla profile keeps the Hercules-accurate bypass.
   */
  _runGrandCrossBranch(status, weapon, skill, target, build, opts = {}) {
    const { profile = STANDARD, gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();

    // Grand Cross (PR-Hercules battle_calc_magic_attack, CR_GRANDCROSS branch): a full
    // physical weapon hit `wd` (ATK → size fix → hard/soft DEF → refine atk2 → weapon
    // masteries) plus a magic hit `ad` (MATK → MDEF), summed, put through the fixed Holy
    // element, and THEN multiplied by the skill ratio (100 + 40×lv)% — the ratio is
    // applied LAST, so masteries/refine are amplified by it while DEF/MDEF are subtracted
    // before it. Cards' % bonuses are ignored (IgnoreCards).
    const ratio = 100 + 40 * skill.level;

    // ── Physical part `wd`: full weapon hit at 100% ratio (size fix, DEF, refine, mastery) ──
    let atkPmf = calculateBaseDamage(status, weapon, build, target, skill, result, {
      gear_bonuses: gearBonuses, is_crit: false, is_ranged: false,
    });
    if (gearBonuses && gearBonuses.atk_rate) {
      atkPmf = scaleFloor(atkPmf, 100 + gearBonuses.atk_rate, 100);
      const [mn, mx, av] = pmfStats(atkPmf);
      result.add_step({ name: "bAtkRate", value: av, min_value: mn, max_value: mx, multiplier: (100 + gearBonuses.atk_rate) / 100, note: `bAtkRate +${gearBonuses.atk_rate}%`, formula: `dmg*(100+${gearBonuses.atk_rate})//100`, hercules_ref: "battle.c:5330" });
    }
    // Grand Cross ignores the target's HARD DEF/MDEF. The PS wiki damage formula is
    // literally "(ATK + MATK) × (100% + 40×lvl%)" with no defense term
    // (wiki.payonstories.com/Grand_Cross), and RateMyServer (skid=254) states the
    // skill "ignores target's defense" — confirmed in-game on Payon Stories, where GC
    // does ~10-19k on Knight of Abyss (DEF 55 / MDEF 50) vs the ~6k a full DEF/MDEF
    // cut would give. The soft (VIT/INT-based) DEF2/MDEF2 still applies, matching the
    // observed magnitude. This deviates from the older "with-DEF" ROADMAP audit; the
    // authoritative PS-wiki formula + live in-game data win. `ignore_hard_def` zeroes
    // hard DEF but keeps the soft Soft-DEF subtraction (no ignore-def cards here).
    atkPmf = calculateDefenseFix(target, { ...build, ignore_hard_def: true }, gearBonuses, atkPmf, this.config, result, { is_crit: false, skill });
    atkPmf = calculateRefineFix(weapon, skill, atkPmf, result);
    const ctx = createCalcContext({
      skill_levels: gearBonuses.effective_mastery,
      skill_params: build.skill_params,
      base_level: build.base_level,
      base_str: build.base_str,
      str_: status.str,
      vit: status.vit,
      dex: status.dex,
      int_: status.int_,
      weapon_type: weapon ? weapon.weapon_type : "",
    });
    // PS: weapon masteries + Demon Bane's flat bonus apply to the physical part
    // (wiki.payonstories.com/Grand_Cross). Vanilla bypasses via MASTERY_EXEMPT_SKILLS.
    atkPmf = calculateMasteryFix(weapon, build, target, atkPmf, result, skill, { profile, ctx });

    // ── Magic part `ad`: MATK → MDEF ──
    const matkLo = Math.max(1, status.matk_min);
    const matkHi = Math.max(matkLo, status.matk_max);
    let matkPmf = uniformPmf(matkLo, matkHi);
    if (gearBonuses && gearBonuses.matk_rate) {
      matkPmf = scaleFloor(matkPmf, 100 + gearBonuses.matk_rate, 100);
    }
    { const [mn, mx, av] = pmfStats(matkPmf); result.add_step({ name: "Base MATK", value: av, min_value: mn, max_value: mx, note: `INT=${status.int_}  MATK ${matkLo}-${matkHi}`, formula: "int+(int/7)^2 to int+(int/5)^2", hercules_ref: "status.c status_calc_matk" }); }
    // GC ignores the target's HARD MDEF too (see the DEF note above): pass a target
    // clone with mdef_ = 0 so the ×(100−MDEF)% step is skipped, while soft MDEF2
    // (INT + VIT/2) still subtracts.
    matkPmf = calculateMagicDefenseFix({ ...target, mdef_: 0 }, gearBonuses || {}, matkPmf, result);

    // ── Sum (wd + ad) → Holy element → × ratio (applied LAST, per Hercules) ──
    let pmf = convolve(atkPmf, matkPmf);
    { const [mn, mx, av] = pmfStats(pmf); result.add_step({ name: "ATK part + MATK part", value: av, min_value: mn, max_value: mx, note: "physical (through DEF) + magic (through MDEF) summed", formula: "wd + ad", hercules_ref: "battle.c:3798" }); }
    pmf = calculateAttrFix(weapon, target, pmf, result, build, 6 /* Ele_Holy — fixed element, ignores weapon */);
    pmf = scaleFloor(pmf, ratio, 100);
    { const [mn, mx, av] = pmfStats(pmf); result.add_step({ name: `Grand Cross Ratio (Lv ${skill.level})`, value: av, min_value: mn, max_value: mx, multiplier: ratio / 100, note: `(physical + magic) × ${ratio}% — applied last`, formula: "(wd+ad) × (100 + 40×lv)/100", hercules_ref: "battle.c:3800" }); }
    {
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({ name: "Card Fix", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: "BYPASSED — damage_type includes IgnoreCards", formula: "no change", hercules_ref: "skills.json damage_type" });
    }

    pmf = floorAt(pmf, 1);

    // Grand Cross places a cross-shaped ground unit that lasts 0.9s (skill_data1)
    // and ticks every 0.3s (unit.interval), so a single target takes 0.9/0.3 = 3
    // hits — a fixed count that does NOT depend on how long it stays
    // (wiki.payonstories.com/Grand_Cross: "hits 3 times"). The per-cell reduction
    // when multiple monsters stack on one cell (−1 hit each per extra monster,
    // min 1) isn't modeled here — this is the single-target case.
    {
      const [mn0, mx0, av0] = pmfStats(pmf);
      result.add_step({ name: "Per-Wave Damage", value: av0, min_value: mn0, max_value: mx0, note: `one of 3 waves (${mn0}–${mx0})`, formula: "", hercules_ref: "", info: true });
    }
    // Each tick rolls its ATK+MATK independently, so the 3-hit total is the SUM of
    // 3 independent rolls (convolution) — a realistic distribution centred on 3× the
    // mean, NOT the [3×min, 3×max] extreme a flat ×3 would give (all hits min/max at
    // once is astronomically unlikely).
    const GC_WAVES = 3;
    pmf = convolve(convolve(pmf, pmf), pmf);

    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({
      name: `Grand Cross Total (${GC_WAVES} waves)`, value: av, min_value: mn, max_value: mx, multiplier: GC_WAVES,
      note: "0.9s ÷ 0.3s interval = 3 independent waves on a single target (summed)",
      formula: "sum of 3 independent wave rolls", hercules_ref: "wiki.payonstories.com/Grand_Cross",
    });

    result.min_damage = mn;
    result.max_damage = mx;
    result.avg_damage = av;
    result.pmf = pmf;

    // Grand Cross recoils on the caster: the cross also occupies the caster's own
    // cell, so the caster takes the same skill as a hit against THEMSELVES
    // (PR-Hercules skill.c: the src==bl self-hit). This is surfaced as a separate
    // self-damage readout, not folded into outgoing damage.
    result.self_damage = this._computeGrandCrossSelfDamage(status, weapon, skill, build, gearBonuses, ratio, profile);
    return result;
  }

  /**
   * Grand Cross self-damage ("blowback"). The caster stands inside the cross, so
   * each of the 3 waves also lands on the caster as a hit against themselves
   * (PR-Hercules skill.c: CR_GRANDCROSS includes the caster's cell; the src==bl
   * path). Two parts (wiki.payonstories.com/Grand_Cross → "Vs. Caster"):
   *
   *   Part 1 (damage-based): the full GC hit re-computed with the CASTER as the
   *     target — same ATK+MATK, but subtracting the caster's own DEF (reduced to
   *     2/3 during the cast) and MDEF, the Holy element table vs the caster's
   *     armour element, then the caster's own Holy resist (bSubEle Ele_Holy — e.g.
   *     Talisman of Holy Protection −7%, Angeling-carded armour −100%) and
   *     Demi-Human resist (bSubRace RC_DemiHuman — e.g. Thara Frog). 3 waves,
   *     summed like the outgoing hit.
   *   Part 2 (fixed): 20% of MaxHP every cast, ignores all reductions — part of
   *     the casting cost.
   *
   * Returns a compact summary object (not a full step log); the outgoing step
   * breakdown is untouched.
   */
  _computeGrandCrossSelfDamage(status, weapon, skill, build, gearBonuses, ratio, profile = STANDARD) {
    const scratch = createDamageResult(); // throwaway — self-damage keeps no step log
    const casterTarget = playerBuildToTarget(build, status, gearBonuses, weapon, loader);
    // During the GC cast the caster's hard DEF drops to 2/3 (PS wiki "Vs. Caster").
    casterTarget.def_ = Math.floor(casterTarget.def_ * 2 / 3);

    // ── Physical part vs the caster (size fix, caster DEF, refine, mastery) ──
    let atkPmf = calculateBaseDamage(status, weapon, build, casterTarget, skill, scratch, {
      gear_bonuses: gearBonuses, is_crit: false, is_ranged: false,
    });
    if (gearBonuses && gearBonuses.atk_rate) atkPmf = scaleFloor(atkPmf, 100 + gearBonuses.atk_rate, 100);
    atkPmf = calculateDefenseFix(casterTarget, build, gearBonuses, atkPmf, this.config, scratch, { is_crit: false, skill });
    atkPmf = calculateRefineFix(weapon, skill, atkPmf, scratch);
    const ctx = createCalcContext({
      skill_levels: gearBonuses.effective_mastery,
      skill_params: build.skill_params,
      base_level: build.base_level,
      base_str: build.base_str,
      str_: status.str,
      vit: status.vit,
      dex: status.dex,
      int_: status.int_,
      weapon_type: weapon ? weapon.weapon_type : "",
    });
    atkPmf = calculateMasteryFix(weapon, build, casterTarget, atkPmf, scratch, skill, { profile, ctx });

    // ── Magic part vs the caster's MDEF ──
    const matkLo = Math.max(1, status.matk_min);
    const matkHi = Math.max(matkLo, status.matk_max);
    let matkPmf = uniformPmf(matkLo, matkHi);
    if (gearBonuses && gearBonuses.matk_rate) matkPmf = scaleFloor(matkPmf, 100 + gearBonuses.matk_rate, 100);
    matkPmf = calculateMagicDefenseFix(casterTarget, gearBonuses || {}, matkPmf, scratch);

    // ── Sum → Holy element vs caster armour → × ratio → HALVE (build=null: the
    //    caster's own ground-effect enchant buffs OUTGOING element, not this
    //    self-hit). PR-Hercules battle.c:3798-3808: the summed (wd+ad) hit is
    //    attr-fixed, ×(100+40×lv)%, then — because src==target and the caster is a
    //    player (BL_PC) — the recoil is HALVED (`ad.damage = ad.damage/2`). A mob
    //    caster would take 0; only players take the halved recoil. ──
    let wave = convolve(atkPmf, matkPmf);
    wave = calculateAttrFix(weapon, casterTarget, wave, scratch, null, 6 /* Ele_Holy — fixed */);
    wave = scaleFloor(wave, ratio, 100);
    wave = scaleFloor(wave, 50, 100);           // PC self-hit halved (battle.c:3805)

    // ── Caster's own resist cards, via the BF_MAGIC card-fix path Hercules uses
    //    for the recoil (battle.c:3811 calc_cardfix(BF_MAGIC …)): Holy resist
    //    (bSubEle Ele_Holy — Faith up to −50%, Talisman −7%) + Demi-Human resist
    //    (bSubRace RC_DemiHuman — Thara Frog). gearBonuses=null: skip the caster's
    //    OWN offensive magic-add bonuses (not part of the recoil reduction). ──
    wave = calculateCardFixMagic(casterTarget, "Ele_Holy", wave, scratch, null);
    // NO min-1 floor here: the physical (calculateDefenseFix) and magic
    // (calculateMagicDefenseFix) halves were each already floored at 1 BEFORE the
    // Holy element step, matching Hercules. If the caster's armour is Holy-element
    // (Angeling card), Holy-vs-Holy is a 0% multiplier and the recoil is genuinely
    // negated to 0 — flooring here would wrongly leave 1 per wave (→ 3 for 3 waves).
    const [wMin, wMax, wAvg] = pmfStats(wave);

    // 3 independent self-hits per cast, summed (same wave count as outgoing).
    const total = convolve(convolve(wave, wave), wave);
    const [p1min, p1max, p1avg] = pmfStats(total);

    // Part 2 — the GC casting cost: 20% of CURRENT HP, ignores all reductions.
    // Hercules skill.c:3119-3125 (skill_get_requirement): a POSITIVE hp_rate is a
    // percentage of CURRENT HP (`st->hp`), a negative one is of MaxHP. GC's
    // hp_rate_cost is +20, so it drains 20% of whatever HP you have when you cast.
    // Defaults to full HP (MaxHP) when no current HP is set on the build.
    const currentHp = build.current_hp != null ? build.current_hp : status.max_hp;
    const part2 = Math.floor(currentHp * 0.20);

    const holyResist = (casterTarget.sub_ele.Ele_Holy || 0) + (casterTarget.sub_ele.Ele_All || 0);
    const demiResist = casterTarget.sub_race.RC_DemiHuman || 0;

    return {
      part1: { min: p1min, avg: p1avg, max: p1max },
      part2,
      total: { min: p1min + part2, avg: p1avg + part2, max: p1max + part2 },
      per_wave: { min: wMin, avg: wAvg, max: wMax },
      waves: 3,
      max_hp: status.max_hp,
      current_hp: currentHp,
      // Survivable at current HP if even the worst-case cast leaves HP > 0.
      survives: currentHp - (p1avg + part2) > 0,
      survives_worst: currentHp - (p1max + part2) > 0,
      halved: true, // players take half the recoil (battle.c:3805)
      reductions: {
        holy_resist: holyResist,
        demihuman_resist: demiResist,
        def: casterTarget.def_,                              // hard DEF (already ⅔), reduces the physical half
        mdef: casterTarget.mdef_,                            // hard MDEF (gear), reduces the magic half
        mdef_soft: casterTarget.int_ + (casterTarget.vit >> 1), // soft MDEF (INT + VIT/2), subtracted from the magic half
        armor_element: loader.getElementName(casterTarget.element),
      },
    };
  }

  /**
   * PR_TURNUNDEAD — exorcism skill. Its damage is NOT MATK-scaled: on a failed
   * instant-kill roll it deals a fixed Holy hit
   *   damage = (BaseLevel + INT + SkillLevel*10) * 3 * (1 + LUK*3/200)
   * (wiki.payonstories.com/Turn_Undead "Damage Done if Failed" — the standard
   * pre-renewal formula; PS did not change it). Ignores DEF and cards
   * (skills.json damage_type [IgnoreCards, IgnoreDefense]); the Holy AttrFix vs
   * the target's element still applies, exactly like Grand Cross. Only usable on
   * Undead-property monsters; the instant-kill roll itself is not modeled, so
   * this is the guaranteed damage floor. Without this branch the generic magic
   * path would (wrongly) treat it as a 100%-MATK skill.
   */
  _runTurnUndeadBranch(status, weapon, skill, target, build, opts = {}) {
    const result = createDamageResult();

    const core = build.base_level + status.int_ + skill.level * 10;
    const base = core * 3;
    const dmg = Math.max(1, Math.floor(base * (1 + (status.luk * 3) / 200)));

    let pmf = { [dmg]: 1.0 };
    result.add_step({
      name: `Turn Undead Base (Lv ${skill.level})`, value: dmg, min_value: dmg, max_value: dmg,
      note: `Base Lv ${build.base_level}, INT ${status.int_}, LUK ${status.luk} — MATK/ATK not used`,
      formula: "(BaseLv + INT + SkillLv*10) * 3 * (1 + LUK*3/200)",
      hercules_ref: "wiki.payonstories.com/Turn_Undead (fail damage)",
    });

    // DEF and cards ignored (damage_type); Holy element vs target still applies.
    pmf = calculateAttrFix(weapon, target, pmf, result, build, 6 /* Ele_Holy — fixed */);

    {
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({ name: "Card Fix", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: "BYPASSED — damage_type includes IgnoreCards", formula: "no change", hercules_ref: "skills.json damage_type" });
    }

    pmf = floorAt(pmf, 1);
    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: "Turn Undead branch (this is the FAIL damage; on success the target is instantly killed)", formula: "", hercules_ref: "" });

    // PS instant-kill success chance (PSRO Priest/Acolyte Rework):
    //   p% = [20×SkillLv + 3×LUK + INT + BaseLv + (1 − HP/MaxHP)×200] / 10
    // The rework doc writes the divisor as "/1000%"; the pre-rework 1×LUK form of
    // this same expression reproduces the doc's worked example (48.9%) exactly,
    // confirming p% = numerator/10. Success is HALVED if BASE INT < 40, and the
    // rework removes the old upper cap (a probability is still clamped to 0–100).
    // Target assumed at full HP (HP term = 0) unless it carries current/max HP.
    const hpFrac = (target.max_hp && target.hp != null)
      ? Math.max(0, Math.min(1, target.hp / target.max_hp)) : 1.0;
    let successPct = (20 * skill.level + 3 * status.luk + status.int_ + build.base_level + (1 - hpFrac) * 200) / 10;
    const baseIntLow = build.base_int < 40;
    if (baseIntLow) successPct /= 2;
    successPct = Math.max(0, Math.min(100, successPct));
    result.success_chance = successPct;
    result.add_step({
      name: "Instant-Kill Success Chance", value: successPct, min_value: successPct, max_value: successPct, multiplier: 1.0,
      note: `${successPct.toFixed(1)}% — LUK ${status.luk}, INT ${status.int_}, BaseLv ${build.base_level}, SkillLv ${skill.level}` +
        (baseIntLow ? `; base INT ${build.base_int} < 40 → halved` : "") + "; target at full HP",
      formula: "[20×SkillLv + 3×LUK + INT + BaseLv + (1−HP/MaxHP)×200] / 10 %",
      hercules_ref: "PSRO Priest/Acolyte Rework — Turn Undead", info: true,
    });

    result.min_damage = mn;
    result.max_damage = mx;
    result.avg_damage = av;
    result.pmf = pmf;
    return result;
  }

  /**
   * AL_HEAL — offensive Heal ("heal bomb"). Heal is NOT MATK-scaled; its HP value
   * is  floor((BaseLevel + INT) / 8) × (4 + 8 × SkillLevel)  (wiki.payonstories.com/
   * Heal). Cast on an Undead-property target it deals Holy damage equal to HALF the
   * heal amount, modified by the target's (undead) element level — i.e. the Holy
   * AttrFix vs the target. The Purifying Ring + Rosary combo raises the fraction
   * from 50% to 100% (PSRO Priest/Acolyte rework), toggled via
   * skill_params.PS_HEAL_BOMB_FULL. Ignores DEF/MDEF and cards, like Turn Undead.
   * Non-Undead targets take no damage (Heal restores their HP instead).
   */
  _runHealBranch(status, weapon, skill, target, build, opts = {}) {
    const { gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();

    // Base heal, then heal-effectiveness gear — general bHealPower plus Heal-specific
    // bSkillHeal(AL_HEAL) (e.g. Sacred Saints Robe, Gyokuto, heal robes), which PS
    // priests stack and which scales the offensive Heal too.
    const baseHeal = Math.floor((build.base_level + status.int_) / 8) * (4 + 8 * skill.level);
    const healPower = ((gearBonuses && gearBonuses.heal_power) || 0)
      + ((gearBonuses && gearBonuses.skill_heal && gearBonuses.skill_heal.AL_HEAL) || 0);
    const healAmount = healPower > 0 ? Math.floor(baseHeal * (100 + healPower) / 100) : baseHeal;
    result.add_step({
      name: `Heal Amount (Lv ${skill.level})`, value: healAmount, min_value: healAmount, max_value: healAmount,
      note: `floor((BaseLv ${build.base_level} + INT ${status.int_}) / 8) × (4 + 8 × ${skill.level})` +
        (healPower > 0 ? ` × ${(100 + healPower)}% heal power` : ""),
      formula: "heal HP = floor((BaseLv + INT)/8) × (4 + 8×SkillLv) × (1 + bHealPower%)", hercules_ref: "skill_calc_heal", info: true,
    });

    const full = !!(gearBonuses && gearBonuses.heal_bomb_full); // Purifying Ring + Rosary combo
    const bombPct = full ? 100 : 50;
    const isUndead = target.element === 9; // Undead property
    const baseDmg = isUndead ? Math.max(1, Math.floor(healAmount * bombPct / 100)) : 0;

    let pmf = { [baseDmg]: 1.0 };
    result.add_step({
      name: "Heal Bomb", value: baseDmg, min_value: baseDmg, max_value: baseDmg, multiplier: bombPct / 100,
      note: isUndead
        ? `${bombPct}% of the heal as Holy damage vs Undead${full ? " (Purifying Ring + Rosary)" : ""}`
        : "target is not Undead-property — Heal restores HP, deals no damage",
      formula: `heal × ${bombPct}%`, hercules_ref: "wiki.payonstories.com/Heal",
    });

    if (isUndead) {
      // Holy element vs the target's (undead) element level; DEF/MDEF and cards ignored.
      pmf = calculateAttrFix(weapon, target, pmf, result, build, 6 /* Ele_Holy */);
      pmf = floorAt(pmf, 1);
    }

    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: "Heal branch (offensive Heal vs Undead)", formula: "", hercules_ref: "" });
    result.min_damage = mn;
    result.max_damage = mx;
    result.avg_damage = av;
    result.pmf = pmf;
    return result;
  }

  /**
   * CR_REFLECTSHIELD — PS rework formula:
   *   damage = floor(SoftDEF × (1 + 1.75 × HardDEF / 100) × SkillLvl / 10)
   * Ignores target DEF. Requires hit roll. Enhanced by cards and armor attributes.
   */

  /**
   * PS rework: MO_EXTREMITYFIST (Asura Strike).
   * Formula: ATK × (8 + floor(SP/10)) + 1000 (flat 1000 at ALL ranks — PSRO Monk
   * Rework 2026 PDF p.3 + wiki.payonstories.com/Asura_Strike; vanilla was 250+150×lv).
   * PS: SP consumed = floor(MaxSP × 0.2 × SkillLv); vanilla: all remaining SP.
   * Always hits (IgnoreFlee), ignores size fix, mastery and refine. PS does NOT
   * ignore DEF (unlike vanilla's IgnoreDefense) — gated on the
   * MO_EXTREMITYFIST_NK_NORMAL_DEF flag.
   */
  _runAsuraStrikeBranch(status, weapon, skill, target, build, opts = {}) {
    const { profile = STANDARD, gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();

    const psRework = profile.mechanic_flags.has("MO_EXTREMITYFIST_PS_SP_REWORK");
    let spConsumed, spNote;
    if (psRework) {
      spConsumed = Math.floor(status.max_sp * 0.2 * skill.level);
      spNote = `MaxSP(${status.max_sp}) × ${20 * skill.level}% = ${spConsumed}`;
    } else {
      spConsumed = build.current_sp != null ? build.current_sp : status.max_sp;
      spNote = `All remaining SP = ${spConsumed}`;
    }

    const flatBonus = 1000; // PS: constant 1000 at all ranks (was vanilla 250+150×lv)
    const spDiv = Math.floor(spConsumed / 10);
    const skillRatio = (8 + spDiv) * 100;

    let pmf = calculateBaseDamage(status, weapon, build, target, skill, result, {
      gear_bonuses: gearBonuses, is_crit: false, is_ranged: false,
    });

    pmf = scaleFloor(pmf, skillRatio, 100);
    let [mn, mx, av] = pmfStats(pmf);
    result.add_step({
      name: "Asura Strike Ratio",
      value: av, min_value: mn, max_value: mx, multiplier: skillRatio / 100,
      note: `SP: ${spNote}; ratio = (8 + floor(${spConsumed}/10)) × 100 = ${skillRatio}%`,
      formula: `ATK × (8 + floor(SP/10)) = ATK × ${8 + spDiv}`,
      hercules_ref: "battle.c battle_calc_skillratio MO_EXTREMITYFIST",
    });

    pmf = addFlat(pmf, flatBonus);
    [mn, mx, av] = pmfStats(pmf);
    result.add_step({
      name: "Asura Strike Flat",
      value: av, min_value: mn, max_value: mx, multiplier: 1.0,
      note: `+${flatBonus} flat (constant at all ranks)`,
      formula: `+ ${flatBonus}`,
      hercules_ref: "wiki.payonstories.com/Asura_Strike — PS: ATK×(8+SP/10)+1000",
    });

    // DEF: vanilla Asura ignores DEF (skills.json IgnoreDefense). PS reworked it to
    // take NORMAL hard+soft DEF (wiki.payonstories.com/Asura_Strike). Clear the
    // ignore-def flag and run the standard defense step when the PS flag is set.
    if (profile.mechanic_flags.has("MO_EXTREMITYFIST_NK_NORMAL_DEF")) {
      skill.nk_ignore_def = false;
      pmf = calculateDefenseFix(target, build, gearBonuses, pmf, this.config, result, { is_crit: false, skill });
    }

    pmf = calculateActiveStatusBonus(weapon, build, skill, pmf, result, profile);
    pmf = calculateRefineFix(weapon, skill, pmf, result);
    pmf = calculateMasteryFix(weapon, build, target, pmf, result, skill, { profile });
    pmf = calculateAttrFix(weapon, target, pmf, result, build, 0 /* Ele_Neutral */);
    pmf = calculateForgeBonus(weapon, 1, pmf, result);
    pmf = calculateSpiritSphereBonus(build, 1, pmf, result);
    pmf = calculateCardFix(build, gearBonuses, 0 /* Ele_Neutral */, target, false, pmf, result);
    pmf = calculateFinalRateBonus(false, pmf, this.config, result);
    pmf = floorAt(pmf, 1);

    [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: "Asura Strike branch", formula: "", hercules_ref: "" });
    result.min_damage = mn; result.max_damage = mx; result.avg_damage = av; result.pmf = pmf;
    return result;
  }

  _runReflectShieldBranch(status, weapon, skill, target, build, opts = {}) {
    const { profile = STANDARD, gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();

    const softDef = status.def2;
    const hardDef = status.def_;
    const baseDmg = Math.floor(softDef * (1 + 1.75 * hardDef / 100) * skill.level / 10);
    let pmf = uniformPmf(baseDmg, baseDmg);
    result.add_step({
      name: "Reflect Shield Base",
      value: baseDmg, min_value: baseDmg, max_value: baseDmg,
      note: `Soft DEF ${softDef} × (1 + 1.75 × ${hardDef}/100) × Lv${skill.level}/10`,
      formula: "floor(SoftDEF × (1 + 1.75 × HardDEF/100) × SkillLvl/10)",
      hercules_ref: "wiki.payonstories.com/Reflect_Shield — PS rework",
    });

    // Ignores target DEF — no defenseFix step.
    // "Enhanced by cards and armor attributes" (PDF): damage element follows the
    // player's armor element (changed by cards like Ghostring, Evil Druid, etc.).
    const rsEle = resolveArmorElement(build.armor_element ?? 0, gearBonuses);
    pmf = calculateAttrFix(weapon, target, pmf, result, build, rsEle);
    pmf = calculateCardFix(build, gearBonuses, rsEle, target, false /* melee */, pmf, result);
    pmf = calculateFinalRateBonus(false, pmf, this.config, result);
    pmf = floorAt(pmf, 1);

    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: "Reflect Shield branch", formula: "", hercules_ref: "" });
    result.min_damage = mn;
    result.max_damage = mx;
    result.avg_damage = av;
    result.pmf = pmf;
    return result;
  }

  /**
   * PS Hunter rework traps (Hunter_Rework_PayonStories.pdf).
   * Formula: floor(SkillLevel * factorA * factorB / divisor)
   *   Land Mine:     lv * (JobLv+DEX) * (BaseLv+INT) / 45  — Earth element
   *   Blast Mine:    lv * (BaseLv+DEX) * (JobLv+INT) / 45  — Wind element
   *   Freezing Trap: lv * (JobLv+DEX) * (BaseLv+INT) / 70  — Water element
   *   Claymore Trap: lv * (BaseLv+DEX) * (JobLv+INT) / 70  — Fire element
   * Always hits (IgnoreFlee). Bypasses DEF (formula gives final pre-element damage).
   * Verified: Hunter 99/50 DEX150/INT100 → LandMine=4422, BlastMine=4150,
   *   FreezingTrap=2842, Claymore=2667 (all match PDF comparison table).
   */
  _runTrapBranch(status, weapon, skill, target, build, opts = {}) {
    const { gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();
    const skillName = skill.name;
    const cfg = TRAP_CONFIGS[skillName];
    const [factA, factB] = trapFactors(cfg, status, build);
    const baseDmg = Math.floor(skill.level * factA * factB / cfg.divisor);

    let pmf = uniformPmf(baseDmg, baseDmg);
    result.add_step({
      name: "Trap Base",
      value: baseDmg, min_value: baseDmg, max_value: baseDmg,
      note: `Lv${skill.level} × ${factA} × ${factB} / ${cfg.divisor} = ${baseDmg}`,
      formula: `floor(SkillLv × factorA × factorB / ${cfg.divisor})`,
      hercules_ref: "Hunter_Rework_PayonStories.pdf",
    });

    const skillAtkBonus = gearBonuses ? (gearBonuses.skill_atk[skillName] || 0) : 0;
    if (skillAtkBonus) {
      pmf = scaleFloor(pmf, 100 + skillAtkBonus, 100);
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({
        name: "Skill ATK Bonus", value: av, min_value: mn, max_value: mx,
        multiplier: (100 + skillAtkBonus) / 100,
        note: `bSkillAtk: ${skillName} +${skillAtkBonus}%`,
        formula: `dmg × (100+${skillAtkBonus})/100`,
        hercules_ref: "pc.c:3513-3527",
      });
    }

    pmf = calculateAttrFix(weapon, target, pmf, result, build, cfg.element);
    pmf = calculateCardFix(build, gearBonuses, cfg.element, target, false /* melee */, pmf, result);
    pmf = calculateFinalRateBonus(false, pmf, this.config, result);
    pmf = floorAt(pmf, 1);

    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: `${skillName} trap branch`, formula: "", hercules_ref: "" });
    result.min_damage = mn; result.max_damage = mx; result.avg_damage = av; result.pmf = pmf;
    return result;
  }

  /**
   * Manual Blitz Beat (HT_BLITZBEAT). PS formula (wiki.payonstories.com/Blitz_Beat):
   * per hit = (LUK + floor(INT/2) + 6×Steel_Crow_lv + 20) × 2; number of hits =
   * the skill level (Lv1→1 … Lv5→5). Neutral element, bypasses DEF, unaffected by
   * ATK cards, requires a Falcon (Falconry Mastery). computeFalconDamage already
   * yields the per-hit value with the target's element and race/boss bonuses
   * folded in — the manual cast just multiplies it by the level's hit count.
   */
  _runBlitzBeatBranch(status, weapon, skill, target, build, opts = {}) {
    const { gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();
    const falcon = computeFalconDamage(status, build, gearBonuses, target, loader);
    if (!falcon) {
      result.add_step({
        name: "Requires a Falcon", value: 0, min_value: 0, max_value: 0,
        note: "Blitz Beat needs Falconry Mastery — set Falcon (and Steel Crow) in the Passive skills, on a Hunter/Sniper.",
        formula: "", hercules_ref: "wiki.payonstories.com/Blitz_Beat",
      });
      result.min_damage = 0; result.max_damage = 0; result.avg_damage = 0; result.pmf = { 0: 1.0 };
      return result;
    }
    const hits = Math.max(1, skill.level);
    const perHit = falcon.per_hit;
    const total = perHit * hits;
    result.add_step({
      name: `Blitz Beat Lv${skill.level}`, value: total, min_value: total, max_value: total,
      note: `${hits} hit${hits > 1 ? "s" : ""} × ${perHit} per hit — (LUK ${status.luk} + INT/2 ${Math.floor(status.int_ / 2)} + 6×SteelCrow ${falcon.steel_crow_lv} + 20) × 2, neutral, bypasses DEF; ATK cards don't apply`,
      formula: `perHit × ${hits} hits`, hercules_ref: "wiki.payonstories.com/Blitz_Beat",
    });
    result.min_damage = total; result.max_damage = total; result.avg_damage = total; result.pmf = { [total]: 1.0 };
    return result;
  }

  /**
   * CR_SHIELDBOOMERANG — PS formula (wiki.payonstories.com/Shield_Boomerang):
   *   damage = floor((BATK + shield_weight) × ratio / 100) + shield_refine × 10
   * Ratios per level: [130, 180, 220, 260, 300].
   * Weapon ATK and size fix are excluded. Neutral element. Mastery flat bonuses apply (PS).
   * Ranged attack; always hits monsters (nk_ignore_flee via mechanic_flags).
   */
  _runShieldBoomerangBranch(status, weapon, skill, target, build, opts = {}) {
    const { profile = STANDARD, gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();
    const skillName = "CR_SHIELDBOOMERANG";

    const shieldId = build.equipped && build.equipped.left_hand;
    const shieldItem = shieldId ? loader.getItem(shieldId) : null;
    const shieldWeight = shieldItem ? (shieldItem.weight || 0) : 0;
    const shieldRefine = (build.refine_levels && build.refine_levels.left_hand) || 0;

    // item_db stores weight as 10× the in-game displayed value (e.g. Buckler: db=600, displayed=60)
    const displayWeight = Math.floor(shieldWeight / 10);
    // PS skill DB ratios per level (ps_skill_db.json id 251): [140, 180, 220, 260, 300]
    const SB_RATIOS = [140, 180, 220, 260, 300];
    const ratio = SB_RATIOS[Math.min(skill.level, SB_RATIOS.length) - 1] ?? 140;

    const baseSum = status.batk + displayWeight;
    const baseDmg = Math.floor(baseSum * ratio / 100);
    let pmf = uniformPmf(baseDmg, baseDmg);
    result.add_step({
      name: "Shield Boomerang Base",
      value: baseDmg, min_value: baseDmg, max_value: baseDmg,
      note: shieldItem
        ? `BATK ${status.batk} + ${shieldItem.name || "shield"} weight ${displayWeight} (db:${shieldWeight}/10) = ${baseSum} × ${ratio}%`
        : `BATK ${status.batk} (no shield equipped) × ${ratio}%`,
      formula: `floor((BATK + shield_weight_displayed) × ${ratio} / 100)`,
      hercules_ref: "wiki.payonstories.com/Shield_Boomerang — PS formula",
    });

    const skillAtkBonus = gearBonuses ? (gearBonuses.skill_atk[skillName] || 0) : 0;
    if (skillAtkBonus) {
      pmf = scaleFloor(pmf, 100 + skillAtkBonus, 100);
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({ name: "Skill ATK Bonus", value: av, min_value: mn, max_value: mx, multiplier: (100 + skillAtkBonus) / 100, note: `bSkillAtk: ${skillName} +${skillAtkBonus}%`, formula: `dmg × (100+${skillAtkBonus})/100`, hercules_ref: "pc.c:3513-3527" });
    }

    pmf = calculateDefenseFix(target, build, gearBonuses, pmf, this.config, result, { is_crit: false, skill });

    // Mastery flat bonuses apply on PS (wiki.payonstories.com/Shield_Boomerang)
    const ctx = createCalcContext({
      skill_levels: gearBonuses ? gearBonuses.effective_mastery : build.mastery_levels,
      skill_params: build.skill_params,
      base_level: build.base_level,
      base_str: build.base_str,
      str_: status.str,
      vit: status.vit,
      dex: status.dex,
      int_: status.int_,
      weapon_type: weapon ? weapon.weapon_type : "",
    });
    pmf = calculateMasteryFix(weapon, build, target, pmf, result, skill, { profile, ctx });

    // Shield upgrade: +10 flat per refine level, added post-DEF like atk2
    if (shieldRefine > 0) {
      const refineFlat = shieldRefine * 10;
      pmf = addFlat(pmf, refineFlat);
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({
        name: "Shield Upgrade Bonus",
        value: av, min_value: mn, max_value: mx,
        note: `+${shieldRefine} refine × 10 = flat +${refineFlat}`,
        formula: "damage + shield_refine × 10",
        hercules_ref: "wiki.payonstories.com/Shield_Boomerang",
      });
    }

    // Neutral element — always, regardless of weapon element
    pmf = calculateAttrFix(weapon, target, pmf, result, build, 0 /* Ele_Neutral */);

    pmf = calculateCardFix(build, gearBonuses, 0 /* Ele_Neutral */, target, true /* isRanged */, pmf, result);

    pmf = calculateFinalRateBonus(true /* isRanged */, pmf, this.config, result);

    pmf = floorAt(pmf, 1);

    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: "Shield Boomerang branch", formula: "", hercules_ref: "" });
    result.min_damage = mn;
    result.max_damage = mx;
    result.avg_damage = av;
    result.pmf = pmf;
    return result;
  }

  /**
   * Run a single damage branch (normal or crit) through the modifier chain.
   * Mirrors BattlePipeline._run_branch in the Python source (trimmed scope —
   * see file header).
   */
  _runBranch(status, weapon, skill, target, build, isCrit, opts = {}) {
    const { profile = STANDARD, gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();
    const isRanged = resolveIsRanged(build, weapon, skill);

    result.add_step({ name: "Status BATK", value: status.batk, note: `STR=${status.str} DEX=${status.dex}`, formula: "str + (str//10)^2 + dex//5 + luk//5", hercules_ref: "status.c status_calc_batk", info: true });
    result.add_step({ name: "Weapon ATK", value: weapon.atk, note: "Raw weapon ATK from item_db", formula: "weapon.atk", hercules_ref: "battle.c battle_calc_base_damage2", info: true });
    if (isCrit) {
      result.add_step({ name: "Branch", value: 0, note: "CRIT BRANCH — damage=atkmax, DEF bypassed", formula: "flag.cri=1", hercules_ref: "battle.c:4988-4989", info: true });
    }

    const ctx = createCalcContext({
      skill_levels: gearBonuses.effective_mastery,
      skill_params: build.skill_params,
      base_level: build.base_level,
      base_str: build.base_str,
      str_: status.str,
      vit: status.vit,
      dex: status.dex,
      int_: status.int_,
      weapon_type: weapon ? weapon.weapon_type : "",
    });

    let pmf = calculateBaseDamage(status, weapon, build, target, skill, result, {
      gear_bonuses: gearBonuses, is_crit: isCrit, is_ranged: isRanged,
    });

    if (gearBonuses.atk_rate) {
      pmf = scaleFloor(pmf, 100 + gearBonuses.atk_rate, 100);
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({ name: "bAtkRate", value: av, min_value: mn, max_value: mx, multiplier: (100 + gearBonuses.atk_rate) / 100, note: `bAtkRate +${gearBonuses.atk_rate}%`, formula: `dmg*(100+${gearBonuses.atk_rate})//100`, hercules_ref: "battle.c:5330" });
    }

    let hitCount = 1;
    [pmf, hitCount] = calculateSkillRatio(skill, pmf, build, result, {
      target, weapon, profile, ctx, gear_bonuses: gearBonuses,
    });

    // NOTE: bSkillAtk (skill-specific damage bonus from cards/items, e.g. Yser
    // Card) is applied inside calculateSkillRatio() above — do NOT re-apply it
    // here or it double-counts (was inflating every weapon skill with a
    // bSkillAtk bonus, e.g. Acid Terror +30%, by that percentage twice).

    // PS Rogue rework: Backstab Opportunity — ×1.4 when monster is not targeting
    // the Rogue (or player is not facing the Rogue in PvP).
    if (skill.name === "RG_BACKSTAP" && profile.mechanic_flags.has("RG_BACKSTAP_OPPORTUNITY")
        && build.support_buffs?.backstab_opportunity) {
      pmf = scaleFloor(pmf, 140, 100);
      const [mnO, mxO, avO] = pmfStats(pmf);
      result.add_step({ name: "Backstab Opportunity", value: avO, min_value: mnO, max_value: mxO, multiplier: 1.4, note: "Not targeted / not facing: ×1.4", formula: "dmg × 140 / 100", hercules_ref: "Rogue_Patchnotes_PayonStories.pdf" });
    }

    if (isCrit) {
      pmf = calculateCritAtkRate(build, pmf, result, { weapon, profile, skill, gb: gearBonuses });
    }

    pmf = calculateDefenseFix(target, build, gearBonuses, pmf, this.config, result, { is_crit: isCrit, skill });

    pmf = calculateActiveStatusBonus(weapon, build, skill, pmf, result, profile);

    pmf = calculateRefineFix(weapon, skill, pmf, result);

    pmf = calculateMasteryFix(weapon, build, target, pmf, result, skill, { profile, ctx });

    const skillData = loader.getSkill(skill.id);
    let effAtkEle = weapon.element;
    if (skill.id !== 0 && skillData) {
      const eleList = skillData.element || [];
      if (eleList.length) {
        const idx = Math.min(skill.level - 1, eleList.length - 1);
        const v = ELE_STR_TO_INT[eleList[idx]];
        if (v != null) effAtkEle = v;
      }
    }
    if (skill.name in (profile.skill_elements || {})) effAtkEle = profile.skill_elements[skill.name];

    // PS rework: Envenom uses weapon element instead of forced Poison.
    if (profile.mechanic_flags.has("TF_POISON_USES_WEAPON_ELEMENT") && skill.name === "TF_POISON") effAtkEle = weapon.element;

    if (!skill.nk_ignore_ele) {
      pmf = calculateAttrFix(weapon, target, pmf, result, build, effAtkEle);
    } else {
      const [mnE, mxE, avE] = pmfStats(pmf);
      result.add_step({ name: "Element (AttrFix)", value: avE, min_value: mnE, max_value: mxE, multiplier: 1.0, note: "BYPASSED — NK_IGNORE_ELEMENT", formula: "no change", hercules_ref: "battle.c NK_IGNORE_ELEMENT" });
    }

    // PS rework: Enchant Poison passive — +2%/lv vs Poison element targets.
    const ELE_POISON = 5;
    // PS caps Enchant Poison at level 5, so the passive bonus tops out at +10%.
    const enchantPoisonLv = profile.mechanic_flags.has("AS_ENCHANTPOISON_PASSIVE_BONUS")
      ? Math.min(gearBonuses.effective_mastery?.AS_ENCHANTPOISON || 0, 5) : 0;
    if (enchantPoisonLv > 0 && target.element === ELE_POISON) {
      const bonusPct = 2 * enchantPoisonLv;
      pmf = scaleFloor(pmf, 100 + bonusPct, 100);
      const [mn2, mx2, av2] = pmfStats(pmf);
      result.add_step({ name: "Enchant Poison Passive", value: av2, min_value: mn2, max_value: mx2, multiplier: (100 + bonusPct) / 100, note: `AS_ENCHANTPOISON Lv ${enchantPoisonLv}: +${bonusPct}% vs Poison element`, formula: `dmg × ${100 + bonusPct} / 100`, hercules_ref: "PS-AssassinRework" });
    }

    const div = hitCount;
    pmf = calculateForgeBonus(weapon, div, pmf, result);
    pmf = calculateSpiritSphereBonus(build, div, pmf, result);

    // NK_IGNORE_CARDS (e.g. Acid Terror): the skill's damage is unaffected by
    // card damage modifiers (bAddRace/bAddEle/bAddSize/atk-ele and the target's
    // card-based resists), so skip the Card Fix stage entirely. Flat ATK cards
    // (Andre etc.) still count — they live in ATK, not here.
    if (skill.nk_ignore_cards) {
      const [mn, mx, av] = pmfStats(pmf);
      result.add_step({ name: "Card Fix", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note: "BYPASSED — damage_type includes IgnoreCards", formula: "no change", hercules_ref: "skills.json damage_type / battle.c NK_IGNORE_CARDS" });
    } else {
      pmf = calculateCardFix(build, gearBonuses, effAtkEle, target, isRanged, pmf, result);
    }

    pmf = calculateFinalRateBonus(isRanged, pmf, this.config, result);

    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: isCrit ? "CRIT branch" : "Normal branch", formula: "", hercules_ref: "" });

    result.min_damage = mn;
    result.max_damage = mx;
    result.avg_damage = av;
    result.pmf = pmf;

    return result;
  }

  /**
   * NJ_ISSEN (Killing Stroke) — sacrifices the caster's HP for a fixed hit that
   * does NOT scale with weapon ATK:
   *   damage = STR*40 + HP*(8% * SkillLv)
   * (wiki.payonstories.com/Killing_Stroke). Always Neutral element; auto-hit
   * (damage_type IgnoreFlee); DEF and cards still apply. HP is the current HP
   * being sacrificed — use current_hp when set, otherwise max HP (full health).
   * The Mirror Image (+10-30%) damage bonus is not modeled.
   */
  _runKillingStrokeBranch(status, weapon, skill, target, build, opts = {}) {
    const { gear_bonuses: gearBonuses } = opts;
    const result = createDamageResult();

    const hp = build.current_hp != null ? build.current_hp : status.max_hp;
    const base = Math.max(1, status.str * 40 + Math.floor((hp * 8 * skill.level) / 100));

    let pmf = { [base]: 1.0 };
    result.add_step({
      name: `Killing Stroke Base (Lv ${skill.level})`, value: base, min_value: base, max_value: base,
      note: `STR ${status.str}, HP ${hp} — weapon ATK not used`,
      formula: "STR*40 + HP*(8% * SkillLv)",
      hercules_ref: "wiki.payonstories.com/Killing_Stroke",
    });

    // Neutral element; DEF and cards apply; flee ignored (auto-hit).
    pmf = calculateDefenseFix(target, build, gearBonuses, pmf, this.config, result, { is_crit: false, skill });
    pmf = calculateAttrFix(weapon, target, pmf, result, build, 0 /* always Neutral */);
    pmf = calculateCardFix(build, gearBonuses, 0, target, false, pmf, result);

    pmf = floorAt(pmf, 1);
    const [mn, mx, av] = pmfStats(pmf);
    result.add_step({ name: "Final Damage", value: av, min_value: mn, max_value: mx, note: "Killing Stroke branch (HP sacrifice; Mirror Image bonus not modeled)", formula: "", hercules_ref: "" });

    result.min_damage = mn;
    result.max_damage = mx;
    result.avg_damage = av;
    result.pmf = pmf;
    return result;
  }

  calculate(status, weapon, skill, target, build, gearBonuses) {
    const skillData = loader.getSkill(skill.id);
    const attackType = skillData ? skillData.attack_type || "Weapon" : "Weapon";
    const skillName = skillData ? skillData.name || "" : "";

    const profile = getProfile(build.server);

    // SM_MAGNUM_ENDOW_ATTACK_ONLY (Crusader rework): Magnum Break's fire semi-endow
    // applies only to auto attacks on PS — strip it from skill damage calculations.
    if (
      skill.id > 0 && skillName !== "SM_MAGNUM" &&
      profile.mechanic_flags.has("SM_MAGNUM_ENDOW_ATTACK_ONLY") &&
      build.support_buffs?.weapon_endow_sc
    ) {
      build = { ...build, weapon_element: weapon ? (weapon.element ?? 0) : 0 };
    }

    skill.name = skillName;
    const damageType = skillData ? skillData.damage_type || [] : [];
    skill.nk_ignore_def = damageType.includes("IgnoreDefense");
    skill.nk_ignore_flee = damageType.includes("IgnoreFlee");
    skill.nk_ignore_ele = damageType.includes("IgnoreElement");
    skill.nk_ignore_cards = damageType.includes("IgnoreCards");
    // Asura Strike and Grand Cross both ignore the weapon size penalty. GC:
    // "the damage ignores size modifications" (ratemyserver.net skill_db skid=254,
    // Aegis behaviour) — its physical (ATK) half is NOT scaled by weapon-vs-size,
    // unlike an ordinary weapon hit. Applies to both the outgoing hit and the
    // self-recoil (they share this skill object).
    skill.ignore_size_fix = skillName === "MO_EXTREMITYFIST" || skillName === "CR_GRANDCROSS";

    const amotion = Math.max(100, Math.round(2000 - status.aspd * 10));
    const adelay = 2 * amotion;

    if (profile.skill_level_cap_overrides && profile.skill_level_cap_overrides[skillName] != null) {
      const cap = profile.skill_level_cap_overrides[skillName];
      if (skill.level > cap) skill = { ...skill, level: cap };
    }

    if (skillName === "MO_EXTREMITYFIST") {
      const asuraResult = this._runAsuraStrikeBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });
      let castMs = 0, delayMs = 0;
      if (skillData) [castMs, delayMs] = calculateSkillTiming(skillName, skill.level, skillData, status, gearBonuses, build.support_buffs, build.server);
      const asuraPeriod = Math.max(castMs + delayMs, 100);
      const attacks = [createAttackDefinition(asuraResult.avg_damage, 0.0, asuraPeriod, 1.0)];
      return createBattleResult({
        normal: asuraResult, crit: null, crit_chance: 0.0, hit_chance: 100.0,
        dps: calculateDps(attacks), attacks, period_ms: asuraPeriod, dps_valid: true,
      });
    }

    if (skillName === "CR_REFLECTSHIELD") {
      const [hitChanceRS] = calculateHitChance(status, target, this.config);
      const rsResult = this._runReflectShieldBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });
      const rsAttacks = [
        createAttackDefinition(rsResult.avg_damage, 0.0, amotion, hitChanceRS / 100.0),
        createAttackDefinition(0.0, 0.0, amotion, 1.0 - hitChanceRS / 100.0),
      ];
      return createBattleResult({
        normal: rsResult,
        crit: null,
        crit_chance: 0.0,
        hit_chance: hitChanceRS,
        dps: 0,
        attacks: rsAttacks,
        period_ms: amotion,
        // DPS depends on monster attack speed, not player ASPD — not calculable here.
        dps_valid: false,
      });
    }

    if (skillName === "CR_SHIELDBOOMERANG") {
      if (profile.mechanic_flags.has("CR_SHIELDBOOMERANG_NK_IGNORE_FLEE")) skill.nk_ignore_flee = true;
      const [hitChanceSB] = calculateHitChance(status, target, this.config);
      const effectiveHitSB = skill.nk_ignore_flee ? 100.0 : hitChanceSB;
      const sbResult = this._runShieldBoomerangBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });
      let castMs = 0, delayMs = 0;
      if (skillData) {
        [castMs, delayMs] = calculateSkillTiming(skillName, skill.level, skillData, status, gearBonuses, build.support_buffs, build.server);
      }
      const sbPeriod = Math.max(castMs + delayMs, 100);
      const attacks = [
        createAttackDefinition(sbResult.avg_damage, 0.0, sbPeriod, effectiveHitSB / 100.0),
        createAttackDefinition(0.0, 0.0, sbPeriod, 1.0 - effectiveHitSB / 100.0),
      ];
      const dps = calculateDps(attacks);
      return createBattleResult({
        normal: sbResult,
        crit: null,
        crit_chance: 0.0,
        hit_chance: effectiveHitSB,
        dps,
        attacks,
        period_ms: sbPeriod,
        dps_valid: true,
      });
    }

    if (skillName === "CR_GRANDCROSS") {
      const gcResult = this._runGrandCrossBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });

      let castMs = 0, delayMs = 0;
      if (skillData) {
        [castMs, delayMs] = calculateSkillTiming(skillName, skill.level, skillData, status, gearBonuses, build.support_buffs, build.server);
      }
      const gcPeriod = Math.max(castMs + delayMs, 100);
      const attacks = [createAttackDefinition(gcResult.avg_damage, 0.0, gcPeriod, 1.0)];
      const dps = calculateDps(attacks);

      return createBattleResult({
        normal: gcResult,
        crit: null,
        crit_chance: 0.0,
        hit_chance: 100.0,
        dps,
        attacks,
        period_ms: gcPeriod,
        dps_valid: true,
      });
    }

    if (skillName === "PR_TURNUNDEAD") {
      const tuResult = this._runTurnUndeadBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });
      let castMs = 0, delayMs = 0;
      if (skillData) [castMs, delayMs] = calculateSkillTiming(skillName, skill.level, skillData, status, gearBonuses, build.support_buffs, build.server);
      const tuPeriod = Math.max(castMs + delayMs, 100);
      const attacks = [createAttackDefinition(tuResult.avg_damage, 0.0, tuPeriod, 1.0)];
      return createBattleResult({
        normal: tuResult, crit: null, crit_chance: 0.0, hit_chance: 100.0,
        success_chance: tuResult.success_chance,
        dps: calculateDps(attacks), attacks, period_ms: tuPeriod, dps_valid: true,
      });
    }

    if (skillName === "AL_HEAL") {
      const healResult = this._runHealBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });
      let castMs = 0, delayMs = 0;
      if (skillData) [castMs, delayMs] = calculateSkillTiming(skillName, skill.level, skillData, status, gearBonuses, build.support_buffs, build.server);
      const healPeriod = Math.max(castMs + delayMs, 100);
      const attacks = [createAttackDefinition(healResult.avg_damage, 0.0, healPeriod, 1.0)];
      return createBattleResult({
        normal: healResult, crit: null, crit_chance: 0.0, hit_chance: 100.0,
        dps: calculateDps(attacks), attacks, period_ms: healPeriod, dps_valid: healResult.avg_damage > 0,
      });
    }

    if (skillName === "NJ_ISSEN") {
      const ksResult = this._runKillingStrokeBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });
      let castMs = 0, delayMs = 0;
      if (skillData) [castMs, delayMs] = calculateSkillTiming(skillName, skill.level, skillData, status, gearBonuses, build.support_buffs, build.server);
      const ksPeriod = Math.max(castMs + delayMs, 100);
      const attacks = [createAttackDefinition(ksResult.avg_damage, 0.0, ksPeriod, 1.0)];
      return createBattleResult({
        normal: ksResult, crit: null, crit_chance: 0.0, hit_chance: 100.0,
        dps: calculateDps(attacks), attacks, period_ms: ksPeriod, dps_valid: true,
      });
    }

    // Whether the active profile can actually compute this skill's damage (a ratio is
    // defined for it somewhere). PS damage skills like Venom Splasher (AS_SPLASHER),
    // Brandish Spear and Bomb carry the NoDamage flag in the DB because their real hit
    // is a delayed explosion, yet the engine computes them via a weapon ratio — those
    // must NOT be short-circuited by the NoDamage guard below; they flow to the
    // physical branch. (Same exemption used by the BF_MISC catch-all further down.)
    const hasRatio = !!((profile.weapon_ratios || {})[skillName] || (profile.magic_ratios || {})[skillName] || BF_WEAPON_RATIOS[skillName]);

    // NoDamage guard: buffs/debuffs (Dispell, Soul Change, Benedictio, …) are typed
    // attack_type "Magic" but carry the NoDamage flag, so without this they'd fall into
    // the magic branch and fabricate a phantom MATK hit. The one NoDamage skill we *do*
    // compute — offensive Heal (AL_HEAL) — is dispatched by name above, so it never reaches
    // here. Kept out of the picker too (routes/data.ts), but guard at compute time as well.
    if (skillData && (skillData.damage_type || []).includes("NoDamage") && !hasRatio) {
      return createBattleResult({
        normal: createDamageResult({ steps: [{
          name: "No damage", value: 0, min_value: 0, max_value: 0, multiplier: 1,
          note: `${skillName || "This skill"} is a support skill (NoDamage) — it deals no damage.`,
          formula: "", hercules_ref: "",
        }] }),
        dps_valid: false,
      });
    }

    if (attackType === "Magic") {
      const magicResult = this._runMagicBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });

      let castMs = 0, delayMs = 0;
      if (skillData) {
        [castMs, delayMs] = calculateSkillTiming(skillName, skill.level, skillData, status, gearBonuses, build.support_buffs, build.server);
      }
      // Spam cap: a cast skill can't be repeated faster than the profile floor
      // (PS = 333ms / 3-per-sec).
      const magicPeriod = Math.max(castMs + delayMs, profile.min_cast_period_ms || 100);

      const doubleCastingLv = Number((build.active_status_levels || {}).SC_DOUBLECASTING || 0);
      if (doubleCastingLv > 0 && DOUBLECASTING_SKILLS.has(skillName)) {
        // Double Bolt fires the whole bolt volley a SECOND time per cast (instantly),
        // so one cast deals two volleys' worth of damage — it kills in half the casts.
        // Model it as ×2 damage per cast, NOT a halved period: halving the period would
        // (a) leave per-cast damage / hits-to-kill unchanged and (b) imply 6 casts/sec,
        // breaking the 3/sec spam cap. DPS still doubles (2× damage over the same period).
        magicResult.pmf = scaleFloor(magicResult.pmf, 2, 1);
        const [mn, mx, av] = pmfStats(magicResult.pmf);
        magicResult.min_damage = mn;
        magicResult.max_damage = mx;
        magicResult.avg_damage = av;
        magicResult.add_step({
          name: "Double Bolt", value: av, min_value: mn, max_value: mx, multiplier: 2.0,
          note: "SC_DOUBLECASTING (PF_DOUBLECASTING): 100% chance to fire the bolt a second time instantly — one cast deals two volleys (×2 damage per cast), killing in half the casts. Cast rate is unchanged (and capped), so DPS still doubles.",
          formula: "damage × 2 per cast", hercules_ref: "skill.c pc_use_skill PF_DOUBLECASTING",
        });
      }

      const attacks = [createAttackDefinition(magicResult.avg_damage, 0.0, magicPeriod, 1.0)];
      const dps = calculateDps(attacks);

      return createBattleResult({
        normal: magicResult,
        crit: null,
        crit_chance: 0.0,
        hit_chance: 100.0,
        dps,
        attacks,
        period_ms: magicPeriod,
        dps_valid: true,
      });
    }
    if (skillName === "HT_BLITZBEAT") {
      const bbResult = this._runBlitzBeatBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });
      // Blitz Beat has no cast time or after-cast delay (PS wiki), so it fires at
      // the attack-motion cadence.
      const bbPeriod = adelay;
      const bbAttacks = [createAttackDefinition(bbResult.avg_damage, 0.0, bbPeriod, 1.0)];
      return createBattleResult({
        normal: bbResult, crit: null, crit_chance: 0.0, hit_chance: 100.0,
        dps: bbResult.avg_damage > 0 ? calculateDps(bbAttacks) : 0,
        attacks: bbAttacks, period_ms: bbPeriod, dps_valid: bbResult.avg_damage > 0,
      });
    }
    if (TRAP_SKILL_NAMES.has(skillName)) {
      if (profile.mechanic_flags.has("HT_TRAP_PS_FORMULA")) {
        const trapResult = this._runTrapBranch(status, weapon, skill, target, build, { profile, gear_bonuses: gearBonuses });
        let castMs = 0, delayMs = 0;
        if (skillData) [castMs, delayMs] = calculateSkillTiming(skillName, skill.level, skillData, status, gearBonuses, build.support_buffs, build.server);
        const trapPeriod = Math.max(castMs + delayMs, profile.min_cast_period_ms || 100);
        const trapAttacks = [createAttackDefinition(trapResult.avg_damage, 0.0, trapPeriod, 1.0)];
        return createBattleResult({
          normal: trapResult, crit: null, crit_chance: 0.0, hit_chance: 100.0,
          dps: calculateDps(trapAttacks), attacks: trapAttacks, period_ms: trapPeriod, dps_valid: true,
        });
      }
      return createBattleResult({
        normal: createDamageResult({ steps: [{
          name: "Not yet implemented", value: 0, min_value: 0, max_value: 0, multiplier: 1,
          note: `${skillName}: trap formula not yet ported for non-PS profiles.`,
          formula: "", hercules_ref: "",
        }] }),
        dps_valid: false,
      });
    }
    // BF_MISC catch-all. Any Misc skill we actually support is dispatched by name above
    // (Reflect Shield) or as a trap; anything else reaching here is unported. Vanilla-loaded
    // Misc skills (e.g. Acid Demonstration) carry attack_type "Misc" but no skill_form and a
    // non-"Misc" damage_type, so they'd otherwise fall through to the physical branch and
    // fabricate a garbage weapon hit — hence the attackType check.
    // BUT: many PS damage skills are BF_MISC in vanilla yet PS treats them as ordinary
    // ATK-ratio hits (Acid Terror/Demonstration, Venom Splasher, Ground Drift, Counter Attack,
    // Bull's Eye, Magical Bullet …). Those have a real weapon/magic ratio and MUST flow to the
    // physical branch. So only fire this catch-all when NO ratio is defined for the skill.
    const looksMisc = attackType === "Misc" || (skillData && (skillData.skill_form === "Misc" || (skillData.damage_type || []).includes("Misc")));
    if (looksMisc && !hasRatio) {
      return createBattleResult({
        normal: createDamageResult({
          steps: [{
            name: "Not yet implemented", value: 0, min_value: 0, max_value: 0, multiplier: 1,
            note: `${skillName || "This skill"} uses a BF_MISC formula not yet ported to the JS engine.`,
            formula: "", hercules_ref: "",
          }],
        }),
        dps_valid: false,
      });
    }

    // PS: Triple Attack (as an active skill) can crit while Critical Explosion/Fury is active.
    const taFury = skillName === "MO_TRIPLEATTACK"
      && profile.mechanic_flags.has("MO_TRIPLEATTACK_PS_BONUS")
      && "SC_EXPLOSIONSPIRITS" in (build.active_status_levels || {});
    const [isEligible, critChance] = calculateCritChance(status, weapon, skill, target, this.config, build.server, gearBonuses, taFury);
    let [hitChance, perfectDodge] = calculateHitChance(status, target, this.config, skillName, skill.level);
    if (build.target_mob_id != null) perfectDodge = 0.0;

    if (profile.mechanic_flags.has(`${skillName}_NK_IGNORE_FLEE`)) skill.nk_ignore_flee = true;
    if (skill.nk_ignore_flee) {
      hitChance = 100.0;
      perfectDodge = 0.0;
    }

    const normal = this._runBranch(status, weapon, skill, target, build, false, { profile, gear_bonuses: gearBonuses });
    const crit = isEligible ? this._runBranch(status, weapon, skill, target, build, true, { profile, gear_bonuses: gearBonuses }) : null;

    let period, dpsValid;
    if (skill.id === 0) {
      period = adelay;
      dpsValid = true;
    } else if (skillData) {
      const [castMs, delayMs] = calculateSkillTiming(skillName, skill.level, skillData, status, gearBonuses, build.support_buffs, build.server);
      period = skillPeriodMs(castMs, delayMs, skillData, skill.level, (profile.skill_min_period_ms || {})[skillName], adelay);
      if ((profile.ps_attack_interval || {})[skillName]) period = profile.ps_attack_interval[skillName](status, amotion);
      dpsValid = true; // NOT YET PORTED: IMPLEMENTED_BF_WEAPON_SKILLS allow-list from upstream
    } else {
      period = adelay;
      dpsValid = true;
    }

    const h = hitChance / 100.0;
    const effCrit = critChance / 100.0;
    const normalAvg = normal.avg_damage;
    const critAvg = crit ? crit.avg_damage : normalAvg;

    // Katar second hit — auto-attack only; proc rate = 2× the TF_DOUBLE rate.
    // PS rework damage: (21 + 4×AS_KATAR_lv)% of main hit (was flat 21% vanilla).
    let katarSecond = null;
    let katarSecondCrit = null;
    let katarProcChance = 0;
    if (skill.id === 0 && weapon.weapon_type === "Katar" && profile.mechanic_flags.has("AS_KATAR_SECOND_HIT")) {
      const katarTFDoubleLv = gearBonuses.effective_mastery.TF_DOUBLE || 0;
      if (katarTFDoubleLv > 0) {
        const katarMasteryLv = gearBonuses.effective_mastery.AS_KATAR || 0;
        const katarDoubleRatePerLv = (profile.proc_rate_overrides || {}).TF_DOUBLE ?? 5.0;
        katarProcChance = Math.min(100, 2 * katarDoubleRatePerLv * katarTFDoubleLv + (gearBonuses.double_rate || 0));
        const katarScale = (21 + 4 * katarMasteryLv) / 100;
        const scalePct = (katarScale * 100).toFixed(0);

        katarSecond = createDamageResult({
          min_damage: Math.floor(normal.min_damage * katarScale),
          max_damage: Math.floor(normal.max_damage * katarScale),
          avg_damage: normal.avg_damage * katarScale,
        });
        katarSecond.add_step({ name: "Katar 2nd hit", value: normal.avg_damage * katarScale, min_value: Math.floor(normal.min_damage * katarScale), max_value: Math.floor(normal.max_damage * katarScale), note: `Proc: ${katarProcChance}% · ${scalePct}% of main hit (21% base + ${4 * katarMasteryLv}% from AS_KATAR Lv${katarMasteryLv})`, formula: `main × ${scalePct} / 100`, hercules_ref: "PS-AssassinRework" });

        if (crit) {
          katarSecondCrit = createDamageResult({
            min_damage: Math.floor(crit.min_damage * katarScale),
            max_damage: Math.floor(crit.max_damage * katarScale),
            avg_damage: crit.avg_damage * katarScale,
          });
          katarSecondCrit.add_step({ name: "Katar 2nd hit (crit)", value: crit.avg_damage * katarScale, min_value: Math.floor(crit.min_damage * katarScale), max_value: Math.floor(crit.max_damage * katarScale), note: `Proc: ${katarProcChance}% · ${scalePct}% of crit hit`, formula: `crit × ${scalePct} / 100`, hercules_ref: "PS-AssassinRework" });
        }
      }
    }

    // TF_DOUBLE (Double Attack) — battle.c:4926. Dagger-only, normal attacks
    // only (skill.id === 0); crit and the proc are mutually exclusive (a
    // critical swing never also double-attacks). The second hit reruns the
    // exact same non-crit pipeline as `normal` — since DPS here only needs
    // the expected value, not a true independent second roll, reusing
    // normal.avg_damage is mathematically equivalent (E[X+Y] = E[X]+E[Y]
    // regardless of independence) and avoids a redundant _runBranch call.
    // bDoubleRate (e.g. Sidewinder Card) is a separate, weapon-unrestricted
    // source of the same proc -- Hercules adds it to the TF_DOUBLE skill
    // rate in the same roll (battle.c battle_calc_weapon_attack), so it's
    // additive here too, just without the dagger/normal-attack-only
    // restriction TF_DOUBLE itself has.
    // Double-attack proc level + which proc-rate override supplies its per-level
    // rate. Daggers use TF_DOUBLE; PS lets bows (Rogue rework) and revolvers
    // (Gunslinger Chain Action) proc too.
    let tfDoubleLv = 0;
    let doubleProcKey = "TF_DOUBLE";
    if (skill.id === 0 && weapon.weapon_type === "Knife") {
      tfDoubleLv = gearBonuses.effective_mastery.TF_DOUBLE || 0;
    } else if (skill.id === 0 && weapon.weapon_type === "Bow"
        && profile.mechanic_flags.has("RG_BOW_DOUBLE_ATTACK")) {
      // PS Rogue rework: Vulture's Eye enables Double Attack with a bow.
      // Proc chance = doubleRate × min(TF_DOUBLE_lv, AC_VULTURE_lv).
      const bowDA = gearBonuses.effective_mastery.TF_DOUBLE || 0;
      const vultureLv = gearBonuses.effective_mastery.AC_VULTURE || 0;
      if (bowDA > 0 && vultureLv > 0) tfDoubleLv = Math.min(bowDA, vultureLv);
    } else if (skill.id === 0 && weapon.weapon_type === "Revolver") {
      // Gunslinger Chain Action (GS_CHAINACTION): revolver normal attacks have a
      // 7%/lv chance to fire a second time — "similar to Thieves Double Attack"
      // (wiki.payonstories.com/Chain_Action: 7% at Lv1 → 70% at Lv10).
      tfDoubleLv = gearBonuses.effective_mastery.GS_CHAINACTION || 0;
      doubleProcKey = "GS_CHAINACTION";
    }
    const doubleRate = (profile.proc_rate_overrides || {})[doubleProcKey] ?? 5.0;
    const skillProcChance = tfDoubleLv > 0 ? doubleRate * tfDoubleLv : 0;
    const itemDoubleRate = skill.id === 0 ? (gearBonuses.double_rate || 0) : 0;
    const procChance = Math.min(100, skillProcChance + itemDoubleRate);
    const procFrac = procChance / 100.0;

    // MO_TRIPLEATTACK proc — auto-attacks only (Monk/Champion). TA replaces
    // the auto-attack on proc (unlike TF_DOUBLE which adds a second hit).
    // PS rework: 5 levels, base rates [28,26,24,22,20]%; Knuckle weapons gain
    // +0.2×lv% per 10 job levels (e.g. +5% total at rank 5, j50).
    // MO_TRIPLEATTACK_PS_BONUS flag: TA proc can crit when SC_EXPLOSIONSPIRITS
    // (Critical Explosion / Fury) is active.
    const taLv = skill.id === 0 ? (gearBonuses.effective_mastery.MO_TRIPLEATTACK || 0) : 0;
    let taProc = null, taCritProc = null, taProcChance = 0;
    if (taLv > 0) {
      const taRates = (profile.proc_rate_overrides || {}).MO_TRIPLEATTACK;
      if (taRates) {
        let baseRate = Array.isArray(taRates) ? (taRates[taLv] ?? 0) : taRates * taLv;
        if (weapon.weapon_type === "Knuckle") {
          baseRate += 0.2 * taLv * Math.floor((build.job_level || 1) / 10);
        }
        taProcChance = Math.min(100, baseRate);
        const taSkill = { id: 263, name: "MO_TRIPLEATTACK", level: taLv, nk_ignore_flee: false };
        taProc = this._runBranch(status, weapon, taSkill, target, build, false, { profile, gear_bonuses: gearBonuses });
        const furyActive = profile.mechanic_flags.has("MO_TRIPLEATTACK_PS_BONUS")
          && "SC_EXPLOSIONSPIRITS" in (build.active_status_levels || {});
        if (furyActive) {
          taCritProc = this._runBranch(status, weapon, taSkill, target, build, true, { profile, gear_bonuses: gearBonuses });
        }
      }
    }
    const tpf = taProcChance / 100.0;
    const taAvg = taProc ? taProc.avg_damage : 0;
    const taCritAvg = taCritProc ? taCritProc.avg_damage : taAvg;

    // PS dual-wield: three-hit model per auto-attack.
    // Hits 1 & 2 are both RH attacks with the same damage roll (×rhFactor each).
    // Hit 3 is the LH weapon (×lhFactor). Expected total = 2×RH×rhFactor + LH×lhFactor.
    // Gated by DUAL_WIELD_PS_THREE_HIT — remove that flag from PS_MECHANIC_FLAGS to revert.
    let dualWield = null;
    if (
      skill.id === 0 &&
      profile.mechanic_flags.has("DUAL_WIELD_PS_THREE_HIT") &&
      DUAL_WIELD_JOBS.has(build.job_id) &&
      build.equipped && build.equipped.left_hand
    ) {
      const lhItem = loader.getItem(build.equipped.left_hand);
      if (lhItem && lhItem.type === "IT_WEAPON") {
        const lhWeapon = resolveWeapon(
          loader,
          build.equipped.left_hand,
          (build.refine_levels || {}).left_hand || 0,
        );
        if (lhWeapon) {
          const rhLv = gearBonuses.effective_mastery.AS_RIGHT || 0;
          const lhLv = gearBonuses.effective_mastery.AS_LEFT  || 0;
          const rhSpec = (profile.passive_overrides || {}).AS_RIGHT || {};
          const lhSpec = (profile.passive_overrides || {}).AS_LEFT  || {};
          // Vanilla base penalty: RH=50%, LH=30%. PS mastery overrides that directly.
          const rhFactor = rhSpec.rh_factors
            ? (rhLv > 0 ? (rhSpec.rh_factors[rhLv - 1] ?? 0.50) : 0.50)
            : (rhLv > 0 ? (0.50 + 0.10 * rhLv) : 0.50);
          const lhFactor = lhSpec.lh_factors
            ? (lhLv > 0 ? (lhSpec.lh_factors[lhLv - 1] ?? 0.30) : 0.30)
            : (lhLv > 0 ? (0.30 + 0.10 * lhLv) : 0.30);

          const lhNormal = this._runBranch(status, lhWeapon, skill, target, build, false, { profile, gear_bonuses: gearBonuses });
          const lhCrit   = isEligible ? this._runBranch(status, lhWeapon, skill, target, build, true,  { profile, gear_bonuses: gearBonuses }) : null;
          const lhCritAvg = lhCrit ? lhCrit.avg_damage : lhNormal.avg_damage;

          const dwBonusPct = profile.mechanic_flags.has("DUAL_WIELD_PS_DAMAGE_BONUS") ? 10 : 0;
          const dwBonusMult = 1 + dwBonusPct / 100;

          dualWield = {
            lhWeapon, lhNormal, lhCrit, rhFactor, lhFactor,
            dw_ps_bonus_pct: dwBonusPct,
            combinedNormalAvg: (2 * normalAvg * rhFactor + lhNormal.avg_damage * lhFactor) * dwBonusMult,
            combinedCritAvg:   (2 * critAvg   * rhFactor + lhCritAvg           * lhFactor) * dwBonusMult,
          };
        }
      }
    }

    // Build attacks array. TA proc takes priority over TF_DOUBLE (Monks don't
    // use Knives, so both shouldn't apply simultaneously in practice).
    let attacks;
    if (dualWield) {
      // Dual-wield: crits auto-hit; hit/miss applies to non-crit swings only.
      attacks = [
        createAttackDefinition(dualWield.combinedCritAvg,   0.0, period, effCrit),
        createAttackDefinition(dualWield.combinedNormalAvg, 0.0, period, (1.0 - effCrit) * h),
        createAttackDefinition(0.0,                         0.0, period, (1.0 - effCrit) * (1.0 - h)),
      ];
    } else if (tpf > 0 && taProc) {
      if (taCritProc) {
        // Fury active: TA proc can crit (independent of normal crit roll)
        attacks = [
          createAttackDefinition(taCritAvg,  0.0, period, effCrit * tpf),
          createAttackDefinition(critAvg,     0.0, period, effCrit * (1.0 - tpf)),
          createAttackDefinition(taAvg,       0.0, period, (1.0 - effCrit) * tpf * h),
          createAttackDefinition(0.0,         0.0, period, (1.0 - effCrit) * tpf * (1.0 - h)),
          createAttackDefinition(normalAvg,   0.0, period, (1.0 - effCrit) * (1.0 - tpf) * h),
          createAttackDefinition(0.0,         0.0, period, (1.0 - effCrit) * (1.0 - tpf) * (1.0 - h)),
        ];
      } else {
        // No Fury: TA can't crit; crits happen only on non-proc swings
        attacks = [
          createAttackDefinition(critAvg,     0.0, period, effCrit),
          createAttackDefinition(taAvg,       0.0, period, (1.0 - effCrit) * tpf * h),
          createAttackDefinition(0.0,         0.0, period, (1.0 - effCrit) * tpf * (1.0 - h)),
          createAttackDefinition(normalAvg,   0.0, period, (1.0 - effCrit) * (1.0 - tpf) * h),
          createAttackDefinition(0.0,         0.0, period, (1.0 - effCrit) * (1.0 - tpf) * (1.0 - h)),
        ];
      }
    } else if (procFrac > 0) {
      attacks = [
        createAttackDefinition(normalAvg, 0.0, period, (1.0 - effCrit) * h * (1.0 - procFrac)),
        createAttackDefinition(normalAvg * 2, 0.0, period, (1.0 - effCrit) * h * procFrac),
        createAttackDefinition(0.0, 0.0, period, (1.0 - effCrit) * (1.0 - h)),
        createAttackDefinition(critAvg, 0.0, period, effCrit),
      ];
    } else {
      attacks = [
        createAttackDefinition(normalAvg, 0.0, period, (1.0 - effCrit) * h),
        createAttackDefinition(0.0, 0.0, period, (1.0 - effCrit) * (1.0 - h)),
        createAttackDefinition(critAvg, 0.0, period, effCrit),
      ];
    }

    if (katarProcChance > 0 && katarSecond) {
      const kpf = katarProcChance / 100;
      attacks.push(createAttackDefinition(katarSecond.avg_damage, 0.0, period, kpf * (1.0 - effCrit) * h));
      if (katarSecondCrit) attacks.push(createAttackDefinition(katarSecondCrit.avg_damage, 0.0, period, kpf * effCrit));
    }

    // PS Auto Spell (Hindsight): flat 30% autocast on this physical attack (hit
    // or miss), Sage/Professor only. The autocast is an independent extra spell
    // that rides on the swing — its expected value folds into DPS with no added
    // attack time (post_delay 0), and the per-proc magic damage is surfaced as a
    // proc branch for the breakdown. Levels 9-10 (Stone Curse / Safety Wall) map
    // to no damaging cast, so _runAutoSpellBranch returns null and nothing shows.
    let autoSpellBranch = null, autoSpellChance = 0, autoSpellLabel = "";
    const autoSpellLv = Number(build.support_buffs?.auto_spell_lv || 0);
    if (
      autoSpellLv >= 1 && autoSpellLv <= 10 &&
      profile.mechanic_flags.has("SA_AUTOSPELL_PS") &&
      (build.job_id === 16 || build.job_id === 4017)
    ) {
      autoSpellBranch = this._runAutoSpellBranch(status, weapon, target, build, { profile, gear_bonuses: gearBonuses }, autoSpellLv);
      if (autoSpellBranch) {
        autoSpellChance = AUTO_SPELL_PROC_CHANCE;
        autoSpellLabel = (AUTO_SPELL_MAP[autoSpellLv] || {}).label || "";
        attacks.push(createAttackDefinition(autoSpellBranch.avg_damage, 0.0, 0.0, autoSpellChance / 100.0));
      }
    }

    const dps = calculateDps(attacks);

    return createBattleResult({
      normal,
      crit,
      crit_chance: critChance,
      hit_chance: hitChance,
      perfect_dodge: perfectDodge,
      dps,
      attacks,
      period_ms: period,
      dps_valid: dpsValid,
      proc_chance: procChance,
      double_hit: procFrac > 0 ? normal : null,
      katar_second: katarSecond,
      katar_second_crit: katarSecondCrit,
      katar_proc_chance: katarProcChance,
      ta_proc: taProc,
      ta_crit_proc: taCritProc,
      ta_proc_chance: taProcChance,
      proc_branches: autoSpellBranch ? { autospell: autoSpellBranch } : {},
      proc_chances: autoSpellBranch ? { autospell: autoSpellChance } : {},
      proc_labels: autoSpellBranch ? { autospell: autoSpellLabel } : {},
      dw_lh_normal:    dualWield ? dualWield.lhNormal        : null,
      dw_lh_crit:      dualWield ? dualWield.lhCrit          : null,
      dw_rh_factor:    dualWield ? dualWield.rhFactor         : null,
      dw_lh_factor:    dualWield ? dualWield.lhFactor         : null,
      dw_ps_bonus_pct: dualWield ? dualWield.dw_ps_bonus_pct : null,
    });
  }
}

module.exports = { BattlePipeline, resolveIsRanged, BF_MAGIC_RATIOS, TRAP_SKILL_NAMES };
