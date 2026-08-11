// Generates the site's static, crawlable content pages — build guides
// (public/guides/) and mechanics references (public/mechanics/), each with an
// index hub — then regenerates public/sitemap.xml and public/llms.txt.
//
// These are standalone HTML, not the SPA, so search engines and answer engines
// index real text; every page links into the calculator. The guides answer
// "what should I build", the mechanics pages answer "how does this actually
// work on Payon Stories" — the second is the material nobody else publishes.
// Run: node scripts/gen-guides.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GUIDE_CONTENT } from "./guide-content.mjs";
import { MECHANICS } from "./mechanics-content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");
const GUIDES = path.join(PUBLIC, "guides");
const MECH = path.join(PUBLIC, "mechanics");
const SITE = "https://openpscalc.com";
// Content dates for <lastmod>. Bump the relevant one when a page's text really
// changes — a blanket "today" on every URL teaches crawlers to ignore the field.
const LASTMOD = { app: "2026-08-11", guides: "2026-08-11", mechanics: "2026-08-11" };

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

// JSON-LD structured data. `\u003c` escapes every "<" so a stray "</script>" in
// any string value can't break out of the <script> block.
const jsonLdScript = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

// The calculator itself, as a schema.org SoftwareApplication — reused on hub
// pages so answer engines landing on a guide still resolve the app entity.
const softwareApp = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Open PS Calc",
  alternateName: "Payon Stories Damage Calculator",
  url: `${SITE}/`,
  applicationCategory: "GameApplication",
  operatingSystem: "Web browser",
  description:
    "Fan-made damage calculator for Payon Stories (pre-renewal Ragnarok Online): step-by-step damage breakdown, ASPD/cast/hit breakpoints, build comparison, time-to-kill and survivability, modeling the server's reworked mechanics.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  isAccessibleForFree: true,
};

// FAQPage structured data — the lever answer engines actually read. Answers must
// be plain text (schema.org wants text, and a stray tag would be quoted verbatim).
const faqPage = (faq) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
});

// Visible Q&A. The questions are real headings so the page reads as an answer
// to a search, not just as schema bolted onto prose.
const faqSection = (faq) => `
<h2>Frequently asked questions</h2>
${faq.map(({ q, a }) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join("\n")}`;

const breadcrumb = (trail) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map(([name, item], i) => ({
    "@type": "ListItem", position: i + 1, name, item,
  })),
});

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
  h3{font-size:.98rem;margin:1.2rem 0 .3rem;color:var(--text)}
  ul,ol{color:var(--text)}li{margin:.25rem 0}
  .formula{font-family:"IBM Plex Mono",ui-monospace,monospace;background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:.7rem .9rem;color:var(--accent);overflow-x:auto}
  .seealso{margin:.4rem 0;color:var(--dim);font-size:.9rem}
  .sources{font-size:.85rem;color:var(--dim)}
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

