/* ============================================================================
   ISABI Systems - Saved table views per seat (js/saved_views.js)
   A "Views" control beside each table's "Columns" button saves the current column filters, sort,
   search text and column layout under a name, and brings them back in one tap. Column changes stay
   temporary by default (js/table_columns.js); a saved view is the explicit way to keep a layout.
   - Per seat and per table (key = view + table id); listed by how often the seat uses each view
     (most used first, hard rule 11), then by most recent use.
   - Stored on the server per seat (`./api/saved-views`) with a local copy so the list opens instantly
     and works offline; a view saved offline is sent on the next successful load.
   - Demo sandbox and Demo Company keep views in this browser tab only (no server calls).
   window.MFG_SAVED_VIEWS = { init, mount, reset, list }
   ============================================================================ */
(function () {
  'use strict';

  const API = './api/saved-views';
  const LS_PREFIX = 'isabi_saved_views_v1_';
  const MAX_PER_TABLE = 30;

  let D = null;
  let gen = 0;
  let views = [];
  let loadedFor = '';
  let loading = null;
  let openKey = '';

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ICON = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 2.5h9v11l-4.5-3-4.5 3z"/></svg>';

  function seatId() {
    const u = D && D.activeUser ? D.activeUser() : null;
    return String((u && u.id) || 'anon');
  }

  function demoScope() { return Boolean(D && D.isDemoScopeActive()); }
  function serverReady() { return Boolean(D && D.STATE && D.STATE.authed && D.hasServerApi() && !demoScope()); }

  function storeKey() { return LS_PREFIX + seatId(); }

  function readLocal() {
    try {
      const raw = demoScope() ? sessionStorage.getItem('demo_sbx_' + storeKey()) : localStorage.getItem(storeKey());
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(v => v && v.id && v.table_key) : [];
    } catch (_) { return []; }
  }

  // Where the current list lives: fixed when it is loaded, so a late write never lands in another seat's key.
  let listKey = null;
  function currentStoreRef() { return { demo: demoScope(), key: storeKey() }; }
  function writeLocal(ref) {
    const r = ref || listKey || currentStoreRef();
    try {
      const raw = JSON.stringify(views);
      if (r.demo) sessionStorage.setItem('demo_sbx_' + r.key, raw);
      else localStorage.setItem(r.key, raw);
    } catch (_) { /* storage full or blocked: the server copy still holds the views */ }
  }

  async function apiJson(opts) {
    const res = await D.edgeApiFetch(API, opts);
    let j = null;
    try { j = res ? await res.json() : null; } catch (_) { j = null; }
    return { res, j: j || {} };
  }

  async function post(body) {
    return apiJson({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  // Load once per seat: local copy first, then the server list; local-only views are pushed up.
  function ensureLoaded() {
    const who = seatId() + (demoScope() ? ':demo' : '');
    if (loadedFor === who) return loading || Promise.resolve();
    loadedFor = who;
    gen += 1;
    const g = gen;
    const ref = currentStoreRef();
    listKey = ref;
    views = readLocal();
    if (!serverReady()) { loading = null; return Promise.resolve(); }
    loading = (async () => {
      try {
        const { res, j } = await apiJson({ method: 'GET' });
        if (g !== gen || !(res && res.ok && Array.isArray(j.views))) return;
        const localOnly = views.filter(v => v._local);
        const next = j.views.map(v => Object.assign({}, v));
        for (const lv of localOnly) {
          if (g !== gen) return;
          const r = await post({ op: 'save', table_key: lv.table_key, name: lv.name, payload: lv.payload });
          if (g !== gen) return;
          // A view the server refuses (limit reached, offline again) stays on this device.
          next.push(r.res && r.res.ok && r.j.view ? r.j.view : lv);
        }
        views = next;
        writeLocal(ref);
      } catch (_) { /* offline: keep the local copy */ } finally {
        if (g === gen) loading = null;
      }
    })();
    return loading;
  }

  function list(tableKey) {
    return views
      .filter(v => v.table_key === tableKey)
      .sort((a, b) => (Number(b.use_count || 0) - Number(a.use_count || 0))
        || String(b.last_used_at || '').localeCompare(String(a.last_used_at || ''))
        || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }

  // A stable identity for the table: its own id, else the view its sortable headers belong to, else the
  // column-manager id without numbers (panel titles can carry live counts such as "3 pending").
  function tableKeyFor(table, tableId) {
    const v = (D && D.STATE && D.STATE.view) || 'view';
    const sortTh = table && table.querySelector('thead th[data-sort-view]');
    const base = (table && table.id) ? `id_${table.id}`
      : (sortTh ? `sv_${sortTh.getAttribute('data-sort-view')}` : String(tableId || '').replace(/_?\d+/g, ''));
    return `${v}::${base}`.slice(0, 80).replace(/[^A-Za-z0-9_.:\-]/g, '_');
  }

  function capture(table) {
    const st = D.STATE;
    const view = st.view;
    const cf = (st.colFilters && st.colFilters[view]) || {};
    const filters = {};
    Object.keys(cf).forEach(k => { if (cf[k] && String(cf[k]).trim()) filters[k] = String(cf[k]); });
    const sort = st.sortBy && st.sortBy[view] && st.sortBy[view].key ? { key: st.sortBy[view].key, dir: st.sortBy[view].dir === 'asc' ? 'asc' : 'desc' } : null;
    const cols = window.MFG_TABLE_COLS && window.MFG_TABLE_COLS.exportLayout ? window.MFG_TABLE_COLS.exportLayout(table) : null;
    return { v: 1, view, search: String(st.search || ''), filters, sort, cols };
  }

  // Composed phrases are localized here; their elements carry data-no-i18n.
  function lang() {
    try { return (window.MFG_I18N && window.MFG_I18N.getLang()) || 'en'; } catch (_) { return 'en'; }
  }
  function L(en, ar, fr) { const lc = lang(); return lc === 'ar' ? ar : (lc === 'fr' ? fr : en); }

  function describe(p) {
    const bits = [];
    const nf = p && p.filters ? Object.keys(p.filters).length : 0;
    if (nf) bits.push(L(nf === 1 ? '1 filter' : `${nf} filters`, `${nf} عوامل تصفية`, nf === 1 ? '1 filtre' : `${nf} filtres`));
    if (p && p.sort) bits.push(L('sorted', 'مرتّب', 'trié'));
    if (p && p.search) bits.push(L('search', 'بحث', 'recherche'));
    const nh = p && p.cols && Array.isArray(p.cols.hidden) ? p.cols.hidden.length : 0;
    if (nh) bits.push(L(nh === 1 ? '1 hidden column' : `${nh} hidden columns`, `${nh} أعمدة مخفية`, nh === 1 ? '1 colonne masquée' : `${nh} colonnes masquées`));
    return bits.join(' · ') || L('Default layout', 'التخطيط الافتراضي', 'Disposition par défaut');
  }

  function applyView(v, table) {
    const p = v && v.payload;
    if (!p || typeof p !== 'object') return;
    const st = D.STATE;
    const view = st.view;
    if (!st.colFilters) st.colFilters = {};
    st.colFilters[view] = Object.assign({}, p.filters || {});
    if (p.sort && p.sort.key) st.sortBy[view] = { key: p.sort.key, dir: p.sort.dir === 'asc' ? 'asc' : 'desc' };
    else delete st.sortBy[view];
    st.search = String(p.search || '');
    if (p.cols && window.MFG_TABLE_COLS && window.MFG_TABLE_COLS.importLayout) {
      window.MFG_TABLE_COLS.importLayout(table, p.cols);
    }
    markUsed(v);
    closePopover();
    D.render();
    D.toast(L(`View "${v.name}" applied`, `تم تطبيق العرض "${v.name}"`, `Vue « ${v.name} » appliquée`), 'ok');
  }

  function markUsed(v) {
    v.use_count = Number(v.use_count || 0) + 1;
    v.last_used_at = new Date().toISOString();
    writeLocal();
    if (serverReady() && !v._local) post({ op: 'used', id: v.id }).catch(() => {});
  }

  async function saveCurrent(table, tableKey, name) {
    const nm = String(name || '').trim().slice(0, 60);
    if (!nm) { D.toast('Give the view a name first', 'err'); return; }
    const payload = capture(table);
    const existing = list(tableKey).find(v => String(v.name).toLowerCase() === nm.toLowerCase());
    if (!existing && list(tableKey).length >= MAX_PER_TABLE) {
      D.toast(L(`This table already has ${MAX_PER_TABLE} saved views. Delete one first.`, `يحتوي هذا الجدول على ${MAX_PER_TABLE} عرضاً محفوظاً. احذف واحداً أولاً.`, `Ce tableau a déjà ${MAX_PER_TABLE} vues enregistrées. Supprimez-en une d'abord.`), 'err');
      return;
    }
    const savedMsg = L(`View "${nm}" saved`, `تم حفظ العرض "${nm}"`, `Vue « ${nm} » enregistrée`);
    const now = new Date().toISOString();
    const g = gen;
    if (serverReady()) {
      try {
        const { res, j } = await post({ op: 'save', id: existing && !existing._local ? existing.id : undefined, table_key: tableKey, name: nm, payload });
        if (g !== gen) return;
        if (res && res.ok && j.view) {
          views = views.filter(v => v.id !== j.view.id && !(existing && v.id === existing.id));
          views.push(j.view);
          writeLocal();
          D.toast(savedMsg, 'ok');
          refreshPopover(table, tableKey);
          return;
        }
        if (res && res.status >= 400 && res.status < 500) { D.toast(j.error || 'The view could not be saved', 'err'); return; }
      } catch (_) { /* fall through to the local copy */ }
    }
    if (existing) {
      Object.assign(existing, { payload, updated_at: now });
    } else {
      views.push({ id: `lsv-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`, table_key: tableKey, name: nm, payload, use_count: 0, last_used_at: '', created_at: now, updated_at: now, _local: !demoScope() });
    }
    writeLocal();
    D.toast(serverReady() || demoScope() ? savedMsg : L(`View "${nm}" saved on this device; it will sync when online`, `تم حفظ العرض "${nm}" على هذا الجهاز وسيُزامَن عند الاتصال`, `Vue « ${nm} » enregistrée sur cet appareil ; synchronisation au retour en ligne`), 'ok');
    refreshPopover(table, tableKey);
  }

  async function removeView(id, table, tableKey) {
    const v = views.find(x => x.id === id);
    if (!v) return;
    views = views.filter(x => x.id !== id);
    writeLocal();
    if (serverReady() && !v._local) post({ op: 'delete', id }).catch(() => {});
    refreshPopover(table, tableKey);
  }

  function popoverHtml(tableKey) {
    const rows = list(tableKey);
    return `
      <div class="sv-pop-hd">${ICON}<strong>Saved Views</strong></div>
      ${rows.length ? `<div class="sv-list" role="list">${rows.map(v => `
        <div class="sv-item" role="listitem">
          <button type="button" class="sv-apply" data-sv-apply="${esc(v.id)}" data-no-i18n="1">
            <span class="sv-name">${esc(v.name)}</span><span class="sv-desc">${esc(describe(v.payload))}</span>
          </button>
          <button type="button" class="sv-del" data-sv-del="${esc(v.id)}" aria-label="Delete this view" data-ui-tip="Delete this view">✕</button>
        </div>`).join('')}</div>` : '<div class="sv-empty">No saved views for this table yet.</div>'}
      <form class="sv-save" data-sv-save="1">
        <input type="text" class="sv-name-input" maxlength="60" placeholder="Name this view" aria-label="Name this view" autocomplete="off">
        <button type="submit" class="btn btn-primary">Save Current</button>
      </form>
      <div class="sv-hint">Saves the filters, sort, search and columns shown now.</div>`;
  }

  function closePopover() {
    document.querySelectorAll('.sv-pop').forEach(p => { p.hidden = true; });
    document.querySelectorAll('.sv-trigger-btn').forEach(b => b.setAttribute('aria-expanded', 'false'));
    openKey = '';
  }

  function refreshPopover(table, tableKey) {
    const pop = document.querySelector(`.sv-pop[data-sv-key="${CSS.escape(tableKey)}"]`);
    if (pop && !pop.hidden) pop.innerHTML = popoverHtml(tableKey);
  }

  // Called by table_columns.js each time it builds the toolbar control for a table.
  function mount(mgrWrap, table, tableId) {
    if (!D || !mgrWrap || !table || mgrWrap.querySelector('.sv-wrap')) return;
    if (D.STATE && D.STATE.kioskLocked) return;
    const tableKey = tableKeyFor(table, tableId);
    const wrap = document.createElement('div');
    wrap.className = 'sv-wrap';
    wrap.innerHTML = `
      <button type="button" class="btn btn-ghost-bar sv-trigger-btn" aria-haspopup="dialog" aria-expanded="false" data-ui-tip="Save or reuse a layout of filters, sort and columns" aria-label="Saved views">${ICON}<span class="sv-btn-lbl">Views</span></button>
      <div class="sv-pop" data-sv-key="${esc(tableKey)}" role="dialog" aria-label="Saved views" hidden></div>`;
    const trig = wrap.querySelector('.sv-trigger-btn');
    const pop = wrap.querySelector('.sv-pop');
    trig.addEventListener('click', async e => {
      e.stopPropagation();
      const willOpen = pop.hidden;
      closePopover();
      if (!willOpen) return;
      await ensureLoaded();
      openKey = tableKey;
      pop.innerHTML = popoverHtml(tableKey);
      pop.hidden = false;
      trig.setAttribute('aria-expanded', 'true');
    });
    pop.addEventListener('click', e => {
      e.stopPropagation();
      const ap = e.target.closest('[data-sv-apply]');
      if (ap) { const v = views.find(x => x.id === ap.getAttribute('data-sv-apply')); if (v) applyView(v, table); return; }
      const del = e.target.closest('[data-sv-del]');
      if (del) removeView(del.getAttribute('data-sv-del'), table, tableKey);
    });
    pop.addEventListener('submit', e => {
      e.preventDefault();
      e.stopPropagation();
      const inp = pop.querySelector('.sv-name-input');
      saveCurrent(table, tableKey, inp ? inp.value : '');
    });
    const colTrig = mgrWrap.querySelector('.tbl-col-trigger-btn');
    if (colTrig) mgrWrap.insertBefore(wrap, colTrig);
    else mgrWrap.appendChild(wrap);
    if (openKey === tableKey) { pop.innerHTML = popoverHtml(tableKey); pop.hidden = false; trig.setAttribute('aria-expanded', 'true'); }
  }

  function wireGlobalOnce() {
    if (document.body.dataset.svWired === '1') return;
    document.body.dataset.svWired = '1';
    document.addEventListener('click', e => { if (openKey && !e.target.closest('.sv-wrap')) closePopover(); });
    // Escape closes only the open popover, not the form or drawer behind it.
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && openKey) { e.preventDefault(); e.stopPropagation(); closePopover(); } }, true);
  }

  function init(deps) {
    D = deps;
    wireGlobalOnce();
    window.addEventListener('mfg:auth-gate-closed', () => reset());
  }

  // Sign-in, sign-out or switching into / out of the Demo Company: reload for the new seat or scope.
  function reset() {
    gen += 1;
    views = [];
    loadedFor = '';
    loading = null;
    listKey = null;
    closePopover();
  }

  window.MFG_SAVED_VIEWS = { init, mount, reset, list: tableKey => list(tableKey), _ensureLoaded: () => ensureLoaded() };
})();
