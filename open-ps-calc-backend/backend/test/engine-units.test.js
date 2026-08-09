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
});

test("card autocast (Pirate Skel to Mammonite) surfaces as a proc branch on auto-attacks only", () => {
  const cfg = createBattleConfig();
  const run = (skillId) => {
    const b = buildFromSaveSchema({
      server: "payon_stories", job_id: 10, base_level: 95, job_level: 50,
      base_stats: { str: 95, agi: 60, vit: 50, int: 1, dex: 60, luk: 20 },
      equipped: { right_hand: 1504, accessory_left: 2615, accessory_left_card1: 4073 },
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
