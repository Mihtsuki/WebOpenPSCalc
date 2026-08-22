"""Extract text from the Payon Stories rework PDFs into snapshots/pdfs.json.

    pip install pypdf
    python extract_pdfs.py [--dir "C:/path/to/pdfs"]

The PDFs themselves are not in the repo — they are published by the PS team and
live in whoever's Downloads folder. This script is what turns them into something
the repo can keep, so `gen_sources.py` and `audit_skills.py` never need the
originals again.

Duplicate downloads ("... (1).pdf") are skipped. If you add a new PDF, add it to
META in gen_sources.py too so it gets a dated entry in PS_SOURCES.md.
"""
import sys
import os
import glob
import json
import io
from common import snapshot

PATTERNS = [
    "PSRO *.pdf", "Payon Stories *.pdf", "PayonStories *.pdf",
    "*Rework*.pdf", "*Patchnotes*.pdf", "Gunslinger Release*.pdf",
    "Wizard and High Wizard*.pdf", "HW only Trans*.pdf",
]


def main():
    src = os.path.expanduser("~/Downloads")
    if "--dir" in sys.argv:
        src = sys.argv[sys.argv.index("--dir") + 1]
    try:
        import pypdf
    except ImportError:
        print("pypdf is required:  pip install pypdf")
        return 1

    files = set()
    for p in PATTERNS:
        files.update(glob.glob(os.path.join(src, p)))
    if not files:
        print("no PS PDFs found under %s" % src)
        return 1

    docs = {}
    for f in sorted(files):
        b = os.path.basename(f)
        if "(1)" in b or "(2)" in b:      # duplicate downloads
            continue
        try:
            r = pypdf.PdfReader(f)
            docs[b] = "\n".join((pg.extract_text() or "") for pg in r.pages)
        except Exception as e:
            print("  skipped %s (%s)" % (b, e))

    io.open(snapshot("pdfs.json"), "w", encoding="utf-8", newline="\n").write(
        json.dumps(docs, ensure_ascii=False, indent=1))
    print("%d PDFs, %s chars -> snapshots/pdfs.json" % (len(docs), f"{sum(map(len, docs.values())):,}"))
    for b in docs:
        print("   ", b)
    print("\nNow run gen_sources.py to fold these into PS_SOURCES.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
