/* ==========================================================================
   ISABI COMMAND CENTER - NATIVE WEBAUTHN FIDO2 PASSKEYS CLIENT (js/passkeys.js)
   Hardware-enclave biometric sign-in, Step-Up confirmation, self enrolment,
   and Supervisor override authorization (zero third-party IdP / cost).
   ========================================================================== */
(function () {
  'use strict';

  function tr(str) {
    if (!str) return '';
    if (window.MFG_I18N && typeof window.MFG_I18N.t === 'function') {
      return window.MFG_I18N.t(str);
    }
    return str;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const PK_TRASH_SVG = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6h17M8.5 6V4a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 4v2M18.5 6v13a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6M10 10.5v6M14 10.5v6"/></svg>';

  function pkTrashSvg() {
    return (window.MFG_ICONS && typeof window.MFG_ICONS.svg === 'function')
      ? window.MFG_ICONS.svg('trash')
      : PK_TRASH_SVG;
  }

  function getFetchFn() {
    if (typeof window.ISABI_EDGE_FETCH === 'function') return window.ISABI_EDGE_FETCH;
    return window.fetch.bind(window);
  }

  function isSupported() {
    try {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
      if (!window.PublicKeyCredential || !navigator.credentials) return false;
      if (typeof navigator.credentials.create !== 'function' || typeof navigator.credentials.get !== 'function') return false;
      const host = String(location.hostname || '').toLowerCase();
      if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return false;
      if (host !== 'localhost' && location.protocol !== 'https:') return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function isEligibleSeat(seat) {
    if (!seat || typeof seat !== 'object') return false;
    if (String(seat.status || 'Active').trim().toLowerCase() === 'suspended') return false;
    if (seat.locked || seat.kioskLocked || seat._lockedPlaceholder) return false;
    const id = String(seat.id || '').trim().toLowerCase();
    const em = String(seat.email || '').trim().toLowerCase();
    if (!id || id.startsWith('kiosk_') || em.includes('@kiosk.') || em.endsWith('@terminal.isabi')) return false;
    if (id === 'u1' || id === 'u2') return true;
    const role = String(seat.role || '').trim().toLowerCase();
    if (/(owner|admin|full access|supervisor|manager|director)/.test(role)) return true;
    if (role.startsWith('custom')) {
      let cp = seat.custom_perms;
      if (typeof cp === 'string' && cp.trim()) {
        try { cp = JSON.parse(cp); } catch (_) { cp = null; }
      }
      if (cp && typeof cp === 'object') {
        if (cp.canManageUsers || cp.manageUsers || cp.allowPasskeys) return true;
        const unlocks = cp.unlocks && typeof cp.unlocks === 'object' ? cp.unlocks : {};
        if (Object.values(unlocks).some(v => v === true)) return true;
      }
    }
    return false;
  }

  function b64uToUint8(b64u) {
    const s = String(b64u || '').trim().replace(/-/g, '+').replace(/_/g, '/');
    const pad = s + '==='.slice((s.length + 3) % 4);
    const bin = atob(pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bufToB64u(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function defaultDeviceLabel() {
    const ua = String(navigator.userAgent || '');
    if (/iPhone/i.test(ua)) return 'iPhone Face ID / Touch ID';
    if (/iPad/i.test(ua)) return 'iPad Face ID / Touch ID';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac Touch ID Passkey';
    if (/Android/i.test(ua)) return 'Android Device Passkey';
    if (/Windows/i.test(ua)) return 'Windows Hello Passkey';
    return 'Trusted Security Device';
  }

  function mapWebAuthnError(err) {
    if (!err) return tr('Passkey verification cancelled or failed.');
    const name = String(err.name || '');
    if (name === 'NotAllowedError') return tr('Passkey prompt cancelled or timed out on this device.');
    if (name === 'InvalidStateError') return tr('This device already has a passkey enrolled for your account.');
    if (name === 'NotSupportedError') return tr('Platform passkey authenticator is not available on this device.');
    if (name === 'SecurityError') return tr('Passkeys require a valid HTTPS domain or localhost.');
    return String(err.message || err || tr('Passkey verification failed.'));
  }

  async function callPasskeysApi(payload) {
    const fetchFn = getFetchFn();
    const res = await fetchFn('./api/auth/passkeys', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    const j = res ? await res.json().catch(() => null) : null;
    if (!res || !res.ok || !j || !j.ok || j.demo_isolated) {
      const errMsg = (j && j.error) || tr('Passkey request failed.');
      const e = new Error(errMsg);
      e.status = res ? res.status : 0;
      e.payload = j || null;
      throw e;
    }
    return j;
  }

  function serializeAttestationCred(cred) {
    const resp = cred && cred.response ? cred.response : {};
    const transports = typeof resp.getTransports === 'function' ? resp.getTransports() : [];
    return {
      id: cred.id,
      rawId: bufToB64u(cred.rawId),
      type: cred.type || 'public-key',
      response: {
        clientDataJSON: bufToB64u(resp.clientDataJSON),
        attestationObject: bufToB64u(resp.attestationObject),
        transports: Array.isArray(transports) ? transports : []
      }
    };
  }

  function serializeAssertionCred(cred) {
    const resp = cred && cred.response ? cred.response : {};
    return {
      id: cred.id,
      rawId: bufToB64u(cred.rawId),
      type: cred.type || 'public-key',
      response: {
        clientDataJSON: bufToB64u(resp.clientDataJSON),
        authenticatorData: bufToB64u(resp.authenticatorData),
        signature: bufToB64u(resp.signature),
        userHandle: resp.userHandle ? bufToB64u(resp.userHandle) : ''
      }
    };
  }

  async function loginWithPasskey(opts = {}) {
    if (!isSupported()) {
      throw new Error(tr('Passkeys are not supported in this browser context.'));
    }
    const optRes = await callPasskeysApi({ action: 'auth_options', purpose: 'login' });
    const pkOpts = Object.assign({}, optRes.options);
    pkOpts.challenge = b64uToUint8(pkOpts.challenge);
    pkOpts.allowCredentials = Array.isArray(pkOpts.allowCredentials)
      ? pkOpts.allowCredentials.map(c => Object.assign({}, c, { id: b64uToUint8(c.id) }))
      : [];

    let cred = null;
    try {
      cred = await navigator.credentials.get({ publicKey: pkOpts });
    } catch (err) {
      throw new Error(mapWebAuthnError(err));
    }
    if (!cred) throw new Error(tr('No passkey credential returned by device.'));

    return callPasskeysApi({
      action: 'auth_verify',
      purpose: 'login',
      challengeId: optRes.challengeId,
      credential: serializeAssertionCred(cred),
      email: String(opts.email || '').trim().toLowerCase(),
      device: String(opts.deviceLabel || defaultDeviceLabel()).slice(0, 60)
    });
  }

  async function authenticateStepUp() {
    if (!isSupported()) {
      throw new Error(tr('Passkeys are not supported in this browser context.'));
    }
    const optRes = await callPasskeysApi({ action: 'auth_options', purpose: 'step_up' });
    const pkOpts = Object.assign({}, optRes.options);
    pkOpts.challenge = b64uToUint8(pkOpts.challenge);
    pkOpts.allowCredentials = Array.isArray(pkOpts.allowCredentials)
      ? pkOpts.allowCredentials.map(c => Object.assign({}, c, { id: b64uToUint8(c.id) }))
      : [];

    let cred = null;
    try {
      cred = await navigator.credentials.get({ publicKey: pkOpts });
    } catch (err) {
      throw new Error(mapWebAuthnError(err));
    }
    if (!cred) throw new Error(tr('No passkey credential returned by device.'));

    return callPasskeysApi({
      action: 'auth_verify',
      purpose: 'step_up',
      challengeId: optRes.challengeId,
      credential: serializeAssertionCred(cred)
    });
  }

  async function verifySupervisorOverride(opts = {}) {
    if (!isSupported()) {
      throw new Error(tr('Passkeys are not supported in this browser context.'));
    }
    const optRes = await callPasskeysApi({
      action: 'auth_options',
      purpose: 'verify_override',
      email: String(opts.email || '').trim().toLowerCase(),
      company: String(opts.company || '').trim()
    });
    const pkOpts = Object.assign({}, optRes.options);
    pkOpts.challenge = b64uToUint8(pkOpts.challenge);
    pkOpts.allowCredentials = Array.isArray(pkOpts.allowCredentials)
      ? pkOpts.allowCredentials.map(c => Object.assign({}, c, { id: b64uToUint8(c.id) }))
      : [];

    let cred = null;
    try {
      cred = await navigator.credentials.get({ publicKey: pkOpts });
    } catch (err) {
      throw new Error(mapWebAuthnError(err));
    }
    if (!cred) throw new Error(tr('No passkey credential returned by device.'));

    const fetchFn = getFetchFn();
    const res = await fetchFn('./api/auth/verify-override', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(opts.email || '').trim().toLowerCase(),
        company: String(opts.company || '').trim(),
        form_key: String(opts.form_key || '').trim(),
        field_id: String(opts.field_id || '').trim(),
        field_label: String(opts.field_label || '').trim(),
        unlock_all: Boolean(opts.unlock_all),
        record_id: String(opts.record_id || '').trim(),
        passkey_assertion: {
          challengeId: optRes.challengeId,
          credential: serializeAssertionCred(cred)
        }
      })
    });
    const j = res ? await res.json().catch(() => null) : null;
    if (!res || !res.ok || !j || !j.ok || j.demo_isolated) {
      throw new Error((j && j.error) || tr('Passkey override authorization failed.'));
    }
    return j;
  }

  async function registerForCurrentSeat(opts = {}) {
    if (!isSupported()) {
      throw new Error(tr('Passkeys are not supported in this browser context.'));
    }
    let optRes = null;
    try {
      optRes = await callPasskeysApi({ action: 'register_options' });
    } catch (err) {
      if (err && err.payload && err.payload.step_up_required && typeof opts.ensureStepUp === 'function') {
        const okStep = await opts.ensureStepUp();
        if (!okStep) throw new Error(tr('Step-up verification cancelled.'));
        optRes = await callPasskeysApi({ action: 'register_options' });
      } else {
        throw err;
      }
    }

    const pkOpts = Object.assign({}, optRes.options);
    pkOpts.challenge = b64uToUint8(pkOpts.challenge);
    pkOpts.user = Object.assign({}, pkOpts.user, { id: b64uToUint8(pkOpts.user.id) });
    pkOpts.excludeCredentials = Array.isArray(pkOpts.excludeCredentials)
      ? pkOpts.excludeCredentials.map(c => Object.assign({}, c, { id: b64uToUint8(c.id) }))
      : [];

    let cred = null;
    try {
      cred = await navigator.credentials.create({ publicKey: pkOpts });
    } catch (err) {
      throw new Error(mapWebAuthnError(err));
    }
    if (!cred) throw new Error(tr('Passkey creation cancelled on device.'));

    return callPasskeysApi({
      action: 'register_verify',
      challengeId: optRes.challengeId,
      credential: serializeAttestationCred(cred),
      device_label: String(opts.deviceLabel || defaultDeviceLabel()).slice(0, 60)
    });
  }

  async function listPasskeys(userId = '') {
    return callPasskeysApi({ action: 'list', user_id: String(userId || '') });
  }

  async function deletePasskey(id) {
    return callPasskeysApi({ action: 'delete', id: String(id || '') });
  }

  function renderPasskeysPanelHtml(ctx) {
    const me = ctx && ctx.activeUser;
    const isDemo = Boolean(ctx && ctx.isDemo);
    const hasServer = Boolean(ctx && ctx.hasServerApi);
    if (!me || isDemo || !hasServer || !isEligibleSeat(me)) return '';

    const supported = isSupported();
    const myPasskeys = Array.isArray(me.passkeys) ? me.passkeys : [];
    const owner = Boolean(ctx && ctx.isOwner);
    const allUsers = Array.isArray(ctx && ctx.users) ? ctx.users : [];
    const teamPasskeys = owner
      ? allUsers.filter(u => u && String(u.id) !== String(me.id) && Array.isArray(u.passkeys) && u.passkeys.length > 0)
      : [];

    return `
      <div class="panel-card pk-panel-card" id="passkeysPanel" style="margin-bottom:16px">
        <div class="enrol-console-hdr">
          <div class="enrol-console-brand">
            <div class="enrol-console-icon pk-icon-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4.5"/><path d="M11.3 11.7 19 4"/><path d="M16 7l3 3"/><path d="M13.5 9.5l2 2"/></svg>
            </div>
            <div>
              <div class="enrol-console-title">${esc(tr('Hardware Passkeys (Touch ID / Face ID / Windows Hello)'))}</div>
              <div class="pk-panel-sub">${esc(tr('Bind this seat to your personal device secure enclave for instant FIDO2 sign-in, step-up verification, and field overrides.'))}</div>
            </div>
          </div>
          <div class="enrol-console-actions">
            <span class="enrol-seat-pill ${myPasskeys.length ? 'enrolled' : 'pending'}" id="pkCountBadge">
              ${myPasskeys.length ? `${myPasskeys.length} / 9 ${esc(tr('Enrolled'))}` : esc(tr('No Device Bound'))}
            </span>
          </div>
        </div>

        <div class="pk-enrol-bar">
          <input type="text" id="pkDeviceLabelInput" class="pk-label-input" maxlength="60" value="${esc(defaultDeviceLabel())}" placeholder="${esc(tr('Device name (e.g. Work iPhone or MacBook Pro)'))}" aria-label="${esc(tr('Passkey device label'))}" ${supported && myPasskeys.length < 9 ? '' : 'disabled'}>
          <button type="button" class="btn btn-brass pk-reg-btn" id="pkRegisterBtn" ${supported && myPasskeys.length < 9 ? '' : 'disabled'}>
            <span>${esc(supported ? (myPasskeys.length >= 9 ? tr('Maximum 9 Passkeys Reached') : tr('Register This Device Passkey')) : tr('Requires HTTPS / Localhost'))}</span>
          </button>
        </div>

        <div class="pk-list-wrap" id="pkSelfListWrap">
          ${myPasskeys.length ? myPasskeys.map(pk => `
            <div class="pk-row" data-pk-id="${esc(pk.id)}">
              <div class="pk-row-main">
                <div class="pk-row-title" data-no-i18n="1">${esc(pk.device_label || 'Trusted Security Device')}</div>
                <div class="pk-row-meta mono">
                  <span>${pk.alg === -257 ? 'RS256' : 'ES256 P-256'}</span>
                  <span>·</span>
                  <span>${esc(pk.created_at ? String(pk.created_at).slice(0, 10) : 'Active')}</span>
                  ${pk.last_used_at ? `<span>· ${esc(tr('Last used'))} ${esc(String(pk.last_used_at).slice(0, 10))}</span>` : ''}
                </div>
              </div>
              <button type="button" class="btn btn-danger-outline pk-del-btn" data-pk-delete="${esc(pk.id)}" data-ui-tip="${esc(tr('Remove passkey'))}" aria-label="${esc(tr('Remove passkey'))}">${pkTrashSvg()}<span>${esc(tr('Remove'))}</span></button>
            </div>
          `).join('') : `<div class="pk-empty">${esc(tr('No hardware passkey enrolled yet on your account.'))}</div>`}
        </div>

        ${teamPasskeys.length ? `
          <div class="pk-team-sec">
            <div class="pk-team-hdr">${esc(tr('Team Device Passkeys (Owner Revocation)'))}</div>
            ${teamPasskeys.map(u => (u.passkeys || []).map(pk => `
              <div class="pk-row pk-row-team" data-pk-id="${esc(pk.id)}">
                <div class="pk-row-main">
                  <div class="pk-row-title"><strong data-no-i18n="1">${esc(u.full_name)}</strong> · <span data-no-i18n="1">${esc(pk.device_label || 'Security Device')}</span></div>
                  <div class="pk-row-meta mono">${pk.alg === -257 ? 'RS256' : 'ES256 P-256'} · ${esc(String(pk.created_at || '').slice(0, 10))}</div>
                </div>
                <button type="button" class="btn btn-danger-outline pk-del-btn" data-pk-delete="${esc(pk.id)}" data-ui-tip="${esc(tr('Revoke passkey'))}" aria-label="${esc(tr('Revoke passkey'))}">${pkTrashSvg()}<span>${esc(tr('Revoke'))}</span></button>
              </div>
            `).join('')).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  function wirePasskeysPanel(container, ctx) {
    if (!container) return;
    const regBtn = container.querySelector('#pkRegisterBtn');
    if (regBtn) {
      regBtn.addEventListener('click', async () => {
        if (regBtn.disabled) return;
        const lblInp = container.querySelector('#pkDeviceLabelInput');
        const label = lblInp ? String(lblInp.value || '').trim() : '';
        regBtn.disabled = true;
        try {
          const ensureStepUp = () => {
            if (window.MFG_STEP_UP && typeof window.MFG_STEP_UP.requireStepUpAuth === 'function') {
              return window.MFG_STEP_UP.requireStepUpAuth({
                actionCode: 'passkey_enrol',
                actionLabel: 'Enroll Hardware Passkey',
                alwaysChallenge: true,
                forceFresh: true
              });
            }
            return Promise.resolve(false);
          };
          const res = await registerForCurrentSeat({ deviceLabel: label || defaultDeviceLabel(), ensureStepUp });
          if (res && res.ok) {
            if (ctx && typeof ctx.toast === 'function') ctx.toast(tr('Hardware passkey enrolled on this seat'), 'ok');
            if (ctx && typeof ctx.onMutated === 'function') await ctx.onMutated();
          }
        } catch (err) {
          if (ctx && typeof ctx.toast === 'function') ctx.toast(err.message || tr('Passkey enrolment failed'), 'err');
        } finally {
          if (regBtn.isConnected) regBtn.disabled = false;
        }
      });
    }

    container.querySelectorAll('[data-pk-delete]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pkId = btn.getAttribute('data-pk-delete') || '';
        if (!pkId) return;
        btn.disabled = true;
        try {
          await deletePasskey(pkId);
          if (ctx && typeof ctx.toast === 'function') ctx.toast(tr('Passkey removed'), 'ok');
          if (ctx && typeof ctx.onMutated === 'function') await ctx.onMutated();
        } catch (err) {
          if (ctx && typeof ctx.toast === 'function') ctx.toast(err.message || tr('Could not remove passkey'), 'err');
          if (btn.isConnected) btn.disabled = false;
        }
      });
    });
  }

  window.ISABI_PASSKEYS = {
    isSupported,
    isEligibleSeat,
    loginWithPasskey,
    authenticateStepUp,
    verifySupervisorOverride,
    registerForCurrentSeat,
    listPasskeys,
    deletePasskey,
    renderPasskeysPanelHtml,
    wirePasskeysPanel
  };
})();
