"""Diff every PS skill ratio we model against the wiki, the scraped PS skill DB
and the rework PDFs.

    python audit_skills.py            # full report
    python audit_skills.py GS_TRACKING WZ_METEOR    # just these

Reads snapshots/wiki_raw.json and snapshots/pdfs.json; pulls our own ratios out
of the live engine so the comparison is always against current code.

Read the header of `report()` before believing any single line of output: sources
disagree constantly, and which one wins is not uniform.
"""
import sys
import re
import os
from common import (load, save, snapshot, build, node_eval, norm_name,
                    loose_pattern, PS_DATA, BACKEND)

# Wiki page titles that differ from the skill DB's display name.
ALIAS = {
    "Killing Strike": "Killing Stroke",
    "Thunder Storm": "Thunderstorm",
    "Sightrasher": "Sight Rasher",
}

EXPORT_JS = r"""
const path=require("path"),fs=require("fs");
const {loader}=require("./src/engine/dataLoader");
const {getProfile}=require("./src/engine/serverProfiles");
const PS=getProfile("payon_stories"); loader.setProfile(PS);
const out={}; const ratios=Object.assign({},PS.weapon_ratios,PS.magic_ratios);
for(const k of Object.keys(ratios)){
  let disp=null; try{disp=loader.getSkillDisplayName(k,PS);}catch(e){}
  const sd=loader.getSkillByName(k); const fn=ratios[k];
  const mx=Math.min((sd&&sd.max_level)||10,10); const per={};
  for(let lv=1;lv<=mx;lv++){ try{per[lv]=typeof fn==="function"?fn(lv):fn;}catch(e){per[lv]=null;} }
  out[k]={display:disp,max_level:mx,is_magic:k in (PS.magic_ratios||{}),
          hits:(sd&&sd.number_of_hits)||null,per_level:per};
}
process.stdout.write(JSON.stringify(out));
"""


def our_ratios():
    return __import__("json").loads(node_eval(EXPORT_JS, cwd=BACKEND))


# ---------------------------------------------------------------- wikitext ---
def tables(wt):
    out = []
    for m in re.finditer(r"\{\|(.*?)\n\|\}", wt, re.S):
        rows = []
        for r in re.split(r"\n\s*\|-", m.group(1)):
            line = " ".join(r.split("\n"))
            cells = []
            for c in re.split(r"\|\||!!", line):
                c = re.sub(r"align\s*=\s*\"?[a-z]+\"?", "", c)
                c = re.sub(r"style\s*=\s*\"[^\"]*\"", "", c)
                c = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", c)
                c = re.sub(r"<[^>]+>", "", c).replace("'''", "").strip(" |!")
                if c.strip():
                    cells.append(c.strip())
            if cells:
                rows.append(cells)
        if rows:
            out.append(rows)
    return out


PCT = re.compile(r"^\+?(\d+(?:\.\d+)?)\s*%$")
DMGCOL = re.compile(r"^\+?(atk|matk|damage|weapon atk|dmg)\s*%?$", re.I)


def _pct(v):
    m = PCT.match(v.strip())
    return float(m.group(1)) if m else None


def levels_from(rows):
    """Extract {level: pct} from a wikitable, row- or column-oriented."""
    for hi, h in enumerate(rows):
        norm = [re.sub(r"^class=.*?!", "", c).strip().lower() for c in h]
        li = next((i for i, c in enumerate(norm) if c in ("level", "skill level")), None)
        di = next((i for i, c in enumerate(norm) if DMGCOL.match(c)), None)
        if li is None or di is None:
            continue
        out = {}
        for r in rows[hi + 1:]:
            if len(r) <= max(li, di):
                continue
            try:
                lv = int(re.sub(r"\D", "", r[li]) or 0)
            except ValueError:
                continue
            p = _pct(r[di])
            if lv and p is not None:
                out[lv] = p
        if out:
            return out
    lvrow = dmgrow = None
    for r in rows:
        first = re.sub(r"^class=.*?!", "", r[0]).split("|")[0].strip().lower()
        if first in ("level", "skill level") and lvrow is None:
            lvrow = r
        if DMGCOL.match(first) and dmgrow is None:
            dmgrow = r
    if lvrow and dmgrow:
        def vals(r):
            return [p.strip() for c in r for p in c.split("|") if p.strip()]
        out = {}
        for a, b in zip(vals(lvrow)[1:], vals(dmgrow)[1:]):
            try:
                lv = int(re.sub(r"\D", "", a) or 0)
            except ValueError:
                continue
            p = _pct(b)
            if lv and p is not None:
                out[lv] = p
        if out:
            return out
    return None


def wiki_levels(wt):
    for tb in tables(wt):
        lv = levels_from(tb)
        if lv:
            return lv
    return None


