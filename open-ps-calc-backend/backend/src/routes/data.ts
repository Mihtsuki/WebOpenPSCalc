import { Router, Request, Response } from "express";
import { loader } from "../engine/dataLoader";
import { getProfile } from "../engine/serverProfiles";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { importJaludev } = require("../engine/jaludevImport");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TRAP_SKILL_NAMES } = require("../engine/calculators/battlePipeline");

const router = Router();

// Import a build from the jaludev "payonrocalc" calculator (paste its share URL).
router.post("/import/jaludev", (req: Request, res: Response) => {
  applyServerProfile(req);
  try {
    const url = (req.body && req.body.url) || "";
    if (!url) return res.status(400).json({ error: "url is required" });
    res.json(importJaludev(String(url)));
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Failed to import build" });
  }
});

// Skill-name prefixes that never correspond to a Payon Stories (pre-renewal) player
// skill — Renewal 3rd jobs, mercenaries, homunculi, elemental summons, and monster
// (NPC_) skills. They're present in the vanilla skill DB but are pure noise in the
// damage-skill picker. Kept classes: all 1st/2nd/transcendent + the expanded pre-re
// jobs (Ninja NJ, Gunslinger GS, Taekwon TK, Star Gladiator SG, Soul Linker SL).
const NON_PS_SKILL_PREFIXES = new Set([
  // Renewal 3rd jobs
  "RK", "WL", "AB", "GC", "RA", "NC", "LG", "SO", "GN", "SR",
  "SC", "RL", "KO", "OB", "SJ", "SP", "SU", "WM",
  // Mercenaries
  "MER", "MA", "ML", "MS",
  // Homunculi
  "MH", "HVAN", "HFLI", "HLIF", "HAMI", "HD",
  // Elemental summons + shared/monster
  "EL", "ALL", "GD", "NPC",
]);

function applyServerProfile(req: Request) {
  const server = (req.query.server as string) || "payon_stories";
  loader.setProfile(getProfile(server));
  return server;
}

function paginate(arr: any[], req: Request) {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  return { total: arr.length, items: arr.slice(offset, offset + limit), limit, offset };
}

