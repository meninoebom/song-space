#!/usr/bin/env node
/**
 * Replay a recorded Quality Lab session headlessly and print a tuning report.
 * Node-only (imports node:fs); never referenced by any served page.
 *
 * Usage:
 *   node frontend/js/replay-cli.js <session.json> [options]
 *
 * Options:
 *   --separate <quality:labelA:labelB>  print a separation verdict for one
 *       quality between two labeled segments (repeatable). If the session
 *       contains both "flowing" and "staccato" labels and no --separate is
 *       given, defaults to jerkiness:flowing:staccato (the #48 gate).
 *   --warmup <seconds>   frames to exclude from stats (default 3)
 *   --seed <n>           seed for intent-pool draws (default 42)
 *
 * Reads qualities that are lab-only (e.g. jerkiness before graduation) as
 * well as QUALITY_KEYS, since MovementDetector emits both.
 */

import { readFileSync } from 'node:fs';
import { DEFAULT_SCORE } from './score.js';
import { QUALITY_KEYS } from './constants.js';
import { replaySession, labelStats, separation } from './session-replay.js';

// Graduation criterion for a candidate quality (the #48 question).
// A quality "visibly separates" two movement styles when a single threshold
// classifies frames well above chance AND the label means are far enough
// apart to survive gate hysteresis (HYSTERESIS_BAND is 0.05, so a delta
// below ~2× that cannot hold a gate open reliably).
const GRADUATION = { minSeparability: 0.85, minDelta: 0.10 };

function judgeGraduation(sep) {
  const pass = sep.separability >= GRADUATION.minSeparability && sep.delta >= GRADUATION.minDelta;
  return {
    pass,
    detail: `separability ${sep.separability.toFixed(2)} (need ≥ ${GRADUATION.minSeparability}), ` +
      `mean delta ${sep.delta.toFixed(2)} (need ≥ ${GRADUATION.minDelta})`,
  };
}

function parseArgs(argv) {
  const opts = { separate: [], warmup: 3, seed: 42, path: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--separate') opts.separate.push(argv[++i]);
    else if (a === '--warmup') opts.warmup = Number(argv[++i]);
    else if (a === '--seed') opts.seed = Number(argv[++i]);
    else if (!opts.path) opts.path = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  if (!opts.path) throw new Error('Usage: node frontend/js/replay-cli.js <session.json> [--separate q:a:b] [--warmup N] [--seed N]');
  return opts;
}

function fmt(v) { return v.toFixed(2); }

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const session = JSON.parse(readFileSync(opts.path, 'utf8'));

  const result = replaySession(session, DEFAULT_SCORE, { seed: opts.seed, warmupSeconds: opts.warmup });
  const trackedKeys = [...QUALITY_KEYS, 'jerkiness'].filter(
    (k, i, arr) => arr.indexOf(k) === i && result.frames.some(f => k in f.qualities),
  );
  const stats = labelStats(result, trackedKeys);

  console.log(`\nSession: ${opts.path}`);
  console.log(`  ${session.frame_count} frames, ${session.duration_sec?.toFixed(1)}s, labels: ${(session.labels ?? []).join(', ') || '(none)'}`);
  console.log(`  warmup excluded from stats: first ${opts.warmup}s\n`);

  // Per-label quality table
  for (const [label, s] of Object.entries(stats)) {
    console.log(`  [${label}] (${s.frames} frames)          mean   p10   p90`);
    for (const q of trackedKeys) {
      const qs = s.qualities[q];
      console.log(`    ${q.padEnd(22)} ${fmt(qs.mean)}  ${fmt(qs.p10)}  ${fmt(qs.p90)}`);
    }
    console.log('');
  }

  // Reading activity
  const activeTotals = {};
  let statFrames = 0;
  for (const f of result.frames) {
    if (f.warmup) continue;
    statFrames++;
    for (const [id, r] of Object.entries(f.readings)) {
      if (r.active) activeTotals[id] = (activeTotals[id] ?? 0) + 1;
    }
  }
  const enters = {};
  for (const e of result.readingEvents) if (e.active) enters[e.id] = (enters[e.id] ?? 0) + 1;
  console.log('  Readings                 active%  activations');
  for (const config of DEFAULT_SCORE.readings.solo) {
    const pct = statFrames ? (100 * (activeTotals[config.id] ?? 0)) / statFrames : 0;
    console.log(`    ${config.id.padEnd(22)} ${pct.toFixed(0).padStart(5)}%  ${enters[config.id] ?? 0}`);
  }

  // Fired edge intents + actions
  console.log('\n  Edge intents fired:');
  if (result.intentFires.length === 0) console.log('    (none)');
  for (const f of result.intentFires) console.log(`    ${f.t.toFixed(1)}s  ${f.key}`);

  const actionCounts = {};
  for (const a of result.actions) {
    const k = `${a.action} ${a.category}`;
    actionCounts[k] = (actionCounts[k] ?? 0) + 1;
  }
  console.log('\n  Actions (count):');
  const entries = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) console.log('    (none)');
  for (const [k, n] of entries.slice(0, 20)) console.log(`    ${k.padEnd(28)} ${n}`);

  // Separation verdicts
  let separations = opts.separate;
  const labels = new Set(result.frames.map(f => f.label));
  if (separations.length === 0 && labels.has('flowing') && labels.has('staccato')) {
    separations = ['jerkiness:flowing:staccato'];
  }
  for (const spec of separations) {
    const [quality, a, b] = spec.split(':');
    const sep = separation(result, quality, a, b);
    const verdict = judgeGraduation(sep);
    console.log(`\n  Separation — ${quality}: "${a}" (mean ${fmt(sep.meanA)}) vs "${b}" (mean ${fmt(sep.meanB)})`);
    console.log(`    ${verdict.pass ? 'SEPARATES' : 'DOES NOT SEPARATE'} — ${verdict.detail}`);
  }
  console.log('');
}

main();
