# Raw Learnings

## 2026-03-04 - Conceptual: Qualities + Gestures → Readings

### The readings layer combines two types of body input
**Insight:** Readings are fed by a mix of **qualities** (continuous 0-1 signals like velocity, coherence, contraction) and **gestures** (impulse detections like clap, jump). Both flow through the same pipeline: movement.js computes them → score.js defines readings as weighted mixes → ReadingsEngine gates and smooths them. This was discovered empirically — clap/jump were implemented as "impulse qualities" (spike + decay) which naturally fit the continuous pipeline.

**Implications for Ralf:**
- The Sense + Combine primitives already handle qualities. Gestures fit the same model if they output 0-1 values.
- DTW gesture recognition (from the Ralf repo) could output impulse qualities the same way — spike on recognition, decay after.
- Per-adapter gesture training could add custom gesture qualities to the pool. A "clap" detected from webcam landmarks vs. from IMU accelerometer data would both output the same impulse quality shape.
- The reading config (`mix` + `gate`) is the abstraction that unifies them — the reading doesn't care whether its inputs are qualities or gestures.

**Open question:** How does trained gesture recognition (DTW) fit? Possibly: adapter-specific training produces gesture detectors, each outputs an impulse quality, those feed into readings like any other quality. The reading layer stays generic.

### Stage directions: not a Ralf concept (yet)
**Decision:** Arc-phase hints (`hint` field in score config) are useful for this specific Song Space project as intro/instructional text, but should NOT be promoted as a composer-facing Ralf concept. Composers annotating arcs with dancer instructions is premature — the arc itself is new enough. Keep hints as project-specific UI, not a framework abstraction.


## 2026-03-04 - Issue #18: Score Tuning Pass

### Empty gates on impulse readings cause always-active state
**Problem:** `clapping` and `jumping` readings had `gate: {}` (empty). Since clap/jump qualities decay exponentially (0.85/frame), the residual value stays above 0 for many frames, making the reading perpetually "active." The meter glows constantly and the trigger fires on every frame.
**Solution:** Add threshold gates: `{ clap: { above: 0.3 } }` and `{ jump: { above: 0.3 } }`. Only real impulse spikes cross the threshold; decay residuals stay below.
**Code ref:** `frontend/js/score.js` (clapping/jumping readings)

### End of Issue Retrospective
**What went well:** Caught the empty-gate bug through config review before manual testing — would have been confusing to debug by dancing.
**What took longer than expected:** Nothing — config-only change.
**Would do differently:** Always add gates for impulse-quality readings. Empty gate = always active.


## 2026-03-04 - Issue #17: Richer Trigger Actions

### triggerOneshot must respect trigger-mute state
**Problem:** `triggerOneshot()` bypassed the `_triggerMuted` check that `setCategoryVolume()` enforces. A oneshot could play through a trigger-muted category.
**Solution:** Add `if (this._triggerMuted[category]) return;` at the top, matching the pattern in `setCategoryVolume()`. Caught in code review.
**Code ref:** `frontend/js/audio-engine.js:triggerOneshot`

### Cancel prior filter scheduled values before sweeping
**Problem:** Calling `sweepFilter()` while a prior sweep is in progress queues a new ramp without canceling the old one, causing stutter.
**Solution:** `filter.frequency.cancelScheduledValues(Tone.now())` before the new `rampTo` calls. Tone.js Parameter objects support this.
**Code ref:** `frontend/js/audio-engine.js:sweepFilter`

### End of Issue Retrospective
**What went well:** Clean TDD — 4 new test cases, all pass first try. Implementation was straightforward since AudioEngine already had the infrastructure.
**What took longer than expected:** Nothing — tight scope, clear acceptance criteria.
**Would do differently:** Nothing. The publicize-private-method + add-new-method pattern was the right approach.


## 2026-03-04 - Issues #13-16: Embodied UX Overhaul

### Impulse qualities via spike + decay pattern
**Problem:** Clap and jump are discrete events, but the readings pipeline is continuous 0-1.
**Solution:** Spike to 1.0 on detection, multiply by 0.85 each frame (exponential decay). Stays in the continuous pipeline — trigger engine's `edge: 'enter'` detects onset. No separate event bus needed.
**Code ref:** `frontend/js/movement.js` (clap/jump sections)

### Jump baseline: compute before pushing current frame
**Problem:** If hipMidY is pushed to the history buffer before computing baseline, a jump contaminates its own baseline (1/60th but still wrong).
**Solution:** Compute baseline from history first, then push current frame. Caught in code review.
**Code ref:** `frontend/js/movement.js` (jump detection)

### Clap false positive prevention
**Problem:** Hands held together (e.g., prayer position) triggers false claps.
**Solution:** Three gates: (1) wrist distance < 0.08 (close), (2) was spread 4 frames ago (> 0.15), (3) velocity history shows movement. The `this._clapValue < 0.3` guard prevents re-firing during decay.
**Code ref:** `frontend/js/movement.js` (clap detection)

### Two-canvas pattern for debug vs production visuals
**Problem:** Skeleton was hidden behind debug flag. Making it always visible would break debug mode.
**Solution:** Two separate canvas elements — `#body-canvas` (large, always on) and `#skeleton-canvas` (debug thumbnail). Same `drawSkeletons()` function, different canvas. Zero entanglement.

### End of Issue Retrospective
**What went well:** Four parallel issues landed cleanly on one branch with separate commits. Impulse quality pattern is elegant.
**What took longer than expected:** Jest wasn't installed — tests were standalone scripts using assert, not Jest. Had to install jest + configure ESM.
**Would do differently:** Add jest as a dev dependency early. The standalone assert-based tests work but aren't discoverable.


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
