/**
 * INPUT ADAPTER: MediaPipe Pose → Qualities
 *
 * This is the MediaPipe implementation of the input adapter contract
 * (see QUALITY_KEYS in constants.js, docs/solutions/adapter-architecture.md).
 *
 * Takes raw MediaPipe Pose landmarks (33 points, 2D normalized coordinates)
 * and produces the standard qualities object — the 11 QUALITY_KEYS floats
 * (all 0-1) that the brain (ReadingsEngine + RalfRuntime) consumes, plus
 * any lab-only candidate qualities not yet graduated into QUALITY_KEYS
 * (currently: jerkiness, #48).
 *
 * A different input adapter (Kinect, body suit, LiDAR) would implement
 * the same output shape using different sensor data and computation.
 *
 * Usage:
 *   const detector = new MovementDetector();
 *   // In detection loop:
 *   const qualities = detector.update(landmarks, timestamp);
 *   // qualities = { velocity, impulse, coherence, contraction,
 *   //               verticality, wristSpread, armsRaised, legBend,
 *   //               headTilt, jump, step } (all 0-1)
 */

import { QUALITY_KEYS } from './constants.js';

// --- One-Euro Filter (smooth noisy landmark coordinates) ---

class LowPassFilter {
  constructor() { this.y = null; this.s = null; }
  filter(value, alpha) {
    if (this.y === null) { this.s = value; }
    else { this.s = alpha * value + (1 - alpha) * this.s; }
    this.y = value;
    return this.s;
  }
}

class OneEuroFilter {
  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter(); this.dxFilter = new LowPassFilter();
    this.lastTime = null;
  }
  alpha(cutoff, dt) {
    return 1.0 / (1.0 + 1.0 / (2 * Math.PI * cutoff) / dt);
  }
  filter(value, timestamp) {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      return this.xFilter.filter(value, 1.0);
    }
    const dt = Math.max(timestamp - this.lastTime, 1e-6);
    this.lastTime = timestamp;
    const dValue = (value - (this.xFilter.s ?? value)) / dt;
    const edValue = this.dxFilter.filter(dValue, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    return this.xFilter.filter(value, this.alpha(cutoff, dt));
  }
}

// --- Adaptive Range Normalizer ---
// Tracks observed min/max, normalizes to 0-1. Expands instantly, contracts slowly.

class AdaptiveRange {
  constructor(initialMin = 0, initialMax = 0.001, decayRate = 0.998) {
    this.min = initialMin;
    this.max = initialMax;
    this.decayRate = decayRate;
  }
  normalize(value) {
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;
    const mid = (this.min + this.max) / 2;
    this.min += (mid - this.min) * (1 - this.decayRate);
    this.max -= (this.max - mid) * (1 - this.decayRate);
    const range = this.max - this.min;
    // Pure divide-by-zero guard. Must stay far below any pinned max floor
    // (jerkiness pins max at 1e-4): if this epsilon can reach a legitimate
    // floor, a pinned-at-floor range short-circuits to 0.5 forever and the
    // quality reads mid-scale even at perfect stillness.
    if (range < 1e-9) return 0.5;
    return Math.max(0, Math.min(1, (value - this.min) / range));
  }
}

// --- Helpers ---

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function mean(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function angleBetween(a, b, c) {
  // Angle at point b formed by segments b→a and b→c
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);
  if (magBA < 1e-6 || magBC < 1e-6) return Math.PI;
  return Math.acos(Math.max(-1, Math.min(1, dot / (magBA * magBC))));
}

function jointVelocities(landmarks, prev, joints) {
  const vels = [];
  for (const idx of joints) {
    if (landmarks[idx].visibility > 0.3 && prev[idx].visibility > 0.3) {
      vels.push(dist(landmarks[idx], prev[idx]));
    }
  }
  return vels;
}

// --- Joint indices (MediaPipe Pose) ---
const LEFT_JOINTS = [11, 13, 15, 23, 25, 27];
const RIGHT_JOINTS = [12, 14, 16, 24, 26, 28];
const BODY_JOINTS = [...LEFT_JOINTS, ...RIGHT_JOINTS];
const WINDOW = 30; // ~1 second at 30fps
const JERK_WINDOW = 10; // frames — Ralf's canonical windowed-variance-of-acceleration formulation

