# build/tour_video/build_whatsapp_reels_v1.py
# Builds 4 pilot 9:16 WhatsApp vertical reels (Ready-Mix & Resorts, EN & AR, ~30s each, 1080x1920 @ 25fps, -16 LUFS)
from __future__ import annotations

import os
import sys
from pathlib import Path as _Path

sys.path = [str(_Path.home() / ".theo" / "tools" / "py312-video")] + sys.path

import asyncio
import hashlib
import json
import math
import re
import shutil
import subprocess
import time
from pathlib import Path

import edge_tts
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

_ff_default = Path.home() / ".theo" / "tools" / "bin" / "ffmpeg.exe"
FF = _ff_default if _ff_default.exists() else Path(shutil.which("ffmpeg") or str(_ff_default))
ROOT = Path(__file__).resolve().parent
ISABI_WT = ROOT.parent.parent
OUT_ROOT = ISABI_WT / "exports" / "ISABI_WhatsApp_Reels_v1"
PLATES = OUT_ROOT / "plates"
ASSETS = OUT_ROOT / "assets"
FONTS = ASSETS / "fonts"
WORK = OUT_ROOT / "build" / "work"
REV = OUT_ROOT / "review"

W, H, FPS = 1080, 1920, 25
DISSOLVE = 12
INTRO_PAD_FRAMES = 14
OUTRO_PAD_FRAMES = 22
MIN_UI_FRAMES = 165   # 6.6s
MIN_END_FRAMES = 145  # 5.8s
RENDER_VERSION = "1.0.0"

# Measured font line-box ratios
K_ARCHIVO = 1.088
K_INSTRUMENT = 1.22
K_DUBAI = 1.69

VOICE_CFG = {
    "en": {"voice": "en-US-AndrewMultilingualNeural", "rate": "+4%", "pitch": "+0Hz"},
    "ar": {"voice": "ar-LB-RamiNeural", "rate": "+6%", "pitch": "+0Hz"},
}

