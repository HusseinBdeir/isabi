/* ============================================================================
   ISABI Command Center - shared accessible dialog behavior (js/a11y_dialog.js)
   One place for every overlay that declares role="dialog" (entry modal, 360 inspector,
   Global Search, document camera, studios, prompts) plus the Ask ISABI drawer:
     - an accessible name (aria-labelledby / aria-label) whenever one is missing
     - focus moves into a modal dialog when it opens
     - Tab and Shift+Tab loop inside the top-most modal dialog
     - focus returns to the control that opened it when it closes
   Overlays need no wiring of their own: declaring role="dialog" is enough.
   A dialog with aria-modal="true" pulls focus in and traps it. The Ask ISABI drawer
   sits beside the page on wide screens, so there it only loops Tab while focus is
   already inside it and never takes focus away from the page.
   ============================================================================ */
(function () {
  'use strict';
  if (window.MFG_A11Y) return;

  const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', 'summary',
    '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]'
  ].join(',');
  const DRAWER_ID = 'aiDrawer';

  const stack = [];          // open dialogs in the order they opened: { el, opener, modal, loopInside }
  const focusTrail = [];     // most recent focused elements, newest first
  let pointerTarget = null;
  let pointerAt = 0;
  let syncQueued = false;
  let autoId = 0;

  function rectOnScreen(el) {
    const rects = el.getClientRects();
    if (!rects.length) return false;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.width > 1 && r.height > 1 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
  }

  function isShown(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('[hidden], [inert]')) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }

  // A dialog counts as open only when a person could actually see and reach it.
  function isDialogOpen(el) {
    if (!isShown(el)) return false;
    if (el.id === DRAWER_ID) return el.classList.contains('open');
    const cs = getComputedStyle(el);
    if (Number(cs.opacity) === 0 || cs.pointerEvents === 'none') return false;
    const host = el.parentElement;
    if (host && host !== document.body) {
      const hs = getComputedStyle(host);
      if (Number(hs.opacity) === 0 || hs.pointerEvents === 'none') return false;
    }
    return rectOnScreen(el);
  }

  function coversViewport(el) {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.width >= vw * 0.85 && r.height >= vh * 0.85;
  }

  function openDialogEls() {
    const out = [];
    // While the sign-in gate covers the app (first load, or a session that expired with a dialog still up),
    // only dialogs that belong to the gate count; anything left underneath must not pull focus behind it.
    const gate = document.getElementById('authGate');
    const gateUp = Boolean(gate && isShown(gate));
    document.querySelectorAll('[role="dialog"], #' + DRAWER_ID).forEach(el => {
      if (gateUp && !gate.contains(el)) return;
      if (isDialogOpen(el)) out.push(el);
    });
    return out;
  }

  function focusables(el) {
    return Array.from(el.querySelectorAll(FOCUSABLE)).filter(n => n.tabIndex >= 0 && isShown(n));
  }

  function focusContainer(el) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (__) {} }
  }

  function ensureName(el) {
    if ((el.getAttribute('aria-label') || '').trim()) return;
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
    if (ids.some(id => { const t = document.getElementById(id); return t && (t.textContent || '').trim(); })) return;
    const head = Array.from(el.querySelectorAll('h1, h2, h3, h4, [data-dialog-title]')).find(h => (h.textContent || '').trim());
    if (!head) return;
    if (!head.id) head.id = 'a11yDialogTitle' + (++autoId);
    el.setAttribute('aria-labelledby', head.id);
  }

  function pickOpener(el) {
    const recentPointer = pointerTarget && (Date.now() - pointerAt) < 1200 && pointerTarget.isConnected && !el.contains(pointerTarget);
    if (recentPointer) return pointerTarget;
    for (let i = 0; i < focusTrail.length; i++) {
      const cand = focusTrail[i];
      if (cand && cand.isConnected && !el.contains(cand) && cand !== document.body) return cand;
    }
    return null;
  }

  function onOpened(rec) {
    const el = rec.el;
    if (el.id === DRAWER_ID) {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
      rec.modal = coversViewport(el);
      rec.loopInside = true;
      el.setAttribute('aria-modal', rec.modal ? 'true' : 'false');
    } else {
      rec.modal = el.getAttribute('aria-modal') === 'true';
      rec.loopInside = rec.modal;
    }
    ensureName(el);
    if (rec.modal && !el.contains(document.activeElement)) focusContainer(el);
  }

  function onClosed(rec) {
    // Small non-modal pickers (time menu, variance popovers) manage their own focus: handing it back to an
    // input that opens on focus would reopen them.
    if (!rec.modal && !rec.loopInside) return;
    const gate = document.getElementById('authGate');
    if (gate && isShown(gate) && !gate.contains(rec.el)) return;   // never hand focus to something under the sign-in gate
    const active = document.activeElement;
    const lost = !active || active === document.body || active === document.documentElement || rec.el.contains(active) || !isShown(active);
    if (!lost) return;
    const opener = rec.opener;
    if (opener && opener.isConnected && isShown(opener) && typeof opener.focus === 'function') {
      try { opener.focus({ preventScroll: true }); } catch (_) {}
      if (document.activeElement === opener) return;
    }
    // The opener was re-rendered away: land on the dialog underneath, or the workspace, never on nothing.
    const under = stack.length ? stack[stack.length - 1].el : document.getElementById('workspace');
    if (under && isShown(under)) focusContainer(under);
  }

  function sync() {
    syncQueued = false;
    const open = openDialogEls();
    for (let i = stack.length - 1; i >= 0; i--) {
      if (open.indexOf(stack[i].el) === -1) {
        const rec = stack.splice(i, 1)[0];
        onClosed(rec);
      }
    }
    open.forEach(el => {
      if (stack.some(r => r.el === el)) return;
      const rec = { el, opener: pickOpener(el), modal: false, loopInside: false };
      stack.push(rec);
      onOpened(rec);
    });
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    setTimeout(sync, 0);
  }

  // Anything in the page shell or in a dialog underneath the top one is "behind" it.
  function isBehind(node, top) {
    const shell = document.querySelector('.app-shell');
    if (shell && shell.contains(node) && !shell.contains(top.el)) return true;
    for (let i = 0; i < stack.length; i++) {
      const lower = stack[i];
      if (lower === top) break;
      if (lower.el.contains(node) && !lower.el.contains(top.el)) return true;
    }
    return false;
  }

  function onKeydown(e) {
    if (e.key !== 'Tab' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    sync();
    let top = null;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].modal || stack[i].loopInside) { top = stack[i]; break; }
    }
    if (!top) return;
    const el = top.el;
    const active = document.activeElement;
    if (!el.contains(active)) {
      if (!top.modal) return;
      const nowhere = !active || active === document.body || active === document.documentElement;
      if (!nowhere && !isBehind(active, top)) return;   // a floating menu that belongs to the dialog
      const list = focusables(el);
      e.preventDefault();
      if (list.length) list[e.shiftKey ? list.length - 1 : 0].focus();
      else focusContainer(el);
      return;
    }
    const list = focusables(el);
    if (!list.length) { e.preventDefault(); focusContainer(el); return; }
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && (active === first || active === el)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  function onFocusIn(e) {
    const t = e.target;
    if (!t || t === document.body) return;
    if (focusTrail[0] !== t) {
      focusTrail.unshift(t);
      if (focusTrail.length > 6) focusTrail.length = 6;
    }
    queueSync();
  }

  function onPointerDown(e) {
    const t = e.target && e.target.closest ? e.target.closest('button, a[href], [role="button"], [tabindex], input, select, textarea, summary, tr, [data-nav-jump]') : null;
    pointerTarget = t || null;
    pointerAt = Date.now();
  }

  function start() {
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', queueSync, true);
    document.addEventListener('keyup', e => { if (e.key === 'Escape' || e.key === 'Enter') queueSync(); }, true);
    if (typeof MutationObserver === 'function' && document.body) {
      new MutationObserver(queueSync).observe(document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'open']
      });
    }
    queueSync();
  }

  window.MFG_A11Y = {
    sync,
    openCount: () => { sync(); return stack.length; },
    openDialogs: () => { sync(); return stack.map(r => r.el.id || r.el.className || r.el.tagName); },
    topDialog: () => { sync(); return stack.length ? stack[stack.length - 1].el : null; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
