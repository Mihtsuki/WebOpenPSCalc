import { Router, Request, Response } from "express";
const { logCalculate, logFeature, logDonateClick, logPageView } = require("../middleware/statsLogger");
import { createBattleConfig } from "../engine/config";
import { buildFromSaveSchema } from "../engine/buildManager";
import { createSkillInstance, createTarget } from "../engine/models";
import { loader } from "../engine/dataLoader";
import { getProfile } from "../engine/serverProfiles";
import { resolvePlayerState } from "../engine/playerStateBuilder";
import { BattlePipeline, BF_MAGIC_RATIOS } from "../engine/calculators/battlePipeline";
import { calculateIncomingPhysicalDamage, calculateIncomingMagicDamage } from "../engine/calculators/incomingPipeline";
const { BF_WEAPON_RATIOS } = require("../engine/calculators/modifiers/skillRatio");
const { StatusCalculator } = require("../engine/calculators/statusCalculator");
const { calculateSkillTiming } = require("../engine/calculators/skillTiming");
const { calculateHitChance } = require("../engine/calculators/modifiers/hitChance");

// A monster casting a player/NPC skill at YOU. Resolve the skill's element, hit
// count and %-ratio (from the engine's ratio maps) so the incoming pipeline can
// price it. Only Magic/Weapon skills deal modellable damage; Misc/support (heals,
// summons, ailments) return modeled:false so the UI lists them without a number.
const ELE_NAME_TO_INT: Record<string, number> = {
  Ele_Neutral: 0, Ele_Water: 1, Ele_Earth: 2, Ele_Fire: 3, Ele_Wind: 4,
  Ele_Poison: 5, Ele_Holy: 6, Ele_Dark: 7, Ele_Ghost: 8, Ele_Undead: 9,
};
function resolveMobSkillDamage(skillId: number, level: number) {
  const sk = (loader as any).getSkill(skillId);
  if (!sk) return null;
  const lv = Math.max(1, Math.min(level || 1, sk.max_level || 10));
  const attackType: string = sk.attack_type; // "Magic" | "Weapon" | "Misc"
  const eleName = Array.isArray(sk.element) ? sk.element[lv - 1] : sk.element;
  const elementInt = ELE_NAME_TO_INT[eleName] ?? 0;
  const hitsRaw = Array.isArray(sk.number_of_hits) ? sk.number_of_hits[lv - 1] : sk.number_of_hits;
  const hits = Math.max(1, Math.abs(Number(hitsRaw) || 1));
  const targetsFoe = Array.isArray(sk.skill_type)
    ? sk.skill_type.some((t: string) => t === "Enemy" || t === "Place")
    : true;
  let ratio = 100, ratioKnown = false;
  try {
    const map = attackType === "Magic" ? BF_MAGIC_RATIOS : attackType === "Weapon" ? BF_WEAPON_RATIOS : null;
    if (map && typeof map[sk.name] === "function") { ratio = map[sk.name](lv, {}, {}); ratioKnown = true; }
  } catch { ratio = 100; ratioKnown = false; }
  const modeled = targetsFoe && (attackType === "Magic" || attackType === "Weapon");
  return { name: sk.name, desc: sk.description || sk.name, attackType, elementInt, hits, ratio, ratioKnown, modeled, level: lv };
}
const gearBonusAggregator = require("../engine/gearBonusAggregator");
const { applyPetBonuses } = require("../engine/buildApplicator");
const { computeFalconDamage } = require("../engine/calculators/falconCalc");

const router = Router();

function scaleDamageResult(r: any, mult: number, stepName: string, note: string, ref: string): any {
  if (!r) return r;
  const newMin = Math.floor(r.min_damage * mult);
  const newMax = Math.floor(r.max_damage * mult);
  const newAvg = Math.floor(r.avg_damage * mult);
  const newPmf: Record<string, number> = {};
  for (const [k, p] of Object.entries(r.pmf as Record<string, number> || {})) {
    const newKey = String(Math.floor(Number(k) * mult));
    newPmf[newKey] = (newPmf[newKey] || 0) + (p as number);
  }
  r.min_damage = newMin;
  r.max_damage = newMax;
  r.avg_damage = newAvg;
  r.pmf = newPmf;
  if (Array.isArray(r.steps)) {
    r.steps.push({
      name: stepName,
      value: newAvg,
      min_value: newMin,
      max_value: newMax,
      multiplier: mult,
      note,
      formula: `damage × ${mult}`,
      hercules_ref: ref,
    });
  }
  return r;
}

