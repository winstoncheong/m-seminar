# Redesign previews (throwaway)

Six static mockups for the M-Seminar archive redesign ("sleek and professional").
Each option is one self-contained `index.html` with inline CSS — no build step, no
dependencies except an optional MathJax CDN for the `$...$` math in two abstracts.
Content is 6 real talks copied from `../../data/talks.json` (newest first), covering a
3-part video series (DeHority), single recordings (Reineke, Jindal, Kapustin), a
no-recording talk (Kuwagaki), and a cancelled talk (Kontsevich). Tag chips use plausible
hardcoded tags (DT theory, CoHA, mirror symmetry, …) for demo only — the real tag filter
is a separate feature.

## Viewing

```bash
cd <repo root>
python -m http.server 8765
# open e.g. http://localhost:8765/previews/01-refined-current/index.html
```

Files also render via `file://` (CDN math needs network).

## The options

1. **01-refined-current** — Tightens the existing tokens (type scale, spacing, card rhythm,
   pill statuses) and adds a persistent light/dark toggle. For readers who like the current
   page and just want it more polished; lowest-risk rebuild.
2. **02-editorial-serif** — Journal-like: serif titles, double rules instead of cards, small-caps
   kickers, narrow measure, high density. For the "this is a serious seminar" reader; best for
   scanning many abstracts, weakest for video-first browsing.
3. **03-bold-modern** — Strongest brand statement: purple-gradient hero with big search, stats band
   (342 talks · 19 series · 2015–2026), card grid with brand top-borders. For first-time visitors
   and department promotion; most Scheduled-homepage energy, most vertical space spent above talks.
4. **04-compact-directory** — Dense table-like rows (date gutter, 2-line clamped abstracts,
   side action column) with a sticky toolbar. For power users who scan by date/title and want the
   most talks per screen; least visual warmth.
5. **05-filter-sidebar** — Left sidebar with search, tag cloud, and refine selects; card grid on the
   right. For topic-driven browsing once tag filtering lands; sidebars cost horizontal space on
   narrow screens (collapses below 800px).
6. **06-dark-scholarly** — Dark-first chalkboard mood (gold + chalk-green accents, serif titles) with
   a light-mode toggle. For evening reading and a distinctive identity; dark palettes need extra
   contrast care for abstracts.

## After the pick

The winner is rebuilt properly in a follow-up PR into `scripts/build.py` (markup template),
`assets/style.css`, and `assets/app.js` — these previews are throwaway and must not be
copy-pasted as production markup.
