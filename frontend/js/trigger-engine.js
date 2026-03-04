/**
 * Trigger engine — evaluates declarative trigger configs against readings.
 *
 * A simplified version of Ralf's intent resolution + edge state tracking.
 * Returns actions without executing them (separation of concerns).
 *
 * Each trigger watches a reading and fires on rising or falling edge,
 * optionally delayed by a sustain timer. Actions describe what to do
 * (mute, solo, restore) but the caller applies them to the audio engine.
 */

export class TriggerEngine {
  /**
   * @param {Array} configs — trigger configs from score
   */
  constructor(configs) {
    this.configs = configs;

    // Per-trigger state
    this._edgeState = {};    // triggerId → boolean (was reading active last frame?)
    this._sustainTime = {};  // triggerId → seconds sustained
    this._fired = {};        // triggerId → boolean (has this trigger fired in current activation?)
  }

  /**
   * Evaluate all triggers against current readings.
   * @param {Array} readings — [{ id, value, active }]
   * @param {Array} allowedCategories — current arc phase categories
   * @param {number} dt — seconds since last frame (default 1/30)
   * @returns {Array} — [{ triggerId, action }] actions to execute
   */
  update(readings, allowedCategories, dt = 1 / 30) {
    const actions = [];
    const readingMap = {};
    for (const r of readings) readingMap[r.id] = r;

    for (const config of this.configs) {
      const reading = readingMap[config.on];
      const isActive = reading ? reading.active : false;
      const wasActive = this._edgeState[config.id] ?? false;

      // Update edge state
      this._edgeState[config.id] = isActive;

      if (config.edge === 'enter') {
        if (isActive && !wasActive) {
          // Rising edge — reset sustain timer and fired flag
          this._sustainTime[config.id] = 0;
          this._fired[config.id] = false;
        }

        if (isActive && !this._fired[config.id]) {
          // Accumulate sustain time
          this._sustainTime[config.id] = (this._sustainTime[config.id] || 0) + dt;

          const threshold = config.after || 0;
          if (this._sustainTime[config.id] >= threshold) {
            // Check if action is relevant to current arc phase
            const resolved = this._resolveAction(config.action, allowedCategories);
            if (resolved) {
              actions.push({ triggerId: config.id, action: resolved });
              this._fired[config.id] = true;
            }
          }
        }

        // Reset sustain on deactivation
        if (!isActive && wasActive) {
          this._sustainTime[config.id] = 0;
          this._fired[config.id] = false;
        }
      } else if (config.edge === 'exit') {
        if (!isActive && wasActive) {
          // Falling edge
          const resolved = this._resolveAction(config.action, allowedCategories);
          if (resolved) {
            actions.push({ triggerId: config.id, action: resolved });
          }
        }
      }
    }

    return actions;
  }

  /**
   * Resolve an action against allowed categories.
   * Returns null if the action is irrelevant (e.g., muting a category not in the arc phase).
   */
  _resolveAction(action, allowedCategories) {
    if (action.restore) {
      // Restore is always relevant
      return { ...action };
    }

    if (action.mute) {
      // Filter mute targets to only allowed categories
      const relevant = action.mute.filter(c => allowedCategories.includes(c));
      if (relevant.length === 0) return null;
      return { ...action, mute: relevant };
    }

    if (action.solo) {
      // Solo: mute everything in allowed categories EXCEPT the solo targets
      const muteTargets = allowedCategories.filter(c => !action.solo.includes(c));
      if (muteTargets.length === 0) return null;
      return { ...action, _muteTargets: muteTargets };
    }

    return { ...action };
  }

  /** Reset all state (e.g., on song restart). */
  reset() {
    this._edgeState = {};
    this._sustainTime = {};
    this._fired = {};
  }
}
