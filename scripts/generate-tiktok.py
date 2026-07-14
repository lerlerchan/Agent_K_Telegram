#!/usr/bin/env python3
"""TikTok video generator: Substack outputs/ post -> Blueprint slides + voiceover -> MP4.

Per PRD 2026-07-09. Scans $VAULT_PATH/outputs/*.md for `tiktok-ready: true`
(not published), builds 7 Blueprint-style slides, TTS voiceover, FFmpeg MP4
into TikTokQueue/. Marks source note tiktok_queued: true. Never sets published.

Usage: python3 generate-tiktok.py [--dry-run]
"""
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

# cron ships a bare env — pull keys from the known .env files
for _envf in ("/home/lerler/github/Agent_K_Telegram/.env", "/home/lerler/TikTokPipeline/.env"):
    if os.path.exists(_envf):
        for _line in open(_envf):
            if "=" in _line and not _line.lstrip().startswith("#"):
                k, _, v = _line.strip().partition("=")
                os.environ.setdefault(k, v)

VAULT = Path(os.environ.get("VAULT_PATH", "/home/lerler/ObsidianVault"))
OUTPUTS = VAULT / "outputs"
QUEUE = VAULT / "TikTokQueue"
LOG_FILE = Path("/home/lerler/github/Agent_K_Telegram/logs/tiktok-pipeline.log")
TMP = Path("/tmp/tiktok_slides")

W, H = 1080, 1920
BG = (10, 22, 40)
CYAN = (0, 180, 216)
WHITE = (255, 255, 255)
GREY = (120, 140, 160)
ACCENT = (255, 200, 50)
GRID_COL = (20, 40, 65)
FONT_DIR_LIB = "/usr/share/fonts/truetype/liberation"   # PRD said liberation2; K45VD has liberation
FONT_MONO_B = f"{FONT_DIR_LIB}/LiberationMono-Bold.ttf"
FONT_SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_SANS_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

SLIDE_DURATIONS = [3, 3.5, 5, 5, 5, 5, 6]  # PRD section 5 — hook/problem shortened, 3.4s avg watch = drop-off before payoff


def log(msg: str) -> None:
    line = f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line)
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


# ── Step 0: find eligible post ──────────────────────────────────────────
FM_RE = re.compile(r"\A---\s*\n(.*?)\n---", re.S)


def frontmatter(text: str) -> dict:
    m = FM_RE.match(text)
    if not m:
        return {}
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith((" ", "-", "\t")):
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip().strip("'\"")
    return fm


def find_post() -> Path | None:
    eligible = []
    for p in sorted(OUTPUTS.glob("*.md")):
        fm = frontmatter(p.read_text(encoding="utf-8", errors="replace"))
        # PRD §1 "next unprocessed post": skip already-queued ones awaiting review
        if (fm.get("tiktok-ready") == "true" and fm.get("published") != "true"
                and fm.get("tiktok_queued") != "true"):
            # optional tiktok_order overrides date order (series rotation control)
            order = int(fm.get("tiktok_order", 9999))
            eligible.append(((order, fm.get("date", p.stem[:10])), p))
    return min(eligible)[1] if eligible else None


def slug_of(p: Path) -> str:
    return re.sub(r"^\d{4}-\d{2}-\d{2}-", "", p.stem)


# ── Step 1+2: LLM extraction + voiceover script (one call) ─────────────
EXTRACT_PROMPT = """You turn a tech blog post into a 7-slide TikTok video plan.
Output ONLY valid JSON, no markdown fences:
{
  "hook": "post title rephrased as provocative statement, max 10 words",
  "problem_bullets": ["3-4 short pain-point facts"],
  "methods": [{"name": "...", "desc": "one line", "stat": "key stat/command"}],  // exactly 3
  "total_methods": <int, how many methods the full post covers>,
  "voiceover": ["seg1 ~10 words", "seg2 ~8 words", "seg3 ~10 words",
                "seg4 ~10 words", "seg5 ~10 words", "seg6 ~10 words", "seg7 ~12 words"]
}
Voiceover pacing ~130 wpm; segment N must fit slide N durations [5,4,5,5,5,5,6]s
with 0.5s margin. Segment 7 must end: "Full breakdown on lertechnotes. Link in bio."
"""


