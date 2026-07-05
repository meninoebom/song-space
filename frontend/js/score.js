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
 * Three interaction modes — how a reading connects body to music:
 *
 *   IMPULSE — a single punctuating moment
 *     Config: mode: 'edge', no on_exit, after: 0 (or omitted)
 *     Feel: a clap triggers an accent hit. Fire-and-forget.
 *     Example: explosive_slam, a quick arm raise triggering a oneshot
 *
 *   GATE — a state you inhabit, music changes while you're in it
 *     Config: mode: 'edge' + on_exit array (defines what happens when you leave)
 *     Feel: raise arms → hooks come in. Lower them → hooks leave.
 *     Example: arms_up (restore on enter, mute on exit), compact, stillness
 *
 *   CONTINUOUS — proportional tracking, more of the quality = more effect
 *     Config: mode: 'continuous'
 *     Feel: the faster you move, the fuller the mix. Like a fader.
 *     Example: energy (volume), flowing (filter brightness), stepping (groove crispness)
 *
 * These are the three and only three ways a body can shape music.
 * Every reading in the score is one (or a combination) of these.
 *
 * Additional temporal modifiers (compose with any mode):
 *   - Accumulating (rampSeconds: N): value grows 0→full over N seconds
 *   - Delayed edge (after: N): edge fires only after N seconds sustained
 */

/**
 * PROOF_SCORE — minimal "proof of feel" score with exactly 3 interactions,
 * one of each mode. Use ?score=proof to activate.
 *
 * Purpose: validate that each interaction mode is detectable, audible,
 * and musical before layering complexity.
 *
 * NO VOLUME MANIPULATION. Volume is the composer's domain.
 * All categories play at fixed levels. The dancer shapes the sound
 * through effects and oneshots only.
 *
 *   1. CONTINUOUS: energy — movement opens/closes master filter
 *   2. GATE: arms_up — arms up = reverb washes in, arms down = dry
 *   3. IMPULSE: arm_raise — sudden arm shoot triggers vocal accent hit
 */
export const PROOF_SCORE = {
  arc: {
    phases: [
      { id: 'await', categories: ['texture'], duration: null, trigger: 'movement', hint: 'move to begin' },
      // Single phase with everything available — focus on feel, not journey
      { id: 'play', categories: ['texture', 'bass', 'foundation', 'harmonic_bed', 'groove', 'hook', 'accent'], duration: [300, 600], hint: 'explore' },
    ],
    sectionMap: { play: 'chorus' },
  },

  readings: {
    solo: [
      // CONTINUOUS: energy — movement opens the master filter
      // Still = dark/muffled (behind a wall). Moving = bright/open.
      {
        id: 'energy',
        mix: { velocity: 1.0 },
        gate: {},
        intents: [{ intent: 'proof_energy_filter', mode: 'continuous' }],
      },

      // GATE: arms_up — reverb washes in while arms are raised
      {
        id: 'arms_up',
        mix: { armsRaised: 1.0 },
        gate: { armsRaised: { above: 0.4 } },
        intents: [
          { intent: 'proof_arms_up_enter', mode: 'edge' },
        ],
        on_exit: ['proof_arms_up_exit'],
      },

      // IMPULSE: sudden arm raise — vocal accent hit, fire and forget
      {
        id: 'arm_impulse',
        mix: { impulse: 1.0 },
        gate: { impulse: { above: 0.3 } },
        intents: [
          { intent: 'proof_impulse_hit', mode: 'edge' },
        ],
      },
    ],
    relational: [],
  },

  intents: {
    // CONTINUOUS: master filter tracks energy
    // Still → 400 Hz (very muffled), full movement → 18000 Hz (wide open)
    proof_energy_filter: [
      { action: 'set_effect', args: { effect: 'lowpass', category: '*', param: 'frequency', min: 400, max: 18000 }, weight: 1 },
    ],

    // GATE: arms up → reverb washes in (wet=0.6), arms down → dry (wet=0)
    proof_arms_up_enter: [
      { action: 'set_effect', args: { effect: 'reverb', category: '*', param: 'wet', value: 0.6 }, weight: 1 },
    ],
    proof_arms_up_exit: [
      { action: 'set_effect', args: { effect: 'reverb', category: '*', param: 'wet', value: 0 }, weight: 1 },
    ],

    // IMPULSE: drum burst — punches through regardless
    // Uses groove (drums) for maximum percussive impact
    proof_impulse_hit: [
      { action: 'oneshot', args: { category: 'groove', volumeDb: 3 }, weight: 1 },
    ],
  },

  // Fixed mix levels — composer sets these, dancer never touches them.
  // Everything plays at a steady level. The filter is what changes.
  mappings: {
    quietVolumes: {
      texture: -8, harmonic_bed: -10, bass: -10,
      foundation: -10, groove: -10, hook: -12, accent: -20,
    },
  },
};

