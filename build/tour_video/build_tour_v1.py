# build/tour_video/build_tour_v1.py
# Builds ISABI_Systems_Tour_v1 (8 scenes, ~90s, 1920x1080 @ 25fps, EN/AR/FR subtitles, -16 LUFS)
from __future__ import annotations

import sys

sys.path = [r"C:\Users\hbdei\.theo\tools\py312-video"] + [p for p in sys.path if "Case Nash" not in p]

import asyncio
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import edge_tts
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FF = Path(r"C:\Users\hbdei\.theo\tools\bin\ffmpeg.exe")
ROOT = Path(__file__).resolve().parent
ISABI_WT = ROOT.parent.parent
OUT_ROOT = ISABI_WT / "exports" / "ISABI_Tour_v1"
PLATES = OUT_ROOT / "plates"
ASSETS = OUT_ROOT / "assets"
FONTS = ASSETS / "fonts"
WORK = OUT_ROOT / "build" / "work"
REV = OUT_ROOT / "review"

VOICE = "en-US-AndrewMultilingualNeural"
VOICE_RATE = "+3%"
VOICE_PITCH = "+0Hz"
W, H, FPS = 1920, 1080, 25
DISSOLVE = 15
INTRO_PAD_FRAMES = 22
OUTRO_PAD_FRAMES = 32
RENDER_VERSION = "1.0.3"

# Measured font line-box ratios (fontTools unitsPerEm vs hhea/OS2 ascent+descent)
K_ARCHIVO = 1.088
K_INSTRUMENT = 1.22

SCENES = [
    {
        "id": 1,
        "slug": "unified_overview",
        "chapter": "01  ONE UNIFIED WORKSPACE",
        "plate": "shot_01.png",
        "layout": "studio",
        "kb_from": (0.0, 0.0, 1.00),
        "kb_to": (0.015, -0.008, 1.052),
        "en": "Replace scattered spreadsheets, disconnected tills, and rigid software with one live command center tailored around how your companies actually run.",
        "ar": "استبدل الجداول المتفرقة والصناديق المنفصلة والأنظمة الجامدة بمركز قيادة حي واحد مصمم وفق آلية عمل شركاتك الفعلية.",
        "fr": "Remplacez les tableurs dispersés, les caisses isolées et les logiciels rigides par un centre de pilotage adapté à votre activité.",
    },
    {
        "id": 2,
        "slug": "six_industries",
        "chapter": "02  SIX INDUSTRY WORKSPACES",
        "plate": "shot_02.png",
        "layout": "studio",
        "kb_from": (-0.012, -0.010, 1.045),
        "kb_to": (0.012, 0.005, 1.005),
        "en": "Switch effortlessly across Manufacturing, Hospitality, Trading, Real Estate, Insurance, and Group Holding with strict per-entity separation.",
        "ar": "تنقّل بسلاسة بين التصنيع والضيافة والتجارة والعقارات والتأمين والقابضة مع فصل كامل للبيانات والصلاحيات لكل شركة.",
        "fr": "Passez aisément de l'industrie à l'hôtellerie, au négoce, à l'immobilier, à l'assurance et à la holding avec une séparation stricte par entité.",
    },
    {
        "id": 3,
        "slug": "guided_entry_scan",
        "chapter": "03  GUIDED ENTRY & SMART SCAN",
        "plate": "shot_03.png",
        "layout": "studio",
        "kb_from": (0.0, 0.006, 1.005),
        "kb_to": (0.0, -0.008, 1.055),
        "en": "Capture sales tickets, vendor bills, and fleet logs through guided forms or smart document scan in English, Arabic, or French.",
        "ar": "سجّل الفواتير وتذاكر المبيع وسجلات الأسطول عبر نماذج موجهة أو مسح ذكي للمستندات بالعربية والإنجليزية والفرنسية.",
        "fr": "Saisissez tickets de vente, factures fournisseurs et journaux de flotte via des formulaires guidés ou la numérisation intelligente.",
    },
    {
        "id": 4,
        "slug": "bilingual_statements",
        "chapter": "04  BALANCED BOOKS & STATEMENTS",
        "plate": "shot_04.png",
        "layout": "studio",
        "kb_from": (0.008, -0.006, 1.015),
        "kb_to": (-0.008, 0.012, 1.060),
        "en": "Every operational entry posts automatically to double-entry ledgers, generating audit-ready trial balances and printable Arabic and English statements.",
        "ar": "تُرحّل كل عملية تلقائياً إلى قيود مزدوجة متوازنة، مع ميزان مراجعة فوري وكشوفات حساب قابلة للطباعة بالعربية والإنجليزية.",
        "fr": "Chaque opération s'impute automatiquement en partie double, générant balances auditées et relevés bilingues prêts à imprimer.",
    },
    {
        "id": 5,
        "slug": "dashboards_watchdogs",
        "chapter": "05  DASHBOARDS & 28 WATCHDOGS",
        "plate": "shot_05.png",
        "layout": "studio",
        "kb_from": (-0.012, 0.005, 1.010),
        "kb_to": (0.014, -0.006, 1.058),
        "en": "Drill into live KPIs, test margin and currency shifts in the Scenario Studio, and let twenty-eight watchdogs flag exceptions before close.",
        "ar": "استعرض مؤشرات الأداء الحية، واختبر سيناريوهات الأسعار والصرف، ودع ثمانية وعشرين مراقباً آلياً يلتقطون التناقضات قبل الإقفال.",
        "fr": "Explorez les indicateurs en direct, simulez vos marges et laissez vingt-huit sentinelles détecter les anomalies avant la clôture.",
    },
    {
        "id": 6,
        "slug": "ask_isabi_citations",
        "chapter": "06  ASK ISABI WITH CITATIONS",
        "plate": "shot_06.png",
        "layout": "studio",
        "kb_from": (0.006, 0.0, 1.005),
        "kb_to": (0.035, 0.004, 1.062),
        "en": "Ask plain questions or listen to spoken briefings in three languages, answered from live ledgers with clickable voucher citations.",
        "ar": "اطرح أسئلتك مباشرة أو استمع إلى موجز صوتي بثلاث لغات، بإجابات مستندة إلى الدفاتر الحية مع أرقام القيود الموثقة.",
        "fr": "Posez vos questions en langage naturel ou écoutez des synthèses vocales trilingues, appuyées sur vos pièces justificatives.",
    },
    {
        "id": 7,
        "slug": "offline_pos_biometrics",
        "chapter": "07  OFFLINE POS & GATE KIOSKS",
        "plate": "shot_07.png",
        "layout": "studio",
        "kb_from": (0.0, 0.004, 1.010),
        "kb_to": (0.0, -0.004, 1.052),
        "en": "Keep retail tills printing receipts and gate tablets verifying staff by face and PIN even offline, syncing the instant connectivity returns.",
        "ar": "واصل إصدار الإيصالات في نقاط البيع وتوثيق حضور الموظفين بالوجه والرمز حتى عند انقطاع الإنترنت، مع مزامنة فورية عند عودته.",
        "fr": "Continuez d'encaisser et de contrôler les accès par visage et code PIN même hors ligne, avec synchronisation dès le retour du réseau.",
    },
    {
        "id": 8,
        "slug": "cta_end_card",
        "chapter": "08  LIVE IN 14 DAYS",
        "plate": None,
        "layout": "end",
        "kb_from": (0.0, 0.0, 1.0),
        "kb_to": (0.0, 0.0, 1.0),
        "en": "Go live in fourteen days from three thousand dollars setup and fifty dollars per seat monthly. Start your consultation today at isabisystems.com.",
        "ar": "انطلق خلال أربعة عشر يوماً بتأسيس يبدأ من ثلاثة آلاف دولار وخمسين دولاراً شهرياً للمقعد. احجز استشارتك اليوم عبر isabisystems.com.",
        "fr": "Déployez en quatorze jours dès trois mille dollars de mise en place et cinquante dollars par utilisateur sur isabisystems.com.",
    },
]


