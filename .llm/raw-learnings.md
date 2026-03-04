# Raw Learnings

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
