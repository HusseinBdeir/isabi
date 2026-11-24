# build/tour_video/verify_tour_v1.py
# Verifies decode, frame parity, loudness, motion smoothness, subtitles & outward copy hygiene.
from __future__ import annotations

import sys

sys.path = [r"C:\Users\hbdei\.theo\tools\py312-video"] + [p for p in sys.path if "Case Nash" not in p]

import json
import os
import re
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

FF = Path(r"C:\Users\hbdei\.theo\tools\bin\ffmpeg.exe")
ROOT = Path(__file__).resolve().parent
ISABI_WT = ROOT.parent.parent
OUT_ROOT = ISABI_WT / "exports" / "ISABI_Tour_v1"
REV = OUT_ROOT / "review"
WORK = OUT_ROOT / "build" / "work"


def _ff_run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run([str(FF), *args], capture_output=True, text=True, encoding="utf-8", errors="replace")


def _probe_streams(mp4: Path) -> dict:
    # Decode whole file cleanly and extract frame count, duration & stream info
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
    # Check A/V duration via separate null decodes
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


def _measure_motion_roughness(mp4: Path) -> dict:
    # Measure sub-pixel Ken Burns velocity stability inside Scene 1 interior window (y=150..850, excluding captions).
    # Integer-snapping zoompan causes periodic step jumps (median step jitter >= 0.15); smooth cubic easing stays < 0.08.
    raw_out = WORK / "qa_motion.rgb"
    _ff_run([
        "-y", "-ss", "2.0", "-t", "3.0", "-i", str(mp4),
        "-vf", "crop=1100:620:410:170,scale=550:310:flags=lanczos",
        "-f", "rawvideo", "-pix_fmt", "gray", str(raw_out)
    ])
    buf = raw_out.read_bytes()
    n_f = len(buf) // (550 * 310)
    frames = np.frombuffer(buf[: n_f * 550 * 310], dtype=np.uint8).reshape(n_f, 310, 550).astype(np.float64)
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


def _check_texts() -> dict:
    narration = (OUT_ROOT / "Narration_English.txt").read_text("utf-8")
    en_vtt = (OUT_ROOT / "isabi-tour-en.vtt").read_text("utf-8")
    ar_vtt = (OUT_ROOT / "isabi-tour-ar.vtt").read_text("utf-8")
    fr_vtt = (OUT_ROOT / "isabi-tour-fr.vtt").read_text("utf-8")
    srt = (OUT_ROOT / "English_Subtitles.srt").read_text("utf-8")
    readme = (OUT_ROOT / "README.md").read_text("utf-8")

    # Extract script words from Narration_English.txt
    script_words = []
    for line in narration.splitlines():
        if ":" in line:
            _, body = line.split(":", 1)
            script_words.extend(body.strip().split())

    vtt_words = []
    for line in en_vtt.splitlines():
        s = line.strip()
        if not s or s == "WEBVTT" or "-->" in s:
            continue
        vtt_words.extend(s.split())

    srt_words = []
    for line in srt.splitlines():
        s = line.strip()
        if not s or s.isdigit() or "-->" in s:
            continue
        srt_words.extend(s.split())

    jargon_re = re.compile(
        r"\b(sql|postgresql|sqlite|indexeddb|pwa|rls|schema|150ms|93k|80mm|58mm|128-d|cloud relay|"
        r"microsoft|power bi|dataverse|power apps|theo|wtc|bbconstruction|lions transport|bdeir|blanca|"
        r"la una|palms|voile|korri|shacman|4235 company)\b",
        re.IGNORECASE,
    )
    corpus = {"narration": narration, "en_vtt": en_vtt, "ar_vtt": ar_vtt, "fr_vtt": fr_vtt, "srt": srt, "readme": readme}
    hits = {}
    for k, txt in corpus.items():
        bad = []
        if "\u2014" in txt or "\u2192" in txt:
            bad.append("em-dash-or-arrow")
        m = jargon_re.findall(txt)
        if m:
            bad.extend(sorted(set(x.lower() for x in m)))
        if bad:
            hits[k] = bad

    overlaps = {}
    for fname, raw_txt in (("English_Subtitles.srt", srt), ("isabi-tour-en.vtt", en_vtt), ("isabi-tour-ar.vtt", ar_vtt), ("isabi-tour-fr.vtt", fr_vtt)):
        prev_end = -1
        bad_ts = []
        for line in raw_txt.splitlines():
            m = re.match(r"(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})[.,](\d{3})", line.strip())
            if not m:
                continue
            t0 = (int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))) * 1000 + int(m.group(4))
            t1 = (int(m.group(5)) * 3600 + int(m.group(6)) * 60 + int(m.group(7))) * 1000 + int(m.group(8))
            if t1 <= t0 or t0 < prev_end:
                bad_ts.append(f"{line.strip()} (prev_end={prev_end}ms)")
            prev_end = t1
        if bad_ts:
            overlaps[fname] = bad_ts

    return {
        "script_word_count": len(script_words),
        "vtt_word_count": len(vtt_words),
        "srt_word_count": len(srt_words),
        "vtt_exact_match": script_words == vtt_words,
        "srt_exact_match": script_words == srt_words,
        "cue_overlaps": overlaps,
        "forbidden_hits": hits,
    }


