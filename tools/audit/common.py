"""Shared helpers for the Payon Stories data audit.

Every script here writes into `build/` (gitignored) and reads its inputs from
`snapshots/` (committed). That split is deliberate: the snapshots are the things
you cannot recreate offline — the wiki as it read on a given day, the extracted
PDFs, the item API's replies — while everything in `build/` is derived and cheap
to rebuild.
"""
import json
import io
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SNAP = os.path.join(HERE, "snapshots")
BUILD = os.path.join(HERE, "build")
BACKEND = os.path.join(REPO, "open-ps-calc-backend", "backend")
PS_DATA = os.path.join(BACKEND, "src", "engine", "data", "ps")

# Cloudflare sits in front of both the wiki and the item API and rejects
# urllib's default agent outright, so every fetch goes through curl with a
# real UA. Do not "simplify" this back to urlopen.
UA = "Mozilla/5.0 (compatible; OpenPSCalc-audit/1.0)"


def ensure_build():
    os.makedirs(BUILD, exist_ok=True)
    return BUILD


def get(url, timeout=60):
    """Fetch a URL as text. Returns '' on failure rather than raising."""
    r = subprocess.run(["curl", "-s", "-m", str(timeout), "-A", UA, url],
                       capture_output=True)
    return r.stdout.decode("utf-8", "replace")


def get_json(url, timeout=60):
    try:
        return json.loads(get(url, timeout))
    except Exception:
        return None


def load(path):
    return json.load(io.open(path, encoding="utf-8"))


def save(path, obj):
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        json.dumps(obj, ensure_ascii=False, indent=1))


def snapshot(name):
    return os.path.join(SNAP, name)


def build(name):
    ensure_build()
    return os.path.join(BUILD, name)


def norm_name(s):
    """Normalise a skill/item name for matching across sources."""
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def loose_pattern(name):
    """A regex that survives PDF extraction artifacts.

    pypdf sprinkles stray spaces and ligatures through the text ("Acid T error",
    "aﬀected", "Cast Ɵme"), so an exact search returns false negatives — this bit
    us during the 2026-08-22 audit, where a plain search reported Acid Terror as
    undocumented when the PDF states its formula outright. Always search with this.
    """
    return r"\s*\W{0,3}\s*".join(re.escape(ch) for ch in name if not ch.isspace())


def strip_html(s):
    s = re.sub(r"<br\s*/?>", "\n", s or "")
    s = re.sub(r"<[^>]+>", "", s)
    import html as _html
    return re.sub(r"[ \t]+", " ", _html.unescape(s)).strip()


def node_eval(script, cwd=None):
    """Run a snippet against the engine and return stdout.

    NB paths inside `script` must be built with path.join — a Windows path
    written as a "C:\\..." literal inside a shell-quoted -e loses its
    backslashes and silently creates a file called `CUsers...` in cwd.
    """
    r = subprocess.run(["node", "-e", script], cwd=cwd or BACKEND,
                       capture_output=True)
    err = r.stderr.decode("utf-8", "replace")
    if r.returncode != 0:
        raise RuntimeError(err[:2000])
    return r.stdout.decode("utf-8", "replace")
