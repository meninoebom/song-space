# Adapter Architecture

How the Ralf runtime connects to any input sensor and any musical output.

## Three Parts

```
Input Adapter  →  Brain  →  Output Adapter
(sensor-specific)  (agnostic)  (output-specific)
```

The **brain** is the part that never changes between installations. It takes qualities in, applies a score, and emits actions out. The **adapters** are thin translations at the edges — one per sensor type, one per output target.

## Input Contract: Qualities

Any input adapter must produce this shape every frame (~30fps):

```js
{
  velocity:    0.0-1.0,  // overall movement speed
  impulse:     0.0-1.0,  // sudden velocity burst (spike-and-decay)
  coherence:   0.0-1.0,  // left/right sides moving together
  contraction: 0.0-1.0,  // body gathered inward vs expanded
  verticality: 0.0-1.0,  // upright vs low/crouched
  wristSpread: 0.0-1.0,  // arms spread wide vs narrow
  armsRaised:  0.0-1.0,  // hands above shoulders
  legBend:     0.0-1.0,  // knee bend (high = bent)
  headTilt:    0.0-1.0,  // head offset from center
  jump:        0.0-1.0,  // vertical launch (spike-and-decay)
}
```

All values normalized 0-1. The adapter handles all sensor-specific work: coordinate systems, noise filtering, scale normalization. The brain never sees raw sensor data.

### Known Input Adapters

| Adapter | Sensor | Status |
|---------|--------|--------|
| `MovementDetector` | MediaPipe Pose (webcam) | Production — Song Space |
| Kinect adapter | Azure Kinect / Kinect v2 | Future |
| Body suit adapter | Perception Neuron, Xsens, etc. | Future |
| LiDAR adapter | Intel RealSense, etc. | Future |

### Quality Concepts Are Portable

The 10 quality names come from dance practice and Laban Movement Analysis — not from any sensor. "Velocity" means the same thing whether computed from 2D webcam landmarks or 3D motion capture joints. Each adapter computes the same concepts differently:

- **MediaPipe**: 2D normalized coordinates, torso-length normalization, AdaptiveRange scaling
- **Kinect/suit**: 3D world coordinates, absolute distances, potentially no AdaptiveRange needed
- **LiDAR**: Point cloud → skeleton extraction → same joint-based computation

The quality vocabulary may grow over time (e.g., `lateralOscillation`, `pathCurvature`). New qualities are added to the contract, and each adapter implements them as available. Readings that reference unavailable qualities gracefully degrade (missing quality defaults to 0).

## The Brain: Score → Readings → Actions

The brain is:

1. **ReadingsEngine** (~100 lines) — weighted quality mixes with gating, hysteresis, and optional time-based accumulation (`rampSeconds`)
2. **Ralf runtime** — evaluates intents (continuous or edge-triggered), draws from action pools
3. **Score config** (data, not code) — defines readings, intents, and action pools

The score is the creative content — what a composer/interaction designer authors. The brain code is thin infrastructure that interprets the score. Most of the system's behavior lives in the score.

### Reading Behavior Patterns

| Pattern | Config | Behavior |
|---------|--------|----------|
| Instantaneous | (default) | Value snaps to mix on gate open |
| Accumulating | `rampSeconds: N` | Value grows 0→full over N seconds |
| Edge-triggered | `intents: [{ after: N }]` | Fires one-time action after sustained hold |

These compose: a reading can be accumulating AND edge-triggered.

## Output Contract: Actions

The brain emits action commands. Any output adapter must handle these:

```js
// Continuous — called every frame with active readings
{ action: 'set_volumes', args: { bass: -6, groove: -10, texture: -4, ... } }

// Edge-triggered — called once when conditions are met
{ action: 'mute',         args: { categories: ['groove', 'bass'], rampTime: 0.3 } }
{ action: 'solo',         args: { categories: ['texture'], rampTime: 0.5 } }
{ action: 'restore',      args: { rampTime: 0.05 } }
{ action: 'oneshot',      args: { category: 'accent', volumeDb: -2 } }
{ action: 'filter_sweep', args: { category: 'groove', from: 500, to: 10000, duration: 1 } }
```

Volume values are in dB (0 = full, -50 = near-silent). Categories are abstract roles, not specific instruments — the output adapter maps them to whatever is available.

### Known Output Adapters

| Adapter | Target | Status |
|---------|--------|--------|
| `AudioEngine` | Tone.js (browser) | Production — Song Space |
| Ableton adapter | Max for Live via OSC/MIDI | Future |
| OSC adapter | Any OSC-compatible software | Future |
| Score renderer | Visual notation for live musicians | Future |
| AI music adapter | Real-time generative music system | Future |

### Translating Actions to Different Outputs

The action vocabulary is intentionally high-level. Translation examples:

| Action | Tone.js | Ableton/MIDI | Live musician score |
|--------|---------|-------------|-------------------|
| `set_volumes` | `player.volume.value = dB` | MIDI CC per track | Dynamic marking change |
| `mute` | Ramp volume to -Infinity | Track mute | "tacet" marking |
| `filter_sweep` | BiquadFilter automation | Auto-filter device | Instruction: "brighten" |
| `oneshot` | Trigger one-shot sample | Clip launch | Cue: "accent here" |

## The Lego Principle

A new installation or performance requires:
1. **One input adapter** for the available sensor
2. **One output adapter** for the available music system
3. **A score** — either reuse an existing one or author a new one

The brain code ships unchanged. The score is portable across all adapter combinations. A score designed for webcam + Tone.js works identically with Kinect + Ableton — the body states and musical intentions are the same, only the edges translate differently.

## Current Implementation (Song Space)

```
MediaPipe Pose (webcam)
    ↓
MovementDetector          ← Input adapter (frontend/js/movement.js)
    ↓
{ velocity: 0.4, ... }   ← Qualities contract
    ↓
ReadingsEngine            ← Brain (frontend/js/readings.js)
    + DEFAULT_SCORE       ← Score config (frontend/js/score.js)
    ↓
[{ action: 'set_volumes', args: {...} }]  ← Actions contract
    ↓
AudioEngine               ← Output adapter (frontend/js/audio-engine.js)
    ↓
Tone.js (browser audio)
```

## Open Questions

- **Quality vocabulary growth**: As new input adapters provide richer data (3D, finger tracking), new qualities become possible. How to version the quality contract without breaking existing scores?
- **Bidirectional adapters**: Some outputs (AI music systems) may want to feed back into the brain — e.g., "the music just reached a climax, influence the arc." This is beyond the current one-directional flow.
- **Multi-body**: The current relational qualities (synchrony, contrast) assume exactly 2 bodies. Installations may have 5-50.