def main() -> None:
    master_mp4 = OUT_ROOT / "ISABI_Systems_Tour_v1_1080p.mp4"
    share_mp4 = OUT_ROOT / "ISABI_Systems_Tour_v1_1080p_share.mp4"
    cap_mp4 = OUT_ROOT / "ISABI_Systems_Tour_v1_1080p_EN_captioned.mp4"
    web_mp4 = ISABI_WT / "isabi-tour.mp4"
    poster_jpg = ISABI_WT / "isabi-tour-poster.jpg"
    cs_jpg = REV / "contact_sheet.jpg"

    m_info = _probe_streams(master_mp4)
    s_info = _probe_streams(share_mp4)
    c_info = _probe_streams(cap_mp4) if cap_mp4.is_file() else None
    m_loud = _probe_loudness(master_mp4)
    s_loud = _probe_loudness(share_mp4)
    c_loud = _probe_loudness(cap_mp4) if cap_mp4.is_file() else None
    motion = _measure_motion_roughness(master_mp4)
    texts = _check_texts()

    with Image.open(cs_jpg) as cs_im:
        cs_size = cs_im.size
    with Image.open(poster_jpg) as p_im:
        poster_size = p_im.size
        arr = np.asarray(p_im.convert("RGB"))
        # Corner background must be light warm ivory (sum >= 720)
        corner_rgb = [int(arr[8, 8, 0]), int(arr[8, 8, 1]), int(arr[8, 8, 2])]

    lufs_ok = lambda l: bool(l and l["integrated_lufs"] is not None and -17.0 <= l["integrated_lufs"] <= -15.0)
    tp_ok = lambda l: bool(l and l["true_peak_dbtp"] is not None and l["true_peak_dbtp"] <= -1.3)

    checks = {
        "master_decode_clean": m_info["decode_errors"] == "",
        "share_decode_clean": s_info["decode_errors"] == "",
        "captioned_decode_clean": bool(c_info and c_info["decode_errors"] == ""),
        "same_frame_count": m_info["frames"] == s_info["frames"] and m_info["frames"] > 2000 and bool(c_info and c_info["frames"] == m_info["frames"]),
        "resolution_1080p": m_info["resolution"] == "1920x1080" and m_info["fps"] == 25.0,
        "duration_in_window": 84.0 <= m_info["duration_s"] <= 96.0,
        "av_delta_under_20ms": m_info["av_delta_ms"] < 20.0 and s_info["av_delta_ms"] < 20.0,
        "loudness_target": lufs_ok(m_loud) and lufs_ok(s_loud) and lufs_ok(c_loud),
        "true_peak_ceiling": tp_ok(m_loud) and tp_ok(s_loud) and tp_ok(c_loud),
        "share_size_under_15mb": share_mp4.stat().st_size < 15 * 1024 * 1024,
        "web_mp4_synced": web_mp4.is_file() and web_mp4.stat().st_size == share_mp4.stat().st_size,
        "poster_light_1080p": poster_size == (1920, 1080) and sum(corner_rgb) >= 720,
        "contact_sheet_4x2": cs_size == (2560, 720),
        "caption_script_match": texts["vtt_exact_match"] and texts["srt_exact_match"],
        "cue_timestamps_non_overlapping": texts["cue_overlaps"] == {},
        "zero_forbidden_copy": texts["forbidden_hits"] == {},
        "motion_calm_subpixel": 0.005 <= motion["normalized_jitter"] <= 0.13 and motion["mean_pixel_delta"] > 0.1,
    }

    qa = {
        "pass": all(checks.values()),
        "checks": checks,
        "master": {**m_info, **m_loud, "bytes": master_mp4.stat().st_size},
        "share": {**s_info, **s_loud, "bytes": share_mp4.stat().st_size},
        "captioned": ({**c_info, **c_loud, "bytes": cap_mp4.stat().st_size} if c_info and c_loud else None),
        "motion": motion,
        "texts": texts,
        "contact_sheet_size": list(cs_size),
        "poster_size": list(poster_size),
        "poster_corner_rgb": corner_rgb,
    }
    REV.mkdir(parents=True, exist_ok=True)
    (REV / "QA.json").write_text(json.dumps(qa, indent=2), encoding="utf-8")
    print(json.dumps(qa, indent=2))
    if not qa["pass"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
