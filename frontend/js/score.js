/**
 * Score — the complete definition of an interactive Song Space experience.
 *
 * A score bundles everything the system needs: the arc (temporal journey),
 * readings (body interpretations), mappings (continuous bindings), and
 * triggers (edge-triggered dramatic moments).
 *
 * Three roles provide the score's content:
 *   - Composer: arc + categories (what sounds are available and when)
 *   - Interaction designer: readings + mappings + triggers (how body shapes music)
 *   - Dancer: movement (brings it to life)
 *
 * This is a simplified version of Ralf's Scene config. The arc is the new
 * concept that Ralf doesn't have yet — temporal composition on top of
 * reactive interaction.
 *
 * See docs/solutions/composer-framework.md for the full concept.
 */

export const DEFAULT_SCORE = {

  // --- Composer layer: the temporal journey ---

  arc: {
    phases: [
      { id: 'await',     categories: ['texture'],                                                                   duration: null, trigger: 'movement' },
      { id: 'emerge',    categories: ['texture', 'bass'],                                                           duration: [25, 35] },
      { id: 'build',     categories: ['texture', 'bass', 'foundation', 'harmonic_bed'],                             duration: [50, 70] },
      { id: 'peak',      categories: ['texture', 'bass', 'foundation', 'harmonic_bed', 'groove', 'hook', 'accent'], duration: [50, 65] },
      { id: 'breakdown', categories: ['texture', 'harmonic_bed'],                                                   duration: [20, 30] },
      { id: 'resolve',   categories: ['texture', 'bass', 'foundation', 'harmonic_bed', 'groove', 'hook'],           duration: [40, 55] },
    ],
    sectionMap: {
      emerge: 'intro',
      build: 'verse',
      peak: 'chorus',
      breakdown: 'bridge',
      resolve: 'outro',
    },
  },

  // --- Interaction designer layer: body interpretation ---

  readings: {
    solo: [
      {
        id: 'flowing',
        mix: { coherence: 0.4, velocity: 0.3, symmetry: 0.3 },
        gate: { velocity: { above: 0.15 }, jerkiness: { below: 0.5 } },
      },
      {
        id: 'agitated',
        mix: { jerkiness: 0.45, velocity: 0.25 },
        gate: { jerkiness: { above: 0.3 } },
        _invertInMix: { coherence: 0.3 },
      },
      {
        id: 'stillness',
        mix: { contraction: 0.4, verticality: 0.3 },
        gate: { velocity: { below: 0.12 } },
        _invertInMix: { velocity: 0.3 },
      },
      {
        id: 'reaching',
        mix: { wristSpread: 0.4, velocity: 0.2 },
        gate: { velocity: { above: 0.1 } },
        _invertInMix: { contraction: 0.4 },
      },
      {
        id: 'arms_up',
        mix: { armsRaised: 0.6, handHeight: 0.4 },
        gate: { armsRaised: { above: 0.4 } },
      },
    ],
    relational: [
      {
        id: 'unison',
        mix: { synchrony: 0.6, aggregate_energy: 0.4 },
        gate: { synchrony: { above: 0.55 } },
      },
      {
        id: 'opposition',
        mix: { contrast: 0.6, aggregate_energy: 0.4 },
        gate: { contrast: { above: 0.4 } },
      },
    ],
  },

  // --- Interaction designer layer: body → music bindings ---

  mappings: {
    volumeMap: {
      flowing: {
        harmonic_bed: -6, texture: -8, foundation: -6,
        groove: -10, bass: -8, hook: -14, accent: -30,
      },
      agitated: {
        groove: -4, bass: -4, foundation: -8,
        accent: -6, harmonic_bed: -18, texture: -16, hook: -20,
      },
      stillness: {
        texture: -8, harmonic_bed: -12, bass: -20,
        foundation: -40, groove: -40, hook: -40, accent: -40,
      },
      reaching: {
        hook: -6, harmonic_bed: -6, texture: -10,
        foundation: -10, groove: -12, bass: -10, accent: -14,
      },
      arms_up: {
        hook: -4, harmonic_bed: -4, texture: -6,
        foundation: -8, groove: -8, bass: -8, accent: -10,
      },
      unison: {
        hook: -4, harmonic_bed: -4, texture: -6,
        foundation: -8, groove: -10, bass: -8, accent: -16,
      },
      opposition: {
        groove: -2, accent: -4, bass: -4,
        foundation: -6, harmonic_bed: -14, texture: -14, hook: -16,
      },
    },
    quietVolumes: {
      foundation: -20, groove: -20, bass: -14,
      harmonic_bed: -12, hook: -40, texture: -8, accent: -40,
    },
  },

  // --- Interaction designer layer: edge-triggered moments ---

  triggers: [
    {
      id: 'drums-drop',
      on: 'stillness',
      edge: 'enter',
      after: 2,
      action: { mute: ['groove'], rampTime: 0.3 },
    },
    {
      id: 'strip-down',
      on: 'stillness',
      edge: 'enter',
      after: 5,
      action: { solo: ['texture'], rampTime: 0.5 },
    },
    {
      id: 'energy-slam',
      on: 'stillness',
      edge: 'exit',
      action: { restore: true, rampTime: 0.05 },
    },
    {
      id: 'arms-open-filter',
      on: 'arms_up',
      edge: 'enter',
      action: { filterSweep: { category: 'harmonic_bed', from: 800, to: 5000, duration: 2 } },
    },
    {
      id: 'arms-close-filter',
      on: 'arms_up',
      edge: 'exit',
      action: { filterSweep: { category: 'harmonic_bed', from: 5000, to: 800, duration: 1.5 } },
    },
  ],
};
