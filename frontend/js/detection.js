// Animation-frame loops for body detection and fallback playback.

import { computeRelational } from './movement.js';
import { drawSkeletons } from './skeleton.js';
import { updateDebug } from './debug.js';
import { averageReadings } from './utilities.js';
import * as webcam from './webcam.js';

const DEBUG = new URLSearchParams(window.location.search).has('debug');

// Synthetic engagement fed to the arc when there is no camera. It must clear
// arc.js MOVEMENT_TRIGGER_THRESHOLD (0.15) so the AWAIT phase advances, and stay
// above the PEAK early-breakdown stillness cutoff (0.05) so the arc runs its full
// journey. Mid-range (0.3) also yields mid-length phase durations. This is what
// makes "playing the song's arc automatically" true rather than a false promise.
const FALLBACK_VELOCITY = 0.3;

// If the camera is running while a song plays but no body has EVER been detected
// (dancer standing too close, below the pose-confidence thresholds), show the
// step-back framing hint after this many seconds. Once a body has been seen, the
// hint is instead driven by tracking loss (immediate), not this timer.
const NO_BODY_HINT_SECONDS = 5;

export function createDetectionLoop({ detectors, soloReadings, relReadingsEngine, getArc, getRuntime, engine, meter, bodyCanvas, skeletonCanvas, debugPanel, onPhaseUpdate, isPlaying, onFramingHint = () => {} }) {
  let lastFrameTime = null;
  // Tracking state for the step-back framing hint (reset per session via resetTime).
  let everTracked = false;   // has any body been detected this session?
  let playingSince = null;   // ts (s) when the current play session began, for the never-seen timeout

  function resetTime() { lastFrameTime = null; everTracked = false; playingSince = null; }

  function detectLoop() {
    const results = webcam.detect();
    const ts = performance.now() / 1000;
    const dt = lastFrameTime ? ts - lastFrameTime : 1 / 30;
    lastFrameTime = ts;
    const arc = getArc(), runtime = getRuntime();
    const playing = isPlaying() && !!arc;
    if (playing) { if (playingSince == null) playingSince = ts; } else { playingSince = null; }

    if (results) {
      const bodyCount = results.landmarks ? results.landmarks.length : 0;

      if (bodyCount > 0 && playing) {
        everTracked = true;
        const quals = [], reads = [];
        for (let i = 0; i < bodyCount && i < 2; i++) {
          quals.push(detectors[i].update(results.landmarks[i], ts));
          reads.push(soloReadings[i].update(quals[i]));
        }
        let relReadings = [], relQuals = null;
        if (bodyCount >= 2) {
          relQuals = computeRelational(quals[0], quals[1], detectors[0], detectors[1]);
          relReadings = relReadingsEngine.update(relQuals);
        }
        const finalReadings = [...averageReadings(reads), ...relReadings];
        const avgVel = quals.reduce((s, q) => s + (q.velocity || 0), 0) / quals.length;
        arc.update(dt, avgVel);
        const phase = arc.getCurrentPhase();
        if (phase) {
          if (runtime) runtime.update(finalReadings, phase.categories, dt, phase.id);
          onPhaseUpdate(phase);
        }
        drawSkeletons(bodyCanvas, results.landmarks, bodyCount, finalReadings);
        onFramingHint(false);
        if (DEBUG) {
          meter.render(finalReadings);
          drawSkeletons(skeletonCanvas, results.landmarks, bodyCount, finalReadings);
          updateDebug(debugPanel, quals, finalReadings, relQuals);
        }
      } else {
        // No tracked body (out of frame, too close, or not yet playing). Clear the
        // canvas so the last skeleton frame doesn't freeze as false feedback —
        // drawSkeletons clears via clearRect before drawing zero bodies.
        drawSkeletons(bodyCanvas, [], 0, []);
        if (DEBUG) drawSkeletons(skeletonCanvas, [], 0, []);
        if (playing) {
          arc.update(dt, 0);
          const phase = arc.getCurrentPhase();
          if (phase) onPhaseUpdate(phase);
          // Show the step-back hint if a body was tracked and dropped out, or if
          // none ever appeared within NO_BODY_HINT_SECONDS of play starting.
          const neverSeenTimeout = !everTracked && playingSince != null && (ts - playingSince) > NO_BODY_HINT_SECONDS;
          onFramingHint(everTracked || neverSeenTimeout);
        } else {
          onFramingHint(false);
        }
      }
    }

    if (webcam.isRunning()) requestAnimationFrame(detectLoop);
  }

  function fallbackLoop() {
    const arc = getArc();
    if (!isPlaying() || !arc) return;
    const ts = performance.now() / 1000;
    const dt = lastFrameTime ? ts - lastFrameTime : 1 / 30;
    lastFrameTime = ts;
    arc.update(dt, FALLBACK_VELOCITY);
    const phase = arc.getCurrentPhase();
    if (phase) onPhaseUpdate(phase);
    requestAnimationFrame(fallbackLoop);
  }

  return { detectLoop, fallbackLoop, resetTime };
}
