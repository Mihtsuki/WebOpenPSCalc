/**
 * critChance.js — JS port of core/calculators/modifiers/crit_chance.py
 */
const { getProfile, STANDARD } = require("../../serverProfiles");

const RACE_TO_RC = {
  Formless: "RC_Formless", Undead: "RC_Undead", Brute: "RC_Brute",
  Plant: "RC_Plant", Insect: "RC_Insect", Fish: "RC_Fish",
  Demon: "RC_Demon", "Demi-Human": "RC_DemiHuman", Angel: "RC_Angel", Dragon: "RC_Dragon",
};

const KN_AUTOCOUNTER = 61;

const VANILLA_CRIT_ELIGIBLE = new Set(["KN_AUTOCOUNTER", "SN_SHARPSHOOTING", "MA_SHARPSHOOTING", "NJ_KIRIKAGE"]);
const PS_CRIT_ELIGIBLE = new Set(["AS_SONICBLOW", "AS_GRIMTOOTH", "GS_TRACKING", "PS_PR_HOLYSTRIKE"]);

function isCritEligible(skillId, skillName, server = "standard", furyActive = false, shadowsWithin = false) {
  if (skillId === 0) return true;
  if (getProfile(server) !== STANDARD) {
    // PS Monk rework: Triple Attack can crit while Critical Explosion / Fury
    // (SC_EXPLOSIONSPIRITS) is active. The auto-attack proc path handles its own
    // crit; this covers Triple Attack selected as an active skill.
    if (furyActive && skillName === "MO_TRIPLEATTACK") return true;
    // PS Shadow Slash is the inverse of the vanilla skill: it CANNOT crit on its
    // own. The skill DB is explicit - "Shadow Slash no longer possesses the
    // capability to land critical strikes. However, when paired with the platinum
    // skill Shadow's Within, critical hits become a possibility". So on PS the
    // toggle is the whole gate, and without it there is no crit branch at all.
    if (skillName === "NJ_KIRIKAGE") return !!shadowsWithin;
    return VANILLA_CRIT_ELIGIBLE.has(skillName) || PS_CRIT_ELIGIBLE.has(skillName);
  }
  return VANILLA_CRIT_ELIGIBLE.has(skillName);
}

function calculateCritChance(status, weapon, skill, target, config, server = "standard", gearBonuses = null, furyActive = false, shadowsWithin = false) {
  if (!isCritEligible(skill.id, skill.name, server, furyActive, shadowsWithin)) return [false, 0.0];

  let cri = status.cri;

  // bCriticalAddRace — extra crit vs the target's race / boss group (crit points,
  // stored ×10 like the rest of `cri`). Part of the attacker's crit, so it's also
  // doubled by Katar and reduced by the target's LUK below.
  const car = gearBonuses && gearBonuses.crit_add_race;
  if (car) {
    const raceRc = RACE_TO_RC[target.race] || "";
    const bossRc = target.is_boss ? "RC_Boss" : "RC_NonBoss";
    cri += ((car[raceRc] || 0) + (car[bossRc] || 0) + (car.RC_All || 0)) * 10;
  }

  if (weapon.weapon_type === "Katar") cri <<= 1;

  if (!getProfile(server).mechanic_flags.has("PS_CRIT_SHIELD_DISABLED")) {
    cri -= target.luk * 2;
  }

  if ("SC_SLEEP" in target.target_active_scs) cri <<= 1;

  if (skill.id === KN_AUTOCOUNTER) {
    // Counter Attack (Auto Counter) never misses and always lands a critical.
    return [true, 100.0];
  } else if (skill.name === "SN_SHARPSHOOTING" || skill.name === "MA_SHARPSHOOTING") {
    // Sharp Shooting: +20 crit (×10 internal scale). Keyed by NAME on purpose —
    // the loaded skills.json ids (382 / 8215) differ from the old hardcoded
    // constants (280 / 357), which left this branch dead so the +20 never fired.
    cri += 200;
  }
  // Shadow Slash + Shadow's Within. The bonus is the wiki's "+Crit (%)" column,
  // 30/35/40/45/50 by Shadow Slash level, stored on the same x10 scale as `cri`.
  // It is gated on the toggle because eligibility itself is (see isCritEligible).
  //
  // Long-standing dead code before this: the old branch keyed off skill id 543
  // when the real id is 530, so it never fired, and the replacement was written
  // into the DAMAGE ratio in serverProfiles.js instead - where its 25+5*lv shape
  // gave it away as this crit column wearing the wrong hat.
  //
  // Sources disagree on scaling: the per-level table says 30 -> 50, while the
  // Shadow's Within page and the skill DB both say a flat +50%. They agree at Lv5.
  // The table wins here for being the more specific source; noted, not resolved.
  if (skill.name === "NJ_KIRIKAGE" && shadowsWithin) {
    cri += 250 + 50 * (Number(skill.level) || 1);
  }

  cri = Math.max(config.critical_min, cri);
  const critChance = Math.max(0.0, cri / 10.0);
  return [true, critChance];
}

module.exports = { isCritEligible, calculateCritChance };
