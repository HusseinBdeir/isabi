# Showcase design layer (2026-11 redesign): ivory ground, white cards, tinted icon tiles.
# Loaded after part_styles.CSS. The earlier stylesheet still styles the widgets kept from the
# previous site (live demo, industry blueprints, FAQ, Ask ISABI thread, scope builder), and this
# layer re-points its colour tokens to the same warm palette.
CSS_D = r"""
:root,
:root[data-theme="light"] {
  --hdr-h: 64px;
  --d-bg: #FBF8F2;
  --d-card: #FFFFFF;
  --d-soft: #FDFBF6;
  --d-ink: #281D15;
  --d-ink2: #4A3628;
  --d-muted: #5C5148;
  --d-line: #E7DFD0;
  --d-line2: #D9CFBC;
  --d-line3: #EFE8DA;
  --d-brass: #C6922F;
  --d-brass-b: #B88228;
  --d-brass-ink: #1B140F;
  --d-brass-text: #7A5210;
  --d-brass-hi: #B07A1E;
  --d-tint: #F3E4BF;
  --d-tint-b: #D9B66A;
  --d-tint2: #FBF3DE;
  --d-track: #F0EADC;
  --d-hover: #F6F0E2;
  --d-bl-bg: #E3ECF8;
  --d-bl-fg: #1F4E96;
  --d-gr-bg: #E1F0E7;
  --d-gr-fg: #1B6A42;
  --d-gr-line: #BFDCCB;
  --d-gr-soft: #F1F8F4;
  --d-warn: #8A5A0B;
  --d-crit: #A6343B;
  --d-wa: #1DA851;
  --d-shadow: 0 28px 56px -36px rgba(40, 29, 21, 0.45);
  --d-logo-card: #FFFFFF;
  /* Earlier tokens, re-pointed to the warm palette */
  --bg: #FBF8F2;
  --bg-alt: #FFFFFF;
  --surface: #FFFFFF;
  --surface-2: #FDFBF6;
  --surface-elev: #FFFFFF;
  --ink: #281D15;
  --muted: #5C5148;
  --muted-2: #7A6E62;
  --line: #E7DFD0;
  --line-strong: #D9CFBC;
  --plate: #F6F0E2;
  --brass-ink: #1B140F;
  --shadow-sm: 0 2px 8px rgba(40, 29, 21, 0.05);
  --shadow-md: 0 12px 30px rgba(40, 29, 21, 0.08);
  --shadow-lg: 0 28px 56px -36px rgba(40, 29, 21, 0.45);
  --win-hdr-bg: #FDFBF6;
  --win-hdr-ink: #281D15;
  --win-hdr-muted: #5C5148;
  --win-hdr-line: #E7DFD0;
  --win-pill-border: #D9CFBC;
  --receipt-ink: #281D15;
  --receipt-muted: #5C5148;
  --ai-bg: #FFFFFF;
  --ai-hdr: #FDFBF6;
  --ai-pills-bg: #FFFFFF;
  --ai-pill-bg: #FFFFFF;
  --ai-pill-border: #D9CFBC;
  --ai-pill-ink: #4A3628;
  --ai-pill-active-bg: #F3E4BF;
  --ai-pill-active-ink: #281D15;
  --ai-scope-bg: #FBF3DE;
  --ai-ink: #281D15;
  --ai-body-ink: #33261C;
  --ai-muted: #5C5148;
  --ai-line: #E7DFD0;
  --ai-accent: #7A5210;
  --ai-card: #FDFBF6;
  --ai-card-shadow: none;
  --ai-followup-bg: #FFFFFF;
  --ai-user-bg: #F3E4BF;
  --ai-user-ink: #281D15;
  --ai-user-border: transparent;
  --ai-input-bg: #FFFFFF;
  --ai-input-border: #D9CFBC;
  --m-bg: #F6F0E2;
  --m-ink: #281D15;
  --m-muted: #5C5148;
  --m-line: #E7DFD0;
  --m-rail: #FDFBF6;
  --m-rail-ink: #281D15;
  --m-rail-muted: #5C5148;
  --m-rail-faint: #8A7D6F;
  --m-rail-line: #E7DFD0;
  --m-rail-hover: rgba(40, 29, 21, 0.05);
  --m-rail-active-bg: #F3E4BF;
  --m-rail-active-ink: #281D15;
  --m-chip: #F6F0E2;
  --m-grid: #EFE8DA;
}
:root[data-theme="dark"] {
  --d-bg: #1B140F;
  --d-card: #241B14;
  --d-soft: #2A2018;
  --d-ink: #FAF6EE;
  --d-ink2: #E6DEC8;
  --d-muted: #BDB1A0;
  --d-line: #3A2E24;
  --d-line2: #4D3F31;
  --d-line3: #33281F;
  --d-brass: #D9A54A;
  --d-brass-b: #E5B764;
  --d-brass-ink: #1B140F;
  --d-brass-text: #E5B764;
  --d-brass-hi: #E5B764;
  --d-tint: rgba(217, 165, 74, 0.20);
  --d-tint-b: rgba(217, 165, 74, 0.52);
  --d-tint2: rgba(217, 165, 74, 0.10);
  --d-track: #3A2E24;
  --d-hover: #30251C;
  --d-bl-bg: rgba(96, 156, 226, 0.18);
  --d-bl-fg: #9CC3F2;
  --d-gr-bg: rgba(72, 184, 120, 0.17);
  --d-gr-fg: #7FD6A4;
  --d-gr-line: rgba(72, 184, 120, 0.40);
  --d-gr-soft: rgba(72, 184, 120, 0.09);
  --d-warn: #E8B45C;
  --d-crit: #EE8A8F;
  --d-wa: #3DCF75;
  --d-shadow: 0 28px 56px -30px rgba(0, 0, 0, 0.7);
  --d-logo-card: #F4EFE6;
  --bg: #1B140F;
  --bg-alt: #1F1711;
  --surface: #241B14;
  --surface-2: #2A2018;
  --surface-elev: #2F241B;
  --ink: #FAF6EE;
  --muted: #BDB1A0;
  --muted-2: #94887A;
  --line: #3A2E24;
  --line-strong: #4D3F31;
  --plate: #150F0B;
  --brass-ink: #1B140F;
  --win-hdr-bg: #1F1711;
  --win-hdr-ink: #FAF6EE;
  --ai-bg: #241B14;
  --ai-hdr: #2A2018;
  --ai-pills-bg: #241B14;
  --ai-pill-bg: rgba(255, 255, 255, 0.05);
  --ai-pill-border: #4D3F31;
  --ai-pill-ink: #E6DEC8;
  --ai-scope-bg: rgba(217, 165, 74, 0.10);
  --ai-ink: #FAF6EE;
  --ai-body-ink: #EDE6D8;
  --ai-muted: #BDB1A0;
  --ai-line: #3A2E24;
  --ai-card: #2A2018;
  --ai-followup-bg: #241B14;
  --ai-user-bg: rgba(217, 165, 74, 0.22);
  --ai-user-ink: #FAF6EE;
  --ai-input-bg: #1F1711;
  --ai-input-border: #4D3F31;
  --m-bg: #1F1711;
  --m-surface: #241B14;
  --m-ink: #FAF6EE;
  --m-muted: #BDB1A0;
  --m-line: #3A2E24;
  --m-rail: #1B140F;
  --m-chip: #30251C;
  --m-grid: #3A2E24;
}

body {
  background: var(--d-bg);
  color: var(--d-ink);
}
h1, h2, h3, h4, .font-display {
  font-stretch: normal;
}

/* ---------- Primitives ---------- */
.d-hd {
  font-family: "Archivo", "Segoe UI", system-ui, sans-serif;
  letter-spacing: -0.02em;
  text-wrap: balance;
  color: var(--d-ink);
  margin: 0;
}
.d-wrap {
  max-width: 1248px;
  margin: 0 auto;
  padding: 0 max(24px, env(safe-area-inset-right, 24px)) 0 max(24px, env(safe-area-inset-left, 24px));
  width: 100%;
}
.d-ic {
  width: 22px;
  height: 22px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.d-ic-sm { width: 18px; height: 18px; }
.d-ic-xs { width: 16px; height: 16px; }
.d-ic-wa { fill: currentColor; stroke: none; }
.d-ok { color: var(--d-gr-fg); }
.d-warn { color: var(--d-warn); }
.d-crit { color: var(--d-crit); }
html[dir="rtl"] .d-flip { transform: scaleX(-1); }
.d-brass { color: var(--d-brass-hi); }
.d-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 22px;
  border-radius: 10px;
  font: 600 16px/1 "Instrument Sans", "Segoe UI", system-ui, sans-serif;
  border: 1px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s;
}
.d-btn:active { transform: translateY(1px); }
.d-btn-sm { min-height: 44px; padding: 0 16px; font-size: 15px; gap: 8px; }
.d-btn-p { background: var(--d-brass); border-color: var(--d-brass-b); color: var(--d-brass-ink); }
.d-btn-p:hover { background: var(--d-brass-b); }
.d-btn-s { background: var(--d-card); border-color: var(--d-line2); color: var(--d-ink); }
.d-btn-s:hover { border-color: var(--d-ink); }
.d-btn-t { background: transparent; color: var(--d-ink); padding: 0 12px; }
.d-btn-t:hover { background: var(--d-hover); }
.d-btn-t .d-ic-wa { color: var(--d-wa); }
.d-card {
  background: var(--d-card);
  border: 1px solid var(--d-line);
  border-radius: 14px;
}
.d-tile {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.d-tile-40 { width: 40px; height: 40px; }
.d-tile-36 { width: 36px; height: 36px; border-radius: 10px; }
.d-tile-36 .d-ic { width: 20px; height: 20px; }
.d-t-br { background: var(--d-tint); color: var(--d-brass-text); }
.d-t-bl { background: var(--d-bl-bg); color: var(--d-bl-fg); }
.d-t-gr { background: var(--d-gr-bg); color: var(--d-gr-fg); }
.d-tile .brand-badge { width: 26px; height: 26px; }
.d-eyebrow {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--d-brass-text);
}
.d-h2 {
  font-size: 36px;
  line-height: 1.1;
  font-weight: 700;
  margin: 8px 0 10px;
}
.d-lead {
  font-size: 17px;
  line-height: 1.5;
  color: var(--d-muted);
  margin: 0;
  max-width: 640px;
}
.d-textlink {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--d-brass-text);
  min-height: 44px;
}
.d-textlink:hover span { text-decoration: underline; }
.d-center { max-width: 720px; margin: 0 auto; text-align: center; }
.d-center .d-lead { max-width: none; }
.d-header a:focus-visible, .d-header button:focus-visible, .d-header [role="button"]:focus-visible,
.d-page a:focus-visible, .d-page button:focus-visible, .d-foot a:focus-visible, .d-sheet button:focus-visible,
.d-btn:focus-visible, .d-field input:focus-visible, .d-field select:focus-visible, .d-field textarea:focus-visible {
  outline: 2px solid var(--d-brass-b);
  outline-offset: 2px;
}

/* ---------- Header ---------- */
.d-header {
  position: sticky;
  top: 0;
  z-index: 100;
  padding-top: env(safe-area-inset-top, 0px);
  background: color-mix(in srgb, var(--d-bg) 94%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--d-line);
  font-size: 16px;
  line-height: 1.5;
}
.d-hdr-in {
  max-width: 1248px;
  height: var(--hdr-h);
  margin: 0 auto;
  padding: 0 max(24px, env(safe-area-inset-right, 24px)) 0 max(24px, env(safe-area-inset-left, 24px));
  display: flex;
  align-items: center;
  gap: 12px;
}
.d-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  min-height: 44px;
}
.d-brand .brand-badge { width: 38px; height: 38px; }
.d-brand .brand-wordmark { height: 34px; }
.d-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.d-nav a, .d-nav .d-back {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 11px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  font: 500 14.5px/1 "Instrument Sans", "Segoe UI", system-ui, sans-serif;
  color: var(--d-ink2);
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.d-nav a:hover, .d-nav .d-back:hover { background: var(--d-hover); color: var(--d-ink); }
.d-nav a.active {
  background: var(--d-tint);
  border-color: var(--d-tint-b);
  color: var(--d-ink);
  font-weight: 600;
}
.d-nav .d-back {
  border-color: var(--d-line2);
  background: var(--d-card);
  font-weight: 600;
  margin-inline-end: 10px;
}
.d-nav .d-back:hover { border-color: var(--d-ink); background: var(--d-card); }
.d-hdr-acts {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.d-lang {
  display: flex;
  border: 1px solid var(--d-line2);
  border-radius: 10px;
  overflow: hidden;
  background: var(--d-card);
  flex: none;
}
.d-lang .lang-pill {
  min-height: 42px;
  min-width: 42px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: 500 14px/1 "Instrument Sans", "Segoe UI", system-ui, sans-serif;
  color: var(--d-ink2);
  cursor: pointer;
  user-select: none;
}
.d-lang .lang-pill:hover { background: var(--d-hover); }
.d-lang .lang-pill.active { background: var(--d-tint); color: var(--d-ink); font-weight: 600; }
.d-iconbtn {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--d-line2);
  background: var(--d-card);
  color: var(--d-ink2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: none;
  padding: 0;
}
.d-iconbtn:hover { border-color: var(--d-ink); }
.d-theme-sun { display: none; }
:root[data-theme="dark"] .d-theme-sun { display: block; }
:root[data-theme="dark"] .d-theme-moon { display: none; }
.d-signin {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 15px;
  min-height: 44px;
  padding: 0 6px;
  color: var(--d-ink);
  white-space: nowrap;
}
.d-signin:hover span { text-decoration: underline; }
.d-strip {
  display: none;
  overflow-x: auto;
  scrollbar-width: none;
  border-top: 1px solid var(--d-line);
  padding: 0 12px;
  gap: 2px;
  align-items: center;
}
.d-strip::-webkit-scrollbar { display: none; }
.d-strip a, .d-strip .d-back {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 11px;
  font: 600 13.5px/1 "Instrument Sans", "Segoe UI", system-ui, sans-serif;
  color: var(--d-muted);
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}
.d-strip a.active { color: var(--d-brass-text); border-bottom-color: var(--d-brass); }
.d-strip .d-back { color: var(--d-ink); }
.d-strip-sep { flex: none; width: 1px; height: 20px; background: var(--d-line2); margin: 0 6px; }

/* ---------- Pages ---------- */
#site-pages { font-size: 16px; line-height: 1.5; }
.d-page {
  min-height: calc(100vh - var(--hdr-h));
  min-height: calc(100dvh - var(--hdr-h));
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 28px 0;
  border-bottom: 1px solid var(--d-line);
  scroll-margin-top: calc(var(--hdr-h) - 1px);
  background: var(--d-bg);
}
.d-page.d-white { background: var(--d-card); }
:root[data-theme="dark"] .d-page.d-white { background: #1F1711; }
.d-head-split {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px 40px;
  margin-bottom: 20px;
}
.d-head-split .d-h2 { margin-bottom: 0; }
.d-head-tight { margin-bottom: 16px; }
.d-lead-side { max-width: 420px; font-size: 16px; }
.d-two {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: 48px;
  align-items: center;
}

/* Page 1: hero */
.d-hero { text-align: center; padding: 14px 0 16px; }
.d-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--d-tint-b);
  background: var(--d-card);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--d-brass-text);
}
.d-h1 {
  font-size: 54px;
  line-height: 1.05;
  font-weight: 700;
  margin: 10px auto 8px;
}
.d-hero-lead {
  font-size: 18px;
  line-height: 1.55;
  color: var(--d-muted);
  margin: 0 auto 14px;
  max-width: 700px;
}
.d-cta-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
}
.d-preview {
  margin: 18px auto 0;
  max-width: 1080px;
  text-align: start;
  overflow: hidden;
  box-shadow: var(--d-shadow);
}
.d-prev-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 18px;
  border-bottom: 1px solid var(--d-line);
  background: var(--d-soft);
}
.d-prev-brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; }
.d-prev-brand .brand-badge { width: 22px; height: 22px; }
.d-prev-hint { font-size: 13px; color: var(--d-muted); }
.d-prev-body { display: flex; flex-wrap: wrap; }
.d-prev-tabs {
  flex: 1 1 250px;
  max-width: 280px;
  padding: 12px;
  border-inline-end: 1px solid var(--d-line);
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--d-soft);
}
.d-tab {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--d-ink2);
  font: 600 15px/1.25 "Instrument Sans", "Segoe UI", system-ui, sans-serif;
  text-align: start;
  cursor: pointer;
}
.d-tab:hover { background: var(--d-hover); }
.d-tab.d-on { background: var(--d-tint); border-color: var(--d-tint-b); color: var(--d-ink); }
.d-prev-stage {
  flex: 999 1 480px;
  min-width: 0;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.d-prev-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 8px; }
.d-prev-title { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
.d-prev-scope { font-size: 13.5px; color: var(--d-muted); }
.d-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.d-kpi { border: 1px solid var(--d-line); border-radius: 10px; padding: 10px 14px; min-width: 0; }
.d-kpi-l { font-size: 13px; color: var(--d-muted); }
.d-kpi-v { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2; }
.d-kpi-s { font-size: 13px; font-weight: 600; color: var(--d-gr-fg); }
.d-bars { display: flex; flex-direction: column; gap: 3px; }
.d-bar-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.4fr) auto;
  gap: 16px;
  align-items: center;
  width: 100%;
  padding: 3px 8px;
  margin: 0 -8px;
  box-sizing: content-box;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.d-bar-row:hover { background: var(--d-hover); }
.d-bar-name { font-size: 14.5px; font-weight: 600; }
.d-bar-track { height: 8px; border-radius: 4px; background: var(--d-track); overflow: hidden; display: block; }
.d-bar-track i { display: block; height: 8px; border-radius: 4px; }
.d-bar-amt { font-size: 14.5px; font-weight: 600; text-align: end; min-width: 78px; }
.d-share-top { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; }
.d-share-top span:first-child { color: var(--d-muted); }
.d-share-top span:last-child { font-weight: 600; }
.d-tracks { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 14px; }
.d-tracks > span:first-child { color: var(--d-muted); }
.d-track-chip { border: 1px solid var(--d-line); border-radius: 6px; padding: 4px 10px; font-weight: 500; background: var(--d-soft); }
.d-vertical { display: flex; flex-direction: column; gap: 12px; }
.d-prev-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--d-line);
  padding-top: 4px;
  font-size: 14px;
  margin-top: auto;
}
.d-prev-var { color: var(--d-muted); }
.d-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  max-width: 1080px;
  margin: 14px auto 0;
  text-align: start;
}
.d-fact { display: flex; gap: 12px; align-items: center; min-width: 0; }
.d-fact-a { font-weight: 600; line-height: 1.3; }
.d-fact-b { font-size: 14px; color: var(--d-muted); line-height: 1.35; }

/* Page 2: platform */
.d-inds { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.d-ind {
  border: 1px solid var(--d-line);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--d-soft);
  min-height: 64px;
  min-width: 0;
  transition: border-color 0.15s, background 0.15s;
}
.d-ind:hover { border-color: var(--d-brass-b); background: var(--d-card); }
.d-ind-name { font-weight: 600; font-size: 14px; line-height: 1.25; flex: 1; min-width: 0; }
.d-ind-go { color: var(--d-muted); opacity: 0.6; width: 14px; height: 14px; }
.d-ind:hover .d-ind-go { color: var(--d-brass-text); opacity: 1; }
.d-groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
.d-group { overflow: hidden; display: flex; flex-direction: column; }
.d-group-head {
  padding: 11px 18px;
  border-bottom: 1px solid var(--d-line);
  background: var(--d-soft);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}
.d-group-head h3 { font-size: 16.5px; font-weight: 600; letter-spacing: -0.01em; }
.d-group-head span { font-size: 13.5px; color: var(--d-muted); white-space: nowrap; }
.d-group-body { padding: 6px 18px 8px; display: flex; flex-direction: column; flex: 1; }
.d-mod { display: flex; gap: 12px; align-items: center; padding: 6px 0; }
.d-mod-txt { min-width: 0; }
.d-mod-name { font-weight: 600; font-size: 15px; line-height: 1.25; }
.d-mod-sub { font-size: 13.5px; line-height: 1.3; color: var(--d-muted); }
.d-promo {
  margin-top: auto;
  border: 1px solid var(--d-tint-b);
  background: var(--d-tint2);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--d-ink);
}
.d-promo:hover { background: var(--d-tint); }
.d-promo .brand-badge { width: 30px; height: 30px; }
.d-promo-txt { font-size: 14.5px; line-height: 1.35; flex: 1; }
.d-promo > .d-ic { color: var(--d-brass-text); }

/* Page 3: Ask ISABI */
.d-ask-lead { margin-bottom: 18px; }
.d-feats { display: flex; flex-direction: column; gap: 8px; }
.d-feat { padding: 10px 14px; display: flex; gap: 14px; align-items: center; border-radius: 12px; }
.d-feat-name { font-weight: 600; line-height: 1.3; }
.d-feat-sub { font-size: 14px; line-height: 1.35; color: var(--d-muted); }
.ai-console.d-console {
  border: 1px solid var(--d-line);
  border-radius: 14px;
  box-shadow: var(--d-shadow);
  height: min(560px, calc(100dvh - var(--hdr-h) - 56px));
  min-height: 420px;
  font-size: 15px;
  line-height: 1.5;
}
.d-console .ai-console-hdr { padding: 12px 18px; flex-wrap: wrap; }
.d-console .ai-console-title b { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
.d-console .ai-console-title small { font-size: 13.5px; }
.d-console-chips { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.d-chip-live, .d-chip-lang {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
}
.d-chip-live { border: 1px solid var(--d-gr-line); background: var(--d-gr-bg); color: var(--d-gr-fg); }
.d-chip-lang { border: 1px solid var(--d-line2); background: var(--d-card); color: var(--d-ink); }
.d-console .ai-scope-bar { padding: 6px 18px; font-size: 13px; }
.d-console .ai-reset-btn { min-height: 28px; padding: 0 10px; border-radius: 6px; font-size: 12.5px; }
.d-console .ai-prompt-pills {
  display: flex;
  gap: 8px;
  padding: 10px 18px;
  overflow-x: auto;
  scrollbar-width: none;
}
.d-console .ai-prompt-pills::-webkit-scrollbar { display: none; }
.d-console .ai-pill-btn {
  flex: none;
  max-width: 300px;
  min-height: 40px;
  align-items: center;
  border-radius: 999px;
  padding: 0 14px;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
}
.d-console .ai-pill-txt { overflow: hidden; text-overflow: ellipsis; }
.d-console .ai-pill-btn.active { border-color: var(--d-brass-b); }
.d-console .ai-thread { max-height: none; min-height: 0; padding: 14px 18px; font-size: 14.5px; }
.d-console .ai-console-ftr { padding: 10px 14px; }
.d-console .ai-composer-row { gap: 8px; }
.d-console .ai-tool-btn { width: 44px; height: 44px; flex-basis: 44px; border-radius: 10px; border-color: transparent; background: transparent; }
.d-console .ai-tool-btn:hover { background: var(--d-hover); border-color: transparent; }
.d-console .ai-tool-btn svg { width: 20px; height: 20px; stroke-width: 1.8; }
.d-console #ai-inline-input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  border: 1px solid var(--d-line2);
  border-radius: 10px;
  background: var(--d-card);
  color: var(--d-ink);
  font-size: 16px;
  padding: 0 12px;
}
.d-console .ai-console-ftr .btn-brass, .ai-drawer-ftr .btn-brass, .cfg-sum-acts .btn-brass, .ind-detail-acts .btn-brass, .app-spot-actions .btn-brass {
  background: var(--d-brass);
  border-color: var(--d-brass-b);
  color: var(--d-brass-ink);
  box-shadow: none;
}
.d-console .ai-console-ftr .btn-brass { min-height: 44px; padding: 0 18px; border-radius: 10px; font-size: 15px; }

/* Page 4: implementation */
.d-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; margin-top: 30px; }
.d-step { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.d-step-top { display: flex; align-items: center; gap: 10px; }
.d-step-n {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: var(--d-brass);
  color: var(--d-brass-ink);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.d-step-days { font-size: 14px; font-weight: 600; color: var(--d-brass-text); white-space: nowrap; }
.d-step-line { flex: 1; height: 2px; background: var(--d-tint-b); opacity: 0.6; }
.d-step-card { padding: 20px; display: flex; flex-direction: column; gap: 10px; flex: 1; background: var(--d-soft); }
.d-step-card h3 { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
.d-step-card p { margin: 0; font-size: 15px; color: var(--d-muted); flex: 1; }
.d-step-out { display: flex; gap: 8px; font-size: 14.5px; font-weight: 600; border-top: 1px solid var(--d-line); padding-top: 12px; }
.d-step-out .d-ic { margin-top: 2px; }

/* Page 5: comparison */
.d-cmp { overflow: hidden; }
.d-row {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.6fr) minmax(0, 1.35fr) minmax(0, 1.35fr);
  border-top: 1px solid var(--d-line3);
}
.d-row > div { padding: 13px 16px; font-size: 15px; display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
.d-row > div > .d-ic { margin-top: 2px; }
.d-rowhead { border-top: 0; background: var(--d-soft); font-weight: 600; }
.d-rowhead > div { font-size: 14px; color: var(--d-muted); align-items: center; }
.d-rowhead .d-cmp-a { background: var(--d-tint); color: var(--d-ink); font-size: 15px; }
.d-rowhead .brand-badge { width: 20px; height: 20px; }
.d-cmp-k { align-items: center !important; font-weight: 600; }
.d-row .d-cmp-a { background: var(--d-tint2); font-weight: 500; }
.d-row .d-cmp-b, .d-row .d-cmp-c { color: var(--d-muted); }

/* Page 6: pricing */
.d-pills { display: flex; gap: 8px; flex-wrap: wrap; }
.d-pill {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--d-line2);
  background: var(--d-card);
  color: var(--d-ink2);
  font: 600 14.5px/1 "Instrument Sans", "Segoe UI", system-ui, sans-serif;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.d-pill:hover { border-color: var(--d-brass-b); }
.d-pill.active { background: var(--d-tint); border-color: var(--d-brass-b); color: var(--d-ink); }
.d-tiers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; align-items: stretch; }
.d-tier { padding: 20px 22px; display: flex; flex-direction: column; gap: 12px; background: var(--d-soft); min-width: 0; }
.d-tier-on { border-color: var(--d-brass-b); box-shadow: 0 0 0 1px var(--d-brass-b); background: var(--d-card); }
.d-tier-head { display: flex; gap: 14px; align-items: center; }
.d-tier-tag { font-size: 13.5px; font-weight: 600; color: var(--d-brass-text); }
.d-tier-head h3 { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
.d-tier-desc { margin: 0; font-size: 14.5px; color: var(--d-muted); }
.d-tier-price { border-top: 1px solid var(--d-line); border-bottom: 1px solid var(--d-line); padding: 10px 0; }
.d-tier-setup { font-size: 32px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.1; }
.d-tier-setup small { font-size: 14.5px; font-weight: 500; color: var(--d-muted); letter-spacing: 0; }
.d-tier-seat { font-size: 15px; font-weight: 600; margin-top: 4px; }
.d-tier-feats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; font-size: 14.5px; flex: 1; }
.d-tier-feats li { display: flex; gap: 10px; }
.d-tier-feats .d-ic { margin-top: 2px; }
.d-trust { display: flex; flex-wrap: wrap; gap: 8px 28px; justify-content: center; margin-top: 16px; font-size: 14.5px; font-weight: 500; }
.d-trust > span { display: inline-flex; align-items: center; gap: 8px; }
.configurator-card.d-builder { border-radius: 14px; border-color: var(--d-line); box-shadow: none; background: var(--d-soft); }
.d-builder .cfg-sum-kicker { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--d-brass-text); margin-bottom: 6px; }
.d-builder .cfg-sum-title { font-size: 20px; margin-bottom: 4px; }
.d-builder .cfg-sum-scale { font-size: 13px; color: var(--d-muted); }
.d-builder .cfg-sum-weeks { display: flex; justify-content: space-between; font-size: 13px; color: var(--d-muted); margin-bottom: 12px; }
.d-builder .cfg-sum-weeks strong { color: var(--d-ink); }
.d-builder .cfg-sum-note { font-size: 12.5px; color: var(--d-muted); margin: 0 0 14px; }
.d-builder .cfg-sum-acts { display: flex; flex-direction: column; gap: 10px; }
.d-builder .cfg-sum-acts .btn { width: 100%; min-height: 44px; border-radius: 10px; }
.d-builder .cfg-sum-acts .btn-wa { background: var(--d-card); color: var(--d-ink); border-color: var(--d-gr-line); font-weight: 600; }
.d-builder .cfg-sum-acts .btn-wa .d-ic-wa { color: var(--d-wa); }

/* Page 7: in practice */
.d-logos {
  margin: 30px auto 0;
  max-width: 1080px;
  padding: 26px 36px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-around;
  gap: 24px 40px;
  background: var(--d-logo-card);
}
.d-logo {
  width: auto;
  max-width: 170px;
  object-fit: contain;
  filter: grayscale(1) sepia(0.28) contrast(0.82) brightness(1.04);
  opacity: 0.66;
  transition: filter 0.25s ease, opacity 0.25s ease;
}
.d-logo:hover, .d-logo.d-logo-lit { filter: none; opacity: 1; }
.d-logo-sq { height: 78px; }
.d-logo-wide { height: 54px; }
.d-logo-mid { height: 64px; }
.d-logos-note { margin: 14px auto 0; max-width: 820px; text-align: center; font-size: 14px; color: var(--d-muted); }
.d-proof {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 22px 28px;
  margin-top: 30px;
  padding-top: 28px;
  border-top: 1px solid var(--d-line);
}
.d-proof-item { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
.d-proof-name { font-weight: 600; line-height: 1.3; }
.d-proof-text { font-size: 14.5px; line-height: 1.45; margin-top: 3px; color: var(--d-muted); }

/* Page 8: contact */
.d-contact-lead { margin-bottom: 22px; }
.d-contact { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: stretch; }
.d-brief { padding: 22px; display: flex; flex-direction: column; gap: 14px; background: var(--d-soft); }
.d-brief form { display: flex; flex-direction: column; gap: 14px; flex: 1; }
.d-direct { padding: 22px; display: flex; flex-direction: column; gap: 14px; }
.d-card-head { display: flex; align-items: center; gap: 12px; }
.d-card-head h3 { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
.d-card-sub { font-size: 13.5px; color: var(--d-muted); }
.d-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.d-field { display: flex; flex-direction: column; gap: 6px; font-size: 14px; font-weight: 600; min-width: 0; }
.d-field input, .d-field select, .d-field textarea {
  font: 400 16px/1.4 "Instrument Sans", "Segoe UI", system-ui, sans-serif;
  color: var(--d-ink);
  background: var(--d-soft);
  border: 1px solid var(--d-line2);
  border-radius: 10px;
  padding: 11px 12px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.d-field select { text-overflow: ellipsis; }
.d-field textarea { resize: vertical; }
.d-field input::placeholder, .d-field textarea::placeholder { color: color-mix(in srgb, var(--d-muted) 78%, transparent); }
.d-send { display: flex; gap: 10px; flex-wrap: wrap; margin-top: auto; }
.d-send .d-btn { flex: 1; }
.d-channels { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.d-channel {
  border: 1px solid var(--d-line);
  background: var(--d-soft);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  transition: border-color 0.15s;
}
.d-channel:hover { border-color: var(--d-brass-b); }
.d-channel-wa { border-color: var(--d-gr-line); background: var(--d-gr-soft); }
.d-channel > span:last-child { min-width: 0; }
.d-channel-l { font-size: 13px; display: block; color: var(--d-muted); }
.d-channel-v { font-weight: 700; display: block; }
.d-channel-mail { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
.d-next { border-top: 1px solid var(--d-line); padding-top: 14px; }
.d-next .d-eyebrow { margin-bottom: 10px; }
.d-next ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; font-size: 14.5px; }
.d-next li { display: flex; gap: 12px; }
.d-next-n {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--d-tint);
  color: var(--d-brass-text);
  font-weight: 700;
  font-size: 13.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

/* ---------- More pages (Live Demo, Industry Blueprints, FAQ) ---------- */
.d-sheet-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
.d-sheet-top .eyebrow { margin-bottom: 0 !important; display: inline-flex; align-items: center; gap: 6px; }
.sec.d-sheet { border-bottom: 1px solid var(--d-line); }
.sec.d-sheet h2 { font-weight: 700; letter-spacing: -0.02em; }
.sec.d-sheet h2:focus { outline: none; }
#faq.d-sheet .faq-panel { margin-top: 6px; }
/* The widgets on these pages were drawn small to fit one screen; scale them up on desktop as far as the screen height allows. */
@media (min-width: 1081px) {
  .sec.d-sheet > .wrap { --sheet-zoom: 1.05; zoom: var(--sheet-zoom); max-width: calc(min(95vw, 1720px) / var(--sheet-zoom)); }
  #faq.d-sheet > .wrap { --sheet-zoom: 1.2; max-width: calc(min(95vw, 1500px) / var(--sheet-zoom)); }
}
@media (min-width: 1081px) and (min-height: 700px) {
  .sec.d-sheet > .wrap { --sheet-zoom: 1.06; }
  #faq.d-sheet > .wrap { --sheet-zoom: 1.25; }
}
@media (min-width: 1081px) and (min-height: 765px) {
  .sec.d-sheet > .wrap { --sheet-zoom: 1.1; }
}
@media (min-width: 1081px) and (min-height: 940px) {
  .sec.d-sheet > .wrap { --sheet-zoom: 1.16; }
  #faq.d-sheet > .wrap { --sheet-zoom: 1.3; }
}

/* ---------- Footer ---------- */
.d-foot { padding: 22px 0 26px; font-size: 14px; line-height: 1.5; color: var(--d-muted); background: var(--d-bg); }
.d-foot a:hover span, .d-foot-links a:hover { text-decoration: underline; }
.d-foot-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--d-line);
}
.d-foot-brand { display: flex; align-items: center; gap: 12px; }
.d-foot-brand .brand-badge { width: 34px; height: 34px; }
.d-foot-brand b { display: block; font-family: "Archivo", "Segoe UI", system-ui, sans-serif; font-size: 16px; color: var(--d-ink); letter-spacing: -0.01em; }
.d-foot-brand span { font-size: 13.5px; }
.d-foot-more { display: flex; flex-wrap: wrap; gap: 8px; }
.d-foot-more a {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--d-line2);
  border-radius: 999px;
  background: var(--d-card);
  color: var(--d-ink);
  font-weight: 600;
}
.d-foot-more a:hover { border-color: var(--d-brass-b); }
.d-foot-more a:hover span { text-decoration: none; }
.d-foot-contact { display: flex; flex-wrap: wrap; gap: 6px 20px; }
.d-foot-contact a { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; color: var(--d-ink); font-weight: 600; }
.d-foot-contact .d-ic-wa { color: var(--d-wa); }
.d-foot-bottom { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 32px; padding-top: 14px; }
.d-foot-links { display: flex; flex-wrap: wrap; gap: 4px 20px; }
.d-foot-links a { min-height: 32px; display: inline-flex; align-items: center; }

/* Buttons kept from the earlier widgets take the same flat brass and quiet WhatsApp treatment */
.btn { border-radius: 8px; }
.btn-brass, .btn-brass:hover {
  background: var(--d-brass);
  border-color: var(--d-brass-b);
  color: var(--d-brass-ink);
  box-shadow: none;
}
.btn-brass:hover { background: var(--d-brass-b); }
.btn-wa, :root[data-theme="light"] .hero-cta-row .btn-wa {
  background: var(--d-card);
  color: var(--d-ink);
  border: 1px solid var(--d-gr-line);
  font-weight: 600;
  box-shadow: none;
}
.btn-wa:hover { filter: none; border-color: var(--d-wa); background: var(--d-gr-soft); }
.btn-wa .ic-wa, .btn-wa .d-ic-wa { color: var(--d-wa); }

/* Drawer and toast keep their structure; align the shape language */
.ai-drawer { font-size: 15px; }
.toast { border-radius: 10px; }

/* ---------- Short desktop screens (for example 1366 x 768): tighten so each page fits ---------- */
@media (min-width: 1081px) and (max-height: 840px) {
  .d-page { padding: 16px 0; }
  .d-h2 { font-size: 33px; margin: 6px 0 8px; }
  .d-lead { font-size: 16.5px; }
  .d-steps { margin-top: 24px; }
  .d-row > div { padding: 11px 16px; }
  .d-brief, .d-direct { padding: 18px 20px; gap: 12px; }
  .d-brief form { gap: 12px; }
  .d-field input, .d-field select, .d-field textarea { padding: 9px 12px; }
  .d-hero { padding: 8px 0 10px; }
  .d-chip { padding: 4px 12px; font-size: 13px; }
  .d-h1 { font-size: 50px; margin: 10px auto 8px; }
  .d-hero-lead { font-size: 17px; line-height: 1.5; margin-bottom: 12px; max-width: 760px; }
  .d-hero .d-btn { min-height: 46px; }
  .d-preview { margin-top: 16px; }
  .d-prev-top { padding: 7px 18px; }
  .d-prev-tabs { padding: 8px 10px; }
  .d-tab { min-height: 42px; font-size: 14.5px; }
  .d-prev-stage { padding: 12px 18px 6px; gap: 10px; }
  .d-kpi { padding: 8px 14px; }
  .d-kpi-v { font-size: 24px; }
  .d-facts { margin-top: 14px; }
  .d-head-split { margin-bottom: 12px; }
  .d-inds { margin-bottom: 10px; gap: 10px; }
  .d-ind { min-height: 54px; padding: 6px 10px; }
  .d-group-head { padding: 8px 16px; }
  .d-group-body { padding: 3px 16px 6px; }
  .d-mod { padding: 4px 0; }
  .d-mod-name { font-size: 14.5px; }
  .d-mod-sub { font-size: 13px; }
  .d-promo { padding: 10px 12px; }
  .d-ask-lead { margin-bottom: 12px; }
  .d-feat { padding: 8px 14px; }
  .d-tier { padding: 14px 20px; gap: 9px; }
  .d-tier-setup { font-size: 28px; }
  .d-tier-price { padding: 7px 0; }
  .d-tier-feats { gap: 5px; font-size: 14px; }
  .d-tier .d-btn { min-height: 44px; }
  .d-trust { margin-top: 10px; }
}

/* Shorter still (a 768 px screen with browser bars leaves about 670 px) */
@media (min-width: 1081px) and (max-height: 730px) {
  .d-page { padding: 12px 0; }
  .d-h2 { font-size: 30px; margin: 4px 0 6px; }
  .d-lead { font-size: 16px; }
  .d-hero { padding: 6px 0 8px; }
  .d-chip { padding: 3px 12px; }
  .d-h1 { font-size: 44px; margin: 6px auto 6px; }
  .d-hero-lead { font-size: 16.5px; line-height: 1.4; margin-bottom: 10px; max-width: 1120px; }
  .d-hero .d-btn { min-height: 44px; }
  .d-preview { margin-top: 12px; }
  .d-prev-top { padding: 6px 18px; }
  .d-prev-tabs { padding: 6px 10px; }
  .d-tab { min-height: 38px; font-size: 14px; }
  .d-prev-stage { padding: 10px 18px 4px; gap: 8px; }
  .d-kpi { padding: 6px 14px; }
  .d-kpi-v { font-size: 22px; }
  .d-bar-row { padding: 1px 8px; }
  .d-prev-foot .d-textlink { min-height: 36px; }
  .d-facts { margin-top: 10px; }
  .d-fact-b { font-size: 13.5px; }
  .d-head-split { margin-bottom: 10px; }
  .d-inds { margin-bottom: 8px; gap: 8px; }
  .d-ind { min-height: 48px; padding: 5px 10px; }
  .d-group-head { padding: 6px 16px; }
  .d-mod { padding: 3px 0; }
  .d-tile-36 { width: 32px; height: 32px; }
  .d-promo { padding: 8px 12px; }
  .d-feat { padding: 6px 14px; }
  .d-ask-lead { margin-bottom: 10px; }
  .ai-console.d-console { height: min(540px, calc(100dvh - var(--hdr-h) - 40px)); min-height: 400px; }
  .d-steps { margin-top: 16px; }
  .d-step-card { padding: 14px 16px; gap: 8px; }
  .d-step-card p { font-size: 14.5px; }
  .d-row > div { padding: 8px 16px; font-size: 14.5px; }
  .d-tier { padding: 12px 18px; gap: 7px; }
  .d-tier-desc { font-size: 14px; }
  .d-tier-setup { font-size: 26px; }
  .d-tier-price { padding: 6px 0; }
  .d-tier-feats { gap: 4px; font-size: 13.5px; }
  .d-tier .d-btn { min-height: 42px; }
  .d-trust { margin-top: 8px; font-size: 14px; }
  .d-logos { margin-top: 18px; padding: 18px 36px; }
  .d-logo-sq { height: 68px; }
  .d-logo-wide { height: 48px; }
  .d-logo-mid { height: 58px; }
  .d-proof { margin-top: 18px; padding-top: 18px; }
  .d-contact-lead { margin-bottom: 12px; }
  .d-brief, .d-direct { padding: 14px 18px; gap: 10px; }
  .d-brief form { gap: 10px; }
  .d-fields { gap: 10px; }
  .d-field { gap: 4px; }
  .d-field input, .d-field select, .d-field textarea { padding: 7px 12px; }
  .d-channel { padding: 8px 12px; }
  .d-next { padding-top: 10px; }
  .d-next ol { gap: 7px; font-size: 14px; }
}

/* ---------- Tall, wide desktop screens: give the pages more presence ---------- */
@media (min-width: 1500px) and (min-height: 840px) {
  .d-wrap, .d-hdr-in { max-width: 1320px; }
  .d-preview, .d-facts, .d-logos { max-width: 1140px; }
}
@media (min-width: 1700px) and (min-height: 980px) {
  .d-wrap, .d-hdr-in { max-width: 1440px; }
  .d-preview, .d-facts, .d-logos { max-width: 1240px; }
  .d-h1 { font-size: 64px; }
  .d-hero-lead { font-size: 20px; max-width: 800px; }
  .d-h2 { font-size: 42px; }
  .d-lead { font-size: 18.5px; max-width: 720px; }
  .d-page { padding: 40px 0; }
  .d-preview { margin-top: 28px; }
  .d-facts { margin-top: 24px; }
  .d-tab { min-height: 52px; font-size: 16px; }
  .d-prev-stage { padding: 22px 26px; gap: 16px; }
  .d-kpi { padding: 14px 18px; }
  .d-kpi-v { font-size: 30px; }
  .d-bar-row { padding: 6px 8px; }
  .d-mod { padding: 9px 0; }
  .d-mod-name { font-size: 16px; }
  .d-mod-sub { font-size: 14.5px; }
  .d-inds { margin-bottom: 22px; }
  .d-ind { min-height: 72px; }
  .d-feat { padding: 14px 18px; }
  .d-feat-sub { font-size: 15px; }
  .ai-console.d-console { height: min(660px, calc(100dvh - var(--hdr-h) - 120px)); }
  .d-step-card { padding: 26px; gap: 14px; }
  .d-step-card h3 { font-size: 21px; }
  .d-step-card p { font-size: 16px; }
  .d-row > div { padding: 17px 20px; font-size: 16px; }
  .d-tier { padding: 28px; gap: 16px; }
  .d-tier-feats { font-size: 15.5px; gap: 10px; }
  .d-tier-desc { font-size: 15.5px; }
  .d-logos { padding: 34px 44px; margin-top: 40px; }
  .d-logo-sq { height: 92px; }
  .d-logo-wide { height: 64px; }
  .d-logo-mid { height: 76px; }
  .d-proof { margin-top: 40px; padding-top: 36px; }
  .d-proof-text { font-size: 15.5px; }
  .d-brief, .d-direct { padding: 28px; gap: 18px; }
  .d-next ol { font-size: 15.5px; gap: 14px; }
}

/* ---------- Narrower desktops and tablets ---------- */
@media (max-width: 1240px) {
  .d-hdr-cta { display: none; }
  .d-nav a { padding: 0 8px; }
}
@media (max-width: 1080px) {
  .d-page { min-height: 0; padding: 56px 0; }
  .d-hero { padding: 28px 0 40px; }
  .d-inds { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .d-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .d-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .d-tiers { grid-template-columns: minmax(0, 1fr); max-width: 640px; margin: 0 auto; }
  .d-proof { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .d-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .d-two { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .d-contact { grid-template-columns: minmax(0, 1fr); }
  .ai-console.d-console { height: 560px; }
}
@media (max-width: 900px) {
  .d-nav { display: none !important; }
  .d-hdr-in { justify-content: space-between; }
  .d-strip:not([hidden]) { display: flex; }
  .d-h1 { font-size: 38px; }
  .d-h2 { font-size: 28px; }
  .d-row { grid-template-columns: minmax(0, 1fr); }
  .d-row > div { padding: 8px 16px; }
  .d-row > .d-cmp-k { padding-top: 14px; }
  .d-rowhead { display: none; }
  .d-row > [data-col-lbl] { flex-wrap: wrap; row-gap: 2px; }
  .d-row > [data-col-lbl]::before { content: attr(data-col-lbl); flex-basis: 100%; font-size: 12.5px; font-weight: 600; letter-spacing: 0.02em; color: var(--d-muted); }
  .d-row > [data-col-lbl] > span { flex: 1; min-width: 0; }
  .d-prev-tabs { max-width: none; flex-direction: row; overflow-x: auto; border-inline-end: 0; border-bottom: 1px solid var(--d-line); scrollbar-width: none; }
  .d-prev-tabs::-webkit-scrollbar { display: none; }
  .d-tab { width: auto; flex: none; white-space: nowrap; }
}
@media (max-width: 720px) {
  :root, :root[data-theme="light"], :root[data-theme="dark"] { --hdr-h: 56px; }
  .d-wrap, .d-hdr-in { padding-left: 16px; padding-right: 16px; }
  .d-hdr-in { gap: 6px; }
  .d-brand { gap: 6px; }
  .d-brand .brand-badge { width: 28px; height: 28px; }
  .d-brand .brand-wordmark { height: 24px; }
  .d-hdr-acts { gap: 6px; }
  .d-lang .lang-pill { min-width: 36px; padding: 0 7px; font-size: 13px; }
  .d-signin span { display: none; }
  .d-signin { width: 44px; justify-content: center; border: 1px solid var(--d-line2); border-radius: 10px; background: var(--d-card); padding: 0; }
  .d-page { padding: 44px 0; }
  .d-hero { padding: 22px 0 36px; }
  .d-h1 { font-size: 33px; }
  .d-hero-lead { font-size: 16.5px; }
  .d-cta-row .d-btn-p, .d-cta-row .d-btn-s { flex: 1 1 100%; }
  .d-prev-hint { display: none; }
  .d-kpis { grid-template-columns: minmax(0, 1fr); }
  .d-bar-row { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) auto; gap: 10px; }
  .d-bar-name, .d-bar-amt { font-size: 13.5px; }
  .d-bar-amt { min-width: 0; }
  .d-facts, .d-proof, .d-groups, .d-steps, .d-fields, .d-channels { grid-template-columns: minmax(0, 1fr); }
  .d-inds { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .d-head-split { align-items: flex-start; flex-direction: column; }
  .d-logos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); justify-items: center; padding: 22px 18px; gap: 22px 14px; }
  .d-logo-sq { height: 62px; }
  .d-logo-wide { height: 44px; }
  .d-logo-mid { height: 52px; }
  .d-logo { max-width: 100%; }
  .ai-console.d-console { height: 600px; }
  .d-console .ai-console-hdr { padding: 10px 14px; }
  .d-console .ai-thread { padding: 12px 14px; }
  .d-console .ai-prompt-pills, .d-console .ai-scope-bar { padding-left: 14px; padding-right: 14px; }
  .d-tier { padding: 18px; }
  .d-brief, .d-direct { padding: 18px 16px; }
  .d-foot-top, .d-foot-bottom { flex-direction: column; align-items: flex-start; }
  .d-field input, .d-field select, .d-field textarea, .d-console #ai-inline-input { font-size: 16px !important; }
}
/* Six logos need about 930px for one row. Below that they sit three to a row (two even rows) at every width,
   never five and one. The phone block above keeps its own smaller sizes. */
@media (max-width: 1040px) {
  .d-logos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); justify-items: center; }
  .d-logo { max-width: 100%; }
}
@media (hover: none) {
  .d-logo { filter: grayscale(1) sepia(0.28) contrast(0.82) brightness(1.04); opacity: 0.66; }
  .d-logo.d-logo-lit { filter: none; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .d-logo, .d-btn, .d-nav a { transition: none; }
}
@media print {
  .d-header, .d-foot-more, .d-strip { display: none !important; }
  .d-page { min-height: 0; break-inside: avoid; }
}
"""
