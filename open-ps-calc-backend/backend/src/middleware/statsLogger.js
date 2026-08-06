const fs = require("fs");
const path = require("path");
const readline = require("readline");
const zlib = require("zlib");

const STATS_FILE = path.join(__dirname, "../../../data-store/stats.ndjson");
const NGINX_LOG   = process.env.NGINX_LOG_PATH || "/var/log/nginx/access.log";

// Create the data-store directory at startup so appendFile never fails due
// to a missing parent directory.
try { fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true }); } catch {}

const BOT_PATTERN = /bot|crawler|crawl|spider|scraper|scrapy|scan|check|monitor|uptime|pingdom|datadog|lighthouse|headless|phantom|puppeteer|playwright|selenium|wget|curl|python-requests|urllib|go-http-client|okhttp|java\/|libwww|perl\/|axios|node-fetch|httpx|aiohttp|apache-httpclient|httpclient|winhttp|guzzle|postmanruntime|insomnia|restsharp|masscan|zgrab|censys|shodan|nmap|nikto|sqlmap|nuclei|expanse|internet-measurement|netsystemsresearch|paloalto|facebookexternalhit|meta-externalagent|twitterbot|slackbot|embedly|feedfetcher|feedly|slurp|baiduspider|yandex|bytespider|ahrefs|semrush|dotbot|petalbot|mj12|dataforseo|serpstat|mediapartners|google-inspection|bingpreview|validator|nagios|zabbix|statuscake|newrelic|site24x7|hetrixtools|gtmetrix|webpagetest|archive\.org|ia_archiver|netcraft|gptbot|oai-searchbot|chatgpt|claude(bot|-web|-user)?|anthropic|ccbot|amazonbot|applebot|google-extended|perplexity|perplexitybot|cohere|diffbot|omgili|webzio|imagesift|timpibot|bytedance|sogou|coccoc|duckduckbot|discordbot|telegrambot|whatsapp|redditbot|pinterest|linkedinbot|skypeuripreview|viber|line-poker|gigablast|mojeek|seekport|dataminr|scrapy|colly|jsdom|cheerio|http_request|reqwest|http\.rb|httrack|wpscan|feroxbuster|gobuster|dirbuster|acunetix|qualys|censysinspect|gdnplus|zoominfobot|barkrowler|awario|magpie|bubing|pandalytics|trendictionbot|iframely|vercelbot|proximic/i;

// A real browser's User-Agent always begins with "Mozilla/5.0" and carries a
// rendering-engine/browser token. Most scrapers, HTTP libraries, and no-JS
// clients don't — so absence of Mozilla is a strong, low-false-positive bot tell.
const BROWSER_HINT = /mozilla\/5\.0/i;
const NGINX_LINE  = /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]+)" (\d+) \S+(?:\s+"[^"]*"\s+"([^"]*)")?/;
const MONTH_NUM   = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };

const geoCache = new Map();

// Treat a missing, placeholder, or implausibly short User-Agent as a bot too —
// real browsers always send a long UA string; empty/"-"/tiny UAs are scripts,
// scanners, or crawlers that don't announce themselves.
function isBot(ua = "") {
  const s = String(ua).trim();
  if (!s || s === "-" || s.length < 15) return true;
  if (!BROWSER_HINT.test(s)) return true;   // doesn't announce itself as a browser
  return BOT_PATTERN.test(s);
}

