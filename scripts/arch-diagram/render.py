#!/usr/bin/env python3
"""Render diagram.html to an mp4 by stepping CSS animations frame-by-frame.

Deterministic: pauses every animation, then sets currentTime per frame via the
Web Animations API — no reliance on wall-clock timing, so the output is
reproducible and never drops/duplicates a frame.

Workflow (narration drives the timing — don't guess speech durations, edge-tts
runs ~105 wpm and guessing produced overlapping lines):

  1. Edit the LINES copy in add_voice.py, then run it. It synthesises each line,
     measures the real audio, lays the lines out back-to-back, and PRINTS the
     animation-delay values the layers/arrows should use.
  2. Paste those delays into diagram.html, set DURATION below to the suggested
     value, and run this script.
  3. Mux:
       ffmpeg -y -i pipeline_arch.mp4 -i voiceover.mp3 -c:v copy -c:a aac \
         -b:a 160k -map 0:v:0 -map 1:a:0 -shortest -movflags +faststart out.mp4

Silent version? Just run this script and skip steps 1 and 3.
Needs: playwright (chromium installed), edge-tts, ffmpeg.
"""
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
FRAMES = HERE / "frames"
W, H, FPS, DURATION = 1080, 1920, 30, 24.7
HOLD_LAST = 1.6  # freeze on the finished diagram before the clip ends


def main() -> None:
    FRAMES.mkdir(exist_ok=True)
    for old in FRAMES.glob("*.png"):
        old.unlink()

    n_anim = int((DURATION - HOLD_LAST) * FPS)
    n_total = int(DURATION * FPS)

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H})
        page.goto(f"file://{HERE / 'diagram.html'}")
        page.wait_for_timeout(300)
        page.evaluate("document.getAnimations().forEach(a => a.pause())")

        for i in range(n_total):
            t_ms = min(i, n_anim) / FPS * 1000
            page.evaluate(
                "t => document.getAnimations().forEach(a => { a.currentTime = t; })",
                t_ms,
            )
            page.screenshot(path=str(FRAMES / f"f_{i:04d}.png"))
        browser.close()

    out = HERE / "pipeline_arch.mp4"
    subprocess.run([
        "ffmpeg", "-y", "-framerate", str(FPS), "-i", str(FRAMES / "f_%04d.png"),
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(out),
    ], check=True, capture_output=True)
    print(f"wrote {out} ({out.stat().st_size // 1024}KB, {n_total} frames)")


if __name__ == "__main__":
    main()
