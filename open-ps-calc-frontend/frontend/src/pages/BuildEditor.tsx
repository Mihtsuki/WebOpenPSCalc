import { useEffect, useCallback, useState, useMemo, useRef, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import LZString from "lz-string";
import { api, statsApi, shareApi } from "../api/client";
import SearchPicker from "../components/SearchPicker";
import Panel from "../components/Panel";
import InfoTooltip from "../components/InfoTooltip";
import HoverNote from "../components/HoverNote";
import HoverDescription from "../components/HoverDescription";
import AttackRateNote from "../components/AttackRateNote";
import ChangelogModal from "../components/ChangelogModal";
import ResultsPanel from "../components/ResultsPanel";
import SavedBuildsModal from "../components/SavedBuildsModal";
import ImportJaludevModal from "../components/ImportJaludevModal";
import KofiModal from "../components/KofiModal";
import { summaryMetrics, type ComparePin } from "../components/CompareView";
import { BreakpointsView } from "../components/BreakpointsView";
import starterBuildsJson from "../data/starterBuilds.json";
import {
  BuildData, SkillState, CustomTarget, TargetMode, TargetMods,
  UrlEditorState, SearchResult, PassiveSkill, EquippedItemInfo, ConsumableBuffs,
  WildcardSlot,
} from "../types";

// Element index → display name (Neutral=0 … Undead=9). Matches the engine's
// element convention and the custom-target element select below.
const ELEMENT_NAMES = ["Neutral", "Water", "Earth", "Fire", "Wind", "Poison", "Holy", "Dark", "Ghost", "Undead"] as const;

const WILDCARD_BONUS_OPTIONS = [4, 10, 15, 20, 30];
// Gunslinger coin costs, from the Gunslinger Release Patch Notes PDF (Friekshow,
// 2025-03-01) and wiki.payonstories.com/Fling. Coins are a finite pool from Coin
// Flip (max 10), so a build can ask for more than it holds — this is what lets the
// panel say so instead of silently pricing an impossible setup.
// Skill ids that cost a coin to cast. Fling is absent because it is variable —
// it spends up to 5 and is handled separately.
const GS_SKILL_COIN_COST: Record<number, number> = {
  507: 1, // Soul Bullet (GS_MAGICALBULLET)
  503: 1, // Tranq Shot  (GS_BULLSEYE)
  513: 1, // Disarm      (GS_DISARM)
};
const GS_FLING_SKILL_ID = 501;
// Barrage and Run and Gun each "replace" the other per the PDF, so they can never
// both be up. Ticking one clears the other rather than quietly pricing both.
const GS_EXCLUSIVE_BUFFS: Record<string, string> = {
  SC_GS_MADNESSCANCEL: "SC_GS_ADJUSTMENT",
  SC_GS_ADJUSTMENT: "SC_GS_MADNESSCANCEL",
};

const WILDCARD_DEFAULT_BONUS: Record<WildcardSlot["type"], number> = {
  race: 20, size: 15, ele: 20, family: 30,
};

const STATS = ["str", "agi", "vit", "int", "dex", "luk"] as const;
// statusCalculator.js / dataLoader.js's getJobBonusStats reads from the
// same keys it writes to status.{str_,agi,vit,int_,dex,luk} -- str/int get
// a trailing underscore there to dodge the JS reserved-ish "int" naming.
const STAT_TO_BONUS_KEY: Record<typeof STATS[number], string> = {
  str: "str_", agi: "agi", vit: "vit", int: "int_", dex: "dex", luk: "luk",
};
const BASE_LEVEL_CAP = 99;
const MAX_STAT = 99;

// Cumulative status points available at each base level (index = level - 1).
// Mirrors dataLoader.js statpoint_table.json (pre-re, levels 1–99).
// Trans 2nd jobs receive an additional +52 points.
const STAT_POINT_BY_LEVEL: readonly number[] = [48,51,54,57,60,64,68,72,76,80,85,90,95,100,105,111,117,123,129,135,142,149,156,163,170,178,186,194,202,210,219,228,237,246,255,265,275,285,295,305,316,327,338,349,360,372,384,396,408,420,433,446,459,472,485,499,513,527,541,555,570,585,600,615,630,646,662,678,694,710,727,744,761,778,795,813,831,849,867,885,904,923,942,961,980,1000,1020,1040,1060,1080,1101,1122,1143,1164,1185,1207,1229,1251,1273];

// STAT_COST_TABLE[v] = total stat points spent to bring a stat from 1 to v.
// PS formula: cost to increment v→v+1 is floor((v-1)/10) + 2 for all v≥1.
// (Verified against payonrocalc.jaludev.com — the official PS stat simulator.)
const STAT_COST_TABLE: readonly number[] = (() => {
  const t: number[] = [0, 0];
  for (let v = 2; v <= 99; v++) {
    t.push(t[v - 1] + (Math.floor((v - 2) / 10) + 2));
  }
  return t;
})();

// Pre-renewal job level caps, derived from job_db.json's job list (28 jobs,
// no baby classes in this dataset): Novice 10, 1st job 50, regular 2nd job
// 50, Super Novice 99, trans 2nd job 70. Gunslinger/Ninja are classic kRO's
// "extended" classes (job level 60 there), but wiki.payonstories.com/
// Gunslinger references planning around "JobLv70 gunslinger", so this PS
// instance appears to have retuned them to the trans cap instead.
const TRANS_JOB_IDS = new Set([4008, 4009, 4010, 4011, 4012, 4013, 4015, 4016, 4017, 4018, 4019, 4020, 4021]);
// Novice + 1st job (except Magician): Concentration Potion only. (Super Novice, 23,
// is NOT here — PS lets it use up to Awakening Potion, so it falls through to cap 2.)
const NOVICE_OR_1ST_JOB_IDS = new Set([0, 1, 2, 3, 4, 5, 6]);
// These non-trans classes can use Berserk Potion; trans forms already covered by TRANS_JOB_IDS
const BERSERK_NON_TRANS_IDS = new Set([
  2, 9, 16,   // Mage tree: Magician, Wizard, Sage
  5, 10, 18,  // Merchant tree: Merchant, Blacksmith, Alchemist
  1, 7, 14,   // Swordsman tree: Swordman, Knight, Crusader
  6, 12, 17,  // Thief tree: Thief, Assassin, Rogue
  24,         // Gunslinger — Berserk Potion is usable per vanilla item_db_usable (Ninja is not; Awakening only)
]);
// PS rebalance: these classes are restricted to Concentration Potion
const CONC_ONLY_IDS = new Set([
  8, 4009,              // Acolyte tree: Priest, High Priest
  19, 20, 4020, 4021,  // Archer tree: Bard, Dancer, Clown, Gypsy
]);
function getTotalStatPoints(baseLevel: number, jobId: number): number {
  const idx = Math.min(Math.max(baseLevel, 1), STAT_POINT_BY_LEVEL.length) - 1;
  const base = STAT_POINT_BY_LEVEL[idx] ?? 48;
  return TRANS_JOB_IDS.has(jobId) ? base + 52 : base;
}
function maxAffordableStat(from: number, remaining: number): number {
  let v = from, pts = remaining;
  while (v < MAX_STAT) {
    const c = Math.floor((v - 1) / 10) + 2;
    if (c > pts) break;
    pts -= c;
    v++;
  }
  return v;
}

const JOB_LEVEL_CAP_OVERRIDES: Record<number, number> = { 0: 10, 23: 99, 24: 70, 25: 70 };
function getJobLevelCap(jobId: number): number {
  if (TRANS_JOB_IDS.has(jobId)) return 70;
  return JOB_LEVEL_CAP_OVERRIDES[jobId] ?? 50;
}
// Returns the highest ASPD potion index allowed for a job (1=Conc, 2=Awak, 3=Berserk).
// 0 (no job selected) → no restriction so the form isn't locked before a class is chosen.
function aspdPotionCap(jobId: number): number {
  if (!jobId) return 3;
  if (CONC_ONLY_IDS.has(jobId)) return 1;           // PS: Bard/Dancer/Clown/Gypsy — Conc only
  if (BERSERK_NON_TRANS_IDS.has(jobId)) return 3;   // Mage/Merchant/Swordsman/Thief trees
  if (NOVICE_OR_1ST_JOB_IDS.has(jobId)) return 1;
  if (TRANS_JOB_IDS.has(jobId)) return 3;
  return 2;
}

// Whether a slot can be refined depends on the specific equipped item, not
// the slot itself (e.g. most headgears ARE refineable, but not all; same
// for every other armor slot) -- see item.refineable, checked at render time.
// Blacksmith-forgeable weapon item IDs (the star-crumb forge list from
// ratemyserver.net creation_db op=3). The forge control shows only for these,
// so named/elemental weapons (Fire Brand, Excalibur, Muramasa…) are excluded
// while scripted-but-forgeable ones (Damascus, Flamberge) are kept.
// Keep in sync with FORGEABLE_WEAPON_IDS in backend buildManager.js.
const FORGEABLE_WEAPON_IDS = new Set([
  1101, 1104, 1107, 1110, 1113, 1116, 1119, 1122, 1123, 1126, 1129, 1151, 1154, 1157, 1160, 1163,
  1201, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1301, 1351, 1354, 1357, 1360, 1401, 1404, 1407,
  1410, 1451, 1454, 1457, 1460, 1463, 1501, 1504, 1507, 1510, 1513, 1516, 1519, 1522, 1801, 1803,
  1805, 1807, 1809, 1811,
]);

const EQUIP_SLOTS = [
  { key: "right_hand", label: "Right hand (weapon)", itemType: "IT_WEAPON" },
  { key: "left_hand", label: "Left hand (shield / weapon)", itemType: "IT_ARMOR", loc: "EQP_SHIELD", dualWield: true },
  { key: "head_top", label: "Headgear (top)", itemType: "IT_ARMOR", loc: "EQP_HEAD_TOP" },
  { key: "head_mid", label: "Headgear (mid)", itemType: "IT_ARMOR", loc: "EQP_HEAD_MID" },
  { key: "head_low", label: "Headgear (low)", itemType: "IT_ARMOR", loc: "EQP_HEAD_LOW" },
  { key: "armor", label: "Armor", itemType: "IT_ARMOR", loc: "EQP_ARMOR" },
  { key: "garment", label: "Garment", itemType: "IT_ARMOR", loc: "EQP_GARMENT" },
  { key: "shoes", label: "Shoes", itemType: "IT_ARMOR", loc: "EQP_SHOES" },
  { key: "accessory_left", label: "Accessory (left)", itemType: "IT_ARMOR", loc: "EQP_ACC" },
  { key: "accessory_right", label: "Accessory (right)", itemType: "IT_ARMOR", loc: "EQP_ACC" },
  { key: "ammo", label: "Ammo", itemType: "IT_AMMO" },
] as const;

// Cards are filtered to the slot they're being compounded into.
// left_hand uses EQP_WEAPON when a weapon is equipped (dual-wield), EQP_SHIELD otherwise.
const SLOT_CARD_LOC: Record<string, string | undefined> = {
  right_hand:      "EQP_WEAPON",
  left_hand:       "EQP_SHIELD",
  head_top:        "EQP_HEAD_TOP",
  head_mid:        "EQP_HEAD_MID",
  head_low:        "EQP_HEAD_LOW",
  armor:           "EQP_ARMOR",
  garment:         "EQP_GARMENT",
  shoes:           "EQP_SHOES",
  accessory_left:  "EQP_ACC",
  accessory_right: "EQP_ACC",
};

const DEFAULT_BUILD: BuildData = {
  name: "New Build",
  job_name: '',
  job_id: 0,
  base_level: 1,
  job_level: 1,
  base_stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 },
  bonus_stats: {},
  equipped: {},
  refine: {},
  forge: {},
  target_mob_id: null,
  server: "payon_stories",
  consumable_buffs: {},
  active_buffs: {},
  song_state: {},
  wildcard_slots: {},
};

// Starter build templates — derived from the single source of truth in
// src/data/starterBuilds.json, which scripts/gen-guides.mjs ALSO reads to build the
// SEO guide pages, so the template picker and the guides can never drift apart.
// Stat spreads come from each class's ==Builds== section on wiki.payonstories.com,
// matched to the same-named build within the wiki's ranges and kept inside the
// base-99 status-point budget (1273 pts; two stats at 99 already cost 1256).
type StarterBuild = {
  slug: string;
  label: string;
  cls: string;
  build: string;
  job: string;
  job_id: number;
  base_level: number;
  job_level: number;
  base_stats: { str: number; agi: number; vit: number; int: number; dex: number; luk: number };
  skill: SkillState;
  support_buffs?: Record<string, number | string | boolean>;
  wiki: string;
  note: string;
  summary: string;
  gear: string;
};
const STARTER_BUILDS = starterBuildsJson as unknown as StarterBuild[];

type BuildTemplate = {
  label: string;
  job_id: number;
  base_level: number;
  job_level: number;
  base_stats: { str: number; agi: number; vit: number; int: number; dex: number; luk: number };
  skill: SkillState;
  support_buffs?: Record<string, number | string | boolean>;
  wiki: string;
  note: string;
};
const BUILD_TEMPLATES: BuildTemplate[] = STARTER_BUILDS.map((b) => ({
  label: b.label,
  job_id: b.job_id,
  base_level: b.base_level,
  job_level: b.job_level,
  base_stats: { ...b.base_stats },
  skill: { ...b.skill },
  support_buffs: b.support_buffs,
  wiki: `https://wiki.payonstories.com/${b.wiki}`,
  note: b.note,
}));

// Maps a guide-page slug (?t=…) to a template label — derived from the shared
// starterBuilds.json (same source scripts/gen-guides.mjs uses), so a guide's
// "Open in the calculator" deep-link always resolves to the matching build.
const GUIDE_SLUG_TO_LABEL: Record<string, string> = Object.fromEntries(
  STARTER_BUILDS.map((b) => [b.slug, b.label]),
);

// Bonuses from wiki.payonstories.com/Cute_Pet_System. Only PS server has
// pet_bonuses populated; standard server sends selected_pet but profile
// pet_bonuses:{} makes applyPetBonuses a no-op.
const PS_PETS: { key: string; label: string; psCustom?: true }[] = [
  // ── Payon Stories custom pets ──────────────────────────────────────────
  { key: "gyokuto",    label: "Gyokuto — MaxSP +20, Heal +3%",        psCustom: true },
  { key: "kalec",      label: "Kalec — MATK +1%, MDEF +2",            psCustom: true },
  { key: "onigiring",  label: "Onigiring — MaxHP +50, Poison resist",  psCustom: true },
  { key: "puck",       label: "Puck — VIT +1, Magic Dmg Rcvd −1%",    psCustom: true },
  { key: "yser",       label: "Yser — HIT +4, ASPD +1%",              psCustom: true },
  // ── Standard pets (alphabetical) ────────────────────────────────────
  { key: "alice",           label: "Alice — MDEF +1, Demi-Human resist +1%" },
  { key: "baby_desert_wolf",label: "Baby Desert Wolf — INT +1, SP +20" },
  { key: "baphomet_jr",     label: "Baphomet Jr. — DEF +1, MDEF +1" },
  { key: "bongun",          label: "Bongun — VIT +1" },
  { key: "chonchon",        label: "Chonchon — AGI +1, FLEE +2" },
  { key: "deviruchi",       label: "Deviruchi — ATK/MATK +1%, HP/SP −3%" },
  { key: "dokebi",          label: "Dokebi — MATK +1%, ATK −1%" },
  { key: "drops",           label: "Drops — HIT +3, ATK +3" },
  { key: "dullahan",        label: "Dullahan — Crit Dmg +4%, LUK −1" },
  { key: "earth_petite",    label: "Earth Petite — DEF/MDEF −2, ASPD +1%" },
  { key: "green_maiden",    label: "Green Maiden — DEF +1, Demi-Human resist +1%" },
  { key: "hunter_fly",      label: "Hunter Fly — FLEE −5, Perfect Dodge +2" },
  { key: "imp",             label: "Imp — Fire resist +2%, Fire Dmg +1%" },
  { key: "isis",            label: "Isis — ATK +1%, MATK −1%" },
  { key: "lunatic",         label: "Lunatic — CRIT +2, ATK +2" },
  { key: "munak",           label: "Munak — INT +1, DEF +1" },
  { key: "orc_warrior",     label: "Orc Warrior — ATK +10, DEF −3" },
  { key: "peco_peco",       label: "Peco Peco — MaxHP +150, SP −10" },
  { key: "picky",           label: "Picky — STR +1, ATK +5" },
  { key: "poison_spore",    label: "Poison Spore — STR +1, INT +1" },
  { key: "poporing",        label: "Poporing — LUK +2, Poison resist +10%" },
  { key: "poring",          label: "Poring — LUK +2, CRIT +1" },
  { key: "rocker",          label: "Rocker — MaxHP +25, HP recovery +5%" },
  { key: "santa_goblin",    label: "Santa Goblin — MaxHP +30, Water resist +1%" },
  { key: "savage_bebe",     label: "Savage Bebe — VIT +1, MaxHP +50" },
  { key: "smokie",          label: "Smokie — AGI +1, Perfect Dodge +1" },
  { key: "sohee",           label: "Sohee — STR +1, DEX +1" },
  { key: "spore",           label: "Spore — HIT +5, ATK −2" },
  { key: "steel_chonchon",  label: "Steel Chonchon — FLEE +6, AGI −1" },
  { key: "succubus",        label: "Succubus — 2% HP drain on attack (proc not modelled)" },
  { key: "yoyo",            label: "Yoyo — CRIT +3, LUK −1" },
  { key: "zealotus",        label: "Zealotus — ATK +2%, MATK vs Demi-Human +2%" },
];

const ASPD_POTION_LABELS = [
  "None",
  "Concentration Potion (+10%)",
  "Awakening Potion (+15%)",
  "Berserk Potion (+20%)",
];

