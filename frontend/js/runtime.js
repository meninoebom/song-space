/**
 * Unified Ralf runtime — replaces mapping.js + trigger-engine.js + trigger-actions.js.
 *
 * Implements Ralf's pipeline: Readings → Resolve → Draw → Act
 * Using the same config schema as Ralf's Scene.
 *
 * "Draw" is Ralf's term for weighted random selection from an intent pool.
 * Like drawing from a deck — weights stack the deck, but which card
 * you draw still varies.
 */

import { CATEGORIES } from './constants.js';

// --- Draw: weighted random selection from a pool ---

export function draw(options) {
  if (options.length === 0) return null;
  const totalWeight = options.reduce((sum, opt) => sum + Math.max(0, opt.weight), 0);
  if (totalWeight === 0) return null;
  let r = Math.random() * totalWeight;
  for (const option of options) {
    if (option.weight <= 0) continue;
    r -= option.weight;
    if (r <= 0) return option;
  }
  return options[options.length - 1];
}

// --- RalfRuntime ---

export class RalfRuntime {
  /**
   * @param {Object} score — { readings (flat array), intents, mappings }
   * @param {Object} engine — AudioEngine instance
   */
  constructor(score, engine) {
    this.score = score;
    this.engine = engine;
    this._edgeState = {};    // readingId → boolean
    this._sustainTime = {};  // `readingId:intentIdx` → seconds
    this._fired = {};        // `readingId:intentIdx` → boolean
  }

  /**
   * Run one frame of the pipeline.
   * @param {Array} readings — [{ id, value, active }]
   * @param {Array} phaseCategories — allowed categories from arc phase
   * @param {number} dt — seconds since last frame
   */
  update(readings, phaseCategories, dt = 1 / 30) {
    if (!this.engine.loaded) return;

    const readingMap = {};
    for (const r of readings) readingMap[r.id] = r;

    // Collect volume targets from continuous intents for blending
    let totalWeight = 0;
    const contributions = {};
    for (const cat of CATEGORIES) contributions[cat] = 0;
    const quietVolumes = this.score.mappings?.quietVolumes;

    for (const config of this.score.readings) {
      const reading = readingMap[config.id];
      const isActive = reading ? reading.active : false;
      const wasActive = this._edgeState[config.id] ?? false;
      this._edgeState[config.id] = isActive;

      // Process intents
      if (config.intents) {
        for (let idx = 0; idx < config.intents.length; idx++) {
          const intent = config.intents[idx];
          const key = `${config.id}:${idx}`;

          if (intent.mode === 'continuous') {
            // Fire every frame while active
            if (isActive && reading.value > 0.05) {
              this._fireContinuousIntent(intent.intent, reading, phaseCategories, contributions);
              totalWeight += reading.value;
            }
          } else {
            // Edge mode (default)
            if (isActive && !wasActive) {
              this._sustainTime[key] = 0;
              this._fired[key] = false;
            }
            if (isActive && !this._fired[key]) {
              this._sustainTime[key] = (this._sustainTime[key] || 0) + dt;
              const threshold = intent.after || 0;
              if (this._sustainTime[key] >= threshold) {
                this._fireEdgeIntent(intent.intent, reading, phaseCategories);
                this._fired[key] = true;
              }
            }
            if (!isActive && wasActive) {
              this._sustainTime[key] = 0;
              this._fired[key] = false;
            }
          }
        }
      }

      // on_exit: fire intents on falling edge
      if (!isActive && wasActive && config.on_exit) {
        for (const intentName of config.on_exit) {
          this._fireEdgeIntent(intentName, reading || { id: config.id, value: 0, active: false }, phaseCategories);
        }
      }
    }

    // Apply blended continuous volumes
    if (quietVolumes) {
      for (const cat of CATEGORIES) {
        let vol = totalWeight > 0 ? contributions[cat] / totalWeight : quietVolumes[cat];
        if (!phaseCategories.includes(cat)) vol = -60;
        this.engine.setCategoryVolume(cat, vol);
      }
    }
  }

  _fireContinuousIntent(intentName, reading, phaseCategories, contributions) {
    const pool = this._getPool(intentName);
    if (!pool || pool.length === 0) return;

    // For continuous intents, use highest-weight option (deterministic)
    // to avoid jarring random changes every frame
    let best = null;
    for (const opt of pool) {
      if (opt.weight <= 0) continue;
      if (!best || opt.weight > best.weight) best = opt;
    }
    if (!best) return;

    if (best.action === 'set_volumes' && best.args) {
      const w = reading.value;
      const quietVolumes = this.score.mappings?.quietVolumes || {};
      for (const cat of CATEGORIES) {
        if (best.args[cat] !== undefined) {
          contributions[cat] += best.args[cat] * w;
        } else {
          contributions[cat] += (quietVolumes[cat] ?? -40) * w;
        }
      }
    }
  }

  _fireEdgeIntent(intentName, reading, phaseCategories) {
    const pool = this._getPool(intentName);
    if (!pool || pool.length === 0) return;

    const chosen = draw(pool);
    if (!chosen) return;

    this._act(chosen, phaseCategories);
  }

  _getPool(intentName) {
    const entry = this.score.intents[intentName];
    if (!entry) {
      console.warn(`[RalfRuntime] Intent "${intentName}" not found in score.intents`);
      return null;
    }
    return Array.isArray(entry) ? entry : entry.pool;
  }

  _act(option, phaseCategories) {
    const ramp = option.args?.rampTime ?? 0.3;

    switch (option.action) {
      case 'set_volumes':
        if (option.args) {
          for (const [cat, db] of Object.entries(option.args)) {
            if (cat === 'rampTime') continue;
            if (phaseCategories.includes(cat)) {
              this.engine.setCategoryVolume(cat, db);
            }
          }
        }
        break;

      case 'mute':
        if (option.args?.categories) {
          for (const cat of option.args.categories) {
            if (phaseCategories.includes(cat)) {
              this.engine.muteCategory(cat, ramp);
            }
          }
        }
        break;

      case 'solo':
        if (option.args?.categories) {
          const muteTargets = phaseCategories.filter(c => !option.args.categories.includes(c));
          for (const cat of muteTargets) {
            this.engine.muteCategory(cat, ramp);
          }
        }
        break;

      case 'restore':
        for (const cat of phaseCategories) {
          if (this.engine.isTriggerMuted(cat)) {
            this.engine.restoreCategory(cat, ramp);
          }
        }
        break;

      case 'oneshot':
        if (option.args?.category) {
          this.engine.triggerOneshot(option.args.category, option.args.volumeDb ?? -6);
        }
        break;

      case 'filter_sweep':
        if (option.args) {
          this.engine.sweepFilter(option.args.category, option.args.from, option.args.to, option.args.duration);
        }
        break;

      default:
        console.warn(`[RalfRuntime] Unknown action type: "${option.action}"`);
    }
  }

  reset() {
    this._edgeState = {};
    this._sustainTime = {};
    this._fired = {};
  }
}
