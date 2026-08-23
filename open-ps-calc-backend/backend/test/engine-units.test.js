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
const { runScenario } = require("./engineRunner");

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
  // Turtle Island turtles (excluding Turtle General 1312): Permeter/Assaulter/Heater/Freezer.
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
  const firstSmith = order.findIndex((n) => n.startsWith("BS_") && n !== "BS_HILTBINDING" && n !== "BS_WEAPONRESEARCH");
  for (const n of ["BS_HILTBINDING", "BS_WEAPONRESEARCH", "PS_MC_TOOLMASTERY"]) {
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
  const delta = (weaponId, ammoId, key) =>
    (bonusesFor(weaponId, ammoId).add_race[key] || 0) - (bonusesFor(weaponId, null).add_race[key] || 0);

  // Hollow-Point Bullet (13234) = bonus2 bAddRace,RC_DemiHuman,20 — a GUN bullet.
  const MACE = 1504, REVOLVER = 13100, BOW = 1707, LUTE = 1905, WHIP = 1950;
  assert.equal(delta(MACE, 13234, "RC_DemiHuman"), 0,
    "a mace cannot fire a bullet, so its bonus must not apply");
  assert.equal(delta(REVOLVER, 13234, "RC_DemiHuman"), 20,
    "a revolver CAN fire it — the bonus must survive");

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

  // These four are ones where the WIKI is stale and we are right — pinned so a future
  // wiki-driven pass doesn't "correct" them back. Each cites a rework PDF in PS_SOURCES.md.
  assert.equal(r.KN_SPEARSTAB(5), 300, "Knight PDF: 100+40*SkillLevel (wiki still says 100+20)");
  assert.equal(r.AM_ACIDTERROR(5), 600, "Alchemist PDF: NEW FORMULA (100+100*SkillLv)% (wiki says 500)");
  assert.equal(r.RG_BACKSTAP(10), 500, "Rogue PDF: reduced to 200%+30%*Skill_Level (wiki says 600)");
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
