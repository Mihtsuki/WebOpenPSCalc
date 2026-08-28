import { Router, Request, Response } from "express";
const { logCalculate, logFeature, logDonateClick, logPageView } = require("../middleware/statsLogger");
import { createBattleConfig } from "../engine/config";
import { buildFromSaveSchema } from "../engine/buildManager";
import { createSkillInstance, createTarget, createDamageResult } from "../engine/models";
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
const {
  MOB_SKILL_RATIOS, NO_HP_DAMAGE_SKILLS, FLAT_UNMODELED_SKILLS, MOB_SKILL_ALIASES,
  MOB_SKILL_TARGET_STAT_DAMAGE,
} = require("../engine/mobSkillRatios");
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

  // Skills the skill DB flags as ignoring DEF (Asura, Earthquake, Clashing Spiral,
  // Auto Counter…). The outgoing direction already honours this flag; the incoming
  // one has to as well, or the casts that hurt most get priced as if armour applied.
  const ignoreDef = Array.isArray(sk.damage_type) && sk.damage_type.includes("IgnoreDefense");

  // Damage read off the PLAYER's stats rather than the caster's ATK (Dark Breath's
  // % of current HP, Soul Burn's twice-the-SP-burned). No ratio can express these,
  // so they carry their own spec and the caller prices them from `status`.
  const targetStat = MOB_SKILL_TARGET_STAT_DAMAGE[name];
  let targetStatSpec = null;
  if (targetStat && isAttack) {
    const pct = targetStat.pctByLevel ? targetStat.pctByLevel[lv - 1] : null;
    const mult = targetStat.multiplierByLevel ? targetStat.multiplierByLevel[lv - 1] : null;
    // A level that deals no HP damage at all (Soul Burn below Lv5) is a drain, not
    // a hit — say so rather than printing a 0.
    if ((pct != null && pct > 0) || (mult != null && mult > 0)) {
      targetStatSpec = { quantity: targetStat.quantity, pct, mult, chancePct: targetStat.chancePct ?? null, note: targetStat.note };
      // Sourced from kokotewa, not from PS itself — same standing as the pre-renewal
      // baseline ratios, so it carries the same "for testing" tag rather than being
      // presented as a PS-exact figure.
      estimated = true;
    } else {
      damageType = "status";
    }
  }

  return {
    name, desc: sk.description || name, attackType, elementInt, hits, ratio,
    hasNumber: hasNumber || targetStatSpec != null, estimated, damageType, level: lv,
    ignoreDef: ignoreDef || targetStatSpec != null, targetStat: targetStatSpec,
  };
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
// Mailbreaker (PS-custom debuff): the target takes +10% physical AND magical damage.
// Two skills apply it, per their ps_skill_db descriptions — the Assassin's Venom Dust
// ("Mailbreaker debuff is applied to unit standing on venom dust") and Hammer Fall
// ("Applies Mailbreaker(+10% Damage received) effect on target"). It was modelled under
// the Venom Dust name only, so a Blacksmith opening with Hammer Fall had no way to
// price it without ticking a box that named someone else's skill.
function applyMailbreaker(br: any): void {
  applyResultMult(br, 1.1, "Mailbreaker", "+10% physical & magical damage taken (Venom Dust / Hammer Fall)", "PS-AssassinRework");
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
      // Blind: −25% of the target's flee (hitChance.js). Unlike sleep/stun it is not
      // an auto-hit — a blinded monster still evades, just worse. Reachable on a mob
      // via Grizzly Card's Hammerfall clause, a Priest's Lex Divina, or a Sage's
      // Blinding Mist, so it is a status a real build can actually set up.
      if (targetModsInput.blind)  sc.SC_BLIND  = true;
      target.target_active_scs = sc;
      // Offensive Blessing (AL_BLESSING). Cast on an Undead-ELEMENT or Demon-RACE
      // monster, Blessing is a debuff rather than a buff: Hercules sets its val2 to 0
      // for those targets, and status_calc_str/int/dex then take the `else` branch and
      // HALVE each of STR, INT and DEX (`str >>= 1`, an integer shift, so odd values
      // round down). Skill level is irrelevant — the halving is all-or-nothing.
      //
      // What that buys you here: the target's soft MDEF is INT + VIT/2
      // (defenseFix.js), so halving INT is a straight magic-damage increase — the
      // reason a Priest blesses a Ghoul before opening. The halved STR and DEX are
      // the monster's own ATK and HIT, which only matter in the incoming direction;
      // /incoming takes no target_mods today, so they are recorded on the target for
      // consistency rather than being read there.
      //
      // wiki.payonstories.com/Blessing documents only the buff half, so this is the
      // stock pre-renewal behaviour. Boss immunity is NOT modelled: nothing in the
      // SC_BLESSING branch blocks MVPs, and it takes no resistance roll, but that
      // has not been confirmed in-game on PS.
      if (targetModsInput.offensive_blessing
          && (target.element === 9 || target.race === "Demon" || target.race === "Undead")) {
        const dexLost = target.dex - Math.floor(target.dex / 2);
        target.str = Math.floor(target.str / 2);
        target.int_ = Math.floor(target.int_ / 2);
        target.dex = Math.floor(target.dex / 2);
        // HIT is level + DEX and was computed when the target was built, so it has to
        // come down by the DEX just lost or the two disagree. Subtracting the loss
        // (rather than recomputing level + dex) keeps any other HIT the target was
        // given. FLEE is deliberately untouched: it comes from AGI, which Blessing
        // does not affect — so a blessed monster is less accurate, not easier to hit.
        if (target.hit > 0) target.hit = Math.max(0, target.hit - dexLost);
      }
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
      // Fling (GS_FLING) — a Gunslinger spends coins to cut the target's defence.
      // wiki.payonstories.com/Fling: "Consumes up to 5 coins", "Reduces targets Hard
      // Def by 3*coins used" (3/6/9/12/15%), 20 s. PS retuned the rate: Hercules is
      // `val2 = 5*val1` (status.c:8714), 5% per coin.
      //
      // It rides `def_percent`, the same field as Provoke, and that is exactly right
      // rather than a convenience: Hercules applies def_percent to the SOFT defence
      // only when the target is a player (battle.c:1494) but to hard AND soft for a
      // monster (1510-11) — so the wiki's "Only reduces Soft Def against players"
      // falls straight out of the shared field instead of needing a special case.
      //
      // NOT gated on boss, unlike Provoke — and this is now VERIFIED, not assumed.
      // Hercules gates boss status-immunity two ways: an explicit per-skill guard
      // (Provoke has one, skill.c:7691 `tstatus->mode&MD_BOSS` -> fail) and the
      // generic `is_boss_resist_sc()` check in status_change_start, which returns
      // true only for common ailments or a status flagged `NoBoss` in
      // db/pre-re/sc_config.conf. GS_FLING has NEITHER: its call site
      // (skill.c:2032) is a bare `sc_start(..., SC_FLING, 100, ...)` with no mode
      // check, and its sc_config entry carries no Flags block at all —
      //     SC_FLING: { CalcFlags: { DefPerc: true }  Skill: "GS_FLING" }
      // where SC_PROVOKE, by contrast, has `Flags: { Debuff: true  NoBoss: true }`.
      // 40 statuses do carry NoBoss in pre-re, so the absence is meaningful rather
      // than an empty file. That entry also confirms the field used here: DefPerc
      // IS def_percent.
      const flingCoins = Math.max(0, Math.min(5, Number(targetModsInput.fling) || 0));
      if (flingCoins > 0) {
        target.def_percent = Math.max(0, (target.def_percent ?? 100) - 3 * flingCoins);
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
    // Shadow's Within (platinum, toggleable): the only thing that lets Shadow Slash
    // land criticals on PS, and the source of its +30..50 crit rate. Without this
    // bridge the engine's flag had no producer at all, so the whole skill was
    // unreachable from the UI.
    if (effBuild.support_buffs?.shadows_within) {
      effBuild.skill_params = { ...(effBuild.skill_params || {}), PS_NJ_SHADOWSWITHIN_active: true };
    }

    const pipeline = new BattlePipeline(config);
    const battleResult = pipeline.calculate(status, weapon, skill, target, effBuild, gearBonuses);

    if (targetModsInput?.breaking_cloak) {
      const sName = skill.id === 0 ? "" : (loader.getSkill(skill.id)?.name || "");
      applyBreakingCloak(battleResult, skill.id === 0, sName === "AS_SONICBLOW");
    }
    // `venom_dust` is the pre-rename key — still honoured so shared links made before
    // the debuff was named after itself keep pricing the same.
    if (targetModsInput?.mailbreaker || targetModsInput?.venom_dust) {
      applyMailbreaker(battleResult);
    }
    if (targetModsInput?.lex_aeterna) {
      applyLexAeterna(battleResult);
    }

    const gear_stat_bonuses = {
      str_: gearBonuses.str_, agi: gearBonuses.agi, vit: gearBonuses.vit,
      int_: gearBonuses.int_, dex: gearBonuses.dex, luk: gearBonuses.luk,
    };
    // The base timings behind the cast rate, so the UI can show them instead of only
    // the cycle they add up to: cast time, after-cast delay, and the animation delay
    // one swing occupies. Same function and inputs the pipeline used for the period,
    // so these always reconcile with it. Cast/after-cast are 0 for a plain attack.
    const skillDataForTiming = skill.id !== 0 ? loader.getSkill(skill.id) : null;
    const [castMsOut, , cooldownMsOut, afterCastMsOut] = skillDataForTiming
      ? calculateSkillTiming(skillDataForTiming.name, skill.level, skillDataForTiming, status,
          gearBonuses, effBuild.support_buffs, effBuild.server)
      : [0, 0, 0, 0];
    const timing = {
      cast_ms: castMsOut,
      after_cast_ms: afterCastMsOut,
      cooldown_ms: cooldownMsOut,
      animation_ms: 2 * Math.max(100, Math.round(2000 - status.aspd * 10)),
    };
    const falcon = computeFalconDamage(status, effBuild, gearBonuses, target, loader);
    res.json({ status, weapon, target, result: battleResult, timing, gear_stat_bonuses, falcon, has_auto_bonuses: gearBonuses.auto_bonuses.length > 0 });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: "Calculation failed", detail: String(err.message || err) });
  }
});

