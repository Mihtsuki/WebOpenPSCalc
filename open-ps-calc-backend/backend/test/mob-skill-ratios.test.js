/**
 * mob-skill-ratios.test.js — incoming mob-cast skill damage.
 *
 * Covers the NPC_* ratio table (Hercules-baseline formulas) and its
 * classification sets, plus an integration check that the incoming pipeline
 * actually scales damage by a ratio_override (the mechanism resolveMobSkillDamage
 * relies on to price a mob's cast skill).
 */
const test = require("node:test");
const assert = require("node:assert");

const { MOB_SKILL_RATIOS, NO_HP_DAMAGE_SKILLS, FLAT_UNMODELED_SKILLS, MOB_SKILL_ALIASES } = require("../src/engine/mobSkillRatios");
const { BF_WEAPON_RATIOS } = require("../src/engine/calculators/modifiers/skillRatio");
const { calculateIncomingPhysicalDamage } = require("../src/engine/calculators/incomingPipeline");
const { buildFromSaveSchema } = require("../src/engine/buildManager");
const { getProfile } = require("../src/engine/serverProfiles");
const { createBattleConfig } = require("../src/engine/config");
const { resolvePlayerState } = require("../src/engine/playerStateBuilder");
const { loader } = require("../src/engine/dataLoader");

test("NPC_ ratio formulas match the Hercules battle.c baseline", () => {
  // skillratio += 100*(lv-1)  =>  100*lv
  assert.strictEqual(MOB_SKILL_RATIOS.NPC_BLOODDRAIN(1), 100);
  assert.strictEqual(MOB_SKILL_RATIOS.NPC_BLOODDRAIN(3), 300);
  assert.strictEqual(MOB_SKILL_RATIOS.NPC_HELLJUDGEMENT(5), 500);
  assert.strictEqual(MOB_SKILL_RATIOS.NPC_PULSESTRIKE(10), 1000);
  // skillratio += 35*lv  =>  100 + 35*lv
  assert.strictEqual(MOB_SKILL_RATIOS.NPC_DARKCROSS(1), 135);
  assert.strictEqual(MOB_SKILL_RATIOS.NPC_DARKCROSS(10), 450);
  // skillratio += 100*lv  =>  100 + 100*lv
  assert.strictEqual(MOB_SKILL_RATIOS.NPC_ENERGYDRAIN(5), 600);
  // no ratio case in Hercules -> normal-attack-equivalent 100%
  for (const s of ["NPC_COMBOATTACK", "NPC_GUIDEDATTACK", "NPC_PIERCINGATT", "NPC_SPLASHATTACK",
                   "NPC_ARMORBRAKE", "NPC_SHIELDBRAKE", "NPC_HELMBRAKE", "NPC_CRITICALSLASH",
                   "NPC_DARKSTRIKE", "NPC_MAGICALATTACK", "NPC_DARKTHUNDER"]) {
    assert.strictEqual(MOB_SKILL_RATIOS[s](1), 100, `${s} lv1`);
    assert.strictEqual(MOB_SKILL_RATIOS[s](10), 100, `${s} lv10`);
  }
});

test("status/drain skills are classified as no-HP-damage, not priced", () => {
  for (const s of ["NPC_MENTALBREAKER", "NPC_CHANGEUNDEAD", "NPC_DARKBLESSING", "NPC_HALLUCINATION",
                   "NPC_LICK", "MG_STONECURSE", "AL_DECAGI", "WZ_QUAGMIRE", "SA_DISPELL",
                   "PR_LEXDIVINA", "PR_LEXAETERNA"]) {
    assert.ok(NO_HP_DAMAGE_SKILLS.has(s), `${s} should be no-HP-damage`);
    // and must not also carry a printable ratio (would contradict the UI)
    assert.ok(!(s in MOB_SKILL_RATIOS), `${s} should not have a ratio`);
  }
});

test("flat/special damage skills are marked unmodeled (no fabricated number)", () => {
  for (const s of ["NPC_DARKBREATH", "NPC_SELFDESTRUCTION", "NPC_SMOKING"]) {
    assert.ok(FLAT_UNMODELED_SKILLS.has(s), `${s} should be flat/unmodeled`);
    assert.ok(!(s in MOB_SKILL_RATIOS), `${s} should not have a ratio`);
  }
});

