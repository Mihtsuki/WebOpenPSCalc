# Roadmap / port status

This documents the gap between this JS port and the original Python engine
(`StatGameDev/Open_PS_Calc`), file by file, so future work can pick up
without re-auditing everything from scratch.

## Fully ported (1:1 structural translation, verified against source)

| Original (Python) | Port (JS) | Notes |
|---|---|---|
| `core/models/*.py` | `engine/models.js` | dataclasses → factory functions |
| `core/data_loader.py` | `engine/dataLoader.js` | item/mob/skill/table lookups, PS layering |
| `core/bonus_definitions.py` | `engine/bonusDefinitions.js` | bonus-type description/routing tables |
| `core/item_script_parser.py` | `engine/itemScriptParser.js` | incl. a hand-written safe-expression evaluator replacing Python's `ast` module |
| `core/gear_bonus_aggregator.py` | `engine/gearBonusAggregator.js` | |
| `core/build_applicator.py` | `engine/buildApplicator.js` | |
| `core/build_manager.py` | `engine/buildManager.js` | save/load schema, weapon resolution, player→target conversion |
| `core/player_state_builder.py` | `engine/playerStateBuilder.js` | two-pass gear/status resolution |
| `core/config.py` | `engine/config.js` | |
| `core/calculators/status_calculator.py` | `engine/calculators/statusCalculator.js` | full 839-line formula set, all SC/song/passive branches |
| `core/calculators/target_utils.py` | `engine/calculators/targetUtils.js` | |
| `core/calculators/skill_timing.py` | `engine/calculators/skillTiming.js` | |
| `core/calculators/proc_keys.py` | `engine/calculators/procKeys.js` | |
| `core/calculators/dps_calculator.py` | `engine/calculators/dpsCalculator.js` | |
| `pmf/operations.py` | `engine/pmf.js` | |
| `core/calculators/modifiers/base_damage.py` | `.../modifiers/baseDamage.js` | |
| `.../refine_fix.py` | `.../refineFix.js` | |
| `.../attr_fix.py` | `.../attrFix.js` | |
| `.../forge_bonus.py` | `.../forgeBonus.js` | |
| `.../final_rate_bonus.py` | `.../finalRateBonus.js` | |
| `.../hit_chance.py` | `.../hitChance.js` | |
| `.../crit_chance.py` | `.../critChance.js` | |
| `.../crit_atk_rate.py` | `.../critAtkRate.js` | |
| `.../active_status_bonus.py` | `.../activeStatusBonus.js` | complex_flat (SC_ENCHANTBLADE) / rate_chance (SC_GIANTGROWTH) intentionally unported in the original too |
| `.../mastery_fix.py` | `.../masteryFix.js` | |
| `.../defense_fix.py` | `.../defenseFix.js` | incl. `calculate_magic` |
| `.../card_fix.py` | `.../cardFix.js` | incl. incoming-physical/magic variants, not yet wired into a pipeline (see below) |
| `core/calculators/magic_pipeline.py` | `battlePipeline.js#_runMagicBranch` | BF_MAGIC skills now return real damage (MATK roll → skill ratio → MDEF → AttrFix → CardFixMagic). `BF_MAGIC_RATIOS` only has ~30 explicit skills transcribed; others fall back to `skills.json`'s `ratio_per_level`, same as the weapon-skill path. |
| `core/calculators/grand_cross_pipeline.py` | `battlePipeline.js#_runGrandCrossBranch` | `(ATK+MATK) * (100+40*lv)/100 * holy_element_mult`, confirmed verbatim against [wiki.payonstories.com/Grand_Cross](https://wiki.payonstories.com/Grand_Cross) (also matches two independent vanilla pre-renewal community sources, and this repo's own `skills.json` `damage_type: ["IgnoreCards","IgnoreFlee"]`). **Applies the target's defense — asymmetrically**: the physical part takes hard+soft DEF, but the magic part takes **soft MDEF only (NOT hard MDEF)**. Calibrated against in-game screenshots (INT-based GC vs Knight of Abyss, hard MDEF 50, hard DEF 55): observed ~14.2k base / ~17.7k with Provoke Lv10. Full hard-DEF+hard-MDEF undershot badly (~8.4k); ignore-all-hard overshot (~17k); hard-DEF-physical + soft-only-MDEF fits (~15.1k base, ~17.8k Provoke — the Provoke case near-exact). This matches the PDF-verified "with-DEF" audit and PS players' report that a Provoke DEF cut scales GC. A brief full-ignore-DEF experiment (from a terse reading of the wiki formula that omits the assumed DEF step) was reverted. **PS deviation implemented**: the PS wiki states weapon masteries + Demon Bane's flat bonus *do* apply (only their percentage components are excluded) — gated behind a new `PS_GRANDCROSS_MASTERY_APPLIES` mechanic flag in `serverProfiles.js` so vanilla `standard` keeps `masteryFix.js`'s `MASTERY_EXEMPT_SKILLS` bypass. Original Hercules `battle.c` BF_MISC case still not directly inspected (repeated fetches were truncated before reaching it) — not needed now that the PS wiki corroborates the constant directly, but worth re-deriving if precision on the vanilla side matters later. |

## Partially ported

- **`core/server_profiles.py` → `engine/serverProfiles.js`** — `STANDARD`
  (vanilla) is complete. For `PAYON_STORIES`, the following were pulled
  directly from `core/server_profiles.py` on
  [StatGameDev/Open_PS_Calc](https://github.com/StatGameDev/Open_PS_Calc)
  (MIT licensed, fetched in sections to work around source-file size) and
  are now wired in and tested against vanilla to confirm divergence:
  `weapon_ratios` (36 skills, was 0), `weapon_vanilla_ok` (24 skills — used
  to suppress `skillRatio.js`'s "PS unaudited" warning for confirmed-vanilla
  skills), `magic_ratios` (10 skills, was 0), `magic_vanilla_ok` (20 skills
  — same warning-suppression, newly added to `_runMagicBranch` for parity
  with the weapon path), and 4 more `mechanic_flags`
  (`BS_OVERTHRUST_PARTY_FULL_BONUS`, `CR_SHIELDBOOMERANG_NK_IGNORE_FLEE`,
  `CR_SHIELDCHARGE_NK_IGNORE_FLEE`, `RG_BACKSTAP_NK_IGNORE_FLEE`) that
  already had a consumer in this port but weren't turned on. Also fixed:
  `_runMagicBranch`'s PS/vanilla ratio function calls only ever passed
  `skill.level`, never `target`/`ctx` — several PS magic ratios need them
  (e.g. `PR_MAGNUS` checks target race, `WZ_FIREPILLAR` reads
  `skill_params`). Now matches the weapon path's `(lv, tgt, ctx)` signature.
  **PS Assassin/Thief rework flags added and implemented**: three new
  `mechanic_flags` added to the `PAYON_STORIES` profile with full pipeline
  consumers: `AS_KATAR_SECOND_HIT` (katar second-hit proc),
  `TF_POISON_USES_WEAPON_ELEMENT` (Envenom attack element follows weapon
  element), `AS_ENCHANTPOISON_PASSIVE_BONUS` (Enchant Poison skill level
  adds 2% damage per level vs Poison-element targets). `AS_ENCHANTPOISON`
  also added to `dataLoader.js`'s `DAMAGE_RELEVANT` and
  `ACTIVE_SKILL_TYPE_EXCEPTIONS` so the skill appears in the passive panel.
  **PS class reworks added** (see "Done this pass"):
  `SM_MAGNUM_ENDOW_ATTACK_ONLY` (Crusader), `RG_BACKSTAP_OPPORTUNITY` and
  `RG_BOW_DOUBLE_ATTACK` (Rogue). Knight rework uses no new mechanic flags —
  implemented via `SC_TWOHANDQUICKEN.cri_per_lv`, `skill_level_cap_overrides`,
  and `mastery_prefer_fallback`.
  **PS Wizard / High Wizard rework implemented**: `WZ_FROSTNOVA` formula
  corrected to `(175+15×lv) + 10×FrostDiverLv`% (was `50×lv + …`). `WZ_VERMILION`
  added to `PS_BF_MAGIC_RATIOS` with `200×lv`% total (4 waves summed).
  `HW_NAPALMVULCAN` removed from `PS_MAGIC_VANILLA_OK`; element overridden to
  Shadow (Dark=7) via `skill_elements`; 50% MDEF ignore added via
  `HW_NAPALMVULCAN_MDEF_IGNORE` flag. `WZ_FIREPILLAR_MDEF_IGNORE` flag wired
  into `battlePipeline.js`'s `_runMagicBranch`. `SC_AMPLIFYMAGICPOWER` added to
  `statusCalculator.js` with PS-scaling (`min(lv,5)×10`%) gated by
  `SC_AMPLIFYMAGICPOWER_SCALING` flag; vanilla keeps flat 50%. `HW_SOULDRAIN`
  passive +1% MaxHP/lv added to `statusCalculator.js` and exposed as a skill
  slider via `DAMAGE_RELEVANT` / `ACTIVE_SKILL_TYPE_EXCEPTIONS`. Level caps
  added: `WZ_FROSTNOVA:5`, `WZ_FIREPILLAR:5`, `WZ_SIGHTRASHER:5`,
  `WZ_AMPLIFYMAGICPOWER:5`.
  **Still missing**: upstream has a few more `mechanic_flags` with no consumer
  anywhere in this JS port yet (`SC_CLOAKING_BONUS`,
  `GS_BLOCK_ENDOW`,
  `PR_TURNUNDEAD_PS_BONUS`, `PS_HOLYSTRIKE_PROC`,
  `SC_GS_ADJUSTMENT_LR_REDUCE`) — these need new
  modifier code, not just data. (The Musical Strike / Throw Arrow "performing"
  +100% bonus is now implemented via `skill_params.PS_PERFORMING_active` and a
  target-panel toggle, so its two upstream flags are dropped from this list.)
  (`MG_SOULSTRIKE_MDEF_IGNORE`,
  `WZ_FIREPILLAR_MDEF_IGNORE`, `HW_NAPALMVULCAN_MDEF_IGNORE`, and
  `RG_BACKSTAP_OPPORTUNITY` were previously listed here but are now
  implemented — see battle pipeline and "Done this pass" below.)
  Also: 3 of the 36 weapon ratios (`PS_RG_TRICKARROW`, `PS_RG_QUICKSTEP`,
  `PS_PR_HOLYSTRIKE`) are PS-custom skills (`ps_custom_constants.json` IDs
  2631/2633/2622, defined in `ps_skill_db.json`) that **`dataLoader.getSkill()`
  can't resolve at all** — it only ever reads vanilla `db/skills.json`
  regardless of profile, so these 3 skills can't currently be
  selected/calculated by this engine no matter what data exists for them.
  Real architecture gap, not just a data gap — needs `getSkill()` (and skill
  search) to consult `ps_skill_db.json` + `ps_custom_constants.json` when
  `use_ps_data` is set. The ratio data is ready for whenever that's fixed.

- **`core/calculators/modifiers/skill_ratio.py` → `.../modifiers/skillRatio.js`**
  — dispatch/precedence logic complete. `BF_WEAPON_RATIOS` is now the full
  52-entry table from upstream's `_BF_WEAPON_RATIOS` (was ~29) — added the
  23 missing entries (AM_ACIDTERROR, HT_FREEZINGTRAP, KN_AUTOCOUNTER,
  MO_FINGEROFFENSIVE, MO_INVESTIGATE, TK_STORMKICK/DOWNKICK/TURNKICK/COUNTER,
  all 10 GS_* skills, NJ_HUUMA/KASUMIKIRI/KIRIKAGE/KUNAI), verified count
  matches upstream exactly, spot-checked `GS_BULLSEYE`'s conditional
  Brute/Demi-Human race bonus against both a matching and non-matching
  target. The original's `RG_BACKSTAP` weapon-type split and
  parameter-dependent skills (`KN_CHARGEATK`, `MC_CARTREVOLUTION`,
  `TK_JUMPKICK`, `NJ_ZENYNAGE`) are still not transcribed — those need
  per-call context plumbing beyond a flat lookup table, separate piece of
  work. Anything not in either table still falls back to `skills.json`'s
  `ratio_per_level`/`ratio_base`.

- **`core/calculators/battle_pipeline.py` → `.../calculators/battlePipeline.js`**
  — covers normal attacks and BF_WEAPON skills end-to-end (the single most
  important path). **`TF_DOUBLE` (Double Attack) proc now implemented**
  (battle.c:4926 — dagger-only, normal attacks only, mutually exclusive
  with crit; proc rate from `profile.proc_rate_overrides.TF_DOUBLE` with a
  vanilla default of 5%/level, 7%/level on PS; verified end-to-end that DPS
  scales correctly and that non-dagger weapons correctly get 0% proc despite
  having skill levels set). **Katar second-hit now implemented** — Katar
  auto-attack with `TF_DOUBLE` learned procs a second hit at 2× the normal
  `TF_DOUBLE` rate, dealing `(21 + 4 × AS_KATAR_lv)%` of the main-hit
  damage; both normal and crit variants computed, included in DPS, exposed
  as a separate branch in the damage breakdown. **PS Envenom weapon element
  and Enchant Poison passive bonus also implemented** — see serverProfiles
  entry below. Still deferred:
  `GS_CHAINACTION` proc (same shape as Double Attack but not yet ported),
  item autocasts, NJ_ISSEN's
  fixed-damage formula, CR_SHIELDBOOMERANG's special case, several small
  PS-only multiplicative bonuses (Cloaking, Lex Aeterna, Mailbreaker/Venom
  Dust/Raided, Backstab Opportunity, "performing" bonuses), `bDoubleRate`
  gear bonus (cards/items that add to Double Attack's proc chance — no
  consumer in `gearBonusAggregator.js` yet), and `bWeaponAtk` (needs a
  weapon-type → Hercules `W_*` constant table not transcribed here).
  **PS Hunter trap branch now implemented** — `_runTrapBranch` handles
  HT_LANDMINE, HT_BLASTMINE, HT_FREEZINGTRAP, HT_CLAYMORETRAP when
  `HT_TRAP_PS_FORMULA` mechanic flag is set; dispatched in `calculate()`
  before the generic BF_MISC fallback. Formula verified against the PDF's
  comparison table at Hunter 99/50 DEX150/INT100 for all four traps.
  **PS Assassin dual-wield now implemented** — three-hit model per
  auto-attack swing: hit 1 = RH × `AS_RIGHT` factor, hit 2 = same roll as
  hit 1 (×`AS_RIGHT` factor), hit 3 = LH × `AS_LEFT` factor. Mastery
  factors from serverProfiles `passive_overrides`; vanilla base penalties
  (RH 50%, LH 30%) apply at lv 0. Gated by `DUAL_WIELD_PS_THREE_HIT`
  mechanic flag. A `DUAL_WIELD_PS_DAMAGE_BONUS` mechanic flag (also set in
  PS profile) applies a ×1.10 multiplier to the combined total after mastery;
  propagated to the frontend as `dw_ps_bonus_pct` so headline range and DPS
  are consistent. UI: damage panel shows `[PS (3-hit) beta | Vanilla]` toggle
  when an off-hand weapon is equipped — PS mode shows combined damage range
  and two-section step list (with a bonus row when `dw_ps_bonus_pct > 0`);
  Vanilla mode recomputes single-weapon DPS.
  **PS Crusader rework implemented** — see "Done this pass".
  **PS Knight rework implemented** — see "Done this pass".
  **PS Rogue rework implemented** — Backstab Opportunity (×1.4, user-toggled
  via `support_buffs.backstab_opportunity`), Vulture's Eye bow Double Attack
  (`min(TF_DOUBLE_lv, AC_VULTURE_lv)` proc, `RG_BOW_DOUBLE_ATTACK` flag),
  Yser Card functional (`bSkillAtk` for RG_BACKSTAP/RG_RAID, +5 HIT).
  `bSkillAtk` is applied inside `calculateSkillRatio()` for the weapon branch.
  (An earlier pass also re-applied it in `_runBranch`, double-counting every
  weapon skill's `bSkillAtk` — that duplicate has since been removed.)
  **Cards always proc toggle implemented** — `gearBonusAggregator.compute()`
  now parses `autobonus` / `autobonus2` scripts from item scripts and stores
  them in `gearBonuses.auto_bonuses`. When `build.flags.force_procs` is set,
  the inner bonus effects are applied as permanent bonuses (and to `from_cards`
  when the source is a card slot). The `/calculate` route returns
  `has_auto_bonuses: boolean`; the frontend shows a "Cards always proc"
  checkbox in the damage breakdown panel when true, triggering immediate
  recalculation on toggle.
  **PS Wizard rework — 50% MDEF ignore** for `WZ_FIREPILLAR` and
  `HW_NAPALMVULCAN` wired via per-skill `mdefIgnorePct` parameter already
  present in `calculateMagicDefenseFix` (was always passed 0 before).
  **`NK_IGNORE_ELEMENT` now wired** — `damage_type: ["IgnoreElement"]` in the
  skill DB was never surfaced as a flag; `calculateAttrFix` always ran in
  `_runBranch`. Fixed by adding `skill.nk_ignore_ele` alongside the existing
  `nk_ignore_def`/`nk_ignore_flee` flags in `calculate()`; `_runBranch` now
  skips AttrFix when set. Primary beneficiary: `AS_SPLASHER` (Venom Splasher).
  **PS Sage rework implemented** (`Payon Stories Sage Rework Publication (Final).pdf`) —
  `MG_SOULSTRIKE`: 50% MDEF ignore via `MG_SOULSTRIKE_MDEF_IGNORE` flag (same pattern as
  Fire Pillar / Napalm Vulcan); +5% damage per skill level vs Undead race via
  `MG_SOULSTRIKE_UNDEAD_BONUS` flag, applied as a dedicated pipeline step after AttrFix.
  `MG_FIREBALL`: per-level table `40 + 30 × lv` (70%→340%) already stored in
  `PS_BF_MAGIC_RATIOS` — confirmed correct against published table.
  `WZ_EARTHSPIKE` / `WZ_HEAVENDRIVE`: 140% per hit already stored — confirmed correct.
  `SA_ADVANCEDBOOK`: flat ATK +10–30 and ASPD +3–7% at levels 1–5 already in
  `PS_PASSIVE_OVERRIDES` — confirmed correct.
  Volcano/Deluge/Violent Gale persistence buffs (max level 3) already stored and capped.
  **PS Gunslinger rework implemented** — verified all damage-relevant rework
  items: `GS_TRIPLEACTION` (140%/hit × 3 = 420% total, PS ratio `100+40×lv` at
  max level 1, was 450% vanilla); `GS_GROUNDDRIFT` (`200+60×lv`%, max 800% at
  lv 10, was `100+50×lv`%); `GS_MAGICALBULLET` (`50+DEX+BaseLvl`%); Heavy-Tipped
  Bullet (ATK 45, `bonus2 bAddRace,RC_All,10` — all already in PS data).
  **Neutral resist fixed**: `GS_DUST` was missing from `PS_PASSIVE_RESISTS` despite
  its description promising 7% Neutral resist at max level — now added. `GS_FULLBUSTER`
  and `GS_SPREADATTACK` resist now also triggers with Grenade Launcher
  (`weapon_types` updated to `["Shotgun","Grenade"]` for all three).
  Still deferred: `GS_CHAINACTION` proc,
  item autocasts, NJ_ISSEN's fixed-damage formula,
  CR_SHIELDBOOMERANG's special case, several small PS-only multiplicative
  bonuses (Cloaking, Lex Aeterna, Mailbreaker/Venom Dust/Raided,
  "performing" bonuses), `bDoubleRate` gear bonus, `bWeaponAtk`.

## Not yet started

- BF_MISC skills beyond Grand Cross and the PS trap branch
  (TF_THROWSTONE, NJ_ZENYNAGE, BA_DISSONANCE, etc.; GS_FLING now has its own
  branch) — still
  return "not yet implemented". HT_LANDMINE / HT_BLASTMINE /
  HT_FREEZINGTRAP / HT_CLAYMORETRAP are now implemented for the
  `PAYON_STORIES` profile (see "Done this pass"); non-PS profiles still
  return "not yet implemented" for these four.
- `GS_CHAINACTION` proc — same mechanic shape as `TF_DOUBLE` and the
  now-implemented `MO_TRIPLEATTACK`, not yet ported.
- ~~Gunslinger's coin economy~~ — **partly done 2026-08-21.** `build.gs_coins` now exists
  (0–10, Gunslinger-gated in the Buffs panel) and Fling consumes it. Asked for twice: an earlier
  report wanted "Coin amount" in the buffs panel, and a 2026-08-18 report asked for coins and Fling
  separately without realising they are one feature. Still unmodelled: coin ACCOUNTING for the
  buffs that cost coins, and `GS_BULLSEYE`'s "with coins" bleed chance — see the punch-list.
- `GS_FULLBUSTER` / `GS_SPREADATTACK` grant a passive elemental resist at
  skill level 10 with a Shotgun equipped (`profile.passive_resists` in
  `serverProfiles.js` — already engine-supported). Not surfaced in the
  passive-skill panel because both are active attack skills
  (`skill_type` non-empty), not true passives, and the panel's resist
  scope is damage-relevant masteries only, not defensive bonuses. Likely
  what a user report meant by "Shotgun passives" being missing; flagging
  here rather than silently expanding the passive panel's scope without
  confirming that's actually wanted.
- GUI parity: the original has 15 sections and 6 dialogs (combat controls,
  equipment/monster/skill browsers with rich filtering, build-vs-build
  comparison). The web frontend now covers stats, equipment with card
  slots, a passive-skill panel filtered to damage-relevant masteries, a
  buffs panel (quickens, Impositio Manus, Overthrust, Bard/Dancer songs —
  whatever the engine already read from `active_buffs`/`song_state` but had
  no UI for), consumables, target selection, skill selection, and the
  damage breakdown — still not full parity (no combat-controls panel, no
  build-vs-build comparison).
  **Performer stats closed a silent hole here (2026-08-17)**: `statusCalculator`
  had always read the PERFORMER's stats and Lesson level per song
  (`SC_POEMBRAGI_dex`, `SC_WHISTLE_agi`, …) but nothing ever wrote them, so every
  song computed at stat 1 / Lesson 0 — the weakest possible Bard. The panel now
  exposes one shared block per class (`bard_*` / `dancer_*` in `song_state`), which
  each song falls back to via `performerStat`/`performerLesson`; the older per-song
  keys still take precedence so pre-existing share URLs are unchanged. Also added
  **Service for You**, which the engine implemented (Max SP + SP-cost cut, matching
  the wiki's +25%/−50% at Lv10) but the picker never listed. Marked **beta**: the
  wiki publishes each song's endpoints and says the performer's stats affect them,
  but not the per-point rates — those are the pre-renewal emulator's
  (`skill.c:13556` for Bragi), unverified against in-game numbers.
- **Incoming damage from the target monster's *skills*** — _largely done_
  (`mobSkillRatios.js`, `resolveMobSkillDamage` in `routes/calculate.ts`,
  `components/SurvivabilityView.tsx`). A picked cast skill is priced through the
  incoming pipeline with the SAME ratio/hit precedence as the outgoing pipeline:
  `profile.weapon_ratios`/`magic_ratios` (PS-reworked, accurate) override the
  vanilla `BF_*` maps, which are trusted only where the `*_vanilla_ok` sets confirm
  PS matches vanilla (otherwise flagged **estimated**); monster-native `NPC_*`
  skills use a Hercules-baseline table (**estimates**); status/drain skills report
  "no direct damage". This picked up PS-only spells the vanilla maps lack
  (Lord of Vermilion, Fire Pillar) and corrected several vanilla-overcounted
  ratios (Meteor, Soul Strike, Napalm Vulcan). The size/element/race-dependent
  ratio & hit fns are evaluated against the player-as-target (Medium/Neutral/
  DemiHuman), so Pierce is 2 hits, and NEGATIVE `number_of_hits` (cosmetic
  multi-hit, e.g. Vermilion's −10) collapses to 1 instead of multiplying a
  total-ratio spell. Monster-clone skills (`MS_BASH`, `ML_PIERCE`,
  `MA_SHARPSHOOTING`) alias 1:1 onto their canonical player skill
  (`MOB_SKILL_ALIASES`). The `NPC_*` scaling ratios were **audited (2026-08-08)
  against Hercules `battle.c` and confirmed correct for pre-renewal** (Blood Drain
  100·lv, Energy Drain 100+100·lv, Dark Cross 100+35·lv; the rest 100% = normal
  attack). Since PS is pre-re and these are stock monster skills, the pre-re formula
  IS the value — but PS could still tune an individual one and they can't be
  measured in-game (mob-cast), so they remain flagged `estimated` ("for testing").
  **The Survivability UI now shows three explicit states:** accurate (no tag),
  **for testing** (pre-re baseline `NPC_*` / unaudited vanilla), and **not modeled
  yet** (damage skills with no reliable formula). **Remaining (genuinely blocked):**
  (1) Dark Breath (`FLAT_UNMODELED_SKILLS`) — Shadow %-max-HP hit whose power isn't
  publicly documented and is PS-tuned → now surfaced as **not modeled yet** rather
  than a fabricated number; (2) making the `NPC_*` estimates PS-*exact* is
  impossible without data (untestable mob-cast + no PS docs) — the pre-re baseline
  is the ceiling; (3) `ML_SPIRALPIERCE`/`LK_SPIRALPIERCE` (Spiral Pierce) has no
  modeled ratio on either side → also surfaced as **not modeled yet** until a ratio
  is added; likewise monster-cast 3rd-job skills (Crimson Rock, Sonic Wave, …).

## Planned front-end features (product)

These come from a "what would help a player simulate their character" review. The engine
already returns everything both need — they're largely frontend work.

### 1. Build-vs-build comparison  (in progress — on a feature branch)

The single most-used interaction for a damage calc: *"is A or B better?"* (card swaps, refine
levels, stat splits, gear choices). Pin the current build+result as a snapshot, then tweak the
editor and see the delta live. UI: a compare table whose columns are each pinned build plus the
current (live) result, and whose rows are the decision metrics — **DPS, average damage per hit,
time-to-kill** — with deltas colour-coded (green = better). Each pin can be reloaded into the
editor or removed. The original Python app had this (see "no build-vs-build comparison" under Not
yet started). Implementation: a `pins[]` array in `BuildEditor` holding `{label, metrics,
buildState}`; a `CompareView` component renders the table. Snapshot the full (shareable) build
state so pins survive edits and can be restored. Metrics come straight off `calcResult` —
`result.dps` (already effective), `result.normal.avg_damage`, and `target_hp / dps` for TTK.

### 2. "What to upgrade next" marginal-gain panel

For the current build+target, re-run the calc with **one thing changed** and rank the DPS gain of:
+1 refine on each equipped piece, the best card for each open slot, and +1 to each primary stat.
Shows the player the highest-leverage next purchase. Implementation: enumerate candidate
single-edits, call the existing `/calculate` endpoint for each, diff the DPS, sort. Debounce/cache
so it doesn't flood the backend (or add a batch endpoint). Natural follow-ons: a card recommender
and a stat optimiser (given N free points, maximise DPS/TTK).

## Done this pass (not in the original suggested order, picked up ad hoc)

- **ASPD breakpoints report 0.1 steps, not just integer crossings** (`aspdBreaks` in
  `routes/calculate.ts`). The atomic ASPD step is **0.1, not 1**: `statusCalculator`
  sets `aspd = (2000 - amotion) / 10` from an INTEGER `amotion`, and `amotion` IS the
  attack delay, so each 0.1 is one tick — `animation_ms` moves 2 ms per 0.1. Whole-number
  ASPD is a player convention, not a mechanical threshold. The old `aspdBreaks` emitted a
  row only when `Math.floor(a) > lastInt` and reported `Math.floor(a)`, so it (a) hid every
  sub-integer gain and (b) rounded the milestone DOWN. Measured on an AGI-80 Assassin with
  a dagger: of the 98 AGI points that raise ASPD at all, only **20** cross a whole number —
  the row was surfacing about a fifth of the real gains, and understating each one.
  Now returns `{plus, aspd, whole}` with the EXACT value, taking the next 3 fine steps plus
  the next 2 whole-number milestones for AGI (2 + 1 for DEX); `whole` is tracked even for
  crossings that aren't emitted, so the flag stays truthful. The at-cap path (empty array →
  "at cap") is unchanged and was re-verified by temporarily lowering `config.max_aspd`.
  Route internals aren't reachable from the test suite (`routes/` is TS, `npm test` runs
  plain JS), so the guard added is at the engine layer instead: ASPD is always a clean 0.1
  multiple, sub-integer AGI gains provably exist, and 0.1 ASPD is worth 2 ms.

- **Killing Stroke: Mirror Image bonus modeled, and its fabricated DPS removed.**
  Two player reports in one. (1) `NJ_ISSEN` has **every timing array zeroed** in the
  skill DB, so `calculateSkillTiming` returned `0 + 0` and the shared
  `Math.max(castMs + delayMs, 100)` floor turned that into a 100 ms period — the
  panel was advertising **ten Killing Strokes a second, 60,890 DPS** for a skill that
  drops you to 1 HP. It is a one-shot by construction (the cast also cancels the Ninja
  Aura it *requires*), so the branch now returns `dps: null` / `dps_valid: false` /
  `period_ms: 0` rather than a floor-derived fiction. (2) Mirror Image
  (`SC_NJ_BUNSINJYUTSU`) raises this skill's damage by **(5 + 5×ImagesLeft)%**, 10% at
  one image to 30% at five, on non-PvP/GvG maps — we only price PvM, so it always
  applies when set. Added as a buff-picker entry whose **level is the number of images
  LEFT, not the skill level**: the skill grants `ceil(lv/2)` images (Lv1-2 → 1 …
  Lv9-10 → 5, per `skill_descriptions.json`), and the formula reads how many are still
  standing at cast time. Applied last as its own breakdown step, clamped to 5.
  Sources: `wiki.payonstories.com/Killing_Stroke` + `/Mirror_Image` (both fetched
  live — the formula and the image counts are stated outright on those pages).
  **Side fix in the frontend:** `dps_valid:false` also zeroed `killDps`, which blanked
  **hits-to-kill** — but "how many casts to kill" is precisely what you want from a
  burst nuke. Those branches are a single deterministic hit with no crit or proc mix,
  so per-hit damage *is* the expected damage per cast; the panel now falls back to it
  and relabels the tile **"Casts to kill"**, while time-to-kill correctly stays blank
  (no rate, no honest duration). The DPS "—" now carries a tooltip saying why.

- **Cards are only counted in a slot they can compound into** (`gearBonusAggregator.js`,
  `SLOT_CARD_LOCS` + `cardFitsSlot`). The aggregator applied every card sitting in a
  `*_cardN` key regardless of the card's own `loc`, so a garment card in an armour slot
  paid out in full. The **editor was never the hole** — `SLOT_CARD_LOC` in `BuildEditor.tsx`
  and the `?loc=` filter on the item route already restrict the picker — but three paths
  bypass the picker entirely: share URLs (`z3_`), the jaludev importer, and direct API
  calls. So the guard belongs in the engine, next to the existing `ammoFitsWeapon` check.
  `left_hand` is resolved by what is HELD (an off-hand weapon takes `EQP_WEAPON`, a shield
  takes `EQP_SHIELD`); a card with no/empty `loc` fails open, which keeps the synthetic
  wildcard cards (`47xx`, every loc) usable in every slot as the custom card-mix UI needs.
  **This exposed three stale test fixtures** — the golden scenarios still slotted Pirate Skel
  and Wootan Fighter as accessory/armour cards after the earlier data fix moved them to
  headgear, and the Wanderer `isequipped` test had all four thief-set cards in the wrong
  slots. Those tests were only passing *because* the engine ignored `loc`. Fixtures corrected
  (cards hosted on a Hat 2221 / their real slots); the only golden movement is the host
  headgear's `def_` +2 — every damage number is unchanged, confirming the bonuses still
  apply from the correct slot.

- **Bonus-routing audit — several damage bonuses were parsed but not applied.**
  Diffed every `bonus`/`bonus2` type used in `item_db` against what
  `bonusDefinitions.js` actually routes, and checked table entries that were
  present but defined with no `field`/`mode` (silent no-ops). Fixed:
  `bNoSizeFix` (Drake Card — size penalty; new `no_sizefix` gear flag folded
  into the build), `bIgnoreMdefRace` (High Wizard Card — 100% non-boss MDEF
  ignore; new `dict_const` aggregator mode + `value` on `def()`),
  `bIgnoreDefRace` (40+ race "ignore DEF" cards — was a no-op, now
  `ignore_def_rate` at 100%), `bMatk` (flat gear MATK, ~150 items — was a no-op,
  now a `matk` gear field folded into `bonus_matk_flat`), `bCriticalAddRace`
  (+crit vs race — now consumed in `critChance`, `gearBonuses` threaded through),
  and `bAddDamageClass` (+% vs a specific mob id — had a duplicate effect-less
  definition overriding it; now routed and applied in `cardFix` via a new
  `target.mob_id`). Verified no remaining same-object duplicate keys in the
  bonus tables. Remaining unhandled `damage_type` flags (`IgnoreDefCards`,
  `NoDamage`, `SplitDamage`) are near-zero impact for single-monster targeting.
- **Offensive "Misc"-typed skills now selectable** — the skill picker's
  `damage_only` filter (`routes/data.ts`) kept only `attack_type` `Weapon`/`Magic`,
  but the skill DB tags every non-weapon/magic skill as `Misc` (buffs, masteries,
  songs, *and* delayed/indirect damage skills). That hid genuine offensive
  skills the engine already computes — e.g. Venom Splasher (`AS_SPLASHER`, PS
  ratio `500 + 50×lv + 30×PoisonReactLv`%) and Acid Terror. The filter now also
  keeps any skill the active server profile has a `weapon_ratios`/`magic_ratios`
  entry for, which is the precise "this server can actually calculate it" signal;
  vanilla (empty ratio tables) is unchanged. Verified end-to-end (Venom Splasher
  Lv10 → 1000% ratio → real damage).
- **Monster-family (RC2) "Bane" cards implemented** — real `bAddRace2` cards
  (Orc Lady, Goblin/Kobold Leader, Lava Golem, plus RC2_Guardian/RC2_Ninja
  cards) were parsed but silently dropped: there was no `bAddRace2` routing and
  no mob→family data anywhere in the port (Hercules/rAthena migrated it out of
  the DB files). Added end-to-end: `bAddRace2` → `add_race2` dict in
  `bonusDefinitions.js`; `add_race2: {}` in `createGearBonuses` and `race2: []`
  on targets in `models.js`; a new `db/mob_race2_db.json` (pre-re RC2 groups —
  Goblin/Kobold/Orc/Golem/Guardian/Ninja, recovered from rAthena's
  pre-migration `db/pre-re/mob_race2_db.txt`) with a cached reverse map in
  `dataLoader.getMonster` that attaches `target.race2`; and application in
  `cardFix.js` as its own multiplier, gated on the target's family. Verified
  end-to-end (Orc Lady card = +30% vs Orc-family mobs, 0% otherwise). Separate
  from the wildcard "Type"/`add_type` mix, which still applies unconditionally
  as a slotting simulation. Payon-Stories-custom mobs added to a family would
  need extra entries in the data file.
- **Weapon card wildcard "Type" category (`bAddRace2`)** — the weapon-card
  wildcard mix gained a fourth category, **Type**, for monster-family "Bane"
  cards (Orc / Goblin / Kobold / Golem-Bane, +30% physical damage). Added an
  `add_type` field to `createGearBonuses` (`models.js`), fed by the `Type_All`
  wildcard key in `playerStateBuilder.js`, and consumed as its own
  multiplicative `typeBonus` factor in `cardFix.js` (separate from
  race/ele/size). Applies to the selected target since the mix simulates
  "what card would I slot". Also fixed the wildcard aggregation dropping the
  mix on a weapon switch — it now iterates the equipped weapon's live slot
  count instead of a stale stored `wildcard_slots` copy.
- **Soft-DEF variance preserved through def-ratio / Investigate** — added
  `scaleFloorNumRange(pmf, numLo, numHi, step, denom)` to `pmf.js`;
  `defenseFix.js` now uses it for `MO_INVESTIGATE` (`isPdef2`) and
  `bDefRatioAtk` cards (`isPdef1`: Ice Pick / Frozen / Thanatos) so damage
  scaled by a high-VIT target's *random* soft DEF keeps its min–max range
  instead of collapsing to the average factor (e.g. Investigate vs a VIT 100
  target now reads ~5805–6870, not a flat ~6337). Low-VIT targets with no
  soft-DEF variance still resolve to a single value.
- **ASPD %-bonus stacking corrected** — percentage ASPD-rate bonuses
  (Two-Hand / One-Hand / Spear Quicken, Adrenaline, potion `bAspdRate`) were
  applied as two separate floored multiplications, undershooting the real
  value (+30% Quicken and +20% potion gave ×0.70×0.80 = ×0.56 instead of the
  additive ×0.50). `bonus_aspd_percent` is now folded into `scAspdRate` and
  the combined rate is applied once, matching pre-renewal behaviour (fixed
  ASPD reading a couple of points low on buffed builds — e.g. Two-Hand
  Quicken not moving ASPD at all on a Knight/Claymore build).
- **Provoke as a target debuff** — `SC_PROVOKE` (Lv 1–10) added to the target
  debuff panel, lowering the target's soft DEF so it takes more physical
  damage. URL-encoded alongside the build and kept independent of the
  player's own Auto Berserk / Provoke self-buff (turning on one no longer
  toggles the other).
- **PS Demon Bane (AL_DEMONBANE) rework** — Payon Stories buffs Demon Bane
  ([wiki](https://wiki.payonstories.com/Demon_Bane)) from vanilla `+3/lv` to
  `+5/lv`, keeping the `(BaseLv+1)/20` per-level base scaling, and adds a new
  `+4/lv` vs non-Undead/Demon targets. Implemented as a `mastery_ctx_overrides.AL_DEMONBANE`
  entry on the `PAYON_STORIES` profile: `lv × floor(5 + (BaseLv+1)/20)` vs
  Undead-element(9)/Demon-race (→ **100 at Lv10/base 99**, vs vanilla 80), else
  `lv × 4`. Verified end-to-end: Monk (Waghnak[4] + 4× Santa Poring vs Corruptor)
  auto-attack now matches in-game exactly (547 no-Signum / 640 Signum; was 509/603
  — the constant post-DEF gap of ~21 ATK × the +80% card multiplier). Also fixed
  the shared vanilla formula in `masteryFix.js` to floor the per-level multiplier
  like Hercules (`lv × floor(3 + (BaseLv+1)/20)` = 80, was `trunc(lv × (3 + BaseLv/20))`
  = 79) so the `standard` profile is correct too.
- **PS Signum Crucis (AL_CRUCIS) rework** — the target-debuff toggle was
  applying a flat −35% via `def_percent` (which wrongly scales both hard *and*
  soft DEF) and gating on `race === "Undead"`. Corrected to the PS values in
  `ps_skill_db.json` (id 32): a **hard-DEF-only** reduction of `10 + 4×lv`
  → **−50% at Lv10**, applied to `target.def_` in `routes/calculate.ts`, and
  gated on **Undead-element (idx 9) or Demon-race** (Undead is an element, not
  a race — Demon monsters of any element now qualify). Stacks with Provoke.
  Confirmed against [wiki.payonstories.com/Signum_Crucis](https://wiki.payonstories.com/Signum_Crucis)
  and this repo's `ps_skill_db.json`; the two disagree on the level curve (the
  wiki summary showed a 5-level 14→50 curve, `ps_skill_db.json` lists 10 levels
  as `10 + 4×lv`), so the in-repo data was treated as canonical — matches the
  engine's existing (previously dead) `SC_CRUCIS` formula in `targetUtils.js`.
  UI (`BuildEditor.tsx`): `signumApplicable` now checks element/race, and the
  label/tooltip read "−50% hard DEF (10 + 4×lv)". Toggle assumes Lv10.
- **PS Bleeding revamp** — purely data/item-layer changes; no new engine
  modifier code required. Six item script overrides in `ps_item_overrides.json`
  (Breeze Card ATK 5→8 / bleed 5%→2%; Hatii Claw bleed 2%→5%; Hakujin
  13014/13015 +8% bleed; Huuma Giant Wheel Shuriken 13301/13302 bleed removed).
  Breeze Card + Muka Card combo (+6% bleed on hit) added to
  `ps_item_combo_db.json`. `PS_BLEEDING_REVAMP` mechanic flag added to
  `serverProfiles.js` documenting the DOT mechanic change (5% maxHP / 0.5s for
  2.5s, can kill, 35s immunity, cannot inflict on targets ≥15 base levels higher
  than attacker) — the DOT itself is not modelled in the outgoing-damage
  calculator. Skill-side (Wounding Shot, Acid Terror) and mob-side (Skogul,
  Killer Mantis) bleed-chance changes are noted in the changelog but not
  modelled.

- **Dancer/Gypsy Whip equip fix** — `dataLoader.js` now runs a normalisation
  pass over the item DB that remaps the `job` array for any item whose
  `weapon_type` is `"Whip"` from `[19, 4020]` (Bard/Clown, which uses a
  `SEX_MALE` lock in the source data) to `[20, 4021]` (Dancer/Gypsy). Whips
  carry no gender restriction in the source data, so the vanilla DB's bitmask
  was wrong for this equipment class.

- **PS Monk rework — Triple Attack proc** — `MO_TRIPLEATTACK` procs on
  auto-attacks for Monk/Champion; proc rates level-indexed `[28,26,24,22,20]%`,
  Knuckle bonus `+0.2×lv% per 10 job levels`. `MO_TRIPLEATTACK_PS_BONUS`
  mechanic flag gates Fury-conditional crit: when SC_EXPLOSIONSPIRITS is active,
  the proc branch runs a separate crit branch at Fury's crit rate. Six-slot
  attack-definition model covers all crit/proc/miss combinations. `MO_TRIPLEATTACK`
  added to `DAMAGE_RELEVANT` + `ACTIVE_SKILL_TYPE_EXCEPTIONS` so it appears in
  the passive panel.
- **PS Hunter rework** — four offensive trap skills (`HT_LANDMINE`,
  `HT_BLASTMINE`, `HT_FREEZINGTRAP`, `HT_CLAYMORETRAP`) now calculate real
  damage for the `PAYON_STORIES` profile using the reworked INT/DEX-based
  formulas (divisors 45 and 70). Bypasses DEF; element fix, race/size card
  bonuses, `bSkillAtk` bonuses (Dory Card, Wolpertinger Card, Setting Dirk),
  and `bFinalAtk` all still apply. Card bonus values updated in
  `ps_item_manual.json`, `ps_item_overrides.json`, and `ps_item_db.json`.
- **PS Assassin/Thief rework** — katar second-hit proc (now in the
  battlePipeline and exposed as a breakdown branch), Enchant Poison passive
  damage bonus vs Poison-element targets, Envenom weapon-element override,
  dual-wield three-hit auto-attack model (Assassin/Assassin Cross with an
  off-hand weapon: 2×RH×`AS_RIGHT`_factor + LH×`AS_LEFT`_factor per swing),
  and a ×1.10 PS combined-damage bonus (`DUAL_WIELD_PS_DAMAGE_BONUS`) applied
  to the three-hit total — all gated behind `PAYON_STORIES` mechanic flags.
- **PS Crusader rework** (`PSRO_Crusader_Rework_2026.pdf`) — Reflect Shield PS
  formula (`floor(SoftDEF × (1 + 1.75 × HardDEF/100) × lv/10)`, DEF-ignoring,
  hit-checked, element/card-enhanced); DPS suppressed (`dps_valid: false`) since
  it triggers on enemy attack speed, not player ASPD. Armor element resolved via
  `resolveArmorElement` (handles Ghostring card etc.). Spear Quicken grants Hit/
  Flee instead of Crit (`SC_SPEARQUICKEN` in `PS_PASSIVE_OVERRIDES`). Magnum
  Break fire endow restricted to auto-attacks (`SM_MAGNUM_ENDOW_ATTACK_ONLY`
  flag). Stone Discus now only boosts Shield Boomerang (not Shield Charge).
- **PS Knight rework** (`Payon Stories Knight Patch (1).pdf`) — Sword Quickening
  CRIT: +1%/lv via `SC_TWOHANDQUICKEN.cri_per_lv: 10` in `PS_PASSIVE_OVERRIDES`.
  Spear Stab capped at level 5 via `skill_level_cap_overrides`. Blade Mastery
  covers 1H Sword: `mastery_prefer_fallback { SM_SWORD: "KN_TWOHANDMASTERY" }`
  routes 1H Sword mastery to Blade Mastery when the Knight has levels in it.
- **PS Rogue rework** (`Rogue_Patchnotes_PayonStories.pdf`) — Backstab ratio
  corrected to `200+30×lv`% (was `200+40×lv` in PS override). Backstab
  Opportunity (+40% multiplicative) gated on `RG_BACKSTAP_OPPORTUNITY` mechanic
  flag and `support_buffs.backstab_opportunity`; UI checkbox in Skill panel
  (skill ID 212, PS server). Trick Arrow ratio corrected to 200% (2×100% hits).
  Vulture's Eye enables bow Double Attack (`RG_BOW_DOUBLE_ATTACK` flag;
  proc = `doubleRate × min(TF_DOUBLE_lv, AC_VULTURE_lv)`). Yser Card (ID 8236)
  now functional: `bSkillAtk` for RG_BACKSTAP/RG_RAID (+10% each) and +5 HIT.
  `bSkillAtk` bonuses are applied once, inside `calculateSkillRatio()` (a later
  fix removed a duplicate re-application in `_runBranch` that double-counted them).
- **PS Merchant / Blacksmith / Alchemist rework 2026-08-09** (`PayonStories Merchant`,
  `PayonStories Blacksmith`, `PayonStories Alchemist Rework`, `PayonStories Burning`, all
  dated 2026-08-09) — see per-class audit items 10 & 11 below for the full formula list.
  Implementation notes worth keeping in view:
  - `skill_level_cap_overrides` now **SETS** a skill's PS max level instead of only clamping
    it downward (`dataLoader._applySkillCap`). Cart Revolution 1→5, Crazy Uproar 1→4 and the
    Smith Weapon skills 3→4 all need it to raise; `BS_TWOHANDSWORD: 0` is how a removed skill
    disappears from the pickers. It is also applied in `getPassiveSkillsForJob` now, which
    previously trusted `ps_skill_db.json`'s scraped max and so could not see a post-scrape rework.
  - `mastery_prefer_fallback` values may be an **array** — first mastery the character has
    ranks in wins. Mace routes to `["MO_IRONHAND", "PS_MC_TOOLMASTERY"]` (Monk vs Merchant).
  - `passive_overrides` entries accept `weapon_types` (gate) and `matk_pct_per_lv`
    (Transmutation is the first passive granting %MATK; applied next to gear `bMatkRate`,
    before Amplify).
  - **PS-custom PASSIVES** now reach the picker: `ps_skill_desc_overrides.json` can ADD a
    constant the scrape doesn't know (that is how `PS_MC_TOOLMASTERY` exists at all), and
    `getPassiveSkillsForJob` appends any entry in its `PS_CUSTOM_PASSIVES` set whose
    `ps_custom_constants.json` job list matches. **Tool Mastery's id 2637 is provisional.**
  - **Card autocast on attack** (`_runCardAutocastBranches`, flag `PS_CARD_AUTOCAST_ON_ATTACK`):
    `gearBonuses.autocast_on_attack` was parsed but never consumed by any pipeline. It now
    produces a `proc_branches.card_autocast_<SKILL>` entry on **auto-attacks only**, priced
    through the same `_runBranch`/`_runMagicBranch` the player's own cast uses. Extending it to
    skill casts needs an attack-period model for the proc; deliberately left out for now.
  - **`itemScriptParser` fix**: `safeEvalInt`'s `compare()` returned a boolean `1` even when no
    comparison operator was present, so any arithmetic reaching it collapsed to 1. Hercules
    scripts embed comparisons inside arithmetic (`1+9*(getskilllv(X)==10)` = the cast level),
    which is exactly what the auto-Mammonite / auto-Bash cards need. It now returns the value
    when nothing was compared. (`evalArithmetic` still handles the comparison-free fast path.)
  - **New items** live in `ps_item_manual.json`; each carries a `_note` explaining the deviation
    (`_note` is stripped in `_applyPsItemLayers`, never reaching the item object). Veteran Axe
    reuses its real id **1384**; Whirling Hammer and Giant Pestle first sat in a reserved
    provisional 95xxx block because `tools.payonstories.com/api/pc/item` returned `No data` for
    both. **Both have since been re-keyed to their published ids — Whirling Hammer 8429**
    (in-game client tooltip, 2026-08-09) **and Giant Pestle 8430** (item API, 2026-08-10); the
    95xxx block is now empty (share links made before the re-key need the weapon re-picked).
    The API served PRE-rework text on 2026-08-09 for Veteran Axe (ATK 250 / req 80), FUEL Card
    (+30%), Pill Bug Card (+8%), Pirate Skel Card (Discount 5) and Flame Beetle Card (20%), so
    the patch was modeled from the rework PDFs ahead of the server deploy.
  - **API re-check 2026-08-10** (the day after the deploy — the API has caught up). Every
    reworked item now confirms what the PDFs gave us: Veteran Axe 1384 (ATK 155 / wlv 3 / req 60
    / 2 slots, +5·+4·+1% per mastered Smith Weapon skill, doubled at base DEX & LUK 80+),
    Crescent Scythe 1466 + slotted **1476** (0.1% crit leech PER REFINE — the GM's follow-up
    correction, not the flat 0.1% of the original notes), Whirling Hammer 8429 (ATK 190 / req 60
    / Blacksmith / +1% Cart Revolution per refine), Giant Pestle 8430 (Mace, ATK 100, wlv 3,
    req 58, Alchemist, +3/+12 ATK per Pharmacy level), Wootan Fighter 4261 (Magnum Break effect
    → 30%), Pirate Skel 4073 (5% auto-Mammonite, Lv10 for Blacksmiths), FUEL 90007 (+10% both
    skills, Flee +5), Pill Bug 90014 (+10% Cart Revolution). **One thing the PDFs did not carry:**
    Flame Beetle Card 8237's new combo line — see below.
  - **Pirate Skel + Flame Beetle Card combo** (`ps_item_combo_db.json`, surfaced by the
    2026-08-10 API re-check): *"Autocast Mammonite does not consume zeny and is unaffected by
    Zeny Pincher."* That IS a damage term here, because PS' Zeny Pincher halves Mammonite's
    per-level ratio term — so with both cards the proc keeps **600% at Lv10 instead of 350%**.
    Modeled as the PS-custom `bAutoMammoniteNoZeny` (→ `gear_bonuses.auto_mammonite_no_zeny`),
    which `_runCardAutocastBranches` turns into a `MC_MAMMONITE_zeny_exempt` skill_param on the
    PROC's build only; a manual Mammonite on the same character is still pinched. Flame Beetle's
    own 50% zero-zeny chance remains unmodeled (zeny economy, no damage surface).
- **Skill cooldowns (2026-08-10)** — pre-renewal Hercules has none, so the engine had none:
  `skillTiming` returned `max(after-cast delay, 100 ms)` and a skill with a documented cooldown
  span the 100 ms floor instead. PS documents them on the wiki ("Cast Delay : Global Cooldown and
  0.3s Cooldown"), and the bundled `ps_skill_db.json` predates that text — every entry still reads
  `"cast_delay": "Global Cooldown"` with no number. So they live in their own scraped file,
  `data/ps/ps_skill_cooldowns.json`, rebuilt by `scripts/scrape-ps-cooldowns.mjs` (re-run after a
  patch; it resolves page titles against the wiki's own `list=allpages` index because PS names and
  page names differ — "Thunder Storm" is filed under "Thunderstorm", NJ_ISSEN is "Killing Strike"
  in the DB and "Killing Stroke" on the wiki).
  - `profile.skill_cooldown_ms` holds them; `skillTiming` takes **max(after-cast delay, cooldown)**
    because a cooldown blocks only that skill while the delay blocks every skill — and DPS models
    spamming one skill. Applied AFTER the reduction block: a cooldown is fixed, so Bragi, delayrate
    gear and `after_cast_delay_reduction_pct` never shorten it (Acid Terror's page says
    "unreducable" outright).
  - Found on the first sweep of the 140 damage skills: **Demonstration 5 s, Charge Attack 3 s,
    Musical Strike 0.3 s, Throw Arrow 0.3 s, Acid Terror 0.22 s.** 37 skills have no wiki page at
    all (mostly transcendent), so those keep vanilla timing until PS documents them.
  - DPS impact where it binds: Demonstration **−85%**, Charge Attack **−80%**, Throw Arrow −19%,
    Musical Strike −5%. Acid Terror is unaffected — its 0.22 s cooldown is shorter than its cast.
  - **`bSkillCooldown`** (new PS-custom bonus, milliseconds, negative to reduce) lets gear move a
    cooldown; `gearBonuses.skill_cooldown` is added to the profile value, floored at 0. FUEL Card
    uses it for its −2 s on Demonstration (5 s → 3 s, which is +77% DPS for that build). This is
    the first bonus that touches a cooldown rather than a delay — do not reuse `bDelayrate`, which
    is a percentage on the after-cast delay and is reducible.
- **PS 2026-08-09 patch notes** (the GM announcement — carries changes the four rework PDFs
  do NOT mention; the PDFs are Merchant/Blacksmith/Alchemist only). Verified line by line:
  - **Crusader — Reflect Shield new formula**: `SkillLevel × ((SoftDef/2) + ⌊VIT/10⌋²) ×
    (100 + 2×Def) / 1000`, replacing the earlier PS rework's `SoftDEF × (1 + 1.75×HardDEF/100)
    × lv/10`. VIT is now QUADRATIC, which changes the stat priority for the skill entirely.
    Written with a single final floor (the notes floor only the VIT/10 term); ≤1 damage apart
    from flooring each step. Verified by hand: VIT 87 / SoftDEF 87 / HardDEF 0 / Lv5 →
    5 × (43.5 + 64) × 100/1000 = 53.75 → 53.
  - **Swordsman — Magnum Break's lingering effect now covers Magnum Break as well as auto
    attacks.** Acting on this exposed two problems. (1) The effect **was never modeled at
    all** — Hercules implements it as `SC_SUB_WEAPONPROPERTY` (skill.c SM_MAGNUM:
    `sc_start4(..., 3 /* Ele_Fire */, 20, ...)`), and pre-re battle.c adds it at the END of
    `battle_calc_elefix`: `temp = calc_base_damage2(rhw) × val2/100; damage += attr_fix(temp,
    Fire)`. So it is an extra chunk built from a fresh NORMAL-ATTACK base damage (not the
    skill's ratio'd damage) that lands AFTER defenseFix and therefore bypasses DEF. Now
    implemented at exactly that position in `_runBranch`, behind an
    `active_buffs.SC_SUB_WEAPONPROPERTY` toggle. (2) `SM_MAGNUM_ENDOW_ATTACK_ONLY` was a
    **no-op**: it rewrote `build.weapon_element` in `calculate()`, but the endow is already
    baked into the resolved `weapon` back in `resolvePlayerState`, so it changed nothing —
    and it keyed off `support_buffs.weapon_endow_sc`, which is the SAGE endow / Aspersio
    selector, not Magnum Break's buff (a Sage's Endow legitimately does apply to skills). The
    flag now scopes the real lingering-fire component instead: auto attacks + SM_MAGNUM.
  - **Wootan Fighter Card 20% → 30%** lingering effect: new PS-specific `bMagnumLinger`
    bonus, `assign` mode so two copies cap at 30 rather than stacking to 40.
  - **Skeleton Pirate Card** (the notes' name for Pirate Skel Card): the Lv10 auto-Mammonite
    upgrade is tagged `[Blacksmith]` in BOTH the PDF and the notes, so it is gated on JOB
    (`Class==10 || Class==4011`), not on the skill level alone — a Merchant or Alchemist can
    also master Mammonite and would otherwise wrongly proc Lv10.
  - **Crescent Scythe**: the announcement says a flat "0.1% of the damage", but the GM's own
    follow-up explicitly corrects it to **0.1% PER REFINE** ("I blame whoever told me to put
    that in the patch notes"). The follow-up wins; implemented per refine.
  - **Flame Beetle Card 20% → 50%** zero-zeny Mammonite chance: zeny economy, no damage term.
  - **Fruit Mix removed**: it exists in the item DB (12063 / 14565, a +3 DEX food) but is not
    reachable from any picker — the equipment pickers query IT_WEAPON/IT_ARMOR/IT_CARD and the
    consumables panel is a fixed list. No calculator surface, so nothing to hide.
  - **Freebreeze additions**: Frostfire Violin (8353) and Gangster Scarf (5361) already exist
    with correct scripts — these were availability changes (weapon box / shard shop), not item
    changes. The costumes and Ardent Helm are cosmetic (no combat stats). Antiquarian is an NPC.
  - **No calculator surface**: Gatling Fever's toggle removal (modeled as a buff either way),
    Setting Dirk's movement-buff fix, Reflect Shield gaining autocast/Hunter Fly leech
    (neither is a damage-formula term), reflect delay removal, monster/skill-unit interval
    changes, `@mi` Hit/Flee display fix, quest fixes, `@goal`.
- **PS 2026-08-09 GM follow-up notes** (posted after the rework PDFs) — triaged:
  - **Crescent Scythe (1466) and its slotted variant (1476)**: crit lifesteal, **0.1% of the
    damage dealt PER REFINE**, not a flat 0.1% (the GM corrected their own patch note). Modeled
    via a new PS-specific `bCritHeal` bonus read as PER MILLE, so the script is literally
    `bonus bCritHeal,getrefine()`. Computed on the main crit branch only
    (`crit.crit_heal`) and deliberately kept out of `avg_damage`/DPS — it is HP returned, not
    damage. The dual-wield off-hand and katar second hits are separate rolls it doesn't price.
  - **Ice Titan Card DEF now applies while under attack** (previously suppressed by the
    Overcrowding penalty): **no code change needed, and the note confirms current behaviour.**
    This calculator does not model Overcrowding (a 23+-enemy DEF penalty; it appears only in a
    PS skill description), so gear DEF was already treated as always-on. Ice Titan's +10 DEF is
    an `autobonus2`, i.e. a proc, so it still only shows under the "always proc" toggle — that
    is about proc modeling, not about Overcrowding.
  - **Skeleton Pirate respawn timers cut to 45–60 s**: no calculator surface. Spawn/respawn
    timers are not part of the bundled mob data and nothing in the UI reports them. Relevant
    only as farming context for the reworked Pirate Skel Card.
  - **Whirling Hammer is obtainable in-game via a Blacksmith quest**: now keyed by its REAL id
    **8429**, read off the in-game client tooltip (the public item API still returns `No data`,
    so the client is the authoritative source here — as it will be for anything else that ships
    before the API catches up). The client **disagrees with the rework PDF on two points** and
    wins: **Level Requirement 60** (PDF said 70) and **Jobs: Blacksmith** → `[10, 4011]` (the
    PDF gave no job restriction, so it had been modeled as all Merchant classes). ATK 190 /
    weight 350 / weapon level 4 / 1 slot / `Whirling_Hammer` / +1% Cart Revolution per refine
    all match the PDF. Giant Pestle followed on 2026-08-10, re-keyed from the provisional 95002
    to its published id **8430** once the item API listed it (all of its stats matched).
- Magic pipeline (#1 above moved to "Fully ported").
- Card slots on equipment — up to 4 per item, read from `item.slots`,
  written to `equipped["<slot>_cardN"]`, already consumed by
  `gearBonusAggregator.js` with no engine changes needed.
- Equipment search now filters by `loc` (was returning all `IT_ARMOR`
  items for every armor slot); `left_hand` searches both shields and
  off-hand weapons.
- Passive skill panel, filtered to an explicit allowlist of masteries that
  actually move ATK/MATK/hit/crit/ASPD (see `dataLoader.js#getPassiveSkillsForJob`).
- Grand Cross (`CR_GRANDCROSS`) — see the caveat in the table above; formula
  not verified against Hercules source, re-derive if that becomes possible.
- `BF_WEAPON_RATIOS` (vanilla table in `skillRatio.js`) filled out from 29
  to its full 52 entries, count-verified against upstream, spot-checked
  `GS_BULLSEYE`'s conditional race bonus end-to-end.
- `incoming_physical_pipeline.py` / `incoming_magic_pipeline.py` ported as
  `engine/calculators/incomingPipeline.js` (`calculateIncomingPhysicalDamage`
  / `calculateIncomingMagicDamage`), exposed via `POST /api/calculate/incoming`
  (`{ build, target: { mob_id }, direction: "physical"|"magic", opts }`).
  Reuses `buildManager.playerBuildToTarget` (was ported but never called —
  found and fixed a bug in it: player race was `"DemiHuman"`, every race
  lookup table elsewhere in this engine uses the hyphenated `"Demi-Human"`)
  and `cardFix.js`'s existing incoming-physical/magic functions. Includes
  the Lex Aeterna ×2 multiplier (`SC_LEXAETERNA`). Verified end-to-end
  against a real mob (Scorpion, id 1001) for both directions, and confirmed
  Lex Aeterna exactly doubles the result. **Frontend UI shipped** (2026-06-27)
  as the **Survivability panel** (`components/SurvivabilityView.tsx`): damage
  taken through DEF/MDEF and reduction gear, hits-to-down, effective HP, damage
  mitigated, dodge chance, and the FLEE needed for the 95% cap, plus the mob's
  damage-dealing cast skills (element/type only — PS-tuned skill power isn't
  shown). A monster's basic melee is priced as Neutral.

## Payon Stories per-class skill audit (against the PS wiki)

The Gunslinger audit (2026-07-07, see the CHANGELOG) cross-checked every PS-reworked
GS skill against [wiki.payonstories.com](https://wiki.payonstories.com) and turned up
several real damage bugs. **This pass has now been completed for all 14 class groups
below** (each verified with a DEF-bearing target, against the class's PS rework PDF where
one exists, else the wiki) — every item is marked ✅ done.
Classes are **sequenced by how many PS-custom overrides they carry** (weapon/magic
ratios, `passive_overrides`, `rate_bonuses`, `weapon_hit_counts`, `mastery_ctx_overrides`,
mechanic flags, …) — more custom changes ⇒ higher chance of a mismatch. Counts in
brackets are the number of PS-custom entries found across those tables.

**Bug classes to check for each skill** (every one of these was hit at least once in the GS pass):
- skill ratio wrong vs the wiki (per-level %, base, or race/size-conditional);
- hit count wrong or missing — single-hit in the vanilla DB but multi-hit on PS
  (e.g. Soul Bullet ×3), or a variable-hit spray (e.g. Desperado 1–10 range);
- passive HIT / ASPD / ATK per level undercounted (e.g. Single Action +4/lv, not +2/lv);
- stat-conversion or weapon-conditional passive not modelled (e.g. Dust +1 ATK/STR with a Shotgun);
- buff mechanic wrong — flat BATK where PS uses a % damage bonus (check `rate_bonuses`);
- an active skill's mastery bonus unreachable because the skill isn't surfaced in the passive
  panel (`DAMAGE_RELEVANT` / `ACTIVE_SKILL_TYPE_EXCEPTIONS` in `dataLoader.js`);
- a skill **removed** on PS still offered (e.g. Increasing Accuracy → gate behind a mechanic flag);
- gear bonuses parsed but dropped (see the bonus-routing audit under "Done this pass").

**Sequence (most PS-custom changes first):**

1. **Gunslinger [16]** — ✅ done. Fixed: Single Action HIT +4/lv, Soul Bullet ×3, Desperado 1–10
   range, Tranq Shot (Bull's Eye) Demi/Brute gate, Increasing Accuracy removed. Confirmed correct:
   Rapid Shower, Gatling Fever (+40% via `rate_bonuses`), Barrage/Madness Canceller (+30%), Wounding
   Shot, Ground Drift, Full Buster, Spread Attack, Triple Action, Chain Action, Snake Eye.
2. **Mage / Wizard / Sage [14]** — ✅ done (verified against the Sage Rework and Wizard/High-Wizard
   PDFs). Fixed: HW_NAPALMVULCAN (flat 100% MATK/hit + Shadow/Dark element + 50% MDEF ignore all
   levels), MG_SOULSTRIKE (flat 100%/hit base; +5%×lv vs-Undead bonus + 50% MDEF-ignore gated on
   lv10 both kept; fixed a vs-Undead crash), WZ_METEOR (flat 100%/hit). Confirmed correct:
   WZ_FROSTNOVA (175+15×lv, +10×FrostDiver, max 5), WZ_VERMILION (200×lv = 2000% @10),
   WZ_SIGHTRASHER (100+75×lv, max 5), WZ_FIREPILLAR (70+2×FireWall per hit × (2+2×lv) hits, +50%
   MDEF ignore, max 5), WZ_EARTHSPIKE / WZ_HEAVENDRIVE (140%/level), MG_FIREBALL (70→340%),
   WZ_AMPLIFYMAGICPOWER (10–50%, max 5), SA_ADVANCEDBOOK (max 5, Atk/ASPD). Not modeled:
   HW_GRAVITATION (fixed build-independent DoT, 400–1200/sec — nothing to compute).
3. **Thief / Assassin [12]** — ✅ done (verified against the Assassin Rework doc). Fixed: Enchant
   Poison / Venom Dust capped at level 5 (Enchant Poison's passive +2%/lv vs Poison-element monsters
   was reaching +20% instead of +10%). Confirmed correct: AS_SONICBLOW (500+40×lv = 900% @10) incl.
   the new crit rules (crit-eligible, Katar ×2 crit chance, crit bypasses DEF, excluded from Katar
   Mastery's +50% crit dmg — verified vs a DEF-100 target), AS_GRIMTOOTH crit, Katar offhand 2nd hit
   (21+4×KatarMastery = 61% @10), Envenom weapon element (TF_POISON_USES_WEAPON_ELEMENT), AS_SPLASHER
   (500+50×lv, max 10), AS_KATAR mastery (+4 ATK/lv, +50% crit dmg @10), Sonic Blow delay
   2000−(4×agi+2×dex), crit-shield removal (PS_CRIT_SHIELD_DISABLED). Added as toggles: Venom Dust
   Mailbreaker debuff (+10% phys & magic damage taken, works on MVP/boss) and the Cloak initiative
   opener (breaking Cloak Lv3+ → auto-attack ×2 / Sonic Blow +10%, per-hit only). Fully modeled.
4. **Rogue / Stalker [7]** — ✅ audited (Rogue Patchnotes PDF, with-DEF). Confirmed correct:
   RG_BACKSTAP (200+30×lv; +40% Opportunity via the `backstab_opportunity` toggle; DEF applies;
   auto-hit / IgnoreFlee), RG_RAID (600% @lv5; DEF applies), Yser Card (+10% Raid & Backstab, +5
   HIT), Vulture's Eye enabling bow Double Attack (proc = min(TF_DOUBLE, AC_VULTURE)). **Blocked:**
   Trick Arrow (PS_RG_TRICKARROW, 200% / 2 hits) and Quick Step (PS_RG_QUICKSTEP, 10%) are now
   resolvable — `getSkill`/`getAllSkills` fall back to `_psCustomBattleSkills()` (battle fields added
   to `ps_skill_db.json`), so both are selectable and compute (DEF applies). Only Holy Strike
   (PS_PR_HOLYSTRIKE) remains unsurfaced — a passive melee proc with a mismatched job array
   ([7, 4008] = Knight/LK) that needs its own review.
   **Plagiarism (2026-08-11):** a Rogue/Stalker build now carries the ONE copied skill in
   `flags.plagiarism` (`{name, level}`); `playerStateBuilder` folds it into `mastery_levels` after
   the job filter, gated on `profile.plagiarism_jobs` + `plagiarism_copyable` (the wiki's copyable
   list, in `serverProfiles.js`) and clamped to the skill's PS max rank. That is what makes a copied
   **Triple Attack** proc on auto-attacks — the only copyable skill the engine reads passively;
   everything else was already castable from the (job-unfiltered) skill picker. Reported by a player
   who had no way to record a copy without setting it as the damage skill. Open: the MvP-only ranks
   the wiki documents (Intimidate 10 off Samurai Spectre, Water Ball 6/10 off Drake/Ktullanux) exceed
   the skill DB's max and are clamped away — the picker has no notion of an above-max rank.
5. **Swordsman / Knight [6]** — ✅ done (Knight Patch PDF + wiki, with-DEF). Fixed: **Blade Mastery**
   (SM_TWOHAND, key SM_TWOHANDSWORD) now covers 1H swords — the fallback pointed at a non-existent
   `KN_TWOHANDMASTERY`, so 1H-sword Knights got no mastery ATK; **Counter Attack** always-crits (its
   id was hard-coded 8 = SM_ENDURE; real id 61); **Bowling Bash** scales 100+30×lv (was flat 400%,
   only right at Lv10). Confirmed correct: Counter Attack 200%, Spear Stab 100+40×lv (max 5), Sword
   Quickening (+1% crit/lv, 1H-sword 1/3 ASPD partial), Brandish Spear distance formula, Spear
   Mastery [5,7]. Non-damage rework items (Living Sword SP-free casts, Charge Attack timing) are out
   of a damage calculator's scope.
6. **Monk / Champion [6]** — ✅ done (Monk Rework PDF, with-DEF). All damage-relevant items already
   correct, no code changes: Triple Attack (100+40×lv, max 5; crits under Critical Explosion via the
   `taCritProc` path / MO_TRIPLEATTACK_PS_BONUS), Chain Combo (200+60×lv = 260→500%), Combo Finish
   (255+90×lv = 345→705%), Martial Arts/Iron Hand (MO_IRONHAND +5 ATK/lv +2 FLEE/lv, covers Fist and
   Mace via the PR_MACEMASTERY→MO_IRONHAND fallback), Asura Strike SP rework (consumes 20%×lv×MaxSP).
   **Corrected 2026-07-14** (against the PSRO Monk Rework 2026 PDF p.3 + wiki.payonstories.com/Asura_Strike):
   Asura's flat bonus is a **constant 1000 at all ranks** (was the vanilla `250+150×lv` = 400→1000), and
   PS Asura **does NOT ignore DEF** — it takes normal hard+soft DEF (vanilla flags it IgnoreDefense).
   Wired via the `MO_EXTREMITYFIST_NK_NORMAL_DEF` flag. Critical Explosion/Fury (17.5+2.5×lv crit =
   20→30% @Lv5), Demon Bane. **Open**: spirit-sphere ATK bonus (+3 ATK/sphere, standard pre-re Monk
   mechanic) is unmodelled — the PS wiki's Asura page doesn't restate it, so it needs confirmation +
   a spirit-sphere input before wiring. Other non-damage items (Absorb Spirits / Spirits Recovery SP,
   combo-ready buffs, Steel Body overcrowding, Ki skills, card sphere-refunds) are out of scope.
7. **Acolyte / Priest [6]** — ✅ done. Fixed: AL_HOLYLIGHT (flat 250% MATK + Cookie card +20% on
   PS, **plus the LUK% chance to deal +60% damage** — modeled as a pmf mixture so avg/range fold in
   the proc), PR_TURNUNDEAD (real fixed-damage formula (BaseLv+INT+SkillLv×10)×3×(1+LUK×3/200), Holy,
   ignores DEF/cards — was wrongly computed as 100% MATK; **now also displays the instant-kill
   success chance** [20×SkillLv + 3×LUK + INT + BaseLv + (1−HP/MaxHP)×200]/10 %, halved if base INT
   < 40, and folds it into Casts/Time to kill). Re-audited against the Acolyte/Priest
   rework PDF: fixed **Holy Strike** (PS_PR_HOLYSTRIKE — corrected its job from Knight [7,4008] to
   Priest [8,4009] and surfaced it via the PS-custom loader; 101+STR+BaseLevel% ATK Holy proc) and
   **Magnus Exorcismus** (full damage now also vs Ghost element + Undead race, not just Undead
   element + Demon race). Confirmed correct: Demon Bane, Mace Mastery (+expanded weapons), Turn
   Undead damage (rework only changed the *success* formula, not the fail-damage). Minor open item:
   Signum Crucis DEF cut is a flat 50% toggle (the rework levels it −14/−23/−32/−41/−50% at Lv1–5;
   50% = max is correct, but it doesn't scale by level).
8. **Crusader / Paladin [5]** — ✅ done (Crusader Rework PDF, with-DEF). Confirmed correct: Holy Cross
   (300+25×lv), Shield Boomerang (100+40×lv), Shield Charge (200+20×lv, NK ignore flee), Reflect
   Shield (SoftDEF×(1+1.75×HardDEF/100)×lv/10, ignores target DEF, hit roll), Spear Quicken (no crit;
   +1 HIT/lv, +1 FLEE/lv), Grand Cross (masteries apply; the SP/pushback changes aren't damage),
   Magnum Break semi-endow (attack-only). **Fixed:** Stone Discus (+5%/refine Shield Boomerang only,
   was +3% to Boomerang+Charge) and — surfaced by it — a broad **item-script arithmetic bug**
   (`getrefine()*N` and any arithmetic bonus value was capped at +1; now evaluated properly, fixing
   every refine-scaling item bonus). Providence's rework is defensive (MDEF, def-penalty) — out of scope.
9. **Ninja [5]** — ✅ done (PS wiki, with-DEF). Confirmed correct: Huuma (200+150×lv = 350→950%),
   Hyousensou (85% MATK/hit × 3–12 hits), Kasumikiri (375% @Lv10 base, ×1.4 while Hiding = 525%),
   Kirikage (Hiding 100/200/400/600/800; Not-Hiding 100/190/280/360/450 − 10×distance; +Crit via
   Shadow's Within), Raigeki Sai (150+60×lv = 210→450%). **Fixed:** Bakuenryu (300→900% = 150+150×lv;
   was a flat 300% from the DB fallback) and **NJ_ISSEN (Killing Stroke)** — implemented its fixed
   HP-sacrifice formula (STR×40 + HP×8%×lv, Neutral, auto-hit, DEF+cards apply) via a dedicated
   `_runKillingStrokeBranch`; was computing a flat 100% ATK. **Mirror Image's +10–30% is now
   modeled too** (see "Done this pass"), which retires the upstream `NJ_ISSEN_MIRROR_BONUS` flag.
   Ninja Aura (SC_NJ_NEN) was already a buff entry and its +2 STR/lv feeds the ×40 STR term.
10. **Alchemist / Creator [3]** — ✅ done (PS wiki, with-DEF), **re-audited 2026-08-09 against
    `PayonStories Alchemist Rework 2026-08-09.pdf`**. Acid Demonstration unchanged (200+40×lv =
    240→400%, weapon-ATK-based with size penalty, DEF applies, ignores %-cards but +ATK cards
    apply). **Changed by the rework:** Acid Terror is now `(100+100×lv)%` = 200→**600%** at its
    rank-5 max (was 100+80×lv = 180→500%); **Axe Mastery became Transmutation** — no flat ATK at
    all, instead +1% ASPD **and +1% MATK** per level while wielding an Axe **or a Sword** (this is
    why `passive_overrides.AM_AXEMASTERY` carries `aspd_pct_per_lv`/`matk_pct_per_lv`/`weapon_types`
    instead of `atk_per_lv`, and why its old `lv10_rate` ASPD entry was dropped); Chemical
    Protections cap at rank 3. **FUEL Card** cut to +10% on both skills (was +30%). **New item:**
    Giant Pestle (1H Mace, ATK 100, Alchemist-only, +3/+12 ATK per Pharmacy level at base DEX &
    LUK 60+/80+). FUEL's **−2 s Demonstration cooldown IS modeled** as of 2026-08-10 (see the
    cooldown section below). **Not modeled (no damage surface):** Demonstration's SP cost 14→20
    (the calc models no SP costs); Bio Cannibalize's
    plant INT/AGI/HIT retune, Learning Potion's potion-conservation chance, the Potion Pitcher
    effect table, Tengu Card, Plant Bottle (summons/support); Remote Detonator itself — it is the
    *applier* of Burning, which IS modeled as a target debuff (see below).
11. **Merchant / Whitesmith [3]** — ✅ done (PS wiki, with-DEF), **re-audited 2026-08-09 against
    `PayonStories Merchant 2026-08-09.pdf` + `PayonStories Blacksmith 2026-08-09.pdf`**. Over Thrust
    / Power-Thrust unchanged (+5%/lv ATK to caster AND party, additive on the skill multiplier).
    Cart Termination still isn't a PS skill. **Changed by the rework:** **Cart Revolution** is a
    5-rank tree skill at `50×lv%` (50→250%; the old flat 250% was right only at max rank) and deals
    full damage regardless of cart weight; **Zeny Pincher** halves only the per-level term —
    `100+25×lv` = 350% at Lv10, replacing the old ×0.4-of-the-whole-ratio model (240%) — and is now
    reachable as the `SC_PS_ZENYPINCHER` self-buff toggle (before this it was an unreachable
    `skill_param` no UI ever set); **Tool Mastery** (new, `PS_MC_TOOLMASTERY`) gives +4 ATK/lv with
    Axes and Maces and is routed via `mastery_prefer_fallback` so it wins over the now-ATK-less Axe
    Mastery and over the Priest's Mace Mastery; **Crazy Uproar** is 4 ranks giving +1 STR/+1 VIT per
    level and 3×lv (self) / 2×lv (party) soft DEF; **Adrenaline Rush** covers every melee weapon at
    30%/20% (Axe·Mace, self/party) and 20%/10% (other melee) — the previous code passed the raw buff
    VALUE (the UI sent `2`) straight in as a per-mille amotion cut, so the buff was worth 0.2% ASPD;
    **Smith Weapon** skills master at rank 4 with Smith Two-Handed Sword folded into Smith Sword.
    **Cards:** Pill Bug +10% Cart Revolution (was 8%); Pirate Skel Card became a 5% auto-Mammonite
    (Lv10 once mastered), which drove the new generic card-autocast proc branch. **New items:**
    Veteran Axe [2] retuned (ATK 155, level 60, scaling per MASTERED Smith Weapon skill, doubled at
    base DEX & LUK 80+), Whirling Hammer [1] (2H Mace, ATK 190, +1% Cart Revolution per refine).
    **Not modeled (no damage surface):** Barter (the merged Discount/Overcharge — zeny economy),
    Pushcart's movement speed (rank cap applied anyway), Hilt Binding no longer extending buff
    durations (durations aren't modeled), Flame Beetle Card's own 50% zero-zeny chance and
    Mammonite's zeny cost, Sasquatch / Grizzly card status procs (freeze/blind chances).
    (Flame Beetle's *combo* with Pirate Skel Card IS modeled — it exempts the autocast from
    Zeny Pincher, which is a ratio term; see the 2026-08-10 API re-check above.)

    **New cross-class mechanic — Burning** (`PayonStories Burning 2026-08-09.pdf`): a 5-second
    debuff stacking to 5, each stack −2 hard MDEF and 60 Fire MAGIC damage/second, refreshed (not
    re-timed per stack) on reapplication. The MDEF cut is applied as a target mod
    (`target_mods.burning`, profile constants in `PAYON_STORIES.burning`) so it feeds the magic
    branch like any other MDEF change. The tick itself is surfaced in the UI as a raw
    60×stacks/second figure **explicitly labelled as pre-mitigation** — it is Fire magic damage
    subject to the target's Fire resist / MDEF / armour element, and it is the debuff's damage
    rather than part of the player's hit, so pricing it inside the attack breakdown would be
    misleading. Applied by Alchemist Remote Detonator (with a Marine Sphere Bottle) today; the PDF
    says it will be core to another class, so keep the profile constants as the single source.
12. **Archer / Hunter [3]** — ✅ done (Hunter Rework PDF, with-DEF). All correct, no code changes:
    the PS INT/DEX trap formulas were already implemented and match the PDF's comparison table exactly
    (Land Mine SkillLv×(JobLv+Dex)×(BaseLv+Int)/45, Blast Mine .../45 with Dex/Int roles swapped,
    Freezing Trap & Claymore Trap the same pattern /70 → for 99/50 DEX150/INT100: LandMine 4422,
    BlastMine 4150, FreezingTrap 2842, Claymore 2667). Traps correctly bypass DEF and auto-hit
    (IgnoreDefense/IgnoreFlee). Card bonuses verified applying via bSkillAtk: Dory (+5% Freezing/
    Claymore), Wolpertinger (+5% Land/Blast), Setting Dirk (+5% all four traps). Vulture's Eye
    contributes its +Hit as expected.
13. **Bard / Clown [2]** — ✅ done (PS wiki + in-game skill DB, with-DEF). Fixed **Arrow Vulcan**
    (CG_ARROWVULCAN): it had no ratio in any table and fell back to a flat 100% at every level; now
    `200 + 100×lv` → Lv1 300% … Lv10 1200% (matches vanilla and the PS in-game description; PS did
    not rework it — added to weapon_vanilla_ok). Musical Strike already correct via PS override
    (175+25×lv → Lv1 200%, Lv5 300%). Musical Lesson passive gives +5 ATK/lv as configured. The
    wiki's "+100% while performing" Musical Strike bonus is now modeled via a **Performing**
    target-panel toggle (skill_params.PS_PERFORMING_active → +100 ratio points on Musical Strike /
    Throw Arrow only). Arrow element for these arrow-consuming skills already flows through the
    equipped arrow's `bonus bAtkEle` script (verified: Fire→Earth 1.5, Holy→Shadow 1.25, etc.).
14. **Dancer / Gypsy [2]** — ✅ done (PS wiki, with-DEF). All correct, no code changes: **Throw
    Arrow** (DC_THROWARROW) already carries the PS override `175+25×lv` → Lv1 200%, Lv5 300%
    (the Dancer mirror of Musical Strike, verified live). **Arrow Vulcan** (shared with Gypsy) was
    fixed in item 13 and verified here too (Lv10 1200%). Dancing Lesson passive gives +5 ATK/lv
    and +10% crit at Lv10 as configured. The "+100% while performing" bonus applies here too via
    the same Performing toggle (item 13).
15. **Super Novice [23]** — ✅ done (wiki.payonstories.com/Super_Novice, 2026-07-16 audit).
    **Equipment**: the Hercules item DB has no SN job bit — the game equips SN via the Novice
    base-class mask, so all job filters map 23 → 0 (fixed; SN-only gear like the Super Novice Hat
    is EquipLv-gated instead). The **Angel's Protection Set** 5-piece combo (Kiss_Of_Angel +
    Angels_Protection/Warmth/Arrival/Safeguard → MaxHP +900, MaxSP +100) was already in the vanilla
    combo DB and matches the PS item API exactly; piece scripts verified. **Skill tree** (57 skills =
    all six 1st-class trees, no bow skills) matches; the damage picker is job-agnostic so Bash /
    Magnum / Mammonite / Envenom / bolts / Heal-bomb all work with their audited ratios. **Job
    bonuses** (+5 all stats by JL68, breakpoints STR@49/AGI@52/VIT@56/INT@60/DEX@64/LUK@68) match the
    wiki; JL cap 99. **HP/SP**: base = Novice table (Hercules `Inherit: Novice`) + the PS staged
    bonuses (L40+100 … L99+1000 = +2400 HP; +10 SP per 10 levels from 20 + 30@99 = +110 SP) — already
    modeled via `sn_hp_bonus`/`sn_sp_bonus`. **Added this audit**: SN **Fury chant** toggle
    (grants Explosion Spirits at Lv 13 → PS formula 175+25×13 = +50% crit, matching the wiki's
    "critical rate +50"; same formula as the Monk's cast), **Attention Concentrate** made
    available to SN (AC_CONCENTRATION is in its tree), and the **never-died** toggle (job 70+ without
    dying → +10 all stats, `flags.sn_never_died`). **Deferred**: Mental Strength (post-99 Steel Body
    at 0 HP after 99,999,999 exp — survivability-only, needs a Steel Body toggle that Monks don't
    have either); Guardian Angel level-up buffs (one-shot Kyrie/Magnificat/Gloria/Suffragium/
    Impositio — obtainable via the existing Priest support-buff toggles); Soul Harvest (no damage
    surface).

Cross-cutting PS mechanics to keep in view while auditing any class: `PS_BLEEDING_REVAMP`,
`PS_GRANDCROSS_MASTERY_APPLIES`, `SC_AMPLIFYMAGICPOWER_SCALING`, `PS_CRIT_SHIELD_DISABLED`, and the
`SC_TWOHANDQUICKEN` / `SC_SPEARQUICKEN` / `SC_EXPLOSIONSPIRITS` reworks.

### Transcendent / niche combat skills still unmodeled (deferred — 2026-07-10 sweep)

These surfaced in the 2026-07-10 full exposed-skill sweep. They currently fall through to a **flat
100% ratio** (no entry in any ratio table) or need a dedicated branch, and were **not** part of the
per-class audit above (that pass targeted PS-*reworked* 2nd-class skills). No PS wiki pages exist for
them, so the formulas below are **vanilla pre-re** (PR-Hercules `battle.c`) and should be confirmed
against in-game PS behavior before implementing. The user confirmed these classes *are* usable on PS.

Simple ratios (add to `PS_BF_WEAPON_RATIOS` / `BF_WEAPON_RATIOS`; the value is the full % incl. the
100 base):

- **CH_TIGERFIST** (Tiger Knuckle Fist): `40 + 100×lv`. battle.c:2073 (`100×lv − 60`).
- **CH_CHAINCRUSH** (Chain Crush Combo): `400 + 100×lv`. battle.c:2076 (`300 + 100×lv`).
- **CH_PALMSTRIKE** (Raging Palm Strike): `200 + 100×lv`. battle.c:2079 (`100 + 100×lv`).
- **LK_HEADCRUSH** (Head Crush): `100 + 40×lv`. battle.c:2082.
- **LK_JOINTBEAT** (Joint Beat): `50 + 10×lv` base, **×2** with the Break-Neck ailment. battle.c:2085.
- **SN_SHARPSHOOTING** (Sharp Shooting): `200 + 50×lv`; also **auto-critical** (`cri += 200`) and a
  splash skill. battle.c:2094.

Special mechanics (need a dedicated branch, not a plain ratio):

- **PA_PRESSURE** (Gloria Domini): **fixed** damage `500 + 300×lv`, ignores ATK/DEF/element entirely
  (BF_MISC). battle.c:3951.
- **PA_SACRIFICE** (Martyr's Reckoning): **%-of-caster-max-HP** per hit, self-damaging — not an ATK
  ratio. battle.c:2115 / 3948.
- **PA_SHIELDCHAIN** (Shield Chain): shield-weight base + `100 + 30×lv`% ratio; needs shield
  weight/refine inputs. battle.c:2118.
- **LK_SPIRALPIERCE** (Spiral Pierce): weapon-weight × target-size, fixed **5 hits** (pre-re; the
  renewal `50×lv` ratio is `#ifdef RENEWAL` only). battle.c:4834 / 5050.
- **HW_MAGICCRASHER** (Stave Crasher): weapon hit whose base substitutes **MATK** for weapon ATK,
  100% ratio, single hit, pierces MDEF. battle.c:3610 (`flag&4` / `flag.imdef=2`).
- **KN_CHARGEATK** (Charge Attack): distance-tiered **100 / 200 / 300%** (+100% per 3 cells, cap
  300%); needs a distance input. battle.c:2200.

Also drop **HT_POWER** from the picker — it's not a real PS player skill (internal Hercules ID,
`−50 + 8×STR`), not a damage skill to model.

## Suggested order for finishing the port

1. ~~Fill in the rest of `skill_ratio.js`'s `BF_WEAPON_RATIOS` table~~ — done, see above.
2. ~~Port `incoming_physical_pipeline.js` / `incoming_magic_pipeline.js`~~ — done, see above. ~~Still needed: frontend UI for it.~~ Frontend UI shipped (Survivability panel).
3. ~~Flesh out `PAYON_STORIES` in `serverProfiles.js`~~ — partially done (see
   "Partially ported" above: weapon/magic ratios + vanilla_ok + 4 mechanic
   flags); ~13 mechanic flags still need new modifier code, 3 PS-custom
   skills need a `getSkill()` data-source fix.
4. Remaining BF_MISC skills, then the remaining GUI sections (buffs,
   consumables, combat controls) as their own frontend panels.

## Non-damage clause coverage audit (2026-07-12)

**Why this exists.** The per-class audit above verifies *damage numbers* (ratio × DEF × cards ×
masteries). But many skills carry **non-damage clauses in their description** — accuracy/hit-rate
bonuses, auto-hit, crit enable/bonus, forced element, multi-hit count, ignore/reduce-DEF — that also
change the calculator's output (hit%, crit%, damage, DPS). Those were never a checklist item, so
gaps hid in plain sight (Holy Cross's documented +20% accuracy was in the data the whole time). This
section makes that category a standing punch-list.

**How to re-run the sweep.** Extract every PS player-skill description clause and bucket by whether it
touches calc output. A regex scan over `data/ps/ps_skill_db.json` descriptions for
`accuracy|hit rate|always hit|never miss|ignore (flee|def|mdef)|critical|hits (twice|N times)|forced?
element|reduces? def|size` (dropping NPC_/mercenary/homunc/3rd-job/guild prefixes) flags ~100 skills
across 9 categories. Cross-check each flagged clause against the engine and mark modeled/gap. Prefer
this **description-clause** pass over trusting `levels[].effect` (damage-only) fields.

### Fixed in this pass
- **CR_HOLYCROSS** — +20% accuracy bonus (`hitChance.js` `SKILL_HITRATE_PCT_BONUS`).
  **Corrected 2026-08-11:** it is **+2% of hitrate per rank** (2/4/…/20 at Lv1–10 —
  wiki.payonstories.com/Holy_Cross "Accuracy Bonus" column), not a flat 20% at every rank. The
  scraped one-line skill description only quotes the Lv10 value, which is what the flat read came
  from. Reported by a player (accuracy didn't move with Holy Cross rank).
- **PA_SHIELDCHAIN** — +20% accuracy bonus (same table; battle.c:4713 groups it with Holy Cross).
- **SN_SHARPSHOOTING / MA_SHARPSHOOTING** — +20 crit was DEAD: `critChance.js` hardcoded ids
  (280/357) never matched the loaded skills.json ids (382/8215). Re-keyed to skill **name**.
- **KN_PIERCE / ML_PIERCE** — hits by target size (Small 1 / Medium 2 / Large 3), was flat 3
  (battle.c:4395 `wd.div_ = size+1`). Added size-based `weapon_hit_counts` fns in `serverProfiles.js`.
- **The rest of the accuracy table** (2026-08-11, surfaced by the Holy Cross correction — only Holy
  Cross and Shield Chain were ever in `SKILL_HITRATE_PCT_BONUS`, so every other documented accuracy
  bonus was silently missing): **SM_BASH** +5%/lv, **SM_MAGNUM** +10%/lv, **KN_PIERCE** +5%/lv,
  **KN_AUTOCOUNTER** +20%, and **BS_WEAPONRESEARCH** +2%/lv — the last a *passive* that rides on
  every attack (battle.c:5355 "Weaponry Research hidden bonus"; the wiki lists +Accuracy% as a third
  column beside its +HIT and +ATK, both of which were already modeled). All confirmed on the PS wiki
  skill pages, all vanilla-parity values. Sources now SUM into one multiplier as battle.c does.

## Max-level audit (2026-08-11)

**Why.** Power-Thrust shipped in the buff picker at 10 ranks for a 5-rank skill, adding +50% to
every skill ratio instead of +25% (a player spotted Cart Revolution priced at 300% vs 275%). The
*range* of an input had never been audited — only formulas. This is that sweep, for every skill.

**Method.** For all 500+ non-3rd-job skills, compare what the loader SERVES (`_applySkillCap`)
against `ps_skill_db.json`'s scraped max and the vanilla DB, then evaluate every profile ratio fn
at its served max to catch out-of-range tables.

**Findings.** No skill whose level scales damage was mis-served, and no ratio/proc table breaks at
its max (0 of both). 33 skills disagreed with the scrape: 11 are deliberate profile overrides
(reworks the scrape can't see), 22 were unexamined.

**Fixed.** `_applySkillCap` now resolves **profile override > PS scrape > vanilla**, taking the
scrape's max only when it is backed by a matching per-level table — a record scraped without one
can hold a placeholder (Falcon Assault reads 1 there). That corrected 11 skills the picker served
at the vanilla count, including **Joint Beat 10 → 5**, **Free Cast / Advanced Book / Amplify
Magic Power / Watery Evasion 10 → 5**, **Double Casting and Cast Cancel 5 → 1**, and the Sage
element fields 5 → 3 — and it closed a split-brain where the passive picker already showed the PS
number while the skill picker showed vanilla's. Five more were settled from the live wiki infobox
("Levels: N") as explicit overrides: **Strip Weapon/Armor/Shield/Helm 5 → 3**, **Abracadabra
10 → 5**. `battlePipeline` now clamps a cast to the served max, not just to an explicit override,
so share URLs made under the old counts stop computing with ranks that don't exist.

**Still unresolved (4).** `SN_FALCONASSAULT` (scrape 1, no table, no wiki page — vanilla 5 kept),
`ST_FULLSTRIP` (scrape 3), `PF_FOGWALL` (scrape 1), `CR_ALCHEMY` (dead skill). None scale damage.
Re-check after any wiki update.

~~**Adjacent finding — LK_JOINTBEAT has no PS ratio**~~ — **fixed 2026-08-17.** It had no PS
entry, so it fell through to vanilla's `50 + 10×lv` (battle.c:2085) — 60% at Lv1 rising to only
**100% at Lv5**, and flagged "⚠ Vanilla fallback (PS unaudited)" in the breakdown. The bundled
scrape carries the real PS table: **40% per level** (40/80/120/160/200% at Lv1–5, its PS max),
now in `PS_BF_WEAPON_RATIOS` with the `lordknight-joint-beat-lv5` golden. So PS Lv5 is **double**
what the calc showed, while Lv1–2 were over-reported. The ×2 Break-Neck ailment multiplier stays
unmodeled — it needs the target to already carry that status.

### Open gaps (verified, prioritised) — punch-list
- ~~**Gunslinger coins + Fling**~~ — **implemented 2026-08-21**, gated on `GS_FLING_PS_FORMULA`.
  Coins are now a build resource (`gs_coins`, 0–10, serialised under `flags` like `spirit_spheres`,
  Gunslinger-gated in the Buffs panel). Fling is BOTH halves, deliberately split: its **damage** is
  `_runFlingBranch` — `(jobLvl + baseLvl)` per coin, capped at the 5 the skill spends even though 10
  can be held — and its **DEF cut** is a target debuff (`target_mods.fling`, 0–5 coins,
  `def_percent -= 3 × coins`), because a Gunslinger in your party can Fling for everyone.
  `dps_valid: false`: coins are a finite pool, not a rate.
  Sources: wiki.payonstories.com/Fling (raw page, not a model summary — "Consumes up to 5 coins",
  "Reduces targets Hard Def by 3*coins used", "Does (jobLvl+baseLvl) dmg per coin used. This damage
  is not affected by Barrage, target defense or element", "Only reduces Soft Def against players")
  and wiki.payonstories.com/Flip_the_Coin ("Caster can have maximum 10 coins").
  **PS retuned the rate**: Hercules is 5%/coin (`status.c:8714`, `val2 = 5*val1`); PS is 3%.
  The DEF cut rides `def_percent`, the SAME field as Provoke, and that is load-bearing rather than
  lazy: Hercules applies def_percent to soft DEF only when the target is a player (`battle.c:1494`)
  but to hard AND soft for a monster (`1510-11`), so the wiki's "Only reduces Soft Def against
  players" falls out of the shared field with no special case. A test asserts `defenseFix` still
  branches on `is_pc`, since that note breaks silently if it stops.
  "Not affected by Barrage" is why the damage has its own branch instead of the normal chain:
  Barrage is the Gunslinger's +30% damage buff (`rate_bonuses.SC_GS_MADNESSCANCEL`) that every
  OTHER Gunslinger skill does get.
  **Boss behaviour — VERIFIED 2026-08-21, no longer an assumption: Fling DOES affect bosses.**
  Hercules gates boss status-immunity two independent ways and GS_FLING passes both. (1) An
  explicit per-skill guard: Provoke has one (`skill.c:7691`, `if ((tstatus->mode&MD_BOSS) || ...)
  return 1`), Fling's call site does not — `skill.c:2032` is a bare
  `sc_start(src, bl, SC_FLING, 100, ...)` inside `skill_additional_effect` with no mode check.
  (2) The generic `is_boss_resist_sc(type)` in `status_change_start`, which returns true only for
  common ailments or a status carrying the `NoBoss` flag from `db/pre-re/sc_config.conf`. That file
  gives SC_FLING no Flags block at all —
  `SC_FLING: { CalcFlags: { DefPerc: true }  Skill: "GS_FLING" }` — while SC_PROVOKE has
  `Flags: { Debuff: true  NoBoss: true }`. 40 statuses carry NoBoss in pre-re, so the absence is
  meaningful rather than an empty file. That entry independently confirms the field this uses:
  `DefPerc` IS `def_percent`.
- **The rest of the coin economy is documented but unmodelled** [low–med] — from the **Gunslinger
  Release Patch Notes PDF** (Downloads folder, Friekshow, 2025-03-01), the authoritative source for
  this class, which had not previously been read. Coin costs: **Barrage 2** (+20% ASPD, +30% DMG,
  20 s — replaces the Run and Gun buff), **Run and Gun 1** (+30% ranged resist, +30 FLEE, 1 min —
  replaces the Barrage buff; the two are mutually exclusive), **Soul Bullet 1**
  (`100 + DEX + BaseLvl` ×3, Ghost), **Tranq Shot 1** (100% ATK, ignores DEF, not affected by
  cards), **Disarm 1**. Coin Flip itself: `(2×lv)²` zeny for `2×lv` coins, 3 s cast reducible by
  DEX, `(2×lv)%` chance to cost no zeny.
  Barrage's +30% and Gatling Fever's +40% were ALREADY modelled (`rate_bonuses`).
  **Coin accounting added 2026-08-21** (frontend): the Buffs panel totals what a build is asking
  its pool to pay for — Barrage 2, Run and Gun 1, plus the selected skill (Soul Bullet / Tranq Shot
  / Disarm 1 each, Fling up to 5) — and says "Spending N of M" or "Needs N — X short" in `--crit`.
  Fling counts ONLY when it is the selected skill: the Fling entry under target debuffs is someone
  else's Gunslinger, whose coins are not yours. The engine still prices exactly what was asked for
  rather than silently shrinking Fling to what is affordable; the panel reports the shortfall
  instead. **Barrage and Run and Gun are now mutually exclusive** (each "replaces" the other per the
  PDF), enforced inside `updateBuffField` so it holds however the buff is set.
  Still unmodelled: `GS_BULLSEYE`'s bleed chance, which the PS description says differs "with
  coins".
- **Wildcard card mix for SHIELDS (racial resist)** [low, player-requested 2026-08-18] — the
  wildcard system covers the OFFENSIVE dicts (`add_race`/`add_size`/`add_ele`/`add_race2`, merged in
  `playerStateBuilder`). A shield wildcard wants the DEFENSIVE side (`sub_race`), a different dict on
  a different path. **Verify rather than assume it lands**: `bSubSize` turned out never to be
  aggregated at all (fixed 2026-08-17), so the defensive path has a track record of silently
  dropping bonuses — write the assertion first.
- **Incoming cardfix: two defender terms still unmodelled** [low] — `calculateCardFixMagic` now
  applies the full Hercules BF_MAGIC defender set (battle.c:1132-1156) when a caster is passed:
  `subele`, `subsize`, `subrace[race]`, `subrace[Boss/NonBoss]`, the LONG ranged rate (magic sets
  `ad.flag = BF_MAGIC|BF_SKILL` with neither BF_SHORT nor BF_LONG, so the `else` branch always
  wins — Skotlex's "ranged defense also counts vs magic"), and `magic_def_rate`. Not modelled:
  **`subrace2`** (RC2 family resists, e.g. an Orc-family card) and **`add_mdef`** (bAddMonsterDef
  per monster class), neither of which the gear aggregator collects. Also, the PvP path
  (`calculateCardFixMagic` with no caster) keeps the old Demi-Human-only behaviour: correct for the
  race term since a player caster IS Demi-Human, but it skips the size (players are Medium) and
  boss terms. Deliberate — passing a caster there would move PvP numbers with nobody having
  verified them.
- **Incoming damage rounds slightly high vs the client** [low, ~1 per reduction step] — Hercules
  accumulates every cardfix reduction into ONE integer per-mille factor (`cardfix`, starting 1000)
  and applies a single `damage * cardfix / 1000` at the end, whereas this engine `scaleFloor`s the
  pmf once per reduction, flooring at each step. With −5% size and −30% race on 13564: Hercules
  does `1000→950→665` then one multiply = 9020; we do `floor(13564×0.95)=12885` then
  `floor(12885×0.70)=9019`. Off by one here, and it compounds with the number of reductions — the
  likely source of a player-reported 10047-vs-10055 gap. Fixing it means accumulating a per-mille
  factor through `calculateCardFix*` and applying it once, which moves every incoming golden by a
  point or two, so it wants doing deliberately rather than as a drive-by.
- **Monster-cast 3rd-job skills: 4 still unpriced** [low–med] — `FLAT_UNMODELED_SKILLS` in
  `mobSkillRatios.js` holds `WL_CRIMSONROCK`, `RK_SONICWAVE`,
  `SO_CLOUD_KILL`, `LG_RAYOFGENESIS`. (`SC_MAELSTROM` left this list 2026-08-17 — it deals no
  damage at all, it converts cells to dead cells, so it is now in `NO_HP_DAMAGE_SKILLS`. NB
  `mob_skill_db.json`'s generator marks it `dmg:true` because its rule is "Magic|Weapon and
  targets a foe" and Maelstrom is Magic at `around1` — the classification is what corrects it.)
  No PS player can learn them, but monsters
  cast them, and their vanilla formulas are behind `#ifdef RENEWAL` — so on a pre-renewal server
  whatever they do is custom and undocumented (the wiki's monster pages list a skill's level and
  trigger rate but never a formula, and kokotewa returns "Unknown skill"). They show element and
  type only, deliberately. **`GC_DARKCROW` (Dark Claw) came off this list 2026-08-17** when the PS
  value was supplied directly: **100 × SkillLv per hit, over the skill's 3 hits** — so Twinorc's
  Lv2 cast is 3 × 200% = 600% of its ATK, at a 40% trigger rate. It lives in
  `PS_BF_WEAPON_RATIOS` rather than `MOB_SKILL_RATIOS` **on purpose**: the incoming path checks
  `profile.weapon_ratios` first and reports a hit there as PS-exact, while `MOB_SKILL_RATIOS`
  flags `estimated: true` (correct for a Hercules-baseline guess, wrong for a known PS value).
  The `GC_` prefix keeps it out of the player skill picker regardless.
  **`AB_ADORAMUS` and `WL_DRAINLIFE` came off the same day**, into `PS_BF_MAGIC_RATIOS` for the
  same reason: **Adoramus 1400% MATK** (Holy; its `number_of_hits` is −10, i.e. cosmetic, so the
  ratio is the whole skill and lands once) and **Drain Life 750% MATK** (Neutral; its HP drain is
  not modelled). **Both are FLAT and verified at exactly one level** — Lady Huo (mob 3049) is the
  sole caster of either, at Adoramus Lv10 and Drain Life Lv3. Per-level scaling is unknown and was
  deliberately NOT guessed (1400/10 and 750/3 both divide evenly, which is suggestive, not
  evidence). A test pins the caster-and-level set for both, so a `monsters.json` regeneration that
  adds a caster or shifts a level fails loudly rather than letting a flat constant quietly become
  a fabricated number at a level nobody verified.
  The remaining five unblock the same way — one measured/quoted PS formula each, not code.
- ~~**AM_SPHEREMINE (Sphere Mine)**~~ — **implemented 2026-08-17** (`_runSphereMineBranch`), gated on
  the `AM_SPHEREMINE_PS_FORMULA` flag. Player-requested in Discord alongside Acid Terror.
  `wiki.payonstories.com/Sphere_Mine`: **`1000 + 200 × SkillLv + 25 × Total VIT`**, Fire element,
  and its Notes are explicit that it "ignores DEF" and is "not affected by weapon size penalties"
  (the old formula was `2000 + 400×SkillLv`; the Marine Sphere Bottle cost was removed; cooldown
  0.5 s, now in `ps_skill_cooldowns.json`). Fixed damage — no weapon roll, no crit. Dispatched
  ABOVE the NoDamage guard and given an explicit picker exemption in `routes/data.ts`, because the
  vanilla DB types it "Place"/NoDamage with a null `attack_type`. **Assumption:** attacker card
  bonuses are not applied (the wiki enumerates DEF and size and is silent on cards; this is
  summon-detonation damage, i.e. the BF_MISC family — see the entry above). `bSkillAtk` IS applied,
  the one attacker term `battle_calc_misc_attack` honours.
  **NB the wiki's "The summoned Marine Sphere is Water 3 property" is the SPHERE's own defence**
  (it is why a Demonstration can launch spheres without damaging them), NOT the element of the
  explosion, which the same Notes state is Fire. Don't "fix" this to Water.
  **Process lesson — the one that cost the most here:** this was first written up as *blocked on
  data*, on the strength of `ps_skill_db.json` describing a pre-rework "custom HP formula" with
  damage equal to the sphere's remaining HP, plus the Alchemist rework PDF not mentioning the skill
  at all. Both are true and both are stale. **The bundled scrape cannot see a post-scrape rework —
  fetch the live wiki page before calling any PS formula undocumented.** Vanilla was a red herring
  too: there the sphere really is mob 1142 detonating via `NPC_SELFDESTRUCTION` for `sstatus->hp`
  (battle.c:4467), a mechanic PS deleted outright.
- **BF_MISC takes NO attacker card bonuses — traps still do** [med]. Established while chasing a
  player-reported DPS gap against the jaludev calc. `battle_calc_misc_attack` (battle.c:4341) never
  calls `battle_calc_defense`, and `battle_calc_cardfix`'s `case BF_MISC` (battle.c:1354) has ONLY a
  `tsd` (defender) block — unlike `case BF_WEAPON` it has no attacker-side `sd` branch at all, so
  `right_weapon.addrace[...]` never reaches Misc damage. In PvE `tsd` is NULL, making the whole call
  a no-op; `battle_calc_cardfix2` is `#ifdef RENEWAL`, dead pre-re. **Fixed for the falcon**
  (`falconCalc.js`, 2026-08-17 — it was doubling on 4× Abysmal Knight vs a boss). **Still wrong for
  the traps**: `HT_BLASTMINE` / `HT_LANDMINE` / `HT_CLAYMORETRAP` are the same BF_MISC family (they
  sit in that same Hercules function) but route through `_runBranch`, which runs `cardFix` — measured
  Blast Mine Lv5 vs Phreeoni at **1051 bare → 2102 with 4× Abysmal Knight, exactly 2.00×**. They
  correctly skip Defense Fix already. Fixing them means bypassing `cardFix` for Misc-typed skills
  rather than special-casing each trap.
  Two attacker-side terms that ARE legitimate on BF_MISC and are unmodelled: `pc->skillatk_bonus`
  (`bonus2 bSkillAtk,<skill>,<pct>`, battle.c:4395 — no PS item grants it for these skills today,
  but it is the correct hook if one appears), and `NK_SPLASHSPLIT`, which an **autocast** Blitz Beat
  sets when it hits more than one target (damage divided among them) — so auto-blitz is overstated
  against a pack, though single-target is right.
- **Auto Blitz Beat proc chance — sources disagree** [low, ~180 DPS]. Ours and the PS wiki say
  `⌊LUK/3⌋` ("for every 3 points of LUK there is an additional 1% chance") = 38% at LUK 114;
  Hercules `skill.c:1638` is `rnd()%1000 <= luk*3`, i.e. `(3×LUK+1)/1000` = 34.3%; the jaludev calc
  uses `1 + 0.3×LUK` = 35.2%. Left on the wiki reading per the source hierarchy (wiki beats battle.c
  for PS-reworked skills, and Blitz Beat's damage formula IS PS-reworked). Recorded, not silently
  overridden. NB ours is right where jaludev is wrong on the same skill: hit count is
  `min(BlitzLv, job_level/10 + 1, 5)`, matching both Hercules and the wiki's "job level 40+ can reach
  the full 5 hits"; jaludev's `⌊(JobLV−1)/10⌋+1` gives 4 at job level 40.
- **`bAutoSpellWhenHit` has no consumer at all** [med] — 42 distinct skills across ~90 items
  (Dark Lord Card's Meteor Storm, Ifrit Card's Earthquake, Ring of Resonance's Venom Splasher,
  and a long tail of defensive Heal/Assumptio/Kyrie). `gearBonuses.autocast_when_hit` is
  populated and then read by nobody. The offensive ones are real damage a tank deals, but they
  fire on the MONSTER's attack rate, not yours — so like Reflect Shield they belong in the
  Survivability panel as damage-per-hit-taken (`dps_valid:false`), not in your DPS. The
  defensive ones (auto-Heal, auto-Assumptio) would be a survivability term. Needs the incoming
  pipeline to grow a proc concept; scoped out for now, but it is the single biggest remaining
  proc category.
- **On-ATTACK autocasts still fire only on auto-attacks** [low] — in-game `bonus3 bAutoSpell`
  triggers off skill hits too. Deliberate: pricing a proc off a skill needs the proc's own
  attack-period model. (`bAutoSpellOnSkill` is exempt and IS priced — it names its trigger, so
  the trigger's period is the period. Implemented 2026-08-11 for both the physical and magic
  paths: Elemental Sword's bolt chain, Dagger of Hunter's Bash, Nepenthes Bow, Croce Staff,
  Horn of Hillslion, Holy Marcher Hat.)
- **`bHolyStrikeChance` (Ancient Mummy + Mummy card combo) is parsed and dropped** [low] — the
  field `holy_strike_bonus_chance` exists on the gear bonuses and nothing reads it, because
  PS_PR_HOLYSTRIKE itself is unsurfaced (see the Rogue/Stalker audit note above: its job array
  is [7, 4008]). Fix the passive first, then the combo's +5% has somewhere to go.
- ~~**PS_CORRUPTINGDRAIN (Corruptor Card)**~~ — **modelled 2026-08-11.** The in-game card tooltip
  carries the formula the API's description omits:
  `100 + STR + ⌊STR²/40⌋ + DEX + ⌊DEX²/40⌋ + INT + ⌊INT²/40⌋ + LUK + ⌊LUK²/40⌋`, off TOTAL stats,
  healing 75% of what it deals. Lives in `PAYON_STORIES.misc_formulas` (that field's first
  consumer) and is priced by `_runMiscFormulaBranch` — fixed damage, no weapon roll, no
  element/size/race, one breakdown step per stat. Rate is 4% melee / 2% ranged from the
  ATF_SHORT/ATF_LONG flags, and it now counts toward the DPS. **Assumption to verify:** the card
  documents no DEF interaction, so none is applied — if in-game numbers show DEF biting, add a
  `defenseFix` pass to the branch. The heal is reported as its own figure, never as damage.
  **General lesson: the in-game tooltip carries terms the item API's description drops** — the
  same trap as the pre/post-patch API lag noted in `context.md`.
- **NJ_KIRIKAGE (Shadow Slash) crit** [med] — dead id (543 vs real 530) AND on PS should only crit
  while **Shadow's Within** is active with a PS-tuned value. Needs `skill_params` threaded into
  `critChance.js` + a source for the crit magnitude. Left disabled (documented in `critChance.js`)
  rather than restored ungated.
- ~~**AS_SONICACCEL**~~ — resolved 2026-08-11. wiki.payonstories.com/Sonic_Acceleration settles the
  conflict explicitly ("Sonic Acceleration does **not** give a flat +50 Hit … SA gives +50% 'Hit',
  the Hit actually being Accuracy rate", with a 30% → 45% worked example), i.e. battle.c's +50
  hitpercbonus, not the skill DB's "+50 Hit" wording. Implemented in `hitChance.js`; assumed learned,
  like the +10% damage half in `skillRatio.js`, and both are switched off by the same
  `skill_params.AS_SONICBLOW_sonic_accel`.
- **SN_SIGHT (True Sight)** [med, Snipers] — entire self-buff unmodeled: +5 all stats, accuracy,
  +weapon damage %, +crit. Not currently a selectable buff.
- **LK_CONCENTRATION** [med] — only the AGI/DEX% is applied (`statusCalculator.js:62`). Vanilla also
  grants a flat +HIT and an ATK% bonus (the self −DEF is out of scope for outgoing damage). Verify PS
  values before adding.
- **LK_SPIRALPIERCE** [med] — ignore-DEF/soft-DEF works via the `IgnoreDefense` flag, but the
  weapon-weight formula, the inverse size modifier (S 125 / M 100 / L 75%), and the "5 hits, damage
  divided evenly" model are unported → currently computes `100% × 5`. (See BF_MISC list above.)
- **PA_PRESSURE** [med] — fixed level-based damage that ignores DEF and ATK; currently runs through
  the ordinary DEF-reduced weapon-ratio branch. Needs a fixed-damage branch.
- **SL_SMA (Esma)** [low, Soul Linker] — element is `Ele_Endowed` (Warm Wind), absent from
  `ELE_STR_TO_INT`, so the magic branch stays Neutral; Warm Wind endow isn't threaded in.
- **Timing** [low–med, DPS only] — SC_BERSERK +30% ASPD (LK_BERSERK / MS_BERSERK) unmodeled;
  NJ_ZENYNAGE after-cast delay is 5s in the DB vs 2s described; MO_KITRANSLATION / MO_FINGEROFFENSIVE
  / Asura hard-cast PS reworks and the combo-ready instant-cast are unmodeled; SG_STAR_COMFORT /
  SG_DEVIL / SL_CRUSADER ASPD/delay buffs have no consumer.
- **Niche** [low] — AS_CLOAKING attack-from-cloak crit-double; SG_FUSION never-miss + ignore-DEF
  buff; HW_GRAVITATION DEF-ignoring damage (currently NoDamage, pending BF_MISC port); LK_AURABLADE
  flat DEF-ignoring/accuracy-independent damage add; PF_SPIDERWEB Fire ×2.5 vs webbed target.

### Confirmed correct (no action — recorded so they aren't re-flagged)
- **`if(!...)` used to FAIL OPEN — fixed 2026-08-21, worth knowing about.** `safeEvalInt`
  normalises `&&`/`||` to `and`/`or`, and `evalConditionals` treats a null result as TRUE so an
  unparseable condition still applies its bonus. But the tokenizer only ever emitted `!=`, never a
  bare `!` — so every `if(!...)` threw, returned null, and applied the very effect it was written to
  suppress. `!` is now normalised to the word `not`, which the existing `notExpr` already handled.
  Found via Wanderer Card (4210), whose
  `if(!isequipped(4172,4257,4230,4272)) bonus3 bAutoSpell,RG_INTIMIDATE,1,20;` kept proccing with
  the full thief set on. `isequipped(...)` was also unimplemented — now substituted to 1/0 from
  `ctx.equipped_ids`, a Set of every worn id (cards included) built once per `compute()` so a set
  bonus sees the whole outfit. With no list supplied it resolves to 0.
  Only ONE bundled item uses either construct, so the blast radius was tiny — but both were silent
  failures that applied bonuses rather than dropping them, which is the dangerous direction.
  **Debugging note**: the first attempt at the `isequipped` regex silently never matched because a
  Python heredoc wrote `\b` as a literal backspace byte (0x08) into the JS source. `cat -A` showed
  it as `^H`. If a regex written through a script inexplicably fails to match, check for control
  characters before doubting the logic.
- **Arrow ATK follows the SKILL's ammo requirement, not the weapon type** — FIXED 2026-08-21.
  A player reported "if you add oridecon arrows, it adds damage to acid terror" and was right; an
  earlier pass in this same session recorded the opposite and had to be reversed. Worth reading as
  a cautionary tale about stopping at the first plausible code path.
  The wrong reasoning was: `sd->state.arrow_atk = (weapontype == W_BOW || <guns>)` (battle.c:6852)
  → `flag.arrow` (4890) → the arrow roll (661), therefore any bow user's weapon skills get arrow
  ATK. Every line of that is real. **What it misses is that battle.c:6852 lives inside
  `battle_weapon_attack` — the NORMAL-ATTACK path.** When a skill is cast,
  `skill_check_condition_castbegin` OVERWRITES the same field from the skill's own requirement
  (skill.c:15810):
      require = skill->get_requirement(sd, skill_id, skill_lv);
      sd->state.arrow_atk = require.ammo ? 1 : 0;   // "Can only update state when weapon/arrow info is checked."
  So the rule is: **normal attack → weapon type; skill → that skill's ammo requirement.**
  `AC_DOUBLE` declares `AmmoTypes: { A_ARROW: true }, AmmoAmount: 1`; `AM_ACIDTERROR` declares only
  `Items: { Acid_Bottle: 1 }`. A bow Rogue's plagiarised Acid Terror therefore gains nothing from
  an Oridecon Arrow, and the engine was adding its full 50 ATK.
  Implemented from data — our `skills.json` already carries `requirements.ammo_types` /
  `ammo_amount`, so no new data was needed. **`HT_PHANTASMIC` is the one exception**: a Bows skill
  with no ammo requirement that Hercules force-sets anyway (battle.c:4909, "Since these do not
  consume ammo, they need to be explicitly set as arrow attacks"), so it is hardcoded. Every other
  ammo-using skill in the DB declares its requirement — verified across AC_DOUBLE/AC_SHOWER/
  AC_CHARGEARROW/SN_SHARPSHOOTING/BA_MUSICALSTRIKE/DC_THROWARROW/CG_ARROWVULCAN and the GS/NJ sets.
  No golden moved when the fix landed, because no scenario had a bow user casting a non-ammo skill
  — which is exactly why this survived. `bow-rogue-acid-terror-ignores-arrow` now covers it, with
  ammo deliberately equipped so the scenario fails if the bonus returns.
  **Still true from that investigation, and separately verified**: the arrow's ELEMENT never leaked
  (PS: "always neutral element" — a Fire Arrow build reads 474 vs Ghost 1 against 1899 vs Water 1,
  i.e. quartered, which is Neutral). And the wiki's "benefits from weapon ATK" is about the WEAPON,
  not its ammo.
  **Conflict worth knowing**: wiki.payonstories.com/Acid_Terror still lists 180/260/340/420/500%,
  the PRE-rework table, while the 2026-08-09 Alchemist PDF says "increased from 500% to 600% at max
  level, NEW FORMULA (100+100*SkillLv)%" — which is what the engine implements (200–600%). The wiki
  page is stale for this skill; do not "fix" the ratio to match it.
- **TK_COUNTER** "always hit" — modeled via `damage_type:["IgnoreFlee"]` in skills.json.
- Cosmetic multi-hit convention (negative `number_of_hits`): CR_HOLYCROSS −2, WZ_VERMILION −10,
  AS_SONICBLOW −8, TK_COUNTER −3 — damage applied once, correct.
- Forced elements for traps (Land/Blast/Claymore), GS_MAGICALBULLET (Ghost), the Ninja/Wizard bolts,
  and Grand Cross/Holy Cross (Holy) all resolve correctly; TF_POISON intentionally reverts to weapon
  element on PS (`TF_POISON_USES_WEAPON_ELEMENT`).
- DEF-reduction debuffs (Signum Crucis, Strip Shield/Armor, Mind Breaker, Eternal Chaos, Steel
  Body, Stone Curse) are representable via `target_active_scs` and consumed by `defenseFix.js` — they
  apply when the caller injects the matching status. (Minor: the *vanilla* Strip Armor branch models
  the MDEF cut as a VIT cut; the PS branch is correct.)
  **CORRECTION (2026-08-18): Fling was listed here and does NOT belong.** `defenseFix.js` reads only
  `SC_STONE`, `SC_FREEZE` and `SC_ETERNALCHAOS` — nothing consumes `SC_FLING`, and the UI never
  offered it, so a player asking for Fling was right that it is simply absent. It is also
  coin-driven, which the calculator has no concept of: wiki.payonstories.com/Fling — Lv1 only,
  consumes coins, "Reduces targets Hard Def by 3*coins used" (3% per coin, 15% at 5), 20 s, and
  deals `(jobLvl + baseLvl)` damage per coin, unaffected by Barrage, target defence or element;
  against players it cuts Soft DEF only. So Fling and the missing Gunslinger coin resource are ONE
  piece of work, not two — see the punch-list.
