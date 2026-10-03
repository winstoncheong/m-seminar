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

  const state = {
    q: "",
    year: "",
    hasVideo: false,
    upcomingOnly: false,
    hideCancelled: true,
    sort: "new",
  };

  const THEME_ORDER = ["auto", "light", "dark"];
  const THEME_GLYPH = { auto: "◐", light: "☀", dark: "☾" };

  function themeSetting() {
    return document.documentElement.dataset.theme || "auto";
  }

  function applyTheme(t) {
    const root = document.documentElement;
    if (t === "auto") {
      delete root.dataset.theme;
      root.style.colorScheme = "light dark";
    } else {
      root.dataset.theme = t;
      root.style.colorScheme = t;
    }
    try {
      localStorage.setItem("mseminar-theme", t);
    } catch (e) {
      /* private mode */
    }
    updateThemeButton();
  }

  function updateThemeButton() {
    const t = themeSetting();
    const btn = $("#theme-toggle");
    if (!btn) return;
    btn.textContent = THEME_GLYPH[t] || THEME_GLYPH.auto;
    const label = "Color theme: " + t + " (click to change)";
    btn.title = label;
    btn.setAttribute("aria-label", label);
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
    render();
    window.addEventListener("hashchange", focusHash);
    const themeBtn = $("#theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const next = THEME_ORDER[(THEME_ORDER.indexOf(themeSetting()) + 1) % THEME_ORDER.length];
        applyTheme(next);
      });
    }
    updateThemeButton();
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
    $("#stats").textContent =
      `${talks.length} of ${D.counts.talks} talks · ${withVid} with recordings ` +
      `· ${D.counts.videos} videos in the archive`;

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
      results.appendChild(h);
      for (const t of groups.get(key)) results.appendChild(talkCard(t));
    }
    focusHash();
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise().catch(() => {});
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
    date.appendChild(el("span", "day", shortDate(t)));
    date.appendChild(el("span", "season", (t.season || "") + " " + (t.year || "")));
    card.appendChild(date);

    const body = el("div", "talk-body");
    if (t.title) body.appendChild(el("h3", "talk-title", t.title));

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
    body.appendChild(sp);

    if (t.links.length) {
      const chips = el("div", "chips");
      for (const l of t.links) {
        const a = el("a", "chip " + l.kind);
        a.href = l.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.appendChild(el("span", "dot"));
        a.appendChild(document.createTextNode(l.label));
        chips.appendChild(a);
      }
      body.appendChild(chips);
    }

    if (t.abstract) {
      const abs = el("div", "abstract clamped", t.abstract);
      body.appendChild(abs);
      const more = el("button", "more", "Show abstract");
      more.addEventListener("click", () => {
        const on = abs.classList.toggle("clamped");
        more.textContent = on ? "Show abstract" : "Hide abstract";
        if (!on && window.MathJax && MathJax.typesetPromise)
          MathJax.typesetPromise().catch(() => {});
      });
      body.appendChild(more);
    }

    if (t.videos.length) {
      body.appendChild(videoBlock(t.videos));
    } else if (!t.cancelled) {
      const nov = el(
        "div",
        "no-video",
        t.upcoming ? "Recording not yet available." : "No recording found — ",
      );
      if (!t.upcoming) {
        const a = el("a", null, "check the YouTube channel");
        a.href = D.channel;
        a.target = "_blank";
        a.rel = "noopener";
        nov.appendChild(a);
        nov.appendChild(document.createTextNode(" for this talk."));
      }
      body.appendChild(nov);
    }

    if (t.extra && t.extra.length) {
      const ex = el("div", "extra");
      ex.textContent = t.extra.join(" · ");
      body.appendChild(ex);
    }

    card.appendChild(body);
    return card;
  }

  function shortDate(t) {
    if (!t.date_iso) return t.date_text ? t.date_text.split(",")[0] : "—";
    const d = new Date(t.date_iso + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function videoBlock(videos) {
    const wrap = el("div", "video-block");
    let idx = 0;
    const player = el("button", "video-thumb");
    player.type = "button";
    const img = el("img");
    img.loading = "lazy";
    img.alt = "";
    player.appendChild(img);
    const play = el("span", "play", "▶");
    player.appendChild(play);

    function setThumb(i) {
      idx = i;
      img.src = videos[i].thumb;
      if (parts) {
        [...parts.children].forEach((c, j) => c.classList.toggle("active", j === i));
      }
    }
    function load() {
      const v = videos[idx];
      const frame = el("iframe", "video-frame");
      frame.src = v.embed + "?autoplay=1&rel=0";
      frame.title = v.title || "Recording";
      frame.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      frame.allowFullscreen = true;
      player.replaceWith(frame);
    }
    player.addEventListener("click", load);

    let parts = null;
    if (videos.length > 1) {
      parts = el("div", "video-parts");
      videos.forEach((v, i) => {
        const b = el("button", "part", v.part && videos.length > 1 ? "Part " + v.part : "Play");
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
    }
    wrap.appendChild(player);
    if (parts) wrap.appendChild(parts);
    setThumb(0);
    return wrap;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
