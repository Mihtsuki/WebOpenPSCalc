/**
 * engine-units.test.js — invariants and unit tests for engine building blocks.
 *
 * Unlike the golden suite (exact frozen outputs), these encode PROPERTIES that
 * must hold regardless of formula tuning: pmf algebra, ratio precedence, equip
 * rules, import decoding, buff math.
 */
const test = require("node:test");
const assert = require("node:assert");

const { loader } = require("../src/engine/dataLoader");
const { getProfile, STANDARD } = require("../src/engine/serverProfiles");
loader.setProfile(getProfile("payon_stories"));

const { uniformPmf, scaleFloor, convolve, addFlat, pmfStats } = require("../src/engine/pmf");
const { calculateSkillRatio } = require("../src/engine/calculators/modifiers/skillRatio");
const { calculateHitChance } = require("../src/engine/calculators/modifiers/hitChance");
const { resolveWeapon, buildFromSaveSchema } = require("../src/engine/buildManager");
const { createTarget, createSkillInstance, createCalcContext, createStatusData } = require("../src/engine/models");
const { BattlePipeline } = require("../src/engine/calculators/battlePipeline");
const { createBattleConfig } = require("../src/engine/config");
const { resolvePlayerState } = require("../src/engine/playerStateBuilder");
const { importJaludev } = require("../src/engine/jaludevImport");
const { createDamageResult } = require("../src/engine/models");

const massOf = (pmf) => Object.values(pmf).reduce((a, b) => a + b, 0);
const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

// ---------------------------------------------------------------------------
// pmf algebra
// ---------------------------------------------------------------------------
test("pmf: uniformPmf covers the range with total probability 1", () => {
  const pmf = uniformPmf(10, 14);
  assert.strictEqual(Object.keys(pmf).length, 5);
  approx(massOf(pmf), 1);
});

test("pmf: scaleFloor floors each outcome and preserves mass", () => {
  const pmf = scaleFloor(uniformPmf(10, 14), 150, 100);
  approx(massOf(pmf), 1);
  const values = Object.keys(pmf).map(Number).sort((a, b) => a - b);
  assert.deepStrictEqual(values, [15, 16, 18, 19, 21]); // floor(v*1.5)
});

test("pmf: convolve of independent pmfs preserves mass and adds ranges", () => {
  const a = uniformPmf(1, 3);
  const b = uniformPmf(10, 20);
  const c = convolve(a, b);
  approx(massOf(c), 1);
  const [mn, mx] = pmfStats(c);
  assert.strictEqual(mn, 11);
  assert.strictEqual(mx, 23);
});

test("pmf: addFlat shifts every outcome; pmfStats orders min <= avg <= max", () => {
  const pmf = addFlat(uniformPmf(5, 9), 100);
  const [mn, mx, avg] = pmfStats(pmf);
  assert.strictEqual(mn, 105);
  assert.strictEqual(mx, 109);
  assert.ok(mn <= avg && avg <= mx);
});

// ---------------------------------------------------------------------------
// skill ratio precedence + Performing
// ---------------------------------------------------------------------------
function ratioOf(skillName, level, { performing = false, profile = getProfile("payon_stories") } = {}) {
  const skill = createSkillInstance({ id: require("./engineRunner").skillIdByName(skillName), level });
  const build = buildFromSaveSchema({ job_id: 19, base_stats: {}, server: "payon_stories" });
  if (performing) build.skill_params = { PS_PERFORMING_active: true };
  const ctx = createCalcContext({ skill_params: build.skill_params || {} });
  const result = createDamageResult();
  const [pmf] = calculateSkillRatio(skill, { 1000: 1.0 }, build, result, { profile, ctx });
  const [, , avg] = pmfStats(pmf);
  return { avg, steps: result.steps.map((s) => s.name) };
}

test("skillRatio: PS profile ratio overrides vanilla (Musical Strike 300% at lv5)", () => {
  const { avg } = ratioOf("BA_MUSICALSTRIKE", 5);
  assert.strictEqual(avg, 3000); // 1000 × 300%
});

test("skillRatio: Performing adds +100 ratio points and its own step", () => {
  const { avg, steps } = ratioOf("BA_MUSICALSTRIKE", 5, { performing: true });
  assert.strictEqual(avg, 4000); // 1000 × 400%
  assert.ok(steps.includes("Performing"), `missing Performing step: ${steps}`);
});

test("skillRatio: unknown skill falls back to 100% and flags the PS-unaudited warning", () => {
  // A single-hit skill with no ratio table entry and not in weapon_vanilla_ok:
  // Pressure's fixed-damage formula is still unported, so it falls back to flat
  // 100%. (If it later gets a dedicated branch, swap this for another unmodeled skill.)
  const { avg, steps } = ratioOf("PA_PRESSURE", 5);
  assert.strictEqual(avg, 1000);
  assert.ok(steps.some((n) => n.includes("Vanilla fallback")), `missing fallback warning: ${steps}`);
});

// ---------------------------------------------------------------------------
// hit chance
// ---------------------------------------------------------------------------
test("hitChance: 80 + hit − flee, clamped, and ailments auto-hit", () => {
  const config = createBattleConfig();
  const status = createStatusData();
  status.hit = 100;
  const mk = (flee, scs = {}) => createTarget({ flee, luk: 0, level: 1, agi: 1, target_active_scs: scs });
  assert.strictEqual(calculateHitChance(status, mk(80), config)[0], 100);  // 80+100-80
  assert.strictEqual(calculateHitChance(status, mk(60), config)[0], 100);  // capped
  assert.strictEqual(calculateHitChance(status, mk(300), config)[0], config.min_hitrate); // floored
  assert.strictEqual(calculateHitChance(status, mk(300, { SC_STUN: 1 }), config)[0], 100); // can't-move → auto-hit
});

test("accuracy bonuses scale with rank and are a % of hitrate, summed once", () => {
  const config = createBattleConfig();
  const status = createStatusData();
  status.hit = 100;
  // 80 + 100 − 130 = 50% base hitrate, so a bonus reads off directly as its %.
  const t = () => createTarget({ flee: 130, luk: 0, level: 1, agi: 1, target_active_scs: {} });
  const rate = (skill, lv, opts) => calculateHitChance(status, t(), config, skill, lv, opts)[0];

  assert.strictEqual(rate(null, 0), 50);
  // Holy Cross: +2% of hitrate per rank (PS wiki table), NOT a flat 20% at every
  // rank — Lv5 gives 50 × 1.10, Lv10 gives 50 × 1.20.
  assert.strictEqual(rate("CR_HOLYCROSS", 1), 51);
  assert.strictEqual(rate("CR_HOLYCROSS", 5), 55);
  assert.strictEqual(rate("CR_HOLYCROSS", 10), 60);
  // Vanilla-parity rank scalers confirmed on the PS wiki.
  assert.strictEqual(rate("SM_BASH", 10), 75);      // +5%/lv
  assert.strictEqual(rate("SM_MAGNUM", 10), 100);   // +10%/lv
  assert.strictEqual(rate("KN_PIERCE", 4), 60);     // +5%/lv
  assert.strictEqual(rate("PA_SHIELDCHAIN", 1), 60); // flat +20%
  // Sonic Accel is assumed learned (as in skillRatio) and switchable off.
  assert.strictEqual(rate("AS_SONICBLOW", 10), 75);
  assert.strictEqual(rate("AS_SONICBLOW", 10, { skill_params: { AS_SONICBLOW_sonic_accel: false } }), 50);
  // Weaponry Research's passive +2%/lv rides on every attack, skill or not, and
  // ADDS to a skill's bonus in one multiplier (battle.c sums into hitpercbonus).
  const wr = { mastery: { BS_WEAPONRESEARCH: 10 } };
  assert.strictEqual(rate(null, 0, wr), 60);
  assert.strictEqual(rate("CR_HOLYCROSS", 10, wr), 70); // 50 × (1 + 0.20 + 0.20)
});

// ---------------------------------------------------------------------------
// weapon element precedence
// ---------------------------------------------------------------------------
test("resolveWeapon: element override > ammo script element > weapon innate", () => {
  // 1101 Sword is Neutral (0)
  assert.strictEqual(resolveWeapon(loader, 1101, 0, null, {}).element, 0);
  assert.strictEqual(resolveWeapon(loader, 1101, 0, null, { script_atk_ele_rh: 3 }).element, 3);
  assert.strictEqual(resolveWeapon(loader, 1101, 0, 4, { script_atk_ele_rh: 3 }).element, 4);
});

test("an elemental forge sets the weapon's element, and an endow still beats it", () => {
  const cfg = createBattleConfig();
  const state = (forge, support = {}) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 10, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 40, vit: 40, int: 1, dex: 60, luk: 20 },
      equipped: { right_hand: 1101 }, forge, support_buffs: support,
    });
    return resolvePlayerState(b, cfg, PS);
  };
  // Flame Heart forge → Fire (3). It counts as forged on its own: you can forge a
  // Fire weapon with no Star Crumbs in it, and that must not invent a crumb bonus.
  const [, effFire, fire] = state({ right_hand: { ele: 3 } });
  assert.equal(fire.element, 3);
  assert.equal(fire.forge_sc_count, 0, "an element alone is not a Star Crumb");
  assert.equal(effFire.is_forged, true);
  // Crumbs and element are independent.
  const [, , both] = state({ right_hand: { sc: 2, ele: 1 } });
  assert.equal(both.element, 1, "Mystic Frozen → Water");
  assert.equal(both.forge_sc_count, 2);
  // Only blacksmith-forgeable weapons can be forged at all — a bow ignores it.
  const bowBuild = buildFromSaveSchema({
    server: "payon_stories", job_id: 11, base_level: 99, job_level: 50,
    base_stats: { str: 50, agi: 60, vit: 40, int: 1, dex: 90, luk: 20 },
    equipped: { right_hand: 1707 }, forge: { right_hand: { sc: 2, ele: 3 } },
  });
  assert.equal(resolvePlayerState(bowBuild, cfg, PS)[2].element, 0, "not a forgeable weapon");
  // An active endow overrides the forged element, as in game.
  const [, , endowed] = state({ right_hand: { ele: 3 } }, { weapon_endow_sc: "SC_PROPERTYWATER" });
  assert.equal(endowed.element, 1, "Water endow beats the Fire forge");

  // And it reaches the damage: Fire vs an Undead-1 Ghoul beats Neutral.
  const dmg = (forge) => runScenario({
    name: "forge", target: 1036,
    build: {
      job_id: 10, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 40, vit: 40, int: 1, dex: 60, luk: 20 },
      equipped: { right_hand: 1101 }, forge,
    },
  }).result.normal.avg;
  assert.ok(dmg({ right_hand: { ele: 3 } }) > dmg({}), "Fire must beat Neutral vs Undead");
});

test("a forged weapon carries no cards", () => {
  // The forge writes the crafter's signature and the crumb/element data into the
  // item's card slots, so a forged weapon physically has no room for a card. The
  // editor hides the pickers; this is the funnel that also fixes builds shared
  // before it did, and any API caller.
  const eq = {
    right_hand: 1101, right_hand_card1: 4035, right_hand_card2: 4035,
    armor: 2302, armor_card1: 4035,
  };
  const mk = (forge, equipped = eq) => buildFromSaveSchema({
    server: "payon_stories", job_id: 10, base_level: 99, job_level: 50,
    base_stats: { str: 90, agi: 40, vit: 40, int: 1, dex: 60, luk: 20 },
    equipped, forge,
  }).equipped;

  assert.equal(mk({}).right_hand_card1, 4035, "unforged keeps its cards");
  for (const forge of [{ sc: 1 }, { ranked: true }, { ele: 3 }]) {
    const out = mk({ right_hand: forge });
    assert.equal(out.right_hand_card1, undefined, `${JSON.stringify(forge)} must clear weapon cards`);
    assert.equal(out.right_hand_card2, undefined);
    assert.equal(out.right_hand, 1101, "the weapon itself stays");
    assert.equal(out.armor_card1, 4035, "other slots are untouched");
  }
  // A weapon that can't be forged never loses anything — the forge fields are inert
  // there in the first place (Fire Brand is not on the blacksmith forge list).
  const named = mk({ right_hand: { sc: 2 } }, { right_hand: 1133, right_hand_card1: 4035 });
  assert.equal(named.right_hand_card1, 4035);

  // Each hand is forged separately, so forging one must not disarm the other.
  const dual = { right_hand: 1201, right_hand_card1: 4035, left_hand: 1201, left_hand_card1: 4035 };
  const lhOnly = mk({ left_hand: { sc: 1 } }, dual);
  assert.equal(lhOnly.left_hand_card1, undefined, "off-hand forge clears the off-hand card");
  assert.equal(lhOnly.right_hand_card1, 4035, "…and leaves the main hand alone");
});

test("the off-hand weapon is forged in its own right", () => {
  const cfg = createBattleConfig();
  const dps = (forge) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 12, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 90, vit: 40, int: 1, dex: 60, luk: 40 },
      equipped: { right_hand: 1201, left_hand: 1201 },
      mastery_levels: { AS_RIGHT: 5, AS_LEFT: 5 }, forge,
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    const res = new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: 0, level: 1 }),
      loader.getMonster(1036), eff, gb);
    return { dps: res.dps, rh: res.normal.avg_damage, lh: (res.dw_lh_normal || {}).avg_damage };
  };
  const none = dps({});
  const rhOnly = dps({ right_hand: { sc: 2 } });
  const lhOnly = dps({ left_hand: { sc: 2 } });
  // The off-hand used to be resolved with no forge data at all, so only the main
  // hand could ever be forged — a dual-wield Assassin forges each dagger.
  assert.ok(lhOnly.lh > none.lh, "off-hand crumbs must reach the off-hand hit");
  assert.equal(lhOnly.rh, none.rh, "…and only the off-hand hit");
  assert.equal(rhOnly.lh, none.lh, "the reverse too");
  assert.ok(dps({ left_hand: { ele: 3 } }).lh > none.lh, "the off-hand's own element applies (Fire vs Undead)");
});

test("fire arrow feeds weapon element via its bAtkEle script (no override)", () => {
  const build = buildFromSaveSchema({
    job_id: 19, base_level: 99, job_level: 50, base_stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 },
    equipped: { right_hand: 1905, ammo: 1752 }, server: "payon_stories",
  });
  const [, , weapon] = resolvePlayerState(build, createBattleConfig(), getProfile("payon_stories"));
  assert.strictEqual(weapon.element, 3); // Fire
});

// ---------------------------------------------------------------------------
// jaludev import
// ---------------------------------------------------------------------------
const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function NtoS2(v, len) { let s = ""; for (let i = 0; i < len; i++) { s = ALPHA[v % 62] + s; v = Math.floor(v / 62); } return s; }
function mkHash(fields) {
  const h = Array(91).fill("a");
  for (const [off, len, val] of fields) { const s = NtoS2(val, len); for (let i = 0; i < len; i++) h[off + i] = s[i]; }
  return h.join("");
}

test("jaludevImport: Bard hash → job/stats/instrument/arrow, no element override", () => {
  const hash = mkHash([[1, 2, 16], [3, 2, 99], [5, 2, 50], [13, 2, 99], [19, 1, 0], [22, 1, 2], [23, 2, 130], [25, 1, 7]]);
  const { build, unmapped } = importJaludev(`https://payonrocalc.jaludev.com/#${hash}`);
  assert.strictEqual(build.job_id, 19);            // Bard
  assert.strictEqual(build.base_level, 99);
  assert.strictEqual(build.base_stats.dex, 99);
  assert.strictEqual(build.equipped.right_hand, 1903); // Mandolin
  assert.strictEqual(build.refine.right_hand, 7);
  assert.strictEqual(build.equipped.ammo, 1752);   // Fire Arrow
  assert.strictEqual(build.weapon_element, undefined); // 0 must NOT persist as an override
  assert.deepStrictEqual(unmapped, []);
});

test("jaludevImport: manual element carries over; non-arrow jobs ignore the arrow byte", () => {
  const withEle = importJaludev("#" + mkHash([[1, 2, 16], [19, 1, 23], [22, 1, 5], [23, 2, 130]])); // 23 = speedpot 2, ele 3
  assert.strictEqual(withEle.build.weapon_element, 3);
  assert.strictEqual(withEle.build.equipped.ammo, 1754); // Crystal Arrow

  const knight = importJaludev("#" + mkHash([[1, 2, 7], [22, 1, 2], [23, 2, 130]]));
  assert.strictEqual(knight.build.equipped.ammo, undefined); // stale filler ignored
});

// ---------------------------------------------------------------------------
// Super Novice
// ---------------------------------------------------------------------------
function snStatus(extra = {}) {
  const data = {
    job_id: 23, base_level: 99, job_level: 99,
    base_stats: { str: 50, agi: 50, vit: 50, int: 50, dex: 50, luk: 50 },
    equipped: {}, server: "payon_stories", ...extra,
  };
  const [, , , st] = resolvePlayerState(buildFromSaveSchema(data), createBattleConfig(), getProfile("payon_stories"));
  return st;
}

test("SN: PS staged HP/SP bonuses land on the Novice base table", () => {
  const st = snStatus();
  // base 530×1.55 = 821 (+2400 PS), base SP 109×1.55 = 168 (+110 PS)
  assert.strictEqual(st.max_hp, 3221);
  assert.strictEqual(st.max_sp, 278);
});

test("SN: never-died +10 all stats gates on job level 70", () => {
  assert.strictEqual(snStatus({ flags: { sn_never_died: true } }).str, 65);
  assert.strictEqual(snStatus({ flags: { sn_never_died: true }, job_level: 69 }).str, snStatus({ job_level: 69 }).str);
});

test("SN: Fury chant (Explosion Spirits lv13) grants exactly +50% crit", () => {
  const delta = snStatus({ active_buffs: { SC_EXPLOSIONSPIRITS: 13 } }).cri - snStatus().cri;
  assert.strictEqual(delta, 500); // cri is in tenths of a percent
});

test("SN: Angel's Protection Set combo applies exactly once (MaxHP +900 / MaxSP +100)", () => {
  const bare = snStatus();
  const set = snStatus({ equipped: { head_top: 5125, armor: 2355, garment: 2521, shoes: 2420, left_hand: 2116 } });
  assert.strictEqual(set.max_hp - bare.max_hp, 900 + 100); // +900 combo, +100 Angel's Reincarnation item
  assert.strictEqual(set.max_sp - bare.max_sp, 100);
});

test("SN equip rule: Novice-flagged vanilla gear AND explicit-23 PS customs both match", () => {
  // The rule implemented in routes/data.ts + BuildEditor canEquip/invalidSlots:
  const snMatch = (job) => job.includes(23) || job.includes(0);

  // Vanilla gear carries no SN bit — SN equips it via the Novice base mask.
  const angelicGuard = loader.getItem(2116);
  assert.deepStrictEqual(angelicGuard.job, [0]);
  assert.ok(snMatch(angelicGuard.job));

  // PS custom gear lists 23 explicitly, sometimes WITHOUT the Novice bit —
  // a plain 23→0 remap would wrongly hide it (Guardian's Skull, 8122).
  const guardiansSkull = loader.getItem(8122);
  assert.ok(guardiansSkull.job.includes(23) && !guardiansSkull.job.includes(0));
  assert.ok(snMatch(guardiansSkull.job));

  // Non-novice vanilla gear stays hidden (Two-Handed Sword: swordman line only).
  const twoHander = loader.getItem(1157);
  assert.ok(Array.isArray(twoHander.job) && twoHander.job.length > 0 && !snMatch(twoHander.job));
});

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------
test("profiles: PS profile is layered on STANDARD without mutating it", () => {
  const ps = getProfile("payon_stories");
  assert.notStrictEqual(ps, STANDARD);
  assert.ok(ps.weapon_ratios.BA_MUSICALSTRIKE, "PS weapon ratio table missing Musical Strike");
  assert.strictEqual(Object.keys(STANDARD.sn_hp_bonus).length, 0, "vanilla profile must not carry PS SN bonuses");
});

// ---------------------------------------------------------------------------
// PS Auto Spell / "Hindsight" (SA_AUTOSPELL) autocast — wiki.payonstories.com/Auto_Spell
// ---------------------------------------------------------------------------
const { runScenario, runScenarioRaw } = require("./engineRunner");
const { skillUsesAmmo } = require("../src/engine/calculators/modifiers/baseDamage");

const SAGE_HINDSIGHT = (lv, server = "payon_stories", jobId = 16) => ({
  build: {
    server, job_id: jobId, base_level: 99, job_level: 50,
    base_stats: { str: 50, agi: 40, vit: 30, int: 70, dex: 60, luk: 20 },
    equipped: { right_hand: 1601 }, support_buffs: lv ? { auto_spell_lv: lv } : {},
  },
  target: 1002, // Poring (Water)
});

test("Hindsight: bolt rank surfaces an autocast proc branch spanning the Lv2–4 cast mix", () => {
  const as = runScenario(SAGE_HINDSIGHT(2)).result.proc_branches?.autospell;
  assert.ok(as, "expected proc_branches.autospell for Sage Hindsight Lv2");
  assert.ok(as.min < as.max, "bolt mix must span a range (Lv2 low → Lv4 high)");
  assert.ok(as.avg > as.min && as.avg < as.max, "avg lies inside the mix range");
});

test("Hindsight: proc adds damage — DPS with it exceeds the same build without it", () => {
  const withAS = runScenario(SAGE_HINDSIGHT(1)).result.dps;   // Soul Strike Lv5
  const without = runScenario(SAGE_HINDSIGHT(0)).result.dps;
  assert.ok(withAS > without, `autocast should raise DPS (${withAS} !> ${without})`);
});

test("Hindsight: no-damage ranks (9 Stone Curse / 10 Safety Wall) produce no branch", () => {
  assert.strictEqual(runScenario(SAGE_HINDSIGHT(9)).result.proc_branches, undefined);
  assert.strictEqual(runScenario(SAGE_HINDSIGHT(10)).result.proc_branches, undefined);
});

test("Hindsight: gated to PS profile and the Sage line", () => {
  // Standard (vanilla) profile lacks the SA_AUTOSPELL_PS flag.
  assert.strictEqual(runScenario(SAGE_HINDSIGHT(2, "standard")).result.proc_branches, undefined);
  // A non-Sage job with the field set is ignored (Knight = 7).
  assert.strictEqual(runScenario(SAGE_HINDSIGHT(2, "payon_stories", 7)).result.proc_branches, undefined);
});

// ---------------------------------------------------------------------------
// Auto Blitz Beat — a Falcon Hunter/Sniper's BOW auto-attack has a ⌊LUK/3⌋%
// chance to auto-trigger Blitz Beat (min(BB lv, ⌊jobLv/10⌋+1) hits, capped 5),
// folded into DPS as proc_branches.auto_blitz. wiki.payonstories.com/Blitz_Beat.
// ---------------------------------------------------------------------------
const FALCON_HUNTER = (opts = {}) => ({
  build: {
    server: "payon_stories", job_id: 11, base_level: 99, job_level: opts.jobLevel ?? 50,
    base_stats: { str: 1, agi: 90, vit: 1, int: 60, dex: 60, luk: 80 },
    equipped: { right_hand: opts.weapon ?? 1707 }, // 1707 Great Bow (default); 1101 Sword to test non-bow
    mastery_levels: { HT_FALCON: 1, HT_STEELCROW: 10, ...(opts.bb === 0 ? {} : { HT_BLITZBEAT: opts.bb ?? 5 }) },
  },
  // no `skill` → normal attack
  target: 1002,
});

test("Auto Blitz Beat: bow normal attack surfaces a proc branch at ⌊LUK/3⌋% chance", () => {
  // Live engine — runScenario's serialization drops proc_chances, so read it here.
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 11, base_level: 99, job_level: 50,
    base_stats: { str: 1, agi: 90, vit: 1, int: 60, dex: 60, luk: 80 },
    equipped: { right_hand: 1707 }, mastery_levels: { HT_FALCON: 1, HT_STEELCROW: 10, HT_BLITZBEAT: 5 },
  });
  const [gb, eff, weapon, status] = resolvePlayerState(b, createBattleConfig(), getProfile("payon_stories"));
  const r = new BattlePipeline(createBattleConfig()).calculate(
    status, weapon, createSkillInstance({ id: 0, level: 1 }),
    createTarget({ def_: 0, size: 1, race: 0, element: 0 }), eff, gb);
  assert.ok(r.proc_branches?.auto_blitz, "expected proc_branches.auto_blitz for a Falcon bow Hunter");
  assert.strictEqual(r.proc_chances.auto_blitz, Math.floor(status.luk / 3), "chance must be ⌊LUK/3⌋");
});

test("Auto Blitz Beat: raises DPS over the same build without Blitz Beat learned", () => {
  const withBB = runScenario(FALCON_HUNTER({ bb: 5 })).result;
  const without = runScenario(FALCON_HUNTER({ bb: 0 })).result;
  assert.strictEqual(without.proc_branches, undefined, "no Blitz Beat ⇒ no auto-blitz branch");
  assert.ok(withBB.dps > without.dps, `auto-blitz should raise DPS (${withBB.dps} !> ${without.dps})`);
});

test("Auto Blitz Beat: does not trigger on a non-bow weapon", () => {
  assert.strictEqual(runScenario(FALCON_HUNTER({ weapon: 1101 })).result.proc_branches, undefined);
});

test("Auto Blitz Beat: hit count is capped by job level (⌊jobLv/10⌋+1), not always 5", () => {
  const step20 = runScenario(FALCON_HUNTER({ jobLevel: 20 })).result.proc_branches.auto_blitz.steps[0];
  const step50 = runScenario(FALCON_HUNTER({ jobLevel: 50 })).result.proc_branches.auto_blitz.steps[0];
  assert.match(step20, /\(3 hits\)/, "jobLv20 (tier ⌊20/10⌋+1 = 3) → 3 hits even at Blitz Beat Lv5");
  assert.match(step50, /\(5 hits\)/, "jobLv50 → capped at Blitz Beat Lv5 = 5 hits");
});

// ---------------------------------------------------------------------------
// Improve Concentration (SC_CONCENTRATION) must not scale pet AGI/DEX — pet
// loyalty stat bonuses are equipment-like (pc_bonus/param_bonus), which IC
// excludes (status.c). Regression for the from_cards fix in buildApplicator.
// ---------------------------------------------------------------------------
test("pet AGI/DEX are excluded from Improve Concentration (not scaled)", () => {
  // Hunter, base DEX 15 (+1 job = 16 pre-IC), IC Lv10 (12%) — an IC flooring
  // boundary: if the pet's +1 DEX were folded into IC's base, the total would
  // jump by 2 (floor(17*.12)=2) instead of 1 (floor(16*.12)=1).
  const dexWith = (pet) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 11, base_level: 50, job_level: 1,
      base_stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 15, luk: 1 },
      equipped: {}, active_buffs: { SC_CONCENTRATION: 10 }, selected_pet: pet,
    });
    const [, , , status] = resolvePlayerState(b, createBattleConfig(), getProfile("payon_stories"));
    return status.dex;
  };
  const noPet = dexWith(null);
  const sohee = dexWith("sohee"); // Sohee = +1 DEX
  assert.strictEqual(sohee - noPet, 1, "Sohee's +1 DEX must add exactly 1 — Improve Concentration must not scale it");
});

// ---------------------------------------------------------------------------
// Pet Perfect Dodge units. status.flee2 is per-1000 (the UI shows flee2/10 %),
// so the wiki's "Perfect Dodge +1" for Smokie — the number the status window
// shows, i.e. a full 1% — must be stored as 10. It was stored as the literal 1,
// making Smokie worth 0.1%.
// ---------------------------------------------------------------------------
test("pet Perfect Dodge is in display units: Smokie = +1%, Hunter Fly = +2%", () => {
  const flee2With = (pet) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 11, base_level: 50, job_level: 1,
      base_stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 15, luk: 1 },
      equipped: {}, active_buffs: {}, selected_pet: pet,
    });
    const [, , , status] = resolvePlayerState(b, createBattleConfig(), getProfile("payon_stories"));
    return status.flee2;
  };
  const noPet = flee2With(null);
  assert.strictEqual(flee2With("smokie") - noPet, 10, "Smokie must add 1.0% Perfect Dodge (10 per-1000)");
  assert.strictEqual(flee2With("hunter_fly") - noPet, 20, "Hunter Fly must add 2.0% Perfect Dodge (20 per-1000)");
});

// ---------------------------------------------------------------------------
// INT breakpoints (MATK + SP regen). The /breakpoints endpoint surfaces these
// by re-running statusCalculator with bumped INT; these pin the formula shape
// that detection assumes — pre-re MATK jumps at INT multiples of 5 (max) / 7
// (min), and natural SP regen rises with INT.
// ---------------------------------------------------------------------------
function intStatus(baseInt) {
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 9, base_level: 99, job_level: 50, // Wizard, no MATK% gear
    base_stats: { str: 1, agi: 1, vit: 1, int: baseInt, dex: 1, luk: 1 }, equipped: {},
  });
  return resolvePlayerState(b, createBattleConfig(), getProfile("payon_stories"))[3];
}

test("MATK follows INT + floor(INT/5)² (max) / INT + floor(INT/7)² (min) — INT-breakpoint basis", () => {
  for (const baseInt of [10, 33, 50, 77, 99]) {
    const st = intStatus(baseInt);
    const n = st.int_; // actual resolved INT (job bonuses included)
    assert.strictEqual(st.matk_max, n + Math.floor(n / 5) ** 2, `max MATK at INT ${n}`);
    assert.strictEqual(st.matk_min, n + Math.floor(n / 7) ** 2, `min MATK at INT ${n}`);
  }
});

test("MATK max gains a bonus step across a multiple of 5, only the linear +1 off it", () => {
  // Compare consecutive resolved INT values; find one that lands on a multiple
  // of 5 and one that doesn't, and check the max-MATK delta at each.
  const maxAt = (bi) => intStatus(bi).matk_max;
  const intAt = (bi) => intStatus(bi).int_;
  // scan base INT until the resolved INT crosses a multiple of 5
  let stepBase = null, flatBase = null;
  for (let bi = 20; bi < 99 && (stepBase === null || flatBase === null); bi++) {
    const to = intAt(bi), from = intAt(bi - 1);
    if (to - from === 1) {
      if (to % 5 === 0 && stepBase === null) stepBase = bi;
      else if (to % 5 !== 0 && to % 7 !== 0 && flatBase === null) flatBase = bi;
    }
  }
  assert.ok(stepBase !== null && flatBase !== null, "expected both a mult-of-5 crossing and an off-breakpoint step");
  assert.ok(maxAt(stepBase) - maxAt(stepBase - 1) > 1, "max MATK should jump by more than 1 across a multiple of 5");
  assert.strictEqual(maxAt(flatBase) - maxAt(flatBase - 1), 1, "max MATK should rise by only 1 off a breakpoint");
});

