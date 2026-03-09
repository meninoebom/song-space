/**
 * Readings layer — weighted quality combinations with gating.
 * Structure matches Ralf's ReadingConfig for future compatibility.
 *
 * Each reading = { id, mix: {quality: weight}, gate: {quality: {above/below}} }
 * Output    = { id, value: 0-1, active: boolean }
 *
 * Reading behavior patterns (reusable across readings):
 *   - Instantaneous (default): value snaps to weighted mix when gate opens.
 *     Best for reactive states where body shape maps directly to music.
 *     Examples: energy, arms_up, wide, compact.
 *
 *   - Accumulating (rampSeconds): value grows from 0 to full mix over N seconds
 *     while the gate stays open. Resets when gate closes. Best for states where
 *     time deepens meaning — dramatic tension, sustained commitment.
 *     Examples: stillness (3s), suspended, melting.
 *
 *   - Edge-triggered (via intents with `after`): fires a one-time action after
 *     sustained activation. Defined in score.js, not here.
 *     Examples: drums_drop after 2s, strip_down after 5s.
 *
 * These three patterns compose freely: a reading can be accumulating AND have
 * edge-triggered intents (e.g., stillness ramps continuously AND fires drums_drop
 * at 2s). This vocabulary transfers directly to Ralf's scene system.
 *
 * Ralf compatibility notes:
 *   - mix formula: value = Σ(quality × weight) / Σ(weights)
 *   - gate: all conditions must be met for reading to be active
 *   - hysteresis band (0.05) prevents oscillation near thresholds
 *   - rampSeconds: optional accumulation time (0 or absent = instantaneous)
 */


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
    this.activeTime = {};   // id → seconds gate has been continuously open
    this.lastUpdateTime = null; // for computing dt

    for (const c of configs) {
      this.values[c.id] = 0;
      this.activeTime[c.id] = 0;
    }
  }

  /**
   * Compute readings from body qualities.
   * @param {Object} qualities — { velocity, jerkiness, coherence, ... } all 0-1
   * @returns {Array} — [{ id, value, active }, ...]
   */
  update(qualities, timestamp = performance.now() / 1000) {
    const dt = this.lastUpdateTime !== null ? timestamp - this.lastUpdateTime : 1 / 30;
    this.lastUpdateTime = timestamp;
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

      // --- Accumulation ramp (if configured) ---
      if (active) {
        this.activeTime[config.id] += dt;
        if (config.rampSeconds > 0) {
          value *= Math.min(1, this.activeTime[config.id] / config.rampSeconds);
        }
      } else {
        this.activeTime[config.id] = 0;
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
