/**
 * Score — the complete definition of an interactive Song Space experience.
 *
 * Uses Ralf's Scene config schema: readings define body interpretations,
 * each reading has intents (continuous or edge-triggered), and intents
 * map to pools of weighted action options. The "draw" function selects
 * from pools, introducing non-determinism.
 *
 * Three roles provide the score's content:
 *   - Composer: arc + categories (what sounds are available and when)
 *   - Interaction designer: readings + intents + pools (how body shapes music)
 *   - Dancer: movement (brings it to life)
 *
 * This score is a hand-authored prototype of what a Ralf agent will
 * eventually compose through conversation. Every primitive here —
 * readings, intents, pools, gates, edges — is Ralf's vocabulary for
 * expressing movement-music interactions.
 *
 * The score is ADAPTER-AGNOSTIC. It references qualities by name
 * (see QUALITY_KEYS in constants.js) and emits actions by type
 * (see ACTION_TYPES in constants.js). It works identically regardless
 * of which input sensor produces the qualities or which output system
 * executes the actions. See docs/solutions/adapter-architecture.md.
 *
 * Reading behavior patterns (config fields):
 *   - Instantaneous (default): value snaps to mix when gate opens
 *   - Accumulating (rampSeconds: N): value grows over N seconds
 *   - Edge-triggered (intents with after: N): fires action after N seconds
 *   These compose freely on a single reading.
 */

