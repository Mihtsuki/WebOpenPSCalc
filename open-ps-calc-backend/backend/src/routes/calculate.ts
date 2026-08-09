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
// count and %-ratio so the incoming pipeline can price it. Ratio precedence
// mirrors the OUTGOING pipeline so a mob's cast is priced with the same numbers
// the player's own cast would be:
//   1. PS profile ratio (profile.weapon_ratios / magic_ratios) — the PS-reworked
//      value; ACCURATE (estimated:false). Also covers PS-only skills the vanilla
//      maps lack (Lord of Vermilion, Fire Pillar).
//   2. vanilla BF_WEAPON_RATIOS / BF_MAGIC_RATIOS — accurate only where PS is
//      confirmed to match vanilla (the *_vanilla_ok sets); otherwise flagged
//      estimated:true, same as the outgoing "PS unaudited" warning.
//   3. monster-native NPC_* skills — from mobSkillRatios (Hercules baseline);
//      ESTIMATES (estimated:true), PS may tune beyond them.
//   4. status/drain skills that deal no HP damage -> hasNumber:false, damageType
//      "status" (shown as "no direct damage").
//   5. flat/special damage skills that don't fit ratio×ATK (Dark Breath) ->
//      hasNumber:false, damageType "damage" (element/type only).
// Monster-clone names (MS_/ML_/MA_) are resolved through MOB_SKILL_ALIASES to
// their canonical player skill for the ratio/hit lookups.
const { MOB_SKILL_RATIOS, NO_HP_DAMAGE_SKILLS, FLAT_UNMODELED_SKILLS, MOB_SKILL_ALIASES } = require("../engine/mobSkillRatios");
const ELE_NAME_TO_INT: Record<string, number> = {
  Ele_Neutral: 0, Ele_Water: 1, Ele_Earth: 2, Ele_Fire: 3, Ele_Wind: 4,
  Ele_Poison: 5, Ele_Holy: 6, Ele_Dark: 7, Ele_Ghost: 8, Ele_Undead: 9,
};
function resolveMobSkillDamage(skillId: number, level: number, profile: any, mob: any) {
  const sk = (loader as any).getSkill(skillId);
  if (!sk) return null;
  const lv = Math.max(1, Math.min(level || 1, sk.max_level || 10));
  const attackType: string = sk.attack_type; // "Magic" | "Weapon" | "Misc"
  const eleName = Array.isArray(sk.element) ? sk.element[lv - 1] : sk.element;
  const elementInt = ELE_NAME_TO_INT[eleName] ?? 0;
  const targetsFoe = Array.isArray(sk.skill_type)
    ? sk.skill_type.some((t: string) => t === "Enemy" || t === "Place")
    : true;
  const name: string = sk.name;

  // Monster-clone skills (MS_/ML_/MA_) alias onto the canonical player skill for
  // ratio/hit lookup; the display name / element / target keep the mob-skill entry.
  const ratioName: string = MOB_SKILL_ALIASES[name] || name;

  // The ratio/hit-count fns were written for the outgoing direction (their `tgt`
  // is the skill's target). Here the mob's target is the player: Medium size,
  // Neutral, DemiHuman PC — so size/element/race-dependent fns (Pierce's div_,
  // Magnus's race check) resolve against the player. ctx carries the CASTER
  // (mob) stats a few ratio fns read (base_level/str/dex for the ATK/base-level
  // scalers); `skill_levels` is empty because a mob caster's own skill ranks
  // (e.g. Fire Pillar reading Fire Wall) are unknown, so those secondary bonuses
  // default to 0.
  const playerTgt = { size: "Medium", element: 0, race: "DemiHuman", is_pc: true };
  const mobStats = (mob && mob.stats) || {};
  const ctx = {
    skill_levels: {}, skill_params: {},
    base_level: mob ? mob.level || 0 : 0,
    base_str: mobStats.str || 0,
    dex: mobStats.dex || 0,
  };

  // A number is only meaningful for a foe-targeting physical/magic skill.
  const isAttack = targetsFoe && (attackType === "Magic" || attackType === "Weapon");
  let ratio = 100, hasNumber = false, estimated = false;
  let damageType: "damage" | "status" = isAttack ? "damage" : "status";

  if (NO_HP_DAMAGE_SKILLS.has(name)) {
    damageType = "status";
  } else if (isAttack) {
    const isMagic = attackType === "Magic";
    const psMap = (isMagic ? profile?.magic_ratios : profile?.weapon_ratios) || {};
    const bfMap = isMagic ? BF_MAGIC_RATIOS : BF_WEAPON_RATIOS;
    const vanillaOk: Set<string> = (isMagic ? profile?.magic_vanilla_ok : profile?.weapon_vanilla_ok) || new Set();
    try {
      if (typeof psMap[ratioName] === "function") {
        ratio = psMap[ratioName](lv, playerTgt, ctx); hasNumber = true; estimated = false;
      } else if (typeof bfMap[ratioName] === "function") {
        ratio = bfMap[ratioName](lv, playerTgt, ctx); hasNumber = true;
        // Vanilla ratio is only trustworthy where PS is confirmed to match it.
        estimated = !vanillaOk.has(ratioName);
      } else if (typeof MOB_SKILL_RATIOS[ratioName] === "function") {
        ratio = MOB_SKILL_RATIOS[ratioName](lv); hasNumber = true; estimated = true;
      } else if (FLAT_UNMODELED_SKILLS.has(name)) {
        damageType = "damage"; // it hurts, we just can't price it as a ratio
      }
    } catch { hasNumber = false; }
    // A ratio fn reading a ctx field we don't supply could yield NaN/Infinity —
    // never surface that as a number; fall back to element/type only.
    if (hasNumber && !Number.isFinite(ratio)) { hasNumber = false; ratio = 100; }
  }

  // Hit count mirrors the outgoing pipeline: a PS profile hit-count fn overrides
  // the skills.json number_of_hits (which is sometimes wrong for PS multi-hit
  // reworks and, importantly, encodes size-based counts like Pierce). A NEGATIVE
  // number_of_hits is a cosmetic multi-hit (damage applied once) -> 1, NOT its
  // absolute value — the PS "total ratio" skills (Vermilion −10, Fire Pillar −N)
  // already fold every wave into the ratio, so multiplying would double-count.
  let hits = 1;
  const psHitMap = (attackType === "Magic" ? profile?.magic_hit_counts : profile?.weapon_hit_counts) || {};
  if (typeof psHitMap[ratioName] === "function") {
    const h = psHitMap[ratioName](lv, playerTgt, ctx);
    hits = h && typeof h === "object" ? Number(h.max) || 1 : Number(h) || 1;
  } else {
    const hitsRaw = Array.isArray(sk.number_of_hits) ? sk.number_of_hits[lv - 1] : sk.number_of_hits;
    const n = Number(hitsRaw) || 1;
    hits = n > 0 ? n : 1; // negative = cosmetic multi-hit -> single damage instance
  }
  hits = Math.max(1, hits);

  return { name, desc: sk.description || name, attackType, elementInt, hits, ratio, hasNumber, estimated, damageType, level: lv };
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
      // Burning (PS, Burning 2026-08-09 PDF): a 5-second stacking debuff — the
      // Alchemist's Remote Detonator applies 5 stacks at once with a Marine Sphere
      // Bottle. Each stack cuts the target's HARD MDEF by 2 (raising every magic hit
      // you land while it is up) and ticks 60 Fire magic damage per second. Only the
      // MDEF cut belongs in the damage pipeline; the tick is reported separately
      // because it is the Burning's own damage, not the player's attack.
      const burnStacks = Math.max(0, Math.min(
        (profile.burning?.max_stacks ?? 5),
        Number(targetModsInput.burning) || 0,
      ));
      if (burnStacks > 0) {
        const perStack = profile.burning?.mdef_per_stack ?? 2;
        target.mdef_ = Math.max(0, target.mdef_ - perStack * burnStacks);
      }
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
    // Zeny Pincher (PS_BS_ZENYPINCHER, Blacksmith toggle): halves Mammonite's
    // per-level term (100 + 25×lv instead of 100 + 50×lv) and removes its zeny cost.
    // The profile's MC_MAMMONITE ratio fn reads this skill_param.
    if (effBuild.active_status_levels?.SC_PS_ZENYPINCHER) {
      effBuild.skill_params = { ...(effBuild.skill_params || {}), PS_BS_ZENYPINCHER_active: true };
    }
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
      const spec = resolveMobSkillDamage(Number(mobSkill.id), Number(mobSkill.level) || 1, profile, mob);
      if (!spec) return res.status(404).json({ error: "Skill not found" });
      if (!spec.hasNumber) {
        // Status/support (damageType "status") or a damage skill we can't price
        // as a ratio (damageType "damage", e.g. Dark Breath) — no number, but the
        // UI still shows element/type for the latter.
        return res.json({ status, mob, skill: spec, result: null, modeled: false });
      }
      // Multi-hit skills: the ratio is per hit; scale the priced hit by the count.
      const skOpts = { ele_override: spec.elementInt, ratio_override: spec.ratio };
      let result = spec.attackType === "Magic"
        ? calculateIncomingMagicDamage(mobId, effBuild, status, gearBonuses, weapon, skOpts)
        : calculateIncomingPhysicalDamage(mobId, effBuild, status, gearBonuses, weapon, config, skOpts);
      if (spec.hits > 1) {
        result = scaleDamageResult(result, spec.hits, `${spec.hits} hits`, `${spec.name} hits ${spec.hits}×`, "");
      }
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

    res.json({
      str_: gb.str_, agi: gb.agi, vit: gb.vit, int_: gb.int_, dex: gb.dex, luk: gb.luk,
      // The AGI/DEX that Improve Concentration must NOT scale (cards + card combos +
      // pets — the engine's from_cards pool). Lets the client stat display compute
      // IC on the same base the engine does (statusCalculator.js).
      ic_excluded_agi: gb.from_cards ? gb.from_cards.agi : 0,
      ic_excluded_dex: gb.from_cards ? gb.from_cards.dex : 0,
    });
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
  const statusWith = (dAgi: number, dDex: number, dInt = 0) =>
    new StatusCalculator(config).calculate(
      { ...eff, bonus_agi: eff.bonus_agi + dAgi, bonus_dex: eff.bonus_dex + dDex, bonus_int: (eff.bonus_int || 0) + dInt },
      weapon,
      gb
    );

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

  // INT: pre-renewal MATK = INT + floor(INT/5)² (max) / INT + floor(INT/7)² (min),
  // so the bonus term steps up at every multiple of 5 (max) and 7 (min) — the
  // classic caster "INT breakpoints", and the jump grows each time. SP natural
  // regen also steps with INT (every ~6, plus a big jump at 120). Both come
  // straight from statusCalculator, so we read them off the same bump-and-recalc
  // sim. Only surfaced when there's real INT investment (casters / hybrids).
  let intBp:
    | {
        matk_min: number;
        matk_max: number;
        current_int: number;
        max_jumps: { plus: number; int: number; matk_max: number }[];
        min_jumps: { plus: number; int: number; matk_min: number }[];
        sp_regen: number;
        sp_jumps: { plus: number; int: number; sp_regen: number }[];
      }
    | null = null;
  const curInt = Math.round(Number(status.int_));
  if (curInt >= 10) {
    // MATK breakpoints step with INT: max MATK = INT + ⌊INT/5⌋² jumps at every
    // multiple of 5, min MATK = INT + ⌊INT/7⌋² jumps at every multiple of 7 — and
    // both jumps grow each time. Surfaced separately. The trigger is the INT value
    // (exact regardless of any MATK% gear multipliers); the resulting min/max are
    // read from the real sim so they include those multipliers.
    const jumpsFor = <T extends object>(mod: number, read: (s: any) => T) => {
      const out: ({ plus: number; int: number } & T)[] = [];
      for (let k = 1; k <= 210 && out.length < 3; k++) {
        const iv = curInt + k;
        if (iv % mod === 0) out.push({ plus: k, int: iv, ...read(statusWith(0, 0, k)) });
      }
      return out;
    };
    const max_jumps = jumpsFor(5, (s) => ({ matk_max: Number(s.matk_max) }));
    const min_jumps = jumpsFor(7, (s) => ({ matk_min: Number(s.matk_min) }));
    // SP-regen steps are driven by both floor(INT/6) and MaxSP (which also grows
    // with INT), plus the INT≥120 jump — no single modulus, so detect by value.
    const sp_jumps: { plus: number; int: number; sp_regen: number }[] = [];
    let prevSp = Number(status.sp_regen);
    for (let k = 1; k <= 200 && sp_jumps.length < 2; k++) {
      const sp = Number(statusWith(0, 0, k).sp_regen);
      if (sp > prevSp) { sp_jumps.push({ plus: k, int: curInt + k, sp_regen: sp }); prevSp = sp; }
    }
    intBp = {
      matk_min: Number(status.matk_min),
      matk_max: Number(status.matk_max),
      current_int: curInt,
      max_jumps,
      min_jumps,
      sp_regen: Number(status.sp_regen),
      sp_jumps,
    };
  }

  return { aspd, cast, hit, int: intBp };
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
