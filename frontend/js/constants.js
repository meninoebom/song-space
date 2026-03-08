/**
 * Shared constants and contracts for Song Space frontend.
 *
 * This file defines the adapter architecture contracts that enable
 * swappable input sensors and output targets. See
 * docs/solutions/adapter-architecture.md for the full design.
 */

// --- Categories: the 7 functional roles a loop can fill ---

export const CATEGORIES = ['foundation', 'groove', 'bass', 'harmonic_bed', 'hook', 'texture', 'accent'];

export const CATEGORY_ORDER = ['groove', 'foundation', 'bass', 'harmonic_bed', 'hook', 'texture', 'accent'];

export const CATEGORY_LABELS = {
  groove: 'Groove', foundation: 'Foundation', bass: 'Bass',
  harmonic_bed: 'Harmony', hook: 'Hook', texture: 'Texture', accent: 'Accent',
};

// --- Input Contract: Qualities ---
//
// Any input adapter (MediaPipe, Kinect, body suit, LiDAR) must produce
// an object with these keys, all normalized 0-1. The brain (ReadingsEngine
// + RalfRuntime) only speaks this language — it never sees raw sensor data.
//
// Quality concepts come from dance practice and Laban Movement Analysis,
// not from any specific sensor. The names are portable; the computation
// changes per adapter.

export const QUALITY_KEYS = [
  'velocity',     // overall movement speed
  'impulse',      // sudden velocity burst (spike-and-decay)
  'coherence',    // left/right sides moving together
  'contraction',  // body gathered inward vs expanded
  'verticality',  // upright vs low/crouched
  'wristSpread',  // arms spread wide vs narrow
  'armsRaised',   // hands above shoulders
  'legBend',      // knee bend (high = bent)
  'headTilt',     // head offset from center
  'jump',         // vertical launch (spike-and-decay)
];

// --- Output Contract: Actions ---
//
// The brain emits action commands. Any output adapter (Tone.js, Ableton
// via OSC/MIDI, live musician score renderer) must handle these action
// types. The brain never calls audio/music APIs directly.
//
// Actions are the boundary between the brain and the outside world.
// RalfRuntime resolves readings → intents → actions, then hands actions
// to the output adapter for execution.

export const ACTION_TYPES = [
  'set_volumes',   // continuous: set category volumes (dB values)
  'mute',          // edge: mute specific categories with ramp
  'solo',          // edge: solo specific categories (mute everything else)
  'restore',       // edge: restore muted categories with ramp
  'oneshot',       // edge: trigger a one-shot sample
  'filter_sweep',  // edge: sweep a filter over time
];