export class MovementDetector {
  constructor() {
    // Landmark smoothing (33 landmarks, x + y each)
    this.landmarkFilters = Array.from({ length: 33 }, () => ({
      x: new OneEuroFilter(1.0, 0.007, 1.0),
      y: new OneEuroFilter(1.0, 0.007, 1.0),
    }));

    // Adaptive normalizers per quality
    this.ranges = {
      velocity:      new AdaptiveRange(0, 0.005),
      contraction:   new AdaptiveRange(0.01, 0.15),
      verticality:   new AdaptiveRange(0.02, 0.2),
      coherence:     new AdaptiveRange(0, 0.01, 0.999),
      // NOT wired into QUALITY_KEYS yet — see the jerkiness comment near the
      // computation below and #48. Lab-only until a dance session validates it.
      jerkiness:     new AdaptiveRange(0, 0.0001, 0.999),
      wristSpread:   new AdaptiveRange(0, 0.3),
      armsRaised:    new AdaptiveRange(-0.1, 0.3),
      headTilt:      new AdaptiveRange(0, 0.1),
      legBend:       new AdaptiveRange(0, Math.PI),
    };

    // History buffers
    this.prevLandmarks = null;
    this.velocityHistory = [];
    this.leftVelHistory = [];
    this.rightVelHistory = [];
    this.velDiffHistory = [];
    this.accelHistory = [];

    // Impulse: Schmitt trigger state
    this._impulseValue = 0;
    this._impulseArmed = true;

    // Step detection: ankle Y drop events (spike-and-decay)
    this._ankleYHistory = { left: [], right: [] };
    this._stepValue = 0;
    this._stepCooldown = 0;

    // Jump: spike-and-decay
    this._jumpValue = 0;
    this._hipYHistory = [];
  }

  /** Smooth raw MediaPipe landmarks through One-Euro filters. */
  smooth(landmarks, timestamp) {
    return landmarks.map((lm, i) => ({
      x: this.landmarkFilters[i].x.filter(lm.x, timestamp),
      y: this.landmarkFilters[i].y.filter(lm.y, timestamp),
      visibility: lm.visibility,
    }));
  }

  /**
   * Main entry point. Takes raw landmarks + timestamp, returns qualities object.
   * Call once per frame (~30fps).
   */
  update(rawLandmarks, timestamp) {
    const landmarks = this.smooth(rawLandmarks, timestamp);
    return this._computePrimitives(landmarks);
  }

