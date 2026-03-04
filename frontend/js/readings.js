/**
 * Readings layer — weighted quality combinations with gating.
 * Structure matches Ralf's ReadingConfig for future compatibility.
 *
 * Each reading = { id, mix: {quality: weight}, gate: {quality: {above/below}} }
 * Output    = { id, value: 0-1, active: boolean }
 *
 * Ralf compatibility notes:
 *   - mix formula: value = Σ(quality × weight) / Σ(weights)
 *   - gate: all conditions must be met for reading to be active
 *   - hysteresis band (0.05) prevents oscillation near thresholds
 */

import { DEFAULT_SCORE } from './score.js';

/** @deprecated Import from score.js instead. Kept for backwards compatibility. */
export const DEFAULT_READINGS = DEFAULT_SCORE.readings.solo;

/** @deprecated Import from score.js instead. Kept for backwards compatibility. */
export const RELATIONAL_READINGS = DEFAULT_SCORE.readings.relational;

const HYSTERESIS_BAND = 0.05;
const LERP_RATE = 0.08;

export class ReadingsEngine {
  /**
   * @param {Array} configs — array of ReadingConfig objects (default: DEFAULT_READINGS)
   */
  constructor(configs = DEFAULT_READINGS) {
    this.configs = configs;

    // Per-reading state
    this.values = {};       // id → current smoothed value (0-1)
    this.gateState = {};    // "readingId:quality" → boolean (for hysteresis)

    for (const c of configs) {
      this.values[c.id] = 0;
    }
  }

  /**
   * Compute readings from body qualities.
   * @param {Object} qualities — { velocity, jerkiness, coherence, ... } all 0-1
   * @returns {Array} — [{ id, value, active }, ...]
   */
  update(qualities) {
    const results = [];

    for (const config of this.configs) {
      // --- Weighted mix ---
      let value = 0;
      let totalWeight = 0;

      for (const [quality, weight] of Object.entries(config.mix)) {
        value += (qualities[quality] ?? 0) * weight;
        totalWeight += weight;
      }
      // Inverted qualities (1 - quality)
      if (config._invertInMix) {
        for (const [quality, weight] of Object.entries(config._invertInMix)) {
          value += (1 - (qualities[quality] ?? 0)) * weight;
          totalWeight += weight;
        }
      }
      if (totalWeight > 0) value /= totalWeight;

      // --- Gate evaluation with hysteresis ---
      let active = true;
      if (config.gate) {
        for (const [quality, condition] of Object.entries(config.gate)) {
          const val = qualities[quality] ?? 0;
          const gateKey = `${config.id}:${quality}`;
          const wasActive = this.gateState[gateKey] ?? false;

          let gateActive;
          if (wasActive) {
            // To deactivate, must cross threshold by hysteresis band
            gateActive = true;
            if (condition.above !== undefined && val < condition.above - HYSTERESIS_BAND)
              gateActive = false;
            if (condition.below !== undefined && val > condition.below + HYSTERESIS_BAND)
              gateActive = false;
          } else {
            // To activate, must cross threshold + band
            gateActive = true;
            if (condition.above !== undefined && val < condition.above + HYSTERESIS_BAND)
              gateActive = false;
            if (condition.below !== undefined && val > condition.below - HYSTERESIS_BAND)
              gateActive = false;
          }

          this.gateState[gateKey] = gateActive;
          if (!gateActive) active = false;
        }
      }

      // --- Lerp toward target (smooth transitions) ---
      const target = active ? value : 0;
      this.values[config.id] += (target - this.values[config.id]) * LERP_RATE;

      results.push({
        id: config.id,
        value: this.values[config.id],
        active,
      });
    }

    return results;
  }
}
