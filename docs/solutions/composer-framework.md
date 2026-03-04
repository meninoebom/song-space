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

**The arc is the genuinely new concept for Ralf.** Ralf scenes are currently stateless/reactive. The arc adds temporal composition: "given where we are in the piece, what's available?" This is what makes an experience feel like a composed piece rather than an infinite jam.

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
