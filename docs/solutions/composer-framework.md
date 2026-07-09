# Composer Framework: How to Compose for Song Space / Ralf

Status: Emerging concept (2026-03-04)
Source: Planning session for "Inhabitable Songs" feature

## The Core Idea

A **score** is the complete definition of an interactive musical experience. It tells the system what sounds are available, how they're organized in time, and how a dancer's body can influence them. The composer provides the music and temporal structure. The interaction designer provides the body-to-music bindings. The dancer brings it to life.

## Three Roles, Three Layers

| Role | Provides | Works with |
|------|----------|------------|
| **Composer** | Loops organized by category + section, plus an arc (temporal journey) | Music production tools (Ableton, etc.) |
| **Interaction Designer** | Readings (body interpretations), mappings (continuous), triggers (edge-triggered moments) | Score config |
| **Dancer** | Movement | Their body |

Each role works independently. A composer doesn't need to know about body tracking. An interaction designer doesn't need to produce music. A dancer doesn't configure anything.

## The Composer's Deliverables

### 1. Categories (the palette)

7 functional roles that loops fill. Categories can be independently mixed by the system.

| Category | Role | Evocation | Constraint |
|----------|------|-----------|------------|
| `texture` | Always-on ambient bed | The room tone — what you hear before anything happens | Must sound good alone for up to 50s |
| `harmonic_bed` | Sustained harmonic content | Warmth, pads, drones | Should layer with everything |
| `bass` | Low-end foundation | Sub, bass line | Locked to groove rhythmically |
| `foundation` | Rhythmic foundation | Basic pulse, simple beat | Minimal — the skeleton of rhythm |
| `groove` | Rhythmic energy | Full drums, percussion | The thing that makes you move |
| `hook` | Melodic feature | The part you hum | Should stand out when solo'd |
| `accent` | Punctuation, ear candy | Fills, stabs, FX | Sparse — moments, not continuous |

### 2. Sections (the journey)

Each category needs variants for different emotional phases of the song:

| Section | Emotional arc | Duration range | Notes |
|---------|--------------|----------------|-------|
| `intro` | Invitation, atmosphere | 40-50s | Sparse, inviting |
| `verse` | Building, establishing | 60-80s | Adding layers |
| `chorus` | Full expression, peak | 50-65s | Everything available |
| `bridge` | Stripped back, breath | 25-35s | Dramatic reduction |
| `outro` | Resolution, release | 50-65s | Gentle landing |

Deliverable: a **grid** of up to 7 categories × 5 sections = 35 loops. Not all cells need filling.

### 3. The Arc (temporal structure)

The arc defines which categories are available in each phase and how long each phase lasts:

```
AWAIT     → [texture]                          — the room before anyone enters
EMERGE    → [texture, bass]                    — something stirs
BUILD     → [texture, bass, foundation, harmonic_bed]  — we're in it
PEAK      → [everything]                       — full expression
BREAKDOWN → [texture, harmonic_bed]            — breathe
RESOLVE   → [texture, bass, foundation, harmonic_bed, groove, hook] — gentle landing
```

The arc is a default. Composers can customize: add phases, remove them, reorder, create two peaks, extend the breakdown. The arc is data, not code.

### 4. The Contract

- All loops at the same BPM, quantized to bar boundaries
- Each loop must work musically when layered with any other loop in its section
- Categories fade in/out independently — they must sound good alone and together
- The system decides *when* and *how loud*. The composer decides *what*.

## How This Maps to Ralf

| Song Space concept | Ralf equivalent |
|-------------------|-----------------|
| Score | Scene (+ new temporal layer) |
| Categories | Track groups in translator |
| Arc phases | **Scene sequence** — ordered scenes with transition rules (NEW for Ralf) |
| Readings | Readings (identical format) |
| Continuous mappings | Continuous-mode intents |
| Edge triggers | Edge-triggered intents with on_exit |
| Trigger actions | Actions via translator |

**The arc is the genuinely new concept for Ralf.**
 Ralf scenes are currently stateless/reactive. The arc adds temporal composition: "given where we are in the piece, what's available?" This is what makes an experience feel like a composed piece rather than an infinite jam.

