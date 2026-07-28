/**
 * buildApplicator.js — JS port of core/build_applicator.py
 *
 * Stacking logic for gear scripts, manual adjustments, consumable buffs,
 * clan bonuses, pet bonuses, and weapon endow onto a PlayerBuild.
 */

function computeConsumableBonuses(consumableBuffs) {
  const cb = consumableBuffs;
  const result = {};

  const foodAll = Number(cb.food_all || 0);
  const grilledCorn = Boolean(cb.grilled_corn);
  const gc = grilledCorn ? 2 : 0;

  const strFood = Math.max(Number(cb.food_str || 0), foodAll, gc);
  const agiFood = Math.max(Number(cb.food_agi || 0), foodAll, gc);
  const vitFood = Math.max(Number(cb.food_vit || 0), foodAll);
  const intFood = Math.max(Number(cb.food_int || 0), foodAll, gc);
  const dexFood = Math.max(Number(cb.food_dex || 0), foodAll);
  const lukFood = Math.max(Number(cb.food_luk || 0), foodAll);

  if (strFood) result.str = strFood;
  if (agiFood) result.agi = agiFood;
  if (vitFood) result.vit = vitFood;
  if (intFood) result.int = intFood;
  if (dexFood) result.dex = dexFood;
  if (lukFood) result.luk = lukFood;

  const ASPD_VALS = [0, 10, 15, 20];
  const aspdPotion = Number(cb.aspd_potion || 0);
  if (aspdPotion) result.aspd_percent = ASPD_VALS[aspdPotion];

  const hitFood = Number(cb.hit_food || 0);
  if (hitFood) result.hit = hitFood;

  const fleeFood = Number(cb.flee_food || 0);
  if (fleeFood) result.flee = fleeFood;

  if (cb.cri_food) result.cri = 7;

  let atkItem = Number(cb.atk_item || 0);
  if (cb.box_resentment) atkItem += 20; // Box of Resentment: sc_start SC_PLUSATTACKPOWER,,20
  if (atkItem) result.batk = atkItem;

  let matkFlat = Number(cb.matk_item || 0);
  if (cb.matk_food) matkFlat += 10;
  if (cb.box_drowsiness) matkFlat += 20; // Box of Drowsiness: sc_start SC_PLUSMAGICPOWER,,20
  if (matkFlat) result.matk_flat = matkFlat;

  return result;
}

const ENDOW_SC_ELEMENT = {
  SC_PROPERTYFIRE: 3,
  SC_PROPERTYWATER: 1,
  SC_PROPERTYWIND: 4,
  SC_PROPERTYGROUND: 2,
  // AS_ENCHANTPOISON (Assassin self-buff) and Cursed Water (item ->
  // ITEM_ENCHANTARMS skill lv 8, see item_db.json #12020) both endow the
  // weapon too, just via different sources -- exposed through the same
  // dropdown/field as the Priest endows for a single, consistent UI control.
  SC_ENCHANTPOISON: 5,
  SC_ENCHANTARMS: 7,
};

function applyWeaponEndow(effBuild) {
  if ("SC_ENCHANTPOISON" in effBuild.active_status_levels) {
    effBuild.weapon_element = 5; // Poison
  } else {
    const endowSc = effBuild.support_buffs.weapon_endow_sc;
    if (endowSc) {
      effBuild.weapon_element = ENDOW_SC_ELEMENT[endowSc];
    } else if (effBuild.support_buffs.SC_ASPERSIO) {
      effBuild.weapon_element = 6; // Holy
    }
  }
}

const CLAN_STATS = {
  sword_clan: { str: 1, vit: 1, maxhp: 30, maxsp: 10 },
  arch_wand_clan: { int: 1, dex: 1, maxhp: 30, maxsp: 10 },
  golden_mace_clan: { int: 1, vit: 1, maxhp: 30, maxsp: 10 },
  crossbow_clan: { dex: 1, agi: 1, maxhp: 30, maxsp: 10 },
  artisan_clan: { dex: 1, luk: 1, maxhp: 30, maxsp: 10 },
  vile_wind_clan: { str: 1, agi: 1, maxhp: 30, maxsp: 10 },
};

