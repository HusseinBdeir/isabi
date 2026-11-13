// ISABI Manufacturing Command — On-Device Biometric Face ID Engine (js/face.js)
// Shared architecture with BHFIRMS Attendance PWA (Attendance.md / PWA.md §4):
//   - Pipeline: SSD MobileNet v1 detector (Tiny Face Detector fallback + liveness fast path)
//               -> Full 68-point face landmarks -> 128-d Euclidean descriptor.
//   - Accept rule (Face.decide): nearest sample <= threshold (0.50) AND nearest sample of
//     any OTHER user is >= margin (0.08) further away; 3 consecutive frames confirm match.
//   - Enrolment: 3 guided poses (straight, slightly left, slightly right) with camera-top
//     SVG pictograms (poseSvg), minFaceFrac 14%, enrolScore 0.70, and separation check.
//   - Models are served from ./vendor/models and cached by sw.js for 100% offline operation.

const MFG_FACE_CONFIG = {
  match: {
    detector: "ssd",          // "ssd" = SSD MobileNet v1 (~5.6 MB) | "tiny" = Tiny Face Detector
    threshold: 0.50,
    margin: 0.08,             // required gap between best match and runner-up person
    weakAbove: 0.45,          // accepted but flagged as weak match above this distance
    minSamples: 3,            // 3 guided poses required before a seat's Face ID is active
    maxSamples: 3,
    confirmFrames: 3,         // same user across 3 consecutive frames before sign-in
    unknownFrames: 3,         // unknown face across 3 consecutive frames before PIN hint
    minFaceFrac: 0.14,        // ignore background faces narrower than 14% of frame width
    detectorInputSize: 320,
    detectorScore: 0.24,      // single-pass backlit-friendly threshold (avoids duplicate SSD pass)
    enrolScore: 0.70,
    poses: [
      "Look straight at the camera",
      "Turn your head slightly LEFT — just a little, keep both eyes on the camera",
      "Turn your head slightly RIGHT — just a little, keep both eyes on the camera"
    ],
    poseIcons: ["straight", "left", "right"]
  },
  liveness: {
    enabled: true,
    mode: "blink_or_turn",    // "blink_or_turn" | "blink_strict" | "multiframe_only"
    earClosed: 0.228,
    earOpen: 0.240,
    earDropMin: 0.024,        // relative EAR drop from open baseline for fast webcam blinks
    yawSpanMin: 0.020,        // 3D nose-to-jaw yaw span across frames
    parallaxSpanMin: 0.010,   // 3D nose-over-cheek vs nose-over-eye differential parallax
    earVarianceMin: 0.005,    // non-rigid eye variance required alongside head turn (rejects tilted 2D photos)
    windowSec: 6
  },
  snapshotWidth: 240,
  snapshotQuality: 0.78
};

