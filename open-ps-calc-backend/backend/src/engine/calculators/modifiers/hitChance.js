/**
 * hitChance.js — JS port of core/calculators/modifiers/hit_chance.py
 */

// "Accuracy" bonuses. These are a percentage of the (pre-clamp) hitRATE, NOT of
// HIT — PR-Hercules battle.c's "Hit skill modifiers" switch notes "it is proven
// that bonus is applied on final hitrate, not hit". Every source accumulates
// into one `hitpercbonus` that is applied ONCE (battle.c:5363
// `hitrate += hitrate * hitpercbonus / 100`), so two sources add rather than
// compound. PS documents the same mechanic on wiki.payonstories.com/Accuracy
// ("accuracy's increase to hit chance is relative to your overall chance of
// hitting a target") and lists the per-rank values on each skill's page.
// Each entry returns the bonus % for the given skill level.
const SKILL_HITRATE_PCT_BONUS = {
  // wiki.payonstories.com/Holy_Cross — "Accuracy Bonus" column scales with rank:
  // 2/4/6/…/20 at Lv1–10. NB the one-line PS skill-DB description only quotes the
  // max ("This skill has a 20% accuracy bonus") — it is NOT flat 20% per rank.
  // Vanilla RO gives Holy Cross no accuracy bonus at all.
  CR_HOLYCROSS: (lv) => 2 * lv,
  // Shield Chain shares Holy Cross's +20% hitrate (PR-Hercules battle.c groups
  // PA_SHIELDCHAIN with the +20% "Hit skill modifiers" case). The PS skill DB
  // likewise notes accuracy affects its success — vanilla value applies.
  PA_SHIELDCHAIN: () => 20,
  // wiki.payonstories.com/Bash — "Accuracy +5%…+50%", and the page spells the
  // mechanic out: "The Accuracy gained is a percent of your hit rate added to
  // your hit rate." Matches vanilla battle.c (5 × skill_lv).
  SM_BASH: (lv) => 5 * lv,
  // wiki.payonstories.com/Magnum_Break — "Accuracy Bonus 110%…200%" (i.e. ×1.1
  // at Lv1 → ×2.0 at Lv10) = +10% per level, "not to be confused for HIT".
  // Matches vanilla battle.c (10 × skill_lv).
  SM_MAGNUM: (lv) => 10 * lv,
  // wiki.payonstories.com/Pierce — "Accuracy Bonus 5%…50%", added to the hit
  // rate after it is derived from HIT and the target's Flee. Vanilla parity.
  KN_PIERCE: (lv) => 5 * lv,
  // Vanilla battle.c groups Auto Counter with the flat +20% case.
  KN_AUTOCOUNTER: () => 20,
  // wiki.payonstories.com/Sonic_Acceleration settles the conflict flagged in
  // ROADMAP's non-damage-clause punch-list: "Sonic Acceleration does not give a
  // flat +50 Hit … SA gives +50% 'Hit', the Hit actually being Accuracy rate"
  // (worked example: 30% → 45%). That is battle.c's +50 hitpercbonus, not the
  // PS skill DB's "+50 Hit" wording. Assumed learned, mirroring the damage half
  // in skillRatio.js; the same `skill_params` switch turns both off.
  AS_SONICBLOW: (lv, opts) =>
    ((opts.skill_params || {}).AS_SONICBLOW_sonic_accel ?? true) ? 50 : 0,
};

function calculateHitChance(status, target, config, skillName, skillLevel, opts = {}) {
  const targetScs = target.target_active_scs;
  // "Can't-move" statuses make the target unable to evade → guaranteed hit.
  // Quagmire is NOT one of these: it only lowers AGI/DEX (and thus flee),
  // handled as a flee reduction in the calculate route, not as auto-hit.
  if (targetScs.SC_STONE || targetScs.SC_FREEZE || targetScs.SC_STUN || targetScs.SC_SLEEP) {
    return [100.0, 0.0];
  }

  let mobFlee = target.flee > 0 ? target.flee : target.level + target.agi;
  // Blind cuts the blinded unit's HIT and FLEE by 25% (status.c status_calc_flee /
  // status_calc_hit). On the TARGET only the flee half reaches this calculation —
  // its own accuracy never enters your damage — so a blinded monster is easier to
  // land on. Same 25% the player-side blind uses in statusCalculator.js.
  if (targetScs.SC_BLIND) mobFlee = Math.floor((mobFlee * 75) / 100);
  let hitrate = 80 + status.hit - mobFlee;

  // Accuracy bonuses (% of hitrate), summed and applied before the clamp —
  // matches the battle.c ordering (hitrate += hitrate * pct / 100, then
  // cap_value).
  let pctBonus = 0;
  const bonusFn = skillName && SKILL_HITRATE_PCT_BONUS[skillName];
  if (bonusFn) pctBonus += bonusFn(skillLevel || 1, opts);
  // Weaponry Research's "hidden bonus" (battle.c:5355-5357): a passive +2% per
  // level that rides on every attack, skill or not — separate from the +2 HIT
  // and +2 ATK per level applied in statusCalculator/masteryFix.
  // wiki.payonstories.com/Weaponry_Research lists all three columns.
  const wrLv = (opts.mastery || {}).BS_WEAPONRESEARCH || 0;
  if (wrLv > 0) pctBonus += 2 * wrLv;

  if (pctBonus !== 0) hitrate += Math.floor((hitrate * pctBonus) / 100);

  hitrate = Math.max(config.min_hitrate, Math.min(config.max_hitrate, hitrate));

  const flee2 = target.luk + 10;
  const perfectDodgePct = flee2 / 10.0;

  return [hitrate, perfectDodgePct];
}

module.exports = { calculateHitChance, SKILL_HITRATE_PCT_BONUS };
