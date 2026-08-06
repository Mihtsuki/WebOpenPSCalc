import { Router, Request, Response } from "express";
import fs from "fs";
import path from "path";
const { logPageView, logDonateClick, logFeature, readNginxPageViews, batchResolveGeo, geoCache, parseUserAgent } = require("../middleware/statsLogger");
const { loader } = require("../engine/dataLoader");

const router = Router();
const STATS_FILE   = path.join(__dirname, "../../../data-store/stats.ndjson");
const CURSOR_FILE  = path.join(__dirname, "../../../data-store/consolidation-cursor.json");
const SHARES_FILE  = path.join(__dirname, "../../../data-store/shares.json");
const STATS_PASSWORD = process.env.STATS_PASSWORD;

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

function checkPassword(req: Request, res: Response): boolean {
  if (!STATS_PASSWORD) return true;
  const pw = (req.headers["x-stats-password"] as string) || (req.query.password as string);
  if (pw === STATS_PASSWORD) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}

// Read NDJSON event log and return events in [fromTs, toTs].
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
  const donateEvents = ndjsonEvents.filter((e: any) => e.type === "donate_click");
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
    const country = e.country || "Unknown";
    countryCounts[country] = (countryCounts[country] || 0) + 1;
    const region = e.region || "Unknown";
    (regionsByCountry[country] ||= {})[region] = (regionsByCountry[country][region] || 0) + 1;

    if (e.type === "page_view") {
      totalViews++;
      byDay[day].views++;
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
  const featureCounts: Record<string, number> = {};
  for (const e of featureEvents) {
    const n = (e.name as string) || "unknown";
    featureCounts[n] = (featureCounts[n] || 0) + 1;
  }
  const topFeatures = Object.entries(featureCounts)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([name, count]) => ({ name, count }));

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
