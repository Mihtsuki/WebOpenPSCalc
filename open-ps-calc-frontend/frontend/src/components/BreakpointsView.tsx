// On-demand stat breakpoints for the current build: how much more AGI/DEX to
// reach the next ASPD milestone, DEX to instant-cast the selected skill, and
// HIT/DEX to reach 95%/100% hit vs the selected monster. Computed server-side by
// re-running the real status/timing/hit code with the stat bumped (see
// routes/calculate.ts POST /breakpoints), so the numbers match the calculator.
// Auto-refreshes (debounced) whenever the build / skill / target changes.
import { useState, useEffect, useRef } from "react";
import { api, statsApi } from "../api/client";
import type { Breakpoints } from "../types";

const DEBOUNCE_MS = 450;

export function BreakpointsView({ payload, targetName, skillLabel, skillLevel }: { payload: unknown | null; targetName?: string | null; skillLabel?: string | null; skillLevel?: number | null }) {
  const [bp, setBp] = useState<Breakpoints | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const reqId = useRef(0);

  useEffect(() => {
    if (!payload) return;
    const id = ++reqId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.breakpoints(payload);
        if (reqId.current === id) { setBp(r.breakpoints); setErr(""); statsApi.trackFeature("breakpoints"); }
      } catch (e: any) {
        if (reqId.current === id) setErr(String(e?.message || e));
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [payload]);

  return (
    <div className="bp">
      <div className="bp-head">
        <span className="bp-title">Breakpoints</span>
        {loading && <span className="bp-sub">updating…</span>}
      </div>
      {err && !bp && <div className="bp-err">{err}</div>}
      {bp && <BreakpointsBody bp={bp} targetName={targetName} skillLabel={skillLabel} skillLevel={skillLevel} />}
    </div>
  );
}

function BreakpointsBody({ bp, targetName, skillLabel, skillLevel }: { bp: Breakpoints; targetName?: string | null; skillLabel?: string | null; skillLevel?: number | null }) {
  const { aspd, cast, hit, int } = bp;
  return (
    <div className="bp-body">
      <div className="bp-row">
        <span className="bp-k">ASPD</span>
        <span className="bp-v">
          <b>{aspd.current.toFixed(1)}</b>
          {aspd.agi.length ? (
            <> — {aspd.agi.map((b) => `+${b.plus} AGI → ${b.aspd}`).join(" · ")}</>
          ) : (
            <span className="bp-sub"> — at cap</span>
          )}
          {aspd.dex.length ? <span className="bp-sub"> · or {aspd.dex.map((b) => `+${b.plus} DEX → ${b.aspd}`).join(" · ")}</span> : null}
        </span>
      </div>

      {cast && (
        <div className="bp-row">
          <span className="bp-k">Cast</span>
          <span className="bp-v">
            <b>{(cast.current_ms / 1000).toFixed(2)}s</b>
            <span className="bp-vs"> {skillLabel || cast.skill}{skillLevel ? ` Lv ${skillLevel}` : ""}{cast.current_dex != null ? ` @ ${cast.current_dex} DEX` : ""}</span>{" "}
            {(cast.next_jumps && cast.next_jumps.length) || (cast.instant_plus_dex != null && cast.instant_plus_dex > 0) ? (
              <span title="Pre-renewal cast time falls linearly with DEX (instant at 150 total DEX). Each step is the smallest extra DEX to reach the next cast-time value.">
                {" — "}
                {(cast.next_jumps ?? []).map((b) => `+${b.plus} DEX → ${(b.ms / 1000).toFixed(2)}s`).join(" · ")}
                {cast.instant_plus_dex != null && cast.instant_plus_dex > 0 && (
                  <>{cast.next_jumps && cast.next_jumps.length ? " · " : ""}<span className="bp-sub">instant at </span><b>+{cast.instant_plus_dex} DEX</b></>
                )}
              </span>
            ) : cast.instant_plus_dex === 0
              ? <span className="bp-sub">— already instant</span>
              : <span className="bp-sub">— DEX doesn't reduce this cast</span>}
          </span>
        </div>
      )}

      {int && (
        <div className="bp-row">
          <span className="bp-k">MATK</span>
          <span className="bp-v">
            <b>{int.matk_min}–{int.matk_max}</b>
            <span className="bp-vs"> @ {int.current_int} INT</span>{" "}
            {int.matk_jumps.length ? (
              <span title="Pre-renewal MATK = INT + (INT/5)² (max) and INT + (INT/7)² (min), so the bonus steps up at every multiple of 5 (max) and 7 (min) — and the jump grows each time. Each step is the smallest extra INT to reach the next multiple.">
                {" — "}
                {int.matk_jumps.map((j) => `+${j.plus} INT → ${j.matk_min}–${j.matk_max}`).join(" · ")}
              </span>
            ) : null}
            {int.sp_jumps.length ? (
              <span className="bp-sub" title="Natural SP recovery per tick — steps with INT (roughly every 6, with a larger jump at 120 INT).">
                {" · SP regen "}
                {int.sp_jumps.map((j) => `+${j.plus} INT → ${j.sp_regen}`).join(" · ")}
              </span>
            ) : null}
          </span>
        </div>
      )}

      {hit && (
        <div className="bp-row">
          <span className="bp-k">Hit</span>
          <span className="bp-v">
            <b>{hit.current_pct}%</b>
            {targetName ? <span className="bp-vs"> vs {targetName}</span> : null}
            {hit.current_pct >= 100 ? (
              <span className="bp-sub"> — always hits</span>
            ) : (
              <>
                {" — "}
                {hit.to95 ? `95% at +${hit.to95} HIT` : "95% ✓"}
                {" · "}
                {hit.to100 ? `100% at +${hit.to100} HIT` : "100% ✓"}
                <span className="bp-sub"> (1 DEX = 1 HIT)</span>
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
