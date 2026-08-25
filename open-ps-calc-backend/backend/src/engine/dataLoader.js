/**
 * dataLoader.js — JS port of core/data_loader.py
 *
 * Loads item/mob/skill databases from engine/data/pre-re/ (mirrors Hercules DB
 * structure). PS server data is layered on top via ps_item_overrides.json and
 * ps_item_manual.json. Exposes a singleton `loader` the same way the Python
 * module exposes a module-level `loader = DataLoader()`.
 *
 * NOT YET PORTED relative to data_loader.py: hide/unhide item-mutation helpers
 * (hidden_items.json is read-only here; toggling hidden status would require
 * per-user state, which doesn't fit a shared static data file in a multi-user
 * server). is_item_hidden / is_mob_hidden are still provided for filtering.
 */
const fs = require("fs");
const path = require("path");

const DATA_ROOT = path.join(__dirname, "data");
const PRE_RE = path.join(DATA_ROOT, "pre-re");
const PS_DIR = path.join(DATA_ROOT, "ps");

const ELEMENT_NAMES = {
  0: "Neutral", 1: "Water", 2: "Earth", 3: "Fire", 4: "Wind",
  5: "Poison", 6: "Holy", 7: "Dark", 8: "Ghost", 9: "Undead",
};

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

class DataLoader {
  constructor() {
    this._cache = {};
    this._skillNameToId = null;
    this._profile = null; // set via setProfile(); null => vanilla-only
  }

  setProfile(profile) {
    this._profile = profile;
  }

  get _usePsData() {
    return this._profile != null && this._profile.use_ps_data;
  }

  _loadJson(relPath) {
    if (this._cache[relPath]) return this._cache[relPath];
    const full = path.join(PRE_RE, relPath);
    if (!fs.existsSync(full)) throw new Error(`Missing required data file: ${full}`);
    const data = JSON.parse(fs.readFileSync(full, "utf-8"));
    this._cache[relPath] = data;
    return data;
  }

  // ---------------------------------------------------------------
  // PS layers
  // ---------------------------------------------------------------
  _loadPsItemOverrides() {
    if (!this.__psItemOverrides) {
      this.__psItemOverrides = readJsonSafe(path.join(PS_DIR, "ps_item_overrides.json"), {});
    }
    return this.__psItemOverrides;
  }

  _loadPsItemManual() {
    if (!this.__psItemManual) {
      this.__psItemManual = readJsonSafe(path.join(PS_DIR, "ps_item_manual.json"), {});
    }
    return this.__psItemManual;
  }

  static _normalizeItem(item) {
    if (item == null) return null;
    const loc = item.loc || [];
    if ((loc.includes("EQP_HEAD_MID") || loc.includes("EQP_HEAD_LOW")) && (item.refineable ?? true)) {
      return { ...item, refineable: false };
    }
    // Source data lists all Whip weapons as job [19, 4020] (Bard/Clown) but they belong to
    // Dancer (20) and Gypsy (4021). Musical Instruments carry the correct [19, 4020] restriction
    // plus gender SEX_MALE; Whips have no gender field so the job array is the only guard.
    if (item.weapon_type === "Whip" && Array.isArray(item.job) && item.job.includes(19) && !item.job.includes(20)) {
      return { ...item, job: item.job.map((j) => (j === 19 ? 20 : j === 4020 ? 4021 : j)) };
    }
    return item;
  }

  _applyPsItemLayers(strId, base) {
    // `_note` is a maintainer comment on a ps_item_manual entry (why a script
    // deviates from the scraped text) — never part of the item itself.
    const STRIP = new Set(["_ps_custom", "_renewal_base", "description", "_note"]);
    const REMAP = { weapon_level: "level" };

    if (!this._usePsData) return base;

    const override = this._loadPsItemOverrides()[strId] || {};
    const manual = this._loadPsItemManual()[strId] || {};
    if (Object.keys(override).length === 0 && Object.keys(manual).length === 0) return base;

    let result = base ? { ...base } : {};
    if (Object.keys(result).length === 0) result.id = Number(strId);

    for (const src of [override, manual]) {
      for (const [k, v] of Object.entries(src)) {
        if (STRIP.has(k)) continue;
        result[REMAP[k] || k] = v;
      }
    }
    return Object.keys(result).length ? result : null;
  }

  getConvenienceCards() {
    if (!this.__convenienceCards) {
      this.__convenienceCards = readJsonSafe(path.join(DATA_ROOT, "convenience_cards.json"), []);
    }
    return this.__convenienceCards;
  }

  getItem(itemId) {
    if (itemId < 0) {
      return this.getConvenienceCards().find((c) => c.id === itemId) || null;
    }
    const strId = String(itemId);
    let base = null;
    try {
      const data = this._loadJson("db/item_db.json");
      base = (data.items || {})[strId] || null;
    } catch {
      base = null;
    }
    return DataLoader._normalizeItem(this._applyPsItemLayers(strId, base));
  }

