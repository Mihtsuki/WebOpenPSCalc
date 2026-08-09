export interface BaseStats {
  str: number;
  agi: number;
  vit: number;
  int: number;
  dex: number;
  luk: number;
}

export interface WildcardSlot {
  type: "race" | "size" | "ele" | "family"; // "family" = monster-family/Type card (Orc/Goblin/Kobold/Golem-Bane, bAddRace2)
  bonus: number;
}

export interface BuildData {
  name: string;
  job_name?: string;
  job_id: number;
  base_level: number;
  job_level: number;
  base_stats: BaseStats;
  bonus_stats: Record<string, number>;
  equipped: Record<string, number | null>;
  refine: Record<string, number>;
  // Forged-weapon Star Crumb bonus, per weapon slot (sc = crumbs 0–3, ranked forge).
  forge?: Record<string, { sc: number; ranked: boolean }>;
  target_mob_id: number | null;
  server: string;
  weapon_element?: string;
  active_buffs?: Record<string, number>;
  mastery_levels?: Record<string, number>;
  flags?: Record<string, unknown>;
  manual_adj?: Record<string, unknown>;
  support_buffs?: Record<string, unknown>;
  player_active_scs?: Record<string, unknown>;
  song_state?: Record<string, number>;
  consumable_buffs?: ConsumableBuffs;
  selected_pet?: string;
  clan?: string;
  wildcard_slots?: Record<string, WildcardSlot[]>;
}

export interface ConsumableBuffs {
  aspd_potion?: number;
  atk_item?: number;
  matk_item?: number;
  box_resentment?: boolean;  // Box of Resentment: +20 ATK
  box_drowsiness?: boolean;  // Box of Drowsiness: +20 MATK
  box_gloom?: boolean;       // Box of Gloom: casts Improve Concentration Lv1 (+3% AGI/DEX)
}

export interface SkillState {
  id: number;
  level: number;
  label: string;
  max_level: number;
}

export interface CustomTarget {
  def_: number;
  mdef_: number;
  vit: number;
  level: number;
  size: string;
  race: string;
  element: number;
  element_level: number;
  is_boss: boolean;
  luk: number;
  agi: number;
  int_: number;
}

export interface PassiveSkill {
  name: string;
  mastery_key: string;
  description: string;
  max_level: number;
}

export interface EquippedItemInfo {
  id: number;
  name: string;
  type?: string;
  slots?: number;
  refineable?: boolean;
  job?: number[];
}

export interface SearchResult {
  id: number;
  label: string;
  sublabel: string;
  disabled?: boolean;
  max_level?: number;
}

export type TargetMode = "monster" | "custom";

export interface TargetMods {
  element_status: string;
  element_change: string; // Sage Elemental Change: override target element to Water/Earth/Fire/Wind ("" = off). No effect on MVP/boss.
  lex_aeterna: boolean;
  venom_dust: boolean; // Venom Dust (Assassin): target on it takes +10% phys & magic damage. Works on bosses.
  breaking_cloak: boolean; // Cloak initiative (Assassin, Cloak Lv3+): opening auto-attack ×2, or Sonic Blow +10%.
  performing: boolean; // Performing (Bard/Dancer): while a song/dance is active, Musical Strike & Throw Arrow gain +100 ratio points.
  quagmire: number; // WZ_QUAGMIRE level 0–5 (0 = off). Legacy shared URLs may carry a boolean.
  signum_crucis: boolean;
  provoke: number; // SC_PROVOKE level 0–10 (0 = off). Legacy shared URLs may carry a boolean.
  sleep: boolean;
  stun: boolean;
  burning: number; // Burning stacks 0–5 (0 = off): −2 hard MDEF per stack, plus 60 Fire magic damage/s per stack.
}

export interface UrlEditorState {
  build: BuildData;
  skill: SkillState;
  targetMode: TargetMode;
  customTarget: CustomTarget;
  targetMods?: TargetMods;
}

export interface Breakpoints {
  aspd: {
    current: number;
    agi: { plus: number; aspd: number }[];
    dex: { plus: number; aspd: number }[];
  };
  cast: {
    skill: string;
    current_ms: number;
    current_dex?: number;
    instant_plus_dex: number | null;
    next_jumps?: { plus: number; dex: number; ms: number }[];
  } | null;
  hit: { current_pct: number; to95: number | null; to100: number | null } | null;
  int: {
    matk_min: number;
    matk_max: number;
    current_int: number;
    max_jumps: { plus: number; int: number; matk_max: number }[];
    min_jumps: { plus: number; int: number; matk_min: number }[];
    sp_regen: number;
    sp_jumps: { plus: number; int: number; sp_regen: number }[];
  } | null;
}