// Rank name-substring search results so the most relevant surface first (a plain
// substring filter left buried, e.g., "Legacy of Dragon" past the result limit for
// a broad query like "le"). Score: whole name starts with q (4) > a word starts
// with q (3) > name contains q (2) > alt/aegis name matches (1); ties by name.
// Returns only the matching entries, best-first.
function rankByQuery<T>(items: T[], q: string, nameOf: (it: T) => string, altOf?: (it: T) => string): T[] {
  const query = q.toLowerCase();
  const scored: { it: T; score: number; name: string }[] = [];
  for (const it of items) {
    const name = (nameOf(it) || "").toLowerCase();
    const alt = (altOf ? altOf(it) : "").toLowerCase();
    let score = 0;
    if (name.startsWith(query)) score = 4;
    else if (name.split(/[^a-z0-9]+/).some((w) => w.startsWith(query))) score = 3;
    else if (name.includes(query)) score = 2;
    else if (alt.includes(query)) score = 1;
    if (score > 0) scored.push({ it, score, name });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.map((x) => x.it);
}

// --- Monster picker disambiguation -----------------------------------------
// Many monsters share a display name: genuinely different variants (Ferus comes
// in Fire and Earth) and event/summoned copies of a field mob (sprites carrying a
// short copy-prefix — G_/E_/S_/M_/R_/EVENT_/META_ — e.g. G_KNIGHT_OF_ABYSS is the
// WoE clone of the field Knight of Abyss). For the picker we:
//   (1) hide an event copy when its de-prefixed base sprite exists as its own mob;
//   (2) collapse remaining same-name mobs that are identical for the calculator
//       (same element/race/size/level/boss) down to one — pure spawn/id copies;
//   (3) tag any name STILL shared by 2+ mobs with a distinguishing suffix: the
//       element in brackets, plus race or level when the element alone doesn't
//       separate them, with a final #id fallback so labels are always unique.
// A copy-prefix is any 1-2 letter token (or EVENT/META) before an underscore; the
// "base sprite must exist" guard means a uniquely-named mob is never dropped.
const MOB_EVENT_PREFIX = /^([A-Z]{1,2}|EVENT|META)_/;
const MOB_ELEMENT_NAMES = ["Neutral", "Water", "Earth", "Fire", "Wind", "Poison", "Holy", "Dark", "Ghost", "Undead"];

let _mobLabelCache: { server: string; labels: Map<number, string>; dropped: Set<number> } | null = null;

function computeMobLabels(server: string) {
  if (_mobLabelCache && _mobLabelCache.server === server) return _mobLabelCache;
  const all = loader.getAllMonsters();
  const sprites = new Set(all.map((m: any) => m.sprite_name).filter(Boolean));
  const eleName = (m: any) => MOB_ELEMENT_NAMES[m.element] ?? String(m.element);

  // (1) Drop event copies whose de-prefixed base sprite exists as another mob —
  // but never drop the last remaining mob of a name (guards against a case like
  // G_SEYREN de-prefixing to the unrelated field mob SEYREN).
  const wantDrop = new Set<number>(
    all.filter((m: any) => {
      const sp = m.sprite_name || "";
      return MOB_EVENT_PREFIX.test(sp) && sprites.has(sp.replace(MOB_EVENT_PREFIX, ""));
    }).map((m: any) => m.id),
  );
  const nameGroups = new Map<string, any[]>();
  for (const m of all) {
    const n = m.name || "";
    if (!nameGroups.has(n)) nameGroups.set(n, []);
    nameGroups.get(n)!.push(m);
  }
  const dropped = new Set<number>();
  for (const ms of nameGroups.values()) {
    if (ms.some((m: any) => !wantDrop.has(m.id))) {
      for (const m of ms) if (wantDrop.has(m.id)) dropped.add(m.id);
    }
  }
  const kept = all.filter((m: any) => !dropped.has(m.id));

  const byName = new Map<string, any[]>();
  for (const m of kept) {
    const n = m.name || "";
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n)!.push(m);
  }

  const distinct = (xs: string[]) => new Set(xs).size;
  const labels = new Map<number, string>();
  for (const [name, members] of byName) {
    // (2) Collapse calc-identical spawn copies (same element/race/size/level) to
    // the lowest id — renewal-id copies and map dupes.
    const seen = new Set<string>();
    const group: any[] = [];
    for (const m of [...members].sort((a, b) => a.id - b.id)) {
      const key = [m.element, m.race, m.size, m.level].join("|");
      if (seen.has(key)) dropped.add(m.id);
      else { seen.add(key); group.push(m); }
    }
    if (group.length === 1) { labels.set(group[0].id, name); continue; }

    // (3) Tag: always show the element in brackets, then add the fewest of
    // race / size / level needed to make every label in the group unique — an
    // attribute is kept only if it raises the distinct-label count. After the
    // collapse above, element+race+size+level is guaranteed to separate them.
    const parts: ((m: any) => string)[] = [(m) => `[${eleName(m)}]`];
    const candidates: ((m: any) => string)[] = [(m) => m.race, (m) => m.size, (m) => `Lv${m.level}`];
    const tagOf = (m: any) => parts.map((f) => f(m)).join(" ");
    for (const f of candidates) {
      if (distinct(group.map(tagOf)) === group.length) break;
      if (distinct(group.map((m) => `${tagOf(m)}|${f(m)}`)) > distinct(group.map(tagOf))) parts.push(f);
    }
    for (const m of group) labels.set(m.id, `${name} ${tagOf(m)}`);
  }

  _mobLabelCache = { server, labels, dropped };
  return _mobLabelCache;
}

router.get("/items", (req: Request, res: Response) => {
  applyServerProfile(req);
  const type = (req.query.type as string) || "IT_WEAPON";
  let items = loader.getItemsByType(type);
  if (req.query.loc) {
    const loc = String(req.query.loc);
    items = items.filter((it: any) => Array.isArray(it.loc) && it.loc.includes(loc));
  }
  if (req.query.q) {
    items = rankByQuery(items, String(req.query.q), (it: any) => it.name, (it: any) => it.aegis_name);
  }
  if (req.query.job !== undefined) {
    const jobId = Number(req.query.job);
    // Super Novice (23): the vanilla Hercules item DB has no SN bit — the
    // game's equip check uses its BASE class mask, which is Novice — so SN
    // accepts every Novice-flagged (0) item. PS CUSTOM gear, however, lists
    // 23 explicitly (sometimes without the Novice bit, e.g. Guardian's
    // Skull), so 23 must also match directly. (SN-only vanilla gear like the
    // Super Novice Hat is instead gated by EquipLv 40+, which a real Novice
    // can never reach.)
    const jobMatch = (job: number[]) => job.includes(jobId) || (jobId === 23 && job.includes(0));
    items = items.filter((it: any) => !Array.isArray(it.job) || it.job.length === 0 || jobMatch(it.job));
  }
  items = items.filter((it: any) => !loader.isItemHidden(it.id));
  res.json(paginate(items, req));
});

