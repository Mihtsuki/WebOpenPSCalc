/**
 * refineFix.js — JS port of core/calculators/modifiers/refine_fix.py
 * Adds the deterministic refine bonus (atk2) after defense.
 */
const { loader } = require("../../dataLoader");
const { addFlat, pmfStats } = require("../../pmf");

// Hercules excludes the post-DEF refine atk2 for these two skills (battle.c:5372).
// Keyed by name — NOT id — because the numeric ids drifted (263/264 are actually
// MO_TRIPLEATTACK/MO_BODYRELOCATION here; Investigate/Asura are 266/271), which
// previously suppressed refine on the wrong skills. masteryFix/defenseFix also key by name.
const REFINE_SKIP_SKILLS = new Set(["MO_INVESTIGATE", "MO_EXTREMITYFIST"]);

// A no-op step still has to report the RUNNING TOTAL (unchanged) — the frontend
// derives its +/− connector badge from the difference against the previous step,
// so a literal 0 here rendered as a huge negative on every unrefined weapon.
function noChangeStep(pmf, result, note) {
  const [mn, mx, av] = pmfStats(pmf);
  result.add_step({ name: "Refine Bonus", value: av, min_value: mn, max_value: mx, multiplier: 1.0, note, formula: "atk2 = 0", hercules_ref: "battle.c:5803-5805" });
  return pmf;
}

function calculateRefineFix(weapon, skill, pmf, result) {
  if (REFINE_SKIP_SKILLS.has(skill.name)) {
    return noChangeStep(pmf, result, "Suppressed for MO_INVESTIGATE/MO_EXTREMITYFIST");
  }

  const refineBonus = loader.getRefineBonus(weapon.level, weapon.refine);
  if (refineBonus === 0) {
    return noChangeStep(pmf, result, "No refine bonus");
  }

  pmf = addFlat(pmf, refineBonus);
  const [mn, mx, av] = pmfStats(pmf);
  result.add_step({
    name: "Refine Bonus", value: av, min_value: mn, max_value: mx,
    note: `+${weapon.refine} refine on Lv ${weapon.level} weapon → flat +${refineBonus}`,
    formula: `damage + atk2(${refineBonus})`, hercules_ref: "battle.c:5797-5805",
  });
  return pmf;
}

module.exports = { calculateRefineFix };
