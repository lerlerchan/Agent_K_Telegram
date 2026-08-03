# Implementation Notes: Weekly Batch + Hook Redesign (2026-07-30 → 08-03)

Technical detail behind `6a760f6`, `bce19ae`, `fd5e795`, `1955cb5` in
`scripts/generate-tiktok.py` and `scripts/arch-diagram/`.

## Fix 1 — Weekly batch (`6a760f6`)

`generate-tiktok.py` was designed to run once a week and process every eligible
`outputs/` post in one batch. It did neither:

- `find_post()` returned `min(eligible)` — a single post per run.
- Cron fired it **daily at 12:03**, plus an *undocumented second daily entry* at
  19:33 (`tiktok-substack-evening`) that nobody had recorded anywhere.

So it burned LLM + TTS calls twice a day to emit one video, while later posts sat
in a queue that drained one per day.

```python
def find_posts() -> list[Path]:          # was find_post() -> Path | None
    ...
    eligible.sort(key=lambda t: t[0])    # (tiktok_order, date)
    return [p for _, p in eligible]
```

Per-post work moved into `process_post(post, dry)`; `main()` loops it and logs
`Found N eligible post(s): ...` then `Processing post I of N: <slug>`.

**Cron**: `3 12 * * *` → `3 12 * * 0`; the 19:33 duplicate deleted (user
confirmed). Note the server tz is already `Asia/Kuala_Lumpur`, so the
"04:03 UTC" figure in older notes was wrong — no conversion applies.

**Verified**: dry run listed all 3 eligible posts, then a real run processed all
three in ~4 min (14:01:49 → 14:05:51), each producing an mp4 + `.txt` sidecar and
setting `tiktok_queued: true`.

### Gotcha found while testing

`published: true` is **not** a TikTok-approval flag. Every already-cycled post has
both `tiktok_queued: true` and `published: true` — the latter is set by the
Substack publish step, independently of whether anyone reviewed the video. The
pipeline's eligibility rule (`published != true`) therefore can't distinguish
"Substack-published" from "TikTok-approved". Not fixed; flagged for a future
`tiktok_published` field if the review flow ever needs to be automated.

## Fix 2 — Filename order (`bce19ae`)

`{slug}-{date}.mp4` → `{date}-{slug}.mp4`, for both the mp4 and its `.txt`
sidecar, so the queue sorts chronologically in Obsidian's explorer. Files
predating the change were **not** renamed (user's choice), so anything matching
filenames must handle both orders.

## Fix 3 — Hook slide redesign (`fd5e795`)

Prompted by the retention data (see HANDOFF). Rather than theorise, extracted the
actual frames of a posted video:

```bash
ffmpeg -i ai-agent-loop-engineering-2026-07-17.mp4 -ss 0 -vframes 1 f0.png
ffmpeg -i ai-agent-loop-engineering-2026-07-17.mp4 -ss 1 -vframes 1 f1.png
```

Two concrete defects, both visible in the frames:

1. **~55% of the canvas was empty.** Hook title top-anchored at y=420; nothing
   below it until a small footer at `H-90`. On a scrolling feed that reads as a
   half-blank card.
2. **The Ken Burns zoom was imperceptible at t=1s.** `+0.0015/frame` capped at
   1.08 — frames 0 and 1 are visually identical. The 07-14 "motion fix" only
   becomes visible around the ~1min mark; viewers leave at 0:01.

Also ruled out audio as a cause — `silencedetect` showed the voiceover starts at
0:00.00, no dead air.

Changes, **hook slide only** (`idx == 1` in `make_slides()`, `i == 0` in `assemble()`):

- `f_hero` at 116pt (vs `f_title` 88pt), title block vertically centered between
  `y=380` and `H-200` instead of top-anchored.
- A `GRID_COL` ellipse (r=460, 14px stroke) behind the text for visual mass.
- Wrap width `W-200` instead of `W-120` — narrower on purpose, so the faster zoom
  doesn't push words off-frame. Verified by rendering the real slide through the
  real `assemble()` path and checking the end-of-slide frame.
- Removed a duplicated "the secret below" (was drawn twice — once by `chrome()`'s
  footer, once under the title).
- Per-slide zoom expression:
  ```python
  zoom_expr = "min(zoom+0.006,1.18)" if i == 0 else "min(zoom+0.0015,1.08)"
  ```

**Refactor caution**: pulling `chrome(d, label, footer)` out of the shared prologue
into each branch (the hook needs an empty footer) initially dropped it from
slides 3–7 entirely. Caught before commit. If you touch that loop, confirm all
seven slides still draw chrome.

## Tool — Animated architecture diagrams (`1955cb5`)

`scripts/arch-diagram/`, prompted by a Reels-style sequential-reveal diagram.

- `diagram.html` — plain CSS. One `rise` keyframe (fade + translateY + slight
  scale) staggered purely by `animation-delay`; arrows draw via SVG
  `stroke-dashoffset → 0`. No animation library.
- `render.py` — Playwright loads the page, **pauses every animation**, then per
  frame sets `document.getAnimations().forEach(a => a.currentTime = t)` and
  screenshots. Frame-accurate and reproducible, unlike real-time screen capture.
- `add_voice.py` — edge-tts narration (`en-US-AriaNeural`, matching the pipeline).

### The timing lesson

First attempt hard-coded a start time per narration line, guessing durations.
Every line overlapped: edge-tts runs **~105 wpm**, far slower than assumed — a
9-word sentence took 5.1s, and ~23s of speech had been budgeted into an 8s video.

Fixed by inverting the dependency: `add_voice.py` now synthesises each line,
measures it with `ffprobe`, lays the lines out back-to-back with a 0.35s gap, and
**prints the `animation-delay` values the diagram should use**. Narration drives
the animation, not the reverse. Any retiming starts there.

Output: `TikTokQueue/2026-08-03-pipeline-architecture-animated.mp4` (23.08s).

## Testing approach

Same as the 07-14 session — nothing validated by reading code:

1. Functions run against fake-but-representative plan data in scratch space,
   never the real vault or queue.
2. Real frames extracted from rendered mp4s (`ffmpeg -ss ... -vframes 1`) and
   visually inspected — not just "ffmpeg exited 0".
3. Only then committed.

This caught the chrome() regression, the hook-text crop at max zoom, and the
narration overlap.
