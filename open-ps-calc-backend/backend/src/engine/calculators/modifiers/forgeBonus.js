/**
 * forgeBonus.js — JS port of core/calculators/modifiers/forge_bonus.py
 * Forged weapon star crumb ATK bonus, applied after AttrFix and before CardFix.
 */
const { pmfStats } = require("../../pmf");

// Monk line that gets the Call Spirits sphere ATK bonus (Monk 15, Champion 4016).
const MONK_LINE_JOBS = new Set([15, 4016]);
const GUNSLINGER_JOB = 24;

function calculateForgeBonus(weapon, div, pmf, result) {
  const sc = weapon.forge_sc_count;
  if (sc === 0 && !weapon.forge_ranked) return pmf;

  let star = sc * 5;
  if (star >= 15) star = 40;
  if (weapon.forge_ranked) star += 10;
  if (star === 0) return pmf;

  const flat = star * div;
  const outPmf = {};
  for (const [k, v] of Object.entries(pmf)) outPmf[Number(k) + flat] = v;

  const [mn, mx, av] = pmfStats(outPmf);
  result.add_step({
    name: "Forge Bonus", value: av, min_value: mn, max_value: mx,
    note: `${sc} crumb(s)${weapon.forge_ranked ? "+ Ranked" : ""} → star=${star}, ×div${div} = +${flat} flat`,
    formula: `star(${star}) × div(${div}) = +${flat}`,
    hercules_ref: "status.c:1634-1643; battle.c:5864",
  });
  return outPmf;
}

/**
 * Spirit-ball ATK bonus — Monk spheres AND Gunslinger coins. PS wiki: each grants +3 ATK
 * "similar to forged weapons imbued with Star Crumb" — a flat, per-hit add that
 * ignores enemy DEF & flee, is affected by cards but not elements. So it's applied
 * at the same pipeline position as the Star Crumb forge bonus (after AttrFix/DEF,
 * before CardFix), NOT folded into base ATK (which would wrongly scale it by the
 * skill ratio and, on Asura, by ×(8+SP/10)). Vanilla Hercules applies it as
 * ATK_ADD(div * spiritball * 3) right next to the Star Crumb add (battle.c:5439-5441).
 * `div` is the skill's hit count (Finger Offensive throws N ⇒ div=N; most skills div=1).
 *
 * GUNSLINGER COINS COUNT TOO, and this is checked against source rather than assumed:
 *   - `skill.c` `case GS_GLITTERING:` (Flip the Coin) calls
 *     `pc->addspiritball(sd, ..., 10)` — coins ARE `sd->spiritball`, and that 10 is
 *     where the coin cap comes from.
 *   - `battle.c` `ATK_ADD(wd.div_ * sd->spiritball * 3)`, inside `#ifndef RENEWAL`
 *     (PS is pre-renewal), sits immediately beside the Star Crumb `ATK_ADD2` and
 *     immediately before `battle->calc_cardfix`. That single line is the authority for
 *     all four properties: +3 each, MULTIPLIED BY THE HIT COUNT, at the Star Crumb
 *     position (so past DEF), and affected by cards. It carries no job check.
 * PS keeps it: the wiki's Gunslinger page says "Each coin adds +3 dmg to your attacks",
 * and the Flip Coin page notes coins are "similar to monk spirits". (The Monk side is
 * separately spelled out on Call Spirits: "+3 ATK that ignores enemy defense and flee",
 * "affected by cards but not by elements" — which is the same behaviour.)
 * The bonus used to be gated to the Monk line, so a Gunslinger's coins did nothing at
 * all: holding 10 was worth +30 ATK per hit and the calculator showed no change.
 * Reported by a player.
 */
function ballCount(build) {
  if (MONK_LINE_JOBS.has(build.job_id)) {
    return { n: Math.max(0, Math.min(15, build.spirit_spheres || 0)), label: "sphere" };
  }
  if (build.job_id === GUNSLINGER_JOB) {
    return { n: Math.max(0, Math.min(10, build.gs_coins || 0)), label: "coin" };
  }
  return { n: 0, label: "sphere" };
}

function calculateSpiritSphereBonus(build, div, pmf, result) {
  const { n, label } = ballCount(build);
  if (n <= 0) return pmf;

  const flat = n * 3 * div;
  const outPmf = {};
  for (const [k, v] of Object.entries(pmf)) outPmf[Number(k) + flat] = v;

  const [mn, mx, av] = pmfStats(outPmf);
  result.add_step({
    name: label === "coin" ? "Coin Bonus" : "Spirit Sphere Bonus",
    value: av, min_value: mn, max_value: mx,
    note: `${n} ${label}${n === 1 ? "" : "s"} × 3 ATK × div${div} = +${flat} flat (Star Crumb-like; ignores DEF/flee)`,
    formula: `${label}s(${n}) × 3 × div(${div}) = +${flat}`,
    hercules_ref: label === "coin"
      ? "battle.c ATK_ADD(div*spiritball*3) + skill.c GS_GLITTERING; wiki.payonstories.com/Gunslinger"
      : "battle.c ATK_ADD(div*spiritball*3); wiki.payonstories.com/Call_Spirits",
  });
  return outPmf;
}

module.exports = { calculateForgeBonus, calculateSpiritSphereBonus };
