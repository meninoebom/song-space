/**
 * Tests for applyTriggerActions — run with: node frontend/js/trigger-actions.test.js
 */

import { applyTriggerActions } from './trigger-actions.js';

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

/** Mock AudioEngine that records calls */
function mockEngine() {
  const calls = [];
  const muted = new Set();
  return {
    calls,
    muteCategory(cat, rampTime) { calls.push({ method: 'mute', cat, rampTime }); muted.add(cat); },
    restoreCategory(cat, rampTime) { calls.push({ method: 'restore', cat, rampTime }); muted.delete(cat); },
    isTriggerMuted(cat) { return muted.has(cat); },
  };
}

// ============================================================
// Test 1: mute action
// ============================================================
test('mute action calls muteCategory for each target', () => {
  const eng = mockEngine();
  applyTriggerActions([
    { triggerId: 'drums-drop', action: { mute: ['groove'], rampTime: 0.3 } }
  ], eng);
  assert(eng.calls.length === 1, 'one call');
  assert(eng.calls[0].method === 'mute', 'calls muteCategory');
  assert(eng.calls[0].cat === 'groove', 'correct category');
  assert(eng.calls[0].rampTime === 0.3, 'passes rampTime');
});

// ============================================================
// Test 2: solo action mutes _muteTargets
// ============================================================
test('solo action mutes all _muteTargets', () => {
  const eng = mockEngine();
  applyTriggerActions([
    { triggerId: 'strip-down', action: { solo: ['texture'], _muteTargets: ['bass', 'groove'], rampTime: 0.5 } }
  ], eng);
  assert(eng.calls.length === 2, 'two mute calls');
  assert(eng.calls[0].cat === 'bass', 'mutes bass');
  assert(eng.calls[1].cat === 'groove', 'mutes groove');
  assert(eng.calls[0].rampTime === 0.5, 'passes rampTime');
});

// ============================================================
// Test 3: restore action restores all trigger-muted categories
// ============================================================
test('restore action calls restoreCategory for provided categories', () => {
  const eng = mockEngine();
  // Pre-mute some categories
  eng.muteCategory('groove', 0.3);
  eng.muteCategory('bass', 0.3);
  eng.calls.length = 0; // clear setup calls

  applyTriggerActions([
    { triggerId: 'energy-slam', action: { restore: true, rampTime: 0.05 } }
  ], eng, ['groove', 'bass', 'texture']);
  // Should restore groove and bass (the ones that were trigger-muted)
  assert(eng.calls.length === 2, 'restores two categories');
  assert(eng.calls[0].method === 'restore', 'calls restoreCategory');
  assert(eng.calls[0].rampTime === 0.05, 'passes rampTime');
});

// ============================================================
// Test 4: multiple actions in one frame
// ============================================================
test('applies multiple actions in sequence', () => {
  const eng = mockEngine();
  applyTriggerActions([
    { triggerId: 'a', action: { mute: ['groove'], rampTime: 0.3 } },
    { triggerId: 'b', action: { mute: ['bass'], rampTime: 0.3 } },
  ], eng);
  assert(eng.calls.length === 2, 'two calls');
  assert(eng.calls[0].cat === 'groove', 'first mute');
  assert(eng.calls[1].cat === 'bass', 'second mute');
});

// ============================================================
// Test 5: empty actions array is a no-op
// ============================================================
test('empty actions array does nothing', () => {
  const eng = mockEngine();
  applyTriggerActions([], eng);
  assert(eng.calls.length === 0, 'no calls');
});

// --- Summary ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
