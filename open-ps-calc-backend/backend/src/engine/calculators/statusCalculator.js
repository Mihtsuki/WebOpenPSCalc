/**
 * statusCalculator.js — JS port of core/calculators/status_calculator.py
 *
 * Computes all derived player stats (BATK, HIT, FLEE, CRI, ASPD, MaxHP,
 * MaxSP, MATK, MDEF, DEF, regen) from a resolved PlayerBuild + Weapon +
 * GearBonuses. Pre-renewal formulas only.
 */
const { effectiveIsRanged } = require("../buildManager");
const { loader } = require("../dataLoader");
const { createStatusData } = require("../models");
const { getProfile } = require("../serverProfiles");

const GUN_WEAPON_TYPES = new Set(["Revolver", "Rifle", "Gatling", "Shotgun", "Grenade"]);
// Weapons Adrenaline Rush was restricted to in vanilla, and the classes that still
// get its FULL bonus after the PS rework (30% self / 20% party; every other melee
// weapon gets 20%/10%).
const ADRENALINE_WEAPONS = new Set(["1HAxe", "2HAxe", "Mace", "2HMace"]);
const BOW_GUN_WEAPONS = new Set(["Bow", "Revolver", "Rifle", "Gatling", "Shotgun", "Grenade"]);
const TF_MISS_JOBL2 = new Set([12, 17, 4013, 4018]);
const DUAL_WIELD_JOBS = new Set([12, 4013]);
const DELUGE_EFF = [5, 9, 12, 14, 15];
const PS_VG_FLEE = [3, 8, 15];
const PS_VOL_MATK_PCT = [2, 4, 6];
const PS_VOL_ATK = [10, 20, 30];

class StatusCalculator {
  constructor(config) {
    this.config = config;
  }