router.get("/items/:id", (req: Request, res: Response) => {
  applyServerProfile(req);
  const item = loader.getItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: "Item not found" });
  const desc = loader.getItemDescription(Number(req.params.id));
  res.json({ ...item, description: desc ? desc.description : null });
});

router.get("/mobs", (req: Request, res: Response) => {
  const server = applyServerProfile(req);
  const { labels, dropped } = computeMobLabels(server);
  let mobs = loader.getAllMonsters()
    .filter((m: any) => !dropped.has(m.id) && !loader.isMobHidden(m.id))
    .map((m: any) => ({ ...m, name: labels.get(m.id) ?? m.name }));
  if (req.query.q) {
    mobs = rankByQuery(mobs, String(req.query.q), (m: any) => m.name, (m: any) => m.sprite_name);
  }
  res.json(paginate(mobs, req));
});

router.get("/mobs/:id", (req: Request, res: Response) => {
  const server = applyServerProfile(req);
  const id = Number(req.params.id);
  const mob = loader.getMonsterData(id);
  if (!mob) return res.status(404).json({ error: "Monster not found" });
  // Use the same disambiguated name as the picker list (so a selected mob keeps its
  // "[Element]" tag). Falls back to the raw name for un-tagged / dropped mobs.
  const label = computeMobLabels(server).labels.get(id);
  res.json({ ...mob, name: label ?? mob.name, skills: (loader as any).getMobSkills(id) });
});

router.get("/skills", (req: Request, res: Response) => {
  const server = applyServerProfile(req);
  const profile = getProfile(server);
  let skills = loader.getAllSkills();
  if (req.query.damage_only === "true") {
    // The skill DB types everything that isn't a direct weapon/magic hit as
    // "Misc" (buffs, masteries, songs, ...), so a plain Weapon/Magic filter also
    // hides genuine offensive skills the engine *does* compute — e.g. Venom
    // Splasher (AS_SPLASHER), Acid Terror. Those show up as a real damage ratio
    // in the active server profile, so also keep any skill the profile can
    // actually calculate (weapon_ratios / magic_ratios).
    const wr = profile.weapon_ratios || {};
    const mr = profile.magic_ratios || {};
    skills = skills.filter((s: any) => {
      const name = s.name || "";
      // This is a pre-renewal calculator. Drop skills whose class prefix belongs to
      // a Renewal 3rd job, a mercenary/homunculus, an elemental summon, or a monster
      // (NPC_) — none exist as player skills on Payon Stories, they're just DB noise.
      if (NON_PS_SKILL_PREFIXES.has(name.split("_")[0])) return false;
      // HT_POWER is an internal Hercules id, not a real player skill.
      if (name === "HT_POWER") return false;
      // Hunter damage traps (Land Mine, Blast Mine, Freezing Trap, Claymore Trap)
      // are typed "Misc" and have no weapon/magic ratio — the engine computes them
      // through its own trap branch (INT/DEX formula) when HT_TRAP_PS_FORMULA is set.
      // Treat them as computable so all four show in the picker, not just the one
      // that used to carry a stand-in ratio.
      const isTrap =
        profile.mechanic_flags.has("HT_TRAP_PS_FORMULA") && TRAP_SKILL_NAMES.has(name);
      // Reflect Shield (CR_REFLECTSHIELD) and manual Blitz Beat (HT_BLITZBEAT) have
      // their own pipeline branches on every profile but are typed Misc with no
      // ratio, so they'd otherwise be dropped (like the traps were). Reflect
      // Shield's DPS isn't calculable (it reflects damage taken); Blitz Beat needs
      // a Falcon to produce damage but is a real, selectable skill.
      const isBranchMisc = name === "CR_REFLECTSHIELD" || name === "HT_BLITZBEAT";
      // Sphere Mine is typed "Place"/NoDamage with no attack_type (vanilla summons a
      // mob and the damage comes from it self-destructing), but PS gave it a flat
      // formula the engine computes in its own branch.
      const isSphereMine =
        profile.mechanic_flags.has("AM_SPHEREMINE_PS_FORMULA") && name === "AM_SPHEREMINE";
      // Fling is typed Misc with no ratio (its damage is flat, per coin), so the
      // Weapon/Magic test below would drop it. Its own branch computes it.
      const isFling =
        profile.mechanic_flags.has("GS_FLING_PS_FORMULA") && name === "GS_FLING";
      const computable =
        isTrap ||
        isBranchMisc ||
        isSphereMine ||
        isFling ||
        Object.prototype.hasOwnProperty.call(wr, name) ||
        Object.prototype.hasOwnProperty.call(mr, name);
      // Pure support skills carry the NoDamage flag. Hide them from a *damage*
      // picker — UNLESS the active profile can actually compute the skill's damage
      // (it's in weapon_ratios/magic_ratios). Venom Splasher (AS_SPLASHER) and Acid
      // Terror are flagged NoDamage in the DB because the real hit is a delayed
      // explosion, yet the engine computes their damage; offensive Heal (AL_HEAL)
      // is the other documented NoDamage exception.
      if ((s.damage_type || []).includes("NoDamage") && name !== "AL_HEAL" && !computable) return false;
      return s.attack_type === "Weapon" || s.attack_type === "Magic" || computable;
    });
  }
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    skills = skills.filter((s: any) =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.description || "").toLowerCase().includes(q) ||
      loader.getSkillDisplayName(s.name, profile).toLowerCase().includes(q)
    );
  }
  const withNames = skills.map((s: any) => ({ ...s, display_name: loader.getSkillDisplayName(s.name, profile) }));
  res.json(paginate(withNames, req));
});