// Post-calc multiplicative damage bonuses (Lex Aeterna ×2, Venom Dust +10%).
// Applied to every damage branch. `scaleDps` also scales the DPS — true for
// per-hit debuffs (they affect every swing), false for one-time openers like the
// Cloak initiative bonus, which only boost the first hit, not sustained DPS.
function applyResultMult(br: any, mult: number, stepName: string, note: string, ref: string, scaleDps = true): void {
  const branches = [
    "normal", "crit", "magic", "katar_second", "katar_second_crit",
    "double_hit", "double_hit_crit", "second_hit", "second_hit_crit",
    "lh_normal", "lh_crit", "dw_lh_normal", "dw_lh_crit",
  ];
  for (const b of branches) br[b] = scaleDamageResult(br[b], mult, stepName, note, ref);
  for (const key of Object.keys(br.proc_branches || {})) {
    br.proc_branches[key] = scaleDamageResult(br.proc_branches[key], mult, stepName, note, ref);
  }
  if (scaleDps) br.dps = br.dps * mult;
}

function applyLexAeterna(br: any): void {
  applyResultMult(br, 2.0, "Lex Aeterna", "×2 damage (SC_LEXAETERNA)", "battle.c: battle_calc_damage (SC_LEXAETERNA)");
}

// Venom Dust (PS Assassin rework): a target standing on Venom Dust takes +10%
// physical and magical damage for 5s (the "Mailbreaker" debuff). Works on
// MVP/boss-flagged monsters. wiki.payonstories.com / Assassin Rework doc.
function applyVenomDust(br: any): void {
  applyResultMult(br, 1.1, "Venom Dust", "+10% physical & magical damage taken (Venom Dust / Mailbreaker debuff)", "PS-AssassinRework");
}

// Cloak initiative bonus (PS Assassin rework, requires Cloak Lv3+): breaking Cloak
// with an auto-attack makes that first auto-attack deal ×2 damage; breaking it with
// Sonic Blow makes that cast deal +10%. One-time opener → per-hit only, no DPS scale.
function applyBreakingCloak(br: any, isAutoAttack: boolean, isSonicBlow: boolean): void {
  if (isAutoAttack) {
    applyResultMult(br, 2.0, "Breaking Cloak", "Opening auto-attack out of Cloak (Lv3+) deals ×2 damage", "PS-AssassinRework", false);
  } else if (isSonicBlow) {
    applyResultMult(br, 1.1, "Breaking Cloak", "Sonic Blow out of Cloak (Lv3+) deals +10% damage", "PS-AssassinRework", false);
  }
}