function applyGearBonuses(build, gearBonuses) {
  const gb = gearBonuses;
  const ma = build.manual_adj_bonuses;
  const cons = computeConsumableBonuses(build.consumable_buffs);
  const cl = CLAN_STATS[build.clan] || {};

  // Box of Gloom casts Improve Concentration (AC_CONCENTRATION) Lv1 → SC_CONCENTRATION
  // (+3% AGI/DEX on base stats). Merge it in without downgrading a higher level the
  // character already has from the buff picker.
  let activeStatusLevels = build.active_status_levels;
  if (build.consumable_buffs && build.consumable_buffs.box_gloom) {
    const cur = activeStatusLevels.SC_CONCENTRATION || 0;
    activeStatusLevels = { ...activeStatusLevels, SC_CONCENTRATION: Math.max(cur, 1) };
  }

  return {
    ...build,
    active_status_levels: activeStatusLevels,
    bonus_str: build.bonus_str + gb.str_ + (ma.str || 0) + (cons.str || 0) + (cl.str || 0),
    bonus_agi: build.bonus_agi + gb.agi + (ma.agi || 0) + (cons.agi || 0) + (cl.agi || 0),
    bonus_vit: build.bonus_vit + gb.vit + (ma.vit || 0) + (cons.vit || 0) + (cl.vit || 0),
    bonus_int: build.bonus_int + gb.int_ + (ma.int || 0) + (cons.int || 0) + (cl.int || 0),
    bonus_dex: build.bonus_dex + gb.dex + (ma.dex || 0) + (cons.dex || 0) + (cl.dex || 0),
    bonus_luk: build.bonus_luk + gb.luk + (ma.luk || 0) + (cons.luk || 0) + (cl.luk || 0),
    bonus_batk: build.bonus_batk + gb.batk + (ma.batk || 0) + (cons.batk || 0),
    bonus_hit: build.bonus_hit + gb.hit + (ma.hit || 0) + (cons.hit || 0),
    bonus_flee: build.bonus_flee + gb.flee + (ma.flee || 0) + (cons.flee || 0),
    bonus_cri: build.bonus_cri + gb.cri + (ma.cri || 0) + (cons.cri || 0),
    equip_def: build.equip_def + gb.def_ + (ma.def || 0),
    bonus_def2: build.bonus_def2 + gb.def2,
    equip_mdef: build.equip_mdef + gb.mdef_ + (ma.mdef || 0),
    bonus_maxhp: build.bonus_maxhp + gb.maxhp + (ma.maxhp || 0) + (cl.maxhp || 0),
    bonus_maxsp: build.bonus_maxsp + gb.maxsp + (ma.maxsp || 0) + (cl.maxsp || 0),
    bonus_aspd_percent: build.bonus_aspd_percent + gb.aspd_percent + (ma.aspd_pct || 0) + (cons.aspd_percent || 0),
    bonus_aspd_add: build.bonus_aspd_add + gb.aspd_add,
    bonus_crit_atk_rate: build.bonus_crit_atk_rate + gb.crit_atk_rate + (ma.crit_dmg_pct || 0),
    bonus_matk_rate: build.bonus_matk_rate + gb.matk_rate,
    bonus_maxhp_rate: build.bonus_maxhp_rate + gb.maxhp_rate,
    bonus_flee2: build.bonus_flee2 + gb.flee2,
    bonus_maxsp_rate: build.bonus_maxsp_rate + gb.maxsp_rate,
    bonus_matk_flat: build.bonus_matk_flat + gb.matk + (cons.matk_flat || 0),
    // Drake Card (bNoSizeFix) or a saved build flag: ignore the size penalty.
    no_sizefix: build.no_sizefix || !!gb.no_sizefix,
  };
}

function applyPetBonuses(gb, petKey, profile) {
  if (!petKey) return;
  const PET_BONUSES = {}; // NOT YET PORTED: core/data/pets.py (no pets defined upstream beyond profile overrides)
  const bonus = (profile.pet_bonuses || {})[petKey] || PET_BONUSES[petKey] || {};
  if (!Object.keys(bonus).length) return;

  gb.str_ += bonus.str_ || 0;
  gb.agi += bonus.agi || 0;
  gb.vit += bonus.vit || 0;
  gb.int_ += bonus.int_ || 0;
  gb.dex += bonus.dex || 0;
  gb.luk += bonus.luk || 0;
  // Pet loyalty AGI/DEX are equipment-like stat bonuses (pc_bonus in Hercules), so
  // Improve Concentration must NOT scale them — it excludes all equipment/card/pet
  // AGI/DEX (param_bonus[4], status.c). from_cards is the engine's IC-exclusion pool
  // (statusCalculator.js), so mirror the pet AGI/DEX into it.
  if (gb.from_cards) {
    gb.from_cards.agi += bonus.agi || 0;
    gb.from_cards.dex += bonus.dex || 0;
  }
  gb.batk += bonus.batk || 0;
  gb.hit += bonus.hit || 0;
  gb.flee += bonus.flee || 0;
  gb.flee2 += bonus.flee2 || 0;
  gb.cri += bonus.cri || 0;
  gb.def_ += bonus.def_ || 0;
  gb.mdef_ += bonus.mdef_ || 0;
  gb.maxhp += bonus.maxhp || 0;
  gb.maxsp += bonus.maxsp || 0;
  gb.atk_rate += bonus.atk_rate || 0;
  gb.matk_rate += bonus.matk_rate || 0;
  gb.aspd_percent += bonus.aspd_percent || 0;
  gb.crit_atk_rate += bonus.crit_atk_rate || 0;
  gb.maxhp_rate += bonus.maxhp_rate || 0;
  gb.maxsp_rate += bonus.maxsp_rate || 0;
  gb.castrate += bonus.castrate || 0;
  for (const [k, v] of Object.entries(bonus.sub_ele || {})) gb.sub_ele[k] = (gb.sub_ele[k] || 0) + v;
  for (const [k, v] of Object.entries(bonus.add_ele || {})) gb.add_ele[k] = (gb.add_ele[k] || 0) + v;
  for (const [k, v] of Object.entries(bonus.sub_race || {})) gb.sub_race[k] = (gb.sub_race[k] || 0) + v;
  for (const [k, v] of Object.entries(bonus.add_race || {})) gb.add_race[k] = (gb.add_race[k] || 0) + v;
  for (const [k, v] of Object.entries(bonus.magic_add_race || {})) gb.magic_add_race[k] = (gb.magic_add_race[k] || 0) + v;
  for (const [k, v] of Object.entries(bonus.res_eff || {})) gb.res_eff[k] = (gb.res_eff[k] || 0) + v;
}

function resolveArmorElement(armorElementOverride, gearBonuses) {
  if (armorElementOverride !== 0) return armorElementOverride;
  if (gearBonuses.script_def_ele != null) return gearBonuses.script_def_ele;
  return 0;
}

module.exports = {
  computeConsumableBonuses,
  applyWeaponEndow,
  applyGearBonuses,
  applyPetBonuses,
  resolveArmorElement,
};