REELS = [
    {
        "slug": "readymix_en",
        "industry": "Ready-Mix & Manufacturing",
        "lang": "en",
        "title": "ISABI Ready-Mix & Quarries (English)",
        "end_h1": "Built for Ready-Mix & Quarries.",
        "end_sub": "Dedicated books  |  Live profit  |  Full ownership",
        "end_cta": "Live in 14 Days  |  From $3,000 Setup",
        "scenes": [
            {
                "id": 1,
                "chapter": "01  READY-MIX & QUARRIES",
                "plate": "readymix_en_shot_01.png",
                "layout": "studio",
                "kb_from": (0.0, -0.055, 1.00),
                "kb_to": (0.0, 0.025, 1.042),
                "text": "Still chasing ready-mix tickets, quarry prices, and diesel bills across spreadsheets and WhatsApp?",
            },
            {
                "id": 2,
                "chapter": "02  QUARRY & HAULAGE RATES",
                "plate": "readymix_en_shot_02.png",
                "layout": "studio",
                "kb_from": (0.0, 0.020, 1.040),
                "kb_to": (0.0, -0.040, 1.005),
                "text": "ISABI prices every truck load automatically from signed quarry and haulage rate sheets, with zero manual re-entry.",
            },
            {
                "id": 3,
                "chapter": "03  FLEET & LIVE PROFIT",
                "plate": "readymix_en_shot_03.png",
                "layout": "studio",
                "kb_from": (0.0, -0.045, 1.005),
                "kb_to": (0.0, 0.030, 1.045),
                "text": "See real profit per cubic metre, truck maintenance costs, and customer balances live on your phone.",
            },
            {
                "id": 4,
                "chapter": "04  LIVE IN 14 DAYS",
                "plate": None,
                "layout": "end",
                "kb_from": (0.0, 0.0, 1.0),
                "kb_to": (0.0, 0.0, 1.0),
                "text": "Go live in fourteen days with zero disruption to your plant. Reply here or visit isabisystems.com.",
            },
        ],
    },
    {
        "slug": "readymix_ar",
        "industry": "Ready-Mix & Manufacturing",
        "lang": "ar",
        "title": "ISABI Ready-Mix & Quarries (Lebanese Arabic)",
        "end_h1": "مصمّم لشركات الخرسانة والكسارات.",
        "end_sub": "دفاتر متوازنة  |  ربحية فورية  |  ملكية كاملة للبيانات",
        "end_cta": "انطلق خلال ١٤ يوماً  |  ابتداءً من 3,000 دولار",
        "scenes": [
            {
                "id": 1,
                "chapter": "الخرسانة والكسارات",
                "plate": "readymix_ar_shot_01.png",
                "layout": "studio",
                "kb_from": (0.0, -0.055, 1.00),
                "kb_to": (0.0, 0.025, 1.042),
                "text": "هل ما زلت تلاحق تذاكر الباطون وأسعار الكسارات وفواتير المازوت بين الجداول والواتساب؟",
            },
            {
                "id": 2,
                "chapter": "التذاكر وأسعار الكسارات",
                "plate": "readymix_ar_shot_02.png",
                "layout": "studio",
                "kb_from": (0.0, 0.020, 1.040),
                "kb_to": (0.0, -0.040, 1.005),
                "text": "إيسابي يسعّر كل نقلة تلقائياً وفق اتفاقيات الكسارات والنقل، ويحفظ حسابات الزبائن لحظياً.",
            },
            {
                "id": 3,
                "chapter": "الأسطول والربح الحقيقي",
                "plate": "readymix_ar_shot_03.png",
                "layout": "studio",
                "kb_from": (0.0, -0.045, 1.005),
                "kb_to": (0.0, 0.030, 1.045),
                "text": "راقب ربح كل متر مكعب، ومصروف كل شاحنة، والذمم المستحقة مباشرة من هاتفك.",
            },
            {
                "id": 4,
                "chapter": "انطلاق خلال ١٤ يوماً",
                "plate": None,
                "layout": "end",
                "kb_from": (0.0, 0.0, 1.0),
                "kb_to": (0.0, 0.0, 1.0),
                "text": "انطلق خلال أربعة عشر يوماً من دون إرباك عمل المصنع. راسلنا هنا أو زر موقعنا.",
            },
        ],
    },
    {
        "slug": "resorts_en",
        "industry": "Resorts & Hospitality",
        "lang": "en",
        "title": "ISABI Resorts & Beach Clubs (English)",
        "end_h1": "Built for Resorts & Beach Clubs.",
        "end_sub": "Dedicated books  |  Live profit  |  Full ownership",
        "end_cta": "Live in 14 Days  |  From $3,000 Setup",
        "scenes": [
            {
                "id": 1,
                "chapter": "01  RESORTS & BEACH CLUBS",
                "plate": "resorts_en_shot_01.png",
                "layout": "studio",
                "kb_from": (0.0, -0.055, 1.00),
                "kb_to": (0.0, 0.025, 1.042),
                "text": "Running a resort with disconnected gate tills, chalet sheets, and manual membership lists?",
            },
            {
                "id": 2,
                "chapter": "02  OFFLINE POS & CLOSINGS",
                "plate": "resorts_en_shot_02.png",
                "layout": "studio",
                "kb_from": (0.0, 0.020, 1.040),
                "kb_to": (0.0, -0.040, 1.005),
                "text": "ISABI keeps bar and gate tills printing even offline, closing every outlet into one daily owner view.",
            },
            {
                "id": 3,
                "chapter": "03  MEMBERSHIPS & SPLITS",
                "plate": "resorts_en_shot_03.png",
                "layout": "studio",
                "kb_from": (0.0, -0.045, 1.005),
                "kb_to": (0.0, 0.030, 1.045),
                "text": "Track season memberships, partner splits, and unpaid balances cleanly before the peak season starts.",
            },
            {
                "id": 4,
                "chapter": "04  LIVE IN 14 DAYS",
                "plate": None,
                "layout": "end",
                "kb_from": (0.0, 0.0, 1.0),
                "kb_to": (0.0, 0.0, 1.0),
                "text": "Go live in fourteen days across all your venues. Reply here or visit isabisystems.com.",
            },
        ],
    },
    {
        "slug": "resorts_ar",
        "industry": "Resorts & Hospitality",
        "lang": "ar",
        "title": "ISABI Resorts & Beach Clubs (Lebanese Arabic)",
        "end_h1": "مصمّم للمنتجعات والنوادي البحرية.",
        "end_sub": "دفاتر متوازنة  |  ربحية فورية  |  ملكية كاملة للبيانات",
        "end_cta": "انطلق خلال ١٤ يوماً  |  ابتداءً من 3,000 دولار",
        "scenes": [
            {
                "id": 1,
                "chapter": "المنتجعات والنوادي البحرية",
                "plate": "resorts_ar_shot_01.png",
                "layout": "studio",
                "kb_from": (0.0, -0.055, 1.00),
                "kb_to": (0.0, 0.025, 1.042),
                "text": "هل تدير منتجعك بصناديق منفصلة وجداول شاليهات ولوائح اشتراكات يدوية؟",
            },
            {
                "id": 2,
                "chapter": "نقاط البيع والإقفال اليومي",
                "plate": "resorts_ar_shot_02.png",
                "layout": "studio",
                "kb_from": (0.0, 0.020, 1.040),
                "kb_to": (0.0, -0.040, 1.005),
                "text": "إيسابي يبقي نقاط البيع والبوابات تعمل حتى عند انقطاع الإنترنت، ويجمع إقفال كل قسم في شاشة واحدة.",
            },
            {
                "id": 3,
                "chapter": "الاشتراكات والحسابات",
                "plate": "resorts_ar_shot_03.png",
                "layout": "studio",
                "kb_from": (0.0, -0.045, 1.005),
                "kb_to": (0.0, 0.030, 1.045),
                "text": "تابع الاشتراكات الموسمية، وحصص الشركاء، والأرصدة غير المسددة بوضوح كامل من هاتفك.",
            },
            {
                "id": 4,
                "chapter": "انطلاق خلال ١٤ يوماً",
                "plate": None,
                "layout": "end",
                "kb_from": (0.0, 0.0, 1.0),
                "kb_to": (0.0, 0.0, 1.0),
                "text": "انطلق خلال أربعة عشر يوماً في كل فروعك. راسلنا هنا أو زر موقعنا.",
            },
        ],
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


def _clean_norm(s: str) -> str:
    s = re.sub(r"[\u064B-\u065F\u0670\u0640]", "", s)
    s = s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("ة", "ه").replace("ى", "ي")
    return re.sub(r"[^\u0621-\u064A\u0660-\u0669a-z0-9]", "", s.lower())


def _align_word_events_to_tokens(tokens: list[str], events: list[dict], dur_s: float) -> list[dict]:
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
        break

    if len(out) == len(tokens) and ei == len(events):
        return out

    # Fallback: if TTS normalised a token slightly differently, map by proportional speech span
    # across remaining events so zero script words or punctuation are ever dropped.
    if not events:
        raise AssertionError("No TTS word events received")
    t_start = events[0]["start"]
    t_end = max(dur_s, events[-1]["end"])
    tot_chars = sum(max(1, len(tok)) for tok in tokens)
    mapped = []
    cur = t_start
    for idx, tok in enumerate(tokens):
        span = (t_end - t_start) * (max(1, len(tok)) / tot_chars)
        nxt = t_end if idx == len(tokens) - 1 else cur + span
        mapped.append({"token": tok, "start": round(cur, 4), "end": round(nxt, 4)})
        cur = nxt
    return mapped


async def _tts_with_retry(text: str, lang: str, mp3_path: Path, words_path: Path) -> list[dict]:
    cfg = VOICE_CFG[lang]
    last_err = None
    for attempt in range(4):
        try:
            comm = edge_tts.Communicate(text, cfg["voice"], rate=cfg["rate"], pitch=cfg["pitch"], boundary="WordBoundary")
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
            if len(audio_chunks) < 1500 or not events:
                raise RuntimeError(f"Empty TTS payload: bytes={len(audio_chunks)}, events={len(events)}")
            tokens = text.split()
            est_dur = events[-1]["end"]
            if len(events) != len(tokens):
                mapped = _align_word_events_to_tokens(tokens, events, est_dur)
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
            tmp_json.write_text(json.dumps(mapped, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp_mp3.replace(mp3_path)
            tmp_json.replace(words_path)
            return mapped
        except Exception as exc:
            last_err = exc
            await asyncio.sleep(1.0 + attempt)
    raise RuntimeError(f"TTS failed after retries for text={text!r}: {last_err}")


def _probe_audio_duration(path: Path) -> float:
    p = subprocess.run([str(FF), "-i", str(path)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", p.stderr)
    if not m:
        raise RuntimeError(f"Could not parse duration from {path}: {p.stderr}")
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


async def generate_reel_voice(reel: dict) -> list[dict]:
    vdir = WORK / "voice" / reel["slug"]
    vdir.mkdir(parents=True, exist_ok=True)
    lang = reel["lang"]
    cfg = VOICE_CFG[lang]
    results = []
    for sc in reel["scenes"]:
        text = sc["text"]
        digest = hashlib.sha256(f"{text}|{cfg['voice']}|{cfg['rate']}|{cfg['pitch']}".encode("utf-8")).hexdigest()[:16]
        mp3 = vdir / f"scene_{sc['id']:02d}_{digest}.mp3"
        wjson = vdir / f"scene_{sc['id']:02d}_{digest}.words.json"
        wav = vdir / f"scene_{sc['id']:02d}_{digest}.wav"
        if mp3.is_file() and wjson.is_file():
            words = json.loads(wjson.read_text("utf-8"))
        else:
            words = await _tts_with_retry(text, lang, mp3, wjson)
        if not wav.is_file():
            _run([str(FF), "-y", "-i", str(mp3), "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)])
        dur_s = _probe_audio_duration(wav)
        speech_end = max((w["end"] for w in words), default=dur_s)
        total_frames = INTRO_PAD_FRAMES + math.ceil(max(dur_s, speech_end) * FPS) + OUTRO_PAD_FRAMES
        min_frames = MIN_UI_FRAMES if sc["layout"] == "studio" else MIN_END_FRAMES
        total_frames = max(total_frames, min_frames)
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


def _rounded_mask(w: int, h: int, r: int) -> Image.Image:
    m = Image.new("L", (w * 2, h * 2), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), radius=r * 2, fill=255)
    return m.resize((w, h), Image.Resampling.LANCZOS)


def _studio_bg(chapter: str, lang: str, badge_rgba: Image.Image) -> Image.Image:
    y_grid, x_grid = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (x_grid - W * 0.5) / (W * 0.60)
    dy = (y_grid - H * 0.42) / (H * 0.58)
    rad = np.clip(1.0 - np.sqrt(dx * dx + dy * dy), 0.0, 1.0) ** 1.7
    r = np.clip(20.0 + 18.0 * rad, 0, 255).astype(np.uint8)
    g = np.clip(17.0 + 13.0 * rad, 0, 255).astype(np.uint8)
    b = np.clip(14.0 + 9.0 * rad, 0, 255).astype(np.uint8)
    bg = Image.fromarray(np.stack([r, g, b], axis=-1), mode="RGB").convert("RGBA")

    # Phone stage (780x1360 at 150, 172 -> bottom 1532)
    win_x, win_y, win_w, win_h = 150, 172, 780, 1360
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle((win_x - 6, win_y + 12, win_x + win_w + 6, win_y + win_h + 28), radius=36, fill=(0, 0, 0, 185))
    sh = sh.filter(ImageFilter.GaussianBlur(radius=24))
    bg = Image.alpha_composite(bg, sh)

    # Top-left ISABI mark (56x56)
    mark_sz = 56
    mark = badge_rgba.resize((mark_sz, mark_sz), Image.Resampling.LANCZOS)
    mark_sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    alpha = mark.getchannel("A")
    black_mark = Image.merge("RGBA", (
        Image.new("L", (mark_sz, mark_sz), 0),
        Image.new("L", (mark_sz, mark_sz), 0),
        Image.new("L", (mark_sz, mark_sz), 0),
        alpha.point(lambda p: int(p * 0.55)),
    ))
    mark_sh.paste(black_mark, (58, 60), black_mark)
    mark_sh = mark_sh.filter(ImageFilter.GaussianBlur(radius=6))
    bg = Image.alpha_composite(bg, mark_sh)
    bg.paste(mark, (56, 56), mark)

    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    f_ch = ImageFont.truetype(str(FONTS / "Archivo-SemiBold.ttf"), 18)
    f_tag = ImageFont.truetype(str(FONTS / "Archivo-SemiBold.ttf"), 20)
    od.text((126, 73), "ISABI SYSTEMS", fill=(250, 246, 238, 230), font=f_tag)

    # Right-aligned chapter pill (y=58..112, right edge x=1024)
    if lang == "en":
        bb = od.textbbox((0, 0), chapter, font=f_ch)
        tw = bb[2] - bb[0]
        pw = max(290, tw + 44)
        px0 = 1024 - pw
        py0 = 58
        od.rounded_rectangle((px0, py0, px0 + pw, py0 + 54), radius=27, fill=(38, 30, 23, 230), outline=(217, 165, 74, 125), width=2)
        od.text((px0 + (pw - tw) // 2, py0 + 16), chapter, fill=(238, 210, 146, 250), font=f_ch)
    else:
        # Container only; Arabic label rendered strictly by libass (Dubai Bold)
        pw = 440
        px0 = 1024 - pw
        py0 = 58
        od.rounded_rectangle((px0, py0, px0 + pw, py0 + 54), radius=27, fill=(38, 30, 23, 230), outline=(217, 165, 74, 125), width=2)

    bg = Image.alpha_composite(bg, ov)
    return bg.convert("RGB")


def _kb_crop_frame(plate_rgb: Image.Image, out_w: int, out_h: int, progress: float, kb_from: tuple[float, float, float], kb_to: tuple[float, float, float]) -> Image.Image:
    u = 0.5 - 0.5 * math.cos(math.pi * progress)
    px = kb_from[0] + (kb_to[0] - kb_from[0]) * u
    py = kb_from[1] + (kb_to[1] - kb_from[1]) * u
    zoom = kb_from[2] + (kb_to[2] - kb_from[2]) * u

    src_w, src_h = plate_rgb.size
    target_ar = out_w / out_h
    base_w = min(float(src_w), float(src_h) * target_ar)
    base_h = base_w / target_ar
    win_w = base_w / zoom
    win_h = base_h / zoom

    cx = src_w * (0.5 + px)
    cy = src_h * (0.5 + py)
    cx = max(win_w * 0.5, min(src_w - win_w * 0.5, cx))
    cy = max(win_h * 0.5, min(src_h - win_h * 0.5, cy))
    x0 = cx - win_w * 0.5
    y0 = cy - win_h * 0.5

    sx_scale = win_w / out_w
    sy_scale = win_h / out_h
    matrix = (sx_scale, 0.0, x0, 0.0, sy_scale, y0)
    return plate_rgb.transform((out_w, out_h), Image.Transform.AFFINE, matrix, resample=Image.Resampling.BICUBIC)


def _end_card_frame(reel: dict, logo_rgba: Image.Image, progress: float) -> Image.Image:
    y_grid, x_grid = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (x_grid - W * 0.5) / (W * 0.55)
    dy = (y_grid - H * 0.36) / (H * 0.52)
    rad = np.clip(1.0 - np.sqrt(dx * dx + dy * dy), 0.0, 1.0) ** 1.6
    r = np.clip(18.0 + 28.0 * rad, 0, 255).astype(np.uint8)
    g = np.clip(15.0 + 21.0 * rad, 0, 255).astype(np.uint8)
    b = np.clip(12.0 + 13.0 * rad, 0, 255).astype(np.uint8)
    bg = Image.fromarray(np.stack([r, g, b], axis=-1), mode="RGB").convert("RGBA")

    u = 0.5 - 0.5 * math.cos(math.pi * progress)
    sc = 1.0 + 0.032 * u
    lw = int(round(520 * sc))
    lh = int(round(logo_rgba.height * (lw / logo_rgba.width)))
    logo_scaled = logo_rgba.resize((lw, lh), Image.Resampling.LANCZOS)

    lx = (W - lw) // 2
    ly = 450 - lh // 2
    bg.paste(logo_scaled, (lx, ly), logo_scaled)

    d = ImageDraw.Draw(bg)
    f_h1 = ImageFont.truetype(str(FONTS / "Archivo-Bold.ttf"), 46)
    f_sub = ImageFont.truetype(str(FONTS / "InstrumentSans-Medium.ttf"), 27)
    f_pill = ImageFont.truetype(str(FONTS / "Archivo-SemiBold.ttf"), 25)
    f_foot = ImageFont.truetype(str(FONTS / "InstrumentSans-Medium.ttf"), 25)

    # Gold-bordered CTA pill container at y=950..1036
    px0, py0, pw, ph = 140, 950, 800, 86
    d.rounded_rectangle((px0, py0, px0 + pw, py0 + ph), radius=43, fill=(44, 34, 24, 235), outline=(217, 165, 74, 195), width=2)

    if reel["lang"] == "en":
        h1 = reel["end_h1"]
        bb1 = d.textbbox((0, 0), h1, font=f_h1)
        d.text(((W - (bb1[2] - bb1[0])) // 2, 690), h1, fill=(250, 246, 238, 255), font=f_h1)

        sub = reel["end_sub"]
        bb2 = d.textbbox((0, 0), sub, font=f_sub)
        d.text(((W - (bb2[2] - bb2[0])) // 2, 795), sub, fill=(214, 202, 184, 240), font=f_sub)

        cta = reel["end_cta"]
        bb3 = d.textbbox((0, 0), cta, font=f_pill)
        d.text(((W - (bb3[2] - bb3[0])) // 2, py0 + 28), cta, fill=(242, 205, 128, 255), font=f_pill)

    # Contact line (Latin-safe on both EN and AR)
    foot = "isabisystems.com    |    +961 70 444 955"
    bb4 = d.textbbox((0, 0), foot, font=f_foot)
    d.text(((W - (bb4[2] - bb4[0])) // 2, 1096), foot, fill=(224, 215, 200, 240), font=f_foot)

    return bg.convert("RGB")


def _file_sha256(p: Path) -> str:
    h = hashlib.sha256()
    if p.is_file():
        h.update(p.read_bytes())
    return h.hexdigest()[:16]


def _render_scene_clip(reel: dict, item: dict, badge_rgba: Image.Image, logo_rgba: Image.Image) -> tuple[Path, list[float]]:
    sc = item["scene"]
    sid = sc["id"]
    n_frames = item["n_frames"]
    lang = reel["lang"]

    plate_digest = _file_sha256(PLATES / sc["plate"]) if sc["plate"] else "end-card"
    asset_digest = _file_sha256(ASSETS / ("isabi-logo-dark-trans-1600.png" if sc["layout"] == "end" else "isabi-mark-dark-512.png"))
    font_digests = [_file_sha256(FONTS / f) for f in ("Archivo-Bold.ttf", "Archivo-SemiBold.ttf", "InstrumentSans-Medium.ttf", "InstrumentSans-SemiBold.ttf")]
    spec_blob = json.dumps({
        "ver": RENDER_VERSION,
        "slug": reel["slug"],
        "lang": lang,
        "scene": sc,
        "end_meta": {k: reel[k] for k in ("end_h1", "end_sub", "end_cta")} if sc["layout"] == "end" else None,
        "n_frames": n_frames,
        "plate_sha": plate_digest,
        "asset_sha": asset_digest,
        "font_shas": font_digests,
    }, ensure_ascii=False, sort_keys=True)
    clip_hash = hashlib.sha256(spec_blob.encode("utf-8")).hexdigest()[:12]
    clip_path = WORK / "clips" / f"{reel['slug']}_s{sid:02d}_{clip_hash}.mp4"
    clip_path.parent.mkdir(parents=True, exist_ok=True)
    if clip_path.is_file() and clip_path.stat().st_size > 10000:
        return clip_path, []

    win_x, win_y, win_w, win_h = 150, 172, 780, 1360
    log_path = WORK / f"{reel['slug']}_s{sid:02d}.ffmpeg.log"
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
                base_bg = _studio_bg(sc["chapter"], lang, badge_rgba)
                mask = _rounded_mask(win_w, win_h, 32)
                rim = Image.new("RGBA", (win_w, win_h), (0, 0, 0, 0))
                ImageDraw.Draw(rim).rounded_rectangle((0, 0, win_w - 1, win_h - 1), radius=32, outline=(217, 165, 74, 105), width=2)

                for fi in range(n_frames):
                    prog = fi / max(1, n_frames - 1)
                    cropped = _kb_crop_frame(plate, win_w, win_h, prog, sc["kb_from"], sc["kb_to"])
                    frame = base_bg.copy()
                    frame.paste(cropped, (win_x, win_y), mask)
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
                for fi in range(n_frames):
                    prog = fi / max(1, n_frames - 1)
                    frame = _end_card_frame(reel, logo_rgba, prog)
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
            raise RuntimeError(f"{reel['slug']} scene {sid} ffmpeg failed ({rc}):\n" + log_path.read_text("utf-8", errors="replace")[-1200:])

    return clip_path, rough_deltas


def _concat_xfade_video(slug: str, clips: list[Path], scene_items: list[dict]) -> tuple[Path, list[dict]]:
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
        q_off = round(round(offset * FPS) / FPS, 4)
        out_lbl = f"[v{idx + 1}]" if idx + 1 < len(clips) - 1 else "[vout]"
        filter_parts.append(f"{prev_lbl}[{idx + 1}:v]xfade=transition=fade:duration={diss_s:.4f}:offset={q_off:.4f}{out_lbl}")
        prev_lbl = out_lbl

    video_only = WORK / f"{slug}_video_xfade.mp4"
    _run([
        str(FF), "-y",
        *inputs,
        "-filter_complex", ";".join(filter_parts),
        "-map", "[vout]",
        "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(FPS),
        str(video_only)
    ], log_path=WORK / f"{slug}_xfade.ffmpeg.log")
    return video_only, timeline


def _synthesise_ambient_score(slug: str, total_s: float, speech_intervals: list[tuple[float, float]]) -> Path:
    sr = 48000
    n = int(math.ceil(total_s * sr))
    t = np.arange(n, dtype=np.float64) / sr

    chords = [
        (146.83, 220.00, 293.66, 369.99),  # D major 9
        (98.00, 146.83, 246.94, 329.63),   # G major 6
        (123.47, 185.00, 293.66, 440.00),  # Bm7
        (110.00, 164.81, 277.18, 329.63),  # A major
    ]
    bar_s = 4.0
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
        att = min(int(0.40 * sr), seg_len // 2)
        rel = min(int(0.55 * sr), seg_len // 2)
        if att > 0:
            env[:att] = 0.5 - 0.5 * np.cos(np.pi * np.arange(att) / att)
        if rel > 0:
            env[-rel:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(rel) / rel)

        sig = np.zeros(seg_len, dtype=np.float64)
        for fi, freq in enumerate(chord):
            amp = [0.36, 0.28, 0.18, 0.12][fi]
            sig += amp * np.sin(2.0 * np.pi * freq * seg_t + 0.2 * fi)
            sig += (amp * 0.22) * np.sin(2.0 * np.pi * (freq * 2.0) * seg_t + 0.5) * np.exp(-0.22 * seg_t)
        for pulse_off in (0.0, 2.0):
            if pulse_off < (t1 - t0):
                pt = np.maximum(0.0, seg_t - pulse_off)
                mask = (seg_t >= pulse_off).astype(np.float64)
                sig += 0.24 * mask * np.sin(2.0 * np.pi * chord[2] * pt) * np.exp(-2.8 * pt)
        pad[i0:i1] += sig * env

    delay = int(0.014 * sr)
    left = pad
    right = np.concatenate([np.zeros(delay, dtype=np.float64), pad[:-delay]]) if delay < n else pad.copy()

    duck_target = np.full(n, 0.62, dtype=np.float64)
    fade_samp = int(0.30 * sr)
    for s0, s1 in speech_intervals:
        a = max(0, int((s0 - 0.10) * sr))
        b = min(n, int((s1 + 0.14) * sr))
        duck_target[a:b] = 0.25
    kernel = np.hanning(max(3, fade_samp // 4))
    kernel /= kernel.sum()
    duck = np.convolve(duck_target, kernel, mode="same")

    fi_n = min(int(0.6 * sr), n // 4)
    fo_n = min(int(2.0 * sr), n // 4)
    if fi_n > 0:
        duck[:fi_n] *= np.linspace(0.0, 1.0, fi_n)
    if fo_n > 0:
        duck[-fo_n:] *= np.linspace(1.0, 0.0, fo_n)

    stereo = np.stack([left * duck * 0.20, right * duck * 0.20], axis=-1)
    pcm = np.clip(np.round(stereo * 32767.0), -32768, 32767).astype(np.int16)

    raw_score = WORK / f"{slug}_score_raw.pcm"
    wav_score = WORK / f"{slug}_score.wav"
    raw_score.write_bytes(pcm.tobytes())
    _run([
        str(FF), "-y", "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", str(raw_score),
        "-af", "lowpass=f=6800,highpass=f=55",
        "-c:a", "pcm_s16le", str(wav_score)
    ])
    return wav_score


def _mix_and_master_audio(slug: str, scene_items: list[dict], timeline: list[dict], total_s: float) -> Path:
    sr = 48000
    n_tot = int(round(total_s * sr))
    voice_bus = np.zeros(n_tot, dtype=np.float64)
    speech_intervals = []

    for item, tl in zip(scene_items, timeline):
        wav_pcm = WORK / f"{slug}_s{item['scene']['id']:02d}_norm.pcm"
        _run([str(FF), "-y", "-i", str(item["wav"]), "-ar", "48000", "-ac", "1", "-f", "s16le", str(wav_pcm)])
        samples = np.frombuffer(wav_pcm.read_bytes(), dtype=np.int16).astype(np.float64) / 32768.0
        start_s = tl["start_s"] + item["speech_offset_s"]
        i0 = int(round(start_s * sr))
        i1 = min(n_tot, i0 + len(samples))
        if i1 > i0:
            voice_bus[i0:i1] += samples[: i1 - i0]
        speech_intervals.append((start_s, start_s + len(samples) / sr))

    score_wav = _synthesise_ambient_score(slug, total_s, speech_intervals)
    score_pcm = WORK / f"{slug}_score_read.pcm"
    _run([str(FF), "-y", "-i", str(score_wav), "-ar", "48000", "-ac", "2", "-f", "s16le", str(score_pcm)])
    score_lr = np.frombuffer(score_pcm.read_bytes(), dtype=np.int16).reshape(-1, 2).astype(np.float64) / 32768.0
    if len(score_lr) < n_tot:
        score_lr = np.vstack([score_lr, np.zeros((n_tot - len(score_lr), 2), dtype=np.float64)])
    else:
        score_lr = score_lr[:n_tot]

    mix = np.stack([voice_bus, voice_bus], axis=-1) + score_lr
    pk = float(np.max(np.abs(mix)))
    if pk > 0:
        mix *= 0.87 / pk

    premaster_pcm = WORK / f"{slug}_premaster.pcm"
    premaster_wav = WORK / f"{slug}_premaster.wav"
    premaster_pcm.write_bytes(np.clip(np.round(mix * 32767.0), -32768, 32767).astype(np.int16).tobytes())
    _run([str(FF), "-y", "-f", "s16le", "-ar", "48000", "-ac", "2", "-i", str(premaster_pcm), str(premaster_wav)])

    p1 = _run([
        str(FF), "-y", "-i", str(premaster_wav),
        "-af", "loudnorm=I=-16:TP=-2.0:LRA=7:print_format=json",
        "-f", "null", "NUL"
    ])
    m = re.search(r"\{\s*\"input_i\"[\s\S]*?\}", p1.stderr)
    if not m:
        raise RuntimeError(f"loudnorm pass 1 did not emit JSON:\n{p1.stderr}")
    st = json.loads(m.group(0))

    master_wav = WORK / f"{slug}_master_audio.wav"
    af2 = (
        f"loudnorm=I=-16:TP=-2.0:LRA=7:linear=true:"
        f"measured_I={st['input_i']}:measured_TP={st['input_tp']}:"
        f"measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:"
        f"offset={st['target_offset']}"
    )
    _run([str(FF), "-y", "-i", str(premaster_wav), "-af", af2, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(master_wav)])
    return master_wav


def _fmt_ass_time(sec: float) -> str:
    cs = max(0, int(round(sec * 100)))
    h = cs // 360000
    cs %= 360000
    m = cs // 6000
    cs %= 6000
    s = cs // 100
    c = cs % 100
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def _fmt_srt_time(sec: float) -> str:
    ms = max(0, int(round(sec * 1000)))
    h = ms // 3600000
    ms %= 3600000
    m = ms // 60000
    ms %= 60000
    s = ms // 1000
    r = ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d},{r:03d}"


def _split_two_lines(words_list: list[str], max_line_chars: int) -> list[str]:
    joined = " ".join(words_list)
    if len(joined) <= max_line_chars or len(words_list) < 2:
        return [joined]
    best_i = len(words_list) // 2
    best_diff = 10**9
    for idx in range(1, len(words_list)):
        l1 = " ".join(words_list[:idx])
        l2 = " ".join(words_list[idx:])
        diff = abs(len(l1) - len(l2))
        if diff < best_diff:
            best_diff = diff
            best_i = idx
    return [" ".join(words_list[:best_i]), " ".join(words_list[best_i:])]


def _write_captions_and_ass(reel: dict, scene_items: list[dict], timeline: list[dict], total_s: float) -> Path:
    slug = reel["slug"]
    lang = reel["lang"]
    diss_s = DISSOLVE / FPS

    srt_cues = []
    narration_lines = []
    ass_events = []
    cue_no = 1

    max_chunk_chars = 46 if lang == "en" else 48
    max_chunk_words = 7 if lang == "en" else 7
    max_line_chars = 24 if lang == "en" else 26

    for idx_s, (item, tl) in enumerate(zip(scene_items, timeline)):
        sc = item["scene"]
        words = item["words"]
        s0_base = tl["start_s"] + item["speech_offset_s"]
        is_last = (idx_s == len(scene_items) - 1)
        speech_end = (tl["start_s"] + item["dur_s"] - 0.12) if is_last else (tl["start_s"] + item["dur_s"] - diss_s - 0.08)

        narration_lines.append(f"Scene {sc['id']:02d} ({sc['chapter']}): {sc['text']}")

        # For Arabic, emit top chapter pill label and End Card typography via libass (Dubai)
        if lang == "ar":
            if sc["layout"] == "studio":
                p0 = tl["start_s"] + (0.12 if idx_s > 0 else 0.0)
                p1 = tl["start_s"] + item["dur_s"] - diss_s
                ass_events.append(
                    f"Dialogue: 1,{_fmt_ass_time(p0)},{_fmt_ass_time(p1)},ArPill,,0,0,0,,{{\\an5\\pos(804,85)\\fad(140,140)}}\u200F{sc['chapter']}"
                )
            else:
                e0 = tl["start_s"] + 0.12
                e1 = total_s - 0.04
                ass_events.append(
                    f"Dialogue: 1,{_fmt_ass_time(e0)},{_fmt_ass_time(e1)},ArEndH1,,0,0,0,,{{\\an5\\pos(540,715)\\fad(180,0)}}\u200F{reel['end_h1']}"
                )
                ass_events.append(
                    f"Dialogue: 1,{_fmt_ass_time(e0)},{_fmt_ass_time(e1)},ArEndSub,,0,0,0,,{{\\an5\\pos(540,818)\\fad(180,0)}}\u200F{reel['end_sub']}"
                )
                ass_events.append(
                    f"Dialogue: 1,{_fmt_ass_time(e0)},{_fmt_ass_time(e1)},ArEndCta,,0,0,0,,{{\\an5\\pos(540,993)\\fad(180,0)}}\u200F{reel['end_cta']}"
                )

        chunks = []
        cur = []
        cc = 0
        for w in words:
            tok = w["token"]
            if cur and (len(cur) >= max_chunk_words or cc + len(tok) + 1 > max_chunk_chars):
                chunks.append(cur)
                cur = []
                cc = 0
            cur.append(w)
            cc += len(tok) + 1
        if cur:
            chunks.append(cur)

        raw_t0 = [max(tl["start_s"], s0_base + ch[0]["start"] - 0.03) for ch in chunks]
        prev_q_end = tl["start_s"]
        for ci, ch in enumerate(chunks):
            t0 = raw_t0[ci]
            if ci + 1 < len(chunks):
                t1 = min(speech_end, max(t0 + 0.16, raw_t0[ci + 1]))
            else:
                t1 = min(speech_end, max(t0 + 0.32, s0_base + ch[-1]["end"] + 0.30))
            if t1 <= t0:
                t1 = t0 + 0.12
            q0 = max(prev_q_end, math.floor(t0 * FPS) / FPS)
            if ci + 1 < len(chunks):
                q1 = min(speech_end, max(q0 + (2.0 / FPS), math.floor(raw_t0[ci + 1] * FPS) / FPS))
            else:
                q1 = min(speech_end, math.ceil(t1 * FPS) / FPS)
            if q1 <= q0:
                q1 = q0 + (2.0 / FPS)
            prev_q_end = q1

            toks = [x["token"] for x in ch]
            raw_joined = " ".join(toks)
            srt_cues.append(f"{cue_no}\n{_fmt_srt_time(q0)} --> {_fmt_srt_time(q1)}\n{raw_joined}\n")
            cue_no += 1

            lines = _split_two_lines(toks, max_line_chars)
            if lang == "ar":
                ass_txt = r"\N".join(f"\u200F{ln}" for ln in lines)
            else:
                ass_txt = r"\N".join(lines)
            ass_events.append(f"Dialogue: 0,{_fmt_ass_time(q0)},{_fmt_ass_time(q1)},Cap,,0,0,0,,{{\\fad(80,80)}}{ass_txt}")

    (OUT_ROOT / f"Subtitles_{slug}.srt").write_text("\n".join(srt_cues), encoding="utf-8")
    (OUT_ROOT / f"Narration_{slug}.txt").write_text("\n".join(narration_lines) + "\n", encoding="utf-8")

    if lang == "en":
        cap_fs = int(round(36 * K_INSTRUMENT))
        styles = (
            f"Style: Cap,Instrument Sans Medium,{cap_fs},&H00FAF6EE,&H00E8C276,&H0014110E,&HCC14110E,"
            "0,0,0,0,100,100,0.4,0,3,10,0,2,72,72,140,1"
        )
    else:
        cap_fs = int(round(36 * K_DUBAI))
        pill_fs = int(round(21 * K_DUBAI))
        h1_fs = int(round(46 * K_DUBAI))
        sub_fs = int(round(27 * K_DUBAI))
        cta_fs = int(round(26 * K_DUBAI))
        styles = "\n".join([
            f"Style: Cap,Dubai Medium,{cap_fs},&H00FAF6EE,&H00E8C276,&H0014110E,&HCC14110E,0,0,0,0,100,100,0,0,3,10,0,2,72,72,140,178",
            f"Style: ArPill,Dubai Bold,{pill_fs},&H0092D2EE,&H0092D2EE,&H0014110E,&H0014110E,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,178",
            f"Style: ArEndH1,Dubai Bold,{h1_fs},&H00EEF6FA,&H00EEF6FA,&H0014110E,&H0014110E,-1,0,0,0,100,100,0,0,1,0,0,5,40,40,0,178",
            f"Style: ArEndSub,Dubai Medium,{sub_fs},&H00B8CAD6,&H00B8CAD6,&H0014110E,&H0014110E,0,0,0,0,100,100,0,0,1,0,0,5,40,40,0,178",
            f"Style: ArEndCta,Dubai Bold,{cta_fs},&H0080CDF2,&H0080CDF2,&H0014110E,&H0014110E,-1,0,0,0,100,100,0,0,1,0,0,5,40,40,0,178",
        ])

    ass_hdr = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{styles}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ass_path = WORK / f"{slug}.ass"
    ass_path.write_text(ass_hdr + "\n".join(ass_events) + "\n", encoding="utf-8-sig")
    return ass_path


def _build_reel_contact_sheet(slug: str, final_mp4: Path, timeline: list[dict], scene_items: list[dict]) -> Path:
    REV.mkdir(parents=True, exist_ok=True)
    thumbs = []
    f_lbl = ImageFont.truetype(str(FONTS / "Archivo-SemiBold.ttf"), 17)
    diss_s = DISSOLVE / FPS
    for tl, item in zip(timeline, scene_items):
        sid = item["scene"]["id"]
        diss_pad = diss_s if sid < len(scene_items) else 0.0
        mid_t = tl["start_s"] + (item["dur_s"] - diss_pad) * 0.52
        tfile = REV / f"thumb_{slug}_s{sid:02d}.jpg"
        _run([
            str(FF), "-y", "-ss", f"{mid_t:.3f}", "-i", str(final_mp4),
            "-frames:v", "1", "-vf", "scale=360:640", str(tfile)
        ])
        im = Image.open(tfile).convert("RGB")
        dr = ImageDraw.Draw(im)
        dr.rectangle((0, 0, 360, 28), fill=(20, 17, 14))
        dr.text((10, 5), f"{slug.upper()} · SCENE {sid}", fill=(242, 205, 128), font=f_lbl)
        thumbs.append(im)

    grid = Image.new("RGB", (360 * len(thumbs), 640), (20, 17, 14))
    for i, im in enumerate(thumbs):
        grid.paste(im, (i * 360, 0))
    cs_path = REV / f"contact_sheet_{slug}.jpg"
    grid.save(cs_path, quality=92, optimize=True)
    return cs_path


async def build_one_reel(reel: dict, badge_rgba: Image.Image, logo_rgba: Image.Image) -> dict:
    slug = reel["slug"]
    scene_items = await generate_reel_voice(reel)
    clips = []
    roughness = []
    for item in scene_items:
        cpath, rough = _render_scene_clip(reel, item, badge_rgba, logo_rgba)
        clips.append(cpath)
        if rough:
            roughness = rough

    video_xfade, timeline = _concat_xfade_video(slug, clips, scene_items)
    diss_total = (len(scene_items) - 1) * (DISSOLVE / FPS)
    total_s = sum(x["dur_s"] for x in scene_items) - diss_total

    master_wav = _mix_and_master_audio(slug, scene_items, timeline, total_s)
    ass_path = _write_captions_and_ass(reel, scene_items, timeline, total_s)

    out_mp4 = OUT_ROOT / f"ISABI_WhatsApp_{slug}_v1.mp4"
    ass_esc = str(ass_path).replace("\\", "/").replace(":", "\\:")
    fnt_esc = str(FONTS).replace("\\", "/").replace(":", "\\:")

    _run([
        str(FF), "-y", "-i", str(video_xfade), "-i", str(master_wav),
        "-map", "0:v:0", "-map", "1:a:0",
        "-vf", f"ass='{ass_esc}':fontsdir='{fnt_esc}'",
        "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-maxrate", "1200k", "-bufsize", "2400k", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest",
        str(out_mp4)
    ], log_path=WORK / f"{slug}_mux.ffmpeg.log")

    cs_path = _build_reel_contact_sheet(slug, out_mp4, timeline, scene_items)
    mean_rough = (sum(roughness) / len(roughness)) if roughness else 0.0
    print(f"BUILT {out_mp4.name} | dur={total_s:.2f}s | bytes={out_mp4.stat().st_size} | delta={mean_rough:.3f}")
    return {
        "slug": slug,
        "title": reel["title"],
        "industry": reel["industry"],
        "lang": reel["lang"],
        "mp4": str(out_mp4),
        "bytes": out_mp4.stat().st_size,
        "duration_s": round(total_s, 3),
        "timeline": timeline,
        "scene1_mean_pixel_delta": round(mean_rough, 4),
        "contact_sheet": str(cs_path),
    }


def _write_readme(results: list[dict]) -> None:
    lines = [
        "# ISABI WhatsApp Vertical Reels v1 (Pilot)",
        "",
        "Built from scratch as v1 following the Video.md pipeline (1080x1920 vertical 9:16 mobile portrait capture, sub-pixel Ken Burns motion, libass-rendered Arabic and English typography, two-pass -16.0 LUFS mastering).",
        "",
        "## Output Files",
    ]
    for r in results:
        mb = r["bytes"] / (1024 * 1024)
        p = Path(r["mp4"]).name
        lines.append(f"- `{p}` ({mb:.2f} MiB, {r['duration_s']:.2f} s) — {r['title']}")
    lines.extend([
        "",
        "## Rebuild and Verify Commands",
        "1. Capture 12 mobile portrait plates (390x844 @3x): `node build/tour_video/capture_whatsapp_plates.mjs`",
        "2. Render all 4 WhatsApp reels, subtitles, and contact sheets: `python build/tour_video/build_whatsapp_reels_v1.py`",
        "3. Verify decodes, loudness, motion, and text hygiene: `python build/tour_video/verify_whatsapp_reels_v1.py`",
        "",
        "## Dated Claims and Notes (Re-check before reuse)",
        "- Onboarding tier shown on End Card: Live in 14 Days, from $3,000 setup (verified November 2026).",
        "- All captured screens come strictly from Demo Sandbox with synthetic entities and figures.",
    ])
    # Ensure zero em-dashes in README per deliverables-read-as-human-prepared rule
    txt = "\n".join(lines).replace("—", "-").replace("→", "->") + "\n"
    (OUT_ROOT / "README.md").write_text(txt, encoding="utf-8")


async def main() -> None:
    t0 = time.time()
    WORK.mkdir(parents=True, exist_ok=True)
    REV.mkdir(parents=True, exist_ok=True)
    badge_rgba = Image.open(ASSETS / "isabi-mark-dark-512.png").convert("RGBA")
    logo_rgba = Image.open(ASSETS / "isabi-logo-dark-trans-1600.png").convert("RGBA")

    results = []
    for reel in REELS:
        res = await build_one_reel(reel, badge_rgba, logo_rgba)
        results.append(res)

    # Combine all 4 per-reel 4x1 sheets into one 4x4 review sheet (1440x2560)
    combined = Image.new("RGB", (1440, 640 * len(results)), (20, 17, 14))
    for i, r in enumerate(results):
        with Image.open(r["contact_sheet"]) as im:
            combined.paste(im.convert("RGB"), (0, i * 640))
    comb_path = REV / "contact_sheet_all_4_reels.jpg"
    combined.save(comb_path, quality=92, optimize=True)

    art_env = os.environ.get("REELS_CONTACT_SHEET_DIR", "").strip()
    art_dir = Path(art_env) if art_env else None
    if art_dir and art_dir.is_dir():
        shutil.copy2(comb_path, art_dir / "whatsapp_reels_contact_sheet.jpg")

    _write_readme(results)
    meta = {"elapsed_s": round(time.time() - t0, 2), "reels": results}
    (WORK / "build_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"ALL 4 WHATSAPP REELS BUILT OK in {meta['elapsed_s']}s")


if __name__ == "__main__":
    asyncio.run(main())