test("monster-clone skills alias onto their canonical player skill", () => {
  // Each aliased name must NOT carry its own NPC_ ratio (it borrows the player one)
  // and must NOT be misclassified as a no-damage / flat skill.
  for (const [clone, canon] of Object.entries(MOB_SKILL_ALIASES)) {
    assert.ok(!(clone in MOB_SKILL_RATIOS), `${clone} should defer to ${canon}, not have its own ratio`);
    assert.ok(!NO_HP_DAMAGE_SKILLS.has(clone), `${clone} is a damage skill`);
    assert.ok(!FLAT_UNMODELED_SKILLS.has(clone), `${clone} is priceable via ${canon}`);
  }
  // The damaging clones with a modeled player ratio resolve to a real % (Bash,
  // Pierce, Sharp Shooting). Spiral Pierce has no ratio yet -> intentionally absent.
  assert.strictEqual(typeof BF_WEAPON_RATIOS[MOB_SKILL_ALIASES.MS_BASH], "function");
  assert.strictEqual(typeof BF_WEAPON_RATIOS[MOB_SKILL_ALIASES.ML_PIERCE], "function");
  assert.strictEqual(typeof BF_WEAPON_RATIOS[MOB_SKILL_ALIASES.MA_SHARPSHOOTING], "function");
  // MS_BASH lv5 = SM_BASH lv5 = 100 + 30*5 = 250
  assert.strictEqual(BF_WEAPON_RATIOS[MOB_SKILL_ALIASES.MS_BASH](5), 250);
});

test("Pierce hit count resolves to 2 vs the Medium player (profile weapon_hit_counts)", () => {
  // The mob-cast Pierce hit count is driven by the PS profile's size-based hit
  // fn applied to the player-as-target (Medium) — so 2, not the skill_db's 3.
  const p = getProfile("payon_stories");
  const player = { size: "Medium", element: 0, race: "DemiHuman" };
  assert.strictEqual(p.weapon_hit_counts.KN_PIERCE(10, player, { skill_levels: {} }), 2);
  assert.strictEqual(p.weapon_hit_counts.ML_PIERCE(10, player, { skill_levels: {} }), 2);
});

test("PS profile ratios override vanilla for mob-cast player skills", () => {
  // The precedence resolveMobSkillDamage relies on: a PS-reworked skill that the
  // vanilla map lacks (Lord of Vermilion) must be priced from the PS profile.
  const p = getProfile("payon_stories");
  assert.strictEqual(typeof p.magic_ratios.WZ_VERMILION, "function");
  assert.strictEqual(p.magic_ratios.WZ_VERMILION(10), 2000, "Vermilion = 200×lv total");
  assert.strictEqual(typeof p.magic_ratios.WZ_FIREPILLAR, "function");
});

test("incoming pipeline scales damage monotonically with ratio_override", () => {
  loader.setProfile(getProfile("payon_stories"));
  const build = buildFromSaveSchema({
    job_id: 7, base_level: 90, job_level: 50,
    base_stats: { str: 1, agi: 40, vit: 50, int: 1, dex: 40, luk: 20 },
    equipped: {},
  });
  const config = createBattleConfig();
  const [gearBonuses, effBuild, weapon, status] = resolvePlayerState(build, config, getProfile("payon_stories"));
  const mobId = 1036; // Ghoul — has a real ATK range

  const run = (ratio) => calculateIncomingPhysicalDamage(
    mobId, effBuild, status, gearBonuses, weapon, config, { ratio_override: ratio });

  const at100 = run(100).avg_damage;
  const at300 = run(300).avg_damage; // e.g. NPC_BLOODDRAIN lv3
  assert.ok(at100 > 0, "baseline incoming damage should be positive");
  assert.ok(at300 > at100, `ratio 300 (${at300}) should exceed ratio 100 (${at100})`);
  // Ratio scales pre-DEF ATK; a flat soft/hard DEF is subtracted after, so the
  // multiple is < 3× but should be clearly super-linear vs a small bump.
  assert.ok(at300 > at100 * 1.8, `ratio 300 should be well above 1.8× ratio 100 (got ${(at300 / at100).toFixed(2)}×)`);
});
