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

  // --- incoming (survivability) -----------------------------------------------------------
  {
    name: "incoming-banshee-physical",
    build: { job_id: 14, base_level: 95, job_level: 50, base_stats: { str: 60, agi: 30, vit: 70, int: 60, dex: 40, luk: 10 }, equipped: { right_hand: 1101, armor: 2355 } },
    target: 1867,
    incoming: "physical",
  },
];

module.exports = { scenarios };
