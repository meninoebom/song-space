// Song Space — zero-config onboarding: pick a song → see yourself → move to begin.

import { AudioEngine } from './audio-engine.js';
import { SongPicker } from './song-picker.js';
import { LoopGrid } from './loop-grid.js';
import { MovementDetector, computeRelational } from './movement.js';
import { ReadingsEngine } from './readings.js';
import { applyMapping } from './mapping.js';
import { ArcEngine } from './arc.js';
import { TriggerEngine } from './trigger-engine.js';
import { applyTriggerActions } from './trigger-actions.js';
import { CATEGORIES } from './constants.js';
import { DEFAULT_SCORE } from './score.js';
import { drawSkeletons } from './skeleton.js';
import { updateDebug, bar } from './debug.js';
import { ReadingsMeter } from './readings-meter.js';
import * as webcam from './webcam.js';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? window.location.origin
  : 'https://song-blender-api-production.up.railway.app';

const DEBUG = new URLSearchParams(window.location.search).has('debug');

const engine = new AudioEngine();
const picker = new SongPicker(document.getElementById('song-picker'), API_URL);
const grid = new LoopGrid(document.getElementById('loop-grid'));
const triggerEngine = new TriggerEngine(DEFAULT_SCORE.triggers);
const detectors = [new MovementDetector(), new MovementDetector()];
const soloReadings = [new ReadingsEngine(DEFAULT_SCORE.readings.solo), new ReadingsEngine(DEFAULT_SCORE.readings.solo)];
const relReadingsEngine = new ReadingsEngine(DEFAULT_SCORE.readings.relational);

const status = document.getElementById('status');
const phaseEl = document.getElementById('phase-indicator');
const debugPanel = document.getElementById('debug-panel');
const skeletonCanvas = document.getElementById('skeleton-canvas');
const bodyCanvas = document.getElementById('body-canvas');
const meter = new ReadingsMeter(document.getElementById('readings-meter'));

let arc = null;
let arcFadeTimeout = null;
let lastFrameTime = null;
let playing = false;
let _loadGeneration = 0;

const setStatus = msg => { if (status) status.textContent = msg; };

if (DEBUG) {
  document.body.classList.add('debug');
  document.getElementById('controls')?.style.setProperty('display', 'flex');
  if (debugPanel) debugPanel.style.display = 'block';
  if (skeletonCanvas) skeletonCanvas.style.display = 'block';
}

picker.onSongSelected = async (metadata) => {
  if (playing) stopArc();
  const gen = ++_loadGeneration;
  setStatus(`Loading ${metadata.name}...`);
  engine.onLoadProgress = (loaded, total) => setStatus(`Loading loops: ${loaded}/${total}`);
  try { await engine.load(metadata, API_URL); }
  catch (err) { console.error('Failed to load song:', err); setStatus(`Failed to load ${metadata.name}: ${err.message}`); return; }
  if (gen !== _loadGeneration) return;
  if (DEBUG) { grid.render(metadata); grid.onTrackToggle = (f, m) => engine.setTrackMuted(f, m); }
  try { await webcam.start(); } catch (err) { console.error('Webcam init:', err); }
  if (gen !== _loadGeneration) return;
  try { await startArc(); } catch (err) { console.error('Audio start failed:', err); setStatus('Audio failed — try clicking the page and selecting again'); return; }
  if (gen !== _loadGeneration) { stopArc(); return; }
  if (webcam.isRunning()) detectLoop();
  else fallbackLoop();
};

picker.onSongStopped = () => {
  _loadGeneration++;
  if (playing) stopArc();
  setStatus('Click a song to start');
};

async function startArc() {
  await Tone.start();
  engine.start();
  arc = new ArcEngine(DEFAULT_SCORE.arc);
  triggerEngine.reset();
  lastFrameTime = null;
  _lastPct = -1;
  arc.onPhaseChange = handlePhaseChange;
  arc.onComplete = handleArcComplete;
  for (const cat of CATEGORIES) engine.setCategoryVolume(cat, cat === 'texture' ? -12 : -60);
  if (phaseEl) { phaseEl.style.display = 'block'; phaseEl.textContent = 'AWAIT — move to begin'; }
  if (DEBUG) grid.setAvailableCategories(['texture']);
  playing = true;
  setStatus('Move to begin');
}

function stopArc() {
  if (arcFadeTimeout) { clearTimeout(arcFadeTimeout); arcFadeTimeout = null; }
  engine.stop();
  arc = null;
  triggerEngine.reset();
  playing = false;
  if (phaseEl) phaseEl.style.display = 'none';
}

