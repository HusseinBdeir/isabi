/* ============================================================================
   ISABI Systems - Approvals Inbox & remote unlock approval (js/approvals.js)
   - View `approvals` (Sentinels & Alerts hub): one place for everything waiting on a decision:
     unlock requests from colleagues, deliveries awaiting a supplier price, staff awaiting a salary,
     and open Sentinel flags. Every list is read from the same scoped helpers the hub badges use,
     so the inbox never shows a row the seat could not open anyway.
   - Remote approval: a seat without unlock rights asks for approval from the locked field; any
     eligible Supervisor or Owner signed in elsewhere approves or denies with one tap. The server
     (`./api/auth/override-requests`) checks eligibility and writes the same override audit row as
     the typed Supervisor PIN, which stays available as the fallback.
   - Live while open: approvers poll every 20 s while the page is visible and get a one-tap card for
     each new request. Nothing runs in the demo sandbox or the Demo Company (no server calls there).
   window.MFG_APPROVALS = { init, renderView, canApprove, pendingRequestCount, requestOverride, refresh }
   ============================================================================ */
(function () {
  'use strict';

  const API = './api/auth/override-requests';
  const POLL_MS = 20000;
  const WAIT_POLL_MS = 4000;
  const LIST_CAP = 12;
  const UNLOCK_FIELDS = ['f_unitprice', 'f_transunitprice', 'f_qty', 'f_uom', 'f_mat_total', 'f_trans_total', 'f_total_usd', 'f_fxrate'];

  let D = null;
  let pollTimer = 0;
  let pending = [];
  let mine = [];
  let primed = false;
  let seenIds = new Set();
  let fetching = false;
  let lastError = '';
  let liveCardReq = null;
  let lastSig = '';
  // Bumped on every reset (sign-in, sign-out): a response that arrives for a previous seat is dropped.
  let gen = 0;
  // The one request this device is waiting on: { id, gen }. A new ask cancels it; sign-out and page hide too.
  let activeReq = null;

  // The approver is shown the field from its id, never the label the requester's device sent.
  const FIELD_LABELS = {
    f_unitprice: 'Unit Price', f_transunitprice: 'Transport Unit Price', f_qty: 'Quantity', f_uom: 'Unit (UoM)',
    f_mat_total: 'Material Total', f_trans_total: 'Transport Total', f_total_usd: 'Total (USD)', f_fxrate: 'FX Rate',
    f_driver: 'Driver', f_truckowner: 'Truck Owner'
  };
  function fieldLabelFor(r) {
    if (!r) return '';
    if (r.unlock_all) return 'All policy fields';
    const known = FIELD_LABELS[String(r.field_id || '')];
    if (known) return known;
    return `${r.field_label || 'Locked field'} (${r.field_id || '?'})`;
  }
  function tr(s) {
    try { return (window.MFG_I18N && typeof window.MFG_I18N.t === 'function' && window.MFG_I18N.t(s)) || s; } catch (_) { return s; }
  }

  const esc = s => (D && D.esc ? D.esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const ic = n => (D && D.ic ? D.ic(n) : '');
  const fmtNum = n => (D && D.fmtNum ? D.fmtNum(n) : String(n));

  function serverReady() {
    return Boolean(D && D.STATE && D.STATE.authed && D.hasServerApi() && !D.isDemoScopeActive());
  }

  function canApprove(u) {
    if (!D) return false;
    u = u || D.activeUser();
    if (!u || u.status === 'Suspended') return false;
    // Mirrors the server (canUserRowAuthorizeOverride): Owner / Admin / Supervisor roles, or a custom role
    // granted unlock rights. Driver-switch rights of Entry seats do not make anyone an approver.
    if (D.isAdminUser(u)) return true;
    let cp = u.custom_perms;
    if (typeof cp === 'string') { try { cp = JSON.parse(cp); } catch (_) { cp = null; } }
    const customUnlocks = /^custom/i.test(String(u.role || '')) || Boolean(cp && cp.unlocksCustomized === true);
    if (!customUnlocks) return false;
    return UNLOCK_FIELDS.some(f => { try { return D.canUnlockField(f, u); } catch (_) { return false; } });
  }

  function pendingRequestCount() {
    if (!serverReady() || !canApprove()) return 0;
    const now = Date.now();
    return pending.filter(r => r && r.status === 'pending' && Date.parse(r.expires_at || '') > now).length;
  }

  async function apiJson(url, opts) {
    const res = await D.edgeApiFetch(url, opts);
    let j = null;
    try { j = res ? await res.json() : null; } catch (_) { j = null; }
    return { res, j: j || {} };
  }

  // Composed phrases are localized here (the page translator only knows whole fixed strings);
  // elements that carry them are marked data-no-i18n.
  function lang() {
    try { return (window.MFG_I18N && window.MFG_I18N.getLang()) || 'en'; } catch (_) { return 'en'; }
  }
  function L(en, ar, fr) { const lc = lang(); return lc === 'ar' ? ar : (lc === 'fr' ? fr : en); }

  function minutesAgo(iso) {
    const t = Date.parse(iso || '');
    if (!t) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return L('just now', 'الآن', "à l'instant");
    if (m < 60) return L(m === 1 ? '1 min ago' : `${m} min ago`, `منذ ${m} دقيقة`, `il y a ${m} min`);
    const h = Math.round(m / 60);
    return L(h === 1 ? '1 hour ago' : `${h} hours ago`, `منذ ${h} ساعة`, `il y a ${h} h`);
  }

  function expiresIn(iso) {
    const t = Date.parse(iso || '');
    if (!t) return '';
    const m = Math.ceil((t - Date.now()) / 60000);
    if (m <= 0) return L('Expired', 'منتهي', 'Expiré');
    return L(m === 1 ? 'Expires in 1 min' : `Expires in ${m} min`, `ينتهي خلال ${m} دقيقة`, `Expire dans ${m} min`);
  }

  // The form's own title ("New Sales Ticket"), translated, since the row meta is marked data-no-i18n.
  function formLabel(key) {
    const k = String(key || '');
    const title = (D && D.FORM_TITLES && D.FORM_TITLES[k]) || '';
    const base = title || (k ? k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Entry form');
    try { return (window.MFG_I18N && typeof window.MFG_I18N.t === 'function' && window.MFG_I18N.t(base)) || base; } catch (_) { return base; }
  }

  // ------------------------------------------------------------------ server polling (approvers)
  async function refresh(opts) {
    if (!serverReady() || fetching) return;
    fetching = true;
    const g = gen;
    try {
      const wantPending = canApprove();
      const calls = [apiJson(`${API}?mine=1`)];
      if (wantPending) calls.push(apiJson(`${API}?status=pending`));
      const [mineRes, pendRes] = await Promise.all(calls);
      if (g !== gen) return;
      if (mineRes.res && mineRes.res.ok && Array.isArray(mineRes.j.requests)) mine = mineRes.j.requests;
      if (wantPending && pendRes && pendRes.res && pendRes.res.ok && Array.isArray(pendRes.j.requests)) {
        const next = pendRes.j.requests;
        const fresh = primed ? next.filter(r => r && r.status === 'pending' && !seenIds.has(r.id)) : [];
        pending = next;
        next.forEach(r => r && seenIds.add(r.id));
        primed = true;
        if (fresh.length && !(opts && opts.silent)) showLiveCard(fresh[0], fresh.length);
      }
      lastError = '';
    } catch (_) {
      lastError = 'offline';
    } finally {
      fetching = false;
    }
    if (g !== gen) return;
    // Re-render the inbox only when what it shows changed, and never while a field in it has focus.
    const sig = JSON.stringify([pending.map(r => r.id + r.status), mine.map(r => r.id + r.status), lastError]);
    const changed = sig !== lastSig;
    lastSig = sig;
    const st = D.STATE;
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (st && st.view === 'approvals' && !(opts && opts.noRender)) {
      if (changed && !typing && !document.querySelector('#apvInbox [data-apv-busy="1"]')) D.render();
    }
    if (D.refreshNavBadges) D.refreshNavBadges();
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      if (document.visibilityState === 'visible' && serverReady() && canApprove()) await refresh();
      schedulePoll();
    }, POLL_MS);
  }

  // ------------------------------------------------------------------ decide (approve / deny)
  async function decide(id, decision, btn) {
    if (!serverReady()) return;
    const host = btn && btn.closest('[data-apv-req]');
    if (host) host.setAttribute('data-apv-busy', '1');
    if (btn) btn.disabled = true;
    try {
      const { res, j } = await apiJson(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'decide', id, decision })
      });
      if (res && res.ok && j.ok) {
        D.toast(decision === 'approve' ? 'Unlock approved. The requester can edit the field now.' : 'Unlock request declined.', 'ok');
        pending = pending.filter(r => r.id !== id);
      } else {
        D.toast(j.error || 'Could not record the decision. Try again.', 'err');
      }
    } catch (_) {
      D.toast('Offline: the decision was not sent.', 'err');
    } finally {
      if (host) host.removeAttribute('data-apv-busy');
      hideLiveCard(id);
      await refresh({ silent: true });
    }
  }

  // ------------------------------------------------------------------ live card (new request while open)
  function ensureLiveCard() {
    let el = document.getElementById('apvLiveCard');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'apvLiveCard';
    el.className = 'apv-live-card';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Unlock request');
    el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-apv-decide]');
      if (b) { decide(b.getAttribute('data-apv-id'), b.getAttribute('data-apv-decide'), b); return; }
      if (e.target.closest('[data-apv-open]')) { hideLiveCard(); D.setView('approvals'); return; }
      if (e.target.closest('[data-apv-dismiss]')) hideLiveCard();
    });
    return el;
  }

  function showLiveCard(req, count) {
    if (!req || !document.body) return;
    const el = ensureLiveCard();
    liveCardReq = req.id;
    const who = (req.caller && (req.caller.full_name || req.caller.email)) || 'A team member';
    el.innerHTML = `
      <div class="apv-live-hd">${ic('unlock')}<strong>Unlock request</strong>${count > 1 ? `<span class="apv-live-more">+${fmtNum(count - 1)}</span>` : ''}
        <button type="button" class="apv-live-x" data-apv-dismiss="1" aria-label="Close">✕</button></div>
      <div class="apv-live-body"><b>${esc(who)}</b> asks to unlock <b>${esc(tr(fieldLabelFor(req)))}</b>
        <span class="apv-live-meta" data-no-i18n="1">${esc(req.company || '')} · ${esc(formLabel(req.form_key))}${req.record_id ? ' · ' + esc(req.record_id) : ''}${req.reason ? ' · ' + esc(req.reason) : ''}</span></div>
      <div class="apv-live-acts">
        <button type="button" class="btn btn-primary" data-apv-decide="approve" data-apv-id="${esc(req.id)}">${ic('check')} Approve</button>
        <button type="button" class="btn btn-ghost-bar" data-apv-decide="deny" data-apv-id="${esc(req.id)}">Decline</button>
        <button type="button" class="btn btn-ghost-bar" data-apv-open="1">Open Inbox</button>
      </div>`;
    el.hidden = false;
    clearTimeout(el._hideT);
    el._hideT = setTimeout(() => hideLiveCard(req.id), 60000);
  }

  function hideLiveCard(id) {
    const el = document.getElementById('apvLiveCard');
    if (!el || (id && liveCardReq && id !== liveCardReq)) return;
    el.hidden = true;
    liveCardReq = null;
  }

  // ------------------------------------------------------------------ requester side
  // Sends a request and resolves once it is decided, expired or abandoned:
  //   { ok:true, approved:true, authorizerName, auditId } | { ok:false, reason }
  async function requestOverride(spec, ui) {
    if (!serverReady()) return { ok: false, reason: 'unavailable' };
    const statusEl = ui && ui.statusEl;
    const stillWaiting = (ui && typeof ui.stillWaiting === 'function') ? ui.stillWaiting : () => true;
    const say = (txt, cls) => {
      if (!statusEl) return;
      // Fixed phrases go through the page translator; composed ones are already localized by L().
      const fixed = window.MFG_I18N && typeof window.MFG_I18N.t === 'function' ? window.MFG_I18N.t(txt) : txt;
      statusEl.textContent = fixed || txt;
      statusEl.setAttribute('data-no-i18n', '1');
      statusEl.className = 'apv-wait-status' + (cls ? ' ' + cls : '');
      statusEl.hidden = !txt;
    };
    // One wait per device: a new ask replaces (and cancels) the previous one.
    if (activeReq) { cancelRequest(activeReq.id); activeReq = null; }
    const g = gen;
    let created;
    try {
      const { res, j } = await apiJson(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ op: 'create' }, spec))
      });
      if (!(res && res.ok && j.ok && j.request)) {
        say(j.error || 'Could not send the request.', 'err');
        return { ok: false, reason: 'create_failed' };
      }
      created = j.request;
    } catch (_) {
      say('Offline: the request was not sent. Use a Supervisor PIN instead.', 'err');
      return { ok: false, reason: 'offline' };
    }
    const mineNow = { id: created.id, gen: g };
    activeReq = mineNow;
    // Still the same seat, same scope, same form, record and field, and still the current wait.
    const alive = () => activeReq === mineNow && g === gen && serverReady() && stillWaiting();
    const abandon = () => {
      if (activeReq === mineNow) { cancelRequest(created.id); activeReq = null; }
      say('', '');
      return { ok: false, reason: 'abandoned' };
    };
    say('Waiting for a Supervisor to approve…', 'wait');
    const deadline = Date.parse(created.expires_at || '') || (Date.now() + 600000);
    try {
      while (Date.now() < deadline + 2000) {
        await new Promise(r => setTimeout(r, WAIT_POLL_MS));
        if (!alive()) return abandon();
        let cur = null;
        try {
          const { res, j } = await apiJson(`${API}?id=${encodeURIComponent(created.id)}`);
          if (res && res.ok && j.ok) cur = j.request;
        } catch (_) { /* keep waiting through a network blip */ }
        // Checked again after the network wait: the form, record or seat may have changed meanwhile.
        if (!alive()) return abandon();
        if (!cur || cur.id !== created.id) continue;
        if (cur.status === 'approved') {
          say('', '');
        const by = cur.decided_by || {};
        return { ok: true, approved: true, authorizerName: by.full_name || by.email || 'Supervisor', auditId: cur.audit_id || '', request: cur };
      }
      if (cur.status === 'denied') {
        const by = (cur.decided_by && (cur.decided_by.full_name || cur.decided_by.email)) || L('a Supervisor', 'المشرف', 'un superviseur');
        const note = cur.decision_note ? ': ' + cur.decision_note : '';
        say(L(`Declined by ${by}${note}.`, `رفض ${by} الطلب${note}.`, `Refusé par ${by}${note}.`), 'err');
        return { ok: false, reason: 'denied' };
      }
      if (cur.status === 'expired' || cur.status === 'cancelled') {
        say('No one approved within 10 minutes. Ask again or use a Supervisor PIN.', 'err');
        return { ok: false, reason: cur.status };
      }
      }
      say('No one approved within 10 minutes. Ask again or use a Supervisor PIN.', 'err');
      return { ok: false, reason: 'expired' };
    } finally {
      if (activeReq === mineNow) activeReq = null;
    }
  }

  function cancelRequest(id) {
    if (!id || !serverReady()) return;
    apiJson(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'cancel', id }) }).catch(() => {});
  }

  // Sign-out (called before the logout request) and page hide: the waiting request is withdrawn so no one
  // approves an override nobody will use.
  function cancelActive(viaBeacon) {
    const a = activeReq;
    activeReq = null;
    if (!a) return;
    if (viaBeacon && navigator.sendBeacon) {
      try { navigator.sendBeacon(API, new Blob([JSON.stringify({ op: 'cancel', id: a.id })], { type: 'application/json' })); return; } catch (_) { /* fall back */ }
    }
    cancelRequest(a.id);
  }

  // ------------------------------------------------------------------ inbox view
  function statusPill(st) {
    const map = {
      pending: ['warn', 'Waiting'], approved: ['good', 'Approved'], denied: ['crit', 'Declined'],
      cancelled: ['mu', 'Cancelled'], expired: ['mu', 'Expired']
    };
    const [cls, lbl] = map[st] || ['mu', st || ''];
    return `<span class="apv-pill apv-pill-${cls}">${esc(lbl)}</span>`;
  }

  function section(id, title, count, body, emptyTxt) {
    return `
      <section class="apv-section panel-card" id="${id}">
        <div class="panel-head"><div class="panel-title"><span>${esc(title)}</span></div>
          <span class="panel-meta">${count ? `<span class="apv-count">${fmtNum(count)}</span>` : ''}</span></div>
        ${count ? body : `<div class="apv-empty">${esc(emptyTxt)}</div>`}
      </section>`;
  }

  function renderRequests() {
    const now = Date.now();
    const live = pending.filter(r => r && r.status === 'pending' && Date.parse(r.expires_at || '') > now);
    const rows = live.map(r => {
      const who = (r.caller && (r.caller.full_name || r.caller.email)) || 'Team member';
      return `
        <div class="apv-row" data-apv-req="${esc(r.id)}">
          <div class="apv-row-main">
            <div class="apv-row-title"><b>${esc(who)}</b> · ${esc(tr(fieldLabelFor(r)))}</div>
            <div class="apv-row-meta" data-no-i18n="1">${esc(r.company || '')} · ${esc(formLabel(r.form_key))}${r.record_id ? ' · ' + esc(r.record_id) : ''} · ${esc(minutesAgo(r.created_at))} · ${esc(expiresIn(r.expires_at))}</div>
            ${r.reason ? `<div class="apv-row-note">${esc(r.reason)}</div>` : ''}
          </div>
          <div class="apv-row-acts">
            <button type="button" class="btn btn-primary" data-apv-decide="approve" data-apv-id="${esc(r.id)}">${ic('check')} Approve</button>
            <button type="button" class="btn btn-ghost-bar" data-apv-decide="deny" data-apv-id="${esc(r.id)}">Decline</button>
          </div>
        </div>`;
    }).join('');
    const empty = lastError ? 'Offline: unlock requests will load when the connection is back.' : 'No unlock requests are waiting.';
    return section('apvRequests', 'Unlock Requests', live.length, `<div class="apv-list">${rows}</div>`, empty);
  }

  function renderMine() {
    if (!mine.length) return '';
    const rows = mine.slice(0, 8).map(r => `
      <div class="apv-row apv-row-compact">
        <div class="apv-row-main">
          <div class="apv-row-title">${esc(tr(fieldLabelFor(r)))} · ${esc(r.company || '')}</div>
          <div class="apv-row-meta" data-no-i18n="1">${esc(minutesAgo(r.created_at))}${r.decided_by ? ' · ' + esc(r.decided_by.full_name || r.decided_by.email || '') : ''}</div>
        </div>
        <div class="apv-row-acts">${statusPill(r.status)}</div>
      </div>`).join('');
    return section('apvMine', 'My Unlock Requests', mine.length, `<div class="apv-list">${rows}</div>`, '');
  }

  function renderPrices(u) {
    const parts = [];
    let total = 0;
    if (D.canViewView('raw', u)) {
      const pr = D.getScopedPendingPriceRaw({ ignoreSearch: true });
      total += pr.count;
      pr.rows.slice(0, LIST_CAP).forEach(x => parts.push(`
        <div class="apv-row">
          <div class="apv-row-main">
            <div class="apv-row-title"><b>${esc(x.supplier || 'Quarry ticket')}</b> · ${esc(x.product || x.name || '')}</div>
            <div class="apv-row-meta">${esc(D.recordDateDMY(x))} · ${esc(x.company || '')} · ${esc(x.name || x.id)}</div>
          </div>
          <div class="apv-row-acts"><button type="button" class="btn btn-primary" data-apv-raw-price="${esc(x.id)}">${ic('dollar')} Enter Price</button></div>
        </div>`));
    }
    if (D.canViewView('expenses', u)) {
      const pe = D.getScopedPendingPriceExpenses({ ignoreSearch: true });
      total += pe.count;
      pe.rows.slice(0, LIST_CAP).forEach(x => parts.push(`
        <div class="apv-row">
          <div class="apv-row-main">
            <div class="apv-row-title"><b>${esc(x.supplier || 'Supplier')}</b> · ${esc([x.category, x.subcategory].filter(Boolean).join(' · ') || 'Expense')}</div>
            <div class="apv-row-meta">${esc(D.recordDateDMY(x))} · ${esc(x.company || '')} · ${esc(x.name || x.id)}</div>
          </div>
          <div class="apv-row-acts"><button type="button" class="btn btn-primary" data-apv-exp-price="${esc(x.id)}">${ic('dollar')} Enter Price</button></div>
        </div>`));
    }
    const more = total > parts.length
      ? `<div class="apv-more" data-no-i18n="1">${esc(L(`Showing the newest ${fmtNum(parts.length)} of ${fmtNum(total)}.`, `عرض أحدث ${fmtNum(parts.length)} من ${fmtNum(total)}.`, `Les ${fmtNum(parts.length)} plus récents sur ${fmtNum(total)}.`))}</div>`
      : '';
    return section('apvPrices', 'Deliveries Awaiting a Price', total, `<div class="apv-list">${parts.join('')}</div>${more}`, 'No deliveries are waiting for a supplier price.');
  }

  function renderSalaries(u) {
    if (!(D.canViewView('payroll_contracts', u) || D.canViewView('payroll', u))) return '';
    const ps = D.getScopedPendingSalaryEmployments({ ignoreSearch: true });
    const rows = ps.rows.slice(0, LIST_CAP).map(x => `
      <div class="apv-row">
        <div class="apv-row-main">
          <div class="apv-row-title"><b>${esc(x.staff || x.name || 'Staff member')}</b> · ${esc(x.role || x.type || '')}</div>
          <div class="apv-row-meta">${esc(x.start_date || '')} · ${esc(x.company || '')}</div>
        </div>
        <div class="apv-row-acts"><button type="button" class="btn btn-primary" data-apv-salary="${esc(x.id)}">${ic('dollar')} Set Salary</button></div>
      </div>`).join('');
    return section('apvSalaries', 'Staff Awaiting a Salary', ps.count, `<div class="apv-list">${rows}</div>`, 'No staff are waiting for a salary.');
  }

  function renderFlags(u) {
    if (!D.canViewView('sentinels', u)) return '';
    let items = [];
    try { items = D.buildSentinelItems().filter(s => s && s.severity !== 'ok'); } catch (_) { items = []; }
    const rows = items.slice(0, LIST_CAP).map(s => `
      <div class="apv-row">
        <div class="apv-row-main">
          <div class="apv-row-title"><span class="apv-sev apv-sev-${esc(s.severity === 'crit' ? 'crit' : 'warn')}">${esc(s.severity === 'crit' ? 'Critical' : 'Warning')}</span> ${esc(s.title || s.name || 'Sentinel flag')}</div>
          ${s.metric ? `<div class="apv-row-meta">${esc(s.metric)}</div>` : ''}
        </div>
        <div class="apv-row-acts"><button type="button" class="btn btn-ghost-bar" data-apv-sentinels="1">Review</button></div>
      </div>`).join('');
    return section('apvFlags', 'Open Sentinel Flags', items.length, `<div class="apv-list">${rows}</div>`, 'No Sentinel flags are open.');
  }

  function renderView() {
    if (!D) return '';
    const u = D.activeUser();
    const approver = canApprove(u);
    const live = serverReady();
    const intro = live
      ? (approver
        ? 'Approve unlock requests from colleagues and clear the items that wait on a decision. New requests appear here and as a card while the app is open.'
        : 'Items that wait on a decision in your companies. Unlock requests you send from a locked field are listed with their outcome.')
      : 'Items that wait on a decision in your companies. Unlock requests need a signed-in workspace with a live connection.';
    if (live && !primed) setTimeout(() => refresh({ silent: true }), 0);
    return `
      <div class="apv-inbox" id="apvInbox">
        <div class="apv-head panel-card">
          <div class="apv-head-title">${ic('approvals')}<div><h2>Approvals Inbox</h2><p>${esc(intro)}</p></div></div>
          ${live ? `<button type="button" class="btn btn-ghost-bar" data-apv-refresh="1">${ic('rotate')} Refresh</button>` : ''}
        </div>
        ${live && approver ? renderRequests() : ''}
        ${live ? renderMine() : ''}
        ${renderPrices(u)}
        ${renderSalaries(u)}
        ${renderFlags(u)}
      </div>`;
  }

  function wireDelegationOnce() {
    if (document.body.dataset.apvWired === '1') return;
    document.body.dataset.apvWired = '1';
    document.addEventListener('click', e => {
      const root = e.target.closest('#apvInbox');
      if (!root) return;
      const dec = e.target.closest('[data-apv-decide]');
      if (dec) { decide(dec.getAttribute('data-apv-id'), dec.getAttribute('data-apv-decide'), dec); return; }
      const rp = e.target.closest('[data-apv-raw-price]');
      if (rp) { D.openPendingRawPriceModal(rp.getAttribute('data-apv-raw-price')); return; }
      const ep = e.target.closest('[data-apv-exp-price]');
      if (ep) { D.openPendingExpensePriceModal(ep.getAttribute('data-apv-exp-price')); return; }
      const sl = e.target.closest('[data-apv-salary]');
      if (sl) { D.openPendingSalaryModal(sl.getAttribute('data-apv-salary')); return; }
      if (e.target.closest('[data-apv-sentinels]')) { D.setView('sentinels'); return; }
      if (e.target.closest('[data-apv-refresh]')) refresh();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && serverReady() && canApprove()) refresh({ silent: false });
    });
  }

  function init(deps) {
    D = deps;
    wireDelegationOnce();
    window.addEventListener('mfg:auth-gate-closed', () => reset());
    window.addEventListener('pagehide', () => cancelActive(true));
    schedulePoll();
    if (serverReady()) refresh({ silent: true, noRender: true });
  }

  // Called after sign-in / sign-out / company switch so a new seat starts clean.
  function reset() {
    cancelActive(false);
    gen += 1;
    pending = [];
    mine = [];
    primed = false;
    lastSig = '';
    seenIds = new Set();
    hideLiveCard();
    if (D && D.refreshNavBadges) D.refreshNavBadges();
    if (serverReady()) refresh({ silent: true, noRender: true });
  }

  window.MFG_APPROVALS = { init, reset, renderView, canApprove, pendingRequestCount, requestOverride, cancelRequest, cancelActive, refresh };
})();
