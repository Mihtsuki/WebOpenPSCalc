# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/). This project
deploys continuously (no version numbers), so entries are grouped by date
instead of release version. Dates are taken from actual git commit history.

## 2026-08-10

### Added

- **Your attack rate is shown beside ASPD** — `164.7 ·1.42/s` — so you can see what an ASPD
  number actually buys you. It appears for normal attacks only: a skill's rate is set by its
  cast and after-cast delay, not by ASPD (Sonic Blow sits at 2 s however fast you swing).
  Hover for the per-5-seconds figure and the caveat that these are attack *cycles*: a katar's
  second hit, dual-wield's third hit and multi-hit skills all land inside one cycle. The
  **ASPD card in Combat stats** carries the same figure and caveat on hover, so you can read
  your attack rate while tuning AGI without having to run a calculation first.
- **Pirate Skel Card + Flame Beetle Card is now a real combo.** The pair makes your autocast
  Mammonite cost no zeny *and* ignore Zeny Pincher — and since Zeny Pincher trades damage for
  the zeny discount, that means the proc hits for the full **600% at Lv10 instead of 350%**
  while Zeny Pincher is on. A Mammonite you cast yourself is still pinched.
- **Giant Pestle is now a real item.** It had a placeholder id while it was unobtainable; the
  PS item database published it as **8430**, so it's keyed properly and searchable by name.
  (If you saved a build with it before today, re-pick the weapon.) Its stats — Mace, ATK 100,
  weapon level 3, level 58, Alchemist, +3/+12 ATK per Pharmacy level — all confirmed unchanged.

### Fixed

- **The damage breakdown no longer shows phantom negative steps on unrefined weapons.**
  The Refine Bonus and Overrefine Bonus rows reported "0" instead of the running damage
  total when there was nothing to add, so the breakdown read them as huge losses
  (e.g. "−351 Refine Bonus"). Rows that change nothing now carry the running total, and
  the breakdown simply hides them. Final damage was always correct — only the step
  display was wrong.
- **The step where your status ATK is added is now its own row** ("Status BATK Added").
  It used to be silently folded into whichever row came next, which is what made the
  Overrefine row look like it added a few hundred damage out of nowhere.
- Weapon-ATK inputs (Impositio Manus, Battle Theme, Nibelungen, Volcano, equipment
  +ATK) and Turn Undead's instant-kill chance are shown as input chips rather than
  pipeline steps — they aren't stages of the running total, and rendering them as such
  produced meaningless +/− badges.

### Changed

- **The damage breakdown now labels its two columns** — the left badge is what that
  step *changed*, the right number is the *running total* after it. Every step follows
  that convention now; the Overrefine row used to show the size of its own roll (e.g.
  "1–5") instead of the total, which is what made the columns look inconsistent.
- **Grand Cross' magic half is marked as a fresh sub-track.** Its Base MATK row opens a
  separate calculation that is later summed with the physical half, so it no longer
  displays a (meaningless) change against the physical running total.

## 2026-08-09

### Added

- **The Merchant, Blacksmith and Alchemist reworks are in.** Every damage-relevant change
  from the 2026-08-09 rework notes is modeled:
  - **Cart Revolution** is a normal 5-rank skill now — **50% ATK per rank** (250% at rank 5),
    full damage no matter how heavy your cart is. Previously the calculator only knew the
    flat 250%, so ranks 1–4 were badly overstated.
  - **Tool Mastery**, the Merchant line's new weapon mastery: **+4 ATK per level with Axes
    and Maces**. It appears in the passive picker for Merchant, Blacksmith, Alchemist and
    their transcendent forms.
  - **Zeny Pincher** now halves only Mammonite's *per-rank* term — **100 + 25×level**
    (350% at Lv10, up from the old 240%). It's a self-buff toggle in the Buffs panel.
  - **Crazy Uproar** is a 4-rank buff: **+1 STR and +1 VIT per level** plus soft DEF
    (3×level for you, 2×level for party members). Both the caster and the party version
    are toggles.
  - **Adrenaline Rush works with every melee weapon.** Maces and Axes get **+30% ASPD**
    self-cast / **+20%** from a party Blacksmith; every other melee weapon gets **+20% /
    +10%** where it used to get nothing. Bows and guns are still excluded. (The old
    Adrenaline Rush checkbox was effectively doing nothing — it now moves ASPD properly.)
  - **Acid Terror** is **(100 + 100×level)% ATK** — 600% at its rank-5 max, up from 500%.
  - **Transmutation** replaces Axe Mastery: it no longer gives flat ATK, and instead grants
    **+1% ASPD and +1% MATK per level while wielding an Axe or a Sword** (+10%/+10% at
    Lv10). Alchemists wanting flat Axe/Mace ATK take Tool Mastery instead.
  - **Smith Weapon skills** master at rank 4, and Smith Two-Handed Sword is folded into
    Smith Sword. Their levels are now in the passive picker because the new Veteran Axe
    scales off how many you have mastered.
  - **Chemical Protections** cap at rank 3, **Pushcart** at rank 5.
- **Burning** — the new stacking Fire debuff — is a target toggle. Each of the up-to-5
  stacks cuts the target's **hard MDEF by 2**, so your magic damage rises accordingly. The
  debuff's own 60 Fire magic damage per second per stack is shown alongside, labelled as a
  pre-mitigation figure since it is Burning's damage, not your hit's.
- **Cards that autocast a skill on a physical attack now show their damage.** The reworked
  **Pirate Skel Card** (5% auto-Mammonite, cast at Lv10 once you have mastered Mammonite)
  and the **Rekenber Mercenary Card** (auto-Bash) each get their own breakdown panel with
  the per-proc damage and the DPS they add. Shown on auto-attacks, where these cards are used.
- **New weapons from the rework notes**, with full stats and bonuses: **Veteran Axe [2]**
  (retuned to ATK 155 / level 60; scales ATK, Perfect Dodge and ASPD with your mastered
  Smith Weapon skills, doubling at base DEX and LUK 80+), **Whirling Hammer [1]** (two-handed
  mace, ATK 190, +1% Cart Revolution damage per refine) and **Giant Pestle** (Alchemist
  one-handed mace, ATK 100, +3 ATK per Pharmacy level at base DEX/LUK 60+, +12 at 80+).
  **Whirling Hammer** is already obtainable in game and is listed with its real stats —
  note it needs **base level 60** and is **Blacksmith/Whitesmith only**, which differs from
  the rework notes. **Giant Pestle** isn't obtainable yet, so it carries a provisional item
  ID — a build that equips it may need the weapon re-picked once it ships.

- **Magnum Break's lingering fire is now modeled.** For 10 seconds after casting it, part
  of your damage becomes Fire — worth **+20% of a normal attack, dealt as Fire damage on top
  of the hit and bypassing the target's DEF**. It's a toggle in the Buffs panel for the
  Swordman line (and Super Novice), and it applies to **auto-attacks and Magnum Break itself**,
  matching the 9 August change. **Wootan Fighter Card** raises it to 30%. This was previously
  missing from the calculator entirely, so Swordman-line auto-attack DPS was understated
  whenever the buff was up — expect a visible jump against Fire-weak targets.
- **Crescent Scythe now shows the HP it heals you.** Both the plain and the slotted version
  heal **0.1% of the damage dealt per refine** on a critical hit — so a +10 one returns 1% of
  the crit, ten times what a flat 0.1% would give. The crit breakdown shows the HP restored,
  clearly kept out of the damage total and DPS since it's healing, not damage.

### Changed

- **Reflect Shield uses its new formula.** Damage is now
  `SkillLevel × (SoftDEF/2 + ⌊VIT/10⌋²) × (100 + 2×DEF) / 1000`. **VIT now counts
  quadratically**, so it's far and away the most valuable stat for it — doubling VIT more
  than doubles the reflected damage — and hard DEF from armour scales it as well.
- **FUEL Card** now adds **+10%** to Acid Terror and Demonstration (was +30%), and **Pill
  Bug Card** adds **+10%** to Cart Revolution (was +8%), matching the rework notes. Acid
  Terror's higher base damage more than covers the FUEL nerf.
- **Pirate Skel Card's auto-Mammonite casts at level 10 only for Blacksmiths and
  Whitesmiths.** A Merchant or Alchemist who has mastered Mammonite still procs level 1,
  per the `[Blacksmith]` tag on the card.

### Fixed

- **Skills your job can't learn no longer inflate your stats.** Switching jobs in the build
  editor left the previous job's passive levels behind in the build, and the calculator kept
  applying them — so a build that had once been a Monk carried Martial Arts into an Assassin
  and read **+20 FLEE** that the character doesn't have in game (207 shown vs 187 actual).
  Passive levels are now checked against the selected job's own skill tree, which also
  repairs builds already saved or shared with the stale data — just reload the link. Skills
  **granted by gear** are unaffected: a card really can give you a skill outside your tree.
- **Item scripts that multiply by a condition now compute the right number.** An expression
  like `1 + 9 × (skill level == 10)` was collapsing to 1, which capped every such bonus at
  its minimum value. This is what makes the auto-Mammonite / auto-Bash cards cast at level
  10 for a character who has mastered the skill.

## 2026-08-08

### Fixed

- **Grand Cross now accounts for the target's defense.** Grand Cross's physical portion is
  reduced by the target's DEF again, correcting a recent change that had it ignore defense
  entirely. This was calibrated against real in-game damage tests on Knight of Abyss: GC's
  magic portion is only lightly reduced (soft MDEF), but its physical portion takes full DEF,
  so **Provoke's DEF reduction meaningfully scales GC damage** (often the difference between a
  clean one-shot and not). Against low-DEF targets the numbers barely move. Weapon masteries
  and Demon Bane still apply as before.

### Changed

- **Unverified monster cast-skill numbers are now labelled "for testing".** Cast skills
  priced from a baseline ratio Payon Stories may have tuned (monster-native `NPC_` skills
  and a few unaudited vanilla skills) are marked **for testing** in the Survivability panel
  — a clearer prompt to confirm the figure in-game — replacing the quieter "≈ est." tag.
- **Skills that can't be modeled are now shown explicitly.** Monster damage skills with no
  reliable Payon Stories formula (Dark Breath, Spiral Pierce, monster-only 3rd-job skills)
  are now flagged **not modeled yet** in the Survivability panel instead of quietly showing
  element and type only, so it's clear the missing number is a known gap rather than an
  oversight. The `NPC_` "for testing" ratios were also re-audited against pre-renewal
  Hercules and confirmed correct as pre-re baselines.

## 2026-08-07

### Added

- **Monster "clone" skills now show real damage too.** Some monsters cast copies of
  player skills under their own internal names (an Eddga's Bash, a Lord Knight card's
  Pierce or Sharp Shooting). The Survivability panel now prices these through the same
  accurate ratios as the player versions instead of showing only element and type.
  Pierce correctly counts as 2 hits against you (a Medium-size player), not the 3 it
  uses against large targets.

### Fixed

- **Monster cast-skill damage now uses Payon Stories' reworked numbers, not the
  vanilla ones.** When a monster casts a player skill at you, the Survivability panel
  prices it with the same PS-accurate formulas the calculator uses for your own casts.
  This adds damage numbers for PS-only spells that were previously shown as element/type
  only (Lord of Vermilion, Fire Pillar) and corrects several that were overstated by the
  old vanilla values (Meteor Storm, Soul Strike, Napalm Vulcan). Multi-wave spells like
  Lord of Vermilion no longer multiply their already-total damage by the wave count.
  Skills whose Payon Stories power isn't publicly documented (e.g. Dark Breath) continue
  to show element and type only rather than a guessed number.

## 2026-08-06

### Added

- **Monster cast-skill damage in the Survivability panel.** Tapping one of a
  monster's damage skills now shows the damage it does to *you*, not just its
  element and type. Player skills a monster casts (Fire Bolt, Bash, Meteor, …) are
  priced accurately through the incoming-damage pipeline — damage per cast (all
  hits), how many casts would down you, and which resist reduces it. Monster-native
  `NPC_` skills are priced from the Hercules-baseline ratio and labelled **≈ est.**
  (Payon Stories may tune their power beyond that). Skills that only inflict a
  status or drain (Stone Curse, Decrease AGI, SP drains) correctly report "no direct
  damage", and a few flat/special skills (Dark Breath, self-destruct) still show
  element and type only.

### Changed

- **Clearer support wording.** The tip modal, the donation card under the results, and the
  footer note now explain what a contribution goes toward — helping cover hosting costs and
  keeping the (free) calc and its reworks going — instead of the milk-tea metaphor.

### Fixed

- **Ring of Peace now accepts a card, and uses its correct item id.** The accessory was defined
  with 0 card slots, so the editor never showed a card slot for it — it's now a 1-slot accessory,
  matching the in-game item. It was also mistakenly stored under item id 91136, which is actually
  Frostfire Cartridge (a duplicate JSON key was silently shadowing the real cartridge); Ring of
  Peace now lives under its real id 8269 and no longer collides.

- **Auto Blitz Beat now factors into a Falcon Hunter/Sniper's DPS.** The falcon's auto-triggered
  Blitz Beat was displayed as a damage number but was never folded into the attack DPS or
  time/hits-to-kill. A bow *auto-attack* now procs it at ⌊LUK/3⌋% chance for
  min(Blitz Beat level, ⌊job level/10⌋+1) hits (capped at 5) — its expected value rides on the swing
  (no added attack time) and surfaces as a proc branch. The falcon panel now shows the real proc
  chance and hit count (previously it always said "5 hits") and hides the row when Blitz Beat isn't
  learned. The proc is also surfaced **inline under the Normal-attack tab** (next to the DPS it
  feeds) as an "Auto Blitz Beat" panel showing the proc chance, per-proc damage, and its
  ≈ DPS contribution — instead of being buried in the separate Falcon tab.

