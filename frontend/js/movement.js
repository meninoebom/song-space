/**
 * Movement detection — extracts body qualities from MediaPipe Pose landmarks.
 * Movement analysis engine — MediaPipe landmarks to body qualities.
 *
 * Usage:
 *   const detector = new MovementDetector();
 *   // In detection loop:
 *   const qualities = detector.update(landmarks, timestamp);
 *   // qualities = { velocity, jerkiness, symmetry, coherence, contraction,
 *   //               verticality, ankleSpread, wristSpread, armsRaised,
 *   //               torsoTwist, headTilt, armAsymmetry, legBend,
 *   //               movementScale } (all 0-1)
 */

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
    if (range < 0.0001) return 0.5;
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

function lineAngle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
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
      jerk:          new AdaptiveRange(0, 0.001),
      contraction:   new AdaptiveRange(0.01, 0.15),
      verticality:   new AdaptiveRange(0.02, 0.2),
      symmetry:      new AdaptiveRange(0, 1, 0.999),
      limbExtension: new AdaptiveRange(0, 0.3),
      coherence:     new AdaptiveRange(0, 0.01, 0.999),
      ankleSpread:   new AdaptiveRange(0, 0.2),
      wristSpread:   new AdaptiveRange(0, 0.3),
      armsRaised:    new AdaptiveRange(-0.1, 0.3),
      torsoTwist:    new AdaptiveRange(0, 0.5),
      headTilt:      new AdaptiveRange(0, 0.1),
      armAsymmetry:  new AdaptiveRange(0, 0.3),
      legBend:       new AdaptiveRange(0, Math.PI),
      movementScale: new AdaptiveRange(0, 0.1),
    };

    // History buffers
    this.prevLandmarks = null;
    this.prevPrevLandmarks = null;
    this.velocityHistory = [];
    this.accelHistory = [];
    this.jerkHistory = [];
    this.leftVelHistory = [];
    this.rightVelHistory = [];
    this.velDiffHistory = [];

    // Impulse state for clap/jump
    this._clapValue = 0;
    this._jumpValue = 0;
    this._wristDistHistory = [];
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
      velocity: 0, jerkiness: 0, contraction: 0.5, verticality: 0.5,
      symmetry: 0.5, coherence: 0.5, ankleSpread: 0.5, wristSpread: 0.5,
      armsRaised: 0, torsoTwist: 0, headTilt: 0, armAsymmetry: 0,
      legBend: 0.5, movementScale: 0, clap: 0, jump: 0,
    };

    // === SHAPE PRIMITIVES ===

    // Contraction: wrist-to-hip distance + shoulder width (inverted)
    const lWristHip = (landmarks[15].visibility > 0.3 && landmarks[23].visibility > 0.3)
      ? dist(landmarks[15], landmarks[23]) : null;
    const rWristHip = (landmarks[16].visibility > 0.3 && landmarks[24].visibility > 0.3)
      ? dist(landmarks[16], landmarks[24]) : null;
    const shoulderWidth = (landmarks[11].visibility > 0.3 && landmarks[12].visibility > 0.3)
      ? dist(landmarks[11], landmarks[12]) : null;

    if (lWristHip !== null || rWristHip !== null) {
      const avgReach = mean([lWristHip, rWristHip].filter(v => v !== null));
      const rawContraction = shoulderWidth !== null ? avgReach + shoulderWidth : avgReach;
      out.contraction = 1 - this.ranges.contraction.normalize(rawContraction);
    }

    // Verticality: head height relative to hip center
    const nose = landmarks[0];
    const lHip = landmarks[23], rHip = landmarks[24];
    if (nose.visibility > 0.3 && lHip.visibility > 0.3 && rHip.visibility > 0.3) {
      const hipMidY = (lHip.y + rHip.y) / 2;
      out.verticality = this.ranges.verticality.normalize(hipMidY - nose.y);
    }

    // Limb extension: extremity distance from body center
    const centerX = (landmarks[11].x + landmarks[12].x + landmarks[23].x + landmarks[24].x) / 4;
    const centerY = (landmarks[11].y + landmarks[12].y + landmarks[23].y + landmarks[24].y) / 4;
    const extDists = [15, 16, 27, 28]
      .filter(i => landmarks[i].visibility > 0.3)
      .map(i => Math.sqrt((landmarks[i].x - centerX) ** 2 + (landmarks[i].y - centerY) ** 2));
    if (extDists.length > 0) {
      out._limbExtension = this.ranges.limbExtension.normalize(mean(extDists));
    }

    // Ankle spread
    if (landmarks[27].visibility > 0.3 && landmarks[28].visibility > 0.3) {
      out.ankleSpread = this.ranges.ankleSpread.normalize(Math.abs(landmarks[27].x - landmarks[28].x));
    }

    // Wrist spread
    if (landmarks[15].visibility > 0.3 && landmarks[16].visibility > 0.3) {
      out.wristSpread = this.ranges.wristSpread.normalize(Math.abs(landmarks[15].x - landmarks[16].x));
    }

    // Arms raised: how much wrists are above shoulders (Y is 0=top, 1=bottom)
    const lShoulder = landmarks[11], rShoulder = landmarks[12];
    const lWrist = landmarks[15], rWrist = landmarks[16];
    if (lShoulder.visibility > 0.3 && rShoulder.visibility > 0.3 &&
        lWrist.visibility > 0.3 && rWrist.visibility > 0.3) {
      const avgShoulderY = (lShoulder.y + rShoulder.y) / 2;
      const avgWristY = (lWrist.y + rWrist.y) / 2;
      out.armsRaised = this.ranges.armsRaised.normalize(avgShoulderY - avgWristY);
    }

    // Torso twist: angle between shoulder line and hip line
    if (landmarks[11].visibility > 0.3 && landmarks[12].visibility > 0.3 &&
        landmarks[23].visibility > 0.3 && landmarks[24].visibility > 0.3) {
      const shoulderAngle = lineAngle(landmarks[11], landmarks[12]);
      const hipAngle = lineAngle(landmarks[23], landmarks[24]);
      out.torsoTwist = this.ranges.torsoTwist.normalize(Math.abs(shoulderAngle - hipAngle));
    }

    // Head tilt: nose X offset from shoulder midpoint
    if (nose.visibility > 0.3 && landmarks[11].visibility > 0.3 && landmarks[12].visibility > 0.3) {
      const shoulderMidX = (landmarks[11].x + landmarks[12].x) / 2;
      out.headTilt = this.ranges.headTilt.normalize(Math.abs(nose.x - shoulderMidX));
    }

    // Arm asymmetry: difference in left vs right arm extension
    if (landmarks[11].visibility > 0.3 && landmarks[13].visibility > 0.3 && landmarks[15].visibility > 0.3 &&
        landmarks[12].visibility > 0.3 && landmarks[14].visibility > 0.3 && landmarks[16].visibility > 0.3) {
      const leftExt = dist(landmarks[11], landmarks[13]) + dist(landmarks[13], landmarks[15]);
      const rightExt = dist(landmarks[12], landmarks[14]) + dist(landmarks[14], landmarks[16]);
      out.armAsymmetry = this.ranges.armAsymmetry.normalize(Math.abs(leftExt - rightExt));
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
        // Invert: smaller angle (more bent) → higher value
        out.legBend = 1 - this.ranges.legBend.normalize(mean(kneeAngles));
      }
    }

    // Movement scale: bounding box area of visible extremities
    {
      const extremities = [0, 15, 16, 27, 28]
        .filter(i => landmarks[i].visibility > 0.3)
        .map(i => landmarks[i]);
      if (extremities.length >= 2) {
        const xs = extremities.map(p => p.x);
        const ys = extremities.map(p => p.y);
        const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        out.movementScale = this.ranges.movementScale.normalize(area);
      }
    }

    // Clap detection: wrist distance drops below threshold while velocity is high
    if (landmarks[15].visibility > 0.3 && landmarks[16].visibility > 0.3) {
      const wristDist = dist(landmarks[15], landmarks[16]);
      this._wristDistHistory.push(wristDist);
      while (this._wristDistHistory.length > 10) this._wristDistHistory.shift();

      const wasSpread = this._wristDistHistory.length >= 4 &&
        this._wristDistHistory[this._wristDistHistory.length - 4] > 0.15;
      const hasVelocity = this.velocityHistory.length > 0 &&
        mean(this.velocityHistory.slice(-5)) > 0.001;
      if (wristDist < 0.08 && wasSpread && hasVelocity && this._clapValue < 0.3) {
        this._clapValue = 1.0;
      }
    }
    this._clapValue *= 0.85;
    out.clap = this._clapValue;

    // Jump detection: hip Y rises above rolling baseline
    if (lHip.visibility > 0.3 && rHip.visibility > 0.3) {
      const hipMidY = (lHip.y + rHip.y) / 2;

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
    const frameVel = mean(allVels);

    let frameAccel = 0;
    if (this.prevPrevLandmarks) {
      const prevVels = jointVelocities(this.prevLandmarks, this.prevPrevLandmarks, BODY_JOINTS);
      if (prevVels.length > 0 && allVels.length > 0) {
        frameAccel = Math.abs(mean(allVels) - mean(prevVels));
      }
    }

    let frameJerk = 0;
    if (this.accelHistory.length > 0) {
      frameJerk = Math.abs(frameAccel - this.accelHistory[this.accelHistory.length - 1]);
    }

    this.prevPrevLandmarks = this.prevLandmarks;
    this.prevLandmarks = landmarks;

    this.velocityHistory.push(frameVel);
    this.accelHistory.push(frameAccel);
    this.jerkHistory.push(frameJerk);
    this.leftVelHistory.push(mean(leftVels));
    this.rightVelHistory.push(mean(rightVels));
    this.velDiffHistory.push(mean(leftVels) - mean(rightVels));

    for (const h of [this.velocityHistory, this.accelHistory, this.jerkHistory,
                      this.leftVelHistory, this.rightVelHistory, this.velDiffHistory]) {
      while (h.length > WINDOW) h.shift();
    }

    // Velocity
    out.velocity = this.ranges.velocity.normalize(mean(this.velocityHistory));

    // Jerkiness
    if (this.jerkHistory.length > 3) {
      out.jerkiness = this.ranges.jerk.normalize(mean(this.jerkHistory));
    }

    // Symmetry
    if (this.leftVelHistory.length > 5) {
      const mL = mean(this.leftVelHistory);
      const mR = mean(this.rightVelHistory);
      out.symmetry = Math.min(mL, mR) / Math.max(mL, mR, 0.0001);
    }

    // Coherence
    if (this.velDiffHistory.length > 5) {
      const meanDiff = mean(this.velDiffHistory);
      const variance = this.velDiffHistory.reduce((acc, d) => acc + (d - meanDiff) ** 2, 0) / this.velDiffHistory.length;
      out.coherence = 1 - this.ranges.coherence.normalize(Math.sqrt(variance));
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

const QUALITY_KEYS = ['velocity', 'jerkiness', 'symmetry', 'coherence', 'contraction', 'verticality', 'ankleSpread', 'wristSpread', 'armsRaised', 'torsoTwist', 'headTilt', 'armAsymmetry', 'legBend', 'movementScale'];

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
  for (const k of QUALITY_KEYS) {
    const d = (q1[k] ?? 0) - (q2[k] ?? 0);
    sumSq += d * d;
  }
  const maxDist = Math.sqrt(QUALITY_KEYS.length);
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
