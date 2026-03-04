/**
 * Mapping layer — connects readings to audio engine actions.
 * This is the taste layer: what body states do to the music.
 *
 * Uses Ralf-compatible action naming (set/* for continuous, trigger/* for discrete).
 * When Song Space becomes a Ralf translator, this mapping moves into a Scene JSON.
 */

import { DEFAULT_SCORE } from './score.js';

// Volume targets and baseline from score config.
// Issue #2 will refactor applyMapping to accept these as parameters.
const VOLUME_MAP = DEFAULT_SCORE.mappings.volumeMap;
const QUIET_VOLUMES = DEFAULT_SCORE.mappings.quietVolumes;

import { CATEGORIES } from './constants.js';

/**
 * Apply readings to audio engine.
 * Blends volume targets from active readings proportional to their value.
 *
 * @param {Array} readings — [{ id, value, active }, ...]
 * @param {AudioEngine} engine
 * @param {Array|null} allowedCategories — if set, only these categories get volume; others muted
 */
export function applyMapping(readings, engine, allowedCategories = null) {
  if (!engine.loaded) return;

  // Start with quiet baseline
  const targetVol = { ...QUIET_VOLUMES };

  // Accumulate weighted volume contributions from active readings
  let totalWeight = 0;
  const contributions = {};
  for (const cat of CATEGORIES) contributions[cat] = 0;

  for (const reading of readings) {
    if (!reading.active || reading.value < 0.05) continue;
    const map = VOLUME_MAP[reading.id];
    if (!map) continue;

    const w = reading.value;
    totalWeight += w;

    for (const cat of CATEGORIES) {
      if (map[cat] !== undefined) {
        contributions[cat] += map[cat] * w;
      } else {
        contributions[cat] += QUIET_VOLUMES[cat] * w;
      }
    }
  }

  // Blend: if any readings active, use weighted average; otherwise quiet baseline
  if (totalWeight > 0) {
    for (const cat of CATEGORIES) {
      targetVol[cat] = contributions[cat] / totalWeight;
    }
  }

  // Phase-gate: mute categories not in current phase
  if (allowedCategories) {
    for (const cat of CATEGORIES) {
      if (!allowedCategories.includes(cat)) {
        targetVol[cat] = -60;
      }
    }
  }

  // Apply to engine with smooth ramp
  for (const cat of CATEGORIES) {
    engine.setCategoryVolume(cat, targetVol[cat]);
  }
}
