# CSS styles for ISABI Systems PWA (v4.6 Architectural Graphite & Cool Stone)

CSS = r"""
:root,
:root[data-theme="light"] {
  --bg: #F7F8FA;
  --bg-alt: #EEF0F4;
  --surface: #FFFFFF;
  --surface-2: #F8F9FB;
  --surface-elev: #FFFFFF;
  --ink: #111827;
  --muted: #525866;
  --muted-2: #717784;
  --line: #E5E7EB;
  --line-strong: #D1D5DB;
  --plate: #111827;
  --brass: #111827;
  --brass-strong: #090D16;
  --brass-ink: #FFFFFF;
  --brass-tint: rgba(17, 24, 39, 0.06);
  --brass-border: rgba(17, 24, 39, 0.22);
  --steel: #374151;
  --steel-tint: rgba(55, 65, 81, 0.08);
  --good: #15803D;
  --good-bg: #ECFDF3;
  --warn: #B45309;
  --warn-bg: #FEF3C7;
  --crit: #B91C1C;
  --crit-bg: #FEF2F2;
  --wa: #25D366;
  --wa-ink: #071F10;
  --shadow-sm: 0 2px 10px rgba(17, 24, 39, 0.05);
  --shadow-md: 0 12px 32px rgba(17, 24, 39, 0.08);
  --shadow-lg: 0 20px 52px rgba(17, 24, 39, 0.14);
  --hdr-h: 64px;

  /* Dashboard Sandbox Tokens (Light default) */
  --m-bg: #F7F8FA;
  --m-surface: #FFFFFF;
  --m-ink: #111827;
  --m-muted: #525866;
  --m-line: #E5E7EB;
  --m-rail: #111827;
  --m-brass: #111827;
  --m-brass-ink: #FFFFFF;
  --m-steel: #374151;
  --s1: #1F2937;
  --s2: #64748B;
  --s3: #15803D;
  --m-chip: #F1F3F6;
  --m-grid: #E5E7EB;
}

:root[data-theme="dark"] {
  --bg: #0B0D11;
  --bg-alt: #0F1217;
  --surface: #141820;
  --surface-2: #1A1F29;
  --surface-elev: #202632;
  --ink: #F3F4F6;
  --muted: #9CA3AF;
  --muted-2: #6B7280;
  --line: #252B36;
  --line-strong: #343C4A;
  --plate: #090B0E;
  --brass: #F3F4F6;
  --brass-strong: #FFFFFF;
  --brass-ink: #0B0D11;
  --brass-tint: rgba(243, 244, 246, 0.08);
  --brass-border: rgba(243, 244, 246, 0.24);
  --steel: #CBD5E1;
  --steel-tint: rgba(203, 213, 225, 0.12);
  --good: #22C55E;
  --good-bg: rgba(34, 197, 94, 0.14);
  --warn: #F59E0B;
  --warn-bg: rgba(245, 158, 11, 0.14);
  --crit: #EF4444;
  --crit-bg: rgba(239, 68, 68, 0.15);
  --shadow-sm: 0 4px 16px rgba(0, 0, 0, 0.35);
  --shadow-md: 0 14px 38px rgba(0, 0, 0, 0.48);
  --shadow-lg: 0 24px 64px rgba(0, 0, 0, 0.65);

  --m-bg: #0B0D11;
  --m-surface: #141820;
  --m-ink: #F3F4F6;
  --m-muted: #9CA3AF;
  --m-line: #252B36;
  --m-rail: #0E1116;
  --m-brass: #F3F4F6;
  --m-brass-ink: #0B0D11;
  --m-steel: #CBD5E1;
  --s1: #E5E7EB;
  --s2: #94A3B8;
  --s3: #22C55E;
  --m-chip: #1F2430;
  --m-grid: #252B36;
}

.sandbox-wrap[data-sbox-theme="light"] {
  --m-bg: #F7F8FA;
  --m-surface: #FFFFFF;
  --m-ink: #111827;
  --m-muted: #525866;
  --m-line: #E5E7EB;
  --m-rail: #111827;
  --m-brass: #111827;
  --m-brass-ink: #FFFFFF;
  --m-steel: #374151;
  --s1: #1F2937;
  --s2: #64748B;
  --s3: #15803D;
  --m-chip: #F1F3F6;
  --m-grid: #E5E7EB;
  --good: #15803D;
  --good-bg: #ECFDF3;
  --warn: #B45309;
  --warn-bg: #FEF3C7;
  --crit: #B91C1C;
  --crit-bg: #FEF2F2;
}

.sandbox-wrap[data-sbox-theme="dark"] {
  --m-bg: #0B0D11;
  --m-surface: #141820;
  --m-ink: #F3F4F6;
  --m-muted: #9CA3AF;
  --m-line: #252B36;
  --m-rail: #0E1116;
  --m-brass: #F3F4F6;
  --m-brass-ink: #0B0D11;
  --m-steel: #CBD5E1;
  --s1: #E5E7EB;
  --s2: #94A3B8;
  --s3: #22C55E;
  --m-chip: #1F2430;
  --m-grid: #252B36;
  --good: #22C55E;
  --good-bg: rgba(34, 197, 94, 0.16);
  --warn: #F59E0B;
  --warn-bg: rgba(245, 158, 11, 0.16);
  --crit: #EF4444;
  --crit-bg: rgba(239, 68, 68, 0.18);
}

*, *::before, *::after {
  box-sizing: border-box;
}

html {
  scroll-padding-top: calc(var(--hdr-h) + env(safe-area-inset-top, 0px) - 2px);
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
  max-width: 1340px;
  margin: 0 auto;
  padding: 0 max(24px, env(safe-area-inset-right, 24px)) 0 max(24px, env(safe-area-inset-left, 24px));
}

/* ---------- Top Header ---------- */
.site-header {
  position: sticky;
  top: 0;
  z-index: 100;
  padding-top: env(safe-area-inset-top, 0px);
  background: color-mix(in srgb, var(--bg) 94%, transparent);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line);
}

.hdr-inner {
  max-width: 1340px;
  height: var(--hdr-h);
  margin: 0 auto;
  padding: 0 max(24px, env(safe-area-inset-right, 24px)) 0 max(24px, env(safe-area-inset-left, 24px));
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
  background: rgba(17, 24, 39, 0.05);
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
  gap: 6px;
  flex-shrink: 0;
}

.hdr-signin-btn {
  padding: 7px 11px;
  font-size: 13px;
  gap: 5px;
}

@media (max-width: 720px) {
  .hdr-signin-btn {
    padding: 7px 9px;
  }
  .hdr-signin-btn span {
    display: none;
  }
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
  color: var(--brass-ink);
  border-color: var(--brass);
  box-shadow: 0 2px 12px rgba(148, 163, 184, 0.22);
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
  color: #F9FAFB;
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
  background: #111827;
  color: #F9FAFB;
  border-color: #374151;
}

.ask-isabi-trigger:hover {
  background: #1F2937;
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
  min-height: calc(100vh - var(--hdr-h));
  min-height: calc(100dvh - var(--hdr-h));
  display: flex;
  align-items: center;
  padding: clamp(32px, 5vh, 56px) 0;
  border-bottom: 1px solid var(--line);
  background:
    radial-gradient(900px 420px at 85% 12%, var(--brass-tint), transparent 72%),
    radial-gradient(800px 400px at 10% 30%, var(--steel-tint), transparent 72%),
    linear-gradient(to right, rgba(255, 255, 255, 0.024) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.024) 1px, transparent 1px),
    var(--bg);
  background-size: auto, auto, 44px 44px, 44px 44px, auto;
}

:root[data-theme="light"] .hero-section {
  background:
    radial-gradient(900px 420px at 85% 12%, var(--brass-tint), transparent 72%),
    radial-gradient(800px 400px at 10% 30%, var(--steel-tint), transparent 72%),
    linear-gradient(to right, rgba(17, 24, 39, 0.035) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(17, 24, 39, 0.035) 1px, transparent 1px),
    var(--bg);
  background-size: auto, auto, 44px 44px, 44px 44px, auto;
}

.hero-grid {
  width: 100%;
  display: grid;
  grid-template-columns: 1.06fr 0.94fr;
  gap: 36px;
  align-items: stretch;
}

.hero-grid > div:first-child {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.135em;
  text-transform: uppercase;
  color: var(--brass);
  background: var(--brass-tint);
  border: 1px solid var(--brass-border);
  padding: 6px 13px;
  border-radius: 4px;
  margin-bottom: 16px;
}

.hero-title {
  font-size: clamp(34px, 3.8vw, 50px);
  font-weight: 800;
  line-height: 1.08;
  margin-bottom: 18px;
}

.hero-title span.brass-text {
  color: var(--brass);
}

.hero-lead {
  font-size: 16.2px;
  color: var(--muted);
  max-width: 62ch;
  margin: 0 0 18px;
  line-height: 1.55;
}

.hero-cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}

.hero-cta-row .btn {
  padding: 11px 16px;
  font-size: 13.8px;
}

/* Interactive 4-Card Hero Mode Launcher (Left Column) */
.hero-launcher-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
}

.hero-launcher-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--brass);
}

.hero-launcher-hdr small {
  font-size: 11px;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 2px 8px;
  border-radius: 999px;
}

.hero-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.hero-mode-card {
  text-align: left;
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.hero-mode-card:hover {
  transform: translateY(-2px);
  border-color: var(--brass);
  box-shadow: 0 8px 20px rgba(17, 24, 39, 0.1);
}

.hero-mode-card.active {
  background: color-mix(in srgb, var(--brass-tint) 65%, var(--surface));
  border-color: var(--brass);
  box-shadow: 0 0 0 2px var(--brass-border), var(--shadow-sm);
}

.hmc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 2px;
}

.hmc-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}

.hmc-tag {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-alt);
  color: var(--muted);
  border: 1px solid var(--line);
}

.hero-mode-card.active .hmc-tag {
  background: var(--brass);
  color: var(--brass-ink);
  border-color: var(--brass);
}

.hero-mode-card b {
  font-family: "Archivo", sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hero-mode-card small {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.35;
}

/* Right Hero Interactive Command Center Card */
.hero-ledger-card {
  background: var(--surface);
  border: 1.5px solid var(--line-strong);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.hlc-top {
  background: #0E1116;
  color: #F9FAFB;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.hlc-win-dots {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

.hlc-win-dots i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.hlc-win-dots i:nth-child(1) { background: #EF4444; }
.hlc-win-dots i:nth-child(2) { background: #F59E0B; }
.hlc-win-dots i:nth-child(3) { background: #10B981; }

.hlc-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.hlc-curr-pills {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.hlc-curr-btn {
  padding: 3px 7px;
  font-size: 10.5px;
  font-weight: 700;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: rgba(249, 250, 251, 0.72);
  transition: background 0.15s, color 0.15s;
}

.hlc-curr-btn.active {
  background: #F9FAFB;
  color: #0B0D11;
}

.hlc-screen-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  background: var(--bg-alt);
  padding: 5px;
  border-radius: 8px;
  border: 1px solid var(--line);
  margin-bottom: 12px;
}

.hlc-screen-tab {
  padding: 6px 6px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-size: 11.8px;
  font-weight: 700;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.hlc-screen-tab:hover {
  color: var(--ink);
}

.hlc-screen-tab.active {
  background: var(--brass);
  color: var(--brass-ink);
  box-shadow: 0 2px 6px rgba(148, 163, 184, 0.25);
}

.hlc-stage {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
  flex: 1;
  min-width: 0;
}

.hlc-ind-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.hlc-ind-pill {
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 11.2px;
  font-weight: 600;
  color: var(--muted);
  transition: all 0.15s;
}

.hlc-ind-pill:hover {
  border-color: var(--brass);
  color: var(--ink);
}

.hlc-ind-pill.active {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--ink);
}

.hlc-visual-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.hlc-vrow {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(50px, 0.85fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  cursor: pointer;
  min-width: 0;
  transition: border-color 0.15s, transform 0.12s, background 0.15s;
}

.hlc-vrow:hover, .hlc-vrow.active {
  border-color: var(--brass);
  background: color-mix(in srgb, var(--brass-tint) 50%, var(--surface-2));
}

.hlc-vrow-main {
  min-width: 0;
}

.hlc-vrow-main b {
  display: block;
  font-size: 12.8px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hlc-vrow-main small {
  display: block;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hlc-vrow-bar {
  height: 7px;
  background: rgba(17, 24, 39, 0.08);
  border-radius: 999px;
  overflow: hidden;
  min-width: 0;
}

:root[data-theme="dark"] .hlc-vrow-bar {
  background: rgba(255, 255, 255, 0.1);
}

.hlc-vrow-bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.hlc-vrow-badge {
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--brass-tint);
  color: var(--brass);
  border: 1px solid var(--brass-border);
  white-space: nowrap;
}

.hlc-vrow strong {
  font-size: 13px;
  color: var(--ink);
  white-space: nowrap;
}

/* Hero POS & Kiosk Stage */
.hlc-pos-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hlc-pos-btns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.hlc-pos-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 600;
  min-width: 0;
  transition: border-color 0.15s, background 0.15s;
}

.hlc-pos-btn:hover {
  border-color: var(--brass);
  background: var(--brass-tint);
}

.hlc-pos-btn b {
  color: var(--brass);
}

.hlc-pos-receipt {
  background: #0E1116;
  color: #F9FAFB;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 11.8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hlc-pos-rhead {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.22);
  padding-bottom: 5px;
  font-size: 11px;
  color: #9CA3AF;
}

.hlc-pos-rhead b {
  color: #CBD5E1;
  font-size: 12.5px;
}

.hlc-pos-ritems {
  color: #E2E8F0;
  font-size: 11.5px;
  line-height: 1.4;
}

.hlc-pos-racts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

/* Hero Apps Mini Stage */
.hlc-apps-mini {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hlc-apps-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.hlc-app-chip {
  padding: 7px 6px;
  border-radius: 7px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  min-width: 0;
  transition: all 0.15s;
}

.hlc-app-chip span {
  font-size: 16px;
}

.hlc-app-chip b {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.hlc-app-chip.active, .hlc-app-chip:hover {
  border-color: var(--brass);
  background: var(--brass-tint);
}

.hlc-app-detail {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-left: 3px solid var(--brass);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
}

.hlc-app-detail p {
  margin: 0;
  color: var(--muted);
  font-size: 11.8px;
  line-height: 1.4;
}

.hlc-table-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.hlc-table-tags span {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-alt);
  border: 1px solid var(--line);
}

/* Hero AI Stage */
.hlc-ai-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hlc-ai-card {
  background: var(--surface-2);
  border: 1px solid var(--brass-border);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.2px;
}

.hlc-ai-q {
  font-size: 11.5px;
  color: var(--muted);
}

.hlc-ai-a {
  color: var(--ink);
  line-height: 1.45;
}

.hlc-ai-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px solid var(--line);
  padding-top: 6px;
}

.hlc-ai-foot small {
  font-size: 10.5px;
  color: var(--brass);
  font-weight: 600;
}

.hlc-ai-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}

.hlc-prompt-chip {
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--brass-border);
  background: var(--surface);
  font-size: 11px;
  font-weight: 600;
  color: var(--ink);
  transition: background 0.15s, border-color 0.15s;
}

.hlc-prompt-chip:hover {
  background: var(--brass);
  color: var(--brass-ink);
  border-color: var(--brass);
}

.hlc-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.hlc-brand svg {
  height: 19px;
  width: auto;
  flex-shrink: 0;
  display: block;
}

.hlc-brand span {
  font-size: 11.5px;
  letter-spacing: 0.075em;
  text-transform: uppercase;
  color: rgba(249, 250, 251, 0.82);
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
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
}

.hlc-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.hlc-kpi {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 10px 13px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.hlc-kpi small {
  display: block;
  font-size: 10.5px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hlc-kpi strong {
  display: block;
  font-family: "Archivo", sans-serif;
  font-size: 21px;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.15;
}

.hlc-kpi span {
  font-size: 11.2px;
  color: var(--good);
  font-weight: 600;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hlc-ai-strip {
  background: var(--brass-tint);
  border: 1px solid var(--brass-border);
  border-radius: 7px;
  padding: 9px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.hlc-ai-strip b {
  color: var(--brass);
}

.hmc-icon.tone-brass { background: rgba(17, 24, 39, 0.16); border: 1px solid rgba(17, 24, 39, 0.35); }
.hmc-icon.tone-green { background: rgba(28, 140, 70, 0.15); border: 1px solid rgba(28, 140, 70, 0.35); }
.hmc-icon.tone-blue { background: rgba(17, 24, 39, 0.16); border: 1px solid rgba(17, 24, 39, 0.35); }
.hmc-icon.tone-purple { background: rgba(124, 77, 255, 0.16); border: 1px solid rgba(124, 77, 255, 0.35); }

/* ---------- Proof Metrics Band (Interactive Jump Cards) ---------- */
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
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px 18px;
  border-right: 1px solid var(--line);
  transition: background 0.16s ease, transform 0.16s ease;
}

.metric-cell:hover {
  background: color-mix(in srgb, var(--brass-tint) 45%, var(--surface));
}

.m-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.m-pill {
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}

.m-pill.good {
  background: rgba(28, 140, 70, 0.14);
  color: var(--good);
  border: 1px solid rgba(28, 140, 70, 0.3);
}

.m-pill.blue {
  background: rgba(17, 24, 39, 0.14);
  color: #374151;
  border: 1px solid rgba(17, 24, 39, 0.3);
}

.m-pill.brass {
  background: var(--brass-tint);
  color: var(--brass);
  border: 1px solid var(--brass-border);
}

.metric-cell .m-val {
  font-family: "Archivo", sans-serif;
  font-size: 24px;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.1;
  margin-bottom: 0;
}

.metric-cell .m-val span {
  color: var(--brass);
}

.metric-cell .m-lbl {
  font-weight: 700;
  font-size: 13.8px;
  color: var(--ink);
  margin-bottom: 2px;
}

.metric-cell .m-sub {
  font-size: 12.2px;
  color: var(--muted);
  line-height: 1.38;
  margin-bottom: 6px;
}

.m-jump {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--brass);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ---------- Generic Section Layout ---------- */
.sec {
  padding: 44px 0 48px;
  border-bottom: 1px solid var(--line);
  scroll-margin-top: calc(var(--hdr-h) - 1px);
}

.sec-alt {
  background: var(--bg-alt);
}

.sec-head {
  max-width: 860px;
  margin-bottom: 24px;
}

.sec-head h2 {
  font-size: clamp(24px, 2.9vw, 34px);
  font-weight: 800;
  line-height: 1.12;
  margin-bottom: 10px;
}

.sec-head p {
  font-size: 15.5px;
  color: var(--muted);
  margin: 0;
  line-height: 1.56;
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
  margin-bottom: 24px;
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

/* Each card is a 3-row subgrid (eyebrow / headline / body) so the three rows
   share the same top edges across all four cards whatever wraps. */
.layer-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-top: 3px solid var(--brass);
  border-radius: 6px;
  padding: 20px;
  display: grid;
  grid-row: span 3;
  grid-template-rows: subgrid;
  row-gap: 0;
  align-content: start;
}

.layer-num {
  font-family: "Archivo", sans-serif;
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1.4;
  color: var(--brass);
  text-transform: uppercase;
  white-space: nowrap;
  margin-bottom: 8px;
}

.layer-card h4 {
  font-size: 16.5px;
  line-height: 1.3;
  margin-bottom: 10px;
}

.layer-card p {
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--muted);
  margin: 0;
}

/* ---------- Section 2: Interactive Industry Blueprints ---------- */
.ind-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 22px;
  align-items: stretch;
}

.ind-tabs {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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
  padding: 26px;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px 36px;
  padding: 16px 0 14px;
  border-top: 1px solid var(--line);
  border-bottom: 3px double var(--brass);
}

.ind-ledger-strip .btn-wa {
  white-space: nowrap;
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
  color: var(--brass-ink);
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
  color: #F9FAFB;
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
  color: rgba(249, 250, 251, 0.76);
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
  color: rgba(249, 250, 251, 0.45);
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
  color: rgba(249, 250, 251, 0.55);
  font-size: 10.5px;
}

.rail .av {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--m-brass);
  color: var(--m-brass-ink);
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
  color: var(--m-brass-ink);
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
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
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
  background: #0E1116;
  color: #F9FAFB;
  border: 1px solid var(--brass-border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.ai-console-hdr {
  padding: 14px 18px;
  background: #111827;
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
  color: #F9FAFB;
}

.ai-console-title small {
  display: block;
  font-size: 11.5px;
  color: #9CA3AF;
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
  color: #F3F4F6;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  padding: 6px 11px;
  font-size: 12px;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

.ai-pill-btn:hover, .ai-pill-btn.active {
  background: rgba(148, 163, 184, 0.18);
  border-color: #CBD5E1;
  color: #FFFFFF;
}

.ai-thread {
  padding: 18px;
  flex: 1;
  max-height: 410px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-scope-bar {
  padding: 8px 18px;
  background: rgba(148, 163, 184, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11.5px;
  color: #9CA3AF;
}

.ai-scope-bar b {
  color: #CBD5E1;
}

.ai-reset-btn {
  background: transparent;
  color: #9CA3AF;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  transition: color 0.15s, border-color 0.15s;
}

.ai-reset-btn:hover {
  color: #F9FAFB;
  border-color: #CBD5E1;
}

.ai-console-ftr {
  padding: 12px 18px;
  background: #111827;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 8px;
}

.ai-console-ftr input {
  flex: 1;
  background: #141820;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  padding: 10px 13px;
  color: #FFFFFF;
  font-size: 14.5px;
  min-width: 0;
  outline: none;
}

.ai-console-ftr input:focus, .ai-drawer-ftr input:focus {
  border-color: #CBD5E1;
  box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.18);
}

.ai-followups {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0 8px;
}

.ai-followup-btn {
  background: rgba(255, 255, 255, 0.05);
  color: #F3F4F6;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 999px;
  padding: 4.5px 10px;
  font-size: 11.5px;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
}

.ai-followup-btn:hover {
  background: rgba(148, 163, 184, 0.18);
  border-color: #CBD5E1;
  color: #FFFFFF;
}

.ai-bot-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.ai-act-link {
  background: transparent;
  border: 0;
  padding: 0;
  color: #94A3B8;
  font-size: 11.5px;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

.ai-act-link:hover {
  color: #CBD5E1;
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
  color: #F3F4F6;
  min-width: 0;
}

.ai-bot-bubble p {
  margin: 0 0 10px;
}

.ai-bot-bubble p:last-child {
  margin-bottom: 0;
}

.ai-bot-bubble.is-conversational {
  padding: 11px 15px;
  border-radius: 2px 12px 12px 12px;
  font-size: 13.5px;
  line-height: 1.5;
}

.ai-msg-followup {
  margin-left: 44px;
  margin-top: -6px;
  animation: isabiFollowupIn 0.22s ease-out;
}

.ai-bot-followup-bubble {
  background: #0E1B34;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 2px 12px 12px 12px;
  padding: 11px 14px;
  font-size: 13px;
  color: #F3F4F6;
}

.ai-followup-lead {
  margin: 0 0 8px;
  color: #F9FAFB;
  font-size: 13px;
  line-height: 1.45;
}

.ai-bot-followup-bubble .ai-followups {
  margin: 4px 0 0;
}

.ai-bot-bubble[dir="rtl"] .ai-bot-bullets,
.ai-bot-followup-bubble[dir="rtl"] .ai-bot-bullets {
  padding-left: 0;
  padding-right: 18px;
}

.ai-bot-bubble[dir="rtl"] .ai-followup-btn,
.ai-bot-followup-bubble[dir="rtl"] .ai-followup-btn {
  text-align: right;
}

.ai-thinking-bubble {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: #11203D;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 2px 10px 10px 10px;
  padding: 10px 14px;
  font-size: 12.5px;
  color: #CBD5E1;
  font-weight: 600;
}

.ai-thinking-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ai-thinking-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #CBD5E1;
  opacity: 0.35;
  animation: isabiPulseDot 1.1s infinite ease-in-out;
}

.ai-thinking-dots span:nth-child(2) {
  animation-delay: 0.18s;
}

.ai-thinking-dots span:nth-child(3) {
  animation-delay: 0.36s;
}

@keyframes isabiPulseDot {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
  40% { opacity: 1; transform: scale(1.15); }
}

@keyframes isabiFollowupIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.ai-bot-bullets {
  margin: 6px 0 10px;
  padding-left: 18px;
  font-size: 12.6px;
  color: #D8E1F0;
  line-height: 1.5;
}

.ai-bot-bullets li {
  margin-bottom: 5px;
}

.ai-bot-bullets li b {
  color: #F9FAFB;
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
  color: #9CA3AF;
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
  border-top: 1px solid #F9FAFB;
  border-bottom: 3px double #CBD5E1;
}

.ai-bot-meta {
  font-size: 11px;
  color: #9CA3AF;
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
  margin-bottom: 24px;
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
  margin-bottom: 24px;
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
  margin-bottom: 26px;
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
  color: var(--brass-ink);
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
  overflow: hidden;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.form-row .form-field {
  margin-bottom: 0;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 14px;
  min-width: 0;
}

.form-field label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink);
}

.form-field input, .form-field select, .form-field textarea {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  padding: 10px 13px;
  font-size: 14px;
  color: var(--ink);
  outline: none;
  text-overflow: ellipsis;
}

.form-field input:focus, .form-field select:focus, .form-field textarea:focus {
  border-color: var(--brass);
  box-shadow: 0 0 0 2px var(--brass-tint);
}

.portal-dispatch-btns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.portal-direct-card {
  background: #0E1116;
  color: #F9FAFB;
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
  color: #CBD5E1;
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
  color: #9CA3AF;
  margin: 0 0 10px;
}

/* ---------- Slide-Over Ask ISABI Drawer ---------- */
.drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.68);
  backdrop-filter: blur(4px);
  z-index: 300;
  display: flex;
  justify-content: flex-end;
}

.ai-drawer {
  width: min(500px, 100vw);
  height: 100%;
  background: #0E1116;
  color: #F9FAFB;
  border-left: 1px solid var(--brass-border);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.ai-drawer-hdr {
  padding: calc(14px + env(safe-area-inset-top, 0px)) 18px 14px;
  background: #111827;
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
  background: #111827;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 8px;
}

.ai-drawer-ftr input {
  flex: 1;
  background: #141820;
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
  color: #9CA3AF;
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
  color: #F9FAFB;
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
  color: #CBD5E1;
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
  padding: 7px max(10px, env(safe-area-inset-right, 10px)) calc(7px + env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left, 10px));
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.dock-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 8px 4px;
  color: #F9FAFB;
  font-size: 11.5px;
  font-weight: 600;
  text-align: center;
}

.dock-btn.active {
  border-color: var(--brass);
  background: rgba(148, 163, 184, 0.18);
  color: #CBD5E1;
}

.dock-btn.wa {
  background: var(--wa);
  color: var(--wa-ink);
  border-color: var(--wa);
  font-weight: 700;
}

.dock-btn.brass {
  background: var(--brass);
  color: var(--brass-ink);
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
  background: #111827;
  color: #F9FAFB;
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
  html.ios-standalone .site-header {
    padding-top: max(env(safe-area-inset-top, 0px), 48px);
  }
  html.ios-standalone .ai-drawer-hdr {
    padding-top: calc(12px + max(env(safe-area-inset-top, 0px), 48px));
  }
  html.ios-standalone .mobile-dock {
    padding-bottom: calc(8px + max(env(safe-area-inset-bottom, 0px), 20px));
  }
  .wrap {
    padding-left: max(14px, env(safe-area-inset-left, 14px));
    padding-right: max(14px, env(safe-area-inset-right, 14px));
  }
  .hdr-inner {
    height: 52px;
    padding: 0 max(14px, env(safe-area-inset-right, 14px)) 0 max(14px, env(safe-area-inset-left, 14px));
  }
  .mobile-sec-nav {
    padding: 0 max(12px, env(safe-area-inset-right, 12px)) 0 max(12px, env(safe-area-inset-left, 12px));
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
    min-height: auto;
    display: block;
    padding: 14px 0 18px;
  }
  .hero-grid {
    gap: 14px;
  }
  .eyebrow {
    font-size: 9.5px;
    letter-spacing: 0.065em;
    padding: 4px 9px;
    margin-bottom: 6px;
  }
  .hero-title {
    font-size: 25px;
    line-height: 1.08;
    margin-bottom: 8px;
  }
  .hero-lead {
    font-size: 13.5px;
    line-height: 1.45;
    margin-bottom: 12px;
  }
  .hero-cta-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    margin-bottom: 12px;
  }
  .hero-cta-row .btn {
    padding: 9px 8px;
    font-size: 12.8px;
    width: 100%;
  }
  .hero-cta-row .btn-wa {
    grid-column: 1 / -1;
  }
  .hero-trust-strip {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    margin-top: 0;
  }
  .trust-kicker {
    display: none;
  }
  .trust-item {
    padding: 7px 10px;
    border-top: 1px solid var(--line);
    border-left: 3px solid var(--brass);
    line-height: 1.32;
  }
  .trust-item b {
    display: inline;
    font-size: 12px;
    margin-right: 4px;
  }
  .trust-item b::after {
    content: "·";
    color: var(--brass);
    margin-left: 5px;
  }
  .trust-item span {
    display: inline;
    font-size: 11.5px;
    line-height: 1.32;
  }
  .hlc-top {
    padding: 8px 10px;
    gap: 5px;
  }
  .hlc-brand {
    gap: 6px;
  }
  .hlc-brand svg {
    height: 15px;
  }
  .hlc-brand span {
    font-size: 9.6px;
    letter-spacing: 0.02em;
  }
  .hlc-status {
    font-size: 10px;
    padding: 3px 7px;
    gap: 4px;
  }
  .hlc-body {
    padding: 11px;
  }
  .hlc-kpi {
    padding: 8px 9px;
  }
  .hlc-kpi small {
    font-size: 8.5px;
    letter-spacing: 0.01em;
  }
  .hlc-kpi strong {
    font-size: 18px;
  }
  .hlc-kpi span {
    font-size: 10.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hlc-table th {
    padding: 4px 4px;
    font-size: 9px;
    letter-spacing: 0.03em;
    white-space: nowrap;
  }
  .hlc-table td {
    padding: 5px 4px;
    font-size: 11.5px;
  }
  .hlc-table td:first-child {
    white-space: normal;
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
    padding: 13px 12px;
    border-bottom: 1px solid var(--line);
  }
  .metric-cell:nth-child(2n) {
    border-right: 0;
  }
  .metric-cell:nth-child(n+3) {
    border-bottom: 0;
  }
  .metric-cell .m-val {
    font-size: 21px;
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
    padding: 28px 0 32px;
  }
  .sec-head {
    margin-bottom: 16px;
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
    white-space: normal;
    margin-bottom: 6px;
  }
  .layer-card h4 {
    font-size: 14px;
    margin-bottom: 6px;
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
    padding: 12px 0 10px;
    gap: 12px;
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
  .ai-console-hdr, .ai-prompt-pills, .ai-thread, .ai-console-ftr {
    padding: 12px;
  }
  .ai-scope-bar {
    padding: 7px 12px;
  }
  .ai-console-ftr input, .ai-drawer-ftr input, .form-field input, .form-field select, .form-field textarea {
    font-size: 16px;
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

/* ---------- Skip link & focus ring ---------- */
.skip-link {
  position: absolute;
  left: 12px;
  top: -60px;
  z-index: 1000;
  background: var(--brass);
  color: var(--brass-ink);
  font-weight: 700;
  padding: 10px 14px;
  border-radius: 8px;
  transition: top 0.15s;
}
.skip-link:focus {
  top: 12px;
}
:focus-visible {
  outline: 2px solid var(--brass);
  outline-offset: 2px;
}
.main-nav a:focus-visible, .btn:focus-visible {
  outline-offset: 1px;
}

/* ---------- Scroll reveal (only when JS + IntersectionObserver are present) ---------- */
html.js-io .reveal:not(.in) {
  opacity: 0;
  transform: translateY(16px);
}
html.js-io .reveal.in:not(.done) {
  transition: opacity 0.55s ease, transform 0.55s ease;
}
html.js-io .reveal.in:not(.done):nth-child(2) { transition-delay: 0.07s; }
html.js-io .reveal.in:not(.done):nth-child(3) { transition-delay: 0.14s; }
html.js-io .reveal.in:not(.done):nth-child(4) { transition-delay: 0.21s; }
@media (prefers-reduced-motion: reduce) {
  html.js-io .reveal:not(.in) {
    opacity: 1;
    transform: none;
  }
  html.js-io .reveal.in:not(.done) {
    transition: none;
  }
}

/* ---------- FAQ ---------- */
.faq-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  align-items: start;
}
.faq-item {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.faq-item[open] {
  border-color: var(--brass-border);
  box-shadow: var(--shadow-sm);
}
.faq-item summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  font-weight: 700;
  font-size: 15px;
  color: var(--ink);
  line-height: 1.35;
}
.faq-item summary::-webkit-details-marker {
  display: none;
}
.faq-item summary:hover {
  background: rgba(255, 255, 255, 0.03);
}
:root[data-theme="light"] .faq-item summary:hover {
  background: rgba(17, 24, 39, 0.03);
}
.faq-n {
  font-family: "Archivo", sans-serif;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--brass);
  flex-shrink: 0;
}
.faq-item summary > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.faq-chev {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  border-right: 2px solid var(--muted);
  border-bottom: 2px solid var(--muted);
  transform: rotate(45deg);
  transition: transform 0.2s;
  margin-right: 4px;
}
.faq-item[open] .faq-chev {
  transform: rotate(225deg);
  border-color: var(--brass);
}
.faq-a {
  padding: 0 18px 18px 44px;
}
.faq-a p {
  margin: 0;
  font-size: 14.2px;
  color: var(--muted);
  line-height: 1.6;
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
.faq-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 26px;
  padding-top: 20px;
  border-top: 3px double var(--brass);
}
.faq-foot span {
  font-weight: 700;
  color: var(--ink);
  margin-right: auto;
}
@media (max-width: 1080px) {
  .faq-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 720px) {
  .faq-item summary {
    padding: 14px 14px;
    font-size: 14.2px;
  }
  .faq-a {
    padding: 0 14px 14px 14px;
  }
  .faq-foot span {
    width: 100%;
    margin-right: 0;
  }
  .faq-foot .btn {
    flex: 1;
  }
}

/* ---------- v4.0 Interactive Tabs, Odoo-Style 18-App Grid & Rich Experiences ---------- */
[data-panel-hidden="1"],
[data-faq-hidden="1"],
[data-ms-hidden="1"] {
  display: none !important;
}

.sec-head-split {
  max-width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 24px;
}

.sec-head-split > div:first-child {
  max-width: 680px;
  min-width: 0;
}

.sec-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  padding: 5px;
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
}

.sec-tab {
  padding: 8px 13px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: 12.8px;
  font-weight: 600;
  transition: all 0.16s ease;
  white-space: nowrap;
}

.sec-tab:hover {
  color: var(--ink);
  background: var(--surface-2);
}

.sec-tab.active {
  background: var(--brass-tint);
  border-color: var(--brass);
  color: var(--ink);
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.16);
}

/* Section 01: Odoo-Style 18-App Interactive Grid & Spotlight */
.app-cat-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.app-cat-pill {
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--muted);
  font-size: 12.5px;
  font-weight: 600;
  transition: all 0.15s ease;
}

.app-cat-pill:hover {
  border-color: var(--brass);
  color: var(--ink);
}

.app-cat-pill.active {
  background: var(--plate);
  color: #F9FAFB;
  border-color: var(--brass);
  font-weight: 700;
}

.app-suite-grid {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.app-tile {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 10px 6px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 5px;
  min-width: 0;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  box-shadow: var(--shadow-sm);
}

.app-tile:hover {
  transform: translateY(-2px);
  border-color: var(--brass-border);
  box-shadow: var(--shadow-md);
}

.app-tile.active {
  border: 2px solid var(--brass);
  background: linear-gradient(180deg, var(--brass-tint) 0%, var(--surface) 60%);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.app-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 19px;
  line-height: 1;
  border: 1px solid rgba(17, 24, 39, 0.08);
  box-shadow: 0 3px 10px rgba(17, 24, 39, 0.07);
}

.app-icon.tone-brass { background: linear-gradient(135deg, rgba(17, 24, 39, 0.22), rgba(17, 24, 39, 0.08)); border-color: rgba(17, 24, 39, 0.35); }
.app-icon.tone-steel { background: linear-gradient(135deg, rgba(17, 24, 39, 0.22), rgba(17, 24, 39, 0.08)); border-color: rgba(17, 24, 39, 0.35); }
.app-icon.tone-good { background: linear-gradient(135deg, rgba(28, 140, 70, 0.22), rgba(28, 140, 70, 0.08)); border-color: rgba(28, 140, 70, 0.35); }
.app-icon.tone-violet { background: linear-gradient(135deg, rgba(124, 77, 255, 0.20), rgba(124, 77, 255, 0.07)); border-color: rgba(124, 77, 255, 0.32); }
.app-icon.tone-coral { background: linear-gradient(135deg, rgba(224, 102, 70, 0.22), rgba(224, 102, 70, 0.08)); border-color: rgba(224, 102, 70, 0.35); }
.app-icon.tone-teal { background: linear-gradient(135deg, rgba(20, 158, 144, 0.22), rgba(20, 158, 144, 0.08)); border-color: rgba(20, 158, 144, 0.35); }

.app-tile b {
  font-family: "Archivo", sans-serif;
  font-size: 11.4px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.18;
  max-width: 100%;
}

.app-tile small {
  display: none;
}

/* Compact vertical rhythm across all sections */
.sec {
  padding: 34px 0 38px;
}

.sec-head {
  margin-bottom: 18px;
}

.ind-tab {
  padding: 7px 11px;
}

.ind-tab small {
  font-size: 10.8px;
}

.ind-detail {
  padding: 20px 22px;
}

.ind-detail-top {
  padding-bottom: 14px;
  margin-bottom: 14px;
}

.stack-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stack-card {
  padding: 13px 14px;
}

.stack-card p {
  font-size: 12.4px;
  line-height: 1.42;
}

.ai-thread {
  max-height: 280px;
}

.app-spotlight {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-left: 4px solid var(--brass);
  border-radius: 10px;
  padding: 18px 22px;
  box-shadow: var(--shadow-md);
  display: grid;
  grid-template-columns: 1.1fr 1.15fr auto;
  gap: 20px;
  align-items: center;
}

.app-spot-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
}

.app-spot-head .app-icon {
  width: 50px;
  height: 50px;
  font-size: 25px;
  flex-shrink: 0;
}

.app-spot-kicker {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--brass);
  display: block;
  margin-bottom: 2px;
}

.app-spot-head h3 {
  font-size: 18.5px;
  margin-bottom: 4px;
}

.app-spot-head p {
  font-size: 13.2px;
  color: var(--muted);
  margin: 0;
  line-height: 1.45;
}

.app-spot-specs {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-left: 18px;
  border-left: 1px solid var(--line);
  min-width: 0;
}

.app-spot-bullets {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 4px;
}

.app-spot-bullets li {
  font-size: 12.6px;
  color: var(--ink);
  line-height: 1.38;
}

.app-spot-tables {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}

.app-spot-tables span {
  font-family: Consolas, "Cascadia Mono", ui-monospace, monospace;
  font-size: 11px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--steel);
  padding: 2px 7px;
  border-radius: 4px;
}

.app-spot-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

/* Section 02: 4-Tab Interactive Industry Blueprint Sub-Tabs & Views */
.ind-subtabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 16px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  padding: 4px;
  border-radius: 8px;
}

.ind-subtab-btn {
  padding: 8px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: 12.3px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all 0.15s ease;
}

.ind-subtab-btn:hover {
  color: var(--ink);
}

.ind-subtab-btn.active {
  background: var(--surface);
  border-color: var(--brass);
  color: var(--ink);
  font-weight: 700;
  box-shadow: var(--shadow-sm);
}

.ind-flow-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.ind-flow-step {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-top: 3px solid var(--brass);
  border-radius: 8px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.ind-flow-time {
  font-size: 11px;
  font-weight: 700;
  color: var(--brass);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ind-flow-step h4 {
  font-size: 14px;
  line-height: 1.28;
}

.ind-flow-step p {
  font-size: 12.5px;
  color: var(--muted);
  margin: 0;
  line-height: 1.45;
  flex: 1;
}

.ind-flow-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--good);
  background: var(--good-bg);
  padding: 3px 7px;
  border-radius: 4px;
  align-self: flex-start;
}

.ind-ba-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.ind-ba-card {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 15px 16px;
  min-width: 0;
}

.ind-ba-card.before {
  border-left: 4px solid var(--crit);
}

.ind-ba-card.after {
  border-left: 4px solid var(--good);
  background: linear-gradient(180deg, var(--brass-tint) 0%, var(--surface-2) 65%);
}

.ind-ba-card h4 {
  font-size: 13.5px;
  margin-bottom: 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid var(--line);
}

.ind-ba-card ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 7px;
}

.ind-ba-card li {
  font-size: 12.8px;
  line-height: 1.4;
  color: var(--ink);
}

/* Section 03: Sandbox SOA & Interactive POS/Kiosk Modes */
.mock.mode-full {
  grid-template-columns: minmax(0, 1fr);
}

.soa-viewer {
  padding: 20px 24px;
  background: var(--m-surface);
  color: var(--m-ink);
}

.soa-hdr {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  padding-bottom: 14px;
  border-bottom: 3px double var(--m-brass);
  margin-bottom: 16px;
}

.soa-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.soa-meta-cell {
  background: var(--m-bg);
  border: 1px solid var(--m-line);
  border-radius: 6px;
  padding: 10px 12px;
}

.soa-meta-cell small {
  display: block;
  font-size: 10.5px;
  text-transform: uppercase;
  color: var(--m-muted);
  margin-bottom: 2px;
}

.soa-meta-cell b {
  font-family: "Archivo", sans-serif;
  font-size: 16px;
  color: var(--m-ink);
}

.pwa-sim-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 18px;
  background: var(--m-bg);
}

.pwa-sim-card {
  background: var(--m-surface);
  border: 1px solid var(--m-line);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.pos-items-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.pos-item-btn {
  background: var(--m-bg);
  border: 1px solid var(--m-line);
  border-radius: 6px;
  padding: 9px 10px;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  font-size: 12.2px;
  font-weight: 600;
  color: var(--m-ink);
  transition: border-color 0.15s, background 0.15s;
}

.pos-item-btn:hover {
  border-color: var(--m-brass);
  background: color-mix(in srgb, var(--m-brass) 12%, var(--m-bg));
}

.pos-receipt-box {
  background: #111827;
  color: #F9FAFB;
  border: 1px solid var(--brass-border);
  border-radius: 6px;
  padding: 12px 14px;
  font-family: Consolas, "Cascadia Mono", ui-monospace, monospace;
  font-size: 11.8px;
  line-height: 1.45;
}

/* Section 04, 05, 06, 08 New Elements */
.ms-left-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.ms-pillar-tabs {
  width: 100%;
}

.ms-pillar-tabs .sec-tab {
  flex: 1;
  text-align: center;
  padding: 7px 8px;
  font-size: 12px;
}

.stack-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.stack-tags span {
  font-size: 11px;
  font-weight: 600;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--ink);
  padding: 2px 8px;
  border-radius: 999px;
}

.sprint-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.sprint-card {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-top: 3px solid var(--brass);
  border-radius: 9px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  box-shadow: var(--shadow-sm);
}

.sprint-day {
  font-family: "Archivo", sans-serif;
  font-size: 11.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--brass);
}

.sprint-card h4 {
  font-size: 16.5px;
  line-height: 1.28;
}

.sprint-card p {
  font-size: 13.2px;
  color: var(--muted);
  margin: 0;
  line-height: 1.5;
  flex: 1;
}

.sprint-deliverable {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--good);
  background: var(--good-bg);
  padding: 4px 8px;
  border-radius: 5px;
  align-self: flex-start;
}

.topic-chips-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  margin-bottom: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  padding: 10px 14px;
  border-radius: 8px;
}

.topic-lbl {
  font-size: 12px;
  font-weight: 700;
  color: var(--brass);
  margin-right: 4px;
}

.topic-chip {
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  transition: all 0.15s ease;
}

.topic-chip:hover, .topic-chip.active {
  background: var(--brass-tint);
  border-color: var(--brass);
  color: var(--ink);
}

@media (max-width: 1080px) {
  .app-suite-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .app-spotlight {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
  .app-spot-specs {
    padding-left: 0;
    border-left: 0;
    border-top: 1px solid var(--line);
    padding-top: 12px;
  }
  .app-spot-actions {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .ind-flow-grid, .sprint-grid, .soa-meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .pwa-sim-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .hero-cta-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hero-cta-row .btn {
    padding: 9px 6px;
    font-size: 11.4px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sec-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    gap: 4px;
  }
  .sec-tab {
    padding: 7px 6px;
    font-size: 11.5px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .app-suite-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .app-tile {
    padding: 10px 8px;
  }
  .app-icon {
    width: 36px;
    height: 36px;
    font-size: 18px;
  }
  .app-spotlight {
    padding: 14px;
  }
  .app-spot-actions .btn {
    flex: 1;
    font-size: 12px;
    padding: 8px 10px;
  }
  .ind-subtabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ind-subtab-btn {
    font-size: 11.5px;
    padding: 7px 6px;
  }
  .ind-flow-grid, .ind-ba-grid, .sprint-grid, .soa-meta-grid, .pos-items-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .soa-viewer, .pwa-sim-grid {
    padding: 12px;
  }
  .topic-chips-bar {
    padding: 8px 10px;
    gap: 5px;
  }
  .topic-chip {
    font-size: 11px;
    padding: 4px 9px;
  }
  .hero-mode-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .hero-mode-card {
    padding: 10px;
  }
  .hero-mode-card small {
    display: none;
  }
  .hlc-win-dots {
    display: none;
  }
  .hlc-screen-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hlc-vrow {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .hlc-vrow-bar, .hlc-vrow-badge, .m-pill {
    display: none;
  }
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .metric-cell {
    min-width: 0;
    padding: 12px 12px;
  }
  .metric-cell .m-val {
    font-size: 19px;
  }
  .ind-detail-acts {
    width: 100%;
    flex-wrap: wrap;
  }
}

.ind-detail-acts {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.cfg-card-hdr {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 10px;
}

.cfg-card-hdr h3 {
  font-size: 18.5px;
  margin: 0;
}

.cfg-card-hdr p {
  font-size: 12.6px;
  color: var(--muted);
  margin: 0;
  max-width: 48ch;
}

.portal-card-hdr {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 12px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
}

.portal-card-hdr h3 {
  font-size: 18px;
  margin: 0;
}

.portal-card-hdr span {
  font-size: 12px;
  color: var(--muted);
}

/* ---------- Desktop Full-Screen Fit Rules (Every Page Fits 100% in 1 Viewport) ---------- */
@media (min-width: 1081px) {
  .hero-section {
    padding: clamp(14px, 2.2vh, 26px) 0;
  }
  .hero-grid {
    gap: 26px;
  }
  .hero-section .eyebrow {
    padding: 4px 10px;
    font-size: 10.8px;
    margin-bottom: 10px;
  }
  .hero-title {
    font-size: clamp(30px, 3.1vw, 42px);
    line-height: 1.06;
    margin-bottom: 10px;
  }
  .hero-lead {
    font-size: 14.5px;
    line-height: 1.45;
    margin-bottom: 12px;
  }
  .hero-cta-row {
    gap: 8px;
    margin-bottom: 12px;
  }
  .hero-cta-row .btn {
    padding: 8px 13px;
    font-size: 13px;
  }
  .hero-launcher-wrap {
    gap: 7px;
  }
  .hero-mode-grid {
    gap: 8px;
  }
  .hero-mode-card {
    padding: 9px 11px;
    gap: 2px;
  }
  .hmc-icon {
    width: 26px;
    height: 26px;
    font-size: 14px;
  }
  .hero-mode-card b {
    font-size: 13px;
  }
  .hero-mode-card small {
    font-size: 11.2px;
    line-height: 1.25;
  }
  .hlc-top {
    padding: 9px 14px;
  }
  .hlc-body {
    padding: 10px 14px;
  }
  .hlc-screen-tabs {
    padding: 4px;
    margin-bottom: 8px;
  }
  .hlc-screen-tab {
    padding: 5px 6px;
    font-size: 11.2px;
  }
  .hlc-kpis {
    gap: 8px;
    margin-bottom: 8px;
  }
  .hlc-kpi {
    padding: 7px 11px;
  }
  .hlc-kpi strong {
    font-size: 18.5px;
  }
  .hlc-stage {
    gap: 7px;
    margin-bottom: 8px;
  }
  .hlc-ind-pill {
    padding: 3px 8px;
    font-size: 10.8px;
  }
  .hlc-visual-list {
    gap: 5px;
  }
  .hlc-vrow {
    padding: 6px 10px;
  }
  .hlc-vrow-main b {
    font-size: 12px;
  }
  .hlc-vrow-main small {
    font-size: 10.4px;
  }
  .hlc-ai-strip {
    padding: 6px 10px;
  }

  /* Compact Proof Metrics Band */
  .metric-cell {
    padding: 11px 15px;
  }
  .metric-cell .m-val {
    font-size: 20px;
  }
  .metric-cell .m-lbl {
    font-size: 12.8px;
  }
  .metric-cell .m-sub {
    font-size: 11.4px;
    margin-bottom: 3px;
  }

  /* Every Section (01-08) Fits Within One Screen Without Clipping Top or Bottom */
  .sec {
    min-height: calc(100vh - var(--hdr-h));
    min-height: calc(100dvh - var(--hdr-h));
    padding: 12px 0 14px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .sec > .wrap {
    width: 100%;
  }
  .sec-head {
    max-width: 100%;
    margin-bottom: 9px;
  }
  .sec-head .eyebrow {
    padding: 2.5px 8px;
    font-size: 10px;
    margin-bottom: 3px;
  }
  .sec-head h2 {
    font-size: clamp(19px, 1.9vw, 24px);
    line-height: 1.1;
    margin-bottom: 2px;
  }
  .sec-head p {
    font-size: 12.6px;
    line-height: 1.32;
  }
  .sec-head-split {
    flex-wrap: nowrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px 20px;
  }
  .sec-head-split > div:first-child {
    flex: 1;
    max-width: none;
    min-width: 0;
  }
  .sec-tabs {
    flex-shrink: 0;
    padding: 3px;
    gap: 3px;
  }
  .sec-tab {
    padding: 5px 9px;
    font-size: 11.5px;
  }

  /* Section 01: Architecture */
  .app-cat-bar {
    margin-bottom: 10px;
    gap: 6px;
  }
  .app-cat-pill {
    padding: 5px 12px;
    font-size: 11.8px;
  }
  .app-suite-grid {
    gap: 7px;
    margin-bottom: 10px;
  }
  .app-tile {
    padding: 8px 5px 7px;
    gap: 4px;
  }
  .app-icon {
    width: 34px;
    height: 34px;
    font-size: 17px;
  }
  .app-spotlight {
    padding: 14px 18px;
    gap: 16px;
  }
  .contrast-grid {
    gap: 16px;
    margin-bottom: 0;
  }
  .contrast-card {
    padding: 16px 18px;
  }
  .contrast-card h3 {
    font-size: 17px;
    margin-bottom: 6px;
  }
  .contrast-card p {
    font-size: 12.8px;
    margin-bottom: 10px;
  }
  .cc-list {
    padding-top: 8px;
  }
  .cc-list li {
    font-size: 12.4px;
    padding: 3.5px 0;
  }

  /* Section 02: Industries */
  .ind-layout {
    gap: 14px;
  }
  .ind-tabs {
    padding: 5px;
    gap: 2px;
  }
  .ind-tab {
    padding: 4px 9px;
    gap: 0;
  }
  .ind-tab b {
    font-size: 12.2px;
    line-height: 1.15;
  }
  .ind-tab small {
    font-size: 10px;
    line-height: 1.15;
  }
  .ind-detail {
    padding: 11px 16px;
  }
  .ind-detail-top {
    flex-wrap: nowrap;
    align-items: center;
    padding-bottom: 7px;
    margin-bottom: 7px;
    gap: 12px;
  }
  .ind-badge-pill {
    padding: 2px 7px;
    font-size: 9.8px;
    margin-bottom: 2px;
  }
  .ind-detail h3 {
    font-size: 18px;
    margin-bottom: 2px;
  }
  .ind-detail-lead {
    font-size: 12.2px;
    line-height: 1.3;
  }
  .ind-detail-acts .btn {
    padding: 6px 10px;
    font-size: 11.6px;
  }
  .ind-subtabs {
    margin-bottom: 7px;
    padding: 2.5px;
  }
  .ind-subtab-btn {
    padding: 4px 7px;
    font-size: 11.4px;
  }
  .ind-cols {
    gap: 10px;
    margin-bottom: 7px;
  }
  .ind-box {
    padding: 8px 10px;
  }
  .ind-box h4 {
    font-size: 10.8px;
    margin-bottom: 4px;
    padding-bottom: 3px;
  }
  .ind-box li {
    font-size: 11.4px;
    padding: 2px 0;
    line-height: 1.24;
  }
  .ind-flow-grid, .ind-ba-grid {
    gap: 10px;
    margin-bottom: 7px;
  }
  .ind-flow-step, .ind-ba-card {
    padding: 9px 11px;
  }
  .ind-ba-card h4 {
    font-size: 12.8px;
    margin-bottom: 6px;
    padding-bottom: 5px;
  }
  .ind-ba-card ul {
    gap: 4px;
  }
  .ind-ba-card li {
    font-size: 11.8px;
    line-height: 1.3;
  }
  .ind-ledger-strip {
    padding: 6px 0 2px;
    gap: 8px 24px;
  }
  .ind-metrics-mini div small {
    font-size: 9.5px;
  }
  .ind-metrics-mini div b {
    font-size: 14px;
  }
  .ind-ledger-strip .btn-wa, .ind-ledger-strip .ind-portal-btn {
    padding: 5px 11px;
    font-size: 11.8px;
  }

  /* Section 03: Live Sandbox */
  .sandbox-controls {
    flex-wrap: nowrap;
    gap: 6px;
    margin-bottom: 6px;
  }
  .sbox-ind-bar {
    flex-wrap: nowrap;
    gap: 4px;
  }
  .sbox-ind-btn {
    padding: 4px 8px;
    font-size: 11.4px;
    white-space: nowrap;
  }
  .sbox-theme-btn {
    padding: 3.5px 7px;
    font-size: 11px;
  }
  .rail {
    padding: 8px 0 6px;
  }
  .rail .brand {
    padding: 0 10px 6px;
  }
  .rail nav {
    padding: 4px 5px;
  }
  .rail nav button.nav-item {
    padding: 3.5px 7px;
    font-size: 11.2px;
  }
  .rail nav .grp {
    padding: 5px 7px 2px;
    font-size: 9px;
  }
  .rail .me {
    padding: 5px 10px 0;
    font-size: 10.6px;
  }
  .mock .top {
    padding: 4.5px 12px;
  }
  .mock .crumb span {
    font-size: 9.6px;
  }
  .mock .crumb b {
    font-size: 13.5px;
  }
  .mock .pill-select {
    padding: 2.5px 6px;
    font-size: 11px;
  }
  .mock button.primary-mock {
    padding: 3.5px 9px;
    font-size: 11px;
  }
  .mock .kpi {
    padding: 4.5px 9px;
    gap: 0;
  }
  .mock .kpi .k {
    font-size: 9.6px;
  }
  .mock .kpi .v {
    font-size: 16.5px;
  }
  .mock .kpi .v small {
    font-size: 10.5px;
  }
  .mock .kpi .d {
    font-size: 9.8px;
  }
  .mock .row2, .mock .row3 {
    gap: 6px;
    padding: 5px 7px 0;
  }
  .mock .row3 {
    grid-template-columns: 0.96fr 1.24fr;
    padding-bottom: 5px;
  }
  .mock .ph {
    padding: 4px 7px 2px;
  }
  .mock .ph h3 {
    font-size: 11.2px;
  }
  .mock .legend {
    font-size: 9.8px;
  }
  .chartwrap {
    padding: 0 5px 2px;
  }
  table.m-grid th {
    padding: 2.2px 5px;
    font-size: 9px;
  }
  table.m-grid td {
    padding: 2.2px 5px;
    font-size: 10.2px;
    line-height: 1.15;
  }
  .m-chip {
    font-size: 9px;
    padding: 1px 4px;
  }
  .att {
    padding: 1px 0 2px;
  }
  .att li {
    padding: 2.5px 7px 2.5px 9px;
    margin: 0 0 1.5px;
  }
  .att li b {
    font-size: 10.6px;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .att li span {
    font-size: 9.8px;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .att li button.att-act {
    padding: 1.5px 5px;
    font-size: 9.6px;
  }
  .soa-viewer {
    padding: 10px 14px;
  }
  .soa-hdr {
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .soa-meta-grid {
    gap: 6px;
    margin-bottom: 8px;
  }
  .soa-meta-cell {
    padding: 5px 9px;
  }
  .soa-meta-cell b {
    font-size: 13.5px;
  }
  .pwa-sim-grid {
    padding: 10px;
    gap: 10px;
  }
  .pwa-sim-card {
    padding: 10px;
    gap: 6px;
  }
  .pos-item-btn {
    padding: 5px 7px;
    font-size: 11px;
  }
  .pos-receipt-box {
    padding: 6px 9px;
    font-size: 10.5px;
    line-height: 1.3;
  }

  /* Section 04: Microsoft Stack & Ask ISABI */
  .ms-ai-grid {
    gap: 18px;
  }
  .ms-left-col {
    gap: 8px;
  }
  .ms-pillar-tabs .sec-tab {
    padding: 5px 6px;
    font-size: 11.2px;
  }
  .stack-cards {
    gap: 8px;
  }
  .stack-card {
    padding: 10px 12px;
  }
  .stack-card-hdr {
    margin-bottom: 3px;
  }
  .stack-card-hdr h4 {
    font-size: 13.8px;
  }
  .stack-card p {
    font-size: 11.8px;
    line-height: 1.34;
  }
  .stack-tags {
    margin-top: 5px;
    gap: 4px;
  }
  .stack-tags span {
    font-size: 10px;
    padding: 1.5px 6px;
  }
  .ai-console-hdr {
    padding: 8px 14px;
  }
  .ai-console-title b {
    font-size: 14px;
  }
  .ai-console-title small {
    font-size: 10.8px;
  }
  .ai-scope-bar {
    padding: 5px 14px;
    font-size: 11px;
  }
  .ai-prompt-pills {
    padding: 7px 14px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
  }
  .ai-pill-btn {
    padding: 4px 8px;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ai-thread {
    padding: 10px 14px;
    max-height: 205px;
    gap: 8px;
  }
  .ai-bot-bubble {
    padding: 10px 12px;
    font-size: 12px;
  }
  .ai-bot-table th, .ai-bot-table td {
    padding: 3.5px 5px;
    font-size: 11px;
  }
  .ai-console-ftr {
    padding: 8px 14px;
  }
  .ai-console-ftr input {
    padding: 7px 10px;
    font-size: 13px;
  }

  /* Section 05: Ingenuity & ROI */
  .comp-wrap {
    margin-bottom: 0;
  }
  .comp-table th, .comp-table td {
    padding: 8.5px 14px;
    font-size: 12.6px;
  }
  .roi-box {
    padding: 18px 22px;
    gap: 22px;
  }
  .roi-sliders {
    gap: 12px;
  }
  .roi-results {
    padding: 16px;
  }
  .ingenuity-grid {
    gap: 12px;
    margin-bottom: 0;
  }
  .ing-card {
    padding: 15px 18px;
  }
  .ing-card h3 {
    font-size: 17px;
    margin-bottom: 5px;
  }
  .ing-card p {
    font-size: 12.8px;
    line-height: 1.42;
  }
  .sprint-grid {
    gap: 12px;
  }
  .sprint-card {
    padding: 15px 16px;
  }

  /* Section 06: Pricing & Scope Builder */
  .pricing-grid {
    gap: 16px;
    margin-bottom: 0;
  }
  .price-card {
    padding: 13px 16px;
  }
  .price-badge {
    padding: 2.5px 8px;
    font-size: 9.8px;
    margin-bottom: 4px;
  }
  .price-card h3 {
    font-size: 17px;
    margin-bottom: 2px;
  }
  .price-card .price-desc {
    font-size: 11.8px;
    line-height: 1.32;
    margin: 0 0 6px;
  }
  .price-block {
    padding: 6px 0;
    margin-bottom: 6px;
  }
  .price-val {
    font-size: 24px;
  }
  .price-val small {
    font-size: 12px;
  }
  .price-retainer {
    font-size: 11px;
    margin-top: 1px;
    line-height: 1.22;
  }
  .price-features {
    margin: 0 0 8px;
  }
  .price-features li {
    font-size: 11.6px;
    line-height: 1.26;
    padding: 3px 0;
    gap: 6px;
  }
  .price-card .btn {
    padding: 7px 12px;
    font-size: 12.4px;
  }
  .configurator-card {
    padding: 10px 14px;
  }
  .cfg-card-hdr {
    margin-bottom: 4px;
  }
  .cfg-card-hdr .eyebrow {
    padding: 2px 7px;
    font-size: 9.5px;
    margin-bottom: 1px;
  }
  .cfg-card-hdr h3 {
    font-size: 15.5px;
  }
  .cfg-card-hdr p {
    font-size: 11.4px;
  }
  .cfg-grid {
    gap: 14px;
    margin-top: 6px;
  }
  .cfg-group {
    margin-bottom: 5px;
  }
  .cfg-group h4 {
    font-size: 10.5px;
    margin-bottom: 3px;
  }
  .cfg-pills {
    gap: 3.5px;
  }
  .cfg-pill {
    padding: 3px 7px;
    font-size: 10.8px;
  }
  .cfg-checks {
    gap: 4px;
  }
  .cfg-check {
    padding: 3.5px 7px;
    gap: 5px;
  }
  .cfg-check b {
    font-size: 11.2px;
    line-height: 1.12;
  }
  .cfg-check small {
    font-size: 9.6px;
    line-height: 1.12;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cfg-summary {
    padding: 9px 12px;
  }
  .cfg-summary h4 {
    font-size: 17px !important;
    margin-bottom: 2px !important;
  }
  .cfg-summary p {
    font-size: 11px !important;
    margin: 0 0 6px !important;
    line-height: 1.25;
  }
  .cfg-summary .btn {
    padding: 6px 10px;
    font-size: 11.8px;
  }
  .cfg-sum-table {
    font-size: 11px;
    margin: 4px 0 5px;
  }
  .cfg-sum-table td {
    padding: 2px 0;
  }
  .cfg-sum-table tr.tot td {
    font-size: 13.8px;
    padding: 4px 0;
  }

  /* Section 07: FAQ */
  .faq-grid {
    gap: 8px 14px;
  }
  .faq-item summary {
    padding: 10px 14px;
    font-size: 13.5px;
  }
  .faq-a {
    padding: 0 14px 10px 38px;
  }
  .faq-a p {
    font-size: 12.6px;
    line-height: 1.42;
    padding-top: 7px;
  }
  .faq-foot {
    margin-top: 12px;
    padding-top: 10px;
  }

  /* Section 08: Portal */
  .topic-chips-bar {
    padding: 4px 8px;
    margin-bottom: 7px;
    gap: 4px;
  }
  .topic-chip {
    padding: 3px 8px;
    font-size: 11px;
  }
  .portal-grid {
    gap: 14px;
  }
  .portal-form-card {
    padding: 8px 24px;
  }
  .portal-direct-card {
    padding: 8px 16px;
  }
  .portal-direct-card ol {
    font-size: 11px !important;
    line-height: 1.24 !important;
  }
  .portal-card-hdr {
    margin-bottom: 5px;
    padding-bottom: 4px;
  }
  .portal-card-hdr h3 {
    font-size: 15.5px;
  }
  .portal-card-hdr span {
    font-size: 11px;
  }
  .form-row {
    gap: 8px;
    margin-bottom: 4px;
  }
  .form-field {
    gap: 2px;
    margin-bottom: 4px;
  }
  .form-field label {
    font-size: 10.8px;
  }
  .form-field input, .form-field select, .form-field textarea {
    padding: 4px 8px;
    font-size: 12px;
  }
  .form-field textarea {
    height: 40px;
    min-height: 40px;
  }
  .portal-dispatch-btns {
    gap: 6px;
    margin-top: 4px;
  }
  .portal-dispatch-btns .btn {
    padding: 7px 10px !important;
    font-size: 12.2px !important;
  }
  .direct-channel-box {
    padding: 6px 10px;
    margin-bottom: 5px;
  }
  .direct-channel-box small {
    font-size: 9.8px;
    margin-bottom: 1px;
  }
  .direct-channel-box strong {
    font-size: 14.5px;
    margin-bottom: 1px;
  }
  .direct-channel-box p {
    font-size: 11px;
    margin: 0 0 4px;
    line-height: 1.24;
  }
  .direct-channel-box .btn {
    padding: 5px 8px;
    font-size: 11.5px;
  }
}

/* ---------- Institutional Inline SVG Brand Logos & Vector Icons ---------- */
svg.ic {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.14em;
  flex-shrink: 0;
  overflow: visible;
}

svg.ic-isabi {
  border-radius: 3.5px;
  width: 1.08em;
  height: 1.08em;
  vertical-align: -0.17em;
}

svg.ic-good { color: var(--good); }
svg.ic-warn { color: var(--warn); }
svg.ic-crit { color: var(--crit); }

.hmc-icon svg.ic {
  width: 18px;
  height: 18px;
}

.app-icon svg.ic {
  width: 19px;
  height: 19px;
}

.app-spot-head .app-icon svg.ic {
  width: 24px;
  height: 24px;
}

.hmc-icon.tone-brass, .app-icon.tone-brass { color: var(--brass); }
.hmc-icon.tone-green, .app-icon.tone-good { color: var(--good); }
.hmc-icon.tone-blue, .app-icon.tone-steel { color: var(--steel); }
.hmc-icon.tone-purple, .app-icon.tone-violet { color: #8B5CF6; }
.app-icon.tone-coral { color: #E07A5F; }
.app-icon.tone-teal { color: #14B8A6; }

@media print {
  .site-header, .mobile-dock, .drawer-backdrop, .sandbox-controls, .sbox-ind-bar {
    display: none !important;
  }
  body {
    background: #FFFFFF !important;
    color: #111827 !important;
  }
  .sec {
    padding: 28px 0 !important;
    page-break-inside: avoid;
  }
  .reveal {
    opacity: 1 !important;
    transform: none !important;
  }
  .faq-item {
    break-inside: avoid;
  }
}
"""