export const DEFAULT_SCORE = {

  // --- Composer layer: the temporal journey ---

  arc: {
    phases: [
      { id: 'await',     categories: ['texture', 'harmonic_bed'],                                                   duration: null, trigger: 'movement' },
      { id: 'emerge',    categories: ['texture', 'harmonic_bed', 'bass'],                                           duration: [40, 50] },
      { id: 'build',     categories: ['texture', 'harmonic_bed', 'bass', 'foundation'],                             duration: [60, 80] },
      { id: 'peak',      categories: ['texture', 'harmonic_bed', 'bass', 'foundation', 'groove', 'hook', 'accent'], duration: [50, 65] },
      { id: 'breakdown', categories: ['texture', 'harmonic_bed'],                                                   duration: [25, 35] },
      { id: 'resolve',   categories: ['texture', 'harmonic_bed', 'bass', 'foundation', 'groove', 'hook'],           duration: [50, 65] },
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
      // ENERGY (medium): groove + foundation come alive when you move
      // Gate opens at moderate velocity. Bring-in on enter, take-out on exit.
      {
        id: 'energy_mid',
        mix: { velocity: 1.0 },
        gate: { velocity: { above: 0.25 } },
        intents: [
          { intent: 'energy_mid_enter', mode: 'edge' },
        ],
        on_exit: ['energy_mid_exit'],
      },

      // ENERGY (high): hooks + accents arrive at high energy
      // Also continuously brightens groove — higher energy = crisper rhythm
      {
        id: 'energy_high',
        mix: { velocity: 1.0 },
        gate: { velocity: { above: 0.55 } },
        intents: [
          { intent: 'energy_high_enter', mode: 'edge' },
          { intent: 'energy_high_effect', mode: 'continuous' },
        ],
        on_exit: ['energy_high_exit'],
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

      // ARMS UP: reach overhead → filter sweep + bring in hooks
      // Enter: sweep up + restore hook. Exit: sweep down + mute hook.
      {
        id: 'arms_up',
        mix: { armsRaised: 1.0 },
        gate: { armsRaised: { above: 0.4 } },
        intents: [
          { intent: 'arms_up_enter', mode: 'edge' },
        ],
        on_exit: ['arms_up_exit'],
      },

      // FLOWING: smooth coherent movement → filter brightens harmonic bed
      {
        id: 'flowing',
        mix: { coherence: 0.6, velocity: 0.4 },
        gate: { velocity: { above: 0.15 }, coherence: { above: 0.35 } },
        intents: [{ intent: 'flowing_effect', mode: 'continuous' }],
      },

      // GROUNDED: low center, bent legs → filter darkens hooks
      {
        id: 'grounded',
        mix: { legBend: 0.4, contraction: 0.3 },
        gate: { velocity: { below: 0.3 } },
        _invertInMix: { verticality: 0.3 },
        intents: [{ intent: 'grounded_effect', mode: 'continuous' }],
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

      // WIDE: arms spread → restore harmonic_bed + filter opens
      // Enter: bring in harmonic_bed. Exit: take it out.
      {
        id: 'wide',
        mix: { wristSpread: 0.6 },
        gate: { wristSpread: { above: 0.5 }, contraction: { below: 0.4 } },
        _invertInMix: { contraction: 0.4 },
        intents: [
          { intent: 'wide_enter', mode: 'edge' },
          { intent: 'wide_effect', mode: 'continuous' },
        ],
        on_exit: ['wide_exit'],
      },

      // COMPACT: curl inward → mute hooks+texture + filter closes everything
      // Enter: strip the highs. Exit: bring them back.
      {
        id: 'compact',
        mix: { contraction: 0.4, legBend: 0.4 },
        gate: { contraction: { above: 0.5 }, velocity: { above: 0.1 } },
        _invertInMix: { wristSpread: 0.2 },
        intents: [
          { intent: 'compact_enter', mode: 'edge' },
          { intent: 'compact_effect', mode: 'continuous' },
        ],
        on_exit: ['compact_exit'],
      },

      // STEPPING: footwork → filter crisps groove
      {
        id: 'stepping',
        mix: { step: 0.7, velocity: 0.3 },
        gate: { step: { above: 0.2 } },
        intents: [{ intent: 'stepping_effect', mode: 'continuous' }],
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
  // Two kinds of intent (NO volume manipulation from readings):
  //   EFFECTS — continuous filter tracking (set_effect follows reading value)
  //   EDGES — bring-in/take-out (mute/restore) + filter sweeps + draws
  //
  // Energy is the ONLY reading that sets volumes. All others use effects
  // and mute/restore to shape the music. The composer controls volume.
  //
  // Continuous intents: highest-weight option, every frame.
  // Edge intents: random draw from weighted pool, fires once.

  intents: {

    // === ENERGY: bring-in / take-out by energy level ===

    energy_mid_enter: [
      { action: 'restore', args: { categories: ['groove', 'foundation'], rampTime: 0.5 }, weight: 3 },
      { action: 'filter_sweep', args: { category: 'groove', from: 800, to: 8000, duration: 1.5 }, weight: 2 },
    ],
    energy_mid_exit: [
      { action: 'mute', args: { categories: ['groove', 'foundation'], rampTime: 1.5 }, weight: 3 },
      { action: 'filter_sweep', args: { category: 'groove', from: 8000, to: 800, duration: 1.0 }, weight: 1 },
    ],

    // High energy continuous: groove gets brighter and crisper
    energy_high_effect: [
      { action: 'set_effect', args: { effect: 'lowpass', category: 'groove', param: 'frequency', min: 5000, max: 16000 }, weight: 1 },
    ],

    energy_high_enter: [
      { action: 'restore', args: { categories: ['hook', 'accent'], rampTime: 0.3 }, weight: 3 },
      { action: 'filter_sweep', args: { category: 'hook', from: 1000, to: 12000, duration: 1.0 }, weight: 2 },
    ],
    energy_high_exit: [
      { action: 'mute', args: { categories: ['hook', 'accent'], rampTime: 2.0 }, weight: 3 },
      { action: 'filter_sweep', args: { category: 'hook', from: 12000, to: 1000, duration: 1.5 }, weight: 1 },
    ],

    // === BRING-IN / TAKE-OUT: mute/restore on enter/exit ===

    // ARMS UP: restore everything (especially beat) + filter sweep opens
    arms_up_enter: [
      { action: 'restore', args: { rampTime: 0.3 }, weight: 3 },
      { action: 'filter_sweep', args: { category: 'harmonic_bed', from: 800, to: 8000, duration: 1.5 }, weight: 1 },
    ],
    arms_up_exit: [
      { action: 'filter_sweep', args: { category: 'harmonic_bed', from: 8000, to: 2000, duration: 1.0 }, weight: 1 },
    ],

    // WIDE: restore everything + expansive feel
    wide_enter: [
      { action: 'restore', args: { rampTime: 0.5 }, weight: 1 },
    ],
    wide_exit: [
      { action: 'mute', args: { categories: ['hook'], rampTime: 1.0 }, weight: 1 },
    ],


    // COMPACT: strip the highs, go underground
    compact_enter: [
      { action: 'mute', args: { categories: ['hook', 'texture'], rampTime: 0.3 }, weight: 3 },
      { action: 'mute', args: { categories: ['hook', 'texture', 'harmonic_bed'], rampTime: 0.4 }, weight: 1 },
    ],
    compact_exit: [
      { action: 'restore', args: { rampTime: 0.3 }, weight: 1 },
    ],

    // === EFFECTS: continuous filter tracking ===

    // FLOWING: harmonic bed opens up + reverb washes in — dreamy, spacious
    // Targets harmonic_bed only to avoid muddiness
    flowing_effect: [
      { action: 'set_effect', args: { effect: 'lowpass', category: 'harmonic_bed', param: 'frequency', min: 2000, max: 18000 }, weight: 1 },
      { action: 'set_effect', args: { effect: 'reverb', category: '*', param: 'wet', min: 0, max: 0.5 }, weight: 1 },
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
      { action: 'solo', args: { categories: ['texture', 'harmonic_bed'], rampTime: 0.8 }, weight: 3 },
      { action: 'solo', args: { categories: ['texture', 'harmonic_bed', 'bass'], rampTime: 1.0 }, weight: 1 },
    ],
    energy_slam: [
      { action: 'restore', args: { rampTime: 0.05, quantize: false }, weight: 3 },
      { action: 'restore', args: { rampTime: 0.15, quantize: false }, weight: 1 },
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
    // Fixed mix — composer's domain. Dancer never touches volume.
    fixedVolumes: {
      texture: -8, harmonic_bed: -10, bass: -10,
      foundation: -10, groove: -10, hook: -12, accent: -14,
    },
  },
};
