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
  const MAX_PINNED_PER_TABLE = 6;

  let D = null;
  let gen = 0;
  let views = [];
  let loadedFor = '';
  let loading = null;
  let openKey = '';
  const savingTables = new Map();
  const pinSeqById = new Map();

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ICON = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 2.5h9v11l-4.5-3-4.5 3z"/></svg>';
  const PIN_ICON = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';
  const TRASH_ICON = '<svg class="ic" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6h17M8.5 6V4a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 4v2M18.5 6v13a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6M10 10.5v6M14 10.5v6"/></svg>';

  function seatId() {
    const u = D && D.activeUser ? D.activeUser() : null;
    return String((u && u.id) || 'anon');
  }

  function demoScope() { return Boolean(D && D.isDemoScopeActive()); }
  function demoIndustrySuffix() {
    if (!demoScope()) return '';
    const ind = String((D && D.STATE && D.STATE.demoCompanyIndustry) || '').trim();
    return ind ? ('__' + ind.replace(/[^A-Za-z0-9_-]/g, '_')) : '__default';
  }
  function loadedWho() { return seatId() + (demoScope() ? (':demo' + demoIndustrySuffix()) : ''); }
  function serverReady() { return Boolean(D && D.STATE && D.STATE.authed && D.hasServerApi() && !demoScope()); }

  function storeKey() { return LS_PREFIX + seatId() + demoIndustrySuffix(); }

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

  function hydrateLocalSync() {
    const who = loadedWho();
    if (loadedFor === who) return false;
    loadedFor = who;
    gen += 1;
    listKey = currentStoreRef();
    views = readLocal();
    loading = null;
    return true;
  }

  // Load once per seat: local copy first, then the server list; local-only views are pushed up.
  function ensureLoaded() {
    const who = loadedWho();
    const changed = loadedFor !== who;
    if (!changed && loading) return loading;
    if (!changed && !serverReady()) return Promise.resolve();
    if (!changed && loadedFor === who && ensureLoaded._syncedFor === who) return Promise.resolve();
    hydrateLocalSync();
    const g = gen;
    const ref = listKey || currentStoreRef();
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
        ensureLoaded._syncedFor = who;
        writeLocal(ref);
        refreshAllPinnedStrips();
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

  function pinnedList(tableKey) {
    return list(tableKey).filter(v => v && v.payload && v.payload.pinned).slice(0, MAX_PINNED_PER_TABLE);
  }

  // Resolve the table's own sort/filter view key (`data-sort-view`, e.g. `ureg_staff_members`, `pay_emp`, `re_leases`)
  // before falling back to `STATE.view` so Saved Views work identically on multi-table views and registries.
  function resolveTableCfView(table) {
    const sortTh = table && table.querySelector('thead th[data-sort-view]');
    const sv = sortTh ? String(sortTh.getAttribute('data-sort-view') || '').trim() : '';
    if (sv) return sv;
    const panel = table && table.closest ? table.closest('.panel-card, .panel') : null;
    if (panel && panel.id && D && typeof D.panelToCfView === 'function') {
      const mapped = D.panelToCfView(panel.id);
      if (mapped) return mapped;
    }
    return String((D && D.STATE && D.STATE.view) || '');
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

  function capture(table, keepPinned) {
    const st = D.STATE;
    const cfView = resolveTableCfView(table) || st.view;
    const cf = (st.colFilters && st.colFilters[cfView]) || {};
    const filters = {};
    Object.keys(cf).forEach(k => { if (cf[k] && String(cf[k]).trim()) filters[k] = String(cf[k]); });
    const sort = st.sortBy && st.sortBy[cfView] && st.sortBy[cfView].key ? { key: st.sortBy[cfView].key, dir: st.sortBy[cfView].dir === 'asc' ? 'asc' : 'desc' } : null;
    const cols = window.MFG_TABLE_COLS && window.MFG_TABLE_COLS.exportLayout ? window.MFG_TABLE_COLS.exportLayout(table) : null;
    const out = { v: 1, view: st.view, search: String(st.search || ''), filters, sort, cols };
    if (cfView && cfView !== st.view) out.cfView = cfView;
    if (keepPinned) out.pinned = true;
    return out;
  }

  // Composed phrases are localized here; their elements carry data-no-i18n.
  function lang() {
    try { return (window.MFG_I18N && window.MFG_I18N.getLang()) || 'en'; } catch (_) { return 'en'; }
  }
  function L(en, ar, fr) { const lc = lang(); return lc === 'ar' ? ar : (lc === 'fr' ? fr : en); }

  function normalizeFilterMap(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.keys(obj).forEach(k => {
      const val = String(obj[k] == null ? '' : obj[k]).trim();
      if (val) out[k] = val;
    });
    return out;
  }

  function hasCustomCols(c) {
    if (!c || typeof c !== 'object') return false;
    return Boolean(
      (Array.isArray(c.hidden) && c.hidden.length)
      || (Array.isArray(c.shown) && c.shown.length)
      || (c.widths && typeof c.widths === 'object' && Object.keys(c.widths).length)
      || (Array.isArray(c.hiddenIdx) && c.hiddenIdx.length)
      || (Array.isArray(c.shownIdx) && c.shownIdx.length)
      || (c.widthsIdx && typeof c.widthsIdx === 'object' && Object.keys(c.widthsIdx).length)
    );
  }

  function sortedIdxSig(arr) {
    return (Array.isArray(arr) ? arr : []).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  }

  function sortedStrSig(arr) {
    return (Array.isArray(arr) ? arr : []).map(s => String(s || '')).filter(Boolean).sort();
  }

  function sortedObjSig(obj) {
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj).sort().map(k => [String(k), Number(obj[k]) || 0]);
  }

  function colsEqual(savedCols, curCols) {
    if (!savedCols || !curCols) return false;
    if (Number(savedCols.n) > 0 && Number(savedCols.n) === Number(curCols.n)
      && (Array.isArray(savedCols.hiddenIdx) || Array.isArray(savedCols.shownIdx) || savedCols.widthsIdx)) {
      return JSON.stringify(sortedIdxSig(savedCols.hiddenIdx)) === JSON.stringify(sortedIdxSig(curCols.hiddenIdx))
        && JSON.stringify(sortedIdxSig(savedCols.shownIdx)) === JSON.stringify(sortedIdxSig(curCols.shownIdx))
        && JSON.stringify(sortedObjSig(savedCols.widthsIdx)) === JSON.stringify(sortedObjSig(curCols.widthsIdx));
    }
    return JSON.stringify(sortedStrSig(savedCols.hidden)) === JSON.stringify(sortedStrSig(curCols.hidden))
      && JSON.stringify(sortedStrSig(savedCols.shown)) === JSON.stringify(sortedStrSig(curCols.shown))
      && JSON.stringify(sortedObjSig(savedCols.widths)) === JSON.stringify(sortedObjSig(curCols.widths));
  }

  function isSavedViewActive(v, table, cfView) {
    const p = v && v.payload;
    if (!p || typeof p !== 'object') return false;
    const st = D && D.STATE;
    if (!st) return false;
    const targetView = cfView || resolveTableCfView(table) || p.cfView || st.view;
    if ((targetView === 'pay_site_daily' || targetView === 'pay_log') && st.siteAllowStaffFilter && String(st.siteAllowStaffFilter).trim()) return false;
    if (st.chipFilter && st.chipFilter !== 'all') return false;
    if (targetView === 'pay_staff' && st.payrollStaffStatus && st.payrollStaffStatus !== 'all') return false;
    if (st.permitWatchdogTier && st.permitWatchdogTier !== 'all') return false;
    const activePanel = table && table.closest ? table.closest('.panel-card, .panel') : null;
    if (st.regDrill && ((targetView && st.regDrill[targetView]) || (activePanel && activePanel.id && st.regDrill[activePanel.id]))) return false;
    const vf = normalizeFilterMap(p.filters);
    const cf = normalizeFilterMap(st.colFilters && st.colFilters[targetView]);
    const vk = Object.keys(vf);
    const ck = Object.keys(cf);
    if (vk.length !== ck.length) return false;
    for (let i = 0; i < vk.length; i++) {
      if (cf[vk[i]] !== vf[vk[i]]) return false;
    }
    const ps = String(p.search || '').trim();
    const cs = String(st.search || '').trim();
    if (ps !== cs) return false;
    const hasSort = Boolean(p.sort && p.sort.key);
    const hasCols = hasCustomCols(p.cols);
    if (!vk.length && !ps && !hasSort && !hasCols) return false;
    if (hasSort) {
      const curSort = st.sortBy && st.sortBy[targetView];
      if (!curSort || curSort.key !== p.sort.key || curSort.dir !== p.sort.dir) return false;
    }
    if (hasCols) {
      if (!window.MFG_TABLE_COLS || typeof window.MFG_TABLE_COLS.exportLayout !== 'function') return false;
      const curCols = window.MFG_TABLE_COLS.exportLayout(table);
      if (!colsEqual(p.cols, curCols)) return false;
    }
    return true;
  }

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

  function applyView(v, table, opts) {
    const p = v && v.payload;
    if (!p || typeof p !== 'object') return;
    const st = D.STATE;
    const cfView = resolveTableCfView(table) || p.cfView || st.view;
    if (!st.colFilters) st.colFilters = {};
    if (opts && opts.toggleOffIfActive && isSavedViewActive(v, table, cfView)) {
      if (p.filters && Object.keys(p.filters).length) st.colFilters[cfView] = {};
      if (p.search && String(p.search).trim()) st.search = '';
      if (p.sort && p.sort.key && st.sortBy) delete st.sortBy[cfView];
      if (hasCustomCols(p.cols) && window.MFG_TABLE_COLS) {
        if (typeof window.MFG_TABLE_COLS.resetTableToDefault === 'function') {
          window.MFG_TABLE_COLS.resetTableToDefault(table);
        } else if (typeof window.MFG_TABLE_COLS.importLayout === 'function') {
          window.MFG_TABLE_COLS.importLayout(table, { hidden: [], shown: [], widths: {} });
        }
      }
      if (st.shown) st.shown = {};
      closePopover();
      D.render();
      D.toast(L(`View "${v.name}" cleared`, `تم مسح العرض "${v.name}"`, `Vue « ${v.name} » effacée`), 'ok');
      return;
    }
    st.colFilters[cfView] = Object.assign({}, p.filters || {});
    if (p.sort && p.sort.key) st.sortBy[cfView] = { key: p.sort.key, dir: p.sort.dir === 'asc' ? 'asc' : 'desc' };
    else delete st.sortBy[cfView];
    st.search = String(p.search || '');
    if (st.chipFilter && st.chipFilter !== 'all') st.chipFilter = 'all';
    if (cfView === 'pay_staff' && st.payrollStaffStatus && st.payrollStaffStatus !== 'all') st.payrollStaffStatus = 'all';
    if ((cfView === 'pay_site_daily' || cfView === 'pay_log' || cfView === 'pay_site_staff') && st.siteAllowStaffFilter) st.siteAllowStaffFilter = '';
    if (st.permitWatchdogTier) st.permitWatchdogTier = '';
    if (st.cfFocusParty) st.cfFocusParty = '';
    if (st.indDrawerFilters) {
      if (cfView && st.indDrawerFilters[cfView]) delete st.indDrawerFilters[cfView];
      if (st.view && st.indDrawerFilters[st.view]) delete st.indDrawerFilters[st.view];
      if ((cfView === 'hld_extd_entries' || cfView === 'hld_extd_parties') && st.indDrawerFilters.hld_extended) delete st.indDrawerFilters.hld_extended;
    }
    if (st.indAssetFilter && typeof st.indAssetFilter === 'object') {
      Object.keys(st.indAssetFilter).forEach(k => {
        if (k === cfView || k === st.view || (k === 're_props' && /^(?:re_properties|re_units|re_valuations|re_ownership)$/.test(String(cfView || '')))
          || (k === 're_leases' && /^(?:re_leases|re_invoicing|re_receipts)$/.test(String(cfView || '')))
          || (k === 'hsp_resorts' && /^hsp_/.test(String(cfView || '')))
          || (k === 'trd_lines' && /^trd_/.test(String(cfView || '')))
          || (k === 'hld_extended' && /^hld_extd_/.test(String(cfView || '')))) {
          st.indAssetFilter[k] = 'ALL';
        }
      });
    }
    const panel = table && table.closest ? table.closest('.panel-card, .panel') : null;
    if (st.regDrill && cfView && st.regDrill[cfView]) delete st.regDrill[cfView];
    if (st.regDrill && panel && panel.id && st.regDrill[panel.id]) delete st.regDrill[panel.id];
    if (p.cols && window.MFG_TABLE_COLS && window.MFG_TABLE_COLS.importLayout) {
      window.MFG_TABLE_COLS.importLayout(table, p.cols);
    }
    if (st.shown) st.shown = {};
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

  async function saveCurrent(table, tableKey, name, pinRequested, submitBtn) {
    const lockKey = `${gen}::${tableKey}`;
    if (savingTables.has(lockKey)) return;
    let nm = String(name || '').trim().slice(0, 60);
    if (!nm && pinRequested && D && typeof D.suggestFilterViewName === 'function') {
      nm = String(D.suggestFilterViewName(resolveTableCfView(table), table) || '').trim().slice(0, 60);
    }
    if (!nm) { D.toast('Give the view a name first', 'err'); return; }
    const existing = list(tableKey).find(v => String(v.name).toLowerCase() === nm.toLowerCase());
    const wantPinned = Boolean(pinRequested || (existing && existing.payload && existing.payload.pinned));
    const wantNewPin = Boolean(wantPinned && !(existing && existing.payload && existing.payload.pinned));
    if (wantNewPin) {
      const curPinned = list(tableKey).filter(v => {
        if (existing && v.id === existing.id) return false;
        const trk = pinSeqById.get(v.id);
        return Boolean((v.payload && v.payload.pinned) || (trk && trk.basePayload && trk.basePayload.pinned));
      }).length;
      if (curPinned >= MAX_PINNED_PER_TABLE) {
        D.toast(L(`You can pin at most ${MAX_PINNED_PER_TABLE} smart pills per table.`, `يمكن تثبيت ${MAX_PINNED_PER_TABLE} فلاتر كحد أقصى لهذا الجدول.`, `Maximum ${MAX_PINNED_PER_TABLE} filtres épinglés par tableau.`), 'err');
        return;
      }
    }
    const payload = capture(table, wantPinned);
    if (!existing && list(tableKey).length >= MAX_PER_TABLE) {
      D.toast(L(`This table already has ${MAX_PER_TABLE} saved views. Delete one first.`, `يحتوي هذا الجدول على ${MAX_PER_TABLE} عرضاً محفوظاً. احذف واحداً أولاً.`, `Ce tableau a déjà ${MAX_PER_TABLE} vues enregistrées. Supprimez-en une d'abord.`), 'err');
      return;
    }
    const savedMsg = L(`View "${nm}" saved`, `تم حفظ العرض "${nm}"`, `Vue « ${nm} » enregistrée`);
    const now = new Date().toISOString();
    const g = gen;
    if (existing) pinSeqById.delete(existing.id);
    savingTables.set(lockKey, { wantNewPin });
    if (submitBtn) submitBtn.disabled = true;
    try {
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
            refreshAllPinnedStrips();
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
      refreshAllPinnedStrips();
    } finally {
      savingTables.delete(lockKey);
      if (submitBtn && submitBtn.isConnected) submitBtn.disabled = false;
    }
  }

  async function togglePin(id, table, tableKey) {
    const v = views.find(x => x.id === id);
    if (!v) return;
    const nextPinned = !(v.payload && v.payload.pinned);
    if (nextPinned) {
      const curPinned = list(tableKey).filter(x => {
        if (x.id === id) return false;
        const trk = pinSeqById.get(x.id);
        return Boolean((x.payload && x.payload.pinned) || (trk && trk.basePayload && trk.basePayload.pinned));
      }).length;
      const pendingPin = savingTables.get(`${gen}::${tableKey}`)?.wantNewPin ? 1 : 0;
      if (curPinned + pendingPin >= MAX_PINNED_PER_TABLE) {
        D.toast(L(`You can pin at most ${MAX_PINNED_PER_TABLE} smart pills per table.`, `يمكن تثبيت ${MAX_PINNED_PER_TABLE} فلاتر كحد أقصى لهذا الجدول.`, `Maximum ${MAX_PINNED_PER_TABLE} filtres épinglés par tableau.`), 'err');
        return;
      }
    }
    const prevPayload = v.payload;
    const prevUpdated = v.updated_at;
    const nextPayload = Object.assign({}, v.payload || {});
    if (nextPinned) nextPayload.pinned = true;
    else delete nextPayload.pinned;
    v.payload = nextPayload;
    v.updated_at = new Date().toISOString();
    writeLocal();
    refreshPopover(table, tableKey);
    refreshAllPinnedStrips();
    D.toast(nextPinned
      ? L(`Pinned "${v.name}" beside Views`, `تم تثبيت "${v.name}" بجانب العروض`, `« ${v.name} » épinglé près de Vues`)
      : L(`Unpinned "${v.name}"`, `تم إلغاء تثبيت "${v.name}"`, `« ${v.name} » désépinglé`), 'ok');
    if (serverReady() && !v._local) {
      const g = gen;
      const prevTrack = pinSeqById.get(id);
      const seq = (prevTrack ? prevTrack.seq : 0) + 1;
      const track = {
        seq,
        basePayload: prevTrack ? prevTrack.basePayload : prevPayload,
        baseUpdated: prevTrack ? prevTrack.baseUpdated : prevUpdated
      };
      pinSeqById.set(id, track);
      try {
        const { res, j } = await post({ op: 'save', id: v.id, table_key: v.table_key, name: v.name, payload: nextPayload });
        if (g !== gen) return;
        const curTrack = pinSeqById.get(id);
        if (!curTrack) return;
        if (res && res.ok && j && j.view) {
          curTrack.basePayload = j.view.payload;
          curTrack.baseUpdated = j.view.updated_at;
          if (curTrack.seq !== seq) return;
          pinSeqById.delete(id);
          views = views.map(x => (x.id === v.id ? j.view : x));
          writeLocal();
          refreshPopover(table, tableKey);
          refreshAllPinnedStrips();
        } else {
          if (curTrack.seq !== seq) return;
          pinSeqById.delete(id);
          if (res && res.status >= 400 && res.status < 500) {
            v.payload = curTrack.basePayload;
            v.updated_at = curTrack.baseUpdated;
            writeLocal();
            refreshPopover(table, tableKey);
            refreshAllPinnedStrips();
            D.toast((j && j.error) || 'The view could not be updated', 'err');
          }
        }
      } catch (_) {
        if (g === gen && pinSeqById.get(id)?.seq === seq) pinSeqById.delete(id);
      }
    }
  }

  async function removeView(id, table, tableKey) {
    const v = views.find(x => x.id === id);
    if (!v) return;
    pinSeqById.delete(id);
    views = views.filter(x => x.id !== id);
    writeLocal();
    if (serverReady() && !v._local) post({ op: 'delete', id }).catch(() => {});
    refreshPopover(table, tableKey);
    refreshAllPinnedStrips();
  }

  function popoverHtml(tableKey) {
    const rows = list(tableKey);
    return `
      <div class="sv-pop-hd">${ICON}<strong>Saved Views</strong></div>
      ${rows.length ? `<div class="sv-list" role="list">${rows.map(v => {
        const isPinned = Boolean(v.payload && v.payload.pinned);
        const pinTip = isPinned ? 'Unpin from toolbar' : 'Pin beside Views with live count';
        return `
        <div class="sv-item" role="listitem">
          <button type="button" class="sv-apply" data-sv-apply="${esc(v.id)}" data-no-i18n="1">
            <span class="sv-name">${esc(v.name)}</span><span class="sv-desc">${esc(describe(v.payload))}</span>
          </button>
          <button type="button" class="sv-pin${isPinned ? ' is-pinned' : ''}" data-sv-pin="${esc(v.id)}" aria-pressed="${isPinned ? 'true' : 'false'}" aria-label="${pinTip}" data-ui-tip="${pinTip}">${PIN_ICON}</button>
          <button type="button" class="sv-del" data-sv-del="${esc(v.id)}" aria-label="Delete this view" data-ui-tip="Delete this view">${window.ic ? window.ic('trash') : TRASH_ICON}</button>
        </div>`;
      }).join('')}</div>` : '<div class="sv-empty">No saved views for this table yet.</div>'}
      <form class="sv-save" data-sv-save="1">
        <input type="text" class="sv-name-input" maxlength="60" placeholder="Name this view" aria-label="Name this view" autocomplete="off">
        <button type="button" class="sv-save-pin-toggle" data-sv-save-pin-toggle="1" aria-pressed="false" aria-label="Pin beside Views" data-ui-tip="Pin beside Views with live count">${PIN_ICON}</button>
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
    if (pop && !pop.hidden) {
      pop.innerHTML = popoverHtml(tableKey);
      if (window.MFG_I18N && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en' && typeof window.MFG_I18N.translateDom === 'function') {
        window.MFG_I18N.translateDom(pop);
      }
    }
  }

  function renderPinnedStripForWrap(mgrWrap, table, tableKey) {
    if (!D || !mgrWrap || !table) return;
    const pinnedRows = pinnedList(tableKey);
    const svWrap = mgrWrap.querySelector(':scope > .sv-wrap');
    let strip = mgrWrap.querySelector(':scope > .sv-pinned-strip');
    if (!pinnedRows.length) {
      if (strip) strip.remove();
      return;
    }
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'sv-pinned-strip';
      strip.setAttribute('data-sv-pinned-for', tableKey);
      if (svWrap) mgrWrap.insertBefore(strip, svWrap);
      else mgrWrap.appendChild(strip);
    } else {
      strip.setAttribute('data-sv-pinned-for', tableKey);
    }
    const cfView = resolveTableCfView(table);
    strip.innerHTML = pinnedRows.map(v => {
      const targetView = cfView || (v.payload && v.payload.cfView) || (D.STATE && D.STATE.view) || '';
      const active = isSavedViewActive(v, table, targetView);
      const cnt = (typeof D.countViewRows === 'function') ? D.countViewRows(targetView, v.payload, table) : null;
      const cntText = cnt !== null && Number.isFinite(cnt) ? (D.fmtNum ? D.fmtNum(cnt) : String(cnt)) : '';
      const tipTxt = active
        ? L(`Active smart view "${v.name}" · click to clear (${describe(v.payload)})`, `العرض المثبت "${v.name}" نشط · انقر للإلغاء`, `Vue épinglée « ${v.name} » active · cliquer pour effacer`)
        : L(`Apply smart view "${v.name}" (${describe(v.payload)})`, `تطبيق العرض المثبت "${v.name}"`, `Appliquer la vue épinglée « ${v.name} »`);
      return `<button type="button" class="sv-pin-pill${active ? ' is-active' : ''}${cnt === 0 ? ' is-zero' : ''}" data-sv-pin-pill="${esc(v.id)}" data-no-i18n="1" aria-pressed="${active ? 'true' : 'false'}" data-ui-tip="${esc(tipTxt)}">${PIN_ICON}<span class="sv-pin-name">${esc(v.name)}</span>${cntText ? `<b class="sv-pin-cnt">${esc(cntText)}</b>` : ''}</button>`;
    }).join('');
    if (strip.dataset.svPinWired !== '1') {
      strip.dataset.svPinWired = '1';
      strip.addEventListener('click', e => {
        const pill = e.target.closest('[data-sv-pin-pill]');
        if (!pill) return;
        e.stopPropagation();
        const vid = pill.getAttribute('data-sv-pin-pill');
        const v = views.find(x => x.id === vid);
        if (v) applyView(v, mgrWrap._svTable || table, { toggleOffIfActive: true });
      });
    }
  }

  function refreshAllPinnedStrips() {
    document.querySelectorAll('.tbl-col-mgr-wrap').forEach(w => {
      if (w._svTable && w._svTableKey && w.isConnected) {
        renderPinnedStripForWrap(w, w._svTable, w._svTableKey);
      }
    });
  }

  // Called by table_columns.js each time it builds the toolbar control for a table.
  function mount(mgrWrap, table, tableId) {
    if (!D || !mgrWrap || !table) return;
    if (D.STATE && D.STATE.kioskLocked) return;
    hydrateLocalSync();
    const tableKey = tableKeyFor(table, tableId);
    mgrWrap._svTable = table;
    mgrWrap._svTableKey = tableKey;
    const existingWrap = mgrWrap.querySelector(':scope > .sv-wrap');
    if (existingWrap) {
      renderPinnedStripForWrap(mgrWrap, table, tableKey);
      return;
    }
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
      const curKey = mgrWrap._svTableKey || tableKey;
      openKey = curKey;
      pop.setAttribute('data-sv-key', curKey);
      pop.innerHTML = popoverHtml(curKey);
      if (window.MFG_I18N && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en' && typeof window.MFG_I18N.translateDom === 'function') {
        window.MFG_I18N.translateDom(pop);
      }
      pop.hidden = false;
      trig.setAttribute('aria-expanded', 'true');
    });
    pop.addEventListener('click', e => {
      e.stopPropagation();
      const curTbl = mgrWrap._svTable || table;
      const curKey = mgrWrap._svTableKey || tableKey;
      const ap = e.target.closest('[data-sv-apply]');
      if (ap) { const v = views.find(x => x.id === ap.getAttribute('data-sv-apply')); if (v) applyView(v, curTbl); return; }
      const pinBtn = e.target.closest('[data-sv-pin]');
      if (pinBtn) { togglePin(pinBtn.getAttribute('data-sv-pin'), curTbl, curKey); return; }
      const savePinBtn = e.target.closest('[data-sv-save-pin-toggle]');
      if (savePinBtn) {
        const next = savePinBtn.getAttribute('aria-pressed') !== 'true';
        savePinBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
        savePinBtn.classList.toggle('is-pinned', next);
        return;
      }
      const del = e.target.closest('[data-sv-del]');
      if (del) removeView(del.getAttribute('data-sv-del'), curTbl, curKey);
    });
    pop.addEventListener('submit', e => {
      e.preventDefault();
      e.stopPropagation();
      const curTbl = mgrWrap._svTable || table;
      const curKey = mgrWrap._svTableKey || tableKey;
      const inp = pop.querySelector('.sv-name-input');
      const pinToggle = pop.querySelector('[data-sv-save-pin-toggle]');
      const wantPin = Boolean(pinToggle && pinToggle.getAttribute('aria-pressed') === 'true');
      const submitBtn = e.submitter || pop.querySelector('form.sv-save button[type="submit"]');
      saveCurrent(curTbl, curKey, inp ? inp.value : '', wantPin, submitBtn);
    });
    const colTrig = mgrWrap.querySelector('.tbl-col-trigger-btn');
    if (colTrig) mgrWrap.insertBefore(wrap, colTrig);
    else mgrWrap.appendChild(wrap);
    renderPinnedStripForWrap(mgrWrap, table, tableKey);
    if (openKey === tableKey) {
      pop.innerHTML = popoverHtml(tableKey);
      if (window.MFG_I18N && window.MFG_I18N.getLang && window.MFG_I18N.getLang() !== 'en' && typeof window.MFG_I18N.translateDom === 'function') {
        window.MFG_I18N.translateDom(pop);
      }
      pop.hidden = false;
      trig.setAttribute('aria-expanded', 'true');
    }
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
    window.addEventListener('mfg:auth-gate-closed', () => {
      reset();
      if (serverReady()) ensureLoaded().catch(() => {});
    });
    if (serverReady()) ensureLoaded().catch(() => {});
  }

  // Sign-in, sign-out or switching into / out of the Demo Company: reload for the new seat or scope.
  function reset() {
    gen += 1;
    views = [];
    loadedFor = '';
    loading = null;
    listKey = null;
    savingTables.clear();
    pinSeqById.clear();
    ensureLoaded._syncedFor = '';
    closePopover();
  }

  window.MFG_SAVED_VIEWS = { init, mount, reset, list: tableKey => list(tableKey), pinnedList: tableKey => pinnedList(tableKey), refreshPinned: refreshAllPinnedStrips, _ensureLoaded: () => ensureLoaded() };
})();
