/**
 * models.js — JS port of core/models/*.py
 *
 * Python dataclasses become plain-object factory functions. Every factory
 * accepts a partial `overrides` object so callers can do
 * `createPlayerBuild({ base_str: 10 })` the same way Python callers did
 * `PlayerBuild(base_str=10)`.
 */

const RANGED_WEAPON_TYPES = new Set([
  "Bow", "MusicalInstrument", "Whip",
  "Revolver", "Rifle", "Gatling", "Shotgun", "Grenade",
]);

function createPlayerBuild(overrides = {}) {
  return {
    base_level: 1,
    job_level: 1,
    job_id: 0,

    base_str: 1, base_agi: 1, base_vit: 1, base_int: 1, base_dex: 1, base_luk: 1,
    bonus_str: 0, bonus_agi: 0, bonus_vit: 0, bonus_int: 0, bonus_dex: 0, bonus_luk: 0,

    equip_def: 0,
    equip_mdef: 0,
    bonus_def2: 0,

    bonus_batk: 0,
    bonus_cri: 0,
    bonus_hit: 0,
    bonus_flee: 0,
    bonus_aspd_percent: 0,
    bonus_aspd_add: 0,
    bonus_maxhp: 0,
    bonus_maxsp: 0,
    bonus_crit_atk_rate: 0,
    bonus_matk_rate: 0,
    bonus_maxhp_rate: 0,

    is_ranged_override: null, // null = derive from weapon_type
    no_sizefix: false,
    is_riding_peco: false,
    sn_never_died: false, // Super Novice: no death by job 70+ → +10 all stats

    active_status_levels: {},
    mastery_levels: {},
    // Rogue/Stalker Plagiarism: the ONE skill currently copied, as
    // { name: <skill constant>, level: <copied rank> } (null = nothing copied).
    // resolvePlayerState folds it into mastery_levels so a copied skill the
    // engine reads passively (Triple Attack's auto-attack proc) actually fires.
    plagiarized_skill: null,

    server: "payon_stories",

    name: "",
    equipped: {},
    refine_levels: {},
    weapon_element: null,
    armor_element: 0,
    target_mob_id: null,

    manual_adj_bonuses: {},

    is_forged: false,
    forge_sc_count: 0,
    forge_ranked: false,
    forge_element: 0,

    lh_is_forged: false,
    lh_forge_sc_count: 0,
    lh_forge_ranked: false,
    lh_forge_element: 0,

    support_buffs: {},
    player_active_scs: {},
    target_debuffs: {},
    song_state: {},
    skill_params: {},
    consumable_buffs: {},

    bonus_matk_flat: 0,
    clan: "",
    selected_pet: "",
    bonus_flee2: 0,
    bonus_maxsp_rate: 0,

    current_hp: null,
    current_sp: null,
    spirit_spheres: 0, // active Monk spirit spheres (+3 ATK each for Monk/Champion)
    // Gunslinger coins in hand (Coin Flip / GS_GLITTERING). Max 10 on PS
    // (wiki.payonstories.com/Flip_the_Coin: "Caster can have maximum 10 coins").
    // A spendable RESOURCE, not a buff — several skills consume coins and scale
    // with how many were spent, Fling most directly.
    gs_coins: 0,

    wildcard_bonuses: {},

    ...overrides,
  };
}

function createWeapon(overrides = {}) {
  return {
    atk: 0,
    refine: 0,
    level: 1,
    element: 0,
    weapon_type: "Unarmed",
    hand: "right",
    aegis_name: "",
    refineable: true,
    forge_sc_count: 0,
    forge_ranked: false,
    ...overrides,
  };
}

function createTarget(overrides = {}) {
  return {
    def_: 0,
    vit: 0,
    size: "Medium",
    race: "Formless",
    element: 0,
    element_level: 1,
    is_boss: false,
    level: 1,
    luk: 0,
    agi: 0,
    is_pc: false,
    race2: [], // RC2 monster-family memberships (e.g. ["RC2_Orc"]) — used by bAddRace2 "Bane" cards
    targeted_count: 1,
    sub_race: {},
    sub_ele: {},
    sub_size: {},
    near_attack_def_rate: 0,
    long_attack_def_rate: 0,
    magic_def_rate: 0,
    mdef_: 0,
    int_: 0,
    armor_element: 0,
    flee: 0,
    str: 0,
    dex: 0,
    hit: 0,
    def_percent: 100,
    mdef_percent: 100,
    matk_percent: 100,
    aspd_rate: 1000,
    target_active_scs: {},
    // Declared for shape only — nothing in the pipeline reads either. The Mailbreaker
    // debuff (+10% damage taken, from Venom Dust or Hammer Fall) is applied to the
    // finished result in routes/calculate.ts, not as a target flag. `venom_dust` is
    // its pre-rename name.
    mailbreaker: false,
    venom_dust: false,
    raided: false,
    ...overrides,
  };
}

