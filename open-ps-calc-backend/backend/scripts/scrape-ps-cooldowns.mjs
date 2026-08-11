/**
 * scrape-ps-cooldowns.mjs — rebuild data/ps/ps_skill_cooldowns.json from the PS wiki.
 *
 *   node scripts/scrape-ps-cooldowns.mjs            # damage skills only (default)
 *   node scripts/scrape-ps-cooldowns.mjs --all      # every skill in ps_skill_db.json
 *   node scripts/scrape-ps-cooldowns.mjs --limit 20 # smoke test
 *
 * WHY: the bundled ps_skill_db.json predates the wiki documenting cooldowns — every
 * entry still reads `"cast_delay": "Global Cooldown"` with no number, while the live
 * pages now say e.g. "Cast Delay : Global Cooldown and 0.3s Cooldown". A cooldown is
 * a real DPS term (skillTiming takes max(after-cast delay, cooldown)), so it needs to
 * come from data rather than per-skill guesses.
 *
 * Reads the "Cast Delay" infobox line and any "Has a 0.3s fixed cooldown" prose, and
 * writes {SKILL_CONSTANT: milliseconds} for the ones that name a number. Skills whose
 * page only says "Global Cooldown" are omitted — that is the shared delay already
 * modelled as the skill's after-cast delay, not a per-skill cooldown.
 *
 * Polite by construction: sequential, 250ms apart, and it re-reads its own output so
 * an interrupted run resumes instead of re-fetching.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = path.join(HERE, "../src/engine/data/ps/ps_skill_db.json");
const OUT = path.join(HERE, "../src/engine/data/ps/ps_skill_cooldowns.json");
const UA = "Mozilla/5.0 (compatible; WebOpenPSCalc/1.0; +https://github.com/ervinkleitz/WebOpenPSCalc)";
const DELAY_MS = 250;

const args = process.argv.slice(2);
const all = args.includes("--all");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

// Only skills the calculator prices have a period to correct.
const DAMAGE_FORMS = /attack|physical|magic/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** "Cast Delay : Global Cooldown and 0.3s Cooldown" / "Has a 0.3s fixed cooldown" → 300 */
function parseCooldownMs(text) {
  const patterns = [
    /Cast Delay\s*:?\s*([^]{0,120}?)(?:Target|Range|Property|Catalyst|Prerequisites)/i,
    /Has an?\s*([\d.]+)\s*s(?:ec)?\s*(?:fixed\s*)?cooldown/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const seg = m[1] || "";
    const num = seg.match(/([\d.]+)\s*s(?:ec(?:onds?)?)?\s*cooldown/i) || (m[1] && /^[\d.]+$/.test(m[1]) ? m : null);
    if (num) {
      const secs = Number(num[1]);
      if (Number.isFinite(secs) && secs > 0) return Math.round(secs * 1000);
    }
  }
  return null;
}

/**
 * The wiki's own page index, rather than guessing titles from the skill name.
 * PS names don't always match their page ("Thunder Storm" is filed under
 * "Thunderstorm", NJ_ISSEN is "Killing Strike" in the skill DB but "Killing Stroke"
 * on the wiki), and the search API returns nothing for those, so probing name
 * variants silently reported 404 for pages that do exist.
 */
async function fetchTitleIndex() {
  const byNormal = new Map();
  let cont = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ action: "query", list: "allpages", aplimit: "500", format: "json" });
    if (cont) q.set("apcontinue", cont);
    const res = await fetch(`https://wiki.payonstories.com/api.php?${q}`, { headers: { "User-Agent": UA } });
    if (!res.ok) break;
    const data = await res.json();
    for (const p of data?.query?.allpages || []) byNormal.set(normalize(p.title), p.title);
    cont = data?.continue?.apcontinue;
    if (!cont) break;
    await sleep(DELAY_MS);
  }
  return byNormal;
}

const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

const db = JSON.parse(fs.readFileSync(DB, "utf8"));
const entries = (Array.isArray(db) ? db : Object.values(db)).filter(Boolean);
const wanted = entries
  .filter((s) => s.constant && s.name && (all || DAMAGE_FORMS.test(String(s.skill_form || ""))))
  .slice(0, limit === Infinity ? undefined : limit);

const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const seen = new Set(Object.keys(out._checked || {}));
out._checked = out._checked || {};

// Skill DB name → wiki page title, where the two genuinely differ and no
// normalisation bridges them.
const ALIASES = {
  NJ_ISSEN: "Killing Stroke", // skill DB calls it "Killing Strike"
};

const titleIndex = await fetchTitleIndex();
console.log(`wiki index: ${titleIndex.size} pages`);
console.log(`scraping ${wanted.length} skills (${Object.keys(out._checked).length} already checked)`);
let found = 0, skipped = 0, failed = 0, missing = 0;

for (const s of wanted) {
  if (seen.has(s.constant)) { skipped++; continue; }
  const title = titleIndex.get(normalize(s.name)) || ALIASES[s.constant];
  if (!title) { out._checked[s.constant] = "no wiki page"; missing++; continue; }
  try {
    const res = await fetch(`https://wiki.payonstories.com/${encodeURIComponent(title.replace(/\s+/g, "_"))}`,
      { headers: { "User-Agent": UA } });
    const html = res.ok ? await res.text() : null;
    if (html == null) { out._checked[s.constant] = `http ${res.status}`; failed++; }
    else {
      const ms = parseCooldownMs(stripHtml(html));
      out._checked[s.constant] = ms ? `${ms}ms` : "none";
      if (ms) { out[s.constant] = ms; found++; console.log(`  ${s.constant} (${s.name}) → ${ms}ms`); }
    }
  } catch (e) {
    out._checked[s.constant] = `error: ${String(e.message).slice(0, 40)}`;
    failed++;
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  await sleep(DELAY_MS);
}

console.log(`\ndone — ${found} with a cooldown, ${missing} with no wiki page, ${skipped} already checked, ${failed} failed`);
console.log(`wrote ${OUT}`);
