/**
 * Unified Ralf runtime — the "brain" of the adapter architecture.
 *
 * Pipeline: Readings → Resolve → Draw → Act
 * Using the same config schema as Ralf's Scene.
 *
 * This module is OUTPUT-AGNOSTIC. It resolves readings into action commands
 * (see ACTION_TYPES in constants.js) and hands them to an output adapter
 * for execution. The output adapter is injected via constructor — today
 * it's AudioEngine (Tone.js), but could be an OSC sender, MIDI output,
 * or live score renderer.
 *
 * Output adapter interface — any adapter must implement:
 *   setCategoryVolume(category, dB)
 *   muteCategory(category, rampTime)
 *   restoreCategory(category, rampTime)
 *   isTriggerMuted(category) → boolean
 *   triggerOneshot(category, volumeDb)
 *   sweepFilter(category, fromHz, toHz, durationSeconds)
 *   setEffect(category, effectName, paramName, value)
 *   loaded → boolean
 *
 * "Draw" is Ralf's term for weighted random selection from an intent pool.
 * Like drawing from a deck — weights stack the deck, but which card
 * you draw still varies.
 *
 * See docs/solutions/adapter-architecture.md for the full design.
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
   * @param {string} [phaseId] — current arc phase id (for phaseOverrides)
   */
  update(readings, phaseCategories, dt = 1 / 30, phaseId = null) {
    if (!this.engine.loaded) return;

    const readingMap = {};
    for (const r of readings) readingMap[r.id] = r;

    // Fixed volumes — set once per frame from composer's mix
    const fixedVolumes = this.score.mappings?.fixedVolumes;
    // Legacy support for quietVolumes-based blending
    const quietVolumes = this.score.mappings?.quietVolumes;
    const contributions = {};
    const catWeights = {};
    for (const cat of CATEGORIES) { contributions[cat] = 0; catWeights[cat] = 0; }

    for (const config of this.score.readings) {
      const reading = readingMap[config.id];
      const isActive = reading ? reading.active : false;
      const wasActive = this._edgeState[config.id] ?? false;
      this._edgeState[config.id] = isActive;

      // Merge phase overrides if present
      const effectiveIntents = (phaseId && config.phaseOverrides?.[phaseId]?.intents)
        ? config.phaseOverrides[phaseId].intents
        : config.intents;

      // Process intents
      if (effectiveIntents) {
        for (let idx = 0; idx < effectiveIntents.length; idx++) {
          const intent = effectiveIntents[idx];
          const key = `${config.id}:${idx}`;

          if (intent.mode === 'continuous') {
            // Fire every frame while active
            if (isActive && reading.value > 0.05) {
              this._fireContinuousIntent(intent.intent, reading, phaseCategories, contributions, catWeights);
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

      // Reset continuous effects on falling edge (filter returns to default)
      if (!isActive && wasActive && effectiveIntents) {
        for (const intent of effectiveIntents) {
          if (intent.mode === 'continuous') {
            this._resetContinuousEffect(intent.intent, phaseCategories);
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

    // Apply volumes
    if (fixedVolumes) {
      // Fixed mix — composer sets volumes, dancer shapes via effects + mute/restore
      for (const cat of CATEGORIES) {
        const vol = phaseCategories.includes(cat) ? (fixedVolumes[cat] ?? -12) : -60;
        this.engine.setCategoryVolume(cat, vol);
      }
    } else if (quietVolumes) {
      // Legacy: blended continuous volumes
      for (const cat of CATEGORIES) {
        let vol = catWeights[cat] > 0 ? contributions[cat] / catWeights[cat] : quietVolumes[cat];
        if (!phaseCategories.includes(cat)) vol = -60;
        this.engine.setCategoryVolume(cat, vol);
      }
    }
  }

  _fireContinuousIntent(intentName, reading, phaseCategories, contributions, catWeights) {
    const pool = this._getPool(intentName);
    if (!pool || pool.length === 0) return;

    // Fire all set_effect actions in the pool (they stack — filter + reverb etc.)
    // For set_volumes, use highest-weight option (deterministic, one fader wins)
    for (const opt of pool) {
      if (opt.weight <= 0) continue;

      if (opt.action === 'set_volumes' && opt.args) {
        const w = reading.value;
        const quietVols = this.score.mappings?.quietVolumes || {};
        for (const cat of CATEGORIES) {
          const target = opt.args[cat] ?? (intentName === 'energy_blend' ? (quietVols[cat] ?? -40) : undefined);
          if (target !== undefined) {
            const floor = quietVols[cat] ?? -40;
            contributions[cat] += (floor + (target - floor) * w);
            catWeights[cat] += 1;
          }
        }
        break; // only one volume action per intent
      } else if (opt.action === 'set_effect' && opt.args) {
        const { effect, category, param, min, max } = opt.args;
        const value = min + (max - min) * reading.value;
        if (category === '*' && (effect === 'reverb' || effect === 'lowpass')) {
          this.engine.setEffect('*', effect, param, value);
        } else {
          const targets = category === '*' ? phaseCategories : [category];
          for (const cat of targets) {
            if (phaseCategories.includes(cat)) {
              this.engine.setEffect(cat, effect, param, value);
            }
          }
        }
      }
    }
  }

  _resetContinuousEffect(intentName, phaseCategories) {
    const pool = this._getPool(intentName);
    if (!pool) return;
    for (const opt of pool) {
      if (opt.action === 'set_effect' && opt.args) {
        const { effect, category, param, min } = opt.args;
        // Reset to min (the "default / no-effect" end of the range)
        if (category === '*' && (effect === 'reverb' || effect === 'lowpass')) {
          this.engine.setEffect('*', effect, param, min);
        } else {
          const targets = category === '*' ? phaseCategories : [category];
          for (const cat of targets) {
            this.engine.setEffect(cat, effect, param, min);
          }
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
          const muteFn = option.args?.quantize !== false
            ? (c, r) => this.engine.muteCategoryQuantized(c, r)
            : (c, r) => this.engine.muteCategory(c, r);
          for (const cat of option.args.categories) {
            if (phaseCategories.includes(cat)) {
              muteFn(cat, ramp);
            }
          }
        }
        break;

      case 'solo':
        if (option.args?.categories) {
          const muteTargets = phaseCategories.filter(c => !option.args.categories.includes(c));
          const soloMuteFn = option.args?.quantize !== false
            ? (c, r) => this.engine.muteCategoryQuantized(c, r)
            : (c, r) => this.engine.muteCategory(c, r);
          for (const cat of muteTargets) {
            soloMuteFn(cat, ramp);
          }
        }
        break;

      case 'restore': {
        const restoreTargets = option.args?.categories
          ? option.args.categories.filter(c => phaseCategories.includes(c))
          : phaseCategories;
        const restoreFn = option.args?.quantize !== false
          ? (c, r) => this.engine.restoreCategoryQuantized(c, r)
          : (c, r) => this.engine.restoreCategory(c, r);
        for (const cat of restoreTargets) {
          if (this.engine.isTriggerMuted(cat)) {
            restoreFn(cat, ramp);
          }
        }
        break;
      }

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

      case 'set_effect':
        if (option.args) {
          const { effect, category, param, min, max } = option.args;
          if (category === '*' && (effect === 'reverb' || effect === 'lowpass')) {
            this.engine.setEffect('*', effect, param, option.args.value ?? max);
          } else {
            const targets = category === '*' ? phaseCategories : [category];
            for (const cat of targets) {
              if (phaseCategories.includes(cat)) {
                this.engine.setEffect(cat, effect, param, option.args.value ?? max);
              }
            }
          }
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