const Face = (() => {
  let ready = false;
  let detectorReady = false;
  let loading = null;
  let detectorLoading = null;
  let faceApiScriptPromise = null;
  let backend = "?";
  let detector = "tiny";
  let landmarksTiny = true;

  const M = () => MFG_FACE_CONFIG.match;

  function ensureFaceApiScript(immediate = false) {
    if (typeof faceapi !== "undefined") return Promise.resolve();
    if (faceApiScriptPromise) return faceApiScriptPromise;
    if (typeof document === "undefined") return Promise.reject(new Error("document unavailable"));
    faceApiScriptPromise = new Promise((resolve, reject) => {
      const inject = () => {
        if (typeof faceapi !== "undefined") { resolve(); return; }
        const s = document.createElement("script");
        s.src = "./vendor/face-api.js?v=1";
        s.async = true;
        s.onload = () => (typeof faceapi !== "undefined" ? resolve() : reject(new Error("face-api.js loaded without global")));
        s.onerror = () => {
          faceApiScriptPromise = null;
          try { s.remove(); } catch (_) {}
          reject(new Error("Failed to load vendor/face-api.js"));
        };
        (document.head || document.documentElement).appendChild(s);
      };
      if (immediate || document.readyState === "complete") {
        inject();
      } else {
        window.addEventListener("load", () => setTimeout(inject, 0), { once: true });
      }
    });
    return faceApiScriptPromise;
  }

  function opts(which) {
    const d = which || detector;
    if (d === "ssd") return new faceapi.SsdMobilenetv1Options({ minConfidence: M().detectorScore });
    return new faceapi.TinyFaceDetectorOptions({ inputSize: M().detectorInputSize, scoreThreshold: M().detectorScore });
  }

  let earlyStreamObj = null;
  let earlyStreamPromise = null;
  let earlyCancelled = false;
  let earlyConsumed = false;
  let earlyPreviewTimer = null;
  let earlyPreviewBusy = false;
  const trackedStreams = new Set();

  function clearEarlyPreviewTimer() {
    if (earlyPreviewTimer) {
      clearTimeout(earlyPreviewTimer);
      earlyPreviewTimer = null;
    }
  }

  function trackStream(s) {
    if (s) trackedStreams.add(s);
    return s;
  }

  function stopStreamTracks(s) {
    if (!s || typeof s.getTracks !== "function") return;
    try { s.getTracks().forEach(t => t.stop()); } catch (_) {}
  }

  function preferredVideoConstraints() {
    const portrait = typeof window !== "undefined" && window.innerHeight > window.innerWidth;
    return portrait
      ? { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 }, frameRate: { ideal: 15, max: 20 } }
      : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 20 } };
  }

  function stopAllStreams() {
    earlyCancelled = true;
    earlyConsumed = false;
    clearEarlyPreviewTimer();
    if (earlyStreamObj) {
      stopStreamTracks(earlyStreamObj);
      earlyStreamObj = null;
    }
    earlyStreamPromise = null;
    trackedStreams.forEach(s => stopStreamTracks(s));
    trackedStreams.clear();
    if (typeof document !== "undefined") {
      const vp = document.getElementById("authCamViewport");
      if (vp) vp.classList.remove("is-video-ready", "is-matching");
      ["authFaceVideo", "enrolFaceVideo"].forEach(id => {
        const v = document.getElementById(id);
        if (v) {
          if (v.srcObject) stopStreamTracks(v.srcObject);
          try { v.pause(); } catch (_) {}
          v.srcObject = null;
        }
      });
    }
  }

  function startEarlyPreviewLoop(s) {
    clearEarlyPreviewTimer();
    const tick = async () => {
      earlyPreviewTimer = null;
      if (earlyCancelled || earlyConsumed || !earlyStreamObj || earlyStreamObj !== s) return;
      if (typeof document === "undefined") return;
      const gNow = document.getElementById("authGate");
      const vNow = document.getElementById("authFaceVideo");
      if (!gNow || gNow.hidden || !vNow || vNow.srcObject !== s) return;
      if (!earlyPreviewBusy && (detectorReady || ready) && vNow.readyState >= 2 && vNow.videoWidth > 0) {
        earlyPreviewBusy = true;
        try {
          const det = await detectOne(vNow, false);
          if (!earlyCancelled && !earlyConsumed && vNow.srcObject === s) {
            const ov = document.getElementById("authFaceOverlay");
            const singleFace = Boolean(det && !det.multiple);
            if (ov) drawOverlay(ov, vNow, det, singleFace ? "#16A34A" : "#B8883B", "");
            const hint = document.getElementById("authFaceHint");
            if (hint) {
              if (singleFace && /Loading Face ID|Starting|Preparing|Look at camera/i.test(hint.textContent || "")) {
                hint.textContent = "Verifying Face ID\u2026";
                hint.className = "auth-face-hint ok";
              } else if (/Loading Face ID|Starting|Preparing/i.test(hint.textContent || "")) {
                hint.textContent = "Look at camera for automatic Face ID";
                hint.className = "auth-face-hint ok";
              }
            }
          }
        } catch (_) {
        } finally {
          earlyPreviewBusy = false;
        }
      }
      if (!earlyCancelled && !earlyConsumed && earlyStreamObj === s) {
        earlyPreviewTimer = setTimeout(tick, ready ? 32 : 90);
      }
    };
    earlyPreviewTimer = setTimeout(tick, 16);
  }

  // ---- Face ID on demand ---------------------------------------------------------------------------
  // The engine (1.3 MB script) and its weights (6.4 MB to 12 MB) are fetched only on a device that uses
  // Face ID: a kiosk station, a device where Face ID has been started before, or a browser that has
  // already granted this site the camera. Everyone else gets the "Tap for Face ID" overlay and pays
  // nothing until they tap it.
  const FACE_DEVICE_KEY = "isabi_mfg_face_device_v1";
  let gateAutoNow = false;
  let gateAutoPromise = null;

  function isKioskBoot() {
    try {
      const kParam = String(new URLSearchParams(window.location.search || "").get("kiosk") || "").toLowerCase();
      return kParam === "attendance" || kParam === "sales" || kParam === "raw" || kParam === "fuel" || /ISABIKiosk\//i.test(navigator.userAgent || "");
    } catch (_) {
      return false;
    }
  }

  // Device setting: "1" = Face ID is used here, "0" = paused here by a person, absent = never asked for.
  function readDeviceFaceSetting() {
    try { return localStorage.getItem(FACE_DEVICE_KEY); } catch (_) { return null; }
  }

  function deviceUsesFaceId() {
    return readDeviceFaceSetting() === "1";
  }

  // Called once the engine has really loaded (never on a mere attempt), and again whenever it is asked for.
  function markDeviceUsesFaceId() {
    gateAutoNow = true;
    gateAutoPromise = Promise.resolve(true);
    try { localStorage.setItem(FACE_DEVICE_KEY, "1"); } catch (_) {}
  }

  // "Pause Camera" on the sign-in screen: the person does not want Face ID here. Recorded as "0" so it also
  // holds on browsers that keep the camera permission; "Tap for Face ID" turns it back on.
  function forgetDeviceFaceId() {
    if (isKioskBoot()) return;
    gateAutoNow = false;
    gateAutoPromise = Promise.resolve(false);
    try { localStorage.setItem(FACE_DEVICE_KEY, "0"); } catch (_) {}
  }

  // "Tap for Face ID" after a pause: lift the pause; the device is marked again once the engine has loaded.
  function resumeDeviceFaceId() {
    if (readDeviceFaceSetting() !== "0") return;
    try { localStorage.removeItem(FACE_DEVICE_KEY); } catch (_) {}
    gateAutoPromise = null;
  }

  function cameraAlreadyGranted() {
    try {
      if (!navigator.permissions || typeof navigator.permissions.query !== "function") return Promise.resolve(false);
      return navigator.permissions.query({ name: "camera" }).then(st => Boolean(st && st.state === "granted")).catch(() => false);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  // Resolves true when the sign-in screen should start the camera and the engine by itself.
  function gateAutoStart() {
    if (gateAutoPromise) return gateAutoPromise;
    if (typeof window === "undefined") return Promise.resolve(false);
    const setting = readDeviceFaceSetting();
    if (isKioskBoot() || setting === "1") {
      gateAutoNow = true;
      gateAutoPromise = Promise.resolve(true);
      return gateAutoPromise;
    }
    gateAutoNow = false;
    if (setting === "0") {
      gateAutoPromise = Promise.resolve(false);
      return gateAutoPromise;
    }
    const pending = cameraAlreadyGranted().then(ok => {
      // A tap or a pause that happened while the browser was answering wins over this answer
      if (gateAutoPromise !== pending) return gateAutoNow;
      gateAutoNow = ok;
      return ok;
    });
    gateAutoPromise = pending;
    return gateAutoPromise;
  }

  function prewarm() {
    if (typeof window === "undefined" || navigator.webdriver || window.__MFG_HEADLESS_TEST || window.__mfgSwResuming) return;
    // If booting into a Kiosk station (?kiosk=attendance|sales|raw|fuel or Android Kiosk wrapper),
    // warm up the neural models & WebGL shaders immediately without opening #authFaceVideo first
    // (prevents dual-<video> SurfaceTexture black-screen on Android and back-to-back camera HAL churn).
    try {
      const sp = new URLSearchParams(window.location.search || "");
      if (sp.get("phone_scan") || sp.get("ps")) return;
      if (isKioskBoot()) {
        gateAutoStart();
        load().catch(() => {});
        return;
      }
    } catch (_) {}
    gateAutoStart().then(ok => { if (ok) prewarmGate(); });
  }

  function prewarmGate() {
    // Request webcam stream AND start neural model loading in parallel immediately when #authGate is visible
    // so both camera hardware and WebGL shaders are hot at the same time (zero sequential wait).
    const gate = document.getElementById("authGate");
    const videoEl = document.getElementById("authFaceVideo");
    if (!gate || gate.hidden || !videoEl) return;
    load().catch(() => {});
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    if (!earlyStreamPromise) {
      earlyCancelled = false;
      earlyConsumed = false;
      earlyStreamPromise = navigator.mediaDevices.getUserMedia({
        video: preferredVideoConstraints(),
        audio: false
      }).catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })).then(s => {
        trackStream(s);
        const gNow = document.getElementById("authGate");
        const vNow = document.getElementById("authFaceVideo");
        if (!earlyCancelled && gNow && !gNow.hidden && vNow) {
          earlyStreamObj = s;
          if (vNow.srcObject !== s) vNow.srcObject = s;
          const offEl = document.getElementById("authCamOffOverlay");
          if (offEl) offEl.hidden = true;
          const revealLiveVideo = () => {
            if (earlyCancelled || vNow.srcObject !== s || !vNow.videoWidth) return;
            const vp = document.getElementById("authCamViewport");
            if (vp) vp.classList.add("is-video-ready");
            const dot = document.getElementById("authFacePulse");
            if (dot) dot.className = "auth-face-pulse live";
            const btn = document.getElementById("authCamToggleBtn");
            const lbl = document.getElementById("authCamToggleLabel");
            if (lbl) lbl.textContent = "Pause Camera";
            else if (btn) btn.textContent = "Pause Camera";
            if (btn) { btn.hidden = false; btn.classList.add("cam-live"); }
            const hint = document.getElementById("authFaceHint");
            if (hint && (!hint.textContent || /Loading Face ID|Starting|Preparing/i.test(hint.textContent))) {
              const scannerReady = Boolean(ready || detectorReady);
              hint.textContent = scannerReady
                ? "Look at camera for automatic Face ID"
                : "Preparing Face ID…";
              hint.className = scannerReady ? "auth-face-hint ok" : "auth-face-hint";
            }
            if (!earlyConsumed) startEarlyPreviewLoop(s);
          };
          if (vNow.readyState >= 2 && vNow.videoWidth > 0) revealLiveVideo();
          else {
            vNow.addEventListener("loadeddata", revealLiveVideo, { once: true });
            vNow.addEventListener("playing", revealLiveVideo, { once: true });
          }
          vNow.play().then(revealLiveVideo).catch(() => {});
        } else {
          stopStreamTracks(s);
          trackedStreams.delete(s);
          earlyStreamObj = null;
        }
        return earlyStreamObj;
      }).catch(() => null);
    }
  }

  async function consumeEarlyStream(opts) {
    earlyCancelled = false;
    earlyConsumed = true;
    clearEarlyPreviewTimer();
    const keepOnAuth = (opts && typeof opts === "object" && "keepOnAuthVideo" in opts)
      ? Boolean(opts.keepOnAuthVideo)
      : Boolean(opts !== false && typeof document !== "undefined" && document.getElementById("authGate") && !document.getElementById("authGate").hidden);
    const detachAuthVideo = (streamToDetach) => {
      if (keepOnAuth) return;
      try {
        const vNow = typeof document !== "undefined" ? document.getElementById("authFaceVideo") : null;
        if (vNow && (!streamToDetach || vNow.srcObject === streamToDetach)) {
          try { vNow.pause(); } catch (_) {}
          vNow.srcObject = null;
        }
      } catch (_) {}
    };
    if (earlyStreamObj && earlyStreamObj.getVideoTracks && earlyStreamObj.getVideoTracks().some(t => t.readyState === "live")) {
      const s = earlyStreamObj;
      earlyStreamObj = null;
      earlyStreamPromise = null;
      detachAuthVideo(s);
      trackStream(s);
      return s;
    }
    if (earlyStreamPromise) {
      const p = earlyStreamPromise;
      const s = await p;
      if (earlyStreamPromise === p) earlyStreamPromise = null;
      if (earlyStreamObj === s) earlyStreamObj = null;
      if (!earlyCancelled && s && s.getVideoTracks && s.getVideoTracks().some(t => t.readyState === "live")) {
        detachAuthVideo(s);
        trackStream(s);
        return s;
      }
      try {
        const vNow = typeof document !== "undefined" ? document.getElementById("authFaceVideo") : null;
        if (vNow && (!s || vNow.srcObject === s)) {
          try { vNow.pause(); } catch (_) {}
          vNow.srcObject = null;
        }
      } catch (_) {}
      if (s) stopStreamTracks(s);
    }
    return null;
  }

  let ssdLoadingPromise = null;
  function ensureSsdLoaded() {
    if (detector === "ssd") return Promise.resolve(true);
    if (ssdLoadingPromise) return ssdLoadingPromise;
    if (typeof faceapi === "undefined" || M().detector !== "ssd") return Promise.resolve(false);
    ssdLoadingPromise = faceapi.nets.ssdMobilenetv1.loadFromUri("./vendor/models").then(() => {
      detector = "ssd";
      return true;
    }).catch(e => {
      console.warn("SSD detector unavailable, using tiny", e);
      detector = "tiny";
      return false;
    });
    return ssdLoadingPromise;
  }

  const EXPECTED_MODEL_BIN_BYTES = {
    "face_recognition_model.bin": 6444032,
    "ssd_mobilenetv1_model.bin": 5616957,
    "face_landmark_68_model.bin": 356840,
    "tiny_face_detector_model.bin": 193321,
    "face_landmark_68_tiny_model.bin": 77224
  };

  let legacyCachesSanitized = false;
  async function sanitizeModelCaches(forceEvictModels = false) {
    if (typeof caches === "undefined" || !caches || typeof caches.keys !== "function") return;
    try {
      const keys = await caches.keys();
      let targetV3 = null;
      for (const k of keys) {
        if (k === "isabi-mfg-data-v1" || k === "isabi-mfg-data-v2") {
          if (!forceEvictModels) {
            try {
              const oldCache = await caches.open(k);
              const oldReqs = await oldCache.keys();
              for (const req of oldReqs) {
                if (!req || !req.url || !req.url.includes("/vendor/models/")) continue;
                const cleanUrl = req.url.split("?")[0];
                const fileName = cleanUrl.split("/").pop() || "";
                const expectedLen = EXPECTED_MODEL_BIN_BYTES[fileName] || 0;
                const hit = await oldCache.match(req);
                if (!hit) continue;
                if (expectedLen > 0) {
                  const buf = await hit.clone().arrayBuffer().catch(() => null);
                  if (!buf || buf.byteLength !== expectedLen) continue;
                } else if (!fileName.endsWith(".json")) {
                  continue;
                }
                if (!targetV3) targetV3 = await caches.open("isabi-mfg-data-v3");
                const existingV3 = await targetV3.match(cleanUrl);
                if (!existingV3) {
                  await targetV3.put(cleanUrl, hit.clone()).catch(() => {});
                }
              }
            } catch (_) {}
          }
          await caches.delete(k).catch(() => {});
          continue;
        }
        if (!k.startsWith("isabi-mfg-")) continue;
        try {
          const c = await caches.open(k);
          const reqs = await c.keys();
          for (const req of reqs) {
            if (!req || !req.url || !req.url.includes("/vendor/models/")) continue;
            if (forceEvictModels) {
              await c.delete(req).catch(() => {});
              continue;
            }
            const binName = req.url.split("?")[0].split("/").pop() || "";
            const expectedLen = EXPECTED_MODEL_BIN_BYTES[binName] || 0;
            if (expectedLen > 0) {
              const hit = await c.match(req);
              if (hit) {
                const buf = await hit.clone().arrayBuffer().catch(() => null);
                if (!buf || buf.byteLength !== expectedLen) {
                  await c.delete(req).catch(() => {});
                }
              }
            }
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  async function refreshModelBinInCache(base, binName) {
    const expectedLen = EXPECTED_MODEL_BIN_BYTES[binName] || 0;
    const urlStr = `${base}/${binName}`;
    try {
      const res = await fetch(`${urlStr}?cb=${Date.now()}`, { cache: "no-store" });
      if (!res || res.status !== 200) return false;
      const buf = await res.arrayBuffer();
      if (expectedLen > 0 && (!buf || buf.byteLength !== expectedLen)) return false;
      if (typeof caches !== "undefined" && caches && typeof caches.open === "function") {
        const c = await caches.open("isabi-mfg-data-v3");
        const cleanRes = new Response(buf, {
          status: 200,
          headers: { "Content-Type": "application/octet-stream" }
        });
        await c.put(urlStr, cleanRes).catch(() => {});
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function loadNetWithSelfHealing(loaderFn, base, binName, timeoutMs = 8000) {
    const runWithTimeout = () => new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Timeout loading ${binName}`));
        }
      }, timeoutMs);
      Promise.resolve().then(loaderFn).then(
        val => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(val);
          }
        },
        err => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
        }
      );
    });
    try {
      return await runWithTimeout();
    } catch (firstErr) {
      await sanitizeModelCaches(true);
      await refreshModelBinInCache(base, binName);
      return await loaderFn();
    }
  }

  let lastLoadFailAt = 0;
  async function load() {
    const isAutoTest = typeof navigator !== "undefined" && Boolean(navigator.webdriver || window.__MFG_HEADLESS_TEST);
    // A loaded engine is what "this device uses Face ID" means: from then on the sign-in screen starts it by
    // itself and the Service Worker keeps the weights for offline use. Never on a mere attempt (an offline tap
    // must not mark the device), never under a test harness, and never against a person's pause.
    const markIfWanted = () => {
      if (!isAutoTest && readDeviceFaceSetting() !== "0") markDeviceUsesFaceId();
    };
    if (ready) { markIfWanted(); return; }
    if (loading) {
      // Asked for again while the weights are still coming in (pause, then tap): mark once the engine is there
      if (typeof faceapi !== "undefined") markIfWanted();
      return loading;
    }
    // The sign-in loop retries many times a second: after a failure, wait a little before trying the network again
    if (Date.now() - lastLoadFailAt < 4000) throw new Error("Face ID engine unavailable, retrying shortly");
    let resolveDetectorStage;
    let rejectDetectorStage;
    detectorLoading = new Promise((res, rej) => {
      resolveDetectorStage = res;
      rejectDetectorStage = rej;
    });
    detectorLoading.catch(() => {});
    loading = (async () => {
      if (!legacyCachesSanitized) {
        legacyCachesSanitized = true;
        await sanitizeModelCaches(false);
      }
      await ensureFaceApiScript(true);
      if (typeof faceapi === "undefined") throw new Error("face-api.js not loaded");
      markIfWanted();
      const base = "./vendor/models";
      try {
        if (faceapi.tf && typeof faceapi.tf.env === "function") {
          // Disable 2x2 vec4 packed im2col GLSL shaders on WebGL: prevents Windows D3D11/ANGLE fxc.exe
          // from blocking the main thread for ~10.2s during gl.linkProgram while keeping ~45ms inference
          // and bit-identical 128-d descriptors.
          faceapi.tf.env().set("WEBGL_PACK", false);
        }
      } catch (_) {}
      let webglOk = false;
      try {
        webglOk = Boolean(await faceapi.tf.setBackend("webgl"));
        if (webglOk) await faceapi.tf.ready();
      } catch (_) {
        webglOk = false;
      }
      if (!webglOk || faceapi.tf.getBackend() !== "webgl") {
        await faceapi.tf.setBackend("cpu");
        await faceapi.tf.ready();
      }
      backend = faceapi.tf.getBackend();
      // 2-Stage Progressive Loading:
      // Stage 1 (<250ms): TinyFaceDetector (193 KB) + FaceLandmark68TinyNet (77 KB) -> immediate live reticle
      // Stage 2: Full FaceLandmark68Net (357 KB) + FaceRecognitionNet (6.44 MB) -> high-precision 68-pt landmarks + 128-d descriptors
      if (!detectorReady) {
        const tinyP = loadNetWithSelfHealing(
          () => faceapi.nets.tinyFaceDetector.loadFromUri(base),
          base,
          "tiny_face_detector_model.bin",
          12000
        );
        const lmP = loadNetWithSelfHealing(
          () => faceapi.nets.faceLandmark68TinyNet.loadFromUri(base),
          base,
          "face_landmark_68_tiny_model.bin",
          12000
        ).then(() => {
          if (!faceapi.nets.faceLandmark68Net || !faceapi.nets.faceLandmark68Net.isLoaded) {
            landmarksTiny = true;
          }
        }).catch(async e => {
          console.warn("tiny landmark net unavailable, using full 68 net", e);
          await loadNetWithSelfHealing(
            () => faceapi.nets.faceLandmark68Net.loadFromUri(base),
            base,
            "face_landmark_68_model.bin",
            12000
          );
          landmarksTiny = false;
        });

        await Promise.all([tinyP, lmP]);

        detectorReady = true;
        if (resolveDetectorStage) resolveDetectorStage(true);
        if (typeof document !== "undefined") {
          const vp = document.getElementById("authCamViewport");
          const hint = document.getElementById("authFaceHint");
          if (vp && vp.classList.contains("is-video-ready") && hint && /Preparing Face ID|Loading Face ID|Starting/i.test(hint.textContent || "")) {
            hint.textContent = "Look at camera for automatic Face ID";
            hint.className = "auth-face-hint ok";
          }
          try { window.dispatchEvent(new CustomEvent("mfg:face-detector-ready")); } catch (_) {}
        }
      } else if (resolveDetectorStage) {
        resolveDetectorStage(true);
      }

      const fullLmP = (faceapi.nets.faceLandmark68Net && faceapi.nets.faceLandmark68Net.isLoaded)
        ? Promise.resolve().then(() => { landmarksTiny = false; })
        : loadNetWithSelfHealing(
            () => faceapi.nets.faceLandmark68Net.loadFromUri(base),
            base,
            "face_landmark_68_model.bin",
            15000
          ).then(() => {
            landmarksTiny = false;
          }).catch(e => {
            console.warn("full 68 landmark net unavailable in Stage 2, keeping tiny", e);
          });

      const recP = loadNetWithSelfHealing(
        () => faceapi.nets.faceRecognitionNet.loadFromUri(base),
        base,
        "face_recognition_model.bin",
        25000
      );
      await Promise.all([recP, fullLmP]);

      if (isAutoTest) {
        await ensureSsdLoaded();
      }

      ready = true;
      if (typeof document !== "undefined") {
        const vp = document.getElementById("authCamViewport");
        const hint = document.getElementById("authFaceHint");
        if (vp && vp.classList.contains("is-video-ready") && hint && /Preparing Face ID|Loading Face ID|Starting|Finalizing/i.test(hint.textContent || "")) {
          hint.textContent = "Look at camera for automatic Face ID";
          hint.className = "auth-face-hint ok";
        }
        try { window.dispatchEvent(new CustomEvent("mfg:face-models-ready")); } catch (_) {}
      }
    })().catch(err => {
      lastLoadFailAt = Date.now();
      loading = null;
      detectorLoading = null;
      if (rejectDetectorStage) rejectDetectorStage(err);
      throw err;
    });
    return loading;
  }

  async function loadDetector() {
    if (detectorReady || ready) return true;
    if (!loading) load().catch(() => {});
    if (detectorLoading) return detectorLoading;
    return loading;
  }

  const frameWidth = src => src.videoWidth || src.naturalWidth || src.width || 0;

  // Offscreen canvas copy: prevents face-api.js awaitMediaLoaded from hanging forever
  // when a MediaStream <video> has readyState < 3 or is hidden (PWA.md §4.2), crops
  // widescreen 16:9 webcam feeds to the active portrait scanner region (eliminating
  // side-window glare and making faces ~1.8x larger), and downscales to <= 320px for fast WebGL inference.
  let scratchCanvas = null;
  function frameToCanvas(src, maxDim = 320) {
    if (!src) return null;
    if (src.tagName !== "VIDEO") return src;
    if (src.paused && src.srcObject) src.play().catch(() => {});
    if (src.readyState < 2 || !src.videoWidth || !src.videoHeight) return null;
    const vw = src.videoWidth;
    const vh = src.videoHeight;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (vw > vh * 1.15) {
      const isAuthCam = src.id === "authFaceVideo";
      const cropWFrac = isAuthCam ? 0.58 : 0.76;
      const cropHFrac = isAuthCam ? 0.86 : 0.92;
      sw = Math.max(160, Math.round(vw * cropWFrac));
      sh = Math.max(160, Math.round(vh * cropHFrac));
      sx = Math.round((vw - sw) * 0.50);
      sy = Math.round((vh - sh) * (isAuthCam ? 0.52 : 0.50));
    }
    const scale = (maxDim && Math.max(sw, sh) > maxDim) ? (maxDim / Math.max(sw, sh)) : 1;
    const cw = Math.max(64, Math.round(sw * scale));
    const ch = Math.max(48, Math.round(sh * scale));
    const cv = scratchCanvas || (scratchCanvas = document.createElement("canvas"));
    if (cv.width !== cw) cv.width = cw;
    if (cv.height !== ch) cv.height = ch;
    cv._offsetX = sx;
    cv._offsetY = sy;
    cv._scaleX = sw / cw;
    cv._scaleY = sh / ch;
    try {
      const ctx = cv.getContext("2d", { willReadFrequently: true }) || cv.getContext("2d");
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
    } catch (_) {
      return null;
    }
    return cv;
  }

  function snapshot(src) {
    if (!src) return "";
    if (src.tagName === "VIDEO" && (src.readyState < 2 || !src.videoWidth || !src.videoHeight)) return "";
    const sw = src.videoWidth || src.naturalWidth || src.width || 320;
    const sh = src.videoHeight || src.naturalHeight || src.height || 240;
    if (!sw || !sh) return "";
    const w = MFG_FACE_CONFIG.snapshotWidth;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = Math.round((w * sh) / sw);
    try {
      cv.getContext("2d").drawImage(src, 0, 0, cv.width, cv.height);
      return cv.toDataURL("image/jpeg", MFG_FACE_CONFIG.snapshotQuality);
    } catch (_) {
      return "";
    }
  }

  // Eye aspect ratio (Soukupová & Čech 2016) from 68-point layout:
  // left eye = 36..41, right eye = 42..47. Open ~0.30, closed < 0.215.
  function ear(pts) {
    if (!pts || pts.length < 48) return null;
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const one = i => (d(pts[i + 1], pts[i + 5]) + d(pts[i + 2], pts[i + 4])) / (2 * d(pts[i], pts[i + 3]) || 1);
    return (one(36) + one(42)) / 2;
  }

  // 3D Head-Turn Parallax (Anti-Screenshot Option 2):
  // Compares protruding 3D nose-tip (30) projection across the jaw contour (2, 14) against
  // the flat inter-ocular nose-bridge (27) between the outer eye corners (36, 45).
  // A real 3D head turning slightly produces differential nose-tip parallax + non-rigid eye
  // variation, whereas a flat 2D screenshot held on a phone moves as a rigid plane.
  function pose(pts) {
    if (!pts || pts.length < 68) return null;
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const dLeftJaw = d(pts[30], pts[2]);
    const dRightJaw = d(pts[30], pts[14]);
    const yaw = (dLeftJaw - dRightJaw) / ((dLeftJaw + dRightJaw) || 1);
    const dLeftEye = d(pts[27], pts[36]);
    const dRightEye = d(pts[27], pts[45]);
    const yawEye = (dLeftEye - dRightEye) / ((dLeftEye + dRightEye) || 1);
    const parallax3d = yaw - yawEye;
    const dBridgeNose = d(pts[27], pts[30]);
    const dNoseChin = d(pts[30], pts[8]);
    const pitch = (dBridgeNose - dNoseChin) / ((dBridgeNose + dNoseChin) || 1);
    const midCanthi = { x: (pts[36].x + pts[45].x) * 0.5, y: (pts[36].y + pts[45].y) * 0.5 };
    const midMouth = { x: (pts[48].x + pts[54].x) * 0.5, y: (pts[48].y + pts[54].y) * 0.5 };
    const dCanthiNose = d(midCanthi, pts[30]);
    const pitchNose = (dCanthiNose - dNoseChin) / ((dCanthiNose + dNoseChin) || 1);
    const dCanthiMouth = d(midCanthi, midMouth);
    const dMouthChin = d(midMouth, pts[8]);
    const pitchPlane = (dCanthiMouth - dMouthChin) / ((dCanthiMouth + dMouthChin) || 1);
    const parallaxPitch3d = pitchNose - pitchPlane;
    return {
      yaw: Number(yaw.toFixed(4)),
      yawEye: Number(yawEye.toFixed(4)),
      parallax3d: Number(parallax3d.toFixed(4)),
      pitch: Number(pitch.toFixed(4)),
      parallaxPitch3d: Number(parallaxPitch3d.toFixed(4))
    };
  }

  function pack(r, src, multiple = false) {
    const fw = frameWidth(src);
    const lm = r.landmarks ? r.landmarks.positions : null;
    const sc = r.detection ? r.detection.score : 0;
    const rawBox = r.detection ? r.detection.box : null;
    const fr = fw && rawBox ? rawBox.width / fw : 1;
    const sx = src && src._scaleX ? src._scaleX : 1;
    const sy = src && src._scaleY ? src._scaleY : 1;
    const ox = src && src._offsetX ? src._offsetX : 0;
    const oy = src && src._offsetY ? src._offsetY : 0;
    const box = (rawBox && (sx !== 1 || sy !== 1 || ox !== 0 || oy !== 0))
      ? { x: rawBox.x * sx + ox, y: rawBox.y * sy + oy, width: rawBox.width * sx, height: rawBox.height * sy }
      : rawBox;
    let padEyeBox = null;
    if (lm && lm.length >= 48 && rawBox && rawBox.width > 0 && rawBox.height > 0) {
      let minEx = 1, minEy = 1, maxEx = 0, maxEy = 0;
      for (let i = 36; i <= 47; i++) {
        const nx = (lm[i].x - rawBox.x) / rawBox.width;
        const ny = (lm[i].y - rawBox.y) / rawBox.height;
        if (nx < minEx) minEx = nx;
        if (ny < minEy) minEy = ny;
        if (nx > maxEx) maxEx = nx;
        if (ny > maxEy) maxEy = ny;
      }
      padEyeBox = {
        x0: Math.max(0.05, minEx - 0.08),
        y0: Math.max(0.08, minEy - 0.08),
        x1: Math.min(0.95, maxEx + 0.08),
        y1: Math.min(0.75, maxEy + 0.09)
      };
    }
    return {
      descriptor: r.descriptor,
      box,
      score: sc,
      detScore: sc,
      frac: fr,
      faceSizeFrac: fr,
      multiple: !!multiple,
      landmarks: lm,
      landmarkModel: landmarksTiny ? "68-tiny" : "68",
      ear: lm ? ear(lm) : null,
      pose: lm ? pose(lm) : null,
      padEyeBox
    };
  }

  // Deterministic On-Device Presentation Attack Detection (PAD):
  // Inspects native-scale ISP pixels around det.box BEFORE 288px detector downscale (< 2 ms, zero ctx.filter).
  // Detects (1) 2D Nyquist subpixel/Moire pixel grid on inner cheek/forehead skin (excluding eyes/glasses),
  // (2) horizontally correlated localized PWM/refresh row-banding, (3) non-eye planar specular glare + flat shading,
  // and (4) paired straight dark device bezels flanking a bright interior.
  let padCanvas = null;
  function analyzePad(src, det) {
    const empty = { evaluated: false, frameSpoof: false, score: 0, reasons: [], metrics: null };
    if (!src || !det || !det.box) return empty;
    const rawBox = det.box;
    const bx = Number(rawBox.x || 0), by = Number(rawBox.y || 0);
    const bw = Number(rawBox.width || 0), bh = Number(rawBox.height || 0);
    if (!(bw >= 18 && bh >= 18)) return empty;

    let rgba = null;
    let cw = 0, ch = 0;
    let faceX0 = 0, faceY0 = 0, faceW = 0, faceH = 0;

    if (src.data && src.width > 0 && src.height > 0) {
      cw = src.width | 0;
      ch = src.height | 0;
      rgba = src.data;
      faceX0 = Math.max(0, Math.round(bx));
      faceY0 = Math.max(0, Math.round(by));
      faceW = Math.min(cw - faceX0, Math.max(12, Math.round(bw)));
      faceH = Math.min(ch - faceY0, Math.max(12, Math.round(bh)));
    } else {
      if (src.tagName === "VIDEO" && (src.readyState < 2 || !src.videoWidth || !src.videoHeight)) return empty;
      const srcW = frameWidth(src);
      const srcH = src.videoHeight || src.naturalHeight || src.height || 0;
      if (!(srcW >= 32 && srcH >= 32)) return empty;

      const padMarginX = Math.round(bw * 0.32);
      const padMarginY = Math.round(bh * 0.24);
      const roiX = Math.max(0, Math.floor(bx - padMarginX));
      const roiY = Math.max(0, Math.floor(by - padMarginY));
      const roiRight = Math.min(srcW, Math.ceil(bx + bw + padMarginX));
      const roiBottom = Math.min(srcH, Math.ceil(by + bh + padMarginY));
      const roiW = Math.max(24, roiRight - roiX);
      const roiH = Math.max(24, roiBottom - roiY);
      const maxDim = 320;
      const scale = Math.max(roiW, roiH) > maxDim ? (maxDim / Math.max(roiW, roiH)) : 1;
      cw = Math.max(24, Math.round(roiW * scale));
      ch = Math.max(24, Math.round(roiH * scale));

      const cv = padCanvas || (padCanvas = document.createElement("canvas"));
      if (cv.width !== cw) cv.width = cw;
      if (cv.height !== ch) cv.height = ch;
      try {
        const ctx = cv.getContext("2d", { willReadFrequently: true }) || cv.getContext("2d");
        ctx.drawImage(src, roiX, roiY, roiW, roiH, 0, 0, cw, ch);
        rgba = ctx.getImageData(0, 0, cw, ch).data;
      } catch (_) {
        return empty;
      }
      faceX0 = Math.max(0, Math.round((bx - roiX) * (cw / roiW)));
      faceY0 = Math.max(0, Math.round((by - roiY) * (ch / roiH)));
      faceW = Math.min(cw - faceX0, Math.max(12, Math.round(bw * (cw / roiW))));
      faceH = Math.min(ch - faceY0, Math.max(12, Math.round(bh * (ch / roiH))));
    }

    if (!rgba || rgba.length < cw * ch * 4 || faceW < 18 || faceH < 18) return empty;

    const Y = new Float32Array(cw * ch);
    for (let i = 0, p = 0; p < cw * ch; i += 4, p++) {
      Y[p] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }

    const eyeBand = det.padEyeBox || { x0: 0.14, y0: 0.22, x1: 0.86, y1: 0.44 };
    const cheekY0 = Math.max(faceY0 + Math.round(faceH * Math.max(0.45, eyeBand.y1 + 0.02)), faceY0 + 2);
    const cheekY1 = Math.min(faceY0 + Math.round(faceH * 0.72), ch - 4);
    const leftCheek = {
      x0: Math.max(faceX0 + Math.round(faceW * 0.14), 3),
      x1: Math.min(faceX0 + Math.round(faceW * 0.37), cw - 4),
      y0: cheekY0,
      y1: cheekY1
    };
    const rightCheek = {
      x0: Math.max(faceX0 + Math.round(faceW * 0.63), 3),
      x1: Math.min(faceX0 + Math.round(faceW * 0.86), cw - 4),
      y0: cheekY0,
      y1: cheekY1
    };
    const forehead = {
      x0: Math.max(faceX0 + Math.round(faceW * 0.28), 3),
      x1: Math.min(faceX0 + Math.round(faceW * 0.72), cw - 4),
      y0: Math.max(faceY0 + Math.round(faceH * 0.08), 3),
      y1: Math.min(faceY0 + Math.round(faceH * Math.max(0.18, eyeBand.y0 - 0.02)), ch - 4)
    };
    const jawPatch = {
      x0: Math.max(faceX0 + Math.round(faceW * 0.28), 3),
      x1: Math.min(faceX0 + Math.round(faceW * 0.72), cw - 4),
      y0: Math.max(faceY0 + Math.round(faceH * 0.76), 3),
      y1: Math.min(faceY0 + Math.round(faceH * 0.90), ch - 4)
    };

    const patches = [leftCheek, rightCheek, forehead];
    let skinCount = 0;
    let sumSkinY = 0;
    let sumHf = 0;
    let sumLf = 0;
    let sumChromaHf = 0;
    let altCount = 0;
    let clippedCount = 0;
    const hist = new Uint32Array(256);

    for (const pt of patches) {
      if (pt.x1 <= pt.x0 + 2 || pt.y1 <= pt.y0 + 2) continue;
      for (let y = pt.y0; y < pt.y1; y++) {
        const rowOff = y * cw;
        for (let x = pt.x0; x < pt.x1; x++) {
          const p = rowOff + x;
          const lum = Y[p];
          sumSkinY += lum;
          skinCount += 1;
          hist[Math.max(0, Math.min(255, lum | 0))] += 1;

          const lapX = Math.abs(Y[p - 1] - 2 * lum + Y[p + 1]);
          const lapY = Math.abs(Y[p - cw] - 2 * lum + Y[p + cw]);
          const hf = 0.5 * (lapX + lapY);
          const lf = 0.5 * (Math.abs(Y[p + 3] - lum) + Math.abs(Y[p + 3 * cw] - lum)) + 2.5;
          sumHf += hf;
          sumLf += lf;

          const d1 = lum - Y[p - 1];
          const d2 = Y[p + 1] - lum;
          if (d1 * d2 < -9) altCount += 1;

          const pi = p * 4;
          const r = rgba[pi], g = rgba[pi + 1], b = rgba[pi + 2];
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          if (lum >= 244 && sat <= 18) clippedCount += 1;

          const piL = (p - 1) * 4;
          const piR = (p + 1) * 4;
          const rgL = rgba[piL] - rgba[piL + 1], rgM = r - g, rgR = rgba[piR] - rgba[piR + 1];
          const bgL = rgba[piL + 2] - rgba[piL + 1], bgM = b - g, bgR = rgba[piR + 2] - rgba[piR + 1];
          sumChromaHf += 0.5 * (Math.abs(rgL - 2 * rgM + rgR) + Math.abs(bgL - 2 * bgM + bgR));
        }
      }
    }

    const meanSkinY = skinCount ? (sumSkinY / skinCount) : 0;
    const moireRatio = sumLf > 0 ? (sumHf / sumLf) : 0;
    const hfMean = skinCount ? (sumHf / skinCount) : 0;
    const chromaHfMean = skinCount ? (sumChromaHf / skinCount) : 0;
    const altFrac = skinCount ? (altCount / skinCount) : 0;
    const glareFrac = skinCount ? (clippedCount / skinCount) : 0;

    let p50 = meanSkinY, p98 = meanSkinY;
    if (skinCount > 0) {
      let acc = 0, got50 = false;
      const t50 = skinCount * 0.50, t98 = skinCount * 0.98;
      for (let bIdx = 0; bIdx < 256; bIdx++) {
        acc += hist[bIdx];
        if (!got50 && acc >= t50) { p50 = bIdx; got50 = true; }
        if (acc >= t98) { p98 = bIdx; break; }
      }
    }

    let jawY = 0, jawCnt = 0;
    if (jawPatch.x1 > jawPatch.x0 && jawPatch.y1 > jawPatch.y0) {
      for (let y = jawPatch.y0; y < jawPatch.y1; y++) {
        const ro = y * cw;
        for (let x = jawPatch.x0; x < jawPatch.x1; x++) {
          jawY += Y[ro + x];
          jawCnt += 1;
        }
      }
    }
    const meanJawY = jawCnt ? (jawY / jawCnt) : meanSkinY;
    const flatShading = Math.abs(meanSkinY - meanJawY) <= 5.5;

    const moireHit = Boolean(
      skinCount >= 180 &&
      meanSkinY >= 45 &&
      (
        (moireRatio >= 0.92 && hfMean >= 6.8) ||
        (altFrac >= 0.30 && hfMean >= 6.2) ||
        (chromaHfMean >= 6.0 && moireRatio >= 0.78)
      )
    );

    const glareHit = Boolean(
      skinCount >= 180 &&
      meanSkinY >= 120 &&
      glareFrac >= 0.055 &&
      (p98 - p50) >= 65 &&
      (flatShading || glareFrac >= 0.11)
    );

    // 2. Horizontally correlated PWM / Display Refresh Row-Banding inside face vs outer margins
    const rowY0 = Math.max(faceY0 + Math.round(faceH * 0.08), 2);
    const rowY1 = Math.min(faceY0 + Math.round(faceH * 0.92), ch - 3);
    const rLen = Math.max(0, rowY1 - rowY0);
    const midX = faceX0 + (faceW >> 1);
    let innerBandRms = 0;
    let outerBandRms = 0;
    let rowCorr = 0;
    let outerCols = 0;

    if (rLen >= 20 && faceW >= 24) {
      const leftMean = new Float32Array(rLen);
      const rightMean = new Float32Array(rLen);
      const innerMean = new Float32Array(rLen);
      const outerMean = new Float32Array(rLen);
      const xStart = Math.max(0, faceX0 + 2);
      const xEnd = Math.min(cw, faceX0 + faceW - 2);
      const leftOuterEnd = Math.max(0, faceX0 - 4);
      const rightOuterStart = Math.min(cw, faceX0 + faceW + 4);
      const hasOuterL = leftOuterEnd >= 8;
      const hasOuterR = (cw - rightOuterStart) >= 8;
      outerCols = (hasOuterL ? leftOuterEnd : 0) + (hasOuterR ? (cw - rightOuterStart) : 0);

      for (let ri = 0; ri < rLen; ri++) {
        const ro = (rowY0 + ri) * cw;
        let sl = 0, cl = 0, sr = 0, cr = 0;
        for (let x = xStart; x < xEnd; x++) {
          const valY = Y[ro + x];
          if (x < midX) { sl += valY; cl += 1; } else { sr += valY; cr += 1; }
        }
        leftMean[ri] = cl ? sl / cl : 0;
        rightMean[ri] = cr ? sr / cr : 0;
        innerMean[ri] = (cl + cr) ? (sl + sr) / (cl + cr) : 0;

        if (outerCols > 0) {
          let so = 0, co = 0;
          if (hasOuterL) {
            for (let x = 0; x < leftOuterEnd; x++) { so += Y[ro + x]; co += 1; }
          }
          if (hasOuterR) {
            for (let x = rightOuterStart; x < cw; x++) { so += Y[ro + x]; co += 1; }
          }
          outerMean[ri] = co ? so / co : 0;
        }
      }

      const hp = (arr, out) => {
        for (let i = 2; i < rLen - 2; i++) {
          const avg5 = 0.2 * (arr[i - 2] + arr[i - 1] + arr[i] + arr[i + 1] + arr[i + 2]);
          out[i] = arr[i] - avg5;
        }
      };
      const bL = new Float32Array(rLen);
      const bR = new Float32Array(rLen);
      const bI = new Float32Array(rLen);
      const bO = new Float32Array(rLen);
      hp(leftMean, bL); hp(rightMean, bR); hp(innerMean, bI);
      if (outerCols >= 10) hp(outerMean, bO);

      let sumI2 = 0, sumO2 = 0, dotLR = 0, normL = 0, normR = 0;
      const validRows = Math.max(1, rLen - 4);
      for (let i = 2; i < rLen - 2; i++) {
        sumI2 += bI[i] * bI[i];
        dotLR += bL[i] * bR[i];
        normL += bL[i] * bL[i];
        normR += bR[i] * bR[i];
        if (outerCols >= 10) sumO2 += bO[i] * bO[i];
      }
      innerBandRms = Math.sqrt(sumI2 / validRows);
      outerBandRms = outerCols >= 10 ? Math.sqrt(sumO2 / validRows) : 0;
      rowCorr = (normL > 1e-6 && normR > 1e-6) ? (dotLR / Math.sqrt(normL * normR)) : 0;
    }

    const pwmHit = Boolean(
      innerBandRms >= 3.0 &&
      rowCorr >= 0.45 &&
      (outerCols < 10 || innerBandRms >= 1.95 * (outerBandRms + 0.55))
    );

    // 4. Paired Straight Dark Device Bezel Borders Framing the Bright Interior
    const checkVerticalEdge = isLeft => {
      const stripLen = isLeft ? faceX0 : Math.max(0, cw - (faceX0 + faceW));
      if (stripLen < 6) return false;
      const posList = [];
      let edgeHits = 0;
      const totalScanRows = Math.max(1, rowY1 - rowY0);
      for (let y = rowY0; y < rowY1; y += 2) {
        const ro = y * cw;
        let bezelPos = -1;
        let minDark = 255;
        let innerBright = 0;
        if (isLeft) {
          for (let x = faceX0 + 4; x >= 2; x--) {
            const v = Y[ro + x];
            if (v > innerBright) innerBright = v;
            if (v < minDark) minDark = v;
            if (v <= 46 && (innerBright - v) >= 52 && Y[ro + x + 2] >= 105) {
              bezelPos = x;
              break;
            }
          }
        } else {
          for (let x = Math.max(0, faceX0 + faceW - 4); x < cw - 2; x++) {
            const v = Y[ro + x];
            if (v > innerBright) innerBright = v;
            if (v < minDark) minDark = v;
            if (v <= 46 && (innerBright - v) >= 52 && Y[ro + x - 2] >= 105) {
              bezelPos = x;
              break;
            }
          }
        }
        if (bezelPos >= 0) {
          edgeHits += 1;
          posList.push(bezelPos);
        }
      }
      if (posList.length < 8 || (edgeHits / Math.ceil(totalScanRows / 2)) < 0.62) return false;
      const meanPos = posList.reduce((a, b) => a + b, 0) / posList.length;
      const varPos = posList.reduce((a, b) => a + (b - meanPos) * (b - meanPos), 0) / posList.length;
      return Math.sqrt(varPos) <= 2.8;
    };

    const bezelHit = Boolean(checkVerticalEdge(true) && checkVerticalEdge(false));

    const reasons = [];
    let padScore = 0;
    if (moireHit) { reasons.push("moire_grid"); padScore += 0.75; }
    if (pwmHit) { reasons.push("pwm_banding"); padScore += 0.75; }
    if (bezelHit) { reasons.push("screen_bezel"); padScore += 0.70; }
    if (glareHit) { reasons.push("planar_glare"); padScore += 0.65; }
    const clampedScore = Math.min(1, padScore);

    return {
      evaluated: true,
      frameSpoof: clampedScore >= 0.65,
      score: Number(clampedScore.toFixed(3)),
      reasons,
      metrics: {
        meanSkinY: Number(meanSkinY.toFixed(1)),
        moireRatio: Number(moireRatio.toFixed(3)),
        hfMean: Number(hfMean.toFixed(2)),
        chromaHfMean: Number(chromaHfMean.toFixed(2)),
        altFrac: Number(altFrac.toFixed(3)),
        innerBandRms: Number(innerBandRms.toFixed(2)),
        outerBandRms: Number(outerBandRms.toFixed(2)),
        rowCorr: Number(rowCorr.toFixed(2)),
        glareFrac: Number(glareFrac.toFixed(3)),
        bezelHit
      }
    };
  }

  // Passive Biomechanical Liveness & Multi-Frame PAD Verifier (Zero Prompts / Challenges):
  // Evaluates natural Open->Dip->Open blink OR positively-coupled 3D nose-vs-eye head-turn parallax,
  // trajectory continuity, real-time cadence, and accumulated PAD spoof suspicion.
  function evaluatePassiveLiveness(hist, evalOpts = {}) {
    const mode = String((evalOpts && evalOpts.mode) || "blink_or_turn");
    const entries = Array.isArray(hist) ? hist.filter(Boolean) : [];
    if (!entries.length) {
      return { ok: false, method: "", blinkPassed: false, turnPassed: false, spoofSuspected: false, reason: "empty", spanMs: 0, frames: 0 };
    }

    const padEntries = entries.filter(e => e.padEvaluated).slice(-4);
    if (padEntries.length >= 2) {
      const spoofFrames = padEntries.filter(e => e.frameSpoof).length;
      const meanPadScore = padEntries.reduce((a, e) => a + Number(e.padScore || 0), 0) / padEntries.length;
      if (spoofFrames >= 2 || (padEntries.length >= 3 && meanPadScore >= 0.60)) {
        const padReasons = Array.from(new Set(padEntries.flatMap(e => e.padReasons || [])));
        return {
          ok: false,
          method: "",
          blinkPassed: false,
          turnPassed: false,
          spoofSuspected: true,
          reason: "pad_spoof",
          padReasons,
          spanMs: 0,
          frames: entries.length
        };
      }
    }

    // Isolate contiguous tail matching latest landmark model so Stage-1 -> Stage-2 switch creates zero synthetic jumps
    const activeModel = entries[entries.length - 1].landmarkModel || "";
    let modelStart = 0;
    if (activeModel) {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].landmarkModel && entries[i].landmarkModel !== activeModel) {
          modelStart = i + 1;
          break;
        }
      }
    }
    let cleanHist = entries.slice(modelStart);

    // Strip any prefix up to and including the latest PAD-flagged frame so spoof frames cannot splice into a clean trajectory
    for (let i = cleanHist.length - 1; i >= 0; i--) {
      if (cleanHist[i] && cleanHist[i].frameSpoof) {
        cleanHist = cleanHist.slice(i + 1);
        break;
      }
    }

    // Reset trajectory tail on abrupt box jumps (defeats photo swaps / spliced video cuts)
    for (let i = 1; i < cleanHist.length; i++) {
      const prev = cleanHist[i - 1], cur = cleanHist[i];
      if (prev.boxW > 0 && cur.boxCx != null && prev.boxCx != null && cur.boxCy != null && prev.boxCy != null) {
        const jumpFrac = Math.hypot(cur.boxCx - prev.boxCx, cur.boxCy - prev.boxCy) / Math.max(24, prev.boxW);
        if (jumpFrac > 0.24) {
          cleanHist = cleanHist.slice(i);
          i = 0;
        }
      }
    }

    const spanMs = cleanHist.length >= 2
      ? Math.max(0, Number(cleanHist[cleanHist.length - 1].t || 0) - Number(cleanHist[0].t || 0))
      : 0;

    if (evalOpts && evalOpts.requireRealtimeCadence) {
      const minFrames = Math.max(3, Number(evalOpts.minFrames || 4));
      const minSpanMs = Math.max(250, Number(evalOpts.minSpanMs || 550));
      if (cleanHist.length < minFrames || spanMs < minSpanMs) {
        return {
          ok: false,
          method: "",
          blinkPassed: false,
          turnPassed: false,
          spoofSuspected: false,
          reason: "cadence_pending",
          spanMs,
          frames: cleanHist.length
        };
      }
    }

    // Signal 1: Biomechanical Blink (strict interior Open -> Closed -> Open valley)
    const ears = cleanHist.map(h => h.ear).filter(v => typeof v === "number" && v > 0);
    let blinkPassed = false;
    if (ears.length >= 3) {
      let minIdx = 0;
      for (let i = 1; i < ears.length; i++) {
        if (ears[i] < ears[minIdx]) minIdx = i;
      }
      if (minIdx > 0 && minIdx < ears.length - 1) {
        const minEar = ears[minIdx];
        const maxBefore = Math.max(...ears.slice(0, minIdx));
        const maxAfter = Math.max(...ears.slice(minIdx + 1));
        const stdBlink = (maxBefore >= 0.238 && minEar <= 0.214 && maxAfter >= 0.236 && (maxBefore - minEar) >= 0.032 && (maxAfter - minEar) >= 0.024);
        const narrowEyeBlink = (maxBefore >= 0.195 && maxAfter >= 0.195 && (maxBefore - minEar) >= 0.030 && (maxAfter - minEar) >= 0.022 && (minEar / maxBefore) <= 0.86);
        blinkPassed = Boolean(stdBlink || narrowEyeBlink);
      }
    }

    // Signal 2: Positively-Coupled 3D Head-Turn / Nod Parallax + Non-Rigid Eyelid Variation
    const pairedPose = cleanHist.filter(h =>
      typeof h.yaw === "number" &&
      typeof h.parallax3d === "number" &&
      typeof h.ear === "number" && h.ear > 0
    );
    let turnPassed = false;
    let yawSpan = 0, parallaxSpan = 0, pitchSpan = 0, earSpan = 0, corrYawPar = 0;

    if (pairedPose.length >= 2) {
      const yaws = pairedPose.map(h => h.yaw);
      const pars = pairedPose.map(h => h.parallax3d);
      const earVals = pairedPose.map(h => h.ear);
      const pitches = pairedPose.map(h => h.pitch).filter(v => typeof v === "number");

      let minYIdx = 0, maxYIdx = 0;
      for (let i = 1; i < yaws.length; i++) {
        if (yaws[i] < yaws[minYIdx]) minYIdx = i;
        if (yaws[i] > yaws[maxYIdx]) maxYIdx = i;
      }
      yawSpan = yaws[maxYIdx] - yaws[minYIdx];
      parallaxSpan = Math.max(...pars) - Math.min(...pars);
      earSpan = Math.max(...earVals) - Math.min(...earVals);
      pitchSpan = pitches.length >= 2 ? (Math.max(...pitches) - Math.min(...pitches)) : 0;

      const meanY = yaws.reduce((a, b) => a + b, 0) / yaws.length;
      const meanP = pars.reduce((a, b) => a + b, 0) / pars.length;
      let cov = 0, varY = 0, varP = 0;
      for (let i = 0; i < yaws.length; i++) {
        const dy = yaws[i] - meanY;
        const dp = pars[i] - meanP;
        cov += dy * dp;
        varY += dy * dy;
        varP += dp * dp;
      }
      corrYawPar = (varY > 1e-8 && varP > 1e-8) ? (cov / Math.sqrt(varY * varP)) : 0;
      const dirDeltaPar = pars[maxYIdx] - pars[minYIdx];

      const horizontalTurnOk = (
        yawSpan >= 0.025 &&
        parallaxSpan >= 0.012 &&
        dirDeltaPar >= 0.009 &&
        corrYawPar >= 0.45 &&
        earSpan >= 0.0045
      );

      // Vertical nod requires positively-coupled 3D nose-vs-eye-mouth-plane pitch parallax + eyelid movement above static jitter
      const pairedPitch = pairedPose.filter(h => typeof h.pitch === "number" && typeof h.parallaxPitch3d === "number");
      let verticalNodOk = false;
      if (pairedPitch.length >= 2) {
        const vp = pairedPitch.map(h => h.pitch);
        const vpar = pairedPitch.map(h => h.parallaxPitch3d);
        let minPIdx = 0, maxPIdx = 0;
        for (let i = 1; i < vp.length; i++) {
          if (vp[i] < vp[minPIdx]) minPIdx = i;
          if (vp[i] > vp[maxPIdx]) maxPIdx = i;
        }
        pitchSpan = vp[maxPIdx] - vp[minPIdx];
        const parallaxPitchSpan = Math.max(...vpar) - Math.min(...vpar);
        const dirDeltaPitchPar = vpar[maxPIdx] - vpar[minPIdx];
        const meanVp = vp.reduce((a, b) => a + b, 0) / vp.length;
        const meanVpar = vpar.reduce((a, b) => a + b, 0) / vpar.length;
        let covV = 0, varVp = 0, varVpar = 0;
        for (let i = 0; i < vp.length; i++) {
          const dvp = vp[i] - meanVp;
          const dvpar = vpar[i] - meanVpar;
          covV += dvp * dvpar;
          varVp += dvp * dvp;
          varVpar += dvpar * dvpar;
        }
        const corrPitchPar = (varVp > 1e-8 && varVpar > 1e-8) ? (covV / Math.sqrt(varVp * varVpar)) : 0;
        verticalNodOk = (
          pitchSpan >= 0.030 &&
          parallaxPitchSpan >= 0.010 &&
          dirDeltaPitchPar >= 0.008 &&
          corrPitchPar >= 0.45 &&
          earSpan >= 0.025
        );
      }
      turnPassed = Boolean(horizontalTurnOk || verticalNodOk);
    }

    const ok = mode === "blink"
      ? blinkPassed
      : (mode === "turn3d" ? turnPassed : (blinkPassed || turnPassed));

    return {
      ok,
      method: blinkPassed ? (turnPassed ? "blink+turn3d" : "blink") : (turnPassed ? "turn3d" : ""),
      blinkPassed,
      turnPassed,
      spoofSuspected: false,
      yawSpan,
      parallaxSpan,
      earSpan,
      corrYawPar: Number(corrYawPar.toFixed(3)),
      spanMs,
      frames: cleanHist.length
    };
  }

  function checkDescriptorStability(vecs, maxStepDist = 0.26) {
    if (!Array.isArray(vecs) || vecs.length < 2) return true;
    for (let i = 1; i < vecs.length; i++) {
      if (!vecs[i - 1] || !vecs[i] || vecs[i - 1].length !== 128 || vecs[i].length !== 128) return false;
      if (euclidean(vecs[i - 1], vecs[i]) > maxStepDist) return false;
    }
    return true;
  }

  function averageDescriptors(vecs) {
    const valid = Array.isArray(vecs) ? vecs.filter(v => v && v.length === 128) : [];
    if (!valid.length) return null;
    if (valid.length === 1) return Array.from(valid[0], n => Number(Number(n).toFixed(5)));
    const out = new Array(128).fill(0);
    for (const v of valid) {
      for (let i = 0; i < 128; i++) out[i] += Number(v[i]) || 0;
    }
    for (let i = 0; i < 128; i++) out[i] = Number((out[i] / valid.length).toFixed(5));
    return out;
  }

  let boostCanvas = null;
  let boostLut = null;
  let cropCanvas = null;
  let preferBoostPass = false;
  let liveMissCount = 0;
  async function detectOne(src, allowCropFallback = false) {
    if (!ready && (!detectorReady || allowCropFallback)) return null;
    const detectorOnlyMode = !ready && detectorReady;
    const isLiveVideo = !!(src && src.tagName === "VIDEO");
    const frame = frameToCanvas(src, (isLiveVideo || detectorOnlyMode) && !allowCropFallback ? 288 : 480);
    if (!frame) return null;

    if (detectorOnlyMode) {
      try {
        const fastTinyOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.24 });
        const r = await faceapi.detectSingleFace(frame, fastTinyOpts).withFaceLandmarks(landmarksTiny);
        if (r) {
          liveMissCount = 0;
          const packed = pack({ detection: r.detection, landmarks: r.landmarks, descriptor: null }, frame, false);
          packed.modelLoading = true;
          return packed;
        }
      } catch (_) {}
      return null;
    }

    const buildBoostFrame = () => {
      const bw = frameWidth(frame) || 288;
      const bh = frame.videoHeight || frame.naturalHeight || frame.height || 216;
      const bcv = boostCanvas || (boostCanvas = document.createElement("canvas"));
      if (bcv.width !== bw) bcv.width = bw;
      if (bcv.height !== bh) bcv.height = bh;
      bcv._scaleX = frame._scaleX || 1;
      bcv._scaleY = frame._scaleY || 1;
      bcv._offsetX = frame._offsetX || 0;
      bcv._offsetY = frame._offsetY || 0;
      const bctx = bcv.getContext("2d", { willReadFrequently: true }) || bcv.getContext("2d");
      bctx.drawImage(frame, 0, 0, bw, bh);
      // Pure CPU LUT shadow-lift (avoids ctx.filter GPU Skia pipeline which wedges Android SurfaceTexture)
      try {
        if (!boostLut) {
          boostLut = new Uint8ClampedArray(256);
          for (let i = 0; i < 256; i++) {
            const b = i * 1.38;
            boostLut[i] = Math.max(0, Math.min(255, Math.round((b - 128) * 1.18 + 128)));
          }
        }
        const img = bctx.getImageData(0, 0, bw, bh);
        const d = img.data;
        const lut = boostLut;
        for (let i = 0, len = d.length; i < len; i += 4) {
          d[i] = lut[d[i]];
          d[i + 1] = lut[d[i + 1]];
          d[i + 2] = lut[d[i + 2]];
        }
        bctx.putImageData(img, 0, 0);
      } catch (_) {}
      return bcv;
    };

    if (isLiveVideo && !allowCropFallback) {
      // Fast live-video path (~18-25ms): single-pass TinyFaceDetector(256) on normal frames.
      // The backlit shadow-lift pass (buildBoostFrame + second neural pass) is throttled to run
      // only every 6th missed frame so wall-mounted tablets never suffer GPU/ISP buffer starvation.
      const fastTinyOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.24 });
      const boostTinyOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 256, scoreThreshold: 0.22 });
      if (preferBoostPass) {
        try {
          const bcv = buildBoostFrame();
          const rb = await faceapi.detectSingleFace(bcv, boostTinyOpts).withFaceLandmarks(landmarksTiny).withFaceDescriptor();
          if (rb) {
            liveMissCount = 0;
            return pack(rb, bcv, false);
          }
        } catch (_) {}
        preferBoostPass = false;
        try {
          const r = await faceapi.detectSingleFace(frame, fastTinyOpts).withFaceLandmarks(landmarksTiny).withFaceDescriptor();
          if (r) {
            liveMissCount = 0;
            return pack(r, frame, false);
          }
        } catch (_) {
          return null;
        }
        liveMissCount += 1;
        return null;
      } else {
        try {
          const r = await faceapi.detectSingleFace(frame, fastTinyOpts).withFaceLandmarks(landmarksTiny).withFaceDescriptor();
          if (r) {
            liveMissCount = 0;
            return pack(r, frame, false);
          }
        } catch (_) {
          return null;
        }
        liveMissCount += 1;
        if ((liveMissCount % 6) === 0) {
          try {
            const bcv = buildBoostFrame();
            const rb = await faceapi.detectSingleFace(bcv, boostTinyOpts).withFaceLandmarks(landmarksTiny).withFaceDescriptor();
            if (rb) {
              preferBoostPass = true;
              liveMissCount = 0;
              return pack(rb, bcv, false);
            }
          } catch (_) {}
        }
        return null;
      }
    }

    // Static image / manual capture path: Primary detector -> TinyFaceDetector(416) -> SSD fallback
    let r = await faceapi.detectSingleFace(frame, opts()).withFaceLandmarks(landmarksTiny).withFaceDescriptor();
    if (!r) {
      const fallbackOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.22 });
      r = await faceapi.detectSingleFace(frame, fallbackOpts).withFaceLandmarks(landmarksTiny).withFaceDescriptor();
    }
    if (!r && allowCropFallback) {
      await ensureSsdLoaded();
      if (detector === "ssd") {
        r = await faceapi.detectSingleFace(frame, opts("ssd")).withFaceLandmarks(landmarksTiny).withFaceDescriptor();
      }
    }
    if (r) return pack(r, frame, false);

    try {
      const bcv = buildBoostFrame();
      const boostOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.18 });
      r = await faceapi.detectSingleFace(bcv, boostOpts).withFaceLandmarks(landmarksTiny).withFaceDescriptor();
      if (!r && detector === "ssd" && allowCropFallback) {
        const boostSsdOpts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.20 });
        r = await faceapi.detectSingleFace(bcv, boostSsdOpts).withFaceLandmarks(landmarksTiny).withFaceDescriptor();
      }
      if (r) return pack(r, bcv, false);
    } catch (_) {}
    if (allowCropFallback) {
      // Fallback 3: Explicit manual capture in extreme backlighting -> compute 128-d descriptor from central reticle crop
      try {
        const fw = frameWidth(frame) || 640;
        const fh = frame.videoHeight || frame.naturalHeight || frame.height || 480;
        const ccv = cropCanvas || (cropCanvas = document.createElement("canvas"));
        ccv.width = 160;
        ccv.height = 160;
        const cctx = ccv.getContext("2d");
        cctx.filter = "brightness(1.35) contrast(1.18)";
        const sx = Math.round(fw * 0.24), sy = Math.round(fh * 0.14);
        const sw = Math.round(fw * 0.52), sh = Math.round(fh * 0.72);
        cctx.drawImage(frame, sx, sy, sw, sh, 0, 0, 160, 160);
        cctx.filter = "none";
        const desc = await faceapi.computeFaceDescriptor(ccv);
        if (desc) {
          return {
            descriptor: desc,
            box: { x: sx, y: sy, width: sw, height: sh },
            score: 0.78,
            detScore: 0.78,
            frac: 0.52,
            faceSizeFrac: 0.52,
            multiple: false,
            landmarks: null,
            ear: null,
            cropFallback: true
          };
        }
      } catch (_) {}
    }
    return null;
  }

  async function detectAll(src) {
    if (!ready) return [];
    const frame = frameToCanvas(src);
    if (!frame) return [];
    const rs = await faceapi.detectAllFaces(frame, opts()).withFaceLandmarks(landmarksTiny).withFaceDescriptors();
    return rs.map(r => pack(r, frame));
  }

  async function landmarksOnly(src) {
    if (!ready) return null;
    const frame = frameToCanvas(src);
    if (!frame) return null;
    const r = await faceapi.detectSingleFace(frame, opts("tiny")).withFaceLandmarks(landmarksTiny);
    if (!r) return null;
    const lm = r.landmarks.positions;
    return { box: r.detection.box, landmarks: lm, ear: ear(lm) };
  }

  function euclidean(a, b) {
    if (typeof faceapi !== "undefined" && faceapi.euclideanDistance) return faceapi.euclideanDistance(a, b);
    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const diff = (Number(a[i]) || 0) - (Number(b[i]) || 0);
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  // Supports both [{ id, email, name, samples: [[128], ...] }] and flat [{ staffId, d: [128] }]
  function match(descriptor, enrolled) {
    let best = null, bestDist = 9, second = null, secondDist = 9;
    for (const item of (enrolled || [])) {
      if (!item) continue;
      if (Array.isArray(item.samples)) {
        let empBest = 9;
        for (const s of item.samples) {
          if (!Array.isArray(s) || s.length !== 128) continue;
          const d = euclidean(descriptor, s);
          if (d < empBest) empBest = d;
        }
        if (empBest < bestDist) {
          second = best; secondDist = bestDist;
          best = item; bestDist = empBest;
        } else if (empBest < secondDist) {
          second = item; secondDist = empBest;
        }
      } else if (Array.isArray(item.d) && item.d.length === 128) {
        const d = euclidean(descriptor, item.d);
        const key = item.email || item.staffId || item.id;
        if (d < bestDist) {
          if (best && (best.email || best.staffId || best.id) !== key) { second = best; secondDist = bestDist; }
          best = item; bestDist = d;
        } else if (best && (best.email || best.staffId || best.id) !== key && d < secondDist) {
          second = item; secondDist = d;
        }
      }
    }
    return {
      best,
      bestDist,
      second,
      secondDist,
      staffId: best ? (best.email || best.staffId || best.id) : null,
      distance: bestDist,
      runnerUp: second ? { staffId: second.email || second.staffId || second.id, distance: secondDist } : null,
      margin: second ? (secondDist - bestDist) : 9
    };
  }

  function decide(m, cfgOrThr, meta = {}) {
    const cfg = (cfgOrThr && typeof cfgOrThr === "object")
      ? Object.assign({}, M(), cfgOrThr)
      : Object.assign({}, M(), { threshold: cfgOrThr == null ? M().threshold : Number(cfgOrThr) });
    if (!m || !m.best) return { status: "no-enrolled", ok: false, reason: "no-enrolments" };
    if (meta.faceSizeFrac != null && meta.faceSizeFrac < (cfg.minFaceFrac || 0.14)) {
      return { status: "too-small", ok: false, reason: "too-small", best: m.best, bestDist: m.bestDist };
    }
    if (m.bestDist > cfg.threshold) {
      return { status: "unknown", ok: false, reason: "far", best: m.best, bestDist: m.bestDist };
    }
    if (m.second && (m.secondDist - m.bestDist) < (cfg.margin || 0.08)) {
      return { status: "ambiguous", ok: false, reason: "ambiguous", best: m.best, second: m.second, bestDist: m.bestDist, secondDist: m.secondDist };
    }
    if (cfg.weakAbove && m.bestDist > cfg.weakAbove) {
      return { status: "weak", ok: true, weak: true, reason: "", best: m.best, bestDist: m.bestDist, secondDist: m.secondDist };
    }
    return { status: "ok", ok: true, weak: false, reason: "", best: m.best, bestDist: m.bestDist, secondDist: m.secondDist };
  }

  function calibration(enrolled) {
    const perEmp = [];
    const pairs = [];
    const list = (enrolled || []).filter(e => e && Array.isArray(e.samples) && e.samples.length > 0);
    for (const e of list) {
      let maxIntra = 0;
      const s = e.samples;
      for (let i = 0; i < s.length; i++) {
        for (let j = i + 1; j < s.length; j++) {
          const d = euclidean(s[i], s[j]);
          if (d > maxIntra) maxIntra = d;
        }
      }
      perEmp.push({ id: e.id || e.email, name: e.name || e.email, samples: s.length, spread: maxIntra });
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        let minInter = 9;
        for (const sa of list[i].samples) {
          for (const sb of list[j].samples) {
            const d = euclidean(sa, sb);
            if (d < minInter) minInter = d;
          }
        }
        pairs.push({ a: list[i].name || list[i].email, b: list[j].name || list[j].email, d: minInter });
      }
    }
    pairs.sort((x, y) => x.d - y.d);
    const maxSpread = perEmp.reduce((m, x) => Math.max(m, x.spread), 0);
    const minPair = pairs.length ? pairs[0].d : null;
    const recThr = minPair != null
      ? Math.max(0.40, Math.min(0.55, Number(((maxSpread + minPair) / 2).toFixed(2))))
      : 0.50;
    return { perEmp, pairs, maxSpread, minPair, recommendedThreshold: recThr };
  }

  // Exact Attendance v0.2.4 camera-top pose pictograms (mirrored-preview sense)
  function poseSvg(kind) {
    if (kind === 0) kind = "straight";
    else if (kind === 1) kind = "left";
    else if (kind === 2) kind = "right";
    else if (kind === 3) kind = "done";
    const W = "currentColor", B = "#D9A54A";
    const cam = `<rect x="40" y="2" width="20" height="12" rx="3" fill="${B}"/><circle cx="50" cy="8" r="3.4" fill="#0f172a"/>`;
    const sight = `<path d="M50 16 V40" fill="none" stroke="${B}" stroke-width="2" stroke-dasharray="3 4" stroke-linecap="round"/>`;
    const earL = `<path d="M24.5 57 q-8 7 0 14" fill="none" stroke="${W}" stroke-width="3.5" stroke-linecap="round"/>`;
    const earR = `<path d="M75.5 57 q8 7 0 14" fill="none" stroke="${W}" stroke-width="3.5" stroke-linecap="round"/>`;
    const head = dx => `<circle cx="50" cy="64" r="26" fill="none" stroke="${W}" stroke-width="4"/>` +
      `<circle cx="${41 + dx}" cy="58" r="${dx < 0 ? 2.7 : 3.3}" fill="${W}"/><circle cx="${59 + dx}" cy="58" r="${dx > 0 ? 2.7 : 3.3}" fill="${W}"/>` +
      `<path d="M${50 + dx * 1.5} 59 v9 h${dx >= 0 ? 5 : -5}" fill="none" stroke="${W}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="M${42 + dx} 76 h16" fill="none" stroke="${W}" stroke-width="3.5" stroke-linecap="round"/>`;
    const arrow = (d, dx) => `<g class="face-pose-arrow" style="--dx:${dx}px;--dy:0px"><path d="${d}" fill="none" stroke="${B}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    let body;
    switch (kind) {
      case "left":  body = cam + head(-6) + earR + arrow("M60 32 Q50 20 38 29 M46 28 L38 29 L41 22", -4); break;
      case "right": body = cam + head(6) + earL + arrow("M40 32 Q50 20 62 29 M54 28 L62 29 L59 22", 4); break;
      case "done":  body = `<circle cx="50" cy="56" r="34" fill="none" stroke="#22c55e" stroke-width="5"/><path d="M32 58 l12 12 l26 -28" fill="none" stroke="#22c55e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`; break;
      default:      body = cam + sight + head(0) + earL + earR;
    }
    return `<svg viewBox="0 0 100 92" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  }

  // Biometric HUD reticle overlay (Attendance v0.3.0)
  function drawOverlay(cv, video, det, status) {
    if (!cv || !video) return;
    const wrap = cv.parentElement;
    const cw = wrap ? wrap.clientWidth : 0;
    const ch = wrap ? wrap.clientHeight : 0;
    if (!cw || !ch) return;
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    const g = cv.getContext("2d");
    g.clearRect(0, 0, cw, ch);
    if (!det || !det.box) return;
    const vw = video.videoWidth || cw, vh = video.videoHeight || ch;
    const s = Math.max(cw / vw, ch / vh);
    const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
    const b = det.box;
    const x = b.x * s + ox, y = b.y * s + oy, w = b.width * s, h = b.height * s;
    const col = (status && status.startsWith("#"))
      ? status
      : ({ ok: "#22c55e", live: "#38bdf8", warn: "#f59e0b", unknown: "#f59e0b", far: "#94a3b8", scan: "#D9A54A" }[status] || "#D9A54A");
    const L = Math.min(w, h) * 0.22;

    g.save();
    g.strokeStyle = col + "33";
    g.lineWidth = 1.5;
    g.strokeRect(x, y, w, h);

    g.shadowColor = col;
    g.shadowBlur = 12;
    g.lineWidth = 3.5;
    g.strokeStyle = col;
    g.lineCap = "round";
    const corner = (cx, cy, dx, dy) => {
      g.beginPath();
      g.moveTo(cx + dx * L, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + dy * L);
      g.stroke();
    };
    corner(x, y, 1, 1);
    corner(x + w, y, -1, 1);
    corner(x, y + h, 1, -1);
    corner(x + w, y + h, -1, -1);

    g.shadowBlur = 0;
    g.lineWidth = 2;
    const tick = 5;
    g.beginPath();
    g.moveTo(x + w / 2, y - tick / 2); g.lineTo(x + w / 2, y + tick / 2);
    g.moveTo(x + w / 2, y + h - tick / 2); g.lineTo(x + w / 2, y + h + tick / 2);
    g.moveTo(x - tick / 2, y + h / 2); g.lineTo(x + tick / 2, y + h / 2);
    g.moveTo(x + w - tick / 2, y + h / 2); g.lineTo(x + w + tick / 2, y + h / 2);
    g.stroke();
    g.restore();
  }

  // Synthesized Web Audio feedback (disabled by default — camera-only Face ID)
  const Sound = (() => {
    let ctx = null;
    let enabled = false;
    function getCtx() {
      if (navigator.webdriver || !enabled) return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }
    function tone(freq, dur, delay, type, gainVal) {
      try {
        const c = getCtx(); if (!c) return;
        const t0 = c.currentTime + (delay || 0);
        const osc = c.createOscillator(), g = c.createGain();
        osc.type = type || "sine";
        osc.frequency.setValueAtTime(freq, t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(gainVal || 0.12, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(c.destination);
        osc.start(t0); osc.stop(t0 + dur + 0.02);
      } catch (_) {}
    }
    return {
      unlock() { getCtx(); },
      play(kind) {
        if (!enabled || navigator.webdriver) return;
        if (kind === "in" || kind === "ok") { tone(587.33, 0.14, 0, "sine", 0.14); tone(880, 0.24, 0.11, "triangle", 0.16); }
        else if (kind === "warn") { tone(349.23, 0.12, 0, "triangle", 0.12); tone(311.13, 0.18, 0.13, "triangle", 0.12); }
        else if (kind === "capture") { tone(1046.5, 0.09, 0, "sine", 0.10); }
        else if (kind === "tap") { tone(660, 0.035, 0, "sine", 0.05); }
      },
      playSuccess() { this.play("ok"); },
      playWarn() { this.play("warn"); },
      playError() { this.play("warn"); },
      get enabled() { return enabled; },
      set enabled(v) { enabled = !!v; }
    };
  })();

  return {
    config: MFG_FACE_CONFIG,
    CONFIG: MFG_FACE_CONFIG.match,
    load,
    loadDetector,
    prewarm,
    gateAutoStart,
    gateAutoStartNow: () => gateAutoNow,
    deviceUsesFaceId,
    forgetDeviceFaceId,
    resumeDeviceFaceId,
    isPrewarming: () => Boolean(earlyStreamPromise && !earlyCancelled),
    consumeEarlyStream,
    trackStream,
    stopAllStreams,
    isReady: () => ready,
    isDetectorReady: () => detectorReady,
    getBackend: () => backend,
    detectOne,
    detectAll,
    landmarksOnly,
    match,
    decide,
    calibration,
    ear,
    pose,
    analyzePad,
    evaluatePassiveLiveness,
    checkDescriptorStability,
    averageDescriptors,
    euclidean,
    frameToCanvas,
    snapshot,
    poseSvg,
    drawOverlay,
    Sound,
    get ready() { return ready; },
    get detectorReady() { return detectorReady; },
    get backend() { return backend; },
    get detector() { return detector; },
    get landmarks() { return landmarksTiny ? "68-tiny" : "68"; }
  };
})();
window.Face = Face;
Face.prewarm();