// Damage/ASPD-relevant active buffs the engine already reads from
// build.active_buffs / build.support_buffs / build.song_state, with no UI
// before now. `jobs` is the actual job_id list each skill belongs to
// (derived from skills.json's status_change field + skill_tree.json, not
// guessed) -- only used to filter SELF_BUFFS, since those only make sense
// if your own build can cast them on itself. Party buffs and songs come
// from OTHER players, so they're never filtered by your own job -- any
// class could be standing in a Priest/Blacksmith/Bard's range.
const SELF_BUFFS = [
  // Archer / Hunter / Sniper / Bard / Dancer / Clown / Gypsy — and Super Novice
  // (23), whose tree carries every 1st-class skill incl. AC_CONCENTRATION.
  { key: "SC_CONCENTRATION",    label: "Improve Concentration", max: 10, jobs: [3, 11, 19, 20, 23, 4012, 4020, 4021] },
  // Super Novice — the Fury chant (typed at exact 10% EXP increments) grants
  // Explosion Spirits at level 13: PS formula 175+25×13 = +50% crit
  // (wiki.payonstories.com/Super_Novice "critical rate +50"). Distinct from
  // the Monk's 5-level Fury below.
  { key: "SC_EXPLOSIONSPIRITS", label: "Critical Explosion (chant, +50% crit)", max: 13, jobs: [23] },
  // Swordman line — Auto Berserk (SM_AUTOBERSERK): while HP < 25% you gain a
  // self Provoke Lv10 (+32% base ATK, −55% self-DEF). Presence-only. Jobs
  // derived from skill_tree.json: Swordman / Knight / Crusader / LK / Paladin.
  { key: "SC_AUTOBERSERK",     label: "Auto Berserk (self Provoke 10)", max: 1, jobs: [1, 7, 14, 4008, 4015] },
  // Magnum Break's lingering fire enchantment (10 s after casting it): adds 20% of a
  // normal attack as FIRE damage on top of the hit, bypassing DEF. Wootan Fighter Card
  // raises it to 30%. On PS it rides auto-attacks and Magnum Break only. Super Novice
  // (23) is included — its tree carries every 1st-class skill, Magnum Break included.
  { key: "SC_SUB_WEAPONPROPERTY", label: "Magnum Break (lingering fire)", max: 1, jobs: [1, 7, 14, 23, 4008, 4015] },
  // Knight / Lord Knight
  { key: "SC_TWOHANDQUICKEN",  label: "Sword Quickening",      max: 10, jobs: [7, 4008] },
  // One rank in both the vanilla and PS skill DBs, and the ASPD it grants doesn't
  // scale with level — presence-only, so offering 10 ranks was meaningless.
  { key: "SC_ONEHANDQUICKEN",  label: "One-Hand Quicken",      max: 1,  jobs: [7, 4008] },
  // Crusader / Paladin
  { key: "SC_SPEARQUICKEN",    label: "Spear Quicken",         max: 10, jobs: [14, 4015] },
  { key: "SC_PROVIDENCE",      label: "Providence",            max: 5,  jobs: [14, 4015] },
  // Blacksmith / Whitesmith
  { key: "SC_MAXIMIZEPOWER",   label: "Maximize Power",        max: 1,  jobs: [10, 4011] },
  // Maximum Over Thrust (WS_OVERTHRUSTMAX, +20% ATK per level) is SELF-ONLY and
  // Whitesmith-only: skills.json types it "Self", the PS skill DB spells it out
  // ("Cannot be activated to anyone beside the caster"), and 4011 is the only job
  // whose tree carries it. It used to sit under Party buffs, where it also had no
  // effect at all — the ratio reads active_status_levels, never support_buffs.
  { key: "SC_OVERTHRUSTMAX",   label: "Maximum Over Thrust",   max: 5,  jobs: [4011] },
  // Adrenaline Rush cast on YOURSELF (PS Blacksmith rework): +30% ASPD with a Mace
  // or Axe, +20% with any other melee weapon. The party-received version (20%/10%)
  // is the SC_ADRENALINE entry under Party buffs. Level only sets duration, so this
  // is presence-only. Kept on its own SC key so the two never overwrite each other.
  { key: "SC_ADRENALINE_SELF", label: "Adrenaline Rush (self)", max: 1, jobs: [10, 4011] },
  // Weapon Perfection (BS_WEAPONPERFECT): nullifies the weapon-vs-size penalty
  // entirely — every weapon deals 100% to every size. Level sets duration only,
  // so presence-only. It IS castable on the party (see PARTY_BUFFS); this entry
  // is the self-cast one, and either source nullifies the penalty the same way.
  { key: "SC_WEAPONPERFECT",   label: "Weapon Perfection",      max: 1,  jobs: [10, 4011] },
  // Zeny Pincher (PS_BS_ZENYPINCHER, quest skill, toggled): Mammonite costs no zeny
  // and, after the PS Merchant rework, deals 100 + 25×lv% instead of 100 + 50×lv%
  // (350% vs 600% at Lv10). Only affects Mammonite.
  { key: "SC_PS_ZENYPINCHER", label: "Zeny Pincher", max: 1, jobs: [10, 4011] },
  // Crazy Uproar (MC_LOUD) — PS Merchant rework: 4 ranks, +1 STR / +1 VIT per level
  // and +3×lv soft DEF to the caster. Merchant line (Merchant/Blacksmith/Alchemist
  // and their transcendent forms) — it is a Merchant tree skill, not a Blacksmith one.
  // Super Novice (23) is on this list because Payon Stories has ALWAYS granted it Crazy
  // Uproar and Cart Revolution — the 2026-08-18 client hotfix only moved them from the Etc.
  // tab to the Novice tab. The vanilla Hercules skill_tree.conf we scrape doesn't list
  // either for job 23, which is why this was missed. See PS_SOURCES.md.
  { key: "SC_SHOUT",           label: "Crazy Uproar",          max: 4,  jobs: [5, 10, 18, 23, 4011, 4019] },
  // Monk / Champion
  { key: "SC_EXPLOSIONSPIRITS", label: "Critical Explosion",                 max: 5,  jobs: [15, 4016] },
  // Gunslinger — SC_GS_ACCURACY adds AGI+4/DEX+4 in statusCalculator.js.
  // Removed on Payon Stories (folded into Single Action), so hidden there.
  { key: "SC_GS_ACCURACY",     label: "Increasing Accuracy",   max: 1,  jobs: [24], psRemoved: true },
  // PS renames these two displays ("Barrage" / "Run and Gun") but the
  // underlying constants are the vanilla Gunslinger ones; both are
  // presence-only (level doesn't change the magnitude in statusCalculator.js).
  { key: "SC_GS_MADNESSCANCEL", label: "Barrage",             max: 1,  jobs: [24] },
  { key: "SC_GS_ADJUSTMENT",   label: "Run and Gun",          max: 1,  jobs: [24] },
  // Gatling Fever (GS_GATLINGFEVER): PS gives a flat +40% ATK at all levels plus
  // an ASPD boost that scales with level; PS suppresses the vanilla flee penalty
  // (statusCalculator.js + PS_RATE_BONUSES/PS_ASPD_BUFFS). Level is kept because
  // the ASPD (and thus DPS) rises with it, even though the ATK% is flat.
  { key: "SC_GS_GATLINGFEVER", label: "Gatling Fever",        max: 10, jobs: [24] },
  // Ninja Aura (NJ_NEN) — PS: +2 STR / +2 INT per level, max Lv5 (+10 each).
  // wiki.payonstories.com/Ninja_Aura. (Engine reads passive_overrides.SC_NJ_NEN.)
  { key: "SC_NJ_NEN",          label: "Ninja Aura",            max: 5,  jobs: [25] },
  // Mirror Image (NJ_BUNSINJYUTSU). The level here is the number of images LEFT,
  // not the skill level — that is what Killing Stroke's bonus reads, (5+5*left)%,
  // so 1 image is +10% and 5 is +30% (wiki.payonstories.com/Mirror_Image). The
  // skill grants ceil(lv/2) images, so five needs Mirror Image Lv9-10. Killing
  // Stroke consumes them all. Its evasion side isn't modeled; only the bonus is.
  { key: "SC_NJ_BUNSINJYUTSU", label: "Mirror Image (images left)", max: 5, jobs: [25] },
  // PS wiki calls this "Double Bolt" (constant PF_DOUBLECASTING / status
  // SC_DOUBLECASTING). On Payon Stories it's a SAGE skill (wiki: class = Sage),
  // so both Sage and Professor get it — not just Professor as in vanilla. 100%
  // chance to instantly re-cast a Fire/Cold/Lightning Bolt, Earth Spike, or Soul
  // Strike; modeled in battlePipeline.js as halving the effective period for
  // those skills (DPS only, not per-hit damage).
  { key: "SC_DOUBLECASTING",   label: "Double Bolt",          max: 1,  jobs: [16, 4017] },
  // Wizard / High Wizard — Mystical Amplification: next spell +50% MATK (vanilla),
  // or +10% per level capped at level 5 (PS rework). Max 10 vanilla / 5 PS;
  // PS cap enforced server-side via SC_AMPLIFYMAGICPOWER_SCALING mechanic flag.
  { key: "SC_AMPLIFYMAGICPOWER", label: "Amplify Magic Power", max: 5, jobs: [9, 4010] },
] as const;

// Received from a party member rather than self-cast -- battle.c treats
// these differently in some cases (e.g. SC_OVERTHRUST from support_buffs
// uses a flatter, weaker formula than the self-cast active_buffs version;
// see skillRatio.js). Grouped by source class for the UI, but every entry
// here writes to build.support_buffs regardless of group.
const PARTY_BUFFS = [
  { key: "SC_IMPOSITIO", label: "Impositio Manus", max: 5, source: "Priest" },
  { key: "SC_BLESSING", label: "Blessing", max: 10, source: "Priest" },
  { key: "SC_INC_AGI", label: "Increase Agility", max: 10, source: "Priest" },
  { key: "SC_GLORIA", label: "Gloria", max: 1, source: "Priest" },
  { key: "SC_ANGELUS", label: "Angelus", max: 5, source: "Priest" },
  // Over Thrust IS castable on the party; Maximum Over Thrust is not (it lives in
  // SELF_BUFFS, Whitesmith only).
  // FIVE ranks (+5% ATK each, +25% at max) — the picker offered 10, which priced
  // every attack at +50%. wiki.payonstories.com/Power-Thrust; the engine clamps the
  // rank as well, so builds shared while it read 10 are corrected on load.
  // Over Thrust has no SELF_BUFFS counterpart, so this entry is also what a
  // self-casting Blacksmith ticks — labelled accordingly, and never hidden.
  { key: "SC_OVERTHRUST", label: "Over Thrust (self or party)", max: 5, source: "Blacksmith" },
  // Adrenaline Rush received from a party Blacksmith: PS rework gives +20% ASPD with
  // a Mace/Axe and +10% with any other melee weapon (bows and guns excluded). Level
  // only sets duration; the self-cast version lives in SELF_BUFFS.
  { key: "SC_ADRENALINE", label: "Adrenaline Rush (from a party Blacksmith)", max: 1, source: "Blacksmith" },
  // Weapon Perfection from a party Blacksmith — the PS wiki is explicit that
  // "Party members also receive this skill's effects", and the effect is the same
  // as the self-cast one (no size penalty), so the engine treats both identically.
  { key: "SC_WEAPONPERFECT", label: "Weapon Perfection (from a party Blacksmith)", max: 1, source: "Blacksmith" },
  // Crazy Uproar from a party Merchant: soft DEF only (2 × level) — the +STR/+VIT
  // half is caster-only, which is why the self-cast entry lives in SELF_BUFFS.
  { key: "SC_SHOUT", label: "Crazy Uproar (from a party Merchant — soft DEF only)", max: 4, source: "Merchant" },
] as const;

// A party buff is hidden once your own job can cast the same thing on itself.
// PS splits several of these by who cast them — Adrenaline Rush is +30% ASPD on an
// axe self-cast but +20% received, Crazy Uproar gives the caster STR/VIT the party
// never sees — so showing both to a Blacksmith invites ticking the weaker one and
// quietly losing 10% ASPD (this is exactly how a reported ASPD mismatch happened).
// Matched by SC key: the self entry either shares the key or is the dedicated
// `<key>_SELF` variant. Over Thrust has no self entry, so it stays for every job —
// it is the only control a self-casting Blacksmith has for it.
function partyBuffSupersededBySelf(key: string, jobId: number): boolean {
  return SELF_BUFFS.some(
    (b) => (b.key === key || b.key === `${key}_SELF`) && (b.jobs as readonly number[]).includes(jobId)
  );
}

function partyBuffsFrom(source: string, jobId: number) {
  return PARTY_BUFFS.filter((b) => b.source === source && !partyBuffSupersededBySelf(b.key, jobId));
}

// `hint` becomes the field's tooltip, after the SC key. Keep the parenthetical in
// `label` to a word or two — the picker is a narrow grid and these wrap — and put
// any caveat (weapon restrictions, what exactly is boosted) in the hint instead.
const SONG_BUFFS = [
  { key: "SC_DRUMBATTLE", label: "Battle Theme (ATK + DEF)", max: 10, hint: "Ensemble. +(Lv+1)×25 weapon ATK and +(Lv+1)×2 DEF." },
  { key: "SC_NIBELUNGEN", label: "Ring of Nibelungen (ATK)", max: 10, hint: "Ensemble. +(Lv+2)×25 weapon ATK — only with a level 4 weapon." },
  { key: "SC_ASSNCROS", label: "Assassin Cross of Sunset (ASPD)", max: 10, hint: "Raises ASPD. No effect while a bow or gun is equipped." },
  { key: "SC_HUMMING", label: "Humming (Hit)", max: 10, hint: "Raises Hit." },
  { key: "SC_FORTUNE", label: "Fortune's Kiss (Crit)", max: 10, hint: "Raises critical rate." },
  // Reduces cast time + after-cast delay (skillTiming.js), not ASPD
  // directly -- only shows up in DPS when testing an actual skill, not a
  // normal attack, since normal-attack period is ASPD-only.
  { key: "SC_POEMBRAGI", label: "A Poem of Bragi (Cast)", max: 10, hint: "Cuts cast time and after-cast delay. Only shows in DPS when a skill is selected — a normal attack's rate is ASPD-only." },
  // Defensive/utility Bard songs — statusCalculator.js applies these to the
  // character status (flee / perfect dodge / Max HP), so they show in the
  // combat-stat readout even though they don't change outgoing damage.
  { key: "SC_WHISTLE", label: "A Whistle (Flee)", max: 10, hint: "Raises Flee and perfect dodge." },
  { key: "SC_APPLEIDUN", label: "The Apple of Idun (Max HP)", max: 10, hint: "Raises Max HP by a percentage." },
  { key: "SC_SERVICEFORYU", label: "Service for You (Max SP)", max: 10, hint: "Raises Max SP and cuts every skill's SP cost." },
] as const;

// Every song scales with the PERFORMER's stats and Lesson level, not yours —
// wiki.payonstories.com/A_Poem_of_Bragi: its reductions are "further affected by
// the Bard's DEX and Musical Lesson level". These write into `song_state` next to
// the song levels, and the engine falls back to them per song.
// Split by class because a party's Bard and Dancer are two different characters.
const BARD_SONG_KEYS = ["SC_DRUMBATTLE", "SC_NIBELUNGEN", "SC_ASSNCROS", "SC_POEMBRAGI", "SC_WHISTLE", "SC_APPLEIDUN"];
const DANCER_SONG_KEYS = ["SC_HUMMING", "SC_FORTUNE", "SC_SERVICEFORYU"];

// The stats get base-stat-style cards (short uppercase name, centred input). The
// Lesson is a SKILL LEVEL, not a stat, so it keeps the ordinary labelled-field
// shape the song levels use and stays out of the card row.
type PerformerField = { key: string; label: string; max: number; hint: string };
type PerformerSpec = { who: string; stats: PerformerField[]; lesson: PerformerField };
const BARD_PERFORMER: PerformerSpec = {
  who: "Bard",
  stats: [
    { key: "bard_agi", label: "AGI", max: 200, hint: "Bard's AGI — Assassin Cross of Sunset (ASPD) and A Whistle (Flee), +1 per 10 AGI" },
    { key: "bard_dex", label: "DEX", max: 200, hint: "Bard's DEX — A Poem of Bragi's cast-time cut, +1% per 10 DEX" },
    { key: "bard_int", label: "INT", max: 200, hint: "Bard's INT — A Poem of Bragi's after-cast delay cut, +1% per full 5 INT" },
    { key: "bard_vit", label: "VIT", max: 200, hint: "Bard's VIT — The Apple of Idun's Max HP, +1% per 10 VIT" },
    { key: "bard_luk", label: "LUK", max: 200, hint: "Bard's LUK — A Whistle's perfect dodge, +1 per 10 LUK" },
  ],
  lesson: { key: "bard_lesson", label: "Musical Lesson", max: 10, hint: "BA_MUSICALLESSON — adds to every Bard song above" },
};
const DANCER_PERFORMER: PerformerSpec = {
  who: "Dancer",
  stats: [
    { key: "dancer_dex", label: "DEX", max: 200, hint: "Dancer's DEX — Humming's Hit bonus, +1 per 10 DEX" },
    { key: "dancer_int", label: "INT", max: 200, hint: "Dancer's INT — Service for You's Max SP and SP-cost cut, +1% per 10 INT" },
    { key: "dancer_luk", label: "LUK", max: 200, hint: "Dancer's LUK — Fortune's Kiss crit, +1 per 10 LUK" },
  ],
  lesson: { key: "dancer_lesson", label: "Dancing Lesson", max: 10, hint: "DC_DANCINGLESSON — adds to every Dancer song above" },
};

// Passive skills and buffs that add to flat base stats.
// SC_CONCENTRATION is a % of current AGI/DEX — approximated using pre-bonus
// totals (card bonuses excluded per the engine formula, close enough for display).
const CLAN_STAT_BONUSES: Record<string, Partial<Record<keyof typeof emptyBuff, number>>> = {
  sword_clan:       { str_: 1, vit: 1 },
  arch_wand_clan:   { int_: 1, dex: 1 },
  golden_mace_clan: { int_: 1, vit: 1 },
  crossbow_clan:    { dex: 1, agi: 1 },
  artisan_clan:     { dex: 1, luk: 1 },
  vile_wind_clan:   { str_: 1, agi: 1 },
};
const emptyBuff = { str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0 };

function computeBuffStatBonuses(
  supportBuffs: Record<string, unknown> = {},
  activeSc: Record<string, unknown> = {},
  preTotals: { agi: number; dex: number } = { agi: 0, dex: 0 },
  masteryLevels: Record<string, unknown> = {},
  clan = "",
  flatAll = 0, // flat bonus to all six stats (SN never-died +10) — applied first so Concentration scales it
): Record<string, number> {
  const b = { ...emptyBuff };
  if (flatAll) for (const k of Object.keys(b)) (b as Record<string, number>)[k] += flatAll;
  // Passive skill stat bonuses (mirror of statusCalculator.js lines 45-49)
  if (masteryLevels.BS_HILTBINDING) b.str_ += 1;
  const dragonologyLv = (masteryLevels.SA_DRAGONOLOGY as number) || 0;
  if (dragonologyLv) b.int_ += Math.floor((dragonologyLv + 1) / 2);
  const owlLv = (masteryLevels.AC_OWL as number) || 0;
  if (owlLv) b.dex += owlLv;
  // Improve Concentration (SC_CONCENTRATION): +% of AGI/DEX. In statusCalculator.js
  // it runs on base + job + gear + the passives above (SN never-died flatAll, AC_OWL),
  // BEFORE Blessing / Increase AGI / GS Accuracy — so it must NOT scale those. Compute
  // it here, before those buffs are added; otherwise it wrongly inflates them (e.g.
  // Blessing showing +11 DEX instead of +10). preTotals excludes cards, per the engine.
  const concLv = (activeSc.SC_CONCENTRATION as number) || 0;
  if (concLv > 0) {
    const pct = (2 + concLv) / 100;
    b.agi += Math.floor((preTotals.agi + b.agi) * pct);
    b.dex += Math.floor((preTotals.dex + b.dex) * pct);
  }
  // Buffs applied AFTER Concentration (not scaled by it) — order per statusCalculator.js.
  // Crazy Uproar (PS Merchant rework): +1 STR and +1 VIT per level to the caster.
  const shoutLv = (activeSc.SC_SHOUT as number) || 0;
  if (shoutLv) { b.str_ += shoutLv; b.vit += shoutLv; }
  const njNenLv = (activeSc.SC_NJ_NEN as number) || 0;
  if (njNenLv) { b.str_ += 2 * njNenLv; b.int_ += 2 * njNenLv; } // Ninja Aura: +2 STR/INT per level
  if (activeSc.SC_GS_ACCURACY) { b.agi += 4; b.dex += 4; }
  const blessingLv = (supportBuffs.SC_BLESSING as number) || 0;
  if (blessingLv > 0) { b.str_ += blessingLv; b.int_ += blessingLv; b.dex += blessingLv; }
  const incAgiLv = (supportBuffs.SC_INC_AGI as number) || 0;
  if (incAgiLv > 0) { b.agi += 2 + incAgiLv; }
  if (supportBuffs.SC_GLORIA) { b.luk += 30; }
  // Clan stat bonuses
  const clanBonus = CLAN_STAT_BONUSES[clan] || {};
  for (const [k, v] of Object.entries(clanBonus)) {
    (b as Record<string, number>)[k] = ((b as Record<string, number>)[k] ?? 0) + (v ?? 0);
  }
  return b;
}

const DEFAULT_SKILL: SkillState = { id: 0, level: 1, label: "Normal Attack", max_level: 10 };

const DEFAULT_CUSTOM_TARGET: CustomTarget = {
  def_: 0, mdef_: 0, vit: 1, level: 1, size: "Medium", race: "Formless",
  element: 0, element_level: 1, is_boss: false, luk: 0, agi: 0, int_: 0,
};

const DEFAULT_TARGET_MODS: TargetMods = {
  element_status: "",
  element_change: "",
  lex_aeterna: false,
  mailbreaker: false,
  offensive_blessing: false,
  breaking_cloak: false,
  performing: false,
  quagmire: 0,
  signum_crucis: false,
  provoke: 0,
  fling: 0,
  sleep: false,
  stun: false,
  blind: false,
  burning: 0,
};

// PS gives two armour cards a clause that inflicts a status on the TARGET when you
// cast Hammerfall — a status this panel can then price. Both are Blacksmith staples,
// and the effect is invisible in the damage number until you tick the matching
// toggle, so the panel says so when the card is equipped.
const HAMMERFALL_STATUS_CARDS: { id: number; name: string; effect: string; toggle: string }[] = [
  { id: 4162, name: "Grizzly Card", effect: "Hammerfall blinds the target (100%, resistances still apply)", toggle: "Blinded" },
  { id: 4216, name: "Sasquatch Card", effect: "Hammerfall freezes the target (30%, does not stack with Stun)", toggle: "Frozen, under Element status" },
];

// Compact URL state (z2_): before compressing, drop every value that equals its
// default and every field that can be re-derived on load, then re-hydrate against
// the defaults on decode. Cuts a typical share link by ~40%. Older z1_ links (full
// JSON) and the legacy base64 form still decode below, so every shared URL keeps working.
const URL_STATE_DEFAULTS = {
  build: DEFAULT_BUILD,
  skill: DEFAULT_SKILL,
  targetMode: "monster",
  customTarget: DEFAULT_CUSTOM_TARGET,
  targetMods: DEFAULT_TARGET_MODS,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Drop keys whose value deep-equals the default; drop objects that become empty.
function pruneDefaults(value: any, def: any): any {
  if (isPlainObject(value)) {
    const d = isPlainObject(def) ? def : {};
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) {
      const pv = pruneDefaults(value[k], (d as any)[k]);
      if (pv !== undefined) out[k] = pv;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value) === JSON.stringify(def) ? undefined : value;
  }
  return value === def ? undefined : value;
}

// Inverse of pruneDefaults: fill any missing key from the (freshly cloned) defaults.
function mergeDefaults(value: any, def: any): any {
  if (isPlainObject(def)) {
    const out: Record<string, any> = { ...def };
    if (isPlainObject(value)) for (const k of Object.keys(value)) out[k] = mergeDefaults(value[k], (def as any)[k]);
    return out;
  }
  return value === undefined ? def : value;
}

// ── Compact URL key codes (the z3_ format) ───────────────────────────────────
// Each state key is renamed to a short code (its base36 INDEX in the lists below)
// before compression, since the long JSON keys are the bulk of the payload and
// LZString can't dedupe keys that each appear once. This list is APPEND-ONLY: a
// code is a position, so old z3_ links must keep decoding — only add keys at the
// end, never reorder or remove. Keys not listed pass through unchanged (dynamic
// SC / skill / pet names, etc., which are never bare base36 codes, so decoding is
// unambiguous). The card-slot order is likewise frozen.
const Z3_CARD_SLOTS = [
  "right_hand", "left_hand", "head_top", "head_mid", "head_low",
  "armor", "garment", "shoes", "accessory_left", "accessory_right",
];

