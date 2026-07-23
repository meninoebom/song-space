/**
 * Session replay — drives a recorded landmark session (session-recorder.js)
 * through the real pipeline, deterministically and headlessly:
 *
 *   frames → MovementDetector → ReadingsEngine → RalfRuntime → action log
 *
 * This is the offline half of the tuning loop: record a dance session once
 * in the Quality Lab, then replay it against any change to a quality
 * formula (movement.js), a gate threshold (default.score.json), or the
 * runtime — in node, in CI, or visually in the lab. No webcam involved.
 *
 * Determinism: every module in the chain takes injected timestamps/dt, so
 * identical input frames produce identical qualities and readings. The one
 * random element is RalfRuntime's weighted draw() from intent pools; replay
 * swaps Math.random for a seeded generator for the duration of the run so
 * full runs are reproducible too.
 *
 * Runs in node and the browser (no DOM, no I/O).
 */

import { MovementDetector } from './movement.js';
import { ReadingsEngine } from './readings.js';
import { RalfRuntime } from './runtime.js';
import { CATEGORIES, QUALITY_KEYS } from './constants.js';
import { validateSession } from './session-recorder.js';

/** Mulberry32 — tiny seeded PRNG, plenty for weighted draws. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Output adapter that records actions (with timestamps) instead of playing audio. */
export function createRecordingEngine() {
  const muted = new Set();
  const log = [];
  let now = 0;
  return {
    loaded: true,
    log,
    _setTime(t) { now = t; },
    setCategoryVolume() {},
    isTriggerMuted(cat) { return muted.has(cat); },
    muteCategory(cat) { muted.add(cat); log.push({ t: now, action: 'mute', category: cat, quantized: false }); },
    muteCategoryQuantized(cat) { muted.add(cat); log.push({ t: now, action: 'mute', category: cat, quantized: true }); },
    restoreCategory(cat) { muted.delete(cat); log.push({ t: now, action: 'restore', category: cat, quantized: false }); },
    restoreCategoryQuantized(cat) { muted.delete(cat); log.push({ t: now, action: 'restore', category: cat, quantized: true }); },
    triggerOneshot(cat, db) { log.push({ t: now, action: 'oneshot', category: cat, db }); },
    sweepFilter(cat, from, to, duration) { log.push({ t: now, action: 'filter_sweep', category: cat, from, to, duration }); },
    setEffect(cat, effect, param, value) { log.push({ t: now, action: 'set_effect', category: cat, effect, param, value }); },
  };
}

/**
 * Replay a session through the pipeline.
 *
 * @param {Object} session — a session document (see session-recorder.js)
 * @param {Object} score — a loaded score (e.g. DEFAULT_SCORE); solo readings drive the run
 * @param {Object} [opts]
 * @param {number} [opts.seed=42] — seed for the intent-pool draws
 * @param {number} [opts.warmupSeconds=3] — frames before this are marked warmup
 *   and excluded from stats (AdaptiveRange normalizers recalibrate early on)
 * @returns {{ frames, actions, intentFires, readingEvents }}
 *   frames: [{ t, label, warmup, qualities, readings: { id: { value, active } } }]
 */