router.post("/", (req: Request, res: Response) => {
  try {
    const { build: buildData, skill: skillInput, target: targetInput, target_mods: targetModsInput } = req.body || {};
    if (!buildData) return res.status(400).json({ error: "build is required" });
    logCalculate(req, buildData?.job_id ?? null, skillInput?.id ?? null, targetInput?.mob_id ?? null);

    const build = buildFromSaveSchema(buildData);
    const profile = getProfile(build.server);
    loader.setProfile(profile);

    const config = createBattleConfig();
    const [gearBonuses, effBuild, weapon, status] = resolvePlayerState(build, config, profile);

    let target;
    if (targetInput && targetInput.mob_id != null) {
      target = loader.getMonster(Number(targetInput.mob_id));
    } else {
      target = createTarget(targetInput || {});
    }

    // Apply target debuffs from target_mods
    if (targetModsInput) {
      const sc: Record<string, boolean> = { ...(target.target_active_scs || {}) };
      // Element status: Frozen/Stone override element + apply an SC; Poison is the
      // real ailment (DEF cut, no element change).
      if (targetModsInput.element_status === "Poison") {
        // Poison ailment: reduces the VIT-based soft DEF by 50% on Payon Stories
        // (25% vanilla) — the wiki: "Defence gained from VIT is reduced by 50%".
        // Soft DEF derives from the target's VIT (defenseFix: def2 = target.vit),
        // so scale VIT; hard DEF, element, and auto-hit are untouched. The HP-drain
        // damage-over-time is surfaced separately (see poison_dot below).
        const poisonVitCut = build.server === "payon_stories" ? 50 : 25;
        target.vit = Math.max(0, Math.floor(target.vit * (100 - poisonVitCut) / 100));
      } else if (targetModsInput.element_status === "Frozen") {
        target.element = 1;
        sc.SC_FREEZE = true;
      } else if (targetModsInput.element_status === "Stone") {
        target.element = 2;
        sc.SC_STONE = true;
      }
      // Elemental Change (Sage: SA_ELEMENTWATER/GROUND/FIRE/WIND) — overrides the
      // target's defensive element to Water/Earth/Fire/Wind at LEVEL 1 (per
      // wiki.payonstories.com/Elemental_Change: "the element level the monster is
      // changed to ... is 1", e.g. Water 1). Does NOT work on MVP/boss monsters.
      // Applied after element_status so an explicit element change wins.
      const ELEMENT_CHANGE_INT: Record<string, number> = { Water: 1, Earth: 2, Fire: 3, Wind: 4 };
      const ecEle = ELEMENT_CHANGE_INT[targetModsInput.element_change as string];
      if (ecEle != null && !target.is_boss) {
        target.element = ecEle;
        target.element_level = 1;
      }
      // Status debuffs
      if (targetModsInput.sleep)  sc.SC_SLEEP  = true;
      if (targetModsInput.stun)   sc.SC_STUN   = true;
      target.target_active_scs = sc;
      // Signum Crucis (PS, AL_CRUCIS): reduces the target's HARD DEF by a
      // level-scaled %. The PS Priest/Acolyte rework capped it at level 5 with the
      // table −14/−23/−32/−41/−50% for Lv1–5, i.e. 5 + 9×lv (−50% at Lv5, the max).
      // Hard-DEF cut only (not def_percent, which would also scale soft DEF); affects
      // Undead-element or Demon-race monsters only. Stacks with Provoke. The toggle
      // assumes Lv5 (max), so the reduction is −50% — the same value the pre-rework
      // Lv10 formula produced, so the checkbox outcome is unchanged.
      if (targetModsInput.signum_crucis && (target.element === 9 || target.race === "Demon")) {
        const signumLv = 5;                    // rework cap = max
        const signumPct = 5 + 9 * signumLv;    // −50% at Lv5
        target.def_ = Math.max(0, target.def_ - Math.floor(target.def_ * signumPct / 100));
      }
      // Provoke cast on the target: DEF −(5 + 5×lv)% (−55% at Lv10), matching
      // the engine's Provoke convention (def_percent scales both hard and soft
      // DEF in defenseFix). Boss-protocol monsters are immune. Accepts a level
      // 1–10; a legacy boolean `true` from older shared links maps to max (10).
      // Only touches the target — separate from a player's self-cast Provoke /
      // Auto Berserk, which lives on the player's own status.
      const provokeLv = targetModsInput.provoke === true ? 10
        : Math.max(0, Math.min(10, Number(targetModsInput.provoke) || 0));
      if (provokeLv > 0 && !target.is_boss) {
        target.def_percent = Math.max(0, (target.def_percent ?? 100) - (5 + 5 * provokeLv));
      }
      // Quagmire (PS, WZ_QUAGMIRE): the marshland cuts the target's AGI and DEX
      // by 10% per level (max 50% at Lv5), which lowers its flee — it does NOT
      // grant auto-hit. Bosses are immune (only their move speed drops, not
      // modelled here); the effect is halved vs players (PvP). Accepts a level
      // 1–5; a legacy boolean `true` from older shared links maps to max (5).
      const quagLv = targetModsInput.quagmire === true ? 5
        : Math.max(0, Math.min(5, Number(targetModsInput.quagmire) || 0));
      if (quagLv > 0 && !target.is_boss) {
        const pct = target.is_pc ? 5 * quagLv : 10 * quagLv;
        const agiCut = Math.floor(target.agi * pct / 100);
        target.agi = Math.max(0, target.agi - agiCut);
        target.dex = Math.max(0, target.dex - Math.floor(target.dex * pct / 100));
        target.flee = Math.max(0, target.flee - agiCut); // 1 AGI ≈ 1 Flee (pre-re)
      }
    }

    const skill = createSkillInstance({
      id: skillInput ? Number(skillInput.id) || 0 : 0,
      level: skillInput ? Math.max(1, Number(skillInput.level) || 1) : 1,
    });

    // Performing (Bard/Dancer): while a song/dance is active, Musical Strike and
    // Throw Arrow gain +100 ratio points (their profile ratio fns read this).
    if (targetModsInput?.performing) {
      effBuild.skill_params = { ...(effBuild.skill_params || {}), PS_PERFORMING_active: true };
    }
    // PS Ninja: casting Shadow Slash (NJ_KIRIKAGE) or Haze Slash (NJ_KASUMIKIRI)
    // from Hiding boosts their ratio — the profile ratio fns read these flags.
    if (effBuild.support_buffs?.ninja_hiding) {
      effBuild.skill_params = { ...(effBuild.skill_params || {}), NJ_KIRIKAGE_hiding: true, NJ_KASUMIKIRI_hiding: true };
    }

    const pipeline = new BattlePipeline(config);
    const battleResult = pipeline.calculate(status, weapon, skill, target, effBuild, gearBonuses);

    if (targetModsInput?.breaking_cloak) {
      const sName = skill.id === 0 ? "" : (loader.getSkill(skill.id)?.name || "");
      applyBreakingCloak(battleResult, skill.id === 0, sName === "AS_SONICBLOW");
    }
    if (targetModsInput?.venom_dust) {
      applyVenomDust(battleResult);
    }
    if (targetModsInput?.lex_aeterna) {
      applyLexAeterna(battleResult);
    }

    const gear_stat_bonuses = {
      str_: gearBonuses.str_, agi: gearBonuses.agi, vit: gearBonuses.vit,
      int_: gearBonuses.int_, dex: gearBonuses.dex, luk: gearBonuses.luk,
    };
    const falcon = computeFalconDamage(status, effBuild, gearBonuses, target, loader);
    res.json({ status, weapon, target, result: battleResult, gear_stat_bonuses, falcon, has_auto_bonuses: gearBonuses.auto_bonuses.length > 0 });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Calculation failed", detail: String(err.message || err) });
  }
});