function createStatusData(overrides = {}) {
  return {
    str: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0,
    batk: 0,
    def_: 0,
    def2: 0,
    cri: 0,
    hit: 0,
    flee: 0,
    flee2: 0,
    aspd: 0.0,
    max_hp: 0,
    max_sp: 0,
    matk_min: 0,
    matk_max: 0,
    mdef: 0,
    mdef2: 0,
    def_percent: 100,
    cast_time_reduction_pct: 0,
    after_cast_delay_reduction_pct: 0,
    cast_time_penalty_pct: 0,
    sp_cost_reduction_pct: 0,
    hp_regen: 0,
    sp_regen: 0,
    sources: {},
    ...overrides,
  };
}

function createGearBonuses(overrides = {}) {
  return {
    str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0,
    weapon_atk_flat: 0,
    batk: 0,
    matk: 0, // flat MATK from gear (bMatk) — added to bonus_matk_flat in applyGearBonuses
    hit: 0,
    flee: 0,
    flee2: 0,
    cri: 0,
    crit_atk_rate: 0,
    long_atk_rate: 0,
    def_: 0,
    def2: 0,
    mdef_: 0,
    maxhp: 0,
    maxsp: 0,
    maxhp_rate: 0,
    maxsp_rate: 0,
    matk_rate: 0,
    heal_power: 0, // bHealPower — % boost to Heal (and offensive Heal / heal bomb)
    crit_heal_permille: 0, // bCritHeal — per-mille of a CRIT's damage healed back (Crescent Scythe: 1 per refine)
    magnum_linger_pct: 0,  // bMagnumLinger — Magnum Break lingering fire % (Wootan Fighter Card raises 20 → 30)
    magnum_element: null,  // bMagnumEle — Ardent Helm turns Magnum Break's hit Holy (null = the skill's own Fire)
    auto_mammonite_no_zeny: 0, // bAutoMammoniteNoZeny — Pirate Skel + Flame Beetle combo: the autocast Mammonite ignores Zeny Pincher
    sp_recov_rate: 0,
    hp_recov_rate: 0,
    res_eff: {},
    script_atk_ele_rh: null,
    script_atk_ele_lh: null,
    script_def_ele: null,
    aspd_percent: 0,
    aspd_add: 0,
    all_effects: [],
    sc_effects: [],
    add_race: {},
    crit_add_race: {}, // bCriticalAddRace: +crit points vs a race/boss group (applied in critChance)
    add_damage_class: {}, // bAddDamageClass: +% physical damage vs a specific monster id (applied in cardFix)
    magic_add_race: {},
    magic_add_ele: {},
    sub_ele: {},
    sub_race: {},
    sub_size: {},  // bSubSize: % damage reduction from a monster SIZE (Stone Buckler, Penomena's sibling cards)
    add_size: {},
    add_ele: {},
    add_atk_ele: {},
    add_type: 0, // monster-family (bAddRace2/RC2) % damage from the wildcard "Type" mix (applies unconditionally)
    add_race2: {}, // real bAddRace2 "Bane" cards, keyed by RC2 family (e.g. RC2_Orc) — applied only when the target is in that family
    no_sizefix: false, // bNoSizeFix (Drake Card): physical damage ignores the target's size penalty
    ignore_def_rate: {},
    ignore_def_ele: {},
    ignore_mdef_rate: {},
    skill_atk: {},
    skill_heal: {},          // bSkillHeal — per-skill heal % (e.g. AL_HEAL from Sacred Saints Robe)
    heal_bomb_full: 0,       // Purifying Ring + Rosary combo — offensive Heal deals 100% (not 50%) to Undead
    double_rate: 0,
    holy_strike_bonus_chance: 0,
    near_atk_def_rate: 0,
    long_atk_def_rate: 0,
    magic_def_rate: 0,
    atk_rate: 0,
    weapon_atk_rate: {},
    def_ratio_atk_ele: {},
    def_ratio_atk_race: {},
    autocast_on_attack: [],
    autocast_on_skill: [],
    autocast_when_hit: [],
    active_combo_descriptions: [],
    castrate: 0,
    delayrate: 0,
    skill_castrate: {},
    skill_delayrate: {},
    skill_cooldown: {},  // bSkillCooldown — flat ms change to a skill's fixed cooldown (FUEL Card: −2000 on Demonstration)
    skill_grants: {},
    effective_mastery: {},
    auto_bonuses: [],
    from_cards: null,
    ...overrides,
  };
}

