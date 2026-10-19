# CSS styles for ISABI Systems PWA (Rev 10 "Ledger" Design System)

CSS = r"""
:root {
  --bg: #0B1730;
  --bg-alt: #0E1D3A;
  --surface: #132342;
  --surface-2: #182C52;
  --surface-elev: #1C325C;
  --ink: #F4F2EE;
  --muted: #9FB0C7;
  --muted-2: #768AA6;
  --line: #24385E;
  --line-strong: #324B7A;
  --plate: #081124;
  --brass: #D9A54A;
  --brass-strong: #E5B764;
  --brass-ink: #0B1730;
  --brass-tint: rgba(217, 165, 74, 0.12);
  --brass-border: rgba(217, 165, 74, 0.38);
  --steel: #4F8FD6;
  --steel-tint: rgba(79, 143, 214, 0.14);
  --good: #3DB36A;
  --good-bg: rgba(61, 179, 106, 0.14);
  --warn: #F09045;
  --warn-bg: rgba(240, 144, 69, 0.14);
  --crit: #E25A61;
  --crit-bg: rgba(226, 90, 97, 0.15);
  --wa: #25D366;
  --wa-ink: #071F10;
  --shadow-sm: 0 4px 16px rgba(4, 10, 22, 0.28);
  --shadow-md: 0 14px 38px rgba(4, 10, 22, 0.42);
  --shadow-lg: 0 24px 64px rgba(3, 8, 18, 0.58);
  --hdr-h: 70px;

  /* Dashboard Sandbox Tokens (Dark default) */
  --m-bg: #0E1A2E;
  --m-surface: #152238;
  --m-ink: #E9ECF2;
  --m-muted: #9AA7BA;
  --m-line: #24344F;
  --m-rail: #081223;
  --m-brass: #D9A54A;
  --m-steel: #4F8FD6;
  --s1: #4F8FD6;
  --s2: #D9A54A;
  --s3: #25A38D;
  --m-chip: #1E2E48;
  --m-grid: #22324D;
}

:root[data-theme="light"] {
  --bg: #F4F2EE;
  --bg-alt: #EAE7E0;
  --surface: #FFFFFF;
  --surface-2: #F8F7F4;
  --surface-elev: #FFFFFF;
  --ink: #0F1E38;
  --muted: #516178;
  --muted-2: #6E7E94;
  --line: #D8DCE3;
  --line-strong: #BFC6D2;
  --plate: #0B1730;
  --brass: #C0892F;
  --brass-strong: #A67320;
  --brass-ink: #0B1730;
  --brass-tint: rgba(192, 137, 47, 0.10);
  --brass-border: rgba(192, 137, 47, 0.40);
  --steel: #2A6DB5;
  --steel-tint: rgba(42, 109, 181, 0.10);
  --good: #1C8C46;
  --good-bg: #E4F3E9;
  --warn: #E07A1F;
  --warn-bg: #FCEBDD;
  --crit: #C8333B;
  --crit-bg: #F9E1E2;
  --shadow-sm: 0 2px 10px rgba(15, 30, 56, 0.06);
  --shadow-md: 0 12px 32px rgba(15, 30, 56, 0.09);
  --shadow-lg: 0 20px 52px rgba(15, 30, 56, 0.14);

  --m-bg: #EEEDE9;
  --m-surface: #FFFFFF;
  --m-ink: #0F1E38;
  --m-muted: #5C6B80;
  --m-line: #E1E4E9;
  --m-rail: #0B1730;
  --m-brass: #C0892F;
  --m-steel: #2A6DB5;
  --s1: #2A6DB5;
  --s2: #C48A2C;
  --s3: #1E9E8A;
  --m-chip: #EEF0F3;
  --m-grid: #E6E8EC;
}

.sandbox-wrap[data-sbox-theme="light"] {
  --m-bg: #EEEDE9;
  --m-surface: #FFFFFF;
  --m-ink: #0F1E38;
  --m-muted: #5C6B80;
  --m-line: #E1E4E9;
  --m-rail: #0B1730;
  --m-brass: #C0892F;
  --m-steel: #2A6DB5;
  --s1: #2A6DB5;
  --s2: #C48A2C;
  --s3: #1E9E8A;
  --m-chip: #EEF0F3;
  --m-grid: #E6E8EC;
  --good: #1C8C46;
  --good-bg: #E4F3E9;
  --warn: #E07A1F;
  --warn-bg: #FCEBDD;
  --crit: #C8333B;
  --crit-bg: #F9E1E2;
}

.sandbox-wrap[data-sbox-theme="dark"] {
  --m-bg: #0E1A2E;
  --m-surface: #152238;
  --m-ink: #E9ECF2;
  --m-muted: #9AA7BA;
  --m-line: #24344F;
  --m-rail: #081223;
  --m-brass: #D9A54A;
  --m-steel: #4F8FD6;
  --s1: #4F8FD6;
  --s2: #D9A54A;
  --s3: #25A38D;
  --m-chip: #1E2E48;
  --m-grid: #22324D;
  --good: #3DB36A;
  --good-bg: rgba(61, 179, 106, 0.16);
  --warn: #F09045;
  --warn-bg: rgba(240, 144, 69, 0.16);
  --crit: #E25A61;
  --crit-bg: rgba(226, 90, 97, 0.18);
}

*, *::before, *::after {
  box-sizing: border-box;
}

html {
  scroll-padding-top: calc(var(--hdr-h) - 2px);
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: "Instrument Sans", "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
  font-size: 15.5px;
  line-height: 1.6;
  overflow-x: clip;
  transition: background-color 0.2s ease, color 0.2s ease;
}

[hidden] {
  display: none !important;
}

h1, h2, h3, h4, .font-display {
  font-family: "Archivo", "Segoe UI", system-ui, sans-serif;
  font-stretch: 112%;
  letter-spacing: -0.015em;
  margin: 0;
  color: var(--ink);
}

a {
  color: inherit;
  text-decoration: none;
}

button, input, select, textarea {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.num, table, .kpi-val, .price-val, .calc-num {
  font-variant-numeric: tabular-nums;
}

.double-rule {
  border-top: 1px solid var(--ink);
  border-bottom: 3px double var(--brass);
}

.brass-rule-bottom {
  border-bottom: 3px double var(--brass);
}

.wrap {
  max-width: 1260px;
  margin: 0 auto;
  padding: 0 24px;
}

/* ---------- Top Header ---------- */
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line);
}

.hdr-inner {
  max-width: 1260px;
  height: var(--hdr-h);
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  flex-shrink: 0;
}

.brand-badge {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.brand-wordmark {
  height: 31px;
  width: auto;
  display: block;
}

.main-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.main-nav a {
  padding: 7px 10px;
  font-size: 13.5px;
  font-weight: 500;
  color: var(--muted);
  border-radius: 6px;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
  white-space: nowrap;
}

.main-nav a:hover {
  color: var(--ink);
  background: rgba(255, 255, 255, 0.04);
}

:root[data-theme="light"] .main-nav a:hover {
  background: rgba(15, 30, 56, 0.05);
}

.main-nav a.active {
  color: var(--ink);
  background: var(--brass-tint);
  border-bottom-color: var(--brass);
  font-weight: 700;
}

.hdr-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Mobile Horizontal Section Strip inside Header */
.mobile-sec-nav {
  display: none;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg-alt) 92%, transparent);
  padding: 0 12px;
  gap: 4px;
}

.mobile-sec-nav::-webkit-scrollbar {
  display: none;
}

.mobile-sec-nav a {
  flex-shrink: 0;
  padding: 8px 10px 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
}

.mobile-sec-nav a.active {
  color: var(--brass);
  border-bottom-color: var(--brass);
  font-weight: 700;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 15px;
  border-radius: 6px;
  font-size: 13.5px;
  font-weight: 600;
  border: 1px solid transparent;
  transition: transform 0.12s, background 0.15s, border-color 0.15s, box-shadow 0.15s;
  white-space: nowrap;
}

.btn:active {
  transform: translateY(1px);
}

.btn-brass {
  background: var(--brass);
  color: #0B1730;
  border-color: var(--brass);
  box-shadow: 0 2px 12px rgba(217, 165, 74, 0.22);
}

.btn-brass:hover {
  background: var(--brass-strong);
  border-color: var(--brass-strong);
}

.btn-outline {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--line-strong);
}

.btn-outline:hover {
  border-color: var(--brass);
  background: var(--surface-2);
}

.btn-ghost {
  background: transparent;
  color: var(--muted);
  border-color: var(--line);
  padding: 7px 10px;
  font-size: 12.5px;
}

.btn-ghost:hover {
  color: var(--ink);
  border-color: var(--brass);
}

.btn-wa {
  background: var(--wa);
  color: var(--wa-ink);
  border-color: var(--wa);
  font-weight: 700;
}

.btn-wa:hover {
  filter: brightness(1.06);
}

.ask-isabi-trigger {
  background: var(--plate);
  color: #F4F2EE;
  border: 1px solid var(--brass);
  padding: 7px 12px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
  font-size: 13px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
}

:root[data-theme="light"] .ask-isabi-trigger {
  background: #0B1730;
  color: #F4F2EE;
  border-color: #C0892F;
}

.ask-isabi-trigger:hover {
  background: #14264C;
  border-color: var(--brass-strong);
}

.ask-isabi-trigger svg {
  height: 15px;
  width: auto;
  flex-shrink: 0;
}

/* ---------- Hero Section ---------- */
.hero-section {
  position: relative;
  padding: 56px 0 48px;
  border-bottom: 1px solid var(--line);
  background:
    radial-gradient(900px 420px at 85% 10%, var(--brass-tint), transparent 70%),
    radial-gradient(800px 400px at 10% 30%, var(--steel-tint), transparent 70%),
    var(--bg);
}

.hero-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 40px;
  align-items: center;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--brass);
  background: var(--brass-tint);
  border: 1px solid var(--brass-border);
  padding: 5px 11px;
  border-radius: 4px;
  margin-bottom: 14px;
}

.hero-title {
  font-size: clamp(32px, 4.2vw, 52px);
  font-weight: 800;
  line-height: 1.06;
  margin-bottom: 16px;
}

.hero-title span.brass-text {
  color: var(--brass);
}

.hero-lead {
  font-size: 17px;
  color: var(--muted);
  max-width: 62ch;
  margin: 0 0 24px;
  line-height: 1.6;
}

.hero-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 28px;
}

.hero-cta-row .btn {
  padding: 12px 20px;
  font-size: 14.5px;
}

.hero-trust-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.trust-item b {
  display: block;
  font-family: "Archivo", sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 2px;
}

.trust-item span {
  font-size: 13px;
  color: var(--muted);
  display: block;
  line-height: 1.4;
}

/* Right Hero Executive Ledger Card */
.hero-ledger-card {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.hlc-top {
  background: #081223;
  color: #F4F2EE;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.hlc-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.hlc-brand span {
  font-size: 11.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(244, 242, 238, 0.75);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hlc-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: #3DB36A;
  background: rgba(61, 179, 106, 0.14);
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
  flex-shrink: 0;
}

.hlc-status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3DB36A;
  display: inline-block;
}

.hlc-body {
  padding: 18px;
}

.hlc-kpis {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.hlc-kpi {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 11px 13px;
}

.hlc-kpi small {
  display: block;
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 3px;
}

.hlc-kpi strong {
  display: block;
  font-family: "Archivo", sans-serif;
  font-size: 21px;
  font-weight: 800;
  color: var(--ink);
}

.hlc-kpi span {
  font-size: 11.5px;
  color: var(--good);
  font-weight: 600;
}

.hlc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.8px;
  margin-bottom: 14px;
}

.hlc-table th {
  text-align: left;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  padding: 6px 7px;
  border-bottom: 1px solid var(--line);
}

.hlc-table td {
  padding: 7px;
  border-bottom: 1px solid var(--line);
}

.hlc-table td.r, .hlc-table th.r {
  text-align: right;
  white-space: nowrap;
}

.hlc-table tr.tot td {
  font-weight: 700;
  color: var(--ink);
  border-top: 1px solid var(--ink);
  border-bottom: 3px double var(--brass);
  padding-top: 9px;
  padding-bottom: 9px;
}

.hlc-ai-strip {
  background: var(--brass-tint);
  border: 1px solid var(--brass-border);
  border-radius: 6px;
  padding: 10px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
}

.hlc-ai-strip b {
  color: var(--brass);
}

/* ---------- Proof Metrics Band ---------- */
.metrics-band {
  background: var(--surface);
  border-bottom: 3px double var(--brass);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-left: 1px solid var(--line);
}

.metric-cell {
  padding: 20px 20px;
  border-right: 1px solid var(--line);
}

.metric-cell .m-val {
  font-family: "Archivo", sans-serif;
  font-size: 30px;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.1;
  margin-bottom: 5px;
}

.metric-cell .m-val span {
  color: var(--brass);
}

.metric-cell .m-lbl {
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);
  margin-bottom: 3px;
}

.metric-cell .m-sub {
  font-size: 12.8px;
  color: var(--muted);
  line-height: 1.4;
}

/* ---------- Generic Section Layout ---------- */
.sec {
  padding: 58px 0 64px;
  border-bottom: 1px solid var(--line);
  scroll-margin-top: calc(var(--hdr-h) - 1px);
}

.sec-alt {
  background: var(--bg-alt);
}

.sec-head {
  max-width: 780px;
  margin-bottom: 34px;
}

.sec-head h2 {
  font-size: clamp(25px, 3.1vw, 36px);
  font-weight: 800;
  line-height: 1.12;
  margin-bottom: 12px;
}

.sec-head p {
  font-size: 16px;
  color: var(--muted);
  margin: 0;
  line-height: 1.58;
}

/* Mobile-only Segmented Switchers (Hidden on Desktop) */
.mob-seg-bar {
  display: none;
  gap: 6px;
  margin-bottom: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 4px;
  border-radius: 8px;
}

.mob-seg-btn {
  flex: 1;
  padding: 8px 6px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}

.mob-seg-btn.active {
  background: var(--brass-tint);
  border-color: var(--brass);
  color: var(--ink);
  font-weight: 700;
}

/* ---------- Section 1: Customization & 4-Layer Architecture ---------- */
.contrast-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1.15fr;
  gap: 20px;
  margin-bottom: 36px;
}

.contrast-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.contrast-card.isabi-win {
  border: 2px solid var(--brass);
  background: linear-gradient(180deg, var(--brass-tint) 0%, var(--surface) 42%);
  box-shadow: var(--shadow-md);
}

.cc-tag {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin-bottom: 6px;
}

.contrast-card.isabi-win .cc-tag {
  color: var(--brass);
}

.contrast-card h3 {
  font-size: 19px;
  margin-bottom: 10px;
}

.contrast-card p {
  font-size: 14px;
  color: var(--muted);
  margin: 0 0 14px;
}

.cc-list {
  list-style: none;
  padding: 0;
  margin: auto 0 0;
  border-top: 1px solid var(--line);
  padding-top: 12px;
}

.cc-list li {
  font-size: 13.5px;
  padding: 5px 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--muted);
}

.contrast-card.isabi-win .cc-list li {
  color: var(--ink);
  font-weight: 500;
}

.layers-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.layer-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-top: 3px solid var(--brass);
  border-radius: 6px;
  padding: 20px;
}

.layer-num {
  font-family: "Archivo", sans-serif;
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--brass);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.layer-card h4 {
  font-size: 16.5px;
  margin-bottom: 8px;
}

.layer-card p {
  font-size: 13.5px;
  color: var(--muted);
  margin: 0;
}

/* ---------- Section 2: Interactive Industry Blueprints ---------- */
.ind-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 22px;
  align-items: start;
}

.ind-tabs {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px;
}

.ind-tab {
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  padding: 9px 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  transition: background 0.15s, border-color 0.15s;
}

.ind-tab:hover {
  background: var(--surface-2);
}

.ind-tab.active {
  background: var(--brass-tint);
  border-color: var(--brass-border);
  border-left: 3px solid var(--brass);
}

.ind-tab b {
  font-family: "Archivo", sans-serif;
  font-size: 13.8px;
  color: var(--ink);
  line-height: 1.25;
}

.ind-tab small {
  font-size: 11.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ind-detail {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  padding: 28px;
  box-shadow: var(--shadow-md);
  position: sticky;
  top: calc(var(--hdr-h) + 14px);
}

.ind-detail-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 20px;
}

.ind-badge-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--brass);
  background: var(--brass-tint);
  border: 1px solid var(--brass-border);
  padding: 4px 10px;
  border-radius: 4px;
  margin-bottom: 6px;
}

.ind-detail h3 {
  font-size: 24px;
  margin-bottom: 6px;
}

.ind-detail-lead {
  font-size: 15px;
  color: var(--muted);
  max-width: 68ch;
  margin: 0;
}

.ind-cols {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.ind-box {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 16px;
}

.ind-box h4 {
  font-size: 12.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--brass);
  margin-bottom: 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--line);
}

.ind-box ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.ind-box li {
  font-size: 13px;
  color: var(--ink);
  padding: 4.5px 0;
  border-bottom: 1px dashed var(--line);
  line-height: 1.42;
}

.ind-box li:last-child {
  border-bottom: 0;
}

.ind-ledger-strip {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 14px 18px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 3px double var(--brass);
}

.ind-metrics-mini {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
}

.ind-metrics-mini div small {
  display: block;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
}

.ind-metrics-mini div b {
  font-family: "Archivo", sans-serif;
  font-size: 17px;
  color: var(--ink);
}

/* ---------- Section 3: Interactive ERP & Power BI Command Center Sandbox ---------- */
.sandbox-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.sbox-ind-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sbox-ind-btn {
  padding: 8px 13px;
  border-radius: 6px;
  font-size: 12.8px;
  font-weight: 600;
  background: var(--surface);
  color: var(--muted);
  border: 1px solid var(--line);
}

.sbox-ind-btn.active {
  background: var(--brass);
  color: #0B1730;
  border-color: var(--brass);
}

.sbox-theme-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}

.sbox-theme-btn {
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
}

.sbox-theme-btn.active {
  border-color: var(--brass);
  color: var(--brass);
  font-weight: 700;
}

.sandbox-wrap {
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  overflow: hidden;
  background: var(--m-bg);
  box-shadow: var(--shadow-lg);
}

.mock {
  width: 100%;
  display: grid;
  grid-template-columns: 186px 1fr;
  background: var(--m-bg);
  color: var(--m-ink);
  font-size: 12.5px;
  line-height: 1.4;
}

.rail {
  background: var(--m-rail);
  color: #F4F2EE;
  display: flex;
  flex-direction: column;
  padding: 16px 0 12px;
}

.rail .brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.rail nav {
  display: flex;
  flex-direction: column;
  padding: 10px 8px;
  flex: 1;
}

.rail nav button.nav-item {
  text-align: left;
  background: transparent;
  border: 0;
  border-left: 3px solid transparent;
  padding: 8px 10px;
  border-radius: 4px;
  color: rgba(244, 242, 238, 0.76);
  margin: 1px 0;
  font-size: 12.5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  white-space: nowrap;
}

.rail nav button.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #FFFFFF;
}

.rail nav button.nav-item.on {
  background: rgba(255, 255, 255, 0.09);
  color: #FFFFFF;
  border-left-color: var(--m-brass);
  font-weight: 600;
}

.rail nav .grp {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(244, 242, 238, 0.45);
  padding: 14px 10px 5px;
}

.rail .me {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 16px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
}

.rail .me small {
  display: block;
  color: rgba(244, 242, 238, 0.55);
  font-size: 10.5px;
}

.rail .av {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--m-brass);
  color: #0B1730;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 11.5px;
  flex-shrink: 0;
}

.mock .main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mock .top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 18px;
  background: var(--m-surface);
  border-bottom: 1px solid var(--m-line);
}

.mock .crumb span {
  display: block;
  font-size: 11px;
  color: var(--m-muted);
}

.mock .crumb b {
  font-family: "Archivo", sans-serif;
  font-stretch: 112%;
  font-size: 16px;
  font-weight: 700;
  color: var(--m-ink);
}

.mock .tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.mock .pill-select {
  border: 1px solid var(--m-line);
  background: var(--m-bg);
  color: var(--m-ink);
  border-radius: 4px;
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 600;
}

.mock button.primary-mock {
  font-weight: 700;
  background: var(--m-brass);
  color: #0B1730;
  border: 0;
  border-radius: 4px;
  padding: 6px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.mock .kpis {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  background: var(--m-surface);
  border-bottom: 1px solid var(--m-line);
}

.mock .kpi {
  padding: 13px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-right: 1px solid var(--m-line);
  min-width: 0;
}

.mock .kpi:last-child {
  border-right: 0;
}

.mock .kpi .k {
  font-size: 11px;
  color: var(--m-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mock .kpi .v {
  font-family: "Archivo", sans-serif;
  font-stretch: 112%;
  font-weight: 700;
  font-size: 24px;
  line-height: 1.1;
  color: var(--m-ink);
}

.mock .kpi .v small {
  font-size: 13px;
  font-weight: 600;
  color: var(--m-muted);
  margin-left: 2px;
}

.mock .kpi .d {
  font-size: 11.5px;
  color: var(--m-muted);
}

.mock .kpi .d.good {
  color: var(--good);
  font-weight: 600;
}

.mock .kpi .d.crit {
  color: var(--crit);
  font-weight: 600;
}

.mock .kpi.books {
  background: color-mix(in srgb, var(--m-brass) 9%, var(--m-surface));
}

.sbox-mob-tabs {
  display: none;
  gap: 6px;
  padding: 10px 12px 0;
}

.sbox-mob-tab {
  flex: 1;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--m-line);
  background: var(--m-surface);
  color: var(--m-muted);
  font-size: 12px;
  font-weight: 600;
}

.sbox-mob-tab.active {
  border-color: var(--m-brass);
  background: color-mix(in srgb, var(--m-brass) 16%, var(--m-surface));
  color: var(--m-ink);
  font-weight: 700;
}

.mock .row2, .mock .row3 {
  display: grid;
  gap: 12px;
  padding: 12px 14px 0;
}

.mock .row2 {
  grid-template-columns: 1.05fr 1fr;
}

.mock .row3 {
  grid-template-columns: 0.78fr 1.48fr;
  padding-bottom: 14px;
}

.mock .panel {
  background: var(--m-surface);
  border: 1px solid var(--m-line);
  border-radius: 6px;
  min-width: 0;
  overflow-x: auto;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.mock .panel.panel-focus {
  border-color: var(--m-brass);
  box-shadow: 0 0 0 1px var(--m-brass);
}

.mock .ph {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  padding: 10px 12px 6px;
  gap: 6px;
}

.mock .ph h3 {
  font-size: 13px;
  font-weight: 700;
  color: var(--m-ink);
}

.mock .legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--m-muted);
}

.mock .legend span {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mock .sw-box {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  display: inline-block;
}

.s-1 { fill: var(--s1); background: var(--s1); }
.s-2 { fill: var(--s2); background: var(--s2); }
.s-3 { fill: var(--s3); background: var(--s3); }

.chartwrap {
  position: relative;
  padding: 0 8px 6px;
}

.chart {
  width: 100%;
  height: auto;
  display: block;
}

.chart .grid { stroke: var(--m-grid); stroke-width: 1; }
.chart .axis { stroke: var(--m-line); stroke-width: 1; }
.chart .tick { fill: var(--m-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.chart .lbl { fill: var(--m-ink); font-size: 11px; font-weight: 600; }
.chart .hit { fill: transparent; }
.chart .col { cursor: pointer; }
.chart .col:hover .hit { fill: var(--m-ink); fill-opacity: 0.05; }

.chart-tip {
  position: absolute;
  pointer-events: none;
  background: var(--m-ink);
  color: var(--m-surface);
  border-radius: 4px;
  padding: 7px 10px;
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  z-index: 10;
}

table.m-grid {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

table.m-grid th {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--m-muted);
  font-weight: 600;
  text-align: left;
  padding: 6px 7px;
  border-top: 1px solid var(--m-line);
  border-bottom: 1px solid var(--m-line);
  white-space: nowrap;
}

table.m-grid td {
  padding: 6px 7px;
  font-size: 11.5px;
  border-bottom: 1px solid var(--m-line);
  white-space: nowrap;
}

table.m-grid tr:last-child td {
  border-bottom: 0;
}

table.m-grid .n { text-align: right; }
table.m-grid .mu { color: var(--m-muted); }
table.m-grid .mono { font-family: Consolas, "Cascadia Mono", ui-monospace, monospace; font-size: 11.5px; }

table.m-grid tr.total td {
  font-weight: 700;
  border-top: 1px solid var(--m-ink);
  border-bottom: 3px double var(--m-brass);
}

.m-chip {
  display: inline-block;
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--m-chip);
  color: var(--m-muted);
}

.m-chip.closed { background: var(--good-bg); color: var(--good); }
.m-chip.warn { background: var(--warn-bg); color: var(--warn); }

.att {
  list-style: none;
  margin: 0;
  padding: 6px 0 8px;
}

.att li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 10px;
  padding: 8px 14px 8px 16px;
  border-left: 3px solid var(--m-line);
  margin: 0 0 5px;
}

.att li b { font-weight: 600; font-size: 12.5px; color: var(--m-ink); }
.att li span { grid-column: 1; color: var(--m-muted); font-size: 11.5px; }
.att li button.att-act {
  grid-row: 1 / 3;
  grid-column: 2;
  align-self: center;
  background: transparent;
  border: 1px solid var(--m-line);
  border-radius: 4px;
  padding: 4px 8px;
  color: var(--m-steel);
  font-weight: 600;
  font-size: 11.5px;
}
.att li.crit { border-left-color: var(--crit); }
.att li.warn { border-left-color: var(--warn); }
.att li.good { border-left-color: var(--good); }

/* ---------- Section 4: Microsoft Stack & Native AI ("Ask ISABI") ---------- */
.ms-ai-grid {
  display: grid;
  grid-template-columns: 1fr 1.05fr;
  gap: 24px;
  align-items: stretch;
}

.stack-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stack-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3px solid var(--steel);
  border-radius: 6px;
  padding: 15px 18px;
  transition: border-color 0.15s, background 0.15s;
}

.stack-card:hover {
  border-left-color: var(--brass);
  background: var(--surface-2);
}

.stack-card-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 5px;
}

.stack-card-hdr h4 {
  font-size: 15.5px;
}

.stack-card-hdr span {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--steel);
  background: var(--steel-tint);
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.stack-card p {
  font-size: 13.5px;
  color: var(--muted);
  margin: 0;
}

/* Embedded Ask ISABI Console */
.ai-console {
  background: #081223;
  color: #F4F2EE;
  border: 1px solid var(--brass-border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.ai-console-hdr {
  padding: 14px 18px;
  background: #0B1730;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ai-console-title {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.ai-console-title b {
  display: block;
  font-family: "Archivo", sans-serif;
  font-size: 15.5px;
  color: #F4F2EE;
}

.ai-console-title small {
  display: block;
  font-size: 11.5px;
  color: #9FB0C7;
}

.ai-prompt-pills {
  padding: 12px 18px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.ai-pill-btn {
  background: rgba(255, 255, 255, 0.06);
  color: #E9ECF2;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 6px 11px;
  font-size: 12px;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

.ai-pill-btn:hover, .ai-pill-btn.active {
  background: rgba(217, 165, 74, 0.18);
  border-color: #D9A54A;
  color: #FFFFFF;
}

.ai-thread {
  padding: 18px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-msg-user {
  align-self: flex-end;
  background: #1B315E;
  color: #FFFFFF;
  padding: 9px 14px;
  border-radius: 10px 10px 2px 10px;
  font-size: 13px;
  max-width: 88%;
}

.ai-msg-bot {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 10px;
  align-items: start;
}

.ai-bot-bubble {
  background: #11203D;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 2px 10px 10px 10px;
  padding: 15px;
  font-size: 13px;
  color: #E9ECF2;
  min-width: 0;
}

.ai-bot-bubble p {
  margin: 0 0 10px;
}

.ai-bot-table-wrap {
  width: 100%;
  overflow-x: auto;
  margin: 8px 0 10px;
}

.ai-bot-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ai-bot-table th {
  text-align: left;
  color: #9FB0C7;
  font-size: 10.5px;
  text-transform: uppercase;
  padding: 5px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.ai-bot-table td {
  padding: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ai-bot-table tr.tot td {
  font-weight: 700;
  border-top: 1px solid #F4F2EE;
  border-bottom: 3px double #D9A54A;
}

.ai-bot-meta {
  font-size: 11px;
  color: #9FB0C7;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* ---------- Section 5: Ingenuity, Competitive Advantage & ROI ---------- */
.ingenuity-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;
  margin-bottom: 36px;
}

.ing-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 22px;
  position: relative;
}

.ing-card .ing-kicker {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--brass);
  margin-bottom: 6px;
}

.ing-card h3 {
  font-size: 19px;
  margin-bottom: 8px;
}

.ing-card p {
  font-size: 14px;
  color: var(--muted);
  margin: 0;
}

/* Comparison Matrix Table */
.comp-wrap {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 36px;
}

.comp-table {
  width: 100%;
  border-collapse: collapse;
}

.comp-table th, .comp-table td {
  padding: 13px 16px;
  text-align: left;
  border-bottom: 1px solid var(--line);
  font-size: 13.5px;
}

.comp-table th {
  font-family: "Archivo", sans-serif;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: var(--surface-2);
}

.comp-table th.isabi-col, .comp-table td.isabi-col {
  background: var(--brass-tint);
  border-left: 1px solid var(--brass-border);
  border-right: 1px solid var(--brass-border);
  font-weight: 600;
}

.comp-table tr:last-child td {
  border-bottom: 3px double var(--brass);
}

/* ROI Calculator */
.roi-box {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  padding: 28px;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 28px;
  align-items: center;
}

.roi-sliders {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.slider-row label {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-weight: 600;
  font-size: 13.5px;
  margin-bottom: 6px;
}

.slider-row label span.val {
  color: var(--brass);
  font-family: "Archivo", sans-serif;
  font-weight: 800;
  white-space: nowrap;
}

.slider-row input[type="range"] {
  width: 100%;
  accent-color: var(--brass);
  height: 6px;
  cursor: pointer;
}

.roi-results {
  background: var(--bg);
  border: 1px solid var(--brass-border);
  border-radius: 8px;
  padding: 22px;
}

.roi-res-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 3px double var(--brass);
}

.roi-stat small {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 3px;
}

.roi-stat strong {
  font-family: "Archivo", sans-serif;
  font-size: 25px;
  font-weight: 800;
  color: var(--ink);
}

.roi-stat strong.brass {
  color: var(--brass);
}

/* ---------- Section 6: Pricing & Interactive Scope Configurator ---------- */
.pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 40px;
  align-items: stretch;
}

.price-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 26px 24px;
  display: flex;
  flex-direction: column;
}

.price-card.featured {
  border: 2px solid var(--brass);
  box-shadow: var(--shadow-lg);
  position: relative;
}

.price-badge {
  display: inline-block;
  align-self: flex-start;
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  padding: 4px 10px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--muted);
  margin-bottom: 10px;
}

.price-card.featured .price-badge {
  background: var(--brass);
  color: #0B1730;
}

.price-card h3 {
  font-size: 21px;
  margin-bottom: 6px;
}

.price-card .price-desc {
  font-size: 13.5px;
  color: var(--muted);
  margin: 0 0 16px;
}

.price-block {
  padding: 14px 0;
  margin-bottom: 16px;
  border-top: 1px solid var(--line);
  border-bottom: 3px double var(--brass);
}

.price-val {
  font-family: "Archivo", sans-serif;
  font-size: 32px;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.1;
}

.price-val small {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--muted);
}

.price-retainer {
  font-size: 12.5px;
  color: var(--brass);
  font-weight: 600;
  margin-top: 4px;
}

.price-features {
  list-style: none;
  padding: 0;
  margin: 0 0 22px;
  flex: 1;
}

.price-features li {
  font-size: 13.2px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.price-features li:last-child {
  border-bottom: 0;
}

.price-features li i {
  color: var(--brass);
  font-style: normal;
  font-weight: 800;
}

/* Interactive System Scope & Price Estimator */
.configurator-card {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  padding: 28px;
  box-shadow: var(--shadow-md);
  scroll-margin-top: calc(var(--hdr-h) + 14px);
}

.cfg-grid {
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  gap: 28px;
  margin-top: 20px;
}

.cfg-group {
  margin-bottom: 18px;
}

.cfg-group h4 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--brass);
  margin-bottom: 10px;
}

.cfg-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.cfg-pill {
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}

.cfg-pill.active {
  background: var(--brass-tint);
  border-color: var(--brass);
  color: var(--ink);
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--brass);
}

.cfg-checks {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 9px;
}

.cfg-check {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  cursor: pointer;
  text-align: left;
}

.cfg-check.active {
  background: var(--brass-tint);
  border-color: var(--brass);
}

.cfg-check input {
  margin-top: 3px;
  accent-color: var(--brass);
}

.cfg-check b {
  display: block;
  font-size: 13px;
}

.cfg-check small {
  display: block;
  font-size: 11.5px;
  color: var(--muted);
}

.cfg-summary {
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.cfg-sum-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin: 12px 0 16px;
}

.cfg-sum-table td {
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}

.cfg-sum-table td.r {
  text-align: right;
  font-weight: 600;
  white-space: nowrap;
}

.cfg-sum-table tr.tot td {
  font-family: "Archivo", sans-serif;
  font-size: 17px;
  font-weight: 800;
  color: var(--brass);
  border-top: 1px solid var(--ink);
  border-bottom: 3px double var(--brass);
  padding: 9px 0;
}

/* ---------- Section 7: Direct Contact & Lead Portal ---------- */
.portal-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 28px;
}

.portal-form-card {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  padding: 28px;
  box-shadow: var(--shadow-md);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 14px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 14px;
}

.form-field label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}

.form-field input, .form-field select, .form-field textarea {
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  padding: 10px 13px;
  font-size: 15px;
  color: var(--ink);
  outline: none;
}

.form-field input:focus, .form-field select:focus, .form-field textarea:focus {
  border-color: var(--brass);
  box-shadow: 0 0 0 2px var(--brass-tint);
}

.portal-dispatch-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

.portal-direct-card {
  background: #081223;
  color: #F4F2EE;
  border: 1px solid var(--brass-border);
  border-radius: 10px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.direct-channel-box {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 12px;
}

.direct-channel-box small {
  display: block;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #D9A54A;
  margin-bottom: 3px;
}

.direct-channel-box strong {
  display: block;
  font-family: "Archivo", sans-serif;
  font-size: 19px;
  margin-bottom: 5px;
}

.direct-channel-box p {
  font-size: 13px;
  color: #9FB0C7;
  margin: 0 0 10px;
}

/* ---------- Slide-Over Ask ISABI Drawer ---------- */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(4, 10, 22, 0.68);
  backdrop-filter: blur(4px);
  z-index: 300;
  display: flex;
  justify-content: flex-end;
}

.ai-drawer {
  width: min(500px, 100vw);
  height: 100%;
  background: #081223;
  color: #F4F2EE;
  border-left: 1px solid var(--brass-border);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.ai-drawer-hdr {
  padding: 16px 18px;
  background: #0B1730;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ai-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-drawer-ftr {
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: #0B1730;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 8px;
}

.ai-drawer-ftr input {
  flex: 1;
  background: #132342;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  padding: 10px 13px;
  color: #FFFFFF;
  font-size: 15px;
  min-width: 0;
}

/* ---------- Footer ---------- */
.site-footer {
  background: #060E1C;
  color: #9FB0C7;
  padding: 48px 0 92px;
  border-top: 3px double var(--brass);
  font-size: 13.5px;
}

.ftr-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr 1fr;
  gap: 28px;
  margin-bottom: 30px;
}

.ftr-col h4 {
  color: #F4F2EE;
  font-size: 12.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 12px;
}

.ftr-col ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.ftr-col li {
  margin-bottom: 7px;
}

.ftr-col a:hover {
  color: #D9A54A;
}

.ftr-bottom {
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
}

/* ---------- Mobile Dock & Toast ---------- */
.mobile-dock {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 150;
  background: rgba(8, 18, 35, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-top: 1px solid var(--brass-border);
  padding: 7px 10px calc(7px + env(safe-area-inset-bottom, 0px));
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.dock-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 8px 4px;
  color: #F4F2EE;
  font-size: 11.5px;
  font-weight: 600;
  text-align: center;
}

.dock-btn.active {
  border-color: var(--brass);
  background: rgba(217, 165, 74, 0.18);
  color: #D9A54A;
}

.dock-btn.wa {
  background: var(--wa);
  color: var(--wa-ink);
  border-color: var(--wa);
  font-weight: 700;
}

.dock-btn.brass {
  background: var(--brass);
  color: #0B1730;
  border-color: var(--brass);
  font-weight: 700;
}

.toast {
  position: fixed;
  bottom: 84px;
  right: 20px;
  left: auto;
  max-width: min(380px, calc(100vw - 32px));
  z-index: 400;
  background: #0B1730;
  color: #F4F2EE;
  border: 1px solid var(--brass);
  border-bottom: 3px double var(--brass);
  padding: 11px 16px;
  border-radius: 6px;
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  font-weight: 600;
}

.hero-grid > *, .ind-layout > *, .ms-ai-grid > *, .roi-box > *, .cfg-grid > *, .portal-grid > *, .contrast-grid > *, .pricing-grid > * {
  min-width: 0;
}

/* ---------- Responsive Rules ---------- */
@media (max-width: 1220px) {
  .hdr-actions .hide-md {
    display: none;
  }
  .main-nav a {
    padding: 6px 8px;
    font-size: 13px;
  }
}

@media (max-width: 1080px) {
  :root {
    --hdr-h: 96px;
  }
  .hdr-inner {
    height: 56px;
    padding: 0 16px;
  }
  .main-nav {
    display: none;
  }
  .mobile-sec-nav {
    display: flex;
    height: 40px;
    align-items: center;
  }
  .hero-grid, .ind-layout, .ms-ai-grid, .roi-box, .cfg-grid, .portal-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .ind-detail {
    position: static;
  }
  .contrast-grid, .pricing-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .layers-grid, .metrics-grid, .ftr-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ind-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 8px;
  }
  .ind-tab {
    padding: 8px 10px;
  }
  /* Responsive Sandbox on Tablet / Narrow Laptop */
  .mock {
    grid-template-columns: minmax(0, 1fr);
  }
  .rail {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    gap: 10px;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .rail .brand {
    padding: 0;
    border-bottom: 0;
    flex-shrink: 0;
  }
  .rail nav {
    flex-direction: row;
    overflow-x: auto;
    min-width: 0;
    flex: 1;
    padding: 0;
    gap: 4px;
    scrollbar-width: none;
  }
  .rail nav::-webkit-scrollbar {
    display: none;
  }
  .rail nav .grp, .rail .me {
    display: none;
  }
  .rail nav button.nav-item {
    border-left: 0;
    border-bottom: 2px solid transparent;
    padding: 6px 10px;
    font-size: 12px;
  }
  .rail nav button.nav-item.on {
    border-bottom-color: var(--m-brass);
  }
  .mock .row2, .mock .row3 {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .wrap {
    padding-left: 14px;
    padding-right: 14px;
  }
  .brand-badge {
    width: 30px;
    height: 30px;
  }
  .brand-wordmark {
    height: 24px;
  }
  .ask-isabi-trigger {
    padding: 6px 10px;
    font-size: 12px;
  }
  #theme-toggle-btn {
    padding: 6px 8px;
    font-size: 11.5px;
  }
  .hdr-actions .hide-sm {
    display: none;
  }

  /* Compact Phone Hero */
  .hero-section {
    padding: 22px 0 26px;
  }
  .eyebrow {
    font-size: 10.5px;
    padding: 4px 9px;
    margin-bottom: 10px;
  }
  .hero-title {
    font-size: 28px;
    margin-bottom: 10px;
  }
  .hero-lead {
    font-size: 14px;
    line-height: 1.5;
    margin-bottom: 16px;
  }
  .hero-cta-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 18px;
  }
  .hero-cta-row .btn {
    padding: 10px 10px;
    font-size: 13px;
    width: 100%;
  }
  .hero-cta-row .btn-wa {
    grid-column: 1 / -1;
  }
  .hero-trust-strip {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding-top: 12px;
  }
  .trust-item b {
    font-size: 12px;
  }
  .trust-item span {
    font-size: 11px;
    line-height: 1.3;
  }
  .hlc-top {
    padding: 10px 12px;
  }
  .hlc-body {
    padding: 12px;
  }
  .hlc-kpi {
    padding: 9px 10px;
  }
  .hlc-kpi strong {
    font-size: 18px;
  }
  .hlc-table th, .hlc-table td {
    padding: 5px 4px;
    font-size: 11.5px;
  }
  .hlc-ai-strip {
    padding: 8px 10px;
    font-size: 11.5px;
  }

  /* Compact 2x2 Proof Metrics Band on Phone */
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
    border-left: 0;
  }
  .metric-cell {
    padding: 14px 12px;
    border-bottom: 1px solid var(--line);
  }
  .metric-cell .m-val {
    font-size: 22px;
    margin-bottom: 2px;
  }
  .metric-cell .m-lbl {
    font-size: 12.5px;
  }
  .metric-cell .m-sub {
    font-size: 11px;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Compact Sections on Phone */
  .sec {
    padding: 34px 0 38px;
  }
  .sec-head {
    margin-bottom: 18px;
  }
  .sec-head h2 {
    font-size: 22px;
    margin-bottom: 8px;
  }
  .sec-head p {
    font-size: 13.8px;
    line-height: 1.48;
  }

  /* Enable Mobile Segmented Switchers on Phone */
  .mob-seg-bar {
    display: flex;
  }

  /* Section 1: Contrast Switcher + 2x2 Layers on Phone */
  .contrast-grid {
    margin-bottom: 20px;
  }
  .contrast-card[data-mob-hide="1"] {
    display: none;
  }
  .contrast-card {
    padding: 16px;
  }
  .contrast-card h3 {
    font-size: 17px;
  }
  .contrast-card p {
    font-size: 13px;
    margin-bottom: 10px;
  }
  .cc-list li {
    font-size: 12.5px;
    padding: 4px 0;
  }
  .layers-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .layer-card {
    padding: 13px 12px;
    min-width: 0;
  }
  .layer-num {
    font-size: 10px;
  }
  .layer-card h4 {
    font-size: 14px;
    margin-bottom: 5px;
  }
  .layer-card p {
    font-size: 12px;
    line-height: 1.38;
  }

  /* Section 2: All 8 Industries Visible in 2x4 Grid + Tabbed Detail on Phone */
  .ind-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    padding: 6px;
  }
  .ind-tab {
    padding: 8px 9px;
    min-width: 0;
  }
  .ind-tab b {
    font-size: 12.5px;
  }
  .ind-tab small {
    display: none;
  }
  .ind-detail {
    padding: 16px 14px;
  }
  .ind-detail h3 {
    font-size: 19px;
  }
  .ind-detail-lead {
    font-size: 13.2px;
    line-height: 1.45;
  }
  .ind-detail-top {
    padding-bottom: 12px;
    margin-bottom: 12px;
    gap: 10px;
  }
  .ind-detail-top .btn {
    padding: 8px 11px;
    font-size: 12px;
    flex: 1;
  }
  .ind-cols {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    margin-bottom: 14px;
  }
  .ind-box[data-mob-hide="1"] {
    display: none;
  }
  .ind-box {
    padding: 13px;
  }
  .ind-ledger-strip {
    padding: 12px;
    gap: 10px;
  }
  .ind-metrics-mini {
    gap: 14px;
    width: 100%;
    justify-content: space-between;
  }
  .ind-metrics-mini div b {
    font-size: 14.5px;
  }
  .ind-ledger-strip .btn-wa {
    width: 100%;
  }

  /* Section 3: 100% Phone-Native Live ERP Sandbox (Zero Hidden Parts!) */
  .sbox-ind-bar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 5px;
  }
  .sbox-ind-btn {
    padding: 7px 8px;
    font-size: 11.5px;
    text-align: center;
  }
  .sbox-theme-bar {
    width: 100%;
    justify-content: space-between;
  }
  .rail .brand span {
    display: none;
  }
  .mock .top {
    padding: 10px 12px;
  }
  .mock .crumb b {
    font-size: 14.5px;
  }
  .mock .tools {
    width: 100%;
    justify-content: space-between;
  }
  .mock .pill-select {
    flex: 1;
    font-size: 11.5px;
    padding: 5px 6px;
  }
  .mock .kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .mock .kpi {
    padding: 10px 12px;
    border-bottom: 1px solid var(--m-line);
    min-width: 0;
  }
  .mock .kpi:nth-child(2n) {
    border-right: 0;
  }
  .mock .kpi.books {
    grid-column: 1 / -1;
    border-right: 0;
    border-bottom: 0;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .mock .kpi .v {
    font-size: 20px;
  }
  .sbox-mob-tabs {
    display: flex;
  }
  .mock .row2[data-mob-hide="1"],
  .mock .row3[data-mob-hide="1"] {
    display: none;
  }
  .mock .row2, .mock .row3 {
    padding: 10px 10px 12px;
    gap: 10px;
  }
  table.m-grid th, table.m-grid td {
    padding: 5px 5px;
    font-size: 11px;
    white-space: normal;
  }
  table.m-grid .hide-xs {
    display: none;
  }

  /* Section 4: 2x2 Stack Cards + Full-Width AI Console on Phone */
  .stack-cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .stack-card {
    padding: 12px;
    min-width: 0;
  }
  .stack-card-hdr {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  .stack-card-hdr h4 {
    font-size: 13.5px;
    line-height: 1.25;
  }
  .stack-card p {
    font-size: 11.5px;
    line-height: 1.35;
  }
  .ai-console-hdr, .ai-prompt-pills, .ai-thread {
    padding: 12px;
  }
  .ai-thread {
    max-height: 350px;
    overflow-y: auto;
  }
  .ai-msg-bot {
    grid-template-columns: minmax(0, 1fr);
  }
  .ai-msg-bot > svg {
    display: none;
  }
  .ai-bot-bubble {
    padding: 12px;
  }
  .ai-bot-table th, .ai-bot-table td {
    padding: 4px 5px;
    font-size: 11px;
  }

  /* Section 5: 2x2 Ingenuity Cards + Tabbed Matrix / ROI on Phone */
  .ingenuity-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 16px;
  }
  .ing-card {
    padding: 13px 12px;
    min-width: 0;
  }
  .ing-card .ing-kicker {
    font-size: 9.5px;
  }
  .ing-card h3 {
    font-size: 14px;
    margin-bottom: 5px;
  }
  .ing-card p {
    font-size: 11.5px;
    line-height: 1.36;
  }
  .comp-wrap[data-mob-hide="1"],
  .roi-box[data-mob-hide="1"] {
    display: none;
  }
  .comp-wrap {
    margin-bottom: 0;
  }
  .comp-table th, .comp-table td {
    padding: 8px 7px;
    font-size: 11px;
    line-height: 1.3;
  }
  .comp-table th:nth-child(4),
  .comp-table td:nth-child(4) {
    display: none;
  }
  .roi-box {
    padding: 16px 14px;
    gap: 16px;
  }
  .roi-results {
    padding: 14px;
  }
  .roi-stat strong {
    font-size: 20px;
  }

  /* Section 6: Tier & Scope Builder Switcher on Phone */
  .pricing-grid {
    margin-bottom: 0;
  }
  .pricing-grid[data-mob-hide="1"],
  .price-card[data-mob-hide="1"],
  .configurator-card[data-mob-hide="1"] {
    display: none;
  }
  .price-card {
    padding: 20px 16px;
  }
  .configurator-card, .portal-form-card, .portal-direct-card {
    padding: 18px 14px;
  }
  .cfg-checks {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .cfg-check {
    padding: 8px 9px;
    min-width: 0;
  }
  .cfg-check b {
    font-size: 12px;
  }
  .cfg-check small {
    display: none;
  }

  /* Section 7: Tabbed Portal Form vs Direct WhatsApp/Email on Phone */
  .portal-form-card[data-mob-hide="1"],
  .portal-direct-card[data-mob-hide="1"] {
    display: none;
  }
  .form-row, .portal-dispatch-btns, .ftr-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .ftr-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }
  .ftr-grid .ftr-col:first-child {
    grid-column: 1 / -1;
  }
  .mobile-dock {
    display: grid;
  }
}

@media print {
  .site-header, .mobile-dock, .drawer-backdrop, .sandbox-controls, .sbox-ind-bar {
    display: none !important;
  }
  body {
    background: #FFFFFF !important;
    color: #0F1E38 !important;
  }
  .sec {
    padding: 28px 0 !important;
    page-break-inside: avoid;
  }
}
"""