function shell({ title, desc, canonical, body, jsonLd = [] }) {
  const ld = jsonLd.map(jsonLdScript).join("\n");
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
${ld}
<style>${STYLE}</style></head>
<body><div class="wrap">${body}</div></body></html>`;
}

function guidePage(g) {
  const canonical = `${SITE}/guides/${g.slug}.html`;
  const title = `${g.cls} — ${g.build} Build Guide | Payon Stories | Open PS Calc`;
  const desc = `${g.cls} ${g.build} build for Payon Stories (pre-renewal RO): recommended stats, signature skill (${g.skill}), gear, and a link to calculate its damage.`;
  const statRows = STAT_ORDER.map(([k, l]) => `<tr><td>${l}</td><td class="n">${g.stats[k]}</td></tr>`).join("");
  const c = GUIDE_CONTENT[g.slug] || {};
  const jsonLd = [
    breadcrumb([
      ["Open PS Calc", `${SITE}/`],
      ["Build guides", `${SITE}/guides.html`],
      [`${g.cls} — ${g.build}`, canonical],
    ]),
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${g.cls} — ${g.build} Build Guide`,
      description: desc,
      url: canonical,
      mainEntityOfPage: canonical,
      image: `${SITE}/icon-512.png`,
      inLanguage: "en",
      about: `Payon Stories ${g.cls} ${g.build} build`,
      author: { "@type": "Organization", name: "Open PS Calc", url: `${SITE}/` },
      publisher: {
        "@type": "Organization",
        name: "Open PS Calc",
        logo: { "@type": "ImageObject", url: `${SITE}/icon-512.png` },
      },
      isPartOf: { "@type": "WebSite", name: "Open PS Calc", url: `${SITE}/` },
      mentions: softwareApp,
    },
    ...(c.faq ? [faqPage(c.faq)] : []),
  ];
  const mechLinks = (c.mechanics || [])
    .map((s) => {
      const m = MECHANICS.find((x) => x.slug === s);
      return m ? `<a href="/mechanics/${m.slug}.html">${esc(m.title)}</a>` : null;
    })
    .filter(Boolean).join(" · ");
  const relLinks = (c.related || [])
    .map((s) => {
      const r = GUIDES_DATA.find((x) => x.slug === s);
      return r ? `<a href="/guides/${r.slug}.html">${esc(r.cls)} — ${esc(r.build)}</a>` : null;
    })
    .filter(Boolean).join(" · ");
  const body = `
<header><nav><a href="/">Open PS Calc</a> › <a href="/guides.html">Build guides</a> › ${esc(g.cls)}</nav></header>
<span class="eyebrow">Payon Stories build guide</span>
<h1>${esc(g.cls)} — ${esc(g.build)}</h1>
<p class="lead">${esc(g.summary)}</p>
<a class="cta" href="/?t=${g.slug}">Open this build in the calculator →</a>
<p style="font-size:.85rem;color:#9a9fb0">Opens the calculator with the <strong>${esc(g.cls)} — ${esc(g.build)}</strong> build preloaded — then tune stats and gear.</p>
${c.why ? `<h2>Why this build works</h2>\n<p>${c.why}</p>` : ""}
<h2>Recommended stats <span style="font-weight:400;font-size:.8rem;color:#5d6276">(base level 99)</span></h2>
<table><tbody>${statRows}</tbody></table>
${c.playstyle ? `<p>${c.playstyle}</p>` : ""}
<h2>Skills that matter</h2>
${c.skills ? `<ul>${c.skills.map((s) => `<li>${s}</li>`).join("")}</ul>`
    : `<p><strong>${esc(g.skill)}</strong> — set it as your skill in the calculator to see a full step-by-step damage breakdown.</p>`}
<h2>Gear</h2>
<p>${c.gear ? c.gear : esc(g.gear)}</p>
${c.faq ? faqSection(c.faq) : ""}
<h2>How the numbers are calculated</h2>
<p>Every figure this build produces is broken down step by step in the calculator — base damage,
skill ratio, the target's DEF, masteries, element and cards, each with its running total.
${mechLinks ? `The mechanics behind this build: ${mechLinks}.` : ""}</p>
<p><a class="cta" href="/?t=${g.slug}">Calculate this build's damage →</a></p>
<h2>Related</h2>
<p class="seealso">${relLinks ? `${relLinks} · ` : ""}<a href="/guides.html">All build guides</a> · <a href="/mechanics.html">How the mechanics work</a> · <a href="https://wiki.payonstories.com/${g.wiki}" rel="noopener">${esc(g.cls)} on the Payon Stories wiki ↗</a></p>
<footer>Open PS Calc is an unofficial, fan-made <a href="/">Payon Stories damage calculator</a>. Stats are a starting point — tune them to your gear and goals.</footer>`;
  return shell({ title, desc, canonical, body, jsonLd });
}

function mechanicsPage(m) {
  const canonical = `${SITE}/mechanics/${m.slug}.html`;
  const title = `${m.title} | Open PS Calc`;
  const jsonLd = [
    breadcrumb([
      ["Open PS Calc", `${SITE}/`],
      ["Mechanics", `${SITE}/mechanics.html`],
      [m.title, canonical],
    ]),
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: m.title,
      description: m.blurb,
      url: canonical,
      mainEntityOfPage: canonical,
      image: `${SITE}/icon-512.png`,
      inLanguage: "en",
      about: "Payon Stories damage mechanics (pre-renewal Ragnarok Online)",
      author: { "@type": "Organization", name: "Open PS Calc", url: `${SITE}/` },
      publisher: {
        "@type": "Organization",
        name: "Open PS Calc",
        logo: { "@type": "ImageObject", url: `${SITE}/icon-512.png` },
      },
      isPartOf: { "@type": "WebSite", name: "Open PS Calc", url: `${SITE}/` },
      mentions: softwareApp,
    },
    ...(m.faq ? [faqPage(m.faq)] : []),
  ];
  const rel = (m.related || [])
    .map((s) => {
      const r = MECHANICS.find((x) => x.slug === s);
      return r ? `<a href="/mechanics/${r.slug}.html">${esc(r.title)}</a>` : null;
    })
    .filter(Boolean).join(" · ");
  const guides = (m.guides || [])
    .map((s) => {
      const r = GUIDES_DATA.find((x) => x.slug === s);
      return r ? `<a href="/guides/${r.slug}.html">${esc(r.cls)} — ${esc(r.build)}</a>` : null;
    })
    .filter(Boolean).join(" · ");
  const body = `
<header><nav><a href="/">Open PS Calc</a> › <a href="/mechanics.html">Mechanics</a> › ${esc(m.title)}</nav></header>
<span class="eyebrow">Payon Stories mechanics</span>
<h1>${esc(m.title)}</h1>
<p class="lead">${esc(m.blurb)}</p>
${m.sections.map((s) => `<h2>${esc(s.h)}</h2>\n${s.html}`).join("\n")}
${m.faq ? faqSection(m.faq) : ""}
<h2>See it on your own build</h2>
<p>The calculator prints every step of this with your stats, gear and target, so you can check the
numbers rather than take them on trust.</p>
<p><a class="cta" href="/">Open the damage calculator →</a></p>
${guides ? `<p class="seealso">Builds this affects most: ${guides}.</p>` : ""}
<h2>Sources</h2>
<p class="sources">${m.sources.map((s) => `<a href="${s.href}" rel="noopener">${esc(s.label)} ↗</a>`).join(" · ")}${
    m.sources.length ? " · " : ""
  }Formulas as implemented in the calculator's engine, which is open about what it cannot yet model.</p>
<h2>Related</h2>
<p class="seealso">${rel ? `${rel} · ` : ""}<a href="/mechanics.html">All mechanics</a> · <a href="/guides.html">Build guides</a></p>
<footer>Open PS Calc is an unofficial, fan-made <a href="/">Payon Stories damage calculator</a>. Not affiliated with or endorsed by Payon Stories.</footer>`;
  return shell({ title, desc: m.blurb, canonical, body, jsonLd });
}

