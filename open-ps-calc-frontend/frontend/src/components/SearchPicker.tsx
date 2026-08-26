import { useEffect, useRef, useState } from "react";
import { SearchResult } from "../types";

interface Props {
  placeholder: string;
  search: (query: string) => Promise<SearchResult[]>;
  onSelect: (result: SearchResult) => void;
  fetchTooltip?: (id: number) => Promise<string | null>;
}

export default function SearchPicker({ placeholder, search, onSelect, fetchTooltip }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tooltipCache = useRef<Map<number, string | null>>(new Map());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      search(query).then((rows) => {
        const enabled = rows.filter((r) => !r.disabled);
        if (enabled.length === 1) {
          selectResult(enabled[0]);
          return;
        }
        setResults(rows);
        setActiveIndex(-1);
        setOpen(true);
      }).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, search]);

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function findEnabled(from: number, dir: 1 | -1): number {
    let i = from + dir;
    while (i >= 0 && i < results.length) {
      if (!results[i].disabled) return i;
      i += dir;
    }
    return -1;
  }

  function selectResult(r: SearchResult) {
    if (r.disabled) return;
    onSelect(r);
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && results.length > 0) {
        const first = findEnabled(-1, 1);
        setOpen(true);
        setActiveIndex(first);
        return;
      }
      if (open && results.length > 0) {
        const next = findEnabled(activeIndex, 1);
        if (next >= 0) setActiveIndex(next);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (open) {
        const prev = findEnabled(activeIndex, -1);
        setActiveIndex(prev);
      }
    } else if (e.key === "Enter") {
      if (open && activeIndex >= 0 && !results[activeIndex]?.disabled) {
        e.preventDefault();
        selectResult(results[activeIndex]);
      }
    } else if (e.key === "Tab") {
      if (open && results.length > 0) {
        const target =
          activeIndex >= 0 && !results[activeIndex]?.disabled
            ? results[activeIndex]
            : results.find((r) => !r.disabled);
        if (target) selectResult(target);
        else setOpen(false);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>, id: number) {
    if (!fetchTooltip) return;
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    hoverTimer.current = setTimeout(() => {
      const cached = tooltipCache.current.get(id);
      if (cached !== undefined) {
        if (cached) setTooltip({ text: cached, x: rect.right, y: rect.top });
      } else {
        fetchTooltip(id).then((text) => {
          tooltipCache.current.set(id, text);
          if (text) setTooltip({ text, x: rect.right, y: rect.top });
        });
      }
    }, 180);
  }

  function handleMouseLeave() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setTooltip(null);
  }

  return (
    <div className="search-combo" ref={boxRef}>
      <input
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (results.length > 0) { setOpen(true); return; }
          if (!query.trim()) {
            search("").then((rows) => { setResults(rows); setActiveIndex(-1); setOpen(rows.length > 0); }).catch(() => {});
          }
        }}
        onKeyDown={handleKeyDown}
      />
      {open && results.length > 0 && (
        <div className="search-results" ref={listRef}>
          {results.map((r, i) => (
            <div
              key={r.id}
              className={`search-result-item${i === activeIndex ? " active" : ""}${r.disabled ? " disabled" : ""}`}
              onClick={() => selectResult(r)}
              onMouseEnter={(e) => handleMouseEnter(e, r.id)}
              onMouseLeave={handleMouseLeave}
            >
              <span className="search-result-label">
                {r.label}
                {r.badge && (
                  <span className="search-result-badge" title={r.badgeTitle}>{r.badge}</span>
                )}
              </span>
              <span className="id">{r.sublabel}</span>
            </div>
          ))}
        </div>
      )}
      {tooltip && (
        <div
          className="search-tooltip"
          style={{ left: tooltip.x + 10, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