test("natural SP regen increases with INT", () => {
  let prev = -1;
  for (const bi of [20, 40, 60, 80, 99]) {
    const sp = intStatus(bi).sp_regen;
    assert.ok(sp > prev, `sp_regen must increase with INT (INT base ${bi})`);
    prev = sp;
  }
});

// ---------------------------------------------------------------------------
// Item job restrictions. The Morpheus set is "All except Novice" — and since a
// Super Novice's equip check uses its base Novice class, SN can't wear it either.
// The vanilla item_db shipped these with an empty job array (→ treated as all
// jobs), so ps_item_manual restores the restriction. Guards against a regression
// back to the empty array (which would let Novice/SN equip them again).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Double Attack proc rate
//
// Reported by a player who worked out most of this from the numbers alone: a
// Sidewinder Card read 19% on a dagger and 5% on everything else, Double Attack 10
// plus the card read 75%, two cards in one weapon read more than one, and a Rogue
// got Double Attack from a bow but not from a sword.
//
// The rules, from wiki Class_Rebalance:
//   Thief - "Sidewinder Card ... adds 7% Double Attack to the weapon that is
//   compounded in. If the user already knows Double Attack it will use that skill
//   level chance."  -> the card lifts the dagger restriction, and the character's
//   own level sets the rate. It is NOT a separate chance added on top: vanilla
//   pairs every `skill TF_DOUBLE,N` with `bonus bDoubleRate,5*N`, one effect
//   written twice (skill for daggers, bonus for other weapons).
//   Rogue - "On rogues, sword mastery provides +7% chance to use double attack
//   with swords per level."  -> off SWORD MASTERY's level, not Double Attack's.
// ---------------------------------------------------------------------------
test("Double Attack: sources take the highest, and a card frees the weapon type", () => {
  const cfg = createBattleConfig();
  const SIDEWINDER = 4117, DAGGER = 1224, KNUCKLE = 1801, SWORD = 1101;
  const proc = (job_id, equipped, mastery_levels) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 90, vit: 1, int: 1, dex: 50, luk: 1 },
      equipped, mastery_levels,
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    return new BattlePipeline(cfg).calculate(
      status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1002), eff, gb,
    ).proc_chance;
  };

  // The skill on its own: 7%/lv on PS.
  assert.strictEqual(proc(17, { right_hand: DAGGER }, { TF_DOUBLE: 10 }), 70);

  // The card grants level 2, so 14% — NOT 14 + the script's bDoubleRate 5.
  assert.strictEqual(proc(17, { right_hand: DAGGER, right_hand_card1: SIDEWINDER }, {}), 14);

  // ...and it works on the weapon it is compounded in, whatever that is. This read
  // 5% on a knuckle before, because only the flat bonus escaped the dagger check.
  assert.strictEqual(proc(15, { right_hand: KNUCKLE, right_hand_card1: SIDEWINDER }, {}), 14);

  // A learned level wins over the card's; the two do not add (this was 75).
  assert.strictEqual(proc(17, { right_hand: DAGGER, right_hand_card1: SIDEWINDER }, { TF_DOUBLE: 10 }), 70);

  // Two cards are not better than one — bDoubleRate takes the highest, not the sum.
  assert.strictEqual(
    proc(17, { right_hand: DAGGER, right_hand_card1: SIDEWINDER, right_hand_card2: SIDEWINDER }, { TF_DOUBLE: 10 }),
    70,
  );

  // Rogue swords proc off Sword Mastery, and only for a Rogue with the mastery.
  assert.strictEqual(proc(17, { right_hand: SWORD }, { SM_SWORD: 10 }), 70);
  assert.strictEqual(proc(17, { right_hand: SWORD }, {}), 0);
  // A Thief (not a Rogue) gets nothing from a sword, mastery or not.
  assert.strictEqual(proc(6, { right_hand: SWORD }, { SM_SWORD: 10 }), 0);

  // bDoubleRate itself takes the highest rather than accumulating. The proc chance
  // above happens to hide this — the skill rate is higher, so the outer max wins
  // either way — so assert the aggregated bonus directly, or the mode silently
  // reverts to summing and nothing notices until an item comes along whose flat
  // rate outweighs its granted level.
  const doubleRateOf = (equipped) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 90, vit: 1, int: 1, dex: 50, luk: 1 },
      equipped, mastery_levels: {},
    });
    return resolvePlayerState(b, cfg, getProfile("payon_stories"))[0].double_rate;
  };
  assert.strictEqual(doubleRateOf({ right_hand: DAGGER, right_hand_card1: SIDEWINDER }), 5);
  assert.strictEqual(
    doubleRateOf({ right_hand: DAGGER, right_hand_card1: SIDEWINDER, right_hand_card2: SIDEWINDER }),
    5, "two Sidewinder Cards must not add up to 10",
  );
});

// The weapon damage roll is rnd(min(DEX x (0.8 + 0.2 x WeaponLevel), ATK), ATK) — and
// that upper bound is INCLUSIVE. Until 2026-09-02 this rolled atkmin..atkmax-1, so a
// weapon could never hit for its own ATK on a non-crit swing. Nothing job- or
// weapon-specific about it: every physical attack, skills included.
test("the weapon damage roll can reach weapon ATK, and a crit is exactly ATK", () => {
  const cfg = createBattleConfig();
  const rollOf = (equipped, job_id = 12) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id, base_level: 99, job_level: 50,
      base_stats: { str: 40, agi: 60, vit: 1, int: 1, dex: 50, luk: 1 },
      equipped, mastery_levels: {},
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    const r = new BattlePipeline(cfg).calculate(
      status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1002), eff, gb,
    );
    const step = (branch) => branch.steps.find((x) => x.name === "Weapon ATK Range");
    return { normal: step(r.normal), crit: r.crit ? step(r.crit) : null };
  };

  // Gladius: weapon level 3, ATK 105. The DEX floor lands below that, so there is a
  // real range and the top of it must be reachable.
  const { normal, crit } = rollOf({ right_hand: 1219 });
  const atkmax = Number(/atkmax=(\d+)/.exec(normal.note)[1]);
  assert.strictEqual(normal.max_value, atkmax, "the roll must be able to reach weapon ATK");
  assert.ok(normal.min_value < normal.max_value, "this weapon should have a real range");
  if (crit) assert.strictEqual(crit.max_value, atkmax, "a critical hit is exactly weapon ATK");

  // When the DEX floor already meets ATK there is no range at all, and that is fine.
  const flat = rollOf({ right_hand: 1101 }, 7).normal;   // 1H sword, ATK 25
  assert.strictEqual(flat.min_value, flat.max_value, "a capped floor should give a flat roll");
});

// The in-game Double Attack tooltip (screenshotted by a player 2026-09-02) lists the
// Katar damage bonus scaling with the skill's level: +3% at Lv1 up to +21% at Lv10,
// i.e. 1 + 2 x lv. The engine hardcoded 21 — the Lv10 figure — so every Assassin got
// max off-hand damage regardless of their actual Double Attack level.
test("Katar second hit scales with Double Attack level, not a flat 21%", () => {
  const cfg = createBattleConfig();
  const katarSecondAvg = (daLv) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 12, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 90, vit: 1, int: 1, dex: 50, luk: 1 },
      equipped: { right_hand: 1250 }, mastery_levels: { TF_DOUBLE: daLv },
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    const r = new BattlePipeline(cfg).calculate(
      status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1002), eff, gb,
    );
    return r.katar_second.avg_damage;
  };
  // Lv10 is 21% and Lv1 is 3%, so Lv10 must be 7x Lv1. A flat 21 makes them equal.
  const lv1 = katarSecondAvg(1), lv10 = katarSecondAvg(10);
  assert.ok(lv1 > 0 && lv10 > 0);
  const ratio = lv10 / lv1;
  assert.ok(Math.abs(ratio - 7) < 0.15, `Lv10 should be ~7x Lv1 (21% vs 3%), got x${ratio.toFixed(2)}`);
});

// "Adds Hit equal to the Skill's Level. This Hit is only added in the instance of a
// Double Attack successfully being triggered and is not a passive bonus." — the
// in-game tooltip. So the proc's swing rolls to hit with the bonus and nothing else does.
test("Double Attack's +HIT applies only to the swing that procs", () => {
  const cfg = createBattleConfig();
  // Low DEX against a high-flee target so hit chance is well under 100 and the bonus shows.
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 17, base_level: 60, job_level: 40,
    base_stats: { str: 60, agi: 40, vit: 1, int: 1, dex: 20, luk: 1 },
    equipped: { right_hand: 1224 }, mastery_levels: { TF_DOUBLE: 10 },
  });
  const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
  const r = new BattlePipeline(cfg).calculate(
    status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1207), eff, gb,
  );
  const h = r.hit_chance / 100, pf = r.proc_chance / 100, c = r.crit_chance / 100;
  assert.ok(h > 0.2 && h < 0.9, `test needs a middling hit chance, got ${r.hit_chance}%`);

  const mass = r.attacks.reduce((n, a) => n + a.chance, 0);
  assert.ok(Math.abs(mass - 1) < 1e-9, `attack chances sum to ${mass}, not 1`);

  // The doubled branch is the one paying twice the single-hit damage.
  const single = r.attacks.find((a) => Math.abs(a.avg_damage - r.normal.avg_damage) < 1e-6);
  const doubled = r.attacks.find((a) => r.double_hit && Math.abs(a.avg_damage - r.double_hit.avg_damage) < 1e-6);
  assert.ok(single && doubled, "could not find the single and doubled branches");

  // Single swings roll at the base hit chance, on the share that neither
  // doubled nor crit (DA is rolled first, crit only on the rest)...
  assert.ok(Math.abs(single.chance - (1 - pf) * (1 - c) * h) < 1e-6, "single swing should use the base hit chance");
  // ...and the proc swing — rolled before crit, so at its full rate — rolls
  // at base + the skill's level, in percentage points.
  const expected = pf * (h + 10 / 100);
  assert.ok(
    Math.abs(doubled.chance - expected) < 1e-3,
    `proc swing should roll at +10 HIT (expected ${expected.toFixed(5)}, got ${doubled.chance.toFixed(5)})`,
  );
});

// A Double Attack is ONE attack that lands twice, not two attacks. Hercules takes the
// damage roll once and multiplies it by div_ BEFORE defense, so the DEF subtraction, the
// refine bonus and the masteries are each paid once for the pair — which is why the two
// displayed hits come in under a normal attack, while spirit spheres (which ride in the
// base damage, ahead of the split) are counted twice.
//
// Pinned against real in-game numbers a player supplied (2026-09-02): base 180, soft DEF
// -3, Sword Mastery +40. One hit is 217 in game and here. Two hits are 2x180 - 3 + 40 =
// 397, which the client renders as 198 + 198. Calculating a second hit separately gave
// 217 + 177 = 394 and was short.
test("a Double Attack is one roll doubled before DEF, not two separate attacks", () => {
  const cfg = createBattleConfig();
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 17, base_level: 99, job_level: 50,
    base_stats: { str: 80, agi: 89, vit: 12, int: 10, dex: 53, luk: 1 },
    equipped: { right_hand: 1202 }, clan: "vile_wind_clan",
    mastery_levels: { SM_SWORD: 10, TF_DOUBLE: 10, TF_MISS: 10 },
  });
  const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
  const r = new BattlePipeline(cfg).calculate(
    status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1063), eff, gb,
  );

  assert.strictEqual(r.normal.avg_damage, 217, "single hit should match the game's 217");
  assert.ok(r.double_hit, "this build should proc Double Attack");
  // 2x180 - 3 + 40 = 397 raw, then the per-hit rounding drops the odd point: the swing
  // deals what the popups show, 198 + 198 (maintainer ruling, 2026-09-05 — see the note
  // in _runBranch for the contrary Hercules-stable reading and what would flip this).
  assert.strictEqual(r.double_hit.avg_damage, 396,
    "the doubled swing must equal its popups; 394 means a separately calculated second hit, 397 means the per-hit rounding is gone");

  // The swing must be under two full normal attacks — DEF and mastery are paid once.
  assert.ok(r.double_hit.avg_damage < r.normal.avg_damage * 2,
    "two hits must cost less than two whole attacks");

  // ...and the DPS pays the swing total, not normal x 2 nor normal + a second branch.
  assert.ok(r.attacks.some((a) => Math.abs(a.avg_damage - r.double_hit.avg_damage) < 1e-6),
    "the DPS should pay the doubled swing's own total");
  assert.ok(!r.attacks.some((a) => Math.abs(a.avg_damage - r.normal.avg_damage * 2) < 1e-6),
    "no branch should still pay twice the full normal hit");
});

// Spirit spheres and Star Crumbs are PER HIT even though they land after the multi-hit
// multiply: Hercules adds `div * sd->spiritball * 3` and `div * star` explicitly
// (battle.c battle_calc_masteryfix, ~916-921). When the div-multiplier rework landed,
// these briefly counted once in a Double Attack — the swing became one pipeline run and
// they were still keyed to the skill's own hit count. Nothing caught it because no test
// combined a proc with spheres.
test("spirit spheres count once per hit inside a Double Attack swing", () => {
  const cfg = createBattleConfig();
  const q = (spheres) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 80, agi: 89, vit: 12, int: 10, dex: 53, luk: 1 },
      equipped: { right_hand: 1202 }, flags: { spirit_spheres: spheres },
      mastery_levels: { SM_SWORD: 10, TF_DOUBLE: 10 }, clan: "vile_wind_clan",
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    const r = new BattlePipeline(cfg).calculate(
      status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1063), eff, gb,
    );
    return [r.normal.avg_damage, r.double_hit.avg_damage];
  };
  const [n0, s0] = q(0);
  const [n5, s5] = q(5);
  assert.strictEqual(n5 - n0, 15, "five spheres are +15 on a single hit");
  assert.strictEqual(s5 - s0, 30, "…and +30 across a two-hit swing — per hit, not per attack");
});

// Triple Attack REPLACES the swing; Double Attack ADDS a hit. A swing that became a
// TA cannot also double, but the swings TA did not take still can. The attack list
// assumed the two could never coexist ("Monks don't use Knives"), which stopped being
// true the moment a Double-Attack card was allowed to work on any weapon: a Monk with
// Triple Attack and a Sidewinder was shown a 14% proc worth exactly nothing.
test("Double Attack still applies on the swings Triple Attack did not take", () => {
  const cfg = createBattleConfig();
  const dpsOf = (equipped, mastery_levels) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 15, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 90, vit: 1, int: 1, dex: 50, luk: 1 },
      equipped, mastery_levels,
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    const r = new BattlePipeline(cfg).calculate(
      status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1002), eff, gb,
    );
    // Probability mass must still be exactly one, whatever branches were added.
    const mass = r.attacks.reduce((n, a) => n + a.chance, 0);
    assert.ok(Math.abs(mass - 1) < 1e-9, `attack chances sum to ${mass}, not 1`);
    return r.dps;
  };
  const KNUCKLE = { right_hand: 1801 };
  const KNUCKLE_SW = { right_hand: 1801, right_hand_card1: 4117 };
  const TA = { MO_TRIPLEATTACK: 5 };

  // With no Triple Attack, the card plainly raises DPS.
  assert.ok(dpsOf(KNUCKLE_SW, {}) > dpsOf(KNUCKLE, {}), "Sidewinder must raise a Monk's DPS");
  // ...and it must still raise it when Triple Attack is in play. This was equal.
  assert.ok(
    dpsOf(KNUCKLE_SW, TA) > dpsOf(KNUCKLE, TA),
    "Double Attack contributes nothing once Triple Attack is active",
  );
});

// Double Attack has priority over Critical (wiki Double_Attack: "Has higher priority
// over Critical attacks"; a CC confirmed it 2026-09-06; Hercules gates the crit check
// on wd.type != BDT_MULTIHIT at battle.c:5152, and DA already claimed the swing at
// :5091). Crit therefore only rolls on the swings that did not double, and raising
// CRIT never costs doubles. It was modeled the other way around — crit first — so SN
// Fury's +50 CRIT cut doubles from 70% to ~31%: a player caught Fury Chant LOWERING
// their calculated DPS by ~700 on a maxed-DA dagger build.
test("Double Attack beats Critical: +50 CRIT costs no doubles and raises DPS", () => {
  const cfg = createBattleConfig();
  const run = (flags) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 23, base_level: 99, job_level: 99,
      base_stats: { str: 90, agi: 90, vit: 1, int: 1, dex: 60, luk: 30 },
      equipped: { right_hand: 1201 }, mastery_levels: { TF_DOUBLE: 10 }, flags,
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    return new BattlePipeline(cfg).calculate(
      status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1002), eff, gb,
    );
  };
  const base = run({});
  const fury = run({ sn_fury: true });
  assert.ok(fury.crit_chance - base.crit_chance > 49, "Fury should add +50 CRIT");

  const doubleShare = (r) => r.attacks
    .filter((a) => Math.abs(a.avg_damage - r.double_hit.avg_damage) < 1e-6)
    .reduce((n, a) => n + a.chance, 0);
  // The doubled swing keeps its full share when CRIT jumps by 50 points.
  assert.ok(doubleShare(base) > 0.5, `this build should double most swings, got ${doubleShare(base)}`);
  assert.ok(Math.abs(doubleShare(base) - doubleShare(fury)) < 1e-9,
    `doubles must not shrink under Fury: ${doubleShare(base).toFixed(4)} -> ${doubleShare(fury).toFixed(4)}`);

  // Crit rolls only on the non-proc share: exactly (1 - pf) x crit of the mass.
  const pf = fury.proc_chance / 100, c = fury.crit_chance / 100;
  const critMass = fury.attacks
    .filter((a) => Math.abs(a.avg_damage - fury.crit.avg_damage) < 1e-6)
    .reduce((n, a) => n + a.chance, 0);
  assert.ok(Math.abs(critMass - (1 - pf) * c) < 1e-6,
    `crit share should be (1-pf)*crit = ${((1 - pf) * c).toFixed(4)}, got ${critMass.toFixed(4)}`);

  // And so the chant is a DPS gain — crits displace plain hits, never doubles.
  assert.ok(fury.dps > base.dps,
    `Fury Chant must not read as a DPS loss (${base.dps} -> ${fury.dps})`);
});

// Same rule one rung up: Triple Attack REPLACES the swing before either roll (wiki
// Triple_Attack: "This includes Critical Hit (unless Critical Explosion is active)
// and Double Attack rolls, effectively lowering the chance of either triggering").
// Crit-first modeling instead let a lucky Monk's CRIT eat into the TA share.
test("Triple Attack's share is not reduced by CRIT", () => {
  const cfg = createBattleConfig();
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 15, base_level: 99, job_level: 50,
    base_stats: { str: 90, agi: 90, vit: 1, int: 1, dex: 60, luk: 97 },
    equipped: { right_hand: 1801 }, mastery_levels: { MO_TRIPLEATTACK: 5 },
  });
  const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
  const r = new BattlePipeline(cfg).calculate(
    status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1002), eff, gb,
  );
  assert.ok(r.crit_chance > 20, `test needs real crit to bite, got ${r.crit_chance}%`);

  const tpf = r.ta_proc_chance / 100, h = r.hit_chance / 100;
  const taMass = r.attacks
    .filter((a) => Math.abs(a.avg_damage - r.ta_proc.avg_damage) < 1e-6)
    .reduce((n, a) => n + a.chance, 0);
  assert.ok(Math.abs(taMass - tpf * h) < 1e-6,
    `TA share should be its full proc rate x hit (${(tpf * h).toFixed(4)}), got ${taMass.toFixed(4)}`);

  const mass = r.attacks.reduce((n, a) => n + a.chance, 0);
  assert.ok(Math.abs(mass - 1) < 1e-9, `attack chances sum to ${mass}, not 1`);
});

// Shield weight is not cosmetic: Shield Boomerang adds the shield's displayed weight to
// BATK before the skill ratio, so a wrong or missing weight silently changes that skill's
// damage. Two were reported wrong by a CC (Laila, 2026-09-02) and a sweep for shields
// carrying no weight at all found two more. The live item API states the in-game figure;
// item_db stores 10x it (Buckler db 600 = 60 in game), so these are the db values.
test("shield weights match the live item API", () => {
  loader.setProfile(getProfile("payon_stories"));
  const expected = {
    2111: 2500,   // Herald of God — was vanilla Sacred Mission's 160
    2128: 2500,   // Herald of God, slotted
    90071: 1500,  // Stone Discus — carried no weight at all, so it read as 0
    2136: 1000,   // Cracked Buckler — same, found by the sweep
    8135: 1200,   // Carapace of the Damned — same
    2137: 0,      // Neo Valkyrie Shield genuinely weighs nothing; the 0 is correct
  };
  for (const [id, weight] of Object.entries(expected)) {
    const item = loader.getItem(Number(id));
    assert.ok(item, `item ${id} not found`);
    assert.strictEqual(item.weight ?? 0, weight,
      `${item.name} (${id}) should weigh ${weight / 10} in game, i.e. ${weight} in item_db`);
  }
});

// Spirit spheres are not Monk-only. A player asked for them off the Monk line and named
// both routes; Payon Stories' own pages confirm each:
//   Ki Translation — "Transfers one of your existing Spirit Spheres to a neutral or
//   friendly player. The recipient cannot have more than 5 spheres at a time...
//   Gunslingers cannot be bestowed upon."
//   Greatest General Card — "gaining Spirit Sphere or Coin when doing Physical Attack",
//   scripted as bonus3 bAutoSpell,MO_CALLSPIRITS,5 — Call Spirits Lv5, so also 5.
// Hence: 5 off the Monk line, and Gunslingers excluded outright rather than capped.
test("spirit spheres apply to any class except Gunslinger, capped at 5 off the Monk line", () => {
  const cfg = createBattleConfig();
  const dmg = (job_id, flags) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 60, vit: 1, int: 1, dex: 60, luk: 1 },
      equipped: { right_hand: 1101 }, mastery_levels: {}, flags,
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    return new BattlePipeline(cfg).calculate(
      status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1002), eff, gb,
    ).normal.avg_damage;
  };

  // Each sphere is +3 flat, so five is +15 — on the Monk line and off it alike.
  for (const [job, name] of [[7, "Knight"], [11, "Hunter"], [15, "Monk"], [4016, "Champion"]]) {
    const gain = dmg(job, { spirit_spheres: 5 }) - dmg(job, { spirit_spheres: 0 });
    assert.strictEqual(gain, 15, `${name} should gain +15 ATK from 5 spheres, got +${gain}`);
  }

  // Off the Monk line the cap is 5, so asking for more changes nothing.
  assert.strictEqual(
    dmg(7, { spirit_spheres: 10 }), dmg(7, { spirit_spheres: 5 }),
    "a non-Monk asking for 10 spheres must clamp to 5",
  );
  // A Champion really can hold more than 5.
  assert.ok(
    dmg(4016, { spirit_spheres: 15 }) > dmg(4016, { spirit_spheres: 5 }),
    "the Monk line is not capped at 5",
  );

  // Gunslingers cannot be bestowed upon — spheres do nothing, coins are unaffected.
  const gsBase = dmg(24, { spirit_spheres: 0, gs_coins: 0 });
  assert.strictEqual(dmg(24, { spirit_spheres: 5 }), gsBase, "a Gunslinger must not gain from spheres");
  assert.strictEqual(dmg(24, { gs_coins: 10 }) - gsBase, 30, "a Gunslinger's coins are still +3 each");
});

// Super Novice Fury — the Guardian Angel chant: "Fury Status (critical rate +50)"
// (wiki Super_Novice). Requested by a player who noted that at base 99 the EXP bar
// never moves, so the chant is effectively permanent; they had been approximating it
// by setting Critical Explosion to level 13, which lands on the same +50 under the PS
// scaling (175 + 25 x 13 = 500). The flag must match that workaround to the decimal.
test("Super Novice Fury chant is a flat +50 CRIT, SN only", () => {
  const cfg = createBattleConfig();
  const crit = (job_id, flags = {}, active = {}) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id, base_level: 99, job_level: 70,
      base_stats: { str: 85, agi: 99, vit: 1, int: 1, dex: 45, luk: 1 },
      equipped: { right_hand: 1201 }, mastery_levels: {}, flags, active_buffs: active,
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    return new BattlePipeline(cfg).calculate(
      status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1002), eff, gb,
    ).crit_chance;
  };

  const base = crit(23);
  assert.ok(Math.abs(crit(23, { sn_fury: true }) - base - 50) < 1e-6,
    "Fury must add exactly +50 CRIT to a Super Novice");
  // ...identical to the workaround players used, so switching costs them nothing.
  assert.ok(Math.abs(crit(23, { sn_fury: true }) - crit(23, {}, { SC_EXPLOSIONSPIRITS: 13 })) < 1e-6,
    "the flag and the Critical Explosion Lv13 workaround must agree");
  // ...and it is a Super Novice mechanic, not a general one.
  assert.strictEqual(crit(6, { sn_fury: true }), crit(6),
    "sn_fury must do nothing for any other job");
});

// Bard/Dancer (19/20) and Clown/Gypsy (4020/4021) share ONE job bit in Hercules,
// split by character gender. The bitmask-to-array conversion expanded that bit to the
// male ids only, so 70 gender-neutral items — Buckler among them, which is how a player
// found it — listed Bard but not Dancer, and every whip in the game was equippable by
// Bards and not by Dancers. The rule pinned here: a gender-neutral item that lists one
// half of a pair must list the other; whips are the female pair's weapon and must list
// neither male id; male-locked items (instruments) stay male.
// The symmetry test below guards the raw vanilla file. This one guards what the app
// actually serves — the vanilla data with the PS layers merged over it — and the exact
// items the report named, so a PS override or a bad manual entry cannot quietly
// reintroduce the split for the case players actually hit.
test("a Dancer and a Gypsy can equip Buckler and whips through the merged data", () => {
  loader.setProfile(getProfile("payon_stories"));
  const canEquip = (itemId, jobId) => {
    const it = loader.getItem(itemId);
    assert.ok(it, `item ${itemId} not found`);
    // Mirrors the picker's rule (BuildEditor canEquip / invalidSlots): an empty job
    // list is unrestricted, otherwise the job must be listed.
    return !Array.isArray(it.job) || it.job.length === 0 || it.job.includes(jobId);
  };

  // The report: Buckler, both variants, on Dancer and Gypsy.
  for (const buckler of [2103, 2104]) {
    for (const job of [20, 4021]) {
      assert.ok(canEquip(buckler, job), `Buckler ${buckler} must be equippable by job ${job}`);
    }
    assert.ok(canEquip(buckler, 19), `Buckler ${buckler} must still be equippable by a Bard`);
  }

  // The bigger half of the same bug: whips are the Dancer pair's weapon.
  const whip = loader.getItem(1952);
  assert.ok(whip.job.includes(20) && whip.job.includes(4021), "a whip must list Dancer and Gypsy");
  assert.ok(!whip.job.includes(19) && !whip.job.includes(4020), "a whip must not list Bard or Clown");

  // ...and instruments stay on the male side.
  const violin = loader.getItem(1901);
  assert.ok(violin.job.includes(19), "an instrument must list Bard");
  assert.ok(!violin.job.includes(20), "an instrument must not list Dancer");

  // Post-merge sweep: the PS layers must not break pair symmetry for any vanilla item
  // that shares the bit. PS-custom single-side items (a Dancer weapon and its Bard
  // counterpart) are deliberate and live outside the vanilla id space checked here.
  const db = JSON.parse(require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "engine", "data", "pre-re", "db", "item_db.json"), "utf8"));
  for (const raw of Object.values(db.items || db)) {
    if (!Array.isArray(raw.job) || !(raw.job.includes(19) || raw.job.includes(20))) continue;
    const merged = loader.getItem(raw.id);
    if (!merged || !Array.isArray(merged.job) || merged.job.length === 0) continue;
    if (merged.gender === "SEX_MALE" || merged.weapon_type === "Whip") continue;
    assert.strictEqual(merged.job.includes(19), merged.job.includes(20),
      `${raw.id} ${merged.name}: Bard/Dancer split reappeared after the PS layers merged`);
  }
});

test("Bard/Dancer job pairs are symmetric in the vanilla item data", () => {
  const db = JSON.parse(require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "engine", "data", "pre-re", "db", "item_db.json"), "utf8"));
  const items = Object.values(db.items || db);
  const bad = [];
  for (const it of items) {
    if (!Array.isArray(it.job) || it.job.length === 0) continue;
    const j = new Set(it.job);
    if (it.weapon_type === "Whip") {
      if (j.has(19) || j.has(4020)) bad.push(`${it.id} ${it.name}: a whip listing Bard/Clown`);
      if (!j.has(20)) bad.push(`${it.id} ${it.name}: a whip a Dancer cannot equip`);
      continue;
    }
    if (it.gender === "SEX_MALE") continue;
    if (j.has(19) !== j.has(20)) bad.push(`${it.id} ${it.name}: Bard/Dancer asymmetric`);
    if (j.has(4020) !== j.has(4021)) bad.push(`${it.id} ${it.name}: Clown/Gypsy asymmetric`);
  }
  assert.deepEqual(bad, []);
});

test("Momoe's Hairband gives +20% vs Turtle Island turtles, nothing vs others", () => {
  const cfg = createBattleConfig();
  const dmg = (hat, mobId) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 11, base_level: 99, job_level: 50,
      base_stats: { str: 99, agi: 50, vit: 1, int: 1, dex: 99, luk: 1 },
      equipped: hat ? { right_hand: 1201, head_top: 8065 } : { right_hand: 1201 },
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    const r = new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(mobId), eff, gb);
    return r.normal.avg_damage;
  };
  // Turtle Island turtles (excluding Turtle General 1312). NB this list was the whole
  // item script until 2026-08-31 and it was incomplete — Solider and the duplicate ids
  // are covered by "Momoe's Hairband covers every Turtle Island turtle" below.
  for (const id of [1314, 1315, 1318, 1319]) {
    const ratio = dmg(true, id) / dmg(false, id);
    assert.ok(ratio > 1.15 && ratio <= 1.20 + 1e-9, `Momoe should add ~+20% vs mob ${id}, got x${ratio.toFixed(3)}`);
  }
  // Turtle General (1312) is explicitly excluded; Poring (1002) is unrelated.
  for (const id of [1312, 1002]) {
    assert.equal(dmg(true, id), dmg(false, id), `Momoe must not boost damage vs mob ${id}`);
  }
});

