/**
 * engineRunner.js — drives the real damage engine for the regression tests.
 *
 * Mirrors what routes/calculate.ts does around BattlePipeline (profile setup,
 * build resolution, target creation, the Performing skill_param) without the
 * HTTP layer, and normalizes the result into a plain JSON-safe object so it
 * can be diffed against test/goldens.json.
 */
const { loader } = require("../src/engine/dataLoader");
const { getProfile } = require("../src/engine/serverProfiles");
const { buildFromSaveSchema } = require("../src/engine/buildManager");
const { createSkillInstance, createTarget } = require("../src/engine/models");
const { createBattleConfig } = require("../src/engine/config");
const { resolvePlayerState } = require("../src/engine/playerStateBuilder");
const { BattlePipeline } = require("../src/engine/calculators/battlePipeline");
const { calculateIncomingPhysicalDamage, calculateIncomingMagicDamage } = require("../src/engine/calculators/incomingPipeline");

// Round floats so goldens don't flake on FP noise; integers pass through.
const r3 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);

function skillIdByName(name) {
  const sk = loader.getAllSkills().find((s) => s.name === name);
  if (!sk) throw new Error(`skill not found: ${name}`);
  return sk.id;
}

// The damage branches a BattleResult may carry (see createBattleResult /
// applyResultMult in routes/calculate.ts for the full list).
const BRANCH_KEYS = [
  "normal", "crit", "magic", "katar_second", "katar_second_crit",
  "double_hit", "double_hit_crit", "second_hit", "second_hit_crit",
  "lh_normal", "lh_crit", "dw_lh_normal", "dw_lh_crit",
];

function normalizeBranch(br) {
  if (!br) return null;
  return {
    min: r3(br.min_damage),
    max: r3(br.max_damage),
    avg: r3(br.avg_damage),
    steps: (br.steps || []).map((s) => s.name), // step NAMES only — values are covered by min/max/avg
  };
}

function normalizeStatus(st) {
  return {
    str: st.str, agi: st.agi, vit: st.vit, int_: st.int_, dex: st.dex, luk: st.luk,
    batk: st.batk, max_hp: st.max_hp, max_sp: st.max_sp,
    aspd: r3(st.aspd), cri: st.cri, hit: st.hit, flee: st.flee,
    def_: st.def_, mdef: st.mdef,
    matk_min: st.matk_min, matk_max: st.matk_max,
  };
}

function normalizeBattleResult(res) {
  const out = {
    dps: r3(res.dps),
    dps_valid: res.dps_valid,
    hit_chance: r3(res.hit_chance),
    crit_chance: r3(res.crit_chance),
    period_ms: r3(res.period_ms),
  };
  if (res.success_chance != null) out.success_chance = r3(res.success_chance);
  for (const key of BRANCH_KEYS) {
    if (res[key]) out[key] = normalizeBranch(res[key]);
  }
  const procs = Object.keys(res.proc_branches || {}).sort();
  if (procs.length) {
    out.proc_branches = {};
    for (const k of procs) out.proc_branches[k] = normalizeBranch(res.proc_branches[k]);
  }
  // Grand Cross recoil lives on the branch result (battlePipeline.js
  // _runGrandCrossBranch sets result.self_damage on the damage result).
  const sd = res.self_damage || (res.normal && res.normal.self_damage);
  if (sd && sd.total) {
    out.self_damage = { total_min: r3(sd.total.min), total_max: r3(sd.total.max), total_avg: r3(sd.total.avg) };
  }
  return out;
}

/**
 * scenario = {
 *   build:      save-schema build object (server defaults to payon_stories)
 *   skill:      { name, level } | null (null / omitted = normal attack)
 *   target:     mob id (number) | custom-target object | undefined (status-only)
 *   performing: true → skill_params.PS_PERFORMING_active (as calculate.ts does)
 *   zeny_pincher: true → skill_params.PS_BS_ZENYPINCHER_active (Mammonite ratio)
 *   burning:    1–5 → Burning stacks on the target (−2 hard MDEF each)
 *   incoming:   "physical" | "magic" → run the incoming (survivability) pipeline
 *               against target mob id instead of the outgoing one
 * }
 */
function runScenario(sc) {
  const buildData = { server: "payon_stories", ...sc.build };
  const build = buildFromSaveSchema(buildData);
  const profile = getProfile(build.server);
  loader.setProfile(profile);

  const config = createBattleConfig();
  const [gearBonuses, effBuild, weapon, status] = resolvePlayerState(build, config, profile);

  const out = { status: normalizeStatus(status) };

  if (sc.incoming) {
    const mobId = sc.target;
    const result = sc.incoming === "magic"
      ? calculateIncomingMagicDamage(mobId, effBuild, status, gearBonuses, weapon, {})
      : calculateIncomingPhysicalDamage(mobId, effBuild, status, gearBonuses, weapon, config, {});
    out.incoming = {
      min: r3(result.min_damage), max: r3(result.max_damage), avg: r3(result.avg_damage),
    };
    return out;
  }

  if (sc.target !== undefined) {
    const target = typeof sc.target === "number" ? loader.getMonster(sc.target) : createTarget(sc.target);
    if (!target) throw new Error(`target not found: ${sc.target}`);

    if (sc.performing) {
      effBuild.skill_params = { ...(effBuild.skill_params || {}), PS_PERFORMING_active: true };
    }
    if (sc.ninja_hiding) {
      effBuild.skill_params = { ...(effBuild.skill_params || {}), NJ_KIRIKAGE_hiding: true, NJ_KASUMIKIRI_hiding: true };
    }
    if (sc.zeny_pincher) {
      effBuild.skill_params = { ...(effBuild.skill_params || {}), PS_BS_ZENYPINCHER_active: true };
    }
    // Burning stacks on the target: −(profile.burning.mdef_per_stack) hard MDEF each,
    // exactly as routes/calculate.ts applies the target_mods.burning field.
    if (sc.burning) {
      const perStack = (profile.burning && profile.burning.mdef_per_stack) || 2;
      const maxStacks = (profile.burning && profile.burning.max_stacks) || 5;
      const stacks = Math.max(0, Math.min(maxStacks, Number(sc.burning) || 0));
      target.mdef_ = Math.max(0, target.mdef_ - perStack * stacks);
    }

    const skill = sc.skill
      ? createSkillInstance({ id: skillIdByName(sc.skill.name), level: sc.skill.level })
      : createSkillInstance({ id: 0, level: 1 });

    const pipeline = new BattlePipeline(config);
    const battleResult = pipeline.calculate(status, weapon, skill, target, effBuild, gearBonuses);
    out.result = normalizeBattleResult(battleResult);
  }

  return out;
}

module.exports = { runScenario, skillIdByName };
