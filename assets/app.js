/* M-Seminar site — renders the archive from window.MSEMINAR */
(function () {
  "use strict";
  const D = window.MSEMINAR;
  if (!D) return;

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // arXiv references: arxiv.org URLs, "arXiv:ID", and lists like
  // "arXiv preprints 2411.02266, 2505.09950". IDs may be new-style
  // (YYMM.NNNNN, optional vN) or old-style (archive/YYMMNNN).
  const ARXIV_ID = "(?:[A-Za-z\\-]+\\/\\d{7}|\\d{4}\\.\\d{4,5})(?:v\\d+)?";
  const ARXIV_RE = new RegExp(
    "https?://(?:www\\.)?arxiv\\.org/(?:abs|pdf)/[^\\s<>\"')\\]]+" +
      "|arXiv\\s*:?\\s*(?:preprints?\\s*:?\\s*)?(" +
      ARXIV_ID +
      "(?:\\s*,\\s*(?:and\\s+)?" +
      ARXIV_ID +
      ")*)",
    "gi",
  );
  const ARXIV_SEP_RE = /(\s*,\s*(?:and\s+)?)/;

  function arxivAnchor(id) {
    const a = document.createElement("a");
    a.href = "https://arxiv.org/abs/" + id;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = id;
    return a;
  }

  // Wrap arXiv references in text nodes with links to the abstract page.
  // Only splits text at the references themselves, so $...$ spans stay intact.
  function linkifyArxiv(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
      const text = node.textContent;
      ARXIV_RE.lastIndex = 0;
      let m;
      let last = 0;
      const frag = document.createDocumentFragment();
      let hit = false;
      while ((m = ARXIV_RE.exec(text)) !== null) {
        if (m[0].length === 0) {
          ARXIV_RE.lastIndex++;
          continue;
        }
        hit = true;
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        if (m[1] === undefined) {
          // URL form: drop trailing punctuation, normalize pdf -> abs.
          let raw = m[0];
          const trail = raw.match(/[.,;:!?)\]]+$/)?.[0] ?? "";
          const end = m.index + m[0].length - trail.length;
          raw = raw.slice(0, raw.length - trail.length);
          const href = raw.replace(/arxiv\.org\/pdf\//i, "arxiv.org/abs/").replace(/\.pdf$/i, "");
          const a = document.createElement("a");
          a.href = href;
          a.target = "_blank";
          a.rel = "noopener";
          a.textContent = raw;
          frag.appendChild(a);
          last = end;
        } else {
          // ID or comma-separated ID list: keep the prefix text, link each ID.
          const list = m[1];
          frag.appendChild(document.createTextNode(m[0].slice(0, m[0].indexOf(list))));
          for (const part of list.split(ARXIV_SEP_RE)) {
            if (!part) continue;
            if (/^\s*,\s*(?:and\s+)?$/.test(part)) frag.appendChild(document.createTextNode(part));
            else frag.appendChild(arxivAnchor(part));
          }
          last = m.index + m[0].length;
        }
      }
      if (hit) {
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.replaceWith(frag);
      }
    }
  }

  const state = {
    q: "",
    year: "",
    hasVideo: false,
    upcomingOnly: false,
    hideCancelled: true,
    sort: "new",
    tags: new Set(),
  };

  function tagLabel(slug) {
    const f = (D.tags || []).find((t) => t.slug === slug);
    return f ? f.label : slug;
  }

  function tagsFromHash() {
    const h = location.hash;
    const m = h.match(/^#tag=(.+)$/);
    if (!m) return null;
    return m[1].split(",").map(decodeURIComponent).filter(Boolean);
  }

  function syncHash() {
    const frag = [...state.tags].map(encodeURIComponent).join(",");
    // replaceState avoids history spam and does not fire hashchange.
    if (frag) {
      if (location.hash !== "#tag=" + frag) history.replaceState(null, "", "#tag=" + frag);
    } else if (location.hash.startsWith("#tag=")) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  const THEME_GLYPH = { auto: "◐", light: "☀", dark: "☾" };

  function resolvedTheme() {
    const set = document.documentElement.dataset.theme;
    if (set === "light" || set === "dark") return set;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function applyTheme(t) {
    const root = document.documentElement;
    root.dataset.theme = t;
    root.style.colorScheme = t;
    try {
      localStorage.setItem("mseminar-theme", t);
    } catch (e) {
      /* private mode */
    }
    updateThemeButton();
  }

  function updateThemeButton() {
    const btn = $("#theme-toggle");
    if (!btn) return;
    const now = resolvedTheme();
    const next = now === "dark" ? "light" : "dark";
    btn.textContent = THEME_GLYPH[next];
    const label = `Switch to ${next} mode`;
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }

  function tagKnown(slug) {
    return (D.tags || []).some((t) => t.slug === slug);
  }

  /* ---------------------------------------------------------------- tags */
  function buildTagRow() {
    const row = $("#tagRow");
    if (!row) return;
    for (const t of D.tags || []) {
      const b = el("button", "ttag", t.label);
      b.type = "button";
      b.dataset.slug = t.slug;
      b.title = `${t.count} talks`;
      b.setAttribute("aria-pressed", "false");
      b.appendChild(el("span", "n", String(t.count)));
      b.addEventListener("click", () => toggleTag(t.slug));
      row.appendChild(b);
    }
    const clear = el("button", "tag-clear", "Clear");
    clear.type = "button";
    clear.hidden = true;
    clear.addEventListener("click", () => {
      state.tags.clear();
      syncHash();
      render();
    });
    row.appendChild(clear);
  }

  function toggleTag(slug) {
    if (state.tags.has(slug)) state.tags.delete(slug);
    else state.tags.add(slug);
    syncHash();
    render();
  }

  function updateTagRow() {
    const row = $("#tagRow");
    if (!row) return;
    for (const b of row.querySelectorAll(".ttag")) {
      const on = state.tags.has(b.dataset.slug);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    const clear = row.querySelector(".tag-clear");
    if (clear) clear.hidden = state.tags.size === 0;
  }

  const SEASON_ORDER = { Fall: 3, Summer: 2, Spring: 1, Winter: 0 };

  /* ---------------------------------------------------------------- init */
  function init() {
    $("#built").textContent = D.generated;
    const sel = $("#year");
    for (const y of D.counts.years) {
      const o = el("option", null, String(y));
      o.value = String(y);
      sel.appendChild(o);
    }
    $("#q").addEventListener("input", (e) => {
      state.q = e.target.value.trim().toLowerCase();
      render();
    });
    $("#year").addEventListener("change", (e) => {
      state.year = e.target.value;
      render();
    });
    $("#hasVideo").addEventListener("change", (e) => {
      state.hasVideo = e.target.checked;
      render();
    });
    $("#upcomingOnly").addEventListener("change", (e) => {
      state.upcomingOnly = e.target.checked;
      render();
    });
    $("#hideCancelled").addEventListener("change", (e) => {
      state.hideCancelled = e.target.checked;
      render();
    });
    $("#sort").addEventListener("change", (e) => {
      state.sort = e.target.value;
      render();
    });
    buildTagRow();
    const initial = tagsFromHash();
    if (initial) state.tags = new Set(initial.filter((s) => tagKnown(s)));
    render();
    window.addEventListener("hashchange", () => {
      const h = tagsFromHash();
      if (h) {
        state.tags = new Set(h.filter((s) => tagKnown(s)));
        render();
      } else {
        focusHash();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== $("#q")) {
        e.preventDefault();
        $("#q").focus();
      }
      if (e.key === "Escape" && document.activeElement === $("#q")) {
        $("#q").value = "";
        state.q = "";
        render();
      }
    });
    renderNext();
    const themeBtn = $("#theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        applyTheme(resolvedTheme() === "dark" ? "light" : "dark");
      });
    }
    updateThemeButton();
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        if (!document.documentElement.dataset.theme) updateThemeButton();
      });
    }
  }

  function renderNext() {
    const upcoming = D.talks
      .filter((t) => t.upcoming && !t.cancelled)
      .sort((a, b) => (a.date_iso || "").localeCompare(b.date_iso || ""));
    const n = upcoming[0];
    const box = $("#next-talk");
    if (!n) return;
    box.hidden = false;
    const b = el("b");
    b.textContent = n.speaker || "TBA";
    box.append(
      "Next up · ",
      n.date_text || n.date_iso || "",
      " — ",
      b,
      n.title ? ": " + n.title : "",
    );
  }

  /* -------------------------------------------------------------- filter */
  function matches(t) {
    if (state.year && String(t.year) !== state.year) return false;
    if (state.hasVideo && !t.videos.length) return false;
    if (state.upcomingOnly && !t.upcoming) return false;
    if (state.hideCancelled && t.cancelled) return false;
    if (state.tags.size > 0) {
      const tt = t.tags || [];
      if (![...state.tags].some((s) => tt.includes(s))) return false;
    }
    if (state.q) {
      const hay = [t.title, t.speaker, t.affiliation, t.abstract, t.date_text, t.season]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      for (const tok of state.q.split(/\s+/)) if (tok && !hay.includes(tok)) return false;
    }
    return true;
  }

  function cmp(a, b) {
    if (state.sort === "speaker") {
      return (a.speaker || "").localeCompare(b.speaker || "");
    }
    const ka = a.date_iso || (a.year ? a.year + "-00-00" : "0000");
    const kb = b.date_iso || (b.year ? b.year + "-00-00" : "0000");
    return state.sort === "old" ? ka.localeCompare(kb) : kb.localeCompare(ka);
  }

  /* -------------------------------------------------------------- render */
  function render() {
    const results = $("#results");
    results.textContent = "";
    const talks = D.talks.filter(matches).sort(cmp);
    $("#empty").hidden = talks.length > 0;

    const withVid = talks.filter((t) => t.videos.length).length;
    const total = D.counts.talks;
    const prefix = talks.length === total ? `${total} talks` : `${talks.length} of ${total} talks`;
    let stats = `${prefix} · ${withVid} with recordings · ${D.counts.videos} videos`;
    if (state.tags.size > 0) {
      const names = [...state.tags].map(tagLabel).join(", ");
      stats += ` · topics (any): ${names}`;
    }
    $("#stats").textContent = stats;
    updateTagRow();

    // group by season+year
    const groups = new Map();
    for (const t of talks) {
      const key = (t.season ? t.season + " " : "") + (t.year || "Undated");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const keys = [...groups.keys()].sort((a, b) => {
      const pa = a.split(" "),
        pb = b.split(" ");
      const ya = parseInt(pa[pa.length - 1]) || 0,
        yb = parseInt(pb[pb.length - 1]) || 0;
      if (ya !== yb) return state.sort === "old" ? ya - yb : yb - ya;
      const sa = SEASON_ORDER[pa[0]] != null ? SEASON_ORDER[pa[0]] : 9;
      const sb = SEASON_ORDER[pb[0]] != null ? SEASON_ORDER[pb[0]] : 9;
      return state.sort === "old" ? sa - sb : sb - sa;
    });

    for (const key of keys) {
      const h = el("h2", "section-head", key);
      h.appendChild(el("span", "section-count", String(groups.get(key).length)));
      results.appendChild(h);
      for (const t of groups.get(key)) results.appendChild(talkCard(t));
    }
    focusHash();
    setupClamps();
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise()
        .then(setupClamps)
        .catch(() => {});
    }
  }

  /* Show "More" only for abstracts that are actually clamped. Do it in batched
     passes (read all, unclamp all, read all, restore all) so the whole page
     costs a couple of layouts instead of two per card. */
  function setupClamps() {
    const items = [];
    for (const card of document.querySelectorAll("#results .talk")) {
      if (card.classList.contains("open")) continue;
      const abs = card.querySelector(".abstract");
      const btn = card.querySelector(".abs-toggle");
      if (abs && btn) items.push({ abs, btn, clamped: abs.clientHeight });
    }
    for (const it of items) it.abs.style.webkitLineClamp = "unset";
    for (const it of items) it.full = it.abs.scrollHeight;
    for (const it of items) it.abs.style.webkitLineClamp = "";
    for (const it of items) {
      if (it.full > it.clamped + 2) it.btn.dataset.tall = "1";
      it.btn.classList.toggle("is-shown", it.btn.dataset.tall === "1");
    }
  }

  function focusHash() {
    if (!location.hash) return;
    const node = document.getElementById(location.hash.slice(1));
    if (node) node.scrollIntoView({ block: "center" });
  }

  /* --------------------------------------------------------------- cards */
  function talkCard(t) {
    const card = el("article", "talk");
    card.id = t.id;

    const date = el("div", "talk-date");
    if (t.date_iso || t.date_text) {
      date.appendChild(el("span", "day", shortDate(t)));
      date.appendChild(el("span", "season", (t.season || "") + " " + (t.year || "")));
      card.appendChild(date);
    } else {
      // No day/month on the source page; the section heading carries the term.
      card.classList.add("no-date");
    }

    const body = el("div", "talk-body");
    const lead = el("div", "talk-lead");
    if (t.title) {
      const h = el("h3", "talk-title", t.title);
      linkifyArxiv(h);
      lead.appendChild(h);
    }

    const sp = el("p", "talk-speaker");
    const url = D.speakers && D.speakers[t.speaker];
    if (url) {
      const a = el("a", "speaker-link", t.speaker);
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      sp.appendChild(a);
      sp.appendChild(el("span", "ext", " ↗"));
    } else {
      sp.appendChild(el("strong", null, t.speaker || "TBA"));
    }
    if (t.affiliation) sp.appendChild(el("span", "affil", " — " + t.affiliation));
    const badges = el("span", "badges");
    if (t.upcoming) badges.appendChild(el("span", "badge", "Upcoming"));
    if (t.cancelled) badges.appendChild(el("span", "badge cancelled", "Cancelled"));
    if (badges.childNodes.length) sp.appendChild(badges);
    lead.appendChild(sp);

    const meta = el("div", "talk-meta");

    if (t.tags && t.tags.length) {
      const ttags = el("div", "ttags");
      for (const slug of t.tags) {
        const b = el("button", "ttag ttag-card", tagLabel(slug));
        b.type = "button";
        b.title = `Filter by ${tagLabel(slug)}`;
        if (state.tags.has(slug)) {
          b.classList.add("active");
          b.setAttribute("aria-pressed", "true");
        } else {
          b.setAttribute("aria-pressed", "false");
        }
        b.addEventListener("click", () => toggleTag(slug));
        ttags.appendChild(b);
      }
      meta.appendChild(ttags);
    }

    // Zoom links are only useful while the talk is still ahead.
    const links = t.links.filter((l) => l.kind !== "zoom" || t.upcoming);
    const canAdd = t.upcoming && !t.cancelled && Array.isArray(t.sessions) && t.sessions.length > 0;
    if (links.length || canAdd) {
      const chips = el("div", "chips");
      for (const l of links) {
        const a = el("a", "chip " + l.kind);
        a.href = l.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.appendChild(el("span", "dot"));
        a.appendChild(document.createTextNode(l.label));
        chips.appendChild(a);
      }
      if (canAdd) {
        const b = el("button", "chip cal");
        b.type = "button";
        b.title = "Add this talk to Google Calendar";
        b.appendChild(el("span", "dot"));
        b.appendChild(document.createTextNode("Add to calendar"));
        b.addEventListener("click", () => openCalendar(t));
        chips.appendChild(b);
      }
      meta.appendChild(chips);
    }
    if (meta.childNodes.length) lead.appendChild(meta);
    body.appendChild(lead);

    const main = el("div", "talk-main");
    if (t.abstract) {
      const abs = el("div", "abstract", t.abstract);
      linkifyArxiv(abs);
      main.appendChild(abs);
      const more = el("button", "abs-toggle", "More");
      more.type = "button";
      more.addEventListener("click", () => {
        const open = card.classList.toggle("open");
        more.textContent = open ? "Less" : "More";
        if (window.MathJax && MathJax.typesetPromise) {
          MathJax.typesetPromise()
            .then(setupClamps)
            .catch(() => {});
        }
      });
      main.appendChild(more);
    }

    if (t.extra && t.extra.length) {
      // The Zoom line is stale once the talk is over; skip it like the chip.
      const extra = t.extra.filter((x) => t.upcoming || !/^zoom link/i.test(x));
      if (extra.length) {
        const ex = el("div", "extra");
        ex.textContent = extra.join(" · ");
        main.appendChild(ex);
      }
    }
    if (main.childNodes.length) body.appendChild(main);

    if (t.videos.length) {
      const side = el("aside", "talk-side");
      side.appendChild(videoBlock(t.videos));
      body.appendChild(side);
      card.classList.add("has-side");
    } else if (!t.cancelled) {
      const side = el("aside", "talk-side");
      const nov = el("div", "no-video");
      if (t.upcoming) {
        nov.textContent = "Recording not yet available";
      } else {
        nov.appendChild(document.createTextNode("No recording — "));
        const a = el("a", null, "check the channel");
        a.href = D.channel;
        a.target = "_blank";
        a.rel = "noopener";
        nov.appendChild(a);
      }
      side.appendChild(nov);
      body.appendChild(side);
      card.classList.add("has-side");
    }

    card.appendChild(body);
    return card;
  }

  /* ------------------------------------------------------ google calendar */
  const CAL_TZ = "America/Chicago";

  function calDate(s) {
    return s.slice(0, 10).replace(/-/g, "");
  }

  function calStamp(s) {
    const [d, t] = s.split("T");
    return d.replace(/-/g, "") + "T" + t.replace(":", "") + "00";
  }

  function calendarUrl(t, s) {
    const p = new URLSearchParams();
    p.set("action", "TEMPLATE");
    p.set("text", "M-Seminar: " + (t.title || t.speaker || "talk"));
    p.set(
      "dates",
      s.all_day
        ? calDate(s.start) + "/" + calDate(s.end)
        : calStamp(s.start) + "/" + calStamp(s.end),
    );
    if (!s.all_day) p.set("ctz", CAL_TZ);
    const details = [];
    if (t.speaker) details.push(t.speaker + (t.affiliation ? " (" + t.affiliation + ")" : ""));
    if (t.abstract) {
      const a = t.abstract.trim();
      details.push(a.length > 500 ? a.slice(0, 500).replace(/\s+\S*$/, "") + "…" : a);
    }
    if (t.source) details.push("Programme: " + t.source);
    details.push("Archive: " + location.href.split("#")[0] + "#" + t.id);
    p.set("details", details.join("\n\n"));
    if (t.room) p.set("location", t.room + ", Kansas State University");
    return "https://calendar.google.com/calendar/render?" + p.toString();
  }

  let calDialog = null;

  /* One dialog, rebuilt per talk: a row per lecture, each linking to Google
     Calendar with the event prefilled. */
  function openCalendar(t) {
    if (!calDialog) {
      calDialog = el("dialog", "cal-dialog");
      calDialog.setAttribute("aria-labelledby", "cal-dialog-title");
      document.body.appendChild(calDialog);
      calDialog.addEventListener("click", (e) => {
        if (e.target === calDialog) calDialog.close();
      });
    }
    calDialog.textContent = "";

    const h = el("h2", "cal-title", "Add to Google Calendar");
    h.id = "cal-dialog-title";
    calDialog.appendChild(h);
    calDialog.appendChild(el("p", "cal-talk", t.title || "M-Seminar"));
    const who = el("p", "cal-who");
    who.textContent = [t.speaker, t.affiliation].filter(Boolean).join(" · ");
    calDialog.appendChild(who);

    const list = el("ul", "cal-list");
    for (const s of t.sessions) {
      const li = el("li", "cal-item");
      li.appendChild(el("span", "cal-when", s.label));
      const a = el("a", "cal-open", "Google Calendar");
      a.href = calendarUrl(t, s);
      a.target = "_blank";
      a.rel = "noopener";
      a.addEventListener("click", () => window.setTimeout(() => calDialog.close(), 0));
      li.appendChild(a);
      list.appendChild(li);
    }
    calDialog.appendChild(list);

    const timed = t.sessions.some((s) => !s.all_day);
    calDialog.appendChild(
      el(
        "p",
        "cal-note",
        timed
          ? "Times are Kansas local time (Central). Google Calendar keeps that time and shows the event in your own timezone — review it there, then save."
          : "No time of day was listed for this talk, so the event is all day — review it in Google Calendar, then save.",
      ),
    );

    const actions = el("div", "cal-actions");
    const close = el("button", "cal-close", "Close");
    close.type = "button";
    close.addEventListener("click", () => calDialog.close());
    actions.appendChild(close);
    calDialog.appendChild(actions);

    if (!calDialog.open) calDialog.showModal();
  }

  function shortDate(t) {
    if (!t.date_iso) return t.date_text ? t.date_text.split(",")[0] : "—";
    const d = new Date(t.date_iso + "T00:00:00");
    const mon = d.toLocaleDateString(undefined, { month: "short" });
    const days = [d.getDate()];
    // "November 18, 19" / "October 26, 28, 29" -> "Nov 18–19" / "Oct 26–29".
    // Anything after the day list (times, other months) is left to date_text.
    const rest = (t.date_text || "").match(/^[^,]+,\s*([\d,\s]+)/);
    if (rest) {
      for (const part of rest[1].split(",")) {
        const n = parseInt(part.trim(), 10);
        if (!(n > days[days.length - 1] && n <= 31)) break;
        days.push(n);
      }
    }
    return days.length > 1 ? `${mon} ${days[0]}–${days[days.length - 1]}` : `${mon} ${days[0]}`;
  }

  function fmtDuration(secs) {
    if (!secs && secs !== 0) return "";
    const h = Math.floor(secs / 3600);
    const m = Math.round((secs % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  }

  function videoBlock(videos) {
    const wrap = el("div", "video-block");
    const media = el("div", "video-media");
    const side = el("div", "video-side");
    let idx = 0;

    const player = el("button", "video-thumb");
    player.type = "button";
    player.setAttribute(
      "aria-label",
      location.protocol === "file:" ? "Watch the recording on YouTube" : "Play the recording",
    );
    const img = el("img");
    img.loading = "lazy";
    img.alt = "";
    player.appendChild(img);
    player.appendChild(el("span", "play", "▶"));
    media.appendChild(player);

    side.appendChild(
      el("span", "video-label", videos.length > 1 ? `${videos.length} parts` : "Recording"),
    );
    const note = el("span", "video-note");
    side.appendChild(note);

    let parts = null;
    if (videos.length > 1) {
      parts = el("div", "video-parts");
      videos.forEach((v, i) => {
        const b = el("button", "part", "Part " + (v.part || i + 1));
        b.type = "button";
        b.addEventListener("click", () => {
          if (player.isConnected) {
            setThumb(i);
            load();
          } else {
            setThumb(i);
          }
        });
        parts.appendChild(b);
      });
      side.appendChild(parts);
    }

    function setThumb(i) {
      idx = i;
      img.src = videos[i].thumb;
      note.textContent = fmtDuration(videos[i].duration);
      if (parts) {
        [...parts.children].forEach((c, j) => c.classList.toggle("active", j === i));
      }
    }
    function load() {
      const v = videos[idx];
      // An embed served from file:// has no referrer to send, so YouTube answers
      // with its configuration error; send the reader to the video instead.
      if (location.protocol === "file:") {
        window.open(v.url, "_blank", "noopener");
        return;
      }
      const frame = el("iframe", "video-frame");
      // YouTube rejects embeds that do not declare a usable referrer (error 153).
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.src = v.embed + "?autoplay=1&rel=0";
      frame.title = v.title || "Recording";
      frame.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      frame.allowFullscreen = true;
      player.replaceWith(frame);
      wrap.classList.add("playing");
      const card = wrap.closest(".talk");
      if (card) card.classList.add("playing");
      setThumb(idx);
    }
    player.addEventListener("click", load);

    wrap.appendChild(media);
    wrap.appendChild(side);
    setThumb(0);
    return wrap;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