function fallbackLoop() {
  if (!playing || !arc) return;
  const ts = performance.now() / 1000;
  const dt = lastFrameTime ? ts - lastFrameTime : 1 / 30;
  lastFrameTime = ts;
  arc.update(dt, 0);
  const phase = arc.getCurrentPhase();
  if (phase) updatePhase(phase);
  requestAnimationFrame(fallbackLoop);
}

function detectLoop() {
  const results = webcam.detect();
  const ts = performance.now() / 1000;
  const dt = lastFrameTime ? ts - lastFrameTime : 1 / 30;
  lastFrameTime = ts;

  if (results) {
    const bodyCount = results.landmarks ? results.landmarks.length : 0;

    if (bodyCount > 0 && playing && arc) {
      const quals = [], reads = [];
      for (let i = 0; i < bodyCount && i < 2; i++) {
        quals.push(detectors[i].update(results.landmarks[i], ts));
        reads.push(soloReadings[i].update(quals[i]));
      }
      let relReadings = [], relQuals = null;
      if (bodyCount >= 2) {
        relQuals = computeRelational(quals[0], quals[1], detectors[0], detectors[1]);
        relReadings = relReadingsEngine.update(relQuals);
      }
      const finalReadings = [...averageReadings(reads), ...relReadings];
      const avgVel = quals.reduce((s, q) => s + (q.velocity || 0), 0) / quals.length;
      arc.update(dt, avgVel);
      const phase = arc.getCurrentPhase();
      if (phase) {
        applyMapping(finalReadings, engine, phase.categories, DEFAULT_SCORE.mappings);
        const actions = triggerEngine.update(finalReadings, phase.categories, dt);
        if (actions.length > 0) applyTriggerActions(actions, engine, phase.categories);
        updatePhase(phase);
      }
      drawSkeletons(bodyCanvas, results.landmarks, bodyCount, finalReadings);
      meter.render(finalReadings);
      if (DEBUG) {
        drawSkeletons(skeletonCanvas, results.landmarks, bodyCount, finalReadings);
        updateDebug(debugPanel, quals, finalReadings, relQuals);
      }
    } else if (playing && arc) {
      arc.update(dt, 0);
      const phase = arc.getCurrentPhase();
      if (phase) updatePhase(phase);
    }
  }

  if (webcam.isRunning()) requestAnimationFrame(detectLoop);
}

function averageReadings(arrays) {
  if (arrays.length === 1) return arrays[0];
  const map = {};
  for (const arr of arrays) for (const r of arr) {
    if (!map[r.id]) map[r.id] = { total: 0, active: false, n: 0 };
    map[r.id].total += r.value; map[r.id].active ||= r.active; map[r.id].n++;
  }
  return Object.entries(map).map(([id, { total, active, n }]) => ({ id, value: total / n, active }));
}

function handlePhaseChange(phase) {
  const section = arc.config.sectionMap[phase.id];
  if (section) {
    for (const cat of CATEGORIES) {
      const match = engine.getLoopsForCategory(cat).find(l => l.section === section && !l.active);
      if (match) engine.setActiveLoop(cat, match.index);
    }
  }
  setStatus(phase.id.toUpperCase());
  const current = arc.getCurrentPhase();
  if (phaseEl) updatePhase(current);
  if (DEBUG) grid.setAvailableCategories(phase.categories);
}

function handleArcComplete() {
  setStatus('');
  if (phaseEl) phaseEl.textContent = 'COMPLETE';
  const fadeDur = engine.getBarDuration() * 8;
  engine.fadeOutAll(fadeDur);
  arcFadeTimeout = setTimeout(() => { arcFadeTimeout = null; stopArc(); picker.clearActive(); setStatus('Select a song to go again'); }, fadeDur * 1000 + 500);
}

let _lastPct = -1;
function updatePhase(phase) {
  if (!phaseEl) return;
  const pct = Math.round(phase.progress * 100);
  if (pct === _lastPct) return;
  _lastPct = pct;
  phaseEl.textContent = `${phase.id.toUpperCase()} ${bar(phase.progress, 20)} ${pct}%  (${phase.index + 1}/${phase.totalPhases})`;
}

if (DEBUG) {
  document.getElementById('play-btn')?.addEventListener('click', async () => {
    if (playing) { stopArc(); setStatus('Stopped'); }
    else if (engine.loaded) await startArc();
  });
}

picker.load();
