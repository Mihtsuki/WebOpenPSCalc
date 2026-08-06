import React, { useState, useEffect, useCallback } from "react";
import { statsApi } from "../api/client";

const SESSION_KEY = "stats_password";

interface DayEntry { date: string; views: number; calcs: number; }
interface JobEntry  { job_id: number; name: string; count: number; }
interface SkillEntry{ skill_id: number; name: string; count: number; }
interface TargetEntry { mob_id: number; name: string; count: number; }
interface RegionEntry { region: string; count: number; }
interface CountryEntry { country: string; count: number; regions?: RegionEntry[]; }
interface FeatureEntry { name: string; count: number; }
interface DonateTarget { target: string; count: number; }
interface RankEntry { name: string; count: number; }
interface StatsData {
  total_views: number;
  total_calcs: number;
  unique_ips: number;
  total_donate_clicks: number;
  donate_targets: DonateTarget[];
  stored_shares?: number;
  browsers?: RankEntry[];
  operating_systems?: RankEntry[];
  devices?: RankEntry[];
  by_day: DayEntry[];
  top_jobs: JobEntry[];
  top_skills: SkillEntry[];
  top_targets: TargetEntry[];
  top_features: FeatureEntry[];
  countries: CountryEntry[];
  from_ts: number;
  to_ts: number;
}

// Human-friendly labels for the feature-usage event names.
const FEATURE_LABELS: Record<string, string> = {
  template_load: "Load a template",
  compare_pin: "Pin build to compare",
  jaludev_import: "Import from jaludev",
  share_link: "Copy share link",
  target_pick: "Pick a monster target",
  breakpoints: "View breakpoints",
  donate_nudge_shown: "Donate nudge shown",
};

type Preset = "1" | "7" | "30" | "0" | "custom";

