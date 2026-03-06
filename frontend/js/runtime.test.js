/**
 * Tests for RalfRuntime + draw — run with: node frontend/js/runtime.test.js
 */

import { draw, RalfRuntime } from './runtime.js';

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

// --- Mock AudioEngine ---
function mockEngine() {
  const calls = [];
  return {
    loaded: true,
    setCategoryVolume(cat, db) { calls.push({ fn: 'setCategoryVolume', cat, db }); },
    muteCategory(cat, ramp) { calls.push({ fn: 'muteCategory', cat, ramp }); },
    restoreCategory(cat, ramp) { calls.push({ fn: 'restoreCategory', cat, ramp }); },
    isTriggerMuted(cat) { return calls.some(c => c.fn === 'muteCategory' && c.cat === cat); },
    triggerOneshot(cat, db) { calls.push({ fn: 'triggerOneshot', cat, db }); },
    sweepFilter(cat, from, to, dur) { calls.push({ fn: 'sweepFilter', cat, from, to, dur }); },
    calls,
  };
}

const ALL_CATS = ['texture', 'bass', 'foundation', 'harmonic_bed', 'groove', 'hook', 'accent'];

// ============================================================
// Draw tests
// ============================================================

test('draw: empty pool returns null', () => {
  assert(draw([]) === null, 'should return null for empty pool');
});

test('draw: all zero weights returns null', () => {
  assert(draw([{ action: 'a', weight: 0 }]) === null, 'should return null');
});

test('draw: single option always returns it', () => {
  const opt = { action: 'a', weight: 1 };
  for (let i = 0; i < 10; i++) {
    assert(draw([opt]) === opt, `iteration ${i}`);
  }
});

test('draw: respects weights (statistical)', () => {
  const heavy = { action: 'heavy', weight: 100 };
  const light = { action: 'light', weight: 1 };
  let heavyCount = 0;
  for (let i = 0; i < 200; i++) {
    if (draw([heavy, light]) === heavy) heavyCount++;
  }
  assert(heavyCount > 150, `heavy should win most of 200 draws, got ${heavyCount}`);
});

test('draw: negative weights ignored', () => {
  const a = { action: 'a', weight: -5 };
  const b = { action: 'b', weight: 1 };
  for (let i = 0; i < 10; i++) {
    assert(draw([a, b]) === b, 'should always pick b');
  }
});

// ============================================================
// RalfRuntime: edge intent tests
// ============================================================