export function replaySession(session, score, { seed = 42, warmupSeconds = 3 } = {}) {
  validateSession(session);

  const detector = new MovementDetector();
  const readingsEngine = new ReadingsEngine(score.readings.solo);
  const engine = createRecordingEngine();
  const runtime = new RalfRuntime(
    { readings: score.readings.solo, intents: score.intents, mappings: score.mappings },
    engine,
  );

  const frames = [];
  const intentFires = [];
  const readingEvents = [];
  const prevActive = {};

  // Seeded draws for reproducible full runs (see module header).
  const realRandom = Math.random;
  Math.random = seededRandom(seed);
  try {
    let lastT = null;
    for (const frame of session.frames) {
      const dt = lastT === null ? 1 / 30 : Math.max(frame.t - lastT, 1e-6);
      lastT = frame.t;
      engine._setTime(frame.t);

      const qualities = detector.update(frame.bodies[0], frame.t);
      const readings = readingsEngine.update(qualities, frame.t);

      const firedBefore = { ...runtime._fired };
      runtime.update(readings, CATEGORIES, dt);
      for (const [key, fired] of Object.entries(runtime._fired)) {
        if (fired && !firedBefore[key]) intentFires.push({ t: frame.t, key });
      }

      const readingMap = {};
      for (const r of readings) {
        readingMap[r.id] = { value: r.value, active: r.active };
        const was = prevActive[r.id] ?? false;
        if (r.active !== was) readingEvents.push({ t: frame.t, id: r.id, active: r.active });
        prevActive[r.id] = r.active;
      }

      frames.push({
        t: frame.t,
        label: frame.label ?? 'unlabeled',
        warmup: frame.t < warmupSeconds,
        qualities: { ...qualities },
        readings: readingMap,
      });
    }
  } finally {
    Math.random = realRandom;
  }

  return { frames, actions: engine.log, intentFires, readingEvents };
}

/**
 * Per-label statistics over quality traces (warmup frames excluded).
 * @returns {{ [label]: { frames, qualities: { [q]: { mean, p10, p90 } } } }}
 */
export function labelStats(result, qualityKeys = QUALITY_KEYS) {
  const byLabel = {};
  for (const f of result.frames) {
    if (f.warmup) continue;
    (byLabel[f.label] ??= []).push(f);
  }

  const stats = {};
  for (const [label, frames] of Object.entries(byLabel)) {
    const qualities = {};
    for (const q of qualityKeys) {
      const values = frames.map(f => f.qualities[q] ?? 0).sort((a, b) => a - b);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const pick = (p) => values[Math.min(values.length - 1, Math.floor(p * values.length))];
      qualities[q] = { mean, p10: pick(0.1), p90: pick(0.9) };
    }
    stats[label] = { frames: frames.length, qualities };
  }
  return stats;
}

/**
 * How well one quality separates two labeled segments — the #48 graduation
 * question ("does jerkiness visibly separate staccato from flowing?") made
 * quantitative.
 *
 * separability is the balanced accuracy of the single best threshold
 * (0.5 = the quality carries no label information, 1.0 = a threshold
 * splits the segments perfectly). delta is the distance between label means.
 */
export function separation(result, quality, labelA, labelB) {
  const values = [];
  for (const f of result.frames) {
    if (f.warmup) continue;
    if (f.label === labelA || f.label === labelB) {
      values.push({ v: f.qualities[quality] ?? 0, isA: f.label === labelA });
    }
  }
  const a = values.filter(x => x.isA);
  const b = values.filter(x => !x.isA);
  if (a.length === 0 || b.length === 0) {
    throw new Error(`separation needs frames for both labels ("${labelA}": ${a.length}, "${labelB}": ${b.length})`);
  }

  const meanA = a.reduce((s, x) => s + x.v, 0) / a.length;
  const meanB = b.reduce((s, x) => s + x.v, 0) / b.length;

  // Best single-threshold balanced accuracy, trying midpoints between
  // consecutive distinct values. Balanced (per-class mean) so an 8s vs 20s
  // segment imbalance can't inflate the score.
  const sorted = [...values].sort((x, y) => x.v - y.v);
  let best = 0.5;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].v === sorted[i + 1].v) continue;
    const thr = (sorted[i].v + sorted[i + 1].v) / 2;
    const accA = a.filter(x => x.v >= thr).length / a.length;
    const accB = b.filter(x => x.v < thr).length / b.length;
    const balanced = (accA + accB) / 2;
    // The threshold can separate in either direction.
    best = Math.max(best, balanced, 1 - balanced);
  }

  return { quality, labelA, labelB, meanA, meanB, delta: Math.abs(meanA - meanB), separability: best };
}
