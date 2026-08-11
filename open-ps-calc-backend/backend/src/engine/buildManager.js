/**
 * buildManager.js — JS port of core/build_manager.py
 *
 * Save/load schema conversion and item-ID -> Weapon resolution.
 * "Save/load" here means: serialize to/from the same JSON shape the
 * original GUI used, which is also the shape persisted in the builds DB table.
 */
const { createPlayerBuild, createTarget, RANGED_WEAPON_TYPES } = require("./models");
const { resolveArmorElement } = require("./buildApplicator");
const { getProfile } = require("./serverProfiles");

// Blacksmith-forgeable weapon item IDs (star-crumb forge list, ratemyserver.net
// creation_db op=3). The star-crumb/forge ATK bonus applies only to these, so
// stale forge data on a non-forgeable weapon (e.g. from an old share URL after a
// weapon swap) is ignored. Keep in sync with FORGEABLE_WEAPON_IDS in the frontend
// BuildEditor.tsx.
const FORGEABLE_WEAPON_IDS = new Set([
  1101, 1104, 1107, 1110, 1113, 1116, 1119, 1122, 1123, 1126, 1129, 1151, 1154, 1157, 1160, 1163,
  1201, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1301, 1351, 1354, 1357, 1360, 1401, 1404, 1407,
  1410, 1451, 1454, 1457, 1460, 1463, 1501, 1504, 1507, 1510, 1513, 1516, 1519, 1522, 1801, 1803,
  1805, 1807, 1809, 1811,
]);

function effectiveIsRanged(build, weapon) {
  if (build.is_ranged_override !== null && build.is_ranged_override !== undefined) {
    return build.is_ranged_override;
  }
  return RANGED_WEAPON_TYPES.has(weapon.weapon_type);
}

function buildToSaveSchema(build, loader) {
  const data = {
    name: build.name,
    job_id: build.job_id,
    base_level: build.base_level,
    job_level: build.job_level,
    base_stats: {
      str: build.base_str, agi: build.base_agi, vit: build.base_vit,
      int: build.base_int, dex: build.base_dex, luk: build.base_luk,
    },
    bonus_stats: {
      str: build.bonus_str, agi: build.bonus_agi, vit: build.bonus_vit,
      int: build.bonus_int, dex: build.bonus_dex, luk: build.bonus_luk,
      hit: build.bonus_hit, flee: build.bonus_flee, cri: build.bonus_cri,
      batk: build.bonus_batk, def: build.equip_def, def2: build.bonus_def2,
      aspd_percent: build.bonus_aspd_percent,
    },
    target_mob_id: build.target_mob_id,
    equipped: build.equipped,
    refine: build.refine_levels,
    forge: build.forge || {},
    weapon_element: build.weapon_element,
    active_buffs: build.active_status_levels,
    mastery_levels: build.mastery_levels,
    flags: {
      is_ranged_override: build.is_ranged_override,
      is_riding_peco: build.is_riding_peco,
      no_sizefix: build.no_sizefix,
      armor_element: build.armor_element,
      spirit_spheres: build.spirit_spheres,
      sn_never_died: build.sn_never_died,
      plagiarism: build.plagiarized_skill,
    },
    server: build.server,
    manual_adj: { ...build.manual_adj_bonuses },
    support_buffs: { ...build.support_buffs },
    player_active_scs: { ...build.player_active_scs },
    song_state: { ...build.song_state },
    consumable_buffs: { ...build.consumable_buffs },
    clan: build.clan,
    selected_pet: build.selected_pet,
  };

  if (loader) {
    const jobEntry = loader.getJobEntry(build.job_id);
    const jobName = jobEntry ? jobEntry.name : "";
    const effectiveVit = build.base_vit + build.bonus_vit;
    let hpBase = 0;
    try {
      hpBase = loader.getHpAtLevel(build.job_id, build.base_level);
    } catch {
      hpBase = 0;
    }
    data.cached_display = {
      job_name: jobName,
      hp: Math.floor((hpBase * (100 + effectiveVit)) / 100) + build.bonus_maxhp,
      def_: build.equip_def,
      mdef: build.equip_mdef,
    };
  }

  return data;
}