**The score is now authored as JSON** (as of #62). Composers and interaction
designers write the two halves of a score document independently, a validating
loader turns it into the runtime object, and the format is the concrete transfer
artifact into Ralf's scene system. The full schema, the engine-enum-vs-string
boundary decisions, the legacy-concept rulings (`_invertInMix` → `invert`;
`quietVolumes` dropped), and the detailed Ralf mapping + divergence table live in
[`score-schema.md`](./score-schema.md). Key divergence to remember when
transferring: the score *structure* is shared, but the *registries* (qualities,
categories, actions) are adapter-local and deliberately differ between song-space,
Ralf, and the standalone Blender — so they are validated per-adapter, never frozen
into the portable schema.

## The Interaction Designer's Deliverables

The interaction designer authors **readings** (body state detection) and **intents** (what each body state does to the music). The primitives are fully reusable — any score can combine them differently.

### The Four-Layer Pipeline

```
Qualities → Readings → Intents → Actions
(measurement)  (interpretation)  (desire)    (execution)
```

- **Qualities** are raw body measurements (velocity, contraction, armsRaised...) — the input contract
- **Readings** are named body states built from quality combinations + gates (energy, flowing, grounded...)
- **Intents** are musical desires — what a reading wants the music to do
- **Actions** are output commands (set_volumes, mute, solo, filter_sweep...) — the output contract

Each layer only talks to its neighbors. Readings never reference categories. Actions never reference qualities.

### Intent Authoring: The Sculpt Pattern

A lesson learned from iteration: when every reading sets all 7 category volumes, multiple active readings blend into mud. The sculpt pattern avoids this:

| Principle | Rule |
|-----------|------|
| **One canvas** | A single reading (energy) paints the whole mix — all 7 categories scaled by velocity |
| **Others sculpt** | Every other continuous intent touches only 2-4 categories: boost its lane, cut the opposite |
| **Moments are edges** | Readings about dramatic states (stillness, suspension, explosive) use edge actions only — mute/solo/restore/filter_sweep — no continuous volume competition |

This produces clear sonic identity per body state because sculpt readings operate on *different channels*:

| Reading pair | Boost lane | Cut lane |
|-------------|-----------|---------|
| flowing / stepping | pads / rhythm | rhythm / pads |
| grounded / wide | low end / harmonic bed | highs / groove |
| compact / wide | groove / harmonic bed | harmonic bed / groove |

**The sculpt pattern is a compositional convention, not a system constraint.** The runtime supports any intent shape — a future score could use full 7-category blends if that serves the music. But sculpting produces better results by default because it prevents channel contention between simultaneous readings.

### Reading Behavior Patterns

Three patterns compose freely on a single reading:

| Pattern | Config | Behavior |
|---------|--------|----------|
| **Instantaneous** | (default) | Value snaps to mix output when gate opens |
| **Accumulating** | `rampSeconds: N` | Value grows from 0 → full over N seconds while gate stays open |
| **Edge-triggered** | `intents[].after: N` | Fires action after N seconds of sustained gate |

Example: stillness uses all three — instantaneous detection, accumulating ramp (3s to full strength), edge intents at 2s and 5s for progressive stripping.

### Reading Arbitration

Several readings can be active at once, and their intents can touch the same
categories in the same frame or across frames. Left unmanaged, overlapping
readings clobber each other's mute state (the "first action to touch a category
wins" bug, #54). The score vocabulary has two declarative concepts that resolve
this. Both live in the runtime (`runtime.js`), so they are output-agnostic — no
audio-specific state carries the arbitration.

**1. `exclusiveGroup` + `priority` on a reading (reading-level).**

```js
{ id: 'suspended', exclusiveGroup: 'stillness', priority: 3, ... }
```

Readings that name the same `exclusiveGroup` describe one family of mutually
overlapping body states — e.g. the stillness family (stillness / melting /
suspended), which all gate on low velocity and can open together when the dancer
stands still. Each frame, only the highest-`priority` **active** member drives the
music; every other member is **suppressed** — it fires no intents and no
`on_exit`. Priority orders least- to most-specific gesture (stillness `1` <
melting `2` < suspended `3`).

This fixes two things at once:
- A suppressed member's release can never undo the winner's mutes while the
  winner is still active (the "global exit undoes an active reading" failure).
- Overlapping low-velocity gates no longer stack their edge intents into mud —
  the dancer is in exactly one state within the family.

**2. Per-frame action arbiter (action-level).**

`mute` / `restore` / `solo` actions do not hit the output engine immediately.
They buffer for the frame, then resolve per category by two rules:
- **Instant beats quantized.** If any unquantized action (`quantize: false`)
  targets a category this frame, the quantized ones for it are dropped — only the
  instant op is issued, with no next-bar ramp scheduled. This lets a later
  reading's exit-slam (`energy_slam`, `quantize: false`) win over an earlier
  reading's quantized bring-in restore that touched the same category.
- **Restore beats mute** within the same timing class — bringing sound in wins
  over taking it out when a category is contested.

The two concepts are complementary: `exclusiveGroup` prevents cross-frame
overlap between related states; the arbiter resolves same-frame conflicts between
unrelated readings during a transition. Both are JSON-expressible and transfer to
Ralf's scene system.

## Evolution Path

| Stage | System | Composer input | Interaction design |
|-------|--------|---------------|-------------------|
| **Stage 1 (current)** | Song Space auto-chops any song | None — system decides | Hardcoded readings + mappings |
| **Stage 2 (this plan)** | Song Space with score config | Could hand-author loops for the grid | Config-driven (experience config) |
| **Stage 3 (future)** | Ralf with composer workflow | Works in Ableton, assigns clips to categories, designs arc | Full scene authoring |

## Open Questions

- How does a composer preview their work? (Reference mixes showing what each reading sounds like)
- Should the arc be per-song or per-experience? (A song could have multiple arcs)
- How much arc customization is too much? (Complexity budget)
- What's the handoff format? (JSON config? Ableton project template? Folder structure?)
