/**
 * bonusDefinitions.js — JS port of core/bonus_definitions.py
 *
 * Single source of truth for item script bonus type definitions, shared by
 * itemScriptParser.js and gearBonusAggregator.js.
 */

const RACE_NAMES = {
  RC_Formless: "Formless", RC_Undead: "Undead", RC_Brute: "Brute",
  RC_Plant: "Plant", RC_Insect: "Insect", RC_Fish: "Fish",
  RC_Demon: "Demon", RC_DemiHuman: "Demi-Human", RC_Angel: "Angel",
  RC_Dragon: "Dragon", RC_Boss: "Boss monsters",
  RC_NonBoss: "Normal monsters", RC_All: "all races",
  RC_DemiPlayer: "Demi-Human & Players",
  RC_NonDemiPlayer: "All except Demi-Human & Players",
  RC_NonPlayer: "All non-player races",
};

const ELEMENT_NAMES = {
  Ele_Neutral: "Neutral", Ele_Water: "Water", Ele_Earth: "Earth",
  Ele_Fire: "Fire", Ele_Wind: "Wind", Ele_Poison: "Poison",
  Ele_Holy: "Holy", Ele_Dark: "Dark", Ele_Ghost: "Ghost",
  Ele_Undead: "Undead", Ele_All: "all elements",
};

const ELE_STR_TO_INT = {
  Ele_Neutral: 0, Ele_Water: 1, Ele_Earth: 2, Ele_Fire: 3,
  Ele_Wind: 4, Ele_Poison: 5, Ele_Holy: 6, Ele_Dark: 7,
  Ele_Ghost: 8, Ele_Undead: 9,
};

const SIZE_NAMES = {
  Size_Small: "Small", Size_Medium: "Medium", Size_Large: "Large",
  Size_All: "all sizes",
};

const STATUS_NAMES = {
  Eff_Poison: "Poison", SC_POISON: "Poison",
  Eff_Curse: "Curse", SC_CURSE: "Curse",
  Eff_Silence: "Silence", SC_SILENCE: "Silence",
  Eff_Sleep: "Sleep", SC_SLEEP: "Sleep",
  Eff_Stun: "Stun", SC_STUN: "Stun",
  Eff_Freeze: "Freeze", SC_FREEZE: "Freeze",
  Eff_Stone: "Stone", SC_STONE: "Stone",
  Eff_Blind: "Blind", SC_BLIND: "Blind",
  Eff_Bleeding: "Bleeding", SC_BLEEDING: "Bleeding",
  Eff_Confusion: "Confusion", SC_CONFUSION: "Confusion",
  SC_PS_HYPOTHERMIA: "Hypothermia",
  SC_CHILLED: "Chilled",
};

const CLASS_NAMES = {
  Class_Normal: "Normal monsters", Class_Boss: "Boss monsters",
  Class_Guardian: "Guardians", Class_All: "all monster types",
};

const race = (v) => RACE_NAMES[v] ?? v;
const ele = (v) => ELEMENT_NAMES[v] ?? v;
const size = (v) => SIZE_NAMES[v] ?? v;
const cls = (v) => CLASS_NAMES[v] ?? v;
const sc = (v) => STATUS_NAMES[v] ?? v;

/**
 * BonusDef shape: { description(...params)->string, field, mode, fields, transform, keys }
 * mode: "add" | "dict" | "dict_keys" | "multi" | "assign"
 */
function def(description, field = null, mode = "add", extra = {}) {
  return { description, field, mode, fields: extra.fields ?? null, transform: extra.transform ?? null, keys: extra.keys ?? null, value: extra.value ?? null };
}

