/**
 * scenarios.js — the golden-regression scenario matrix.
 *
 * Each scenario exercises one engine branch or mechanic that has been audited
 * against the PS wiki / rework PDFs / Hercules. The expected outputs live in
 * test/goldens.json — regenerate them with `node test/gen-goldens.js` ONLY
 * after verifying that a behavior change is intentional and correct.
 *
 * Fixture notes (all bundled data, stable):
 *   mobs   — 1002 Poring (Water1 Plant), 1036 Ghoul (Undead1), 1113 Drops
 *            (Fire1), 1867 Banshee (Dark, lv81)
 *   items  — 1101 Sword, 1201 Knife, 1250 Jur, 1504 Mace, 1601 Rod,
 *            1707 Great Bow, 1905 Lute, 1750/1752 (Fire) Arrow,
 *            4035 Hydra Card, 4092 Skel Worker Card, Angel set (5125, 2355,
 *            2521, 2420, 2116)
 */

const STATS_ALL_50 = { str: 50, agi: 50, vit: 50, int: 50, dex: 50, luk: 50 };

const scenarios = [
  // --- plain physical branch -------------------------------------------------
  {
    name: "knight-normal-attack-sword",
    build: { job_id: 7, base_level: 80, job_level: 50, base_stats: { str: 80, agi: 60, vit: 40, int: 1, dex: 40, luk: 20 }, equipped: { right_hand: 1101 }, refine: { right_hand: 4 } },
    target: 1036,
  },
  {
    name: "knight-bash-lv10",
    build: { job_id: 7, base_level: 80, job_level: 50, base_stats: { str: 80, agi: 60, vit: 40, int: 1, dex: 40, luk: 20 }, equipped: { right_hand: 1101 } },
    skill: { name: "SM_BASH", level: 10 },
    target: 1036,
  },
  {
    name: "refine-plus10-overrefine",
    build: { job_id: 7, base_level: 99, job_level: 50, base_stats: STATS_ALL_50, equipped: { right_hand: 1101 }, refine: { right_hand: 10 } },
    target: 1002,
  },

  // --- crit / katar / dual hit ----------------------------------------------
  {
    name: "assassin-katar-normal-crit",
    build: { job_id: 12, base_level: 90, job_level: 50, base_stats: { str: 80, agi: 90, vit: 20, int: 1, dex: 50, luk: 60 }, equipped: { right_hand: 1250 } },
    target: 1036,
  },
  {
    name: "assassin-sonic-blow-lv10",
    build: { job_id: 12, base_level: 90, job_level: 50, base_stats: { str: 80, agi: 90, vit: 20, int: 1, dex: 50, luk: 30 }, equipped: { right_hand: 1250 } },
    skill: { name: "AS_SONICBLOW", level: 10 },
    target: 1036,
  },

  // --- ranged / arrows / element ----------------------------------------------
  {
    name: "hunter-double-strafe-fire-arrow",
    build: { job_id: 11, base_level: 90, job_level: 50, base_stats: { str: 20, agi: 70, vit: 20, int: 1, dex: 99, luk: 30 }, equipped: { right_hand: 1707, ammo: 1752 } },
    skill: { name: "AC_DOUBLE", level: 10 },
    target: 1002, // Water 1 — Fire arrow is resisted, locks attrFix
  },
  {
    name: "bard-musical-strike-performing-fire-arrow",
    build: { job_id: 19, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 60, vit: 30, int: 30, dex: 99, luk: 30 }, equipped: { right_hand: 1905, ammo: 1752 } },
    skill: { name: "BA_MUSICALSTRIKE", level: 5 },
    performing: true,
    target: 1036, // Undead 1 vs Fire = amplified
  },
  {
    name: "bard-musical-strike-no-performing",
    build: { job_id: 19, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 60, vit: 30, int: 30, dex: 99, luk: 30 }, equipped: { right_hand: 1905, ammo: 1752 } },
    skill: { name: "BA_MUSICALSTRIKE", level: 5 },
    target: 1036,
  },
  {
    name: "priest-endow-fire-mace-vs-poring",
    build: { job_id: 8, base_level: 90, job_level: 50, base_stats: STATS_ALL_50, equipped: { right_hand: 1504 }, support_buffs: { weapon_endow_sc: "SC_FLAMELAUNCHER" } },
    target: 1002, // Water 1 vs Fire endow
  },

  // --- cards -------------------------------------------------------------------
  {
    name: "cards-hydra-skelworker-vs-pc-target",
    build: { job_id: 12, base_level: 90, job_level: 50, base_stats: { str: 80, agi: 90, vit: 20, int: 1, dex: 50, luk: 30 }, equipped: { right_hand: 1201, right_hand_card1: 4035, right_hand_card2: 4092 } },
    target: { def_: 20, vit: 50, level: 90, size: "Medium", race: "Demi-Human", element: 0, element_level: 1, luk: 30, agi: 60, flee: 150, is_pc: true },
  },
  {
    // Forged weapon Star Crumb bonus: VVVS (3 crumbs = +40) + ranked (+10) = +50
    // seeking damage per hit on the right-hand weapon.
    name: "knight-vvvs-ranked-forged-sword",
    build: { job_id: 7, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 60, vit: 40, int: 1, dex: 40, luk: 1 }, equipped: { right_hand: 1101 }, refine: { right_hand: 0 }, forge: { right_hand: { sc: 3, ranked: true } } },
    target: 1036,
  },

  // --- named branches ----------------------------------------------------------
  {
    name: "monk-asura-5-spheres",
    build: { job_id: 15, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 40, vit: 40, int: 40, dex: 60, luk: 10 }, equipped: {}, flags: { spirit_spheres: 5 } },
    skill: { name: "MO_EXTREMITYFIST", level: 5 },
    target: 1867,
  },
  {
    // Finger Offensive: PS = 350% ATK per spirit sphere (flat), throwing one sphere
    // per skill level. Lv5 + 5 spheres = 5 hits. Regression that the hit count
    // tracks the active spheres instead of always being 1.
    name: "monk-finger-offensive-5-spheres",
    build: { job_id: 15, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 40, vit: 40, int: 1, dex: 60, luk: 10 }, equipped: { right_hand: 1801 }, flags: { spirit_spheres: 5 } },
    skill: { name: "MO_FINGEROFFENSIVE", level: 5 },
    target: 1867,
  },
  {
    // Holy Cross at a NON-max rank: PS gives it a +2%-of-hitrate accuracy bonus
    // per rank (wiki.payonstories.com/Holy_Cross), so at Lv6 the hit chance here
    // must be 72 × 1.12 = 80%, not the 86% the engine gave when it applied a flat
    // ×1.20 at every rank. DEX 45 vs Banshee's 155 flee keeps it off the 100% cap.
    name: "crusader-holy-cross-lv6-accuracy",
    build: { job_id: 14, base_level: 99, job_level: 50, base_stats: { str: 80, agi: 40, vit: 50, int: 20, dex: 45, luk: 10 }, equipped: { right_hand: 1101 } },
    skill: { name: "CR_HOLYCROSS", level: 6 },
    target: 1867,
  },
    {
    // Dual-wield Assassin with BOTH daggers forged, differently: a VVS Neutral in
    // the main hand and a VVVS Fire in the off-hand. Locks that each hand carries
    // its own crumbs and element — the off-hand used to be resolved with neither.
    name: "assassin-dual-wield-forged-both-hands",
    build: { job_id: 12, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 90, vit: 40, int: 1, dex: 60, luk: 40 }, equipped: { right_hand: 1201, left_hand: 1201 }, mastery_levels: { AS_RIGHT: 5, AS_LEFT: 5 }, forge: { right_hand: { sc: 2 }, left_hand: { sc: 3, ele: 3 } } },
    target: 1036,
  },
  {
    // Elemental forge: a VVS Fire Sword (2 Star Crumbs + Flame Heart) against the
    // Undead Ghoul — locks the crumb ATK and the forged element together, since the
    // element used to be hardcoded Neutral no matter what the build said.
    name: "blacksmith-vvs-fire-forged-sword",
    build: { job_id: 10, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 40, vit: 40, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1101 }, forge: { right_hand: { sc: 2, ele: 3 } } },
    target: 1036,
  },
  {
    // Corruptor Card (8218) on footgear: Corrupting Drain procs on 4% of melee
    // swings for 100 + STR + ⌊STR²/40⌋ + DEX + … + LUK + ⌊LUK²/40⌋, unaffected by
    // element/size/race, healing 75% of what it deals. Locks the card's formula.
    name: "rogue-corruptor-card-drain",
    build: { job_id: 17, base_level: 99, job_level: 50, base_stats: { str: 80, agi: 70, vit: 40, int: 40, dex: 60, luk: 50 }, equipped: { right_hand: 1201, shoes: 2404, shoes_card1: 8218 } },
    target: 1036,
  },
  {
    // Plagiarism: a Rogue auto-attacking with a copied Triple Attack Lv5. The TA
    // proc replaces the auto-attack at the PS rate, so this locks both the proc
    // rate and the copied skill's ratio through a job that cannot learn it.
    name: "rogue-plagiarised-triple-attack",
    build: { job_id: 17, base_level: 99, job_level: 50, base_stats: { str: 80, agi: 70, vit: 40, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1201 }, flags: { plagiarism: { name: "MO_TRIPLEATTACK", level: 5 } } },
    target: 1036,
  },
  {
    // Bow Rogue with the Gust Bow + Arrow of Wind combo: +25% long-range physical
    // AND (INT 40+) a 20% Wind Blade Lv5 autocast. Locks both halves of a combo that
    // grants an autocast — the autocast half used to be dropped on the floor.
    name: "bowgue-gust-bow-wind-arrow",
    build: { job_id: 17, base_level: 99, job_level: 50, base_stats: { str: 80, agi: 70, vit: 40, int: 40, dex: 90, luk: 20 }, equipped: { right_hand: 1733, ammo: 1755 } },
    target: 1036,
  },
  {
    // vanilla_ok re-audit fixes (PS wiki). Grimtooth: flat 200% ATK all levels.
    name: "assassin-grimtooth",
    build: { job_id: 12, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 80, vit: 30, int: 1, dex: 60, luk: 10 }, equipped: { right_hand: 1250 } },
    skill: { name: "AS_GRIMTOOTH", level: 5 },
    target: 1036,
  },
  {
    // First Wind (Kamaitachi): PS 200%→600% MATK (+100/lv), Wind, 1 hit.
    name: "ninja-first-wind",
    build: { job_id: 25, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 40, vit: 30, int: 99, dex: 70, luk: 1 }, equipped: { right_hand: 1601 } },
    skill: { name: "NJ_KAMAITACHI", level: 5 },
    target: 1036,
  },
  {
    // Fire Wall: PS 50% MATK per burn × (2 + level) hits (full-wall crossing).
    name: "mage-fire-wall",
    build: { job_id: 2, base_level: 70, job_level: 50, base_stats: { str: 1, agi: 40, vit: 20, int: 99, dex: 60, luk: 10 }, equipped: { right_hand: 1601 } },
    skill: { name: "MG_FIREWALL", level: 10 },
    target: 1036,
  },
  {
    name: "monk-normal-attack-spheres",
    build: { job_id: 15, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 40, vit: 40, int: 40, dex: 60, luk: 10 }, equipped: {}, flags: { spirit_spheres: 5 } },
    target: 1036,
  },
  {
    // Spirit sphere bonus procs on EVERY hit of a cosmetic multi-hit skill: Triple
    // Attack (3 hits) ⇒ +45 flat (5×3×3), Star Crumb-like, added post-DEF/attr.
    name: "monk-triple-attack-spheres",
    build: { job_id: 15, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 40, vit: 40, int: 40, dex: 60, luk: 10 }, equipped: { right_hand: 1101 }, flags: { spirit_spheres: 5 } },
    skill: { name: "MO_TRIPLEATTACK", level: 5 },
    target: 1036,
  },
  {
    name: "crusader-grand-cross-recoil",
    build: { job_id: 14, base_level: 95, job_level: 50, base_stats: { str: 60, agi: 30, vit: 70, int: 60, dex: 40, luk: 10 }, equipped: { right_hand: 1101 } },
    skill: { name: "CR_GRANDCROSS", level: 10 },
    target: 1036,
  },
  {
    // GC vs a HIGH-DEF target (Knight of Abyss: DEF 55 / MDEF 50) — locks in that GC
    // APPLIES the target's DEF/MDEF (regression guard against re-introducing ignore-DEF).
    name: "crusader-grand-cross-high-def",
    build: { job_id: 14, base_level: 95, job_level: 50, base_stats: { str: 60, agi: 30, vit: 70, int: 60, dex: 40, luk: 10 }, equipped: { right_hand: 1101 } },
    skill: { name: "CR_GRANDCROSS", level: 10 },
    target: 1219,
  },
  {
    name: "crusader-shield-boomerang",
    build: { job_id: 14, base_level: 95, job_level: 50, base_stats: { str: 60, agi: 30, vit: 70, int: 60, dex: 40, luk: 10 }, equipped: { right_hand: 1101, left_hand: 2116 }, refine: { left_hand: 5 } },
    skill: { name: "CR_SHIELDBOOMERANG", level: 5 },
    target: 1036,
  },
  {
    name: "priest-heal-bomb-vs-ghoul",
    build: { job_id: 8, base_level: 90, job_level: 50, base_stats: { str: 1, agi: 40, vit: 40, int: 99, dex: 60, luk: 20 }, equipped: { right_hand: 1601 } },
    skill: { name: "AL_HEAL", level: 10 },
    target: 1036,
  },
  {
    name: "priest-turn-undead",
    build: { job_id: 8, base_level: 90, job_level: 50, base_stats: { str: 1, agi: 40, vit: 40, int: 99, dex: 60, luk: 20 }, equipped: { right_hand: 1601 } },
    skill: { name: "PR_TURNUNDEAD", level: 10 },
    target: 1036,
  },
  {
    name: "ninja-killing-stroke",
    build: { job_id: 25, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 90, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1201 } },
    skill: { name: "NJ_ISSEN", level: 10 },
    target: 1867,
  },
  {
    // Same build with Ninja Aura (+2 STR/lv, and STR is 40x here) and a full five
    // Mirror Images up (+30%). Both are required to cast it at all in game.
    name: "ninja-killing-stroke-aura-mirror-image",
    build: { job_id: 25, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 90, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1201 }, active_buffs: { SC_NJ_NEN: 5, SC_NJ_BUNSINJYUTSU: 5 } },
    skill: { name: "NJ_ISSEN", level: 10 },
    target: 1867,
  },

  // --- magic branch --------------------------------------------------------------
  {
    name: "mage-firebolt-vs-poring",
    build: { job_id: 2, base_level: 70, job_level: 50, base_stats: { str: 1, agi: 40, vit: 20, int: 99, dex: 60, luk: 10 }, equipped: { right_hand: 1601 } },
    skill: { name: "MG_FIREBOLT", level: 10 },
    target: 1002, // Water 1 — fire magic amplified
  },
  {
    name: "wizard-lord-of-vermillion",
    build: { job_id: 9, base_level: 95, job_level: 50, base_stats: { str: 1, agi: 40, vit: 30, int: 99, dex: 80, luk: 10 }, equipped: { right_hand: 1601 } },
    skill: { name: "WZ_VERMILION", level: 10 },
    target: 1036,
  },
  {
    name: "sage-soul-strike-vs-undead",
    build: { job_id: 16, base_level: 90, job_level: 50, base_stats: { str: 1, agi: 40, vit: 30, int: 99, dex: 70, luk: 10 }, equipped: { right_hand: 1601 }, mastery_levels: { MG_SOULSTRIKE: 10 } },
    skill: { name: "MG_SOULSTRIKE", level: 10 },
    target: 1036, // Undead race — PS +5%×lv bonus + 50% MDEF ignore
  },
  {
    // Multi-hit magic (Cold Bolt Lv10 = 10 hits) vs a high-MDEF target: each bolt
    // is reduced by the target's MDEF (hard % + soft flat) SEPARATELY, then summed.
    // Regression for the per-hit magic MDEF fix — MDEF used to be subtracted once
    // from the summed total, badly overestimating bolts vs high-MDEF mobs.
    name: "wizard-cold-bolt-vs-greatest-general",
    build: { job_id: 9, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 1, vit: 1, int: 99, dex: 90, luk: 1 }, equipped: { right_hand: 1601 } },
    skill: { name: "MG_COLDBOLT", level: 10 },
    target: 1277, // Greatest General — Fire (Cold Bolt amplified), hard MDEF 15 + soft MDEF ~85
  },
  {
    // Double Bolt (SC_DOUBLECASTING): fires the bolt volley a second time per cast,
    // so one cast deals 2× damage (period unchanged) and kills in half the casts.
    // Regression that Double Bolt changes per-cast damage / hits-to-kill, not just DPS.
    name: "sage-fire-bolt-double-bolt",
    build: { job_id: 16, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 40, vit: 30, int: 99, dex: 80, luk: 10 }, equipped: { right_hand: 1601 }, active_buffs: { SC_DOUBLECASTING: 1 } },
    skill: { name: "MG_FIREBOLT", level: 10 },
    target: 1002, // Water 1 — fire amplified
  },
  {
    // Cast-skill spam cap: instant-cast (159 DEX) Fire Bolt under max Poem of Bragi
    // would otherwise repeat faster than 3/sec. period_ms must floor at 333
    // (profile.min_cast_period_ms), not cast+delay. Regression for that cap.
    name: "wizard-instant-firebolt-bragi-spamcap",
    build: { job_id: 9, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 1, vit: 1, int: 99, dex: 99, luk: 1 }, bonus_stats: { dex: 60 }, equipped: { right_hand: 1601 }, song_state: { SC_POEMBRAGI: 10, SC_POEMBRAGI_lesson: 10, SC_POEMBRAGI_int: 99 } },
    skill: { name: "MG_FIREBOLT", level: 10 },
    target: 1002, // Water 1 — fire amplified
  },

  // --- misc / special mechanics ---------------------------------------------------
  {
    name: "alchemist-acid-terror",
    build: { job_id: 18, base_level: 90, job_level: 50, base_stats: { str: 80, agi: 50, vit: 40, int: 40, dex: 60, luk: 10 }, equipped: { right_hand: 1201 } },
    skill: { name: "AM_ACIDTERROR", level: 5 },
    target: 1867,
  },
  {
    name: "hunter-land-mine",
    build: { job_id: 11, base_level: 99, job_level: 50, base_stats: { str: 20, agi: 70, vit: 20, int: 90, dex: 99, luk: 30 }, equipped: { right_hand: 1707, ammo: 1750 } },
    skill: { name: "HT_LANDMINE", level: 5 },
    target: 1036,
  },
  {
    name: "whitesmith-mammonite",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504 } },
    skill: { name: "MC_MAMMONITE", level: 10 },
    target: 1036,
  },
  {
    name: "rogue-backstab-opportunity",
    build: { job_id: 17, base_level: 90, job_level: 50, base_stats: { str: 80, agi: 80, vit: 30, int: 1, dex: 70, luk: 20 }, equipped: { right_hand: 1201 }, support_buffs: { backstab_opportunity: true } },
    skill: { name: "RG_BACKSTAP", level: 10 },
    target: 1036,
  },
  {
    name: "gunslinger-desperado-hit-range",
    build: { job_id: 24, base_level: 90, job_level: 50, base_stats: { str: 20, agi: 70, vit: 30, int: 20, dex: 99, luk: 30 }, equipped: {} },
    skill: { name: "GS_DESPERADO", level: 10 },
    target: 1036,
  },
  {
    // Tracking — the 2026-08-22 audit corrected this from 100+160×lv to a flat 160×lv
    // (Gunslinger PDF: "1600% at Skill Lvl 10"). A rifle skill, so it needs a rifle.
    name: "gunslinger-tracking-lv10",
    build: { job_id: 24, base_level: 99, job_level: 50, base_stats: { str: 80, agi: 90, vit: 1, int: 1, dex: 80, luk: 1 }, equipped: { right_hand: 13150 } },
    skill: { name: "GS_TRACKING", level: 10 },
    target: 1002,
  },
  {
    // Gunslinger Chain Action (GS_CHAINACTION): revolver normal attacks proc a
    // second hit at 7%/lv (70% at Lv10). Normal attack (no skill). Regression
    // that the double-attack shows up in DPS with a revolver equipped.
    name: "gunslinger-chain-action-revolver",
    build: { job_id: 24, base_level: 99, job_level: 50, base_stats: { str: 80, agi: 90, vit: 1, int: 1, dex: 80, luk: 1 }, equipped: { right_hand: 13100 }, mastery_levels: { GS_CHAINACTION: 10 } },
    target: 1002,
  },

  // --- Super Novice ------------------------------------------------------------------
  {
    name: "sn-status-fury-neverdied-conc",
    build: { job_id: 23, base_level: 99, job_level: 99, base_stats: STATS_ALL_50, equipped: {}, flags: { sn_never_died: true }, active_buffs: { SC_EXPLOSIONSPIRITS: 13, SC_CONCENTRATION: 10 } },
  },
  {
    name: "sn-angel-set-combo",
    build: { job_id: 23, base_level: 99, job_level: 99, base_stats: STATS_ALL_50, equipped: { head_top: 5125, armor: 2355, garment: 2521, shoes: 2420, left_hand: 2116 } },
  },
  {
    name: "sn-bash-with-novice-gear",
    build: { job_id: 23, base_level: 99, job_level: 99, base_stats: { str: 80, agi: 60, vit: 40, int: 30, dex: 60, luk: 30 }, equipped: { right_hand: 1101 } },
    skill: { name: "SM_BASH", level: 10 },
    target: 1036,
  },

  // --- buffs feeding damage -------------------------------------------------------------
  {
    name: "monk-fury-lv5-crit-chance",
    build: { job_id: 15, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 60, vit: 40, int: 20, dex: 60, luk: 40 }, equipped: {}, active_buffs: { SC_EXPLOSIONSPIRITS: 5 } },
    target: 1036,
  },

  // --- Sage Auto Spell / Hindsight (SA_AUTOSPELL) autocast ---------------------------------
  // Level-selected autocast on physical attacks (flat 30%). Surfaced as a
  // proc_branches.autospell magic damage result; folded into DPS.
  {
    // Lv1 → Soul Strike Lv5 (Ghost, 3 hits) vs Ghoul (Undead) — single-cast branch.
    name: "sage-hindsight-soulstrike-lv1",
    build: { job_id: 16, base_level: 99, job_level: 50, base_stats: { str: 50, agi: 40, vit: 30, int: 70, dex: 60, luk: 20 }, equipped: { right_hand: 1601 }, support_buffs: { auto_spell_lv: 1 } },
    target: 1036,
  },
  {
    // Lv2 → Fire Bolt Lv2–4 (uniform mixture) vs Poring (Water) — Fire beats Water,
    // and the min/max span the lv2→lv4 cast-level range.
    name: "sage-hindsight-firebolt-lv2-mix",
    build: { job_id: 16, base_level: 99, job_level: 50, base_stats: { str: 50, agi: 40, vit: 30, int: 70, dex: 60, luk: 20 }, equipped: { right_hand: 1601 }, support_buffs: { auto_spell_lv: 2 } },
    target: 1002,
  },
  {
    // Lv9 → Stone Curse (no damage): must produce NO proc branch.
    name: "sage-hindsight-lv9-no-damage",
    build: { job_id: 16, base_level: 99, job_level: 50, base_stats: { str: 50, agi: 40, vit: 30, int: 70, dex: 60, luk: 20 }, equipped: { right_hand: 1601 }, support_buffs: { auto_spell_lv: 9 } },
    target: 1002,
  },

  // --- Hunter traps (INT/DEX formula, bypasses DEF, elemental) ----------------------------
  {
    // Blast Mine (Wind) vs Poring (Water) — trap damage scales with INT+DEX.
    name: "hunter-blast-mine-lv5",
    build: { job_id: 11, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 30, vit: 1, int: 99, dex: 90, luk: 1 }, equipped: { right_hand: 1707 } },
    skill: { name: "HT_BLASTMINE", level: 5 },
    target: 1002,
  },
  {
    // Claymore Trap (Fire) vs Ghoul (Undead) — different element + divisor.
    name: "hunter-claymore-trap-lv5",
    build: { job_id: 11, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 30, vit: 1, int: 99, dex: 90, luk: 1 }, equipped: { right_hand: 1707 } },
    skill: { name: "HT_CLAYMORETRAP", level: 5 },
    target: 1036,
  },

  // --- Reflect Shield (own branch; dps_valid:false — reflects damage taken) ---------------
  {
    name: "crusader-reflect-shield-lv5",
    build: { job_id: 14, base_level: 99, job_level: 50, base_stats: { str: 60, agi: 1, vit: 80, int: 40, dex: 40, luk: 1 }, equipped: { right_hand: 1104 } },
    skill: { name: "CR_REFLECTSHIELD", level: 5 },
    target: 1002,
  },

  // --- Blaze Shield (NJ_KAENSIN): 50% MATK per hit; hits 3/6/9 by level --------------------
  {
    name: "ninja-blaze-shield-lv4",  // 3 hits × 50%
    build: { job_id: 25, base_level: 99, job_level: 70, base_stats: { str: 1, agi: 1, vit: 1, int: 99, dex: 90, luk: 1 }, equipped: { right_hand: 1601 } },
    skill: { name: "NJ_KAENSIN", level: 4 },
    target: 1002,
  },
  {
    name: "ninja-blaze-shield-lv10",  // 9 hits × 50%
    build: { job_id: 25, base_level: 99, job_level: 70, base_stats: { str: 1, agi: 1, vit: 1, int: 99, dex: 90, luk: 1 }, equipped: { right_hand: 1601 } },
    skill: { name: "NJ_KAENSIN", level: 10 },
    target: 1113, // Drops (Fire 1) — locks the 9-hit × 50% total (Fire vs Fire mult applies)
  },

  // --- manual Blitz Beat (Falcon; per-hit × level, neutral, bypasses DEF) ------------------
  {
    name: "hunter-blitz-beat-lv5",
    build: { job_id: 11, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 90, vit: 1, int: 60, dex: 60, luk: 80 }, equipped: { right_hand: 1707 }, mastery_levels: { HT_FALCON: 1, HT_STEELCROW: 10, HT_BLITZBEAT: 5 } },
    skill: { name: "HT_BLITZBEAT", level: 5 },
    target: 1002,
  },
  {
    // Bow auto-attack auto-triggers Blitz Beat: ⌊LUK/3⌋% chance, min(BB lv, ⌊jobLv/10⌋+1) hits,
    // folded into DPS as a proc (proc_branches.auto_blitz). Same build as manual above.
    name: "hunter-normal-attack-auto-blitz",
    build: { job_id: 11, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 90, vit: 1, int: 60, dex: 60, luk: 80 }, equipped: { right_hand: 1707 }, mastery_levels: { HT_FALCON: 1, HT_STEELCROW: 10, HT_BLITZBEAT: 5 } },
    target: 1002,
  },

  // --- Ninja Shadow Slash (NJ_KIRIKAGE) — from-Hiding ratio bonus --------------------------
  {
    name: "ninja-shadow-slash-hiding",
    build: { job_id: 25, base_level: 99, job_level: 70, base_stats: { str: 90, agi: 1, vit: 1, int: 30, dex: 1, luk: 80 }, equipped: { right_hand: 13020 } },
    skill: { name: "NJ_KIRIKAGE", level: 5 },
    ninja_hiding: true,
    target: 1002,
  },

  // --- PS Merchant / Blacksmith / Alchemist rework (2026-08-09 PDFs) ----------------------
  {
    // Cart Revolution is now a 5-rank tree skill: 50 × lv% ATK (250% at Lv5, i.e.
    // exactly the old flat value only at max rank), full damage at any cart weight.
    name: "merchant-cart-revolution-lv5",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504 } },
    skill: { name: "MC_CARTREVOLUTION", level: 5 },
    target: 1036,
  },
  {
    // Rank 2 (100% ATK) — guards the per-level scaling, not just the max rank.
    name: "merchant-cart-revolution-lv2",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504 } },
    skill: { name: "MC_CARTREVOLUTION", level: 2 },
    target: 1036,
  },
  {
    // Zeny Pincher halves Mammonite's per-level term: 100 + 25×lv (350% at Lv10)
    // instead of 100 + 50×lv (600%). Compare against "whitesmith-mammonite".
    name: "whitesmith-mammonite-zeny-pincher",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504 }, active_buffs: { SC_PS_ZENYPINCHER: 1 } },
    skill: { name: "MC_MAMMONITE", level: 10 },
    zeny_pincher: true,
    target: 1036,
  },
  {
    // Tool Mastery: +4 ATK/lv with an Axe or Mace for the whole Merchant line.
    // Mace (1504) + Tool Mastery 10 → +40 flat at the Mastery Fix step.
    name: "merchant-tool-mastery-mace",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504 }, mastery_levels: { PS_MC_TOOLMASTERY: 10 } },
    target: 1036,
  },
  {
    // Crazy Uproar Lv4 self-cast: +4 STR / +4 VIT (BATK and soft DEF both move).
    name: "merchant-crazy-uproar-lv4",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504 }, active_buffs: { SC_SHOUT: 4 } },
    target: 1036,
  },
  {
    // Adrenaline Rush self-cast with a Mace: +30% ASPD (period drops, DPS rises).
    name: "blacksmith-adrenaline-self-mace",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504 }, active_buffs: { SC_ADRENALINE_SELF: 1 } },
    target: 1036,
  },
  {
    // Same buff with a NON Axe/Mace melee weapon (Sword): the rework's lesser tier,
    // +20% ASPD — vanilla gave this weapon nothing at all.
    name: "blacksmith-adrenaline-self-sword",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1101 }, active_buffs: { SC_ADRENALINE_SELF: 1 } },
    target: 1036,
  },
  {
    // Party-received Adrenaline Rush with a Mace: +20% (half the self-cast tier).
    name: "blacksmith-adrenaline-party-mace",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504 }, support_buffs: { SC_ADRENALINE: 1 } },
    target: 1036,
  },
  {
    // Pirate Skel Card auto-Mammonite: 5% per physical attack, Lv10 because
    // Mammonite is mastered — surfaces as a card_autocast_MC_MAMMONITE proc branch
    // and folds into DPS. Accessory card slot on an accessory (2615 Clip).
    name: "blacksmith-pirate-skel-auto-mammonite",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504, accessory_left: 2615, head_top: 2221, head_top_card1: 4073 }, mastery_levels: { MC_MAMMONITE: 10 } },
    target: 1036,
  },
  {
    // Demonstration with the FUEL Card: the PS wiki gives the skill a 5s cooldown, and
    // the card cuts 2s off it — the first item bonus that moves a cooldown rather than
    // a delay. Freezes both the cooldown floor and the reduction (period 5340 -> 3340).
    name: "alchemist-demonstration-fuel-cooldown",
    build: { job_id: 18, base_level: 99, job_level: 50, base_stats: { str: 70, agi: 70, vit: 50, int: 60, dex: 90, luk: 30 }, equipped: { right_hand: 1301, shoes: 2405, shoes_card1: 90007 } },
    skill: { name: "AM_DEMONSTRATION", level: 5 },
    target: 1002,
  },
  {
    // Throw Arrow's own 0.3s cooldown (PS wiki), against a vanilla after-cast delay of
    // 0 — before cooldowns existed this ran at the engine's 100ms minimum instead.
    name: "dancer-throw-arrow-cooldown",
    build: { job_id: 20, base_level: 99, job_level: 50, base_stats: { str: 40, agi: 70, vit: 40, int: 30, dex: 99, luk: 30 }, equipped: { right_hand: 1950, ammo: 1750 } },
    skill: { name: "DC_THROWARROW", level: 5 },
    target: 1002,
  },
  {
    // Pirate Skel + Flame Beetle Card, with Zeny Pincher active: the combo makes the
    // AUTOCAST Mammonite cost no zeny and be "unaffected by Zeny Pincher", so the proc
    // keeps the full 100+50×lv ratio (600% at Lv10) instead of the pinched 350%.
    // A manual Mammonite on the same build is still pinched (see
    // whitesmith-mammonite-zeny-pincher).
    name: "blacksmith-pirate-skel-flame-beetle-zeny-pincher",
    build: { job_id: 10, base_level: 95, job_level: 50, base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1504, accessory_left: 2615, head_top: 2221, head_top_card1: 4073, accessory_right: 2615, accessory_right_card1: 8237 }, mastery_levels: { MC_MAMMONITE: 10 } },
    zeny_pincher: true,
    target: 1036,
  },
  {
    // Transmutation (reworked Axe Mastery) on an Alchemist with an Axe: no flat ATK
    // any more, but +10% ASPD and +10% MATK at Lv10. Normal attack shows the ASPD
    // half (period/DPS) and the status block shows the MATK half.
    name: "alchemist-transmutation-axe",
    build: { job_id: 18, base_level: 90, job_level: 50, base_stats: { str: 80, agi: 50, vit: 40, int: 60, dex: 60, luk: 10 }, equipped: { right_hand: 1301 }, mastery_levels: { AM_AXEMASTERY: 10 } },
    target: 1867,
  },
  {
    // Acid Terror with the nerfed FUEL Card (+10%, was +30%) — the pair of changes
    // the Alchemist PDF explicitly balances against each other.
    name: "alchemist-acid-terror-fuel-card",
    build: { job_id: 18, base_level: 90, job_level: 50, base_stats: { str: 80, agi: 50, vit: 40, int: 40, dex: 60, luk: 10 }, equipped: { right_hand: 1201, shoes: 2405, shoes_card1: 90007 } },
    skill: { name: "AM_ACIDTERROR", level: 5 },
    target: 1867,
  },
  {
    // Burning 5 stacks: −10 hard MDEF on the target, so a magic hit lands harder.
    // Ghoul (1036) carries MDEF, which is what makes the debuff visible here.
    name: "wizard-firebolt-vs-burning-target",
    build: { job_id: 9, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 30, vit: 30, int: 99, dex: 70, luk: 1 }, equipped: { right_hand: 1601 } },
    skill: { name: "MG_FIREBOLT", level: 10 },
    burning: 5,
    target: 1036,
  },

  // --- PS 2026-08-09 patch notes (GM announcement, beyond the four PDFs) ------------------
  {
    // Reflect Shield's new formula is quadratic in VIT and scales with HARD DEF, so
    // pair the existing 0-DEF scenario with one wearing real armour.
    name: "crusader-reflect-shield-lv10-armored",
    build: { job_id: 14, base_level: 99, job_level: 50, base_stats: { str: 60, agi: 1, vit: 90, int: 40, dex: 40, luk: 1 }, equipped: { right_hand: 1104, armor: 2314, head_top: 2258, garment: 2506, shoes: 2406 }, refine: { armor: 7 } },
    skill: { name: "CR_REFLECTSHIELD", level: 10 },
    target: 1002,
  },
  {
    // Magnum Break's lingering fire: +20% of a NORMAL ATTACK as Fire, added after
    // defense. Ghoul is Undead 1, which Fire beats — the added chunk is visible.
    name: "swordman-magnum-lingering-auto-attack",
    build: { job_id: 7, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 40, vit: 80, int: 20, dex: 60, luk: 20 }, equipped: { right_hand: 1101, left_hand: 2101 }, active_buffs: { SC_SUB_WEAPONPROPERTY: 1 } },
    target: 1036,
  },
  {
    // Same buff on Magnum Break itself — the 2026-08-09 Swordsman change. (Bash and
    // every other skill stay excluded; covered by an invariant, not a golden.)
    name: "swordman-magnum-lingering-on-magnum-break",
    build: { job_id: 7, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 40, vit: 80, int: 20, dex: 60, luk: 20 }, equipped: { right_hand: 1101, left_hand: 2101 }, active_buffs: { SC_SUB_WEAPONPROPERTY: 1 } },
    skill: { name: "SM_MAGNUM", level: 10 },
    target: 1036,
  },
  {
    // Wootan Fighter Card raises the lingering effect 20% → 30%.
    name: "swordman-magnum-lingering-wootan-fighter",
    build: { job_id: 7, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 40, vit: 80, int: 20, dex: 60, luk: 20 }, equipped: { right_hand: 1101, left_hand: 2101, armor: 2302, head_top: 2221, head_top_card1: 4261 }, active_buffs: { SC_SUB_WEAPONPROPERTY: 1 } },
    target: 1036,
  },
  {
    // Crescent Scythe crit lifesteal: +9 refine → 0.9% of the crit healed back.
    // The crit branch damage must be unchanged by it.
    name: "knight-crescent-scythe-crit-heal",
    build: { job_id: 7, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 70, vit: 40, int: 1, dex: 60, luk: 80 }, equipped: { right_hand: 1466 }, refine: { right_hand: 9 } },
    target: 1036,
  },

  {
    // Joint Beat on the PS table: 40% per level, so 200% at its Lv5 max — twice the
    // vanilla 50+10×lv this used to fall back to. Spear (Javelin), since PS gates the
    // skill to spear-class weapons.
    name: "lordknight-joint-beat-lv5",
    build: { job_id: 4008, base_level: 99, job_level: 50, base_stats: { str: 90, agi: 60, vit: 40, int: 1, dex: 60, luk: 20 }, equipped: { right_hand: 1401 } },
    skill: { name: "LK_JOINTBEAT", level: 5 },
    target: 1036,
  },

  {
    // Blitz Beat is BF_MISC, so the attacker's card bonuses do NOT apply to it —
    // Hercules' battle_calc_cardfix has no attacker branch for BF_MISC. This bow
    // Hunter wears 4× Abysmal Knight Card (+25% vs Boss each) against Phreeoni, a
    // boss: the auto-attack damage takes the +100%, the falcon must not.
    name: "hunter-auto-blitz-vs-boss-ignores-race-cards",
    build: {
      job_id: 11, base_level: 99, job_level: 50,
      base_stats: { str: 1, agi: 99, vit: 1, int: 1, dex: 63, luk: 72 },
      equipped: {
        right_hand: 1705, ammo: 1764,
        right_hand_card1: 4140, right_hand_card2: 4140, right_hand_card3: 4140, right_hand_card4: 4140,
      },
      mastery_levels: { HT_FALCON: 1, HT_BLITZBEAT: 5, HT_STEELCROW: 10, HT_BEASTBANE: 10 },
    },
    target: 1159, // Phreeoni — Large Brute BOSS, so RC_Boss card bonuses are live
  },

  {
    // Sphere Mine: PS replaced vanilla's "sphere explodes for its remaining HP" with a
    // flat 1000 + 200×SkillLv + 25×Total VIT (wiki.payonstories.com/Sphere_Mine). Fire
    // element, ignores DEF and weapon size penalties. Ghoul is Undead 1, which Fire
    // beats, so the element step is visible in the golden.
    name: "alchemist-sphere-mine-lv5",
    build: {
      job_id: 18, base_level: 99, job_level: 50,
      base_stats: { str: 40, agi: 40, vit: 80, int: 40, dex: 60, luk: 20 },
      equipped: { right_hand: 1305 },
    },
    skill: { name: "AM_SPHEREMINE", level: 5 },
    target: 1036,
  },

  {
    // Arrow ATK is gated on the SKILL's ammo requirement, not on holding a bow.
    // A bow Rogue's plagiarised Acid Terror requires an Acid Bottle and no ammo, so
    // the equipped Oridecon Arrow (ATK 50) must add nothing — the engine used to add
    // it, which is what a player reported. Ammo is equipped here deliberately: the
    // scenario is worthless if it can't catch the bonus coming back.
    name: "bow-rogue-acid-terror-ignores-arrow",
    build: {
      job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 1, agi: 94, vit: 1, int: 26, dex: 99, luk: 1 },
      equipped: { right_hand: 1716, ammo: 1765 },
      flags: { plagiarism: { name: "AM_ACIDTERROR", level: 5 } },
    },
    skill: { name: "AM_ACIDTERROR", level: 5 },
    target: 1036,
  },

  // --- incoming (survivability) -----------------------------------------------------------
  {
    name: "incoming-banshee-physical",
    build: { job_id: 14, base_level: 95, job_level: 50, base_stats: { str: 60, agi: 30, vit: 70, int: 60, dex: 40, luk: 10 }, equipped: { right_hand: 1101, armor: 2355 } },
    target: 1867,
    incoming: "physical",
  },
];

module.exports = { scenarios };
