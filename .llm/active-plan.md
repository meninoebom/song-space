# Active Plan: Body as Arranger

Last updated: 2026-07-08

## Launch Backlog Progress

- [x] **#53 Runtime contract cleanup** (PR #64) — solo now restores trigger-muted
  members (silent-hook bug fixed); legacy quietVolumes/set_volumes/energy_blend
  paths deleted (fixedVolumes is the only volume source); startup mix + mute list
  moved into the score (`DEFAULT_SCORE.arc.startMuted`), so app.js holds no
  hardcoded state and PROOF_SCORE plays all 7 categories in its play phase; node
  test harnesses repaired (was crashing on main). `npm test` now runs them via node.
  - **Follow-up for #50:** `docs/solutions/adapter-architecture.md` + `composer-framework.md`
    still document `set_volumes` as a valid action — now stale.
  - **Follow-up (infra):** `frontend-tests` CI job now passes green; promote it to a
    required status check (command in CLAUDE.md § Auto-merge).

## Design Principles (established this session)

1. **Volume is the composer's domain.** Fixed mix levels. Dancer never touches the fader.
2. **Three interaction modes, three timing strategies:**
   - **Gate** (bring-in/take-out) → quantized to next bar boundary
   - **Impulse** (one-shot hits) → immediate
   - **Continuous** (effects: filter, reverb) → every frame
3. **Atmosphere always plays.** Texture + harmonic_bed are the floor. Never strip below them.
4. **Music invites movement.** The song should be audible and appealing before the dancer does anything. Movement reshapes the arrangement, not the volume.
5. **Per-instrument effects over whole-track effects.** Target one category at a time to avoid muddiness.

## What's Working

- Quantized mute/restore (lands on the bar) — feels musical
- Fixed volumes with effects-based interaction
- Arms up/crossed positions feel responsive
- "Where Angels Sing" is the primary test track
- Energy threshold bands for bringing groove/hooks in and out

## What's Next — Priority Order

### 1. Suspended drop (highest impact)
- **Gesture:** Arms up + still (suspended reading, fires after 2s)
- **On enter:** Solo vocals + harmonic_bed (everything else mutes, quantized to bar)
- **On release** (start moving): Everything slams back in (instant restore) — the "drop"
- **Feel:** Dancer holds a moment of tension, then releases it. Repeatable, intentional drama.

### 2. Stillness rework (fix silence bug properly)
- **Current problem:** strip_down goes too sparse, can feel like silence
- **New behavior:** Still for 2s → mute hooks, texture (leave bass + groove + harmonic_bed)
- Creates a "stripped back to the beat" feel, not emptiness
- Moving again restores the full mix

### 3. Arms up (while moving) → hooks arrive
- **Gesture:** Arms raised + still moving (different from suspended which requires stillness)
- **On enter:** Restore hooks + accents (quantized)
- **On exit:** Mute hooks on next bar
- **Feel:** Moving with arms up = the "big" version of the song. Arms down = back to basics.

### 4. Energy → groove enhancement
- Already partially there (filter brightness at high energy)
- Push further: foundation gets crisper too at very high energy
- The feeling of "adding power to the rhythm"

### 5. Future: per-instrument control within categories
- Currently categories are coarse (groove = all drums together)
- Bringing kicks vs hi-hats in/out separately would enable finer DJ-like control
- Requires subcategories or individual track addressing in AudioEngine
- Direction to explore, not first priority

## Completed This Session

- [x] Diagnosed volume architecture problem (weighted average math, triple attenuation)
- [x] Removed volume-as-interaction — switched to fixed composer mix
- [x] Replaced energy volume fader with energy threshold bands (bring-in/take-out)
- [x] Added quantized mute/restore (bar-aligned transitions)
- [x] Made flowing more dramatic (wider filter range + reverb on harmonic_bed)
- [x] Added high-energy groove brightness (continuous filter on groove)
- [x] Fixed strip_down silence bug (always keep harmonic_bed)
- [x] Arc phases now include harmonic_bed from the start
- [x] Removed text prompt hints from arc phases

## Architecture Notes

- `fixedVolumes` in score mappings → runtime sets these per frame (replaces quietVolumes/energy_blend)
- `muteCategoryQuantized` / `restoreCategoryQuantized` on AudioEngine → schedule on `@${timeSignature}n`
- Runtime checks `quantize: false` in action args to bypass (used for energy_slam instant restore)
- Continuous intents now fire ALL set_effect actions in pool (not just highest-weight)
