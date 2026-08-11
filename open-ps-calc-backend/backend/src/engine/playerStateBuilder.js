/**
 * playerStateBuilder.js — JS port of core/player_state_builder.py
 *
 * Two-pass resolution: gear bonuses depend on item-script conditionals that
 * may reference MaxHp/MaxSp, but MaxHp/MaxSp are themselves computed FROM
 * gear bonuses (StatusCalculator). Pass 1 resolves gear with no hp/sp
 * context; pass 2 re-resolves using pass-1's MaxHp/MaxSp.
 */
const buildApplicator = require("./buildApplicator");
const buildManager = require("./buildManager");
const { StatusCalculator } = require("./calculators/statusCalculator");
const gearBonusAggregator = require("./gearBonusAggregator");
const { getProfile } = require("./serverProfiles");
const { loader } = require("./dataLoader");

function resolvePlayerState(build, config, profile = null) {
  if (profile == null) profile = getProfile(build.server);

  // Strip mastery levels the selected job cannot learn. `mastery_levels` is a
  // free-form map that the editor does not clear on a job change, so levels from a
  // previously selected job survive in the state (and in every share URL made from
  // it) and get applied silently — a leftover Martial Arts Lv10 was adding +20 FLEE
  // to an Assassin. Done once here, at the single funnel every route goes through,
  // so old share links are corrected on load too. Gear-GRANTED skills are added
  // later inside gearBonusAggregator and are deliberately not filtered.
  const { levels: legalMastery, dropped } = loader.filterMasteryLevelsForJob(build.job_id, build.mastery_levels);
  if (dropped.length) build = { ...build, mastery_levels: legalMastery };

  // Plagiarism (RG_PLAGIARISM): a Rogue/Stalker carries ONE copied skill and uses
  // it as if it were their own, so its level belongs in mastery_levels — that is
  // what makes a copied Triple Attack proc on auto-attacks. Folded in AFTER the
  // job filter above (the copied skill is by definition not on the Rogue's tree),
  // and gated on the job + the profile's copyable list so a stale share link
  // can't hand a Knight a plagiarised Asura Strike. It never overwrites a level
  // the job legitimately has.
  const plag = build.plagiarized_skill;
  if (plag && plag.name && plag.level > 0
      && profile.plagiarism_jobs.has(build.job_id)
      && profile.plagiarism_copyable.has(plag.name)
      && !(plag.name in (build.mastery_levels || {}))) {
    // Clamp to the skill's PS max rank — you cannot copy a rank that does not
    // exist, and an over-max level reads as 0 in the rate tables (PS retuned
    // Triple Attack to 5 ranks, so a copied "Lv10" would silently proc nothing).
    const rec = loader.getSkillByName(plag.name);
    const maxLv = rec && rec.max_level > 0 ? rec.max_level : plag.level;
    build = { ...build, mastery_levels: { ...(build.mastery_levels || {}), [plag.name]: Math.min(plag.level, maxLv) } };
  }

  function onePass(status) {
    const ctx = gearBonusAggregator.scriptCtxFromBuild(build, status);
    const gb = gearBonusAggregator.compute(build.equipped, build.refine_levels, ctx, build.force_procs);
    gearBonusAggregator.applyPassiveBonuses(gb, gb.effective_mastery, profile);
    buildApplicator.applyPetBonuses(gb, build.selected_pet, profile);
    gearBonusAggregator.applyComboBonuses(gb, build.equipped, profile, ctx);
    // Merge wildcard card bonuses (custom card-mix UI) into gear bonuses.
    // RC_All / Size_All / Ele_All fan out here (not through the aggregator).
    const WC_SIZES = ["Size_Small", "Size_Medium", "Size_Large"];
    const WC_ELES  = ["Ele_Neutral","Ele_Water","Ele_Earth","Ele_Fire","Ele_Wind",
                      "Ele_Poison","Ele_Holy","Ele_Dark","Ele_Ghost","Ele_Undead"];
    for (const [key, val] of Object.entries(build.wildcard_bonuses || {})) {
      const n = Number(val);
      if      (key === "_batk")    gb.batk += n;
      else if (key === "RC_All")   { gb.add_race.RC_Boss    = (gb.add_race.RC_Boss    || 0) + n;
                                     gb.add_race.RC_NonBoss = (gb.add_race.RC_NonBoss || 0) + n; }
      else if (key === "Size_All") { for (const s of WC_SIZES) gb.add_size[s] = (gb.add_size[s] || 0) + n; }
      else if (key === "Ele_All")  { for (const e of WC_ELES)  gb.add_ele[e]  = (gb.add_ele[e]  || 0) + n; }
      // Type = monster-family card (Orc/Goblin/Kobold/Golem-Bane, bAddRace2). The
      // wildcard assumes the slotted card matches the target's family, so it
      // applies unconditionally like the other _All wildcard bonuses.
      else if (key === "Type_All") gb.add_type += n;
      else if (key.startsWith("RC_"))   gb.add_race[key] = (gb.add_race[key] || 0) + n;
      else if (key.startsWith("Size_")) gb.add_size[key] = (gb.add_size[key] || 0) + n;
      else if (key.startsWith("Ele_"))  gb.add_ele[key]  = (gb.add_ele[key]  || 0) + n;
    }
    const eff = buildApplicator.applyGearBonuses(build, gb);
    buildApplicator.applyWeaponEndow(eff);
    const weapon = buildManager.resolveWeapon(
      loader,
      eff.equipped.right_hand,
      eff.refine_levels.right_hand || 0,
      eff.weapon_element,
      {
        is_forged: eff.is_forged,
        forge_sc_count: eff.forge_sc_count,
        forge_ranked: eff.forge_ranked,
        forge_element: eff.forge_element,
        script_atk_ele_rh: gb.script_atk_ele_rh,
      }
    );
    const st = new StatusCalculator(config).calculate(eff, weapon, gb);
    return [gb, eff, weapon, st];
  }

  const [, , , status1] = onePass(null);
  const [gb, eff, weapon, st] = onePass(status1);
  if (eff.current_hp == null) eff.current_hp = st.max_hp;
  return [gb, eff, weapon, st];
}

module.exports = { resolvePlayerState };