// Sage Auto Spell / "Hindsight" (SA_AUTOSPELL) — the activated level selects one
// autocast spell (wiki.payonstories.com/Auto_Spell). Levels 9 & 10 deal no damage
// (status / buff). Kept in sync with AUTO_SPELL_MAP in the backend battlePipeline.
const AUTO_SPELL_OPTIONS: { lv: number; label: string }[] = [
  { lv: 1, label: "Lv1 — Soul Strike (Lv5)" },
  { lv: 2, label: "Lv2 — Fire Bolt (Lv2–4)" },
  { lv: 3, label: "Lv3 — Cold Bolt (Lv2–4)" },
  { lv: 4, label: "Lv4 — Lightning Bolt (Lv2–4)" },
  { lv: 5, label: "Lv5 — Earth Spike (Lv2)" },
  { lv: 6, label: "Lv6 — Fire Ball (Lv10)" },
  { lv: 7, label: "Lv7 — Thunderstorm (Lv3)" },
  { lv: 8, label: "Lv8 — Heaven's Drive (Lv3)" },
  { lv: 9, label: "Lv9 — Stone Curse (no damage)" },
  { lv: 10, label: "Lv10 — Safety Wall (no damage)" },
];
const Z3_KEYS: string[] = [
  "build", "skill", "targetMode", "customTarget", "targetMods",
  "name", "job_id", "base_level", "job_level", "base_stats", "bonus_stats",
  "equipped", "refine", "target_mob_id", "server", "weapon_element", "active_buffs",
  "mastery_levels", "flags", "manual_adj", "support_buffs", "player_active_scs",
  "song_state", "consumable_buffs", "selected_pet", "clan", "wildcard_slots",
  "str", "agi", "vit", "int", "dex", "luk",
  "right_hand", "left_hand", "head_top", "head_mid", "head_low", "armor",
  "garment", "shoes", "accessory_left", "accessory_right", "ammo",
  "id", "level", "label",
  "def_", "mdef_", "size", "race", "element", "element_level", "is_boss", "int_",
  "element_status", "element_change", "lex_aeterna", "venom_dust", "breaking_cloak",
  "performing", "quagmire", "signum_crucis", "provoke", "sleep", "stun",
  "aspd_potion", "atk_item", "matk_item",
  "type", "bonus",
  // Card slots (frozen order): <slot>_card1..4
  ...Z3_CARD_SLOTS.flatMap((s) => [1, 2, 3, 4].map((i) => `${s}_card${i}`)),
  // Appended (keep at the end — Z3 codes are positional and must stay stable).
  "forge", "sc", "ranked",
  "burning",
  "ele", // elemental forge (forge.<slot>.ele)
  "blind", // target Blind (targetMods.blind)
  "mailbreaker", // targetMods.mailbreaker — was `venom_dust`, whose code stays above
  "offensive_blessing", // targetMods.offensive_blessing (Blessing cast on Undead/Demon)
  "fling", // targetMods.fling — Gunslinger coins thrown (0-5), each -3% target DEF
];
const Z3_ENC: Record<string, string> = {};
const Z3_DEC: Record<string, string> = {};
Z3_KEYS.forEach((k, i) => {
  if (k in Z3_ENC) return; // first occurrence wins (a key appearing twice keeps its earliest code)
  const c = i.toString(36);
  Z3_ENC[k] = c;
  Z3_DEC[c] = k;
});

function renameKeys(v: any, map: Record<string, string>): any {
  if (Array.isArray(v)) return v.map((x) => renameKeys(x, map));
  if (isPlainObject(v)) {
    const out: Record<string, any> = {};
    for (const k of Object.keys(v)) out[map[k] ?? k] = renameKeys((v as any)[k], map);
    return out;
  }
  return v;
}

function encodeState(state: UrlEditorState): string {
  const compact: any = {
    build: { ...state.build },
    skill: { ...state.skill },
    targetMode: state.targetMode,
    customTarget: state.customTarget,
    targetMods: state.targetMods,
  };
  delete compact.build.job_name;   // derivable from job_id (jobs list)
  delete compact.skill.max_level;  // re-synced from the skill DB on load
  // In monster mode the custom target is unused — reset it so it prunes away.
  if (compact.targetMode === "monster") compact.customTarget = DEFAULT_CUSTOM_TARGET;
  const pruned = pruneDefaults(compact, URL_STATE_DEFAULTS) ?? {};
  return "z3_" + LZString.compressToEncodedURIComponent(JSON.stringify(renameKeys(pruned, Z3_ENC)));
}

// The Mailbreaker debuff shipped named after one of the two skills that applies it.
// Links shared under `venom_dust` decode into the renamed field so they keep pricing
// the same +10%, and the stale key is dropped rather than left shadowing it.
function migrateTargetMods(state: any): any {
  const tm = state && state.targetMods;
  if (tm && typeof tm === "object" && "venom_dust" in tm) {
    if (tm.venom_dust && tm.mailbreaker == null) tm.mailbreaker = true;
    delete tm.venom_dust;
  }
  return state;
}

function decodeState(encoded: string): UrlEditorState | null {
  try {
    if (encoded.startsWith("z3_")) {
      const json = LZString.decompressFromEncodedURIComponent(encoded.slice(3));
      if (!json) return null;
      const defs = JSON.parse(JSON.stringify(URL_STATE_DEFAULTS));
      return migrateTargetMods(mergeDefaults(renameKeys(JSON.parse(json), Z3_DEC), defs)) as UrlEditorState;
    }
    if (encoded.startsWith("z2_")) {
      const json = LZString.decompressFromEncodedURIComponent(encoded.slice(3));
      if (!json) return null;
      // Fresh clone of the defaults so the returned state shares no references with them.
      const defs = JSON.parse(JSON.stringify(URL_STATE_DEFAULTS));
      return migrateTargetMods(mergeDefaults(JSON.parse(json), defs)) as UrlEditorState;
    }
    if (encoded.startsWith("z1_")) {
      const json = LZString.decompressFromEncodedURIComponent(encoded.slice(3));
      return json ? migrateTargetMods(JSON.parse(json)) : null;
    }
    return migrateTargetMods(JSON.parse(decodeURIComponent(escape(atob(encoded)))));
  } catch {
    return null;
  }
}

// Working-draft autosave (sessionStorage): keeps in-progress edits across a refresh
// even though the URL only changes on Save/Copy-link. Per-tab; cleared on tab close.
const DRAFT_KEY = "opscalc.draft";
const DEFAULT_URL_STATE: UrlEditorState = {
  build: DEFAULT_BUILD,
  skill: DEFAULT_SKILL,
  targetMode: "monster",
  customTarget: DEFAULT_CUSTOM_TARGET,
  targetMods: DEFAULT_TARGET_MODS,
};
// Encoding of the untouched default build — the "committed" baseline when there's no ?b param.
const DEFAULT_ENCODED = encodeState(DEFAULT_URL_STATE);