function mechanicsIndexPage() {
  const canonical = `${SITE}/mechanics.html`;
  const jsonLd = [
    breadcrumb([["Open PS Calc", `${SITE}/`], ["Mechanics", canonical]]),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "How Payon Stories damage mechanics work",
      url: canonical,
      description:
        "Reference pages for the reworked Payon Stories damage formulas: the damage pipeline, hit and accuracy, Asura Strike, Grand Cross, size penalties, forged weapons and more.",
      isPartOf: { "@type": "WebSite", name: "Open PS Calc", url: `${SITE}/` },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: MECHANICS.map((m, i) => ({
          "@type": "ListItem", position: i + 1, url: `${SITE}/mechanics/${m.slug}.html`, name: m.title,
        })),
      },
    },
    softwareApp,
  ];
  const cards = MECHANICS.map((m) =>
    `<a class="card" href="/mechanics/${m.slug}.html"><strong>${esc(m.title)}</strong><div class="c">${esc(m.blurb)}</div></a>`
  ).join("");
  const body = `
<header><nav><a href="/">Open PS Calc</a> › Mechanics</nav></header>
<span class="eyebrow">Payon Stories</span>
<h1>How Payon Stories damage actually works</h1>
<p class="lead">Payon Stories reworks a lot of pre-renewal Ragnarok Online: Asura Strike no longer
ignores DEF, Grand Cross applies defence asymmetrically, skill accuracy is a percentage of your hit
rate rather than flat HIT. These pages document the formulas the
<a href="/">damage calculator</a> implements, with the sources they were verified against.</p>
<div class="grid">${cards}</div>
<footer>Open PS Calc is an unofficial, fan-made <a href="/">Payon Stories damage calculator</a>. Where a formula isn't published, the calculator says so rather than showing an invented number.</footer>`;
  return shell({
    title: "How Payon Stories damage works — mechanics reference | Open PS Calc",
    desc: "Reference pages for the reworked Payon Stories damage formulas: the damage pipeline, hit and accuracy, Asura Strike, Grand Cross, the size penalty, forged weapons and more.",
    canonical, body, jsonLd,
  });
}

