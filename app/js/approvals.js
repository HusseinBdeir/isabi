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
  const GATE_API = './api/geo/gate-suggestions';
  const POLL_MS = 20000;
  const WAIT_POLL_MS = 4000;
  const LIST_CAP = 12;
  const UNLOCK_FIELDS = ['f_unitprice', 'f_transunitprice', 'f_qty', 'f_uom', 'f_mat_total', 'f_trans_total', 'f_total_usd', 'f_fxrate'];

  let D = null;
  let pollTimer = 0;
  let pending = [];
  let mine = [];
  let gatePending = [];
  let gateMine = [];
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

  function canApproveGatePins(u) {
    if (!D) return false;
    u = u || D.activeUser();
    if (!u || u.status === 'Suspended') return false;
    if (typeof D.canWriteGeoConfig === 'function') {
      try { return Boolean(D.canWriteGeoConfig(u)); } catch (_) { return false; }
    }
    return false;
  }

  function demoGateList() {
    try {
      const arr = window.MFG_GEO && typeof window.MFG_GEO.getDemoGateSuggestions === 'function'
        ? window.MFG_GEO.getDemoGateSuggestions() : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function pendingRequestCount() {
    const isDemo = Boolean(D && typeof D.isDemoScopeActive === 'function' && D.isDemoScopeActive());
    if (isDemo) {
      return canApproveGatePins() ? demoGateList().filter(g => g && g.status === 'pending').length : 0;
    }
    if (!serverReady()) return 0;
    const now = Date.now();
    const ovCnt = canApprove()
      ? pending.filter(r => r && r.status === 'pending' && Date.parse(r.expires_at || '') > now).length
      : 0;
    const gateCnt = canApproveGatePins()
      ? gatePending.filter(g => g && g.status === 'pending').length
      : 0;
    return ovCnt + gateCnt;
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
      const wantGatePending = canApproveGatePins();
      const calls = [
        apiJson(`${API}?mine=1`),
        wantPending ? apiJson(`${API}?status=pending`) : Promise.resolve(null),
        apiJson(`${GATE_API}?mine=1`).catch(() => null),
        wantGatePending ? apiJson(`${GATE_API}?status=pending`).catch(() => null) : Promise.resolve(null)
      ];
      const [mineRes, pendRes, gateMineRes, gatePendRes] = await Promise.all(calls);
      if (g !== gen) return;
      if (mineRes && mineRes.res && mineRes.res.ok && Array.isArray(mineRes.j.requests)) mine = mineRes.j.requests;
      if (wantPending && pendRes && pendRes.res && pendRes.res.ok && Array.isArray(pendRes.j.requests)) {
        const next = pendRes.j.requests;
        const fresh = primed ? next.filter(r => r && r.status === 'pending' && !seenIds.has(r.id)) : [];
        pending = next;
        next.forEach(r => r && seenIds.add(r.id));
        if (fresh.length && !(opts && opts.silent)) showLiveCard(fresh[0], fresh.length);
      }
      if (gateMineRes && gateMineRes.res && gateMineRes.res.ok && Array.isArray(gateMineRes.j.suggestions)) {
        gateMine = gateMineRes.j.suggestions;
      }
      if (wantGatePending && gatePendRes && gatePendRes.res && gatePendRes.res.ok && Array.isArray(gatePendRes.j.suggestions)) {
        gatePending = gatePendRes.j.suggestions;
      } else if (!wantGatePending) {
        gatePending = [];
      }
      primed = true;
      lastError = '';
    } catch (_) {
      lastError = 'offline';
    } finally {
      fetching = false;
    }
    if (g !== gen) return;
    // Re-render the inbox only when what it shows changed, and never while a field in it has focus.
    const sig = JSON.stringify([
      pending.map(r => r.id + r.status),
      mine.map(r => r.id + r.status),
      gatePending.map(r => r.id + r.status),
      gateMine.map(r => r.id + r.status),
      lastError
    ]);
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
      const onInbox = D && D.STATE && D.STATE.view === 'approvals';
      if (document.visibilityState === 'visible' && serverReady() && (canApprove() || canApproveGatePins() || onInbox)) await refresh();
      schedulePoll();
    }, POLL_MS);
  }

  // ------------------------------------------------------------------ decide (approve / deny) & gate pins
  async function decideGatePin(id, decision, btn) {
    if (!id) return;
    const isDemo = Boolean(D && typeof D.isDemoScopeActive === 'function' && D.isDemoScopeActive());
    if (isDemo) {
      const arr = demoGateList();
      const hit = arr.find(x => x && x.id === id);
      if (hit) {
        hit.status = decision;
        if (decision === 'approved' && window.MFG_GEO && typeof window.MFG_GEO.applyPromotedGatePinClient === 'function') {
          window.MFG_GEO.applyPromotedGatePinClient(hit, []);
        }
        if (decision === 'approved' && D && typeof D.onGatePinPromoted === 'function') D.onGatePinPromoted(hit, []);
        D.toast(decision === 'approved' ? 'Gate pin approved and promoted to site master.' : 'Gate pin suggestion declined.', 'ok');
        if (D.refreshNavBadges) D.refreshNavBadges();
        D.render();
      }
      return;
    }
    if (!serverReady()) return;
    const host = btn && btn.closest('[data-apv-gate-req]');
    if (host) host.setAttribute('data-apv-busy', '1');
    if (btn) btn.disabled = true;
    try {
      const { res, j } = await apiJson(GATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'decide', id, decision })
      });
      if (res && res.ok && j.ok) {
        gatePending = gatePending.filter(r => r.id !== id);
        if (decision === 'approved' && j.suggestion && window.MFG_GEO && typeof window.MFG_GEO.applyPromotedGatePinClient === 'function') {
          window.MFG_GEO.applyPromotedGatePinClient(j.suggestion, j.clearedRoutePairs || []);
        }
        if (decision === 'approved' && D && typeof D.onGatePinPromoted === 'function') {
          D.onGatePinPromoted(j.suggestion, j.clearedRoutePairs || []);
        }
        D.toast(decision === 'approved' ? 'Gate pin approved and promoted to site master.' : 'Gate pin suggestion declined.', 'ok');
      } else {
        D.toast(j.error || 'Could not record gate pin decision.', 'err');
      }
    } catch (_) {
      D.toast('Offline: gate pin decision was not sent.', 'err');
    } finally {
      if (host) host.removeAttribute('data-apv-busy');
      await refresh({ silent: true });
      if (D && D.STATE && D.STATE.view === 'approvals') D.render();
    }
  }

  async function cancelGatePin(id, btn) {
    if (!id) return;
    const isDemo = Boolean(D && typeof D.isDemoScopeActive === 'function' && D.isDemoScopeActive());
    if (isDemo) {
      const hit = demoGateList().find(x => x && x.id === id);
      if (hit) hit.status = 'cancelled';
      D.render();
      return;
    }
    if (!serverReady()) return;
    if (btn) btn.disabled = true;
    try {
      const { res, j } = await apiJson(GATE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'cancel', id })
      });
      if (res && res.ok && j.ok) {
        gateMine = gateMine.map(r => r.id === id ? (j.suggestion || Object.assign({}, r, { status: 'cancelled' })) : r);
        gatePending = gatePending.filter(r => r.id !== id);
        D.toast('Gate pin suggestion cancelled.', 'ok');
      } else {
        D.toast(j.error || 'Could not cancel gate pin suggestion.', 'err');
      }
    } catch (_) {
      D.toast('Offline: cancel request was not sent.', 'err');
    } finally {
      if (btn) btn.disabled = false;
      await refresh({ silent: true });
      if (D && D.STATE && D.STATE.view === 'approvals') D.render();
    }
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
      declined: ['crit', 'Declined'], cancelled: ['mu', 'Cancelled'], expired: ['mu', 'Expired']
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

  const _apvGateMaps = new Map();
  function hydrateGateComparisonMaps() {
    if (!window.MFG_GEO || typeof window.MFG_GEO.ensureLeaflet !== 'function') return;
    const boxes = document.querySelectorAll('#apvGatePins [data-apv-gate-preview]');
    if (!boxes.length) return;
    window.MFG_GEO.ensureLeaflet().then(L => {
      boxes.forEach(el => {
        if (!el || !el.isConnected || el.dataset.mapMounted === '1') return;
        const sLat = Number(el.getAttribute('data-sug-lat'));
        const sLng = Number(el.getAttribute('data-sug-lng'));
        if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) return;
        const eLatRaw = el.getAttribute('data-ex-lat');
        const eLngRaw = el.getAttribute('data-ex-lng');
        const hasEx = eLatRaw !== '' && eLngRaw !== '' && Number.isFinite(Number(eLatRaw)) && Number.isFinite(Number(eLngRaw));
        const eLat = hasEx ? Number(eLatRaw) : null;
        const eLng = hasEx ? Number(eLngRaw) : null;
        try {
          const oldMap = _apvGateMaps.get(el.id);
          if (oldMap) {
            try { oldMap.remove(); } catch (_) {}
            _apvGateMaps.delete(el.id);
          }
          for (const [k, m] of _apvGateMaps.entries()) {
            const dom = document.getElementById(k);
            if (!dom || !dom.isConnected) {
              try { m.remove(); } catch (_) {}
              _apvGateMaps.delete(k);
            }
          }
          el.dataset.mapMounted = '1';
          el.innerHTML = '';
          const map = L.map(el, { zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false }).setView([sLat, sLng], 15);
          window.MFG_GEO.addBaseTiles(L, map);
          if (hasEx) {
            L.polyline([[eLat, eLng], [sLat, sLng]], { color: '#C0892F', weight: 2.5, dashArray: '4, 4' }).addTo(map);
            L.circleMarker([eLat, eLng], { radius: 6, color: '#1D4ED8', fillColor: '#3B82F6', fillOpacity: 0.9, weight: 2 }).addTo(map);
          }
          L.circleMarker([sLat, sLng], { radius: 7, color: '#047857', fillColor: '#10B981', fillOpacity: 0.95, weight: 2 }).addTo(map);
          if (hasEx) {
            map.fitBounds(L.latLngBounds([[eLat, eLng], [sLat, sLng]]), { padding: [18, 18], maxZoom: 16, animate: false });
          }
          _apvGateMaps.set(el.id, map);
          setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 30);
        } catch (_) {}
      });
    }).catch(() => {});
  }

  function renderGateSuggestions() {
    const isDemo = Boolean(D && typeof D.isDemoScopeActive === 'function' && D.isDemoScopeActive());
    const liveList = (isDemo ? demoGateList() : gatePending).filter(g => g && g.status === 'pending');
    const rows = liveList.map(g => {
      const who = g.driver_label || g.submitter_name || g.submitter_email || L('Field Driver', 'سائق ميداني', 'Chauffeur');
      const hasEx = g.existing_lat != null && g.existing_lng != null && Number.isFinite(Number(g.existing_lat)) && Number.isFinite(Number(g.existing_lng));
      const exTxt = hasEx ? `${Number(g.existing_lat).toFixed(5)}, ${Number(g.existing_lng).toFixed(5)}` : L('Unpinned', 'غير مثبت', 'Non épinglé');
      const sgTxt = `${Number(g.suggested_lat).toFixed(5)}, ${Number(g.suggested_lng).toFixed(5)}`;
      const shiftTxt = g.shift_meters != null
        ? L(`${fmtNum(g.shift_meters, 0)} m shift`, `إزاحة ${fmtNum(g.shift_meters, 0)} م`, `Décalage ${fmtNum(g.shift_meters, 0)} m`)
        : L('New pin', 'دبوس جديد', 'Nouveau point');
      const accTxt = g.accuracy_meters != null ? `±${fmtNum(g.accuracy_meters, 0)}m` : '';
      return `
        <div class="apv-row apv-gate-row" data-apv-gate-req="${esc(g.id)}">
          <div class="apv-row-main">
            <div class="apv-row-title">${(g.site_name || g.site_id) ? `<b data-no-i18n="1">${esc(g.site_name || g.site_id)}</b>` : `<b>Site Gate</b>`} · <span data-no-i18n="1">${esc(who)}</span></div>
            <div class="apv-row-meta" data-no-i18n="1">${esc(g.company || '')} · ${esc(g.industry || 'manufacturing')} · ${esc(shiftTxt)}${accTxt ? ' · ' + esc(accTxt) : ''} · ${esc(minutesAgo(g.created_at))}</div>
            <div class="apv-gate-coords-line mono" data-no-i18n="1">
              <span>${esc(exTxt)}</span> <span aria-hidden="true">/</span> <b>${esc(sgTxt)}</b>
            </div>
            ${g.access_note ? `<div class="apv-row-note" data-no-i18n="1">${esc(g.access_note)}</div>` : ''}
            <div class="apv-gate-preview-box" id="apvGateMapPreview_${esc(g.id)}" data-apv-gate-preview="${esc(g.id)}" data-sug-lat="${esc(String(g.suggested_lat))}" data-sug-lng="${esc(String(g.suggested_lng))}" data-ex-lat="${hasEx ? esc(String(g.existing_lat)) : ''}" data-ex-lng="${hasEx ? esc(String(g.existing_lng)) : ''}">
              <svg viewBox="0 0 180 64" width="180" height="64" aria-hidden="true">
                <rect x="0" y="0" width="180" height="64" rx="8" fill="#F8F6F1"/>
                ${hasEx ? '<line x1="46" y1="36" x2="134" y2="26" stroke="#C0892F" stroke-width="2.5" stroke-dasharray="4 4"/><circle cx="46" cy="36" r="6" fill="#3B82F6" stroke="#1D4ED8" stroke-width="2"/>' : ''}
                <circle cx="${hasEx ? '134' : '90'}" cy="${hasEx ? '26' : '32'}" r="7" fill="#10B981" stroke="#047857" stroke-width="2"/>
              </svg>
            </div>
          </div>
          <div class="apv-row-acts apv-gate-acts">
            <button type="button" class="btn btn-primary" data-apv-gate-decide="approved" data-apv-gate-id="${esc(g.id)}">${ic('check')} Approve &amp; Promote Pin</button>
            <button type="button" class="btn btn-ghost-bar" data-apv-gate-decide="declined" data-apv-gate-id="${esc(g.id)}">Decline</button>
            <button type="button" class="btn btn-ghost-bar" data-apv-gate-map="${esc(g.id)}">${ic('pin')} Preview on Map</button>
          </div>
        </div>`;
    }).join('');
    if (liveList.length) setTimeout(hydrateGateComparisonMaps, 30);
    return section('apvGatePins', 'Driver & Field Gate-Pin Suggestions', liveList.length, `<div class="apv-list">${rows}</div>`, 'No gate pin suggestions are awaiting review.');
  }

  function renderMyGateSuggestions() {
    const isDemo = Boolean(D && typeof D.isDemoScopeActive === 'function' && D.isDemoScopeActive());
    const list = isDemo ? demoGateList() : gateMine;
    if (!list.length) return '';
    const rows = list.slice(0, 8).map(g => `
      <div class="apv-row apv-row-compact">
        <div class="apv-row-main">
          <div class="apv-row-title">${(g.site_name || g.site_id) ? `<b data-no-i18n="1">${esc(g.site_name || g.site_id)}</b>` : `<b>Site Gate</b>`} · <span data-no-i18n="1">${esc(g.company || '')}</span></div>
          <div class="apv-row-meta mono" data-no-i18n="1">${Number(g.suggested_lat).toFixed(5)}, ${Number(g.suggested_lng).toFixed(5)} · ${esc(minutesAgo(g.created_at))}${g.access_note ? ' · ' + esc(g.access_note) : ''}</div>
        </div>
        <div class="apv-row-acts">
          ${statusPill(g.status)}
          ${g.status === 'pending' ? `<button type="button" class="btn btn-ghost-bar" data-apv-gate-cancel="${esc(g.id)}">Cancel</button>` : ''}
        </div>
      </div>`).join('');
    return section('apvMyGatePins', 'My Gate-Pin Suggestions', list.length, `<div class="apv-list">${rows}</div>`, '');
  }

  function renderView() {
    if (!D) return '';
    const u = D.activeUser();
    const approver = canApprove(u);
    const approverGate = canApproveGatePins(u);
    const live = serverReady();
    const isDemo = Boolean(D && typeof D.isDemoScopeActive === 'function' && D.isDemoScopeActive());
    const intro = live
      ? ((approver || approverGate)
        ? 'Approve unlock requests and candidate gate pins from colleagues, and clear items waiting on a decision.'
        : 'Items that wait on a decision in your companies. Requests you send appear below with their outcome.')
      : 'Items that wait on a decision in your companies. Live approvals require a signed-in workspace connection.';
    if (live && !primed) setTimeout(() => refresh({ silent: true }), 0);
    return `
      <div class="apv-inbox" id="apvInbox">
        <div class="apv-head panel-card">
          <div class="apv-head-title">${ic('approvals')}<div><h2>Approvals Inbox</h2><p>${esc(intro)}</p></div></div>
          ${live ? `<button type="button" class="btn btn-ghost-bar" data-apv-refresh="1">${ic('rotate')} Refresh</button>` : ''}
        </div>
        ${(live || isDemo) && approverGate ? renderGateSuggestions() : ''}
        ${live && approver ? renderRequests() : ''}
        ${(live || isDemo) ? renderMyGateSuggestions() : ''}
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
      const gDec = e.target.closest('[data-apv-gate-decide]');
      if (gDec) { decideGatePin(gDec.getAttribute('data-apv-gate-id'), gDec.getAttribute('data-apv-gate-decide'), gDec); return; }
      const gCan = e.target.closest('[data-apv-gate-cancel]');
      if (gCan) { cancelGatePin(gCan.getAttribute('data-apv-gate-cancel'), gCan); return; }
      const gMap = e.target.closest('[data-apv-gate-map]');
      if (gMap) {
        const gid = gMap.getAttribute('data-apv-gate-map');
        const all = demoGateList().concat(gatePending, gateMine);
        const item = all.find(x => x && x.id === gid);
        if (item && window.MFG_GEO && typeof window.MFG_GEO.focusGeoAuditOnMap === 'function') {
          window.MFG_GEO.focusGeoAuditOnMap({
            action: 'gate_pin_promoted',
            outcome: 'applied',
            industry: item.industry,
            company: item.company,
            target_label: item.site_name || item.site_id,
            prev_lat: item.existing_lat,
            prev_lng: item.existing_lng,
            next_lat: item.suggested_lat,
            next_lng: item.suggested_lng,
            shift_meters: item.shift_meters
          });
        }
        return;
      }
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
      const onInbox = D && D.STATE && D.STATE.view === 'approvals';
      if (document.visibilityState === 'visible' && serverReady() && (canApprove() || canApproveGatePins() || onInbox)) refresh({ silent: false });
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
    gatePending = [];
    gateMine = [];
    for (const m of _apvGateMaps.values()) { try { m.remove(); } catch (_) {} }
    _apvGateMaps.clear();
    primed = false;
    lastSig = '';
    seenIds = new Set();
    hideLiveCard();
    if (D && D.refreshNavBadges) D.refreshNavBadges();
    if (serverReady()) refresh({ silent: true, noRender: true });
  }

  window.MFG_APPROVALS = { init, reset, renderView, canApprove, canApproveGatePins, pendingRequestCount, requestOverride, cancelRequest, cancelActive, refresh };
})();