router.post("/incoming", (req: Request, res: Response) => {
  try {
    const { build: buildData, target: targetInput, direction, opts, mob_skill: mobSkill } = req.body || {};
    if (!buildData) return res.status(400).json({ error: "build is required" });
    if (!targetInput || targetInput.mob_id == null) return res.status(400).json({ error: "target.mob_id is required" });

    const build = buildFromSaveSchema(buildData);
    const profile = getProfile(build.server);
    loader.setProfile(profile);

    const config = createBattleConfig();
    const [gearBonuses, effBuild, weapon, status] = resolvePlayerState(build, config, profile);

    const mobId = Number(targetInput.mob_id);
    const mob = loader.getMonsterData(mobId);
    if (!mob) return res.status(404).json({ error: "Monster not found" });

    // A specific mob skill cast at the player (survivability "which skill hits me").
    if (mobSkill && mobSkill.id != null) {
      const spec = resolveMobSkillDamage(Number(mobSkill.id), Number(mobSkill.level) || 1);
      if (!spec) return res.status(404).json({ error: "Skill not found" });
      if (!spec.modeled) {
        // Support/ailment/summon or unmapped ratio — no direct damage number.
        return res.json({ status, mob, skill: spec, result: null, modeled: false });
      }
      const skOpts = { ele_override: spec.elementInt, ratio_override: spec.ratio };
      const result = spec.attackType === "Magic"
        ? calculateIncomingMagicDamage(mobId, effBuild, status, gearBonuses, weapon, skOpts)
        : calculateIncomingPhysicalDamage(mobId, effBuild, status, gearBonuses, weapon, config, skOpts);
      return res.json({ status, mob, skill: spec, result, modeled: true });
    }

    const result = direction === "magic"
      ? calculateIncomingMagicDamage(mobId, effBuild, status, gearBonuses, weapon, opts || {})
      : calculateIncomingPhysicalDamage(mobId, effBuild, status, gearBonuses, weapon, config, opts || {});

    res.json({ status, weapon, mob, result });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Calculation failed", detail: String(err.message || err) });
  }
});

