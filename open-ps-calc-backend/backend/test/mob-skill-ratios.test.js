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
  // (SC_MAELSTROM used to live here too; it deals no damage at all — it turns cells
  // into dead cells — so it is classified NO_HP_DAMAGE, asserted below.)
  for (const s of ["MO_EXTREMITYFIST", "WL_CRIMSONROCK", "NPC_SELFDESTRUCTION", "NPC_SMOKING"]) {
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

test("Lady Huo's Adoramus and Drain Life are priced, and stay pinned to her cast levels", () => {
  // Both are Renewal 3rd-job skills (Arch Bishop / Warlock) that no PS player can
  // learn, so their formulas are behind #ifdef RENEWAL and they used to print no
  // number. PS's values were supplied for the levels Lady Huo actually casts.
  const profile = getProfile("payon_stories");
  assert.strictEqual(profile.magic_ratios.AB_ADORAMUS(10), 1400);
  assert.strictEqual(profile.magic_ratios.WL_DRAINLIFE(3), 750);

  // magic_ratios (not MOB_SKILL_RATIOS) is what reports them as PS-exact.
  for (const n of ["AB_ADORAMUS", "WL_DRAINLIFE"]) {
    assert.ok(!(n in MOB_SKILL_RATIOS), `${n} would be flagged estimated there`);
    assert.ok(!FLAT_UNMODELED_SKILLS.has(n), `${n} is no longer unmodeled`);
  }

  // The ratios are FLAT and verified at ONE level each, because Lady Huo is the only
  // caster of either. If a monsters.json regeneration adds another caster, or moves
  // her cast level, the flat constant silently becomes a fabricated number for that
  // level — so fail here instead and go get the real value.
  const db = require("../src/engine/data/pre-re/db/mob_skill_db.json");
  const casters = { AB_ADORAMUS: [], WL_DRAINLIFE: [] };
  for (const [mobId, list] of Object.entries(db)) {
    for (const s of Array.isArray(list) ? list : []) {
      if (s.name in casters) casters[s.name].push({ mobId, lv: s.lv });
    }
  }
  assert.deepEqual(casters.AB_ADORAMUS, [{ mobId: "3049", lv: 10 }],
    "only Lady Huo casts Adoramus, at Lv10 — the level 1400% was verified at");
  assert.deepEqual(casters.WL_DRAINLIFE, [{ mobId: "3049", lv: 3 }],
    "only Lady Huo casts Drain Life, at Lv3 — the level 750% was verified at");

  // Adoramus carries a NEGATIVE number_of_hits (cosmetic multi-hit): the ratio is the
  // whole skill and must be applied once, not ten times.
  loader.setProfile(profile);
  const ado = loader.getSkillByName("AB_ADORAMUS");
  assert.ok(ado.number_of_hits[9] < 0, "negative = cosmetic, damage applied once");
  assert.strictEqual(ado.attack_type, "Magic");
  assert.strictEqual(ado.element[9], "Ele_Holy");
});

test("Maelstrom deals no HP damage — it creates dead cells", () => {
  // skills.json already flags it NoDamage, but mob_skill_db.json is GENERATED with
  // `dmg = (Magic|Weapon && targets a foe)`, and Maelstrom is attack_type Magic aimed
  // at "around1" — so the generated entry says dmg:true. That is why classifying it
  // here matters: without it the resolver treats it as a damage skill it merely
  // cannot price, telling the reader to expect a hit that never lands.
  assert.ok(NO_HP_DAMAGE_SKILLS.has("SC_MAELSTROM"));
  assert.ok(!FLAT_UNMODELED_SKILLS.has("SC_MAELSTROM"), "not a damage skill at all");
  assert.ok(!("SC_MAELSTROM" in MOB_SKILL_RATIOS));

  loader.setProfile(getProfile("payon_stories"));
  const sk = loader.getSkillByName("SC_MAELSTROM");
  assert.ok((sk.damage_type || []).includes("NoDamage"), "skills.json agrees");

  // The generated mob entry really does mis-flag it, so this classification is load
  // bearing rather than belt-and-braces. If a regeneration ever fixes the generator,
  // this assertion is the thing that says so.
  const db = require("../src/engine/data/pre-re/db/mob_skill_db.json");
  const entry = (db["3049"] || []).find((s) => s.name === "SC_MAELSTROM");
  assert.ok(entry, "Lady Huo is its only caster");
  assert.strictEqual(entry.dmg, true, "generator still mis-flags it as damage");
});

test("the defender's size/race/boss resists reduce incoming damage, magic included", () => {
  // Regression for two silent holes found from a player's Survivability report:
  //  1. bSubSize was DESCRIBED but never aggregated (bonusDefinitions had no field),
  //     and playerBuildToTarget hardcoded `sub_size: {}` — so size resistance was
  //     worth 0 against everything, physical and magic alike.
  //  2. calculateCardFixMagic read only sub_ele + sub_race.RC_DemiHuman, dropping
  //     size, the caster's actual race, boss and the ranged rate.
  const { calculateIncomingMagicDamage } = require("../src/engine/calculators/incomingPipeline");
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const config = createBattleConfig();

  // Stone Buckler = bSubSize,Size_Large,5 · Penomena Card = bSubRace,RC_Formless,30.
  // Lady Huo (3049) is Formless / Large / boss, so both must bite.
  const mk = (equipped) => buildFromSaveSchema({
    job_id: 7, base_level: 99, job_level: 50,
    base_stats: { str: 60, agi: 50, vit: 80, int: 20, dex: 50, luk: 20 },
    equipped: { right_hand: 1101, armor: 2302, ...equipped },
  });
  const dmg = (equipped) => {
    const b = mk(equipped);
    const [gearBonuses, effBuild, weapon, status] = resolvePlayerState(b, config, profile);
    return {
      gb: gearBonuses,
      magic: calculateIncomingMagicDamage(3049, effBuild, status, gearBonuses, weapon,
        { ratio_override: 1400, ele_override: 6 }).avg_damage,
    };
  };

  const bare = dmg({});
  const buckler = dmg({ left_hand: 2114 });                          // −5% Large
  const both = dmg({ left_hand: 2114, left_hand_card1: 4314 });      // −5% Large, −30% Formless

  // The bonus must actually reach the aggregator now.
  assert.deepEqual(buckler.gb.sub_size, { Size_Large: 5 }, "bSubSize must aggregate");
  assert.deepEqual(both.gb.sub_race, { RC_Formless: 30 });

  // …and reduce the hit. Each was worth exactly nothing before.
  assert.ok(buckler.magic < bare.magic, "Stone Buckler must reduce incoming magic");
  assert.ok(both.magic < buckler.magic, "Penomena must reduce it further");

  // ~0.95 × 0.70. Bounded rather than exact so per-step flooring can't flake it.
  const ratio = both.magic / bare.magic;
  assert.ok(ratio > 0.660 && ratio < 0.667, `expected ≈0.665, got ${ratio.toFixed(4)}`);
});