def wiki_prose(wt, limit=6):
    b = re.sub(r"\{\{.*?\}\}", "", wt, flags=re.S)
    b = re.sub(r"\{\|.*?\n\|\}", "", b, flags=re.S)
    b = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", b)
    b = re.sub(r"<[^>]+>", "", b).replace("'''", "").replace("''", "")
    keep = re.compile(r"(\d+\s*%|\bATK\b|\bMATK\b|formula|SkillL|per level)", re.I)
    return [re.sub(r"\s+", " ", l.strip(" *="))
            for l in re.split(r"\n+", b)
            if len(l.strip()) > 12 and keep.search(l)][:limit]


def psdb_levels(display, psdb):
    e = psdb.get((display or "").lower())
    if not e:
        return None
    lv = {}
    for L in e.get("levels", []) or []:
        m = re.search(r"(\d+(?:\.\d+)?)\s*%", str(L.get("effect", "")))
        if m:
            lv[L.get("level")] = float(m.group(1))
    return lv or None


def pdf_hits(display, pdfs):
    out = []
    for b, txt in pdfs.items():
        for m in re.finditer(loose_pattern(display), txt, re.I):
            seg = re.sub(r"\s+", " ", txt[m.start():m.start() + 420])
            if re.search(r"(damage|ratio|SkillLv|%|changed|increase|reduce)", seg, re.I):
                out.append((b, seg[:380]))
                break
    return out


def report(only=None):
    wiki = load(snapshot("wiki_raw.json"))
    pdfs = load(snapshot("pdfs.json"))
    raw = load(os.path.join(PS_DATA, "ps_skill_db.json"))
    raw = raw if isinstance(raw, list) else list(raw.values())
    psdb = {e["name"].lower(): e for e in raw if e.get("name")}
    ours = our_ratios()

    by_norm = {norm_name(t): t for t in wiki}
    rows, flagged = [], []
    for k, v in sorted(ours.items()):
        if only and k not in only:
            continue
        disp = v.get("display") or ""
        title = ALIAS.get(disp) or by_norm.get(norm_name(disp))
        wl = wiki_levels(wiki[title]) if title else None
        dl = psdb_levels(disp, psdb)
        ol = {int(a): b for a, b in v["per_level"].items() if b is not None}

        def cmp(other):
            if not other:
                return None
            return [(l, other[l], ol[l]) for l in sorted(set(ol) & set(other))
                    if abs(float(ol[l]) - float(other[l])) > 0.001]

        dw, dd = cmp(wl), cmp(dl)
        rows.append((k, disp, title, ol, wl, dl, dw, dd, pdf_hits(disp, pdfs) if (dw or dd) else []))
        if dw or dd:
            flagged.append(k)

    print("%-24s %-10s %-12s %s" % ("SKILL", "wiki", "ps_skill_db", "pdf"))
    print("-" * 74)
    for k, disp, title, ol, wl, dl, dw, dd, hits in rows:
        sw = "n/a" if wl is None else ("MATCH" if not dw else "DIFF(%d)" % len(dw))
        sd = "n/a" if dl is None else ("MATCH" if not dd else "DIFF(%d)" % len(dd))
        sp = ",".join(sorted({b.split()[0] for b, _ in hits})) or "-"
        print("%-24s %-10s %-12s %s" % (k, sw, sd, sp))

    print("\n%d skill(s) disagree with at least one source\n" % len(flagged))
    for k, disp, title, ol, wl, dl, dw, dd, hits in rows:
        if not (dw or dd):
            continue
        mx = min(10, max(list(ol) + list(wl or {}) + list(dl or {}) or [0]))
        print("\n## %s (%s)   wiki page: %s" % (k, disp, title))
        print("   lv   " + " ".join("%6d" % l for l in range(1, mx + 1)))

        def row(d):
            return " ".join("%6s" % (d.get(l, "-")) for l in range(1, mx + 1))
        print("   OURS " + row(ol))
        if wl:
            print("   WIKI " + row(wl))
        if dl:
            print("   PSDB " + row(dl))
        for b, seg in hits:
            print("   PDF  [%s] %s" % (b[:30], seg[:230]))
        if title:
            for l in wiki_prose(wiki[title], 3):
                print("   prose| " + l[:170])

    save(build("skill_audit.json"),
         [{"key": k, "display": d, "wiki_page": t, "ours": o, "wiki": w,
           "psdb": p, "diff_wiki": dw, "diff_psdb": dd,
           "pdf": [list(x) for x in h]}
          for k, d, t, o, w, p, dw, dd, h in rows])
    print("\nfull detail -> build/skill_audit.json")
    print("""
Before acting on any DIFF, in this order:
  1. A rework PDF beats the wiki and beats ps_skill_db. Both lag reworks by months.
  2. ps_skill_db rows are SCRAPED and its 'effect' field is not always damage —
     proc chance and bleed chance have both been mistaken for a ratio here.
  3. A wiki page can contradict ITSELF (Tracking's table disagrees with its own
     prose; Shield Boomerang's prose disagrees with its own table). Read both.
  4. If nothing resolves it, record the conflict — do not pick a side silently.""")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    report(set(args) if args else None)
