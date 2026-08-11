import type { Breakpoints } from "../types";

const API_KEY = import.meta.env.VITE_API_KEY;

async function statsRequest(path: string, password: string, params?: Record<string, string>) {
  const url = `/stats${path}${params ? "?" + new URLSearchParams(params) : ""}`;
  const res = await fetch(url, { headers: { "X-Stats-Password": password } });
  const text = await res.text();
  let data: unknown = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const message = (data && typeof data === "object" && (data as any).error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as any;
}

async function request(path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const message = (data && typeof data === "object" && (data as any).error) || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  listJobs: () =>
    request("/data/jobs") as Promise<{ id: number; name: string }[]>,
  getJobPassives: (jobId: number, server: string) =>
    request(`/data/skill-tree/${jobId}?server=${server}`) as Promise<{ name: string; mastery_key: string; description: string; max_level: number }[]>,
  // Rogue/Stalker Plagiarism: which jobs get the slot, and what they can copy.
  getPlagiarism: (server: string) =>
    request(`/data/plagiarism?server=${server}`) as Promise<{ jobs: number[]; skills: { name: string; display_name: string; max_level: number }[] }>,
  getJobBonusStats: (jobId: number, jobLevel: number, server: string) =>
    request(`/data/job-bonus-stats/${jobId}?job_level=${jobLevel}&server=${server}`) as Promise<{ str_: number; agi: number; vit: number; int_: number; dex: number; luk: number }>,
  searchItems: (params: Record<string, unknown>) =>
    request(`/data/items?${new URLSearchParams(params as any)}`) as Promise<{ items: any[]; total: number }>,
  getItem: (id: number, server: string) =>
    request(`/data/items/${id}?server=${server}`) as Promise<any>,
  searchMobs: (params: Record<string, unknown>) =>
    request(`/data/mobs?${new URLSearchParams(params as any)}`) as Promise<{ items: any[]; total: number }>,
  searchSkills: (params: Record<string, unknown>) =>
    request(`/data/skills?${new URLSearchParams(params as any)}`) as Promise<{ items: any[]; total: number }>,
  getSkillById: (id: number, server: string) =>
    request(`/data/skills/${id}?server=${server}`) as Promise<{ id: number; max_level: number; name: string; [key: string]: any }>,
  getGearStatBonuses: (build: unknown) =>
    request("/calculate/gear-stat-bonuses", { method: "POST", body: { build } }) as Promise<{ str_: number; agi: number; vit: number; int_: number; dex: number; luk: number; ic_excluded_agi?: number; ic_excluded_dex?: number }>,
  getCharacterStatus: (build: unknown) =>
    request("/calculate/status", { method: "POST", body: { build } }) as Promise<{
      max_hp: number; max_sp: number; hp_regen: number; sp_regen: number;
      batk: number; weapon_atk: number; matk_min: number; matk_max: number;
      hard_def: number; soft_def: number; hard_mdef: number; soft_mdef: number;
      aspd: number; cri: number; flee: number;
    }>,
  calculate: (payload: unknown) =>
    request("/calculate", { method: "POST", body: payload }) as Promise<any>,
  // On-demand stat breakpoints (ASPD / cast / hit) for the current build.
  breakpoints: (payload: unknown) =>
    request("/calculate/breakpoints", { method: "POST", body: payload }) as Promise<{ breakpoints: Breakpoints }>,
  // Incoming damage (mob → player): how hard the selected monster hits YOU.
  // direction "physical" (basic attack) or "magic" (INT-based MATK, for casters).
  calculateIncoming: (build: unknown, mobId: number, direction: "physical" | "magic", opts: Record<string, unknown> = {}) =>
    request("/calculate/incoming", { method: "POST", body: { build, target: { mob_id: mobId }, direction, opts } }) as Promise<{
      status: { max_hp: number; flee: number; [k: string]: any };
      mob: any;
      result: { min_damage: number; max_damage: number; avg_damage: number; steps: any[] };
    }>,
  // Damage a specific mob skill would do to the player (survivability "which skill hits me").
  calculateIncomingSkill: (build: unknown, mobId: number, skillId: number, level: number) =>
    request("/calculate/incoming", { method: "POST", body: { build, target: { mob_id: mobId }, mob_skill: { id: skillId, level } } }) as Promise<{
      status: { max_hp: number; [k: string]: any };
      modeled: boolean;
      skill: { name: string; desc: string; attackType: string; elementInt: number; hits: number; ratio: number; hasNumber: boolean; estimated: boolean; damageType: "damage" | "status"; level: number };
      result: { min_damage: number; max_damage: number; avg_damage: number } | null;
    }>,
  importJaludev: (url: string, server: string) =>
    request(`/data/import/jaludev?server=${encodeURIComponent(server)}`, { method: "POST", body: { url } }) as Promise<{
      build: any; unmapped: string[]; jobName: string;
    }>,
};

// Build-share URL shortener: store the long "z3_…" ?b= payload and get a short
// id back, resolvable as /?s=<id>. See backend routes/share.ts.
export const shareApi = {
  create: (b: string) => request("/share", { method: "POST", body: { b } }) as Promise<{ id: string }>,
  resolve: (id: string) => request(`/share/${encodeURIComponent(id)}`) as Promise<{ b: string }>,
};

// Fire-and-forget tracking beacon. Uses the proxied /api/calculate prefix (POST
// to /stats/* isn't proxied) and sends the API key so it clears the /api gate.
function beacon(payload: Record<string, unknown>) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-Key"] = API_KEY;
  fetch("/api/calculate/track", { method: "POST", headers, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
}

// The page view is the one event that dedupes: React's mount effect fires twice
// under StrictMode in dev, and an SPA remount would count a second view for the
// same visit. Everything else records every occurrence.
let pageViewSent = false;

export const statsApi = {
  recordPageView: () => {
    if (pageViewSent) return;
    pageViewSent = true;
    beacon({ ev: "view" });
  },
  trackDonateClick: (target: string) => beacon({ ev: "donate", target }),
  // Records use of a named feature so the stats page can rank functionality.
  // Every use counts — the stats page sums raw events, so these are uses, not sessions.
  trackFeature: (name: string) => beacon({ ev: "feature", name }),
  // For signals that fire on their own rather than on a click: BreakpointsView
  // recomputes on a debounce every time the build changes, so counting each refresh
  // would bury the user-initiated features under one panel's auto-updates.
  trackFeatureOnce: (() => {
    const seen = new Set<string>();
    return (name: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      beacon({ ev: "feature", name });
    };
  })(),
  getData: (password: string, params: Record<string, string>) =>
    statsRequest("/data", password, params),
};