// Target debuffs that change what the MONSTER does to you. Only offensive Blessing
// qualifies today: halving a monster's INT roughly halves its MATK (magic damage you
// take), and halving its DEX lowers its HIT (you dodge more). Returns a COPY — the
// loader hands out shared, cached mob records, so mutating one would poison every
// later request for that monster.
function applyIncomingTargetMods(mob: any, targetModsInput: any): any {
  if (!mob || !targetModsInput?.offensive_blessing) return mob;
  const undeadOrDemon = mob.element === 9 || mob.race === "Demon" || mob.race === "Undead";
  if (!undeadOrDemon) return mob;
  const stats = mob.stats || {};
  return {
    ...mob,
    stats: {
      ...stats,
      str: Math.floor((stats.str || 0) / 2),
      int: Math.floor((stats.int || 0) / 2),
      dex: Math.floor((stats.dex || 0) / 2),
    },
  };
}

router.post("/incoming", (req: Request, res: Response) => {
  try {
    const {
      build: buildData, target: targetInput, direction, opts, mob_skill: mobSkill,
      target_mods: targetModsInput,
    } = req.body || {};
    if (!buildData) return res.status(400).json({ error: "build is required" });
    if (!targetInput || targetInput.mob_id == null) return res.status(400).json({ error: "target.mob_id is required" });

    const build = buildFromSaveSchema(buildData);
    const profile = getProfile(build.server);
    loader.setProfile(profile);

    const config = createBattleConfig();
    const [gearBonuses, effBuild, weapon, status] = resolvePlayerState(build, config, profile);

    const mobId = Number(targetInput.mob_id);
    const rawMob = loader.getMonsterData(mobId);
    if (!rawMob) return res.status(404).json({ error: "Monster not found" });
    // Debuff it once, then use that same object for every figure below and hand it
    // back in the response, so the damage, the mob-skill pricing and the client's
    // own derived numbers (its HIT, and therefore your dodge %) all agree.
    const mob = applyIncomingTargetMods(rawMob, targetModsInput);

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
      // Damage taken straight off the player's own stats (Dark Breath's % of current
      // HP, Soul Burn's 2× SP burned). It never touches the mob's ATK, DEF, elements
      // or resists, so it bypasses the pipelines entirely and is reported as a flat,
      // certain figure. Current HP/SP are taken as full — the calculator has no
      // notion of a damaged character.
      if (spec.targetStat) {
        const pool = spec.targetStat.quantity === "sp" ? status.max_sp : status.max_hp;
        const dmg = spec.targetStat.pct != null
          ? Math.floor((pool * spec.targetStat.pct) / 100)
          : Math.floor(pool * spec.targetStat.mult);
        const result = createDamageResult({ min_damage: dmg, max_damage: dmg, avg_damage: dmg, pmf: { [dmg]: 1.0 } });
        result.add_step({
          name: spec.targetStat.quantity === "sp" ? "SP burned × multiplier" : "% of current HP",
          value: dmg, min_value: dmg, max_value: dmg, multiplier: 1.0,
          note: `${spec.name} Lv${spec.level}: ${spec.targetStat.note}`
            + (spec.targetStat.chancePct != null ? ` (lands ${spec.targetStat.chancePct}% of casts)` : ""),
          formula: spec.targetStat.pct != null
            ? `${spec.targetStat.pct}% × ${pool} ${spec.targetStat.quantity.toUpperCase()}`
            : `${spec.targetStat.mult} × ${pool} SP`,
          hercules_ref: "kokotewa.com/db/skl_info",
        });
        return res.json({ status, mob, skill: spec, result, modeled: true });
      }

      // Multi-hit skills: the ratio is per hit; scale the priced hit by the count.
      const skOpts = { ele_override: spec.elementInt, ratio_override: spec.ratio, ignore_def: spec.ignoreDef, mob_override: mob };
      let result = spec.attackType === "Magic"
        ? calculateIncomingMagicDamage(mobId, effBuild, status, gearBonuses, weapon, skOpts)
        : calculateIncomingPhysicalDamage(mobId, effBuild, status, gearBonuses, weapon, config, skOpts);
      if (spec.hits > 1) {
        result = scaleDamageResult(result, spec.hits, `${spec.hits} hits`, `${spec.name} hits ${spec.hits}×`, "");
      }
      return res.json({ status, mob, skill: spec, result, modeled: true });
    }

    const result = direction === "magic"
      ? calculateIncomingMagicDamage(mobId, effBuild, status, gearBonuses, weapon, { ...(opts || {}), mob_override: mob })
      : calculateIncomingPhysicalDamage(mobId, effBuild, status, gearBonuses, weapon, config, { ...(opts || {}), mob_override: mob });

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
      // Perfect Dodge (flee2). Separate from soft FLEE: a flat % chance to avoid a
      // hit outright, unaffected by the attacker's HIT. It was computed all along but
      // never returned, so gear granting it (Rust-Worn Apparatus, Whisper Card, the
      // Smokie/Hunter Fly pets) appeared to do nothing — reported as a missing bonus.
      flee2:     status.flee2,
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

  // ASPD breakpoints. The atomic step is 0.1 ASPD, not 1: statusCalculator derives
  // aspd = (2000 - amotion) / 10 from an INTEGER amotion, and amotion is the attack
  // delay, so every 0.1 ASPD is one less tick of delay (animation_ms moves 2 ms per
  // 0.1). Whole-number ASPD is a player convention, not a mechanical threshold.
  //
  // This used to report only integer crossings, floored — so a player adding +1 AGI
  // saw nothing at all despite a real gain, and the milestone it did show was
  // rounded DOWN (+3 AGI "→ 173" when the true value was 173.2). We now return the
  // next few genuine 0.1 steps AND the next whole-number milestones, each carrying
  // its exact ASPD and a `whole` flag so the UI can mark the round numbers.
  //
  // AGI is ~4x the weight of DEX, hence the different caps and counts.
  const aspdBreaks = (which: "agi" | "dex", cap: number, wantSteps: number, wantWhole: number) => {
    const out: { plus: number; aspd: number; whole: boolean }[] = [];
    let lastAspd = Number(status.aspd);
    let lastInt = Math.floor(lastAspd);
    let steps = 0;
    let wholes = 0;
    for (let k = 1; k <= cap; k++) {
      const a = Number(which === "agi" ? statusWith(k, 0).aspd : statusWith(0, k).aspd);
      if (!(a > lastAspd)) continue;           // no gain yet — keep spending stat
      const isWhole = Math.floor(a) > lastInt;
      // Take every step until the fine quota is met, then only the round numbers.
      if (steps < wantSteps || (isWhole && wholes < wantWhole)) {
        out.push({ plus: k, aspd: a, whole: isWhole });
        steps++;
        if (isWhole) wholes++;
      }
      // Track crossings even when not emitted, so `whole` stays truthful later on.
      if (isWhole) lastInt = Math.floor(a);
      lastAspd = a;
      if (steps >= wantSteps && wholes >= wantWhole) break;
    }
    return out;
  };
  const aspd = {
    current: Number(status.aspd),
    agi: aspdBreaks("agi", 80, 3, 2),
    dex: aspdBreaks("dex", 160, 2, 1),
  };

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
  // Uses the real hit-chance fn so every accuracy bonus (Holy Cross, Bash,
  // Magnum Break, Pierce, Shield Chain, Sonic Accel, Weaponry Research) is
  // folded in. Only meaningful against a real target that can dodge.
  let hit: { current_pct: number; to95: number | null; to100: number | null } | null = null;
  if (target && Number(target.flee) > 0) {
    const skillName = skillData ? skillData.name : "";
    const rateOf = (dHit: number) => calculateHitChance({ ...status, hit: status.hit + dHit }, target, config, skillName, skill ? skill.level : 1,
      { mastery: gb ? gb.effective_mastery : eff.mastery_levels, skill_params: eff.skill_params })[0];
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