router.post("/status", (req: Request, res: Response) => {
  try {
    const { build: buildData } = req.body || {};
    if (!buildData) return res.status(400).json({ error: "build is required" });

    const build = buildFromSaveSchema(buildData);
    const profile = getProfile(build.server);
    loader.setProfile(profile);

    const config = createBattleConfig();
    const [gearBonuses, , weapon, status] = resolvePlayerState(build, config, profile);

    res.json({
      max_hp:    status.max_hp,
      max_sp:    status.max_sp,
      hp_regen:  status.hp_regen,
      sp_regen:  status.sp_regen,
      batk:      status.batk,
      weapon_atk: weapon?.atk ?? 0,
      // Flat gear weapon-ATK (bAtk, e.g. Bradium Ring) — added to weapon ATK in the
      // damage pipeline, so it belongs in the ATK readout too.
      weapon_atk_flat: gearBonuses?.weapon_atk_flat ?? 0,
      // Weapon refine bonus (the "atk2" shown as the right-hand number in the
      // in-game status window, e.g. "420 + 35"). Deterministic part only.
      refine_atk: weapon ? loader.getRefineBonus(weapon.level, weapon.refine) : 0,
      matk_min:  status.matk_min,
      matk_max:  status.matk_max,
      hard_def:  status.def_,
      soft_def:  status.def2,
      hard_mdef: status.mdef,
      soft_mdef: status.mdef2,
      aspd:      status.aspd,
      cri:       status.cri,
      flee:      status.flee,
      hit:       status.hit,
    });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Status calculation failed", detail: String(err.message || err) });
  }
});

router.post("/gear-stat-bonuses", (req: Request, res: Response) => {
  try {
    const { build: buildData } = req.body || {};
    if (!buildData) return res.status(400).json({ error: "build is required" });

    const build = buildFromSaveSchema(buildData);
    const profile = getProfile(build.server);
    loader.setProfile(profile);

    const ctx = gearBonusAggregator.scriptCtxFromBuild(build, null);
    const gb = gearBonusAggregator.compute(build.equipped, build.refine_levels, ctx);
    gearBonusAggregator.applyPassiveBonuses(gb, gb.effective_mastery, profile);
    applyPetBonuses(gb, build.selected_pet, profile);
    gearBonusAggregator.applyComboBonuses(gb, build.equipped, profile, ctx);

    res.json({ str_: gb.str_, agi: gb.agi, vit: gb.vit, int_: gb.int_, dex: gb.dex, luk: gb.luk });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Calculation failed", detail: String(err.message || err) });
  }
});