function BarChart({ days, maxVal }: { days: DayEntry[]; maxVal: number }) {
  const [tooltip, setTooltip] = useState<{ day: DayEntry; x: number; y: number } | null>(null);

  if (!days.length) return <p className="stats-empty">No data for this period.</p>;

  return (
    <div className="stats-chart" onMouseLeave={() => setTooltip(null)}>
      {days.map((d) => (
        <div
          key={d.date}
          className={`stats-chart-col${tooltip?.day.date === d.date ? " stats-chart-col--hover" : ""}`}
          onMouseEnter={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setTooltip({ day: d, x: r.left + r.width / 2, y: r.top });
          }}
        >
          <div className="stats-chart-bars">
            <div
              className="stats-bar stats-bar--views"
              style={{ height: maxVal > 0 ? `${(d.views / maxVal) * 100}%` : "0%" }}
            />
            <div
              className="stats-bar stats-bar--calcs"
              style={{ height: maxVal > 0 ? `${(d.calcs / maxVal) * 100}%` : "0%" }}
            />
          </div>
          <div className="stats-chart-label">{d.date.slice(5)}</div>
        </div>
      ))}

      {tooltip && (
        <div
          className="stats-tooltip"
          style={{ left: tooltip.x, top: tooltip.y - 8 }}
        >
          <div className="stats-tooltip-date">{tooltip.day.date}</div>
          <div className="stats-tooltip-row">
            <span className="stats-tooltip-dot stats-tooltip-dot--views" />
            <span>Views</span>
            <span className="stats-tooltip-val">{tooltip.day.views.toLocaleString()}</span>
          </div>
          <div className="stats-tooltip-row">
            <span className="stats-tooltip-dot stats-tooltip-dot--calcs" />
            <span>Calcs</span>
            <span className="stats-tooltip-val">{tooltip.day.calcs.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Funnel({ views, calcs, donates, targets }: { views: number; calcs: number; donates: number; targets: DonateTarget[] }) {
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const max = Math.max(views, 1);
  const stages = [
    { label: "Page views", val: views, sub: "" },
    { label: "Calculations", val: calcs, sub: `${pct(calcs, views).toFixed(1)}% of views` },
    { label: "Donation clicks", val: donates, sub: `${pct(donates, calcs).toFixed(2)}% of calcs · ${pct(donates, views).toFixed(2)}% of views` },
  ];
  return (
    <div className="stats-funnel">
      {stages.map((s) => (
        <div className="stats-funnel-row" key={s.label}>
          <div className="stats-funnel-head">
            <span className="stats-funnel-label">{s.label}</span>
            <span className="stats-funnel-val">{s.val.toLocaleString()}</span>
          </div>
          <div className="stats-funnel-track">
            <div className="stats-funnel-fill" style={{ width: `${Math.max((s.val / max) * 100, s.val > 0 ? 1.5 : 0)}%` }} />
          </div>
          {s.sub && <div className="stats-funnel-sub">{s.sub}</div>}
        </div>
      ))}
      {targets.length > 0 && (
        <div className="stats-funnel-targets">
          <span className="stats-funnel-targets-label">Clicks by placement:</span>
          {targets.map((t) => (
            <span key={t.target} className="stats-funnel-target">{t.target} · {t.count}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Visitors by country, each row expandable to its regions/states/provinces.
function CountryTable({ countries }: { countries: CountryEntry[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (countries.length === 0) return <p className="stats-empty">No data.</p>;
  const toggle = (c: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  return (
    <table className="stats-table">
      <tbody>
        {countries.map((c) => {
          const regions = (c.regions || []).filter((r) => r.region && r.region !== "Unknown");
          const canDrill = regions.length > 0;
          const isOpen = open.has(c.country);
          return (
            <React.Fragment key={c.country}>
              <tr
                className={canDrill ? "stats-row--drill" : undefined}
                onClick={canDrill ? () => toggle(c.country) : undefined}
              >
                <td className="stats-table-name">
                  {canDrill && <span className="stats-drill-caret">{isOpen ? "▾" : "▸"}</span>}
                  {c.country}
                </td>
                <td className="stats-table-count">{c.count}</td>
              </tr>
              {isOpen && regions.map((r) => (
                <tr key={c.country + "/" + r.region} className="stats-row--region">
                  <td className="stats-table-name stats-region-name">{r.region}</td>
                  <td className="stats-table-count">{r.count}</td>
                </tr>
              ))}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// Simple ranked name/count table with a share-of-total percentage — used for the
// browser / OS / device visitor breakdowns.
function RankTable({ rows, emptyMsg }: { rows?: RankEntry[]; emptyMsg: string }) {
  if (!rows || rows.length === 0) return <p className="stats-empty">{emptyMsg}</p>;
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <table className="stats-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td className="stats-table-name">{r.name}</td>
            <td className="stats-table-count">
              {r.count.toLocaleString()}
              {total > 0 && <span className="stats-table-pct"> · {Math.round((r.count / total) * 100)}%</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function StatsPage() {
  const [password, setPassword]   = useState(() => sessionStorage.getItem(SESSION_KEY) || "");
  const [input, setInput]         = useState("");
  const [authed, setAuthed]       = useState(() => !!sessionStorage.getItem(SESSION_KEY));
  const [authErr, setAuthErr]     = useState("");

  const [preset, setPreset]       = useState<Preset>("1");
  const [fromDate, setFromDate]   = useState("");
  const [toDate, setToDate]       = useState("");

  const [data, setData]           = useState<StatsData | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  const load = useCallback(async (pw: string, p: Preset, fd: string, td: string) => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string> = {};
      if (p === "custom") {
        if (fd) params.from = String(new Date(fd).getTime());
        if (td) params.to   = String(new Date(td + "T23:59:59").getTime());
      } else if (p === "1") {
        // "Today" = the current calendar day (local midnight → now), not a
        // rolling 24h window that would bleed into yesterday.
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        params.from = String(start.getTime());
      } else {
        params.days = p;
      }
      const result = await statsApi.getData(pw, params);
      setData(result);
    } catch (e: any) {
      if (e.message?.includes("401")) {
        setAuthed(false);
        sessionStorage.removeItem(SESSION_KEY);
        setAuthErr("Wrong password.");
      } else {
        setError(e.message || "Failed to load stats.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed && password) load(password, preset, fromDate, toDate);
  }, [authed, password, preset, fromDate, toDate, load]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    sessionStorage.setItem(SESSION_KEY, input);
    setPassword(input);
    setAuthed(true);
    setAuthErr("");
  }

  if (!authed) {
    return (
      <div className="stats-login-wrap">
        <form className="stats-login" onSubmit={handleLogin}>
          <h2 className="stats-login-title">Stats</h2>
          {authErr && <p className="stats-login-err">{authErr}</p>}
          <input
            className="stats-login-input"
            type="password"
            placeholder="Password"
            value={input}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="stats-login-btn" type="submit">Enter</button>
        </form>
      </div>
    );
  }

  const maxVal = data ? Math.max(...data.by_day.map((d) => Math.max(d.views, d.calcs)), 1) : 1;

  return (
    <div className="stats-page">
      <div className="stats-header">
        <h1 className="stats-title">Visitor Stats</h1>
        <div className="stats-presets">
          {(["1","7","30","0","custom"] as Preset[]).map((p) => (
            <button
              key={p}
              className={`stats-preset-btn${preset === p ? " active" : ""}`}
              onClick={() => setPreset(p)}
            >
              {p === "1" ? "Today" : p === "7" ? "Last 7 days" : p === "30" ? "Last 30 days" : p === "0" ? "All time" : "Custom"}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="stats-date-range">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <span>to</span>
            <input type="date" value={toDate}   onChange={(e) => setToDate(e.target.value)} />
          </div>
        )}
        <button className="stats-logout" onClick={() => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false); setPassword(""); setInput(""); }}>
          Sign out
        </button>
      </div>

      {loading && <p className="stats-loading">Loading…</p>}
      {error   && <p className="stats-error">{error}</p>}

      {data && !loading && (
        <>
          <div className="stats-metrics">
            <div className="stats-metric">
              <div className="stats-metric-val">{(data.total_views ?? 0).toLocaleString()}</div>
              <div className="stats-metric-label">Page views</div>
            </div>
            <div className="stats-metric">
              <div className="stats-metric-val">{(data.unique_ips ?? 0).toLocaleString()}</div>
              <div className="stats-metric-label">Unique visitors</div>
            </div>
            <div className="stats-metric">
              <div className="stats-metric-val">{(data.total_calcs ?? 0).toLocaleString()}</div>
              <div className="stats-metric-label">Calculations</div>
            </div>
            <div className="stats-metric">
              <div className="stats-metric-val">{(data.total_donate_clicks ?? 0).toLocaleString()}</div>
              <div className="stats-metric-label">Donation clicks</div>
            </div>
            <div className="stats-metric">
              <div className="stats-metric-val">{(data.stored_shares ?? 0).toLocaleString()}</div>
              <div className="stats-metric-label">Stored builds</div>
            </div>
          </div>

          <div className="stats-section">
            <h2 className="stats-section-title">Conversion funnel</h2>
            <Funnel
              views={data.total_views ?? 0}
              calcs={data.total_calcs ?? 0}
              donates={data.total_donate_clicks ?? 0}
              targets={data.donate_targets ?? []}
            />
          </div>

          <div className="stats-section">
            <div className="stats-section-header">
              <h2 className="stats-section-title">Daily activity</h2>
              <div className="stats-legend">
                <span className="stats-legend-dot stats-legend-dot--views" />Views
                <span className="stats-legend-dot stats-legend-dot--calcs" />Calculations
              </div>
            </div>
            <BarChart days={data.by_day} maxVal={maxVal} />
          </div>

          <div className="stats-two-col">
            <div className="stats-section">
              <h2 className="stats-section-title">Top jobs</h2>
              {data.top_jobs.length === 0
                ? <p className="stats-empty">No data.</p>
                : (
                  <table className="stats-table">
                    <tbody>
                      {data.top_jobs.map((j) => (
                        <tr key={j.job_id}>
                          <td className="stats-table-name">{j.name}</td>
                          <td className="stats-table-count">{j.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>

            <div className="stats-section">
              <h2 className="stats-section-title">Top skills</h2>
              {data.top_skills.length === 0
                ? <p className="stats-empty">No skill data (normal attacks only).</p>
                : (
                  <table className="stats-table">
                    <tbody>
                      {data.top_skills.map((s) => (
                        <tr key={s.skill_id}>
                          <td className="stats-table-name">{s.name}</td>
                          <td className="stats-table-count">{s.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>

            <div className="stats-section">
              <h2 className="stats-section-title">Top targets</h2>
              {(!data.top_targets || data.top_targets.length === 0)
                ? <p className="stats-empty">No monster targets yet.</p>
                : (
                  <table className="stats-table">
                    <tbody>
                      {data.top_targets.map((t) => (
                        <tr key={t.mob_id}>
                          <td className="stats-table-name">{t.name}</td>
                          <td className="stats-table-count">{t.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>

            <div className="stats-section">
              <h2 className="stats-section-title">Most used features</h2>
              {(!data.top_features || data.top_features.length === 0)
                ? <p className="stats-empty">No feature usage recorded yet.</p>
                : (
                  <table className="stats-table">
                    <tbody>
                      {data.top_features.map((f) => (
                        <tr key={f.name}>
                          <td className="stats-table-name">{FEATURE_LABELS[f.name] || f.name}</td>
                          <td className="stats-table-count">{f.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>

            <div className="stats-section">
              <h2 className="stats-section-title">Visitors by browser</h2>
              <RankTable rows={data.browsers} emptyMsg="No browser data for this period." />
            </div>

            <div className="stats-section">
              <h2 className="stats-section-title">Visitors by device</h2>
              <RankTable rows={data.devices} emptyMsg="No device data for this period." />
            </div>

            <div className="stats-section">
              <h2 className="stats-section-title">Visitors by OS</h2>
              <RankTable rows={data.operating_systems} emptyMsg="No OS data for this period." />
            </div>

            <div className="stats-section">
              <h2 className="stats-section-title">Visitors by country</h2>
              <p className="stats-section-hint">Click a country to see its regions.</p>
              <CountryTable countries={data.countries} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
