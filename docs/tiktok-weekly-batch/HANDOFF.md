# Handoff: TikTok Weekly Batch + Hook Redesign (2026-07-30 → 08-03)

> For whoever picks this up next — human or agent.
> Prior session's handoff: [`../tiktok-retention-fix/HANDOFF.md`](../tiktok-retention-fix/HANDOFF.md)

## Where things stand

Five commits on `agentCC` in `lerlerchan/Agent_K_Telegram`, all pushed:

| Commit | What |
|---|---|
| `6a760f6` | Batch-process all eligible posts; cron moved to Sunday-only |
| `bce19ae` | Output filename `{date}-{slug}.mp4` instead of `{slug}-{date}.mp4` |
| `fd5e795` | Hook slide redesign — centered hero type + fast zoom on slide 1 only |
| `1955cb5` | `scripts/arch-diagram/` — animated architecture diagram renderer |
| `ba250a6` | README: document `scripts/` automation |

Plus, in `lerlerchan/TikTokPipeLine` (spec repo): commit `87b6cb0` rewrites the
README around what actually ships. **Committed on `main`, not pushed.**

## The headline finding

**The 2026-07-14 retention fix did not work.** Real TikTok metrics on the three
videos posted after it landed:

| Posted | Video | Views | Avg watch | Completion | Drop-off |
|---|---|---|---|---|---|
| *(07-09 baseline, pre-fix)* | claude-code-free-9router | 118 | 3.4s | 3.25% | — |
| 23 Jul | loop-engineering | 143 | 2.81s | 1.4% | 0:01 |
| 24 Jul | manage-unknowns | 128 | 2.96s | 0% | 0:01 |
| 27 Jul | kimi-vs-claude-code | 128 | 5.25s | 2.3% | 0:01 |

Two of three are *worse* than the pre-fix baseline. All still drop at 0:01.
Motion, captions and voice all live past the first second — viewers never got
there. Do not treat that fix as a win when reasoning about retention.

The hook redesign (`fd5e795`) is the response, and it is **unvalidated**. The
first videos carrying it come from the 2026-08-02 batch onward.

## What's NOT done

- **Hook redesign unmeasured.** Compare the next posted videos' drop-off point
  against the 0:01 baseline above. That's the whole test.
- **`TikTokPipeLine` README commit not pushed**, and it sits on `main` rather
  than a branch. Review before pushing, or `git reset --soft HEAD~1`.
- **Architecture SVG is stale** — `docs/architecture/system-architecture.svg` in
  the spec repo still shows Remotion + Kokoro. The README flags this inline, but
  the diagram itself hasn't been regenerated.
- **`PRD.md` still describes v0.2** (daily, Remotion, Kokoro). Left deliberately
  as the design record; the README is now the source of truth for what runs.
- **No paid TTS.** No `OPENROUTER_API_KEY`/`OPENAI_API_KEY` in `.env`, so every
  render uses free `edge-tts`. Not a bug — just know the `nova` voice path is dead code today.
- **Orphan file**: `TikTokQueue/promo-note-2026-07-07.mp4` has no source note.
  Left alone.

## How to verify it's running

```bash
tail -40 ~/github/Agent_K_Telegram/logs/tiktok-pipeline.log
```

A healthy weekly run logs `Found N eligible post(s): ...` then
`Processing post I of N: <slug>` per item. `Captions: skipped` means
faster-whisper failed (soft dependency — degrades to no captions, never blocks).

Cron (all times Asia/Kuala_Lumpur, server tz is already MYT — no UTC math):

```
3 12 * * 0   generate-tiktok.py        # Sunday only
33 12 * * *  run_pipeline.sh           # vault pipeline — permanently idle
17 3 * * 0   cleanup_storage.py
```

## If something breaks

- **Only one video from a multi-post batch** — `find_posts()` returned a list but
  `main()` stopped early. The loop is in `process_post()`/`main()`.
- **Video looks static** — `assemble()` must build per-slide `zoompan` clips
  before concat. Slide 1 uses a *different, faster* zoom expression than the rest.
- **Hook text cropped at max zoom** — the hook wrap width is `W-200` (narrower
  than other slides' `W-120`) precisely to leave room for the punchier zoom.
  Don't "fix" it back.
- **Rollback**: `git revert fd5e795 bce19ae 6a760f6`.

## Immediate next step

Wait for the 08-02 batch to be posted, pull its TikTok Studio numbers, and
compare drop-off against 0:01. If it still drops at 0:01, the problem is not the
hook slide's layout and the next hypothesis should be the *format itself*
(text-slide deck vs. native TikTok visual grammar) — not another polish pass.