test("Morpheus set is All-except-Novice (excludes Novice + Super Novice)", () => {
  // Mirrors the picker filter in routes/data.ts (jobMatch + empty-job path).
  const shows = (it, jobId) =>
    !Array.isArray(it.job) || it.job.length === 0 || it.job.includes(jobId) || (jobId === 23 && it.job.includes(0));
  for (const id of [2518, 2648, 2649, 5126]) { // Shawl, Ring, Bracelet, Hood
    const it = loader.getItem(id);
    assert.ok(it && Array.isArray(it.job) && it.job.length > 0, `Morpheus ${id} must have a job restriction`);
    assert.ok(it.script && it.script.length > 0, `Morpheus ${id} must keep its base script (job merge must not wipe it)`);
    assert.equal(shows(it, 0), false, `Novice must NOT equip Morpheus ${id}`);
    assert.equal(shows(it, 23), false, `Super Novice must NOT equip Morpheus ${id}`);
    for (const job of [9, 16, 7, 24]) { // Wizard, Sage, Knight, Gunslinger — all non-Novice
      assert.equal(shows(it, job), true, `job ${job} must equip Morpheus ${id}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Composite-race fan-out for arity-1 defensive dict bonuses. `bIgnoreDefRace,
// RC_All` (Ahlspiess) must fan out to RC_Boss + RC_NonBoss — the keys defenseFix
// actually reads — not persist as a dead "RC_All" key. Guards the DEF-bypass.
// ---------------------------------------------------------------------------
test("bIgnoreDefRace,RC_All fans out and bypasses target DEF (Ahlspiess)", () => {
  const cfg = createBattleConfig();
  const at = (def) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 7, base_level: 99, job_level: 50,
      base_stats: { str: 99, agi: 60, vit: 1, int: 1, dex: 60, luk: 1 },
      equipped: { right_hand: 1478 }, // Ahlspiess
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
    const dmg = new BattlePipeline(cfg)
      .calculate(status, weapon, createSkillInstance({ id: 0, level: 1 }),
        createTarget({ def_: def, size: 1, race: 0, element: 0 }), eff, gb)
      .normal.avg_damage;
    return { gb, dmg };
  };
  const zero = at(0), high = at(120);
  assert.ok(!("RC_All" in zero.gb.ignore_def_rate), "RC_All must fan out, not persist as a key");
  assert.equal(zero.gb.ignore_def_rate.RC_Boss, 100, "RC_All → RC_Boss");
  assert.equal(zero.gb.ignore_def_rate.RC_NonBoss, 100, "RC_All → RC_NonBoss");
  assert.equal(zero.dmg, high.dmg, "Ahlspiess must ignore target DEF — damage is DEF-independent");
});

// ---------------------------------------------------------------------------
// MATK% (bMatkRate) must be applied ONCE. statusCalculator bakes gear/weapon
// bMatkRate into status.matk; the magic branch must not re-apply it (that
// double-counted the weapon's +MATK%). Guards the fix.
// ---------------------------------------------------------------------------
test("magic bMatkRate is applied once, not double-counted", () => {
  const cfg = createBattleConfig();
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 9, base_level: 99, job_level: 50,
    base_stats: { str: 1, agi: 1, vit: 1, int: 99, dex: 1, luk: 1 },
    equipped: { right_hand: 1601 }, // Rod = +15% MATK (bMatkRate,15)
  });
  const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, getProfile("payon_stories"));
  assert.equal(gb.matk_rate, 15, "Rod should contribute +15% MATK");
  const r = new BattlePipeline(cfg).calculate(
    status, weapon, createSkillInstance({ id: 19, level: 1 }), // Fire Bolt Lv1 = 100% MATK, 1 hit
    createTarget({ def_: 0, mdef_: 0, int_: 0, vit: 0, size: 1, race: 0, element: 0 }), eff, gb
  ).normal;
  // Neutral target, 0 DEF/MDEF, 100% ratio, no cards → damage == resolved MATK,
  // which already includes the 15%. If bMatkRate were applied twice it'd be ×1.15 more.
  const matkAvg = (status.matk_min + status.matk_max) / 2;
  assert.ok(Math.abs(r.avg_damage - matkAvg) <= 1,
    `magic damage ${r.avg_damage} should ≈ resolved MATK ${matkAvg} (no second matk_rate)`);
  assert.ok(!r.steps.some((s) => /bMatkRate/.test(s.name)),
    "bMatkRate must not be a separate step — it's already baked into Base MATK");
});

// ---------------------------------------------------------------------------
// PS Merchant / Blacksmith / Alchemist rework (2026-08-09 PDFs).
// Properties that must hold regardless of later tuning.
// ---------------------------------------------------------------------------
const PS = getProfile("payon_stories");

test("Cart Revolution scales 50% per rank and caps at 5", () => {
  const fn = PS.weapon_ratios.MC_CARTREVOLUTION;
  for (let lv = 1; lv <= 5; lv++) assert.equal(fn(lv), 50 * lv, `Lv${lv}`);
  assert.equal(PS.skill_level_cap_overrides.MC_CARTREVOLUTION, 5);
  assert.equal(loader.getSkill(153).max_level, 5, "picker must offer 5 ranks");
});

test("a skill's served max level follows override > PS scrape (evidenced) > vanilla", () => {
  // Explicit profile caps still win outright — they are the only source that can see
  // a post-scrape rework, in either direction.
  assert.equal(loader.getSkillByName("BS_SWORD").max_level, 4, "raised by the Blacksmith rework (PS scrape still says 3)");
  assert.equal(loader.getSkillByName("MC_CARTREVOLUTION").max_level, 5, "raised from a 1-rank quest skill");
  assert.equal(loader.getSkillByName("BS_TWOHANDSWORD").max_level, 0, "removed on PS");

  // With no override, a PS max BACKED BY A PER-LEVEL TABLE wins over vanilla. These
  // were being served at the vanilla count by the skill picker while the passive
  // picker already showed the PS one.
  for (const [name, max] of [["LK_JOINTBEAT", 5], ["SA_FREECAST", 5], ["SA_ADVANCEDBOOK", 5],
    ["HW_MAGICPOWER", 5], ["NJ_SUITON", 5], ["PF_DOUBLECASTING", 1], ["SA_VOLCANO", 3]]) {
    assert.equal(loader.getSkillByName(name).max_level, max, `${name} should serve the PS max`);
  }
  // …but a PS record with NO level table behind it is not evidence — a scrape
  // artifact must not silently cut a skill's ranks.
  assert.equal(loader.getSkillByName("SN_FALCONASSAULT").max_level, 5, "PS record says 1 with no table — keep vanilla");
  assert.equal(loader.getSkillByName("PF_FOGWALL").max_level, 5, "PS record says 1 with no table — keep vanilla");
  // Where the live wiki settles one of those, it becomes an explicit override.
  assert.equal(loader.getSkillByName("RG_STRIPARMOR").max_level, 3, "wiki infobox: Levels 3");
  assert.equal(loader.getSkillByName("SA_ABRACADABRA").max_level, 5, "wiki infobox: Levels 5");

  // Vanilla profile is untouched by any of this.
  loader.setProfile(getProfile("standard"));
  try {
    assert.equal(loader.getSkillByName("LK_JOINTBEAT").max_level, 10);
    assert.equal(loader.getSkillByName("SA_FREECAST").max_level, 10);
  } finally {
    loader.setProfile(PS);
  }
});

test("a cast above the skill's real rank is clamped, not computed", () => {
  const cfg = createBattleConfig();
  const [gb, eff, weapon, status] = resolvePlayerState(buildFromSaveSchema({
    server: "payon_stories", job_id: 4008, base_level: 99, job_level: 50,
    base_stats: { str: 90, agi: 50, vit: 40, int: 1, dex: 60, luk: 20 },
    equipped: { right_hand: 1101 },
  }), cfg, PS);
  const at = (lv) => new BattlePipeline(cfg).calculate(status, weapon,
    createSkillInstance({ id: loader.getSkillIdByName("LK_JOINTBEAT"), level: lv, name: "LK_JOINTBEAT" }),
    loader.getMonster(1036), eff, gb);
  // Joint Beat is 5 ranks on PS. A Lv10 request — from a share URL made while the
  // picker offered the vanilla 10 — must price as Lv5, not as a rank that doesn't exist.
  const step = (r) => r.normal.steps.find((s) => /Skill Ratio/.test(s.name)).name;
  assert.match(step(at(10)), /Joint Beat Lv5\)/);
  assert.equal(at(10).normal.avg_damage, at(5).normal.avg_damage);
});

test("Power-Thrust adds 5 ratio points per rank and stops at rank 5", () => {
  const cfg = createBattleConfig();
  const ratioOf = (otLv, skillName) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 10, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 40, vit: 40, int: 1, dex: 60, luk: 20 },
      equipped: { right_hand: 1301 }, support_buffs: { SC_OVERTHRUST: otLv },
      mastery_levels: { MC_CARTREVOLUTION: 5 },
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    const id = skillName ? loader.getSkillIdByName(skillName) : 0;
    const res = new BattlePipeline(cfg).calculate(status, weapon,
      createSkillInstance({ id, level: skillName ? 5 : 1, name: skillName || "" }),
      loader.getMonster(1036), eff, gb);
    return res.normal.steps.find((s) => /Skill Ratio/.test(s.name)).multiplier;
  };
  // +5% ATK per rank, ADDED to the skill multiplier (wiki: "additive for skills,
  // not multiplicative"). Rank 5 is the cap: an auto-attack is 100 + 25 = 125%,
  // Cart Revolution Lv5 is 250 + 25 = 275% — NOT the 150% / 300% a rank-10
  // Power-Thrust produced while the picker offered ten ranks.
  assert.equal(ratioOf(0, null), 1);
  assert.equal(ratioOf(5, null), 1.25);
  assert.equal(ratioOf(10, null), 1.25, "rank is clamped, not extrapolated");
  assert.equal(ratioOf(0, "MC_CARTREVOLUTION"), 2.5);
  assert.equal(ratioOf(5, "MC_CARTREVOLUTION"), 2.75);
  assert.equal(ratioOf(10, "MC_CARTREVOLUTION"), 2.75);
});

test("Zeny Pincher halves Mammonite's PER-LEVEL term, not the whole ratio", () => {
  const fn = PS.weapon_ratios.MC_MAMMONITE;
  const ctxOff = createCalcContext({ skill_params: {}, skill_levels: {} });
  const ctxOn = createCalcContext({ skill_params: { PS_BS_ZENYPINCHER_active: true }, skill_levels: {} });
  for (let lv = 1; lv <= 10; lv++) {
    assert.equal(fn(lv, null, ctxOff), 100 + 50 * lv, `plain Lv${lv}`);
    assert.equal(fn(lv, null, ctxOn), 100 + 25 * lv, `pincher Lv${lv}`);
  }
  // The old model was x0.4 of the full ratio (240% at Lv10); the rework is 350%.
  assert.equal(fn(10, null, ctxOn), 350);
  // Learning the skill (mastery level) is equivalent to the skill_param toggle.
  const ctxLearned = createCalcContext({ skill_params: {}, skill_levels: { PS_BS_ZENYPINCHER: 1 } });
  assert.equal(fn(10, null, ctxLearned), 350);
});

test("Acid Terror is (100 + 100xlv)% and tops out at 600% (rank 5)", () => {
  const fn = PS.weapon_ratios.AM_ACIDTERROR;
  for (let lv = 1; lv <= 5; lv++) assert.equal(fn(lv), 100 + 100 * lv, `Lv${lv}`);
  assert.equal(fn(5), 600);
  assert.equal(loader.getSkill(230).max_level, 5);
});

test("Tool Mastery gives +4 ATK/lv on Axes and Maces, and wins over the reworked masteries", () => {
  assert.deepEqual(PS.passive_overrides.PS_MC_TOOLMASTERY.atk_per_lv,
    [4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);
  // Transmutation (reworked Axe Mastery) grants NO flat ATK any more.
  assert.ok(!("atk_per_lv" in PS.passive_overrides.AM_AXEMASTERY),
    "Axe Mastery must no longer add flat ATK — that is Tool Mastery's job now");
  assert.ok([].concat(PS.mastery_prefer_fallback.AM_AXEMASTERY).includes("PS_MC_TOOLMASTERY"));
  assert.ok([].concat(PS.mastery_prefer_fallback.PR_MACEMASTERY).includes("PS_MC_TOOLMASTERY"));

  const cfg = createBattleConfig();
  const withTool = (mastery) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 10, base_level: 95, job_level: 50,
      base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 },
      equipped: { right_hand: 1504 }, mastery_levels: mastery, // 1504 = Mace
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    return new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: 0, level: 1 }),
      createTarget({ def_: 0, vit: 0, size: 1, race: 0, element: 0 }), eff, gb).normal.avg_damage;
  };
  assert.equal(withTool({ PS_MC_TOOLMASTERY: 10 }) - withTool({}), 40,
    "Tool Mastery Lv10 with a Mace must add exactly +40 flat");
});

test("Transmutation's ASPD/MATK apply only with an Axe or a Sword", () => {
  const spec = PS.passive_overrides.AM_AXEMASTERY;
  assert.equal(spec.aspd_pct_per_lv, 1);
  assert.equal(spec.matk_pct_per_lv, 1);
  const cfg = createBattleConfig();
  const stat = (rh, mastery) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 18, base_level: 90, job_level: 50,
      base_stats: { str: 80, agi: 50, vit: 40, int: 60, dex: 60, luk: 10 },
      equipped: { right_hand: rh }, mastery_levels: mastery,
    });
    return resolvePlayerState(b, cfg, PS)[3];
  };
  // 1301 Axe / 1101 Sword are gated in; 1504 Mace / 1601 Rod are not.
  for (const [rh, gated] of [[1301, true], [1101, true], [1504, false], [1601, false]]) {
    const off = stat(rh, {}), on = stat(rh, { AM_AXEMASTERY: 10 });
    if (gated) {
      assert.ok(on.aspd > off.aspd, `weapon ${rh}: Transmutation should raise ASPD`);
      assert.equal(on.matk_max, Math.floor(off.matk_max * 110 / 100), `weapon ${rh}: +10% MATK`);
    } else {
      assert.equal(on.aspd, off.aspd, `weapon ${rh}: Transmutation must not touch ASPD`);
      assert.equal(on.matk_max, off.matk_max, `weapon ${rh}: Transmutation must not touch MATK`);
    }
  }
});

test("Adrenaline Rush: all melee weapons, 30/20% self and 20/10% party", () => {
  const cfg = createBattleConfig();
  const aspd = (rh, buffs) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 10, base_level: 95, job_level: 50,
      base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 },
      equipped: { right_hand: rh }, ...buffs,
    });
    return resolvePlayerState(b, cfg, PS)[3].aspd;
  };
  const SELF = { active_buffs: { SC_ADRENALINE_SELF: 1 } };
  const PARTY = { support_buffs: { SC_ADRENALINE: 1 } };
  // amotion = base x (1000 - bonus)/1000, so a bigger bonus means higher ASPD.
  for (const rh of [1504, 1101]) {           // Mace (full tier) and Sword (lesser tier)
    assert.ok(aspd(rh, SELF) > aspd(rh, PARTY), `weapon ${rh}: self-cast must beat party-cast`);
    assert.ok(aspd(rh, PARTY) > aspd(rh, {}), `weapon ${rh}: party-cast must still help`);
  }
  // A Sword got NOTHING in vanilla; the rework must give it the lesser tier.
  assert.ok(aspd(1101, SELF) > aspd(1101, {}), "non-Axe/Mace melee must now benefit");
  // Bows stay excluded.
  assert.equal(aspd(1707, SELF), aspd(1707, {}), "bows must remain excluded");
});

test("Weapon Perfection nullifies the size penalty, self-cast or from the party", () => {
  // Axe vs a Medium target is a 75% size penalty — Weapon Perfection removes it.
  // The PS wiki is explicit that party members receive the effect, so the party
  // (support_buffs) source must be worth exactly as much as the self-cast one.
  const build = {
    server: "payon_stories", job_id: 10, base_level: 90, job_level: 50,
    base_stats: { str: 90, agi: 40, vit: 40, int: 1, dex: 50, luk: 10 },
    equipped: { right_hand: 1301 },
  };
  const avg = (buffs) => runScenario({ name: "wp", build: { ...build, ...buffs }, target: 1036 }).result.normal.avg;
  const off = avg({});
  const self = avg({ active_buffs: { SC_WEAPONPERFECT: 1 } });
  const party = avg({ support_buffs: { SC_WEAPONPERFECT: 1 } });
  assert.ok(self > off, "self-cast must remove the size penalty");
  assert.equal(party, self, "party-cast must be identical to self-cast");
  // Sanity: a weapon with no penalty against this size gains nothing from it.
  const swordOff = avg({ equipped: { right_hand: 1101 } });
  const swordOn = avg({ equipped: { right_hand: 1101 }, active_buffs: { SC_WEAPONPERFECT: 1 } });
  assert.equal(swordOn, swordOff, "a 100% size match must be unaffected");
});

test("Crazy Uproar grants STR, VIT and soft DEF per level (self); party gets soft DEF only", () => {
  const cfg = createBattleConfig();
  const st = (buffs) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 10, base_level: 95, job_level: 50,
      base_stats: { str: 50, agi: 50, vit: 50, int: 1, dex: 50, luk: 1 },
      equipped: { right_hand: 1504 }, ...buffs,
    });
    return resolvePlayerState(b, cfg, PS)[3];
  };
  const off = st({}), self = st({ active_buffs: { SC_SHOUT: 4 } }), party = st({ support_buffs: { SC_SHOUT: 4 } });
  assert.equal(self.str - off.str, 4, "+1 STR per level");
  assert.equal(self.vit - off.vit, 4, "+1 VIT per level");
  // Self soft DEF = 3xlv on top of the VIT the buff itself added.
  assert.equal(self.def2 - off.def2, 4 + 3 * 4, "self: +VIT and +3xlv soft DEF");
  assert.equal(party.str, off.str, "party members get no STR");
  assert.equal(party.def2 - off.def2, 2 * 4, "party: +2xlv soft DEF only");
  assert.equal(loader.getSkill(155).max_level, 4, "picker must offer 4 ranks");
});

test("Burning cuts hard MDEF by 2 per stack and raises magic damage", () => {
  assert.equal(PS.burning.max_stacks, 5);
  assert.equal(PS.burning.mdef_per_stack, 2);
  assert.equal(PS.burning.dmg_per_stack_per_sec, 60);
  const cfg = createBattleConfig();
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 9, base_level: 99, job_level: 50,
    base_stats: { str: 1, agi: 30, vit: 30, int: 99, dex: 70, luk: 1 },
    equipped: { right_hand: 1601 },
  });
  const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
  const dmg = (mdef) => new BattlePipeline(cfg).calculate(
    status, weapon, createSkillInstance({ id: 19, level: 10 }),
    createTarget({ def_: 0, mdef_: mdef, int_: 10, vit: 10, size: 1, race: 0, element: 0 }), eff, gb
  ).normal.avg_damage;
  assert.ok(dmg(20 - 2 * 5) > dmg(20), "5 Burning stacks must raise magic damage");
});

test("Smith Weapon skills master at rank 4; Smith Two-Handed Sword is gone", () => {
  const byName = Object.fromEntries(loader.getPassiveSkillsForJob(10).map((s) => [s.name, s]));
  for (const n of ["BS_DAGGER", "BS_SWORD", "BS_KNUCKLE", "BS_SPEAR", "BS_AXE", "BS_MACE"]) {
    assert.equal(byName[n] && byName[n].max_level, 4, `${n} should offer 4 ranks`);
  }
  assert.ok(!("BS_TWOHANDSWORD" in byName), "Smith Two-Handed Sword folded into Smith Sword");
  // The Smith skills grant nothing on their own (they are in the picker only so
  // Veteran Axe's script can read them), so they must sort BELOW the passives
  // that do — otherwise Hilt Binding gets lost in the middle of them.
  const order = loader.getPassiveSkillsForJob(10).map((s) => s.name);
  // Identify the crafting block by NAME, not by a "BS_ prefix minus the exceptions I can
  // think of" guess — that heuristic broke the moment Skin Tempering (a real passive that
  // happens to start with BS_) joined the picker.
  const CRAFTING_ONLY = ["BS_DAGGER", "BS_SWORD", "BS_KNUCKLE", "BS_SPEAR", "BS_AXE", "BS_MACE"];
  const firstSmith = order.findIndex((n) => CRAFTING_ONLY.includes(n));
  for (const n of ["BS_HILTBINDING", "BS_WEAPONRESEARCH", "PS_MC_TOOLMASTERY", "BS_SKINTEMPER"]) {
    assert.ok(order.indexOf(n) >= 0 && order.indexOf(n) < firstSmith, `${n} must sort above the Smith skills`);
  }
});

// ---------------------------------------------------------------------------
// PS patch notes 2026-08-09 (GM announcement) — changes beyond the four PDFs.
// ---------------------------------------------------------------------------
test("Reflect Shield uses the new VIT-quadratic formula", () => {
  const cfg = createBattleConfig();
  const dmg = (vit, lv, armor) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 14, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi: 1, vit, int: 40, dex: 40, luk: 1 },
      equipped: { right_hand: 1104, ...(armor ? { armor } : {}) },
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    const res = new BattlePipeline(cfg).calculate(status, weapon,
      createSkillInstance({ id: loader.getSkillIdByName("CR_REFLECTSHIELD"), level: lv }),
      createTarget({ def_: 0, vit: 0, size: 1, race: 0, element: 0, element_level: 1 }), eff, gb);
    return { dmg: res.normal.avg_damage, status };
  };
  // Exact formula check: SkillLv × (SoftDEF/2 + ⌊VIT/10⌋²) × (100 + 2×HardDEF) / 1000
  for (const [vit, lv] of [[80, 5], [90, 10], [40, 3]]) {
    const { dmg: d, status } = dmg(vit, lv, null);
    const expected = Math.floor(lv * (status.def2 / 2 + Math.floor(status.vit / 10) ** 2) * (100 + 2 * status.def_) / 1000);
    assert.equal(d, expected, `VIT ${vit} Lv${lv}`);
  }
  // VIT now enters quadratically, so it must outrun a linear response.
  const lo = dmg(40, 10, null).dmg, hi = dmg(80, 10, null).dmg;
  assert.ok(hi > 2 * lo, `doubling VIT should more than double reflect damage (${lo} -> ${hi})`);
  // Hard DEF multiplies via (100 + 2×Def)/1000, so armour raises it too.
  assert.ok(dmg(80, 10, 2314).dmg > dmg(80, 10, null).dmg, "hard DEF must raise reflect damage");
});

test("Magnum Break's lingering fire hits auto-attacks and Magnum Break only, and bypasses DEF", () => {
  const cfg = createBattleConfig();
  const run = (skillName, opts = {}) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 7, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 40, vit: 80, int: 20, dex: 60, luk: 20 },
      equipped: { right_hand: 1101, ...(opts.wootan ? { armor: 2302, head_top: 2221, head_top_card1: 4261 } : {}) },
      active_buffs: opts.lingering ? { SC_SUB_WEAPONPROPERTY: 1 } : {},
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    const id = skillName ? loader.getSkillIdByName(skillName) : 0;
    const res = new BattlePipeline(cfg).calculate(status, weapon,
      createSkillInstance({ id, level: skillName ? 10 : 1 }),
      // Ghoul-like: Undead element, which Fire beats — makes the added chunk visible.
      createTarget({ def_: opts.def ?? 0, vit: 0, size: 1, race: 0, element: 9, element_level: 1 }), eff, gb);
    return { dmg: res.normal.avg_damage, gb, steps: res.normal.steps };
  };
  // Auto attack and Magnum Break gain it; every other skill does not (PS scope).
  for (const sk of [null, "SM_MAGNUM"]) {
    assert.ok(run(sk, { lingering: true }).dmg > run(sk, {}).dmg,
      `${sk || "auto attack"} should gain the lingering fire`);
  }
  for (const sk of ["SM_BASH", "KN_BOWLINGBASH"]) {
    assert.equal(run(sk, { lingering: true }).dmg, run(sk, {}).dmg,
      `${sk} must NOT gain the lingering fire on PS`);
    assert.ok(run(sk, { lingering: true }).steps.some((s) => /Magnum Break/.test(s.name) && /BYPASSED/.test(s.note)),
      `${sk} should show the bypass explicitly`);
  }
  // Wootan Fighter Card takes the effect from 20% to 30%: the ADDED chunk grows ×1.5.
  const base = run(null, {}).dmg;
  const at20 = run(null, { lingering: true }).dmg - base;
  const at30 = run(null, { lingering: true, wootan: true }).dmg - base;
  assert.equal(run(null, { wootan: true }).gb.magnum_linger_pct, 30, "card sets the effect to 30%");
  assert.ok(at20 > 0 && Math.abs(at30 / at20 - 1.5) < 0.05, `20% -> 30% should scale the add ×1.5 (${at20} -> ${at30})`);
  // Added after defenseFix, so the chunk is the same size against a high-DEF target.
  const addLowDef = run(null, { lingering: true }).dmg - run(null, {}).dmg;
  const addHighDef = run(null, { lingering: true, def: 90 }).dmg - run(null, { def: 90 }).dmg;
  assert.equal(addLowDef, addHighDef, "the lingering chunk must bypass the target's DEF");
});

test("auto-Mammonite casts Lv10 only for the Blacksmith line", () => {
  const cfg = createBattleConfig();
  const castLv = (jobId, mammoniteLv) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: jobId, base_level: 95, job_level: 50,
      base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 },
      equipped: { right_hand: 1504, accessory_left: 2615, head_top: 2221, head_top_card1: 4073 },
      mastery_levels: { MC_MAMMONITE: mammoniteLv },
    });
    return resolvePlayerState(b, cfg, PS)[0].autocast_on_attack[0].skill_level;
  };
  // The [Blacksmith] tag gates the upgrade, not the skill level on its own — a
  // Merchant or Alchemist can master Mammonite too.
  assert.equal(castLv(10, 10), 10, "Blacksmith with Mammonite 10");
  assert.equal(castLv(4011, 10), 10, "Whitesmith with Mammonite 10");
  assert.equal(castLv(10, 5), 1, "Blacksmith without mastery");
  assert.equal(castLv(5, 10), 1, "Merchant with Mammonite 10 still casts Lv1");
  assert.equal(castLv(18, 10), 1, "Alchemist with Mammonite 10 still casts Lv1");
});

// The engine above always read getskilllv() from mastery_levels — but the masteries
// panel is gated by getPassiveSkillsForJob's allowlist, and MC_MAMMONITE / SM_BASH
// were not on it, so no real build could ever SET them: every Pirate Skel autocast
// was priced at Lv1 Mammonite and every Rekenber Mercenary at Lv1 Bash, mastered or
// not. A player asked for "the option to toggle mastery for Autocast cards" — the
// toggle IS the panel offering these levels. This pins the panel surface itself.
test("the masteries panel offers the skills that upgrade autocast cards", () => {
  loader.setProfile(getProfile("payon_stories"));
  const names = (jobId) => loader.getPassiveSkillsForJob(jobId).map((s) => s.name);
  const entry = (jobId, n) => loader.getPassiveSkillsForJob(jobId).find((s) => s.name === n);

  assert.ok(names(10).includes("MC_MAMMONITE"), "Blacksmith can set Mammonite (Pirate Skel Card)");
  assert.equal(entry(10, "MC_MAMMONITE").max_level, 10, "…up to the mastery the card checks for");
  assert.ok(names(1).includes("SM_BASH"), "Swordsman can set Bash (Rekenber Mercenary Card)");
  assert.equal(entry(1, "SM_BASH").max_level, 10);
  assert.ok(names(23).includes("SM_BASH") && names(23).includes("MC_MAMMONITE"),
    "Super Novice learns both and can set both");
  assert.ok(!names(2).includes("SM_BASH") && !names(2).includes("MC_MAMMONITE"),
    "a Mage can learn neither and is offered neither");
});

test("Crescent Scythe heals 0.1% of crit damage PER REFINE, and never counts as damage", () => {
  const cfg = createBattleConfig();
  const run = (itemId, refine) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 7, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 70, vit: 40, int: 1, dex: 60, luk: 80 },
      equipped: { right_hand: itemId }, refine: { right_hand: refine },
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    const res = new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: 0, level: 1 }),
      createTarget({ def_: 0, vit: 0, size: 1, race: 0, element: 0 }), eff, gb);
    return { gb, res };
  };
  // Unrefined: the bonus is getrefine(), so there is nothing to heal.
  assert.equal(run(1466, 0).gb.crit_heal_permille, 0);
  assert.equal(run(1466, 0).res.crit.crit_heal, undefined);

  for (const itemId of [1466, 1476]) {           // plain and slotted variant
    for (const refine of [4, 7, 10]) {
      const { gb, res } = run(itemId, refine);
      assert.equal(gb.crit_heal_permille, refine, `id ${itemId} +${refine}: per-mille tracks refine`);
      const ch = res.crit.crit_heal;
      // 0.1% per refine => permille === refine. NOT a flat 0.1%.
      assert.equal(ch.permille, refine);
      assert.equal(ch.avg, Math.floor(res.crit.avg_damage * refine / 1000));
      // Healing must never leak into the damage numbers.
      assert.ok(!res.crit.steps.some((s) => /heal/i.test(s.name)), "no heal step in the damage pipeline");
      assert.equal(res.normal.crit_heal, undefined, "non-crit hits heal nothing");
    }
  }
  // A +10 Crescent Scythe heals 1% of the crit, an order of magnitude more than
  // the flat 0.1% the patch notes originally said.
  const ten = run(1466, 10);
  assert.equal(ten.res.crit.crit_heal.avg, Math.floor(ten.res.crit.avg_damage / 100));
});

