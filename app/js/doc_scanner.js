/* ============================================================================
 * ISABI Systems - Document-Only Camera Scanner & Phone QR Handoff (js/doc_scanner.js)
 * Features:
 *   1. Real-time paper/card quad edge detection with YCbCr skin/face rejection
 *   2. Exact 3x3 homography perspective flatten + strict target-window crop fallback
 *   3. Opaque privacy mask outside document box + 1x / 1.5x / 2x / 3x optical/sensor zoom
 *   4. Automatic Face-Exclusion guard (TinyFaceDetector / FaceDetector)
 *   5. Post-snap draggable 4-corner crop handles, Rotate 90, Auto Clean & Crisp B&W filters
 *   6. Zero-dependency ISO/IEC 18004 SVG QR Code + Instant Phone Camera Handoff
 * ============================================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function ic(name) {
    if (window.MFG_ICONS && typeof window.MFG_ICONS.svg === 'function') {
      return window.MFG_ICONS.svg(name);
    }
    return '';
  }

  function showToast(msg, kind) {
    if (window.MFG_DOC_SCANNER && typeof window.MFG_DOC_SCANNER._toast === 'function') {
      window.MFG_DOC_SCANNER._toast(msg, kind);
      return;
    }
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (kind === 'err' ? ' toast-err' : '');
    t.hidden = false;
    clearTimeout(showToast._tm);
    showToast._tm = setTimeout(() => { t.hidden = true; }, 2800);
  }

  function randomHex(len) {
    const arr = new Uint8Array(Math.ceil(len / 2));
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').slice(0, len);
  }

  // ==========================================================================
  // 1. PURE-JS ISO/IEC 18004 QR CODE SVG ENCODER (Versions 1..10, ECC Level L)
  // ==========================================================================
  const QR_GF_EXP = new Uint8Array(512);
  const QR_GF_LOG = new Uint8Array(256);
  (function initGf256() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      QR_GF_EXP[i] = x;
      QR_GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) QR_GF_EXP[i] = QR_GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]];
  }

  function rsGeneratorPoly(ecLen) {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < ecLen; i++) {
      const next = new Uint8Array(poly.length + 1);
      const root = QR_GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], root);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncodeBlock(dataBytes, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const rem = new Uint8Array(ecLen);
    for (let i = 0; i < dataBytes.length; i++) {
      const factor = dataBytes[i] ^ rem[0];
      for (let j = 0; j < ecLen - 1; j++) rem[j] = rem[j + 1];
      rem[ecLen - 1] = 0;
      if (factor !== 0) {
        for (let j = 0; j < ecLen; j++) {
          rem[j] ^= gfMul(gen[j + 1], factor);
        }
      }
    }
    return rem;
  }

  // [version, totalDataBytes, ecBytesPerBlock, b1Count, b1DataBytes, b2Count, b2DataBytes, alignCenters]
  const QR_SPECS_L = [
    null,
    [1, 19, 7, 1, 19, 0, 0, []],
    [2, 34, 10, 1, 34, 0, 0, [6, 18]],
    [3, 55, 15, 1, 55, 0, 0, [6, 22]],
    [4, 80, 20, 1, 80, 0, 0, [6, 26]],
    [5, 108, 26, 1, 108, 0, 0, [6, 30]],
    [6, 136, 18, 2, 68, 0, 0, [6, 34]],
    [7, 156, 20, 2, 78, 0, 0, [6, 22, 38]],
    [8, 194, 24, 2, 97, 0, 0, [6, 24, 42]],
    [9, 232, 30, 2, 116, 0, 0, [6, 26, 46]],
    [10, 274, 18, 2, 68, 2, 69, [6, 28, 50]]
  ];

  function encodeQrMatrix(text) {
    const utf8 = new TextEncoder().encode(String(text || ''));
    let spec = null;
    for (let v = 1; v <= 10; v++) {
      const s = QR_SPECS_L[v];
      const lenBits = v <= 9 ? 8 : 16;
      const capBytes = Math.floor((s[1] * 8 - 4 - lenBits) / 8);
      if (utf8.length <= capBytes) { spec = s; break; }
    }
    if (!spec) throw new Error('QR payload exceeds Version 10 capacity');

    const ver = spec[0];
    const totalData = spec[1];
    const ecPerBlock = spec[2];
    const b1Cnt = spec[3], b1Len = spec[4], b2Cnt = spec[5], b2Len = spec[6];
    const aligns = spec[7];

    const bits = [];
    const pushBits = (val, n) => {
      for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    pushBits(0b0100, 4); // Byte mode
    pushBits(utf8.length, ver <= 9 ? 8 : 16);
    for (let i = 0; i < utf8.length; i++) pushBits(utf8[i], 8);
    const maxDataBits = totalData * 8;
    const term = Math.min(4, maxDataBits - bits.length);
    for (let i = 0; i < term; i++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    const dataCw = new Uint8Array(totalData);
    for (let i = 0; i < bits.length / 8; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
      dataCw[i] = b;
    }
    const padBytes = [0xec, 0x11];
    for (let i = bits.length / 8, p = 0; i < totalData; i++, p ^= 1) dataCw[i] = padBytes[p];

    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (let i = 0; i < b1Cnt; i++) {
      const blk = dataCw.slice(offset, offset + b1Len);
      offset += b1Len;
      dataBlocks.push(blk);
      ecBlocks.push(rsEncodeBlock(blk, ecPerBlock));
    }
    for (let i = 0; i < b2Cnt; i++) {
      const blk = dataCw.slice(offset, offset + b2Len);
      offset += b2Len;
      dataBlocks.push(blk);
      ecBlocks.push(rsEncodeBlock(blk, ecPerBlock));
    }

    const finalCw = [];
    const maxBlkLen = Math.max(b1Len, b2Len);
    for (let i = 0; i < maxBlkLen; i++) {
      for (let b = 0; b < dataBlocks.length; b++) {
        if (i < dataBlocks[b].length) finalCw.push(dataBlocks[b][i]);
      }
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (let b = 0; b < ecBlocks.length; b++) finalCw.push(ecBlocks[b][i]);
    }

    const size = ver * 4 + 17;
    const modules = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    const setFunc = (r, c, dark) => {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      modules[r][c] = dark ? 1 : 0;
      isFunc[r][c] = 1;
    };

    const drawFinder = (r0, c0) => {
      for (let dy = -1; dy <= 7; dy++) {
        for (let dx = -1; dx <= 7; dx++) {
          const r = r0 + dy, c = c0 + dx;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inOuter = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
          const onRing = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const inCore = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          setFunc(r, c, inOuter && (onRing || inCore));
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
      setFunc(6, i, i % 2 === 0);
      setFunc(i, 6, i % 2 === 0);
    }

    for (let i = 0; i < aligns.length; i++) {
      for (let j = 0; j < aligns.length; j++) {
        const ar = aligns[i], ac = aligns[j];
        if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 8) || (ar >= size - 8 && ac <= 8)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            setFunc(ar + dy, ac + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
          }
        }
      }
    }

    // Reserve format info & dark module
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) { setFunc(8, i, false); setFunc(i, 8, false); }
    }
    for (let i = 0; i < 8; i++) {
      setFunc(8, size - 1 - i, false);
      setFunc(size - 1 - i, 8, false);
    }
    setFunc(size - 8, 8, true);

    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const vBits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((vBits >>> i) & 1) === 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        setFunc(a, b, bit);
        setFunc(b, a, bit);
      }
    }

    // Zigzag data placement
    let bitIdx = 0;
    const totalBits = finalCw.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        for (let j = 0; j < 2; j++) {
          const c = right - j;
          if (!isFunc[r][c]) {
            let dark = false;
            if (bitIdx < totalBits) {
              dark = ((finalCw[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
              bitIdx++;
            }
            modules[r][c] = dark ? 1 : 0;
          }
        }
      }
    }

    const writeFormatBits = (mat, mask) => {
      const data = (0b01 << 3) | mask; // ECC Level L = 01
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const fmt = ((data << 10) | rem) ^ 0x5412;
      const bit = i => ((fmt >>> i) & 1);
      // Copy 1 around Top-Left finder: MSB bit(14) at (8,0) .. LSB bit(0) at (0,8)
      for (let i = 0; i <= 5; i++) mat[i][8] = bit(i);
      mat[7][8] = bit(6);
      mat[8][8] = bit(7);
      mat[8][7] = bit(8);
      for (let i = 9; i < 15; i++) mat[8][14 - i] = bit(i);
      // Copy 2 around Top-Right (row 8) & Bottom-Left (col 8)
      for (let i = 0; i < 8; i++) mat[8][size - 1 - i] = bit(i);
      for (let i = 8; i < 15; i++) mat[size - 15 + i][8] = bit(i);
      mat[size - 8][8] = 1;
    };

    const maskFn = (m, r, c) => {
      if (m === 0) return (r + c) % 2 === 0;
      if (m === 1) return r % 2 === 0;
      if (m === 2) return c % 3 === 0;
      if (m === 3) return (r + c) % 3 === 0;
      if (m === 4) return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      if (m === 5) return ((r * c) % 2 + (r * c) % 3) === 0;
      if (m === 6) return (((r * c) % 2 + (r * c) % 3) % 2) === 0;
      return (((r + c) % 2 + (r * c) % 3) % 2) === 0;
    };

    let bestMask = 0;
    let bestPenalty = Infinity;
    let bestMat = null;
    for (let m = 0; m < 8; m++) {
      const cand = modules.map((row, r) => {
        const out = new Uint8Array(size);
        for (let c = 0; c < size; c++) {
          out[c] = isFunc[r][c] ? row[c] : (row[c] ^ (maskFn(m, r, c) ? 1 : 0));
        }
        return out;
      });
      writeFormatBits(cand, m);
      let pen = 0;
      for (let r = 0; r < size; r++) {
        let runH = 1, runV = 1;
        for (let c = 1; c < size; c++) {
          if (cand[r][c] === cand[r][c - 1]) {
            runH++;
            if (runH === 5) pen += 3;
            else if (runH > 5) pen += 1;
          } else runH = 1;
          if (cand[c][r] === cand[c - 1][r]) {
            runV++;
            if (runV === 5) pen += 3;
            else if (runV > 5) pen += 1;
          } else runV = 1;
        }
      }
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const v = cand[r][c];
          if (v === cand[r][c + 1] && v === cand[r + 1][c] && v === cand[r + 1][c + 1]) pen += 3;
        }
      }
      if (pen < bestPenalty) {
        bestPenalty = pen;
        bestMask = m;
        bestMat = cand;
      }
    }
    return { size, matrix: bestMat, version: ver, mask: bestMask };
  }

  function encodeQrSvg(text) {
    const { size, matrix } = encodeQrMatrix(text);
    const quiet = 4;
    const full = size + quiet * 2;
    const parts = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c]) {
          parts.push(`M${c + quiet},${r + quiet}h1v1h-1z`);
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges" role="img" aria-label="Phone camera scan QR code"><rect width="${full}" height="${full}" fill="#FFFFFF"/><path d="${parts.join('')}" fill="#1E1710"/></svg>`;
  }

  // ==========================================================================
  // 2. DOCUMENT / CARD EDGE DETECTOR (WITH YCbCr SKIN-TONE & FACE REJECTION)
  //    + EXACT 3x3 HOMOGRAPHY PERSPECTIVE RECTIFICATION & SCAN FILTERS
  // ==========================================================================
  const _cvCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;

  function cross2D(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  function convexHull(pts) {
    if (pts.length <= 3) return pts.slice();
    const sorted = pts.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const lower = [];
    for (let i = 0; i < sorted.length; i++) {
      while (lower.length >= 2 && cross2D(lower[lower.length - 2], lower[lower.length - 1], sorted[i]) <= 0) {
        lower.pop();
      }
      lower.push(sorted[i]);
    }
    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross2D(upper[upper.length - 2], upper[upper.length - 1], sorted[i]) <= 0) {
        upper.pop();
      }
      upper.push(sorted[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function orderQuadClockwise(pts4) {
    const cx = (pts4[0].x + pts4[1].x + pts4[2].x + pts4[3].x) / 4;
    const cy = (pts4[0].y + pts4[1].y + pts4[2].y + pts4[3].y) / 4;
    const withAng = pts4.map(p => ({ x: p.x, y: p.y, a: Math.atan2(p.y - cy, p.x - cx) }));
    withAng.sort((a, b) => a.a - b.a);
    // Find Top-Left (smallest x + y)
    let tlIdx = 0;
    let bestSum = Infinity;
    for (let i = 0; i < 4; i++) {
      const s = withAng[i].x + withAng[i].y;
      if (s < bestSum) { bestSum = s; tlIdx = i; }
    }
    const ordered = [];
    for (let i = 0; i < 4; i++) {
      const p = withAng[(tlIdx + i) % 4];
      ordered.push({ x: p.x, y: p.y });
    }
    // Ensure clockwise (TL -> TR -> BR -> BL)
    if (cross2D(ordered[0], ordered[1], ordered[2]) < 0) {
      return [ordered[0], ordered[3], ordered[2], ordered[1]];
    }
    return ordered;
  }

  function quadArea(q) {
    return 0.5 * Math.abs(
      (q[0].x * q[1].y - q[1].x * q[0].y) +
      (q[1].x * q[2].y - q[2].x * q[1].y) +
      (q[2].x * q[3].y - q[3].x * q[2].y) +
      (q[3].x * q[0].y - q[0].x * q[3].y)
    );
  }

  function isReasonableDocumentQuad(q, roiArea, isVinMode) {
    if (!q || q.length !== 4) return false;
    const area = quadArea(q);
    const minAreaFrac = isVinMode ? 0.032 : 0.065;
    if (area < roiArea * minAreaFrac || area > roiArea * 0.96) return false;
    const minSidePx = isVinMode ? 6 : 8;
    for (let i = 0; i < 4; i++) {
      const pPrev = q[(i + 3) % 4];
      const pCur = q[i];
      const pNext = q[(i + 1) % 4];
      const v1x = pPrev.x - pCur.x, v1y = pPrev.y - pCur.y;
      const v2x = pNext.x - pCur.x, v2y = pNext.y - pCur.y;
      const d1 = Math.hypot(v1x, v1y), d2 = Math.hypot(v2x, v2y);
      if (d1 < minSidePx || d2 < minSidePx) return false;
      const cosA = (v1x * v2x + v1y * v2y) / (d1 * d2);
      const deg = Math.acos(Math.max(-1, Math.min(1, cosA))) * (180 / Math.PI);
      if (deg < 52 || deg > 128) return false;
    }
    const wTop = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
    const wBot = Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y);
    const hLeft = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y);
    const hRight = Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y);
    if (Math.max(wTop, wBot) / Math.max(1, Math.min(wTop, wBot)) > 1.65) return false;
    if (Math.max(hLeft, hRight) / Math.max(1, Math.min(hLeft, hRight)) > 1.65) return false;
    const aspect = ((wTop + wBot) * 0.5) / Math.max(1, (hLeft + hRight) * 0.5);
    return isVinMode ? (aspect >= 1.8 && aspect <= 6.8) : (aspect >= 0.28 && aspect <= 3.6);
  }

  function extractQuadFromHull(hull) {
    if (!hull || hull.length < 4) return null;
    if (hull.length === 4) return orderQuadClockwise(hull);

    // Sample up to 24 evenly spaced hull vertices and find maximum-area inscribed quad
    const step = hull.length > 24 ? hull.length / 24 : 1;
    const cand = [];
    for (let i = 0; i < hull.length; i += step) cand.push(hull[Math.floor(i)]);
    const n = cand.length;
    if (n < 4) return null;

    let bestQ = null;
    let bestA = -1;
    for (let i = 0; i < n - 3; i++) {
      for (let j = i + 1; j < n - 2; j++) {
        for (let k = j + 1; k < n - 1; k++) {
          for (let l = k + 1; l < n; l++) {
            const q = [cand[i], cand[j], cand[k], cand[l]];
            const a = quadArea(q);
            if (a > bestA) {
              bestA = a;
              bestQ = q;
            }
          }
        }
      }
    }
    return bestQ ? orderQuadClockwise(bestQ) : null;
  }

  /**
   * Detects the 4 corners [TL, TR, BR, BL] (normalized 0..1 of source canvas) of a handheld
   * or desk document/receipt/card while explicitly rejecting human skin (fingers/face).
   */
  function detectDocumentQuadFromCanvas(srcCanvas, guideNormRect) {
    if (!srcCanvas || !srcCanvas.width || !srcCanvas.height || !_cvCanvas) return null;
    const W = 240;
    const H = Math.max(120, Math.round((W * srcCanvas.height) / srcCanvas.width));
    _cvCanvas.width = W;
    _cvCanvas.height = H;
    const ctx = _cvCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(srcCanvas, 0, 0, W, H);
    const img = ctx.getImageData(0, 0, W, H).data;

    const g = guideNormRect || { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
    const isVinMode = Boolean(g.preset === 'vin' || (g.w / Math.max(0.05, g.h)) >= 2.55);
    const padX = Math.round(W * 0.04);
    const padY = Math.round(H * 0.04);
    const rx0 = Math.max(2, Math.floor(g.x * W) - padX);
    const ry0 = Math.max(2, Math.floor(g.y * H) - padY);
    const rx1 = Math.min(W - 3, Math.ceil((g.x + g.w) * W) + padX);
    const ry1 = Math.min(H - 3, Math.ceil((g.y + g.h) * H) + padY);
    const rw = rx1 - rx0 + 1;
    const rh = ry1 - ry0 + 1;
    if (rw < 30 || rh < (isVinMode ? 14 : 30)) return null;

    const lum = new Uint8Array(W * H);
    const cbArr = new Uint8Array(W * H);
    const crArr = new Uint8Array(W * H);
    const chroma = new Uint8Array(W * H);
    const skin = new Uint8Array(W * H);
    const hist = new Uint32Array(256);
    let nonSkinCnt = 0;

    for (let y = Math.max(0, ry0 - 2); y <= Math.min(H - 1, ry1 + 2); y++) {
      for (let x = Math.max(0, rx0 - 2); x <= Math.min(W - 1, rx1 + 2); x++) {
        const idx = y * W + x;
        const p = idx * 4;
        const r = img[p], gr = img[p + 1], b = img[p + 2];
        const yVal = (r * 77 + gr * 150 + b * 29) >> 8;
        const mx = r > gr ? (r > b ? r : b) : (gr > b ? gr : b);
        const mn = r < gr ? (r < b ? r : b) : (gr < b ? gr : b);
        const cVal = mx - mn;
        const cb = 128 + ((-43 * r - 85 * gr + 128 * b) >> 8);
        const cr = 128 + ((128 * r - 107 * gr - 21 * b) >> 8);
        lum[idx] = yVal;
        cbArr[idx] = cb;
        crArr[idx] = cr;
        chroma[idx] = cVal;
        // YCbCr human skin filter (rejects face, neck, and fingers holding the document)
        const isSkinPx = (yVal > 42 && yVal < 238 && cVal >= 15 && cb >= 77 && cb <= 128 && cr >= 133 && cr <= 176 && r > gr && r > b);
        if (isSkinPx) {
          skin[idx] = 1;
        } else if (x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1) {
          hist[yVal]++;
          nonSkinCnt++;
        }
      }
    }

    if (nonSkinCnt < 200) return null;

    // Suppress internal skin-to-skin / hair-to-skin gradients while preserving paper-to-skin card borders
    const isBrightPaperPx = i => !skin[i] && lum[i] >= 145 && chroma[i] <= 95;
    const edgeX = new Float32Array(W * H); // vertical edge strength |dI/dx|
    const edgeY = new Float32Array(W * H); // horizontal edge strength |dI/dy|
    for (let y = ry0; y <= ry1; y++) {
      for (let x = rx0; x <= rx1; x++) {
        const idx = y * W + x;
        const nearSkinX = skin[idx] || skin[idx - 1] || skin[idx + 1];
        const nearSkinY = skin[idx] || skin[idx - W] || skin[idx + W];
        const hasPaperX = isBrightPaperPx(idx - 1) || isBrightPaperPx(idx + 1) || (x > 1 && isBrightPaperPx(idx - 2)) || (x < W - 2 && isBrightPaperPx(idx + 2));
        const hasPaperY = isBrightPaperPx(idx - W) || isBrightPaperPx(idx + W) || (y > 1 && isBrightPaperPx(idx - 2 * W)) || (y < H - 2 && isBrightPaperPx(idx + 2 * W));
        if (!nearSkinX || hasPaperX) {
          const dxLum = Math.abs(lum[idx + 1] - lum[idx - 1]);
          const dxCol = Math.abs(cbArr[idx + 1] - cbArr[idx - 1]) + Math.abs(crArr[idx + 1] - crArr[idx - 1]);
          edgeX[idx] = dxLum + dxCol * 0.85;
        }
        if (!nearSkinY || hasPaperY) {
          const dyLum = Math.abs(lum[idx + W] - lum[idx - W]);
          const dyCol = Math.abs(cbArr[idx + W] - cbArr[idx - W]) + Math.abs(crArr[idx + W] - crArr[idx - W]);
          edgeY[idx] = dyLum + dyCol * 0.85;
        }
      }
    }

    const scoreQuadPerimeter = q => {
      if (!q || q.length !== 4) return -1;
      let edgeSum = 0;
      let samples = 0;
      for (let s = 0; s < 4; s++) {
        const a = q[s], b = q[(s + 1) % 4];
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(8, Math.min(48, Math.round(segLen)));
        const isHoriz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
        for (let t = 1; t < steps; t++) {
          const px = Math.round(a.x + ((b.x - a.x) * t) / steps);
          const py = Math.round(a.y + ((b.y - a.y) * t) / steps);
          if (px <= 1 || px >= W - 2 || py <= 1 || py >= H - 2) continue;
          const cIdx = py * W + px;
          let bestLocal = 0;
          for (let off = -1; off <= 1; off++) {
            const nIdx = isHoriz ? (cIdx + off * W) : (cIdx + off);
            const gVal = isHoriz
              ? (edgeY[nIdx] + edgeX[nIdx] * 0.25)
              : (edgeX[nIdx] + edgeY[nIdx] * 0.25);
            if (gVal > bestLocal) bestLocal = gVal;
          }
          edgeSum += Math.min(65, bestLocal);
          samples++;
        }
      }
      return samples > 0 ? (edgeSum / samples) : 0;
    };

    const pct = frac => {
      const target = Math.floor(nonSkinCnt * frac);
      let acc = 0;
      for (let v = 0; v < 256; v++) {
        acc += hist[v];
        if (acc >= target) return v;
      }
      return 255;
    };
    const p25 = pct(0.25);
    const p55 = pct(0.55);
    const p85 = pct(0.85);
    const dynRange = p85 - p25;
    const roiArea = rw * rh;
    const centerX = (rx0 + rx1) * 0.5;
    const centerY = (ry0 + ry1) * 0.5;

    // CUE A: Connected Bright Paper Hull (handles arbitrary tilt angles on desks/dark backgrounds)
    let cueAQuad = null;
    if (dynRange >= 12) {
      const threshY = Math.max(118, Math.min(232, Math.round(p55 + Math.max(10, dynRange * 0.28))));
      const mask = new Uint8Array(W * H);
      for (let y = ry0; y <= ry1; y++) {
        for (let x = rx0; x <= rx1; x++) {
          const idx = y * W + x;
          if (!skin[idx] && lum[idx] >= threshY && chroma[idx] <= 84) {
            mask[idx] = 1;
          }
        }
      }
      const dil = new Uint8Array(W * H);
      for (let y = ry0 + 1; y < ry1; y++) {
        for (let x = rx0 + 1; x < rx1; x++) {
          const idx = y * W + x;
          if (skin[idx]) continue;
          if (
            mask[idx] || mask[idx - 1] || mask[idx + 1] ||
            mask[idx - W] || mask[idx + W] ||
            mask[idx - W - 1] || mask[idx - W + 1] ||
            mask[idx + W - 1] || mask[idx + W + 1]
          ) {
            dil[idx] = 1;
          }
        }
      }
      const closed = new Uint8Array(W * H);
      for (let y = ry0 + 1; y < ry1; y++) {
        for (let x = rx0 + 1; x < rx1; x++) {
          const idx = y * W + x;
          if (dil[idx] && dil[idx - 1] && dil[idx + 1] && dil[idx - W] && dil[idx + W]) {
            closed[idx] = 1;
          }
        }
      }
      const visited = new Uint8Array(W * H);
      const queue = new Int32Array(W * H);
      let bestBoundary = null;
      let bestScore = 0;

      for (let y = ry0 + 1; y < ry1; y++) {
        for (let x = rx0 + 1; x < rx1; x++) {
          const startIdx = y * W + x;
          if (!closed[startIdx] || visited[startIdx]) continue;
          let qHead = 0, qTail = 0;
          queue[qTail++] = startIdx;
          visited[startIdx] = 1;
          let area = 0, sumX = 0, sumY = 0, touchesBorder = 0;
          const boundary = [];

          while (qHead < qTail) {
            const cur = queue[qHead++];
            const cy = Math.floor(cur / W);
            const cx = cur - cy * W;
            area++;
            sumX += cx;
            sumY += cy;
            if (cx <= rx0 + 2 || cx >= rx1 - 2 || cy <= ry0 + 2 || cy >= ry1 - 2) touchesBorder++;

            const n0 = cur - 1, n1 = cur + 1, n2 = cur - W, n3 = cur + W;
            let isEdgePx = false;
            if (cx > rx0 && closed[n0]) { if (!visited[n0]) { visited[n0] = 1; queue[qTail++] = n0; } } else isEdgePx = true;
            if (cx < rx1 && closed[n1]) { if (!visited[n1]) { visited[n1] = 1; queue[qTail++] = n1; } } else isEdgePx = true;
            if (cy > ry0 && closed[n2]) { if (!visited[n2]) { visited[n2] = 1; queue[qTail++] = n2; } } else isEdgePx = true;
            if (cy < ry1 && closed[n3]) { if (!visited[n3]) { visited[n3] = 1; queue[qTail++] = n3; } } else isEdgePx = true;
            if (isEdgePx) boundary.push({ x: cx, y: cy });
          }

          if (area < roiArea * (isVinMode ? 0.030 : 0.045) || area > roiArea * 0.90) continue;
          if (touchesBorder > boundary.length * 0.50) continue;
          const meanX = sumX / area, meanY = sumY / area;
          const distNorm = Math.hypot((meanX - centerX) / rw, (meanY - centerY) / rh);
          const centrality = Math.max(0.25, 1.15 - distNorm * 1.4);
          const score = area * centrality;
          if (score > bestScore && boundary.length >= 16) {
            bestScore = score;
            bestBoundary = boundary;
          }
        }
      }
      if (bestBoundary) {
        const candQ = extractQuadFromHull(convexHull(bestBoundary));
        if (isReasonableDocumentQuad(candQ, roiArea, isVinMode)) cueAQuad = candQ;
      }
    }

    // CUE B: Crisp Sobel Edge-Aligned Rectangle (isolates white/colored cards + metallic/dark VIN strips!)
    const stride = W + 1;
    const intPaper = new Int32Array(stride * (H + 1));
    const intSkin = new Int32Array(stride * (H + 1));
    const intEx = new Float32Array(stride * (H + 1));
    const intEy = new Float32Array(stride * (H + 1));
    const paperMinY = Math.max(128, p55 - 12);

    for (let y = 1; y <= H; y++) {
      let rP = 0, rS = 0, rEx = 0, rEy = 0;
      const rowOff = (y - 1) * W;
      const iRow = y * stride;
      const pRow = (y - 1) * stride;
      for (let x = 1; x <= W; x++) {
        const idx = rowOff + (x - 1);
        if (!skin[idx] && lum[idx] >= paperMinY && chroma[idx] <= 95) rP++;
        if (skin[idx]) rS++;
        rEx += edgeX[idx] > 10 ? 1 : 0;
        rEy += edgeY[idx] > 10 ? 1 : 0;
        intPaper[iRow + x] = intPaper[pRow + x] + rP;
        intSkin[iRow + x] = intSkin[pRow + x] + rS;
        intEx[iRow + x] = intEx[pRow + x] + rEx;
        intEy[iRow + x] = intEy[pRow + x] + rEy;
      }
    }
    const rectSum = (arr, x0, y0, x1, y1) => {
      const ax0 = Math.max(0, Math.min(W, x0));
      const ay0 = Math.max(0, Math.min(H, y0));
      const ax1 = Math.max(ax0, Math.min(W, x1));
      const ay1 = Math.max(ay0, Math.min(H, y1));
      return arr[ay1 * stride + ax1] - arr[ay0 * stride + ax1] - arr[ay1 * stride + ax0] + arr[ay0 * stride + ax0];
    };

    const pickPeakLines = (isHoriz, minCoord, maxCoord, maxPeaks) => {
      const scores = new Float32Array(maxCoord + 1);
      for (let c = minCoord + 3; c <= maxCoord - 3; c++) {
        scores[c] = isHoriz
          ? rectSum(intEy, rx0, c - 1, rx1 + 1, c + 2)
          : rectSum(intEx, c - 1, ry0, c + 2, ry1 + 1);
      }
      const minPeak = isHoriz ? 6 : (isVinMode ? 3 : 6);
      const peaks = [];
      for (let c = minCoord + 3; c <= maxCoord - 3; c++) {
        if (scores[c] >= minPeak && scores[c] >= scores[c - 1] && scores[c] >= scores[c + 1]) {
          peaks.push({ c, s: scores[c] });
        }
      }
      peaks.sort((a, b) => b.s - a.s);
      const chosen = [];
      for (let i = 0; i < peaks.length && chosen.length < maxPeaks; i++) {
        if (chosen.every(k => Math.abs(k - peaks[i].c) >= 5)) chosen.push(peaks[i].c);
      }
      return chosen.sort((a, b) => a - b);
    };

    const yPeaks = pickPeakLines(true, ry0, ry1, 16);
    const xPeaks = pickPeakLines(false, rx0, rx1, 16);
    let cueBQuad = null;
    let bestCueBScore = 0;

    for (let yi = 0; yi < yPeaks.length; yi++) {
      const y0 = yPeaks[yi];
      for (let yj = yi + 1; yj < yPeaks.length; yj++) {
        const y1 = yPeaks[yj];
        const bh = y1 - y0;
        if (bh < (isVinMode ? 10 : 18)) continue;
        for (let xi = 0; xi < xPeaks.length; xi++) {
          const x0 = xPeaks[xi];
          for (let xj = xi + 1; xj < xPeaks.length; xj++) {
            const x1 = xPeaks[xj];
            const bw = x1 - x0;
            if (bw < 22) continue;
            const bArea = bw * bh;
            if (bArea < roiArea * (isVinMode ? 0.030 : 0.04) || bArea > roiArea * 0.90) continue;
            const aspect = bw / bh;
            if (isVinMode ? (aspect < 1.9 || aspect > 6.8) : (aspect < 0.30 || aspect > 3.5)) continue;

            const skinInside = rectSum(intSkin, x0 + 2, y0 + 2, x1 - 1, y1 - 1) / bArea;
            if (skinInside > 0.06) continue;
            const paperInside = rectSum(intPaper, x0 + 2, y0 + 2, x1 - 1, y1 - 1) / bArea;

            const topSupport = Math.min(1.2, rectSum(intEy, x0, y0 - 1, x1 + 1, y0 + 2) / bw);
            const botSupport = Math.min(1.2, rectSum(intEy, x0, y1 - 1, x1 + 1, y1 + 2) / bw);
            const leftSupport = Math.min(1.2, rectSum(intEx, x0 - 1, y0, x0 + 2, y1 + 1) / bh);
            const rightSupport = Math.min(1.2, rectSum(intEx, x1 - 1, y0, x1 + 2, y1 + 1) / bh);

            let matQual = paperInside;
            if (isVinMode) {
              const charStrokes = rectSum(intEx, x0 + 3, y0 + 2, x1 - 2, y1 - 1) / bArea;
              const isMetalVinPlate = (skinInside <= 0.045 && topSupport >= 0.36 && botSupport >= 0.36 && charStrokes >= 0.07);
              if (paperInside < 0.45 && !isMetalVinPlate) continue;
              if (isMetalVinPlate) matQual = Math.max(paperInside, Math.min(0.95, 0.48 + charStrokes * 1.6));
            } else if (paperInside < 0.55) {
              continue;
            }

            // Require crisp edges on at least 3 sides (allows thumb/finger pinching 1 corner)
            const sidesStrong = (topSupport >= 0.36 ? 1 : 0) + (botSupport >= 0.30 ? 1 : 0) + (leftSupport >= 0.36 ? 1 : 0) + (rightSupport >= 0.30 ? 1 : 0);
            if (sidesStrong < 3) continue;

            const perimSupport = (topSupport + botSupport + leftSupport + rightSupport) * 0.25;
            const cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
            const distNorm = Math.hypot((cx - centerX) / rw, (cy - centerY) / rh);
            const centrality = Math.max(0.35, 1.15 - distNorm * 1.15);
            const totalScore = perimSupport * Math.pow(bArea / roiArea, 0.32) * matQual * centrality;
            if (totalScore > bestCueBScore) {
              bestCueBScore = totalScore;
              cueBQuad = [
                { x: x0, y: y0 },
                { x: x1, y: y0 },
                { x: x1, y: y1 },
                { x: x0, y: y1 }
              ];
            }
          }
        }
      }
    }

    let quadPx = null;
    if (cueAQuad && cueBQuad) {
      const sA = scoreQuadPerimeter(cueAQuad);
      const sB = scoreQuadPerimeter(cueBQuad);
      quadPx = (sB > sA * 1.12) ? cueBQuad : cueAQuad;
    } else {
      quadPx = cueAQuad || cueBQuad;
    }
    if (!quadPx || !isReasonableDocumentQuad(quadPx, roiArea, isVinMode)) return null;

    // Expand slightly by 2% outward from centroid so tight paper borders keep clean margins
    const qcx = (quadPx[0].x + quadPx[1].x + quadPx[2].x + quadPx[3].x) * 0.25;
    const qcy = (quadPx[0].y + quadPx[1].y + quadPx[2].y + quadPx[3].y) * 0.25;
    return quadPx.map(pt => ({
      x: Math.max(0.005, Math.min(0.995, (qcx + (pt.x - qcx) * 1.02) / W)),
      y: Math.max(0.005, Math.min(0.995, (qcy + (pt.y - qcy) * 1.02) / H))
    }));
  }

  /**
   * 8x8 mean-centered interior luminance signature (64 floats) used by Document / A4
   * hands-free Auto-Snap so an unmoved page on a desk is never snapped twice, while turning
   * or sliding to the next page immediately resets the page-turn lock.
   */
  function computeCanvasSignature64(srcCanvas, quadNormOpt) {
    if (!srcCanvas || !srcCanvas.width || !srcCanvas.height) return null;
    const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
    const w = srcCanvas.width, h = srcCanvas.height;
    let x0 = 0.12 * w, y0 = 0.12 * h, x1 = 0.88 * w, y1 = 0.88 * h;
    if (quadNormOpt && quadNormOpt.length === 4) {
      const qMinX = Math.min(quadNormOpt[0].x, quadNormOpt[1].x, quadNormOpt[2].x, quadNormOpt[3].x);
      const qMaxX = Math.max(quadNormOpt[0].x, quadNormOpt[1].x, quadNormOpt[2].x, quadNormOpt[3].x);
      const qMinY = Math.min(quadNormOpt[0].y, quadNormOpt[1].y, quadNormOpt[2].y, quadNormOpt[3].y);
      const qMaxY = Math.max(quadNormOpt[0].y, quadNormOpt[1].y, quadNormOpt[2].y, quadNormOpt[3].y);
      x0 = (qMinX + (qMaxX - qMinX) * 0.10) * w;
      x1 = (qMaxX - (qMaxX - qMinX) * 0.10) * w;
      y0 = (qMinY + (qMaxY - qMinY) * 0.10) * h;
      y1 = (qMaxY - (qMaxY - qMinY) * 0.10) * h;
    }
    const rx = Math.max(0, Math.floor(x0));
    const ry = Math.max(0, Math.floor(y0));
    const rw = Math.max(8, Math.min(w - rx, Math.ceil(x1 - x0)));
    const rh = Math.max(8, Math.min(h - ry, Math.ceil(y1 - y0)));
    const data = ctx.getImageData(rx, ry, rw, rh).data;
    const sig = new Float32Array(64);
    let mean = 0;
    for (let gy = 0; gy < 8; gy++) {
      const cy0 = Math.floor((gy * rh) / 8);
      const cy1 = Math.max(cy0 + 1, Math.floor(((gy + 1) * rh) / 8));
      for (let gx = 0; gx < 8; gx++) {
        const cx0 = Math.floor((gx * rw) / 8);
        const cx1 = Math.max(cx0 + 1, Math.floor(((gx + 1) * rw) / 8));
        let sum = 0, cnt = 0;
        for (let py = cy0; py < cy1; py += Math.max(1, Math.floor((cy1 - cy0) / 4))) {
          for (let px = cx0; px < cx1; px += Math.max(1, Math.floor((cx1 - cx0) / 4))) {
            const p = (py * rw + px) * 4;
            sum += data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
            cnt++;
          }
        }
        const v = cnt ? (sum / cnt) : 0;
        sig[gy * 8 + gx] = v;
        mean += v;
      }
    }
    mean /= 64;
    for (let i = 0; i < 64; i++) sig[i] -= mean;
    return sig;
  }

  function signatureDiff(sigA, sigB) {
    if (!sigA || !sigB || sigA.length !== 64 || sigB.length !== 64) return 999;
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += Math.abs(sigA[i] - sigB[i]);
    return sum / 64;
  }

  function solveLinear8x8(A, b) {
    const n = 8;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let maxRow = col;
      let maxVal = Math.abs(M[col][col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(M[r][col]);
        if (v > maxVal) { maxVal = v; maxRow = r; }
      }
      if (maxVal < 1e-11) return null;
      if (maxRow !== col) {
        const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp;
      }
      const pivot = M[col][col];
      for (let c = col; c <= n; c++) M[col][c] /= pivot;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col];
        if (factor === 0) continue;
        for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
      }
    }
    return M.map(row => row[n]);
  }

  /**
   * Projective homography flatten from 4 clockwise pixel corners [TL, TR, BR, BL] on srcCanvas.
   */
  function warpPerspectiveQuad(srcCanvas, quadPx, maxEdge) {
    const cap = maxEdge || 1900;
    const p0 = quadPx[0], p1 = quadPx[1], p2 = quadPx[2], p3 = quadPx[3];
    let dstW = Math.round(Math.max(Math.hypot(p1.x - p0.x, p1.y - p0.y), Math.hypot(p2.x - p3.x, p2.y - p3.y)));
    let dstH = Math.round(Math.max(Math.hypot(p3.x - p0.x, p3.y - p0.y), Math.hypot(p2.x - p1.x, p2.y - p1.y)));
    dstW = Math.max(80, dstW);
    dstH = Math.max(44, dstH);
    if (dstW > cap || dstH > cap) {
      const sc = cap / Math.max(dstW, dstH);
      dstW = Math.max(80, Math.round(dstW * sc));
      dstH = Math.max(44, Math.round(dstH * sc));
    }

    const dstPts = [
      { u: 0, v: 0 },
      { u: dstW - 1, v: 0 },
      { u: dstW - 1, v: dstH - 1 },
      { u: 0, v: dstH - 1 }
    ];
    const A = [];
    const rhs = [];
    for (let i = 0; i < 4; i++) {
      const u = dstPts[i].u, v = dstPts[i].v;
      const x = quadPx[i].x, y = quadPx[i].y;
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
      rhs.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
      rhs.push(y);
    }
    const h = solveLinear8x8(A, rhs);
    const outCanvas = document.createElement('canvas');
    outCanvas.width = dstW;
    outCanvas.height = dstH;
    const outCtx = outCanvas.getContext('2d');
    if (!h) {
      const minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x, p3.x)));
      const minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y, p3.y)));
      const maxX = Math.min(srcCanvas.width, Math.ceil(Math.max(p0.x, p1.x, p2.x, p3.x)));
      const maxY = Math.min(srcCanvas.height, Math.ceil(Math.max(p0.y, p1.y, p2.y, p3.y)));
      outCtx.drawImage(srcCanvas, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), 0, 0, dstW, dstH);
      return outCanvas;
    }

    const sCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    const sw = srcCanvas.width, sh = srcCanvas.height;
    const srcData = sCtx.getImageData(0, 0, sw, sh).data;
    const dstImg = outCtx.createImageData(dstW, dstH);
    const dstData = dstImg.data;
    const h0 = h[0], h1 = h[1], h2 = h[2], h3 = h[3], h4 = h[4], h5 = h[5], h6 = h[6], h7 = h[7];

    let dOff = 0;
    for (let v = 0; v < dstH; v++) {
      const rowDen = h7 * v + 1;
      const rowNumX = h1 * v + h2;
      const rowNumY = h4 * v + h5;
      for (let u = 0; u < dstW; u++) {
        const invDen = 1 / (h6 * u + rowDen);
        const sx = (h0 * u + rowNumX) * invDen;
        const sy = (h3 * u + rowNumY) * invDen;
        const x0 = sx < 0 ? 0 : (sx >= sw - 1 ? sw - 2 : sx | 0);
        const y0 = sy < 0 ? 0 : (sy >= sh - 1 ? sh - 2 : sy | 0);
        const fx = Math.max(0, Math.min(1, sx - x0));
        const fy = Math.max(0, Math.min(1, sy - y0));
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const i00 = (y0 * sw + x0) * 4;
        const i10 = i00 + 4;
        const i01 = i00 + sw * 4;
        const i11 = i01 + 4;
        dstData[dOff] = srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
        dstData[dOff + 1] = srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11;
        dstData[dOff + 2] = srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11;
        dstData[dOff + 3] = 255;
        dOff += 4;
      }
    }
    outCtx.putImageData(dstImg, 0, 0);
    return outCanvas;
  }

  /**
   * Integral-image shadow removal ("clean") & crisp thermal B&W ("bw") filters.
   */
  function applyScanFilter(srcCanvas, mode) {
    if (!srcCanvas || !mode || mode === 'color') return srcCanvas;
    const w = srcCanvas.width, h = srcCanvas.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const oCtx = out.getContext('2d');
    oCtx.drawImage(srcCanvas, 0, 0);
    const img = oCtx.getImageData(0, 0, w, h);
    const d = img.data;

    // Build luminance integral image in O(W*H)
    const stride = w + 1;
    const integ = new Float64Array(stride * (h + 1));
    for (let y = 1; y <= h; y++) {
      let rowSum = 0;
      const srcRow = (y - 1) * w * 4;
      const intRow = y * stride;
      const prevRow = (y - 1) * stride;
      for (let x = 1; x <= w; x++) {
        const p = srcRow + (x - 1) * 4;
        const lum = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
        rowSum += lum;
        integ[intRow + x] = prevRow ? integ[prevRow + x] + rowSum : rowSum;
      }
    }

    const rad = Math.max(14, Math.round(Math.min(w, h) * 0.045));
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - rad), y1 = Math.min(h, y + rad + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - rad), x1 = Math.min(w, x + rad + 1);
        const area = (x1 - x0) * (y1 - y0);
        const sum = integ[y1 * stride + x1] - integ[y0 * stride + x1] - integ[y1 * stride + x0] + integ[y0 * stride + x0];
        const bg = Math.max(55, sum / area);
        const p = (y * w + x) * 4;
        if (mode === 'bw') {
          const lum = d[p] * 0.299 + d[p + 1] * 0.587 + d[p + 2] * 0.114;
          const ratio = lum / bg;
          const v = ratio < 0.86 ? Math.max(14, Math.round((ratio / 0.86) * 90)) : Math.min(255, Math.round(235 + (ratio - 0.86) * 180));
          d[p] = v; d[p + 1] = v; d[p + 2] = v;
        } else {
          // 'clean': remove hand shadow & warm cast while preserving stamps/logos (e.g. blue CAT badge)
          const gain = 248 / bg;
          let r = Math.min(255, d[p] * gain);
          let g = Math.min(255, d[p + 1] * gain);
          let b = Math.min(255, d[p + 2] * gain);
          // Mild contrast stretch on dark ink
          r = r > 236 ? 255 : Math.max(0, (r - 14) * 1.06);
          g = g > 236 ? 255 : Math.max(0, (g - 14) * 1.06);
          b = b > 236 ? 255 : Math.max(0, (b - 14) * 1.06);
          d[p] = r; d[p + 1] = g; d[p + 2] = b;
        }
      }
    }
    oCtx.putImageData(img, 0, 0);
    return out;
  }

  function rotateCanvas90(srcCanvas) {
    const out = document.createElement('canvas');
    out.width = srcCanvas.height;
    out.height = srcCanvas.width;
    const ctx = out.getContext('2d');
    ctx.translate(out.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(srcCanvas, 0, 0);
    return out;
  }

  /**
   * Automatic Face-Exclusion Guard: detects any human faces on source canvas (via face-api.js
   * TinyFaceDetector if loaded, or native Chromium FaceDetector) and masks any face pixels
   * that fall outside the detected document quad so no user face ever enters the Vault.
   */
  async function maskAnyFacesOutsideQuad(srcCanvas, quadPx) {
    let boxes = [];
    try {
      if (typeof window.FaceDetector === 'function') {
        const fd = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
        const dets = await fd.detect(srcCanvas);
        boxes = (dets || []).map(d => d.boundingBox).filter(Boolean);
      } else if (window.faceapi && window.faceapi.nets && window.faceapi.nets.tinyFaceDetector && window.faceapi.nets.tinyFaceDetector.isLoaded) {
        const opts = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.3 });
        const dets = await window.faceapi.detectAllFaces(srcCanvas, opts);
        boxes = (dets || []).map(d => d.box).filter(Boolean);
      }
    } catch (_) {}

    if (!boxes.length) return { maskedCount: 0 };
    const ctx = srcCanvas.getContext('2d');
    ctx.save();
    // Create even-odd clip that protects the inside of the paper quad while masking any face outside/around it
    ctx.beginPath();
    ctx.rect(0, 0, srcCanvas.width, srcCanvas.height);
    if (quadPx && quadPx.length === 4) {
      ctx.moveTo(quadPx[0].x, quadPx[0].y);
      ctx.lineTo(quadPx[1].x, quadPx[1].y);
      ctx.lineTo(quadPx[2].x, quadPx[2].y);
      ctx.lineTo(quadPx[3].x, quadPx[3].y);
      ctx.closePath();
    }
    ctx.clip('evenodd');
    ctx.fillStyle = '#F6F4EE';
    boxes.forEach(b => {
      const pad = Math.max(8, Math.round(b.width * 0.14));
      ctx.fillRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    });
    ctx.restore();
    return { maskedCount: boxes.length };
  }

  // ==========================================================================
  // 3. MULTI-TIER INSTANT PHONE CAMERA QR RELAY (BroadcastChannel + Local API + WebRTC + Cloud Relay)
  // ==========================================================================
  function getCloudRelayCreds() {
    const cfg = window.MFG_CLOUD_CFG || {};
    try {
      return {
        url: cfg.u ? atob(cfg.u) : '',
        key: cfg.k ? atob(cfg.k) : ''
      };
    } catch (_) {
      return { url: '', key: '' };
    }
  }

  const IS_LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(location.hostname);
  const IS_TEST_HARNESS = Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST || (location.port && Number(location.port) >= 8095));

  function buildPhoneScanHandoffUrl(sid, tok, preset) {
    const pCode = preset === 'vin' ? 'v' : (preset === 'card' ? 'c' : (preset === 'document' ? 'd' : 'r'));
    const isLoopback = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname);
    // On localhost desktop dev, point QR to https://isabisystems.com/app/ so any phone on cellular/Wi-Fi opens HTTPS camera cleanly
    const base = (!IS_TEST_HARNESS && isLoopback)
      ? 'https://isabisystems.com/app/'
      : (location.origin + location.pathname);
    return `${base}?ps=${encodeURIComponent(sid)}.${encodeURIComponent(tok)}.${pCode}`;
  }

  async function pushPhoneRelayState(sid, tok, patchData) {
    // 1. BroadcastChannel (same-device / multi-tab instant)
    try {
      if (typeof BroadcastChannel === 'function') {
        const bc = new BroadcastChannel('isabi_ps_' + sid);
        bc.postMessage(Object.assign({ sid, tok, ts: Date.now() }, patchData));
        setTimeout(() => { try { bc.close(); } catch (_) {} }, 400);
      }
    } catch (_) {}

    // 2. Local server.py REST endpoint (/api/phone-scan) when on LAN/local
    if (IS_LOCAL_HOST) {
      try {
        await fetch('./api/phone-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ sid, k: tok }, patchData))
        });
      } catch (_) {}
    }

    // 3. Global HTTPS Cloud Relay (op: 'get_control' / 'patch' on ephemeral phone_scan_relay)
    const creds = getCloudRelayCreds();
    if (!creds.url || !creds.key || IS_TEST_HARNESS) return;
    try {
      const getRes = await fetch(creds.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ key: creds.key, op: 'get_control' })
      });
      const store = getRes.ok ? await getRes.json() : {};
      const docs = (store && store.docs) || store || {};
      const map = Object.assign({}, docs.phone_scan_relay || {});
      const now = Date.now();
      Object.keys(map).forEach(k => {
        if (!map[k] || now - Number(map[k].ts || 0) > 300000) delete map[k];
      });
      if (patchData && patchData.op === 'clear') {
        delete map[sid];
      } else {
        const prev = map[sid] || { sid, tok, pages: [], ts: now };
        if (prev.tok && prev.tok !== tok) return;
        const mergedPages = Array.isArray(prev.pages) ? prev.pages.slice() : [];
        if (Array.isArray(patchData.pages)) {
          const seen = new Set(mergedPages.map(p => p && p.id));
          patchData.pages.forEach(pg => {
            if (pg && pg.id && !seen.has(pg.id)) mergedPages.push(pg);
          });
        }
        map[sid] = Object.assign({}, prev, patchData, { sid, tok, pages: mergedPages.slice(0, 8), ts: now });
      }
      await fetch(creds.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          key: creds.key,
          op: 'patch',
          ackOnly: true,
          patch: { phone_scan_relay: map }
        })
      });
    } catch (_) {}
  }

  async function pollPhoneRelayState(sid, tok) {
    if (IS_LOCAL_HOST) {
      try {
        const r = await fetch(`./api/phone-scan?sid=${encodeURIComponent(sid)}&k=${encodeURIComponent(tok)}`);
        if (r.ok) {
          const j = await r.json();
          if (j && j.found && j.session) return j.session;
        }
      } catch (_) {}
    }
    const creds = getCloudRelayCreds();
    if (!creds.url || !creds.key || IS_TEST_HARNESS) return null;
    try {
      const r = await fetch(creds.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ key: creds.key, op: 'get_control' })
      });
      if (!r.ok) return null;
      const store = await r.json();
      const docs = (store && store.docs) || store || {};
      const entry = docs.phone_scan_relay && docs.phone_scan_relay[sid];
      if (entry && entry.tok === tok) return entry;
    } catch (_) {}
    return null;
  }

  function dataUrlToFile(dataUrl, fileName) {
    const parts = String(dataUrl || '').split(';base64,');
    if (parts.length < 2) return null;
    const mime = parts[0].replace(/^data:/, '') || 'image/jpeg';
    const bin = atob(parts[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    try {
      return new File([blob], fileName || `Phone_Scan_${Date.now()}.jpg`, { type: mime, lastModified: Date.now() });
    } catch (_) {
      blob.name = fileName || `Phone_Scan_${Date.now()}.jpg`;
      return blob;
    }
  }

  // ==========================================================================
  // 4. INTERACTIVE CAMERA STUDIO CONTROLLER (#docCameraModal)
  // ==========================================================================
  const S = {
    open: false,
    mode: 'camera', // 'camera' | 'preview' | 'adjust_crop' | 'qr'
    stream: null,
    camStarting: false,
    camLive: false,
    isFrontOrLaptopCam: false,
    facingMode: 'environment',
    devices: [],
    deviceIdx: -1,
    preset: 'receipt', // 'receipt' | 'document' | 'card' | 'vin'
    lastCardSubPreset: 'card', // 'card' | 'vin'
    zoom: 1,
    hwZoomApplied: 1,
    privacyMask: true,
    autoSnap: false,
    _userToggledAutoSnap: false,
    lastAutoSnapSig: null,
    awaitingPageTurn: false,
    missingTicksSinceSnap: 0,
    nextAutoSnapAllowedAt: 0,
    enhanceMode: 'clean', // 'clean' | 'bw' | 'color'
    liveQuad: null, // smoothed 4-point [0..1] quad in stage coords
    steadyTicks: 0,
    cvTimer: null,
    // Active page edit buffers (held in RAM only during preview/crop)
    pages: [], // [{ file, previewUrl, rawCanvas, quadNorm, rotation, enhanceMode, faceExcluded }]
    activeIdx: -1,
    replaceOnSnap: false,
    dragCornerIdx: -1,
    onCapture: null,
    // QR handoff state
    qrSid: '',
    qrTok: '',
    qrUrl: '',
    qrStatus: 'waiting',
    qrPollTimer: null,
    qrBc: null,
    receivedPageIds: new Set()
  };

  function defaultEnhanceForPreset(preset) {
    return (preset === 'card' || preset === 'vin') ? 'color' : 'clean';
  }

  function defaultAutoSnapForPreset(preset) {
    return preset === 'document';
  }

  function resolveDefaultPreset() {
    const domModal = $('indDomainEntryModal');
    const domKey = (domModal && !domModal.hidden && domModal._currentDomainSpec && domModal._currentDomainSpec.key) ? String(domModal._currentDomainSpec.key) : '';
    const inspPanel = $('recordInspector');
    const inspBox = $('indInspAttachmentsBox');
    const inspKey = (inspPanel && !inspPanel.hidden && inspBox && inspBox.getAttribute('data-domain-tbl')) ? String(inspBox.getAttribute('data-domain-tbl')) : '';
    const v = String((window.STATE && window.STATE.view) || '');
    const mForm = String((window.STATE && window.STATE.modalForm) || '');
    const ctxKey = `${domKey}|${inspKey}|${v}|${mForm}`;
    if (/trd_trucks|trd_warranty/i.test(ctxKey)) return 'vin';
    if (/equipment|driver|ins_items/i.test(ctxKey)) return 'card';
    if (/re_|ins_policies|ins_agreements|ins_billing|ins_claims|ins_catalogue|hld_|ledger|statements|settlement|jv|document/i.test(ctxKey)) return 'document';
    return 'receipt';
  }

  function presetGuideLabel(preset, locked, awaitingTurn) {
    if (awaitingTurn) return 'Page captured! Turn to next page or click Attach.';
    if (locked) {
      return preset === 'vin'
        ? 'VIN strip locked. Hold steady or click Capture.'
        : 'Document locked in hand. Hold steady or click Capture.';
    }
    if (preset === 'vin') return 'Align 17-character VIN or chassis plate inside narrow strip';
    if (preset === 'card') return 'Hold ID, VIN plate, or business card inside window (face stays excluded)';
    if (preset === 'document') return 'Hold or place A4 document inside window (surroundings cropped out)';
    return 'Hold receipt, delivery ticket, or slip inside window (document only)';
  }

  function getGuideNormRectForStage(stageEl, guideEl) {
    if (!stageEl || !guideEl) {
      return S.preset === 'vin'
        ? { x: 0.08, y: 0.35, w: 0.84, h: 0.30, preset: 'vin' }
        : { x: 0.18, y: 0.08, w: 0.64, h: 0.84, preset: S.preset };
    }
    const sr = stageEl.getBoundingClientRect();
    const gr = guideEl.getBoundingClientRect();
    if (!sr.width || !sr.height || !gr.width || !gr.height) {
      if (S.preset === 'vin') return { x: 0.08, y: 0.35, w: 0.84, h: 0.30, preset: 'vin' };
      if (S.preset === 'card') return { x: 0.16, y: 0.17, w: 0.68, h: 0.66, preset: 'card' };
      if (S.preset === 'document') return { x: 0.11, y: 0.05, w: 0.78, h: 0.90, preset: 'document' };
      return { x: 0.21, y: 0.05, w: 0.58, h: 0.90, preset: 'receipt' };
    }
    return {
      x: Math.max(0, Math.min(0.95, (gr.left - sr.left) / sr.width)),
      y: Math.max(0, Math.min(0.95, (gr.top - sr.top) / sr.height)),
      w: Math.max(0.05, Math.min(1, gr.width / sr.width)),
      h: Math.max(0.05, Math.min(1, gr.height / sr.height)),
      preset: S.preset
    };
  }

  /**
   * Renders the zoomed visible stage view from <video> onto a crisp native-pixel canvas.
   * Ensures 100% alignment between what is visible in #docCamStage (including software zoom)
   * and the pixel coordinates used for edge detection & perspective crop.
   */
  function captureZoomedStageCanvas(vid, stageEl, maxOutEdge) {
    const vw = vid.videoWidth, vh = vid.videoHeight;
    const sw = (stageEl && stageEl.clientWidth) || 640;
    const sh = (stageEl && stageEl.clientHeight) || 400;
    const swZoom = Math.max(1, S.zoom / Math.max(1, S.hwZoomApplied));
    const coverScale = Math.max(sw / vw, sh / vh) * swZoom;
    const visVw = Math.min(vw, sw / coverScale);
    const visVh = Math.min(vh, sh / coverScale);
    const vx0 = Math.max(0, (vw - visVw) * 0.5);
    const vy0 = Math.max(0, (vh - visVh) * 0.5);

    const cap = maxOutEdge || 2000;
    let outW = Math.round(visVw);
    let outH = Math.round(visVh);
    if (outW > cap || outH > cap) {
      const sc = cap / Math.max(outW, outH);
      outW = Math.round(outW * sc);
      outH = Math.round(outH * sc);
    }
    const c = document.createElement('canvas');
    c.width = Math.max(120, outW);
    c.height = Math.max(90, outH);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(vid, vx0, vy0, visVw, visVh, 0, 0, c.width, c.height);
    return c;
  }

  function drawOverlayQuad(canvasEl, quadNorm, interactiveHandles, steadyLocked) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || canvasEl.clientWidth || 640));
    const h = Math.max(1, Math.round(rect.height || canvasEl.clientHeight || 400));
    if (canvasEl.width !== w || canvasEl.height !== h) {
      canvasEl.width = w;
      canvasEl.height = h;
    }
    const ctx = canvasEl.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!quadNorm || quadNorm.length !== 4) return;

    const pts = quadNorm.map(p => ({ x: p.x * w, y: p.y * h }));
    if (interactiveHandles) {
      // Dim outside crop quad when adjusting corners
      ctx.save();
      ctx.fillStyle = 'rgba(244, 242, 238, 0.78)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[2].x, pts[2].y);
      ctx.lineTo(pts[3].x, pts[3].y);
      ctx.closePath();
      ctx.fill('evenodd');
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.fillStyle = steadyLocked ? 'rgba(31, 122, 76, 0.10)' : 'rgba(200, 157, 84, 0.10)';
    if (!interactiveHandles) ctx.fill();
    ctx.lineWidth = interactiveHandles ? 2.5 : 2.8;
    ctx.strokeStyle = steadyLocked ? '#1F7A4C' : '#C89D54';
    ctx.stroke();

    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, interactiveHandles ? 9 : 5, 0, Math.PI * 2);
      ctx.fillStyle = steadyLocked ? '#1F7A4C' : '#C89D54';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    });
    ctx.restore();
  }

  function stopLiveCvLoop() {
    if (S.cvTimer) {
      clearInterval(S.cvTimer);
      S.cvTimer = null;
    }
    S.liveQuad = null;
    S.steadyTicks = 0;
  }

  function startLiveCvLoop(stageEl, vidEl, guideEl, overlayCanvas) {
    stopLiveCvLoop();
    S.cvTimer = setInterval(() => {
      if (!S.camLive || S.mode !== 'camera' || !vidEl || !vidEl.videoWidth || !vidEl.videoHeight) return;
      const gNorm = getGuideNormRectForStage(stageEl, guideEl);
      const smallStage = captureZoomedStageCanvas(vidEl, stageEl, 360);
      const detected = detectDocumentQuadFromCanvas(smallStage, gNorm);
      if (detected) {
        S.missingTicksSinceSnap = 0;
        if (S.liveQuad) {
          let maxDelta = 0;
          const smoothed = detected.map((pt, i) => {
            const prev = S.liveQuad[i];
            maxDelta = Math.max(maxDelta, Math.hypot(pt.x - prev.x, pt.y - prev.y));
            return {
              x: prev.x * 0.58 + pt.x * 0.42,
              y: prev.y * 0.58 + pt.y * 0.42
            };
          });
          S.liveQuad = smoothed;
          S.steadyTicks = maxDelta < 0.022 ? S.steadyTicks + 1 : Math.max(0, S.steadyTicks - 1);
        } else {
          S.liveQuad = detected;
          S.steadyTicks = 1;
        }
        if (S.awaitingPageTurn && Date.now() >= (S.nextAutoSnapAllowedAt || 0)) {
          const curSig = computeCanvasSignature64(smallStage, S.liveQuad);
          if (!S.lastAutoSnapSig || signatureDiff(curSig, S.lastAutoSnapSig) >= 6.5) {
            S.awaitingPageTurn = false;
            S.steadyTicks = 1;
          }
        }
      } else {
        S.steadyTicks = 0;
        S.liveQuad = null;
        if (S.awaitingPageTurn) {
          S.missingTicksSinceSnap = (S.missingTicksSinceSnap || 0) + 1;
          if (S.missingTicksSinceSnap >= 2) {
            S.awaitingPageTurn = false;
            S.lastAutoSnapSig = null;
          }
        }
      }

      const locked = Boolean(S.liveQuad && !S.awaitingPageTurn && S.steadyTicks >= 4);
      if (guideEl) {
        guideEl.classList.toggle('is-doc-locked', locked);
        const guideSpan = guideEl.querySelector('.doc-cam-guide-msg');
        if (guideSpan) guideSpan.textContent = presetGuideLabel(S.preset, locked, S.awaitingPageTurn);
      }
      drawOverlayQuad(overlayCanvas, S.liveQuad, false, locked);

      if (S.autoSnap && S.liveQuad && !S.awaitingPageTurn && Date.now() >= (S.nextAutoSnapAllowedAt || 0) && S.steadyTicks >= 9) {
        S.steadyTicks = 0;
        if (stageEl && stageEl.id === 'pscStage') {
          if (typeof S._pscSnapFn === 'function') S._pscSnapFn({ autoTriggered: true });
        } else {
          snapDocumentFromStage({ autoTriggered: true });
        }
      }
    }, 95);
  }

  function stopCameraTracks() {
    stopLiveCvLoop();
    S.camStarting = false;
    S.camLive = false;
    if (S.stream) {
      try { S.stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} }); } catch (_) {}
      S.stream = null;
    }
    ['docCamVideo', 'pscVideo'].forEach(id => {
      const v = $(id);
      if (v) {
        try { v.pause(); } catch (_) {}
        v.srcObject = null;
      }
    });
  }

  function stopQrPolling() {
    if (S.qrPollTimer) {
      clearInterval(S.qrPollTimer);
      S.qrPollTimer = null;
    }
    if (S.qrBc) {
      try { S.qrBc.close(); } catch (_) {}
      S.qrBc = null;
    }
  }

  function revokeAllPageUrls() {
    (S.pages || []).forEach(p => {
      if (p && p.previewUrl) {
        try { URL.revokeObjectURL(p.previewUrl); } catch (_) {}
      }
    });
  }

  async function rebuildPageOutput(pageObj) {
    if (!pageObj || !pageObj.rawCanvas) return pageObj;
    const rc = pageObj.rawCanvas;
    const qPx = (pageObj.quadNorm || [
      { x: 0.15, y: 0.1 }, { x: 0.85, y: 0.1 }, { x: 0.85, y: 0.9 }, { x: 0.15, y: 0.9 }
    ]).map(p => ({ x: p.x * rc.width, y: p.y * rc.height }));

    let cropped = warpPerspectiveQuad(rc, qPx, 1900);
    const turns = ((pageObj.rotation || 0) % 360 + 360) % 360;
    if (turns === 90) cropped = rotateCanvas90(cropped);
    else if (turns === 180) cropped = rotateCanvas90(rotateCanvas90(cropped));
    else if (turns === 270) cropped = rotateCanvas90(rotateCanvas90(rotateCanvas90(cropped)));

    const filtered = applyScanFilter(cropped, pageObj.enhanceMode || 'clean');
    const blob = await new Promise(res => filtered.toBlob(res, 'image/jpeg', 0.88));
    if (!blob) return pageObj;

    if (pageObj.previewUrl) {
      try { URL.revokeObjectURL(pageObj.previewUrl); } catch (_) {}
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const prefix = S.preset === 'vin' ? 'Vin_Scan' : (S.preset === 'card' ? 'Card_Scan' : (S.preset === 'document' ? 'Doc_Scan' : 'Receipt_Scan'));
    const fileName = `${prefix}_${stamp}_p${(S.pages.indexOf(pageObj) + 1) || 1}.jpg`;
    let fileObj;
    try {
      fileObj = new File([blob], fileName, { type: 'image/jpeg', lastModified: Date.now() });
    } catch (_) {
      blob.name = fileName;
      fileObj = blob;
    }
    pageObj.file = fileObj;
    pageObj.previewUrl = URL.createObjectURL(blob);
    pageObj.outCanvas = filtered;
    return pageObj;
  }

  async function applyZoomLevel(zoomVal, vidEl) {
    const z = Math.max(1, Math.min(3.5, Number(zoomVal) || 1));
    S.zoom = z;
    S.hwZoomApplied = 1;
    const track = S.stream && S.stream.getVideoTracks && S.stream.getVideoTracks()[0];
    if (track && typeof track.getCapabilities === 'function' && typeof track.applyConstraints === 'function') {
      try {
        const caps = track.getCapabilities() || {};
        if (caps.zoom && Number(caps.zoom.max) > 1.05) {
          const hwZ = Math.max(Number(caps.zoom.min || 1), Math.min(Number(caps.zoom.max), z));
          await track.applyConstraints({ advanced: [{ zoom: hwZ }] });
          S.hwZoomApplied = hwZ;
        }
      } catch (_) {
        S.hwZoomApplied = 1;
      }
    }
    const swZ = Math.max(1, z / Math.max(1, S.hwZoomApplied));
    if (vidEl) {
      vidEl.style.transform = swZ > 1.01 ? `scale(${swZ.toFixed(3)})` : 'none';
    }
  }

  function ensureModalDom() {
    let modal = $('docCameraModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'docCameraModal';
    modal.className = 'modal-backdrop kiosk-submodal-backdrop';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal-card doc-cam-card" role="dialog" aria-modal="true" aria-labelledby="docCamTitle">
        <div class="modal-header">
          <div>
            <span class="modal-eyebrow">ISABI DOCUMENT-ONLY SCANNER</span>
            <h2 id="docCamTitle">Scan Receipt, Document or Card</h2>
          </div>
          <div class="modal-header-actions">
            <span class="badge doc-cam-live-pill" id="docCamLiveBadge">Starting Scanner...</span>
            <button type="button" class="doc-cam-pill-btn" id="docCamPhoneQrBtn" data-ui-tip="Scan with your phone's rear camera via QR code">${ic('qr')} Use Phone Camera</button>
            <button type="button" class="doc-cam-pill-btn" id="docCamSwitchBtn" hidden>${ic('rotate')} Flip Lens</button>
            <button type="button" class="modal-close-btn" id="docCamCloseBtn" aria-label="Close scanner">✕</button>
          </div>
        </div>
        <div class="doc-cam-body">
          <div class="doc-cam-top-deck" id="docCamTopDeck">
            <div class="doc-cam-preset-bar" id="docCamPresetBar" role="group" aria-label="Document size">
              <button type="button" class="doc-cam-pill-btn active" data-doc-preset="receipt">Receipt / Slip</button>
              <button type="button" class="doc-cam-pill-btn" data-doc-preset="document">Document / A4</button>
              <button type="button" class="doc-cam-pill-btn" data-doc-preset="card">ID / VIN / Card</button>
            </div>
            <div class="doc-cam-tools-bar" id="docCamLiveToolsBar">
              <div class="doc-cam-zoom-group" id="docCamZoomBar" role="group" aria-label="Camera zoom">
                <button type="button" class="doc-cam-zoom-btn active" data-doc-zoom="1" data-no-i18n="1">1x</button>
                <button type="button" class="doc-cam-zoom-btn" data-doc-zoom="1.5" data-no-i18n="1">1.5x</button>
                <button type="button" class="doc-cam-zoom-btn" data-doc-zoom="2" data-no-i18n="1">2x</button>
                <button type="button" class="doc-cam-zoom-btn" data-doc-zoom="3" data-no-i18n="1">3x</button>
              </div>
              <button type="button" class="doc-cam-pill-btn is-emerald active" id="docCamPrivacyBtn" data-ui-tip="Hides background and face outside the document window">${ic('shield')} Window Only</button>
              <button type="button" class="doc-cam-pill-btn" id="docCamAutoSnapBtn" data-ui-tip="Automatically snaps when document edges are held steady">${ic('bolt')} Auto-Snap</button>
            </div>
          </div>
          <div class="doc-cam-card-subbar" id="docCamCardSubBar" role="group" aria-label="Card or VIN format" hidden>
            <span class="doc-cam-subbar-lbl">Format:</span>
            <button type="button" class="doc-cam-pill-btn active" data-doc-subpreset="card" data-ui-tip="Standard card, driver license, or registration window">ID / Business Card</button>
            <button type="button" class="doc-cam-pill-btn" data-doc-subpreset="vin" data-ui-tip="Narrow 4.5:1 strip for windshield and door-jamb 17-character VIN plates">VIN / Chassis Strip (4.5:1)</button>
          </div>

          <div class="doc-cam-enhance-deck" id="docCamEnhanceDeck" hidden>
            <div class="doc-cam-enhance-bar" id="docCamEnhanceBar" role="group" aria-label="Scan enhancement">
              <button type="button" class="doc-cam-pill-btn active" data-doc-enhance="clean">Auto Clean</button>
              <button type="button" class="doc-cam-pill-btn" data-doc-enhance="bw">Crisp B&amp;W</button>
              <button type="button" class="doc-cam-pill-btn" data-doc-enhance="color">Original Crop</button>
            </div>
            <div class="doc-cam-tools-bar">
              <button type="button" class="doc-cam-pill-btn" id="docCamAdjustBtn">${ic('crop')} Adjust Corners</button>
              <button type="button" class="doc-cam-pill-btn" id="docCamApplyCropBtn" hidden>${ic('check')} Apply Crop</button>
              <button type="button" class="doc-cam-pill-btn" id="docCamRotateBtn">${ic('rotate')} Rotate 90°</button>
            </div>
          </div>

          <div class="doc-cam-qr-panel" id="docCamQrPanel" hidden>
            <div class="doc-cam-qr-box" id="docCamQrBox"></div>
            <div class="doc-cam-qr-info">
              <h3>Scan Document with Your Phone Camera</h3>
              <ol class="doc-cam-qr-steps">
                <li>Point your phone camera at this QR code and open the link.</li>
                <li>Hold your phone over the receipt, A4 sheet, or card (auto-cropped, no sign-in required).</li>
                <li>Tap Send to Computer on your phone and pages appear right here.</li>
              </ol>
              <div class="doc-cam-qr-status-row">
                <span class="doc-cam-qr-status-pill" id="docCamQrStatusPill">Waiting for phone to scan QR...</span>
                <button type="button" class="doc-cam-pill-btn" id="docCamCopyQrLinkBtn">${ic('copy')} Copy Link</button>
                <button type="button" class="doc-cam-pill-btn" id="docCamBackToLocalBtn">${ic('camera')} Use This Device's Camera</button>
              </div>
            </div>
          </div>

          <div class="doc-cam-stage" id="docCamStage" data-doc-preset="receipt">
            <video id="docCamVideo" class="doc-cam-video" autoplay muted playsinline poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video>
            <canvas id="docCamOverlayCanvas" class="doc-cam-overlay-canvas"></canvas>
            <div class="enrol-shutter-flash" id="docCamShutterFlash"></div>
            <div class="doc-cam-guide has-privacy-mask" id="docCamGuide">
              <i class="dc-corner tl"></i><i class="dc-corner tr"></i><i class="dc-corner bl"></i><i class="dc-corner br"></i>
              <div class="doc-cam-privacy-tag" id="docCamPrivacyBadge">${ic('shield')} Document Only · Face Excluded</div>
              <span class="doc-cam-guide-msg">Hold receipt, delivery ticket, or slip inside window (document only)</span>
            </div>
            <img id="docCamPreviewImg" class="doc-cam-preview-img" alt="Cropped document scan preview" hidden>
            <div class="kiosk-cam-standby-card doc-cam-warmup-card" id="docCamWarmupCard">
              <div class="kiosk-cam-standby-ico">${ic('scan_doc')}</div>
              <strong>Starting Document Scanner...</strong>
              <p>Only the document inside the target window is captured.</p>
            </div>
            <div class="doc-cam-fallback" id="docCamFallback" hidden>
              <span style="color:var(--brass,#C89D54);font-size:24px">${ic('camera')}</span>
              <strong id="docCamFallbackTitle">Camera Unavailable</strong>
              <p id="docCamFallbackMsg">Allow camera access, scan via your phone QR above, or choose a file from your device.</p>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px">
                <button type="button" class="btn btn-outline-bar btn-sm" id="docCamRetryBtn">${ic('rotate')} Retry Camera</button>
                <button type="button" class="btn btn-outline-bar btn-sm" id="docCamFallbackQrBtn">${ic('qr')} Use Phone Camera</button>
                <button type="button" class="btn btn-brass btn-sm" id="docCamFallbackPickBtn">${ic('upload')} Choose File</button>
              </div>
            </div>
          </div>

          <div class="doc-cam-batch-tray" id="docCamBatchTray" hidden></div>

          <div class="doc-cam-foot">
            <div class="doc-cam-foot-left">
              <input type="file" id="docCamNativeInput" accept="image/*,application/pdf" multiple capture="environment" hidden>
              <button type="button" class="btn btn-ghost-bar btn-sm" id="docCamNativeBtn">${ic('upload')} Choose Image / Files</button>
            </div>
            <div class="doc-cam-foot-right">
              <button type="button" class="btn btn-ghost-bar" id="docCamCancelBtn">Cancel</button>
              <button type="button" class="btn btn-outline-bar" id="docCamRetakeBtn" hidden>${ic('rotate')} Retake</button>
              <button type="button" class="btn btn-outline-bar" id="docCamAddMoreBtn" hidden>+ Add Page</button>
              <button type="button" class="btn btn-brass" id="docCamSnapBtn">${ic('scan_doc')} Capture Document</button>
              <button type="button" class="btn btn-brass" id="docCamConfirmBtn" hidden>${ic('check')} Attach Scan</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    wireModalEvents(modal);
    return modal;
  }

  function wireCornerDragOnCanvas(canvasEl, getQuad, setQuad) {
    const getNormPt = ev => {
      const r = canvasEl.getBoundingClientRect();
      const cx = ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX;
      const cy = ev.touches && ev.touches[0] ? ev.touches[0].clientY : ev.clientY;
      return {
        x: Math.max(0.02, Math.min(0.98, (cx - r.left) / Math.max(1, r.width))),
        y: Math.max(0.02, Math.min(0.98, (cy - r.top) / Math.max(1, r.height)))
      };
    };
    const onDown = ev => {
      const q = getQuad();
      if (!q || !canvasEl.classList.contains('is-interactive')) return;
      const pt = getNormPt(ev);
      let bestIdx = -1, bestD = 0.12;
      q.forEach((c, i) => {
        const d = Math.hypot(c.x - pt.x, c.y - pt.y);
        if (d < bestD) { bestD = d; bestIdx = i; }
      });
      if (bestIdx >= 0) {
        S.dragCornerIdx = bestIdx;
        if (ev.cancelable) ev.preventDefault();
      }
    };
    const onMove = ev => {
      if (S.dragCornerIdx < 0) return;
      const q = getQuad();
      if (!q) return;
      if (ev.cancelable) ev.preventDefault();
      const next = q.map((c, i) => (i === S.dragCornerIdx ? getNormPt(ev) : c));
      setQuad(next);
      drawOverlayQuad(canvasEl, next, true, false);
    };
    const onUp = () => { S.dragCornerIdx = -1; };
    canvasEl.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvasEl.addEventListener('touchstart', onDown, { passive: false });
    canvasEl.addEventListener('touchmove', onMove, { passive: false });
    canvasEl.addEventListener('touchend', onUp);
  }

  function syncModalUi() {
    const stg = $('docCamStage');
    const qrPanel = $('docCamQrPanel');
    const topDeck = $('docCamTopDeck');
    const enhDeck = $('docCamEnhanceDeck');
    const liveTools = $('docCamLiveToolsBar');
    const vid = $('docCamVideo');
    const prevImg = $('docCamPreviewImg');
    const guide = $('docCamGuide');
    const ov = $('docCamOverlayCanvas');
    const warm = $('docCamWarmupCard');
    const fb = $('docCamFallback');
    const snapBtn = $('docCamSnapBtn');
    const retakeBtn = $('docCamRetakeBtn');
    const addMoreBtn = $('docCamAddMoreBtn');
    const confirmBtn = $('docCamConfirmBtn');
    const switchBtn = $('docCamSwitchBtn');
    const qrBtn = $('docCamPhoneQrBtn');
    const adjBtn = $('docCamAdjustBtn');
    const applyCropBtn = $('docCamApplyCropBtn');
    const badge = $('docCamLiveBadge');

    const pageCnt = S.pages.length;
    const activePage = S.pages[S.activeIdx] || null;
    const isQr = S.mode === 'qr';
    const isPrev = S.mode === 'preview' && Boolean(activePage);
    const isAdj = S.mode === 'adjust_crop' && Boolean(activePage);
    const isCam = S.mode === 'camera';

    if (qrPanel) qrPanel.hidden = !isQr;
    if (stg) {
      stg.hidden = isQr;
      stg.classList.toggle('is-live', Boolean(isCam && S.camLive));
      stg.classList.toggle('is-preview', isPrev);
      stg.setAttribute('data-doc-preset', S.preset);
    }
    if (topDeck) topDeck.hidden = !isCam;
    const cardSubBar = $('docCamCardSubBar');
    if (cardSubBar) cardSubBar.hidden = !(isCam && (S.preset === 'card' || S.preset === 'vin'));
    if (liveTools) liveTools.hidden = !isCam;
    if (enhDeck) enhDeck.hidden = !(isPrev || isAdj);
    if (qrBtn) qrBtn.classList.toggle('active', isQr);

    document.querySelectorAll('#docCamPresetBar [data-doc-preset]').forEach(b => {
      const bp = b.getAttribute('data-doc-preset');
      const isAct = bp === 'card' ? (S.preset === 'card' || S.preset === 'vin') : (bp === S.preset);
      b.classList.toggle('active', isAct);
    });
    document.querySelectorAll('#docCamCardSubBar [data-doc-subpreset]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-doc-subpreset') === S.preset);
    });
    document.querySelectorAll('#docCamZoomBar [data-doc-zoom]').forEach(b => {
      b.classList.toggle('active', Math.abs(Number(b.getAttribute('data-doc-zoom')) - S.zoom) < 0.22);
    });
    const privBtn = $('docCamPrivacyBtn');
    if (privBtn) privBtn.classList.toggle('active', S.privacyMask);
    const autoBtn = $('docCamAutoSnapBtn');
    if (autoBtn) autoBtn.classList.toggle('active', S.autoSnap);

    if (guide) {
      guide.hidden = !(isCam && S.camLive);
      guide.classList.toggle('has-privacy-mask', S.privacyMask);
      const pTag = $('docCamPrivacyBadge');
      if (pTag) {
        pTag.innerHTML = S.privacyMask
          ? `${ic('shield')} Document Only · Face Excluded`
          : `${ic('crop')} Auto-Crops to Paper Edges`;
      }
      const gMsg = guide.querySelector('.doc-cam-guide-msg');
      if (gMsg && (!S.liveQuad || S.awaitingPageTurn)) {
        gMsg.textContent = presetGuideLabel(S.preset, false, S.awaitingPageTurn);
      }
    }

    if (warm) warm.hidden = !(isCam && S.camStarting && (!fb || fb.hidden));
    if (vid) vid.hidden = !(isCam && S.camLive);

    if (prevImg) {
      if (isPrev && activePage) {
        prevImg.src = activePage.previewUrl || '';
        prevImg.hidden = false;
      } else if (isAdj && activePage && activePage.rawPreviewUrl) {
        prevImg.src = activePage.rawPreviewUrl;
        prevImg.hidden = false;
        prevImg.style.maxWidth = '100%';
        prevImg.style.maxHeight = '100%';
        prevImg.style.width = '100%';
        prevImg.style.height = '100%';
        prevImg.style.objectFit = 'fill';
      } else {
        prevImg.hidden = true;
      }
      if (!isAdj && prevImg) {
        prevImg.style.maxWidth = '';
        prevImg.style.maxHeight = '';
        prevImg.style.width = '';
        prevImg.style.height = '';
        prevImg.style.objectFit = '';
      }
    }

    if (ov) {
      ov.classList.toggle('is-interactive', isAdj);
      if (isAdj && activePage) {
        requestAnimationFrame(() => drawOverlayQuad(ov, activePage.quadNorm, true, false));
      } else if (!isCam) {
        const ctx = ov.getContext('2d');
        ctx.clearRect(0, 0, ov.width, ov.height);
      }
    }

    if (activePage) {
      document.querySelectorAll('#docCamEnhanceBar [data-doc-enhance]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-doc-enhance') === (activePage.enhanceMode || 'clean'));
      });
    }
    if (adjBtn) adjBtn.hidden = !isPrev;
    if (applyCropBtn) applyCropBtn.hidden = !isAdj;

    if (snapBtn) snapBtn.hidden = !isCam || Boolean(fb && !fb.hidden);
    if (retakeBtn) retakeBtn.hidden = !(isPrev || isAdj);
    if (addMoreBtn) addMoreBtn.hidden = !(isPrev && pageCnt >= 1 && pageCnt < 8);
    if (confirmBtn) {
      confirmBtn.hidden = !(pageCnt >= 1 && (isPrev || isQr || isCam));
      confirmBtn.innerHTML = pageCnt > 1
        ? `${ic('check')} Attach ${pageCnt} Scans`
        : `${ic('check')} Attach Scan`;
    }
    if (switchBtn) {
      const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      switchBtn.hidden = !(isCam && S.camLive && (S.devices.length > 1 || isTouch));
    }

    if (badge) {
      if (isQr) {
        badge.textContent = S.qrStatus === 'connected' ? 'Phone Connected' : (pageCnt ? `${pageCnt} Page(s) Received` : 'QR Pairing Ready');
        badge.className = 'badge badge-ok doc-cam-live-pill';
      } else if (isCam && S.camLive) {
        badge.textContent = pageCnt > 0
          ? (pageCnt === 1 ? '1 Cropped Scan Ready' : `${pageCnt} Cropped Scans Ready`)
          : `Document Crop · ${S.zoom}x`;
        badge.className = 'badge badge-ok doc-cam-live-pill';
      } else if (S.camStarting) {
        badge.textContent = 'Starting Scanner...';
        badge.className = 'badge doc-cam-live-pill';
      } else if (pageCnt > 0) {
        badge.textContent = pageCnt === 1 ? '1 Cropped Scan Ready' : `${pageCnt} Cropped Scans Ready`;
        badge.className = 'badge badge-ok doc-cam-live-pill';
      } else {
        badge.textContent = 'Scanner Ready';
        badge.className = 'badge doc-cam-live-pill';
      }
    }

    // Batch tray
    const tray = $('docCamBatchTray');
    if (tray) {
      if (!pageCnt) {
        tray.hidden = true;
        tray.innerHTML = '';
      } else {
        tray.hidden = false;
        tray.innerHTML = S.pages.map((p, idx) => `
          <div class="doc-cam-batch-chip ${idx === S.activeIdx ? 'active' : ''}" data-doc-pick-idx="${idx}">
            ${p.previewUrl ? `<img src="${esc(p.previewUrl)}" alt="Page ${idx + 1}">` : ''}
            <span>Page ${idx + 1}</span>
            <button type="button" class="doc-cam-batch-del" data-doc-remove-idx="${idx}" aria-label="Remove page ${idx + 1}">✕</button>
          </div>
        `).join('');
        tray.querySelectorAll('[data-doc-pick-idx]').forEach(chip => {
          chip.addEventListener('click', ev => {
            if (ev.target && ev.target.closest('[data-doc-remove-idx]')) return;
            const idx = Number(chip.getAttribute('data-doc-pick-idx'));
            if (!S.pages[idx]) return;
            stopCameraTracks();
            stopQrPolling();
            S.activeIdx = idx;
            S.mode = 'preview';
            syncModalUi();
          });
        });
        tray.querySelectorAll('[data-doc-remove-idx]').forEach(del => {
          del.addEventListener('click', ev => {
            ev.stopPropagation();
            const idx = Number(del.getAttribute('data-doc-remove-idx'));
            const removed = S.pages.splice(idx, 1)[0];
            if (removed && removed.previewUrl) { try { URL.revokeObjectURL(removed.previewUrl); } catch (_) {} }
            if (removed && removed.rawPreviewUrl) { try { URL.revokeObjectURL(removed.rawPreviewUrl); } catch (_) {} }
            if (!S.pages.length) {
              S.activeIdx = -1;
              if (S.mode !== 'qr') startLocalCameraStream();
              else syncModalUi();
              return;
            }
            S.activeIdx = Math.min(idx, S.pages.length - 1);
            syncModalUi();
          });
        });
      }
    }
    const modalEl = $('docCameraModal');
    if (modalEl && window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function' && window.MFG_I18N.getLang() !== 'en') {
      registerScannerI18n();
      window.MFG_I18N.translateDom(modalEl);
    }
  }

  async function startLocalCameraStream() {
    stopQrPolling();
    stopCameraTracks();
    S.mode = 'camera';
    const vid = $('docCamVideo');
    const fb = $('docCamFallback');
    const snapBtn = $('docCamSnapBtn');
    const stg = $('docCamStage');
    const guide = $('docCamGuide');
    const ov = $('docCamOverlayCanvas');

    if (fb) fb.hidden = true;
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      S.camStarting = false;
      S.camLive = false;
      if (fb) {
        $('docCamFallbackTitle').textContent = 'Camera Requires Secure HTTPS or Phone QR';
        $('docCamFallbackMsg').textContent = 'Click Use Phone Camera to scan with your phone, or choose a file below.';
        fb.hidden = false;
      }
      syncModalUi();
      return;
    }

    S.camStarting = true;
    S.camLive = false;
    if (snapBtn) snapBtn.disabled = true;
    syncModalUi();

    try {
      const chosenId = (S.deviceIdx >= 0 && S.devices[S.deviceIdx]) ? S.devices[S.deviceIdx].deviceId : '';
      const hiRes = chosenId
        ? { deviceId: { exact: chosenId }, width: { ideal: 2560 }, height: { ideal: 1440 } }
        : { facingMode: { ideal: S.facingMode || 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: hiRes, audio: false });
      } catch (e1) {
        if (/NotAllowed|Permission/i.test(String((e1 && e1.name) || ''))) throw e1;
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }).catch(() =>
          navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        );
      }

      if (!S.open || S.mode !== 'camera') {
        stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
        return;
      }

      S.stream = stream;
      const track = stream.getVideoTracks()[0];
      const settings = (track && typeof track.getSettings === 'function') ? track.getSettings() : {};
      if (track && typeof track.getCapabilities === 'function' && typeof track.applyConstraints === 'function') {
        try {
          const caps = track.getCapabilities() || {};
          if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
          }
        } catch (_) {}
      }

      if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
        const all = await navigator.mediaDevices.enumerateDevices();
        S.devices = all.filter(d => d && d.kind === 'videoinput');
      }

      const isTouch = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      const lbl = String((track && track.label) || '');
      S.isFrontOrLaptopCam = settings.facingMode === 'user' || (!isTouch && S.devices.length <= 1 && !/rear|back|environment|document/i.test(lbl));

      // Default 2x zoom on single laptop/front webcam so handheld documents fill the target window with zero face in view
      if (!S._userPickedZoom) {
        S.zoom = S.isFrontOrLaptopCam ? 2 : 1;
      }

      if (vid) {
        vid.srcObject = stream;
        try { await vid.play(); } catch (_) {}
      }
      await applyZoomLevel(S.zoom, vid);

      S.camStarting = false;
      S.camLive = true;
      if (snapBtn) snapBtn.disabled = false;
      syncModalUi();
      startLiveCvLoop(stg, vid, guide, ov);
    } catch (err) {
      S.camStarting = false;
      S.camLive = false;
      if (fb) {
        const eName = String((err && err.name) || '');
        if (/NotAllowed|Permission/i.test(eName)) {
          $('docCamFallbackTitle').textContent = 'Camera Permission Blocked';
          $('docCamFallbackMsg').textContent = 'Allow camera access in your browser bar, click Use Phone Camera above, or pick an image file.';
        } else {
          $('docCamFallbackTitle').textContent = 'Camera Not Available';
          $('docCamFallbackMsg').textContent = 'Click Use Phone Camera to scan effortlessly from your phone, or pick a file from your device.';
        }
        fb.hidden = false;
      }
      syncModalUi();
    }
  }

  async function processCapturedStageCanvas(rawCanvas, gNorm, snapOpts = {}) {
    const autoTriggered = Boolean(snapOpts && snapOpts.autoTriggered);
    const detectedQuad = S.liveQuad || detectDocumentQuadFromCanvas(rawCanvas, gNorm);
    const quadNorm = detectedQuad || [
      { x: gNorm.x, y: gNorm.y },
      { x: gNorm.x + gNorm.w, y: gNorm.y },
      { x: gNorm.x + gNorm.w, y: gNorm.y + gNorm.h },
      { x: gNorm.x, y: gNorm.y + gNorm.h }
    ];

    if (autoTriggered && S.preset === 'document' && S.awaitingPageTurn) {
      const candSig = computeCanvasSignature64(rawCanvas, quadNorm);
      if (S.lastAutoSnapSig && signatureDiff(candSig, S.lastAutoSnapSig) < 6.5) {
        return { skippedDuplicate: true, keepLiveBatch: true, pageCount: S.pages.length };
      }
      S.awaitingPageTurn = false;
    }

    // Enforce Face-Exclusion on rawCanvas outside paper quad before keeping rawCanvas for corner adjust
    const qPx = quadNorm.map(p => ({ x: p.x * rawCanvas.width, y: p.y * rawCanvas.height }));
    const faceRes = await maskAnyFacesOutsideQuad(rawCanvas, qPx);

    const rawBlob = await new Promise(res => rawCanvas.toBlob(res, 'image/jpeg', 0.85));
    const rawPreviewUrl = rawBlob ? URL.createObjectURL(rawBlob) : '';

    const pageObj = {
      rawCanvas,
      rawPreviewUrl,
      quadNorm,
      rotation: 0,
      enhanceMode: S.enhanceMode || defaultEnhanceForPreset(S.preset),
      faceExcluded: faceRes.maskedCount > 0,
      file: null,
      previewUrl: ''
    };
    await rebuildPageOutput(pageObj);

    if (S.replaceOnSnap && S.activeIdx >= 0 && S.pages[S.activeIdx]) {
      const old = S.pages[S.activeIdx];
      if (old.previewUrl) { try { URL.revokeObjectURL(old.previewUrl); } catch (_) {} }
      if (old.rawPreviewUrl) { try { URL.revokeObjectURL(old.rawPreviewUrl); } catch (_) {} }
      S.pages[S.activeIdx] = pageObj;
    } else {
      S.pages.push(pageObj);
      S.activeIdx = S.pages.length - 1;
    }

    const keepLiveBatch = Boolean(autoTriggered && S.preset === 'document' && !S.replaceOnSnap && S.pages.length < 8);
    S.replaceOnSnap = false;
    if (keepLiveBatch) {
      S.lastAutoSnapSig = computeCanvasSignature64(rawCanvas, quadNorm);
      S.awaitingPageTurn = true;
      S.missingTicksSinceSnap = 0;
      S.nextAutoSnapAllowedAt = Date.now() + 1400;
      S.steadyTicks = 0;
      S.mode = 'camera';
      syncModalUi();
    } else {
      S.awaitingPageTurn = false;
      S.lastAutoSnapSig = null;
      stopCameraTracks();
      S.mode = 'preview';
      syncModalUi();
    }
    return { skippedDuplicate: false, keepLiveBatch, pageCount: S.pages.length, page: pageObj };
  }

  async function snapDocumentFromStage(snapOpts = {}) {
    const vid = $('docCamVideo');
    const stg = $('docCamStage');
    const guide = $('docCamGuide');
    if (vid && (!vid.videoWidth || !vid.videoHeight)) {
      for (let i = 0; i < 12 && (!vid.videoWidth || !vid.videoHeight); i++) {
        await new Promise(r => setTimeout(r, 60));
      }
    }
    if (!vid || !vid.videoWidth || !vid.videoHeight) {
      showToast('Scanner stream is warming up. Wait a moment or use Phone Camera.', 'err');
      return null;
    }

    const flash = $('docCamShutterFlash');
    if (flash) {
      flash.classList.add('active');
      setTimeout(() => flash.classList.remove('active'), 170);
    }

    const rawCanvas = captureZoomedStageCanvas(vid, stg, 2000);
    const gNorm = getGuideNormRectForStage(stg, guide);
    return processCapturedStageCanvas(rawCanvas, gNorm, snapOpts);
  }

  async function snapCanvasForBatchTest(srcCanvas, snapOpts = {}) {
    if (!srcCanvas) return null;
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = srcCanvas.width;
    rawCanvas.height = srcCanvas.height;
    rawCanvas.getContext('2d').drawImage(srcCanvas, 0, 0);
    const stg = $('docCamStage');
    const guide = $('docCamGuide');
    const gNorm = (snapOpts && snapOpts.guideNorm) || getGuideNormRectForStage(stg, guide);
    return processCapturedStageCanvas(rawCanvas, gNorm, snapOpts);
  }

  async function ingestReceivedPhonePages(pagesList) {
    if (!Array.isArray(pagesList) || !pagesList.length) return;
    let added = 0;
    for (let i = 0; i < pagesList.length; i++) {
      const pg = pagesList[i];
      if (!pg || !pg.dataUrl) continue;
      const pid = String(pg.id || pg.fileName || ('pg_' + i));
      if (S.receivedPageIds.has(pid)) continue;
      S.receivedPageIds.add(pid);
      const fileObj = dataUrlToFile(pg.dataUrl, pg.fileName || `Phone_Scan_p${S.pages.length + 1}.jpg`);
      if (!fileObj) continue;
      const previewUrl = URL.createObjectURL(fileObj);
      // Hydrate rawCanvas from dataUrl so desktop user can still rotate or filter if desired
      const img = new Image();
      await new Promise(res => { img.onload = res; img.onerror = res; img.src = previewUrl; });
      let rawCanvas = null;
      if (img.naturalWidth && img.naturalHeight) {
        rawCanvas = document.createElement('canvas');
        rawCanvas.width = img.naturalWidth;
        rawCanvas.height = img.naturalHeight;
        rawCanvas.getContext('2d').drawImage(img, 0, 0);
      }
      S.pages.push({
        rawCanvas,
        rawPreviewUrl: previewUrl,
        quadNorm: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
        rotation: 0,
        enhanceMode: 'color',
        file: fileObj,
        previewUrl
      });
      S.activeIdx = S.pages.length - 1;
      added++;
    }
    if (added > 0) {
      stopQrPolling();
      pushPhoneRelayState(S.qrSid, S.qrTok, { op: 'clear' }).catch(() => {});
      S.mode = 'preview';
      showToast(added === 1 ? 'Received cropped scan from phone!' : `Received ${added} cropped scans from phone!`, 'ok');
      syncModalUi();
    }
  }

  function openPhoneQrMode() {
    stopCameraTracks();
    stopQrPolling();
    S.mode = 'qr';
    if (!S.qrSid || !S.qrTok) {
      S.qrSid = randomHex(8);
      S.qrTok = randomHex(8);
      S.receivedPageIds = new Set();
    }
    S.qrUrl = buildPhoneScanHandoffUrl(S.qrSid, S.qrTok, S.preset);
    S.qrStatus = 'waiting';

    const qrBox = $('docCamQrBox');
    if (qrBox) {
      qrBox.innerHTML = encodeQrSvg(S.qrUrl);
      qrBox.setAttribute('data-handoff-url', S.qrUrl);
    }
    const pill = $('docCamQrStatusPill');
    if (pill) {
      pill.textContent = 'Waiting for phone to scan QR...';
      pill.className = 'doc-cam-qr-status-pill';
    }
    syncModalUi();

    // Register session & listen on BroadcastChannel + polling
    pushPhoneRelayState(S.qrSid, S.qrTok, { status: 'waiting', preset: S.preset }).catch(() => {});
    try {
      if (typeof BroadcastChannel === 'function') {
        S.qrBc = new BroadcastChannel('isabi_ps_' + S.qrSid);
        S.qrBc.onmessage = ev => {
          const msg = ev && ev.data;
          if (!msg || msg.tok !== S.qrTok) return;
          if (msg.status === 'connected') {
            S.qrStatus = 'connected';
            const p = $('docCamQrStatusPill');
            if (p) { p.textContent = 'Phone Connected · Aiming Rear Camera...'; p.className = 'doc-cam-qr-status-pill is-connected'; }
            syncModalUi();
          }
          if (Array.isArray(msg.pages) && msg.pages.length) {
            ingestReceivedPhonePages(msg.pages);
          }
        };
      }
    } catch (_) {}

    S.qrPollTimer = setInterval(() => {
      checkQrRemoteOnce();
    }, IS_LOCAL_HOST ? 900 : 2200);
  }

  async function checkQrRemoteOnce() {
    if (!S.open || S.mode !== 'qr' || !S.qrSid || !S.qrTok) return false;
    const remote = await pollPhoneRelayState(S.qrSid, S.qrTok);
    if (!remote) return false;
    if (remote.status === 'connected' && S.qrStatus !== 'connected') {
      S.qrStatus = 'connected';
      const p = $('docCamQrStatusPill');
      if (p) { p.textContent = 'Phone Connected · Aiming Rear Camera...'; p.className = 'doc-cam-qr-status-pill is-connected'; }
      syncModalUi();
    }
    if (Array.isArray(remote.pages) && remote.pages.length) {
      await ingestReceivedPhonePages(remote.pages);
      return true;
    }
    return false;
  }

  function wireModalEvents(modal) {
    $('docCamCloseBtn').addEventListener('click', closeDocumentScanner);
    $('docCamCancelBtn').addEventListener('click', closeDocumentScanner);
    modal.addEventListener('click', e => { if (e.target === modal) closeDocumentScanner(); });

    modal.querySelectorAll('#docCamPresetBar [data-doc-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clicked = btn.getAttribute('data-doc-preset') || 'receipt';
        if (clicked === 'card') {
          S.preset = (S.preset === 'card' || S.preset === 'vin') ? S.preset : (S.lastCardSubPreset || 'card');
        } else {
          S.preset = clicked;
        }
        S.enhanceMode = defaultEnhanceForPreset(S.preset);
        if (!S._userToggledAutoSnap) {
          S.autoSnap = defaultAutoSnapForPreset(S.preset);
        }
        S.liveQuad = null;
        S.steadyTicks = 0;
        S.awaitingPageTurn = false;
        S.lastAutoSnapSig = null;
        if (S.mode === 'qr' && S.qrSid && S.qrTok) {
          S.qrUrl = buildPhoneScanHandoffUrl(S.qrSid, S.qrTok, S.preset);
          const qrBox = $('docCamQrBox');
          if (qrBox) {
            qrBox.innerHTML = encodeQrSvg(S.qrUrl);
            qrBox.setAttribute('data-handoff-url', S.qrUrl);
          }
        }
        syncModalUi();
      });
    });

    modal.querySelectorAll('#docCamCardSubBar [data-doc-subpreset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sub = btn.getAttribute('data-doc-subpreset') || 'card';
        S.preset = sub;
        S.lastCardSubPreset = sub;
        S.enhanceMode = defaultEnhanceForPreset(S.preset);
        if (!S._userToggledAutoSnap) {
          S.autoSnap = defaultAutoSnapForPreset(S.preset);
        }
        S.liveQuad = null;
        S.steadyTicks = 0;
        S.awaitingPageTurn = false;
        S.lastAutoSnapSig = null;
        syncModalUi();
      });
    });

    modal.querySelectorAll('#docCamZoomBar [data-doc-zoom]').forEach(btn => {
      btn.addEventListener('click', async () => {
        S._userPickedZoom = true;
        await applyZoomLevel(Number(btn.getAttribute('data-doc-zoom')) || 1, $('docCamVideo'));
        syncModalUi();
      });
    });

    const stg = $('docCamStage');
    if (stg) {
      stg.addEventListener('wheel', async ev => {
        if (S.mode !== 'camera' || !S.camLive) return;
        ev.preventDefault();
        S._userPickedZoom = true;
        const nextZ = Math.max(1, Math.min(3, Math.round((S.zoom + (ev.deltaY < 0 ? 0.25 : -0.25)) * 4) / 4));
        await applyZoomLevel(nextZ, $('docCamVideo'));
        syncModalUi();
      }, { passive: false });
    }

    $('docCamPrivacyBtn').addEventListener('click', () => {
      S.privacyMask = !S.privacyMask;
      syncModalUi();
    });

    $('docCamAutoSnapBtn').addEventListener('click', () => {
      S._userToggledAutoSnap = true;
      S.autoSnap = !S.autoSnap;
      S.steadyTicks = 0;
      S.awaitingPageTurn = false;
      S.lastAutoSnapSig = null;
      syncModalUi();
    });

    $('docCamPhoneQrBtn').addEventListener('click', () => {
      if (S.mode === 'qr') startLocalCameraStream();
      else openPhoneQrMode();
    });
    $('docCamFallbackQrBtn').addEventListener('click', openPhoneQrMode);
    $('docCamBackToLocalBtn').addEventListener('click', startLocalCameraStream);

    $('docCamCopyQrLinkBtn').addEventListener('click', async () => {
      if (!S.qrUrl) return;
      try {
        await navigator.clipboard.writeText(S.qrUrl);
        showToast('Phone scanner link copied to clipboard', 'ok');
      } catch (_) {
        showToast(S.qrUrl, 'ok');
      }
    });

    $('docCamSwitchBtn').addEventListener('click', () => {
      if (S.devices.length > 1) {
        S.deviceIdx = (S.deviceIdx + 1) % S.devices.length;
      } else {
        S.facingMode = S.facingMode === 'environment' ? 'user' : 'environment';
      }
      startLocalCameraStream();
    });

    $('docCamRetryBtn').addEventListener('click', startLocalCameraStream);
    $('docCamSnapBtn').addEventListener('click', () => snapDocumentFromStage({ autoTriggered: false }));

    $('docCamRetakeBtn').addEventListener('click', () => {
      S.replaceOnSnap = true;
      S.awaitingPageTurn = false;
      S.lastAutoSnapSig = null;
      startLocalCameraStream();
    });
    $('docCamAddMoreBtn').addEventListener('click', () => {
      S.replaceOnSnap = false;
      S.awaitingPageTurn = false;
      S.lastAutoSnapSig = null;
      startLocalCameraStream();
    });

    modal.querySelectorAll('#docCamEnhanceBar [data-doc-enhance]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pg = S.pages[S.activeIdx];
        if (!pg) return;
        pg.enhanceMode = btn.getAttribute('data-doc-enhance') || 'clean';
        S.enhanceMode = pg.enhanceMode;
        await rebuildPageOutput(pg);
        syncModalUi();
      });
    });

    $('docCamRotateBtn').addEventListener('click', async () => {
      const pg = S.pages[S.activeIdx];
      if (!pg) return;
      pg.rotation = ((pg.rotation || 0) + 90) % 360;
      await rebuildPageOutput(pg);
      syncModalUi();
    });

    $('docCamAdjustBtn').addEventListener('click', () => {
      if (!S.pages[S.activeIdx] || !S.pages[S.activeIdx].rawCanvas) return;
      S.mode = 'adjust_crop';
      syncModalUi();
    });

    $('docCamApplyCropBtn').addEventListener('click', async () => {
      const pg = S.pages[S.activeIdx];
      if (!pg) return;
      await rebuildPageOutput(pg);
      S.mode = 'preview';
      syncModalUi();
    });

    wireCornerDragOnCanvas(
      $('docCamOverlayCanvas'),
      () => (S.pages[S.activeIdx] ? S.pages[S.activeIdx].quadNorm : null),
      nextQ => { if (S.pages[S.activeIdx]) S.pages[S.activeIdx].quadNorm = nextQ; }
    );

    const nativeInp = $('docCamNativeInput');
    const pickNative = () => { if (nativeInp) nativeInp.click(); };
    $('docCamNativeBtn').addEventListener('click', pickNative);
    $('docCamFallbackPickBtn').addEventListener('click', pickNative);
    nativeInp.addEventListener('change', async () => {
      const picked = nativeInp.files ? Array.from(nativeInp.files) : [];
      nativeInp.value = '';
      if (!picked.length) return;
      const outFiles = S.pages.map(p => p.file).filter(Boolean).concat(picked);
      const cb = S.onCapture;
      closeDocumentScanner();
      if (typeof cb === 'function') await cb(outFiles, 'Camera Scan');
    });

    $('docCamConfirmBtn').addEventListener('click', async () => {
      const outFiles = S.pages.map(p => p.file).filter(Boolean);
      if (!outFiles.length) return;
      const cb = S.onCapture;
      closeDocumentScanner();
      if (typeof cb === 'function') await cb(outFiles, 'Camera Scan');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !S.open) return;
      if (S.mode === 'camera') {
        const live = S.stream && S.stream.getTracks().some(t => t.readyState === 'live');
        if (!live) startLocalCameraStream();
      } else if (S.mode === 'qr') {
        checkQrRemoteOnce();
      }
    });
    window.addEventListener('focus', () => {
      if (S.open && S.mode === 'qr') checkQrRemoteOnce();
    });
    window.addEventListener('pagehide', () => { if (S.open) stopCameraTracks(); });
  }

  function closeDocumentScanner() {
    S.open = false;
    S.onCapture = null;
    stopQrPolling();
    stopCameraTracks();
    revokeAllPageUrls();
    (S.pages || []).forEach(p => {
      if (p && p.rawPreviewUrl) { try { URL.revokeObjectURL(p.rawPreviewUrl); } catch (_) {} }
    });
    S.pages = [];
    S.activeIdx = -1;
    S.qrSid = '';
    S.qrTok = '';
    const modal = $('docCameraModal');
    if (modal) modal.hidden = true;
  }

  function openDocumentScanner(onCaptureFiles, opts = {}) {
    const modal = ensureModalDom();
    revokeAllPageUrls();
    S.open = true;
    S.mode = 'camera';
    S.pages = [];
    S.activeIdx = -1;
    S.replaceOnSnap = false;
    S._userPickedZoom = false;
    S.preset = (opts && opts.preset) || resolveDefaultPreset();
    S.lastCardSubPreset = S.preset === 'vin'
      ? 'vin'
      : (/trd_/i.test(String((window.STATE && window.STATE.view) || '')) ? 'vin' : 'card');
    S._userToggledAutoSnap = Boolean(opts && typeof opts.autoSnap === 'boolean');
    S.autoSnap = S._userToggledAutoSnap ? Boolean(opts.autoSnap) : defaultAutoSnapForPreset(S.preset);
    S.awaitingPageTurn = false;
    S.lastAutoSnapSig = null;
    S.missingTicksSinceSnap = 0;
    S.nextAutoSnapAllowedAt = 0;
    S.enhanceMode = defaultEnhanceForPreset(S.preset);
    S.privacyMask = true;
    S.onCapture = onCaptureFiles;
    modal.hidden = false;
    syncModalUi();
    if (!IS_TEST_HARNESS) {
      startLocalCameraStream();
    } else {
      S.camStarting = false;
      S.camLive = false;
      syncModalUi();
    }
  }

  // ==========================================================================
  // 5. DEDICATED MOBILE COMPANION SCANNER (?ps=<sid>.<tok>.<p> or ?phone_scan=...)
  // ==========================================================================
  function parsePhoneCompanionParams() {
    const sp = new URLSearchParams(location.search || '');
    const psCompact = sp.get('ps');
    if (psCompact && psCompact.includes('.')) {
      const parts = psCompact.split('.');
      const pMap = { r: 'receipt', d: 'document', c: 'card', v: 'vin' };
      return {
        sid: parts[0] || '',
        tok: parts[1] || '',
        preset: pMap[parts[2]] || 'receipt'
      };
    }
    const sid = sp.get('phone_scan');
    if (sid) {
      return {
        sid,
        tok: sp.get('k') || '',
        preset: sp.get('preset') || 'receipt'
      };
    }
    return null;
  }

  function mountPhoneCompanionScannerIfRequested() {
    const cfg = parsePhoneCompanionParams();
    if (!cfg || !cfg.sid || !cfg.tok) return false;
    document.documentElement.classList.add('phone-scan-companion');
    S.preset = cfg.preset;
    S.lastCardSubPreset = S.preset === 'vin' ? 'vin' : 'card';
    S._userToggledAutoSnap = false;
    S.autoSnap = defaultAutoSnapForPreset(S.preset);
    S.awaitingPageTurn = false;
    S.lastAutoSnapSig = null;
    S.enhanceMode = defaultEnhanceForPreset(S.preset);
    S.facingMode = 'environment';
    S.zoom = 1;
    S.privacyMask = true;

    const shell = document.createElement('main');
    shell.id = 'phoneScanCompanionShell';
    shell.className = 'psc-shell';
    shell.innerHTML = `
      <header class="psc-header">
        <div class="psc-brand">
          <small>ISABI MOBILE SCANNER</small>
          <strong>Scan Document to Computer</strong>
        </div>
        <span class="badge badge-ok" id="pscStatusBadge">Paired</span>
      </header>
      <div class="doc-cam-preset-bar" id="pscPresetBar">
        <button type="button" class="doc-cam-pill-btn ${S.preset === 'receipt' ? 'active' : ''}" data-psc-preset="receipt">Receipt / Slip</button>
        <button type="button" class="doc-cam-pill-btn ${S.preset === 'document' ? 'active' : ''}" data-psc-preset="document">Document / A4</button>
        <button type="button" class="doc-cam-pill-btn ${(S.preset === 'card' || S.preset === 'vin') ? 'active' : ''}" data-psc-preset="card">ID / VIN / Card</button>
      </div>
      <div class="doc-cam-card-subbar" id="pscCardSubBar" role="group" aria-label="Card or VIN format" ${(S.preset === 'card' || S.preset === 'vin') ? '' : 'hidden'}>
        <span class="doc-cam-subbar-lbl">Format:</span>
        <button type="button" class="doc-cam-pill-btn ${S.preset === 'card' ? 'active' : ''}" data-psc-subpreset="card">ID / Business Card</button>
        <button type="button" class="doc-cam-pill-btn ${S.preset === 'vin' ? 'active' : ''}" data-psc-subpreset="vin">VIN / Chassis Strip (4.5:1)</button>
      </div>
      <div class="doc-cam-tools-bar" id="pscToolsBar">
        <div class="doc-cam-zoom-group" id="pscZoomBar">
          <button type="button" class="doc-cam-zoom-btn active" data-psc-zoom="1" data-no-i18n="1">1x</button>
          <button type="button" class="doc-cam-zoom-btn" data-psc-zoom="1.5" data-no-i18n="1">1.5x</button>
          <button type="button" class="doc-cam-zoom-btn" data-psc-zoom="2" data-no-i18n="1">2x</button>
        </div>
        <button type="button" class="doc-cam-pill-btn ${S.autoSnap ? 'active' : ''}" id="pscAutoSnapBtn">${ic('bolt')} Auto-Snap</button>
      </div>
      <div class="psc-sent-banner" id="pscSentBanner" hidden>${ic('check_circle')} Sent to your computer! Snap another page or close this tab.</div>
      <div class="psc-cam-stage" id="pscStage" data-doc-preset="${esc(S.preset)}">
        <video id="pscVideo" class="doc-cam-video" autoplay muted playsinline poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video>
        <canvas id="pscOverlay" class="doc-cam-overlay-canvas"></canvas>
        <div class="doc-cam-guide has-privacy-mask" id="pscGuide">
          <i class="dc-corner tl"></i><i class="dc-corner tr"></i><i class="dc-corner bl"></i><i class="dc-corner br"></i>
          <div class="doc-cam-privacy-tag">${ic('shield')} Document Only · Auto-Crop</div>
          <span class="doc-cam-guide-msg">${esc(presetGuideLabel(S.preset, false))}</span>
        </div>
        <img id="pscPreviewImg" class="doc-cam-preview-img" alt="Mobile cropped scan" hidden>
      </div>
      <div class="doc-cam-enhance-bar" id="pscEnhanceBar" hidden>
        <button type="button" class="doc-cam-pill-btn active" data-psc-enhance="clean">Auto Clean</button>
        <button type="button" class="doc-cam-pill-btn" data-psc-enhance="bw">Crisp B&amp;W</button>
        <button type="button" class="doc-cam-pill-btn" data-psc-enhance="color">Color</button>
        <button type="button" class="doc-cam-pill-btn" id="pscRotateBtn">${ic('rotate')} Rotate 90°</button>
      </div>
      <div class="doc-cam-batch-tray" id="pscTray" hidden></div>
      <div class="psc-foot">
        <input type="file" id="pscFileInput" accept="image/*" multiple capture="environment" hidden>
        <button type="button" class="btn btn-outline-bar" id="pscPickBtn">${ic('upload')} Photo Library</button>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-outline-bar" id="pscRetakeBtn" hidden>${ic('rotate')} Retake</button>
          <button type="button" class="btn btn-outline-bar" id="pscMoreBtn" hidden>+ Page</button>
          <button type="button" class="btn btn-brass" id="pscSnapBtn">${ic('scan_doc')} Capture Document</button>
          <button type="button" class="btn btn-brass" id="pscSendBtn" hidden>${ic('upload')} Send to Computer</button>
        </div>
      </div>
    `;
    document.body.appendChild(shell);

    pushPhoneRelayState(cfg.sid, cfg.tok, { status: 'connected' }).catch(() => {});

    const pscPages = [];
    let pscIdx = -1;

    const syncPscUi = () => {
      const hasPrev = pscIdx >= 0 && Boolean(pscPages[pscIdx]) && !S.camLive;
      $('pscStage').setAttribute('data-doc-preset', S.preset);
      const pscSub = $('pscCardSubBar');
      if (pscSub) pscSub.hidden = !(S.preset === 'card' || S.preset === 'vin');
      shell.querySelectorAll('[data-psc-preset]').forEach(b => {
        const bp = b.getAttribute('data-psc-preset');
        b.classList.toggle('active', bp === 'card' ? (S.preset === 'card' || S.preset === 'vin') : (bp === S.preset));
      });
      shell.querySelectorAll('[data-psc-subpreset]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-psc-subpreset') === S.preset);
      });
      $('pscAutoSnapBtn').classList.toggle('active', S.autoSnap);
      const pscGMsg = $('pscGuide') && $('pscGuide').querySelector('.doc-cam-guide-msg');
      if (pscGMsg && (!S.liveQuad || S.awaitingPageTurn)) {
        pscGMsg.textContent = presetGuideLabel(S.preset, false, S.awaitingPageTurn);
      }
      $('pscVideo').hidden = !S.camLive;
      $('pscGuide').hidden = !S.camLive;
      $('pscPreviewImg').hidden = !hasPrev;
      if (hasPrev) $('pscPreviewImg').src = pscPages[pscIdx].previewUrl;
      $('pscEnhanceBar').hidden = !hasPrev;
      $('pscSnapBtn').hidden = !S.camLive;
      $('pscRetakeBtn').hidden = !hasPrev;
      $('pscMoreBtn').hidden = !(hasPrev && pscPages.length < 6);
      $('pscSendBtn').hidden = !pscPages.length;
      $('pscSendBtn').innerHTML = pscPages.length > 1
        ? `${ic('check')} Send ${pscPages.length} Pages`
        : `${ic('check')} Send to Computer`;
      if (hasPrev) {
        shell.querySelectorAll('[data-psc-enhance]').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-psc-enhance') === pscPages[pscIdx].enhanceMode);
        });
      }
    };

    const startRearCam = async () => {
      stopCameraTracks();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || IS_TEST_HARNESS) {
        S.camLive = false;
        syncPscUi();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2200 }, height: { ideal: 1650 } },
          audio: false
        }).catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
        S.stream = stream;
        S.mode = 'camera';
        S.camLive = true;
        const vid = $('pscVideo');
        vid.srcObject = stream;
        try { await vid.play(); } catch (_) {}
        await applyZoomLevel(S.zoom, vid);
        syncPscUi();
        startLiveCvLoop($('pscStage'), vid, $('pscGuide'), $('pscOverlay'));
      } catch (_) {
        S.camLive = false;
        syncPscUi();
      }
    };

    shell.querySelectorAll('[data-psc-preset]').forEach(b => {
      b.addEventListener('click', () => {
        const clicked = b.getAttribute('data-psc-preset') || 'receipt';
        S.preset = clicked === 'card'
          ? ((S.preset === 'card' || S.preset === 'vin') ? S.preset : (S.lastCardSubPreset || 'card'))
          : clicked;
        S.enhanceMode = defaultEnhanceForPreset(S.preset);
        if (!S._userToggledAutoSnap) S.autoSnap = defaultAutoSnapForPreset(S.preset);
        S.awaitingPageTurn = false;
        S.lastAutoSnapSig = null;
        syncPscUi();
      });
    });

    shell.querySelectorAll('[data-psc-subpreset]').forEach(b => {
      b.addEventListener('click', () => {
        const sub = b.getAttribute('data-psc-subpreset') || 'card';
        S.preset = sub;
        S.lastCardSubPreset = sub;
        S.enhanceMode = defaultEnhanceForPreset(S.preset);
        if (!S._userToggledAutoSnap) S.autoSnap = defaultAutoSnapForPreset(S.preset);
        S.awaitingPageTurn = false;
        S.lastAutoSnapSig = null;
        syncPscUi();
      });
    });

    shell.querySelectorAll('[data-psc-zoom]').forEach(b => {
      b.addEventListener('click', async () => {
        await applyZoomLevel(Number(b.getAttribute('data-psc-zoom')) || 1, $('pscVideo'));
        shell.querySelectorAll('[data-psc-zoom]').forEach(x => x.classList.toggle('active', x === b));
      });
    });

    $('pscAutoSnapBtn').addEventListener('click', () => {
      S._userToggledAutoSnap = true;
      S.autoSnap = !S.autoSnap;
      S.awaitingPageTurn = false;
      S.lastAutoSnapSig = null;
      $('pscAutoSnapBtn').classList.toggle('active', S.autoSnap);
    });

    const pscSnap = async (snapOpts = {}) => {
      const autoTriggered = Boolean(snapOpts && snapOpts.autoTriggered);
      const vid = $('pscVideo');
      if (!vid || !vid.videoWidth) return;
      const stg = $('pscStage');
      const rawCanvas = captureZoomedStageCanvas(vid, stg, 1600);
      const gNorm = getGuideNormRectForStage(stg, $('pscGuide'));
      const quadNorm = S.liveQuad || detectDocumentQuadFromCanvas(rawCanvas, gNorm) || [
        { x: gNorm.x, y: gNorm.y },
        { x: gNorm.x + gNorm.w, y: gNorm.y },
        { x: gNorm.x + gNorm.w, y: gNorm.y + gNorm.h },
        { x: gNorm.x, y: gNorm.y + gNorm.h }
      ];
      if (autoTriggered && S.preset === 'document' && S.awaitingPageTurn) {
        const candSig = computeCanvasSignature64(rawCanvas, quadNorm);
        if (S.lastAutoSnapSig && signatureDiff(candSig, S.lastAutoSnapSig) < 6.5) return;
        S.awaitingPageTurn = false;
      }
      const pg = {
        id: 'mp_' + randomHex(6),
        rawCanvas,
        quadNorm,
        rotation: 0,
        enhanceMode: defaultEnhanceForPreset(S.preset),
        previewUrl: '',
        dataUrl: ''
      };
      await rebuildPageOutput(pg);
      if (pg.outCanvas) pg.dataUrl = pg.outCanvas.toDataURL('image/jpeg', 0.78);
      if (S.replaceOnSnap && pscIdx >= 0) pscPages[pscIdx] = pg;
      else { pscPages.push(pg); pscIdx = pscPages.length - 1; }
      const keepLivePsc = Boolean(autoTriggered && S.preset === 'document' && !S.replaceOnSnap && pscPages.length < 6);
      S.replaceOnSnap = false;
      if (keepLivePsc) {
        S.lastAutoSnapSig = computeCanvasSignature64(rawCanvas, quadNorm);
        S.awaitingPageTurn = true;
        S.missingTicksSinceSnap = 0;
        S.nextAutoSnapAllowedAt = Date.now() + 1400;
        S.steadyTicks = 0;
      } else {
        S.awaitingPageTurn = false;
        S.lastAutoSnapSig = null;
        stopCameraTracks();
      }
      $('pscSentBanner').hidden = true;
      syncPscUi();
    };
    S._pscSnapFn = pscSnap;
    $('pscSnapBtn').addEventListener('click', () => pscSnap({ autoTriggered: false }));

    shell.querySelectorAll('[data-psc-enhance]').forEach(b => {
      b.addEventListener('click', async () => {
        const pg = pscPages[pscIdx];
        if (!pg) return;
        pg.enhanceMode = b.getAttribute('data-psc-enhance') || 'clean';
        await rebuildPageOutput(pg);
        if (pg.outCanvas) pg.dataUrl = pg.outCanvas.toDataURL('image/jpeg', 0.78);
        syncPscUi();
      });
    });

    $('pscRotateBtn').addEventListener('click', async () => {
      const pg = pscPages[pscIdx];
      if (!pg) return;
      pg.rotation = ((pg.rotation || 0) + 90) % 360;
      await rebuildPageOutput(pg);
      if (pg.outCanvas) pg.dataUrl = pg.outCanvas.toDataURL('image/jpeg', 0.78);
      syncPscUi();
    });

    $('pscRetakeBtn').addEventListener('click', () => { S.replaceOnSnap = true; startRearCam(); });
    $('pscMoreBtn').addEventListener('click', () => { S.replaceOnSnap = false; startRearCam(); });

    $('pscPickBtn').addEventListener('click', () => $('pscFileInput').click());
    $('pscFileInput').addEventListener('change', async () => {
      const files = $('pscFileInput').files ? Array.from($('pscFileInput').files) : [];
      $('pscFileInput').value = '';
      for (let i = 0; i < files.length && pscPages.length < 6; i++) {
        const u = URL.createObjectURL(files[i]);
        const img = new Image();
        await new Promise(res => { img.onload = res; img.onerror = res; img.src = u; });
        try { URL.revokeObjectURL(u); } catch (_) {}
        if (!img.naturalWidth) continue;
        const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * sc);
        c.height = Math.round(img.naturalHeight * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const detQ = detectDocumentQuadFromCanvas(c, { x: 0.04, y: 0.04, w: 0.92, h: 0.92 });
        const quadNorm = detQ || [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
        const qPx = quadNorm.map(p => ({ x: p.x * c.width, y: p.y * c.height }));
        await maskAnyFacesOutsideQuad(c, qPx);
        const pg = {
          id: 'mp_' + randomHex(6),
          rawCanvas: c,
          quadNorm,
          rotation: 0,
          enhanceMode: detQ ? defaultEnhanceForPreset(S.preset) : 'color',
          previewUrl: '',
          dataUrl: ''
        };
        await rebuildPageOutput(pg);
        if (pg.outCanvas) pg.dataUrl = pg.outCanvas.toDataURL('image/jpeg', 0.78);
        pscPages.push(pg);
        pscIdx = pscPages.length - 1;
      }
      stopCameraTracks();
      syncPscUi();
    });

    $('pscSendBtn').addEventListener('click', async () => {
      if (!pscPages.length) return;
      const btn = $('pscSendBtn');
      btn.disabled = true;
      btn.textContent = 'Sending...';
      const payloadPages = pscPages.map((p, idx) => ({
        id: p.id,
        fileName: `Phone_Scan_p${idx + 1}.jpg`,
        dataUrl: p.dataUrl
      }));
      await pushPhoneRelayState(cfg.sid, cfg.tok, { status: 'pages_ready', pages: payloadPages });
      btn.disabled = false;
      $('pscSentBanner').hidden = false;
      $('pscStatusBadge').textContent = 'Sent!';
      pscPages.length = 0;
      pscIdx = -1;
      syncPscUi();
    });

    if (window.MFG_I18N && typeof window.MFG_I18N.translateDom === 'function' && window.MFG_I18N.getLang() !== 'en') {
      registerScannerI18n();
      window.MFG_I18N.translateDom(shell);
    }
    startRearCam();
    return true;
  }

  // ==========================================================================
  // 6. CURATED TRILINGUAL (EN | AR | FR) DICTIONARY SELF-REGISTRATION
  // ==========================================================================
  const SCANNER_DICT_AR = {
    'ISABI DOCUMENT-ONLY SCANNER': 'الماسح الضوئي للمستندات فقط من ISABI',
    'Scan Receipt, Document or Card': 'مسح إيصال أو مستند أو بطاقة',
    'Starting Scanner...': 'جارٍ تشغيل الماسح...',
    'Use Phone Camera': 'استخدام كاميرا الهاتف',
    "Scan with your phone's rear camera via QR code": 'امسح بكاميرا هاتفك الخلفية عبر رمز QR',
    'Flip Lens': 'تبديل العدسة',
    'Close scanner': 'إغلاق الماسح',
    'Document size': 'مقاس المستند',
    'Receipt / Slip': 'إيصال / قسيمة',
    'Document / A4': 'مستند / A4',
    'ID / VIN / Card': 'هوية / شاسيه / بطاقة',
    'Camera zoom': 'تقريب الكاميرا',
    'Window Only': 'النافذة فقط',
    'Hides background and face outside the document window': 'يخفي الخلفية والوجه خارج نافذة المستند',
    'Auto-Snap': 'التقاط تلقائي',
    'Automatically snaps when document edges are held steady': 'يلتقط تلقائياً عند ثبات حواف المستند',
    'Scan enhancement': 'تحسين المسح',
    'Auto Clean': 'تنقية تلقائية',
    'Crisp B&W': 'أبيض وأسود حاد',
    'Original Crop': 'القص الأصلي',
    'Adjust Corners': 'ضبط الزوايا',
    'Apply Crop': 'تطبيق القص',
    'Rotate 90°': 'تدوير 90°',
    'Scan Document with Your Phone Camera': 'امسح المستند بكاميرا هاتفك',
    'Point your phone camera at this QR code and open the link.': 'وجّه كاميرا هاتفك إلى رمز QR هذا وافتح الرابط.',
    'Hold your phone over the receipt, A4 sheet, or card (auto-cropped, no sign-in required).': 'ضع هاتفك فوق الإيصال أو ورقة A4 أو البطاقة (قص تلقائي بدون تسجيل دخول).',
    'Tap Send to Computer on your phone and pages appear right here.': 'اضغط إرسال إلى الكمبيوتر على هاتفك لتظهر الصفحات هنا فوراً.',
    'Waiting for phone to scan QR...': 'بانتظار مسح رمز QR بالهاتف...',
    'Copy Link': 'نسخ الرابط',
    "Use This Device's Camera": 'استخدام كاميرا هذا الجهاز',
    'Document Only · Face Excluded': 'المستند فقط · استبعاد الوجه',
    'Auto-Crops to Paper Edges': 'قص تلقائي لحواف الورقة',
    'Hold receipt, delivery ticket, or slip inside window (document only)': 'ضع الإيصال أو قسيمة التسليم داخل النافذة (المستند فقط)',
    'Hold or place A4 document inside window (surroundings cropped out)': 'ضع مستند A4 داخل النافذة (يتم قص المحيط خارجها)',
    'Hold ID, VIN plate, or business card inside window (face stays excluded)': 'ضع الهوية أو لوحة الشاسيه أو بطاقة العمل داخل النافذة (مع استبعاد الوجه)',
    'Document locked in hand. Hold steady or click Capture.': 'تم تثبيت حواف المستند. اثبت أو اضغط التقاط.',
    'Starting Document Scanner...': 'جارٍ تشغيل ماسح المستندات...',
    'Only the document inside the target window is captured.': 'يتم التقاط المستند داخل النافذة المحددة فقط.',
    'Camera Unavailable': 'الكاميرا غير متاحة',
    'Allow camera access, scan via your phone QR above, or choose a file from your device.': 'اسمح بالوصول إلى الكاميرا، أو امسح عبر رمز QR للهاتف أعلاه، أو اختر ملفاً من جهازك.',
    'Retry Camera': 'إعادة محاولة الكاميرا',
    'Choose File': 'اختيار ملف',
    'Choose Image / Files': 'اختيار صورة / ملفات',
    'Cancel': 'إلغاء',
    'Retake': 'إعادة الالتقاط',
    '+ Add Page': '+ إضافة صفحة',
    'Capture Document': 'التقاط المستند',
    'Attach Scan': 'إرفاق المسح',
    'Scanner Ready': 'الماسح جاهز',
    '1 Cropped Scan Ready': 'مسح مقصوص واحد جاهز',
    'Phone Connected': 'تم اتصال الهاتف',
    'QR Pairing Ready': 'الاقتران عبر QR جاهز',
    'Phone Connected · Aiming Rear Camera...': 'الهاتف متصل · توجيه الكاميرا الخلفية...',
    'Camera Requires Secure HTTPS or Phone QR': 'تتطلب الكاميرا اتصال HTTPS آمناً أو رمز QR للهاتف',
    'Click Use Phone Camera to scan with your phone, or choose a file below.': 'اضغط استخدام كاميرا الهاتف للمسح بهاتفك، أو اختر ملفاً أدناه.',
    'Camera Permission Blocked': 'تم حظر إذن الكاميرا',
    'Allow camera access in your browser bar, click Use Phone Camera above, or pick an image file.': 'اسمح بالكاميرا في شريط المتصفح، أو اضغط استخدام كاميرا الهاتف أعلاه، أو اختر صورة.',
    'Camera Not Available': 'الكاميرا غير متوفرة',
    'Click Use Phone Camera to scan effortlessly from your phone, or pick a file from your device.': 'اضغط استخدام كاميرا الهاتف للمسح بسهولة من هاتفك، أو اختر ملفاً من جهازك.',
    'ISABI MOBILE SCANNER': 'الماسح المحمول من ISABI',
    'Scan Document to Computer': 'مسح المستند إلى الكمبيوتر',
    'Paired': 'مقترن',
    'Sent to your computer! Snap another page or close this tab.': 'تم الإرسال إلى الكمبيوتر! التقط صفحة أخرى أو أغلق هذه علامة التبويب.',
    'Document Only · Auto-Crop': 'المستند فقط · قص تلقائي',
    'Color': 'ملون',
    'Photo Library': 'مكتبة الصور',
    '+ Page': '+ صفحة',
    'Send to Computer': 'إرسال إلى الكمبيوتر',
    'Sending...': 'جارٍ الإرسال...',
    'Sent!': 'تم الإرسال!',
    'Cropped document scan preview': 'معاينة مسح المستند المقصوص',
    'Phone camera scan QR code': 'رمز QR للمسح بكاميرا الهاتف',
    'Mobile cropped scan': 'مسح مقصوص عبر الهاتف',
    'Document Crop · 1x': 'قص المستند · 1x',
    'Document Crop · 1.5x': 'قص المستند · 1.5x',
    'Document Crop · 2x': 'قص المستند · 2x',
    'Document Crop · 3x': 'قص المستند · 3x',
    'Format:': 'النسق:',
    'Card or VIN format': 'نسق البطاقة أو الشاسيه',
    'ID / Business Card': 'هوية / بطاقة عمل',
    'Standard card, driver license, or registration window': 'نافذة قياسية للبطاقة أو رخصة القيادة أو التسجيل',
    'VIN / Chassis Strip (4.5:1)': 'شريط رقم الشاسيه VIN (4.5:1)',
    'Narrow 4.5:1 strip for windshield and door-jamb 17-character VIN plates': 'شريط ضيق بنسبة 4.5:1 للوحات رقم الشاسيه المكون من 17 خانة على الزجاج أو الباب',
    'Align 17-character VIN or chassis plate inside narrow strip': 'ضع لوحة رقم الشاسيه (17 خانة) داخل الشريط الضيق',
    'VIN strip locked. Hold steady or click Capture.': 'تم تثبيت شريط الشاسيه. اثبت أو اضغط التقاط.',
    'Page captured! Turn to next page or click Attach.': 'تم التقاط الصفحة! اقلب للصفحة التالية أو اضغط إرفاق.',
    'Attach 2 Scans': 'إرفاق مسحين (2)',
    'Attach 3 Scans': 'إرفاق 3 مسوحات',
    'Attach 4 Scans': 'إرفاق 4 مسوحات',
    'Attach 5 Scans': 'إرفاق 5 مسوحات',
    'Attach 6 Scans': 'إرفاق 6 مسوحات',
    'Attach 7 Scans': 'إرفاق 7 مسوحات',
    'Attach 8 Scans': 'إرفاق 8 مسوحات',
    '2 Cropped Scans Ready': 'مسحان مقصوصان جاهزان',
    '3 Cropped Scans Ready': '3 مسوحات مقصوصة جاهزة',
    '4 Cropped Scans Ready': '4 مسوحات مقصوصة جاهزة',
    '5 Cropped Scans Ready': '5 مسوحات مقصوصة جاهزة',
    '6 Cropped Scans Ready': '6 مسوحات مقصوصة جاهزة',
    '7 Cropped Scans Ready': '7 مسوحات مقصوصة جاهزة',
    '8 Cropped Scans Ready': '8 مسوحات مقصوصة جاهزة',
    'Send 2 Pages': 'إرسال صفحتين',
    'Send 3 Pages': 'إرسال 3 صفحات',
    'Send 4 Pages': 'إرسال 4 صفحات',
    'Send 5 Pages': 'إرسال 5 صفحات',
    'Send 6 Pages': 'إرسال 6 صفحات',
    '1x': '1×',
    '1.5x': '1.5×',
    '2x': '2×',
    '3x': '3×'
  };

  const SCANNER_DICT_FR = {
    'ISABI DOCUMENT-ONLY SCANNER': 'SCANNER DOCUMENT UNIQUEMENT ISABI',
    'Scan Receipt, Document or Card': 'Scanner reçu, document ou carte',
    'Starting Scanner...': 'Démarrage du scanner...',
    'Use Phone Camera': 'Caméra du téléphone',
    "Scan with your phone's rear camera via QR code": 'Scanner avec la caméra arrière de votre téléphone via QR code',
    'Flip Lens': 'Changer de caméra',
    'Close scanner': 'Fermer le scanner',
    'Document size': 'Format du document',
    'Receipt / Slip': 'Reçu / Bordereau',
    'Document / A4': 'Document / A4',
    'ID / VIN / Card': 'Pièce ID / VIN / Carte',
    'Camera zoom': 'Zoom caméra',
    'Window Only': 'Fenêtre seule',
    'Hides background and face outside the document window': 'Masque le fond et le visage hors de la fenêtre du document',
    'Auto-Snap': 'Capture auto',
    'Automatically snaps when document edges are held steady': 'Capture automatiquement lorsque les bords du document sont stables',
    'Scan enhancement': 'Amélioration du scan',
    'Auto Clean': 'Nettoyage auto',
    'Crisp B&W': 'N&B net',
    'Original Crop': 'Recadrage original',
    'Adjust Corners': 'Ajuster les coins',
    'Apply Crop': 'Appliquer le recadrage',
    'Rotate 90°': 'Pivoter 90°',
    'Scan Document with Your Phone Camera': 'Scanner le document avec votre téléphone',
    'Point your phone camera at this QR code and open the link.': 'Pointez la caméra de votre téléphone vers ce QR code et ouvrez le lien.',
    'Hold your phone over the receipt, A4 sheet, or card (auto-cropped, no sign-in required).': 'Placez votre téléphone au-dessus du reçu, document A4 ou carte (recadrage auto, sans connexion).',
    'Tap Send to Computer on your phone and pages appear right here.': 'Appuyez sur Envoyer vers l’ordinateur sur votre téléphone et les pages apparaissent ici.',
    'Waiting for phone to scan QR...': 'En attente du scan QR par le téléphone...',
    'Copy Link': 'Copier le lien',
    "Use This Device's Camera": 'Caméra de cet appareil',
    'Document Only · Face Excluded': 'Document seul · Visage exclu',
    'Auto-Crops to Paper Edges': 'Recadrage auto aux bords du papier',
    'Hold receipt, delivery ticket, or slip inside window (document only)': 'Placez le reçu ou bon de livraison dans la fenêtre (document seul)',
    'Hold or place A4 document inside window (surroundings cropped out)': 'Placez le document A4 dans la fenêtre (l’arrière-plan est recadré)',
    'Hold ID, VIN plate, or business card inside window (face stays excluded)': 'Placez la carte, plaque VIN ou carte de visite dans la fenêtre (visage exclu)',
    'Document locked in hand. Hold steady or click Capture.': 'Document détecté. Maintenez stable ou cliquez sur Capturer.',
    'Starting Document Scanner...': 'Démarrage du scanner de documents...',
    'Only the document inside the target window is captured.': 'Seul le document situé dans la fenêtre cible est capturé.',
    'Camera Unavailable': 'Caméra indisponible',
    'Allow camera access, scan via your phone QR above, or choose a file from your device.': 'Autorisez la caméra, scannez le QR téléphone ci-dessus, ou choisissez un fichier.',
    'Retry Camera': 'Réessayer la caméra',
    'Choose File': 'Choisir un fichier',
    'Choose Image / Files': 'Choisir image / fichiers',
    'Cancel': 'Annuler',
    'Retake': 'Reprendre',
    '+ Add Page': '+ Ajouter une page',
    'Capture Document': 'Capturer le document',
    'Attach Scan': 'Joindre le scan',
    'Scanner Ready': 'Scanner prêt',
    '1 Cropped Scan Ready': '1 scan recadré prêt',
    'Phone Connected': 'Téléphone connecté',
    'QR Pairing Ready': 'Jumelage QR prêt',
    'Phone Connected · Aiming Rear Camera...': 'Téléphone connecté · Visée caméra arrière...',
    'Camera Requires Secure HTTPS or Phone QR': 'La caméra requiert HTTPS ou le QR téléphone',
    'Click Use Phone Camera to scan with your phone, or choose a file below.': 'Cliquez sur Caméra du téléphone ou choisissez un fichier ci-dessous.',
    'Camera Permission Blocked': 'Accès caméra bloqué',
    'Allow camera access in your browser bar, click Use Phone Camera above, or pick an image file.': 'Autorisez la caméra dans la barre du navigateur, utilisez le QR téléphone, ou choisissez une image.',
    'Camera Not Available': 'Caméra non disponible',
    'Click Use Phone Camera to scan effortlessly from your phone, or pick a file from your device.': 'Cliquez sur Caméra du téléphone pour scanner depuis votre mobile, ou choisissez un fichier.',
    'ISABI MOBILE SCANNER': 'SCANNER MOBILE ISABI',
    'Scan Document to Computer': 'Scanner vers l’ordinateur',
    'Paired': 'Jumelé',
    'Sent to your computer! Snap another page or close this tab.': 'Envoyé à votre ordinateur ! Capturez une autre page ou fermez cet onglet.',
    'Document Only · Auto-Crop': 'Document seul · Recadrage auto',
    'Color': 'Couleur',
    'Photo Library': 'Photothèque',
    '+ Page': '+ Page',
    'Send to Computer': 'Envoyer vers l’ordinateur',
    'Sending...': 'Envoi en cours...',
    'Sent!': 'Envoyé !',
    'Cropped document scan preview': 'Aperçu du document recadré',
    'Phone camera scan QR code': 'QR code de scan caméra téléphone',
    'Mobile cropped scan': 'Scan mobile recadré',
    'Document Crop · 1x': 'Recadrage document · 1x',
    'Document Crop · 1.5x': 'Recadrage document · 1.5x',
    'Document Crop · 2x': 'Recadrage document · 2x',
    'Document Crop · 3x': 'Recadrage document · 3x',
    'Format:': 'Format :',
    'Card or VIN format': 'Format carte ou VIN',
    'ID / Business Card': 'Pièce ID / Carte de visite',
    'Standard card, driver license, or registration window': 'Fenêtre standard pour carte, permis de conduire ou carte grise',
    'VIN / Chassis Strip (4.5:1)': 'Bande VIN / Châssis (4.5:1)',
    'Narrow 4.5:1 strip for windshield and door-jamb 17-character VIN plates': 'Bande étroite 4.5:1 pour plaques VIN à 17 caractères sur pare-brise ou montant de porte',
    'Align 17-character VIN or chassis plate inside narrow strip': 'Alignez la plaque VIN à 17 caractères dans la bande étroite',
    'VIN strip locked. Hold steady or click Capture.': 'Bande VIN détectée. Maintenez stable ou cliquez sur Capturer.',
    'Page captured! Turn to next page or click Attach.': 'Page capturée ! Tournez la page suivante ou cliquez sur Joindre.',
    'Attach 2 Scans': 'Joindre 2 scans',
    'Attach 3 Scans': 'Joindre 3 scans',
    'Attach 4 Scans': 'Joindre 4 scans',
    'Attach 5 Scans': 'Joindre 5 scans',
    'Attach 6 Scans': 'Joindre 6 scans',
    'Attach 7 Scans': 'Joindre 7 scans',
    'Attach 8 Scans': 'Joindre 8 scans',
    '2 Cropped Scans Ready': '2 scans recadrés prêts',
    '3 Cropped Scans Ready': '3 scans recadrés prêts',
    '4 Cropped Scans Ready': '4 scans recadrés prêts',
    '5 Cropped Scans Ready': '5 scans recadrés prêts',
    '6 Cropped Scans Ready': '6 scans recadrés prêts',
    '7 Cropped Scans Ready': '7 scans recadrés prêts',
    '8 Cropped Scans Ready': '8 scans recadrés prêts',
    'Send 2 Pages': 'Envoyer 2 pages',
    'Send 3 Pages': 'Envoyer 3 pages',
    'Send 4 Pages': 'Envoyer 4 pages',
    'Send 5 Pages': 'Envoyer 5 pages',
    'Send 6 Pages': 'Envoyer 6 pages',
    '1x': '1×',
    '1.5x': '1.5×',
    '2x': '2×',
    '3x': '3×'
  };

  function registerScannerI18n() {
    const api = window.MFG_I18N;
    if (!api || typeof api.registerLocale !== 'function') return;
    const supported = typeof api.getSupportedLocales === 'function' ? api.getSupportedLocales() : [];
    const arMeta = supported.find(l => l && l.code === 'ar') || { code: 'ar', label: 'عربي', shortLabel: 'AR', nativeName: 'العربية', dir: 'rtl', bcp47: 'ar-LB' };
    const frMeta = supported.find(l => l && l.code === 'fr') || { code: 'fr', label: 'FR', shortLabel: 'FR', nativeName: 'Français', dir: 'ltr', bcp47: 'fr-FR' };
    api.registerLocale('ar', arMeta, SCANNER_DICT_AR);
    api.registerLocale('fr', frMeta, SCANNER_DICT_FR);
  }

  function bootDocScanner() {
    registerScannerI18n();
    mountPhoneCompanionScannerIfRequested();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootDocScanner, { once: true });
  } else {
    bootDocScanner();
  }
  window.addEventListener('mfg:sw-updated', registerScannerI18n);

  window.MFG_DOC_SCANNER = {
    open: openDocumentScanner,
    close: closeDocumentScanner,
    encodeQrSvg,
    encodeQrMatrix,
    detectDocumentQuadFromCanvas,
    computeCanvasSignature64,
    signatureDiff,
    warpPerspectiveQuad,
    applyScanFilter,
    maskAnyFacesOutsideQuad,
    ingestReceivedPhonePages,
    openPhoneQrMode,
    checkQrRemoteOnce,
    snapCanvasForBatchTest,
    registerScannerI18n,
    state: () => S,
    _toast: null
  };
})();
