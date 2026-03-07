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
  // 6 core readings, each a distinct body state with clear musical meaning.
  // Every cut reading (swaying, agitated, reaching, coiled, jumping, clapping)
  // is expressible from the same primitives — a Ralf agent can recreate any
  // of them by recombining qualities, gates, and intents.

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
      // Layers strip away over time. Exit triggers a slam back.
      {
        id: 'stillness',
        mix: { contraction: 0.4, verticality: 0.3 },
        gate: { velocity: { below: 0.12 } },
        _invertInMix: { velocity: 0.3 },
        intents: [
          { intent: 'stillness_blend', mode: 'continuous' },
          { intent: 'drums_drop', mode: 'edge', after: 2 },
          { intent: 'strip_down', mode: 'edge', after: 5 },
        ],
        on_exit: ['energy_slam'],
      },

      // ARMS UP: the spatial opening — reach overhead, music blooms
      // Filter sweep on entry/exit creates a theatrical gesture.
      {
        id: 'arms_up',
        mix: { armsRaised: 1.0 },
        gate: { armsRaised: { above: 0.4 } },
        intents: [
          { intent: 'arms_up_blend', mode: 'continuous' },
          { intent: 'arms_open_filter', mode: 'edge' },
        ],
        on_exit: ['arms_close_filter'],
      },

      // FLOWING: the dreamy state — smooth coherent movement
      // Harmonic layers bloom, groove recedes. Rewards sustained grace.
      {
        id: 'flowing',
        mix: { coherence: 0.5, symmetry: 0.3, velocity: 0.2 },
        gate: { velocity: { above: 0.15 }, jerkiness: { below: 0.5 } },
        intents: [{ intent: 'flowing_blend', mode: 'continuous' }],
      },

      // GROUNDED: going underground — low center, bent legs
      // Bass and foundation swell. Rewards sinking into the floor.
      {
        id: 'grounded',
        mix: { legBend: 0.4, contraction: 0.3 },
        gate: { velocity: { below: 0.3 } },
        _invertInMix: { verticality: 0.3 },
        intents: [{ intent: 'grounded_blend', mode: 'continuous' }],
      },

      // EXPLOSIVE: the climax impulse — sudden burst of velocity
      // Accent slam + filter sweep. Rewards dramatic shifts.
      {
        id: 'explosive',
        mix: { velocity: 0.4, jerkiness: 0.3, movementScale: 0.3 },
        gate: { velocity: { above: 0.6 } },
        intents: [{ intent: 'explosive_slam', mode: 'edge' }],
      },
    ],

    relational: [
      {
        id: 'unison',
        mix: { synchrony: 0.6, aggregate_energy: 0.4 },
        gate: { synchrony: { above: 0.55 } },
        intents: [{ intent: 'unison_blend', mode: 'continuous' }],
      },
      {
        id: 'opposition',
        mix: { contrast: 0.6, aggregate_energy: 0.4 },
        gate: { contrast: { above: 0.4 } },
        intents: [{ intent: 'opposition_blend', mode: 'continuous' }],
      },
    ],
  },

  // --- Intent pools: each intent maps to weighted action options ---
  // Continuous intents use the highest-weight option (deterministic per-frame).
  // Edge intents draw randomly from the pool.

  intents: {
    // ENERGY: master volume — scales all categories with velocity
    // At full velocity, everything is present. This is the "full mix" target.
    energy_blend: [
      { action: 'set_volumes', args: { texture: -6, harmonic_bed: -8, bass: -8, foundation: -10, groove: -10, hook: -12, accent: -16 }, weight: 1 },
    ],

    // STILLNESS: sparse, intimate
    stillness_blend: [
      { action: 'set_volumes', args: { texture: -8, harmonic_bed: -12, bass: -20, foundation: -40, groove: -40, hook: -40, accent: -40 }, weight: 1 },
    ],

    // ARMS UP: bright and open — hooks and harmonics forward
    arms_up_blend: [
      { action: 'set_volumes', args: { hook: -4, harmonic_bed: -4, texture: -6, foundation: -8, groove: -8, bass: -8, accent: -10 }, weight: 1 },
    ],

    // FLOWING: dreamy — harmonic bed and texture forward, groove recedes
    flowing_blend: [
      { action: 'set_volumes', args: { harmonic_bed: -4, texture: -6, foundation: -6, bass: -8, groove: -14, hook: -14, accent: -30 }, weight: 3 },
      { action: 'set_volumes', args: { harmonic_bed: -6, texture: -4, foundation: -8, bass: -6, groove: -16, hook: -16, accent: -30 }, weight: 1 },
    ],

    // GROUNDED: warm and heavy — bass and foundation forward
    grounded_blend: [
      { action: 'set_volumes', args: { bass: -4, foundation: -6, groove: -8, harmonic_bed: -10, texture: -12, hook: -20, accent: -30 }, weight: 3 },
      { action: 'set_volumes', args: { bass: -2, foundation: -4, groove: -6, harmonic_bed: -12, texture: -14, hook: -22, accent: -30 }, weight: 1 },
    ],

    // UNISON: hooks and harmony bloom when moving together
    unison_blend: [
      { action: 'set_volumes', args: { hook: -4, harmonic_bed: -4, texture: -6, foundation: -8, groove: -10, bass: -8, accent: -16 }, weight: 1 },
    ],

    // OPPOSITION: groove and accent forward when contrasting
    opposition_blend: [
      { action: 'set_volumes', args: { groove: -2, accent: -4, bass: -4, foundation: -6, harmonic_bed: -14, texture: -14, hook: -16 }, weight: 1 },
    ],

    // --- Edge-triggered intents ---

    // Stillness edges: progressive stripping
    drums_drop: [
      { action: 'mute', args: { categories: ['groove', 'bass'], rampTime: 0.3 }, weight: 3 },
      { action: 'mute', args: { categories: ['groove', 'bass', 'foundation'], rampTime: 0.4 }, weight: 1 },
    ],
    strip_down: [
      { action: 'solo', args: { categories: ['texture'], rampTime: 0.5 }, weight: 3 },
      { action: 'solo', args: { categories: ['texture', 'harmonic_bed'], rampTime: 0.6 }, weight: 1 },
    ],

    // Stillness exit: energy restores sharply
    energy_slam: [
      { action: 'restore', args: { rampTime: 0.05 }, weight: 3 },
      { action: 'restore', args: { rampTime: 0.15 }, weight: 1 },
    ],

    // Explosive: dramatic accent + filter sweep
    explosive_slam: [
      { action: 'restore', args: { rampTime: 0.02 }, weight: 3 },
      { action: 'oneshot', args: { category: 'accent', volumeDb: -2 }, weight: 2 },
      { action: 'filter_sweep', args: { category: 'groove', from: 500, to: 10000, duration: 1 }, weight: 1 },
    ],

    // Arms up: filter opens on raise, closes on drop
    arms_open_filter: [
      { action: 'filter_sweep', args: { category: 'harmonic_bed', from: 800, to: 5000, duration: 2 }, weight: 1 },
    ],
    arms_close_filter: [
      { action: 'filter_sweep', args: { category: 'harmonic_bed', from: 5000, to: 800, duration: 1.5 }, weight: 1 },
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