function indexPage() {
  const canonical = `${SITE}/guides.html`;
  const jsonLd = [
    breadcrumb([
      ["Open PS Calc", `${SITE}/`],
      ["Build guides", canonical],
    ]),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Payon Stories Build Guides",
      url: canonical,
      description:
        "Starter build guides for every Payon Stories class (pre-renewal RO): recommended stats and signature skills, ready to open in the damage calculator.",
      isPartOf: { "@type": "WebSite", name: "Open PS Calc", url: `${SITE}/` },
      mainEntity: {
        "@type": "ItemList",
        itemListElement: GUIDES_DATA.map((g, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE}/guides/${g.slug}.html`,
          name: `${g.cls} — ${g.build}`,
        })),
      },
    },
    softwareApp,
  ];
  const cards = GUIDES_DATA.map((g) =>
    `<a class="card" href="/guides/${g.slug}.html"><strong>${esc(g.cls)}</strong><div class="c">${esc(g.build)}</div></a>`
  ).join("");
  const body = `
<header><nav><a href="/">Open PS Calc</a> › Build guides</nav></header>
<span class="eyebrow">Payon Stories</span>
<h1>Payon Stories Build Guides</h1>
<p class="lead">Starter builds for every class on Payon Stories (pre-renewal Ragnarok Online) — recommended stats, the skills that matter, gear, and answers to the questions each build raises. Every one opens in the <a href="/">damage calculator</a> ready to tune.</p>
<div class="grid">${cards}</div>
<p class="seealso">Want the formulas rather than the builds? <a href="/mechanics.html">How Payon Stories damage actually works →</a></p>
<footer>Open PS Calc is an unofficial, fan-made <a href="/">Payon Stories damage calculator</a>.</footer>`;
  return shell({ title: "Payon Stories Build Guides — every class | Open PS Calc", desc: "Starter build guides for every Payon Stories class (pre-renewal RO): recommended stats and signature skills, ready to open in the damage calculator.", canonical, body, jsonLd });
}

// --- write flat .html files ---
// Flat files (not <slug>/index.html) so the host serves them via `try_files $uri`
// without needing directory-index resolution ($uri/), which it isn't configured for.
fs.mkdirSync(GUIDES, { recursive: true });
fs.mkdirSync(MECH, { recursive: true });
fs.writeFileSync(path.join(PUBLIC, "guides.html"), indexPage());           // → /guides.html
for (const g of GUIDES_DATA) {
  fs.writeFileSync(path.join(GUIDES, `${g.slug}.html`), guidePage(g));      // → /guides/<slug>.html
}
fs.writeFileSync(path.join(PUBLIC, "mechanics.html"), mechanicsIndexPage()); // → /mechanics.html
for (const m of MECHANICS) {
  fs.writeFileSync(path.join(MECH, `${m.slug}.html`), mechanicsPage(m));    // → /mechanics/<slug>.html
}

// --- regenerate sitemap ---
// lastmod is per content type rather than "now": a file that says everything
// changed today, every day, is a field crawlers learn to discard. changefreq
// likewise reflects what actually happens — the app ships daily, the prose does
// not. /stats is deliberately absent (robots.txt disallows it).
const urls = [
  { loc: `${SITE}/`, lastmod: LASTMOD.app, freq: "weekly", pri: "1.0" },
  { loc: `${SITE}/guides.html`, lastmod: LASTMOD.guides, freq: "weekly", pri: "0.8" },
  { loc: `${SITE}/mechanics.html`, lastmod: LASTMOD.mechanics, freq: "weekly", pri: "0.8" },
  ...MECHANICS.map((m) => ({ loc: `${SITE}/mechanics/${m.slug}.html`, lastmod: LASTMOD.mechanics, freq: "monthly", pri: "0.7" })),
  ...GUIDES_DATA.map((g) => ({ loc: `${SITE}/guides/${g.slug}.html`, lastmod: LASTMOD.guides, freq: "monthly", pri: "0.6" })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join("\n")}
</urlset>
`;
fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), sitemap);

// --- llms.txt: a curated, crawlable content map for AI answer engines ---
// (https://llmstxt.org/). Markdown, derived from the same GUIDES_DATA so it
// can never list a build the guides don't have.
const llmsTxt = `# Open PS Calc

> Free, fan-made damage calculator for Payon Stories (a pre-renewal Ragnarok
> Online private server). Build a character, equip gear and cards, and get a
> step-by-step damage breakdown with ASPD/cast/hit breakpoints, build
> comparison, time-to-kill, and survivability — modeling the server's actual
> reworked mechanics so the numbers match in-game. Unofficial community project.

- [Damage calculator](${SITE}/): the interactive tool — pick a class, skill, stats, gear and cards; see how each number is reached.
- [Build guides index](${SITE}/guides.html): starter builds for every class, each openable in the calculator.
- [Mechanics reference](${SITE}/mechanics.html): how Payon Stories' reworked damage formulas actually work, with sources.

## Mechanics reference
How this server differs from vanilla pre-renewal Ragnarok Online. Each page states the formula the
calculator implements and what it was verified against.
${MECHANICS.map((m) => `- [${m.title}](${SITE}/mechanics/${m.slug}.html): ${m.blurb}`).join("\n")}

## Build guides
${GUIDES_DATA.map((g) => `- [${g.cls} — ${g.build}](${SITE}/guides/${g.slug}.html): ${g.summary}`).join("\n")}

## About
- Pre-renewal mechanics only (no 3rd-job / homunculus / renewal formulas).
- Formulas follow the Payon Stories wiki and class-rework notes; the calculator is honest about what it can't yet model rather than showing fabricated numbers.
- Not affiliated with or endorsed by Payon Stories.
`;
fs.writeFileSync(path.join(PUBLIC, "llms.txt"), llmsTxt);

console.log(`Generated ${GUIDES_DATA.length} guide pages + ${MECHANICS.length} mechanics pages + 2 hubs + sitemap (${urls.length} urls) + llms.txt.`);
