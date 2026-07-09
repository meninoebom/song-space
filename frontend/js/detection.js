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

export function createDetectionLoop({ detectors, soloReadings, relReadingsEngine, getArc, getRuntime, engine, meter, bodyCanvas, skeletonCanvas, debugPanel, onPhaseUpdate, isPlaying }) {
  let lastFrameTime = null;

  function resetTime() { lastFrameTime = null; }

  function detectLoop() {
    const results = webcam.detect();
    const ts = performance.now() / 1000;
    const dt = lastFrameTime ? ts - lastFrameTime : 1 / 30;
    lastFrameTime = ts;
    const arc = getArc(), runtime = getRuntime();

    if (results) {
      const bodyCount = results.landmarks ? results.landmarks.length : 0;

      if (bodyCount > 0 && isPlaying() && arc) {
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
        meter.render(finalReadings);
        if (DEBUG) {
          drawSkeletons(skeletonCanvas, results.landmarks, bodyCount, finalReadings);
          updateDebug(debugPanel, quals, finalReadings, relQuals);
        }
      } else if (isPlaying() && arc) {
        arc.update(dt, 0);
        const phase = arc.getCurrentPhase();
        if (phase) onPhaseUpdate(phase);
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