export const DEFAULT_SCORE = {

  // --- Composer layer: the temporal journey ---

  arc: {
    phases: [
      { id: 'await',     categories: ['texture'],                                                                   duration: null, trigger: 'movement', hint: 'move to begin' },
      { id: 'emerge',    categories: ['texture', 'bass'],                                                           duration: [40, 50], hint: 'slow and deliberate' },
      { id: 'build',     categories: ['texture', 'bass', 'foundation', 'harmonic_bed'],                             duration: [60, 80], hint: 'expand outward' },
      { id: 'peak',      categories: ['texture', 'bass', 'foundation', 'harmonic_bed', 'groove', 'hook', 'accent'], duration: [50, 65], hint: 'full presence' },
      { id: 'breakdown', categories: ['texture', 'harmonic_bed'],                                                   duration: [25, 35], hint: 'find stillness' },
      { id: 'resolve',   categories: ['texture', 'bass', 'foundation', 'harmonic_bed', 'groove', 'hook'],           duration: [50, 65], hint: 'settle and ground' },
    ],
    sectionMap: {
      emerge: 'intro',
      build: 'verse',
      peak: 'chorus',
      breakdown: 'bridge',
      resolve: 'outro',
    },
  },

  // --- Readings: body interpretation → intents ---
  //
  // 11 readings, each a distinct body state with clear musical meaning.
  // See docs/solutions/composer-framework.md for the sculpt pattern:
  // energy paints the whole mix, others sculpt 2-4 categories each,
  // moment readings (stillness, arms_up, suspended, melting, explosive)
  // are edge-only.

  readings: {
    solo: [
      // ENERGY: the foundation — movement drives volume
      // Always active. velocity scales how full the mix sounds.
      // At rest: near silence. Moving hard: everything present.
      {
        id: 'energy',
        mix: { velocity: 1.0 },
        gate: {},
        intents: [{ intent: 'energy_blend', mode: 'continuous' }],
      },

      // STILLNESS: the narrative anchor — absence creates drama
      // Edge-only: layers strip away over time. Exit slams back.
      // No continuous blend — doesn't fight energy for volume control.
      {
        id: 'stillness',
        rampSeconds: 3,
        mix: { contraction: 0.4, verticality: 0.3 },
        gate: { velocity: { below: 0.12 } },
        _invertInMix: { velocity: 0.3 },
        intents: [
          { intent: 'drums_drop', mode: 'edge', after: 2 },
          { intent: 'strip_down', mode: 'edge', after: 5 },
        ],
        on_exit: ['energy_slam'],
      },

      // ARMS UP: the spatial opening — reach overhead, music blooms
      // Edge-only: filter sweep on entry/exit. The sweep IS the gesture.
      {
        id: 'arms_up',
        mix: { armsRaised: 1.0 },
        gate: { armsRaised: { above: 0.4 } },
        intents: [
          { intent: 'arms_open_filter', mode: 'edge' },
        ],
        on_exit: ['arms_close_filter'],
      },

      // FLOWING: the dreamy state — smooth coherent movement
      // Detected but no continuous volume action — available for arc triggers + moments.
      {
        id: 'flowing',
        mix: { coherence: 0.6, velocity: 0.4 },
        gate: { velocity: { above: 0.15 }, coherence: { above: 0.35 } },
        intents: [],
      },

      // GROUNDED: going underground — low center, bent legs
      // Detected but no continuous volume action — available for arc triggers + moments.
      {
        id: 'grounded',
        mix: { legBend: 0.4, contraction: 0.3 },
        gate: { velocity: { below: 0.3 } },
        _invertInMix: { verticality: 0.3 },
        intents: [],
      },

      // SUSPENDED: held moment at the top — arms high, body still
      // Edge-only: solos pads after 2s ramp. Exit restores.
      {
        id: 'suspended',
        rampSeconds: 2,
        mix: { armsRaised: 0.5, verticality: 0.3 },
        gate: { armsRaised: { above: 0.4 }, velocity: { below: 0.25 } },
        _invertInMix: { velocity: 0.2 },
        intents: [
          { intent: 'suspended_solo', mode: 'edge', after: 2 },
        ],
        on_exit: ['suspended_release'],
      },

      // MELTING: gradual yielding to gravity — sinking, pouring down
      // Edge-only: strips rhythm away after 3s ramp. Exit restores gently.
      {
        id: 'melting',
        rampSeconds: 4,
        mix: { contraction: 0.5 },
        gate: { velocity: { below: 0.2 } },
        _invertInMix: { verticality: 0.5 },
        intents: [
          { intent: 'melting_strip', mode: 'edge', after: 3 },
        ],
        on_exit: ['melting_release'],
      },

      // WIDE: body expands outward — arms spread, open gesture
      // Detected but no continuous volume action — available for arc triggers + moments.
      {
        id: 'wide',
        mix: { wristSpread: 0.6 },
        gate: { wristSpread: { above: 0.5 }, contraction: { below: 0.4 } },
        _invertInMix: { contraction: 0.4 },
        intents: [],
      },

      // COMPACT: body gathers inward — coiled, compressed energy
      // Detected but no continuous volume action — available for arc triggers + moments.
      {
        id: 'compact',
        mix: { contraction: 0.4, legBend: 0.4 },
        gate: { contraction: { above: 0.5 }, velocity: { above: 0.1 } },
        _invertInMix: { wristSpread: 0.2 },
        intents: [],
      },

      // STEPPING: footwork drives groove — stomps, steps, kicks
      // Detected but no continuous volume action — available for arc triggers + moments.
      {
        id: 'stepping',
        mix: { step: 0.7, velocity: 0.3 },
        gate: { step: { above: 0.2 } },
        intents: [],
      },

      // EXPLOSIVE: the climax impulse — sudden burst of velocity
      // Accent slam + filter sweep. Rewards dramatic shifts.
      {
        id: 'explosive',
        mix: { velocity: 0.4, impulse: 0.6 },
        gate: { velocity: { above: 0.4 }, impulse: { above: 0.3 } },
        intents: [{ intent: 'explosive_slam', mode: 'edge' }],
      },
    ],

    relational: [
      {
        id: 'unison',
        mix: { synchrony: 0.6, aggregate_energy: 0.4 },
        gate: { synchrony: { above: 0.55 } },
        intents: [],
      },
      {
        id: 'opposition',
        mix: { contrast: 0.6, aggregate_energy: 0.4 },
        gate: { contrast: { above: 0.4 } },
        intents: [],
      },
    ],
  },

  // --- Intent pools: each intent maps to weighted action options ---
  //
  // ENERGY-ONLY VOLUME RULE: Only the energy reading sets category volumes.
  // All other readings express themselves through edge actions (mute, solo,
  // restore, filter_sweep, oneshot). This prevents readings from killing
  // energy by silencing channels.
  //
  // Readings without intents (flowing, grounded, stepping, wide, compact,
  // unison, opposition) are still detected — they'll drive arc triggers
  // and moments in the body-driven arc system.
  //
  // Edge intents draw randomly from weighted pools.

  intents: {

    // === CONTINUOUS ===

    // ENERGY: the only volume-setting intent — master fader scaled by velocity
    energy_blend: [
      { action: 'set_volumes', args: { texture: -6, harmonic_bed: -8, bass: -8, foundation: -10, groove: -10, hook: -12, accent: -16 }, weight: 1 },
    ],

    // === EDGE: dramatic moments ===

    // Stillness: progressive stripping over time
    drums_drop: [
      { action: 'mute', args: { categories: ['groove', 'bass'], rampTime: 0.3 }, weight: 3 },
      { action: 'mute', args: { categories: ['groove', 'bass', 'foundation'], rampTime: 0.4 }, weight: 1 },
    ],
    strip_down: [
      { action: 'solo', args: { categories: ['texture'], rampTime: 0.5 }, weight: 3 },
      { action: 'solo', args: { categories: ['texture', 'harmonic_bed'], rampTime: 0.6 }, weight: 1 },
    ],
    energy_slam: [
      { action: 'restore', args: { rampTime: 0.05 }, weight: 3 },
      { action: 'restore', args: { rampTime: 0.15 }, weight: 1 },
    ],

    // Arms up: filter sweep is the gesture
    arms_open_filter: [
      { action: 'filter_sweep', args: { category: 'harmonic_bed', from: 800, to: 5000, duration: 2 }, weight: 1 },
    ],
    arms_close_filter: [
      { action: 'filter_sweep', args: { category: 'harmonic_bed', from: 5000, to: 800, duration: 1.5 }, weight: 1 },
    ],

    // Suspended: solo the atmosphere after holding still with arms up
    suspended_solo: [
      { action: 'solo', args: { categories: ['texture', 'harmonic_bed'], rampTime: 1.0 }, weight: 3 },
      { action: 'solo', args: { categories: ['texture', 'harmonic_bed', 'hook'], rampTime: 1.2 }, weight: 1 },
    ],
    suspended_release: [
      { action: 'restore', args: { rampTime: 0.8 }, weight: 1 },
    ],

    // Melting: gentle strip as you yield to gravity
    melting_strip: [
      { action: 'mute', args: { categories: ['groove', 'foundation'], rampTime: 1.0 }, weight: 3 },
      { action: 'mute', args: { categories: ['groove', 'foundation', 'bass'], rampTime: 1.5 }, weight: 1 },
    ],
    melting_release: [
      { action: 'restore', args: { rampTime: 1.5 }, weight: 1 },
    ],

    // Explosive: dramatic accent + filter sweep
    explosive_slam: [
      { action: 'restore', args: { rampTime: 0.02 }, weight: 3 },
      { action: 'oneshot', args: { category: 'accent', volumeDb: -2 }, weight: 2 },
      { action: 'filter_sweep', args: { category: 'groove', from: 500, to: 10000, duration: 1 }, weight: 1 },
    ],
  },

  // --- Mappings: baseline volumes when no reading is active ---
  // Set very low — the energy reading does all the work at the bottom end.

  mappings: {
    quietVolumes: {
      texture: -20, harmonic_bed: -50, bass: -50,
      foundation: -50, groove: -50, hook: -50, accent: -50,
    },
  },
};
