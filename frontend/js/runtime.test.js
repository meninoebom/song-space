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
// Mirrors the real engine: the quantized mute/restore variants flip _triggerMuted
// synchronously (see audio-engine.js), so isTriggerMuted reflects intent
// immediately. Quantized and non-quantized calls record under the same fn name so
// assertions don't care which variant the runtime chose.
function mockEngine() {
  const calls = [];
  const muted = new Set();
  return {
    loaded: true,
    setCategoryVolume(cat, db) { calls.push({ fn: 'setCategoryVolume', cat, db }); },
    muteCategory(cat, ramp) { muted.add(cat); calls.push({ fn: 'muteCategory', cat, ramp }); },
    muteCategoryQuantized(cat, ramp) { muted.add(cat); calls.push({ fn: 'muteCategory', cat, ramp, quantized: true }); },
    restoreCategory(cat, ramp) { muted.delete(cat); calls.push({ fn: 'restoreCategory', cat, ramp }); },
    restoreCategoryQuantized(cat, ramp) { muted.delete(cat); calls.push({ fn: 'restoreCategory', cat, ramp, quantized: true }); },
    isTriggerMuted(cat) { return muted.has(cat); },
    triggerOneshot(cat, db) { calls.push({ fn: 'triggerOneshot', cat, db }); },
    sweepFilter(cat, from, to, dur) { calls.push({ fn: 'sweepFilter', cat, from, to, dur }); },
    setEffect(cat, effect, param, value) { calls.push({ fn: 'setEffect', cat, effect, param, value }); },
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
// Fixed-volume mix tests
// ============================================================

test('runtime: fixedVolumes applied per frame, phase-gated to -60dB', () => {
  const engine = mockEngine();
  const score = {
    readings: [],
    intents: {},
    mappings: { fixedVolumes: { texture: -8, bass: -10, foundation: -10, harmonic_bed: -10, groove: -10, hook: -12, accent: -14 } },
  };
  const rt = new RalfRuntime(score, engine);
  rt.update([], ['texture', 'bass']); // only texture + bass in phase
  const lastVol = cat => {
    const c = engine.calls.filter(x => x.fn === 'setCategoryVolume' && x.cat === cat);
    return c[c.length - 1]?.db;
  };
  assert(lastVol('texture') === -8, `texture should be its fixed -8, got ${lastVol('texture')}`);
  assert(lastVol('bass') === -10, `bass should be its fixed -10, got ${lastVol('bass')}`);
  assert(lastVol('groove') === -60, `groove should be -60 (out of phase), got ${lastVol('groove')}`);
});

// ============================================================
// Engine guard and action coverage
// ============================================================

test('runtime: engine.loaded=false skips all processing', () => {
  const engine = mockEngine();
  engine.loaded = false;
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
  const actionCalls = engine.calls.filter(c => c.fn !== 'muteCategory' || c.cat !== 'groove');
  const muteCalls = engine.calls.filter(c => c.fn === 'muteCategory' && c.cat === 'groove');
  assert(muteCalls.length === 0, 'should not fire any actions when engine not loaded');
});

test('runtime: solo action mutes non-solo categories', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'test', mix: {}, gate: {},
        intents: [{ intent: 'solo_bass', mode: 'edge' }] },
    ],
    intents: {
      solo_bass: [{ action: 'solo', args: { categories: ['bass'] }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  rt.update([{ id: 'test', value: 0, active: false }], ALL_CATS);
  rt.update([{ id: 'test', value: 0.8, active: true }], ALL_CATS);
  const mutes = engine.calls.filter(c => c.fn === 'muteCategory');
  assert(mutes.length === ALL_CATS.length - 1, `should mute ${ALL_CATS.length - 1} categories, got ${mutes.length}`);
  assert(!mutes.some(c => c.cat === 'bass'), 'should NOT mute bass (solo target)');
});

test('runtime: solo restores a trigger-muted member so it is audible', () => {
  // Reproduces the #53 bug: a prior mute (e.g. energy_high_exit) left hook muted,
  // then a suspended_solo drawing ['texture','harmonic_bed','hook'] must un-mute hook.
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'suspended', mix: {}, gate: {},
        intents: [{ intent: 'suspended_solo', mode: 'edge' }] },
    ],
    intents: {
      suspended_solo: [{ action: 'solo', args: { categories: ['texture', 'harmonic_bed', 'hook'] }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  engine.muteCategory('hook', 0.3); // hook was trigger-muted earlier
  assert(engine.isTriggerMuted('hook'), 'precondition: hook starts trigger-muted');
  rt.update([{ id: 'suspended', value: 0, active: false }], ALL_CATS);
  rt.update([{ id: 'suspended', value: 0.8, active: true }], ALL_CATS);
  assert(!engine.isTriggerMuted('hook'), 'solo should restore hook (member) so it plays');
  assert(engine.isTriggerMuted('bass'), 'solo should mute non-member bass');
});

test('runtime: filter_sweep action calls sweepFilter', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'test', mix: {}, gate: {},
        intents: [{ intent: 'sweep', mode: 'edge' }] },
    ],
    intents: {
      sweep: [{ action: 'filter_sweep', args: { category: 'bass', from: 200, to: 2000, duration: 1.5 }, weight: 1 }],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  rt.update([{ id: 'test', value: 0, active: false }], ALL_CATS);
  rt.update([{ id: 'test', value: 0.8, active: true }], ALL_CATS);
  const sweeps = engine.calls.filter(c => c.fn === 'sweepFilter');
  assert(sweeps.length === 1, `should call sweepFilter once, got ${sweeps.length}`);
  assert(sweeps[0].cat === 'bass', 'should sweep bass');
  assert(sweeps[0].from === 200 && sweeps[0].to === 2000, 'should pass correct freq range');
});

// ============================================================
// Score integration: new readings from T7
// ============================================================

test('runtime: coiled on_exit fires explosive_release', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'coiled', mix: {}, gate: {},
        intents: [{ intent: 'coiled_blend', mode: 'continuous' }],
        on_exit: ['explosive_release'] },
    ],
    intents: {
      coiled_blend: [{ action: 'set_effect', args: { effect: 'lowpass', category: 'bass', param: 'frequency', min: 400, max: 4000 }, weight: 1 }],
      explosive_release: [
        { action: 'restore', args: { rampTime: 0.03 }, weight: 3 },
        { action: 'oneshot', args: { category: 'accent', volumeDb: -3 }, weight: 2 },
      ],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  engine.muteCategory('groove', 0.3);
  rt.update([{ id: 'coiled', value: 0.8, active: true }], ALL_CATS);
  rt.update([{ id: 'coiled', value: 0, active: false }], ALL_CATS);
  const hasRestore = engine.calls.some(c => c.fn === 'restoreCategory');
  const hasOneshot = engine.calls.some(c => c.fn === 'triggerOneshot');
  assert(hasRestore || hasOneshot, 'should fire restore or oneshot on coiled exit');
});

test('runtime: explosive edge fires slam action', () => {
  const engine = mockEngine();
  const score = {
    readings: [
      { id: 'explosive', mix: {}, gate: {},
        intents: [{ intent: 'explosive_slam', mode: 'edge' }] },
    ],
    intents: {
      explosive_slam: [
        { action: 'restore', args: { rampTime: 0.02 }, weight: 3 },
        { action: 'oneshot', args: { category: 'accent', volumeDb: -2 }, weight: 2 },
      ],
    },
    mappings: null,
  };
  const rt = new RalfRuntime(score, engine);
  rt.update([{ id: 'explosive', value: 0, active: false }], ALL_CATS);
  engine.muteCategory('groove', 0.3);
  rt.update([{ id: 'explosive', value: 0.9, active: true }], ALL_CATS);
  const hasAction = engine.calls.some(c => c.fn === 'restoreCategory' || c.fn === 'triggerOneshot');
  assert(hasAction, 'should fire restore or oneshot on explosive edge');
});

// ============================================================
// Summary
// ============================================================

console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