// ---------------------------------------------------------------------------
// Masteries the selected job cannot learn must never be applied. `mastery_levels`
// is free-form and the editor does not clear it on a job change, so levels from a
// previous job linger in the state and in every share URL made from it.
//
// Reported case (share UBxQXSC): an Assassin carrying a leftover Martial Arts
// (MO_IRONHAND) Lv10 read 207 FLEE in the calculator against 187 in-game — exactly
// the +2 FLEE/lv x 10 that PS's Martial Arts grants a Monk.
// ---------------------------------------------------------------------------
// PS Knight rework: Sword Mastery and Two-Hand Sword Mastery are both REMOVED and
// Blade Mastery replaces them (maintainer, 2026-09-07; rework PDF: "Removed from the
// skill tree. Any requirements moved to Blade Mastery" / "renamed to Blade Mastery.
// Now apply to One-Hand Swords as well (4*SkillLevel)"; wiki Blade_Mastery adds
// daggers). The ENGINE had the merge all along (mastery_prefer_fallback SM_SWORD ->
// SM_TWOHANDSWORD) — but the panel still offered BOTH masteries under vanilla names.
// Every job shows Blade Mastery; the internal key differs by tree (Rogue/SN sit on
// SM_SWORD, which also gates the Rogue sword Double Attack).
test("PS Blade Mastery: the one blade mastery every sword job sees, under its PS name", () => {
  loader.setProfile(getProfile("payon_stories"));
  const rows = (j) => loader.getPassiveSkillsForJob(j).filter((s) => /^SM_(SWORD|TWOHAND)/.test(s.name));

  // Swordsman and Knight: exactly one blade mastery, on the SM_TWOHANDSWORD key.
  for (const j of [1, 7]) {
    const r = rows(j);
    assert.equal(r.length, 1, `job ${j} must be offered exactly one blade mastery`);
    assert.equal(r[0].mastery_key, "SM_TWOHANDSWORD");
    assert.equal(r[0].description, "Blade Mastery", "the PS rename must reach the panel");
  }
  // Rogue and Super Novice: same skill, their tree's key — and the same PS name.
  for (const j of [17, 23]) {
    const r = rows(j);
    assert.equal(r.length, 1);
    assert.equal(r[0].mastery_key, "SM_SWORD", `job ${j}'s Blade Mastery rides the SM_SWORD key`);
    assert.equal(r[0].description, "Blade Mastery", "no vanilla 'Sword Mastery' label anywhere");
  }

  // Old builds carrying Sword Mastery on the Swordsman line migrate: the points fold
  // into Blade Mastery (same 4 ATK/lv) instead of being silently zeroed.
  assert.deepEqual(loader.filterMasteryLevelsForJob(7, { SM_SWORD: 10 }),
    { levels: { SM_TWOHANDSWORD: 10 }, dropped: ["SM_SWORD"] });
  assert.deepEqual(loader.filterMasteryLevelsForJob(17, { SM_SWORD: 10 }).dropped, [],
    "a Rogue's Sword Mastery must not be migrated away");

  // One Blade Mastery level reaches all three weapon classes, end to end.
  const cfg = createBattleConfig();
  const masteryStep = (rh, mastery) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 7, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 60, vit: 40, int: 1, dex: 60, luk: 1 },
      equipped: { right_hand: rh }, mastery_levels: mastery,
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    const r = new BattlePipeline(cfg).calculate(st, w, createSkillInstance({ id: 0, level: 1 }),
      createTarget({ def_: 0, vit: 0, size: 1, race: 0, element: 0 }), eff, gb);
    const step = r.normal.steps.find((s) => /Mastery/i.test(s.name));
    return step ? Math.round(step.max_value - (r.normal.steps[r.normal.steps.indexOf(step) - 1]?.max_value ?? 0)) : 0;
  };
  for (const [label, rh] of [["1H sword", 1119], ["dagger", 1201], ["2H sword", 1127]]) {
    assert.equal(masteryStep(rh, { SM_TWOHANDSWORD: 10 }), 40, `Blade Mastery 10 must add +40 on a ${label}`);
  }
  // ...and a legacy SM_SWORD-10 Knight build prices identically (migration end to end).
  assert.equal(masteryStep(1119, { SM_SWORD: 10 }), 40, "legacy Sword Mastery points still count, as Blade Mastery");
});

test("mastery levels the job cannot learn are stripped (Assassin FLEE regression)", () => {
  const cfg = createBattleConfig();
  const SHARED = {
    server: "payon_stories", job_id: 12, base_level: 61, job_level: 26,
    base_stats: { str: 61, agi: 53, dex: 30 },
    equipped: {
      armor: 2302, garment: 2504, shoes: 2402, accessory_left: 2618,
      accessory_right: 2618, right_hand: 13048, left_hand: 13048,
      head_top: 2280, garment_card1: 4102, // Whisper Card = +20 Flee
    },
    refine: { right_hand: 0 },
    consumable_buffs: { aspd_potion: 2 },
    // NJ_/MO_ entries are stale: an Assassin can learn neither.
    mastery_levels: {
      NJ_TOBIDOUGU: 10, MO_IRONHAND: 10, MO_TRIPLEATTACK: 5,
      AS_LEFT: 5, AS_RIGHT: 5, TF_DOUBLE: 10, TF_MISS: 10,
    },
  };
  const [, eff, , status] = resolvePlayerState(buildFromSaveSchema(SHARED), cfg, PS);
  assert.equal(status.flee, 187, "FLEE must match the in-game 187, not 207");
  assert.deepEqual(Object.keys(eff.mastery_levels).sort(),
    ["AS_LEFT", "AS_RIGHT", "TF_DOUBLE", "TF_MISS"],
    "only skills in the Assassin tree survive");

  const { dropped } = loader.filterMasteryLevelsForJob(12, SHARED.mastery_levels);
  assert.deepEqual(dropped.sort(), ["MO_IRONHAND", "MO_TRIPLEATTACK", "NJ_TOBIDOUGU"]);

  // The same masteries must still work for the jobs that DO own them.
  assert.deepEqual(loader.filterMasteryLevelsForJob(15, { MO_IRONHAND: 10 }).dropped, [],
    "a Monk keeps Martial Arts");
  assert.deepEqual(loader.filterMasteryLevelsForJob(25, { NJ_TOBIDOUGU: 10 }).dropped, [],
    "a Ninja keeps Throwing Mastery");

  // Masteries the engine reads but the passive PICKER never lists must survive —
  // filtering against the job's full skill tree is what makes this safe.
  for (const [job, name] of [[10, "MC_MAMMONITE"], [10, "PS_BS_ZENYPINCHER"], [10, "BS_SKINTEMPER"],
    [14, "AL_DP"], [9, "WZ_ESTIMATION"], [25, "NJ_NINPOU"], [4013, "ASC_KATAR"]]) {
    assert.deepEqual(loader.filterMasteryLevelsForJob(job, { [name]: 1 }).dropped, [],
      `${name} must survive for job ${job}`);
  }
  // Blade Mastery is listed as SM_TWOHAND in the tree but stored as SM_TWOHANDSWORD.
  assert.deepEqual(loader.filterMasteryLevelsForJob(7, { SM_TWOHANDSWORD: 10 }).dropped, [],
    "the mastery-key alias must be recognised");
  // An unknown job has no tree to check against — fail open rather than wipe.
  assert.deepEqual(loader.filterMasteryLevelsForJob(99999, { MO_IRONHAND: 10 }).dropped, []);
});

test("a COMBO can grant an autocast (Gust Bow + Arrow of Wind → Wind Blade)", () => {
  const cfg = createBattleConfig();
  const BOWGUE = {
    server: "payon_stories", job_id: 17, base_level: 99, job_level: 50,
    base_stats: { str: 80, agi: 70, vit: 40, int: 1, dex: 90, luk: 20 },
  };
  const state = (rh, ammo, int_ = 1) => {
    const b = buildFromSaveSchema({ ...BOWGUE, base_stats: { ...BOWGUE.base_stats, int: int_ }, equipped: { right_hand: rh, ammo } });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    return { gb, res: new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1036), eff, gb) };
  };

  // The +25% long-range half of the four elemental-bow combos already worked (the
  // vanilla combo db carries it) — pin it so it can't be lost.
  for (const [bow, arrow] of [[1730, 1752], [1731, 1754], [1732, 1756], [1733, 1755]]) {
    assert.equal(state(bow, arrow).gb.long_atk_rate, 25, `bow ${bow} + arrow ${arrow}`);
  }
  assert.equal(state(1733, 1752).gb.long_atk_rate, 0, "Gust Bow + Fire Arrow is not the pairing");
  assert.equal(state(1734, 1755).gb.long_atk_rate, 0, "the arrow alone is not the combo");
  assert.equal(state(1733, 1750).gb.long_atk_rate, 0, "the bow alone is not the combo");

  // The AUTOCAST half was dropped: combo effects went to applyEffect, which has no
  // autospell field, so Gust Bow's Wind Blade never existed. 10%, doubled to 20% at
  // base INT ≥ 40 ("this chance is increased when the wearer's INT is 40 or greater").
  const lowInt = state(1733, 1755, 1).res;
  const highInt = state(1733, 1755, 40).res;
  assert.equal(lowInt.proc_chances.card_autocast_NJ_HUUJIN, 10);
  assert.equal(highInt.proc_chances.card_autocast_NJ_HUUJIN, 20);
  assert.ok(highInt.proc_branches.card_autocast_NJ_HUUJIN.avg_damage > 0, "the proc must be priced");
  assert.ok(highInt.dps > state(1733, 1750, 40).res.dps, "and must reach the DPS");
  // Not a bow/arrow property — no combo, no autocast.
  assert.equal(state(1733, 1750, 40).res.proc_branches.card_autocast_NJ_HUUJIN, undefined);
});

test("a COMBO's autobonus is recorded and applied on the always-proc path", () => {
  const cfg = createBattleConfig();
  // Hahoe Mask + Witch's Pumpkin Hat: autobonus "{ bonus bAtk,50; }" at 0.5%.
  // applyComboBonuses only ever parsed plain bonuses, so a combo's autobonus was
  // dropped — no record for the "always proc" toggle to even offer.
  const gear = (forceProcs) => resolvePlayerState(buildFromSaveSchema({
    server: "payon_stories", job_id: 7, base_level: 99, job_level: 50,
    base_stats: { str: 80, agi: 50, vit: 40, int: 1, dex: 60, luk: 20 },
    equipped: { right_hand: 1101, head_mid: 5176, head_top: 18656 },
    flags: { force_procs: forceProcs },
  }), cfg, PS)[0];

  const off = gear(false);
  assert.equal(off.auto_bonuses.length, 1, "the combo's autobonus must be recorded");
  assert.equal(off.weapon_atk_flat, 0, "but NOT applied until the proc is forced");
  assert.equal(gear(true).weapon_atk_flat, 50, "always-proc applies the +50 ATK");
});

test("bAutoSpellOnSkill fires off the skill that triggers it (Elemental Sword)", () => {
  const cfg = createBattleConfig();
  const [gb, eff, weapon, status] = resolvePlayerState(buildFromSaveSchema({
    server: "payon_stories", job_id: 9, base_level: 99, job_level: 50,
    base_stats: { str: 20, agi: 50, vit: 40, int: 99, dex: 80, luk: 20 },
    equipped: { right_hand: 13414 },
  }), cfg, PS);
  // Elemental Sword chains Cold Bolt → Fire Bolt → Lightning Bolt → Earth Spike,
  // each at 100%. The specs were parsed but nothing ever consumed them.
  assert.equal(gb.autocast_on_skill.length, 3, "three on-skill chains");
  const cast = (name) => new BattlePipeline(cfg).calculate(status, weapon,
    createSkillInstance({ id: loader.getSkillIdByName(name), level: 10, name }),
    loader.getMonster(1036), eff, gb);

  const cold = cast("MG_COLDBOLT");
  assert.equal(cold.proc_chances.card_autocast_MG_FIREBOLT, 100, "Cold Bolt triggers Fire Bolt");
  assert.ok(cold.proc_branches.card_autocast_MG_FIREBOLT.avg_damage > 0, "and it is priced");
  // A spell that is not a trigger gets nothing.
  assert.deepEqual(cast("MG_SOULSTRIKE").proc_branches, {});
});

test("Corrupting Drain follows the card's stat formula and heals 75%", () => {
  const cfg = createBattleConfig();
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 17, base_level: 99, job_level: 50,
    base_stats: { str: 80, agi: 70, vit: 40, int: 40, dex: 60, luk: 50 },
    equipped: { right_hand: 1201, shoes: 2404, shoes_card1: 8218 },
  });
  const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
  const res = new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: 0, level: 1 }),
    loader.getMonster(1036), eff, gb);
  const branch = res.proc_branches.card_autocast_PS_CORRUPTINGDRAIN;

  // Card text: 100 + STR + STR²/40 + DEX + DEX²/40 + INT + INT²/40 + LUK + LUK²/40,
  // computed off TOTAL stats. Independent restatement of the formula, not a
  // frozen number, so a stat-resolution change can't quietly drift it.
  const term = (v) => v + Math.floor((v * v) / 40);
  const expected = 100 + term(status.str) + term(status.dex) + term(status.int_) + term(status.luk);
  assert.equal(branch.avg_damage, expected);
  assert.equal(branch.min_damage, expected, "fixed damage — no weapon roll");
  assert.equal(branch.max_damage, expected);
  // Healed by 75% of the damage — healing, never damage.
  assert.deepEqual(branch.drain_heal, { pct: 75, avg: Math.floor((expected * 75) / 100) });
  // Now that it's priced, it belongs in the DPS (4% of a melee swing).
  const noCard = (() => {
    const b2 = buildFromSaveSchema({
      server: "payon_stories", job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 80, agi: 70, vit: 40, int: 40, dex: 60, luk: 50 },
      equipped: { right_hand: 1201, shoes: 2404 },
    });
    const [g2, e2, w2, s2] = resolvePlayerState(b2, cfg, PS);
    return new BattlePipeline(cfg).calculate(s2, w2, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1036), e2, g2).dps;
  })();
  assert.ok(res.dps > noCard, "the proc must now reach the DPS");
});

test("Corruptor Card's proc is surfaced at the right rate", () => {
  const ROGUE = {
    job_id: 17, base_level: 99, job_level: 50,
    base_stats: { str: 80, agi: 70, vit: 40, int: 1, dex: 60, luk: 20 },
  };
  const CARD = { shoes: 2404, shoes_card1: 8218 };
  const cfg = createBattleConfig();
  // The live pipeline, not runScenario — the golden serializer drops proc_chances.
  const run = (eq) => {
    const b = buildFromSaveSchema({ server: "payon_stories", ...ROGUE, equipped: eq });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    return new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: 0, level: 1 }),
      loader.getMonster(1036), eff, gb);
  };

  const melee = run({ right_hand: 1201, ...CARD });
  const ranged = run({ right_hand: 1733, ammo: 1755, ...CARD });
  const key = "card_autocast_PS_CORRUPTINGDRAIN";
  // The skill constant is PS-custom, so it isn't in the vanilla skill DB — it used to
  // resolve to no id at all, which dropped the bonus silently.
  assert.ok(melee.proc_branches?.[key], "the proc must be visible");
  // ATF_SHORT / ATF_LONG: 4% melee, 2% ranged — the card carries both.
  assert.equal(melee.proc_chances[key], 4);
  assert.equal(ranged.proc_chances[key], 2);
  // Damage is priced from the card's own formula (see the test above), so the two
  // ranges must differ only by the rate, not by the hit.
  assert.equal(melee.proc_branches[key].avg_damage, ranged.proc_branches[key].avg_damage,
    "the proc's damage is stat-based — the same at any range");
  // Only the rate differs by range, so the DPS contribution is halved on a bow.
  const meleeAdd = melee.dps - run({ right_hand: 1201, shoes: 2404 }).dps;
  assert.ok(meleeAdd > 0, "a priced proc reaches the DPS");
});

test("Plagiarism gives a Rogue the copied skill, gated by job, list and rank", () => {
  const ROGUE = {
    job_id: 17, base_level: 99, job_level: 50,
    base_stats: { str: 80, agi: 70, vit: 40, int: 1, dex: 60, luk: 20 },
    equipped: { right_hand: 1201 },
  };
  const dps = (over = {}) => runScenario({ name: "plag", build: { ...ROGUE, ...over }, target: 1036 }).result.dps;
  const copied = (name, level) => ({ flags: { plagiarism: { name, level } } });

  const plain = dps();
  // A copied Triple Attack procs on NORMAL attacks — the whole point of recording
  // it, since the damage skill stays on auto-attack.
  const withTA = dps(copied("MO_TRIPLEATTACK", 5));
  assert.ok(withTA > plain, "copied Triple Attack must proc on auto-attacks");
  // PS retuned Triple Attack to 5 ranks; a copied "Lv10" clamps instead of falling
  // off the rate table and silently procking nothing.
  assert.equal(dps(copied("MO_TRIPLEATTACK", 10)), withTA, "over-max rank clamps to the PS max");
  assert.equal(dps(copied("MO_TRIPLEATTACK", 0)), plain, "rank 0 is nothing copied");
  // Only Rogue/Stalker copy skills, and only from the copyable list — a stale
  // share link must not hand a Knight a plagiarised skill, nor a Rogue a
  // non-copyable mastery.
  const knight = { ...ROGUE, job_id: 7 };
  assert.equal(
    runScenario({ name: "kn1", build: { ...knight, ...copied("MO_TRIPLEATTACK", 5) }, target: 1036 }).result.dps,
    runScenario({ name: "kn0", build: knight, target: 1036 }).result.dps,
    "a Knight cannot plagiarise",
  );
  assert.equal(dps(copied("MO_IRONHAND", 10)), plain, "a skill off the copyable list is ignored");
  assert.equal(dps({ flags: { plagiarism: { name: "", level: 5 } } }), plain, "an empty name is nothing copied");

  // The copyable list is hand-transcribed from the PS wiki — every constant on it
  // must resolve to a real skill, or the picker silently drops entries.
  for (const name of PS.plagiarism_copyable) {
    const rec = loader.getSkillByName(name);
    assert.ok(rec && rec.max_level > 0, `${name} must exist in the skill DB`);
  }
  assert.ok(PS.plagiarism_jobs.has(17) && PS.plagiarism_jobs.has(4018), "Rogue and Stalker only");
});

test("card autocast (Pirate Skel to Mammonite) surfaces as a proc branch on auto-attacks only", () => {
  const cfg = createBattleConfig();
  const run = (skillId) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 10, base_level: 95, job_level: 50,
      base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 },
      equipped: { right_hand: 1504, accessory_left: 2615, head_top: 2221, head_top_card1: 4073 },
      mastery_levels: { MC_MAMMONITE: 10 },
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    // Mammonite is mastered, so the card's 1+9*(getskilllv==10) must resolve to 10.
    assert.equal(gb.autocast_on_attack[0].skill_level, 10, "auto-Mammonite should cast at Lv10");
    assert.equal(gb.autocast_on_attack[0].chance_per_mille, 50, "5% = 50 per mille");
    return new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: skillId, level: 1 }),
      createTarget({ def_: 0, vit: 0, size: 1, race: 0, element: 0 }), eff, gb);
  };
  const auto = run(0);
  assert.ok(auto.proc_branches.card_autocast_MC_MAMMONITE, "auto-attack must surface the proc");
  assert.equal(auto.proc_chances.card_autocast_MC_MAMMONITE, 5);
  assert.ok(auto.proc_branches.card_autocast_MC_MAMMONITE.avg_damage > auto.normal.avg_damage,
    "Mammonite Lv10 (600%) must out-damage the auto-attack it rides on");
  const onSkill = run(41); // Bash - a skill cast, not an auto-attack
  assert.ok(!onSkill.proc_branches.card_autocast_MC_MAMMONITE,
    "card autocast is modeled on auto-attacks only");
});

test("Pirate Skel + Flame Beetle exempts the AUTOCAST Mammonite from Zeny Pincher", () => {
  const cfg = createBattleConfig();
  // Zeny Pincher is a damage term on PS: it halves Mammonite's per-level ratio term
  // (100+50×lv → 100+25×lv). The card combo says the autocast "does not consume zeny
  // and is unaffected by Zeny Pincher", so the PROC keeps the full ratio while a
  // manual cast on the same build stays pinched.
  const run = ({ beetle = false, pincher = false, skillId = 0 } = {}) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 10, base_level: 95, job_level: 50,
      base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 },
      equipped: {
        right_hand: 1504, accessory_left: 2615, head_top: 2221, head_top_card1: 4073,
        ...(beetle ? { accessory_right: 2615, accessory_right_card1: 8237 } : {}),
      },
      mastery_levels: { MC_MAMMONITE: 10 },
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    if (pincher) eff.skill_params = { ...(eff.skill_params || {}), PS_BS_ZENYPINCHER_active: true };
    const res = new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: skillId, level: 10 }),
      createTarget({ def_: 0, vit: 0, size: 1, race: 0, element: 0 }), eff, gb);
    return { res, gb, proc: res.proc_branches.card_autocast_MC_MAMMONITE };
  };

  assert.equal(run({ beetle: true }).gb.auto_mammonite_no_zeny, 1, "the combo must register");
  assert.equal(run({}).gb.auto_mammonite_no_zeny, 0, "Pirate Skel alone is not the combo");

  // Without the combo the proc takes the cut; with it, the proc is untouched.
  const plain = run({}).proc.avg_damage;
  assert.ok(run({ pincher: true }).proc.avg_damage < plain, "Zeny Pincher must cut the un-combo'd proc");
  assert.equal(run({ beetle: true, pincher: true }).proc.avg_damage, plain,
    "the combo'd autocast must ignore Zeny Pincher");

  // A MANUAL Mammonite is still pinched even with both cards on.
  const mammoniteId = loader.getSkillIdByName("MC_MAMMONITE");
  const manualPinched = run({ beetle: true, pincher: true, skillId: mammoniteId }).res.normal.avg_damage;
  const manualFull = run({ beetle: true, skillId: mammoniteId }).res.normal.avg_damage;
  assert.ok(manualPinched < manualFull, "the combo must not exempt a manual cast");
});

test("per-skill cooldowns floor the cast interval, resist Bragi, and bend to bSkillCooldown", () => {
  const cfg = createBattleConfig();
  const PS = getProfile("payon_stories");
  // Throw Arrow: vanilla after-cast delay is 0 (so the engine's 100ms minimum applied),
  // but the PS wiki gives it a 0.3s fixed cooldown — that is what must set the floor.
  const period = ({ dex = 150, bragi = false, skill = "DC_THROWARROW", job = 20, equipped } = {}) => {
    const bragiSong = { SC_POEMBRAGI: 10, SC_POEMBRAGI_lesson: 10, SC_POEMBRAGI_dex: 99, SC_POEMBRAGI_int: 99 };
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: job, base_level: 99, job_level: 50,
      base_stats: { str: 40, agi: 1, vit: 40, int: 60, dex, luk: 30 },
      equipped: equipped || { right_hand: 1950, ammo: 1750 },
      song_state: bragi ? bragiSong : {},
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    const sk = loader.getAllSkills().find((x) => x.name === skill);
    const res = new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: sk.id, level: 5 }),
      createTarget({ def_: 0, vit: 0, size: 1, race: 0, element: 0 }), eff, gb);
    return { period: Math.round(res.period_ms), aspd: status.aspd, gb };
  };

  assert.equal(PS.skill_cooldown_ms.DC_THROWARROW, 300, "Throw Arrow's wiki cooldown must be loaded");
  assert.equal(STANDARD.skill_cooldown_ms.DC_THROWARROW, undefined, "vanilla has no cooldowns");

  // DEX 150 = instant cast, AGI 1 = a slow swing, so nothing else can be the floor:
  // the interval is the 300ms cooldown, not the 100ms minimum delay.
  const plain = period();
  const animation = 2 * Math.max(100, Math.round(2000 - plain.aspd * 10));
  assert.ok(plain.period >= 300, `cooldown must floor the interval (${plain.period}ms)`);
  assert.equal(plain.period, Math.max(300, animation), "interval = max(cooldown, animation)");

  // A cooldown is fixed: Bragi cuts after-cast delay, never this.
  assert.equal(period({ bragi: true }).period, plain.period, "Bragi must not shorten a cooldown");

  // bSkillCooldown moves it. FUEL Card takes Demonstration's 5s cooldown to 3s.
  const bare = period({ skill: "AM_DEMONSTRATION", job: 18, equipped: { right_hand: 1301 } });
  const fuel = period({ skill: "AM_DEMONSTRATION", job: 18, equipped: { right_hand: 1301, shoes: 2405, shoes_card1: 90007 } });
  assert.equal(fuel.gb.skill_cooldown.AM_DEMONSTRATION, -2000, "FUEL Card must register -2s");
  assert.equal(bare.period - fuel.period, 2000, `FUEL should cut 2s (${bare.period} -> ${fuel.period})`);
});

test("Demon Bane's base-level bonus is flat, and Grand Cross takes only its demon half", () => {
  const PS = getProfile("payon_stories");
  const demonBane = PS.mastery_ctx_overrides.AL_DEMONBANE;
  const demon = { race: "Demon", element: 7, is_pc: false };
  const undeadEle = { race: "Formless", element: 9, is_pc: false };
  const other = { race: "Formless", element: 0, is_pc: false };
  const holyCross = { name: "CR_HOLYCROSS" };
  const grandCross = { name: "CR_GRANDCROSS" };

  // wiki.payonstories.com/Demon_Bane: "+5 per skill level +0.5 × (1 + Base Level)".
  // The base-level half does NOT scale with skill level — the bug this pins is the
  // vanilla-shaped lv × (5 + (BaseLv+1)/20) reading, which happens to agree at
  // Lv10/base 99 (both 100) and is wrong at every other level.
  const atBase99 = (lv) => demonBane(lv, demon, { base_level: 99 }, holyCross);
  assert.equal(atBase99(10), 100, "Lv10/base99: 50 + 50");
  assert.equal(atBase99(5), 75, "Lv5/base99: 25 + 50 — the level-scaled reading gives 50");
  assert.equal(atBase99(1), 55, "Lv1/base99: 5 + 50 — the level-scaled reading gives 10");
  // The flat half tracks base level on its own.
  assert.equal(demonBane(10, demon, { base_level: 49 }, holyCross), 75, "Lv10/base49: 50 + 25");
  // Undead ELEMENT counts as well as Demon race.
  assert.equal(demonBane(10, undeadEle, { base_level: 99 }, holyCross), 100);

  // The +4/lv against everything else has no base-level term...
  assert.equal(demonBane(10, other, { base_level: 99 }, holyCross), 40);
  // ...and wiki.payonstories.com/Grand_Cross excludes it: "only the demon/undead
  // aspect of Demon Bane's mastery bonus benefits Grand Cross, not its flat
  // mastery bonus". Against a demon, Grand Cross still gets the demon half.
  assert.equal(demonBane(10, other, { base_level: 99 }, grandCross), null, "GC gets no flat half");

  // Grand Cross takes only +1 per level, not +5 — measured in-game at base 99 vs a
  // Demon: no mastery 40, Demon Bane Lv1 1060, Lv10 1240, Lv10 + Blade Mastery Lv10
  // 2040. Those four pin the per-level shape without needing the multiplier, since
  // (1240−40)/(1060−40) = 1.1765 = 60/51 = (10+50)/(1+50).
  assert.equal(demonBane(1, demon, { base_level: 99 }, grandCross), 51, "GC Lv1: 1 + 50");
  assert.equal(demonBane(10, demon, { base_level: 99 }, grandCross), 60, "GC Lv10: 10 + 50");
  const gcRatio = demonBane(10, demon, { base_level: 99 }, grandCross)
    / demonBane(1, demon, { base_level: 99 }, grandCross);
  assert.ok(Math.abs(gcRatio - 1200 / 1020) < 1e-9, "must reproduce the measured Lv10/Lv1 ratio");

  // Never applies to a player target (PvP is out of scope for the bonus).
  assert.equal(demonBane(10, { ...demon, is_pc: true }, { base_level: 99 }, holyCross), null);
});

// ---------------------------------------------------------------------------
// Blitz Beat / auto-blitz is BF_MISC: no attacker card bonuses
// ---------------------------------------------------------------------------
test("the falcon ignores the attacker's race/boss cards, but the bow attack does not", () => {
  const { computeFalconDamage } = require("../src/engine/calculators/falconCalc");
  const config = createBattleConfig();
  const profile = getProfile("payon_stories");

  const hunter = (cards) => buildFromSaveSchema({
    job_id: 11, base_level: 99, job_level: 50,
    base_stats: { str: 1, agi: 99, vit: 1, int: 1, dex: 63, luk: 72 },
    equipped: { right_hand: 1705, ammo: 1764, ...cards },
    mastery_levels: { HT_FALCON: 1, HT_BLITZBEAT: 5, HT_STEELCROW: 10 },
  });
  // 4× Abysmal Knight Card = +25% vs Boss each.
  const AK = { right_hand_card1: 4140, right_hand_card2: 4140, right_hand_card3: 4140, right_hand_card4: 4140 };
  const boss = loader.getMonster(1159); // Phreeoni — Large Brute BOSS

  const run = (cards) => {
    const [gearBonuses, effBuild, , status] = resolvePlayerState(hunter(cards), config, profile);
    return computeFalconDamage(status, effBuild, gearBonuses, boss, loader);
  };
  const bare = run({});
  const carded = run(AK);

  // The cards ARE parsed and would be worth +100% if they applied.
  const [gb] = resolvePlayerState(hunter(AK), config, profile);
  assert.equal(gb.add_race.RC_Boss, 100, "4x Abysmal Knight must aggregate to +100% vs Boss");

  // …and the falcon must be identical with and without them. Blitz Beat is
  // BF_MISC (skills.json attack_type "Misc"); Hercules battle_calc_cardfix's
  // `case BF_MISC` has only a defender (`tsd`) branch — no attacker cardfix.
  assert.equal(carded.per_hit, bare.per_hit, "falcon per-hit must ignore bAddRace/boss cards");
  assert.equal(carded.auto_blitz_total, bare.auto_blitz_total);

  // Sanity-check the PS formula it should equal: (LUK + INT/2 + 6*SteelCrow + 20)*2,
  // Neutral vs Phreeoni's Neutral 3 defence = ×100%.
  const [, , , st] = resolvePlayerState(hunter(AK), config, profile);
  assert.equal(bare.per_hit, (st.luk + Math.floor(st.int_ / 2) + 10 * 6 + 20) * 2);

  // Hit count and proc chance still follow job level and LUK.
  assert.equal(bare.auto_blitz_hits, 5, "job level 50 + Blitz Lv5 = 5 hits");
  assert.equal(bare.auto_blitz_chance, Math.floor(st.luk / 3));
});

