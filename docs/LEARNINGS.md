# Song Space — Learnings & Refinement Log

Accumulated insights from testing the loop processing pipeline. These drive code improvements in our chopper, filter, and categorizer — the models (Demucs, allin1) are fixed, but our post-processing is where all refinement happens.

## Architecture Insight

The Replicate models (Demucs for stems, allin1 for song structure) are pre-trained and unchangeable. Our competitive advantage lives in the post-processing pipeline: chopping, energy filtering, categorization, and selection. Every listening session produces feedback that becomes a code improvement.

## Issue: Low-Energy Edge Cases Not Filtered (2026-02-27)

**Song:** alorsondance.wav
**Observed:** `bass_intro_1.wav` (energy 0.003) and `drums_verse_3.wav` (energy 0.005) survived filtering but are essentially silent/useless.
**Root cause:** Energy thresholds are inclusive (`<` not `<=`), so values exactly at the threshold pass through.
**Fix needed:** Use `<=` instead of `<` for energy threshold comparison, or bump thresholds slightly:
- drums: 0.005 → 0.006
- bass: 0.003 → 0.004

## Issue: Vocals Cut Mid-Word at Section Boundaries (2026-02-27)

**Song:** alorsondance.wav
**Observed:** Vocal loops are cut at exact section boundary timestamps from allin1. These timestamps mark structural transitions (verse→chorus) but don't account for vocal phrasing. Result: words get sliced mid-syllable (e.g., "ch-" of "chant" ends up at the tail of one loop, "-ant" at the start of the next).
**Root cause:** We slice exactly at allin1's section boundary with no awareness of vocal activity.
**Fix approach:** Add a "snap to silence" step for vocal stems only. Near each cut point (±500ms window), find the nearest moment of low vocal energy or zero-crossing and snap the cut there. librosa's `zero_crossings()` or RMS energy in a sliding window can find natural pauses. This should only apply to the vocals stem — drums and bass can cut anywhere.

## Solved: Vocal Phrase Extraction via VAD (2026-02-27)

**Problem:** Section-based vocal chopping produced 16-second loops with huge silent gaps, or cut mid-word. A section with a repeating chant would be one giant loop instead of individual usable phrases.
**Solution:** RMS-based Voice Activity Detection on the vocal stem. Compute per-frame RMS (20ms), smooth with 100ms rolling average, threshold at 0.008, group consecutive active frames into regions, merge gaps < 300ms (breath pauses). Each region > 1.0s becomes a phrase loop.
**Key insight:** Vocals need fundamentally different chopping than instruments. Instruments can cut at section boundaries. Vocals must cut at silence between phrases.
**Parameters that worked:** `silence_threshold=0.008`, `min_gap_sec=0.3`, `min_phrase_sec=1.0`, `smooth_window=5` (100ms).
**Result:** 4 clean vocal loops (1 long passage + 3 individual chants) vs 15 messy section-based loops before. Each phrase starts and ends on silence.

## Solved: Directional Snap-to-Silence (2026-02-27)

**Problem:** Symmetric snap (±500ms) found silence *before* the last word instead of *after*, cutting phrases short.
**Solution:** End cuts search forward only (let the phrase finish), start cuts search backward only (find quiet before phrase starts). Window: 0.8s.
**Lesson:** Direction matters more than window size for snap-to-silence.

## Solved: Front-Loaded Energy Filter (2026-02-27)

**Problem:** Some vocal loops started with a loud word fragment then were 90% dead air.
**Solution:** If first 20% of a loop contains >75% of total energy, skip it.

## Breakthrough: No Volume Manipulation from Readings (2026-03-09)

**Problem:** Energy as continuous volume control made everything feel random — 7 faders tied to a noisy velocity signal created constant low-level pulsing. Multiple readings fighting over volume made the mix feel chaotic, not intentional.

**Solution:** Volume is the composer's domain. Period. No reading touches volume. Fixed mix levels in `quietVolumes`, dancer shapes sound through effects only.

**Three interaction modes — the complete vocabulary:**
1. **Continuous** — proportional tracking (more movement = more effect). Use: master filter (movement opens/closes the mix brightness). Like a fader but for timbre, not volume.
2. **Gate** — binary state you inhabit (enter = effect on, exit = effect off). Use: master reverb (arms up = wash in, arms down = dry). Like stepping into/out of a room.
3. **Impulse** — fire-and-forget moment (single punctuating event). Use: oneshot sample trigger. Like hitting a drum.

**Key insight:** Each mode should own its own effect domain so they can't fight each other. Filter = continuous, reverb = gate, oneshot = impulse. Clean separation.

