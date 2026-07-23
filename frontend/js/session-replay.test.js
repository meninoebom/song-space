/**
 * Session record/replay tests.
 * Run with: node frontend/js/session-replay.test.js
 *
 * Two jobs:
 *   1. Contract-test the harness itself: recorder round-trip, session
 *      validation, and bit-identical replay determinism.
 *   2. Give the perception layer (movement.js) its first headless coverage,
 *      by replaying SYNTHETIC landmark sessions with known movement character:
 *      still, flowing (smooth 0.5 Hz sway), and staccato (hold-then-snap).
 *      Synthetic streams validate code behavior — that the formulas respond
 *      in the right direction with sane magnitudes. They do NOT validate feel;
 *      that stays with recorded real-dance sessions and Brandon's ears (#48, #18).
 */

import { SessionRecorder, validateSession } from './session-recorder.js';
import { replaySession, labelStats, separation, seededRandom } from './session-replay.js';
import { DEFAULT_SCORE } from './score.js';
import { QUALITY_KEYS } from './constants.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function test(name, fn) {
  console.log(`\n▸ ${name}`);
  fn();
}

// ============================================================
// Synthetic body generator
// ============================================================

// A plausible standing pose in MediaPipe normalized coordinates (y grows
// downward). Only the joints movement.js reads need to be anatomically
// sensible; the rest sit near the torso with full visibility.
const BASE_POSE = (() => {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.4 }));
  lm[0] = { x: 0.5, y: 0.25 };   // nose
  lm[11] = { x: 0.56, y: 0.35 }; // shoulders
  lm[12] = { x: 0.44, y: 0.35 };
  lm[13] = { x: 0.6, y: 0.45 };  // elbows
  lm[14] = { x: 0.4, y: 0.45 };
  lm[15] = { x: 0.62, y: 0.55 }; // wrists
  lm[16] = { x: 0.38, y: 0.55 };
  lm[23] = { x: 0.54, y: 0.55 }; // hips
  lm[24] = { x: 0.46, y: 0.55 };
  lm[25] = { x: 0.54, y: 0.7 };  // knees
  lm[26] = { x: 0.46, y: 0.7 };
  lm[27] = { x: 0.54, y: 0.85 }; // ankles
  lm[28] = { x: 0.46, y: 0.85 };
  return lm;
})();

const FPS = 30;

/**
 * Build one frame of the synthetic body.
 * @param {number} sway — horizontal offset applied to the whole body
 * @param {Function} noise — deterministic jitter source (seeded PRNG)
 */
function makeBody(sway, noise) {
  return BASE_POSE.map(lm => ({
    x: lm.x + sway + (noise() - 0.5) * 0.001,
    y: lm.y + (noise() - 0.5) * 0.001,
    visibility: 1,
  }));
}

/**
 * Synthetic session: 4s still, then `seconds` of flowing (smooth sinusoidal
 * sway), then `seconds` of staccato (hold ~0.3s, snap to a new position over
 * 2 frames, hold again). Flowing and staccato are constructed to have similar
 * AVERAGE displacement per second — what differs is the acceleration pattern,
 * which is exactly what jerkiness claims to measure.
 */
function makeSyntheticSession(seconds = 8) {
  const recorder = new SessionRecorder();
  recorder.start(['still', 'flowing', 'staccato']);
  const noise = seededRandom(7);
  let t = 0;
  const step = 1 / FPS;

  for (let i = 0; i < 4 * FPS; i++, t += step) {
    recorder.addFrame([makeBody(0, noise)], t);
  }

  // Flowing: 0.05-amplitude sway at 0.75 Hz → mean displacement
  // 4·A·f = 0.15 body-widths/sec.
  recorder.cycleLabel(); // → flowing
  const flowStart = t;
  for (let i = 0; i < seconds * FPS; i++, t += step) {
    const sway = 0.05 * Math.sin(2 * Math.PI * 0.75 * (t - flowStart));
    recorder.addFrame([makeBody(sway, noise)], t);
  }

  // Staccato: snap 0.075 every 15 frames (hold 13, move 2) → the same 0.15
  // body-widths/sec as flowing, so AVERAGE velocity matches by construction
  // and only the acceleration pattern differs.
  recorder.cycleLabel(); // → staccato
  let sway = 0;
  let target = 0.0375;
  let framesInPhase = 0;
  let moving = false;
  for (let i = 0; i < seconds * FPS; i++, t += step) {
    framesInPhase++;
    if (!moving && framesInPhase >= 13) {      // held ~0.43s → snap
      moving = true;
      framesInPhase = 0;
    } else if (moving && framesInPhase >= 2) { // snap complete → hold
      moving = false;
      framesInPhase = 0;
      target = -target;
    }
    if (moving) sway += (target - sway) / 2;   // cover the distance in ~2 frames
    recorder.addFrame([makeBody(sway, noise)], t);
  }

  return recorder.stop();
}

