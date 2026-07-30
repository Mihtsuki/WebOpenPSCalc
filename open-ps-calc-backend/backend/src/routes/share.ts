// Build-share URL shortener. The frontend serializes a build into a long
// LZString "z3_…" payload (the ?b= query param). This stores that payload under
// a short id so a build can be shared as /?s=<id> instead of a ~200-char URL.
//
//   POST /api/share  { b }      → { id }     create (idempotent per payload)
//   GET  /api/share/:id         → { b }      resolve
//
// Storage is a single JSON file in data-store/ (same convention as stats), loaded
// once and rewritten atomically on create. Volume is low (one entry per shared
// build) and identical builds dedupe to the same id, so the file stays small.
import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const router = Router();

const STORE_FILE = path.join(__dirname, "../../../data-store/shares.json");
const MAX_B_LEN = 8000; // generous ceiling for a compressed build payload
const ID_LEN = 7;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

type Entry = { b: string; created: number };

let store: Record<string, Entry> | null = null;
let byContent: Map<string, string> | null = null;

function load() {
  if (store) return;
  store = {};
  byContent = new Map();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
      if (parsed && typeof parsed === "object") {
        store = parsed;
        for (const [id, e] of Object.entries(store)) {
          if (e && typeof (e as Entry).b === "string") byContent.set((e as Entry).b, id);
        }
      }
    }
  } catch {
    store = {};
    byContent = new Map();
  }
}

function persist() {
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, STORE_FILE); // atomic replace
}

function genId(): string {
  const bytes = crypto.randomBytes(ID_LEN);
  let id = "";
  for (let i = 0; i < ID_LEN; i++) id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return id;
}

router.post("/", (req: Request, res: Response) => {
  load();
  const b = req.body && req.body.b;
  if (typeof b !== "string" || b.length === 0) {
    return res.status(400).json({ error: "b (build payload) is required" });
  }
  if (b.length > MAX_B_LEN) {
    return res.status(413).json({ error: "build payload too large" });
  }
  // Identical builds return the same short id — keeps the store from growing on
  // repeated "copy link" of the same build.
  const existing = byContent!.get(b);
  if (existing) return res.json({ id: existing });

  let id = genId();
  for (let tries = 0; store![id] && tries < 10; tries++) id = genId();
  store![id] = { b, created: Date.now() };
  byContent!.set(b, id);
  try {
    persist();
  } catch (e) {
    console.error("share persist failed", e); // still return the id from memory
  }
  res.json({ id });
});

router.get("/:id", (req: Request, res: Response) => {
  load();
  const id = String(req.params.id);
  const e = store![id];
  if (!e) return res.status(404).json({ error: "share not found" });
  res.json({ b: e.b });
});

export default router;
