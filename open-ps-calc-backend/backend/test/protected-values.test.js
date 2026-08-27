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
// Access control. Same category as the above — a one-line diff, invisible in
// review, that quietly publishes something private.
// ---------------------------------------------------------------------------
test("the stats endpoint fails closed when no password is configured", () => {
  // This guard read `if (!STATS_PASSWORD) return true` for most of its life, so a
  // server whose env var went missing served the entire traffic log to anyone who
  // asked — no error, no log line, nothing on screen to say the lock was off. The
  // deploy rewrites STATS_PASSWORD into the server .env on every run, which makes
  // that one failed injection away rather than hypothetical.
  //
  // Unset must now mean DENY. Restoring the old line is a two-word edit that looks
  // like a simplification, which is exactly why it is pinned here.
  const src = read(BACKEND, "src", "routes", "stats.ts");

  const fn = src.slice(src.indexOf("function checkPassword"));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);
  assert.ok(body.includes("STATS_PASSWORD"), "checkPassword must still gate on STATS_PASSWORD");

  assert.ok(!/if\s*\(\s*!\s*STATS_PASSWORD\s*\)\s*return\s+true/.test(body),
    "checkPassword falls open with no password set — an unconfigured server would "
    + "publish the stats data. The unset branch must deny.");

  // The unset branch has to actually refuse, not fall through to the compare below
  // (an undefined password would otherwise match a missing header).
  const unset = body.slice(body.indexOf("if (!STATS_PASSWORD)"));
  assert.ok(/return false/.test(unset.slice(0, 500)),
    "the no-password branch must return false so the request is refused");

  // The local-dev escape hatch is an exact opt-in. A truthy test would turn
  // STATS_OPEN=0 or STATS_OPEN=false into "open", which is the trap this replaced.
  const m = src.match(/const\s+STATS_OPEN\s*=\s*([^;]+);/);
  assert.ok(m, "STATS_OPEN must stay a single named constant");
  assert.equal(m[1].trim(), 'process.env.STATS_OPEN === "1"',
    "STATS_OPEN must match exactly \"1\" — any truthy check makes STATS_OPEN=false mean open");
});

test("every stats data route goes through the password check", () => {
  // The router is mounted twice (/stats and the blocker-resistant /api/e alias), so
  // the guard lives on the routes rather than the mount. A new route reading the
  // ndjson without calling checkPassword would be public on both paths at once.
  const src = read(BACKEND, "src", "routes", "stats.ts");

  const handlers = [...src.matchAll(/router\.(get|post)\(\s*"([^"]+)"/g)];
  assert.ok(handlers.length > 0, "expected some routes in stats.ts");

  for (const h of handlers) {
    const body = src.slice(h.index, src.indexOf("\n});", h.index));
    // Reading the stats store or the share store means serving private data.
    if (!/STATS_FILE|SHARES_FILE|readNginxPageViews/.test(body)) continue;
    assert.ok(/checkPassword\(req, res\)/.test(body),
      `router.${h[1]}("${h[2]}") reads private data without calling checkPassword`);
  }

  // Both mounts must share one router, so the guard cannot be bypassed by a mount
  // that reaches a different, unguarded instance.
  const server = read(BACKEND, "src", "server.ts");
  const mounts = [...server.matchAll(/app\.use\("([^"]+)",\s*(\w+)\)/g)]
    .filter((x) => /stats/i.test(x[2]));
  assert.equal(mounts.length, 2, "expected the stats router to be mounted twice");
  assert.equal(new Set(mounts.map((x) => x[2])).size, 1,
    "both stats mounts must use the same router instance");
});
