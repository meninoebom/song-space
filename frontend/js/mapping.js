/**
 * Mapping layer — connects readings to audio engine actions.
 * This is the taste layer: what body states do to the music.
 *
 * Pure function: receives mapping table from score config, owns no data.
 */

import { CATEGORIES } from './constants.js';

/**
 * Apply readings to audio engine.
 * Blends volume targets from active readings proportional to their value.
 *
 * @param {Array} readings — [{ id, value, active }, ...]
 * @param {AudioEngine} engine
 * @param {Array|null} allowedCategories — if set, only these categories get volume; others muted
 * @param {{ volumeMap: Object, quietVolumes: Object }} mappings — from score config
 */
export function applyMapping(readings, engine, allowedCategories = null, mappings) {
  if (!engine.loaded || !mappings) return;

  const { volumeMap, quietVolumes } = mappings;

  // Start with quiet baseline
  const targetVol = { ...quietVolumes };

  // Accumulate weighted volume contributions from active readings
  let totalWeight = 0;
  const contributions = {};
  for (const cat of CATEGORIES) contributions[cat] = 0;

  for (const reading of readings) {
    if (!reading.active || reading.value < 0.05) continue;
    const map = volumeMap[reading.id];
    if (!map) continue;

    const w = reading.value;
    totalWeight += w;

    for (const cat of CATEGORIES) {
      if (map[cat] !== undefined) {
        contributions[cat] += map[cat] * w;
      } else {
        contributions[cat] += quietVolumes[cat] * w;
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
