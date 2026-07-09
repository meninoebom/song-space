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
    this._frameActions = []; // per-frame mute/restore buffer (see _flushFrameActions)
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

    // Fixed volumes — set once per frame from composer's mix.
    // Volume is the composer's domain; the dancer shapes sound through effects
    // and mute/restore, never by blending faders. See docs/LEARNINGS.md.
    const fixedVolumes = this.score.mappings?.fixedVolumes;

    // --- Exclusive-group arbitration (READING-LEVEL) ---
    // Readings that share an `exclusiveGroup` describe one family of body states
    // (e.g. the stillness family: stillness / suspended / melting). Only the
    // highest-`priority` ACTIVE member drives the music each frame; the rest are
    // suppressed. A suppressed reading fires NO intents and NO on_exit, so its
    // release can never undo the winner's mutes while the winner is still active.
    // This resolves the "global exit undoes an active reading" clash (#54) and
    // prevents overlapping low-velocity gates from stacking into mud.
    const groupWinner = {}; // groupName → { id, priority }
    for (const config of this.score.readings) {
      if (!config.exclusiveGroup) continue;
      const r = readingMap[config.id];
      if (!r || !r.active) continue;
      const priority = config.priority ?? 0;
      const cur = groupWinner[config.exclusiveGroup];
      if (!cur || priority > cur.priority) {
        groupWinner[config.exclusiveGroup] = { id: config.id, priority };
      }
    }

    // Per-frame action arbiter buffer. mute/restore/solo actions collect here
    // during the frame instead of hitting the engine immediately, then
    // _flushFrameActions resolves per-category conflicts. See that method.
    this._frameActions = [];

    for (const config of this.score.readings) {
      const reading = readingMap[config.id];
      const isActive = reading ? reading.active : false;
      const wasActive = this._edgeState[config.id] ?? false;
      this._edgeState[config.id] = isActive;

      // A reading in a group that is not its current winner is suppressed.
      const suppressed = !!config.exclusiveGroup
        && !!groupWinner[config.exclusiveGroup]
        && groupWinner[config.exclusiveGroup].id !== config.id;

      // Merge phase overrides if present
      const effectiveIntents = (phaseId && config.phaseOverrides?.[phaseId]?.intents)
        ? config.phaseOverrides[phaseId].intents
        : config.intents;

      // While suppressed, fire nothing but keep edge bookkeeping clean so that
      // when this reading later becomes the winner its delayed edges start fresh
      // (the moment begins when the state takes over the group, not before).
      if (suppressed) {
        if (effectiveIntents) {
          for (let idx = 0; idx < effectiveIntents.length; idx++) {
            this._sustainTime[`${config.id}:${idx}`] = 0;
            this._fired[`${config.id}:${idx}`] = false;
          }
        }
        continue;
      }

      // Process intents
      if (effectiveIntents) {
        for (let idx = 0; idx < effectiveIntents.length; idx++) {
          const intent = effectiveIntents[idx];
          const key = `${config.id}:${idx}`;

          if (intent.mode === 'continuous') {
            // Fire every frame while active
            if (isActive && reading.value > 0.05) {
              this._fireContinuousIntent(intent.intent, reading, phaseCategories);
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

    // Resolve buffered mute/restore/solo actions with per-category arbitration.
    this._flushFrameActions();

    // Apply volumes — fixed mix. Composer sets levels; dancer shapes via
    // effects + mute/restore. Categories outside the current phase are silenced.
    if (fixedVolumes) {
      for (const cat of CATEGORIES) {
        const vol = phaseCategories.includes(cat) ? (fixedVolumes[cat] ?? -12) : -60;
        this.engine.setCategoryVolume(cat, vol);
      }
    }
  }

  _fireContinuousIntent(intentName, reading, phaseCategories) {
    const pool = this._getPool(intentName);
    if (!pool || pool.length === 0) return;

    // Fire all set_effect actions in the pool (they stack — filter + reverb etc.)
    for (const opt of pool) {
      if (opt.weight <= 0) continue;

      if (opt.action === 'set_effect' && opt.args) {
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
    // Actions that mutate shared per-category mute state (mute/restore/solo)
    // buffer into _frameActions so the arbiter can resolve same-frame conflicts.
    // The isTriggerMuted checks below read start-of-frame state (the buffer is
    // not flushed until the frame ends), which makes a frame's mute decisions
    // atomic and order-independent.
    const quantize = option.args?.quantize !== false;

    switch (option.action) {
      case 'mute':
        if (option.args?.categories) {
          for (const cat of option.args.categories) {
            if (phaseCategories.includes(cat)) {
              this._frameActions.push({ op: 'mute', category: cat, quantize, ramp });
            }
          }
        }
        break;

      case 'solo':
        if (option.args?.categories) {
          const members = option.args.categories;
          // Mute non-members; restore any member that was previously trigger-muted
          // so the solo pool is actually audible (fixes the silent-hook bug where
          // a prior mute left a solo'd category muted). See #53.
          for (const cat of phaseCategories) {
            if (members.includes(cat)) {
              if (this.engine.isTriggerMuted(cat)) {
                this._frameActions.push({ op: 'restore', category: cat, quantize, ramp });
              }
            } else {
              this._frameActions.push({ op: 'mute', category: cat, quantize, ramp });
            }
          }
        }
        break;

      case 'restore': {
        const restoreTargets = option.args?.categories
          ? option.args.categories.filter(c => phaseCategories.includes(c))
          : phaseCategories;
        for (const cat of restoreTargets) {
          if (this.engine.isTriggerMuted(cat)) {
            this._frameActions.push({ op: 'restore', category: cat, quantize, ramp });
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

  /**
   * Per-frame action arbiter (ACTION-LEVEL). Resolves the mute/restore/solo
   * actions buffered this frame down to at most one op per category, then
   * executes them on the engine. Two rules, both declarative in intent config:
   *
   *   1. INSTANT beats QUANTIZED. If any unquantized action targets a category
   *      this frame, the quantized ones for it are dropped — the instant op is
   *      the only one issued. This fixes the enter-before-exit clash (#54):
   *      when an earlier reading queues a quantized restore and a later reading
   *      slams the same category instantly (quantize: false), only the instant
   *      restore fires; no next-bar ramp is ever scheduled.
   *   2. RESTORE beats MUTE within the same timing class. When a category is
   *      contested, bringing sound in wins over taking it out.
   *
   * The sharpest (smallest) ramp among the winning entries is used.
   */
  _flushFrameActions() {
    const byCat = new Map();
    for (const a of this._frameActions) {
      if (!byCat.has(a.category)) byCat.set(a.category, []);
      byCat.get(a.category).push(a);
    }

    for (const [cat, entries] of byCat) {
      const instant = entries.filter(e => !e.quantize);
      const pool = instant.length ? instant : entries;
      const quantize = instant.length === 0;

      const restores = pool.filter(e => e.op === 'restore');
      const winners = restores.length ? restores : pool.filter(e => e.op === 'mute');
      const op = restores.length ? 'restore' : 'mute';
      const ramp = Math.min(...winners.map(e => e.ramp));

      if (op === 'restore') {
        if (quantize) this.engine.restoreCategoryQuantized(cat, ramp);
        else this.engine.restoreCategory(cat, ramp);
      } else {
        if (quantize) this.engine.muteCategoryQuantized(cat, ramp);
        else this.engine.muteCategory(cat, ramp);
      }
    }

    this._frameActions = [];
  }

  reset() {
    this._edgeState = {};
    this._sustainTime = {};
    this._fired = {};
    this._frameActions = [];
  }
}