// ---------------------------------------------------------------------------
// Sphere Mine (AM_SPHEREMINE) — PS flat formula
// ---------------------------------------------------------------------------
test("Sphere Mine is flat 1000 + 200*lv + 25*total VIT, Fire, and skips DEF/size/cards", () => {
  const profile = getProfile("payon_stories");
  const config = createBattleConfig();
  const pipeline = new BattlePipeline(config);

  const build = (cards = {}) => buildFromSaveSchema({
    job_id: 18, base_level: 99, job_level: 50,
    base_stats: { str: 40, agi: 40, vit: 50, int: 40, dex: 60, luk: 20 },
    equipped: { right_hand: 1305, ...cards },
  });
  const tgt = (over = {}) => createTarget({
    def_: 0, vit: 0, size: "Medium", race: "Formless", element: 0, element_level: 1, ...over,
  });
  const dmg = (lv, target, cards = {}) => {
    const b = build(cards);
    const [gearBonuses, effBuild, weapon, status] = resolvePlayerState(b, config, profile);
    const skill = createSkillInstance({ id: loader.getSkillIdByName("AM_SPHEREMINE"), level: lv, name: "AM_SPHEREMINE" });
    const res = pipeline.calculate(status, weapon, skill, target, effBuild, gearBonuses);
    return { avg: res.normal.avg_damage, vit: status.vit, valid: res.dps_valid };
  };

  // The formula itself, on a Neutral 1 target (Fire vs Neutral = ×100%).
  const neutral = tgt();
  for (const lv of [1, 3, 5]) {
    const r = dmg(lv, neutral);
    assert.equal(r.avg, 1000 + 200 * lv + 25 * r.vit, `Lv${lv} must be 1000 + 200*lv + 25*totalVIT`);
  }

  // Ignores the target's DEF entirely — hard (wiki: "ignores DEF") and soft.
  const base = dmg(5, neutral).avg;
  assert.equal(dmg(5, tgt({ def_: 99 })).avg, base, "hard DEF must not reduce it");
  assert.equal(dmg(5, tgt({ vit: 99 })).avg, base, "soft DEF must not reduce it");

  // "not affected by weapon size penalties" — and there is no weapon roll anyway.
  for (const size of ["Small", "Medium", "Large"]) {
    assert.equal(dmg(5, tgt({ size })).avg, base, `${size} must not change it`);
  }

  // Fire element IS applied. Pre-re attr table: Fire vs Water 1 = 50%, vs Earth 1 = 150%.
  assert.equal(dmg(5, tgt({ element: 1 })).avg, Math.floor(base * 0.5), "Fire vs Water 1 = 50%");
  assert.equal(dmg(5, tgt({ element: 2 })).avg, Math.floor(base * 1.5), "Fire vs Earth 1 = 150%");

  // Attacker card bonuses do NOT apply (summon-detonation damage is the BF_MISC
  // family; the wiki lists DEF and size as skipped and never grants cards).
  const dh = tgt({ race: "Demi-Human" });
  assert.equal(dmg(5, dh, { right_hand_card1: 4035 }).avg, dmg(5, dh).avg,
    "Hydra Card must not raise Sphere Mine");
});

// ---------------------------------------------------------------------------
// Bard / Dancer songs scale with the PERFORMER, not the listener
// ---------------------------------------------------------------------------
test("song strength comes from the performer's stats and Lesson level", () => {
  const { StatusCalculator } = require("../src/engine/calculators/statusCalculator");
  const profile = getProfile("payon_stories");
  const config = createBattleConfig();

  const statusWith = (song) => {
    const b = buildFromSaveSchema({
      job_id: 7, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi: 60, vit: 50, int: 30, dex: 60, luk: 40 },
      equipped: { right_hand: 1101 },
      song_state: song,
    });
    const [gb, eff, weapon] = resolvePlayerState(b, config, profile);
    return new StatusCalculator(config).calculate(eff, weapon, gb);
  };

  const songs = { SC_WHISTLE: 10, SC_FORTUNE: 10, SC_POEMBRAGI: 10, SC_HUMMING: 10 };

  // Unset performer = the old silent default of stat 1 / Lesson 0. A Lv10 Whistle
  // from a 1-AGI Bard is +10 flee; Bragi caps at its published −30% / −50%.
  const bare = statusWith(songs);

  // A real Bard/Dancer. Every one of these is a term the calculator used to ignore.
  const real = statusWith({
    ...songs,
    bard_agi: 90, bard_luk: 80, bard_dex: 99, bard_int: 60, bard_lesson: 10,
    dancer_dex: 90, dancer_luk: 90, dancer_lesson: 10,
  });

  assert.ok(real.flee > bare.flee, "Whistle: performer AGI + Musical Lesson raise flee");
  assert.ok(real.flee2 > bare.flee2, "Whistle: performer LUK raises perfect dodge");
  assert.ok(real.cri > bare.cri, "Fortune's Kiss: performer LUK + Dancing Lesson raise crit");
  assert.ok(real.hit > bare.hit, "Humming: performer DEX + Dancing Lesson raise hit");

  // Bragi, the one with published endpoints: 3%/lv cast (30% at Lv10) and 50% delay
  // at Lv10, THEN + DEX/10 + 2×Lesson and + INT/5 + 2×Lesson.
  // wiki.payonstories.com/A_Poem_of_Bragi
  assert.strictEqual(bare.cast_time_reduction_pct, 30);
  assert.strictEqual(bare.after_cast_delay_reduction_pct, 50);
  assert.strictEqual(real.cast_time_reduction_pct, 30 + Math.floor(99 / 10) + 2 * 10);
  assert.strictEqual(real.after_cast_delay_reduction_pct, 50 + Math.floor(60 / 5) + 2 * 10);

  // A per-song override still beats the shared block, so share URLs written before
  // the performer block keep computing exactly what they used to.
  const override = statusWith({ SC_WHISTLE: 10, SC_WHISTLE_agi: 50, bard_agi: 90, bard_lesson: 10 });
  const shared = statusWith({ SC_WHISTLE: 10, bard_agi: 90, bard_lesson: 10 });
  assert.ok(override.flee < shared.flee, "SC_WHISTLE_agi 50 must win over bard_agi 90");

  // A performer stat of 0 means "not filled in", not a 0-stat Bard.
  assert.strictEqual(statusWith({ ...songs, bard_agi: 0 }).flee, bare.flee);
});

// ---------------------------------------------------------------------------
// Ammo only counts when the equipped weapon can actually fire it
// ---------------------------------------------------------------------------
test("ammo bonuses need a compatible weapon, and arrows still reach bows/instruments/whips", () => {
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const config = createBattleConfig();

  // Every bundled ammo row must carry a subtype — the gate is a no-op without one,
  // and the PS bullets/grenades shipped untagged, which is what let this through.
  const untagged = (loader.getItemsByType("IT_AMMO") || []).filter((i) => !i.subtype);
  assert.deepEqual(untagged.map((i) => i.id), [], "every ammo item needs a subtype");

  const bonusesFor = (weaponId, ammoId) => {
    const b = buildFromSaveSchema({
      job_id: 24, base_level: 99, job_level: 50,
      base_stats: { str: 40, agi: 60, vit: 40, int: 40, dex: 90, luk: 20 },
      equipped: { right_hand: weaponId, ...(ammoId ? { ammo: ammoId } : {}) },
    });
    const [gb] = resolvePlayerState(b, config, profile);
    return gb;
  };

  // Measure the ammo's DELTA, never an absolute: a weapon can carry the same bonus
  // itself (Cleaver has `bAddRace,RC_DemiPlayer,5`, which fans out to RC_DemiHuman),
  // so asserting a bare 0 would fail for reasons that have nothing to do with ammo.
  // The ammo's bonuses live in their own pool (`from_ammo`) — Hercules' arrow_* arrays,
  // read only by an attack that fires the ammo — so that is where the delta is measured.
  const delta = (weaponId, ammoId, key) =>
    (bonusesFor(weaponId, ammoId).from_ammo.add_race[key] || 0)
    - (bonusesFor(weaponId, null).from_ammo.add_race[key] || 0);

  // ...and it must NOT be in the global pool, or it would apply to every attack whether
  // or not the ammo is fired — the leak that gave Soul Bullet a bullet's +20%.
  const globalDelta = (weaponId, ammoId, key) =>
    (bonusesFor(weaponId, ammoId).add_race[key] || 0) - (bonusesFor(weaponId, null).add_race[key] || 0);

  // Hollow-Point Bullet (13234) = bonus2 bAddRace,RC_DemiHuman,20 — a GUN bullet.
  const MACE = 1504, REVOLVER = 13100, BOW = 1707, LUTE = 1905, WHIP = 1950;
  assert.equal(delta(MACE, 13234, "RC_DemiHuman"), 0,
    "a mace cannot fire a bullet, so its bonus must not apply");
  assert.equal(delta(REVOLVER, 13234, "RC_DemiHuman"), 20,
    "a revolver CAN fire it — the bonus must survive");
  assert.equal(globalDelta(REVOLVER, 13234, "RC_DemiHuman"), 0,
    "but it must stay OUT of the global pool — only an ammo-firing attack may read it");

  // Holy Arrow (1772) = bonus2 bAddRace,RC_Demon,5. Arrows are not bow-only on PS:
  // Musical Strike and Throw Arrow consume them too.
  for (const [label, wpn] of [["bow", BOW], ["instrument", LUTE], ["whip", WHIP]]) {
    assert.equal(delta(wpn, 1772, "RC_Demon"), 5, `${label} must keep the arrow bonus`);
  }
  assert.equal(delta(MACE, 1772, "RC_Demon"), 0, "a mace cannot fire an arrow");

  // Thrown ammo carries no weapon requirement and stays unrestricted: Venom Knife
  // (1774, A_DAGGER) is thrown by AS_VENOMKNIFE whatever you are holding.
  const knife = loader.getItem(1771);
  assert.equal(knife.subtype, "A_DAGGER");
  assert.ok(!(["A_ARROW", "A_BULLET", "A_GRENADE"].includes(knife.subtype)),
    "thrown ammo must not be gated on weapon type");
});

// ---------------------------------------------------------------------------
// Mineral Card: PS effect, not vanilla's
// ---------------------------------------------------------------------------
test("Mineral Card gives DEF and soft DEF, with no vanilla ATK penalty", () => {
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const config = createBattleConfig();
  const { StatusCalculator } = require("../src/engine/calculators/statusCalculator");

  const stat = (cards) => {
    const b = buildFromSaveSchema({
      job_id: 7, base_level: 99, job_level: 50,
      base_stats: { str: 80, agi: 50, vit: 60, int: 20, dex: 50, luk: 20 },
      equipped: { right_hand: 1101, armor: 2302, ...cards },
    });
    const [gb, eff, weapon] = resolvePlayerState(b, config, profile);
    return new StatusCalculator(config).calculate(eff, weapon, gb);
  };
  const bare = stat({});
  const mineral = stat({ armor_card1: 4339 });

  // tools.payonstories.com/api/pc/item?name=Mineral+Card — "DEF + 3 | While your
  // current HP is at 80% or higher, Soft DEF + 30". Vanilla's `bonus bBaseAtk,-25`
  // is gone; the calculator prices at full HP so the clause always holds.
  assert.equal(mineral.def_ - bare.def_, 3, "hard DEF +3");
  assert.equal(mineral.def2 - bare.def2, 30, "soft DEF +30");
  assert.equal(mineral.batk, bare.batk, "the vanilla -25 ATK penalty must be gone");
});

// ---------------------------------------------------------------------------
// Gunslinger coins + Fling
// ---------------------------------------------------------------------------
test("Fling spends coins for flat damage, capped at 5", () => {
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const config = createBattleConfig();
  const pipeline = new BattlePipeline(config);

  const fling = (coins, baseLv = 99, jobLv = 50) => {
    const b = buildFromSaveSchema({
      job_id: 24, base_level: baseLv, job_level: jobLv,
      base_stats: { str: 40, agi: 60, vit: 40, int: 40, dex: 90, luk: 20 },
      equipped: { right_hand: 13100, ammo: 13200 },
      flags: { gs_coins: coins },
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, config, profile);
    const skill = createSkillInstance({ id: loader.getSkillIdByName("GS_FLING"), level: 1, name: "GS_FLING" });
    return pipeline.calculate(status, weapon, skill, loader.getMonster(1159), eff, gb);
  };

  // wiki.payonstories.com/Fling: "(jobLvl+baseLvl) dmg per coin used",
  // "Consumes up to 5 coins".
  const perCoin = 50 + 99;
  assert.equal(fling(0).normal.avg_damage, 0, "no coins, no damage");
  assert.equal(fling(1).normal.avg_damage, perCoin);
  assert.equal(fling(3).normal.avg_damage, perCoin * 3);
  assert.equal(fling(5).normal.avg_damage, perCoin * 5);
  // A Gunslinger can HOLD 10 coins but Fling only spends 5 of them.
  assert.equal(fling(10).normal.avg_damage, perCoin * 5, "capped at 5 coins, not 10");

  // It scales off levels, not ATK — a different base level moves it.
  assert.equal(fling(1, 50, 50).normal.avg_damage, 100);

  // Coins are a finite pool, so a sustained DPS figure would be fiction.
  assert.equal(fling(5).dps_valid, false);

  // "not affected by Barrage, target defense or element" — the branch runs no
  // defenseFix/attrFix/cardFix at all, so the only steps are its own.
  const steps = fling(5).normal.steps.map((s) => s.name);
  for (const banned of ["Defense Fix", "Attr Fix", "Card Fix", "Skill Ratio"]) {
    assert.ok(!steps.includes(banned), `Fling must not apply ${banned}`);
  }
});

test("Fling's coin debuff cuts the target's DEF by 3% per coin", () => {
  // The DEF cut is target state, applied in routes/calculate.ts, so assert the
  // arithmetic it performs: def_percent -= 3 * coins, coins clamped to 0..5.
  // PS retuned this from Hercules' 5%/coin (status.c:8714 `val2 = 5*val1`).
  const flingPercent = (coins) => {
    const c = Math.max(0, Math.min(5, Number(coins) || 0));
    return Math.max(0, 100 - 3 * c);
  };
  assert.equal(flingPercent(0), 100);
  assert.equal(flingPercent(1), 97);
  assert.equal(flingPercent(3), 91);
  assert.equal(flingPercent(5), 85, "5 coins = -15%, the wiki's max");
  assert.equal(flingPercent(10), 85, "still capped at 5 coins");

  // def_percent is the same field Provoke uses, and that is load-bearing: Hercules
  // applies it to soft DEF only for a player target (battle.c:1494) but to hard AND
  // soft for a monster (1510-11), which is exactly the wiki's "Only reduces Soft Def
  // against players". If defenseFix ever stops splitting on is_pc, that note breaks.
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "engine", "calculators", "modifiers", "defenseFix.js"), "utf8");
  assert.ok(/target\.is_pc/.test(src) && /def_percent/.test(src),
    "defenseFix must still branch on is_pc when applying def_percent");
});

// ---------------------------------------------------------------------------
// Arrow ATK follows the SKILL's ammo requirement, not the weapon type
// ---------------------------------------------------------------------------
test("ammo ATK counts only for skills that require ammo (and normal attacks)", () => {
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const config = createBattleConfig();
  const pipeline = new BattlePipeline(config);
  const ORIDECON_ARROW = 1765; // ATK 50
  const BOW = 1716;

  const dmg = (jobId, skillName, withAmmo, extra = {}) => {
    const b = buildFromSaveSchema({
      job_id: jobId, base_level: 99, job_level: 50,
      base_stats: { str: 1, agi: 94, vit: 1, int: 26, dex: 99, luk: 1 },
      equipped: { right_hand: BOW, ...(withAmmo ? { ammo: ORIDECON_ARROW } : {}) },
      ...extra,
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, config, profile);
    const skill = skillName
      ? createSkillInstance({ id: loader.getSkillIdByName(skillName), level: 5, name: skillName })
      : createSkillInstance({ id: 0, level: 1 });
    return pipeline.calculate(status, weapon, skill, loader.getMonster(1036), eff, gb).normal.avg_damage;
  };
  const gains = (jobId, skillName, extra) => dmg(jobId, skillName, true, extra) - dmg(jobId, skillName, false, extra);

  // The report: a bow Rogue's plagiarised Acid Terror. Its requirement is
  // `Items: { Acid_Bottle: 1 }` with no AmmoTypes, so skill_check_condition_castbegin
  // sets sd->state.arrow_atk = 0 (skill.c:15810) and the arrow contributes nothing.
  const rogueExtra = { flags: { plagiarism: { name: "AM_ACIDTERROR", level: 5 } } };
  assert.equal(gains(17, "AM_ACIDTERROR", rogueExtra), 0, "Acid Terror must not gain arrow ATK");

  // Skills that DO require ammo keep it, and so does a normal attack (where the
  // weapon type is what sets arrow_atk, battle.c:6852).
  assert.ok(gains(11, "AC_DOUBLE") > 0, "Double Strafe requires arrows — must still gain");
  assert.ok(gains(11, "AC_SHOWER") > 0, "Arrow Shower requires arrows — must still gain");
  assert.ok(gains(11, null) > 0, "a bow normal attack must still gain");

  // The data this now keys off must actually be present, or the gate silently
  // becomes "never".
  const needsAmmo = (n) => {
    const r = loader.getSkillByName(n).requirements || {};
    return (r.ammo_types || []).length > 0 || (r.ammo_amount || []).some((x) => Number(x) > 0);
  };
  for (const n of ["AC_DOUBLE", "AC_SHOWER", "AC_CHARGEARROW", "SN_SHARPSHOOTING",
                   "BA_MUSICALSTRIKE", "DC_THROWARROW", "CG_ARROWVULCAN"]) {
    assert.ok(needsAmmo(n), `${n} must declare an ammo requirement`);
  }
  for (const n of ["AM_ACIDTERROR", "AM_DEMONSTRATION", "HT_BLITZBEAT"]) {
    assert.ok(!needsAmmo(n), `${n} must NOT declare an ammo requirement`);
  }

  // HT_PHANTASMIC is a Bows skill that consumes no ammo, and Hercules force-sets
  // flag.arrow for it (battle.c:4909). Without that exception the data-driven test
  // above would wrongly strip its arrow ATK.
  assert.ok(!needsAmmo("HT_PHANTASMIC"), "still the odd one out in the data");
  assert.ok(gains(11, "HT_PHANTASMIC") > 0, "Phantasmic Arrow is force-set as an arrow attack");
});

// ---------------------------------------------------------------------------
// isequipped() — set bonuses, and effects a full set switches OFF
// ---------------------------------------------------------------------------
test("isequipped() gates a script, and a bare `!` no longer fails open", () => {
  const { parseScript, createItemScriptContext } = require("../src/engine/itemScriptParser");
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const config = createBattleConfig();

  // `!` was never tokenized (only `!=` was), so safeEvalInt threw, returned null,
  // and evalConditionals took the TRUE branch — every `if(!...)` guard in the DB
  // applied the thing it was meant to suppress.
  const applied = (cond) =>
    parseScript(`if(${cond}) bonus bFlee,7;`, createItemScriptContext({})).length > 0;
  assert.equal(applied("1"), true);
  assert.equal(applied("0"), false);
  assert.equal(applied("!0"), true);
  assert.equal(applied("!1"), false, "a bare ! must not fail open");

  // Wanderer Card (4210): `if(!isequipped(4172,4257,4230,4272)) bonus3 bAutoSpell,
  // RG_INTIMIDATE,1,20;` — the Intimidate proc is switched OFF by the full thief
  // card set, while its unconditional Flee stays.
  const THIEF_SET = [4172, 4257, 4230, 4272];
  const script = loader.getItem(4210).script;
  assert.ok(/isequipped/.test(script), "Wanderer Card must still carry the guard");

  const autocastsWith = (equipped) => {
    const b = buildFromSaveSchema({
      job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi: 80, vit: 30, int: 20, dex: 60, luk: 20 },
      equipped: { right_hand: 1201, armor: 2302, garment: 2502, garment_card1: 4210, ...equipped },
    });
    const [gb] = resolvePlayerState(b, config, profile);
    return (gb.autocast_on_attack || []).map((a) => a.skill_name);
  };
  const FULL = {
    right_hand_card1: THIEF_SET[0],      // The Paper    - EQP_WEAPON
    shoes: 2406, shoes_card1: THIEF_SET[1],   // Wild Rose    - EQP_SHOES
    accessory_left: 2615, accessory_left_card1: THIEF_SET[2],    // Shinobi     - EQP_ACC
    accessory_right: 2615, accessory_right_card1: THIEF_SET[3],  // Zhu Po Long - EQP_ACC
  };
  const PARTIAL = { ...FULL };
  delete PARTIAL.accessory_right_card1; // one card short

  assert.ok(autocastsWith({}).includes("RG_INTIMIDATE"), "alone, the proc applies");
  assert.ok(autocastsWith(PARTIAL).includes("RG_INTIMIDATE"), "one card short — still applies");
  assert.ok(!autocastsWith(FULL).includes("RG_INTIMIDATE"), "full thief set switches the proc off");

  // isequipped needs EVERY listed id, and resolves to 0 when the caller supplies
  // no equipped list at all (so a bare parseScript still works).
  const guard = "if(isequipped(4172,4257)) bonus bFlee,7;";
  assert.equal(parseScript(guard, createItemScriptContext({ equipped_ids: new Set([4172, 4257]) })).length, 1);
  assert.equal(parseScript(guard, createItemScriptContext({ equipped_ids: new Set([4172]) })).length, 0);
  assert.equal(parseScript(guard, createItemScriptContext({})).length, 0, "no list = not equipped");
});

// ---------------------------------------------------------------------------
// Rust-Worn Apparatus: both bonuses, and a description to hover
// ---------------------------------------------------------------------------
test("Rust-Worn Apparatus grants INT and Perfect Dodge, and has a description", () => {
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const config = createBattleConfig();
  const { StatusCalculator } = require("../src/engine/calculators/statusCalculator");

  const stat = (equipped) => {
    const b = buildFromSaveSchema({
      job_id: 11, base_level: 99, job_level: 50,
      base_stats: { str: 1, agi: 70, vit: 20, int: 70, dex: 80, luk: 20 },
      equipped: { right_hand: 1707, ...equipped },
    });
    const [gb, eff, weapon] = resolvePlayerState(b, config, profile);
    return new StatusCalculator(config).calculate(eff, weapon, gb);
  };
  const bare = stat({});
  const worn = stat({ accessory_left: 81012 });

  // Both halves of `bonus bInt,1; bonus bFlee2,2;` reach the status. The player who
  // reported the Perfect Dodge "missing" was seeing a DISPLAY gap: flee2 was absent
  // from the /status payload, so no panel could show it.
  assert.equal(worn.int_ - bare.int_, 1, "INT +1");
  assert.equal(worn.flee2 - bare.flee2, 2, "Perfect Dodge +2");

  const desc = loader.getItemDescription(81012);
  assert.ok(desc && desc.description, "must have a description to hover");
  assert.ok(/Perfect Dodge/i.test(desc.description), "and it should mention the bonus");
});

// ---------------------------------------------------------------------------
// A card only counts in a slot it can actually compound into
// ---------------------------------------------------------------------------
test("cards are ignored in slots they cannot compound into", () => {
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const config = createBattleConfig();

  const gb = (equipped) => {
    const b = buildFromSaveSchema({
      job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi: 80, vit: 30, int: 20, dex: 60, luk: 20 },
      equipped,
    });
    return resolvePlayerState(b, config, profile)[0];
  };
  const SHIELD = { right_hand: 1201, armor: 2302, garment: 2502, left_hand: 2101 }; // Guard
  const DUAL   = { right_hand: 1201, armor: 2302, garment: 2502, left_hand: 1201 }; // off-hand dagger

  // Wanderer (4210) is a GARMENT card. The editor's picker already filters by slot,
  // but share URLs, the jaludev importer and direct API calls all bypass it.
  const autocasts = (eq) => (gb(eq).autocast_on_attack || []).map((a) => a.skill_name);
  assert.ok(autocasts({ ...SHIELD, garment_card1: 4210 }).includes("RG_INTIMIDATE"), "correct slot applies");
  assert.ok(!autocasts({ ...SHIELD, armor_card1: 4210 }).includes("RG_INTIMIDATE"), "armour slot must ignore it");

  // Hydra (4035) is a WEAPON card; Pupa (4003) is ARMOR.
  assert.equal(gb({ ...SHIELD, right_hand_card1: 4035 }).add_race.RC_DemiHuman || 0, 20);
  assert.equal(gb({ ...SHIELD, armor_card1: 4035 }).add_race.RC_DemiHuman || 0, 0, "weapon card in armour");
  assert.equal(gb({ ...SHIELD, armor_card1: 4003 }).maxhp, 700);
  assert.equal(gb({ ...SHIELD, garment_card1: 4003 }).maxhp, 0, "armour card in garment");

  // left_hand depends on what is HELD: a shield takes shield cards, an off-hand
  // weapon takes weapon cards. Thara Frog (4058) is EQP_SHIELD.
  assert.equal(gb({ ...SHIELD, left_hand_card1: 4058 }).sub_race.RC_DemiHuman || 0, 30, "shield card on a shield");
  assert.equal(gb({ ...DUAL, left_hand_card1: 4058 }).sub_race.RC_DemiHuman || 0, 0, "shield card on a weapon");
  assert.equal(gb({ ...DUAL, left_hand_card1: 4035 }).add_race.RC_DemiHuman || 0, 20, "weapon card on the off-hand");
  assert.equal(gb({ ...SHIELD, left_hand_card1: 4035 }).add_race.RC_DemiHuman || 0, 0, "weapon card on a shield");

  // The synthetic wildcard/convenience cards carry every loc and must stay usable
  // in any slot — they are how the custom card-mix UI is priced.
  assert.equal(gb({ ...SHIELD, armor_card1: 4704 }).str_, 5, "wildcard STR+5 still applies");
  assert.equal(gb({ ...SHIELD, right_hand_card1: 4704 }).str_, 5);
});

// Cards persist through a gear swap now (player request, 2026-09-06): Unequip keeps
// the slotted cards so the next item inherits them. Two shapes become reachable and
// must contribute NOTHING: a card whose host slot is empty (dormant between items),
// and a card index beyond the new host's slot count (a bigger weapon's extras after
// swapping onto a smaller one — the UI hides those rows, the engine must not price them).
test("kept cards are dormant on an empty host slot and beyond the host's slot count", () => {
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const config = createBattleConfig();
  const gb = (equipped) => {
    const b = buildFromSaveSchema({
      job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi: 80, vit: 30, int: 20, dex: 60, luk: 20 },
      equipped,
    });
    return resolvePlayerState(b, config, profile)[0];
  };
  // Hydra (4035): +20% vs DemiHuman, weapon card.
  assert.equal(gb({ right_hand: 1201, right_hand_card1: 4035 }).add_race.RC_DemiHuman || 0, 20, "baseline: applies with a host");
  assert.equal(gb({ right_hand: null, right_hand_card1: 4035 }).add_race.RC_DemiHuman || 0, 0, "empty host: card is dormant");
  // Knife (1201) has 3 slots: card3 is the last real one, card4 is overflow.
  assert.equal(gb({ right_hand: 1201, right_hand_card3: 4035 }).add_race.RC_DemiHuman || 0, 20, "last real slot applies");
  assert.equal(gb({ right_hand: 1201, right_hand_card4: 4035 }).add_race.RC_DemiHuman || 0, 0, "beyond the host's slots: dormant");
});

// ---------------------------------------------------------------------------
// Turn Undead / offensive Resurrection: fail damage, PS success formula,
// failed-cast iteration (requested by a CC), and the Boss gate
// ---------------------------------------------------------------------------
test("Turn Undead: fail damage, success chance, failed-cast iteration, INT halving, Boss gate", () => {
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const cfg = createBattleConfig();
  const mk = (int_) => buildFromSaveSchema({
    server: "payon_stories", job_id: 8, base_level: 99, job_level: 50,
    base_stats: { str: 1, agi: 1, vit: 1, int: int_, dex: 1, luk: 30 }, equipped: {},
  });
  const run = (b, skillId, lv, tgt) => {
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, profile);
    return new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: skillId, level: lv }), tgt, eff, gb);
  };
  // Neutral lv1 target so the Holy AttrFix is ×1.0 and the raw formula is visible.
  const t0 = () => createTarget({ def_: 0, mdef_: 0, int_: 0, vit: 0, size: 1, race: 0, element: 0 });

  // Priest 99/50, base INT 99 / LUK 30 → status INT 104 / LUK 37 with job bonuses.
  // Fail damage (BaseLv + INT + 10×lv) × 3 × (1 + LUK×3/200) = 303×3×1.555 → 1413.
  // Success [20×10 + 3×37 + 104 + 99]/10 = 51.4% at full HP; MATK must play no part.
  const a = run(mk(99), 77, 10, t0()); // PR_TURNUNDEAD
  assert.equal(a.normal.avg_damage, 1413, "fail damage is the fixed formula, not MATK");
  assert.ok(Math.abs(a.success_chance - 51.4) < 1e-9, `success should be 51.4%, got ${a.success_chance}`);
  assert.equal(a.tu_attempt, 1);

  // Failed-cast iteration: 3 failed casts × 1413 off 10,000 HP leaves 5,761 (57.61%),
  // so the remaining-HP term adds (1−0.5761)×200/10 = 8.478 points → 59.878%.
  const t1 = t0(); t1.max_hp = 10000; t1.hp = 10000; t1.tu_failed_casts = 3;
  const b = run(mk(99), 77, 10, t1);
  assert.equal(b.tu_hp_now, 5761, "HP after N fails = max HP − N × fail damage");
  assert.equal(b.tu_attempt, 4);
  assert.ok(Math.abs(b.success_chance - 59.878) < 1e-9, `iterated success should be 59.878%, got ${b.success_chance}`);

  // Base INT below 40 halves the chance — the gate reads BASE INT (30), not the
  // job-bonused status INT (35): [200 + 111 + 35 + 99]/10 ÷ 2 = 22.25%.
  const c = run(mk(30), 77, 10, t0());
  assert.ok(Math.abs(c.success_chance - 22.25) < 1e-9, `low base INT should halve to 22.25%, got ${c.success_chance}`);

  // Boss monsters cannot be instantly killed; only the fail damage lands.
  const t2 = t0(); t2.is_boss = true;
  const d = run(mk(99), 77, 10, t2);
  assert.equal(d.success_chance, 0, "Boss: instant-kill chance must be 0");
  assert.equal(d.normal.avg_damage, 1413, "Boss: the fail damage still lands in full");

  // Offensive Resurrection is Turn Undead at the cast level (wiki Resurrection:
  // "same effect (and chance and cast delay) as Turn Undead") — identical numbers.
  const res = run(mk(99), 54, 4, t0()); // ALL_RESURRECTION Lv4
  const tu4 = run(mk(99), 77, 4, t0());
  assert.equal(res.success_chance, tu4.success_chance, "Res lv4 chance = TU lv4 chance (39.4%)");
  assert.equal(res.normal.avg_damage, tu4.normal.avg_damage, "Res lv4 fail damage = TU lv4 fail damage");
  assert.ok(Math.abs(res.success_chance - 39.4) < 1e-9);
});

