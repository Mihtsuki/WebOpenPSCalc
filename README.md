# Open PS Calc — web port

This is a web migration of [StatGameDev/Open_PS_Calc](https://github.com/StatGameDev/Open_PS_Calc),
a PySide6/Qt **desktop** damage calculator for pre-renewal Ragnarok Online
(targeting both vanilla pre-renewal servers and the Payon Stories private
server). The original's Python calculation engine (`core/`) was ported to
JavaScript by hand, file-for-file, rather than wrapped — see
**[`ROADMAP.md`](open-ps-calc-backend/backend/ROADMAP.md)** for the exact
port status of every file (fully ported / partially ported / not started).

- **`open-ps-calc-backend/backend/`** — Node/Express API hosting the ported
  calculation engine.
- **`open-ps-calc-frontend/frontend/`** — React (Vite) + TypeScript
  single-page app: build editor, equipment, target, skill selection, and the
  full step-by-step damage breakdown.

Game data (item/mob/skill databases, Payon Stories overrides) is bundled
with the backend as static JSON, sourced from the original repo's
`core/data/pre-re/` and `PayonStoriesData/` folders.

## What's different from the original

The original is a single-user desktop app with local save files and a
Qt GUI. This port is a stateless multi-user **web app**, which forced or
motivated several changes beyond a straight 1:1 port:

- **No accounts, no server-side storage.** The original saves builds to
  local `saves/*.json` files. This port has no database and no login.
  Build state is encoded into the URL's `?b=` query param (defaults pruned,
  keys renamed to short append-only codes, then lz-string compressed — the
  `z3_` format, ~50% shorter than the previous `z2_`; older `z2_`/`z1_`/
  uncompressed links still decode transparently), so sharing a build is just
  sharing its link. A **Save / Load** panel also
  stores named build snapshots in the browser's `localStorage` (up to a
  small cap), purely client-side.
- **TypeScript.** Backend entry points/routes and the entire frontend are
  TypeScript; the ported engine internals stay as `.js` (loaded via
  `allowJs`) to keep the line-for-line diff against the original Python
  legible.
