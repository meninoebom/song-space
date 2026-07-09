/**
 * Score integration tests — validates DEFAULT_SCORE config consistency.
 * Run with: node frontend/js/score.test.js
 */

import { DEFAULT_SCORE } from './score.js';
import { CATEGORIES, QUALITY_KEYS, ACTION_TYPES } from './constants.js';

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

// Body qualities — canonical list from constants.js (the input contract)
const VALID_QUALITIES = QUALITY_KEYS;

// Known relational qualities from movement.js computeRelational
const VALID_RELATIONAL = ['synchrony', 'contrast', 'aggregate_energy', 'proximity'];

const allReadings = [...DEFAULT_SCORE.readings.solo, ...DEFAULT_SCORE.readings.relational];

// ============================================================
// Arc config validation
// ============================================================

test('arc: all phase categories are valid', () => {
  for (const phase of DEFAULT_SCORE.arc.phases) {
    for (const cat of phase.categories) {
      assert(CATEGORIES.includes(cat), `phase "${phase.id}" has invalid category "${cat}"`);
    }
  }
});

test('arc: sectionMap references valid phase ids', () => {
  const phaseIds = DEFAULT_SCORE.arc.phases.map(p => p.id);
  for (const [phaseId, section] of Object.entries(DEFAULT_SCORE.arc.sectionMap)) {
    assert(phaseIds.includes(phaseId), `sectionMap references unknown phase "${phaseId}"`);
  }
});

test('arc: phases have required fields', () => {
  for (const phase of DEFAULT_SCORE.arc.phases) {
    assert(phase.id, 'phase missing id');
    assert(Array.isArray(phase.categories), `phase "${phase.id}" categories must be array`);
    assert(phase.categories.length > 0, `phase "${phase.id}" has no categories`);
  }
});

test('arc: every phase has a non-empty dancer-facing hint', () => {
  for (const phase of DEFAULT_SCORE.arc.phases) {
    assert(
      typeof phase.hint === 'string' && phase.hint.trim().length > 0,
      `phase "${phase.id}" is missing a non-empty hint`
    );
  }
});

// ============================================================
// Readings config validation
// ============================================================

test('readings: solo readings reference valid qualities in mix', () => {
  for (const r of DEFAULT_SCORE.readings.solo) {
    for (const q of Object.keys(r.mix)) {
      assert(VALID_QUALITIES.includes(q), `reading "${r.id}" mix references unknown quality "${q}"`);
    }
    if (r._invertInMix) {
      for (const q of Object.keys(r._invertInMix)) {
        assert(VALID_QUALITIES.includes(q), `reading "${r.id}" _invertInMix references unknown quality "${q}"`);
      }
    }
  }
});

test('readings: solo readings reference valid qualities in gate', () => {
  for (const r of DEFAULT_SCORE.readings.solo) {
    for (const q of Object.keys(r.gate)) {
      assert(VALID_QUALITIES.includes(q), `reading "${r.id}" gate references unknown quality "${q}"`);
    }
  }
});

test('readings: relational readings reference valid qualities', () => {
  for (const r of DEFAULT_SCORE.readings.relational) {
    for (const q of Object.keys(r.mix)) {
      assert(VALID_RELATIONAL.includes(q), `relational reading "${r.id}" mix references unknown quality "${q}"`);
    }
    for (const q of Object.keys(r.gate)) {
      assert(VALID_RELATIONAL.includes(q), `relational reading "${r.id}" gate references unknown quality "${q}"`);
    }
  }
});

test('readings: all reading ids are unique', () => {
  const ids = allReadings.map(r => r.id);
  const unique = new Set(ids);
  assert(ids.length === unique.size, `duplicate reading ids: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
});

test('readings: mix weights are positive and sum to > 0', () => {
  for (const r of allReadings) {
    const weights = Object.values(r.mix);
    assert(weights.length > 0, `reading "${r.id}" has empty mix`);
    assert(weights.every(w => w > 0), `reading "${r.id}" has non-positive mix weight`);
  }
});

// ============================================================
// Intent pool validation
// ============================================================

test('intents: all reading intents exist in intent pools', () => {
  for (const r of allReadings) {
    if (r.intents) {
      for (const intent of r.intents) {
        assert(DEFAULT_SCORE.intents[intent.intent], `reading "${r.id}" references missing intent "${intent.intent}"`);
      }
    }
    if (r.on_exit) {
      for (const intentName of r.on_exit) {
        assert(DEFAULT_SCORE.intents[intentName], `reading "${r.id}" on_exit references missing intent "${intentName}"`);
      }
    }
  }
});

test('intents: all intent pools have valid action types', () => {
  const validActions = ACTION_TYPES;
  for (const [name, pool] of Object.entries(DEFAULT_SCORE.intents)) {
    const options = Array.isArray(pool) ? pool : pool.pool;
    for (const opt of options) {
      assert(validActions.includes(opt.action), `intent "${name}" has unknown action "${opt.action}"`);
      assert(typeof opt.weight === 'number' && opt.weight > 0, `intent "${name}" option has invalid weight`);
    }
  }
});

test('intents: mute/solo actions reference valid categories', () => {
  for (const [name, pool] of Object.entries(DEFAULT_SCORE.intents)) {
    const options = Array.isArray(pool) ? pool : pool.pool;
    for (const opt of options) {
      if ((opt.action === 'mute' || opt.action === 'solo') && opt.args?.categories) {
        for (const cat of opt.args.categories) {
          assert(CATEGORIES.includes(cat), `intent "${name}" ${opt.action} references invalid category "${cat}"`);
        }
      }
    }
  }
});

test('intents: no orphan intents (every pool is referenced by a reading)', () => {
  const referenced = new Set();
  for (const r of allReadings) {
    if (r.intents) r.intents.forEach(i => referenced.add(i.intent));
    if (r.on_exit) r.on_exit.forEach(i => referenced.add(i));
  }
  for (const name of Object.keys(DEFAULT_SCORE.intents)) {
    assert(referenced.has(name), `intent pool "${name}" is never referenced by any reading`);
  }
});

// ============================================================
// Mappings validation
// ============================================================

test('mappings: fixedVolumes covers all categories', () => {
  const fv = DEFAULT_SCORE.mappings.fixedVolumes;
  for (const cat of CATEGORIES) {
    assert(fv[cat] !== undefined, `fixedVolumes missing category "${cat}"`);
    assert(typeof fv[cat] === 'number', `fixedVolumes["${cat}"] is not a number`);
  }
});

// ============================================================
// Cross-layer consistency
// ============================================================

test('cross-layer: intent modes are valid', () => {
  for (const r of allReadings) {
    if (r.intents) {
      for (const intent of r.intents) {
        assert(['edge', 'continuous'].includes(intent.mode), `reading "${r.id}" intent "${intent.intent}" has invalid mode "${intent.mode}"`);
      }
    }
  }
});

test('cross-layer: edge intents with "after" have positive delay', () => {
  for (const r of allReadings) {
    if (r.intents) {
      for (const intent of r.intents) {
        if (intent.after !== undefined) {
          assert(intent.after > 0, `reading "${r.id}" intent "${intent.intent}" has non-positive after delay`);
        }
      }
    }
  }
});

// ============================================================
// Summary
// ============================================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
