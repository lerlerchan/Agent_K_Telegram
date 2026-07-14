# Decision Log: TikTok Retention Fix (2026-07-14)

Why things were decided the way they were — for whoever next has to judge an edge case this doesn't cover.

## There are two TikTok generators on this box, and that mattered

- **12:03 cron, `scripts/generate-tiktok.py`** — Substack `outputs/` posts, Pillow slides + FFmpeg. **This is the one that's actually posting videos.**
- **12:33 cron, `~/TikTokPipeline/run_pipeline.sh`** — vault-tag notes, hyperframes render. **Permanently idle** (decided 2026-07-14, separate conversation) — no non-`outputs/` vault notes carry a real `tags: [tiktok-ready]` array, only unprocessed clippings.

**Why this matters for future work**: earlier in the same session, guidance was given that the pipeline used a female Kokoro voice — true, but only for the idle one. Any future claim about "the" pipeline's TTS voice, render engine, or caption behavior needs to specify *which* generator, because they diverge completely (Remotion/hyperframes vs Pillow/FFmpeg, Kokoro vs OpenAI/edge-tts). Default assumption going forward: if it's not explicitly the hyperframes one, it's `generate-tiktok.py`.

## Why fix retention before anything else

User's ask started as "is my video good" and narrowed to concrete metrics: 118 views, 3.4s avg watch, 3.25% completion, 0 followers. Considered and rejected as the primary lever:
- **Posting time** — already posting at peak hour; not the bottleneck.
- **Follower count** (169 TikTok / 900 Instagram) — both platforms' discovery feed pushes cold content regardless of follower count, so this doesn't gate reach.
- **Cross-posting to Instagram** — reasonable to try (render is already 1080x1920, no reformat needed) but won't fix an underlying retention problem; a video that doesn't hold attention on TikTok won't hold it on Reels either.

Concluded the video's structure itself (static, no captions, slow hook) was the dominant factor, and fixed that first. This is a hypothesis, not a confirmed result — see `HANDOFF.md` for what "confirmed" would look like.

## Why reuse the sibling venv for faster-whisper instead of installing fresh

The system Python (`/usr/bin/python3`, used by the cron) is PEP 668 externally-managed — `pip install --user faster-whisper` fails outright without `--break-system-packages`. Rather than force that (or stand up a dedicated venv, duplicating a ~150MB+ model download), `generate-tiktok.py` shells out to `~/TikTokPipeline/venv/bin/python3` for the transcription step only, since that venv already has faster-whisper installed and working from the other pipeline's earlier setup. This is a soft coupling — if that venv ever moves or gets `faster-whisper` uninstalled, captions silently degrade to "skipped" rather than breaking the cron. Accepted that tradeoff over adding a hard new dependency to the live generator.

## Why manual per-word Dialogue lines instead of ASS `\k` karaoke tags

ASS has a native karaoke tag (`\k<centiseconds>`) meant for exactly this (progressive fill/highlight per syllable). Chose not to use it because its rendering behavior is inconsistent across libass versions/builds, and getting it visually right would have needed more trial-and-error than emitting one `Dialogue` line per word window with an explicit `\c` color override on the active word — more verbose ASS output, but deterministic and easy to reason about. Given this renders via the system's compiled ffmpeg (whatever libass version that happens to be), determinism won over compactness.

## Why 3-word caption groups, not 1 or 5

Not deeply tuned — picked as a reasonable middle ground between "one word on screen at a time" (choppy, hard to read ahead) and "long lines" (loses the karaoke-highlight effect's point, which is to visually track the voice). `group_size` is a parameter on `build_ass()` if this needs revisiting after seeing real footage.

## Why the metadata sidecar is a flat `.txt`, not YAML frontmatter or JSON

User's stated requirement was "so I can copy and paste to both platforms from Obsidian TikTok queue" — the target consumer is a human doing manual copy-paste into TikTok's and Instagram's caption boxes, not another script. A flat TITLE/DESCRIPTION/HASHTAGS text block optimizes for that; structured formats (frontmatter, JSON) would need an extra step to become paste-ready and weren't asked for.

## Not pushed to `main`

All three commits landed on `agentCC` (already the checked-out branch, matches how prior work in this repo was committed) and were pushed to `origin/agentCC` only because the user explicitly asked to push — not merged to `main`. That's a judgment call left to the user; nothing here is blocked on it since the cron runs off whatever branch is checked out locally.
