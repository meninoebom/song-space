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

      // ARMS UP: reach overhead → hooks and harmonic bed bloom
      // Fader: hook + harmonic_bed fade in. Filter sweep on entry/exit.
      {
        id: 'arms_up',
        mix: { armsRaised: 1.0 },
        gate: { armsRaised: { above: 0.4 } },
        intents: [
          { intent: 'arms_up_fader', mode: 'continuous' },
          { intent: 'arms_open_filter', mode: 'edge' },
        ],
        on_exit: ['arms_close_filter'],
      },

      // FLOWING: smooth coherent movement → pads and texture forward
      // Fader: harmonic_bed + texture. Filter brightens harmonic bed.
      {
        id: 'flowing',
        mix: { coherence: 0.6, velocity: 0.4 },
        gate: { velocity: { above: 0.15 }, coherence: { above: 0.35 } },
        intents: [
          { intent: 'flowing_fader', mode: 'continuous' },
          { intent: 'flowing_effect', mode: 'continuous' },
        ],
      },

      // GROUNDED: low center, bent legs → bass and foundation forward
      // Fader: bass + foundation. Filter darkens hooks.
      {
        id: 'grounded',
        mix: { legBend: 0.4, contraction: 0.3 },
        gate: { velocity: { below: 0.3 } },
        _invertInMix: { verticality: 0.3 },
        intents: [
          { intent: 'grounded_fader', mode: 'continuous' },
          { intent: 'grounded_effect', mode: 'continuous' },
        ],
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

      // WIDE: arms spread, open gesture → harmonic bed swells
      // Fader: harmonic_bed. Filter opens bright.
      {
        id: 'wide',
        mix: { wristSpread: 0.6 },
        gate: { wristSpread: { above: 0.5 }, contraction: { below: 0.4 } },
        _invertInMix: { contraction: 0.4 },
        intents: [
          { intent: 'wide_fader', mode: 'continuous' },
          { intent: 'wide_effect', mode: 'continuous' },
        ],
      },

      // COMPACT: body gathers inward → bass and groove tighten
      // Fader: bass + groove. Filter closes everything.
      {
        id: 'compact',
        mix: { contraction: 0.4, legBend: 0.4 },
        gate: { contraction: { above: 0.5 }, velocity: { above: 0.1 } },
        _invertInMix: { wristSpread: 0.2 },
        intents: [
          { intent: 'compact_fader', mode: 'continuous' },
          { intent: 'compact_effect', mode: 'continuous' },
        ],
      },

      // STEPPING: footwork → groove and accent punch forward
      // Fader: groove + accent. Filter crisps rhythm.
      {
        id: 'stepping',
        mix: { step: 0.7, velocity: 0.3 },
        gate: { step: { above: 0.2 } },
        intents: [
          { intent: 'stepping_fader', mode: 'continuous' },
          { intent: 'stepping_effect', mode: 'continuous' },
        ],
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
  // Three kinds of intent:
  //   FADERS — focused volume control (1-2 categories per reading, no overlap)
  //   EFFECTS — filter modulation as seasoning (set_effect tracks reading value)
  //   DRAWS — edge actions with weighted pools (non-deterministic)
  //
  // Energy sets the base mix (all 7 categories). Other readings layer
  // faders + effects on top. Edge readings (stillness, suspended, melting,
  // explosive) use dramatic draws (mute/solo/restore/filter_sweep/oneshot).
  //
  // Continuous intents: highest-weight option, every frame.
  // Edge intents: random draw from weighted pool, fires once.

  intents: {

    // === CONTINUOUS: volume + effects ===

    // ENERGY: the only volume-setting intent — master fader scaled by velocity
    energy_blend: [
      { action: 'set_volumes', args: { texture: -6, harmonic_bed: -8, bass: -8, foundation: -10, groove: -10, hook: -12, accent: -16 }, weight: 1 },
    ],

    // --- FADERS: focused volume control, 1-2 categories each ---
    // Each reading owns its lane. No two faders fight over the same category.

    // ARMS UP: hooks and harmonic bed bloom when you reach overhead
    arms_up_fader: [
      { action: 'set_volumes', args: { hook: -4, harmonic_bed: -4 }, weight: 1 },
    ],

    // FLOWING: pads and texture come forward during graceful movement
    flowing_fader: [
      { action: 'set_volumes', args: { harmonic_bed: -4, texture: -4 }, weight: 1 },
    ],

    // GROUNDED: bass and foundation swell when you sink low
    grounded_fader: [
      { action: 'set_volumes', args: { bass: -2, foundation: -4 }, weight: 1 },
    ],

    // WIDE: harmonic bed swells when you spread open
    wide_fader: [
      { action: 'set_volumes', args: { harmonic_bed: -2 }, weight: 1 },
    ],

    // COMPACT: bass and groove tighten when you curl in
    compact_fader: [
      { action: 'set_volumes', args: { bass: -4, groove: -4 }, weight: 1 },
    ],

    // STEPPING: groove and accent punch forward on footwork
    stepping_fader: [
      { action: 'set_volumes', args: { groove: -2, accent: -6 }, weight: 1 },
    ],

    // --- EFFECTS: filter modulation as seasoning on top of faders ---

    // FLOWING: filter opens on harmonic bed — airy, bright, dreamy
    // min = default (no effect at low value), max = wide open at full flowing
    flowing_effect: [
      { action: 'set_effect', args: { effect: 'lowpass', category: 'harmonic_bed', param: 'frequency', min: 5000, max: 16000 }, weight: 1 },
    ],

    // GROUNDED: filter darkens hooks + texture — warm, heavy, underground
    // min = default, max = dark. Full grounded → 300 Hz on hooks (very muffled)
    grounded_effect: [
      { action: 'set_effect', args: { effect: 'lowpass', category: 'hook', param: 'frequency', min: 5000, max: 300 }, weight: 1 },
    ],

    // WIDE: filter opens on harmonic bed — spacious, expansive, bright
    wide_effect: [
      { action: 'set_effect', args: { effect: 'lowpass', category: 'harmonic_bed', param: 'frequency', min: 5000, max: 18000 }, weight: 1 },
    ],

    // COMPACT: filter closes on everything — compressed, muffled, underwater
    // Full compact → 300 Hz on all categories (dramatic)
    compact_effect: [
      { action: 'set_effect', args: { effect: 'lowpass', category: '*', param: 'frequency', min: 5000, max: 300 }, weight: 1 },
    ],

    // STEPPING: filter opens on groove — rhythm gets crisp, hi-hats sparkle
    stepping_effect: [
      { action: 'set_effect', args: { effect: 'lowpass', category: 'groove', param: 'frequency', min: 5000, max: 16000 }, weight: 1 },
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