**Validated by dancing (proof score):** Continuous filter and gate reverb felt immediately musical. The muffled→bright filter tracking was obvious and satisfying. Reverb wash on arms_up felt like stepping into a cathedral. Impulse (vocal oneshot) needs more work — not audible enough through speakers.

**Principle:** When something feels random, it's probably because too many things are moving at once with no clear cause-and-effect. Strip to one interaction per mode, make each one undeniable, then layer.

## Ralf Runtime Rework (2026-03-06)

**Problem:** The original pipeline used three separate modules (mapping.js, trigger-engine.js, trigger-actions.js) with different calling conventions. This made the interaction model hard to reason about and didn't match Ralf's scene config schema.

**Solution:** Unified `RalfRuntime` class implementing Ralf's Readings → Resolve → Draw → Act pipeline. Single `update(readings, phaseCategories, dt)` call per frame. Score config uses Ralf's schema: readings define body interpretations with intents (continuous or edge-triggered), intents map to weighted action pools, and `draw()` selects from pools with non-determinism.

**Key design decisions:**
- **Continuous intents use deterministic highest-weight** selection (not random draw) to avoid jarring per-frame changes in volume targets. Edge intents use weighted random draw for variety.
- **Weighted volume blending** across multiple active continuous readings, proportional to reading value. Falls back to `quietVolumes` when nothing is active.
- **Phase gating at -60dB** for categories not in the current arc phase — enforced in both continuous blending and edge action execution.
- **`on_exit` intents** fire on falling edge of a reading — enables patterns like "coiled → explosive release" where tension builds then releases.
- **Config validation warnings** in `_getPool` and `_act` catch typos in score config at runtime (console.warn, not throw).

**What was removed:** mapping.js (70 lines), trigger-engine.js (119 lines), trigger-actions.js (48 lines) + their test files (354 lines) = 590 lines deleted. Replaced by runtime.js (229 lines) + runtime.test.js (438 lines).

**app.js simplification:** Extracted detection loop and utilities. 479 → 219 → 146 lines across the rework. app.js is now pure wiring.

## Pending: Jerkiness Re-Implementation Awaiting Quality Lab Validation (2026-07-09)

**Status:** Implementation ready, validation gate NOT met. Tracked in #48.

**Background:** `jerkiness` existed in `movement.js` from the initial commit and was culled 2026-03-07 (see "Quality refinement: iterative dance testing" in `.llm/raw-learnings.md` — 18 qualities down to 10) because it did not read as meaningful in dance testing. That culled implementation computed a mean-aggregated third derivative (`frameJerk = |frameAccel - prevAccel|`, then `normalize(mean(jerkHistory))`) — a noise-prone formulation.

**What changed:** #48 re-implements jerkiness with a formula that was never tried in this codebase: **windowed variance of acceleration** over the last 10 frames (torso-normalized, One-Euro-smoothed inputs), matching Ralf's canonical `computeJerkiness` in `~/dev/ralf/adapters/shared/quality-math.ts`. The prior cull tested a different, weaker hypothesis, so it doesn't refute this one.

**AdaptiveRange pinning:** `jerkiness` has an absolute lower bound of 0 (zero acceleration variance = perfectly even acceleration), so its `AdaptiveRange` is pinned `min=0` before and after normalize, per the CLAUDE.md pinning rule. The `max` floor is a **provisional** estimate (0.0001): standing-still velocity jitter is ~0.002, so frame-to-frame acceleration jitter is ~0.0028, giving a jitter variance of ~7.8e-6 — normalizing to ~0.08 at `max=0.0001`, comfortably below the culled score's old `jerkiness < 0.5` gate minus hysteresis (0.05). This has not been checked against real dance data.

**The pending gate:** A live Quality Lab session (`/app/quality-lab.html`, webcam) where Brandon dances staccato movement vs. flowing movement, watching the `jerkiness` bar in the Temporal group. If it visibly separates the two, it graduates into `QUALITY_KEYS` (`frontend/js/constants.js`) and becomes eligible for score wiring in a future issue (#18 territory, not this one). If it doesn't separate them, remove the code per the 2026-03-07 cull precedent and record why here.

**Deliberately not done in this pass:** `jerkiness` is NOT in `QUALITY_KEYS` and NOT in any `DEFAULT_SCORE` reading — both are gated on the session above.

## What's Working Well (2026-02-27)

- **Drums:** Consistently good output across sections. Energy-based groove/foundation categorization makes sense.
- **Song structure detection:** allin1 correctly identifies intro/verse/chorus/outro with accurate timestamps. Section-aware chopping is a massive improvement over the old 4-bar grid.
- **Silent stem filtering:** Vocal loops from instrumental songs (line.wav) are now properly filtered (1 loop vs 61 before).
- **Loop count reduction:** 51-54 loops per song vs 244 before — much more manageable.
