/**
 * falconCalc.js — Blitz Beat / auto-blitz damage for Hunter and Sniper.
 *
 * PS formula (wiki.payonstories.com/Blitz_Beat):
 *   per hit = (LUK + floor(INT / 2) + Steel_Crow_lv × 6 + 20) × 2
 *
 * The attack is neutral element, bypasses DEF, and is affected by the target's
 * elemental weakness.  Size modifiers are NOT applied (the falcon attack does not
 * go through the normal weapon-type size table in eAthena/Hercules pre-renewal).
 *
 * The attacker's OFFENSIVE card bonuses (bAddRace, and the RC_Boss/RC_NonBoss
 * boss bonus) do NOT apply.  Blitz Beat is BF_MISC — skills.json types it
 * `attack_type: "Misc"`, and Hercules computes it in `battle_calc_misc_attack`.
 * `battle_calc_cardfix`'s `case BF_MISC` (battle.c:1354) has ONLY a `tsd` block —
 * the defender's reductions.  Unlike `case BF_WEAPON`, it has no attacker-side
 * (`sd`) branch at all, so `right_weapon.addrace[...]` never touches Misc damage.
 * This engine used to apply them, which doubled the falcon on a bow build wearing
 * 4× Abysmal Knight Card (+25% vs Boss each) against a boss.
 */

const HUNTER_JOB_IDS = new Set([11, 4012]);

/**
 * Returns a FalconResult or null when not applicable.
 *
 * @param {object} status    — computed status (int_, luk, …)
 * @param {object} build     — raw build object (job_id, mastery_levels)
 * @param {object} gearBonuses — aggregated gear bonuses (effective_mastery)
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

  // Neutral element (0) vs target's element. This is the only target-dependent
  // term — see the header note on why attacker card bonuses do not apply.
  const elemRatio = loader.getAttrFixMultiplier(0, target.element, target.element_level) / 100;
  const perHit = Math.floor(base * elemRatio);

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
