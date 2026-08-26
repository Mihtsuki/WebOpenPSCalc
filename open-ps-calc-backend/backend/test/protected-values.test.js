/**
 * protected-values.test.js — pins the handful of values that must not drift.
 *
 * WHY THIS EXISTS: most of this repo is safe to change freely, and should be. A few
 * values are different in kind — they decide where money goes, who the site claims
 * to be, and who it credits. Those are exactly the things that can be altered in a
 * one-line diff, look harmless in review, and do real damage if they land.
 *
 * The Ko-fi page id is the sharpest example. Swap those eight characters and every
 * donation the calculator earns goes to someone else, with nothing on screen looking
 * any different. A reviewer skimming a large PR will not catch that. This test will.
 *
 * These are NOT frozen forever. Changing one is a normal thing to do — you just have
 * to do it HERE as well, in the same commit, which turns a silent edit into a visible
 * one that a reviewer is asked to confirm on purpose. That is the whole mechanism:
 * not prevention, but forcing the change to announce itself.
 *
 * If a test here fails and you did not mean to touch these, you have found something.
 *
 * The payment-link sweep is deliberately blunt: it trips on the mere mention of a
 * payment host anywhere under src/, comments included. That is the right trade for
 * this one category — a false alarm costs a sentence in review, a missed one costs
 * every donation until somebody notices.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..", "..", "..");
const FRONTEND = path.join(REPO, "open-ps-calc-frontend", "frontend");
const BACKEND = path.join(REPO, "open-ps-calc-backend", "backend");

const read = (...p) => fs.readFileSync(path.join(...p), "utf8");

// ---------------------------------------------------------------------------
// Money. The one that actually matters.
// ---------------------------------------------------------------------------
test("the Ko-fi donation link points at THIS project's page", () => {
  const src = read(FRONTEND, "src", "components", "KofiModal.tsx");

  // The page id is the account donations land in. Nothing else in the UI changes
  // if this is edited, which is precisely why it is pinned.
  const m = src.match(/const\s+KOFI_PAGE\s*=\s*"([^"]+)"/);
  assert.ok(m, "KOFI_PAGE must stay a single named constant — do not inline the id");
  assert.equal(m[1], "I7A322JOTP", "Ko-fi page id changed — donations would go elsewhere");

  // Both the embedded form and the fallback link must stay on Ko-fi itself. A
  // look-alike host would pass the id check above while still taking the money.
  for (const [name, re] of [
    ["KOFI_EMBED", /const\s+KOFI_EMBED\s*=\s*`([^`]+)`/],
    ["KOFI_DIRECT", /const\s+KOFI_DIRECT\s*=\s*`([^`]+)`/],
  ]) {
    const u = src.match(re);
    assert.ok(u, `${name} must stay a named constant`);
    assert.ok(u[1].startsWith("https://ko-fi.com/${KOFI_PAGE}"),
      `${name} must be built from KOFI_PAGE on https://ko-fi.com — got ${u[1]}`);
  }

  // No second, unpinned donation target hiding elsewhere in the component.
  const hosts = [...src.matchAll(/https?:\/\/([^/`"'\s)]+)/g)].map((x) => x[1]);
  assert.deepEqual([...new Set(hosts)], ["ko-fi.com"],
    "KofiModal must not reference any host other than ko-fi.com");
});

test("no other file introduces a donation link", () => {
  // A second "Support us" button wired to a different account would bypass the
  // check above entirely, so the id is allowed to appear in exactly one place.
  const roots = [path.join(FRONTEND, "src"), path.join(BACKEND, "src")];
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|html)$/.test(e.name)) {
        const body = fs.readFileSync(p, "utf8");
        if (/ko-?fi\.com|paypal|patreon|buymeacoffee|I7A322JOTP/i.test(body)) {
          hits.push(path.relative(REPO, p).replace(/\\/g, "/"));
        }
      }
    }
  };
  roots.forEach(walk);
  assert.deepEqual(hits, ["open-ps-calc-frontend/frontend/src/components/KofiModal.tsx"],
    "a donation/payment link appeared outside KofiModal.tsx");
});

// ---------------------------------------------------------------------------
// Identity. What the site tells search engines and social cards it is.
// ---------------------------------------------------------------------------
test("the site's own domain is consistent", () => {
  const SITE = "https://openpscalc.com";
  const html = read(FRONTEND, "index.html");

  // A wrong canonical hands this site's search ranking to whatever it points at.
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/);
  assert.ok(canonical, "index.html must keep a canonical link");
  assert.equal(canonical[1], SITE + "/", "canonical URL changed");

  const ogUrl = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/);
  assert.ok(ogUrl, "index.html must keep og:url");
  assert.equal(ogUrl[1], SITE + "/", "og:url changed");

  // The guide/mechanics page generator stamps the same domain into every page it
  // writes, so it has to agree with the canonical above or the two disagree silently.
  const gen = read(FRONTEND, "scripts", "gen-guides.mjs");
  const site = gen.match(/const\s+SITE\s*=\s*"([^"]+)"/);
  assert.ok(site, "gen-guides.mjs must keep SITE as a named constant");
  assert.equal(site[1], SITE, "generated-page domain no longer matches the canonical");
});

// ---------------------------------------------------------------------------
// Credit. This is a derived work and the attribution is a licence condition,
// not a courtesy — it is the one item here that is a legal obligation.
// ---------------------------------------------------------------------------
test("upstream attribution survives", () => {
  const readme = read(REPO, "README.md");
  assert.ok(/StatGameDev\/Open_PS_Calc/.test(readme),
    "README must keep crediting StatGameDev/Open_PS_Calc — this is a migration of it");
  assert.ok(/github\.com\/StatGameDev\/Open_PS_Calc/.test(readme),
    "the attribution must stay a working link to the upstream project");
});

// ---------------------------------------------------------------------------
// Data sources. Silently repointing these would make every number suspect while
// the app still looked fine.
// ---------------------------------------------------------------------------
test("Payon Stories sources still point at Payon Stories", () => {
  const files = [
    [path.join(REPO, "tools", "audit", "fetch_wiki.py"), "wiki.payonstories.com"],
    [path.join(REPO, "tools", "audit", "fetch_ps_items.py"), "tools.payonstories.com"],
    [path.join(REPO, "tools", "audit", "audit_items.py"), "tools.payonstories.com"],
  ];
  for (const [file, host] of files) {
    if (!fs.existsSync(file)) continue;      // tooling is optional, not required
    const body = fs.readFileSync(file, "utf8");
    const hosts = [...body.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
    const offsite = [...new Set(hosts)].filter((h) => !h.endsWith("payonstories.com"));
    assert.deepEqual(offsite, [],
      `${path.basename(file)} should only fetch from payonstories.com — found ${offsite.join(", ")}`);
    assert.ok(hosts.includes(host), `${path.basename(file)} must still query ${host}`);
  }
});

// ---------------------------------------------------------------------------
// Per-slot state that must not outlive the item it belongs to
// ---------------------------------------------------------------------------
test("changing or removing a weapon clears that slot's forge data", () => {
  // Forge (Star Crumbs / element / ranked) is stored per SLOT but describes a
  // SPECIFIC weapon. Left behind on a swap it makes the next weapon read as forged,
  // which hides its card slots entirely — and if that weapon is not forgeable, the
  // forge controls are hidden too, so there is no way to clear it from the UI.
  // A player hit exactly this: a shared build with a forged Damascus, switched to a
  // Main Gauche, and no card slots ever appeared.
  //
  // There is no frontend test runner, so this is a source-level guard in the same
  // spirit as buff-labels.test.js. If the picker/unequip handlers are restructured,
  // update this to match the new shape rather than deleting it.
  const src = read(FRONTEND, "src", "pages", "BuildEditor.tsx");

  const onSelect = src.slice(src.indexOf("onSelect={(r) => {"));
  assert.ok(/delete next\.forge\[slot\.key\]/.test(onSelect.slice(0, 1600)),
    "the item picker must drop the slot's forge data when the equipped item changes");

  const unequip = src.slice(src.indexOf("next.equipped[slot.key] = null;"));
  assert.ok(/delete next\.forge\[slot\.key\]/.test(unequip.slice(0, 700)),
    "Unequip must drop the slot's forge data too, or the next weapon inherits it");
});

test("a saved build keeps its own name, on save and on load", () => {
  // The editor's `currentState` is snapshotted BEFORE `onSave` pushes the new name
  // into `data`, so saving it verbatim stored the previous name inside the state while
  // the list entry got the typed one. A build saved once from a fresh editor then
  // loaded back as "New Build"; re-saving hid it, so only save-once builds broke.
  // No frontend test runner, so this is a source-level guard (see the note above).
  const src = read(FRONTEND, "src", "components", "SavedBuildsModal.tsx");

  assert.ok(/saveBuild\(\s*name\s*,\s*\{[^)]*build:\s*\{[^)]*name\s*\}/s.test(src),
    "saveBuild must persist the state with the typed name baked into build.name");

  // Loading must trust the entry's name, which also repairs builds saved before the
  // fix — otherwise those stay wrong forever in the user's browser.
  assert.ok(/onLoad\(\s*\{[^)]*b\.state[^)]*name:\s*b\.name/s.test(src),
    "Load must override build.name with the saved entry's name");
});