function createCalcContext(overrides = {}) {
  return {
    skill_levels: {},
    skill_params: {},
    base_level: 1,
    base_str: 0,
    str_: 1,
    vit: 1,
    dex: 1,
    int_: 1,
    weapon_type: "",
    wave_idx: 0,
    ...overrides,
  };
}

function createSkillInstance(overrides = {}) {
  return {
    id: 0,
    level: 1,
    is_critical_forced: false,
    is_maximize_power: false,
    ignore_size_fix: false,
    name: "",
    nk_ignore_def: false,
    nk_ignore_flee: false,
    ...overrides,
  };
}

function createAttackDefinition(avg_damage, pre_delay, post_delay, chance) {
  return { avg_damage, pre_delay, post_delay, chance };
}

function createItemEffect(overrides = {}) {
  return {
    bonus_type: "",
    arity: 1,
    params: [],
    description: "",
    source_slot: null,
    source_item_id: null,
    ...overrides,
  };
}

function createSCEffect(overrides = {}) {
  return {
    sc_name: "",
    duration_ms: 0,
    val1: 0, val2: 0, val3: 0, val4: 0,
    ...overrides,
  };
}

function createAutocastSpec(overrides = {}) {
  return {
    skill_id: 0,
    skill_name: "",
    skill_level: 1,
    chance_per_mille: 0,
    src_skill_id: null,
    when_hit: false,
    // bonus4 bAutoSpell's ATF_SHORT / ATF_LONG flag: the same card can carry two
    // specs with DIFFERENT rates for melee and ranged (Corruptor Card is 4% / 2%),
    // so the range the attack was made at picks which one applies.
    melee_only: false,
    ranged_only: false,
    ...overrides,
  };
}

function createDamageStep(opts) {
  const step = {
    name: opts.name,
    value: opts.value,
    min_value: opts.min_value ?? 0,
    max_value: opts.max_value ?? 0,
    multiplier: opts.multiplier ?? 1.0,
    note: opts.note ?? "",
    formula: opts.formula ?? "",
    hercules_ref: opts.hercules_ref ?? "",
    info: opts.info ?? false,
    // Every step's value/min/max is the RUNNING TOTAL after that step. A step that
    // opens a separate sub-track (Grand Cross' magic half) sets track_start so the
    // frontend doesn't read the jump as a change to the previous total.
    track_start: opts.track_start ?? false,
  };
  if (step.min_value === 0 && step.max_value === 0) {
    step.min_value = step.value;
    step.max_value = step.value;
  }
  if (!step.formula) step.formula = "N/A (legacy step)";
  if (!step.hercules_ref) step.hercules_ref = "N/A (legacy step)";
  return step;
}

function createDamageResult(overrides = {}) {
  // `add_step` is declared INSIDE the literal, not assigned after it. The engine is
  // plain JS (checkJs is off) but its inferred types still reach the .ts routes, and
  // TS types `result` from this initializer alone — a property attached afterwards is
  // invisible to a TypeScript caller, which broke `npx tsc --noEmit` (and so CI's
  // verify job, which gates deploy) the first time a route called result.add_step().
  // It stays after the spread so an `overrides` key can never clobber it.
  const result = {
    min_damage: 0,
    max_damage: 0,
    avg_damage: 0,
    crit_chance: 0.0,
    hit_chance: 0.0,
    steps: [],
    pmf: {},
    ...overrides,
    add_step(opts) {
      result.steps.push(createDamageStep(opts));
    },
  };
  return result;
}

function createBattleResult(overrides = {}) {
  return {
    normal: createDamageResult(),
    crit: null,
    crit_chance: 0.0,
    hit_chance: 100.0,
    perfect_dodge: 0.0,
    magic: null,
    katar_second: null,
    katar_second_crit: null,
    katar_proc_chance: 0.0,
    proc_chance: 0.0,
    double_hit: null,
    double_hit_crit: null,
    second_hit: null,
    second_hit_crit: null,
    lh_normal: null,
    lh_crit: null,
    dw_lh_normal: null,
    dw_lh_crit: null,
    dw_rh_factor: null,
    dw_lh_factor: null,
    dw_ps_bonus_pct: null,
    proc_branches: {},
    proc_chances: {},
    proc_labels: {},
    dps: 0.0,
    attacks: [],
    period_ms: 0.0,
    dps_valid: true,
    ...overrides,
  };
}

module.exports = {
  RANGED_WEAPON_TYPES,
  createPlayerBuild,
  createWeapon,
  createTarget,
  createStatusData,
  createGearBonuses,
  createCalcContext,
  createSkillInstance,
  createAttackDefinition,
  createItemEffect,
  createSCEffect,
  createAutocastSpec,
  createDamageStep,
  createDamageResult,
  createBattleResult,
};
