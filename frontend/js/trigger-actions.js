/**
 * Apply trigger actions to the audio engine.
 *
 * Translates TriggerEngine's declarative action objects into
 * imperative AudioEngine calls (muteCategory, restoreCategory).
 *
 * @param {Array} actions — [{ triggerId, action }] from TriggerEngine.update()
 * @param {AudioEngine} engine
 * @param {Array} [allCategories] — all categories in current arc phase (needed for restore)
 */
export function applyTriggerActions(actions, engine, allCategories = []) {
  for (const { action } of actions) {
    const ramp = action.rampTime ?? 0.3;

    if (action.mute) {
      for (const cat of action.mute) {
        engine.muteCategory(cat, ramp);
      }
    }

    if (action.solo && action._muteTargets) {
      for (const cat of action._muteTargets) {
        engine.muteCategory(cat, ramp);
      }
    }

    if (action.restore) {
      for (const cat of allCategories) {
        if (engine.isTriggerMuted(cat)) {
          engine.restoreCategory(cat, ramp);
        }
      }
    }
  }
}
