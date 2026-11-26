# build/tour_video/verify_whatsapp_reels_v1.py
# Verifies decode, 1080x1920 @25fps parity, loudness, motion smoothness, SRT script match & outward copy hygiene.
from __future__ import annotations

import shutil
import sys
from pathlib import Path as _Path

sys.path = [str(_Path.home() / ".theo" / "tools" / "py312-video")] + sys.path

import json
import re
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

_ff_default = Path.home() / ".theo" / "tools" / "bin" / "ffmpeg.exe"
FF = _ff_default if _ff_default.exists() else Path(shutil.which("ffmpeg") or str(_ff_default))
ROOT = Path(__file__).resolve().parent
ISABI_WT = ROOT.parent.parent
OUT_ROOT = ISABI_WT / "exports" / "ISABI_WhatsApp_Reels_v1"
REV = OUT_ROOT / "review"
WORK = OUT_ROOT / "build" / "work"

SLUGS = ("readymix_en", "readymix_ar", "resorts_en", "resorts_ar")


def _ff_run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([str(FF), *args], capture_output=True, text=True, encoding="utf-8", errors="replace")


def _probe_streams(mp4: Path) -> dict:
    p_info = _ff_run(["-i", str(mp4)])
    p_dec = _ff_run(["-v", "error", "-i", str(mp4), "-map", "0:v:0", "-c", "copy", "-f", "null", "NUL"])
    p_full = _ff_run(["-stats", "-v", "info", "-i", str(mp4), "-f", "null", "NUL"])

    m_dur = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", p_info.stderr)
    dur_s = (int(m_dur.group(1)) * 3600 + int(m_dur.group(2)) * 60 + float(m_dur.group(3))) if m_dur else 0.0
    m_fps = re.search(r"(\d+(?:\.\d+)?)\s*fps", p_info.stderr)
    fps = float(m_fps.group(1)) if m_fps else 0.0
    m_res = re.search(r"Video:.*?(\d{3,4})x(\d{3,4})", p_info.stderr)
    res = f"{m_res.group(1)}x{m_res.group(2)}" if m_res else ""
    m_frames = re.findall(r"frame=\s*(\d+)", p_full.stderr)
    frames = int(m_frames[-1]) if m_frames else 0

    m_a = re.search(r"Audio:.*?(\d+)\s*kb/s", p_info.stderr)
    pv_dur = _ff_run(["-i", str(mp4), "-map", "0:v:0", "-f", "null", "NUL"])
    pa_dur = _ff_run(["-i", str(mp4), "-map", "0:a:0", "-f", "null", "NUL"])
    tv = re.findall(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)", pv_dur.stderr)
    ta = re.findall(r"time=(\d+):(\d+):(\d+(?:\.\d+)?)", pa_dur.stderr)
    to_s = lambda x: int(x[0]) * 3600 + int(x[1]) * 60 + float(x[2])
    v_dur = to_s(tv[-1]) if tv else 0.0
    a_dur = to_s(ta[-1]) if ta else 0.0

    return {
        "decode_errors": p_dec.stderr.strip(),
        "duration_s": round(dur_s, 3),
        "v_dur_s": round(v_dur, 3),
        "a_dur_s": round(a_dur, 3),
        "av_delta_ms": round(abs(v_dur - a_dur) * 1000.0, 2),
        "fps": fps,
        "resolution": res,
        "frames": frames,
        "audio_kbps": int(m_a.group(1)) if m_a else 0,
    }


def _probe_loudness(mp4: Path) -> dict:
    p = _ff_run(["-i", str(mp4), "-af", "ebur128=peak=true", "-f", "null", "NUL"])
    lufs = None
    tp = None
    m_i = re.findall(r"\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS", p.stderr)
    m_t = re.findall(r"Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS", p.stderr)
    if m_i:
        lufs = float(m_i[-1])
    if m_t:
        tp = float(m_t[-1])
    return {"integrated_lufs": lufs, "true_peak_dbtp": tp}


def _measure_motion_roughness(slug: str, mp4: Path) -> dict:
    # Crop strictly inside the 780x1360 phone UI stage (150..930, 172..1532) during Scene 1
    raw_out = WORK / f"{slug}_qa_motion.rgb"
    _ff_run([
        "-y", "-ss", "1.2", "-t", "2.8", "-i", str(mp4),
        "-vf", "crop=620:960:230:350,scale=310:480:flags=lanczos",
        "-f", "rawvideo", "-pix_fmt", "gray", str(raw_out)
    ])
    buf = raw_out.read_bytes()
    n_f = len(buf) // (310 * 480)
    frames = np.frombuffer(buf[: n_f * 310 * 480], dtype=np.uint8).reshape(n_f, 480, 310).astype(np.float64)
    diffs = np.mean(np.abs(np.diff(frames, axis=0)), axis=(1, 2))
    step_jumps = np.abs(np.diff(diffs))
    med_jump = float(np.median(step_jumps))
    mean_v = float(np.mean(diffs))
    norm_jitter = med_jump / max(1e-6, mean_v)
    return {
        "sampled_frames": int(n_f),
        "mean_pixel_delta": round(mean_v, 4),
        "median_step_jitter": round(med_jump, 4),
        "normalized_jitter": round(norm_jitter, 4),
    }


