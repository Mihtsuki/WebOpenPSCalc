import { UrlEditorState } from "../types";

export interface SavedBuild {
  id: string;
  name: string;
  savedAt: number;
  state: UrlEditorState;
}

const STORAGE_KEY = "openpscalc:saved-builds";
export const MAX_SAVED_BUILDS = 30;

export function listSavedBuilds(): SavedBuild[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(builds: SavedBuild[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(builds));
  } catch {
    // localStorage unavailable or full -- saving silently no-ops, nothing
    // else to recover here without surfacing a confusing error for a
    // best-effort convenience feature.
  }
}

// Saving under a name that already exists overwrites that entry instead of
// adding a duplicate, so re-saving a build you're iterating on doesn't eat
// into the slot cap.
export function saveBuild(name: string, state: UrlEditorState): { ok: true; builds: SavedBuild[] } | { ok: false; reason: "full" } {
  const builds = listSavedBuilds();
  const existingIdx = builds.findIndex((b) => b.name === name);
  const entry: SavedBuild = {
    id: existingIdx >= 0 ? builds[existingIdx].id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    savedAt: Date.now(),
    state,
  };
  if (existingIdx >= 0) {
    builds[existingIdx] = entry;
  } else {
    if (builds.length >= MAX_SAVED_BUILDS) return { ok: false, reason: "full" };
    builds.push(entry);
  }
  persist(builds);
  return { ok: true, builds };
}

export function deleteSavedBuild(id: string): SavedBuild[] {
  const builds = listSavedBuilds().filter((b) => b.id !== id);
  persist(builds);
  return builds;
}
