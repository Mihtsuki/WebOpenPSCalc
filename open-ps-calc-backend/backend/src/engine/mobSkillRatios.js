/**
 * mobSkillRatios.js — damage %-ratios for mob-cast NPC_* skills, for the
 * incoming-damage (survivability) pipeline.
 *
 * The outgoing player ratio maps (BF_WEAPON_RATIOS / BF_MAGIC_RATIOS) already
 * cover the *player* skills a monster can cast (Fire Bolt, Bash, Meteor, …), and
 * those numbers are accurate. This module fills the gap for the monster-native
 * NPC_* skills, whose damage is hardcoded in Hercules `battle.c` rather than in
 * the skill_db. **These are estimates**: they use the Hercules pre-renewal
 * baseline formula, which PS may tune beyond — so results are flagged
 * `estimated: true` and the UI labels them as approximate.
 *
 * skillratio in Hercules starts at a 100 base and the `case` blocks ADD to it;
 * the functions here return the *total* percentage (base included). A skill that
 * has no `case` in battle_calc_skill_ratio() falls through at the 100 base — i.e.
 * normal-attack-equivalent damage — so it maps to `() => 100` here.
 *
 * Sources are cited inline as `battle.c` line references from the pre-renewal
 * (stable) branch fetched during authoring; cross-checkable against
 * HerculesWS/Hercules src/map/battle.c battle_calc_skill_ratio()/battle_calc_misc_attack().
 *
 * AUDIT (2026-08-08): re-verified the scaling entries against Hercules `battle.c`.
 * All confirmed CORRECT for pre-renewal: NPC_BLOODDRAIN `+= 100*(lv-1)` (=100·lv),
 * NPC_ENERGYDRAIN `+= 100*lv` (=100+100·lv), NPC_DARKCROSS `+= 35*lv` (=100+35·lv;
 * the ×2 for a 2H-spear is RENEWAL- and player-only, so a mob caster never gets it).
 * The remaining entries have no `case` → 100% (normal-attack-equivalent). Since PS
 * is PRE-RENEWAL and these are stock monster skills (no PS rework / no wiki entry),
 * the pre-re formula IS the correct value — but PS COULD still have tuned an
 * individual one, and they can't be measured in-game (mob-cast), so they stay
 * `estimated: true` ("for testing") rather than being asserted as PS-exact.
 */

// name -> (skill_lv) => total skillratio %.  All physical unless noted; the
// caller picks the ATK-vs-MATK path from the skill_db attack_type, so a magic
// NPC_ skill here just supplies the % applied to the mob's MATK instead.
const MOB_SKILL_RATIOS = {
  // skillratio += 100 * (skill_lv - 1)  =>  100 * lv   (battle.c: NPC_BLOODDRAIN
  // group, incl. NPC_HELLJUDGEMENT / NPC_PULSESTRIKE).
  NPC_BLOODDRAIN:    (lv) => 100 * lv,
  NPC_HELLJUDGEMENT: (lv) => 100 * lv,
  NPC_PULSESTRIKE:   (lv) => 100 * lv,

  // skillratio += 35 * skill_lv  =>  100 + 35*lv   (battle.c: NPC_DARKCROSS /
  // CR_HOLYCROSS shared case). Physical, Dark property.
  NPC_DARKCROSS: (lv) => 100 + 35 * lv,

  // skillratio += 100 * skill_lv  =>  100 + 100*lv   (battle.c: NPC_ENERGYDRAIN,
  // shared with NJ_KAMAITACHI in the magic section). Magic; also drains SP.
  NPC_ENERGYDRAIN: (lv) => 100 + 100 * lv,

  // No `case` in battle_calc_skill_ratio() -> falls through at the 100 base, i.e.
  // normal-attack-equivalent damage (some are multi-hit; hit count comes from the
  // skill_db `number_of_hits`, applied separately by the caller).
  NPC_COMBOATTACK:   () => 100,
  NPC_GUIDEDATTACK:  () => 100,
  NPC_PIERCINGATT:   () => 100,
  NPC_SPLASHATTACK:  () => 100,
  NPC_RANGEATTACK:   () => 100,
  NPC_ARMORBRAKE:    () => 100, // deals normal damage + may break armor
  NPC_SHIELDBRAKE:   () => 100, // deals normal damage + may break shield
  NPC_HELMBRAKE:     () => 100, // deals normal damage + may break helm
  NPC_CRITICALSLASH: () => 100, // flag.cri=1 (always crit) — crit bonus not modeled; ~100% baseline
  NPC_DARKSTRIKE:    () => 100, // magic, Dark
  NPC_MAGICALATTACK: () => 100, // magic
  NPC_DARKTHUNDER:   () => 100, // magic, Wind

  // Clashing Spiral (the mob clone of Spiral Pierce, e.g. Drill's). Total damage is
  // ATK × size-modifier × skill level — reported by a PS player and matching
  // kokotewa.com/db/skl_info?id=ML_SPIRALPIERCE ("DMG atk 1.00 ~ 5.00" over 5 levels,
  // "DMG hits 5"). Two things make that a plain per-level ratio here:
  //   - The caller prices ONE hit and multiplies by the skill_db hit count (5), so
  //     the value below is PER HIT: 20×lv × 5 hits = ATK × lv total.
  //   - The size modifier is inverse-by-target-size (Small 125 / Medium 100 /
  //     Large 75%), and the target of an incoming skill is always the player, who is
  //     Medium — so it is a no-op in this direction and is left out rather than
  //     hardcoded as ×100%.
  // Deliberately NOT aliased onto LK_SPIRALPIERCE: the player-cast version is a
  // weapon-WEIGHT formula (see ROADMAP), which is a different shape and still
  // unported. Keying the mob clone separately keeps that port honest.
  ML_SPIRALPIERCE: (lv) => 20 * lv,
};