export default function BuildEditor() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialState = (() => {
    const param = searchParams.get("b");
    const urlState = param ? decodeState(param) : null;
    let draft: { state: UrlEditorState; sourceParam: string | null } | null = null;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) draft = JSON.parse(raw);
    } catch { /* ignore */ }
    // A shared link that differs from the draft's source wins (someone sent you a
    // fresh build — show theirs, not your old draft).
    if (param && (!draft || draft.sourceParam !== param)) return urlState;
    // Otherwise restore the working draft (refresh / continue editing).
    if (draft?.state) return draft.state;
    return urlState;
  })();

  const [data, setData] = useState<BuildData>(initialState?.build ?? DEFAULT_BUILD);
  const [skill, setSkill] = useState<SkillState>({ ...DEFAULT_SKILL, ...(initialState?.skill ?? {}) });
  const [targetMode, setTargetMode] = useState<TargetMode>(initialState?.targetMode ?? "monster");
  const [customTarget, setCustomTarget] = useState<CustomTarget>(initialState?.customTarget ?? DEFAULT_CUSTOM_TARGET);
  const [targetMods, setTargetMods] = useState<TargetMods>(initialState?.targetMods ?? DEFAULT_TARGET_MODS);

  // Short share links (/?s=<id>): resolve the id to the full "z3_…" payload, then
  // reload as /?b=<payload> so the entire existing decode/load path runs unchanged.
  const [shareError, setShareError] = useState("");
  useEffect(() => {
    const sid = searchParams.get("s");
    if (!sid || searchParams.get("b")) return;
    let cancelled = false;
    shareApi.resolve(sid)
      .then(({ b }) => {
        if (cancelled || !b) return;
        window.location.replace(`${window.location.origin}${window.location.pathname}?${new URLSearchParams({ b })}`);
      })
      .catch(() => {
        if (cancelled) return;
        setShareError("That shared build link couldn’t be found — it may have been mistyped.");
        setSearchParams({}, { replace: true });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which equipment slot groups are in wildcard (custom card mix) mode.
  // Auto-enable only for slots that have both wildcard data AND an item actually equipped there.
  const [wildcardMode, setWildcardMode] = useState<Record<string, boolean>>(() => {
    const slots = initialState?.build?.wildcard_slots ?? {};
    const equipped = initialState?.build?.equipped ?? {};
    const init: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(slots)) {
      if (!Array.isArray(v) || v.length === 0 || equipped[k] == null) continue;
      // Don't default to wildcard mode when the slot actually has real cards
      // selected — the wildcard_slots data is just stale from an earlier toggle.
      const hasRealCards = Object.keys(equipped).some(
        (ek) => ek.startsWith(`${k}_card`) && equipped[ek] != null,
      );
      if (!hasRealCards) init[k] = true;
    }
    return init;
  });

  const [jobs, setJobs] = useState<{ id: number; name: string }[]>([]);
  const [passiveSkills, setPassiveSkills] = useState<PassiveSkill[]>([]);
  const [plagiarism, setPlagiarism] = useState<{ jobs: number[]; skills: { name: string; display_name: string; max_level: number }[] }>({ jobs: [], skills: [] });
  const [itemCache, setItemCache] = useState<Record<number, EquippedItemInfo>>({});
  const [mobInfo, setMobInfo] = useState<{
    name: string; level: number; race?: string;
    hp?: number; def_?: number; mdef?: number; atk_min?: number; atk_max?: number;
    size?: string; element?: number; element_level?: number; is_boss?: boolean;
    stats?: { str: number; agi: number; vit: number; int: number; dex: number; luk: number };
    skills?: { id: number; name: string; d: string; lv: number; rate: number; target: string; ele: number | null; dmg?: boolean }[];
  } | null>(null);
  const [jobBonusStats, setJobBonusStats] = useState<Record<string, number>>({ str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0 });
  const [equipBonusStats, setEquipBonusStats] = useState<Record<string, number>>({ str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0 });
  const [buffBonusStats, setBuffBonusStats] = useState<Record<string, number>>({ str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0 });
  const [charStatus, setCharStatus] = useState<any>(null);

  // Slots whose equipped item's job[] list doesn't include the current job_id.
  // Derived — no extra state. Assumes valid when item not yet in cache.
  const invalidSlots = useMemo(() => {
    const invalid = new Set<string>();
    // Super Novice (23) equips Novice-flagged (0) gear via its base-class
    // mask, plus PS custom gear that lists 23 explicitly (same rule as
    // canEquip / the item picker).
    const jobMatch = (job: number[]) =>
      job.includes(data.job_id) || (data.job_id === 23 && job.includes(0));
    for (const slot of EQUIP_SLOTS) {
      if (slot.itemType === "IT_AMMO") continue; // ammo restrictions enforced by search filter only
      const equippedId = data.equipped[slot.key] as number | null | undefined;
      if (equippedId == null) continue;
      const item = itemCache[equippedId];
      if (!item?.job || item.job.length === 0) continue;
      if (!jobMatch(item.job)) invalid.add(slot.key);
    }
    return invalid;
  }, [data.equipped, data.job_id, itemCache]);

  // Build sent to the backend — same as `data` but with invalid slots nulled out
  // so they don't affect gear bonus badges or the damage calculation.
  const sanitizedBuild = useMemo(() => {
    if (invalidSlots.size === 0) return data;
    const equipped = { ...data.equipped };
    for (const slotKey of invalidSlots) {
      equipped[slotKey] = null;
      for (let i = 1; i <= 4; i++) delete equipped[`${slotKey}_card${i}`];
    }
    return { ...data, equipped };
  }, [data, invalidSlots]);

  // Payload for the on-demand Breakpoints readout: current build + selected skill
  // (for cast breakpoints) + target (for hit breakpoints).
  const breakpointPayload = useMemo(() => ({
    build: sanitizedBuild,
    skill: { id: skill.id, level: skill.level },
    target: targetMode === "monster" ? { mob_id: data.target_mob_id } : customTarget,
  }), [sanitizedBuild, skill.id, skill.level, targetMode, data.target_mob_id, customTarget]);

  // Signum Crucis only works on Undead and Demon targets.
  // Rust-Worn Apparatus (81012): "[Base INT >= 70] Freezing Trap applies Slow instead
  // of Freeze." The engine has no link between a trap and the Frozen target status —
  // Frozen is a manual toggle — so a Hunter who ticks it INTENDING to freeze with
  // Freezing Trap would be pricing a state this build cannot produce, and Frozen is
  // worth a lot (element forced to Water, hard DEF halved, auto-hit). Warn rather
  // than block: the target can still be frozen by something else entirely, a party
  // Wizard's Frost Diver among them.
  const RUST_WORN_APPARATUS = 81012;
  const freezingTrapCantFreeze = useMemo(() => {
    const wearing = Object.values(data.equipped || {}).some((v) => Number(v) === RUST_WORN_APPARATUS);
    return wearing && (Number(data.base_stats?.int) || 0) >= 70;
  }, [data.equipped, data.base_stats]);

  const signumApplicable = useMemo(() => {
    // Signum Crucis affects Undead-ELEMENT (idx 9) or Demon-RACE targets.
    if (targetMode === "custom") {
      return customTarget.element === 9 || customTarget.race === "Demon";
    }
    // Monster mode: allow if no mob selected yet (unknown), else check element/race.
    return !data.target_mob_id || mobInfo?.element === 9 || mobInfo?.race === "Demon";
  }, [targetMode, customTarget.element, customTarget.race, data.target_mob_id, mobInfo?.element, mobInfo?.race]);

  // Offensive Blessing debuffs Undead-ELEMENT, Undead-race and Demon-race targets —
  // Hercules' `undead_flag || race == RC_DEMON`. Same shape as signumApplicable, but
  // Signum's own predicate deliberately omits the Undead race, so they aren't shared.
  const offensiveBlessingApplies = useMemo(() => {
    const undeadOrDemon = (element?: number, race?: string) =>
      element === 9 || race === "Demon" || race === "Undead";
    if (targetMode === "custom") return undeadOrDemon(customTarget.element, customTarget.race);
    return !data.target_mob_id || undeadOrDemon(mobInfo?.element, mobInfo?.race);
  }, [targetMode, customTarget.element, customTarget.race, data.target_mob_id, mobInfo?.element, mobInfo?.race]);

  // Quagmire level (0–5). Tolerant of the legacy boolean shape from older shared URLs (true → max 5).
  const quagmireLv = (targetMods.quagmire as unknown) === true ? 5 : (Number(targetMods.quagmire) || 0);
  // Provoke level (0–10). Legacy boolean from older shared URLs maps true → max 10.
  const provokeLv = (targetMods.provoke as unknown) === true ? 10 : (Number(targetMods.provoke) || 0);
  // Burning stacks (0–5). Absent in shared URLs made before Burning existed.
  const burningStacks = Math.max(0, Math.min(5, Number(targetMods.burning) || 0));

  // Cards whose PS clause lets THIS build inflict one of the target statuses below
  // with Hammerfall. The engine prices a single attack, so it can't sequence "cast
  // Hammerfall, then hit the blinded target" — what it can do is point out that the
  // status is yours to apply, and let you tick it to price the follow-up hits.
  const hammerfallStatusCards = useMemo(() => {
    const equippedCardIds = new Set(
      Object.entries(data.equipped)
        .filter(([k]) => /_card\d$/.test(k))
        .map(([, v]) => Number(v)),
    );
    return HAMMERFALL_STATUS_CARDS.filter((c) => equippedCardIds.has(c.id));
  }, [data.equipped]);

  // FLEE needed to dodge the selected monster 95% of the time. Incoming hit% =
  // 80 + mobHIT − FLEE, floored at 5% (→ 95% is the dodge ceiling), and a mob's
  // HIT = base level + DEX. So min FLEE = mobHIT + 75. Soft-flee only (Perfect
  // Dodge is separate; FLEE also drops when several mobs target you at once).
  const mobDodgeFlee = mobInfo?.stats ? mobInfo.level + mobInfo.stats.dex + 75 : null;

  // The mob's own soft FLEE (level + AGI). Quagmire cuts AGI by 10%/lv (boss-immune),
  // which lowers flee by the same amount — computed live so the Target panel shows the
  // drop even before recalculating. Matches the backend's Quagmire math.
  const mobBaseFlee = mobInfo?.stats ? mobInfo.level + mobInfo.stats.agi : null;
  const mobEffFlee = (mobBaseFlee != null && quagmireLv > 0 && !mobInfo?.is_boss)
    ? mobBaseFlee - Math.floor((mobInfo!.stats!.agi * 10 * quagmireLv) / 100)
    : mobBaseFlee;

  // HIT needed to land every attack on the selected monster. Your hit% =
  // 80 + HIT − mobFLEE (hitChance.js), so 100% is reached at mobFLEE + 20.
  // Uses the Quagmire-reduced flee when active, same as the Flee card.
  const mobBaseHit100 = mobBaseFlee != null ? mobBaseFlee + 20 : null;
  const mobHit100 = mobEffFlee != null ? mobEffFlee + 20 : null;

  const totalStatPoints = useMemo(
    () => getTotalStatPoints(data.base_level, data.job_id),
    [data.base_level, data.job_id],
  );
  const remainingStatPoints = useMemo(
    () => totalStatPoints
        - STATS.reduce((sum, s) => sum + (STAT_COST_TABLE[data.base_stats[s] ?? 1] ?? 0), 0),
    [data.base_stats, totalStatPoints],
  );

  const [calcResult, setCalcResult] = useState<any>(null);

  // Build-vs-build comparison: pinned snapshots of computed builds.
  const [pins, setPins] = useState<ComparePin[]>([]);
  const pinSeq = useRef(0);
  const [loadTick, setLoadTick] = useState(0);
  const handlePin = useCallback(() => {
    if (!calcResult) return;
    const m = summaryMetrics(calcResult);
    if (!m) return;
    setPins((prev) => {
      const name = data.name?.trim() || `Build ${prev.length + 1}`;
      const snapshot = JSON.parse(JSON.stringify({ data, skill, targetMode, customTarget, targetMods }));
      return [...prev, { id: `pin-${pinSeq.current++}`, name, metrics: m, snapshot }];
    });
    statsApi.trackFeature("compare_pin");
  }, [calcResult, data, skill, targetMode, customTarget, targetMods]);
  const handleRemovePin = useCallback((id: string) => setPins((prev) => prev.filter((p) => p.id !== id)), []);
  const handleClearPins = useCallback(() => setPins([]), []);
  const handleLoadPin = useCallback((pin: ComparePin) => {
    const s = pin.snapshot as { data: BuildData; skill: SkillState; targetMode: TargetMode; customTarget: CustomTarget; targetMods: TargetMods };
    setData(s.data);
    setSkill(s.skill);
    setTargetMode(s.targetMode);
    setCustomTarget(s.customTarget);
    setTargetMods(s.targetMods);
    setLoadTick((t) => t + 1); // triggers a recompute so the loaded build's numbers show as Current
  }, []);
  // Recompute after a pinned build is loaded (state has settled by the time this runs).
  useEffect(() => {
    if (loadTick > 0) onCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTick]);

  // Quagmire can't raise hit past the 100% cap — flag it as redundant if the last
  // calc already shows 100% hit, so the Target panel can say so.
  const quagmireRedundant = quagmireLv > 0
    && !!calcResult?.normal_attack?.result
    && calcResult.normal_attack.result.hit_chance >= 100;
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState("");
  const [forceProcs, setForceProcs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [savedBuildsOpen, setSavedBuildsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const handleImported = useCallback((imported: any) => {
    statsApi.trackFeature("jaludev_import");
    setData((prev) => ({ ...DEFAULT_BUILD, ...imported, server: prev.server }));
    setSkill(DEFAULT_SKILL);
    setTargetMode("monster");
    setCustomTarget(DEFAULT_CUSTOM_TARGET);
    setTargetMods(DEFAULT_TARGET_MODS);
    setCalcResult(null);
    setResultsOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const applyTemplate = useCallback((t: BuildTemplate) => {
    setData((prev) => {
      const job = jobs.find((j) => j.id === t.job_id);
      return {
        ...DEFAULT_BUILD,
        server: prev.server,
        target_mob_id: prev.target_mob_id,
        name: t.label,
        job_id: t.job_id,
        job_name: job?.name ?? "",
        base_level: t.base_level,
        job_level: t.job_level,
        base_stats: { ...t.base_stats },
        support_buffs: { ...(t.support_buffs ?? {}) },
      };
    });
    setSkill(t.skill);
    setTemplateHint(t);
    statsApi.trackFeature("template_load");
  }, [jobs]);

  // Deep-link from a guide page: ?t=<slug> auto-loads that template (unless a
  // shared build ?b is present, which wins). The param is stripped afterward so
  // a refresh or edit doesn't reapply it. Runs once on mount.
  const guideDeepLinkApplied = useRef(false);
  useEffect(() => {
    if (guideDeepLinkApplied.current) return;
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("t");
    if (!slug || params.get("b")) return;
    const label = GUIDE_SLUG_TO_LABEL[slug];
    const tpl = label ? BUILD_TEMPLATES.find((x) => x.label === label) : undefined;
    if (!tpl) return;
    guideDeepLinkApplied.current = true;
    applyTemplate(tpl);
    params.delete("t");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
  }, [applyTemplate]);

  const [resultsOpen, setResultsOpen] = useState(false);
  const resultsPanelRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    (localStorage.getItem("theme") as "dark" | "light") || "dark"
  );
  const [themeHintSeen, setThemeHintSeen] = useState(() => localStorage.getItem("themeHintSeen") === "1");
  // Features banner: expanded by default (collapsed only if the user explicitly collapsed it).
  const [featuresBannerCollapsed, setFeaturesBannerCollapsed] = useState(() => localStorage.getItem("featuresBannerCollapsed") === "1");
  // The per-class PS rework detail is collapsed under the "class reworks" feature line.
  const [classReworksOpen, setClassReworksOpen] = useState(false);
  // Manual stat bonuses: a niche override, collapsed by default (remembers the user's choice).
  const [manualStatsOpen, setManualStatsOpen] = useState(() => localStorage.getItem("manualStatsOpen") === "1");
  // Collapse the per-source stat bonus badges (+job +gear +buff +manual) into a
  // single summed "+N" per stat. Persisted; also tidies the stat cards.
  const [collapseStatBonuses, setCollapseStatBonuses] = useState(() => localStorage.getItem("collapseStatBonuses") === "1");
  // The most recently loaded starter template (for the note/wiki-link hint).
  const [templateHint, setTemplateHint] = useState<BuildTemplate | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => { api.listJobs().then(setJobs).catch(() => {}); }, []);

  // Keep skill.max_level in sync whenever the selected skill changes
  useEffect(() => {
    if (skill.id === 0) return;
    api.getSkillById(skill.id, data.server)
      .then((s) => {
        const cap = s.max_level ?? 10;
        setSkill((prev) => ({
          ...prev,
          max_level: cap,
          level: Math.max(1, Math.min(cap, prev.level)),
        }));
      })
      .catch(() => {});
  }, [skill.id, data.server]);

  // The URL only reflects the build on an explicit Save or Copy-share-link (see
  // writeStateToUrl below) — not on every edit — so the address bar stays stable
  // while you tweak a build.
  function writeStateToUrl(buildOverride?: Partial<BuildData>): string {
    const state: UrlEditorState = {
      build: buildOverride ? { ...data, ...buildOverride } : data,
      skill, targetMode, customTarget, targetMods,
    };
    const b = encodeState(state);
    setSearchParams({ b }, { replace: true });
    return `${window.location.origin}${window.location.pathname}?${new URLSearchParams({ b })}`;
  }

  // Autosave the working state to sessionStorage (debounced) so a refresh keeps
  // in-progress edits. Tagged with the current ?b param so a freshly-opened shared
  // link isn't overridden by an old draft (see initialState resolution above).
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state: UrlEditorState = { build: data, skill, targetMode, customTarget, targetMods };
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ state, sourceParam: searchParams.get("b") }));
      } catch { /* storage full / disabled — ignore */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [data, skill, targetMode, customTarget, targetMods, searchParams]);

  // Whether the working state differs from what's committed to the URL (the last
  // Save/Copy-link), or from the untouched default when there's no ?b param.
  const hasUnsavedChanges = useMemo(() => {
    // Normalise the committed param through decode→encode so an older-format link
    // (z2_/legacy) compares equal to the current (z3_) re-encode when nothing changed.
    const raw = searchParams.get("b");
    const decoded = raw ? decodeState(raw) : null;
    const committed = decoded ? encodeState(decoded) : DEFAULT_ENCODED;
    return encodeState({ build: data, skill, targetMode, customTarget, targetMods }) !== committed;
  }, [data, skill, targetMode, customTarget, targetMods, searchParams]);

  // Resolve names for already-equipped items
  useEffect(() => {
    const ids = Object.values(data.equipped).filter((v): v is number => v != null);
    ids.forEach((itemId) => {
      if (itemCache[itemId]) return;
      api.getItem(itemId, data.server)
        .then((item) => setItemCache((prev) => ({ ...prev, [itemId]: item })))
        .catch(() => {});
    });
  }, [data.equipped, data.server]);

  // Fetch passive skills when job (or server, since PS retunes some
  // max levels/names vs vanilla -- e.g. Advanced Book) changes
  useEffect(() => {
    if (!data.job_id) { setPassiveSkills([]); return; }
    // NB: mastery_levels is deliberately NOT pruned against this list on a job
    // change. Levels left over from a previously selected job ARE a real bug (a
    // stale Martial Arts Lv10 was adding +20 FLEE to an Assassin), but the picker
    // only lists damage-relevant passives — several masteries the engine reads
    // (MC_MAMMONITE, PS_BS_ZENYPINCHER, BS_SKINTEMPER, AL_DP, WZ_ESTIMATION…) never
    // appear here, so pruning to this list would delete legitimate levels. The
    // backend strips them against the job's full skill tree instead
    // (dataLoader.filterMasteryLevelsForJob), which also repairs existing share URLs.
    api.getJobPassives(data.job_id, data.server).then(setPassiveSkills).catch(() => setPassiveSkills([]));
  }, [data.job_id, data.server]);

  // Plagiarism (Rogue/Stalker): the copyable-skill list and the jobs that get the
  // slot both come from the server profile, so the wiki's list lives in one place.
  useEffect(() => {
    api.getPlagiarism(data.server).then(setPlagiarism).catch(() => setPlagiarism({ jobs: [], skills: [] }));
  }, [data.server]);

  // Per-job-level STR/AGI/VIT/INT/DEX/LUK bonus (e.g. Knight +1 STR every
  // few job levels) -- statusCalculator.js already folds this into the
  // damage calc server-side; fetched here purely to surface it next to the
  // base stat inputs instead of it only ever showing up invisibly in the
  // final numbers.
  useEffect(() => {
    if (!data.job_id) { setJobBonusStats({ str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0 }); return; }
    api.getJobBonusStats(data.job_id, data.job_level, data.server)
      .then(setJobBonusStats)
      .catch(() => setJobBonusStats({ str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0 }));
  }, [data.job_id, data.job_level, data.server]);

  // Equipment stat bonuses (bStr, bAgi, etc. from item scripts) -- debounced
  // so rapid equip/unequip changes don't flood the endpoint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const zero = { str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0 };
    const hasEquipped = Object.values(data.equipped).some((v) => v != null);
    if (!hasEquipped) { setEquipBonusStats(zero); return; }
    const timer = setTimeout(() => {
      api.getGearStatBonuses(sanitizedBuild).then(setEquipBonusStats).catch(() => setEquipBonusStats(zero));
    }, 300);
    return () => clearTimeout(timer);
  // JSON.stringify lets us deep-compare the objects that actually drive gear scripts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sanitizedBuild.equipped), JSON.stringify(data.refine), data.server,
      JSON.stringify(data.base_stats), data.job_id, data.job_level, data.base_level,
      JSON.stringify(data.bonus_stats), data.selected_pet]);

  useEffect(() => {
    const base = data.base_stats;
    // Box of Gloom casts Improve Concentration Lv1 (SC_CONCENTRATION), which the
    // backend injects — mirror it here so the AGI/DEX stat readout reflects it too
    // (without it the box's +3% AGI/DEX never showed in the display).
    const activeSc = data.consumable_buffs?.box_gloom
      ? { ...(data.active_buffs || {}), SC_CONCENTRATION: Math.max(1, Number((data.active_buffs || {}).SC_CONCENTRATION) || 0) }
      : (data.active_buffs || {});
    // SN never-died bonus (+10 all stats at job 70+) — mirror of statusCalculator.js
    // so the stat readout reflects it (damage/`/status` already do).
    const snNeverDied = data.job_id === 23 && !!data.flags?.sn_never_died && data.job_level >= 70 ? 10 : 0;
    setBuffBonusStats(computeBuffStatBonuses(
      (data.support_buffs || {}) as Record<string, unknown>,
      activeSc as Record<string, unknown>,
      {
        // Improve Concentration's base: base + job + gear, but MINUS the AGI/DEX it
        // must not scale (cards + card combos + pets = ic_excluded, from the engine's
        // from_cards pool). Keeps the display's IC in step with the damage engine.
        agi: (base.agi ?? 1) + (jobBonusStats.agi ?? 0) + (equipBonusStats.agi ?? 0) - (equipBonusStats.ic_excluded_agi ?? 0),
        dex: (base.dex ?? 1) + (jobBonusStats.dex ?? 0) + (equipBonusStats.dex ?? 0) - (equipBonusStats.ic_excluded_dex ?? 0),
      },
      (data.mastery_levels || {}) as Record<string, unknown>,
      data.clan ?? "",
      snNeverDied,
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data.support_buffs), JSON.stringify(data.active_buffs),
      JSON.stringify(data.mastery_levels), data.clan, data.consumable_buffs?.box_gloom,
      data.base_stats.agi, data.base_stats.dex, jobBonusStats, equipBonusStats,
      data.job_id, data.job_level, data.flags?.sn_never_died]);

  // Secondary status panel (Max HP/SP, regen, ATK, MATK, DEF, MDEF, ASPD, Crit)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = setTimeout(() => {
      api.getCharacterStatus(sanitizedBuild)
        .then(setCharStatus)
        .catch(() => setCharStatus(null));
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(sanitizedBuild)]);

  // What that ASPD number actually buys you, as a hover note on the ASPD stat card.
  // A normal attack lands every attack-delay = 2 × (2000 − ASPD×10) ms, i.e.
  // 50 ÷ (200 − ASPD) per second — the same figure the damage panel derives from
  // the result's period_ms. ASPD is capped at 190, so the divisor can't reach 0.
  const aspdDelayMs = charStatus?.aspd != null && charStatus.aspd < 200
    ? 2 * Math.max(100, Math.round(2000 - charStatus.aspd * 10))
    : null;

  // Hiding a self-buff from the panel on job change isn't enough on its own --
  // a stale value left in active_buffs from a previous job would still be
  // sent to the backend and silently applied. Strip anything that doesn't
  // belong to the now-selected job. Party buffs/songs are never filtered by
  // job (they come from other players), so they're left untouched here.
  useEffect(() => {
    setData((prev) => {
      const allSelfKeys: readonly string[] = SELF_BUFFS.map((b) => b.key);
      const keepSelf = new Set<string>(SELF_BUFFS.filter((b) => (b.jobs as readonly number[]).includes(prev.job_id)).map((b) => b.key));
      const prevActive = prev.active_buffs || {};
      const nextActive: Record<string, number> = {};
      for (const [k, v] of Object.entries(prevActive)) {
        if (!allSelfKeys.includes(k) || keepSelf.has(k)) nextActive[k] = v;
      }
      if (Object.keys(nextActive).length === Object.keys(prevActive).length) return prev;
      return { ...prev, active_buffs: nextActive };
    });
  }, [data.job_id]);

  // Same reasoning for the party buffs this job supersedes with a self-cast entry
  // (see partyBuffSupersededBySelf): hiding the checkbox isn't enough, since a
  // value left in support_buffs -- from a previous job, or from a build shared
  // before this rule existed -- would still be sent to the backend and applied,
  // with no control on screen showing it. Dropped rather than migrated to the
  // self key: the self-cast magnitude is the larger one, and silently raising a
  // shared build's numbers is worse than making the owner re-tick a control that
  // is now unambiguous.
  useEffect(() => {
    setData((prev) => {
      const prevSupport = (prev.support_buffs || {}) as Record<string, number>;
      const nextSupport: Record<string, number> = {};
      for (const [k, v] of Object.entries(prevSupport)) {
        if (!partyBuffSupersededBySelf(k, prev.job_id)) nextSupport[k] = v;
      }
      if (Object.keys(nextSupport).length === Object.keys(prevSupport).length) return prev;
      return { ...prev, support_buffs: nextSupport };
    });
  }, [data.job_id]);

  // Clear ASPD potion if the new job can't use the currently selected one.
  useEffect(() => {
    setData((prev) => {
      const cap = aspdPotionCap(prev.job_id);
      const current = (prev.consumable_buffs?.aspd_potion as number) ?? 0;
      if (current <= cap) return prev;
      const next = { ...(prev.consumable_buffs || {}) } as Record<string, unknown>;
      delete next.aspd_potion;
      return { ...prev, consumable_buffs: next };
    });
  }, [data.job_id]);

  // Resolve mob display info
  useEffect(() => {
    if (!data.target_mob_id) { setMobInfo(null); return; }
    fetch(`/api/data/mobs/${data.target_mob_id}?server=${data.server}`)
      .then((r) => r.json())
      .then(setMobInfo)
      .catch(() => setMobInfo(null));
  }, [data.target_mob_id, data.server]);

  // Same for offensive Blessing — it only debuffs Undead/Demon, so a toggle left on
  // after switching to, say, a Formless target would sit there looking active while
  // the engine ignored it.
  useEffect(() => {
    if (!offensiveBlessingApplies) {
      setTargetMods((m) => m.offensive_blessing ? { ...m, offensive_blessing: false } : m);
    }
  }, [offensiveBlessingApplies]);

  // Auto-clear Signum Crucis when the target changes to a non-applicable race.
  useEffect(() => {
    if (!signumApplicable) {
      setTargetMods((m) => m.signum_crucis ? { ...m, signum_crucis: false } : m);
    }
  }, [signumApplicable]);

  const updateField = useCallback((path: string[], value: unknown) => {
    setData((prev) => {
      const next = structuredClone(prev) as any;
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = value;
      return next;
    });
  }, []);

  // Forge properties for a weapon slot. A forged weapon has NO usable card slots —
  // the forge writes the crafter's signature (and the crumb/element data) into them
  // — so turning any forge property on clears whatever was slotted there, real cards
  // and wildcard mix alike. The backend enforces the same rule for shared builds.
  const setForge = useCallback((slotKey: string, patch: { sc?: number; ranked?: boolean; ele?: number }) => {
    setData((prev) => {
      const forge = { ...(prev.forge || {}) };
      const next = { sc: 0, ranked: false, ele: 0, ...(forge[slotKey] || {}), ...patch };
      forge[slotKey] = next;
      const forged = next.sc > 0 || next.ranked || (next.ele ?? 0) > 0;
      if (!forged) return { ...prev, forge };
      const equipped = { ...prev.equipped };
      for (let i = 1; i <= 4; i++) delete equipped[`${slotKey}_card${i}`];
      const wildcard_slots = { ...(prev.wildcard_slots || {}) };
      delete wildcard_slots[slotKey];
      return { ...prev, forge, equipped, wildcard_slots };
    });
  }, []);

  const updateWildcardSlot = useCallback((slotKey: string, idx: number, patch: Partial<WildcardSlot>) => {
    setData((prev) => {
      const existing = (prev.wildcard_slots?.[slotKey] || [])[idx] ?? { type: "race" as const, bonus: 20 };
      const next: WildcardSlot = { ...existing, ...patch };
      if (patch.type && patch.type !== existing.type) {
        next.bonus = WILDCARD_DEFAULT_BONUS[patch.type];
      }
      const slots = [...(prev.wildcard_slots?.[slotKey] || [])];
      slots[idx] = next;
      return { ...prev, wildcard_slots: { ...(prev.wildcard_slots || {}), [slotKey]: slots } };
    });
  }, []);

  const updateConsumable = useCallback((key: keyof ConsumableBuffs, value: number | boolean | undefined) => {
    setData((prev) => {
      const next = { ...(prev.consumable_buffs || {}) } as any;
      if (value === undefined || value === 0 || value === false) delete next[key];
      else next[key] = value;
      return { ...prev, consumable_buffs: next };
    });
  }, []);

  const updateBuffField = useCallback((group: "active_buffs" | "song_state" | "support_buffs", key: string, level: number) => {
    setData((prev) => {
      const next: Record<string, unknown> = { ...((prev[group] as Record<string, unknown>) || {}) };
      if (level <= 0) delete next[key];
      else next[key] = level;
      // Barrage and Run and Gun replace one another (Gunslinger PDF), so turning
      // one on turns the other off. Done here, in the one toggle path, rather than
      // at the call site, so it holds however the buff is set.
      if (level > 0 && group === "active_buffs" && GS_EXCLUSIVE_BUFFS[key]) {
        delete next[GS_EXCLUSIVE_BUFFS[key]];
      }
      return { ...prev, [group]: next };
    });
  }, []);

  // Sage's three ground spells (Volcano/Deluge/Violent Gale) share one
  // mutually-exclusive slot (support_buffs.ground_effect + ..._lv) -- you
  // can only stand in one at a time. All three also affect damage: Volcano
  // directly (+ATK/+MATK), and all three via attrFix.js's elemental
  // "enchant" bonus when your weapon's element matches the ground effect's.
  const updateGroundEffect = useCallback((type: string, level: number) => {
    setData((prev) => {
      const next: Record<string, unknown> = { ...(prev.support_buffs || {}) };
      if (!type || level <= 0) {
        delete next.ground_effect;
        delete next.ground_effect_lv;
      } else {
        next.ground_effect = type;
        next.ground_effect_lv = level;
      }
      return { ...prev, support_buffs: next };
    });
  }, []);

  // Sage Auto Spell / "Hindsight" (support_buffs.auto_spell_lv). The activated
  // level selects exactly one autocast spell (see AUTO_SPELL_OPTIONS); the engine
  // fires it at a flat 30% on every physical attack and surfaces the per-proc
  // damage as a proc branch. Lv0/"" = off.
  const updateAutoSpell = useCallback((level: number) => {
    setData((prev) => {
      const next: Record<string, unknown> = { ...(prev.support_buffs || {}) };
      if (level > 0) next.auto_spell_lv = level;
      else delete next.auto_spell_lv;
      return { ...prev, support_buffs: next };
    });
  }, []);

  // Priest weapon endow -- also a single mutually-exclusive slot
  // (support_buffs.weapon_endow_sc, or the boolean SC_ASPERSIO for Holy).
  const updateWeaponEndow = useCallback((value: string) => {
    setData((prev) => {
      const next: Record<string, unknown> = { ...(prev.support_buffs || {}) };
      delete next.weapon_endow_sc;
      delete next.SC_ASPERSIO;
      if (value === "SC_ASPERSIO") next.SC_ASPERSIO = true;
      else if (value) next.weapon_endow_sc = value;
      return { ...prev, support_buffs: next };
    });
  }, []);

  async function onCalculate(fpOverride?: boolean) {
    const fp = fpOverride !== undefined ? fpOverride : forceProcs;
    setCalculating(true);
    setCalcError("");
    setResultsOpen(true);
    try {
      const target = targetMode === "monster"
        ? { mob_id: data.target_mob_id }
        : customTarget;
      // Aggregate wildcard slot bonuses and strip real card entries for those slots.
      // The rendered wildcard rows track the equipped weapon's live card-slot
      // count (item.slots, from the async itemCache), but the stored
      // wildcard_slots array lags behind after a weapon switch -- it can be
      // shorter (extra rows show unsaved ?? defaults) or longer (stale rows from
      // the previous weapon). Iterate the weapon's actual slot count with the
      // same fallback default the UI uses (see the wildcard-slots render) so the
      // pipeline applies exactly what's on screen, not the drifted stored array.
      const WILDCARD_DEFAULT: WildcardSlot = { type: "race", bonus: 20 };
      const wildcardBonuses: Record<string, number> = {};
      const equippedOverride = { ...sanitizedBuild.equipped };
      for (const [slotKey, active] of Object.entries(wildcardMode)) {
        if (!active) continue;
        const equippedId = equippedOverride[slotKey];
        if (equippedId == null) continue; // slot is empty — skip
        for (let i = 1; i <= 4; i++) delete equippedOverride[`${slotKey}_card${i}`];
        const stored = data.wildcard_slots?.[slotKey] || [];
        // Weapon's real slot count; fall back to the stored length ONLY while the
        // item's data hasn't reached the cache yet, so nothing is dropped mid-switch.
        // This used to be `(cached?.slots ?? 0) || stored.length`, which could not
        // tell "not loaded yet" from "loaded, and it genuinely has zero slots": an
        // unslotted weapon has slots === 0, which is falsy, so `||` fell through to
        // the stale rows from the PREVIOUS weapon and kept applying its wildcards.
        // Presence in the cache is the real signal, so test that instead.
        const cached = itemCache[equippedId];
        const slotCount = cached ? (cached.slots ?? 0) : stored.length;
        for (let i = 0; i < slotCount; i++) {
          const ws = stored[i] ?? WILDCARD_DEFAULT;
          const key = ws.type === "race" ? "RC_All" : ws.type === "size" ? "Size_All" : ws.type === "family" ? "Type_All" : "Ele_All";
          wildcardBonuses[key] = (wildcardBonuses[key] || 0) + ws.bonus;
          if (ws.type === "size") wildcardBonuses["_batk"] = (wildcardBonuses["_batk"] || 0) + 5;
        }
      }
      const buildWithFlags = fp
        ? { ...sanitizedBuild, equipped: equippedOverride, flags: { ...(sanitizedBuild.flags || {}), force_procs: true }, wildcard_bonuses: wildcardBonuses }
        : { ...sanitizedBuild, equipped: equippedOverride, wildcard_bonuses: wildcardBonuses };
      const normalPayload = { build: buildWithFlags, skill: { id: 0, level: 1 }, target, target_mods: targetMods };
      const skillPayload  = { build: buildWithFlags, skill: { id: skill.id, level: skill.level }, target, target_mods: targetMods };
      // Survivability: how hard the selected monster's weapon attacks hit YOU. Monster
      // mode only. A monster's BASIC melee attack is Neutral element — NOT its property
      // (its "Element" field is defensive only; Hercules keeps attack `rhw.ele` and
      // `def_ele` separate, which is why Raydric/Ghostring tank most monsters). So the
      // basic hit is Neutral (and reduced by Raydric etc.); elemental NPC_*ATTACK skills
      // add their own elements on top. Compute one incoming hit per distinct element.
      // Other cast skills (bolts, AoE, ailments) are listed by name only.
      const mobId = targetMode === "monster" ? data.target_mob_id : null;
      const mobSkills = mobInfo?.skills ?? [];
      const attackEles = mobId != null
        ? Array.from(new Set<number>([0 /* Neutral basic melee */, ...mobSkills.filter((s) => s.ele != null).map((s) => s.ele as number)])).slice(0, 5)
        : [];
      const [normalRes, skillRes, ...incByEle] = await Promise.all([
        api.calculate(normalPayload),
        skill.id !== 0 ? api.calculate(skillPayload) : Promise.resolve(null),
        ...attackEles.map((ele) => api.calculateIncoming(buildWithFlags, mobId!, "physical", { ele_override: ele }, targetMods).catch(() => null)),
      ]);
      const elements = attackEles
        .map((ele, i) => ({ ele, taken: incByEle[i] }))
        .filter((x) => x.taken);
      setCalcResult({
        normal_attack: normalRes,
        skill: skillRes,
        selected_skill: { id: skill.id, level: skill.level, label: skill.label },
        target_hp: targetMode === "monster" ? (mobInfo?.hp ?? null) : null,
        incoming: elements.length ? {
          elements,
          // The mob's other cast skills (non-elemental-attack). Clickable in the UI:
          // picking one computes what it does to you (magic/physical), on demand.
          // Damage-dealing cast skills only (exclude the mob's buffs/summons/heals
          // and its elemental attacks, which are the element lines above).
          kit: mobSkills.filter((s) => s.ele == null && s.id != null && s.dmg).map((s) => ({ id: s.id, d: s.d, lv: s.lv })).slice(0, 16),
          mob_name: mobInfo?.name ?? null,
          // Take the monster's DEX from what the backend actually used, not from the
          // undebuffed mobInfo: offensive Blessing halves it, and HIT = level + DEX
          // drives the dodge chance shown next to these lines.
          mob_hit: (() => {
            const usedMob = (elements[0]?.taken as any)?.mob ?? mobInfo;
            return usedMob?.stats ? usedMob.level + usedMob.stats.dex : null;
          })(),
          mob_element: 0, // basic melee is Neutral (tags the Neutral line as "basic")
          build: buildWithFlags, // reused for on-demand "which skill hits me" fetches
          target_mods: targetMods,  // so those fetches see the same debuffs as these lines
          mob_id: mobId,
        } : null,
        // Poison ailment DoT: the target loses 2%/s of its Max HP on Payon Stories
        // (1%/s vanilla). Surfaced so time-to-kill folds it in. Monster mode only
        // (Max HP known); the DEF cut itself is applied server-side.
        poison_dot_per_sec: targetMode === "monster" && targetMods.element_status === "Poison" && mobInfo?.hp
          ? Math.floor(mobInfo.hp * (data.server === "payon_stories" ? 2 : 1) / 100)
          : null,
      });
    } catch (e: any) {
      setCalcError(e.message);
    } finally {
      setCalculating(false);
      setTimeout(() => resultsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }

  function handleToggleForceProcs() {
    const nextFP = !forceProcs;
    setForceProcs(nextFP);
    onCalculate(nextFP);
  }

  function onNewBuild() {
    if (!window.confirm("Start over? Any unsaved changes will be lost (save it first from Save / Load if you want to keep it).")) return;
    setData(DEFAULT_BUILD);
    setSkill(DEFAULT_SKILL);
    setTargetMode("monster");
    setCustomTarget(DEFAULT_CUSTOM_TARGET);
    setTargetMods(DEFAULT_TARGET_MODS);
    setCalcResult(null);
    setCalcError("");
    setResultsOpen(false);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setSearchParams({}, { replace: true }); // drop the ?b param so a refresh stays on the new build
  }

  function onLoadSavedState(state: UrlEditorState) {
    setData(state.build);
    setSkill({ ...DEFAULT_SKILL, ...state.skill });
    setTargetMode(state.targetMode);
    setCustomTarget(state.customTarget);
    setTargetMods(state.targetMods ?? DEFAULT_TARGET_MODS);
    setCalcResult(null);
    setCalcError("");
    setResultsOpen(false);
  }

  async function onCopyLink() {
    statsApi.trackFeature("share_link");
    const longUrl = writeStateToUrl(); // encode current state + reflect it in the address bar
    // Prefer a short /?s=<id> link (backend stores the payload). Fall back to the
    // self-contained long ?b= link if the shortener is unreachable.
    let url = longUrl;
    try {
      const b = new URL(longUrl).searchParams.get("b");
      if (b) {
        const { id } = await shareApi.create(b);
        url = `${window.location.origin}${window.location.pathname}?s=${id}`;
      }
    } catch { /* shortener unavailable — keep the long link */ }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  }

  const itemLabel = (it: any) => it.slots > 0 ? `${it.name}[${it.slots}]` : it.name;

  const canEquip = useCallback(
    (it: any) => {
      // Super Novice (23): vanilla items carry no SN bit (the game equips SN
      // via its Novice base mask → accept 0), but PS custom gear lists 23
      // explicitly — accept both. Mirrors the backend /data/items job filter.
      if (!Array.isArray(it.job) || it.job.length === 0) return true;
      if (it.job.includes(data.job_id)) return true;
      return data.job_id === 23 && it.job.includes(0);
    },
    [data.job_id],
  );

  const sortResults = (rows: SearchResult[]) =>
    rows.sort((a, b) => (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0));

  const itemSearch = useCallback(
    (itemType: string, loc?: string) => (query: string): Promise<SearchResult[]> => {
      const browse = !query.trim();
      const params: Record<string, unknown> = {
        type: itemType, ...(loc ? { loc } : {}), q: query, limit: browse ? 100 : 50, server: data.server,
        ...(browse ? { job: data.job_id } : {}),
      };
      return api.searchItems(params)
        .then((r) => sortResults(r.items.map((it: any) => ({
          id: it.id, label: itemLabel(it), sublabel: `#${it.id}`, disabled: !canEquip(it),
          // Forging is only offered for weapons on the blacksmith list, and that is
          // invisible until after you equip one. Surfacing it here saves picking a
          // weapon just to find out. Same marker on the off-hand search below.
          ...(FORGEABLE_WEAPON_IDS.has(it.id)
            ? { badge: "Forgeable", badgeTitle: "Can be Blacksmith-forged: Star Crumbs, an element, and a ranked bonus." }
            : {}),
        }))));
    },
    [data.server, data.job_id, canEquip],
  );

  const leftHandSearch = useCallback(
    (query: string): Promise<SearchResult[]> => {
      const browse = !query.trim();
      const jobParam = browse ? { job: data.job_id } : {};
      return Promise.all([
        api.searchItems({ type: "IT_ARMOR", loc: "EQP_SHIELD", q: query, limit: browse ? 100 : 50, server: data.server, ...jobParam }),
        api.searchItems({ type: "IT_WEAPON", q: query, limit: browse ? 100 : 50, server: data.server, ...jobParam }),
      ]).then(([shields, weapons]) => sortResults([
        ...shields.items.map((it: any) => ({ id: it.id, label: itemLabel(it), sublabel: `Shield #${it.id}`, disabled: !canEquip(it) })),
        ...weapons.items.map((it: any) => ({
          id: it.id, label: itemLabel(it), sublabel: `Weapon #${it.id}`, disabled: !canEquip(it),
          ...(FORGEABLE_WEAPON_IDS.has(it.id)
            ? { badge: "Forgeable", badgeTitle: "Can be Blacksmith-forged: Star Crumbs, an element, and a ranked bonus." }
            : {}),
        })),
      ]));
    },
    [data.server, data.job_id, canEquip],
  );

  const fetchItemTooltip = useCallback(
    (id: number): Promise<string | null> =>
      api.getItem(id, data.server).then((item: any) => {
        let desc: string = item.description || "";
        // Strip unidentified-item prefix that appears in vanilla pre-re descriptions
        desc = desc.replace(/^Unknown Item[^.\n]*\.\n?/i, "");
        // Convert HTML line breaks (PS item overrides use raw game-client HTML)
        desc = desc.replace(/<br\s*\/?>/gi, "\n");
        // Strip remaining HTML tags (e.g. <font color='...'> from PS descriptions)
        desc = desc.replace(/<[^>]+>/g, "");
        // Normalize game-client visual separator lines
        desc = desc.replace(/_\n/g, "\n").trim();
        return desc || null;
      }).catch(() => null),
    [data.server],
  );

  const mobSearch = useCallback(
    (query: string): Promise<SearchResult[]> =>
      api.searchMobs({ q: query, limit: 12, server: data.server })
        .then((r) => r.items.map((m: any) => ({ id: m.id, label: m.name, sublabel: `Lv${m.level}` }))),
    [data.server],
  );

  const skillSearch = useCallback(
    (query: string): Promise<SearchResult[]> =>
      api.searchSkills({ q: query, limit: 12, server: data.server, damage_only: "true" })
        .then((r) => r.items.map((s: any) => ({ id: s.id, label: s.display_name || s.name || `Skill ${s.id}`, sublabel: s.name, max_level: s.max_level ?? 10 }))),
    [data.server],
  );

  // Rank cap for the plagiarised skill: its PS max level (Triple Attack is 5 ranks
  // on PS, not 10). 0 when nothing is copied, which also disables the input.
  const plagiarizedMax =
    plagiarism.skills.find((s) => s.name === (data.flags?.plagiarism as any)?.name)?.max_level ?? 0;

  const currentEditorState: UrlEditorState = { build: data, skill, targetMode, customTarget, targetMods };

  return (
    <div className="app-shell">
      {shareError && (
        <div className="share-error" role="alert">
          {shareError}
          <button onClick={() => setShareError("")} aria-label="Dismiss">×</button>
        </div>
      )}
      <div className="topbar">
        <div className="topbar-left">
          <img className="brand-mark" src="/icon.svg" alt="Open PS Calc logo" width="26" height="26" />
          <span className="brand-title">Open PS Calc</span>
          <span className="topbar-info-icon">
            <InfoTooltip>
              <strong>Open PS Calc</strong>
              A pre-renewal Ragnarok Online damage calculator for vanilla
              and Payon Stories servers — equip gear, pick a skill and
              target, and see the full step-by-step damage breakdown.
              <span className="tooltip-row">
                <span>Based on</span>
                <a href="https://github.com/StatGameDev/Open_PS_Calc" target="_blank" rel="noreferrer">Open PS Calc</a>
              </span>
              <span className="tooltip-row">
                <span>This repo</span>
                <a href="https://github.com/ervinkleitz/WebOpenPSCalc" target="_blank" rel="noreferrer">WebOpenPSCalc</a>
              </span>
            </InfoTooltip>
          </span>
        </div>
        <div className="topbar-right">
          {/* Server select — always visible on tablet+, hidden on phones (shown in dropdown instead) */}
          <select
            className="topbar-server-select topbar-server-inline"
            value={data.server}
            onChange={(e) => updateField(["server"], e.target.value)}
            aria-label="Server"
          >
            <option value="payon_stories">Payon Stories</option>
            <option value="standard">Standard pre-renewal</option>
          </select>

          <div style={{ position: "relative" }}>
            <button
              className="ghost theme-toggle"
              onClick={() => {
                setTheme(t => t === "dark" ? "light" : "dark");
                if (!themeHintSeen) {
                  setThemeHintSeen(true);
                  localStorage.setItem("themeHintSeen", "1");
                }
              }}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            {!themeHintSeen && (
              <div className="theme-hint">{theme === "dark" ? "Try light mode" : "Try dark mode"}</div>
            )}
          </div>

          {/* Secondary actions — inline on desktop (>1100px), dropdown otherwise */}
          <div className={`topbar-secondary${menuOpen ? " topbar-secondary--open" : ""}`}>
            {/* Server select copy — shown only inside dropdown on phones */}
            <select
              className="topbar-server-select topbar-server-dropdown"
              value={data.server}
              onChange={(e) => { updateField(["server"], e.target.value); setMenuOpen(false); }}
              aria-label="Server"
            >
              <option value="payon_stories">Payon Stories</option>
              <option value="standard">Standard pre-renewal</option>
            </select>
            <button onClick={() => { setSavedBuildsOpen(true); setMenuOpen(false); }}>
              Save / Load{hasUnsavedChanges && <span className="unsaved-dot" title="You have unsaved changes — save or copy the share link to keep them">●</span>}
            </button>
            <button onClick={() => { setImportOpen(true); setMenuOpen(false); }}>Import</button>
            <button onClick={() => { onNewBuild(); setMenuOpen(false); }}>Start over</button>
            <button onClick={() => { statsApi.trackFeature("changelog_open"); setChangelogOpen(true); setMenuOpen(false); }}>Changelog</button>
            <button onClick={() => { onCopyLink(); setMenuOpen(false); }}>{copied ? "Copied!" : "Copy share link"}</button>
            <button type="button" className="topbar-kofi-btn" onClick={() => { statsApi.trackDonateClick("topbar"); setMenuOpen(false); setTipOpen(true); }}>🍵 Support the calc</button>
          </div>

          {/* Hamburger — hidden on desktop */}
          <button
            className="ghost topbar-hamburger"
            onClick={() => setMenuOpen(m => !m)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? "✕" : "☰"}
            {!menuOpen && hasUnsavedChanges && <span className="unsaved-dot" title="Unsaved changes">●</span>}
          </button>

          <button className="primary" onClick={() => onCalculate()} disabled={calculating}>
            {calculating ? "Calculating…" : "Calculate damage"}
          </button>
        </div>
        {menuOpen && <div className="topbar-backdrop" onClick={() => setMenuOpen(false)} />}
      </div>

      <div className="page">
        <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
        <KofiModal open={tipOpen} onClose={() => setTipOpen(false)} />
        <SavedBuildsModal
          open={savedBuildsOpen}
          onClose={() => setSavedBuildsOpen(false)}
          currentName={data.name}
          currentState={currentEditorState}
          onLoad={(state) => { statsApi.trackFeature("build_load"); onLoadSavedState(state); }}
          onSave={(name) => { statsApi.trackFeature("build_save"); setData((prev) => ({ ...prev, name })); writeStateToUrl({ name }); }}
        />
        <ImportJaludevModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          server={data.server}
          onImported={(build) => handleImported(build)}
        />
        {data.server === "payon_stories" && (
          <div className="reworks-banner">
            <button
              className="reworks-banner-toggle"
              onClick={() => {
                const next = !featuresBannerCollapsed;
                setFeaturesBannerCollapsed(next);
                localStorage.setItem("featuresBannerCollapsed", next ? "1" : "0");
              }}
              aria-expanded={!featuresBannerCollapsed}
              aria-label={featuresBannerCollapsed ? "Expand" : "Collapse"}
            >
              <strong>Features</strong>
              <span className="reworks-banner-chevron">{featuresBannerCollapsed ? "▸" : "▾"}</span>
            </button>
            {!featuresBannerCollapsed && (
              <ul>
                <li>Payon Stories custom equipment and skills — card, combo, and gear bonuses modeled from item scripts</li>
                <li>
                  <button
                    className="reworks-detail-toggle"
                    onClick={() => setClassReworksOpen((v) => !v)}
                    aria-expanded={classReworksOpen}
                  >
                    All PS class reworks modeled (Knight through Ninja)
                    <span className="reworks-detail-chevron">{classReworksOpen ? "▾" : "▸"}</span>
                  </button>
                  {classReworksOpen && (
                    <ul className="reworks-detail-list">
                      <li>Knight — Sword Quickening CRIT, Blade Mastery covers 1H Sword, Spear Stab max level 5</li>
                      <li>Crusader — Grand Cross (physical + magic summed, weapon masteries &amp; Demon Bane apply, ratio applied last), Holy Cross, Reflect Shield (VIT-quadratic formula), Spear Quicken (Hit/Flee)</li>
                      <li>Swordman — Magnum Break's lingering fire (+20% of a normal attack as Fire, bypasses DEF; 30% with Wootan Fighter Card), on auto-attacks and Magnum Break only</li>
                      <li>Merchant / Blacksmith — Mammonite (100+50×lv; Zeny Pincher 100+25×lv), Cart Revolution 5 ranks at 50×lv%, Tool Mastery +4 ATK/lv (Axe &amp; Mace), Crazy Uproar 4 ranks (+1 STR/VIT per level), Adrenaline Rush on all melee (30/20% Axe·Mace, 20/10% others), Over Thrust full party bonus, Smith Weapon skills at 4 ranks</li>
                      <li>Alchemist — Acid Terror (100+100×lv → 600%), Acid Demonstration (200+40×lv), Transmutation (+1% ASPD &amp; MATK per level with an Axe or Sword), Chemical Protections max rank 3</li>
                      <li>Assassin / Thief — dual-wield 3-hit model, Enchant Poison bonus, Katar second hit, Envenom element</li>
                      <li>Rogue — Backstab formula (200+30×lv, +40% opportunity bonus), Trick Arrow 2-hit 200%, Raid 600%, Vulture's Eye enables bow Double Attack, Yser Card functional</li>
                      <li>Acolyte / Priest — Holy Light (LUK% chance for +60% damage), offensive Heal (heal-bomb vs Undead, higher with Purifying Ring + Rosary), Turn Undead instant-kill chance, Holy Strike proc (101 + baseSTR + baseLevel)%, Magnus Exorcismus (full vs Undead/Demon), Signum Crucis −50% DEF</li>
                      <li>Monk / Champion — Triple Attack (5 levels; procs on auto-attack, crits during Fury), Chain Combo / Combo Finish reworked ratios, Asura Strike SP formula (flat +1000, takes normal DEF), spirit spheres (Star Crumb-style, true-neutral, per hit)</li>
                      <li>Wizard / High Wizard — Frost Nova (175+15×lv → 190% at lv 1, +10% per Frost Diver lv, max lv 5), Lord of Vermillion 200×lv% total (4 waves), Napalm Vulcan Shadow element + 50% MDEF ignore, Fire Pillar 50% MDEF ignore, Mystical Amplification +10%/lv (max lv 5), Sightrasher max lv 5, Soul Drain +1% MaxHP/lv</li>
                      <li>Sage — Soul Strike ignores 50% MDEF (lv 10 learned) and deals +5%×lv bonus vs Undead race; Fireball (70+30×lv)% per hit (lv 1–10: 70%→340%); Earth Spike and Heavens Drive 140%×lv per hit; Advanced Book ATK +10–30 flat (lv 1–5); Volcano/Deluge/Violent Gale persistence buffs at max level 3; Auto Spell (Hindsight) autocast — level selects the spell (Soul Strike / bolts / Earth Spike / Fire Ball / Thunderstorm / Heaven's Drive), 30% on physical attacks, folded into DPS</li>
                      <li>Hunter — offensive trap damage (Land Mine, Blast Mine, Freezing Trap, Claymore Trap)</li>
                      <li>Bard / Dancer — Performing +100 ratio on Musical Strike / Throw Arrow (175+25×lv base), Arrow Vulcan, arrow-element damage</li>
                      <li>Gunslinger — Triple Action 420% total (100+40×lv), Ground Drift 200+60×lv% (max 800%), Soul Bullet (50+DEX+BaseLvl)%, Heavy-Tipped Bullet ATK 45 +10% all races; Dust/Full Buster/Spread Attack 7% Neutral resist now also triggers with Grenade Launcher</li>
                      <li>Ninja — Throw Huuma Shuriken (200+150×lv), Shadow Slash, Killing Stroke (STR×40 + HP×8%×lv), Freezing Spear / Lightning Jolt</li>
                    </ul>
                  )}
                </li>
                <li>Full step-by-step damage breakdown — every multiplier and where it comes from</li>
                <li>Attack-speed, cast, and hit breakpoint calculator</li>
                <li>Disambiguated damage, hit, and dodge against the exact monster you pick</li>
                <li>Survivability panel — how hard monsters hit you (incoming damage, effective HP, dodge / FLEE)</li>
                <li>Grand Cross self-damage (recoil) modeling</li>
                <li>Burning — the stacking Fire debuff (−2 MDEF per stack, up to 5) applied to your target</li>
                <li>Cards that autocast a skill when you attack (auto-Mammonite, auto-Bash) — per-proc damage and the DPS they add</li>
                <li>Crescent Scythe's crit lifesteal — HP healed per critical hit (0.1% of the damage per refine)</li>
                <li>Forged weapons — Star Crumb (VS / VVS / VVVS) and ranked-forge seeking damage on blacksmith-forgeable weapons</li>
                <li>Build-vs-build comparison</li>
                <li>Starter build templates from the PS wiki — load a class build (stats + a signature skill) for any of 16 classes and tweak it</li>
                <li>Import builds from the jaludev calculator</li>
                <li>Light and dark mode</li>
              </ul>
            )}
          </div>
        )}

        <ResultsPanel
          ref={resultsPanelRef}
          open={resultsOpen}
          onClose={() => setResultsOpen(false)}
          calcResult={calcResult}
          calculating={calculating}
          error={calcError}
          forceProcs={forceProcs}
          onToggleForceProcs={handleToggleForceProcs}
          pins={pins}
          onPin={handlePin}
          onRemovePin={handleRemovePin}
          onLoadPin={handleLoadPin}
          onClearPins={handleClearPins}
          onOpenTip={() => setTipOpen(true)}
        />

        <div className="editor-grid">
          <Panel eyebrow="00" title="Start from a template">
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <label>Load a PS wiki build</label>
                <select
                  value=""
                  onChange={(e) => {
                    const t = BUILD_TEMPLATES.find((x) => x.label === e.target.value);
                    if (t) applyTemplate(t);
                  }}
                >
                  <option value="">Choose a class build…</option>
                  {BUILD_TEMPLATES.map((t) => (
                    <option key={t.label} value={t.label}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {templateHint ? (
              <p className="build-template-hint">
                <strong>{templateHint.label}:</strong> {templateHint.note}{" "}
                <a href={templateHint.wiki} target="_blank" rel="noreferrer">Wiki guide ↗</a>
              </p>
            ) : (
              <p className="build-template-hint">
                Loads a class starter build — job, level, a stat spread from the PS wiki, and a signature
                skill — for you to tweak. Optional; you can build from scratch below.
              </p>
            )}
            <p className="build-template-hint" style={{ marginTop: "0.15rem" }}>
              <a href="/guides.html">Browse all build guides →</a>
            </p>
          </Panel>

          <Panel eyebrow="01" title="Character">
            <div className="field-row">
              <div className="field">
                <label>Build name</label>
                <span className="field-static">{data.name || "—"}</span>
              </div>
              <div className="field">
                <label>Job</label>
                <select
                  value={data.job_id}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const job = jobs.find((j) => j.id === id);
                    setData((prev) => ({
                      ...prev,
                      job_id: id,
                      job_name: job?.name ?? "",
                      job_level: Math.min(prev.job_level, getJobLevelCap(id)),
                    }));
                    // A class switch invalidates the previously-selected damage skill
                    // (e.g. a Wizard's Storm Gust when you switch to Sage), so reset to
                    // Normal Attack rather than silently calculating a skill the new job
                    // can't use. Normal Attack is valid for every job.
                    if (id !== data.job_id) setSkill(DEFAULT_SKILL);
                  }}
                >
                  {jobs.length === 0 && <option value={data.job_id}>{data.job_name || `Job ${data.job_id}`}</option>}
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Base level</label>
                <input
                  className="mono"
                  type="number"
                  min={1}
                  max={BASE_LEVEL_CAP}
                  value={data.base_level}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => updateField(["base_level"], Math.max(1, Math.min(BASE_LEVEL_CAP, Number(e.target.value))))}
                />
              </div>
              <div className="field">
                <label>Job level</label>
                <input
                  className="mono"
                  type="number"
                  min={1}
                  max={getJobLevelCap(data.job_id)}
                  value={data.job_level}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => updateField(["job_level"], Math.max(1, Math.min(getJobLevelCap(data.job_id), Number(e.target.value))))}
                />
              </div>
            </div>
            <label style={{ marginTop: "0.3rem" }} className="section-label">
              Base stats
              <InfoTooltip>
                The bold total includes the job-level stat bonus, flat
                bonuses from equipped items (bStr, bAgi, etc.), passive
                skill bonuses (Dragonology → INT; Owl's Eye → DEX;
                Hilt Binding → STR), and buff bonuses (Blessing, Inc AGI,
                Gloria, Attention Concentrate) — all folded into the
                damage calculation.
              </InfoTooltip>
              <button
                type="button"
                className="stat-collapse-toggle"
                title={collapseStatBonuses ? "Show each bonus source separately" : "Combine all bonuses into one number per stat"}
                aria-pressed={collapseStatBonuses}
                onClick={() => {
                  const next = !collapseStatBonuses;
                  setCollapseStatBonuses(next);
                  localStorage.setItem("collapseStatBonuses", next ? "1" : "0");
                }}
              >
                {collapseStatBonuses ? "Split bonuses" : "Combine bonuses"}
              </button>
              <span className={`stat-pts-counter${remainingStatPoints < 0 ? " stat-pts-counter--over" : remainingStatPoints <= 10 ? " stat-pts-counter--low" : ""}`}>
                <span className="stat-pts-bar">
                  <span className="stat-pts-bar__fill" style={{ width: `${(Math.min(1, Math.max(0, 1 - remainingStatPoints / totalStatPoints)) * 100).toFixed(1)}%` }} />
                </span>
                {remainingStatPoints.toLocaleString()} SP remaining
              </span>
            </label>
            <div className="ro-stat-grid">
              {STATS.map((s) => {
                const jobBonus = jobBonusStats[STAT_TO_BONUS_KEY[s]] ?? 0;
                const equipBonus = equipBonusStats[STAT_TO_BONUS_KEY[s]] ?? 0;
                const buffBonus = buffBonusStats[STAT_TO_BONUS_KEY[s]] ?? 0;
                const manualBonus = (data.bonus_stats?.[s] as number) ?? 0;
                const base = data.base_stats[s] ?? 1;
                const nextCost = Math.floor((base - 1) / 10) + 2;
                return (
                  <div className="ro-stat-card" key={s}>
                    <div className="ro-stat-name">{s.toUpperCase()}</div>
                    <div className="ro-stat-total">{base + jobBonus + equipBonus + buffBonus + manualBonus}</div>
                    <div className="ro-stat-detail">
                      <input
                        className="mono"
                        type="number"
                        min={1}
                        max={MAX_STAT}
                        value={base}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const newVal = Math.max(1, Math.min(MAX_STAT, Number(e.target.value)));
                          if (newVal > base) {
                            const capped = maxAffordableStat(base, remainingStatPoints);
                            updateField(["base_stats", s], Math.min(newVal, capped));
                          } else {
                            updateField(["base_stats", s], newVal);
                          }
                        }}
                      />
                      {collapseStatBonuses ? (
                        (() => {
                          const totalBonus = jobBonus + equipBonus + buffBonus + manualBonus;
                          if (totalBonus === 0) return null;
                          const parts = [
                            jobBonus > 0 ? `+${jobBonus} job` : "",
                            equipBonus !== 0 ? `${equipBonus > 0 ? "+" : ""}${equipBonus} equip` : "",
                            buffBonus !== 0 ? `${buffBonus > 0 ? "+" : ""}${buffBonus} buff` : "",
                            manualBonus !== 0 ? `${manualBonus > 0 ? "+" : ""}${manualBonus} manual` : "",
                          ].filter(Boolean).join(", ");
                          return <span className="ro-stat-bonus" title={parts}>{totalBonus > 0 ? "+" : ""}{totalBonus}</span>;
                        })()
                      ) : (
                        <>
                          {jobBonus > 0 && <span className="ro-stat-bonus" title={`+${jobBonus} from job level`}>+{jobBonus}</span>}
                          {equipBonus !== 0 && <span className="ro-stat-bonus ro-stat-bonus--equip" title={`${equipBonus > 0 ? "+" : ""}${equipBonus} from equipment / pet`}>{equipBonus > 0 ? "+" : ""}{equipBonus}</span>}
                          {buffBonus !== 0 && <span className="ro-stat-bonus ro-stat-bonus--buff" title={`${buffBonus > 0 ? "+" : ""}${buffBonus} from skills / buffs`}>{buffBonus > 0 ? "+" : ""}{buffBonus}</span>}
                          {manualBonus !== 0 && <span className="ro-stat-bonus ro-stat-bonus--manual" title={`${manualBonus > 0 ? "+" : ""}${manualBonus} manual`}>{manualBonus > 0 ? "+" : ""}{manualBonus}</span>}
                        </>
                      )}
                    </div>
                    <div className="ro-stat-cost">+{nextCost} pt</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: "0.9rem" }} className="section-label">
              <button
                type="button"
                className="reworks-detail-toggle"
                onClick={() => {
                  const next = !manualStatsOpen;
                  setManualStatsOpen(next);
                  localStorage.setItem("manualStatsOpen", next ? "1" : "0");
                }}
                aria-expanded={manualStatsOpen}
              >
                Manual stat bonuses
                <span className="reworks-detail-chevron">{manualStatsOpen ? "▾" : "▸"}</span>
              </button>
              <InfoTooltip>
                Flat additions applied on top of your allocated stats — use this
                to model any stat source the calculator doesn't cover (temporary
                food buffs, quest rewards, etc.). Folded into the bold total
                above and the damage calculation. Negative values are allowed.
              </InfoTooltip>
            </div>
            {manualStatsOpen && (
              <div className="passive-grid">
                {STATS.map((s) => (
                  <div className="field" key={s}>
                    <label>{s.toUpperCase()}</label>
                    <input
                      className="mono"
                      type="number"
                      value={(data.bonus_stats?.[s] as number) ?? 0}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updateField(["bonus_stats", s], Math.trunc(Number(e.target.value) || 0))}
                    />
                  </div>
                ))}
              </div>
            )}
            <label style={{ marginTop: "0.9rem" }} className="section-label">Combat stats</label>
            <div className="sec-stat-grid">
              {([
                { label: "Max HP",   value: charStatus?.max_hp?.toLocaleString() },
                { label: "Max SP",   value: charStatus?.max_sp?.toLocaleString() },
                { label: "HP Regen", value: charStatus ? `${charStatus.hp_regen} /tick` : undefined },
                { label: "SP Regen", value: charStatus ? `${charStatus.sp_regen} /tick` : undefined },
                { label: "ATK",      value: charStatus ? `${charStatus.batk + charStatus.weapon_atk}${((charStatus.refine_atk || 0) + (charStatus.weapon_atk_flat || 0)) ? `+${(charStatus.refine_atk || 0) + (charStatus.weapon_atk_flat || 0)}` : ""}` : undefined },
                { label: "MATK",     value: charStatus ? `${charStatus.matk_min}–${charStatus.matk_max}` : undefined },
                { label: "DEF",      value: charStatus ? `${charStatus.hard_def}+${charStatus.soft_def}` : undefined },
                { label: "MDEF",     value: charStatus ? `${charStatus.hard_mdef}+${charStatus.soft_mdef}` : undefined },
                { label: "ASPD",     value: charStatus?.aspd?.toFixed(1), note: aspdDelayMs != null ? <AttackRateNote periodMs={aspdDelayMs} adelayMs={aspdDelayMs} /> : undefined },
                { label: "HIT",      value: charStatus?.hit?.toLocaleString() },
                { label: "Flee",     value: charStatus?.flee?.toLocaleString() },
                // Perfect Dodge (flee2) is a flat chance to avoid a hit outright,
                // independent of the attacker's HIT — so it belongs beside Flee
                // rather than folded into it. It was computed but never surfaced,
                // which made gear granting it look broken.
                { label: "Perfect Dodge", value: charStatus ? `${(charStatus.flee2 / 10).toFixed(1)}%` : undefined },
                { label: "Critical", value: charStatus ? `${(charStatus.cri / 10).toFixed(1)}%` : undefined },
              ] as { label: string; value?: string; note?: ReactNode }[]).map(({ label, value, note }) => {
                const card = (
                  <>
                    <div className="sec-stat-label">{label}</div>
                    <div className="sec-stat-value">{value ?? "—"}</div>
                  </>
                );
                return note ? (
                  <HoverNote key={label} className="sec-stat-card sec-stat-card--note" note={note}>{card}</HoverNote>
                ) : (
                  <div key={label} className="sec-stat-card">{card}</div>
                );
              })}
            </div>
            <BreakpointsView
              payload={breakpointPayload}
              targetName={targetMode === "monster" ? (mobInfo?.name ?? null) : "custom target"}
              skillLabel={skill.id ? skill.label : null}
              skillLevel={skill.id ? skill.level : null}
            />
          </Panel>

          <Panel eyebrow="02" title="Equipment">
            <div className="equip-grid">
              {EQUIP_SLOTS.map((slot) => {
                const equippedId = data.equipped[slot.key] as number | null | undefined;
                const item = equippedId != null ? itemCache[equippedId] : null;
                const cardSlotCount = item?.slots ?? 0;
                const isWeaponSlot = slot.key === "right_hand" || (slot.key === "left_hand" && item?.type === "IT_WEAPON");
                const isRefineable = item?.refineable ?? false;
                // A weapon can be Star-Crumb forged only if it's on the blacksmith
                // forge list (FORGEABLE_WEAPON_IDS) — named/elemental weapons like
                // Fire Brand or Muramasa are excluded; Damascus/Flamberge are kept.
                // Either hand can hold a forged weapon — a dual-wielding Assassin
                // forges each dagger separately. (The off-hand only reaches the
                // damage through the dual-wield branch, which is the only place an
                // off-hand weapon is priced at all.)
                const isForgeableWeapon = isWeaponSlot
                  && equippedId != null
                  && FORGEABLE_WEAPON_IDS.has(equippedId);
                // A forged weapon's card slots hold the crafter's signature and the
                // crumb/element data, so no cards can go in it — hide the pickers
                // rather than letting a build claim something that can't exist.
                const forgeState = data.forge?.[slot.key];
                const isForged = !!forgeState
                  && ((forgeState.sc ?? 0) > 0 || !!forgeState.ranked || (forgeState.ele ?? 0) > 0);
                const isInvalid = invalidSlots.has(slot.key);
                const cardLoc = slot.key === "left_hand" && item?.type === "IT_WEAPON"
                  ? "EQP_WEAPON"
                  : SLOT_CARD_LOC[slot.key];
                return (
                  <div key={slot.key} className="field">
                    <label>{slot.label}</label>
                    {equippedId != null ? (
                      <>
                      <div className={`selected-pill${isInvalid ? " selected-pill--invalid" : ""}`}>
                        <HoverDescription
                          id={equippedId as number}
                          fetchDescription={fetchItemTooltip}
                          title={isInvalid ? "Not equippable by this class — excluded from calculation" : undefined}
                        >
                          {item ? item.name : `Item #${equippedId}`}
                          {isRefineable ? ` +${data.refine[slot.key] || 0}` : ""}
                        </HoverDescription>
                        <button
                          onClick={() => {
                            setData((prev) => {
                              const next = structuredClone(prev) as any;
                              next.equipped[slot.key] = null;
                              for (let i = 1; i <= 4; i++) delete next.equipped[`${slot.key}_card${i}`];
                              // Same reason as the picker above: forge data is per-slot, so
                              // leaving it behind makes the NEXT weapon read as forged.
                              if (next.forge) delete next.forge[slot.key];
                              return next;
                            });
                          }}
                        >
                          Unequip
                        </button>
                      </div>
                      {isInvalid && (
                        <span style={{ fontSize: "0.72rem", color: "var(--crit)", marginTop: "0.2rem", display: "block" }}>
                          Not equippable by this class
                        </span>
                      )}
                      </>
                    ) : (
                      <SearchPicker
                        placeholder={`Search ${slot.label.toLowerCase()}…`}
                        search={"dualWield" in slot && slot.dualWield ? leftHandSearch : itemSearch(slot.itemType, "loc" in slot ? slot.loc : undefined)}
                        onSelect={(r) => {
                          setData((prev) => {
                            const next = structuredClone(prev) as any;
                            const wasEquipped = next.equipped[slot.key];
                            next.equipped[slot.key] = r.id;
                            // Forge data belongs to the SPECIFIC weapon that was forged, but
                            // it is stored per SLOT — so swapping weapons used to carry the
                            // old weapon's crumbs/element onto the new one. That silently
                            // hides the new weapon's card slots (a forged weapon has none),
                            // and if the new weapon is not forgeable the forge controls are
                            // hidden too, leaving no way to clear it. Reported by a player
                            // who loaded a shared build with a forged Damascus and switched
                            // to a Main Gauche: the slots simply never appeared.
                            if (wasEquipped !== r.id && next.forge) delete next.forge[slot.key];
                            return next;
                          });
                          api.getItem(r.id, data.server)
                            .then((full) => setItemCache((prev) => ({ ...prev, [r.id]: full })))
                            .catch(() => setItemCache((prev) => ({ ...prev, [r.id]: { id: r.id, name: r.label } })));
                        }}
                        fetchTooltip={fetchItemTooltip}
                      />
                    )}
                    {isRefineable && equippedId != null && (
                      <input
                        className="mono"
                        type="number"
                        min={0}
                        max={10}
                        style={{ marginTop: "0.4rem" }}
                        value={data.refine[slot.key] || 0}
                        onChange={(e) => updateField(["refine", slot.key], Math.min(10, Math.max(0, Number(e.target.value))))}
                        onFocus={(e) => e.target.select()}
                        title="Refine level"
                      />
                    )}
                    {isForgeableWeapon && equippedId != null && (
                      <>
                        <label style={{ marginTop: "0.5rem" }}>Forge</label>
                        <select
                          value={data.forge?.[slot.key]?.sc ?? 0}
                          title="Forged Star Crumbs — seeking damage that ignores DEF and can't miss (per hit)"
                          onChange={(e) => setForge(slot.key, { sc: Number(e.target.value) })}
                        >
                          <option value={0}>Not forged</option>
                          <option value={1}>Very Strong (+5)</option>
                          <option value={2}>Very Very Strong (+10)</option>
                          <option value={3}>Very Very Very Strong (+40)</option>
                        </select>
                        {/* Elemental forge — a Blacksmith forging with an elemental
                            stone (Flame Heart / Mystic Frozen / Rough Wind / Great
                            Nature) turns the weapon Fire / Water / Wind / Earth.
                            Those four are the only forgeable elements. It applies on
                            its own, with or without Star Crumbs, and an endow
                            (Fire Weapon, Aspersio…) still overrides it while active. */}
                        <select
                          style={{ marginTop: "0.35rem" }}
                          value={data.forge?.[slot.key]?.ele ?? 0}
                          title="Elemental forge — the weapon's element comes from the elemental stone it was forged with. An active endow overrides it."
                          onChange={(e) => setForge(slot.key, { ele: Number(e.target.value) })}
                        >
                          <option value={0}>Neutral (no stone)</option>
                          <option value={3}>Fire (Flame Heart)</option>
                          <option value={1}>Water (Mystic Frozen)</option>
                          <option value={4}>Wind (Rough Wind)</option>
                          <option value={2}>Earth (Great Nature)</option>
                        </select>
                        <div className="field-checkbox" style={{ marginTop: "0.35rem" }}>
                          <label title="Forged by a ranked blacksmith — +10 seeking damage on top of the Star Crumb bonus.">
                            <input
                              type="checkbox"
                              checked={!!data.forge?.[slot.key]?.ranked}
                              onChange={(e) => setForge(slot.key, { ranked: e.target.checked })}
                            />
                            <span>Ranked forge (+10)</span>
                          </label>
                        </div>
                      </>
                    )}
                    {cardSlotCount > 0 && !isForged && (
                      <>
                        {isWeaponSlot && (
                          <div className="card-mode-toggle">
                            <button
                              className={!wildcardMode[slot.key] ? "active" : ""}
                              onClick={() => {
                                setWildcardMode((prev) => ({ ...prev, [slot.key]: false }));
                                // Drop the slot's wildcard mix so it isn't persisted and
                                // wrongly re-selected as wildcard mode on the next load.
                                setData((prev) => {
                                  if (!prev.wildcard_slots?.[slot.key]) return prev;
                                  const next = { ...prev.wildcard_slots };
                                  delete next[slot.key];
                                  return { ...prev, wildcard_slots: next };
                                });
                              }}
                            >
                              Cards
                            </button>
                            <button
                              className={wildcardMode[slot.key] ? "active" : ""}
                              onClick={() => {
                                setWildcardMode((prev) => ({ ...prev, [slot.key]: true }));
                                if (!data.wildcard_slots?.[slot.key]?.length) {
                                  const defaults = Array.from({ length: cardSlotCount }, () => ({
                                    type: "race" as const,
                                    bonus: 20,
                                  }));
                                  setData((prev) => ({
                                    ...prev,
                                    wildcard_slots: { ...(prev.wildcard_slots || {}), [slot.key]: defaults },
                                  }));
                                }
                              }}
                            >
                              Wildcard mix
                            </button>
                          </div>
                        )}
                        {isWeaponSlot && wildcardMode[slot.key] ? (
                          <div className="wildcard-slots">
                            {Array.from({ length: cardSlotCount }, (_, i) => {
                              const ws = data.wildcard_slots?.[slot.key]?.[i] ?? {
                                type: "race" as const,
                                bonus: 20,
                              };
                              return (
                                <div key={i} className="wildcard-slot-row">
                                  <select
                                    value={ws.type}
                                    onChange={(e) =>
                                      updateWildcardSlot(slot.key, i, {
                                        type: e.target.value as WildcardSlot["type"],
                                      })
                                    }
                                  >
                                    <option value="race">Race</option>
                                    <option value="size">Size</option>
                                    <option value="ele">Element</option>
                                    <option value="family">Type</option>
                                  </select>
                                  {ws.type !== "size" ? (
                                    <select
                                      value={ws.bonus}
                                      onChange={(e) =>
                                        updateWildcardSlot(slot.key, i, { bonus: Number(e.target.value) })
                                      }
                                    >
                                      {WILDCARD_BONUS_OPTIONS.map((v) => (
                                        <option key={v} value={v}>
                                          {v}%
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="wildcard-size-label">15% +5 ATK</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="card-slots">
                            {Array.from({ length: cardSlotCount }, (_, i) => {
                              const cardKey = `${slot.key}_card${i + 1}`;
                              const cardId = data.equipped[cardKey] as number | null | undefined;
                              const card = cardId != null ? itemCache[cardId] : null;
                              return (
                                <div key={cardKey} className="card-slot">
                                  {cardId != null ? (
                                    <div className="selected-pill">
                                      <HoverDescription id={cardId} fetchDescription={fetchItemTooltip}>
                                        {card ? card.name : `Card #${cardId}`}
                                      </HoverDescription>
                                      <button onClick={() => updateField(["equipped", cardKey], null)}>×</button>
                                    </div>
                                  ) : (
                                    <SearchPicker
                                      placeholder={`Card slot ${i + 1}…`}
                                      search={itemSearch("IT_CARD", cardLoc)}
                                      onSelect={(r) => {
                                        setItemCache((prev) => ({ ...prev, [r.id]: { id: r.id, name: r.label } }));
                                        updateField(["equipped", cardKey], r.id);
                                      }}
                                      fetchTooltip={fetchItemTooltip}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          {data.server === "payon_stories" && (
            <Panel eyebrow="03" title="Pet">
              <div className="field">
                <label>
                  Active pet
                  <InfoTooltip>
                    Bonuses activate at Cordial (750+ intimacy). ATK/MATK%,
                    ASPD%, resist, and flat-stat bonuses are applied to the
                    calculation. HP drain procs and healing bonuses are noted
                    in the label but not modelled by the engine.
                  </InfoTooltip>
                </label>
                <select
                  value={data.selected_pet ?? ""}
                  onChange={(e) => updateField(["selected_pet"], e.target.value || undefined)}
                >
                  <option value="">None</option>
                  <optgroup label="Payon Stories custom pets">
                    {PS_PETS.filter((p) => p.psCustom).map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Standard pets">
                    {PS_PETS.filter((p) => !p.psCustom).map((p) => (
                      <option key={p.key} value={p.key}>{p.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </Panel>
          )}

          <Panel eyebrow="04" title="Passive skills">
            {passiveSkills.length === 0 ? (
              <p style={{ color: "var(--text-muted, #888)", fontSize: "0.875rem" }}>
                {data.job_id ? "No passive skills for this job." : "Select a job to see passive skills."}
              </p>
            ) : (
              <>
              <div className="field-row" style={{ marginBottom: "0.6rem" }}>
                <button
                  onClick={() => setData((prev) => {
                    const next = { ...(prev.mastery_levels || {}) };
                    for (const ps of passiveSkills) next[ps.mastery_key] = ps.max_level;
                    return { ...prev, mastery_levels: next };
                  })}
                >
                  Max all
                </button>
                <button
                  onClick={() => setData((prev) => {
                    const next = { ...(prev.mastery_levels || {}) };
                    for (const ps of passiveSkills) next[ps.mastery_key] = 0;
                    return { ...prev, mastery_levels: next };
                  })}
                >
                  Reset
                </button>
              </div>
              <div className="passive-grid">
                {passiveSkills.map((ps) => (
                  <div className="field" key={ps.name}>
                    <label title={ps.name}>{ps.description}</label>
                    <input
                      className="mono"
                      type="number"
                      min={0}
                      max={ps.max_level}
                      value={(data.mastery_levels || {})[ps.mastery_key] ?? 0}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const lv = Math.max(0, Math.min(ps.max_level, Number(e.target.value)));
                        setData((prev) => ({
                          ...prev,
                          mastery_levels: { ...(prev.mastery_levels || {}), [ps.mastery_key]: lv },
                        }));
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #888)" }}>/ {ps.max_level}</span>
                  </div>
                ))}
              </div>
              </>
            )}

            {/* Plagiarism (Rogue/Stalker): the ONE skill you have copied. It is
                not on your skill tree, so it can't live in the passive grid — but
                the engine still needs it, because a copied Triple Attack procs on
                your normal attacks. Recording it here also means you can leave the
                damage skill above set to Normal attack and still keep the copy in
                the build (and in the share link). */}
            {plagiarism.jobs.includes(data.job_id) && (
              <>
                <div className="buff-section-header" style={{ marginTop: "0.9rem" }}>
                  Plagiarism
                  <InfoTooltip>
                    Rogues and Stalkers copy the last offensive skill that hit them, at the
                    rank it was used on you and no higher than your own Plagiarism rank —
                    one skill at a time, kept between hits only while Preserve is toggled on.
                    Set it here and the calculator treats it as your own: a copied
                    <strong> Triple Attack</strong> procs on your normal attacks, so you can
                    leave the damage skill on Normal attack and still see it. To see a copied
                    spell's own damage (Jupitel Thunder, Asura Strike…), pick it as the skill
                    at the top — it stays saved here either way. Heal, Ruwach, Aspersio and
                    Sanctuary are only copyable while wearing Evil-Druid-carded armor.
                  </InfoTooltip>
                </div>
                <div className="field-row">
                  <div className="field" style={{ flex: 2 }}>
                    <label>Copied skill</label>
                    <select
                      value={(data.flags?.plagiarism as any)?.name ?? ""}
                      onChange={(e) => {
                        const name = e.target.value;
                        const rec = plagiarism.skills.find((s) => s.name === name);
                        setData((prev) => ({
                          ...prev,
                          flags: {
                            ...(prev.flags || {}),
                            plagiarism: name ? { name, level: rec ? rec.max_level : 1 } : undefined,
                          },
                        }));
                      }}
                    >
                      <option value="">— nothing copied —</option>
                      {plagiarism.skills.map((s) => (
                        <option key={s.name} value={s.name}>{s.display_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Rank</label>
                    <input
                      className="mono"
                      type="number"
                      min={0}
                      max={plagiarizedMax}
                      disabled={!(data.flags?.plagiarism as any)?.name}
                      value={(data.flags?.plagiarism as any)?.level ?? 0}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const lv = Math.max(0, Math.min(plagiarizedMax, Number(e.target.value) || 0));
                        setData((prev) => {
                          const cur = (prev.flags || {}).plagiarism as any;
                          if (!cur?.name) return prev;
                          return { ...prev, flags: { ...(prev.flags || {}), plagiarism: { ...cur, level: lv } } };
                        });
                      }}
                    />
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #888)" }}>/ {plagiarizedMax}</span>
                  </div>
                </div>
              </>
            )}
          </Panel>

          <Panel eyebrow="05" title="Consumables">
            <div className="field">
              <label>ASPD potion</label>
              <select
                value={data.consumable_buffs?.aspd_potion ?? 0}
                onChange={(e) => updateConsumable("aspd_potion", Number(e.target.value) || undefined)}
              >
                {ASPD_POTION_LABELS.map((label, i) => (
                  <option key={i} value={i} disabled={i > aspdPotionCap(data.job_id)}>{label}</option>
                ))}
              </select>
            </div>
            <div className="field-row" style={{ marginTop: "0.6rem" }}>
              <div className="field">
                <label>ATK item (flat BATK)</label>
                <input
                  className="mono"
                  type="number"
                  min={0}
                  value={data.consumable_buffs?.atk_item ?? 0}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => updateConsumable("atk_item", Number(e.target.value) || undefined)}
                />
              </div>
              <div className="field">
                <label>MATK item (flat MATK)</label>
                <input
                  className="mono"
                  type="number"
                  min={0}
                  value={data.consumable_buffs?.matk_item ?? 0}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => updateConsumable("matk_item", Number(e.target.value) || undefined)}
                />
              </div>
            </div>
            <div className="field field-checkbox" style={{ marginTop: "0.6rem" }}>
              <label title="Box of Gloom: casts Improve Concentration Lv1 (+3% AGI/DEX, base stats only).">
                <input
                  type="checkbox"
                  checked={!!data.consumable_buffs?.box_gloom}
                  onChange={(e) => updateConsumable("box_gloom", e.target.checked || undefined)}
                />
                <span>Box of Gloom (+3% AGI/DEX)</span>
              </label>
            </div>
            <div className="field field-checkbox" style={{ marginTop: "0.4rem" }}>
              <label title="Box of Resentment: +20 ATK for 60s (sc_start SC_PLUSATTACKPOWER).">
                <input
                  type="checkbox"
                  checked={!!data.consumable_buffs?.box_resentment}
                  onChange={(e) => updateConsumable("box_resentment", e.target.checked || undefined)}
                />
                <span>Box of Resentment (+20 ATK)</span>
              </label>
            </div>
            <div className="field field-checkbox" style={{ marginTop: "0.4rem" }}>
              <label title="Box of Drowsiness: +20 MATK for 60s (sc_start SC_PLUSMAGICPOWER).">
                <input
                  type="checkbox"
                  checked={!!data.consumable_buffs?.box_drowsiness}
                  onChange={(e) => updateConsumable("box_drowsiness", e.target.checked || undefined)}
                />
                <span>Box of Drowsiness (+20 MATK)</span>
              </label>
            </div>
          </Panel>

          <Panel eyebrow="06" title="Buffs">
            {(() => {
              const selfBuffs = SELF_BUFFS.filter((b) => (b.jobs as readonly number[]).includes(data.job_id)
                && !((b as { psRemoved?: boolean }).psRemoved && data.server === "payon_stories"));
              // Conditional self-buff toggles that live in targetMods (not active_buffs):
              // Performing for Bard/Dancer/Clown/Gypsy, Breaking Cloak for Assassin(X).
              const isBardDancer = [19, 20, 4020, 4021].includes(data.job_id);
              const isAssassin = [12, 4013].includes(data.job_id);
              // Knight / Crusader / Lord Knight / Paladin can ride a Peco Peco.
              const isKnightLine = [7, 14, 4008, 4015].includes(data.job_id);
              // Monk (15) / Champion (4016): active spirit spheres add +3 ATK each.
              const isMonkLine = [15, 4016].includes(data.job_id);
              const isGunslinger = data.job_id === 24;
              // What this build is asking its coin pool to pay for. Fling is counted
              // only when it is the SELECTED skill: the Fling entry under target
              // debuffs represents someone ELSE's Gunslinger, whose coins aren't yours.
              const coinsHeld = Number(data.flags?.gs_coins) || 0;
              const coinSpend: { label: string; cost: number }[] = [];
              // Barrage (2) and Run and Gun (1) are NOT counted here, even though they
              // cost coins. Their cost is paid when the stance goes up, and Coin Flip
              // refills in one 3-second cast, so by the time you attack you are holding
              // a full pool AND running the stance. Charging the build for both made
              // the panel claim a Gunslinger was short of coins they would actually
              // have. Reported by a player. This field is "coins in hand as you act".
              if (skill.id === GS_FLING_SKILL_ID) {
                const thrown = Math.min(5, coinsHeld);
                if (thrown > 0) coinSpend.push({ label: "Fling", cost: thrown });
              } else if (GS_SKILL_COIN_COST[skill.id]) {
                coinSpend.push({ label: skill.label || "skill", cost: GS_SKILL_COIN_COST[skill.id] });
              }
              const coinsSpent = coinSpend.reduce((n, c) => n + c.cost, 0);
              const coinsShort = coinsSpent > coinsHeld;
              const maxSpheres = data.job_id === 4016 ? 15 : 5;
              // Super Novice (23): never-died bonus (+10 all stats at job 70+).
              const isSuperNovice = data.job_id === 23;
              const hasSelfSection = selfBuffs.length > 0 || isBardDancer || isAssassin || isKnightLine || isMonkLine || isSuperNovice;
              const supportBuffs = (data.support_buffs || {}) as Record<string, unknown>;
              const groundEffectType = (supportBuffs.ground_effect as string) || "";
              // SA_VOLCANO/SA_DELUGE/SA_VIOLENTGALE's vanilla max_level is 5;
              // PS overrides all three to 3 (wiki.payonstories.com/Volcano,
              // /Deluge, /Violent_Gale all show per-level tables stopping at 3
              // despite a "Levels: 5 (Fixed)" label likely inherited from
              // vanilla's max_level field) -- corroborated by PS_VOL_MATK_PCT
              // and PS_ENCHANT_EFF both being 3-element arrays.
              const groundEffectMax = data.server === "payon_stories" ? 3 : 5;
              const endowValue = supportBuffs.SC_ASPERSIO ? "SC_ASPERSIO" : (supportBuffs.weapon_endow_sc as string) || "";
              // Auto Spell (Hindsight) is a Sage/Professor skill; the engine only
              // computes it for those jobs, so gate the selector to match.
              const isSageLine = [16, 4017].includes(data.job_id);
              const autoSpellLv = Number(supportBuffs.auto_spell_lv || 0);
              // Performer stats only matter once a song is actually running, so each
              // block appears with the first song of that class — and doubles as a
              // reminder of which performer owns which song.
              const songState = data.song_state || {};
              const hasBardSong = BARD_SONG_KEYS.some((k) => Number(songState[k] || 0) > 0);
              const hasDancerSong = DANCER_SONG_KEYS.some((k) => Number(songState[k] || 0) > 0);
              return (
                <>
                  {!hasSelfSection ? (
                    <p style={{ color: "var(--text-muted, #888)", fontSize: "0.875rem" }}>
                      {data.job_id ? "No self-cast buffs modeled for this job yet." : "Select a job to see its self buffs."}
                    </p>
                  ) : (
                    <>
                      <div className="buff-section-header">Self buffs</div>
                      <div className="passive-grid">
                        {selfBuffs.map((b) => {
                          const active = (data.active_buffs?.[b.key] ?? 0) > 0;
                          return (
                            <div className="field field-checkbox" key={b.key}>
                              <label title={b.key}>
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={(e) => updateBuffField("active_buffs", b.key, e.target.checked ? b.max : 0)}
                                />
                                <span>{b.label}</span>
                              </label>
                            </div>
                          );
                        })}
                        {isBardDancer && (
                          <div className="field field-checkbox" key="__performing">
                            <label title="Performing (Bard/Dancer): while a song or dance is active, Musical Strike and Throw Arrow gain a flat +100 ratio points (Lv1 300%, Lv5 400%). Only affects those two skills.">
                              <input type="checkbox" checked={!!targetMods.performing} onChange={(e) => setTargetMods((m) => ({ ...m, performing: e.target.checked }))} />
                              <span>Performing (Musical Strike / Throw Arrow +100%)</span>
                            </label>
                          </div>
                        )}
                        {isAssassin && (
                          <div className="field field-checkbox" key="__breaking_cloak">
                            <label title="Breaking Cloak (Assassin, requires Cloak Lv3+): breaking Cloak with an auto-attack makes that opening hit deal ×2 damage; breaking it with Sonic Blow adds +10%. Applies to the shown per-hit damage only (a one-time opener), not sustained DPS.">
                              <input type="checkbox" checked={!!targetMods.breaking_cloak} onChange={(e) => setTargetMods((m) => ({ ...m, breaking_cloak: e.target.checked }))} />
                              <span>Breaking Cloak (opener: auto ×2 / Sonic Blow +10%)</span>
                            </label>
                          </div>
                        )}
                        {isSuperNovice && (
                          <div className="field field-checkbox" key="__sn_never_died">
                            <label title="Super Novice: reaching job level 70+ without ever dying grants +10 to all stats (lost on the next death). Only applies while job level is 70 or higher.">
                              <input
                                type="checkbox"
                                checked={!!data.flags?.sn_never_died}
                                onChange={(e) => setData((prev) => ({ ...prev, flags: { ...(prev.flags || {}), sn_never_died: e.target.checked } }))}
                              />
                              <span>Never died (job 70+: all stats +10)</span>
                            </label>
                          </div>
                        )}
                        {isKnightLine && (
                          <div className="field field-checkbox" key="__riding_peco">
                            <label title="Riding a Peco Peco (Knight/Crusader line): mounting adds an attack-speed penalty, reduced by one rank's worth per level of Cavalier Mastery and fully removed at Cavalier Mastery 5. Also raises Spear Mastery ATK per level (higher while mounted).">
                              <input type="checkbox" checked={!!data.flags?.is_riding_peco} onChange={(e) => setData((prev) => ({ ...prev, flags: { ...(prev.flags || {}), is_riding_peco: e.target.checked } }))} />
                              <span>Riding Peco Peco</span>
                            </label>
                          </div>
                        )}
                        {isMonkLine && (
                          <div className="field" key="__spirit_spheres">
                            <label title="Active spirit spheres: each adds +3 ATK to all Monk/Champion attacks — auto-attacks, combos, and Asura Strike (where it's amplified by ×(8 + SP/10)). Max 5 (Monk) / 15 (Champion).">
                              Spirit spheres (0–{maxSpheres})
                            </label>
                            <input
                              className="mono"
                              type="number"
                              min={0}
                              max={maxSpheres}
                              value={(data.flags?.spirit_spheres as number) ?? 0}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(maxSpheres, Number(e.target.value) || 0));
                                setData((prev) => ({ ...prev, flags: { ...(prev.flags || {}), spirit_spheres: v || undefined } }));
                              }}
                            />
                          </div>
                        )}
                        {isGunslinger && (
                          <div className="field" key="__gs_coins">
                            <label title="Coins in hand from Coin Flip as you attack, max 10. Each one is worth +3 ATK on every hit (so 10 coins = +30), the same flat bonus a Monk gets per spirit sphere — it ignores the target's DEF and is multiplied by a skill's hit count. Fling additionally throws up to 5 of them for (job level + base level) damage each and cuts the target's DEF by 3% per coin. Soul Bullet, Tranq Shot and Disarm each need 1 to cast. Barrage's 2 and Run and Gun's 1 are NOT deducted here: you pay those when the stance goes up and refill with Coin Flip before attacking.">
                              Coins (0–10)
                            </label>
                            <input
                              className="mono"
                              type="number"
                              min={0}
                              max={10}
                              value={(data.flags?.gs_coins as number) ?? 0}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => {
                                const v = Math.max(0, Math.min(10, Number(e.target.value) || 0));
                                setData((prev) => ({ ...prev, flags: { ...(prev.flags || {}), gs_coins: v || undefined } }));
                              }}
                            />
                            {coinsHeld > 0 && coinSpend.length === 0 && (
                              <span className="coin-spend" title="Held coins are worth +3 ATK each on every hit, the same flat bonus a Monk gets per spirit sphere — it ignores the target's DEF and is multiplied by a skill's hit count. Fling is the only skill that also spends them for damage of their own.">
                                +{coinsHeld * 3} ATK from coins
                              </span>
                            )}
                            {coinSpend.length > 0 && (
                              <span
                                className={`coin-spend${coinsShort ? " coin-spend--short" : ""}`}
                                title={coinSpend.map((c) => `${c.label}: ${c.cost}`).join(" · ")}
                              >
                                {coinsShort
                                  ? `Needs ${coinsSpent} — ${coinsSpent - coinsHeld} short`
                                  : `Spending ${coinsSpent} of ${coinsHeld}`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div className="buff-section-header">
                    Party buffs
                    <InfoTooltip>
                      Received from a party member, not self-cast — these are never
                      filtered by your own job, since any class can stand in
                      another player's buff range. Checking a buff applies its
                      max level (you don't control the caster's actual level).
                    </InfoTooltip>
                  </div>

                  <div className="buff-group">
                    <span className="buff-group-label">Priest</span>
                    <div className="passive-grid">
                      {partyBuffsFrom("Priest", data.job_id).map((b) => {
                        const current = (data.support_buffs as Record<string, number> | undefined)?.[b.key] ?? 0;
                        return (
                          <div className="field field-checkbox" key={b.key}>
                            <label title={b.key}>
                              <input
                                type="checkbox"
                                checked={current > 0}
                                onChange={(e) => updateBuffField("support_buffs", b.key, e.target.checked ? b.max : 0)}
                              />
                              <span>{b.label}</span>
                            </label>
                          </div>
                        );
                      })}
                      <div className="field">
                        <label title="Priest weapon endow / Aspersio, plus Enchant Poison and Cursed Water">Weapon endow</label>
                        <select value={endowValue} onChange={(e) => updateWeaponEndow(e.target.value)}>
                          <option value="">None</option>
                          <option value="SC_ASPERSIO">Aspersio (Holy)</option>
                          <option value="SC_PROPERTYFIRE">Endow Fire</option>
                          <option value="SC_PROPERTYWATER">Endow Water</option>
                          <option value="SC_PROPERTYWIND">Endow Wind</option>
                          <option value="SC_PROPERTYGROUND">Endow Ground</option>
                          <option value="SC_ENCHANTPOISON">Enchant Poison</option>
                          <option value="SC_ENCHANTARMS">Cursed Water (Shadow)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="buff-group">
                    <span className="buff-group-label">Blacksmith</span>
                    <div className="passive-grid">
                      {partyBuffsFrom("Blacksmith", data.job_id).map((b) => {
                        const current = (data.support_buffs as Record<string, number> | undefined)?.[b.key] ?? 0;
                        return (
                          <div className="field field-checkbox" key={b.key}>
                            <label title={b.key}>
                              <input
                                type="checkbox"
                                checked={current > 0}
                                onChange={(e) => updateBuffField("support_buffs", b.key, e.target.checked ? b.max : 0)}
                              />
                              <span>{b.label}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Crazy Uproar is the whole Merchant group, and it's hidden from the
                      Merchant line itself (they self-cast it), so the group can empty
                      out entirely — don't leave a bare header behind. */}
                  <div className="buff-group" hidden={partyBuffsFrom("Merchant", data.job_id).length === 0}>
                    <span className="buff-group-label">Merchant</span>
                    <div className="passive-grid">
                      {partyBuffsFrom("Merchant", data.job_id).map((b) => {
                        const current = (data.support_buffs as Record<string, number> | undefined)?.[b.key] ?? 0;
                        return (
                          <div className="field field-checkbox" key={b.key}>
                            <label title={b.key}>
                              <input
                                type="checkbox"
                                checked={current > 0}
                                onChange={(e) => updateBuffField("support_buffs", b.key, e.target.checked ? b.max : 0)}
                              />
                              <span>{b.label}</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="buff-group">
                    <span className="buff-group-label">Sage</span>
                    <div className="passive-grid">
                      <div className="field">
                        <label title="SA_VOLCANO / SA_DELUGE / SA_VIOLENTGALE — applies max level when selected">Ground effect</label>
                        <select
                          value={groundEffectType}
                          onChange={(e) => updateGroundEffect(e.target.value, groundEffectMax)}
                        >
                          <option value="">None</option>
                          <option value="SC_VOLCANO">Volcano (Fire, +ATK/+MATK)</option>
                          <option value="SC_DELUGE">Deluge (Water, +HP regen)</option>
                          <option value="SC_VIOLENTGALE">Violent Gale (Wind, +Flee/move speed)</option>
                        </select>
                      </div>
                      {isSageLine && (
                        <div className="field">
                          <label title="Auto Spell (Hindsight): the activated level autocasts one spell at a flat 30% chance on every physical attack. Assumes the mapped spell is learned. Damage shows in the results as an Auto Spell proc branch.">Auto Spell (Hindsight)</label>
                          <select
                            value={autoSpellLv || ""}
                            onChange={(e) => updateAutoSpell(Number(e.target.value))}
                          >
                            <option value="">None</option>
                            {AUTO_SPELL_OPTIONS.map((o) => (
                              <option key={o.lv} value={o.lv}>{o.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="buff-section-header" title="From a party member, never filtered by your own job">Bard / Dancer songs</div>
                  <div className="passive-grid">
                    {SONG_BUFFS.map((b) => (
                      <div className="field" key={b.key}>
                        <label title={`${b.key}${b.hint ? ` — ${b.hint}` : ""}`}>{b.label}</label>
                        <input
                          className="mono"
                          type="number"
                          min={0}
                          max={b.max}
                          value={data.song_state?.[b.key] ?? 0}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateBuffField("song_state", b.key, Math.max(0, Math.min(b.max, Number(e.target.value))))}
                        />
                      </div>
                    ))}
                  </div>

                  {(hasBardSong || hasDancerSong) && (
                    <>
                      <div
                        className="buff-section-header"
                        title="A song's strength comes from the performer's stats, not yours. Left blank, each is treated as 1 — the weakest possible performer."
                      >
                        Performer stats
                        <span
                          className="beta-badge"
                          title="Beta — the PS wiki confirms each song's published endpoints (Bragi −30% cast / −50% delay at Lv10, Service for You +25% MaxSP / −50% SP cost) and states that the performer's stats and Lesson level affect them, but it does not publish the per-point rates. Those come from the pre-renewal emulator, so the totals in between are unverified against in-game numbers."
                        >
                          beta
                        </span>
                      </div>
                      {([
                        [BARD_PERFORMER, hasBardSong],
                        [DANCER_PERFORMER, hasDancerSong],
                      ] as const).map(([perf, show]) => show && (
                        <div className="buff-group" key={perf.who}>
                          <span className="buff-group-label">{perf.who}</span>
                          <div className="perf-stat-grid">
                            {perf.stats.map((f) => (
                              <div className="perf-stat-card" key={f.key} title={f.hint}>
                                <div className="perf-stat-name">{f.label}</div>
                                <input
                                  className="mono"
                                  type="number"
                                  min={0}
                                  max={f.max}
                                  value={data.song_state?.[f.key] ?? 0}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => updateBuffField("song_state", f.key, Math.max(0, Math.min(f.max, Number(e.target.value))))}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="passive-grid perf-lesson-row">
                            <div className="field">
                              <label title={perf.lesson.hint}>{perf.lesson.label}</label>
                              <input
                                className="mono"
                                type="number"
                                min={0}
                                max={perf.lesson.max}
                                value={data.song_state?.[perf.lesson.key] ?? 0}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateBuffField("song_state", perf.lesson.key, Math.max(0, Math.min(perf.lesson.max, Number(e.target.value))))}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  <div className="buff-section-header">Clan</div>
                  <div className="passive-grid">
                    <div className="field">
                      <label>Clan membership</label>
                      <select
                        value={data.clan ?? ""}
                        onChange={(e) => updateField(["clan"], e.target.value || undefined)}
                      >
                        <option value="">None</option>
                        <option value="sword_clan">Sword Clan (STR+1, VIT+1)</option>
                        <option value="arch_wand_clan">Arch Wand Clan (INT+1, DEX+1)</option>
                        <option value="golden_mace_clan">Golden Mace Clan (INT+1, VIT+1)</option>
                        <option value="crossbow_clan">Crossbow Clan (DEX+1, AGI+1)</option>
                        <option value="artisan_clan">Artisan Clan (DEX+1, LUK+1)</option>
                        <option value="vile_wind_clan">Vile Wind Clan (STR+1, AGI+1)</option>
                      </select>
                    </div>
                  </div>
                </>
              );
            })()}
          </Panel>

          <Panel eyebrow="07" title="Skill">
            <div className="selected-pill" style={{ marginBottom: "0.6rem" }}>
              <span>{skill.label}{skill.id !== 0 ? ` Lv.${skill.level}` : ""}</span>
              {skill.id !== 0 && (
                <input
                  className="mono"
                  type="number"
                  min={1}
                  max={skill.max_level}
                  style={{ width: 60 }}
                  value={skill.level}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setSkill((s) => ({ ...s, level: Math.max(1, Math.min(s.max_level, Number(e.target.value))) }))}
                />
              )}
            </div>
            <div className="field-row">
              <button onClick={() => setSkill(DEFAULT_SKILL)}>Use normal attack</button>
            </div>
            <div className="field" style={{ marginTop: "0.6rem" }}>
              <label>Or search a skill</label>
              <SearchPicker
                placeholder="Search skills…"
                search={skillSearch}
                // Default to the skill's MAX rank: that's what a build is nearly
                // always planned around, and Lv1 made every fresh pick look
                // pointlessly weak. The rank input right next to it still moves.
                onSelect={(r) => {
                  const cap = r.max_level ?? 10;
                  setSkill({ id: r.id, level: cap, label: r.label, max_level: cap });
                }}
              />
            </div>
            {skill.id === 212 && data.server === "payon_stories" && (
              <div className="field field-checkbox" style={{ marginTop: "0.5rem" }}>
                <label title="PS Rogue rework: monster not currently targeting the Rogue (PvP: player not facing the Rogue) — grants ×1.4 multiplicative damage bonus">
                  <input
                    type="checkbox"
                    checked={!!(data.support_buffs as Record<string, unknown>)?.backstab_opportunity}
                    onChange={(e) => setData((prev) => {
                      const next: Record<string, unknown> = { ...(prev.support_buffs || {}) };
                      if (e.target.checked) next.backstab_opportunity = true;
                      else delete next.backstab_opportunity;
                      return { ...prev, support_buffs: next };
                    })}
                  />
                  <span>Backstab opportunity (+40%)</span>
                </label>
              </div>
            )}
            {(skill.id === 530 || skill.id === 528) && data.server === "payon_stories" && (
              <div className="field field-checkbox" style={{ marginTop: "0.5rem" }}>
                <label title="PS Ninja: casting from Hiding/Cloaking boosts this skill's damage (Shadow Slash uses the higher hide-on ratio and skips the range penalty; Haze Slash deals ×1.4).">
                  <input
                    type="checkbox"
                    checked={!!(data.support_buffs as Record<string, unknown>)?.ninja_hiding}
                    onChange={(e) => setData((prev) => {
                      const next: Record<string, unknown> = { ...(prev.support_buffs || {}) };
                      if (e.target.checked) next.ninja_hiding = true;
                      else delete next.ninja_hiding;
                      return { ...prev, support_buffs: next };
                    })}
                  />
                  <span>Cast from Hiding</span>
                </label>
              </div>
            )}
          </Panel>

          <Panel eyebrow="08" title="Target">
            <div className="tabs">
              <button className={targetMode === "monster" ? "active" : ""} onClick={() => setTargetMode("monster")}>Monster</button>
              <button className={targetMode === "custom" ? "active" : ""} onClick={() => setTargetMode("custom")}>Custom stats</button>
            </div>

            {targetMode === "monster" && (
              <>
                {data.target_mob_id != null ? (
                  <>
                  <div className="selected-pill">
                    <span>
                      {mobInfo ? mobInfo.name : `Mob #${data.target_mob_id}`}
                      {mobInfo ? ` (Lv.${mobInfo.level})` : ""}
                      {mobInfo?.is_boss ? " · Boss" : ""}
                    </span>
                    <button onClick={() => updateField(["target_mob_id"], null)}>Change</button>
                  </div>
                  {mobInfo && (
                    <div className="sec-stat-grid" style={{ marginTop: "0.6rem" }}>
                      {([
                        { label: "HP",      value: mobInfo.hp?.toLocaleString() },
                        { label: "Race",    value: mobInfo.race },
                        { label: "Element", value: mobInfo.element != null ? `${ELEMENT_NAMES[mobInfo.element] ?? mobInfo.element} ${mobInfo.element_level ?? 1}` : undefined },
                        { label: "Size",    value: mobInfo.size },
                        { label: "DEF",     value: mobInfo.def_ != null ? String(mobInfo.def_) : undefined },
                        { label: "MDEF",    value: mobInfo.mdef != null ? String(mobInfo.mdef) : undefined },
                        { label: "ATK",     value: (mobInfo.atk_min != null && mobInfo.atk_max != null) ? `${mobInfo.atk_min}–${mobInfo.atk_max}` : undefined },
                        { label: "STR",     value: mobInfo.stats ? String(mobInfo.stats.str) : undefined },
                        { label: "AGI",     value: mobInfo.stats ? String(mobInfo.stats.agi) : undefined },
                        { label: "VIT",     value: mobInfo.stats ? String(mobInfo.stats.vit) : undefined },
                        { label: "INT",     value: mobInfo.stats ? String(mobInfo.stats.int) : undefined },
                        { label: "DEX",     value: mobInfo.stats ? String(mobInfo.stats.dex) : undefined },
                        { label: "LUK",     value: mobInfo.stats ? String(mobInfo.stats.luk) : undefined },
                        { label: "Flee",    value: mobBaseFlee != null ? (mobEffFlee !== mobBaseFlee ? `${mobBaseFlee} → ${mobEffFlee}` : String(mobBaseFlee)) : undefined, title: `The monster's own soft FLEE (level + AGI). ${mobEffFlee !== mobBaseFlee ? `Quagmire Lv${quagmireLv} lowers it from ${mobBaseFlee} to ${mobEffFlee}, raising your hit chance.` : "Lowered by Quagmire (−AGI)."}` },
                        { label: "Flee 95%", value: mobDodgeFlee != null ? mobDodgeFlee.toLocaleString() : undefined, title: `FLEE to dodge this monster 95% of the time (mob level + DEX + 75 = ${mobDodgeFlee ?? "?"}). Soft-flee only — Perfect Dodge is separate, and FLEE drops when several mobs attack at once.` },
                        { label: "HIT 100%", value: mobHit100 != null ? (mobHit100 !== mobBaseHit100 ? `${mobBaseHit100} → ${mobHit100}` : String(mobHit100)) : undefined, title: `HIT to land every attack on this monster (hit% = 80 + HIT − flee → 100% at flee + 20 = ${mobHit100 ?? "?"}).${mobHit100 !== mobBaseHit100 ? ` Quagmire Lv${quagmireLv} lowers it from ${mobBaseHit100} to ${mobHit100}.` : ""} Your HIT is in the Character stats readout.` },
                      ] as { label: string; value?: string; title?: string }[]).map(({ label, value, title }) => (
                        <div key={label} className="sec-stat-card" title={title}>
                          <div className="sec-stat-label">{label}</div>
                          <div className="sec-stat-value">{value ?? "—"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  </>
                ) : (
                  <SearchPicker placeholder="Search monsters…" search={mobSearch} onSelect={(r) => { updateField(["target_mob_id"], r.id); statsApi.trackFeature("target_pick"); }} />
                )}
              </>
            )}

            {targetMode === "custom" && (
              <>
                <div className="field-row">
                  <div className="field">
                    <label>DEF</label>
                    <input className="mono" type="number" value={customTarget.def_} onFocus={(e) => e.target.select()} onChange={(e) => setCustomTarget((t) => ({ ...t, def_: Number(e.target.value) }))} />
                  </div>
                  <div className="field">
                    <label>MDEF</label>
                    <input className="mono" type="number" value={customTarget.mdef_} onFocus={(e) => e.target.select()} onChange={(e) => setCustomTarget((t) => ({ ...t, mdef_: Number(e.target.value) }))} />
                  </div>
                  <div className="field">
                    <label>VIT</label>
                    <input className="mono" type="number" value={customTarget.vit} onFocus={(e) => e.target.select()} onChange={(e) => setCustomTarget((t) => ({ ...t, vit: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Level</label>
                    <input className="mono" type="number" value={customTarget.level} onFocus={(e) => e.target.select()} onChange={(e) => setCustomTarget((t) => ({ ...t, level: Number(e.target.value) }))} />
                  </div>
                  <div className="field">
                    <label>AGI</label>
                    <input className="mono" type="number" value={customTarget.agi} onFocus={(e) => e.target.select()} onChange={(e) => setCustomTarget((t) => ({ ...t, agi: Number(e.target.value) }))} />
                  </div>
                  <div className="field">
                    <label>LUK</label>
                    <input className="mono" type="number" value={customTarget.luk} onFocus={(e) => e.target.select()} onChange={(e) => setCustomTarget((t) => ({ ...t, luk: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Size</label>
                    <select value={customTarget.size} onChange={(e) => setCustomTarget((t) => ({ ...t, size: e.target.value }))}>
                      <option>Small</option><option>Medium</option><option>Large</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Race</label>
                    <select value={customTarget.race} onChange={(e) => setCustomTarget((t) => ({ ...t, race: e.target.value }))}>
                      {["Formless", "Undead", "Brute", "Plant", "Insect", "Fish", "Demon", "Demi-Human", "Angel", "Dragon"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label>Element</label>
                    <select className="mono" value={customTarget.element} onChange={(e) => setCustomTarget((t) => ({ ...t, element: Number(e.target.value) }))}>
                      {ELEMENT_NAMES.map((name, idx) => (
                        <option key={idx} value={idx}>{name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Element level</label>
                    <input className="mono" type="number" min={1} max={4} value={customTarget.element_level} onFocus={(e) => e.target.select()} onChange={(e) => setCustomTarget((t) => ({ ...t, element_level: Number(e.target.value) }))} />
                  </div>
                  <div className="field">
                    <label>Boss?</label>
                    <select value={customTarget.is_boss ? "yes" : "no"} onChange={(e) => setCustomTarget((t) => ({ ...t, is_boss: e.target.value === "yes" }))}>
                      <option value="no">No</option><option value="yes">Yes</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Target debuffs */}
            <div className="buff-section-header" style={{ marginTop: "1rem" }}>
              Target debuffs
              <InfoTooltip>
                Debuffs applied to the target before the damage calculation.
                Element status applies an ailment: Poison cuts the target&apos;s soft (VIT) DEF by
                50% (no element change); Frozen and Stone Curse override the element (Water/Earth),
                halve hard DEF, and grant auto-hit.
                Elemental Change (Sage) overrides the target&apos;s defensive element to
                Water/Earth/Fire/Wind at level 1 (no effect on MVP/boss).
                Lex Aeterna doubles all damage results.
                Skill debuffs and statuses apply their game mechanics to the target.
              </InfoTooltip>
            </div>

            <div className="field">
              <label title="Poison: −50% soft (VIT) DEF ailment (no element change). Frozen/Stone Curse: override element to Water/Earth, halve hard DEF, and grant auto-hit.">
                Element status
              </label>
              <select value={targetMods.element_status} onChange={(e) => setTargetMods((m) => ({ ...m, element_status: e.target.value }))}>
                <option value="">None</option>
                <option value="Poison">Poisoned (−50% soft DEF)</option>
                <option value="Frozen">Frozen (→ Water, −50% hard DEF, auto-hit)</option>
                <option value="Stone">Stone Curse (→ Earth, −50% hard DEF, auto-hit)</option>
              </select>
              {targetMods.element_status === "Frozen" && freezingTrapCantFreeze && (
                <span className="field-warn">
                  Rust-Worn Apparatus at 70+ base INT makes your Freezing Trap apply Slow, not
                  Freeze — this target won't be frozen by it.
                </span>
              )}
            </div>

            <div className="field">
              <label title="Elemental Change (Sage): overrides the target's defensive element to Water/Earth/Fire/Wind at level 1 (e.g. Water 1). Does not work on MVP/boss monsters.">
                Elemental Change (Sage)
              </label>
              <select value={targetMods.element_change} onChange={(e) => setTargetMods((m) => ({ ...m, element_change: e.target.value }))}>
                <option value="">None</option>
                <option value="Water">Water</option>
                <option value="Earth">Earth</option>
                <option value="Fire">Fire</option>
                <option value="Wind">Wind</option>
              </select>
            </div>

            <div className="field field-checkbox" style={{ marginTop: "0.4rem" }}>
              <label title="SC_LEXAETERNA: next hit deals ×2 damage. Applied to all damage branches.">
                <input type="checkbox" checked={targetMods.lex_aeterna} onChange={(e) => setTargetMods((m) => ({ ...m, lex_aeterna: e.target.checked }))} />
                <span>Lex Aeterna (×2 damage)</span>
              </label>
            </div>

            <div className="field field-checkbox" style={{ marginTop: "0.4rem" }}>
              <label title="Mailbreaker (PS): the target takes +10% physical AND magical damage. Applied by the Assassin's Venom Dust (while standing on the cloud, 5s) or by Hammer Fall, which also stuns. Works on MVP/boss monsters.">
                <input type="checkbox" checked={targetMods.mailbreaker} onChange={(e) => setTargetMods((m) => ({ ...m, mailbreaker: e.target.checked }))} />
                <span>Mailbreaker (+10% damage taken)</span>
              </label>
            </div>

            <div className="field field-checkbox">
              <label title="Blessing cast on an Undead-element or Demon-race monster is a debuff, not a buff: it halves the target's STR, INT and DEX regardless of skill level. Halving INT cuts its soft MDEF (INT + VIT/2), so this is a straight magic-damage gain — the reason a Priest blesses a Ghoul before opening. Ignored on any other target. MVP/boss immunity isn't modelled.">
                <input
                  type="checkbox"
                  checked={targetMods.offensive_blessing}
                  onChange={(e) => setTargetMods((m) => ({ ...m, offensive_blessing: e.target.checked }))}
                  disabled={!offensiveBlessingApplies}
                />
                <span>Offensive Blessing (halves Undead/Demon STR·INT·DEX)</span>
              </label>
            </div>

            <span className="buff-group-label" style={{ display: "block", marginTop: "0.75rem" }}>Debuff skills &amp; statuses</span>
            <div className="field debuff-field">
              <label title="WZ_QUAGMIRE: cuts the target's AGI/DEX by 10% per level (max 50% at Lv5), lowering its flee. Does NOT guarantee a hit; no effect on bosses; halved vs players.">
                Quagmire (−AGI/DEX → lower flee)
              </label>
              <select
                value={quagmireLv}
                onChange={(e) => setTargetMods((m) => ({ ...m, quagmire: Number(e.target.value) }))}
              >
                <option value={0}>Off</option>
                {[1, 2, 3, 4, 5].map((lv) => (
                  <option key={lv} value={lv}>Lv {lv}{lv === 5 ? " (max)" : ""}</option>
                ))}
              </select>
              {quagmireRedundant && (
                <div className="hint-text">
                  Your hit chance is already at the 100% cap — Quagmire only helps when you're missing
                  (it lowers flee, not damage).
                </div>
              )}
            </div>
            <div className="field field-checkbox">
              <label title={signumApplicable ? "AL_CRUCIS Lv10 (PS): hard DEF −50% (10 + 4×lv). Undead-element or Demon-race only." : "Signum Crucis only affects Undead-element or Demon-race targets"} style={!signumApplicable ? { opacity: 0.4, cursor: "not-allowed" } : undefined}>
                <input type="checkbox" checked={targetMods.signum_crucis} disabled={!signumApplicable} onChange={(e) => setTargetMods((m) => ({ ...m, signum_crucis: e.target.checked }))} />
                <span>Signum Crucis Lv10 (−50% hard DEF)</span>
              </label>
            </div>
            <div className="field debuff-field">
              <label title="SC_PROVOKE: target DEF −(5 + 5×lv)% (−55% at Lv10). No effect on Boss monsters. Independent of the player's own Auto Berserk self-buff.">
                Provoke (−DEF)
              </label>
              <select
                value={provokeLv}
                onChange={(e) => setTargetMods((m) => ({ ...m, provoke: Number(e.target.value) }))}
              >
                <option value={0}>Off</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((lv) => (
                  <option key={lv} value={lv}>Lv {lv}{lv === 10 ? " (max)" : ""}</option>
                ))}
              </select>
            </div>
            <div className="field debuff-field">
              <label title="GS_FLING: a Gunslinger throws coins at the target — each one cut its DEF by 3% for 20s (15% at the full 5 coins). Against a monster this reduces hard and soft DEF; against a player, soft DEF only. Whether Boss monsters resist it is not documented, so it is applied to them too.">
                Fling (−3% DEF per coin)
              </label>
              <select
                value={Number(targetMods.fling) || 0}
                onChange={(e) => setTargetMods((m) => ({ ...m, fling: Number(e.target.value) }))}
              >
                <option value={0}>Off</option>
                {Array.from({ length: 5 }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={c}>{c} coin{c === 1 ? "" : "s"} (−{3 * c}%){c === 5 ? " (max)" : ""}</option>
                ))}
              </select>
            </div>
            <div className="field debuff-field">
              <label title="Burning (PS): a 5-second stacking debuff — the Alchemist's Remote Detonator applies all 5 stacks at once when a Marine Sphere Bottle is carried. Each stack cuts the target's hard MDEF by 2 (which is what raises your magic damage here) and ticks 60 Fire magic damage per second.">
                Burning (−2 MDEF per stack)
              </label>
              <select
                value={burningStacks}
                onChange={(e) => setTargetMods((m) => ({ ...m, burning: Number(e.target.value) }))}
              >
                <option value={0}>Off</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n} stack{n > 1 ? "s" : ""}{n === 5 ? " (max)" : ""}</option>
                ))}
              </select>
              {burningStacks > 0 && (
                <div className="hint-text">
                  −{2 * burningStacks} hard MDEF for 5s. The Burning itself also ticks{" "}
                  {60 * burningStacks} Fire magic damage/s — that figure is before the target's
                  Fire resistance and MDEF, and it is the debuff's own damage, not part of your hit.
                </div>
              )}
            </div>
            <div className="field field-checkbox">
              <label title="SC_SLEEP: target cannot evade (auto-hit) and crit rate is doubled">
                <input type="checkbox" checked={targetMods.sleep} onChange={(e) => setTargetMods((m) => ({ ...m, sleep: e.target.checked }))} />
                <span>Asleep (auto-hit, ×2 crit rate)</span>
              </label>
            </div>
            <div className="field field-checkbox">
              <label title="SC_STUN: target cannot evade (auto-hit)">
                <input type="checkbox" checked={targetMods.stun} onChange={(e) => setTargetMods((m) => ({ ...m, stun: e.target.checked }))} />
                <span>Stunned (auto-hit)</span>
              </label>
            </div>
            <div className="field field-checkbox">
              <label title="SC_BLIND: the target's flee drops 25%, raising your hit rate. Not an auto-hit — a blinded monster still evades, just worse.">
                <input type="checkbox" checked={targetMods.blind} onChange={(e) => setTargetMods((m) => ({ ...m, blind: e.target.checked }))} />
                <span>Blinded (−25% target flee)</span>
              </label>
            </div>
            {hammerfallStatusCards.length > 0 && (
              <div className="hint-text">
                {hammerfallStatusCards.map((c) => (
                  <div key={c.id}>
                    <strong>{c.name}</strong> — {c.effect}. Tick <em>{c.toggle}</em> to price your
                    hits against a target you have put in that state.
                  </div>
                ))}
              </div>
            )}
          </Panel>

      </div>
      </div>

      <footer className="credits-footer">
        <div className="credits-disclaimer">
          Not affiliated with or maintained by the Payon Stories staff. Numbers may be inaccurate; verify anything important in-game.
        </div>
        <div className="credits-support">
          <span className="credits-support-text">A free fan project — donations help cover hosting costs</span>
        </div>
        <div className="credits-row">
          <span>Thanks to our testers:&nbsp;<span className="credits-names">Metan, hokageyyy, leafhill, knightzeroxx, kerfuffl, jenardpwet, halcyon02, Solepto, gibz0001</span></span>
          <span className="credits-sep">·</span>
          <span>Base engine by&nbsp;<span className="credits-names">tochoco.latte</span></span>
          <span className="credits-sep">·</span>
          <a className="credits-link" href="/guides.html">Build guides</a>
          <span className="credits-sep">·</span>
          <a className="credits-link" href="/mechanics.html">How it's calculated</a>
          <span className="credits-sep">·</span>
          <a className="credits-link" href="https://discord.gg/payonstories" target="_blank" rel="noreferrer">Discord</a>
          <span className="credits-sep">·</span>
          <a className="credits-link" href="https://cp.payonstories.com/" target="_blank" rel="noreferrer">PS Website</a>
        </div>
      </footer>
    </div>
  );
}