- **Magic skill pipeline (BF_MAGIC) and Grand Cross (CR_GRANDCROSS)
  implemented**, including a Payon-Stories-specific deviation for Grand
  Cross (weapon masteries apply there, unlike vanilla) confirmed against
  [wiki.payonstories.com/Grand_Cross](https://wiki.payonstories.com/Grand_Cross).
- **Incoming (mob → player) damage pipeline** — not exposed in the
  original GUI's main flow at all the same way; this port adds
  `POST /api/calculate/incoming` for physical and magic damage taken,
  including the Lex Aeterna double-damage status.
- **Card slot UI** (up to 4 per item, filtered to `IT_CARD`), a **passive
  skill panel** (filtered to an explicit allowlist of masteries that
  actually affect damage — not every passive in a job's skill tree does),
  a **consumables panel** (ASPD potions, ATK/MATK items, and the box buffs —
  Gloom / Resentment / Drowsiness), and a **buffs
  panel** (quickens, Impositio Manus, Overthrust, Bard/Dancer songs) — none
  of these existed in the original web port's first pass; built
  incrementally by finding cases where the engine already supported the
  mechanic but no UI exposed it.
- **`TF_DOUBLE` (Double Attack) proc implemented** — the engine had
  placeholder result fields for it (`proc_chance`, `double_hit`) but the
  pipeline never actually computed them. Dagger-only, mutually exclusive
  with crit, proc rate read from the PS/vanilla profile tables.
- **PS Assassin/Thief rework** — Five Payon Stories custom behaviours
  added behind mechanic flags: (1) katar second hit (`AS_KATAR_SECOND_HIT`)
  — auto-attack with a Katar procs a second hit at twice the normal
  `TF_DOUBLE` rate, dealing `(21 + 4 × AS_KATAR_lv)%` of the main hit;
  shown as a separate branch in the damage breakdown. (2) Enchant Poison
  passive bonus (`AS_ENCHANTPOISON_PASSIVE_BONUS`) — each Enchant Poison
  skill level adds 2% damage against Poison-element targets. (3) Envenom
  weapon element (`TF_POISON_USES_WEAPON_ELEMENT`) — Envenom's attack
  element follows the weapon's element rather than always being Poison.
  (4) **Dual-wield three-hit model** *(beta)* (`DUAL_WIELD_PS_THREE_HIT`)
  — Assassin/Assassin Cross with an off-hand weapon use a three-hit swing:
  hits 1 & 2 = RH × `AS_RIGHT` factor, hit 3 = LH × `AS_LEFT` factor. A
  `[PS (3-hit) beta | Vanilla]` toggle in the damage panel lets you compare
  the PS calculation against single-weapon vanilla output. (5) **Dual-wield
  combined damage bonus** (`DUAL_WIELD_PS_DAMAGE_BONUS`) — the combined
  three-hit total receives a ×1.10 multiplier on PS; shown as a step in the
  breakdown and reflected in DPS.
- **PS Hunter rework** — Offensive trap damage formulas completely replaced
  for Payon Stories: Land Mine, Blast Mine, Freezing Trap, and Claymore Trap
  now use INT/DEX/level-based formulas (`lv × factorA × factorB / divisor`)
  behind the `HT_TRAP_PS_FORMULA` mechanic flag, bypassing DEF. Element vs
  target and race/size card bonuses still apply. Dory Card, Wolpertinger Card,
  and Setting Dirk bonus values updated to match the reworked amounts.
- **ASPD potion policy** — The restricted-to-Concentration-Potion class
  list reflects PS's rebalance (Priest/High Priest, Bard/Dancer and their
  trans forms). Monk and Champion can use Awakening Potion; Whitesmith,
  Mastersmith, Creator, Biochemist, and the Thief/Rogue tree can use
  Berserk Potion.
- **Filled in larger chunks of `PAYON_STORIES`'s skill-ratio/mastery
  overrides** in `serverProfiles.js` than the original port carried over
  initially, pulled directly from the upstream Python source.
- **Human-readable skill names** in search (the engine constant names like
  `MG_FIREBALL` are resolved to display names like "Fire Ball").
- **Collapsible UI sections**, with the damage breakdown panel pinned and
  visually emphasized since it's the actual result the rest of the form
  exists to produce.
- **A lightweight `X-API-Key` gate** on the backend (see `DEPLOYMENT.md`)
  to deter casual direct API access — explicitly *not* real authentication,
  since the key ships in the public frontend bundle.
- **PS Crusader rework** — changes from `PSRO_Crusader_Rework_2026.pdf` are
  modelled: Spear Quicken now grants Hit/Flee instead of Crit; Providence
  grants MDEF +2×SkillLvl (self-cast); Stone Discus now only boosts Shield
  Boomerang by 5% per refine (was erroneously also boosting Shield Charge);
  Stalactic Golem Card grants Soft DEF +10 (+10 more if VIT > 77) instead
  of the stun resistance. **Reflect Shield** was re-derived again by the
  2026-08-09 patch notes and now uses
  `SkillLevel × (SoftDEF/2 + ⌊VIT/10⌋²) × (100 + 2×HardDEF) / 1000` —
  DEF-ignoring, hit-checked, element- and card-enhanced. VIT enters
  **quadratically**, so it dominates the result.
- **Magnum Break's lingering fire enchantment** — Hercules'
  `SC_SUB_WEAPONPROPERTY`: for 10s after casting Magnum Break, an extra
  chunk worth **20% of a *normal attack*** (not of the skill's damage) is
  dealt as **Fire**, added at the end of `battle_calc_elefix` and therefore
  **after** defense, so it bypasses the target's DEF. Wootan Fighter Card
  raises it to 30%. Payon Stories scopes it to **auto attacks and Magnum
  Break itself** (`SM_MAGNUM_ENDOW_ATTACK_ONLY`), where vanilla grants it to
  every skill bar `ASC_METEORASSAULT`. Exposed as a Buffs-panel toggle.
- **PS Merchant / Blacksmith / Alchemist rework (2026-08-09)** — the four
  rework PDFs plus the GM patch notes, modelled end to end: Cart Revolution
  as a 5-rank tree skill (`50×lv%`), Zeny Pincher as `100+25×lv`, the new
  **Tool Mastery** (+4 ATK/lv with Axes and Maces, a PS-custom passive that
  the picker surfaces via `ps_skill_desc_overrides.json`), Crazy Uproar at 4
  ranks (+1 STR/VIT per level plus soft DEF), Adrenaline Rush across every
  melee weapon (30/20% Axe·Mace, 20/10% otherwise), Acid Terror at
  `100+100×lv`, **Transmutation** replacing Axe Mastery's flat ATK with
  +1% ASPD and +1% MATK per level on Axes and Swords, Smith Weapon skills at
  4 ranks, and the reworked FUEL / Pill Bug / Pirate Skel cards.
- **Burning** (`PS_BURNING_STATUS`) — the new stacking Fire debuff: up to 5
  stacks, each cutting the target's hard MDEF by 2 (fed through
  `target_mods.burning` so it reaches the magic branch like any other MDEF
  change) and ticking 60 Fire magic damage per second. The tick is reported
  separately and labelled pre-mitigation rather than being priced inside the
  attack breakdown — it is the debuff's damage, not the player's hit.
- **Card autocasts on a physical attack** (`PS_CARD_AUTOCAST_ON_ATTACK`) —
  `bonus3 bAutoSpell,...` was parsed into `gearBonuses.autocast_on_attack`
  but no pipeline ever consumed it. Cards like Pirate Skel (auto-Mammonite)
  and Rekenber Mercenary (auto-Bash) now surface a proc branch on
  auto-attacks, priced through the same `_runBranch` / `_runMagicBranch` the
  player's own cast would use.
- **Crit lifesteal** (`bCritHeal`, a PS-specific bonus) — Crescent Scythe
  heals 0.1% of the damage dealt **per refine** on a critical hit. Reported
  on the crit branch as its own field and deliberately kept out of
  `avg_damage`/DPS: it is HP returned, not damage dealt.
- **Job-illegal passives are ignored** — `mastery_levels` is a free-form map
  and the editor does not clear it when the job changes, so levels from a
  previously selected job used to linger in the state (and in every share URL
  made from it) and get applied silently. `resolvePlayerState` now filters it
  against the job's own skill tree, which repairs existing links on load. Gear
  **granted** skills are deliberately exempt — a card really can grant a skill
  outside your tree.
- **PS Monk rework — Triple Attack proc** — `MO_TRIPLEATTACK` now procs on
  auto-attacks for Monk/Champion on Payon Stories (28/26/24/22/20 % at levels
  1–5, with Knuckle weapon bonus). When **Fury** (SC_EXPLOSIONSPIRITS) is
  active, procs can crit. Skill level tracked via the passive panel.
- **Refine cap enforced at +10** — the refine input clamps to +10, the
  pre-renewal maximum, both in the HTML attribute and the change handler.
- **ASPD shown to one decimal place** — uses a single `Math.floor` on the
  combined AGI/DEX reduction, matching eAthena's integer-division behaviour.
- **Equipment search — auto-select and Tab-to-closest** — typing in any
  search field (equipment, card, skill) auto-commits when the list narrows
  to exactly one selectable result. Tab while the dropdown is open selects
  the keyboard-highlighted item, or the first non-disabled result if none is
  highlighted, before moving focus normally.
- **Card search filtered by slot** — card pickers only show cards that can
  compound into that slot type (weapon cards for weapon slots, armor cards
  for armor slots, etc.). The left-hand slot shows weapon cards when a
  weapon is equipped there (dual-wield) and shield cards otherwise.
- **Dancer/Gypsy can equip Whip weapons** — the vanilla item DB marked all
  Whip-type items with job `[19, 4020]` (Bard/Clown) due to a `SEX_MALE`
  field that locks Musical Instruments; Whips carry no gender restriction and
  belong to Dancer/Gypsy `[20, 4021]`. Fixed via a normalisation pass in
  `dataLoader.js`.
- **PS Rogue rework** — changes from `Rogue_Patchnotes_PayonStories.pdf` are
  modelled: Backstab formula `200+30×lv`% with a user-toggleable +40%
  opportunity bonus (monster not targeting Rogue); Trick Arrow corrected to
  200% (2×100% hits); Vulture's Eye enables bow Double Attack with proc rate
  `doubleRate × min(TF_DOUBLE_lv, AC_VULTURE_lv)` behind the
  `RG_BOW_DOUBLE_ATTACK` mechanic flag; Yser Card (footgear) is now fully
  functional (+10% Backstab/Raid, +5 HIT). `bSkillAtk` card bonuses now also
  apply in the weapon skill branch (`_runBranch`).
- **PS Knight rework** — changes from `Payon Stories Knight Patch (1).pdf` are
  modelled: Sword Quickening now grants +1% CRIT per level (up from +0.8%/lv
  vanilla); Spear Stab is capped at max level 5 with 100+40×lv% damage ratio;
  Blade Mastery (`KN_TWOHANDMASTERY`) now applies to 1H Sword weapons in
  addition to 2H Swords — when a Knight has Blade Mastery levels, 1H Sword
  mastery routes to it instead of vanilla Sword Mastery via the
  `mastery_prefer_fallback` mechanism; Counter Attack 200% and Sword Quickening
  1H ASPD (+10%) were already in place from a prior pass.
- **Cards always proc toggle** — the damage breakdown panel shows a compact
  **Normal | Always** segmented control whenever the equipped loadout contains
  cards with `autobonus`-based proc effects (e.g. Bonechewer Card). Switching
  to *Always* recalculates immediately with those proc bonuses treated as
  permanently active, so you can see worst/best-case damage without leaving the
  panel. The control is hidden when no proc cards are slotted. Backend:
  `gearBonusAggregator` parses `autobonus` inner scripts into
  `gearBonuses.auto_bonuses`; `build.flags.force_procs` applies them as
  permanent bonuses.
- **`NK_IGNORE_ELEMENT` fix** — skills with `"IgnoreElement"` in their `damage_type`
  (e.g. Venom Splasher / `AS_SPLASHER`) now correctly bypass the element modifier table.
  Previously `calculateAttrFix` always ran in the weapon branch regardless of this flag,
  producing wrong damage against non-neutral element targets.
- **PS Wizard / High Wizard rework** — changes from `Wizard_and_High_Wizard_Trans_Class_Changes.pdf`
  are modelled: Frost Nova reworked formula (190+15×lv base, +10%/Frost Diver lv, max lv 5);
  Lord of Vermillion total 200×lv% (4 waves summed, 2000% at lv 10); Napalm Vulcan
  element changed from Ghost to Shadow + 50% MDEF ignore; Fire Pillar 50% MDEF ignore
  (max lv 5); Mystical Amplification per-level MATK scaling (+10%/lv on PS, flat 50%
  vanilla, max lv 5, exposed in the buffs panel); Sightrasher max lv 5; Soul Drain
  passive +1% MaxHP per level (slider in the passives panel).
- **Target debuff system** — Panel 08 (Target) now has a "Target debuffs" section. Element status
  applies an ailment: **Poisoned** cuts the target's VIT-based soft DEF by 50% on PS (25% vanilla)
  and, in monster mode, surfaces its **2%/s Max-HP damage-over-time** as a "Poison DoT" metric folded
  into time-to-kill; **Frozen** (→ Water) and **Stone Curse** (→ Earth) override the element and, via
  `defenseFix.js`/`hitChance.js`, halve hard DEF and grant auto-hit. A separate **Elemental Change
  (Sage)** dropdown (`SA_ELEMENTWATER`/`GROUND`/`FIRE`/`WIND`) overrides the target's defensive
  element to Water/Earth/Fire/Wind at level 1 (no effect on MVP/boss, per the PS Sage rework).
  Lex Aeterna checkbox applies ×2 to all damage branches with a
  visible step in each breakdown. Debuff skill/status checkboxes: Quagmire (selectable Lv 1–5,
  cuts the target's AGI/DEX by 10%/lv → lower flee; boss-immune, halved vs players — it does *not*
  auto-hit), Provoke (selectable Lv 1–10, `SC_PROVOKE` — lowers the target's soft DEF so it takes
  more physical damage; stacks with Signum Crucis and is independent of the player's own Auto
  Berserk/Provoke self-buff), Signum Crucis Lv10 (hard DEF −50% per PS's
  `10 + 4×lv`, Undead-element or Demon-race only — checkbox disabled for inapplicable targets),
  Asleep (`SC_SLEEP`: auto-hit + ×2 crit rate), Stunned (`SC_STUN`: auto-hit). State is
  URL-encoded alongside the build so shared links include debuff selections.
- **PS Demon Bane (AL_DEMONBANE)** — buffed to the Payon Stories values
  ([wiki](https://wiki.payonstories.com/Demon_Bane)): `lv × floor(5 + (BaseLv+1)/20)` vs
  Undead-element or Demon-race (**100 ATK at Lv10 / base 99**, up from vanilla's `+3/lv` → 80),
  plus a new `+4/lv` bonus vs all other targets. Gated by the `payon_stories` profile
  (`mastery_ctx_overrides`); the `standard` profile keeps the vanilla formula. This is a post-DEF,
  mastery-type ATK addition — it flows through element and card multipliers.
- **PS Signum Crucis (AL_CRUCIS)** — corrected to the Payon Stories values: it reduces **hard DEF
  only** by `10 + 4×lv` (**−50% at Lv10**), not the flat −35%-on-combined-DEF it applied before,
  and it affects **Undead-element or Demon-race** targets (Undead is an *element*, so Demon
  monsters of any element now qualify; the previous `race === "Undead"` gate was wrong). Stacks
  with Provoke. Source: `ps_skill_db.json` (id 32) and
  [wiki.payonstories.com/Signum_Crucis](https://wiki.payonstories.com/Signum_Crucis).
- **Visual pipeline damage breakdown** — the step list is redesigned as a vertical pipeline with a
  left-rail track. Sub-component steps (Status BATK, Weapon ATK, Branch) are shown as chips above
  the pipeline. Each step row uses dot leaders to link name to value; connectors between rows show
  the operation applied (multiplier or flat delta) with colour coding and a brief note. Step values
  show `min–max` when the damage distribution spans a range. Final Damage is visually separated.
- **Snake Card + Cave Viper Card combo** — equipping both grants +15% Poison on hit and +20 ATK.
  Cave Viper Card (headgear) also updated: now adds +20% Poison on hit in addition to its existing
  +10% damage to Poison-element targets.
- **PS Bleeding revamp** — reworked bleeding status mechanics (`PS_BLEEDING_REVAMP`): 5% max HP
  every 0.5s for 2.5s (25% total, can kill), 35s immunity after, cannot be applied to targets
  ≥15 base levels higher than the attacker. Gear changes modelled: Breeze Card now gives +8 ATK
  and 2% Bleed on hit (down from +5/5%); Breeze Card + Muka Card combo adds +6% Bleed on hit;
  Hakujin (13014/13015) adds 8% Bleed on hit; Huuma Giant Wheel Shuriken (13301/13302) loses its
  Bleed on hit; Hatii Claw Bleed on hit increased 2% → 5%. Skill-side and mob-side bleed chance
  changes (Wounding Shot, Acid Terror, Skogul, Killer Mantis) are noted but not modelled in the
  outgoing-damage calculator.
- **PS Sage rework** — damage-relevant changes from the Sage Rework publication are modelled:
  Soul Strike ignores 50% MDEF when skill level 10 is learned (`MG_SOULSTRIKE_MDEF_IGNORE`);
  Soul Strike also deals `+5% × skill level` bonus damage vs Undead race
  (`MG_SOULSTRIKE_UNDEAD_BONUS`, shown as a dedicated breakdown step). Fireball uses the
  per-level table `(70 + 30 × lv)`% (lv 1 = 70%, lv 10 = 340%) — already stored in
  `PS_BF_MAGIC_RATIOS` and confirmed correct. Earth Spike and Heavens Drive at 140% per hit
  confirmed correct. Advanced Book flat ATK +10–30 (lv 1–5) confirmed correct.
  Volcano / Deluge / Violent Gale persistence buffs at max level 3 confirmed correct.
- **PS Priest / Acolyte rework** — changes from `PSRO Priest Acolyte Rework.pdf` are modelled:
  **Holy Light** deals 250% MATK (Holy) with the Cookie card's +20% *and* a **LUK% chance to deal
  +60% damage** (modelled as a probability mixture, so the average and damage range fold in the
  proc; LUK >= 100 makes it guaranteed). **Turn Undead** now surfaces its **instant-kill success
  chance** — `[20*SkillLv + 3*LUK + INT + BaseLv + (1-HP/MaxHP)*200] / 10 %`, halved if base INT
  < 40 — and folds it into the "Casts to kill" / "Time to kill" readouts (with the fixed fail-damage
  as the chip fallback), on top of the existing fail-damage formula. Holy Strike and Magnus
  Exorcismus have their valid-target lists widened (Ghost element, Undead/Demon race). **Offensive
  Heal** (the "heal bomb") is modelled: against Undead-property targets, `AL_HEAL` deals 50% of its
  heal value (`floor((BaseLv+INT)/8) × (4+8×SkillLv)`) as Holy damage (element-modified, DEF/MDEF/card-
  ignoring), boosted by heal-effectiveness gear (`bHealPower` / `bSkillHeal` — Sacred Saints Robe,
  Gyokuto, heal robes), and raised to 100% by the **Purifying Ring** accessory + **Rosary** combo.
- **PS Bard / Dancer** — **Arrow Vulcan** (`CG_ARROWVULCAN`) had no ratio in any table and fell back
  to a flat 100% at every level; it now scales `200 + 100*lv` (Lv1 300% ... Lv10 1200%), matching the
  in-game description. A **Performing** target-panel toggle grants Musical Strike and Throw Arrow a
  flat **+100 ratio points** (Lv1 300%, Lv5 400%) to model the "while a song/dance is active" bonus.
- **PS Gunslinger rework** — damage-relevant changes from the Gunslinger Balancing
  Patch are modelled: Triple Action 420% total (100+40×lv at max level 1, was 450%);
  Ground Drift 200+60×lv% (max 800%, was 100+50×lv%); Soul Bullet (50+DEX+BaseLvl)%;
  Heavy-Tipped Bullet ATK 45 with +10% damage to all races (`RC_All`). Neutral
  resistance corrected: `GS_DUST` now grants 7% Neutral resist at level 10 (was
  listed in the description but never wired into `PS_PASSIVE_RESISTS`); all three
  shotgun skills (`GS_DUST`, `GS_FULLBUSTER`, `GS_SPREADATTACK`) now also grant the
  resist when a Grenade Launcher is equipped, not just a Shotgun.
- **Weapon card "wildcard" mix** — each weapon card slot can be set to a
  *wildcard* category (Race / Size / Element / Type) instead of a specific
  card, to model "what if I slot the matching card" without picking one.
  Race / Size / Element resolve against the selected target's actual
  race/size/element card bonus; **Type** covers monster-family "Bane" cards
  (Orc / Goblin / Kobold / Golem-Bane — `bAddRace2`, +30% physical damage to
  that family) applied as its own card-fix factor via a new `add_type` gear
  bonus. Because the mix is a slotting simulator, wildcards resolve against
  the current target. The mix survives weapon switches (aggregation iterates
  the equipped weapon's live slot count, not a stale stored copy). Separately,
  **real monster-family "Bane" cards** (Orc Lady, Goblin/Kobold Leader, Lava
  Golem — `bAddRace2`) now apply too, gated on the target mob's RC2 family via a
  recovered `mob_race2_db` (the mapping Hercules/rAthena migrated out of their
  DB files); the card does nothing against targets outside its family.
- **Kill-time readouts in the damage summary** — alongside the damage range
  and DPS, the summary shows (in monster mode, where HP is known) **hits to
  kill** as a best–worst range with a separate **average**, and **time to
  kill** (target HP ÷ estimated DPS, so it folds in ASPD, crit mix and procs;
  cast + after-cast delay for skills). The monster-stat grid, shown inline in
  the Target panel, also lists the **FLEE needed to dodge the target 95%** of
  the time (`mob level + DEX + 75`, soft-flee only).
- **Manual overrides & fuller build UI** — a manual +stat panel (raw
  STR/AGI/VIT/INT/DEX/LUK added on top of the computed totals), one-click
  "max" toggles for passive skills and Bard/Dancer buffs, and the selected
  monster's live stats (DEF / MDEF / VIT / element / etc.) shown inline in the
  Target panel. Mobile layout tuned for small screens (tighter panel padding,
  full-width sections, scrollable modals on iOS).
- **Survivability panel (incoming damage)** — the `POST /api/calculate/incoming`
  pipeline now has a frontend: a Survivability card shows how hard the selected
  monster hits *you* — damage through your DEF/MDEF and reduction gear, hits to
  down you, effective HP, damage mitigated, dodge chance, and the FLEE needed for
  the 95% dodge cap. It also lists the monster's damage-dealing cast skills with
  their element and physical/magic type (skill *power* isn't shown — PS tunes it
  beyond the available data). A monster's basic melee is priced as Neutral, so
  Neutral-resist gear (Raydric/Ghostring) reduces it.
- **Grand Cross self-damage (recoil)** — the damage panel shows the HP Grand Cross
  deals back to the caster each cast, in two parts: **Part 1** is the Holy,
  Demi-Human hit recomputed against *your own* DEF/MDEF and reduced by your Holy
  (Faith, Talisman of Holy Protection, Angeling armour) and Demi-Human (Thara Frog)
  resistances, then halved; **Part 2** is the fixed 20%-of-current-HP casting cost.
  **Faith (CR_TRUST)** is selectable under passives and feeds its Holy resist and
  +MaxHP into the recoil.
- **Box consumables** — **Box of Gloom** (casts Improve Concentration Lv1, +3%
  AGI/DEX from base stats), **Box of Resentment** (+20 ATK), and **Box of
  Drowsiness** (+20 MATK), matching their `item_db` scripts (IDs 12029–12031). The
  ATK/MATK boxes stack on the flat ATK/MATK item fields.
- **Non-damage clause audit** — a systematic sweep of every skill description for
  the non-damage mechanics the damage-focused audit didn't cover (accuracy,
  crit, auto-hit, ignore-DEF, forced element, hit count). Fixes shipped: **Holy
  Cross** and **Shield Chain** now apply their built-in +20% accuracy; **Sharp
  Shooting**'s +20 crit (silently disabled by a skill-id mismatch) now applies;
  and **Pierce** hits by target size (Small 1 / Medium 2 / Large 3) instead of a
  flat 3. See the "Non-damage clause coverage audit" section of `ROADMAP.md` for
  the full findings and remaining punch-list.
- **Build comparison, clan & pet bonuses** — a **Compare builds** section in the
  results panel diffs a second build against the current one side by side; a
  **clan** selector applies the PS clan stat bonuses (Sword / Arch & Wand / Golden
  Mace / Crossbow / Artisan / Vile Wind — +stats and MaxHP/SP); and a **pet**
  selector applies Cute Pet System loyalty bonuses (profile `pet_bonuses`). All
  three are URL-encoded alongside the build.
- **CI/CD**: a GitHub Actions pipeline (`.github/workflows/deploy.yml`)
  that typechecks/builds on every push and deploys to an EC2 instance
  (pm2 + nginx) on pushes to `main` — see `DEPLOYMENT.md`.

## Quick start

Requires **Node 20** (see `.nvmrc`; anything 18+ works — `tsx`, Vite 5 and the
`node --test` suite all need 18 or newer). With nvm on macOS/Linux, `nvm use`
in the repo root picks it up.

```bash
cd open-ps-calc-backend/backend && npm install && npm start    # http://localhost:4000
cd open-ps-calc-frontend/frontend && npm install && npm run dev # http://localhost:5173
```

The frontend dev server proxies `/api/*` to `http://localhost:4000`, so just
open `http://localhost:5173` once both are running. If port 4000 is held by a
stale server, `npm run kill-port` in the backend frees it (works on macOS,
Linux and Windows). See
`open-ps-calc-backend/backend/README.md` and
`open-ps-calc-frontend/frontend/README.md` for more detail, and
`DEPLOYMENT.md` for deploying to EC2.

## What's accurate vs. what's a placeholder

This is a faithful, hand-checked port of the formula-heavy parts of the
original engine (stat resolution, item script parsing, gear bonus
aggregation, weapon damage pipeline, crit/hit chance, defense, element,
mastery, card bonuses, magic damage, Grand Cross, incoming damage). It is
**not** a 100% complete port — the original Python project is roughly
11,500 lines of calculation logic plus another 10,000 lines of Qt GUI.
Read **[`ROADMAP.md`](open-ps-calc-backend/backend/ROADMAP.md)** for the
full, current list of what's ported, what's simplified, and what still
returns a "not yet implemented" message instead of a wrong number.

Every calculation the API returns includes the full step-by-step breakdown
(the same kind of `DamageStep` data the original GUI showed, with the
Hercules source citation each step is based on), so any number can be
checked against the original Python tool's output for the same build.
