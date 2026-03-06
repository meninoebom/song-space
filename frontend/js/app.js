// Song Space — zero-config onboarding: pick a song → see yourself → move to begin.

import { AudioEngine } from './audio-engine.js';
import { SongPicker } from './song-picker.js';
import { LoopGrid } from './loop-grid.js';
import { MovementDetector } from './movement.js';
import { ReadingsEngine } from './readings.js';
import { ArcEngine } from './arc.js';
import { RalfRuntime } from './runtime.js';
import { CATEGORIES } from './constants.js';
import { DEFAULT_SCORE } from './score.js';
import { PhaseIndicator } from './phase-indicator.js';
import { ReadingsMeter } from './readings-meter.js';
import { StageDirections } from './stage-directions.js';
import { createDetectionLoop } from './detection.js';
import * as webcam from './webcam.js';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? window.location.origin
  : 'https://song-blender-api-production.up.railway.app';

const DEBUG = new URLSearchParams(window.location.search).has('debug');

const engine = new AudioEngine();
const picker = new SongPicker(document.getElementById('song-picker'), API_URL);
const grid = new LoopGrid(document.getElementById('loop-grid'));
let runtime = null;
const detectors = [new MovementDetector(), new MovementDetector()];
const soloReadings = [new ReadingsEngine(DEFAULT_SCORE.readings.solo), new ReadingsEngine(DEFAULT_SCORE.readings.solo)];
const relReadingsEngine = new ReadingsEngine(DEFAULT_SCORE.readings.relational);

const status = document.getElementById('status');
const phaseEl = document.getElementById('phase-indicator');
const bodyCanvas = document.getElementById('body-canvas');
const meter = new ReadingsMeter(document.getElementById('readings-meter'));
const directions = new StageDirections(document.getElementById('stage-hint'));

let arc = null, arcFadeTimeout = null, playing = false, _loadGeneration = 0, indicator = null, _lastPct = -1;

const setStatus = msg => { if (status) status.textContent = msg; };

function updatePhase(phase) {
  if (!indicator) return;
  const pct = Math.round(phase.progress * 100);
  if (pct === _lastPct) return;
  _lastPct = pct;
  indicator.update(phase.index, phase.progress);
  directions.update(phase.progress);
}

const loops = createDetectionLoop({
  detectors, soloReadings, relReadingsEngine,
  getArc: () => arc, getRuntime: () => runtime,
  engine, meter, bodyCanvas,
  skeletonCanvas: document.getElementById('skeleton-canvas'),
  debugPanel: document.getElementById('debug-panel'),
  onPhaseUpdate: updatePhase,
  isPlaying: () => playing,
});

if (DEBUG) {
  document.body.classList.add('debug');
  document.getElementById('controls')?.style.setProperty('display', 'flex');
  document.getElementById('debug-panel')?.style.setProperty('display', 'block');
  document.getElementById('skeleton-canvas')?.style.setProperty('display', 'block');
}

picker.onSongSelected = async (metadata) => {
  if (playing) stopArc();
  const gen = ++_loadGeneration;
  setStatus(`Loading ${metadata.name}...`);
  engine.onLoadProgress = (loaded, total) => setStatus(`Loading loops: ${loaded}/${total}`);
  try { await engine.load(metadata, API_URL); }
  catch (err) { console.error('Failed to load song:', err); setStatus(`Failed to load ${metadata.name}: ${err.message}`); picker.clearState(); return; }
  if (gen !== _loadGeneration) return;
  if (DEBUG) { grid.render(metadata); grid.onTrackToggle = (f, m) => engine.setTrackMuted(f, m); }
  try { await webcam.start(); } catch (err) { console.error('Webcam init:', err); setStatus('Camera unavailable — music will play automatically'); }
  if (gen !== _loadGeneration) return;
  try { await startArc(); } catch (err) { console.error('Audio start failed:', err); setStatus('Audio failed — try clicking the page and selecting again'); picker.clearState(); return; }
  if (gen !== _loadGeneration) return;
  picker.setPlaying(metadata.slug);
  if (webcam.isRunning()) loops.detectLoop();
  else loops.fallbackLoop();
};

picker.onSongStopped = () => {
  if (playing) stopArc();
  ++_loadGeneration;
  setStatus('Select a song to begin');
};

async function startArc() {
  await Tone.start();
  engine.start();
  arc = new ArcEngine(DEFAULT_SCORE.arc);
  const flatReadings = [...DEFAULT_SCORE.readings.solo, ...DEFAULT_SCORE.readings.relational];
  runtime = new RalfRuntime({ readings: flatReadings, intents: DEFAULT_SCORE.intents, mappings: DEFAULT_SCORE.mappings }, engine);
  loops.resetTime();
  _lastPct = -1;
  arc.onPhaseChange = (phase) => {
    const section = arc.config.sectionMap[phase.id];
    if (section) {
      for (const cat of CATEGORIES) {
        const match = engine.getLoopsForCategory(cat).find(l => l.section === section && !l.active);
        if (match) engine.setActiveLoop(cat, match.index);
      }
    }
    setStatus(phase.id.toUpperCase());
    updatePhase(arc.getCurrentPhase());
    directions.show(arc.getCurrentPhase());
    if (DEBUG) grid.setAvailableCategories(phase.categories);
  };
  arc.onComplete = () => {
    setStatus('');
    if (indicator) indicator.update(DEFAULT_SCORE.arc.phases.length, 0);
    directions.complete();
    const fadeDur = engine.getBarDuration() * 8;
    engine.fadeOutAll(fadeDur);
    arcFadeTimeout = setTimeout(() => { arcFadeTimeout = null; stopArc(); picker.clearState(); setStatus('Select a song to go again'); }, fadeDur * 1000 + 500);
  };
  for (const cat of CATEGORIES) engine.setCategoryVolume(cat, cat === 'texture' ? -12 : -60);
  if (phaseEl) { indicator = new PhaseIndicator(phaseEl, DEFAULT_SCORE.arc.phases); indicator.update(0, 0); indicator.show(); }
  directions.show(arc.getCurrentPhase());
  if (DEBUG) grid.setAvailableCategories(['texture']);
  playing = true;
  setStatus('Move to begin');
}

function stopArc() {
  if (arcFadeTimeout) { clearTimeout(arcFadeTimeout); arcFadeTimeout = null; }
  engine.stop();
  arc = null;
  if (runtime) { runtime.reset(); runtime = null; }
  playing = false;
  if (indicator) { indicator.hide(); indicator = null; }
  directions.hide();
}

if (DEBUG) {
  document.getElementById('play-btn')?.addEventListener('click', async () => {
    if (playing) { stopArc(); setStatus('Stopped'); }
    else if (engine.loaded) await startArc();
  });
}

picker.load();