const BONUS1 = {
  bStr: def((v) => (v > 0 ? `STR +${v}.` : `STR ${v}.`), "str_"),
  bAgi: def((v) => (v > 0 ? `AGI +${v}.` : `AGI ${v}.`), "agi"),
  bVit: def((v) => (v > 0 ? `VIT +${v}.` : `VIT ${v}.`), "vit"),
  bInt: def((v) => (v > 0 ? `INT +${v}.` : `INT ${v}.`), "int_"),
  bDex: def((v) => (v > 0 ? `DEX +${v}.` : `DEX ${v}.`), "dex"),
  bLuk: def((v) => (v > 0 ? `LUK +${v}.` : `LUK ${v}.`), "luk"),
  bAllStats: def((v) => (v > 0 ? `All Stats +${v}.` : `All Stats ${v}.`), null, "multi", { fields: ["str_", "agi", "vit", "int_", "dex", "luk"] }),
  bAgiVit: def((v) => `AGI +${v}, VIT +${v}.`, null, "multi", { fields: ["agi", "vit"] }),
  bAgiDexStr: def((v) => `AGI +${v}, DEX +${v}, STR +${v}.`, null, "multi", { fields: ["agi", "dex", "str_"] }),

  bAtk: def((v) => (v > 0 ? `Weapon ATK +${v}.` : `Weapon ATK ${v}.`), "weapon_atk_flat"),
  bBaseAtk: def((v) => (v > 0 ? `ATK +${v}.` : `ATK ${v}.`), "batk"),
  bMatk: def((v) => (v > 0 ? `MATK +${v}.` : `MATK ${v}.`), "matk"),
  bHit: def((v) => (v > 0 ? `HIT +${v}.` : `HIT ${v}.`), "hit"),
  bFlee: def((v) => (v > 0 ? `FLEE +${v}.` : `FLEE ${v}.`), "flee"),
  bFlee2: def((v) => (v > 0 ? `Perfect Dodge +${v}.` : `Perfect Dodge ${v}.`), "flee2"),
  bCritical: def((v) => (v > 0 ? `CRIT +${v}.` : `CRIT ${v}.`), "cri"),
  bCritAtkRate: def((v) => (v > 0 ? `Critical damage +${v}%.` : `Critical damage ${v}%.`), "crit_atk_rate"),
  bLongAtkRate: def((v) => (v > 0 ? `Long-range damage +${v}%.` : `Long-range damage ${v}%.`), "long_atk_rate"),
  bAtkRate: def((v) => `Physical ATK +${v}%.`, "atk_rate"),
  bHolyStrikeChance: def((v) => `+${v}% Holy Strike proc chance.`, "holy_strike_bonus_chance"),

  bMaxHP: def((v) => (v > 0 ? `MaxHP +${v}.` : `MaxHP ${v}.`), "maxhp"),
  bMaxSP: def((v) => (v > 0 ? `MaxSP +${v}.` : `MaxSP ${v}.`), "maxsp"),
  bMaxHPrate: def((v) => (v > 0 ? `MaxHP +${v}%.` : `MaxHP ${v}%.`), "maxhp_rate"),
  bMaxSPrate: def((v) => (v > 0 ? `MaxSP +${v}%.` : `MaxSP ${v}%.`), "maxsp_rate"),

  bDef: def((v) => (v > 0 ? `DEF +${v}.` : `DEF ${v}.`), "def_"),
  bVitDef: def((v) => (v > 0 ? `Soft DEF +${v}.` : `Soft DEF ${v}.`), "def2"),
  bMdef: def((v) => (v > 0 ? `MDEF +${v}.` : `MDEF ${v}.`), "mdef_"),
  bNearAtkDef: def((v) => `Near-range damage resistance +${v}%.`, "near_atk_def_rate"),
  bLongAtkDef: def((v) => `Long-range damage resistance +${v}%.`, "long_atk_def_rate"),
  bMagicDefRate: def((v) => `Magic damage reduction +${v}%.`, "magic_def_rate"),
  bIgnoreMdefRate: def((v) => `Ignores ${v}% of all targets' MDEF.`, "ignore_mdef_rate", "dict_keys", { keys: ["RC_NonBoss", "RC_Boss"] }),
  bDefRatioAtkRace: def((v) => `Bypasses DEF against ${race(String(v))}.`, "def_ratio_atk_race", "dict"),

  bAspdRate: def((v) => (v > 0 ? `ASPD +${v}%.` : `ASPD ${v}%.`), "aspd_percent"),
  bAspd: def((v) => (v > 0 ? `ASPD +${v} (flat).` : `ASPD ${v} (flat).`), "aspd_add"),

  bCastrate: def((v) => `Casting time ${v < 0 ? "reduced" : "increased"} by ${Math.abs(v)}%.`, "castrate"),
  bVarCastrate: def((v) => `Casting time ${v < 0 ? "reduced" : "increased"} by ${Math.abs(v)}%.`, "castrate"),
  bDelayrate: def((v) => `After-cast delay ${v < 0 ? "reduced" : "increased"} by ${Math.abs(v)}%.`, "delayrate"),

  bMatkRate: def((v) => (v > 0 ? `MATK +${v}%.` : `MATK ${v}%.`), "matk_rate"),

  bDoubleRate: def((v) => `+${v}% chance to deal double damage on a normal attack.`, "double_rate"),

  bAtkEle: def((v) => `Changes weapon element to ${ELEMENT_NAMES[String(v)] ?? String(v)}.`, "script_atk_ele_rh", "assign", { transform: (x) => ELE_STR_TO_INT[x] }),
  bDefEle: def((v) => `Changes armor element to ${ELEMENT_NAMES[String(v)] ?? String(v)}.`, "script_def_ele", "assign", { transform: (x) => ELE_STR_TO_INT[x] }),

  // Ignore 100% of the target's (hard) DEF for a race/boss group — e.g. race-killer
  // cards' "bonus bIgnoreDefRace,RC_Plant". Feeds ignore_def_rate, keyed by race,
  // which calculateDefenseFix already consumes. (Was a no-op: no field/mode.)
  bIgnoreDefRace: def((v) => `Physical damage ignores the DEF of ${RACE_NAMES[String(v)] ?? String(v)} targets.`, "ignore_def_rate", "dict_const", { value: 100 }),
  bShortWeaponDamageReturn: def((v) => `Reflects ${v}% melee physical damage back to attacker.`),
  bHPrecovRate: def((v) => (v > 0 ? `Natural HP recovery +${v}%.` : `Natural HP recovery ${v}%.`)),
  bSPrecovRate: def((v) => (v > 0 ? `Natural SP recovery +${v}%.` : `Natural SP recovery ${v}%.`)),
  bUseSPrate: def((v) => `SP consumption ${v < 0 ? "reduced" : "increased"} by ${Math.abs(v)}%.`),
  bHealPower: def((v) => `Heal effectiveness +${v}%.`, "heal_power"),
  bHealBombFull: def(() => `Offensive Heal deals full (100%) value as damage to Undead.`, "heal_bomb_full", "assign"),
  // PS-specific, like bHealBombFull above: not a Hercules bonus. Crescent Scythe
  // (and its slotted variant) heal the wielder for 0.1% of the damage dealt PER
  // REFINE on a critical hit, so the item script passes getrefine() and the value
  // is read as PER MILLE of the crit damage (refine 10 => 1%).
  bCritHeal: def((v) => `Critical hits heal you for ${(v / 10).toFixed(1)}% of the damage dealt.`, "crit_heal_permille"),
  // PS-specific: Wootan Fighter Card raises Magnum Break's lingering fire enchantment
  // from its base 20% to this value. "assign" (not additive) so two copies of the card
  // still cap at the stated figure rather than stacking to 40%.
  bMagnumLinger: def((v) => `Magnum Break's lingering fire effect becomes ${v}% (base 20%).`, "magnum_linger_pct", "assign"),
  bSpeedRate: def((v) => (v > 0 ? `Movement speed +${v}%.` : `Movement speed ${v}%.`)),
  bSplashRange: def((v) => `Attack splash range +${v} cells.`),
  bSPDrainValue: def((v) => `Drains ${v} SP per physical hit.`),
  bBreakArmorRate: def((v) => `${Math.round(v / 100)}% chance to break the target's armor per hit.`),
  bBreakWeaponRate: def((v) => `${Math.round(v / 100)}% chance to break the target's weapon per hit.`),
  bUnbreakableWeapon: def(() => "Weapon cannot be broken."),
  bUnbreakableHelm: def(() => "Headgear cannot be broken."),
  // Ignore 100% of the target's MDEF for a given race/boss group (e.g. High Wizard
  // Card: bonus bIgnoreMdefRace,RC_NonBoss). Feeds ignore_mdef_rate, keyed by race.
  bIgnoreMdefRace: def((r) => `Magic damage ignores the MDEF of ${race(r)} targets.`, "ignore_mdef_rate", "dict_const", { value: 100 }),
  // Drake Card etc.: physical damage ignores the target's size (no size penalty).
  // Sets a flag on the build that baseDamage.js reads to skip Size Fix.
  bNoSizeFix: def(() => "Damage is unaffected by the target's size (no size penalty).", "no_sizefix", "assign", { transform: () => true }),
};

