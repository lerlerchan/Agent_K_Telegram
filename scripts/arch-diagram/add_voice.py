#!/usr/bin/env python3
"""Add a voiceover to pipeline_arch.mp4, paced to the layer-reveal timing.

Uses the same edge-tts voice as the TikTok pipeline (en-US-AriaNeural, +5%)
so this clip sounds like the rest of the channel. Each line is generated
separately and placed at the timestamp its layer appears, via ffmpeg adelay.
"""
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
VOICE, RATE = "en-US-AriaNeural", "+5%"

# Narration drives the timing: lines are laid out back-to-back from the measured
# audio length, then the animation is fitted to them (guessing durations up front
# just produced overlapping lines — edge-tts runs ~105 wpm, slower than expected).
LEAD_IN = 0.3   # beat before the first line
GAP = 0.35      # breath between lines

LINES = [
    "One Obsidian note becomes a posted video. No clicks.",
    "DeepSeek writes the hook and the script.",
    "Edge T T S speaks it. Whisper times every word.",
    "Pillow draws the slides. FFmpeg adds motion and captions.",
    "Straight to the queue, ready to post.",
]


def synth(text: str, out: Path) -> None:
    subprocess.run(
        ["python3", "-m", "edge_tts", "--voice", VOICE, "--rate", RATE,
         "--text", text, "--write-media", str(out)],
        check=True, capture_output=True,
    )


def duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def main() -> None:
    parts, cursor = [], LEAD_IN
    for i, text in enumerate(LINES):
        p = HERE / f"vo_{i}.mp3"
        synth(text, p)
        d = duration(p)
        parts.append((cursor, d, p))
        print(f"line {i}: {cursor:5.2f}s -> {cursor + d:5.2f}s  ({d:.2f}s)  {text[:44]}")
        cursor += d + GAP

    vo_end = max(s + d for s, d, _ in parts)
    print(f"\nvoiceover ends at {vo_end:.2f}s")
    print("--- set these animation-delay values in diagram.html ---")
    names = ["SOURCE", "SCRIPT", "VOICE", "RENDER", "OUTPUT"]
    for (start, _d, _p), name in zip(parts, names):
        layer = max(0.0, start - 0.35)  # layer lands just before it's narrated
        print(f"  {name:7} layer {layer:.2f}s  box {layer + 0.25:.2f}s")
    for i in range(1, len(parts)):
        prev_end = parts[i - 1][0] + parts[i - 1][1]
        print(f"  arrow{i}  line {prev_end - 0.55:.2f}s  head {prev_end - 0.40:.2f}s")
    print(f"  suggested DURATION = {vo_end + 1.6:.1f}")

    # mix: delay each line to its slot, then combine
    inputs, filters, labels = [], [], []
    for i, (start, _d, p) in enumerate(parts):
        inputs += ["-i", str(p)]
        filters.append(f"[{i}:a]adelay={int(start*1000)}|{int(start*1000)}[a{i}]")
        labels.append(f"[a{i}]")
    filter_complex = (
        ";".join(filters)
        + f";{''.join(labels)}amix=inputs={len(parts)}:normalize=0[out]"
    )
    mixed = HERE / "voiceover.mp3"
    subprocess.run(
        ["ffmpeg", "-y", *inputs, "-filter_complex", filter_complex,
         "-map", "[out]", str(mixed)],
        check=True, capture_output=True,
    )
    print(f"mixed voiceover: {duration(mixed):.1f}s")


if __name__ == "__main__":
    main()