test('runtime: edge intent fires on rising edge', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'test', mix: {}, gate: {},
        intents: [{ intent: 'do_thing', mode: 'edge' }] },
    ],
    intents: {
      do_thing: [{ action: 'mute', args: { categories: ['groove'] }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  // Frame 1: inactive
  rt.update([{ id: 'test', value: 0, active: false }], ALL_CATS);
  const mutesBefore = engine.calls.filter(c => c.fn === 'muteCategory').length;
  // Frame 2: active (rising edge)
  rt.update([{ id: 'test', value: 0.8, active: true }], ALL_CATS);
  const mutesAfter = engine.calls.filter(c => c.fn === 'muteCategory').length;
  assert(mutesAfter > mutesBefore, 'should fire mute on rising edge');
});

test('runtime: edge intent does NOT fire while sustained', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'test', mix: {}, gate: {},
        intents: [{ intent: 'do_thing', mode: 'edge' }] },
    ],
    intents: {
      do_thing: [{ action: 'mute', args: { categories: ['groove'] }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  rt.update([{ id: 'test', value: 0, active: false }], ALL_CATS);
  rt.update([{ id: 'test', value: 0.8, active: true }], ALL_CATS);
  const countAfterEdge = engine.calls.filter(c => c.fn === 'muteCategory').length;
  // Frame 3: still active
  rt.update([{ id: 'test', value: 0.8, active: true }], ALL_CATS);
  const countAfterSustain = engine.calls.filter(c => c.fn === 'muteCategory').length;
  assert(countAfterSustain === countAfterEdge, 'should NOT fire again while sustained');
});

test('runtime: edge intent with after delay', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'still', mix: {}, gate: {},
        intents: [{ intent: 'drop_drums', mode: 'edge', after: 2 }] },
    ],
    intents: {
      drop_drums: [{ action: 'mute', args: { categories: ['groove'] }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  rt.update([{ id: 'still', value: 0, active: false }], ALL_CATS);
  // Activate
  rt.update([{ id: 'still', value: 0.8, active: true }], ALL_CATS, 0.5);
  assert(engine.calls.filter(c => c.fn === 'muteCategory').length === 0, 'should not fire yet at 0.5s');
  rt.update([{ id: 'still', value: 0.8, active: true }], ALL_CATS, 1.0);
  assert(engine.calls.filter(c => c.fn === 'muteCategory').length === 0, 'should not fire yet at 1.5s');
  rt.update([{ id: 'still', value: 0.8, active: true }], ALL_CATS, 1.0);
  assert(engine.calls.filter(c => c.fn === 'muteCategory').length > 0, 'should fire after 2.5s');
});

test('runtime: on_exit fires on falling edge', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'still', mix: {}, gate: {},
        intents: [],
        on_exit: ['restore_energy'] },
    ],
    intents: {
      restore_energy: [{ action: 'restore', args: { rampTime: 0.05 }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  // Pre-mute groove so restore has something to do
  engine.muteCategory('groove', 0.3);
  // Active
  rt.update([{ id: 'still', value: 0.8, active: true }], ALL_CATS);
  const restoresBefore = engine.calls.filter(c => c.fn === 'restoreCategory').length;
  // Deactivate (falling edge)
  rt.update([{ id: 'still', value: 0, active: false }], ALL_CATS);
  const restoresAfter = engine.calls.filter(c => c.fn === 'restoreCategory').length;
  assert(restoresAfter > restoresBefore, 'should fire restore on falling edge');
});

test('runtime: phase gating filters mute to allowed categories', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'test', mix: {}, gate: {},
        intents: [{ intent: 'mute_groove', mode: 'edge' }] },
    ],
    intents: {
      mute_groove: [{ action: 'mute', args: { categories: ['groove', 'hook'] }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  rt.update([{ id: 'test', value: 0, active: false }], ['texture', 'groove']); // hook not allowed
  rt.update([{ id: 'test', value: 0.8, active: true }], ['texture', 'groove']);
  const mutes = engine.calls.filter(c => c.fn === 'muteCategory');
  assert(mutes.length === 1, `should mute 1 category, got ${mutes.length}`);
  assert(mutes[0]?.cat === 'groove', 'should mute groove (allowed), not hook');
});

test('runtime: oneshot action', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'clap', mix: {}, gate: {},
        intents: [{ intent: 'clap_accent', mode: 'edge' }] },
    ],
    intents: {
      clap_accent: [{ action: 'oneshot', args: { category: 'accent', volumeDb: -6 }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  rt.update([{ id: 'clap', value: 0, active: false }], ALL_CATS);
  rt.update([{ id: 'clap', value: 1, active: true }], ALL_CATS);
  assert(engine.calls.some(c => c.fn === 'triggerOneshot' && c.cat === 'accent'), 'should trigger oneshot');
});

test('runtime: reset clears all state', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'test', mix: {}, gate: {},
        intents: [{ intent: 'do_thing', mode: 'edge' }] },
    ],
    intents: {
      do_thing: [{ action: 'mute', args: { categories: ['groove'] }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  rt.update([{ id: 'test', value: 0, active: false }], ALL_CATS);
  rt.update([{ id: 'test', value: 0.8, active: true }], ALL_CATS);
  rt.reset();
  // After reset, active→active should NOT be a rising edge
  rt.update([{ id: 'test', value: 0.8, active: true }], ALL_CATS);
  // But it IS a rising edge because reset cleared _edgeState (was false/undefined → true)
  // Actually after reset, _edgeState is {}, so next frame with active=true IS a rising edge
  // This is correct behavior — reset means "start fresh"
  const mutes = engine.calls.filter(c => c.fn === 'muteCategory').length;
  assert(mutes === 2, `should fire twice (once before reset, once after), got ${mutes}`);
});

// ============================================================
// Summary
// ============================================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