const BONUS2 = {
  bAddRace: def((r, v) => `Increases physical damage against ${race(r)} by ${v}%.`, "add_race", "dict"),
  // Monster-family "Bane" cards (Orc Lady, Goblin/Kobold Leader, Lava Golem, etc.).
  // Keyed by RC2 family; applied only when the target mob belongs to that family.
  bAddRace2: def((rc2, v) => `Increases physical damage against the ${String(rc2).replace(/^RC2_/, "")} monster family by ${v}%.`, "add_race2", "dict"),
  bSubEle: def((e, v) => (v > 0 ? `Reduces damage from ${ele(e)}-element attacks by ${v}%.` : `Increases damage from ${ele(e)}-element attacks by ${Math.abs(v)}%.`), "sub_ele", "dict"),
  bSubRace: def((r, v) => (v > 0 ? `Reduces damage from ${race(r)} by ${v}%.` : `Increases damage from ${race(r)} by ${Math.abs(v)}%.`), "sub_race", "dict"),
  bAddSize: def((s, v) => `Increases physical damage against ${size(s)} monsters by ${v}%.`, "add_size", "dict"),
  bAddEle: def((e, v) => `Increases physical damage against ${ele(e)}-element monsters by ${v}%.`, "add_ele", "dict"),
  bAddAtkEle: def((e, v) => `Increases damage of ${ele(e)}-element attacks by ${v}%.`, "add_atk_ele", "dict"),
  bIgnoreDefRate: def((r, v) => `Ignores ${v}% of ${race(r)} DEF.`, "ignore_def_rate", "dict"),
  bIgnoreDefEle: def((e, v) => `Ignores ${v}% of ${ele(e)}-element target's DEF.`, "ignore_def_ele", "dict"),
  bIgnoreMdefRate: def((r, v) => `Ignores ${v}% of ${race(r)} MDEF.`, "ignore_mdef_rate", "dict"),
  bSkillAtk: def((sk, v) => `Increases ${sk} damage by ${v}%.`, "skill_atk", "dict"),
  bSkillHeal: def((sk, v) => `Increases ${sk} healing by ${v}%.`, "skill_heal", "dict"),
  bSkillSpCost: def((sk, v) => `${v > 0 ? "Increases" : "Reduces"} ${sk} SP cost by ${Math.abs(v)}.`, null),
  bCastrate: def((sk, v) => `${v < 0 ? "Reduces" : "Increases"} ${sk} cast time by ${Math.abs(v)}%.`, "skill_castrate", "dict"),
  bDelayrate: def((sk, v) => `${v < 0 ? "Reduces" : "Increases"} ${sk} after-cast delay by ${Math.abs(v)}%.`, "skill_delayrate", "dict"),
  bWeaponAtk: def((wtype, v) => `+${v}% ATK with ${wtype}-type weapons.`, "weapon_atk_rate", "dict"),
  bDefRatioAtkEle: def((e, v) => `Bypasses DEF against ${ele(e)}-element targets.`, "def_ratio_atk_ele", "dict"),
  bDefRatioAtkRace: def((r, v) => `Bypasses DEF against ${race(r)}.`, "def_ratio_atk_race", "dict"),

  bMagicAddRace: def((r, v) => `Increases magic damage against ${race(r)} by ${v}%.`, "magic_add_race", "dict"),
  bMagicAddEle: def((e, v) => `Increases magic damage against ${ele(e)}-element monsters by ${v}%.`, "magic_add_ele", "dict"),
  bCriticalAddRace: def((r, v) => `CRIT rate +${v} against ${race(r)}.`, "crit_add_race", "dict"),
  bExpAddRace: def((r, v) => `EXP gain +${v}% from ${race(r)}.`),
  bResEff: def((scKey, v) => `Increases resistance to ${sc(scKey)} by ${Math.floor(v / 100)}%.`),
  bAddEff: def((scKey, v) => `${Math.floor(v / 100)}% chance to inflict ${sc(scKey)} on hit.`),
  bAddEffWhenHit: def((scKey, v) => `${Math.floor(v / 100)}% chance to inflict ${sc(scKey)} when hit.`),
  bAddEff2: def((scKey, v) => `${Math.floor(v / 100)}% chance to self-inflict ${sc(scKey)} on hit.`),
  // +% physical damage vs a specific monster id (e.g. bonus2 bAddDamageClass,1188,150).
  // Keyed by mob id; applied in cardFix when the target is that monster.
  bAddDamageClass: def((c, v) => `Increases physical damage against monster #${c} by ${v}%.`, "add_damage_class", "dict"),
  bSubSize: def((s, v) => `Reduces damage from ${size(s)} monsters by ${v}%.`),
  bSPGainRace: def((r, v) => `Gains ${v} SP per kill of ${race(r)}.`),
  bAddItemHealRate: def((_id, v) => `Increases healing from items by ${v}%.`),
  bWeaponComaRace: def((r, v) => `${Math.floor(v / 100)}% chance to inflict Coma on ${race(r)} per hit.`),
  bHPDrainRate: def((v1, v2) => `Drains ${v2} HP per ${v1} physical hits.`),
  bHPLossRate: def((v1, v2) => `Loses ${v1} HP every ${Math.round(v2 / 1000)} seconds.`),
  bAddMonsterDropItem: def((_id, v) => `Monsters drop an item at ${(v / 100).toFixed(2)}% rate.`),
  bSPDrainRate: def((v1, v2) => `Drains ${v2} SP per ${v1} physical hits.`),
  bAddSkillBlow: def((sk, v) => `${sk} knocks enemies back ${v} cells.`),
};

