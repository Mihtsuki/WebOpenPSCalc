import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
const { logPageView, logDonateClick, logFeature, readNginxPageViews, batchResolveGeo, geoCache, parseUserAgent, isLocalIp } = require("../middleware/statsLogger");
const { loader } = require("../engine/dataLoader");

const router = Router();
const STATS_FILE   = path.join(__dirname, "../../../data-store/stats.ndjson");
const CURSOR_FILE  = path.join(__dirname, "../../../data-store/consolidation-cursor.json");
const SHARES_FILE  = path.join(__dirname, "../../../data-store/shares.json");
const STATS_PASSWORD = process.env.STATS_PASSWORD;
// Explicit opt-out for local development. Without a password AND without this, the
// stats endpoint denies everything — see checkPassword.
const STATS_OPEN = process.env.STATS_OPEN === "1";

// Announce the state once at import, so a deploy that fails to inject the password is
// visible in the server log instead of being discovered later. The old behaviour was
// to fall open silently, which meant a missing env var published the traffic data with
// nothing anywhere to say so.
if (STATS_PASSWORD) {
  console.log("[stats] password set — /stats/data requires X-Stats-Password.");
} else if (STATS_OPEN) {
  console.warn("[stats] STATS_OPEN=1 and no STATS_PASSWORD: the stats endpoint is PUBLIC. Never set this in production.");
} else {
  console.error("[stats] No STATS_PASSWORD set — the stats endpoint is DENYING ALL requests. "
    + "Set STATS_PASSWORD to enable it, or STATS_OPEN=1 to run it unprotected locally.");
}

// Total number of copied/shared builds persisted in the share store (a single
// id→entry JSON map; deduped by content, so this is the count of distinct builds).
function countStoredShares(): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(SHARES_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? Object.keys(parsed).length : 0;
  } catch { return 0; }
}

// Returns the timestamp up to which nginx logs have been consolidated into
// NDJSON. Returns 0 if consolidation has never run.
function readCursor(): number {
  try {
    const raw = fs.readFileSync(CURSOR_FILE, "utf8");
    return JSON.parse(raw).lastConsolidatedTs || 0;
  } catch { return 0; }
}

// FAILS CLOSED. This used to be `if (!STATS_PASSWORD) return true`, so a server whose
// env var went missing served the whole traffic log to anyone who asked, with no error
// and no log line. The deploy rewrites STATS_PASSWORD in the server .env on every run,
// so a failed injection was one bad deploy away from publishing it.
//
// Unset now means DENY. Local development opts out explicitly with STATS_OPEN=1, which
// is loud at boot and can never be reached by accident on the server.
function checkPassword(req: Request, res: Response): boolean {
  if (!STATS_PASSWORD) {
    if (STATS_OPEN) return true;
    res.status(503).json({
      error: "Stats disabled",
      detail: "No STATS_PASSWORD is configured. Set it to enable the stats endpoint, "
        + "or set STATS_OPEN=1 to run it unprotected for local development.",
    });
    return false;
  }
  const pw = (req.headers["x-stats-password"] as string) || (req.query.password as string);
  if (pw === STATS_PASSWORD) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

// Read NDJSON event log and return events in [fromTs, toTs].
// Country names come from ip-api.com, which has renamed some countries over the
// years — so rows logged months apart can name the same place differently and
// show up as two rows in the panel. Observed live: "The Netherlands" (464) and
// "Netherlands" (222) listed separately, which also pushed the combined 686 out
// of its real rank. Normalising at READ time fixes the whole history without
// rewriting any stored events, and keeps working if ip-api renames another one.
const COUNTRY_ALIASES: Record<string, string> = {
  "the netherlands": "Netherlands",
  "holland": "Netherlands",
  "united states of america": "United States",
  "usa": "United States",
  "czech republic": "Czechia",
  "republic of korea": "South Korea",
  "korea (republic of)": "South Korea",
  "russian federation": "Russia",
  "viet nam": "Vietnam",
  "the philippines": "Philippines",
  "united kingdom of great britain and northern ireland": "United Kingdom",
};
function normalizeCountry(raw: unknown): string {
  const name = String(raw || "").trim();
  if (!name) return "Unknown";
  return COUNTRY_ALIASES[name.toLowerCase()] || name;
}

function readNdjsonEvents(fromTs: number, toTs: number): any[] {
  if (!fs.existsSync(STATS_FILE)) return [];
  const lines = fs.readFileSync(STATS_FILE, "utf8").split("\n").filter(Boolean);
  const events: any[] = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.ts >= fromTs && e.ts <= toTs) events.push(e);
    } catch {}
  }
  return events;
}

router.post("/ping", (req: Request, res: Response) => {
  logPageView(req);
  res.json({ ok: true });
});

// Records a click on a donation (Ko-fi) link. `target` labels the placement.
router.post("/donate", (req: Request, res: Response) => {
  logDonateClick(req, (req.body && req.body.target) || "unknown");
  res.json({ ok: true });
});

