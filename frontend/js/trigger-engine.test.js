/**
 * Tests for TriggerEngine — run with: node frontend/js/trigger-engine.test.js
 * Simple assert-based tests, no framework needed.
 */

import { TriggerEngine } from './trigger-engine.js';

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

// --- Helper: make a readings array with one reading active/inactive ---
function readings(id, active, value = 0.5) {
  return [{ id, value, active }];
}

const ALL_CATEGORIES = ['texture', 'bass', 'foundation', 'harmonic_bed', 'groove', 'hook', 'accent'];

// ============================================================
// Test 1: Rising edge detection
// ============================================================
test('fires on rising edge (enter)', () => {
  const engine = new TriggerEngine([
    { id: 'test', on: 'stillness', edge: 'enter', action: { mute: ['groove'] } }
  ]);

  // Frame 1: stillness inactive → no action
  let actions = engine.update(readings('stillness', false), ALL_CATEGORIES);
  assert(actions.length === 0, 'no action when reading inactive');

  // Frame 2: stillness becomes active → should fire
  actions = engine.update(readings('stillness', true), ALL_CATEGORIES);
  assert(actions.length === 1, 'fires on rising edge');
  assert(actions[0].triggerId === 'test', 'correct trigger id');
  assert(actions[0].action.mute[0] === 'groove', 'correct mute action');

  // Frame 3: stillness still active → should NOT fire again
  actions = engine.update(readings('stillness', true), ALL_CATEGORIES);
  assert(actions.length === 0, 'does not re-fire while sustained');
});

// ============================================================
// Test 2: Falling edge detection
// ============================================================
test('fires on falling edge (exit)', () => {
  const engine = new TriggerEngine([
    { id: 'test', on: 'stillness', edge: 'exit', action: { restore: true } }
  ]);

  // Activate stillness
  engine.update(readings('stillness', true), ALL_CATEGORIES);

  // Deactivate → should fire
  let actions = engine.update(readings('stillness', false), ALL_CATEGORIES);
  assert(actions.length === 1, 'fires on falling edge');
  assert(actions[0].action.restore === true, 'correct restore action');

  // Stay inactive → no re-fire
  actions = engine.update(readings('stillness', false), ALL_CATEGORIES);
  assert(actions.length === 0, 'does not re-fire while inactive');
});

// ============================================================
// Test 3: Sustain timer (after parameter)
// ============================================================
test('after parameter delays firing until sustained', () => {
  const engine = new TriggerEngine([
    { id: 'test', on: 'stillness', edge: 'enter', after: 2, action: { mute: ['groove'] } }
  ]);

  // Activate stillness, tick for 1s → not yet
  engine.update(readings('stillness', true), ALL_CATEGORIES, 1.0);
  let actions = engine.update(readings('stillness', true), ALL_CATEGORIES, 0.5);
  assert(actions.length === 0, 'does not fire before sustain threshold');

  // Tick to 2s total → should fire
  actions = engine.update(readings('stillness', true), ALL_CATEGORIES, 0.5);
  assert(actions.length === 1, 'fires after sustain threshold reached');

  // Should not fire again
  actions = engine.update(readings('stillness', true), ALL_CATEGORIES, 0.5);
  assert(actions.length === 0, 'does not re-fire after sustained trigger');
});

// ============================================================
// Test 4: Sustain timer resets on deactivation
// ============================================================
test('sustain timer resets when reading deactivates before threshold', () => {
  const engine = new TriggerEngine([
    { id: 'test', on: 'stillness', edge: 'enter', after: 2, action: { mute: ['groove'] } }
  ]);

  // Sustain 1.5s then deactivate
  engine.update(readings('stillness', true), ALL_CATEGORIES, 1.5);
  engine.update(readings('stillness', false), ALL_CATEGORIES, 0.1);

  // Re-activate, only 1s more → should NOT fire (timer was reset)
  engine.update(readings('stillness', true), ALL_CATEGORIES, 1.0);
  let actions = engine.update(readings('stillness', true), ALL_CATEGORIES, 0.5);
  assert(actions.length === 0, 'timer reset after deactivation — not yet at threshold');

  // 0.5s more → now at 2s from re-activation → should fire
  actions = engine.update(readings('stillness', true), ALL_CATEGORIES, 0.5);
  assert(actions.length === 1, 'fires after full sustain from re-activation');
});

// ============================================================
// Test 5: allowedCategories filtering
// ============================================================
test('respects allowedCategories — mute on disallowed category is no-op', () => {
  const engine = new TriggerEngine([
    { id: 'test', on: 'stillness', edge: 'enter', action: { mute: ['groove'] } }
  ]);

  // Only texture and bass allowed (EMERGE phase — groove not introduced yet)
  let actions = engine.update(readings('stillness', false), ['texture', 'bass']);
  actions = engine.update(readings('stillness', true), ['texture', 'bass']);
  assert(actions.length === 0, 'mute on groove is no-op when groove not in allowed categories');
});

// ============================================================
// Test 6: solo action only mutes allowed categories
// ============================================================
test('solo action only mutes categories that are in allowedCategories', () => {
  const engine = new TriggerEngine([
    { id: 'test', on: 'stillness', edge: 'enter', action: { solo: ['texture'] } }
  ]);

  const allowed = ['texture', 'bass', 'groove'];
  engine.update(readings('stillness', false), allowed);
  let actions = engine.update(readings('stillness', true), allowed);
  assert(actions.length === 1, 'solo trigger fires');
  // The action should list categories to mute = allowed minus solo targets
  assert(actions[0].action._muteTargets.includes('bass'), 'bass in mute targets');
  assert(actions[0].action._muteTargets.includes('groove'), 'groove in mute targets');
  assert(!actions[0].action._muteTargets.includes('texture'), 'texture NOT in mute targets (solo target)');
  assert(!actions[0].action._muteTargets.includes('hook'), 'hook NOT in mute targets (not in allowed)');
});

// ============================================================
// Test 7: Multiple triggers can fire independently
// ============================================================
test('multiple triggers evaluate independently', () => {
  const engine = new TriggerEngine([
    { id: 'drums-drop', on: 'stillness', edge: 'enter', after: 2, action: { mute: ['groove'] } },
    { id: 'energy-slam', on: 'stillness', edge: 'exit', action: { restore: true } },
  ]);

  // Activate stillness, sustain past 2s → drums-drop fires
  engine.update(readings('stillness', true), ALL_CATEGORIES, 1.0);
  engine.update(readings('stillness', true), ALL_CATEGORIES, 0.5);
  let actions = engine.update(readings('stillness', true), ALL_CATEGORIES, 0.6);
  assert(actions.length === 1, 'drums-drop fires at 2s');
  assert(actions[0].triggerId === 'drums-drop', 'correct trigger');

  // Deactivate → energy-slam fires
  actions = engine.update(readings('stillness', false), ALL_CATEGORIES, 0.1);
  assert(actions.length === 1, 'energy-slam fires on exit');
  assert(actions[0].triggerId === 'energy-slam', 'correct trigger');
});

// ============================================================
// Test 8: reading not present in readings array
// ============================================================
test('handles missing reading gracefully', () => {
  const engine = new TriggerEngine([
    { id: 'test', on: 'nonexistent', edge: 'enter', action: { mute: ['groove'] } }
  ]);

  let actions = engine.update(readings('stillness', true), ALL_CATEGORIES);
  assert(actions.length === 0, 'no crash and no action for missing reading');
});

// --- Summary ---
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