const BONUS3 = {
  bAutoSpell: def((sk, lv, v) => `${Math.floor(v / 10)}% chance to auto-cast ${sk} Lv.${lv} on physical attack.`),
  bAutoSpellWhenHit: def((sk, lv, v) => `${Math.floor(v / 10)}% chance to auto-cast ${sk} Lv.${lv} when hit.`),
  bAddEffOnSkill: def((sk, scKey, v) => `${Math.floor(v / 100)}% chance to inflict ${sc(scKey)} on ${sk} hit.`),
  bAddEff: def((scKey, v1, _v2) => `[Conditional] ${Math.floor(v1 / 100)}% chance to inflict ${sc(scKey)}.`),
  bSubEle: def((e, v, _flag) => `Reduces ${ele(e)}-element damage by ${v}% (conditional).`),
  bAddMonsterDropItem: def((_id, v, _ty) => `Monsters drop an item at ${(v / 100).toFixed(2)}% rate (type-conditional).`),
  bAddClassDropItem: def((c, v, _ty) => `${cls(c)} drop an item at ${(v / 100).toFixed(2)}% rate.`),
  bAddEffWhenHit: def((scKey, v1, _flag) => `[Conditional] ${Math.floor(v1 / 100)}% chance to inflict ${sc(scKey)} when hit.`),
  bSPDrainRate: def((v1, v2, _flag) => `Drains ${v2} SP per ${v1} hits (conditional).`),
};

