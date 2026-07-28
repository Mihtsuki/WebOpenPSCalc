// Generates static, crawlable per-class build guide pages into public/guides/
// (an index hub + one page per class) and regenerates public/sitemap.xml to
// include them. These are standalone content pages (not the SPA) so search
// engines index real HTML; each links into the calculator. Run: node scripts/gen-guides.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const GUIDES = path.join(PUBLIC, "guides");
const SITE = "https://openpscalc.com";

// Every guide is derived from the single source of truth in
// src/data/starterBuilds.json — the SAME file the in-app template picker reads
// (src/pages/BuildEditor.tsx) — so guides and templates can never drift.
const STARTER_BUILDS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "src", "data", "starterBuilds.json"), "utf8")
);
const GUIDES_DATA = STARTER_BUILDS.map((b) => ({
  slug: b.slug, cls: b.cls, build: b.build, job: b.job, skill: b.skill.label,
  stats: b.base_stats, wiki: b.wiki, summary: b.summary, gear: b.gear,
}));

const STAT_ORDER = [["str", "STR"], ["agi", "AGI"], ["vit", "VIT"], ["int", "INT"], ["dex", "DEX"], ["luk", "LUK"]];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Theme-aware: dark by default (matching the app), light when the app's
// localStorage theme is "light" (same origin, so it's shared). Palette values
// mirror styles.css :root / [data-theme=light].
const STYLE = `
  :root{color-scheme:dark;--bg:#12141c;--panel:#181b26;--border:#2a2f40;--border-soft:#232838;--text:#e8e6df;--dim:#9a9fb0;--faint:#5d6276;--accent:#d8a657;--accent-dim:#a3793c;--link:#8fb4d9;--on-accent:#1a1306}
  :root[data-theme="light"]{color-scheme:light;--bg:#f0ebe0;--panel:#e8e2d4;--border:#b5ab95;--border-soft:#c8c0ac;--text:#1e1a10;--dim:#56493a;--faint:#8a7a64;--accent:#966419;--accent-dim:#7a5015;--link:#2060a0;--on-accent:#f0ebe0}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6}
  a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
  .wrap{max-width:780px;margin:0 auto;padding:2rem 1.4rem 4rem}
  header nav{font-size:.85rem;color:var(--dim);margin-bottom:1.5rem}
  h1{font-size:1.75rem;line-height:1.2;margin:.2rem 0 .4rem}
  h2{font-size:1.15rem;margin:2rem 0 .5rem;border-bottom:1px solid var(--border);padding-bottom:.3rem}
  .eyebrow{color:var(--accent-dim);font-size:.75rem;letter-spacing:.08em;text-transform:uppercase}
  p{color:var(--text)}
  .lead{color:var(--dim);font-size:1.02rem}
  table{border-collapse:collapse;width:100%;max-width:360px;font-size:.9rem;margin:.5rem 0}
  th,td{text-align:left;padding:.35rem .6rem;border-bottom:1px solid var(--border-soft)}
  td.n{font-family:"IBM Plex Mono",ui-monospace,monospace;color:var(--accent);text-align:right}
  .cta{display:inline-block;margin:1.4rem 0 .5rem;padding:.6rem 1.1rem;background:var(--accent);color:var(--on-accent);font-weight:700;border-radius:6px}
  .cta:hover{filter:brightness(1.08);text-decoration:none}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.6rem;margin:1rem 0}
  .card{display:block;padding:.7rem .85rem;background:var(--panel);border:1px solid var(--border);border-radius:6px;color:var(--text)}
  .card:hover{border-color:var(--accent-dim);text-decoration:none}
  .card .c{color:var(--dim);font-size:.82rem}
  footer{margin-top:2.5rem;padding-top:1rem;border-top:1px solid var(--border);color:var(--faint);font-size:.82rem}
`;

