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
  const { avg, steps } = ratioOf("LK_HEADCRUSH", 5); // documented vanilla-fallback skill (ROADMAP)
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

// ---------------------------------------------------------------------------
// weapon element precedence
// ---------------------------------------------------------------------------
test("resolveWeapon: element override > ammo script element > weapon innate", () => {
  // 1101 Sword is Neutral (0)
  assert.strictEqual(resolveWeapon(loader, 1101, 0, null, {}).element, 0);
  assert.strictEqual(resolveWeapon(loader, 1101, 0, null, { script_atk_ele_rh: 3 }).element, 3);
  assert.strictEqual(resolveWeapon(loader, 1101, 0, 4, { script_atk_ele_rh: 3 }).element, 4);
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