// Records use of a named feature (build comparison, breakpoints, templates, …).
router.post("/feature", (req: Request, res: Response) => {
  logFeature(req, (req.body && req.body.name) || "unknown");
  res.json({ ok: true });
});

router.get("/data", async (req: Request, res: Response) => {
  if (!checkPassword(req, res)) return;

  const now = Date.now();
  const daysParam = req.query.days as string;
  const fromParam = req.query.from as string;
  const toParam   = req.query.to   as string;

  let fromTs: number;
  let toTs: number = toParam ? Number(toParam) : now;

  if (fromParam) {
    fromTs = Number(fromParam);
  } else {
    const days = daysParam === "0" ? 0 : (parseInt(daysParam) || 7);
    fromTs = days === 0 ? 0 : now - days * 86_400_000;
  }

  // Cursor splits page view sources:
  //   [0, cursor)      → already consolidated into NDJSON (skip nginx for this range)
  //   [cursor, toTs]   → live nginx logs (not yet consolidated)
  // When cursor is 0, fall back to reading nginx for the full range (pre-consolidation).
  const cursor = readCursor();
  const nginxFrom = Math.max(fromTs, cursor);       // nginx only needed for recent gap
  const needNginx = nginxFrom <= toTs;

  const [nginxViews, ndjsonEvents] = await Promise.all([
    needNginx ? readNginxPageViews(nginxFrom, toTs) : Promise.resolve([]),
    Promise.resolve(readNdjsonEvents(fromTs, toTs)),
  ]);

  // Attach geo to recent nginx views (batch-resolve IPs not yet in cache).
  await batchResolveGeo(nginxViews.map((e: any) => e.ip));
  const recentViews = nginxViews.map((e: any) => ({
    ...e,
    ...(geoCache.get(e.ip) || { country: "Unknown", city: "" }),
  }));

  // Archived page_views from NDJSON (already geo-enriched by consolidate.js).
  // Only include events before the cursor to avoid double-counting.
  const archivedViews = cursor > 0
    ? ndjsonEvents.filter((e: any) => e.type === "page_view" && e.ts < cursor)
    : [];

  const calcEvents = ndjsonEvents.filter((e: any) => e.type === "calculate");
  // Exclude donate clicks from localhost/private IPs — the owner's own testing
  // (older events recorded before this filter existed are dropped here too).
  const donateEvents = ndjsonEvents.filter((e: any) => e.type === "donate_click" && !isLocalIp(e.ip));
  const featureEvents = ndjsonEvents.filter((e: any) => e.type === "feature");

  const allEvents = [...archivedViews, ...recentViews, ...calcEvents];

  const uniqueIps     = new Set<string>();
  const byDay: Record<string, { date: string; views: number; calcs: number }> = {};
  const jobCounts:    Record<number, number> = {};
  const skillCounts:  Record<number, number> = {};
  const targetCounts: Record<number, number> = {};
  const countryCounts: Record<string, number> = {};
  // country → (region → count), for the country drilldown.
  const regionsByCountry: Record<string, Record<string, number>> = {};
  // Browser / OS / device of visitors, parsed from the page-view User-Agent
  // (retroactive: nginx logs + archived NDJSON both carry `ua`).
  const browserCounts: Record<string, number> = {};
  const osCounts: Record<string, number> = {};
  const deviceCounts: Record<string, number> = {};
  let totalViews = 0, totalCalcs = 0;

  for (const e of allEvents) {
    if (e.ip) uniqueIps.add(e.ip);
    const day = new Date(e.ts).toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { date: day, views: 0, calcs: 0 };

    if (e.type === "page_view") {
      totalViews++;
      byDay[day].views++;
      // Country/region are counted PER PAGE VIEW, exactly like browser/OS/device
      // below. They used to be counted for every event in `allEvents`, which also
      // holds `calculate` events — so the panel summed to page views PLUS calcs
      // (~12.9k against 5.06k views over 30 days) while the OS panel next to it
      // summed to page views alone. Two panels labelled "Visitors by …" with
      // different denominators cannot be read against each other, and the country
      // one was really "activity by country": a single visitor who recalculated
      // fifty times outweighed fifty visitors who looked once.
      const country = normalizeCountry(e.country);
      countryCounts[country] = (countryCounts[country] || 0) + 1;
      const region = e.region || "Unknown";
      (regionsByCountry[country] ||= {})[region] = (regionsByCountry[country][region] || 0) + 1;

      const { browser, os, device } = parseUserAgent(e.ua || "");
      browserCounts[browser] = (browserCounts[browser] || 0) + 1;
      osCounts[os] = (osCounts[os] || 0) + 1;
      deviceCounts[device] = (deviceCounts[device] || 0) + 1;
    } else if (e.type === "calculate") {
      totalCalcs++;
      byDay[day].calcs++;
      if (e.job_id != null) jobCounts[e.job_id] = (jobCounts[e.job_id] || 0) + 1;
      if (e.skill_id != null && e.skill_id !== 0) skillCounts[e.skill_id] = (skillCounts[e.skill_id] || 0) + 1;
      if (e.target_mob_id != null) targetCounts[e.target_mob_id] = (targetCounts[e.target_mob_id] || 0) + 1;
    }
  }

  // Fill missing days in range (skip for all-time to avoid huge arrays).
  const filledDays: { date: string; views: number; calcs: number }[] = [];
  if (fromTs > 0) {
    let cur = new Date(fromTs);
    cur.setUTCHours(0, 0, 0, 0);
    const end = new Date(toTs);
    while (cur <= end) {
      const d = cur.toISOString().slice(0, 10);
      filledDays.push(byDay[d] || { date: d, views: 0, calcs: 0 });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  } else {
    filledDays.push(...Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)));
  }

  // Enrich job and skill names from the data loader.
  const allJobs: { id: number; name: string }[] = loader.getAllJobs ? loader.getAllJobs() : [];
  const jobNameMap: Record<number, string> = {};
  for (const j of allJobs) jobNameMap[j.id] = j.name;

  const topJobs = Object.entries(jobCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10)
    .map(([id, count]) => ({ job_id: Number(id), name: jobNameMap[Number(id)] || `Job ${id}`, count }));

  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10)
    .map(([id, count]) => {
      try {
        const sk = loader.getSkill ? loader.getSkill(Number(id)) : null;
        return { skill_id: Number(id), name: sk?.description || sk?.name || `Skill ${id}`, count };
      } catch {
        return { skill_id: Number(id), name: `Skill ${id}`, count };
      }
    });

  // Most-calculated-against monsters, enriched with names.
  const topTargets = Object.entries(targetCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 10)
    .map(([id, count]) => {
      let name = `Mob ${id}`;
      try { const m = loader.getMonsterData ? loader.getMonsterData(Number(id)) : null; if (m?.name) name = m.name; } catch {}
      return { mob_id: Number(id), name, count };
    });

  const countries = Object.entries(countryCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 25)
    .map(([country, count]) => ({
      country,
      count,
      // Top regions/states/provinces within this country, for drilldown.
      regions: Object.entries(regionsByCountry[country] || {})
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 15)
        .map(([region, rc]) => ({ region, count: rc })),
    }));

  // Most-used functionality (build comparison, breakpoints, templates, …).
  //
  // Two numbers, because the client changed what it sends. Until 2026-08-10 the
  // frontend deduped feature events once per name per session, so `count` there is
  // sessions-that-used-it; after that it sends every use. Raw counts either side of
  // that date are NOT comparable, and the missing uses can't be recovered — they were
  // never sent. `visitor_days` applies the OLD (deduped) semantics to ALL the data —
  // distinct ip+day per feature — which is the one series that spans the whole
  // history. It undercounts a visitor who used a feature across several sessions in
  // one day, on both sides of the change, so at least it's wrong the same way.
  const featureCounts: Record<string, number> = {};
  const featureVisitorDays: Record<string, Set<string>> = {};
  for (const e of featureEvents) {
    const n = (e.name as string) || "unknown";
    featureCounts[n] = (featureCounts[n] || 0) + 1;
    const day = new Date(e.ts).toISOString().slice(0, 10);
    if (!featureVisitorDays[n]) featureVisitorDays[n] = new Set<string>();
    featureVisitorDays[n].add(`${e.ip}|${day}`);
  }
  const topFeatures = Object.entries(featureCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([name, count]) => ({ name, count, visitor_days: featureVisitorDays[name].size }));

  // Donation-link clicks (Ko-fi), for the visits → calcs → donations funnel.
  const donateTargetCounts: Record<string, number> = {};
  for (const e of donateEvents) {
    const t = (e.target as string) || "unknown";
    donateTargetCounts[t] = (donateTargetCounts[t] || 0) + 1;
  }
  const donateTargets = Object.entries(donateTargetCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([target, count]) => ({ target, count }));

  // Rank browser / OS / device breakdowns (highest first).
  const rankCounts = (counts: Record<string, number>) =>
    Object.entries(counts)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([name, count]) => ({ name, count }));

  res.json({
    total_views:  totalViews,
    total_calcs:  totalCalcs,
    unique_ips:   uniqueIps.size,
    total_donate_clicks: donateEvents.length,
    donate_targets: donateTargets,
    stored_shares:     countStoredShares(),
    browsers:          rankCounts(browserCounts),
    operating_systems: rankCounts(osCounts),
    devices:           rankCounts(deviceCounts),
    by_day:       filledDays,
    top_jobs:     topJobs,
    top_skills:   topSkills,
    top_targets:  topTargets,
    top_features: topFeatures,
    countries,
    from_ts:      fromTs,
    to_ts:        toTs,
    nginx_available: fs.existsSync(process.env.NGINX_LOG_PATH || "/var/log/nginx/access.log"),
    consolidated_through: cursor > 0 ? new Date(cursor).toISOString() : null,
  });
});

export default router;
