"""Build the static M-Seminar site from the scraped data.

Reads ``data/talks.json`` + ``data/match.json`` + ``data/videos.json`` and writes:

  index.html          the page shell
  assets/data.js      window.MSEMINAR = {...}  (all data, embedded)

Run after ``scripts/scrape.py``::

    python scripts/build.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urljoin

sys.path.insert(0, str(Path(__file__).parent))
from validate import TAG_LABELS, validate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ASSETS = ROOT / "assets"

KSU = "https://www.math.ksu.edu"
BASE = KSU + "/research/research-centers/m-center"
CHANNEL = "https://www.youtube.com/@m-seminar_ksu"


def classify(link: dict) -> dict:
    url = urljoin(BASE + "/", link["url"])
    label = (link.get("label") or "").strip()
    low = url.lower()
    lab = label.lower()
    if "zoom.us" in low:
        kind = "zoom"
    elif "youtube" in low or "youtu.be" in low or "mediasite" in low or "kaltura" in low:
        kind = "video"
    elif "arxiv.org" in low:
        kind = "paper"
    elif low.endswith(".pdf") or re.search(r"notes?|slides?|lec|handout|plan", lab):
        kind = "notes"
    else:
        kind = "other"
    return {"label": label or "Link", "url": url, "kind": kind}


def build() -> dict:
    talks = json.loads((DATA / "talks.json").read_text(encoding="utf-8"))
    matches = {m["id"]: m for m in
               json.loads((DATA / "match.json").read_text(encoding="utf-8"))}
    videos = {v["id"]: v for v in
              json.loads((DATA / "videos.json").read_text(encoding="utf-8"))}

    today = date.today().isoformat()
    out_talks = []
    for t in talks:
        md = t.get("month_day")
        date_iso = None
        if md and t.get("section_year"):
            try:
                date_iso = date(t["section_year"], md[0], md[1]).isoformat()
            except ValueError:
                date_iso = None

        links = [classify(l) for l in t.get("links", [])]
        # de-duplicate links by url
        seen = set()
        links = [l for l in links if not (l["url"] in seen or seen.add(l["url"]))]

        vids = []
        for v in matches.get(t["id"], {}).get("videos", []):
            meta = videos.get(v["id"], {})
            vids.append({
                "id": v["id"],
                "title": meta.get("title", v.get("title", "")),
                "part": v.get("part", 1),
                "duration": meta.get("duration"),
                "views": meta.get("views"),
                "embed": f"https://www.youtube.com/embed/{v['id']}",
                "thumb": f"https://i.ytimg.com/vi/{v['id']}/hqdefault.jpg",
                "url": f"https://www.youtube.com/watch?v={v['id']}",
            })

        out_talks.append({
            "id": t["id"],
            "year": t.get("section_year"),
            "season": t.get("season"),
            "date_text": t.get("date_text"),
            "date_iso": date_iso,
            "speaker": t.get("speaker"),
            "affiliation": t.get("affiliation"),
            "title": t.get("title") or "",
            "abstract": t.get("abstract") or "",
            "tags": t.get("tags") or [],
            "extra": t.get("extra") or [],
            "cancelled": bool(t.get("cancelled")),
            "upcoming": bool(date_iso and date_iso >= today),
            "links": links,
            "videos": vids,
            "source": t.get("source"),
        })

    years = sorted({t["year"] for t in out_talks if t["year"]}, reverse=True)

    speakers = {}
    sp_path = DATA / "speakers.json"
    if sp_path.exists():
        speakers = json.loads(sp_path.read_text(encoding="utf-8"))

    tag_counts: dict[str, int] = {}
    for t in out_talks:
        for tag in t["tags"]:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    tags = [
        {"slug": slug, "label": TAG_LABELS.get(slug, slug), "count": tag_counts[slug]}
        for slug in sorted(tag_counts, key=lambda s: (-tag_counts[s], s))
    ]

    payload = {
        "generated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "today": today,
        "channel": CHANNEL,
        "base": BASE,
        "counts": {
            "talks": len(out_talks),
            "withVideo": sum(1 for t in out_talks if t["videos"]),
            "videos": sum(len(t["videos"]) for t in out_talks),
            "speakers": len(speakers),
            "years": years,
        },
        "speakers": speakers,
        "tags": tags,
        "talks": out_talks,
    }
    return payload


HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>M-Seminar · Kansas State University</title>
<meta name="description" content="Archive of the K-State M-Seminar: talks, abstracts, slides and video recordings.">
<link rel="preconnect" href="https://i.ytimg.com">
<link rel="stylesheet" href="assets/style.css">
<link id="sitetheme-css" rel="stylesheet" href="assets/themes/refined-current.css">
<script>
// Apply the stored theme before first paint to avoid a flash.
try {
  var t = localStorage.getItem('mseminar-theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t;
  }
} catch (e) {}
</script>
<script>
window.MathJax = {
  tex: { inlineMath: [['$','$'], ['\\\\(','\\\\)']], displayMath: [['$$','$$']],
         macros: { Bbb: "\\\\mathbb", CC: "\\\\mathbb{C}", RR: "\\\\mathbb{R}",
                   ZZ: "\\\\mathbb{Z}", QQ: "\\\\mathbb{Q}", NN: "\\\\mathbb{N}" } },
  options: { skipHtmlTags: ['script','noscript','style','textarea','pre','code'] }
};
</script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
</head>
<body>
<header class="site-header">
  <div class="wrap header-inner">
    <div class="brand">
      <span class="mark">M</span>
      <div>
        <h1>M-Seminar</h1>
        <p class="sub">Kansas State University · M-Center</p>
      </div>
    </div>
    <nav class="header-links">
      <a href="https://www.math.ksu.edu/research/research-centers/m-center/" target="_blank" rel="noopener">M-Center</a>
      <a href="https://www.youtube.com/@m-seminar_ksu" target="_blank" rel="noopener">YouTube</a>
      <a href="https://www.math.ksu.edu/research/research-centers/m-center/seminars.html" target="_blank" rel="noopener">Original page</a>
      <label class="sitetheme-label">Theme
        <select id="sitetheme" aria-label="Site theme"></select>
      </label>
      <button id="theme-toggle" class="theme-toggle" type="button" title="Color theme">◐</button>
    </nav>
  </div>
</header>

<main class="wrap">
  <p class="standfirst">The programme archive of the K-State M-Seminar · %%YEAR_RANGE%%</p>
  <aside class="disclaimer" role="note">
    <p><span class="disclaimer-tag">Please note</span>This is an unofficial, AI-generated archive. Everything here was put together by an AI agent from information scraped off the public web and then only partially reviewed by a human, so titles, dates, speakers and abstracts may be wrong. Treat the <a href="https://www.math.ksu.edu/research/research-centers/m-center/seminars.html" target="_blank" rel="noopener">official M-Seminar page</a> as the source of truth, and check the "Last built" date below before assuming a listing is current. This site will be updated irregularly.</p>
  </aside>

  <section class="hero">
    <p id="next-talk" class="next-talk" hidden></p>
    <div class="controls">
      <label class="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input id="q" type="search" placeholder="Search title, speaker, abstract…  (press /)" autocomplete="off">
      </label>
      <select id="year" aria-label="Filter by year"><option value="">All years</option></select>
      <label class="check"><input id="hasVideo" type="checkbox"> With video</label>
      <label class="check"><input id="upcomingOnly" type="checkbox"> Upcoming</label>
      <label class="check"><input id="hideCancelled" type="checkbox" checked> Hide cancelled</label>
      <select id="sort" aria-label="Sort">
        <option value="new">Newest first</option>
        <option value="old">Oldest first</option>
        <option value="speaker">By speaker</option>
      </select>
    </div>
    <div id="tagRow" class="tag-row" role="group" aria-label="Filter by topic">
      <span class="tag-row-label">Topics (match any):</span>
    </div>
    <p id="stats" class="stats"></p>
  </section>

  <p id="stats-band" class="stats-band" hidden></p>
  <section id="results" class="results"></section>
  <p id="empty" class="empty" hidden>No talks match your filters.</p>
</main>

<footer class="site-footer">
  <div class="wrap">
    <p>Programme data scraped from <a href="https://www.math.ksu.edu/research/research-centers/m-center/seminars.html" target="_blank" rel="noopener">math.ksu.edu</a> and partially reviewed by hand.
       Video recordings from the <a href="https://www.youtube.com/@m-seminar_ksu" target="_blank" rel="noopener">M-Seminar YouTube channel</a>.</p>
    <p class="muted">Last built <span id="built"></span>. Unofficial mirror; not affiliated with K-State.</p>
  </div>
</footer>

<script src="assets/data.js"></script>
<script src="assets/app.js"></script>
<!-- Vercel observability (zero-config static): replace UNIQUE-PATH-ANALYTICS with the script path shown in the Vercel dashboard under project > Analytics > Enable, and UNIQUE-PATH-SPEED with the one under project > Speed Insights. Both 404 harmlessly until enabled. -->
<script>
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/UNIQUE-PATH-ANALYTICS/script.js"></script>
<script>
window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
</script>
<script defer src="/UNIQUE-PATH-SPEED/script.js"></script>
</body>
</html>
"""


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the M-Seminar site.")
    ap.add_argument("--strict", action="store_true",
                    help="abort the build on validation warnings too")
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        pass

    issues = validate()
    errors = [m for lvl, m in issues if lvl == "error"]
    warns = [m for lvl, m in issues if lvl == "warn"]
    for m in errors:
        print(f"  [error] {m}")
    if warns:
        print(f"  {len(warns)} warning(s) — run `python scripts/validate.py` for details")
    if errors or (args.strict and warns):
        sys.exit("validation failed; not building")

    payload = build()
    ASSETS.mkdir(exist_ok=True)
    (ASSETS / "data.js").write_text(
        "window.MSEMINAR = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8")
    years = payload["counts"]["years"] or []
    year_range = f"{years[-1]}–{years[0]}" if years else ""
    html = HTML.replace("%%YEAR_RANGE%%", year_range)
    (ROOT / "index.html").write_text(html, encoding="utf-8")
    c = payload["counts"]
    print(f"Wrote index.html + assets/data.js  "
          f"({c['talks']} talks, {c['withVideo']} with video, {c['videos']} recordings)")


if __name__ == "__main__":
    main()
