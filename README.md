# M-Seminar site

A single-page archive of the **M-Seminar** (Kansas State University M-Center):
talks, speakers, affiliations, abstracts, slides/notes links, and the matching
YouTube recordings — all in one searchable page.

The data is **curated by hand** (with agent assistance), not scraped: the K-State
pages have changed markup several times since 2007 and no parser stays correct
for long. An agent reads the sources below and standardizes them into `data/`.

- Official page: <https://www.math.ksu.edu/research/research-centers/m-center/seminars.html>
- Past seasons: <https://www.math.ksu.edu/research/research-centers/m-center/past_seminars/>
- YouTube channel: <https://www.youtube.com/@m-seminar_ksu>

## What's here

```
  index.html            generated page (open this, or serve the folder)
  assets/
    style.css           styling (light + dark, with toggle)
    app.js              rendering, search, filters, click-to-load video
    data.js             generated: window.MSEMINAR = {...}
  data/
    talks.json          the programme, newest first (curated)
    videos.json         YouTube channel inventory (curated)
    match.json          talk -> video mapping (curated)
    speakers.json       speaker name -> homepage URL (curated)
  scripts/
    build.py            data/*.json -> index.html + assets/data.js
    validate.py         check the data for mistakes (run before building)
    format.sh           Prettier the assets/data
```

Everything under `data/` and the generated `index.html` / `assets/data.js` are
committed, so the site works without running anything.

## Maintaining (for agents)

To add a new semester (or fix entries), read the official pages and the
YouTube channel, then update `data/`:

1. **`talks.json`** — one object per talk, newest first. Fields:
   `id` (stable slug, e.g. `2026-tatsuki-kuwagaki-sheaf-theory-for-non-exact-lagrangians`),
   `section_year` (int), `season` (`Spring`/`Summer`/`Fall`/`Winter` or null),
   `date_text` (as printed, e.g. `September 24, 1:30pm (special time)`),
   `month_day` ([month, day] numbers, or null), `speaker`, `affiliation`,
   `cancelled` (bool), `title`, `abstract`, `links` (array of
   `{label, url}` — K-State PDF links are site-rooted, e.g.
   `/research/research-centers/m-center/foo.pdf`; `build.py` absolutizes them),
   `extra` (lecture-series schedules, room info, …), `source` (page URL),
   `order` (position on the source page, for stable sorting).
   Endowed lectures name the lecture, not the speaker (`William J. Spencer
   Lecture`): put that in `extra` and the real speaker in `speaker`.
2. **`videos.json`** — one object per channel video: `id` (YouTube id),
   `title`, `duration` (seconds), `views`, `url`.
3. **`match.json`** — `{"talk": <index into talks.json>, "videos":
   [{"id", "part", "title"}]}`. Multi-part series go on the single series
   talk, ordered by `part`. A talk with no recording gets `"videos": []` —
   the site then says so explicitly.
4. **`speakers.json`** — plain `{name: homepage URL}` map. Prefer the
   speaker's own page; university faculty pages are fine. Never link
   Wikipedia, Scholar, LinkedIn, arXiv, or conference pages. Only add a URL
   you are confident belongs to that person — no link beats a wrong link.

Math in titles/abstracts uses `$...$`. Every `$` must be paired, and each
pair must contain only math (a missing closer makes MathJax swallow prose —
`validate.py` catches this). Custom macros available: `\Bbb`, `\CC`, `\RR`,
`\ZZ`, `\QQ`, `\NN` (defined for MathJax in `build.py`).

Then rebuild:

```bash
python scripts/validate.py   # must report 0 errors
python scripts/build.py      # runs the validator first, refuses on errors
bash scripts/format.sh       # Prettier the assets/data for easy searching
```

`build.py` refuses to build on validation errors (unbalanced `$`, a
non-person "speaker", a bad date, a dangling/duplicate video reference).
Pass `--strict` to also fail on warnings. Serve the folder over HTTP to view:

```bash
python -m http.server 8765
```

## Deploying

The site is fully static (no build step at serve time), so any static host
works. On Vercel: import this repo, Framework Preset `Other`, no build
command, output directory `./` (the repo root). Every push redeploys.

## Notes

- Unofficial mirror; not affiliated with K-State. Programme text belongs to the
  M-Seminar.
- The abstract text may contain LaTeX; the page renders it with MathJax.
