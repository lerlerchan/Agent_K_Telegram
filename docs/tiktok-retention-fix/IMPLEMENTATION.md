# Implementation Notes: TikTok Retention Fix (2026-07-14)

Technical detail behind the three commits on `agentCC` (`b98d5ee`, `096ef04`, `f609e80`), all in `scripts/generate-tiktok.py`.

## Diagnosis first

First posted video: 118 views, 3.4s avg watch, 3.25% completion, 0 followers. Investigated the actual pipeline (not the one that was assumed to be running — see "wrong assumption" note below) and found:

- `assemble()` built the video via ffmpeg `concat` demuxer over 7 static PNGs with per-slide `duration` entries and a single `scale/pad/fps` filter — **zero motion anywhere in the video**.
- No burned-in captions at all — voice and on-screen text were fully decoupled.
- `SLIDE_DURATIONS = [5, 4, 5, 5, 5, 5, 6]` — hook slide held frozen for 5 full seconds before any payoff.
- TTS voice was OpenAI `onyx` / edge-tts `en-US-ChristopherNeural`, both explicitly commented `# deep male voice`.

A still frame for the first 5 seconds, with no synced captions, is close to a worst-case TikTok opening.

### Wrong assumption caught mid-session

Earlier guidance (before this investigation) claimed the pipeline used a female Kokoro voice (`af_heart`). That's true — but for the **other**, permanently-idle pipeline (`run_pipeline.sh` / hyperframes, 12:33 cron). The pipeline that's actually posting videos is `generate-tiktok.py` (12:03 cron), which had its own separate, male-only TTS config. Two generators exist on this box for historical reasons (see project memory); always confirm which one is live before reasoning about "the" pipeline's behavior.

## Fix 1 — Ken Burns motion (`b98d5ee`)

`assemble()` previously did one `ffmpeg -f concat ... -vf scale,pad,fps` pass over the whole slideshow. Rewritten to render each slide as its own short clip first:

```python
for i, (p, dur) in enumerate(zip(slides, SLIDE_DURATIONS)):
    d = dur * factor
    n_frames = max(1, int(d * fps))
    # ffmpeg -loop 1 -i slide.png -t {d} -vf "...,zoompan=z='min(zoom+0.0015,1.08)':d={n_frames}:s=1080x1920:fps=30"
```

Then concatenates the resulting per-slide `.mp4` clips (video-only, `-c:v copy` at that stage) and muxes audio in a final pass. Zoom rate `+0.0015`/frame at 30fps caps at 1.08x zoom — subtle, deliberately not a dramatic effect, just enough that no frame reads as fully static.

`SLIDE_DURATIONS` changed from `[5, 4, 5, 5, 5, 5, 6]` to `[3, 3.5, 5, 5, 5, 5, 6]` — hook and problem slides shortened so the first real payoff (method 1) arrives faster.

**Verification**: rendered a test video against fake plan data + real edge-tts audio in scratchpad (not touching the real vault/queue), extracted first/last frame of the hook clip via `ffprobe`/`ffmpeg -ss`, visually confirmed the zoom (text/grid measurably larger, right edge cropped) between the two frames.

## Fix 2 — Female voice + burned-in captions (`096ef04`)

**Voice**: `tts()` swapped `onyx` → `nova` (OpenAI) and `en-US-ChristopherNeural` → `en-US-AriaNeural` (edge-tts fallback). Straightforward.

**Captions** — the bigger piece:

1. `transcribe_words(audio_path)` shells out to `~/TikTokPipeline/venv/bin/python3` (the sibling pipeline's existing faster-whisper install — deliberately reused rather than installing a second copy; the system Python here is externally-managed / PEP 668 and blocks a direct `pip install`). Runs `WhisperModel("tiny.en", device="cpu", compute_type="int8")`, returns word-level `{w, start, end}` timestamps as JSON over stdout. Wrapped in try/except — returns `[]` on any failure (network, model, subprocess) so a caption failure never blocks the cron.

2. `build_ass(words, out_path, group_size=3)` builds an ASS (Advanced SubStation Alpha) subtitle track. Words are grouped into windows of 3; for each word's `[start, end]` window, one `Dialogue` line renders the whole group with the *currently spoken* word wrapped in an inline `\c` color override (ACCENT/`#FFC832`) and the rest in WHITE — a manual per-word highlight rather than relying on ASS's native `\k` karaoke tag (which has inconsistent renderer support; explicit per-word Dialogue lines are guaranteed-correct across libass versions).

3. `assemble()` takes an optional `ass_path` — when present, the final mux pass switches from `-c:v copy` to a full re-encode with `-vf "ass='{escaped_path}'"` (libass, already compiled into the system ffmpeg via `--enable-libass`).

**Bug caught during testing**: first attempt rendered literal `,0,0,0,,This app fixed` as visible caption text. Cause: the `[Events] Format:` line only declared 5 fields (`Layer, Start, End, Style, Text`) but the `Dialogue:` lines were writing the full standard 10-field layout (`Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`). libass parsed against the declared 5-field format, so the extra `Name/MarginL/MarginR/MarginV/Effect` fields (all empty except a stray `0,0,0`) bled into what should've been pure `Text`. Fixed by declaring the full 10-field format line to match what's actually written. Caught by rendering an actual test frame and reading it, not just validating the ASS file parsed.

**Positioning**: `MarginV=220`, alignment 2 (bottom-center) — sits below all slide content (which tops out well above y≈1700 in the `make_slides()` layout) and above the footer text at `H-90`. Verified against both the hook slide (title + short subtitle) and a methods slide (denser body text) — no overlap in either case.

## Fix 3 — SEO/AEO metadata sidecar (`f609e80`)

Extended `EXTRACT_PROMPT`'s JSON schema (the same single LLM call that already produces the hook/bullets/voiceover) to also return:

- `title` — front-loaded primary keyword, phrased the way someone would type a search query or ask an AI assistant
- `description` — 2-3 sentences, first sentence restates the core question/keyword (for search + AI-answer-engine indexing), ends with a soft CTA
- `hashtags` — exactly 5, ordered broad → specific

`write_metadata(plan, out_path)` writes a plain-text sidecar to `TikTokQueue/{slug}-{date}.txt`:

```
TITLE
...

DESCRIPTION
...

HASHTAGS
#tag1 #tag2 #tag3 #tag4 #tag5
```

Since the video render is already 1080x1920 (9:16), this file + the mp4 work unmodified for both TikTok and Instagram Reels — the point was to make posting a straight copy-paste from the Obsidian-synced `TikTokQueue/` folder, no reformatting per platform.

**Bug fixed in passing**: `EXTRACT_PROMPT`'s pacing instructions still referenced the pre-Fix-1 slide durations (`[5,4,5,5,5,5,6]`) after `SLIDE_DURATIONS` had already changed to `[3,3.5,5,5,5,5,6]` earlier the same day. The LLM was being told the wrong target durations for voiceover segment pacing on slides 1-2. Updated to match.

## Testing approach used throughout

No changes were validated by reading code alone. Each commit was tested by:
1. Running the actual functions (`make_slides`, `transcribe_words`, `build_ass`, `assemble`) against fake-but-representative plan data and real generated TTS audio, in `/tmp` scratch space — never touching the real vault, queue, or note frontmatter.
2. Extracting real frames from the rendered test `.mp4` via `ffmpeg -ss ... -vframes 1` and visually inspecting them (not just checking the ffmpeg command exited 0).
3. Only committing after a frame-level visual check passed.

This caught two real bugs (the ASS Format-field mismatch, the stale prompt durations) that syntax checks and dry-runs would have missed.