function buildFromSaveSchema(data) {
  const bs = data.base_stats || {};
  const bn = data.bonus_stats || {};
  const flags = data.flags || {};
  let equipped = data.equipped || {};
  // Forged-weapon Star Crumb bonus on the right-hand weapon (VS/VVS/VVVS = 1/2/3
  // crumbs). Fed to the engine's forge fields; the raw map round-trips via save.
  const rhForge = (data.forge || {}).right_hand || {};
  const rhForgeSc = Math.max(0, Math.min(3, Number(rhForge.sc) || 0));
  const rhForgeRanked = !!rhForge.ranked;
  // Elemental forge: a Blacksmith forges with an elemental stone (Flame Heart →
  // Fire, Mystic Frozen → Water, Rough Wind → Wind, Great Nature → Earth), so the
  // weapon comes out Fire/Water/Wind/Earth. Those four are the only forgeable
  // elements — 1..4 in the engine's element ints (Water/Earth/Fire/Wind), 0 = the
  // ordinary Neutral forge. An element ALONE makes the weapon forged: you can
  // forge a plain Fire Katana with no Star Crumbs in it at all.
  const rhForgeEle = Math.max(0, Math.min(4, Number(rhForge.ele) || 0));
  // A forged weapon cannot hold cards: the forge writes the crafter's signature and
  // the crumb/element data into the item's card slots, so there is no room for one.
  // The editor hides the pickers, but a build shared before that (or an API caller)
  // can still arrive carrying both — drop the cards rather than price a weapon that
  // can't exist. Only the right hand is forgeable here, matching the editor.
  if ((rhForgeSc > 0 || rhForgeRanked || rhForgeEle > 0) && FORGEABLE_WEAPON_IDS.has(equipped.right_hand)) {
    equipped = { ...equipped };
    for (let i = 1; i <= 4; i++) delete equipped[`right_hand_card${i}`];
  }

  let activeBuffs = { ...(data.active_buffs || {}) };
  let supportBuffs = { ...(data.support_buffs || {}) };
  if ("SC_ADRENALINE" in activeBuffs && !("SC_ADRENALINE" in supportBuffs)) {
    supportBuffs = { ...supportBuffs, SC_ADRENALINE: activeBuffs.SC_ADRENALINE };
    delete activeBuffs.SC_ADRENALINE;
  }

  let songState = { ...(data.song_state || {}) };
  if ("SC_ASSNCROS" in activeBuffs && !("SC_ASSNCROS" in songState)) {
    songState = { ...songState, SC_ASSNCROS: activeBuffs.SC_ASSNCROS };
    delete activeBuffs.SC_ASSNCROS;
  }

  return createPlayerBuild({
    name: data.name || "",
    job_id: data.job_id || 0,
    base_level: data.base_level ?? 1,
    job_level: data.job_level ?? 1,
    base_str: bs.str ?? 1, base_agi: bs.agi ?? 1, base_vit: bs.vit ?? 1,
    base_int: bs.int ?? 1, base_dex: bs.dex ?? 1, base_luk: bs.luk ?? 1,
    bonus_str: bn.str ?? 0, bonus_agi: bn.agi ?? 0, bonus_vit: bn.vit ?? 0,
    bonus_int: bn.int ?? 0, bonus_dex: bn.dex ?? 0, bonus_luk: bn.luk ?? 0,
    bonus_hit: bn.hit ?? 0, bonus_flee: bn.flee ?? 0, bonus_cri: bn.cri ?? 0,
    bonus_batk: bn.batk ?? 0,
    equip_def: bn.def ?? 0,
    bonus_def2: bn.def2 ?? 0,
    bonus_aspd_percent: bn.aspd_percent ?? 0,
    target_mob_id: data.target_mob_id ?? null,
    equipped,
    refine_levels: data.refine || {},
    weapon_element: data.weapon_element ?? null,
    forge: data.forge || {},
    is_forged: rhForgeSc > 0 || rhForgeRanked || rhForgeEle > 0,
    forge_sc_count: rhForgeSc,
    forge_ranked: rhForgeRanked,
    forge_element: rhForgeEle,
    active_status_levels: activeBuffs,
    mastery_levels: data.mastery_levels || {},
    is_ranged_override: flags.is_ranged_override ?? null,
    is_riding_peco: flags.is_riding_peco ?? false,
    no_sizefix: flags.no_sizefix ?? false,
    sn_never_died: flags.sn_never_died ?? false,
    armor_element: flags.armor_element ?? 0,
    spirit_spheres: flags.spirit_spheres ?? 0,
    // Plagiarism (Rogue/Stalker): { name, level }. Rides in `flags` so it
    // round-trips through the existing share-URL key rather than needing a new
    // positional Z3 code. Anything malformed is treated as "nothing copied".
    plagiarized_skill: (flags.plagiarism && flags.plagiarism.name)
      ? { name: String(flags.plagiarism.name), level: Math.max(0, Number(flags.plagiarism.level) || 0) }
      : null,
    force_procs: flags.force_procs ?? false,
    server: data.server || "payon_stories",
    manual_adj_bonuses: data.manual_adj || {},
    support_buffs: supportBuffs,
    player_active_scs: data.player_active_scs || {},
    song_state: songState,
    consumable_buffs: data.consumable_buffs || {},
    clan: data.clan || "",
    selected_pet: data.selected_pet || "",
    wildcard_bonuses: data.wildcard_bonuses || {},
  });
}