function shell({ title, desc, canonical, body }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/icon-512.png">
<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/svg+xml" href="/icon.svg">
<style>${STYLE}</style></head>
<body><div class="wrap">${body}</div></body></html>`;
}

function guidePage(g) {
  const canonical = `${SITE}/guides/${g.slug}.html`;
  const title = `${g.cls} — ${g.build} Build Guide | Payon Stories | Open PS Calc`;
  const desc = `${g.cls} ${g.build} build for Payon Stories (pre-renewal RO): recommended stats, signature skill (${g.skill}), gear, and a link to calculate its damage.`;
  const statRows = STAT_ORDER.map(([k, l]) => `<tr><td>${l}</td><td class="n">${g.stats[k]}</td></tr>`).join("");
  const body = `
<header><nav><a href="/">Open PS Calc</a> › <a href="/guides.html">Build guides</a> › ${esc(g.cls)}</nav></header>
<span class="eyebrow">Payon Stories build guide</span>
<h1>${esc(g.cls)} — ${esc(g.build)}</h1>
<p class="lead">${esc(g.summary)}</p>
<a class="cta" href="/?t=${g.slug}">Open this build in the calculator →</a>
<p style="font-size:.85rem;color:#9a9fb0">Opens the calculator with the <strong>${esc(g.cls)} — ${esc(g.build)}</strong> build preloaded — then tune stats and gear.</p>
<h2>Recommended stats <span style="font-weight:400;font-size:.8rem;color:#5d6276">(base level 99)</span></h2>
<table><tbody>${statRows}</tbody></table>
<h2>Signature skill</h2>
<p><strong>${esc(g.skill)}</strong> — set it as your skill in the calculator to see a full step-by-step damage breakdown, plus ASPD/cast/hit breakpoints, time-to-kill, and survivability.</p>
<h2>Gear &amp; tips</h2>
<p>${esc(g.gear)}</p>
<h2>Learn more</h2>
<p><a href="https://wiki.payonstories.com/${g.wiki}" rel="noopener">${esc(g.cls)} on the Payon Stories wiki ↗</a> · <a href="/guides.html">All build guides</a></p>
<footer>Open PS Calc is an unofficial, fan-made <a href="/">Payon Stories damage calculator</a>. Stats are a starting point — tune them to your gear and goals.</footer>`;
  return shell({ title, desc, canonical, body });
}

function indexPage() {
  const canonical = `${SITE}/guides.html`;
  const cards = GUIDES_DATA.map((g) =>
    `<a class="card" href="/guides/${g.slug}.html"><strong>${esc(g.cls)}</strong><div class="c">${esc(g.build)}</div></a>`
  ).join("");
  const body = `
<header><nav><a href="/">Open PS Calc</a> › Build guides</nav></header>
<span class="eyebrow">Payon Stories</span>
<h1>Payon Stories Build Guides</h1>
<p class="lead">Starter builds for every class on Payon Stories (pre-renewal Ragnarok Online) — recommended stats and a signature skill, each ready to open in the <a href="/">damage calculator</a> and tune to your gear.</p>
<div class="grid">${cards}</div>
<footer>Open PS Calc is an unofficial, fan-made <a href="/">Payon Stories damage calculator</a>.</footer>`;
  return shell({ title: "Payon Stories Build Guides — every class | Open PS Calc", desc: "Starter build guides for every Payon Stories class (pre-renewal RO): recommended stats and signature skills, ready to open in the damage calculator.", canonical, body });
}

// --- write flat .html files ---
// Flat files (not <slug>/index.html) so the host serves them via `try_files $uri`
// without needing directory-index resolution ($uri/), which it isn't configured for.
fs.mkdirSync(GUIDES, { recursive: true });
fs.writeFileSync(path.join(PUBLIC, "guides.html"), indexPage());           // → /guides.html
for (const g of GUIDES_DATA) {
  fs.writeFileSync(path.join(GUIDES, `${g.slug}.html`), guidePage(g));      // → /guides/<slug>.html
}

// --- regenerate sitemap (home + guides hub + each guide) ---
const urls = [
  `${SITE}/`,
  `${SITE}/guides.html`,
  ...GUIDES_DATA.map((g) => `${SITE}/guides/${g.slug}.html`),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><changefreq>weekly</changefreq></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), sitemap);

console.log(`Generated ${GUIDES_DATA.length} guide pages + index + sitemap (${urls.length} urls).`);