const session = makeSyntheticSession();
const result = replaySession(session, DEFAULT_SCORE);
const stats = labelStats(result, [...QUALITY_KEYS, 'jerkiness']);

// ============================================================
// 1. Harness contract
// ============================================================

test('recorder round-trip produces a valid session', () => {
  assert(validateSession(session) === session, 'recorder output passes validateSession');
  assert(session.frame_count === session.frames.length, 'frame_count matches frames');
  assert(session.frames.every(f => f.bodies[0].length === 33), 'every frame has 33 landmarks');
  assert(session.labels.join(',') === 'still,flowing,staccato', 'labels preserved');
  assert(session.frames[0].label === 'still', 'first frame carries the first label');
  assert(session.frames[session.frames.length - 1].label === 'staccato', 'last frame carries the last label');
});

test('validateSession rejects malformed documents', () => {
  const throws = (doc) => { try { validateSession(doc); return false; } catch { return true; } };
  assert(throws(null), 'rejects null');
  assert(throws({ format: 'other' }), 'rejects wrong format');
  assert(throws({ format: 'song-space-session', frames: [] }), 'rejects empty frames');
  assert(throws({ format: 'song-space-session', frames: [{ t: 0 }] }), 'rejects frames without bodies');
});

test('replay is deterministic', () => {
  const again = replaySession(session, DEFAULT_SCORE);
  assert(JSON.stringify(result.frames) === JSON.stringify(again.frames), 'quality/reading traces are identical');
  assert(JSON.stringify(result.actions) === JSON.stringify(again.actions), 'action logs are identical');
  assert(JSON.stringify(result.intentFires) === JSON.stringify(again.intentFires), 'intent fires are identical');
});

test('replay output shape', () => {
  assert(result.frames.length === session.frames.length, 'one output frame per input frame');
  const last = result.frames[result.frames.length - 1];
  assert(QUALITY_KEYS.every(k => typeof last.qualities[k] === 'number'), 'all QUALITY_KEYS present');
  assert(result.frames.every(f => QUALITY_KEYS.every(k =>
    f.qualities[k] >= 0 && f.qualities[k] <= 1 && Number.isFinite(f.qualities[k]))),
    'every quality stays finite and within 0-1');
  assert(Object.keys(last.readings).length === DEFAULT_SCORE.readings.solo.length, 'all solo readings present');
});

// ============================================================
// 2. Perception-layer behavior on known movement
// ============================================================

test('still body reads as still (the velocity pin-math claim)', () => {
  // CLAUDE.md: standing-still jitter must normalize well below the stillness
  // gate minus hysteresis (0.07). This is the first executable check of that.
  assert(stats.still.qualities.velocity.mean < 0.07,
    `still velocity mean ${stats.still.qualities.velocity.mean.toFixed(3)} should be < 0.07`);
});

test('flowing and staccato both read as moving', () => {
  assert(stats.flowing.qualities.velocity.mean > 0.15,
    `flowing velocity mean ${stats.flowing.qualities.velocity.mean.toFixed(3)} should be > 0.15`);
  assert(stats.staccato.qualities.velocity.mean > 0.15,
    `staccato velocity mean ${stats.staccato.qualities.velocity.mean.toFixed(3)} should be > 0.15`);
});

test('jerkiness separates staccato from flowing on synthetic movement (#48 direction check)', () => {
  const sep = separation(result, 'jerkiness', 'staccato', 'flowing');
  assert(sep.meanA > sep.meanB,
    `staccato jerkiness (${sep.meanA.toFixed(3)}) should exceed flowing (${sep.meanB.toFixed(3)})`);
  assert(sep.separability > 0.7,
    `separability ${sep.separability.toFixed(2)} should be > 0.7 on clean synthetic input`);
});

test('jerkiness carries more staccato-vs-flowing signal than velocity', () => {
  // Both segments move the same distance per second by construction, so the
  // velocity means sit close together while the jerkiness means split wide.
  // (Effect size, not threshold accuracy: on noise-free synthetic traces any
  // consistent hair-width gap yields high separability, so comparing
  // separabilities would be fragile.)
  const vel = separation(result, 'velocity', 'staccato', 'flowing');
  const jerk = separation(result, 'jerkiness', 'staccato', 'flowing');
  assert(jerk.delta > vel.delta,
    `jerkiness mean gap (${jerk.delta.toFixed(2)}) should exceed velocity's (${vel.delta.toFixed(2)})`);
});

test('labelStats covers all three segments', () => {
  assert(Object.keys(stats).sort().join(',') === 'flowing,staccato,still', 'stats keyed by label');
  assert(stats.flowing.frames > 0 && stats.staccato.frames > 0, 'labeled segments have frames');
});

// ============================================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