function playerBuildToTarget(build, status, gearBonuses, weapon, loader) {
  const playerScs = build.player_active_scs || {};
  const targetScs = {};
  for (const sc of ["SC_STUN", "SC_FREEZE", "SC_STONE", "SC_SLEEP", "SC_ETERNALCHAOS"]) {
    if (playerScs[sc]) targetScs[sc] = Number(playerScs[sc]);
  }

  const baseArmorEle = resolveArmorElement(build.armor_element, gearBonuses);
  let element = baseArmorEle;
  if (playerScs.SC_FREEZE) element = 1; // Ele_Water
  else if (playerScs.SC_STONE) element = 2; // Ele_Earth

  const subEle = { ...gearBonuses.sub_ele };
  const skintemperLv = gearBonuses.effective_mastery.BS_SKINTEMPER || 0;
  if (skintemperLv) {
    if (build.server === "payon_stories") {
      subEle.Ele_Neutral = (subEle.Ele_Neutral || 0) + 4 * skintemperLv;
      subEle.Ele_Fire = (subEle.Ele_Fire || 0) + 6 * skintemperLv;
    } else {
      subEle.Ele_Neutral = (subEle.Ele_Neutral || 0) + skintemperLv;
      subEle.Ele_Fire = (subEle.Ele_Fire || 0) + 4 * skintemperLv;
    }
  }
  if (build.server === "payon_stories" && gearBonuses.effective_mastery.WZ_ESTIMATION) {
    for (const k of ["Ele_Fire", "Ele_Water", "Ele_Wind", "Ele_Earth"]) {
      subEle[k] = (subEle[k] || 0) + 2;
    }
  }

  const profile = getProfile(build.server);
  const weaponType = weapon != null ? weapon.weapon_type : null;
  for (const [skillKey, rspec] of Object.entries(profile.passive_resists || {})) {
    const lv = gearBonuses.effective_mastery[skillKey] || 0;
    if (lv < (rspec.max_level ?? 10)) continue;
    const wtReq = rspec.weapon_types;
    if (wtReq && !wtReq.includes(weaponType)) continue;
    for (const [eleKey, pct] of Object.entries(rspec.sub_ele_at_max_lv || {})) {
      subEle[eleKey] = (subEle[eleKey] || 0) + pct;
    }
  }

  return createTarget({
    def_: status.def_,
    vit: status.vit,
    level: build.base_level,
    is_pc: true,
    size: "Medium",
    race: "Demi-Human",
    element,
    armor_element: baseArmorEle,
    element_level: 1,
    luk: status.luk,
    agi: status.agi,
    flee: status.flee,
    mdef_: status.mdef,
    int_: status.int_,
    sub_race: { ...gearBonuses.sub_race },
    sub_ele: subEle,
    sub_size: {},
    near_attack_def_rate: gearBonuses.near_atk_def_rate,
    long_attack_def_rate: gearBonuses.long_atk_def_rate,
    magic_def_rate: gearBonuses.magic_def_rate,
    def_percent: status.def_percent,
    target_active_scs: targetScs,
  });
}

function resolveWeapon(loader, itemId, refine = 0, elementOverride = null, opts = {}) {
  const { is_forged = false, forge_sc_count = 0, forge_ranked = false, forge_element = 0, script_atk_ele_rh = null } = opts;
  const { createWeapon } = require("./models");

  if (itemId == null) return createWeapon();

  const item = loader.getItem(itemId);
  if (item == null) return createWeapon();

  // Only genuinely forgeable weapons carry a star-crumb forge bonus.
  const forgeable = FORGEABLE_WEAPON_IDS.has(itemId);
  const forged = is_forged && forgeable;

  let element;
  if (elementOverride != null) element = elementOverride;
  else if (script_atk_ele_rh != null) element = script_atk_ele_rh;
  else if (forged) element = forge_element;
  else element = item.element ?? 0;

  return createWeapon({
    atk: item.atk || 0,
    refine,
    level: item.level ?? 1,
    element,
    weapon_type: item.weapon_type || "Unarmed",
    hand: "right",
    aegis_name: item.aegis_name || "",
    refineable: item.refineable ?? true,
    forge_sc_count: forged ? forge_sc_count : 0,
    forge_ranked: forged ? forge_ranked : false,
  });
}

module.exports = {
  effectiveIsRanged,
  buildToSaveSchema,
  buildFromSaveSchema,
  playerBuildToTarget,
  resolveWeapon,
};