// Monster-clone skill names (the MS_/ML_/MA_ prefixes carried by mob copies of
// player jobs — e.g. an Eddga's MS_BASH) alias 1:1 onto the canonical player
// skill in Hercules `battle.c` (each shares that skill's `case` in
// battle_calc_skill_ratio()). Resolving the alias lets the incoming pipeline
// price them through the ACCURATE outgoing player ratio maps instead of the
// NPC_* Hercules-baseline estimates, so they report estimated:false.
//   MS_BASH          -> SM_BASH          (Bash; PS-vanilla-OK)
//   ML_PIERCE        -> KN_PIERCE        (Pierce; PS-vanilla-OK, hits by size —
//                                          resolved to 2 vs the Medium player by
//                                          profile.weapon_hit_counts)
//   MA_SHARPSHOOTING -> SN_SHARPSHOOTING (Sharp Shooting)
// ML_SPIRALPIERCE is deliberately NOT aliased: the player's Spiral Pierce is a
// weapon-weight formula that is still unported, while the mob clone is a plain
// per-level ATK ratio — so it carries its own MOB_SKILL_RATIOS entry instead.
// (ML_AUTOGUARD is a Self-target buff and MA_SANDMAN a Misc sleep trap — both
// already classify as non-damage, so they are intentionally NOT aliased here.)
const MOB_SKILL_ALIASES = {
  MS_BASH: "SM_BASH",
  ML_PIERCE: "KN_PIERCE",
  MA_SHARPSHOOTING: "SN_SHARPSHOOTING",
};

// Mob skills flagged as damage-dealing in the skill_db (Magic/Weapon, targets a
// foe) that actually inflict a STATUS / drain and deal no HP damage. Surfaced as
// "no direct damage" rather than a fabricated number.
const NO_HP_DAMAGE_SKILLS = new Set([
  // NPC_ status skills
  "NPC_MENTALBREAKER",  // reduces target SP
  "NPC_CHANGEUNDEAD",   // changes target property to Undead
  "NPC_DARKBLESSING",   // chance of instant death / heavy debuff, not a modellable hit
  "NPC_HALLUCINATION",  // inflicts Hallucination
  "NPC_LICK",           // stun (+ negligible)
  // player skills a mob can cast that are status-only (no HP damage)
  "MG_STONECURSE",      // petrify
  "AL_DECAGI",          // Decrease AGI
  "WZ_QUAGMIRE",        // slow
  "SA_DISPELL",         // strips buffs
  "PR_LEXDIVINA",       // silence
  "PR_LEXAETERNA",      // vulnerability debuff (no damage itself)
  "SL_STUN",            // stun
]);

// Damage skills whose power is a flat/special formula that does NOT fit the
// ratio × mob-ATK/MATK shape. We know they hurt but won't print a specific
// number — shown as element/type only — because the formula is either not
// publicly documented or is PS-tuned beyond the emulator baseline (a computed
// figure would be a fabricated number, which this calc deliberately avoids).
const FLAT_UNMODELED_SKILLS = new Set([
  // Shadow-property hit that ignores DEF/Flee. Sources disagree on the power:
  // iRO describes it as a % of the target's max HP, while some emulators use a
  // flat 500+(lv-1)*1000+rnd(0..999) capped at 9999. Unmodeled pending a
  // PS-confirmed formula (divine-pride/RMS list no formula; PS tunes it).
  "NPC_DARKBREATH",
  // Splash for the caster's current HP. In the data these are target:self /
  // dmg:false, so they never reach the damage path here anyway (kept for
  // completeness — the incoming pipeline has no flat/self-HP branch).
  "NPC_SELFDESTRUCTION",
  "NPC_SMOKING",          // md.damage = 3 (negligible; also self-targeted)
]);

module.exports = {
  MOB_SKILL_RATIOS, NO_HP_DAMAGE_SKILLS, FLAT_UNMODELED_SKILLS, MOB_SKILL_ALIASES,
};