// Lightweight, dependency-free User-Agent → {browser, os, device} classifier for
// the stats page. Order matters: Edge/Opera/Samsung all embed "Chrome", and
// Chrome embeds "Safari", so the more specific tokens must be tested first.
function parseUserAgent(ua = "") {
  const s = String(ua);
  if (!s || s.length < 5) return { browser: "Unknown", os: "Unknown", device: "Unknown" };

  let browser = "Other";
  if (/\bEdg(e|A|iOS)?\//.test(s)) browser = "Edge";
  else if (/\b(OPR|Opera)\//.test(s)) browser = "Opera";
  else if (/\bSamsungBrowser\//.test(s)) browser = "Samsung Internet";
  else if (/\bUCBrowser\//.test(s)) browser = "UC Browser";
  else if (/\bCriOS\//.test(s)) browser = "Chrome";                 // Chrome on iOS
  else if (/\bFirefox\//.test(s) || /\bFxiOS\//.test(s)) browser = "Firefox";
  else if (/\bChrome\//.test(s)) browser = "Chrome";
  else if (/\bSafari\//.test(s)) browser = "Safari";
  else if (/\bMSIE |\bTrident\//.test(s)) browser = "Internet Explorer";

  let os = "Other";
  if (/Windows NT/.test(s)) os = "Windows";
  else if (/\bCrOS\b/.test(s)) os = "ChromeOS";
  else if (/Android/.test(s)) os = "Android";
  else if (/(iPhone|iPad|iPod)/.test(s)) os = "iOS";
  else if (/Mac OS X/.test(s)) os = "macOS";
  else if (/Linux/.test(s)) os = "Linux";

  let device = "Desktop";
  if (/iPad/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) || /\bTablet\b/.test(s)) device = "Tablet";
  else if (/Mobi|iPhone|iPod|Windows Phone|IEMobile/.test(s)) device = "Mobile";

  return { browser, os, device };
}

function isLocalIp(ip) {
  return !ip || ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.") || ip.startsWith("192.168.") || ip.startsWith("10.");
}

function getIp(req) {
  return ((req.headers["x-forwarded-for"] || req.ip || "").split(",")[0] || "").trim();
}

function parseNginxTime(s) {
  const m = s.match(/(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+)/);
  if (!m) return null;
  const mo = MONTH_NUM[m[2]];
  if (mo === undefined) return null;
  return Date.UTC(+m[3], mo, +m[1], +m[4], +m[5], +m[6]);
}

// Returns log files sorted newest-first: access.log, access.log.1, access.log.2.gz, …
function nginxLogFiles() {
  const dir = path.dirname(NGINX_LOG);
  const base = path.basename(NGINX_LOG);
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .filter(n => n === base || n.startsWith(base + "."))
    .sort((a, b) => {
      const num = (n) => n === base ? 0 : parseInt(n.replace(base + ".", "").replace(".gz", "")) || 999;
      return num(a) - num(b);
    })
    .map(n => path.join(dir, n));
}

// Read one log file (plain or gzip) and push matching page-view records into `out`.
async function readOneLog(filePath, fromTs, toTs, out) {
  try {
    // Skip files whose mtime predates the query window entirely (fast path).
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < fromTs) return;
  } catch { return; }

  try {
    const fileStream = fs.createReadStream(filePath);
    const inputStream = filePath.endsWith(".gz")
      ? fileStream.pipe(zlib.createGunzip())
      : fileStream;
    const rl = readline.createInterface({ input: inputStream, crlfDelay: Infinity });

    for await (const line of rl) {
      const m = line.match(NGINX_LINE);
      if (!m) continue;
      const [, ip, timeStr, request, statusStr, ua = ""] = m;
      const ts = parseNginxTime(timeStr);
      if (!ts || ts < fromTs || ts > toTs) continue;
      const status = parseInt(statusStr);
      if (status < 200 || status >= 400) continue;
      if (!/^GET \/(\?[^ ]*)? HTTP/.test(request)) continue;
      if (isBot(ua)) continue;
      out.push({ ts, ip, ua: ua.slice(0, 250), type: "page_view" });
    }
  } catch (e) {
    console.warn(`[stats] log read error (${path.basename(filePath)}):`, e?.message || e);
  }
}

// Parse all nginx access logs (current + rotated) and return page-view events
// within [fromTs, toTs].
async function readNginxPageViews(fromTs, toTs) {
  const files = nginxLogFiles();
  if (!files.length) return [];
  const results = [];
  for (const f of files) {
    await readOneLog(f, fromTs, toTs, results);
  }
  return results;
}

// Batch-resolve up to 100 IPs per request via ip-api.com free batch endpoint.
// Results are cached in geoCache so repeated calls are fast.
async function batchResolveGeo(ips) {
  const fresh = [...new Set(ips)].filter(ip => !geoCache.has(ip) && !isLocalIp(ip));
  if (!fresh.length) return;
  for (let i = 0; i < fresh.length; i += 100) {
    const batch = fresh.slice(i, i + 100);
    try {
      const res = await fetch("http://ip-api.com/batch?fields=status,query,country,regionName,city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      const data = await res.json();
      for (const entry of data) {
        geoCache.set(entry.query, entry.status === "success"
          ? { country: entry.country || "Unknown", region: entry.regionName || "Unknown", city: entry.city || "" }
          : { country: "Unknown", region: "Unknown", city: "" });
      }
    } catch {}
  }
  // Mark any still-unresolved IPs as unknown so we don't retry on every request
  for (const ip of fresh) {
    if (!geoCache.has(ip)) geoCache.set(ip, { country: "Unknown", region: "Unknown", city: "" });
  }
}

async function resolveGeo(ip) {
  if (isLocalIp(ip)) return { country: "Local", region: "Local", city: "" };
  if (geoCache.has(ip)) return geoCache.get(ip);
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city`);
    const data = await res.json();
    const geo = data.status === "success"
      ? { country: data.country || "Unknown", region: data.regionName || "Unknown", city: data.city || "" }
      : { country: "Unknown", region: "Unknown", city: "" };
    geoCache.set(ip, geo);
    return geo;
  } catch {
    const geo = { country: "Unknown", region: "Unknown", city: "" };
    geoCache.set(ip, geo);
    return geo;
  }
}

function appendEvent(event) {
  fs.appendFile(STATS_FILE, JSON.stringify(event) + "\n", () => {});
}

function logPageView(req) {
  // Page views are now sourced from nginx; this endpoint still exists as a
  // fallback (e.g. dev environments without nginx) but is not the primary source.
  const ua = req.headers["user-agent"] || "";
  if (isBot(ua)) return;
  const ip = getIp(req);
  resolveGeo(ip).then((geo) => {
    appendEvent({ ts: Date.now(), type: "page_view", ip, ...geo, ua: ua.slice(0, 250) });
  });
}

function logCalculate(req, jobId, skillId, mobId) {
  const ua = req.headers["user-agent"] || "";
  if (isBot(ua)) return;
  const ip = getIp(req);
  resolveGeo(ip).then((geo) => {
    appendEvent({ ts: Date.now(), type: "calculate", ip, ...geo, job_id: jobId ?? null, skill_id: skillId ?? null, target_mob_id: mobId ?? null });
  });
}

// Records a click on a donation link (Ko-fi). `target` labels which placement was
// clicked (e.g. "results", "topbar", "footer") for funnel analysis.
function logDonateClick(req, target) {
  const ua = req.headers["user-agent"] || "";
  if (isBot(ua)) return;
  const ip = getIp(req);
  // Don't record the owner's own testing: donate clicks from localhost/private
  // IPs (e.g. localhost:5173 during development) are excluded.
  if (isLocalIp(ip)) return;
  const label = typeof target === "string" ? target.slice(0, 40) : "unknown";
  resolveGeo(ip).then((geo) => {
    appendEvent({ ts: Date.now(), type: "donate_click", ip, ...geo, target: label });
  });
}

// Records use of a named feature (e.g. "template_load", "compare_pin",
// "jaludev_import", "share_link", "survivability", "breakpoints") so the stats
// page can rank which functionality players actually use.
function logFeature(req, name) {
  const ua = req.headers["user-agent"] || "";
  if (isBot(ua)) return;
  const ip = getIp(req);
  const label = typeof name === "string" ? name.slice(0, 40) : "unknown";
  resolveGeo(ip).then((geo) => {
    appendEvent({ ts: Date.now(), type: "feature", ip, ...geo, name: label });
  });
}

module.exports = { isBot, parseUserAgent, isLocalIp, getIp, logPageView, logCalculate, logDonateClick, logFeature, readNginxPageViews, batchResolveGeo, geoCache };