// ---------------------------------------------------------------------------
// Killing Stroke: Mirror Image bonus, and no fabricated repeat rate
// ---------------------------------------------------------------------------
test("Killing Stroke takes the Mirror Image bonus and reports no DPS", () => {
  const cfg = createBattleConfig();
  const ks = loader.getSkillByName("NJ_ISSEN");
  const target = loader.getMonster(1002);
  const run = (active_buffs) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 25, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 60, vit: 50, int: 20, dex: 60, luk: 20 },
      equipped: { right_hand: 1201 }, active_buffs,
    });
    const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
    return new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: ks.id, level: 5 }), target, eff, gb);
  };

  // Every timing array for NJ_ISSEN is zero in the skill DB, so cast+delay came to
  // 0 and the shared max(...,100) floor advertised ten casts a second. The skill
  // drops you to 1 HP and cancels the Ninja Aura it requires — there is no rate.
  const plain = run({});
  assert.equal(plain.dps_valid, false, "no repeat rate to quote");
  assert.equal(plain.dps, null);
  assert.equal(plain.period_ms, 0, "must not fall back to the 100 ms floor");

  // Ninja Aura is +2 STR/level on PS and STR is multiplied by 40 in the base term,
  // so Lv5 is worth exactly 10 * 40 damage before any multiplier.
  const aura = run({ SC_NJ_NEN: 5 });
  assert.equal(aura.normal.avg_damage - plain.normal.avg_damage, 400, "Aura Lv5 = +10 STR = +400");

  // (5 + 5*ImagesLeft)% — 10% at one image, 30% at five. Applied last, floored.
  const base = aura.normal.avg_damage;
  for (const [images, pct] of [[1, 10], [3, 20], [5, 30]]) {
    const r = run({ SC_NJ_NEN: 5, SC_NJ_BUNSINJYUTSU: images });
    assert.equal(r.normal.avg_damage, Math.floor((base * (100 + pct)) / 100), `${images} image(s) = +${pct}%`);
    assert.ok(r.normal.steps.some((st) => st.name === `Mirror Image (+${pct}%)`), "the bonus is its own step");
  }
  // Clamped at five images: the skill grants at most ceil(10/2) = 5.
  assert.equal(run({ SC_NJ_NEN: 5, SC_NJ_BUNSINJYUTSU: 9 }).normal.avg_damage,
               run({ SC_NJ_NEN: 5, SC_NJ_BUNSINJYUTSU: 5 }).normal.avg_damage, "capped at 5 images");
  assert.ok(!plain.normal.steps.some((st) => /Mirror Image/.test(st.name)), "no step when the buff is off");
});

// ---------------------------------------------------------------------------
// ASPD granularity — the premise behind the /breakpoints ASPD rows
// ---------------------------------------------------------------------------
test("ASPD steps in 0.1, and each step is a real 2 ms of attack delay", () => {
  const cfg = createBattleConfig();
  const aspdAt = (agi) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 12, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi, vit: 30, int: 20, dex: 60, luk: 20 },
      equipped: { right_hand: 1201 },
    });
    return Number(resolvePlayerState(b, cfg, PS)[3].aspd);
  };

  // statusCalculator derives aspd = (2000 - amotion) / 10 from an INTEGER amotion,
  // so every reachable ASPD is an exact multiple of 0.1 — never 172.35.
  for (let agi = 1; agi <= 99; agi += 7) {
    const a = aspdAt(agi);
    assert.equal(Math.round(a * 10), a * 10, `ASPD ${a} at AGI ${agi} is not a clean 0.1 step`);
  }

  // The breakpoints route used to report only whole-number crossings, which hid
  // every sub-integer gain. Prove those gains exist: somewhere in this range one
  // point of AGI raises ASPD WITHOUT reaching the next integer. If this ever stops
  // being true, showing decimal steps would be pointless.
  let subInteger = 0;
  for (let agi = 1; agi < 99; agi++) {
    const lo = aspdAt(agi), hi = aspdAt(agi + 1);
    if (hi > lo && Math.floor(hi) === Math.floor(lo)) subInteger++;
  }
  assert.ok(subInteger > 0, "expected AGI steps that gain ASPD without crossing an integer");

  // And those gains are real, not cosmetic: the attack-delay formula in
  // routes/calculate.ts is 2 * max(100, round(2000 - aspd*10)), so 0.1 ASPD is 2 ms.
  const delay = (a) => 2 * Math.max(100, Math.round(2000 - a * 10));
  assert.equal(delay(170.7) - delay(170.8), 2, "0.1 ASPD must be worth 2 ms");
  assert.equal(delay(170.7) - delay(171.7), 20, "1.0 ASPD must be worth 20 ms");
});

// ---------------------------------------------------------------------------
// Sources that disagree — the ratios the 2026-08-22 audit pinned down
// ---------------------------------------------------------------------------
test("audited skill ratios follow the rework PDFs, not the stale wiki", () => {
  const r = PS.weapon_ratios;
  // Tracking: Gunslinger PDF "Increased damage to 160 × Skill Lvl, so 1600% at Skill Lvl 10".
  // The wiki TABLE says 260…1700 (i.e. 100+160×lv) but contradicts its own prose and
  // mis-steps at Lv4, so it loses. This was the one live ratio bug the audit found.
  assert.equal(r.GS_TRACKING(1), 160);
  assert.equal(r.GS_TRACKING(10), 1600, "PDF states 1600% at Lv10, not 1700%");

  // The rest of this test applies one rule: "a rework PDF beats the wiki". That rule
  // produced a WRONG answer for Back Stab and shipped it to players.
  //
  // The 2026-08-22 audit saw the conflict — the note here used to read "(wiki says
  // 600)" — and pinned 500 anyway on the strength of the PDF. But the PDF states an
  // INTENT ("the damage is reduced ... to 200%+30%*Skill_Level"); the wiki's per-level
  // table and the scraped skill DB describe what actually SHIPPED, and both said 600.
  // Players reported 600 in-game. Writing the conflict down is not the same as
  // resolving it, and a test can pin a wrong number just as firmly as a right one.
  //
  // Corrected rule: where a rework PDF disagrees with a full per-level wiki table AND
  // the scraped live skill DB agrees with that table, the table wins — it is evidence
  // of what shipped, not of what was planned.
  assert.equal(r.RG_BACKSTAP(10), 600, "wiki table + live skill DB + in-game all say 600%");

  // UNVERIFIED — these three were decided by the same rule that failed above, and for
  // AM_ACIDTERROR the evidence now points the other way: the wiki table AND ps_skill_db
  // both say 500 at Lv5, exactly the pattern that turned out to be right for Back Stab.
  // They are left as-is deliberately: changing a ratio on inference is what caused this
  // bug, and none of the three has been confirmed against the live server yet. Confirm
  // in-game before touching them — see ROADMAP "Ratios pinned on PDF authority alone".
  assert.equal(r.KN_SPEARSTAB(5), 300, "Knight PDF: 100+40*SkillLevel (wiki still says 100+20)");
  assert.equal(r.AM_ACIDTERROR(5), 600, "Alchemist PDF: (100+100*SkillLv)% — wiki AND ps_skill_db say 500; UNCONFIRMED");
  assert.equal(r.KN_BOWLINGBASH(10), 400, "wiki table 100+30*lv; ps_skill_db is stale at 100+40*lv");
});

test("items audited against the live PS item API", () => {
  const profile = getProfile("payon_stories");
  loader.setProfile(profile);
  const script = (id) => String(loader.getItem(id).script || "");

  // SCOUT Card: the Monk rework REMOVED the -10% Throw Spirit Sphere cast time.
  // We were still granting it, which inflated TSS Monk DPS.
  assert.ok(/bonus\s+bStr\s*,\s*1/.test(script(90001)), "SCOUT keeps its +1 STR");
  assert.ok(!/bCastrate/.test(script(90001)), "the removed cast-time bonus must be gone");

  // Purple Cowboy Hat had NO script at all, so "Atk +15, Flee -5" did nothing.
  assert.ok(/bBaseAtk\s*,\s*15/.test(script(5816)) && /bFlee\s*,\s*-5/.test(script(5816)));

  // Witch's Pumpkin Hat carried a vanilla script for an id PS repurposed (MDEF 10 vs 4).
  assert.ok(/bMdef\s*,\s*4/.test(script(18656)), "MDEF is 4 per the item API, not 10");
  assert.ok(!/bStr|bInt/.test(script(18656)), "STR/INT are not in the PS description");

  // 2026-09-06 tooltip audit (scripts checked against each item's own served
  // description, then the live API): four scripts said less than their tooltips.
  // Puck Card's Holy resist was missing entirely.
  assert.ok(/bSubEle\s*,\s*Ele_Holy\s*,\s*15/.test(script(8240)), "Puck: 15% less from Holy");
  assert.ok(/bSubRace\s*,\s*RC_Brute\s*,\s*25/.test(script(8240)), "Puck: 25% less from Brute");
  // Living Magma's 25% Fire vulnerability was missing — incoming damage is modeled here.
  assert.ok(/bSubEle\s*,\s*Ele_Fire\s*,\s*-25/.test(script(90006)), "Living Magma: receive 25% MORE from Fire");
  // Rudolf Santa Hat still ran the vanilla script (LUK +1) instead of PS's MDEF ladder.
  assert.ok(/bMdef\s*,\s*2/.test(script(5742)) && !/bLuk/.test(script(5742)), "Rudolf: MDEF 2 + refine steps, no vanilla LUK");
  // Grove Card was still the vanilla Grape Juice drop bonus; PS made it SP recovery.
  assert.ok(!/bAddMonsterDropItem/.test(script(4377)), "Grove: pre-rework drop script must be gone");
});

// Tooltips serve the PS item API's own text, not the vanilla client's. The scrape
// (ps_item_db.json) sits between the vanilla descriptions and the hand-curated
// layers: a player was shown "Matk +25%" (vanilla) for Hypnotist's Staff while both
// the server and our script apply 18% — the correct text was on disk, unread.
// Hand-curated descriptions still win: Pill Bug Card's manual text (10%, refreshed
// after the Merchant rework) must beat the scrape's stale pre-rework 8%.
test("item tooltips prefer the PS scrape over vanilla text, and the manual layer over both", () => {
  loader.setProfile(getProfile("payon_stories"));
  const hypno = loader.getItemDescription(1621);
  assert.ok(hypno && /Matk \+18%/.test(hypno.description), "Hypnotist's Staff tooltip must state the 18% actually applied");
  assert.ok(!/25%/.test(hypno.description), "the vanilla 25% text must not survive");
  assert.ok(!/Unknown Item/.test(hypno.description), "no 'Unknown Item' identify preamble");
  const pill = loader.getItemDescription(90014);
  assert.ok(pill && /by <font color='#008800'>Cart Revolution<\/font> by 10%/.test(pill.description.replace(/<br\/>/g, " ")) || /10%/.test(pill.description),
    "Pill Bug keeps the manual layer's post-rework 10% text");
  assert.ok(!/by 8%/.test(pill.description), "the scrape's stale 8% must not win over the manual layer");
});

// ---------------------------------------------------------------------------
// Multi-hit magic: the hit COUNT is where these two used to go wrong
// ---------------------------------------------------------------------------
test("Meteor Storm counts meteors as well as hits per meteor", () => {
  // skills.json number_of_hits is only the hits-per-meteor column; the meteor
  // count scales too, and ignoring it priced Lv10 at 5 hits instead of 35.
  const f = PS.magic_hit_counts.WZ_METEOR;
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(f), [2, 3, 6, 8, 12, 15, 20, 24, 30, 35],
    "meteors x hits/meteor per the wiki table");
});

test("Lord of Vermilion lands as four escalating waves, each taking MDEF", () => {
  const cfg = createBattleConfig();
  const ratio = PS.magic_ratios.WZ_VERMILION;
  const wave = (lv, w) => ratio(lv, null, { skill_params: { lov_wave: w } });
  // (20 x lv x waveNumber)% — 200/400/600/800 at Lv10, summing to the wiki total.
  assert.deepEqual([1, 2, 3, 4].map((w) => wave(10, w)), [200, 400, 600, 800]);
  assert.equal([1, 2, 3, 4].reduce((a, w) => a + wave(10, w), 0), 2000);
  // Any path that misses the wave branch must still price the whole spell, not a quarter.
  assert.equal(ratio(10, null, { skill_params: {} }), 2000, "no-wave fallback is the full total");

  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 9, base_level: 99, job_level: 50,
    base_stats: { str: 1, agi: 1, vit: 1, int: 99, dex: 80, luk: 1 },
    equipped: { right_hand: 1601 },
  });
  const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
  const id = loader.getSkillByName("WZ_VERMILION").id;
  const hit = (softMdefInt) => new BattlePipeline(cfg).calculate(
    st, w, createSkillInstance({ id, level: 10 }),
    createTarget({ element: 0, element_level: 1, race: "RC_Formless", size: "Size_Medium",
                   def_: 0, def2: 0, mdef_: 0, int_: softMdefInt, vit: 0, level: 80, hp: 999999 }),
    eff, gb).normal.avg_damage;

  // Soft MDEF is a flat per-hit subtraction, so four waves must cost 4x it — this
  // is the whole point of the change. One lump would only lose 90.
  assert.equal(hit(0) - hit(90), 4 * 90, "soft MDEF is subtracted once per wave");
});

// ---------------------------------------------------------------------------
// Gunslinger coins are spirit balls (Hercules shares the counter)
// ---------------------------------------------------------------------------
test("held coins add +3 ATK each, multiplied by the skill's hit count", () => {
  const cfg = createBattleConfig();
  const target = loader.getMonster(1002);
  const dmg = (coins, skillName, lv) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 24, base_level: 99, job_level: 50,
      base_stats: { str: 80, agi: 90, vit: 1, int: 1, dex: 80, luk: 1 },
      equipped: { right_hand: 13100 }, flags: { gs_coins: coins },
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    const sd = skillName ? loader.getSkillByName(skillName) : null;
    return new BattlePipeline(cfg).calculate(
      st, w, createSkillInstance({ id: sd ? sd.id : 0, level: lv || 1 }), target, eff, gb).normal;
  };

  // battle.c: ATK_ADD(wd.div_ * sd->spiritball * 3), and skill.c's GS_GLITTERING
  // caps addspiritball at 10 — coins are the same counter Monk spheres use, so this
  // was never Monk-only. A single-hit attack gains exactly 3 per coin.
  assert.equal(dmg(10, null).avg_damage - dmg(0, null).avg_damage, 30, "10 coins = +30 on one hit");
  assert.ok(dmg(10, null).steps.some((s) => s.name === "Coin Bonus"), "shown as its own step");
  assert.ok(!dmg(0, null).steps.some((s) => s.name === "Coin Bonus"), "no step with no coins");

  // ...and it scales with div, so a 3-hit skill gets it three times.
  const ta3 = dmg(10, "GS_TRIPLEACTION", 1).avg_damage - dmg(0, "GS_TRIPLEACTION", 1).avg_damage;
  assert.equal(ta3, 90, "Triple Action is 3 hits → +30 x 3");

  // Coins are capped at 10 (skill.c GS_GLITTERING), so 15 is worth no more than 10.
  assert.equal(dmg(15, null).avg_damage, dmg(10, null).avg_damage, "capped at 10 coins");

  // A Monk's spheres must be unaffected by any of this.
  const monk = (spheres) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 15, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 60, vit: 40, int: 1, dex: 60, luk: 1 },
      equipped: { right_hand: 1801 }, flags: { spirit_spheres: spheres },
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    return new BattlePipeline(cfg).calculate(
      st, w, createSkillInstance({ id: 0, level: 1 }), target, eff, gb).normal.avg_damage;
  };
  assert.equal(monk(5) - monk(0), 15, "Monk spheres still +3 each");
});

// ---------------------------------------------------------------------------
// Gunslinger ammo: element rides the SCRIPT, not the `element` field
// ---------------------------------------------------------------------------
test("elemental ammo applies its element, and Destroyer has its 3-slot version", () => {
  const cfg = createBattleConfig();
  const ELE_GHOST = 8;

  // Destroyer [3] (13160) is slots=3 on PS but 0 in the vanilla item_db, so the
  // slotted version was missing from the picker entirely while [1] was present.
  assert.equal(loader.getItem(13160).slots, 3, "Destroyer [3]");
  assert.equal(loader.getItem(13161).slots, 1, "Destroyer [1] unchanged");

  // resolveWeapon takes the element from gearBonuses.script_atk_ele_rh, which comes
  // from the ammo's `bonus bAtkEle` — an `element` field on its own does nothing.
  // Ghosthunter Grenade carried element:8 with an empty script, so Ghost never landed.
  const elementWith = (ammo) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 24, base_level: 99, job_level: 50,
      base_stats: { str: 80, agi: 90, vit: 1, int: 1, dex: 80, luk: 1 },
      equipped: { right_hand: 13160, ammo },
    });
    return resolvePlayerState(b, cfg, PS)[2].element;
  };
  assert.equal(elementWith(91125), ELE_GHOST, "Ghosthunter Grenade is Ghost");
  assert.equal(elementWith(13203), 3, "Flare Sphere still Fire");
  assert.equal(elementWith(13207), 1, "Freezing Sphere still Water");
  assert.ok(/bAtkEle/.test(String(loader.getItem(91125).script)), "the element must be scripted");

  // Every ammo whose data claims a non-Neutral element must actually script it —
  // this is the class of bug, not just the one item.
  const unscripted = (loader.getItemsByType("IT_AMMO") || []).filter(
    (it) => it.element != null && it.element !== 0 && !/bAtkEle/.test(String(it.script || "")));
  assert.deepEqual(unscripted.map((it) => `${it.id} ${it.name}`), [],
    "ammo with an element field but no bAtkEle would silently hit as Neutral");
});

// ---------------------------------------------------------------------------
// isweapontype() — a ps_item_manual-layer predicate, and the ammo that needs it
// ---------------------------------------------------------------------------
test("Armor Piercing Bullet's crit bonus is bigger out of a Rifle", () => {
  const cfg = createBattleConfig();
  const crit = (rh, ammo) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 24, base_level: 99, job_level: 50,
      base_stats: { str: 80, agi: 90, vit: 1, int: 1, dex: 80, luk: 1 },
      equipped: ammo ? { right_hand: rh, ammo } : { right_hand: rh },
    });
    return resolvePlayerState(b, cfg, PS)[3].cri;
  };
  const ammoCri = (rh, ammo) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 24, base_level: 99, job_level: 50,
      base_stats: { str: 80, agi: 90, vit: 1, int: 1, dex: 80, luk: 1 },
      equipped: { right_hand: rh, ammo },
    });
    return (resolvePlayerState(b, cfg, PS)[0].from_ammo.cri || 0) * 10;
  };
  // Wiki Gunslinger#Bullets: "+10 Crit, +20 Crit with Rifle", footnoted as "Both
  // bonuses count for Rifle, making it +30 Crit". `cri` is per-mille, so x10.
  //
  // The bullet's crit is NOT in `status.cri` — an ammo script's bonuses live in the
  // arrow_* pool and are added at attack time (`if (flag.arrow) cri += arrow_cri`,
  // battle.c:5172), which is also why the client's status window does not show them.
  // So the weapon-conditional is measured on the pool, and the end-to-end assertion
  // below proves it still reaches an attack that actually fires the bullet.
  assert.equal(crit(13150, 13233), crit(13150, null), "status crit must not carry the bullet's");
  assert.equal(ammoCri(13150, 13233), 300, "Rifle gets +30 crit");
  assert.equal(ammoCri(13100, 13233), 100, "Revolver gets only +10");
  assert.equal(ammoCri(13160, 13233), 100, "Grenade Launcher likewise");

  // End to end: a Rifle auto-attack fires the bullet, so its crit rate does rise 30%.
  const critChance = (ammo) => runScenario({
    build: {
      job_id: 24, base_level: 99, job_level: 50,
      base_stats: { str: 80, agi: 90, vit: 1, int: 1, dex: 80, luk: 1 },
      equipped: ammo ? { right_hand: 13150, ammo } : { right_hand: 13150 },
    },
    target: 1002,
  }).result.crit_chance;
  assert.equal(Math.round((critChance(13233) - critChance(null)) * 10) / 10, 30,
    "the Rifle's own attack fires the bullet, so it gets the crit");
});

// ---------------------------------------------------------------------------
// The arrow gate: what an attack that fires no ammo must NOT get. Hercules hangs
// all of it on one flag, `flag.arrow` (= sd->state.arrow_atk), set for a skill from
// the skill's own AmmoTypes requirement. A CC stated the rule for PS in as many
// words: "skill that don't use ammo (except Phantasm arrow for some reason) don't
// get the ranged scaling" (PS_SOURCES.md §4). Soul Bullet is the case that surfaced
// it — "Fires 3 magic shot that does not use any bullets".
// ---------------------------------------------------------------------------
const GUNSLINGER_ATK = (skill, ammo) => ({
  build: {
    job_id: 24, base_level: 90, job_level: 50,
    base_stats: { str: 40, agi: 60, vit: 30, int: 20, dex: 90, luk: 20 },
    equipped: { right_hand: 13155, ...(ammo ? { ammo } : {}) }, // Shotgun, ATK 180
  },
  target: { name: "T", race: "Demi-Human", element: "Ele_Neutral", element_level: 1, size: "Medium",
            def_: 10, def2: 10, mdef_: 5, mdef2: 5, hp: 100000, agi: 30, level: 90 },
  skill,
});

test("the ranged min-ATK scaling needs an ammo-FIRING attack, not merely a gun", () => {
  const atkRange = (skill) => {
    const raw = runScenarioRaw(GUNSLINGER_ATK(skill)).raw;
    const note = (raw.normal || raw.skill).steps.find((x) => x.name === "Weapon ATK Range").note;
    const [, mn, mx] = note.match(/atkmin=(\d+) atkmax=(\d+)/).map(Number);
    return [mn, mx];
  };
  // Triple Action consumes a bullet, so `atkmin = atkmin*atkmax/100` applies and
  // overshoots atkmax, which then clamps up to it — a flat, maximal roll.
  const [taMin, taMax] = atkRange({ name: "GS_TRIPLEACTION", level: 1 });
  assert.equal(taMin, taMax, "an ammo-firing gun skill keeps the scaling (and clamps flat)");
  assert.equal(taMin, 252, "= floor(140 * 180 / 100)");
  // Soul Bullet fires nothing, so it keeps the plain DEX-derived floor and a real range.
  const [sbMin, sbMax] = atkRange({ name: "GS_MAGICALBULLET", level: 1 });
  assert.equal(sbMax, 180, "unscaled: the weapon's own ATK");
  assert.equal(sbMin, 140, "unscaled: floor(DEX 90 * (80 + wlv 3*20) / 100), capped at atkmax");
  assert.ok(sbMin < sbMax, "and it stays a range rather than collapsing to a flat max");
});

test("Phantasmic Arrow is the exception: no ammo required, still an arrow attack", () => {
  // battle.c:4908 hard-codes `case HT_PHANTASMIC: flag.arrow = 1;` — "Since these do
  // not consume ammo, they need to be explicitly set as arrow attacks." That single
  // exception is what makes the CC's rule of thumb read as odd, and it is why the gate
  // is skillUsesAmmo() rather than a bare requirement lookup.
  assert.equal(skillUsesAmmo({ id: 1009, name: "HT_PHANTASMIC" }, false), true);
  assert.equal(skillUsesAmmo({ id: 507, name: "GS_MAGICALBULLET" }, true), false,
    "Soul Bullet requires no ammo, so it is not an arrow attack even out of a gun");
  assert.equal(skillUsesAmmo({ id: 502, name: "GS_TRIPLEACTION" }, false), true,
    "Triple Action's requirement lists ammo, so it is one even if the weapon says otherwise");
});

test("an ammo's own +% bonuses reach only the attacks that fire it", () => {
  const dmg = (skill, ammo) => {
    const raw = runScenarioRaw(GUNSLINGER_ATK(skill, ammo)).raw;
    return (raw.normal || raw.skill).avg_damage;
  };
  // Hollow-Point Bullet: bonus2 bAddRace,RC_DemiHuman,20, vs a Demi-Human target.
  const HOLLOW_POINT = 13234;
  assert.equal(dmg({ name: "GS_MAGICALBULLET", level: 1 }, HOLLOW_POINT),
               dmg({ name: "GS_MAGICALBULLET", level: 1 }, null),
               "Soul Bullet fires no bullet, so the bullet's +20% must not reach it");
  assert.ok(dmg({ name: "GS_TRIPLEACTION", level: 1 }, HOLLOW_POINT)
            > dmg({ name: "GS_TRIPLEACTION", level: 1 }, null) * 1.2,
            "Triple Action does fire it, so it takes both the +20% and the bullet's ATK");
});

// ---------------------------------------------------------------------------
// Back Stab's after-cast delay. Vanilla Hercules gives RG_BACKSTAP a 500ms
// after-cast delay; PS removes it ("The cooldown, and aftercast delay is removed",
// Rogue rework PDF; "Cast Delay: aspd" on the wiki, the same wording Double
// Strafing carries; and players confirmed no delay in-game). Left in, it pinned a
// fast Rogue at exactly 2.00 casts/s however much ASPD they stacked.
// ---------------------------------------------------------------------------
test("Back Stab is ASPD-limited on PS, with no 500ms after-cast floor", () => {
  const period = (agi, skill) => runScenarioRaw({
    build: {
      job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 70, agi, vit: 30, int: 10, dex: 70, luk: 20 },
      equipped: { right_hand: 1224 },
    },
    target: { name: "T", race: "Brute", element: "Ele_Neutral", element_level: 1, size: "Medium",
              def_: 20, def2: 20, mdef_: 5, mdef2: 5, hp: 50000, agi: 30, level: 90 },
    skill,
  }).raw.period_ms;
  const BACKSTAB = { name: "RG_BACKSTAP", level: 10 };
  for (const agi of [90, 150]) {
    assert.equal(period(agi, BACKSTAB), period(agi, null),
      `AGI ${agi}: Back Stab must repeat at the attack motion, like an auto-attack`);
  }
  assert.ok(period(150, BACKSTAB) < 500,
    "and above 2 attacks/s it must keep scaling, not stop at the vanilla 500ms delay");
});

// ---------------------------------------------------------------------------
// Frostfire weapons are refinable. Reported by a player who had refined one in
// game; the live PS item API agrees (`refine: true` on all 14, checked
// 2026-08-29). They were hand-authored as non-refineable, which hid the refine
// input in the editor entirely — a +9 weapon could not be entered at all — and
// suppressed the overrefine roll on the engine side.
// ---------------------------------------------------------------------------
test("Frostfire weapons are refinable, and their overrefine is not suppressed", () => {
  const FROSTFIRE = [8341, 8342, 8343, 8344, 8345, 8346, 8347, 8348, 8349, 8350, 8351, 8352, 8353, 8394];
  for (const id of FROSTFIRE) {
    const item = loader.getItem(id);
    assert.ok(item, `Frostfire item ${id} missing from the DB`);
    assert.equal(item.refineable, true, `${item.name} (${id}) must be refinable`);
  }
  // Luck o' Pint, found by the same sweep of every manual entry flagged non-refineable.
  assert.equal(loader.getItem(80066).refineable, true, "Luck o' Pint must be refinable");
  // Genuinely non-refinable neighbours, so the sweep did not just flip everything.
  assert.equal(loader.getItem(8065).refineable, false, "Momoe's Hairband is not refinable");
  assert.equal(loader.getItem(13236).refineable, false, "Frostfire Bullet is ammo, not refinable");

  // End to end: refine has to reach the damage, overrefine step included.
  const run = (refine) => runScenarioRaw({
    build: {
      job_id: 7, base_level: 90, job_level: 50,
      base_stats: { str: 80, agi: 60, vit: 40, int: 10, dex: 60, luk: 20 },
      equipped: { right_hand: 8342 }, refine: { right_hand: refine },
    },
    target: { name: "T", race: "Brute", element: "Ele_Neutral", element_level: 1, size: "Medium",
              def_: 20, def2: 20, mdef_: 5, mdef2: 5, hp: 100000, agi: 30, level: 90 },
  }).raw.normal;
  const plain = run(0), refined = run(10);
  assert.ok(refined.avg_damage > plain.avg_damage * 1.3,
    "a +10 Lv4 weapon must be worth well over 30% more than an unrefined one");
  const step = refined.steps.find((x) => x.name === "Overrefine Bonus");
  assert.ok(step && !/Suppressed/.test(step.note || ""),
    "overrefine must no longer be suppressed for a Frostfire weapon");
});

// ---------------------------------------------------------------------------
// Two corrections from a CC (PS_SOURCES.md §4), both about what an equipped
// arrow does to a MELEE skill cast with a bow — the bow Rogue case:
//   "they do ignore arrow atk but not their element"
//   "BB and Triple Attack are strictly melee skills and so Long Range mods
//    have no effect on their damage"
// ---------------------------------------------------------------------------
const BOWGUE = (skill, extra) => ({
  build: {
    job_id: 17, base_level: 99, job_level: 50,
    base_stats: { str: 70, agi: 80, vit: 30, int: 20, dex: 90, luk: 20 },
    equipped: { right_hand: 1718, ...(extra || {}) }, plagiarized_skill: "KN_BOWLINGBASH",
  },
  target: { name: "T", race: "Brute", element: "Ele_Neutral", element_level: 1, size: "Medium",
            def_: 20, def2: 20, mdef_: 5, mdef2: 5, hp: 500000, agi: 30, level: 90 },
  skill,
});
const bowgueStep = (skill, extra, stepRe) => {
  const raw = runScenarioRaw(BOWGUE(skill, extra)).raw;
  const br = raw.normal || raw.skill;
  return br.steps.find((x) => stepRe.test(x.name));
};

