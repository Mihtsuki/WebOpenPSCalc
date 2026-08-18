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

const {
  MOB_SKILL_RATIOS, NO_HP_DAMAGE_SKILLS, FLAT_UNMODELED_SKILLS, MOB_SKILL_ALIASES,
  MOB_SKILL_TARGET_STAT_DAMAGE,
} = require("../src/engine/mobSkillRatios");
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
  // Asura's power comes from the CASTER's SP, which mob_db doesn't carry, and the
  // monster-only 3rd-job skills are renewal-era with no pre-renewal formula — so
  // there is nothing honest to print for either. (NPC_DARKBREATH used to live here;
  // it now has a sourced target-stat formula, asserted in the next test.)
  for (const s of ["MO_EXTREMITYFIST", "WL_CRIMSONROCK", "SC_MAELSTROM", "NPC_SELFDESTRUCTION", "NPC_SMOKING"]) {
    assert.ok(FLAT_UNMODELED_SKILLS.has(s), `${s} should be flat/unmodeled`);
    assert.ok(!(s in MOB_SKILL_RATIOS), `${s} should not have a ratio`);
  }
});

test("target-stat skills are priced off the player, not the mob's ATK", () => {
  // Dark Breath takes a share of your CURRENT HP (10/12/16/25/50 by level, 50% of
  // casts) and Soul Burn deals twice the SP it burns, but only at Lv5. Neither is a
  // ratio, so both must be in the target-stat table and in none of the others.
  const db = MOB_SKILL_TARGET_STAT_DAMAGE.NPC_DARKBREATH;
  assert.deepStrictEqual(db.pctByLevel, [10, 12, 16, 25, 50]);
  assert.strictEqual(db.quantity, "hp");
  assert.strictEqual(db.chancePct, 50);

  const sb = MOB_SKILL_TARGET_STAT_DAMAGE.PF_SOULBURN;
  assert.strictEqual(sb.quantity, "sp");
  assert.strictEqual(sb.multiplierByLevel[4], 2);      // Lv5 deals 2× the SP burned
  assert.strictEqual(sb.multiplierByLevel[0], 0);      // Lv1 burns SP but deals no HP damage

  // A skill must land in exactly one bucket — a name in two of them would make the
  // resolver's answer depend on the order the branches happen to be checked in.
  for (const name of Object.keys(MOB_SKILL_TARGET_STAT_DAMAGE)) {
    assert.ok(!(name in MOB_SKILL_RATIOS), `${name} is target-stat, not a ratio`);
    assert.ok(!FLAT_UNMODELED_SKILLS.has(name), `${name} is priceable, not unmodeled`);
    assert.ok(!NO_HP_DAMAGE_SKILLS.has(name), `${name} does deal HP damage`);
  }
});

test("a mob casting Spiral Pierce is priced under both of its skill ids", () => {
  // Eight mobs cast the player id (397) and one the clone (8218); a monster has no
  // weapon to weigh, so both are the same ATK × level hit. Per hit, over 5 hits.
  for (const name of ["LK_SPIRALPIERCE", "ML_SPIRALPIERCE"]) {
    assert.strictEqual(typeof MOB_SKILL_RATIOS[name], "function", `${name} should be priced`);
    assert.strictEqual(MOB_SKILL_RATIOS[name](5) * 5, 500, `${name} Lv5 = ATK × 5 in total`);
    assert.strictEqual(MOB_SKILL_RATIOS[name](1) * 5, 100, `${name} Lv1 = ATK × 1 in total`);
  }
  // The clone must NOT alias onto the player skill: that alias is what made it
  // borrow the (still unported, weapon-weight) player formula and come out unpriced.
  assert.ok(!("ML_SPIRALPIERCE" in MOB_SKILL_ALIASES), "the clone carries its own ratio");
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
  // Pierce, Sharp Shooting). Spiral Pierce is no longer among them — it carries its
  // own mob-side ratio instead, covered by its own test above.
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

test("Dark Claw is priced from the PS profile at 100%/level over its 3 hits", () => {
  // GC_DARKCROW is a Renewal 3rd-job (Guillotine Cross) skill no PS player can
  // learn, but monsters cast it — Twinorc (3977) has it at Lv2, 40% rate. It used
  // to sit in FLAT_UNMODELED_SKILLS ("renewal formula, PS value undocumented");
  // PS's actual value is 100 × SkillLv PER HIT, over the skill's 3 hits.
  const profile = getProfile("payon_stories");
  const fn = profile.weapon_ratios.GC_DARKCROW;
  assert.equal(typeof fn, "function", "must be priced from the PS profile, not the vanilla table");
  assert.strictEqual(fn(1), 100);
  assert.strictEqual(fn(2), 200);
  assert.strictEqual(fn(5), 500);

  // Living in weapon_ratios (not MOB_SKILL_RATIOS) is what makes the survivability
  // panel report it as PS-exact instead of an estimated Hercules baseline.
  assert.ok(!("GC_DARKCROW" in MOB_SKILL_RATIOS), "would be flagged `estimated` there");
  assert.ok(!FLAT_UNMODELED_SKILLS.has("GC_DARKCROW"), "no longer unmodeled");

  // The hit count comes from skills.json and the caller multiplies the per-hit
  // ratio by it, so Twinorc's Lv2 cast is 3 × 200% = 600% total. If this ever
  // reads 1, the per-hit ratio silently becomes the whole skill.
  loader.setProfile(profile);
  const sk = loader.getSkillByName("GC_DARKCROW");
  assert.deepEqual(sk.number_of_hits, [3, 3, 3, 3, 3]);
  assert.strictEqual(sk.attack_type, "Weapon");

  // And Twinorc really does carry it at Lv2 (guards against a monsters.json
  // regeneration quietly dropping the entry this was written for).
  const mobSkills = require("../src/engine/data/pre-re/db/mob_skill_db.json")["3977"];
  const dc = mobSkills.find((s) => s.name === "GC_DARKCROW");
  assert.ok(dc, "Twinorc must still list Dark Claw");
  assert.strictEqual(dc.lv, 2);
});
