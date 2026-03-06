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
  // ReadingsEngine (readings.js) still handles mix + gate + hysteresis.
  // These configs are passed to ReadingsEngine AND used by RalfRuntime for intents.

  readings: {
    solo: [
      {
        id: 'flowing',
        mix: { coherence: 0.4, velocity: 0.3, symmetry: 0.3 },
        gate: { velocity: { above: 0.15 }, jerkiness: { below: 0.5 } },
        intents: [{ intent: 'flowing_blend', mode: 'continuous' }],
      },
      {
        id: 'agitated',
        mix: { jerkiness: 0.45, velocity: 0.25 },
        gate: { jerkiness: { above: 0.3 } },
        _invertInMix: { coherence: 0.3 },
        intents: [{ intent: 'agitated_blend', mode: 'continuous' }],
      },
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
      {
        id: 'reaching',
        mix: { wristSpread: 0.4, velocity: 0.2 },
        gate: { velocity: { above: 0.1 } },
        _invertInMix: { contraction: 0.4 },
        intents: [{ intent: 'reaching_blend', mode: 'continuous' }],
      },
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
      {
        id: 'clapping',
        mix: { clap: 1.0 },
        gate: {},
        intents: [{ intent: 'clap_accent', mode: 'edge' }],
      },
      {
        id: 'jumping',
        mix: { jump: 1.0 },
        gate: {},
        intents: [{ intent: 'jumping_blend', mode: 'continuous' }],
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
    // Continuous blend intents (volume targets)
    flowing_blend: [
      { action: 'set_volumes', args: { harmonic_bed: -6, texture: -8, foundation: -6, groove: -10, bass: -8, hook: -14, accent: -30 }, weight: 3 },
      { action: 'set_volumes', args: { harmonic_bed: -4, texture: -6, foundation: -8, groove: -12, bass: -6, hook: -16, accent: -30 }, weight: 1 },
    ],
    agitated_blend: [
      { action: 'set_volumes', args: { groove: -4, bass: -4, foundation: -8, accent: -6, harmonic_bed: -18, texture: -16, hook: -20 }, weight: 3 },
      { action: 'set_volumes', args: { groove: -2, bass: -6, foundation: -6, accent: -4, harmonic_bed: -20, texture: -18, hook: -22 }, weight: 1 },
    ],
    stillness_blend: [
      { action: 'set_volumes', args: { texture: -8, harmonic_bed: -12, bass: -20, foundation: -40, groove: -40, hook: -40, accent: -40 }, weight: 1 },
    ],
    reaching_blend: [
      { action: 'set_volumes', args: { hook: -6, harmonic_bed: -6, texture: -10, foundation: -10, groove: -12, bass: -10, accent: -14 }, weight: 3 },
      { action: 'set_volumes', args: { hook: -4, harmonic_bed: -8, texture: -8, foundation: -12, groove: -14, bass: -8, accent: -16 }, weight: 1 },
    ],
    arms_up_blend: [
      { action: 'set_volumes', args: { hook: -4, harmonic_bed: -4, texture: -6, foundation: -8, groove: -8, bass: -8, accent: -10 }, weight: 1 },
    ],
    jumping_blend: [
      { action: 'set_volumes', args: { groove: -2, bass: -4, foundation: -4, accent: -6, hook: -8, harmonic_bed: -10, texture: -12 }, weight: 1 },
    ],
    unison_blend: [
      { action: 'set_volumes', args: { hook: -4, harmonic_bed: -4, texture: -6, foundation: -8, groove: -10, bass: -8, accent: -16 }, weight: 1 },
    ],
    opposition_blend: [
      { action: 'set_volumes', args: { groove: -2, accent: -4, bass: -4, foundation: -6, harmonic_bed: -14, texture: -14, hook: -16 }, weight: 1 },
    ],

    // Edge-triggered intents (with non-determinism via weighted pools)
    drums_drop: [
      { action: 'mute', args: { categories: ['groove'], rampTime: 0.3 }, weight: 3 },
      { action: 'mute', args: { categories: ['groove', 'foundation'], rampTime: 0.4 }, weight: 1 },
    ],
    strip_down: [
      { action: 'solo', args: { categories: ['texture'], rampTime: 0.5 }, weight: 3 },
      { action: 'solo', args: { categories: ['texture', 'harmonic_bed'], rampTime: 0.6 }, weight: 1 },
    ],
    energy_slam: [
      { action: 'restore', args: { rampTime: 0.05 }, weight: 3 },
      { action: 'restore', args: { rampTime: 0.15 }, weight: 1 },
    ],
    clap_accent: [
      { action: 'oneshot', args: { category: 'accent', volumeDb: -6 }, weight: 3 },
      { action: 'oneshot', args: { category: 'accent', volumeDb: -3 }, weight: 1 },
    ],
    arms_open_filter: [
      { action: 'filter_sweep', args: { category: 'harmonic_bed', from: 800, to: 5000, duration: 2 }, weight: 1 },
    ],
    arms_close_filter: [
      { action: 'filter_sweep', args: { category: 'harmonic_bed', from: 5000, to: 800, duration: 1.5 }, weight: 1 },
    ],
  },

  // --- Mappings: baseline volumes when no reading is active ---

  mappings: {
    quietVolumes: {
      foundation: -20, groove: -20, bass: -14,
      harmonic_bed: -12, hook: -40, texture: -8, accent: -40,
    },
  },
};
