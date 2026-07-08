# Raw Learnings

## 2026-07-08 - Issue #53: Runtime contract cleanup

### Solo must un-mute its own members, not just mute others
**Problem:** `solo` muted every non-member category but never touched members. Because
`setCategoryVolume` no-ops while `_triggerMuted` is set (audio-engine.js:160), a member
that was trigger-muted earlier (e.g. `hook` after `energy_high_exit`, or via
`arc.startMuted`) stayed silent through the whole solo — the pool played with a hole in it.
**Solution:** In the solo case, walk `phaseCategories`; for members call
`restoreCategoryQuantized` if `isTriggerMuted`, for non-members mute. The atmosphere
invariant (texture + harmonic_bed in every phase and every solo pool) means solo never
strips the floor.
**Code ref:** `frontend/js/runtime.js` (solo case in `_act`)

### The test files were never jest suites
**Problem:** `package.json` had `"test": "jest"` and jest devDeps, but both test files are
homemade node harnesses (own `test()`/`assert()`, `process.exit(1)`, header says "Run with:
node ..."). So `npm test` reported "0 tests" and failed regardless of code health — plus
they threw on import after the fixedVolumes migration removed `quietVolumes` and the
quantized mute methods were added without updating the mock.
**Solution:** Repointed `npm test` to `node frontend/js/score.test.js && node .../runtime.test.js`
and removed the unused jest devDeps + jest.config.js (shed 4.4k lines of lockfile). Mock
engine now tracks a real `muted` Set so `isTriggerMuted` reflects state across
mute→restore, and records quantized/non-quantized variants under one `fn` name so
assertions stay variant-agnostic.
**Code ref:** `package.json`, `frontend/js/runtime.test.js` (mockEngine)

### End of Issue Retrospective
**What went well:** Issue was diagnosed to exact line numbers; the three cleanups share one
contract so they landed cleanly together. Both reviewers found nothing Critical/Important.
**What took longer than expected:** Untangling the test-runner mismatch (jest vs node
harness) — a pre-existing half-migration surfaced by the CI setup done just before.
**Would do differently:** Nothing major. Left the stale `set_volumes` docs for #50 rather
than expanding scope.

## 2026-03-04 - Issue #7: Zero-config onboarding

### Module extraction strategy for large orchestrator files
**Problem:** app.js was 479 lines mixing orchestration, webcam setup, skeleton drawing, debug overlay, and mode switching. Target: ≤150 lines.
**Solution:** Extract by responsibility: webcam.js (setup + detect API), skeleton.js (canvas drawing), debug.js (text overlay + bar helper). Each module owns its own DOM interaction. app.js becomes pure wiring — import, instantiate, connect callbacks. Landed at 178 lines (14 are imports).
**Code ref:** `frontend/js/app.js`, `frontend/js/webcam.js`, `frontend/js/skeleton.js`, `frontend/js/debug.js`

### webcam.js API design: detect() returns null when not ready
**Problem:** Detection loop needs to handle "webcam not ready" and "no results" differently from "results with 0 bodies."
**Solution:** `webcam.detect()` returns `null` if video not ready or webcam not running, returns the MediaPipe results object otherwise. Caller checks `if (results)` then `results.landmarks.length` for body count. Clean separation: webcam module owns readiness, app owns interpretation.
**Code ref:** `frontend/js/webcam.js:58-62`

### Rebase conflicts on complete file rewrites
**Problem:** Rebasing a complete rewrite of app.js onto a branch that modified app.js (PR #11) creates conflicts that git can't auto-merge.
**Solution:** When you've rewritten a file entirely and the upstream change is already incorporated in your rewrite, use `git checkout --ours` (or just re-apply your version). The rewrite already accounts for upstream changes since you read the merged state before rewriting.

### End of Issue Retrospective
**What went well:** Clean extraction pattern. Each module has a single responsibility. Debug mode via URL param is elegant — no code paths removed, just hidden.
**What took longer than expected:** Rebase conflict resolution after merging PR #11 mid-flight.
**Would do differently:** Merge all blocking PRs before starting a dependent issue's branch.


## 2026-03-04 - Issue #6: Wire TriggerEngine

### Extract action application as testable helper
**Problem:** The wiring between TriggerEngine and AudioEngine lives in app.js (browser-only, untestable without DOM/Tone.js). How to get test coverage on integration logic?
**Solution:** Extract `applyTriggerActions(actions, engine, allCategories)` into its own module. Pure function, testable with a mock engine. 15 tests cover mute/solo/restore/multiple/empty cases.
**Code ref:** `frontend/js/trigger-actions.js`

### Trigger evaluation order in detection loop
**Problem:** Where in the frame loop should triggers evaluate — before or after mapping?
**Solution:** After mapping. Mapping sets the "normal" volume levels, then triggers override with mute/restore. This is correct because `setCategoryVolume` is already a no-op when trigger-muted (from issue #4), so mapping can run freely and triggers just overlay on top.
**Code ref:** `frontend/js/app.js:280-285`

### End of Issue Retrospective
**What went well:** Clean wiring — the trigger-mute priority pattern from #4 made integration trivial. No fight between mapping and triggers.
**What took longer than expected:** Nothing — straightforward integration.
**Would do differently:** Nothing. The separation of TriggerEngine (pure state) → applyTriggerActions (translation) → AudioEngine (audio) is clean.


## 2026-03-04 - Issue #5: TriggerEngine

### Sustain timer design: accumulate on first frame
**Problem:** When a reading activates, should the first frame's dt count toward the sustain timer? If dt is large (e.g., 2.0s in a test), the trigger could fire immediately on activation.
**Solution:** Yes, first frame counts. The rising edge resets the timer to 0, then dt is added in the same frame. This is correct — if the reading has been active for dt seconds, that's real sustained time. Tests should use small incremental dt values to simulate realistic frame-by-frame accumulation.
**Code ref:** `frontend/js/trigger-engine.js:49-58`

### Solo action resolution pattern
**Problem:** A solo action means "only these categories should play." But the TriggerEngine shouldn't know about all possible categories — only what the arc phase currently allows.
**Solution:** Resolve solo into `_muteTargets` = allowedCategories minus solo targets. The caller mutes those specific categories. This keeps the engine arc-aware without coupling it to the audio engine.
**Code ref:** `frontend/js/trigger-engine.js:99-103`

### End of Issue Retrospective
**What went well:** TDD worked perfectly here. 24 tests caught the sustain timer edge case immediately. Pure state machine design made testing trivial — no mocks, no DOM, no Tone.js.
**What took longer than expected:** Nothing — clean build.
**Would do differently:** Nothing. This is the right abstraction level.


## 2026-03-04 - Issues #2, #3, #4: Score config refactors

### Batching parallel issues into one PR
**Problem:** Three independent issues all depended on #1 and touched overlapping files (app.js).
**Solution:** Combined into one branch/PR. Clean git history via separate commits per issue, single PR for review. Avoids merge conflicts between parallel branches touching app.js.

### Trigger-mute priority pattern in AudioEngine
**Problem:** Edge triggers need sharp volume changes that override the continuous mapping layer. If both fight, you get audible jitter.
**Solution:** `_triggerMuted` state flag per category. `setCategoryVolume` becomes a no-op when flag is set. `restoreCategory` clears the flag and snaps to last known mapping volume. Clean priority: triggers > mappings.
**Code ref:** `frontend/js/audio-engine.js:155-180`

### End of Issue Retrospective
**What went well:** All three issues landed cleanly. Removing deprecated re-exports immediately (rather than deferring) kept the codebase clean.
**What took longer than expected:** Nothing — straightforward refactors.
**Would do differently:** Nothing. Batching parallel issues was the right call.


## 2026-03-04 - Issue #1: Create DEFAULT_SCORE config and score.js

### Data extraction pattern for config-driven refactors
**Problem:** Needed to extract scattered constants from 3 modules into one config without breaking anything.
**Solution:** Create the canonical config in score.js, then make original modules re-export from it. This gives immediate backwards compatibility — all existing imports work unchanged. Consumers can be migrated one at a time in later issues.
**Code ref:** `frontend/js/score.js`, `frontend/js/arc.js:10-12`

### mapping.js constants were module-private
**Problem:** `VOLUME_MAP` and `QUIET_VOLUMES` in mapping.js were never exported (used only by `applyMapping` internally). Can't do a simple re-export like arc.js and readings.js.
**Solution:** Just reassign the module-private `const` from the score import. Same variable names, same behavior, source of truth is now score.js. Issue #2 will refactor `applyMapping` to accept these as parameters.
**Code ref:** `frontend/js/mapping.js:1-4`

### End of Issue Retrospective
**What went well:** Clean extraction, zero behavior change, verified with Node.js
**What took longer than expected:** Nothing — straightforward data move
**Would do differently:** Nothing for this issue. It's the right foundation.

## 2026-03-06 - T3/T4/T5: Parallel implementation

### Parallel agents sharing working directory is messy
Agents that need separate branches should use `isolation: "worktree"`. Without it, both agents committed to whatever branch was checked out, mixing T3/T4/T5 commits on the same branch. Required manual cherry-picking to sort out. Next time: use worktrees for parallel branch work.

## 2026-03-06 - T7: Expand readings

### hipHeight quality doesn't exist — adapt issue specs to available qualities
The issue spec referenced `hipHeight` for the grounded reading, but movement.js doesn't have that quality. Substituted with `legBend` (already inverted — high value = bent knees) + `contraction` + inverted `verticality`. Always verify quality names against `QUALITY_KEYS` in movement.js before writing reading configs.

### on_exit pools with mixed action types create interesting non-determinism
The `explosive_release` pool has restore (weight 3), oneshot (weight 2), and filter_sweep (weight 1). Each coiled→release exit randomly picks one, making repeat interactions feel different. This is a Ralf design pattern worth preserving — pools shouldn't be limited to variations of the same action type.

## 2026-03-06 - T9: Integration test + tuning

### Score config validation catches typos before runtime
376 assertions validate that all readings reference real qualities, all intents exist, action types are valid, and categories are consistent. This is the safety net for iterating on score.js — change a reading, run `node frontend/js/score.test.js`, catch mistakes instantly.

### Continuous volume blending math has floating point drift
Weighted average of dB values through the blending math produces results like -6.000000000000001 instead of -6. Tests need approximate comparison (`Math.abs(actual - expected) < 0.01`) not strict equality.

### T8 issue spec was wrong about stage-directions.js
Issue #33 listed stage-directions.js for deletion, but it's actively used (6 call sites in app.js). Always verify "dead code" claims by grepping for imports before deleting.

## 2026-03-07 - Simplified score: first dance test

### Energy→volume is the most important primitive
The `energy` reading (velocity → overall volume, always active, no gate) makes the most fundamental connection feel immediate: move = hear more. This single reading does more for emotional salience than 11 overlapping readings did before. Lesson: one obvious, reliable mapping beats many subtle ones.

### Flowing→synths landed as "meaningful"
Smooth coherent movement causing harmonic layers to bloom felt poetic and discoverable — exactly the target. The gate conditions (velocity > 0.15, jerkiness < 0.5) are working as intended to separate "flowing" from "just moving."

### Stillness drop needs faster bass exit
The current drums_drop at 2s works but bass lingers too long. Consider: bass should drop with groove (or shortly after), not persist through the strip-down. Could add bass to the drums_drop mute categories, or add a separate bass_drop edge at ~3s.

### Fewer readings = clearer interactions
Going from 11→6 readings eliminated muddy competing activations. Each reading now has perceptual space to be felt distinctly. The "cut readings are still expressible as primitives" framing is correct — simplifying the default scene improved it.

### Qualities are the real foundation
Getting body qualities right (reliable, meaningful, distinct) matters more than clever score config. The score is only as good as the qualities it reads. Next step: audit qualities for reliability and perceptual distinctness. Consider building a quality visualizer/tester.

## 2026-03-07 - Quality refinement: iterative dance testing

### AdaptiveRange min-pinning for qualities with absolute zero
When standing still, velocity values are near-zero. AdaptiveRange contracts min/max toward midpoint until `range < 0.0001`, then returns 0.5 ("I don't know"). Fix: pin `this.ranges.velocity.min = 0` after each normalize call. Zero velocity IS the absolute minimum. Same fix needed for coherence variance. Any quality with a true floor should pin its min.

### Stillness is a reading, not a quality
Tried making stillness a quality (1 - velocity). It's redundant — readings already handle this with gates (`velocity: { below: 0.12 }`). Lesson: if a "quality" is just an interpretation of another quality through a threshold, it belongs in the reading layer, not the quality layer.

### Coherence needs torso-normalized velocity diffs
Left/right velocity differences were in raw pixel space while velocity was torso-normalized. The raw diffs were tiny → AdaptiveRange couldn't distinguish them → coherence stuck at 0.5. Fix: normalize left/right velocities by torsoLength, same as frameVel. Also gate coherence on `out.velocity > 0.05` (normalized) — coherence is meaningless when still.

### Impulse = rising edge detection (Schmitt trigger), not sustained-high detection
First attempt: `|frameVel - rollingMean|` — mean chases signal → repeated triggers ("da da da da"). Second attempt: spike-and-decay with cooldown — still pulses because velocity delta persists across frames. Working solution: Schmitt trigger with two thresholds. Fire when normalized velocity crosses above 0.4, re-arm only when it drops below 0.15. One clean spike per burst. Pattern from audio onset detection (librosa peak_pick) and biomechanics movement onset literature.

### Contraction enriched: all 4 extremities from body center
Original contraction only used wrist-to-hip distance. Enriched to mean distance of wrists + ankles from body center (mean of shoulders + hips). Captures full expansion/contraction — crouched ball vs spread-eagle. Dance-tested as "really really good."

### Spatial qualities are inherently reliable; temporal qualities need careful engineering
Angle/ratio-based spatial qualities (armsRaised, legBend, headTilt, wristSpread) work immediately because they're scale-independent. Velocity-based temporal qualities broke in multiple ways: pixel-scale dependence, AdaptiveRange drift, rolling-mean chasing. Each required a specific fix (torso normalization, min-pinning, Schmitt trigger). Budget more time for temporal quality engineering.

### Quality inventory: 18 → 10 through dance testing
Started with 18 qualities. Removed 8 that didn't work or weren't meaningful (torsoTwist, jerkiness, movementScale, symmetry, armAsymmetry, elbowBend, hipSway, clap, stillness). Final 10: velocity, impulse, coherence, contraction, verticality, wristSpread, armsRaised, legBend, headTilt, jump. Each confirmed meaningful through Quality Lab testing.

## 2026-03-07 - Velocity max pin + accumulating readings

### AdaptiveRange max-pinning: floor must account for jitter AND hysteresis
Three iterations to get the velocity max pin right:
- **0.001**: Landmark jitter (~0.0005) is comparable to range → chaotic normalization (0.3-0.8 when still). Broken.
- **0.01**: Jitter normalizes to ~0.2, which is above the hysteresis activation threshold (gate `below: 0.12` minus `HYSTERESIS_BAND: 0.05` = 0.07). Works once, then fails after movement expands the range and decay brings it back to the pin floor.
- **0.05**: Jitter normalizes to ~0.04, safely below 0.07. Works reliably across move→still→move→still cycles.

**The formula**: `max_floor > jitter / (gate_threshold - HYSTERESIS_BAND)`. For stillness: `0.002 / 0.07 = 0.029`, so 0.05 gives comfortable margin. Pin both before AND after normalize — before so the current frame uses a healthy range, after so decay doesn't collapse it before next frame.

**Generalizable rule**: When pinning AdaptiveRange floors, the pin value must be well above the signal's noise floor, AND the resulting normalized noise must be below any gate threshold minus its hysteresis band. Calculate both constraints.

### Three reading behavior patterns (Ralf vocabulary)
Discovered through iterative dance testing that readings need three distinct temporal behaviors:

1. **Instantaneous** (default): Value snaps to weighted mix when gate opens. Best for reactive states where body shape maps directly to music. Examples: energy, arms_up, wide, compact, flowing.

2. **Accumulating** (`rampSeconds`): Value grows from 0 to full mix over N seconds while gate stays open. Resets on gate close. Best for states where time deepens meaning — dramatic tension, sustained commitment. The longer you hold it, the more powerful. Examples: stillness (3s), suspended (2s), melting (4s).

3. **Edge-triggered** (via intents with `after`): Fires one-time action after sustained activation. Already existed. Examples: drums_drop at 2s, strip_down at 5s.

These compose freely: stillness is both accumulating (continuous blend grows over 3s) AND edge-triggered (drums_drop fires at 2s, strip_down at 5s). Implementation: single `rampSeconds` field on reading config, ReadingsEngine tracks `activeTime` per reading, scales value by `min(1, activeTime / rampSeconds)`.

**Design insight**: The accumulating pattern makes stillness feel like a journey — "you get still and then stillness grows, it sort of emerges." Dance-tested as "perfect, beautiful." The key is that the continuous blend mirrors the edge triggers' philosophy: time deepens the effect. Binary snap-on was less expressive.

### Laban Movement Analysis as reading vocabulary source
Researched LMA (Rudolf Laban's framework) to expand from 6 to 10 readings. Four Effort factors (Weight, Time, Space, Flow), Bartenieff connectivity, Shape layer. Identified 8 candidates, 4 implementable with existing qualities:
- **suspended** (Laban: suspension): armsRaised + verticality, gate: armsRaised > 0.4 + velocity < 0.25
- **melting** (Laban: collapse/melt): contraction + ¬verticality, gate: velocity < 0.2
- **wide** (Laban: shape flow opening): wristSpread + ¬contraction, gate: wristSpread > 0.5 + contraction < 0.4
- **compact** (Laban: bound flow): contraction + legBend + ¬wristSpread, gate: contraction > 0.5 + velocity > 0.1

Remaining 3 need new qualities (lateralOscillation, velocityPeriodicity, pathCurvature): swaying, pulsing, winding. LMA provides a rich, well-established vocabulary for naming body states that maps cleanly to the reading config schema.

## 2026-03-08 - Impulse peak velocity fix + step detection

### Impulse needs peak joint velocity, not mean
**Problem:** After pinning velocity max at 0.05, impulse stopped triggering on stomps and punches. The 30-frame mean velocity dilutes localized sharp movements — a stomp moves ankles fast but shoulders barely move, so the mean barely spikes.
**Solution:** Compute `peakVel = Math.max(...allVels)` (max velocity across all joints) alongside `frameVel` (mean). Use peak for impulse detection, mean for the velocity quality. Peak catches any sharp movement anywhere in the body.
**Code ref:** `frontend/js/movement.js` ~line 275

### Step detection: ankle Y baseline with spike-and-decay
**Problem:** Needed concrete footwork detection. Abstract rhythmicity (autocorrelation on velocity) was tried and scrapped — too noisy, not meaningful enough to map to music.
**Solution:** Track ankle Y history (15 frames). Detect foot strikes when current ankle Y exceeds baseline (mean of older frames) by >0.02. Spike-and-decay (0.8 decay factor), 5-frame cooldown between triggers. Works well for stomps and rhythmic stepping.
**Key insight:** Concrete event detection (step = ankle drops) beats abstract periodicity analysis (autocorrelation). The musical mapping is clearer: each step can drive groove/percussion.

### Kick detection: false positive overlap with steps
**Problem:** Kick (ankle Y rises sharply) fires on the pre-lift phase of normal steps — the foot lifts before it strikes down. Too much overlap.
**Decision:** Scrapped. Not worth the complexity. Step alone covers the rhythmic footwork use case.

### Velocity max pin: noise_floor / max_pin < gate_threshold - HYSTERESIS_BAND
**Formula:** For stillness gate (velocity below 0.12, hysteresis 0.05): MediaPipe jitter ~0.0005, so max_pin must be > 0.0005 / (0.12 - 0.05) = 0.007. Pin of 0.01 was marginal (jitter normalized to ~0.05, barely below 0.07). Pin of 0.05 works cleanly (jitter normalizes to ~0.01).
**Critical:** Pin BOTH before AND after normalize — normalize uses the old max if you only pin after.

## 2026-03-09 - Score tuning: five iterations to effects + bring-in/take-out

### Volume control belongs to the composer, not readings
Five iterations converged on: only the `energy` reading sets category volumes. All other readings shape music through effects (continuous filter tracking) and bring-in/take-out (mute/restore on enter/exit). Volume manipulation from multiple readings creates mud — they fight each other for the same channels.

### Per-category weight tracking prevents blending bugs
Global `totalWeight` in volume blending drags unmentioned categories to silence. When a fader mentions 2 of 7 categories, the other 5 get weighted toward quietVolumes (-50dB). Fix: track `catWeights[cat]` per category. Faders only contribute to categories they explicitly mention. Energy fills all unmentioned ones as the base mix.

### Filter direction matters: min is default, max is full-effect
`set_effect` with `min: 400, max: 5000` means at full reading strength, filter is at 5000Hz — the DEFAULT. No audible change. For darkening effects (compact, grounded), use `min: 5000, max: 300` so full activation = 300Hz = very muffled.

### Continuous effects need reset on reading deactivate
Without explicit reset, filters stick at their last position when a reading turns off. Added `_resetContinuousEffect()` that snaps all set_effect params back to `min` (the "default / no-effect" end of the range) on the falling edge.

### Sweep conflict tracking prevents effect jitter
Edge `filter_sweep` and continuous `set_effect` fighting over the same filter = audible jitter. Track `_sweepActive[category] = Tone.now() + duration`. `setFilterFrequency` yields while a sweep is active.

### Effects + mute/restore is the right vocabulary for readings
The progression: all-volume → sculpted-volume → filters-only → effects+mute/restore. Each iteration was more expressive and less muddy. The final vocabulary: effects (continuous filter modulation tracking reading value), bring-in (restore on enter), take-out (mute on exit), draws (weighted random pool on edge). This maps cleanly to Ralf's intent system.

### Control first, then indeterminacy, then arc
After dance testing, the system still doesn't feel responsive enough. The missing foundation is **deterministic, obvious control**: arms up → something unmistakable happens (and keeps happening while up). Ball → something unmistakable (and keeps happening while curled). Stomp → something. First make it feel like an instrument with clear cause-and-effect. THEN add weighted pools for variety. THEN layer the arc on top for journey. Building indeterminacy before control is backwards — you can't feel surprise if you don't first feel agency.