- **Negative stat bonuses now show on the stat cards.** A pet or gear that *lowers* a stat (e.g. the
  Yoyo pet's −1 LUK) was already applied to the stat total, but the little bonus badge only rendered
  positive bonuses, so the −1 had no visible attribution. Equip/buff badges now show negative
  values too (e.g. "−1 equip").

- **Hits-to-kill and time-to-kill are now consistent.** Hits-to-kill was computed from the displayed
  branch's per-hit damage (e.g. the crit hit), effectively assuming every hit lands that way, while
  time-to-kill used the blended DPS (which folds in crit *rate* and procs). So a build with bigger
  crits but a lower crit rate could show *fewer* hits yet a *slower* kill time — contradictory. Both
  now derive from the same expected damage-per-cycle (DPS × attack period), so more damage/fewer hits
  always means a faster kill.

## 2026-08-05

### Fixed

- **Setting Dirk description corrected (20% → 5%).** The item tooltip claimed "+20% trap damage"; the
  actual (and calculated) bonus is +5%. Display-only fix — the calc already used 5%.

- **Magic damage no longer double-counts a weapon's +MATK%.** A magic weapon's `bMatkRate` (e.g. a
  Rod's +15% MATK) is already folded into your MATK stat, but the magic damage step was multiplying
  by it a **second** time — inflating every spell for any caster using a MATK% weapon/gear by that
  percentage. Removed the duplicate application in all magic paths (bolts/spells, autospell, Grand
  Cross). Flat +MATK gear (e.g. Conductor Ring) was already correct and is unchanged. For a Rod
  (+15%) that's a ~13% overstatement now corrected.

- **Ahlspiess (and similar) now bypass DEF.** Weapons/gear with `bIgnoreDefRace,RC_All` (or a
  composite race like `RC_DemiPlayer`) as a single-argument bonus were storing the DEF-ignore under
  a dead `RC_All` key that the damage step never reads, so the pierce did nothing. Those composite
  race keys now fan out to their real constituents (RC_Boss + RC_NonBoss, etc.) at aggregation time —
  matching how the two-argument race bonuses already worked. Ahlspiess damage is now unaffected by
  the target's DEF, as intended.

- **Modeled several damage skills that were silently computing a flat 100% ratio.** A cross-class
  audit found learnable damage skills falling through to a placeholder 100% ratio. Added the
  (battle.c-verified) formulas for **Tiger Knuckle Fist** (40+100×lv), **Chain Crush Combo**
  (400+100×lv), **Raging Palm Strike** (200+100×lv), **Head Crush** (100+40×lv), **Joint Beat**
  (50+10×lv), and **Sharp Shooting** (200+50×lv). These are vanilla pre-re values pending in-game PS
  confirmation, so they still show the "PS unaudited" tag in the breakdown. (Remaining gaps with
  special mechanics — Spiral Pierce, Pressure, Shield Chain, Magic Crasher — are tracked for a
  dedicated pass.)

- **Re-audit of "verified" skills caught six more wrong formulas.** A sweep of every skill marked
  as matching PS (the `vanilla_ok` set) against the PS wiki found several that were mislabeled (same
  class of bug as Finger Offensive). Corrected: **Grimtooth** → flat 200% ATK (was 100+20×lv);
  **First Wind / Kamaitachi** → 200%→600% MATK (was 130%→250%); **Thunder Storm** → 80% MATK/hit
  (was 50%); **Frost Diver** → 110%→200% scaling (was a flat 110%); **Ruwach** → 145% Holy MATK
  (was flat 100%); **Fire Wall** → 50% MATK per burn × (2 + level) hits (was flat 100%, 1 hit).

- **Finger Offensive now throws the right number of spirit spheres.** It was hardcoded to a single
  sphere (1 hit) regardless of the spheres set in Buffs, and used the vanilla per-hit ratio. Fixed to
  the PS values: **350% ATK per sphere (flat, all levels)**, throwing one sphere per skill level, so
  the hit count now tracks your active spheres (Lv5 with 5 spheres = 5 hits ≈ 5× the old damage),
  capped by the level and by how many spheres you actually have.

- **Wind Blade & Snow Flake Draft (Ninja) now do real damage.** Both were marked verified but had no
  ratio, so they computed a flat 100%. Added the PS-wiki values: **Wind Blade** 100% MATK per hit
  (Wind, hits scale by level), **Snow Flake Draft** 150%→350% MATK (Water, single hit, max Lv5).

## 2026-07-31

### Fixed

- **Chain Action now works (Gunslinger).** Chain Action (GS_CHAINACTION) — revolver normal attacks
  have a 7%/lv chance (70% at Lv10) to fire a second time, like Thieves' Double Attack — was defined
  in the profile but never applied, and wasn't selectable. Now it's a settable Gunslinger passive
  and its double-attack proc is folded into DPS when a **revolver** is equipped (no effect with
  rifles/shotguns/etc., per the wiki). At Lv10 a revolver's auto-attack DPS rises ~70%.

- **Rapid Shower marked verified (no longer flagged "unaudited").** Its ratio was using the vanilla
  fallback, which turns out to exactly match the PS wiki formula ((100+10×lv)% × 5 hits = 550% at
  Lv1 → 1000% at Lv10), so the "⚠ PS unaudited" tag was misleading. Confirmed and cleared it.

## 2026-07-30

### Added

- **Gatling Fever selectable (Gunslinger).** The Gatling Fever self-buff was modeled in the engine
  (PS: flat +40% ATK, level-scaled ASPD, no flee penalty) but wasn't in the buff picker, so there
  was no way to turn it on. Added it to the Gunslinger self-buffs (levels 1–10 — the ATK% is flat
  but ASPD/DPS rise with level).

- **Short share links.** "Copy share link" now produces a short `/?s=<id>` URL instead of the long
  `?b=…` build string (a stored, deduplicated build payload). Opening a short link resolves it and
  loads the build; if the shortener is unreachable it falls back to the self-contained long link, so
  existing `?b=` links keep working.

### Fixed

- **Multi-hit magic (bolts) now applies MDEF per hit — big overestimate fixed.** Each bolt of a
  multi-hit spell (Fire/Cold/Lightning Bolt, Soul Strike, Blaze Shield, autospell bolts) is reduced
  by the target's MDEF **separately**. The calc was multiplying the per-hit damage by the hit count
  *before* subtracting MDEF, so a target's (soft/flat) MDEF was subtracted only once from the whole
  volley instead of once per bolt — badly overestimating bolts vs high-MDEF monsters. Now the hit
  count is applied last, after per-hit MDEF/element/cards. Effect is small vs low-MDEF targets and
  large vs high-MDEF ones (e.g. Cold Bolt vs Greatest General drops ~20%, matching field results).

- **Momoe's Hairband now applies its Turtle Island bonus.** The hat's +1 AGI / +5 Flee already
  worked, but its main effect — **+20% damage vs the turtles of Turtle Island** (Permeter,
  Assaulter, Heater, Freezer; Turtle General is excluded) — wasn't modeled, so it looked like it did
  nothing. Added the per-monster damage bonus; it now shows in the breakdown when you target one of
  those mobs.

## 2026-07-29

### Fixed

- **Morpheus set no longer equippable by Super Novice.** The Morpheus set (Ring, Bracelet, Hood,
  Shawl) is "All except Novice" — and since a Super Novice's equip check uses its base Novice class,
  it can't wear them either. The vanilla item data shipped these with an empty job list, so the
  picker treated them as usable by every class (including Novice and Super Novice). Restored the
  proper restriction.

- **Double Bolt now changes hits-to-kill, not just DPS.** It was modeled as halving the attack
  period with unchanged per-cast damage, so DPS and time-to-kill dropped but **hits-to-kill stayed
  identical** with vs without it. Double Bolt actually fires the whole bolt volley a second time per
  cast, so a cast deals **2× damage** and kills in **half the casts**. Now modeled as ×2 damage per
  cast at the normal (capped) cast cadence — DPS still doubles, but per-cast damage and hits-to-kill
  now correctly reflect it. Also keeps the 3-casts/sec cap honest (the old period-halving implied
  6 casts/sec).

- **Cast-skill spam cap (3 casts/sec).** Instant-cast spells (high DEX + Poem of Bragi + delayrate
  gear, or Double Bolt) and **traps** were modeled with a 100 ms floor — up to 10 casts/sec, which
  is physically impossible and badly inflated DPS. Cast skills (magic + traps) are now floored at
  **333 ms (3/sec)**, matching the default other Payon Stories calcs use. The biggest correction is
  traps: Land/Blast/Freezing/Claymore Trap DPS drops ~3.3× to a realistic re-lay rate (per-trap
  damage is unchanged — only the assumed rate). For Bragi/Double Bolt bolt-spam the cap only binds
  once cast time reaches ~0; ordinary casts are unaffected. (Sourced from other PS calcs' 0.33 s
  default; the PS wiki documents Bragi's % reductions but no explicit cap, and this wasn't
  PDF-verified.)

## 2026-07-28

### Added

- **INT breakpoints.** The Breakpoints panel now shows a MATK row for builds with real INT
  investment: your current MATK range plus the next INT thresholds where it jumps, listed
  separately for **max** and **min**. Pre-renewal max MATK is INT + (INT/5)² (jumps every multiple
  of 5) and min MATK is INT + (INT/7)² (jumps every multiple of 7), each by a growing amount. It
  also flags the next natural-SP-regen steps. Computed the same way as the ASPD/cast/hit rows — by
  re-running the real status code with INT bumped — so the numbers match the calculator.

- **Structured data + `llms.txt` for search / AI answer engines.** Every build-guide page now
  carries `BreadcrumbList` and `Article` JSON-LD, and the guides index carries `BreadcrumbList`,
  `CollectionPage`/`ItemList`, and `SoftwareApplication` — so Google can show rich results and AI
  answer engines can resolve the calculator and its guides. Added a curated `/llms.txt` content map.
  All generated from the same single source of truth as the guides, so they can't drift.

- **Manual Blitz Beat.** Blitz Beat (HT_BLITZBEAT) is now selectable in the skill picker for
  Hunters/Snipers with a Falcon. Its damage is the per-hit value × the level's hit count (Lv5 = 5
  hits); per hit = (LUK + INT/2 + 6×Steel Crow + 20) × 2 — neutral element, bypasses DEF, and
  unaffected by ATK cards (wiki.payonstories.com/Blitz_Beat). Without a Falcon it shows "requires a
  Falcon" rather than a number.
- **Double Bolt for Sages.** The Double Bolt buff (100% instant re-cast of Fire/Cold/Lightning
  Bolt, Earth Spike or Soul Strike) is now available to Sages, not just Professors — on Payon
  Stories it's a Sage skill.
- **Shadow Slash "from Hiding" toggle.** Casting Shadow Slash or Haze Slash from Hiding / Cloaking
  now has a toggle in the Skill panel; the engine already applied the higher from-Hiding ratio, but
  there was no way to switch it on.

### Fixed

- **Buff-picker labels aligned to skill names.** A few party/song buffs were shown under slightly
  off names — "Increase AGI" → **Increase Agility**, "Overthrust" → **Over Thrust**, "Overthrust
  Max" → **Maximum Over Thrust**, "Poem of Bragi" → **A Poem of Bragi** — now matching the skill
  database. Added a test (`buff-labels.test.js`) that fails if any buff label drifts from its
  skill's real name, so this class of mismatch (e.g. the earlier "Ki" vs Ninja Aura) can't recur
  unnoticed.

- **Blaze Shield (Ninja) damage.** Was modeled as a single hit at 100 + 10×level % MATK (200% at
  Lv10). Corrected to the wiki formula: **50% MATK per hit**, with the hit count scaling by level —
  3 hits (Lv1–4), 6 (Lv5–8), 9 (Lv9–10) — for 150% / 300% / 450% total.

- **Improve Concentration no longer scales pet AGI/DEX.** Attention Concentrate's % was being
  applied to the AGI/DEX granted by a loyal pet (and, in the stat-card display, to cards too). Pet
  and card stat bonuses are equipment-like and excluded from Improve Concentration in-game, so
  they're now excluded here — both in the damage engine and the stat display.

- **Ninja Aura (NJ_NEN).** The buff was labeled "Ki", capped at Lv10, and gave only +1 STR/INT per
  level. Corrected to its Payon Stories name **Ninja Aura**, capped at **Lv5**, granting **+2
  STR/INT per level** (+10 each at Lv5) per the wiki. The stat-card display now shows +2/lv too.

- **Amplify Magic Power** buff level cap: Lv10 → **Lv5** (its actual max on Payon Stories; Lv6–10
  did nothing).

### Changed

- **Self-buffs renamed to their Payon Stories names** so you can find them by the in-game name:
  Attention Concentrate → **Improve Concentration**, Fury → **Critical Explosion**, Two-Hand Quicken
  → **Sword Quickening**, Mystical Amplification → **Amplify Magic Power**. (Double Bolt kept — that's
  the PS wiki's name for it.)

## 2026-07-26

### Added

- **Combine stat bonuses toggle.** A "Combine bonuses" / "Split bonuses" button in the Base stats
  header collapses each stat's per-source badges (+job +gear +buff +manual) into a single summed
  "+N", with the full breakdown kept on hover. The choice is remembered.

### Changed

- **Save up to 30 builds** (previously 10).

### Fixed

- **Stat cards no longer overflow their column** in the three- and four-column editor layout —
  large totals and multiple bonus badges used to clip the rightmost (LUK) card.

## 2026-07-25

### Added

- **Hunter Trapper support.** All four Hunter damage traps — Land Mine (Earth), Blast Mine (Wind),
  Freezing Trap (Water), Claymore Trap (Fire) — are now selectable in the skill picker (only
  Freezing Trap used to show), and there's a new **Hunter — Trapper** starter build.
- **Reflect Shield** is now selectable in the skill picker; its per-hit reflected damage was
  already computed but had no way to be picked.
- **Rust-Worn Apparatus** accessory added (Hunter / Rogue line): INT +1, Perfect Dodge +2.
- **Sage — Hindsight** starter build, and every starter build re-aligned to the Payon Stories
  wiki's recommended stat spreads.

### Fixed

- **Starter build stats.** Corrected templates whose stats didn't match the wiki or broke the
  level-99 stat-point budget — e.g. the Wizard PvE build is now a feasible 99 INT / 99 DEX, and
  Grand Cross / Asura / Desperado / Throwing use the right primary stats.
- **Improve Concentration stat display.** The stat cards no longer over-count AGI/DEX when
  Improve Concentration is combined with Blessing / Increase AGI. The display now matches the
  engine (which was already correct), so e.g. Blessing reads +10 DEX, not +11.

## 2026-07-24

### Added

- **Sage Auto Spell (Hindsight).** Sages and Professors can now set an Auto Spell / Hindsight level
  in the Buffs panel. On Payon Stories the activated level selects exactly one spell — Lv1 Soul
  Strike, Lv2–4 Fire/Cold/Lightning Bolt, Lv5 Earth Spike, Lv6 Fire Ball, Lv7 Thunderstorm, Lv8
  Heaven's Drive (Lv9 Stone Curse and Lv10 Safety Wall deal no damage) — which autocasts at a flat
  30% chance on every physical attack. The results now show an **Auto Spell (Hindsight)** breakdown
  with the per-proc magic damage (bolt ranks roll a random Lv2–4 cast, shown as a range), and the
  proc's expected value is folded into the DPS estimate. Assumes the underlying spell is learned.
- **Cast breakpoints show the next DEX jumps.** The Breakpoints panel's cast row now lists the next
  few DEX thresholds (smallest +DEX to reach each successive cast-time step), ending at the
  instant-cast point — matching the ASPD row — instead of only the instant-cast DEX.

### Fixed

- **Switching job resets the selected skill** to Normal Attack, so you no longer calculate a skill
  the new class can't use (e.g. a Wizard's Storm Gust lingering after switching to Sage).

## 2026-07-20

### Changed

- **A fourth column on very wide screens.** The build editor now lays its sections out in four
  columns on very wide displays (≥1800px), up from three, so more sections fit on one screen — handy
  for seeing stats and equipment together at a glance. On three- and four-column layouts the editor
  now fills the screen width (same side padding as the two-column view) instead of leaving wide empty
  margins. Narrower screens are unchanged (2 / 1 columns).

- **Manual stat bonuses are collapsible.** The "Manual stat bonuses" editor (flat STR/AGI/…
  overrides) now collapses under a toggle and is closed by default, trimming clutter for the
  common case. Any active override still shows as a badge on the stat card above, and the
  section remembers whether you left it open.

## 2026-07-19

### Added

- **Forged weapons (Star Crumb bonus).** On a blacksmith-forgeable right-hand weapon (daggers, swords,
  axes, maces, spears and knuckles — the actual forge list, so Damascus and Flamberge qualify but named
  weapons like Fire Brand don't) you can now set the forge quality — Very Strong, Very Very Strong, or
  Very Very Very Strong (1 / 2 / 3 Star Crumbs) — plus a Ranked-forge toggle. That adds the "seeking
  damage" (ignores DEF, can't miss, per hit): **+5 / +10 / +40**, and **+10** more for a ranked forge,
  stacking. It shows as a "Forge Bonus" step in the damage breakdown.

- **Build guides for every class.** A new set of Payon Stories build guides — an index at `/guides/`
  plus a page per class (Knight, Wizard, Monk, Sniper-style Hunter, … all 16) — with recommended
  stats, the signature skill, and gear tips. Each guide's "Open in the calculator" button deep-links
  the build straight into the calc preloaded, and the calc links back from the template picker and the
  footer.

### Changed

- **Wider screens now use three columns.** The build editor lays its panels out in three columns on
  wide displays (still two on a normal desktop, one on mobile), so the extra horizontal space isn't
  wasted.

- **The Features banner is more prominent.** It now uses the app's own highlighted-panel treatment — a
  gold-tinted gradient, an accent-colored border and a soft gold glow, with the "Features" title lifted
  into the accent color — so it stands out at a glance while still reading as native to the UI.

## 2026-07-18

### Added

- **Starter build templates** — its own "Start from a template" section (00) above Character. A picker
  loads a sensible build for any of the **sixteen classes**, named to match the PS wiki's build
  archetypes (Knight Hybrid, Crusader Grand Cross, Wizard PvE (DEX), Sage Bolter, Hunter Double Strafe,
  Bard Musical Strike, Dancer Throw Arrow, Priest Magnus Exorcismus, Monk Asura, Blacksmith Battle
  Smith, Alchemist Acid Demonstration (SAD), Assassin Sonic Blow, Rogue Back Stab, Super Novice Melee,
  Gunslinger Desperado, Ninja Throwing). Each sets the job, level, a stat spread following the class's
  PS-wiki stat guidance (linked from a hint), and a signature skill (e.g. Wizard loads Storm Gust, so
  its cast breakpoints show right away). Gear is left for you to pick — a starting point to tweak.

### Fixed

- **Spirit sphere ATK is now modeled as a Star Crumb-style flat bonus, not base ATK.** Each active
  spirit sphere grants +3 ATK, which the PS wiki describes as working "similar to forged weapons
  imbued with Star Crumb" — a flat, per-hit bonus that ignores the target's DEF and flee. The calc
  had been adding it into base ATK instead, so it was wrongly scaled by every skill's damage ratio
  and, worst of all, amplified by Asura Strike's ×(8 + SP/10) multiplier. Spirit sphere damage now
  applies as a flat post-defense add (like Star Crumb / forged weapons), shown as its own "Spirit
  Sphere Bonus" step in the breakdown. Auto-attack numbers are essentially unchanged; Asura Strike
  no longer over-counts sphere ATK (the inflation grew with your SP). Verified true-neutral (ignores
  weapon endow and the target's element), affected by damage cards (e.g. quad Santa Poring vs Shadow
  gives spheres ×1.8), and per-hit.

- **Per-hit mastery bonuses now proc on every hit of cosmetic multi-hit skills.** The Star Crumb
  forge bonus and the spirit sphere bonus are flat, per-hit adds. For skills the engine models as a
  single combined-ratio hit but that really strike multiple times (Triple Attack ×3, Chain Combo ×4),
  these bonuses were only being added once. They now multiply by the true hit count — e.g. 5 spheres
  on Triple Attack add +45 (5×3×3), not +15 — matching vanilla `ATK_ADD(div × …)`.

- **Super Novice can now use the Awakening Potion.** The ASPD-potion selector had Super Novice capped
  at Concentration; on Payon Stories it can use up to Awakening Potion (+15% ASPD), now selectable.

- **Improve Dodge is now selectable.** The Improve Dodge passive (+FLEE, i.e. more dodge chance) was
  read by the engine but never offered in the Passive skills panel. It now appears for the classes that
  learn it — the Thief line and Super Novice — so you can factor its dodge into survivability.

- **Sage Free Cast now grants (and shows) its FLEE.** Free Cast gives +4 FLEE per level on Payon
  Stories (max Lv5 → +20), but the calc applied none of it and didn't offer the passive. It now
  appears in the Sage's Passive skills panel (capped at Lv5) and adds its FLEE to the stat/breakpoint/
  survivability readouts.

### Changed

- **The ASPD / cast / hit Breakpoints panel is now a highlighted accent card.** It was previously a
  muted list that was easy to miss; it now sits in a gold-tinted card with a left accent stripe and a
  ⚡ heading so the attack-speed and cast-speed breakpoints stand out at a glance.

- **The Breakpoints Cast row now names the skill and level.** It shows which skill (and its level) the
  cast time is for — e.g. "6.00s Storm Gust Lv 10 — instant cast at +40 DEX" — so it's clear what's
  being cast at that speed.

- **The Breakpoints Hit row now names the target.** The hit-chance breakpoint is computed against the
  selected monster, so it now says which one — e.g. "92% vs Ferus [Fire]" (or "vs custom target") —
  instead of leaving you to guess what the percentage is measured against.

- **The reworks banner is now a Features list.** The banner that listed every per-class rework is now
  a concise list of what the calculator can do — Payon Stories custom equipment and skills, all PS
  class reworks (collapsed to one line that expands to the full per-class detail), the step-by-step
  damage breakdown, the ASPD / cast / hit breakpoint calculator, disambiguated damage/hit/dodge per
  monster, the survivability panel, Grand Cross recoil, build-vs-build comparison, the starter build
  templates, importing builds from the jaludev calculator, and light/dark mode. Expanded by default so
  the tools are easy to find.

## 2026-07-16

### Added

- **Super Novice class audit — Fury, never-died bonus, Attention Concentrate.** Audited Super Novice
  against the PS wiki. New in the Buffs panel for Super Novices: the **Fury chant** (+50% crit —
  Explosion Spirits at its true level 13, distinct from the Monk's 5-level Fury), the
  **never-died bonus** (job level 70+ without dying: all stats +10), and **Attention Concentrate**
  (it's in the SN skill tree but was only offered to Archer classes). Verified as already correct:
  job stat bonuses (+5 to every stat by job 68), job level cap 99, the PS staged HP/SP bonuses
  (+2,400 HP / +110 SP by 99), the full first-class skill tree, and the Angel's Protection Set
  5-piece combo (MaxHP +900, MaxSP +100 — matches the official PS item data).

- **"HIT 100%" on the monster card.** The Target panel's monster stats now include the HIT needed to
  land every attack on that monster (hit% = 80 + HIT − flee, so 100% at flee + 20), next to the
  existing Flee / Flee 95% readouts. Quagmire-aware: with Quagmire toggled it shows the lowered
  requirement (e.g. 90 → 80).

- **Calculation regression test suite.** The backend now ships ~50 automated tests: 30 golden
  scenarios covering every engine branch (normal/crit/katar hits, Asura Strike, Grand Cross with
  recoil, Heal-bomb, Turn Undead, Killing Stroke, Shield Boomerang, magic, traps, Acid Terror,
  Desperado's hit range, arrow elements, cards, refine, Super Novice mechanics, survivability) with
  frozen expected outputs, plus unit tests for the engine's building blocks (probability math, ratio
  precedence, hit clamps, element precedence, the jaludev importer). CI runs them before every
  deploy, so a future change that alters any damage number is caught immediately.

### Fixed

- **PS custom Super Novice gear no longer hidden.** The Super Novice equip fix mapped SN to the
  Novice mask outright, which was right for vanilla gear but wrongly hid Payon Stories custom items
  that flag Super Novice explicitly without the Novice bit (Guardian's Skull, Ghostly Muffler, Ghost
  Shroom Hat, Aggayu Mask, Fancy Shoes, Dragon's Hide, Aquatic Shawl, Poring Dagger). Super Novices
  now match both — caught by the new test suite.

- **Super Novice gear no longer missing.** With Super Novice selected, the equipment picker showed no
  weapons and none of the Novice/Angel gear (Angelic Guard, Angelic Protection, Angelic Cardigan,
  Angel's Reincarnation, Angel's Kiss, Super Novice Hat, …), and anything equipped was flagged invalid
  and stripped from the calculation. Cause: the item DB has no Super Novice bit of its own — the game
  checks the SN's base-class mask, which is Novice — but the job filters compared against the SN job id
  directly, matching nothing. Super Novice now filters as Novice everywhere (item picker, equip
  validity, greyed-out search results), surfacing its real arsenal (daggers, 1H swords, maces, staves,
  1H axes) and the full Angel set.

- **jaludev import: the arrow now comes along.** The jaludev calculator stores the selected arrow in
  its share link (and applies its element to bow attacks and Musical Strike / Throw Arrow), but the
  import ignored that field — so an imported Bard/Dancer/Archer build lost its Fire/Silver/etc. arrow
  and, with it, the elemental damage modifier. The arrow is now imported into the Ammo slot (matched by
  name; arrows this server doesn't have are listed as unmapped). Arrows not on this server (Hunting,
  Elven) are reported instead of silently dropped.
- **jaludev import: imported builds no longer force Neutral weapon element.** The import always wrote a
  weapon-element override of 0 (Neutral) even when jaludev's element dropdown was untouched. That
  override outranks the equipped arrow's element and the weapon's own innate element, so after an
  import, elemental arrows did nothing — Musical Strike (and every other weapon attack) was stuck
  Neutral even if you equipped a Fire Arrow by hand afterward. The override is now only carried when a
  non-Neutral element was actually selected on the jaludev side.
- **Performing bonus now visible in the damage breakdown.** The +100 ratio-point Performing bonus for
  Musical Strike / Throw Arrow was folded silently into the Skill Ratio multiplier (the damage was
  right, but nothing showed the bonus was applied). The breakdown now shows the base skill ratio and a
  separate **Performing** step (e.g. 300% → 400%) so you can see exactly what the toggle contributes.

## 2026-07-14

### Added

- **Breakpoints readout.** A new on-demand **Breakpoints** panel (under the Character stats) shows how
  much more of a stat it takes to cross the next threshold: the **AGI (or DEX) to reach the next whole
  ASPD**, the **DEX to instant-cast** your selected skill, and the **HIT (= DEX) to reach 95% / 100%
  hit** against the selected monster. It's computed by re-running the calculator's real status / cast /
  hit formulas with the stat bumped, so the numbers match exactly what the calc shows (including gear,
  job bonuses, buffs and any skill accuracy bonus). It refreshes automatically (debounced) as you edit
  the build, skill, or target.

### Fixed

- **Box of Gloom now shows its effect in the stat panel.** The box (which casts Improve Concentration
  Lv1, +3% AGI/DEX) was correctly applied to damage and to HIT/FLEE/ASPD, but the AGI/DEX totals in the
  Character panel were computed without it, so toggling the box looked like it did nothing. The stat
  readout now reflects it.
- **Equipment/monster search now ranks by relevance.** Search results were a plain substring match in
  id order, so an item like **Legacy of Dragon** fell past the result limit for a broad query ("le")
  and only appeared once you'd typed enough ("leg") for it to be the sole match (which then auto-selected
  it). Results are now ranked — name starts with your text, then a word starts with it, then a plain
  substring — so the item you want surfaces at the top right away.
- **Asura Strike: flat 1000 at all ranks, and it no longer ignores DEF.** The skill's fixed bonus is a
  constant **+1000** at every level (it was scaling `250 + 150×level`, i.e. 400→1000), and on Payon
  Stories Asura Strike now takes the target's **normal DEF** instead of ignoring it — a Knight of Abyss
  or other high-DEF target now reduces Asura damage as it should. Verified against the PSRO Monk Rework
  2026 document and the PS wiki.
- **Spirit spheres now add damage for Monks/Champions.** A new **Spirit spheres** input (in the Buffs
  panel, for Monk/Champion) adds **+3 ATK per active sphere** to all their attacks — auto-attacks,
  combos, and Asura Strike, where it's amplified by the `×(8 + SP/10)` multiplier. Capped at 5 (Monk) /
  15 (Champion).

## 2026-07-13

### Added

- **Box consumables in the Consumables panel.** Three new toggles: **Box of Gloom** (casts Improve
  Concentration Lv1 — +3% AGI/DEX from base stats), **Box of Resentment** (+20 ATK), and **Box of
  Drowsiness** (+20 MATK). The ATK/MATK boxes stack on top of the flat ATK/MATK item fields.

### Added

- **Monster picker distinguishes same-name monsters and hides duplicates.** Monsters that share a name
  now show a tag so you can tell them apart — **Ferus [Fire]** vs **Ferus [Earth]**, **Deleter [Fire]
  Lv66** vs **Lv65**, **Whisper [Ghost] Demon** vs **[Ghost] Undead**, **Dragon Egg [Neutral] Small /
  Medium / Large** — always leading with the element and adding the fewest of race / size / level
  needed to keep every label unique. Event / WoE / summoned copies of a field monster (the event Knight
  of Abyss, the duplicate Porings, Conductring, etc.) and renewal-id / spawn copies with identical stats
  are hidden, so only the monster you actually fight in-game is listed.

### Fixed

- **Venom Splasher now shows its damage.** The skill was restored to the picker earlier, but the
  damage calculation still short-circuited it through the same "no damage" guard — its item-DB entry is
  flagged NoDamage because the real hit is a delayed explosion. The guard now exempts skills the profile
  can actually compute (those with a damage ratio), so Venom Splasher (and Brandish Spear, Bomb)
  calculate real damage instead of showing zero.
- **Armor / accessory / headgear bonus audit.** Audited all 1,431 non-weapon equipment pieces against
  the Payon Stories item database and corrected ~44 whose scripts didn't match their stated effects.
  Several headgear applied a bonus **backwards** — **Classic Hat**, **Gigantic Majestic Goat**
  (Demi-Human), and **Hunting Cap** gave damage *reduction* (or the wrong damage type) instead of the
  stated extra *damage*; **Evolved Evil Wings** resisted the wrong race. Wrong stats fixed (**Dark
  Knight Mask** STR→DEX, **Amistr Hat** VIT +5→+2, **Leaf Cat Hat**, **Aries/Jasper**). Missing bonuses
  added (**Hawk Eyes** +3% long-range damage, the zodiac **Diadems/Crowns** and **Crown Cap / Book Pile
  Hat / Red Wing Hat** refine ATK/MATK tiers, **3D Glasses**, **Baby Dragon Hat**, **Neo Valkyrie
  Shield**, **Devilring Hat**, **Fur Seal Hat**, and more). Resistance values corrected (**Angelic /
  Satanic Helm**, **Reginrev's Wings**, **Novice Shield**, **Pinwheel Hat** MaxHP/SP).
- **Weapon bonus audit — magic weapons now apply their MATK bonus, and several other weapon bonuses
  corrected.** A sweep of all 708 weapons against the PS item database found weapons whose stated
  bonuses were missing from the script the calculator reads. Now fixed: **Book, Bible, Tablet, Girl's
  Diary, Legacy of Dragon, Book of the Apocalypse** (each missing MATK +15%) and **Diary of Great
  Sage** (missing MATK +20% / −5% after-cast delay); **Guardian of Light Wand** (missing MATK +18% and
  MaxSP +150); **Balmung** (missing Int +20 / Luk +20); **Hypnotist's Staff** (showed MATK +25%, should
  be +18%); **Cleaver** (its +5% Demi-Human bonus was applied as damage *reduction* instead of extra
  *damage*); and the rental **Ahlspiess** (Demi-Human bonus was +10%, should be +20%). Cross-checked
  against the Payon Stories item database and corrected four more: **Staff of Survival** (1-slot Dex
  version) MaxHP +400 → +200; **Nemesis**'s "Shadow elemental" bonus was applied to the Undead *race*
  instead of the Shadow *element*; and the rental **Refined Bloody Axe** (MATK +20% / −5% delay) and
  **Refined Hardcover Book** (flat MATK +100) had unrelated vanilla scripts.
- **Dragon-slaying weapons now apply their refine bonuses.** Dragon Killer, Dragon Slayer, Gae Bolg,
  and Dragon Wing grant refine-conditional bonuses against Dragon monsters (+HIT, +% damage, crit, and
  Dragon resistance at +6 refine, doubled at +7) that the calculator wasn't applying — the reworked PS
  effects weren't present in the item script the engine reads. Now applied. Also corrected two base
  bonuses surfaced along the way: **Dragon Slayer**'s Dragon damage bonus (was 15%, PS is 20%) and
  **Gae Bolg**'s missing 20% Dragon damage bonus.
- **Venom Splasher reappears in the skill picker.** Venom Splasher — along with Brandish Spear and
  Bomb (Acid Demonstration) — is flagged "no damage" in the item database because its real hit is a
  delayed explosion, so a filter meant to hide pure support skills was hiding it too. These skills are
  selectable again (the calculator computes their damage normally).

## 2026-07-12

### Added

- **Grand Cross self-damage (recoil).** The damage panel now shows the damage Grand Cross deals back
  to the caster on every cast, in two parts. **Part 1** is the Holy, Demi-Human hit recomputed against
  *your own* DEF and MDEF, then reduced by your Holy resistance (Faith, Talisman of Holy Protection,
  Angeling-carded armour) and Demi-Human resistance (Thara Frog) — and halved, since players take half
  the recoil. **Part 2** is the fixed casting cost of 20% of your current HP, which ignores all
  reductions. The readout shows the total HP lost per cast and whether you survive. Holy-element
  (Angeling) armour negates Part 1 entirely; the 20% HP cost always applies.
- **Faith (Crusader) is now selectable** under Passive skills. Its Holy resistance (up to −50% at
  Lv 10) and +MaxHP now factor into the Grand Cross recoil.
- **Survivability panel.** Calculate against a monster and a new readout shows how hard it hits *you*:
  the damage its basic attack (and any elemental attack skills) deals through your DEF/MDEF and
  reduction gear, hits to down you, effective HP, damage mitigated, and your dodge chance plus the FLEE
  needed for the 95% cap. It also lists the monster's damage-dealing cast skills — tap one to see its
  element and physical/magic type so you know what resist to bring. (Mob skill *power* is PS-tuned
  beyond the available data, so exact skill damage isn't shown — only the accurate basic/elemental
  attack figures are.)

### Changed

- **Damage breakdown redesigned.** The step-by-step breakdown is now a compact one-line-per-step list —
  each step's explanatory note is revealed on hover/tap instead of always being shown, so it's no longer
  a wall of text. It sits in its own card matching the self-damage and survivability readouts, with the
  **final damage shown as a prominent total**. Averages were removed (the total shows a min–max range,
  and the "average hits" metric is gone). The **Compare builds** panel is now a neutral utility panel so
  the colour-coded damage cards (gold breakdown · red self-damage · blue survivability) read as a
  distinct, consistent set.

### Fixed

- **Sharp Shooting's +20 critical bonus now applies.** Sharp Shooting is a guaranteed-critical
  skill with a built-in +20 crit rate, but an internal skill-id mismatch meant that bonus was never
  being added — Sharp Shooting was computing an ordinary critical rate. It now correctly includes the
  +20.
- **Shield Chain now applies its 20% accuracy bonus.** Like Holy Cross, Shield Chain lands with a
  built-in +20% hit rate; the calculator was showing normal accuracy for it. Fixed.
- **Pierce now hits by target size.** Pierce strikes once against Small targets, twice against Medium,
  and three times against Large — the calculator was always applying three hits, overstating its
  damage against Small and Medium enemies by up to 3×.
- **Holy Cross now applies its 20% accuracy bonus.** Holy Cross has a built-in 20% accuracy bonus,
  but the calculator was showing the same hit chance as a normal attack. The bonus is now applied to
  the hit rate (×1.2 before the 5–100% clamp), so Holy Cross lands more reliably against high-FLEE
  targets than a plain melee hit — matching in-game behaviour.
- **Demi-Human resistance now applies defensively.** Cards such as **Thara Frog**
  (`bSubRace,RC_DemiPlayer`) were stored under a race key nothing checked, so their 30% reduction
  wasn't being applied to incoming Demi-Human damage — or the Grand Cross recoil. Composite race
  resistances now fan out to their constituent races, so the reduction lands correctly.
- **Grand Cross now ignores the target's DEF, MDEF and size.** The PS wiki formula is simply
  `(ATK + MATK) × (100% + 40×lvl%)` with no defense term, and in-game Grand Cross ignores the target's
  defense (confirmed against RateMyServer and live damage on Knight of Abyss). The calculator was
  subtracting the target's hard DEF (physical half) and hard MDEF (magic half) and applying the weapon
  size penalty — undershooting by 2–3× against defended targets. Grand Cross now ignores those; only
  the small VIT/INT-based soft DEF/MDEF still applies.
- **Monster basic attacks are treated as Neutral.** A monster's normal melee is Neutral element, not
  its (defensive) property — which is why Raydric and Ghostring tank most monsters, including
  non-Neutral ones. Incoming basic-attack damage now uses Neutral, so Neutral-resist gear correctly
  reduces it; elemental *skills* still carry their own element.
- **Monster skill data is now Payon Stories-accurate.** The list of which skills each monster casts
  (and their elements) now comes from Payon Stories' own data instead of a vanilla baseline — so, e.g.,
  Baphomet shows its real kit and Knight of Abyss its Shadow-element attack.

## 2026-07-11

### Added

- **Import builds from the jaludev calculator.** A new **Import** action (top-bar menu) takes a share
  URL from `payonrocalc.jaludev.com` and loads it here — job, level, stats, refines and gear/cards,
  the equipment matched by name to this server's item database. Anything the jaludev calculator names
  differently or doesn't have is listed so you can set it manually. Note that the jaludev calculator
  is no longer kept up to date, so your damage here may differ from what it showed.
- **Build-vs-build comparison.** The results panel has a new **Compare builds** section: click
  **Pin** to save the current build as a column, then tweak your gear, cards, stats or skill and pin
  again. Each pinned build is compared side by side with your current one across **DPS, damage per
  hit, hits to kill, time to kill, crit chance and ASPD** — the best value in each row is highlighted,
  the top-DPS build is flagged, and pinned columns show a ▲/▼ delta versus the current build.
  **Load** restores a pinned build into the editor (and recomputes it) and **Clear all** resets the
  comparison.
- **Talisman of Holy Protection** added to the item database — the accessory (All Stats +1, Holy
  Damage −7%) was missing, so it can now be equipped in a build.

### Changed

- **"PS class reworks implemented" banner brought up to date.** It now lists the Acolyte/Priest,
  Bard/Dancer, Alchemist, Merchant and Ninja reworks (and Grand Cross under Crusader, plus the Monk
  additions) that had shipped but weren't listed, and corrects the Frost Nova wording to
  `175+15×lv` (i.e. 190% at Lv 1), max Lv 5.
- **Grand Cross breakdown labelled as "waves".** The damage panel now shows **Per-Wave Damage**
  and **Grand Cross Total (3 waves)** instead of "hits", matching how the skill's three cross
  ticks are described. Wording only — the damage is unchanged.
- **Clearer damage breakdown.** Steps that don't change anything (e.g. a bypassed "Card Fix" on
  Grand Cross, which ignores cards) are hidden, and every ×-multiplier now names the step it feeds
  into (e.g. "× 3 → Grand Cross Total (3 waves)"). This removes the confusion where the 3-wave ×3
  appeared to belong to the row above it.

## 2026-07-10

### Added

- **"Riding Peco Peco" toggle for Knight/Crusader-line jobs.** The engine already modeled the
  mounted attack-speed penalty and its removal by Cavalier Mastery, but there was no way to turn
  riding on, so Cavalier Mastery appeared to do nothing. The Buffs panel now shows a Riding toggle
  for Knight/Lord Knight/Crusader/Paladin. While mounted, ASPD takes the riding penalty (reduced one
  rank per Cavalier Mastery level, gone at Lv5) and Spear Mastery uses its higher mounted ATK value.

### Fixed

- **Proc cards (e.g. Bonechewer) no longer double-count.** An `autobonus` script is a *proc* — its
  bonus should only apply when it triggers (or via the "Cards always proc" toggle). The parser was
  also reading the `bonus` lines *inside* the autobonus block as always-on gear bonuses, so
  Bonechewer's `+5 Crit / +50% Crit damage` applied once just from equipping it, and again when
  "always proc" was enabled. The inner effects are now excluded from the base parse and only apply
  through the proc path.
- **Triple Attack (Monk) — level cap and crit.** It was selectable up to level 10 even though the PS
  rework caps it at **5** (140/180/220/260/300%); the picker and passive list now cap it at 5. It
  also couldn't crit when selected as an active skill — the "can crit while Critical Explosion / Fury
  is active" rule was only wired into the auto-attack proc path, not the active-skill path. Selecting
  Triple Attack with Fury up now crits correctly (and still can't crit without Fury).

### Changed

- **Skill picker now shows only real Payon Stories skills.** The damage-skill search was listing
  ~340 entries that don't exist on a pre-renewal server — Renewal 3rd-job skills, mercenary,
  homunculus, elemental-summon, and monster (`NPC_`) skills — plus pure support skills (Dispell,
  Soul Change, Benedictio, …) that deal no damage. The picker is filtered down to the ~100 actual
  PS player damage skills. Support skills that carry a "no damage" flag are also guarded at compute
  time, so they can no longer report a phantom MATK number.

### Fixed

- **Two magic-skill ratio corrections.** A sweep of exposed skills not covered by the earlier
  per-class audit turned up two Wizard/Ninja magic-ratio bugs:
  - **Jupitel Thunder** dealt roughly **11× too much** — the per-hit ratio was `100 + 100×lv` *and*
    then multiplied by the 3–12 hit count (≈13200% at Lv10). It's a flat **100% MATK per hit**;
    Lv10 is now 1200% total, not 13200%.
  - **Flaming Petals (Kouenka)** used `100 + 30×lv` per hit; it's a flat **90% MATK per hit** (its
    hit count already scales with level).
  - **Storm Gust** used the renewal-style `100×(lv+2)` as a single lumped hit (1200% @Lv10). It's now
    modeled the way it actually works — **`100 + 40×lv`% MATK per hit** (140%→500%) across its **10
    hits** vs a target that stays in the field, so Lv10 totals 5000% instead of 1200%.
- **Some Misc-type skills briefly returned 0 damage.** A dispatch guard added earlier the same day
  was too broad and routed BF_MISC skills that PS treats as normal ATK-ratio hits (Acid Terror,
  Demonstration, Venom Splasher, Ground Drift, Counter Attack, Bull's Eye, Magical Bullet) to
  "not implemented." The guard is now ratio-aware and only catches truly unported skills.
- **Refine ATK was suppressed on the wrong skills.** Hercules excludes the post-DEF refine bonus
  (`atk2`) for **Occult Impaction** (Investigate) and **Asura Strike** only, but the suppression list
  used stale skill ids that actually pointed at **Triple Attack** and **Body Relocation**. As a result
  Investigate and Asura were *over*-reporting by a refined weapon's flat refine ATK, while **Triple
  Attack** was *under*-reporting (it was losing its refine bonus). Now keyed by skill name, so all
  three are correct. (Found while auditing every skill in Grand Cross's special-handling group against
  the PR-Hercules source; Asura's `8 + SP/10` ratio and Killing Stroke's `STR×40 + HP×8%×Lv` were
  each confirmed correct against the Payon Stories wiki — those match PS's reworked formulas, not
  vanilla.)

## 2026-07-09

### Changed

- **Shorter share URLs** — build links now rename their state keys to short append-only codes
  before compressing (the `z3_` format), cutting a typical `?b=` param roughly in half. Existing
  links (`z2_`/`z1_`/older uncompressed) still open exactly as before.

### Added

- **"Performing" toggle for Bard/Dancer** — a new target-panel checkbox. While a song or dance is
  active, Payon Stories grants Musical Strike and Throw Arrow a flat **+100 ratio points** (Lv1
  300%, Lv5 400%). Ticking it adds that bonus to those two skills only; other skills are unaffected.
- **Holy Light LUK proc** — Payon Stories gives Holy Light a **LUK% chance to deal +60% damage**
  (×1.6). This is now modeled as a probability mixture, so the average damage folds in the proc
  (base × (1 + 0.6 × LUK%)) and the damage range spans a non-proc roll up to a boosted roll. LUK ≥ 100
  makes the bonus guaranteed.
- **Offensive Heal ("heal bomb")** — selecting **Heal** (`AL_HEAL`) now computes its damage against
  Undead-property targets instead of treating it as a generic 100% MATK spell. Damage = **50% of the
  heal value** (`floor((BaseLv + INT) / 8) × (4 + 8 × SkillLv)`) as Holy, modified by the target's
  undead element level; it ignores DEF/MDEF and cards. **Heal-effectiveness gear** that PS priests
  stack now boosts the heal value and therefore the bomb — both general `bHealPower` and Heal-specific
  `bSkillHeal` (e.g. Sacred Saints Robe, Gyokuto, heal robes), which were previously parsed and
  dropped. The new **Purifying Ring** accessory, combined with a **Rosary**, raises the bomb to
  **100%**. Non-Undead targets take no damage (Heal restores their HP).
- **Elemental Change (Sage) in the target panel** — a new dropdown that overrides the target's
  defensive element to Water, Earth, Fire, or Wind at level 1 (the Sage `SA_ELEMENT*` skills — e.g.
  Water 1). It has no effect on MVP/boss monsters, matching the game. Useful for seeing how much more
  (or less) your element deals after changing a monster's property.
- **Turn Undead now shows its instant-kill success chance** and folds it into the kill metrics.
  The chance uses the Payon Stories rework formula `[20×SkillLv + 3×LUK + INT + BaseLv +
  (1−HP/MaxHP)×200] ÷ 10 %` (halved if base INT < 40). "Casts to kill" and "Time to kill" now
  reflect the instant-kill probability (with the fail-damage chip as a fallback), instead of only
  counting the failure damage.

### Fixed

- **Grand Cross damage rewritten to match Hercules.** Verified against the PR-Hercules pre-renewal
  source (`battle_calc_magic_attack`, `CR_GRANDCROSS`): it's a full physical weapon hit (ATK → size
  fix → hard/soft DEF → **refine** → **weapon masteries**) plus a magic hit (MATK → **MDEF**), summed,
  put through the fixed Holy element, and **then** multiplied by the (100 + 40×lv)% ratio — the ratio
  is applied **last**. The old branch (a) omitted the refine ATK, (b) reduced the MATK part by
  physical DEF instead of MDEF, and (c) applied the ratio *before* DEF, leaving masteries/refine
  un-amplified. That last point matters most against Undead/Demon targets, where Demon Bane's flat
  bonus is now correctly multiplied by the ratio.
- **Grand Cross now deals its full 3-hit damage** — the skill places a 0.9s cross that ticks every
  0.3s, so a single target takes **3 hits** (a fixed count, not stay-time-dependent), but the calc
  was only computing one tick. The breakdown now shows the per-hit value and the **×3 total**, folded
  into DPS. (The per-cell reduction when multiple monsters stack on one cell isn't modeled — this is
  the single-target case.)
- **Improve Concentration no longer boosts card-combo stats** — Attention Concentrate's AGI/DEX %
  correctly excludes direct card bonuses (and buffs), but *card combos* (e.g. the Munak/Bongun/Yao
  Jun +1-all-stats set, or the Thief +4 AGI card set) were leaking their AGI/DEX into the multiplied
  base. Card-combo stats are now excluded like any other card bonus; equipment-set combos (e.g.
  Dragon Vest + Manteau) stay factored in, matching the wiki (base stats, job bonus, Owl's Eye, and
  armor are included; cards and buffs are not).
- **Arrow Vulcan now scales with level** — the Clown/Gypsy skill had no damage ratio defined, so it
  fell back to a flat **100% at every level**. It now deals the correct **300%/400%/…/1200% ATK**
  for Lv1–10 (`200 + 100×SkillLevel`), matching the in-game skill description. Musical Strike was
  already correct (200%→300% for Lv1–5, the Payon Stories values).

## 2026-07-08

### Fixed

- **Killing Stroke now uses its real damage formula** — the Ninja skill was being treated as a
  generic 100%-ATK weapon skill. Its damage doesn't scale with weapon ATK; it sacrifices the
  caster's HP for a fixed hit of `STR×40 + HP×(8%×SkillLevel)` (Neutral, always hits, DEF and cards
  still apply). It now computes that, using current HP when set (otherwise full HP). The Mirror
  Image damage bonus isn't modeled.
- **Bakuenryu (Exploding Dragon) now scales with level** — the Ninja spell had no damage ratio
  defined, so it fell back to a flat 100%×3 hits (300% at every level). It now deals the correct
  **300%/450%/600%/750%/900% MATK** for Lv1–5.
- **Refine-scaling item bonuses now apply the full amount** — item scripts that compute a bonus as
  an expression (e.g. `getrefine()*5` for "+5% per refine") were being silently capped at **+1**,
  because the parser only understood plain integers and fell back to a boolean evaluator for
  anything with arithmetic. Such bonuses now evaluate correctly, so every "+N% per refine"-style
  item (and any bonus using arithmetic) applies its real value.
- **Stone Discus corrected to the Crusader rework** — it was granting +3% per refine to **both**
  Shield Boomerang and Shield Charge; the rework makes it **+5% per refine to Shield Boomerang
  only**. (Combined with the fix above, it now actually scales with refine.)
- **Knight fixes (Blade Mastery, Counter Attack, Bowling Bash)** — three bugs found while auditing
  the Knight patch:
  - **Blade Mastery on one-handed swords** — the rework merges Sword Mastery into Blade Mastery,
    which now boosts 1H swords too, but the calculator pointed the 1H-sword lookup at a non-existent
    skill, so a Knight using a one-handed sword got **no mastery ATK**. It now correctly applies
    Blade Mastery's +4 ATK/level.
  - **Counter Attack always crits** — Auto Counter always lands a critical in-game, but the
    calculator was showing it at the normal crit rate (a skill-id mismatch pointed the logic at
    Endure). It now correctly treats Counter Attack as a guaranteed critical.
  - **Bowling Bash damage scales with level** — it was hard-coded to a flat 400% (correct only at
    level 10); it now scales **100 + 30×level** (130% at Lv1 → 400% at Lv10), matching the wiki.
- **Holy Strike fixed to a Priest skill and made selectable** — this Battle Priest skill (a Holy-
  property melee proc dealing `[100 + STR + (1 + BaseLevel)]% ATK`) was tagged with the wrong job
  (Knight/Lord Knight) and couldn't be computed. Corrected its class to Priest/High Priest and
  surfaced it in the damage-skill picker so its per-hit damage can be checked.
- **Magnus Exorcismus hits more targets for full damage** — per the Acolyte/Priest rework, it now
  deals 100% MATK per hit to **Ghost-element and Undead-race** monsters as well as Undead-element
  and Demon-race (previously only Undead element + Demon race got full damage; others got 50%).
- **Bard/Clown ASPD collapsed when a Musical Instrument was equipped** — the job ASPD table was
  missing the `MusicalInstrument` weapon type for Bard and Clown, so equipping an instrument fell
  through to the very-slow default and dragged ASPD down to ~130. Added the instrument base (575,
  mirroring the Dancer/Gypsy Whip). Also backfilled the Unarmed/Knife/Bow bases for Dancer and
  Gypsy, which had the same gap for non-Whip weapons.
- **Rolling Stone (Payon Stories custom shotgun) had a broken duplicate definition** — a stray
  second entry with a bad weapon type (`W_SHOTGUN`) and no equip slot was shadowing the correct
  one, so a Gunslinger equipping it lost all ASPD. Removed the duplicate; the shotgun now equips
  and attacks at normal speed.
- **Enchant Poison capped at level 5 (Payon Stories)** — the Assassin rework reduces Enchant Poison
  to max level 5, but the calculator allowed level 10, letting its passive damage bonus vs
  Poison-element monsters reach +20% instead of the intended **+10%**. The skill now caps at 5 (and
  the passive clamps to +10% even on older saved builds). Venom Dust was likewise capped at 5
  (duration only — no damage effect). Sonic Blow (900%), Grimtooth, the Katar offhand hit (61%),
  Envenom's weapon element, and the new Sonic Blow / Grimtooth critical-hit rules (double crit
  chance via Katar, bypass DEF, excluded from Katar Mastery's +50% crit damage) were all verified
  correct against the Assassin Rework document.
- **Fire Pillar now ignores 50% of MDEF instead of all of it** — Fire Pillar was piercing 100% of
  the target's Magic Defense (vanilla behavior), because its "ignore defense" flag caused the whole
  MDEF step to be skipped. Payon Stories lowered it to **50%**, so it now applies a 50% ignore like
  its rework specifies. Its level cap (5) and hit count (2 + 2×level) were already correct.
  Relatedly, the 50% MDEF ignore on Fire Pillar, Napalm Vulcan and Soul Strike (Lv10) now reduces
  **both hard and soft MDEF** (it was only reducing hard MDEF before), matching the rework docs.
- **Soul Strike's MDEF ignore now requires level 10, and Volcano grants its ATK bonus** — per the
  Sage Rework, Soul Strike's 50% MDEF ignore only applies once level 10 is learned, so the
  calculator now grants it only when Soul Strike is set to level 10 (lower levels no longer get it).
  Separately, the Volcano land-spell buff was applying its +MATK% and Fire-damage% but not its flat
  **+10/20/30 ATK** (Lv1/2/3) — that now feeds physical damage for anyone standing in Volcano.
- **Holy Light damage corrected to the current Payon Stories value** — the calculator used an older
  base-level-scaling formula (~200% MATK at base 99); PS now deals a flat **250% MATK**. Also fixed
  the **Cookie card**, which boosts Holy Light by **20%** on PS (the calculator had the vanilla
  10%). Vanilla server profile is unchanged (125% MATK, +10% Cookie).
- **Turn Undead now uses its real damage formula** — it was being treated as a generic 100%-MATK
  magic skill. Turn Undead's damage doesn't scale with MATK at all; on a failed instant-kill it
  deals a fixed Holy hit of `(BaseLevel + INT + SkillLevel×10) × 3 × (1 + LUK×3/200)`, ignoring
  DEF and cards, with the Holy element multiplier vs the target still applied. (The instant-kill
  roll itself isn't modeled — the calculator shows the guaranteed damage floor.)
- **Wizard/Mage multi-hit magic damage corrected** — three skills were over-scaling because the
  engine applied a `+k×level` bonus to each hit where Payon Stories deals a flat 100% MATK per hit:
  Napalm Vulcan (was up to 2× too high), Soul Strike (Undead bonus was baked into the base and hit
  every target), and Meteor Storm (was several times too high). Each now matches the wiki
  (100% MATK per hit; Soul Strike keeps its +5%×level vs-Undead bonus on top). Also fixed a crash
  where **Soul Strike against Undead monsters** threw an error instead of calculating.
- **Skill picker respects the Payon Stories level cap** — skills that PS caps below vanilla (Frost
  Nova, Fire Pillar, Sightrasher, Amplify Magic Power, Spear Stab — all max 5 on PS) were still
  selectable up to their vanilla max (10) in the level selector, even though the engine clamped the
  effective level during the calc. The picker now shows the PS-capped max level.

### Added

- **Trick Arrow and Quick Step are now selectable** — these Rogue PS-custom skills had damage ratios
  defined but couldn't be picked or calculated, because the skill lookup only read the vanilla skill
  database. The calculator now resolves PS-custom active skills, so both appear in the damage-skill
  picker and compute correctly: **Trick Arrow** (200% ATK over 2 hits, at bow range) and **Quick
  Step** (10% ATK). This groundwork will let other PS-custom skills be surfaced the same way.
- **Breaking Cloak (opener) toggle** — the Assassin's Cloak initiative bonus: breaking Cloak (Lv3+)
  with an **auto-attack** makes that opening hit deal **×2 damage**, or with **Sonic Blow** deals
  **+10%**. Enable it in the target-modifiers panel. Because it's a one-time opener, it scales the
  shown per-hit damage but not sustained DPS; skills other than auto-attack and Sonic Blow are
  unaffected.
- **Venom Dust target toggle** — the Assassin's Venom Dust applies a "Mailbreaker" debuff that makes
  a target standing on it take **+10% physical and magical damage** for 5 seconds. Enable it in the
  target-modifiers panel to add the bonus to all damage branches. Unlike Provoke and Quagmire, it
  works on **MVP/boss** monsters, and it stacks multiplicatively with Lex Aeterna.
- **Ring of Peace** (Payon Stories custom accessory) — MaxHP +100, MaxSP +10, HP & SP recovery
  rates +5%. Level 40, all jobs. A survivability accessory; no effect on outgoing damage. From
  [the wiki](https://wiki.payonstories.com/Ring_of_Peace).

## 2026-07-07

### Changed

- **The share URL only updates on Save or Copy-link** — the address bar no longer rewrites itself on
  every edit; it's updated only when you save a build or copy the share link, so the URL stays stable
  while you tweak.
- **Edits survive refresh (auto-draft) + an unsaved-changes dot** — your in-progress build is now
  autosaved to the browser tab so a refresh keeps unsaved edits, even though the URL doesn't change.
  A freshly-opened shared link still shows that build (not your old draft). An **unsaved-changes dot**
  appears on the Save / Load button (and the mobile menu) until you save the build or copy the share
  link. "Start over" clears the draft. The draft is per-tab and cleared when the tab closes; use Save
  to keep a build permanently.
- **"Unofficial fan tool" disclaimer** — the title now marks the app as an unofficial, fan-made tool,
  with a fuller disclaimer in the title's info tooltip and the footer (not affiliated with or
  maintained by the Payon Stories staff; numbers may be inaccurate — verify in-game). Link-embed
  titles/descriptions say the same.
- **Shorter share links** — build-share URLs are now ~40% shorter. Before compressing, the shared
  state drops every value that equals its default and fields that are re-derived on load (job name,
  skill max-level, an unused custom target in monster mode, the default server, …), under a new
  `z2_` link format. Every existing shared link (the older `z1_` and legacy forms) still opens
  unchanged.

### Fixed

- **Weapon cards no longer flip to "Wildcard mix" on reload** — if you'd tried the wildcard mix on a
  weapon and then switched back to picking real cards, reloading the build wrongly reselected the
  Wildcard tab (leftover wildcard data was mistaken for wildcard mode). A slot with real cards now
  loads in card mode, and switching back to "Cards" clears the stale wildcard data.
- **Quagmire's effect is now visible** — Quagmire only lowers the target's flee (→ your hit chance),
  never damage, so it looked like it "did nothing" when your hit was already at the 100% cap. The
  Target panel now shows the monster's own **Flee** and how Quagmire reduces it (e.g. `116 → 91`),
  and a note appears under the Quagmire selector when your hit is already 100% (so it has no further
  effect). The mechanic itself was already correct.
- **Desperado damage shown as a range** — Desperado's `100+20×lv` is *per hit* and it sprays a
  variable number of shots (in-game 0–10, ~6 average); the calc treated it as a single hit. It now
  shows the damage as a **1–10-hit range** (the damage summary's min = a single shot, max = all 10),
  reflecting the real spread instead of a single average. Per
  [the wiki](https://wiki.payonstories.com/Desperado).
- **Tranq Shot damage gated to Demi-Human/Brute** — Tranq Shot (formerly Bull's Eye) deals 100%
  damage only to Demi-Human and Brute monsters on PS (and "a little bit" — approximated as 10% —
  to others); the calc was doing 100% to every race. Its main purpose is the Sleep chance. Per
  [the wiki](https://wiki.payonstories.com/Tranq_Shot).
- **Increasing Accuracy removed on PS** — the skill was folded into Single Action on Payon Stories,
  so its buff toggle is now hidden on PS and has no effect there. Still available on vanilla.
- **Soul Bullet hits 3×** — Magical Bullet / Soul Bullet was calculated as a single hit, but on
  Payon Stories it fires **3 times** (like Triple Action), so its damage was undercounted by ~3×.
  It now applies 3 hits. Per [the wiki](https://wiki.payonstories.com/Soul_Bullet).
- **Gunslinger Single Action HIT corrected** — Single Action was giving +2 HIT per level, but on
  Payon Stories it grants **+4 HIT per level** (+40 at Lv10) per
  [the wiki](https://wiki.payonstories.com/Single_Action). Fixed, so accuracy — and therefore hit
  chance and effective DPS — is no longer undercounted for gun builds. Its ASPD bonus (+1% per two
  levels) was already correct. Vanilla is unchanged (+2/lv).
- **Combat stats now show flat gear ATK, plus a HIT stat** — flat weapon ATK from gear (`bAtk`, e.g.
  PS Bradium Ring's +10) was used in the damage pipeline but left out of the Character panel's ATK
  readout. It's now shown as part of the equipment-ATK bonus, the `+X` in the in-game-style
  `base+bonus` readout (e.g. a 1-ATK character with Bradium Ring reads `1+10`; refine and gear `bAtk`
  are summed into that `+`). Added a **HIT** stat to the combat readout too — it was missing
  entirely, so gear HIT bonuses (e.g. Bradium Ring's +5) weren't visible anywhere. (MATK already
  reflects gear MATK after the `bMatk` fix.)
- **Gunslinger shotgun masteries now work** — the shotgun skills (Dust, Full Buster, Spread Attack)
  weren't shown in the passive-skill panel, so their Lv10 mastery bonuses could never be enabled.
  They're now selectable, and **Dust's +1 ATK per STR** (with a Shotgun equipped) is applied to ATK,
  as is the 7% Neutral resistance (Shotgun / Grenade Launcher). Per
  [wiki.payonstories.com/Dust](https://wiki.payonstories.com/Dust). Verified: a STR-99 Gunslinger
  with a Shotgun gains +STR ATK at Dust 10, and nothing with a Revolver.
- **Crit-vs-race cards now work** — `bCriticalAddRace` (+CRIT rate against a specific race, e.g.
  crit-vs-Demi-Human gear) was defined with no effect. It now raises crit rate against matching
  targets (verified: 10% → 30% vs Demi-Human with a +20 card, unchanged vs other races).
- **Monster-specific damage cards now work** — `bAddDamageClass` (+% physical damage vs one specific
  monster, e.g. cards that boost damage against a particular MVP) had a duplicate, effect-less
  definition overriding it, so it did nothing. Now applied when the target is that monster.
- **Gear MATK (`bMatk`) now applies** — flat MATK from gear (MATK staves, magic-boosting cards —
  ~150 items) was silently dropped: `bMatk` was defined with no engine field and never folded into
  the MATK total, so magic damage from MATK gear was undercounted. It now adds to MATK.
- **Race "ignore DEF" cards now work** — `bIgnoreDefRace` (physical damage ignores a whole race's
  DEF — 40+ Plant/Dragon/Demi-Human/non-boss "killer" cards) was in the bonus table but wired to
  nothing, so those cards did nothing. It now ignores 100% of the matching race's hard DEF.
- **High Wizard Card now works (magic MDEF ignore)** — `bIgnoreMdefRace` (High Wizard Card: magic
  ignores 100% of non-boss MDEF) was parsed but never routed, so the card did nothing. It's now
  wired into the magic defense step. Verified: against a MDEF-40 non-boss target, magic damage goes
  from ×60% to ×100%.
- **Drake Card now works** — `bNoSizeFix` (Drake Card's "damage ignores size") was parsed but never
  routed into the damage engine, so equipping it did nothing. It now correctly removes the weapon's
  size penalty. Verified: a dagger vs a Large monster goes from a 50% size fix to 100%. (Same class
  of bug as the monster-family "Bane" cards — a real bonus that was silently dropped.)
- **Gunslinger can use Berserk Potion** — the ASPD-potion picker capped Gunslinger at Awakening
  Potion, but Gunslinger is on Berserk Potion's usable-class list even in vanilla (per
  `item_db_usable`). Gunslinger now offers the full Concentration / Awakening / Berserk range. (Ninja
  is unchanged — it's genuinely Awakening-capped in vanilla.)

## 2026-07-06

### Fixed

- **ATK readout now shows the refine bonus** — the Character panel's ATK stat showed only
  `statusATK + weaponATK` and left out the weapon's refine ATK, so a refined weapon read low versus
  the in-game status window. It now displays the same two-part value as in-game (e.g. `420+35`, where
  `+35` is a +7 level-3 weapon's refine ATK). Damage was already correct — this was a display-only
  gap in the stat panel.
- **Skill damage bonuses (`bSkillAtk`) no longer double-counted** — cards/items that boost a specific
  skill's damage (e.g. an Acid Terror +30% card, or Yser Card's Backstab/Raid +10%) were applied
  **twice** in the weapon-skill pipeline — once inside the skill-ratio step and again right after —
  inflating those skills. They're now applied once. Example: a bow Rogue's Acid Terror dropped from
  an inflated 3049 to the correct 2333. Skills without a `bSkillAtk` bonus are unaffected.
- **Acid Terror ignores cards** — `AM_ACIDTERROR` (and other `IgnoreCards` skills) now correctly
  bypass the Card Fix stage, so card damage modifiers (bAddRace/bAddEle/bAddSize/atk-element and the
  target's card-based resists) don't apply. Flat-ATK cards (Andre, etc.) still count, as in-game.
- **Venom Splasher (and other offensive skills) now selectable** — the skill picker's
  "damage-dealing only" filter keyed off the skill's attack type, but the skill DB labels everything
  that isn't a plain weapon/magic hit as "Misc" — so genuinely offensive skills like Venom Splasher
  and Acid Terror were hidden alongside the buffs and masteries. The picker now also keeps any skill
  the active server profile has a real damage formula for, so on Payon Stories these appear and
  calculate correctly (Venom Splasher = `500 + 50×lv + 30×Poison-React-lv`%). Vanilla is unchanged.
- **Monster-family "Bane" cards now apply** — Orc Lady, Goblin Leader, Kobold Leader, Lava Golem
  (and other `bAddRace2` cards) were doing nothing, because the calculator had no monster-family
  data and silently dropped the bonus. The engine now knows each mob's racial group (RC2) and
  applies these cards' bonus (e.g. +30% physical damage) when the target belongs to that family —
  and correctly gives nothing against other targets. Verified end-to-end: an Orc Lady card reads
  +30% vs Orc-family mobs and 0% vs everything else. This is separate from the weapon-card wildcard
  "Type" mix, which still applies unconditionally as a slotting simulation.

## 2026-07-05

### Added

- **Hits to kill & time to kill** — the damage summary now shows, against a selected monster, the
  **hits to kill** (min / avg / max, from the max / avg / min damage rolls vs the mob's HP) and the
  **average time to kill** (HP ÷ estimated DPS, so it folds in ASPD, crit mix and procs — cast +
  after-cast delay for skills). Monster mode only (needs the mob's HP); uses the combined total for
  dual-wield.
- **"Flee 95%" in the monster stats** — the monster stat grid now includes the FLEE needed to dodge
  the selected mob 95% of the time (`mob level + DEX + 75`, since incoming hit% floors at 5%).
  Soft-flee only — Perfect Dodge and the multi-mob FLEE penalty are noted in the tooltip.
- **Wildcard "Type" cards** — the weapon wildcard mix gains a fourth category, **Type**, for
  monster-family "Bane" cards (Orc / Goblin / Kobold / Golem-Bane, etc. — +30% physical damage to
  that family via `bAddRace2`). It applies as its own card-fix multiplier alongside Race / Size /
  Element and defaults to 30%. Since the mix is a "what card would I slot" simulator, it applies to
  the selected target (i.e. assumes a matching family card).

### Fixed

- **Mobile layout on iPhone** — the content sections (Character, Equipment, Buffs, Target, etc.) had
  desktop-sized padding on phones, leaving a cramped, off-center column with wasted margins. On small
  screens the panels now use tighter padding and full width, the monster-stat grid drops to two
  columns, and a stray-overflow guard keeps the page from shifting sideways.
- **Modals scroll on iPhone** — the Changelog / Saved builds / Results modals could clip their
  content on small screens and refuse to scroll (a flexbox `min-height` trap, plus `vh` counting
  iOS Safari's address bar). The modal body now scrolls properly and the height tracks the visible
  viewport (`dvh`).
- **Investigate / def-ratio damage now keeps its range** — `MO_INVESTIGATE` and def-ratio
  (`bDefRatioAtk`) cards scale damage by the target's *soft DEF*, which is random over a range on
  high-VIT targets. The Defense Fix step was folding that into a single average factor, collapsing
  the damage to one number; it now applies the full soft-DEF variance so the result shows a real
  min–max (e.g. Investigate vs a VIT 100 target now reads 5805–6870 instead of a flat ~6337).
  Targets with no soft-DEF variance (low VIT) still resolve to a single value, so normal attacks
  are unchanged.
- **Demon Bane matches Payon Stories** — Demon Bane's ATK bonus now uses the PS-reworked values
  ([wiki.payonstories.com/Demon_Bane](https://wiki.payonstories.com/Demon_Bane)): `+5/lv` plus the
  `(1+BaseLv)/20` per-level base term → **+100 ATK at Lv10 / base 99** vs Undead-element or
  Demon-race (up from vanilla's +3/lv → 80), and it now also adds **+4/lv vs all other targets**.
  Fixes normal-attack and skill damage reading low for Acolyte-class builds vs Demon/Undead — e.g.
  a Monk vs Corruptor now matches in-game exactly (547, was 509). The vanilla formula's rounding
  was also corrected to match Hercules (floor the per-level multiplier).

- **ASPD %-bonus stacking** — ASPD-rate bonuses (Two-Hand/One-Hand/Spear Quicken, Adrenaline, etc.)
  and the flat ASPD-potion/`bAspdRate` bonus were applied as two separate multiplicative steps
  (each floored), which undershot the real value — e.g. +30% Quicken and a +20% potion gave
  ×0.70×0.80 = ×0.56 instead of the correct additive ×0.50. They're now summed into a single rate
  and applied once, matching pre-renewal behavior (fixes ASPD reading a couple of points low on
  buffed builds).

## 2026-07-04

### Added

- **Link preview / embed tags** — the page now has a descriptive title and Open Graph / Twitter
  card meta tags, so sharing the URL (Discord, Twitter/X, etc.) shows a real title and description
  instead of a bare link.
- **Favicons & app icons** — added a proper favicon (SVG + 16/32 PNG + .ico fallback), an
  iOS/Android home-screen icon and web manifest, and a logo image on the link embed. The
  top-left brand mark now shows the app logo instead of a placeholder glyph.
- **Manual stat bonuses** — a new section in the Base stats panel with STR/AGI/VIT/INT/DEX/LUK
  inputs for flat additions on top of allocated stats (for any source the calculator doesn't
  otherwise model). They fold into each stat's bold total (shown as a dim `+N` chip) and into the
  damage calculation; negative values are allowed. Backed by the build's existing `bonus_stats`
  field, which was already applied server-side but had no UI.
- **Monster stats in the target panel** — selecting a monster now shows a compact stat grid
  (HP, Race, Element + level, Size, DEF, MDEF, ATK range, and STR/AGI/VIT/INT/DEX/LUK) beneath the
  name, plus a "· Boss" tag for boss-protocol monsters. Data comes from the existing mob endpoint.
- **Max all / Reset passives** — the Passive skills panel gets "Max all" and "Reset" buttons that
  set every listed passive to its max level (or 0) in one click.
- **Two more Bard songs** — "A Whistle" (+Flee / Perfect Dodge) and "The Apple of Idun" (+Max HP)
  added to the Bard / Dancer songs list. Both are already modeled in the status calculator, so they
  show up in the combat-stat readout (they're defensive/utility — they don't change outgoing damage).
- **Auto Berserk (self buff)** — Swordman-line jobs (Swordman / Knight / Crusader / Lord Knight /
  Paladin) get an "Auto Berserk" toggle under Buffs → Self buffs. It models the self-cast Provoke
  Lv10 the skill grants while HP < 25%: +32% base ATK (2 + 3×lv) and −55% self-DEF (5 + 5×lv).
- **Provoke (target debuff)** — a selectable Lv 1–10 Provoke in the target debuff panel, reducing
  the target's DEF by `5 + 5×lv`% (−55% at Lv 10; scales both hard and soft DEF). No effect on Boss
  monsters. Kept on a separate status key/object from the player's Auto Berserk, so the two never
  interfere — turning on Auto Berserk only affects the player's ATK, and target Provoke only
  affects the target.

### Changed

- **Signum Crucis reworked for Payon Stories** — the target debuff now applies the PS values
  from `ps_skill_db.json`: a **hard-DEF-only** reduction of `10 + 4×lv` (**−50% at Lv10**),
  replacing the previous flat −35% that also (incorrectly) scaled soft DEF. It now correctly
  affects **Undead-element or Demon-race** targets (Undead is an element — Demon monsters of any
  element now qualify), and it stacks with Provoke.

### Fixed

- **Quagmire no longer auto-hits** — Quagmire was wrongly grouped with Freeze/Stone/Stun/Sleep in
  `hitChance.js` and forced a 100% hit. It actually only cuts the target's AGI/DEX by 10% per level
  (max 50% at Lv 5), lowering flee — hit is now computed normally. Bosses are immune (move-speed
  only) and the effect is halved vs players. The target-debuff toggle is now a **selectable Lv 1–5**
  (with a max option) instead of a plain checkbox; older shared links with the boolean form map to
  max.

- **Wildcard mix dropped after weapon switch** — the wildcard rows follow the equipped weapon's
  live card-slot count (`item.slots`, loaded asynchronously), but the damage calc aggregated over
  the stored `wildcard_slots` array, which drifts after switching weapons. Switching to a weapon
  with more slots (or toggling wildcard before the new weapon's data finished loading) left extra
  rows showing unsaved default bonuses that never reached the pipeline; switching to fewer slots
  kept applying stale rows. The aggregation now iterates the weapon's actual slot count using the
  same fallback default the UI renders, so the pipeline applies exactly what's shown.

## 2026-07-03

### Added

- **Payon Stories links** — Discord and PS Website links in the footer.
- **Ko-fi support button** — donation link in the topbar, below the damage results, and in the footer; proceeds go toward hosting costs.
- **Wildcard card mix** — weapon slots with card sockets now have a "Cards / Wildcard mix" toggle.
  In wildcard mode the card pickers are replaced by per-slot rows where each card position is set
  to a generic bonus type (Race / Size / Element) and a bonus %. Size is hardcoded to 15% + 5 ATK;
  Race and Element default to 20% with 4 / 10 / 15 / 20 options for PS custom cards. Bonuses
  always apply to all races/sizes/elements (RC_All, Size_All, Ele_All) and are merged into the
  engine's gear-bonus dictionaries alongside real cards.
- **Equipment slot browse list** — clicking an empty equipment slot input now shows up to 100
  items equippable by the current job (filtered server-side via `?job=` parameter), ensuring
  PS-exclusive high-ID items such as Setting Dirk appear in the initial dropdown. Typed searches
  still show all matching items (equippable first, non-equippable dimmed) with a limit of 20.
- **Visual pipeline damage breakdown** — the damage step list is redesigned as a proper pipeline:
  - Informational sub-components (Status BATK, Weapon ATK, Branch label) are shown as compact
    chips above the pipeline rather than inline rows.
  - Each calculation step is a row with a **dot-leader** connecting name to value, making it
    immediately clear which damage number belongs to which step even when the panel is narrow.
  - Between steps, a compact connector shows the **operation** applied: `× N.NN (+N%)` for
    multipliers, `+ N` / `− N` for flat additions/reductions, or `→` for pass-through steps.
    The connector also shows the step's note (e.g. `size: Medium`, `bMatkRate +15%`). Operation
    badges are colour-coded: green for boosts, muted for reductions, red for damage penalties.
  - **Final Damage** row is separated by a border and accented (no dot leaders — the visual
    distinction is sufficient).
  - Step values show `min–max` when the damage distribution has a non-trivial range.

### Changed

- **Responsive topbar** — three-tier layout covers all common device sizes: phones (≤600 px) show only brand mark, theme toggle, hamburger, and Calculate, with server select and all actions in the dropdown; tablets and small desktops (601–1279 px) keep the server select inline and put secondary actions in a side panel dropdown; wide desktop (≥1280 px) shows everything inline. Brand title and info tooltip hidden on phones to prevent overflow.
- **Stats chart hover tooltip** — hovering a day column shows a styled tooltip with the date, exact views count, and exact calcs count. Bar series are visually more distinct (wider bars, larger gap, column highlight on hover).
- **Skill search only shows damage skills** — the skill picker in Panel 07 now filters to skills with `attack_type` of `Weapon` or `Magic`, hiding passives (Sword Mastery, Endure, etc.) and non-damaging utility skills.

### Fixed

- **Permanent page view history** — a `consolidate.js` script reads all nginx access logs (including rotated `.gz` files) and writes page view events into `stats.ndjson`, so history is preserved beyond log rotation. Runs automatically on every deploy for fast incremental updates; a daily 2 AM cron keeps it current between deploys. The stats route now reads archived views from NDJSON and live views from nginx, splitting at the consolidation cursor to avoid double-counting.
- **Calculate events not being saved** — `data-store/` directory might not exist on first deploy, causing `fs.appendFile` to fail silently with ENOENT so every calculate event was dropped. `statsLogger` now creates the directory at module load time.
- **nginx routing** — replaced the broad `/stats/` prefix location block with exact-match blocks for `/stats/ping` and `/stats/data` so the SPA page at `/stats` is no longer intercepted and proxied to the backend.
- **Deploy cron setup** — `grep -v` in the crontab update pipeline exits 1 when no non-matching lines exist (crontab only contains the one entry), causing the deploy script to abort under `set -euo pipefail`. Added `|| true` to suppress the false failure.
- **Dual-wield damage pipeline uses new style** — the RH and LH step lists in the PS Assassin
  dual-wield breakdown now render with `PipelineView` (chip inputs + connector arrows) instead of
  the old flat step-list rows.
- **Wildcard bonuses no longer applied to empty slots** — stale `wildcard_slots` data in the URL
  could activate wildcard mode for a slot with no item equipped (e.g. `left_hand: null`), causing
  phantom race/size/element bonuses to be added to the calculation. Auto-activation and
  `onCalculate` now both guard against empty slots.
- **Pipeline Final Damage value alignment** — the Final Damage row had no dot-leader spacer, so
  its value hugged the label rather than aligning to the right edge. Added
  `justify-content: space-between` to `.pipeline-row--final`.
- **Pipeline left border rail removed** — `.pipeline-track` had a decorative `border-left` that
  made the layout feel cramped. Removed together with the compensating `margin-left`.
- **Quagmire auto-hit** — enabling Quagmire set the target's `flee` to 0, but `hitChance.js`
  uses `target.flee > 0 ? target.flee : target.level + target.agi` as a fallback, so auto-hit was
  never granted. Fixed by adding `SC_QUAGMIRE` to the auto-hit condition block alongside
  `SC_STONE / SC_FREEZE / SC_STUN / SC_SLEEP`.
- **Signum Crucis race restriction** — the Signum Crucis checkbox was previously not restricted to
  applicable targets. It is now disabled (opacity 0.4, not-allowed cursor) and auto-cleared in the
  frontend whenever the selected target is not Undead or Demon; the backend also race-guards the
  DEF reduction (`target.race === "Undead" || "Demon"`), so sending `signum_crucis: true` for an
  inapplicable race has no effect.
- **Body background-image gradient tiling at page bottom** — `html, body, #root` had
  `height: 100%` (exactly viewport height), causing the decorative radial-gradient
  `background-image` on `body` to tile into the overflow area when page content exceeded the
  viewport (visible as a mismatched coloured patch below the left column when the Target panel was
  expanded). Changed to `min-height: 100%` so the body grows with content and the gradients stay
  anchored at the actual document top and bottom.

## 2026-07-02

### Added

- **Target debuff system** — Panel 08 (Target) now has a "Target debuffs" section with:
  - *Element status* dropdown: Poisoned (→ Poison element), Frozen (→ Water element + halve hard
    DEF + auto-hit via `SC_FREEZE`), Stone Curse (→ Earth element + halve hard DEF + auto-hit via
    `SC_STONE`). Uses existing `defenseFix.js` / `hitChance.js` mechanic paths.
  - *Lex Aeterna* checkbox: applies ×2 to all damage branches (`normal`, `crit`, `magic`,
    `katar_second`, `double_hit`, `second_hit`, LH branches, proc branches) and to DPS.
    A "Lex Aeterna" step is appended to each branch's breakdown so the multiplier is visible.
  - *Quagmire* checkbox: sets `SC_QUAGMIRE` on the target → auto-hit (flee cannot be used to
    dodge). `hitChance.js` updated to return 100% hit for `SC_QUAGMIRE`, matching the same path
    used by `SC_STONE/SC_FREEZE/SC_STUN/SC_SLEEP`.
  - *Signum Crucis Lv10* checkbox: hard DEF −35% (`def_percent` reduced by 35 pp). Use vs
    Undead / Demon targets.
  - *Asleep* checkbox: `SC_SLEEP` on target → auto-hit and ×2 crit rate (existing paths in
    `hitChance.js` and `critChance.js`).
  - *Stunned* checkbox: `SC_STUN` on target → auto-hit (existing path in `hitChance.js`).
  - Debuff state (`TargetMods`) persisted in the URL `?b=` param alongside build/skill/target.

- **Snake Card** (4037) + **Cave Viper Card** (8001) combo — equipping both grants an additional
  +15% chance to inflict Poison on hit and +20 ATK. Combo entry added to `ps_item_combo_db.json`.

- **Cave Viper Card** (8001): Added +20% chance to inflict Poison on hit (`bAddEff,Eff_Poison`).
  The existing +10% damage to Poison-element targets is unchanged. The kill-drop mechanic (chance
  to drop Poison Arrows on killing Poison-element enemies) is not modelled in the damage calculator.

- **PS Bleeding revamp** — reworked bleeding status and affected gear/skills for Payon Stories:
  - **Mechanic** (`PS_BLEEDING_REVAMP`): Bleeding now deals 5% max HP every 0.5s for 2.5s (25%
    total), can kill, grants 35s immunity after expiry, and cannot be applied to targets ≥15 base
    levels higher than the attacker.
  - **Breeze Card** (4390): ATK bonus changed 5 → 8; Bleed on hit changed 5% → 2%.
    Combo with **Muka Card** now adds +6% Bleed on hit (combo entry added to
    `ps_item_combo_db.json`).
  - **Hakujin** (13014, 13015): Added 8% Bleed on hit.
  - **Huuma Giant Wheel Shuriken** (13301, 13302): Bleed on hit removed.
  - **Hatii Claw** (1815): Bleed on hit changed 2% → 5%.
  - **Skogul** (mob): Bleed chance on attack reduced 30% → 25% *(mob-side; not modelled in
    the outgoing-damage calculator)*.
  - **Killer Mantis** (mob): Bleed chance on attack increased 6% → 10% *(mob-side)*.
  - **Wounding Shot** (`GS_PIERCINGSHOT`): Base Bleed chance reduced 40% → 15%; consuming 1
    coin restores it to 40% *(skill-side; not modelled in the damage calculator)*.
  - **Acid Terror** (`AM_ACIDTERROR`): Bleed chance reduced 15% → 10% *(skill-side)*.

- **PS Sage rework** — damage-relevant changes from the Sage Rework publication are now modelled:
  - **Soul Strike** (`MG_SOULSTRIKE`): ignores 50% of hard MDEF when skill level 10 is learned
    (`MG_SOULSTRIKE_MDEF_IGNORE`); also deals `+5% × skill level` bonus damage against Undead
    race targets (`MG_SOULSTRIKE_UNDEAD_BONUS`), shown as a dedicated step in the breakdown.
  - **Fireball** (`MG_FIREBALL`): per-level MATK table `(70 + 30 × lv)`% — lv 1 = 70%, lv 10 =
    340%. Already stored as a PS ratio override `(lv) => 40 + 30 * lv`; confirmed correct against
    the published table.
  - **Earth Spike** (`WZ_EARTHSPIKE`): 140% MATK per hit × skill level (e.g. lv 5 = 700% total).
    Already stored as PS ratio override `() => 140`; confirmed correct.
  - **Heavens Drive** (`WZ_HEAVENDRIVE`): same 140% per hit formula. Already stored; confirmed.
  - **Advanced Book** (`SA_ADVANCEDBOOK`): flat ATK +10/15/20/25/30 and ASPD +3–7% at levels
    1–5 (no MATK% bonus). Already stored in `serverProfiles.js`; confirmed correct.
  - **Volcano / Deluge / Violent Gale** persistence buffs at max level 3: fire/water/wind
    +10/15/20% DMG, Volcano +10/20/30 ATK and +2/4/6% MATK, Violent Gale +3/8/15 Flee.
    Already stored and capped at level 3; confirmed correct.

## 2026-07-01

### Fixed

- **Dancer/Gypsy can now equip Whip weapons** — all Whip-type items in the item
  database were incorrectly restricted to job `[19, 4020]` (Bard/Clown). The
  source data relies on a `SEX_MALE` gender field to lock Musical Instruments to
  Bard/Clown, but Whips carry no gender restriction and therefore must use job
  `[20, 4021]` (Dancer/Gypsy). Fixed via a normalisation pass in `dataLoader.js`
  that remaps the job array for any item whose `weapon_type` is `"Whip"`.

### Added

- **PS Gunslinger rework** — changes from the Gunslinger Balancing Patch are now
  modelled:
  - **Triple Action** (`GS_TRIPLEACTION`): total damage 420% (3 hits × 140% each).
    PS formula `100 + 40 × SkillLv` at max level 1. Vanilla was 450%
    (100 + 50 × lv). Already stored as a PS ratio override; description
    updated to reflect the confirmed total.
  - **Ground Drift** (`GS_GROUNDDRIFT`): damage `200 + 60 × SkillLv`% (max 800%
    at level 10). Vanilla was `100 + 50 × SkillLv`%. Already stored as a PS
    ratio override; confirmed correct.
  - **Soul Bullet** (`GS_MAGICALBULLET`): damage `(50 + DEX + BaseLvl)`%. Already
    stored as a PS ratio override with a `ctx`-aware lambda. Confirmed correct.
  - **Heavy-Tipped Bullet** (item 13235): ATK 45 and `+10% damage to all races`
    (`bonus2 bAddRace,RC_All,10`) — already implemented in `ps_item_manual.json`
    via `RC_All` which fans out to `RC_Boss`/`RC_NonBoss`, covering every monster.
  - **Dust (`GS_DUST`) neutral resistance**: +7% resistance to Neutral element
    when mastered at level 10 (previously the description mentioned it but it was
    never wired into `PS_PASSIVE_RESISTS`). Now active for Shotgun and Grenade
    Launcher, matching the patch note and the existing Dust description.
  - **Full Buster / Spread Attack — Grenade Launcher support**: 7% Neutral
    resistance at max level now also triggers when using a Grenade Launcher
    weapon (previously Shotgun only). `weapon_types` updated to
    `["Shotgun", "Grenade"]` for both skills in `PS_PASSIVE_RESISTS`.

- **Select-all on number inputs** — clicking into any numeric input (base level,
  job level, base stats, refine level, passive skill levels, consumable ATK/MATK,
  song buff levels, skill level, custom target fields) now selects the existing
  value so it can be replaced immediately without manually clearing it first.

- **PS Rogue rework** (`Rogue_Patchnotes_PayonStories.pdf`) — the following
  damage-relevant changes are now modelled:
  - **Backstab formula**: changed from `300 + 40×lv`% (vanilla) to
    `200 + 30×lv`% (PS). The +40% multiplicative opportunity bonus (monster
    not targeting the Rogue / player not facing the Rogue in PvP) is exposed
    as a **Backstab opportunity** checkbox in the Skill panel; when checked,
    `_runBranch` applies ×1.4 after the skill ratio.
  - **Trick Arrow** (`PS_RG_TRICKARROW`): ratio corrected to 200% (2 hits ×
    100% ATK each; was incorrectly set to 100%).
  - **Raid** (`RG_RAID`): PS override `100 + 100×lv`% gives 600% at max level
    — already correct from a prior pass. Confirmed.
  - **Vulture's Eye bow Double Attack** (`RG_BOW_DOUBLE_ATTACK` mechanic flag):
    on PS, having both `TF_DOUBLE` (Double Attack) and `AC_VULTURE`
    (Vulture's Eye) with a bow equipped enables the Double Attack proc on
    auto-attacks. Proc rate = `doubleRate × min(TF_DOUBLE_lv, AC_VULTURE_lv)`.
  - **Yser Card** (ID 8236, footgear): now functional — adds +10% Backstab
    damage, +10% Raid damage, and +5 HIT via `bSkillAtk` bonuses. Description
    corrected (SP cost reduction −2, was −3).
  - **`bSkillAtk` in `_runBranch`**: the weapon skill branch now applies
    `gearBonuses.skill_atk` bonuses (same step that already existed in the
    magic and trap branches). This makes all `bonus2 bSkillAtk` card bonuses
    work for weapon-type skills going forward.

- **PS Knight rework** (`Payon Stories Knight Patch (1).pdf`) — the following
  changes are now modelled in the damage calculator:
  - **Sword Quickening CRIT**: +1% Critical Hit chance per skill level (was
    +0.8%/lv in vanilla). `SC_TWOHANDQUICKEN` reads `cri_per_lv: 10` from
    `PS_PASSIVE_OVERRIDES` (internal ×10 scale).
  - **Spear Stab max level 5**: Skill level is capped at 5 on PS via
    `skill_level_cap_overrides`. Damage ratio is `100 + 40 × lv`% (already
    in `PS_BF_WEAPON_RATIOS` from a prior pass).
  - **Blade Mastery covers 1H Sword**: Blade Mastery (`KN_TWOHANDMASTERY`,
    renamed on PS) now applies the 4 ATK-per-level bonus to 1H Sword weapons
    in addition to 2H Swords. Implemented via `mastery_prefer_fallback`:
    when a Knight has `KN_TWOHANDMASTERY` levels the engine routes 1H Sword
    mastery to it instead of vanilla Sword Mastery (`SM_SWORD`). Characters
    without `KN_TWOHANDMASTERY` (e.g. Swordman, Crusader) still use vanilla
    `SM_SWORD`.
  - **Counter Attack 200%**: Already implemented from a prior pass
    (`KN_AUTOCOUNTER: () => 200` in `PS_BF_WEAPON_RATIOS`). Confirmed correct.
  - **Sword Quickening 1H ASPD +10%**: Already implemented (`"1HSword": () =>
    100` in `PS_ASPD_BUFFS`). Confirmed correct.
  - **Spear Stab ratio 100+40×lv**: Already implemented in `PS_BF_WEAPON_RATIOS`.
    Confirmed correct.

- **Cards always proc toggle** — the damage breakdown panel now shows a
  "Cards always proc" checkbox when the current loadout contains cards with
  proc-based effects (e.g. Bonechewer Card). When checked, the calculator
  treats all `autobonus`-based card procs as permanently active and
  recalculates immediately. This shows what damage looks like if you're
  lucky enough to have the proc up all the time (or for planning purposes).
  The toggle disappears when no proc cards are slotted.
  - Backend: `gearBonusAggregator.compute()` now parses `autobonus` scripts
    and stores them in `gearBonuses.auto_bonuses`. When `build.flags.force_procs`
    is set, the inner bonus effects are applied as permanent bonuses. The
    calculate route returns `has_auto_bonuses: boolean` in its response.
  - Frontend: `forceProcs` state in `BuildEditor`, passed through
    `ResultsPanel` → `DamageSummary`. Toggle triggers an immediate
    recalculation with the new flag.

- **PS Wizard / High Wizard rework** (`Wizard_and_High_Wizard_Trans_Class_Changes.pdf`) —
  the following changes are now modelled:
  - **Frost Nova** (`WZ_FROSTNOVA`): PS rework formula `(175+15×lv) + 10×FrostDiverLv`%
    (190/205/220/235/250% base at levels 1–5, up to +100% with Frost Diver 10).
    Max level capped at 5.
  - **Lord of Vermillion** (`WZ_VERMILION`): 4 waves, each wave deals `20×lv×waveNum`%
    MATK. Total = `200×lv`% (2000% at level 10). Added to `PS_BF_MAGIC_RATIOS`.
  - **Napalm Vulcan** (`HW_NAPALMVULCAN`): element changed from Ghost to Shadow (Dark,
    element 7) via `skill_elements` override in the PS profile. 50% hard MDEF
    ignore added via the `HW_NAPALMVULCAN_MDEF_IGNORE` mechanic flag.
  - **Fire Pillar** (`WZ_FIREPILLAR`): 50% hard MDEF ignore added via the
    `WZ_FIREPILLAR_MDEF_IGNORE` mechanic flag. Max level capped at 5.
  - **Mystical Amplification** (`WZ_AMPLIFYMAGICPOWER` / `SC_AMPLIFYMAGICPOWER`):
    PS rework scales MATK boost per level — `min(lv,5)×10`% (10/20/30/40/50%).
    Vanilla remains flat 50% regardless of level. Max level capped at 5.
    Added to the buffs panel (Wizard / High Wizard).
  - **Sightrasher** (`WZ_SIGHTRASHER`): max level capped at 5. Formula already
    correct (`100+75×lv`% = 175/250/325/400/475%).
  - **Soul Drain** (`HW_SOULDRAIN`): passive +1% MaxHP per level (max +10% at
    level 10). Exposed as a passive skill slider; added to `DAMAGE_RELEVANT`
    and `ACTIVE_SKILL_TYPE_EXCEPTIONS` in `dataLoader.js`.
  - Reworks banner updated to include Wizard / High Wizard.

### Changed

- **PS Crusader rework** (`PSRO_Crusader_Rework_2026.pdf`) — the following
  changes are now modelled in the damage calculator:
  - **Spear Quicken**: No longer grants Critical Hit. Grants +1 Hit and +1
    Flee per skill level instead. *(Was already implemented from a prior pass;
    confirmed correct.)*
  - **Providence**: Self-cast MDEF buff grants +2 MDEF per skill level.
    *(Already implemented; confirmed correct.)*
  - **Reflect Shield**: PS rework formula — `floor(SoftDEF × (1 + 1.75 ×
    HardDEF/100) × SkillLvl/10)`, ignores target DEF, requires a hit roll,
    enhanced by cards and armor element. *(Already implemented; confirmed
    correct.)*
  - **Magnum Break — endow restricted to auto attacks** (`SM_MAGNUM_ENDOW_ATTACK_ONLY`
    mechanic flag): the fire semi-endow from Magnum Break no longer applies
    to skill damage on PS. When a weapon endow is active and any skill other
    than SM_MAGNUM itself is being calculated, the weapon element reverts to
    the weapon's natural element.
  - **Stone Discus**: Shield Boomerang damage bonus updated to 5% per refine
    level (was already 5% but also incorrectly included Shield Charge). Now
    only boosts Shield Boomerang.
  - **Stalactic Golem Card**: DEF +1 / Soft DEF +10 / +10 more if base VIT
    > 77. *(Was already implemented; confirmed correct.)*

- **Card search filtered by slot** — card pickers in the equipment section
  now only show cards that can compound into that slot type. Weapon slots
  show weapon cards, armor slots show armor cards, headgear slots show
  headgear cards, and so on. The left-hand slot shows weapon cards when a
  weapon is equipped there (dual-wield) and shield cards when a shield is
  equipped.

### Fixed

- **Venom Splasher (`AS_SPLASHER`) element modifier bug** — `IgnoreElement` was
  listed in the skill's `damage_type` but `nk_ignore_ele` was never set, so
  `calculateAttrFix` always ran in the weapon branch. Against non-neutral element
  targets this incorrectly multiplied the explosion damage by the element table
  modifier (e.g. a Fire-element weapon vs an Earth monster would wrongly apply
  a 50% penalty). Against neutral targets the numbers were unaffected (100×).
  Fixed by wiring `nk_ignore_ele` alongside `nk_ignore_def`/`nk_ignore_flee`
  in `calculate()` and skipping AttrFix in `_runBranch` when set. The breakdown
  now shows "BYPASSED — NK\_IGNORE\_ELEMENT" in the steps to make it explicit.

## 2026-06-30

### Added

- **PS Assassin dual-wield — combined damage PS buff** — the
  `DUAL_WIELD_PS_DAMAGE_BONUS` mechanic flag (Payon Stories only) applies a
  ×1.10 multiplier to the combined three-hit total (2×RH + LH) after mastery
  factors are applied. The headline damage range and DPS both reflect it; a
  "PS Dual-Wield Bonus ×1.10" row appears at the bottom of the step list in
  PS mode.

- **PS Monk rework — Triple Attack proc** — `MO_TRIPLEATTACK` now procs on
  auto-attacks for Monk/Champion on Payon Stories. Proc rates: 28/26/24/22/20 %
  at skill levels 1–5; Knuckle weapons gain +0.2 × skill level % per 10 job
  levels. When the **Fury** buff (SC_EXPLOSIONSPIRITS) is active, Triple Attack
  procs can crit. Skill level tracked via the passive panel; Fury toggled via
  Self Buffs.

- **PS Assassin rework — dual-wield three-hit model** *(beta)* — Assassin and
  Assassin Cross with a weapon in the off-hand now use a three-hit auto-attack
  model per swing: hit 1 = RH × `AS_RIGHT` factor, hit 2 = same roll as hit 1
  (× `AS_RIGHT` factor), hit 3 = LH × `AS_LEFT` factor. PS mastery factors:
  `AS_RIGHT` lv1–5 → 80/90/100/110/120 %; `AS_LEFT` lv1–5 → 60/70/80/90/100 %.
  Without mastery (lv 0), vanilla base penalties apply (RH 50 %, LH 30 %).
  Gated by the `DUAL_WIELD_PS_THREE_HIT` mechanic flag — remove from
  `serverProfiles.js` to revert to single-weapon calculation.

- **Damage panel — PS / Vanilla toggle** *(dual-wield builds only)* — a
  `[PS (3-hit) beta | Vanilla]` pill toggle appears in the damage results panel
  when an Assassin/Assassin Cross has an off-hand weapon equipped. **PS mode**
  shows the combined three-hit damage range (2×RH + LH with mastery factors)
  and the combined DPS; the step list expands into two labeled sections (hits 1
  & 2 = RH weapon, hit 3 = LH weapon). **Vanilla mode** shows the single
  right-hand weapon result and recomputes DPS without the off-hand contribution.

### Changed

- **Damage panel moved inline** — the damage breakdown is now rendered
  directly on the page (below the toolbar, above the editor grid) instead of
  a modal overlay. Clicking **Calculate** always scrolls the panel into view,
  even when it was already open from a previous calculation. A × close button
  dismisses the panel without losing the result.

- **Equipment search — auto-select on single result** — while typing in any
  equipment, card, or skill search field, if the results list narrows to
  exactly one selectable (non-disabled) item it is committed automatically
  without requiring Enter or a mouse click.

- **Equipment search — Tab selects closest match** — pressing Tab while a
  search dropdown is open now commits the keyboard-highlighted item if one is
  active, or the first non-disabled result otherwise, before moving focus.
  Previously Tab only acted when an item had already been keyboard-navigated to.

### Fixed

- **Refine level cap** — refine input now enforces a maximum of +10
  (pre-renewal cap), both via the input's `max` attribute and a clamped
  `onChange` handler so typed values above +10 are corrected immediately.

- **ASPD display precision** — base stats panel shows one decimal place
  (e.g. 186.3) instead of a rounded integer, matching the damage results panel.
  The formula uses a single `Math.floor` on the combined AGI/DEX reduction,
  matching eAthena's integer-division behaviour exactly.

## 2026-06-29

### Added

- **PS Monk Rework — Triple Attack proc** — Triple Attack (MO_TRIPLEATTACK) now
  procs during auto-attacks for Monks and Champions on Payon Stories, replacing
  the normal hit when it triggers.
  - Proc rate: 28 / 26 / 24 / 22 / 20 % at skill levels 1–5 (decreases with
    higher level per PS rework design).
  - Knuckle bonus: +0.2 × skill level % per 10 job levels (e.g. +5 % at lv 5,
    job level 50).
  - Crit eligibility: Triple Attack can crit when the **Fury** buff
    (SC_EXPLOSIONSPIRITS / Critical Explosion) is active. This is gated by the
    `MO_TRIPLEATTACK_PS_BONUS` mechanic flag so it only applies on PS.
  - Fury crit chance: 20 / 22.5 / 25 / 27.5 / 30 % at Fury levels 1–5 (uses
    the existing `SC_EXPLOSIONSPIRITS` override in serverProfiles.js).
  - Triple Attack skill level is tracked via the passive-skills panel; Fury is
    activated through the Self Buffs section.

- **PS Hunter Rework — Trap damage formulas** — Land Mine, Blast Mine, Freezing
  Trap, and Claymore Trap now use the reworked INT/DEX-based formulas:
  - Land Mine: `lv × (JobLv+DEX) × (BaseLv+INT) / 45` (Earth element)
  - Blast Mine: `lv × (BaseLv+DEX) × (JobLv+INT) / 45` (Wind element)
  - Freezing Trap: `lv × (JobLv+DEX) × (BaseLv+INT) / 70` (Water element)
  - Claymore Trap: `lv × (BaseLv+DEX) × (JobLv+INT) / 70` (Fire element)
  Traps bypass DEF. All four show up in the skill picker for Hunter/Sniper and
  produce a full step-by-step damage breakdown. Element vs target and race/size
  card bonuses still apply.

- **PS Assassin Rework — Katar second hit** — Implemented the katar second-hit
  branch for auto-attacks (Katar + TF_DOUBLE learned). Proc rate is 2× the PS
  TF_DOUBLE rate (14%/lv, capped at 100%). Damage scales as
  `(21 + 4×AS_KATAR_lv)%` of the main hit — up to 61% at AS_KATAR lv10
  (was flat 21% vanilla). Second hit can crit with the same katar-doubled crit
  rate and is included in DPS. Shown as a "Katar 2nd hit" tab in the results
  panel.

- **PS Assassin Rework — Enchant Poison passive** — AS_ENCHANTPOISON now grants
  a passive `+2%/lv` damage bonus vs Poison element monsters (up to +10% at
  lv5), regardless of whether the buff is active. AS_ENCHANTPOISON appears in
  the passive skills grid for Assassins.

- **PS Thief Rework — Envenom weapon element** — TF_POISON (Envenom) now uses
  the weapon's element instead of forced Poison on Payon Stories.

- **Credits footer** — Added a footer crediting Discord testers (Metan,
  hokageyyy, leafhill, knightzeroxx, kerfuffl, jenardpwet) and tochoco.latte
  for the initial base engine.

### Changed

- **Title renamed** — "Open PS Damage Calc" shortened to "Open PS Calc" in the
  navbar.

- **Consistent popups** — the Damage breakdown panel is now a centred modal
  overlay matching the Changelog and Save / Load dialogs, instead of an inline
  collapsible section.

- **Dory Card** — Damage bonus reduced from 30%/15% to 5% for both Freezing Trap
  and Claymore Trap, matching the reworked card's new effect.

- **Wolpertinger Card** — Damage bonus reduced from 15% to 5% for both Blast Mine
  and Land Mine.

- **Setting Dirk** — All-trap damage bonus reduced from 20% to 5% per trap skill.

- **URL compression** — Build share URLs are now compressed with LZ-string,
  reducing typical URL length by ~50–60 %. Old uncompressed URLs (with `?b=`)
  continue to load without any action required.

- **Calculate → scroll to results** — Clicking "Calculate damage" now smoothly
  scrolls the results panel into view, even when the panel is already open.

- **Base stat inputs** — Focusing a stat input now selects its value so typing
  immediately replaces it instead of appending to the existing number.

### Fixed

- **ASPD display** — base stats panel now shows one decimal place (e.g. 186.3)
  instead of a rounded integer, matching the damage results panel.

- **Build name not updating on save** — saving a build under a new name in the
  Save / Load panel now immediately reflects the name in the Character section.

- **Stat distribution cost formula** — Corrected the stat point cost formula
  to match [payonrocalc.jaludev.com](https://payonrocalc.jaludev.com/) (the
  official PS stat simulator). Previous formula (`v < 7 ? 1 : floor(v/10)+2`)
  overcharged by 1 point at every exact multiple-of-10 stat value (v=10, 20,
  30, …) and undercharged for v=1–6. Correct formula is
  `floor((v−1)/10)+2` for all v≥1. Effect: for a typical high-INT build at
  level 99 the old calc reported 3 fewer remaining points than it should,
  blocking stat increases that the server allows.

- **ASPD potion cap — Acolyte classes** — Priest and High Priest are
  restricted to Concentration Potion only (same as Bard / Dancer), matching
  Payon Stories rebalance rules. Monk and Champion are capped at Awakening
  Potion. Acolyte was already correct via the 1st-job cap.

## 2026-06-28

### Added

- **PS Monk Rework — Asura Strike damage branch** — Implemented the full
  `ATK × (8 + floor(SP/10)) + flat` formula in a dedicated
  `_runAsuraStrikeBranch` in battlePipeline.js. On PS, SP consumed is
  `floor(MaxSP × 20% × SkillLv)` (per rework); flat bonus per level:
  400/550/700/850/1000. Bypasses DEF, always hits, ignores size/mastery/refine
  exactly as vanilla, then applies element fix, card fix, and final rate bonus.

- **PS Monk Rework — Martial Arts** (was Iron Hand) — renamed to "Martial
  Arts" in ps_skill_db.json; now grants FLEE +2/level in addition to weapon
  mastery. Mastery now also covers **Mace** class weapons (`mastery_prefer_fallback`
  routes Mace → `MO_IRONHAND` when the character has no Priest Mace Mastery).
  ASPD bonus removed. FLEE handled via new `flee_per_lv: 2` in
  `PS_PASSIVE_OVERRIDES.MO_IRONHAND` and a new block in `statusCalculator.js`.

- **PS Monk Rework — Critical Explosion CRIT values** increased:
  20%/22.5%/25%/27.5%/30% (was 10%/12.5%/15%/17.5%/20%). Handled via new
  `SC_EXPLOSIONSPIRITS: { cri_base: 175, cri_per_lv: 25 }` in
  `PS_PASSIVE_OVERRIDES`; statusCalculator reads the override, falling back to
  vanilla `75 + 25×lv` if no override is present.

- **Skill pill toggle in damage modal** — when a skill is selected, a pill
  button showing `[Skill Name Lv N]` appears alongside the existing
  `[Normal hit]` and `[Critical hit]` toggle buttons. Clicking the pill
  switches the step-by-step breakdown to the skill's damage. Clicking
  "Normal hit" shows the baseline auto-attack (a second backend call is
  made in parallel so both results are available instantly). The skill pill
  is visually distinct with a highlighted border and slightly heavier weight.

- **Falcon damage shown in results** (Hunter / Sniper) — when a Hunter or
  Sniper build has Falconry Mastery learned, a "Falcon" section appears below
  the damage breakdown showing auto-blitz damage (1 hit) and, if Blitz Beat is
  skilled, the full Blitz Beat total (level × per-hit). Uses the PS custom
  formula `(LUK + INT/2 + Steel Crow Lv × 6 + 20) × 2` per hit; applies
  neutral-element modifier vs target and race/boss gear bonuses, bypasses DEF.

- **ASPD potions filtered by class** — Awakening Potion is disabled for
  Novice and 1st-job classes; Berserk Potion is disabled for all non-trans
  classes. Dancer, Bard, Clown, and Gypsy are restricted to Concentration
  Potion (PS rebalance); Magician, Wizard, and Sage can use Berserk Potion
  (PS rebalance). Selecting an invalid potion and then switching class
  auto-clears it.

- **Dancing Lesson Lv 10 CRIT bonus** (`DC_DANCINGLESSON`) now correctly adds
  +10% critical hit rate for Dancer/Gypsy. The code path in statusCalculator
  already existed but was reading from an empty override table; fixed by adding
  `cri_at_max_lv: 100` to `PS_PASSIVE_OVERRIDES`.

- **Clan buffs** — a "Clan" section at the bottom of the Buffs panel lets you
  select your clan membership (Sword, Arch Wand, Golden Mace, Crossbow,
  Artisan, or Vile Wind). The stat bonuses (STR/AGI/VIT/INT/DEX/LUK +1,
  plus MaxHP+30/MaxSP+10) are applied to the damage calculation server-side
  via the existing `CLAN_STATS` table in `buildApplicator.js`. Selecting a
  clan also shows the corresponding +1 badges in the base stats section.

- **Equipment filtered by class** — item search dropdowns now only show gear
  equippable by the currently selected job (e.g. switching to Mage hides
  two-handed swords). If the class is changed after equipping an item that
  the new class cannot use, the slot is highlighted in red with a "Not
  equippable by this class" notice and the item is silently excluded from
  the damage calculation and equipment stat bonuses until unequipped.

- **Pet section** (Payon Stories server) — panel 03, placed in the left
  column below Equipment to balance the two-column layout. A dropdown lets
  you select your active pet; bonuses activate at Cordial (750+ intimacy) and
  are applied server-side before the damage calculation. Supported bonuses
  include flat stats (STR/AGI/VIT/INT/DEX/LUK), ATK, MATK%, ASPD%, CRIT,
  HIT, FLEE, perfect dodge, DEF/MDEF, MaxHP/MaxSP, elemental/racial
  resist/boost, and crit damage %. HP drain procs and heal power bonuses are
  noted in the label but not modelled by the engine. Covers all standard pets
  plus the five PS custom pets (Puck, Kalec, Yser, Gyokuto, Onigiring).

- **ASPD shown in the damage breakdown headline** — the computed attack speed
  (same value the RO status window shows, 0–190 scale) now appears as a
  metric card alongside hit chance, crit chance, damage range, and DPS.
  `status.aspd` was already returned by the calculate endpoint; this was a
  frontend-only addition.

- **Combat stats panel** — A "Combat stats" grid below base stats shows Max HP,
  Max SP, HP Regen, SP Regen, ATK, MATK (min–max range), DEF (hard+soft),
  MDEF (hard+soft), ASPD, Flee, and Critical. Values come from a new
  `POST /calculate/status` route that runs the full status pipeline without
  requiring a battle target; updates reactively as stats or equipment change,
  debounced 300 ms.

- **Remaining status points display** — The "Base stats" label now shows a
  thin progress bar and "N SP remaining" counter next to it. Color-coded:
  neutral when budget is healthy, gold at ≤ 10 remaining, red when over
  budget. Each stat card also shows the cost of the next increment ("+N pt").
  Stat inputs are capped when raising if the remaining budget would be
  exceeded; lowering always works. Trans 2nd jobs receive the +52 bonus on
  top of the base-level total.

- **Light/dark mode toggle** — A ☀/☾ button in the top bar switches between
  dark (default) and light mode. The selected theme is persisted via
  `localStorage`; an inline script in `index.html` restores it before the
  page renders so there is no dark-to-light flash on load.

- **Theme toggle hint popover** — First-time visitors see an accent-colored
  speech bubble below the toggle reading "Try light mode" (or "Try dark mode"
  if already on light). Dismissed permanently after the first click and never
  shown again across sessions.

- **Angelus in party buffs** (Priest, max level 5) — Added with the correct
  PS formula: flat `+3 × level` applied to soft DEF first, then a
  `+10% × level` multiplier. The engine previously used the vanilla-eA
  `+5%/level` formula with no flat component; both values were wrong for PS.

- **Middle and bottom headgear slots** — `head_mid` (`EQP_HEAD_MID`) and
  `head_low` (`EQP_HEAD_LOW`) added to the equipment section. Card sub-slots
  derive from the slot key automatically so no further changes were needed.

- **Equipment dropdown opens on click** — Focusing an empty equipment slot
  immediately shows up to 20 items for that slot without needing to type
  first. Previously the picker stayed blank until at least one character
  was entered.

### Changed

- **PS Monk Rework — Triple Attack** condensed to 5 levels (140/180/220/260/300%
  ATK, activation rates 28/26/24/22/20%). Added PS ratio `(lv) => 100 + 40 * lv`
  to `PS_BF_WEAPON_RATIOS`. Requirements updated to "Martial Arts 5".

- **PS Monk Rework — Chain Combo** damage adjusted to 260/320/380/440/500% ATK
  (was 240/320/400/480/560). Ratio formula updated to `(lv) => 200 + 60 * lv`.

- **PS Monk Rework — Combo Finish** damage increased to 345/435/525/615/705% ATK
  (was 340/425/510/595/680). Ratio formula updated to `(lv) => 255 + 90 * lv`.

- **Skill descriptions updated** for Martial Arts, Dodge (removed note), Triple
  Attack, Chain Combo, Combo Finish, Critical Explosion, Asura Strike, Finger
  Offensive (cast time 1+0.8/sphere), Steel Body, Blade Stop (Martial Arts 5
  req), Spirits Recovery, Absorb Spirits (100% success, new SP formula), Ki
  Translation (SP 40→20, cast 2s→1s, ACD 1s→0.5s), Ki Explosion (ACD 2s→1s).

- **Damage breakdown is now an inline panel** at the top of the page
  rather than a modal overlay. It appears automatically when a
  calculation runs, has a gold accent top border for visibility, and can
  be dismissed with the × button.

- **Combat stats grid** widened from 2 columns to 3.

### Fixed

- **Shield Boomerang damage formula** corrected to the PS formula:
  `(BATK + shield_weight) × ratio/100`, where `shield_weight` is the
  displayed in-game weight (item DB stores it ×10, so divided by 10).
  Per-level ratios are taken from `ps_skill_db.json`
  (140/180/220/260/300%), not the vanilla eA formula. Shield refine
  bonus (`refine × 10` flat) is added after DEF reduction.

- **Shield Boomerang level cap** was incorrectly 10; the skill maxes at
  5 in PS. The level input and all load paths (URL state, saved builds)
  now cap at 5.

- **Berserk Potion available to Merchant, Swordsman, and Thief trees** —
  non-trans 2nd-job classes in these trees were incorrectly blocked from
  using Berserk Potion (capped to Awakening only). The correct PS
  restriction allows them access alongside trans jobs; only Novice/1st-job
  and Dancer/Bard/Clown/Gypsy are more restricted.

- **Max SP and Max HP now reflect active buffs** — Blessing (and any
  other SC that modifies INT or VIT) was not being considered when
  computing Max SP and Max HP. The stat snapshot was taken before the
  SC modifier pass ran; it is now derived from the fully-buffed status.

- **HP regen formula** corrected to match the PS wiki:
  `max(1, floor(MaxHP/200)) + floor(VIT/5)`. The previous formula added
  a hard `+1` on top of `floor(MaxHP/200)`, overcounting by 1 for any
  character with MaxHP ≥ 200.

- **PS class rebalance — weapon mastery ATK values** corrected per
  [wiki.payonstories.com/Class_Rebalance](https://wiki.payonstories.com/Class_Rebalance).
  Musical Lesson, Dancing Lesson, Iron Hand, and Axe Mastery corrected from
  +3 to +5 ATK/lv; Mace Mastery and Katar Mastery from +3 to +4 ATK/lv.
  All were falling through to vanilla eA values instead of PS custom values.

- **Spear Mastery (`KN_SPEARMASTERY`) ATK values** corrected: +4→+5/level
  without Peco, +5→+7/level while riding Peco.

- **Dancing Lesson CRIT** (+10% at lv 10) was missing from the ATK calculation
  due to a missing `atk_per_lv` array; CRIT gate at max level is unchanged.

- **Katar Mastery CRIT** now scales per level (+0.5% per level, up to +5% at
  lv 10) — was completely missing from the calculation (returned 0).

- **PS stat point cost formula** — The correct PS formula charges 1 point per
  increment for stats 1–6, then `floor(V/10) + 2` from stat 7 onwards. The
  previous formula (`floor(V/10) + 1` uniformly) significantly under-counted:
  a level 97 Dancer with AGI 96, DEX 98, INT 9, VIT/STR/LUK 1 showed 183 SP
  remaining instead of 1. Remaining display, affordability cap on stat inputs,
  and per-stat cost badge all updated.

### Removed

- **"Avg damage" metric card** from the damage breakdown headline — redundant
  given the damage range (min–max) card directly below it.
- **"View results" button** from the top bar — the results modal opens
  automatically on calculate; the button to re-open it added clutter without
  enough benefit.

## 2026-06-27

### Added

- **Equipment stat bonuses (bStr, bAgi, etc.) now shown in the base stats
  section** alongside the existing job-level bonus badges. Each stat card
  now shows two "+N" indicators when applicable — green for job level,
  blue for equipment — and the bold total reflects all three (base + job +
  gear). Gear bonuses update reactively as you equip or unequip items via a
  dedicated `POST /calculate/gear-stat-bonuses` route that runs a single
  pass of the item-script engine (no full damage calc required), debounced
  300 ms so rapid changes don't flood the server.

- **Slot count shown in equipment dropdown labels** — items with card slots
  now display as `Name[N]` (e.g. `Main Gauche[4]`); slotless items show the
  plain name. Cards themselves have 0 slots so they're unaffected.

- **Keyboard navigation in equipment (and all) search dropdowns.**
  Arrow keys move a highlight through the results list; Enter confirms the
  highlighted item; Escape closes the list. Tab selects the highlighted
  item (if any) and lets focus move to the next field naturally without
  requiring a separate click or Enter press.

- **Job-level stat bonus now shown next to base stats**, RO-status-window
  style: each stat is a card with the total (base + job bonus) in bold
  and the editable base value plus a small "+N" badge for the job
  bonus underneath. This bonus (e.g. a Knight's automatic STR/VIT
  growth per job level) was already folded into the damage calculation
  server-side, just invisibly — added a `/data/job-bonus-stats` route
  so the build editor can show it instead of it only ever showing up
  in the final numbers. Verified against `statusCalculator.js`: Knight
  at job level 50 shows the same +8 STR/+2 AGI/+10 VIT/+6 DEX/+4 LUK
  the backend was already computing.

- **Enchant Poison and Cursed Water (Shadow) to the weapon endow
  dropdown.** Enchant Poison (`AS_ENCHANTPOISON`/`SC_ENCHANTPOISON`)
  and Cursed Water (item → `ITEM_ENCHANTARMS` skill level 8 → Dark
  element, per `item_db.json` #12020) were already handled by the
  engine's element-resolution logic in `buildApplicator.js`, but
  Enchant Poison only checked `active_status_levels` (which the UI
  never wrote to) and Cursed Water/`SC_ENCHANTARMS` had no handling at
  all. Both now route through the same `weapon_endow_sc` dropdown field
  as the existing Priest endows. Verified: Cursed Water vs. a
  Holy-element target gives the expected Dark-vs-Holy 125% Attr Fix,
  and Enchant Poison vs. an Earth-element target gives the expected
  Poison-vs-Earth 125%.

- **"Start over" button** to start a fresh build without manually
  clearing every field — resets the form, target, and skill back to
  defaults (with a confirmation prompt, since it's not undoable once
  the URL state is overwritten).

- **Saved builds in localStorage** ("Save / Load"), up to 10, each with
  a custom name. Save the build currently open (saving under an
  existing name overwrites that slot instead of using a new one),
  load any saved build back into the editor, or delete one. This is
  separate from the existing URL-based share link — saved builds
  persist locally across sessions without needing to keep a link
  around, but don't sync between devices/browsers.

- Poem of Bragi (`BA_POEMBRAGI`, Bard/Clown) to the Bard/Dancer songs
  section. It reduces cast time and after-cast delay (`skillTiming.js`),
  not ASPD directly — so it only changes DPS when testing an actual
  skill, not a normal attack (normal-attack period is ASPD-only).
  Verified with MG_FIREBALL: period 2470ms→1429ms, DPS 153.8→265.9 at
  Bragi level 10.

- Deluge and Violent Gale added alongside Volcano as a single "Ground
  effect" dropdown (Sage) — all three share one mutually-exclusive
  `support_buffs.ground_effect` slot in the engine (you can only stand in
  one ground spell at a time), so they're now one shared control instead
  of a Volcano-only number input. Both are damage-relevant via the same
  elemental enchant bonus as Volcano (see the `attrFix.js` fix above).

- Min/max damage range shown under the avg damage metric in the damage
  breakdown. The backend already computed `min_damage`/`max_damage` on
  every `DamageResult` (normal and crit); the frontend type/render just
  never surfaced them.

- Three more Priest party buffs: Blessing (+STR/+INT/+DEX), Increase AGI
  (+2+level AGI), and Gloria (+30 LUK) — reported missing after shipping
  the initial Party buffs section; all three were already read from
  `support_buffs` by `statusCalculator.js`, just not exposed yet.

### Changed

- **Capped stat/level inputs to what pre-renewal actually allows**:
  base stats to 99 (was 130), base level to 99 (already correct,
  confirmed against wiki.payonstories.com's level-99 leveling guides),
  and job level to a per-job cap derived from `job_db.json`'s job list
  — 10 for Novice, 50 for 1st/regular 2nd job, 70 for trans 2nd job
  (Lord Knight, High Wizard, etc.), 99 for Super Novice (confirmed:
  "Super Novices also have a Job Level of 99" on the wiki). Gunslinger
  and Ninja are set to 70 rather than classic kRO's 60, since the wiki
  references planning around "JobLv70 gunslinger" — this PS instance
  appears to have retuned them to the trans cap. Switching jobs now
  clamps the current job level down if it exceeds the new job's cap.

- **Redesigned the header into a single compact top bar**, replacing
  the old two-header layout (a generic app-level topbar plus a
  separate per-page header with the build name and actions as an H1).
  The build name is now an inline-editable field in the bar itself,
  and every action (Start over, Save / Load, Changelog, Copy share link,
  Calculate damage) lives in one sticky row — freeing up significant
  vertical space for the actual calculator panels below.

- **Moved "Calculate damage" into the top bar** (now sticky, so it's
  reachable while scrolled anywhere on the page) and **moved the
  damage breakdown out of an always-present inline panel and into a
  modal**, opened automatically when you calculate and reopenable via
  a "View results" button that appears once a result exists. Keeps
  the main column free for editing the build instead of permanently
  reserving space for a result you're not always looking at.

- **Double Bolt** (`PF_DOUBLECASTING`/`SC_DOUBLECASTING`) to the
  Professor self-buffs panel — confirmed against
  [wiki.payonstories.com/Double_Bolt](https://wiki.payonstories.com/Double_Bolt):
  100% chance to instantly re-cast Fire Bolt, Cold Bolt, Lightning
  Bolt, Earth Spike, or Soul Strike while active. Only Professor
  (job 4017) has this in its skill tree — base Sage (16) doesn't, despite
  the wiki documenting it on the general "Sage" overview page (that page
  covers the whole Sage→Professor line, not just what base Sage can
  cast). No existing mechanic models "instant extra cast," so it's
  implemented as halving the effective attack period for the five
  affected skills (DPS only — the per-hit damage number is unchanged,
  since the bonus is an extra free cast, not a stronger one). Verified:
  Fire Bolt DPS exactly doubles with it active; an unaffected skill
  (Napalm Beat) is untouched.

- **Frost Diver and Fire Wall to the Wizard passive-skills panel.**
  Both feed a damage multiplier into a *different* skill rather than
  attacking on their own — confirmed against
  [wiki.payonstories.com/Frost_Nova](https://wiki.payonstories.com/Frost_Nova)
  ("+10% MATK to Frost Nova per rank of Frost Diver") and
  [wiki.payonstories.com/Fire_Pillar](https://wiki.payonstories.com/Fire_Pillar)
  ("+2% MATK per hit per rank of Fire Wall"). The engine's PS magic-ratio
  formulas for `WZ_FROSTNOVA`/`WZ_FIREPILLAR` already implemented this
  scaling correctly, but read it from a `skill_params` field the build
  editor never exposed any input for, so it was silently always 0. Both
  skills are normally excluded from the passive panel (they're active,
  not passive, skills), so they needed an explicit carve-out in
  `dataLoader.js#getPassiveSkillsForJob`; the ratio formulas now read
  the level from `mastery_levels` like every other passive. Verified:
  Frost Nova Lv5 goes from 250%→350% MATK and Fire Pillar Lv5 from
  840%→1080% MATK at Frost Diver/Fire Wall level 10, matching the wiki's
  worked examples exactly.

- Party buffs are now grouped by source class (Priest, Blacksmith, Sage)
  under their own subheadings, instead of one flat grid with a "(Source)"
  suffix on every label.

- Priest/Blacksmith party buffs (Impositio Manus, Blessing, Increase AGI,
  Gloria, Overthrust, Overthrust Max, Adrenaline Rush) switched from a
  numeric level input to a checkbox — checking it applies the buff's max
  level, since these are received from a party member and you don't
  control the caster's actual level anyway. Sage's ground effect dropdown
  now applies max level automatically on selection instead of a separate
  level input.

### Fixed

- **Living Magma Card's Fire-monster magic damage bonus did nothing.**
  Its script (`bonus2 bMagicAddEle,Ele_Fire,10`) used a bonus type the
  item-script parser didn't recognize at all, so it was silently
  dropped — confirmed against
  [wiki.payonstories.com/List_of_Custom_Items](https://wiki.payonstories.com/List_of_Custom_Items).
  `bMagicAddEle` keys off the *target's* element (like the already-working
  physical `bAddEle`/Mage Card), not the spell's attack element, so it
  needed its own gear-bonus field and its own check in
  `cardFix.js#calculateCardFixMagic` rather than reusing the existing
  `magicEleName` (attack element) plumbing. Verified: Fire Bolt vs. a
  Fire-element target now gets +10% with the card equipped and +0%
  against a Water-element target, as expected.

- While auditing other custom cards for the same class of bug, found
  Sidewinder Card's `bonus bDoubleRate,5` (a flat +5% double-attack
  chance, on top of the `skill TF_DOUBLE,2` it also grants) was parsed
  but had no consumer anywhere — flagged in this engine's own porting
  notes as a known gap. Wired it into the existing TF_DOUBLE proc-chance
  calculation in `battlePipeline.js` as an additive, weapon-unrestricted
  source (matching battle.c, since `bDoubleRate` isn't dagger-only like
  the TF_DOUBLE skill itself). Verified: equipping it on a non-dagger
  weapon now gives a 5% proc chance even though TF_DOUBLE itself
  requires a dagger.

- **Advanced Book (Sage/Professor) was capped and labeled wrong.** It
  showed up in the passive-skills panel as "Study" with a max level of
  10 — that's the vanilla pre-renewal data; PS retunes it to max level
  5 with its own non-linear +ATK/+ASPD table (confirmed against
  [wiki.payonstories.com/Advanced_Book](https://wiki.payonstories.com/Advanced_Book)),
  and renames it for display. `ps_skill_db.json` already had both the
  correct cap and name, but `dataLoader.js#getPassiveSkillsForJob`
  never consulted it — only `getSkillDisplayName` did. Also fixed the
  `/data/skill-tree/:jobId` route never applying the server profile
  from the `?server=` query param at all (it relied on whatever a
  previous, unrelated request happened to leave `loader`'s profile set
  to). Now reads the PS name/cap the same way every other skill does,
  and the ATK/ASPD-per-level table matches the wiki exactly (lv5:
  +30 ATK / +7% ASPD on Book weapons, not vanilla's level×3 / level×5%).

- **Item scripts with quoted skill-name params (e.g. `bonus2
  bSkillAtk,"WZ_VERMILION",20`) silently lost the quotes and never
  matched anything**, since the lookup keys downstream (`WZ_VERMILION`)
  don't have quote characters. This is why Frozen Thunder's weapon
  (`tools.payonstories.com/pc?name=frozen+thunder`) skill bonuses to
  Lord of Vermilion/Frost Nova weren't applying — its script in
  `ps_item_manual.json` was correct, the parser just wasn't stripping
  the quotes. Also fixed a case-sensitivity bug in the same parser:
  `bCastRate` (capital R, used by several other item scripts) silently
  failed to match the canonical `bCastrate` key and was dropped
  entirely. Both are now resolved case-insensitively and with quotes
  stripped before lookup. Verified end-to-end: Lord of Vermilion DPS
  with Frozen Thunder equipped went from ~40 to ~74 (damage +20%, cast
  time -20%, compounding), where before this fix neither bonus applied
  at all.

- The BF_MAGIC skill-ATK gear bonus (`bSkillAtk` on staves/spellbooks
  for specific magic skills) was folded silently into the skill-ratio
  step instead of getting its own breakdown row, unlike the equivalent
  BF_WEAPON path. Added a separate "Skill ATK Bonus" step so it's
  visible in the damage breakdown.

- **Long checkbox labels in the Buffs panel overlapped neighboring grid
  cells.** Flex items default to a min-width equal to their content's
  max-content size, so text like "Impositio Manus" never wrapped inside
  its grid column and instead rendered on top of whatever sat next to or
  below it. Fixed with `min-width: 0` on the flex item so the label can
  wrap inside its column. Per-buff source/mechanic detail that used to be
  crammed inline (or in a `title` attribute) now lives in an info-icon
  popover on each group heading instead.

- **Changelog edits weren't showing up in the in-app viewer without a
  manual dev-server restart.** Vite's dev-server file watcher only
  tracks files under this project's own root by default; `CHANGELOG.md`
  living two directories up (at the actual repo root) meant `fs.allow`
  granted read access but not watch coverage, so the `?raw` import kept
  serving whatever content existed when the server started. Added a
  small Vite plugin that explicitly watches the file and forces a full
  reload on change. Verified by appending a test marker to the file and
  confirming it appeared without restarting anything, then removed the
  marker.

- **Volcano's UI cap and source label were wrong for Payon Stories.**
  The party buffs panel let Volcano go up to level 5 and labeled it
  "Mage/Wizard" — but its real constant is `SA_VOLCANO` (Sage, not
  Wizard; confirmed by `skill_tree.json`: jobs 16/4017, Sage/Professor),
  and PS caps it at level 3, not vanilla's 5 — confirmed against
  [wiki.payonstories.com/Sage#Skills](https://wiki.payonstories.com/Sage#Skills)
  (and the individual /Volcano, /Deluge, /Violent_Gale pages — all three
  show per-level tables stopping at 3 despite a "Levels: 5 (Fixed)" label
  that's almost certainly inherited from vanilla's `max_level` field, not
  the real PS-tuned cap) and independently corroborated by
  `PS_VOL_MATK_PCT` and `PS_ENCHANT_EFF` both already being 3-element
  arrays in the engine. The cap is now server-aware (3 on Payon Stories,
  5 on standard pre-renewal) instead of one wrong hardcoded number for both.

- **`attrFix.js`'s Volcano/Deluge/Violent Gale elemental "enchant" bonus
  was checking the wrong element entirely** — its local `ELE_FIRE`/
  `ELE_WATER`/`ELE_WIND` constants (4/5/6) didn't match this engine's
  actual element index convention used everywhere else (`Ele_Water: 1,
  Ele_Fire: 3, Ele_Wind: 4` — see `ELE_STR_TO_INT` in `battlePipeline.js`).
  In practice this meant the bonus silently required a Poison weapon for
  Deluge, a Holy weapon for Violent Gale, and a Wind weapon for Volcano,
  instead of Water/Wind/Fire respectively. Found by testing the new
  ground-effect UI end-to-end with a real matching weapon and getting no
  bonus; fixed the constants and verified all three now match correctly.

## 2026-06-21

### Added

- **Party buffs section** in the Buffs panel, distinct from self-cast
  buffs: Impositio Manus (Priest), Overthrust/Overthrust Max/Adrenaline
  Rush (Blacksmith), Volcano (Mage/Wizard ground spell), and a weapon
  endow dropdown (Priest: Aspersio/Endow Fire/Water/Wind/Ground). Unlike
  self buffs, none of these are filtered by your own job — any class can
  be standing in another player's buff range. Verified the engine treats
  party-received Overthrust differently from self-cast Overthrust (flat
  +5% vs full per-level scaling — battle.c's actual distinction, not an
  approximation), and that Volcano/weapon endow both move the calculation
  correctly.
- In-app changelog viewer (this document, rendered from a modal in the
  header).

### Fixed

- **Buffs panel showed every buff regardless of class, and didn't filter
  when switching jobs.** Each buff/song is now tagged with the actual
  job IDs that can use it (derived from `skills.json`'s `status_change`
  field cross-referenced with `skill_tree.json`, not guessed), and the
  panel filters to the selected job. Also fixed a deeper correctness bug
  this exposed: hiding a buff from the UI on job change didn't clear its
  value from `active_buffs`/`song_state`, so a stale buff from a
  previously-selected job was still silently sent to the backend and
  applied to the calculation. Switching jobs now strips anything that no
  longer applies.
- Added two missing Gunslinger self-buffs: "Barrage" and "Run and Gun"
  (PS's display names for the vanilla `SC_GS_MADNESSCANCEL` /
  `SC_GS_ADJUSTMENT` statuses, which the engine already read but had no
  UI for, like every other buff in this panel).
- **Refine input no longer hidden for refineable headgears (and other
  slots).** The equipment panel decided whether to show a refine-level
  input per equipment *slot* (e.g. "headgear can never be refined"), but
  the real item data shows every slot type has a meaningful mix — 613 of
  839 headgears are actually refineable, while only 91 of 273 armor
  pieces are. The backend already read each item's own `refineable` flag
  correctly; this was a frontend-only bug. The input now checks the
  actual equipped item instead of a static per-slot guess.

## 2026-06-20

### Added

- **Double Attack (`TF_DOUBLE`) proc.** The engine had placeholder result
  fields (`proc_chance`, `double_hit`) that were never actually computed.
  Implemented per battle.c:4926 — dagger-only, normal attacks only,
  mutually exclusive with crit, proc rate from the PS/vanilla profile.
- **Buffs panel** — quickens (Two/One-Hand, Spear), Adrenaline Rush,
  Maximize Power, Fury, Overthrust/Overthrust Max, Impositio Manus, and
  Bard/Dancer songs (Battle Theme, Ring of Nibelungen, Assassin Cross of
  Sunset, Humming, Fortune's Kiss) — all fields the engine already read
  but had no UI for.
- Consumables panel (ASPD potions, ATK/MATK items), passive skill panel
  (filtered to masteries that actually affect damage), and card slot UI
  (up to 4 per item) — same pattern: engine support existed, UI didn't.
- Grand Cross (`CR_GRANDCROSS`) damage formula, including a Payon Stories
  deviation (weapon masteries apply there, unlike vanilla) confirmed
  against wiki.payonstories.com/Grand_Cross.
- Magic skill (BF_MAGIC) damage pipeline.
- Incoming (mob → player) damage pipeline, physical and magic, including
  the Lex Aeterna double-damage status — `POST /api/calculate/incoming`.
- Filled out `PAYON_STORIES`'s weapon/magic skill-ratio override tables
  and several `mechanic_flags`, pulled directly from the upstream Python
  source.
- Collapsible UI sections; the damage breakdown panel is pinned and
  visually emphasized as the actual result of the form.
- Info tooltip in the header describing the calculator, linking to the
  original repo and this one.
- CI/CD pipeline (GitHub Actions) deploying to EC2 via pm2 + nginx, with
  an `X-API-Key` gate (not real auth — a deterrent against casual direct
  API hits, documented as such) and free HTTPS via Let's Encrypt +
  sslip.io (no domain required).
- TypeScript migration (frontend + backend entry points/routes); removed
  account/login system in favor of stateless URL-encoded build sharing.

### Fixed

- CI: `npm ci --omit=dev` on the EC2 box was skipping `tsx`, which is
  miscategorized as a `devDependency` despite being required at runtime
  (this project runs TypeScript directly via `tsx`, no compile step).
  Moved to `dependencies`.
- CI: rsync failed with "No such file or directory" deploying the
  frontend build if `EC2_DEPLOY_PATH`'s parent directories didn't already
  exist on the box. The pipeline now creates them itself before syncing.
- CI: a fresh TypeScript install in CI hard-errored on the deprecated
  `moduleResolution: "node"` setting instead of just warning (newer
  TypeScript than what's pinned locally). Silenced via
  `ignoreDeprecations` rather than switching resolution strategy.
- nginx returned 500/Permission denied serving the frontend even though
  every directory's own permissions looked correct — Ubuntu's default
  home directory permissions (`750`) block `www-data` from traversing
  into it at all. Fixed in `setup-ec2.sh` going forward.
- Equipment search returned every item of a given type regardless of
  slot (e.g. shoes appearing in the headgear search); `left_hand`
  excluded shields entirely. Search is now filtered by the item's actual
  `loc` field per slot, and `left_hand` searches both shields and
  off-hand weapons.
- `buildManager.js`'s `playerBuildToTarget` set the player's own race to
  `"DemiHuman"` while every race lookup table elsewhere in the engine
  uses the hyphenated `"Demi-Human"` — found while wiring up the incoming
  damage pipeline, which is the first consumer of that function.
- Skill search/dropdown showed the internal engine constant (e.g.
  `MG_FIREBALL`) instead of a human-readable name. Backend now resolves
  a `display_name` (PS-aware) for every skill.