  calculate(build, weapon, gb = null) {
    const status = createStatusData();
    const profile = getProfile(build.server);
    const mastery = gb != null ? gb.effective_mastery : build.mastery_levels;

    const jb = loader.getJobBonusStats(build.job_id, build.job_level, profile);

    status.str = build.base_str + build.bonus_str + jb.str_;
    status.agi = build.base_agi + build.bonus_agi + jb.agi;
    status.vit = build.base_vit + build.bonus_vit + jb.vit;
    status.int_ = build.base_int + build.bonus_int + jb.int_;
    status.dex = build.base_dex + build.bonus_dex + jb.dex;
    status.luk = build.base_luk + build.bonus_luk + jb.luk;

    // Super Novice: reaching job level 70+ without ever dying grants +10 to
    // all stats, lost on the next death (wiki.payonstories.com/Super_Novice —
    // a vanilla SN mechanic). Toggled via flags.sn_never_died.
    if (build.job_id === 23 && build.sn_never_died && build.job_level >= 70) {
      status.str += 10; status.agi += 10; status.vit += 10;
      status.int_ += 10; status.dex += 10; status.luk += 10;
    }

    const support = build.support_buffs;
    const activeSc = build.active_status_levels;

    // === PASSIVE SKILL STAT BONUSES ===
    if (mastery.BS_HILTBINDING) status.str += 1;
    const saDragonologyLv = mastery.SA_DRAGONOLOGY || 0;
    if (saDragonologyLv) status.int_ += Math.floor((saDragonologyLv + 1) / 2);
    const acOwlLv = mastery.AC_OWL || 0;
    if (acOwlLv) status.dex += acOwlLv;

    // === SC STAT MODIFIERS ===
    // Crazy Uproar (MC_LOUD). Vanilla: a 1-rank +4 STR shout. PS Merchant rework
    // (Merchant 2026-08-09 PDF): 4 ranks granting +1 STR **and +1 VIT** per level to
    // the caster (the soft-DEF half is in the DEFENSE block below).
    const shoutLv = Number(activeSc.SC_SHOUT || 0);
    if (shoutLv) {
      if (profile.mechanic_flags.has("MC_LOUD_PS_REWORK")) {
        status.str += shoutLv;
        status.vit += shoutLv;
      } else {
        status.str += 4;
      }
    }

    if ("SC_NJ_NEN" in activeSc) {
      const lv = activeSc.SC_NJ_NEN;
      const nenSpec = (profile.passive_overrides || {}).SC_NJ_NEN || {};
      status.str += lv * (nenSpec.str_per_lv ?? 1);
      status.int_ += lv * (nenSpec.int_per_lv ?? 1);
    }

    if ("SC_CONCENTRATION" in activeSc && !("SC_QUAGMIRE" in build.player_active_scs)) {
      const lv = activeSc.SC_CONCENTRATION;
      const val2 = 2 + lv;
      const cards = gb != null ? gb.from_cards : null;
      status.agi += Math.floor((status.agi - (cards ? cards.agi : 0)) * val2 / 100);
      status.dex += Math.floor((status.dex - (cards ? cards.dex : 0)) * val2 / 100);
    }

    const blessingLv = support.SC_BLESSING || 0;
    if (blessingLv) {
      status.str += blessingLv;
      status.int_ += blessingLv;
      status.dex += blessingLv;
    }

    const incAgiLv = support.SC_INC_AGI || 0;
    if (incAgiLv) status.agi += 2 + incAgiLv;

    if (support.SC_GLORIA) status.luk += 30;

    // Increasing Accuracy (SC_GS_ACCURACY) was removed on Payon Stories (folded into
    // Single Action); its buff has no effect there.
    if ("SC_GS_ACCURACY" in activeSc && !profile.mechanic_flags.has("GS_INCREASING_REMOVED")) {
      status.agi += 4;
      status.dex += 4;
    }

    const playerScs = build.player_active_scs;
    if ("SC_DECREASEAGI" in playerScs) status.agi -= 2 + playerScs.SC_DECREASEAGI;
    if ("SC_CURSE" in playerScs) status.luk = 0;

    // === BASE ATK ===
    let strVal = status.str;
    let dexVal = status.dex;
    if (effectiveIsRanged(build, weapon)) { const t = strVal; strVal = dexVal; dexVal = t; }
    const dstr = Math.floor(strVal / 10);
    status.batk = strVal + dstr * dstr + Math.floor(dexVal / 5) + Math.floor(status.luk / 5);
    status.batk += build.bonus_batk;

    // Spirit spheres are NOT a base-ATK bonus. PS wiki: each sphere grants +3 ATK
    // "similar to forged weapons imbued with Star Crumb" — a flat, per-hit add that
    // ignores DEF/flee and is affected by cards, not the skill ratio. Modeled in the
    // damage pipeline via calculateSpiritSphereBonus (forgeBonus.js), applied next to
    // the Star Crumb forge bonus. Keeping it out of batk avoids wrongly scaling it by
    // the skill ratio and (on Asura Strike) by ×(8+SP/10).

    if (mastery.BS_HILTBINDING) status.batk += 4;

    // PS Gunslinger — Dust mastery (GS_DUST Lv 10): +1 ATK per STR point (base or
    // bonus) while a Shotgun is equipped. wiki.payonstories.com/Dust.
    const dustSpec = (profile.passive_overrides || {}).GS_DUST;
    if (dustSpec && dustSpec.str_to_atk_at_max_lv
        && (mastery.GS_DUST || 0) >= (dustSpec.max_level || 10)
        && weapon.weapon_type === (dustSpec.str_atk_weapon || "Shotgun")) {
      status.batk += status.str * dustSpec.str_to_atk_at_max_lv;
    }

    if ("SC_GS_MADNESSCANCEL" in activeSc && !("SC_GS_MADNESSCANCEL" in (profile.rate_bonuses || {}))) {
      status.batk += 100;
    }
    if ("SC_GS_GATLINGFEVER" in activeSc && !("SC_GS_GATLINGFEVER" in (profile.rate_bonuses || {}))) {
      const lv = activeSc.SC_GS_GATLINGFEVER;
      status.batk += 20 + 10 * lv;
    }
    // Volcano persistence buff (PS): +10/20/30 flat ATK at Lv1/2/3 — a general
    // ATK bonus, separate from Volcano's +MATK% (MATK section) and +Fire-damage%
    // (AttrFix). Sage Rework doc / wiki.payonstories.com/Volcano.
    if (profile.mechanic_flags.has("GROUND_EFFECT_PS_VALUES") && support.ground_effect === "SC_VOLCANO") {
      const volLv = Number(support.ground_effect_lv || 1);
      status.batk += PS_VOL_ATK[Math.min(volLv, PS_VOL_ATK.length) - 1];
    }
    if ("SC_CURSE" in playerScs) status.batk = Math.floor(status.batk * 75 / 100);

    // Auto Berserk (SM_AUTOBERSERK): while HP < 25% the caster gains a
    // self-cast Provoke Lv10, raising base ATK by Provoke's +32% (2 + 3×10).
    // Presence-only self-buff. Deliberately kept on its own SC key rather than
    // player_active_scs.SC_PROVOKE so it can never be conflated with a Provoke
    // debuff cast on the *target* (that lives on the target object, handled in
    // the calculate route). The matching −55% self-DEF is in the DEFENSE block.
    if ("SC_AUTOBERSERK" in activeSc) {
      status.batk += Math.floor(status.batk * 32 / 100);
    }

    // === DEFENSE ===
    status.def_ = build.equip_def;
    status.def2 = status.vit + build.bonus_def2;

    const angelusLv = Number(support.SC_ANGELUS || 0);
    status.def2 += 3 * angelusLv;                   // PS: flat +3 per level applied first
    status.def_percent = 100 + 10 * angelusLv;      // PS: +10% per level (max lv5 = +50%)

    // Crazy Uproar soft DEF (PS Merchant rework): 3 × level to the caster, 2 × level
    // to party members standing in the buff. Flat, applied alongside Angelus's flat
    // part (before the def_percent multiplier).
    if (profile.mechanic_flags.has("MC_LOUD_PS_REWORK")) {
      if (shoutLv) status.def2 += 3 * shoutLv;
      else status.def2 += 2 * Number(support.SC_SHOUT || 0);
    }

    if ("SC_POISON" in playerScs) {
      const penalty = build.server === "payon_stories" ? 50 : 25;
      status.def_percent = Math.max(0, status.def_percent - penalty);
    }
    if ("SC_PROVOKE" in playerScs) {
      status.def_percent = Math.max(0, status.def_percent - (5 + 5 * Number(playerScs.SC_PROVOKE)));
    }
    // Auto Berserk's self Provoke Lv10 DEF side: −55% (5 + 5×10). See the ATK
    // section above for why this uses SC_AUTOBERSERK and not SC_PROVOKE.
    if ("SC_AUTOBERSERK" in activeSc) {
      status.def_percent = Math.max(0, status.def_percent - 55);
    }
    if ("SC_FLING" in playerScs) {
      status.def_percent = Math.max(0, status.def_percent - 5 * Number(playerScs.SC_FLING));
    }
    if (status.def_percent !== 100) status.def2 = Math.floor(status.def2 * status.def_percent / 100);
    if ("SC_ETERNALCHAOS" in playerScs) status.def2 = 0;

    const alDpLv = mastery.AL_DP || 0;
    if (alDpLv && build.target_mob_id) {
      const alMob = loader.getMonster(build.target_mob_id);
      if (alMob && (alMob.race === "Demon" || alMob.race === "Undead")) {
        status.def2 += alDpLv * (3 + Math.floor((build.base_level + 1) * 4 / 100));
      }
    }

    if ("SC_STEELBODY" in activeSc) {
      if (profile.steelbody_override != null) status.def_ = profile.steelbody_override[0](build.equip_def);
      else status.def_ = 90;
    }

    // === CRITICAL ===
    status.cri = 10 + Math.floor(status.luk * 10 / 3) + build.bonus_cri * 10;

    if ("SC_EXPLOSIONSPIRITS" in activeSc) {
      // Monk Fury is cast at levels 1-5; the Super Novice chant grants it at
      // level 13, which under the PS formula lands on 175 + 25×13 = +50% crit
      // (wiki.payonstories.com/Super_Novice: "critical rate +50").
      const lv = activeSc.SC_EXPLOSIONSPIRITS;
      const expSpec = (profile.passive_overrides || {}).SC_EXPLOSIONSPIRITS || {};
      const criBase   = expSpec.cri_base   ?? 75;
      const criPerLv  = expSpec.cri_per_lv ?? 25;
      status.cri += criBase + criPerLv * lv;
    }

    const katarLv = mastery.AS_KATAR || 0;
    if (weapon.weapon_type === "Katar" && katarLv > 0) {
      const spec = (profile.passive_overrides || {}).AS_KATAR || {};
      status.cri += (spec.cri_per_lv || 0) * katarLv;
    }
    if ((mastery.DC_DANCINGLESSON || 0) >= 10) {
      const spec = (profile.passive_overrides || {}).DC_DANCINGLESSON || {};
      status.cri += spec.cri_at_max_lv || 0;
    }

    // === HIT / FLEE ===
    status.hit = build.base_level + status.dex + build.bonus_hit;
    status.flee = build.base_level + status.agi + build.bonus_flee;
    status.flee2 = this.config.enable_perfect_flee ? status.luk + 10 + build.bonus_flee2 : 0;

    if ("SC_GS_ACCURACY" in activeSc && !profile.mechanic_flags.has("GS_INCREASING_REMOVED")) status.hit += 20;

    if ("SC_GS_ADJUSTMENT" in activeSc) {
      if (!profile.mechanic_flags.has("GS_GS_ADJUSTMENT_SKIP_HIT_PENALTY")) status.hit -= 30;
      status.flee += 30;
    }
    if ("SC_RG_CCONFINE_M" in activeSc) status.flee += 10;
    if ("SC_GS_GATLINGFEVER" in activeSc) {
      const lv = activeSc.SC_GS_GATLINGFEVER;
      const gfQuicken = ((profile.aspd_buffs || {}).SC_GS_GATLINGFEVER || {}).sc_quicken || {};
      if (!gfQuicken.flee_suppress) status.flee -= 5 * lv;
    }

    if (support.ground_effect === "SC_VIOLENTGALE") {
      const vgLv = Number(support.ground_effect_lv || 1);
      let vgFlee;
      if (profile.mechanic_flags.has("GROUND_EFFECT_PS_VALUES")) {
        vgFlee = PS_VG_FLEE[Math.min(vgLv, PS_VG_FLEE.length) - 1];
      } else {
        vgFlee = vgLv * 3;
      }
      status.flee += vgFlee;
    }

    const tqSpec = (profile.passive_overrides || {}).SC_TWOHANDQUICKEN || {};
    if ("SC_TWOHANDQUICKEN" in activeSc) {
      const lv = activeSc.SC_TWOHANDQUICKEN;
      status.flee += (tqSpec.flee_per_lv || 0) * lv;
      status.cri += (tqSpec.cri_per_lv || 0) * lv;
    }
    const sqStatSpec = (profile.passive_overrides || {}).SC_SPEARQUICKEN || {};
    if ("SC_SPEARQUICKEN" in activeSc) {
      const lv = activeSc.SC_SPEARQUICKEN;
      status.cri += (sqStatSpec.cri_per_lv || 0) * lv;
      status.hit += (sqStatSpec.hit_per_lv || 0) * lv;
      status.flee += (sqStatSpec.flee_per_lv || 0) * lv;
    }

    // === PASSIVE SKILL HIT/FLEE BONUSES ===
    const bsWrLv = mastery.BS_WEAPONRESEARCH || 0;
    if (bsWrLv) status.hit += bsWrLv * 2;

    const acVultureLv = mastery.AC_VULTURE || 0;
    if (acVultureLv) status.hit += acVultureLv;

    const gsSaLv = mastery.GS_SINGLEACTION || 0;
    if (gsSaLv && GUN_WEAPON_TYPES.has(weapon.weapon_type)) {
      const gsSaHit = ((profile.passive_overrides || {}).GS_SINGLEACTION || {}).hit_per_lv ?? 2;
      status.hit += gsSaHit * gsSaLv;
    }
    const gsSeLv = mastery.GS_SNAKEEYE || 0;
    if (gsSeLv && GUN_WEAPON_TYPES.has(weapon.weapon_type)) status.hit += gsSeLv;

    const tfMissLv = mastery.TF_MISS || 0;
    if (tfMissLv) {
      const tfFlee = TF_MISS_JOBL2.has(build.job_id) ? tfMissLv * 4 : tfMissLv * 3;
      status.flee += tfFlee;
    }

    const moDodgeLv = mastery.MO_DODGE || 0;
    if (moDodgeLv) {
      const moDodgeSpec = (profile.passive_overrides || {}).MO_DODGE || {};
      const moFlee = "flee_per_lv" in moDodgeSpec ? moDodgeLv * moDodgeSpec.flee_per_lv : (moDodgeLv * 3) >> 1;
      status.flee += moFlee;
    }

    const moIronHandLv = mastery.MO_IRONHAND || 0;
    if (moIronHandLv) {
      const moIhSpec = (profile.passive_overrides || {}).MO_IRONHAND || {};
      if ("flee_per_lv" in moIhSpec) status.flee += moIronHandLv * moIhSpec.flee_per_lv;
    }

    const njTobiLv = mastery.NJ_TOBIDOUGU || 0;
    if (njTobiLv) {
      const perLv = ((profile.passive_overrides || {}).NJ_TOBIDOUGU || {}).hit_per_lv ?? 0;
      status.hit += perLv * njTobiLv;
    }
    const saFcLv = mastery.SA_FREECAST || 0;
    if (saFcLv) {
      status.flee += (((profile.passive_overrides || {}).SA_FREECAST || {}).flee_per_lv || 0) * saFcLv;
    }

    if ("SC_BLIND" in playerScs) {
      status.hit = Math.floor(status.hit * 75 / 100);
      status.flee = Math.floor(status.flee * 75 / 100);
    }

    if ("SC_QUAGMIRE" in playerScs) {
      const val2 = 10 * Number(playerScs.SC_QUAGMIRE);
      status.agi = Math.max(0, status.agi - val2);
      status.dex = Math.max(0, status.dex - val2);
    }
    if ("SC_PS_HYPOTHERMIA" in playerScs) status.dex = Math.max(0, status.dex - 10);

    // === ASPD ===
    const lhItemId = DUAL_WIELD_JOBS.has(build.job_id) ? build.equipped.left_hand : null;
    const lhItem = lhItemId != null ? loader.getItem(lhItemId) : null;
    const lhWeaponType = lhItem ? (lhItem.weapon_type || "Unarmed") : "Unarmed";
    let baseAmotion;
    if (lhWeaponType !== "Unarmed") {
      const rhBase = loader.getAspdBase(build.job_id, weapon.weapon_type);
      const lhBase = loader.getAspdBase(build.job_id, lhWeaponType);
      baseAmotion = Math.floor((rhBase + lhBase) * 7 / 10);
    } else {
      baseAmotion = loader.getAspdBase(build.job_id, weapon.weapon_type);
    }
    let amotion = baseAmotion - Math.floor(baseAmotion * (4 * status.agi + status.dex) / 1000);
    amotion += build.bonus_aspd_add;

    let scAspdMax = 0;
    if ("SC_ONEHANDQUICKEN" in activeSc) scAspdMax = Math.max(scAspdMax, 300);

    if ("SC_TWOHANDQUICKEN" in activeSc) {
      const tqQuickenSpec = ((profile.aspd_buffs || {}).SC_TWOHANDQUICKEN || {}).quicken;
      if (tqQuickenSpec) {
        const fn = tqQuickenSpec[weapon.weapon_type];
        if (fn) scAspdMax = Math.max(scAspdMax, fn(activeSc.SC_TWOHANDQUICKEN));
      } else {
        scAspdMax = Math.max(scAspdMax, 300);
      }
    }

    // Adrenaline Rush. PS Blacksmith rework (Blacksmith 2026-08-09 PDF): it now works
    // on ALL melee weapons (bows and guns still excluded), and the magnitude depends
    // on the weapon class AND on whether you cast it yourself or received it —
    // "User/Party members Maces, and Axes have ASPD increased by 30%/20%, other
    // weapons ASPD increased by 20%/10%". scAspdMax is in per-mille of amotion, so a
    // 30% bonus is 300. Self-cast lives on active_status_levels.SC_ADRENALINE_SELF;
    // the party-received version stays on support_buffs.SC_ADRENALINE.
    if (profile.mechanic_flags.has("BS_ADRENALINE_ALL_MELEE")) {
      const selfAdrenaline = "SC_ADRENALINE_SELF" in activeSc;
      const partyAdrenaline = Number(support.SC_ADRENALINE || 0) > 0;
      if ((selfAdrenaline || partyAdrenaline) && !BOW_GUN_WEAPONS.has(weapon.weapon_type)) {
        const axeOrMace = ADRENALINE_WEAPONS.has(weapon.weapon_type);
        const pct = selfAdrenaline ? (axeOrMace ? 30 : 20) : (axeOrMace ? 20 : 10);
        scAspdMax = Math.max(scAspdMax, pct * 10);
      }
    } else {
      const adrenalineVal = Number(support.SC_ADRENALINE || 0);
      if (adrenalineVal && ADRENALINE_WEAPONS.has(weapon.weapon_type)) scAspdMax = Math.max(scAspdMax, adrenalineVal);
    }
    const adrenaline2Val = Number(support.SC_ADRENALINE2 || 0);
    if (adrenaline2Val && !BOW_GUN_WEAPONS.has(weapon.weapon_type)) scAspdMax = Math.max(scAspdMax, adrenaline2Val);

    if ("SC_SPEARQUICKEN" in activeSc) {
      const spearLv = activeSc.SC_SPEARQUICKEN;
      const sqQuicken = ((profile.aspd_buffs || {}).SC_SPEARQUICKEN || {}).quicken;
      if (sqQuicken) {
        const fn = sqQuicken[weapon.weapon_type];
        if (fn) scAspdMax = Math.max(scAspdMax, fn(spearLv));
      } else {
        scAspdMax = Math.max(scAspdMax, 200 + 10 * spearLv);
      }
    }

    const song = build.song_state;
    if (song.SC_ASSNCROS && !BOW_GUN_WEAPONS.has(weapon.weapon_type)) {
      const songLv = Number(song.SC_ASSNCROS);
      const musLv = Number(song.SC_ASSNCROS_lesson || 0);
      const sAgi = Number(song.SC_ASSNCROS_agi ?? 1);
      const val2 = (Math.floor(musLv / 2) + 10 + songLv + Math.floor(sAgi / 10)) * 10;
      scAspdMax = Math.max(scAspdMax, val2);
    }

    if ("SC_GS_GATLINGFEVER" in activeSc) {
      scAspdMax = Math.max(scAspdMax, 20 * activeSc.SC_GS_GATLINGFEVER);
    }

    let scAspdRate = 1000 - scAspdMax;

    let aspdAdd = 0;
    if ("SC_GS_GATLINGFEVER" in activeSc) aspdAdd += activeSc.SC_GS_GATLINGFEVER;
    if ("SC_GS_MADNESSCANCEL" in activeSc && aspdAdd < 20) aspdAdd = 20;
    scAspdRate -= aspdAdd;

    if ("SC_GS_MADNESSCANCEL" in activeSc) scAspdRate -= 200;
    if ("SC_STEELBODY" in activeSc) scAspdRate += 250;
    if ("SC_DEFENDER" in activeSc) scAspdRate += 250 - 50 * activeSc.SC_DEFENDER;

    if ("SC_DONTFORGETME" in playerScs) {
      const lv = Number(playerScs.SC_DONTFORGETME);
      const casterAgi = Number(playerScs.SC_DONTFORGETME_agi || 0);
      const val2 = Math.floor(casterAgi / 10) + 3 * lv + 5;
      scAspdRate += 10 * val2;
    }
    if ("SC_PS_HYPOTHERMIA" in playerScs) scAspdRate += 200;

    const saAdvbookLv = mastery.SA_ADVANCEDBOOK || 0;
    if (saAdvbookLv && weapon.weapon_type === "Book") {
      const abAspd = ((profile.passive_overrides || {}).SA_ADVANCEDBOOK || {}).aspd_pct_per_lv;
      if (Array.isArray(abAspd)) scAspdRate -= abAspd[saAdvbookLv - 1] * 10;
      else if (abAspd) scAspdRate -= abAspd * saAdvbookLv * 10;
      else scAspdRate -= 5 * saAdvbookLv;
    }

    if (gsSaLv && GUN_WEAPON_TYPES.has(weapon.weapon_type)) {
      scAspdRate -= Math.floor((gsSaLv + 1) / 2) * 10;
    }

    for (const [apKey, apSpec] of Object.entries(profile.passive_overrides || {})) {
      const apPct = apSpec.aspd_pct_per_lv;
      if (apPct && !Array.isArray(apPct)) {
        // A passive may be gated to specific weapon types (Transmutation only
        // applies its ASPD/MATK while an Axe or a Sword is equipped).
        if (apSpec.weapon_types && !apSpec.weapon_types.includes(weapon.weapon_type)) continue;
        const apLv = mastery[apKey] || 0;
        if (apLv) scAspdRate -= apPct * apLv * 10;
      }
    }

    for (const [aspdKey, aspdSpec] of Object.entries(profile.aspd_buffs || {})) {
      const lv10Rate = aspdSpec.lv10_rate;
      if (!lv10Rate) continue;
      if ((mastery[aspdKey] || 0) >= 10) {
        const delta = lv10Rate[weapon.weapon_type] || 0;
        if (delta) scAspdRate += delta;
      }
    }

    // ASPD % bonuses are additive in pre-renewal: fold the flat bonus_aspd_percent
    // (ASPD potions, bAspdRate gear) into the same rate as the SC quicken bonuses
    // and apply it once. Applying it as a separate multiplicative step floored
    // twice and undershot — e.g. +30% quicken and +20% potion gave ×0.70×0.80 =
    // ×0.56 instead of the correct ×0.50 (~1.6 ASPD low vs in-game / payonrocalc).
    scAspdRate -= build.bonus_aspd_percent * 10;
    if (scAspdRate !== 1000) amotion = Math.floor(amotion * scAspdRate / 1000);
    if (build.is_riding_peco) {
      const cavLv = mastery.KN_CAVALIERMASTERY || 0;
      amotion += 500 - 100 * cavLv;
    }
    const minAmotion = 2000 - this.config.max_aspd * 10;
    amotion = Math.max(minAmotion, Math.min(2000, amotion));
    status.aspd = (2000 - amotion) / 10;

    // === MAX HP ===
    const hpBase = loader.getHpAtLevel(build.job_id, build.base_level);
    status.max_hp = Math.floor(hpBase * (100 + status.vit) / 100);
    status.max_hp += build.bonus_maxhp;

    const crTrustLv = mastery.CR_TRUST || 0;
    if (crTrustLv) status.max_hp += crTrustLv * 200;

    if (build.bonus_maxhp_rate) {
      status.max_hp = Math.floor(status.max_hp * (100 + build.bonus_maxhp_rate) / 100);
    }

    // PS High Wizard rework: Soul Drain passive +1% MaxHP per level.
    const hwSouldrainLv = mastery.HW_SOULDRAIN || 0;
    if (hwSouldrainLv) {
      status.max_hp = Math.floor(status.max_hp * (100 + hwSouldrainLv) / 100);
    }

    if (build.job_id === 23) {
      for (const [thresh, bonus] of Object.entries(profile.sn_hp_bonus || {})) {
        if (build.base_level >= Number(thresh)) status.max_hp += bonus;
      }
    }

    // === MAX SP ===
    const spBase = loader.getSpAtLevel(build.job_id, build.base_level);
    status.max_sp = Math.floor(spBase * (100 + status.int_) / 100);
    status.max_sp += build.bonus_maxsp;
    if (build.bonus_maxsp_rate) {
      status.max_sp = Math.floor(status.max_sp * (100 + build.bonus_maxsp_rate) / 100);
    }
    if (build.job_id === 23) {
      for (const [thresh, bonus] of Object.entries(profile.sn_sp_bonus || {})) {
        if (build.base_level >= Number(thresh)) status.max_sp += bonus;
      }
    }

    // === MATK ===
    status.matk_min = status.int_ + Math.floor(status.int_ / 7) ** 2;
    status.matk_max = status.int_ + Math.floor(status.int_ / 5) ** 2;

    if (build.bonus_matk_rate) {
      const pct = 100 + build.bonus_matk_rate;
      status.matk_min = Math.floor(status.matk_min * pct / 100);
      status.matk_max = Math.floor(status.matk_max * pct / 100);
    }

    // Passive MATK% from a weapon mastery — PS Alchemist rework's Transmutation
    // (reworked Axe Mastery): +1% MATK per level while wielding an Axe or a Sword,
    // up to +10% at Lv10. Treated like gear bMatkRate: applied before Amplify.
    for (const [mpKey, mpSpec] of Object.entries(profile.passive_overrides || {})) {
      const perLv = mpSpec.matk_pct_per_lv;
      if (!perLv) continue;
      if (mpSpec.weapon_types && !mpSpec.weapon_types.includes(weapon.weapon_type)) continue;
      const mpLv = mastery[mpKey] || 0;
      if (!mpLv) continue;
      const pct = 100 + perLv * mpLv;
      status.matk_min = Math.floor(status.matk_min * pct / 100);
      status.matk_max = Math.floor(status.matk_max * pct / 100);
    }
    if ("SC_MINDBREAKER" in playerScs) {
      const lv = Number(playerScs.SC_MINDBREAKER);
      const pct = 100 + 20 * lv;
      status.matk_min = Math.floor(status.matk_min * pct / 100);
      status.matk_max = Math.floor(status.matk_max * pct / 100);
    }
    if (profile.mechanic_flags.has("GROUND_EFFECT_PS_VALUES") && support.ground_effect === "SC_VOLCANO") {
      const volLv = Number(support.ground_effect_lv || 1);
      const pct = 100 + PS_VOL_MATK_PCT[Math.min(volLv, PS_VOL_MATK_PCT.length) - 1];
      status.matk_min = Math.floor(status.matk_min * pct / 100);
      status.matk_max = Math.floor(status.matk_max * pct / 100);
    }
    if (build.bonus_matk_flat) {
      status.matk_min += build.bonus_matk_flat;
      status.matk_max += build.bonus_matk_flat;
    }

    // Mystical Amplification (SC_AMPLIFYMAGICPOWER): flat 50% on vanilla;
    // PS rework scales per level (+10%/lv, cap lv5 = 50%) via SC_AMPLIFYMAGICPOWER_SCALING.
    if ("SC_AMPLIFYMAGICPOWER" in activeSc) {
      const lv = activeSc.SC_AMPLIFYMAGICPOWER;
      const ampPct = profile.mechanic_flags.has("SC_AMPLIFYMAGICPOWER_SCALING")
        ? Math.min(lv, 5) * 10
        : 50;
      status.matk_min = Math.floor(status.matk_min * (100 + ampPct) / 100);
      status.matk_max = Math.floor(status.matk_max * (100 + ampPct) / 100);
    }

    // === MDEF ===
    status.mdef = build.equip_mdef;
    status.mdef2 = status.int_ + (status.vit >> 1);

    if ("SC_ENDURE" in activeSc) status.mdef += activeSc.SC_ENDURE;
    if ("SC_PROVIDENCE" in activeSc) status.mdef += 2 * activeSc.SC_PROVIDENCE;
    if ("SC_MINDBREAKER" in playerScs) {
      const lv = Number(playerScs.SC_MINDBREAKER);
      status.mdef = Math.max(0, Math.floor(status.mdef * (100 - 12 * lv) / 100));
    }
    if ("SC_STEELBODY" in activeSc) {
      if (profile.steelbody_override != null) status.mdef = profile.steelbody_override[1](build.equip_mdef);
      else status.mdef = 90;
    }

    // === BARD SONGS ===
    if (song.SC_WHISTLE) {
      const songLv = Number(song.SC_WHISTLE);
      const musLv = Number(song.SC_WHISTLE_lesson || 0);
      const sAgi = Number(song.SC_WHISTLE_agi ?? 1);
      const sLuk = Number(song.SC_WHISTLE_luk ?? 1);
      const whistleFlee = songLv + Math.floor(sAgi / 10) + musLv;
      const whistleFlee2 = (Math.floor((songLv + 1) / 2) + Math.floor(sLuk / 10) + musLv) * 10;
      status.flee += whistleFlee;
      status.flee2 += whistleFlee2;
    }

    if (song.SC_APPLEIDUN) {
      const songLv = Number(song.SC_APPLEIDUN);
      const musLv = Number(song.SC_APPLEIDUN_lesson || 0);
      const sVit = Number(song.SC_APPLEIDUN_vit ?? 1);
      const val2 = 5 + 2 * songLv + Math.floor(sVit / 10) + musLv;
      status.max_hp += Math.floor(status.max_hp * val2 / 100);
    }

    if (support.ground_effect === "SC_DELUGE" && !profile.mechanic_flags.has("GROUND_EFFECT_PS_VALUES")) {
      const delLv = Number(support.ground_effect_lv || 1);
      const delVal2 = DELUGE_EFF[delLv - 1];
      status.max_hp += Math.floor(status.max_hp * delVal2 / 100);
    }

    if (song.SC_POEMBRAGI) {
      const songLv = Number(song.SC_POEMBRAGI);
      const musLv = Number(song.SC_POEMBRAGI_lesson || 0);
      const sDex = Number(song.SC_POEMBRAGI_dex ?? 1);
      const sInt = Number(song.SC_POEMBRAGI_int ?? 1);
      status.cast_time_reduction_pct = 3 * songLv + Math.floor(sDex / 10) + 2 * musLv;
      status.after_cast_delay_reduction_pct = (songLv < 10 ? 3 * songLv : 50) + Math.floor(sInt / 5) + 2 * musLv;
    }

    if ("SC_PS_HYPOTHERMIA" in playerScs) status.cast_time_penalty_pct += 20;

    if (song.SC_HUMMING) {
      const songLv = Number(song.SC_HUMMING);
      const danceLv = Number(song.SC_HUMMING_lesson || 0);
      const sDex = Number(song.SC_HUMMING_dex ?? 1);
      const humHit = 2 * songLv + Math.floor(sDex / 10) + danceLv;
      status.hit += humHit;
    }

    if (song.SC_FORTUNE) {
      const songLv = Number(song.SC_FORTUNE);
      const danceLv = Number(song.SC_FORTUNE_lesson || 0);
      const sLuk = Number(song.SC_FORTUNE_luk ?? 1);
      const fortuneCri = (10 + songLv + Math.floor(sLuk / 10) + danceLv) * 10;
      status.cri += fortuneCri;
    }

    if (song.SC_SERVICEFORYU) {
      const songLv = Number(song.SC_SERVICEFORYU);
      const danceLv = Number(song.SC_SERVICEFORYU_lesson || 0);
      const sInt = Number(song.SC_SERVICEFORYU_int ?? 1);
      const val2 = 15 + songLv + Math.floor(sInt / 10) + Math.floor(danceLv / 2);
      const val3 = 20 + 3 * songLv + Math.floor(sInt / 10) + Math.floor(danceLv / 2);
      status.max_sp += Math.floor(status.max_sp * val2 / 100);
      status.sp_cost_reduction_pct = val3;
    }

    const drumLv = Number(song.SC_DRUMBATTLE || 0);
    if (drumLv) status.def_ += (drumLv + 1) * 2;

    // === REGEN ===
    status.hp_regen = Math.max(1, Math.floor(status.max_hp / 200)) + Math.floor(status.vit / 5);
    status.sp_regen = 1 + Math.floor(status.int_ / 6) + Math.floor(status.max_sp / 100);
    if (status.int_ >= 120) status.sp_regen += Math.floor((status.int_ - 120) / 2) + 4;

    const smRecLv = mastery.SM_RECOVERY || 0;
    if (smRecLv) status.hp_regen += smRecLv * 5 + Math.floor(smRecLv * status.max_hp / 500);
    const mgSrecLv = mastery.MG_SRECOVERY || 0;
    if (mgSrecLv) status.sp_regen += mgSrecLv * 3 + Math.floor(mgSrecLv * status.max_sp / 500);
    const njNinpouLv = mastery.NJ_NINPOU || 0;
    if (njNinpouLv) status.sp_regen += njNinpouLv * 3 + Math.floor(njNinpouLv * status.max_sp / 500);

    return status;
  }
}

module.exports = { StatusCalculator };