def _check_texts(slug: str) -> dict:
    narration = (OUT_ROOT / f"Narration_{slug}.txt").read_text("utf-8")
    srt = (OUT_ROOT / f"Subtitles_{slug}.srt").read_text("utf-8")
    ass = (WORK / f"{slug}.ass").read_text("utf-8")

    script_words = []
    for line in narration.splitlines():
        if ":" in line:
            _, body = line.split(":", 1)
            script_words.extend(body.strip().split())

    srt_words = []
    for line in srt.splitlines():
        s = line.strip()
        if not s or s.isdigit() or "-->" in s:
            continue
        srt_words.extend(s.split())

    jargon_re = re.compile(
        r"\b(sql|postgresql|sqlite|indexeddb|pwa|rls|schema|150ms|93k|80mm|58mm|128-d|cloud relay|"
        r"microsoft|power bi|dataverse|power apps|theo)\b",
        re.IGNORECASE,
    )
    nb_path = ISABI_WT.parent / "isabi-app" / "build" / "private_namebook.json"
    private_terms = []
    if nb_path.exists():
        try:
            nb = json.loads(nb_path.read_text("utf-8"))
            for key in ("extended_parties", "bio_quarantine", "senior_people", "owner_family"):
                for item in nb.get(key) or []:
                    val = item.get("name") if isinstance(item, dict) else item
                    if isinstance(val, str) and len(val.strip()) >= 4:
                        private_terms.append(val.strip())
        except Exception:
            pass
    priv_re = re.compile("|".join(re.escape(t) for t in sorted(set(private_terms))), re.IGNORECASE) if private_terms else None
    hits = {}
    for k, txt in (("narration", narration), ("srt", srt), ("ass", ass)):
        bad = []
        if "\u2014" in txt or "\u2192" in txt:
            bad.append("em-dash-or-arrow")
        m = jargon_re.findall(txt) + (priv_re.findall(txt) if priv_re else [])
        if m:
            bad.extend(sorted(set(x.lower() for x in m)))
        if bad:
            hits[k] = bad

    prev_end = -1
    bad_ts = []
    for line in srt.splitlines():
        m = re.match(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})", line.strip())
        if not m:
            continue
        t0 = (int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))) * 1000 + int(m.group(4))
        t1 = (int(m.group(5)) * 3600 + int(m.group(6)) * 60 + int(m.group(7))) * 1000 + int(m.group(8))
        if t1 <= t0 or t0 < prev_end:
            bad_ts.append(f"{line.strip()} (prev_end={prev_end}ms)")
        prev_end = t1

    return {
        "script_word_count": len(script_words),
        "srt_word_count": len(srt_words),
        "srt_exact_match": script_words == srt_words,
        "cue_overlaps": bad_ts,
        "forbidden_hits": hits,
    }


def main() -> None:
    readme = (OUT_ROOT / "README.md").read_text("utf-8")
    readme_clean = ("\u2014" not in readme and "\u2192" not in readme)

    comb_cs = REV / "contact_sheet_all_4_reels.jpg"
    with Image.open(comb_cs) as im:
        comb_size = im.size

    reels_qa = {}
    all_checks = {
        "readme_clean": readme_clean,
        "combined_contact_sheet": comb_size == (1440, 2560),
    }

    for slug in SLUGS:
        mp4 = OUT_ROOT / f"ISABI_WhatsApp_{slug}_v1.mp4"
        cs = REV / f"contact_sheet_{slug}.jpg"
        info = _probe_streams(mp4)
        loud = _probe_loudness(mp4)
        motion = _measure_motion_roughness(slug, mp4)
        texts = _check_texts(slug)
        with Image.open(cs) as cim:
            cs_size = cim.size

        size_bytes = mp4.stat().st_size
        lufs_ok = bool(loud["integrated_lufs"] is not None and -17.0 <= loud["integrated_lufs"] <= -15.0)
        tp_ok = bool(loud["true_peak_dbtp"] is not None and loud["true_peak_dbtp"] <= -1.3)

        checks = {
            "decode_clean": info["decode_errors"] == "",
            "resolution_1080x1920_25fps": info["resolution"] == "1080x1920" and info["fps"] == 25.0,
            "duration_25_to_37s": 25.0 <= info["duration_s"] <= 37.0,
            "av_delta_under_20ms": info["av_delta_ms"] < 20.0,
            "loudness_target": lufs_ok,
            "true_peak_ceiling": tp_ok,
            "size_under_8mb": size_bytes < 8 * 1024 * 1024,
            "contact_sheet_4x1": cs_size == (1440, 640),
            "srt_script_exact_match": texts["srt_exact_match"],
            "cue_timestamps_non_overlapping": texts["cue_overlaps"] == [],
            "zero_forbidden_copy": texts["forbidden_hits"] == {},
            "motion_calm_subpixel": 0.005 <= motion["normalized_jitter"] <= 0.13 and motion["mean_pixel_delta"] > 0.08,
        }
        all_checks[slug] = all(checks.values())
        reels_qa[slug] = {
            "pass": all(checks.values()),
            "checks": checks,
            "stream": info,
            "loudness": loud,
            "bytes": size_bytes,
            "mib": round(size_bytes / (1024 * 1024), 3),
            "motion": motion,
            "texts": texts,
            "contact_sheet_size": list(cs_size),
        }

    qa = {
        "pass": all(all_checks.values()),
        "summary_checks": all_checks,
        "combined_contact_sheet_size": list(comb_size),
        "reels": reels_qa,
    }
    REV.mkdir(parents=True, exist_ok=True)
    (REV / "QA.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(qa, ensure_ascii=False, indent=2))
    if not qa["pass"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