  getItemsByType(itemType) {
    let vanilla = {};
    try {
      const data = this._loadJson("db/item_db.json");
      for (const [k, v] of Object.entries(data.items || {})) {
        if (v.type === itemType) vanilla[k] = v;
      }
    } catch {
      vanilla = {};
    }

    const results = {};
    for (const [strId, base] of Object.entries(vanilla)) {
      const merged = DataLoader._normalizeItem(this._applyPsItemLayers(strId, base));
      if (merged) results[strId] = merged;
    }

    if (!this._usePsData) return Object.values(results);

    const manual = this._loadPsItemManual();
    for (const [strId, man] of Object.entries(manual)) {
      if (results[strId]) continue;
      if (man.type === itemType) {
        const merged = DataLoader._normalizeItem(this._applyPsItemLayers(strId, null));
        if (merged) results[strId] = merged;
      }
    }

    if (itemType === "IT_CARD") {
      return [...Object.values(results), ...this.getConvenienceCards()];
    }
    return Object.values(results);
  }

  getItemByAegis(aegisName) {
    if (!this.__aegisToItem) {
      this.__aegisToItem = {};
      try {
        const data = this._loadJson("db/item_db.json");
        // Resolve through getItem(id) so the entry carries the PS layers — the raw
        // vanilla record often has no `name` at all (the PS name lives in
        // ps_item_overrides.json), which left combo labels showing the aegis
        // string, e.g. "FLAME_BEETLE_Card" instead of "Flame Beetle Card".
        for (const [id, v] of Object.entries(data.items || {})) {
          if (v && v.aegis_name) this.__aegisToItem[v.aegis_name] = this.getItem(Number(id)) || v;
        }
      } catch {
        this.__aegisToItem = {};
      }
    }
    if (this.__aegisToItem[aegisName]) return this.__aegisToItem[aegisName];
    if (this._usePsData) {
      const manual = this._loadPsItemManual();
      for (const [id, item] of Object.entries(manual)) {
        // Same reason as above: a PS-only entry carries no `name` of its own
        // (it comes from ps_item_overrides.json), so resolve it by id.
        if (item && item.aegis_name === aegisName) return this.getItem(Number(id)) || item;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------
  // Item combo database
  // ---------------------------------------------------------------
  _loadItemComboDb() {
    if (!this.__itemComboDb) {
      try {
        this.__itemComboDb = this._loadJson("db/item_combo_db.json");
      } catch {
        this.__itemComboDb = [];
      }
    }
    return this.__itemComboDb;
  }

  _loadPsItemComboDb() {
    if (!this.__psItemComboDb) {
      this.__psItemComboDb = readJsonSafe(path.join(PS_DIR, "ps_item_combo_db.json"), []);
    }
    return this.__psItemComboDb;
  }

  getActiveCombos(equippedAegisSet, profile = null) {
    let combos = this._loadItemComboDb();
    if (profile != null && profile.use_ps_data) {
      combos = [...combos, ...this._loadPsItemComboDb()];
    }
    return combos.filter((c) => c.items.every((item) => equippedAegisSet.has(item)));
  }

  // ---------------------------------------------------------------
  // Monster database
  // ---------------------------------------------------------------
  _loadPsMobDb() {
    if (!this.__psMobDb) {
      const data = readJsonSafe(path.join(PS_DIR, "ps_mob_db.json"), { mobs: {} });
      this.__psMobDb = data.mobs || {};
    }
    return this.__psMobDb;
  }

  getMonsterData(mobId) {
    if (this._usePsData) {
      return this._loadPsMobDb()[String(mobId)] || null;
    }
    try {
      const data = this._loadJson("db/mob_db.json");
      return (data.mobs || {})[String(mobId)] || null;
    } catch {
      return null;
    }
  }

  // Reverse map: mob ID -> [RC2 family keys] (e.g. 1023 -> ["RC2_Orc"]).
  // Cached on first use. Feeds bAddRace2 "Bane" cards via target.race2.
  _mobRace2Map() {
    if (this.__mobRace2 == null) {
      const map = {};
      try {
        const groups = (this._loadJson("db/mob_race2_db.json").groups) || {};
        for (const [rc2, ids] of Object.entries(groups)) {
          for (const id of ids) {
            (map[id] = map[id] || []).push(rc2);
          }
        }
      } catch {
        // no race2 data — leave map empty (cards just won't apply)
      }
      this.__mobRace2 = map;
    }
    return this.__mobRace2;
  }

  // Offensive skills a monster uses in combat (parsed from Hercules pre-re
  // mob_skill_db). Each entry: { id, name, lv, rate (per-10000), target, ele }.
  // `ele` is the element int for NPC_*ATTACK elemental hits (else null). Same AI
  // across PS, so this is a single pre-re table.
  getMobSkills(mobId) {
    try {
      return this._loadJson("db/mob_skill_db.json")[String(mobId)] || [];
    } catch {
      return [];
    }
  }

  getMonster(mobId) {
    const { createTarget } = require("./models");
    const entry = this.getMonsterData(mobId);
    if (entry == null) {
      return createTarget();
    }
    const stats = entry.stats || {};
    const level = entry.level;
    const agi = stats.agi || 0;
    const dex = stats.dex || 0;
    return createTarget({
      def_: entry.def_,
      vit: stats.vit ?? entry.vit ?? 0,
      luk: stats.luk || 0,
      agi,
      str: stats.str || 0,
      dex,
      flee: level + agi,
      hit: level + dex,
      size: entry.size,
      race: entry.race,
      element: entry.element,
      element_level: entry.element_level,
      is_boss: entry.is_boss,
      level,
      mdef_: entry.mdef || 0,
      int_: stats.int || 0,
      race2: this._mobRace2Map()[Number(mobId)] || [],
      mob_id: Number(mobId), // for bAddDamageClass (+% damage vs a specific monster)
    });
  }

  getAllMonsters() {
    if (this._usePsData) return Object.values(this._loadPsMobDb());
    try {
      const data = this._loadJson("db/mob_db.json");
      return Object.values(data.mobs || {});
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Job database
  // ---------------------------------------------------------------
  getAllJobs() {
    try {
      const data = this._loadJson("tables/job_db.json");
      return Object.entries(data.jobs || {}).map(([id, entry]) => ({
        id: Number(id),
        name: entry.name || `Job ${id}`,
      }));
    } catch {
      return [];
    }
  }

  getJobEntry(jobId) {
    try {
      const data = this._loadJson("tables/job_db.json");
      return (data.jobs || {})[String(jobId)] || null;
    } catch {
      return null;
    }
  }

  getAspdBase(jobId, weaponType) {
    const entry = this.getJobEntry(jobId);
    if (!entry) return 2000;
    return (entry.aspd_base || {})[weaponType] ?? 2000;
  }

  getHpAtLevel(jobId, level) {
    const entry = this.getJobEntry(jobId);
    if (!entry) throw new Error(`job_id ${jobId} not found in job_db`);
    const table = entry.hp_table || [];
    if (!table.length) throw new Error(`hp_table empty for job_id ${jobId}`);
    const idx = Math.max(0, Math.min(level - 1, table.length - 1));
    return table[idx];
  }

  getSpAtLevel(jobId, level) {
    const entry = this.getJobEntry(jobId);
    if (!entry) throw new Error(`job_id ${jobId} not found in job_db`);
    const table = entry.sp_table || [];
    if (!table.length) throw new Error(`sp_table empty for job_id ${jobId}`);
    const idx = Math.max(0, Math.min(level - 1, table.length - 1));
    return table[idx];
  }

  // ---------------------------------------------------------------
  // Skills
  // ---------------------------------------------------------------
  // Apply the active profile's per-skill level cap to max_level so the UI's
  // level selector matches the engine clamp (e.g. WZ_FROSTNOVA max 5 on PS, 10
  // in vanilla). Without this the picker offers levels the engine silently caps.
  // `skill_level_cap_overrides` SETS a skill's PS max level — it can raise as well as
  // lower the DB value. Most entries lower it (PS retunes a 10-rank skill to 5), but
  // reworks also promote skills upward: the 2026-08 Merchant rework turned the 1-rank
  // quest skills Cart Revolution / Crazy Uproar into 5- and 4-rank tree skills, and
  // the Blacksmith rework gave every Smith Weapon skill a 4th rank.
  // With no explicit override, the PS skill DB is a better source than the vanilla
  // one for a PS server — but ONLY where the scrape actually saw a per-level table
  // (`levels`), since a record scraped without one can carry a placeholder max
  // (Falcon Assault reads 1 there, with no table behind it). A table whose length
  // matches max_level is real evidence, so that value wins; anything thinner falls
  // back to vanilla. This is what keeps the SKILL picker in step with the passive
  // picker, which has always preferred the PS entry — Free Cast and Advanced Book
  // were offered at 5 ranks in one and 10 in the other.
  _psScrapedMaxLevel(skillName) {
    const rec = this.getPsSkill(skillName);
    if (!rec || !(rec.max_level > 0)) return null;
    const levels = Array.isArray(rec.levels) ? rec.levels.length : 0;
    return levels === rec.max_level ? rec.max_level : null;
  }

  _applySkillCap(skill) {
    if (!skill) return skill;
    const caps = this._profile && this._profile.skill_level_cap_overrides;
    const explicit = caps ? caps[skill.name] : null;
    const cap = explicit != null
      ? explicit
      : (this._usePsData ? this._psScrapedMaxLevel(skill.name) : null);
    return cap != null && skill.max_level !== cap ? { ...skill, max_level: cap } : skill;
  }

  getSkill(skillId) {
    try {
      const data = this._loadJson("db/skills.json");
      const vanilla = (data.skills || {})[String(skillId)];
      if (vanilla) return this._applySkillCap(vanilla);
    } catch {
      /* fall through to PS-custom */
    }
    if (this._usePsData) {
      const custom = this._psCustomBattleSkills()[skillId];
      if (custom) return custom;
    }
    return null;
  }

  // Skill record by CONSTANT, with the profile's level cap applied — the
  // by-id getSkill()'s counterpart for callers that only hold a name (the
  // Plagiarism slot, which stores the copied skill by constant). Memoized per
  // profile: the map is rebuilt when the server profile changes.
  getSkillByName(skillName) {
    if (!skillName) return null;
    const cacheKey = this._profile ? this._profile.name : "none";
    if (this.__skillByName == null || this.__skillByNameKey !== cacheKey) {
      this.__skillByName = new Map();
      this.__skillByNameKey = cacheKey;
      for (const s of this.getAllSkills()) {
        if (s && s.name && !this.__skillByName.has(s.name)) this.__skillByName.set(s.name, s);
      }
    }
    return this.__skillByName.get(skillName) || null;
  }

  getAllSkills() {
    let skills = [];
    try {
      const data = this._loadJson("db/skills.json");
      skills = Object.values(data.skills || {}).map((s) => this._applySkillCap(s));
    } catch {
      skills = [];
    }
    if (this._usePsData) {
      skills = skills.concat(Object.values(this._psCustomBattleSkills()));
    }
    return skills;
  }

  getPassiveSkillsForJob(jobId) {
    // Skills the engine actually reads from mastery_levels and which affect
    // ATK, MATK, hit chance, crit rate, or ASPD.
    const DAMAGE_RELEVANT = new Set([
      // Weapon masteries (flat ATK via masteryFix / mastery_weapon_map)
      "SM_SWORD", "SM_TWOHAND", "KN_SPEARMASTERY", "AM_AXEMASTERY",
      "PR_MACEMASTERY", "MO_IRONHAND", "BA_MUSICALLESSON", "DC_DANCINGLESSON",
      "SA_ADVANCEDBOOK", "AS_KATAR", "ASC_KATAR",
      // Conditional ATK bonuses
      "AL_DEMONBANE", "HT_BEASTBANE", "BS_WEAPONRESEARCH", "NJ_TOBIDOUGU",
      // Stat boosts that raise BATK / MATK
      "BS_HILTBINDING", "SA_DRAGONOLOGY", "AC_OWL",
      // HIT rate → hit chance → effective DPS
      "AC_VULTURE", "GS_SINGLEACTION", "GS_SNAKEEYE",
      // PS Gunslinger shotgun passives (mastery at Lv10): Dust grants +1 ATK per STR
      // with a Shotgun (and 7% Neutral resist); Full Buster / Spread Attack grant the
      // Neutral resist with a Shotgun/Grenade Launcher. wiki.payonstories.com/Dust.
      "GS_DUST", "GS_FULLBUSTER", "GS_SPREADATTACK",
      // ASPD → attack period → DPS
      "KN_CAVALIERMASTERY",
      // FLEE → dodge chance (survivability). Improve Dodge is passive and the
      // engine already reads it (statusCalculator TF_MISS), but it wasn't offered
      // in the picker. Surfaces for the Thief line and Super Novice.
      "TF_MISS",
      // PS: Free Cast (Sage) grants +4 FLEE/lv (max Lv5). Engine reads it via
      // passive_overrides.SA_FREECAST.flee_per_lv; surface it in the Sage picker.
      "SA_FREECAST",
      // Proc-based extra hits on normal attacks (battlePipeline.js#calculate)
      "TF_DOUBLE",
      // PS Gunslinger Chain Action: revolver normal attacks proc a second hit
      // (7%/lv → 70% at Lv10), read as effective_mastery.GS_CHAINACTION.
      "GS_CHAINACTION",
      // PS Monk rework: MO_TRIPLEATTACK level sets proc rate and TA ratio damage
      "MO_TRIPLEATTACK",
      // PS Assassin rework: AS_ENCHANTPOISON level feeds the passive +2%/lv vs Poison element bonus
      "AS_ENCHANTPOISON",
      // PS dual-wield: AS_RIGHT/AS_LEFT levels set the per-hit damage factors
      "AS_RIGHT", "AS_LEFT",
      // Falcon damage (falconCalc.js): mastery enables it, Steel Crow/Blitz Beat scale it
      "HT_FALCON", "HT_STEELCROW", "HT_BLITZBEAT",
      // Active skills whose own level isn't used to attack with directly,
      // but which act as a damage multiplier for a *different* skill (PS
      // wiki: Frost Nova's MATK% scales with the caster's Frost Diver rank;
      // Fire Pillar's per-hit MATK% scales with Fire Wall rank). Listed here
      // so their level is reachable from the build editor at all -- see the
      // skill_type exception below, and PS_BF_MAGIC_RATIOS in
      // serverProfiles.js for where the level is actually consumed.
      "MG_FROSTDIVER", "MG_FIREWALL",
      // PS High Wizard rework: Soul Drain grants +1% MaxHP per level passively.
      "HW_SOULDRAIN",
      // Crusader Faith: +5% Holy resistance and +200 MaxHP per level. Both feed
      // Grand Cross's self-damage recoil — the Holy resist reduces the damage-based
      // Part 1 (up to −50% at Lv10), the MaxHP raises the fixed 20%-MaxHP Part 2.
      // The PS wiki confirms it "will also reduce the recoil damage from Grand Cross."
      "CR_TRUST",
      // PS Blacksmith rework (Blacksmith 2026-08-09 PDF): the Smith Weapon skills went
      // to 4 ranks and the new Veteran Axe scales its ATK / Perfect Dodge / ASPD with
      // how many of them are MASTERED — so their levels must be reachable from the
      // build editor (item scripts read them via getskilllv()).
      "BS_DAGGER", "BS_SWORD", "BS_KNUCKLE", "BS_SPEAR", "BS_AXE", "BS_MACE",
      // PS Alchemist: Pharmacy level scales Giant Pestle's flat ATK bonus.
      "AM_PHARMACY",
    ]);
    // PS-custom passives (constants that exist only on Payon Stories, so they are
    // absent from the vanilla skill tree/DB) offered for the jobs that can learn them.
    const PS_CUSTOM_PASSIVES = new Set(["PS_MC_TOOLMASTERY"]);
    // Some skill DB names differ from the key masteryFix.js looks up.
    const MASTERY_KEY_OVERRIDE = { "SM_TWOHAND": "SM_TWOHANDSWORD" };
    // These are active (non-passive) skills, normally excluded by the
    // skill_type check below -- carved out because their level still feeds
    // into a damage formula (see DAMAGE_RELEVANT comment above).
    const ACTIVE_SKILL_TYPE_EXCEPTIONS = new Set(["MG_FROSTDIVER", "MG_FIREWALL", "HT_BLITZBEAT", "AS_ENCHANTPOISON", "MO_TRIPLEATTACK", "HW_SOULDRAIN", "GS_DUST", "GS_FULLBUSTER", "GS_SPREADATTACK", "AM_PHARMACY"]);

    try {
      const treeData = this._loadJson("tables/skill_tree.json");
      const skillNames = (treeData.jobs || {})[String(jobId)] || [];
      if (skillNames.length === 0) return [];
      const skillData = this._loadJson("db/skills.json");
      const byName = {};
      for (const s of Object.values(skillData.skills || {})) {
        if (s && s.name) byName[s.name] = s;
      }
      const entries = skillNames
        .filter((n) => DAMAGE_RELEVANT.has(n))
        .map((n) => byName[n])
        .filter((s) => s && (ACTIVE_SKILL_TYPE_EXCEPTIONS.has(s.name) || (Array.isArray(s.skill_type) && s.skill_type.length === 0)))
        .map((s) => {
          // PS sometimes retunes a vanilla passive's max level (e.g.
          // SA_ADVANCEDBOOK is max 5 on PS vs vanilla's 10) and/or renames it
          // for display (vanilla calls it "Study", PS calls it "Advanced
          // Book") -- ps_skill_db.json carries both; apply them the same way
          // getSkillDisplayName does for any other skill. The profile's PS max
          // level (skill_level_cap_overrides, via _applySkillCap) wins over both:
          // it is the only source that knows about post-scrape reworks, and it can
          // raise a max (Smith Weapon 3 → 4) as well as lower one.
          const psEntry = this._usePsData ? this.getPsSkill(s.name) : null;
          const capped = this._applySkillCap(s);
          const psMax = capped.max_level !== s.max_level
            ? capped.max_level
            : (psEntry && psEntry.max_level) || s.max_level;
          return {
            name: s.name,
            mastery_key: MASTERY_KEY_OVERRIDE[s.name] ?? s.name,
            description: (psEntry && psEntry.name) || s.description || s.name,
            max_level: psMax,
          };
        })
        // max_level 0 = removed on PS (Smith Two-Handed Sword folded into Smith Sword).
        .filter((s) => s.max_level > 0);

      // PS-custom passives aren't in the vanilla skill tree — pull them from the PS
      // skill DB, gated by the job list in ps_custom_constants.json.
      if (this._usePsData) {
        for (const rec of this.getPsCustomSkills()) {
          if (!PS_CUSTOM_PASSIVES.has(rec.constant)) continue;
          if (!(rec.job || []).includes(jobId)) continue;
          entries.push({
            name: rec.constant,
            mastery_key: rec.constant,
            description: rec.name || rec.constant,
            max_level: rec.max_level || 1,
          });
        }
      }
      // Picker order. The list otherwise comes out in skill-tree order, which is
      // roughly alphabetical — that buried Hilt Binding (a real stat passive: +4
      // ATK, +1 weapon level) in the middle of the six "Smith <weapon>" entries,
      // where players stopped reading. The Smith skills are only in the picker
      // because an ITEM SCRIPT reads their level (Veteran Axe scales off how many
      // are mastered); they grant nothing on their own. So sink them below the
      // passives that do something by themselves, keeping tree order within each
      // group. Reported by a player who couldn't find Hilt Binding.
      const CRAFTING_ONLY = new Set(["BS_DAGGER", "BS_SWORD", "BS_KNUCKLE", "BS_SPEAR", "BS_AXE", "BS_MACE"]);
      const rank = (e) => (CRAFTING_ONLY.has(e.name) ? 1 : 0);
      return entries
        .map((e, i) => [e, i])
        .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
        .map(([e]) => e);
    } catch {
      return [];
    }
  }

  /**
   * Every skill NAME a job can learn: its vanilla skill tree, plus the mastery-key
   * aliases the engine stores under (SM_TWOHAND is listed in the tree but read as
   * SM_TWOHANDSWORD), plus any PS-custom skill whose ps_custom_constants.json job
   * list includes this job. Memoized per job.
   */
  _learnableSkillNames(jobId) {
    if (this.__learnable == null) this.__learnable = new Map();
    const cacheKey = `${jobId}:${this._usePsData ? "ps" : "std"}`;
    if (this.__learnable.has(cacheKey)) return this.__learnable.get(cacheKey);

    let names = [];
    try {
      const treeData = this._loadJson("tables/skill_tree.json");
      names = (treeData.jobs || {})[String(jobId)] || [];
    } catch {
      names = [];
    }
    const set = new Set(names);
    // Tree name -> the key masteryFix.js/statusCalculator.js actually look up.
    if (set.has("SM_TWOHAND")) set.add("SM_TWOHANDSWORD");
    if (this._usePsData) {
      for (const rec of this.getPsCustomSkills()) {
        if ((rec.job || []).includes(jobId)) set.add(rec.constant);
      }
    }
    this.__learnable.set(cacheKey, set);
    return set;
  }

  /**
   * Drop mastery/passive levels the job cannot actually learn.
   *
   * A build's `mastery_levels` map is free-form (share URLs, the API, and the
   * editor's own state all write to it), and the editor does not clear it when the
   * job changes — so levels from a previously selected job linger and get applied
   * silently. That is a real damage/stat bug, not a cosmetic one: e.g. a leftover
   * Martial Arts (MO_IRONHAND) Lv10 adds +20 FLEE on PS to a character that can
   * never have the skill.
   *
   * Fails OPEN: if the job has no known skill tree (an unmapped job id) the
   * map is returned untouched rather than emptied. Gear-granted skills are NOT
   * affected — those are merged into effective_mastery later, by design (a card
   * really can grant a skill outside your tree).
   *
   * Returns { levels, dropped } — `dropped` lists the removed skill names.
   */
  filterMasteryLevelsForJob(jobId, masteryLevels) {
    const levels = masteryLevels || {};
    const learnable = this._learnableSkillNames(jobId);
    if (learnable.size === 0) return { levels, dropped: [] };
    const out = {};
    const dropped = [];
    for (const [name, lv] of Object.entries(levels)) {
      if (learnable.has(name)) out[name] = lv;
      else dropped.push(name);
    }
    return dropped.length ? { levels: out, dropped } : { levels, dropped: [] };
  }

  getSkillIdByName(name) {
    if (this._skillNameToId == null) {
      const mapping = {};
      try {
        const data = this._loadJson("db/skills.json");
        for (const [sid, sdata] of Object.entries(data.skills || {})) {
          if (sdata.name) mapping[sdata.name] = Number(sid);
        }
      } catch {
        // ignore
      }
      // PS-custom constants (PS_*) are absent from the vanilla skill DB, so an item
      // script naming one (Corruptor Card's PS_CORRUPTINGDRAIN) resolved to null and
      // its whole bonus was silently dropped. Register them too — whether the engine
      // can PRICE the skill is a separate question, answered where it is consumed.
      try {
        for (const rec of this.getPsCustomSkills()) {
          if (rec.constant && rec.id != null && !(rec.constant in mapping)) mapping[rec.constant] = Number(rec.id);
        }
      } catch {
        // ignore
      }
      this._skillNameToId = mapping;
    }
    return this._skillNameToId[name] ?? null;
  }

  getSkillsForJob(jobId) {
    try {
      const data = this._loadJson("tables/skill_tree.json");
      return new Set((data.jobs || {})[String(jobId)] || []);
    } catch {
      return new Set();
    }
  }

  // ---------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------
  getSizeFixMultiplier(weaponType, targetSize) {
    const data = this._loadJson("tables/size_fix.json");
    const wIdx = data.weapon_types.indexOf(weaponType);
    const sIdx = data.sizes.indexOf(targetSize);
    if (wIdx === -1 || sIdx === -1) return 100;
    return data.table[sIdx][wIdx];
  }

  getRefineBonus(weaponLevel, refine) {
    if (weaponLevel < 1 || weaponLevel > 4 || refine < 0) return 0;
    const data = this._loadJson("tables/refine_weapon.json");
    const rate = data.bonus[weaponLevel];
    return rate * refine;
  }

  getOverrefine(weaponLevel, refine) {
    if (weaponLevel < 1 || weaponLevel > 4 || refine <= 0) return 0;
    const data = this._loadJson("tables/refine_weapon.json");
    const safeStart = data.safe_refine_start[weaponLevel];
    const rndBonusV = data.random_bonus_value[weaponLevel];
    if (safeStart === 0 || rndBonusV === 0 || refine < safeStart) return 0;
    const randombonusMax = rndBonusV * (refine - safeStart + 1);
    return Math.floor(randombonusMax / 100);
  }

  getArmorRefineUnits(refine) {
    if (refine <= 0) return 0;
    const data = this._loadJson("tables/refine_armor.json");
    return refine * data.stats_per_level;
  }

  getMasteryMultiplier(masteryKey, build) {
    const data = this._loadJson("tables/mastery_fix.json");
    const mastery = (data.masteries || {})[masteryKey];
    if (!mastery) return 1;
    if (build.is_riding_peco && "riding_peco" in mastery) return mastery.riding_peco;
    return mastery.default ?? 1;
  }

  getElementName(elementId) {
    return ELEMENT_NAMES[elementId] ?? "Neutral";
  }

  getAttrFixMultiplier(weaponElement, targetElement, elementLevel) {
    const data = this._loadJson("tables/attr_fix.json");
    const level = String(elementLevel || 1);
    return ((((data.table || {})[targetElement] || {})[level] || {})[weaponElement]) ?? 100;
  }

  getMasteryWeaponMap() {
    const data = this._loadJson("tables/mastery_weapon_map.json");
    return data.mapping || {};
  }

  getActiveStatusConfig(statusKey) {
    const data = this._loadJson("tables/active_status_bonus.json");
    return (data.bonuses || {})[statusKey] || {};
  }

  // ---------------------------------------------------------------
  // Item / skill descriptions
  // ---------------------------------------------------------------
  getItemDescription(itemId) {
    if (itemId < 0) {
      const card = this.getConvenienceCards().find((c) => c.id === itemId);
      if (!card) return null;
      return { name: card.name, description: card.description, compound_on: card.compound_on };
    }
    const strId = String(itemId);
    let base = {};
    try {
      const data = this._loadJson("db/item_descriptions.json");
      base = { ...((data.items || {})[strId] || {}) };
    } catch {
      base = {};
    }
    for (const src of [this._loadPsItemOverrides(), this._loadPsItemManual()]) {
      const entry = src[strId] || {};
      if ("description" in entry) base.description = entry.description;
      if ("name" in entry) base.name = entry.name;
    }
    return Object.keys(base).length ? base : null;
  }

  getSkillDescription(skillConstant) {
    try {
      const data = this._loadJson("db/skill_descriptions.json");
      return (data.skills || {})[skillConstant] || null;
    } catch {
      return null;
    }
  }

  getSkillDisplayName(constant, profile = null, short = false) {
    if (profile != null && profile.use_ps_skill_names) {
      const psEntry = this.getPsSkill(constant);
      if (psEntry && psEntry.name) return psEntry.name;
    }
    const desc = this.getSkillDescription(constant);
    if (desc) {
      if (short && desc.short_name) return desc.short_name;
      if (desc.name) return desc.name;
    }
    return constant;
  }

  // ---------------------------------------------------------------
  // Job stat bonuses
  // ---------------------------------------------------------------
  static get JOBL_UPPER_JOBS() {
    const s = new Set();
    for (let i = 4001; i <= 4022; i++) s.add(i);
    return s;
  }

  _parseJobBonusTable() {
    if (!this.__jobBonusTable) {
      const data = this._loadJson("tables/job_bonus_table.json");
      const out = {};
      for (const [k, v] of Object.entries(data.job_bonuses || {})) out[Number(k)] = v;
      this.__jobBonusTable = out;
    }
    return this.__jobBonusTable;
  }

  // `profile` is optional and only consulted for its `ps_job_bonuses`
  // override table (e.g. Gunslinger's PS-specific per-level stat list) --
  // passing it here instead of duplicating this branch at every call site
  // (statusCalculator.js and the /data/job-bonus-stats route both need it).
  getJobBonusStats(jobId, jobLevel, profile = null) {
    const psJb = profile != null ? (profile.ps_job_bonuses || {})[jobId] : null;
    if (psJb != null) {
      const jb = { str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0 };
      for (const [lv, stat] of psJb) {
        if (lv <= jobLevel) jb[stat] += 1;
      }
      return jb;
    }

    const table = this._parseJobBonusTable();
    const codes = table[jobId] || [];
    const result = { str_: 0, agi: 0, vit: 0, int_: 0, dex: 0, luk: 0 };
    const codeToKey = { 1: "str_", 2: "agi", 3: "vit", 4: "int_", 5: "dex", 6: "luk" };
    for (const code of codes.slice(0, jobLevel)) {
      const key = codeToKey[code];
      if (key) result[key] += 1;
    }
    return result;
  }

  _parseStatpointTable() {
    if (!this.__statpointTable) {
      const data = this._loadJson("tables/statpoint_table.json");
      this.__statpointTable = data.stat_points;
    }
    return this.__statpointTable;
  }

  getStatPointsAtLevel(baseLevel, jobId) {
    const table = this._parseStatpointTable();
    const idx = Math.min(Math.max(baseLevel, 1), table.length) - 1;
    let points = table.length ? table[idx] : 48;
    if (DataLoader.JOBL_UPPER_JOBS.has(jobId)) points += 52;
    return points;
  }

  // ---------------------------------------------------------------
  // PS skill database
  // ---------------------------------------------------------------
  _loadPsSkillDb() {
    if (this.__psSkillDb) return this.__psSkillDb;
    const raw = readJsonSafe(path.join(PS_DIR, "ps_skill_db.json"), {});
    const result = {};
    for (const record of Object.values(raw)) {
      const constant = record.constant;
      if (constant) result[constant] = record;
    }
    const overrides = readJsonSafe(path.join(PS_DIR, "ps_skill_desc_overrides.json"), {});
    for (const [constant, patch] of Object.entries(overrides)) {
      if (constant.startsWith("_comment")) continue;
      if (result[constant]) result[constant] = { ...result[constant], ...patch };
      else result[constant] = patch;
    }
    this.__psSkillDb = result;
    return result;
  }

  getPsSkill(skillName) {
    return this._loadPsSkillDb()[skillName] || null;
  }

  getPsCustomSkills() {
    const customPath = path.join(PS_DIR, "ps_custom_constants.json");
    const jobById = {};
    const raw = readJsonSafe(customPath, {});
    for (const [sid, value] of Object.entries(raw)) {
      const skillId = Number(sid);
      if (Number.isNaN(skillId)) continue;
      if (value && typeof value === "object") jobById[skillId] = value.job || [];
    }
    const result = [];
    for (const record of Object.values(this._loadPsSkillDb())) {
      if (!(record.constant || "").startsWith("PS_")) continue;
      result.push({ ...record, job: jobById[record.id ?? -1] || [] });
    }
    return result;
  }

  // PS-custom ACTIVE damage skills (e.g. Trick Arrow, Quick Step) as battle-ready
  // skill objects keyed by id. Only entries that carry battle fields (attack_type)
  // in ps_skill_db.json qualify — passive/proc customs (Holy Strike) are skipped.
  // `name` is set to the constant so weapon_ratios / magic_ratios resolve, mirroring
  // how vanilla skills key their ratio lookups.
  _psCustomBattleSkills() {
    if (this.__psCustomBattle == null) {
      const byId = {};
      for (const rec of this.getPsCustomSkills()) {
        if (!rec.attack_type) continue;
        byId[rec.id] = {
          id: rec.id,
          name: rec.constant,
          description: rec.name || rec.constant,
          max_level: rec.max_level || 1,
          attack_type: rec.attack_type,
          element: rec.element || ["Ele_Weapon"],
          damage_type: rec.damage_type || [],
          number_of_hits: rec.number_of_hits || [1],
          // -1 means "use the wielder's weapon range", which is how Hercules reads a
          // NEGATIVE range (skill_get_range2). These records are SYNTHESIZED for PS-custom
          // skills and carry no real range, so the sentinel is the honest value: it keeps
          // battlePipeline's long/short classification falling back to the weapon instead
          // of silently forcing every PS-custom skill to Short. A literal [1] did exactly
          // that once resolveIsRanged started reading this field, costing bow Rogues their
          // bLongAtkRate on Trick Arrow and Quick Step.
          // -1 means "use the wielder's weapon range", which is how Hercules reads a
          // NEGATIVE range (skill_get_range2). These records are SYNTHESIZED and carry no
          // numeric range — ps_skill_db's `range` is scraped PROSE ("9 Cells + Vulture's
          // Eye"), not a number, so it must not be passed through into a numeric field.
          // The sentinel keeps battlePipeline's long/short classification falling back to
          // the weapon. A literal [1] forced every PS-custom skill Short once
          // resolveIsRanged began reading this, costing bow Rogues their bLongAtkRate.
          range: [-1],
          skill_type: ["Enemy"],
        };
      }
      this.__psCustomBattle = byId;
    }
    return this.__psCustomBattle;
  }

  // ---------------------------------------------------------------
  // Hidden item/mob filters (read-only — toggling not exposed via API)
  // ---------------------------------------------------------------
  _loadHiddenItems() {
    if (!this.__hiddenItems) {
      this.__hiddenItems = readJsonSafe(path.join(PRE_RE, "db/hidden_items.json"), []);
    }
    return this.__hiddenItems;
  }

  _loadHiddenMobs() {
    if (!this.__hiddenMobs) {
      this.__hiddenMobs = readJsonSafe(path.join(PRE_RE, "db/hidden_mobs.json"), []);
    }
    return this.__hiddenMobs;
  }

  _loadPsHiddenItems() {
    if (!this.__psHiddenItems) {
      this.__psHiddenItems = readJsonSafe(path.join(PS_DIR, "ps_hidden_items.json"), []);
    }
    return this.__psHiddenItems;
  }

  _loadPsHiddenMobs() {
    if (!this.__psHiddenMobs) {
      this.__psHiddenMobs = readJsonSafe(path.join(PS_DIR, "ps_hidden_mobs.json"), []);
    }
    return this.__psHiddenMobs;
  }

  isItemHidden(itemId) {
    if (this._loadHiddenItems().includes(itemId)) return true;
    if (this._usePsData && this._loadPsHiddenItems().includes(itemId)) return true;
    return false;
  }

  isMobHidden(mobId) {
    if (this._loadHiddenMobs().includes(mobId)) return true;
    if (this._usePsData && this._loadPsHiddenMobs().includes(mobId)) return true;
    return false;
  }
}

const loader = new DataLoader();

module.exports = { DataLoader, loader };