const BONUS4 = {
  bAutoSpell: def((sk, lv, v, _flag) => `${Math.floor(v / 10)}% chance to auto-cast ${sk} Lv.${lv} on physical attack.`),
  bAutoSpellWhenHit: def((sk, lv, v, _flag) => `${Math.floor(v / 10)}% chance to auto-cast ${sk} Lv.${lv} when hit.`),
  bAutoSpellOnSkill: def((src, proc, lv, v) => `${Math.floor(v / 10)}% chance to auto-cast ${proc} Lv.${lv} when using ${src}.`),
};

// Hercules item scripts in the wild are inconsistent about bonus-type casing
// (bCastrate vs bCastRate, etc.) -- build a case-insensitive lookup so a
// script author's casing slip doesn't silently drop the whole bonus.
const BONUS_TABLES = { 1: BONUS1, 2: BONUS2, 3: BONUS3, 4: BONUS4 };
const LOWERCASE_INDEX = {};
for (const [arity, table] of Object.entries(BONUS_TABLES)) {
  const index = {};
  for (const key of Object.keys(table)) index[key.toLowerCase()] = key;
  LOWERCASE_INDEX[arity] = index;
}

// Returns the canonically-cased key for a given arity if a case-insensitive
// match exists in that arity's table, otherwise the token unchanged.
function resolveBonusType(arity, token) {
  return (LOWERCASE_INDEX[arity] || {})[token.toLowerCase()] || token;
}

module.exports = {
  RACE_NAMES, ELEMENT_NAMES, ELE_STR_TO_INT, SIZE_NAMES, STATUS_NAMES, CLASS_NAMES,
  BONUS1, BONUS2, BONUS3, BONUS4, resolveBonusType,
};
