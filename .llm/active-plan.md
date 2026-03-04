# Active Plan: Inhabitable Songs
Last updated: 2026-03-04 (issues #1-6 complete)

## Problem Statement
Song Space works but doesn't teach visitors what it responds to — new users see a webcam and hear music but don't discover the cause-and-effect relationship between their body and the song.

## Solution
Add edge-triggered dramatic moments and a declarative **score** (experience config) on top of the existing continuous mapping, default to arc mode so every session feels like a composed song journey, and simplify onboarding to: pick a song → see yourself → move to begin.

## Bigger Picture: The Composer Framework
This plan is Stage 2 of the composer framework (see `docs/solutions/composer-framework.md`). A **score** bundles everything needed for an interactive musical experience: the arc (temporal journey), categories (the palette), readings (body interpretations), mappings (continuous bindings), and triggers (edge-triggered moments). The composer provides music + arc. The interaction designer provides bindings. The dancer provides movement. This plan makes the score explicit as config, setting up the framework for Ralf integration and future composer collaboration.

## Out of Scope
- Visual design refresh (separate track after interaction model is solid)
- User-uploaded songs / custom song processing
- Two-body relational interactions (already works, not changing)
- Meta-loops / section rewinding
- User-facing config editor / programming interface
- Ralf translator integration (inform the design, don't build the bridge)

## User Stories

### MVP
- **S1.** As a visitor, I want the song to start when I move in front of my webcam, so that I immediately understand my body controls the music.
- **S2.** As a dancer, I want the song to progress through sections on its own, so that it feels like a real song journey, not a loop machine.
- **S3.** As a dancer, I want drums to drop out when I stop moving, so that I discover cause-and-effect.
- **S4.** As a dancer, I want the music to slam back in when I move after being still, so the response feels immediate and exciting.
- **S5.** As a dancer, I want sustained energy to prolong the current section, so I feel like I can push and pull the journey.
- **S6.** As a dancer, I want my movement quality (flowing, erratic, reaching) to shape which layers are prominent, so different ways of moving create different textures.
- **S7.** As a visitor, I want to pick a song and start immediately without configuring modes, so there's no friction.
- **S8.** As a future composer/interaction designer, I want the experience defined as data (not code), so I can create new experiences by editing config.

### Later
- **L1.** As two dancers, I want cooperation/opposition to affect the music (already works, refine later).
- **L2.** As a power user, I want a debug overlay showing readings and qualities.
- **L3.** As a creator, I want to upload my own song to create a new space.
- **L4.** As a dancer, I want to rewind/restart sections to create meta-loops.
- **L5.** As a visitor, I want an atmospheric, inviting visual design.

## Features

### F1: Zero-Config Onboarding Flow
Stories: S1, S7
Acceptance criteria:
- [ ] Selecting a song auto-starts webcam (no mode dropdown in default UI)
- [ ] User sees themselves on screen with a subtle prompt to move
- [ ] AWAIT phase: soft texture plays, movement triggers the song
- [ ] No Play button or mode selector needed for the default path
- [ ] Developer/debug mode still accessible (hidden toggle or URL param)

### F2: Living Arc (Autonomous Song Journey)
Stories: S2, S5
Acceptance criteria:
- [ ] Arc is the default and only user-facing mode
- [ ] Arc progresses through phases automatically even without interaction
- [ ] Engagement stretches current phase, low engagement compresses it
- [ ] Song ends naturally after final phase + fade
- [ ] Arc config is data (part of experience config), not hardcoded

### F3: Edge Trigger System
Stories: S3, S4
Acceptance criteria:
- [ ] Declarative trigger definitions in experience config
- [ ] **Stillness onset** (~2s): groove/drums drop out
- [ ] **Deep stillness** (~5s): everything drops to texture-only
- [ ] **Movement burst** (exit stillness): energy restores sharply
- [ ] Edge detection uses hysteresis (no flickering near thresholds)
- [ ] Triggers respect arc phase gating (don't unmute categories the arc hasn't introduced yet)
- [ ] System evaluates trigger configs generically (not hardcoded if-statements)

### F4: Continuous Body-Music Mapping (exists, extract to config)
Stories: S6
Acceptance criteria:
- [ ] Flowing → harmonic/smooth layers prominent
- [ ] Erratic → groove/accent layers prominent
- [ ] Reaching → hooks and open textures
- [ ] Stillness → minimal (texture, quiet harmonic bed)
- [ ] Mapping table lives in experience config
- [ ] Works alongside arc phase gating

### F5: Score Config (the composer/interaction designer interface)
Stories: S8
Acceptance criteria:
- [ ] Single "score" config object bundles: arc, readings, mappings, triggers
- [ ] Default score works for all library songs
- [ ] Each song in library could optionally ship its own score (future, but structure supports it)
- [ ] Score shape is documented (references `docs/solutions/composer-framework.md`)
- [ ] Score is plain JS object (or JSON-compatible) — no classes, no code in config
- [ ] Naming convention: "score" in user-facing concepts, "experience config" or `DEFAULT_SCORE` in code

## Domain Model

No database. All state is in-browser, per-session. Key data structures:

### ExperienceConfig
The central config object. Plain data, no behavior.
```
{
  arc: ArcConfig,
  readings: ReadingConfig[],
  mappings: MappingTable,
  triggers: TriggerConfig[]
}
```

### ArcConfig (exists as DEFAULT_ARC, extract)
```
{
  phases: [{ id, categories, duration: [min, max] | null, trigger? }],
  sectionMap: { phaseId: sectionName }
}
```

### ReadingConfig (exists as DEFAULT_READINGS, extract)
```
{
  id, mix: { quality: weight },
  gate: { quality: { above?, below? } },
  _invertInMix?: { quality: weight }
}
```

### MappingTable (exists as VOLUME_MAP, extract)
```
{ readingId: { category: dB } }
```

### TriggerConfig (NEW)
```
{
  id: string,
  on: readingId,           // which reading to watch
  edge: 'enter' | 'exit', // rising or falling edge
  after?: seconds,         // sustain duration before firing (optional)
  action: TriggerAction    // what to do
}
```

### TriggerAction (NEW)
```
{
  mute?: category[],     // mute specific categories
  solo?: category[],     // solo specific categories (mute everything else)
  restore?: boolean,     // restore to mapping-driven levels
  rampTime?: seconds     // transition speed (default: sharp for restore, smooth for mute)
}
```

## Key Modules

### ExperienceConfig (new)
- **Interface:** `DEFAULT_EXPERIENCE` object exported from `experience.js`
- **Hides:** The bundling of arc + readings + mappings + triggers into one coherent definition
- **Testable in isolation:** Yes — it's pure data, can be validated structurally
- **Ralf connection:** Maps to a simplified Scene config. Arc is the new concept Ralf doesn't have yet.

### ArcEngine (exists, refactor)
- **Interface:** `update(dt, velocity)` → advances phases; `getCurrentPhase()` → current state
- **Hides:** Engagement tracking, phase duration scaling, phase transitions
- **Change:** Read config from ExperienceConfig instead of module-level constant
- **Testable in isolation:** Yes — feed it dt + velocity, assert phase transitions

### TriggerEngine (new — the key deep module)
- **Interface:** `update(readings)` → evaluates all triggers, returns list of actions to execute
- **Hides:** Edge detection state, sustain timers, hysteresis, interaction with arc phase gating
- **Design:** Stateful — tracks per-trigger edge state and sustain timers. Evaluates declarative trigger configs. Returns actions but does NOT execute them (caller applies to audio engine).
- **Testable in isolation:** Yes — feed it readings sequences, assert which actions fire when
- **Ralf connection:** Simplified version of Ralf's intent resolution + edge state tracking

### ReadingsEngine (exists, no change)
- **Interface:** `update(qualities)` → `[{ id, value, active }]`
- **Hides:** Weighted mixing, hysteresis gating, smoothing
- **Change:** Accept config from ExperienceConfig at construction

### MappingEngine (exists as function, minor refactor)
- **Interface:** `applyMapping(readings, engine, allowedCategories, mappingTable)`
- **Hides:** Volume blending math, baseline handling, phase gating
- **Change:** Accept mapping table as parameter instead of module-level constant

### AudioEngine (exists, minor additions)
- **Interface:** `setCategoryVolume(cat, dB)`, `muteCategory(cat)`, `restoreCategory(cat)`
- **Change:** Add `muteCategory` and `restoreCategory` for trigger actions (sharp transitions vs smooth ramps)
- **Hides:** Tone.js loop management, transport sync, volume ramping

### App Orchestrator (exists as app.js, simplify)
- **Interface:** Wires everything together. The only file that knows about all modules.
- **Change:** Remove mode switching. Default to arc. Wire trigger engine into detection loop.
- **Simplification target:** app.js currently has mode logic, skeleton drawing, debug panel, arc handlers all mixed together. Goal: app.js becomes ~100 lines of wiring, delegates everything.

## Polishing Requirements
- [ ] Edge triggers feel musical (test by dancing — does the drop feel intentional or glitchy?)
- [ ] Webcam permission denial handled gracefully (message, not crash)
- [ ] Song loading failures show clear feedback
- [ ] Arc completion feels like an ending (fade is satisfying, not abrupt)
- [ ] No visible config/developer UI in default experience (debug behind toggle)
- [ ] Triggers respect arc — don't unmute drums during AWAIT phase

## Validation

| Story | Feature | Module | Config |
|-------|---------|--------|--------|
| S1 (move to start) | F1 | App Orchestrator, ArcEngine (AWAIT) | arc.phases[0].trigger |
| S2 (song journey) | F2 | ArcEngine | arc.phases, arc.sectionMap |
| S3 (drums drop) | F3 | TriggerEngine | triggers[0]: stillness enter |
| S4 (energy slam) | F3 | TriggerEngine | triggers[2]: stillness exit |
| S5 (stretch section) | F2 | ArcEngine | arc.phases[].duration |
| S6 (quality → texture) | F4 | MappingEngine, ReadingsEngine | mappings, readings |
| S7 (no config) | F1 | App Orchestrator | — |
| S8 (data not code) | F5 | ExperienceConfig | the whole config |

All MVP stories have supporting features, modules, and config paths. ✓
No modules exist without a supporting story. ✓
TriggerEngine is the only genuinely new module. ✓

## Implementation Notes

### Ralf Transferability
- **ExperienceConfig** → simplified Ralf Scene (readings + intents + actions, minus translator)
- **ArcConfig** → NEW concept for Ralf: temporal composition layer (scene sequences with transition rules)
- **TriggerConfig** → maps to Ralf's edge-triggered intents with on_exit
- **MappingTable** → maps to Ralf's continuous-mode intents
- The arc is the genuinely new idea. Ralf scenes are stateless/reactive. The arc adds: "given where we are in the piece, what's available?"

### Build Order (dependency-driven)
1. **#1 — F5: Score Config** — ✅ PR #8 merged. `frontend/js/score.js` created.
2. **#2 — F4: Mapping refactor** — ✅ PR #9. Pure function, no module-level constants.
3. **#3 — F2: Arc refactor** — ✅ PR #9. Requires explicit config, no default.
4. **#4 — AudioEngine additions** — ✅ PR #9. muteCategory/restoreCategory/isTriggerMuted added.
5. **#5 — F3: TriggerEngine** — ✅ PR #10. 24 tests passing. Declarative trigger evaluation.
6. **#6 — F3: Wire + tune triggers** — ✅ PR #11. TriggerEngine wired into detection loop, applyTriggerActions helper (15 tests). Tuning deferred to manual testing.
7. **#7 — F1: Zero-config onboarding** — simplify app.js, remove modes (depends on all above)

### What to spike first
If the trigger *feel* is uncertain, spike F3 with one hardcoded trigger before building the full declarative system. Validate the timing feels musical, then generalize.

## Next Step
Run `/issues` to decompose into GitHub issues.