def _run(cmd: list[str], log_path: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    if log_path is not None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "w", encoding="utf-8", errors="replace") as lf:
            proc = subprocess.run(cmd, stdout=lf, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
    else:
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and proc.returncode != 0:
        msg = f"Command failed ({proc.returncode}): {' '.join(str(x) for x in cmd)}"
        if log_path and log_path.exists():
            msg += "\n" + log_path.read_text("utf-8", errors="replace")[-1200:]
        elif proc.stderr:
            msg += "\n" + proc.stderr[-1200:]
        raise RuntimeError(msg)
    return proc


async def _tts_with_retry(text: str, mp3_path: Path, words_path: Path) -> list[dict]:
    last_err = None
    for attempt in range(4):
        try:
            comm = edge_tts.Communicate(text, VOICE, rate=VOICE_RATE, pitch=VOICE_PITCH, boundary="WordBoundary")
            audio_chunks = bytearray()
            events = []
            async for chunk in comm.stream():
                ctype = chunk.get("type")
                if ctype == "audio":
                    audio_chunks.extend(chunk["data"])
                elif ctype == "WordBoundary":
                    off_s = chunk["offset"] / 10_000_000.0
                    dur_s = chunk["duration"] / 10_000_000.0
                    events.append({"text": chunk["text"], "start": off_s, "end": off_s + dur_s})
            if len(audio_chunks) < 2000 or not events:
                raise RuntimeError(f"Empty TTS payload: bytes={len(audio_chunks)}, events={len(events)}")
            tokens = text.split()
            if len(events) != len(tokens):
                # Map events cleanly to tokens when hyphenated/dotted tokens split differently
                mapped = _align_word_events_to_tokens(tokens, events)
            else:
                mapped = [
                    {"token": tok, "start": ev["start"], "end": ev["end"]}
                    for tok, ev in zip(tokens, events)
                ]
            if len(mapped) != len(tokens):
                raise AssertionError(f"Token mapping mismatch: {len(mapped)} vs {len(tokens)}")
            tmp_mp3 = mp3_path.with_suffix(".mp3.tmp")
            tmp_json = words_path.with_suffix(".words.json.tmp")
            tmp_mp3.write_bytes(bytes(audio_chunks))
            tmp_json.write_text(json.dumps(mapped, indent=2), encoding="utf-8")
            tmp_mp3.replace(mp3_path)
            tmp_json.replace(words_path)
            return mapped
        except Exception as exc:
            last_err = exc
            await asyncio.sleep(1.0 + attempt)
    raise RuntimeError(f"TTS failed after retries for text={text!r}: {last_err}")


def _clean_norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _align_word_events_to_tokens(tokens: list[str], events: list[dict]) -> list[dict]:
    # Bidirectional exact-character alignment: handles both hyphenated script tokens splitting into multiple
    # TTS events (e.g. "per-entity") and multi-word TTS events (e.g. "Real Estate" emitted as one boundary).
    out = []
    ti, ei = 0, 0
    while ti < len(tokens) and ei < len(events):
        tok_n = _clean_norm(tokens[ti])
        ev_n = _clean_norm(events[ei]["text"])
        if tok_n == ev_n:
            out.append({"token": tokens[ti], "start": events[ei]["start"], "end": events[ei]["end"]})
            ti += 1
            ei += 1
            continue
        # Case A: one TTS event spans multiple script tokens (e.g. "Real Estate")
        if ev_n.startswith(tok_n) and len(tok_n) < len(ev_n):
            tj = ti + 1
            acc = tok_n
            while tj < len(tokens) and len(acc) < len(ev_n) and ev_n.startswith(acc + _clean_norm(tokens[tj])):
                acc += _clean_norm(tokens[tj])
                tj += 1
            if acc == ev_n:
                e0, e1 = events[ei]["start"], events[ei]["end"]
                tot_chars = sum(max(1, len(tokens[k])) for k in range(ti, tj))
                cur_t = e0
                for k in range(ti, tj):
                    span = (e1 - e0) * (max(1, len(tokens[k])) / tot_chars)
                    nxt_t = e1 if k == tj - 1 else cur_t + span
                    out.append({"token": tokens[k], "start": cur_t, "end": nxt_t})
                    cur_t = nxt_t
                ti = tj
                ei += 1
                continue
        # Case B: one script token spans multiple TTS events
        if tok_n.startswith(ev_n) and len(ev_n) < len(tok_n):
            ej = ei + 1
            acc = ev_n
            start = events[ei]["start"]
            end = events[ei]["end"]
            while ej < len(events) and len(acc) < len(tok_n) and tok_n.startswith(acc + _clean_norm(events[ej]["text"])):
                acc += _clean_norm(events[ej]["text"])
                end = events[ej]["end"]
                ej += 1
            if acc == tok_n:
                out.append({"token": tokens[ti], "start": start, "end": end})
                ti += 1
                ei = ej
                continue
        raise AssertionError(f"Word alignment mismatch at tok[{ti}]={tokens[ti]!r} vs ev[{ei}]={events[ei]['text']!r}")
    if ti != len(tokens) or ei != len(events):
        raise AssertionError(f"Unconsumed alignment tail: ti={ti}/{len(tokens)}, ei={ei}/{len(events)}")
    return out


async def generate_all_voice() -> list[dict]:
    vdir = WORK / "voice"
    vdir.mkdir(parents=True, exist_ok=True)
    results = []
    for sc in SCENES:
        text = sc["en"]
        digest = hashlib.sha256(f"{text}|{VOICE}|{VOICE_RATE}|{VOICE_PITCH}".encode("utf-8")).hexdigest()[:16]
        mp3 = vdir / f"scene_{sc['id']:02d}_{digest}.mp3"
        wjson = vdir / f"scene_{sc['id']:02d}_{digest}.words.json"
        wav = vdir / f"scene_{sc['id']:02d}_{digest}.wav"
        if mp3.is_file() and wjson.is_file():
            words = json.loads(wjson.read_text("utf-8"))
        else:
            words = await _tts_with_retry(text, mp3, wjson)
        if not wav.is_file():
            _run([str(FF), "-y", "-i", str(mp3), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)])
        # Measure actual WAV duration via ffmpeg stderr
        dur_s = _probe_audio_duration(wav)
        speech_end = max((w["end"] for w in words), default=dur_s)
        total_frames = INTRO_PAD_FRAMES + math.ceil(max(dur_s, speech_end) * FPS) + OUTRO_PAD_FRAMES
        # Enforce ~90s total runtime across 8 scenes (295*7 + 285 - 105 = 2245 frames = 89.8s)
        min_frames = 295 if sc["layout"] == "studio" else 285
        total_frames = max(total_frames, min_frames)
        # Ensure whole-frame multiple >= 15+18+22
        results.append({
            "scene": sc,
            "wav": wav,
            "words": words,
            "wav_dur": dur_s,
            "n_frames": total_frames,
            "dur_s": total_frames / FPS,
            "speech_offset_s": INTRO_PAD_FRAMES / FPS,
        })
    return results


