/**
 * Score-loader tests — the JSON score format contract (#62).
 * Run with: node frontend/js/score-loader.test.js
 *
 * Covers three things the acceptance criteria call for:
 *   1. Round-trip: the two shipped fixtures load through loadScore() and produce
 *      the same runtime objects the app consumes (behavior-identical to the old
 *      hand-authored JS scores — the existing score.test.js / runtime.test.js
 *      suites run against exactly these loaded objects and stay green).
 *   2. Human-readable validation failures across at least three failure classes.
 *   3. Schema conformance: both fixtures validate against the formal JSON Schema
 *      via the dependency-free Node validator (frontend/schema/validate.mjs).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadScore, ScoreValidationError } from './score-loader.js';
import { DEFAULT_SCORE, PROOF_SCORE } from './score.js';
import { validate } from '../schema/validate.mjs';

import defaultFixture from '../schema/scores/default.score.json' with { type: 'json' };
import proofFixture from '../schema/scores/proof.score.json' with { type: 'json' };

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, '../schema/score.schema.json'), 'utf8'));

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

// Deep clone so a failure-class mutation never leaks into another test.
const clone = (o) => JSON.parse(JSON.stringify(o));

// Capture the error thrown by a call, or null if it did not throw.
function threw(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

// ============================================================
// 1. Round-trip: fixtures load and match what the app exports
// ============================================================

test('round-trip: both fixtures load without throwing', () => {
  assert(threw(() => loadScore(clone(defaultFixture))) === null, 'default fixture should load cleanly');
  assert(threw(() => loadScore(clone(proofFixture))) === null, 'proof fixture should load cleanly');
});

test('round-trip: loaded score is the runtime shape the app consumes', () => {
  for (const [name, score] of [['DEFAULT', DEFAULT_SCORE], ['PROOF', PROOF_SCORE]]) {
    assert(score.arc && Array.isArray(score.arc.phases) && score.arc.phases.length > 0, `${name} has arc.phases`);
    assert(score.readings && Array.isArray(score.readings.solo), `${name} has readings.solo`);
    assert(score.intents && typeof score.intents === 'object', `${name} has intents`);
  }
});

test('round-trip: score.js exports equal the loaded fixtures (JSON is the source of truth)', () => {
  assert(JSON.stringify(DEFAULT_SCORE) === JSON.stringify(loadScore(clone(defaultFixture))),
    'DEFAULT_SCORE equals loadScore(default fixture)');
  assert(JSON.stringify(PROOF_SCORE) === JSON.stringify(loadScore(clone(proofFixture))),
    'PROOF_SCORE equals loadScore(proof fixture)');
});

// ============================================================
// 2. Validation failures — three classes, readable messages
// ============================================================

test('failure class A: unknown body quality in a reading mix', () => {
  const bad = clone(defaultFixture);
  bad.readings.solo[0].mix = { notARealQuality: 1 };
  const err = threw(() => loadScore(bad));
  assert(err instanceof ScoreValidationError, 'throws ScoreValidationError');
  assert(/unknown body quality "notARealQuality"/.test(err.message), 'names the offending quality in plain language');
  assert(/Valid ones:/.test(err.message), 'lists the valid qualities to fix it');
});

test('failure class B: unknown sound category in an arc phase', () => {
  const bad = clone(defaultFixture);
  bad.arc.phases[0].categories = ['not_a_category'];
  const err = threw(() => loadScore(bad));
  assert(err instanceof ScoreValidationError, 'throws ScoreValidationError');
  assert(/unknown sound category "not_a_category"/.test(err.message), 'names the offending category');
  assert(/The categories are:/.test(err.message), 'lists the valid categories');
});

test('failure class C: invalid interaction mode on a reading intent', () => {
  const bad = clone(defaultFixture);
  const withIntents = bad.readings.solo.find((r) => Array.isArray(r.intents) && r.intents.length);
  assert(!!withIntents, 'fixture has a reading with intents to corrupt');
  withIntents.intents[0].mode = 'telepathy';
  const err = threw(() => loadScore(bad));
  assert(err instanceof ScoreValidationError, 'throws ScoreValidationError');
  assert(/invalid mode "telepathy"/.test(err.message), 'names the bad mode');
});

test('validation: a completely empty document fails with one clear message', () => {
  const err = threw(() => loadScore(null));
  assert(err instanceof ScoreValidationError, 'throws ScoreValidationError');
  assert(/empty or is not a JSON object/.test(err.message), 'explains the document is empty');
});

test('validation: multiple problems are all reported at once', () => {
  const bad = clone(defaultFixture);
  bad.arc.phases[0].categories = ['nope'];
  bad.readings.solo[0].mix = { alsoNope: 1 };
  const err = threw(() => loadScore(bad));
  assert(err.problems.length >= 2, 'collects every problem, not just the first');
});

// ============================================================
// 3. Schema conformance — fixtures match the formal JSON Schema
// ============================================================

test('schema: both shipped fixtures conform to score.schema.json', () => {
  const dErr = validate(schema, defaultFixture);
  const pErr = validate(schema, proofFixture);
  assert(dErr.length === 0, `default fixture conforms (got: ${dErr.slice(0, 3).join('; ')})`);
  assert(pErr.length === 0, `proof fixture conforms (got: ${pErr.slice(0, 3).join('; ')})`);
});

test('schema: the validator actually rejects a malformed document', () => {
  const errs = validate(schema, { meta: { name: 'x' } }); // missing required arc/readings/intents
  assert(errs.length > 0, 'schema flags a document missing required top-level sections');
});

// ============================================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