  _computePrimitives(landmarks) {
    const out = {
      velocity: 0, impulse: 0, coherence: 0, step: 0,
      contraction: 0.5, verticality: 0.5, wristSpread: 0.5,
      armsRaised: 0, legBend: 0.5, headTilt: 0, jump: 0,
      // jerkiness: lab-only quality, not in QUALITY_KEYS (see computation below + #48)
      jerkiness: 0,
    };

    // Torso length for scale-normalization (shoulder midpoint to hip midpoint)
    const lShoulder = landmarks[11], rShoulder = landmarks[12];
    const lHip = landmarks[23], rHip = landmarks[24];
    const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
    const hipMidY = (lHip.y + rHip.y) / 2;
    const centerX = (lShoulder.x + rShoulder.x + lHip.x + rHip.x) / 4;
    const centerY = (lShoulder.y + rShoulder.y + lHip.y + rHip.y) / 4;
    const center = { x: centerX, y: centerY };
    const torsoLength = Math.max(dist(
      { x: (lShoulder.x + rShoulder.x) / 2, y: shoulderMidY },
      { x: (lHip.x + rHip.x) / 2, y: hipMidY }
    ), 0.01);

    // === SHAPE PRIMITIVES ===

    // Contraction: mean distance of all 4 extremities from body center (inverted)
    // High = compact (ball), Low = expanded (spread-eagle)
    {
      const extremities = [15, 16, 27, 28] // wrists + ankles
        .filter(i => landmarks[i].visibility > 0.3)
        .map(i => dist(landmarks[i], center));
      if (extremities.length > 0) {
        out.contraction = 1 - this.ranges.contraction.normalize(mean(extremities));
      }
    }

    // Verticality: head height relative to hip center
    const nose = landmarks[0];
    if (nose.visibility > 0.3 && lHip.visibility > 0.3 && rHip.visibility > 0.3) {
      out.verticality = this.ranges.verticality.normalize(hipMidY - nose.y);
    }

    // Wrist spread
    if (landmarks[15].visibility > 0.3 && landmarks[16].visibility > 0.3) {
      out.wristSpread = this.ranges.wristSpread.normalize(Math.abs(landmarks[15].x - landmarks[16].x));
    }

    // Arms raised: how much wrists are above shoulders (Y is 0=top, 1=bottom)
    const lWrist = landmarks[15], rWrist = landmarks[16];
    if (lShoulder.visibility > 0.3 && rShoulder.visibility > 0.3 &&
        lWrist.visibility > 0.3 && rWrist.visibility > 0.3) {
      const avgWristY = (lWrist.y + rWrist.y) / 2;
      out.armsRaised = this.ranges.armsRaised.normalize(shoulderMidY - avgWristY);
    }

    // Head tilt: nose X offset from shoulder midpoint
    if (nose.visibility > 0.3 && landmarks[11].visibility > 0.3 && landmarks[12].visibility > 0.3) {
      const shoulderMidX = (landmarks[11].x + landmarks[12].x) / 2;
      out.headTilt = this.ranges.headTilt.normalize(Math.abs(nose.x - shoulderMidX));
    }

    // Leg bend: average knee angle (lower angle = more bent)
    {
      const kneeAngles = [];
      if (landmarks[23].visibility > 0.3 && landmarks[25].visibility > 0.3 && landmarks[27].visibility > 0.3) {
        kneeAngles.push(angleBetween(landmarks[23], landmarks[25], landmarks[27]));
      }
      if (landmarks[24].visibility > 0.3 && landmarks[26].visibility > 0.3 && landmarks[28].visibility > 0.3) {
        kneeAngles.push(angleBetween(landmarks[24], landmarks[26], landmarks[28]));
      }
      if (kneeAngles.length > 0) {
        out.legBend = 1 - this.ranges.legBend.normalize(mean(kneeAngles));
      }
    }

    // Jump detection: hip Y rises above rolling baseline
    if (lHip.visibility > 0.3 && rHip.visibility > 0.3) {
      if (this._hipYHistory.length >= 10) {
        const baseline = mean(this._hipYHistory);
        if (baseline - hipMidY > 0.06 && this._jumpValue < 0.3) {
          this._jumpValue = 1.0;
        }
      }
      this._hipYHistory.push(hipMidY);
      while (this._hipYHistory.length > 60) this._hipYHistory.shift();
    }
    this._jumpValue *= 0.85;
    out.jump = this._jumpValue;

    // === KINEMATIC PRIMITIVES ===

    if (!this.prevLandmarks) {
      this.prevLandmarks = landmarks;
      return out;
    }

    const leftVels = jointVelocities(landmarks, this.prevLandmarks, LEFT_JOINTS);
    const rightVels = jointVelocities(landmarks, this.prevLandmarks, RIGHT_JOINTS);
    const allVels = [...leftVels, ...rightVels];
    // Normalize by torso length: "body-lengths per frame" instead of pixels
    const frameVel = mean(allVels) / torsoLength;
    // Peak joint velocity — for impulse detection (catches stomps, kicks, punches)
    const peakVel = allVels.length > 0 ? Math.max(...allVels) / torsoLength : 0;

    this.prevLandmarks = landmarks;

    this.velocityHistory.push(frameVel);
    // Normalize left/right by torso length too (consistent with frameVel)
    this.leftVelHistory.push(mean(leftVels) / torsoLength);
    this.rightVelHistory.push(mean(rightVels) / torsoLength);
    this.velDiffHistory.push((mean(leftVels) - mean(rightVels)) / torsoLength);

    for (const h of [this.velocityHistory, this.leftVelHistory,
                      this.rightVelHistory, this.velDiffHistory]) {
      while (h.length > WINDOW) h.shift();
    }

    // Velocity (pin min at 0 — zero velocity is absolute, prevents AdaptiveRange drift)
    // Pin velocity range — min=0 (absolute), max≥0.05 (well above jitter floor)
    // Standing-still jitter is ~0.002 normalized. With max=0.05, that normalizes
    // to ~0.04, safely below the stillness gate (0.12 - 0.05 hysteresis = 0.07).
    // Too-small max causes jitter to dominate, breaking stillness detection.
    this.ranges.velocity.min = 0;
    this.ranges.velocity.max = Math.max(this.ranges.velocity.max, 0.05);
    out.velocity = this.ranges.velocity.normalize(mean(this.velocityHistory));
    this.ranges.velocity.min = 0;
    this.ranges.velocity.max = Math.max(this.ranges.velocity.max, 0.05);

    // Impulse: Schmitt trigger on PEAK JOINT velocity (not mean).
    // Mean dilutes sharp movements in one body part (stomps, kicks, punches).
    // Peak catches any joint that moves sharply, regardless of what else is still.
    const peakVelNorm = Math.min(1, peakVel / Math.max(this.ranges.velocity.max * 3, 0.15));
    let impulseFired = false;
    if (this._impulseArmed) {
      if (peakVelNorm > 0.4) {
        this._impulseValue = 1.0;
        this._impulseArmed = false;
        impulseFired = true;
      }
    } else {
      if (peakVelNorm < 0.2) {
        this._impulseArmed = true;
      }
    }
    this._impulseValue *= 0.85;
    out.impulse = this._impulseValue;

    // Step: spike-and-decay on foot strike (ankle Y drops).
    {
      const lAnkle = landmarks[27], rAnkle = landmarks[28];

      if (this._stepCooldown > 0) this._stepCooldown--;

      for (const [side, ankle] of [['left', lAnkle], ['right', rAnkle]]) {
        if (ankle.visibility < 0.3) continue;
        const hist = this._ankleYHistory[side];
        hist.push(ankle.y);
        while (hist.length > 15) hist.shift();

        if (hist.length >= 10 && this._stepCooldown === 0) {
          const baseline = mean(hist.slice(0, -3));
          if (ankle.y - baseline > 0.02) {
            this._stepValue = 1.0;
            this._stepCooldown = 5;
          }
        }
      }

      this._stepValue *= 0.8;
      out.step = this._stepValue;
    }

    // Coherence: left/right moving together — only meaningful when moving
    if (this.velDiffHistory.length > 5 && out.velocity > 0.05) {
      const meanDiff = mean(this.velDiffHistory);
      const variance = this.velDiffHistory.reduce((acc, d) => acc + (d - meanDiff) ** 2, 0) / this.velDiffHistory.length;
      out.coherence = 1 - this.ranges.coherence.normalize(Math.sqrt(variance));
      this.ranges.coherence.min = 0; // pin: zero variance is absolute coherence
    }

    // Jerkiness: windowed variance of acceleration (torso-normalized, One-Euro
    // smoothed via landmarkFilters upstream). NOT the mean-aggregated third
    // derivative (`|frameAccel - prevAccel|` then mean) the original 2026-03-07
    // implementation used — that formulation was noise-prone and got culled for
    // not reading as meaningful (docs/LEARNINGS.md, .llm/raw-learnings.md). This
    // is a different, untried hypothesis: variance of the acceleration signal
    // itself over a short window, which should stay low for smooth/rhythmic
    // acceleration and spike for staccato speed-ups and slow-downs. Formula and
    // window size (10 frames) per Ralf's adapters/shared/quality-math.ts
    // computeJerkiness. Lab-only (see quality-lab.html) pending validation — see
    // out.jerkiness init comment and #48.
    {
      // frame-to-frame acceleration = delta of consecutive torso-normalized
      // frame velocities already sitting in velocityHistory (no extra state).
      if (this.velocityHistory.length >= 2) {
        const frameAccel = this.velocityHistory[this.velocityHistory.length - 1] -
          this.velocityHistory[this.velocityHistory.length - 2];
        this.accelHistory.push(frameAccel);
        while (this.accelHistory.length > JERK_WINDOW) this.accelHistory.shift();
      }

      if (this.accelHistory.length >= 3) {
        const accelMean = mean(this.accelHistory);
        const accelVariance = this.accelHistory.reduce((acc, a) => acc + (a - accelMean) ** 2, 0) / this.accelHistory.length;

        // Pin min=0 (zero variance is an absolute floor — perfectly even
        // acceleration, not a discovered extreme) before AND after normalize,
        // per the CLAUDE.md AdaptiveRange pinning rule: noise_floor / max_pin
        // must stay below gate_threshold - HYSTERESIS_BAND (0.05).
        //
        // Provisional max floor 0.0001: standing-still velocity jitter is
        // ~0.002 (see the velocity pin above), so frame-to-frame acceleration
        // jitter (difference of two independent ~0.002 jitters) is roughly
        // 0.002 * sqrt(2) ≈ 0.0028, giving a jitter variance of ≈ 0.0028^2 ≈
        // 7.8e-6. At max_pin=0.0001 that normalizes to ≈0.08 — well below any
        // plausible gate threshold minus hysteresis once a jerkiness reading
        // is authored (the culled score used `jerkiness < 0.5` as its gate).
        // This number has NOT been validated against real dance data; the
        // Quality Lab session (#48) is the pending gate for tuning it.
        this.ranges.jerkiness.min = 0;
        this.ranges.jerkiness.max = Math.max(this.ranges.jerkiness.max, 0.0001);
        out.jerkiness = this.ranges.jerkiness.normalize(accelVariance);
        this.ranges.jerkiness.min = 0;
        this.ranges.jerkiness.max = Math.max(this.ranges.jerkiness.max, 0.0001);
      }
    }

    return out;
  }