def _probe_audio_duration(path: Path) -> float:
    p = subprocess.run([str(FF), "-i", str(path)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", p.stderr)
    if not m:
        raise RuntimeError(f"Could not parse duration from {path}: {p.stderr}")
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def _rounded_mask(w: int, h: int, r: int) -> Image.Image:
    # Supersampled 2x mask for crisp anti-aliased rounded viewport corners
    m = Image.new("L", (w * 2, h * 2), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), radius=r * 2, fill=255)
    return m.resize((w, h), Image.Resampling.LANCZOS)


def _studio_bg(chapter: str, idx: int, total: int, badge_rgba: Image.Image) -> Image.Image:
    # Dark obsidian/walnut canvas (#14110E) with soft radial warm glow
    y_grid, x_grid = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (x_grid - W * 0.5) / (W * 0.55)
    dy = (y_grid - H * 0.45) / (H * 0.65)
    rad = np.clip(1.0 - np.sqrt(dx * dx + dy * dy), 0.0, 1.0) ** 1.7
    r = np.clip(20.0 + 18.0 * rad, 0, 255).astype(np.uint8)
    g = np.clip(17.0 + 13.0 * rad, 0, 255).astype(np.uint8)
    b = np.clip(14.0 + 8.0 * rad, 0, 255).astype(np.uint8)
    bg = Image.fromarray(np.stack([r, g, b], axis=-1), mode="RGB").convert("RGBA")

    # Subtle soft drop shadow under the 1488x837 UI window centered at (216, 86) leaving bottom margin clear for captions
    win_x, win_y, win_w, win_h = 216, 86, 1488, 837
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle((win_x - 4, win_y + 10, win_x + win_w + 4, win_y + win_h + 26), radius=24, fill=(0, 0, 0, 175))
    sh = sh.filter(ImageFilter.GaussianBlur(radius=22))
    bg = Image.alpha_composite(bg, sh)

    # Top-left official ISABI mark (white/warm gold, 44x44) + subtle chapter badge top-right
    mark_sz = 44
    mark = badge_rgba.resize((mark_sz, mark_sz), Image.Resampling.LANCZOS)
    mark_sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    alpha = mark.getchannel("A")
    black_mark = Image.merge("RGBA", (Image.new("L", (mark_sz, mark_sz), 0), Image.new("L", (mark_sz, mark_sz), 0), Image.new("L", (mark_sz, mark_sz), 0), alpha.point(lambda p: int(p * 0.55))))
    mark_sh.paste(black_mark, (56, 32), black_mark)
    mark_sh = mark_sh.filter(ImageFilter.GaussianBlur(radius=6))
    bg = Image.alpha_composite(bg, mark_sh)
    bg.paste(mark, (54, 29), mark)

    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    try:
        f_ch = ImageFont.truetype(str(FONTS / "Archivo-SemiBold.ttf"), 17)
        f_tag = ImageFont.truetype(str(FONTS / "InstrumentSans-SemiBold.ttf"), 16)
    except Exception:
        f_ch = ImageFont.load_default()
        f_tag = ImageFont.load_default()

    # Left word label beside logo
    od.text((112, 41), "ISABI SYSTEMS", fill=(250, 246, 238, 225), font=f_tag)

    # Chapter pill aligned with right edge of viewport window
    bb = od.textbbox((0, 0), chapter, font=f_ch)
    tw = bb[2] - bb[0]
    pw = tw + 36
    px0 = win_x + win_w - pw
    py0 = 33
    od.rounded_rectangle((px0, py0, px0 + pw, py0 + 36), radius=18, fill=(38, 30, 23, 225), outline=(217, 165, 74, 110), width=1)
    od.text((px0 + 18, py0 + 8), chapter, fill=(238, 210, 146, 248), font=f_ch)

    bg = Image.alpha_composite(bg, ov)
    return bg.convert("RGB")


def _kb_crop_frame(plate_rgb: Image.Image, out_w: int, out_h: int, progress: float, kb_from: tuple[float, float, float], kb_to: tuple[float, float, float]) -> Image.Image:
    # Smooth S-curve easing for calm broadcast motion
    u = 0.5 - 0.5 * math.cos(math.pi * progress)
    px = kb_from[0] + (kb_to[0] - kb_from[0]) * u
    py = kb_from[1] + (kb_to[1] - kb_from[1]) * u
    zoom = kb_from[2] + (kb_to[2] - kb_from[2]) * u

    src_w, src_h = plate_rgb.size
    win_w = src_w / zoom
    win_h = src_h / zoom
    cx = src_w * (0.5 + px)
    cy = src_h * (0.5 + py)
    # Clamp within plate boundaries strictly
    cx = max(win_w * 0.5, min(src_w - win_w * 0.5, cx))
    cy = max(win_h * 0.5, min(src_h - win_h * 0.5, cy))
    x0 = cx - win_w * 0.5
    y0 = cy - win_h * 0.5

    # Sub-pixel float bicubic affine matrix mapping output (ox, oy) -> source (sx, sy)
    sx_scale = win_w / out_w
    sy_scale = win_h / out_h
    matrix = (sx_scale, 0.0, x0, 0.0, sy_scale, y0)
    return plate_rgb.transform((out_w, out_h), Image.Transform.AFFINE, matrix, resample=Image.Resampling.BICUBIC)


def _end_card_frame(logo_rgba: Image.Image, progress: float) -> Image.Image:
    y_grid, x_grid = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (x_grid - W * 0.5) / (W * 0.50)
    dy = (y_grid - H * 0.40) / (H * 0.55)
    rad = np.clip(1.0 - np.sqrt(dx * dx + dy * dy), 0.0, 1.0) ** 1.6
    r = np.clip(18.0 + 28.0 * rad, 0, 255).astype(np.uint8)
    g = np.clip(15.0 + 21.0 * rad, 0, 255).astype(np.uint8)
    b = np.clip(12.0 + 13.0 * rad, 0, 255).astype(np.uint8)
    bg = Image.fromarray(np.stack([r, g, b], axis=-1), mode="RGB").convert("RGBA")

    # Gentle eased scale push-in (1.00 -> 1.035) on logo lockup
    u = 0.5 - 0.5 * math.cos(math.pi * progress)
    sc = 1.0 + 0.032 * u
    lw = int(round(560 * sc))
    lh = int(round(logo_rgba.height * (lw / logo_rgba.width)))
    logo_scaled = logo_rgba.resize((lw, lh), Image.Resampling.LANCZOS)

    lx = (W - lw) // 2
    ly = 112 - (lh - 260) // 2
    bg.paste(logo_scaled, (lx, ly), logo_scaled)

    d = ImageDraw.Draw(bg)
    f_h1 = ImageFont.truetype(str(FONTS / "Archivo-Bold.ttf"), 52)
    f_sub = ImageFont.truetype(str(FONTS / "InstrumentSans-Medium.ttf"), 28)
    f_pill = ImageFont.truetype(str(FONTS / "Archivo-SemiBold.ttf"), 24)
    f_foot = ImageFont.truetype(str(FONTS / "InstrumentSans-Medium.ttf"), 23)

    h1 = "Built around how your business runs."
    bb1 = d.textbbox((0, 0), h1, font=f_h1)
    d.text(((W - (bb1[2] - bb1[0])) // 2, 396), h1, fill=(250, 246, 238, 255), font=f_h1)

    sub = "Dedicated company books  |  Balanced ledgers  |  Full data ownership"
    bb2 = d.textbbox((0, 0), sub, font=f_sub)
    d.text(((W - (bb2[2] - bb2[0])) // 2, 472), sub, fill=(214, 202, 184, 240), font=f_sub)

    cta_txt = "Live in 14 Days  |  From $3,000 Setup + $50/seat/mo"
    bb3 = d.textbbox((0, 0), cta_txt, font=f_pill)
    pw = (bb3[2] - bb3[0]) + 68
    px0 = (W - pw) // 2
    py0 = 544
    d.rounded_rectangle((px0, py0, px0 + pw, py0 + 60), radius=30, fill=(44, 34, 24, 235), outline=(217, 165, 74, 185), width=2)
    d.text((px0 + 34, py0 + 16), cta_txt, fill=(242, 205, 128, 255), font=f_pill)

    foot = "isabisystems.com    |    +961 70 444 955    |    hbdeir@isabisystems.com"
    bb4 = d.textbbox((0, 0), foot, font=f_foot)
    d.text(((W - (bb4[2] - bb4[0])) // 2, 642), foot, fill=(224, 215, 200, 235), font=f_foot)

    return bg.convert("RGB")


def _fmt_ass_time(sec: float) -> str:
    cs = max(0, int(round(sec * 100)))
    h = cs // 360000
    cs %= 360000
    m = cs // 6000
    cs %= 6000
    s = cs // 100
    c = cs % 100
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def _write_scene_ass(ass_path: Path, item: dict) -> None:
    sc = item["scene"]
    words = item["words"]
    off = item["speech_offset_s"]
    dur = item["dur_s"]
    fade_end = max(0.5, dur - (DISSOLVE / FPS) - 0.15)

    # K = 1.22 for Instrument Sans Medium: visual 31px -> 38 ASS, clean clear lower margin MarginV=24
    cap_fs = int(round(31 * K_INSTRUMENT))

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Instrument Sans Medium,{cap_fs},&H00FAF6EE,&H00E8C276,&H0014110E,&HCC14110E,0,0,0,0,100,100,0.4,0,3,8,0,2,180,180,26,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    # Chunk words cleanly into balanced ~9-word subtitle groups aligned to WordBoundary timings
    chunks = []
    cur = []
    char_cnt = 0
    for w in words:
        tok = w["token"]
        if cur and (len(cur) >= 10 or char_cnt + len(tok) + 1 > 62):
            chunks.append(cur)
            cur = []
            char_cnt = 0
        cur.append(w)
        char_cnt += len(tok) + 1
    if cur:
        chunks.append(cur)

    lines = []
    for idx, ch in enumerate(chunks):
        t0 = max(0.0, off + ch[0]["start"] - 0.04)
        nxt_start = off + chunks[idx + 1][0]["start"] - 0.02 if idx + 1 < len(chunks) else min(fade_end, off + ch[-1]["end"] + 0.35)
        t1 = min(fade_end, max(t0 + 0.30, nxt_start))
        if t1 <= t0:
            continue
        # Quantise cue timestamps cleanly to whole video frames
        q0 = math.floor(t0 * FPS) / FPS
        q1 = min(fade_end, math.ceil(t1 * FPS) / FPS)
        txt = " ".join(x["token"] for x in ch)
        # Split long single cue across two clean lines near middle
        if len(txt) > 38:
            mid = len(ch) // 2
            txt = " ".join(x["token"] for x in ch[:mid]) + r"\N" + " ".join(x["token"] for x in ch[mid:])
        lines.append(f"Dialogue: 0,{_fmt_ass_time(q0)},{_fmt_ass_time(q1)},Cap,,0,0,0,,{{\\fad(90,90)}}{txt}")

    ass_path.write_text(header + "\n".join(lines) + "\n", encoding="utf-8-sig")


def _file_sha256(p: Path) -> str:
    h = hashlib.sha256()
    if p.is_file():
        h.update(p.read_bytes())
    return h.hexdigest()[:16]


def _render_scene_clip(item: dict, total_scenes: int, badge_rgba: Image.Image, logo_rgba: Image.Image) -> tuple[Path, list[float]]:
    sc = item["scene"]
    sid = sc["id"]
    n_frames = item["n_frames"]

    plate_digest = _file_sha256(PLATES / sc["plate"]) if sc["plate"] else "end-card"
    asset_digest = _file_sha256(ASSETS / ("isabi-logo-dark-trans-1600.png" if sc["layout"] == "end" else "isabi-mark-dark-512.png"))
    font_digests = [_file_sha256(FONTS / f) for f in ("Archivo-Bold.ttf", "Archivo-SemiBold.ttf", "InstrumentSans-Medium.ttf", "InstrumentSans-SemiBold.ttf")]
    spec_blob = json.dumps({
        "ver": "1.0.4",
        "scene": sc,
        "n_frames": n_frames,
        "words": item["words"],
        "plate_sha": plate_digest,
        "asset_sha": asset_digest,
        "font_shas": font_digests,
    }, sort_keys=True)
    clip_hash = hashlib.sha256(spec_blob.encode("utf-8")).hexdigest()[:12]
    clip_path = WORK / "clips" / f"scene_{sid:02d}_{clip_hash}.mp4"
    clip_path.parent.mkdir(parents=True, exist_ok=True)
    if clip_path.is_file() and clip_path.stat().st_size > 10000:
        return clip_path, []

    win_x, win_y, win_w, win_h = 216, 86, 1488, 837
    log_path = WORK / f"scene_{sid:02d}.ffmpeg.log"
    cmd = [
        str(FF), "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo", "-s", f"{W}x{H}", "-pix_fmt", "rgb24", "-r", str(FPS), "-i", "pipe:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-pix_fmt", "yuv420p",
        str(clip_path)
    ]

    rough_deltas = []
    prev_arr = None
    with open(log_path, "w", encoding="utf-8", errors="replace") as lf:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=lf)
        try:
            if sc["layout"] == "studio":
                plate = Image.open(PLATES / sc["plate"]).convert("RGB")
                base_bg = _studio_bg(sc["chapter"], sid, total_scenes, badge_rgba)
                mask = _rounded_mask(win_w, win_h, 16)
                rim = Image.new("RGBA", (win_w, win_h), (0, 0, 0, 0))
                ImageDraw.Draw(rim).rounded_rectangle((0, 0, win_w - 1, win_h - 1), radius=16, outline=(217, 165, 74, 92), width=2)

                for fi in range(n_frames):
                    prog = fi / max(1, n_frames - 1)
                    cropped = _kb_crop_frame(plate, win_w, win_h, prog, sc["kb_from"], sc["kb_to"])
                    frame = base_bg.copy()
                    frame.paste(cropped, (win_x, win_y), mask)
                    # Subtle gold bezel highlight
                    win_patch = frame.crop((win_x, win_y, win_x + win_w, win_y + win_h)).convert("RGBA")
                    win_patch = Image.alpha_composite(win_patch, rim).convert("RGB")
                    frame.paste(win_patch, (win_x, win_y))
                    if sid == 1:
                        arr = np.asarray(cropped, dtype=np.int16)
                        if prev_arr is not None:
                            rough_deltas.append(float(np.mean(np.abs(arr - prev_arr))))
                        prev_arr = arr
                    proc.stdin.write(frame.tobytes())
            else:
                # End card gentle motion
                end_cache_key = None
                for fi in range(n_frames):
                    prog = fi / max(1, n_frames - 1)
                    frame = _end_card_frame(logo_rgba, prog)
                    proc.stdin.write(frame.tobytes())
            proc.stdin.close()
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
            raise
        rc = proc.wait()
        if rc != 0:
            raise RuntimeError(f"Scene {sid} ffmpeg failed ({rc}):\n" + log_path.read_text("utf-8", errors="replace")[-1200:])

    return clip_path, rough_deltas


def _synthesise_ambient_score(total_s: float, speech_intervals: list[tuple[float, float]]) -> Path:
    sr = 48000
    n = int(math.ceil(total_s * sr))
    t = np.arange(n, dtype=np.float64) / sr

    # Warm D major / F# minor harmonic pad progression (D3-A3, G2-D3, B2-F#3, A2-E3) every 4.5s
    chords = [
        (146.83, 220.00, 293.66, 369.99),  # D major 9
        (98.00, 146.83, 246.94, 329.63),   # G major 6
        (123.47, 185.00, 293.66, 440.00),  # Bm7
        (110.00, 164.81, 277.18, 329.63),  # A major
    ]
    bar_s = 4.5
    pad = np.zeros(n, dtype=np.float64)
    for bi in range(int(math.ceil(total_s / bar_s))):
        t0 = bi * bar_s
        t1 = min(total_s, (bi + 1) * bar_s)
        i0, i1 = int(t0 * sr), min(n, int(t1 * sr))
        if i1 <= i0:
            continue
        seg_t = t[i0:i1] - t0
        chord = chords[bi % len(chords)]
        seg_len = i1 - i0
        env = np.ones(seg_len, dtype=np.float64)
        att = min(int(0.45 * sr), seg_len // 2)
        rel = min(int(0.65 * sr), seg_len // 2)
        if att > 0:
            env[:att] = 0.5 - 0.5 * np.cos(np.pi * np.arange(att) / att)
        if rel > 0:
            env[-rel:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(rel) / rel)

        sig = np.zeros(seg_len, dtype=np.float64)
        for fi, freq in enumerate(chord):
            amp = [0.36, 0.28, 0.18, 0.12][fi]
            sig += amp * np.sin(2.0 * np.pi * freq * seg_t + 0.2 * fi)
            # Soft second-harmonic shimmer
            sig += (amp * 0.22) * np.sin(2.0 * np.pi * (freq * 2.0) * seg_t + 0.5) * np.exp(-0.22 * seg_t)
        # Gentle felt chime pulse at beat 0 & 2.25s
        for pulse_off in (0.0, 2.25):
            if pulse_off < (t1 - t0):
                pt = np.maximum(0.0, seg_t - pulse_off)
                mask = (seg_t >= pulse_off).astype(np.float64)
                sig += 0.24 * mask * np.sin(2.0 * np.pi * chord[2] * pt) * np.exp(-2.8 * pt)
        pad[i0:i1] += sig * env

    # True delay-line stereo widener (14 ms right offset padded cleanly with zeros, NEVER np.roll wrap!)
    delay = int(0.014 * sr)
    left = pad
    right = np.concatenate([np.zeros(delay, dtype=np.float64), pad[:-delay]]) if delay < n else pad.copy()

    # Smooth ducking envelope under voice (~0.30 during speech, ~0.62 in breath/end)
    duck_target = np.full(n, 0.62, dtype=np.float64)
    fade_samp = int(0.32 * sr)
    for s0, s1 in speech_intervals:
        a = max(0, int((s0 - 0.12) * sr))
        b = min(n, int((s1 + 0.15) * sr))
        duck_target[a:b] = 0.26
    # Fast exponential smoothing of duck envelope
    k_sm = fade_samp
    kernel = np.hanning(max(3, k_sm // 4))
    kernel /= kernel.sum()
    duck = np.convolve(duck_target, kernel, mode="same")

    # Fade-in 0.8s, fade-out 2.5s
    fi_n = min(int(0.8 * sr), n // 4)
    fo_n = min(int(2.5 * sr), n // 4)
    if fi_n > 0:
        duck[:fi_n] *= np.linspace(0.0, 1.0, fi_n)
    if fo_n > 0:
        duck[-fo_n:] *= np.linspace(1.0, 0.0, fo_n)

    stereo = np.stack([left * duck * 0.20, right * duck * 0.20], axis=-1)
    pcm = np.clip(np.round(stereo * 32767.0), -32768, 32767).astype(np.int16)

    raw_score = WORK / "score_raw.pcm"
    wav_score = WORK / "score.wav"
    raw_score.write_bytes(pcm.tobytes())
    _run([
        str(FF), "-y", "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", str(raw_score),
        "-af", "lowpass=f=6800,highpass=f=55",
        "-c:a", "pcm_s16le", str(wav_score)
    ])
    return wav_score


def _mix_and_master_audio(scene_items: list[dict], timeline: list[dict], total_s: float) -> Path:
    sr = 48000
    n_tot = int(round(total_s * sr))
    voice_bus = np.zeros(n_tot, dtype=np.float64)
    speech_intervals = []

    for item, tl in zip(scene_items, timeline):
        wav_pcm = WORK / f"scene_{item['scene']['id']:02d}_norm.pcm"
        _run([str(FF), "-y", "-i", str(item["wav"]), "-ar", "48000", "-ac", "1", "-f", "s16le", str(wav_pcm)])
        samples = np.frombuffer(wav_pcm.read_bytes(), dtype=np.int16).astype(np.float64) / 32768.0
        # Place at scene_start + INTRO_PAD_FRAMES/FPS
        start_s = tl["start_s"] + item["speech_offset_s"]
        i0 = int(round(start_s * sr))
        i1 = min(n_tot, i0 + len(samples))
        if i1 > i0:
            voice_bus[i0:i1] += samples[: i1 - i0]
        speech_intervals.append((start_s, start_s + len(samples) / sr))

    score_wav = _synthesise_ambient_score(total_s, speech_intervals)
    score_pcm = WORK / "score_read.pcm"
    _run([str(FF), "-y", "-i", str(score_wav), "-ar", "48000", "-ac", "2", "-f", "s16le", str(score_pcm)])
    score_lr = np.frombuffer(score_pcm.read_bytes(), dtype=np.int16).reshape(-1, 2).astype(np.float64) / 32768.0
    if len(score_lr) < n_tot:
        pad = np.zeros((n_tot - len(score_lr), 2), dtype=np.float64)
        score_lr = np.vstack([score_lr, pad])
    else:
        score_lr = score_lr[:n_tot]

    mix = np.stack([voice_bus, voice_bus], axis=-1) + score_lr
    # Peak normalise premaster safely to -1.2 dBFS (0.87) so loudnorm pass has zero clipping
    pk = float(np.max(np.abs(mix)))
    if pk > 0:
        mix *= 0.87 / pk

    premaster_pcm = WORK / "premaster.pcm"
    premaster_wav = WORK / "premaster.wav"
    premaster_pcm.write_bytes(np.clip(np.round(mix * 32767.0), -32768, 32767).astype(np.int16).tobytes())
    _run([str(FF), "-y", "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", str(premaster_pcm), str(premaster_wav)])

    # Two-pass loudnorm to -16 LUFS / -2.0 dBTP (headroom keeps 128 kbps AAC <= -1.5 dBTP)
    p1 = _run([
        str(FF), "-y", "-i", str(premaster_wav),
        "-af", "loudnorm=I=-16:TP=-2.0:LRA=7:print_format=json",
        "-f", "null", "NUL"
    ])
    m = re.search(r"\{\s*\"input_i\"[\s\S]*?\}", p1.stderr)
    if not m:
        raise RuntimeError(f"loudnorm pass 1 did not emit JSON:\n{p1.stderr}")
    st = json.loads(m.group(0))

    master_wav = WORK / "master_audio.wav"
    af2 = (
        f"loudnorm=I=-16:TP=-2.0:LRA=7:linear=true:"
        f"measured_I={st['input_i']}:measured_TP={st['input_tp']}:"
        f"measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:"
        f"offset={st['target_offset']}"
    )
    _run([str(FF), "-y", "-i", str(premaster_wav), "-af", af2, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(master_wav)])
    return master_wav


def _concat_xfade_video(clips: list[Path], scene_items: list[dict]) -> tuple[Path, list[dict]]:
    diss_s = DISSOLVE / FPS
    timeline = []
    cur_start = 0.0
    for idx, item in enumerate(scene_items):
        timeline.append({
            "id": item["scene"]["id"],
            "chapter": item["scene"]["chapter"],
            "start_s": round(cur_start, 4),
            "dur_s": round(item["dur_s"], 4),
        })
        cur_start += item["dur_s"] - (diss_s if idx + 1 < len(scene_items) else 0.0)

    inputs = []
    for c in clips:
        inputs += ["-i", str(c)]

    filter_parts = []
    prev_lbl = "[0:v]"
    offset = 0.0
    for idx in range(len(clips) - 1):
        offset += scene_items[idx]["dur_s"] - diss_s
        # Quantise xfade offset precisely to whole frames
        q_off = round(round(offset * FPS) / FPS, 4)
        out_lbl = f"[v{idx + 1}]" if idx + 1 < len(clips) - 1 else "[vout]"
        filter_parts.append(f"{prev_lbl}[{idx + 1}:v]xfade=transition=fade:duration={diss_s:.4f}:offset={q_off:.4f}{out_lbl}")
        prev_lbl = out_lbl

    video_only = WORK / "video_xfade.mp4"
    _run([
        str(FF), "-y",
        *inputs,
        "-filter_complex", ";".join(filter_parts),
        "-map", "[vout]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(FPS),
        str(video_only)
    ], log_path=WORK / "xfade.ffmpeg.log")
    return video_only, timeline


def _fmt_vtt_time(sec: float) -> str:
    ms = max(0, int(round(sec * 1000)))
    h = ms // 3600000
    ms %= 3600000
    m = ms // 60000
    ms %= 60000
    s = ms // 1000
    r = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d}.{r:03d}"


def _fmt_srt_time(sec: float) -> str:
    return _fmt_vtt_time(sec).replace(".", ",")


def _write_subtitles_and_docs(scene_items: list[dict], timeline: list[dict]) -> None:
    srt_cues = []
    vtt_en_cues = []
    vtt_ar_cues = []
    vtt_fr_cues = []
    narration_lines = []
    cue_no = 1

    for item, tl in zip(scene_items, timeline):
        sc = item["scene"]
        words = item["words"]
        s0_base = tl["start_s"] + item["speech_offset_s"]
        speech_end = tl["start_s"] + item["dur_s"] - (DISSOLVE / FPS)

        narration_lines.append(f"Scene {sc['id']:02d} ({sc['chapter']}): {sc['en']}")

        # Chunk English words into 1-2 balanced cues matching exact global timeline
        chunks = []
        cur = []
        cc = 0
        for w in words:
            if cur and (len(cur) >= 11 or cc + len(w["token"]) + 1 > 68):
                chunks.append(cur)
                cur = []
                cc = 0
            cur.append(w)
            cc += len(w["token"]) + 1
        if cur:
            chunks.append(cur)

        # Compute non-overlapping cue windows strictly inside [start_s, speech_end]
        raw_t0 = [max(tl["start_s"], s0_base + ch[0]["start"] - 0.025) for ch in chunks]
        for ci, ch in enumerate(chunks):
            t0 = raw_t0[ci]
            if ci + 1 < len(chunks):
                t1 = min(speech_end, max(t0 + 0.12, raw_t0[ci + 1] - 0.005))
            else:
                t1 = min(speech_end, max(t0 + 0.35, s0_base + ch[-1]["end"] + 0.35))
            if t1 <= t0:
                t1 = t0 + 0.10
            txt = " ".join(x["token"] for x in ch)
            srt_cues.append(f"{cue_no}\n{_fmt_srt_time(t0)} --> {_fmt_srt_time(t1)}\n{txt}\n")
            vtt_en_cues.append(f"{_fmt_vtt_time(t0)} --> {_fmt_vtt_time(t1)}\n{txt}\n")
            cue_no += 1

        # Whole-scene aligned AR & FR WebVTT tracks (clean sentence display with U+200F RTL mark for AR)
        seg_t0 = max(tl["start_s"], s0_base)
        seg_t1 = min(speech_end, s0_base + item["wav_dur"] + 0.30)
        ar_txt = sc["ar"]
        vtt_ar_cues.append(f"{_fmt_vtt_time(seg_t0)} --> {_fmt_vtt_time(seg_t1)}\n\u200F{ar_txt}\n")
        vtt_fr_cues.append(f"{_fmt_vtt_time(seg_t0)} --> {_fmt_vtt_time(seg_t1)}\n{sc['fr']}\n")

    (OUT_ROOT / "English_Subtitles.srt").write_text("\n".join(srt_cues), encoding="utf-8")
    (OUT_ROOT / "isabi-tour-en.vtt").write_text("WEBVTT\n\n" + "\n".join(vtt_en_cues), encoding="utf-8")
    (OUT_ROOT / "isabi-tour-ar.vtt").write_text("WEBVTT\n\n" + "\n".join(vtt_ar_cues), encoding="utf-8")
    (OUT_ROOT / "isabi-tour-fr.vtt").write_text("WEBVTT\n\n" + "\n".join(vtt_fr_cues), encoding="utf-8")
    (OUT_ROOT / "Narration_English.txt").write_text("\n".join(narration_lines) + "\n", encoding="utf-8")


def _build_poster(ISABI_WT_DIR: Path) -> None:
    # Build Light-Mode warm ivory 1920x1080 poster so video preview matches Showcase before play
    bg = Image.new("RGB", (W, H), (251, 248, 242))
    d = ImageDraw.Draw(bg)
    plate = Image.open(PLATES / "shot_01.png").convert("RGB")
    win_w, win_h = 1480, 832
    win_x, win_y = (W - win_w) // 2, 168
    scaled = plate.resize((win_w, win_h), Image.Resampling.LANCZOS)

    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((win_x - 4, win_y + 10, win_x + win_w + 4, win_y + win_h + 26), radius=24, fill=(40, 29, 21, 55))
    sh = sh.filter(ImageFilter.GaussianBlur(radius=20))
    comp = Image.alpha_composite(bg.convert("RGBA"), sh)
    comp.paste(scaled, (win_x, win_y), _rounded_mask(win_w, win_h, 18))

    cd = ImageDraw.Draw(comp)
    cd.rounded_rectangle((win_x, win_y, win_x + win_w - 1, win_y + win_h - 1), radius=18, outline=(217, 207, 188, 255), width=3)

    f_ey = ImageFont.truetype(str(FONTS / "Archivo-SemiBold.ttf"), 20)
    f_h = ImageFont.truetype(str(FONTS / "Archivo-Bold.ttf"), 44)
    ey = "90-SECOND PRODUCT WALKTHROUGH  |  ISABI COMMAND CENTER"
    bb_e = cd.textbbox((0, 0), ey, font=f_ey)
    cd.text(((W - (bb_e[2] - bb_e[0])) // 2, 46), ey, fill=(122, 82, 16, 255), font=f_ey)

    ttl = "Operations, Double-Entry Books, Dashboards & Field Kiosks"
    bb_h = cd.textbbox((0, 0), ttl, font=f_h)
    cd.text(((W - (bb_h[2] - bb_h[0])) // 2, 84), ttl, fill=(40, 29, 21, 255), font=f_h)

    # Play medallion centered over poster frame
    cx, cy = W // 2, win_y + win_h // 2
    cd.ellipse((cx - 56, cy - 56, cx + 56, cy + 56), fill=(40, 29, 21, 228), outline=(217, 165, 74, 240), width=3)
    cd.polygon([(cx - 16, cy - 24), (cx - 16, cy + 24), (cx + 26, cy)], fill=(250, 246, 238, 255))

    comp.convert("RGB").save(ISABI_WT_DIR / "isabi-tour-poster.jpg", quality=92, optimize=True)


def _build_contact_sheet(master_mp4: Path, timeline: list[dict], scene_items: list[dict]) -> Path:
    REV.mkdir(parents=True, exist_ok=True)
    thumbs = []
    f_lbl = ImageFont.truetype(str(FONTS / "Archivo-SemiBold.ttf"), 22)
    for tl, item in zip(timeline, scene_items):
        sid = item["scene"]["id"]
        # Pick scene midpoint frame index explicitly (never near dissolve boundary)
        diss_pad = DISSOLVE / FPS if sid < len(scene_items) else 0.0
        mid_t = tl["start_s"] + (item["dur_s"] - diss_pad) * 0.52
        tfile = REV / f"thumb_{sid:02d}.jpg"
        _run([
            str(FF), "-y", "-ss", f"{mid_t:.3f}", "-i", str(master_mp4),
            "-frames:v", "1", "-vf", "scale=640:360", str(tfile)
        ])
        im = Image.open(tfile).convert("RGB")
        dr = ImageDraw.Draw(im)
        dr.rectangle((0, 0, 640, 36), fill=(20, 17, 14))
        dr.text((14, 7), item["scene"]["chapter"], fill=(242, 205, 128), font=f_lbl)
        thumbs.append(im)

    cols, rows = 4, 2
    grid = Image.new("RGB", (640 * cols, 360 * rows), (20, 17, 14))
    for i, im in enumerate(thumbs):
        r, c = divmod(i, cols)
        grid.paste(im, (c * 640, r * 360))
    cs_path = REV / "contact_sheet.jpg"
    grid.save(cs_path, quality=92, optimize=True)
    return cs_path


def _write_readme(master_mp4: Path, share_mp4: Path, total_s: float) -> None:
    mb_m = master_mp4.stat().st_size / (1024 * 1024)
    mb_s = share_mp4.stat().st_size / (1024 * 1024)
    readme = f"""# ISABI Systems Tour v1

Built from scratch as v1 following the School_Bus_Safety_v5 production pipeline.

## Specifications
- Resolution and frame rate: 1920x1080 at 25 fps (captured from 3840x2160 demo UI plates)
- Duration: {total_s:.2f} seconds across 8 scenes (15-frame whole-frame dissolves)
- Audio: {VOICE} (rate {VOICE_RATE}), original stereo ambient bed, two-pass mastered to -16.0 LUFS / -2.0 dBTP premaster ceiling
- Subtitles: subtitle-free web MP4 + toggleable English, Arabic, and French WebVTT tracks; standalone English-captioned social MP4
- Files:
  - ISABI_Systems_Tour_v1_1080p.mp4 ({mb_m:.2f} MiB)
  - ISABI_Systems_Tour_v1_1080p_share.mp4 ({mb_s:.2f} MiB)
  - ISABI_Systems_Tour_v1_1080p_EN_captioned.mp4
  - English_Subtitles.srt, isabi-tour-en.vtt, isabi-tour-ar.vtt, isabi-tour-fr.vtt
  - Narration_English.txt, review/contact_sheet.jpg, review/QA.json

## Rebuild and Verify Commands
1. Refresh 4K demo plates: `node build/tour_video/capture_plates.mjs`
2. Build video, subtitles, poster, and contact sheet: `python build/tour_video/build_tour_v1.py`
3. Verify decodes, loudness, motion, and text parity: `python build/tour_video/verify_tour_v1.py`

## Dated Pricing and Operational Claims (Re-check before reuse)
- Onboarding tier referenced on Scene 8: 14-day deployment, from $3,000 setup and $50 per seat monthly (verified November 2026).
- All figures, customers, suppliers, and transaction vouchers in the captured Command Center screens belong exclusively to the public Demo Sandbox with synthetic names and figures.

## Engineering Notes
- Motion uses sub-pixel float bicubic affine transforms in Pillow piped raw into standalone ffmpeg with stderr redirected to per-scene log files.
- Typography scales ASS line-box sizes using verified font metrics (Archivo K={K_ARCHIVO}, Instrument Sans K={K_INSTRUMENT}) and static instantiated TTF weights.
"""
    (OUT_ROOT / "README.md").write_text(readme, encoding="utf-8")


async def main() -> None:
    t_start = time.time()
    WORK.mkdir(parents=True, exist_ok=True)
    badge_rgba = Image.open(ASSETS / "isabi-mark-dark-512.png").convert("RGBA")
    logo_rgba = Image.open(ASSETS / "isabi-logo-dark-trans-1600.png").convert("RGBA")

    scene_items = await generate_all_voice()
    clips = []
    scene1_roughness = []
    for item in scene_items:
        cpath, rough = _render_scene_clip(item, len(scene_items), badge_rgba, logo_rgba)
        clips.append(cpath)
        if rough:
            scene1_roughness = rough

    video_xfade, timeline = _concat_xfade_video(clips, scene_items)
    diss_total = (len(scene_items) - 1) * (DISSOLVE / FPS)
    total_s = sum(x["dur_s"] for x in scene_items) - diss_total

    master_wav = _mix_and_master_audio(scene_items, timeline, total_s)

    master_mp4 = OUT_ROOT / "ISABI_Systems_Tour_v1_1080p.mp4"
    share_mp4 = OUT_ROOT / "ISABI_Systems_Tour_v1_1080p_share.mp4"

    _run([
        str(FF), "-y", "-i", str(video_xfade), "-i", str(master_wav),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest",
        str(master_mp4)
    ], log_path=WORK / "mux_master.ffmpeg.log")

    _run([
        str(FF), "-y", "-i", str(video_xfade), "-i", str(master_wav),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-maxrate", "1350k", "-bufsize", "2700k", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest",
        str(share_mp4)
    ], log_path=WORK / "mux_share.ffmpeg.log")

    _write_subtitles_and_docs(scene_items, timeline)

    # Also write clean non-overlapping global ASS for the standalone social-share captioned cut
    full_ass = WORK / "English_Subtitles.ass"
    cap_fs = int(round(31 * K_INSTRUMENT))
    ass_hdr = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Instrument Sans Medium,{cap_fs},&H00FAF6EE,&H00E8C276,&H0014110E,&HCC14110E,0,0,0,0,100,100,0.4,0,3,8,0,2,180,180,26,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ass_ev = []
    vtt_raw_blocks = (OUT_ROOT / "isabi-tour-en.vtt").read_text("utf-8").split("\n\n")
    for block in vtt_raw_blocks:
        b_lines = [x.strip() for x in block.splitlines() if x.strip()]
        if len(b_lines) >= 2 and "-->" in b_lines[0]:
            ts_a, ts_b = [x.strip() for x in b_lines[0].split("-->")]
            p_sec = lambda s: int(s[0:2]) * 3600 + int(s[3:5]) * 60 + float(s[6:])
            t0s, t1s = p_sec(ts_a), p_sec(ts_b)
            txt = " ".join(b_lines[1:])
            if len(txt) > 38:
                ws = txt.split()
                txt = " ".join(ws[:len(ws) // 2]) + r"\N" + " ".join(ws[len(ws) // 2:])
            ass_ev.append(f"Dialogue: 0,{_fmt_ass_time(t0s)},{_fmt_ass_time(t1s)},Cap,,0,0,0,,{{\\fad(80,80)}}{txt}")
    full_ass.write_text(ass_hdr + "\n".join(ass_ev) + "\n", encoding="utf-8-sig")

    social_cap_mp4 = OUT_ROOT / "ISABI_Systems_Tour_v1_1080p_EN_captioned.mp4"
    ass_esc = str(full_ass).replace("\\", "/").replace(":", "\\:")
    fnt_esc = str(FONTS).replace("\\", "/").replace(":", "\\:")
    _run([
        str(FF), "-y", "-i", str(video_xfade), "-i", str(master_wav),
        "-map", "0:v:0", "-map", "1:a:0",
        "-vf", f"ass='{ass_esc}':fontsdir='{fnt_esc}'",
        "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-maxrate", "1350k", "-bufsize", "2700k", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest",
        str(social_cap_mp4)
    ], log_path=WORK / "mux_captioned.ffmpeg.log")

    _build_poster(ISABI_WT)
    cs_path = _build_contact_sheet(master_mp4, timeline, scene_items)
    _write_readme(master_mp4, share_mp4, total_s)

    # Stage web-served copies into worktree root + copy contact sheet to artifact dir
    shutil.copy2(share_mp4, ISABI_WT / "isabi-tour.mp4")
    for lang in ("en", "ar", "fr"):
        shutil.copy2(OUT_ROOT / f"isabi-tour-{lang}.vtt", ISABI_WT / f"isabi-tour-{lang}.vtt")

    art_dir = Path(r"C:\Users\hbdei\.gemini\antigravity\brain\1eec7159-88d2-40a8-9d47-be39c102c6c2")
    if art_dir.is_dir():
        shutil.copy2(cs_path, art_dir / "contact_sheet.jpg")

    mean_rough = (sum(scene1_roughness) / len(scene1_roughness)) if scene1_roughness else 0.0
    (WORK / "build_meta.json").write_text(json.dumps({
        "total_s": round(total_s, 3),
        "timeline": timeline,
        "scene1_mean_pixel_delta": round(mean_rough, 4),
        "elapsed_s": round(time.time() - t_start, 2)
    }, indent=2), encoding="utf-8")
    print(f"BUILT ISABI_Systems_Tour_v1 OK ({total_s:.2f}s) | master={master_mp4.stat().st_size} B | share={share_mp4.stat().st_size} B | delta={mean_rough:.3f}")


if __name__ == "__main__":
    asyncio.run(main())