def llm_extract(body: str) -> dict:
    import requests
    if os.environ.get("OPENROUTER_API_KEY"):
        base, key = "https://openrouter.ai/api/v1", os.environ["OPENROUTER_API_KEY"]
        model = os.environ.get("TIKTOK_LLM_MODEL", "anthropic/claude-haiku-4.5")
    else:  # ponytail: DeepSeek fallback — only key on this box; swap when OpenRouter key lands
        base, key = "https://api.deepseek.com/v1", os.environ["DEEPSEEK_API_KEY"]
        model = "deepseek-chat"
    r = requests.post(f"{base}/chat/completions",
                      headers={"Authorization": f"Bearer {key}"},
                      json={"model": model, "temperature": 0.6, "max_tokens": 900,
                            "messages": [{"role": "system", "content": EXTRACT_PROMPT},
                                         {"role": "user", "content": body[:8000]}]},
                      timeout=120)
    r.raise_for_status()
    text = r.json()["choices"][0]["message"]["content"].strip()
    text = text.removeprefix("```json").removesuffix("```").strip()
    return json.loads(text)


# ── Step 3: TTS chain ───────────────────────────────────────────────────
def tts(text: str, out_mp3: str) -> str:
    for name, key_env, base in [("openrouter", "OPENROUTER_API_KEY", "https://openrouter.ai/api/v1"),
                                ("openai", "OPENAI_API_KEY", None)]:
        if not os.environ.get(key_env):
            continue
        try:
            import openai
            client = openai.OpenAI(api_key=os.environ[key_env], base_url=base)
            resp = client.audio.speech.create(model="tts-1", voice="nova",
                                              input=text, speed=1.05)
            resp.stream_to_file(out_mp3)
            return name
        except Exception as e:
            log(f"TTS via {name} failed ({e}), trying next")
    # ponytail: free fallback so cron never blocks; female voice ~ nova
    subprocess.run([sys.executable, "-m", "edge_tts", "--voice", "en-US-AriaNeural",
                    "--rate", "+5%", "--text", text, "--write-media", out_mp3], check=True)
    return "edge-tts"