router.get("/skills/:id", (req: Request, res: Response) => {
  const server = applyServerProfile(req);
  const skill = loader.getSkill(Number(req.params.id));
  if (!skill) return res.status(404).json({ error: "Skill not found" });
  res.json({ ...skill, display_name: loader.getSkillDisplayName(skill.name, getProfile(server)) });
});

router.get("/jobs", (_req: Request, res: Response) => {
  res.json(loader.getAllJobs());
});

// Skills a Rogue/Stalker can copy with Plagiarism, for the build editor's
// Plagiarism slot. `jobs` tells the frontend which job ids get the slot at all,
// so the job list lives in the profile rather than being hardcoded twice.
router.get("/plagiarism", (req: Request, res: Response) => {
  const server = applyServerProfile(req);
  const profile = getProfile(server);
  const skills = [...(profile.plagiarism_copyable || [])]
    .map((name: string) => {
      const rec = (loader as any).getSkillByName(name);
      if (!rec) return null;
      return { name, display_name: loader.getSkillDisplayName(name, profile), max_level: rec.max_level };
    })
    .filter((s: any) => s && s.max_level > 0)
    .sort((a: any, b: any) => a.display_name.localeCompare(b.display_name));
  res.json({ jobs: [...(profile.plagiarism_jobs || [])], skills });
});

router.get("/skill-tree/:jobId", (req: Request, res: Response) => {
  applyServerProfile(req);
  const skills = (loader as any).getPassiveSkillsForJob(Number(req.params.jobId));
  res.json(skills);
});

router.get("/jobs/:id", (req: Request, res: Response) => {
  applyServerProfile(req);
  const job = loader.getJobEntry(Number(req.params.id));
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json(job);
});

// Same per-job-level STR/AGI/VIT/INT/DEX/LUK bonus already folded into
// status.{str,agi,...} by statusCalculator.js -- exposed read-only here so
// the build editor can show it next to the base stat inputs instead of it
// only ever showing up invisibly inside the final damage numbers.
router.get("/job-bonus-stats/:jobId", (req: Request, res: Response) => {
  const server = applyServerProfile(req);
  const jobLevel = Number(req.query.job_level) || 1;
  const profile = getProfile(server);
  res.json(loader.getJobBonusStats(Number(req.params.jobId), jobLevel, profile));
});

export default router;