test("a melee skill stays melee in a bow user's hands — negative range is |range|", () => {
  const BB = { name: "KN_BOWLINGBASH", level: 10 };
  // Bowling Bash is range -2 in the skill DB. Hercules reads that as 2 cells, NOT as the
  // wielder's 9-cell bow, because `skillrange_from_weapon` defaults to nobody (skill.c:1105,
  // battle.c:7729). PS documents it as "3 Cells" — short either way.
  assert.match(bowgueStep(BB, {}, /Final Rate Bonus \((Short|Long)\)/).name, /\(Short\)/,
    "Bowling Bash out of a bow must be classified melee");
  // ...so Archer Skeleton Card (bLongAtkRate 10) must do nothing to it.
  const plain = runScenarioRaw(BOWGUE(BB, {})).raw.normal.avg_damage;
  const carded = runScenarioRaw(BOWGUE(BB, { right_hand_card1: 4094 })).raw.normal.avg_damage;
  assert.equal(carded, plain, "long-range damage gear must not touch a melee skill");
  // The same card must still work on the bow's own attacks, or the gate is too wide.
  const autoPlain = runScenarioRaw(BOWGUE(null, {})).raw.normal.avg_damage;
  const autoCarded = runScenarioRaw(BOWGUE(null, { right_hand_card1: 4094 })).raw.normal.avg_damage;
  assert.ok(autoCarded > autoPlain, "a bow's own attack is long-range and keeps the card");
});

test("an arrow lends its ELEMENT to a bow user's melee skill, but not its ATK", () => {
  const BB = { name: "KN_BOWLINGBASH", level: 10 };
  const FIRE_ARROW = 1752;
  assert.match(bowgueStep(BB, { ammo: FIRE_ARROW }, /^Attr Fix$/).note, /^Fire /,
    "Bowling Bash must take the Fire Arrow's element");
  // ...while the arrow's ATK stays out, since Bowling Bash consumes no ammo.
  const withArrow = runScenarioRaw(BOWGUE(BB, { ammo: FIRE_ARROW })).raw.normal.avg_damage;
  const without = runScenarioRaw(BOWGUE(BB, {})).raw.normal.avg_damage;
  assert.equal(withArrow, without, "the arrow's ATK must not reach a skill that fires none");
  assert.equal(bowgueStep(BB, { ammo: FIRE_ARROW }, /Arrow ATK/), undefined,
    "and there must be no Arrow ATK step at all");
  // The counter-case, confirmed in-game earlier: nothing bare-handed fires a Kunai, so a
  // punch must not borrow its element.
  const punch = runScenarioRaw({
    build: {
      job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 70, agi: 80, vit: 30, int: 20, dex: 90, luk: 20 },
      equipped: { ammo: 13255 },
    },
    target: BOWGUE(null, {}).target,
  }).raw.normal;
  assert.ok(!/Fire|Water|Wind|Earth/.test(punch.steps.find((x) => x.name === "Attr Fix").note),
    "a bare-handed punch must not take an equipped Kunai's element");
});

test("Super Novice is offered Tool Mastery, and it reaches the damage", () => {
  // wiki.payonstories.com/Tool_Mastery categorises it under BOTH Merchant and Super Novice.
  // Its job list was the Merchant line only, so a Super Novice could not tick it — the same
  // shape of miss as Crazy Uproar, and for the same reason: PS grants Super Novice more than
  // the vanilla skill tree we scrape says it has.
  const offered = (job) => (loader.getPassiveSkillsForJob(job) || [])
    .some((sk) => (sk.name || sk.mastery_key) === "PS_MC_TOOLMASTERY");
  assert.ok(offered(23), "Super Novice must be offered Tool Mastery");
  assert.ok(offered(5), "and the Merchant line keeps it");
  assert.ok(!offered(11), "while a Hunter does not get it");

  // It is the Merchant line's flat-ATK mastery for Axes AND Maces, so both must gain +40 at Lv10.
  const dmg = (weapon, lv) => runScenarioRaw({
    build: {
      job_id: 23, base_level: 99, job_level: 10,
      base_stats: { str: 80, agi: 40, vit: 40, int: 20, dex: 60, luk: 20 },
      equipped: { right_hand: weapon }, mastery_levels: lv ? { PS_MC_TOOLMASTERY: lv } : {},
    },
    target: { name: "T", race: "Brute", element: "Ele_Neutral", element_level: 1, size: "Medium",
              def_: 20, def2: 20, mdef_: 5, mdef2: 5, hp: 100000, agi: 30, level: 90 },
  }).raw.normal.avg_damage;
  for (const [label, id] of [["axe", 1305], ["mace", 1504]]) {
    assert.equal(dmg(id, 10) - dmg(id, 0), 40, `Tool Mastery Lv10 must add +40 ATK with an ${label}`);
  }
});

test("Safety Ring gives DEF as well as MDEF", () => {
  // PS zeroed the item's structured DEF (its tooltip reads "Defense: 0") but its description
  // still lists "Def +3" and "Mdef +3", so the DEF has to come from the script. Only the MDEF
  // half was modelled, and a player noticed the ring adding no DEF.
  const stat = (acc) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 7, base_level: 90, job_level: 50,
      base_stats: { str: 60, agi: 40, vit: 50, int: 20, dex: 40, luk: 20 },
      equipped: acc ? { accessory_left: acc } : {},
    });
    const [, , , st] = resolvePlayerState(b, createBattleConfig(), PS);
    return { def: st.def_, mdef: st.mdef };
  };
  const bare = stat(null), ring = stat(2615);
  assert.equal(ring.def - bare.def, 3, "Safety Ring must add 3 DEF");
  assert.equal(ring.mdef - bare.mdef, 3, "...and still add 3 MDEF");
});

// ---------------------------------------------------------------------------
// Monster self-buffs. A monster's kit already carries what it casts on itself,
// level and rate included; these turn the supported ones into target toggles so a
// player need not compute the stat change and enter a custom monster. Always-on
// when applied — see targetSelfBuffs.js.
// ---------------------------------------------------------------------------
test("monster self-buffs apply their Hercules effect to the target", () => {
  const { applyTargetSelfBuffs } = require("../src/engine/targetSelfBuffs");
  // The Scout (25015) is the case that prompted this: AC_CONCENTRATION Lv10, self, 20%.
  const scout = () => loader.getMonster(25015);
  const base = scout();
  assert.equal(base.flee, base.level + base.agi, "precondition: flee is level + AGI");

  // SC_CONCENTRATION: AGI and DEX +(2+lv)%, so flee and hit rise by the same amounts.
  const conc = scout();
  applyTargetSelfBuffs(conc, { AC_CONCENTRATION: 10 });
  const pct = 2 + 10;
  assert.equal(conc.agi - base.agi, Math.floor(base.agi * pct / 100));
  assert.equal(conc.flee - base.flee, Math.floor(base.agi * pct / 100), "flee follows AGI");
  assert.equal(conc.hit - base.hit, Math.floor(base.dex * pct / 100), "hit follows DEX");

  // SC_INC_AGI: a FLAT +(2+lv) AGI, not a percentage.
  const agi = scout();
  applyTargetSelfBuffs(agi, { AL_INCAGI: 10 });
  assert.equal(agi.agi - base.agi, 12);
  assert.equal(agi.flee - base.flee, 12);

  // SC_INCFLEERATE at val1 = 100 for every level: flee doubles, AGI untouched.
  const up = scout();
  applyTargetSelfBuffs(up, { NPC_AGIUP: 5 });
  assert.equal(up.flee, base.flee * 2);
  assert.equal(up.agi, base.agi, "a flee-rate buff must not move AGI");
});

test("a monster's self element-change swaps its element but not its element level", () => {
  const { applyTargetSelfBuffs } = require("../src/engine/targetSelfBuffs");
  // Bloody Knight (1268) is natively Dark and carries NPC_CHANGEFIRE.
  const before = loader.getMonster(1268);
  assert.equal(before.element, 7, "precondition: Dark");
  const after = loader.getMonster(1268);
  applyTargetSelfBuffs(after, { NPC_CHANGEFIRE: 1 });
  assert.equal(after.element, 3, "SC_ARMOR_PROPERTY sets def_ele to the skill's element");
  assert.equal(after.element_level, before.element_level, "element LEVEL is untouched");
});

test("self-buffs we can't price are listed, never silently applied", () => {
  const { applyTargetSelfBuffs, describeSelfBuff } = require("../src/engine/targetSelfBuffs");
  const before = loader.getMonster(25015);
  const after = loader.getMonster(25015);
  // Stone Skin is a real buff we decline to price, Emotion is not a buff at all.
  const applied = applyTargetSelfBuffs(after, { NPC_STONESKIN: 3, NPC_EMOTION: 1 });
  assert.deepEqual(applied, [], "neither may be applied");
  assert.deepEqual(
    { flee: after.flee, hit: after.hit, def: after.def_, ele: after.element },
    { flee: before.flee, hit: before.hit, def: before.def_, ele: before.element },
    "and the target must be untouched");

  // ...but the UI has to be able to SAY the buff exists, with the reason.
  const stone = describeSelfBuff("NPC_STONESKIN", 3);
  assert.equal(stone.modelled, false);
  assert.match(stone.reason, /not modelled yet/);
  assert.equal(describeSelfBuff("NPC_EMOTION", 1), null, "a non-buff is not listed at all");
  const conc = describeSelfBuff("AC_CONCENTRATION", 10);
  assert.equal(conc.modelled, true);
  assert.match(conc.effect, /AGI and DEX \+12%/);
});

test("self-buffs reach the INCOMING direction, but only the offensive half", () => {
  const { applySelfBuffsToRawMob } = require("../src/engine/targetSelfBuffs");
  // The incoming path works on the RAW mob record (stats nested), where the monster is
  // the attacker: its HIT is level + DEX, so Improve Concentration makes it land on you
  // more often. Its damage per hit is untouched — mob ATK comes from the mob DB.
  const raw = loader.getMonsterData(25015);
  const conc = applySelfBuffsToRawMob(raw, { AC_CONCENTRATION: 10 });
  assert.equal(conc.stats.dex, raw.stats.dex + Math.floor(raw.stats.dex * 12 / 100), "DEX rises");
  assert.equal(conc.stats.agi, raw.stats.agi + Math.floor(raw.stats.agi * 12 / 100), "AGI rises");
  assert.equal(conc.atk_min, raw.atk_min, "its ATK is unchanged");
  assert.equal(raw.stats.dex, 75, "and the caller's own record is not mutated");

  // A flee-rate buff and an element change are meaningless when the monster is the one
  // swinging (its melee is Neutral whatever its own property), so they must no-op here.
  for (const buff of [{ NPC_AGIUP: 5 }, { NPC_CHANGEFIRE: 1 }]) {
    const out = applySelfBuffsToRawMob(raw, buff);
    assert.deepEqual(out.stats, raw.stats, `${Object.keys(buff)[0]} must not change the monster's offence`);
    assert.equal(out.element, raw.element, "and must not change the record's element here");
  }
});

test("Auto Guard blocks a share of your weapon attacks, criticals included", () => {
  const { applyTargetSelfBuffs, describeSelfBuff } = require("../src/engine/targetSelfBuffs");
  // val2 accumulates 5,5,4,4,3,3,2,2,1,1 across levels (status.c:8326).
  for (const [lv, pct] of [[2, 10], [3, 14], [5, 21], [10, 30]]) {
    assert.match(describeSelfBuff("ML_AUTOGUARD", lv).effect, new RegExp(`blocks ${pct}%`), `Lv${lv}`);
  }
  // A block is not a miss: it must scale the WHOLE attack mix, criticals included, which
  // is why it cannot ride on the hit-chance term (criticals ignore flee and skip it).
  const dps = (guardLv) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 7, base_level: 90, job_level: 50,
      base_stats: { str: 80, agi: 60, vit: 40, int: 10, dex: 70, luk: 60 }, // LUK 60 => real crit share
      equipped: { right_hand: 1129 },
    });
    const [gb, eff, w, st] = resolvePlayerState(b, createBattleConfig(), PS);
    const target = loader.getMonster(1040); // Golem — carries ML_AUTOGUARD
    if (guardLv) applyTargetSelfBuffs(target, { ML_AUTOGUARD: guardLv });
    const r = new BattlePipeline(createBattleConfig())
      .calculate(st, w, createSkillInstance({ id: 0, level: 1 }), target, eff, gb);
    return { dps: r.dps, crit: r.crit_chance, hit: r.hit_chance, block: r.auto_guard_pct };
  };
  const plain = dps(0), guarded = dps(10);
  assert.ok(plain.crit > 5, "precondition: this build really does crit");
  assert.equal(guarded.block, 30);
  assert.equal(guarded.hit, plain.hit, "your accuracy is untouched — it is a block, not a miss");
  const ratio = guarded.dps / plain.dps;
  assert.ok(Math.abs(ratio - 0.70) < 0.005, `DPS must fall by exactly the block rate, got x${ratio.toFixed(3)}`);
});

test("Maximize Power, Power Up and Magnum Break change only the incoming direction", () => {
  const { applySelfBuffsToRawMob, applyTargetSelfBuffs, describeSelfBuff } = require("../src/engine/targetSelfBuffs");
  const raw = loader.getMonsterData(1040);

  // SC_MAXIMIZEPOWER: every weapon roll comes out maximum.
  const max = applySelfBuffsToRawMob(raw, { BS_MAXIMIZE: 5 });
  assert.equal(max.atk_min, raw.atk_max, "its ATK floor rises to its ceiling");

  // NPC_POWERUP starts SC_INCATKRATE at 200 and SC_INCHITRATE at 100 (skill.c:9164).
  const up = applySelfBuffsToRawMob(raw, { NPC_POWERUP: 5 });
  assert.equal(up.atk_min, raw.atk_min * 3, "ATK x3");
  assert.equal(up.atk_max, raw.atk_max * 3);
  assert.equal(up.hit, (raw.level + raw.stats.dex) * 2, "HIT x2");

  // SM_MAGNUM: 20% of the hit comes back as Fire (skill.c:7414, val1=3 val2=20).
  const mag = applySelfBuffsToRawMob(raw, { SM_MAGNUM: 10 });
  assert.deepEqual(mag.sub_weapon_property, { ele: 3, pct: 20 });

  // None of the three may touch the monster as a TARGET — they say nothing about how
  // hard it is to hit or how much your damage is resisted.
  for (const buff of [{ BS_MAXIMIZE: 5 }, { NPC_POWERUP: 5 }, { SM_MAGNUM: 10 }]) {
    const t = loader.getMonster(1040);
    const before = { flee: t.flee, hit: t.hit, def: t.def_, ele: t.element, guard: t.auto_guard_pct };
    applyTargetSelfBuffs(t, buff);
    assert.deepEqual({ flee: t.flee, hit: t.hit, def: t.def_, ele: t.element, guard: t.auto_guard_pct }, before,
      `${Object.keys(buff)[0]} must be incoming-only`);
    assert.equal(describeSelfBuff(Object.keys(buff)[0], 5).incoming_only, true, "and must be flagged as such");
  }
});

test("a monster's Magnum Break follows the PS rework: auto attacks only, and it dodges DEF", () => {
  const { applySelfBuffsToRawMob } = require("../src/engine/targetSelfBuffs");
  const { calculateIncomingPhysicalDamage } = require("../src/engine/calculators/incomingPipeline");
  const cfg = createBattleConfig();
  const MOB = 1086; // Golden Thief Bug — carries SM_MAGNUM
  const dmg = (armorCard, buffed, opts) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 7, base_level: 90, job_level: 50,
      base_stats: { str: 60, agi: 40, vit: 60, int: 10, dex: 40, luk: 10 },
      equipped: { right_hand: 1129, armor: 2314, ...(armorCard ? { armor_card1: armorCard } : {}) },
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    const raw = loader.getMonsterData(MOB);
    const mob = buffed ? applySelfBuffsToRawMob(raw, { SM_MAGNUM: 10 }) : raw;
    const r = calculateIncomingPhysicalDamage(MOB, eff, st, gb, w, cfg, { mob_override: mob, ...(opts || {}) });
    return { avg: r.avg_damage, step: r.steps.find((x) => x.name === "Magnum Break (lingering fire)") };
  };
  // On its auto attack the fire share lands...
  const plain = dmg(null, false), magnum = dmg(null, true);
  assert.ok(magnum.avg > plain.avg * 1.15, "20% of its base comes back as Fire");
  assert.match(magnum.step.note, /bypasses your DEF/);

  // ...and how much it gains depends on YOUR armour property: Fire vs Fire is resisted.
  const fireArmour = dmg(4099, true); // Pasana Card — armour becomes Fire
  const firePlain = dmg(4099, false);
  assert.ok(fireArmour.avg - firePlain.avg < (magnum.avg - plain.avg) / 2,
    "a Fire-armoured player takes far less of the Fire share");

  // PS 2026-08-09: "No longer affects skills, and only applies its semi-endow to auto
  // attacks" — so a mob-skill line and an elemental attack line must both be exempt.
  for (const opts of [{ ratio_override: 150 }, { ele_override: 3 }]) {
    const skillHit = dmg(null, true, opts);
    assert.match(skillHit.step.note, /BYPASSED/, `${JSON.stringify(opts)} must not get the semi-endow`);
    assert.equal(skillHit.avg, dmg(null, false, opts).avg, "and must be numerically identical to no buff");
  }
});

test("buff weapon ATK is one list, so the ATK readout and the damage cannot disagree", () => {
  const { weaponAtkBuffs } = require("../src/engine/calculators/modifiers/baseDamage");
  // Impositio Manus was reported as "not showing on the stat menu" — it was reaching the
  // damage roll but not the status payload, because each buff was inlined in baseDamage
  // and nothing else could see them. They now come from one helper both callers use.
  const build = (support, song) => buildFromSaveSchema({
    server: "payon_stories", job_id: 7, base_level: 90, job_level: 50,
    base_stats: { str: 80, agi: 50, vit: 40, int: 10, dex: 60, luk: 20 },
    equipped: { right_hand: 1129 }, support_buffs: support || {}, song_state: song || {},
  });
  const weapon = { level: 4, atk: 150 };
  const sum = (parts) => parts.reduce((n, p) => n + p.atk, 0);

  assert.deepEqual(weaponAtkBuffs(build({}, {}), weapon), [], "nothing buffed, nothing listed");
  assert.equal(sum(weaponAtkBuffs(build({ SC_IMPOSITIO: 5 }, {}), weapon)), 25, "Impositio Lv5 = 5 x lv");
  assert.equal(sum(weaponAtkBuffs(build({}, { SC_DRUMBATTLE: 5 }), weapon)), 150, "Battle Theme Lv5 = (lv+1) x 25");
  assert.equal(sum(weaponAtkBuffs(build({}, { SC_NIBELUNGEN: 5 }), weapon)), 175, "Nibelungen Lv5 = (lv+2) x 25");
  assert.equal(sum(weaponAtkBuffs(build({}, { SC_NIBELUNGEN: 5 }), { level: 3, atk: 150 })), 0,
    "...but only on a level 4 weapon");
  assert.equal(sum(weaponAtkBuffs(build({ ground_effect: "SC_VOLCANO", ground_effect_lv: 5 }, {}), weapon)), 50,
    "Volcano Lv5 = lv x 10");
  // An endow scroll carries Impositio 5 with it.
  assert.equal(sum(weaponAtkBuffs(build({ endow_lv1: true }, {}), weapon)), 25, "endow scroll implies Impositio 5");

  // ...and the damage really does move by that much.
  const dmg = (support) => {
    const b = build(support, {});
    const [gb, eff, w, st] = resolvePlayerState(b, createBattleConfig(), PS);
    return new BattlePipeline(createBattleConfig())
      .calculate(st, w, createSkillInstance({ id: 0, level: 1 }), loader.getMonster(1002), eff, gb)
      .normal.avg_damage;
  };
  assert.ok(dmg({ SC_IMPOSITIO: 5 }) > dmg({}), "Impositio has to reach the damage too");
});

test("defensive passives are offered to their jobs and reach incoming damage", () => {
  const { calculateIncomingPhysicalDamage } = require("../src/engine/calculators/incomingPipeline");
  // All four were modelled in the engine but missing from the passive picker, because
  // that list was written for outgoing damage only. A Blacksmith could not tick Skin
  // Tempering, so its resists never reached the survivability panel.
  const offers = (job, name) => (loader.getPassiveSkillsForJob(job) || [])
    .some((sk) => (sk.name || sk.mastery_key) === name);
  assert.ok(offers(10, "BS_SKINTEMPER"), "Blacksmith must be offered Skin Tempering");
  assert.ok(offers(8, "AL_DP"), "Priest must be offered Divine Protection");
  assert.ok(offers(14, "CR_TRUST"), "Crusader must be offered Faith");
  assert.ok(offers(9, "WZ_ESTIMATION"), "Wizard must be offered Sense");
  assert.ok(!offers(11, "BS_SKINTEMPER"), "...and a Hunter must not be");

  const taken = (job, mastery, buffs, opts) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: job, base_level: 90, job_level: 50,
      base_stats: { str: 60, agi: 40, vit: 60, int: 20, dex: 40, luk: 10 },
      equipped: { right_hand: 1129, armor: 2314 }, mastery_levels: mastery || {}, active_buffs: buffs || {},
    });
    const [gb, eff, w, st] = resolvePlayerState(b, createBattleConfig(), PS);
    return calculateIncomingPhysicalDamage(1040, eff, st, gb, w, createBattleConfig(), opts || {}).avg_damage;
  };
  // PS Skin Tempering: Fire 6%/lv, Neutral 4%/lv (vanilla is 4%/1%).
  const fire = { ele_override: 3 }, neutral = { ele_override: 0 };
  assert.ok(taken(10, { BS_SKINTEMPER: 10 }, {}, fire) < taken(10, {}, {}, fire) * 0.45, "Fire cut ~60%");
  assert.ok(taken(10, { BS_SKINTEMPER: 10 }, {}, neutral) < taken(10, {}, {}, neutral) * 0.65, "Neutral cut ~40%");
  // Faith: Holy 5%/lv.
  const holy = { ele_override: 6 };
  assert.ok(taken(14, { CR_TRUST: 10 }, {}, holy) < taken(14, {}, {}, holy) * 0.55, "Holy cut ~50%");
  // Sense on PS: +2% to the four basic elements.
  assert.ok(taken(9, { WZ_ESTIMATION: 1 }, {}, { ele_override: 4 }) < taken(9, {}, {}, { ele_override: 4 }),
    "Sense shaves a little off a Wind hit");
});

test("Run and Gun grants its PS ranged damage resistance, not just FLEE", () => {
  const { calculateIncomingPhysicalDamage } = require("../src/engine/calculators/incomingPipeline");
  // Gunslinger Release Patch Notes (Adjustment Rework): "Ranged damage resistance +30%".
  // We modelled its FLEE and its removed HIT penalty but never the resistance itself.
  const ranged = (buffs, server) => {
    const b = buildFromSaveSchema({
      server, job_id: 24, base_level: 90, job_level: 50,
      base_stats: { str: 40, agi: 60, vit: 60, int: 20, dex: 70, luk: 10 },
      equipped: { right_hand: 13104, armor: 2314 }, active_buffs: buffs || {},
    });
    const profile = getProfile(server);
    loader.setProfile(profile);
    const [gb, eff, w, st] = resolvePlayerState(b, createBattleConfig(), profile);
    const out = calculateIncomingPhysicalDamage(1189, eff, st, gb, w, createBattleConfig(), { is_ranged: true }).avg_damage;
    loader.setProfile(PS);
    return out;
  };
  const plain = ranged({}, "payon_stories"), buffed = ranged({ SC_GS_ADJUSTMENT: 5 }, "payon_stories");
  assert.ok(Math.abs(buffed / plain - 0.7) < 0.02, `ranged damage taken must fall ~30%, got x${(buffed / plain).toFixed(3)}`);
  // Vanilla's Adjustment grants no such resistance, so the profile must gate it.
  assert.equal(ranged({ SC_GS_ADJUSTMENT: 5 }, "standard"), ranged({}, "standard"),
    "the resistance is a PS rework, not stock behaviour");
});

test("Momoe's Hairband covers every Turtle Island turtle, and only those", () => {
  // PS: "Increases damage against the turtles of Turtle Island (excluding Turtle General)
  // by 20%". The vanilla script named four mob ids; Solider was missing outright and every
  // turtle also exists under duplicate ids with identical stats, so a player hitting the
  // wrong copy saw no bonus at all.
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 20, base_level: 99, job_level: 70,
    base_stats: { str: 60, agi: 60, vit: 40, int: 10, dex: 60, luk: 10 },
    equipped: { right_hand: 81000, head_top: 8065 },
  });
  const [gb] = resolvePlayerState(b, createBattleConfig(), PS);
  const cls = gb.add_damage_class || {};
  // The roster is the SPRITE family — PERMETER / ASSULTER / SOLIDER / HEATER / FREEZER —
  // including the `G_` copies that Turtle General summons. Stats do not identify them:
  // G_ASSULTER (1364) is lv59 Demon where 1315 is lv71 Demi-Human, and it was wrongly
  // left out on exactly that reasoning.
  const TURTLES = [1314, 1601, 1315, 1364, 1316, 1602, 1318, 1600, 1319, 1594, 1823, 1887];
  for (const id of TURTLES) {
    const mob = loader.getMonsterData(id);
    assert.equal(cls[id] || cls[String(id)], 20, `${id} ${mob ? mob.name : "?"} must take the +20%`);
  }
  assert.ok(!cls[1312] && !cls["1312"], "Turtle General is excluded by the description");
  assert.ok(!cls[25556] && !cls["25556"], "Heater Night Light is an event reskin, not an island spawn");
  // Every included id must really be one of the island's sprites — the guard against
  // sweeping in a same-named monster from somewhere else.
  const FAMILY = /(PERMETER|ASSULTER|SOLIDER|HEATER|FREEZER)/i;
  for (const id of TURTLES) {
    assert.match(loader.getMonsterData(id).sprite_name, FAMILY, `${id} must be a Turtle Island sprite`);
  }

  // End to end on the one that was missing entirely.
  const dmg = (hat) => runScenarioRaw({
    build: {
      job_id: 20, base_level: 99, job_level: 70,
      base_stats: { str: 60, agi: 60, vit: 40, int: 10, dex: 60, luk: 10 },
      equipped: { right_hand: 81000, ...(hat ? { head_top: 8065 } : {}) },
    },
    target: 1316,
  }).raw.normal.avg_damage;
  assert.ok(dmg(true) > dmg(false), "Solider must now take more damage with the hairband on");
});

test("isweapontype() resolves rather than falling open", () => {
  // The condition handler deliberately fails OPEN on an unevaluatable condition, so
  // a predicate that fails to substitute silently grants its bonus to everything —
  // which is exactly what a mangled regex did here before this test existed.
  const { parseScript, createItemScriptContext } = require("../src/engine/itemScriptParser");
  const script = 'bonus bCritical,10; if(isweapontype("Rifle")) bonus bCritical,20;';
  const total = (weapon_type) =>
    parseScript(script, createItemScriptContext({ weapon_type }))
      .reduce((n, e) => n + e.params[0], 0);
  assert.equal(total("Rifle"), 30);
  assert.equal(total("Revolver"), 10);
  assert.equal(total(null), 10, "unknown weapon must be false, NOT fail open");
});

test("PS-custom equipment added from the item API is loadable", () => {
  // The 2026-08-23 sweep of the live item DB found only three equippable items we
  // lacked; everything else missing was a box, a costume, a consumable, or Renewal
  // 3rd-job gear that pre-renewal PS cannot equip.
  const watch = loader.getItem(81002);
  assert.equal(watch.slots, 1, "Brass Wristwatch is the one with a card slot");
  assert.deepEqual(watch.loc, ["EQP_ACC"]);
  for (const id of [80066, 80067, 81002]) {
    assert.ok(loader.getItem(id) && loader.getItem(id).name, `item ${id} loads`);
    assert.ok((loader.getItemDescription(id) || {}).description, `item ${id} has a tooltip`);
  }
});

// ---------------------------------------------------------------------------
// After-cast delay that shrinks with AGI and DEX
// ---------------------------------------------------------------------------
test("the 4*AGI+2*DEX after-cast reduction reaches Assassin and Ninja, not just Monk", () => {
  const cfg = createBattleConfig();
  const target = loader.getMonster(1002);
  const period = (skillName, job, weapon, lv, stats) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: job, base_level: 99, job_level: 50,
      base_stats: stats, equipped: { right_hand: weapon },
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    const sd = loader.getSkillByName(skillName);
    const r = new BattlePipeline(cfg).calculate(
      st, w, createSkillInstance({ id: sd.id, level: lv }), target, eff, gb);
    return { period: r.period_ms, agi: st.agi, dex: st.dex, aspd: st.aspd };
  };
  const LOW = { str: 70, agi: 1, vit: 30, int: 20, dex: 1, luk: 20 };
  const HIGH = { str: 70, agi: 90, vit: 30, int: 20, dex: 80, luk: 20 };
  const aspdFloor = (aspd) => 2 * Math.max(100, Math.round(2000 - aspd * 10));

  // Sonic Blow's own delay is long enough that the formula always binds.
  for (const stats of [LOW, HIGH]) {
    const r = period("AS_SONICBLOW", 12, 1201, 10, stats);
    assert.equal(r.period, 2000 - (4 * r.agi + 2 * r.dex),
      "Sonic Blow: 2000 - (4*AGI + 2*DEX)");
  }

  // Kunai and Haze Slasher share the 1000 base. At high AGI the ASPD floor takes over
  // before the formula does — you cannot cast faster than the attack animation — so the
  // period is max(reduced delay, attack delay), not the raw formula.
  for (const name of ["NJ_KUNAI", "NJ_KASUMIKIRI"]) {
    for (const stats of [LOW, HIGH]) {
      const r = period(name, 25, 1201, 5, stats);
      const wiki = Math.max(0, 1000 - (4 * r.agi + 2 * r.dex));
      assert.equal(r.period, Math.max(wiki, aspdFloor(r.aspd)),
        `${name}: max(1000 - (4*AGI + 2*DEX), ASPD delay)`);
    }
  }

  // The reduction must actually depend on the stats — a flat DB delay would pass an
  // equality check written against itself, so assert the two builds differ.
  assert.ok(period("AS_SONICBLOW", 12, 1201, 10, HIGH).period
            < period("AS_SONICBLOW", 12, 1201, 10, LOW).period,
    "more AGI/DEX must mean a shorter delay");

  // Throw Huuma is deliberately NOT in this family yet: the wiki gives its delay formula
  // but never says whether its cast is DEX-reducible. Guard the omission so nobody adds
  // it by pattern-matching without resolving that first (see ROADMAP punch-list).
  assert.ok(!("NJ_HUUMA" in (PS.ps_skill_delay_fn || {})),
    "NJ_HUUMA needs an in-game timing before it joins this list");
});

