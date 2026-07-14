# Handoff: TikTok Retention Fix (2026-07-14)

> For whoever picks this up next — human or agent.

## Where things stand

The first posted video (`claude-code-free-9router-2026-07-09.mp4`) got **118 views, 3.4s avg watch time, 3.25% completion, 0 new followers**. That's a hook/structure problem, not a distribution problem — see `IMPLEMENTATION.md` for the diagnosis.

Three commits landed same-day on `agentCC` in `lerlerchan/Agent_K_Telegram`, all touching `scripts/generate-tiktok.py` (the 12:03 daily cron generator):

| Commit | What |
|---|---|
| `b98d5ee` | Ken Burns zoompan motion per slide; hook/problem slide durations 5s/4s → 3s/3.5s |
| `096ef04` | Female TTS voice (`nova` / `en-US-AriaNeural`); burned-in word-level karaoke captions via faster-whisper + ASS |
| `f609e80` | SEO/AEO title/description/5-hashtags sidecar file, `TikTokQueue/{slug}-{date}.txt` |

All three are **pushed to origin/agentCC**. Not merged to `main` — that's a call for the user, not made here.

## What's NOT done

- **Not measured against real metrics yet.** Nothing here is confirmed to fix retention — it fixes the structural problems that were visible (static slideshow, no captions, slow hook, male voice on a channel where that wasn't a deliberate choice). The next posted video's TikTok Studio numbers are the actual test.
- **Instagram cross-post is untested.** The render is already 1080x1920 9:16 so it should drop into Reels natively, but nobody has actually posted one there yet.
- **12:33 vault-tag cron (`run_pipeline.sh`) is still idle by design** — separate decision, unrelated to this fix, see memory.

## How to verify it's actually running

```bash
tail -30 ~/github/Agent_K_Telegram/logs/tiktok-pipeline.log
```
Look for `Captions: N words transcribed` (not `Captions: skipped` — that means faster-whisper transcription failed and it silently fell back) and confirm a `.txt` sidecar landed next to the day's `.mp4` in `~/ObsidianVault/TikTokQueue/`.

## If something breaks

- **Cron produces a video with no captions**: check `Captions: skipped` in the log — means `~/TikTokPipeline/venv/bin/python3 -c <inline script>` failed. That venv is a different repo (`TikTokPipeline`, the idle sibling pipeline) — confirm it still has `faster-whisper` installed and the venv path hasn't moved. This is a soft dependency; a broken venv degrades to no-captions, it doesn't block the cron.
- **Video looks static again / no motion**: `assemble()` in `generate-tiktok.py` should be building per-slide `zoompan` clips before concatenating, not a single `-c:v copy` pass. If someone reverted to the old single-pass concat, motion is gone.
- **Rollback**: `git revert f609e80 096ef04 b98d5ee` on `agentCC`, or `git checkout 4f53b31 -- scripts/generate-tiktok.py` to go back to the pre-fix version wholesale.

## Immediate next step

Wait for tomorrow's 12:03 cron output, check TikTok Studio metrics on that video against the 3.4s/3.25% baseline, and decide whether to invest further (e.g. multiple hook variants A/B'd, or move on to the Instagram cross-post workflow).