  /** Expose velocity history for relational computation (synchrony). */
  getVelocityHistory() {
    return this.velocityHistory;
  }
}

// --- Relational qualities (cross-body) ---
// Ported from Ralf's relational.ts. Pure function, no state.

// Used for relational computation — excludes 'jump' (impulse event, not continuous shape)
const RELATIONAL_KEYS = QUALITY_KEYS.filter(k => k !== 'jump');

/**
 * Compute relational qualities between two bodies.
 * @param {Object} q1 — qualities from body 1 (0-1 values)
 * @param {Object} q2 — qualities from body 2 (0-1 values)
 * @param {MovementDetector} det1 — detector 1 (for velocity history)
 * @param {MovementDetector} det2 — detector 2 (for velocity history)
 * @returns {{ synchrony: number, contrast: number, aggregate_energy: number }}
 */
export function computeRelational(q1, q2, det1, det2) {
  // Synchrony: Pearson correlation of velocity histories
  const h1 = det1.getVelocityHistory();
  const h2 = det2.getVelocityHistory();
  const synchrony = pearsonCorrelation(h1, h2);

  // Contrast: L2 distance of quality vectors, normalized to 0-1
  // Max possible L2 distance for N dimensions of [0,1] values = sqrt(N)
  let sumSq = 0;
  for (const k of RELATIONAL_KEYS) {
    const d = (q1[k] ?? 0) - (q2[k] ?? 0);
    sumSq += d * d;
  }
  const maxDist = Math.sqrt(RELATIONAL_KEYS.length);
  const contrast = Math.sqrt(sumSq) / maxDist;

  // Aggregate energy: mean velocity across both bodies
  const aggregate_energy = ((q1.velocity ?? 0) + (q2.velocity ?? 0)) / 2;

  return { synchrony, contrast, aggregate_energy };
}

function pearsonCorrelation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;

  // Use the last n values from each
  const x = a.slice(-n);
  const y = b.slice(-n);

  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += x[i]; sumY += y[i]; }
  const meanX = sumX / n, meanY = sumY / n;

  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX, dy = y[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  if (denom < 1e-10) return 0;

  // Pearson is -1 to 1; map to 0-1 (0 = opposite, 0.5 = uncorrelated, 1 = in sync)
  return (num / denom + 1) / 2;
}