def audio_duration(path: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


# ── Step 3.5: word-level captions (faster-whisper + burned-in ASS) ──────
# ponytail: reuse the faster-whisper install already set up in the sibling
# TikTokPipeline venv instead of a second pip install / model download
WHISPER_VENV_PY = "/home/lerler/TikTokPipeline/venv/bin/python3"
_WHISPER_WORKER = """
import sys, json
from faster_whisper import WhisperModel
model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
segments, _ = model.transcribe(sys.argv[1], word_timestamps=True)
words = [{"w": w.word.strip(), "start": w.start, "end": w.end}
         for seg in segments for w in seg.words]
print(json.dumps(words))
"""


def transcribe_words(audio_path: str) -> list[dict]:
    """Word-level timestamps for the TTS output, via faster-whisper. [] on any failure."""
    try:
        out = subprocess.run([WHISPER_VENV_PY, "-c", _WHISPER_WORKER, audio_path],
                             capture_output=True, text=True, timeout=60, check=True)
        return json.loads(out.stdout.strip().splitlines()[-1])
    except Exception as e:
        log(f"Caption transcription failed ({e}) — shipping without burned-in captions")
        return []


def _rgb_to_ass_style(rgb: tuple) -> str:
    r, g, b = rgb
    return f"&H00{b:02X}{g:02X}{r:02X}"  # Style line fields: &HAABBGGRR


def _rgb_to_ass_inline(rgb: tuple) -> str:
    r, g, b = rgb
    return f"&H{b:02X}{g:02X}{r:02X}&"  # \c override tags: &HBBGGRR&


def build_ass(words: list[dict], out_path: Path, group_size: int = 3) -> bool:
    """Karaoke-style caption track: current word highlighted in ACCENT, rest in WHITE."""
    if not words:
        return False
    base, active = _rgb_to_ass_inline(WHITE), _rgb_to_ass_inline(ACCENT)
    header = f"""[Script Info]
PlayResX: {W}
PlayResY: {H}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Caption,DejaVu Sans,58,{_rgb_to_ass_style(WHITE)},&H00000000,&H80000000,1,1,3,0,2,60,60,220

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    def ts(t: float) -> str:
        h, rem = divmod(max(0.0, t), 3600)
        m, s = divmod(rem, 60)
        return f"{int(h)}:{int(m):02d}:{s:05.2f}"

    lines = [header]
    for i in range(0, len(words), group_size):
        group = words[i:i + group_size]
        for j, active_word in enumerate(group):
            parts = []
            for k, w in enumerate(group):
                color = active if k == j else base
                parts.append(f"{{\\c{color}}}{w['w']}{{\\r}}")
            text = " ".join(parts)
            lines.append(f"Dialogue: 0,{ts(active_word['start'])},{ts(active_word['end'])},Caption,,0,0,0,,{text}\n")
    out_path.write_text("".join(lines))
    return True


# ── Step 4: Blueprint slides ────────────────────────────────────────────
def _base_slide(draw_mod, img_mod):
    img = img_mod.new("RGB", (W, H), BG)
    d = draw_mod.Draw(img)
    for x in range(0, W, 60):
        d.line([(x, 0), (x, H)], fill=GRID_COL, width=1)
    for y in range(0, H, 60):
        d.line([(0, y), (W, y)], fill=GRID_COL, width=1)
    return img, d


def _wrap(d, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if d.textlength(t, font=font) <= max_w:
            cur = t
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def make_slides(plan: dict, out_dir: Path) -> list[Path]:
    from PIL import Image, ImageDraw, ImageFont
    out_dir.mkdir(parents=True, exist_ok=True)
    f_label = ImageFont.truetype(FONT_MONO_B, 40)
    f_title = ImageFont.truetype(FONT_SANS_B, 88)
    f_body = ImageFont.truetype(FONT_SANS, 52)
    f_stat = ImageFont.truetype(FONT_MONO, 46)
    f_small = ImageFont.truetype(FONT_MONO, 30)
    f_pill = ImageFont.truetype(FONT_MONO_B, 36)

    def chrome(d, label, footer):
        if plan.get("series"):
            d.text((60, 50), plan["series"], font=f_small, fill=ACCENT)
        d.text((W - 60, 50), "lertechnotes", font=f_small, fill=GREY, anchor="ra")
        d.rectangle([60, 300, W - 60, 306], fill=CYAN)
        d.text((60, 230), label.upper(), font=f_label, fill=CYAN)
        d.text((60, H - 90), footer, font=f_small, fill=GREY)

    def pill(d, x, y, text):
        w = d.textlength(text, font=f_pill) + 48
        d.rounded_rectangle([x, y, x + w, y + 60], radius=12, fill=CYAN)
        d.text((x + 24, y + 12), text, font=f_pill, fill=BG)
        return y + 60

    def title_block(d, y, text, fill=WHITE, font=None):
        font = font or f_title
        for line in _wrap(d, text, font, W - 120):
            d.text((60, y), line, font=font, fill=fill)
            y += font.size + 14
        return y

    def body_block(d, y, lines, bullet=True, fill=WHITE, font=None):
        font = font or f_body
        for item in lines:
            prefix = "· " if bullet else ""
            for k, line in enumerate(_wrap(d, prefix + item, font, W - 140)):
                d.text((80, y), line, font=font, fill=fill)
                y += font.size + 12
            y += 18
        return y

    paths = []
    methods = plan["methods"][:3]

    specs = [
        ("hook", "the secret below"),
        ("the problem", "keep scrolling"),
        ("", "1 of 3"),   # pill already says METHOD 1
        ("", "2 of 3"),
        ("", "3 of 3"),
        ("stack them", "almost there"),
        ("do this now", "link in bio"),
    ]
    for idx, (label, footer) in enumerate(specs, 1):
        img, d = _base_slide(ImageDraw, Image)
        chrome(d, label, footer)
        y = 420
        if idx == 1:
            y = title_block(d, y, plan["hook"])
            d.text((60, y + 40), "the secret below ↓", font=f_body, fill=ACCENT)
        elif idx == 2:
            y = title_block(d, y, "Why it hurts", font=f_title)
            body_block(d, y + 40, plan["problem_bullets"][:4])
        elif idx in (3, 4, 5):
            m = methods[idx - 3]
            y = pill(d, 60, y, f"METHOD {idx - 2}") + 50
            y = title_block(d, y, m["name"])
            y = body_block(d, y + 30, [m["desc"]], bullet=False)
            d.text((80, y + 20), m["stat"], font=f_stat, fill=ACCENT)
        elif idx == 6:
            y = title_block(d, y, "Stack all of them")
            body_block(d, y + 40, [f'{m["name"]} — {m["stat"]}' for m in methods])
        else:
            y = title_block(d, y, f'{plan.get("total_methods", 3)} methods total.')
            y = body_block(d, y + 40, ["Full post on lertechnotes", "→ link in bio"], bullet=False, fill=CYAN)
        p = out_dir / f"slide_{idx:02d}.png"
        img.save(p)
        paths.append(p)
    return paths


# ── Step 5: FFmpeg ──────────────────────────────────────────────────────
def assemble(slides: list[Path], audio: str, out_path: Path, ass_path: Path | None = None) -> None:
    aud = audio_duration(audio)
    total = sum(SLIDE_DURATIONS)
    # scale slide durations to actual audio length so -shortest never clips the CTA
    factor = max(1.0, (aud + 0.3) / total)
    fps = 30
    # ponytail: per-slide Ken Burns via zoompan — static hold reads as dead air on TikTok,
    # a slow zoom keeps every frame visibly "alive" even with no other animation budget
    clip_paths = []
    for i, (p, dur) in enumerate(zip(slides, SLIDE_DURATIONS)):
        d = dur * factor
        n_frames = max(1, int(d * fps))
        clip = TMP / f"clip_{i:02d}.mp4"
        subprocess.run([
            "ffmpeg", "-y", "-loop", "1", "-i", str(p), "-t", f"{d:.2f}",
            "-vf", f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
                   f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=#0a1628,"
                   f"zoompan=z='min(zoom+0.0015,1.08)':d={n_frames}:s={W}x{H}:fps={fps}",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
            str(clip),
        ], check=True, capture_output=True)
        clip_paths.append(clip)
    concat = TMP / "concat.txt"
    concat.write_text("\n".join(f"file '{c}'" for c in clip_paths) + "\n")
    if ass_path and ass_path.exists():
        # burning captions requires re-encoding the video stream (can't -c:v copy)
        escaped = str(ass_path).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
            "-i", audio, "-vf", f"ass='{escaped}'",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-map", "0:v:0", "-map", "1:a:0",
            "-shortest", "-movflags", "+faststart", str(out_path),
        ]
    else:
        cmd = [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat),
            "-i", audio,
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-map", "0:v:0", "-map", "1:a:0",
            "-shortest", "-movflags", "+faststart", str(out_path),
        ]
    subprocess.run(cmd, check=True, capture_output=True)


# ── Step 7: frontmatter update ──────────────────────────────────────────
def update_frontmatter(note_path: Path, updates: dict) -> None:
    text = note_path.read_text(encoding="utf-8")
    for key, value in updates.items():
        pattern = rf"^{re.escape(key)}:.*$"
        if re.search(pattern, text, flags=re.M):
            text = re.sub(pattern, f"{key}: {value}", text, flags=re.M)
        else:
            text = text.replace("\n---\n", f"\n{key}: {value}\n---\n", 1)
    note_path.write_text(text, encoding="utf-8")


# ── main ────────────────────────────────────────────────────────────────
def main() -> int:
    dry = "--dry-run" in sys.argv
    log(f"Scanning outputs/ for eligible posts...{' (dry-run)' if dry else ''}")
    post = find_post()
    if post is None:
        log("No eligible post found. Done.")
        return 0
    log(f"Found: {post.name}")
    slug = slug_of(post)
    today = datetime.date.today().isoformat()
    out_mp4 = QUEUE / f"{slug}-{today}.mp4"

    if dry:
        log(f"Would: LLM-extract plan, TTS voiceover, 7 slides, ffmpeg -> {out_mp4}")
        log(f"Would: set tiktok_queued: true in {post.name}")
        log("Done (dry-run).")
        return 0

    body = post.read_text(encoding="utf-8", errors="replace")
    plan = llm_extract(body)
    plan["series"] = frontmatter(body).get("tiktok_series", "")
    n_words = sum(len(s.split()) for s in plan["voiceover"])
    log(f"Voiceover script written ({n_words} words)")

    TMP.mkdir(parents=True, exist_ok=True)
    voice_mp3 = str(TMP / "tiktok_voice.mp3")
    engine = tts(" ".join(plan["voiceover"]), voice_mp3)
    log(f"TTS generated via {engine}: {voice_mp3} ({audio_duration(voice_mp3):.1f}s)")

    words = transcribe_words(voice_mp3)
    ass_path = TMP / "captions.ass"
    has_captions = build_ass(words, ass_path)
    log(f"Captions: {len(words)} words transcribed" if has_captions else "Captions: skipped")

    slides = make_slides(plan, TMP)
    log(f"Slides generated: {len(slides)} PNGs")

    QUEUE.mkdir(parents=True, exist_ok=True)
    assemble(slides, voice_mp3, out_mp4, ass_path if has_captions else None)
    size = out_mp4.stat().st_size
    assert size > 0, "output mp4 empty"
    log(f"Video written: TikTokQueue/{out_mp4.name} ({size // 1024}KB)")

    update_frontmatter(post, {"tiktok_queued": "true", "tiktok_queued_date": today})
    log("Frontmatter updated: tiktok_queued: true")
    log("Done.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log(f"ERROR: {e}")
        sys.exit(1)
