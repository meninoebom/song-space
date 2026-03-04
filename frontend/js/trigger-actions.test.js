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
    triggerOneshot(cat, volumeDb) { calls.push({ method: 'triggerOneshot', cat, volumeDb }); },
    sweepFilter(cat, from, to, duration) { calls.push({ method: 'sweepFilter', cat, from, to, duration }); },
    setActiveLoop(cat, index) { calls.push({ method: 'setActiveLoop', cat, index }); },
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

// ============================================================
// Test 6: oneshot action calls triggerOneshot
// ============================================================
test('oneshot action calls triggerOneshot', () => {
  const eng = mockEngine();
  applyTriggerActions([
    { triggerId: 'clap-hit', action: { oneshot: { category: 'accent', volumeDb: -6 } } }
  ], eng);
  assert(eng.calls.length === 1, 'one call');
  assert(eng.calls[0].method === 'triggerOneshot', 'calls triggerOneshot');
  assert(eng.calls[0].cat === 'accent', 'correct category');
  assert(eng.calls[0].volumeDb === -6, 'correct volume');
});

// ============================================================
// Test 7: filterSweep action calls sweepFilter
// ============================================================
test('filterSweep action calls sweepFilter', () => {
  const eng = mockEngine();
  applyTriggerActions([
    { triggerId: 'open-filter', action: { filterSweep: { category: 'bass', from: 200, to: 2000, duration: 2 } } }
  ], eng);
  assert(eng.calls.length === 1, 'one call');
  assert(eng.calls[0].method === 'sweepFilter', 'calls sweepFilter');
  assert(eng.calls[0].cat === 'bass', 'correct category');
  assert(eng.calls[0].from === 200, 'correct from');
  assert(eng.calls[0].to === 2000, 'correct to');
  assert(eng.calls[0].duration === 2, 'correct duration');
});

// ============================================================
// Test 8: swapLoop action calls setActiveLoop
// ============================================================
test('swapLoop action calls setActiveLoop', () => {
  const eng = mockEngine();
  applyTriggerActions([
    { triggerId: 'groove-swap', action: { swapLoop: { category: 'groove', index: 2 } } }
  ], eng);
  assert(eng.calls.length === 1, 'one call');
  assert(eng.calls[0].method === 'setActiveLoop', 'calls setActiveLoop');
  assert(eng.calls[0].cat === 'groove', 'correct category');
  assert(eng.calls[0].index === 2, 'correct index');
});

// ============================================================
// Test 9: mixed old + new action types work together
// ============================================================
test('mixed action types apply in sequence', () => {
  const eng = mockEngine();
  applyTriggerActions([
    { triggerId: 'a', action: { mute: ['groove'], rampTime: 0.3 } },
    { triggerId: 'b', action: { oneshot: { category: 'accent', volumeDb: -8 } } },
    { triggerId: 'c', action: { filterSweep: { category: 'bass', from: 500, to: 5000, duration: 1 } } },
  ], eng);
  assert(eng.calls.length === 3, 'three calls');
  assert(eng.calls[0].method === 'mute', 'first is mute');
  assert(eng.calls[1].method === 'triggerOneshot', 'second is oneshot');
  assert(eng.calls[2].method === 'sweepFilter', 'third is filter sweep');
});

// --- Summary ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
