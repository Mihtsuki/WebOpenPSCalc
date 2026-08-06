/**
 * falconCalc.js — Blitz Beat / auto-blitz damage for Hunter and Sniper.
 *
 * PS formula (wiki.payonstories.com/Blitz_Beat):
 *   per hit = (LUK + floor(INT / 2) + Steel_Crow_lv × 6 + 20) × 2
 *
 * The attack is neutral element, bypasses DEF, and is affected by the
 * target's elemental weakness and the attacker's race/boss damage bonuses
 * from equipment (same as any physical attack).  Size modifiers are NOT
 * applied (the falcon attack does not go through the normal weapon-type size
 * table in eAthena/Hercules pre-renewal).
 */

const RACE_TO_RC = {
  Formless: "RC_Formless", Undead: "RC_Undead", Brute: "RC_Brute",
  Plant: "RC_Plant", Insect: "RC_Insect", Fish: "RC_Fish",
  Demon: "RC_Demon", "Demi-Human": "RC_DemiHuman", Angel: "RC_Angel", Dragon: "RC_Dragon",
};

const HUNTER_JOB_IDS = new Set([11, 4012]);

/**
 * Returns a FalconResult or null when not applicable.
 *
 * @param {object} status    — computed status (int_, luk, …)
 * @param {object} build     — raw build object (job_id, mastery_levels)
 * @param {object} gearBonuses — aggregated gear bonuses (effective_mastery, add_race)
 * @param {object} target    — target object (element, element_level, race, is_boss)
 * @param {object} loader    — dataLoader instance for getAttrFixMultiplier
 */
function computeFalconDamage(status, build, gearBonuses, target, loader) {
  if (!HUNTER_JOB_IDS.has(build.job_id)) return null;

  const mastery = gearBonuses.effective_mastery || build.mastery_levels || {};
  if (!(mastery.HT_FALCON >= 1)) return null;

  const steelCrowLv = mastery.HT_STEELCROW || 0;
  const blitzBeatLv = mastery.HT_BLITZBEAT || 0;

  // Base damage per hit (PS custom formula)
  const base = (status.luk + Math.floor(status.int_ / 2) + steelCrowLv * 6 + 20) * 2;

  // Neutral element (0) vs target's element
  const elemRatio = loader.getAttrFixMultiplier(0, target.element, target.element_level) / 100;
  const afterElem = Math.floor(base * elemRatio);

  // Race + boss bonuses from equipment
  const addRace = gearBonuses.add_race || {};
  const raceRc = RACE_TO_RC[target.race] || "";
  const bossRc = target.is_boss ? "RC_Boss" : "RC_NonBoss";
  const racePct = (addRace[raceRc] || 0) + (addRace[bossRc] || 0);
  const perHit = racePct ? Math.floor(afterElem * (100 + racePct) / 100) : afterElem;

  // Auto Blitz Beat (triggers on a BOW auto-attack): chance = ⌊LUK/3⌋%, hits =
  // min(Blitz Beat level, ⌊job level/10⌋+1) capped at 5 — requires Blitz Beat
  // learned. wiki.payonstories.com/Blitz_Beat.
  const jobLevel = build.job_level || 1;
  const autoBlitzHits = blitzBeatLv >= 1 ? Math.min(blitzBeatLv, Math.floor(jobLevel / 10) + 1, 5) : 0;
  const autoBlitzChance = Math.min(100, Math.floor(status.luk / 3));

  return {
    per_hit:           perHit,
    blitz_beat_lv:     blitzBeatLv,
    steel_crow_lv:     steelCrowLv,
    auto_blitz_hits:   autoBlitzHits,
    auto_blitz_chance: autoBlitzChance,
    auto_blitz_total:  perHit * autoBlitzHits,   // per-hit × actual hit count
    blitz_beat_total:  blitzBeatLv ? perHit * blitzBeatLv : null,
  };
}

module.exports = { computeFalconDamage };