// ---------------------------------------------------------------------------
// Throwing Mastery: two halves, two different scopes
// ---------------------------------------------------------------------------
test("Throwing Mastery grants HIT globally and ATK only to Throw Shuriken", () => {
  const cfg = createBattleConfig();
  const hitAt = (lv, profile, server) => {
    loader.setProfile(profile);
    const b = buildFromSaveSchema({
      server, job_id: 25, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi: 80, vit: 30, int: 20, dex: 70, luk: 20 },
      equipped: { right_hand: 1201 }, mastery_levels: { NJ_TOBIDOUGU: lv },
    });
    return resolvePlayerState(b, cfg, profile)[3].hit;
  };

  // PS gives +2 HIT/lv. statusCalculator has always read this through
  // passive_overrides.NJ_TOBIDOUGU.hit_per_lv, defaulting to 0 — with no PS entry the
  // whole block was a silent no-op, so the Ninja's ONLY passive did half its job.
  const STD = getProfile("standard");
  assert.equal(hitAt(10, PS, "payon_stories") - hitAt(0, PS, "payon_stories"), 20, "+2 HIT/lv on PS");
  assert.equal(hitAt(5, PS, "payon_stories") - hitAt(0, PS, "payon_stories"), 10);

  // Vanilla has NO such bonus — NJ_TOBIDOUGU appears nowhere in Hercules status.c, only
  // in battle.c as `case NJ_SYURIKEN: damage += 3 * skill2_lv`. So this is PS-only and
  // the standard profile must stay flat.
  assert.equal(hitAt(10, STD, "standard") - hitAt(0, STD, "standard"), 0, "vanilla has no HIT bonus");
  loader.setProfile(PS);

  // The HIT is global (the Ninja page: the bonus "could make other skills like Haze
  // Slasher more practical to use"), so it must NOT be gated on the selected skill.
  // The ATK half is the opposite — vanilla gates it to NJ_SYURIKEN — and Throw Shuriken
  // is not priced yet, so assert the gate rather than the damage.
  const fs = require("fs");
  const path = require("path");
  const masteryFix = fs.readFileSync(
    path.join(__dirname, "..", "src", "engine", "calculators", "modifiers", "masteryFix.js"), "utf8");
  assert.ok(/skill\.name === "NJ_SYURIKEN" && njTobiLv > 0/.test(masteryFix),
    "the +3 ATK/lv must stay gated to Throw Shuriken");
});

// ---------------------------------------------------------------------------
// Throw Shuriken: motion-paced, and no longer swallowed by the BF_MISC guard
// ---------------------------------------------------------------------------
test("Throw Shuriken fires on attack motion — twice the normal-attack rate", () => {
  const cfg = createBattleConfig();
  const target = loader.getMonster(1002);
  const run = (skillId, lv, tobi) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 25, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi: 80, vit: 30, int: 20, dex: 70, luk: 20 },
      equipped: { right_hand: 1201, ammo: 13254 }, mastery_levels: { NJ_TOBIDOUGU: tobi },
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    const r = new BattlePipeline(cfg).calculate(
      st, w, createSkillInstance({ id: skillId, level: lv }), target, eff, gb);
    return { r, st };
  };
  const id = loader.getSkillByName("NJ_SYURIKEN").id;

  // Player-reported: "based on an attack motion, instead of a delay ... tl;dr 2x aspd".
  // amotion is half of adelay, so the skill's period must be exactly half a normal
  // attack's. Relying on skillPeriodMs' ASPD floor would have given adelay — half speed.
  const { r: shuriken, st } = run(id, 10, 10);
  const { r: normal } = run(0, 1, 10);
  const amotion = Math.max(100, Math.round(2000 - st.aspd * 10));
  assert.equal(shuriken.period_ms, amotion, "period is the attack motion");
  assert.equal(normal.period_ms, 2 * amotion, "a normal attack waits twice that");
  assert.equal(shuriken.period_ms * 2, normal.period_ms, "2x the auto-attack rate");

  // It used to return a flat 0: typed Misc with no ratio anywhere, so the BF_MISC guard
  // reported it unmodelled. The 100% entry in weapon_ratios exists to get past that.
  assert.ok(shuriken.normal.avg_damage > 0, "must deal damage at all");

  // Both flat bonuses are mastery-type and must land AFTER Defense Fix — the Ninja page
  // says they "act like mastery damage and therefore bypass normal defense".
  const names = shuriken.normal.steps.map((s) => s.name);
  const iDef = names.indexOf("Defense Fix");
  assert.ok(iDef >= 0);
  for (const step of ["Throw Shuriken ATK", "Throw Mastery"]) {
    assert.ok(names.indexOf(step) > iDef, `${step} must be applied past DEF`);
  }
  // +5/lv from the skill, +3/lv from Throwing Mastery.
  assert.equal(run(id, 10, 10).r.normal.avg_damage - run(id, 10, 0).r.normal.avg_damage, 30,
    "Throwing Mastery contributes 3 x lv");
  assert.equal(run(id, 10, 0).r.normal.avg_damage - run(id, 1, 0).r.normal.avg_damage, 45,
    "the skill's own ATK is 5 x lv (Lv10 - Lv1 = 45)");

  // Higher-ATK shuriken must raise the damage — it is ammo, and the ammo-fit guard has
  // to let A_SHURIKEN through for a skill that requires it.
  const dmgWith = (ammo) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 25, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi: 80, vit: 30, int: 20, dex: 70, luk: 20 },
      equipped: { right_hand: 1201, ammo }, mastery_levels: { NJ_TOBIDOUGU: 10 },
    });
    const [gb, eff, w, st2] = resolvePlayerState(b, cfg, PS);
    return new BattlePipeline(cfg).calculate(
      st2, w, createSkillInstance({ id, level: 10 }), target, eff, gb).normal.avg_damage;
  };
  assert.ok(dmgWith(13254) > dmgWith(13250), "Thorn Needle (100 ATK) beats Shuriken (10 ATK)");
});

// ---------------------------------------------------------------------------
// Long/short is the SKILL's range, not the weapon's
// ---------------------------------------------------------------------------
test("skills are classified long/short by their own range", () => {
  const cfg = createBattleConfig();
  const target = loader.getMonster(1002);
  // Archer Skeleton Card (4094) is bLongAtkRate — the only thing this flag feeds.
  const rateStep = (job, weapon, skillName, lv, card) => {
    const equipped = card ? { right_hand: weapon, right_hand_card1: card } : { right_hand: weapon };
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: job, base_level: 99, job_level: 50,
      base_stats: { str: 80, agi: 80, vit: 30, int: 20, dex: 80, luk: 20 }, equipped,
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    const sd = loader.getSkillByName(skillName);
    const r = new BattlePipeline(cfg).calculate(
      st, w, createSkillInstance({ id: sd.id, level: lv }), target, eff, gb);
    const s = r.normal.steps.find((x) => /Final Rate Bonus \((Short|Long)\)/.test(x.name));
    return { label: s && s.name, dmg: r.normal.avg_damage };
  };

  // Hercules battle_range_type(): range < 5 -> BF_SHORT, else BF_LONG, with a NEGATIVE
  // range meaning "use the weapon's". Three PS wiki statements confirm the cutoff, and
  // Desperado confirms it in the opposite direction from the rest.

  // Range 9 on a dagger -> LONG despite the melee weapon.
  assert.match(rateStep(25, 1201, "NJ_SYURIKEN", 10).label, /\(Long\)/);
  assert.match(rateStep(25, 1201, "NJ_KUNAI", 5).label, /\(Long\)/);

  // Desperado has NO range in the skill DB (0) and PS says so outright: "Desperado is
  // considered melee, which means cards like Earth and Sky Deleter work with it, but
  // Archer skeleton does not." A revolver is a ranged WEAPON, so weapon-derived logic
  // called this Long and wrongly paid out bLongAtkRate.
  assert.match(rateStep(24, 13100, "GS_DESPERADO", 10).label, /\(Short\)/);
  assert.equal(rateStep(24, 13100, "GS_DESPERADO", 10, 4094).dmg,
               rateStep(24, 13100, "GS_DESPERADO", 10).dmg,
               "Archer Skeleton must NOT boost Desperado");
  assert.ok(rateStep(25, 1201, "NJ_SYURIKEN", 10, 4094).dmg
            > rateStep(25, 1201, "NJ_SYURIKEN", 10).dmg,
    "but it must boost a genuinely long-range skill");

  // Grimtooth splits mid-skill: range 2+lv, so Lv1-2 melee and Lv3+ ranged. The wiki
  // states exactly that ("blocked by Safety Wall" vs "blocked by Pneuma").
  assert.match(rateStep(12, 1250, "AS_GRIMTOOTH", 2).label, /\(Short\)/);
  assert.match(rateStep(12, 1250, "AS_GRIMTOOTH", 3).label, /\(Long\)/);

  // A negative range still follows the weapon: Tracking is -9, and a rifle is ranged.
  assert.match(rateStep(24, 13150, "GS_TRACKING", 10).label, /\(Long\)/);
});

test("a skill with no usable range falls back to the weapon, never to Short", () => {
  const cfg = createBattleConfig();
  // PS-custom skills are SYNTHESIZED records. They carry no numeric range, and
  // ps_skill_db scrapes `range` as prose ("9 Cells + Vulture's Eye"). Once
  // resolveIsRanged started reading this field, a placeholder of [1] forced every one
  // of them Short — a real damage regression for bow Rogues, who lost bLongAtkRate on
  // Trick Arrow and Quick Step. A prose string is just as bad: `"9 Cells..." >= 5` is
  // false, so it fails Short silently rather than loudly.
  const rate = (weapon, skillName) => {
    const sd = loader.getSkillByName(skillName);
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 17, base_level: 99, job_level: 50,
      base_stats: { str: 60, agi: 80, vit: 30, int: 20, dex: 80, luk: 20 },
      equipped: { right_hand: weapon, right_hand_card1: 4094, ammo: 1750 },
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    const r = new BattlePipeline(cfg).calculate(
      st, w, createSkillInstance({ id: sd.id, level: 5 }), loader.getMonster(1002), eff, gb);
    return (r.normal.steps.find((x) => /Final Rate Bonus \((Short|Long)\)/.test(x.name)) || {}).name;
  };
  assert.match(rate(1701, "PS_RG_TRICKARROW"), /\(Long\)/, "a bow is ranged");
  assert.match(rate(1201, "PS_RG_TRICKARROW"), /\(Short\)/, "a dagger is not");

  // The synthesized range must stay NULL — "no data, ask the weapon". Not prose, and above
  // all not a number: a literal 1 forces Short, and so does -1, because Hercules reads a
  // negative range as its absolute value unless `skillrange_from_weapon` is set (it defaults
  // to nobody). Both mistakes have shipped here; this pins the third option.
  for (const name of ["PS_RG_TRICKARROW", "PS_RG_QUICKSTEP"]) {
    const sd = loader.getSkillByName(name);
    const r = sd.range;
    const v = Array.isArray(r) ? r[0] : r;
    assert.equal(v, null,
      `${name}: synthesized range must be null (weapon-derived), got ${JSON.stringify(r)}`);
  }
});

// ---------------------------------------------------------------------------
// Throw Shuriken doesn't ignore Flee on PS - vanilla's IgnoreFlee is overridden
// ---------------------------------------------------------------------------
test("Throw Shuriken rolls hit/flee like a normal attack on PS, not vanilla's auto-hit", () => {
  const cfg = createBattleConfig();
  const id = loader.getSkillByName("NJ_SYURIKEN").id;

  // A deliberately low-HIT build against a high-Flee monster, so an auto-hit override
  // would be visibly wrong (100%) versus the real accuracy formula (well under 100%).
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 25, base_level: 60, job_level: 30,
    base_stats: { str: 20, agi: 20, vit: 20, int: 1, dex: 20, luk: 1 },
    equipped: {},
  });
  const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
  const target = loader.getMonster(1920); // 296 Flee - highest in the loaded DB

  // The real formula's own answer, computed the same way battlePipeline.js does it
  // internally - this is what the skill SHOULD show once Flee is not ignored.
  const [expectedHit] = calculateHitChance(st, target, cfg, "NJ_SYURIKEN", 1, { mastery: gb.effective_mastery });
  assert.ok(expectedHit < 100, "test setup must actually produce a hit chance below 100% to be meaningful");

  const r = new BattlePipeline(cfg).calculate(st, w, createSkillInstance({ id, level: 1 }), target, eff, gb);
  assert.equal(r.hit_chance, expectedHit, "must use the real accuracy formula, not a guaranteed hit");

  // Regression guard: the override lives in the pipeline, not the DB - vanilla data
  // must keep saying IgnoreFlee, or the STANDARD-profile assertion below is meaningless.
  const skillData = loader.getSkillByName("NJ_SYURIKEN");
  assert.ok((skillData.damage_type || []).includes("IgnoreFlee"),
    "vanilla data must still say IgnoreFlee - PS's override must be a pipeline-level fix, not a data edit");

  // The override must stay PS-only: STANDARD keeps vanilla's auto-hit behaviour.
  const stdBuild = buildFromSaveSchema({
    server: "standard", job_id: 25, base_level: 60, job_level: 30,
    base_stats: { str: 20, agi: 20, vit: 20, int: 1, dex: 20, luk: 1 },
    equipped: {},
  });
  const [gbStd, effStd, wStd, stStd] = resolvePlayerState(stdBuild, cfg, STANDARD);
  const rStd = new BattlePipeline(cfg).calculate(stStd, wStd, createSkillInstance({ id, level: 1 }), target, effStd, gbStd);
  assert.equal(rStd.hit_chance, 100, "STANDARD (vanilla) profile must still auto-hit");
});

// ---------------------------------------------------------------------------
// Ardent Helm — the one custom item the item API cannot describe
// ---------------------------------------------------------------------------
test("Ardent Helm turns Magnum Break Holy", () => {
  const cfg = createBattleConfig();
  const id = loader.getSkillByName("SM_MAGNUM").id;
  const dmg = (helm, mob) => {
    const equipped = helm ? { right_hand: 1101, head_top: 8417 } : { right_hand: 1101 };
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 14, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 40, vit: 50, int: 20, dex: 60, luk: 20 }, equipped,
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    const r = new BattlePipeline(cfg).calculate(
      st, w, createSkillInstance({ id, level: 10 }), loader.getMonster(mob), eff, gb);
    return { dmg: r.normal.avg_damage, attr: (r.normal.steps.find((s) => /Attr Fix/.test(s.name)) || {}).note };
  };

  // wiki.payonstories.com/Magnum_Break: "The element of Magnum Break can be changed
  // from Fire to Holy with the Ardent Helmet headgear." Against an Undead target that
  // is 150% -> 175%, so the swap is visible in the damage as well as the step note.
  const off = dmg(false, 1036);
  const on = dmg(true, 1036);
  assert.match(off.attr, /Fire/, "without the helm Magnum Break is Fire");
  assert.match(on.attr, /Holy/, "with it, Holy");
  assert.ok(on.dmg > off.dmg, "Holy beats Fire into Undead");

  // The helm must not leak into other skills — the bonus is Magnum-Break-specific.
  const bashId = loader.getSkillByName("SM_BASH").id;
  const bashAttr = (helm) => {
    const equipped = helm ? { right_hand: 1101, head_top: 8417 } : { right_hand: 1101 };
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 14, base_level: 99, job_level: 50,
      base_stats: { str: 90, agi: 40, vit: 50, int: 20, dex: 60, luk: 20 }, equipped,
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    return (new BattlePipeline(cfg).calculate(st, w, createSkillInstance({ id: bashId, level: 10 }),
      loader.getMonster(1036), eff, gb).normal.steps.find((s) => /Attr Fix/.test(s.name)) || {}).note;
  };
  assert.equal(bashAttr(true), bashAttr(false), "Bash's element must be untouched");
});

// ---------------------------------------------------------------------------
// Back Stab: the per-level table, pinned to the wiki's own published numbers
// ---------------------------------------------------------------------------
test("Back Stab matches the wiki's published per-level table", () => {
  // Reported in-game as 600% at Lv10 while the calculator showed 500%.
  //
  // The cause was a source conflict resolved the wrong way. The Rogue rework PDF
  // says the damage was "reduced from 300% + 40%*Skill_Level to 200%+30%*Skill_Level"
  // and the Rogue class page echoes "500% damage", but the dedicated "Back Stab"
  // page carries a full per-level table that says otherwise — and the live server,
  // the scraped skill DB and the in-game tooltip all agree with the table. The PDF
  // describes an intent that did not ship as written.
  //
  // These are the wiki's numbers verbatim, so a future edit has to disagree with a
  // published table on purpose rather than by picking the wrong source again.
  const ps = getProfile("payon_stories");
  const f = ps.weapon_ratios.RG_BACKSTAP;
  assert.ok(f, "PS weapon ratio table missing Back Stab");

  const BASE = [240, 280, 320, 360, 400, 440, 480, 520, 560, 600];
  assert.deepEqual(BASE.map((_, i) => f(i + 1)), BASE,
    "Back Stab base ATK% no longer matches the wiki table (200 + 40 x level)");

  // The wiki publishes the "inattentive" column as exactly base x 1.4, which is the
  // Opportunity bonus the pipeline applies as its own step. Checking it here keeps
  // the two halves of the skill tied to the same table.
  const INATTENTIVE = [336, 392, 448, 504, 560, 616, 672, 728, 784, 840];
  assert.deepEqual(BASE.map((b) => Math.round(b * 1.4)), INATTENTIVE,
    "the Opportunity multiplier no longer reproduces the wiki's inattentive column");

  // And the multiplier must stay ON THE RATIO — applied before DEF is subtracted,
  // not to the final number. Players reported it as "multiplicative on ratio".
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "src", "engine", "calculators", "battlePipeline.js"), "utf8");
  const opp = src.indexOf("RG_BACKSTAP_OPPORTUNITY");
  assert.ok(opp > 0, "Backstab Opportunity step vanished from the pipeline");
  const after = src.slice(opp);
  assert.ok(after.indexOf("calculateDefenseFix") > after.indexOf("scaleFloor(pmf, 140, 100)"),
    "the x1.4 must be applied before calculateDefenseFix, i.e. on the ratio");
});

// ---------------------------------------------------------------------------
// Multi-hit skills must SAY they are multi-hit
// ---------------------------------------------------------------------------
test("a multi-hit skill's ratio step states the hit count", () => {
  // The hit count was computed correctly but only ever written into the step's
  // `formula` string, and DamageSummary.tsx renders name/value/note — never
  // formula. So Soul Bullet displayed "277%" with nothing on screen saying it
  // lands three times, and a player reasonably read that as the whole story.
  // The note is the field the UI actually shows, so the count goes there.
  const cfg = createBattleConfig();
  const target = loader.getMonster(2524); // Shade of Payon
  const ratioStep = (id, level, extra) => {
    const b = buildFromSaveSchema(Object.assign({
      server: "payon_stories", job_id: 24, base_level: 96, job_level: 70,
      base_stats: { str: 50, agi: 42, vit: 10, int: 53, dex: 99, luk: 3 },
      equipped: { right_hand: 13155, ammo: 13235 },
    }, extra || {}));
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    return new BattlePipeline(cfg).calculate(st, w, createSkillInstance({ id, level }), target, eff, gb)
      .normal.steps.find((s) => /Skill Ratio/.test(s.name));
  };

  // Soul Bullet fires 3 times (wiki.payonstories.com/Soul_Bullet, "3 times like
  // Triple Action"), and its ratio is stated PER HIT.
  const soul = ratioStep(507, 1);
  assert.match(soul.note, /Hits 3 times/, "Soul Bullet's note must state the 3 hits");
  assert.match(soul.note, /per hit/, "and must say the ratio is per hit, not the total");

  // Desperado sprays a variable number of shots — the range has to survive too.
  const desp = ratioStep(loader.getSkillIdByName("GS_DESPERADO"), 10);
  assert.match(desp.note, /Hits 1.10 times/, "Desperado's note must carry its hit range");

  // A single-hit attack must NOT gain a spurious hit-count sentence.
  assert.ok(!/Hits \d/.test(ratioStep(0, 1).note || ""),
    "a normal attack is one hit and should say nothing about hit counts");
});

// ---------------------------------------------------------------------------
// Shadow's Within: the toggle that lets Shadow Slash crit at all on PS
// ---------------------------------------------------------------------------
test("Shadow's Within gates Shadow Slash's crit and grants the crit rate, not damage", () => {
  // A player built a crit Shadow Slash and found the calculator could not represent
  // it. Two reasons: the toggle had NO producer anywhere (no UI control, no route
  // bridge), so the engine flag was unreachable; and the bonus behind it had been
  // written into the DAMAGE ratio in serverProfiles.js.
  //
  // `25 + 5*lv` is 30/35/40/45/50 — the wiki table's "+Crit (%)" column, not a
  // damage column. All three sources call it crit rate: the table, the Shadow's
  // Within page ("critically hit at a rate of +50%") and the skill DB ("the chance
  // of delivering a critical strike increases by 50%").
  const cfg = createBattleConfig();
  const target = loader.getMonster(1269); // Clock
  const run = (shadowsWithin, level) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 25, base_level: 99, job_level: 70,
      base_stats: { str: 90, agi: 60, vit: 40, int: 1, dex: 70, luk: 90 },
      equipped: { right_hand: 1232 }, support_buffs: { ninja_hiding: true },
    });
    b.skill_params = Object.assign({ NJ_KIRIKAGE_hiding: true }, b.skill_params,
      shadowsWithin ? { PS_NJ_SHADOWSWITHIN_active: true } : {});
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    return new BattlePipeline(cfg).calculate(st, w, createSkillInstance({ id: 530, level }), target, eff, gb);
  };

  // PS inverts the vanilla skill: "Shadow Slash no longer possesses the capability
  // to land critical strikes" unless Shadow's Within is on. No toggle, no crit.
  assert.equal(run(false, 5).crit_chance, 0, "Shadow Slash must not crit on PS without Shadow's Within");
  assert.equal(run(false, 5).crit, null, "and must produce no crit branch at all");

  // Toggled on, the bonus is +30 at Lv1 rising to +50 at Lv5, on top of the
  // character's own crit. The deltas are what matter — the base moves with gear.
  const base = run(false, 5).crit_chance_uncapped ?? null;
  const lv1 = run(true, 1).crit_chance, lv5 = run(true, 5).crit_chance;
  assert.ok(lv1 > 0 && lv5 > 0, "with the toggle on there must be a crit chance");
  assert.equal(Math.round((lv5 - lv1) * 10) / 10, 20,
    "Lv1 -> Lv5 must add 20 points of crit (30 -> 50)");

  // And it must NOT touch damage: the ratio is the wiki's per-level table alone.
  const ratioOf = (r) => (r.normal.steps.find((s) => /Skill Ratio/.test(s.name)) || {}).formula;
  assert.equal(ratioOf(run(true, 5)), ratioOf(run(false, 5)),
    "Shadow's Within is crit rate — it must not change the damage ratio");
  assert.equal(run(true, 5).normal.avg_damage, run(false, 5).normal.avg_damage,
    "non-crit damage must be identical with and without the toggle");

  // Vanilla is untouched: there, Shadow Slash crits on its own.
  assert.ok(require("../src/engine/calculators/modifiers/critChance")
    .isCritEligible(530, "NJ_KIRIKAGE", "standard"), "vanilla Shadow Slash still crits");
});

// ---------------------------------------------------------------------------
// An ammo-driven element only applies to attacks that actually use that ammo
// ---------------------------------------------------------------------------
test("elemental Kunai element applies to Throw Kunai but not to a bare-handed punch", () => {
  const cfg = createBattleConfig();
  const target = loader.getMonster(1170); // Sohee — Water, Lv1
  const buildWith = (extra) => buildFromSaveSchema({
    server: "payon_stories", job_id: 25, base_level: 44, job_level: 27,
    base_stats: { str: 69, agi: 1, vit: 1, int: 1, dex: 8, luk: 1 },
    equipped: { ammo: 13257 }, // High Wind Kunai — Wind element
    ...extra,
  });

  // Unarmed punch with the Kunai equipped: must stay Neutral, not borrow Wind — a
  // punch never throws the Kunai. Confirmed in-game: punching Sohee reads 74 flat
  // whether or not the Kunai is equipped.
  const b1 = buildWith({});
  const [gb1, eff1, w1, st1] = resolvePlayerState(b1, cfg, PS);
  const punch = new BattlePipeline(cfg).calculate(st1, w1, createSkillInstance({ id: 0, level: 1 }), target, eff1, gb1);
  assert.equal(punch.normal.steps.find((s) => s.name === "Attr Fix").note, "Neutral vs Water Lv1 (100%)",
    "a punch must not inherit the equipped ammo's element");
  assert.equal(punch.normal.avg_damage, 74, "matches the in-game reading exactly");

  // Throw Kunai — declares an AmmoTypes requirement — must still get the Kunai's
  // own element.
  const kunaiId = loader.getSkillIdByName("NJ_KUNAI");
  const b2 = buildWith({ mastery_levels: { NJ_TOBIDOUGU: 1 } });
  const [gb2, eff2, w2, st2] = resolvePlayerState(b2, cfg, PS);
  const kunai = new BattlePipeline(cfg).calculate(st2, w2, createSkillInstance({ id: kunaiId, level: 5 }), target, eff2, gb2);
  assert.equal(kunai.normal.steps.find((s) => s.name === "Attr Fix").note, "Wind vs Water Lv1 (175%)",
    "Throw Kunai must still borrow the ammo's element");

  // Regression guard for the OTHER half of this mechanism (ammoFitsWeapon, not
  // touched by this fix): an Unarmed character with an elemental ARROW equipped
  // gets nothing at all — arrows need a compatible weapon (Bow/Instrument/Whip) to
  // fire, unlike Kunai/Shuriken which are thrown by hand.
  const b3 = buildFromSaveSchema({
    server: "payon_stories", job_id: 11, base_level: 60, job_level: 30,
    base_stats: { str: 30, agi: 30, vit: 30, int: 1, dex: 30, luk: 1 },
    equipped: { ammo: 1759 }, // Frozen Arrow — Water element
  });
  const [gb3, eff3, w3, st3] = resolvePlayerState(b3, cfg, PS);
  const arrowPunch = new BattlePipeline(cfg).calculate(st3, w3, createSkillInstance({ id: 0, level: 1 }), target, eff3, gb3);
  assert.equal(arrowPunch.normal.steps.find((s) => s.name === "Attr Fix").note, "Neutral vs Water Lv1 (100%)",
    "an Unarmed character gets nothing from an equipped arrow — it needs a bow");
});

// ---------------------------------------------------------------------------
// Throw Kunai's flat +60 mastery bonus is not gated on an equipped weapon
// ---------------------------------------------------------------------------
test("Throw Kunai's flat +60 mastery bonus applies whether or not a weapon is equipped", () => {
  const cfg = createBattleConfig();
  const target = loader.getMonster(1170); // Sohee
  const id = loader.getSkillIdByName("NJ_KUNAI");
  const run = (rightHand) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 25, base_level: 44, job_level: 27,
      base_stats: { str: 69, agi: 1, vit: 1, int: 1, dex: 8, luk: 1 },
      equipped: { ammo: 13257, ...(rightHand ? { right_hand: rightHand } : {}) },
    });
    const [gb, eff, w, st] = resolvePlayerState(b, cfg, PS);
    return new BattlePipeline(cfg).calculate(st, w, createSkillInstance({ id, level: 5 }), target, eff, gb);
  };

  for (const [label, rightHand] of [["Unarmed", null], ["Cutter[3] equipped", 1204]]) {
    const steps = run(rightHand).normal.steps;
    const before = steps.find((s) => s.name === "Mastery Fix");
    const after = steps.find((s) => s.name === "Kunai Mastery");
    assert.ok(before && after, `${label}: Kunai Mastery step must be present`);
    assert.equal(after.min_value - before.min_value, 60, `${label}: +60 flat (min)`);
    assert.equal(after.max_value - before.max_value, 60, `${label}: +60 flat (max)`);
  }
});

// ---------------------------------------------------------------------------
// A dual-wielder's off-hand must not borrow the main hand's script-driven element
// ---------------------------------------------------------------------------
test("dual-wield off-hand element doesn't borrow the main hand's ammo/script element", () => {
  const cfg = createBattleConfig();
  const b = buildFromSaveSchema({
    server: "payon_stories", job_id: 12, base_level: 99, job_level: 50,
    base_stats: { str: 90, agi: 90, vit: 40, int: 1, dex: 60, luk: 40 },
    // Bazerald (Fire, via bAtkEle script) right hand, a plain Neutral Knife left.
    equipped: { right_hand: 1231, left_hand: 1201 },
    mastery_levels: { AS_RIGHT: 5, AS_LEFT: 5 },
  });
  const [gb, eff, weapon, status] = resolvePlayerState(b, cfg, PS);
  const r = new BattlePipeline(cfg).calculate(status, weapon, createSkillInstance({ id: 0, level: 1 }),
    loader.getMonster(1002), eff, gb);
  const rhNote = r.normal.steps.find((s) => s.name === "Attr Fix").note;
  const lhNote = r.dw_lh_normal.steps.find((s) => s.name === "Attr Fix").note;
  assert.ok(rhNote.startsWith("Fire vs"), `right hand (Bazerald) must stay Fire, got: ${rhNote}`);
  assert.ok(lhNote.startsWith("Neutral vs"), `left hand (plain Knife) must not borrow Bazerald's Fire, got: ${lhNote}`);
});