// --- Breakpoints (on-demand) -----------------------------------------------
// "How much more of a stat to cross the next threshold." Computed by SIMULATION:
// bump AGI/DEX on the already-resolved effective build and re-run the status /
// timing / hit code, reading the outputs. This reuses every buff/passive/weapon
// rule verbatim (no formula duplication) and stays consistent with the numbers
// the calculator already shows. Gear is resolved once; only the cheap status
// pass is re-run per increment.
function computeBreakpoints(eff: any, weapon: any, gb: any, status: any, config: any, target: any, skill: any, skillData: any) {
  const statusWith = (dAgi: number, dDex: number) =>
    new StatusCalculator(config).calculate({ ...eff, bonus_agi: eff.bonus_agi + dAgi, bonus_dex: eff.bonus_dex + dDex }, weapon, gb);

  // ASPD: pre-renewal ASPD is continuous (each AGI ≈ +0.2, each DEX ≈ +0.05), so
  // "breakpoints" are the next whole-number ASPD milestones players target — the
  // smallest +AGI (primary; 4× the weight of DEX) or +DEX to reach the next
  // integer ASPD. Stops at the ASPD cap (where more stat no longer helps).
  const aspdBreaks = (which: "agi" | "dex", cap: number, want: number) => {
    const out: { plus: number; aspd: number }[] = [];
    let lastInt = Math.floor(Number(status.aspd));
    for (let k = 1; k <= cap && out.length < want; k++) {
      const a = Number(which === "agi" ? statusWith(k, 0).aspd : statusWith(0, k).aspd);
      if (Math.floor(a) > lastInt) { out.push({ plus: k, aspd: Math.floor(a) }); lastInt = Math.floor(a); }
    }
    return out;
  };
  const aspd = { current: Number(status.aspd), agi: aspdBreaks("agi", 80, 3), dex: aspdBreaks("dex", 160, 2) };

  // Cast: DEX needed to shorten / instant-cast the selected skill (only if it
  // has a variable cast now). castMs is monotonic-decreasing in DEX → binary
  // search. Pre-re cast is linear in DEX (instant at 150 total DEX). Like the
  // ASPD row, we surface the next few breakpoint jumps — the smallest +DEX to
  // reach each of the next round cast-time steps below the current value — plus
  // the instant-cast point.
  let cast:
    | {
        skill: string;
        current_ms: number;
        current_dex: number;
        instant_plus_dex: number | null;
        next_jumps: { plus: number; dex: number; ms: number }[];
      }
    | null = null;
  if (skill && skill.id && skillData) {
    const skillName = skillData.name;
    const castOf = (dDex: number) => calculateSkillTiming(skillName, skill.level, skillData, statusWith(0, dDex), gb, eff.support_buffs, eff.server)[0];
    const currentMs = castOf(0);
    if (currentMs > 0) {
      // Smallest +DEX (within +200, the practical ceiling) for cast ≤ target ms.
      const dexForMs = (targetMs: number): number | null => {
        if (castOf(0) <= targetMs) return 0;
        if (castOf(200) > targetMs) return null; // unreachable
        let lo = 1, hi = 200;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (castOf(mid) <= targetMs) hi = mid; else lo = mid + 1; }
        return lo;
      };
      const instant = dexForMs(0);
      const curDex = Math.round(Number(status.dex));

      // Up to the next 3 round milestones below the current cast (step scaled to
      // magnitude: 1s / 0.5s / 0.1s). Each is only kept when it's a genuine
      // intermediate step — cheaper than going straight to instant — and each
      // distinct +DEX is listed once.
      const step = currentMs >= 2000 ? 1000 : currentMs >= 500 ? 500 : 100;
      const next_jumps: { plus: number; dex: number; ms: number }[] = [];
      const seen = new Set<number>();
      let t = Math.floor((currentMs - 1) / step) * step;
      for (; t > 0 && next_jumps.length < 3; t -= step) {
        const plus = dexForMs(t);
        if (plus == null || plus <= 0 || seen.has(plus)) continue;
        if (instant != null && plus >= instant) break; // reached instant — stop
        seen.add(plus);
        next_jumps.push({ plus, dex: curDex + plus, ms: castOf(plus) });
      }

      cast = { skill: skillName, current_ms: currentMs, current_dex: curDex, instant_plus_dex: instant, next_jumps };
    }
  }

  // HIT: +HIT (= +DEX, 1:1) to reach 95% / 100% hit vs the selected monster.
  // Uses the real hit-chance fn so any skill accuracy bonus (Holy Cross, Shield
  // Chain) is folded in. Only meaningful against a real target that can dodge.
  let hit: { current_pct: number; to95: number | null; to100: number | null } | null = null;
  if (target && Number(target.flee) > 0) {
    const skillName = skillData ? skillData.name : "";
    const rateOf = (dHit: number) => calculateHitChance({ ...status, hit: status.hit + dHit }, target, config, skillName, skill ? skill.level : 1)[0];
    const need = (thresh: number) => { for (let k = 0; k <= 400; k++) if (rateOf(k) >= thresh) return k; return null; };
    hit = { current_pct: Math.round(rateOf(0)), to95: need(95), to100: need(100) };
  }

  return { aspd, cast, hit };
}

router.post("/breakpoints", (req: Request, res: Response) => {
  try {
    const { build: buildData, skill: skillInput, target: targetInput } = req.body || {};
    if (!buildData) return res.status(400).json({ error: "build is required" });

    const build = buildFromSaveSchema(buildData);
    const profile = getProfile(build.server);
    loader.setProfile(profile);
    const config = createBattleConfig();
    const [gearBonuses, effBuild, weapon, status] = resolvePlayerState(build, config, profile);

    let target: any = null;
    if (targetInput && targetInput.mob_id != null) target = loader.getMonster(Number(targetInput.mob_id));
    else if (targetInput) target = createTarget(targetInput);

    const skill = createSkillInstance({
      id: skillInput ? Number(skillInput.id) || 0 : 0,
      level: skillInput ? Math.max(1, Number(skillInput.level) || 1) : 1,
    });
    const skillData = skill.id ? loader.getSkill(skill.id) : null;

    res.json({ breakpoints: computeBreakpoints(effBuild, weapon, gearBonuses, status, config, target, skill, skillData) });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Breakpoints failed", detail: String(err.message || err) });
  }
});

// Tracking beacon. Lives under the proxied /api/calculate prefix (POST /stats/*
// isn't proxied) and behind the API-key gate — the frontend sends the key, which
// also keeps stray bots out. Dispatches to the same loggers as the /stats routes.
router.post("/track", (req: Request, res: Response) => {
  const b = (req.body || {}) as { ev?: string; name?: string; target?: string };
  if (b.ev === "feature") logFeature(req, b.name);
  else if (b.ev === "donate") logDonateClick(req, b.target);
  else if (b.ev === "view") logPageView(req);
  res.json({ ok: true });
});

export default router;
